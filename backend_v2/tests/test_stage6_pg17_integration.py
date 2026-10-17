"""Stage 6 real PostgreSQL 17 and signed TestClient integration.

Synthetic fixture is created ONLY inside isolated CI DATABASE_URL. No Supabase.
"""
from __future__ import annotations
import hashlib
import hmac
import json
import os
import sys
import time
import unittest
from pathlib import Path
from urllib.parse import urlencode
from uuid import uuid4
from datetime import datetime, timezone, timedelta
from decimal import Decimal

from sqlalchemy import text
from fastapi.testclient import TestClient

ROOT = Path(__file__).resolve().parents[1]
sys.path.insert(0, str(ROOT))
from database import engine
from main import app

OWNER = 900000006001
OTHER = 900000006002
ADMIN = 232682307
CUTOFF = datetime(2026, 10, 1, tzinfo=timezone.utc)
client = TestClient(app, follow_redirects=False)


def signed(uid):
    data = {"auth_date": str(int(time.time())),
            "user": json.dumps({"id":uid},separators=(",",":"))}
    plain = "\n".join(f"{k}={v}" for k,v in sorted(data.items()))
    secret = hmac.new(b"WebAppData",os.environ["BOT_TOKEN"].encode(),hashlib.sha256).digest()
    data["hash"] = hmac.new(secret,plain.encode(),hashlib.sha256).hexdigest()
    return {"X-Telegram-Init-Data":urlencode(data)}


