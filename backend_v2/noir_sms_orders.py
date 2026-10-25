"""Noir checkout. One provider attempt per durable local request; never retry POST."""
import asyncio
import json
import logging
import os
import re
import time
from collections import deque
from contextlib import nullcontext
from datetime import datetime, timezone
from decimal import Decimal
from uuid import UUID

import httpx
from fastapi import APIRouter, Depends, HTTPException, Response
from pydantic import BaseModel, Field
from sqlalchemy import text
from starlette.concurrency import run_in_threadpool
from database import engine
from noir_sms_catalog import BASE, catalog, customer_price, owner, CatalogError
from tools_order_ledger import Ledger, LedgerError

router=APIRouter(prefix='/tools-market/numbers',tags=['Noir orders'])
ledger=Ledger(engine)
PROVIDER='noir_sms'
log=logging.getLogger(__name__)

def enabled(): return os.getenv('NOIR_SMS_PURCHASES_ENABLED')=='1' and bool(os.getenv('NOIR_SMS_API_KEY','').strip())

class Purchase(BaseModel):
    request_id: UUID
    country: str=Field(pattern='^[a-z]{2}$')
    service: str=Field(pattern='^[A-Za-z0-9_-]{1,80}$')
    confirmed_price: Decimal=Field(gt=0,le=100000,decimal_places=2)

class ProviderFailure(Exception):
    def __init__(self,confirmed=False): self.confirmed=confirmed

class Supplier:
    def __init__(self,transport=None):
        self.transport=transport;self.lock=asyncio.Lock();self.calls=deque();self.cooldown=0
    async def request(self,method,path,payload=None):
        if not (method=='POST' and path=='numbers' or method=='GET' and re.fullmatch(r'numbers/[0-9a-f-]{36}',path)):
            raise ValueError('unsupported_method')
        key=os.getenv('NOIR_SMS_API_KEY','').strip()
        if not key: raise ProviderFailure(True)
        async with self.lock:
            now=time.monotonic()
            while self.calls and self.calls[0]<now-60:self.calls.popleft()
            if len(self.calls)>=60 or now<self.cooldown:raise ProviderFailure(True)
            self.calls.append(now)
        try:
            async with httpx.AsyncClient(timeout=10,follow_redirects=False,transport=self.transport) as c:
                r=await asyncio.wait_for(c.request(method,BASE+path,headers={'Authorization':'Bearer '+key,'Content-Type':'application/json'},content=payload),15)
        except (httpx.RequestError,asyncio.TimeoutError):raise ProviderFailure(False) from None
        if len(r.content)>2000000:raise ProviderFailure(False)
        try: data=json.loads(r.content,parse_float=Decimal)
        except (ValueError,TypeError):raise ProviderFailure(False) from None
        if r.status_code==429:self.cooldown=time.monotonic()+60
        if r.status_code not in (200,201):
            code=data.get('error',{}).get('code') if isinstance(data,dict) and isinstance(data.get('error'),dict) else None
            # Only documented, explicit non-purchase outcomes release money.
            safe={401:{'invalid_api_key'},402:{'insufficient_balance'},403:{'account_suspended'},400:{'no_numbers','invalid_request','invalid_country'},409:{'price_above_max'},429:{'rate_limited'},502:{'provider_error'},503:{'restocking','provider_error'}}
            raise ProviderFailure(code in safe.get(r.status_code,set()))
        return data
supplier=Supplier()

def read_order(uid,oid=None,request=None):
    with engine.connect() as c:
        row=c.execute(text('SELECT * FROM tool_orders WHERE telegram_id=:u AND provider_id=:p AND '+('id=:id' if oid else 'ledger_request_id=:id')),dict(u=uid,p=PROVIDER,id=oid or request)).mappings().first()
        return dict(row) if row else None

def view(row):
    data=row.get('noir_delivery') or {};state=row['ledger_state']
    return dict(id=str(row['id']),request_id=str(row['ledger_request_id']),country=row['ledger_selection']['country'],service=row['ledger_selection']['service'],amount=str(row['amount']),created_at=row['created_at'].isoformat(),state=state,
        phone=data.get('phone'),status=data.get('status'),expires_at=data.get('expires_at'),sms=data.get('sms',[]),
        message='Результат покупки уточняется. Не создавайте повторный заказ. Обратитесь в поддержку с ID заказа.' if state in ('submitting','unknown') else 'Покупка не состоялась. Резерв возвращён.' if state=='released' else None)

