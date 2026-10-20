from fastapi import FastAPI, Request, HTTPException
from fastapi.responses import RedirectResponse
from fastapi.middleware.cors import CORSMiddleware
from pydantic import BaseModel
from sqlalchemy import text
from database import check_database, save_user, engine
from datetime import datetime, timedelta

import json
import urllib.request
import uuid
import asyncio
import os
from bot import start_bot, dp, bot
from stars_payments import router as stars_router
from tools_marketplace import router as tools_market_router
from ai_studio_v2 import router as ai_studio_router
from cpa_catalog import router as cpa_catalog_router
from neutral_links import router as neutral_links_router
from cpa_postback import router as cpa_postback_router
from cpa_real_withdrawals import create_real_withdrawal, mark_real_paid, mark_real_rejected, finance_balance_projection, release_matured_holds, RealFinanceDisabled
from sqlalchemy.exc import ProgrammingError
from access_guard import access_guard, authorized_admin
from cpa_manual_hold import (read_partner_hold, record_verified_receipt,
                             manual_release, ManualReleaseDenied)
from cpa_finance_corrections import register_dispute, confirm_cancellation
from cpa_analytics import router as cpa_analytics_router

from stars_payments import verified_telegram_id
from urllib.parse import parse_qs
from aiogram.types import Update
import hmac
import logging
from stars_payments import TelegramAuthError

logger = logging.getLogger(__name__)

app = FastAPI(
    title="VVD CPA Backend V2",
    version="2.0"
)
app.include_router(stars_router)
app.include_router(tools_market_router)
app.include_router(ai_studio_router)
app.include_router(cpa_catalog_router)
app.include_router(neutral_links_router)
app.include_router(cpa_postback_router)
app.include_router(cpa_analytics_router)
app.middleware('http')(access_guard)

app.add_middleware(
    CORSMiddleware,
    allow_origins=[
        "https://vitalujs2233.github.io",
        "https://vitalujs2233.github.io/vvd-cpa",
        "https://web.telegram.org"
    ],
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)
@app.on_event("startup")
async def startup_bot():
    app.state.bot_task = asyncio.create_task(start_bot())


@app.on_event("shutdown")
async def shutdown_bot():
    bot_task = getattr(app.state, "bot_task", None)

    if bot_task:
        bot_task.cancel()

        try:
            await bot_task
        except asyncio.CancelledError:
            pass
    if os.getenv('TELEGRAM_WEBHOOK_URL'):
        await bot.session.close()
@app.post("/telegram/webhook")
async def telegram_webhook(request: Request):
    """Receive signed Telegram updates when webhook mode is enabled on Render."""
    if not os.getenv("TELEGRAM_WEBHOOK_URL"):
        raise HTTPException(status_code=404, detail="Webhook is not enabled")
    secret = os.getenv("TELEGRAM_WEBHOOK_SECRET", "")
    provided = request.headers.get("X-Telegram-Bot-Api-Secret-Token", "")
    if not secret or not hmac.compare_digest(provided, secret):
        raise HTTPException(status_code=403, detail="Invalid Telegram webhook secret")
    try:
        update = Update.model_validate(await request.json())
    except (ValueError, TypeError):
        raise HTTPException(status_code=400, detail="Malformed Telegram update")
    await dp.feed_update(bot, update)
    return {"ok": True}


@app.get("/")
async def root():
    return {
        "status": "ok",
        "message": "Backend V2 работает"
    }


@app.get("/health")
async def health():
    return {
        "status": "healthy"
    }


@app.get("/db")
async def db():
    try:
        check_database()
        return {
            "database": "connected"
        }
    except Exception as e:
        return {
            "database": "error",
            "details": str(e)
        }
        
class TelegramAuthRequest(BaseModel):
    init_data: str


class WithdrawalRequest(BaseModel):
    partner_code: str
    amount: float
    payment_method: str
    wallet: str
    request_id: str | None = None


@app.post("/auth")
def auth(payload: TelegramAuthRequest):
    # The Telegram user object and referral start_param must come from one
    # verified initData message; never trust a browser-supplied Telegram ID.
    try:
        telegram_id = verified_telegram_id(payload.init_data)
        values = parse_qs(payload.init_data,keep_blank_values=True,strict_parsing=True)
        signed_user = json.loads(values["user"][0])
        if not isinstance(signed_user,dict) or int(signed_user["id"])!=telegram_id:
            raise ValueError("Telegram user mismatch")
        referral_code = values.get("start_param",[""])[0][:64]
    except TelegramAuthError as exc:
        logger.warning("telegram_auth_rejected code=%s", exc.code)
        status = 503 if exc.code == "auth_config_error" else 401
        raise HTTPException(status_code=status, detail={"code": exc.code}) from None
    except (ValueError, KeyError, TypeError, IndexError, OverflowError):
        logger.warning("telegram_auth_rejected code=invalid_user")
        raise HTTPException(status_code=401, detail={"code": "invalid_user"}) from None
    try:
        user=save_user(
            telegram_id=telegram_id,
            first_name=str(signed_user.get("first_name") or "Telegram")[:255],
            last_name=str(signed_user.get("last_name") or "")[:255] or None,
            username=str(signed_user.get("username") or "")[:255] or None,
            photo_url=str(signed_user.get("photo_url") or "")[:2048] or None,
            referral_code=referral_code
        )
    except Exception:
        logger.error("telegram_auth_rejected code=account_storage_error")
        raise HTTPException(status_code=503, detail={"code": "account_storage_error"}) from None
    return {
        "user": {
            "telegram_id":user["telegram_id"],
            "first_name":user["first_name"],
            "last_name":user["last_name"],
            "username":user["username"],
            "photo_url":user["photo_url"],
            "partner_code":user["partner_code"],
            "role":user["role"],
            "status":user["status"],
        }
    }


