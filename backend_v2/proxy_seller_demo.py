"""Proxy-Seller integration staging contract. No network calls, purchases or wallet mutations."""
import os
from typing import Literal
from fastapi import APIRouter, Header, HTTPException
from pydantic import BaseModel, Field
from stars_payments import require_telegram_id

router = APIRouter(prefix="/tools-market/proxy", tags=["Proxy marketplace"])

class ProxySelection(BaseModel):
    proxy_type: Literal["ipv4", "isp"]
    country: Literal["US", "DE", "PL"]
    quantity: int = Field(ge=1, le=100, strict=True)
    days: Literal[7, 14, 30]

@router.get("/config")
def proxy_config():
    # Static choices are UI fixtures, NOT verified provider inventory.
    return {
        "mode": "demo",
        "provider": "proxy-seller",
        "purchases_enabled": False,
        "countries": [{"code":"US","label":"США"},{"code":"DE","label":"Германия"},{"code":"PL","label":"Польша"}],
        "proxy_types": [{"id":"ipv4","label":"IPv4"},{"id":"isp","label":"Статические ISP"}],
        "durations_days": [7,14,30],
        "notice": "Демонстрационный каталог. Наличие, сроки и цены поставщика ещё не проверены."
    }

@router.post("/quote")
def proxy_quote(payload: ProxySelection, x_telegram_init_data: str | None = Header(None)):
    require_telegram_id(x_telegram_init_data)
    # Do not invent prices or suggest an order has been placed.
    return {
        "mode": "demo",
        "selection": payload.model_dump(),
        "price_usd": None,
        "available": False,
        "purchases_enabled": False,
        "message": "Предпросмотр сохранён только на экране. Реальная цена появится после подключения API."
    }

@router.post("/purchase", status_code=503)
def proxy_purchase_disabled(x_telegram_init_data: str | None = Header(None)):
    require_telegram_id(x_telegram_init_data)
    raise HTTPException(503, "Покупки прокси отключены до подключения и проверки поставщика.")
