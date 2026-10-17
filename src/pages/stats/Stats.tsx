import React, { useCallback, useEffect, useMemo, useState } from 'react';
import { RefreshCw, TrendingUp } from 'lucide-react';
import { authorizedFetch } from '@/shared/lib/api';
import { getTelegramUser, triggerHaptic } from '@/shared/lib/telegram';
import { Card } from '@/shared/ui/Card';

type Period = 'today'|'yesterday'|'7days'|'30days'|'all';
type Day = {date:string;clicks:number;conversions:number};
type Statuses = {pending:number;approved:number;rejected:number};
type Summary = {clicks:number;conversions:number;cr:number;epc:number;earned:number;on_hold:number;real_withdrawable:number;statuses:Statuses};
type Country = {country_code:string|null;country_name:string;clicks:number};
type Click = {created_at:string;country_code:string|null;country_name:string;offer_name:string|null};
type Offer = {id:string|null;label:string};
const API='https://vvd-cpa-v2.onrender.com';

const countryFlag=(value:string|null)=>{
  if (!value || !/^[A-Z]{2}$/.test(value) || value==='XX' || value==='ZZ') return '🌐';
  return String.fromCodePoint(...[...value].map(letter=>127397+letter.charCodeAt(0)));
};
export const sortCountries=(countries:Country[],direction:'desc'|'asc')=>
  [...countries].sort((a,b)=>direction==='desc'
    ? b.clicks-a.clicks || a.country_name.localeCompare(b.country_name,'ru')
    : a.clicks-b.clicks || a.country_name.localeCompare(b.country_name,'ru'));

const money=(n:number)=>'$'+Number(n||0).toFixed(2);
const periods:{id:Period;label:string}[]=[
  {id:'today',label:'Сегодня'},{id:'yesterday',label:'Вчера'},
  {id:'7days',label:'7 дней'},{id:'30days',label:'30 дней'},
  {id:'all',label:'Всё время'}];

