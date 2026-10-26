"""Credential-free schema diagnostics. Only the documented read endpoint is used."""
from collections import Counter
from datetime import datetime, timezone
from fastapi import HTTPException
from proxy_inventory_review import timestamp

FIELDS = ('id', 'dateStart', 'dateEnd', 'mobileOperator', 'rotationTime')


def summarize_inventory(raw, kind):
    items = raw.get('proxies') if isinstance(raw, dict) else None
    report = {'proxy_type': kind, 'observed_at': datetime.now(timezone.utc).isoformat(),
              'success': isinstance(raw, dict) and raw.get('success') is True}
    if not report['success'] or not isinstance(items, list):
        return dict(report, schema='invalid', count=None)
    report.update(schema='list', count=len(items), formats_observed=bool(items))
    fields = {name: Counter() for name in FIELDS}
    invalid_ids = 0; ids = []; dates = Counter(); durations = Counter()
    for item in items:
        if not isinstance(item, dict):
            invalid_ids += 1
            continue
        for name in FIELDS:
            value = item.get(name)
            fields[name]['missing' if name not in item else type(value).__name__] += 1
        ident = item.get('id')
        if not isinstance(ident, (str, int)) or isinstance(ident, bool) or not str(ident).strip():
            invalid_ids += 1
        else:
            ids.append(str(ident))
        start, end = timestamp(item.get('dateStart')), timestamp(item.get('dateEnd'))
        for name, parsed in [('dateStart', start), ('dateEnd', end)]:
            dates[name + ('_accepted' if parsed else '_rejected')] += 1
        if start and end:
            seconds = (end-start).total_seconds()
            durations['positive_whole_days' if seconds > 0 and seconds % 86400 == 0 else 'other'] += 1
    report.update(fields={k: dict(v) for k,v in fields.items()}, dates=dict(dates),
                  durations=dict(durations), invalid_ids=invalid_ids,
                  duplicate_ids=len(ids)-len(set(ids)))
    return report


async def probe_inventory(provider):
    reports=[]
    for kind in ('ipv4', 'isp', 'mobile'):
        try:
            reports.append(summarize_inventory(await provider('get/proxies', {'proxyType': kind}), kind))
        except HTTPException as exc:
            reports.append({'proxy_type':kind, 'success':False, 'http_status':exc.status_code})
        except Exception:
            reports.append({'proxy_type':kind, 'success':False, 'error':'unavailable'})
    return reports
