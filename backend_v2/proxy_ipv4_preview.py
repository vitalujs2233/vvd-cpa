"""Proxy-IPv4 integration: read-only routes; purchasing gated pending verification."""
import asyncio
import json
import os
from decimal import Decimal, ROUND_HALF_UP
from uuid import UUID
from sqlalchemy import text
from database import engine
from urllib.parse import urlencode
from urllib.request import Request, urlopen
from urllib.error import HTTPError, URLError
from fastapi import APIRouter, Header, HTTPException, Query
from pydantic import BaseModel, Field
from stars_payments import require_telegram_id

router = APIRouter(prefix="/tools-market/proxy-ipv4", tags=["Proxy-IPv4 preview"])

class Quote(BaseModel):
    proxy_type: str
    country: str = Field(pattern=r"^[A-Za-z]{3}$")
    days: int = Field(ge=1, le=365)
    count: int = Field(ge=1, le=1000)
    mobile_operator: str | None = None
    rotation_time: int | None = None

async def provider(path, params):
    key = os.getenv("PROXY_IPV4_API_KEY", "").strip()
    if not key:
        raise HTTPException(503, "Настройте PROXY_IPV4_API_KEY в Render")
    url = "https://proxy-ipv4.com/client-api/v1/" + key + "/" + path + "?" + urlencode(params)
    def fetch():
        with urlopen(Request(url, headers={"Accept":"application/json"}), timeout=8) as response:
            return json.loads(response.read(100000))
    try:
        result = await asyncio.to_thread(fetch)
    except HTTPError as exc:
        raise HTTPException(502, "HTTP ошибка поставщика: " + str(exc.code))
    except (URLError, TimeoutError):
        raise HTTPException(502, "Нет соединения с поставщиком")
    except Exception:
        raise HTTPException(502, "Ошибка обработки ответа поставщика")
    if not isinstance(result, dict) or result.get("success") is not True:
        error_code = result.get("error_id")
        raise HTTPException(502, "Поставщик отклонил запрос" + (" (код " + str(error_code) + ")" if isinstance(error_code, int) else ""))
    return result

def markup():
    try:
        percent = Decimal(os.getenv("PROXY_IPV4_MARKUP_PERCENT", "30"))
        if not percent.is_finite() or percent < 0 or percent > 200:
            raise ValueError()
        return percent
    except Exception:
        return Decimal("30")

@router.get("/catalog")
async def catalog(proxy_type: str = Query("ipv4"), x_telegram_init_data: str | None = Header(default=None)):
    require_telegram_id(x_telegram_init_data)
    if proxy_type not in ("ipv4", "ipv6", "isp", "mobile"):
        raise HTTPException(422, "Неизвестный тип прокси")
    tariffs = []
    mobile_tariff_error = None
    if proxy_type == "mobile":
        try:
            tariffs_response = await provider("get/mobile/tariffs", {})
            tariffs = tariffs_response.get("tariffs", [])
            if not isinstance(tariffs, list):
                raise HTTPException(502, "Неверный формат мобильных тарифов")
        except HTTPException as exc:
            mobile_tariff_error = "Операторы и ротация временно недоступны через API поставщика"
    d, c = await asyncio.gather(
        provider("get/days", {"proxyType": proxy_type}),
        provider("get/countries", {"proxyType": proxy_type}),
    )
    days = sorted({int(x) for x in d.get("days", []) if isinstance(x, int) and 1 <= x <= 365})
    countries = [
        {"code": x["alpha3code"], "name": x["name"]}
        for x in c.get("countries", [])
        if isinstance(x, dict) and isinstance(x.get("alpha3code"), str)
        and isinstance(x.get("name"), str)
    ]
    data = {"days": days, "countries": countries}
    if proxy_type == "mobile":
        data["tariffs"] = tariffs
        available = {t.get("country") for t in data["tariffs"] if isinstance(t, dict)}
        if tariffs:
            data["countries"] = [x for x in countries if x["code"] in available]
        if mobile_tariff_error:
            data["mobile_tariff_error"] = mobile_tariff_error
    return {
        "type": proxy_type, "data": data, "purchases_enabled": False,
        "minimum_count": 10 if proxy_type == "ipv6" else 1,
    }

