from fastapi import FastAPI from fastapi.middleware.cors import
CORSMiddleware from pydantic import BaseModel from sqlalchemy import
text from database import check_database, save_user, engine

app = FastAPI( title="VVD CPA Backend V2", version="2.0" )
app.add_middleware( CORSMiddleware, allow_origins=[
"https://vitalujs2233.github.io",
"https://vitalujs2233.github.io/vvd-cpa", "https://web.telegram.org" ],
allow_credentials=True, allow_methods=["*"], allow_headers=["*"], )

@app.get("/") async def root(): return { "status": "ok", "message":
"Backend V2 работает" }

@app.get("/health") async def health(): return { "status": "healthy" }

@app.get("/db") async def db(): try: check_database() return {
"database": "connected" } except Exception as e: return { "database":
"error", "details": str(e) }

class TelegramUser(BaseModel): telegram_id: int first_name: str
last_name: str | None = None username: str | None = None photo_url: str
| None = None

@app.post("/auth") async def auth(user: TelegramUser): save_user(
telegram_id=user.telegram_id, first_name=user.first_name,
last_name=user.last_name, username=user.username,
photo_url=user.photo_url, )

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

@app.get("/smartlink/{telegram_id}/{vertical}") async def
get_smartlink(telegram_id: int, vertical: str):

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
        f"https://tone.affomelody.com/click?pid=12519&offer_id=25&sub1={partner_code}",

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

@app.get("/balance/{telegram_id}") async def get_balance(telegram_id:
int):

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

@app.get("/postback/adult") async def postback_adult(

    partner_code: str,
    click_id: str = "",
    offer_id: str = "",
    offer_name: str = "",
    payout: float = 0,
    status: int = 0,
    transaction_id: str = "",
    date: str = ""

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
        "date": date
    }

@app.get("/statistics/{telegram_id}") async def
get_statistics(telegram_id: int):

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

@app.get("/statistics/{telegram_id}/countries") async def
get_country_statistics(telegram_id: int):

    with engine.connect() as conn:

        countries = conn.execute(
            text("""
                SELECT
                    date,
                    country_code,
                    country_name,
                    clicks,
                    conversions,
                    income
                FROM country_statistics
                WHERE user_id = :telegram_id
                ORDER BY date ASC, income DESC
            """),
            {
                "telegram_id": telegram_id
            }
        ).fetchall()

    return {
        "success": True,
        "countries": [
            {
                "date": str(row.date),
                "country_code": row.country_code,
                "country_name": row.country_name,
                "clicks": int(row.clicks or 0),
                "conversions": int(row.conversions or 0),
                "income": float(row.income or 0)
            }
            for row in countries
        ]
    }
