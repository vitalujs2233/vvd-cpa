"""Stage 5.2.2 — disposable PostgreSQL 17 + protected withdrawal API tests.

NEVER connect to real Supabase. CI provides DATABASE_URL and a fake BOT_TOKEN.
Run in isolated GitHub Actions postgres service (no production data).
"""
from __future__ import annotations

import hashlib
import hmac
import json
import os
import sys
import time
import unittest
from decimal import Decimal
from pathlib import Path
from unittest.mock import AsyncMock, patch
from urllib.parse import urlencode

from fastapi.testclient import TestClient
from sqlalchemy import text
from sqlalchemy.exc import DBAPIError

ROOT=Path(__file__).resolve().parents[1]
sys.path.insert(0,str(ROOT))
from database import engine
from main import app

client=TestClient(app,follow_redirects=False)
OWNER=900000005221
OTHER=900000005222
ADMIN=232682307
OWNER_CODE="VVD952221"
OTHER_CODE="VVD952222"


def signed(uid: int):
    data={"auth_date":str(int(time.time())),"user":json.dumps(
        {"id":uid},separators=(",",":"))}
    check="\n".join(f"{k}={v}" for k,v in sorted(data.items()))
    key=hmac.new(b"WebAppData",os.environ["BOT_TOKEN"].encode(),hashlib.sha256).digest()
    data["hash"]=hmac.new(key,check.encode(),hashlib.sha256).hexdigest()
    return {"X-Telegram-Init-Data":urlencode(data)}


