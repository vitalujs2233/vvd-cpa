"""Resumable read-only supplier polling and atomic attribution for consumed permits."""
import asyncio
import logging
from datetime import datetime, timezone
from sqlalchemy import text
from fastapi import HTTPException
from proxy_review_store import review, save_review, approved_ids, assign
from proxy_delivery import connection_data
from proxy_inventory_review import REVIEW_WAIT_SECONDS, timestamp


async def refresh_delivery(order_id, owner=None):
    import proxy_ipv4_preview as routes
    from proxy_review_admin import locked_order
    with routes.engine.begin() as conn:
        if owner is not None and not conn.execute(text('SELECT 1 FROM tool_proxy_order_intents WHERE id=:id AND telegram_id=:owner'),dict(id=order_id,owner=owner)).first():
            raise HTTPException(404,'Заявка не найдена')
        order=locked_order(conn,order_id)
        if order['status']!='fulfilled' or not order['provider_order_id']:
            raise HTTPException(409,'Заказ ещё не подтверждён')
        permit=conn.execute(text('SELECT permit_id,evidence_ref FROM tool_proxy_control_permits WHERE order_id=:id AND consumed_at IS NOT NULL'),dict(id=order_id)).mappings().first()
        expected=order['selection']['count'];matches=[];proxies=[];report=None;error=None
        try:
            items=routes.proxy_items(await routes.provider('get/proxies',{'proxyType':order['proxy_type']}))
            ids=approved_ids(conn,order_id)
            if ids:
                matches=[p for p in items if str(p.get('id')) in ids]
                if len(matches)!=len({str(p.get('id')) for p in matches}):matches=[]
                proxies=connection_data(matches)
            else:
                report=review(conn,order,items,exclusive=bool(permit))
                previous=conn.execute(text('SELECT state FROM tool_proxy_reviews WHERE order_id=:id'),dict(id=order_id)).scalar()
                if report['can_deliver'] and previous!='manual_review':
                    if len(connection_data([p for p in items if str(p.get('id')) in report['candidate_ids']]))==expected:
                        assign(conn,order,items,report,None,'control:'+str(permit['permit_id']))
                        matches=[p for p in items if str(p.get('id')) in report['candidate_ids']]
                        proxies=connection_data(matches)
                        report=dict(report,state='approved')
                    else:
                        report=dict(report,state='waiting',reason='connection_data_pending',can_deliver=False)
                        report=save_review(conn,order,report)
                else:
                    report=save_review(conn,order,report)
        except HTTPException as exc:
            start=timestamp(order['supplier_submitted_at'])
            expired=start is None or (datetime.now(timezone.utc)-start).total_seconds()>=REVIEW_WAIT_SECONDS
            report=save_review(conn,order,dict(state='manual_review' if expired else 'waiting',
                reason='delivery_timeout' if expired else 'supplier_unavailable',candidate_ids=[],checks={},can_deliver=False))
            error=exc
        result={'status':'fulfilled','proxies':proxies if len(proxies)<=expected else [],
            'delivery_pending':len(proxies)!=expected,'expected_count':expected,
            'verification_required':not bool(matches),
            'inventory_review':{k:report[k] for k in ('state','reason')} if report else None}
    if error:raise error
    return result


async def sweep_once():
    import proxy_ipv4_preview as routes
    # Durable source of work. Never sends POST /order, releases a reserve, or retries payment.
    with routes.engine.connect() as conn:
        ids=conn.execute(text('''SELECT o.id FROM tool_proxy_order_intents o
            JOIN tool_proxy_control_permits p ON p.order_id=o.id AND p.consumed_at IS NOT NULL
            LEFT JOIN tool_proxy_reviews r ON r.order_id=o.id
            WHERE o.status IN ('fulfilled','submitting','uncertain')
              AND coalesce(r.state,'') NOT IN ('approved','manual_review')
            ORDER BY o.supplier_submitted_at LIMIT 50''')).scalars().all()
    for oid in ids:
        try:
            with routes.engine.begin() as conn:
                from proxy_review_admin import locked_order
                order=locked_order(conn,oid)
                if order['status'] in ('submitting','uncertain'):
                    start=timestamp(order['supplier_submitted_at'])
                    if start is None or (datetime.now(timezone.utc)-start).total_seconds()>=REVIEW_WAIT_SECONDS:
                        conn.execute(text("UPDATE tool_proxy_order_intents SET status='uncertain',updated_at=now() WHERE id=:id"),dict(id=oid))
                        save_review(conn,order,dict(state='manual_review',reason='payment_outcome_unknown',candidate_ids=[],checks={},can_deliver=False))
                    continue
                if order['status']!='fulfilled':continue
            await refresh_delivery(oid)
        except HTTPException:
            pass  # Busy lane/outage persists safely and is retried on the next read cycle.


async def fulfillment_loop():
    while True:
        try:await sweep_once()
        except Exception:
            logging.getLogger(__name__).error('Proxy fulfillment sweep failed; durable orders retained')
        await asyncio.sleep(10)
