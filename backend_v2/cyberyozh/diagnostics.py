"""Opt-in, read-only supplier contract probe. Never logs key, costs or owned data."""
import logging
from collections import Counter
from .client import Client, ProviderError
from .proxy import Proxy
from .purchase import quote

log = logging.getLogger(__name__)

def run():
    try:
        data = Client().request('GET', 'numbers/search/', {'provider':'virtual','period':'MIN_15','country':'49','service':'aax','page_size':100})
        rows = data.get('results', []) if isinstance(data, dict) else data
        log.warning('CyberYozh probe numbers count=%s rows=%s next=%s sample=%s',
                    data.get('count') if isinstance(data,dict) else len(rows), len(rows), bool(data.get('next')) if isinstance(data,dict) else False,
                    [{k:r.get(k) for k in ('id','code','slug','country_code','provider','period','is_active','count')} for r in rows[:3]])
        log.warning('CyberYozh probe numbers matches=%s price_present=%s',
                    sum(str(r.get('country_code'))=='49' and r.get('code')=='aax' for r in rows),
                    sum(r.get('cost') is not None for r in rows))
    except Exception as exc:
        log.warning('CyberYozh probe numbers error=%s', exc.code if isinstance(exc,ProviderError) else type(exc).__name__)
    try:
        a=Proxy(Client()); offers=a.catalog()
        keys=Counter((r['id'],r['period_months']) for r in offers)
        sample=next((r for r in offers if r['category']=='lte' and r['country'].lower()=='us' and r.get('days')==1),None)
        log.warning('CyberYozh probe proxy offers=%s duplicate_keys=%s sample=%s',len(offers),sum(n>1 for n in keys.values()),
                    {k:sample.get(k) for k in ('id','period_months','days','available','max_quantity')} if sample else None)
        if sample:
            matches=[r for r in offers if r['id']==sample['id'] and r['period_months']==sample['period_months']]
            log.warning('CyberYozh probe proxy matches=%s identical=%s',len(matches),all(r==sample for r in matches))
            _,q,total,_=quote(a,'proxy',{**sample,'quantity':1})
            log.warning('CyberYozh probe proxy quote_ok quantity=%s retail=%s',q,total)
    except Exception as exc:
        log.warning('CyberYozh probe proxy error=%s',exc.code if isinstance(exc,ProviderError) else type(exc).__name__)
