"""Per-order paid-operation permits and transactional supplier reconciliation.
No permit is created automatically. All HTTP mutations require a Telegram admin.
"""
import json
from datetime import datetime, timezone
from decimal import Decimal
from uuid import UUID
from typing import Literal
from fastapi import Header, HTTPException
from pydantic import BaseModel, Field, AwareDatetime
from sqlalchemy import text
from sqlalchemy.exc import IntegrityError
from proxy_review_admin import router, admin, locked_order
from proxy_review_store import audit

class Permit(BaseModel):
    permit_id: UUID
    max_amount_usd: Decimal = Field(gt=0, max_digits=14, decimal_places=2)
    expires_at: AwareDatetime
    exclusive_account_confirmed: Literal[True]
    evidence_ref: str = Field(min_length=3,max_length=120,pattern=r'^[A-Za-z0-9_.:/#-]+$')

class Resolution(BaseModel):
    decision_id: UUID
    outcome: Literal['paid','rejected','refunded']
    provider_order_id: str | None = Field(default=None,min_length=1,max_length=120,pattern=r'^[A-Za-z0-9_.:-]+$')
    confirmed_provider_amount: Decimal = Field(ge=0,max_digits=14,decimal_places=2)
    supplier_final_confirmed: Literal[True]
    no_future_delivery_confirmed: bool = False
    evidence_ref: str = Field(min_length=3,max_length=120,pattern=r'^[A-Za-z0-9_.:/#-]+$')


def eligible_permit(conn, oid, permit_id, amount, *, lock=False):
    row=conn.execute(text('''SELECT * FROM tool_proxy_control_permits WHERE order_id=:id
        AND permit_id=:permit AND consumed_at IS NULL AND revoked_at IS NULL
        AND expires_at>now()''' + (' FOR UPDATE' if lock else '')),
        dict(id=oid,permit=permit_id)).mappings().first()
    if not row or Decimal(amount)>row['max_amount_usd']:
        raise HTTPException(409,'Разрешение отсутствует, истекло, использовано или превышен лимит')
    return row


@router.post('/{order_id}/control-permit')
def grant_permit(order_id: UUID, body: Permit, x_telegram_init_data: str | None=Header(default=None)):
    actor=admin(x_telegram_init_data)
    import proxy_ipv4_preview as routes
    with routes.engine.begin() as conn:
        order=locked_order(conn,order_id)
        old=conn.execute(text('SELECT * FROM tool_proxy_control_permits WHERE order_id=:id'),dict(id=order_id)).mappings().first()
        if old:
            if (str(old['permit_id'])!=str(body.permit_id) or old['max_amount_usd']!=body.max_amount_usd
                    or old['expires_at']!=body.expires_at or old['evidence_ref']!=body.evidence_ref):
                raise HTTPException(409,'Разрешение для этого заказа уже существует')
            return {'permit_id':str(old['permit_id']),'replayed':True}
        seconds=(body.expires_at-datetime.now(timezone.utc)).total_seconds()
        if order['status']!='prepared' or not 0<seconds<=3600 or order['quoted_amount']>body.max_amount_usd:
            raise HTTPException(409,'Нужен подготовленный заказ, достаточный лимит и срок не более часа')
        conn.execute(text('''INSERT INTO tool_proxy_control_permits
            (order_id,permit_id,max_amount_usd,expires_at,actor_id,evidence_ref)
            VALUES(:id,:permit,:amount,:expires,:actor,:evidence)'''),
            dict(id=order_id,permit=body.permit_id,amount=body.max_amount_usd,expires=body.expires_at,actor=actor,evidence=body.evidence_ref))
        audit(conn,order_id,actor,'control_permit_granted',body.model_dump(mode='json'))
        return {'permit_id':str(body.permit_id),'replayed':False}


@router.delete('/{order_id}/control-permit')
def revoke_permit(order_id: UUID,x_telegram_init_data: str | None=Header(default=None)):
    actor=admin(x_telegram_init_data)
    import proxy_ipv4_preview as routes
    with routes.engine.begin() as conn:
        locked_order(conn,order_id)
        row=conn.execute(text('''UPDATE tool_proxy_control_permits SET revoked_at=coalesce(revoked_at,now())
            WHERE order_id=:id AND consumed_at IS NULL RETURNING permit_id'''),dict(id=order_id)).first()
        if not row:raise HTTPException(409,'Отсутствующее или использованное разрешение нельзя отозвать')
        audit(conn,order_id,actor,'control_permit_revoked',{})
        return {'revoked':True}


def begin_controlled(conn, owner, oid, permit_id, before, cost):
    # Caller holds the per-type session lock. Permit, reservation and submission
    # marker commit together BEFORE the only outbound paid call.
    conn.execute(text('SELECT pg_advisory_xact_lock(:owner)'),dict(owner=owner))
    order=conn.execute(text('SELECT * FROM tool_proxy_order_intents WHERE id=:id AND telegram_id=:owner FOR UPDATE'),dict(id=oid,owner=owner)).mappings().first()
    if not order or order['status']!='prepared':raise HTTPException(409,'Заказ уже отправлен или закрыт')
    permit=eligible_permit(conn,oid,permit_id,order['quoted_amount'],lock=True)
    if not cost.is_finite() or cost<=0 or cost>permit['max_amount_usd']:
        raise HTTPException(409,'Стоимость поставщика превышает разрешение')
    pending=conn.execute(text("SELECT 1 FROM tool_proxy_order_intents WHERE telegram_id=:owner AND id<>:id AND status IN ('reserved','submitting','uncertain') LIMIT 1"),dict(owner=owner,id=oid)).first()
    if pending:raise HTTPException(409,'Есть незавершённая оплата')
    wallet=conn.execute(text('''UPDATE tool_wallets SET available=available-:amount,reserved=reserved+:amount,updated_at=now()
        WHERE telegram_id=:owner AND available>=:amount AND refund_debt=0 RETURNING telegram_id'''),dict(owner=owner,amount=order['quoted_amount'])).first()
    if not wallet:raise HTTPException(409,'Недостаточно доступных средств')
    conn.execute(text('''UPDATE tool_proxy_order_intents SET status='submitting',provider_cost=:cost,
        proxy_ids_before=CAST(:before AS jsonb),supplier_submitted_at=now(),updated_at=now() WHERE id=:id'''),
        dict(id=oid,cost=cost,before=json.dumps(sorted(before))))
    conn.execute(text('UPDATE tool_proxy_control_permits SET consumed_at=now() WHERE order_id=:id'),dict(id=oid))
    audit(conn,oid,owner,'control_submission_started',{'permit_id':str(permit_id),'amount':str(order['quoted_amount'])})


