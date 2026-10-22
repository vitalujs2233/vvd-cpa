import React, { useCallback, useEffect, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { ArrowLeft, PlusCircle, Send } from 'lucide-react';
import { authorizedFetch } from '@/shared/lib/api';

const API = 'https://vvd-cpa-v2.onrender.com';
type Ticket = { id: number; subject: string; status: 'open' | 'closed'; updated_at: string };
type Message = { id: number; sender_role: 'user' | 'admin'; body: string; created_at: string };

async function request(path: string, init?: RequestInit) {
  const response = await authorizedFetch(API + path, {
    ...init, cache: 'no-store',
    headers: { 'Content-Type': 'application/json', ...init?.headers },
  });
  const data = await response.json();
  if (!response.ok || !data.success) throw new Error('Не удалось выполнить запрос. Попробуйте ещё раз.');
  return data;
}

export const Chat: React.FC = () => {
  const navigate = useNavigate();
  const [tickets, setTickets] = useState<Ticket[]>([]);
  const [selected, setSelected] = useState<Ticket | null>(null);
  const [messages, setMessages] = useState<Message[]>([]);
  const [tab, setTab] = useState<'support' | 'tickets'>('support');
  const [creating, setCreating] = useState(false);
  const [subject, setSubject] = useState('');
  const [body, setBody] = useState('');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');

  const refreshTickets = useCallback(async () => {
    try { const data = await request('/support/tickets'); setTickets(data.tickets); setError(''); }
    catch { setError('Не удалось загрузить тикеты. Проверьте соединение.'); }
  }, []);
  const refreshMessages = useCallback(async (id: number) => {
    try {
      const data = await request('/support/tickets/' + id);
      setSelected(data.ticket);
      setMessages(data.messages);
      setError('');
    } catch { setError('Не удалось загрузить переписку.'); }
  }, []);
  useEffect(() => { void refreshTickets(); }, [refreshTickets]);
  useEffect(() => {
    if (!selected) return;
    const interval = window.setInterval(() => void refreshMessages(selected.id), 10000);
    return () => window.clearInterval(interval);
  }, [selected?.id, refreshMessages]);

  const send = async () => {
    if (busy || !body.trim()) return;
    setBusy(true); setError('');
    try {
      if (creating) {
        if (!subject.trim()) { setError('Укажите тему обращения.'); return; }
        const data = await request('/support/tickets', { method: 'POST', body: JSON.stringify({ subject: subject.trim(), message: body.trim() }) });
        setCreating(false); setSubject(''); setBody('');
        await refreshTickets(); await refreshMessages(data.ticket_id);
      } else if (selected) {
        await request('/support/tickets/' + selected.id + '/messages', { method: 'POST', body: JSON.stringify({ message: body.trim() }) });
        setBody(''); await refreshMessages(selected.id);
      }
    } catch { setError('Сообщение не отправлено. Повторите попытку.'); }
    finally { setBusy(false); }
  };

  return <div className="flex flex-col h-full min-h-0 bg-bgMain text-white">
    <div className="flex items-center gap-3 p-4 border-b border-white/10">
      <button aria-label="Назад" onClick={() => { if (selected || creating) { setSelected(null); setCreating(false); setBody(''); } else navigate('/profile'); }} className="rounded-full border border-white/10 p-3"><ArrowLeft size={18}/></button>
      <div><div className="text-xs text-accentGold font-bold uppercase">Приватная поддержка</div><h1 className="text-xl font-bold">{selected ? selected.subject : creating ? 'Новый тикет' : 'Чат саппортов'}</h1></div>
    </div>
    {error && <div role="alert" className="mx-4 mt-3 text-sm text-red-400">{error}</div>}
    {selected ? <>
      <div className="p-3 text-xs text-textSecondary">Тикет №{selected.id} · {selected.status === 'open' ? 'Открыт' : 'Закрыт'}</div>
      <div className="flex-1 overflow-y-auto p-4 space-y-3">
        {messages.map(m => <div key={m.id} className={`max-w-[85%] rounded-xl border p-3 text-sm ${m.sender_role === 'user' ? 'ml-auto border-accentGold/30 bg-accentGold/10' : 'mr-auto border-white/10 bg-bgCard'}`}>
          <div className="text-[10px] text-accentGold mb-1">{m.sender_role === 'admin' ? 'Поддержка VVD CPA' : 'Вы'}</div>
          <p className="whitespace-pre-wrap break-words">{m.body}</p>
        </div>)}
      </div>
    </> : creating ? <div className="flex-1 p-4"><label className="text-sm text-textSecondary">Тема обращения</label><input maxLength={160} value={subject} onChange={e=>setSubject(e.target.value)} className="w-full mt-2 p-3 rounded-xl bg-bgCard border border-white/10" placeholder="Например: вопрос по офферу"/></div> : <>
      <div className="flex gap-2 p-4">
        <button onClick={()=>setTab('support')} className={`flex-1 p-3 rounded-xl ${tab==='support'?'bg-accentGold text-black':'bg-bgCard'}`}>Поддержка</button>
        <button onClick={()=>setTab('tickets')} className={`flex-1 p-3 rounded-xl ${tab==='tickets'?'bg-accentGold text-black':'bg-bgCard'}`}>Мои тикеты</button>
      </div>
      <div className="flex-1 overflow-y-auto p-4 space-y-3">
        {tab==='support' && <p className="text-sm text-textSecondary">Официальная поддержка VVD CPA. Напишите обращение — ответ администратора появится в вашем тикете.</p>}
        {tickets.map(t=><button key={t.id} onClick={()=>void refreshMessages(t.id)} className="block w-full text-left p-4 rounded-xl border border-accentGold/20 bg-bgCard"><div className="font-semibold">{t.subject}</div><div className="text-xs text-textSecondary mt-1">№{t.id} · {t.status==='open'?'Открыт':'Закрыт'}</div></button>)}
        {tickets.length===0 && tab==='tickets' && <p className="text-textSecondary text-sm">У вас пока нет обращений.</p>}
      </div>
      <button onClick={()=>{setCreating(true);setSelected(null);setBody('');setError('');}} className="m-4 p-4 rounded-xl bg-accentGold text-black font-bold flex justify-center items-center gap-2"><PlusCircle size={18}/> Создать тикет</button>
    </>}
    {(selected?.status === 'open' || creating) && <div className="flex gap-2 p-3 border-t border-white/10">
      <textarea value={body} maxLength={4000} rows={2} onChange={e=>setBody(e.target.value)} placeholder="Напишите сообщение..." className="flex-1 min-w-0 rounded-xl bg-bgCard border border-white/10 p-3 text-sm"/>
      <button disabled={busy || !body.trim()} aria-label="Отправить" onClick={()=>void send()} className="rounded-full bg-accentGold text-black p-4 disabled:opacity-40"><Send size={18}/></button>
    </div>}
  </div>;
};
