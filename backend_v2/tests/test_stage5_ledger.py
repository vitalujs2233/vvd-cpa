"""Stage 5.2 isolated PostgreSQL integration tests. Never connect to production.

CI injects DATABASE_URL=postgresql://postgres:postgres@127.0.0.1:5432/stars_test.
The test owns every synthetic user/conversion and invokes no live Postback route.
"""
import concurrent.futures
import sys
import unittest
import uuid
from datetime import datetime, timedelta, timezone
from decimal import Decimal
from pathlib import Path

from sqlalchemy import text
from sqlalchemy.exc import DBAPIError

ROOT = Path(__file__).resolve().parents[1]
sys.path.insert(0, str(ROOT))
from database import engine
from cpa_finance import (
    FinanceIneligible, ledger_events_for_conversion, money,
    post_approved_hold, split_gross,
)

USER = 900000005201
OTHER = 900000005202


class StageFiveLedgerTests(unittest.TestCase):
    @classmethod
    def setUpClass(cls):
        cls.prefix = "s52-" + uuid.uuid4().hex[:10]
        cls.ids = {name: uuid.uuid4() for name in (
            "approved", "parallel", "rollback", "pending", "rejected", "test", "late",
        )}
        cls.old_ids = [uuid.uuid4() for _ in range(24)]
        with engine.begin() as c:
            # Match Supabase public API roles and their RLS bypass semantics.
            # All role changes occur only in disposable CI PostgreSQL.
            c.execute(text("""
                DO $roles$
                BEGIN
                  IF NOT EXISTS(SELECT 1 FROM pg_roles WHERE rolname='anon') THEN
                    CREATE ROLE anon NOLOGIN;
                  END IF;
                  IF NOT EXISTS(SELECT 1 FROM pg_roles WHERE rolname='authenticated') THEN
                    CREATE ROLE authenticated NOLOGIN;
                  END IF;
                  IF NOT EXISTS(SELECT 1 FROM pg_roles WHERE rolname='service_role') THEN
                    CREATE ROLE service_role NOLOGIN BYPASSRLS;
                  END IF;
                END
                $roles$;
            """))
            # Match Supabase's default grants on new public tables.
            c.execute(text("""
                ALTER DEFAULT PRIVILEGES FOR ROLE postgres IN SCHEMA public
                  GRANT ALL ON TABLES TO anon, authenticated, service_role
            """))
            # Independent fixture: also works if only this test file runs.
            c.execute(text("""CREATE TABLE IF NOT EXISTS public.users(
                telegram_id BIGINT PRIMARY KEY,first_name VARCHAR(255) NOT NULL,
                balance NUMERIC(12,2) NOT NULL DEFAULT 0,
                hold NUMERIC(12,2) NOT NULL DEFAULT 0,
                withdrawn NUMERIC(12,2) NOT NULL DEFAULT 0)"""))
            for col in (
                "balance NUMERIC(12,2) NOT NULL DEFAULT 0",
                "hold NUMERIC(12,2) NOT NULL DEFAULT 0",
                "withdrawn NUMERIC(12,2) NOT NULL DEFAULT 0",
            ):
                c.execute(text("ALTER TABLE public.users ADD COLUMN IF NOT EXISTS " + col))
            c.execute(text("""CREATE TABLE IF NOT EXISTS public.conversions(
                id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
                click_id VARCHAR(120) NOT NULL UNIQUE,
                user_id BIGINT NOT NULL REFERENCES public.users(telegram_id),
                offer_id VARCHAR(80) NOT NULL,
                payout_gross NUMERIC(12,4) NOT NULL,
                payout_net NUMERIC(12,4) NOT NULL,
                status VARCHAR(30) NOT NULL DEFAULT 'pending',
                transaction_id VARCHAR(120),
                currency VARCHAR(3),
                is_test BOOLEAN NOT NULL DEFAULT FALSE,
                created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
                processed_at TIMESTAMPTZ
            )"""))
            c.execute(text("ALTER TABLE public.conversions ADD COLUMN IF NOT EXISTS is_test BOOLEAN NOT NULL DEFAULT FALSE"))
            c.execute(text("ALTER TABLE public.conversions ADD COLUMN IF NOT EXISTS currency VARCHAR(3)"))
            for uid in (USER, OTHER):
                c.execute(text("""INSERT INTO public.users
                    (telegram_id,first_name,balance,hold,withdrawn)
                    VALUES (:uid,'Synthetic stage 5',100.00,7.00,5.00)"""), {"uid": uid})
            # The synthetic 25 existing rows represent 24 legacy + 1 test.
            for i, legacy_id in enumerate(cls.old_ids):
                c.execute(text("""INSERT INTO public.conversions
                    (id,click_id,user_id,offer_id,payout_gross,payout_net,status,currency,is_test)
                    VALUES (:id,:click,:uid,'legacy-offer',10.00,8.00,'1','USD',FALSE)"""),
                    {"id": legacy_id, "click": cls.prefix+"-legacy-"+str(i), "uid": USER})
            c.execute(text("""INSERT INTO public.conversions
                (id,click_id,user_id,offer_id,payout_gross,payout_net,status,currency,is_test)
                VALUES (:id,:click,:uid,'isolated-test',0,0,'pending','USD',TRUE)"""),
                {"id": cls.ids["test"], "click": cls.prefix+"-test", "uid": USER})
            cls.before_wallet = tuple(c.execute(text(
                "SELECT balance,hold,withdrawn FROM public.users WHERE telegram_id=:id"),
                {"id": USER}).one())
            cls.before_legacy = [tuple(r) for r in c.execute(text("""
                SELECT id,payout_gross,payout_net,status,is_test
                FROM public.conversions WHERE click_id LIKE :pattern ORDER BY click_id
            """), {"pattern": cls.prefix+"-legacy-%"}).all()]
            sql = (ROOT / "migrations/20261017_stage5_cpa_ledger.sql").read_text()
            # Test PostgreSQL transactional DDL rollback by deliberately
            # injecting a failure after the WHOLE migration inside a savepoint.
            save = c.begin_nested()
            try:
                c.connection.cursor().execute(sql + "\nSELECT 1/0;")
            except Exception:
                save.rollback()
            else:
                raise AssertionError("Expected transactional migration failure")
            assert c.execute(text("SELECT to_regclass('public.cpa_ledger')")).scalar_one() is None
            assert c.execute(text("""
                SELECT COUNT(*) FROM information_schema.columns
                WHERE table_schema='public' AND table_name='conversions'
                  AND column_name IN ('finance_eligible_at','finance_approved_at')
            """)).scalar_one() == 0
            # Apply twice in one disposable isolated PostgreSQL fixture.
            c.connection.cursor().execute(sql)
            c.connection.cursor().execute(sql)
            cls.eligible = datetime.now(timezone.utc) - timedelta(days=3)
            cls.approved = datetime.now(timezone.utc) - timedelta(days=2)
            for name in ("approved","parallel","rollback","pending","rejected","late"):
                state = "pending" if name in ("pending","late") else (
                    "rejected" if name == "rejected" else "approved"
                )
                uid = OTHER if name == "parallel" else USER
                c.execute(text("""INSERT INTO public.conversions
                  (id,click_id,user_id,offer_id,payout_gross,payout_net,status,
                   currency,is_test,finance_eligible_at,finance_approved_at)
                  VALUES (:id,:click,:uid,'new-offer',:gross,0,:status,
                          'USD',FALSE,:eligible,:approved)"""),
                  {"id": cls.ids[name], "click": cls.prefix+"-"+name,
                   "uid": uid, "gross": "100.00" if name != "rollback" else "0.03",
                   "status": state, "eligible": cls.eligible,
                   "approved": cls.approved if state == "approved" else None})

    @classmethod
    def tearDownClass(cls):
        # CI-only cleanup. Append-only ledger intentionally cannot be deleted;
        # PostgreSQL service is disposable and discarded after the job.
        pass

    def test_01_money_rounding(self):
        self.assertEqual(split_gross(Decimal("100.00")),
                         (Decimal("100.00"), Decimal("20.00"), Decimal("80.00")))
        self.assertEqual(split_gross("0.03"),
                         (Decimal("0.03"), Decimal("0.01"), Decimal("0.02")))
        self.assertEqual(split_gross("0.01"),
                         (Decimal("0.01"), Decimal("0.00"), Decimal("0.01")))
        self.assertEqual(split_gross("0.00"),
                         (Decimal("0.00"), Decimal("0.00"), Decimal("0.00")))
        for val in (0.1, "0.005", "-1", "NaN", "Infinity", "10000000000.00"):
            with self.subTest(val=val), self.assertRaises(ValueError):
                money(val)

    def test_02_old_data_unchanged_and_isolated(self):
        with engine.connect() as c:
            rows = [tuple(r) for r in c.execute(text("""
                SELECT id,payout_gross,payout_net,status,is_test
                FROM public.conversions WHERE click_id LIKE :pattern ORDER BY click_id
            """), {"pattern": self.prefix+"-legacy-%"}).all()]
            self.assertEqual(rows, self.before_legacy)
            eligible = c.execute(text("""
                SELECT count(*) FROM public.conversions
                WHERE (click_id LIKE :prefix OR id=:test)
                  AND finance_eligible_at IS NOT NULL
            """), {"prefix": self.prefix+"-legacy-%", "test": self.ids["test"]}).scalar_one()
            self.assertEqual(eligible, 0)
            test_count = c.execute(text("""SELECT count(*) FROM public.conversions
                  WHERE click_id LIKE :prefix OR id=:test"""),
                  {"prefix": self.prefix+"-legacy-%", "test": self.ids["test"]}).scalar_one()
            self.assertEqual(test_count,25)
            wallet = tuple(c.execute(text("""
                SELECT balance,hold,withdrawn FROM public.users WHERE telegram_id=:id
            """), {"id": USER}).one())
            self.assertEqual(wallet, self.before_wallet)

    def test_03_legacy_test_pending_rejected_blocked(self):
        for id_ in (self.old_ids[0],self.ids["test"],self.ids["pending"],self.ids["rejected"]):
            with self.subTest(id=str(id_)):
                with engine.begin() as c:
                    with self.assertRaises(FinanceIneligible):
                        post_approved_hold(c, id_)
        with engine.connect() as c:
            self.assertEqual(c.execute(text("SELECT count(*) FROM public.cpa_ledger")).scalar_one(),0)

    def test_04_no_late_eligibility_or_test_opt_in(self):
        with self.assertRaises(DBAPIError):
            with engine.begin() as c:
                c.execute(text("""UPDATE public.conversions
                    SET finance_eligible_at=now() WHERE id=:id"""),
                    {"id":self.old_ids[0]})
        with self.assertRaises(DBAPIError):
            with engine.begin() as c:
                c.execute(text("""UPDATE public.conversions
                    SET finance_eligible_at=now() WHERE id=:id"""),
                    {"id":self.ids["test"]})
        with engine.connect() as c:
            self.assertIsNone(c.execute(text("""
                SELECT finance_eligible_at FROM public.conversions WHERE id=:id
            """), {"id":self.old_ids[0]}).scalar_one())

    def test_04a_role_matrix_and_ledger_privileges(self):
        with engine.connect() as c:
            for role in ("anon","authenticated","service_role"):
                bypass = c.execute(text("""
                    SELECT rolbypassrls FROM pg_roles WHERE rolname=:r
                """), {"r":role}).scalar_one()
                self.assertEqual(bypass,role=="service_role")
                for privilege in ("SELECT","INSERT","UPDATE","DELETE","TRUNCATE"):
                    self.assertFalse(c.execute(text("""
                        SELECT has_table_privilege(:role, 'public.cpa_ledger', :privilege)
                    """), {"role":role,"privilege":privilege}).scalar_one(),
                    msg=f"{role} unexpectedly has {privilege}")
            self.assertTrue(c.execute(text("""
                SELECT relrowsecurity FROM pg_class
                WHERE oid='public.cpa_ledger'::regclass
            """)).scalar_one())
            self.assertTrue(c.execute(text("""
                SELECT has_table_privilege('postgres','public.cpa_ledger','INSERT')
            """)).scalar_one())
        # Test actual SQL role access, not just privilege metadata.
        for role in ("anon","authenticated","service_role"):
            for statement in ("SELECT count(*) FROM public.cpa_ledger",
                              "INSERT INTO public.cpa_ledger DEFAULT VALUES",
                              "UPDATE public.cpa_ledger SET amount=0",
                              "DELETE FROM public.cpa_ledger",
                              "TRUNCATE public.cpa_ledger"):
                with self.subTest(role=role,statement=statement):
                    with self.assertRaises(DBAPIError):
                        with engine.begin() as c:
                            c.execute(text("SET LOCAL ROLE "+role))
                            c.execute(text(statement))

    def test_04aa_wallet_check_and_sql_numeric_overflow(self):
        for statement in (
            "UPDATE public.users SET balance=-0.01 WHERE telegram_id=:uid",
            "UPDATE public.users SET hold=-0.01 WHERE telegram_id=:uid",
        ):
            with self.assertRaises(DBAPIError):
                with engine.begin() as c:
                    c.execute(text(statement),{"uid":USER})
        with engine.connect() as c:
            self.assertEqual(c.execute(text("""
                SELECT 9999999999.99::NUMERIC(12,2)
            """)).scalar_one(),Decimal("9999999999.99"))
        with self.assertRaises(DBAPIError):
            with engine.begin() as c:
                c.execute(text("SELECT 10000000000.00::NUMERIC(12,2)"))
        with engine.connect() as c:
            self.assertEqual(tuple(c.execute(text("""
                SELECT balance,hold,withdrawn FROM public.users
                WHERE telegram_id=:uid
            """),{"uid":USER}).one()),self.before_wallet)

    def test_04b_approval_time_write_once(self):
        # New pending conversions can be approved once in a future
        # authenticated postback transaction; changing approval later is forbidden.
        with engine.begin() as conn:
            conn.execute(text("""
                UPDATE public.conversions SET status='approved',
                    finance_approved_at=now() WHERE id=:id
            """), {"id": self.ids["late"]})
        with self.assertRaises(DBAPIError):
            with engine.begin() as conn:
                conn.execute(text("""
                    UPDATE public.conversions SET finance_approved_at=
                      finance_approved_at + INTERVAL '1 second' WHERE id=:id
                """), {"id": self.ids["late"]})

    def test_05_single_credit_and_repeat(self):
        with engine.begin() as c:
            first=post_approved_hold(c, self.ids["approved"])
            self.assertTrue(first["credited"])
            self.assertEqual((first["fee"],first["net"]),
                             (Decimal("20.00"),Decimal("80.00")))
        with engine.begin() as c:
            second=post_approved_hold(c, self.ids["approved"])
            self.assertFalse(second["credited"])
            entries=ledger_events_for_conversion(c, self.ids["approved"])
            self.assertEqual(len(entries),2)
            self.assertEqual({e["operation_type"] for e in entries},
                             {"hold_credit","platform_fee_accrual"})
            hold_entry=next(e for e in entries if e["operation_type"]=="hold_credit")
            self.assertEqual(hold_entry["hold_delta"],Decimal("80.00"))
            self.assertEqual(hold_entry["hold_until"]-hold_entry["approved_at"],
                             timedelta(hours=240))
            wallet=c.execute(text("SELECT balance,hold,withdrawn FROM public.users WHERE telegram_id=:id"),
                             {"id":USER}).one()
            self.assertEqual(tuple(wallet),
                             (Decimal("100.00"),Decimal("87.00"),Decimal("5.00")))

    def test_06_duplicate_key_and_append_only(self):
        with self.assertRaises(DBAPIError):
            with engine.begin() as c:
                c.execute(text("""INSERT INTO public.cpa_ledger
                  (conversion_id,user_id,operation_type,event_key,amount,
                   hold_delta,approved_at,hold_until,actor_type)
                  SELECT conversion_id,user_id,operation_type,event_key,amount,
                         hold_delta,approved_at,hold_until,actor_type
                    FROM public.cpa_ledger WHERE operation_type='hold_credit' LIMIT 1"""))
        for sql in (
            "UPDATE public.cpa_ledger SET amount=1",
            "DELETE FROM public.cpa_ledger",
            "TRUNCATE public.cpa_ledger",
        ):
            with self.subTest(sql=sql), self.assertRaises(DBAPIError):
                with engine.begin() as c:
                    c.execute(text(sql))

    def test_06b_hold_release_cannot_be_early(self):
        with engine.connect() as conn:
            first = next(e for e in ledger_events_for_conversion(conn,self.ids["approved"])
                         if e["operation_type"]=="hold_credit")
        with self.assertRaises(DBAPIError):
            with engine.begin() as conn:
                conn.execute(text("""
                    INSERT INTO public.cpa_ledger
                      (conversion_id,user_id,operation_type,event_key,amount,
                       hold_delta,balance_delta,original_entry_id,actor_type)
                    VALUES (:id,:uid,'hold_release',:key,80,-80,80,:source,'scheduler')
                """), {"id":self.ids["approved"],"uid":USER,
                        "key":self.prefix+"-early-release","source":first["id"]})
        with engine.connect() as conn:
            self.assertEqual(conn.execute(text("""
              SELECT count(*) FROM public.cpa_ledger WHERE event_key=:key
            """), {"key":self.prefix+"-early-release"}).scalar_one(),0)

    def test_07_rollback_is_all_or_nothing(self):
        with self.assertRaisesRegex(RuntimeError,"rollback injection"):
            with engine.begin() as c:
                result=post_approved_hold(c, self.ids["rollback"])
                self.assertEqual((result["fee"],result["net"]),
                                 (Decimal("0.01"),Decimal("0.02")))
                raise RuntimeError("rollback injection")
        with engine.connect() as c:
            self.assertEqual(len(ledger_events_for_conversion(c,self.ids["rollback"])),0)
            self.assertEqual(c.execute(text("""
                SELECT payout_net FROM public.conversions WHERE id=:id
            """), {"id":self.ids["rollback"]}).scalar_one(),Decimal("0.00"))
            self.assertEqual(c.execute(text("""
                SELECT hold FROM public.users WHERE telegram_id=:id
            """), {"id":USER}).scalar_one(),Decimal("87.00"))

    def test_08_parallel_approval_once(self):
        def try_credit(_):
            with engine.begin() as c:
                return post_approved_hold(c,self.ids["parallel"])["credited"]
        with concurrent.futures.ThreadPoolExecutor(max_workers=8) as pool:
            credited=list(pool.map(try_credit,range(12)))
        self.assertEqual(credited.count(True),1)
        self.assertEqual(credited.count(False),11)
        with engine.connect() as c:
            self.assertEqual(len(ledger_events_for_conversion(c,self.ids["parallel"])),2)
            self.assertEqual(c.execute(text("""
                SELECT hold FROM public.users WHERE telegram_id=:id
            """), {"id":OTHER}).scalar_one(),Decimal("87.00"))

    def test_08b_sql_direct_forged_fee_and_hold_rejected(self):
        for operation,amount,hold in (
            ("hold_credit","81.00","81.00"),
            ("platform_fee_accrual","21.00","0.00"),
        ):
            with self.subTest(operation=operation), self.assertRaises(DBAPIError):
                with engine.begin() as c:
                    c.execute(text("""
                        INSERT INTO public.cpa_ledger
                          (conversion_id,user_id,operation_type,event_key,amount,
                           hold_delta,platform_fee_delta,approved_at,hold_until,actor_type)
                        VALUES (:id,:uid,:operation,:key,:amount,
                                :hold,:fee,:approved,:until,'postback')
                    """), {"id":self.ids["rollback"],"uid":USER,
                            "operation":operation,"key":self.prefix+"-forged-"+operation,
                            "amount":amount,"hold":hold,
                            "fee":amount if operation=="platform_fee_accrual" else "0",
                            "approved":self.approved,
                            "until":self.approved+timedelta(hours=240)
                              if operation=="hold_credit" else None})

    def test_09_direct_historical_ledger_write_rejected(self):
        with self.assertRaises(DBAPIError):
            with engine.begin() as c:
                c.execute(text("""INSERT INTO public.cpa_ledger
                  (conversion_id,user_id,operation_type,event_key,amount,
                   hold_delta,approved_at,hold_until,actor_type)
                  VALUES (:id,:uid,'hold_credit',:key,10,10,
                          now(),now()+INTERVAL '240 hours','postback')"""),
                  {"id":self.old_ids[0],"uid":USER,"key":self.prefix+"-bad"})
        with engine.connect() as c:
            self.assertEqual(c.execute(text("""SELECT count(*) FROM public.cpa_ledger
                WHERE event_key=:key"""),{"key":self.prefix+"-bad"}).scalar_one(),0)


if __name__ == "__main__":
    unittest.main()