@app.get("/smartlink/{telegram_id}/{vertical}")
async def get_smartlink(telegram_id: int, vertical: str):

    with engine.connect() as conn:

        user = conn.execute(
            text("""
                SELECT partner_code
                FROM users
                WHERE telegram_id = :telegram_id
            """),
            {"telegram_id": telegram_id},
        ).fetchone()

    if not user:
        return {
            "success": False,
            "message": "User not found"
        }

    partner_code = user.partner_code

    links = {

        "adult":
        f"https://vvd-cpa-v2.onrender.com/go/{partner_code}/adult",

        "mainstream":
        f"https://vvd-cpa-v2.onrender.com/go/{partner_code}/mainstream",

        "webcam":
        f"https://vvd-cpa-v2.onrender.com/go/{partner_code}/webcam",

        "adult-games":
        f"https://vvd-cpa-v2.onrender.com/go/{partner_code}/adult-games",

        "gaming":
        f"https://GAMING_LINK&sub1={partner_code}",

        "utilities":
        f"https://UTILITIES_LINK&sub1={partner_code}",
    }

    smartlink = links.get(vertical)

    if not smartlink:
        return {
            "success": False,
            "message": "Unknown vertical"
        }

        inviter = conn.execute(
            text("""
                SELECT invited_by
                FROM users
                WHERE telegram_id = :telegram_id
            """),
            {"telegram_id": telegram_id}
        ).fetchone()

        if inviter and inviter.invited_by:
            referral_reward = round(payout_net * 0.05, 2)
            conn.execute(
                text("""
                    UPDATE users
                    SET referral_balance = COALESCE(referral_balance,0)+:reward,
                        referral_earned = COALESCE(referral_earned,0)+:reward
                    WHERE telegram_id = :invited_by
                """),
                {"reward": referral_reward, "invited_by": inviter.invited_by}
            )

    return {
        "success": True,
        "partner_code": partner_code,
        "smartlink": smartlink
    }


@app.get("/go/{partner_code}/{vertical}")
async def track_click(partner_code: str, vertical: str, request: Request):

    with engine.connect() as conn:
        user = conn.execute(
            text("""
                SELECT telegram_id, partner_code
                FROM users
                WHERE partner_code = :partner_code
            """),
            {"partner_code": partner_code}
        ).fetchone()

        if not user:
            return {"success": False, "message": "Partner not found"}

        telegram_id = user.telegram_id
        partner_code = user.partner_code
        click_id = str(uuid.uuid4())

        forwarded_for = request.headers.get("x-forwarded-for")
        ip_address = (
            forwarded_for.split(",")[0].strip()
            if forwarded_for
            else (request.client.host if request.client else "")
        )

        country_code = "UNKNOWN"
        country_name = "Неизвестно"

        try:
            with urllib.request.urlopen(
                f"https://ipwho.is/{ip_address}",
                timeout=3
            ) as response:
                geo_data = json.loads(response.read().decode("utf-8"))

            if geo_data.get("success"):
                country_code = geo_data.get("country_code") or "UNKNOWN"
                country_name = geo_data.get("country") or "Неизвестно"
        except Exception as geo_error:
            print("GEO detection error:", geo_error)

        conn.execute(
            text("""
                INSERT INTO clicks (
                    user_id,
                    partner_code,
                    click_id,
                    vertical,
                    country_code,
                    country_name,
                    ip_address
                )
                VALUES (
                    :user_id,
                    :partner_code,
                    :click_id,
                    :vertical,
                    :country_code,
                    :country_name,
                    :ip_address
                )
            """),
            {
                "user_id": telegram_id,
                "partner_code": partner_code,
                "click_id": click_id,
                "vertical": vertical,
                "country_code": country_code,
                "country_name": country_name,
                "ip_address": ip_address,
            }
        )
        country_row = conn.execute(
            text("""
                SELECT country_code
                FROM country_statistics
                WHERE user_id = :user_id
                AND country_code = :country_code
                AND date = CURRENT_DATE
            """),
            {
                "user_id": telegram_id,
                "country_code": country_code
            }
        ).fetchone()

        if country_row:
            conn.execute(
                text("""
                    UPDATE country_statistics
                    SET clicks = clicks + 1,
                        country_name = :country_name
                    WHERE user_id = :user_id
                    AND country_code = :country_code
                    AND date = CURRENT_DATE
                """),
                {
                    "user_id": telegram_id,
                    "country_code": country_code,
                    "country_name": country_name
                }
            )
        else:
            conn.execute(
                text("""
                    INSERT INTO country_statistics
                    (
                        user_id, country_code, country_name,
                        date, clicks, conversions, income
                    )
                    VALUES
                    (
                        :user_id, :country_code, :country_name,
                        CURRENT_DATE, 1, 0, 0
                    )
                """),
                {
                    "user_id": telegram_id,
                    "country_code": country_code,
                    "country_name": country_name
                }
            )

        stats = conn.execute(
            text("""
                SELECT id
                FROM statistics
                WHERE user_id = :user_id
                AND date = CURRENT_DATE
            """),
            {"user_id": telegram_id}
        ).fetchone()

        if stats:
            conn.execute(
                text("""
                    UPDATE statistics
                    SET clicks = clicks + 1
                    WHERE user_id = :user_id
                    AND date = CURRENT_DATE
                """),
                {"user_id": telegram_id}
            )
        else:
            conn.execute(
                text("""
                    INSERT INTO statistics
                    (user_id, date, clicks, conversions, income)
                    VALUES (:user_id, CURRENT_DATE, 1, 0, 0)
                """),
                {"user_id": telegram_id}
            )

        conn.commit()

    links = {
        "adult":
        f"https://tone.affomelody.com/click?pid=12519&offer_id=25&sub1={partner_code}&sub2={click_id}",

        "mainstream":
        f"https://bringsomelove.com/m1xtn8p3?aid=xcPScZTVF&kid=TSYhTYVVY&sub1={partner_code}&sub2={partner_code}&sub3={click_id}",

        "webcam":
        f"https://hotplayhubs.me/q6ZyXz95?aid=xcPScZTVF&kid=TSYSxTFTx&sub1={partner_code}&sub2={partner_code}&sub3={click_id}",
        

        "adult-games":
        f"https://hotplayhubs.me/BTTfkJGq?aid=xcPScZTVF&kid=TSYPVxVYx&sub1={partner_code}&sub2={partner_code}&sub3={click_id}",

        "gaming":
        f"https://GAMING_LINK&sub1={partner_code}&sub2={click_id}",

        "utilities":
        f"https://UTILITIES_LINK&sub1={partner_code}&sub2={click_id}",
    }

    target_url = links.get(vertical)

    if not target_url:
        return {"success": False, "message": "Unknown vertical"}

    return RedirectResponse(url=target_url, status_code=302)


