import React,{useEffect,useRef,useState} from 'react';
import {useNavigate} from 'react-router-dom';
import {apiRequest,API_BASE_URL} from '@/shared/lib/api';

export type HomeAd={id:string;title:string;image_url:string;target_url:string;position:number;is_active:boolean;updated_at:string};
type Feed={items:HomeAd[];autoplay:boolean};

const openTarget=(url:string,navigate:(path:string)=>void)=>{
 if(!url)return;
 if(url.startsWith('/')&&!url.startsWith('//')&&!url.includes('\\')){navigate(url);return;}
 try {
  const parsed=new URL(url);
  if(parsed.protocol==='https:'){
   if(parsed.hostname==='t.me'||parsed.hostname==='telegram.me'){
    const telegram=window.Telegram?.WebApp as (TelegramWebApp & {openTelegramLink?:(url:string)=>void;openLink?:(url:string)=>void})|undefined;
    if(telegram?.openTelegramLink)telegram.openTelegramLink(url);
    else window.open(url,'_blank','noopener,noreferrer');
   }else {const telegram=window.Telegram?.WebApp as (TelegramWebApp & {openLink?:(url:string)=>void})|undefined;
    if(telegram?.openLink)telegram.openLink(url);
   else window.open(url,'_blank','noopener,noreferrer');}
  }else if(parsed.protocol==='tg:'&&['resolve','join','user','addstickers'].includes(parsed.hostname)){
   window.location.href=url;
  }
 }catch{/* Ignore invalid targets. */}
};

export const HomeAdCarousel:React.FC=()=>{
 const navigate=useNavigate();
 const [feed,setFeed]=useState<Feed>({items:[],autoplay:false});
 const [active,setActive]=useState(0);
 const [failed,setFailed]=useState<string[]>([]);
 const rail=useRef<HTMLDivElement>(null);
 const interacting=useRef(false);
 const timer=useRef<ReturnType<typeof setTimeout>|null>(null);
 const [reducedMotion,setReducedMotion]=useState(false);
 useEffect(()=>{
  let live=true;
  apiRequest<Feed>('/home-ads/published').then(data=>{if(live)setFeed({items:data.items.slice(0,4),autoplay:data.autoplay})}).catch(()=>{});
  const query=window.matchMedia('(prefers-reduced-motion: reduce)');
  const sync=()=>setReducedMotion(query.matches);
  sync();query.addEventListener?.('change',sync);
  return()=>{live=false;query.removeEventListener?.('change',sync)};
 },[]);
 const count=feed.items.length;
 const go=(index:number)=>{
  const el=rail.current;
  if(!el)return;
  const child=el.children[index] as HTMLElement|undefined;
  if(child)el.scrollTo({left:child.offsetLeft-(el.children[0] as HTMLElement).offsetLeft,behavior:reducedMotion?'auto':'smooth'});
  setActive(index);
 };
 useEffect(()=>{
  if(!feed.autoplay||reducedMotion||count<2||interacting.current)return;
  timer.current=setTimeout(()=>go((active+1)%count),5000);
  return()=>{if(timer.current)clearTimeout(timer.current)};
 },[active,count,feed.autoplay,reducedMotion]);
 const updateActive=()=>{
  const el=rail.current;
  if(!el||!el.children.length)return;
  const first=(el.children[0] as HTMLElement).offsetLeft;
  let best=0,dist=Infinity;
  Array.from(el.children).forEach((child,index)=>{
   const d=Math.abs((child as HTMLElement).offsetLeft-first-el.scrollLeft);
   if(d<dist){dist=d;best=index}
  });
  setActive(best);
 };
 if(!count)return null;
 return <section aria-label="Рекламные баннеры" className="min-w-0 w-full">
  <div ref={rail} onScroll={updateActive} onTouchStart={()=>{interacting.current=true;if(timer.current)clearTimeout(timer.current)}} onPointerDown={()=>{interacting.current=true;if(timer.current)clearTimeout(timer.current)}} className="flex gap-3 overflow-x-auto snap-x snap-mandatory overscroll-x-contain scroll-smooth [scrollbar-width:none] [&::-webkit-scrollbar]:hidden" style={{touchAction:'pan-x pan-y'}}>
   {feed.items.map(b=><div key={b.id} className={"relative shrink-0 "+(count===1?"w-full":"w-[91%]")+" aspect-[3/1] snap-start overflow-hidden rounded-card bg-bgCard"}>
    {failed.includes(b.id)?<div className="flex h-full items-center justify-center text-xs text-textSecondary">Изображение недоступно</div>:<img src={API_BASE_URL+b.image_url+'?v='+encodeURIComponent(b.updated_at)} alt={b.title} loading="lazy" decoding="async" className="block w-full h-full object-contain" onError={()=>setFailed(s=>[...s,b.id])}/>}
    {b.target_url&&<button type="button" aria-label={'Открыть: '+b.title} onClick={()=>openTarget(b.target_url,navigate)} className="absolute inset-0 w-full h-full cursor-pointer" />}
   </div>)}
  </div>
  {count>1&&<div className="flex justify-center gap-2 pt-3" aria-label="Страницы баннеров">{feed.items.map((b,i)=><button key={b.id} type="button" onClick={()=>{interacting.current=true;go(i)}} aria-label={'Баннер '+(i+1)} aria-current={active===i?'true':undefined} className={'h-2 rounded-full transition-all '+(active===i?'w-4 bg-accentGoldBright':'w-2 bg-white/20')}/>)}</div>}
 </section>;
};
