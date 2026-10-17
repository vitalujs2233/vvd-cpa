"""Isolated, synthetic CI-only cross-PR migration-order audit. NEVER production."""
import hashlib
import json
import os
from pathlib import Path
from sqlalchemy import create_engine, text

if "127.0.0.1:5432/cpa_withdrawals_isolated" not in os.getenv("DATABASE_URL",""):
    raise SystemExit("Refusing to run outside isolated GitHub PostgreSQL 17")
engine = create_engine(os.environ["DATABASE_URL"])
root = Path(__file__).resolve().parents[2] / "backend_v2" / "migrations"
sql22 = Path("/tmp/real_pr22_withdrawals.sql").read_text()
sql21 = (root/"20261017_stage5_cpa_ledger.sql").read_text()
sql23 = (root/"20261017_stage5_real_withdrawable_guard.sql").read_text()

with engine.begin() as c:
    c.execute(text("""DO $r$ BEGIN
        IF NOT EXISTS (SELECT 1 FROM pg_roles WHERE rolname='anon') THEN CREATE ROLE anon NOLOGIN; END IF;
        IF NOT EXISTS (SELECT 1 FROM pg_roles WHERE rolname='authenticated') THEN CREATE ROLE authenticated NOLOGIN; END IF;
        IF NOT EXISTS (SELECT 1 FROM pg_roles WHERE rolname='service_role') THEN CREATE ROLE service_role NOLOGIN BYPASSRLS; END IF;
    END $r$;"""))
    c.execute(text("""CREATE TABLE public.users(
         telegram_id BIGINT PRIMARY KEY, first_name TEXT NOT NULL,
         last_name TEXT, username TEXT, status TEXT NOT NULL DEFAULT 'active',
         partner_code TEXT UNIQUE, balance NUMERIC(12,2) DEFAULT 0 NOT NULL,
         hold NUMERIC(12,2) DEFAULT 0 NOT NULL, withdrawn NUMERIC(12,2) DEFAULT 0 NOT NULL,
         role TEXT NOT NULL DEFAULT 'user')"""))
    c.execute(text("""CREATE TABLE public.clicks(
         id BIGSERIAL PRIMARY KEY, user_id BIGINT NOT NULL,
         partner_code TEXT NOT NULL, click_id VARCHAR(120) NOT NULL UNIQUE,
         created_at TIMESTAMPTZ NOT NULL DEFAULT now())"""))
    c.execute(text("""CREATE TABLE public.conversions(
         id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
         click_id VARCHAR(120) NOT NULL UNIQUE,user_id BIGINT NOT NULL REFERENCES public.users(telegram_id),
         offer_id VARCHAR(80) NOT NULL,payout_gross NUMERIC(12,4) NOT NULL,
         payout_net NUMERIC(12,4) NOT NULL,status VARCHAR(30) NOT NULL,
         currency VARCHAR(3),is_test BOOLEAN NOT NULL DEFAULT FALSE,
         created_at TIMESTAMPTZ NOT NULL DEFAULT now())"""))
    c.execute(text("""CREATE TABLE public.withdrawals(
         id BIGSERIAL PRIMARY KEY,user_id BIGINT NOT NULL,
         partner_code TEXT, amount NUMERIC(12,2) NOT NULL,
         payment_method TEXT NOT NULL, wallet TEXT NOT NULL,
         status VARCHAR(30) NOT NULL, created_at TIMESTAMP NOT NULL DEFAULT now(),
         processed_at TIMESTAMP)"""))
    c.execute(text("CREATE TABLE public.statistics(id BIGSERIAL PRIMARY KEY, income NUMERIC(12,2) NOT NULL)"))
    c.execute(text("CREATE TABLE public.country_statistics(id BIGSERIAL PRIMARY KEY, income NUMERIC(12,2) NOT NULL)"))
    c.execute(text("CREATE TABLE public.tool_wallets(id BIGSERIAL PRIMARY KEY, balance NUMERIC(12,2) NOT NULL)"))
    c.execute(text("INSERT INTO public.tool_wallets(balance) VALUES(17.45)"))
    for i in range(12):
        c.execute(text("""INSERT INTO public.users(telegram_id,first_name,partner_code,balance,withdrawn)
            VALUES(:uid,'CI',:code,:balance,:withdrawn)"""),
            {"uid":900000007100+i,"code":"VVD-AUDIT-"+str(i),
             "balance":"833.48" if i==0 else ("62.50" if i==11 else "0.00"),
             "withdrawn":"350.00" if i==0 else ("50.00" if i==11 else "0.00")})
        if i==0:
            c.execute(text("UPDATE public.users SET role=\'admin\' WHERE telegram_id=900000007100"))
    c.execute(text("""INSERT INTO public.clicks(user_id,partner_code,click_id)
         SELECT 900000007100,'VVD-AUDIT-0','legacy-'||n FROM generate_series(1,700) n"""))
    c.execute(text("""INSERT INTO public.conversions(click_id,user_id,offer_id,payout_gross,payout_net,status,currency,is_test)
         SELECT 'legacy-'||n,900000007100,'legacy',10,8,'1','USD',n=25
         FROM generate_series(1,25) n"""))
    c.execute(text("""INSERT INTO public.withdrawals(user_id,partner_code,amount,payment_method,wallet,status)
         SELECT 900000007100,'VVD-AUDIT-0',
                CASE WHEN n=1 THEN 1 WHEN n=17 THEN 59 ELSE 50 END,
                'TEST','PRIVATE-TEST-ONLY',CASE WHEN n IN(3,5,13,14,15,19,20,22)
                THEN 'paid' ELSE 'rejected' END
         FROM generate_series(1,22) n"""))
    c.execute(text("INSERT INTO public.statistics(income) SELECT 1 FROM generate_series(1,45)"))
    c.execute(text("INSERT INTO public.country_statistics(income) SELECT 2 FROM generate_series(1,182)"))
    c.execute(text("GRANT ALL ON public.withdrawals TO anon,authenticated,service_role"))
    c.execute(text("GRANT ALL ON SEQUENCE public.withdrawals_id_seq TO anon,authenticated,service_role"))

