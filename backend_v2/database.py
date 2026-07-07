from sqlalchemy import create_engine, text
from config import settings

engine = create_engine(settings.DATABASE_URL)


def check_database():
    with engine.connect() as conn:
        conn.execute(text("SELECT 1"))
        return True
