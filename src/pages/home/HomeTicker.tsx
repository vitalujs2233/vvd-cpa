import React,{useEffect,useRef,useState} from 'react';
import {useNavigate} from 'react-router-dom';
import {Megaphone} from 'lucide-react';
import {apiRequest} from '@/shared/lib/api';
import './HomeTicker.css';

export type TickerItem={id:string;text:string;color:'gold'|'green'|'red';target_url:string;is_active:boolean;position:number};
export type TickerFeed={enabled:boolean;items:TickerItem[]};
export const tickerColor=(color:TickerItem['color'])=>color==='green'?'#6DE0A0':color==='red'?'#FF8585':'#F0C767';

export const navigateTicker=(url:string,navigate:(path:string)=>void)=>{
 if(!url)return;
 if(url.startsWith('/')&&!url.startsWith('//')&&!url.includes('\\')){navigate(url);return}
 try{
  const parsed=new URL(url);
  if(parsed.protocol==='https:'){
   const telegram=window.Telegram?.WebApp as (TelegramWebApp & {openTelegramLink?:(url:string)=>void;openLink?:(url:string)=>void})|undefined;
   if(parsed.hostname==='t.me'||parsed.hostname==='telegram.me'){
    if(telegram?.openTelegramLink)telegram.openTelegramLink(url);else window.open(url,'_blank','noopener,noreferrer');
   }else if(telegram?.openLink)telegram.openLink(url);else window.open(url,'_blank','noopener,noreferrer');
  }else if(parsed.protocol==='tg:'&&['resolve','join','user','addstickers'].includes(parsed.hostname)){
   window.location.href=url;
  }
 }catch{/* Ignore malformed links */}
};

let cachedTicker:TickerFeed|undefined;
export const HomeTicker:React.FC=()=>{
 const [feed,setFeed]=useState<TickerFeed>(()=>cachedTicker||{enabled:false,items:[]});
 const [duration,setDuration]=useState(20);
 const [reduced,setReduced]=useState(false);
 const group=useRef<HTMLDivElement>(null);
 const navigate=useNavigate();
 useEffect(()=>{
  let live=true;
  const load=()=>apiRequest<TickerFeed>('/home-ticker/published').then(result=>{if(live){cachedTicker=result;setFeed(result)}}).catch(()=>{});
  void load();
  const onFocus=()=>{void load()};
  document.addEventListener('visibilitychange',onFocus);
  const media=window.matchMedia('(prefers-reduced-motion: reduce)');
  const sync=()=>setReduced(media.matches);sync();media.addEventListener?.('change',sync);
  return()=>{live=false;document.removeEventListener('visibilitychange',onFocus);media.removeEventListener?.('change',sync)};
 },[]);
 const items=feed.items.filter(item=>item.is_active);
 useEffect(()=>{
  if(!feed.enabled||!items.length||!group.current||reduced)return;
  const measure=()=>{const width=group.current?.getBoundingClientRect().width||0;if(width)setDuration(Math.max(8,width/40))};
  measure();
  const observer=new ResizeObserver(measure);
  observer.observe(group.current);
  return()=>observer.disconnect();
 },[feed,reduced]);
 if(!feed.enabled||!items.length)return null;
 const renderGroup=(duplicate:boolean)=><div ref={duplicate?undefined:group} className="vvd-ticker-group" aria-hidden={duplicate}>
  {items.map(item=><React.Fragment key={item.id}>
   <span className="vvd-ticker-separator" aria-hidden="true">✦</span>
   {item.target_url?<button type="button" tabIndex={duplicate?-1:0} onClick={()=>navigateTicker(item.target_url,navigate)} className="vvd-ticker-message" style={{color:tickerColor(item.color)}}>{item.text}</button>:<span className="vvd-ticker-message" style={{color:tickerColor(item.color)}}>{item.text}</span>}
  </React.Fragment>)}
 </div>;
 return <section aria-label="Объявления VVD CPA" className="vvd-ticker">
  <Megaphone size={14} className="vvd-ticker-icon" aria-hidden="true"/>
  <div className="vvd-ticker-viewport">
   {reduced?<div className="vvd-ticker-static">{items.map(item=><span key={item.id} style={{color:tickerColor(item.color)}}>✦ {item.text}　</span>)}</div>:
   <div className="vvd-ticker-track" style={{'--vvd-ticker-duration':duration+'s'} as React.CSSProperties}>{renderGroup(false)}{renderGroup(true)}</div>}
  </div>
 </section>;
};
