"""Isolated homepage ticker with Telegram-admin-only mutation endpoints."""
import uuid
from typing import Optional, Literal
from fastapi import APIRouter, Header, HTTPException
from pydantic import BaseModel, Field, field_validator
from sqlalchemy import text
from database import engine
from stars_payments import require_telegram_id
from access_guard import authorized_admin
from home_ads import safe_target

router = APIRouter(prefix="/home-ticker", tags=["Home ticker"])

def require_admin(raw:Optional[str]):
    if not authorized_admin(require_telegram_id(raw)):
        raise HTTPException(403,"Доступ только администратору")

def as_item(row):
    return {"id":str(row["id"]),"text":row["body"],"color":row["color"],
            "target_url":row["target_url"],"is_active":row["is_active"],
            "position":row["position"],"created_at":row["created_at"].isoformat(),
            "updated_at":row["updated_at"].isoformat()}

def feed(admin:bool=False):
    with engine.connect() as conn:
        enabled=bool(conn.execute(text("SELECT enabled FROM home_ticker_settings WHERE id=1")).scalar_one())
        clause="" if admin else "WHERE is_active"
        rows=conn.execute(text(f"SELECT id,body,color,target_url,is_active,position,created_at,updated_at FROM home_ticker_messages {clause} ORDER BY position,created_at")).mappings().all()
    return {"enabled":enabled,"items":[as_item(row) for row in rows]}

@router.get("/published")
def published():
    result=feed()
    if not result["enabled"]:
        return {"enabled":False,"items":[]}
    return result

@router.get("/admin")
def admin_feed(x_telegram_init_data:Optional[str]=Header(None)):
    require_admin(x_telegram_init_data)
    return feed(admin=True)

class Message(BaseModel):
    text:str=Field(min_length=1,max_length=500)
    color:Literal["gold","green","red"]="gold"
    target_url:str=Field(default="",max_length=2048)
    is_active:bool=True
    @field_validator("text")
    @classmethod
    def clean_text(cls,value):
        value=value.strip()
        if not value:raise ValueError("Текст не может быть пустым")
        return value
    @field_validator("target_url")
    @classmethod
    def check_url(cls,value):
        return safe_target(value)

@router.post("/admin/messages")
def create_message(payload:Message,x_telegram_init_data:Optional[str]=Header(None)):
    require_admin(x_telegram_init_data)
    with engine.begin() as conn:
        position=conn.execute(text("SELECT COALESCE(MAX(position),-1)+1 FROM home_ticker_messages")).scalar_one()
        ident=conn.execute(text("""INSERT INTO home_ticker_messages(body,color,target_url,is_active,position)
            VALUES(:body,:color,:url,:active,:position) RETURNING id"""),
            {"body":payload.text,"color":payload.color,"url":payload.target_url,"active":payload.is_active,"position":position}).scalar_one()
    return {"id":str(ident)}

@router.put("/admin/messages/{message_id}")
def update_message(message_id:uuid.UUID,payload:Message,x_telegram_init_data:Optional[str]=Header(None)):
    require_admin(x_telegram_init_data)
    with engine.begin() as conn:
        result=conn.execute(text("""UPDATE home_ticker_messages SET body=:body,color=:color,target_url=:url,
            is_active=:active,updated_at=now() WHERE id=:id RETURNING id"""),
            {"body":payload.text,"color":payload.color,"url":payload.target_url,"active":payload.is_active,"id":str(message_id)}).scalar_one_or_none()
    if result is None:raise HTTPException(404,"Сообщение не найдено")
    return {"ok":True}

@router.delete("/admin/messages/{message_id}")
def delete_message(message_id:uuid.UUID,x_telegram_init_data:Optional[str]=Header(None)):
    require_admin(x_telegram_init_data)
    with engine.begin() as conn:
        result=conn.execute(text("DELETE FROM home_ticker_messages WHERE id=:id RETURNING id"),{"id":str(message_id)}).scalar_one_or_none()
    if result is None:raise HTTPException(404,"Сообщение не найдено")
    return {"ok":True}

class Reorder(BaseModel):
    ids:list[uuid.UUID]=Field(max_length=500)

@router.put("/admin/order")
def reorder(payload:Reorder,x_telegram_init_data:Optional[str]=Header(None)):
    require_admin(x_telegram_init_data)
    if len(set(payload.ids))!=len(payload.ids):raise HTTPException(422,"Повторяющиеся ID")
    with engine.begin() as conn:
        conn.execute(text("SELECT id FROM home_ticker_settings WHERE id=1 FOR UPDATE"))
        existing={str(i) for i in conn.execute(text("SELECT id FROM home_ticker_messages")).scalars()}
        if existing!={str(i) for i in payload.ids}:raise HTTPException(409,"Список сообщений изменился")
        for index,ident in enumerate(payload.ids):
            conn.execute(text("UPDATE home_ticker_messages SET position=:position,updated_at=now() WHERE id=:id"),
                {"position":index,"id":str(ident)})
    return {"ok":True}

class Settings(BaseModel):
    enabled:bool

@router.put("/admin/settings")
def update_settings(payload:Settings,x_telegram_init_data:Optional[str]=Header(None)):
    require_admin(x_telegram_init_data)
    with engine.begin() as conn:
        conn.execute(text("UPDATE home_ticker_settings SET enabled=:enabled,updated_at=now() WHERE id=1"),{"enabled":payload.enabled})
    return {"ok":True}
