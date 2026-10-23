import {readApiSnapshot} from '@/shared/lib/viewSnapshot';
import React, { useCallback, useEffect, useRef, useState } from 'react';
import { Link, useNavigate, useParams } from 'react-router-dom';
import { ArrowLeft, ArrowRight, Bot, Check, ChevronRight, Clock, Copy, CreditCard, FileClock, Globe2, History, Package, Phone, Plus, Server, Settings2, ShieldCheck, Wallet, Wrench } from 'lucide-react';
import { Card } from '@/shared/ui/Card';
import { Button } from '@/shared/ui/Button';
import { triggerHaptic } from '@/shared/lib/telegram';
import { marketApi, usd, modelPageUrl, type Character, type ToolWallet, type ToolTransaction, type ToolOrder, type ServiceInfo, type ToolInvoice, type TopupConfig } from './marketApi';

const emptyWallet:ToolWallet = { available:'0.00', reserved:'0.00', currency:'USD', payments_enabled:false };
const inputClass='w-full rounded-app-xs border border-white/10 bg-bgCard px-3 py-3 text-sm text-textPrimary outline-none focus:border-accentGold/60';
const toText=(e:unknown)=>e instanceof Error?e.message:'Не удалось загрузить данные';
const NavHeader:React.FC<{title:string;subtitle?:string}> = ({title,subtitle})=>{
  const nav=useNavigate();
  return <header className="flex items-center gap-3">
    <button type="button" aria-label="Назад" onClick={()=>{triggerHaptic.lightImpact();nav(-1);}} className="flex h-10 w-10 shrink-0 items-center justify-center rounded-app-xs border border-white/10 bg-white/[0.04] text-accentBrightGold"><ArrowLeft size={19}/></button>
    <div><h1 className="text-xl font-bold">{title}</h1>{subtitle&&<p className="text-xs text-textSecondary">{subtitle}</p>}</div>
  </header>;
};
const Shell:React.FC<{children:React.ReactNode}>=({children})=><main className="flex flex-col gap-4 p-4 pb-28 animate-fade-in">{children}</main>;
const Empty:React.FC<{title:string;subtitle?:string}>=({title,subtitle})=><Card className="flex flex-col items-center gap-2 py-8 text-center"><Package size={25} className="text-accentBrightGold"/><b className="text-sm">{title}</b>{subtitle&&<p className="text-xs text-textSecondary">{subtitle}</p>}</Card>;
const Status:React.FC<{children:React.ReactNode}>=({children})=><p className="rounded-app-xs border border-white/10 bg-white/[0.03] p-3 text-xs leading-5 text-textSecondary">{children}</p>;
const useRemote = <T,>(load:()=>Promise<T>, fallback:T) => {
  const path=load===readWallet?'/wallet':load===readCatalog?'/catalog':load===readTransactions?'/transactions':load===readOrders?'/orders':'/ai';
  const cached=()=>readApiSnapshot<T>('/tools-market'+path);
  const [value,setValue]=useState<T>(()=>cached()??fallback),[loading,setLoading]=useState(!cached()),[error,setError]=useState('');
  const refresh=useCallback(async()=>{setLoading(!cached());setError('');try{setValue(await load());}catch(e){setError(toText(e));}finally{setLoading(false);}},[load]);
  useEffect(()=>{void refresh();},[refresh]);
  return {value,loading,error,refresh};
};
const readWallet=()=>marketApi.wallet(),readCatalog=()=>marketApi.catalog(),readTransactions=()=>marketApi.transactions(),readOrders=()=>marketApi.orders(),readModels=()=>marketApi.models();
const iconById={ai:Bot,numbers:Phone,proxy:Globe2};
const cards=[{id:'ai',to:'/tools/ai',title:'AI-модели',description:'Создавайте собственных AI-персонажей',icon:Bot},
  {id:'numbers',to:'/tools/numbers',title:'Виртуальные номера',description:'Подключение поставщиков номеров',icon:Phone},
  {id:'proxy',to:'/tools/proxy',title:'Прокси',description:'Поставщики и тарифы прокси',icon:Server}];