def snapshot(c):
    return tuple(c.execute(text(q)).scalar_one() for q in (
        "SELECT COUNT(*) FROM public.users",
        "SELECT COUNT(*) FROM public.withdrawals",
        "SELECT COUNT(*) FROM public.conversions",
        "SELECT COUNT(*) FROM public.clicks",
        "SELECT COUNT(*) FROM public.statistics",
        "SELECT COUNT(*) FROM public.country_statistics",
        "SELECT COALESCE(SUM(balance),0) FROM public.users",
        "SELECT COALESCE(SUM(hold),0) FROM public.users",
        "SELECT COALESCE(SUM(withdrawn),0) FROM public.users",
        "SELECT COALESCE(SUM(amount),0) FROM public.withdrawals",
        "SELECT COALESCE(SUM(balance),0) FROM public.tool_wallets",
        "SELECT md5(coalesce(string_agg(md5(jsonb_build_array(t.id,t.user_id,t.partner_code,t.amount,t.payment_method,t.wallet,t.status,t.created_at,t.processed_at)::text),'|' ORDER BY id),'')) FROM public.withdrawals t",
        "SELECT md5(coalesce(string_agg(md5(jsonb_build_array(t.telegram_id,t.first_name,t.partner_code,t.balance,t.hold,t.withdrawn,t.role)::text),'|' ORDER BY telegram_id),'')) FROM public.users t",
        "SELECT md5(coalesce(string_agg(md5(jsonb_build_array(t.id,t.click_id,t.user_id,t.offer_id,t.payout_gross,t.payout_net,t.status,t.currency,t.is_test,t.created_at)::text),'|' ORDER BY id),'')) FROM public.conversions t",
        "SELECT md5(coalesce(string_agg(md5(jsonb_build_array(t.id,t.user_id,t.partner_code,t.click_id,t.created_at)::text),'|' ORDER BY id),'')) FROM public.clicks t",
        "SELECT md5(coalesce(string_agg(md5(jsonb_build_array(t.id,t.income)::text),'|' ORDER BY id),'')) FROM public.statistics t",
        "SELECT md5(coalesce(string_agg(md5(jsonb_build_array(t.id,t.income)::text),'|' ORDER BY id),'')) FROM public.country_statistics t",
        "SELECT md5(coalesce(string_agg(md5(jsonb_build_array(t.id,t.balance)::text),'|' ORDER BY id),'')) FROM public.tool_wallets t",
    ))