@app.get("/balance/{telegram_id}")
def get_balance(telegram_id: int):
    # On-demand, scoped, bounded release. Finish its transactions before reading balances.
    try:
        release_matured_holds(engine,limit=25,user_id=telegram_id)
    except RealFinanceDisabled:
        pass
    # Keep historical balance contract for the rest of Mini App, but expose
    # separate finance entitlement for the withdrawals page (never from balance).
    with engine.connect() as conn:
        user = conn.execute(text("""
            SELECT balance,hold,withdrawn
            FROM public.users WHERE telegram_id=:uid
        """), {"uid":telegram_id}).first()
        if not user:
            return {"success":False,"message":"User not found"}
        try:
            # A legacy-only DB has not received PR #23's additive schema yet.
            # Savepoint preserves the existing /balance contract without
            # masking unrelated SQL failures or treating old funds as real.
            with conn.begin_nested():
                finance = finance_balance_projection(conn, telegram_id, user.balance)
        except ProgrammingError as exc:
            if (getattr(exc.orig, "pgcode", None) != "42P01"
                    or "cpa_finance_epoch" not in str(exc.orig)):
                raise
            finance = {
                "real_withdrawable": 0.0,
                "real_finance_active": False,
                "real_finance_available": False,
            }
        hold = conn.execute(text("""SELECT COALESCE(SUM(l.hold_delta),0)
            FROM public.cpa_ledger l JOIN public.conversions v ON v.id=l.conversion_id
            JOIN public.cpa_finance_epoch e ON e.id=1
            WHERE l.user_id=:uid AND v.is_test=FALSE AND v.currency='USD'
              AND v.finance_eligible_at>=e.activated_at AND v.created_at>=e.activated_at
            """), {"uid":telegram_id}).scalar_one()
        paid = conn.execute(text("""SELECT COALESCE(SUM(w.amount),0)
            FROM public.withdrawals w JOIN public.cpa_finance_epoch e
              ON w.cpa_real_epoch_at=e.activated_at
            WHERE w.user_id=:uid AND w.status='paid' AND e.id=1
              AND w.id>e.legacy_max_withdrawal_id"""), {"uid":telegram_id}).scalar_one()
        return {"available":finance["real_withdrawable"], "hold":float(hold),
                "paid":float(paid), "historical_balance":float(user.balance), **finance}

@app.get("/referral/{telegram_id}")
def get_referral(telegram_id: int):

    with engine.connect() as conn:

        user = conn.execute(
            text("""
                SELECT
                    partner_code,
                    COALESCE(referral_balance,0) AS referral_balance,
                    COALESCE(referral_earned,0) AS referral_earned
                FROM users
                WHERE telegram_id = :telegram_id
            """),
            {
                "telegram_id": telegram_id
            }
        ).fetchone()

        if not user:
            return {
                "success": False,
                "message": "User not found"
            }

        invited = conn.execute(
            text("""
                SELECT COUNT(*)
                FROM users
                WHERE invited_by = :telegram_id
            """),
            {
                "telegram_id": telegram_id
            }
        ).scalar()

    return {
        "success": True,
        "referral_code": user.partner_code,
        "referral_link": f"https://t.me/vvd_cpa_bot?start={user.partner_code}",
        "balance": float(user.referral_balance),
        "earned": float(user.referral_earned),
        "invited": int(invited or 0)
    }
# Fail closed: legacy provider identity cannot be authenticated.
# Keep routes registered for integration diagnostics, but never execute wallet logic.
from fastapi import Depends

def _deny_unauthenticated_legacy_postback():
    raise HTTPException(status_code=403, detail="Legacy postback disabled: authenticated provider integration required")

