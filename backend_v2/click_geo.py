"""Country lookup after redirect; unknown stays unknown on lookup failure."""
import ipaddress
import json
import logging
import re
from urllib.request import urlopen
from sqlalchemy import text

log = logging.getLogger(__name__)


def public_client_ip(request):
    # Uvicorn resolves trusted proxy headers into request.client. Do not trust
    # arbitrary country or forwarded headers supplied by a visitor here.
    try:
        address = ipaddress.ip_address(request.client.host)
        return str(address) if address.is_global else None
    except (ValueError, AttributeError):
        return None


def lookup_country(ip):
    try:
        address = ipaddress.ip_address(ip)
        if not address.is_global:
            return None
        with urlopen('https://ipwho.is/' + str(address) + '?fields=success,country_code,country', timeout=3) as response:
            data = json.loads(response.read(16384))
        code = data.get('country_code')
        if data.get('success') is not True or not isinstance(code, str) or not re.fullmatch('[A-Z]{2}', code) or code in ('XX', 'ZZ'):
            return None
        name = data.get('country')
        return code, name[:100] if isinstance(name, str) and name else code
    except Exception:
        log.warning('click_geo_lookup_failed')
        return None


def enrich_click_country(engine, click_id, ip):
    country = lookup_country(ip)
    if country is None:
        return
    try:
        with engine.begin() as conn:
            conn.execute(text('''UPDATE public.clicks SET country_code=:code,country_name=:name
                WHERE click_id=:click AND ip_address=:ip AND country_code IS NULL'''),
                {'code':country[0], 'name':country[1], 'click':click_id, 'ip':ip})
    except Exception:
        log.warning('click_geo_save_failed')
