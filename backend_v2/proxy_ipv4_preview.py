"""Read-only Proxy-IPv4 API; no purchases or wallet changes."""
import asyncio
import json
import os
from decimal import Decimal, ROUND_HALF_UP
from urllib.parse import urlencode
from urllib.request import Request, urlopen
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
    except Exception:
        raise HTTPException(502, "Ошибка связи с поставщиком")
    if not isinstance(result, dict) or result.get("success") is not True:
        raise HTTPException(502, "Поставщик отклонил запрос")
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
        tariffs = await provider("get/mobile/tariffs", {})
        data["tariffs"] = tariffs.get("tariffs", [])
        available = {t.get("country") for t in data["tariffs"] if isinstance(t, dict)}
        data["countries"] = [x for x in countries if x["code"] in available]
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