class Stage6PostgresIntegration(unittest.TestCase):
    @classmethod
    def setUpClass(cls):
        url = os.environ.get("DATABASE_URL","")
        if "127.0.0.1" not in url and "localhost" not in url:
            raise RuntimeError("Stage6 PG17 test refuses non-local DATABASE_URL")
        with engine.begin() as c:
            c.execute(text("""CREATE TABLE public.users(
                telegram_id BIGINT PRIMARY KEY,first_name TEXT,partner_code TEXT,
                role TEXT DEFAULT 'user',balance NUMERIC(12,2) DEFAULT 0)"""))
            c.execute(text("""CREATE TABLE public.offers(id TEXT PRIMARY KEY,title TEXT)"""))
            c.execute(text("""CREATE TABLE public.cpa_networks(id BIGINT PRIMARY KEY,name TEXT)"""))
            c.execute(text("""CREATE TABLE public.clicks(
                id BIGSERIAL PRIMARY KEY,user_id BIGINT,click_id TEXT UNIQUE,
                created_at TIMESTAMP,offer_id TEXT,network_id BIGINT,vertical TEXT,
                country_code TEXT,country_name TEXT)"""))
            c.execute(text("""CREATE TABLE public.cpa_finance_epoch(
                id SMALLINT PRIMARY KEY,activated_at TIMESTAMPTZ,
                legacy_max_withdrawal_id BIGINT,legacy_max_click_row_id BIGINT)"""))
            c.execute(text("""INSERT INTO public.cpa_finance_epoch
                VALUES(1,NULL,NULL,NULL)"""))
            c.execute(text("""CREATE TABLE public.conversions(
                id UUID PRIMARY KEY,click_id TEXT,user_id BIGINT,
                offer_id TEXT,network_id BIGINT,vertical_slug TEXT,is_test BOOLEAN,
                status TEXT,finance_eligible_at TIMESTAMPTZ,
                finance_approved_at TIMESTAMPTZ,currency TEXT,
                payout_gross NUMERIC(12,2),payout_net NUMERIC(12,2),
                created_at TIMESTAMPTZ)"""))
            c.execute(text("""CREATE TABLE public.cpa_ledger(
                conversion_id UUID,user_id BIGINT,operation_type TEXT,
                hold_delta NUMERIC(12,2),balance_delta NUMERIC(12,2),
                platform_fee_delta NUMERIC(12,2))"""))
            for uid,code in ((OWNER,"VVD-STAGE6-1"),(OTHER,"VVD-STAGE6-2")):
                c.execute(text("""INSERT INTO public.users
                    (telegram_id,first_name,partner_code,balance)
                    VALUES(:uid,'Synthetic',:code,100)"""),
                    {"uid":uid,"code":code})
            c.execute(text("INSERT INTO public.offers VALUES('o1','Stage6 offer')"))
            c.execute(text("INSERT INTO public.cpa_networks VALUES(31,'Stage6 network')"))
            cls.real_ids=[]
            for uid, prefix in ((OWNER,"one"),(OTHER,"two")):
                for i in range(4):
                    c.execute(text("""INSERT INTO public.clicks
                        (user_id,click_id,created_at,offer_id,network_id,vertical,country_code,country_name)
                        VALUES(:uid,:click,:at,'o1',31,'mainstream',:geo,:name)"""),
                        {"uid":uid,"click":f"{prefix}-{i}","at":CUTOFF+timedelta(days=2),
                         "geo":"LV" if i == 0 else None,"name":"Latvia" if i==0 else None})
                for i,status in enumerate(("approved","pending","rejected","1")):
                    id=uuid4()
                    c.execute(text("""INSERT INTO public.conversions
                        (id,click_id,user_id,offer_id,network_id,vertical_slug,is_test,status,
                         finance_eligible_at,finance_approved_at,currency,
                         payout_gross,payout_net,created_at)
                        VALUES(:id,:click,:uid,'o1',31,'mainstream',:test,:status,
                         :eligible,:approved,'USD',100,80,:at)"""),
                        {"id":id,"click":f"{prefix}-{i}","uid":uid,
                         "test":status=="1","status":status,
                         "eligible":None if status=="1" else CUTOFF,
                         "approved":CUTOFF+timedelta(days=3) if status=="approved" else None,
                         "at":CUTOFF+timedelta(days=2)})
                    if status=="approved":
                        cls.real_ids.append(id)
                        for op,hold,fee in (("hold_credit",Decimal("80"),Decimal("0")),
                                            ("platform_fee_accrual",Decimal("0"),Decimal("20"))):
                            c.execute(text("""INSERT INTO public.cpa_ledger
                                (conversion_id,user_id,operation_type,hold_delta,balance_delta,platform_fee_delta)
                                VALUES(:id,:uid,:op,:hold,0,:fee)"""),
                                {"id":id,"uid":uid,"op":op,"hold":hold,"fee":fee})

    def test_01_signed_owner_and_other_isolation(self):
        own=client.get(f"/statistics/{OWNER}",headers=signed(OWNER))
        self.assertEqual(own.status_code,200,own.text)
        result=own.json()["summary"]
        self.assertEqual(result["clicks"],4)
        self.assertEqual(result["statuses"]["pending"],1)
        self.assertEqual(result["statuses"]["approved"],1)
        self.assertEqual(result["statuses"]["rejected"],1)
        self.assertEqual(result["legacy_conversions"],1)
        self.assertEqual(result["conversions"],3)
        self.assertEqual(result["cr"],75)
        self.assertEqual(result["approved_cr"],25)
        self.assertEqual(result["epc"],0)
        self.assertNotIn("finance",result)
        self.assertNotIn("gross",str(result))
        self.assertNotIn("fee",str(result))
        forbidden=client.get(f"/statistics/{OTHER}",headers=signed(OWNER))
        self.assertEqual(forbidden.status_code,403,forbidden.text)
        unsigned=client.get(f"/statistics/{OWNER}")
        self.assertEqual(unsigned.status_code,401,unsigned.text)
        own_other=client.get(f"/statistics/{OTHER}",headers=signed(OTHER))
        self.assertEqual(own_other.status_code,200,own_other.text)

    def test_02_filters_and_geo(self):
        h=signed(OWNER)
        one=client.get(f"/statistics/{OWNER}?offer_id=o1&network_id=31&vertical=mainstream",headers=h)
        self.assertEqual(one.status_code,200,one.text)
        self.assertEqual(one.json()["summary"]["clicks"],4)
        empty=client.get(f"/statistics/{OWNER}?offer_id=absent",headers=h)
        self.assertEqual(empty.status_code,200,empty.text)
        self.assertEqual(empty.json()["summary"]["clicks"],0)
        self.assertEqual(empty.json()["summary"]["epc"],0)
        wrong=client.get(f"/statistics/{OWNER}?from=2026-10-05&to=2026-10-01",headers=h)
        self.assertEqual(wrong.status_code,422,wrong.text)
        geo=client.get(f"/statistics/{OWNER}/countries",headers=h)
        self.assertEqual(geo.status_code,200,geo.text)
        self.assertEqual(len(geo.json()["countries"]),2)
        self.assertEqual(geo.json()["countries"][0]["country_code"],None)
        self.assertEqual(geo.json()["countries"][0]["clicks"],3)
        self.assertEqual(geo.json()["countries"][1]["country_code"],"LV")
        self.assertEqual(geo.json()["countries"][1]["clicks"],1)
        self.assertNotIn("conversions",geo.json()["countries"][0])

    def test_03_admin_totals_and_partner_selection(self):
        h=signed(ADMIN)
        all_=client.get("/admin/analytics",headers=h)
        self.assertEqual(all_.status_code,200,all_.text)
        self.assertEqual(all_.json()["summary"]["clicks"],8)
        self.assertIn("finance",all_.json()["summary"])
        self.assertIn("gross",all_.json()["summary"]["finance"])
        self.assertIn("fee",all_.json()["summary"]["finance"])
        one=client.get(f"/admin/analytics?telegram_id={OWNER}",headers=h)
        self.assertEqual(one.status_code,200,one.text)
        self.assertEqual(one.json()["summary"]["clicks"],4)
        reject=client.get("/admin/analytics",headers=signed(OWNER))
        self.assertEqual(reject.status_code,403,reject.text)

    def test_03b_recent_clicks_owned_paginated_and_filtered(self):
        h=signed(OWNER)
        result=client.get(f"/statistics/{OWNER}/clicks?period=all&limit=2&offset=0",headers=h)
        self.assertEqual(result.status_code,200,result.text)
        items=result.json()["clicks"]
        self.assertEqual(len(items),2)
        self.assertTrue(items[0]["created_at"]>=items[1]["created_at"])
        self.assertNotIn("click_id",items[0])
        self.assertNotIn("user_id",items[0])
        self.assertNotIn("ip",items[0])
        page=client.get(f"/statistics/{OWNER}/clicks?limit=2&offset=2",headers=h)
        self.assertEqual(page.status_code,200,page.text)
        self.assertEqual(len(page.json()["clicks"]),2)
        wrong=client.get(f"/statistics/{OTHER}/clicks",headers=h)
        self.assertEqual(wrong.status_code,403)
        absent=client.get(f"/statistics/{OWNER}/clicks?offer_id=missing",headers=h)
        self.assertEqual(absent.json()["clicks"],[])
        period=client.get(f"/statistics/{OWNER}/clicks?from=2026-10-04",headers=h)
        self.assertEqual(period.json()["clicks"],[])
        over=client.get(f"/statistics/{OWNER}/clicks?limit=21",headers=h)
        self.assertEqual(over.status_code,422)

    def test_04_synthetic_finance_activated_only_locally(self):
        with engine.begin() as c:
            c.execute(text("""UPDATE public.cpa_finance_epoch
                SET activated_at=:cutoff,legacy_max_withdrawal_id=0,legacy_max_click_row_id=0 WHERE id=1"""),
                {"cutoff":CUTOFF})
        try:
            # Tests run with a deliberately small financial schema: the real
            # entitlement projection is verified separately in Stage 5 PG17 CI.
            from unittest.mock import patch
            with patch("cpa_real_withdrawals.finance_balance_projection",
                       return_value={"real_withdrawable":0.0}):
                r=client.get(f"/statistics/{OWNER}",headers=signed(OWNER))
            self.assertEqual(r.status_code,200,r.text)
            s=r.json()["summary"]
            self.assertNotIn("finance",s)
            self.assertEqual(s["earned"],80)
            self.assertEqual(s["on_hold"],80)
            with patch("cpa_real_withdrawals.finance_balance_projection",return_value={"real_withdrawable":0.0}):
                admin=client.get(f"/admin/analytics?telegram_id={OWNER}",headers=signed(ADMIN))
            self.assertEqual(admin.status_code,200,admin.text)
            finance=admin.json()["summary"]["finance"]
            self.assertEqual(finance["gross"],100)
            self.assertEqual(finance["fee"],20)
            self.assertEqual(finance["partner"],80)
            self.assertEqual(finance["hold"],80)
            self.assertEqual(finance["released"],0)
            self.assertEqual(s["epc"],20)
            # Historical 100 gross / 80 net was never converted to real CPA.
            self.assertEqual(s["legacy_conversions"],1)
        finally:
            with engine.begin() as c:
                c.execute(text("UPDATE public.cpa_finance_epoch SET activated_at=NULL WHERE id=1"))


if __name__=="__main__":
    unittest.main()
