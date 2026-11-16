import {currentSignedSession} from './browserSession';
// Session-scoped private snapshots never persist between launches.
// Published, user-independent content may be reused while it refreshes.
let session = '';
const snapshots = new Map<string, unknown>();
const PUBLIC_CACHE_KEY='vvd_public_snapshots_v1';
const PUBLIC_TTL_MS=10*60*1000;
const publicKeys=new Set([
  'catalog','home:ads','home:info','home:ticker',
  'api:/cpa/catalog','api:/info/published',
  'api:/service-directory?surface=mini','api:/articles?surface=mini'
]);
type PublicEntry={at:number;value:unknown};
let publicCache:Record<string,PublicEntry>|null=null;
function persisted():Record<string,PublicEntry> {
  if(publicCache)return publicCache;
  try{
    const stored=JSON.parse(localStorage.getItem(PUBLIC_CACHE_KEY)||'{}');
    publicCache=stored&&typeof stored==='object'&&!Array.isArray(stored)?stored:{};
  }catch{publicCache={};}
  return publicCache!;
}
function scope() {
  const current = currentSignedSession();
  if (current !== session) { snapshots.clear(); session = current; }
}
export function readSnapshot<T>(key: string): T | undefined {
  scope();
  const inMemory=snapshots.get(key);
  if(inMemory!==undefined)return inMemory as T;
  if(!publicKeys.has(key))return undefined;
  const entry=persisted()[key];
  if(!entry||typeof entry.at!=='number'||Date.now()-entry.at>PUBLIC_TTL_MS||entry.at>Date.now())return undefined;
  snapshots.set(key,entry.value);
  return entry.value as T;
}
export function saveSnapshot<T>(key: string, value: T) {
  scope();
  if (snapshots.size >= 1000 && !snapshots.has(key)) snapshots.delete(snapshots.keys().next().value!);
  snapshots.set(key, value);
  if(publicKeys.has(key)){
    const data=persisted();
    data[key]={at:Date.now(),value};
    try{localStorage.setItem(PUBLIC_CACHE_KEY,JSON.stringify(data));}catch{/* Storage may be unavailable or full. */}
  }
}
export const readApiSnapshot=<T=any>(path:string)=>readSnapshot<T>('api:'+path);
