"""Browser Telegram Login (OIDC popup): verified ID tokens and revocable website sessions.

No Telegram identity can be supplied directly by the browser. The one-time
nonce, signed OIDC JWT, audience, expiry, issuer and DB session are all checked.
Existing Telegram Mini App initData authentication is unchanged.
"""
import hashlib
import hmac
import logging
import os
import secrets
import time
from datetime import datetime, timedelta, timezone
from uuid import uuid4

import jwt
from fastapi import APIRouter, Header, HTTPException
from pydantic import BaseModel, Field
from sqlalchemy import text

from database import engine, save_user

logger = logging.getLogger(__name__)
router = APIRouter(prefix="/web-auth", tags=["Website Telegram Login"])
TELEGRAM_ISSUER = "https://oauth.telegram.org"
JWKS_URL = "https://oauth.telegram.org/.well-known/jwks.json"
SESSION_LIFETIME = timedelta(hours=6)
NONCE_LIFETIME = timedelta(minutes=5)
_jwks = jwt.PyJWKClient(JWKS_URL, cache_jwk_set=True, lifespan=3600)


def client_id() -> str:
    configured = os.getenv("TELEGRAM_LOGIN_CLIENT_ID", "").strip()
    raw = configured or os.getenv("BOT_TOKEN", "").split(":", 1)[0]
    if not raw.isdigit() or int(raw) <= 0:
        raise HTTPException(status_code=503, detail="telegram_login_not_configured")
    return raw


def session_secret() -> bytes:
    token = os.getenv("WEB_SESSION_SECRET", "").strip()
    if token:
        if len(token) < 32:
            raise HTTPException(status_code=503, detail="weak_web_session_secret")
    else:
        # Separate the web token key from the Mini App HMAC key.
        token = os.getenv("BOT_TOKEN", "")
        if len(token) < 35:
            raise HTTPException(status_code=503, detail="web_session_not_configured")
    return hmac.new(token.encode(), b"vvd-cpa-web-session-hs256-v1", hashlib.sha256).digest()


def _expired_cleanup(conn):
    conn.execute(text("""
        DELETE FROM public.vvd_web_auth_challenges
         WHERE expires_at < now() - interval '1 hour'
    """))
    conn.execute(text("""
        DELETE FROM public.vvd_web_auth_sessions
         WHERE expires_at < now() - interval '7 days'
    """))


def verify_web_session(raw: str) -> int:
    """Called by the existing central require_telegram_id guard."""
    from stars_payments import TelegramAuthError
    if not raw.startswith("vvdweb1.") or len(raw) > 3000:
        raise TelegramAuthError("invalid_web_session")
    try:
        claims = jwt.decode(
            raw[len("vvdweb1."):], session_secret(), algorithms=["HS256"],
            issuer="vvd-cpa-web", audience="vvd-cpa-api",
            options={"require": ["sub", "jti", "iat", "exp", "iss", "aud"]},
            leeway=15,
        )
        uid = int(claims["sub"])
        ident = claims["jti"]
        if uid <= 0 or len(ident) > 64:
            raise ValueError("Invalid identity")
        with engine.connect() as conn:
            found = conn.execute(text("""
                SELECT 1 FROM public.vvd_web_auth_sessions s
                JOIN public.users u ON u.telegram_id = s.telegram_id
                WHERE s.session_id=CAST(:sid AS uuid) AND s.telegram_id=:uid
                  AND s.revoked_at IS NULL AND s.expires_at>now() AND u.status='active'
            """), {"sid": ident, "uid": uid}).first()
        if not found:
            raise ValueError("Session revoked or user disabled")
        return uid
    except HTTPException:
        raise TelegramAuthError("auth_config_error") from None
    except Exception:
        raise TelegramAuthError("invalid_web_session") from None


@router.get("/config")
def login_config():
    return {"client_id": int(client_id()), "provider": "telegram"}


@router.post("/challenge")
def new_challenge():
    # The challenge is short-lived and single-use, bound to the ID token nonce.
    client_id()
    nonce = secrets.token_urlsafe(32)
    digest = hashlib.sha256(nonce.encode()).hexdigest()
    with engine.begin() as conn:
        _expired_cleanup(conn)
        conn.execute(text("""
            INSERT INTO public.vvd_web_auth_challenges(nonce_hash,expires_at)
            VALUES (:hash, now() + interval '5 minutes')
        """), {"hash": digest})
    return {"nonce": nonce, "client_id": int(client_id())}


class TelegramWebsiteLogin(BaseModel):
    id_token: str = Field(min_length=100, max_length=16000)
    nonce: str = Field(min_length=20, max_length=256)


