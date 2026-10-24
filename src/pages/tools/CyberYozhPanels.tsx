/** Content of the four existing pages only. No persistent storage of SMS or credentials. */
import React, {useEffect, useState} from 'react';
import {Link} from 'react-router-dom';
import {ChevronRight, Copy, Check} from 'lucide-react';
import {Card} from '@/shared/ui/Card';
import {Button} from '@/shared/ui/Button';
import {cyberApi, usd, type CyberCategory, type CyberCatalog, type CyberOffer, type CyberOrder, type CyberItem} from './marketApi';

const field='w-full rounded-app-xs border border-white/10 bg-bgCard px-3 py-3 text-sm text-textPrimary outline-none focus:border-accentGold/60';
const Notice:React.FC<{children:React.ReactNode}>=({children})=><p role="status" className="rounded-app-xs border border-white/10 bg-white/[0.03] p-3 text-xs leading-5 text-textSecondary">{children}</p>;
const errorText=(e:unknown)=>e instanceof Error?e.message:'Не удалось загрузить данные';
const periodNames:Record<string,string>={MIN_15:'15 минут',HOUR_4:'4 часа',HOUR_12:'12 часов',DAY:'1 день',DAY_3:'3 дня',WEEK:'1 неделя',WEEK_2:'2 недели',DAY_25:'25 дней'};
const providerNames:Record<string,string>={virtual:'Виртуальный',virtual_rent:'Виртуальный — аренда',residential:'Мобильный',residential_rent:'Мобильный — аренда'};
const states:Record<string,string>={reserved:'Средства зарезервированы',dispatched:'Ожидание выдачи',awaiting_provider:'Ожидание выдачи',unknown:'Заказ на сверке. Повторная покупка не отправляется.',issued:'Выдан',rejected:'Заказ не выполнен, резерв снят',refunded:'Возврат выполнен',waiting:'Ожидание SMS',success:'SMS получено',canceled:'Отменён',refund:'Возвращён',not_sms_code:'Срок ожидания завершён',calculation:'Проверка результата',active:'Активен',inactive:'Неактивен'};
function Select({label,value,onChange,options,disabled=false}:{label:string;value:string;onChange:(v:string)=>void;options:{value:string;label:string}[];disabled?:boolean}) {
  return <label className="text-xs text-textSecondary">{label}<select aria-label={label} className={field+' mt-2'} value={value} onChange={e=>onChange(e.target.value)} disabled={disabled||!options.length}><option value="">{options.length?'Выберите':'Нет доступных вариантов'}</option>{options.map(o=><option key={o.value} value={o.value}>{o.label}</option>)}</select></label>;
}
function useCatalog(category:CyberCategory) {
  const [data,setData]=useState<CyberCatalog|null>(null),[error,setError]=useState(''),[revision,setRevision]=useState(0);
  useEffect(()=>{let active=true;let timer:ReturnType<typeof setTimeout>|undefined;setError('');cyberApi.catalog(category).then(d=>{if(active){setData(d);if(d.status==='updating')timer=setTimeout(()=>setRevision(v=>v+1),5000);}}).catch(e=>{if(active)setError(errorText(e));});return()=>{active=false;if(timer)clearTimeout(timer);};},[category,revision]);
  return {data,error,retry:()=>setRevision(v=>v+1)};
}
function PurchaseState({category,offer,quantity=1,mock}:{category:CyberCategory;offer:CyberOffer|null;quantity?:number;mock:boolean}) {
  const [total,setTotal]=useState(''),[unit,setUnit]=useState(''),[error,setError]=useState(''),[revision,setRevision]=useState(0);
  useEffect(()=>{let active=true;setTotal('');setUnit('');setError('');if(offer?.available)cyberApi.quote(category,{...offer,quantity}).then(d=>{if(active){setTotal(d.amount);setUnit(d.offer.price);}}).catch(e=>{if(active)setError(errorText(e));});return()=>{active=false;};},[category,offer,quantity,revision]);
  return <><div className="flex justify-between text-sm"><span className="text-textSecondary">Наличие</span><b>{offer?(offer.available?(offer.stock||'В наличии'):'Нет в наличии'):'Нет данных'}</b></div>
    {category==='proxy'&&<div className="flex justify-between text-sm"><span className="text-textSecondary">За штуку за выбранный срок</span><b>{unit?usd(unit):'—'}</b></div>}
    <div className="flex justify-between text-sm"><span className="text-textSecondary">{mock?'Тестовая стоимость':'Итого'}</span><b>{total?usd(total):'—'}</b></div>
    {offer?.available&&!total&&<Notice>Предварительная цена: {usd(offer.price)} за штуку. Актуальную стоимость ещё проверяем.</Notice>}
    {error&&<><Notice>{error}</Notice><Button size="sm" variant="secondary" onClick={()=>setRevision(v=>v+1)}>Повторить проверку цены</Button></>}<Button type="button" disabled>{category==='numbers'?'Купить номер':'Купить прокси'}</Button>
  </>;
}
export function NumbersPanel(){
  const {data,error,retry}=useCatalog('numbers');
  const [country,setCountry]=useState(''),[service,setService]=useState(''),[provider,setProvider]=useState(''),[period,setPeriod]=useState('');
  const [offers,setOffers]=useState<CyberOffer[]>([]),[searchError,setSearchError]=useState(''),[loading,setLoading]=useState(false),[revision,setRevision]=useState(0);
  useEffect(()=>{let active=true;setOffers([]);setSearchError('');setLoading(false);
    if(country&&service&&provider&&period){setLoading(true);cyberApi.search({country,service,provider,period}).then(d=>{if(active)setOffers(d.offers);}).catch(e=>{if(active)setSearchError(errorText(e));}).finally(()=>{if(active)setLoading(false);});}
    return()=>{active=false;};},[country,service,provider,period,revision]);
  const selected=offers[0]||null;
  return <><Card className="flex flex-col gap-3">
    <Select label="Страна" value={country} onChange={setCountry} options={(data?.countries||[]).map(r=>({value:r.code,label:r.name}))}/>
    <Select label="Тип номера" value={provider} onChange={v=>{setProvider(v);setPeriod('');setService('');}} options={Object.keys(data?.periods||{}).map(v=>({value:v,label:providerNames[v]||v}))}/>
    <Select label="Сервис" value={service} onChange={setService} options={(data?.services||[]).filter(r=>r.provider===provider).map(r=>({value:r.code,label:r.name}))}/>
    <Select label="Срок" value={period} onChange={setPeriod} options={(data?.periods[provider]||[]).map(v=>({value:v,label:periodNames[v]||v}))}/>
    {loading&&<Notice>Проверяем наличие…</Notice>}{searchError&&<><Notice>{searchError}</Notice><Button size="sm" variant="secondary" onClick={()=>setRevision(v=>v+1)}>Повторить поиск</Button></>}
    <PurchaseState category="numbers" offer={selected} mock={!!data?.mock}/>
  </Card>{error?<><Notice>{error}</Notice><Button size="sm" variant="secondary" onClick={retry}>Повторить загрузку</Button></>:<Notice>{data?.message||'Загружаем каталог…'}{data?.updated_at?` Обновлено: ${new Date(data.updated_at).toLocaleString('ru-RU')}`:''}</Notice>}
    <MyLink category="numbers"/>
  </>;
}
export function ProxyPanel(){
  const {data,error,retry}=useCatalog('proxy');
  const [type,setType]=useState(''),[country,setCountry]=useState(''),[product,setProduct]=useState(''),[period,setPeriod]=useState(''),[quantity,setQuantity]=useState(1);
  const all=data?.offers||[],filtered=all.filter(r=>r.category===type&&r.country===country),selected=filtered.find(r=>r.id===product&&String(r.period_months)===period)||null;
  const unique=(items:string[])=>Array.from(new Set(items));
  return <><Card className="flex flex-col gap-3">
    <Select label="Тип прокси" value={type} onChange={v=>{setType(v);setCountry('');setProduct('');setPeriod('');setQuantity(1);}} options={unique(all.map(r=>r.category||'')).map(v=>({value:v,label:v==='lte'?'Мобильные 4G/5G':'Статические ISP'}))}/>
    <Select label="Страна" value={country} onChange={v=>{setCountry(v);setProduct('');setPeriod('');setQuantity(1);}} options={unique(all.filter(r=>r.category===type).map(r=>r.country)).map(v=>({value:v,label:v.toUpperCase()}))}/>
    <Select label="Тариф" value={product} onChange={v=>{setProduct(v);setPeriod('');setQuantity(1);}} options={unique(filtered.map(r=>r.id)).map(v=>({value:v,label:filtered.find(r=>r.id===v)!.title}))}/>
    <Select label="Срок аренды" value={period} onChange={v=>{setPeriod(v);setQuantity(1);}} options={filtered.filter(r=>r.id===product).map(r=>({value:String(r.period_months),label:r.days?`${r.days} дн.`:`${r.period_months} мес.`}))}/>
    <Select label="Количество" value={selected?String(quantity):''} onChange={v=>setQuantity(Number(v)||1)} options={selected?Array.from({length:selected.max_quantity||0},(_,i)=>({value:String(i+1),label:String(i+1)})):[]}/>
    {selected&&<p className="text-xs text-textSecondary">Безлимитный трафик · {(selected.protocols||[]).join(', ')}</p>}
    <PurchaseState category="proxy" offer={selected} quantity={quantity} mock={!!data?.mock}/>
  </Card>{error?<><Notice>{error}</Notice><Button size="sm" variant="secondary" onClick={retry}>Повторить загрузку</Button></>:<Notice>{data?.message||'Загружаем каталог…'}{data?.updated_at?` Обновлено: ${new Date(data.updated_at).toLocaleString('ru-RU')}`:''}</Notice>}<MyLink category="proxy"/></>;
}
function MyLink({category}:{category:CyberCategory}){return <Link to={'/tools/'+category+'/my'} className="flex items-center justify-between rounded-app-xs border border-white/10 bg-white/[0.03] p-4 text-sm"><span>{category==='numbers'?'Мои номера':'Мои прокси'}</span><ChevronRight size={17}/></Link>;}
function Expiry({value}:{value?:string|null}){
  const [now,setNow]=useState(Date.now());useEffect(()=>{const id=setInterval(()=>setNow(Date.now()),1000);return()=>clearInterval(id);},[]);
  if(!value)return null;const end=Date.parse(value);if(!Number.isFinite(end))return null;
  const seconds=Math.max(0,Math.floor((end-now)/1000));
  return <p className="text-xs text-textSecondary">До {new Date(end).toLocaleString('ru-RU')} · {seconds?`${Math.floor(seconds/3600)} ч ${Math.floor(seconds%3600/60)} мин ${seconds%60} с`:'Срок истёк'}</p>;
}
function Item({item,order,category}:{item:CyberItem;order:CyberOrder;category:CyberCategory}){
  const [copied,setCopied]=useState(false),[error,setError]=useState('');
  useEffect(()=>{if(!copied)return;const id=setTimeout(()=>setCopied(false),2000);return()=>clearTimeout(id);},[copied]);
  const connection=[item.connection_host,item.connection_port,item.connection_login,item.connection_password].join(':');
  return <div className="flex flex-col gap-2 border-t border-white/10 pt-3 min-w-0">
    <strong className="text-sm break-all">{category==='numbers'?item.phone_number||'Номер готовится':item.connection_host||'Прокси готовится'}</strong>
    <p className="text-xs text-textSecondary">{item.expired?'Срок истёк':states[item.status||item.system_status||'']||item.status||item.system_status}</p>
    <Expiry value={category==='numbers'?item.expiration_time:item.access_expires_at}/>
    {category==='numbers'?<><p className="text-xs text-textSecondary">Входящие SMS</p>{item.history_sms_code?.length?item.history_sms_code.map((sms,i)=><p key={i} className="text-sm break-words">{sms}</p>):<Notice>Ожидание SMS</Notice>}
    {item.can_cancel&&<Button size="sm" disabled>Отмена — после подключения</Button>}{item.can_extend&&<Button size="sm" disabled>Продление — после подключения</Button>}</>:<>
      <p className="text-xs break-all">IP: {item.public_ipaddress||'—'} · Порт: {item.connection_port||'—'}</p>
      <p className="text-xs break-all">Логин: {item.connection_login||'—'}</p><p className="text-xs break-all">Пароль: {item.connection_password||'—'}</p>
      <p className="text-xs">{(order.selection.protocols||[]).join(', ')}</p>
      <Button size="sm" variant="secondary" disabled={!item.connection_host||!item.connection_login||!item.connection_password} onClick={async()=>{try{await navigator.clipboard.writeText(connection);setCopied(true);setError('');}catch{setError('Не удалось скопировать. Выделите данные вручную.');}}}>{copied?<Check size={14}/>:<Copy size={14}/>} {copied?'Скопировано':'Копировать подключение'}</Button>
      {item.can_refresh_ip&&<Button size="sm" disabled>Смена IP — после подключения</Button>}
    </>}{error&&<Notice>{error}</Notice>}
  </div>;
}
function OrderCard({order,category}:{order:CyberOrder;category:CyberCategory}){
  const [items,setItems]=useState<CyberItem[]>([]),[error,setError]=useState(''),[busy,setBusy]=useState(false);
  useEffect(()=>{let active=true;setBusy(true);cyberApi.detail(category,order.id).then(d=>{if(active)setItems(d.items);}).catch(e=>{if(active)setError(errorText(e));}).finally(()=>{if(active)setBusy(false);});return()=>{active=false;};},[category,order]);
  return <Card className="flex flex-col gap-3 min-w-0"><div className="flex justify-between gap-2"><b className="text-sm">{order.selection.title}</b><b className="text-sm text-accentBrightGold">{usd(order.amount)}</b></div>
    <p className="text-xs text-textSecondary">{order.selection.country_name||order.selection.country} · {new Date(order.created_at).toLocaleString('ru-RU')}</p><Notice>{states[order.state]||order.state}</Notice>
    {busy&&<Notice>Обновляем данные…</Notice>}{error&&<Notice>{error}</Notice>}{items.map(item=><Item key={item.id} item={item} category={category} order={order}/>)}</Card>;
}
export function OwnedPanel({category}:{category:CyberCategory}){
  const [orders,setOrders]=useState<CyberOrder[]>([]),[error,setError]=useState(''),[busy,setBusy]=useState(true),[revision,setRevision]=useState(0);
  useEffect(()=>{let active=true;setBusy(true);setError('');cyberApi.orders(category).then(d=>{if(active)setOrders(d.orders);}).catch(e=>{if(active)setError(errorText(e));}).finally(()=>{if(active)setBusy(false);});return()=>{active=false;};},[category,revision]);
  return <><Button size="sm" variant="secondary" isLoading={busy} onClick={()=>setRevision(v=>v+1)}>Обновить</Button>{error&&<Notice>{error}</Notice>}
    {!busy&&!error&&!orders.length&&<Card className="py-8 text-center"><b className="text-sm">{category==='numbers'?'Активных номеров нет':'Прокси пока не приобретены'}</b><p className="text-xs text-textSecondary mt-2">Сервис готовится к подключению</p></Card>}
    {orders.map(order=><OrderCard key={order.id} order={order} category={category}/>)}</>;
}
