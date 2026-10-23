import React,{useEffect,useState} from 'react';
import {useNavigate} from 'react-router-dom';
import {ChevronDown,ArrowLeft,Info,ExternalLink} from 'lucide-react';
import {Card} from '@/shared/ui/Card';
import {apiRequest,API_BASE_URL} from '@/shared/lib/api';
import {triggerHaptic} from '@/shared/lib/telegram';
export type InfoSection={id:string;title:string;summary:string;body:string;icon:string;image:string;visible:boolean;buttons:{label:string;url:string}[]};
const allowedPaths=['/','/offers','/stats','/tools','/profile','/referral','/support','/dvizh','/iq-play'];
export const InfoPage:React.FC=()=>{
 const navigate=useNavigate();
 const [sections,setSections]=useState<InfoSection[]>([]);
 const [expanded,setExpanded]=useState<string[]>([]);
 const [error,setError]=useState('');
 useEffect(()=>{let live=true;apiRequest<{sections:InfoSection[]}>('/info').then(x=>{if(live)setSections(x.sections)}).catch(()=>{if(live)setError('Не удалось загрузить информацию. Попробуйте открыть страницу позже.')});return()=>{live=false}},[]);
 const follow=(url:string)=>{
  if(url.startsWith('https://')){window.Telegram?.WebApp?.openLink?.(url);return}
  if(allowedPaths.includes(url))navigate(url);
 };
 return <div className="flex flex-col gap-4 p-4 pb-24 animate-fade-in">
  <div className="flex items-center gap-3"><button onClick={()=>navigate('/')} aria-label="Назад" className="w-11 h-11 rounded-full bg-bgCard/40 border border-white/10 flex items-center justify-center text-textSecondary"><ArrowLeft size={18}/></button><div><span className="text-[10px] text-accentGold font-bold uppercase tracking-wider">VVD CPA</span><h1 className="text-xl font-bold text-white">Почему VVD CPA?</h1></div></div>
  <p className="text-xs text-textSecondary">Узнай о платформе, преимуществах, выплатах и условиях сотрудничества</p>
  {error&&<p role="alert" className="text-xs text-error">{error}</p>}
  {sections.map(s=><Card key={s.id} padding="none" className="border-accentGold/20 bg-bgCard/80 overflow-hidden">
   <button type="button" aria-expanded={expanded.includes(s.id)} onClick={()=>{triggerHaptic.lightImpact();setExpanded(x=>x.includes(s.id)?x.filter(id=>id!==s.id):[...x,s.id])}} className="w-full flex items-center gap-3 p-4 text-left">
    <span className="w-9 h-9 shrink-0 flex items-center justify-center rounded-app-xs bg-accentGold/10 text-accentGoldBright"><Info size={18}/></span>
    <span className="flex-1 min-w-0"><span className="block text-sm font-bold text-white">{s.title}</span>{s.summary&&<span className="block text-xs text-textSecondary mt-1">{s.summary}</span>}</span>
    <ChevronDown size={18} className={'text-accentGoldBright transition-transform '+(expanded.includes(s.id)?'rotate-180':'')}/>
   </button>
   {expanded.includes(s.id)&&<div className="px-4 pb-4 border-t border-white/[0.05] pt-3">
    {s.image&&<img src={API_BASE_URL+s.image} alt={s.title} loading="lazy" className="w-full rounded-card object-cover max-h-64 mb-3"/>}
    <div className="whitespace-pre-wrap text-sm leading-relaxed text-textSecondary">{s.body}</div>
    <div className="flex flex-wrap gap-2 mt-3">{(s.buttons||[]).map((b,i)=><button key={i} onClick={()=>follow(b.url)} className="flex items-center gap-1.5 rounded-app-xs border border-accentGold/30 bg-accentGold/10 text-accentGoldBright px-3 py-2 text-xs font-semibold">{b.label}<ExternalLink size={12}/></button>)}</div>
   </div>}
  </Card>)}
 </div>
};
