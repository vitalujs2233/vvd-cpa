from sqlalchemy import Column, Integer, String, Float, Boolean, DateTime, ForeignKey, Date
from sqlalchemy.orm import declarative_base
import datetime

Base = declarative_base()

# 1. Таблица вебмастеров
class User(Base):
    __tablename__ = "users"
    
    tg_id = Column(Integer, primary_key=True, index=True) # ID пользователя в Telegram
    username = Column(String, nullable=True)             # Юзернейм @username
    balance_available = Column(Float, default=0.0)       # Баланс доступный к выводу
    balance_hold = Column(Float, default=0.0)            # Баланс в холде
    is_frozen = Column(Boolean, default=False)           # Заморожен ли за фрод

# 2. Таблица кликов (Для трекинга SubID)
class Click(Base):
    __tablename__ = "clicks"
    
    click_id = Column(String, primary_key=True, index=True) # Тот самый уникальный UUID (SubID1)
    user_id = Column(Integer, ForeignKey("users.tg_id"))    # Кто налил клик
    offer_id = Column(Integer, nullable=False)              # ID оффера (1 - Adult, 2 - Mainstream)
    created_at = Column(DateTime, default=datetime.datetime.utcnow)

# 3. Таблица лидов и конверсий от Постбеков
class Lead(Base):
    __tablename__ = "leads"
    
    id = Column(Integer, primary_key=True, autoincrement=True)
    click_id = Column(String, ForeignKey("clicks.click_id"), unique=True) # Связь с кликом
    user_id = Column(Integer, ForeignKey("users.tg_id"))                 # Кому начислить
    payout_full = Column(Float, nullable=False)                          # Сколько пришло от Traforce
    payout_webmaster = Column(Float, nullable=False)                     # Сколько ушло вебмастеру (80%)
    payout_admin = Column(Float, nullable=False)                         # Твоя комиссия (20%)
    status = Column(String, default="hold")                              # hold / approved_final / rejected
    hold_until = Column(Date, nullable=False)                            # Дата разморозки (через 10 дней)
    created_at = Column(DateTime, default=datetime.datetime.utcnow)
