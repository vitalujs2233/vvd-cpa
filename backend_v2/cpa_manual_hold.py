"""Admin-only verified-network-receipt and manual CPA hold release.

No external payouts. Never trusts historical users.hold as an entitlement.
Caller admin identity MUST come from verified Telegram initData.
"""
import os
from decimal import Decimal
from uuid import UUID
from sqlalchemy import text
from cpa_finance import money,lock_finance_scope,FinanceIneligible,FinanceInconsistent
from cpa_real_withdrawals import epoch_row,real_withdrawable,RealFinanceInconsistent

CENT=Decimal("0.01")
ZERO=Decimal("0.00")

class ManualReleaseDenied(ValueError):
    pass

def _enabled():
    if os.getenv("VVD_CPA_EARLY_RELEASE_ENABLED")!="1":
        raise ManualReleaseDenied("Early release disabled until network receipt verification is enabled")

def _validate_reason(reason):
    if not isinstance(reason,str) or not 12<=len(reason.strip())<=500:
        raise ManualReleaseDenied("Provide a mandatory reason (12–500 characters)")
    return reason.strip()

def _parse_uuid(raw):
    try:
        return UUID(str(raw))
    except (TypeError,ValueError,AttributeError) as exc:
        raise ManualReleaseDenied("Invalid conversion or request ID") from exc

def _eligible(conn,conversion_id,user_id,epoch):
    ok=conn.execute(text("""
      SELECT 1 FROM public.conversions v
      JOIN public.clicks k ON k.click_id=v.click_id
      WHERE v.id=:id AND v.user_id=:uid AND v.status='approved'
        AND v.is_test=FALSE AND v.currency='USD'
        AND v.created_at>=:cutover AND v.finance_eligible_at>=:cutover
        AND v.finance_approved_at>=v.finance_eligible_at
        AND k.id>:old_click AND k.user_id=:uid
    """), {"id":str(conversion_id),"uid":user_id,"cutover":epoch["activated_at"],
           "old_click":epoch["legacy_max_click_row_id"]}).first()
    if not ok:
        raise ManualReleaseDenied("Not an eligible post-cutover approved CPA conversion")

def _remaining(conn,hold_id,credit_amount):
    used=Decimal(conn.execute(text("""
        SELECT COALESCE(sum(amount),0) FROM public.cpa_ledger
        WHERE original_entry_id=:source
          AND operation_type IN ('hold_release','manual_hold_release')
    """),{"source":hold_id}).scalar_one())
    remaining=Decimal(credit_amount)-used
    if remaining<ZERO:
        raise FinanceInconsistent("More hold released than original ledger credit")
    return remaining

def _disputed(conn,conversion_id):
    # Do not release if ANY dispute, correction or financial recovery is
    # present for this conversion; human resolution is required first.
    return bool(conn.execute(text("""
        SELECT 1 FROM public.cpa_ledger WHERE conversion_id=:id
        AND operation_type IN ('recovery_pending','hold_reversal',
            'platform_fee_reversal','balance_reversal')
        LIMIT 1
    """),{"id":str(conversion_id)}).first())

