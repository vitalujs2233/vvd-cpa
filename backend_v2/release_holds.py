"""Explicit CLI for future hold-release scheduling. No schedule is registered.

Examples (ONLY in separately approved isolated/production environment):
    cd backend_v2 && python release_holds.py --dry-run
    VVD_CPA_HOLD_RELEASE_ENABLED=1 python release_holds.py --execute --limit 100

The --execute command needs BOTH an explicit argument and a separate enabled
environment flag. Neither is configured by this PR. Database epoch activation
is also mandatory. No network payout or transfer is performed.
"""
import argparse
import os
from sqlalchemy import text

def main():
    parser=argparse.ArgumentParser(description="CPA mature hold release (disabled by default)")
    op=parser.add_mutually_exclusive_group(required=True)
    op.add_argument("--dry-run",action="store_true")
    op.add_argument("--execute",action="store_true")
    parser.add_argument("--limit",type=int,default=100)
    args=parser.parse_args()
    if not 1<=args.limit<=500:
        parser.error("--limit must be 1..500")
    if args.execute and os.getenv("VVD_CPA_HOLD_RELEASE_ENABLED")!="1":
        parser.error("hold release DISABLED: explicit VVD_CPA_HOLD_RELEASE_ENABLED=1 required")
    from database import engine
    from cpa_real_withdrawals import release_matured_holds,epoch_row,RealFinanceDisabled
    if args.dry_run:
        with engine.connect() as conn:
            try:
                epoch=epoch_row(conn)
            except RealFinanceDisabled:
                print("Stage 5.3 disabled: finance epoch not activated; no action")
                return
            total=conn.execute(text("""
                SELECT count(*) FROM public.cpa_ledger l
                JOIN public.conversions v ON v.id=l.conversion_id
                JOIN public.clicks k ON k.click_id=v.click_id
                WHERE l.operation_type='hold_credit'
                  AND l.hold_until<=clock_timestamp()
                  AND v.status='approved' AND v.is_test=FALSE AND v.currency='USD'
                  AND v.created_at>=:cutover
                  AND v.finance_eligible_at>=:cutover
                  AND k.id>:legacy_click AND k.user_id=v.user_id
                  AND NOT EXISTS (
                    SELECT 1 FROM public.cpa_ledger x
                    WHERE x.original_entry_id=l.id
                      AND x.operation_type IN ('hold_release','hold_reversal')
                  )
            """), {"cutover":epoch["activated_at"],
                   "legacy_click":epoch["legacy_max_click_row_id"]}).scalar_one()
            print(f"DRY-RUN ONLY: {total} potentially matured entries; no changes")
        return
    result=release_matured_holds(engine,limit=args.limit)
    print(f"Released matured CPA hold entries: {result['released']}; no external payment")

if __name__=="__main__":
    main()
