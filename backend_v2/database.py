from sqlalchemy import create_engine, text
import random
import string
from config import settings

engine = create_engine(settings.DATABASE_URL)
def generate_partner_code():
    while True:
        code = "VVD" + "".join(random.choices(string.digits, k=6))

        with engine.connect() as conn:
            exists = conn.execute(
                text("""
                    SELECT 1
                    FROM users
                    WHERE partner_code = :code
                """),
                {"code": code},
            ).fetchone()

        if not exists:
            return code

def check_database():
    with engine.connect() as conn:
        conn.execute(text("SELECT 1"))

    create_analytics_tables()

    return True


def save_user(
    telegram_id,
    first_name,
    last_name,
    username,
    photo_url
):
    with engine.begin() as conn:
        conn.execute(
            text("""
            INSERT INTO users (
                telegram_id,
                first_name,
                last_name,
                username,
                photo_url,
                partner_code,
                balance,
                hold,
                withdrawn,
                role,
                status
            )
            VALUES (
                :telegram_id,
                :first_name,
                :last_name,
                :username,
                :photo_url,
                :partner_code,
                0,
                0,
                0,
                'user',
                'active'
            )
            ON CONFLICT (telegram_id)
            DO UPDATE SET
                first_name = EXCLUDED.first_name,
                last_name = EXCLUDED.last_name,
                username = EXCLUDED.username,
                photo_url = EXCLUDED.photo_url
            """),
            {
                "telegram_id": telegram_id,
                "first_name": first_name,
                "last_name": last_name,
                "username": username,
                "photo_url": photo_url,
                "partner_code": generate_partner_code(),
            }
        )
def create_analytics_tables():
    with engine.begin() as conn:
        conn.execute(
            text("""
                CREATE TABLE IF NOT EXISTS clicks (
                    id BIGSERIAL PRIMARY KEY,
                    user_id BIGINT NOT NULL,
                    partner_code VARCHAR(50) NOT NULL,
                    click_id VARCHAR(255) NOT NULL UNIQUE,
                    vertical VARCHAR(100) NOT NULL,
                    country_code VARCHAR(20),
                    country_name VARCHAR(255),
                    ip_address VARCHAR(255),
                    created_at TIMESTAMP DEFAULT NOW()
                )
            """)
        )

        conn.execute(
            text("""
                CREATE INDEX IF NOT EXISTS idx_clicks_user_id
                ON clicks(user_id)
            """)
        )

        conn.execute(
            text("""
                CREATE INDEX IF NOT EXISTS idx_clicks_vertical
                ON clicks(vertical)
            """)
        )

        conn.execute(
            text("""
                CREATE INDEX IF NOT EXISTS idx_clicks_created_at
                ON clicks(created_at)
            """)
        )

        conn.execute(
            text("""
                CREATE INDEX IF NOT EXISTS idx_clicks_click_id
                ON clicks(click_id)
            """)
        )
def check_database():
    with engine.connect() as conn:
        conn.execute(text("SELECT 1"))

    create_analytics_tables()

    return True
