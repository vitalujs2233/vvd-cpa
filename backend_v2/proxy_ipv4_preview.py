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
from proxy_tariffs import normalize_tariffs

router = APIRouter(prefix="/tools-market/proxy-ipv4", tags=["Proxy-IPv4 preview"])

# Only IPv6 has a documented, reliable supplier order-to-proxy reference.
SUPPORTED_PURCHASE_TYPES = ('ipv6',)
CHECKOUT_DISABLED = 'Покупки временно недоступны. Проводится проверка системы выдачи.'
UNVERIFIED_DELIVERY = 'Покупка временно недоступна: поставщик не связывает выданные прокси с заказом. Безопасная автоматическая выдача ещё не подтверждена.'

def purchases_enabled():
    return os.getenv("PROXY_IPV4_PURCHASES_ENABLED", "false").lower() == "true"

def purchase_reason(kind):
    if not purchases_enabled(): return CHECKOUT_DISABLED
    if kind not in SUPPORTED_PURCHASE_TYPES: return UNVERIFIED_DELIVERY
    return None

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
        if path == "get/tariffs" and exc.code == 404:
            raise HTTPException(502, "Мобильные тарифы недоступны: поставщик не нашёл маршрут get/tariffs. Требуется уточнение поддержки") from None
        raise HTTPException(502, "HTTP ошибка поставщика: " + str(exc.code)) from None
    except (URLError, TimeoutError):
        raise HTTPException(502, "Нет соединения с поставщиком")
    except Exception:
        raise HTTPException(502, "Ошибка обработки ответа поставщика")
    if not isinstance(result, dict) or result.get("success") is not True:
        error_code = result.get("error_id") if isinstance(result, dict) else None
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
            tariffs = normalize_tariffs(await provider("get/tariffs", {}))
        except HTTPException as exc:
            mobile_tariff_error = "Не удалось получить тарифы мобильных прокси: " + str(exc.detail)
        except (TypeError, ValueError):
            mobile_tariff_error = "Поставщик вернул некорректные данные мобильных тарифов"
        if not mobile_tariff_error and not tariffs:
            mobile_tariff_error = "Поставщик не вернул ни одного мобильного тарифа"
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
        "type": proxy_type, "data": data, "purchases_enabled": purchase_reason(proxy_type) is None,
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
        tariffs = normalize_tariffs(await provider("get/tariffs", {}))
        valid = any(t.get("country") == body.country.upper() and any(op.get("name") == body.mobile_operator and body.rotation_time in op.get("rotationTime",[]) for op in t.get("mobileOperator",[])) for t in tariffs)
        if not valid:
            raise HTTPException(422,"Выберите действительного оператора и ротацию")
        params.update({"mobileOperator":body.mobile_operator,"rotationTime":body.rotation_time})
    result = await provider("get/order/price", params)
    if result.get("currency") != "USD":
        raise HTTPException(502,"Поставщик вернул неподдерживаемую валюту")
    try:
        cost = Decimal(str(result["amount"]))
        if not cost.is_finite() or cost <= 0:
            raise ValueError()
        sell = (cost * (Decimal(1) + markup()/100)).quantize(Decimal("0.01"), rounding=ROUND_HALF_UP)
    except Exception:
        raise HTTPException(502,"Неверная цена поставщика")
    return {"customer_total_usd":str(sell), "purchases_enabled":purchase_reason(body.proxy_type) is None}

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
                "purchases_enabled":purchase_reason(body.proxy_type) is None}
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
            "purchases_enabled":purchase_reason(body.proxy_type) is None}

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
            "purchases_enabled":purchases_enabled()}

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
    if supplier.get("currency") != "USD" or not supplier_cost.is_finite() or supplier_cost <= 0:
        raise HTTPException(502,"Некорректная цена поставщика")
    # Readiness never charges; actual checkout always reprices again.
    reason = purchase_reason(selection["proxy_type"])
    if not reason and available < order["quoted_amount"]: reason = "Недостаточно средств на балансе инструментов"
    if not reason and supplier_balance < supplier_cost: reason = "Недостаточно средств у поставщика"
    return {"status":"prepared","can_purchase":reason is None,"purchases_enabled":purchase_reason(selection["proxy_type"]) is None,
            "wallet_sufficient":available >= order["quoted_amount"],
            "provider_balance_checked":True,
            "supplier_balance_sufficient":supplier_balance >= supplier_cost,
            "reason":reason or "Сумма будет перепроверена перед списанием"}

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
        if response.get("currency") != "USD" or response.get("proxyType") != selection["proxy_type"]:
            raise ValueError("Supplier receipt mismatch")
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
        "purchases_enabled":purchase_reason(row["proxy_type"]) is None,
    }

