"""Stage 4 neutral-only CPA postbacks. Does not touch wallet or old handlers."""
import hashlib
import hmac
import json
import logging
import re
import secrets
from decimal import Decimal, InvalidOperation
from fastapi import APIRouter, Header, HTTPException, Request
from pydantic import BaseModel, Field, field_validator
from sqlalchemy import text
from sqlalchemy.exc import IntegrityError
from database import engine
from stars_payments import require_telegram_id
from access_guard import authorized_admin

router=APIRouter(prefix="/cpa",tags=["CPA secure postback"])
LOG=logging.getLogger(__name__)
ALLOWED={"pending","approved","rejected"}
PARAM=re.compile(r"^[a-zA-Z][a-zA-Z0-9_]{0,47}$")
SAFE_ID=re.compile(r"^[\w:.\-]{1,120}$",re.ASCII)
EXTERNAL_STATUS=re.compile(r"^[A-Za-z0-9][A-Za-z0-9_-]{0,47}$")
NEUTRAL=frozenset({"utilities","education","productivity","software","technology"})
DEFAULT_PARAMS={"click":"click_id","transaction":"transaction_id","status":"status","amount":"amount","currency":"currency"}
DEFAULT_MAP={"pending":"pending","approved":"approved","rejected":"rejected"}

def admin(raw):
    uid=require_telegram_id(raw)
    if not authorized_admin(uid):
        raise HTTPException(403,"Administrator access required")

class ProviderConfig(BaseModel):
    postback_enabled:bool=False
    postback_params:dict[str,str]=Field(default_factory=lambda:dict(DEFAULT_PARAMS))
    postback_status_map:dict[str,str]=Field(default_factory=lambda:dict(DEFAULT_MAP))
    @field_validator("postback_params")
    @classmethod
    def params_valid(cls,v):
        if set(v)!=set(DEFAULT_PARAMS) or len(set(v.values()))!=len(v) or not all(PARAM.fullmatch(x) for x in v.values()):
            raise ValueError("Invalid/duplicate parameter names")
        return v
    @field_validator("postback_status_map")
    @classmethod
    def map_valid(cls,v):
        if not v or len(v)>20 or not all(EXTERNAL_STATUS.fullmatch(k) and x in ALLOWED for k,x in v.items()):
            raise ValueError("Invalid external status map")
        return v

@router.get("/admin/networks/{network_id}/postback")
def get_provider(network_id:int,x_telegram_init_data:str|None=Header(None)):
    admin(x_telegram_init_data)
    with engine.connect() as c:
        row=c.execute(text("""SELECT postback_enabled,postback_params,postback_status_map,
             postback_key_hash IS NOT NULL AS configured,postback_last_received_at
             FROM cpa_networks WHERE id=:id"""),{"id":network_id}).mappings().first()
    if not row:raise HTTPException(404,"Network not found")
    return {**dict(row),"endpoint":f"https://vvd-cpa-v2.onrender.com/cpa/postback/{network_id}"}

@router.put("/admin/networks/{network_id}/postback")
def configure_provider(network_id:int,payload:ProviderConfig,x_telegram_init_data:str|None=Header(None)):
    admin(x_telegram_init_data)
    with engine.begin() as c:
        row=c.execute(text("""UPDATE cpa_networks SET postback_enabled=:enabled,
          postback_params=CAST(:params AS jsonb),postback_status_map=CAST(:map AS jsonb)
          WHERE id=:id RETURNING id"""),{"id":network_id,"enabled":payload.postback_enabled,
          "params":json.dumps(payload.postback_params),"map":json.dumps(payload.postback_status_map)}).first()
    if not row:raise HTTPException(404,"Network not found")
    return {"ok":True}

@router.post("/admin/networks/{network_id}/postback/rotate")
def rotate_provider_key(network_id:int,x_telegram_init_data:str|None=Header(None)):
    admin(x_telegram_init_data)
    key=secrets.token_urlsafe(48)
    digest=hashlib.sha256(key.encode()).hexdigest()
    with engine.begin() as c:
        row=c.execute(text("""UPDATE cpa_networks SET postback_key_hash=:hash,
           postback_enabled=FALSE WHERE id=:id RETURNING id"""),{"id":network_id,"hash":digest}).first()
    if not row:raise HTTPException(404,"Network not found")
    # One-time owner-only display. DB stores only hash; never write key to logs.
    return {"secret_once":key,"postback_enabled":False}

