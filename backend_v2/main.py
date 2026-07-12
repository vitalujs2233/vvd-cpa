from fastapi import FastAPI, Request
from fastapi.responses import RedirectResponse
from fastapi.middleware.cors import CORSMiddleware
from pydantic import BaseModel
from sqlalchemy import text
from database import check_database, save_user, engine

import json
import urllib.request
import uuid

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
        f"https://MAINSTREAM_LINK&sub1={partner_code}",

        "nutra":
        f"https://NUTRA_LINK&sub1={partner_code}",

        "crypto":
        f"https://CRYPTO_LINK&sub1={partner_code}",

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
        f"https://MAINSTREAM_LINK&sub1={partner_code}&sub2={click_id}",

        "nutra":
        f"https://NUTRA_LINK&sub1={partner_code}&sub2={click_id}",

        "crypto":
        f"https://CRYPTO_LINK&sub1={partner_code}&sub2={click_id}",

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

        telegram_id = user.telegram_id

        conversion = conn.execute(
            text("""
                SELECT id
                FROM conversions
                WHERE transaction_id = :transaction_id
            """),
            {
                "transaction_id": transaction_id
            }
        ).fetchone()

        if conversion:
            return {
                "success": True,
                "message": "Conversion already exists"
            }

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
                "payout_gross": payout,
                "payout_net": payout,
                "status": str(status),
                "transaction_id": transaction_id
            }
        )
        stats = conn.execute(
            text("""
                SELECT id
                FROM statistics
                WHERE user_id = :user_id
                AND date = CURRENT_DATE
            """),
            {
                "user_id": telegram_id
            }
        ).fetchone()

        if stats:

            conn.execute(
                text("""
                    UPDATE statistics
                    SET
                        conversions = conversions + 1,
                        income = income + :income
                    WHERE
                        user_id = :user_id
                        AND date = CURRENT_DATE
                """),
                {
                    "user_id": telegram_id,
                    "income": payout
                }
            )

        else:

            conn.execute(
                text("""
                    INSERT INTO statistics
                    (
                        user_id,
                        date,
                        clicks,
                        conversions,
                        income
                    )
                    VALUES
                    (
                        :user_id,
                        CURRENT_DATE,
                        0,
                        1,
                        :income
                    )
                """),
                {
                    "user_id": telegram_id,
                    "income": payout
                }
            )
        geo_value = (geo or "").strip()

        if geo_value:
            country_stat = conn.execute(
                text("""
                    SELECT country_code, country_name
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
                            conversions = conversions + 1,
                            income = income + :income
                        WHERE user_id = :user_id
                        AND date = CURRENT_DATE
                        AND country_code = :country_code
                    """),
                    {
                        "user_id": telegram_id,
                        "country_code": country_stat.country_code,
                        "income": payout
                    }
                )
            else:
                conn.execute(
                    text("""
                        INSERT INTO country_statistics
                        (
                            user_id,
                            country_code,
                            country_name,
                            date,
                            clicks,
                            conversions,
                            income
                        )
                        VALUES
                        (
                            :user_id,
                            :country_code,
                            :country_name,
                            CURRENT_DATE,
                            0,
                            1,
                            :income
                        )
                    """),
                    {
                        "user_id": telegram_id,
                        "country_code": geo_value,
                        "country_name": geo_value,
                        "income": payout
                    }
                )

        if status == 1:
            conn.execute(
                text("""
                    UPDATE users
                    SET
                        balance = balance + :amount
                    WHERE telegram_id = :user_id
                """),
                {
                    "amount": payout,
                    "user_id": telegram_id
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
        "payout": payout,
        "status": status,
        "transaction_id": transaction_id,
        "date": date,
        "geo": geo
    }

@app.get("/statistics/{telegram_id}")
async def get_statistics(telegram_id: int):

    with engine.connect() as conn:

        stats = conn.execute(
            text("""
                SELECT
                    date,
                    clicks,
                    conversions,
                    income
                FROM statistics
                WHERE user_id = :telegram_id
                ORDER BY date ASC
            """),
            {
                "telegram_id": telegram_id
            }
        ).fetchall()

    return {
        "success": True,
        "statistics": [
            {
                "date": str(row.date),
                "clicks": int(row.clicks or 0),
                "conversions": int(row.conversions or 0),
                "income": float(row.income or 0)
            }
            for row in stats
        ]
    }
@app.get("/statistics/{telegram_id}/countries")
async def get_country_statistics(telegram_id: int):

    with engine.connect() as conn:

        countries = conn.execute(
            text("""
                SELECT
                    country_code,
                    country_name,
                    SUM(clicks) AS clicks,
                    SUM(conversions) AS conversions,
                    SUM(income) AS income
                FROM country_statistics
                WHERE user_id = :telegram_id
                GROUP BY country_code, country_name
                ORDER BY income DESC
            """),
            {
                "telegram_id": telegram_id
            }
        ).fetchall()

    return {
        "success": True,
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
