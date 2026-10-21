"""Crypto Pay testnet client for Tools.

Isolated adapter: importing this module does not enable payment endpoints or
credit wallets. Never use production credentials with the testnet endpoint.
"""
import hashlib
import hmac
import os
from decimal import Decimal
from typing import Any

import httpx

TESTNET_API = "https://testnet-pay.crypt.bot/api"


class CryptoPayError(RuntimeError):
    pass


def testnet_token() -> str:
    token = os.environ.get("CRYPTO_PAY_TESTNET_TOKEN", "").strip()
    if not token:
        raise CryptoPayError("CRYPTO_PAY_TESTNET_TOKEN is not configured")
    return token


def verify_webhook(raw_body: bytes, signature: str, token: str) -> bool:
    """Verify crypto-pay-api-signature against the unmodified request body."""
    if not signature or not token:
        return False
    secret = hashlib.sha256(token.encode("utf-8")).digest()
    expected = hmac.new(secret, raw_body, hashlib.sha256).hexdigest()
    return hmac.compare_digest(expected, signature)


async def _request(method: str, payload: dict[str, Any] | None = None) -> Any:
    headers = {"Crypto-Pay-API-Token": testnet_token()}
    async with httpx.AsyncClient(timeout=12.0) as client:
        response = await client.post(f"{TESTNET_API}/{method}", headers=headers, json=payload or {})
        response.raise_for_status()
        data = response.json()
    if not isinstance(data, dict) or data.get("ok") is not True:
        raise CryptoPayError("Crypto Pay testnet rejected the request")
    return data["result"]


async def create_test_invoice(amount_usd: Decimal, payload: str) -> dict[str, Any]:
    """Create a test invoice only; never credit the wallet from this response."""
    if not amount_usd.is_finite() or amount_usd < Decimal("5") or amount_usd > Decimal("10000"):
        raise ValueError("Amount must be between $5 and $10,000")
    if amount_usd.as_tuple().exponent < -2:
        raise ValueError("Amount must have at most two decimal places")
    if not payload or len(payload) > 128:
        raise ValueError("Invalid invoice payload")
    result = await _request("createInvoice", {
        "currency_type": "fiat",
        "fiat": "USD",
        "amount": f"{amount_usd:.2f}",
        "accepted_assets": "USDT,TON",
        "payload": payload,
        "description": "VVD CPA Tools test payment",
    })
    return result


async def get_test_invoices(invoice_ids: list[int]) -> Any:
    """Query the provider; a verified paid status is required before credit."""
    if not invoice_ids or len(invoice_ids) > 100 or any(i <= 0 for i in invoice_ids):
        raise ValueError("Invalid invoice IDs")
    return await _request("getInvoices", {"invoice_ids": ",".join(map(str, invoice_ids))})
