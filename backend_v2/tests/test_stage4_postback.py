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
            c.execute(text("INSERT INTO users(telegram_id,first_name,partner_code,status,role) VALUES(232682307,'TestAdmin','VVDADMIN','active','admin') ON CONFLICT(telegram_id) DO UPDATE SET role='admin'"))
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

    def test_00_full_link_postback_attribution_without_finance(self):
        # Full synthetic chain: actual personal link -> redirect -> stored click -> authenticated postback.
        # Only local PostgreSQL 17 fixture and TestClient; no partner redirect follows.
        from urllib.parse import urlsplit, parse_qs
        from neutral_links import neutral_click_redirect
        from cpa_analytics import summarize, arguments
        fixture_offer="chain-"+self.tag
        owner2=900000006402
        code2="VVD964002"
        with engine.begin() as c:
            c.execute(text("""CREATE TABLE IF NOT EXISTS smartlinks(
                id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
                user_id BIGINT NOT NULL,offer_id VARCHAR(80) NOT NULL,
                suffix VARCHAR(100) NOT NULL UNIQUE,url TEXT NOT NULL,
                created_at TIMESTAMPTZ DEFAULT NOW())"""))
            c.execute(text("ALTER TABLE clicks ADD COLUMN IF NOT EXISTS smartlink_id UUID"))
            c.execute(text("ALTER TABLE offers ADD COLUMN IF NOT EXISTS source_url TEXT"))
            c.execute(text("ALTER TABLE offers ADD COLUMN IF NOT EXISTS offer_type VARCHAR(20)"))
            c.execute(text("ALTER TABLE offers ADD COLUMN IF NOT EXISTS click_param_override VARCHAR(48)"))
            c.execute(text("ALTER TABLE cpa_networks ADD COLUMN IF NOT EXISTS click_param VARCHAR(48)"))
            c.execute(text("UPDATE cpa_networks SET click_param='ref_id',partner_param='sub1' WHERE id=:id"),{"id":self.network_id})
            c.execute(text("INSERT INTO users(telegram_id,first_name,partner_code,status) VALUES(:uid,'Stage4Other',:code,'active') ON CONFLICT(telegram_id) DO UPDATE SET partner_code=:code,status='active'"),{"uid":owner2,"code":code2})
            for suffix,uid,oid in (("s"+uuid.uuid4().hex,UID,self.offer),("s"+uuid.uuid4().hex,owner2,fixture_offer)):
                if oid==fixture_offer:
                    c.execute(text("""INSERT INTO offers(id,title,smartlink_suffix,vertical_slug,network_id,status,source_url,offer_type)
                         VALUES(:offer,'Synthetic 2','synthetic-two','utilities',:net,'published',
                         'https://example.com/path?original=preserved','smartlink')"""),{"offer":oid,"net":self.network_id})
                else:
                    c.execute(text("""UPDATE offers SET source_url='https://example.com/path?original=preserved',
                         offer_type='smartlink' WHERE id=:offer"""),{"offer":oid})
                c.execute(text("INSERT INTO smartlinks(user_id,offer_id,suffix,url) VALUES(:uid,:oid,:suffix,:url)"),
                          {"uid":uid,"oid":oid,"suffix":suffix,"url":"https://vvd-cpa-v2.onrender.com/r/"+suffix})
                if uid==UID: owner_suffix=suffix
                else: other_suffix=suffix
            before=tuple(c.execute(text("SELECT balance,hold,withdrawn FROM users WHERE telegram_id=:uid"),{"uid":UID}).one())
            before_other=tuple(c.execute(text("SELECT balance,hold,withdrawn FROM users WHERE telegram_id=:uid"),{"uid":owner2}).one())
        created=[]
        # Finance epoch and ledger exist only in the isolated PG17 fixture.
        with engine.begin() as c:
            c.execute(text("CREATE TABLE IF NOT EXISTS public.cpa_finance_epoch (id SMALLINT PRIMARY KEY,activated_at TIMESTAMPTZ,legacy_max_click_row_id BIGINT)"))
            c.execute(text("INSERT INTO public.cpa_finance_epoch(id,activated_at) VALUES(1,NULL) ON CONFLICT(id) DO NOTHING"))
            c.execute(text("CREATE TABLE IF NOT EXISTS public.cpa_ledger (id BIGSERIAL PRIMARY KEY,conversion_id UUID,user_id BIGINT,operation_type TEXT,hold_delta NUMERIC(12,2) DEFAULT 0,balance_delta NUMERIC(12,2) DEFAULT 0,platform_fee_delta NUMERIC(12,2) DEFAULT 0)"))
            c.execute(text("ALTER TABLE public.clicks ADD COLUMN IF NOT EXISTS country_code VARCHAR(2)"))
            c.execute(text("ALTER TABLE public.clicks ADD COLUMN IF NOT EXISTS country_name TEXT"))
            c.execute(text("ALTER TABLE public.conversions ADD COLUMN IF NOT EXISTS finance_eligible_at TIMESTAMPTZ"))
            c.execute(text("ALTER TABLE public.conversions ADD COLUMN IF NOT EXISTS finance_approved_at TIMESTAMPTZ"))
            ledger_before=c.execute(text("SELECT COUNT(*) FROM public.cpa_ledger")).scalar_one()
            payouts_before=c.execute(text("SELECT COUNT(*) FROM public.withdrawals")).scalar_one()
        try:
            for suffix,expected_code in ((owner_suffix,"VVD964001"),(owner_suffix,"VVD964001"),(other_suffix,code2)):
                r=client.get("/r/"+suffix)
                self.assertEqual(r.status_code,302,r.text)
                qs=parse_qs(urlsplit(r.headers["location"]).query)
                self.assertEqual(qs["original"],["preserved"])
                self.assertEqual(qs["sub1"],[expected_code])
                click=qs["ref_id"][0]
                uuid.UUID(click)
                created.append((click,expected_code))
            self.assertEqual(len({x[0] for x in created}),3)
            for click,code in created:
                uid=UID if code=="VVD964001" else owner2
                with engine.connect() as c:
                    recorded=c.execute(text("SELECT user_id,partner_code,network_id FROM clicks WHERE click_id=:click"),{"click":click}).one()
                self.assertEqual((recorded[0],recorded[1],recorded[2]),(uid,code,self.network_id))
            for i,(click,code) in enumerate(created):
                # Verified gateway output uses the preexisting authenticated POST interface.
                resp=client.post(f"/cpa/postback/{self.network_id}",
                    json={"test_click":click,"tx":"synthetic-chain-"+self.tag+"-"+str(i),
                          "state":"waiting","price":"0","ccy":"USD","sub1":"VVD999999"},
                    headers={"X-VVD-Postback-Key":self.secret})
                self.assertEqual(resp.status_code,200,resp.text)
                self.assertTrue(resp.json()["created"])
                duplicate=client.post(f"/cpa/postback/{self.network_id}",
                    json={"test_click":click,"tx":"synthetic-chain-"+self.tag+"-"+str(i),
                          "state":"waiting","price":"0","ccy":"USD","sub1":"VVD999999"},
                    headers={"X-VVD-Postback-Key":self.secret})
                self.assertEqual(duplicate.status_code,200)
                self.assertTrue(duplicate.json()["duplicate"])
                with engine.connect() as c:
                    v=c.execute(text("SELECT user_id,partner_code,status,payout_net FROM conversions WHERE click_id=:click"),{"click":click}).one()
                    self.assertEqual((v[0],v[1],v[2],v[3]),(UID if code=="VVD964001" else owner2,code,"pending",0))
            with engine.connect() as c:
                self.assertEqual(tuple(c.execute(text("SELECT balance,hold,withdrawn FROM users WHERE telegram_id=:uid"),{"uid":UID}).one()),before)
                self.assertEqual(tuple(c.execute(text("SELECT balance,hold,withdrawn FROM users WHERE telegram_id=:uid"),{"uid":owner2}).one()),before_other)
                self.assertEqual(c.execute(text("SELECT count(*) FROM conversions WHERE click_id IN (:a,:b,:d)"),
                   {"a":created[0][0],"b":created[1][0],"d":created[2][0]}).scalar_one(),3)
                self.assertEqual(c.execute(text("SELECT COUNT(*) FROM public.cpa_ledger")).scalar_one(),ledger_before)
                self.assertEqual(c.execute(text("SELECT COUNT(*) FROM public.withdrawals")).scalar_one(),payouts_before)
            first=client.get(f"/statistics/{UID}",headers=auth(UID),
                params={"offer_id":self.offer,"network_id":self.network_id})
            second=client.get(f"/statistics/{owner2}",headers=auth(owner2),
                params={"offer_id":fixture_offer,"network_id":self.network_id})
            self.assertEqual(first.status_code,200,first.text)
            self.assertEqual(second.status_code,200,second.text)
            a=first.json()["summary"]
            b=second.json()["summary"]
            # Two pre-existing synthetic clicks for the same fixture user remain visible.
            self.assertEqual((a["clicks"],a["conversions"],a["statuses"]["pending"]),(4,2,2))
            self.assertEqual((b["clicks"],b["conversions"],b["statuses"]["pending"]),(1,1,1))
            for summary in (a,b):
                self.assertEqual(summary["earned"],0)
                self.assertEqual(summary["on_hold"],0)
                self.assertEqual(summary["real_withdrawable"],0)
                self.assertEqual(summary["epc"],0)
        finally:
            with engine.begin() as c:
                for click,_ in created:
                    c.execute(text("DELETE FROM conversions WHERE click_id=:click"),{"click":click})
                    c.execute(text("DELETE FROM clicks WHERE click_id=:click"),{"click":click})
                c.execute(text("DELETE FROM smartlinks WHERE suffix IN (:a,:b)"),{"a":owner_suffix,"b":other_suffix})
                c.execute(text("DELETE FROM offers WHERE id=:offer"),{"offer":fixture_offer})
                c.execute(text("DELETE FROM users WHERE telegram_id=:uid"),{"uid":owner2})

    def test_get_and_post_share_conversion_handler_with_zero_finance(self):
        # Isolated PostgreSQL: configurable names/statuses, no URL secrets.
        # GET is explicitly a test-only, zero-value pending event.
        with engine.begin() as c:
            c.execute(text("UPDATE cpa_networks SET postback_method='GET_QUERY' WHERE id=:id"),
                {"id":self.network_id})
        unique_click='get-test-'+self.tag
        with engine.begin() as c:
            c.execute(text("INSERT INTO clicks(user_id,partner_code,click_id,vertical,offer_id,network_id) VALUES(:uid,'VVD964001',:click,'utilities',:offer,:network)"),
                      {'uid':UID,'click':unique_click,'offer':self.offer,'network':self.network_id})
        data={'test_click':unique_click,'tx':'get-post-'+self.tag,
              "state":"waiting","price":"0","ccy":"USD"}
        endpoint=f"/cpa/postback/{self.network_id}"
        try:
            self.assertEqual(client.get(endpoint,params=data).status_code,401)
            self.assertEqual(client.get(endpoint,params={**data,"price":"1"},
                headers={"X-VVD-Postback-Key":self.secret}).status_code,403)
            self.assertEqual(client.get(endpoint,params=[*data.items(),("tx","spoof")],
                headers={"X-VVD-Postback-Key":self.secret}).status_code,422)
            self.assertEqual(client.get(endpoint,params={**data,"secret":"x"},
                headers={"X-VVD-Postback-Key":self.secret}).status_code,422)
            first=client.get(endpoint,params=data,headers={"X-VVD-Postback-Key":self.secret})
            self.assertEqual(first.status_code,200,first.text)
            self.assertTrue(first.json().get("created"))
            repeated=client.get(endpoint,params=data,headers={"X-VVD-Postback-Key":self.secret})
            self.assertEqual(repeated.status_code,200)
            self.assertTrue(repeated.json().get("duplicate"))
            post=client.post(endpoint,json=data,headers={"X-VVD-Postback-Key":self.secret})
            self.assertEqual(post.status_code,409)
            # A synthetic GET record cannot be converted into a real POST record.
            # A separate fresh click still works with POST via the same handler.
            post_click="post-test-"+self.tag
            with engine.begin() as c:
                c.execute(text("INSERT INTO clicks(user_id,partner_code,click_id,vertical,offer_id,network_id) VALUES(:uid,'VVD964001',:click,'utilities',:offer,:network)"),
                    {"uid":UID,"click":post_click,"offer":self.offer,"network":self.network_id})
            posted=client.post(endpoint,json={**data,"test_click":post_click,"tx":"post-only-"+self.tag},headers={"X-VVD-Postback-Key":self.secret})
            self.assertEqual(posted.status_code,200,posted.text)
            self.assertTrue(posted.json().get("created"))
            with engine.connect() as c:
                row=c.execute(text("""SELECT user_id,partner_code,status,is_test,
                    payout_net,payout_gross FROM conversions WHERE click_id=:click"""),
                    {"click":unique_click}).mappings().one()
                self.assertEqual((row["user_id"],row["partner_code"],row["status"]),
                                 (UID,"VVD964001","pending"))
                self.assertTrue(row["is_test"])
                self.assertEqual((row["payout_net"],row["payout_gross"]),(0,0))
        finally:
            with engine.begin() as c:
                c.execute(text("DELETE FROM conversions WHERE click_id=:click"),{"click":post_click})
                c.execute(text("DELETE FROM clicks WHERE click_id=:click"),{"click":post_click})
                c.execute(text("DELETE FROM conversions WHERE click_id=:click"),
                    {"click":unique_click})
                c.execute(text("DELETE FROM clicks WHERE click_id=:click"),{"click":unique_click})
                c.execute(text("UPDATE cpa_networks SET postback_method='POST_JSON' WHERE id=:id"),
                    {"id":self.network_id})

    def test_gateway_post_for_get_query_requires_existing_secret(self):
        # Isolated PG17: GET_QUERY accepts ONLY authenticated JSON POST;
        # direct GET remains unavailable, including spoofed IP headers.
        endpoint=f"/cpa/postback/{self.network_id}"
        config={"postback_enabled":False,
                "postback_method":"GET_QUERY",
                "postback_params":{"click":"test_click","transaction":"tx",
                    "status":"state","amount":"price","currency":"ccy"},
                "postback_status_map":{"waiting":"pending","paid":"approved","cancel":"rejected"}}
        unique_click="gateway-click-"+self.tag
        with engine.begin() as c:
            c.execute(text("INSERT INTO clicks(user_id,partner_code,click_id,vertical,offer_id,network_id) VALUES(:uid,'VVD964001',:click,'utilities',:offer,:network)"),
                {"uid":UID,"click":unique_click,"offer":self.offer,"network":self.network_id})
        data={"test_click":unique_click,"tx":"gateway-"+self.tag,
              "state":"waiting","price":"0","ccy":"USD"}
        try:
            updated=client.put(f"/cpa/admin/networks/{self.network_id}/postback",
                headers=auth(ADMIN),json=config)
            self.assertEqual(updated.status_code,200,updated.text)
            # Existing administrative fail-closed GET_QUERY enable prohibition
            # is kept. Simulate a configured gateway on isolated PG17 only.
            with engine.begin() as c:
                c.execute(text("UPDATE cpa_networks SET postback_enabled=TRUE WHERE id=:id"),
                    {"id":self.network_id})
            self.assertEqual(client.get(endpoint,params=data,headers={
                "X-Forwarded-For":"203.0.113.5",
                "CF-Connecting-IP":"203.0.113.5"}).status_code,401)
            self.assertEqual(client.post(endpoint,json=data).status_code,401)
            self.assertEqual(client.post(endpoint,json=data,headers={
                "X-VVD-Postback-Key":"fake"}).status_code,401)
            ok=client.post(endpoint,json=data,headers={
                "X-VVD-Postback-Key":self.secret})
            self.assertEqual(ok.status_code,200,ok.text)
            self.assertTrue(ok.json()["created"])
            with engine.connect() as c:
                row=c.execute(text("SELECT user_id,partner_code,payout_net FROM conversions WHERE click_id=:id"),
                   {"id":self.click}).one()
            self.assertEqual((row[0],row[1],row[2]),(UID,"VVD964001",0))
        finally:
            with engine.begin() as c:
                c.execute(text("DELETE FROM conversions WHERE transaction_id=:tx"),
                   {"tx":"cpa:"+str(self.network_id)+":gateway-"+self.tag})
                c.execute(text("DELETE FROM clicks WHERE click_id=:click"),{"click":unique_click})
                c.execute(text("UPDATE cpa_networks SET postback_enabled=TRUE,postback_method='POST_JSON' WHERE id=:id"),
                   {"id":self.network_id})

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
