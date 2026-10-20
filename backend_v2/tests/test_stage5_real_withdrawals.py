"""PR-only integration tests on disposable PostgreSQL 17. No production connections.
Requires DATABASE_URL to point to the isolated CI PostgreSQL 17 service.
"""
import concurrent.futures
import os
import sys
import unittest
import uuid
from datetime import datetime,timedelta,timezone
from decimal import Decimal
from pathlib import Path
from unittest.mock import AsyncMock,patch

from sqlalchemy import text
from sqlalchemy.exc import DBAPIError
from fastapi.testclient import TestClient

ROOT=Path(__file__).resolve().parents[1]
sys.path.insert(0,str(ROOT))
if "127.0.0.1:5432/cpa_withdrawals_isolated" not in os.getenv("DATABASE_URL",""):
    raise RuntimeError("Real-withdrawable integration tests require disposable isolated PostgreSQL")
from database import engine
from cpa_finance import post_approved_hold,ledger_events_for_conversion,lock_finance_scope
from cpa_real_withdrawals import (
    create_real_withdrawal,mark_real_paid,mark_real_rejected,real_withdrawable,
    epoch_row,RealFinanceDisabled,RealFinanceInconsistent,
    release_matured_hold_contract,
)
from main import app

ADMIN=900000006101
OTHER=900000006102
USER_CODE="VVD-STAGE5-ADMIN"
OLD_MAX=22
T0=datetime.now(timezone.utc)-timedelta(days=20)


