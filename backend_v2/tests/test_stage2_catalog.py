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
            sql=(ROOT/"migrations/20261016_stage2_catalog.sql").read_text()
            conn.connection.cursor().execute(sql)
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

    def test_c_validation_blocks_unsafe_urls(self):
        h=signed(ADMIN)
        for url in ("javascript:alert(1)","http://localhost/secret","https://127.0.0.1/private"):
            result=client.post("/cpa/admin/networks",headers=h,json={"name":"Unsafe-"+self.suffix,"website":url})
            self.assertEqual(result.status_code,422,result.text)

if __name__=="__main__":unittest.main()
