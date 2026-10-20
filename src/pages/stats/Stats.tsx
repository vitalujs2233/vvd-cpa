import React, { useCallback, useEffect, useMemo, useState, useRef } from 'react';
import { RefreshCw, TrendingUp } from 'lucide-react';
import {readSnapshot,saveSnapshot} from '@/shared/lib/viewSnapshot';
import { authorizedFetch } from '@/shared/lib/api';
import { getTelegramUser, triggerHaptic } from '@/shared/lib/telegram';
import { Card } from '@/shared/ui/Card';

type Period = 'today'|'yesterday'|'7days'|'30days'|'all';
type Day = {date:string;clicks:number;conversions:number;income:number;pending:number;approved:number;rejected:number};
type Statuses = {pending:number;approved:number;rejected:number};
type Summary = {clicks:number;conversions:number;cr:number;epc:number;earned:number;on_hold:number;real_withdrawable:number;statuses:Statuses};
type Country = {country_code:string|null;country_name:string;clicks:number;conversions:number;pending:number;approved:number;rejected:number;income:number;hold:number;cr:number|null;epc:number|null};
type Click = {created_at:string;country_code:string|null;country_name:string;offer_name:string|null};
type Offer = {id:string|null;label:string};
const userTimezone=Intl.DateTimeFormat().resolvedOptions().timeZone || 'UTC';
const API='https://vvd-cpa-v2.onrender.com';

