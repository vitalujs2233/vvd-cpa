"""Read-only Proxy-IPv4 API; no purchases or wallet changes."""
import asyncio
import json
import os
from decimal import Decimal, ROUND_HALF_UP
from urllib.parse import urlencode
from urllib.request import Request, urlopen
from fastapi import APIRouter, Header, HTTPException
from pydantic import BaseModel, Field
from stars_payments import require_telegram_id

router = APIRouter(prefix="/tools-market/proxy-ipv4", tags=["Proxy-IPv4 preview"])

class Quote(BaseModel):
    proxy_type: str
    country: str = Field(pattern=r"^[A-Za-z]{3}$")
    days: int = Field(ge=1, le=365)
    count: int = Field(ge=1, le=100)

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
async def catalog(x_telegram_init_data: str | None = Header(default=None)):
    require_telegram_id(x_telegram_init_data)
    types = {}
    for kind in ("ipv4", "isp"):
        d, c = await asyncio.gather(provider("get/days", {"proxyType":kind}), provider("get/countries", {"proxyType":kind}))
        types[kind] = {"days": d.get("days", []), "countries": [{"code":x["alpha3code"], "name":x["name"]} for x in c.get("countries", []) if isinstance(x,dict) and "alpha3code" in x and "name" in x]}
    return {"types":types, "purchases_enabled":False}

@router.post("/quote")
async def quote(body: Quote, x_telegram_init_data: str | None = Header(default=None)):
    require_telegram_id(x_telegram_init_data)
    if body.proxy_type not in ("ipv4", "isp"):
        raise HTTPException(422,"Тип недоступен")
    d, c = await asyncio.gather(provider("get/days", {"proxyType":body.proxy_type}), provider("get/countries", {"proxyType":body.proxy_type}))
    if body.days not in d.get("days",[]) or body.country.upper() not in [x.get("alpha3code") for x in c.get("countries",[]) if isinstance(x,dict)]:
        raise HTTPException(422,"Страна или срок недоступны")
    result = await provider("get/order/price", {"proxyType":body.proxy_type,"days":body.days,"country":body.country.upper(),"count":body.count,"goal":"other"})
    try:
        cost = Decimal(str(result["amount"]))
        if not cost.is_finite() or cost < 0:
            raise ValueError()
        sell = (cost * (Decimal(1) + markup()/100)).quantize(Decimal("0.01"), rounding=ROUND_HALF_UP)
    except Exception:
        raise HTTPException(502,"Неверная цена поставщика")
    return {"supplier_total_usd":str(cost), "customer_total_usd":str(sell), "markup_percent":str(markup()), "purchases_enabled":False}
