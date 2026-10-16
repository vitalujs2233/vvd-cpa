"""AI Studio v2 integration tests on isolated CI PostgreSQL (no external API keys)."""
import hashlib
import hmac
import json
import os
import sys
import time
import uuid
import unittest
from pathlib import Path
from urllib.parse import urlencode
from fastapi import HTTPException
from starlette.requests import Request
from sqlalchemy import text

ROOT=Path(__file__).resolve().parents[1]
sys.path.insert(0,str(ROOT))
from database import engine
import ai_studio_v2 as studio
from tools_marketplace import AIModelPayload,ai_create

UID=900000002028

def signed(uid=UID):
    data={'auth_date':str(int(time.time())),'user':json.dumps({'id':uid},separators=(',',':'))}
    secret=hmac.new(b'WebAppData',os.environ['BOT_TOKEN'].encode(),hashlib.sha256).digest()
    checksum='\n'.join(f'{k}={v}' for k,v in sorted(data.items()))
    data['hash']=hmac.new(secret,checksum.encode(),hashlib.sha256).hexdigest()
    return urlencode(data)

class AISystemTests(unittest.TestCase):
    @classmethod
    def setUpClass(cls):
        with engine.begin() as conn:
            conn.execute(text('CREATE TABLE IF NOT EXISTS public.users(telegram_id BIGINT PRIMARY KEY,first_name VARCHAR(80) NOT NULL)'))
            conn.execute(text('ALTER TABLE public.users ADD COLUMN IF NOT EXISTS balance NUMERIC(14,2) DEFAULT 0'))
            conn.execute(text('CREATE TABLE IF NOT EXISTS public.offers(id varchar(80) PRIMARY KEY,title varchar(200) NOT NULL)'))
            conn.execute(text('''CREATE TABLE IF NOT EXISTS public.smartlinks(
              id uuid PRIMARY KEY,user_id BIGINT NOT NULL REFERENCES public.users(telegram_id),
              offer_id varchar(80) REFERENCES public.offers(id),suffix text,url text NOT NULL,
              created_at timestamptz NOT NULL DEFAULT now())'''))
            for filename in ('20261016_tools_marketplace.sql','20261016_ai_studio_v2.sql'):
                sql=(ROOT/'migrations'/filename).read_text()
                sql='\n'.join(line for line in sql.splitlines() if not line.lstrip().startswith('--'))
                for statement in sql.split(';'):
                    q=statement.strip()
                    if q and not q.startswith('REVOKE'):conn.execute(text(q))
            for uid in (UID,UID+1):
                conn.execute(text('INSERT INTO public.users(telegram_id,first_name) VALUES(:id,\'Test\') ON CONFLICT DO NOTHING'),{'id':uid})
            cls.own=uuid.uuid4()
            cls.other=uuid.uuid4()
            cls.slug='ai-ci-'+uuid.uuid4().hex[:10]
            conn.execute(text('''INSERT INTO public.smartlinks(id,user_id,url,suffix)
                  VALUES(:id,:uid,'https://example.com/offer','test')'''),{'id':cls.own,'uid':UID})
            conn.execute(text('''INSERT INTO public.smartlinks(id,user_id,url,suffix)
                  VALUES(:id,:uid,'https://example.com/other','other')'''),{'id':cls.other,'uid':UID+1})
        cls.model=ai_create(AIModelPayload(name='Ci model',slug=cls.slug,status='published',
           greeting='Привет!',affiliate_url='https://example.net/cannot-bypass'),signed())
        cls.id=uuid.UUID(cls.model['id'])

    @classmethod
    def tearDownClass(cls):
        with engine.begin() as conn:
            conn.execute(text('DELETE FROM public.users WHERE telegram_id IN (:a,:b)'),{'a':UID,'b':UID+1})

    def test_link_requires_actual_owner(self):
        with self.assertRaises(HTTPException) as exc:
            studio.link_config(self.id,studio.LinkConfig(kind='smartlink',smartlink_id=self.other),signed())
        self.assertEqual(exc.exception.status_code,422)
        result=studio.link_config(self.id,studio.LinkConfig(kind='smartlink',smartlink_id=self.own),signed())
        self.assertTrue(result['ok'])

    def test_public_session_and_rate_limit_guards(self):
        studio.link_config(self.id,studio.LinkConfig(kind='smartlink',smartlink_id=self.own),signed())
        req=Request({'type':'http','client':('203.0.113.28',8080),'method':'POST','path':'/'})
        result=studio.session_create(self.slug,studio.SessionCreate(),req)
        self.assertEqual(result['greeting'],'Привет!')
        self.assertFalse(result['can_chat'])  # No paid provider key in CI.
        self.assertGreaterEqual(len(result['token']),25)
        self.assertEqual(studio.session_hash(result['token']),hashlib.sha256(result['token'].encode()).hexdigest())
        with self.assertRaises(HTTPException):
            studio.click_offer(self.slug,studio.SessionCreate())
        click=studio.click_offer(self.slug,studio.SessionCreate(token=result['token'],adult_confirmed=True))
        self.assertEqual(click['url'],'https://example.com/offer')

    def test_owner_stats_and_media_token(self):
        st=studio.model_stats(self.id,signed())
        self.assertIn('visits',st)
        with self.assertRaises(HTTPException) as e:
            studio.model_stats(self.id,signed(UID+1))
        self.assertEqual(e.exception.status_code,404)
        photo_id=uuid.uuid4()
        preview=studio.media_preview_url(photo_id)
        self.assertIn(str(photo_id),preview)
        self.assertIn('sig=',preview)

if __name__=='__main__':unittest.main()