@app.get("/postback/adult", dependencies=[Depends(_deny_unauthenticated_legacy_postback)])
async def postback_adult(
    partner_code: str,
    click_id: str = "",
    offer_id: str = "",
    offer_name: str = "",
    payout: float = 0,
    status: int = 0,
    transaction_id: str = "",
    date: str = "",
    geo: str = ""
):

    if not transaction_id:
        return {
            "success": False,
            "message": "transaction_id is required"
        }

    # Traforce:
    # 1 = Принято
    # 2 = В обработке
    # 3 = Отклонено
    # 5 = Холд
    if status not in (1, 2, 3, 5):
        return {
            "success": False,
            "message": f"Unknown Traforce status: {status}"
        }

    SERVICE_FEE_RATE = 0.20
    payout_gross = round(float(payout or 0), 2)
    service_fee = round(payout_gross * SERVICE_FEE_RATE, 2)
    payout_net = round(payout_gross - service_fee, 2)

    with engine.connect() as conn:

        user = conn.execute(
            text("""
                SELECT telegram_id
                FROM users
                WHERE partner_code = :partner_code
            """),
            {"partner_code": partner_code}
        ).fetchone()

        if not user:
            return {
                "success": False,
                "message": "Partner not found"
            }

        telegram_id = user.telegram_id

        existing = conn.execute(
            text("""
                SELECT id, status, payout_net
                FROM conversions
                WHERE transaction_id = :transaction_id
            """),
            {"transaction_id": transaction_id}
        ).fetchone()

        old_status = int(existing.status) if existing else 0
        old_payout_net = round(float(existing.payout_net or 0), 2) if existing else 0.0

        # Сколько старая версия конверсии занимала в HOLD/BALANCE
        old_hold_amount = old_payout_net if old_status == 5 else 0.0
        old_balance_amount = old_payout_net if old_status == 1 else 0.0

        # Сколько новая версия конверсии должна занимать в HOLD/BALANCE
        new_hold_amount = payout_net if status == 5 else 0.0
        new_balance_amount = payout_net if status == 1 else 0.0

        hold_delta = round(new_hold_amount - old_hold_amount, 2)
        balance_delta = round(new_balance_amount - old_balance_amount, 2)

        # В статистике доход и конверсия считаются только после status=1.
        old_confirmed_income = old_payout_net if old_status == 1 else 0.0
        new_confirmed_income = payout_net if status == 1 else 0.0

        conversion_delta = (
            (1 if status == 1 else 0)
            - (1 if old_status == 1 else 0)
        )
        income_delta = round(new_confirmed_income - old_confirmed_income, 2)

        if existing:
            conn.execute(
                text("""
                    UPDATE conversions
                    SET
                        user_id = :user_id,
                        click_id = :click_id,
                        offer_id = :offer_id,
                        payout_gross = :payout_gross,
                        payout_net = :payout_net,
                        status = :status
                    WHERE transaction_id = :transaction_id
                """),
                {
                    "user_id": telegram_id,
                    "click_id": click_id,
                    "offer_id": offer_id,
                    "payout_gross": payout_gross,
                    "payout_net": payout_net,
                    "status": str(status),
                    "transaction_id": transaction_id
                }
            )
        else:
            conn.execute(
                text("""
                    INSERT INTO conversions (
                        user_id,
                        click_id,
                        offer_id,
                        payout_gross,
                        payout_net,
                        status,
                        transaction_id,
                        created_at
                    )
                    VALUES (
                        :user_id,
                        :click_id,
                        :offer_id,
                        :payout_gross,
                        :payout_net,
                        :status,
                        :transaction_id,
                        NOW()
                    )
                """),
                {
                    "user_id": telegram_id,
                    "click_id": click_id,
                    "offer_id": offer_id,
                    "payout_gross": payout_gross,
                    "payout_net": payout_net,
                    "status": str(status),
                    "transaction_id": transaction_id
                }
            )

        # Главная финансовая логика.
        # Повторный одинаковый postback ничего второй раз не начислит.
        if hold_delta != 0 or balance_delta != 0:
            conn.execute(
                text("""
                    UPDATE users
                    SET
                        hold = GREATEST(0, COALESCE(hold, 0) + :hold_delta),
                        balance = GREATEST(0, COALESCE(balance, 0) + :balance_delta)
                    WHERE telegram_id = :user_id
                """),
                {
                    "user_id": telegram_id,
                    "hold_delta": hold_delta,
                    "balance_delta": balance_delta
                }
            )

        if conversion_delta != 0 or income_delta != 0:
            stats = conn.execute(
                text("""
                    SELECT id
                    FROM statistics
                    WHERE user_id = :user_id
                    AND date = CURRENT_DATE
                """),
                {"user_id": telegram_id}
            ).fetchone()

            if stats:
                conn.execute(
                    text("""
                        UPDATE statistics
                        SET
                            conversions = GREATEST(0, conversions + :conversion_delta),
                            income = GREATEST(0, income + :income_delta)
                        WHERE user_id = :user_id
                        AND date = CURRENT_DATE
                    """),
                    {
                        "user_id": telegram_id,
                        "conversion_delta": conversion_delta,
                        "income_delta": income_delta
                    }
                )
            else:
                conn.execute(
                    text("""
                        INSERT INTO statistics
                        (user_id, date, clicks, conversions, income)
                        VALUES
                        (:user_id, CURRENT_DATE, 0, :conversions, :income)
                    """),
                    {
                        "user_id": telegram_id,
                        "conversions": max(0, conversion_delta),
                        "income": max(0, income_delta)
                    }
                )

            geo_value = (geo or "").strip().upper()

            country_names = {
                "DE": "Германия",
                "LV": "Латвия",
                "LT": "Литва",
                "EE": "Эстония",
                "PL": "Польша",
                "FR": "Франция",
                "ES": "Испания",
                "IT": "Италия",
                "GB": "Великобритания",
                "UK": "Великобритания",
                "US": "США",
                "UA": "Украина",
                "KZ": "Казахстан",
                "GE": "Грузия"
            }
            country_name = country_names.get(geo_value, geo_value)

            if geo_value:
                country_stat = conn.execute(
                    text("""
                        SELECT country_code
                        FROM country_statistics
                        WHERE user_id = :user_id
                        AND date = CURRENT_DATE
                        AND (
                            UPPER(country_code) = UPPER(:geo)
                            OR LOWER(country_name) = LOWER(:geo)
                        )
                        LIMIT 1
                    """),
                    {
                        "user_id": telegram_id,
                        "geo": geo_value
                    }
                ).fetchone()

                if country_stat:
                    conn.execute(
                        text("""
                            UPDATE country_statistics
                            SET
                                conversions = GREATEST(0, conversions + :conversion_delta),
                                income = GREATEST(0, income + :income_delta)
                            WHERE user_id = :user_id
                            AND date = CURRENT_DATE
                            AND country_code = :country_code
                        """),
                        {
                            "user_id": telegram_id,
                            "country_code": country_stat.country_code,
                            "conversion_delta": conversion_delta,
                            "income_delta": income_delta
                        }
                    )
                elif status == 1:
                    conn.execute(
                        text("""
                            INSERT INTO country_statistics
                            (
                                user_id, country_code, country_name,
                                date, clicks, conversions, income
                            )
                            VALUES
                            (
                                :user_id, :country_code, :country_name,
                                CURRENT_DATE, 0, 1, :income
                            )
                        """),
                        {
                            "user_id": telegram_id,
                            "country_code": geo_value,
                            "country_name": country_name,
                            "income": payout_net
                        }
                    )
            if income_delta > 0:
                inviter = conn.execute(
                text("""
                    SELECT invited_by
                    FROM users
                    WHERE telegram_id = :telegram_id
                """),
                {
                    "telegram_id": telegram_id
                }
            ).fetchone()

                if inviter and inviter.invited_by:

                    referral_reward = round(income_delta * 0.05, 2)

                    conn.execute(
                    text("""
                        UPDATE users
                        SET
                            referral_balance =
                                COALESCE(referral_balance,0) + :reward,
                            referral_earned =
                                COALESCE(referral_earned,0) + :reward
                        WHERE telegram_id = :invited_by
                    """),
                    {
                        "reward": referral_reward,
                        "invited_by": inviter.invited_by
                    }
                )
        conn.commit()

    return {
        "success": True,
        "partner_code": partner_code,
        "telegram_id": telegram_id,
        "click_id": click_id,
        "offer_id": offer_id,
        "offer_name": offer_name,
        "payout": payout_gross,
        "payout_gross": payout_gross,
        "service_fee": service_fee,
        "payout_net": payout_net,
        "status": status,
        "transaction_id": transaction_id,
        "date": date,
        "geo": geo,
        "old_status": old_status,
        "hold_delta": hold_delta,
        "balance_delta": balance_delta,
        "conversion_delta": conversion_delta,
        "income_delta": income_delta
    }


