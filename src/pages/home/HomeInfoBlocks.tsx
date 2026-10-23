import React,{useEffect,useState} from 'react';
import {useNavigate} from 'react-router-dom';
import {apiRequest,API_BASE_URL} from '@/shared/lib/api';
import {navigateTicker} from './HomeTicker';

export type HomeInfoBlock={id:string;title:string;subtitle:string;description:string;image_url:string|null;target_url:string;is_active:boolean;position:number;updated_at:string};
type Feed={items:HomeInfoBlock[]};

export const WorldMapArt:React.FC=()=> <svg viewBox="0 0 620 320" role="img" aria-label="Карта мира с международными соединениями" className="w-full h-auto max-h-[240px]" xmlns="http://www.w3.org/2000/svg">
 <defs>
  <radialGradient id="vvd-map-glow"><stop stopColor="#d4a53e" stopOpacity=".23"/><stop offset="1" stopColor="#d4a53e" stopOpacity="0"/></radialGradient>
  <linearGradient id="vvd-map-land" x1="0" y1="0" x2="1" y2="1"><stop stopColor="#d9ad50"/><stop offset="1" stopColor="#6c4c1d"/></linearGradient>
  <filter id="vvd-map-light"><feGaussianBlur stdDeviation="3"/></filter>
 </defs>
 <ellipse cx="310" cy="160" rx="285" ry="145" fill="url(#vvd-map-glow)"/>
 <g fill="url(#vvd-map-land)" fillOpacity=".9" stroke="#f0cb78" strokeOpacity=".42" strokeWidth="1.5" strokeLinejoin="round">
  <path d="M51 91 78 66 110 62 130 77 157 71 176 94 164 117 145 126 132 151 117 151 105 172 86 151 68 146 60 124 40 116Z"/>
  <path d="M143 167 162 169 185 191 192 220 180 241 175 270 157 293 149 262 137 239 134 207 119 188Z"/>
  <path d="M226 74 251 62 278 66 290 81 316 72 332 86 354 72 380 81 404 72 432 87 461 84 487 100 517 103 547 123 535 145 507 150 488 164 465 154 450 168 423 151 408 166 388 155 364 164 341 143 322 151 307 133 286 137 271 117 251 120 241 105 220 99Z"/>
  <path d="M292 158 322 157 346 177 358 203 341 227 331 257 314 278 298 249 282 224 274 193Z"/>
  <path d="M465 222 493 207 520 213 544 236 533 259 506 265 481 252Z"/>
  <path d="M169 45 195 33 215 42 207 57 182 60Z"/>
  <path d="M552 163 558 179 551 191 546 181Z"/>
 </g>
 <g fill="none" stroke="#ffda7b" strokeWidth="1.6" strokeOpacity=".75" strokeDasharray="5 5">
  <path d="M115 119 Q237 -14 349 126"/><path d="M349 126 Q454 24 503 136"/>
  <path d="M349 126 Q450 154 506 234"/><path d="M115 119 Q212 149 168 208"/>
  <path d="M168 208 Q239 90 349 126"/>
 </g>
 <g fill="#ffe8a4">
  {[[115,119],[168,208],[349,126],[503,136],[506,234]].map(([x,y],i)=><g key={i}><circle cx={x} cy={y} r="10" opacity=".42" filter="url(#vvd-map-light)"/><circle cx={x} cy={y} r="4"/><circle cx={x} cy={y} r="2" fill="#fff"/></g>)}
 </g>
 </svg>;

export const HomeInfoBlocks:React.FC=()=>{
 const [items,setItems]=useState<HomeInfoBlock[]>([]);
 const navigate=useNavigate();
 useEffect(()=>{let live=true;const load=()=>apiRequest<Feed>('/home-info/published').then(data=>{if(live)setItems(data.items)}).catch(()=>{});void load();const refresh=()=>{if(!document.hidden)void load()};document.addEventListener('visibilitychange',refresh);return()=>{live=false;document.removeEventListener('visibilitychange',refresh)}},[]);
 if(!items.length)return null;
 return <div className="flex flex-col gap-3 min-w-0">{items.map(item=><article key={item.id} className="min-w-0 overflow-hidden rounded-card border border-[#b18a38]/45 bg-[#0c0b09] px-4 py-5 shadow-[0_0_22px_rgba(203,155,51,0.11)]">
  <div className="text-center">
   {item.subtitle&&<p className="text-xs font-bold tracking-[.18em] text-[#eac46c] break-words">{item.subtitle}</p>}
   <h2 className="mt-2 text-lg sm:text-xl font-extrabold tracking-wide text-[#f1d18a] break-words">{item.title}</h2>
  </div>
  <div className="my-3 flex w-full min-h-[120px] items-center justify-center overflow-hidden">
   {item.image_url?<img src={API_BASE_URL+item.image_url+'?v='+encodeURIComponent(item.updated_at)} alt={item.title} className="block max-h-[250px] w-full object-contain" loading="lazy"/>:<WorldMapArt/>}
  </div>
  {item.description&&<p className="text-center text-xs leading-relaxed text-[#d6c7a8] whitespace-pre-wrap break-words">{item.description}</p>}
  {item.target_url&&<button type="button" onClick={()=>navigateTicker(item.target_url,navigate)} className="mt-3 w-full rounded-lg border border-[#d1a44d]/50 px-3 py-2 text-sm font-semibold text-[#f0ca77]">Подробнее →</button>}
 </article>)}</div>;
};
