"""Offline settlement decision engine.

No public route, provider token, payment request, or wallet mutation here.
An authorized provider adapter may eventually pass verified observations into this
pure decision function. It MUST NOT trust browser-supplied observations.
"""
from dataclasses import dataclass
from decimal import Decimal
from payment_readiness import can_transition, verify_invoice_match


@dataclass(frozen=True)
class InvoiceSnapshot:
    invoice_id: str
    amount_usd: Decimal
    currency: str
    status: str


@dataclass(frozen=True)
class VerifiedObservation:
    invoice_id: str
    amount_usd: Decimal
    currency: str
    status: str
    trusted: bool = False


@dataclass(frozen=True)
class SettlementDecision:
    accepted: bool
    new_status: str
    needs_credit: bool
    reason: str


def evaluate_observation(invoice: InvoiceSnapshot, observation: VerifiedObservation) -> SettlementDecision:
    """Decide only; never grant funds. 'trusted' must be set by a verified server adapter."""
    if not observation.trusted:
        return SettlementDecision(False, invoice.status, False, "untrusted_confirmation")
    if not verify_invoice_match(
        expected_invoice_id=invoice.invoice_id,
        expected_amount=invoice.amount_usd,
        expected_currency=invoice.currency,
        observed_invoice_id=observation.invoice_id,
        observed_amount=observation.amount_usd,
        observed_currency=observation.currency,
    ):
        return SettlementDecision(False, invoice.status, False, "invoice_mismatch")
    if observation.status not in ("pending", "paid", "expired", "cancelled", "failed"):
        return SettlementDecision(False, invoice.status, False, "unknown_status")
    if not can_transition(invoice.status, observation.status):
        return SettlementDecision(False, invoice.status, False, "invalid_transition")
    if invoice.status == observation.status:
        return SettlementDecision(True, invoice.status, False, "duplicate_noop")
    return SettlementDecision(True, observation.status, observation.status == "paid", "accepted")


# IMPORTANT: needs_credit is a proposal, NOT permission to credit. Any future
# settlement must verify the provider independently and use one DB transaction
# with row locking, a unique external ID, and wallet/ledger writes together.
