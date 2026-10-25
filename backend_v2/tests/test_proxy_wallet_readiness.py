"""Run only against disposable PostgreSQL. Never uses a provider account."""
import os
import unittest
from uuid import uuid4
from decimal import Decimal as D
from concurrent.futures import ThreadPoolExecutor
from unittest.mock import patch, AsyncMock
from sqlalchemy import text
from sqlalchemy.exc import IntegrityError
from fastapi import HTTPException
import proxy_ipv4_wallet as w
import proxy_ipv4_preview as routes
from backend_v2.tests.test_tools_order_ledger import LedgerTests

class ProxyWalletTests(unittest.TestCase):
    @classmethod
    def setUpClass(cls):
        if os.getenv('TOOLS_LEDGER_TEST_DB')!='1':raise unittest.SkipTest('Disposable PostgreSQL required')
        LedgerTests.setUpClass();cls.db=LedgerTests.db
        with cls.db.begin() as c:
            c.execute(text('''CREATE TABLE IF NOT EXISTS tool_proxy_order_intents (
                id uuid PRIMARY KEY, telegram_id bigint NOT NULL, request_id uuid NOT NULL,
                proxy_type text NOT NULL, selection jsonb NOT NULL, quoted_amount numeric NOT NULL,
                provider_cost numeric, provider_order_id text UNIQUE, status text NOT NULL DEFAULT 'prepared',
                created_at timestamptz DEFAULT now(), updated_at timestamptz DEFAULT now(),
                UNIQUE(telegram_id,request_id))'''))
    def setUp(self):
        LedgerTests.setUp(self)
        self.patch=patch.object(w,'engine',self.db);self.patch.start();self.addCleanup(self.patch.stop)
        self.oid=self.order()
    balances=LedgerTests.balances
    def order(self,amount='1.30'):
        oid=uuid4()
        with self.db.begin() as c:c.execute(text("INSERT INTO tool_proxy_order_intents(id,telegram_id,request_id,proxy_type,selection,quoted_amount) VALUES(:id,:u,:r,'ipv6','{}',:a)"),dict(id=oid,u=self.uid,r=uuid4(),a=D(amount)))
        return oid
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
                    'get/mobile/tariffs':{'tariffs':[{'country':'GBR','mobileOperator':[{'name':'test','rotationTime':[5]}]}]},
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
