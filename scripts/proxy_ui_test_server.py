"""Local CI-only HTTP bridge to real order handlers and disposable PostgreSQL.

Never imported by production. Supplier I/O and identity are replaced by the existing
test fixture; no real keys, real wallets or external supplier network are allowed.
"""
import os
from contextlib import ExitStack
from datetime import datetime, timezone, timedelta
from decimal import Decimal
from uuid import UUID, uuid4
from unittest.mock import patch
from sqlalchemy.engine import make_url

db = make_url(os.environ['DATABASE_URL'])
if (os.getenv('TOOLS_LEDGER_TEST_DB') != '1' or db.host not in ('localhost', '127.0.0.1')
        or db.database != 'proxy_verification_test'):
    raise RuntimeError('Only disposable localhost proxy_verification_test is allowed')
if any(os.getenv(k) for k in ('PROXY_IPV4_API_KEY', 'PROXY_IPV4_KEY')):
    raise RuntimeError('Real supplier credentials are forbidden')

from fastapi import FastAPI
from fastapi.middleware.cors import CORSMiddleware
from sqlalchemy import text
from backend_v2.tests.test_proxy_wallet_readiness import ProxyWalletTests
import proxy_ipv4_preview as routes
import proxy_control as control
from proxy_fulfillment import sweep_once

kind = os.environ['PROXY_TEST_KIND']
assert kind in ('ipv4', 'isp', 'mobile')
ProxyWalletTests.setUpClass()
fixture = ProxyWalletTests()
fixture.fixture_proxy_type = kind
fixture.setUp()
stack = ExitStack()
state, _ = stack.enter_context(fixture.mobile_fixture(count=2))
state['visible'] = 0
stack.enter_context(patch.object(routes, 'SUPPORTED_PURCHASE_TYPES', ('ipv6',)))
if os.getenv('PROXY_TEST_MODE')=='production':
    stack.enter_context(patch.dict(os.environ, PROXY_IPV4_PURCHASES_ENABLED='true',
        PROXY_IPV4_PRODUCTION_TYPES=kind, PROXY_IPV4_EXCLUSIVE_ACCOUNT_CONFIRMED='true',
        PROXY_IPV4_FINANCIAL_ACCEPTANCE_REF='ci:production-acceptance'))
else:
    stack.enter_context(patch.dict(os.environ, PROXY_IPV4_PURCHASES_ENABLED='false'))
stack.enter_context(patch.object(routes, 'urlopen', side_effect=AssertionError('Live network forbidden')))
stack.enter_context(patch.object(control, 'admin', return_value=999))
with fixture.db.begin() as conn:
    conn.execute(text('DELETE FROM tool_proxy_order_intents WHERE id=:id'), {'id':fixture.oid})

app = FastAPI()
app.add_middleware(CORSMiddleware, allow_origins=['http://127.0.0.1:3011'], allow_methods=['*'], allow_headers=['*'])
app.include_router(routes.router)

@app.get('/test/health')
def health():
    return {'mock_only':True, 'kind':kind}

@app.post('/test/permit/{order_id}')
def permit(order_id: UUID):
    assert any(o['id'] == str(order_id) for o in routes.proxy_orders('test')['orders'])
    body = control.Permit(permit_id=uuid4(), max_amount_usd=Decimal('33.80'),
        expires_at=datetime.now(timezone.utc)+timedelta(minutes=30),
        exclusive_account_confirmed=True, evidence_ref='mock:ui-check')
    return control.grant_permit(order_id, body, 'test-admin')

@app.post('/test/inventory/{count}')
async def inventory(count: int):
    assert count in (0,1,2)
    state['visible'] = count
    # Simulate delayed issuance >1 minute without wall-clock waiting.
    with fixture.db.begin() as conn:
        conn.execute(text("UPDATE tool_proxy_order_intents SET supplier_submitted_at=now()-interval '90 seconds' WHERE telegram_id=:u AND status='fulfilled'"), {'u':fixture.uid})
    await sweep_once()
    return report()

@app.get('/test/report')
def report():
    with fixture.db.connect() as conn:
        transactions=conn.execute(text("SELECT count(*) FROM tool_transactions WHERE telegram_id=:u AND kind='purchase'"), {'u':fixture.uid}).scalar()
        permits=conn.execute(text('SELECT count(*) FROM tool_proxy_control_permits p JOIN tool_proxy_order_intents o ON o.id=p.order_id WHERE o.telegram_id=:u'), {'u':fixture.uid}).scalar()
    return {'mock_only':True, 'supplier_calls':state['calls'], 'balances':[str(x) for x in fixture.balances()],
            'purchase_transactions':transactions, 'permits':permits, 'orders':routes.proxy_orders('test')['orders']}

@app.post('/test/reconnect')
def reconnect():
    fixture.db.dispose()
    return report()

@app.on_event('shutdown')
def cleanup():
    stack.close()
    fixture.tearDown()
    fixture.doCleanups()

if __name__ == '__main__':
    import uvicorn
    uvicorn.run(app, host='127.0.0.1', port=3012)
