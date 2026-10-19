"""Per-offer VVD links and attributable clicks.

Legacy /smartlink and /go routes are unchanged. No balances, stats, postbacks
or conversions are written here. Routing depends on the offer, network and
vertical availability flags in the database; no hard-coded category name alone
permits or prevents redirect.
"""
import ipaddress
import re
import uuid
from urllib.parse import urlsplit, parse_qsl, urlencode, urlunsplit
from fastapi import APIRouter, Header, HTTPException
from fastapi.responses import RedirectResponse
from sqlalchemy import text
from sqlalchemy.exc import IntegrityError, SQLAlchemyError
from database import engine
from stars_payments import require_telegram_id

router=APIRouter(tags=["CPA neutral links"])
API_ROOT="https://vvd-cpa-v2.onrender.com"
PARAM_RE=re.compile(r"^[A-Za-z][A-Za-z0-9_]{0,47}$")

def _validated_destination(url: str, parameter: str, click_id: str, partner_parameter: str|None=None, partner_code: str|None=None) -> str:
    if not parameter or not PARAM_RE.fullmatch(parameter):
        raise HTTPException(409,"Настройка идентификатора клика не завершена")
    if partner_parameter is not None and (not PARAM_RE.fullmatch(partner_parameter) or partner_parameter==parameter):
        raise HTTPException(409,"Параметр партнёра совпадает с click_id или некорректен")
    if partner_parameter and (not partner_code or not re.fullmatch(r"VVD[A-Za-z0-9]{1,32}",partner_code)):
        raise HTTPException(409,"Код партнёра недоступен")
    try:
        parts=urlsplit(url)
        hostname=(parts.hostname or "").lower()
        if (parts.scheme!="https" or not hostname or parts.username or parts.password
                or parts.fragment or parts.port not in (None,443,8443)
                or hostname=="localhost"
                or hostname.endswith((".local",".internal",".localhost"))):
            raise ValueError("unsafe URL")
        try:
            ip=ipaddress.ip_address(hostname.strip("[]"))
        except ValueError:
            ip=None
        if ip is not None and not ip.is_global:
            raise ValueError("internal IP")
        old=parse_qsl(parts.query,keep_blank_values=True)
        if any(k==parameter or (partner_parameter and k==partner_parameter) for k,_ in old):
            raise ValueError("click parameter already exists in source URL")
        # Existing partner parameters are preserved in their original order.
        query=urlencode([*old,(parameter,click_id),*([(partner_parameter,partner_code)] if partner_parameter else [])])
        return urlunsplit((parts.scheme,parts.netloc,parts.path,query,""))
    except (ValueError,TypeError) as exc:
        raise HTTPException(409,"Проверьте исходный URL и параметр клика") from exc

def _active_offer(conn, offer_id: str):
    offer=conn.execute(text("""
       SELECT o.id,o.vertical_slug,o.source_url,o.network_id,o.status,
              o.click_param_override,n.click_param AS network_param,
              n.partner_param AS partner_param,
              u.is_active AS vertical_active,u.cpa_link_allowed AS vertical_allowed,
              n.is_active AS network_active
       FROM offers o
       JOIN cpa_verticals u ON u.slug=o.vertical_slug
       JOIN cpa_networks n ON n.id=o.network_id
       WHERE o.id=:offer_id
    """),{"offer_id":offer_id}).mappings().first()
    if not offer:
        raise HTTPException(404,"Предложение недоступно")
    if (not offer["vertical_allowed"] or offer["status"]!="published"
            or not offer["vertical_active"] or not offer["network_active"] or not offer["source_url"]):
        raise HTTPException(404,"Предложение недоступно")
    parameter=offer["click_param_override"] or offer["network_param"]
    _validated_destination(offer["source_url"],parameter,"configuration-check",offer["partner_param"],"VVDTEST")
    return offer

