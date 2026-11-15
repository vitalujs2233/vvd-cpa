"""Account-wide partner blocks with a support-only escape hatch."""
from fastapi import APIRouter, HTTPException, Request
from pydantic import BaseModel, Field, field_validator
from sqlalchemy import text
from database import engine
from access_guard import authorized_admin
from stars_payments import authenticated_user_id, TelegramAuthError

router = APIRouter()
DEFAULT_TITLE = "Ваш аккаунт заблокирован"
DEFAULT_MESSAGE = ("Доступ к VVD CPA временно ограничен. "
                   "Свяжитесь со службой поддержки для уточнения причины "
                   "и рассмотрения блокировки.")


def actor(request: Request) -> int:
    try:
        return authenticated_user_id(request.headers.get("X-Telegram-Init-Data", ""))
    except TelegramAuthError as exc:
        raise HTTPException(401, "Требуется подтверждённый вход через Telegram") from exc


def admin(request: Request) -> int:
    uid = actor(request)
    if not authorized_admin(uid):
        raise HTTPException(403, "Только администратор")
    return uid


def read_settings(conn):
    row = conn.execute(text("""
        SELECT title,message,version FROM public.vvd_account_block_settings WHERE id=1
    """)).mappings().first()
    return dict(row) if row else {
        "title": DEFAULT_TITLE, "message": DEFAULT_MESSAGE, "version": 1
    }


class BlockMessage(BaseModel):
    title: str = Field(min_length=1, max_length=150)
    message: str = Field(min_length=1, max_length=2000)
    version: int = Field(ge=1)

    @field_validator("title", "message")
    @classmethod
    def strip_text(cls, value: str) -> str:
        value = value.strip()
        if not value:
            raise ValueError("Текст не может быть пустым")
        return value


class BlockAction(BaseModel):
    action: str
    reason: str = Field(default="", max_length=1000)

    @field_validator("action")
    @classmethod
    def validate_action(cls, value: str) -> str:
        if value not in ("block", "unblock"):
            raise ValueError("Недопустимое действие")
        return value


@router.get("/account/access")
def account_access(request: Request):
    uid = actor(request)
    with engine.connect() as conn:
        row = conn.execute(text(
            "SELECT status FROM public.users WHERE telegram_id=:uid"
        ), {"uid": uid}).first()
        if not row:
            raise HTTPException(404, "Пользователь не найден")
        notice = read_settings(conn)
    return {"status": row.status,
            "blocked": row.status == "blocked",
            "title": notice["title"],
            "message": notice["message"]}


@router.get("/admin/account-blocks/users")
def list_users(request: Request):
    admin(request)
    with engine.connect() as conn:
        rows = conn.execute(text("""
            SELECT telegram_id,partner_code,first_name,last_name,username,status,role
            FROM public.users ORDER BY (status='blocked') DESC, telegram_id
        """)).mappings().all()
    return {"users": [dict(r) for r in rows]}


@router.get("/admin/account-blocks/settings")
def account_block_settings(request: Request):
    admin(request)
    with engine.connect() as conn:
        return read_settings(conn)


@router.put("/admin/account-blocks/settings")
def update_block_settings(payload: BlockMessage, request: Request):
    admin(request)
    with engine.begin() as conn:
        version = conn.execute(text("""
            UPDATE public.vvd_account_block_settings
            SET title=:title,message=:message,version=version+1,updated_at=now()
            WHERE id=1 AND version=:version RETURNING version
        """), payload.model_dump()).scalar_one_or_none()
    if version is None:
        raise HTTPException(409, "Текст был изменён. Обновите страницу и повторите.")
    return {"success": True, "version": version}


@router.post("/admin/account-blocks/{telegram_id}")
def change_block(telegram_id: int, payload: BlockAction, request: Request):
    administrator = admin(request)
    if telegram_id == administrator or authorized_admin(telegram_id):
        raise HTTPException(403, "Администратора блокировать нельзя")
    with engine.begin() as conn:
        target = conn.execute(text("""
            SELECT status,role FROM public.users
            WHERE telegram_id=:uid FOR UPDATE
        """), {"uid": telegram_id}).mappings().first()
        if not target:
            raise HTTPException(404, "Пользователь не найден")
        if target["role"] == "admin":
            raise HTTPException(403, "Администратора блокировать нельзя")
        previous = "active" if payload.action == "block" else "blocked"
        following = "blocked" if payload.action == "block" else "active"
        if target["status"] != previous:
            raise HTTPException(409, "Статус уже изменён или недоступен для этого действия")
        conn.execute(text("""
            UPDATE public.users SET status=:status WHERE telegram_id=:uid
        """), {"status": following, "uid": telegram_id})
        conn.execute(text("""
            INSERT INTO public.vvd_account_block_audit(user_id,admin_id,action,reason)
            VALUES (:user,:admin,:action,:reason)
        """), {"user": telegram_id, "admin": administrator,
                "action": payload.action, "reason": payload.reason.strip()})
    return {"success": True, "telegram_id": telegram_id, "status": following}
