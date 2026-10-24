"""Proxy-Seller demo endpoints must never create orders or charge wallets."""
import unittest
from fastapi import HTTPException
from pydantic import ValidationError
from proxy_seller_demo import ProxySelection, proxy_config, proxy_purchase_disabled

class ProxyDemoTests(unittest.TestCase):
    def test_demo_catalog_is_not_sellable(self):
        data = proxy_config()
        self.assertEqual(data["mode"], "demo")
        self.assertFalse(data["purchases_enabled"])
        self.assertEqual(data["provider"], "proxy-seller")

    def test_selection_validation(self):
        with self.assertRaises(ValidationError):
            ProxySelection(proxy_type="isp", country="US", quantity=0, days=7)
        with self.assertRaises(ValidationError):
            ProxySelection(proxy_type="ipv4", country="US", quantity=1, days=365)

    def test_purchase_requires_telegram_auth(self):
        with self.assertRaises(HTTPException):
            proxy_purchase_disabled(None)

if __name__ == "__main__":
    unittest.main()