@app.get("/postback/traffcore", dependencies=[Depends(_deny_unauthenticated_legacy_postback)])
async def postback_traffcore(
    sub2: str = "",
    sub3: str = "",
    click_id: str = "",
    sum: float = 0,
    goal: str = "",
    geo: str = "",
    transaction_id: str = ""
):
    partner_code = (sub2 or "").strip().upper()
    internal_click_id = (sub3 or "").strip()
    traffcore_click_id = (click_id or "").strip()
    payout_gross = round(float(sum or 0), 2)

    if not partner_code:
        return {"success": False, "message": "sub2 partner_code is required"}

    if payout_gross <= 0:
        return {"success": False, "message": "sum must be greater than 0"}

    source_transaction_id = (
        (transaction_id or "").strip()
        or traffcore_click_id
        or internal_click_id
    )

    if not source_transaction_id:
        return {
            "success": False,
            "message": "transaction_id, click_id or sub3 is required"
        }

    conversion_id = f"traffcore:{source_transaction_id}"
    SERVICE_FEE_RATE = 0.20
    service_fee = round(payout_gross * SERVICE_FEE_RATE, 2)
    payout_net = round(payout_gross - service_fee, 2)

    with engine.begin() as conn:
        user = conn.execute(
            text("""
                SELECT telegram_id
                FROM users
                WHERE partner_code = :partner_code
                FOR UPDATE
            """),
            {"partner_code": partner_code}
        ).fetchone()

        if not user:
            return {"success": False, "message": "Partner not found"}

        telegram_id = user.telegram_id

        existing = conn.execute(
            text("""
                SELECT id
                FROM conversions
                WHERE transaction_id = :transaction_id
            """),
            {"transaction_id": conversion_id}
        ).fetchone()

        if existing:
            return {
                "success": True,
                "duplicate": True,
                "message": "Conversion already processed",
                "partner_code": partner_code,
                "transaction_id": conversion_id
            }

        conn.execute(
            text("""
                INSERT INTO conversions (
                    user_id, click_id, offer_id,
                    payout_gross, payout_net, status,
                    transaction_id, created_at
                )
                VALUES (
                    :user_id, :click_id, :offer_id,
                    :payout_gross, :payout_net, '1',
                    :transaction_id, NOW()
                )
            """),
            {
                "user_id": telegram_id,
                "click_id": internal_click_id or traffcore_click_id,
                "offer_id": goal,
                "payout_gross": payout_gross,
                "payout_net": payout_net,
                "transaction_id": conversion_id
            }
        )

        conn.execute(
            text("""
                UPDATE users
                SET balance = COALESCE(balance, 0) + :payout_net
                WHERE partner_code = :partner_code
            """),
            {"payout_net": payout_net, "partner_code": partner_code}
        )

        stats = conn.execute(
            text("""
                SELECT id FROM statistics
                WHERE user_id = :user_id AND date = CURRENT_DATE
            """),
            {"user_id": telegram_id}
        ).fetchone()

        if stats:
            conn.execute(
                text("""
                    UPDATE statistics
                    SET conversions = conversions + 1,
                        income = income + :payout_net
                    WHERE user_id = :user_id AND date = CURRENT_DATE
                """),
                {"user_id": telegram_id, "payout_net": payout_net}
            )
        else:
            conn.execute(
                text("""
                    INSERT INTO statistics
                    (user_id, date, clicks, conversions, income)
                    VALUES (:user_id, CURRENT_DATE, 0, 1, :payout_net)
                """),
                {"user_id": telegram_id, "payout_net": payout_net}
            )

        geo_value = (geo or "").strip().upper()

        if geo_value:
            country_stat = conn.execute(
                text("""
                    SELECT country_code
                    FROM country_statistics
                    WHERE user_id = :user_id
                    AND date = CURRENT_DATE
                    AND UPPER(country_code) = UPPER(:geo)
                    LIMIT 1
                """),
                {"user_id": telegram_id, "geo": geo_value}
            ).fetchone()

            if country_stat:
                conn.execute(
                    text("""
                        UPDATE country_statistics
                        SET conversions = conversions + 1,
                            income = income + :payout_net
                        WHERE user_id = :user_id
                        AND date = CURRENT_DATE
                        AND country_code = :country_code
                    """),
                    {
                        "user_id": telegram_id,
                        "country_code": country_stat.country_code,
                        "payout_net": payout_net
                    }
                )
            else:
                conn.execute(
                    text("""
                        INSERT INTO country_statistics
                        (
                            user_id, country_code, country_name,
                            date, clicks, conversions, income
                        )
                        VALUES
                        (
                            :user_id, :country_code, :country_name,
                            CURRENT_DATE, 0, 1, :payout_net
                        )
                    """),
                    {
                        "user_id": telegram_id,
                        "country_code": geo_value,
                        "country_name": geo_value,
                        "payout_net": payout_net
                    }
                )

    return {
        "success": True,
        "network": "traffcore",
        "partner_code": partner_code,
        "telegram_id": telegram_id,
        "click_id": traffcore_click_id,
        "internal_click_id": internal_click_id,
        "goal": goal,
        "geo": geo,
        "payout_gross": payout_gross,
        "service_fee": service_fee,
        "payout_net": payout_net,
        "status": 1,
        "transaction_id": conversion_id,
        "credited_to": "balance"
    }


# Stage 6: authenticated read-only analytics; existing URLs retained for Mini App.
# Aggregates are computed from clicks, conversions and CPA ledger without
# folding legacy demo income into real CPA figures.
@app.get("/chat/banner")
def get_chat_banner():
    with engine.connect() as conn:
        banner = conn.execute(
            text("""
                SELECT
                    id,
                    title,
                    text,
                    button_text,
                    button_url,
                    is_active,
                    updated_at
                FROM chat_banner
                WHERE is_active = TRUE
                ORDER BY updated_at DESC
                LIMIT 1
            """)
        ).fetchone()

    if not banner:
        return {
            "success": True,
            "banner": None
        }

    return {
        "success": True,
        "banner": {
            "id": banner.id,
            "title": banner.title,
            "text": banner.text,
            "button_text": banner.button_text or "",
            "button_url": banner.button_url or "",
            "is_active": bool(banner.is_active)
        }
    }


@app.post("/admin/chat/banner")
async def update_chat_banner(payload: dict):
    title = str(payload.get("title") or "").strip()
    banner_text = str(payload.get("text") or "").strip()
    button_text = str(payload.get("button_text") or "").strip()
    button_url = str(payload.get("button_url") or "").strip()
    is_active = bool(payload.get("is_active", True))

    if not title:
        return {
            "success": False,
            "message": "title is required"
        }

    with engine.begin() as conn:
        banner = conn.execute(
            text("""
                SELECT id
                FROM chat_banner
                ORDER BY updated_at DESC
                LIMIT 1
            """)
        ).fetchone()

        if banner:
            conn.execute(
                text("""
                    UPDATE chat_banner
                    SET title = :title,
                        text = :banner_text,
                        button_text = :button_text,
                        button_url = :button_url,
                        is_active = :is_active,
                        updated_at = NOW()
                    WHERE id = :id
                """),
                {
                    "id": banner.id,
                    "title": title,
                    "banner_text": banner_text,
                    "button_text": button_text,
                    "button_url": button_url,
                    "is_active": is_active
                }
            )
        else:
            conn.execute(
                text("""
                    INSERT INTO chat_banner (
                        title,
                        text,
                        button_text,
                        button_url,
                        is_active
                    )
                    VALUES (
                        :title,
                        :banner_text,
                        :button_text,
                        :button_url,
                        :is_active
                    )
                """),
                {
                    "title": title,
                    "banner_text": banner_text,
                    "button_text": button_text,
                    "button_url": button_url,
                    "is_active": is_active
                }
            )

    return {
        "success": True
    }

