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
from cpa_finance import post_approved_hold, FinanceIneligible, FinanceInconsistent

router=APIRouter(prefix="/cpa",tags=["CPA secure postback"])
LOG=logging.getLogger(__name__)
ALLOWED={"pending","approved","rejected"}
PARAM=re.compile(r"^[a-zA-Z][a-zA-Z0-9_]{0,47}$")
SAFE_ID=re.compile(r"^[\w:.\-]{1,120}$",re.ASCII)
EXTERNAL_STATUS=re.compile(r"^[A-Za-z0-9][A-Za-z0-9_-]{0,47}$")

DEFAULT_PARAMS={"click":"click_id","transaction":"transaction_id","status":"status","amount":"amount","currency":"currency"}
DEFAULT_MAP={"pending":"pending","approved":"approved","rejected":"rejected"}

def admin(raw):
    uid=require_telegram_id(raw)
    if not authorized_admin(uid):
        raise HTTPException(403,"Administrator access required")

class ProviderConfig(BaseModel):
    postback_enabled:bool=False
    postback_method:str=Field("POST_JSON",pattern="^(POST_JSON|GET_QUERY)$")
    postback_params:dict[str,str]=Field(default_factory=lambda:dict(DEFAULT_PARAMS))
    postback_status_map:dict[str,str]=Field(default_factory=lambda:dict(DEFAULT_MAP))
    @field_validator("postback_params")
    @classmethod
    def params_valid(cls,v):
        if (set(v)!=set(DEFAULT_PARAMS) or len(set(v.values()))!=len(v)
            or not all(PARAM.fullmatch(x) and x.lower()!="vvd_key" for x in v.values())):
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
        row=c.execute(text("""SELECT postback_enabled,postback_method,postback_params,postback_status_map,
             postback_key_hash IS NOT NULL AS configured,postback_last_received_at
             FROM cpa_networks WHERE id=:id"""),{"id":network_id}).mappings().first()
    if not row:raise HTTPException(404,"Network not found")
    # Per-network bearer secret: providers that cannot send headers can put it
    # in the HTTPS GET callback URL as vvd_key. Never return its plaintext.
    return {**dict(row),"get_auth_ready":bool(row["configured"]),
        "get_auth_reason":"Создайте индивидуальный секрет для GET-ссылки",
        "endpoint":f"https://vvd-cpa-v2.onrender.com/cpa/postback/{network_id}"}

@router.put("/admin/networks/{network_id}/postback")
def configure_provider(network_id:int,payload:ProviderConfig,x_telegram_init_data:str|None=Header(None)):
    admin(x_telegram_init_data)
    # GET_QUERY networks may receive authenticated POST/JSON from the existing gateway.
    # Direct GET authentication remains enforced separately.
    with engine.begin() as c:
        row=c.execute(text("""UPDATE cpa_networks SET postback_enabled=:enabled,
          postback_method=:method,postback_params=CAST(:params AS jsonb),postback_status_map=CAST(:map AS jsonb)
          WHERE id=:id RETURNING id"""),{"id":network_id,"enabled":payload.postback_enabled,
          "method":payload.postback_method,"params":json.dumps(payload.postback_params),"map":json.dumps(payload.postback_status_map)}).first()
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

