"""Stage 2 isolated CPA catalog tests. Existing click/ledger tables are untouched."""
import hashlib,hmac,json,os,sys,time,unittest,uuid
from pathlib import Path
from urllib.parse import urlencode
from fastapi.testclient import TestClient
from sqlalchemy import text
ROOT=Path(__file__).resolve().parents[1]
sys.path.insert(0,str(ROOT))
from database import engine
from main import app
client=TestClient(app)
ADMIN=232682307
WEBMASTER=900000003951

def signed(uid):
    data={"auth_date":str(int(time.time())),"user":json.dumps({"id":uid},separators=(",",":"))}
    check="\n".join(f"{k}={v}" for k,v in sorted(data.items()))
    key=hmac.new(b"WebAppData",os.environ["BOT_TOKEN"].encode(),hashlib.sha256).digest()
    data["hash"]=hmac.new(key,check.encode(),hashlib.sha256).hexdigest()
    return {"X-Telegram-Init-Data":urlencode(data)}

class StageTwoCatalogTests(unittest.TestCase):
    @classmethod
    def setUpClass(cls):
        with engine.begin() as conn:
            conn.execute(text("""CREATE TABLE IF NOT EXISTS public.offers(
              id VARCHAR(80) PRIMARY KEY,title VARCHAR(200) NOT NULL)"""))
            # Other isolated CI suites create minimal offers(id,title) tables.
            # Populate the original production columns for catalog API tests.
            for definition in (
                "description TEXT","icon_name VARCHAR(30)","geo VARCHAR(300)",
                "smartlink_suffix VARCHAR(120) NOT NULL DEFAULT ''",
            ):
                conn.execute(text("ALTER TABLE public.offers ADD COLUMN IF NOT EXISTS "+definition))
            sql=(ROOT/"migrations/20261016_stage2_catalog.sql").read_text()
            # CI plain PostgreSQL has no Supabase anon/authenticated roles.
            sql="\n".join(line for line in sql.splitlines() if not line.lstrip().startswith("REVOKE "))
            conn.connection.cursor().execute(sql)
            conn.execute(text("ALTER TABLE cpa_networks ADD COLUMN IF NOT EXISTS click_param VARCHAR(48)"))
            conn.execute(text("ALTER TABLE offers ADD COLUMN IF NOT EXISTS click_param_override VARCHAR(48)"))
            conn.execute(text("""INSERT INTO public.users(telegram_id,first_name)
             VALUES(:id,'CatalogTester') ON CONFLICT DO NOTHING"""),{"id":WEBMASTER})
        cls.suffix=uuid.uuid4().hex[:8]
        cls.slug="testcatalog-"+cls.suffix
        cls.offer="testoffer-"+cls.suffix

    @classmethod
    def tearDownClass(cls):
        with engine.begin() as conn:
            conn.execute(text("DELETE FROM public.offers WHERE id=:id"),{"id":cls.offer})
            conn.execute(text("DELETE FROM public.cpa_verticals WHERE slug=:slug"),{"slug":cls.slug})
            conn.execute(text("DELETE FROM public.cpa_networks WHERE name=:name"),{"name":"Network-"+cls.suffix})
            conn.execute(text("DELETE FROM public.users WHERE telegram_id=:uid"),{"uid":WEBMASTER})

    def test_a_admin_creates_network_vertical_and_offer(self):
        h=signed(ADMIN)
        net=client.post("/cpa/admin/networks",headers=h,json={
            "name":"Network-"+self.suffix,"website":"https://example.com","description":"Supplier","is_active":True})
        self.assertEqual(net.status_code,200,net.text)
        type(self).network_id=net.json()["id"]
        v=client.post("/cpa/admin/verticals",headers=h,json={
            "slug":self.slug,"title":"Sample vertical","description":"Sample","icon_name":"layers","is_active":True})
        self.assertEqual(v.status_code,200,v.text)
        o=client.post("/cpa/admin/offers",headers=h,json={
            "id":self.offer,"title":"Sample offer","vertical_slug":self.slug,
            "network_id":self.network_id,"status":"published",
            "source_url":"https://example.com/private-affiliate-url",
            "payout_terms":"Published conditions"})
        self.assertEqual(o.status_code,200,o.text)
        self.assertEqual(client.get("/cpa/catalog").status_code,200)
        result=client.get("/cpa/catalog/"+self.slug).json()
        self.assertEqual(len(result["offers"]),1)
        self.assertNotIn("source_url",result["offers"][0])
        self.assertNotIn("network_id",result["offers"][0])
        self.assertEqual(result["offers"][0]["title"],"Sample offer")
        self.assertEqual(next(x for x in client.get("/cpa/catalog").json()["verticals"] if x["slug"]==self.slug)["offers_count"],1)

    def test_ay_second_offer_unique_suffix_and_admin_listing(self):
        h=signed(ADMIN)
        oid="vvd-test-smartlink-"+self.suffix
        try:
            response=client.post("/cpa/admin/offers",headers=h,json={
                "id":oid,"title":"Neutral Utilities Smartlink",
                "vertical_slug":self.slug,"network_id":self.network_id,
                "offer_type":"smartlink","status":"draft",
                "source_url":"https://example.com/test"})
            self.assertEqual(response.status_code,200,response.text)
            with engine.connect() as conn:
                suffixes=conn.execute(text("""
                    SELECT id,smartlink_suffix FROM offers
                    WHERE id IN (:first,:second)
                """),{"first":self.offer,"second":oid}).mappings().all()
            self.assertEqual(len(suffixes),2)
            self.assertEqual(len({x["smartlink_suffix"] for x in suffixes}),2)
            offers=client.get("/cpa/admin/offers",headers=h).json()["items"]
            created=next(x for x in offers if x["id"]==oid)
            self.assertEqual(created["vertical_slug"],self.slug)
            self.assertEqual(created["status"],"draft")
            # Only a genuine offer ID conflict is described as such.
            duplicate=client.post("/cpa/admin/offers",headers=h,json={
                "id":oid,"title":"Another","vertical_slug":self.slug,
                "network_id":self.network_id,"status":"draft"})
            self.assertEqual(duplicate.status_code,409,duplicate.text)
        finally:
            with engine.begin() as conn:
                conn.execute(text("DELETE FROM offers WHERE id=:id"),{"id":oid})

    def test_az_reject_unconfigured_published_smartlink(self):
        h=signed(ADMIN)
        base={
            "id":"missing-source-"+self.suffix,
            "title":"Unconfigured smartlink","vertical_slug":self.slug,
            "network_id":self.network_id,"offer_type":"smartlink",
            "status":"published",
        }
        missing=client.post("/cpa/admin/offers",headers=h,json=base)
        self.assertEqual(missing.status_code,422,missing.text)
        network=next(x for x in client.get("/cpa/admin/networks",headers=h).json()["items"] if x["id"]==self.network_id)
        network["is_active"]=False
        self.assertEqual(client.put("/cpa/admin/networks/"+str(self.network_id),headers=h,json=network).status_code,200)
        disabled=client.post("/cpa/admin/offers",headers=h,json={
            **base,"source_url":"https://example.com/affiliate"})
        self.assertEqual(disabled.status_code,422,disabled.text)
        network["is_active"]=True
        self.assertEqual(client.put("/cpa/admin/networks/"+str(self.network_id),headers=h,json=network).status_code,200)

    def test_b_disabled_offer_disappears_and_owner_only(self):
        h=signed(ADMIN)
        payload=next(x for x in client.get("/cpa/admin/offers",headers=h).json()["items"] if x["id"]==self.offer)
        payload["status"]="disabled"
        r=client.put("/cpa/admin/offers/"+self.offer,headers=h,json=payload)
        self.assertEqual(r.status_code,200,r.text)
        self.assertEqual(client.get("/cpa/catalog/"+self.slug).json()["offers"],[])
        self.assertEqual(client.get("/cpa/catalog/"+self.slug+"/"+self.offer).status_code,404)
        self.assertEqual(client.post("/cpa/admin/networks",headers=signed(WEBMASTER),
                         json={"name":"Unauthorized"}).status_code,403)
        self.assertIn(client.get("/cpa/admin/offers",headers=signed(WEBMASTER)).status_code,(401,403))
        self.assertEqual(client.get("/cpa/admin/networks").status_code,401)

    def test_d_edit_persist_and_shared_vertical_marketplace(self):
        h=signed(ADMIN)
        original=next(x for x in client.get("/cpa/admin/offers",headers=h).json()["items"] if x["id"]==self.offer)
        try:
            # Editing an existing offer keeps its stable ID, preserves the
            # provider URL in private storage and applies updated commission/hold.
            changed={**original,"status":"published","offer_type":"smartlink",
                     "source_url":"https://example.com/new-neutral-smartlink",
                     "commission_percent":"17.5","hold_override_days":14}
            r=client.put("/cpa/admin/offers/"+self.offer,headers=h,json=changed)
            self.assertEqual(r.status_code,200,r.text)
            persisted=next(x for x in client.get("/cpa/admin/offers",headers=h).json()["items"] if x["id"]==self.offer)
            self.assertEqual(persisted["source_url"],changed["source_url"])
            self.assertEqual(float(persisted["commission_percent"]),17.5)
            self.assertEqual(persisted["hold_override_days"],14)
            exposed=client.get("/cpa/catalog/"+self.slug+"/"+self.offer)
            self.assertEqual(exposed.status_code,200,exposed.text)
            self.assertNotIn("source_url",exposed.text)
            self.assertNotIn("new-neutral-smartlink",exposed.text)

            # A second network may offer a second smartlink in the SAME vertical.
            second=client.post("/cpa/admin/networks",headers=h,json={
                "name":"Second-"+self.suffix,"website":"https://example.org","is_active":True})
            self.assertEqual(second.status_code,200,second.text)
            second_id=second.json()["id"]
            another=client.post("/cpa/admin/offers",headers=h,json={
                "id":"secondary-"+self.suffix,"title":"Neutral second smartlink",
                "vertical_slug":self.slug,"network_id":second_id,
                "offer_type":"smartlink","source_url":"https://example.org/offer",
                "status":"published"})
            self.assertEqual(another.status_code,200,another.text)
            listing=client.get("/cpa/catalog/"+self.slug)
            self.assertEqual(listing.status_code,200,listing.text)
            self.assertEqual(len(listing.json()["offers"]),2)
            self.assertNotIn("source_url",listing.text)
            self.assertEqual(next(x for x in client.get("/cpa/catalog").json()["verticals"]
                                  if x["slug"]==self.slug)["offers_count"],2)

            # Disabling one network hides only that network's offers.
            net=next(x for x in client.get("/cpa/admin/networks",headers=h).json()["items"]
                     if x["id"]==second_id)
            net["is_active"]=False
            self.assertEqual(client.put("/cpa/admin/networks/"+str(second_id),headers=h,json=net).status_code,200)
            self.assertEqual(len(client.get("/cpa/catalog/"+self.slug).json()["offers"]),1)

            # No normal webmaster can edit the URL or change status.
            forbidden=client.put("/cpa/admin/offers/"+self.offer,
                                 headers=signed(WEBMASTER),json=changed)
            self.assertEqual(forbidden.status_code,403,forbidden.text)
        finally:
            with engine.begin() as conn:
                conn.execute(text("DELETE FROM offers WHERE id=:id"),
                             {"id":"secondary-"+self.suffix})
                conn.execute(text("DELETE FROM cpa_networks WHERE name=:name"),
                             {"name":"Second-"+self.suffix})
            client.put("/cpa/admin/offers/"+self.offer,headers=h,json=original)

    def test_e_multi_vertical_edit_and_empty_state(self):
        h=signed(ADMIN)
        slug="secondvertical-"+self.suffix
        try:
            second=client.post("/cpa/admin/verticals",headers=h,json={
                "slug":slug,"title":"Another category","is_active":True,
                "display_order":5})
            self.assertEqual(second.status_code,200,second.text)
            empty=client.get("/cpa/catalog/"+slug)
            self.assertEqual(empty.status_code,200,empty.text)
            self.assertEqual(empty.json()["offers"],[])
            saved=next(x for x in client.get("/cpa/admin/verticals",headers=h).json()["items"]
                       if x["slug"]==slug)
            updated={**saved,"title":"Renamed category","display_order":3,
                     "description":"Stored in PostgreSQL"}
            self.assertEqual(client.put("/cpa/admin/verticals/"+slug,
                                        headers=h,json=updated).status_code,200)
            self.assertEqual(client.get("/cpa/catalog/"+slug).json()["vertical"]["title"],
                             "Renamed category")
            self.assertEqual(client.post("/cpa/admin/verticals",headers=h,json=updated).status_code,409)
        finally:
            with engine.begin() as conn:
                conn.execute(text("DELETE FROM cpa_verticals WHERE slug=:slug"),{"slug":slug})

    def test_c_validation_blocks_unsafe_urls(self):
        h=signed(ADMIN)
        for url in ("javascript:alert(1)","http://localhost/secret","https://127.0.0.1/private"):
            result=client.post("/cpa/admin/networks",headers=h,json={"name":"Unsafe-"+self.suffix,"website":url})
            self.assertEqual(result.status_code,422,result.text)

if __name__=="__main__":unittest.main()