@app.get("/admin/finance")
def admin_finance():

    from cpa_analytics import summarize, arguments
    with engine.connect() as conn:
        report = summarize(conn, None, arguments("all", None, None, None, None, None), admin=True)
    finance = report["finance"]
    return {"success": True, "gross_income": finance["gross"],
            "partner_income": finance["partner"], "service_income": finance["fee"],
            "service_fee_percent": 20}


@app.get("/admin/users")
def admin_users():

    from cpa_analytics import CONVERSION_ROWS, arguments
    params = {**arguments("all", None, None, None, None, None), "uid": None}
    with engine.connect() as conn:
        rows = conn.execute(text("""
            WITH clicks AS (SELECT user_id,count(*) AS clicks FROM public.clicks GROUP BY user_id),
            conversions AS (""" + CONVERSION_ROWS + """),
            counts AS (SELECT user_id,count(*) FILTER (
                WHERE NOT is_test AND normalized_status IN ('pending','approved','rejected')) AS conversions
                FROM conversions GROUP BY user_id),
            earnings AS (SELECT v.user_id,sum(CASE
                WHEN l.operation_type IN ('hold_credit','hold_reversal') THEN l.hold_delta
                WHEN l.operation_type='balance_reversal' THEN l.balance_delta ELSE 0 END) AS income
                FROM conversions v JOIN public.cpa_ledger l ON l.conversion_id=v.id
                WHERE v.is_real GROUP BY v.user_id)
            SELECT u.telegram_id,u.partner_code,u.first_name,u.last_name,u.username,u.status,
                coalesce(k.clicks,0) AS clicks,coalesce(c.conversions,0) AS conversions,
                coalesce(f.income,0) AS income
            FROM public.users u LEFT JOIN clicks k ON k.user_id=u.telegram_id
            LEFT JOIN counts c ON c.user_id=u.telegram_id
            LEFT JOIN earnings f ON f.user_id=u.telegram_id
            ORDER BY income DESC,clicks DESC,u.telegram_id
        """), params).mappings().all()
    return {"success": True, "users": [{**dict(r), "income":float(r["income"]),
        "cr":round(100*r["conversions"]/r["clicks"],2) if r["clicks"] else 0.0} for r in rows]}


# ==================== ADMIN CPA HOLD RELEASE ====================
# Every route is also protected by signed Telegram initData middleware.
# Verify the actor again here, never accept an admin ID from the request body.
class CPAReceiptRequest(BaseModel):
    conversion_id: str
    settlement_reference: str
    verification_source: str
    evidence_reference: str
    received_gross: str
    received_at: str

class CPAManualReleaseRequest(BaseModel):
    conversion_id: str
    amount: str
    reason: str
    request_id: str

def _cpa_admin_actor(request: Request) -> int:
    from stars_payments import TelegramAuthError
    try:
        uid=verified_telegram_id(request.headers.get("X-Telegram-Init-Data",""))
    except TelegramAuthError as exc:
        raise HTTPException(401,"Signed Telegram admin session required") from exc
    if not authorized_admin(uid):
        raise HTTPException(403,"Administrator access required")
    return uid

@app.get("/admin/cpa/partners/{partner_code}/hold")
def cpa_partner_hold(partner_code: str, request: Request):
    _cpa_admin_actor(request)
    try:
        return {"success":True,**read_partner_hold(engine,partner_code)}
    except ManualReleaseDenied as exc:
        raise HTTPException(409,str(exc)) from exc

@app.post("/admin/cpa/partners/{partner_code}/receipts")
async def cpa_verify_receipt(partner_code: str, data: CPAReceiptRequest, request: Request):
    admin_uid=_cpa_admin_actor(request)
    try:
        return record_verified_receipt(
            engine,partner_code=partner_code,conversion_id=data.conversion_id,
            settlement_reference=data.settlement_reference,
            verification_source=data.verification_source,
            evidence_reference=data.evidence_reference,
            received_gross=data.received_gross,received_at=data.received_at,
            admin_uid=admin_uid)
    except (ManualReleaseDenied,ValueError) as exc:
        raise HTTPException(409,str(exc)) from exc

@app.post("/admin/cpa/partners/{partner_code}/release")
async def cpa_release_hold(partner_code: str, data: CPAManualReleaseRequest, request: Request):
    admin_uid=_cpa_admin_actor(request)
    try:
        return manual_release(engine,partner_code=partner_code,
            conversion_id=data.conversion_id,amount=data.amount,
            reason=data.reason,request_id=data.request_id,admin_uid=admin_uid)
    except (ManualReleaseDenied,ValueError) as exc:
        raise HTTPException(409,str(exc)) from exc

# ==================== CPA FINANCIAL CORRECTIONS ====================
class CPADisputeRequest(BaseModel):
    case_reference: str
    reason: str
    evidence_reference: str

class CPACancellationRequest(BaseModel):
    case_reference: str
    evidence_reference: str

@app.post("/admin/cpa/conversions/{conversion_id}/dispute")
async def cpa_open_dispute(conversion_id: str, data: CPADisputeRequest, request: Request):
    admin_uid=_cpa_admin_actor(request)
    try:
        return register_dispute(engine,conversion_id=conversion_id,
          case_reference=data.case_reference,reason=data.reason,
          evidence_reference=data.evidence_reference,admin_uid=admin_uid)
    except (ManualReleaseDenied,ValueError) as exc:
        raise HTTPException(409,str(exc)) from exc

@app.post("/admin/cpa/conversions/{conversion_id}/cancel")
async def cpa_confirm_cancellation(conversion_id: str, data: CPACancellationRequest, request: Request):
    admin_uid=_cpa_admin_actor(request)
    try:
        return confirm_cancellation(engine,conversion_id=conversion_id,
          case_reference=data.case_reference,evidence_reference=data.evidence_reference,
          admin_uid=admin_uid)
    except (ManualReleaseDenied,ValueError) as exc:
        raise HTTPException(409,str(exc)) from exc

