import React,{useEffect,useState} from 'react';
import {API_BASE_URL,authorizedFetch} from '@/shared/lib/api';
import {getTelegramUser} from '@/shared/lib/telegram';
import {readSnapshot,saveSnapshot} from '@/shared/lib/viewSnapshot';
import {Card} from '@/shared/ui/Card';
import {trafficFields} from '../offers/trafficTags';

type Row={value:string|null;clicks:number;conversions:number;pending:number;approved:number;rejected:number;pending_income?:number;income:number;hold:number;cr:number|null;epc:number|null};
type Report={rows:Row[];has_more:boolean;success:boolean};
const money=(n:number)=>'$'+n.toFixed(2);
export const TrafficSubs:React.FC<{params:URLSearchParams;refreshKey:number}>=({params,refreshKey})=>{
  const [field,setField]=useState('sub1');
  const [search,setSearch]=useState('');
  const [debounced,setDebounced]=useState('');
  const [page,setPage]=useState(0);
  const [retry,setRetry]=useState(0);
  const [result,setResult]=useState<{key:string;data:Report}|null>(null);
  const [loading,setLoading]=useState(true);
  const [error,setError]=useState('');
  const uid=Number(getTelegramUser().id);
  // Scope pagination to its filters; changing a period cannot load an old offset.
  const filterKey=params.toString()+'|'+field+'|'+debounced;
  const [pageFilter,setPageFilter]=useState(filterKey);
  const currentPage=pageFilter===filterKey?page:0;
  const query=new URLSearchParams(params);
  query.set('field',field);query.set('search',debounced);query.set('limit','50');query.set('offset',String(currentPage*50));
  const path=`/statistics/${uid}/subs?${query}`;
  const key='traffic-subs:'+path;
  const data=result?.key===key?result.data:readSnapshot<Report>(key);
  useEffect(()=>{const t=setTimeout(()=>setDebounced(search.trim()),300);return()=>clearTimeout(t);},[search]);
  useEffect(()=>{
    const controller=new AbortController();let active=true;
    const session=window.Telegram?.WebApp?.initData;
    setLoading(true);setError('');
    (async()=>{
      try{
        const response=await authorizedFetch(API_BASE_URL+path,{signal:controller.signal,cache:'no-store'});
        if(!response.ok)throw new Error();
        const report:Report=await response.json();
        if(!report.success||!Array.isArray(report.rows))throw new Error();
        if(!active||session!==window.Telegram?.WebApp?.initData)return;
        saveSnapshot(key,report);setResult({key,data:report});
      }catch{if(active)setError('Не удалось обновить метки.');}
      finally{if(active)setLoading(false);}
    })();
    return()=>{active=false;controller.abort();};
  },[path,key,refreshKey,retry]);
  const go=(next:number)=>{setPageFilter(filterKey);setPage(next);};
  return <Card padding="sm" className="!p-3 min-w-0">
    <div className="flex items-center justify-between gap-2">
      <h2 className="text-sm font-bold">По меткам</h2>
      <select aria-label="Метка для группировки" value={field} onChange={e=>setField(e.target.value)} className="text-xs bg-bgCard/60 border border-white/10 rounded-app-xs p-1.5">
        {trafficFields.map(f=><option key={f} value={f}>{f}</option>)}
      </select>
    </div>
    <input aria-label="Поиск значения метки" placeholder="Значение метки, например tiktok" value={search} maxLength={128} onChange={e=>setSearch(e.target.value)} className="w-full mt-2 p-2 text-xs bg-bgCard/40 border border-white/10 rounded-app-xs"/>
    {error&&<div role="alert" className="text-xs text-error mt-2">{error} <button type="button" onClick={()=>setRetry(x=>x+1)} className="px-2 py-1 rounded-app-xs border border-white/10">Повторить</button></div>}
    {loading&&<p role="status" className="text-[10px] text-textSecondary mt-2">Обновляем метки…</p>}
    <div className="overflow-x-auto max-h-80 mt-2" tabIndex={0} aria-label="Статистика по меткам, прокрутка вбок">
      <table className="w-full text-[11px] text-right whitespace-nowrap">
        <thead className="text-textSecondary"><tr>{['Значение','Клики','Конв.','CR','Заработок','Ожидает подтверждения','EPC','Ожидают','Подтв.','Отклонены','Hold'].map((h,i)=><th key={h} className={'px-2 py-2 font-normal '+(i===0?'text-left':'')}>{h}</th>)}</tr></thead>
        <tbody>{data?.rows.map(r=><tr key={r.value===null?'empty':'tag:'+r.value} className="border-t border-white/5">
          <td className="px-2 py-2 text-left whitespace-normal break-words min-w-[110px] max-w-[180px] select-text">{r.value??'Без метки'}</td>
          <td className="px-2">{r.clicks}</td><td className="px-2">{r.conversions}</td><td className="px-2">{r.cr===null?'—':r.cr.toFixed(2)+'%'}</td>
          <td className="px-2 text-success">{money(r.income)}</td><td className="px-2 text-accentGold">{money(r.pending_income??0)}</td><td className="px-2">{r.epc===null?'—':money(r.epc)}</td>
          <td className="px-2">{r.pending}</td><td className="px-2">{r.approved}</td><td className="px-2">{r.rejected}</td><td className="px-2">{money(r.hold)}</td>
        </tr>)}</tbody>
      </table>
    </div>
    {!loading&&!error&&!data?.rows.length&&<p className="text-xs text-textSecondary py-2">Нет данных по выбранным условиям</p>}
    {(currentPage>0||data?.has_more)&&<div className="flex justify-between items-center mt-2 text-xs">
      <button type="button" disabled={loading||currentPage===0} onClick={()=>go(currentPage-1)} className="p-2 rounded-app-xs border border-white/10 disabled:opacity-40">Назад</button>
      <span>{currentPage+1}</span>
      <button type="button" disabled={loading||!data?.has_more} onClick={()=>go(currentPage+1)} className="p-2 rounded-app-xs border border-white/10 disabled:opacity-40">Далее</button>
    </div>}
    <p className="text-[10px] text-textSecondary mt-2">Период и оффер — из фильтров выше. Таблица прокручивается вбок. Старые переходы без параметров показаны как «Без метки».</p>
  </Card>;
};
