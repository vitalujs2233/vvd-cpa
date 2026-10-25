import { ApiError } from '@/shared/lib/api';
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

export const ToolsNumbers:React.FC=()=>{
  const nav=useNavigate();
  const [canBuy,setCanBuy]=useState(false),[buying,setBuying]=useState(false),[pending,setPending]=useState(false);
  const purchaseRef=useRef<{request_id:string;country:string;service:string;confirmed_price:string}|null>(null);
  const busyRef=useRef(false);
  useEffect(()=>{let live=true;marketApi.noirCheckoutConfig().then(c=>{if(live)setCanBuy(c.purchases_enabled);}).catch(()=>{});return()=>{live=false;};},[]);
  const buy=async()=>{
    if(busyRef.current||(!purchaseRef.current&&(!price?.price||!price.available||stale||!canBuy)))return;
    busyRef.current=true;setBuying(true);setError('');
    if(!purchaseRef.current)purchaseRef.current={request_id:crypto.randomUUID(),country,service,confirmed_price:price!.price!};
    try {
      const order=await marketApi.noirPurchase(purchaseRef.current);
      purchaseRef.current=null;setPending(false);
      if(order.state==='released'){setError(order.message||'Покупка не состоялась. Средства возвращены.');setRevision(v=>v+1);}
      else nav('/tools/numbers/my');
    } catch(e){
      if(e instanceof ApiError&&e.status>=400&&e.status<500){purchaseRef.current=null;setPending(false);setRevision(v=>v+1);setError(e.message);}
      else {setPending(true);setError('Не удалось получить результат. Нажмите «Проверить покупку» — повторного списания не будет.');}
    } finally {busyRef.current=false;setBuying(false);}
  };
  const [country,setCountry]=useState(''),[service,setService]=useState(''),[error,setError]=useState('');
  const [countries,setCountries]=useState<{code:string}[]>([]);
  const [services,setServices]=useState<import('./marketApi').NoirService[]>([]);
  const [price,setPrice]=useState<import('./marketApi').NoirQuote|null>(null);
  const [loading,setLoading]=useState(true),[servicesLoading,setServicesLoading]=useState(false),[priceLoading,setPriceLoading]=useState(false);
  const [revision,setRevision]=useState(0),[stale,setStale]=useState(false);
  useEffect(()=>{let active=true;setLoading(true);setError('');marketApi.noirCountries().then(d=>{if(active)setCountries(d.countries);}).catch(e=>{if(active)setError(e.message);}).finally(()=>{if(active)setLoading(false);});return()=>{active=false;};},[revision]);
  useEffect(()=>{let active=true;setServices([]);setPrice(null);setStale(false);setServicesLoading(false);
    if(country){setServicesLoading(true);marketApi.noirServices(country).then(d=>{if(active)setServices(d.services);}).catch(e=>{if(active)setError(e.message);}).finally(()=>{if(active)setServicesLoading(false);});}
    return()=>{active=false;};},[country,revision]);
  useEffect(()=>{let active=true;setPrice(null);setStale(false);setPriceLoading(false);
    if(country&&service){setPriceLoading(true);marketApi.noirPrice(country,service).then(d=>{if(active)setPrice(d);}).catch(e=>{if(active)setError(e.message);}).finally(()=>{if(active)setPriceLoading(false);});}
    return()=>{active=false;};},[country,service,revision]);
  useEffect(()=>{if(!price)return;const id=setTimeout(()=>setStale(true),Math.max(0,price.expires_at*1000-Date.now()));return()=>clearTimeout(id);},[price]);
  const countryName=(code:string)=>{try{return new Intl.DisplayNames(['ru'],{type:'region'}).of(code.toUpperCase())||code.toUpperCase();}catch{return code.toUpperCase();}};
  return <Shell><NavHeader title="Виртуальные номера" subtitle="Приём SMS · Noir SMS"/>
    <Card className="flex flex-col gap-3">
      <div className="flex items-center gap-2"><Phone size={20} className="text-accentBrightGold"/><h2 className="text-base font-bold">Выбор номера</h2></div>
      <Status>{loading?'Загружаем страны…':canBuy?'Оплата с баланса инструментов. Используйте номер только для своих разрешённых аккаунтов.':'Покупки временно отключены.'}</Status>
      <label className="text-xs text-textSecondary">Страна<select aria-label="Страна" className={inputClass} value={country} disabled={!countries.length||buying||pending} onChange={e=>{setCountry(e.target.value);setService('');setError('');}}><option value="">{loading?'Загрузка…':countries.length?'Выберите страну':'Нет доступных стран'}</option>{countries.map(c=><option key={c.code} value={c.code}>{countryName(c.code)}</option>)}</select></label>
      <label className="text-xs text-textSecondary">Сервис для SMS<select aria-label="Сервис для SMS" className={inputClass} value={service} disabled={!services.length||servicesLoading||buying||pending} onChange={e=>{setService(e.target.value);setError('');}}><option value="">{servicesLoading?'Загружаем сервисы…':services.length?'Выберите сервис':country?'Нет доступных сервисов':'Сначала выберите страну'}</option>{services.map(s=><option key={s.code} value={s.code}>{s.name}</option>)}</select></label>
      <div className="flex items-center justify-between text-sm"><span className="text-textSecondary">Стоимость номера</span><strong>{priceLoading?'Проверяем…':price?.price&&!stale?usd(price.price):'—'}</strong></div>
      {price&&!stale&&<Status>{price.message||(price.available?`В наличии: ${price.stock} шт.`:'Нет в наличии')}</Status>}
      {stale&&<Status>Цена устарела. Обновите данные перед проверкой.</Status>}
      <Button type="button" disabled={buying||(!pending&&(!canBuy||!price?.available||stale||priceLoading))} onClick={()=>void buy()}>{buying?'Проверяем покупку…':pending?'Проверить покупку':'Купить номер'}</Button>
      {error&&<p role="alert" className="text-xs text-error">{error}</p>}
      <Button type="button" variant="secondary" disabled={loading||servicesLoading||priceLoading||buying||pending} onClick={()=>setRevision(v=>v+1)}>Обновить каталог и цену</Button>
      <Link to="/tools/numbers/my" className="text-xs text-accentBrightGold">Мои номера →</Link>
    </Card>
    <Card className="flex flex-col gap-2"><b className="text-sm">Как это работает</b><p className="text-xs leading-5 text-textSecondary">Выберите страну и сервис, проверьте цену, оплатите с баланса инструментов VVD CPA и получите номер. Код SMS и статус заказа будут доступны в разделе «Мои номера».</p></Card>
  </Shell>;
};
export const MyNumbers:React.FC=()=>{
  type NumberOrder=import('./marketApi').NoirOrder;
  const [orders,setOrders]=useState<NumberOrder[]>([]),[loading,setLoading]=useState(true),[refreshing,setRefreshing]=useState(false);
  const [error,setError]=useState(''),[notice,setNotice]=useState(''),[copied,setCopied]=useState(''),[autoPaused,setAutoPaused]=useState(false);
  const [revealed,setRevealed]=useState<Record<string,string>>({}),[names,setNames]=useState<Record<string,string>>({});
  const refreshRef=useRef<()=>void>(()=>{}),copyTimer=useRef<ReturnType<typeof setTimeout>>(),copyVersion=useRef(0);
  const alive=useRef(true),resolvedCountries=useRef(new Set<string>());
  useEffect(()=>{alive.current=true;return()=>{alive.current=false;copyVersion.current++;clearTimeout(copyTimer.current);};},[]);
  // One scheduler owns list + status requests. Manual refresh queues behind an in-flight
  // request and invalidates its result, so a late response cannot replace newer data.
  useEffect(()=>{
    let active=true,busy=false,listNeeded=true,version=0,failures=0,cursor=0;
    let current:NumberOrder[]=[],started=Date.now(),timer:ReturnType<typeof setTimeout>;
    const attempts=new Map<string,number>();
    const waiting=(o:NumberOrder)=>!['refunded','released'].includes(o.state)&&!['received','expired','canceled'].includes(o.status||'')&&(o.status==='waiting'||['reserved','submitting','unknown'].includes(o.state));
    const limited=(o:NumberOrder)=>o.state==='unknown'||(!!o.expires_at&&Date.parse(o.expires_at)<=Date.now());
    const run=async()=>{
      if(!active||busy)return;
      if(Date.now()-started>=30*60*1000){setAutoPaused(true);setError('Автообновление приостановлено. Нажмите «Обновить заказы», чтобы продолжить проверку.');return;}
      const candidates=current.filter(o=>waiting(o)&&(!limited(o)||(attempts.get(o.id)||0)<6));
      if(!listNeeded&&!candidates.length){if(current.some(waiting)){setAutoPaused(true);setError('Результат ещё уточняется. Нажмите «Обновить заказы» для новой проверки.');}return;}
      const stamp=version,isList=listNeeded;listNeeded=false;busy=true;
      const order=isList?undefined:candidates[cursor++%candidates.length];
      if(order&&limited(order))attempts.set(order.id,(attempts.get(order.id)||0)+1);
      let failed=false;
      try{
        if(isList){const result=await marketApi.noirOrders();if(active&&stamp===version)current=result.orders;}
        else if(order){const updated=await marketApi.noirOrder(order.id);if(active&&stamp===version)current=current.map(o=>o.id===updated.id?updated:o);}
        if(active&&stamp===version){setOrders([...current]);setError('');failures=0;}
      }catch{
        failed=true;
        if(active&&stamp===version){failures++;if(failures>=5)setAutoPaused(true);if(isList)listNeeded=true;setError(failures>=5?'Сервер временно недоступен. Автообновление приостановлено — нажмите «Обновить заказы».':'Не удалось обновить данные. Повторим автоматически; последние данные сохранены.');}
      }finally{
        busy=false;
        if(active){setLoading(false);setRefreshing(false);
          if(stamp!==version)timer=setTimeout(()=>void run(),0);
          else if(failures<5){
            const pending=current.filter(waiting);
            if(listNeeded||pending.length){const delay=failed?Math.min(60000,5000*2**(failures-1)):pending.length&&pending.every(limited)?30000:5000;timer=setTimeout(()=>void run(),delay);}
          }
        }
      }
    };
    refreshRef.current=()=>{version++;listNeeded=true;failures=0;started=Date.now();attempts.clear();setAutoPaused(false);setError('');setRefreshing(true);clearTimeout(timer);void run();};
    void run();
    return()=>{active=false;clearTimeout(timer);refreshRef.current=()=>{};};
  },[]);
  const countryKeys=[...new Set(orders.map(o=>o.country))].sort().join(',');
  useEffect(()=>{
    let active=true;
    void (async()=>{for(const country of countryKeys.split(',').filter(Boolean).slice(0,10)){
      if(resolvedCountries.current.has(country))continue;
      try{const data=await marketApi.noirServices(country);if(!active)return;resolvedCountries.current.add(country);setNames(n=>({...n,...Object.fromEntries(data.services.map(s=>[country+':'+s.code,s.name]))}));}
      catch{if(!active)return;resolvedCountries.current.add(country);break;/* Historical services can disappear from the live catalogue. Keep the honest service code. */}
    }})();
    return()=>{active=false;};
  },[countryKeys]);
  const copy=async(key:string,value:string,kind:'number'|'code')=>{
    const version=++copyVersion.current;
    try{await navigator.clipboard.writeText(value);if(!alive.current||version!==copyVersion.current)return;
      setCopied(key);setNotice(kind==='number'?'Номер скопирован':'Код скопирован');clearTimeout(copyTimer.current);
      copyTimer.current=setTimeout(()=>{setCopied('');setNotice('');},2000);
    }catch{if(alive.current&&version===copyVersion.current)setNotice('Не удалось скопировать. Попробуйте ещё раз.');}
  };
  const countryName=(code:string)=>{try{return new Intl.DisplayNames(['ru'],{type:'region'}).of(code.toUpperCase())||code.toUpperCase();}catch{return code.toUpperCase();}};
  const labels:Record<string,string>={waiting:'Ожидаем сообщение',received:'Сообщение получено',expired:'Срок действия истёк',canceled:'Заказ отменён',refunded:'Средства возвращены',unknown:'Результат уточняется'};
  const label=(o:NumberOrder)=>o.state==='refunded'?labels.refunded:o.state==='released'?'Покупка не состоялась':o.state==='unknown'?labels.unknown:labels[o.status||'']||'Заказ обрабатывается';
  const iconButton='flex h-11 w-11 shrink-0 items-center justify-center rounded-xl text-accentBrightGold transition duration-150 hover:bg-white/5 active:scale-95 active:bg-accentGold/10 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-accentGold';
  return <Shell><NavHeader title="Мои номера" subtitle="Номера и полученные SMS"/>
    <p role="status" aria-live="polite" className="text-xs text-accentBrightGold empty:hidden">{notice}</p>
    {loading&&<Status>Загружаем заказы…</Status>}{error&&<p role="alert" className="text-xs leading-5 text-textSecondary">{error}</p>}
    {!loading&&!error&&!orders.length&&<Empty title="Номеров пока нет" subtitle="После покупки номер и сообщения появятся здесь."/>}
    {orders.map(o=><Card key={o.id} className="min-w-0 flex flex-col gap-4">
      <div className="flex min-w-0 items-start justify-between gap-3"><div className="min-w-0"><h2 className="break-words text-sm font-bold">{countryName(o.country)} · {names[o.country+':'+o.service]||o.service}</h2><p className="mt-1 text-[11px] text-textSecondary">{new Date(o.created_at).toLocaleString()}</p></div><b className="shrink-0 text-sm text-accentBrightGold">{usd(o.amount)}</b></div>
      <p className="text-xs text-textSecondary">Статус: {label(o)}</p>
      {o.phone&&<div><p className="mb-2 text-xs text-textSecondary">Номер телефона</p><div className="flex min-w-0 items-center gap-2 rounded-app-xs border border-accentGold/20 bg-black/20 p-2 pl-3"><span className="min-w-0 flex-1 break-all select-text text-lg font-semibold tracking-wide">{o.phone.startsWith('+')?o.phone:'+'+o.phone}</span><button type="button" aria-label="Скопировать номер" className={iconButton} onClick={()=>void copy(o.id,o.phone!,'number')}>{copied===o.id?<Check size={18} aria-hidden="true"/>:<Copy size={18} aria-hidden="true"/>}</button></div></div>}
      <section aria-label="Входящее сообщение" className="min-w-0 rounded-app-xs border border-white/10 bg-black/20 p-3">
        <h3 className="text-sm font-semibold">Входящее сообщение</h3>
        <div className="mt-3 flex items-center gap-2 text-xs text-textSecondary">{o.status==='received'?<Check size={17} className="shrink-0 text-accentBrightGold" aria-hidden="true"/>:<Clock size={17} className="shrink-0" aria-hidden="true"/>}<span>{label(o)}</span></div>
        {o.status==='waiting'&&o.state!=='refunded'&&<p className="mt-2 text-[11px] leading-5 text-textSecondary">{autoPaused?'Автообновление приостановлено. Нажмите «Обновить заказы».':o.expires_at&&Date.parse(o.expires_at)<=Date.now()?'Срок ожидания завершился. Уточняем результат у сервера. Возврат пока не подтверждён.':'Данные обновляются автоматически.'}</p>}
        {o.status==='received'&&o.sms.map((sms,i)=>{
          const key=o.id+':'+i+':'+sms.received_at,shown=revealed[key]===sms.code;
          return <div key={key} className="mt-4 min-w-0 border-t border-white/5 pt-3">
            {sms.code&&<><p className="mb-2 text-xs text-textSecondary">Код</p><div className="flex min-w-0 items-center gap-2 rounded-app-xs border border-white/10 bg-white/[0.03] p-2 pl-3"><span className="min-w-0 flex-1 break-all font-mono text-lg tracking-widest" aria-label={shown?'Код подтверждения':'Код скрыт'}>{shown?sms.code:'••••••'}</span><button type="button" aria-label="Скопировать код" className={iconButton} onClick={()=>void copy(key,sms.code,'code')}>{copied===key?<Check size={18} aria-hidden="true"/>:<Copy size={18} aria-hidden="true"/>}</button></div><button type="button" aria-expanded={shown} className="min-h-[44px] py-2 text-xs text-accentBrightGold" onClick={()=>setRevealed(v=>({...v,[key]:shown?'':sms.code}))}>{shown?'Скрыть код':'Показать код'}</button></>}
            <p className="mb-1 text-xs text-textSecondary">Текст сообщения</p><p className="whitespace-pre-wrap break-words select-text text-xs leading-5">{sms.code&&!shown?'Текст скрыт вместе с кодом.':sms.text}</p>
          </div>;
        })}
        {o.message&&<p className="mt-3 break-words text-xs leading-5 text-textSecondary">{o.message}</p>}
      </section>
      {o.expires_at&&<p className="text-[11px] text-textSecondary">Действует до {new Date(o.expires_at).toLocaleTimeString([], {hour:'2-digit',minute:'2-digit'})} · {new Date(o.expires_at).toLocaleDateString()}</p>}
      <p className="break-all text-[10px] text-textSecondary">ID: {o.id}</p>
    </Card>)}
    <Button variant="secondary" disabled={loading||refreshing} onClick={()=>refreshRef.current()}>{refreshing?'Обновляем…':'Обновить заказы'}</Button>
    <Link to="/tools/numbers" className="text-xs text-accentBrightGold">Выбрать номер →</Link>
  </Shell>;
};
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
  const [purchased,setPurchased]=useState(false);
  const [notice,setNotice]=useState('');
  const [checkout,setCheckout]=useState(false);
  useEffect(()=>{marketApi.proxyIpv4CheckoutConfig().then(x=>setCheckout(x.purchases_enabled)).catch(()=>setCheckout(false));},[]);
  const requestKey=useRef<{signature:string;id:string}|null>(null);
  useEffect(()=>{let active=true;setCatalog(null);setError('');setQuote(null);setPurchased(false);setNotice('');marketApi.proxyIpv4Catalog(kind).then(data=>{if(active){setCatalog(data);setCountry(data.data.countries[0]?.code||'');setDays(data.data.days[0]||7);setQuantity(data.minimum_count);setOperator('');setRotation(0);}}).catch(e=>{if(active)setError(toText(e));});return()=>{active=false;};},[kind]);
  const options=catalog?.data;
  const operators=options?.tariffs?.find(t=>t.country===country)?.mobileOperator||[];
  const selectedOperator=operators.find(x=>x.name===operator)||operators[0];
  const resetQuote=()=>{setQuote(null);setPurchased(false);setNotice('');requestKey.current=null;};
  const choose=(next:string)=>{setKind(next);resetQuote();};
  const price=async()=>{setBusy(true);setError('');resetQuote();try{setQuote(await marketApi.proxyIpv4Quote({proxy_type:kind,country,days,count:quantity,...(kind==='mobile'?{mobile_operator:selectedOperator?.name,rotation_time:selectedOperator?.rotationTime.includes(rotation)?rotation:selectedOperator?.rotationTime[0]}:{})}));}catch(e){setError(toText(e));}finally{setBusy(false);}};
  const purchase=async()=>{
    if(!quote||busy||purchased)return;
    if(!checkout){setError('Оплата временно недоступна. Деньги не списаны.');return;}
    if(!window.confirm('Купить прокси за '+usd(quote.customer_total_usd)+'? Сумма будет списана с баланса инструментов.'))return;
    const selection={proxy_type:kind,country,days,count:quantity,...(kind==='mobile'?{mobile_operator:selectedOperator?.name,rotation_time:selectedOperator?.rotationTime.includes(rotation)?rotation:selectedOperator?.rotationTime[0]}:{})};
    const signature=JSON.stringify(selection);
    if(requestKey.current?.signature!==signature)requestKey.current={signature,id:crypto.randomUUID()};
    setBusy(true);setError('');setNotice('');
    try{
      const order=await marketApi.proxyIpv4Prepare({...selection,request_id:requestKey.current.id});
      await marketApi.proxyIpv4Purchase(order.id);
      setPurchased(true);
      setNotice('Покупка подтверждена. Прокси доступны в разделе «Мои прокси».');
    }catch(e){
      setError(toText(e)+' Если заказ обрабатывается, проверьте его в «Мои прокси». Не оформляйте повторную покупку.');
    }finally{setBusy(false);}
  };
  const minimum=catalog?.minimum_count||(kind==='ipv6'?10:1);
  return <Shell><NavHeader title="Прокси"/>
    <Card className="flex flex-col gap-3">
      <h2 className="text-base font-bold">Выбор прокси</h2>
      {!catalog&&<p className="text-xs text-textSecondary">Каталог ещё не загружен.</p>}
      <label className="text-xs text-textSecondary">Тип прокси<select className={inputClass} value={kind} onChange={e=>choose(e.target.value)}><option value="ipv4">Прокси IPv4</option><option value="ipv6">Прокси IPv6</option><option value="isp">Прокси ISP</option><option value="mobile">Мобильные прокси</option></select></label>
      <label className="text-xs text-textSecondary">Страна<select className={inputClass} value={country} onChange={e=>{setCountry(e.target.value);setOperator('');setRotation(0);resetQuote();}}>{options?.countries.map(x=><option key={x.code} value={x.code}>{x.name} ({x.code})</option>)}</select></label>
      <label className="text-xs text-textSecondary">Срок аренды<select className={inputClass} value={days} onChange={e=>{setDays(Number(e.target.value));resetQuote();}}>{options?.days.map(x=><option key={x} value={x}>{x} дней</option>)}</select></label>
      <label className="text-xs text-textSecondary">Количество IP (минимум {minimum})<input className={inputClass} type="number" min={minimum} max={1000} step={1} value={quantity} onChange={e=>{setQuantity(Number(e.target.value));resetQuote();}}/></label>
      {kind==='mobile'&&options?.mobile_tariff_error&&<p className="text-xs text-amber-400">{options.mobile_tariff_error}. Страны и сроки доступны, но выбор оператора и расчёт цены пока заблокированы.</p>}
      {kind==='mobile'&&<><label className="text-xs text-textSecondary">Оператор<select className={inputClass} value={selectedOperator?.name||''} onChange={e=>{setOperator(e.target.value);setRotation(0);resetQuote();}}>{operators.map(x=><option key={x.name} value={x.name}>{x.name}</option>)}</select></label><label className="text-xs text-textSecondary">Ротация IP<select className={inputClass} value={selectedOperator?.rotationTime.includes(rotation)?rotation:selectedOperator?.rotationTime[0]||0} onChange={e=>{setRotation(Number(e.target.value));resetQuote();}}>{selectedOperator?.rotationTime.map(x=><option key={x} value={x}>{x===0?'По ссылке':x+' минут'}</option>)}</select></label></>}
      <Button type="button" disabled={!catalog||busy||!country||!options?.days.length||!Number.isInteger(quantity)||quantity<minimum||quantity>1000||(kind==='mobile'&&!selectedOperator)} onClick={price}>{busy?'Проверяем цену…':'Рассчитать цену'}</Button>
      {quote&&<Status>Стоимость: ${quote.customer_total_usd}</Status>}
      {quote&&!purchased&&<Button type="button" disabled={busy||!checkout} onClick={()=>void purchase()}>{busy?'Оформляем покупку…':'Купить за '+usd(quote.customer_total_usd)}</Button>}
      {notice&&<Status>{notice}</Status>}
      {error&&<p className="text-xs text-red-400">{error}</p>}
      <Link to="/tools/proxy/my" className="text-xs text-accentBrightGold">Мои прокси →</Link>
    </Card>
  </Shell>;
};
export const MyProxies:React.FC=()=>{
  const [orders,setOrders]=useState<Awaited<ReturnType<typeof marketApi.proxyIpv4Orders>>['orders']>([]);
  const [error,setError]=useState('');
  const [details,setDetails]=useState('');
  const [proxies,setProxies]=useState<unknown[]>([]);
  const [busy,setBusy]=useState('');
  const [checkout,setCheckout]=useState(false);
  useEffect(()=>{marketApi.proxyIpv4CheckoutConfig().then(x=>setCheckout(x.purchases_enabled&&x.supported_purchase_types.length>0)).catch(()=>setCheckout(false));},[]);
  const reload=async()=>{const data=await marketApi.proxyIpv4Orders();setOrders(data.orders);};
  useEffect(()=>{let active=true;marketApi.proxyIpv4Orders().then(data=>{if(active)setOrders(data.orders);}).catch(e=>{if(active)setError(toText(e));});return()=>{active=false;};},[]);
  const check=async(id:string)=>{
    setBusy(id);setError('');setDetails('');setProxies([]);
    try{
      const item=await marketApi.proxyIpv4OrderStatus(id);
      setDetails('Заявка '+item.id.slice(0,8)+': '+(item.status==='prepared'?'подготовлена, не оплачена':item.status)+(item.provider_order_id?' · заказ поставщика '+item.provider_order_id:''));
      if(item.status==='fulfilled'){
        const delivery=await marketApi.proxyIpv4OrderProxies(id);
        setProxies(delivery.proxies);
        if(delivery.delivery_pending)setDetails('Покупка подтверждена. Данные подключения ещё не привязаны к заказу поставщиком.');
      }
      await reload();
    }catch(e){setError(toText(e));}finally{setBusy('');}
  };
  const purchase=async(id:string)=>{
    if(!checkout)return;
    if(!window.confirm('Подтвердить покупку прокси? Средства будут списаны с баланса инструментов.'))return;
    setBusy(id);setError('');
    try{await marketApi.proxyIpv4Purchase(id);await reload();setDetails('Заказ подтверждён. Нажмите «Показать прокси».');}
    catch(e){setError(toText(e));await reload();}
    finally{setBusy('');}
  };
  return <Shell><NavHeader title="Мои прокси"/>
    {error&&<Status>{error}</Status>}
    {details&&<Status>{details}</Status>}
    {proxies.length>0&&<Card className="flex flex-col gap-2"><h2 className="text-sm font-bold">Данные подключения</h2><pre className="overflow-auto whitespace-pre-wrap break-all text-xs">{JSON.stringify(proxies,null,2)}</pre></Card>}
    {orders.length===0&&<Empty title="Покупок пока нет" subtitle="Купленные прокси появятся здесь."/>}
    {orders.map(o=><Card key={o.id} className="flex flex-col gap-2">
      <b className="text-sm">{o.proxy_type.toUpperCase()} · {o.selection.country}</b>
      <p className="text-xs text-textSecondary">{o.selection.count} IP · {o.selection.days} дней · {usd(o.amount_usd)}</p>
      <Status>Статус: {o.status==='prepared'?'Ожидает оплаты':o.status==='uncertain'?'Проверяем оплату':o.status}</Status>
      {o.status==='prepared'&&<Button type="button" size="sm" disabled={busy===o.id} onClick={()=>{if(!checkout){setError('Сервер пока не разрешает оплату. Средства не списаны.');return;}void purchase(o.id);}}>Купить за {usd(o.amount_usd)}</Button>}
      {o.status==='fulfilled'&&<Button type="button" size="sm" disabled={busy===o.id} onClick={()=>void check(o.id)}>{busy===o.id?'Загружаем…':'Показать прокси'}</Button>}
    </Card>)}
  </Shell>;
};
