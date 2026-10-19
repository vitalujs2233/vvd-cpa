"""Disposable PostgreSQL only. All Telegram sends are mocked; no network payments."""
import uuid
import unittest
from datetime import datetime, timedelta, timezone
from decimal import Decimal
from unittest.mock import AsyncMock, patch
from fastapi.testclient import TestClient
from sqlalchemy import text
import test_stage5_real_withdrawals as fixture
from cpa_real_withdrawals import create_real_withdrawal, mark_real_rejected
from cpa_finance import post_approved_hold
from cpa_manual_hold import manual_release, read_partner_hold
from cpa_analytics import summarize, arguments, daily
from main import app

engine = fixture.engine
ADMIN = fixture.ADMIN
CODE = fixture.USER_CODE

class ManualWorkflowTests(unittest.TestCase):
    @classmethod
    def setUpClass(cls):
        fixture.Stage5RealWithdrawalsTests.setUpClass()
        fixture.Stage5RealWithdrawalsTests().test_02_cutover_immutable_and_no_old_finance()
        with engine.begin() as c:
            c.execute(text("ALTER TABLE public.users ADD COLUMN status TEXT DEFAULT 'active'"))
            for column in ("created_at TIMESTAMPTZ DEFAULT now()", "offer_id TEXT", "network_id BIGINT", "vertical TEXT", "country_code TEXT", "country_name TEXT"):
                c.execute(text("ALTER TABLE public.clicks ADD COLUMN " + column))
            for column in ("network_id BIGINT", "vertical_slug TEXT"):
                c.execute(text("ALTER TABLE public.conversions ADD COLUMN " + column))

    def credit(self, gross):
        cid = uuid.uuid4()
        click = str(uuid.uuid4())
        now = datetime.now(timezone.utc)
        with engine.begin() as c:
            c.execute(text("INSERT INTO clicks(user_id,partner_code,click_id) VALUES(:uid,:code,:click)"),
                      {"uid":ADMIN,"code":CODE,"click":click})
            c.execute(text("""INSERT INTO conversions(id,click_id,user_id,offer_id,payout_gross,payout_net,
                status,currency,is_test,finance_eligible_at,finance_approved_at)
                VALUES(:cid,:click,:uid,'synthetic',:gross,0,'approved','USD',FALSE,:now,:now)"""),
                      {"cid":cid,"click":click,"uid":ADMIN,"gross":gross,"now":now})
            result = post_approved_hold(c,cid)
            self.assertFalse(post_approved_hold(c,cid)["credited"])
        return cid, result

    def release(self, cid, amount, key=None):
        return manual_release(engine,partner_code=CODE,conversion_id=str(cid),amount=amount,
             reason='Administrator test release',request_id=str(key or uuid.uuid4()),admin_uid=ADMIN)

    def test_manual_lifecycle_without_network_receipts(self):
        cid, amounts = self.credit('1.00')
        self.assertEqual((amounts['net'],amounts['fee']),(Decimal('.80'),Decimal('.20')))
        held = read_partner_hold(engine,CODE)
        self.assertEqual(held['cpa_hold'],'0.80')
        self.assertEqual(held['real_withdrawable'],'0.00')
        self.assertEqual(held['credits'][0]['early_releasable'],'0.80')
        self.assertFalse(held['credits'][0]['network_verified'])
        key=uuid.uuid4()
        self.assertFalse(self.release(cid,'.30',key)['duplicate'])
        self.assertTrue(self.release(cid,'.30',key)['duplicate'])
        self.release(cid,'.50')
        cid2,_ = self.credit('100.00')
        self.release(cid2,'80.00')
        with engine.connect() as c:
            self.assertEqual(c.execute(text('SELECT count(*) FROM cpa_network_receipts')).scalar_one(),0)
            report=summarize(c,ADMIN,arguments('all',None,None,None,None,None),admin=True)
            self.assertEqual(report['earned'],80.80)
            self.assertEqual(report['finance']['fee'],20.20)
            self.assertEqual(report['on_hold'],0)
            self.assertEqual(sum(r['income'] for r in daily(c,ADMIN,arguments('all',None,None,None,None,None))),80.80)
        request_key=str(uuid.uuid4())
        args=dict(partner_code=CODE,amount='50.00',payment_method='TEST',wallet='test-only',request_id=request_key)
        made=create_real_withdrawal(engine,**args)
        self.assertTrue(made['success'],made)
        self.assertTrue(create_real_withdrawal(engine,**args)['duplicate'])
        self.assertFalse(create_real_withdrawal(engine,**{**args,'request_id':str(uuid.uuid4())})['success'])
        wid=made['withdrawal_id']
        client=TestClient(app)
        with patch('access_guard.verified_telegram_id',return_value=ADMIN), patch('main._cpa_admin_actor',return_value=ADMIN), patch('main.send_partner_notification',new_callable=AsyncMock) as notify:
            wallet=client.get(f'/balance/{ADMIN}').json()
            self.assertEqual(wallet['available'],30.80)
            listed=client.get('/admin/withdrawals').json()['withdrawals']
            item=next(x for x in listed if x['id']==wid)
            self.assertTrue(item['is_real_finance'])
            self.assertEqual(item['status'],'pending')
            self.assertEqual(item['wallet'],'test-only')
            result=client.post(f'/admin/withdrawals/{wid}/paid',json={'confirmed_manual':True}).json()
            self.assertTrue(result['success'],result)
            self.assertEqual(notify.await_count,1)
            self.assertFalse(client.post(f'/admin/withdrawals/{wid}/paid',json={'confirmed_manual':True}).json()['success'])
            self.assertEqual(notify.await_count,1)
            wallet=client.get(f'/balance/{ADMIN}').json()
            self.assertEqual(wallet['available'],30.80)
            self.assertEqual(wallet['paid'],50)
            finance=client.get('/admin/finance').json()
            self.assertEqual(finance['partner_income'],80.80)
            self.assertEqual(finance['service_income'],20.20)
            users=client.get('/admin/users').json()['users']
            self.assertEqual(next(u for u in users if u['telegram_id']==ADMIN)['income'],80.80)
        with patch('access_guard.verified_telegram_id',return_value=fixture.OTHER):
            self.assertEqual(client.get('/admin/withdrawals').status_code,403)
            self.assertEqual(client.post(f'/admin/withdrawals/{wid}/paid',json={'confirmed_manual':True}).status_code,403)
        cid3,_=self.credit('100.00');self.release(cid3,'80.00')
        another=create_real_withdrawal(engine,**{**args,'request_id':str(uuid.uuid4())})
        self.assertTrue(mark_real_rejected(engine,another['withdrawal_id'])['success'])
        self.assertFalse(mark_real_rejected(engine,another['withdrawal_id'])['success'])
        self.assertEqual(read_partner_hold(engine,CODE)['real_withdrawable'],'110.80')
        with engine.connect() as c:
            self.assertEqual(c.execute(text('SELECT count(*) FROM cpa_payout_proofs')).scalar_one(),0)
            saved=c.execute(text('SELECT manual_paid_by,manual_paid_at FROM withdrawals WHERE id=:id'),{'id':wid}).one()
            self.assertEqual(saved.manual_paid_by,ADMIN)
            self.assertIsNotNone(saved.manual_paid_at)

if __name__=='__main__':
    unittest.main()
