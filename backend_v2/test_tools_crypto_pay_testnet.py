"""Unit tests for the isolated Crypto Pay testnet adapter."""
import hashlib
import hmac
from decimal import Decimal

import pytest

from tools_crypto_pay_testnet import verify_webhook, create_test_invoice


def test_webhook_signature():
    token = "test-secret"
    body = b'{"update_type":"invoice_paid"}'
    key = hashlib.sha256(token.encode()).digest()
    signature = hmac.new(key, body, hashlib.sha256).hexdigest()
    assert verify_webhook(body, signature, token)
    assert not verify_webhook(body + b" ", signature, token)
    assert not verify_webhook(body, "invalid", token)


@pytest.mark.asyncio
async def test_invalid_amount_never_calls_provider():
    for amount in (Decimal("0"), Decimal("4.99"), Decimal("10000.01"), Decimal("5.001")):
        with pytest.raises(ValueError):
            await create_test_invoice(amount, "test-order")
