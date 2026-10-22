import React, { useCallback, useEffect, useState } from 'react';
import { ArrowLeft, Send } from 'lucide-react';
import { authorizedFetch } from '@/shared/lib/api';

const API='https://vvd-cpa-v2.onrender.com/admin/support/tickets';
type Ticket={id:number;user_telegram_id:number;subject:string;status:'open'|'closed';first_name:string|null;username:string|null};
type Message={id:number;sender_role:'admin'|'user';body:string;created_at:string};
async function api(path='',init?:RequestInit){
 const response=await authorizedFetch(API+path,{...init,cache:'no-store',headers:{'Content-Type':'application/json',...init?.headers}});
 const data=await response.json();
 if(!response.ok||!data.success)throw new Error('Запрос не выполнен');
 return data;
}
export const SupportTicketsAdmin:React.FC<{onBack: () => void}> = ({onBack}) => {
 const [tickets,setTickets]=useState<Ticket[]>([]);
 const [selected,setSelected]=useState<Ticket|null>(null);
 const [messages,setMessages]=useState<Message[]>([]);
 const [reply,setReply]=useState('');
 const [error,setError]=useState('');
 const [busy,setBusy]=useState(false);
 const refresh=useCallback(async()=>{try{const d=await api();setTickets(d.tickets);setError('');}catch{setError('Не удалось загрузить обращения');}},[]);
 const open=useCallback(async(id:number)=>{try{const d=await api('/'+id);setSelected(d.ticket);setMessages(d.messages);setError('');}catch{setError('Не удалось загрузить переписку');}},[]);
 useEffect(()=>{void refresh();const timer=window.setInterval(()=>void refresh(),15000);return()=>window.clearInterval(timer)},[refresh]);
 useEffect(()=>{if(!selected)return;const timer=window.setInterval(()=>void open(selected.id),10000);return()=>window.clearInterval(timer)},[selected?.id,open]);
 const send=async()=>{if(!selected||!reply.trim()||busy)return;setBusy(true);try{await api('/'+selected.id+'/messages',{method:'POST',body:JSON.stringify({message:reply.trim()})});setReply('');await open(selected.id);await refresh()}catch{setError('Ответ не отправлен')}finally{setBusy(false)}};
 const changeStatus=async()=>{if(!selected||busy)return;setBusy(true);try{await api('/'+selected.id+'/status',{method:'PATCH',body:JSON.stringify({status:selected.status==='open'?'closed':'open'})});await open(selected.id);await refresh()}catch{setError('Статус не изменён')}finally{setBusy(false)}};
 return <div className="flex flex-col gap-4 text-white min-h-[60vh]">
 <div className="flex items-center gap-3"><button onClick={()=>selected?setSelected(null):onBack()} className="p-3 border border-white/10 rounded-full"><ArrowLeft size={18}/></button><h2 className="text-xl font-bold">Обращения поддержки</h2></div>
 {error&&<p role="alert" className="text-red-400 text-sm">{error}</p>}
 {selected?<><div className="p-4 bg-bgCard rounded-xl"><div className="font-bold">{selected.subject}</div><div className="text-xs text-textSecondary">№{selected.id} · Пользователь {selected.user_telegram_id} · {selected.status==='open'?'Открыт':'Закрыт'}</div></div>
 <div className="flex flex-col gap-3 max-h-[50vh] overflow-y-auto">{messages.map(m=><div key={m.id} className={`p-3 rounded-xl border text-sm ${m.sender_role==='admin'?'border-accentGold/30 bg-accentGold/10':'border-white/10 bg-bgCard'}`}><div className="text-accentGold text-xs mb-1">{m.sender_role==='admin'?'Администратор':'Пользователь'}</div><div className="whitespace-pre-wrap break-words">{m.body}</div></div>)}</div>
 <button disabled={busy} onClick={()=>void changeStatus()} className="p-3 border border-accentGold/40 rounded-xl text-accentGold">{selected.status==='open'?'Закрыть тикет':'Открыть тикет'}</button>
 {selected.status==='open'&&<div className="flex gap-2"><textarea value={reply} onChange={e=>setReply(e.target.value)} maxLength={4000} rows={2} placeholder="Ответ пользователю" className="flex-1 min-w-0 p-3 rounded-xl bg-bgCard border border-white/10"/><button disabled={busy||!reply.trim()} onClick={()=>void send()} className="p-3 rounded-xl bg-accentGold text-black disabled:opacity-40"><Send size={18}/></button></div>}</>:
 <div className="flex flex-col gap-3">{tickets.length===0&&<p className="text-textSecondary text-sm">Обращений пока нет</p>}{tickets.map(t=><button key={t.id} onClick={()=>void open(t.id)} className="p-4 rounded-xl bg-bgCard border border-accentGold/20 text-left"><div className="font-semibold">{t.subject}</div><div className="text-xs text-textSecondary mt-1">№{t.id} · {t.first_name||t.username||t.user_telegram_id} · {t.status==='open'?'Открыт':'Закрыт'}</div></button>)}</div>}
 </div>;
};