export const Tools:React.FC=()=>{
  const w=useRemote(readWallet,emptyWallet);
  const c=useRemote(readCatalog,{services:[] as ServiceInfo[],payment_provider:{status:'unavailable',assets:[] as string[]}});
  return <Shell>
    <div><h1 className="text-2xl font-bold">Инструменты</h1><p className="mt-1 text-xs text-textSecondary">Все сервисы для работы в одном месте</p></div>
    <Card variant="glow" padding="lg" className="flex flex-col gap-3">
      <p className="text-xs font-semibold text-textSecondary">Баланс инструментов</p>
      <strong className="text-3xl font-bold text-white">{usd(w.value.available)}</strong>
      <p className="text-xs text-textSecondary">Для оплаты сервисов и инструментов</p>
      <div className="flex gap-2">
        <Link to="/tools/topup" className="flex flex-1 items-center justify-center gap-2 rounded-app-xs bg-gold-gradient px-3 py-3 text-sm font-bold text-bgMain"><Plus size={17}/> Пополнить</Link>
        <Link to="/tools/history" className="flex flex-1 items-center justify-center gap-2 rounded-app-xs border border-accentGold/30 px-3 py-3 text-sm font-bold text-accentBrightGold"><History size={16}/> История</Link>
      </div>
      {w.loading&&<p className="text-xs text-textSecondary">Обновляем баланс…</p>}
      {w.error&&<Status>{w.error}</Status>}
    </Card>
    <div className="flex items-center justify-between"><h2 className="text-base font-bold">Каталог сервисов</h2><Link to="/tools/purchases" className="text-xs font-semibold text-accentBrightGold">Мои покупки →</Link></div>
    <div className="grid grid-cols-2 gap-3">
      {cards.map((item,i)=>{
        const Icon=item.icon;
        const current=c.value.services.find(s=>s.id===item.id);
        return <Link key={item.id} to={item.to} className={i===0?'col-span-2':''}>
          <Card className="flex h-full min-h-[152px] flex-col justify-between gap-4">
            <div className="flex items-center justify-between"><div className="rounded-app-xs border border-accentGold/25 bg-accentGold/10 p-3 text-accentBrightGold"><Icon size={20}/></div><ChevronRight size={18} className="text-textSecondary"/></div>
            <div><h3 className="text-sm font-bold">{item.title}</h3><p className="mt-1 text-[11px] leading-4 text-textSecondary">{item.description}</p>
            {current?.status!=='available'&&<p className="mt-2 text-[11px] text-accentBrightGold">Подключение сервиса</p>}</div>
          </Card>
        </Link>;
      })}
      <Card className="col-span-2 flex items-center gap-3"><div className="rounded-app-xs bg-white/[0.05] p-3"><Settings2 size={20} className="text-textSecondary"/></div><div><b className="text-sm">Дополнительные сервисы</b><p className="text-xs text-textSecondary">Каталог будет расширяться</p></div></Card>
    </div>
  </Shell>;
};

