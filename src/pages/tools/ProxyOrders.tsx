import React, { useEffect, useRef, useState } from 'react';
import { Check, Copy, Eye, EyeOff } from 'lucide-react';
import { Card } from '@/shared/ui/Card';
import { Button } from '@/shared/ui/Button';
import { marketApi, usd, type DeliveredProxy, type ProxyDelivery } from './marketApi';

type Order = Awaited<ReturnType<typeof marketApi.proxyIpv4Orders>>['orders'][number];
const payment:Record<string,string> = {prepared:'Ожидает оплаты',reserved:'Оплата обрабатывается',submitting:'Оплата обрабатывается',uncertain:'Требуется проверка результата',fulfilled:'Заказ подтверждён',cancelled:'Заказ отменён',canceled:'Заказ отменён'};
const box='min-w-0 rounded-app-xs border border-white/10 bg-white/[0.03] p-3';
const icon='flex h-11 w-11 shrink-0 items-center justify-center text-accentBrightGold';
const date=(value:string)=>Number.isFinite(Date.parse(value))?new Date(value).toLocaleString('ru-RU'):'';
export function proxyAddress(p:DeliveredProxy, endpoint:DeliveredProxy['endpoints'][number]) {
  const host=p.host.includes(':')?`[${p.host}]`:p.host;
  const credentials=p.login!==undefined&&p.password!==undefined?`${encodeURIComponent(p.login)}:${encodeURIComponent(p.password)}@`:'';
  // Supplier HTTPS port supports the HTTP CONNECT proxy protocol.
  const scheme=endpoint.protocol==='SOCKS5'?'socks5':'http';
  return `${scheme}://${credentials}${host}:${endpoint.port}`;
}
function ProxyCard({proxy:p,index}:{proxy:DeliveredProxy;index:number}) {
  const [shown,setShown]=useState(false),[copied,setCopied]=useState(''),[notice,setNotice]=useState('');
  const timer=useRef<ReturnType<typeof setTimeout>>(),alive=useRef(true);
  useEffect(()=>{alive.current=true;return()=>{alive.current=false;clearTimeout(timer.current);};},[]);
  const copy=async(key:string,value:string)=>{
    try {await navigator.clipboard.writeText(value);if(!alive.current)return;setCopied(key);setNotice('Скопировано');}
    catch {if(!alive.current)return;setNotice('Не удалось скопировать. Попробуйте ещё раз.');}
    clearTimeout(timer.current);timer.current=setTimeout(()=>{setCopied('');setNotice('');},2000);
  };
  const copyButton=(key:string,value:string)=><button type="button" className={icon} aria-label={`Скопировать ${key}`} onClick={()=>void copy(key,value)}>{copied===key?<Check size={18}/>:<Copy size={18}/>}</button>;
  const field=(label:string,value:string,secret=false)=><div><p className="text-xs text-textSecondary">{label}</p><div className="flex min-w-0 items-center gap-1"><span className="min-w-0 flex-1 break-all font-mono text-sm">{secret&&!shown?'••••••••':value}</span>{secret&&<button type="button" className={icon} aria-label={shown?'Скрыть пароль':'Показать пароль'} aria-pressed={shown} onClick={()=>setShown(v=>!v)}>{shown?<EyeOff size={18}/>:<Eye size={18}/>}</button>}{copyButton(label,value)}</div></div>;
  const expiry=p.expires_at?date(p.expires_at):'';
  return <section className={`${box} flex flex-col gap-3`} aria-label={`Прокси №${index+1}`}>
    <h3 className="text-sm font-bold">Прокси №{index+1}</h3>
    {field('IP-адрес',p.host)}
    {p.endpoints.map(e=><div key={e.protocol+e.port}>{field(`Порт ${e.protocol}`,e.port)}</div>)}
    {p.login!==undefined&&field('Логин',p.login)}
    {p.password!==undefined&&field('Пароль',p.password,true)}
    {p.endpoints.map(e=><div key={e.protocol+e.port} className="min-w-0">
      <p className="text-xs text-textSecondary">Полный адрес · {e.protocol}</p>
      <div className="flex items-center min-w-0"><span className="min-w-0 flex-1 break-all text-xs font-mono">{proxyAddress({...p,login:undefined,password:undefined},e)}{p.login!==undefined?' · с авторизацией':''}</span>{copyButton(`адрес ${e.protocol}`,proxyAddress(p,e))}</div>
      <Button type="button" size="sm" style={{whiteSpace:"normal",height:"auto",minHeight:44,maxWidth:"100%"}} onClick={()=>void copy(`адрес ${e.protocol}`,proxyAddress(p,e))}>Скопировать прокси целиком · {e.protocol}</Button>
    </div>)}
    {expiry&&<p className="text-xs text-textSecondary">Действует до: {expiry}{Date.parse(p.expires_at!)<=Date.now()?' · Срок действия истёк':''}</p>}
    {(p.mobile_operator!==undefined||p.rotation_minutes!==undefined)&&<div className={box}><p className="text-xs font-bold">Мобильный прокси</p>{p.mobile_operator&&<p className="break-all text-xs">Оператор: {p.mobile_operator}</p>}{p.rotation_minutes!==undefined&&<p className="text-xs">Ротация: {p.rotation_minutes===0?'по запросу':`${p.rotation_minutes} мин.`}</p>}</div>}
    {notice&&<p role="status" className="text-xs text-textSecondary">{notice}</p>}
  </section>;
}
export function ProxyOrders() {
  const [orders,setOrders]=useState<Order[]>([]),[deliveries,setDeliveries]=useState<Record<string,ProxyDelivery>>({});
  const [opened,setOpened]=useState<Record<string,boolean>>({}),[error,setError]=useState(''),[errors,setErrors]=useState<Record<string,string>>({});
  const [busy,setBusy]=useState(false),[loaded,setLoaded]=useState(false),[paused,setPaused]=useState(false),[checkout,setCheckout]=useState<string[]>([]);
  const [checkoutReason,setCheckoutReason]=useState('Проверяем доступность покупки…');
  const refresh=useRef<()=>void>(()=>{}),purchaseRef=useRef<(id:string,controlId?:string)=>Promise<void>>(async()=>{});
  useEffect(()=>{
    let active=true,running=false,queued=false,cycles=0,failures=0;
    let timer:ReturnType<typeof setTimeout>|undefined;
    let current:Order[]=[],cache:Record<string,ProxyDelivery>={};
    const retryOrder=new Map<string,number>();
    const pending=(o:Order)=>['reserved','submitting','uncertain'].includes(o.status)||(o.status==='fulfilled'&&(!cache[o.id]||cache[o.id].delivery_pending));
    const run=async(manual=false)=>{
      if(!active)return;
      if(running){if(manual)queued=true;return;}
      running=true;clearTimeout(timer);setBusy(true);
      if(manual){cycles=0;failures=0;retryOrder.clear();setPaused(false);}
      let failed=false;
      try {
        if(manual||!current.length||cycles===0){const data=await marketApi.proxyIpv4Orders();if(!active)return;current=data.orders;setOrders(current);setLoaded(true);}
        for(let i=0;i<current.length&&active;i++){
          let o=current[i];
          if(!manual&&(!pending(o)||(retryOrder.get(o.id)||0)>=5))continue;
          try{
            if(['reserved','submitting','uncertain'].includes(o.status)){
              o=await marketApi.proxyIpv4OrderStatus(o.id);if(!active)return;current[i]=o;setOrders([...current]);
            }
            if(o.status==='fulfilled'){
              const delivery=await marketApi.proxyIpv4OrderProxies(o.id);if(!active)return;
              cache={...cache,[o.id]:delivery};setDeliveries(cache);
            }
            retryOrder.delete(o.id);setErrors(v=>({...v,[o.id]:''}));
          }catch {if(!active)return;retryOrder.set(o.id,(retryOrder.get(o.id)||0)+1);setErrors(v=>({...v,[o.id]:'Ошибка получения данных. Можно повторить обновление.'}));}
        }
        if(active){failures=0;setError('');}
      }catch {failed=true;failures++;if(active)setError('Сервер временно недоступен. Попробуйте обновить заказы.');}
      finally{
        running=false;
        if(active){setBusy(false);cycles++;
          if(queued){queued=false;timer=setTimeout(()=>void run(true),0);}
          else if(cycles<30&&failures<5&&(failed||current.some(o=>pending(o)&&(retryOrder.get(o.id)||0)<5))){timer=setTimeout(()=>void run(),failed?Math.min(10000*2**failures,60000):10000);}
          else if(failed||current.some(pending)){setPaused(true);}
        }
      }
    };
    refresh.current=()=>void run(true);
    purchaseRef.current=async(id,controlId)=>{
      if(running||!active)return;
      running=true;clearTimeout(timer);setBusy(true);
      try{await marketApi.proxyIpv4Purchase(id,controlId);}catch{if(active)setError('Не удалось подтвердить покупку. Обновляем статус заказа.');}
      finally{running=false;if(active)void run(true);}
    };
    marketApi.proxyIpv4CheckoutConfig().then(c=>{if(active){setCheckout(c.purchases_enabled?c.supported_purchase_types:[]);setCheckoutReason((c.purchases_enabled?c.unsupported_reason:c.reason)||'Покупки временно недоступны. Проводится проверка системы выдачи.');}}).catch(()=>{if(active)setCheckoutReason('Не удалось проверить доступность покупки. Откройте страницу повторно.');});
    void run(true);
    return()=>{active=false;clearTimeout(timer);};
  },[]);
  const purchase=(o:Order)=>{if((o.control_id||checkout.includes(o.proxy_type))&&window.confirm('Подтвердить '+(o.control_id?'однократную контрольную покупку':'покупку прокси')+' за '+usd(o.amount_usd)+'? Средства будут списаны с баланса инструментов.'))void purchaseRef.current(o.id,o.control_id||undefined);};
  return <>
    {error&&<p role="alert" className={box}>{error}</p>}
    {!loaded&&busy&&<p className="text-sm text-textSecondary">Загружаем заказы…</p>}
    {loaded&&!orders.length&&<Card><p>Покупок пока нет</p></Card>}
    {orders.map(o=>{
      const d=deliveries[o.id],count=d?.proxies.length||0,expected=o.selection.count;
      const complete=count===expected&&expected>0&&d?.delivery_pending===false;
      const delivery=o.status==='cancelled'?'Заказ закрыт, выдача остановлена':o.status!=='fulfilled'?'Выдача после подтверждения заказа':complete?'Прокси выданы':count?`Получено ${count} из ${expected} прокси. Ожидаем остальные`:'Заказ подтверждён. Ожидаем данные подключения от поставщика';
      return <Card key={o.id} className="flex min-w-0 flex-col gap-3">
        <h2 className="text-sm font-bold">{({ipv4:'IPv4',ipv6:'IPv6',isp:'ISP',mobile:'Mobile'} as Record<string,string>)[o.proxy_type]||o.proxy_type} · {o.selection.country}</h2>
        <p className="text-xs text-textSecondary">Количество: {expected} IP · Срок аренды: {o.selection.days} дней</p>
        <p className="text-xs break-all text-textSecondary">ID заказа: {o.id}</p><p className="text-sm">Стоимость: {usd(o.amount_usd)}</p><p className="text-xs text-textSecondary">{date(o.created_at)}</p>
        <p className={box}>Оплата: {o.financial_outcome==='refunded'?'Возврат подтверждён':o.financial_outcome==='rejected'?'Отказ подтверждён, резерв возвращён':payment[o.status]||'Требуется проверка результата'}</p>
        <p className={box}>Выдача: {delivery}</p>
        {d?.inventory_review&&<p className="text-xs text-textSecondary">{d.inventory_review.state==='waiting'?'Поставщик пока не показал новые прокси.':d.inventory_review.state==='partial'?'В инвентаре появились не все прокси. Принадлежность заказу ещё проверяется.':'Нужна ручная проверка принадлежности прокси заказу.'}</p>}
        {d?.verification_required&&<p className="text-xs text-textSecondary">Ожидаем подтверждение привязки прокси к заказу.</p>}
        {errors[o.id]&&<p role="alert" className="text-xs text-textSecondary">{errors[o.id]}</p>}
        {o.status==='prepared'&&!o.control_id&&!checkout.includes(o.proxy_type)&&<div role="status" className="text-xs leading-5 text-textSecondary"><p>Заказ подготовлен без оплаты. Средства не зарезервированы и не списаны.</p><p>Ожидает отдельного разрешения администратора для UUID и суммы этого заказа. После разрешения нажмите «Обновить» — появится кнопка контрольной покупки.</p><p>Обычная покупка заблокирована. {checkoutReason}</p></div>}
        {o.status==='prepared'&&<Button type="button" size="sm" disabled={busy||(!o.control_id&&!checkout.includes(o.proxy_type))} onClick={()=>purchase(o)}>{o.control_id?'Контрольная покупка за ':'Купить за '}{usd(o.amount_usd)}</Button>}
        {o.status==='fulfilled'&&<Button type="button" size="sm" aria-expanded={!!opened[o.id]} onClick={()=>setOpened(v=>({...v,[o.id]:!v[o.id]}))}>{opened[o.id]?'Скрыть прокси':'Посмотреть мои прокси'}</Button>}
        {o.status==='fulfilled'&&opened[o.id]&&d?.proxies.map((p,i)=><ProxyCard key={p.id} proxy={p} index={i}/>)}
      </Card>;
    })}
    {paused&&<p className="text-xs text-textSecondary">Автообновление приостановлено. Нажмите «Обновить» для повторной проверки.</p>}
    <Button type="button" disabled={busy} onClick={()=>refresh.current()}>Обновить</Button>
  </>;
}
