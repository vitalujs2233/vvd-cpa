"""Tests for signed Telegram initData and exactly-once Stars settlement.

Run with Postgres in CI; no Telegram APIs are called and no real money is used.
"""
import hashlib
import hmac
import json
import os
import sys
import time
import unittest
import uuid
from pathlib import Path
from urllib.parse import urlencode

sys.path.insert(0, str(Path(__file__).resolve().parents[1]))
from sqlalchemy import text
from stars_payments import (engine, verified_telegram_id, check_pre_checkout,
                            credit_successful_payment, reverse_refunded_payment)

TEST_USER = 900000002026
BOT_TOKEN = os.environ["BOT_TOKEN"]


class TelegramInitDataTests(unittest.TestCase):
    def make_init_data(self, time_offset=0):
        data = {
            "auth_date": str(int(time.time()) + time_offset),
            "query_id": "sample-query",
            "user": json.dumps({"id": TEST_USER, "first_name": "Example"}, separators=(",", ":")),
        }
        check_string = "\n".join(f"{key}={value}" for key, value in sorted(data.items()))
        secret = hmac.new(b"WebAppData", BOT_TOKEN.encode(), hashlib.sha256).digest()
        data["hash"] = hmac.new(secret, check_string.encode(), hashlib.sha256).hexdigest()
        return urlencode(data)

    def test_verified_data(self):
        self.assertEqual(verified_telegram_id(self.make_init_data()), TEST_USER)

    def test_tampered_data_fails(self):
        data = self.make_init_data()
        with self.assertRaises(ValueError):
            verified_telegram_id(data.replace("sample-query", "different-query"))

    def test_expired_data_fails(self):
        with self.assertRaises(ValueError):
            verified_telegram_id(self.make_init_data(-4000))

    def test_duplicate_data_fails(self):
        with self.assertRaises(ValueError):
            verified_telegram_id(self.make_init_data() + "&auth_date=999999")


class LedgerTests(unittest.TestCase):
    @classmethod
    def setUpClass(cls):
        with engine.begin() as conn:
            conn.execute(text("""
                CREATE TABLE IF NOT EXISTS public.users (
                  telegram_id BIGINT PRIMARY KEY,
                  first_name VARCHAR(255) NOT NULL
                )
            """))
            # Our production SQL revokes Supabase roles; local Postgres test
            # service intentionally does not install those service roles.
            schema = (Path(__file__).resolve().parents[1] /
                      "migrations/20261015_star_wallets.sql").read_text()
            for statement in schema.split(";"):
                statement = statement.strip()
                if not statement or statement.startswith("REVOKE"):
                    continue
                # Strip leading comment-only lines before executing.
                lines = [line for line in statement.splitlines()
                         if not line.lstrip().startswith("--")]
                if "\n".join(lines).strip():
                    conn.execute(text("\n".join(lines)))
            conn.execute(text("""
                INSERT INTO public.users(telegram_id,first_name)
                VALUES (:id,'Test') ON CONFLICT DO NOTHING
            """), {"id": TEST_USER})

    @classmethod
    def tearDownClass(cls):
        with engine.begin() as conn:
            conn.execute(text("DELETE FROM public.users WHERE telegram_id=:id"), {"id": TEST_USER})

    def test_paid_only_once_and_refund_only_once(self):
        order_id = uuid.uuid4()
        payload = f"vvdstars:{order_id}"
        with engine.begin() as conn:
            conn.execute(text("""
                INSERT INTO public.star_orders(id,telegram_id,stars_amount,status)
                VALUES (:id,:uid,50,'pending')
            """), {"id": order_id, "uid": TEST_USER})

        self.assertFalse(check_pre_checkout(payload, TEST_USER, "USD", 50))
        self.assertFalse(check_pre_checkout(payload, TEST_USER + 1, "XTR", 50))
        self.assertFalse(check_pre_checkout(payload, TEST_USER, "XTR", 100))
        self.assertTrue(check_pre_checkout(payload, TEST_USER, "XTR", 50))

        charge_id = f"test-charge-{uuid.uuid4()}"
        self.assertTrue(credit_successful_payment(payload, TEST_USER, "XTR", 50, charge_id))
        self.assertTrue(credit_successful_payment(payload, TEST_USER, "XTR", 50, charge_id))
        self.assertFalse(check_pre_checkout(payload, TEST_USER, "XTR", 50))
        with engine.connect() as conn:
            balance = conn.execute(text("SELECT stars FROM star_wallets WHERE telegram_id=:uid"), {"uid": TEST_USER}).scalar()
        self.assertEqual(balance, 50)

        self.assertTrue(reverse_refunded_payment(charge_id, TEST_USER, 50))
        self.assertFalse(reverse_refunded_payment(charge_id, TEST_USER, 50))
        with engine.connect() as conn:
            balance = conn.execute(text("SELECT stars FROM star_wallets WHERE telegram_id=:uid"), {"uid": TEST_USER}).scalar()
        self.assertEqual(balance, 0)


if __name__ == "__main__":
    unittest.main()
