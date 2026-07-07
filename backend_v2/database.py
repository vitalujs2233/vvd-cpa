from sqlalchemy import create_engine, text
from config import settings

engine = create_engine(settings.DATABASE_URL)


def check_database():
    with engine.connect() as conn:
        conn.execute(text("SELECT 1"))
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
            }
        )
