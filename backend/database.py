from typing import AsyncGenerator
from sqlalchemy.ext.asyncio import create_async_engine, async_sessionmaker, AsyncSession
from sqlalchemy.orm import DeclarativeBase
from backend.config import settings

# Настройка безопасного SSL-соединения для асинхронного драйвера asyncpg.
# Если мы подключаемся к облаку Supabase, автоматически передаем параметр ssl=True в аргументы подключения.
connect_args = {}
if "supabase.com" in settings.DATABASE_URL or "pooler.supabase.com" in settings.DATABASE_URL:
    connect_args = {"ssl": True}

# Создаем асинхронный движок подключения к PostgreSQL
engine = create_async_engine(
    settings.DATABASE_URL,
    echo=settings.DEBUG,
    future=True,
    connect_args=connect_args  # Безопасное подключение SSL для Supabase
)

# Фабрика асинхронных сессий базы данных
AsyncSessionLocal = async_sessionmaker(
    bind=engine,
    class_=AsyncSession,
    expire_on_commit=False,
)


# Базовый декларативный класс для описания таблиц (SQLAlchemy 2.0)
class Base(DeclarativeBase):
    pass


# Функция-зависимость для FastAPI роутов.
async def get_db() -> AsyncGenerator[AsyncSession, None]:
    async with AsyncSessionLocal() as session:
        try:
            yield session
            await session.commit()
        except Exception:
            await session.rollback()
            raise
        finally:
            await session.close()
