"""No database/network writes: verify slow synchronous reads do not block HTTP."""
import asyncio
import threading
import unittest
from unittest.mock import patch
import httpx
from fastapi import FastAPI
import main

class ReadConcurrencyTests(unittest.IsolatedAsyncioTestCase):
    async def test_slow_banner_does_not_block_health(self):
        entered=threading.Event()
        release=threading.Event()
        class Connection:
            def __enter__(self): return self
            def __exit__(self,*args): pass
            def execute(self,*args):
                entered.set()
                release.wait(2)
                return self
            def fetchone(self): return None
        class Engine:
            def connect(self): return Connection()
        app=FastAPI()
        app.get('/banner')(main.get_chat_banner)
        @app.get('/health')
        async def health(): return {'ok':True}
        with patch.object(main,'engine',Engine()):
            async with httpx.AsyncClient(transport=httpx.ASGITransport(app=app),base_url='http://isolated') as client:
                task=asyncio.create_task(client.get('/banner'))
                try:
                    for _ in range(100):
                        if entered.is_set(): break
                        await asyncio.sleep(.005)
                    self.assertTrue(entered.is_set())
                    self.assertFalse(task.done(), 'Slow read blocked the event loop')
                    response=await asyncio.wait_for(client.get('/health'),.5)
                    self.assertEqual(response.status_code,200)
                    self.assertFalse(task.done())
                finally:
                    release.set()
                    result=await task
                self.assertEqual(result.json(),{'success':True,'banner':None})