# ==================== WITHDRAWALS ====================

@app.post("/withdrawals")
async def create_withdrawal(data: WithdrawalRequest):
    return create_real_withdrawal(
        engine, partner_code=data.partner_code.strip(),
        amount=data.amount, payment_method=data.payment_method.strip(),
        wallet=data.wallet.strip(),request_id=data.request_id,
    )

@app.get("/withdrawals/{partner_code}")
def get_withdrawals(partner_code: str):

    with engine.connect() as conn:

        user = conn.execute(
            text("""
                SELECT telegram_id
                FROM users
                WHERE partner_code = :partner_code
            """),
            {
                "partner_code": partner_code
            }
        ).fetchone()

        if not user:
            return {
                "success": False,
                "message": "Partner not found"
            }

        rows = conn.execute(
            text("""
                SELECT
                    id,
                    partner_code,
                    amount,
                    payment_method,
                    wallet,
                    status,
                    created_at,
                    processed_at,
                    cpa_real_epoch_at,cpa_request_id
                FROM withdrawals
                WHERE partner_code = :partner_code
                ORDER BY created_at DESC
            """),
            {
                "partner_code": partner_code
            }
        ).fetchall()

    return {
        "success": True,
        "withdrawals": [
            {
                "id": int(r.id),
                "partner_code": r.partner_code,
                "amount": float(r.amount),
                "payment_method": r.payment_method,
                "wallet": r.wallet,
                "status": r.status,
                "is_real_finance": r.cpa_real_epoch_at is not None,
                "created_at": str(r.created_at),
                "processed_at": str(r.processed_at) if r.processed_at else None
            }
            for r in rows
        ]
    }


@app.get("/admin/withdrawals")
def admin_withdrawals(status: str | None = None):
    with engine.connect() as conn:
        rows = conn.execute(text("""
            SELECT w.id, w.user_id, w.amount, w.payment_method,
                   w.wallet, w.status, w.created_at, w.processed_at,
                   w.cpa_real_epoch_at,p.external_transfer_id,
                   p.evidence_reference AS transfer_evidence,
                   p.transferred_at,
                   u.partner_code, u.first_name, u.last_name, u.username
            FROM withdrawals w
            LEFT JOIN public.cpa_payout_proofs p ON p.withdrawal_id=w.id
            LEFT JOIN users u ON u.telegram_id = w.user_id
            WHERE (:status IS NULL OR w.status = :status)
            ORDER BY CASE WHEN w.status = 'pending' THEN 0 ELSE 1 END,
                     w.created_at ASC
        """), {"status": status}).fetchall()

    return {
        "success": True,
        "withdrawals": [{
            "id": int(r.id),
            "telegram_id": int(r.user_id),
            "partner_code": r.partner_code,
            "first_name": r.first_name,
            "last_name": r.last_name,
            "username": r.username,
            "amount": float(r.amount or 0),
            "payment_method": r.payment_method,
            "wallet": r.wallet,
            "status": r.status,
            "is_real_finance": r.cpa_real_epoch_at is not None,
            "external_transfer_id": r.external_transfer_id,
            "transfer_evidence": r.transfer_evidence,
            "transferred_at": str(r.transferred_at) if r.transferred_at else None,
            "created_at": str(r.created_at),
            "processed_at": str(r.processed_at) if r.processed_at else None
        } for r in rows]
    }


async def send_partner_notification(telegram_id: int, message: str):
    bot_token = os.getenv("BOT_TOKEN")

    if not bot_token:
        print("BOT_TOKEN not found. Telegram notification skipped.")
        return

    try:
        url = f"https://api.telegram.org/bot{bot_token}/sendMessage"
        payload = json.dumps({
            "chat_id": telegram_id,
            "text": message,
            "parse_mode": "HTML"
        }).encode("utf-8")

        request = urllib.request.Request(
            url,
            data=payload,
            headers={"Content-Type": "application/json"},
            method="POST"
        )

        await asyncio.to_thread(urllib.request.urlopen, request, timeout=10)
    except Exception as error:
        print("Telegram notification error:", error)


class CPAExternalTransferProof(BaseModel):
    confirmed_manual: bool = False
    external_transfer_id: str | None = None
    evidence_reference: str | None = None
    transferred_at: str | None = None

@app.post("/admin/withdrawals/{withdrawal_id}/paid")
async def mark_withdrawal_paid(withdrawal_id: int, data: CPAExternalTransferProof, request: Request):
    admin_uid=_cpa_admin_actor(request)
    result = mark_real_paid(engine, withdrawal_id,
        admin_uid=admin_uid,transfer_reference=data.external_transfer_id,
        evidence_reference=data.evidence_reference,transferred_at=data.transferred_at,
        confirmed_manual=data.confirmed_manual)
    if not result["success"]:
        return result
    await send_partner_notification(
        result["user_id"],
        "💸 <b>Выплата подтверждена</b>\n\n"
        + "Сумма: <b>$" + format(result["amount"], ".2f") + "</b>\n"
        + "Метод: <b>" + result["payment_method"] + "</b>\n"
        + "Статус: <b>Выплачено ✅</b>",
    )
    return {"success": True, "withdrawal_id": withdrawal_id,
            "status": "paid", "amount": result["amount"]}


@app.post("/admin/withdrawals/{withdrawal_id}/reject")
async def reject_withdrawal(withdrawal_id: int):
    result = mark_real_rejected(engine, withdrawal_id)
    if not result["success"]:
        return result
    await send_partner_notification(
        result["user_id"],
        "❌ <b>Заявка на выплату отклонена</b>\n\n"
        + "Сумма: <b>$" + format(result["amount"], ".2f") + "</b>\n"
        + "Средства возвращены на ваш баланс.",
    )
    return {"success": True, "withdrawal_id": withdrawal_id,
            "status": "rejected", "amount_returned": result["amount"]}


