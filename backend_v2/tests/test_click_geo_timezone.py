import unittest
from datetime import datetime, timezone, date
from unittest.mock import MagicMock, patch
from types import SimpleNamespace
from fastapi import HTTPException
from cpa_analytics import bounds, arguments
from click_geo import public_client_ip, lookup_country, enrich_click_country

class ClickGeoTimezoneTests(unittest.TestCase):
    def test_riga_midnight_and_dst(self):
        for instant, expected in [(datetime(2026,10,19,21,12,tzinfo=timezone.utc),date(2026,10,20)),
                                  (datetime(2026,12,19,21,12,tzinfo=timezone.utc),date(2026,12,19))]:
            with patch('cpa_analytics.datetime') as clock:
                clock.now.side_effect=lambda zone: instant.astimezone(zone)
                self.assertEqual(bounds('today',tz='Europe/Riga'),(expected,expected))
                self.assertEqual(bounds('today',tz='UTC'),(instant.date(),instant.date()))
        with self.assertRaises(HTTPException):
            arguments('today',None,None,None,None,None,'not/a-zone')

    def test_ip_validation_and_no_header_spoofing(self):
        self.assertIsNone(public_client_ip(SimpleNamespace(client=SimpleNamespace(host='127.0.0.1'),headers={'x-forwarded-for':'8.8.8.8'})))
        self.assertEqual(public_client_ip(SimpleNamespace(client=SimpleNamespace(host='8.8.8.8'))),'8.8.8.8')
        with patch('click_geo.urlopen') as fetch:
            self.assertIsNone(lookup_country('10.0.0.1'))
            fetch.assert_not_called()

    def test_country_saved_and_failure_does_not_invent_country(self):
        engine=MagicMock()
        with patch('click_geo.urlopen') as fetch:
            fetch.return_value.__enter__.return_value.read.return_value=b'{"success":true,"country_code":"LV","country":"Latvia"}'
            enrich_click_country(engine,'owned-click','8.8.8.8')
            args=engine.begin.return_value.__enter__.return_value.execute.call_args.args
            self.assertEqual(args[1]['code'],'LV')
            self.assertEqual(args[1]['click'],'owned-click')
            engine.reset_mock()
            fetch.side_effect=TimeoutError()
            enrich_click_country(engine,'owned-click','8.8.8.8')
            engine.begin.assert_not_called()

if __name__=='__main__': unittest.main()
