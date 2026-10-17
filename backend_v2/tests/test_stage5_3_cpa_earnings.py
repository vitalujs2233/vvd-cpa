"""Stage 5.3 end-to-end finance integration. Disposable PostgreSQL 17 ONLY.

No production credentials, network transfers, real external payment or scheduler.
The 240-hour maturity cases seed historical approval timestamps only in CI
because a 10-day real-time wait is not a useful integration test.
"""
import concurrent.futures
import hashlib
import json
import os
import sys
import unittest
import uuid
from datetime import datetime,timedelta,timezone
from decimal import Decimal
from pathlib import Path
from unittest.mock import patch
from fastapi.testclient import TestClient
from sqlalchemy import text
from sqlalchemy.exc import DBAPIError

ROOT=Path(__file__).resolve().parents[1]
sys.path.insert(0,str(ROOT))
if "postgres:postgres@127.0.0.1:5432/cpa_withdrawals_isolated" not in os.environ.get("DATABASE_URL",""):
    raise RuntimeError("Stage 5.3 tests ONLY run on disposable PostgreSQL 17")
import test_stage5_real_withdrawals as base_fixture
from database import engine
from main import app
from cpa_finance import post_approved_hold, ledger_events_for_conversion
from cpa_real_withdrawals import real_withdrawable,release_matured_holds,release_matured_hold_contract

UID=base_fixture.ADMIN
CODE=base_fixture.USER_CODE
EPOCH=base_fixture.T0
SECRET="synthetic-only-ci-not-real-provider-secret"
client=TestClient(app)


