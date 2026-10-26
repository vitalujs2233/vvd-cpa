"""Run only against disposable PostgreSQL. Never uses a provider account."""
import os
import asyncio
from contextlib import contextmanager
from datetime import datetime, timezone
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
    def setUp(self):
        ledger_fixture.LedgerTests.setUp(self)
        self.patch=patch.object(w,'engine',self.db);self.patch.start();self.addCleanup(self.patch.stop)
        self.oid=self.order()
    def tearDown(self):
        with self.db.begin() as c:c.execute(text('DELETE FROM tool_proxy_order_intents WHERE telegram_id=:u'),dict(u=self.uid))
    balances=ledger_fixture.LedgerTests.balances
    def order(self,amount='1.30'):
        oid=uuid4()
        with self.db.begin() as c:c.execute(text("INSERT INTO tool_proxy_order_intents(id,telegram_id,request_id,proxy_type,selection,quoted_amount) VALUES(:id,:u,:r,'ipv6','{}',:a)"),dict(id=oid,u=self.uid,r=uuid4(),a=D(amount)))
        return oid
    @contextmanager
    def mobile_fixture(self, count=1):
        # TEST ONLY: no live key, no network; eligibility override is scoped to mocks.
        state={'paid':False,'calls':0,'cost':'26','balance':'100','visible':count,'failure':None}
        receipt='mock-mobile-'+str(uuid4())
        async def supplier(path,params):
            if path=='get/days':return {'days':[3]}
            if path=='get/countries':return {'countries':[{'alpha3code':'GBR','name':'England'}]}
            if path=='get/tariffs':return {'tariffs':[{'country':'GBR','mobileOperator':[{'name':'three_unitedkingdom','rotationTime':[0,5]}]}]}
            if path=='get/order/price':return {'amount':state['cost'],'currency':'USD','balance':state['balance']}
            if path=='get/proxies':
                items=[{'id':'old'}]
                if state['paid']:
                    items += [{'id':f'mobile-{i}','country':'GBR','dateStart':datetime.now(timezone.utc).isoformat(),'ip':f'192.0.2.{i+1}','httpsPort':'8080','authInfo':{'login':'test-only','password':'test-only'}} for i in range(state['visible'])]
                return {'proxies':items}
            raise AssertionError('Unexpected provider method')
        async def checkout(selection):
            payload=routes.provider_order_payload(selection)
            self.assertEqual(payload['mobileOperator'],'three_unitedkingdom');self.assertEqual(payload['rotationTime'],0)
            state['calls']+=1;state['paid']=True
            if state['failure']:raise state['failure']
            return {'success':True,'orderNumber':receipt,'currency':'USD','proxyType':'mobile'}
        with self.db.begin() as c:c.execute(text('UPDATE tool_wallets SET available=100 WHERE telegram_id=:u'),dict(u=self.uid))
        with patch.object(routes,'engine',self.db),patch.object(routes,'require_telegram_id',return_value=self.uid),patch.object(routes,'SUPPORTED_PURCHASE_TYPES',('ipv6','mobile')),patch.dict(os.environ,PROXY_IPV4_PURCHASES_ENABLED='true',PROXY_IPV4_MARKUP_PERCENT='30'),patch.object(routes,'provider',side_effect=supplier),patch.object(routes,'provider_checkout',side_effect=checkout):
            body=routes.PrepareOrder(proxy_type='mobile',country='GBR',days=3,count=count,mobile_operator='three_unitedkingdom',rotation_time=0,request_id=uuid4())
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