def validate(data,row):
    if not isinstance(data,dict):raise ValueError('invalid_response')
    receipt=str(UUID(data.get('id','')))
    if row['provider_order_id'] and receipt!=row['provider_order_id']:raise ValueError('wrong_receipt')
    selection=row['ledger_selection']
    if data.get('country')!=selection['country'] or data.get('service')!=selection['service'] or data.get('currency')!='USD':raise ValueError('wrong_product')
    cost,retail=customer_price(data.get('price'))
    if cost>row['cost'] or retail>row['amount']:raise ValueError('wrong_price')
    if row['ledger_state'] in ('settled','refunded') and cost!=row['cost']:raise ValueError('changed_receipt')
    phone=data.get('phone');status=data.get('status');expires=data.get('expires_at');sms=data.get('sms')
    if not isinstance(phone,str) or not re.fullmatch(r'\+?[0-9]{5,25}',phone) or status not in ('waiting','received','canceled','expired'):raise ValueError('invalid_delivery')
    if not isinstance(expires,str) or datetime.fromisoformat(expires.replace('Z','+00:00')).tzinfo is None:raise ValueError('invalid_expiry')
    if not isinstance(sms,list) or len(sms)>100:raise ValueError('invalid_sms')
    clean=[]
    for item in sms:
        if not isinstance(item,dict) or not all(isinstance(item.get(k),str) and len(item[k])<=10000 for k in ('code','text','received_at')):raise ValueError('invalid_sms')
        clean.append({k:item[k] for k in ('code','text','received_at')})
    if status in ('expired','canceled') and clean:raise ValueError('ambiguous_refund')
    return receipt,cost,retail,dict(phone=phone,status=status,expires_at=expires,sms=clean)

class BoundEngine:
    def __init__(self,c):self.c=c
    def begin(self):return nullcontext(self.c)

def apply_delivery(uid,oid,data):
    with engine.begin() as c:
        row=c.execute(text('SELECT * FROM tool_orders WHERE id=:id AND telegram_id=:u AND provider_id=:p FOR UPDATE'),dict(id=oid,u=uid,p=PROVIDER)).mappings().one()
        receipt,cost,retail,delivery=validate(data,row)
        if row['ledger_state']=='refunded':return
        bound=Ledger(BoundEngine(c))
        if row['ledger_state'] in ('submitting','unknown'):
            difference=row['amount']-retail
            if difference:
                ok=c.execute(text('UPDATE tool_wallets SET reserved=reserved-:d,available=available+GREATEST(:d-refund_debt,0),refund_debt=GREATEST(refund_debt-:d,0),updated_at=now() WHERE telegram_id=:u AND reserved>=:d RETURNING telegram_id'),dict(u=uid,d=difference)).first()
                if not ok:raise LedgerError('wallet_mismatch')
            c.execute(text('UPDATE tool_orders SET amount=:a,cost=:cost WHERE id=:id'),dict(id=oid,a=retail,cost=cost))
            bound.settle(uid,oid,receipt)
        elif row['ledger_state']!='settled':raise LedgerError('invalid_state')
        # Never replace a received SMS with a stale waiting response.
        old=row['noir_delivery'] or {}
        if old.get('sms') and not delivery['sms']:return
        c.execute(text('UPDATE tool_orders SET noir_delivery=CAST(:d AS jsonb),noir_checked_at=now() WHERE id=:id'),dict(id=oid,d=json.dumps(delivery)))
        if delivery['status'] in ('expired','canceled'):bound.refund_confirmed(uid,oid)

def reserve_purchase(uid,request,selection,cost,retail):
    with engine.begin() as c:
        c.execute(text('SELECT pg_advisory_xact_lock(:u)'),dict(u=uid))
        pending=c.execute(text("SELECT id FROM tool_orders WHERE telegram_id=:u AND provider_id=:p AND ledger_state IN ('reserved','submitting','unknown') AND ledger_request_id<>:r LIMIT 1"),dict(u=uid,p=PROVIDER,r=request)).first()
        if pending:raise LedgerError('pending_order')
        return Ledger(BoundEngine(c)).reserve(uid,request,'numbers',PROVIDER,selection,cost,retail,Decimal('30'))

@router.get('/checkout-config')
async def config(uid:int=Depends(owner)):
    return {'purchases_enabled':enabled()}

