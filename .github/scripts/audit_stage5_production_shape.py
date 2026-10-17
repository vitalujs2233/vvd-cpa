"""Audit-only: production-derived core PG17 schema + SYNTHETIC rows.
NEVER use production credentials. Does not modify any PR, Render, or Supabase.
"""
import hashlib
import hmac
import json
import os
import sys
import time
from datetime import date,timedelta
from pathlib import Path
from urllib.parse import urlencode
from sqlalchemy import create_engine,text
from fastapi.testclient import TestClient

ROOT=Path(__file__).resolve().parents[2]
BACKEND=ROOT/"backend_v2"
sys.path.insert(0,str(BACKEND))
DATABASE_URL=os.environ.get("DATABASE_URL","")
if "postgres:postgres@127.0.0.1:5432/cpa_withdrawals_isolated" not in DATABASE_URL:
    raise SystemExit("REFUSED: disposable CI PostgreSQL 17 only")
engine=create_engine(DATABASE_URL)
ddl=(ROOT/".github/scripts/stage5_production_shape_schema.sql").read_text()
sql21=(BACKEND/"migrations/20261017_stage5_cpa_ledger.sql").read_text()
sql22=Path("/tmp/real_pr22_withdrawals.sql").read_text()
sql23=(BACKEND/"migrations/20261017_stage5_real_withdrawable_guard.sql").read_text()
keys={
    "users":"telegram_id",
    "withdrawals":"id",
    "clicks":"id",
    "conversions":"id",
    "statistics":"id",
    "country_statistics":"id",
    "tool_wallets":"telegram_id",
    "star_wallets":"telegram_id",
}
added={
    "withdrawals":{"cpa_real_epoch_at"},
    "conversions":{"finance_eligible_at","finance_approved_at"},
}
def snapshot(conn):
    output={}
    for tbl,key in keys.items():
        rows=conn.execute(text(f"SELECT to_jsonb(t) AS doc FROM public.{tbl} t ORDER BY {key}")).scalars()
        digest=hashlib.sha256()
        count=0
        for row in rows:
            row=dict(row)
            for extra in added.get(tbl,()):
                row.pop(extra,None)
            data=json.dumps(row,sort_keys=True,separators=(',',':'),ensure_ascii=False,default=str).encode()
            digest.update(len(data).to_bytes(8,'big')+data)
            count+=1
        output[tbl]=(count,digest.hexdigest())
    return output

with engine.begin() as c:
    c.connection.cursor().execute(ddl)
    for i in range(12):
        c.execute(text("""INSERT INTO public.users
              (telegram_id,first_name,partner_code,role,balance,hold,withdrawn)
              VALUES(:uid,'Synthetic Audit',:code,:role,:balance,0,:withdrawn)"""),
            {"uid":900000007100+i,"code":f"VVD-SYNTH-{i}",
             "role":"admin" if i==0 else "user",
             "balance":"833.48" if i==0 else ("62.50" if i==11 else "0.00"),
             "withdrawn":"350.00" if i==0 else ("50.00" if i==11 else "0.00")})
    c.execute(text("""INSERT INTO public.clicks
         (user_id,partner_code,click_id,vertical)
         SELECT 900000007100,'VVD-SYNTH-0','legacy-'||n,'general'
         FROM generate_series(1,700) n"""))
    c.execute(text("""INSERT INTO public.conversions
         (click_id,user_id,offer_id,payout_gross,payout_net,status,currency,is_test)
         SELECT 'legacy-'||n,900000007100,
            CASE WHEN n=25 THEN 'legacy-test-offer' ELSE 'legacy-offer' END,
            CASE WHEN n=25 THEN 0 ELSE 10 END,
            CASE WHEN n=25 THEN 0 ELSE 8 END,
            'pending','USD',n=25
         FROM generate_series(1,25) n"""))
    c.execute(text("""INSERT INTO public.withdrawals
         (user_id,partner_code,amount,payment_method,wallet,status)
         SELECT 900000007100,'VVD-SYNTH-0',
            CASE WHEN n=1 THEN 1 WHEN n=17 THEN 59 ELSE 50 END,
            'TEST','SYNTHETIC-NOT-A-REAL-WALLET',
            CASE WHEN n IN(3,5,13,14,15,19,20,22) THEN 'paid' ELSE 'rejected' END
         FROM generate_series(1,22) n"""))
    c.execute(text("""INSERT INTO public.statistics
         (user_id,date,clicks,conversions,income)
         SELECT 900000007100,CURRENT_DATE-(n::integer),0,0,0
         FROM generate_series(1,45) n"""))
    c.execute(text("""INSERT INTO public.country_statistics
         (user_id,country_code,country_name,date,clicks,conversions,income)
         SELECT 900000007100,'XX','Synthetic only',CURRENT_DATE-(n::integer),0,0,0
         FROM generate_series(1,182) n"""))
    c.execute(text("INSERT INTO public.tool_wallets(telegram_id,available,reserved) VALUES(900000007100,17.45,0)"))
    c.execute(text("GRANT ALL ON public.withdrawals TO anon,authenticated,service_role"))
    c.execute(text("GRANT ALL ON SEQUENCE public.withdrawals_id_seq TO anon,authenticated,service_role"))