@router.post("/quote")
async def quote(body: Quote, x_telegram_init_data: str | None = Header(default=None)):
    require_telegram_id(x_telegram_init_data)
    if body.proxy_type not in ("ipv4", "ipv6", "isp", "mobile"):
        raise HTTPException(422,"Тип недоступен")
    if body.count < {"ipv4":1,"ipv6":10,"isp":1,"mobile":1}[body.proxy_type]:
        raise HTTPException(422,"Минимальное количество для выбранного типа не соблюдено")
    d, c = await asyncio.gather(provider("get/days", {"proxyType":body.proxy_type}), provider("get/countries", {"proxyType":body.proxy_type}))
    if body.days not in d.get("days",[]) or body.country.upper() not in [x.get("alpha3code") for x in c.get("countries",[]) if isinstance(x,dict)]:
        raise HTTPException(422,"Страна или срок недоступны")
    params = {"proxyType":body.proxy_type,"days":body.days,"country":body.country.upper(),"count":body.count,"goal":"instagram"}
    if body.proxy_type == "mobile":
        tariffs = await provider("get/mobile/tariffs", {})
        valid = any(t.get("country") == body.country.upper() and any(op.get("name") == body.mobile_operator and body.rotation_time in op.get("rotationTime",[]) for op in t.get("mobileOperator",[])) for t in tariffs.get("tariffs",[]))
        if not valid:
            raise HTTPException(422,"Выберите действительного оператора и ротацию")
        params.update({"mobileOperator":body.mobile_operator,"rotationTime":body.rotation_time})
    result = await provider("get/order/price", params)
    try:
        cost = Decimal(str(result["amount"]))
        if not cost.is_finite() or cost < 0:
            raise ValueError()
        sell = (cost * (Decimal(1) + markup()/100)).quantize(Decimal("0.01"), rounding=ROUND_HALF_UP)
    except Exception:
        raise HTTPException(502,"Неверная цена поставщика")
    return {"customer_total_usd":str(sell), "purchases_enabled":False}

# Safe staging only: no supplier order, no wallet reservation, no wallet debit.
class PrepareOrder(Quote):
    request_id: UUID

@router.post("/orders/prepare")
async def prepare_order(body: PrepareOrder, x_telegram_init_data: str | None = Header(default=None)):
    uid = require_telegram_id(x_telegram_init_data)
    # An existing key always resolves to its original selection and price.
    selection = body.model_dump(exclude={"request_id"})
    selection["country"] = selection["country"].upper()
    import json as _json
    with engine.connect() as conn:
        existing = conn.execute(text("""
            SELECT id,selection,quoted_amount,status FROM tool_proxy_order_intents
            WHERE telegram_id=:uid AND request_id=:rid
        """), {"uid":uid,"rid":body.request_id}).mappings().first()
    if existing:
        if existing["selection"] != selection:
            raise HTTPException(409,"Этот идентификатор уже использован для другого заказа")
        return {"id":str(existing["id"]),"status":existing["status"],
                "customer_total_usd":str(existing["quoted_amount"]),
                "purchases_enabled":False}
    calculated = await quote(Quote(**selection), x_telegram_init_data)
    amount = Decimal(calculated["customer_total_usd"])
    with engine.begin() as conn:
        conn.execute(text("SELECT pg_advisory_xact_lock(:uid)"),{"uid":uid})
        wallet = conn.execute(text("SELECT available FROM tool_wallets WHERE telegram_id=:uid"),{"uid":uid}).first()
        available = wallet.available if wallet else Decimal("0")
        row = conn.execute(text("""
            INSERT INTO tool_proxy_order_intents
                (telegram_id,request_id,proxy_type,selection,quoted_amount)
            VALUES (:uid,:rid,:kind,CAST(:selection AS jsonb),:amount)
            ON CONFLICT (telegram_id,request_id) DO NOTHING
            RETURNING id,selection,quoted_amount,status
        """),{"uid":uid,"rid":body.request_id,"kind":body.proxy_type,
             "selection":_json.dumps(selection),"amount":amount}).mappings().first()
        if row is None:
            row = conn.execute(text("""
                SELECT id,selection,quoted_amount,status FROM tool_proxy_order_intents
                WHERE telegram_id=:uid AND request_id=:rid
            """),{"uid":uid,"rid":body.request_id}).mappings().one()
            if row["selection"] != selection:
                raise HTTPException(409,"Этот идентификатор уже использован для другого заказа")
    return {"id":str(row["id"]),"status":row["status"],
            "customer_total_usd":str(row["quoted_amount"]),
            "wallet_sufficient":available >= row["quoted_amount"],
            "purchases_enabled":False}

