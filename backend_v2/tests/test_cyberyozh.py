"""No real CyberYozh calls. Run only against an isolated test PostgreSQL database."""
import os
import unittest
from pathlib import Path
from decimal import Decimal
from uuid import uuid4
from unittest.mock import patch
from concurrent.futures import ThreadPoolExecutor
import httpx
from fastapi import FastAPI
from fastapi.testclient import TestClient
from sqlalchemy import text
from database import engine
from cyberyozh.client import Client, ProviderError, retail, settings
from cyberyozh.numbers import Numbers
from cyberyozh.proxy import Proxy
from cyberyozh.mock import MockClient
from cyberyozh.orders import Orders, OrderError
from cyberyozh.purchase import quote, purchase_for_test_or_reviewed_worker
from cyberyozh.routes import router

RID='12345678-1234-4234-8234-123456789012'
ENV={'CYBERYOZH_API_KEY':'test-only', 'CYBERYOZH_READ_RETRIES':'0',
     'CYBERYOZH_MARKUP_NUMBERS_PERCENT':'20','CYBERYOZH_MARKUP_MOBILE_PERCENT':'30','CYBERYOZH_MARKUP_ISP_PERCENT':'10'}

class AdapterTests(unittest.TestCase):
    def setUp(self):
        self.env=patch.dict(os.environ,ENV);self.env.start();self.addCleanup(self.env.stop)

    def test_exact_decimal_markup(self):
        self.assertEqual(retail('0.35','numbers'),Decimal('.42'))
        with patch.dict(os.environ,{'CYBERYOZH_MARKUP_NUMBERS_PERCENT':'NaN'}):
            with self.assertRaises(ProviderError):retail('1','numbers')

    def test_live_markups_and_exact_provider_decimals(self):
        with patch.dict(os.environ, {'CYBERYOZH_MARKUP_NUMBERS_PERCENT':'35', 'CYBERYOZH_MARKUP_ISP_PERCENT':'30'}):
            self.assertEqual(retail('10','numbers'), Decimal('13.50'))
            self.assertEqual(retail('10','lte'), Decimal('13.00'))
            self.assertEqual(retail('10','residential_static'), Decimal('13.00'))
        value=Client(httpx.MockTransport(lambda r:httpx.Response(200,content=b'{"cost":0.123456789123456789}'))).request('GET','numbers/search/')
        self.assertEqual(value['cost'],Decimal('0.123456789123456789'))

    def test_retry_after_does_not_retry_early(self):
        calls=[]
        def handler(r):
            calls.append(r);return httpx.Response(429,headers={'Retry-After':'60'})
        with patch.dict(os.environ,{'CYBERYOZH_READ_RETRIES':'2'}),patch('cyberyozh.client.time.sleep') as sleep:
            with self.assertRaises(ProviderError):Client(httpx.MockTransport(handler)).request('GET','numbers/search/')
            self.assertEqual(len(calls),1);sleep.assert_not_called()

    def test_invalid_configuration_is_safe_http_error(self):
        app=FastAPI();app.include_router(router,prefix='/tools-market')
        with patch('cyberyozh.routes.require_telegram_id',return_value=123),patch.dict(os.environ,{'CYBERYOZH_MODE':'live','CYBERYOZH_API_BASE':'https://invalid.example/secret'}):
            with TestClient(app) as client:
                for path in ('numbers/catalog','proxy/catalog','numbers/search?provider=virtual&period=MIN_15&country=2&service=example'):
                    result=client.get('/tools-market/'+path)
                    self.assertEqual(result.status_code,503)
                    self.assertNotIn('secret',result.text)
                result=client.post('/tools-market/proxy/quote',json={'id':'example'})
                self.assertEqual(result.status_code,503)
                self.assertEqual(client.post('/tools-market/proxy/orders').status_code,503)

    def test_dev_only_mock_and_closed_live_gate(self):
        for app in ('production',''):
            with patch.dict(os.environ,{'CYBERYOZH_MODE':'mock','APP_ENV':app}):self.assertFalse(settings()['mock'])
        with patch.dict(os.environ,{'CYBERYOZH_MODE':'live'}):self.assertFalse(settings()['purchases_enabled'])

    def test_transport_key_header_and_no_mutation_retry(self):
        calls=[]
        def handler(r):
            calls.append(r)
            self.assertEqual(r.headers['X-Api-Key'],'test-only')
            raise httpx.ReadTimeout('contains secrets',request=r)
        c=Client(httpx.MockTransport(handler))
        with self.assertRaises(ProviderError) as cm:c.request('POST','numbers/',body={})
        self.assertEqual(len(calls),1);self.assertNotIn('secrets',str(cm.exception))
        self.assertFalse(cm.exception.definite_rejection)

    def test_transport_no_redirect_or_arbitrary_origin(self):
        c=Client(httpx.MockTransport(lambda r:httpx.Response(302,headers={'location':'https://example.com'})))
        with self.assertRaises(ProviderError):c.request('GET','numbers/')
        with self.assertRaises(ProviderError):c.request('GET','https://example.com')
        with patch.dict(os.environ,{'CYBERYOZH_API_BASE':'https://example.com'}):
            with self.assertRaises(ProviderError):Client()

    def test_read_retry_is_bounded(self):
        calls=[]
        def handler(r):
            calls.append(r);return httpx.Response(503)
        with patch.dict(os.environ,{'CYBERYOZH_READ_RETRIES':'1'}),patch('cyberyozh.client.time.sleep'):
            with self.assertRaises(ProviderError):Client(httpx.MockTransport(handler)).request('GET','numbers/')
        self.assertEqual(len(calls),2)

    def test_number_catalog_country_service_and_quote(self):
        a=Numbers(MockClient());catalog=a.catalog()
        self.assertEqual(catalog['countries'][0]['code'],'2')
        result=a.search('virtual','MIN_15','2','example')[0]
        self.assertEqual(result['price'],'1.20')
        self.assertEqual(a.search('virtual','MIN_15','99','example'),[])
        with self.assertRaises(ProviderError):a.search('virtual','DAY','2','example')
        _,qty,total,_=quote(a,'numbers',result)
        self.assertEqual((qty,total),(1,Decimal('1.20')))

    def test_number_unavailable_and_price_change(self):
        c=MockClient();original=c.rows
        def rows(path,params=None):
            data=original(path,params)
            if path=='numbers/search/':data[0]['is_active']=False
            return data
        c.rows=rows
        with self.assertRaises(ProviderError):quote(Numbers(c),'numbers',{'id':'1','provider':'virtual','period':'MIN_15','country':'2','service':'example'})

    def test_proxy_excludes_metered_rotating_shared_and_datacenter(self):
        c=MockClient();original=c.rows
        def rows(path,params=None):
            data=original(path,params)
            good=data[0]['proxy_products'][0]
            data[0]['proxy_products'] += [{**good,'traffic_limitation':1000},{**good,'proxy_category':'residential_rotating'},{**good,'proxy_category':'datacenter'}]
            data.append({'access_type':'shared','proxy_products':[good]})
            return data
        c.rows=rows
        offers=Proxy(c).catalog()
        self.assertEqual(len(offers),3)
        self.assertEqual({r['category'] for r in offers},{'lte','residential_static'})
        offer,qty,total,_=quote(Proxy(c),'proxy',{'id':offers[1]['id'],'period_months':3,'quantity':2})
        self.assertEqual(total,Decimal('17.60'))
        for qty in (0,4,True):
            with self.assertRaises(ProviderError):quote(Proxy(c),'proxy',{'id':offers[1]['id'],'period_months':3,'quantity':qty})

    def test_proxy_buy_contract_and_individual_ids(self):
        requests=[];ids=[RID,str(uuid4())]
        def handler(r):
            requests.append(r);return httpx.Response(201,json=[{'status':'in_progress','order_ids':ids}])
        a=Proxy(Client(httpx.MockTransport(handler)));offer=Proxy(MockClient()).catalog()[0]
        self.assertEqual(a.buy(offer,2),ids)
        import json
        body=json.loads(requests[0].content)
        self.assertFalse(body[0]['auto_renew']);self.assertEqual(body[0]['quantity'],2)
        self.assertEqual(requests[0].url.path,'/api/v1/proxies/shop/buy_proxies/')

    def test_supplier_rejection_is_definite(self):
        a=Proxy(Client(httpx.MockTransport(lambda r:httpx.Response(201,json=[{'status':'canceled','order_ids':[]}]))))
        with self.assertRaises(ProviderError) as cm:a.buy(Proxy(MockClient()).catalog()[0],1)
        self.assertTrue(cm.exception.definite_rejection)

    def test_sms_owner_projection_and_cancel_capability(self):
        stranger=str(uuid4());calls=[]
        def handler(r):
            calls.append(r.url.path)
            if r.method=='PUT':return httpx.Response(200,json={'detail':'Cancel processed'})
            return httpx.Response(200,json=[{'id':RID,'phone_number':'+1000','history_sms_code':['12345'],'can_cancel':True,'status':'waiting','price_usd':'secret-cost'}, {'id':stranger,'phone_number':'+9999','history_sms_code':['PRIVATE']}])
        a=Numbers(Client(httpx.MockTransport(handler)))
        details=a.details([RID]);self.assertEqual(len(details),1)
        self.assertEqual(details[0]['history_sms_code'],['12345']);self.assertNotIn('price_usd',details[0])
        a.cancel(RID);self.assertIn('/api/v1/numbers/'+RID+'/cancel/',calls)

    def test_extension_uses_documented_options(self):
        def handler(r):
            if r.url.path.endswith('extend-options/'):return httpx.Response(200,json={'options':[{'period':'DAY','label':'1 day','price':'.21'}]})
            if r.method=='PUT':return httpx.Response(200,json={'detail':'Extend processed'})
            return httpx.Response(200,json=[{'id':RID,'can_extend':True}])
        a=Numbers(Client(httpx.MockTransport(handler)))
        self.assertEqual(a.extension_options(RID)[0]['price'],'0.25')
        a.extend(RID,'DAY')
        with self.assertRaises(ProviderError):a.extend(RID,'MONTH')

    def test_proxy_secrets_only_for_local_ids(self):
        other=str(uuid4())
        def handler(r):return httpx.Response(200,json={'results':[{'id':RID,'connection_login':'mine','connection_password':'mine-secret'}, {'id':other,'connection_password':'foreign-secret'}],'next':None})
        found=Proxy(Client(httpx.MockTransport(handler))).details([RID])
        self.assertEqual(len(found),1);self.assertNotIn('foreign-secret',str(found))


