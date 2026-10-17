"""Explicit, auditable real CPA dispute and cancellation transitions.

No automatic refunds or debts. Every operation is in the existing CPA ledger,
serialized on users -> conversion -> original ledger; only new eligible real
conversions may be adjusted. Claims already reserved/paid are never rewritten.
"""
from decimal import Decimal
from sqlalchemy import text
from cpa_finance import lock_finance_scope,FinanceInconsistent
from cpa_real_withdrawals import epoch_row,real_withdrawable,RealFinanceInconsistent
from cpa_manual_hold import _eligible,_parse_uuid,ManualReleaseDenied

ZERO=Decimal("0.00")

def _check_reference(value,name,low=8,high=200):
    if not isinstance(value,str) or not low<=len(value.strip())<=high:
        raise ManualReleaseDenied(name+" reference required")
    return value.strip()

def register_dispute(engine,*,conversion_id,case_reference,reason,evidence_reference,admin_uid):
    cid=_parse_uuid(conversion_id)
    case=_check_reference(case_reference,"Case",8,140)
    proof=_check_reference(evidence_reference,"Evidence")
    if not isinstance(reason,str) or not 12<=len(reason.strip())<=60:
        raise ManualReleaseDenied("Mandatory dispute reason (12–60 characters)")
    with engine.begin() as c:
        row,wallet=lock_finance_scope(c,cid)
        epoch=epoch_row(c)
        _eligible(c,cid,row["user_id"],epoch)
        current=c.execute(text("""SELECT case_reference FROM public.cpa_conversion_disputes
            WHERE conversion_id=:cid FOR UPDATE"""),{"cid":cid}).scalar_one_or_none()
        if current:
            if current!=case:
                raise ManualReleaseDenied("Conversion already has a different dispute")
            return {"success":True,"duplicate":True,"case_reference":case}
        c.execute(text("""
          INSERT INTO public.cpa_conversion_disputes(
            conversion_id,case_reference,reason,evidence_reference,opened_by)
          VALUES(:cid,:case,:reason,:proof,:admin)
        """),{"cid":cid,"case":case,"reason":reason.strip(),"proof":proof,"admin":admin_uid})
        releases=c.execute(text("""
          SELECT id,amount FROM public.cpa_ledger WHERE conversion_id=:cid
            AND operation_type IN ('hold_release','manual_hold_release')
          ORDER BY created_at,id FOR UPDATE
        """),{"cid":cid}).mappings().all()
        for r in releases:
            c.execute(text("""
              INSERT INTO public.cpa_ledger
                (conversion_id,user_id,operation_type,event_key,amount,currency,
                 hold_delta,balance_delta,platform_fee_delta,original_entry_id,
                 actor_type,actor_id,reason_code)
              VALUES(:cid,:uid,'recovery_pending',:key,:amt,'USD',
                     0,0,0,:origin,'admin',:admin,:reason)
            """),{"cid":cid,"uid":row["user_id"],"amt":r["amount"],
                  "origin":r["id"],"admin":admin_uid,"reason":reason.strip(),
                  "key":f"cpa:v1:{cid}:recovery:{r['id']}"})
        return {"success":True,"duplicate":False,"case_reference":case,
                "released_amount_frozen":"%.2f"%sum((r["amount"] for r in releases),ZERO)}


