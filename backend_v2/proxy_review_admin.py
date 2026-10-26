"""Authenticated, audited reconciliation. No purchases, refunds or enable switches."""
from uuid import UUID
from fastapi import APIRouter, Header, HTTPException
from pydantic import BaseModel, Field
from sqlalchemy import text
from stars_payments import require_telegram_id
from access_guard import authorized_admin
from proxy_review_store import review, save_review, audit, approved_ids, assign

router=APIRouter(prefix='/admin/orders',tags=['Proxy reconciliation'])

class Approval(BaseModel):
    # An external ticket/reference, not pasted credentials or arbitrary provider data.
    evidence_ref: str = Field(min_length=3,max_length=120,pattern=r'^[A-Za-z0-9_.:/#-]+$')
    exclusive_account_confirmed: bool
    candidate_ids: list[str] = Field(min_length=1,max_length=1000)


def admin(raw):
    uid=require_telegram_id(raw)
    if not authorized_admin(uid):raise HTTPException(403,'Доступ только администратору')
    return uid


def locked_order(conn, oid):
    order=conn.execute(text('SELECT * FROM tool_proxy_order_intents WHERE id=:id'),dict(id=oid)).mappings().first()
    if not order:raise HTTPException(404,'Заказ не найден')
    if order['proxy_type'] not in ('ipv4','isp','mobile'):raise HTTPException(409,'Этот тип использует прямую связь заказа')
    if not conn.execute(text('SELECT pg_try_advisory_xact_lock(hashtext(:key))'),
                        dict(key='vvd-proxy-checkout-'+order['proxy_type'])).scalar():
        raise HTTPException(409,'Проверка или покупка этого типа уже выполняется')
    return conn.execute(text('SELECT * FROM tool_proxy_order_intents WHERE id=:id FOR UPDATE'),dict(id=oid)).mappings().one()


@router.post('/{order_id}/review')
async def inspect_order(order_id: UUID,x_telegram_init_data: str | None=Header(default=None)):
    actor=admin(x_telegram_init_data)
    import proxy_ipv4_preview as routes
    with routes.engine.begin() as conn:
        order=locked_order(conn,order_id)
        try:
            items=routes.proxy_items(await routes.provider('get/proxies',{'proxyType':order['proxy_type']}))
            report=review(conn,order,items)
        except HTTPException:
            report={'state':'manual_review','reason':'supplier_unavailable','candidate_ids':[], 'can_deliver':False,'checks':{}}
        save_review(conn,order,report)
        audit(conn,order_id,actor,'inspect',report)
        return {'order_id':str(order_id),'orderNumber':order['provider_order_id'],
                'proxy_type':order['proxy_type'],'selection':order['selection'],
                'payment_status':order['status'],'review':report,
                'approved_ids':sorted(approved_ids(conn,order_id))}


@router.post('/{order_id}/approve')
async def approve_order(order_id:UUID,body:Approval,x_telegram_init_data:str | None=Header(default=None)):
    actor=admin(x_telegram_init_data)
    import proxy_ipv4_preview as routes
    error=None;result=None
    with routes.engine.begin() as conn:
        order=locked_order(conn,order_id)
        existing=approved_ids(conn,order_id)
        try:
            if not body.exclusive_account_confirmed:
                raise HTTPException(409,'Нужно подтвердить отсутствие внешних операций на выделенном аккаунте')
            if len(set(body.candidate_ids))!=len(body.candidate_ids):raise HTTPException(422,'Повторяющиеся ID')
            if existing:
                if existing!=set(body.candidate_ids):raise HTTPException(409,'Заказ уже связан с другими ID')
                audit(conn,order_id,actor,'approval_replayed',{'candidate_ids':sorted(existing)})
                result={'state':'approved','proxy_ids':sorted(existing)}
            else:
                items=routes.proxy_items(await routes.provider('get/proxies',{'proxyType':order['proxy_type']}))
                report=review(conn,order,items,exclusive=True,manual=True)
                if set(report['candidate_ids'])!=set(body.candidate_ids):raise HTTPException(409,'Инвентарь изменился. Повторите сверку')
                assign(conn,order,items,report,actor,body.evidence_ref)
                result={'state':'approved','proxy_ids':report['candidate_ids']}
        except HTTPException as exc:
            # Commit the denial audit without changing ownership or financial records.
            audit(conn,order_id,actor,'approval_denied',{'status':exc.status_code})
            error=exc
    if error:raise error
    return result


@router.get('/{order_id}/audit')
def order_audit(order_id:UUID,x_telegram_init_data:str | None=Header(default=None)):
    actor=admin(x_telegram_init_data)
    import proxy_ipv4_preview as routes
    with routes.engine.begin() as conn:
        if not conn.execute(text('SELECT 1 FROM tool_proxy_order_intents WHERE id=:id'),dict(id=order_id)).scalar():
            raise HTTPException(404,'Заказ не найден')
        audit(conn,order_id,actor,'audit_viewed',{})
        return {'events':[dict(row) for row in conn.execute(text('''SELECT actor_id,action,report,created_at
            FROM tool_proxy_review_audit WHERE order_id=:id ORDER BY created_at DESC,id DESC LIMIT 100'''),dict(id=order_id)).mappings()]}
