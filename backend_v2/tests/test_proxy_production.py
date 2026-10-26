import asyncio
import json
import os
import unittest
from concurrent.futures import ThreadPoolExecutor
from decimal import Decimal as D
from uuid import UUID,uuid4
from unittest.mock import patch,AsyncMock
from fastapi import HTTPException
from sqlalchemy import text
from sqlalchemy.exc import IntegrityError
from backend_v2.tests import test_proxy_wallet_readiness as fixtures
import proxy_ipv4_preview as routes
import proxy_control as finance
import proxy_production as production
from proxy_fulfillment import sweep_once

ACCEPTED={'PROXY_IPV4_PURCHASES_ENABLED':'true','PROXY_IPV4_PRODUCTION_TYPES':'ipv4,isp,mobile',
          'PROXY_IPV4_EXCLUSIVE_ACCOUNT_CONFIRMED':'true','PROXY_IPV4_FINANCIAL_ACCEPTANCE_REF':'ci:financial-acceptance'}

class ProductionTests(unittest.TestCase):
    setUpClass=classmethod(fixtures.ProxyWalletTests.setUpClass.__func__)
    setUp=fixtures.ProxyWalletTests.setUp
    tearDown=fixtures.ProxyWalletTests.tearDown
    order=fixtures.ProxyWalletTests.order
    balances=fixtures.ProxyWalletTests.balances
    mobile_fixture=fixtures.ProxyWalletTests.mobile_fixture

    def scenario(self,fn):
        async def run():
            with self.mobile_fixture(count=2) as (state,body),patch.object(routes,'SUPPORTED_PURCHASE_TYPES',('ipv6',)),patch.dict(os.environ,ACCEPTED),patch.object(routes,'urlopen',side_effect=AssertionError('Real supplier forbidden')),patch.object(finance,'admin',return_value=999):
                oid=UUID((await routes.prepare_order(body,'test'))['id'])
                await fn(oid,state,body)
        asyncio.run(run())

    def decision(self,outcome,number=None):
        return finance.Resolution(decision_id=uuid4(),outcome=outcome,provider_order_id=number,
            confirmed_provider_amount=D('26'),supplier_final_confirmed=True,
            no_future_delivery_confirmed=True,evidence_ref='ci:supplier-final')

    def test_ordinary_submission_and_recovery_without_permit(self):
        async def check(oid,state,body):
            self.assertIn(body.proxy_type,routes.checkout_config('test')['supported_purchase_types'])
            state['visible']=0
            await routes.purchase_order(oid,'test')
            with self.db.connect() as c:
                self.assertEqual(c.execute(text('SELECT count(*) FROM tool_proxy_control_permits WHERE order_id=:id'),dict(id=oid)).scalar(),0)
                saved=c.execute(text('SELECT fulfillment_authority,proxy_ids_before FROM tool_proxy_order_intents WHERE id=:id'),dict(id=oid)).mappings().one()
                self.assertEqual(saved['fulfillment_authority']['mode'],'production');self.assertEqual(saved['proxy_ids_before'],['old'])
            with self.db.begin() as c:c.execute(text("UPDATE tool_proxy_order_intents SET supplier_submitted_at=now()-interval '90 seconds' WHERE id=:id"),dict(id=oid))
            # Stop NEW sales, discard connections, still deliver previously accepted goods.
            with patch.dict(os.environ,PROXY_IPV4_PRODUCTION_TYPES='',PROXY_IPV4_FINANCIAL_ACCEPTANCE_REF=''):
                self.db.dispose();await sweep_once()
                self.assertEqual((await routes.order_proxies(oid,'test'))['inventory_review']['state'],'waiting')
                state['visible']=1;await sweep_once();self.assertEqual((await routes.order_proxies(oid,'test'))['proxies'],[])
                state['visible']=2;await sweep_once();self.assertEqual(len((await routes.order_proxies(oid,'test'))['proxies']),2)
            await routes.purchase_order(oid,'test')
            self.assertEqual(state['calls'],1);self.assertEqual(self.balances(),(D('66.20'),D('0')))
        self.scenario(check)

    def test_missing_acceptance_or_exclusivity_never_reserves(self):
        async def check(oid,state,body):
            for key,value in [('PROXY_IPV4_PRODUCTION_TYPES',''),('PROXY_IPV4_EXCLUSIVE_ACCOUNT_CONFIRMED','false'),('PROXY_IPV4_FINANCIAL_ACCEPTANCE_REF',''),('PROXY_IPV4_PURCHASES_ENABLED','false')]:
                with patch.dict(os.environ,{key:value}):
                    with self.assertRaises(HTTPException):await routes.purchase_order(oid,'test')
            self.assertEqual(state['calls'],0);self.assertEqual(self.balances(),(D('100'),D('0')))
        self.scenario(check)

    def test_invalid_receipt_never_settles_and_rejection_restores_once(self):
        async def check(oid,state,body):
            with patch.object(routes,'provider_checkout',new_callable=AsyncMock,return_value={'success':True,'orderNumber':None}) as supplier:
                with self.assertRaises(HTTPException):await routes.purchase_order(oid,'test')
                self.db.dispose()
                with self.assertRaises(HTTPException):await routes.purchase_order(oid,'test')
                self.assertEqual(supplier.await_count,1)
            self.assertEqual(self.balances(),(D('66.20'),D('33.80')))
            decision=self.decision('rejected')
            finance.financial_resolution(oid,decision,'admin');finance.financial_resolution(oid,decision,'admin')
            self.assertEqual(self.balances(),(D('100'),D('0')))
        self.scenario(check)

    def test_lost_response_paid_reconciliation_and_refund_once(self):
        async def check(oid,state,body):
            state['failure']=TimeoutError()
            with self.assertRaises(HTTPException):await routes.purchase_order(oid,'test')
            state['failure']=None
            number='ci-confirmed-'+str(oid)
            paid=self.decision('paid',number)
            finance.financial_resolution(oid,paid,'admin');finance.financial_resolution(oid,paid,'admin')
            await sweep_once();self.assertEqual(len((await routes.order_proxies(oid,'test'))['proxies']),2)
            refund=self.decision('refunded',number)
            finance.financial_resolution(oid,refund,'admin');finance.financial_resolution(oid,refund,'admin')
            self.assertEqual(self.balances(),(D('100'),D('0')));self.assertEqual(state['calls'],1)
            with self.assertRaises(HTTPException):await routes.order_proxies(oid,'test')
        self.scenario(check)

    def test_process_loss_after_atomic_submission_never_retries(self):
        class ProcessLost(BaseException):pass
        async def check(oid,state,body):
            with patch.object(routes,'provider_checkout',side_effect=ProcessLost):
                with self.assertRaises(ProcessLost):await routes.purchase_order(oid,'test')
            self.db.dispose()
            with self.assertRaises(HTTPException):await routes.purchase_order(oid,'test')
            with self.db.begin() as c:c.execute(text("UPDATE tool_proxy_order_intents SET supplier_submitted_at=now()-interval '16 minutes' WHERE id=:id"),dict(id=oid))
            await sweep_once()
            with self.db.connect() as c:
                self.assertEqual(c.execute(text('SELECT status FROM tool_proxy_order_intents WHERE id=:id'),dict(id=oid)).scalar(),'uncertain')
                self.assertEqual(c.execute(text('SELECT state FROM tool_proxy_reviews WHERE order_id=:id'),dict(id=oid)).scalar(),'manual_review')
            self.assertEqual(self.balances(),(D('66.20'),D('33.80')));self.assertEqual(state['calls'],0)
        self.scenario(check)

    def test_saved_receipt_recovers_finance_once_after_restart(self):
        async def check(oid,state,body):
            with patch('proxy_ipv4_wallet.confirm_fulfilled',side_effect=RuntimeError('temporary accounting failure')):
                with self.assertRaises(HTTPException):await routes.purchase_order(oid,'test')
            self.assertEqual(self.balances(),(D('66.20'),D('33.80')))
            self.db.dispose();await sweep_once();await sweep_once()
            self.assertEqual(self.balances(),(D('66.20'),D('0')));self.assertEqual(state['calls'],1)
            self.assertEqual(len((await routes.order_proxies(oid,'test'))['proxies']),2)
            with self.db.connect() as c:
                self.assertEqual(c.execute(text("SELECT count(*) FROM tool_proxy_review_audit WHERE order_id=:id AND action='payment_recovered'"),dict(id=oid)).scalar(),1)
                self.assertEqual(c.execute(text("SELECT count(*) FROM tool_transactions WHERE telegram_id=:u AND kind='purchase'"),dict(u=self.uid)).scalar(),1)
        self.scenario(check)

    def test_failed_submission_transaction_never_debits_or_calls_supplier(self):
        async def check(oid,state,body):
            with patch.object(finance,'audit',side_effect=RuntimeError('transaction failed')):
                with self.assertRaises(RuntimeError):await routes.purchase_order(oid,'test')
            self.assertEqual(self.balances(),(D('100'),D('0')));self.assertEqual(state['calls'],0)
            with self.db.connect() as c:
                row=c.execute(text('SELECT status,fulfillment_authority,proxy_ids_before FROM tool_proxy_order_intents WHERE id=:id'),dict(id=oid)).one()
                self.assertEqual(row.status,'prepared');self.assertIsNone(row.fulfillment_authority);self.assertIsNone(row.proxy_ids_before)
        self.scenario(check)

    def test_timeout_blocks_next_order_even_after_late_goods(self):
        async def check(oid,state,body):
            state['visible']=1;await routes.purchase_order(oid,'test')
            with self.db.begin() as c:c.execute(text("UPDATE tool_proxy_order_intents SET supplier_submitted_at=now()-interval '16 minutes' WHERE id=:id"),dict(id=oid))
            await sweep_once();state['visible']=2;self.db.dispose();await sweep_once()
            self.assertEqual((await routes.order_proxies(oid,'test'))['proxies'],[])
            next_id=UUID((await routes.prepare_order(body.model_copy(update={'request_id':uuid4()}),'test'))['id'])
            with self.assertRaises(HTTPException):await routes.purchase_order(next_id,'test')
            self.assertEqual(state['calls'],1)
        self.scenario(check)

    def test_parallel_purchase_and_foreign_owner(self):
        async def check(oid,state,body):
            with patch.object(routes,'require_telegram_id',return_value=self.uid+1):
                with self.assertRaises(HTTPException):await routes.purchase_order(oid,'test')
            def buy():
                try:return asyncio.run(routes.purchase_order(oid,'test'))
                except HTTPException as e:return e.status_code
            with ThreadPoolExecutor(max_workers=2) as pool:list(pool.map(lambda _:buy(),range(2)))
            self.assertEqual(state['calls'],1);self.assertEqual(self.balances(),(D('66.20'),D('0')))
            with patch.object(routes,'require_telegram_id',return_value=self.uid+1):
                with self.assertRaises(HTTPException):await routes.order_proxies(oid,'test')
        self.scenario(check)

    def test_db_rejects_forged_incomplete_authority(self):
        async def check(oid,state,body):
            with self.assertRaises(IntegrityError),self.db.begin() as c:
                c.execute(text('UPDATE tool_proxy_order_intents SET fulfillment_authority=CAST(:v AS jsonb) WHERE id=:id'),dict(id=oid,v=json.dumps({'mode':'production'})))
            self.assertEqual(state['calls'],0)
        self.scenario(check)

for kind in ('ipv4','isp'):
    for name in tuple(n for n in vars(ProductionTests) if n.startswith('test_') and not n.startswith(('test_ipv4_','test_isp_'))):
        original=getattr(ProductionTests,name)
        def run(self,fn=original,k=kind):self.fixture_proxy_type=k;fn(self)
        setattr(ProductionTests,'test_'+kind+'_'+name[5:],run)

class ProductionPolicyTests(unittest.TestCase):
    def test_fail_closed_and_per_type(self):
        with patch.dict(os.environ,{},clear=True):self.assertEqual(production.enabled_types(),())
        with patch.dict(os.environ,ACCEPTED):
            self.assertEqual(production.enabled_types(),('ipv4','isp','mobile'))
            with patch.dict(os.environ,PROXY_IPV4_PRODUCTION_TYPES='ipv4'):
                self.assertEqual(production.enabled_types(),('ipv4',))
            with patch.dict(os.environ,PROXY_IPV4_PRODUCTION_TYPES='ipv4,unknown'):
                self.assertEqual(production.enabled_types(),())
