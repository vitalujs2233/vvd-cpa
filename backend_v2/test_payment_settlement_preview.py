import unittest
from decimal import Decimal
from payment_settlement_preview import InvoiceSnapshot, VerifiedObservation, evaluate_observation


class SettlementPreviewTests(unittest.TestCase):
    def setUp(self):
        self.invoice = InvoiceSnapshot("inv-1", Decimal("25.00"), "USD", "pending")
        self.paid = VerifiedObservation("inv-1", Decimal("25.00"), "USD", "paid", trusted=True)

    def test_untrusted_rejected(self):
        result = evaluate_observation(self.invoice, VerifiedObservation("inv-1", Decimal("25"), "USD", "paid"))
        self.assertFalse(result.accepted)
        self.assertFalse(result.needs_credit)

    def test_valid_confirmation_is_only_proposal(self):
        result = evaluate_observation(self.invoice, self.paid)
        self.assertTrue(result.accepted)
        self.assertTrue(result.needs_credit)

    def test_repeat_is_noop(self):
        result = evaluate_observation(InvoiceSnapshot("inv-1", Decimal("25"), "USD", "paid"), self.paid)
        self.assertTrue(result.accepted)
        self.assertFalse(result.needs_credit)

    def test_mismatch_rejected(self):
        for value in (VerifiedObservation("other", Decimal("25"), "USD", "paid", True),
                      VerifiedObservation("inv-1", Decimal("26"), "USD", "paid", True),
                      VerifiedObservation("inv-1", Decimal("25"), "EUR", "paid", True)):
            self.assertFalse(evaluate_observation(self.invoice, value).accepted)

    def test_terminal_cannot_reopen(self):
        old = InvoiceSnapshot("inv-1", Decimal("25"), "USD", "expired")
        self.assertFalse(evaluate_observation(old, self.paid).accepted)


if __name__ == "__main__":
    unittest.main()
