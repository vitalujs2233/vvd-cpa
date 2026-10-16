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
from unittest.mock import patch
import uuid
from pathlib import Path
from urllib.parse import urlencode

sys.path.insert(0, str(Path(__file__).resolve().parents[1]))
from sqlalchemy import text
import stars_payments
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

    def test_independently_signed_signature_field_vector(self):
        # Independent fixed HMAC test vector. Its hash was computed outside
        # the application code using a public test-only token and literal LF.
        raw = (
            "auth_date=1760631000&query_id=AAAB_test_plus_%2B&"
            "user=%7B%22id%22%3A9000000001%2C%22first_name%22%3A%22Test+User%22%7D&"
            "signature=a-public-example-Ed25519-signature%2B%2F_-&"
            "hash=6141f2ffa539e72526a675a30a2aabbbdf826762c9d668260e6d6fc86630589d"
        )
        with patch.dict(os.environ, {"BOT_TOKEN": "123456789:TEST_PUBLIC_FIXTURE_TOKEN"}):
            self.assertEqual(verified_telegram_id(raw, now=1760631020), 9000000001)
            # Mutating the signed signature parameter must invalidate the HMAC.
            with self.assertRaises(ValueError):
                verified_telegram_id(raw.replace("example-Ed25519", "changed-Ed25519"), now=1760631020)
            # Real expiry is enforced after successful HMAC verification.
            with self.assertRaises(ValueError):
                verified_telegram_id(raw, now=1760631000 + stars_payments.MAX_INIT_DATA_AGE + 1)

    def test_present_signature_is_part_of_bot_hmac(self):
        data = {
            "auth_date": str(int(time.time())),
            "user": '{"id":900000002026,"first_name":"Testing"}',
            "signature": "third-party-ed25519-signature",
        }
        token = BOT_TOKEN
        data_string = "\n".join(f"{k}={v}" for k,v in sorted(data.items()))
        key = hmac.new(b"WebAppData",token.encode(),hashlib.sha256).digest()
        data["hash"] = hmac.new(key,data_string.encode(),hashlib.sha256).hexdigest()
        self.assertEqual(verified_telegram_id(urlencode(data)), TEST_USER)

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
            schema = "\n".join(line for line in schema.splitlines()
                               if not line.lstrip().startswith("--"))
            for statement in schema.split(";"):
                statement = statement.strip()
                if statement and not statement.startswith("REVOKE"):
                    conn.execute(text(statement))
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
        # Real purchases are disabled until paid services exist.
        self.assertFalse(check_pre_checkout(payload, TEST_USER, "XTR", 50))
        self.assertFalse(stars_payments.purchases_enabled())
        self.assertTrue(all(
            not service["available"]
            for service in stars_payments.get_catalog()["services"]
        ))
        # Simulate a connected provider in the isolated test DB only.
        with patch.object(stars_payments, "LIVE_SERVICES", frozenset({"ai"})):
            with patch.dict(os.environ, {"STARS_PAYMENTS_ENABLED": "true"}):
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
