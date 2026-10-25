"""Internal ledger for future approved tools. No HTTP or supplier adapter.

Only trusted server callers may supply a price/receipt or confirm a rejection.
No Noir number purchase, OTP delivery or public debit endpoint is connected.
Existing proxy wallet implementation remains untouched.
"""
import json
from decimal import Decimal
from uuid import UUID, uuid4
from sqlalchemy import text

class LedgerError(Exception): pass

def amount(value, cents=False):
    if not isinstance(value,Decimal) or not value.is_finite() or not 0<value<=Decimal('1000000'):
        raise LedgerError('invalid_amount')
    if cents and value != value.quantize(Decimal('.01')): raise LedgerError('invalid_precision')
    if value != value.quantize(Decimal('.00000001')): raise LedgerError('invalid_precision')
    return value

class Ledger:
    def __init__(self, engine): self.engine=engine

    def reserve(self, owner, request_id, service, provider, selection, wholesale, retail, markup):
        wholesale=amount(wholesale);retail=amount(retail,True)
        request_id=UUID(str(request_id))
        if not isinstance(markup,Decimal) or not markup.is_finite() or not 0<=markup<=1000: raise LedgerError('invalid_markup')
        with self.engine.begin() as c:
            row=c.execute(text('''INSERT INTO tool_orders(id,telegram_id,service_id,provider_id,cost,amount,status,
                ledger_request_id,ledger_state,ledger_selection,ledger_currency,ledger_markup,ledger_updated_at)
                VALUES(:id,:u,:s,:p,:cost,:amount,'processing',:request,'reserved',CAST(:selection AS jsonb),'USD',:markup,now())
                ON CONFLICT(telegram_id,ledger_request_id) DO NOTHING RETURNING id'''),
                dict(id=uuid4(),u=owner,s=service,p=provider,cost=wholesale,amount=retail,request=request_id,selection=json.dumps(selection),markup=markup)).first()
            order=c.execute(text('SELECT * FROM tool_orders WHERE telegram_id=:u AND ledger_request_id=:r FOR UPDATE'),dict(u=owner,r=request_id)).mappings().one()
            if (order['service_id'],order['provider_id'],order['cost'],order['amount'],order['ledger_selection'],order['ledger_markup']) != (service,provider,wholesale,retail,selection,markup):
                raise LedgerError('idempotency_conflict')
            if row:
                ok=c.execute(text('''UPDATE tool_wallets SET available=available-:a,reserved=reserved+:a,updated_at=now()
                    WHERE telegram_id=:u AND available>=:a AND refund_debt=0 RETURNING telegram_id'''),dict(a=retail,u=owner)).first()
                if not ok: raise LedgerError('insufficient_balance')
            return str(order['id']), bool(row)

    def owned(self,owner,oid):
        with self.engine.connect() as c:
            row=c.execute(text('SELECT * FROM tool_orders WHERE id=:id AND telegram_id=:u AND ledger_request_id IS NOT NULL'),dict(id=UUID(str(oid)),u=owner)).mappings().first()
            if not row: raise LedgerError('not_found')
            return dict(row)

    def claim(self,owner,oid):
        # Durable state before the single external attempt. A crash leaves it reserved
        # for reconciliation; replay must not send a second supplier request.
        with self.engine.begin() as c:
            return bool(c.execute(text("""UPDATE tool_orders SET ledger_state='submitting',ledger_updated_at=now()
                WHERE id=:id AND telegram_id=:u AND ledger_state='reserved' RETURNING id"""),dict(id=UUID(str(oid)),u=owner)).first())

    def uncertain(self,owner,oid):
        with self.engine.begin() as c:
            c.execute(text("UPDATE tool_orders SET ledger_state='unknown',ledger_updated_at=now() WHERE id=:id AND telegram_id=:u AND ledger_state='submitting'"),dict(id=UUID(str(oid)),u=owner))

    def settle(self,owner,oid,receipt):
        if not isinstance(receipt,str) or not 1<=len(receipt)<=200: raise LedgerError('invalid_receipt')
        return self._finish(owner,oid,'settled',receipt)

    def reject_confirmed(self,owner,oid):
        return self._finish(owner,oid,'released')

    def refund_confirmed(self,owner,oid):
        return self._finish(owner,oid,'refunded')

    def _finish(self,owner,oid,target,receipt=None):
        with self.engine.begin() as c:
            row=c.execute(text('SELECT * FROM tool_orders WHERE id=:id AND telegram_id=:u AND ledger_request_id IS NOT NULL FOR UPDATE'),dict(id=UUID(str(oid)),u=owner)).mappings().first()
            if not row: raise LedgerError('not_found')
            state=row['ledger_state'];a=row['amount']
            if state==target:
                if target=='settled' and row['provider_order_id']!=receipt: raise LedgerError('receipt_conflict')
                return False
            allowed={'settled':('submitting','unknown'),'released':('reserved','submitting','unknown'),'refunded':('settled',)}
            if state not in allowed[target]: raise LedgerError('invalid_transition')
            if target=='settled':
                wallet=c.execute(text('UPDATE tool_wallets SET reserved=reserved-:a,updated_at=now() WHERE telegram_id=:u AND reserved>=:a RETURNING telegram_id'),dict(a=a,u=owner)).first()
            else:
                reserve_sql='reserved=reserved-:a,' if target=='released' else ''
                condition=' AND reserved>=:a' if target=='released' else ''
                wallet=c.execute(text('UPDATE tool_wallets SET '+reserve_sql+' available=available+GREATEST(:a-refund_debt,0),refund_debt=GREATEST(refund_debt-:a,0),updated_at=now() WHERE telegram_id=:u'+condition+' RETURNING telegram_id'),dict(a=a,u=owner)).first()
            if not wallet: raise LedgerError('wallet_mismatch')
            if target!='released':
                c.execute(text('''INSERT INTO tool_transactions(telegram_id,order_id,kind,amount,currency,status,external_payment_id)
                    VALUES(:u,:id,:kind,:a,'USD','success',:external)'''),dict(u=owner,id=oid,kind='purchase' if target=='settled' else 'refund',a=-a if target=='settled' else a,external='tools-ledger:'+str(oid)+':'+target))
            c.execute(text('''UPDATE tool_orders SET ledger_state=:state,status=:status,provider_order_id=COALESCE(:receipt,provider_order_id),ledger_updated_at=now()
                WHERE id=:id'''),dict(id=oid,state=target,status={'settled':'active','released':'failed','refunded':'refunded'}[target],receipt=receipt))
            return True