const countryFlag=(value:string|null)=>{
  if (!value || !/^[A-Z]{2}$/.test(value) || value==='XX' || value==='ZZ') return '🌐';
  return String.fromCodePoint(...[...value].map(letter=>127397+letter.charCodeAt(0)));
};

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
  const [sort,setSort]=useState<'clicks'|'conversions'|'income'>('clicks');
  const [countrySearch,setCountrySearch]=useState('');
  const [clicks,setClicks]=useState<Click[]>([]);
  const [offset,setOffset]=useState(0);
  const [hasMore,setHasMore]=useState(false);
  const [offers,setOffers]=useState<Offer[]>([]);
  const [loading,setLoading]=useState(false);
  const [error,setError]=useState('');
  const [refreshing,setRefreshing]=useState(false);
  const params=useMemo(()=>{
    const p=new URLSearchParams({period,tz:userTimezone});
    if(dateFrom)p.set('from',dateFrom);
    if(dateTo)p.set('to',dateTo);
    if(offerId)p.set('offer_id',offerId);
    return p;
  },[period,dateFrom,dateTo,offerId]);

  const requestVersion=useRef(0);
  const load=useCallback(async (refresh=false)=>{
    const version=++requestVersion.current;
    const id=Number(getTelegramUser().id);
    if(!id){setError('Не удалось определить Telegram');return;}
    refresh?setRefreshing(true):setLoading(true);
    setError('');
    const suffix='?'+params.toString();
    const offerParams=new URLSearchParams(params);offerParams.delete('offer_id');
    const endpoints=[
      `${API}/statistics/${id}${suffix}`,
      `${API}/statistics/${id}/countries${suffix}`,
      `${API}/statistics/${id}/breakdown?${offerParams}`,
      `${API}/statistics/${id}/clicks${suffix}&limit=10&offset=0`
    ];
    // Include the local date so relative periods cannot reuse yesterday's result.
    const keys=endpoints.map(url=>new Date().toLocaleDateString('en-CA',{timeZone:userTimezone})+url);
    const apply=[
      (a:any)=>{setSummary(a?.summary||null);setDaily(a?.statistics||[]);},
      (g:any)=>setCountries(g?.countries||[]),
      (b:any)=>setOffers(b?.offers||[]),
      (c:any)=>{setClicks(c?.clicks||[]);setOffset(c?.clicks?.length||0);setHasMore(c?.clicks?.length===10);}
    ];
    if(!refresh)keys.forEach((key,i)=>apply[i](readSnapshot(key)));
    let failed=false;
    await Promise.all(endpoints.map(async(url,i)=>{
      try {
        const response=await authorizedFetch(url,{cache:'no-store'});
        if(!response.ok)throw new Error();
        const data=await response.json();
        if(!data.success)throw new Error();
        if(requestVersion.current!==version)return;
        saveSnapshot(keys[i],data);apply[i](data);
      }catch {
        failed=true;
        if(requestVersion.current===version)setError('Часть данных не обновилась. Нажмите кнопку обновления.');
      }
    }));
    if(requestVersion.current===version){
      setLoading(false);setRefreshing(false);
      if(refresh&&!failed)triggerHaptic.success();
    }
  },[params]);

  useEffect(()=>{void load();return()=>{requestVersion.current++;};},[load]);

  const loadMore=async()=>{
    const id=Number(getTelegramUser().id);
    if(!id||refreshing||loading)return;
    const version=requestVersion.current;
    try{
      setRefreshing(true);
      const p=new URLSearchParams(params);
      p.set('limit','10');p.set('offset',String(offset));
      const response=await authorizedFetch(`${API}/statistics/${id}/clicks?${p}`,{cache:'no-store'});
      if(!response.ok)throw new Error('Не удалось загрузить переходы');
      const data=await response.json();
      if(version!==requestVersion.current)return;
      const next:Click[]=data.clicks||[];
      setClicks(old=>[...old,...next]);
      setOffset(old=>old+next.length);
      setHasMore(next.length===10);
    }catch(e){if(version===requestVersion.current)setError(e instanceof Error?e.message:'Ошибка загрузки');}
    finally{if(version===requestVersion.current)setRefreshing(false);}
  };

  const metric=(label:string,value:string|number)=>(
    <Card padding="sm" className="min-w-0 !p-2.5 flex flex-col justify-center gap-1 min-h-[69px] border-white/5">
      <span className="text-[10px] leading-tight text-textSecondary">{label}</span>
      <span className="font-bold text-white text-lg leading-tight truncate">{value}</span>
    </Card>
  );
  const series=useMemo(()=>[...daily].sort((a,b)=>a.date.localeCompare(b.date)),[daily]);
  const visibleDays=useMemo(()=>series.filter(d=>d.clicks>0),[series]);
  const maxVisible=Math.max(1,...visibleDays.map(d=>d.clicks));
  const totalVisible=series.reduce((sum,d)=>sum+d.clicks,0);
  const orderedCountries=useMemo(()=>countries.filter(c=>(c.country_name+' '+(c.country_code||'')).toLowerCase().includes(countrySearch.trim().toLowerCase())).sort((a,b)=>b[sort]-a[sort]||a.country_name.localeCompare(b.country_name,'ru')),[countries,sort,countrySearch]);

  return <div className="flex flex-col gap-3 px-3 pt-3 pb-28 select-none animate-fade-in" data-testid="compact-analysis">
    <div className="flex items-center justify-between">
      <h1 className="text-xl font-bold text-white">Анализ</h1>
      <button aria-label="Обновить статистику" onClick={()=>void load(true)} disabled={refreshing||loading} className="w-9 h-9 rounded-full border border-white/10 bg-bgCard/40 flex items-center justify-center text-textSecondary">
        <RefreshCw size={16} className={refreshing?'animate-spin':''}/>
      </button>
    </div>
    <p className="text-[10px] text-textSecondary">Часовой пояс: {userTimezone}</p>
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
    {loading&&<p role="status" className="text-xs text-textSecondary">Обновляем данные…</p>}
    {error&&<p role="alert" className="text-xs text-error">{error}</p>}
    <div className="grid grid-cols-2 gap-2" aria-label="Показатели">
      {metric('Клики',summary?.clicks??'—')}
      {metric('Конверсии',summary?.conversions??'—')}
      {metric('CR',summary?`${summary.cr.toFixed(2)}%`:'—')}
      {metric('EPC',summary?money(summary.epc):'—')}
      {metric('Заработано',summary?money(summary.earned):'—')}
      {metric('На удержании',summary?money(summary.on_hold):'—')}
      {metric('Доступно к выводу',summary?money(summary.real_withdrawable):'—')}
    </div>
    <Card padding="sm" className="!p-3">
      <div className="flex flex-wrap gap-x-3 gap-y-1 text-[11px] text-textSecondary">
        <span>Ожидают: <strong className="text-white">{summary?.statuses.pending??'—'}</strong></span>
        <span>Подтверждены: <strong className="text-white">{summary?.statuses.approved??'—'}</strong></span>
        <span>Отклонены: <strong className="text-white">{summary?.statuses.rejected??'—'}</strong></span>
      </div>
    </Card>
    <div data-testid="click-chart"><Card padding="sm" className="!p-3">
      <div className="flex items-center gap-2 mb-2 text-xs font-semibold text-white"><TrendingUp size={14}/> Динамика кликов</div>
      <div className="flex items-baseline justify-between gap-2 mb-2">
        <span className="text-[10px] text-textSecondary">За период: {totalVisible.toLocaleString('ru-RU')} кликов</span>
        <span className="text-[10px] text-textSecondary">Макс. в день: {maxVisible.toLocaleString('ru-RU')}</span>
      </div>
      <div className="h-24 w-full min-w-0 flex items-end gap-[2px] overflow-x-auto" aria-label="График кликов">
        {visibleDays.length?visibleDays.map((d,i)=><div key={d.date+i} title={`${d.date}: ${d.clicks} кликов`} aria-label={`${d.date}: ${d.clicks} кликов`} className="shrink-0 w-[7px] rounded-t-sm bg-accentGold border-t border-white/25" style={{height:`${Math.max(8,100*d.clicks/maxVisible)}%`}}/>)
          :<p className="self-center text-xs text-textSecondary">Нет переходов за период</p>}
      </div>
    </Card></div>
    <Card padding="sm" className="!p-3">
      <div className="flex items-center justify-between gap-2">
        <h2 className="text-sm font-bold text-white">География трафика</h2>
        <select aria-label="Сортировка стран" value={sort} onChange={e=>setSort(e.target.value as 'clicks'|'conversions'|'income')}
          className="min-w-0 max-w-[48%] bg-bgCard/60 text-textSecondary text-[11px] border border-white/10 rounded-app-xs p-1.5">
          <option value="clicks">По кликам</option><option value="conversions">По конверсиям</option><option value="income">По заработку</option>
        </select>
      </div>
      <input aria-label="Поиск страны" placeholder="Страна или код, например LV" value={countrySearch} onChange={e=>setCountrySearch(e.target.value)} className="w-full mt-2 p-2 text-xs bg-bgCard/40 border border-white/10 rounded-app-xs"/>
      <div className="grid grid-cols-[minmax(0,1.4fr)_0.7fr_0.8fr_1fr] gap-1 mt-3 text-[10px] text-textSecondary text-right"><span className="text-left">Страна</span><span>Клики</span><span>Конв.</span><span>Заработок</span></div>
      <div data-testid="geo-scroll-list" className="mt-1 max-h-[360px] overflow-y-auto overscroll-y-auto min-w-0" style={{WebkitOverflowScrolling:'touch'}}>
        {orderedCountries.length?orderedCountries.map(c=><details key={c.country_code||'unknown'} className="border-b border-white/5 last:border-0">
          <summary className="grid grid-cols-[minmax(0,1.4fr)_0.7fr_0.8fr_1fr] gap-1 py-3 text-[11px] text-right cursor-pointer list-none items-center">
            <span className="text-white text-left break-words">{countryFlag(c.country_code)} {c.country_name} <span className="text-textSecondary">⌄</span></span>
            <span>{c.clicks}</span><span>{c.conversions}</span><span className="text-success break-all">{money(c.income)}</span>
          </summary>
          <div className="grid grid-cols-2 gap-x-3 gap-y-2 p-2 mb-2 rounded-app-xs bg-white/5 text-[11px]">
            <span>Ожидают: <b>{c.pending}</b></span><span>Подтверждены: <b className="text-success">{c.approved}</b></span>
            <span>Отклонены: <b>{c.rejected}</b></span><span>В Hold: <b>{money(c.hold)}</b></span>
            <span>CR: <b>{c.cr==null?'—':c.cr.toFixed(2)+'%'}</b></span><span>EPC: <b>{c.epc==null?'—':money(c.epc)}</b></span>
          </div>
        </details>):<p className="text-xs text-textSecondary py-3">{countrySearch?'Страна не найдена':loading?'Загрузка…':'Нет данных за период'}</p>}
      </div>
      <p className="text-[10px] text-textSecondary mt-2">Нажми на страну — статусы, Hold, CR и EPC.</p>
    </Card>
    <Card padding="sm" className="!p-3"><details>
      <summary className="text-sm font-bold cursor-pointer">Статистика по дням</summary>
      <div className="mt-2 max-h-64 overflow-auto"><table className="w-full text-[11px] text-right"><thead className="text-textSecondary"><tr><th className="text-left py-2">Дата</th><th>Клики</th><th>Конв.</th><th>Заработок</th></tr></thead>
      <tbody>{series.map(d=><tr key={d.date} className="border-t border-white/5"><td className="text-left py-2">{d.date.split('-').reverse().join('.')}</td><td>{d.clicks}</td><td>{d.conversions}</td><td className="text-success">{money(d.income)}</td></tr>)}</tbody></table>
      {!series.length&&<p className="text-xs text-textSecondary py-2">Нет данных за период</p>}</div>
    </details></Card>
    <p className="text-[10px] text-textSecondary">Клики учитываются по дате перехода, конверсии — по дате создания конверсии. CR — конверсии / клики; EPC — заработок на клик. Доступный баланс — текущий, независимо от периода.</p>
    <Card padding="sm" className="!p-3">
      <details><summary className="text-sm font-bold text-white cursor-pointer">Последние клики</summary>
      <div className="mt-2">
        {clicks.length?clicks.map((click,i)=><div key={click.created_at+i} className="flex justify-between gap-3 py-2 border-b border-white/5 last:border-0">
          <div className="min-w-0">
            <div className="text-xs text-white">{countryFlag(click.country_code)} {click.country_name}</div>
            {click.offer_name&&<div className="text-[10px] text-textSecondary truncate">{click.offer_name}</div>}
          </div>
          <time className="text-[10px] text-textSecondary whitespace-nowrap" dateTime={click.created_at}>{new Date(click.created_at).toLocaleString('ru-RU',{day:'2-digit',month:'2-digit',hour:'2-digit',minute:'2-digit'})}</time>
        </div>):<div className="text-xs text-textSecondary py-2">Кликов пока нет</div>}
      </div>
      {hasMore&&<button onClick={()=>void loadMore()} disabled={refreshing||loading} className="w-full mt-2 rounded-app-xs border border-white/10 bg-bgCard/40 py-2 text-xs font-semibold text-white">Показать ещё</button>}
      </details>
    </Card>
    {loading&&<p className="text-xs text-textSecondary">Загрузка статистики…</p>}
  </div>;
};
