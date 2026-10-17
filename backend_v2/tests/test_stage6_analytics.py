"""Stage 6 isolated, read-only analytics behavior. No production database writes."""
import unittest
from datetime import date
from decimal import Decimal
from unittest.mock import MagicMock,patch

from fastapi import HTTPException
from cpa_analytics import bounds,arguments,summarize,router,CLICK_ROWS,CONVERSION_ROWS


class Stage6AnalyticsTests(unittest.TestCase):
    def test_all_period_without_fake_dates(self):
        self.assertEqual(bounds("all"),(None,None))

    def test_date_range_rejected_if_inverted(self):
        from cpa_analytics import options
        with self.assertRaises(HTTPException):
            options("all",date(2026,10,20),date(2026,10,19),None,None,None)

    def test_unsupported_period(self):
        with self.assertRaises(HTTPException):
            bounds("forever")

    def test_user_isolation_both_sources(self):
        self.assertIn("k.user_id=:uid",CLICK_ROWS)
        self.assertIn("v.user_id=:uid",CONVERSION_ROWS)
        self.assertIn("CAST(:uid AS BIGINT) IS NULL",CLICK_ROWS)
        self.assertIn("CAST(:uid AS BIGINT) IS NULL",CONVERSION_ROWS)

    def test_finance_epoch_is_required(self):
        self.assertIn("e.activated_at IS NOT NULL",CONVERSION_ROWS)
        self.assertIn("v.finance_eligible_at>=e.activated_at",CONVERSION_ROWS)

    def test_legacy_status_not_credited(self):
        self.assertIn("v.status IN ('1','2','3') THEN 'legacy'",CONVERSION_ROWS)

    def test_no_clicks_or_new_conversions_return_zeros(self):
        conn=MagicMock()
        click_result=MagicMock();click_result.scalar_one.return_value=0
        conversion_result=MagicMock();conversion_result.mappings.return_value.all.return_value=[]
        account_result=MagicMock();account_result.scalar.return_value=None
        conn.execute.side_effect=[click_result,conversion_result,account_result]
        report=summarize(conn,42,{"start":None,"end":None,"vertical":None,"offer":None,"network":None})
        self.assertEqual(report["clicks"],0)
        self.assertEqual(report["conversions"],0)
        self.assertEqual(report["cr"],0)
        self.assertEqual(report["epc"],0)
        self.assertEqual(report["finance"]["hold"],0)
        self.assertEqual(report["finance"]["released"],0)

    def test_routes_are_read_only(self):
        route_methods={path:route.methods for route in router.routes for path in [route.path]}
        self.assertEqual(route_methods["/statistics/{telegram_id}"],{"GET"})
        self.assertEqual(route_methods["/statistics/{telegram_id}/breakdown"],{"GET"})
        self.assertEqual(route_methods["/admin/analytics"],{"GET"})


if __name__=="__main__":
    unittest.main()
