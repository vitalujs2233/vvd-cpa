"""Inventory-difference triage, never proof of customer ownership.

Support recommends before/after snapshots. External purchases cannot be excluded by
this API, even for an exact count/country/time match. Candidate IDs stay internal;
this function must never be used to authorize disclosure of connection credentials.
"""
from datetime import datetime, timezone


def timestamp(value):
    if isinstance(value, str):
        try: value = datetime.fromisoformat(value.replace('Z', '+00:00'))
        except ValueError: return None
    if not isinstance(value, datetime) or value.tzinfo is None: return None
    return value.astimezone(timezone.utc)


def assess_inventory(before, after, *, count, country, submitted_at, observed_at, assigned_ids=(), lane_busy=False):
    result = {'state': 'manual_review', 'reason': '', 'candidate_ids': [], 'can_deliver': False}
    def stop(reason):
        result['reason'] = reason
        return result
    if lane_busy: return stop('another_unresolved_order')
    start, end = timestamp(submitted_at), timestamp(observed_at)
    if start is None or end is None or end < start: return stop('untrusted_time_window')
    if not isinstance(before, (list, set)) or not isinstance(after, list) or type(count) is not int or count < 1:
        return stop('invalid_snapshot')
    if any(not isinstance(x, (str, int)) or isinstance(x, bool) or not str(x) for x in before):
        return stop('invalid_snapshot')
    previous = {str(x) for x in before}
    current = {}
    for item in after:
        if not isinstance(item, dict): return stop('invalid_inventory')
        ident = item.get('id')
        if not isinstance(ident, (str, int)) or isinstance(ident, bool) or not str(ident) or str(ident) in current:
            return stop('invalid_inventory')
        current[str(ident)] = item
    if not previous.issubset(current): return stop('inventory_changed_externally')
    new = set(current) - previous
    if new & {str(x) for x in assigned_ids}: return stop('already_assigned')
    if not new:
        result['state'] = 'waiting'
        return stop('delivery_delayed')
    if len(new) > count: return stop('unexpected_extra_proxies')
    for ident in new:
        item = current[ident]
        if item.get('country') != country: return stop('country_mismatch')
        created = timestamp(item.get('dateStart'))
        if created is None or not start <= created <= end: return stop('start_time_mismatch')
    result['candidate_ids'] = sorted(new)
    if len(new) < count:
        result['state'] = 'partial'
        return stop('partial_candidates_unverified')
    return stop('external_purchase_cannot_be_excluded')
