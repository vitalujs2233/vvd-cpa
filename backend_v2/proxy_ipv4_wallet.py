"""Internal wallet primitives for Proxy-IPv4 orders.

NOT exposed as HTTP routes. No provider calls. Purchases remain disabled.
All operations require the verified Telegram owner ID from the caller.
"""
from decimal import Decimal
from uuid import UUID

from sqlalchemy import text
from fastapi import HTTPException

from database import engine


def reserve_order(owner_id: int, order_id: UUID) -> dict:
    """Move funds from tool_wallets.available to reserved exactly once."""
    with engine.begin() as conn:
        # Lock the order first; every wallet transition must use this order.
        order = conn.execute(text("""
            SELECT id, quoted_amount, status
            FROM tool_proxy_order_intents
            WHERE id=:id AND telegram_id=:owner FOR UPDATE
        """), {"id": order_id, "owner": owner_id}).mappings().first()
        if not order:
            raise HTTPException(404, "Заявка не найдена")
        if order["status"] == "reserved":
            return {"status": "reserved", "amount": str(order["quoted_amount"])}
        if order["status"] != "prepared":
            raise HTTPException(409, "Нельзя резервировать заявку в этом статусе")
        amount = Decimal(order["quoted_amount"])
        if amount <= 0:
            raise HTTPException(422, "Недопустимая сумма")
        updated = conn.execute(text("""
            UPDATE tool_wallets
            SET available=available-:amount, reserved=reserved+:amount,
                updated_at=now()
            WHERE telegram_id=:owner AND available>=:amount
              AND refund_debt=0
            RETURNING telegram_id
        """), {"owner": owner_id, "amount": amount}).first()
        if not updated:
            raise HTTPException(409, "Недостаточно средств на балансе инструментов")
        conn.execute(text("""
            UPDATE tool_proxy_order_intents SET status='reserved',updated_at=now()
            WHERE id=:id AND telegram_id=:owner
        """), {"id": order_id, "owner": owner_id})
        return {"status": "reserved", "amount": str(amount)}


def release_reservation(owner_id: int, order_id: UUID) -> dict:
    """Release only a reserved, not-yet-submitted order. Never release uncertain orders."""
    with engine.begin() as conn:
        order = conn.execute(text("""
            SELECT quoted_amount,status FROM tool_proxy_order_intents
            WHERE id=:id AND telegram_id=:owner FOR UPDATE
        """), {"id": order_id, "owner": owner_id}).mappings().first()
        if not order:
            raise HTTPException(404, "Заявка не найдена")
        if order["status"] == "cancelled":
            return {"status": "cancelled"}
        if order["status"] != "reserved":
            raise HTTPException(409, "Резерв нельзя освободить после отправки поставщику")
        amount = Decimal(order["quoted_amount"])
        updated = conn.execute(text("""
            UPDATE tool_wallets
            SET available=available+:amount, reserved=reserved-:amount,
                updated_at=now()
            WHERE telegram_id=:owner AND reserved>=:amount
            RETURNING telegram_id
        """), {"owner": owner_id, "amount": amount}).first()
        if not updated:
            raise RuntimeError("Wallet reservation mismatch; manual reconciliation required")
        conn.execute(text("""
            UPDATE tool_proxy_order_intents
            SET status='cancelled',updated_at=now()
            WHERE id=:id AND telegram_id=:owner
        """), {"id": order_id, "owner": owner_id})
        return {"status": "cancelled"}


def mark_submitting(owner_id: int, order_id: UUID, provider_cost: Decimal) -> dict:
    """Durably record submission intent before the ONE supplier request."""
    if not provider_cost.is_finite() or provider_cost <= 0:
        raise HTTPException(422, "Некорректная стоимость поставщика")
    with engine.begin() as conn:
        row = conn.execute(text("""
            UPDATE tool_proxy_order_intents
            SET status='submitting',provider_cost=:cost,updated_at=now()
            WHERE id=:id AND telegram_id=:owner AND status='reserved'
            RETURNING id
        """), {"id":order_id,"owner":owner_id,"cost":provider_cost}).first()
        if not row:
            raise HTTPException(409,"Заявка не зарезервирована или уже отправлена")
    return {"status":"submitting"}