def proxy_items(response: dict) -> list[dict]:
    items = response.get("proxies") if isinstance(response, dict) else None
    if not isinstance(items, list) or any(not isinstance(x, dict) for x in items):
        raise HTTPException(502, "Invalid supplier proxy inventory")
    return items

def proxy_ids(items: list[dict]) -> set[str]:
    ids = [str(x["id"]) for x in items if isinstance(x.get("id"), (str, int))
           and not isinstance(x["id"], bool) and str(x["id"]).strip()]
    if len(ids) != len(items) or len(set(ids)) != len(ids):
        raise HTTPException(502, "Supplier proxy IDs are missing or duplicated")
    return set(ids)

def store_delivery(owner: int, order_id: UUID, ids: set[str]) -> None:
    with engine.begin() as conn:
        conn.execute(text("""
            UPDATE tool_proxy_order_intents
            SET delivered_proxy_ids=CAST(:ids AS jsonb),updated_at=now()
            WHERE id=:id AND telegram_id=:owner AND delivered_proxy_ids IS NULL
        """), {"ids":json.dumps(sorted(ids)),"id":order_id,"owner":owner})

def detect_delivery(before: set[str], after: list[dict], selection: dict) -> set[str]:
    # Inventory differences cannot establish ownership (external purchases may race).
    # Kept for compatibility; only explicit supplier order references may be delivered.
    return set()

@router.post("/orders/{order_id}/purchase")
async def purchase_order(order_id: UUID, x_telegram_init_data: str | None = Header(default=None)):
    """One-shot checkout, disabled by default until supplier fulfilment is verified."""
    uid = require_telegram_id(x_telegram_init_data)
    if not purchases_enabled():
        raise HTTPException(503, CHECKOUT_DISABLED)
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
    reason = purchase_reason(selection["proxy_type"])
    if reason:
        raise HTTPException(503, reason)
    fresh = await quote(Quote(**selection), x_telegram_init_data)
    if Decimal(fresh["customer_total_usd"]) != order["quoted_amount"]:
        raise HTTPException(409,"Цена изменилась, подготовьте новую заявку")
    params = {"proxyType":selection["proxy_type"],"days":selection["days"],
              "country":selection["country"],"count":selection["count"],"goal":"instagram"}
    if selection["proxy_type"] == "mobile":
        params.update({"mobileOperator":selection["mobile_operator"],"rotationTime":selection["rotation_time"]})
    supplier = await provider("get/order/price",params)
    if supplier.get("currency") != "USD":
        raise HTTPException(502,"Поставщик вернул неподдерживаемую валюту")
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
            # A process crash releases the advisory lock, not the durable order.
            # Do not let a new snapshot absorb an unresolved predecessor's delivery.
            unresolved = conn.execute(text("""
                SELECT id FROM tool_proxy_order_intents
                WHERE proxy_type=:kind AND id<>:id AND
                  (status IN ('reserved','submitting','uncertain') OR
                   (proxy_type<>'ipv6' AND status='fulfilled' AND NOT EXISTS
                     (SELECT 1 FROM tool_proxy_reviews r WHERE r.order_id=tool_proxy_order_intents.id AND r.state='approved'))) LIMIT 1
            """), {"kind":kind,"id":order_id}).first()
            if unresolved:
                raise HTTPException(409,"Есть незавершённый заказ этого типа у поставщика. Требуется проверка результата")
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
    enabled = purchases_enabled()
    return {"purchases_enabled": enabled, "supported_purchase_types": list(SUPPORTED_PURCHASE_TYPES),
            "reason": None if enabled else CHECKOUT_DISABLED, "unsupported_reason": UNVERIFIED_DELIVERY}


def match_order_proxies(items: list, kind: str, order_number: str) -> list:
    from proxy_delivery import linked_items
    return linked_items(items, kind, order_number)


