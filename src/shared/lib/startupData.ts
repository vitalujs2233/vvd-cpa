import {preloadPages} from './preloadPages';
import {warmHomeContent} from './homeWarmup';
import {API_BASE_URL, authorizedFetch} from './api';
import {CHAT_SNAPSHOT_KEY,normalizeChatMessages} from './chatSnapshot';
import {saveSnapshot} from './viewSnapshot';

export const statisticsTimezone = Intl.DateTimeFormat().resolvedOptions().timeZone || 'UTC';
export function statisticsSources(id:number, params:URLSearchParams) {
  const suffix='?'+params.toString();
  const offers=new URLSearchParams(params);offers.delete('offer_id');
  return [
    `${API_BASE_URL}/statistics/${id}${suffix}`,
    `${API_BASE_URL}/statistics/${id}/countries${suffix}`,
    `${API_BASE_URL}/statistics/${id}/breakdown?${offers}`,
    `${API_BASE_URL}/statistics/${id}/clicks${suffix}&limit=10&offset=0`
  ];
}
export const statisticsSnapshotKey=(url:string)=>
  new Date().toLocaleDateString('en-CA',{timeZone:statisticsTimezone})+url;

export class StartupDataError extends Error {}
let pending:{session:string;id:number;promise:Promise<void>}|undefined;
export function preloadStartupData(id:number,partnerCode='',role='user'):Promise<void> {
  const session=window.Telegram?.WebApp?.initData||'';
  if(pending?.session===session&&pending.id===id)return pending.promise;
  const stats=statisticsSources(id,new URLSearchParams({period:'today',tz:statisticsTimezone}));
  const requests=[
    {url:`${API_BASE_URL}/balance/${id}`,key:`balance:${id}`,valid:(d:any)=>['available','hold','paid'].every(k=>typeof d[k]==='number'&&Number.isFinite(d[k])),select:(d:any)=>d},
    {url:`${API_BASE_URL}/cpa/catalog`,key:'catalog',valid:(d:any)=>Array.isArray(d.verticals),select:(d:any)=>d.verticals},
    {url:`${API_BASE_URL}/chat/messages`,key:CHAT_SNAPSHOT_KEY,valid:(d:any)=>d.success===true&&Array.isArray(d.messages),select:normalizeChatMessages},
    ...stats.map((url,i)=>({url,key:statisticsSnapshotKey(url),valid:(d:any)=>d.success===true&&(i===0?!!d.summary&&Array.isArray(d.statistics):Array.isArray(d[['','countries','offers','clicks'][i]])),select:(d:any)=>d}))
  ];
  const promise=(async()=>{
    const fetchOne=async (request:typeof requests[number])=>{
      const response=await authorizedFetch(request.url,{cache:'no-store'});
      if(!response.ok)throw new StartupDataError();
      const data=await response.json();
      if(!request.valid(data)||window.Telegram?.WebApp?.initData!==session)throw new StartupDataError();
      saveSnapshot(request.key,request.select(data));
    };
    const results=await Promise.allSettled(requests.slice(0,2).map(fetchOne));
    if(results.some(result=>result.status==='rejected'))
      throw new StartupDataError('Не удалось загрузить данные. Проверьте соединение и нажмите «Повторить».');
    if(window.Telegram?.WebApp?.initData!==session)throw new StartupDataError('Сессия изменилась. Откройте приложение заново.');
    // Keep secondary pages warm without blocking the first visible screen.
    void Promise.allSettled(requests.slice(2).map(fetchOne));
    void preloadPages(id,partnerCode,role).catch(()=>{});
    await warmHomeContent();
  })().finally(()=>{if(pending?.promise===promise)pending=undefined;});
  pending={session,id,promise};
  return promise;
}
