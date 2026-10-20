from sqlalchemy import create_engine, text
from config import settings

engine = create_engine(settings.DATABASE_URL)
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
    photo_url,
    referral_code=None
):
    with engine.begin() as conn:
        invited_by = None

        if referral_code:
            inviter = conn.execute(
                text("""
                    SELECT telegram_id
                    FROM users
                    WHERE partner_code = :partner_code
                """),
                {
                    "partner_code": referral_code
                }
            ).fetchone()

            if inviter and inviter.telegram_id != telegram_id:
                invited_by = inviter.telegram_id
        row = conn.execute(
            text("""
            INSERT INTO users (
                telegram_id,
                first_name,
                last_name,
                username,
                photo_url,
                partner_code,
                invited_by,
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
                NULL,
                :invited_by,
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
            RETURNING telegram_id, first_name, last_name, username, photo_url, partner_code, role, status
            """),
            {
                "telegram_id": telegram_id,
                "first_name": first_name,
                "last_name": last_name,
                "username": username,
                "photo_url": photo_url,
                "invited_by": invited_by,
            }
        ).mappings().one()
        return dict(row)

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
