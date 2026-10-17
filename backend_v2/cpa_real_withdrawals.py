"""Draft stage-5 CPA withdrawal gate, dependent on PR #21.

NOT activated by import or deployment. No scheduled jobs or external transfers.
Real entitlement comes ONLY from released and corrected eligible ledger events;
legacy users.balance is a separate technical solvency ceiling, never entitlement.
All changes use the existing backend_v2 SQLAlchemy engine and users row lock.
"""
from decimal import Decimal
from datetime import datetime,timezone
from uuid import UUID
from sqlalchemy import text

from cpa_finance import money, lock_finance_scope, FinanceIneligible, FinanceInconsistent


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
    # Recovery events are an explicit, non-cash reserve of a disputed release.
    # A balance_reversal referencing the same release resolves that reserve;
    # the reversal's negative balance_delta then reduces entitlement instead.
    # Repeated pending records remain conservative (cannot inflate credit).
    earned = conn.execute(text("""
        SELECT COALESCE(SUM(l.balance_delta),0)
        FROM public.cpa_ledger l
        JOIN public.conversions v ON v.id=l.conversion_id
        JOIN public.clicks k ON k.click_id=v.click_id
        WHERE l.user_id=:uid
          AND l.operation_type IN ('hold_release','manual_hold_release','balance_reversal')
          AND v.finance_eligible_at >= :cutover
          AND v.created_at >= :cutover
          AND v.finance_approved_at >= v.finance_eligible_at
          AND v.status='approved'
          AND v.is_test=FALSE AND v.currency='USD'
          AND k.id > :old_click AND k.user_id=v.user_id
    """), {"uid":user_id, "cutover":epoch["activated_at"],
           "old_click":epoch["legacy_max_click_row_id"]}).scalar_one()
    disputed = conn.execute(text("""
        SELECT COALESCE(SUM(p.amount),0)
        FROM public.cpa_ledger p
        JOIN public.conversions v ON v.id=p.conversion_id
        JOIN public.clicks k ON k.click_id=v.click_id
        WHERE p.user_id=:uid AND p.operation_type='recovery_pending'
          AND v.finance_eligible_at >= :cutover AND v.created_at >= :cutover
          AND v.finance_approved_at >= v.finance_eligible_at
          AND v.status='approved' AND v.is_test=FALSE AND v.currency='USD'
          AND k.id > :old_click AND k.user_id=v.user_id
          AND NOT EXISTS (
            SELECT 1 FROM public.cpa_ledger reversal
            WHERE reversal.original_entry_id=p.original_entry_id
              AND reversal.conversion_id=p.conversion_id
              AND reversal.user_id=p.user_id
              AND reversal.operation_type='balance_reversal'
          )
    """), {"uid":user_id, "cutover":epoch["activated_at"],
           "old_click":epoch["legacy_max_click_row_id"]}).scalar_one()
    committed = conn.execute(text("""
        SELECT COALESCE(SUM(amount),0)
        FROM public.withdrawals
        WHERE user_id=:uid AND cpa_real_epoch_at=:cutover
          AND id>:old_withdrawal AND status IN ('pending','paid')
    """), {"uid":user_id,"cutover":epoch["activated_at"],
           "old_withdrawal":epoch["legacy_max_withdrawal_id"]}).scalar_one()
    raw = Decimal(earned) - Decimal(disputed) - Decimal(committed)
    # Negative entitlement is a visible reconciliation blocker, NOT an automatic debt.
    if raw < ZERO:
        raise RealFinanceInconsistent("Real CPA reservations exceed ledger releases")
    return raw.quantize(Decimal("0.01"))



