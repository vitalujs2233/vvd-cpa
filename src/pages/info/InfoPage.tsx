import React,{useEffect,useState} from 'react';
import {useNavigate} from 'react-router-dom';
import {ArrowLeft,ChevronDown,Info} from 'lucide-react';
import {Card} from '@/shared/ui/Card';
import {apiRequest} from '@/shared/lib/api';
export type InfoItem={id:string;kind:'section'|'banner';title:string;description:string;body:string;quote:string;icon:string;image_url:string;button_text:string;button_url:string;visible:boolean};
export const InfoPage:React.FC<{previewItems?:InfoItem[]}>=({previewItems})=>{
 const navigate=useNavigate(),[items,setItems]=useState<InfoItem[]>(previewItems||[]),[open,setOpen]=useState<string[]>([]),[error,setError]=useState('');
 useEffect(()=>{if(previewItems)return;let live=true;apiRequest<{items:InfoItem[]}>('/info/published').then(d=>{if(live)setItems(d.items)}).catch(()=>{if(live)setError('Информация временно недоступна')});return()=>{live=false}},[previewItems]);
 return <div className="flex flex-col gap-4 p-4 pb-24 animate-fade-in">
 <button className="flex gap-2 items-center text-accentGoldBright" onClick={()=>navigate(-1)}><ArrowLeft size={18}/>Назад</button>
 <h1 className="text-xl font-bold text-white">Почему VVD CPA?</h1>
 {error&&<p role="alert" className="text-textSecondary">{error}</p>}
 {items.filter(x=>x.visible).map(item=><Card key={item.id} padding="md" className="border border-accentGold/20">
 {item.kind==='section'?<><button type="button" aria-expanded={open.includes(item.id)} className="flex items-center w-full gap-3 text-left" onClick={()=>setOpen(s=>s.includes(item.id)?s.filter(v=>v!==item.id):[...s,item.id])}><Info size={20} className="text-accentGoldBright"/><span className="flex-1"><strong className="block text-white">{item.title}</strong><span className="text-xs text-textSecondary">{item.description}</span></span><ChevronDown size={18} className={open.includes(item.id)?'rotate-180 transition-transform':'transition-transform'}/></button>{open.includes(item.id)&&<div className="pt-4 whitespace-pre-wrap text-sm text-textSecondary">{item.body}{item.image_url&&<img src={item.image_url} alt={item.title} className="w-full rounded-card mt-3"/>}{item.button_url&&<a href={item.button_url} target="_blank" rel="noopener noreferrer" className="block mt-3 text-accentGoldBright underline">{item.button_text||'Подробнее'}</a>}</div>}</>:<div>{item.image_url&&<img src={item.image_url} alt={item.title} className="w-full rounded-card mb-3"/>}<h2 className="font-bold text-white">{item.title}</h2><p className="text-sm text-textSecondary whitespace-pre-wrap">{item.description}</p>{item.quote&&<p className="italic text-accentGoldBright mt-2">{item.quote}</p>}{item.button_url&&<a className="inline-block mt-3 text-accentGoldBright underline" href={item.button_url} target="_blank" rel="noopener noreferrer">{item.button_text||'Подробнее'}</a>}</div>}
 </Card>)}
 </div>;
};
