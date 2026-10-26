import json
import unittest
from unittest.mock import AsyncMock
from fastapi import HTTPException
from proxy_inventory_probe import summarize_inventory, probe_inventory

class ProbeTests(unittest.IsolatedAsyncioTestCase):
    def test_empty_is_not_field_format_verification(self):
        report=summarize_inventory({'success':True,'proxies':[]}, 'ipv4')
        self.assertTrue(report['success']);self.assertFalse(report['formats_observed'])
        self.assertEqual(report['count'],0)
    def test_diagnostic_excludes_values_and_checks_pr87_dates(self):
        raw={'success':True,'proxies':[{'id':'private-id','ip':'192.0.2.1','authInfo':{'password':'secret'},
          'dateStart':'2026-10-26T12:00:00Z','dateEnd':'2026-10-29T12:00:00Z',
          'mobileOperator':'private-operator','rotationTime':0}]}
        report=summarize_inventory(raw,'mobile')
        self.assertEqual(report['fields']['id'],{'str':1})
        self.assertEqual(report['durations'],{'positive_whole_days':1})
        self.assertEqual(report['dates']['dateStart_accepted'],1)
        for value in ('private-id','192.0.2.1','secret','private-operator'):
            self.assertNotIn(value,json.dumps(report))
        raw['proxies'][0]['dateStart']='2026-10-26 12:00:00'
        self.assertEqual(summarize_inventory(raw,'mobile')['dates']['dateStart_rejected'],1)
    async def test_only_three_documented_reads_even_after_error(self):
        provider=AsyncMock(side_effect=[HTTPException(502,'secret'),{'success':True,'proxies':[]},{'success':True,'proxies':[]}])
        result=await probe_inventory(provider)
        self.assertEqual(len(result),3)
        self.assertNotIn('secret',json.dumps(result))
        self.assertEqual([c.args for c in provider.call_args_list], [('get/proxies',{'proxyType':k}) for k in ('ipv4','isp','mobile')])
