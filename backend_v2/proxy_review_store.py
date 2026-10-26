"""Durable delivery review and audited manual assignment; never moves money."""
import json
from datetime import datetime, timezone
from sqlalchemy import text
from fastapi import HTTPException
from proxy_inventory_review import assess_inventory, retain_evidence
from proxy_delivery import connection_data


def review(conn, order, items, *, now=None, exclusive=False, manual=False):
    selection=order['selection']
    others=conn.execute(text('''SELECT status,delivered_proxy_ids, EXISTS(SELECT 1 FROM tool_proxy_reviews r
            WHERE r.order_id=tool_proxy_order_intents.id AND r.state='approved') AS delivery_approved FROM tool_proxy_order_intents
        WHERE proxy_type=:kind AND id<>:id'''),dict(kind=order['proxy_type'],id=order['id'])).mappings().all()
    claims=conn.execute(text('''SELECT proxy_id FROM tool_proxy_assignments
        WHERE proxy_type=:kind AND order_id<>:id'''),dict(kind=order['proxy_type'],id=order['id'])).scalars().all()
    assigned=set(claims) | {str(i) for row in others for i in (row['delivered_proxy_ids'] or [])}
    report = assess_inventory(order['proxy_ids_before'], items,
        count=selection['count'], country=selection['country'], days=selection['days'],
        proxy_type=order['proxy_type'], mobile_operator=selection.get('mobile_operator'),
        rotation_time=selection.get('rotation_time'), submitted_at=order['supplier_submitted_at'],
        observed_at=now or datetime.now(timezone.utc), assigned_ids=assigned,
        lane_busy=any(row['status'] in ('reserved','submitting','uncertain') or (row['status']=='fulfilled' and not row['delivery_approved']) for row in others),
        exclusive_account=exclusive, manual_review=manual)
    previous=conn.execute(text('SELECT report FROM tool_proxy_reviews WHERE order_id=:id'),dict(id=order['id'])).scalar()
    return retain_evidence(report, previous)


def audit(conn, order_id, actor, action, report):
    # Reports contain IDs and check outcomes, never connection credentials or provider payloads.
    conn.execute(text('''INSERT INTO tool_proxy_review_audit(order_id,actor_id,action,report)
        VALUES(:id,:actor,:action,CAST(:report AS jsonb))'''),
        dict(id=order_id,actor=actor,action=action,report=json.dumps(report)))


def save_review(conn, order, report):
    previous=conn.execute(text('SELECT state,report FROM tool_proxy_reviews WHERE order_id=:id FOR UPDATE'),dict(id=order['id'])).mappings().first()
    if previous and previous['state']=='approved':return previous['report']
    report=retain_evidence(report, previous['report'] if previous else None)
    # Once escalated, ordinary polling cannot silently restore automatic eligibility.
    if previous and previous['state']=='manual_review':
        report=dict(report,state='manual_review',can_deliver=False)
    conn.execute(text('''INSERT INTO tool_proxy_reviews(order_id,state,report) VALUES(:id,:state,CAST(:report AS jsonb))
        ON CONFLICT(order_id) DO UPDATE SET state=EXCLUDED.state,report=EXCLUDED.report,updated_at=now()'''),
        dict(id=order['id'],state=report['state'],report=json.dumps(report)))
    if not previous or previous['report']!=report:
        audit(conn,order['id'],None,'review_observed',report)
    return report


def approved_ids(conn, order_id):
    return set(conn.execute(text('''SELECT a.proxy_id FROM tool_proxy_assignments a
        JOIN tool_proxy_reviews r ON r.order_id=a.order_id AND r.state='approved'
        WHERE a.order_id=:id'''),dict(id=order_id)).scalars().all())


def assign(conn, order, items, report, actor, evidence_ref):
    if order['status']!='fulfilled' or not order['provider_order_id']:
        raise HTTPException(409,'Сначала подтвердите результат оплаты и номер заказа поставщика')
    if not report['can_deliver']:
        raise HTTPException(409,'Проверка принадлежности не пройдена: '+report['reason'])
    candidates=set(report['candidate_ids'])
    matching=[p for p in items if str(p.get('id')) in candidates]
    if len(connection_data(matching))!=order['selection']['count']:
        raise HTTPException(409,'Поставщик ещё не вернул все данные подключения')
    for ident in sorted(candidates):
        conn.execute(text('''INSERT INTO tool_proxy_assignments(proxy_type,proxy_id,order_id)
            VALUES(:kind,:proxy,:id)'''),dict(kind=order['proxy_type'],proxy=ident,id=order['id']))
    conn.execute(text('''UPDATE tool_proxy_order_intents SET delivered_proxy_ids=CAST(:ids AS jsonb),updated_at=now()
        WHERE id=:id'''),dict(ids=json.dumps(sorted(candidates)),id=order['id']))
    report=dict(report,evidence_ref=evidence_ref,approved_by=actor)
    conn.execute(text('''INSERT INTO tool_proxy_reviews(order_id,state,report) VALUES(:id,'approved',CAST(:report AS jsonb))
        ON CONFLICT(order_id) DO UPDATE SET state='approved',report=EXCLUDED.report,updated_at=now()'''),
        dict(id=order['id'],report=json.dumps(report)))
    audit(conn,order['id'],actor,'approved',report)
