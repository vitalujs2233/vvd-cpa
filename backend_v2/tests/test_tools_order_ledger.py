"""Run ONLY on a disposable PostgreSQL database, never on production."""
import os
import unittest
from pathlib import Path
from uuid import uuid4
from decimal import Decimal as D
from concurrent.futures import ThreadPoolExecutor
from sqlalchemy import create_engine,text
from tools_order_ledger import Ledger,LedgerError

class LedgerTests(unittest.TestCase):
    @classmethod
    def setUpClass(cls):
        if os.getenv('TOOLS_LEDGER_TEST_DB')!='1':raise unittest.SkipTest('Disposable PostgreSQL required')
        cls.db=create_engine(os.environ['DATABASE_URL']);cls.ledger=Ledger(cls.db)
        with cls.db.begin() as c:
            c.execute(text('CREATE TABLE IF NOT EXISTS users(telegram_id bigint PRIMARY KEY,first_name text)'))
            sql=(Path(__file__).parents[1]/'migrations/20261016_tools_marketplace.sql').read_text()
            sql='\n'.join(line for line in sql.splitlines() if not line.lstrip().startswith('--'))
            for part in sql.split(';'):
                if 'REVOKE ALL' not in part and part.strip():c.execute(text(part))
            c.execute(text('ALTER TABLE tool_wallets ADD COLUMN IF NOT EXISTS refund_debt numeric(14,2) NOT NULL DEFAULT 0'))
            migration=next((Path(__file__).parents[1]/'migrations').glob('*_tools_order_ledger.sql'))
            c.execute(text(migration.read_text()))
    def setUp(self):
        self.uid=int(uuid4().int%1000000000000);self.request=uuid4()
        with self.db.begin() as c:
            c.execute(text("INSERT INTO users VALUES(:u,'Test')"),dict(u=self.uid))
            c.execute(text("INSERT INTO tool_wallets(telegram_id,available) VALUES(:u,10)"),dict(u=self.uid))
    def reserve(self,request=None,price='1.30'):
        return self.ledger.reserve(self.uid,request or self.request,'numbers','test-only',{'product':'permitted-test'},D('1'),D(price),D('30'))
    def balances(self):
        with self.db.connect() as c:return tuple(c.execute(text('SELECT available,reserved FROM tool_wallets WHERE telegram_id=:u'),dict(u=self.uid)).one())
    def test_concurrent_replay_one_debit(self):
        with ThreadPoolExecutor(max_workers=8) as p:results=list(p.map(lambda _:self.reserve(),range(8)))
        self.assertEqual(len({r[0] for r in results}),1);self.assertEqual(sum(r[1] for r in results),1)
        self.assertEqual(self.balances(),(D('8.70'),D('1.30')))
    def test_insufficient_atomic(self):
        with self.assertRaisesRegex(LedgerError,'insufficient_balance'):self.reserve(price='20')
        self.assertEqual(self.balances(),(D('10'),D('0')))
        with self.db.connect() as c:self.assertEqual(c.execute(text('SELECT count(*) FROM tool_orders WHERE telegram_id=:u'),dict(u=self.uid)).scalar(),0)
    def test_conflicting_replay_rejected(self):
        self.reserve()
        with self.assertRaisesRegex(LedgerError,'idempotency_conflict'):self.reserve(price='2.60')
        self.assertEqual(self.balances(),(D('8.70'),D('1.30')))
    def test_unknown_recovery_single_settlement_and_refund(self):
        oid,_=self.reserve();self.assertTrue(self.ledger.claim(self.uid,oid));self.assertFalse(self.ledger.claim(self.uid,oid))
        self.ledger.uncertain(self.uid,oid)
        self.assertEqual(self.balances(),(D('8.70'),D('1.30')))
        restarted=Ledger(self.db)
        self.assertTrue(restarted.settle(self.uid,oid,'test-'+oid));self.assertFalse(restarted.settle(self.uid,oid,'test-'+oid))
        self.assertEqual(self.balances(),(D('8.70'),D('0')))
        with ThreadPoolExecutor(max_workers=4) as p:results=list(p.map(lambda _:restarted.refund_confirmed(self.uid,oid),range(4)))
        self.assertEqual(sum(results),1);self.assertEqual(self.balances(),(D('10'),D('0')))
        with self.db.connect() as c:self.assertEqual(c.execute(text('SELECT count(*) FROM tool_transactions WHERE order_id=:o'),dict(o=oid)).scalar(),2)
    def test_confirmed_rejection_releases_once(self):
        oid,_=self.reserve();self.ledger.claim(self.uid,oid);self.ledger.uncertain(self.uid,oid)
        self.assertTrue(self.ledger.reject_confirmed(self.uid,oid));self.assertFalse(self.ledger.reject_confirmed(self.uid,oid))
        self.assertEqual(self.balances(),(D('10'),D('0')))
    def test_owner_and_invalid_transition(self):
        oid,_=self.reserve()
        for action in (lambda:self.ledger.owned(self.uid+1,oid),lambda:self.ledger.reject_confirmed(self.uid+1,oid),lambda:self.ledger.refund_confirmed(self.uid,oid)):
            with self.assertRaises(LedgerError):action()
        self.assertEqual(self.balances(),(D('8.70'),D('1.30')))
    def test_two_orders_compete_for_balance(self):
        def reserve(_):
            try:return self.reserve(request=uuid4(),price='7.80')[1]
            except LedgerError:return False
        with ThreadPoolExecutor(max_workers=2) as p:results=list(p.map(reserve,range(2)))
        self.assertEqual(sum(results),1);self.assertEqual(self.balances(),(D('2.20'),D('7.80')))

    def test_duplicate_supplier_receipt_rolls_back_second_settlement(self):
        from sqlalchemy.exc import IntegrityError
        first,_=self.reserve();second,_=self.reserve(request=uuid4())
        self.ledger.claim(self.uid,first);self.ledger.claim(self.uid,second)
        self.ledger.settle(self.uid,first,'shared-receipt-'+first)
        before=self.balances()
        with self.assertRaises(IntegrityError):self.ledger.settle(self.uid,second,'shared-receipt-'+first)
        self.assertEqual(self.balances(),before)
        self.assertEqual(self.ledger.owned(self.uid,second)['ledger_state'],'submitting')
