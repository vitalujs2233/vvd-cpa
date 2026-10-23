"""Administrator controls for the existing tools wallet. No CPA money access."""
from decimal import Decimal
from uuid import UUID
from typing import Optional
from fastapi import APIRouter, Header, HTTPException, Query
from pydantic import BaseModel, Field, field_validator
from sqlalchemy import text
from database import engine
from stars_payments import require_telegram_id
from access_guard import authorized_admin
import tools_stars

router = APIRouter(prefix='/tools-market/admin', tags=['Tools admin'])

def admin(raw):
    uid = require_telegram_id(raw)
    if not authorized_admin(uid):
        raise HTTPException(403, 'Доступ только администратору.')
    return uid

class SettingsPayload(BaseModel):
    usd_per_star: Decimal = Field(ge=Decimal('.000001'), le=1, decimal_places=6)
    enabled: bool
    version: int = Field(ge=1)

class CreditPayload(BaseModel):
    telegram_id: int = Field(gt=0)
    amount: Decimal = Field(gt=0, le=10000, decimal_places=2)
    reason: str = Field(min_length=5, max_length=500)
    request_id: UUID

    @field_validator('reason')
    @classmethod
    def clean_reason(cls, value):
        if len(value.strip()) < 5:
            raise ValueError('Укажите причину начисления (от 5 символов).')
        return value.strip()

@router.get('/settings')
def get_settings(x_telegram_init_data: Optional[str] = Header(None)):
    admin(x_telegram_init_data)
    return tools_stars.settings()

@router.put('/settings')
def save_settings(data: SettingsPayload, x_telegram_init_data: Optional[str] = Header(None)):
    uid = admin(x_telegram_init_data)
    with engine.begin() as c:
        row = c.execute(text('SELECT * FROM tool_payment_settings WHERE id=1 FOR UPDATE')).mappings().one()
        if row['version'] != data.version:
            raise HTTPException(409, 'Настройки изменены. Обновите страницу.')
        c.execute(text('INSERT INTO tool_settings_audit(actor_id,old_rate,new_rate,old_enabled,new_enabled) VALUES(:u,:old,:new,:oe,:ne)'),
                  {'u':uid,'old':row['usd_per_star'],'new':data.usd_per_star,'oe':row['enabled'],'ne':data.enabled})
        c.execute(text('UPDATE tool_payment_settings SET usd_per_star=:rate,enabled=:e,version=version+1,updated_by=:u,updated_at=now() WHERE id=1'),
                  {'rate':data.usd_per_star,'e':data.enabled,'u':uid})
    return tools_stars.settings()

@router.get('/users')
def users(q: str = Query(default='', max_length=100), x_telegram_init_data: Optional[str] = Header(None)):
    admin(x_telegram_init_data)
    with engine.connect() as c:
        rows = c.execute(text("""SELECT u.telegram_id,u.partner_code,u.first_name,u.username,
          COALESCE(w.available,0) AS available,COALESCE(w.refund_debt,0) AS refund_debt
          FROM users u LEFT JOIN tool_wallets w ON w.telegram_id=u.telegram_id
          WHERE :q='' OR u.telegram_id::text=:q OR u.partner_code ILIKE :like OR u.username ILIKE :like
          ORDER BY u.telegram_id LIMIT 30"""), {'q':q.strip(),'like':'%'+q.strip().lstrip('@')+'%'}).mappings().all()
    return {'users':[{**dict(r),'telegram_id':str(r['telegram_id']),'available':str(r['available']),'refund_debt':str(r['refund_debt'])} for r in rows]}

def credit(uid, data):
    with engine.begin() as c:
        # Serialize this admin's idempotency keys before locking the target wallet.
        c.execute(text('SELECT pg_advisory_xact_lock(:u)'), {'u':uid})
        prior = c.execute(text('SELECT * FROM tool_transactions WHERE admin_actor_id=:u AND admin_request_id=:key'),{'u':uid,'key':data.request_id}).mappings().first()
        if prior:
            if prior['telegram_id'] != data.telegram_id or prior['amount'] != data.amount or prior['reason'] != data.reason:
                raise HTTPException(409, 'Этот запрос уже использован для другого начисления.')
            return {'id':str(prior['id']),'amount':str(prior['amount']),'replayed':True}
        if not c.execute(text('SELECT 1 FROM users WHERE telegram_id=:u'),{'u':data.telegram_id}).first():
            raise HTTPException(404, 'Пользователь не найден.')
        c.execute(text('INSERT INTO tool_wallets(telegram_id) VALUES(:u) ON CONFLICT DO NOTHING'),{'u':data.telegram_id})
        w = c.execute(text('SELECT available,refund_debt FROM tool_wallets WHERE telegram_id=:u FOR UPDATE'),{'u':data.telegram_id}).one()
        covered = min(data.amount,w.refund_debt)
        row = c.execute(text("""INSERT INTO tool_transactions(telegram_id,kind,amount,status,admin_actor_id,admin_request_id,reason)
          VALUES(:u,'adjustment',:a,'success',:actor,:key,:reason) RETURNING id"""),
          {'u':data.telegram_id,'a':data.amount,'actor':uid,'key':data.request_id,'reason':data.reason}).one()
        c.execute(text('UPDATE tool_wallets SET available=:a,refund_debt=:d,updated_at=now() WHERE telegram_id=:u'),
                  {'u':data.telegram_id,'a':w.available+data.amount-covered,'d':w.refund_debt-covered})
        return {'id':str(row.id),'amount':str(data.amount),'replayed':False}

@router.post('/credits')
def manual_credit(data: CreditPayload, x_telegram_init_data: Optional[str] = Header(None)):
    return credit(admin(x_telegram_init_data),data)

@router.get('/credits')
def credits(x_telegram_init_data: Optional[str] = Header(None)):
    admin(x_telegram_init_data)
    with engine.connect() as c:
        rows=c.execute(text('SELECT id,telegram_id,amount,admin_actor_id,reason,created_at FROM tool_transactions WHERE admin_request_id IS NOT NULL ORDER BY created_at DESC LIMIT 100')).mappings().all()
    return {'credits':[{k:str(v) for k,v in dict(r).items()} for r in rows]}
