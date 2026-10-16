"""Stage 1 VVD CPA: isolated signed registration and permanent partner codes.

Run under CI PostgreSQL with a fake bot key; never touches real accounts.
"""
import concurrent.futures
import hashlib
import hmac
import json
import os
import sys
import time
import unittest
from pathlib import Path
from urllib.parse import urlencode
from fastapi.testclient import TestClient
from sqlalchemy import text

ROOT=Path(__file__).resolve().parents[1]
sys.path.insert(0,str(ROOT))
from database import engine
from main import app

START_USER=900000003100
client=TestClient(app)

def signed(uid, name="Example", offset=0, referral=""):
    payload={
        "auth_date":str(int(time.time())+offset),
        "user":json.dumps({"id":uid,"first_name":name,"last_name":"Test",
                           "username":"test_account"},separators=(",",":")),
    }
    if referral:
        payload["start_param"]=referral
    check="\n".join(f"{k}={v}" for k,v in sorted(payload.items()))
    key=hmac.new(b"WebAppData",os.environ["BOT_TOKEN"].encode(),hashlib.sha256).digest()
    payload["hash"]=hmac.new(key,check.encode(),hashlib.sha256).hexdigest()
    return urlencode(payload)

class StageOneAuthTests(unittest.TestCase):
    @classmethod
    def setUpClass(cls):
        with engine.begin() as conn:
            conn.execute(text("CREATE TABLE IF NOT EXISTS public.users(telegram_id BIGINT PRIMARY KEY,first_name VARCHAR(255) NOT NULL)"))
            for col in [
                "last_name VARCHAR(255)","username VARCHAR(255)","photo_url TEXT",
                "partner_code VARCHAR(50)","invited_by BIGINT",
                "role VARCHAR(30) NOT NULL DEFAULT 'user'",
                "status VARCHAR(30) NOT NULL DEFAULT 'active'",
                "balance NUMERIC(14,2) NOT NULL DEFAULT 0",
                "hold NUMERIC(14,2) NOT NULL DEFAULT 0",
                "withdrawn NUMERIC(14,2) NOT NULL DEFAULT 0",
            ]:
                conn.execute(text("ALTER TABLE public.users ADD COLUMN IF NOT EXISTS "+col))
            conn.execute(text("""CREATE UNIQUE INDEX IF NOT EXISTS users_partner_code_key
                            ON public.users(partner_code)"""))
            raw=(ROOT/"migrations/20261016_stage1_partner_codes.sql").read_text()
            raw="\n".join(line for line in raw.splitlines() if not line.startswith("REVOKE "))
            # psycopg2 accepts multi-statement SQL with the PL/pgSQL DO body intact.
            conn.connection.cursor().execute(raw)
        cls.first=START_USER
        cls.second=START_USER+1

    @classmethod
    def tearDownClass(cls):
        with engine.begin() as conn:
            conn.execute(text("DELETE FROM public.users WHERE telegram_id BETWEEN :lo AND :hi"),
                         {"lo":START_USER,"hi":START_USER+100})

    def auth(self, uid, **kw):
        return client.post("/auth",json={"init_data":signed(uid,**kw)})

    def test_new_user_gets_backend_code(self):
        result=self.auth(self.first)
        self.assertEqual(result.status_code,200,result.text)
        code=result.json()["user"]["partner_code"]
        self.assertRegex(code,r"^VVD[0-9]{6}$")
        self.assertEqual(result.json()["user"]["telegram_id"],self.first)
        with engine.connect() as conn:
            code_db=conn.execute(text("SELECT partner_code FROM users WHERE telegram_id=:id"),
                                 {"id":self.first}).scalar_one()
        self.assertEqual(code,code_db)

    def test_repeated_login_keeps_code(self):
        first=self.auth(self.first,name="Old").json()["user"]["partner_code"]
        second=self.auth(self.first,name="New").json()["user"]["partner_code"]
        self.assertEqual(first,second)
        with engine.connect() as conn:
            self.assertEqual(conn.execute(text("SELECT count(*) FROM users WHERE telegram_id=:id"),
                                          {"id":self.first}).scalar(),1)

    def test_parallel_distinct_and_same_user(self):
        ids=list(range(START_USER+10,START_USER+20)) + [START_USER+10]*5
        def create(uid):
            response=self.auth(uid)
            if response.status_code!=200:
                raise AssertionError(response.text)
            return uid,response.json()["user"]["partner_code"]
        with concurrent.futures.ThreadPoolExecutor(max_workers=6) as pool:
            data=list(pool.map(create,ids))
        codes={}
        for uid,code in data:
            if uid in codes: self.assertEqual(codes[uid],code)
            else: codes[uid]=code
        self.assertEqual(len(codes),len(set(codes.values())))
        self.assertTrue(all(code.startswith("VVD") for code in codes.values()))

    def test_legacy_code_unchanged(self):
        uid=START_USER+90
        with engine.begin() as conn:
            conn.execute(text("""INSERT INTO users(telegram_id,first_name,partner_code)
              VALUES(:id,'Legacy','OLD-KEEP-TEST') ON CONFLICT(telegram_id)
              DO UPDATE SET partner_code='OLD-KEEP-TEST'"""),{"id":uid})
        self.assertEqual(self.auth(uid).json()["user"]["partner_code"],"OLD-KEEP-TEST")

    def test_forged_and_expired_initdata_denied(self):
        good=signed(self.first)
        bad=good.replace("Example","Other")
        for value in (bad,signed(self.first,offset=-4000),"", "telegram_id=123"):
            r=client.post("/auth",json={"init_data":value})
            self.assertEqual(r.status_code,401,r.text)

    def test_private_data_owner_admin_controls(self):
        self.auth(self.first)
        self.auth(self.second)
        h={"X-Telegram-Init-Data":signed(self.second)}
        own=client.get("/balance/"+str(self.second),headers=h)
        self.assertEqual(own.status_code,200,own.text)
        foreign=client.get("/balance/"+str(self.first),headers=h)
        self.assertEqual(foreign.status_code,403,foreign.text)
        self.assertEqual(client.get("/admin/users",headers=h).status_code,403)
        self.assertEqual(client.get("/balance/"+str(self.first)).status_code,401)
        self.assertEqual(client.get("/statistics/"+str(self.first),headers=h).status_code,403)

    def test_frontend_uses_real_backend_initdata(self):
        code=(ROOT.parent/"src/shared/lib/api.ts").read_text()
        self.assertIn("https://vvd-cpa-v2.onrender.com",code)
        self.assertIn("init_data:initData",code)
        self.assertNotIn("telegram_auth",code)
        self.assertNotIn("getTelegramUser()",code)

if __name__=="__main__":
    unittest.main()