def _accept(c,provider,raw,supplied_key,network_id,is_test=False):
    """One DB transaction for authenticated attribution, approval and ledger.

    Until finance epoch activation this remains the original neutral postback:
    no ledger credit and no historical balance changes.
    """
    supplied=hashlib.sha256((supplied_key or "").encode()).hexdigest()
    if not hmac.compare_digest(supplied,provider["postback_key_hash"]):
        LOG.warning("cpa_postback_rejected reason=bad_auth network_id=%s",network_id)
        raise HTTPException(401,"Invalid source authentication")
    try:
        payload=json.loads(raw)
        if not isinstance(payload,dict) or not all(
            isinstance(k,str) and isinstance(v,(str,int,float)) and not isinstance(v,bool)
            for k,v in payload.items()
        ):
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
    if (not SAFE_ID.fullmatch(click) or not SAFE_ID.fullmatch(txn)
            or state not in ALLOWED or not amount.is_finite() or amount<0
            or amount>1000000 or amount.as_tuple().exponent < -2
            or not re.fullmatch(r"[A-Z]{3}",currency)):
        raise HTTPException(422,"Invalid postback fields")
    found=c.execute(text("""SELECT c.id,c.user_id,c.partner_code,c.offer_id,
      c.vertical,c.network_id,u.cpa_link_allowed AND u.is_active AS allowed
      FROM clicks c JOIN offers o ON o.id=c.offer_id
      JOIN cpa_verticals u ON u.slug=o.vertical_slug
      WHERE c.click_id=:click AND o.network_id=c.network_id AND o.vertical_slug=c.vertical"""),
      {"click":click}).mappings().first()
    if (not found or found["network_id"]!=network_id or not found["offer_id"]
            or not found["allowed"]):
        LOG.warning("cpa_postback_rejected reason=unattributed network_id=%s",network_id)
        raise HTTPException(404,"Attributed click not found")

    # The PR23 schema is intentionally optional until its deployment. This
    # preserves Stage 4 and legacy-backend test contracts before cutover.
    schema_ready=c.execute(text(
        "SELECT to_regclass('public.cpa_finance_epoch') IS NOT NULL"
    )).scalar_one()
    epoch=(c.execute(text("""SELECT activated_at,legacy_max_click_row_id
        FROM public.cpa_finance_epoch WHERE id=1""")).mappings().first()
        if schema_ready else None)
    finance_active=bool(epoch and epoch["activated_at"] is not None)
    if finance_active:
        # All finance writers lock the user BEFORE a conversion and ledger.
        user=c.execute(text("""SELECT telegram_id FROM public.users
            WHERE telegram_id=:uid FOR UPDATE"""),
            {"uid":found["user_id"]}).first()
        if not user:
            raise HTTPException(409,"Missing attributed user")
    eligible=bool(finance_active and not is_test and currency=="USD" and
                  found["id"] > epoch["legacy_max_click_row_id"])
    if eligible:
        # Production clicks.created_at is timestamp (UTC). Cross-check the
        # immutable cutover timestamp, not only a sequence ID.
        eligible=c.execute(text("""SELECT
            (created_at AT TIME ZONE 'UTC') >= :cutover
            FROM public.clicks WHERE id=:id"""),
            {"id":found["id"],"cutover":epoch["activated_at"]}).scalar_one()

    existing=c.execute(text("""SELECT id,status,transaction_id,network_id,is_test
         """+(""",finance_eligible_at""" if schema_ready else "")+"""
         FROM conversions WHERE click_id=:click FOR UPDATE"""),
         {"click":click}).mappings().first()
    transaction=f"cpa:{network_id}:{txn}"
    credit_id=None
    if existing:
        if existing["is_test"] and not is_test:
            raise HTTPException(409,"Test conversion cannot be updated by external postback")
        if (existing["transaction_id"]!=transaction
                or existing["network_id"]!=network_id
                or existing["status"] not in ALLOWED):
            raise HTTPException(409,"Conflicting conversion")
        old=existing["status"]
        if old==state:
            return {"ok":True,"duplicate":True,"status":state}
        if old in ("approved","rejected"):
            raise HTTPException(409,"Final conversion status cannot change")
        if (schema_ready and existing["finance_eligible_at"] is not None
                and state=="approved" and not eligible):
            raise HTTPException(409,"Eligible conversion must retain its original USD attribution")
        if (eligible and existing["finance_eligible_at"] is not None
                and state=="approved"):
            c.execute(text("""UPDATE conversions SET status=:status,
                payout_gross=:gross,currency=:currency,external_status=:external,
                finance_approved_at=clock_timestamp(),processed_at=now()
                WHERE id=:id"""),
                {"id":existing["id"],"status":state,"gross":amount,
                 "currency":currency,"external":ext_status})
            credit_id=existing["id"]
        else:
            c.execute(text("""UPDATE conversions SET status=:status,
                payout_gross=:gross,currency=:currency,external_status=:external,
                processed_at=now() WHERE id=:id"""),
                {"id":existing["id"],"status":state,"gross":amount,
                 "currency":currency,"external":ext_status})
        result={"ok":True,"updated":True,"status":state}
    else:
        conflict=c.execute(text("SELECT id FROM conversions WHERE transaction_id=:txn"),
                           {"txn":transaction}).first()
        if conflict:
            raise HTTPException(409,"Transaction ID already used")
        args={"click":click,"uid":found["user_id"],"offer":found["offer_id"],
              "amount":amount,"status":state,"txn":transaction,
              "network":network_id,"vertical":found["vertical"],
              "code":found["partner_code"],"currency":currency,
              "external":ext_status,"is_test":is_test}
        if eligible:
            sql="""INSERT INTO conversions(click_id,user_id,offer_id,payout_gross,
               payout_net,status,transaction_id,network_id,vertical_slug,
               partner_code,currency,postback_source,external_status,is_test,
               finance_eligible_at,finance_approved_at)
               VALUES(:click,:uid,:offer,:amount,0,:status,:txn,:network,
               :vertical,:code,:currency,'stage4',:external,:is_test,
               clock_timestamp(),CASE WHEN :status='approved'
                   THEN clock_timestamp() ELSE NULL END) RETURNING id"""
        else:
            sql="""INSERT INTO conversions(click_id,user_id,offer_id,payout_gross,
               payout_net,status,transaction_id,network_id,vertical_slug,
               partner_code,currency,postback_source,external_status,is_test)
               VALUES(:click,:uid,:offer,:amount,0,:status,:txn,:network,
               :vertical,:code,:currency,'stage4',:external,:is_test)
               RETURNING id"""
        try:
            inserted_id=c.execute(text(sql),args).scalar_one()
            if eligible and state=="approved":
                credit_id=inserted_id
        except IntegrityError as exc:
            raise HTTPException(409,"Duplicate click or transaction") from exc
        result={"ok":True,"created":True,"status":state}

    if credit_id is not None:
        # No external transfer: these are internal accounting events only.
        # A failure rolls back the conversion approval and hold/fee entries.
        try:
            hold=post_approved_hold(c,credit_id)
        except (FinanceIneligible,FinanceInconsistent,ValueError) as exc:
            LOG.error("cpa_finance_rejected reason=integrity network_id=%s",network_id)
            raise HTTPException(409,"CPA finance validation failed") from exc
        result["hold_credited"]=bool(hold["credited"])
    if not is_test:
        c.execute(text("UPDATE cpa_networks SET postback_last_received_at=now() WHERE id=:id"),
                  {"id":network_id})
    return result

