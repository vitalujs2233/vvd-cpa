"""Tools marketplace API. No live payment/order creation without reviewed provider adapters."""
from decimal import Decimal
from urllib.parse import urlsplit
from typing import Optional
from uuid import UUID
import re
from fastapi import APIRouter, Header, HTTPException
from pydantic import BaseModel, Field, field_validator
from sqlalchemy import text
from database import engine
from stars_payments import require_telegram_id

router = APIRouter(prefix="/tools-market", tags=["Tools marketplace"])

def owner(header: Optional[str]) -> int:
    return require_telegram_id(header)

def safe_url(value: Optional[str]) -> Optional[str]:
    if not value:
        return None
    try:
        u = urlsplit(value.strip())
        if u.scheme != "https" or not u.hostname or u.username or u.password or len(value) > 2048:
            raise ValueError
        if u.hostname in ("localhost", "127.0.0.1") or u.hostname.endswith(".local"):
            raise ValueError
    except Exception:
        raise ValueError("Разрешены только корректные HTTPS-ссылки")
    return value.strip()

class AIModelPayload(BaseModel):
    name: str = Field(min_length=2, max_length=80)
    slug: str = Field(pattern=r"^[a-z0-9][a-z0-9-]{2,39}$")
    description: str = Field(default="", max_length=500)
    language: str = Field(default="ru", max_length=12)
    persona: str = Field(default="", max_length=3000)
    greeting: str = Field(default="", max_length=500)
    offer_description: str = Field(default="", max_length=2000)
    knowledge: str = Field(default="", max_length=5000)
    goal: str = Field(default="", max_length=1000)
    restrictions: str = Field(default="", max_length=2000)
    photo_url: Optional[str] = None
    affiliate_url: Optional[str] = None
    button_label: str = Field(default="Узнать больше", max_length=80)
    extra_url: Optional[str] = None
    status: str = "draft"

    @field_validator("photo_url", "affiliate_url", "extra_url")
    @classmethod
    def validate_url(cls, value):
        return safe_url(value)

    @field_validator("status")
    @classmethod
    def validate_status(cls, value):
        if value not in ("draft", "published", "disabled"):
            raise ValueError("Invalid state")
        return value

    @field_validator("name", "description", "persona", "greeting", "knowledge", "offer_description", "goal", "restrictions", "button_label")
    @classmethod
    def strip_markup(cls, value):
        # UI renders text only (never raw HTML).
        return value.strip()

FIELDS = ("name","slug","description","language","persona","greeting","offer_description",
          "knowledge","goal","restrictions","photo_url","affiliate_url","button_label","extra_url","status")
FULL_COLUMNS = "id,telegram_id," + ",".join(FIELDS) + ",created_at,updated_at"

def model_dict(row):
    return {key: (str(value) if key in ("id","created_at","updated_at") and value is not None else value)
            for key,value in row._mapping.items() if key != "telegram_id"}

@router.get("/wallet")
def wallet(x_telegram_init_data: Optional[str] = Header(None)):
    uid = owner(x_telegram_init_data)
    with engine.begin() as conn:
        conn.execute(text("INSERT INTO tool_wallets(telegram_id) VALUES(:uid) ON CONFLICT DO NOTHING"),{"uid":uid})
        row = conn.execute(text("SELECT available,reserved FROM tool_wallets WHERE telegram_id=:uid"),{"uid":uid}).one()
    return {"currency":"USD","available":str(row.available),"reserved":str(row.reserved),"payments_enabled":False}

@router.get("/catalog")
def catalog():
    with engine.connect() as conn:
        rows=conn.execute(text("SELECT id,title,category,description,status,price FROM tool_services ORDER BY id")).all()
    return {"services":[{"id":r.id,"title":r.title,"category":r.category,"description":r.description,
                         "status":r.status,"price":str(r.price) if r.price is not None else None} for r in rows],
            "payment_provider":{"status":"unavailable","assets":[]}}

@router.get("/transactions")
def transactions(x_telegram_init_data: Optional[str] = Header(None)):
    uid=owner(x_telegram_init_data)
    with engine.connect() as conn:
        rows=conn.execute(text("""
          SELECT t.id,t.kind,t.amount,t.status,t.created_at,s.title AS service
          FROM tool_transactions t LEFT JOIN tool_orders o ON o.id=t.order_id
          LEFT JOIN tool_services s ON s.id=o.service_id
          WHERE t.telegram_id=:uid ORDER BY t.created_at DESC LIMIT 100
        """),{"uid":uid})
        data=[{"id":str(r.id),"kind":r.kind,"amount":str(r.amount),"status":r.status,
               "created_at":r.created_at.isoformat(),"service":r.service} for r in rows]
    return {"transactions":data}