def read_partner_hold(engine, partner_code):
    """Admin-only API data. Old balance never reported as available CPA hold."""
    with engine.connect() as c:
        u=c.execute(text("""
            SELECT telegram_id,partner_code,balance,hold
            FROM public.users WHERE partner_code=:code
        """),{"code":partner_code}).mappings().first()
        if not u:
            raise ManualReleaseDenied("Partner not found")
        try:
            epoch=epoch_row(c)
        except Exception as e:
            from cpa_real_withdrawals import RealFinanceDisabled
            if not isinstance(e,RealFinanceDisabled):
                raise
            return {"partner_code":partner_code,"real_finance_active":False,
                    "cpa_hold":"0.00","real_withdrawable":"0.00","credits":[]}
        credits=c.execute(text("""
            SELECT h.id,h.conversion_id,h.amount,h.hold_until,
                   v.finance_approved_at,v.payout_gross,
                   (SELECT COALESCE(sum(r.amount),0) FROM public.cpa_ledger r
                      WHERE r.original_entry_id=h.id AND
                        r.operation_type IN ('hold_release','manual_hold_release')) AS released,
                   (SELECT count(*) FROM public.cpa_ledger d
                      WHERE d.conversion_id=h.conversion_id
                        AND d.operation_type IN ('recovery_pending','hold_reversal',
                         'balance_reversal','platform_fee_reversal')) AS disputes,
                   rec.id AS receipt_id,rec.settlement_reference
            FROM public.cpa_ledger h
            JOIN public.conversions v ON v.id=h.conversion_id
            JOIN public.clicks k ON k.click_id=v.click_id
            LEFT JOIN public.cpa_network_receipts rec ON rec.conversion_id=v.id
            WHERE h.user_id=:uid AND h.operation_type='hold_credit'
              AND v.status='approved' AND v.is_test=FALSE AND v.currency='USD'
              AND v.created_at>=:cutover AND v.finance_eligible_at>=:cutover
              AND v.finance_approved_at>=v.finance_eligible_at
              AND k.id>:old_click AND k.user_id=v.user_id
            ORDER BY h.hold_until,h.id
        """),{"uid":u["telegram_id"],"cutover":epoch["activated_at"],
              "old_click":epoch["legacy_max_click_row_id"]}).mappings().all()
        results=[]
        for x in credits:
            rem=max(ZERO,Decimal(x["amount"])-Decimal(x["released"]))
            blocked=bool(x["disputes"])
            verified=bool(x["receipt_id"])
            results.append({
               "conversion_id":str(x["conversion_id"]),
               "hold_id":str(x["id"]),
               "original":"%.2f"%x["amount"],
               "remaining":"%.2f"%rem,
               "hold_until":x["hold_until"].isoformat(),
               "approved_at":x["finance_approved_at"].isoformat(),
               "network_verified":verified,
               "settlement_reference":x["settlement_reference"],
               "disputed":blocked,
               "early_releasable":"%.2f"%(rem if verified and not blocked else ZERO)
            })
        try:
            spendable=min(real_withdrawable(c,u["telegram_id"],epoch),Decimal(u["balance"]))
            real_available="%.2f"%max(ZERO,spendable)
        except RealFinanceInconsistent:
            real_available="0.00"
        return {"partner_code":partner_code,"real_finance_active":True,
                "cpa_hold":"%.2f"%sum((Decimal(x["remaining"]) for x in results),ZERO),
                "real_withdrawable":real_available,
                "early_release_enabled":os.getenv("VVD_CPA_EARLY_RELEASE_ENABLED")=="1",
                "credits":results}

def record_verified_receipt(engine,*,partner_code,conversion_id,
                            settlement_reference,verification_source,
                            evidence_reference,received_gross,received_at,admin_uid):
    """The admin must independently match network settlement against bank or
    processor statement OUTSIDE this app. Store ONLY nonsecret reference IDs.
    Admin attestation is not independent bank integration.
    """
    _enabled()
    cid=_parse_uuid(conversion_id)
    if verification_source not in ("bank_verified","processor_verified"):
        raise ManualReleaseDenied("Independent bank/processor matching required")
    if not isinstance(settlement_reference,str) or not 8<=len(settlement_reference.strip())<=160:
        raise ManualReleaseDenied("Provide external settlement reference")
    if not isinstance(evidence_reference,str) or not 8<=len(evidence_reference.strip())<=200:
        raise ManualReleaseDenied("Provide private proof reference, not bank credentials")
    gross=money(received_gross)
    if gross<=ZERO:
        raise ManualReleaseDenied("Received amount must be positive")
    from datetime import datetime,timezone
    try:
        received=datetime.fromisoformat(received_at.replace("Z","+00:00"))
        if received.tzinfo is None or received>datetime.now(timezone.utc):
            raise ValueError()
    except (ValueError,AttributeError,TypeError) as exc:
        raise ManualReleaseDenied("Valid past settlement timestamp with time zone required") from exc
    with engine.begin() as c:
        prelim=c.execute(text("SELECT user_id FROM public.conversions WHERE id=:id"),
                         {"id":str(cid)}).first()
        if not prelim:
            raise ManualReleaseDenied("Conversion not found")
        u=c.execute(text("SELECT telegram_id,partner_code FROM public.users WHERE telegram_id=:uid FOR UPDATE"),
                    {"uid":prelim.user_id}).mappings().first()
        if not u or u["partner_code"]!=partner_code:
            raise ManualReleaseDenied("Partner does not own conversion")
        row,_=lock_finance_scope(c,cid)
        epoch=epoch_row(c)
        _eligible(c,cid,row["user_id"],epoch)
        if _disputed(c,cid):
            raise ManualReleaseDenied("Disputed conversion cannot be funded for manual release")
        if gross<Decimal(row["payout_gross"]):
            raise ManualReleaseDenied("Full network gross must be verifiably received")
        existing=c.execute(text("SELECT id FROM public.cpa_network_receipts WHERE conversion_id=:id"),
                           {"id":str(cid)}).first()
        if existing:
            raise ManualReleaseDenied("Verified receipt already recorded; immutable")
        rec=c.execute(text("""
            INSERT INTO public.cpa_network_receipts(
             conversion_id,settlement_reference,verification_source,evidence_reference,
             received_gross,received_at,verified_by)
            VALUES(:cid,:ref,:source,:evidence,:amount,:received,:admin) RETURNING id
        """),{"cid":str(cid),"ref":settlement_reference.strip(),
              "source":verification_source,"evidence":evidence_reference.strip(),
              "amount":gross,"received":received,"admin":admin_uid}).scalar_one()
        return {"success":True,"receipt_id":str(rec),"partner_code":partner_code}