export const ToolsTopupPage:React.FC=()=>{
  const w=useRemote(readWallet,emptyWallet);
  const [amount,setAmount]=useState('5'),[busy,setBusy]=useState(false),[error,setError]=useState('');
  const [notice,setNotice]=useState('');
  const [accepted,setAccepted]=useState(false);
  const [config,setConfig]=useState<TopupConfig|null>(null);
  const [invoices,setInvoices]=useState<ToolInvoice[]>([]);
  const sending=useRef(false), mounted=useRef(true), request=useRef({amount:'',key:''});
  const previousPaid=useRef<string|null>(null);
  const refresh=useCallback(async()=>{
    try{
      const [cfg,data]=await Promise.all([marketApi.topupConfig(),marketApi.paymentInvoices()]);
      if(!mounted.current)return;
      setConfig(cfg);setInvoices(data.invoices);setError('');
      const paid=data.invoices.filter(i=>i.status==='paid'||i.status==='refunded').map(i=>i.id+i.status).join(',');
      if(previousPaid.current!==paid){if(previousPaid.current!==null)setNotice('Статус оплаты подтверждён сервером. Баланс и история обновлены.');previousPaid.current=paid;await Promise.all([w.refresh(),marketApi.transactions()]);}
    }catch(e){if(mounted.current)setError(toText(e));}
  },[w.refresh]);
  useEffect(()=>{
    mounted.current=true;void refresh();
    const timer=window.setInterval(()=>{if(document.visibilityState==='visible')void refresh();},5000);
    const resume=()=>{if(document.visibilityState==='visible')void refresh();};
    document.addEventListener('visibilitychange',resume);
    return()=>{mounted.current=false;clearInterval(timer);document.removeEventListener('visibilitychange',resume);};
  },[refresh]);
  const amountNum=Number(amount),rate=Number(config?.stars_per_usd||0);
  const stars=Math.ceil((Math.round(amountNum*100)*rate)/100-1e-9);
  const valid=/^\d+(\.\d{1,2})?$/.test(amount)&&amountNum>=5&&amountNum<=10000&&stars>0&&stars<=100000;
  const openPayment=(invoice:ToolInvoice)=>{
    if(!invoice.payment_url||invoice.status!=='pending')return;
    const tg=window.Telegram?.WebApp;
    if(!tg?.openInvoice){setError('Откройте оплату в актуальной версии Telegram.');return;}
    tg.openInvoice(invoice.payment_url,status=>{
      if(!mounted.current)return;
      setNotice(status==='paid'||status==='pending'?'Проверяем подтверждение оплаты…':status==='cancelled'?'Оплата закрыта. Средства не начислены.':'Оплата не завершена. Проверьте статус счёта.');
      void refresh();
    });
  };
  const pay=async()=>{
    if(!valid||!accepted||sending.current||!config?.payments_enabled)return;
    sending.current=true;setBusy(true);setError('');setNotice('');
    if(request.current.amount!==amount)request.current={amount,key:crypto.randomUUID()};
    try{
      const invoice=await marketApi.topup(amount,request.current.key,stars);
      await refresh();
      if(invoice.status==='paid')setNotice('Этот счёт уже оплачен. Баланс обновлён.');
      else if(invoice.status==='expired'||invoice.status==='refunded'){
        request.current={amount:'',key:''};setNotice('Счёт закрыт. Нажмите «Пополнить» для нового счёта.');
      }else openPayment(invoice);
    }catch(e){setError(toText(e));}
    finally{sending.current=false;if(mounted.current)setBusy(false);}
  };
  const labels:Record<string,string>={draft:'Создаётся',pending:'Ожидает оплаты',paid:'Оплачено · баланс зачислен',expired:'Срок истёк',failed:'Ошибка',cancelled:'Отменён',refunded:'Возврат выполнен'};
  return <Shell><NavHeader title="Пополнение баланса" subtitle="Оплата Telegram Stars · баланс в USD"/>
    <Card className="flex flex-col gap-2"><p className="text-xs text-textSecondary">Баланс инструментов</p><strong className="text-2xl text-accentBrightGold">{usd(w.value.available)}</strong>
      {Number(w.value.refund_debt)>0&&<Status>Задолженность после возврата: {usd(w.value.refund_debt)}. Следующее пополнение сначала погасит её.</Status>}
    </Card>
    <Card className="flex flex-col gap-4">
      <label className="text-xs font-semibold text-textSecondary">Сумма пополнения в USD
        <input className={inputClass+' mt-2'} type="text" inputMode="decimal" value={amount} disabled={busy} onChange={e=>setAmount(e.target.value.replace(',','.'))} placeholder="5.00"/>
      </label>
      <div className="grid grid-cols-5 gap-1">{[5,10,25,50,100].map(n=><button disabled={busy} type="button" key={n} onClick={()=>setAmount(String(n))} className={'rounded-app-xs border px-1 py-2 text-xs '+(amount===String(n)?'border-accentGold bg-accentGold/10 text-accentBrightGold':'border-white/10 text-textSecondary')}>${n}</button>)}</div>
      <div className="flex justify-between text-sm"><span className="text-textSecondary">На баланс инструментов</span><strong>{valid?usd(amountNum):'—'}</strong></div>
      <div className="flex justify-between text-sm"><span className="text-textSecondary">К оплате</span><strong>{valid?stars+' ⭐':'—'}</strong></div>
      <p className="text-xs text-textSecondary">Внутренний баланс для покупки инструментов. Вывод и перевод другим пользователям недоступны. Стоимость в Stars показана до оплаты.</p>
      {config&&!config.payments_enabled&&<Status>Пополнение через Stars скоро будет доступно.</Status>}
      {config?.payments_enabled&&!valid&&<p role="alert" className="text-xs text-error">Сумма от $5 до $10 000, до двух знаков после запятой, не более 100 000 Stars за платёж.</p>}
      <label className="flex items-start gap-2 text-xs text-textSecondary"><input type="checkbox" checked={accepted} onChange={e=>setAccepted(e.target.checked)} className="mt-1"/>Понимаю, что пополнение предназначено только для инструментов; сумма USD и стоимость Stars указаны выше. По вопросам оплаты и возврата обращусь в поддержку.</label>
      <Link to="/support" className="text-xs text-accentBrightGold">Поддержка по оплате и возвратам →</Link>
      <Button type="button" isLoading={busy} disabled={!valid||!accepted||!config?.payments_enabled} onClick={()=>void pay()}>Пополнить через Stars</Button>
      {error&&<p role="alert" className="text-xs text-error">{error}</p>}
      {notice&&<Status>{notice}</Status>}
      <Link to="/tools/history" className="text-xs text-accentBrightGold">История операций →</Link>
    </Card>
    <Card className="flex flex-col gap-3"><h2 className="text-sm font-bold">Счета пополнения</h2>
      {!invoices.length&&<p className="text-xs text-textSecondary">Счетов пока нет</p>}
      {invoices.map(i=><div key={i.id} className="border-t border-white/10 pt-3 text-xs">
        <div className="flex justify-between gap-2"><span>{labels[i.status]||i.status}</span><strong>{usd(i.amount_usd)}</strong></div>
        <p className="mt-1 text-textSecondary">{new Date(i.created_at).toLocaleString('ru-RU')}{i.stars_amount?' · '+i.stars_amount+' ⭐':''}</p>
        {i.status==='pending'&&i.payment_url&&<Button type="button" size="sm" variant="outline" className="mt-2" onClick={()=>openPayment(i)}>Открыть оплату</Button>}
      </div>)}
    </Card>
  </Shell>;
};