class CPAStage53Integration(unittest.TestCase):
    @classmethod
    def setUpClass(cls):
        # Reuse existing 12/22/25/700 PR23 fixture, then add only Stage 4
        # network metadata; all tests run in isolated PostgreSQL 17.
        base_fixture.Stage5RealWithdrawalsTests.setUpClass()
        cls.last_click=700
        cls.click_tags={}
        with engine.begin() as c:
            c.execute(text("""CREATE TABLE public.offers(
                id VARCHAR(80) PRIMARY KEY,title TEXT NOT NULL,
                smartlink_suffix TEXT NOT NULL DEFAULT '')"""))
            stage2=(ROOT/"migrations/20261016_stage2_catalog.sql").read_text()
            stage2="\n".join(s for s in stage2.splitlines()
                              if not s.lstrip().startswith("REVOKE "))
            c.connection.cursor().execute(stage2)
            c.execute(text("ALTER TABLE public.clicks ADD COLUMN vertical VARCHAR(100) NOT NULL DEFAULT 'utilities'"))
            c.execute(text("ALTER TABLE public.clicks ADD COLUMN offer_id VARCHAR(80)"))
            c.execute(text("ALTER TABLE public.clicks ADD COLUMN network_id BIGINT"))
            c.execute(text("ALTER TABLE public.clicks ADD COLUMN created_at TIMESTAMP NOT NULL DEFAULT now()"))
            c.execute(text("ALTER TABLE public.conversions ADD COLUMN processed_at TIMESTAMPTZ"))
            stage4=(ROOT/"migrations/20261016_stage4_postback.sql").read_text()
            stage4="\n".join(s for s in stage4.splitlines()
                              if not s.lstrip().startswith("REVOKE "))
            c.connection.cursor().execute(stage4)
            c.execute(text("""INSERT INTO public.cpa_verticals(slug,title,is_active)
               VALUES('utilities','Utilities',TRUE) ON CONFLICT DO NOTHING"""))
            cls.network=c.execute(text("""INSERT INTO public.cpa_networks(
              name,is_active,postback_enabled,postback_key_hash)
              VALUES('Stage53 CI',TRUE,TRUE,:sha) RETURNING id"""),
              {"sha":hashlib.sha256(SECRET.encode()).hexdigest()}).scalar_one()
            c.execute(text("""INSERT INTO public.offers(id,title,vertical_slug,
                network_id,status) VALUES('stage53','Synthetic', 'utilities',:network,'published')"""),
                {"network":cls.network})
            c.execute(text("""UPDATE public.cpa_finance_epoch
              SET activated_at=:t,legacy_max_withdrawal_id=22,
                  legacy_max_click_row_id=700 WHERE id=1"""),{"t":EPOCH})
            cls.original_history=tuple(c.execute(text(x)).scalar_one() for x in (
              "SELECT count(*) FROM users","SELECT count(*) FROM withdrawals",
              "SELECT count(*) FROM conversions WHERE finance_eligible_at IS NULL",
              "SELECT count(*) FROM clicks WHERE id<=700",
              "SELECT count(*) FROM withdrawals WHERE cpa_real_epoch_at IS NOT NULL"))
        assert cls.original_history==(12,22,25,700,0),cls.original_history

    @classmethod
    def add_click(cls, name, *, old=False):
        if old:
            return "legacy-click-1"
        click=f"stage53-{name}-{uuid.uuid4().hex[:10]}"
        with engine.begin() as c:
            c.execute(text("""INSERT INTO public.clicks(
              user_id,partner_code,click_id,vertical,offer_id,network_id)
              VALUES(:uid,:code,:click,'utilities','stage53',:net)"""),
              {"uid":UID,"code":CODE,"click":click,"net":cls.network})
        return click

    @classmethod
    def send(cls, click, status="pending", *, transaction=None, gross="100.00",
             currency="USD", key=SECRET):
        return client.post(f"/cpa/postback/{cls.network}",json={
            "click_id":click,"transaction_id":transaction or ("txn-"+click),
            "status":status,"amount":gross,"currency":currency},
            headers={"X-VVD-Postback-Key":key})

    @classmethod
    def row(cls,click):
        with engine.connect() as c:
            return c.execute(text("""SELECT id,status,payout_net,finance_eligible_at,
                finance_approved_at FROM conversions WHERE click_id=:click"""),
                {"click":click}).mappings().first()

    def test_01_old_history_remains_untouched(self):
        with engine.connect() as c:
            stats=tuple(c.execute(text(q)).scalar_one() for q in (
              "SELECT count(*) FROM public.users",
              "SELECT count(*) FROM public.withdrawals",
              "SELECT count(*) FROM public.conversions WHERE finance_eligible_at IS NULL",
              "SELECT count(*) FROM public.clicks WHERE id<=700",
              "SELECT count(*) FROM public.withdrawals WHERE cpa_real_epoch_at IS NOT NULL"))
            self.assertEqual(stats,self.original_history)
            self.assertEqual(c.execute(text(
              "SELECT balance FROM users WHERE telegram_id=:uid"),{"uid":UID}).scalar_one(),Decimal("833.48"))

    def test_02_postback_pending_to_approved_20_80(self):
        click=self.add_click("approval")
        self.__class__.first_click=click
        resp=self.send(click,"pending",gross="100.01")
        self.assertEqual(resp.status_code,200,resp.text)
        self.assertTrue(resp.json()["created"])
        with engine.connect() as c:
            row=self.row(click)
            self.assertIsNotNone(row["finance_eligible_at"])
            self.assertIsNone(row["finance_approved_at"])
            self.assertEqual(c.execute(text(
              "SELECT count(*) FROM public.cpa_ledger")).scalar_one(),0)
        resp=self.send(click,"approved",gross="100.01")
        self.assertEqual(resp.status_code,200,resp.text)
        self.assertTrue(resp.json()["hold_credited"])
        row=self.row(click)
        self.assertEqual(row["payout_net"],Decimal("80.01"))
        with engine.connect() as c:
            ev=ledger_events_for_conversion(c,row["id"])
            self.assertEqual({x["operation_type"] for x in ev},
                             {"hold_credit","platform_fee_accrual"})
            self.assertEqual(next(x["amount"] for x in ev if x["operation_type"]=="hold_credit"),Decimal("80.01"))
            self.assertEqual(next(x["amount"] for x in ev if x["operation_type"]=="platform_fee_accrual"),Decimal("20.00"))
            self.assertEqual(c.execute(text("SELECT hold FROM users WHERE telegram_id=:uid"),
                 {"uid":UID}).scalar_one(),Decimal("80.01"))
            self.assertEqual(real_withdrawable(c,UID),Decimal("0.00"))

    def test_03_approved_on_first_postback_and_replay(self):
        click=self.add_click("instant")
        self.__class__.second_click=click
        response=self.send(click,"approved",gross="0.03")
        self.assertEqual(response.status_code,200,response.text)
        self.assertTrue(response.json()["hold_credited"])
        for _ in range(3):
            replay=self.send(click,"approved",gross="0.03")
            self.assertEqual(replay.status_code,200,replay.text)
            self.assertTrue(replay.json()["duplicate"])
        row=self.row(click)
        self.assertEqual(row["payout_net"],Decimal("0.02"))
        with engine.connect() as c:
            self.assertEqual(len(ledger_events_for_conversion(c,row["id"])),2)
            self.assertEqual(c.execute(text("SELECT hold FROM users WHERE telegram_id=:uid"),
                 {"uid":UID}).scalar_one(),Decimal("80.03"))

    def test_04_old_click_even_after_epoch_does_not_credit(self):
        # Old click has a different (historical) user attribution schema but
        # remains in the database. No finance eligibility can be backfilled.
        click=self.add_click("old",old=True)
        response=self.send(click,"approved",transaction="old-conversion",gross="10")
        self.assertEqual(response.status_code,404) # old click has no attributed network/offer
        with engine.connect() as c:
            self.assertEqual(c.execute(text("""SELECT count(*) FROM conversions
               WHERE finance_eligible_at IS NULL""")).scalar_one(),25)

    def test_05_test_postback_has_zero_finance(self):
        click=self.add_click("test")
        with engine.begin() as c:
            provider=c.execute(text("""SELECT id,postback_key_hash,postback_params,
                 postback_status_map FROM public.cpa_networks WHERE id=:id"""),
                 {"id":self.network}).mappings().one()
            from cpa_postback import _accept
            raw=json.dumps({"click_id":click,"transaction_id":"test-"+click,
                 "status":"pending","amount":"0.00","currency":"USD"}).encode()
            ans=_accept(c,provider,raw,SECRET,self.network,is_test=True)
            self.assertTrue(ans["created"])
        with engine.connect() as c:
            row=self.row(click)
            self.assertIsNone(row["finance_eligible_at"])
            self.assertEqual(len(ledger_events_for_conversion(c,row["id"])),0)

    def test_06_rejected_never_credits(self):
        click=self.add_click("rejected")
        first=self.send(click,"pending",gross="50.00")
        self.assertEqual(first.status_code,200,first.text)
        second=self.send(click,"rejected",gross="50.00")
        self.assertEqual(second.status_code,200,second.text)
        with engine.connect() as c:
            row=self.row(click)
            self.assertEqual(row["status"],"rejected")
            self.assertEqual(len(ledger_events_for_conversion(c,row["id"])),0)

    def test_07_bad_auth_and_currency_fail_closed(self):
        click=self.add_click("currency")
        self.assertEqual(self.send(click,"approved",key="badkey").status_code,401)
        self.assertEqual(self.send(click,"pending").status_code,200)
        rejected=self.send(click,"approved",gross="100",currency="EUR")
        self.assertEqual(rejected.status_code,409,rejected.text)
        self.assertEqual(self.row(click)["status"],"pending")

    def test_08_duplicate_confirmations_concurrent(self):
        click=self.add_click("parallel")
        self.assertEqual(self.send(click,"pending").status_code,200)
        with concurrent.futures.ThreadPoolExecutor(max_workers=6) as pool:
            responses=list(pool.map(lambda _:self.send(click,"approved"),range(6)))
        self.assertEqual(sum(r.json().get("hold_credited",False) for r in responses),1)
        self.assertTrue(all(r.status_code==200 for r in responses))
        with engine.connect() as c:
            self.assertEqual(len(ledger_events_for_conversion(c,self.row(click)["id"])),2)

    def test_09_postback_failure_rolls_back_approval_and_hold(self):
        click=self.add_click("failure")
        self.assertEqual(self.send(click,"pending").status_code,200)
        with engine.begin() as c:
            c.execute(text("""CREATE FUNCTION ci_stage53_fail_hold()
              RETURNS trigger LANGUAGE plpgsql AS $$
              BEGIN
                IF NEW.hold>OLD.hold THEN
                   RAISE EXCEPTION 'synthetic hold write failure';
                END IF;
                RETURN NEW;
              END $$"""))
            c.execute(text("""CREATE TRIGGER ci_stage53_fail_hold
              BEFORE UPDATE ON public.users FOR EACH ROW
              EXECUTE FUNCTION ci_stage53_fail_hold()"""))
        try:
            with self.assertRaises(DBAPIError):
                self.send(click,"approved")
        finally:
            with engine.begin() as c:
                c.execute(text("DROP TRIGGER ci_stage53_fail_hold ON public.users"))
                c.execute(text("DROP FUNCTION ci_stage53_fail_hold()"))
        self.assertEqual(self.row(click)["status"],"pending")
        with engine.connect() as c:
            self.assertEqual(len(ledger_events_for_conversion(c,self.row(click)["id"])),0)
        success=self.send(click,"approved")
        self.assertEqual(success.status_code,200,success.text)

    @classmethod
    def seed_matured(cls,tag):
        click=cls.add_click("matured-"+tag)
        cid=uuid.uuid4()
        with engine.begin() as c:
            c.execute(text("""INSERT INTO public.conversions(
               id,click_id,user_id,offer_id,payout_gross,payout_net,status,
               currency,is_test,finance_eligible_at,finance_approved_at)
               VALUES(:cid,:click,:uid,'stage53',100.00,0,'approved','USD',FALSE,
                      :eligible,:approved)"""),
                {"cid":cid,"click":click,"uid":UID,
                 "eligible":EPOCH+timedelta(hours=1),
                 "approved":EPOCH+timedelta(days=2)})
            credit=post_approved_hold(c,cid)
            assert credit["credited"]
        return cid

    def test_10_maturity_240_hours_and_real_withdrawable(self):
        # Conversion was created after cutover in isolated CI; approval is
        # backdated to simulate the full DB-enforced 240 hours.
        cid=self.seed_matured("one")
        with engine.connect() as c:
            baseline=real_withdrawable(c,UID)
        result=release_matured_holds(engine,limit=100)
        self.assertGreaterEqual(result["released"],1)
        with engine.connect() as c:
            events=ledger_events_for_conversion(c,cid)
            self.assertEqual(len([e for e in events if e["operation_type"]=="hold_release"]),1)
            self.assertGreaterEqual(real_withdrawable(c,UID),baseline+Decimal("80.00"))
        self.assertEqual(release_matured_holds(engine,limit=100)["released"],0)

    def test_11_multiple_workers_do_not_double_release(self):
        cid=self.seed_matured("concurrent")
        with concurrent.futures.ThreadPoolExecutor(max_workers=7) as pool:
            outcomes=list(pool.map(lambda _:release_matured_holds(engine,limit=3),range(7)))
        self.assertEqual(sum(r["released"] for r in outcomes),1)
        with engine.connect() as c:
            self.assertEqual(len([e for e in ledger_events_for_conversion(c,cid)
                     if e["operation_type"]=="hold_release"]),1)

    def test_12_no_early_release_and_disputes_fail_closed(self):
        # Existing postback approval from test_02 was recent, so the DB
        # trigger prevents a release even if an operator calls it early.
        cid=self.row(self.first_click)["id"]
        with self.assertRaises(DBAPIError):
            with engine.begin() as c:
                release_matured_hold_contract(c,cid)
        with engine.connect() as c:
            self.assertFalse(any(x["operation_type"]=="hold_release"
                for x in ledger_events_for_conversion(c,cid)))
            released=real_withdrawable(c,UID)
        # Mark a synthetic matured release as disputed: real withdrawal must
        # decrease until the correction is explicitly resolved.
        with engine.begin() as c:
            c.execute(text("SELECT 1 FROM users WHERE telegram_id=:id FOR UPDATE"),{"id":UID})
            release=c.execute(text("""SELECT id,conversion_id,amount FROM cpa_ledger
               WHERE operation_type='hold_release' ORDER BY created_at LIMIT 1
               FOR UPDATE""")).mappings().one()
            c.execute(text("""INSERT INTO public.cpa_ledger
              (conversion_id,user_id,operation_type,event_key,amount,currency,
               hold_delta,balance_delta,platform_fee_delta,original_entry_id,
               actor_type,actor_id,reason_code)
              VALUES (:cid,:uid,'recovery_pending',:key,:amt,'USD',0,0,0,
               :original,'admin',:uid,'synthetic-dispute')"""),
               {"cid":release["conversion_id"],"uid":UID,"amt":release["amount"],
                "original":release["id"],"key":"stage53-dispute-"+uuid.uuid4().hex})
        with engine.connect() as c:
            self.assertEqual(real_withdrawable(c,UID),released-Decimal("80.00"))

    def test_13_activation_keeps_legacy_records_out(self):
        with engine.connect() as c:
            self.assertEqual(c.execute(text("""SELECT count(*)
              FROM conversions WHERE finance_eligible_at IS NULL""")).scalar_one(),26)
            self.assertEqual(c.execute(text("""SELECT count(*)
              FROM withdrawals WHERE cpa_real_epoch_at IS NOT NULL""")).scalar_one(),0)
            self.assertEqual(c.execute(text("SELECT count(*) FROM users")).scalar_one(),12)
            self.assertEqual(c.execute(text("SELECT count(*) FROM withdrawals")).scalar_one(),22)


if __name__=="__main__":
    unittest.main()