@router.post("/postback/{network_id}")
async def receive_postback(network_id:int,request:Request,
                           x_vvd_postback_key:str|None=Header(None)):
    if request.headers.get("content-type","").split(";")[0].strip().lower()!="application/json":
        raise HTTPException(415,"JSON required")
    try:
        declared_size=int(request.headers.get("content-length","0"))
    except ValueError:
        raise HTTPException(400,"Invalid request size")
    if declared_size<0 or declared_size>4096:raise HTTPException(413,"Payload too large")
    raw=await request.body()
    if len(raw)>4096:raise HTTPException(413,"Payload too large")
    with engine.begin() as c:
        provider=c.execute(text("""SELECT id,postback_enabled,postback_key_hash,
          postback_method,postback_params,postback_status_map FROM cpa_networks WHERE id=:id FOR UPDATE"""),
          {"id":network_id}).mappings().first()
        if not provider or not provider["postback_enabled"] or not provider["postback_key_hash"]:
            raise HTTPException(404,"Source unavailable")
        if provider["postback_method"] not in ("POST_JSON","GET_QUERY"):
            raise HTTPException(405,"Unsupported postback method")
        # GET_QUERY labels the provider's inbound format; only authenticated
        # POST/JSON from the trusted gateway reaches this handler.
        # Direct GET remains denied and no client-supplied IP is trusted.
        return _accept(c,provider,raw,x_vvd_postback_key,network_id)

