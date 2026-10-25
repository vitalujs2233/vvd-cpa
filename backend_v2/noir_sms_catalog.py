"""Read-only Noir SMS catalogue. No numbers/OTP or supplier mutations."""
import asyncio
import hashlib
import json
import logging
import os
import re
import time
from collections import OrderedDict, deque
from decimal import Decimal, InvalidOperation, ROUND_HALF_UP

import httpx
from fastapi import APIRouter, Depends, Header, HTTPException, Query, Response
from stars_payments import require_telegram_id

router = APIRouter(prefix='/tools-market/numbers', tags=['Noir SMS catalogue'])
log = logging.getLogger(__name__)
BASE = 'https://noirsms.com/api/v1/'
MARKUP = Decimal('1.30')
MESSAGES = {
 'not_configured': 'Каталог номеров ещё не подключён.',
 'auth': 'Поставщик не разрешил доступ к каталогу. Обратитесь в поддержку.',
 'rate_limit': 'Поставщик временно ограничил запросы. Повторите через минуту.',
 'timeout': 'Поставщик не успел ответить. Повторите загрузку.',
 'unavailable': 'Каталог временно недоступен. Повторите загрузку.',
 'invalid_response': 'Поставщик вернул неподдерживаемые данные. Повторите позже.',
 'currency': 'Валюта поставщика не поддерживается. Цена недоступна.',
 'price': 'Поставщик не предоставил корректную цену.',
 'missing': 'Для выбранной страны и сервиса нет доступного предложения.',
}

class CatalogError(Exception):
    def __init__(self, code):
        self.code = code
        super().__init__(code)


def customer_price(value):
    try:
        if isinstance(value, (bool, float)):
            raise ValueError()
        cost = Decimal(value)
        if not cost.is_finite() or not Decimal('0') < cost <= Decimal('100000'):
            raise ValueError()
        price = (cost * MARKUP).quantize(Decimal('.01'), rounding=ROUND_HALF_UP)
        if price <= 0:
            raise ValueError()
        return cost, price
    except (ValueError, TypeError, InvalidOperation):
        raise CatalogError('price') from None


class Catalog:
    def __init__(self, transport=None):
        self.transport = transport
        self.lock = asyncio.Lock()
        self.cache = OrderedDict()
        self.calls = deque()
        self.cooldown = 0
        self.key_digest = None

    async def read(self, path, country=None):
        # Explicit allowlist: no accidental paid request or arbitrary URL.
        if path not in ('countries', 'services') or (path == 'services' and not re.fullmatch('[a-z]{2}', country or '')):
            raise CatalogError('invalid_response')
        key = os.getenv('NOIR_SMS_API_KEY', '').strip()
        if not key:
            raise CatalogError('not_configured')
        async with self.lock:
            digest = hashlib.sha256(key.encode()).digest()
            if digest != self.key_digest:
                self.cache.clear(); self.cooldown = 0; self.key_digest = digest
            now = time.monotonic(); cache_key = (path, country)
            cached = self.cache.get(cache_key)
            if cached and cached[0] > now:
                return cached[1]
            while self.calls and self.calls[0] <= now-60:
                self.calls.popleft()
            # Conservative per-process ceiling, plus shared cache/coalescing.
            if now < self.cooldown or len(self.calls) >= 20:
                raise CatalogError('rate_limit')
            self.calls.append(now)
            try:
                async with httpx.AsyncClient(timeout=4, follow_redirects=False, transport=self.transport) as client:
                    r = await asyncio.wait_for(client.get(BASE+path, params={'country': country} if country else None,
                        headers={'Authorization': 'Bearer '+key, 'Accept':'application/json'}), timeout=12)
                if r.status_code in (401,403):
                    self.cooldown = time.monotonic()+30
                    raise CatalogError('auth')
                if r.status_code == 429:
                    try: delay = min(300, max(60, int(r.headers.get('Retry-After','60'))))
                    except ValueError: delay = 60
                    self.cooldown = time.monotonic()+delay
                    raise CatalogError('rate_limit')
                if r.status_code != 200:
                    self.cooldown = time.monotonic()+5
                    raise CatalogError('unavailable')
                if len(r.content) > 2000000:
                    raise CatalogError('invalid_response')
                data = json.loads(r.content, parse_float=Decimal)
                result = normalize(path, data, country)
            except (httpx.RequestError, asyncio.TimeoutError):
                self.cooldown = time.monotonic()+5
                raise CatalogError('timeout') from None
            except (ValueError, TypeError, KeyError):
                raise CatalogError('invalid_response') from None
            self.cache[cache_key] = (time.monotonic()+(60 if path=='countries' else 20), result)
            self.cache.move_to_end(cache_key)
            while len(self.cache)>256: self.cache.popitem(last=False)
            return result


