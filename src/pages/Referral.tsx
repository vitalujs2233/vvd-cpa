import {CopyButton} from '@/shared/ui/CopyButton';
import {readApiSnapshot} from '@/shared/lib/viewSnapshot';
import React, { useEffect, useState, useRef } from 'react';
import { useNavigate } from 'react-router-dom';
import { ArrowLeft } from 'lucide-react';
import { Button } from '@/shared/ui/Button';
import { Input } from '@/shared/ui/Input';
import { Card } from '@/shared/ui/Card';
import { getTelegramUser } from '@/shared/lib/telegram';
import { apiRequest } from '@/shared/lib/api';

export const Referral: React.FC = () => {
  const navigate = useNavigate();

  const [referral, setReferral] = useState<any>(()=>readApiSnapshot(`/referral/${getTelegramUser().id}`)||null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [showForm, setShowForm] = useState(false);
  const [amount, setAmount] = useState('');
  const [wallet, setWallet] = useState('');
  const [sending, setSending] = useState(false);
  const [notice, setNotice] = useState('');
  const request = useRef<{id:string; amount:string; wallet:string} | null>(null);
  const submitting = useRef(false);
  const withdraw = async (event: React.FormEvent) => {
    event.preventDefault();
    if (submitting.current) return;
    submitting.current = true; setSending(true); setError(''); setNotice('');
    const address = wallet.trim();
    if (!request.current || request.current.amount !== amount || request.current.wallet !== address) {
      request.current = {id:crypto.randomUUID(),amount,wallet:address};
    }
    try {
      const result = await apiRequest<any>(`/referral/${getTelegramUser().id}/withdrawals`, {
        method:'POST', body:JSON.stringify({amount,wallet:address,request_id:request.current.id})
      });
      if (!result.success) throw new Error(result.message || 'Не удалось отправить заявку');
      setNotice('Заявка отправлена администратору.'); setShowForm(false); setAmount(''); setWallet('');
      request.current = null;
      if (typeof result.balance === 'number') setReferral((old:any)=>({...old,balance:result.balance}));
      const fresh = await apiRequest<any>(`/referral/${getTelegramUser().id}`);
      setReferral(fresh);
    } catch (e) { setError(e instanceof Error ? e.message : 'Не удалось отправить заявку'); }
    finally { submitting.current=false; setSending(false); }
  };


  useEffect(() => {
    const loadReferral = async () => {
      const user = getTelegramUser();

      if (!user) return;

      try {
       const data = await apiRequest<any>(`/referral/${user.id}`);

setReferral(data);
      } catch (e) {
        setError(e instanceof Error ? e.message : 'Не удалось загрузить данные');
      } finally {
        setLoading(false);
      }
    };

    loadReferral();
  }, []);

  return (
    <div className="flex flex-col gap-4 p-4 pb-24 animate-fade-in">

      <div className="flex items-center gap-3">
        <button
          onClick={() => navigate(-1)}
          className="w-11 h-11 rounded-full bg-bgCard/40 border border-white/10 flex items-center justify-center"
        >
          <ArrowLeft size={18} />
        </button>

        <div className="flex flex-col">
          <span className="text-[10px] uppercase tracking-wider text-accentGold font-bold">
            Кабинет
          </span>

          <h1 className="text-2xl font-bold text-white">
            Реферальная программа
          </h1>
        </div>
      </div>

      <Card padding="lg" className="text-center">

        <div className="text-[11px] uppercase tracking-widest text-accentGold font-bold">
          Реферальный баланс
        </div>

        <div className="text-4xl font-extrabold text-white mt-3">
          {referral ? `$${Number(referral.balance).toFixed(2)}` : '—'}
        </div>

        <Button className="mt-5" disabled={!referral || sending} onClick={()=>setShowForm(!showForm)}>Вывести</Button>
        <p className="mt-2 text-xs text-textSecondary">Минимальная выплата — $50 · USDT TRC20</p>
        {showForm && <form onSubmit={withdraw} className="mt-4 flex flex-col gap-3 text-left">
          <label className="text-xs text-textSecondary">Сумма, USD
            <Input required type="number" inputMode="decimal" min="50" step="0.01" value={amount} onChange={e=>setAmount(e.target.value)} disabled={sending}/>
          </label>
          <label className="text-xs text-textSecondary">Адрес кошелька USDT TRC20
            <Input required value={wallet} onChange={e=>setWallet(e.target.value)} disabled={sending} autoCapitalize="none" autoCorrect="off" />
          </label>
          <Button type="submit" isLoading={sending}>Отправить заявку</Button>
        </form>}
        <p className="mt-3 text-xs text-textSecondary">5% от подтверждённого заработка приглашённого начисляются после его выплаты.</p>

      </Card>

      {loading && !referral && <p role="status" className="text-xs text-textSecondary">Загружаем ваш VVD-код…</p>}
      {notice && <p role="status" className="text-xs text-success">{notice}</p>}
      {error && <p role="alert" className="text-xs text-error">{error}</p>}

      <Card padding="lg">

        <div className="text-[10px] uppercase tracking-widest text-accentGold font-bold">
          Моя ссылка
        </div>

        <div className="mt-2 text-xs text-textSecondary">
          Персональный код: <span className="font-bold text-accentGold">{referral?.referral_code || '—'}</span>
        </div>
        <div className="mt-3 text-sm text-white break-all">
          {referral?.referral_link || ""}
        </div>

        <CopyButton
          text={referral?.referral_link || ""}
          className="mt-4 w-full rounded-xl border border-accentGold text-accentGold py-3 font-bold"
        >
          Копировать ссылку
        </CopyButton>

      </Card>

      <Card padding="lg">

        <div className="flex justify-between">

          <span className="text-textSecondary">
            Приглашено
          </span>

          <span className="font-bold text-white">
            {referral?.invited || 0}
          </span>

        </div>

        <div className="mt-4 flex justify-between">

          <span className="text-textSecondary">
            Доход по рефералам
          </span>

          <span className="font-bold text-accentGold">
            ${Number(referral?.earned || 0).toFixed(2)}
          </span>

        </div>

      </Card>

      <Card padding="lg">

        <div className="text-[10px] uppercase tracking-widest text-accentGold font-bold mb-4">
          Приглашённые
        </div>

        {(referral?.people || []).map((person:any)=><div key={person.telegram_id} className="flex justify-between gap-3 py-3 border-b border-white/5">
          <div className="min-w-0"><p className="text-sm break-words">{person.first_name || person.partner_code}</p>
            <p className="text-xs text-textSecondary">{person.username ? '@'+person.username : person.partner_code}</p></div>
          <span className="text-success whitespace-nowrap">${Number(person.earned).toFixed(2)}</span>
        </div>)}
        {referral && !referral.people?.length && <p className="text-center text-textSecondary">Пока никто не зарегистрировался</p>}
        {!!referral?.people?.length && <p className="mt-3 text-xs text-textSecondary">Справа — ваш доход от каждого приглашённого.</p>}

      </Card>

      {!!referral?.withdrawals?.length && <Card padding="lg">
        <h2 className="font-bold mb-3">Реферальные выплаты</h2>
        {referral.withdrawals.map((item:any)=><div key={item.id} className="py-3 border-b border-white/5 text-sm">
          <div className="flex justify-between gap-2"><span>${Number(item.amount).toFixed(2)}</span>
            <span>{item.status==='paid'?'Выплачено':item.status==='rejected'?'Отклонено':'Ожидает выплаты'}</span></div>
          <p className="text-xs text-textSecondary break-all mt-1">{item.wallet}</p>
          <p className="text-xs text-textSecondary mt-1">{new Date(item.created_at).toLocaleString('ru-RU')}</p>
        </div>)}
      </Card>}
    </div>
  );
};
