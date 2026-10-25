import asyncio
import unittest
from unittest.mock import patch, MagicMock, AsyncMock
from uuid import uuid4
from fastapi import HTTPException
from proxy_delivery import linked_items, connection_data
import proxy_ipv4_preview as routes


def item(id='one', **extra):
    return dict(id=id, ip='192.0.2.10', httpsPort='8080', socks5Port='1080', authInfo={'login':'demo','password':'test-only'}, **extra)


class DeliveryTests(unittest.TestCase):
    def test_no_heuristic_ownership(self):
        for kind in ('ipv4','isp','mobile'):
            self.assertEqual(linked_items([item()],kind,'order'),[])
        self.assertEqual(routes.detect_delivery(set(),[item()],{'count':1,'country':'GBR'}),set())

    def test_explicit_reference_and_conflicting_reference(self):
        self.assertEqual(len(linked_items([item(orderNumber='order'),item('other',orderNumber='foreign')],'ipv4','order')),1)
        self.assertEqual(linked_items([item(orderNumber='order',orderId='foreign')],'ipv4','order'),[])

    def test_ipv6_groups_and_nested_conflicts(self):
        data=[{'orderId':'order','ips':[item(),item('bad',orderId='foreign')]},{'orderId':'foreign','ips':[item('other')]}]
        self.assertEqual([p['id'] for p in linked_items(data,'ipv6','order')],['one'])

    def test_allowlist_and_dedup(self):
        p=item(api_key='secret',user='account',rebootLink='https://invalid/secret')
        clean=connection_data([p,p])[0]
        self.assertEqual(set(clean),{'id','host','endpoints','login','password'})
        self.assertEqual(len(connection_data([p,p])),1)

    def test_gateway_embedded_port(self):
        p={'id':'one','ip':'192.0.2.10:10002','protocol':'SOCKS5'}
        self.assertEqual(connection_data([p])[0]['endpoints'],[{'protocol':'SOCKS5','port':'10002'}])
        self.assertNotIn('login',connection_data([p])[0])

    def test_invalid_connection_not_counted(self):
        self.assertEqual(connection_data([{'id':'one','ip':'bad'}, {'id':'two','ip':'192.0.2.1','httpsPort':'70000'}]),[])

    def test_mobile_metadata_and_expiry(self):
        p=connection_data([item(mobileOperator='test',rotationTime=0,dateEnd='2026-11-25T00:00:00Z')])[0]
        self.assertEqual(p['rotation_minutes'],0)
        self.assertIn('expires_at',p)

    def invoke(self, order, data):
        engine=MagicMock()
        conn=engine.connect.return_value.__enter__.return_value
        conn.execute.return_value.mappings.return_value.first.return_value=order
        provider=AsyncMock(return_value={'success':True,'proxies':data})
        with patch.object(routes,'engine',engine),patch.object(routes,'require_telegram_id',return_value=42),patch.object(routes,'provider',provider):
            result=asyncio.run(routes.order_proxies(uuid4(),'signed-test'))
        sql,params=conn.execute.call_args.args
        self.assertIn('telegram_id=:uid',str(sql));self.assertEqual(params['uid'],42)
        return result,provider

    def test_foreign_order_never_calls_provider(self):
        engine=MagicMock()
        engine.connect.return_value.__enter__.return_value.execute.return_value.mappings.return_value.first.return_value=None
        with patch.object(routes,'engine',engine),patch.object(routes,'require_telegram_id',return_value=42),patch.object(routes,'provider',new_callable=AsyncMock) as provider:
            with self.assertRaises(HTTPException) as error:
                asyncio.run(routes.order_proxies(uuid4(),'signed-test'))
            self.assertEqual(error.exception.status_code,404)
            provider.assert_not_called()

    def test_auth_required(self):
        with self.assertRaises(HTTPException):asyncio.run(routes.order_proxies(uuid4(),None))

    def test_partial_full_empty_readonly(self):
        order={'proxy_type':'ipv6','status':'fulfilled','provider_order_id':'order','selection':{'count':2}}
        for items,pending in [([],True),([item()],True),([item(),item('two')],False)]:
            result,p=self.invoke(order,[{'orderId':'order','ips':items}])
            self.assertEqual(result['delivery_pending'],pending)
            p.assert_awaited_once_with('get/proxies',{'proxyType':'ipv6'})
        # Reopening returns the same data; no purchase method is involved.
        self.assertEqual(self.invoke(order,[])[0],self.invoke(order,[])[0])

    def test_unpaid_order(self):
        with self.assertRaises(HTTPException) as error:self.invoke({'status':'prepared','provider_order_id':None},[])
        self.assertEqual(error.exception.status_code,409)

    def test_too_many_matches_fail_closed(self):
        result,_=self.invoke({'proxy_type':'ipv4','status':'fulfilled','provider_order_id':'order','selection':{'count':1}},[item(orderId='order'),item('two',orderId='order')])
        self.assertEqual(result['proxies'],[]);self.assertTrue(result['delivery_pending'])