@router.get("/orders/{order_id}/proxies")
async def order_proxies(order_id: UUID, x_telegram_init_data: str | None = Header(default=None)):
    from proxy_delivery import connection_data
    uid = require_telegram_id(x_telegram_init_data)
    with engine.connect() as conn:
        order = conn.execute(text("""
            SELECT id,proxy_type,status,provider_order_id,selection,proxy_ids_before,supplier_submitted_at FROM tool_proxy_order_intents
            WHERE id=:id AND telegram_id=:uid
        """), {"id":order_id,"uid":uid}).mappings().first()
    if not order:
        raise HTTPException(404,"Заявка не найдена")
    if order["status"] != "fulfilled" or not order["provider_order_id"]:
        raise HTTPException(409,"Заказ ещё не подтверждён")
    # Historical delivered_proxy_ids were inferred from a global inventory delta.
    # They are not ownership proof and must not authorize disclosure.
    try:
        response = await provider("get/proxies", {"proxyType":order["proxy_type"]})
        items = proxy_items(response)
    except HTTPException:
        if order['proxy_type'] != 'ipv6' and order.get('proxy_ids_before') is not None:
            from datetime import datetime, timezone
            from proxy_inventory_review import timestamp, REVIEW_WAIT_SECONDS
            from proxy_review_store import save_review
            start=timestamp(order.get('supplier_submitted_at'))
            expired=start is None or (datetime.now(timezone.utc)-start).total_seconds() >= REVIEW_WAIT_SECONDS
            with engine.begin() as conn:
                conn.execute(text('SELECT id FROM tool_proxy_order_intents WHERE id=:id FOR UPDATE'), {'id':order_id})
                save_review(conn,order,{'state':'manual_review' if expired else 'waiting',
                    'reason':'delivery_timeout' if expired else 'supplier_unavailable',
                    'candidate_ids':[], 'checks':{}, 'can_deliver':False})
        raise
    matches = match_order_proxies(items, order["proxy_type"], str(order["provider_order_id"])) if order["proxy_type"] == "ipv6" else []
    proxies = connection_data(matches)
    review = None
    if not matches and order['proxy_type'] != 'ipv6' and order.get('proxy_ids_before') is not None:
        from proxy_review_store import review as assess, save_review, approved_ids
        with engine.begin() as conn:
            # Serialize persistence with administrative confirmation of this order.
            conn.execute(text('SELECT id FROM tool_proxy_order_intents WHERE id=:id FOR UPDATE'), {'id':order_id})
            ids = approved_ids(conn, order_id)
            if ids:
                matches = [p for p in items if str(p.get('id')) in ids]
                # A duplicate supplier ID or unexpected cardinality is not safe delivery.
                if len(matches) != len({str(p.get('id')) for p in matches}): matches = []
                proxies = connection_data(matches)
            else:
                assessment = assess(conn, order, items)
                assessment = save_review(conn, order, assessment)
                review = {k:assessment[k] for k in ('state','reason')}
    expected = order["selection"]["count"]
    if len(proxies) > expected:
        proxies = []  # Conflicting supplier attribution requires verification.
    return {"status":"fulfilled", "proxies":proxies,
            "delivery_pending":len(proxies) != expected,
            "expected_count":expected,
            "verification_required":not bool(matches), "inventory_review":review}


@router.on_event("startup")
async def log_purchase_gate():
    import logging
    logging.getLogger(__name__).info("Proxy purchases enabled=%s", os.getenv("PROXY_IPV4_PURCHASES_ENABLED", "false").lower() == "true")


@router.on_event("startup")
async def verify_mobile_catalogue():
    import logging
    log = logging.getLogger(__name__)
    log.info("Proxy config present: key=%s markup=%s purchases=%s", bool(os.getenv("PROXY_IPV4_API_KEY", "").strip()), "PROXY_IPV4_MARKUP_PERCENT" in os.environ, "PROXY_IPV4_PURCHASES_ENABLED" in os.environ)
    # Router startup may be registered more than once; probe once per process.
    if getattr(router, '_tariff_probe_done', False): return
    router._tariff_probe_done = True
    try:
        raw = await provider("get/tariffs", {})
        root_keys = sorted(str(k) for k in raw)
        entries = raw.get('tariffs')
        item_keys = sorted({str(k) for x in entries[:3] if isinstance(x, dict) for k in x}) if isinstance(entries, list) else []
        log.info("Mobile tariff schema: root_keys=%s item_keys=%s", root_keys, item_keys)
        tariffs = normalize_tariffs(raw)
        log.info("Mobile tariff probe OK: countries=%s operators=%s rotations=%s", sorted({t['country'] for t in tariffs}), sum(len(t['mobileOperator']) for t in tariffs), sorted({r for t in tariffs for o in t['mobileOperator'] for r in o['rotationTime']}))
    except HTTPException as exc:
        log.warning("Mobile tariff probe unavailable: status=%s reason=%s", exc.status_code, exc.detail)
    except Exception:
        log.warning("Mobile tariff probe unavailable: unexpected response")

# Reuses this module's provider and existing Telegram administrator authorization.
from proxy_review_admin import router as review_admin_router
router.include_router(review_admin_router)