@app.post("/chat/messages")
async def create_chat_message(payload: dict):
    sender_id = str(payload.get("sender_id") or "").strip()
    sender_name = str(payload.get("sender_name") or "Партнёр").strip()
    avatar_url = payload.get("avatar_url")
    message_text = str(payload.get("text") or "").strip()

    if not sender_id:
        return {
            "success": False,
            "message": "sender_id is required"
        }

    if not message_text:
        return {
            "success": False,
            "message": "text is required"
        }

    with engine.connect() as conn:

        banned = conn.execute(
            text("""
                SELECT telegram_id
                FROM chat_bans
                WHERE telegram_id = :telegram_id
                LIMIT 1
            """),
            {
                "telegram_id": int(sender_id)
            }
        ).fetchone()

        if banned and sender_id != ADMIN_TELEGRAM_ID:
            return {
                "success": False,
                "banned": True,
                "message": "Доступ к чату ограничен модерацией"
            }

    with engine.begin() as conn:

        row = conn.execute(
            text("""
                INSERT INTO chat_messages
                (
                    sender_id,
                    sender_name,
                    avatar_url,
                    text,
                    reactions,
                    is_staff
                )
                VALUES
                (
                    :sender_id,
                    :sender_name,
                    :avatar_url,
                    :text,
                    '{}'::jsonb,
                    :is_staff
                )
                RETURNING
                    id,
                    sender_id,
                    sender_name,
                    avatar_url,
                    text,
                    reactions,
                    created_at,
                    is_staff
            """),
            {
                "sender_id": int(sender_id),
                "sender_name": sender_name,
                "avatar_url": avatar_url,
                "text": message_text,
                "is_staff": sender_id == ADMIN_TELEGRAM_ID
            }
        ).fetchone()

    return {
        "success": True,
        "message": {
            "id": str(row.id),
            "sender_id": str(row.sender_id),
            "sender_name": row.sender_name,
            "avatar_url": row.avatar_url,
            "text": row.text,
            "reactions": row.reactions or {},
            "created_at": str(row.created_at),
            "is_staff": bool(row.is_staff)
        }
    }

@app.get("/chat/messages")
def get_chat_messages():
    with engine.connect() as conn:
        rows = conn.execute(
            text("""
                SELECT
                    id,
                    sender_id,
                    sender_name,
                    avatar_url,
                    text,
                    reactions,
                    created_at,
                    is_staff
                FROM chat_messages
                ORDER BY created_at ASC
                LIMIT 500
            """)
        ).fetchall()

    return {
        "success": True,
        "messages": [
            {
                "id": str(row.id),
                "sender_id": str(row.sender_id),
                "sender_name": row.sender_name,
                "avatar_url": row.avatar_url,
                "text": row.text,
                "reactions": row.reactions or {},
                "created_at": str(row.created_at),
                "is_staff": bool(row.is_staff),
            }
            for row in rows
        ]
    }
    
ADMIN_TELEGRAM_ID = "232682307"

@app.post("/chat/online")
def chat_online(data: dict):
    telegram_id = int(data["telegram_id"])

    with engine.begin() as conn:
        conn.execute(text("""
            INSERT INTO public.chat_online (telegram_id,last_seen)
            VALUES (:uid,NOW())
            ON CONFLICT (telegram_id) DO UPDATE SET last_seen=NOW()
        """), {"uid": telegram_id})

    return {
        "success": True
    }


@app.get("/chat/online-count")
def chat_online_count():
    with engine.connect() as conn:
        count = conn.execute(
            text("""
                SELECT COUNT(DISTINCT telegram_id)
                FROM chat_online
                WHERE last_seen > NOW() - INTERVAL '30 seconds'
            """)
        ).scalar()

    return {
        "success": True,
        "online": count or 0
    }

@app.post("/admin/chat/delete-message")
async def admin_delete_chat_message(payload: dict):
    admin_id = str(payload.get("admin_id") or "").strip()
    message_id = str(payload.get("message_id") or "").strip()

    if admin_id != ADMIN_TELEGRAM_ID:
        return {
            "success": False,
            "message": "Access denied"
        }

    if not message_id:
        return {
            "success": False,
            "message": "message_id is required"
        }

    with engine.begin() as conn:
        conn.execute(
            text("""
                DELETE FROM chat_messages
                WHERE id = :message_id
            """),
            {
                "message_id": message_id
            }
        )

    return {
        "success": True
    }


@app.post("/admin/chat/ban")
async def admin_ban_chat_user(payload: dict):
    admin_id = str(payload.get("admin_id") or "").strip()
    telegram_id = str(payload.get("telegram_id") or "").strip()
    user_name = str(payload.get("user_name") or "Партнёр").strip()

    if admin_id != ADMIN_TELEGRAM_ID:
        return {
            "success": False,
            "message": "Access denied"
        }

    if not telegram_id:
        return {
            "success": False,
            "message": "telegram_id is required"
        }

    if telegram_id == ADMIN_TELEGRAM_ID:
        return {
            "success": False,
            "message": "Admin cannot be banned"
        }

    with engine.begin() as conn:
        conn.execute(
            text("""
                INSERT INTO chat_bans (
                    telegram_id,
                    user_name,
                    banned_by
                )
                VALUES (
                    :telegram_id,
                    :user_name,
                    :banned_by
                )
                ON CONFLICT (telegram_id)
                DO UPDATE SET
                    user_name = EXCLUDED.user_name,
                    banned_by = EXCLUDED.banned_by
            """),
            {
                "telegram_id": int(telegram_id),
                "user_name": user_name,
                "banned_by": int(admin_id),
            }
        )

    return {
        "success": True
    }


@app.post("/admin/chat/unban")
async def admin_unban_chat_user(payload: dict):
    admin_id = str(payload.get("admin_id") or "").strip()
    telegram_id = str(payload.get("telegram_id") or "").strip()

    if admin_id != ADMIN_TELEGRAM_ID:
        return {
            "success": False,
            "message": "Access denied"
        }

    with engine.begin() as conn:
        conn.execute(
            text("""
                DELETE FROM chat_bans
                WHERE telegram_id = :telegram_id
            """),
            {
                "telegram_id": int(telegram_id)
            }
        )

    return {
        "success": True
    }


@app.get("/admin/chat/bans")
async def admin_chat_bans():
    with engine.connect() as conn:
        rows = conn.execute(
            text("""
                SELECT
                    telegram_id,
                    user_name,
                    banned_by,
                    created_at
                FROM chat_bans
                ORDER BY created_at DESC
            """)
        ).fetchall()

    return {
        "success": True,
        "bans": [
            {
                "telegram_id": str(row.telegram_id),
                "user_name": row.user_name,
                "banned_by": str(row.banned_by),
                "created_at": str(row.created_at),
            }
            for row in rows
        ]
    }