@router.get("/postback/{network_id}")
async def receive_get_postback(network_id:int,request:Request,
                               x_vvd_postback_key:str|None=Header(None)):
    # Accept either the existing network-specific HTTPS header or a high-entropy
    # per-network bearer key in a provider's HTTPS callback URL. Do not accept
    # unauthenticated financial events or trust client-controlled IP headers.
    raw_query=request.scope.get("query_string",b"")
    if len(raw_query)>4096:
        raise HTTPException(413,"Query too large")
    params=request.query_params
    # Minimise accidental disclosure in downstream access logging. Reverse
    # proxies may still log the original URL, so the bearer token is sensitive.
    request.scope["query_string"]=b""
    if len(list(params.multi_items()))!=len(set(params.keys())):
        raise HTTPException(422,"Duplicate postback fields")
    if any(k.lower() in ("key","secret","token","password","api_key",
                         "x_vvd_postback_key") for k in params.keys()):
        raise HTTPException(422,"Unexpected secret parameter")
    query_key=params.get("vvd_key")
    if query_key is not None and x_vvd_postback_key is not None:
        raise HTTPException(422,"Use one postback authentication method")
    auth_key=query_key if query_key is not None else x_vvd_postback_key
    cleaned=dict(params)
    cleaned.pop("vvd_key",None)
    raw=json.dumps(cleaned,separators=(",",":")).encode()
    if len(raw)>4096:
        raise HTTPException(413,"Payload too large")
    with engine.begin() as c:
        provider=c.execute(text("""SELECT id,postback_enabled,postback_key_hash,
          postback_method,postback_params,postback_status_map
          FROM cpa_networks WHERE id=:id FOR UPDATE"""),
          {"id":network_id}).mappings().first()
        if (not provider or not provider["postback_enabled"]
                or not provider["postback_key_hash"]
                or provider["postback_method"]!="GET_QUERY"):
            raise HTTPException(404,"Source unavailable")
        # Both authenticated GET formats reuse existing attribution, status,
        # duplicate handling and financial eligibility decisions.
        return _accept(c,provider,raw,auth_key,network_id)

def _snapshot(c):
    return tuple(c.execute(text(q)).scalar_one() for q in (
        "SELECT COALESCE(SUM(balance),0) FROM users",
        "SELECT COALESCE(SUM(hold),0) FROM users",
        "SELECT COALESCE(SUM(withdrawn),0) FROM users",
        "SELECT count(*) FROM withdrawals",
        "SELECT COALESCE(SUM(amount),0) FROM withdrawals",
        "SELECT COALESCE(SUM(payout_gross),0) FROM conversions WHERE is_test=FALSE",
        "SELECT COALESCE(SUM(payout_net),0) FROM conversions WHERE is_test=FALSE",
        "SELECT COALESCE(SUM(income),0) FROM statistics",
    ))

