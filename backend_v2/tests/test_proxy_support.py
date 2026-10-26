import asyncio
import unittest
from unittest.mock import patch, AsyncMock
from urllib.error import HTTPError
from fastapi import HTTPException
import proxy_ipv4_preview as routes
from proxy_tariffs import normalize_tariffs
from proxy_inventory_review import assess_inventory

class TariffTests(unittest.IsolatedAsyncioTestCase):
    def good(self):return {'tariffs':[{'country':'GBR','mobileOperator':[{'name':'test','rotationTime':[0,5]}]}]}
    def test_normalized_allowlist(self):
        raw=self.good();raw['balance']=100;raw['tariffs'][0]['secret']='omit'
        self.assertEqual(normalize_tariffs(raw),self.good()['tariffs'])
    def test_missing_fields_and_unsupported(self):
        for raw in [{},{'tariffs':[]},{'tariffs':{}},{'tariffs':[{'country':'GBR'}]},{'tariffs':[{'country':'GBR','mobileOperator':[{'name':'test','rotationTime':[True,-1,'5']}]}]}]:
            with self.subTest(raw=raw),self.assertRaises(HTTPException):normalize_tariffs(raw)
    async def test_404_explained_without_secret(self):
        with patch.dict('os.environ',PROXY_IPV4_API_KEY='test-only'),patch.object(routes,'urlopen',side_effect=HTTPError('https://invalid/test-only',404,'missing',{},None)):
            with self.assertRaises(HTTPException) as e:await routes.provider('get/tariffs',{})
            self.assertIn('get/tariffs',e.exception.detail);self.assertNotIn('test-only',e.exception.detail)
    async def test_catalogue_and_quote_use_supported_route(self):
        async def supplier(path,params):
            return {'get/tariffs':self.good(),'get/days':{'days':[30]},'get/countries':{'countries':[{'alpha3code':'GBR','name':'UK'}]},'get/order/price':{'amount':'10','currency':'USD'}}[path]
        with patch.object(routes,'require_telegram_id',return_value=42),patch.object(routes,'provider',side_effect=supplier) as provider:
            result=await routes.catalog('mobile','test');self.assertEqual(result['data']['tariffs'],self.good()['tariffs'])
            for operator,rotation in [('missing',5),('test',7)]:
                with self.assertRaises(HTTPException):await routes.quote(routes.Quote(proxy_type='mobile',country='GBR',days=30,count=1,mobile_operator=operator,rotation_time=rotation),'test')
            result=await routes.quote(routes.Quote(proxy_type='mobile',country='GBR',days=30,count=1,mobile_operator='test',rotation_time=0),'test')
            self.assertEqual(result['customer_total_usd'],'13.00')
            self.assertTrue(any(c.args==('get/tariffs',{}) for c in provider.call_args_list))

class InventoryReviewTests(unittest.TestCase):
    def assess(self,after=None,**kw):
        values=dict(count=1,country='GBR',submitted_at='2026-10-26T00:00:00Z',observed_at='2026-10-26T00:05:00Z');values.update(kw)
        return assess_inventory(['old'],after if after is not None else [{'id':'old'},{'id':'new','country':'GBR','dateStart':'2026-10-26T00:01:00Z'}],**values)
    def test_matching_snapshot_is_not_ownership_proof(self):
        r=self.assess();self.assertEqual(r['candidate_ids'],['new']);self.assertFalse(r['can_deliver']);self.assertEqual(r['state'],'manual_review')
    def test_delay_and_partial(self):
        self.assertEqual(self.assess([{'id':'old'}])['state'],'waiting');self.assertEqual(self.assess(count=2)['state'],'partial')
    def test_country_time_and_count_mismatches(self):
        self.assertEqual(self.assess(country='USA')['reason'],'country_mismatch')
        self.assertEqual(self.assess(submitted_at='2026-10-26T00:02:00Z')['reason'],'start_time_mismatch')
        self.assertEqual(self.assess([{'id':'old'},{'id':'a'},{'id':'b'}])['reason'],'unexpected_extra_proxies')
    def test_external_changes_overlap_and_parallel_lane(self):
        self.assertEqual(self.assess([])['reason'],'inventory_changed_externally')
        self.assertEqual(self.assess(assigned_ids=['new'])['reason'],'already_assigned')
        self.assertEqual(self.assess(lane_busy=True)['reason'],'another_unresolved_order')
    def test_replay_or_restart_never_authorizes(self):
        self.assertEqual(self.assess(),self.assess());self.assertFalse(self.assess()['can_deliver'])
