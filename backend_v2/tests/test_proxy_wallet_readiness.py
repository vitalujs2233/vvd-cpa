"""Run only against disposable PostgreSQL. Never uses a provider account."""
import os
import asyncio
from contextlib import contextmanager
from datetime import datetime, timezone, timedelta
import unittest
from uuid import UUID, uuid4
from decimal import Decimal as D
from concurrent.futures import ThreadPoolExecutor
from unittest.mock import patch, AsyncMock
from sqlalchemy import create_engine, text
from sqlalchemy.exc import IntegrityError
from fastapi import HTTPException
import proxy_ipv4_wallet as w
import proxy_ipv4_preview as routes
from pathlib import Path
from backend_v2.tests import test_tools_order_ledger as ledger_fixture

class ProxyWalletTests(unittest.TestCase):
    @classmethod
    def setUpClass(cls):
        if os.getenv('TOOLS_LEDGER_TEST_DB')!='1':raise unittest.SkipTest('Disposable PostgreSQL required')
        cls.db=create_engine(os.environ['DATABASE_URL'])
        with cls.db.begin() as c:
            c.execute(text('CREATE TABLE IF NOT EXISTS users(telegram_id bigint PRIMARY KEY,first_name text)'))
            sql=(Path(__file__).parents[1]/'migrations/20261016_tools_marketplace.sql').read_text()
            sql='\n'.join(line for line in sql.splitlines() if not line.lstrip().startswith('--'))
            for part in sql.split(';'):
                if 'REVOKE ALL' not in part and part.strip():c.execute(text(part))
            c.execute(text('ALTER TABLE tool_wallets ADD COLUMN IF NOT EXISTS refund_debt numeric(14,2) NOT NULL DEFAULT 0'))
        with cls.db.begin() as c:
            c.execute(text('''CREATE TABLE IF NOT EXISTS tool_proxy_order_intents (
                id uuid PRIMARY KEY DEFAULT gen_random_uuid(), telegram_id bigint NOT NULL, request_id uuid NOT NULL,
                proxy_type text NOT NULL, selection jsonb NOT NULL, quoted_amount numeric NOT NULL,
                proxy_ids_before jsonb, delivered_proxy_ids jsonb, provider_cost numeric, supplier_submitted_at timestamptz, provider_order_id text UNIQUE, status text NOT NULL DEFAULT 'prepared',
                created_at timestamptz DEFAULT now(), updated_at timestamptz DEFAULT now(),
                UNIQUE(telegram_id,request_id))'''))
        with cls.db.begin() as c:
            sql=(Path(__file__).parents[2]/'supabase/migrations/20261026103820_proxy_inventory_review.sql').read_text()
            sql='\n'.join(line for line in sql.splitlines() if not line.lstrip().startswith('--'))
            sql=sql.replace('CREATE TABLE ', 'CREATE TABLE IF NOT EXISTS ').replace('CREATE INDEX ', 'CREATE INDEX IF NOT EXISTS ')
            for part in sql.split(';'):
                if part.strip() and 'REVOKE ALL' not in part:c.execute(text(part))
        with cls.db.begin() as c:
            sql=(Path(__file__).parents[2]/'supabase/migrations/20261026125133_proxy_controlled_checkout.sql').read_text()
            sql='\n'.join(line for line in sql.splitlines() if not line.lstrip().startswith('--'))
            sql=sql.replace('CREATE TABLE ', 'CREATE TABLE IF NOT EXISTS ')
            for part in sql.split(';'):
                if part.strip() and 'REVOKE ALL' not in part:c.execute(text(part))
    def setUp(self):
        ledger_fixture.LedgerTests.setUp(self)
        self.patch=patch.object(w,'engine',self.db);self.patch.start();self.addCleanup(self.patch.stop)
        self.oid=self.order()
    def tearDown(self):
        with self.db.begin() as c:
            for table in ('tool_proxy_financial_resolutions','tool_proxy_control_permits','tool_proxy_review_audit','tool_proxy_assignments','tool_proxy_reviews'):
                c.execute(text(f'DELETE FROM {table} WHERE order_id IN (SELECT id FROM tool_proxy_order_intents WHERE telegram_id=:u)'),dict(u=self.uid))
            c.execute(text('DELETE FROM tool_proxy_order_intents WHERE telegram_id=:u'),dict(u=self.uid))
    balances=ledger_fixture.LedgerTests.balances
    def order(self,amount='1.30'):
        oid=uuid4()
        with self.db.begin() as c:c.execute(text("INSERT INTO tool_proxy_order_intents(id,telegram_id,request_id,proxy_type,selection,quoted_amount) VALUES(:id,:u,:r,'ipv6','{}',:a)"),dict(id=oid,u=self.uid,r=uuid4(),a=D(amount)))
        return oid
    @contextmanager
    def mobile_fixture(self, count=1):
        # TEST ONLY: no live key, no network; eligibility override is scoped to mocks.
        kind=getattr(self,'fixture_proxy_type','mobile')
        state={'paid':False,'calls':0,'cost':'26','balance':'100','visible':count,'failure':None,'read_failure':False}
        receipt='mock-'+kind+'-'+str(uuid4())
        async def supplier(path,params):
            if path=='get/days':return {'days':[3]}
            if path=='get/countries':return {'countries':[{'alpha3code':'GBR','name':'England'}]}
            if path=='get/tariffs':return {'tariffs':[{'country':'GBR','mobileOperator':[{'name':'three_unitedkingdom','rotationTime':[0,5]}]}]}
            if path=='get/order/price':return {'amount':state['cost'],'currency':'USD','balance':state['balance']}
            if path=='get/proxies':
                if state['read_failure']:raise HTTPException(502,'Temporary supplier failure')
                now=datetime.now(timezone.utc)
                items=[{'id':'old'}]
                if state['paid']:
                    items += [{'id':f'{kind}-{i}','country':'GBR','dateStart':now.isoformat(),'dateEnd':(now+timedelta(days=3)).isoformat(),'mobileOperator':'three_unitedkingdom','rotationTime':0,'ip':f'192.0.2.{i+1}','httpsPort':'8080','authInfo':{'login':'test-only','password':'test-only'}} for i in range(state['visible'])]
                return {'proxies':items}
            raise AssertionError('Unexpected provider method')
        async def checkout(selection):
            payload=routes.provider_order_payload(selection)
            self.assertEqual(payload['proxyType'],kind)
            if kind=='mobile':
                self.assertEqual(payload['mobileOperator'],'three_unitedkingdom');self.assertEqual(payload['rotationTime'],0)
            else:
                self.assertNotIn('mobileOperator',payload);self.assertNotIn('rotationTime',payload)
            state['calls']+=1;state['paid']=True
            if state['failure']:raise state['failure']
            return {'success':True,'orderNumber':receipt,'currency':'USD','proxyType':kind}
        with self.db.begin() as c:c.execute(text('UPDATE tool_wallets SET available=100 WHERE telegram_id=:u'),dict(u=self.uid))
        with patch.object(routes,'engine',self.db),patch.object(routes,'require_telegram_id',return_value=self.uid),patch.object(routes,'SUPPORTED_PURCHASE_TYPES',('ipv6',kind)),patch.dict(os.environ,PROXY_IPV4_PURCHASES_ENABLED='true',PROXY_IPV4_MARKUP_PERCENT='30'),patch.object(routes,'provider',side_effect=supplier),patch.object(routes,'provider_checkout',side_effect=checkout):
            body=routes.PrepareOrder(proxy_type=kind,country='GBR',days=3,count=count,mobile_operator='three_unitedkingdom' if kind=='mobile' else None,rotation_time=0 if kind=='mobile' else None,request_id=uuid4())
            yield state,body

    def test_mobile_success_replay_and_unverified_inventory_never_delivered(self):
        async def scenario():
            with self.mobile_fixture() as (state,body):
                self.assertEqual((await routes.quote(body,'test'))['customer_total_usd'],'33.80')
                order=await routes.prepare_order(body,'test');oid=UUID(order['id'])
                self.assertEqual((await routes.prepare_order(body,'test'))['id'],order['id'])
                await routes.purchase_order(oid,'test');await routes.purchase_order(oid,'test')
                self.assertEqual(state['calls'],1);self.assertEqual(self.balances(),(D('66.20'),D('0')))
                for _ in range(2):
                    result=await routes.order_proxies(oid,'test')
                    self.assertEqual(result['proxies'],[]);self.assertTrue(result['delivery_pending'])
                    self.assertEqual(result['inventory_review']['reason'],'external_purchase_cannot_be_excluded')
                with self.db.connect() as c:
                    row=c.execute(text('SELECT proxy_ids_before,delivered_proxy_ids,provider_order_id FROM tool_proxy_order_intents WHERE id=:id'),dict(id=oid)).one()
                    self.assertEqual(row.proxy_ids_before,['old']);self.assertIsNone(row.delivered_proxy_ids);self.assertTrue(row.provider_order_id)
                with patch.object(routes,'require_telegram_id',return_value=self.uid+1):
                    with self.assertRaises(HTTPException) as e:await routes.order_proxies(oid,'test')
                    self.assertEqual(e.exception.status_code,404)
        asyncio.run(scenario())

    def test_mobile_delayed_partial_and_external_inventory(self):
        async def scenario():
            with self.mobile_fixture(count=2) as (state,body):
                order=await routes.prepare_order(body,'test');oid=UUID(order['id']);await routes.purchase_order(oid,'test')
                for visible,expected in [(0,'delivery_delayed'),(1,'partial_candidates_unverified'),(3,'unexpected_extra_proxies')]:
                    state['visible']=visible;result=await routes.order_proxies(oid,'test')
                    self.assertEqual(result['proxies'],[]);self.assertEqual(result['inventory_review']['reason'],expected)
                self.assertEqual(state['calls'],1)
        asyncio.run(scenario())

    def test_mobile_price_change_and_insufficient_balances_no_paid_call(self):
        async def scenario():
            with self.mobile_fixture() as (state,body):
                oid=UUID((await routes.prepare_order(body,'test'))['id'])
                state['cost']='27'
                with self.assertRaises(HTTPException):await routes.purchase_order(oid,'test')
                state['cost']='26';state['balance']='0'
                with self.assertRaises(HTTPException):await routes.purchase_order(oid,'test')
                state['balance']='100'
                with self.db.begin() as c:c.execute(text('UPDATE tool_wallets SET available=10 WHERE telegram_id=:u'),dict(u=self.uid))
                with self.assertRaises(HTTPException):await routes.purchase_order(oid,'test')
                self.assertEqual(state['calls'],0);self.assertEqual(self.balances(),(D('10'),D('0')))
        asyncio.run(scenario())

    def test_mobile_provider_timeout_retains_reserve_and_blocks_replay(self):
        async def scenario():
            with self.mobile_fixture() as (state,body):
                state['failure']=TimeoutError()
                oid=UUID((await routes.prepare_order(body,'test'))['id'])
                for _ in range(2):
                    with self.assertRaises(HTTPException):await routes.purchase_order(oid,'test')
                self.assertEqual(state['calls'],1);self.assertEqual(self.balances(),(D('66.20'),D('33.80')))
                with self.assertRaises(HTTPException):w.release_reservation(self.uid,oid)
        asyncio.run(scenario())

    def test_mobile_persisted_lane_blocks_other_owner_after_restart(self):
        async def scenario():
            with self.mobile_fixture() as (state,body):
                blocker=uuid4()
                # No process lock is held: only the durable record from an earlier process remains.
                with self.db.begin() as c:
                    c.execute(text("INSERT INTO tool_proxy_order_intents(id,telegram_id,request_id,proxy_type,selection,quoted_amount,status) VALUES(:id,:u,:r,:kind,'{}',33.80,'uncertain')"),
                              dict(id=blocker,u=self.uid+1000000000001,r=uuid4(),kind=body.proxy_type))
                try:
                    oid=UUID((await routes.prepare_order(body,'test'))['id'])
                    with self.assertRaises(HTTPException):await routes.purchase_order(oid,'test')
                    self.assertEqual(state['calls'],0)
                    self.assertEqual(self.balances(),(D('100'),D('0')))
                finally:
                    with self.db.begin() as c:c.execute(text('DELETE FROM tool_proxy_order_intents WHERE id=:id'),dict(id=blocker))
        asyncio.run(scenario())

    def test_mobile_manual_approval_persists_and_replay_is_readonly(self):
        import proxy_review_admin as admin
        async def scenario():
            with self.mobile_fixture() as (state,body),patch.object(admin,'authorized_admin',return_value=True),patch.object(admin,'require_telegram_id',return_value=999):
                oid=UUID((await routes.prepare_order(body,'test'))['id'])
                await routes.purchase_order(oid,'test')
                report=await admin.inspect_order(oid,'test')
                self.assertEqual(report['review']['reason'],'external_purchase_cannot_be_excluded')
                ids=report['review']['candidate_ids']
                approval=admin.Approval(evidence_ref='support-ticket:test',exclusive_account_confirmed=True,candidate_ids=ids)
                await admin.approve_order(oid,approval,'test')
                # Simulate a new handler/process: no in-memory assignment is consulted.
                await admin.approve_order(oid,approval,'test')
                result=await routes.order_proxies(oid,'test')
                self.assertEqual(len(result['proxies']),1);self.assertFalse(result['delivery_pending'])
                self.assertEqual(state['calls'],1);self.assertEqual(self.balances(),(D('66.20'),D('0')))
                with self.db.connect() as c:
                    self.assertEqual(c.execute(text('SELECT count(*) FROM tool_proxy_assignments WHERE order_id=:id'),dict(id=oid)).scalar(),1)
                    self.assertEqual(c.execute(text("SELECT count(*) FROM tool_proxy_review_audit WHERE order_id=:id AND action='approved'"),dict(id=oid)).scalar(),1)
                # Database uniqueness prevents assigning the same supplier ID twice.
                with self.assertRaises(IntegrityError),self.db.begin() as c:
                    c.execute(text('INSERT INTO tool_proxy_assignments(proxy_type,proxy_id,order_id) VALUES(:kind,:proxy,:id)'),dict(kind=body.proxy_type,proxy=ids[0],id=self.oid))
        asyncio.run(scenario())

    def test_mobile_timeout_review_survives_network_error_and_restart(self):
        import proxy_review_admin as admin
        async def scenario():
            with self.mobile_fixture() as (state,body),patch.object(admin,'authorized_admin',return_value=True),patch.object(admin,'require_telegram_id',return_value=999):
                oid=UUID((await routes.prepare_order(body,'test'))['id']);await routes.purchase_order(oid,'test')
                state['visible']=0
                with self.db.begin() as c:c.execute(text("UPDATE tool_proxy_order_intents SET supplier_submitted_at=now()-interval '16 minutes' WHERE id=:id"),dict(id=oid))
                result=await routes.order_proxies(oid,'test');self.assertEqual(result['inventory_review']['reason'],'delivery_timeout')
                state['read_failure']=True
                with self.assertRaises(HTTPException):await routes.order_proxies(oid,'test')
                with self.db.connect() as c:self.assertEqual(c.execute(text('SELECT state FROM tool_proxy_reviews WHERE order_id=:id'),dict(id=oid)).scalar(),'manual_review')
                state['read_failure']=False;state['visible']=1
                result=await routes.order_proxies(oid,'test');self.assertEqual(result['proxies'],[])
                self.assertEqual(result['inventory_review']['state'],'manual_review')
                self.assertEqual(state['calls'],1)
                before=self.balances()
                wrong=admin.Approval(evidence_ref='ticket:test',exclusive_account_confirmed=False,candidate_ids=['wrong'])
                with self.assertRaises(HTTPException):await admin.approve_order(oid,wrong,'test')
                self.assertEqual(before,self.balances())
                with self.db.connect() as c:self.assertEqual(c.execute(text("SELECT count(*) FROM tool_proxy_review_audit WHERE order_id=:id AND action='approval_denied'"),dict(id=oid)).scalar(),1)
        asyncio.run(scenario())

    def test_mobile_historical_conflict_blocks_approval_after_restart(self):
        import proxy_review_admin as admin
        async def scenario():
            with self.mobile_fixture() as (state,body),patch.object(admin,'authorized_admin',return_value=True),patch.object(admin,'require_telegram_id',return_value=999):
                oid=UUID((await routes.prepare_order(body,'test'))['id'])
                await routes.purchase_order(oid,'test')
                state['visible']=2
                first=await admin.inspect_order(oid,'test')
                self.assertEqual(first['review']['reason'],'unexpected_extra_proxies')
                state['read_failure']=True
                await admin.inspect_order(oid,'test')
                state['read_failure']=False;state['visible']=1
                # Discard pooled connections as a new backend would; evidence is in PostgreSQL.
                self.db.dispose()
                approval=admin.Approval(evidence_ref='ticket:test',exclusive_account_confirmed=True,
                                       candidate_ids=[body.proxy_type+'-0'])
                with self.assertRaises(HTTPException) as error:
                    await admin.approve_order(oid,approval,'test')
                self.assertEqual(error.exception.status_code,409)
                result=await routes.order_proxies(oid,'test')
                self.assertEqual(result['proxies'],[])
                report=await admin.inspect_order(oid,'test')
                self.assertIn('unexpected_extra_proxies',report['review']['conflict_reasons'])
                self.assertEqual(len(report['review']['observed_candidate_ids']),2)
                self.assertEqual(state['calls'],1)
                self.assertEqual(self.balances(),(D('66.20'),D('0')))
        asyncio.run(scenario())

    def test_mobile_other_process_lock_blocks_purchase(self):
        import subprocess, sys
        async def scenario():
            with self.mobile_fixture() as (state,body):
                oid=UUID((await routes.prepare_order(body,'test'))['id'])
                script="""import os,sys
from sqlalchemy import create_engine,text
with create_engine(os.environ['DATABASE_URL']).connect() as c:
    c.execute(text('SELECT pg_advisory_lock(hashtext(:key))'), {'key':sys.argv[1]})
    print('locked',flush=True)
    sys.stdin.readline()
"""
                child=subprocess.Popen([sys.executable,'-c',script,'vvd-proxy-checkout-'+body.proxy_type],
                                       stdin=subprocess.PIPE,stdout=subprocess.PIPE,text=True)
                try:
                    self.assertEqual(await asyncio.to_thread(child.stdout.readline),'locked\n')
                    with self.assertRaises(HTTPException) as error:await routes.purchase_order(oid,'test')
                    self.assertEqual(error.exception.status_code,409)
                    self.assertEqual(state['calls'],0)
                    self.assertEqual(self.balances(),(D('100'),D('0')))
                finally:
                    child.communicate('done\n',timeout=10)
        asyncio.run(scenario())

    def test_checkout_delivery_replay_and_foreign_owner(self):
        async def scenario():
            receipt='fixture-'+str(uuid4())
            items=[{'id':str(i),'ip':f'192.0.2.1:{10000+i}','protocol':'SOCKS5'} for i in range(10)]
            async def provider(path,params):
                if path=='get/order/price':return {'amount':'1','balance':'100','currency':'USD'}
                return {'proxies':[{'orderId':receipt,'ips':items},{'orderId':'foreign','ips':[{'id':'foreign','ip':'192.0.2.99:80','protocol':'HTTP'}]}]}
            with patch.object(routes,'engine',self.db),patch.object(routes,'require_telegram_id',return_value=self.uid),patch.dict(os.environ,PROXY_IPV4_PURCHASES_ENABLED='true',PROXY_IPV4_MARKUP_PERCENT='30'),patch.object(routes,'quote',new_callable=AsyncMock,return_value={'customer_total_usd':'1.30'}),patch.object(routes,'provider',side_effect=provider),patch.object(routes,'provider_checkout',new_callable=AsyncMock,return_value={'success':True,'orderNumber':receipt}) as checkout:
                body=routes.PrepareOrder(proxy_type='ipv6',country='GBR',days=30,count=10,request_id=uuid4())
                order=await routes.prepare_order(body,'test');oid=UUID(order['id'])
                self.assertEqual(order['id'],(await routes.prepare_order(body,'test'))['id'])
                await routes.purchase_order(oid,'test');await routes.purchase_order(oid,'test')
                self.assertEqual(checkout.await_count,1);self.assertEqual(self.balances(),(D('8.70'),D('0')))
                delivered=await routes.order_proxies(oid,'test')
                self.assertEqual(len(delivered['proxies']),10);self.assertFalse(delivered['delivery_pending'])
                items.pop();partial=await routes.order_proxies(oid,'test')
                self.assertEqual(len(partial['proxies']),9);self.assertTrue(partial['delivery_pending'])
                with patch.object(routes,'require_telegram_id',return_value=self.uid+1):
                    with self.assertRaises(HTTPException) as error:await routes.order_proxies(oid,'test')
                    self.assertEqual(error.exception.status_code,404)
        asyncio.run(scenario())

    def test_supplier_timeout_blocks_second_checkout_and_unsupported_type(self):
        async def scenario():
            with patch.object(routes,'engine',self.db),patch.object(routes,'require_telegram_id',return_value=self.uid),patch.dict(os.environ,PROXY_IPV4_PURCHASES_ENABLED='true',PROXY_IPV4_MARKUP_PERCENT='30'),patch.object(routes,'quote',new_callable=AsyncMock,return_value={'customer_total_usd':'1.30'}),patch.object(routes,'provider',new_callable=AsyncMock,return_value={'amount':'1','balance':'100','currency':'USD'}),patch.object(routes,'provider_checkout',new_callable=AsyncMock,side_effect=TimeoutError) as checkout:
                for kind in ['ipv4','isp','mobile']:
                    body=routes.PrepareOrder(proxy_type=kind,country='GBR',days=30,count=10,request_id=uuid4())
                    order=await routes.prepare_order(body,'test')
                    with self.assertRaises(HTTPException):await routes.purchase_order(UUID(order['id']),'test')
                checkout.assert_not_called();self.assertEqual(self.balances(),(D('10'),D('0')))
                body=routes.PrepareOrder(proxy_type='ipv6',country='GBR',days=30,count=10,request_id=uuid4())
                order=await routes.prepare_order(body,'test');oid=UUID(order['id'])
                for _ in range(2):
                    with self.assertRaises(HTTPException):await routes.purchase_order(oid,'test')
                self.assertEqual(checkout.await_count,1);self.assertEqual(self.balances(),(D('8.70'),D('1.30')))
        asyncio.run(scenario())

    def test_restart_pending_supplier_lane_blocks_other_owner(self):
        async def scenario():
            # An unresolved different owner's order survives process/advisory-lock loss.
            other_uid=self.uid+1000000000001
            with self.db.begin() as c:
                c.execute(text("INSERT INTO tool_proxy_order_intents(id,telegram_id,request_id,proxy_type,selection,quoted_amount,status) VALUES(:id,:u,:r,'ipv6','{}',1.30,'uncertain')"),dict(id=uuid4(),u=other_uid,r=uuid4()))
            with patch.object(routes,'engine',self.db),patch.object(routes,'require_telegram_id',return_value=self.uid),patch.dict(os.environ,PROXY_IPV4_PURCHASES_ENABLED='true',PROXY_IPV4_MARKUP_PERCENT='30'),patch.object(routes,'quote',new_callable=AsyncMock,return_value={'customer_total_usd':'1.30'}),patch.object(routes,'provider',new_callable=AsyncMock,return_value={'amount':'1','balance':'100','currency':'USD'}),patch.object(routes,'provider_checkout',new_callable=AsyncMock) as checkout:
                order=await routes.prepare_order(routes.PrepareOrder(proxy_type='ipv6',country='GBR',days=30,count=10,request_id=uuid4()),'test')
                with self.assertRaises(HTTPException):await routes.purchase_order(UUID(order['id']),'test')
                checkout.assert_not_called();self.assertEqual(self.balances(),(D('10'),D('0')))
            with self.db.begin() as c:c.execute(text('DELETE FROM tool_proxy_order_intents WHERE telegram_id=:u'),dict(u=other_uid))
        asyncio.run(scenario())

    def test_concurrent_reservation_and_confirmation_once(self):
        with ThreadPoolExecutor(max_workers=4) as pool:list(pool.map(lambda _:w.reserve_order(self.uid,self.oid),range(4)))
        self.assertEqual(self.balances(),(D('8.70'),D('1.30')))
        w.mark_submitting(self.uid,self.oid,D('1'))
        receipt=str(uuid4())
        with ThreadPoolExecutor(max_workers=4) as pool:list(pool.map(lambda _:w.confirm_fulfilled(self.uid,self.oid,receipt),range(4)))
        self.assertEqual(self.balances(),(D('8.70'),D('0')))
        with self.db.connect() as c:self.assertEqual(c.execute(text("SELECT count(*) FROM tool_transactions WHERE external_payment_id=:r"),dict(r='proxy-ipv4:'+receipt)).scalar(),1)
    def test_insufficient_balance_and_foreign_owner(self):
        with self.assertRaises(HTTPException):w.reserve_order(self.uid,self.order('20'))
        with self.assertRaises(HTTPException):w.reserve_order(self.uid+1,self.oid)
        self.assertEqual(self.balances(),(D('10'),D('0')))
    def test_release_once_only_before_submission(self):
        w.reserve_order(self.uid,self.oid)
        w.release_reservation(self.uid,self.oid);w.release_reservation(self.uid,self.oid)
        self.assertEqual(self.balances(),(D('10'),D('0')))
        oid=self.order();w.reserve_order(self.uid,oid);w.mark_submitting(self.uid,oid,D('1'));w.mark_uncertain(self.uid,oid)
        with self.assertRaises(HTTPException):w.release_reservation(self.uid,oid)
        self.assertEqual(self.balances(),(D('8.70'),D('1.30')))
    def test_duplicate_financial_receipt_rolls_back_whole_settlement(self):
        w.reserve_order(self.uid,self.oid);w.mark_submitting(self.uid,self.oid,D('1'))
        receipt=str(uuid4())
        # Simulate an independently recorded receipt: do not silently skip it.
        with self.db.begin() as c:c.execute(text("INSERT INTO tool_transactions(telegram_id,kind,amount,currency,status,external_payment_id) VALUES(:u,'purchase',-1.30,'USD','success',:r)"),dict(u=self.uid,r='proxy-ipv4:'+receipt))
        before=self.balances()
        with self.assertRaises(IntegrityError):w.confirm_fulfilled(self.uid,self.oid,receipt)
        self.assertEqual(self.balances(),before)
        with self.db.connect() as c:self.assertEqual(c.execute(text('SELECT status FROM tool_proxy_order_intents WHERE id=:id'),dict(id=self.oid)).scalar(),'submitting')
    def test_unknown_blocks_new_request_and_preserves_balance(self):
        w.reserve_order(self.uid,self.oid);w.mark_submitting(self.uid,self.oid,D('1'));w.mark_uncertain(self.uid,self.oid)
        with self.assertRaises(HTTPException):w.reserve_order(self.uid,self.order())
        self.assertEqual(self.balances(),(D('8.70'),D('1.30')))
    def test_restart_unknown_can_settle_once_with_verified_receipt(self):
        w.reserve_order(self.uid,self.oid);w.mark_submitting(self.uid,self.oid,D('1'));w.mark_uncertain(self.uid,self.oid)
        receipt=str(uuid4());w.record_confirmed_supplier_order(self.uid,self.oid,receipt)
        w.confirm_fulfilled(self.uid,self.oid,receipt);w.confirm_fulfilled(self.uid,self.oid,receipt)
        self.assertEqual(self.balances(),(D('8.70'),D('0')))