@router.post("/telegram")
def login(payload: TelegramWebsiteLogin):
    # Challenge consumption is atomic. Even a failed attempt cannot be retried
    # with the same nonce, preventing token replay across parallel requests.
    digest = hashlib.sha256(payload.nonce.encode()).hexdigest()
    with engine.begin() as conn:
        consumed = conn.execute(text("""
            UPDATE public.vvd_web_auth_challenges SET used_at=now()
             WHERE nonce_hash=:digest AND used_at IS NULL AND expires_at>now()
             RETURNING nonce_hash
        """), {"digest": digest}).scalar_one_or_none()
    if consumed is None:
        raise HTTPException(status_code=401, detail="expired_login_challenge")
    try:
        key = _jwks.get_signing_key_from_jwt(payload.id_token).key
        claims = jwt.decode(
            payload.id_token, key,
            algorithms=["RS256"],
            audience=client_id(), issuer=TELEGRAM_ISSUER,
            options={"require": ["iss", "aud", "sub", "iat", "exp", "nonce"]},
            leeway=15,
        )
        if not hmac.compare_digest(str(claims["nonce"]), payload.nonce):
            raise ValueError("Mismatched nonce")
        now = int(time.time())
        if int(claims["iat"]) > now + 15 or now - int(claims["iat"]) > 3600:
            raise ValueError("Stale identity token")
        # OIDC 'sub' is not guaranteed to equal the ordinary Telegram user ID.
        # The signed 'id' profile claim is the identity used by the existing Mini App.
        if "id" not in claims or isinstance(claims["id"], bool):
            raise ValueError("Missing Telegram profile ID")
        uid = int(claims["id"])
        if uid <= 0 or uid >= 2**63:
            raise ValueError("Invalid Telegram ID")
        if not str(claims["sub"]).isdigit():
            raise ValueError("Invalid Telegram subject")
    except Exception:
        logger.info("website_telegram_login_rejected: token_invalid")
        raise HTTPException(status_code=401, detail="invalid_telegram_identity") from None

    try:
        first_name = str(claims.get("given_name") or claims.get("name") or "Telegram")[:255]
        last_name = str(claims.get("family_name") or "")[:255] or None
        username = str(claims.get("preferred_username") or "")[:255] or None
        photo = str(claims.get("picture") or "")[:2048] or None
        with engine.connect() as conn:
            is_new = conn.execute(text("SELECT 1 FROM public.users WHERE telegram_id=:uid"), {"uid": uid}).first() is None
        user = save_user(uid, first_name, last_name, username, photo)
        if user["status"] != "active":
            raise HTTPException(status_code=403, detail="account_inactive")
        session_id = str(uuid4())
        now = datetime.now(timezone.utc)
        expires = now + SESSION_LIFETIME
        with engine.begin() as conn:
            conn.execute(text("""
                INSERT INTO public.vvd_web_auth_sessions(session_id,telegram_id,expires_at)
                VALUES (CAST(:sid AS uuid),:uid,:expires)
            """), {"sid": session_id, "uid": uid, "expires": expires})
        token = jwt.encode({
            "sub": str(uid), "jti": session_id,
            "iss": "vvd-cpa-web", "aud": "vvd-cpa-api",
            "iat": int(now.timestamp()), "exp": int(expires.timestamp()),
        }, session_secret(), algorithm="HS256")
    except HTTPException:
        raise
    except Exception:
        logger.exception("website_telegram_login_storage_error")
        raise HTTPException(status_code=503, detail="web_login_unavailable") from None
    return {
        "session": "vvdweb1." + token,
        "expires_at": expires.isoformat(),
        "registered": is_new,
        "user": {k: user.get(k) for k in
                 ("telegram_id","first_name","last_name","username","photo_url",
                  "partner_code","role","status")},
    }


@router.get("/me")
def session_profile(x_telegram_init_data: str | None = Header(None)):
    uid = verify_web_session(x_telegram_init_data or "")
    with engine.connect() as conn:
        user = conn.execute(text("""
            SELECT telegram_id, first_name, last_name, username, photo_url,
                   partner_code, role, status, balance, hold, withdrawn
              FROM public.users WHERE telegram_id=:uid
        """), {"uid": uid}).mappings().one_or_none()
    if not user:
        raise HTTPException(status_code=401, detail="session_invalid")
    return {"user": {k: user[k] for k in ("telegram_id","first_name","last_name","username","photo_url","partner_code","role","status")},
            "wallet": {k: float(user[k] or 0) for k in ("balance","hold","withdrawn")}}


@router.post("/logout")
def logout(x_telegram_init_data: str | None = Header(None)):
    raw = x_telegram_init_data or ""
    verify_web_session(raw)
    claims = jwt.decode(
        raw[len("vvdweb1."):], session_secret(), algorithms=["HS256"],
        issuer="vvd-cpa-web", audience="vvd-cpa-api",
    )
    with engine.begin() as conn:
        conn.execute(text("""
            UPDATE public.vvd_web_auth_sessions SET revoked_at=now()
            WHERE session_id=CAST(:sid AS uuid) AND revoked_at IS NULL
        """), {"sid": claims["jti"]})
    return {"success": True}
