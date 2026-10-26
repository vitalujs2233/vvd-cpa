"""ID-based inventory checks. Exclusivity must be attested; never inferred."""
from datetime import datetime, timezone, timedelta

REVIEW_WAIT_SECONDS = 15 * 60  # Operational review deadline, not a supplier SLA.

# A later clean snapshot cannot disprove an already observed conflicting inventory.
CONFLICT_REASONS = frozenset({
    'inventory_changed_externally', 'already_assigned', 'unexpected_extra_proxies',
    'country_mismatch', 'start_time_mismatch', 'rental_duration_mismatch',
    'mobile_operator_mismatch', 'rotation_time_mismatch', 'invalid_inventory',
    'candidate_disappeared',
})


def retain_evidence(report, previous=None):
    """Merge credential-free observations; never clear a historical conflict."""
    previous = previous or {}
    result = dict(report)
    seen = set(previous.get('observed_candidate_ids', previous.get('candidate_ids', [])))
    current = set(report.get('candidate_ids', []))
    conflicts = set(previous.get('conflict_reasons', []))
    for reason in (previous.get('reason'), report.get('reason')):
        if reason in CONFLICT_REASONS:
            conflicts.add(reason)
    # Unavailable/invalid snapshots contain no reliable absence evidence.
    if report.get('checks', {}).get('baseline_present') and seen - current:
        conflicts.add('candidate_disappeared')
    result['observed_candidate_ids'] = sorted(seen | current)
    result['conflict_reasons'] = sorted(conflicts)
    if conflicts:
        result.update(state='manual_review', can_deliver=False)
        if report.get('reason') not in CONFLICT_REASONS:
            result['reason'] = 'historical_inventory_conflict'
    return result


def timestamp(value):
    if isinstance(value, str):
        try: value = datetime.fromisoformat(value.replace('Z', '+00:00'))
        except ValueError: return None
    if not isinstance(value, datetime) or value.tzinfo is None: return None
    return value.astimezone(timezone.utc)


def assess_inventory(before, after, *, count, country, submitted_at, observed_at,
                     assigned_ids=(), lane_busy=False, days=None, proxy_type=None,
                     mobile_operator=None, rotation_time=None, exclusive_account=False,
                     manual_review=False):
    result = {'state': 'manual_review', 'reason': '', 'candidate_ids': [],
              'can_deliver': False, 'checks': {}}
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
    if len(previous) != len(before): return stop('invalid_snapshot')
    current = {}
    for item in after:
        if not isinstance(item, dict): return stop('invalid_inventory')
        ident = item.get('id')
        if not isinstance(ident, (str, int)) or isinstance(ident, bool) or not str(ident) or str(ident) in current:
            return stop('invalid_inventory')
        current[str(ident)] = item
    new = set(current) - previous
    result['candidate_ids'] = sorted(new)
    if not previous.issubset(current): return stop('inventory_changed_externally')
    result['checks']['baseline_present'] = True
    if new & {str(x) for x in assigned_ids}: return stop('already_assigned')
    result['checks']['unassigned'] = True
    # A timeout never authorizes release or a new paid order. Manual review can
    # explicitly recheck a later complete delivery; the lane stays held meanwhile.
    if (end-start).total_seconds() >= REVIEW_WAIT_SECONDS and not manual_review:
        return stop('delivery_timeout')
    if not new:
        result['state'] = 'waiting'
        return stop('delivery_delayed')
    if len(new) > count: return stop('unexpected_extra_proxies')
    for ident in new:
        item = current[ident]
        if item.get('country') != country: return stop('country_mismatch')
        created = timestamp(item.get('dateStart'))
        if created is None or not start <= created <= end: return stop('start_time_mismatch')
        if days is not None:
            expires = timestamp(item.get('dateEnd'))
            if type(days) is not int or days < 1 or expires is None or expires-created != timedelta(days=days):
                return stop('rental_duration_mismatch')
        if proxy_type == 'mobile':
            if not mobile_operator or item.get('mobileOperator') != mobile_operator:
                return stop('mobile_operator_mismatch')
            if type(rotation_time) is not int or type(item.get('rotationTime')) is not int or item['rotationTime'] != rotation_time:
                return stop('rotation_time_mismatch')
    result['checks'].update(country=True, start_time=True, rental_duration=days is not None,
                            mobile_parameters=proxy_type != 'mobile' or bool(mobile_operator))
    if len(new) < count:
        result['state'] = 'partial'
        return stop('partial_candidates_unverified')
    result['checks']['exact_count'] = True
    if not exclusive_account: return stop('external_purchase_cannot_be_excluded')
    if days is None or proxy_type not in ('ipv4','isp','mobile'): return stop('missing_order_parameters')
    result.update(state='verified', reason='exclusive_inventory_match', can_deliver=True)
    return result
