import {warmApiPage} from './pageLoadSystem';
import {readApiSnapshot,saveSnapshot} from './viewSnapshot';
import {currentSignedSession} from './browserSession';

/**
 * Warm only real, top-level views. Deep per-offer, per-model, per-user
 * and payment detail reads should run only when opened: hundreds of speculative
 * GETs used to compete with the user's visible page on the free Render worker.
 */
export async function preloadPages(id:number,partnerCode:string,role:string){
  const session=currentSignedSession();
  const admin=role==='admin'||id===232682307;
  const common=[
    '/info/published','/service-directory','/chat/banner',
    '/tools-market/ai','/tools-market/transactions','/tools-market/orders',
    '/ai-studio/my-smartlinks',`/referral/${id}`,'/support/tickets'
  ];
  const administrator=admin?[
    '/admin/users','/admin/chat/banner','/admin/chat/bans',
    '/ai-editor/admin','/admin/support/tickets',
    '/cpa/admin/networks','/cpa/admin/verticals','/cpa/admin/offers'
  ]:[];
  // Do not bulk-prefetch finance, withdrawals or other sensitive operations.
  // They keep their own signed reads and accuracy guarantees.
  const paths=[...common,...administrator];
  for(let i=0;i<paths.length;i+=3){
    if(currentSignedSession()!==session)return;
    const chunk=paths.slice(i,i+3);
    await Promise.allSettled(chunk.map(async p=>{
      if(readApiSnapshot(p)!==undefined)return;
      const result=await warmApiPage<any>(p,p.startsWith('/admin/')?12:20);
      if(p==='/support/tickets'&&session===currentSignedSession()&&result?.success===true&&Array.isArray(result.tickets))
        saveSnapshot('support:tickets',result.tickets);
    }));
  }
}
