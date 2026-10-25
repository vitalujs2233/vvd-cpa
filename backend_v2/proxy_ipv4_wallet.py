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