def manual_release(engine,*,partner_code,conversion_id,amount,reason,request_id,admin_uid):
    """Atomic partial or full early release, users -> conversion -> source ledger.
    Duplicate request IDs are idempotent; any other concurrent request is
    serialized on users row. No auto-created debt or external payout.
    """
    _enabled()
    cid=_parse_uuid(conversion_id)
    rid=_parse_uuid(request_id)
    reason=_validate_reason(reason)
    requested=money(amount)
    if requested<=ZERO:
        raise ManualReleaseDenied("Release must be positive")
    event=f"cpa:v1:{cid}:manual:{rid}"
    with engine.begin() as c:
        preliminary=c.execute(text("SELECT user_id FROM public.conversions WHERE id=:id"),
                              {"id":str(cid)}).first()
        if not preliminary:
            raise ManualReleaseDenied("Conversion not found")
        u=c.execute(text("SELECT telegram_id,partner_code,balance,hold FROM public.users WHERE telegram_id=:uid FOR UPDATE"),
                    {"uid":preliminary.user_id}).mappings().first()
        if not u or u["partner_code"]!=partner_code:
            raise ManualReleaseDenied("Partner mismatch")
        row,wallet=lock_finance_scope(c,cid)
        epoch=epoch_row(c)
        _eligible(c,cid,row["user_id"],epoch)
        duplicate=c.execute(text("""
            SELECT amount,actor_id,reason_code,conversion_id
            FROM public.cpa_ledger
            WHERE event_key=:event AND operation_type='manual_hold_release'
        """),{"event":event}).mappings().first()
        if duplicate:
            if (duplicate["amount"]!=requested or duplicate["actor_id"]!=admin_uid
                or duplicate["reason_code"]!=reason or duplicate["conversion_id"]!=cid):
                raise ManualReleaseDenied("Idempotency request ID collision")
            return {"success":True,"duplicate":True,"amount":"%.2f"%requested}
        if _disputed(c,cid):
            raise ManualReleaseDenied("Conversion has unresolved correction/dispute")
        hold=c.execute(text("""
          SELECT id,amount,hold_until FROM public.cpa_ledger
          WHERE conversion_id=:cid AND operation_type='hold_credit' FOR UPDATE
        """),{"cid":str(cid)}).mappings().first()
        if not hold:
            raise ManualReleaseDenied("No confirmed CPA credit in hold")
        remaining=_remaining(c,hold["id"],hold["amount"])
        if requested>remaining or requested>Decimal(wallet["hold"]):
            raise ManualReleaseDenied("Insufficient unreleased CPA hold")
        receipt=c.execute(text("""
          SELECT id,received_gross FROM public.cpa_network_receipts
          WHERE conversion_id=:cid AND verified_at IS NOT NULL FOR SHARE
        """),{"cid":str(cid)}).mappings().first()
        if not receipt or receipt["received_gross"]<row["payout_gross"]:
            raise ManualReleaseDenied("Verified network settlement not found")
        c.execute(text("""
          INSERT INTO public.cpa_ledger(
           conversion_id,user_id,operation_type,event_key,amount,currency,
           hold_delta,balance_delta,platform_fee_delta,original_entry_id,
           actor_type,actor_id,reason_code,receipt_id)
          VALUES(:cid,:uid,'manual_hold_release',:event,:amount,'USD',
                :delta,:amount,0,:origin,'admin',:admin,:reason,:receipt)
        """),{"cid":str(cid),"uid":row["user_id"],"event":event,
              "amount":requested,"delta":-requested,"origin":hold["id"],
              "admin":admin_uid,"reason":reason,"receipt":receipt["id"]})
        updated=c.execute(text("""
          UPDATE public.users SET hold=hold-:amount,balance=balance+:amount
          WHERE telegram_id=:uid AND hold>=:amount
          RETURNING telegram_id
        """),{"uid":row["user_id"],"amount":requested}).first()
        if not updated:
            raise FinanceInconsistent("Hold changed during manual release")
        return {"success":True,"duplicate":False,"amount":"%.2f"%requested,
                "partner_code":partner_code,"conversion_id":str(cid)}