export const Stats:React.FC=()=>{
  const [period,setPeriod]=useState<Period>('today');
  const [dateFrom,setDateFrom]=useState('');
  const [dateTo,setDateTo]=useState('');
  const [offerId,setOfferId]=useState('');
  const [summary,setSummary]=useState<Summary|null>(null);
  const [daily,setDaily]=useState<Day[]>([]);
  const [countries,setCountries]=useState<Country[]>([]);
  const [sort,setSort]=useState<'desc'|'asc'>('desc');
  const [clicks,setClicks]=useState<Click[]>([]);
  const [offset,setOffset]=useState(0);
  const [hasMore,setHasMore]=useState(false);
  const [offers,setOffers]=useState<Offer[]>([]);
  const [loading,setLoading]=useState(false);
  const [error,setError]=useState('');
  const [refreshing,setRefreshing]=useState(false);
  const params=useMemo(()=>{
    const p=new URLSearchParams({period});
    if(dateFrom)p.set('from',dateFrom);
    if(dateTo)p.set('to',dateTo);
    if(offerId)p.set('offer_id',offerId);
    return p;
  },[period,dateFrom,dateTo,offerId]);

  const load=useCallback(async (refresh=false)=>{
    const id=Number(getTelegramUser().id);
    if(!id){setError('Не удалось определить Telegram');return;}
    refresh?setRefreshing(true):setLoading(true);
    setError('');
    try{
      const suffix='?'+params.toString();
      const endpoints=[
        `${API}/statistics/${id}${suffix}`,
        `${API}/statistics/${id}/countries${suffix}`,
        `${API}/statistics/${id}/breakdown${suffix}`,
        `${API}/statistics/${id}/clicks${suffix}&limit=10&offset=0`
      ];
      const response=await Promise.all(endpoints.map(url=>authorizedFetch(url,{cache:'no-store'})));
      if(response.some(r=>!r.ok))throw new Error('Не удалось загрузить статистику');
      const [a,g,b,c]=await Promise.all(response.map(r=>r.json()));
      if([a,g,b,c].some(x=>!x.success))throw new Error('Статистика временно недоступна');
      setSummary(a.summary);
      setDaily(a.statistics||[]);
      setCountries(g.countries||[]);
      setOffers(b.offers||[]);
      setClicks(c.clicks||[]);
      setOffset(c.clicks?.length||0);
      setHasMore((c.clicks?.length||0)===10);
      if(refresh)triggerHaptic.success();
    }catch(e){setError(e instanceof Error?e.message:'Ошибка загрузки');}
    finally{setLoading(false);setRefreshing(false);}
  },[params]);

  useEffect(()=>{void load();},[load]);

  const loadMore=async()=>{
    const id=Number(getTelegramUser().id);
    if(!id)return;
    try{
      setRefreshing(true);
      const p=new URLSearchParams(params);
      p.set('limit','10');p.set('offset',String(offset));
      const response=await authorizedFetch(`${API}/statistics/${id}/clicks?${p}`,{cache:'no-store'});
      if(!response.ok)throw new Error('Не удалось загрузить переходы');
      const data=await response.json();
      const next:Click[]=data.clicks||[];
      setClicks(old=>[...old,...next]);
      setOffset(old=>old+next.length);
      setHasMore(next.length===10);
    }catch(e){setError(e instanceof Error?e.message:'Ошибка загрузки');}
    finally{setRefreshing(false);}
  };

  const metric=(label:string,value:string|number)=>(
    <Card padding="sm" className="min-w-0 !p-2.5 flex flex-col justify-center gap-1 min-h-[69px] border-white/5">
      <span className="text-[10px] leading-tight text-textSecondary">{label}</span>
      <span className="font-bold text-white text-lg leading-tight truncate">{value}</span>
    </Card>
  );
  const series=useMemo(()=>[...daily].sort((a,b)=>a.date.localeCompare(b.date)),[daily]);
  const max=Math.max(1,...series.map(d=>d.clicks));
  const orderedCountries=useMemo(()=>sortCountries(countries,sort),[countries,sort]);

  return <div className="flex flex-col gap-3 px-3 pt-3 pb-28 select-none animate-fade-in" data-testid="compact-analysis">
    <div className="flex items-center justify-between">
      <h1 className="text-xl font-bold text-white">Анализ</h1>
      <button aria-label="Обновить статистику" onClick={()=>void load(true)} disabled={refreshing} className="w-9 h-9 rounded-full border border-white/10 bg-bgCard/40 flex items-center justify-center text-textSecondary">
        <RefreshCw size={16} className={refreshing?'animate-spin':''}/>
      </button>
    </div>
    <div className="flex flex-wrap gap-1.5" aria-label="Период статистики">
      {periods.map(p=><button key={p.id} onClick={()=>setPeriod(p.id)} aria-pressed={period===p.id}
        className={`text-[11px] px-2.5 py-1.5 rounded-app-xs border border-white/10 whitespace-nowrap ${period===p.id?'bg-accent-gradient text-white':'bg-bgCard/30 text-textSecondary'}`}>{p.label}</button>)}
    </div>
    <div className="grid grid-cols-2 gap-2 min-w-0">
      <label className="min-w-0 text-[10px] text-textSecondary">С даты<input aria-label="С даты" type="date" value={dateFrom} onChange={e=>setDateFrom(e.target.value)} className="block mt-1 w-full min-w-0 bg-bgCard/40 text-white border border-white/10 rounded-app-xs p-1.5 text-xs"/></label>
      <label className="min-w-0 text-[10px] text-textSecondary">По дату<input aria-label="По дату" type="date" value={dateTo} onChange={e=>setDateTo(e.target.value)} className="block mt-1 w-full min-w-0 bg-bgCard/40 text-white border border-white/10 rounded-app-xs p-1.5 text-xs"/></label>
    </div>
    <select aria-label="Фильтр по офферу" value={offerId} onChange={e=>setOfferId(e.target.value)} className="w-full min-w-0 text-xs p-2 text-white bg-bgCard/40 border border-white/10 rounded-app-xs">
      <option value="">Все офферы</option>
      {offers.filter(o=>o.id).map(o=><option key={o.id!} value={o.id!}>{o.label}</option>)}
    </select>
    {error&&<p role="alert" className="text-xs text-error">{error}</p>}
    <div className="grid grid-cols-2 gap-2" aria-label="Показатели">
      {metric('Клики',summary?.clicks??0)}
      {metric('Конверсии',summary?.conversions??0)}
      {metric('CR',`${(summary?.cr??0).toFixed(2)}%`)}
      {metric('EPC',money(summary?.epc??0))}
      {metric('Заработано',money(summary?.earned??0))}
      {metric('На удержании',money(summary?.on_hold??0))}
      {metric('Доступно к выводу',money(summary?.real_withdrawable??0))}
    </div>
    <Card padding="sm" className="!p-3">
      <div className="flex flex-wrap gap-x-3 gap-y-1 text-[11px] text-textSecondary">
        <span>Ожидают: <strong className="text-white">{summary?.statuses.pending??0}</strong></span>
        <span>Подтверждены: <strong className="text-white">{summary?.statuses.approved??0}</strong></span>
        <span>Отклонены: <strong className="text-white">{summary?.statuses.rejected??0}</strong></span>
      </div>
    </Card>
    <div data-testid="click-chart"><Card padding="sm" className="!p-3">
      <div className="flex items-center gap-2 mb-2 text-xs font-semibold text-white"><TrendingUp size={14}/> Динамика кликов</div>
      <div className="h-20 flex items-end gap-0.5" aria-label="График кликов">
        {series.length?series.map((d,i)=><div key={d.date+i} title={`${d.date}: ${d.clicks} кликов`} className="flex-1 min-w-[2px] rounded-t-sm bg-accentPurple/65" style={{height:`${Math.max(3,100*d.clicks/max)}%`}}/>)
          :<p className="self-center text-xs text-textSecondary">Нет переходов за период</p>}
      </div>
    </Card></div>
    <Card padding="sm" className="!p-3">
      <div className="flex items-center justify-between gap-2">
        <h2 className="text-sm font-bold text-white">География трафика</h2>
        <select aria-label="Сортировка стран" value={sort} onChange={e=>setSort(e.target.value as 'asc'|'desc')}
          className="min-w-0 max-w-[55%] bg-bgCard/60 text-textSecondary text-[11px] border border-white/10 rounded-app-xs p-1.5">
          <option value="desc">Больше кликов</option><option value="asc">Меньше кликов</option>
        </select>
      </div>
      <div className="mt-2">
        {orderedCountries.length?orderedCountries.map((c,i)=><div key={(c.country_code||'unknown')+i} className="flex justify-between gap-2 py-2 border-b border-white/5 last:border-0 text-xs">
          <span className="text-white">{countryFlag(c.country_code)} {c.country_name}</span>
          <span className="text-textSecondary whitespace-nowrap">{c.clicks.toLocaleString('ru-RU')} кликов</span>
        </div>):<div className="text-xs text-textSecondary py-2">Нет переходов за период</div>}
      </div>
    </Card>
    <Card padding="sm" className="!p-3">
      <h2 className="text-sm font-bold text-white">Последние клики</h2>
      <div className="mt-2">
        {clicks.length?clicks.map((click,i)=><div key={click.created_at+i} className="flex justify-between gap-3 py-2 border-b border-white/5 last:border-0">
          <div className="min-w-0">
            <div className="text-xs text-white">{countryFlag(click.country_code)} {click.country_name}</div>
            {click.offer_name&&<div className="text-[10px] text-textSecondary truncate">{click.offer_name}</div>}
          </div>
          <time className="text-[10px] text-textSecondary whitespace-nowrap" dateTime={click.created_at}>{new Date(click.created_at).toLocaleString('ru-RU',{day:'2-digit',month:'2-digit',hour:'2-digit',minute:'2-digit'})}</time>
        </div>):<div className="text-xs text-textSecondary py-2">Кликов пока нет</div>}
      </div>
      {hasMore&&<button onClick={()=>void loadMore()} disabled={refreshing} className="w-full mt-2 rounded-app-xs border border-white/10 bg-bgCard/40 py-2 text-xs font-semibold text-white">Показать ещё</button>}
    </Card>
    {loading&&<p className="text-xs text-textSecondary">Загрузка статистики…</p>}
  </div>;
};