class ProxyPurchaseGateTests(unittest.IsolatedAsyncioTestCase):
    async def test_disabled_gate_never_reads_db_or_calls_provider(self):
        with patch.dict(os.environ,PROXY_IPV4_PURCHASES_ENABLED='false'),patch.object(routes,'require_telegram_id',return_value=42),patch.object(routes,'provider_checkout',new_callable=AsyncMock) as supplier:
            with self.assertRaises(HTTPException) as error:await routes.purchase_order(uuid4(),'signed-test')
            self.assertEqual(error.exception.status_code,503);supplier.assert_not_called()

    async def test_quote_currency_price_and_official_mobile_tariffs(self):
        async def supplier(path,params):
            return {'get/days':{'days':[30]},'get/countries':{'countries':[{'alpha3code':'GBR'}]},
                    'get/tariffs':{'tariffs':[{'country':'GBR','mobileOperator':[{'name':'test','rotationTime':[5]}]}]},
                    'get/order/price':{'amount':'10.00','currency':'USD'}}[path]
        body=routes.Quote(proxy_type='mobile',country='GBR',days=30,count=1,mobile_operator='test',rotation_time=5)
        with patch.object(routes,'require_telegram_id',return_value=42),patch.object(routes,'provider',side_effect=supplier),patch.dict(os.environ,PROXY_IPV4_MARKUP_PERCENT='30'):
            self.assertEqual((await routes.quote(body,'signed-test'))['customer_total_usd'],'13.00')
        async def foreign(path,params):
            data=await supplier(path,params)
            if path=='get/order/price':data['currency']='EUR'
            return data
        with patch.object(routes,'require_telegram_id',return_value=42),patch.object(routes,'provider',side_effect=foreign):
            with self.assertRaises(HTTPException):await routes.quote(body,'signed-test')

    async def test_config_and_quotes_for_all_types(self):
        with patch.object(routes,'require_telegram_id',return_value=42),patch.dict(os.environ,PROXY_IPV4_PURCHASES_ENABLED='true'):
            self.assertEqual(routes.checkout_config('test')['supported_purchase_types'],['ipv6'])
        async def supplier(path,params):
            return {'get/days':{'days':[30]},'get/countries':{'countries':[{'alpha3code':'GBR'}]},'get/order/price':{'amount':'10','currency':'USD'}}[path]
        with patch.object(routes,'require_telegram_id',return_value=42),patch.object(routes,'provider',side_effect=supplier),patch.dict(os.environ,PROXY_IPV4_MARKUP_PERCENT='30'):
            for kind in ['ipv4','ipv6','isp']:
                self.assertEqual((await routes.quote(routes.Quote(proxy_type=kind,country='GBR',days=30,count=10),'test'))['customer_total_usd'],'13.00')


def _inventory_checkout_case(kind, scenario):
    """Give each type/scenario an independent unittest setup and disposable wallet."""
    def run(self):
        self.fixture_proxy_type=kind
        scenario(self)
    return run

# Exercise the same production checkout path for all types without opening its live gate.
for _kind in ('ipv4','isp'):
    for _scenario in (
        'historical_conflict_blocks_approval_after_restart',
        'other_process_lock_blocks_purchase',
        'manual_approval_persists_and_replay_is_readonly',
        'timeout_review_survives_network_error_and_restart',
        'persisted_lane_blocks_other_owner_after_restart',
        'success_replay_and_unverified_inventory_never_delivered',
        'delayed_partial_and_external_inventory',
        'price_change_and_insufficient_balances_no_paid_call',
        'provider_timeout_retains_reserve_and_blocks_replay',
    ):
        setattr(ProxyWalletTests, f'test_{_kind}_{_scenario}',
                _inventory_checkout_case(_kind, getattr(ProxyWalletTests, f'test_mobile_{_scenario}')))