def _owned_link(conn, uid: int, offer_id: str):
    return conn.execute(text("""
       SELECT s.suffix,s.url FROM smartlinks s
       WHERE s.user_id=:uid AND s.offer_id=:offer_id
    """),{"uid":uid,"offer_id":offer_id}).mappings().first()

def _public_link(suffix: str):
    return API_ROOT+"/r/"+suffix

@router.get("/cpa/links/{offer_id}")
def get_personal_link(offer_id:str,x_telegram_init_data:str|None=Header(None)):
    uid=require_telegram_id(x_telegram_init_data)
    with engine.connect() as conn:
        _active_offer(conn,offer_id)
        row=_owned_link(conn,uid,offer_id)
    return {"url":_public_link(row["suffix"]) if row else None,"created":bool(row)}

@router.post("/cpa/links/{offer_id}")
def create_personal_link(offer_id:str,x_telegram_init_data:str|None=Header(None)):
    uid=require_telegram_id(x_telegram_init_data)
    try:
        with engine.begin() as conn:
            _active_offer(conn,offer_id)
            user=conn.execute(text("""
              SELECT telegram_id,partner_code FROM users
              WHERE telegram_id=:uid AND status='active'
            """),{"uid":uid}).mappings().first()
            if not user or not user["partner_code"]:
                raise HTTPException(403,"Аккаунт недоступен")
            previous=_owned_link(conn,uid,offer_id)
            if previous:
                return {"url":_public_link(previous["suffix"]),"created":False}
            suffix="s"+uuid.uuid4().hex
            url=_public_link(suffix)
            conn.execute(text("""
              INSERT INTO smartlinks(user_id,offer_id,suffix,url)
              VALUES(:uid,:offer_id,:suffix,:url)
              ON CONFLICT (user_id,offer_id) DO NOTHING
            """),{"uid":uid,"offer_id":offer_id,"suffix":suffix,"url":url})
            row=_owned_link(conn,uid,offer_id)
            if not row:
                raise HTTPException(503,"Не удалось сохранить ссылку")
            return {"url":_public_link(row["suffix"]),"created":row["suffix"]==suffix}
    except IntegrityError as exc:
        raise HTTPException(503,"Не удалось сохранить ссылку") from exc

@router.get("/r/{suffix}")
def neutral_click_redirect(suffix:str):
    if not re.fullmatch(r"s[a-f0-9]{32}",suffix):
        raise HTTPException(404,"Ссылка не найдена")
    click_id=str(uuid.uuid4())
    try:
        with engine.begin() as conn:
            row=conn.execute(text("""
              SELECT s.id AS smartlink_id,s.user_id,s.offer_id,u.partner_code
              FROM smartlinks s
              JOIN users u ON u.telegram_id=s.user_id
              WHERE s.suffix=:suffix AND u.status='active'
            """),{"suffix":suffix}).mappings().first()
            if not row:
                raise HTTPException(404,"Ссылка не найдена")
            offer=_active_offer(conn,row["offer_id"])
            redirect_url=_validated_destination(offer["source_url"],
                offer["click_param_override"] or offer["network_param"],click_id,
                offer["partner_param"],row["partner_code"])
            conn.execute(text("""
              INSERT INTO clicks(user_id,partner_code,click_id,vertical,
                  offer_id,network_id,smartlink_id)
              VALUES(:user_id,:partner_code,:click_id,:vertical,
                  :offer_id,:network_id,:smartlink_id)
            """),{"user_id":row["user_id"],"partner_code":row["partner_code"],
                  "click_id":click_id,"vertical":offer["vertical_slug"],
                  "offer_id":offer["id"],"network_id":offer["network_id"],
                  "smartlink_id":row["smartlink_id"]})
    except SQLAlchemyError as exc:
        raise HTTPException(503,"Регистрация перехода временно недоступна") from exc
    return RedirectResponse(redirect_url,status_code=302,headers={"Cache-Control":"no-store"})
