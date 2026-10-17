"""Stage 3 neutral-link integration tests on the CI PostgreSQL fixture.

Never contacts partner sites: FastAPI TestClient is told not to follow redirects.
"""
import concurrent.futures
import hashlib
import hmac
import json
import os
import sys
import time
import unittest
import uuid
from pathlib import Path
from urllib.parse import urlencode, urlsplit, parse_qs
from fastapi.testclient import TestClient
from sqlalchemy import text

ROOT=Path(__file__).resolve().parents[1]
sys.path.insert(0,str(ROOT))
from database import engine
from main import app
client=TestClient(app,follow_redirects=False)
ADMIN=232682307
FIRST=900000005101
SECOND=900000005102

def headers(uid):
    data={"auth_date":str(int(time.time())),"user":json.dumps({"id":uid},separators=(",",":"))}
    check="\n".join(f"{k}={v}" for k,v in sorted(data.items()))
    key=hmac.new(b"WebAppData",os.environ["BOT_TOKEN"].encode(),hashlib.sha256).digest()
    data["hash"]=hmac.new(key,check.encode(),hashlib.sha256).hexdigest()
    return {"X-Telegram-Init-Data":urlencode(data)}

class NeutralLinkTests(unittest.TestCase):
    @classmethod
    def setUpClass(cls):
        cls.tag=uuid.uuid4().hex[:8]
        cls.offers=["neutral-"+cls.tag,"neutral2-"+cls.tag]
        cls.network="NeutralNet-"+cls.tag
        with engine.begin() as conn:
            conn.execute(text("""CREATE TABLE IF NOT EXISTS users (
                telegram_id BIGINT PRIMARY KEY,first_name TEXT,partner_code TEXT,
                status TEXT NOT NULL DEFAULT 'active',role TEXT NOT NULL DEFAULT 'user',
                balance NUMERIC(12,2) NOT NULL DEFAULT 0,
                hold NUMERIC(12,2) NOT NULL DEFAULT 0,
                withdrawn NUMERIC(12,2) NOT NULL DEFAULT 0)"""))
            conn.execute(text("INSERT INTO users(telegram_id,first_name,partner_code,status,role) VALUES(232682307,'TestAdmin','VVDADMIN','active','admin') ON CONFLICT(telegram_id) DO UPDATE SET role='admin'"))
            conn.execute(text("CREATE TABLE IF NOT EXISTS offers(id VARCHAR(80) PRIMARY KEY,title VARCHAR(200) NOT NULL)"))
            for definition in ("description TEXT","icon_name VARCHAR(30)","geo VARCHAR(300)"):
                conn.execute(text("ALTER TABLE offers ADD COLUMN IF NOT EXISTS "+definition))
            stage2=(ROOT/"migrations/20261016_stage2_catalog.sql").read_text()
            stage2="\n".join(x for x in stage2.splitlines() if not x.lstrip().startswith("REVOKE "))
            conn.connection.cursor().execute(stage2)
            conn.execute(text("""CREATE TABLE IF NOT EXISTS smartlinks (
               id UUID PRIMARY KEY DEFAULT gen_random_uuid(),user_id BIGINT NOT NULL,
               offer_id VARCHAR(80) NOT NULL,suffix VARCHAR(100) NOT NULL UNIQUE,
               url TEXT NOT NULL,created_at TIMESTAMPTZ DEFAULT NOW()
            )"""))
            conn.execute(text("""CREATE TABLE IF NOT EXISTS clicks (
               id BIGSERIAL PRIMARY KEY,user_id BIGINT NOT NULL,
               partner_code VARCHAR(50) NOT NULL,click_id VARCHAR(80) NOT NULL UNIQUE,
               vertical VARCHAR(100) NOT NULL,created_at TIMESTAMP DEFAULT NOW()
            )"""))
            conn.execute(text("ALTER TABLE smartlinks ALTER COLUMN id SET DEFAULT gen_random_uuid()"))
            stage3=(ROOT/"migrations/20261016_stage3_neutral_links.sql").read_text()
            stage3="\n".join(x for x in stage3.splitlines() if not x.lstrip().startswith("REVOKE "))
            conn.connection.cursor().execute(stage3)
            conn.execute(text("ALTER TABLE cpa_networks ADD COLUMN IF NOT EXISTS click_param VARCHAR(48)"))
            conn.connection.cursor().execute((ROOT/"migrations/20261017_universal_cpa_integrations.sql").read_text())
            conn.execute(text("UPDATE cpa_verticals SET cpa_link_allowed=TRUE WHERE slug='utilities'"))
            conn.execute(text("""INSERT INTO users(telegram_id,first_name,partner_code,status)
               VALUES(:id,'Tester',:code,'active') ON CONFLICT(telegram_id)
               DO UPDATE SET partner_code=EXCLUDED.partner_code,status='active'"""),
               {"id":FIRST,"code":"VVD951001"})
            conn.execute(text("""INSERT INTO users(telegram_id,first_name,partner_code,status)
               VALUES(:id,'Tester',:code,'active') ON CONFLICT(telegram_id)
               DO UPDATE SET partner_code=EXCLUDED.partner_code,status='active'"""),
               {"id":SECOND,"code":"VVD951002"})
        network=client.post("/cpa/admin/networks",headers=headers(ADMIN),json={
            "name":cls.network,"website":"https://example.com","click_param":"tracking_key","partner_param":"sub1",
            "is_active":True})
        if network.status_code!=200:raise AssertionError(network.text)
        cls.net_id=network.json()["id"]
        vert=client.post("/cpa/admin/verticals",headers=headers(ADMIN),json={
            "slug":"utilities","title":"Utilities","is_active":True,"cpa_link_allowed":True})
        if vert.status_code==409:
            client.put("/cpa/admin/verticals/utilities",headers=headers(ADMIN),json={"slug":"utilities","title":"Utilities","is_active":True,"cpa_link_allowed":True})
        elif vert.status_code!=200:
            raise AssertionError(vert.text)
        with engine.begin() as conn:
            for oid in cls.offers:
                conn.execute(text("""INSERT INTO offers(id,title,vertical_slug,network_id,
                  source_url,status,offer_type,click_param_override,description,icon_name,geo)
                  VALUES(:id,'Neutral test', 'utilities',:network,
                  'https://example.com/item?existing=keep','published','smartlink',NULL,'','layers','')"""),
                  {"id":oid,"network":cls.net_id})

    @classmethod
    def tearDownClass(cls):
        with engine.begin() as conn:
            conn.execute(text("DELETE FROM clicks WHERE offer_id IN (:a,:b)"),
                         {"a":cls.offers[0],"b":cls.offers[1]})
            conn.execute(text("DELETE FROM smartlinks WHERE offer_id IN (:a,:b)"),
                         {"a":cls.offers[0],"b":cls.offers[1]})
            conn.execute(text("DELETE FROM offers WHERE id IN (:a,:b)"),
                         {"a":cls.offers[0],"b":cls.offers[1]})
            conn.execute(text("DELETE FROM cpa_networks WHERE id=:id"),{"id":cls.net_id})
            conn.execute(text("DELETE FROM users WHERE telegram_id IN (:a,:b)"),
                         {"a":FIRST,"b":SECOND})

    def test_00_active_offer_executes_real_postgres_sql(self):
        # Execute the actual production SQL against isolated PostgreSQL 17.
        from neutral_links import _active_offer
        from fastapi import HTTPException
        with engine.begin() as conn:
            row=_active_offer(conn,self.offers[0])
            self.assertEqual(row["id"],self.offers[0])
            self.assertTrue(row["vertical_allowed"])
            conn.execute(text("UPDATE cpa_verticals SET cpa_link_allowed=FALSE WHERE slug='utilities'"))
            with self.assertRaises(HTTPException) as denied:
                _active_offer(conn,self.offers[0])
            self.assertEqual(denied.exception.status_code,404)
            conn.execute(text("UPDATE cpa_verticals SET cpa_link_allowed=TRUE WHERE slug='utilities'"))

    def test_a_owners_unique_stable_and_separate_offers(self):
        first=client.post("/cpa/links/"+self.offers[0],headers=headers(FIRST))
        self.assertEqual(first.status_code,200,first.text)
        url=first.json()["url"]
        self.assertEqual(client.get("/cpa/links/"+self.offers[0],headers=headers(FIRST)).json()["url"],url)
        self.assertEqual(client.post("/cpa/links/"+self.offers[0],headers=headers(FIRST)).json()["url"],url)
        second=client.post("/cpa/links/"+self.offers[0],headers=headers(SECOND)).json()["url"]
        other=client.post("/cpa/links/"+self.offers[1],headers=headers(FIRST)).json()["url"]
        self.assertEqual(len({url,second,other}),3)
        self.assertEqual(client.get("/cpa/links/"+self.offers[0],headers=headers(SECOND)).json()["url"],second)
        self.assertEqual(client.post("/cpa/links/"+self.offers[0],headers={"X-Telegram-Init-Data":"forged"}).status_code,401)
        self.assertEqual(client.post("/cpa/links/"+self.offers[0]).status_code,401)

    def test_b_clicks_and_redirect(self):
        url=client.post("/cpa/links/"+self.offers[0],headers=headers(FIRST)).json()["url"]
        path=urlsplit(url).path
        a=client.get(path)
        b=client.get(path)
        self.assertEqual(a.status_code,302,a.text)
        self.assertEqual(b.status_code,302,b.text)
        aa=parse_qs(urlsplit(a.headers["location"]).query)
        bb=parse_qs(urlsplit(b.headers["location"]).query)
        self.assertEqual(aa["existing"],["keep"])
        self.assertEqual(bb["existing"],["keep"])
        self.assertEqual(aa["sub1"],["VVD951001"])
        self.assertEqual(bb["sub1"],["VVD951001"])
        self.assertNotEqual(aa["tracking_key"],bb["tracking_key"])
        self.assertEqual(urlsplit(a.headers["location"]).hostname,"example.com")
        with engine.connect() as conn:
            values=conn.execute(text("""SELECT user_id,partner_code,offer_id,vertical,
                 network_id,click_id FROM clicks WHERE offer_id=:id"""),{"id":self.offers[0]}).mappings().all()
        self.assertGreaterEqual(len(values),2)
        self.assertTrue(all(x["user_id"]==FIRST and x["partner_code"]=="VVD951001"
                and x["network_id"]==self.net_id and x["vertical"]=="utilities" for x in values))
        self.assertEqual(len({x["click_id"] for x in values}),len(values))

    def test_b2_distinct_webmasters_and_attribution(self):
        a=client.post("/cpa/links/"+self.offers[0],headers=headers(FIRST)).json()["url"]
        b=client.post("/cpa/links/"+self.offers[0],headers=headers(SECOND)).json()["url"]
        one=client.get(urlsplit(a).path)
        two=client.get(urlsplit(b).path)
        self.assertEqual(one.status_code,302)
        self.assertEqual(two.status_code,302)
        x=parse_qs(urlsplit(one.headers["location"]).query)
        y=parse_qs(urlsplit(two.headers["location"]).query)
        self.assertEqual(x["sub1"],["VVD951001"])
        self.assertEqual(y["sub1"],["VVD951002"])
        self.assertEqual(x["existing"],["keep"])
        self.assertEqual(y["existing"],["keep"])
        self.assertNotEqual(x["tracking_key"],y["tracking_key"])
        with engine.connect() as conn:
            rows=conn.execute(text("SELECT click_id,partner_code,user_id FROM clicks WHERE click_id IN (:a,:b)"),
              {"a":x["tracking_key"][0],"b":y["tracking_key"][0]}).mappings().all()
        self.assertEqual({(r["partner_code"],r["user_id"]) for r in rows},
                         {("VVD951001",FIRST),("VVD951002",SECOND)})

    def test_b3_reject_collisions_and_existing_partner_query(self):
        from neutral_links import _validated_destination
        from fastapi import HTTPException
        for source in ("https://example.com/item?sub1=forged",
                       "https://example.com/item?tracking_key=forged"):
            with self.assertRaises(HTTPException):
                _validated_destination(source,"tracking_key","synthetic","sub1","VVD951001")
        with self.assertRaises(HTTPException):
            _validated_destination("https://example.com/item","sub1","synthetic","sub1","VVD951001")

    def test_c_disabled_blocks_and_keeps_old_routes(self):
        url=client.post("/cpa/links/"+self.offers[0],headers=headers(FIRST)).json()["url"]
        offer=next(x for x in client.get("/cpa/admin/offers",headers=headers(ADMIN)).json()["items"] if x["id"]==self.offers[0])
        offer["status"]="disabled"
        self.assertEqual(client.put("/cpa/admin/offers/"+self.offers[0],headers=headers(ADMIN),json=offer).status_code,200)
        self.assertEqual(client.get(urlsplit(url).path).status_code,404)
        self.assertEqual(client.post("/cpa/links/"+self.offers[0],headers=headers(SECOND)).status_code,404)
        self.assertIn("/go/{partner_code}/{vertical}",[getattr(r,'path','') for r in app.routes])
        self.assertIn("/smartlink/{telegram_id}/{vertical}",[getattr(r,'path','') for r in app.routes])

    def test_d_parallel_idempotent(self):
        response=client.put("/cpa/admin/offers/"+self.offers[0],headers=headers(ADMIN),json={
            **next(x for x in client.get("/cpa/admin/offers",headers=headers(ADMIN)).json()["items"] if x["id"]==self.offers[0]),
            "status":"published"})
        self.assertEqual(response.status_code,200,response.text)
        def create(_):
            r=client.post("/cpa/links/"+self.offers[1],headers=headers(SECOND))
            self.assertEqual(r.status_code,200,r.text)
            return r.json()["url"]
        with concurrent.futures.ThreadPoolExecutor(max_workers=5) as pool:
            links=list(pool.map(create,range(8)))
        self.assertEqual(len(set(links)),1)
        with engine.connect() as conn:
            n=conn.execute(text("SELECT COUNT(*) FROM smartlinks WHERE user_id=:uid AND offer_id=:oid"),
                           {"uid":SECOND,"oid":self.offers[1]}).scalar_one()
        self.assertEqual(n,1)

if __name__=="__main__":unittest.main()
