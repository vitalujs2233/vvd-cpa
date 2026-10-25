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
    selection = order["selection"]
    params = {"proxyType":selection["proxy_type"],"days":selection["days"],
              "country":selection["country"],"count":selection["count"],
              "goal":"instagram"}
    if selection["proxy_type"] == "mobile":
        params.update({"mobileOperator":selection["mobile_operator"],
                       "rotationTime":selection["rotation_time"]})
    supplier = await provider("get/order/price", params)
    try:
        supplier_balance = Decimal(str(supplier["balance"]))
        if not supplier_balance.is_finite() or supplier_balance < 0:
            raise ValueError()
    except (KeyError, ValueError, ArithmeticError):
        raise HTTPException(502,"Не удалось проверить баланс поставщика")
    available = wallet["available"] if wallet else Decimal("0")
    supplier_cost = Decimal(str(supplier["amount"]))
    # Repricing is mandatory before actual checkout, which remains disabled.
    return {"status":"prepared","can_purchase":False,"purchases_enabled":False,
            "wallet_sufficient":available >= order["quoted_amount"],
            "provider_balance_checked":True,
            "supplier_balance_sufficient":supplier_balance >= supplier_cost,
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
        if not isinstance(order_number, (str, int)) or not str(order_number).strip():
            raise ValueError("Supplier accepted order without orderNumber")
    return response

@router.get("/orders/{order_id}/status")
def order_status(order_id: UUID, x_telegram_init_data: str | None = Header(default=None)):
    """Read-only customer order status. Never return supplier credentials."""
    uid = require_telegram_id(x_telegram_init_data)
    with engine.connect() as conn:
        row = conn.execute(text("""
            SELECT id,proxy_type,selection,quoted_amount,status,
                   provider_order_id,created_at,updated_at
            FROM tool_proxy_order_intents
            WHERE id=:id AND telegram_id=:uid
        """), {"id":order_id,"uid":uid}).mappings().first()
    if row is None:
        raise HTTPException(404,"Заявка не найдена")
    return {
        "id":str(row["id"]), "proxy_type":row["proxy_type"],
        "selection":row["selection"],"amount_usd":str(row["quoted_amount"]),
        "status":row["status"],"provider_order_id":row["provider_order_id"],
        "created_at":row["created_at"].isoformat(),
        "updated_at":row["updated_at"].isoformat(),
        "purchases_enabled":False,
    }

def proxy_items(response: dict) -> list[dict]:
    items = response.get("proxies", [])
    if not isinstance(items, list):
        raise ValueError("Invalid supplier proxy inventory")
    return [x for x in items if isinstance(x, dict)]

def proxy_ids(items: list[dict]) -> set[str]:
    ids = [str(x["id"]) for x in items if x.get("id") is not None]
    if len(ids) != len(items) or len(set(ids)) != len(ids):
        raise ValueError("Supplier proxy IDs are missing or duplicated")
    return set(ids)

def store_delivery(owner: int, order_id: UUID, ids: set[str]) -> None:
    with engine.begin() as conn:
        conn.execute(text("""
            UPDATE tool_proxy_order_intents
            SET delivered_proxy_ids=CAST(:ids AS jsonb),updated_at=now()
            WHERE id=:id AND telegram_id=:owner AND delivered_proxy_ids IS NULL
        """), {"ids":json.dumps(sorted(ids)),"id":order_id,"owner":owner})

def detect_delivery(before: set[str], after: list[dict], selection: dict) -> set[str]:
    fresh = [p for p in after if str(p.get("id")) not in before]
    expected = selection["count"]
    if len(fresh) != expected:
        return set()
    country = selection["country"].upper()
    for item in fresh:
        supplied_country = item.get("country") or item.get("countryCode")
        if isinstance(supplied_country, dict):
            supplied_country = supplied_country.get("alpha3code") or supplied_country.get("code")
        if supplied_country and str(supplied_country).upper() != country:
            return set()
    return proxy_ids(fresh)

@router.post("/orders/{order_id}/purchase")
async def purchase_order(order_id: UUID, x_telegram_init_data: str | None = Header(default=None)):
    """One-shot checkout, disabled by default until supplier fulfilment is verified."""
    uid = require_telegram_id(x_telegram_init_data)
    if os.getenv("PROXY_IPV4_PURCHASES_ENABLED", "false").lower() != "true":
        raise HTTPException(503, "Покупки пока отключены")
    with engine.connect() as conn:
        order = conn.execute(text("""
            SELECT selection,quoted_amount,status,provider_order_id
            FROM tool_proxy_order_intents
            WHERE id=:id AND telegram_id=:uid
        """), {"id":order_id,"uid":uid}).mappings().first()
    if not order:
        raise HTTPException(404,"Заявка не найдена")
    if order["status"] == "fulfilled":
        return {"status":"fulfilled","order_number":order["provider_order_id"]}
    if order["status"] != "prepared":
        raise HTTPException(409,"Заявка уже обрабатывается или закрыта")
    selection = order["selection"]
    fresh = await quote(Quote(**selection), x_telegram_init_data)
    if Decimal(fresh["customer_total_usd"]) != order["quoted_amount"]:
        raise HTTPException(409,"Цена изменилась, подготовьте новую заявку")
    params = {"proxyType":selection["proxy_type"],"days":selection["days"],
              "country":selection["country"],"count":selection["count"],"goal":"instagram"}
    if selection["proxy_type"] == "mobile":
        params.update({"mobileOperator":selection["mobile_operator"],"rotationTime":selection["rotation_time"]})
    supplier = await provider("get/order/price",params)
    cost = Decimal(str(supplier["amount"]))
    balance = Decimal(str(supplier["balance"]))
    if not cost.is_finite() or cost <= 0 or not balance.is_finite():
        raise HTTPException(502,"Некорректный ответ поставщика")
    if balance < cost:
        raise HTTPException(409,"Недостаточно средств у поставщика")
    if (cost*(Decimal(1)+markup()/100)).quantize(Decimal("0.01"),rounding=ROUND_HALF_UP) != order["quoted_amount"]:
        raise HTTPException(409,"Цена поставщика изменилась")
    from proxy_ipv4_wallet import reserve_order, mark_submitting, mark_uncertain, confirm_fulfilled
    kind = selection["proxy_type"]
    # PostgreSQL session advisory lock serializes supplier checkouts of each type
    # across workers. The connection stays open through both inventory reads.
    lock_conn = engine.connect()
    lock_key = "vvd-proxy-checkout-" + kind
    locked = False
    try:
        locked = bool(lock_conn.execute(text("SELECT pg_try_advisory_lock(hashtext(:key))"),
                                        {"key":lock_key}).scalar())
        lock_conn.commit()
        if not locked:
            raise HTTPException(409,"Покупка этого типа уже выполняется. Повторите позже.")
        with engine.connect() as conn:
            current_status = conn.execute(text("""
                SELECT status FROM tool_proxy_order_intents
                WHERE id=:id AND telegram_id=:owner
            """), {"id":order_id,"owner":uid}).scalar()
        if current_status != "prepared":
            raise HTTPException(409,"Заказ уже оформляется или завершён")
        before = set()
        if kind != "ipv6":
            snapshot = proxy_items(await provider("get/proxies",{"proxyType":kind}))
            before = proxy_ids(snapshot)
        reserve_order(uid,order_id)
        if kind != "ipv6":
            with engine.begin() as conn:
                conn.execute(text("""
                    UPDATE tool_proxy_order_intents
                    SET proxy_ids_before=CAST(:ids AS jsonb),updated_at=now()
                    WHERE id=:id AND telegram_id=:owner AND status='reserved'
                """), {"ids":json.dumps(sorted(before)),"id":order_id,"owner":uid})
        mark_submitting(uid,order_id,cost)
        with engine.begin() as conn:
            conn.execute(text("""
                UPDATE tool_proxy_order_intents SET supplier_submitted_at=now()
                WHERE id=:id AND telegram_id=:owner AND status='submitting'
            """), {"id":order_id,"owner":uid})
        try:
            response = await provider_checkout(selection)
            if response.get("success") is not True:
                raise ValueError("Unconfirmed supplier response")
            number = str(response["orderNumber"])
        except Exception:
            try:
                mark_uncertain(uid,order_id)
            except Exception:
                pass
            raise HTTPException(409,"Результат покупки неизвестен, резерв сохранён. Повтор запрещён")
        try:
            settled = confirm_fulfilled(uid,order_id,number)
        except Exception:
            try:
                from proxy_ipv4_wallet import record_confirmed_supplier_order
                record_confirmed_supplier_order(uid,order_id,number)
            except Exception:
                pass
            raise HTTPException(503,"Заказ поставщика подтверждён, требуется сверка учёта. Повтор запрещён")
        if kind != "ipv6":
            try:
                inventory = proxy_items(await provider("get/proxies",{"proxyType":kind}))
                assigned = detect_delivery(before,inventory,selection)
                if assigned:
                    store_delivery(uid,order_id,assigned)
                    settled["delivery_ready"] = True
                else:
                    settled["delivery_ready"] = False
            except Exception:
                settled["delivery_ready"] = False
        return settled
    finally:
        if locked:
            try:
                lock_conn.execute(text("SELECT pg_advisory_unlock(hashtext(:key))"),
                                  {"key":lock_key})
                lock_conn.commit()
            except Exception:
                pass
        lock_conn.close()

@router.get("/checkout-config")
def checkout_config(x_telegram_init_data: str | None = Header(default=None)):
    require_telegram_id(x_telegram_init_data)
    enabled = os.getenv("PROXY_IPV4_PURCHASES_ENABLED", "false").lower() == "true"
    return {"purchases_enabled": enabled, "supported_purchase_types": ["ipv4", "ipv6", "isp", "mobile"]}


def match_order_proxies(items: list, kind: str, order_number: str) -> list:
    """Only return records explicitly linked to this order by the supplier."""
    if kind == "ipv6":
        return [item for item in items if isinstance(item, dict)
                and str(item.get("orderId", "")) == order_number]
    # Some supplier responses may include an order reference for individual IPs.
    # Without an explicit reference, the provider's global inventory is not
    # attributable to a customer, and must never be disclosed.
    return [item for item in items if isinstance(item, dict)
            and str(item.get("orderId") or item.get("orderNumber") or "") == order_number]


@router.get("/orders/{order_id}/proxies")
async def order_proxies(order_id: UUID, x_telegram_init_data: str | None = Header(default=None)):
    """Deliver only supplier records explicitly tagged with this owner's order ID."""
    uid = require_telegram_id(x_telegram_init_data)
    with engine.connect() as conn:
        order = conn.execute(text("""
            SELECT proxy_type,status,provider_order_id FROM tool_proxy_order_intents
            WHERE id=:id AND telegram_id=:uid
        """), {"id":order_id,"uid":uid}).mappings().first()
    if not order:
        raise HTTPException(404,"Заявка не найдена")
    if order["status"] != "fulfilled" or not order["provider_order_id"]:
        raise HTTPException(409,"Заказ ещё не подтверждён")
    if order["proxy_type"] != "ipv6":
        with engine.connect() as conn:
            saved = conn.execute(text("""
                SELECT delivered_proxy_ids FROM tool_proxy_order_intents
                WHERE id=:id AND telegram_id=:uid
            """), {"id":order_id,"uid":uid}).scalar()
        if not saved:
            return {"status":"fulfilled","proxies":[],"delivery_pending":True}
        response = await provider("get/proxies",{"proxyType":order["proxy_type"]})
        ids = set(str(x) for x in saved)
        matched = [p for p in proxy_items(response) if str(p.get("id")) in ids]
        return {"status":"fulfilled","proxies":matched,
                "delivery_pending":len(matched)!=len(ids)}
    response = await provider("get/proxies",{"proxyType":order["proxy_type"]})
    matches = match_order_proxies(response.get("proxies", []),
                                  order["proxy_type"],str(order["provider_order_id"]))
    return {"status":"fulfilled","proxies":matches,
            "delivery_pending":len(matches)==0}