def funded_withdrawable(conn, user_id, epoch=None):
    """Cash coverage, independent of postback approval, with no repeat funding.

    A settlement reference is UNIQUE globally and each receipt belongs to ONE
    real eligible conversion. One gross payment can never cover two partners.
    Count released USD *net* only after that conversion's complete gross
    has been independently matched to bank/processor records by admin.
    Pending/paid real requests consume this coverage permanently until rejected.
    """
    epoch=epoch or epoch_row(conn)
    funded=conn.execute(text("""
      SELECT COALESCE(SUM(l.balance_delta),0)
      FROM public.cpa_ledger l
      JOIN public.conversions v ON v.id=l.conversion_id
      JOIN public.clicks k ON k.click_id=v.click_id
      JOIN public.cpa_network_receipts r ON r.conversion_id=v.id
      WHERE l.user_id=:uid
        AND l.operation_type IN ('hold_release','manual_hold_release','balance_reversal')
        AND r.received_gross>=v.payout_gross
        AND v.finance_eligible_at>=:cutover
        AND v.created_at>=:cutover
        AND v.finance_approved_at>=v.finance_eligible_at
        AND v.status='approved' AND v.is_test=FALSE AND v.currency='USD'
        AND k.id>:old_click AND k.user_id=v.user_id
    """),{"uid":user_id,"cutover":epoch["activated_at"],
          "old_click":epoch["legacy_max_click_row_id"]}).scalar_one()
    # Reserve all unresolved disputed funds, even if the receipt was verified.
    pending=conn.execute(text("""
      SELECT COALESCE(SUM(p.amount),0)
      FROM public.cpa_ledger p
      JOIN public.conversions v ON v.id=p.conversion_id
      JOIN public.clicks k ON k.click_id=v.click_id
      JOIN public.cpa_network_receipts r ON r.conversion_id=v.id
      WHERE p.user_id=:uid AND p.operation_type='recovery_pending'
        AND r.received_gross>=v.payout_gross
        AND v.finance_eligible_at>=:cutover AND v.created_at>=:cutover
        AND v.finance_approved_at>=v.finance_eligible_at
        AND v.status='approved' AND v.is_test=FALSE AND v.currency='USD'
        AND k.id>:old_click AND k.user_id=v.user_id
        AND NOT EXISTS(
          SELECT 1 FROM public.cpa_ledger b
          WHERE b.original_entry_id=p.original_entry_id
            AND b.operation_type='balance_reversal'
        )
    """),{"uid":user_id,"cutover":epoch["activated_at"],
          "old_click":epoch["legacy_max_click_row_id"]}).scalar_one()
    committed=conn.execute(text("""
      SELECT COALESCE(SUM(amount),0) FROM public.withdrawals
      WHERE user_id=:uid AND cpa_real_epoch_at=:cutover
        AND id>:old_withdrawal AND status IN ('pending','paid')
    """),{"uid":user_id,"cutover":epoch["activated_at"],
          "old_withdrawal":epoch["legacy_max_withdrawal_id"]}).scalar_one()
    raw=Decimal(funded)-Decimal(pending)-Decimal(committed)
    if raw<ZERO:
        raise RealFinanceInconsistent("Real pending/paid obligations exceed verified network funds")
    return raw.quantize(Decimal("0.01"))


def withdrawable_covered(conn,uid,epoch=None):
    epoch=epoch or epoch_row(conn)
    return min(real_withdrawable(conn,uid,epoch),funded_withdrawable(conn,uid,epoch))

def _request_uuid(value):
    if value is None:
        return None
    try:
        return UUID(str(value))
    except (TypeError,ValueError) as exc:
        raise ValueError("Invalid withdrawal request ID") from exc

def _validate_transfer_proof(reference,evidence,transferred_at):
    if not isinstance(reference,str) or not 8<=len(reference.strip())<=160:
        raise ValueError("External transfer reference (8–160 characters) required")
    if not isinstance(evidence,str) or not 8<=len(evidence.strip())<=200:
        raise ValueError("Transfer confirmation reference (8–200 characters) required")
    try:
        if not isinstance(transferred_at,str):
            raise ValueError()
        t=datetime.fromisoformat(transferred_at.replace("Z","+00:00"))
        if t.tzinfo is None or t>datetime.now(timezone.utc):
            raise ValueError()
    except ValueError as exc:
        raise ValueError("Valid past transfer time with timezone required") from exc
    return reference.strip(),evidence.strip(),t


