"""Isolated marketplace safety tests; no external provider or payment API calls."""
import hashlib, hmac, json, os, sys, time, unittest, uuid
from pathlib import Path
from urllib.parse import urlencode
from fastapi import HTTPException
from sqlalchemy import text

sys.path.insert(0,str(Path(__file__).resolve().parents[1]))
from database import engine
import tools_marketplace as market

TEST_ID = 900000002027

def signed_data(user=TEST_ID):
    fields={"auth_date":str(int(time.time())),"user":json.dumps({"id":user},separators=(",",":"))}
    sign="\n".join(f"{k}={v}" for k,v in sorted(fields.items()))
    key=hmac.new(b"WebAppData",os.environ["BOT_TOKEN"].encode(),hashlib.sha256).digest()
    fields["hash"]=hmac.new(key,sign.encode(),hashlib.sha256).hexdigest()
    return urlencode(fields)

class MarketplaceTests(unittest.TestCase):
    @classmethod
    def setUpClass(cls):
        with engine.begin() as conn:
            conn.execute(text("CREATE TABLE IF NOT EXISTS public.users(telegram_id BIGINT PRIMARY KEY,first_name VARCHAR(255) NOT NULL)"))
            conn.execute(text("ALTER TABLE public.users ADD COLUMN IF NOT EXISTS balance NUMERIC(14,2) NOT NULL DEFAULT 0"))
            sql=(Path(__file__).resolve().parents[1]/"migrations/20261016_tools_marketplace.sql").read_text()
            sql="\n".join(x for x in sql.splitlines() if not x.lstrip().startswith("--"))
            for statement in sql.split(";"):
                statement=statement.strip()
                if statement and not statement.startswith("REVOKE"):
                    conn.execute(text(statement))
            conn.execute(text("INSERT INTO public.users(telegram_id,first_name) VALUES (:id,'Tools Test') ON CONFLICT DO NOTHING"),{"id":TEST_ID})

    @classmethod
    def tearDownClass(cls):
        with engine.begin() as conn:
            conn.execute(text("DELETE FROM public.users WHERE telegram_id=:id"),{"id":TEST_ID})

    def test_wallet_is_separate_usd(self):
        r=market.wallet(signed_data())
        self.assertEqual(r["currency"],"USD")
        self.assertEqual(r["available"],"0.00")
        self.assertFalse(r["payments_enabled"])
        with engine.connect() as conn:
            amount=conn.execute(text("SELECT balance FROM public.users WHERE telegram_id=:uid"),{"uid":TEST_ID}).scalar()
            self.assertIsNone(amount) if amount is None else self.assertEqual(float(amount),0.0)

    def test_no_fake_money_or_orders(self):
        for action in (market.topup_disabled,market.orders_disabled):
            with self.assertRaises(HTTPException) as cm:
                action(signed_data())
            self.assertEqual(cm.exception.status_code,503)
        self.assertEqual(market.orders(signed_data())["orders"],[])
        self.assertEqual(market.transactions(signed_data())["transactions"],[])

    def test_model_owner_scope_and_public_projection(self):
        payload=market.AIModelPayload(
            name="Test AI",slug="test-"+uuid.uuid4().hex[:12],description="Test profile",
            greeting="Hello",status="published",
            affiliate_url="https://example.com/offer"
        )
        created=market.ai_create(payload,signed_data())
        self.assertEqual(created["name"],"Test AI")
        item=market.ai_detail(uuid.UUID(created["id"]),signed_data())
        self.assertEqual(item["slug"],payload.slug)
        with self.assertRaises(HTTPException) as cm:
            market.ai_detail(uuid.UUID(created["id"]),signed_data(TEST_ID+1))
        self.assertEqual(cm.exception.status_code,404)
        public=market.public_ai(payload.slug)
        self.assertEqual(public["disclosure"],"AI-персонаж")
        self.assertFalse(public["ai_online"])
        self.assertNotIn("telegram_id",public)
        self.assertNotIn("knowledge",public)

    def test_disallow_unsafe_links(self):
        for link in ("javascript:alert(1)","http://example.com","https://user:pass@example.com"):
            with self.assertRaises(ValueError):
                market.safe_url(link)
        self.assertEqual(market.safe_url("https://example.com"),"https://example.com")

if __name__=="__main__":
    unittest.main()
