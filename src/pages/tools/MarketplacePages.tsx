import React, { useCallback, useEffect, useState } from 'react';
import { Link, useNavigate, useParams } from 'react-router-dom';
import { ArrowLeft, ArrowRight, Bot, Check, ChevronRight, Clock, Copy, CreditCard, FileClock, Globe2, History, Package, Phone, Plus, Server, Settings2, ShieldCheck, Wallet, Wrench } from 'lucide-react';
import { Card } from '@/shared/ui/Card';
import { Button } from '@/shared/ui/Button';
import { triggerHaptic } from '@/shared/lib/telegram';
import { marketApi, usd, modelPageUrl, type Character, type ToolWallet, type ToolTransaction, type ToolOrder, type ServiceInfo } from './marketApi';

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
  const [value,setValue]=useState<T>(fallback),[loading,setLoading]=useState(true),[error,setError]=useState('');
  const refresh=useCallback(async()=>{setLoading(true);setError('');try{setValue(await load());}catch(e){setError(toText(e));}finally{setLoading(false);}},[load]);
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
      {w.error&&<Status>{w.error} Отображается $0.00 до подключения к серверу.</Status>}
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
  const c=useRemote(readCatalog,{services:[] as ServiceInfo[],payment_provider:{status:'unavailable',assets:[] as string[]}});
  const [amount,setAmount]=useState('5');
  const amountNum=Number(amount);
  const valid=/^\d+(\.\d{1,2})?$/.test(amount)&&Number.isFinite(amountNum)&&amountNum>=5&&amountNum<=10000;
  return <Shell><NavHeader title="Пополнение баланса"/>
    <Card className="flex flex-col gap-2"><p className="text-xs text-textSecondary">Текущий баланс</p><strong className="text-2xl text-accentBrightGold">{usd(w.value.available)}</strong></Card>
    <Card className="flex flex-col gap-4">
      <label className="text-xs font-semibold text-textSecondary">Сумма в USD (минимум $5)
        <input className={inputClass+' mt-2'} type="text" inputMode="decimal" value={amount} onChange={e=>setAmount(e.target.value)} placeholder="5.00"/>
      </label>
      <div className="grid grid-cols-5 gap-1">{[5,10,25,50,100].map(n=><button type="button" key={n} onClick={()=>setAmount(String(n))} className={'rounded-app-xs border px-1 py-2 text-xs '+(amount===String(n)?'border-accentGold bg-accentGold/10 text-accentBrightGold':'border-white/10 text-textSecondary')}>$​{n}</button>)}</div>
      {!valid&&<p role="alert" className="text-xs text-error">Укажите сумму от $5 до $10 000, до двух знаков после запятой.</p>}
      <p className="text-xs text-textSecondary">Доступные криптовалюты</p>
      <div className="rounded-app-xs border border-white/10 bg-white/[0.03] p-3 text-sm text-textSecondary">
        {c.value.payment_provider.assets.length?c.value.payment_provider.assets.join(', '):'Провайдер не подключён'}
      </div>
      <div className="flex justify-between border-t border-white/10 pt-3 text-sm"><span className="text-textSecondary">Сумма заявки</span><strong>{valid?usd(amountNum):'—'}</strong></div>
      <Button type="button" disabled={true}>Перейти к оплате</Button>
      <Status>Оплата пока недоступна. Счёт не создаётся, списаний и начислений нет. Способ оплаты будет подключён после проверки правил Telegram и провайдера.</Status>
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
