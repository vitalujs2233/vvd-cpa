import {apiRequest,API_BASE_URL} from './api';
import {readSnapshot,saveSnapshot} from './viewSnapshot';

type ImageItem={image_url?:string|null;updated_at?:string};
type Feed={items:ImageItem[]};
const feeds=[
 {path:'/home-ads/published',key:'home:ads'},
 {path:'/home-info/published',key:'home:info'},
 {path:'/home-ticker/published',key:'home:ticker'}
] as const;

const imageUrl=(item:ImageItem)=>API_BASE_URL+item.image_url+'?v='+encodeURIComponent(item.updated_at||'');
const preloadImage=(url:string)=>new Promise<void>(resolve=>{
 const img=new Image();
 let finished=false;
 const done=()=>{if(!finished){finished=true;resolve();}};
 img.onload=done;img.onerror=done;
 img.src=url;
 if(img.complete)done();
});

// Prepare the complete visible home before revealing it on first login.
// A slow image or unavailable optional feed must not trap the user on the loader.
export async function warmHomeContent():Promise<void>{
 const cached=feeds.map(feed=>({key:feed.key,data:readSnapshot<Feed>(feed.key)}));
 const hasCachedHome=cached.every(feed=>feed.data!==undefined);
 const refresh=Promise.allSettled(feeds.map(async feed=>{
  const data=await apiRequest<Feed>(feed.path);
  saveSnapshot(feed.key,data);
  return {key:feed.key,data};
 }));
 const warmImages=(entries:Array<{key:string;data:Feed|undefined}>)=>{
  const urls:string[]=[];
  for(const {key,data} of entries){
   if(!data)continue;
   if(key==='home:ads')urls.push(...(data.items||[]).slice(0,2).filter(x=>x.image_url).map(imageUrl));
   if(key==='home:info')urls.push(...(data.items||[]).filter(x=>x.image_url).map(imageUrl));
  }
  void Promise.allSettled(urls.slice(0,3).map(preloadImage));
 };
 if(hasCachedHome){
  // All published home blocks are immediately available. Refresh in the
  // background instead of gating every later launch on three API calls.
  warmImages(cached);
  void refresh.then(results=>warmImages(results.flatMap(r=>r.status==='fulfilled'?[r.value]:[])));
  return;
 }
 const results=await refresh;
 warmImages(results.flatMap(r=>r.status==='fulfilled'?[r.value]:[]));
}
export const cachedHomeFeed=<T>(key:string):T|undefined=>readSnapshot<T>(key);
