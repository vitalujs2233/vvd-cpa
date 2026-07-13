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


@app.post("/admin/withdrawals/{withdrawal_id}/paid")
async def mark_withdrawal_paid(withdrawal_id: int):
    with engine.begin() as conn:
        row = conn.execute(text("""
            SELECT id, user_id, amount, status
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

    return {"success": True, "withdrawal_id": withdrawal_id,
            "status": "paid", "amount": float(row.amount or 0)}


@app.post("/admin/withdrawals/{withdrawal_id}/reject")
async def reject_withdrawal(withdrawal_id: int):
    with engine.begin() as conn:
        row = conn.execute(text("""
            SELECT id, user_id, amount, status
            FROM withdrawals WHERE id = :id FOR UPDATE
        """), {"id": withdrawal_id}).fetchone()

        if not row:
            return {"success": False, "message": "Withdrawal not found"}
        if row.status != "pending":
            return {"success": False, "message": f"Already processed: {row.status}"}

        conn.execute(text("""
            UPDATE withdrawals
            SET status = 'rejected', processed_at = NOW()
            WHERE id = :id
        """), {"id": withdrawal_id})

        conn.execute(text("""
            UPDATE users
            SET balance = COALESCE(balance, 0) + :amount
            WHERE telegram_id = :uid
        """), {"amount": row.amount, "uid": row.user_id})

    return {"success": True, "withdrawal_id": withdrawal_id,
            "status": "rejected", "amount_returned": float(row.amount or 0)}
