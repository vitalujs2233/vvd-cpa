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
  const previousPaid=useRef<string|null>(null),issuedId=useRef<string|null>(null);
  const refresh=useCallback(async()=>{
    try{
      const [cfg,data]=await Promise.all([marketApi.topupConfig(),marketApi.paymentInvoices()]);
      if(!mounted.current)return;
      setConfig(cfg);setInvoices(data.invoices);setError('');
      if(data.invoices.some(i=>i.id===issuedId.current&&(i.status==='paid'||i.status==='refunded'||i.status==='expired'))){request.current={amount:'',key:''};issuedId.current=null;}
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
  const amountNum=Number(amount),rate=Number(config?.usd_per_star||0);
  const stars=Math.ceil(Math.round(amountNum*100)*10000/Math.round(rate*1000000));
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
      const invoice=await marketApi.topup(amount,request.current.key,stars,config.usd_per_star);
      issuedId.current=invoice.id;
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
      <div className="flex justify-between text-sm"><span className="text-textSecondary">На баланс инструментов</span><strong>{valid?usd(stars*rate):'—'}</strong></div>
      <div className="flex justify-between text-sm"><span className="text-textSecondary">К оплате</span><strong>{valid?stars+' ⭐':'—'}</strong></div>
      <p className="text-xs text-textSecondary">1 ⭐ = {usd(rate)}. Минимум $5. Количество Stars округляется вверх; вся оплаченная сумма зачисляется по курсу.</p>
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

export const ToolsNumbers:React.FC=()=> <Shell><NavHeader title="Виртуальные номера" subtitle="Каталог поставщиков"/><Empty title="Подключаем нового поставщика" subtitle="Виртуальные номера временно недоступны. Покупки отключены."/></Shell>;
export const MyNumbers:React.FC=()=> <Shell><NavHeader title="Мои номера"/><Empty title="Новые покупки недоступны" subtitle="История покупок сохранена в общем разделе «Мои покупки»."/></Shell>;
export const ToolsProxy:React.FC=()=>{
  const [catalog,setCatalog]=useState<import('./marketApi').ProxyIpv4Catalog|null>(null);
  const [kind,setKind]=useState('ipv4');
  const [country,setCountry]=useState('');
  const [days,setDays]=useState(7);
  const [quantity,setQuantity]=useState(5);
  const [operator,setOperator]=useState('');
  const [rotation,setRotation]=useState(0);
  const [quote,setQuote]=useState<import('./marketApi').ProxyIpv4Quote|null>(null);
  const [error,setError]=useState('');
  const [busy,setBusy]=useState(false);
  const [prepared,setPrepared]=useState('');
  const requestKey=useRef<{signature:string;id:string}|null>(null);
  useEffect(()=>{let active=true;setCatalog(null);setError('');setQuote(null);marketApi.proxyIpv4Catalog(kind).then(data=>{if(active){setCatalog(data);setCountry(data.data.countries[0]?.code||'');setDays(data.data.days[0]||7);setQuantity(data.minimum_count);setOperator('');setRotation(0);}}).catch(e=>{if(active)setError(toText(e));});return()=>{active=false;};},[kind]);
  const options=catalog?.data;
  const operators=options?.tariffs?.find(t=>t.country===country)?.mobileOperator||[];
  const selectedOperator=operators.find(x=>x.name===operator)||operators[0];
  const choose=(next:string)=>{setKind(next);setQuote(null);};
  const price=async()=>{setBusy(true);setError('');setQuote(null);try{setQuote(await marketApi.proxyIpv4Quote({proxy_type:kind,country,days,count:quantity,...(kind==='mobile'?{mobile_operator:selectedOperator?.name,rotation_time:selectedOperator?.rotationTime.includes(rotation)?rotation:selectedOperator?.rotationTime[0]}:{})}));}catch(e){setError(toText(e));}finally{setBusy(false);}};
  const prepare=async()=>{
    if(!quote||busy)return;
    const selection={proxy_type:kind,country,days,count:quantity,...(kind==='mobile'?{mobile_operator:selectedOperator?.name,rotation_time:selectedOperator?.rotationTime.includes(rotation)?rotation:selectedOperator?.rotationTime[0]}:{})};
    const signature=JSON.stringify(selection);
    if(requestKey.current?.signature!==signature)requestKey.current={signature,id:crypto.randomUUID()};
    setBusy(true);setError('');setPrepared('');
    try{
      const result=await marketApi.proxyIpv4Prepare({...selection,request_id:requestKey.current.id});
      setPrepared('Заявка №'+result.id.slice(0,8)+' подготовлена. Цена: 
  return <Shell><NavHeader title="Прокси" subtitle="Proxy-IPv4 · каталог и расчёт цены"/>
    <Status>IPv4, IPv6, ISP и мобильные прокси. Доступные страны и сроки загружаются через API поставщика. Покупки отключены.</Status>
    <Card className="flex flex-col gap-3">
      <h2 className="text-base font-bold">Выбор прокси</h2>
      {!catalog&&<p className="text-xs text-textSecondary">Каталог ещё не загружен.</p>}
      <label className="text-xs text-textSecondary">Тип прокси<select className={inputClass} value={kind} onChange={e=>choose(e.target.value)}><option value="ipv4">Прокси IPv4</option><option value="ipv6">Прокси IPv6</option><option value="isp">Прокси ISP</option><option value="mobile">Мобильные прокси</option></select></label>
      <label className="text-xs text-textSecondary">Страна<select className={inputClass} value={country} onChange={e=>{setCountry(e.target.value);setOperator('');setRotation(0);setQuote(null);}}>{options?.countries.map(x=><option key={x.code} value={x.code}>{x.name} ({x.code})</option>)}</select></label>
      <label className="text-xs text-textSecondary">Срок аренды<select className={inputClass} value={days} onChange={e=>{setDays(Number(e.target.value));setQuote(null);}}>{options?.days.map(x=><option key={x} value={x}>{x} дней</option>)}</select></label>
      <label className="text-xs text-textSecondary">Количество IP (минимум {minimum})<input className={inputClass} type="number" min={minimum} max={1000} step={1} value={quantity} onChange={e=>{setQuantity(Number(e.target.value));setQuote(null);}}/></label>
      {kind==='mobile'&&options?.mobile_tariff_error&&<p className="text-xs text-amber-400">{options.mobile_tariff_error}. Страны и сроки доступны, но выбор оператора и расчёт цены пока заблокированы.</p>}
      {kind==='mobile'&&<><label className="text-xs text-textSecondary">Оператор<select className={inputClass} value={selectedOperator?.name||''} onChange={e=>{setOperator(e.target.value);setRotation(0);setQuote(null);}}>{operators.map(x=><option key={x.name} value={x.name}>{x.name}</option>)}</select></label><label className="text-xs text-textSecondary">Ротация IP<select className={inputClass} value={selectedOperator?.rotationTime.includes(rotation)?rotation:selectedOperator?.rotationTime[0]||0} onChange={e=>{setRotation(Number(e.target.value));setQuote(null);}}>{selectedOperator?.rotationTime.map(x=><option key={x} value={x}>{x===0?'По ссылке':x+' минут'}</option>)}</select></label></>}
      <Button type="button" disabled={!catalog||busy||!country||!options?.days.length||!Number.isInteger(quantity)||quantity<minimum||quantity>1000||(kind==='mobile'&&!selectedOperator)} onClick={price}>{busy?'Проверяем цену…':'Узнать цену (без покупки)'}</Button>
      {quote&&<Status>Цена: ${quote.customer_total_usd}. Заказ не создан, деньги не списаны.</Status>}
      {quote&&<Button type="button" disabled={busy} onClick={prepare}>{busy?'Подготавливаем…':'Подготовить заявку (без списания)'}</Button>}
      {prepared&&<Status>{prepared}</Status>}
      {error&&<p className="text-xs text-red-400">{error}</p>}
      <Link to="/tools/proxy/my" className="text-xs text-accentBrightGold">Мои прокси →</Link>
    </Card>
  </Shell>;
};
export const MyProxies:React.FC=()=>{
  const [orders,setOrders]=useState<Awaited<ReturnType<typeof marketApi.proxyIpv4Orders>>['orders']>([]);
  const [error,setError]=useState('');
  useEffect(()=>{let active=true;marketApi.proxyIpv4Orders().then(x=>{if(active)setOrders(x.orders);}).catch(e=>{if(active)setError(toText(e));});return()=>{active=false;};},[]);
  return <Shell><NavHeader title="Мои прокси" subtitle="Подготовленные заявки · без списаний"/>
    {error&&<Status>{error}</Status>}
    {orders.length===0&&<Empty title="Покупок пока нет" subtitle="Подготовленные заявки появятся здесь. Реальная выдача прокси пока отключена."/>}
    {orders.map(o=><Card key={o.id} className="flex flex-col gap-2"><b className="text-sm">{o.proxy_type.toUpperCase()} · {o.selection.country}</b><p className="text-xs text-textSecondary">{o.selection.count} IP · {o.selection.days} дней · {usd(o.amount_usd)}</p><Status>Статус: {o.status==='prepared'?'Заявка подготовлена, не оплачена':o.status}</Status></Card>)}
  </Shell>;
};
+result.customer_total_usd+'. '+(result.wallet_sufficient===false?'На балансе инструментов недостаточно средств. ':'')+'Покупка отключена, деньги не списаны.');
    }catch(e){setError(toText(e));}finally{setBusy(false);}
  };
  const minimum=catalog?.minimum_count||(kind==='ipv6'?10:1);
  return <Shell><NavHeader title="Прокси" subtitle="Proxy-IPv4 · каталог и расчёт цены"/>
    <Status>IPv4, IPv6, ISP и мобильные прокси. Доступные страны и сроки загружаются через API поставщика. Покупки отключены.</Status>
    <Card className="flex flex-col gap-3">
      <h2 className="text-base font-bold">Выбор прокси</h2>
      {!catalog&&<p className="text-xs text-textSecondary">Каталог ещё не загружен.</p>}
      <label className="text-xs text-textSecondary">Тип прокси<select className={inputClass} value={kind} onChange={e=>choose(e.target.value)}><option value="ipv4">Прокси IPv4</option><option value="ipv6">Прокси IPv6</option><option value="isp">Прокси ISP</option><option value="mobile">Мобильные прокси</option></select></label>
      <label className="text-xs text-textSecondary">Страна<select className={inputClass} value={country} onChange={e=>{setCountry(e.target.value);setOperator('');setRotation(0);setQuote(null);}}>{options?.countries.map(x=><option key={x.code} value={x.code}>{x.name} ({x.code})</option>)}</select></label>
      <label className="text-xs text-textSecondary">Срок аренды<select className={inputClass} value={days} onChange={e=>{setDays(Number(e.target.value));setQuote(null);}}>{options?.days.map(x=><option key={x} value={x}>{x} дней</option>)}</select></label>
      <label className="text-xs text-textSecondary">Количество IP (минимум {minimum})<input className={inputClass} type="number" min={minimum} max={1000} step={1} value={quantity} onChange={e=>{setQuantity(Number(e.target.value));setQuote(null);}}/></label>
      {kind==='mobile'&&options?.mobile_tariff_error&&<p className="text-xs text-amber-400">{options.mobile_tariff_error}. Страны и сроки доступны, но выбор оператора и расчёт цены пока заблокированы.</p>}
      {kind==='mobile'&&<><label className="text-xs text-textSecondary">Оператор<select className={inputClass} value={selectedOperator?.name||''} onChange={e=>{setOperator(e.target.value);setRotation(0);setQuote(null);}}>{operators.map(x=><option key={x.name} value={x.name}>{x.name}</option>)}</select></label><label className="text-xs text-textSecondary">Ротация IP<select className={inputClass} value={selectedOperator?.rotationTime.includes(rotation)?rotation:selectedOperator?.rotationTime[0]||0} onChange={e=>{setRotation(Number(e.target.value));setQuote(null);}}>{selectedOperator?.rotationTime.map(x=><option key={x} value={x}>{x===0?'По ссылке':x+' минут'}</option>)}</select></label></>}
      <Button type="button" disabled={!catalog||busy||!country||!options?.days.length||!Number.isInteger(quantity)||quantity<minimum||quantity>1000||(kind==='mobile'&&!selectedOperator)} onClick={price}>{busy?'Проверяем цену…':'Узнать цену (без покупки)'}</Button>
      {quote&&<Status>Цена: ${quote.customer_total_usd}. Заказ не создан, деньги не списаны.</Status>}
      {error&&<p className="text-xs text-red-400">{error}</p>}
      <Link to="/tools/proxy/my" className="text-xs text-accentBrightGold">Мои прокси →</Link>
    </Card>
  </Shell>;
};
export const MyProxies:React.FC=()=> <Shell><NavHeader title="Мои прокси"/><Empty title="Новые покупки недоступны" subtitle="История покупок сохранена в общем разделе «Мои покупки»."/></Shell>;
