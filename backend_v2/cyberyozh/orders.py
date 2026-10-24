"""Transactional order kernel, intentionally NOT connected to a live purchase route yet.

All writes reuse tool_wallets/orders/transactions. A committed dispatch claim means
'at most one provider attempt', even after a process crash. Uncertain orders require
reconciliation; no expiry job is allowed to release their reserves.
"""
import json
from decimal import Decimal
from uuid import uuid4
from sqlalchemy import text
from .client import ProviderError, money
from .numbers import identifier

class OrderError(Exception):
    pass


class Orders:
    def __init__(self, engine):
        self.engine = engine

    def reserve(self, uid, request_id, category, selection, cost, amount, expected_amount):
        if category not in ('numbers', 'proxy'):
            raise OrderError('invalid_category')
        amount, cost = money(amount), money(cost)
        if amount <= 0 or amount != amount.quantize(Decimal('.01')) or amount != money(expected_amount):
            raise OrderError('price_changed')
        request_id = identifier(request_id)
        canonical = json.dumps(selection, sort_keys=True, separators=(',', ':'))
        with self.engine.begin() as c:
            c.execute(text('INSERT INTO tool_wallets(telegram_id) VALUES(:u) ON CONFLICT DO NOTHING'), {'u': uid})
            w = c.execute(text('SELECT available,refund_debt FROM tool_wallets WHERE telegram_id=:u FOR UPDATE'), {'u': uid}).one()
            previous = c.execute(text('''SELECT d.order_id,d.selection,o.service_id,o.amount
                FROM tool_cyberyozh_orders d JOIN tool_orders o ON o.id=d.order_id
                WHERE d.telegram_id=:u AND d.request_id=:r'''), {'u': uid, 'r': request_id}).mappings().first()
            if previous:
                if previous['selection'] != selection or previous['service_id'] != category or previous['amount'] != amount:
                    raise OrderError('request_conflict')
                return str(previous['order_id']), False
            if w.refund_debt > 0 or w.available < amount:
                raise OrderError('insufficient_balance')
            oid = str(uuid4())
            p = {'id': oid, 'u': uid, 'r': request_id, 's': category, 'cost': cost,
                 'amount': amount, 'selection': canonical}
            c.execute(text('''INSERT INTO tool_orders(id,telegram_id,service_id,provider_id,cost,amount,status)
                VALUES(:id,:u,:s,'cyberyozh',:cost,:amount,'processing')'''), p)
            c.execute(text('''INSERT INTO tool_cyberyozh_orders(order_id,telegram_id,request_id,selection,wholesale)
                VALUES(:id,:u,:r,CAST(:selection AS jsonb),:cost)'''), p)
            c.execute(text('''UPDATE tool_wallets SET available=available-:amount,reserved=reserved+:amount,
                updated_at=NOW() WHERE telegram_id=:u'''), p)
            c.execute(text('''INSERT INTO tool_transactions(telegram_id,order_id,kind,amount,status,external_payment_id)
                VALUES(:u,:id,'purchase',-:amount,'processing','cyberyozh:purchase:' || :id)'''), p)
            return oid, True

    def owned(self, uid, oid, category=None):
        with self.engine.connect() as c:
            r = c.execute(text('''SELECT d.*,o.service_id,o.amount,o.created_at FROM tool_cyberyozh_orders d
                JOIN tool_orders o ON o.id=d.order_id WHERE d.order_id=:id AND d.telegram_id=:u'''),
                {'id': identifier(oid), 'u': uid}).mappings().first()
            if not r or (category is not None and r['service_id'] != category):
                raise OrderError('not_found')
            return dict(r)

    def dispatch(self, uid, oid, purchase):
        self.owned(uid, oid)
        with self.engine.begin() as c:
            claimed = c.execute(text('''UPDATE tool_cyberyozh_orders SET state='dispatched',updated_at=NOW()
                WHERE order_id=:id AND telegram_id=:u AND state='reserved' RETURNING order_id'''), {'id': oid, 'u': uid}).first()
        if not claimed:
            return  # Never call the supplier again after a claim, including after a crash.
        try:
            ids = [identifier(v) for v in purchase()]
            if not ids or len(set(ids)) != len(ids):
                raise ProviderError('invalid_order_ids')
            with self.engine.begin() as c:
                for rid in ids:
                    c.execute(text('INSERT INTO tool_cyberyozh_items(provider_order_id,order_id) VALUES(:r,:id)'), {'r': rid, 'id': oid})
                c.execute(text("UPDATE tool_cyberyozh_orders SET state='awaiting_provider',updated_at=NOW() WHERE order_id=:id"), {'id': oid})
        except ProviderError as exc:
            if exc.definite_rejection:
                self.settle(uid, oid, 'rejected')
            else:
                self.unknown(oid)
        except Exception:
            # Includes database failure after supplier acceptance. No error body/secret logging.
            self.unknown(oid)

    def unknown(self, oid):
        with self.engine.begin() as c:
            c.execute(text("""UPDATE tool_cyberyozh_orders SET state='unknown',updated_at=NOW()
                WHERE order_id=:id AND state IN ('dispatched','awaiting_provider')"""), {'id': oid})

    def settle(self, uid, oid, result):
        """Backend only: caller must establish provider outcome, never accept client claims."""
        if result not in ('issued', 'rejected', 'refunded'):
            raise OrderError('invalid_result')
        with self.engine.begin() as c:
            # Fixed lock order: wallet, then order. Shared Stars wallet writes also lock wallet.
            w = c.execute(text('SELECT refund_debt FROM tool_wallets WHERE telegram_id=:u FOR UPDATE'), {'u': uid}).first()
            row = c.execute(text('''SELECT d.state,o.amount FROM tool_cyberyozh_orders d
                JOIN tool_orders o ON o.id=d.order_id WHERE d.order_id=:id AND d.telegram_id=:u FOR UPDATE OF d'''),
                {'id': oid, 'u': uid}).first()
            if not w or not row:
                raise OrderError('not_found')
            if row.state == result or row.state in ('rejected', 'refunded'):
                return
            if result == 'issued' and row.state != 'awaiting_provider':
                raise OrderError('reconciliation_required')
            if result == 'rejected' and row.state not in ('reserved', 'dispatched', 'unknown', 'awaiting_provider'):
                raise OrderError('invalid_transition')
            if result == 'refunded' and row.state != 'issued':
                raise OrderError('invalid_transition')
            p = {'u': uid, 'id': oid, 'a': row.amount, 'result': result}
            if result == 'issued':
                c.execute(text('UPDATE tool_wallets SET reserved=reserved-:a,updated_at=NOW() WHERE telegram_id=:u'), p)
            else:
                # Refunds/unused reserves pay any existing Stars refund debt first.
                p['debt'] = min(w.refund_debt, row.amount)
                c.execute(text('''UPDATE tool_wallets SET available=available+:a-:debt,refund_debt=refund_debt-:debt,
                    reserved=reserved-:release,updated_at=NOW() WHERE telegram_id=:u'''),
                    {**p, 'release': 0 if result == 'refunded' else row.amount})
            c.execute(text('UPDATE tool_cyberyozh_orders SET state=:result,updated_at=NOW() WHERE order_id=:id'), p)
            c.execute(text('UPDATE tool_orders SET status=:s WHERE id=:id'),
                      {**p, 's': {'issued': 'active', 'rejected': 'failed', 'refunded': 'refunded'}[result]})
            if result == 'refunded':
                c.execute(text('''INSERT INTO tool_transactions(telegram_id,order_id,kind,amount,status,external_payment_id)
                    VALUES(:u,:id,'refund',:a,'success','cyberyozh:refund:' || :id)'''), p)
            else:
                c.execute(text("UPDATE tool_transactions SET status=:s WHERE external_payment_id='cyberyozh:purchase:' || :id"),
                          {**p, 's': 'success' if result == 'issued' else 'failed'})

    def reconcile(self, uid, oid, adapter):
        row = self.owned(uid, oid)
        with self.engine.connect() as c:
            ids = [str(r[0]) for r in c.execute(text('SELECT provider_order_id FROM tool_cyberyozh_items WHERE order_id=:id'), {'id': oid})]
        if not ids:
            return row['state']  # Unknown dispatch must be investigated; no fuzzy history matching.
        details = adapter.details(ids)
        if {d['id'] for d in details} != set(ids):
            return row['state']
        if row['service_id'] == 'numbers':
            issued = all(d.get('phone_number') and d.get('status') in ('waiting', 'success') for d in details)
            refunded = all(d.get('status') == 'refund' for d in details)
        else:
            issued = all(d.get('system_status') == 'active' and d.get('connection_host') and
                         d.get('connection_login') and d.get('connection_password') for d in details)
            refunded = False  # Proxy cancellation/refund API not documented.
        if row['state'] == 'awaiting_provider' and issued:
            self.settle(uid, oid, 'issued')
        elif refunded:
            self.settle(uid, oid, 'refunded' if row['state'] == 'issued' else 'rejected')
        return self.owned(uid, oid)['state']
