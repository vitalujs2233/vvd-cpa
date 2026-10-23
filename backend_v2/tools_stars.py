"""Stars invoices settling into the EXISTING USD tools wallet only.

No browser callback can settle an invoice. Call settle only from Telegram updates
or an authenticated getStarTransactions response. Rate is a merchant price, not FX.
"""
import asyncio
import logging
import os
from decimal import Decimal, ROUND_CEILING
from uuid import UUID, uuid4

from fastapi import HTTPException
from sqlalchemy import text
from database import engine

log = logging.getLogger(__name__)
PREFIX = 'vvdtools:'


def settings():
    try:
        rate = Decimal(os.getenv('TOOLS_STARS_PER_USD', '0'))
        if not rate.is_finite() or not Decimal('1') <= rate <= Decimal('100000') or rate != rate.quantize(Decimal('.000001')):
            rate = Decimal(0)
    except Exception:
        rate = Decimal(0)
    enabled = (os.getenv('TOOLS_STARS_ENABLED', 'false').lower() == 'true'
               and bool(rate) and bool(os.getenv('BOT_TOKEN')))
    return {'payments_enabled': enabled, 'stars_per_usd': str(rate) if rate else None,
            'min_usd': '5.00', 'max_usd': '10000.00', 'currency': 'XTR'}


def price(amount, rate):
    amount = Decimal(str(amount))
    if not amount.is_finite() or amount != amount.quantize(Decimal('.01')) or not 5 <= amount <= 10000:
        raise HTTPException(422, 'Укажите сумму от $5 до $10 000, до двух знаков после запятой.')
    stars = int((amount * Decimal(str(rate))).to_integral_value(rounding=ROUND_CEILING))
    if not 1 <= stars <= 100000:
        raise HTTPException(422, 'Для этой суммы превышен лимит Stars. Выберите меньшую сумму.')
    return amount, stars


def invoice_id(payload):
    try:
        return UUID(payload[len(PREFIX):]) if payload.startswith(PREFIX) else None
    except (ValueError, AttributeError):
        return None


def public(row):
    return {k: (str(v) if v is not None and k not in ('stars_amount',) else v)
            for k, v in dict(row).items() if k in
            ('id', 'amount_usd', 'currency', 'stars_amount', 'status', 'payment_url', 'created_at', 'updated_at', 'paid_at', 'expires_at')}


def prepare(uid, amount, request_id, expected_stars):
    cfg = settings()
    if not cfg['payments_enabled']:
        raise HTTPException(503, 'Пополнение через Stars пока не включено.')
    amount, stars = price(amount, cfg['stars_per_usd'])
    with engine.begin() as c:
        # Serialize requests from the same owner, including different request keys.
        c.execute(text('SELECT pg_advisory_xact_lock(:uid)'), {'uid': uid})
        row = c.execute(text("SELECT * FROM tool_payment_invoices WHERE telegram_id=:uid AND request_id=:key"),
                        {'uid': uid, 'key': request_id}).mappings().first()
        if row:
            if row['amount_usd'] != amount:
                raise HTTPException(409, 'Этот запрос уже использован для другой суммы.')
            return dict(row)
        if stars != expected_stars:
            raise HTTPException(409, 'Тариф изменился. Обновите страницу перед оплатой.')
        row = c.execute(text("""SELECT * FROM tool_payment_invoices
            WHERE telegram_id=:uid AND provider='telegram_stars' AND amount_usd=:amount
            AND stars_amount=:stars AND status IN ('draft','pending') AND expires_at>NOW()
            ORDER BY created_at DESC LIMIT 1"""), {'uid': uid, 'amount': amount, 'stars': stars}).mappings().first()
        if row:
            return dict(row)
        row = c.execute(text("""INSERT INTO tool_payment_invoices
            (id,telegram_id,provider,amount_usd,stars_amount,stars_per_usd,request_id,expires_at,terms_version,terms_accepted_at)
            VALUES (:id,:uid,'telegram_stars',:amount,:stars,:rate,:key,NOW()+INTERVAL '30 minutes','tools-stars-v1',NOW())
            RETURNING *"""), {'id': uuid4(), 'uid': uid, 'amount': amount, 'stars': stars,
                               'rate': cfg['stars_per_usd'], 'key': request_id}).mappings().one()
        return dict(row)


async def create_invoice(uid, amount, request_id, expected_stars, bot):
    row = await asyncio.to_thread(prepare, uid, amount, request_id, expected_stars)
    if row['payment_url'] or row['status'] not in ('draft', 'pending'):
        return public(row)
    from aiogram.types import LabeledPrice
    try:
        url = await bot.create_invoice_link(
            title='Баланс инструментов VVD CPA',
            description=f"Пополнение на ${row['amount_usd']:.2f} для оплаты инструментов. Не для вывода.",
            payload=PREFIX + str(row['id']), provider_token='', currency='XTR',
            prices=[LabeledPrice(label=f"Баланс ${row['amount_usd']:.2f}", amount=row['stars_amount'])])
    except Exception:
        # An ambiguous timeout leaves the SAME invoice recoverable. Additional
        # links share its payload; pre-checkout locks prevent a second payment.
        log.warning('tools_stars_invoice_creation_failed invoice=%s', row['id'])
        raise HTTPException(502, 'Не удалось открыть оплату. Повторите попытку — счёт сохранён.')
    with engine.begin() as c:
        result = c.execute(text("""UPDATE tool_payment_invoices SET payment_url=COALESCE(payment_url,:url),
            status=CASE WHEN status='draft' THEN 'pending' ELSE status END,updated_at=NOW()
            WHERE id=:id RETURNING *"""), {'id': row['id'], 'url': url}).mappings().one()
        return public(result)


