"""Telegram Stars purchases. Credits are NOT CPA earnings and are never withdrawable.

This module deliberately requires signed Telegram WebApp initData for every API
request, stores orders before creating invoices, and credits only after a
server-side successful_payment update from Telegram.
"""
import hashlib
import hmac
import json
import logging
import os
import re
import time
import uuid
from urllib.parse import parse_qsl

from fastapi import APIRouter, Header, HTTPException
from pydantic import BaseModel
from sqlalchemy import text

from database import engine

logger = logging.getLogger(__name__)
router = APIRouter(prefix="/payments/stars", tags=["Telegram Stars"])

# Integer Stars. No USD exchange rate and no transfer to users.balance.
PACKAGES = {50: 50, 100: 100, 250: 250}
MAX_INIT_DATA_AGE = 3600

# No digital supplier integrations are connected yet. No monetary charges may
# be accepted until a real fulfilment provider has been implemented and tested.
# This is intentionally code-gated, NOT merely an environment toggle.
SERVICE_CATALOG = (
    {"id": "ai", "title": "AI Модель"},
    {"id": "numbers", "title": "Виртуальные номера"},
    {"id": "proxy", "title": "Прокси сервис"},
)
LIVE_SERVICES: frozenset[str] = frozenset()


def purchases_enabled() -> bool:
    return bool(LIVE_SERVICES) and os.getenv("STARS_PAYMENTS_ENABLED", "false").lower() == "true"


@router.get("/catalog")
def get_catalog():
    return {
        "currency": "XTR",
        "payments_enabled": purchases_enabled(),
        "services": [
            {**service, "available": service["id"] in LIVE_SERVICES, "price_stars": None}
            for service in SERVICE_CATALOG
        ],
        "message": "Оплата недоступна до подключения реальных услуг.",
    }



class TelegramAuthError(ValueError):
    """Safe, non-secret failure category for Telegram authentication."""

    def __init__(self, code: str):
        self.code = code
        super().__init__(code)


def verified_telegram_id(init_data: str, now: int | None = None) -> int:
    """Verify Telegram WebApp HMAC before freshness and identity checks."""
    token = os.getenv("BOT_TOKEN")
    if not token:
        raise TelegramAuthError("auth_config_error")
    if not init_data:
        raise TelegramAuthError("init_data_missing")
    if len(init_data) > 8192:
        raise TelegramAuthError("init_data_invalid")

    try:
        pairs = parse_qsl(init_data, keep_blank_values=True, strict_parsing=True)
        data = dict(pairs)
        if len(data) != len(pairs):
            raise TelegramAuthError("init_data_invalid")
        incoming_hash = data.pop("hash")
        # For bot-token HMAC validation only hash is excluded.
        # Telegram signature (Ed25519) is included in data-check-string when present.
        if not re.fullmatch(r"[0-9a-fA-F]{64}", incoming_hash):
            raise TelegramAuthError("invalid_signature")
        check_string = "\n".join(f"{key}={value}" for key, value in sorted(data.items()))
        secret = hmac.new(b"WebAppData", token.encode("utf-8"), hashlib.sha256).digest()
        expected = hmac.new(secret, check_string.encode("utf-8"), hashlib.sha256).hexdigest()
        if not hmac.compare_digest(expected, incoming_hash.lower()):
            raise TelegramAuthError("invalid_signature")

        auth_date = int(data["auth_date"])
        current = int(now if now is not None else time.time())
        if auth_date > current + 30:
            raise TelegramAuthError("invalid_auth_date")
        if current - auth_date > MAX_INIT_DATA_AGE:
            raise TelegramAuthError("init_data_expired")
        user = json.loads(data["user"])
        user_id = int(user["id"])
        if user_id <= 0:
            raise TelegramAuthError("invalid_user")
        return user_id
    except TelegramAuthError:
        raise
    except (KeyError, ValueError, TypeError, json.JSONDecodeError) as exc:
        raise TelegramAuthError("init_data_invalid") from exc


def require_telegram_id(raw: str | None) -> int:
    try:
        return verified_telegram_id(raw or "")
    except ValueError as exc:
        raise HTTPException(status_code=401, detail=str(exc)) from exc


class InvoiceRequest(BaseModel):
    stars: int


@router.get("/balance")
def get_star_balance(x_telegram_init_data: str | None = Header(default=None)):
    user_id = require_telegram_id(x_telegram_init_data)
    with engine.connect() as conn:
        row = conn.execute(
            text("SELECT stars FROM star_wallets WHERE telegram_id = :uid"),
            {"uid": user_id},
        ).fetchone()
    return {"stars": int(row.stars) if row else 0, "currency": "XTR", "payments_enabled": purchases_enabled()}


