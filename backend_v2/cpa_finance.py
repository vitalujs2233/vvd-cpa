"""Stage 5.2 CPA ledger primitives. NOT wired to production postbacks or a scheduler.

The caller MUST own a single SQLAlchemy transaction (engine.begin()).
Only stage-5 synthetic PostgreSQL tests call post_approved_hold at this step.
"""
from __future__ import annotations

from decimal import Decimal, InvalidOperation, ROUND_HALF_UP
from datetime import timedelta
from uuid import UUID

from sqlalchemy import text

CENT = Decimal("0.01")
FEE_RATE = Decimal("0.20")
MAX_GROSS = Decimal("9999999999.99")
MAX_WALLET = Decimal("9999999999.99")  # users.balance/hold are NUMERIC(12,2)


class FinanceIneligible(ValueError):
    """Legacy, test, pending, rejected, or missing approval cannot be credited."""


class FinanceInconsistent(RuntimeError):
    """Existing ledger/balance data disagree; never silently repair it."""


def money(value: Decimal | str | int) -> Decimal:
    """Accept exact decimal input, reject floats and sub-cent/non-finite values."""
    if isinstance(value, (float, bool)) or not isinstance(value, (Decimal, str, int)):
        raise ValueError("Money requires Decimal, string, or integer; never float")
    try:
        number = Decimal(value)
        rounded = number.quantize(CENT, rounding=ROUND_HALF_UP)
    except (InvalidOperation, ValueError, OverflowError) as exc:
        raise ValueError("Invalid money value") from exc
    if not number.is_finite() or number < 0 or number > MAX_GROSS or number != rounded:
        raise ValueError("USD gross must be nonnegative, finite and exact to cents")
    return rounded


def split_gross(gross: Decimal | str | int) -> tuple[Decimal, Decimal, Decimal]:
    """Return (gross, fee, publisher_net) with gross == fee + publisher_net."""
    amount = money(gross)
    fee = (amount * FEE_RATE).quantize(CENT, rounding=ROUND_HALF_UP)
    net = amount - fee
    assert fee + net == amount
    return amount, fee, net


def ledger_events_for_conversion(conn, conversion_id: UUID | str) -> list[dict]:
    """Read-only inspection. No wallet queries or side effects."""
    return [dict(row) for row in conn.execute(text("""
      SELECT id,conversion_id,user_id,operation_type,event_key,amount,currency,
             hold_delta,balance_delta,platform_fee_delta,original_entry_id,
             approved_at,hold_until,created_at,actor_type
        FROM public.cpa_ledger
       WHERE conversion_id=:id ORDER BY created_at,id
    """), {"id": str(conversion_id)}).mappings()]


def post_approved_hold(conn, conversion_id: UUID | str) -> dict:
    """Atomic building block for FUTURE stage 5.3; never called by live routes.

    Requires the supplied connection to be inside a caller-owned transaction.
    Row locks + deterministic ledger event keys provide concurrent idempotency.
    A failed statement rolls back ledger, payout_net and users.hold together.
    """
    if not conn.in_transaction():
        raise RuntimeError("Caller must supply an active database transaction")
    row = conn.execute(text("""
      SELECT id,user_id,is_test,status,finance_eligible_at,finance_approved_at,
             payout_gross,payout_net,currency
        FROM public.conversions
       WHERE id=:id FOR UPDATE
    """), {"id": str(conversion_id)}).mappings().first()
    if row is None:
        raise FinanceIneligible("Conversion not found")
    if (row["is_test"] or row["finance_eligible_at"] is None
            or row["status"] != "approved" or row["finance_approved_at"] is None
            or row["finance_approved_at"] < row["finance_eligible_at"]
            or row["currency"] != "USD"):
        raise FinanceIneligible("Conversion is not an approved new real USD conversion")

    gross, fee, net = split_gross(row["payout_gross"])
    if gross == 0:
        return {"credited": False, "gross": gross, "fee": fee, "net": net}
    original = ledger_events_for_conversion(conn, row["id"])
    approvals = [e for e in original if e["operation_type"] in ("hold_credit","platform_fee_accrual")]
    if approvals:
        kinds = {e["operation_type"] for e in approvals}
        if (kinds != {"hold_credit","platform_fee_accrual"}
                or len(approvals) != 2
                or money(row["payout_net"]) != net
                or any(e["user_id"] != row["user_id"]
                       or (e["operation_type"] == "hold_credit" and
                           (e["amount"] != net or e["hold_delta"] != net))
                       or (e["operation_type"] == "platform_fee_accrual" and
                           (e["amount"] != fee or e["platform_fee_delta"] != fee))
                       for e in approvals)):
            raise FinanceInconsistent("Partial or inconsistent approval ledger")
        return {"credited": False, "gross": gross, "fee": fee, "net": net}

    wallet = conn.execute(text("""
      SELECT balance,hold FROM public.users WHERE telegram_id=:id FOR UPDATE
    """), {"id": row["user_id"]}).mappings().first()
    if wallet is None or wallet["balance"] < 0 or wallet["hold"] < 0:
        raise FinanceInconsistent("Missing user or negative legacy wallet")
    if wallet["balance"] > MAX_WALLET or wallet["hold"] + net > MAX_WALLET:
        raise FinanceInconsistent("NUMERIC(12,2) user wallet overflow")
    approved = row["finance_approved_at"]
    hold_until = approved + timedelta(hours=240)
    for operation, amount, hold_delta, fee_delta in (
        ("hold_credit", net, net, Decimal("0.00")),
        ("platform_fee_accrual", fee, Decimal("0.00"), fee),
    ):
        conn.execute(text("""
          INSERT INTO public.cpa_ledger
            (conversion_id,user_id,operation_type,event_key,amount,currency,
             hold_delta,platform_fee_delta,approved_at,hold_until,actor_type)
          VALUES (:conversion,:uid,:operation,:event,:amount,'USD',
                  :hold_delta,:fee_delta,:approved,:until,'postback')
        """), {"conversion": row["id"], "uid": row["user_id"],
              "operation": operation,
              "event": f"cpa:v1:{row['id']}:{operation}",
              "amount": amount, "hold_delta": hold_delta, "fee_delta": fee_delta,
              "approved": approved,
              "until": hold_until if operation == "hold_credit" else None})
    updated = conn.execute(text("""
      UPDATE public.users SET hold=hold+:net
       WHERE telegram_id=:uid AND balance>=0 AND hold>=0
       RETURNING telegram_id
    """), {"uid": row["user_id"], "net": net}).first()
    if not updated:
        raise FinanceInconsistent("Wallet changed during approval")
    conn.execute(text("""
      UPDATE public.conversions SET payout_net=:net WHERE id=:id
    """), {"id": row["id"], "net": net})
    return {"credited": True, "gross": gross, "fee": fee, "net": net}