def release_matured_hold_contract(conn, conversion_id):
    """Stage 5.3 implementation: only callable from explicit backend invocation.

    Caller owns the transaction. Lock users -> conversions -> ledger so this
    future primitive is compatible with approval, claims and corrections.
    PostgreSQL ledger trigger is the final authority on full 240-hour maturity.
    """
    if not conn.in_transaction():
        raise RuntimeError("Finance release requires a caller-owned transaction")
    row, wallet = lock_finance_scope(conn, conversion_id)
    epoch = epoch_row(conn)
    valid = conn.execute(text("""
        SELECT 1 FROM public.conversions v
        JOIN public.clicks k ON k.click_id=v.click_id
        WHERE v.id=:id AND v.user_id=:uid
          AND v.created_at >= :cutover AND v.finance_eligible_at >= :cutover
          AND v.finance_approved_at >= v.finance_eligible_at
          AND v.status='approved' AND v.is_test=FALSE AND v.currency='USD'
          AND k.id > :old_click AND k.user_id=:uid
    """), {"id":str(conversion_id),"uid":row["user_id"],
           "cutover":epoch["activated_at"],
           "old_click":epoch["legacy_max_click_row_id"]}).first()
    if not valid:
        raise FinanceIneligible("Conversion is not post-cutover real finance")
    credit = conn.execute(text("""
        SELECT id,amount,hold_until FROM public.cpa_ledger
        WHERE conversion_id=:id AND operation_type='hold_credit' FOR UPDATE
    """), {"id":str(conversion_id)}).mappings().first()
    if not credit:
        raise FinanceInconsistent("Approved hold entry absent")
    old_auto=conn.execute(text("""
        SELECT id FROM public.cpa_ledger
        WHERE original_entry_id=:source AND operation_type='hold_release'
    """), {"source":credit["id"]}).first()
    manual_or_auto=conn.execute(text("""
        SELECT COALESCE(sum(amount),0) FROM public.cpa_ledger
        WHERE original_entry_id=:source
          AND operation_type IN ('manual_hold_release','hold_release')
    """), {"source":credit["id"]}).scalar_one()
    remaining=credit["amount"]-Decimal(manual_or_auto)
    if old_auto or remaining==ZERO:
        return {"released":False,"amount":ZERO}
    if remaining<ZERO or wallet["hold"]<remaining:
        raise FinanceInconsistent("Hold balance inconsistent with remaining ledger credit")
    # The trigger independently validates the full 240-hour maturity and
    # releases ONLY the remaining amount after any prior manual partials.
    conn.execute(text("""
        INSERT INTO public.cpa_ledger
         (conversion_id,user_id,operation_type,event_key,amount,currency,
          hold_delta,balance_delta,platform_fee_delta,original_entry_id,actor_type)
        VALUES(:cid,:uid,'hold_release',:key,:amount,'USD',
               :debit,:amount,0,:source,'scheduler')
    """), {"cid":row["id"],"uid":row["user_id"],
           "key":f"cpa:v1:{row['id']}:hold_release",
           "amount":remaining,"debit":-remaining,"source":credit["id"]})
    changed=conn.execute(text("""
        UPDATE public.users SET hold=hold-:amount, balance=balance+:amount
        WHERE telegram_id=:uid AND hold>=:amount RETURNING telegram_id
    """), {"uid":row["user_id"],"amount":remaining}).first()
    if not changed:
        raise FinanceInconsistent("User hold changed during release")
    return {"released":True,"amount":remaining}


def release_matured_holds(engine, *, limit=100):
    """Release eligible >=240h holds, synchronously, WITHOUT scheduling it.

    Used by a future explicitly enabled job. Each conversion is processed in
    its own transaction and follows users -> conversions -> ledger locks.
    Concurrency, retries and multiple workers are safe: the one-release ledger
    key, source-reference unique index and user row lock prevent double credit.
    An inconsistent row aborts with its transaction rolled back; no silent
    forgiveness, hidden debt or external payment is performed.
    """
    if isinstance(limit,bool) or not isinstance(limit,int) or not 1<=limit<=500:
        raise ValueError("limit must be an integer between 1 and 500")
    released=0
    total=ZERO
    for _ in range(limit):
        with engine.begin() as conn:
            epoch=epoch_row(conn)  # Disabled = do not even select candidates.
            candidate=conn.execute(text("""
                SELECT l.conversion_id
                FROM public.cpa_ledger l
                JOIN public.conversions v ON v.id=l.conversion_id
                JOIN public.clicks k ON k.click_id=v.click_id
                WHERE l.operation_type='hold_credit'
                  AND l.hold_until <= clock_timestamp()
                  AND v.status='approved' AND v.is_test=FALSE
                  AND v.currency='USD'
                  AND v.created_at >= :cutover
                  AND v.finance_eligible_at >= :cutover
                  AND v.finance_approved_at >= v.finance_eligible_at
                  AND k.id>:legacy_click AND k.user_id=v.user_id
                  AND NOT EXISTS (
                    SELECT 1 FROM public.cpa_ledger lr
                    WHERE lr.original_entry_id=l.id
                      AND lr.operation_type IN ('hold_release','hold_reversal')
                  )
                  AND NOT EXISTS (
                    SELECT 1 FROM public.cpa_conversion_disputes d
                    WHERE d.conversion_id=l.conversion_id
                      AND d.resolution IS DISTINCT FROM 'cleared'
                  )
                  AND l.amount > (
                    SELECT COALESCE(SUM(part.amount),0)
                    FROM public.cpa_ledger part
                    WHERE part.original_entry_id=l.id
                      AND part.operation_type='manual_hold_release'
                  )
                ORDER BY l.hold_until,l.id LIMIT 1
            """), {"cutover":epoch["activated_at"],
                   "legacy_click":epoch["legacy_max_click_row_id"]}).scalar_one_or_none()
            if candidate is None:
                break
            result=release_matured_hold_contract(conn,candidate)
            if result["released"]:
                released+=1
                total+=result["amount"]
    return {"released":released,"amount":total.quantize(Decimal("0.01"))}


