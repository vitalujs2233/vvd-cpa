"""Isolated PostgreSQL payment tests. Never run against a production database."""
import asyncio
from concurrent.futures import ThreadPoolExecutor
from decimal import Decimal
import os
from pathlib import Path
from types import SimpleNamespace
import unittest
from unittest.mock import AsyncMock, patch
from uuid import uuid4
from fastapi import HTTPException
from sqlalchemy import text
import tools_stars as pay

ROOT = Path(__file__).resolve().parents[1]

class PriceTests(unittest.TestCase):
    def test_round_up_and_validate(self):
        self.assertEqual(pay.price('5.01','70')[1],351)
        for invalid in ('4','10001','5.001','NaN'):
            with self.assertRaises(HTTPException): pay.price(invalid,'70')
    def test_no_unconfigured_price(self):
        for rate in ('','NaN','-1','0','1.1234567'):
            with patch.dict(os.environ,TOOLS_STARS_PER_USD=rate,TOOLS_STARS_ENABLED='true'):
                self.assertFalse(pay.settings()['payments_enabled'])

class PaymentTests(unittest.TestCase):
    @classmethod
    def setUpClass(cls):
        if 'tools_stars_test' not in str(pay.engine.url):
            raise RuntimeError('Tests require a dedicated tools_stars_test database')
        with pay.engine.begin() as c:
            c.execute(text("CREATE TABLE IF NOT EXISTS users(telegram_id BIGINT PRIMARY KEY)"))
            c.execute(text("DO $$ BEGIN IF NOT EXISTS(SELECT FROM pg_roles WHERE rolname='anon') THEN CREATE ROLE anon; END IF; IF NOT EXISTS(SELECT FROM pg_roles WHERE rolname='authenticated') THEN CREATE ROLE authenticated; END IF; END $$"))
            for f in ('20261016_tools_marketplace.sql','20261021_tools_payment_invoices_preparation.sql','20261023081155_tools_stars_usd.sql'):
                c.exec_driver_sql((ROOT/'migrations'/f).read_text())
    def setUp(self):
        self.env=patch.dict(os.environ,TOOLS_STARS_ENABLED='true',TOOLS_STARS_PER_USD='70',BOT_TOKEN='123456:TEST_ONLY')
        self.env.start()
        self.uid=int(uuid4().int % 10**12)+1
        with pay.engine.begin() as c: c.execute(text('INSERT INTO users VALUES(:id)'),{'id':self.uid})
        self.bot=SimpleNamespace(create_invoice_link=AsyncMock(return_value='https://t.me/$test'))
    def tearDown(self): self.env.stop()
    def create(self, amount='10', key=None):
        return asyncio.run(pay.create_invoice(self.uid,Decimal(amount),key or uuid4(),int(Decimal(amount)*70),self.bot))
    def credit(self,i,charge='test',refund=False,**kw):
        return pay.settle(pay.PREFIX+i['id'],kw.get('uid',self.uid),kw.get('currency','XTR'),kw.get('stars',i['stars_amount']),charge,refund)
    def wallet(self):
        with pay.engine.connect() as c:
            r=c.execute(text('SELECT available,refund_debt FROM tool_wallets WHERE telegram_id=:uid'),{'uid':self.uid}).first()
            return tuple(r) if r else (Decimal(0),Decimal(0))
    def ledger(self):
        with pay.engine.connect() as c:
            return c.execute(text('SELECT count(*),COALESCE(sum(amount),0) FROM tool_transactions WHERE telegram_id=:uid'),{'uid':self.uid}).one()
    def test_unpaid_no_credit(self):
        self.create();self.assertEqual(self.wallet(),(0,0));self.assertEqual(self.ledger()[0],0)
    def test_paid_exactly_once_concurrent(self):
        i=self.create();charge=str(uuid4())
        with ThreadPoolExecutor(max_workers=8) as pool:
            self.assertTrue(all(pool.map(lambda _:self.credit(i,charge), range(16))))
        self.assertEqual(self.wallet(),(10,0));self.assertEqual(tuple(self.ledger()),(1,10))
    def test_foreign_amount_currency_unknown_rejected(self):
        i=self.create()
        for args in ({'uid':self.uid+1},{'stars':701},{'currency':'USD'}): self.assertFalse(self.credit(i,**args))
        self.assertFalse(self.credit({**i,'id':str(uuid4())}))
        self.assertEqual(self.wallet(),(0,0))
    def test_creation_deduplicated_and_recoverable(self):
        key=uuid4();i=self.create(key=key)
        self.assertEqual(self.create(key=key)['id'],i['id'])
        self.assertEqual(self.create()['id'],i['id'])
        self.assertEqual(self.bot.create_invoice_link.await_count,1)
        with self.assertRaises(HTTPException):self.create('20',key)
    def test_ambiguous_provider_failure_reuses_invoice(self):
        self.bot.create_invoice_link.side_effect=TimeoutError()
        key=uuid4()
        with self.assertRaises(HTTPException): self.create(key=key)
        self.bot.create_invoice_link.side_effect=None
        i=self.create(key=key)
        with pay.engine.connect() as c:
            self.assertEqual(c.execute(text('SELECT count(*) FROM tool_payment_invoices WHERE telegram_id=:u'),{'u':self.uid}).scalar(),1)
        self.assertEqual(i['status'],'pending')
    def test_precheckout_only_one_query(self):
        i=self.create();p=pay.PREFIX+i['id']
        self.assertTrue(pay.pre_checkout(p,self.uid,'XTR',700,'q1'))
        self.assertTrue(pay.pre_checkout(p,self.uid,'XTR',700,'q1'))
        self.assertFalse(pay.pre_checkout(p,self.uid,'XTR',700,'q2'))
        self.assertFalse(pay.pre_checkout(p,self.uid+1,'XTR',700,'q1'))
    def test_expired_checkout_rejected_late_paid_restored(self):
        i=self.create()
        with pay.engine.begin() as c:c.execute(text("UPDATE tool_payment_invoices SET status='expired',expires_at=NOW()-INTERVAL '1 day' WHERE id=:i"),{'i':i['id']})
        self.assertFalse(pay.pre_checkout(pay.PREFIX+i['id'],self.uid,'XTR',700,'q'))
        self.assertTrue(self.credit(i,str(uuid4())));self.assertEqual(self.wallet(),(10,0))
    def test_rate_change_keeps_invoice_value(self):
        i=self.create()
        with patch.dict(os.environ,TOOLS_STARS_PER_USD='100',TOOLS_STARS_ENABLED='false'):
            self.assertTrue(self.credit(i,str(uuid4())))
        self.assertEqual(self.wallet(),(10,0))
    def test_refund_and_late_duplicate(self):
        i=self.create();ch=str(uuid4())
        self.credit(i,ch);self.credit(i,ch,True);self.credit(i,ch,True);self.credit(i,ch)
        self.assertEqual(self.wallet(),(0,0));self.assertEqual(tuple(self.ledger()),(2,0))
    def test_refund_arrives_first(self):
        i=self.create();ch=str(uuid4());self.credit(i,ch,True);self.credit(i,ch)
        self.assertEqual(self.wallet(),(0,0));self.assertEqual(tuple(self.ledger()),(2,0))
    def test_spent_refund_debt_and_next_topup(self):
        i=self.create();ch=str(uuid4());self.credit(i,ch)
        with pay.engine.begin() as c:c.execute(text('UPDATE tool_wallets SET available=2 WHERE telegram_id=:u'),{'u':self.uid})
        self.credit(i,ch,True);self.assertEqual(self.wallet(),(0,8))
        self.credit(self.create(),str(uuid4()));self.assertEqual(self.wallet(),(2,0))
    def test_charge_not_reused_across_invoices(self):
        i=self.create();ch=str(uuid4());self.credit(i,ch)
        j=self.create('20')
        with self.assertRaises(Exception):self.credit(j,ch)
        self.assertEqual(self.wallet(),(10,0));self.assertEqual(self.ledger()[0],1)
    def test_db_failure_rolls_back_whole_credit(self):
        i=self.create();ch=str(uuid4())
        with pay.engine.begin() as c:
            c.exec_driver_sql("CREATE FUNCTION fail_tools_test() RETURNS trigger LANGUAGE plpgsql AS $$ BEGIN RAISE EXCEPTION 'test crash'; END $$")
            c.exec_driver_sql('CREATE TRIGGER fail_tools_test BEFORE UPDATE ON tool_wallets FOR EACH ROW EXECUTE FUNCTION fail_tools_test()')
        try:
            with self.assertRaises(Exception):self.credit(i,ch)
            self.assertEqual(self.ledger()[0],0)
            with pay.engine.connect() as c:self.assertEqual(c.execute(text('SELECT status FROM tool_payment_invoices WHERE id=:i'),{'i':i['id']}).scalar(),'pending')
        finally:
            with pay.engine.begin() as c:
                c.exec_driver_sql('DROP TRIGGER fail_tools_test ON tool_wallets');c.exec_driver_sql('DROP FUNCTION fail_tools_test()')
        self.assertTrue(self.credit(i,ch));self.assertEqual(self.wallet(),(10,0))
    def test_provider_history_recovers_missed_update(self):
        i=self.create();ch=str(uuid4())
        partner=SimpleNamespace(type='user',user=SimpleNamespace(id=self.uid),invoice_payload=pay.PREFIX+i['id'])
        tx=SimpleNamespace(id=ch,amount=700,source=partner,receiver=None)
        self.bot.get_star_transactions=AsyncMock(return_value=SimpleNamespace(transactions=[tx]))
        asyncio.run(pay.reconcile(self.bot));asyncio.run(pay.reconcile(self.bot))
        self.assertEqual(self.wallet(),(10,0));self.assertEqual(self.ledger()[0],1)
    def test_client_database_roles_cannot_write(self):
        with pay.engine.connect() as c:
            for role in ('anon','authenticated'):
                for table in ('tool_wallets','tool_transactions','tool_payment_invoices'):
                    self.assertFalse(c.execute(text('SELECT has_table_privilege(:r,:t,\'INSERT,UPDATE,DELETE\')'),{'r':role,'t':table}).scalar())

if __name__=='__main__':unittest.main()