with engine.begin() as c:
    before = snapshot(c)
    assert before[:6] == (12,22,25,700,45,182), before[:6]
    assert str(before[6])=="895.98" and str(before[8])=="400.00", before
    assert str(before[9])=="1060.00", before[9]
    # Simulate PRODUCTION reality: PR22 RLS/sequence ACLs ALREADY applied.
    c.connection.cursor().execute(sql22)
    assert c.execute(text("SELECT relrowsecurity FROM pg_class WHERE oid='public.withdrawals'::regclass")).scalar_one()
    for role in ("anon","authenticated"):
        for privilege in ("SELECT","INSERT","UPDATE","DELETE"):
            assert not c.execute(text("SELECT has_table_privilege(:r,'public.withdrawals',:p)"),{"r":role,"p":privilege}).scalar_one()
        for privilege in ("USAGE","SELECT","UPDATE"):
            assert not c.execute(text("SELECT has_sequence_privilege(:r,'public.withdrawals_id_seq',:p)"),{"r":role,"p":privilege}).scalar_one()
    assert c.execute(text("SELECT has_sequence_privilege('postgres','public.withdrawals_id_seq','USAGE')")).scalar_one()
    c.connection.cursor().execute(sql21)
    c.connection.cursor().execute(sql23)
    assert snapshot(c) == before,"MIGRATIONS ALTERED HISTORICAL DATA"
    assert c.execute(text("SELECT COUNT(*) FROM public.cpa_ledger")).scalar_one()==0
    assert c.execute(text("SELECT activated_at FROM public.cpa_finance_epoch WHERE id=1")).scalar_one() is None
    assert c.execute(text("SELECT COUNT(*) FROM public.conversions WHERE finance_eligible_at IS NOT NULL")).scalar_one()==0
    assert c.execute(text("SELECT COUNT(*) FROM public.withdrawals WHERE cpa_real_epoch_at IS NOT NULL")).scalar_one()==0
    assert c.execute(text("SELECT relrowsecurity FROM pg_class WHERE oid='public.withdrawals'::regclass")).scalar_one()
    # Reapply PR21/PR23 to test safe retries; no state changes.
    c.connection.cursor().execute(sql21)
    c.connection.cursor().execute(sql23)
    assert snapshot(c)==before
    # Complete additive stage-5 chain, including funding and payout proofs.
    for version in ("20261017_stage5_manual_hold_release.sql",
                    "20261017_stage5_settled_payouts.sql"):
        c.connection.cursor().execute((root/version).read_text())
    assert snapshot(c)==before,"Stage 5.4/5.5 changed historic finance data"
    assert c.execute(text("SELECT count(*) FROM public.cpa_payout_proofs")).scalar_one()==0
    assert c.execute(text("SELECT count(*) FROM public.cpa_conversion_disputes")).scalar_one()==0

# Same database, now migrated with the exact three-PR sequence; signed,
# isolated FastAPI routes must never create/approve real finance before launch.
import hmac
import time
from urllib.parse import urlencode
from fastapi.testclient import TestClient
import sys
sys.path.insert(0,str(Path(__file__).resolve().parents[2]/'backend_v2'))
from main import app

def signed(uid):
    fields={"auth_date":str(int(time.time())),"user":json.dumps({"id":uid},separators=(",",":"))}
    string="\n".join(f"{k}={v}" for k,v in sorted(fields.items()))
    digest=hmac.new(b"WebAppData",os.environ["BOT_TOKEN"].encode(),hashlib.sha256).digest()
    fields["hash"]=hmac.new(digest,string.encode(),hashlib.sha256).hexdigest()
    return {"X-Telegram-Init-Data":urlencode(fields)}

client=TestClient(app)
h=signed(900000007100)
read_balance=client.get("/balance/900000007100",headers=h)
assert read_balance.status_code==200,read_balance.status_code
assert read_balance.json()["available"]==833.48,read_balance.json()
history=client.get("/withdrawals/VVD-AUDIT-0",headers=h)
assert history.status_code==200 and len(history.json()["withdrawals"])==22
admin_history=client.get("/admin/withdrawals",headers=h)
assert admin_history.status_code==200,admin_history.status_code
assert len(admin_history.json()["withdrawals"])==22
assert all(row["is_real_finance"] is False for row in admin_history.json()["withdrawals"])
pending=client.post("/withdrawals",headers=h,json={
  "partner_code":"VVD-AUDIT-0","amount":50,
  "payment_method":"TEST","wallet":"SYNTHETIC-NOT-PAYABLE"
})
assert pending.status_code==200 and pending.json()["success"] is False,pending.text
confirmed=client.post("/admin/withdrawals/1/paid",headers=h)
assert confirmed.status_code==200 and confirmed.json()["success"] is False,confirmed.text
rejected=client.post("/admin/withdrawals/1/reject",headers=h)
assert rejected.status_code==200 and rejected.json()["success"] is False,rejected.text
with engine.connect() as c:
    assert snapshot(c)==before,"HTTP audit modified historical financial state"
print("PASS: fully migrated schema + signed backend reads; 22 legacy requests; no real payout when cutover disabled; legacy balance still exposed to UI")

print("PASS: exact PR22 => PR21 => PR23; PG17 isolated; 12/22/25/700 and both statistics tables preserved; RLS intact; epoch disabled; no ledger credits")