@router.post("/admin/networks/{network_id}/postback/check")
def check_postback(network_id:int,x_telegram_init_data:str|None=Header(None)):
    admin(x_telegram_init_data)
    if network_id!=2:raise HTTPException(404,"Neutral test network only")
    with engine.begin() as c:
        # Serialize even across Render instances, with PostgreSQL as the shared lock.
        locked=c.execute(text("SELECT pg_try_advisory_xact_lock(48742,2)")).scalar_one()
        if not locked:raise HTTPException(409,"Test already running")
        provider=c.execute(text("""SELECT id,name,postback_enabled,postback_key_hash,
          postback_params,postback_status_map FROM cpa_networks WHERE id=2 FOR UPDATE""")).mappings().first()
        if not provider or provider["name"]!="VVD Test Network" or provider["postback_enabled"]:
            raise HTTPException(409,"Test network must exist with external reception disabled")
        previous=c.execute(text("SELECT count(*) FROM conversions WHERE offer_id='vvd-test-smartlink' AND is_test=TRUE")).scalar_one()
        if previous:raise HTTPException(409,"Test conversion already exists; repeat is blocked")
        click=c.execute(text("""SELECT c.click_id,c.user_id,c.partner_code
          FROM clicks c LEFT JOIN conversions v ON v.click_id=c.click_id
          WHERE c.network_id=2 AND c.offer_id='vvd-test-smartlink'
            AND c.vertical='utilities' AND v.id IS NULL
            AND EXISTS(SELECT 1 FROM offers o WHERE o.id=c.offer_id AND o.network_id=2
              AND o.status='published' AND o.vertical_slug='utilities')
          ORDER BY c.id LIMIT 1""")).mappings().first()
        if not click:raise HTTPException(409,"No eligible existing neutral click")
        before=_snapshot(c)
        secret=secrets.token_urlsafe(48)
        temporary=dict(provider)
        temporary["postback_enabled"]=True
        temporary["postback_key_hash"]=hashlib.sha256(secret.encode()).hexdigest()
        pending=next((key for key,val in provider["postback_status_map"].items() if val=="pending"),None)
        if pending is None:raise HTTPException(409,"Pending status mapping not configured")
        names=provider["postback_params"]
        transaction="VVD-STAGE4-TEST-"+secrets.token_hex(12)
        data={names["click"]:click["click_id"],names["transaction"]:transaction,
              names["status"]:pending,names["amount"]:"0",names["currency"]:"USD"}
        raw=json.dumps(data,separators=(",",":")).encode()
        first=_accept(c,temporary,raw,secret,2,is_test=True)
        repeat=_accept(c,temporary,raw,secret,2,is_test=True)
        try:_accept(c,temporary,raw,"intentionally-invalid",2,is_test=True)
        except HTTPException as err:wrong_auth=err.status_code
        else:wrong_auth=200
        unknown=dict(data)
        unknown[names["click"]]="VVD-stage4-unknown-"+secrets.token_hex(8)
        try:_accept(c,temporary,json.dumps(unknown).encode(),secret,2,is_test=True)
        except HTTPException as err:unknown_code=err.status_code
        else:unknown_code=200
        record=c.execute(text("""SELECT user_id,partner_code,network_id,offer_id,
            status,is_test,payout_gross,payout_net,transaction_id FROM conversions
            WHERE click_id=:click"""),{"click":click["click_id"]}).mappings().one()
        attribution=(record["user_id"]==click["user_id"] and
                     record["partner_code"]==click["partner_code"] and
                     record["network_id"]==2 and record["offer_id"]=="vvd-test-smartlink")
        if not (first.get("created") and repeat.get("duplicate")
                and wrong_auth==401 and unknown_code==404 and attribution
                and record["status"]=="pending" and record["is_test"]
                and record["payout_gross"]==0 and record["payout_net"]==0
                and _snapshot(c)==before):
            raise HTTPException(409,"Protected test failed; transaction rolled back")
        # Only the explicitly marked test conversion is committed.
        # No provider key, enablement, or configuration is modified.
        return {"ok":True,"http_first":200,"http_duplicate":200,
                "duplicate":True,"http_bad_secret":wrong_auth,
                "http_unknown_click":unknown_code,"attribution":True,
                "is_test":True,"status":"pending","transaction_id":transaction,
                "financial_unchanged":True,"external_postback_enabled":False}

@router.get("/admin/networks/{network_id}/postback/check")
def read_postback_check(network_id:int,x_telegram_init_data:str|None=Header(None)):
    """Read persisted test result; never trigger a postback or mutate a network."""
    admin(x_telegram_init_data)
    if network_id != 2:
        raise HTTPException(404,"Neutral test network only")
    with engine.connect() as c:
        network=c.execute(text("SELECT id FROM cpa_networks WHERE id=2 AND name='VVD Test Network'")).first()
        if not network:
            raise HTTPException(404,"Neutral test network unavailable")
        rows=c.execute(text("""SELECT status,payout_gross,payout_net
            FROM conversions WHERE offer_id='vvd-test-smartlink'
            AND network_id=2 AND is_test=TRUE
            AND transaction_id LIKE 'cpa:2:VVD-STAGE4-TEST-%'
            ORDER BY created_at LIMIT 2""")).mappings().all()
    # Do not expose click IDs, webmasters, transaction IDs, or authentication material.
    return {"completed":bool(rows),"test_conversions":len(rows),
            "status":rows[0]["status"] if len(rows)==1 else None,
            "zero_payout":len(rows)==1 and all(
                row["payout_gross"]==0 and row["payout_net"]==0 for row in rows)}