@router.post("/invoice")
async def create_star_invoice(
    payload: InvoiceRequest, x_telegram_init_data: str | None = Header(default=None)
):
    user_id = require_telegram_id(x_telegram_init_data)
    if not purchases_enabled():
        raise HTTPException(status_code=503, detail="Пополнение скоро появится. Платежи пока отключены.")
    stars = PACKAGES.get(payload.stars)
    if stars is None:
        raise HTTPException(status_code=422, detail="Unsupported Stars package")

    from bot import bot
    from aiogram.types import LabeledPrice

    order_id = uuid.uuid4()
    with engine.begin() as conn:
        found = conn.execute(
            text("SELECT 1 FROM users WHERE telegram_id = :uid"),
            {"uid": user_id},
        ).fetchone()
        if not found:
            raise HTTPException(status_code=404, detail="Open the bot with /start first")
        conn.execute(
            text("""
                INSERT INTO star_orders(id, telegram_id, stars_amount, status)
                VALUES (:order_id, :uid, :stars, 'pending')
            """),
            {"order_id": order_id, "uid": user_id, "stars": stars},
        )

    try:
        invoice_url = await bot.create_invoice_link(
            title="VVD CPA digital credits",
            description=f"{stars} Stars for in-app services. Not withdrawable.",
            payload=f"vvdstars:{order_id}",
            currency="XTR",
            prices=[LabeledPrice(label=f"{stars} credits", amount=stars)],
            provider_token="",
        )
    except Exception:
        logger.exception("Unable to create Telegram Stars invoice")
        with engine.begin() as conn:
            conn.execute(
                text("UPDATE star_orders SET status = 'failed' WHERE id = :id AND status = 'pending'"),
                {"id": order_id},
            )
        raise HTTPException(status_code=502, detail="Could not create payment invoice")

    return {"invoice_url": invoice_url, "order_id": str(order_id), "stars": stars}


def _parse_order_payload(payload: str) -> uuid.UUID | None:
    if not payload.startswith("vvdstars:"):
        return None
    try:
        return uuid.UUID(payload[len("vvdstars:"):])
    except (ValueError, AttributeError):
        return None


def check_pre_checkout(payload: str, telegram_id: int, currency: str, amount: int) -> bool:
    order_id = _parse_order_payload(payload)
    if not order_id or currency != "XTR" or not purchases_enabled():
        return False
    with engine.connect() as conn:
        row = conn.execute(
            text("""
                SELECT 1 FROM star_orders
                WHERE id = :id AND telegram_id = :uid AND stars_amount = :amount
                  AND status = 'pending'
                  AND created_at > NOW() - INTERVAL '30 minutes'
            """),
            {"id": order_id, "uid": telegram_id, "amount": amount},
        ).fetchone()
    return row is not None


def credit_successful_payment(payload: str, telegram_id: int,
                              currency: str, amount: int, charge_id: str) -> bool:
    """Exactly-once wallet credit; order row lock and unique Telegram charge."""
    order_id = _parse_order_payload(payload)
    if not order_id or currency != "XTR" or not charge_id:
        return False
    with engine.begin() as conn:
        order = conn.execute(
            text("SELECT telegram_id, stars_amount, status, telegram_payment_charge_id FROM star_orders WHERE id = :id FOR UPDATE"),
            {"id": order_id},
        ).fetchone()
        if not order or int(order.telegram_id) != telegram_id or int(order.stars_amount) != amount:
            logger.error("Invalid Stars settlement: order=%s user=%s", order_id, telegram_id)
            return False
        if order.status == "paid":
            return order.telegram_payment_charge_id == charge_id
        if order.status != "pending":
            logger.error("Unexpected Stars order state: %s", order.status)
            return False
        conn.execute(
            text("""
                UPDATE star_orders
                SET status='paid', telegram_payment_charge_id=:charge, paid_at=NOW()
                WHERE id=:id
            """),
            {"id": order_id, "charge": charge_id},
        )
        conn.execute(
            text("""
                INSERT INTO star_wallets(telegram_id, stars)
                VALUES (:uid, :amount)
                ON CONFLICT (telegram_id)
                DO UPDATE SET stars = star_wallets.stars + EXCLUDED.stars,
                              updated_at = NOW()
            """),
            {"uid": telegram_id, "amount": amount},
        )
    return True


def reverse_refunded_payment(charge_id: str, telegram_id: int, amount: int) -> bool:
    """Process Telegram refunds once; a spent balance may become debt."""
    if not charge_id:
        return False
    with engine.begin() as conn:
        order = conn.execute(
            text("""
                SELECT id, status, stars_amount FROM star_orders
                WHERE telegram_payment_charge_id = :charge AND telegram_id = :uid
                FOR UPDATE
            """),
            {"charge": charge_id, "uid": telegram_id},
        ).fetchone()
        if not order or order.status != "paid" or int(order.stars_amount) != amount:
            return False
        conn.execute(
            text("UPDATE star_orders SET status='refunded', refunded_at=NOW() WHERE id=:id"),
            {"id": order.id},
        )
        conn.execute(
            text("UPDATE star_wallets SET stars=stars-:amount, updated_at=NOW() WHERE telegram_id=:uid"),
            {"amount": amount, "uid": telegram_id},
        )
    return True
