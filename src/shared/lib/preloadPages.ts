import {warmApiPage} from './pageLoadSystem';
import {readApiSnapshot,readSnapshot,saveSnapshot} from './viewSnapshot';
import {currentSignedSession} from './browserSession';

// Limit parallel reads: warming pages must not flood the database connection pool.
async function parallel<T>(items:T[],fn:(item:T)=>Promise<void>) {
  let next=0;
  await Promise.all(Array.from({length:Math.min(2,items.length)},async()=>{
    while(next<items.length)await fn(items[next++]);
  }));
}
export async function preloadPages(id:number,partnerCode:string,role:string) {
  const session=currentSignedSession();
  const failures:string[]=[];
  const read=async(path:string,required=false)=>{
    const priority=path.startsWith('/referral/')||path==='/info/published'?42:
      path.startsWith('/tools-market/')||path.startsWith('/withdrawals/')?36:
      path.startsWith('/admin/')?22:18;
    try{
      const data=await warmApiPage<any>(path,priority);
      if(session!==currentSignedSession())throw new Error('Session changed');
      return data;
    }catch{if(required)failures.push(path);return undefined;}
  };
  const paths=[`/referral/${id}`,'/tools-market/wallet','/tools-market/catalog',
    '/tools-market/transactions','/tools-market/orders','/tools-market/ai','/ai-studio/my-smartlinks','/chat/banner','/info/published','/service-directory','/support/tickets'];
  if(partnerCode)paths.unshift('/withdrawals/'+encodeURIComponent(partnerCode));
  const admin=role==='admin'||id===232682307;
  if(admin)paths.push('/admin/chat/banner','/admin/users','/admin/finance','/admin/withdrawals','/admin/chat/bans',
    '/cpa/admin/networks','/cpa/admin/verticals','/cpa/admin/offers',
    '/ai-editor/admin','/admin/support/tickets');
  // Startup already fetched some of these within this signed session.
  // Reuse them instead of fetching the same wallet/catalog again immediately.
  const primaryWarmup=parallel(paths,async p=>{
    if(readApiSnapshot(p)!==undefined)return;
    const loaded=await read(p,p.startsWith('/withdrawals/'));
    if(p==='/support/tickets'&&loaded?.success===true&&Array.isArray(loaded.tickets))
      saveSnapshot('support:tickets',loaded.tickets);
  });
  const catalog=readSnapshot<any[]>('catalog')||[];
  const linkPaths:string[]=[];
  const catalogWarmup=parallel(catalog,async v=>{
    const path='/cpa/catalog/'+encodeURIComponent(v.slug);
    const data=await read(path,true);
    if(!data)return;
    for(const offer of data.offers||[])saveSnapshot('api:'+path+'/'+encodeURIComponent(offer.id),{vertical:data.vertical,offer});
    if(data.vertical?.cpa_link_allowed)linkPaths.push(...(data.offers||[]).map((o:any)=>'/cpa/links/'+encodeURIComponent(o.id)));
  });
  await catalogWarmup;
  const linksWarmup=parallel(linkPaths,async p=>{await read(p);});
  await primaryWarmup;
  const models=readSnapshot<any>('api:/tools-market/ai')?.models||[];
  const modelPaths=models.flatMap((m:any)=>['/tools-market/ai/'+m.id,...['settings','photos','stats'].map(s=>'/ai-studio/models/'+m.id+'/'+s)]);
  await parallel(modelPaths,async(p:string)=>{await read(p);});
  // Do not preload every customer's sensitive admin detail on every login.
  // Those views fetch the signed, current record when the administrator opens
  // them. Warming all users overwhelms the small API worker unnecessarily.
  if(admin){
    const networks=readSnapshot<any>('api:/cpa/admin/networks')?.items||[];
    await parallel(networks.slice(0,4),async(n:any)=>{
      await read('/cpa/admin/networks/'+n.id+'/postback');
    });
  }
  await linksWarmup;
  if(failures.length)throw new Error('Не удалось подготовить историю выплат или каталог офферов. Повторите загрузку.');
}
