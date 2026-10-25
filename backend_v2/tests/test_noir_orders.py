"""Checkout tests use isolated PostgreSQL and mocked provider only."""
import asyncio
import os
import unittest
from decimal import Decimal as D
from pathlib import Path
from uuid import uuid4
from unittest.mock import AsyncMock,patch
from concurrent.futures import ThreadPoolExecutor
import httpx
from fastapi import Response,HTTPException
from sqlalchemy import text
import noir_sms_orders as n
from tools_order_ledger import Ledger
from backend_v2.tests import test_tools_order_ledger as fixture

class CheckoutTests(unittest.TestCase):
    @classmethod
    def setUpClass(cls):
        if os.getenv('TOOLS_LEDGER_TEST_DB')!='1':raise unittest.SkipTest('Disposable PostgreSQL required')
        cls.db=fixture.LedgerTests.db
        migration=next((Path(__file__).parents[1]/'migrations').glob('*_noir_orders.sql'))
        with cls.db.begin() as c:c.execute(text(migration.read_text()))
    def setUp(self):
        fixture.LedgerTests.setUp(self)
        self.body=n.Purchase(request_id=uuid4(),country='us',service='example',confirmed_price='1.30')
        self.result={'id':str(uuid4()),'country':'us','service':'example','currency':'USD','price':D('1'),'phone':'12025550147','status':'waiting','expires_at':'2030-01-01T00:00:00Z','sms':[]}
        self.mock=AsyncMock(return_value=self.result)
        self.stack=[patch.object(n,'engine',self.db),patch.object(n,'ledger',Ledger(self.db)),patch.dict(os.environ,NOIR_SMS_PURCHASES_ENABLED='1',NOIR_SMS_API_KEY='test-only'),patch.object(n.supplier,'request',self.mock),patch.object(n.catalog,'read',AsyncMock(return_value={'services':[{'code':'example','available':True,'price':'1.30','cost':D('1')}]}))]
        for p in self.stack:p.start()
        self.addCleanup(lambda:[p.stop() for p in reversed(self.stack)])
    def buy(self):return asyncio.run(n.purchase(self.body,Response(),self.uid))
    balances=fixture.LedgerTests.balances
    def test_success_replay_and_sms(self):
        first=self.buy();second=self.buy()
        self.assertEqual(first['id'],second['id']);self.assertEqual(first['phone'],'12025550147');self.assertEqual(self.mock.await_count,1)
        self.assertEqual(self.balances(),(D('8.70'),D('0')))
        self.result.update(status='received',sms=[{'code':'123456','text':'Test message','received_at':'2026-10-25T00:00:00Z'}])
        n.apply_delivery(self.uid,first['id'],self.result)
        self.assertEqual(n.view(n.read_order(self.uid,first['id']))['sms'][0]['code'],'123456')
    def test_timeout_keeps_reserve_no_second_request(self):
        self.mock.side_effect=n.ProviderFailure(False)
        first=self.buy();self.assertEqual(first['state'],'unknown');self.buy()
        self.assertEqual(self.mock.await_count,1);self.assertEqual(self.balances(),(D('8.70'),D('1.30')))
        self.body=self.body.model_copy(update={'request_id':uuid4()})
        with self.assertRaises(HTTPException):self.buy()
        self.assertEqual(self.mock.await_count,1)
    def test_confirmed_failure_releases(self):
        self.mock.side_effect=n.ProviderFailure(True)
        self.assertEqual(self.buy()['state'],'released');self.buy()
        self.assertEqual(self.balances(),(D('10'),D('0')));self.assertEqual(self.mock.await_count,1)
    def test_expiry_refund_concurrent_once(self):
        first=self.buy();self.result['status']='expired'
        with ThreadPoolExecutor(max_workers=4) as p:list(p.map(lambda _:n.apply_delivery(self.uid,first['id'],self.result),range(4)))
        self.assertEqual(self.balances(),(D('10'),D('0')))
        with self.db.connect() as c:self.assertEqual(c.execute(text("SELECT count(*) FROM tool_transactions WHERE order_id=:id AND kind='refund'"),dict(id=first['id'])).scalar(),1)
    def test_lower_actual_price_returns_difference(self):
        self.result['price']=D('.50')
        result=self.buy();self.assertEqual(result['amount'],'0.65');self.assertEqual(self.balances(),(D('9.35'),D('0')))
    def test_mismatch_keeps_reservation_and_no_foreign_delivery(self):
        self.result['country']='gb';result=self.buy()
        self.assertEqual(result['state'],'unknown');self.assertIsNone(result['phone']);self.assertEqual(self.balances(),(D('8.70'),D('1.30')))
        self.assertIsNone(n.read_order(self.uid+1,result['id']))
    def test_price_change_no_provider_call(self):
        self.body=self.body.model_copy(update={'confirmed_price':D('1.20')})
        with self.assertRaises(HTTPException):self.buy()
        self.assertEqual(self.mock.await_count,0);self.assertEqual(self.balances(),(D('10'),D('0')))
    def test_feature_gate(self):
        with patch.dict(os.environ,NOIR_SMS_PURCHASES_ENABLED='0'):
            with self.assertRaises(HTTPException):self.buy()
        self.assertEqual(self.mock.await_count,0)
    def test_concurrent_double_request(self):
        # A shared event loop mirrors the production async handler.
        async def race():return await asyncio.gather(n.purchase(self.body,Response(),self.uid),n.purchase(self.body,Response(),self.uid))
        results=asyncio.run(race());self.assertEqual(results[0]['id'],results[1]['id']);self.assertEqual(self.mock.await_count,1)
        self.assertEqual(self.balances(),(D('8.70'),D('0')))

class SupplierTests(unittest.IsolatedAsyncioTestCase):
    async def test_timeout_is_ambiguous_no_retry(self):
        calls=[]
        def handle(r):calls.append(r);raise httpx.ReadTimeout('test')
        with patch.dict(os.environ,NOIR_SMS_API_KEY='test-only'):
            with self.assertRaises(n.ProviderFailure) as err:await n.Supplier(httpx.MockTransport(handle)).request('POST','numbers','{}')
        self.assertFalse(err.exception.confirmed);self.assertEqual(len(calls),1)
    async def test_documented_rejection_and_unknown_gateway(self):
        for status,body,safe in [(402,{'error':{'code':'insufficient_balance'}},True),(503,{'error':{'code':'restocking'}},True),(502,{'message':'gateway'},False)]:
            with patch.dict(os.environ,NOIR_SMS_API_KEY='test-only'):
                with self.assertRaises(n.ProviderFailure) as err:await n.Supplier(httpx.MockTransport(lambda r:httpx.Response(status,json=body))).request('POST','numbers','{}')
            self.assertEqual(err.exception.confirmed,safe)
