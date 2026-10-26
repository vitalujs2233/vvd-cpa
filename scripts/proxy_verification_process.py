"""Generate browser input from real order handlers + disposable DB + fake supplier.
Run from repository root. Never accepts a production database or provider key.
"""
import os
from urllib.parse import urlparse
url=urlparse(os.environ.get('DATABASE_URL','').replace('postgresql+psycopg2','postgresql'))
if (url.hostname not in ('localhost','127.0.0.1') or url.path != '/proxy_verification_test'
        or os.getenv('TOOLS_LEDGER_TEST_DB') != '1' or os.getenv('PROXY_IPV4_API_KEY')):
    raise SystemExit('Requires localhost/proxy_verification_test, TOOLS_LEDGER_TEST_DB=1 and no provider key')
import asyncio
import json
from pathlib import Path
from uuid import UUID
from decimal import Decimal
from unittest.mock import patch
from sqlalchemy import text
from fastapi import HTTPException
from backend_v2.tests.test_proxy_wallet_readiness import ProxyWalletTests
import proxy_ipv4_preview as routes
import proxy_review_admin as admin

results=[]
ProxyWalletTests.setUpClass()

async def run(kind, uncertain=False):
    case=ProxyWalletTests();case.setUp();case.fixture_proxy_type=kind
    try:
        with case.mobile_fixture(count=2) as (state,body), patch.object(admin,'authorized_admin',return_value=True), patch.object(admin,'require_telegram_id',return_value=999), patch.object(routes,'urlopen',side_effect=AssertionError('Network forbidden')):
            oid=UUID((await routes.prepare_order(body,'test'))['id'])
            assert UUID((await routes.prepare_order(body,'test'))['id']) == oid
            checkout=routes.provider_checkout.side_effect
            reserve_seen=[]
            async def observe_reserve(selection):
                reserve_seen.append([str(v) for v in case.balances()])
                return await checkout(selection)
            routes.provider_checkout.side_effect=observe_reserve
            if uncertain: state['failure']=TimeoutError()
            try: await routes.purchase_order(oid,'test')
            except HTTPException:
                if not uncertain: raise
            assert reserve_seen == [['66.20','33.80']]
            async def capture(phase):
                orders=routes.proxy_orders('test')
                orders['orders']=[o for o in orders['orders'] if o['id']==str(oid)]
                delivery=await routes.order_proxies(oid,'test') if not uncertain else None
                row={'kind':kind,'phase':phase,'orders':orders,'delivery':delivery,
                     'balances':[str(v) for v in case.balances()], 'supplier_calls':state['calls']}
                results.append(row)
                return delivery
            if uncertain:
                for _ in range(2):
                    try: await routes.purchase_order(oid,'test')
                    except HTTPException: pass
                    else: raise AssertionError('Unknown outcome was resubmitted')
                assert case.balances()==(Decimal('66.20'),Decimal('33.80'))
                await capture('uncertain')
            else:
                with case.db.begin() as conn:
                    conn.execute(text("UPDATE tool_proxy_order_intents SET supplier_submitted_at=now()-interval '90 seconds' WHERE id=:id"),{'id':oid})
                state['visible']=0
                delayed=await capture('delayed_90s')
                assert delayed['proxies']==[] and delayed['inventory_review']['state']=='waiting'
                state['visible']=1
                partial=await capture('partial')
                assert partial['proxies']==[] and partial['inventory_review']['state']=='partial'
                with case.db.begin() as conn:
                    conn.execute(text("UPDATE tool_proxy_order_intents SET supplier_submitted_at=now()-interval '16 minutes' WHERE id=:id"),{'id':oid})
                timed=await capture('timeout')
                assert timed['proxies']==[] and timed['inventory_review']['reason']=='delivery_timeout'
                case.db.dispose()  # No in-process ownership state survives.
                state['visible']=2
                waiting=await capture('complete_unapproved')
                assert waiting['proxies']==[]
                report=await admin.inspect_order(oid,'test')
                await admin.approve_order(oid,admin.Approval(evidence_ref='mock-only:dedicated-account',exclusive_account_confirmed=True,candidate_ids=report['review']['candidate_ids']),'test')
                complete=await capture('approved')
                assert len(complete['proxies'])==2 and not complete['delivery_pending']
                await routes.purchase_order(oid,'test')
                assert case.balances()==(Decimal('66.20'),Decimal('0'))
                with case.db.connect() as conn:
                    assert conn.execute(text("SELECT count(*) FROM tool_transactions WHERE telegram_id=:uid AND kind='purchase'"),{'uid':case.uid}).scalar()==1
            assert state['calls']==1
            print(kind, 'uncertain reserve retained' if uncertain else '90s -> partial -> timeout -> restart -> manual approval -> delivery', 'PASS')
    finally:
        case.tearDown();case.doCleanups()

for kind in ('ipv4','isp','mobile'):
    asyncio.run(run(kind));asyncio.run(run(kind,True))
Path('tests/proxy-process-results.json').write_text(json.dumps({'mock_only':True,'scenarios':results},default=str,indent=2))
print('Produced 18 backend-derived UI scenarios; no live supplier requests')
