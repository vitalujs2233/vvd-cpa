"""Offline payment-state validation helpers. No Crypto Pay network calls or wallet credits.

This module deliberately does not expose an HTTP endpoint that can mark invoices paid.
It is suitable for unit tests and for future review of a provider adapter.
"""
from decimal import Decimal, InvalidOperation

ALLOWED_TRANSITIONS = {
    "draft": frozenset(("pending", "failed", "cancelled")),
    "pending": frozenset(("paid", "expired", "failed", "cancelled")),
    "paid": frozenset(),
    "expired": frozenset(),
    "failed": frozenset(),
    "cancelled": frozenset(),
}


def normalize_usd(value: object) -> Decimal:
    """Reject floats, NaN, fractions of cents and out-of-range amounts."""
    if isinstance(value, (float, bool)):
        raise ValueError("Use an exact decimal USD amount")
    try:
        amount = Decimal(str(value))
    except (InvalidOperation, ValueError) as exc:
        raise ValueError("Invalid USD amount") from exc
    if not amount.is_finite() or amount < 5 or amount > 10000:
        raise ValueError("USD amount outside allowed range")
    if amount != amount.quantize(Decimal("0.01")):
        raise ValueError("USD amount must have at most two decimal places")
    return amount


def can_transition(current: str, target: str) -> bool:
    """Repeated identical states are safe no-ops; terminal states cannot reopen."""
    if current not in ALLOWED_TRANSITIONS or target not in ALLOWED_TRANSITIONS:
        return False
    return current == target or target in ALLOWED_TRANSITIONS[current]


def verify_invoice_match(
    *, expected_invoice_id: str, expected_amount: object, expected_currency: str,
    observed_invoice_id: str, observed_amount: object, observed_currency: str,
) -> bool:
    """Validate an external observation against immutable server-side invoice fields."""
    try:
        return (
            bool(expected_invoice_id)
            and expected_invoice_id == observed_invoice_id
            and expected_currency == observed_currency == "USD"
            and normalize_usd(expected_amount) == normalize_usd(observed_amount)
        )
    except ValueError:
        return False
