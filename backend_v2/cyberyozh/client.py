"""Official v1 transport. Mutations are NEVER retried (provider is not idempotent)."""
import os
import time
from decimal import Decimal, ROUND_HALF_UP, InvalidOperation
from urllib.parse import urlsplit
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
        pct = money(os.environ['CYBERYOZH_MARKUP_' + names[category] + '_PERCENT'])
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
        self.timeout = min(30, max(1, float(os.getenv('CYBERYOZH_TIMEOUT_SECONDS', '15'))))
        self.retries = min(2, max(0, int(os.getenv('CYBERYOZH_READ_RETRIES', '1'))))

    def request(self, method, path, params=None, body=None):
        if not self.key:
            raise ProviderError('not_configured')
        if path.startswith('/') or '..' in path or urlsplit(path).scheme:
            raise ProviderError('invalid_path')
        attempts = self.retries + 1 if method == 'GET' else 1
        for attempt in range(attempts):
            try:
                with httpx.Client(timeout=self.timeout, transport=self.transport, follow_redirects=False) as client:
                    r = client.request(method, self.base + path, params=params, json=body,
                                       headers={'X-Api-Key': self.key, 'Accept': 'application/json'})
                if r.status_code in (429, 502, 503, 504) and attempt + 1 < attempts:
                    time.sleep(.25 * (attempt + 1))
                    continue
                if not 200 <= r.status_code < 300:
                    # Only documented pre-purchase validation/auth/balance failures are definite.
                    raise ProviderError('provider_http_' + str(r.status_code), r.status_code in (400, 401, 402, 403, 429))
                try:
                    return r.json()
                except ValueError:
                    raise ProviderError('invalid_response') from None
            except httpx.RequestError:
                if attempt + 1 == attempts:
                    raise ProviderError('provider_timeout') from None
        raise ProviderError()

    def rows(self, path, params=None):
        result = []
        # Paginate by local page number; NEVER follow an upstream URL with the API key.
        for page in range(1, 101):
            data = self.request('GET', path, {**(params or {}), 'page': page, 'page_size': 100})
            if isinstance(data, list):
                return data
            if not isinstance(data, dict) or not isinstance(data.get('results'), list):
                raise ProviderError('invalid_response')
            result.extend(data['results'])
            if not data.get('next'):
                return result
        raise ProviderError('catalog_too_large')
