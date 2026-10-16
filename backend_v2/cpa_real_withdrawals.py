"""Draft stage-5 CPA withdrawal gate, dependent on PR #21.

NOT activated by import or deployment. No scheduled jobs or external transfers.
Real entitlement comes ONLY from released and corrected eligible ledger events;
legacy users.balance is a separate technical solvency ceiling, never entitlement.
All changes use the existing backend_v2 SQLAlchemy engine and users row lock.
"""
from decimal import Decimal
from sqlalchemy import text

from cpa_finance import money


class RealFinanceDisabled(RuntimeError):
    pass


class RealFinanceInconsistent(RuntimeError):
    pass


ZERO = Decimal("0.00")


def epoch_row(conn):
    row = conn.execute(text("""
        SELECT activated_at,legacy_max_withdrawal_id,legacy_max_click_row_id
        FROM public.cpa_finance_epoch WHERE id=1
    """)).mappings().one_or_none()
    if row is None or row["activated_at"] is None:
        raise RealFinanceDisabled("Real CPA finance is not activated")
    return row


def real_withdrawable(conn, user_id: int, epoch=None):
    """Compute *entitlement*, not historical balance; caller manages transaction.

    The ledger grants spendable credit only through hold_release (never
    hold_credit). balance_reversal removes credit. Real paid/pending claims
    remain spent/reserved; rejected ones free the reservation.
    Old clicks and all pre-cutover conversions are categorically excluded.
    """
    epoch = epoch or epoch_row(conn)
    earned = conn.execute(text("""
        SELECT COALESCE(SUM(l.balance_delta),0)
        FROM public.cpa_ledger l
        JOIN public.conversions v ON v.id=l.conversion_id
        JOIN public.clicks k ON k.click_id=v.click_id
        WHERE l.user_id=:uid
          AND l.operation_type IN ('hold_release','balance_reversal')
          AND v.finance_eligible_at >= :cutover
          AND v.finance_approved_at >= v.finance_eligible_at
          AND v.is_test=FALSE AND v.currency='USD'
          AND k.id > :old_click
          AND k.user_id=v.user_id
    """), {"uid":user_id, "cutover":epoch["activated_at"],
           "old_click":epoch["legacy_max_click_row_id"]}).scalar_one()
    committed = conn.execute(text("""
        SELECT COALESCE(SUM(amount),0)
        FROM public.withdrawals
        WHERE user_id=:uid AND cpa_real_epoch_at=:cutover
          AND id>:old_withdrawal AND status IN ('pending','paid')
    """), {"uid":user_id,"cutover":epoch["activated_at"],
           "old_withdrawal":epoch["legacy_max_withdrawal_id"]}).scalar_one()
    raw = Decimal(earned) - Decimal(committed)
    # An inconsistent ledger must not quietly become a positive entitlement.
    if raw < ZERO:
        raise RealFinanceInconsistent("Real CPA reservations exceed ledger releases")
    return raw.quantize(Decimal("0.01"))


def create_real_withdrawal(engine, *, partner_code, amount, payment_method, wallet):
    """Atomic server-side replacement for the existing POST /withdrawals route."""
    try:
        requested = money(str(amount))
    except ValueError:
        return {"success": False, "message": "Invalid withdrawal amount"}
    if requested < Decimal("50.00"):
        return {"success": False, "message": "Minimum withdrawal amount is $50"}
    if not partner_code:
        return {"success": False, "message": "Partner code is required"}
    if not payment_method or not wallet:
        return {"success": False, "message": "Payment method and wallet are required"}
    with engine.begin() as conn:
        user = conn.execute(text("""
            SELECT telegram_id,partner_code,balance FROM public.users
            WHERE partner_code=:code FOR UPDATE
        """), {"code":partner_code}).mappings().first()
        if not user:
            return {"success":False,"message":"Partner not found"}
        try:
            epoch = epoch_row(conn)
            entitled = real_withdrawable(conn,int(user["telegram_id"]),epoch)
        except (RealFinanceDisabled, RealFinanceInconsistent):
            return {"success":False,"message":"Real CPA finance unavailable"}
        # Ledger is the actual entitlement; balance is only an extra safety ceiling.
        available = min(entitled,Decimal(user["balance"]))
        if requested > available:
            return {"success":False,"message":"Insufficient real CPA earnings",
                    "available":float(max(ZERO,available))}
        row = conn.execute(text("""
            INSERT INTO public.withdrawals
             (user_id,partner_code,amount,payment_method,wallet,status,
              created_at,cpa_real_epoch_at)
            VALUES(:uid,:code,:amount,:method,:wallet,'pending',NOW(),:cutover)
            RETURNING id,created_at
        """), {"uid":user["telegram_id"],"code":user["partner_code"],
               "amount":requested,"method":payment_method,"wallet":wallet,
               "cutover":epoch["activated_at"]}).one()
        changed = conn.execute(text("""
            UPDATE public.users SET balance=balance-:amount
            WHERE telegram_id=:uid AND balance>=:amount
            RETURNING telegram_id
        """), {"amount":requested,"uid":user["telegram_id"]}).first()
        if not changed:
            raise RealFinanceInconsistent("Balance changed while reserving")
        return {"success":True,"withdrawal_id":int(row.id),
                "partner_code":user["partner_code"],"amount":float(requested),
                "status":"pending","created_at":str(row.created_at)}


