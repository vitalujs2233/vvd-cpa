import uuid
from datetime import datetime
from typing import List, Optional
from sqlalchemy import String, Integer, Boolean, ForeignKey, DateTime, ARRAY, BigInteger
from sqlalchemy.orm import Mapped, mapped_column, relationship
from backend.database import Base


class Offer(Base):
    __tablename__ = "offers"

    id: Mapped[str] = mapped_column(String(100), primary_key=True)  # Например, "adult-dating", "crypto"
    title: Mapped[str] = mapped_column(String(255), nullable=False)
    offers_count: Mapped[int] = mapped_column(Integer, default=0, nullable=False)
    icon_name: Mapped[str] = mapped_column(String(100), nullable=False)
    is_top: Mapped[bool] = mapped_column(Boolean, default=False, nullable=False)
    is_new: Mapped[bool] = mapped_column(Boolean, default=False, nullable=False)
    geo: Mapped[str] = mapped_column(String(100), default="Worldwide", nullable=False)
    hold_days: Mapped[int] = mapped_column(Integer, default=10, nullable=False)
    payout_range: Mapped[str] = mapped_column(String(100), nullable=False)
    description: Mapped[str] = mapped_column(nullable=False)
    
    # Нативные массивы PostgreSQL для списков разрешенных и запрещенных источников трафика
    allowed_traffic: Mapped[List[str]] = mapped_column(ARRAY(String), nullable=False)
    forbidden_traffic: Mapped[List[str]] = mapped_column(ARRAY(String), nullable=False)
    
    smartlink_suffix: Mapped[str] = mapped_column(String(100), unique=True, nullable=False)
    created_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), default=datetime.utcnow, nullable=False)

    # Отношение один-ко-многим с таблицей смартлинков
    smartlinks: Mapped[List["SmartLink"]] = relationship(
        "SmartLink", 
        back_populates="offer", 
        cascade="all, delete-orphan"
    )


class SmartLink(Base):
    __tablename__ = "smartlinks"

    id: Mapped[uuid.UUID] = mapped_column(primary_key=True, default=uuid.uuid4)
    
    # Связь с Telegram ID пользователя-создателя
    user_id: Mapped[int] = mapped_column(
        BigInteger, 
        ForeignKey("users.telegram_id", ondelete="CASCADE"), 
        nullable=False
    )
    
    # Связь с конкретным оффером из каталога
    offer_id: Mapped[str] = mapped_column(
        String(100), 
        ForeignKey("offers.id", ondelete="CASCADE"), 
        nullable=False
    )
    
    suffix: Mapped[str] = mapped_column(String(100), unique=True, nullable=False)  # Сгенерированный суффикс (например, jgb123)
    url: Mapped[str] = mapped_column(nullable=False)  # Итоговая короткая ссылка для слива трафика
    created_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), default=datetime.utcnow, nullable=False)

    # Обратные связи для SQLAlchemy-маппинга
    offer: Mapped["Offer"] = relationship("Offer", back_populates="smartlinks")
