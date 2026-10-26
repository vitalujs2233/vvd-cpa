import asyncio
import json
import os
import unittest
from pathlib import Path
from datetime import datetime,timezone,timedelta
from uuid import UUID,uuid4
from decimal import Decimal as D
from unittest.mock import patch,AsyncMock
from sqlalchemy import text
from fastapi import HTTPException
from pydantic import ValidationError
from backend_v2.tests import test_proxy_wallet_readiness as fixtures
import proxy_ipv4_preview as routes
import proxy_control as control
import proxy_review_admin as admin
from proxy_fulfillment import sweep_once

class ControlledTests(unittest.TestCase):
    setUpClass=classmethod(fixtures.ProxyWalletTests.setUpClass.__func__)
    setUp=fixtures.ProxyWalletTests.setUp
    tearDown=fixtures.ProxyWalletTests.tearDown
    order=fixtures.ProxyWalletTests.order
    balances=fixtures.ProxyWalletTests.balances
    mobile_fixture=fixtures.ProxyWalletTests.mobile_fixture

    def grant(self,oid,**kw):
        values=dict(permit_id=uuid4(),max_amount_usd=D('33.80'),expires_at=datetime.now(timezone.utc)+timedelta(minutes=30),exclusive_account_confirmed=True,evidence_ref='mock:owner-authorized')
        values.update(kw);body=control.Permit(**values)
        control.grant_permit(oid,body,'admin')
        return body

    def resolution(self,outcome,**kw):
        fields=dict(decision_id=uuid4(),outcome=outcome,confirmed_provider_amount=D('26'),supplier_final_confirmed=True,no_future_delivery_confirmed=True,evidence_ref='mock:supplier-final')
        fields.update(kw);return control.Resolution(**fields)

    def scenario(self,fn):
        async def run():
            with self.mobile_fixture(count=2) as (state,body),patch.object(admin,'admin',return_value=999),patch.object(control,'admin',return_value=999),patch.object(routes,'SUPPORTED_PURCHASE_TYPES',('ipv6',)),patch.dict(os.environ,PROXY_IPV4_PURCHASES_ENABLED='false'),patch.object(routes,'urlopen',side_effect=AssertionError('Live supplier network forbidden')):
                oid=UUID((await routes.prepare_order(body,'test'))['id'])
                await fn(oid,state,body)
        asyncio.run(run())

    def test_permit_auto_delivery(self):
        async def check(oid,state,body):
            permit=self.grant(oid)
            self.assertTrue(control.grant_permit(oid,permit,'admin')['replayed'])
            self.assertEqual(routes.proxy_orders('test')['orders'][0]['control_id'],str(permit.permit_id))
            await routes.purchase_order(oid,'test',permit.permit_id)
            state['visible']=0
            with self.db.begin() as c:c.execute(text("UPDATE tool_proxy_order_intents SET supplier_submitted_at=now()-interval '90 seconds' WHERE id=:id"),dict(id=oid))
            await sweep_once()
            self.assertEqual((await routes.order_proxies(oid,'test'))['inventory_review']['state'],'waiting')
            state['visible']=1;await sweep_once()
            self.assertEqual((await routes.order_proxies(oid,'test'))['proxies'],[])
            self.db.dispose();state['visible']=2
            await sweep_once()  # Auto assignment without an approve request.
            delivery=await routes.order_proxies(oid,'test')
            self.assertEqual(len(delivery['proxies']),2)
            await routes.purchase_order(oid,'test',permit.permit_id)
            self.assertEqual(state['calls'],1);self.assertEqual(self.balances(),(D('66.20'),D('0')))
            with self.db.connect() as c:
                self.assertEqual(c.execute(text("SELECT count(*) FROM tool_transactions WHERE telegram_id=:u AND kind='purchase'"),dict(u=self.uid)).scalar(),1)
            if os.getenv('PROXY_CONTROL_EXPORT')=='1':
                path=Path('tests/proxy-controlled-results.json')
                data=json.loads(path.read_text()) if path.exists() else {'mock_only':True,'scenarios':[]}
                orders=routes.proxy_orders('test');orders['orders']=[x for x in orders['orders'] if x['id']==str(oid)]
                data['scenarios'].append({'kind':body.proxy_type,'phase':'approved','orders':orders,'delivery':delivery,'supplier_calls':state['calls'],'balances':[str(v) for v in self.balances()]})
                path.write_text(json.dumps(data,indent=2))
        self.scenario(check)

    def test_expired_revoked_wrong_id_and_cap(self):
        async def check(oid,state,body):
            with self.assertRaises(HTTPException):self.grant(oid,max_amount_usd=D('33.79'))
            p=self.grant(oid)
            with self.assertRaises(HTTPException):await routes.purchase_order(oid,'test',uuid4())
            with self.db.begin() as c:c.execute(text("UPDATE tool_proxy_control_permits SET expires_at=now()-interval '1 second' WHERE order_id=:id"),dict(id=oid))
            with self.assertRaises(HTTPException):await routes.purchase_order(oid,'test',p.permit_id)
            with self.db.begin() as c:c.execute(text("UPDATE tool_proxy_control_permits SET expires_at=now()+interval '1 hour' WHERE order_id=:id"),dict(id=oid))
            control.revoke_permit(oid,'admin')
            with self.assertRaises(HTTPException):await routes.purchase_order(oid,'test',p.permit_id)
            self.assertEqual(state['calls'],0);self.assertEqual(self.balances(),(D('100'),D('0')))
        self.scenario(check)

    def test_timeout_retains_lane_until_manual_approval(self):
        async def check(oid,state,body):
            p=self.grant(oid);await routes.purchase_order(oid,'test',p.permit_id)
            state['visible']=1
            with self.db.begin() as c:c.execute(text("UPDATE tool_proxy_order_intents SET supplier_submitted_at=now()-interval '16 minutes' WHERE id=:id"),dict(id=oid))
            await sweep_once();self.db.dispose();state['visible']=2;await sweep_once()
            self.assertEqual((await routes.order_proxies(oid,'test'))['proxies'],[])
            otherbody=body.model_copy(update={'request_id':uuid4()})
            other=UUID((await routes.prepare_order(otherbody,'test'))['id']);otherp=self.grant(other)
            with self.assertRaises(HTTPException):await routes.purchase_order(other,'test',otherp.permit_id)
            report=await admin.inspect_order(oid,'admin')
            await admin.approve_order(oid,admin.Approval(evidence_ref='mock:late-delivery',exclusive_account_confirmed=True,candidate_ids=report['review']['candidate_ids']),'admin')
            self.assertEqual(len((await routes.order_proxies(oid,'test'))['proxies']),2)
            self.assertEqual(state['calls'],1)
        self.scenario(check)

    def test_uncertain_reject_once_and_conflicting_replay(self):
        async def check(oid,state,body):
            p=self.grant(oid);state['failure']=TimeoutError()
            for _ in range(2):
                with self.assertRaises(HTTPException):await routes.purchase_order(oid,'test',p.permit_id)
            self.assertEqual(self.balances(),(D('66.20'),D('33.80')))
            with self.db.begin() as c:c.execute(text("UPDATE tool_proxy_order_intents SET supplier_submitted_at=now()-interval '16 minutes' WHERE id=:id"),dict(id=oid))
            await sweep_once();self.assertEqual(self.balances(),(D('66.20'),D('33.80')))
            bad=self.resolution('rejected',confirmed_provider_amount=D('25'))
            with self.assertRaises(HTTPException):control.financial_resolution(oid,bad,'admin')
            r=self.resolution('rejected');control.financial_resolution(oid,r,'admin')
            self.assertTrue(control.financial_resolution(oid,r,'admin')['replayed'])
            with self.assertRaises(HTTPException):control.financial_resolution(oid,r.model_copy(update={'evidence_ref':'mock:changed'}),'admin')
            self.assertEqual(self.balances(),(D('100'),D('0')));self.assertEqual(state['calls'],1)
            with self.assertRaises(HTTPException):await routes.purchase_order(oid,'test',p.permit_id)
        self.scenario(check)

    def test_uncertain_paid_then_refund_once(self):
        async def check(oid,state,body):
            p=self.grant(oid);state['failure']=TimeoutError()
            with self.assertRaises(HTTPException):await routes.purchase_order(oid,'test',p.permit_id)
            number='mock-recovered-'+str(uuid4())
            paid=self.resolution('paid',provider_order_id=number)
            control.financial_resolution(oid,paid,'admin');control.financial_resolution(oid,paid,'admin')
            self.assertEqual(self.balances(),(D('66.20'),D('0')))
            refund=self.resolution('refunded',provider_order_id=number)
            control.financial_resolution(oid,refund,'admin');control.financial_resolution(oid,refund,'admin')
            self.assertEqual(self.balances(),(D('100'),D('0')))
            with self.db.connect() as c:
                self.assertEqual(c.execute(text("SELECT count(*) FROM tool_transactions WHERE telegram_id=:u AND kind='refund'"),dict(u=self.uid)).scalar(),1)
            with self.assertRaises(HTTPException):await routes.order_proxies(oid,'test')
        self.scenario(check)

    def test_foreign_owner_and_single_uuid_scope(self):
        async def check(oid,state,body):
            p=self.grant(oid)
            with patch.object(routes,'require_telegram_id',return_value=self.uid+1):
                with self.assertRaises(HTTPException):await routes.purchase_order(oid,'test',p.permit_id)
            other=UUID((await routes.prepare_order(body.model_copy(update={'request_id':uuid4()}),'test'))['id'])
            with self.assertRaises(HTTPException):await routes.purchase_order(other,'test',p.permit_id)
            self.assertEqual(state['calls'],0)
        self.scenario(check)

    def test_crash_after_consumption_never_resubmits(self):
        class ProcessLost(BaseException):pass
        async def check(oid,state,body):
            permit=self.grant(oid)
            with patch.object(routes,'provider_checkout',side_effect=ProcessLost):
                with self.assertRaises(ProcessLost):await routes.purchase_order(oid,'test',permit.permit_id)
            self.db.dispose()
            with self.assertRaises(HTTPException):await routes.purchase_order(oid,'test',permit.permit_id)
            self.assertEqual(state['calls'],0)
            self.assertEqual(self.balances(),(D('66.20'),D('33.80')))
            with self.db.begin() as c:c.execute(text("UPDATE tool_proxy_order_intents SET supplier_submitted_at=now()-interval '16 minutes' WHERE id=:id"),dict(id=oid))
            await sweep_once()
            with self.db.connect() as c:
                self.assertEqual(c.execute(text('SELECT status FROM tool_proxy_order_intents WHERE id=:id'),dict(id=oid)).scalar(),'uncertain')
        self.scenario(check)

    def test_concurrent_control_and_reconciliation(self):
        from concurrent.futures import ThreadPoolExecutor
        async def check(oid,state,body):
            permit=self.grant(oid)
            def buy():
                try:return asyncio.run(routes.purchase_order(oid,'test',permit.permit_id))
                except HTTPException as exc:return exc.status_code
            with ThreadPoolExecutor(max_workers=2) as pool:list(pool.map(lambda _:buy(),range(2)))
            self.assertEqual(state['calls'],1)
            number=routes.order_status(oid,'test')['provider_order_id']
            resolution=self.resolution('refunded',provider_order_id=number)
            def refund():
                try:return control.financial_resolution(oid,resolution,'admin')
                except HTTPException as exc:return exc.status_code
            with ThreadPoolExecutor(max_workers=2) as pool:list(pool.map(lambda _:refund(),range(2)))
            control.financial_resolution(oid,resolution,'admin')
            self.assertEqual(self.balances(),(D('100'),D('0')))
        self.scenario(check)

# Independent fixture per product; no live gate override in these tests.
base_cases=tuple(n for n in vars(ControlledTests) if n.startswith('test_'))
for kind in ('ipv4','isp'):
    for name in base_cases:
        original=getattr(ControlledTests,name)
        def run(self,fn=original,k=kind):
            self.fixture_proxy_type=k;fn(self)
        setattr(ControlledTests,'test_'+kind+'_'+name[5:],run)

class ControlAuthTests(unittest.TestCase):
    def test_mutations_authorize_before_db(self):
        with patch.object(control,'admin',side_effect=HTTPException(403,'Denied')):
            with self.assertRaises(HTTPException):control.grant_permit(uuid4(),None,'bad')
            with self.assertRaises(HTTPException):control.financial_resolution(uuid4(),None,'bad')
            with self.assertRaises(HTTPException):control.revoke_permit(uuid4(),'bad')