class Stage5RealWithdrawalsTests(unittest.TestCase):
    @classmethod
    def setUpClass(cls):
        cls.conv_ids={}
        cls.old_finance={}
        with engine.begin() as c:
            c.execute(text("""
                DO $roles$ BEGIN
                    IF NOT EXISTS(SELECT 1 FROM pg_roles WHERE rolname='anon')
                    THEN CREATE ROLE anon NOLOGIN; END IF;
                    IF NOT EXISTS(SELECT 1 FROM pg_roles WHERE rolname='authenticated')
                    THEN CREATE ROLE authenticated NOLOGIN; END IF;
                    IF NOT EXISTS(SELECT 1 FROM pg_roles WHERE rolname='service_role')
                    THEN CREATE ROLE service_role NOLOGIN BYPASSRLS; END IF;
                END $roles$;
            """))
            c.execute(text("""
                ALTER DEFAULT PRIVILEGES FOR ROLE postgres IN SCHEMA public
                GRANT ALL ON TABLES TO anon,authenticated,service_role
            """))
            c.execute(text("""CREATE TABLE public.users (
                telegram_id BIGINT PRIMARY KEY,
                first_name TEXT NOT NULL,
                invited_by BIGINT REFERENCES users(telegram_id),
                last_name TEXT,
                username TEXT,
                partner_code TEXT UNIQUE,
                role TEXT NOT NULL DEFAULT 'user',
                balance NUMERIC(12,2) NOT NULL DEFAULT 0,
                hold NUMERIC(12,2) NOT NULL DEFAULT 0,
                withdrawn NUMERIC(12,2) NOT NULL DEFAULT 0
            )"""))
            c.execute(text("""CREATE TABLE public.clicks (
                id BIGSERIAL PRIMARY KEY,
                user_id BIGINT NOT NULL,
                partner_code TEXT NOT NULL,
                click_id TEXT NOT NULL UNIQUE
            )"""))
            c.execute(text("""CREATE TABLE public.conversions (
                id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
                click_id TEXT NOT NULL UNIQUE,
                user_id BIGINT NOT NULL REFERENCES public.users(telegram_id),
                offer_id TEXT NOT NULL,
                payout_gross NUMERIC(12,4) NOT NULL,
                payout_net NUMERIC(12,4) NOT NULL,
                status TEXT NOT NULL DEFAULT 'pending',
                transaction_id TEXT,
                currency VARCHAR(3),
                is_test BOOLEAN NOT NULL DEFAULT FALSE,
                created_at TIMESTAMPTZ NOT NULL DEFAULT now()
            )"""))
            c.execute(text("""CREATE TABLE public.withdrawals (
                id BIGSERIAL PRIMARY KEY,
                user_id BIGINT NOT NULL,
                partner_code TEXT,
                amount NUMERIC(12,2) NOT NULL,
                payment_method TEXT NOT NULL,
                wallet TEXT NOT NULL,
                status TEXT NOT NULL DEFAULT 'pending',
                created_at TIMESTAMP NOT NULL DEFAULT now(),
                processed_at TIMESTAMP
            )"""))
            for i in range(12):
                c.execute(text("""INSERT INTO public.users
                   (telegram_id,first_name,partner_code,role,balance,hold,withdrawn)
                   VALUES(:uid,'Synthetic CI',:code,:role,:bal,0,:paid)"""),
                   {"uid":ADMIN+i,"code":USER_CODE if i==0 else f"VVD-TEST-{i}",
                    "role":"admin" if i==0 else "user","bal":"833.48" if i==0 else "0.00",
                    "paid":"400.00" if i==0 else "0.00"})
            c.execute(text("""INSERT INTO public.clicks
                (user_id,partner_code,click_id)
                SELECT :uid,:code,'legacy-click-'||n::text
                FROM generate_series(1,700) AS n"""),
                {"uid":ADMIN,"code":USER_CODE})
            for i in range(25):
                c.execute(text("""INSERT INTO public.conversions
                    (id,click_id,user_id,offer_id,payout_gross,payout_net,status,
                     currency,is_test)
                    VALUES(:id,:click,:uid,'legacy-offer',10,8,'1','USD',:test)"""),
                    {"id":uuid.uuid4(),"click":f"legacy-click-{i+1}","uid":ADMIN,
                     "test":i==24})
            for i in range(22):
                c.execute(text("""INSERT INTO public.withdrawals
                   (user_id,partner_code,amount,payment_method,wallet,status)
                   VALUES(:uid,:code,:amount,'TEST','test-only',:status)"""),
                   {"uid":ADMIN,"code":USER_CODE,
                    "amount":"1.00" if i==0 else ("59.00" if i==16 else "50.00"),
                    "status":"paid" if i in (2,4,12,13,14,18,19,21) else "rejected"})
            # Ensure both original PR #21 and #22 protections are simulated.
            sql1=(ROOT/"migrations/20261017_stage5_cpa_ledger.sql").read_text()
            c.connection.cursor().execute(sql1)
            c.execute(text("ALTER TABLE public.withdrawals ENABLE ROW LEVEL SECURITY"))
            c.execute(text("REVOKE ALL ON public.withdrawals FROM PUBLIC,anon,authenticated"))
            c.execute(text("REVOKE ALL ON SEQUENCE public.withdrawals_id_seq FROM PUBLIC,anon,authenticated"))
            cls.old_finance={
                "withdrawals":c.execute(text("SELECT count(*) FROM public.withdrawals")).scalar_one(),
                "users":c.execute(text("SELECT count(*) FROM public.users")).scalar_one(),
                "conversions":c.execute(text("SELECT count(*) FROM public.conversions")).scalar_one(),
                "clicks":c.execute(text("SELECT count(*) FROM public.clicks")).scalar_one(),
            }
            sql2=(ROOT/"migrations/20261017_stage5_real_withdrawable_guard.sql").read_text()
            c.connection.cursor().execute(sql2)
            # Prove DDL migration can be re-applied.
            c.connection.cursor().execute(sql2)
            # Draft Stage 5.4 + 5.5 additive financial-proof schema.
            for extra in ("20261017_stage5_manual_hold_release.sql",
                          "20261017_stage5_settled_payouts.sql",
                          "20261019162821_manual_cpa_payouts.sql",
                          "20261020135654_referral_paid_rewards.sql"):
                c.connection.cursor().execute((ROOT/"migrations"/extra).read_text())
            # Exercise the real activation function, but roll it back in CI.
            save=c.begin_nested()
            c.execute(text("SELECT public.cpa_activate_finance_epoch()"))
            after=c.execute(text("""SELECT legacy_max_withdrawal_id,
               legacy_max_click_row_id FROM public.cpa_finance_epoch""")).one()
            assert tuple(after)==(22,700),tuple(after)
            save.rollback()

    def test_01_legacy_history_and_no_live_activation(self):
        with engine.connect() as c:
            self.assertEqual(c.execute(text("SELECT COUNT(*) FROM public.users")).scalar_one(),12)
            self.assertEqual(c.execute(text("SELECT COUNT(*) FROM public.withdrawals")).scalar_one(),22)
            self.assertEqual(c.execute(text("SELECT COUNT(*) FROM public.conversions")).scalar_one(),25)
            self.assertEqual(c.execute(text("SELECT COUNT(*) FROM public.clicks")).scalar_one(),700)
            self.assertEqual(c.execute(text("SELECT balance FROM public.users WHERE telegram_id=:u"),{"u":ADMIN}).scalar_one(),Decimal("833.48"))
            self.assertEqual(c.execute(text("SELECT COUNT(*) FROM public.cpa_ledger")).scalar_one(),0)
            with self.assertRaises(RealFinanceDisabled):
                real_withdrawable(c,ADMIN)
        blocked=create_real_withdrawal(engine,partner_code=USER_CODE,
                amount="50.00",payment_method="TEST",wallet="synthetic")
        self.assertFalse(blocked["success"])
        self.assertFalse(mark_real_paid(engine,1)["success"])

    def test_01a_pre_activation_balance_and_history_api(self):
        with patch("access_guard.verified_telegram_id",return_value=ADMIN):
            client=TestClient(app)
            balance=client.get(f"/balance/{ADMIN}")
            self.assertEqual(balance.status_code,200)
            self.assertEqual(balance.json()["available"],0.0)
            self.assertEqual(balance.json()["historical_balance"],833.48)
            self.assertEqual(balance.json()["real_withdrawable"],0.0)
            self.assertFalse(balance.json()["real_finance_active"])
            self.assertFalse(balance.json()["real_finance_available"])
            history=client.get(f"/withdrawals/{USER_CODE}")
            admin_history=client.get("/admin/withdrawals")
            self.assertEqual(len(history.json()["withdrawals"]),22)
            self.assertEqual(len(admin_history.json()["withdrawals"]),22)
            pairs={p["id"]:p for p in admin_history.json()["withdrawals"]}
            for item in history.json()["withdrawals"]:
                self.assertIs(item["is_real_finance"],False)
                self.assertEqual(item["is_real_finance"],pairs[item["id"]]["is_real_finance"])
                self.assertEqual(item["status"],pairs[item["id"]]["status"])

    def test_02_cutover_immutable_and_no_old_finance(self):
        # CI-only synthetic time travel to exercise 240h maturity without waiting.
        with engine.begin() as c:
            c.execute(text("""UPDATE public.cpa_finance_epoch SET activated_at=:started,
               legacy_max_withdrawal_id=22,legacy_max_click_row_id=700
               WHERE id=1"""),{"started":T0})
        with engine.connect() as c:
            self.assertEqual(real_withdrawable(c,ADMIN),Decimal("0.00"))
        with self.assertRaises(DBAPIError):
            with engine.begin() as c:
                c.execute(text("UPDATE public.cpa_finance_epoch SET legacy_max_click_row_id=0"))
        with self.assertRaises(DBAPIError):
            with engine.begin() as c:
                c.execute(text("""UPDATE public.withdrawals SET cpa_real_epoch_at=now()
                    WHERE id=1"""))
        self.assertFalse(mark_real_paid(engine,1)["success"])
        self.assertFalse(mark_real_rejected(engine,3)["success"])

    @classmethod
    def credit_real_conversion(cls,suffix, gross="100.00", correction=False):
        new_id=uuid.uuid4()
        with engine.begin() as c:
            click=f"new-click-{suffix}"
            c.execute(text("""INSERT INTO public.clicks(user_id,partner_code,click_id)
                VALUES(:uid,:code,:click)"""),
                {"uid":ADMIN,"code":USER_CODE,"click":click})
            c.execute(text("""INSERT INTO public.conversions
                (id,click_id,user_id,offer_id,payout_gross,payout_net,status,
                 currency,is_test,finance_eligible_at,finance_approved_at)
                VALUES(:id,:click,:uid,'new-real',:gross,0,'approved',
                       'USD',FALSE,:eligible,:approved)"""),
                {"id":new_id,"click":click,"uid":ADMIN,"gross":gross,
                 "eligible":T0+timedelta(days=1),
                 "approved":T0+timedelta(days=2)})
            res=post_approved_hold(c,new_id)
            assert res["credited"] is True
            c.execute(text("""
              INSERT INTO public.cpa_network_receipts(conversion_id,
                settlement_reference,verification_source,evidence_reference,
                received_gross,received_at,verified_by)
              VALUES (:id,:ref,'bank_verified',:proof,:gross,
                clock_timestamp(),:admin)
            """),{"id":new_id,"ref":"CI-SETTLED-"+str(new_id),
                  "proof":"CI-bank-evidence-"+str(new_id),
                  "gross":Decimal(gross),"admin":ADMIN})
            entries=ledger_events_for_conversion(c,new_id)
            hold=next(x for x in entries if x["operation_type"]=="hold_credit")
            c.execute(text("""INSERT INTO public.cpa_ledger
                 (conversion_id,user_id,operation_type,event_key,amount,currency,
                  hold_delta,balance_delta,platform_fee_delta,original_entry_id,actor_type)
                 VALUES(:id,:uid,'hold_release',:key,:amount,'USD',
                        :debit,:amount,0,:origin,'scheduler')"""),
                {"id":new_id,"uid":ADMIN,"key":f"release:{new_id}",
                 "amount":hold["amount"],"debit":-hold["amount"],"origin":hold["id"]})
            c.execute(text("""UPDATE public.users SET hold=hold-:amount,
                  balance=balance+:amount WHERE telegram_id=:uid"""),
                {"amount":hold["amount"],"uid":ADMIN})
            cls.conv_ids[suffix]=(new_id,hold)
        return res

    def test_03_net_20_80_hold_and_repeat(self):
        res=self.credit_real_conversion("first")
        self.assertEqual((res["gross"],res["fee"],res["net"]),
                         (Decimal("100.00"),Decimal("20.00"),Decimal("80.00")))
        first_id=self.conv_ids["first"][0]
        with engine.begin() as c:
            self.assertFalse(post_approved_hold(c,first_id)["credited"])
            self.assertEqual(len(ledger_events_for_conversion(c,first_id)),3)
            self.assertEqual(real_withdrawable(c,ADMIN),Decimal("80.00"))
            hold=self.conv_ids["first"][1]
            self.assertEqual(hold["hold_until"]-hold["approved_at"],timedelta(hours=240))

    def test_04_concurrent_claims_never_double_reserve(self):
        def one():
            return create_real_withdrawal(engine,partner_code=USER_CODE,
                amount="50.00",payment_method="TEST",wallet="synthetic")
        with concurrent.futures.ThreadPoolExecutor(max_workers=12) as pool:
            answers=list(pool.map(lambda i: one(),range(12)))
        made=[r for r in answers if r["success"]]
        self.assertEqual(len(made),1,answers)
        self.__class__.first_request=made[0]["withdrawal_id"]
        with engine.connect() as c:
            self.assertEqual(real_withdrawable(c,ADMIN),Decimal("30.00"))
            self.assertEqual(c.execute(text("""SELECT count(*) FROM public.withdrawals
                WHERE cpa_real_epoch_at IS NOT NULL""")).scalar_one(),1)

    def test_05_admin_paid_twice_and_historical_denied(self):
        wid=self.first_request
        paid=mark_real_paid(engine,wid,admin_uid=ADMIN,
            transfer_reference="CI-TRANSFER-TEST-0001",
            evidence_reference="CI-PAYOUT-PROOF-0001",
            transferred_at=datetime.now(timezone.utc).isoformat())
        self.assertTrue(paid["success"],paid)
        self.assertFalse(mark_real_paid(engine,wid,admin_uid=ADMIN,
            transfer_reference="CI-TRANSFER-TEST-0001",
            evidence_reference="CI-PAYOUT-PROOF-0001",
            transferred_at=datetime.now(timezone.utc).isoformat())["success"])
        self.assertFalse(mark_real_rejected(engine,wid)["success"])
        self.assertEqual(paid["amount"],50.0)
        with engine.connect() as c:
            self.assertEqual(real_withdrawable(c,ADMIN),Decimal("30.00"))
            self.assertEqual(c.execute(text("SELECT withdrawn FROM public.users WHERE telegram_id=:uid"),{"uid":ADMIN}).scalar_one(),Decimal("450.00"))
            self.assertEqual(c.execute(text("SELECT count(*) FROM public.withdrawals WHERE cpa_real_epoch_at IS NULL")).scalar_one(),22)
            self.assertTrue(c.execute(text("SELECT relrowsecurity FROM pg_class WHERE oid='public.withdrawals'::regclass")).scalar_one())
            for role in ("anon","authenticated"):
                self.assertFalse(c.execute(text("SELECT has_table_privilege(:role,'public.withdrawals','SELECT')"),{"role":role}).scalar_one())
                self.assertFalse(c.execute(text("SELECT has_sequence_privilege(:role,'public.withdrawals_id_seq','USAGE')"),{"role":role}).scalar_one())

    def test_06_reject_resets_claim_only_once(self):
        self.credit_real_conversion("second")
        request=create_real_withdrawal(engine,partner_code=USER_CODE,
            amount="50.00",payment_method="TEST",wallet="synthetic")
        self.assertTrue(request["success"])
        wid=request["withdrawal_id"]
        self.assertTrue(mark_real_rejected(engine,wid)["success"])
        self.assertFalse(mark_real_rejected(engine,wid)["success"])
        self.assertFalse(mark_real_paid(engine,wid)["success"])
        with engine.connect() as c:
            self.assertEqual(real_withdrawable(c,ADMIN),Decimal("110.00"))
        with engine.begin() as c:
            self.assertFalse(post_approved_hold(c,self.conv_ids["second"][0])["credited"])

    def test_07_reversal_blocks_new_claims_and_unsafe_paid(self):
        before=create_real_withdrawal(engine,partner_code=USER_CODE,
            amount="100.00",payment_method="TEST",wallet="synthetic")
        self.assertTrue(before["success"])
        src_id,hold=self.conv_ids["second"]
        with engine.begin() as c:
            release=next(x for x in ledger_events_for_conversion(c,src_id)
                         if x["operation_type"]=="hold_release")
            c.execute(text("""INSERT INTO public.cpa_ledger(
                conversion_id,user_id,operation_type,event_key,amount,currency,
                hold_delta,balance_delta,platform_fee_delta,original_entry_id,
                actor_type,actor_id,reason_code)
                VALUES(:id,:uid,'balance_reversal',:key,:amount,'USD',
                       0,:negative,0,:origin,'admin',:actor,'synthetic-test')"""),
                {"id":src_id,"uid":ADMIN,"key":f"reverse:{src_id}",
                 "amount":release["amount"],"negative":-release["amount"],
                 "origin":release["id"],"actor":ADMIN})
        self.assertFalse(mark_real_paid(engine,before["withdrawal_id"])["success"])
        self.assertFalse(create_real_withdrawal(engine,partner_code=USER_CODE,
            amount="50.00",payment_method="TEST",wallet="synthetic")["success"])
        self.assertTrue(mark_real_rejected(engine,before["withdrawal_id"])["success"])
        with engine.connect() as c:
            self.assertEqual(real_withdrawable(c,ADMIN),Decimal("30.00"))

    def test_08_routes_use_gate_and_no_auto_pay(self):
        with patch("access_guard.verified_telegram_id",return_value=ADMIN):
            client=TestClient(app)
            response=client.post("/withdrawals",json={
                "amount":833.48,"partner_code":USER_CODE,
                "payment_method":"TEST","wallet":"synthetic"})
            self.assertEqual(response.status_code,200)
            self.assertFalse(response.json()["success"])
            self.assertEqual(response.json()["message"],"Insufficient real CPA earnings")
            with patch("main.send_partner_notification",new=AsyncMock()), patch("main.verified_telegram_id",return_value=ADMIN):
                r=client.post("/admin/withdrawals/1/paid",json={
                    "external_transfer_id":"CI-HISTORY-FORBIDDEN-1",
                    "evidence_reference":"CI-HISTORY-PROOF-1",
                    "transferred_at":datetime.now(timezone.utc).isoformat()})
                self.assertFalse(r.json()["success"])
                self.assertIn("Historical",r.json()["message"])
        with engine.connect() as c:
            self.assertEqual(c.execute(text("SELECT count(*) FROM public.withdrawals WHERE cpa_real_epoch_at IS NULL")).scalar_one(),22)


    def test_09_failure_after_insert_rolls_back_all(self):
        # Simulate a DB failure AFTER the INSERT but BEFORE users.balance debit.
        self.credit_real_conversion("failure-injection")
        with engine.connect() as c:
            old_count=c.execute(text("SELECT count(*) FROM public.withdrawals")).scalar_one()
            old_balance=c.execute(text("SELECT balance FROM public.users WHERE telegram_id=:id"),
                {"id":ADMIN}).scalar_one()
            old_available=real_withdrawable(c,ADMIN)
        with engine.begin() as c:
            c.execute(text("""
                CREATE FUNCTION public.ci_fail_user_balance_debit() RETURNS trigger
                LANGUAGE plpgsql AS $$
                BEGIN
                    IF NEW.balance < OLD.balance THEN
                      RAISE EXCEPTION 'Simulated user debit failure';
                    END IF;
                    RETURN NEW;
                END $$;
            """))
            c.execute(text("""
                CREATE TRIGGER ci_fail_user_balance_debit BEFORE UPDATE
                ON public.users FOR EACH ROW
                EXECUTE FUNCTION public.ci_fail_user_balance_debit();
            """))
        try:
            with self.assertRaises(DBAPIError):
                create_real_withdrawal(engine,partner_code=USER_CODE,
                    amount="50.00",payment_method="TEST",wallet="synthetic")
        finally:
            with engine.begin() as c:
                c.execute(text("DROP TRIGGER ci_fail_user_balance_debit ON public.users"))
                c.execute(text("DROP FUNCTION public.ci_fail_user_balance_debit()"))
        with engine.connect() as c:
            self.assertEqual(c.execute(text("SELECT count(*) FROM public.withdrawals")).scalar_one(),old_count)
            self.assertEqual(c.execute(text("SELECT balance FROM public.users WHERE telegram_id=:id"),
                {"id":ADMIN}).scalar_one(),old_balance)
            self.assertEqual(real_withdrawable(c,ADMIN),old_available)

    def test_10_epoch_cannot_truncate(self):
        with self.assertRaises(DBAPIError):
            with engine.begin() as c:
                c.execute(text("TRUNCATE public.cpa_finance_epoch"))
        with engine.connect() as c:
            self.assertEqual(c.execute(text("SELECT COUNT(*) FROM public.cpa_finance_epoch")).scalar_one(),1)
            self.assertIsNotNone(epoch_row(c)["activated_at"])


    def test_11_recovery_pending_reserves_disputed_release(self):
        src, hold=self.conv_ids["failure-injection"]
        with engine.connect() as c:
            before=real_withdrawable(c,ADMIN)
            self.assertGreaterEqual(before,Decimal("80.00"))
        with engine.begin() as c:
            # Correction contract: user -> conversion -> originating ledger.
            lock_finance_scope(c,src)
            release=next(x for x in ledger_events_for_conversion(c,src)
                         if x["operation_type"]=="hold_release")
            c.execute(text("""
                INSERT INTO public.cpa_ledger
                 (conversion_id,user_id,operation_type,event_key,amount,currency,
                  hold_delta,balance_delta,platform_fee_delta,original_entry_id,
                  actor_type,actor_id,reason_code)
                VALUES (:cid,:uid,'recovery_pending',:key,:amt,'USD',
                         0,0,0,:source,'admin',:actor,'disputed-synthetic')
            """),{"cid":src,"uid":ADMIN,"key":f"recovery:{src}",
                  "amt":hold["amount"],"source":release["id"],"actor":ADMIN})
        with engine.connect() as c:
            self.assertEqual(real_withdrawable(c,ADMIN),before-Decimal("80.00"))
        rejected=create_real_withdrawal(engine,partner_code=USER_CODE,
                    amount="80.00",payment_method="TEST",wallet="synthetic")
        self.assertFalse(rejected["success"])

    def test_12_reversal_resolves_pending_without_double_discount(self):
        cid,_=self.conv_ids["failure-injection"]
        with engine.connect() as c:
            disputed=real_withdrawable(c,ADMIN)
        with engine.begin() as c:
            lock_finance_scope(c,cid)
            release=next(x for x in ledger_events_for_conversion(c,cid)
                         if x["operation_type"]=="hold_release")
            c.execute(text("""
                INSERT INTO public.cpa_ledger
                 (conversion_id,user_id,operation_type,event_key,amount,currency,
                  hold_delta,balance_delta,platform_fee_delta,original_entry_id,
                  actor_type,actor_id,reason_code)
                VALUES (:cid,:uid,'balance_reversal',:key,:amt,'USD',
                         0,:delta,0,:source,'admin',:actor,'confirmed-reversal')
            """),{"cid":cid,"uid":ADMIN,"key":f"confirmed-reversal:{cid}",
                  "amt":release["amount"],"delta":-release["amount"],
                  "source":release["id"],"actor":ADMIN})
        with engine.connect() as c:
            # recovery_pending no longer reserves on top of a full reversal.
            self.assertEqual(real_withdrawable(c,ADMIN),disputed)

    @classmethod
    def prepare_hold_only(cls,suffix,approval_time):
        cid=uuid.uuid4()
        with engine.begin() as c:
            c.execute(text("""
                INSERT INTO public.clicks(user_id,partner_code,click_id)
                VALUES(:uid,:code,:click)
            """),{"uid":ADMIN,"code":USER_CODE,"click":f"hold-only:{suffix}"})
            c.execute(text("""
                INSERT INTO public.conversions
                 (id,click_id,user_id,offer_id,payout_gross,payout_net,status,
                  currency,is_test,finance_eligible_at,finance_approved_at)
                VALUES (:cid,:click,:uid,'new-real',100,0,'approved',
                        'USD',FALSE,:eligible,:approved)
            """),{"cid":cid,"click":f"hold-only:{suffix}",
                  "uid":ADMIN,"eligible":T0+timedelta(days=1),
                  "approved":approval_time})
            post_approved_hold(c,cid)
            c.execute(text("""
              INSERT INTO public.cpa_network_receipts(conversion_id,
                settlement_reference,verification_source,evidence_reference,
                received_gross,received_at,verified_by)
              VALUES (:cid,:ref,'bank_verified',:proof,100.00,clock_timestamp(),:admin)
            """),{"cid":cid,"ref":"CI-HELD-SETTLEMENT-"+str(cid),
                 "proof":"CI-bank-statement-"+str(cid),"admin":ADMIN})
        return cid

    def test_13_future_hold_release_contract_and_idempotency(self):
        cid=self.prepare_hold_only("mature",T0+timedelta(days=3))
        with engine.connect() as c:
            before=real_withdrawable(c,ADMIN)
        def release():
            with engine.begin() as c:
                return release_matured_hold_contract(c,cid)["released"]
        with concurrent.futures.ThreadPoolExecutor(max_workers=8) as pool:
            outcomes=list(pool.map(lambda _:release(),range(8)))
        self.assertEqual(outcomes.count(True),1,outcomes)
        with engine.connect() as c:
            self.assertEqual(real_withdrawable(c,ADMIN),before+Decimal("80.00"))
            self.assertEqual(c.execute(text("""
                SELECT count(*) FROM public.cpa_ledger
                WHERE conversion_id=:cid AND operation_type='hold_release'
            """),{"cid":cid}).scalar_one(),1)
        self.__class__.contract_cid=cid

    def test_14_concurrent_release_claim_and_replay_never_overreserves(self):
        cid=self.prepare_hold_only("race",T0+timedelta(days=3))
        def release_once():
            with engine.begin() as c:
                return release_matured_hold_contract(c,cid)["released"]
        def claim():
            return create_real_withdrawal(engine,partner_code=USER_CODE,
                    amount="50.00",payment_method="TEST",wallet="synthetic")
        with concurrent.futures.ThreadPoolExecutor(max_workers=12) as pool:
            future_release=pool.submit(release_once)
            claims=list(pool.map(lambda _:claim(),range(11)))
            self.assertTrue(future_release.result())
        with engine.connect() as c:
            available=real_withdrawable(c,ADMIN)
            self.assertGreaterEqual(available,Decimal("0.00"))
            self.assertLess(available,Decimal("50.00"))
            self.assertEqual(c.execute(text("""
                SELECT count(*) FROM public.cpa_ledger
                WHERE conversion_id=:cid AND operation_type='hold_release'
            """),{"cid":cid}).scalar_one(),1)
        self.assertLessEqual(sum(x["success"] for x in claims),5)

    def test_15_immature_release_refused_and_rolled_back(self):
        cid=self.prepare_hold_only("immature",datetime.now(timezone.utc))
        with engine.connect() as c:
            before=real_withdrawable(c,ADMIN)
            hold_before=c.execute(text(
                "SELECT hold FROM public.users WHERE telegram_id=:uid"
            ),{"uid":ADMIN}).scalar_one()
        with self.assertRaises(DBAPIError):
            with engine.begin() as c:
                release_matured_hold_contract(c,cid)
        with engine.connect() as c:
            self.assertEqual(real_withdrawable(c,ADMIN),before)
            self.assertEqual(c.execute(text(
                "SELECT hold FROM public.users WHERE telegram_id=:uid"
            ),{"uid":ADMIN}).scalar_one(),hold_before)
            self.assertEqual(c.execute(text("""
                SELECT count(*) FROM public.cpa_ledger
                WHERE conversion_id=:cid AND operation_type='hold_release'
            """),{"cid":cid}).scalar_one(),0)

    def test_16_real_finance_balance_projection_when_active(self):
        with patch("access_guard.verified_telegram_id",return_value=ADMIN):
            client=TestClient(app)
            resp=client.get(f"/balance/{ADMIN}")
            self.assertEqual(resp.status_code,200)
            payload=resp.json()
            self.assertTrue(payload["real_finance_active"])
            self.assertTrue(payload["real_finance_available"])
            with engine.connect() as c:
                entitled=real_withdrawable(c,ADMIN)
                balance=c.execute(text("""
                  SELECT balance FROM public.users WHERE telegram_id=:id
                """),{"id":ADMIN}).scalar_one()
            from cpa_real_withdrawals import funded_withdrawable
            with engine.connect() as c:
                cash=funded_withdrawable(c,ADMIN)
            self.assertAlmostEqual(payload["real_withdrawable"],
                float(min(entitled,balance)),places=2)
            self.assertGreaterEqual(payload["available"],payload["real_withdrawable"])


if __name__=="__main__":
    unittest.main()