def normalize(path, data, country=None):
    if not isinstance(data, dict) or not isinstance(data.get(path), list):
        raise CatalogError('invalid_response')
    if path == 'services' and (data.get('currency') != 'USD' or data.get('country') != country):
        raise CatalogError('currency' if data.get('currency') != 'USD' else 'invalid_response')
    rows=[]; seen=set()
    for row in data[path]:
        if not isinstance(row,dict): raise CatalogError('invalid_response')
        code = row.get('country' if path=='countries' else 'service')
        pattern = '[a-z]{2}' if path=='countries' else '[A-Za-z0-9_-]{1,80}'
        if not isinstance(code,str) or not re.fullmatch(pattern,code) or code in seen:
            raise CatalogError('invalid_response')
        seen.add(code)
        if path=='countries':
            rows.append({'code':code})
            continue
        name, stock = row.get('name'), row.get('stock')
        if not isinstance(name,str) or not 1<=len(name)<=200 or type(stock) is not int or stock<0:
            raise CatalogError('invalid_response')
        try: cost,price=customer_price(row.get('price')); error=None
        except CatalogError: cost=price=None; error=MESSAGES['price']
        # Wholesale is kept only in server memory; explicit public projection below.
        rows.append({'code':code,'name':name,'cost':cost,'price':str(price) if price is not None else None,
                     'stock':stock,'available':stock>0 and price is not None,'message':error})
    return {'countries':rows} if path=='countries' else {'country':country,'currency':'USD','services':rows,'quoted_at':time.time(),'expires_at':time.time()+20}

catalog = Catalog()
_users = OrderedDict()

def owner(x_telegram_init_data: str | None = Header(default=None)):
    uid = require_telegram_id(x_telegram_init_data)
    now=time.monotonic()
    times=_users.setdefault(uid,deque())
    while times and times[0]<=now-60: times.popleft()
    if len(times)>=30: raise HTTPException(429,'Слишком много запросов. Повторите через минуту.')
    times.append(now); _users.move_to_end(uid)
    while len(_users)>10000: _users.popitem(last=False)
    return uid


def public(data):
    return {**data,'services':[{k:v for k,v in r.items() if k!='cost'} for r in data['services']]}

async def load(path, country=None):
    try:
        return await asyncio.wait_for(catalog.read(path,country), timeout=15)
    except asyncio.TimeoutError:
        raise HTTPException(503,MESSAGES['timeout']) from None
    except CatalogError as exc:
        log.warning('Noir catalogue error=%s',exc.code)
        raise HTTPException(429 if exc.code=='rate_limit' else 503,MESSAGES[exc.code]) from None

@router.get('/status')
async def status(response:Response, uid:int=Depends(owner)):
    response.headers['Cache-Control']='private, no-store'
    return {'configured':bool(os.getenv('NOIR_SMS_API_KEY','').strip()),'purchases_enabled':False,'currency':'USD','markup_percent':'30'}

@router.get('/countries')
async def countries(response:Response, uid:int=Depends(owner)):
    response.headers['Cache-Control']='private, no-store'
    return await load('countries')

@router.get('/services')
async def services(response:Response, country:str=Query(pattern='^[a-z]{2}$'), uid:int=Depends(owner)):
    response.headers['Cache-Control']='private, no-store'
    return public(await load('services',country))

@router.get('/prices')
async def prices(response:Response, country:str=Query(pattern='^[a-z]{2}$'), service:str=Query(pattern='^[A-Za-z0-9_-]{1,80}$'), uid:int=Depends(owner)):
    response.headers['Cache-Control']='private, no-store'
    data=await load('services',country)
    item=next((r for r in data['services'] if r['code']==service),None)
    if item is None: raise HTTPException(404,MESSAGES['missing'])
    return {**{k:v for k,v in item.items() if k!='cost'},'country':country,'currency':'USD','expires_at':data['expires_at'],'purchases_enabled':False}

@router.post('/orders')
async def disabled(uid:int=Depends(owner)):
    raise HTTPException(503,'Покупки номеров пока отключены. Средства не списываются.')

@router.on_event('startup')
async def acceptance_probe():
    if os.getenv('NOIR_SMS_CATALOG_PROBE') != '1': return
    async def probe():
        try:
            data=await load('countries')
            codes=[r['code'] for r in data['countries']]
            code='us' if 'us' in codes else next(iter(codes),None)
            rows=await load('services',code) if code else {'services':[]}
            sample=next((r for r in rows['services'] if r['available']),None)
            log.warning('Noir acceptance countries=%s services=%s sample=%s retail=%s purchases=False',len(codes),len(rows['services']),sample['code'] if sample else None,sample['price'] if sample else None)
        except HTTPException as exc:
            log.warning('Noir acceptance failed status=%s',exc.status_code)
    asyncio.create_task(probe())