const typeLabels:Record<string,string>={topup:'Пополнение',purchase:'Покупка',refund:'Возврат',adjustment:'Корректировка'};
const statusLabels:Record<string,string>={pending:'Ожидает оплаты',processing:'Обрабатывается',success:'Успешно',failed:'Ошибка',refunded:'Возврат выполнен',active:'Активно'};
export const ToolsHistory:React.FC=()=>{
  const {value,error,loading}=useRemote(readTransactions,{transactions:[] as ToolTransaction[]});
  const [filter,setFilter]=useState<'all'|'topup'|'purchase'>('all');
  const items=value.transactions.filter(t=>filter==='all'||t.kind===filter);
  return <Shell><NavHeader title="История операций"/>
    <div className="flex gap-2">{([['all','Все'],['topup','Пополнения'],['purchase','Покупки']] as const).map(([key,label])=><button key={key} type="button" onClick={()=>setFilter(key)} className={'rounded-app-xs border px-3 py-2 text-xs '+(filter===key?'border-accentGold text-accentBrightGold':'border-white/10 text-textSecondary')}>{label}</button>)}</div>
    {error&&<Status>{error}</Status>}
    {loading?<Status>Загружаем историю…</Status>:items.length===0?<Empty title="Операций пока нет" subtitle="Пополнения и покупки появятся здесь после подключения оплаты"/>:items.map(t=><Card key={t.id} className="flex items-center justify-between gap-2">
      <div><b className="text-sm">{typeLabels[t.kind]||t.kind}</b><p className="text-xs text-textSecondary">{new Date(t.created_at).toLocaleString('ru-RU')}{t.service?' · '+t.service:''}</p><p className="text-xs text-accentBrightGold">{statusLabels[t.status]||t.status}</p></div><strong className="text-sm">{usd(t.amount)}</strong>
    </Card>)}
  </Shell>;
};

