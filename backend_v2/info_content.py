"""Versioned informational content. No CPA financial data access."""
from typing import Optional, Literal
from urllib.parse import urlsplit
from fastapi import APIRouter, Header, HTTPException
from pydantic import BaseModel, Field, model_validator
from sqlalchemy import text
from database import engine
from stars_payments import require_telegram_id
from access_guard import authorized_admin

router = APIRouter(prefix="/info", tags=["Information"])

class Item(BaseModel):
    id: str = Field(min_length=1, max_length=80)
    kind: Literal["section", "banner"]
    title: str = Field(default="", max_length=180)
    description: str = Field(default="", max_length=600)
    body: str = Field(default="", max_length=30000)
    quote: str = Field(default="", max_length=500)
    icon: str = Field(default="info", max_length=50)
    image_url: str = Field(default="", max_length=2048)
    button_text: str = Field(default="", max_length=100)
    button_url: str = Field(default="", max_length=2048)
    visible: bool = True

    @model_validator(mode="after")
    def validate_urls(self):
        for value in (self.image_url, self.button_url):
            if value:
                parsed = urlsplit(value)
                if parsed.scheme != "https" or not parsed.netloc or parsed.username or parsed.password or any(c.isspace() for c in value):
                    raise ValueError("Разрешены только безопасные HTTPS-ссылки")
        return self

class Content(BaseModel):
    items: list[Item] = Field(max_length=150)

    @model_validator(mode="after")
    def unique_ids(self):
        ids = [item.id for item in self.items]
        if len(ids) != len(set(ids)):
            raise ValueError("Повторяющиеся ID элементов")
        return self

def admin(raw):
    uid = require_telegram_id(raw)
    if not authorized_admin(uid):
        raise HTTPException(403, "Доступ только администратору")
    return uid

def load(version):
    if version is None:
        return []
    with engine.connect() as conn:
        result = conn.execute(text("SELECT content FROM vvd_info_versions WHERE id=:id"), {"id": version}).scalar_one_or_none()
    return result if result is not None else []

@router.get("/published")
def published():
    with engine.connect() as conn:
        version = conn.execute(text("SELECT published_version_id FROM vvd_info_state WHERE id=1")).scalar_one()
    return {"version": version, "items": [i for i in load(version) if i.get("visible", True)]}

@router.get("/admin")
def get_admin(x_telegram_init_data: Optional[str] = Header(None)):
    admin(x_telegram_init_data)
    with engine.connect() as conn:
        state = conn.execute(text("SELECT draft_version_id,published_version_id FROM vvd_info_state WHERE id=1")).mappings().one()
        history = conn.execute(text("SELECT id,created_at FROM vvd_info_versions ORDER BY id DESC LIMIT 30")).mappings().all()
    return {"draft_version":state["draft_version_id"],"published_version":state["published_version_id"],
            "items":load(state["draft_version_id"] or state["published_version_id"]),
            "history":[{"id":r["id"],"created_at":r["created_at"].isoformat()} for r in history]}

@router.put("/admin/draft")
def save_draft(payload: Content, x_telegram_init_data: Optional[str] = Header(None)):
    uid = admin(x_telegram_init_data)
    with engine.begin() as conn:
        import json
        v = conn.execute(text("INSERT INTO vvd_info_versions(content,created_by) VALUES(CAST(:content AS jsonb),:uid) RETURNING id"),
                         {"content":json.dumps([i.model_dump() for i in payload.items],ensure_ascii=False),"uid":uid}).scalar_one()
        conn.execute(text("UPDATE vvd_info_state SET draft_version_id=:v,updated_at=now() WHERE id=1"),{"v":v})
    return {"draft_version":v}

@router.post("/admin/publish")
def publish(x_telegram_init_data: Optional[str] = Header(None)):
    admin(x_telegram_init_data)
    with engine.begin() as conn:
        state = conn.execute(text("SELECT draft_version_id FROM vvd_info_state WHERE id=1 FOR UPDATE")).scalar_one()
        if state is None:
            raise HTTPException(409,"Сначала сохраните черновик")
        conn.execute(text("UPDATE vvd_info_state SET published_version_id=:v,draft_version_id=NULL,updated_at=now() WHERE id=1"),{"v":state})
    return {"published_version":state}

@router.post("/admin/restore/{version_id}")
def restore(version_id: int, x_telegram_init_data: Optional[str] = Header(None)):
    admin(x_telegram_init_data)
    with engine.begin() as conn:
        if not conn.execute(text("SELECT 1 FROM vvd_info_versions WHERE id=:v"),{"v":version_id}).first():
            raise HTTPException(404,"Версия не найдена")
        conn.execute(text("UPDATE vvd_info_state SET published_version_id=:v,draft_version_id=NULL,updated_at=now() WHERE id=1"),{"v":version_id})
    return {"published_version":version_id}