def finance_balance_projection(conn, user_id, legacy_balance):
    """Read-only API projection. No historical value is rewritten."""
    try:
        epoch = epoch_row(conn)
    except RealFinanceDisabled:
        return {"real_withdrawable": 0.0, "real_finance_active": False,
                "real_finance_available": False}
    try:
        entitlement = withdrawable_covered(conn, user_id, epoch)
        spendable = max(ZERO, min(entitlement, Decimal(legacy_balance)))
        return {"real_withdrawable": float(spendable),
                "real_finance_active": True, "real_finance_available": True}
    except RealFinanceInconsistent:
        # Never turn a disputed negative financial balance into positive funds.
        return {"real_withdrawable": 0.0, "real_finance_active": True,
                "real_finance_available": False}


def create_real_withdrawal(engine, *, partner_code, amount, payment_method, wallet, request_id=None):
    """Atomic server-side replacement for the existing POST /withdrawals route."""
    try:
        requested = money(str(amount))
    except ValueError:
        return {"success": False, "message": "Invalid withdrawal amount"}
    try:
        request_key=_request_uuid(request_id)
    except ValueError:
        return {"success":False,"message":"Invalid withdrawal request ID"}
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
        if request_key is not None:
            existing=conn.execute(text("""
                SELECT id,amount,payment_method,wallet,status FROM public.withdrawals
                WHERE user_id=:uid AND cpa_request_id=:key
            """),{"uid":user["telegram_id"],"key":request_key}).mappings().first()
            if existing:
                if (Decimal(existing["amount"])!=requested or
                    existing["payment_method"]!=payment_method or
                    existing["wallet"]!=wallet):
                    return {"success":False,"message":"Withdrawal idempotency key conflict"}
                return {"success":True,"duplicate":True,"withdrawal_id":int(existing["id"]),
                        "amount":float(requested),"status":existing["status"]}
        try:
            epoch = epoch_row(conn)
            entitled = withdrawable_covered(conn,int(user["telegram_id"]),epoch)
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
              created_at,cpa_real_epoch_at,cpa_request_id)
            VALUES(:uid,:code,:amount,:method,:wallet,'pending',NOW(),:cutover,:request_id)
            RETURNING id,created_at
        """), {"uid":user["telegram_id"],"code":user["partner_code"],
               "amount":requested,"method":payment_method,"wallet":wallet,
               "cutover":epoch["activated_at"],"request_id":request_key}).one()
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


def _process_real_withdrawal(engine, withdrawal_id, decision, *,
                             admin_uid=None, transfer_reference=None,
                             evidence_reference=None, transferred_at=None):
    """Mark one *real* pending request once, atomically; never pay externally."""
    if decision not in ("paid","rejected"):
        raise ValueError("Unsupported withdrawal status")
    if decision=="paid":
        if admin_uid is None:
            return {"success":False,"message":"Signed admin confirmation is required"}
        try:
            reference,evidence,transferred=_validate_transfer_proof(
                transfer_reference,evidence_reference,transferred_at)
        except ValueError as exc:
            return {"success":False,"message":str(exc)}
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
                # Zero available is legitimate after a fully reserved request;
                # BOTH reservations must be solvent before cash is marked paid.
                real_withdrawable(conn,int(row["user_id"]),epoch)
                funded_withdrawable(conn,int(row["user_id"]),epoch)
            except RealFinanceInconsistent:
                return {"success":False,"message":"Unfunded or disputed CPA obligation; payment blocked"}
            # Insert immutable evidence BEFORE status changes. The separate
            # PostgreSQL trigger forbids bypassing proof from any SQL route.
            proof_saved=conn.execute(text("""
                INSERT INTO public.cpa_payout_proofs
                (withdrawal_id,external_transfer_id,evidence_reference,
                 transferred_at,confirmed_by)
                VALUES(:wid,:reference,:evidence,:transferred,:admin)
                ON CONFLICT DO NOTHING RETURNING withdrawal_id
            """),{"wid":withdrawal_id,"reference":reference,
                  "evidence":evidence,"transferred":transferred,"admin":admin_uid}).first()
            if not proof_saved:
                return {"success":False,"message":"Transfer proof already used; paid status not changed"}
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


def mark_real_paid(engine, withdrawal_id, *, admin_uid=None,
                   transfer_reference=None,evidence_reference=None,transferred_at=None):
    return _process_real_withdrawal(engine,withdrawal_id,"paid",
        admin_uid=admin_uid,transfer_reference=transfer_reference,
        evidence_reference=evidence_reference,transferred_at=transferred_at)


def mark_real_rejected(engine, withdrawal_id):
    return _process_real_withdrawal(engine,withdrawal_id,"rejected")
