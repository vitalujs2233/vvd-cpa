import uuid
from datetime import datetime, date as date_type
from typing import Optional, Dict
from sqlalchemy import String, Integer, Numeric, ForeignKey, DateTime, Date, Boolean, BigInteger, UniqueConstraint
from sqlalchemy.dialects.postgresql import JSONB
from sqlalchemy.orm import Mapped, mapped_column
from backend.database import Base


class Statistics(Base):
    __tablename__ = "statistics"

    id: Mapped[uuid.UUID] = mapped_column(primary_key=True, default=uuid.uuid4)
    
    # Связь с Telegram ID вебмастера
    user_id: Mapped[int] = mapped_column(
        BigInteger, 
        ForeignKey("users.telegram_id", ondelete="CASCADE"), 
        nullable=False
    )
    
    date: Mapped[date_type] = mapped_column(Date, default=datetime.utcnow, nullable=False)
    clicks: Mapped[int] = mapped_column(Integer, default=0, nullable=False)
    conversions: Mapped[int] = mapped_column(Integer, default=0, nullable=False)
    income: Mapped[float] = mapped_column(Numeric(12, 4), default=0.0000, nullable=False)

    # Уникальный составной индекс: у вебмастера на одну дату может быть только одна строка статистики
    __table_args__ = (
        UniqueConstraint("user_id", "date", name="unique_user_date"),
    )


class ChatMessage(Base):
    __tablename__ = "chat_messages"

    id: Mapped[uuid.UUID] = mapped_column(primary_key=True, default=uuid.uuid4)
    
    # Связь с Telegram ID отправителя
    sender_id: Mapped[int] = mapped_column(
        BigInteger, 
        ForeignKey("users.telegram_id", ondelete="CASCADE"), 
        nullable=False
    )
    
    text: Mapped[str] = mapped_column(nullable=False)
    
    # Нативный тип данных JSONB для счетчиков реакций в формате: {"🚀": 12, "👍": 5}
    reactions: Mapped[Dict[str, int]] = mapped_column(JSONB, default=dict, nullable=False)
    created_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), default=datetime.utcnow, nullable=False)


class Notification(Base):
    __tablename__ = "notifications"

    id: Mapped[uuid.UUID] = mapped_column(primary_key=True, default=uuid.uuid4)
    
    # Связь с получателем
    user_id: Mapped[int] = mapped_column(
        BigInteger, 
        ForeignKey("users.telegram_id", ondelete="CASCADE"), 
        nullable=False
    )
    
    title: Mapped[str] = mapped_column(String(255), nullable=False)
    text: Mapped[str] = mapped_column(nullable=False)
    type: Mapped[str] = mapped_column(String(50), nullable=False)  # "conversion", "payout", "system"
    is_read: Mapped[bool] = mapped_column(Boolean, default=False, nullable=False)
    created_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), default=datetime.utcnow, nullable=False)


class AdminLog(Base):
    __tablename__ = "admin_logs"

    id: Mapped[uuid.UUID] = mapped_column(primary_key=True, default=uuid.uuid4)
    
    # Связь с ID администратора (232682307)
    admin_id: Mapped[int] = mapped_column(
        BigInteger, 
        ForeignKey("users.telegram_id", ondelete="CASCADE"), 
        nullable=False
    )
    
    action: Mapped[str] = mapped_column(String(255), nullable=False)  # Действие (блокировка, выплаты)
    details: Mapped[Optional[str]] = mapped_column(nullable=True)
    created_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), default=datetime.utcnow, nullable=False)
