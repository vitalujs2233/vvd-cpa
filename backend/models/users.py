import uuid
from datetime import datetime
from typing import Optional
from sqlalchemy import BigInteger, Numeric, String, ForeignKey, DateTime, Boolean
from sqlalchemy.orm import Mapped, mapped_column, relationship
from backend.database import Base


class User(Base):
    __tablename__ = "users"

    # Telegram ID имеет большой размер, используем 64-битный BigInteger
    telegram_id: Mapped[int] = mapped_column(BigInteger, primary_key=True, autoincrement=False)
    first_name: Mapped[str] = mapped_column(String(255), nullable=False)
    last_name: Mapped[Optional[str]] = mapped_column(String(255), nullable=True)
    username: Mapped[Optional[str]] = mapped_column(String(255), nullable=True)
    email: Mapped[Optional[str]] = mapped_column(String(255), unique=True, nullable=True)
    photo_url: Mapped[Optional[str]] = mapped_column(nullable=True)
    
    # Финансовые показатели (Numeric гарантирует абсолютную точность без дробных ошибок float)
    balance: Mapped[float] = mapped_column(Numeric(12, 2), default=0.00, nullable=False)
    hold: Mapped[float] = mapped_column(Numeric(12, 2), default=0.00, nullable=False)
    withdrawn: Mapped[float] = mapped_column(Numeric(12, 2), default=0.00, nullable=False)
    
    role: Mapped[str] = mapped_column(String(50), default="user", nullable=False)
    status: Mapped[str] = mapped_column(String(50), default="active", nullable=False)
    created_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), default=datetime.utcnow, nullable=False)

    # Отношение один-к-одному с таблицей индивидуальных настроек (Settings)
    # При удалении юзера автоматически удалятся и его настройки (cascade)
    settings: Mapped["UserSettings"] = relationship(
        "UserSettings", 
        back_populates="user", 
        uselist=False, 
        cascade="all, delete-orphan"
    )


class UserSettings(Base):
    __tablename__ = "settings"

    id: Mapped[uuid.UUID] = mapped_column(primary_key=True, default=uuid.uuid4)
    user_id: Mapped[int] = mapped_column(
        BigInteger, 
        ForeignKey("users.telegram_id", ondelete="CASCADE"), 
        unique=True, 
        nullable=False
    )
    
    push_enabled: Mapped[bool] = mapped_column(Boolean, default=True, nullable=False)
    email_enabled: Mapped[bool] = mapped_column(Boolean, default=False, nullable=False)
    language: Mapped[str] = mapped_column(String(50), default="Русский", nullable=False)
    currency: Mapped[str] = mapped_column(String(50), default="USD", nullable=False)
    is_2fa_enabled: Mapped[bool] = mapped_column(Boolean, default=True, nullable=False)
    updated_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True), 
        default=datetime.utcnow, 
        onupdate=datetime.utcnow, 
        nullable=False
    )

    # Обратная связь один-к-одному с пользователем
    user: Mapped["User"] = relationship("User", back_populates="settings")