class LedgerTests(unittest.TestCase):
    @classmethod
    def setUpClass(cls):
        if not any(s in str(engine.url.database) for s in ('isolated','test')):
            raise RuntimeError('Refusing a non-test database')
        with engine.begin() as c:
            c.execute(text('CREATE TABLE IF NOT EXISTS users(telegram_id BIGINT PRIMARY KEY,first_name TEXT NOT NULL)'))
            # RLS roles also exist in production; create only in isolated tests.
            for role in ('anon','authenticated'):
                c.execute(text("DO $$ BEGIN IF NOT EXISTS(SELECT 1 FROM pg_roles WHERE rolname='"+role+"') THEN CREATE ROLE "+role+"; END IF; END $$"))
            base=Path(__file__).resolve().parents[1]/'migrations'
            c.execute(text((base/'20261016_tools_marketplace.sql').read_text()))
            c.execute(text('ALTER TABLE tool_wallets ADD COLUMN IF NOT EXISTS refund_debt NUMERIC(14,2) NOT NULL DEFAULT 0'))
            c.execute(text((base/'20261024114427_cyberyozh_order_preparation.sql').read_text()))

    def setUp(self):
        self.uid=int(uuid4().int%1000000000)+900000000000
        self.orders=Orders(engine);self.request=str(uuid4())
        with engine.begin() as c:
            c.execute(text("INSERT INTO users VALUES(:u,'Cyber test')"),{'u':self.uid})
            c.execute(text('INSERT INTO tool_wallets(telegram_id,available) VALUES(:u,10)'),{'u':self.uid})

    def balance(self):
        with engine.connect() as c:return tuple(c.execute(text('SELECT available,reserved,refund_debt FROM tool_wallets WHERE telegram_id=:u'),{'u':self.uid}).one())
    def reserve(self,request=None):return self.orders.reserve(self.uid,request or self.request,'numbers',{'title':'Test'},'1','2','2')[0]

    def test_duplicate_and_capture_exactly_once(self):
        oid=self.reserve();self.assertEqual(self.reserve(),oid);calls=[]
        def buy():calls.append(1);return [str(uuid4())]
        self.orders.dispatch(self.uid,oid,buy);self.orders.dispatch(self.uid,oid,buy)
        self.assertEqual(len(calls),1);self.assertEqual(self.balance()[:2],(Decimal('8'),Decimal('2')))
        self.orders.settle(self.uid,oid,'issued');self.orders.settle(self.uid,oid,'issued')
        self.assertEqual(self.balance()[:2],(Decimal('8'),Decimal('0')))
        with engine.connect() as c:self.assertEqual(c.execute(text('SELECT count(*) FROM tool_transactions WHERE order_id=:id'),{'id':oid}).scalar(),1)

    def test_insufficient_balance_and_price_change(self):
        for amount,expected,error in [('11','11','insufficient_balance'),('2','3','price_changed')]:
            with self.assertRaisesRegex(OrderError,error):self.orders.reserve(self.uid,self.request,'numbers',{},'1',amount,expected)
        self.assertEqual(self.balance()[:2],(Decimal('10'),Decimal('0')))

    def test_timeout_and_restart_keep_reserve_without_retry(self):
        oid=self.reserve()
        def timeout():raise ProviderError('provider_timeout')
        self.orders.dispatch(self.uid,oid,timeout)
        restarted=Orders(engine)
        restarted.dispatch(self.uid,oid,lambda:self.fail('retried purchase'))
        self.assertEqual(restarted.owned(self.uid,oid)['state'],'unknown')
        self.assertEqual(self.balance()[:2],(Decimal('8'),Decimal('2')))

    def test_crash_after_claim_has_no_retry(self):
        oid=self.reserve()
        with engine.begin() as c:c.execute(text("UPDATE tool_cyberyozh_orders SET state='dispatched' WHERE order_id=:id"),{'id':oid})
        self.orders.dispatch(self.uid,oid,lambda:self.fail('retry after crash'))
        self.assertEqual(self.balance()[:2],(Decimal('8'),Decimal('2')))

    def test_definite_rejection_releases_once_and_honors_debt(self):
        oid=self.reserve()
        with engine.begin() as c:c.execute(text('UPDATE tool_wallets SET refund_debt=1 WHERE telegram_id=:u'),{'u':self.uid})
        def reject():raise ProviderError('purchase_rejected',True)
        self.orders.dispatch(self.uid,oid,reject);self.orders.settle(self.uid,oid,'rejected')
        self.assertEqual(self.balance(),(Decimal('9'),Decimal('0'),Decimal('0')))

    def test_confirmed_refund_once(self):
        oid=self.reserve();self.orders.dispatch(self.uid,oid,lambda:[str(uuid4())]);self.orders.settle(self.uid,oid,'issued')
        self.orders.settle(self.uid,oid,'refunded');self.orders.settle(self.uid,oid,'refunded')
        self.assertEqual(self.balance()[:2],(Decimal('10'),Decimal('0')))

    def test_ownership_and_request_conflict(self):
        oid=self.reserve()
        with self.assertRaises(OrderError):self.orders.owned(self.uid+1,oid)
        with self.assertRaises(OrderError):self.orders.owned(self.uid,oid,'proxy')
        with self.assertRaisesRegex(OrderError,'request_conflict'):self.orders.reserve(self.uid,self.request,'numbers',{'title':'Other'},'1','2','2')

    def test_reconcile_waits_for_real_issuance(self):
        oid=self.reserve();rid=str(uuid4());self.orders.dispatch(self.uid,oid,lambda:[rid])
        class Fake:
            def details(self,ids):return [{'id':rid,'status':'waiting','phone_number':'+123'}]
        self.orders.reconcile(self.uid,oid,Fake());self.orders.reconcile(self.uid,oid,Fake())
        self.assertEqual(self.balance()[:2],(Decimal('8'),Decimal('0')))

    def test_routes_off_and_no_foreign_details(self):
        app=FastAPI();app.include_router(router,prefix='/tools-market');client=TestClient(app)
        with patch('cyberyozh.routes.require_telegram_id',return_value=self.uid),patch.dict(os.environ,{'CYBERYOZH_MODE':'preparation'}):
            r=client.get('/tools-market/numbers/catalog');self.assertEqual(r.status_code,200)
            self.assertEqual(r.json()['offers'],[]);self.assertFalse(r.json()['purchases_enabled'])
            self.assertEqual(client.post('/tools-market/proxy/orders',json={}).status_code,503)
            oid=self.reserve()
        with patch('cyberyozh.routes.require_telegram_id',return_value=self.uid+1),patch('cyberyozh.routes.adapter') as a:
            self.assertEqual(client.get('/tools-market/numbers/orders/'+oid).status_code,404);a.assert_not_called()
        with patch('cyberyozh.routes.require_telegram_id',return_value=self.uid):
            r=client.get('/tools-market/numbers/orders');self.assertEqual(r.headers['cache-control'],'private, no-store')
            self.assertNotIn('wholesale',r.text)

    def test_full_mock_purchase_sms_and_repeat(self):
        class Fake(Numbers):
            def buy(self,offer):return [RID]
            def details(self,ids):return [{'id':RID,'phone_number':'+1000','status':'success','history_sms_code':['12345']}]
        with patch.dict(os.environ,ENV):
            a=Fake(MockClient())
            selection={'id':'1','provider':'virtual','period':'MIN_15','country':'2','service':'example'}
            result=purchase_for_test_or_reviewed_worker(engine,self.uid,self.request,'numbers',selection,'1.20',a)
            self.assertEqual(result['state'],'issued')
            again=purchase_for_test_or_reviewed_worker(engine,self.uid,self.request,'numbers',selection,'1.20',a)
            self.assertEqual(result['order_id'],again['order_id'])
            self.assertEqual(self.balance()[:2],(Decimal('8.80'),Decimal('0')))
            self.assertNotIn('cost',result['selection'])

    def test_transaction_rolls_back_on_failure(self):
        with engine.begin() as c:
            c.execute(text("CREATE OR REPLACE FUNCTION fail_cyber_test_tx() RETURNS trigger LANGUAGE plpgsql AS $$ BEGIN RAISE EXCEPTION 'test failure'; END $$"))
            c.execute(text('CREATE TRIGGER cyber_test_failure BEFORE INSERT ON tool_transactions FOR EACH ROW EXECUTE FUNCTION fail_cyber_test_tx()'))
        try:
            with self.assertRaises(Exception):self.reserve()
            self.assertEqual(self.balance()[:2],(Decimal('10'),Decimal('0')))
            with engine.connect() as c:self.assertEqual(c.execute(text('SELECT count(*) FROM tool_cyberyozh_orders WHERE telegram_id=:u'),{'u':self.uid}).scalar(),0)
        finally:
            with engine.begin() as c:c.execute(text('DROP TRIGGER cyber_test_failure ON tool_transactions'))

    @unittest.skipIf(os.getenv('PGLITE_TEST')=='1','Requires independent PostgreSQL sessions; covered in CI')
    def test_concurrent_duplicate_and_overspending(self):
        with ThreadPoolExecutor(max_workers=5) as pool:ids=list(pool.map(lambda _:self.reserve(),range(5)))
        self.assertEqual(len(set(ids)),1)
        def other(_):
            try:return self.reserve(str(uuid4()))
            except OrderError:return None
        with ThreadPoolExecutor(max_workers=10) as pool:results=list(pool.map(other,range(10)))
        self.assertEqual(sum(r is not None for r in results),4)
        self.assertEqual(self.balance()[:2],(Decimal('0'),Decimal('10')))

if __name__=='__main__':unittest.main()
