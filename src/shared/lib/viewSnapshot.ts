import {currentSignedSession} from './browserSession';

// Public published content persists between launches; account-scoped snapshots
// stay in memory and are cleared on every signed Telegram session change.
// In particular balances, history, support, admin and stats NEVER go to disk.
let session='';
const snapshots=new Map<string,unknown>();
const PUBLIC_CACHE_KEY='vvd_public_snapshots_v2';
const FRESH_MS=24*60*60*1000;
const OFFER_FRESH_MS=60*60*1000;
const ageLimit=(key:string)=>key.startsWith('api:/cpa/catalog/')?OFFER_FRESH_MS:FRESH_MS;
const MAX_ITEMS=85;
const MAX_BYTES=850_000;
const publicKeys=new Set([
  'catalog','home:ads','home:info','home:ticker',
  'api:/cpa/catalog','api:/info/published',
  'api:/home-ads/published','api:/home-info/published','api:/home-ticker/published',
  'api:/service-directory','api:/service-directory?surface=mini',
  'api:/articles?surface=mini','api:/articles?surface=web'
]);
const isPublic=(key:string)=>publicKeys.has(key)||
  /^api:\/articles\/[a-z0-9][a-z0-9-]{0,130}\?surface=(mini|web)$/.test(key)||
  // Only published, non-personal catalogue descriptions. Tracking links and
  // user-specific state are never written to persistent storage.
  /^api:\/cpa\/catalog\/[a-z0-9][a-z0-9_-]{0,100}(?:\/[a-zA-Z0-9_-]{1,100})?$/.test(key);
type Entry={at:number;value:unknown};
let publicCache:Record<string,Entry>|null=null;
function persisted():Record<string,Entry>{
  if(publicCache)return publicCache;
  try{
    // Reuse existing published snapshots when upgrading from the original
    // cache format, so the first launch after this release stays populated.
    const raw=localStorage.getItem(PUBLIC_CACHE_KEY)||
      localStorage.getItem('vvd_public_snapshots_v1')||'{}';
    const parsed=JSON.parse(raw);
    publicCache=parsed&&typeof parsed==='object'&&!Array.isArray(parsed)?parsed:{};
  }catch{publicCache={};}
  return publicCache!;
}
function scope(){
  const current=currentSignedSession();
  if(current!==session){
    snapshots.clear();
    session=current;
  }
}
export function readSnapshot<T>(key:string):T|undefined{
  scope();
  const inMemory=snapshots.get(key);
  if(inMemory!==undefined)return inMemory as T;
  if(!isPublic(key))return undefined;
  const entry=persisted()[key];
  if(!entry||typeof entry.at!=='number'||entry.at>Date.now()||
     Date.now()-entry.at>ageLimit(key))return undefined;
  snapshots.set(key,entry.value);
  return entry.value as T;
}
export function saveSnapshot<T>(key:string,value:T){
  scope();
  if(snapshots.size>=800&&!snapshots.has(key))
    snapshots.delete(snapshots.keys().next().value!);
  snapshots.set(key,value);
  if(!isPublic(key))return;
  // Prevent storing large media, maliciously oversized data or unrelated
  // private payloads in persistent storage. Only allowlisted read keys persist.
  try{
    const serialized=JSON.stringify(value);
    if(serialized.length>180_000)return;
    const data=persisted();
    data[key]={at:Date.now(),value};
    const sorted=Object.entries(data).filter(([,v])=>
      !!v&&typeof v.at==='number'&&Date.now()-v.at<FRESH_MS
    ).sort((a,b)=>b[1].at-a[1].at).slice(0,MAX_ITEMS);
    const compact:Record<string,Entry>={};
    for(const [k,v] of sorted)compact[k]=v;
    let content=JSON.stringify(compact);
    while(content.length>MAX_BYTES&&sorted.length>1){
      sorted.pop();
      const keep:Record<string,Entry>={};
      for(const [k,v] of sorted)keep[k]=v;
      content=JSON.stringify(keep);
    }
    localStorage.setItem(PUBLIC_CACHE_KEY,content);
    publicCache=JSON.parse(content);
  }catch{/* Telegram WebView may prohibit local storage or reach its quota. */}
}
export const readApiSnapshot=<T=any>(path:string)=>readSnapshot<T>('api:'+path);
