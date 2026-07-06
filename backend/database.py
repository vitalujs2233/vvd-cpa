from typing import AsyncGenerator
from sqlalchemy.ext.asyncio import create_async_engine, async_sessionmaker, AsyncSession
from sqlalchemy.orm import DeclarativeBase
from backend.config import settings

# Создаем асинхронный движок подключения к PostgreSQL
# Параметр echo включает вывод сырых SQL-запросов в консоль, если запущен режим DEBUG
engine = create_async_engine(
    settings.DATABASE_URL,
    echo=settings.DEBUG,
    future=True,
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


# Функция-зависимость (Dependency Injection) для FastAPI роутов.
# Гарантирует, что сессия закроется после обработки запроса,
# а в случае ошибки транзакция будет безопасно откатана (rollback).
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