def resolve(conn, order, body, actor):
    oid=order['id']; payload=body.model_dump(mode='json')
    old=conn.execute(text('SELECT order_id,payload,result FROM tool_proxy_financial_resolutions WHERE decision_id=:decision'),dict(decision=body.decision_id)).mappings().first()
    if old:
        if old['order_id']!=oid or old['payload']!=payload:raise HTTPException(409,'UUID решения уже использован иначе')
        return dict(old['result'],replayed=True)
    prior=conn.execute(text('SELECT 1 FROM tool_proxy_financial_resolutions WHERE order_id=:id AND outcome=:outcome'),dict(id=oid,outcome=body.outcome)).first()
    if prior:raise HTTPException(409,'Результат уже проведён; повторите исходный UUID решения')
    cost=order['provider_cost']
    if cost is None or body.confirmed_provider_amount!=cost:
        raise HTTPException(409,'Сумма подтверждённого заказа поставщика не совпадает')
    number=body.provider_order_id
    if order['provider_order_id'] and number!=order['provider_order_id']:
        raise HTTPException(409,'Номер заказа поставщика не совпадает')
    amount=order['quoted_amount'];owner=order['telegram_id']
    if body.outcome=='paid':
        if not number:raise HTTPException(422,'Нужен orderNumber')
        from proxy_ipv4_wallet import settle_in_transaction
        result=settle_in_transaction(conn,owner,oid,number)
    else:
        if not body.no_future_delivery_confirmed:
            raise HTTPException(409,'Нужно подтверждение окончательного прекращения выдачи')
        required=('submitting','uncertain') if body.outcome=='rejected' else ('fulfilled',)
        if order['status'] not in required:raise HTTPException(409,'Недопустимый переход финансового статуса')
        if body.outcome=='refunded':
            purchase=conn.execute(text("SELECT amount FROM tool_transactions WHERE telegram_id=:owner AND external_payment_id=:external AND kind='purchase' AND status='success'"),dict(owner=owner,external='proxy-ipv4:'+str(order['provider_order_id']))).scalar()
            if purchase != -amount:raise HTTPException(409,'Исходное списание не подтверждено')
            # Refund is a compensation for a settled purchase, not another release.
            conn.execute(text('UPDATE tool_wallets SET available=available+:amount,updated_at=now() WHERE telegram_id=:owner'),dict(amount=amount,owner=owner))
            conn.execute(text("INSERT INTO tool_transactions(telegram_id,kind,amount,currency,status,external_payment_id) VALUES(:owner,'refund',:amount,'USD','success',:external)"),dict(owner=owner,amount=amount,external='proxy-refund:'+str(oid)))
        else:
            updated=conn.execute(text('''UPDATE tool_wallets SET available=available+:amount,reserved=reserved-:amount,updated_at=now()
                WHERE telegram_id=:owner AND reserved>=:amount RETURNING telegram_id'''),dict(owner=owner,amount=amount)).first()
            if not updated:raise HTTPException(409,'Резерв не совпадает; изменения отменены')
        # Claims and review history are retained forever; cancelled cannot disclose data.
        conn.execute(text("UPDATE tool_proxy_order_intents SET status='cancelled',provider_order_id=coalesce(provider_order_id,:number),updated_at=now() WHERE id=:id"),dict(id=oid,number=number))
        result={'status':'cancelled','outcome':body.outcome,'restored_amount':str(amount)}
    conn.execute(text('''INSERT INTO tool_proxy_financial_resolutions(decision_id,order_id,outcome,actor_id,payload,result)
        VALUES(:decision,:id,:outcome,:actor,CAST(:payload AS jsonb),CAST(:result AS jsonb))'''),
        dict(decision=body.decision_id,id=oid,outcome=body.outcome,actor=actor,payload=json.dumps(payload),result=json.dumps(result)))
    audit(conn,oid,actor,'financial_'+body.outcome,payload)
    return dict(result,replayed=False)


@router.post('/{order_id}/financial-resolution')
def financial_resolution(order_id:UUID,body:Resolution,x_telegram_init_data:str | None=Header(default=None)):
    actor=admin(x_telegram_init_data)
    import proxy_ipv4_preview as routes
    error=None;result=None
    with routes.engine.begin() as conn:
        order=locked_order(conn,order_id)
        try:
            # Savepoint guarantees denial audit commits without partial financial changes.
            with conn.begin_nested():result=resolve(conn,order,body,actor)
        except IntegrityError:
            error=HTTPException(409,'Конфликт уникального номера или решения; изменения отменены')
            audit(conn,order_id,actor,'financial_resolution_denied',{'decision_id':str(body.decision_id),'status':409})
        except HTTPException as exc:
            audit(conn,order_id,actor,'financial_resolution_denied',{'decision_id':str(body.decision_id),'status':exc.status_code})
            error=exc
    if error:raise error
    return result
