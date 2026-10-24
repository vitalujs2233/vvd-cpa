"""No live credentials: verify provider parsing and fail-closed photo decisions."""
import os
import unittest
from unittest.mock import AsyncMock, patch
import httpx
from fastapi import HTTPException
from ai_chat_provider import completion, eligible, image_allowed, select_photo


class ProviderTests(unittest.IsolatedAsyncioTestCase):
    def photo(self, **changes):
        return dict(id='own-photo', title='Portrait', description='Neutral portrait',
                    auto_allowed=True, send_rule='', content=b'fixture', mime_type='image/jpeg', **changes)

    async def test_provider_compatible_request_and_usage(self):
        response=httpx.Response(200,json={'choices':[{'message':{'content':'Hello'}}],
            'usage':{'prompt_tokens':12,'completion_tokens':3}},request=httpx.Request('POST','https://provider.test'))
        with patch.dict(os.environ,{'AI_API_KEY':'unit-test-only','AI_MODEL':'gemini-3.5-flash-lite',
             'AI_API_BASE':'https://generativelanguage.googleapis.com/v1beta/openai/'}), \
             patch('ai_chat_provider.httpx.AsyncClient') as client:
            post=client.return_value.__aenter__.return_value.post=AsyncMock(return_value=response)
            answer,usage=await completion([{'role':'user','content':'Hi'}])
            self.assertEqual(answer,'Hello')
            self.assertEqual(usage['prompt_tokens'],12)
            self.assertEqual(post.call_args.args[0],'https://generativelanguage.googleapis.com/v1beta/openai/chat/completions')
            self.assertEqual(post.call_args.kwargs['json']['model'],'gemini-3.5-flash-lite')

    async def test_empty_content_is_error_not_fake_answer(self):
        response=httpx.Response(200,json={'choices':[{'message':{'content':None}}]},request=httpx.Request('POST','https://provider.test'))
        with patch.dict(os.environ,{'AI_API_KEY':'unit-test-only'}),patch('ai_chat_provider.httpx.AsyncClient') as client:
            client.return_value.__aenter__.return_value.post=AsyncMock(return_value=response)
            with self.assertRaises(HTTPException): await completion([])

    async def test_foreign_photo_id_rejected(self):
        with patch('ai_chat_provider.completion',AsyncMock(return_value=({'photo_id':'foreign'},{}))), \
             patch('ai_chat_provider.image_allowed',AsyncMock()) as moderation:
            self.assertIsNone(await select_photo([self.photo()],'combined',[]))
            moderation.assert_not_awaited()

    async def test_photo_requires_positive_image_check(self):
        photo=self.photo()
        for allowed in (True,False):
            with patch('ai_chat_provider.completion',AsyncMock(return_value=({'photo_id':'own-photo'},{}))), \
                 patch('ai_chat_provider.image_allowed',AsyncMock(return_value=allowed)):
                result=await select_photo([photo],'combined',[])
                self.assertEqual(result,photo if allowed else None)

    async def test_moderation_outage_fails_closed(self):
        with patch('ai_chat_provider.completion',AsyncMock(side_effect=HTTPException(503,'Unavailable'))):
            self.assertIsNone(await select_photo([self.photo()],'combined',[]))

    async def test_strict_boolean_moderation(self):
        for result in ({'safe':'true'},{'safe':1},{},None,{'safe':False}):
            with patch('ai_chat_provider.completion',AsyncMock(return_value=(result,{}))):
                self.assertFalse(await image_allowed(b'fixture','image/jpeg'))

    def test_modes_keep_owner_permissions(self):
        photo=self.photo();photo['auto_allowed']=False
        for mode in ('automatic','rules','combined','unknown'):
            self.assertFalse(eligible(photo,mode))
        photo['send_rule']='Only when visitor asks for a portrait'
        self.assertFalse(eligible(photo,'automatic'))
        self.assertTrue(eligible(photo,'rules'))
        self.assertTrue(eligible(photo,'combined'))

if __name__=='__main__':unittest.main()
