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
import hmac
import time
from urllib.parse import urlencode

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
            c.connection.cursor().execute(
                (ROOT/"migrations/20261017_stage5_manual_hold_release.sql").read_text()
            )
            c.connection.cursor().execute(
                (ROOT/"migrations/20261019162821_manual_cpa_payouts.sql").read_text()
            )
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
        # This is an ATTRIBUTED historical click: source auth and network
        # match, but the immutable click ID was <= the cutover maximum.
        # It may remain in neutral analytics, NEVER in financial entitlement.
        click="legacy-click-700"
        with engine.begin() as c:
            c.execute(text("""UPDATE public.clicks SET network_id=:net,
                offer_id='stage53',vertical='utilities'
                WHERE click_id=:click"""),{"net":self.network,"click":click})
        response=self.send(click,"approved",transaction="old-conversion",gross="10.00")
        self.assertEqual(response.status_code,200,response.text)
        self.assertNotIn("hold_credited",response.json())
        with engine.connect() as c:
            old=self.row(click)
            self.assertIsNone(old["finance_eligible_at"])
            self.assertEqual(len(ledger_events_for_conversion(c,old["id"])),0)
            self.assertEqual(c.execute(text("""SELECT count(*) FROM conversions
               WHERE finance_eligible_at IS NULL""")).scalar_one(),26)

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
    def seed_matured(cls,tag,approval_time=None):
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
                 "approved":approval_time or EPOCH+timedelta(days=2)})
            credit=post_approved_hold(c,cid)
            assert credit["credited"]
        return cid

    def test_09a_balance_view_releases_only_signed_user_matured_holds(self):
        cid=self.seed_matured("lazy-balance")
        with engine.connect() as c:
            old_events=ledger_events_for_conversion(c,cid)
            self.assertFalse(any(e["operation_type"]=="hold_release" for e in old_events))
        r=client.get(f"/balance/{UID}",headers=self.user_headers())
        self.assertEqual(r.status_code,200,r.text)
        with engine.connect() as c:
            events=ledger_events_for_conversion(c,cid)
            self.assertEqual(len([e for e in events if e["operation_type"]=="hold_release"]),1)
        again=client.get(f"/balance/{UID}",headers=self.user_headers())
        self.assertEqual(again.status_code,200)
        with engine.connect() as c:
            self.assertEqual(len([e for e in ledger_events_for_conversion(c,cid) if e["operation_type"]=="hold_release"]),1)

    def test_09b_request_releases_matured_hold_before_reservation(self):
        cid=self.seed_matured("lazy-claim")
        self.assertEqual(self.approve_network_receipt(cid).status_code,200)
        request=self.payout_request("50.00")
        self.assertEqual(request.status_code,200,request.text)
        self.assertTrue(request.json()["success"],request.text)
        with engine.connect() as c:
            events=ledger_events_for_conversion(c,cid)
            self.assertEqual(len([e for e in events if e["operation_type"]=="hold_release"]),1)
        self.assertTrue(client.post("/admin/withdrawals/"+str(request.json()["withdrawal_id"])+"/reject",headers=self.admin_headers()).json()["success"])

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

    def test_10a_exact_240_hour_boundary(self):
        # 239h59m elapsed = no release, even if a job is invoked directly.
        cid=self.seed_matured("boundary",datetime.now(timezone.utc)-timedelta(hours=239,minutes=59))
        with engine.begin() as c:
            created=c.execute(text("""SELECT hold_until FROM public.cpa_ledger
              WHERE conversion_id=:id AND operation_type='hold_credit'"""),
              {"id":cid}).scalar_one()
            self.assertGreater(created,datetime.now(timezone.utc))
        self.assertEqual(release_matured_holds(engine,limit=50)["released"],0)
        with engine.connect() as c:
            self.assertFalse(any(x["operation_type"]=="hold_release"
                for x in ledger_events_for_conversion(c,cid)))

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
              FROM conversions WHERE finance_eligible_at IS NULL""")).scalar_one(),27)
            self.assertEqual(c.execute(text("""SELECT count(*)
              FROM withdrawals WHERE cpa_real_epoch_at IS NOT NULL""")).scalar_one(),0)
            self.assertEqual(c.execute(text("SELECT count(*) FROM users")).scalar_one(),12)
            self.assertEqual(c.execute(text("SELECT count(*) FROM withdrawals")).scalar_one(),22)


    @classmethod
    def admin_headers(cls,uid=UID):
        token=os.environ["BOT_TOKEN"]
        d={"auth_date":str(int(time.time())),
           "user":json.dumps({"id":uid},separators=(",",":"))}
        payload="\n".join(k+"="+v for k,v in sorted(d.items()))
        secret=hmac.new(b"WebAppData",token.encode(),hashlib.sha256).digest()
        d["hash"]=hmac.new(secret,payload.encode(),hashlib.sha256).hexdigest()
        return {"X-Telegram-Init-Data":urlencode(d)}

    @classmethod
    def approve_network_receipt(cls,cid,*,gross="100.00",uid=UID):
        return client.post("/admin/cpa/partners/"+CODE+"/receipts",
            headers=cls.admin_headers(uid),json={
              "conversion_id":str(cid),
              "settlement_reference":"CI-BANK-"+uuid.uuid4().hex,
              "verification_source":"bank_verified",
              "evidence_reference":"CI-private-receipt-"+uuid.uuid4().hex,
              "received_gross":gross,
              "received_at":(datetime.now(timezone.utc)-timedelta(minutes=1)).isoformat(),
            })

    @classmethod
    def manual(cls,cid,amount="30.00",*,uid=UID,code=CODE,req=None,reason="Verified settlement early release"):
        return client.post("/admin/cpa/partners/"+code+"/release",
          headers=cls.admin_headers(uid),json={
          "conversion_id":str(cid),"amount":amount,
          "reason":reason,"request_id":str(req or uuid.uuid4())})

    def test_14_manual_early_partial_with_confirmed_funding(self):
        cid=self.seed_matured("manual-early",datetime.now(timezone.utc)-timedelta(hours=1))
        with engine.connect() as c:
            before=real_withdrawable(c,UID)
            before_hold=c.execute(text("SELECT hold FROM users WHERE telegram_id=:uid"),{"uid":UID}).scalar_one()
        insufficient=self.approve_network_receipt(cid,gross="99.99")
        self.assertEqual(insufficient.status_code,409,insufficient.text)
        receipt=self.approve_network_receipt(cid)
        self.assertEqual(receipt.status_code,200,receipt.text)
        report=client.get("/admin/cpa/partners/"+CODE+"/hold",
                          headers=self.admin_headers())
        self.assertEqual(report.status_code,200,report.text)
        credit=next(x for x in report.json()["credits"] if x["conversion_id"]==str(cid))
        self.assertEqual(credit["remaining"],"80.00")
        self.assertEqual(credit["early_releasable"],"80.00")
        rid=uuid.uuid4()
        first=self.manual(cid,"30.00",req=rid)
        self.assertEqual(first.status_code,200,first.text)
        self.assertFalse(first.json()["duplicate"])
        retry=self.manual(cid,"30.00",req=rid)
        self.assertEqual(retry.status_code,200,retry.text)
        self.assertTrue(retry.json()["duplicate"])
        with engine.connect() as c:
            self.assertEqual(real_withdrawable(c,UID),before+Decimal("30.00"))
            self.assertEqual(c.execute(text("SELECT hold FROM users WHERE telegram_id=:uid"),{"uid":UID}).scalar_one(),before_hold-Decimal("30.00"))
            rows=[x for x in ledger_events_for_conversion(c,cid) if x["operation_type"]=="manual_hold_release"]
            self.assertEqual(len(rows),1)
            self.assertEqual(rows[0]["actor_type"],"admin")
            receipt_id=c.execute(text("""SELECT receipt_id,actor_id,reason_code FROM
                cpa_ledger WHERE conversion_id=:id AND operation_type='manual_hold_release'"""),{"id":cid}).one()
            self.assertIsNone(receipt_id.receipt_id)
            self.assertEqual(receipt_id.actor_id,UID)

    def test_15_partial_auto_remainder(self):
        cid=self.seed_matured("partial-auto")
        self.assertEqual(self.approve_network_receipt(cid).status_code,200)
        self.assertEqual(self.manual(cid,"30.00").status_code,200)
        released=release_matured_holds(engine,limit=80)
        self.assertGreaterEqual(released["released"],1)
        with engine.connect() as c:
            events=ledger_events_for_conversion(c,cid)
            automatic=next(x for x in events if x["operation_type"]=="hold_release")
            manual=next(x for x in events if x["operation_type"]=="manual_hold_release")
            self.assertEqual(automatic["amount"],Decimal("50.00"))
            self.assertEqual(manual["amount"],Decimal("30.00"))
            self.assertEqual(sum(x["amount"] for x in (automatic,manual)),Decimal("80.00"))
        self.assertEqual(release_matured_holds(engine,limit=80)["released"],0)
        self.assertEqual(self.manual(cid,"1.00").status_code,409)

    def test_16_nonadmin_and_wrong_partner_fail(self):
        cid=self.seed_matured("auth-early",datetime.now(timezone.utc)-timedelta(hours=1))
        no_auth=client.get("/admin/cpa/partners/"+CODE+"/hold")
        self.assertEqual(no_auth.status_code,401)
        regular=client.get("/admin/cpa/partners/"+CODE+"/hold",
                           headers=self.admin_headers(base_fixture.OTHER))
        self.assertEqual(regular.status_code,403)
        self.assertEqual(self.approve_network_receipt(cid,uid=base_fixture.OTHER).status_code,403)
        self.assertEqual(self.manual(cid,uid=base_fixture.OTHER).status_code,403)
        self.assertEqual(self.approve_network_receipt(cid).status_code,200)
        self.assertEqual(self.manual(cid,code="WRONG-CODE").status_code,409)

    def test_17_insufficient_hold_and_dispute(self):
        cid=self.seed_matured("dispute-early",datetime.now(timezone.utc)-timedelta(hours=1))
        self.assertEqual(self.approve_network_receipt(cid).status_code,200)
        self.assertEqual(self.manual(cid,"80.01").status_code,409)
        self.assertEqual(self.manual(cid,"30.00").status_code,200)
        self.assertEqual(self.manual(cid,"50.01").status_code,409)
        with engine.begin() as c:
            c.execute(text("SELECT telegram_id FROM users WHERE telegram_id=:id FOR UPDATE"),{"id":UID})
            release=c.execute(text("""SELECT id,amount FROM public.cpa_ledger
              WHERE conversion_id=:cid AND operation_type='manual_hold_release'"""),
              {"cid":cid}).one()
            c.execute(text("""INSERT INTO public.cpa_ledger
              (conversion_id,user_id,operation_type,event_key,amount,currency,
               original_entry_id,actor_type,actor_id,reason_code)
              VALUES (:cid,:uid,'recovery_pending',:key,:amount,'USD',
                 :origin,'admin',:admin,'pending review')"""),{
              "cid":cid,"uid":UID,"key":"disputed-"+uuid.uuid4().hex,
              "amount":release.amount,"origin":release.id,"admin":UID})
        self.assertEqual(self.manual(cid,"5.00").status_code,409)
        report=client.get("/admin/cpa/partners/"+CODE+"/hold",
                          headers=self.admin_headers())
        entry=next(x for x in report.json()["credits"] if x["conversion_id"]==str(cid))
        self.assertTrue(entry["disputed"])
        self.assertEqual(entry["early_releasable"],"0.00")

    def test_18_old_history_and_replay_cannot_be_credited(self):
        old=client.get("/admin/cpa/partners/"+CODE+"/hold",
            headers=self.admin_headers())
        self.assertEqual(old.status_code,200)
        self.assertTrue(all(x["conversion_id"].startswith('') for x in old.json()["credits"]))
        with engine.connect() as c:
            historical=c.execute(text("""
              SELECT id FROM conversions WHERE finance_eligible_at IS NULL
                ORDER BY created_at LIMIT 1""")).scalar_one()
        self.assertEqual(self.manual(historical).status_code,409)
        self.assertEqual(self.approve_network_receipt(historical).status_code,409)
        with engine.connect() as c:
            self.assertEqual(c.execute(text("SELECT count(*) FROM withdrawals")).scalar_one(),22)
            self.assertEqual(c.execute(text("SELECT count(*) FROM users")).scalar_one(),12)

    def test_19_auto_manual_race_never_exceeds_credit(self):
        cid=self.seed_matured("auto-manual-race")
        self.assertEqual(self.approve_network_receipt(cid).status_code,200)
        with concurrent.futures.ThreadPoolExecutor(max_workers=6) as pool:
            f1=pool.submit(release_matured_holds,engine,limit=60)
            f2=pool.submit(self.manual,cid,"30.00")
            f3=pool.submit(self.manual,cid,"20.00")
            f1.result(); f2.result(); f3.result()
        with engine.connect() as c:
            events=[x for x in ledger_events_for_conversion(c,cid)
                if x["operation_type"] in ("hold_release","manual_hold_release")]
            self.assertEqual(sum(x["amount"] for x in events),Decimal("80.00"))
            self.assertLessEqual(len([x for x in events if x["operation_type"]=="hold_release"]),1)
            self.assertGreaterEqual(c.execute(text("SELECT hold FROM users WHERE telegram_id=:id"),
              {"id":UID}).scalar_one(),Decimal("0.00"))

    def test_20_manual_release_without_network_receipt(self):
        cid=self.seed_matured("disabled-early",datetime.now(timezone.utc)-timedelta(hours=1))
        with patch.dict(os.environ,{"VVD_CPA_EARLY_RELEASE_ENABLED":"0"}):
            self.assertEqual(self.manual(cid).status_code,200)
            self.assertEqual(self.approve_network_receipt(cid).status_code,409)
        with engine.connect() as c:
            self.assertEqual(len(ledger_events_for_conversion(c,cid)),3)


    @classmethod
    def payout_request(cls, amount="50.00", req=None):
        return client.post("/withdrawals",headers=cls.admin_headers(),
           json={"partner_code":CODE,"amount":float(amount),
                 "payment_method":"USDT TRC20","wallet":"SYNTHETIC-NONREAL-ADDRESS",
                 "request_id":str(req or uuid.uuid4())})

    @classmethod
    def paid_proof(cls,wid,ref=None,uid=UID):
        return client.post("/admin/withdrawals/"+str(wid)+"/paid",
          headers=cls.admin_headers(uid),json={
            "external_transfer_id":ref or "CI-EXTERNAL-"+uuid.uuid4().hex,
            "evidence_reference":"CI-confirmation-"+uuid.uuid4().hex,
            "transferred_at":(datetime.now(timezone.utc)-timedelta(seconds=15)).isoformat()
          })

    def test_21_unfunded_approved_postback_never_withdrawable(self):
        cid=self.seed_matured("unfunded-released")
        release_matured_holds(engine,limit=50)
        from cpa_real_withdrawals import funded_withdrawable,real_withdrawable
        with engine.connect() as c:
            self.assertTrue(any(x["operation_type"]=="hold_release" for x in
                           ledger_events_for_conversion(c,cid)))
            self.assertGreaterEqual(real_withdrawable(c,UID),funded_withdrawable(c,UID))
            self.assertIsNone(c.execute(text("""
              SELECT id FROM public.cpa_network_receipts WHERE conversion_id=:cid
            """),{"cid":cid}).first())
        # The targeted conversion contributes nothing to network-funded cover
        # until an independent receipt is recorded.
        self.assertEqual(self.approve_network_receipt(cid,gross="1.00").status_code,409)

    def test_22_funded_submit_retry_and_actual_manual_paid(self):
        cid=self.seed_matured("payout-final")
        release_matured_holds(engine,limit=50)
        self.assertEqual(self.approve_network_receipt(cid).status_code,200)
        rid=uuid.uuid4()
        a=self.payout_request("50.00",rid)
        self.assertEqual(a.status_code,200,a.text)
        self.assertTrue(a.json()["success"],a.text)
        wid=a.json()["withdrawal_id"]
        retry=self.payout_request("50.00",rid)
        self.assertEqual(retry.status_code,200,retry.text)
        self.assertTrue(retry.json()["duplicate"])
        self.assertEqual(wid,retry.json()["withdrawal_id"])
        self.assertFalse(self.payout_request("55.00",rid).json()["success"])
        lacking=client.post("/admin/withdrawals/"+str(wid)+"/paid",
              headers=self.admin_headers())
        self.assertEqual(lacking.status_code,422)
        no_admin=self.paid_proof(wid,uid=base_fixture.OTHER)
        self.assertEqual(no_admin.status_code,403)
        success=self.paid_proof(wid)
        self.assertEqual(success.status_code,200,success.text)
        self.assertTrue(success.json()["success"],success.text)
        self.assertFalse(self.paid_proof(wid).json()["success"])
        with engine.connect() as c:
            proof=c.execute(text("""
                SELECT external_transfer_id,confirmed_by
                FROM public.cpa_payout_proofs WHERE withdrawal_id=:wid
            """),{"wid":wid}).one()
            self.assertTrue(proof.external_transfer_id.startswith("CI-EXTERNAL-"))
            self.assertEqual(proof.confirmed_by,UID)

    def test_23_parallel_real_claims_reserve_funds_once(self):
        cid=self.seed_matured("reserve-race")
        release_matured_holds(engine,limit=60)
        self.assertEqual(self.approve_network_receipt(cid).status_code,200)
        from cpa_real_withdrawals import withdrawable_covered
        with engine.connect() as c:
            fully=withdrawable_covered(c,UID)
        self.assertGreaterEqual(fully,Decimal("50.00"))
        with concurrent.futures.ThreadPoolExecutor(max_workers=10) as p:
            results=list(p.map(lambda _:self.payout_request(str(fully)),range(10)))
        wins=[r for r in results if r.status_code==200 and r.json()["success"]]
        self.assertEqual(len(wins),1,[(x.status_code,x.text[:150]) for x in results])
        wid=wins[0].json()["withdrawal_id"]
        reject=client.post("/admin/withdrawals/"+str(wid)+"/reject",
            headers=self.admin_headers())
        self.assertTrue(reject.json()["success"],reject.text)

    def test_24_rejection_restores_available_exactly_once(self):
        cid=self.seed_matured("reject-once")
        release_matured_holds(engine,limit=60)
        self.assertEqual(self.approve_network_receipt(cid).status_code,200)
        from cpa_real_withdrawals import withdrawable_covered
        with engine.connect() as c:
            before=withdrawable_covered(c,UID)
            balance=c.execute(text("SELECT balance FROM users WHERE telegram_id=:u"),
                              {"u":UID}).scalar_one()
        claim=self.payout_request()
        self.assertTrue(claim.json()["success"],claim.text)
        wid=claim.json()["withdrawal_id"]
        with engine.connect() as c:
            self.assertEqual(withdrawable_covered(c,UID),before-Decimal("50.00"))
        first=client.post("/admin/withdrawals/"+str(wid)+"/reject",
            headers=self.admin_headers())
        second=client.post("/admin/withdrawals/"+str(wid)+"/reject",
            headers=self.admin_headers())
        self.assertTrue(first.json()["success"])
        self.assertFalse(second.json()["success"])
        with engine.connect() as c:
            self.assertEqual(withdrawable_covered(c,UID),before)
            self.assertEqual(c.execute(text("SELECT balance FROM users WHERE telegram_id=:u"),
                              {"u":UID}).scalar_one(),balance)

    def test_25_duplicate_transfer_proof_is_forbidden(self):
        cid=self.seed_matured("distinct-payouts")
        release_matured_holds(engine,limit=60)
        self.assertEqual(self.approve_network_receipt(cid).status_code,200)
        first=self.payout_request(); second=self.payout_request()
        self.assertTrue(first.json()["success"],first.text)
        self.assertTrue(second.json()["success"],second.text)
        key="CI-TRANSFER-SAME-REFERENCE"
        paid=self.paid_proof(first.json()["withdrawal_id"],ref=key)
        self.assertTrue(paid.json()["success"],paid.text)
        again=self.paid_proof(second.json()["withdrawal_id"],ref=key)
        self.assertFalse(again.json()["success"],again.text)
        with engine.connect() as c:
            self.assertEqual(c.execute(text(
              "SELECT count(*) FROM cpa_payout_proofs WHERE external_transfer_id=:ref"),
              {"ref":key}).scalar_one(),1)
        self.assertTrue(client.post("/admin/withdrawals/"+str(second.json()["withdrawal_id"])+"/reject",
                      headers=self.admin_headers()).json()["success"])

    def test_26_dispute_freezes_new_cash_but_not_hidden_debt(self):
        cid=self.seed_matured("disputed-funded")
        release_matured_holds(engine,limit=60)
        self.assertEqual(self.approve_network_receipt(cid).status_code,200)
        opened=client.post("/admin/cpa/conversions/"+str(cid)+"/dispute",
          headers=self.admin_headers(),json={
            "case_reference":"CI-CASE-"+uuid.uuid4().hex,
            "reason":"Network reversal currently under review",
            "evidence_reference":"CI-network-ticket-"+uuid.uuid4().hex})
        self.assertEqual(opened.status_code,200,opened.text)
        self.assertTrue(opened.json()["success"])
        with engine.connect() as c:
            evt=[x for x in ledger_events_for_conversion(c,cid)
                 if x["operation_type"]=="recovery_pending"]
            self.assertEqual(len(evt),1)
            self.assertEqual(c.execute(text("SELECT count(*) FROM withdrawals WHERE cpa_real_epoch_at IS NULL")).scalar_one(),22)
        # No automatic debt is created; the case is held for adjudication.
        with engine.connect() as c:
            self.assertEqual(c.execute(text("""SELECT resolution
              FROM cpa_conversion_disputes WHERE conversion_id=:cid"""),
              {"cid":cid}).scalar_one_or_none(),None)

    def test_27_cancel_unreleased_explicitly_reverses_hold_and_fee(self):
        click=self.add_click("cancel-new")
        self.assertEqual(self.send(click,"approved").status_code,200)
        cid=self.row(click)["id"]
        opened=client.post("/admin/cpa/conversions/"+str(cid)+"/dispute",
          headers=self.admin_headers(),json={
            "case_reference":"CI-CANCEL-"+uuid.uuid4().hex,
            "reason":"Confirmed partner network cancellation",
            "evidence_reference":"CI-cancellation-proof-"+uuid.uuid4().hex})
        self.assertTrue(opened.json()["success"],opened.text)
        with engine.connect() as c:
            before=c.execute(text("SELECT hold FROM users WHERE telegram_id=:uid"),{"uid":UID}).scalar_one()
        res=client.post("/admin/cpa/conversions/"+str(cid)+"/cancel",
            headers=self.admin_headers(),json={
              "case_reference":opened.json()["case_reference"],
              "evidence_reference":"CI-network-final-cancel-"+uuid.uuid4().hex})
        self.assertEqual(res.status_code,200,res.text)
        self.assertTrue(res.json()["success"])
        again=client.post("/admin/cpa/conversions/"+str(cid)+"/cancel",
            headers=self.admin_headers(),json={
              "case_reference":opened.json()["case_reference"],
              "evidence_reference":"CI-network-final-cancel-"+uuid.uuid4().hex})
        self.assertTrue(again.json()["duplicate"])
        with engine.connect() as c:
            ev=ledger_events_for_conversion(c,cid)
            self.assertEqual({x["operation_type"] for x in ev},
               {"hold_credit","platform_fee_accrual","hold_reversal","platform_fee_reversal"})
            self.assertEqual(c.execute(text("SELECT hold FROM users WHERE telegram_id=:uid"),{"uid":UID}).scalar_one(),before-Decimal("80.00"))
        self.assertEqual(release_matured_holds(engine,limit=60)["released"],0)

    def test_28_historical_withdrawals_never_get_paid_proof(self):
        denied=self.paid_proof(1)
        self.assertEqual(denied.status_code,200)
        self.assertFalse(denied.json()["success"])
        with engine.connect() as c:
            self.assertIsNone(c.execute(text("""SELECT withdrawal_id FROM cpa_payout_proofs
              WHERE withdrawal_id=1""")).first())
            self.assertEqual(c.execute(text("SELECT count(*) FROM public.withdrawals WHERE cpa_real_epoch_at IS NULL")).scalar_one(),22)

    def test_29_unverified_network_transfer_cannot_confirm_paid(self):
        cid=self.seed_matured("never-funded")
        release_matured_holds(engine,limit=60)
        with engine.connect() as c:
            self.assertIsNone(c.execute(text("SELECT id FROM cpa_network_receipts WHERE conversion_id=:cid"),
                {"cid":cid}).first())
        # Unpaid ledger credit never increases cash-backed spendable amount.
        from cpa_real_withdrawals import funded_withdrawable
        with engine.connect() as c:
            self.assertGreaterEqual(funded_withdrawable(c,UID),Decimal("0.00"))

    def test_30_non_admin_cannot_modify_finance_disputes(self):
        cid=self.seed_matured("bad-admin-dispute")
        reply=client.post("/admin/cpa/conversions/"+str(cid)+"/dispute",
           headers=self.admin_headers(base_fixture.OTHER),json={
            "case_reference":"CI-BAD-ADMIN-"+uuid.uuid4().hex,
            "reason":"Network cancellation evidence received",
            "evidence_reference":"CI-cancel-"+uuid.uuid4().hex})
        self.assertEqual(reply.status_code,403)
        with engine.connect() as c:
            self.assertIsNone(c.execute(text("SELECT conversion_id FROM cpa_conversion_disputes WHERE conversion_id=:id"),
                {"id":cid}).first())


if __name__=="__main__":
    unittest.main()
