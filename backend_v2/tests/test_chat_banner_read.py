"""Isolated banner reads: no production network or database operations."""
import unittest
from types import SimpleNamespace
from unittest.mock import patch
import httpx
import main
import access_guard

class BannerTests(unittest.IsolatedAsyncioTestCase):
    def test_disabled_banner_is_editable_but_not_public(self):
        row=SimpleNamespace(id=1,title='Draft',text='',button_text=None,button_url=None,is_active=False)
        class Connection:
            def __enter__(self): return self
            def __exit__(self,*args): pass
            def execute(self,sql,params):
                self.result=None if params['active_only'] else row
                return self
            def fetchone(self): return self.result
        with patch.object(main.engine,'connect',return_value=Connection()):
            self.assertIsNone(main.get_chat_banner()['banner'])
            banner=main.get_admin_chat_banner()['banner']
            self.assertEqual(banner['title'],'Draft')
            self.assertFalse(banner['is_active'])

    async def test_admin_read_denies_non_admin(self):
        with patch.object(access_guard,'verified_telegram_id',return_value=123), patch.object(access_guard,'authorized_admin',return_value=False):
            async with httpx.AsyncClient(transport=httpx.ASGITransport(app=main.app),base_url='http://isolated') as client:
                result=await client.get('/admin/chat/banner')
                self.assertEqual(result.status_code,403)

    async def test_admin_empty_banner_is_success_not_error(self):
        with patch.object(access_guard,'verified_telegram_id',return_value=232682307), patch.object(access_guard,'authorized_admin',return_value=True), patch.object(main,'read_chat_banner',return_value={'success':True,'banner':None}) as read:
            async with httpx.AsyncClient(transport=httpx.ASGITransport(app=main.app),base_url='http://isolated') as client:
                result=await client.get('/admin/chat/banner')
                self.assertEqual(result.status_code,200)
                self.assertEqual(result.json(),{'success':True,'banner':None})
                read.assert_called_once_with(active_only=False)