@router.get("/orders")
def proxy_orders(x_telegram_init_data: str | None = Header(default=None)):
    uid = require_telegram_id(x_telegram_init_data)
    with engine.connect() as conn:
        rows = conn.execute(text("""
            SELECT id,proxy_type,selection,quoted_amount,status,created_at
            FROM tool_proxy_order_intents WHERE telegram_id=:uid
            ORDER BY created_at DESC LIMIT 100
        """),{"uid":uid}).mappings().all()
    return {"orders":[{"id":str(r["id"]),"proxy_type":r["proxy_type"],
             "selection":r["selection"],"amount_usd":str(r["quoted_amount"]),
             "status":r["status"],"created_at":r["created_at"].isoformat()} for r in rows],
            "purchases_enabled":False}

# Provider checkout contract, staged without any payment or purchase side effects.
# Proxy-IPv4 POST /order does not document an idempotency key.
# Never automatically retry a request after it might have reached the provider.
def provider_order_payload(selection: dict) -> dict:
    kind = selection["proxy_type"]
    if kind not in ("ipv4", "ipv6", "isp", "mobile"):
        raise ValueError("Unsupported proxy type")
    payload = {
        "proxyType": kind, "days": selection["days"],
        "country": selection["country"], "count": selection["count"],
        "goal": "instagram", "authType": "login",
    }
    if kind == "ipv6":
        payload["protocol"] = "SOCKS5"
    if kind == "mobile":
        if not selection.get("mobile_operator") or selection.get("rotation_time") is None:
            raise ValueError("Missing mobile operator or rotation")
        payload["mobileOperator"] = selection["mobile_operator"]
        payload["rotationTime"] = selection["rotation_time"]
    return payload

@router.get("/orders/{order_id}/readiness")
async def order_readiness(order_id: UUID, x_telegram_init_data: str | None = Header(default=None)):
    uid = require_telegram_id(x_telegram_init_data)
    with engine.connect() as conn:
        order = conn.execute(text("""
            SELECT selection,quoted_amount,status FROM tool_proxy_order_intents
            WHERE id=:id AND telegram_id=:uid
        """), {"id":order_id,"uid":uid}).mappings().first()
        wallet = conn.execute(text("""
            SELECT available,reserved FROM tool_wallets WHERE telegram_id=:uid
        """), {"uid":uid}).mappings().first()
    if not order:
        raise HTTPException(404,"Заявка не найдена")
    if order["status"] != "prepared":
        return {"status":order["status"],"can_purchase":False,"reason":"Заявка не готова к оплате"}
    try:
        provider_order_payload(order["selection"])
    except (KeyError, ValueError):
        raise HTTPException(422,"Параметры заявки недействительны")
    # Provider account balance is read-only; no supplier purchase is initiated.
    supplier = await provider("get/balance", {})
    try:
        supplier_balance = Decimal(str(supplier["balance"]))
        if not supplier_balance.is_finite() or supplier_balance < 0:
            raise ValueError()
    except (KeyError, ValueError, ArithmeticError):
        raise HTTPException(502,"Не удалось проверить баланс поставщика")
    available = wallet["available"] if wallet else Decimal("0")
    # Repricing is mandatory before actual checkout, which remains disabled.
    return {"status":"prepared","can_purchase":False,"purchases_enabled":False,
            "wallet_sufficient":available >= order["quoted_amount"],
            "provider_balance_checked":True,
            "reason":"Покупки не активированы; сумма будет перепроверена перед списанием"}

async def provider_checkout(selection: dict) -> dict:
    """Single POST only; caller MUST persist 'submitting' before invoking.

    Never retry on transport failures: the supplier may have charged the account.
    No route currently calls this function while checkout is disabled.
    """
    payload = provider_order_payload(selection)
    key = os.getenv("PROXY_IPV4_API_KEY", "").strip()
    if not key:
        raise HTTPException(503, "API поставщика не настроен")
    url = "https://proxy-ipv4.com/client-api/v1/" + key + "/order"
    def send_once():
        request = Request(url, data=json.dumps(payload).encode("utf-8"),
                          headers={"Content-Type": "application/json", "Accept": "application/json"},
                          method="POST")
        with urlopen(request, timeout=15) as response:
            return json.loads(response.read(100000))
    # Transport failures are ambiguous, including HTTP 5xx. Never automatically retry.
    response = await asyncio.to_thread(send_once)
    if not isinstance(response, dict):
        raise ValueError("Unexpected supplier response")
    if response.get("success") is True:
        order_number = response.get("orderNumber")
        if not isinstance(order_number, str) or not order_number.strip():
            raise ValueError("Supplier accepted order without orderNumber")
    return response