class WithdrawalsSecurityTests(unittest.TestCase):
    @classmethod
    def setUpClass(cls):
        with engine.begin() as c:
            # Match actual Supabase role semantics within disposable PostgreSQL.
            c.execute(text("""DO $roles$ BEGIN
                IF NOT EXISTS (SELECT 1 FROM pg_roles WHERE rolname='anon') THEN
                  CREATE ROLE anon NOLOGIN;
                END IF;
                IF NOT EXISTS (SELECT 1 FROM pg_roles WHERE rolname='authenticated') THEN
                  CREATE ROLE authenticated NOLOGIN;
                END IF;
                IF NOT EXISTS (SELECT 1 FROM pg_roles WHERE rolname='service_role') THEN
                  CREATE ROLE service_role NOLOGIN BYPASSRLS;
                END IF;
            END $roles$;"""))
            # The same minimal table shapes as existing backend_v2 tests.
            c.execute(text("""CREATE TABLE IF NOT EXISTS public.users (
                telegram_id BIGINT PRIMARY KEY,first_name VARCHAR(255) NOT NULL,
                partner_code VARCHAR(50),
                balance NUMERIC(12,2) NOT NULL DEFAULT 0,
                hold NUMERIC(12,2) NOT NULL DEFAULT 0,
                withdrawn NUMERIC(12,2) NOT NULL DEFAULT 0,
                role VARCHAR(30) NOT NULL DEFAULT 'user',
                status VARCHAR(30) NOT NULL DEFAULT 'active')"""))
            for col in (
              "partner_code VARCHAR(50)",
              "last_name VARCHAR(255)",
              "username VARCHAR(255)",
              "balance NUMERIC(12,2) NOT NULL DEFAULT 0",
              "hold NUMERIC(12,2) NOT NULL DEFAULT 0",
              "withdrawn NUMERIC(12,2) NOT NULL DEFAULT 0",
              "role VARCHAR(30) NOT NULL DEFAULT 'user'",
              "status VARCHAR(30) NOT NULL DEFAULT 'active'",
            ):
                c.execute(text("ALTER TABLE public.users ADD COLUMN IF NOT EXISTS "+col))
            c.execute(text("""CREATE TABLE IF NOT EXISTS public.withdrawals (
              id BIGSERIAL PRIMARY KEY,
              user_id BIGINT NOT NULL,
              partner_code VARCHAR(60),
              amount NUMERIC(12,2) NOT NULL,
              payment_method VARCHAR(60) NOT NULL DEFAULT 'USDT TRC20',
              wallet TEXT NOT NULL DEFAULT '',
              status VARCHAR(30) NOT NULL DEFAULT 'pending',
              created_at TIMESTAMP NOT NULL DEFAULT NOW(),
              processed_at TIMESTAMP
            )"""))
            for col in (
              "partner_code VARCHAR(60)",
              "payment_method VARCHAR(60) NOT NULL DEFAULT 'USDT TRC20'",
              "wallet TEXT NOT NULL DEFAULT ''",
              "status VARCHAR(30) NOT NULL DEFAULT 'pending'",
              "created_at TIMESTAMP NOT NULL DEFAULT NOW()",
              "processed_at TIMESTAMP",
            ):
                c.execute(text("ALTER TABLE public.withdrawals ADD COLUMN IF NOT EXISTS "+col))
            # Admin /finance needs conversion aggregates; synthetic only.
            c.execute(text("""CREATE TABLE IF NOT EXISTS public.conversions(
              id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
              click_id VARCHAR(120) UNIQUE,
              user_id BIGINT NOT NULL,
              offer_id VARCHAR(80),
              payout_gross NUMERIC(12,4) NOT NULL DEFAULT 0,
              payout_net NUMERIC(12,4) NOT NULL DEFAULT 0,
              status VARCHAR(30) NOT NULL DEFAULT 'pending',
              is_test BOOLEAN NOT NULL DEFAULT FALSE
            )"""))
            c.execute(text("ALTER TABLE public.conversions ADD COLUMN IF NOT EXISTS is_test BOOLEAN NOT NULL DEFAULT FALSE"))
            for uid,code in ((OWNER,OWNER_CODE),(OTHER,OTHER_CODE)):
                c.execute(text("""INSERT INTO public.users
                    (telegram_id,first_name,partner_code,balance,hold,withdrawn,role,status)
                    VALUES (:id,'Synthetic finance',:code,200,7,5,'user','active')
                    ON CONFLICT (telegram_id) DO UPDATE SET
                        first_name='Synthetic finance',partner_code=:code,
                        balance=200,hold=7,withdrawn=5
                """),{"id":uid,"code":code})
            cls.fixture_ids=[]
            for i in range(22):
                uid,code=(OWNER,OWNER_CODE) if i%2==0 else (OTHER,OTHER_CODE)
                row=c.execute(text("""INSERT INTO public.withdrawals
                   (user_id,partner_code,amount,payment_method,wallet,status)
                   VALUES (:uid,:code,50.00,'USDT TRC20',:wallet,:status)
                   RETURNING id"""),{"uid":uid,"code":code,
                    "wallet":"synthetic-wallet-"+str(i),
                    "status":"paid" if i<8 else "rejected"}).scalar_one()
                cls.fixture_ids.append(row)
            cls.before=c.execute(text("""
                SELECT id,user_id,partner_code,amount,payment_method,wallet,status,
                       created_at,processed_at FROM public.withdrawals
                WHERE id=ANY(:ids) ORDER BY id
            """),{"ids":cls.fixture_ids}).all()
            cls.balances=c.execute(text("""
                SELECT telegram_id,balance,hold,withdrawn FROM public.users
                WHERE telegram_id IN (:a,:b) ORDER BY telegram_id
            """),{"a":OWNER,"b":OTHER}).all()
            # Match real public.withdrawals default grants before migration.
            c.execute(text("""GRANT ALL PRIVILEGES ON TABLE public.withdrawals
                TO anon,authenticated,service_role"""))
            c.execute(text("""GRANT ALL PRIVILEGES ON SEQUENCE public.withdrawals_id_seq
                TO anon,authenticated,service_role"""))
            assert c.execute(text("""SELECT has_sequence_privilege('anon',
                     'public.withdrawals_id_seq','USAGE')""")).scalar_one()
            c.execute(text("ALTER TABLE public.withdrawals DISABLE ROW LEVEL SECURITY"))
            assert c.execute(text("""SELECT has_table_privilege('anon',
                     'public.withdrawals','UPDATE')""")).scalar_one()
            sql=(ROOT/"migrations/20261017_stage5_withdrawals_rls.sql").read_text()
            # One transaction: 22 fixture rows and wallet snapshots remain identical.
            c.connection.cursor().execute(sql)
            c.connection.cursor().execute(sql)

    def test_01_supabase_role_privileges_and_rls(self):
        with engine.connect() as c:
            enabled=c.execute(text("""
                SELECT relrowsecurity FROM pg_class
                WHERE oid='public.withdrawals'::regclass
            """)).scalar_one()
            self.assertTrue(enabled)
            for role in ("anon","authenticated"):
                for privilege in ("SELECT","INSERT","UPDATE","DELETE","TRUNCATE"):
                    self.assertFalse(c.execute(text("""
                        SELECT has_table_privilege(:role,'public.withdrawals',:priv)
                    """),{"role":role,"priv":privilege}).scalar_one(),
                    f"Unexpected {role} {privilege} access")
            for role in ("anon","authenticated"):
                for privilege in ("USAGE","SELECT","UPDATE"):
                    self.assertFalse(c.execute(text("""
                        SELECT has_sequence_privilege(:role,
                            'public.withdrawals_id_seq',:priv)
                    """),{"role":role,"priv":privilege}).scalar_one(),
                    f"Unexpected {role} sequence {privilege} access")
            self.assertTrue(c.execute(text("""
                SELECT rolbypassrls FROM pg_roles WHERE rolname='service_role'
            """)).scalar_one())
            for role in ("postgres","service_role"):
                for privilege in ("SELECT","INSERT","UPDATE","DELETE"):
                    self.assertTrue(c.execute(text("""
                        SELECT has_table_privilege(:role,'public.withdrawals',:priv)
                    """),{"role":role,"priv":privilege}).scalar_one())
                for privilege in ("USAGE","SELECT","UPDATE"):
                    self.assertTrue(c.execute(text("""
                        SELECT has_sequence_privilege(:role,
                            'public.withdrawals_id_seq',:priv)
                    """),{"role":role,"priv":privilege}).scalar_one())

    def test_02_actual_anonymous_authenticated_sql_denied(self):
        # These are real PostgreSQL SET ROLE statements in disposable PG17.
        actions=(
            "SELECT id,wallet FROM public.withdrawals",
            "INSERT INTO public.withdrawals(user_id,amount) VALUES (999,50)",
            "UPDATE public.withdrawals SET status='paid'",
            "DELETE FROM public.withdrawals",
            "TRUNCATE public.withdrawals",
            "SELECT nextval('public.withdrawals_id_seq')",
            "SELECT last_value FROM public.withdrawals_id_seq",
        )
        for role in ("anon","authenticated"):
            for stmt in actions:
                with self.subTest(role=role,action=stmt):
                    with self.assertRaises(DBAPIError):
                        with engine.begin() as c:
                            c.execute(text("SET LOCAL ROLE "+role))
                            c.execute(text(stmt))

    def test_03_22_existing_rows_and_wallets_unchanged_by_migration(self):
        with engine.connect() as c:
            after=c.execute(text("""
                SELECT id,user_id,partner_code,amount,payment_method,wallet,status,
                       created_at,processed_at FROM public.withdrawals
                WHERE id=ANY(:ids) ORDER BY id
            """),{"ids":self.fixture_ids}).all()
            self.assertEqual(after,self.before)
            wallets=c.execute(text("""
                SELECT telegram_id,balance,hold,withdrawn FROM public.users
                WHERE telegram_id IN (:a,:b) ORDER BY telegram_id
            """),{"a":OWNER,"b":OTHER}).all()
            self.assertEqual(wallets,self.balances)
            self.assertEqual(len(after),22)

    def test_04_signed_owner_access_and_foreign_code_denial(self):
        header=signed(OWNER)
        self.assertEqual(client.get("/withdrawals/"+OWNER_CODE,headers=header).status_code,200)
        self.assertEqual(client.get("/withdrawals/"+OTHER_CODE,headers=header).status_code,403)
        self.assertEqual(client.get("/withdrawals/"+OWNER_CODE).status_code,401)
        forged=dict(header)
        forged["X-Telegram-Init-Data"]=forged["X-Telegram-Init-Data"].replace(
            str(OWNER),str(OTHER),1)
        self.assertEqual(client.get("/withdrawals/"+OWNER_CODE,headers=forged).status_code,401)
        own_data=client.get("/withdrawals/"+OWNER_CODE,headers=header).json()["withdrawals"]
        self.assertEqual(len(own_data),11)
        self.assertTrue(all(x["partner_code"]==OWNER_CODE for x in own_data))

    def test_05_withdrawal_creation_requires_correct_signed_owner(self):
        data={"partner_code":OTHER_CODE,"amount":50.0,
              "payment_method":"USDT TRC20","wallet":"synthetic-own-wallet"}
        before=client.get("/balance/"+str(OWNER),headers=signed(OWNER)).json()
        other_code=client.post("/withdrawals",headers=signed(OWNER),json=data)
        self.assertEqual(other_code.status_code,403)
        no_auth=client.post("/withdrawals",json=data)
        self.assertEqual(no_auth.status_code,401)
        self.assertEqual(
            client.post("/withdrawals",headers=signed(OWNER),
                json={**data,"partner_code":OWNER_CODE}).status_code,200)
        after=client.get("/balance/"+str(OWNER),headers=signed(OWNER)).json()
        self.assertEqual(Decimal(str(before["available"]))-
                         Decimal(str(after["available"])),Decimal("50.00"))

    def test_06_admin_routes_reject_user_even_with_forged_params(self):
        uid=self.fixture_ids[0]
        urls=(
            "/admin/withdrawals",
            "/admin/finance",
            f"/admin/withdrawals/{uid}/paid?admin_id={ADMIN}",
            f"/admin/withdrawals/{uid}/reject?telegram_id={ADMIN}",
        )
        for url in urls:
            with self.subTest(url=url):
                method="POST" if "/paid" in url or "/reject" in url else "GET"
                resp=client.request(method,url,headers=signed(OWNER))
                self.assertEqual(resp.status_code,403,resp.text)
                self.assertEqual(client.request(method,url).status_code,401)
        self.assertEqual(client.get("/admin/withdrawals",headers=signed(ADMIN)).status_code,200)
        self.assertEqual(client.get("/admin/finance",headers=signed(ADMIN)).status_code,200)
        with engine.connect() as c:
            self.assertEqual(c.execute(text(
                "SELECT status FROM public.withdrawals WHERE id=:id"),
                {"id":uid}).scalar_one(),"paid")

    def test_07_trusted_backend_admin_paid_rejected_preserves_other_data(self):
        # Test only synthetic records, suppress outbound Telegram messages.
        with engine.begin() as c:
            ids=[c.execute(text("""INSERT INTO public.withdrawals
                (user_id,partner_code,amount,payment_method,wallet,status)
                VALUES (:uid,:code,50,'USDT TRC20','synthetic-admin','pending')
                RETURNING id"""),{"uid":OWNER,"code":OWNER_CODE}).scalar_one() for _ in range(2)]
        with patch("main.send_partner_notification",new=AsyncMock()):
            paid=client.post(f"/admin/withdrawals/{ids[0]}/paid",headers=signed(ADMIN))
            reject=client.post(f"/admin/withdrawals/{ids[1]}/reject",headers=signed(ADMIN))
        self.assertEqual(paid.status_code,200,paid.text)
        self.assertEqual(reject.status_code,200,reject.text)
        self.assertTrue(paid.json()["success"])
        self.assertTrue(reject.json()["success"])
        with engine.connect() as c:
            statuses=[c.execute(text("SELECT status FROM withdrawals WHERE id=:id"),
                {"id":id_}).scalar_one() for id_ in ids]
            self.assertEqual(statuses,["paid","rejected"])
            rows=c.execute(text("""
                SELECT id,user_id,partner_code,amount,payment_method,wallet,status,
                       created_at,processed_at FROM public.withdrawals
                WHERE id=ANY(:ids) ORDER BY id
            """),{"ids":self.fixture_ids}).all()
            self.assertEqual(rows,self.before)


    def test_08_transactional_emergency_rollback_is_reversible(self):
        # In isolated PG17 only: simulate reverting ACL/RLS, then ROLLBACK.
        # No rollback DDL escapes this test transaction.
        with engine.connect() as c:
            original=c.execute(text("""
                SELECT id,user_id,partner_code,amount,payment_method,wallet,status,
                       created_at,processed_at FROM public.withdrawals
                WHERE id=ANY(:ids) ORDER BY id
            """),{"ids":self.fixture_ids}).all()
            balances=c.execute(text("""
                SELECT telegram_id,balance,hold,withdrawn FROM public.users
                WHERE telegram_id IN (:a,:b) ORDER BY telegram_id
            """),{"a":OWNER,"b":OTHER}).all()
            c.commit()
            tx=c.begin()
            try:
                c.execute(text("ALTER TABLE public.withdrawals DISABLE ROW LEVEL SECURITY"))
                c.execute(text("""GRANT ALL PRIVILEGES ON TABLE public.withdrawals
                    TO anon,authenticated"""))
                c.execute(text("""GRANT ALL PRIVILEGES ON SEQUENCE public.withdrawals_id_seq
                    TO anon,authenticated"""))
                self.assertFalse(c.execute(text("""
                    SELECT relrowsecurity FROM pg_class
                    WHERE oid='public.withdrawals'::regclass
                """)).scalar_one())
                for role in ("anon","authenticated"):
                    self.assertTrue(c.execute(text("""
                        SELECT has_table_privilege(:role,'public.withdrawals','SELECT')
                    """),{"role":role}).scalar_one())
                    self.assertTrue(c.execute(text("""
                        SELECT has_sequence_privilege(:role,
                            'public.withdrawals_id_seq','USAGE')
                    """),{"role":role}).scalar_one())
            finally:
                tx.rollback()
            # Rollback leaves the secure migration state, all 22 original
            # withdrawals, and user balances unchanged.
            self.assertTrue(c.execute(text("""
                SELECT relrowsecurity FROM pg_class
                WHERE oid='public.withdrawals'::regclass
            """)).scalar_one())
            for role in ("anon","authenticated"):
                self.assertFalse(c.execute(text("""
                    SELECT has_table_privilege(:role,'public.withdrawals','SELECT')
                """),{"role":role}).scalar_one())
                self.assertFalse(c.execute(text("""
                    SELECT has_sequence_privilege(:role,
                        'public.withdrawals_id_seq','USAGE')
                """),{"role":role}).scalar_one())
            after=c.execute(text("""
                SELECT id,user_id,partner_code,amount,payment_method,wallet,status,
                       created_at,processed_at FROM public.withdrawals
                WHERE id=ANY(:ids) ORDER BY id
            """),{"ids":self.fixture_ids}).all()
            self.assertEqual(after,original)
            balances_after=c.execute(text("""
                SELECT telegram_id,balance,hold,withdrawn FROM public.users
                WHERE telegram_id IN (:a,:b) ORDER BY telegram_id
            """),{"a":OWNER,"b":OTHER}).all()
            self.assertEqual(balances_after,balances)


if __name__=="__main__":
    unittest.main()
