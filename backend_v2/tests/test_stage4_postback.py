"""Stage 4 isolated authenticated neutral postback tests; never hit real CPA networks."""
import concurrent.futures,hashlib,hmac,json,os,sys,time,unittest,uuid
from decimal import Decimal
from pathlib import Path
from urllib.parse import urlencode
from fastapi.testclient import TestClient
from sqlalchemy import text

ROOT=Path(__file__).resolve().parents[1]
sys.path.insert(0,str(ROOT))
from database import engine
from main import app
client=TestClient(app,follow_redirects=False)
ADMIN=232682307
UID=900000006401

def auth(uid):
    data={"auth_date":str(int(time.time())),"user":json.dumps({"id":uid},separators=(",",":"))}
    check="\n".join(f"{k}={v}" for k,v in sorted(data.items()))
    key=hmac.new(b"WebAppData",os.environ["BOT_TOKEN"].encode(),hashlib.sha256).digest()
    data["hash"]=hmac.new(key,check.encode(),hashlib.sha256).hexdigest()
    return {"X-Telegram-Init-Data":urlencode(data)}

class PostbackTests(unittest.TestCase):
    @classmethod
    def setUpClass(cls):
        cls.tag=uuid.uuid4().hex[:8]
        cls.net="PBNeutral-"+cls.tag
        cls.offer="pb-neutral-"+cls.tag
        cls.click="pbclick-"+cls.tag
        cls.click2="pbclick2-"+cls.tag
        with engine.begin() as c:
            c.execute(text("""CREATE TABLE IF NOT EXISTS users (
                telegram_id BIGINT PRIMARY KEY,first_name TEXT,partner_code TEXT,
                status TEXT NOT NULL DEFAULT 'active',role TEXT NOT NULL DEFAULT 'user',
                balance NUMERIC(12,2) NOT NULL DEFAULT 0,
                hold NUMERIC(12,2) NOT NULL DEFAULT 0,
                withdrawn NUMERIC(12,2) NOT NULL DEFAULT 0)"""))
            c.execute(text("CREATE TABLE IF NOT EXISTS offers(id VARCHAR(80) PRIMARY KEY,title VARCHAR(200) NOT NULL)"))
            for defn in ("description TEXT","icon_name VARCHAR(30)","geo VARCHAR(300)","smartlink_suffix VARCHAR(120) NOT NULL DEFAULT ''"):
                c.execute(text("ALTER TABLE offers ADD COLUMN IF NOT EXISTS "+defn))
            stage2=(ROOT/"migrations/20261016_stage2_catalog.sql").read_text()
            stage2="\n".join(line for line in stage2.splitlines() if not line.lstrip().startswith("REVOKE "))
            c.connection.cursor().execute(stage2)
            c.execute(text("CREATE TABLE IF NOT EXISTS clicks(id BIGSERIAL PRIMARY KEY,user_id BIGINT NOT NULL,partner_code VARCHAR(60) NOT NULL,click_id VARCHAR(120) NOT NULL UNIQUE,vertical VARCHAR(100) NOT NULL,created_at TIMESTAMP DEFAULT now())"))
            c.execute(text("ALTER TABLE clicks ADD COLUMN IF NOT EXISTS offer_id VARCHAR(80)"))
            c.execute(text("ALTER TABLE clicks ADD COLUMN IF NOT EXISTS network_id BIGINT"))
            # Legacy statistics exists in production, but the isolated CI database
            # must create its own minimal table before regression assertions.
            c.execute(text("""CREATE TABLE IF NOT EXISTS withdrawals (
                id BIGSERIAL PRIMARY KEY, user_id BIGINT NOT NULL,
                amount NUMERIC(12,2) NOT NULL DEFAULT 0
            )"""))
            c.execute(text("""CREATE TABLE IF NOT EXISTS statistics (
                id BIGSERIAL PRIMARY KEY, user_id BIGINT NOT NULL,
                date DATE NOT NULL DEFAULT CURRENT_DATE,
                clicks INTEGER NOT NULL DEFAULT 0,
                conversions INTEGER NOT NULL DEFAULT 0,
                income NUMERIC(12,2) NOT NULL DEFAULT 0
            )"""))
            c.execute(text("""CREATE TABLE IF NOT EXISTS conversions (
                id UUID PRIMARY KEY DEFAULT gen_random_uuid(),click_id VARCHAR(120) NOT NULL UNIQUE,
                user_id BIGINT NOT NULL,offer_id VARCHAR(80) NOT NULL,
                payout_gross NUMERIC(12,2) NOT NULL,payout_net NUMERIC(12,2) NOT NULL,
                status VARCHAR(30) NOT NULL DEFAULT 'pending',
                transaction_id VARCHAR(120),created_at TIMESTAMPTZ DEFAULT now(),
                processed_at TIMESTAMPTZ)"""))
            stage4=(ROOT/"migrations/20261016_stage4_postback.sql").read_text()
            stage4="\n".join(line for line in stage4.splitlines() if not line.lstrip().startswith("REVOKE "))
            c.connection.cursor().execute(stage4)
            c.execute(text("ALTER TABLE cpa_networks ADD COLUMN IF NOT EXISTS click_param VARCHAR(48)"))
            c.connection.cursor().execute((ROOT/"migrations/20261017_universal_cpa_integrations.sql").read_text())
            migration=(ROOT/"migrations/20261016_stage4_admin_postback_probe.sql").read_text()
            c.connection.cursor().execute(migration)
            c.execute(text("INSERT INTO users(telegram_id,first_name,partner_code,status) VALUES(:uid,'Stage4','VVD964001','active') ON CONFLICT(telegram_id) DO UPDATE SET status='active'"),{"uid":UID})
            c.execute(text("INSERT INTO cpa_verticals(slug,title,is_active,cpa_link_allowed) VALUES('utilities','Utilities',TRUE,TRUE) ON CONFLICT(slug) DO UPDATE SET cpa_link_allowed=TRUE"))
        added=client.post("/cpa/admin/networks",headers=auth(ADMIN),json={"name":cls.net,"is_active":True})
        if added.status_code!=200:raise AssertionError(added.text)
        cls.network_id=added.json()["id"]
        with engine.begin() as c:
            c.execute(text("""INSERT INTO offers(id,title,smartlink_suffix,vertical_slug,network_id,status)
            VALUES(:id,'Neutral test',:suffix,'utilities',:net,'published')"""),
            {"id":cls.offer,"suffix":"cpa-"+cls.offer,"net":cls.network_id})
            for click in (cls.click,cls.click2):
                c.execute(text("""INSERT INTO clicks(user_id,partner_code,click_id,vertical,offer_id,network_id)
                    VALUES(:uid,'VVD964001',:click,'utilities',:offer,:network)"""),
                    {"uid":UID,"click":click,"offer":cls.offer,"network":cls.network_id})
        rotated=client.post(f"/cpa/admin/networks/{cls.network_id}/postback/rotate",headers=auth(ADMIN))
        if rotated.status_code!=200:raise AssertionError(rotated.text)
        cls.secret=rotated.json()["secret_once"]
        setup=client.put(f"/cpa/admin/networks/{cls.network_id}/postback",headers=auth(ADMIN),json={
            "postback_enabled":True,
            "postback_params":{"click":"test_click","transaction":"tx","status":"state","amount":"price","currency":"ccy"},
            "postback_status_map":{"waiting":"pending","paid":"approved","cancel":"rejected"}})
        if setup.status_code!=200:raise AssertionError(setup.text)

    @classmethod
    def tearDownClass(cls):
        with engine.begin() as c:
            c.execute(text("DELETE FROM conversions WHERE click_id IN (:x,:y)"),{"x":cls.click,"y":cls.click2})
            c.execute(text("DELETE FROM clicks WHERE click_id IN (:x,:y)"),{"x":cls.click,"y":cls.click2})
            c.execute(text("DELETE FROM offers WHERE id=:id"),{"id":cls.offer})
            c.execute(text("DELETE FROM cpa_networks WHERE id=:id"),{"id":cls.network_id})
            c.execute(text("DELETE FROM users WHERE telegram_id=:uid"),{"uid":UID})

    def send(self,click,transaction="sale-a",status="waiting",secret=None,price="12.50",ccy="USD"):
        return client.post(f"/cpa/postback/{self.network_id}",json={"test_click":click,
          "tx":transaction,"state":status,"price":price,"ccy":ccy},
          headers={"X-VVD-Postback-Key":self.secret if secret is None else secret})

    def test_get_requires_verified_sender_and_preserves_post(self):
        url=f"/cpa/postback/{self.network_id}"
        # A spoofed forwarded header and correct mapped fields never authenticate GET.
        response=client.get(url,params={"test_click":self.click,"tx":"probe-get",
            "state":"waiting","price":"0","ccy":"USD"},
            headers={"X-Forwarded-For":"203.0.113.5"})
        self.assertIn(response.status_code,(403,404))
        settings=client.put(f"/cpa/admin/networks/{self.network_id}/postback",
            headers=auth(ADMIN),json={"postback_enabled":True,
                "postback_method":"GET_QUERY",
                "postback_params":{"click":"test_click","transaction":"tx",
                  "status":"state","amount":"price","currency":"ccy"},
                "postback_status_map":{"waiting":"pending","hold":"pending",
                    "paid":"approved","cancel":"rejected"}})
        self.assertEqual(settings.status_code,422)
        # A rejected GET change must leave the established POST method in place.
        config=client.get(f"/cpa/admin/networks/{self.network_id}/postback",headers=auth(ADMIN))
        self.assertEqual(config.status_code,200)
        self.assertEqual(config.json()["postback_method"],"POST_JSON")
        self.assertTrue(config.json()["postback_enabled"])

    def test_legacy_postbacks_fail_closed_without_financial_changes(self):
        # A known partner_code/click_id is NOT proof of the sender's identity.
        # This fixture uses isolated PostgreSQL only.
        with engine.connect() as c:
            before_user=c.execute(text("SELECT balance,hold,withdrawn FROM users WHERE telegram_id=:id"),{"id":UID}).first()
            before_conversions=c.execute(text("SELECT count(*) FROM conversions")).scalar_one()
            before_stats=c.execute(text("SELECT count(*) FROM statistics WHERE user_id=:id"),{"id":UID}).scalar_one()
        attempts=[
            ("/postback/adult",{"partner_code":"VVD964001","click_id":self.click,"offer_id":self.offer,
             "payout":"99","status":"1","transaction_id":"legacy-denied-"+self.tag}),
            ("/postback/traffcore",{"sub2":"VVD964001","sub3":self.click,"click_id":self.click,
             "sum":"99","goal":self.offer,"transaction_id":"legacy-denied-"+self.tag}),
        ]
        for path,params in attempts:
            for _ in range(2):
                response=client.get(path,params=params)
                self.assertEqual(response.status_code,403,response.text)
        with engine.connect() as c:
            after_user=c.execute(text("SELECT balance,hold,withdrawn FROM users WHERE telegram_id=:id"),{"id":UID}).first()
            after_conversions=c.execute(text("SELECT count(*) FROM conversions")).scalar_one()
            after_stats=c.execute(text("SELECT count(*) FROM statistics WHERE user_id=:id"),{"id":UID}).scalar_one()
        self.assertEqual(tuple(before_user),tuple(after_user))
        self.assertEqual(before_conversions,after_conversions)
        self.assertEqual(before_stats,after_stats)

    def test_persisted_result_get_access(self):
        path="/cpa/admin/networks/2/postback/check"
        self.assertEqual(client.get(path).status_code,401)
        self.assertEqual(client.get(path,headers=auth(UID)).status_code,403)
        self.assertEqual(client.get("/cpa/admin/networks/999/postback/check",headers=auth(ADMIN)).status_code,404)
        ui=(ROOT.parent/"src/pages/admin/NetworkPostback.tsx").read_text()
        self.assertIn("Postback проверен успешно. Тестовая конверсия: 1. Статус: pending. Начисления: $0",ui)
        self.assertIn('Проверка уже выполнена',ui)

    def test_admin_check_access_and_real_default(self):
        self.assertEqual(client.post("/cpa/admin/networks/2/postback/check").status_code,401)
        self.assertEqual(client.post("/cpa/admin/networks/2/postback/check",headers=auth(UID)).status_code,403)
        self.assertEqual(client.post("/cpa/admin/networks/999/postback/check",headers=auth(ADMIN)).status_code,404)

    def test_a_incorrect_auth_and_unknown_click(self):
        self.assertEqual(self.send(self.click,secret="invalid").status_code,401)
        self.assertEqual(self.send("does-not-exist").status_code,404)
        self.assertEqual(client.post(f"/cpa/postback/{self.network_id}",json={"bad":"value"},
                       headers={"X-VVD-Postback-Key":self.secret}).status_code,422)
        self.assertEqual(client.get(f"/cpa/admin/networks/{self.network_id}/postback").status_code,401)
        self.assertEqual(client.get(f"/cpa/admin/networks/{self.network_id}/postback",
                                   headers=auth(UID)).status_code,403)
        private=client.get(f"/cpa/admin/networks/{self.network_id}/postback",headers=auth(ADMIN))
        self.assertEqual(private.status_code,200,private.text)
        self.assertNotIn(self.secret,private.text)

    def test_b_valid_dedup_status_no_balance_changes(self):
        with engine.connect() as c:
            before=c.execute(text("SELECT balance,hold,withdrawn FROM users WHERE telegram_id=:id"),{"id":UID}).first()
        first=self.send(self.click)
        self.assertEqual(first.status_code,200,first.text)
        self.assertTrue(first.json()["created"])
        second=self.send(self.click)
        self.assertEqual(second.status_code,200,second.text)
        self.assertTrue(second.json()["duplicate"])
        ok=self.send(self.click,status="paid")
        self.assertEqual(ok.status_code,200,ok.text)
        self.assertTrue(ok.json()["updated"])
        self.assertEqual(self.send(self.click,status="cancel").status_code,409)
        rejected=self.send(self.click2,transaction="sale-b",status="cancel")
        self.assertEqual(rejected.status_code,200,rejected.text)
        with engine.connect() as c:
            rows=c.execute(text("SELECT click_id,user_id,offer_id,network_id,vertical_slug,partner_code,status,payout_gross,payout_net,currency,is_test FROM conversions WHERE click_id IN (:a,:b)"),{"a":self.click,"b":self.click2}).mappings().all()
            after=c.execute(text("SELECT balance,hold,withdrawn FROM users WHERE telegram_id=:id"),{"id":UID}).first()
        self.assertEqual(len(rows),2)
        self.assertEqual(set(x["status"] for x in rows),{"approved","rejected"})
        self.assertTrue(all(x["offer_id"]==self.offer and x["user_id"]==UID and x["network_id"]==self.network_id and x["partner_code"]=="VVD964001" and x["vertical_slug"]=="utilities" and x["payout_net"]==0 and not x["is_test"] for x in rows))
        self.assertEqual(tuple(before),tuple(after))

    def test_z_admin_server_check_isolated_once_and_preserves_finance(self):
        # This method operates only on the CI PostgreSQL fixture.
        with engine.begin() as c:
            saved=c.execute(text("""SELECT name,postback_enabled,postback_key_hash,
                    postback_params,postback_status_map,postback_last_received_at
                    FROM cpa_networks WHERE id=2""")).mappings().first()
            if saved:
                c.execute(text("UPDATE cpa_networks SET name='VVD Test Network',postback_enabled=FALSE WHERE id=2"))
            else:
                c.execute(text("INSERT INTO cpa_networks(id,name,postback_enabled) VALUES(2,'VVD Test Network',FALSE)"))
            c.execute(text("""INSERT INTO offers(id,title,smartlink_suffix,vertical_slug,network_id,status)
                VALUES('vvd-test-smartlink','Neutral isolated fixture','vvd-isolated-test','utilities',2,'published')"""))
            c.execute(text("""INSERT INTO clicks(user_id,partner_code,click_id,vertical,offer_id,network_id)
                VALUES(:uid,'VVD964001',:click,'utilities','vvd-test-smartlink',2)"""),
                {"uid":UID,"click":"isolated-stage4-"+self.tag})
            user_before=tuple(c.execute(text("SELECT balance,hold,withdrawn FROM users WHERE telegram_id=:id"),{"id":UID}).one())
            payouts_before=c.execute(text("SELECT count(*) FROM withdrawals")).scalar_one()
        try:
            first=client.post("/cpa/admin/networks/2/postback/check",headers=auth(ADMIN))
            self.assertEqual(first.status_code,200,first.text)
            result=first.json()
            self.assertTrue(result["attribution"] and result["duplicate"] and result["financial_unchanged"])
            self.assertEqual((result["http_first"],result["http_duplicate"],result["http_bad_secret"],result["http_unknown_click"]),(200,200,401,404))
            stored=client.get("/cpa/admin/networks/2/postback/check",headers=auth(ADMIN))
            self.assertEqual(stored.status_code,200,stored.text)
            self.assertEqual(stored.json(),{"completed":True,"test_conversions":1,
                "status":"pending","zero_payout":True})
            self.assertNotIn("transaction_id",stored.text)
            self.assertEqual(client.post("/cpa/admin/networks/2/postback/check",headers=auth(ADMIN)).status_code,409)
            self.assertEqual(client.get("/cpa/admin/networks/2/postback/check",headers=auth(ADMIN)).json(),stored.json())
            with engine.connect() as c:
                row=c.execute(text("""SELECT is_test,status,payout_gross,payout_net,user_id,network_id,offer_id
                    FROM conversions WHERE click_id=:click"""),{"click":"isolated-stage4-"+self.tag}).mappings().one()
                self.assertTrue(row["is_test"])
                self.assertEqual((row["status"],row["payout_gross"],row["payout_net"],row["user_id"],row["network_id"],row["offer_id"]),("pending",0,0,UID,2,"vvd-test-smartlink"))
                self.assertEqual(tuple(c.execute(text("SELECT balance,hold,withdrawn FROM users WHERE telegram_id=:id"),{"id":UID}).one()),user_before)
                self.assertEqual(c.execute(text("SELECT count(*) FROM withdrawals")).scalar_one(),payouts_before)
                cfg=c.execute(text("SELECT postback_enabled,postback_key_hash FROM cpa_networks WHERE id=2")).one()
                self.assertFalse(cfg[0])
                self.assertEqual(cfg[1],saved["postback_key_hash"] if saved else None)
            self.assertEqual(self.send("isolated-stage4-"+self.tag).status_code,404)
        finally:
            with engine.begin() as c:
                c.execute(text("DELETE FROM conversions WHERE click_id=:click"),{"click":"isolated-stage4-"+self.tag})
                c.execute(text("DELETE FROM clicks WHERE click_id=:click"),{"click":"isolated-stage4-"+self.tag})
                c.execute(text("DELETE FROM offers WHERE id='vvd-test-smartlink'"))
                if saved:
                    c.execute(text("""UPDATE cpa_networks SET name=:name,postback_enabled=:enabled,
                        postback_key_hash=:hash,postback_params=CAST(:params AS jsonb),
                        postback_status_map=CAST(:statuses AS jsonb),postback_last_received_at=:last
                        WHERE id=2"""),{"name":saved["name"],"enabled":saved["postback_enabled"],
                        "hash":saved["postback_key_hash"],"params":json.dumps(saved["postback_params"]),
                        "statuses":json.dumps(saved["postback_status_map"]),"last":saved["postback_last_received_at"]})
                else:
                    c.execute(text("DELETE FROM cpa_networks WHERE id=2"))

    def test_c_bad_amount_network_and_parallel_idempotency(self):
        self.assertEqual(self.send(self.click,price="-1").status_code,422)
        self.assertEqual(self.send(self.click,ccy="USD123").status_code,422)
        self.assertEqual(self.send(self.click,transaction="wrong-sale").status_code,409)
        # Parallel matching notifications remain a single conversion.
        with concurrent.futures.ThreadPoolExecutor(max_workers=4) as ex:
            results=list(ex.map(lambda _:self.send(self.click2,transaction="sale-b",status="cancel"),range(6)))
        self.assertTrue(all(x.status_code==200 for x in results))
        with engine.connect() as c:
            n=c.execute(text("SELECT count(*) FROM conversions WHERE click_id=:id"),{"id":self.click2}).scalar_one()
        self.assertEqual(n,1)

if __name__=="__main__":unittest.main()