def confirm_cancellation(engine,*,conversion_id,case_reference,evidence_reference,admin_uid):
    """Only explicitly evidenced cancellation, never unilateral auto-debit.

    Full unspent hold -> hold_reversal and fee_reversal + decrement hold.
    Fully released but uncommitted -> explicit balance_reversal + debit
    only if all reservations remain solvent, otherwise dispute remains pending.
    Partially released/committed states remain pending for manual reconciliation
    (no silent debt, no rewrite, no payout).
    """
    cid=_parse_uuid(conversion_id)
    case=_check_reference(case_reference,"Case",8,140)
    proof=_check_reference(evidence_reference,"Cancellation evidence")
    with engine.begin() as c:
        row,wallet=lock_finance_scope(c,cid)
        epoch=epoch_row(c)
        _eligible(c,cid,row["user_id"],epoch)
        d=c.execute(text("""
            SELECT case_reference,resolution FROM public.cpa_conversion_disputes
            WHERE conversion_id=:id FOR UPDATE
        """),{"id":cid}).mappings().first()
        if not d or d["case_reference"]!=case:
            raise ManualReleaseDenied("An existing matching dispute is required")
        if d["resolution"] is not None:
            return {"success":True,"duplicate":True,"status":d["resolution"]}
        hold=c.execute(text("""
            SELECT id,amount FROM public.cpa_ledger
            WHERE conversion_id=:id AND operation_type='hold_credit' FOR UPDATE
        """),{"id":cid}).mappings().first()
        fee=c.execute(text("""
            SELECT id,amount FROM public.cpa_ledger
            WHERE conversion_id=:id AND operation_type='platform_fee_accrual' FOR UPDATE
        """),{"id":cid}).mappings().first()
        if not hold or not fee:
            raise FinanceInconsistent("Missing original financial credit/fee")
        releases=c.execute(text("""
            SELECT id,amount FROM public.cpa_ledger
            WHERE original_entry_id=:id AND
                  operation_type IN ('hold_release','manual_hold_release')
            ORDER BY created_at,id FOR UPDATE
        """),{"id":hold["id"]}).mappings().all()
        paid_out=sum((r["amount"] for r in releases),ZERO)
        if paid_out>ZERO and paid_out!=hold["amount"]:
            return {"success":False,"message":"Partly released: dispute remains frozen for review"}
        if paid_out==ZERO:
            if Decimal(wallet["hold"])<hold["amount"]:
                raise FinanceInconsistent("Held funds insufficient to reverse")
            c.execute(text("""
                INSERT INTO public.cpa_ledger(conversion_id,user_id,operation_type,
                  event_key,amount,currency,hold_delta,balance_delta,
                  platform_fee_delta,original_entry_id,actor_type,actor_id,reason_code)
                VALUES(:cid,:uid,'hold_reversal',:key,:amount,'USD',
                    :negative,0,0,:source,'admin',:admin,'verified cancellation')
            """),{"cid":cid,"uid":row["user_id"],"key":f"cpa:v1:{cid}:cancel:hold",
                  "amount":hold["amount"],"negative":-hold["amount"],
                  "source":hold["id"],"admin":admin_uid})
            c.execute(text("""
                UPDATE public.users SET hold=hold-:amount
                WHERE telegram_id=:uid AND hold>=:amount
            """),{"amount":hold["amount"],"uid":row["user_id"]})
        else:
            # Once any amount is reserved/paid, a dispute can block new
            # payouts, but must NOT turn a prior payment into hidden debt.
            committed=c.execute(text("""
              SELECT COALESCE(SUM(amount),0) FROM public.withdrawals
              WHERE user_id=:uid AND cpa_real_epoch_at=:cutover
                AND id>:old_w AND status IN ('pending','paid')
            """),{"uid":row["user_id"],"cutover":epoch["activated_at"],
                  "old_w":epoch["legacy_max_withdrawal_id"]}).scalar_one()
            if committed>ZERO or Decimal(wallet["balance"])<paid_out:
                return {"success":False,"message":"Funds reserved/paid: dispute remains pending, no automatic debt"}
            try:
                real_withdrawable(c,row["user_id"],epoch)
            except RealFinanceInconsistent:
                return {"success":False,"message":"Disputed balance requires manual reconciliation"}
            for release in releases:
                c.execute(text("""
                    INSERT INTO public.cpa_ledger(conversion_id,user_id,operation_type,
                      event_key,amount,currency,hold_delta,balance_delta,
                      platform_fee_delta,original_entry_id,actor_type,actor_id,reason_code)
                    VALUES(:cid,:uid,'balance_reversal',:key,:amt,'USD',
                       0,:neg,0,:origin,'admin',:admin,'verified cancellation')
                """),{"cid":cid,"uid":row["user_id"],
                      "key":f"cpa:v1:{cid}:cancel:{release['id']}",
                      "amt":release["amount"],"neg":-release["amount"],
                      "origin":release["id"],"admin":admin_uid})
            c.execute(text("""UPDATE public.users SET balance=balance-:amount
                WHERE telegram_id=:uid AND balance>=:amount"""),
                {"amount":paid_out,"uid":row["user_id"]})
        c.execute(text("""
          INSERT INTO public.cpa_ledger(conversion_id,user_id,operation_type,
            event_key,amount,currency,hold_delta,balance_delta,platform_fee_delta,
            original_entry_id,actor_type,actor_id,reason_code)
          VALUES(:cid,:uid,'platform_fee_reversal',:key,:amt,'USD',
                 0,0,:negative,:origin,'admin',:admin,'verified cancellation')
        """),{"cid":cid,"uid":row["user_id"],
              "key":f"cpa:v1:{cid}:cancel:fee","amt":fee["amount"],
              "negative":-fee["amount"],"origin":fee["id"],"admin":admin_uid})
        c.execute(text("""
          UPDATE public.cpa_conversion_disputes SET resolution='cancelled',
           resolved_by=:admin,resolved_at=clock_timestamp(),
           resolution_reference=:ref WHERE conversion_id=:cid
        """),{"admin":admin_uid,"ref":proof,"cid":cid})
        return {"success":True,"duplicate":False,"status":"cancelled"}