@router.post('/orders')
async def purchase(body:Purchase,response:Response,uid:int=Depends(owner)):
    response.headers['Cache-Control']='private, no-store'
    old=await run_in_threadpool(read_order,uid,None,body.request_id)
    if old:
        if old['ledger_selection']!={'country':body.country,'service':body.service,'confirmed_price':str(body.confirmed_price)}:raise HTTPException(409,'Этот запрос уже использован для другого заказа.')
        return view(old)
    if not enabled():raise HTTPException(503,'Покупки временно отключены.')
    try:
        # Force a current quote under the existing cache lock. No cached purchase price.
        async with catalog.lock:catalog.cache.pop(('services',body.country),None)
        data=await asyncio.wait_for(catalog.read('services',body.country),15)
    except (CatalogError,asyncio.TimeoutError):raise HTTPException(503,'Не удалось проверить цену. Средства не списаны.') from None
    item=next((s for s in data['services'] if s['code']==body.service and s['available']),None)
    if not item:raise HTTPException(409,'Номеров нет в наличии. Обновите каталог.')
    if Decimal(item['price'])!=body.confirmed_price:raise HTTPException(409,'Цена изменилась. Обновите каталог и подтвердите новую цену.')
    selection={'country':body.country,'service':body.service,'confirmed_price':str(body.confirmed_price)}
    try:
        oid,created=await run_in_threadpool(reserve_purchase,uid,body.request_id,selection,item['cost'],body.confirmed_price)
    except LedgerError as e:
        raise HTTPException(409,'Недостаточно средств на балансе инструментов.' if str(e)=='insufficient_balance' else 'Есть заказ с неподтверждённым результатом. Откройте «Мои номера» и обратитесь в поддержку.' if str(e)=='pending_order' else 'Повторный запрос не совпадает с заказом.') from None
    if not created:return view(await run_in_threadpool(read_order,uid,oid))
    if not await run_in_threadpool(ledger.claim,uid,oid):return view(await run_in_threadpool(read_order,uid,oid))
    payload='{"country":'+json.dumps(body.country)+',"service":'+json.dumps(body.service)+',"max_price":'+str(item['cost'])+'}'
    try:
        result=await supplier.request('POST','numbers',payload)
    except ProviderFailure as e:
        await run_in_threadpool(ledger.reject_confirmed if e.confirmed else ledger.uncertain,uid,oid)
    else:
        try:await run_in_threadpool(apply_delivery,uid,oid,result)
        except Exception:
            log.warning('Noir checkout requires reconciliation')
            # Receipt/DB mismatch: retain the reserve, no refund and no second POST.
            await run_in_threadpool(ledger.uncertain,uid,oid)
    return view(await run_in_threadpool(read_order,uid,oid))

@router.get('/orders')
async def orders(response:Response,uid:int=Depends(owner)):
    response.headers['Cache-Control']='private, no-store'
    def fetch():
        with engine.connect() as c:return [view(r) for r in c.execute(text('SELECT * FROM tool_orders WHERE telegram_id=:u AND provider_id=:p ORDER BY created_at DESC LIMIT 100'),dict(u=uid,p=PROVIDER)).mappings()]
    return {'orders':await run_in_threadpool(fetch)}

async def refresh(uid,oid):
    row=await run_in_threadpool(read_order,uid,oid)
    if not row:raise HTTPException(404,'Заказ не найден.')
    if row['ledger_state']=='settled' and (row.get('noir_delivery') or {}).get('status')=='waiting':
        def claim_check():
            with engine.begin() as c:
                return bool(c.execute(text("UPDATE tool_orders SET noir_checked_at=now() WHERE id=:id AND (noir_checked_at IS NULL OR noir_checked_at<now()-interval '5 seconds') RETURNING id"),dict(id=oid)).first())
        if await run_in_threadpool(claim_check):
            try:
                result=await supplier.request('GET','numbers/'+str(UUID(row['provider_order_id'])))
                await run_in_threadpool(apply_delivery,uid,oid,result)
            except (ProviderFailure,ValueError,CatalogError):log.warning('Noir status refresh unavailable')
    return view(await run_in_threadpool(read_order,uid,oid))

@router.get('/orders/{order_id}')
async def order(order_id:UUID,response:Response,uid:int=Depends(owner)):
    response.headers['Cache-Control']='private, no-store'
    return await refresh(uid,order_id)

@router.on_event('startup')
async def start_reconcile():
    old=getattr(router,'_noir_task',None)
    if old and not old.done():return
    async def loop():
        while True:
            await asyncio.sleep(30)
            try:
                def pending():
                    with engine.connect() as c:
                        return list(c.execute(text("SELECT telegram_id,id FROM tool_orders WHERE provider_id=:p AND ledger_state='settled' AND noir_delivery->>'status'='waiting' ORDER BY noir_checked_at NULLS FIRST LIMIT 20"),dict(p=PROVIDER)))
                for uid,oid in await run_in_threadpool(pending):
                    try:await refresh(uid,oid)
                    except Exception:log.warning('Noir reconciliation deferred')
            except Exception:log.warning('Noir reconciliation deferred')
    task=asyncio.create_task(loop())
    router._noir_task=task

@router.on_event('shutdown')
async def stop_reconcile():
    task=getattr(router,'_noir_task',None)
    if task:task.cancel()