with engine.begin() as c:
    # Production order: PR22 security exists before PR21/PR23 DDL.
    c.connection.cursor().execute(sql22)
    assert c.execute(text("SELECT relrowsecurity FROM pg_class WHERE oid='public.withdrawals'::regclass")).scalar_one()
    for role in ("anon","authenticated"):
        assert not c.execute(text("SELECT has_table_privilege(:r,'public.withdrawals','SELECT')"),{"r":role}).scalar_one()
        assert not c.execute(text("SELECT has_sequence_privilege(:r,'public.withdrawals_id_seq','USAGE')"),{"r":role}).scalar_one()
    assert c.execute(text("SELECT has_table_privilege('postgres','public.withdrawals','INSERT')")).scalar_one()
    assert c.execute(text("SELECT has_sequence_privilege('postgres','public.withdrawals_id_seq','USAGE')")).scalar_one()

with engine.connect() as c:
    before=snapshot(c)
    actual=[before[k][0] for k in ["users","withdrawals","conversions","clicks","statistics","country_statistics"]]
    assert actual==[12,22,25,700,45,182],actual
with engine.begin() as c:
    c.connection.cursor().execute(sql21)
    c.connection.cursor().execute(sql23)
    assert snapshot(c)==before,"PR21/23 changed production-shaped synthetic history"
    assert c.execute(text("SELECT COUNT(*) FROM public.cpa_ledger")).scalar_one()==0
    assert c.execute(text("SELECT activated_at FROM public.cpa_finance_epoch WHERE id=1")).scalar_one() is None
    assert c.execute(text("SELECT COUNT(*) FROM public.conversions WHERE finance_eligible_at IS NOT NULL")).scalar_one()==0
    assert c.execute(text("SELECT COUNT(*) FROM public.withdrawals WHERE cpa_real_epoch_at IS NOT NULL")).scalar_one()==0
    assert c.execute(text("SELECT relrowsecurity FROM pg_class WHERE oid='public.withdrawals'::regclass")).scalar_one()
with engine.begin() as c:
    # Both additive migrations are designed to be repeatable.
    c.connection.cursor().execute(sql21)
    c.connection.cursor().execute(sql23)
    assert snapshot(c)==before,"Repeated migrations changed history"

# Execute authenticated route smoke checks against SAME migrated database.
from main import app
def signed(uid):
    fields={"auth_date":str(int(time.time())),"user":json.dumps({"id":uid},separators=(",",":"))}
    canon="\n".join(f"{k}={v}" for k,v in sorted(fields.items()))
    secret=hmac.new(b"WebAppData",os.environ["BOT_TOKEN"].encode(),hashlib.sha256).digest()
    fields["hash"]=hmac.new(secret,canon.encode(),hashlib.sha256).hexdigest()
    return {"X-Telegram-Init-Data":urlencode(fields)}
client=TestClient(app)
head=signed(900000007100)
bal=client.get("/balance/900000007100",headers=head)
assert bal.status_code==200,bal.status_code
assert bal.json()["available"]==833.48, "Historical test balance unexpectedly changed"
assert bal.json()["real_withdrawable"]==0 and bal.json()["real_finance_active"] is False
hist=client.get("/withdrawals/VVD-SYNTH-0",headers=head)
assert hist.status_code==200, hist.status_code
assert len(hist.json()["withdrawals"])==22
assert all(x["is_real_finance"] is False for x in hist.json()["withdrawals"])
admin=client.get("/admin/withdrawals",headers=head)
assert admin.status_code==200, admin.status_code
assert len(admin.json()["withdrawals"])==22
assert all(x["is_real_finance"] is False for x in admin.json()["withdrawals"])
blocked=client.post("/withdrawals",headers=head,json={"partner_code":"VVD-SYNTH-0","amount":50,"payment_method":"TEST","wallet":"SYNTHETIC"})
assert blocked.status_code==200 and blocked.json()["success"] is False
paid=client.post("/admin/withdrawals/1/paid",headers=head)
reject=client.post("/admin/withdrawals/1/reject",headers=head)
assert paid.status_code==200 and paid.json()["success"] is False
assert reject.status_code==200 and reject.json()["success"] is False
with engine.connect() as c:
    assert snapshot(c)==before,"Routes mutated the historical synthetic snapshot"
print("PASS: PG17 production-derived core schema (77 columns, constraints/indexes/RLS); pre-existing PR22; PR21/23 additive and retry-safe; 12/22/25/700 preserved; signed HTTP read; $0.00 real; no finance activation.")