def _process_real_withdrawal(engine, withdrawal_id, decision):
    """Mark one *real* pending request once, atomically; never pay externally."""
    if decision not in ("paid","rejected"):
        raise ValueError("Unsupported withdrawal status")
    with engine.begin() as conn:
        # Read user id without a lock, then lock user BEFORE withdrawal.
        # This follows the same lock order as request creation.
        initial = conn.execute(text("""
            SELECT user_id FROM public.withdrawals WHERE id=:id
        """), {"id":withdrawal_id}).first()
        if not initial:
            return {"success":False,"message":"Withdrawal not found"}
        user = conn.execute(text("""
            SELECT telegram_id FROM public.users WHERE telegram_id=:uid FOR UPDATE
        """), {"uid":initial.user_id}).first()
        if not user:
            return {"success":False,"message":"Withdrawal owner missing"}
        row = conn.execute(text("""
            SELECT id,user_id,amount,payment_method,status,cpa_real_epoch_at
            FROM public.withdrawals WHERE id=:id FOR UPDATE
        """), {"id":withdrawal_id}).mappings().first()
        if not row or row["user_id"] != user.telegram_id:
            return {"success":False,"message":"Withdrawal ownership changed"}
        try:
            epoch=epoch_row(conn)
        except RealFinanceDisabled:
            return {"success":False,"message":"Real CPA finance unavailable"}
        if (row["cpa_real_epoch_at"] != epoch["activated_at"] or
                int(row["id"])<=int(epoch["legacy_max_withdrawal_id"])):
            return {"success":False,"message":"Historical test withdrawal: real payout denied"}
        if row["status"] != "pending":
            return {"success":False,"message":f"Already processed: {row['status']}"}
        # Reversals can invalidate an already-reserved payment before it is paid.
        if decision == "paid":
            try:
                real_withdrawable(conn, int(row["user_id"]), epoch)
            except RealFinanceInconsistent:
                return {"success":False,"message":"CPA release was reversed; payment blocked"}
        # Reject marks reservation released; paid stays a permanent spend.
        conn.execute(text("""
            UPDATE public.withdrawals SET status=:decision,processed_at=NOW()
            WHERE id=:id AND status='pending'
        """), {"decision":decision,"id":withdrawal_id})
        if decision == "paid":
            conn.execute(text("""
                UPDATE public.users SET withdrawn=withdrawn+:amount
                WHERE telegram_id=:uid
            """), {"amount":row["amount"],"uid":row["user_id"]})
        else:
            conn.execute(text("""
                UPDATE public.users SET balance=balance+:amount
                WHERE telegram_id=:uid
            """), {"amount":row["amount"],"uid":row["user_id"]})
        return {"success":True,"withdrawal_id":int(row["id"]),
                "status":decision,"amount":float(row["amount"]),
                "user_id":int(row["user_id"]),"payment_method":row["payment_method"]}


def mark_real_paid(engine, withdrawal_id):
    return _process_real_withdrawal(engine,withdrawal_id,"paid")


def mark_real_rejected(engine, withdrawal_id):
    return _process_real_withdrawal(engine,withdrawal_id,"rejected")