def mark_uncertain(owner_id: int, order_id: UUID) -> dict:
    """Never release a reservation when the supplier outcome is ambiguous."""
    with engine.begin() as conn:
        row = conn.execute(text("""
            UPDATE tool_proxy_order_intents
            SET status='uncertain',updated_at=now()
            WHERE id=:id AND telegram_id=:owner AND status='submitting'
            RETURNING id
        """), {"id":order_id,"owner":owner_id}).first()
        if not row:
            raise HTTPException(409,"Нельзя изменить статус заявки")
    return {"status":"uncertain"}


def confirm_fulfilled(owner_id: int, order_id: UUID, provider_order_id: str) -> dict:
    """Finalize confirmed purchase exactly once, touching only tool_wallets."""
    if not provider_order_id or not provider_order_id.strip():
        raise HTTPException(422,"Не указан номер заказа поставщика")
    with engine.begin() as conn:
        order = conn.execute(text("""
            SELECT quoted_amount,status,provider_order_id
            FROM tool_proxy_order_intents
            WHERE id=:id AND telegram_id=:owner FOR UPDATE
        """), {"id":order_id,"owner":owner_id}).mappings().first()
        if not order:
            raise HTTPException(404,"Заявка не найдена")
        if order["status"] == "fulfilled":
            if order["provider_order_id"] != provider_order_id:
                raise HTTPException(409,"Номер заказа не совпадает")
            return {"status":"fulfilled","order_number":provider_order_id}
        if order["status"] not in ("submitting","uncertain"):
            raise HTTPException(409,"Покупка не подтверждена")
        amount = Decimal(order["quoted_amount"])
        wallet = conn.execute(text("""
            UPDATE tool_wallets SET reserved=reserved-:amount,updated_at=now()
            WHERE telegram_id=:owner AND reserved>=:amount
            RETURNING telegram_id
        """), {"owner":owner_id,"amount":amount}).first()
        if not wallet:
            raise RuntimeError("Wallet reconciliation required")
        conn.execute(text("""
            INSERT INTO tool_transactions
                (telegram_id,kind,amount,currency,status,external_payment_id)
            VALUES (:owner,'purchase',-:amount,'USD','success',:external_id)
            ON CONFLICT (external_payment_id) DO NOTHING
        """), {"owner":owner_id,"amount":amount,
               "external_id":"proxy-ipv4:"+provider_order_id})
        conn.execute(text("""
            UPDATE tool_proxy_order_intents
            SET status='fulfilled',provider_order_id=:number,updated_at=now()
            WHERE id=:id AND telegram_id=:owner
        """), {"id":order_id,"owner":owner_id,"number":provider_order_id})
    return {"status":"fulfilled","order_number":provider_order_id}


def record_confirmed_supplier_order(owner_id: int, order_id: UUID, provider_order_id: str) -> dict:
    """Keep the supplier receipt for manual reconciliation if wallet settlement fails."""
    number = str(provider_order_id).strip()
    if not number:
        raise ValueError("Missing supplier receipt")
    with engine.begin() as conn:
        row = conn.execute(text("""
            UPDATE tool_proxy_order_intents
            SET status='uncertain',provider_order_id=:number,updated_at=now()
            WHERE id=:id AND telegram_id=:owner AND status IN ('submitting','uncertain')
              AND (provider_order_id IS NULL OR provider_order_id=:number)
            RETURNING id
        """), {"id":order_id,"owner":owner_id,"number":number}).first()
        if not row:
            raise RuntimeError("Supplier receipt requires manual reconciliation")
    return {"status":"uncertain","order_number":number}
