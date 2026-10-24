"""Official v1 transport. Mutations are NEVER retried (provider is not idempotent)."""
import os
import time
import math
from email.utils import parsedate_to_datetime
from datetime import datetime, timezone
from decimal import Decimal, ROUND_HALF_UP, InvalidOperation
from urllib.parse import urlsplit, urljoin, parse_qsl
from hashlib import sha256
import json
import logging
from .catalog_cache import catalog_cache
import httpx

READY_MESSAGE = 'Сервис готовится к подключению'

class ProviderError(Exception):
    def __init__(self, code='provider_unavailable', definite_rejection=False):
        super().__init__(code)  # Never retain response bodies, URLs or credentials.
        self.code, self.definite_rejection = code, definite_rejection


def settings():
    mode = os.getenv('CYBERYOZH_MODE', 'preparation')
    if mode == 'mock' and os.getenv('APP_ENV') not in ('development', 'test'):
        mode = 'preparation'
    key = os.getenv('CYBERYOZH_API_KEY', '')
    return {'mode': mode, 'ready': mode == 'live' and bool(key), 'mock': mode == 'mock',
            'purchases_enabled': False}  # Release gate: enable only after live acceptance review.


def money(value):
    try:
        n = Decimal(str(value))
        if not n.is_finite() or n < 0 or n > 1000000:
            raise ValueError()
        return n
    except (ValueError, InvalidOperation):
        raise ProviderError('invalid_price') from None


def retail(cost, category):
    # Missing/invalid owner configuration fails closed, never sells at an accidental zero markup.
    names = {'numbers': 'NUMBERS', 'lte': 'MOBILE', 'residential_static': 'ISP'}
    try:
        try:
            pct = money(os.environ['CYBERYOZH_MARKUP_' + names[category] + '_PERCENT'])
        except ProviderError:
            raise ProviderError('invalid_markup') from None
        if pct > 1000:
            raise ProviderError('invalid_markup')
    except KeyError:
        raise ProviderError('markup_not_configured') from None
    return (money(cost) * (1 + pct / 100)).quantize(Decimal('.01'), rounding=ROUND_HALF_UP)


class Client:
    def __init__(self, transport=None):
        base = os.getenv('CYBERYOZH_API_BASE', 'https://app.cyberyozh.com/api/v1/')
        # A typo or pagination URL must not send the key to an arbitrary host.
        if base.rstrip('/') != 'https://app.cyberyozh.com/api/v1':
            raise ProviderError('invalid_base')
        self.base = base.rstrip('/') + '/'
        self.key = os.getenv('CYBERYOZH_API_KEY', '')
        self.transport = transport
        self.deadline = time.monotonic() + 22
        try:
            timeout = float(os.getenv('CYBERYOZH_TIMEOUT_SECONDS', '15'))
            if not math.isfinite(timeout):
                raise ValueError()
            self.timeout = min(30, max(1, timeout))
            self.retries = min(2, max(0, int(os.getenv('CYBERYOZH_READ_RETRIES', '1'))))
        except ValueError:
            raise ProviderError('invalid_config') from None

    def request(self, method, path, params=None, body=None):
        if not self.key:
            raise ProviderError('not_configured')
        if path.startswith('/') or '..' in path or urlsplit(path).scheme:
            raise ProviderError('invalid_path')
        attempts = self.retries + 1 if method == 'GET' else 1
        for attempt in range(attempts):
            remaining = self.deadline - time.monotonic()
            if remaining <= 0:
                raise ProviderError('provider_timeout')
            try:
                with httpx.Client(timeout=min(self.timeout, remaining / 4), transport=self.transport, follow_redirects=False) as client:
                    r = client.request(method, self.base + path, params=params, json=body,
                                       headers={'X-Api-Key': self.key, 'Accept': 'application/json'})
                if r.status_code in (429, 502, 503, 504) and attempt + 1 < attempts:
                    delay = .25 * (attempt + 1)
                    retry_after = r.headers.get('Retry-After')
                    if retry_after:
                        try:
                            delay = float(retry_after)
                        except ValueError:
                            try:
                                delay = (parsedate_to_datetime(retry_after) - datetime.now(timezone.utc)).total_seconds()
                            except (ValueError, TypeError, OverflowError):
                                raise ProviderError('provider_http_429') from None
                        # Do not retry earlier than the provider allows or hold a request indefinitely.
                        if not math.isfinite(delay) or delay > 5 or delay >= self.deadline - time.monotonic():
                            raise ProviderError('provider_http_429')
                    time.sleep(max(0, delay))
                    continue
                if not 200 <= r.status_code < 300:
                    # Only documented pre-purchase validation/auth/balance failures are definite.
                    raise ProviderError('provider_http_' + str(r.status_code), r.status_code in (400, 401, 402, 403, 429))
                try:
                    return r.json(parse_float=Decimal)
                except ValueError:
                    raise ProviderError('invalid_response') from None
            except httpx.RequestError:
                if attempt + 1 == attempts:
                    raise ProviderError('provider_timeout') from None
        raise ProviderError()

    def rows(self, path, params=None):
        ttl = {'numbers/countries/': 300, 'numbers/services/': 300,
               'numbers/search/': 75, 'proxies/shop/': 75}.get(path)
        if ttl and self.transport is None:
            key = (sha256(self.key.encode()).digest(), self.base, path,
                   tuple(sorted((str(k), str(v)) for k, v in (params or {}).items())))
            return catalog_cache.get(key, lambda: self._rows(path, params), ttl,
                                     self.deadline - time.monotonic())
        return self._rows(path, params)

    def _rows(self, path, params=None):
        result, seen_queries, seen_pages = [], set(), set()
        original = dict(params or {})
        query = {**original, 'page_size': 100}
        expected = urlsplit(self.base + path)
        for _ in range(100):
            signature = tuple(sorted((str(k), str(v)) for k, v in query.items()))
            if signature in seen_queries:
                raise ProviderError('pagination_loop')
            seen_queries.add(signature)
            data = self.request('GET', path, query)
            if isinstance(data, list):
                return data
            if not isinstance(data, dict) or not isinstance(data.get('results'), list):
                raise ProviderError('invalid_response')
            rows = data['results']
            if path == 'numbers/search/' and 'country_code' in original and any(
                    str(row.get('country_code')) != str(original['country_code']) for row in rows):
                raise ProviderError('unsupported_catalog_filter')
            fingerprint = sha256(json.dumps(rows, sort_keys=True, default=str).encode()).digest()
            if fingerprint in seen_pages and rows:
                raise ProviderError('pagination_loop')
            seen_pages.add(fingerprint)
            result.extend(rows)
            next_page = data.get('next')
            if not next_page:
                return result
            if not isinstance(next_page, str) or not rows:
                raise ProviderError('invalid_response')
            target = urlsplit(urljoin(self.base + path, next_page))
            # Follow the provider's pagination parameters (offset/cursor/page), never its host.
            if (target.scheme, target.netloc, target.path) != (expected.scheme, expected.netloc, expected.path) or target.fragment:
                raise ProviderError('invalid_pagination')
            query = dict(parse_qsl(target.query, keep_blank_values=True))
            if len(seen_queries) == 1:
                logging.getLogger(__name__).info('CyberYozh pagination path=%s keys=%s', path, ','.join(sorted(k for k in query if k in ('page', 'offset', 'limit', 'cursor', 'page_size'))))
            if not query or any(k in query and str(query[k]) != str(v) for k, v in original.items()):
                raise ProviderError('invalid_pagination')
            query.update(original)
        raise ProviderError('catalog_too_large')
