"""Signed Telegram user authorization for legacy VVD CPA endpoints.

Does not touch financial calculations, postbacks, public /go redirects,
or the separate tools/AI modules.
"""
import os
from fastapi.responses import JSONResponse
from sqlalchemy import text
from database import engine
from stars_payments import verified_telegram_id, TelegramAuthError
import logging

logger = logging.getLogger(__name__)

# Existing legacy administrator from the current Admin/Profile UI. Optional
# env override supports migrating to database-backed roles.
LEGACY_ADMIN_ID = 232682307

def authorized_admin(uid: int) -> bool:
    configured=os.getenv("ADMIN_TELEGRAM_IDS")
    allowed={int(x.strip()) for x in (configured or str(LEGACY_ADMIN_ID)).split(",") if x.strip().isdigit()}
    if uid in allowed:
        return True
    with engine.connect() as conn:
        role=conn.execute(text("SELECT role FROM users WHERE telegram_id=:uid"),{"uid":uid}).scalar()
    return role=="admin"

def user_owns_code(uid:int,code:str)->bool:
    with engine.connect() as conn:
        row=conn.execute(text("SELECT 1 FROM users WHERE telegram_id=:uid AND partner_code=:code"),
                         {"uid":uid,"code":code}).first()
    return row is not None

def protected(path:str,method:str)->bool:
    return (path.startswith(("/balance/","/referral/","/statistics/","/smartlink/","/withdrawals",
                              "/admin/"))
            or path=="/chat/messages" or (path=="/chat/online" and method=="POST"))

async def access_guard(request,call_next):
    path=request.url.path
    if not protected(path,request.method):
        return await call_next(request)
    try:
        uid=verified_telegram_id(request.headers.get("X-Telegram-Init-Data",""))
    except TelegramAuthError as exc:
        logger.warning("telegram_access_rejected code=%s", exc.code)
        status = 503 if exc.code == "auth_config_error" else 401
        return JSONResponse({"detail":{"code":exc.code}},status_code=status)
    parts=path.strip("/").split("/")
    admin=authorized_admin(uid) if path.startswith("/admin/") else False
    if path.startswith("/admin/") and not admin:
        return JSONResponse({"detail":"Administrator access required"},status_code=403)
    if parts[0] in ("balance","referral","statistics","smartlink") and len(parts)>1:
        try:
            requested=int(parts[1])
        except ValueError:
            return JSONResponse({"detail":"Invalid account"},status_code=403)
        if requested!=uid and not authorized_admin(uid):
            return JSONResponse({"detail":"Access denied"},status_code=403)
    if parts[0]=="withdrawals" and len(parts)==2 and request.method=="GET":
        if not user_owns_code(uid,parts[1]) and not authorized_admin(uid):
            return JSONResponse({"detail":"Access denied"},status_code=403)
    if path=="/withdrawals" and request.method=="POST":
        # Do not modify the withdrawal logic; check only the caller's ownership
        # of the partner code before executing any existing finance code.
        from json import loads
        try:
            data=loads(await request.body())
        except (ValueError,TypeError):
            return JSONResponse({"detail":"Invalid request"},status_code=400)
        if not isinstance(data,dict) or not user_owns_code(uid,str(data.get("partner_code",""))):
            return JSONResponse({"detail":"Access denied"},status_code=403)
    if path in ("/chat/messages","/chat/online") and request.method=="POST":
        from json import loads
        try:
            data=loads(await request.body())
        except (ValueError,TypeError):
            return JSONResponse({"detail":"Invalid request"},status_code=400)
        if not isinstance(data,dict):
            return JSONResponse({"detail":"Invalid request"},status_code=400)
        actor_key="sender_id" if path=="/chat/messages" else "telegram_id"
        try:
            if int(data.get(actor_key,0))!=uid:
                return JSONResponse({"detail":"Access denied"},status_code=403)
        except (ValueError,TypeError):
            return JSONResponse({"detail":"Access denied"},status_code=403)
    return await call_next(request)