@router.post("/postback/{network_id}")
async def receive_postback(network_id:int,request:Request,
                           x_vvd_postback_key:str|None=Header(None)):
    if request.headers.get("content-type","").split(";")[0].strip().lower()!="application/json":
        raise HTTPException(415,"JSON required")
    try:
        declared_size=int(request.headers.get("content-length","0"))
    except ValueError:
        raise HTTPException(400,"Invalid request size")
    if declared_size<0 or declared_size>4096:
        raise HTTPException(413,"Payload too large")
    raw=await request.body()
    if len(raw)>4096:raise HTTPException(413,"Payload too large")
    with engine.begin() as c:
        provider=c.execute(text("""SELECT id,postback_enabled,postback_key_hash,
          postback_params,postback_status_map FROM cpa_networks WHERE id=:id FOR UPDATE"""),
          {"id":network_id}).mappings().first()
        if not provider or not provider["postback_enabled"] or not provider["postback_key_hash"]:
            raise HTTPException(404,"Source unavailable")
        supplied=hashlib.sha256((x_vvd_postback_key or "").encode()).hexdigest()
        if not hmac.compare_digest(supplied,provider["postback_key_hash"]):
            LOG.warning("cpa_postback_rejected reason=bad_auth network_id=%s",network_id)
            raise HTTPException(401,"Invalid source authentication")
        try:
            payload=json.loads(raw)
            if not isinstance(payload,dict) or not all(isinstance(k,str) and isinstance(v,(str,int,float)) and not isinstance(v,bool) for k,v in payload.items()):
                raise ValueError("invalid fields")
            names=provider["postback_params"]
            click=str(payload[names["click"]])
            txn=str(payload[names["transaction"]])
            ext_status=str(payload[names["status"]])
            state=provider["postback_status_map"].get(ext_status)
            amount=Decimal(str(payload.get(names["amount"],"0")))
            currency=str(payload.get(names["currency"],"USD")).upper()
        except (ValueError,TypeError,KeyError,InvalidOperation,OverflowError) as exc:
            raise HTTPException(422,"Invalid postback payload") from exc
        if (not SAFE_ID.fullmatch(click) or not SAFE_ID.fullmatch(txn) or state not in ALLOWED
                or not amount.is_finite() or amount<0 or amount>1000000
                or amount.as_tuple().exponent< -2 or not re.fullmatch(r"[A-Z]{3}",currency)):
            raise HTTPException(422,"Invalid postback fields")
        found=c.execute(text("""SELECT c.user_id,c.partner_code,c.offer_id,c.vertical,c.network_id
          FROM clicks c WHERE c.click_id=:click"""),{"click":click}).mappings().first()
        if (not found or found["network_id"]!=network_id or not found["offer_id"]
                or found["vertical"] not in NEUTRAL):
            LOG.warning("cpa_postback_rejected reason=unattributed network_id=%s",network_id)
            raise HTTPException(404,"Attributed click not found")
        existing=c.execute(text("""SELECT id,status,transaction_id,network_id FROM conversions
             WHERE click_id=:click FOR UPDATE"""),{"click":click}).mappings().first()
        transaction=f"cpa:{network_id}:{txn}"
        if existing:
            if existing["transaction_id"]!=transaction or existing["network_id"]!=network_id or existing["status"] not in ALLOWED:
                raise HTTPException(409,"Conflicting conversion")
            old=existing["status"]
            if old==state:
                return {"ok":True,"duplicate":True,"status":state}
            if old in ("approved","rejected"):
                raise HTTPException(409,"Final conversion status cannot change")
            c.execute(text("""UPDATE conversions SET status=:status,
              payout_gross=:gross,currency=:currency,external_status=:external,
              processed_at=now() WHERE id=:id"""),
              {"id":existing["id"],"status":state,"gross":amount,
               "currency":currency,"external":ext_status})
            result={"ok":True,"updated":True,"status":state}
        else:
            conflict=c.execute(text("SELECT id FROM conversions WHERE transaction_id=:txn"),{"txn":transaction}).first()
            if conflict:raise HTTPException(409,"Transaction ID already used")
            try:
                c.execute(text("""INSERT INTO conversions(click_id,user_id,offer_id,payout_gross,
                payout_net,status,transaction_id,network_id,vertical_slug,partner_code,currency,
                postback_source,external_status)
                VALUES(:click,:uid,:offer,:amount,0,:status,:txn,:network,:vertical,:code,
                :currency,'stage4',:external)"""),
                {"click":click,"uid":found["user_id"],"offer":found["offer_id"],
                 "amount":amount,"status":state,"txn":transaction,"network":network_id,
                 "vertical":found["vertical"],"code":found["partner_code"],
                 "currency":currency,"external":ext_status})
            except IntegrityError as exc:
                raise HTTPException(409,"Duplicate click or transaction") from exc
            result={"ok":True,"created":True,"status":state}
        c.execute(text("UPDATE cpa_networks SET postback_last_received_at=now() WHERE id=:id"),
                  {"id":network_id})
        return result
