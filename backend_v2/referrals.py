"""One-level referrals: credit only completed real CPA payouts; manual withdrawals."""
from decimal import Decimal
from uuid import UUID
from sqlalchemy import text
from cpa_finance import money


def totals(conn, uid):
    row=conn.execute(text("""SELECT
        (SELECT COALESCE(sum(amount),0) FROM referral_rewards WHERE inviter_id=:uid) earned,
        (SELECT COALESCE(sum(amount),0) FROM referral_withdrawals WHERE user_id=:uid AND status IN ('pending','paid')) used
    """),{'uid':uid}).one()
    return Decimal(row.earned),Decimal(row.earned)-Decimal(row.used)



def summary(engine,uid):
    with engine.connect() as c:
        user=c.execute(text('SELECT partner_code FROM users WHERE telegram_id=:uid'),{'uid':uid}).first()
        if not user: return {'success':False,'message':'Пользователь не найден'}
        earned,balance=totals(c,uid)
        people=c.execute(text('''SELECT u.telegram_id,u.first_name,u.username,u.partner_code,
          COALESCE(sum(r.amount),0) earned
          FROM users u LEFT JOIN referral_rewards r ON r.invitee_id=u.telegram_id AND r.inviter_id=:uid
          WHERE u.invited_by=:uid GROUP BY u.telegram_id,u.first_name,u.username,u.partner_code
          ORDER BY u.telegram_id'''),{'uid':uid}).mappings().all()
        history=c.execute(text('SELECT id,amount,wallet,payment_method,status,created_at FROM referral_withdrawals WHERE user_id=:uid ORDER BY id DESC'),{'uid':uid}).mappings().all()
        return {'success':True,'referral_code':user.partner_code,'referral_link':f'https://t.me/vvd_cpa_bot?start={user.partner_code}',
          'balance':float(balance),'earned':float(earned),'invited':len(people),
          'people':[dict(p,earned=float(p['earned'])) for p in people],
          'withdrawals':[dict(w,amount=float(w['amount']),created_at=str(w['created_at'])) for w in history]}


def create(engine,uid,amount,wallet,request_id):
    try: amount=money(str(amount));key=UUID(str(request_id))
    except (ValueError,TypeError): return {'success':False,'message':'Некорректная сумма или номер заявки'}
    wallet=wallet.strip()
    if amount<Decimal('50'): return {'success':False,'message':'Минимальная сумма вывода — $50'}
    import re
    if not re.fullmatch(r'T[1-9A-HJ-NP-Za-km-z]{33}',wallet):
        return {'success':False,'message':'Укажите адрес USDT TRC20: 34 символа, начинается с T'}
    with engine.begin() as c:
        user=c.execute(text('SELECT telegram_id FROM users WHERE telegram_id=:uid FOR UPDATE'),{'uid':uid}).first()
        if not user:return {'success':False,'message':'Пользователь не найден'}
        old=c.execute(text('SELECT id,amount,wallet,status FROM referral_withdrawals WHERE user_id=:uid AND request_id=:key'),{'uid':uid,'key':key}).mappings().first()
        if old:
            if old['amount']!=amount or old['wallet']!=wallet:return {'success':False,'message':'Данные повторной заявки отличаются'}
            return {'success':True,'withdrawal_id':old['id'],'duplicate':True}
        _,balance=totals(c,uid)
        if amount>balance:return {'success':False,'message':'Недостаточно средств на реферальном балансе'}
        wid=c.execute(text("INSERT INTO referral_withdrawals(user_id,amount,wallet,request_id) VALUES(:uid,:amount,:wallet,:key) RETURNING id"),{'uid':uid,'amount':amount,'wallet':wallet,'key':key}).scalar_one()
        return {'success':True,'withdrawal_id':wid,'balance':float(balance-amount)}


def admin_list(conn,status=None):
    rows=conn.execute(text('''SELECT w.*,u.partner_code,u.first_name,u.last_name,u.username FROM referral_withdrawals w
       JOIN users u ON u.telegram_id=w.user_id WHERE (:status IS NULL OR w.status=:status) ORDER BY w.id DESC'''),{'status':status}).mappings().all()
    return [dict(id=r['id'],telegram_id=r['user_id'],partner_code=r['partner_code'],amount=float(r['amount']),
      payment_method=r['payment_method'],wallet=r['wallet'],status=r['status'],source='referral',is_real_finance=True,
      created_at=str(r['created_at']),processed_at=str(r['processed_at']) if r['processed_at'] else None) for r in rows]


def process(engine,wid,decision,admin_uid,confirmed=False):
    if decision not in ('paid','rejected'):raise ValueError('Invalid decision')
    if decision=='paid' and not confirmed:return {'success':False,'message':'Подтвердите ручной перевод'}
    with engine.begin() as c:
        uid=c.execute(text('SELECT user_id FROM referral_withdrawals WHERE id=:id'),{'id':wid}).scalar_one_or_none()
        if uid is None:return {'success':False,'message':'Заявка не найдена'}
        c.execute(text('SELECT telegram_id FROM users WHERE telegram_id=:uid FOR UPDATE'),{'uid':uid})
        row=c.execute(text('SELECT * FROM referral_withdrawals WHERE id=:id FOR UPDATE'),{'id':wid}).mappings().one()
        if row['status']!='pending':return {'success':False,'message':'Заявка уже обработана'}
        c.execute(text('UPDATE referral_withdrawals SET status=:status,processed_at=now(),processed_by=:admin WHERE id=:id'),{'status':decision,'admin':admin_uid,'id':wid})
        return {'success':True,'user_id':uid,'amount':float(row['amount']),'status':decision}
