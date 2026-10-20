"""Disposable database; all outbound Telegram messages are mocked."""
import concurrent.futures
import asyncio
from types import SimpleNamespace
import uuid
import unittest
from unittest.mock import AsyncMock, patch
from sqlalchemy import text
from fastapi.testclient import TestClient
import test_manual_cpa_workflow as base
from database import save_user
from cpa_real_withdrawals import create_real_withdrawal, mark_real_paid, mark_real_rejected
import referrals
from main import app

engine=base.engine
ADMIN=base.ADMIN
INVITER=base.fixture.OTHER
WALLET='T'+'A'*33

class ReferralTests(unittest.TestCase):
    @classmethod
    def setUpClass(cls):
        base.ManualWorkflowTests.setUpClass()

    def test_referral_lifecycle(self):
        from bot import cmd_start
        from aiogram.filters import CommandObject
        message=SimpleNamespace(from_user=SimpleNamespace(id=9990001,first_name='New',last_name=None,username=None),answer=AsyncMock())
        asyncio.run(cmd_start(message,CommandObject(command='start',args='VVD-TEST-1')))
        message.answer.assert_awaited_once()
        save_user(9990001,'New',None,None,None,base.CODE)
        save_user(9990002,'Organic',None,None,None)
        save_user(9990002,'Organic',None,None,None,'VVD-TEST-1')
        save_user(INVITER,'Inviter',None,None,None,'VVD-TEST-1')
        with engine.begin() as c:
            self.assertEqual(c.execute(text('SELECT invited_by FROM users WHERE telegram_id=9990001')).scalar_one(),INVITER)
            self.assertIsNone(c.execute(text('SELECT invited_by FROM users WHERE telegram_id=9990002')).scalar_one())
            self.assertIsNone(c.execute(text('SELECT invited_by FROM users WHERE telegram_id=:u'),{'u':INVITER}).scalar_one())
            # Fixture: the CPA earning user was invited by INVITER.
            c.execute(text('UPDATE users SET invited_by=:i WHERE telegram_id=:u'),{'i':INVITER,'u':ADMIN})
        flow=base.ManualWorkflowTests()
        cid,_=flow.credit('2500.00')
        self.assertTrue(flow.release(cid,'2000.00')['success'])
        make=lambda amount:create_real_withdrawal(engine,partner_code=base.CODE,amount=amount,payment_method='TEST',wallet='test-only',request_id=str(uuid.uuid4()))
        pending=make('1000.00')
        self.assertTrue(pending['success'],pending)
        self.assertEqual(referrals.summary(engine,INVITER)['earned'],0)
        self.assertTrue(mark_real_rejected(engine,pending['withdrawal_id'])['success'])
        self.assertEqual(referrals.summary(engine,INVITER)['earned'],0)
        paid=make('2000.00')
        client=TestClient(app)
        with patch('access_guard.verified_telegram_id',return_value=ADMIN),patch('main._cpa_admin_actor',return_value=ADMIN),patch('main.send_partner_notification',new_callable=AsyncMock):
            result=client.post(f"/admin/withdrawals/{paid['withdrawal_id']}/paid",json={'confirmed_manual':True}).json()
            self.assertTrue(result['success'],result)
            self.assertFalse(client.post(f"/admin/withdrawals/{paid['withdrawal_id']}/paid",json={'confirmed_manual':True}).json()['success'])
        summary=referrals.summary(engine,INVITER)
        self.assertEqual((summary['earned'],summary['balance'],summary['invited']),(100,100,2))
        self.assertEqual(next(p['earned'] for p in summary['people'] if p['telegram_id']==ADMIN),100)
        self.assertFalse(referrals.create(engine,INVITER,'49',WALLET,str(uuid.uuid4()))['success'])
        self.assertFalse(referrals.create(engine,INVITER,'101',WALLET,str(uuid.uuid4()))['success'])
        self.assertFalse(referrals.create(engine,INVITER,'NaN',WALLET,str(uuid.uuid4()))['success'])
        self.assertFalse(referrals.create(engine,INVITER,'50','bad',str(uuid.uuid4()))['success'])
        key=str(uuid.uuid4())
        body={'amount':'60','wallet':WALLET,'request_id':key}
        with patch('access_guard.verified_telegram_id',return_value=INVITER):
            result=client.post(f'/referral/{INVITER}/withdrawals',json=body).json()
            self.assertTrue(result['success'],result)
            self.assertTrue(client.post(f'/referral/{INVITER}/withdrawals',json=body).json()['duplicate'])
            self.assertEqual(client.post(f'/referral/{ADMIN}/withdrawals',json=body).status_code,403)
            self.assertEqual(client.post(f"/admin/referral-withdrawals/{result['withdrawal_id']}/paid",json={'confirmed_manual':True}).status_code,403)
        self.assertEqual(referrals.summary(engine,INVITER)['balance'],40)
        self.assertFalse(referrals.create(engine,INVITER,'50',WALLET,str(uuid.uuid4()))['success'])
        self.assertFalse(referrals.create(engine,INVITER,'50',WALLET,key)['success'])
        with patch('access_guard.verified_telegram_id',return_value=ADMIN),patch('main._cpa_admin_actor',return_value=ADMIN),patch('main.send_partner_notification',new_callable=AsyncMock) as notify:
            rows=client.get('/admin/withdrawals').json()['withdrawals']
            self.assertTrue(any(r.get('source')=='referral' and r['id']==result['withdrawal_id'] for r in rows))
            url=f"/admin/referral-withdrawals/{result['withdrawal_id']}/reject"
            self.assertTrue(client.post(url,json={}).json()['success'])
            self.assertFalse(client.post(url,json={}).json()['success'])
            self.assertEqual(notify.await_count,1)
        self.assertEqual(referrals.summary(engine,INVITER)['balance'],100)
        with concurrent.futures.ThreadPoolExecutor(max_workers=2) as pool:
            attempts=list(pool.map(lambda _:referrals.create(engine,INVITER,'60',WALLET,str(uuid.uuid4())),range(2)))
        self.assertEqual(sum(x['success'] for x in attempts),1)
        winner=next(x for x in attempts if x['success'])
        self.assertTrue(referrals.process(engine,winner['withdrawal_id'],'rejected',ADMIN)['success'])
        other=referrals.create(engine,INVITER,'100',WALLET,str(uuid.uuid4()))
        self.assertFalse(referrals.process(engine,other['withdrawal_id'],'paid',ADMIN)['success'])
        self.assertTrue(referrals.process(engine,other['withdrawal_id'],'paid',ADMIN,True)['success'])
        self.assertFalse(referrals.process(engine,other['withdrawal_id'],'rejected',ADMIN)['success'])
        self.assertEqual(referrals.summary(engine,INVITER)['balance'],0)
        with engine.connect() as c:
            self.assertEqual(c.execute(text('SELECT count(*) FROM referral_rewards')).scalar_one(),1)
            self.assertEqual(c.execute(text('SELECT balance FROM users WHERE telegram_id=:u'),{'u':INVITER}).scalar_one(),0)
            for table in ('referral_rewards','referral_withdrawals'):
                self.assertFalse(c.execute(text("SELECT has_table_privilege('anon',:t,'SELECT')"),{'t':table}).scalar_one())
        with patch('access_guard.verified_telegram_id',return_value=None):
            self.assertIn(client.get(f'/referral/{INVITER}').status_code,(401,403))

if __name__=='__main__':unittest.main()
