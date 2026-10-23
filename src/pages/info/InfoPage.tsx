import React,{useEffect,useState} from 'react';
import {useNavigate} from 'react-router-dom';
import {ArrowLeft,ChevronDown,Info,UsersRound,Sparkles,WalletCards,Rocket,CircleHelp,ShieldCheck,Headset,Gift, type LucideIcon} from 'lucide-react';
import {triggerHaptic} from '@/shared/lib/telegram';
const sectionIcons:Record<string,LucideIcon>={team:UsersRound,users:UsersRound,benefits:Sparkles,sparkles:Sparkles,payouts:WalletCards,wallet:WalletCards,start:Rocket,rocket:Rocket,faq:CircleHelp,help:CircleHelp,rules:ShieldCheck,shield:ShieldCheck,support:Headset,headset:Headset};
const iconFor=(item:InfoItem):LucideIcon=>{const configured=sectionIcons[item.icon?.toLowerCase()];if(configured)return configured;const title=item.title.toLowerCase();if(title.includes('кто мы'))return UsersRound;if(title.includes('выбирают')||title.includes('преимущ'))return Sparkles;if(title.includes('выплат'))return WalletCards;if(title.includes('начать'))return Rocket;if(title.includes('вопрос'))return CircleHelp;if(title.includes('правил'))return ShieldCheck;if(title.includes('поддерж'))return Headset;return item.kind==='banner'?Gift:Info;};
import {Card} from '@/shared/ui/Card';
import {apiRequest} from '@/shared/lib/api';
export type InfoItem={id:string;kind:'section'|'banner';title:string;description:string;body:string;quote:string;icon:string;image_url:string;button_text:string;button_url:string;visible:boolean};
export const InfoPage:React.FC<{previewItems?:InfoItem[]}>=({previewItems})=>{
 const navigate=useNavigate(),[items,setItems]=useState<InfoItem[]>(previewItems||[]),[open,setOpen]=useState<string[]>([]),[error,setError]=useState('');
 useEffect(()=>{if(previewItems)return;let live=true;apiRequest<{items:InfoItem[]}>('/info/published').then(d=>{if(live)setItems(d.items)}).catch(()=>{if(live)setError('Информация временно недоступна')});return()=>{live=false}},[previewItems]);
 return <div className="flex flex-col gap-3 p-4 pb-24 animate-fade-in">
 <button className="flex gap-2 items-center text-accentGoldBright" onClick={()=>navigate(-1)}><ArrowLeft size={18}/>Назад</button>
 <h1 className="text-xl font-bold text-white">Почему VVD CPA?</h1>
 {error&&<p role="alert" className="text-textSecondary">{error}</p>}
 {items.filter(x=>x.visible).map(item=>{const Icon=iconFor(item);const expanded=open.includes(item.id);return <Card key={item.id} padding="sm" className="border border-accentGold/20 transition-all duration-300 hover:border-accentGold/40">
 {item.kind==='section'?<><button type="button" aria-expanded={open.includes(item.id)} className="flex min-h-14 items-center w-full gap-3 text-left" onClick={()=>{triggerHaptic.lightImpact();setOpen(s=>s.includes(item.id)?s.filter(v=>v!==item.id):[...s,item.id])}}><span className="flex w-8 shrink-0 items-center justify-center text-accentGoldBright"><Icon size={23} strokeWidth={1.7}/></span><span className="flex-1"><strong className="block text-white">{item.title}</strong><span className="text-xs text-textSecondary">{item.description}</span></span><ChevronDown size={18} className={expanded?'rotate-180 text-accentGoldBright transition-transform duration-300':'transition-transform duration-300'}/></button>{open.includes(item.id)&&<div className="pt-3 whitespace-pre-wrap text-sm text-textSecondary animate-fade-in">{item.body}{item.image_url&&<img src={item.image_url} alt={item.title} className="w-full rounded-card mt-3"/>}{item.button_url&&<a href={item.button_url} target="_blank" rel="noopener noreferrer" className="block mt-3 text-accentGoldBright underline">{item.button_text||'Подробнее'}</a>}</div>}</>:<div>{item.image_url&&<img src={item.image_url} alt={item.title} className="w-full rounded-card mb-3"/>}<h2 className="font-bold text-white">{item.title}</h2><p className="text-sm text-textSecondary whitespace-pre-wrap">{item.description}</p>{item.quote&&<p className="italic text-accentGoldBright mt-2">{item.quote}</p>}{item.button_url&&<a className="inline-block mt-3 text-accentGoldBright underline" href={item.button_url} target="_blank" rel="noopener noreferrer">{item.button_text||'Подробнее'}</a>}</div>}
 </Card>})}
 </div>;
};
