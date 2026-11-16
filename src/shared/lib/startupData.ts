import {preloadPages} from './preloadPages';
import {warmHomeContent} from './homeWarmup';
import {API_BASE_URL, authorizedFetch} from './api';
import {CHAT_SNAPSHOT_KEY,normalizeChatMessages} from './chatSnapshot';
import {saveSnapshot} from './viewSnapshot';
import {currentSignedSession} from './browserSession';

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
  const session=currentSignedSession();
  if(pending?.session===session&&pending.id===id)return pending.promise;
  const stats=statisticsSources(id,new URLSearchParams({period:'today',tz:statisticsTimezone}));
  const requests=[
    {url:`${API_BASE_URL}/balance/${id}`,key:`balance:${id}`,valid:(d:any)=>['available','hold','paid'].every(k=>typeof d[k]==='number'&&Number.isFinite(d[k])),select:(d:any)=>d},
    {url:`${API_BASE_URL}/cpa/catalog`,key:'catalog',valid:(d:any)=>Array.isArray(d.verticals),select:(d:any)=>d.verticals},
    // These screens are visible immediately after navigation. Prepare them
    // before revealing the app rather than showing an empty wallet/catalog.
    {url:`${API_BASE_URL}/tools-market/wallet`,key:'api:/tools-market/wallet',
      valid:(d:any)=>d&&typeof d.available==='string'&&typeof d.reserved==='string',
      select:(d:any)=>d},
    {url:`${API_BASE_URL}/tools-market/catalog`,key:'api:/tools-market/catalog',
      valid:(d:any)=>Array.isArray(d.services),select:(d:any)=>d},
    {url:`${API_BASE_URL}/service-directory?surface=mini`,key:'api:/service-directory?surface=mini',
      valid:(d:any)=>Array.isArray(d.categories)&&Array.isArray(d.services),select:(d:any)=>d},
    {url:`${API_BASE_URL}/articles?surface=mini`,key:'api:/articles?surface=mini',
      valid:(d:any)=>Array.isArray(d.categories)&&Array.isArray(d.articles),select:(d:any)=>d},
    {url:`${API_BASE_URL}/chat/messages`,key:CHAT_SNAPSHOT_KEY,valid:(d:any)=>d.success===true&&Array.isArray(d.messages),select:normalizeChatMessages},
    ...stats.map((url,i)=>({url,key:statisticsSnapshotKey(url),valid:(d:any)=>d.success===true&&(i===0?!!d.summary&&Array.isArray(d.statistics):Array.isArray(d[['','countries','offers','clicks'][i]])),select:(d:any)=>d}))
  ];
  const promise=(async()=>{
    const fetchOne=async (request:typeof requests[number])=>{
      const response=await authorizedFetch(request.url,{cache:'no-store'});
      if(!response.ok)throw new StartupDataError();
      const data=await response.json();
      if(!request.valid(data)||currentSignedSession()!==session)throw new StartupDataError();
      saveSnapshot(request.key,request.select(data));
    };
    // Begin the main tabs immediately, while showing the startup screen.
    // Balance is mandatory: never render a fictitious zero or an empty dash.
    // Other tabs can use their validated public snapshots if Render is slow.
    const primary=requests.slice(0,6);
    // Handle every promise from creation to avoid unhandled errors when
    // optional requests finish before the balance response.
    const mainTasks=primary.map(request=>fetchOne(request).then(()=>true,()=>false));
    const homeTask=warmHomeContent().then(()=>true,()=>false);
    if(!await mainTasks[0])
      throw new StartupDataError('Не удалось загрузить настоящий баланс. Проверьте соединение и нажмите «Повторить».');
    if(currentSignedSession()!==session)
      throw new StartupDataError('Сессия изменилась. Откройте приложение заново.');

    // Allow the main tab catalogues a short preparation window, but do not
    // let optional feeds block launch indefinitely. Requests keep running
    // and populate snapshots for the first navigation.
    const mainSettled=Promise.allSettled([...mainTasks.slice(1),homeTask]);
    await Promise.race([
      mainSettled,
      new Promise<void>(resolve=>window.setTimeout(resolve,1800))
    ]);
    if(currentSignedSession()!==session)
      throw new StartupDataError('Сессия изменилась. Откройте приложение заново.');

    // Start analysis and community feeds in limited batches. Avoid sending
    // all statistics and deep admin queries to the free Render worker at once.
    const secondary=requests.slice(6);
    const runSecondary=async()=>{
      for(let i=0;i<secondary.length;i+=2) {
        if(currentSignedSession()!==session)return;
        await Promise.allSettled(secondary.slice(i,i+2).map(fetchOne));
      }
    };
    // Wait for the first batch to finish before spending server capacity on
    // statistics or individual cards. Otherwise the first navigation competes
    // with a flood of speculative network requests.
    void mainSettled.then(async()=>{
      if(currentSignedSession()!==session)return;
      await runSecondary();
      if(currentSignedSession()!==session)return;
      window.setTimeout(()=>{
        if(currentSignedSession()===session)
          void preloadPages(id,partnerCode,role).catch(()=>{});
      },500);
    });
  })().finally(()=>{if(pending?.promise===promise)pending=undefined;});
  pending={session,id,promise};
  return promise;
}
