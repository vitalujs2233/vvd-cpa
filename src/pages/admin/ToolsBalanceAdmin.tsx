import React,{useEffect,useRef,useState} from 'react';
import {ArrowLeft} from 'lucide-react';
import {Card} from '@/shared/ui/Card';
import {Button} from '@/shared/ui/Button';
import {marketApi,usd,TopupConfig,ToolAdminUser,ToolAdminCredit} from '../tools/marketApi';
const input='w-full rounded-app-xs border border-white/10 bg-black/30 p-3 text-sm';
const message=(e:unknown)=>e instanceof Error?e.message:'Не удалось выполнить действие';
export const ToolsBalanceAdmin:React.FC<{onBack:()=>void}>=({onBack})=>{
 const [cfg,setCfg]=useState<TopupConfig|null>(null),[rate,setRate]=useState(''),[enabled,setEnabled]=useState(false);
 const [q,setQ]=useState(''),[users,setUsers]=useState<ToolAdminUser[]>([]),[selected,setSelected]=useState<ToolAdminUser|null>(null);
 const [amount,setAmount]=useState(''),[reason,setReason]=useState(''),[review,setReview]=useState(false);
 const [credits,setCredits]=useState<ToolAdminCredit[]>([]),[error,setError]=useState(''),[notice,setNotice]=useState(''),[busy,setBusy]=useState(false);
 const lock=useRef(false),request=useRef({signature:'',id:''});
 const load=async()=>{const [s,c,u]=await Promise.all([marketApi.adminSettings(),marketApi.adminCredits(),marketApi.adminUsers(q)]);setCfg(s);setRate(s.usd_per_star);setEnabled(s.enabled);setCredits(c.credits);setUsers(u.users);};
 useEffect(()=>{void load().catch(e=>setError(message(e)));},[]);
 const run=async(fn:()=>Promise<void>)=>{if(lock.current)return;lock.current=true;setBusy(true);setError('');setNotice('');try{await fn();}catch(e){setError(message(e));}finally{lock.current=false;setBusy(false);}};
 const save=()=>run(async()=>{if(!cfg)return;const s=await marketApi.saveSettings({usd_per_star:rate,enabled,version:cfg.version});setCfg(s);setNotice('Курс сохранён. Ранее созданные счета не изменены.');});
 const submit=()=>run(async()=>{
  if(!selected)return;
  const signature=JSON.stringify([selected.telegram_id,amount,reason.trim()]);
  if(request.current.signature!==signature)request.current={signature,id:crypto.randomUUID()};
  const result=await marketApi.manualCredit({telegram_id:selected.telegram_id,amount,reason:reason.trim(),request_id:request.current.id});
  // Keep the same key even after a lost response; reset only when starting another operation.
  setNotice((result.replayed?'Начисление уже выполнено: ':'Начислено: ')+usd(result.amount)+' · ID '+selected.telegram_id);
  setReview(false);setAmount('');setReason('');setSelected(null);
  const [c,u]=await Promise.all([marketApi.adminCredits(),marketApi.adminUsers(q)]);setCredits(c.credits);setUsers(u.users);
 });
 const valid=/^\d+(\.\d{1,2})?$/.test(amount)&&Number(amount)>0&&Number(amount)<=10000&&reason.trim().length>=5;
 return <div className="flex flex-col gap-4 p-4 pb-28">
  <header className="flex items-center gap-3"><Button variant="outline" size="sm" onClick={onBack} aria-label="Назад"><ArrowLeft size={18}/></Button><h1 className="text-xl font-bold">Инструменты · Баланс</h1></header>
  {error&&<p role="alert" className="text-sm text-error">{error}</p>}{notice&&<p role="status" className="text-sm text-accentBrightGold">{notice}</p>}
  {!cfg?<Button variant="outline" onClick={()=>void run(load)} disabled={busy}>Загрузить настройки</Button>:<Card className="flex flex-col gap-3">
   <h2 className="font-bold">Курс Telegram Stars</h2><label className="text-sm">USD за 1 Star<input className={input+' mt-2'} inputMode="decimal" value={rate} disabled={busy} onChange={e=>setRate(e.target.value.replace(',','.'))}/></label>
   <p className="text-xs text-textSecondary">100 Stars = {usd(Number(rate)*100)}. Минимальное пополнение — $5. До 6 знаков после запятой.</p>
   <label className="flex gap-2 text-sm"><input type="checkbox" checked={enabled} disabled={busy} onChange={e=>setEnabled(e.target.checked)}/>Разрешить пополнения Stars</label>
   {!cfg.server_ready&&<p className="text-xs text-textSecondary">Приём платежей заблокирован на сервере до контрольной оплаты в тестовой среде Telegram. Сохранение курса не снимает блокировку.</p>}
   <Button isLoading={busy} onClick={()=>void save()}>Сохранить курс</Button>
  </Card>}
  <Card className="flex flex-col gap-3"><h2 className="font-bold">Начислить на баланс инструментов</h2>
   <div className="flex gap-2"><input aria-label="Поиск пользователя" className={input} placeholder="VVD1, Telegram ID или username" value={q} disabled={busy||review} onChange={e=>setQ(e.target.value)}/><Button disabled={busy||review} variant="outline" onClick={()=>void run(async()=>{setUsers((await marketApi.adminUsers(q)).users);setSelected(null);})}>Найти</Button></div>
   {!review&&users.map(u=><button type="button" disabled={busy} key={u.telegram_id} onClick={()=>setSelected(u)} className={'rounded-app-xs border p-3 text-left text-sm '+(selected?.telegram_id===u.telegram_id?'border-accentGold bg-accentGold/10':'border-white/10')}>
    <b>{u.partner_code||u.first_name||u.telegram_id}</b> {u.username?'@'+u.username:''}<p className="text-xs text-textSecondary">ID {u.telegram_id} · {usd(u.available)}{Number(u.refund_debt)>0?' · долг '+usd(u.refund_debt):''}</p>
   </button>)}
   {!users.length&&<p className="text-sm text-textSecondary">Пользователи не найдены.</p>}
   {selected&&<><p className="text-sm">Получатель: <b>{selected.partner_code||selected.first_name}</b> · ID {selected.telegram_id}</p>
    <label className="text-sm">Сумма USD<input className={input+' mt-2'} inputMode="decimal" value={amount} disabled={busy||review} onChange={e=>setAmount(e.target.value.replace(',','.'))}/></label>
    <label className="text-sm">Причина начисления<textarea className={input+' mt-2'} value={reason} maxLength={500} disabled={busy||review} onChange={e=>setReason(e.target.value)}/></label>
    <p className="text-xs text-textSecondary">Начисление записывается в историю. При наличии задолженности сначала погашается она.</p>
    {review?<><p className="text-sm">Подтвердите начисление {usd(amount)} пользователю {selected.partner_code||selected.telegram_id}.</p><Button isLoading={busy} onClick={()=>void submit()}>Подтвердить начисление</Button><Button variant="outline" disabled={busy} onClick={()=>setReview(false)}>Назад к редактированию</Button></>:<Button disabled={!valid||busy} onClick={()=>setReview(true)}>Проверить начисление</Button>}
   </>}
  </Card>
  <Card className="flex flex-col gap-3"><h2 className="font-bold">Ручные начисления</h2>{!credits.length&&<p className="text-sm text-textSecondary">Начислений пока нет.</p>}{credits.map(c=><div key={c.id} className="border-t border-white/10 pt-3 text-xs"><b>{usd(c.amount)} · ID {c.telegram_id}</b><p>{c.reason}</p><p className="text-textSecondary">{new Date(c.created_at).toLocaleString('ru-RU')} · Администратор {c.admin_actor_id}</p></div>)}</Card>
 </div>;
};