def pre_checkout(payload, uid, currency, stars, query_id):
    iid = invoice_id(payload)
    if not iid or currency != 'XTR' or not query_id or not settings()['payments_enabled']:
        return False
    with engine.begin() as c:
        row = c.execute(text("""UPDATE tool_payment_invoices
            SET checkout_query_id=:q,updated_at=NOW()
            WHERE id=:id AND provider='telegram_stars' AND telegram_id=:uid
              AND stars_amount=:stars AND status='pending' AND expires_at>NOW()
              AND (checkout_query_id IS NULL OR checkout_query_id=:q)
            RETURNING id"""), {'id': iid, 'uid': uid, 'stars': stars, 'q': query_id}).first()
        return bool(row)


def settle(payload, uid, currency, stars, charge, refunded=False):
    """One DB transaction, invoice and wallet locks, two unique ledger guards.

    Refund-first delivery is supported: record both entries atomically with zero
    net credit. Spent refunds become debt rather than blocking reconciliation.
    """
    iid = invoice_id(payload)
    if not iid or currency != 'XTR' or not charge or stars <= 0:
        return False
    with engine.begin() as c:
        row = c.execute(text("SELECT * FROM tool_payment_invoices WHERE id=:id FOR UPDATE"),
                        {'id': iid}).mappings().first()
        if not row or row['provider'] != 'telegram_stars' or row['telegram_id'] != uid or row['stars_amount'] != stars:
            return False
        if row['provider_invoice_id'] and row['provider_invoice_id'] != charge:
            return False
        if row['status'] == 'refunded' or (row['status'] == 'paid' and not refunded):
            return row['provider_invoice_id'] == charge
        if row['status'] not in ('pending', 'expired', 'paid'):
            return False
        c.execute(text("INSERT INTO tool_wallets(telegram_id) VALUES(:uid) ON CONFLICT DO NOTHING"), {'uid': uid})
        w = c.execute(text('SELECT available,refund_debt FROM tool_wallets WHERE telegram_id=:uid FOR UPDATE'), {'uid': uid}).one()
        available, debt = w.available, w.refund_debt
        if row['status'] != 'paid':
            c.execute(text("""INSERT INTO tool_transactions
                (telegram_id,kind,amount,status,external_payment_id,payment_invoice_id)
                VALUES(:uid,'topup',:amount,'success',:charge,:id)"""),
                      {'uid': uid, 'amount': row['amount_usd'], 'charge': 'stars:'+charge, 'id': iid})
            covered = min(debt, row['amount_usd'])
            debt -= covered
            available += row['amount_usd'] - covered
        if refunded:
            c.execute(text("""INSERT INTO tool_transactions
                (telegram_id,kind,amount,status,external_payment_id,payment_invoice_id)
                VALUES(:uid,'refund',:amount,'refunded',:charge,:id)"""),
                      {'uid': uid, 'amount': -row['amount_usd'], 'charge': 'stars-refund:'+charge, 'id': iid})
            covered = min(available, row['amount_usd'])
            available -= covered
            debt += row['amount_usd'] - covered
        c.execute(text('UPDATE tool_wallets SET available=:a,refund_debt=:d,updated_at=NOW() WHERE telegram_id=:uid'),
                  {'a': available, 'd': debt, 'uid': uid})
        c.execute(text("""UPDATE tool_payment_invoices SET status=:status,provider_invoice_id=:charge,
            paid_at=COALESCE(paid_at,NOW()),refunded_at=CASE WHEN :refund THEN NOW() ELSE refunded_at END,
            updated_at=NOW() WHERE id=:id"""),
                  {'status': 'refunded' if refunded else 'paid', 'charge': charge, 'refund': refunded, 'id': iid})
    return True


async def reconcile(bot):
    """Authenticated provider history restores missed updates, also after disable.

    Full pagination intentionally avoids assuming sort order or losing late
    refunds to an offset checkpoint. All events are idempotent.
    """
    with engine.connect() as c:
        if not c.execute(text("SELECT 1 FROM tool_payment_invoices WHERE provider='telegram_stars' LIMIT 1")).first():
            return
    offset = 0
    while True:
        batch = await bot.get_star_transactions(offset=offset, limit=100)
        for tx in batch.transactions:
            source = getattr(tx, 'source', None)
            receiver = getattr(tx, 'receiver', None)
            partner = source or receiver
            if not partner or getattr(partner, 'type', None) != 'user':
                continue
            payload = getattr(partner, 'invoice_payload', '') or ''
            if not invoice_id(payload):
                # Some refund records omit payload; only match a stored charge.
                if not receiver:
                    continue
                with engine.connect() as c:
                    iid = c.execute(text("SELECT id FROM tool_payment_invoices WHERE provider='telegram_stars' AND provider_invoice_id=:ch AND telegram_id=:uid"),
                                    {'ch': tx.id, 'uid': partner.user.id}).scalar()
                if not iid:
                    continue
                payload = PREFIX + str(iid)
            if getattr(tx, 'nanostar_amount', 0):
                continue
            accepted = await asyncio.to_thread(settle, payload, partner.user.id, 'XTR', abs(tx.amount), tx.id, bool(receiver))
            if not accepted:
                log.error('tools_stars_reconciliation_mismatch invoice=%s', invoice_id(payload))
        if len(batch.transactions) < 100:
            break
        offset += len(batch.transactions)
        await asyncio.sleep(.1)


async def reconciliation_loop(bot):
    while True:
        try:
            await reconcile(bot)
        except asyncio.CancelledError:
            raise
        except Exception as exc:
            log.warning('tools_stars_reconciliation_failed category=%s', type(exc).__name__)
        await asyncio.sleep(60)
