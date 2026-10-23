"""Tools marketplace API. No live payment/order creation without reviewed provider adapters."""
from decimal import Decimal
from urllib.parse import urlsplit
from typing import Optional, Literal
from uuid import UUID
import re
from fastapi import APIRouter, Header, HTTPException
from pydantic import BaseModel, Field, field_validator
from sqlalchemy import text
from database import engine
from stars_payments import require_telegram_id
import tools_stars

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
        row = conn.execute(text("SELECT available,reserved,refund_debt FROM tool_wallets WHERE telegram_id=:uid"),{"uid":uid}).one()
    return {"currency":"USD","available":str(row.available),"reserved":str(row.reserved),"refund_debt":str(row.refund_debt),"payments_enabled":tools_stars.settings()["payments_enabled"]}

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

# DEMO TOP-UP: test credits live in tool_demo_topups, NEVER in the real wallet.
# Telegram initData is verified by owner(); clients cannot choose someone else's account.
class DemoTopupPayload(BaseModel):
    amount: Decimal = Field(ge=Decimal("5"), le=Decimal("10000"), decimal_places=2)

@router.get("/demo-topups")
def demo_topups(x_telegram_init_data: Optional[str] = Header(None)):
    uid = owner(x_telegram_init_data)
    with engine.connect() as conn:
        rows = conn.execute(text("""
          SELECT id,amount,created_at FROM tool_demo_topups
          WHERE telegram_id=:uid ORDER BY created_at DESC LIMIT 100
        """), {"uid":uid}).all()
        total = conn.execute(text("""
          SELECT COALESCE(SUM(amount),0) FROM tool_demo_topups WHERE telegram_id=:uid
        """), {"uid":uid}).scalar_one()
    return {"balance":str(total),"transactions":[{"id":str(r.id),"amount":str(r.amount),
            "created_at":r.created_at.isoformat()} for r in rows]}

@router.post("/demo-topups")
def create_demo_topup(payload: DemoTopupPayload, x_telegram_init_data: Optional[str] = Header(None)):
    uid = owner(x_telegram_init_data)
    # This simulates successful payment only; never call Crypto Pay or modify tool_wallets.
    with engine.begin() as conn:
        row = conn.execute(text("""
          INSERT INTO tool_demo_topups(telegram_id,amount)
          VALUES(:uid,:amount) RETURNING id,amount,created_at
        """), {"uid":uid,"amount":payload.amount}).one()
    return {"id":str(row.id),"amount":str(row.amount),"created_at":row.created_at.isoformat()}

@router.get("/topup-config")
def topup_config(x_telegram_init_data: Optional[str] = Header(None)):
    owner(x_telegram_init_data)
    return tools_stars.settings()


@router.get("/payment-invoices")
def payment_invoices(x_telegram_init_data: Optional[str] = Header(None)):
    uid = owner(x_telegram_init_data)
    with engine.begin() as conn:
        conn.execute(text("""UPDATE tool_payment_invoices SET status='expired',updated_at=NOW()
            WHERE telegram_id=:uid AND provider='telegram_stars' AND status IN ('draft','pending')
            AND expires_at<NOW()"""), {'uid': uid})
        rows = conn.execute(text("""SELECT * FROM tool_payment_invoices
            WHERE telegram_id=:uid ORDER BY created_at DESC LIMIT 100"""), {'uid': uid}).mappings().all()
        return {'invoices': [{**tools_stars.public(row), 'amount': str(row['amount_usd'])} for row in rows]}


class StarsTopupPayload(DemoTopupPayload):
    terms_version: Literal["tools-stars-v1"]
    request_id: UUID
    expected_stars: int = Field(strict=True, ge=1, le=100000)


@router.post("/topup")
async def topup(payload: StarsTopupPayload, x_telegram_init_data: Optional[str] = Header(None)):
    uid = owner(x_telegram_init_data)
    from bot import bot
    return await tools_stars.create_invoice(uid, payload.amount, payload.request_id, payload.expected_stars, bot)

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
    # Links must go through /ai-studio/models/{id}/link to verify ownership.
    params["affiliate_url"]=None
    params["extra_url"]=None
    params["photo_url"]=None
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
    # Protect existing verified link selection from generic profile edits.
    with engine.connect() as read_conn:
        existing=read_conn.execute(text("""SELECT affiliate_url,extra_url,button_label,photo_url
          FROM tool_ai_models WHERE id=:id AND telegram_id=:uid"""),{"id":model_id,"uid":uid}).fetchone()
        if not existing: raise HTTPException(404,"Модель не найдена")
        params["affiliate_url"]=existing.affiliate_url
        params["extra_url"]=existing.extra_url
        params["button_label"]=existing.button_label
        if payload.photo_url!=existing.photo_url:
            # Only images uploaded and owned in AI Studio may become avatars.
            from urllib.parse import urlparse
            from uuid import UUID
            try:
                photo_id=UUID((payload.photo_url or "").rsplit("/",1)[-1])
            except ValueError:
                photo_id=None
            owned=read_conn.execute(text("""SELECT 1 FROM tool_ai_photos
               WHERE id=:pid AND owner_id=:uid AND model_id=:id"""),{"pid":photo_id,"uid":uid,"id":model_id}).first() if photo_id else None
            if payload.photo_url and not owned:
                raise HTTPException(422,"Используйте фотографию, загруженную в AI Studio")
            params["photo_url"]=payload.photo_url
        else:
            params["photo_url"]=existing.photo_url
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
