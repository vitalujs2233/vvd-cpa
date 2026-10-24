"""Opt-in read-only acceptance probe, no secrets or supplier costs in logs."""
import logging
import os
import tempfile
import time
from .client import Client, ProviderError, settings
from .numbers import Numbers
from .proxy import Proxy
from .purchase import quote

log = logging.getLogger(__name__)

def run():
    # The Render process can run several workers; only one probes each deploy.
    try:
        fd = os.open(os.path.join(tempfile.gettempdir(), 'cyberyozh-catalog-probe-v3'), os.O_CREAT | os.O_EXCL | os.O_WRONLY, 0o600)
        os.close(fd)
    except FileExistsError:
        return
    for category in ('numbers', 'proxy'):
        started = time.monotonic()
        try:
            a = Numbers(Client()) if category == 'numbers' else Proxy(Client())
            offers = a.search('virtual','MIN_15','49','apd') if category == 'numbers' else a.catalog()
            sample = next((r for r in offers if r['available'] and (category == 'numbers' or (r['category']=='lte' and r['country'].lower()=='us' and r.get('days')==1))), None)
            log.warning('CyberYozh acceptance category=%s offers=%s available_sample=%s seconds=%.2f purchases=%s', category, len(offers), bool(sample), time.monotonic()-started, settings()['purchases_enabled'])
            if sample:
                _, q, total, _ = quote(a, category, {**sample, 'quantity':1})
                log.warning('CyberYozh acceptance quote_ok category=%s quantity=%s retail=%s seconds=%.2f',category,q,total,time.monotonic()-started)
        except Exception as exc:
            log.warning('CyberYozh acceptance category=%s error=%s',category,exc.code if isinstance(exc,ProviderError) else type(exc).__name__)
