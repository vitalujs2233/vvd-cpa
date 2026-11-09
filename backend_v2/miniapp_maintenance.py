"""Mini App maintenance notice settings. Visual access gate only; finance/API permissions remain unchanged."""
from typing import Optional
from urllib.parse import urlsplit

from fastapi import APIRouter, Header, HTTPException
from pydantic import BaseModel, Field, field_validator
from sqlalchemy import text
from database import engine
from access_guard import authorized_admin
from stars_payments import require_telegram_id

router = APIRouter(prefix="/miniapp-maintenance", tags=["MiniApp maintenance"])

DEFAULT_TEXT = "В VVD CPA ведутся технические работы. За подробностями обращайтесь в службу поддержки."
DEFAULT_URL = "https://t.me/vvd_cpa_bot"


def ensure_table():
    with engine.begin() as conn:
        conn.execute(text("""
            CREATE TABLE IF NOT EXISTS public.vvd_miniapp_maintenance (
                id INTEGER PRIMARY KEY CHECK (id=1),
                enabled BOOLEAN NOT NULL DEFAULT FALSE,
                title VARCHAR(150) NOT NULL DEFAULT 'Технические работы',
                message TEXT NOT NULL,
                support_url VARCHAR(2048) NOT NULL,
                support_label VARCHAR(80) NOT NULL DEFAULT 'Связаться с поддержкой',
                version INTEGER NOT NULL DEFAULT 1,
                updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
            )
        """))
        conn.execute(text("""
            INSERT INTO public.vvd_miniapp_maintenance
              (id,enabled,title,message,support_url,support_label)
            VALUES (1,FALSE,'Технические работы',:message,:support,'Связаться с поддержкой')
            ON CONFLICT (id) DO NOTHING
        """), {"message": DEFAULT_TEXT, "support": DEFAULT_URL})


def settings():
    ensure_table()
    with engine.connect() as conn:
        row = conn.execute(text("""
          SELECT enabled,title,message,support_url,support_label,version,updated_at
          FROM public.vvd_miniapp_maintenance WHERE id=1
        """)).mappings().one()
    return {**dict(row), "updated_at": row["updated_at"].isoformat()}


class Settings(BaseModel):
    enabled: bool
    title: str = Field(min_length=1, max_length=150)
    message: str = Field(min_length=1, max_length=2000)
    support_url: str = Field(min_length=1, max_length=2048)
    support_label: str = Field(min_length=1, max_length=80)
    version: int = Field(ge=1)

    @field_validator("title", "message", "support_label")
    @classmethod
    def clean_text(cls, value: str) -> str:
        value = value.strip()
        if not value:
            raise ValueError("Поле не должно быть пустым")
        return value

    @field_validator("support_url")
    @classmethod
    def valid_support_url(cls, value: str) -> str:
        value = value.strip()
        parts = urlsplit(value)
        if (parts.scheme != "https" or not parts.hostname or parts.username
                or parts.password or any(ch.isspace() for ch in value)):
            raise ValueError("Укажите обычную HTTPS-ссылку службы поддержки")
        return value


@router.get("")
def public_maintenance():
    result = settings()
    return {k: result[k] for k in
            ("enabled", "title", "message", "support_url", "support_label", "version")}


@router.get("/admin")
def admin_maintenance(x_telegram_init_data: Optional[str] = Header(None)):
    if not authorized_admin(require_telegram_id(x_telegram_init_data)):
        raise HTTPException(403, "Доступ только администратору")
    return settings()


@router.put("/admin")
def update_maintenance(payload: Settings,
                       x_telegram_init_data: Optional[str] = Header(None)):
    if not authorized_admin(require_telegram_id(x_telegram_init_data)):
        raise HTTPException(403, "Доступ только администратору")
    ensure_table()
    with engine.begin() as conn:
        version = conn.execute(text("""
            UPDATE public.vvd_miniapp_maintenance
            SET enabled=:enabled,title=:title,message=:message,
                support_url=:url,support_label=:label,
                version=version+1,updated_at=now()
            WHERE id=1 AND version=:expected
            RETURNING version
        """), {
            "enabled": payload.enabled, "title": payload.title,
            "message": payload.message, "url": payload.support_url,
            "label": payload.support_label, "expected": payload.version
        }).scalar_one_or_none()
    if version is None:
        raise HTTPException(409, "Режим уже изменён. Обновите панель и повторите.")
    return {"success": True, "version": version}