export const ToolsPurchases:React.FC=()=>{
  const {value,error,loading}=useRemote(readOrders,{orders:[] as ToolOrder[]});
  const [filter,setFilter]=useState('all');
  const visible=value.orders.filter(o=>filter==='all'||filter===o.service_id);
  return <Shell><NavHeader title="Мои покупки"/>
    <div className="flex flex-wrap gap-2">{[['all','Все'],['ai','AI-модели'],['numbers','Номера'],['proxy','Прокси']].map(([key,label])=><button key={key} type="button" onClick={()=>setFilter(key)} className={'rounded-app-xs border px-3 py-2 text-xs '+(filter===key?'border-accentGold text-accentBrightGold':'border-white/10 text-textSecondary')}>{label}</button>)}</div>
    {error&&<Status>{error}</Status>}
    {loading?<Status>Загружаем заказы…</Status>:visible.length===0?<Empty title="У вас пока нет покупок" subtitle="Реальные заказы появятся после подключения поставщиков"/>:visible.map(o=><Card key={o.id} className="flex flex-col gap-2">
      <div className="flex justify-between"><strong className="text-sm">{o.title}</strong><span className="text-accentBrightGold text-sm">{usd(o.amount)}</span></div><p className="text-xs text-textSecondary">{new Date(o.created_at).toLocaleString('ru-RU')} · {statusLabels[o.status]||o.status}</p>
      <Link to={'/tools/'+(o.service_id==='ai'?'ai':o.service_id)} className="text-xs text-accentBrightGold">К сервису →</Link>
    </Card>)}
  </Shell>;
};

export const ToolsNumbers:React.FC=()=>{
  const [country,setCountry]=useState(''),[service,setService]=useState('');
  return <Shell><NavHeader title="Виртуальные номера" subtitle="Каталог поставщиков"/><Card className="flex flex-col gap-3">
    <label className="text-xs text-textSecondary">Страна<select className={inputClass+' mt-2'} value={country} onChange={e=>setCountry(e.target.value)} disabled><option value="">Нет доступных стран</option></select></label>
    <label className="text-xs text-textSecondary">Сервис<select className={inputClass+' mt-2'} value={service} onChange={e=>setService(e.target.value)} disabled><option value="">Нет доступных сервисов</option></select></label>
    <div className="flex justify-between text-sm"><span className="text-textSecondary">Наличие</span><b>Нет данных</b></div><div className="flex justify-between text-sm"><span className="text-textSecondary">Цена</span><b>—</b></div>
    <Button type="button" disabled>Купить номер</Button>
  </Card><Status>Сервис скоро будет доступен. Страны, цены, сроки, SMS и отмены появятся после подключения разрешённого поставщика.</Status>
    <Link to="/tools/numbers/my" className="flex items-center justify-between rounded-app-xs border border-white/10 bg-white/[0.03] p-4 text-sm"><span>Мои номера</span><ChevronRight size={17}/></Link>
  </Shell>;
};
export const MyNumbers:React.FC=()=> <Shell><NavHeader title="Мои номера"/><Empty title="Активных номеров нет" subtitle="Полученные SMS будут отображаться только после реальной покупки у подключённого поставщика"/></Shell>;
export const ToolsProxy:React.FC=()=> <Shell><NavHeader title="Прокси" subtitle="Каталог поставщиков"/><Card className="flex flex-col gap-3">
  {['Страна','Тип прокси','Срок аренды','Тариф'].map(label=><label key={label} className="text-xs text-textSecondary">{label}<select className={inputClass+' mt-2'} disabled><option>Нет доступных вариантов</option></select></label>)}
  <div className="flex justify-between text-sm"><span className="text-textSecondary">Стоимость</span><strong>—</strong></div><Button type="button" disabled>Купить</Button></Card>
  <Status>Подключение сервиса. Тарифы, доступность, цены и данные доступа будут загружаться с сервера поставщика.</Status>
  <Link to="/tools/proxy/my" className="flex items-center justify-between rounded-app-xs border border-white/10 bg-white/[0.03] p-4 text-sm"><span>Мои прокси</span><ChevronRight size={17}/></Link>
</Shell>;
export const MyProxies:React.FC=()=> <Shell><NavHeader title="Мои прокси"/><Empty title="Прокси пока не приобретены" subtitle="Адреса и авторизация станут доступны только владельцам реальных заказов"/></Shell>;
