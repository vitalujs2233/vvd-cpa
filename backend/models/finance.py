import uuid
from datetime import datetime
from typing import Optional
from sqlalchemy import String, Numeric, ForeignKey, DateTime, BigInteger
from sqlalchemy.orm import Mapped, mapped_column, relationship
from backend.database import Base


class Conversion(Base):
    __tablename__ = "conversions"

    id: Mapped[uuid.UUID] = mapped_column(primary_key=True, default=uuid.uuid4)
    click_id: Mapped[str] = mapped_column(String(255), unique=True, nullable=False)  # ClickID из Traforce
    
    # Связь с Telegram ID вебмастера-создателя
    user_id: Mapped[int] = mapped_column(
        BigInteger, 
        ForeignKey("users.telegram_id", ondelete="CASCADE"), 
        nullable=False
    )
    
    # Связь с оффером
    offer_id: Mapped[str] = mapped_column(
        String(100), 
        ForeignKey("offers.id", ondelete="CASCADE"), 
        nullable=False
    )
    
    # Финансовые показатели (Грязный и чистый доход)
    payout_gross: Mapped[float] = mapped_column(Numeric(12, 4), nullable=False)  # Выплата от Traforce нам
    payout_net: Mapped[float] = mapped_column(Numeric(12, 4), nullable=False)    # Выплата вебмастеру (минус наша комиссия)
    
    status: Mapped[str] = mapped_column(String(50), default="pending", nullable=False)  # 'pending', 'approved', 'declined'
    created_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), default=datetime.utcnow, nullable=False)
    processed_at: Mapped[Optional[datetime]] = mapped_column(DateTime(timezone=True), nullable=True)


class WithdrawRequest(Base):
    __tablename__ = "withdraw_requests"

    id: Mapped[uuid.UUID] = mapped_column(primary_key=True, default=uuid.uuid4)
    
    # Связь с Telegram ID получателя
    user_id: Mapped[int] = mapped_column(
        BigInteger, 
        ForeignKey("users.telegram_id", ondelete="CASCADE"), 
        nullable=False
    )
    
    amount: Mapped[float] = mapped_column(Numeric(12, 2), nullable=False)  # Заказанная сумма выплаты
    method: Mapped[str] = mapped_column(String(100), default="USDT TRC20", nullable=False)
    address: Mapped[str] = mapped_column(String(255), nullable=False)  # TRC20 кошелек
    tx_id: Mapped[str] = mapped_column(String(255), default="—", nullable=False)  # Хеш транзакции в блокчейне Tron
    
    status: Mapped[str] = mapped_column(String(50), default="pending", nullable=False)  # 'pending', 'completed', 'declined'
    decline_reason: Mapped[Optional[str]] = mapped_column(nullable=True)  # Причина отклонения выплаты
    created_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), default=datetime.utcnow, nullable=False)
    processed_at: Mapped[Optional[datetime]] = mapped_column(DateTime(timezone=True), nullable=True)
