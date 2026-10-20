import {apiRequest} from './api';
import {readSnapshot,saveSnapshot} from './viewSnapshot';

// Limit parallel reads: warming pages must not flood the database connection pool.
async function parallel<T>(items:T[],fn:(item:T)=>Promise<void>) {
  let next=0;
  await Promise.all(Array.from({length:Math.min(4,items.length)},async()=>{
    while(next<items.length)await fn(items[next++]);
  }));
}
export async function preloadPages(id:number,partnerCode:string,role:string) {
  const session=window.Telegram?.WebApp?.initData;
  const failures:string[]=[];
  const read=async(path:string,required=false)=>{
    try{const data=await apiRequest<any>(path);if(session!==window.Telegram?.WebApp?.initData)throw new Error('Session changed');return data;}
    catch {if(required)failures.push(path);return undefined;}
  };
  const paths=[`/referral/${id}`,'/tools-market/wallet','/tools-market/catalog',
    '/tools-market/transactions','/tools-market/orders','/tools-market/ai','/ai-studio/my-smartlinks','/chat/banner'];
  if(partnerCode)paths.unshift('/withdrawals/'+encodeURIComponent(partnerCode));
  const admin=role==='admin'||id===232682307;
  if(admin)paths.push('/admin/users','/admin/finance','/admin/withdrawals','/admin/chat/bans',
    '/cpa/admin/networks','/cpa/admin/verticals','/cpa/admin/offers');
  await parallel(paths,async p=>{await read(p,p.startsWith('/withdrawals/'));});
  const catalog=readSnapshot<any[]>('catalog')||[];
  const linkPaths:string[]=[];
  await parallel(catalog,async v=>{
    const path='/cpa/catalog/'+encodeURIComponent(v.slug);
    const data=await read(path,true);
    if(!data)return;
    for(const offer of data.offers||[])saveSnapshot('api:'+path+'/'+encodeURIComponent(offer.id),{vertical:data.vertical,offer});
    if(data.vertical?.cpa_link_allowed)linkPaths.push(...(data.offers||[]).map((o:any)=>'/cpa/links/'+encodeURIComponent(o.id)));
  });
  await parallel(linkPaths,async p=>{await read(p);});
  const models=readSnapshot<any>('api:/tools-market/ai')?.models||[];
  const modelPaths=models.flatMap((m:any)=>['/tools-market/ai/'+m.id,...['settings','photos','stats'].map(s=>'/ai-studio/models/'+m.id+'/'+s)]);
  await parallel(modelPaths,async(p:string)=>{await read(p);});
  if(admin){
    const users=readSnapshot<any>('api:/admin/users')?.users||[];
    const details=users.flatMap((u:any)=>[
      '/statistics/'+u.telegram_id+'/countries',
      ...(u.partner_code?['/admin/cpa/partners/'+encodeURIComponent(u.partner_code)+'/hold']:[])
    ]);
    const networks=readSnapshot<any>('api:/cpa/admin/networks')?.items||[];
    details.push(...networks.map((n:any)=>'/cpa/admin/networks/'+n.id+'/postback'));
    await parallel(details,async(p:string)=>{await read(p);});
  }
  if(failures.length)throw new Error('Не удалось подготовить историю выплат или каталог офферов. Повторите загрузку.');
}
