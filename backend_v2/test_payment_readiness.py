import unittest
from decimal import Decimal
from payment_readiness import normalize_usd, can_transition, verify_invoice_match


class PaymentReadinessTests(unittest.TestCase):
    def test_amount(self):
        self.assertEqual(normalize_usd("5.00"), Decimal("5.00"))
        for value in ("NaN", "Infinity", "4.99", "10000.01", "5.001", 5.0, True):
            with self.subTest(value=value), self.assertRaises(ValueError):
                normalize_usd(value)

    def test_state_machine(self):
        self.assertTrue(can_transition("draft", "pending"))
        self.assertTrue(can_transition("pending", "paid"))
        self.assertTrue(can_transition("paid", "paid"))
        self.assertFalse(can_transition("paid", "pending"))
        self.assertFalse(can_transition("expired", "paid"))
        self.assertFalse(can_transition("unknown", "paid"))

    def test_invoice_identity(self):
        args = dict(expected_invoice_id="123", expected_amount="25.00", expected_currency="USD",
                    observed_invoice_id="123", observed_amount="25", observed_currency="USD")
        self.assertTrue(verify_invoice_match(**args))
        for field, bad in (("observed_invoice_id", "124"), ("observed_amount", "26"),
                           ("observed_currency", "EUR")):
            self.assertFalse(verify_invoice_match(**{**args, field: bad}))


if __name__ == "__main__":
    unittest.main()
