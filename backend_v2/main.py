from fastapi import FastAPI, Request
from fastapi.responses import RedirectResponse
from fastapi.middleware.cors import CORSMiddleware
from pydantic import BaseModel
from sqlalchemy import text
from database import check_database, save_user, engine
from datetime import datetime, timedelta
from database import supabase

import json
import urllib.request
import uuid
import asyncio
import os
from bot import start_bot

app = FastAPI(
    title="VVD CPA Backend V2",
    version="2.0"
)
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
        
class TelegramUser(BaseModel):
    telegram_id: int
    first_name: str
    last_name: str | None = None
    username: str | None = None
    photo_url: str | None = None


class WithdrawalRequest(BaseModel):
    partner_code: str
    amount: float
    payment_method: str
    wallet: str


@app.post("/auth")
async def auth(user: TelegramUser):
    save_user(
        telegram_id=user.telegram_id,
        first_name=user.first_name,
        last_name=user.last_name,
        username=user.username,
        photo_url=user.photo_url,
    )
    
    return {
        "access_token": "telegram_auth",
        "token_type": "bearer",
        "user": {
            "telegram_id": user.telegram_id,
            "first_name": user.first_name,
            "last_name": user.last_name,
            "username": user.username,
            "photo_url": user.photo_url,
            "role": "user",
            "status": "active"
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
async def get_balance(telegram_id: int):

    with engine.connect() as conn:

        user = conn.execute(
            text("""
                SELECT
                    balance,
                    hold,
                    withdrawn
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

    return {
        "available": float(user.balance),
        "hold": float(user.hold),
        "paid": float(user.withdrawn)
    }
    
@app.get("/postback/adult")
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


@app.get("/postback/traffcore")
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


@app.get("/statistics/{telegram_id}")
async def get_statistics(
    telegram_id: int,
    vertical: str | None = None
):
    with engine.connect() as conn:

        query = """
            SELECT
                DATE(c.created_at) AS date,
                COUNT(DISTINCT c.click_id) AS clicks,
                COUNT(DISTINCT cv.id) AS conversions,
                COALESCE(SUM(cv.payout_net), 0) AS income
            FROM clicks c
            LEFT JOIN conversions cv
                ON cv.click_id = c.click_id
                AND cv.user_id = c.user_id
                AND cv.status = '1'
            WHERE c.user_id = :telegram_id
        """

        params = {
            "telegram_id": telegram_id
        }

        if vertical:
            query += " AND c.vertical = :vertical"
            params["vertical"] = vertical

        query += """
            GROUP BY DATE(c.created_at)
            ORDER BY DATE(c.created_at) ASC
        """

        rows = conn.execute(
            text(query),
            params
        ).fetchall()

        statistics = []

        for row in rows:
            statistics.append({
                "date": str(row.date),
                "clicks": int(row.clicks or 0),
                "conversions": int(row.conversions or 0),
                "income": float(row.income or 0)
            })

        return {
            "success": True,
            "vertical": vertical or "all",
            "statistics": statistics
        }
@app.get("/statistics/{telegram_id}/countries")
async def get_country_statistics(
    telegram_id: int,
    vertical: str | None = None
):

    with engine.connect() as conn:

        query = """
            SELECT
                c.country_code,
                c.country_name,
                COUNT(DISTINCT c.click_id) AS clicks,
                COUNT(DISTINCT CASE
                    WHEN CAST(cv.status AS TEXT) = '1'
                    THEN cv.id
                END) AS conversions,
                COALESCE(SUM(
                    CASE
                        WHEN CAST(cv.status AS TEXT) = '1'
                        THEN cv.payout_net
                        ELSE 0
                    END
                ), 0) AS income
            FROM clicks c
            LEFT JOIN conversions cv
                ON cv.click_id = c.click_id
            WHERE c.user_id = :telegram_id
        """

        params = {
            "telegram_id": telegram_id
        }

        if vertical:
            query += " AND c.vertical = :vertical"
            params["vertical"] = vertical

        query += """
            GROUP BY c.country_code, c.country_name
            ORDER BY income DESC
        """

        countries = conn.execute(
            text(query),
            params
        ).fetchall()

    return {
        "success": True,
        "vertical": vertical or "all",
        "countries": [
            {
                "country_code": row.country_code,
                "country_name": row.country_name,
                "clicks": int(row.clicks or 0),
                "conversions": int(row.conversions or 0),
                "income": float(row.income or 0)
            }
            for row in countries
        ]
    }
@app.get("/chat/banner")
async def get_chat_banner():
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
async def admin_finance():

    with engine.connect() as conn:
        finance = conn.execute(
            text("""
                SELECT
                    COALESCE(SUM(
                        CASE WHEN CAST(status AS TEXT) = '1'
                        THEN payout_gross ELSE 0 END
                    ), 0) AS gross_income,
                    COALESCE(SUM(
                        CASE WHEN CAST(status AS TEXT) = '1'
                        THEN payout_net ELSE 0 END
                    ), 0) AS partner_income
                FROM conversions
            """)
        ).fetchone()

    gross_income = round(float(finance.gross_income or 0), 2)
    partner_income = round(float(finance.partner_income or 0), 2)
    service_income = round(gross_income - partner_income, 2)

    return {
        "success": True,
        "gross_income": gross_income,
        "partner_income": partner_income,
        "service_income": service_income,
        "service_fee_percent": 20
    }


@app.get("/admin/users")
async def admin_users():

    with engine.connect() as conn:

        users = conn.execute(
            text("""
                SELECT
                    u.telegram_id,
                    u.partner_code,
                    u.first_name,
                    u.last_name,
                    u.username,
                    u.status,
                    COALESCE(SUM(s.clicks), 0) AS clicks,
                    COALESCE(SUM(s.conversions), 0) AS conversions,
                    COALESCE(SUM(s.income), 0) AS income
                FROM users u
                LEFT JOIN statistics s
                    ON s.user_id = u.telegram_id
                GROUP BY
                    u.telegram_id,
                    u.partner_code,
                    u.first_name,
                    u.last_name,
                    u.username,
                    u.status
                ORDER BY income DESC, clicks DESC
            """)
        ).fetchall()

    return {
        "success": True,
        "users": [
            {
                "telegram_id": int(row.telegram_id),
                "partner_code": row.partner_code,
                "first_name": row.first_name,
                "last_name": row.last_name,
                "username": row.username,
                "status": row.status,
                "clicks": int(row.clicks or 0),
                "conversions": int(row.conversions or 0),
                "income": float(row.income or 0),
                "cr": round(
                    (int(row.conversions or 0) / int(row.clicks or 0)) * 100,
                    2
                ) if int(row.clicks or 0) > 0 else 0
            }
            for row in users
        ]
    }

# ==================== WITHDRAWALS ====================

@app.post("/withdrawals")
async def create_withdrawal(data: WithdrawalRequest):
    amount = round(float(data.amount or 0), 2)
    partner_code = data.partner_code.strip()
    method = data.payment_method.strip()
    wallet = data.wallet.strip()

    if amount < 50:
        return {
            "success": False,
            "message": "Minimum withdrawal amount is $50"
        }

    if not partner_code:
        return {
            "success": False,
            "message": "Partner code is required"
        }

    if not method or not wallet:
        return {
            "success": False,
            "message": "Payment method and wallet are required"
        }

    with engine.begin() as conn:
        user = conn.execute(
            text("""
                SELECT telegram_id, partner_code, balance
                FROM users
                WHERE partner_code = :partner_code
                FOR UPDATE
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

        available = round(float(user.balance or 0), 2)

        if amount > available:
            return {
                "success": False,
                "message": "Insufficient available balance",
                "available": available
            }

        row = conn.execute(
            text("""
                INSERT INTO withdrawals
                (
                    user_id,
                    partner_code,
                    amount,
                    payment_method,
                    wallet,
                    status,
                    created_at
                )
                VALUES
                (
                    :user_id,
                    :partner_code,
                    :amount,
                    :method,
                    :wallet,
                    'pending',
                    NOW()
                )
                RETURNING id, created_at
            """),
            {
                "user_id": user.telegram_id,
                "partner_code": user.partner_code,
                "amount": amount,
                "method": method,
                "wallet": wallet
            }
        ).fetchone()

        conn.execute(
            text("""
                UPDATE users
                SET balance = balance - :amount
                WHERE partner_code = :partner_code
            """),
            {
                "amount": amount,
                "partner_code": partner_code
            }
        )

    return {
        "success": True,
        "withdrawal_id": int(row.id),
        "partner_code": partner_code,
        "amount": amount,
        "status": "pending",
        "created_at": str(row.created_at)
    }


@app.get("/withdrawals/{partner_code}")
async def get_withdrawals(partner_code: str):

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
                    processed_at
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
                "created_at": str(r.created_at),
                "processed_at": str(r.processed_at) if r.processed_at else None
            }
            for r in rows
        ]
    }


@app.get("/admin/withdrawals")
async def admin_withdrawals(status: str | None = None):
    with engine.connect() as conn:
        rows = conn.execute(text("""
            SELECT w.id, w.user_id, w.amount, w.payment_method,
                   w.wallet, w.status, w.created_at, w.processed_at,
                   u.partner_code, u.first_name, u.last_name, u.username
            FROM withdrawals w
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


@app.post("/admin/withdrawals/{withdrawal_id}/paid")
async def mark_withdrawal_paid(withdrawal_id: int):
    with engine.begin() as conn:
        row = conn.execute(text("""
            SELECT id, user_id, amount, payment_method, status
            FROM withdrawals WHERE id = :id FOR UPDATE
        """), {"id": withdrawal_id}).fetchone()

        if not row:
            return {"success": False, "message": "Withdrawal not found"}
        if row.status != "pending":
            return {"success": False, "message": f"Already processed: {row.status}"}

        conn.execute(text("""
            UPDATE withdrawals
            SET status = 'paid', processed_at = NOW()
            WHERE id = :id
        """), {"id": withdrawal_id})

        conn.execute(text("""
            UPDATE users
            SET withdrawn = COALESCE(withdrawn, 0) + :amount
            WHERE telegram_id = :uid
        """), {"amount": row.amount, "uid": row.user_id})

    await send_partner_notification(
        int(row.user_id),
        (
            "💸 <b>Выплата подтверждена</b>\n\n"
            f"Сумма: <b>${float(row.amount or 0):.2f}</b>\n"
            f"Метод: <b>{row.payment_method}</b>\n"
            "Статус: <b>Выплачено ✅</b>"
        )
    )

    return {"success": True, "withdrawal_id": withdrawal_id,
            "status": "paid", "amount": float(row.amount or 0)}


@app.post("/admin/withdrawals/{withdrawal_id}/reject")
async def reject_withdrawal(withdrawal_id: int):
    with engine.begin() as conn:
        row = conn.execute(text("""
            SELECT id, user_id, amount, status
            FROM withdrawals
            WHERE id = :id
            FOR UPDATE
        """), {"id": withdrawal_id}).fetchone()

        if not row:
            return {"success": False, "message": "Withdrawal not found"}

        if row.status != "pending":
            return {
                "success": False,
                "message": f"Already processed: {row.status}"
            }

        conn.execute(text("""
            UPDATE withdrawals
            SET status = 'rejected', processed_at = NOW()
            WHERE id = :id
        """), {"id": withdrawal_id})

        conn.execute(text("""
            UPDATE users
            SET balance = COALESCE(balance, 0) + :amount
            WHERE telegram_id = :uid
        """), {
            "amount": row.amount,
            "uid": row.user_id
        })

    await send_partner_notification(
        int(row.user_id),
        (
            "❌ <b>Заявка на выплату отклонена</b>\n\n"
            f"Сумма: <b>${float(row.amount or 0):.2f}</b>\n"
            "Средства возвращены на ваш баланс."
        )
    )

    return {
        "success": True,
        "withdrawal_id": withdrawal_id,
        "status": "rejected",
        "amount_returned": float(row.amount or 0)
    }

@app.get("/chat/messages")
async def get_chat_messages():
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
                "sender_name": row.sender_name or "Партнёр",
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
async def chat_online(data: dict):
    telegram_id = int(data["telegram_id"])

    supabase.table("chat_online").upsert(
        {
            "telegram_id": telegram_id,
            "last_seen": datetime.utcnow().isoformat(),
        }
    ).execute()

    return {
        "success": True
    }


@app.get("/chat/online-count")
async def chat_online_count():
    limit = (
        datetime.utcnow() - timedelta(seconds=60)
    ).isoformat()

    result = supabase \
        .table("chat_online") \
        .select("telegram_id") \
        .gt("last_seen", limit) \
        .execute()

    return {
        "success": True,
        "online": len(result.data or [])
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