@router.get("/orders")
def orders(x_telegram_init_data: Optional[str] = Header(None)):
    uid=owner(x_telegram_init_data)
    with engine.connect() as conn:
        rows=conn.execute(text("""
          SELECT o.id,o.service_id,s.title,o.amount,o.status,o.created_at
          FROM tool_orders o JOIN tool_services s ON s.id=o.service_id
          WHERE o.telegram_id=:uid ORDER BY o.created_at DESC LIMIT 100
        """),{"uid":uid})
        return {"orders":[{"id":str(r.id),"service_id":r.service_id,"title":r.title,"amount":str(r.amount),
                           "status":r.status,"created_at":r.created_at.isoformat()} for r in rows]}

@router.post("/topup",status_code=503)
def topup_disabled(x_telegram_init_data: Optional[str] = Header(None)):
    owner(x_telegram_init_data)
    raise HTTPException(503,"Платёжный провайдер не подключён. Счета не создаются.")

@router.post("/orders",status_code=503)
def orders_disabled(x_telegram_init_data: Optional[str] = Header(None)):
    owner(x_telegram_init_data)
    raise HTTPException(503,"Поставщик не подключён. Списание и заказ недоступны.")

@router.get("/ai")
def ai_list(x_telegram_init_data: Optional[str] = Header(None)):
    uid=owner(x_telegram_init_data)
    with engine.connect() as conn:
        rows=conn.execute(text(f"SELECT {FULL_COLUMNS} FROM tool_ai_models WHERE telegram_id=:uid ORDER BY updated_at DESC"),{"uid":uid})
        return {"models":[model_dict(r) for r in rows]}

@router.post("/ai")
def ai_create(payload:AIModelPayload,x_telegram_init_data:Optional[str]=Header(None)):
    uid=owner(x_telegram_init_data)
    params=payload.model_dump()
    params["uid"]=uid
    with engine.begin() as conn:
        try:
            row=conn.execute(text(f"""
              INSERT INTO tool_ai_models(telegram_id,{','.join(FIELDS)})
              VALUES (:uid,{','.join(':'+k for k in FIELDS)})
              RETURNING {FULL_COLUMNS}
            """),params).one()
        except Exception as exc:
            if "unique" in str(exc).lower():
                raise HTTPException(409,"Этот адрес уже занят") from exc
            raise
    return model_dict(row)

@router.get("/ai/{model_id}")
def ai_detail(model_id:UUID,x_telegram_init_data:Optional[str]=Header(None)):
    uid=owner(x_telegram_init_data)
    with engine.connect() as conn:
        row=conn.execute(text(f"SELECT {FULL_COLUMNS} FROM tool_ai_models WHERE id=:id AND telegram_id=:uid"),
                         {"id":model_id,"uid":uid}).fetchone()
    if not row: raise HTTPException(404,"Модель не найдена")
    return model_dict(row)

@router.put("/ai/{model_id}")
def ai_update(model_id:UUID,payload:AIModelPayload,x_telegram_init_data:Optional[str]=Header(None)):
    uid=owner(x_telegram_init_data)
    params=payload.model_dump()
    params.update(uid=uid,id=model_id)
    with engine.begin() as conn:
        try:
            row=conn.execute(text(f"""
              UPDATE tool_ai_models SET {','.join(k+'=:'+k for k in FIELDS)},updated_at=NOW()
              WHERE id=:id AND telegram_id=:uid RETURNING {FULL_COLUMNS}
            """),params).fetchone()
        except Exception as exc:
            if "unique" in str(exc).lower():
                raise HTTPException(409,"Этот адрес уже занят") from exc
            raise
    if not row: raise HTTPException(404,"Модель не найдена")
    return model_dict(row)

@router.get("/public/ai/{slug}")
def public_ai(slug:str):
    if not re.fullmatch(r"[a-z0-9][a-z0-9-]{2,39}",slug):
        raise HTTPException(404,"Модель не найдена")
    with engine.connect() as conn:
        r=conn.execute(text("""
          SELECT name,description,photo_url,greeting,affiliate_url,button_label,language
          FROM tool_ai_models WHERE slug=:slug AND status='published'
        """),{"slug":slug}).fetchone()
    if not r: raise HTTPException(404,"Страница недоступна")
    return {"name":r.name,"description":r.description,"photo_url":r.photo_url,"greeting":r.greeting,
            "affiliate_url":r.affiliate_url,"button_label":r.button_label,"language":r.language,
            "ai_online":False,"disclosure":"AI-персонаж"}
