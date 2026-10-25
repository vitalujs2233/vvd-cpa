import asyncio
import json
import os
import unittest
from decimal import Decimal
from unittest.mock import patch
import httpx
from fastapi import FastAPI
from fastapi.testclient import TestClient
from noir_sms_catalog import Catalog, CatalogError, customer_price, normalize, public, router

class Prices(unittest.TestCase):
    def test_markup_rounding_and_rejections(self):
        for source,expected in [('0.50','0.65'),('1','1.30'),('2','2.60'),('5','6.50'),('10','13.00'),('0.15','0.20')]:
            self.assertEqual(customer_price(source)[1],Decimal(expected))
        for bad in ('0','-1','NaN','Infinity',None,True,0.5,'0.000001'):
            with self.assertRaises(CatalogError): customer_price(bad)
    def test_currency_and_missing_price(self):
        with self.assertRaisesRegex(CatalogError,'currency'):
            normalize('services',{'currency':'EUR','country':'us','services':[]},'us')
        data=normalize('services',{'currency':'USD','country':'us','services':[{'service':'example','name':'Example','stock':1}]},'us')
        self.assertIsNone(data['services'][0]['price']);self.assertFalse(data['services'][0]['available'])
        self.assertNotIn('cost',public(data)['services'][0])
    def test_auth_and_closed_purchase(self):
        app=FastAPI();app.include_router(router)
        with TestClient(app) as c:
            self.assertEqual(c.get('/tools-market/numbers/countries').status_code,401)
            with patch('noir_sms_catalog.require_telegram_id',return_value=99):
                self.assertEqual(c.post('/tools-market/numbers/orders').status_code,503)
                self.assertEqual(c.get('/tools-market/numbers/prices?country=../&service=a').status_code,422)

class Reads(unittest.IsolatedAsyncioTestCase):
    def setUp(self):
        self.env=patch.dict(os.environ,{'NOIR_SMS_API_KEY':'test-only'});self.env.start();self.addCleanup(self.env.stop)
    async def test_cache_single_flight_and_projection(self):
        calls=[]
        def handler(req):
            calls.append(req)
            self.assertEqual(req.method,'GET');self.assertEqual(req.headers['Authorization'],'Bearer test-only')
            self.assertNotIn('test-only',str(req.url))
            return httpx.Response(200,content=b'{"country":"us","currency":"USD","services":[{"service":"example","name":"Example","price":0.50,"stock":4}]}')
        c=Catalog(httpx.MockTransport(handler))
        results=await asyncio.gather(*(c.read('services','us') for _ in range(5)))
        self.assertEqual(len(calls),1);self.assertEqual(results[0]['services'][0]['price'],'0.65')
        self.assertNotIn('cost',public(results[0])['services'][0])
    async def test_missing_key(self):
        with patch.dict(os.environ,{'NOIR_SMS_API_KEY':''}):
            with self.assertRaisesRegex(CatalogError,'not_configured'):await Catalog().read('countries')
    async def test_http_errors_no_body_leaks(self):
        for status,code in [(401,'auth'),(403,'auth'),(429,'rate_limit'),(500,'unavailable'),(503,'unavailable'),(302,'unavailable')]:
            c=Catalog(httpx.MockTransport(lambda r:httpx.Response(status,text='secret-key-and-private-data')))
            with self.assertRaisesRegex(CatalogError,code) as cm:await c.read('countries')
            self.assertNotIn('secret',str(cm.exception))
    async def test_timeout(self):
        def handler(r):raise httpx.ReadTimeout('secret',request=r)
        with self.assertRaisesRegex(CatalogError,'timeout'):await Catalog(httpx.MockTransport(handler)).read('countries')
    async def test_empty_and_malformed(self):
        c=Catalog(httpx.MockTransport(lambda r:httpx.Response(200,json={'countries':[]})))
        self.assertEqual((await c.read('countries'))['countries'],[])
        for data in ({},[],{'countries':'wrong'},{'countries':[{'country':'../../'}]}):
            with self.assertRaises(CatalogError):await Catalog(httpx.MockTransport(lambda r:httpx.Response(200,json=data))).read('countries')
    async def test_price_refresh_and_no_mutation_paths(self):
        prices=iter(['1.00','2.00'])
        def handler(r):return httpx.Response(200,json={'country':'us','currency':'USD','services':[{'service':'a','name':'A','price':next(prices),'stock':1}]})
        c=Catalog(httpx.MockTransport(handler))
        self.assertEqual((await c.read('services','us'))['services'][0]['price'],'1.30')
        c.cache.clear()
        self.assertEqual((await c.read('services','us'))['services'][0]['price'],'2.60')
        with self.assertRaises(CatalogError):await c.read('numbers')
    async def test_empty_services_and_rate_cooldown(self):
        c=Catalog(httpx.MockTransport(lambda r:httpx.Response(200,json={'country':'us','currency':'USD','services':[]})))
        self.assertEqual((await c.read('services','us'))['services'],[])
        calls=[]
        def handler(r):calls.append(1);return httpx.Response(429,headers={'Retry-After':'90'})
        c=Catalog(httpx.MockTransport(handler))
        for _ in range(2):
            with self.assertRaises(CatalogError):await c.read('countries')
        self.assertEqual(len(calls),1)
