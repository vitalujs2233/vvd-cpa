import {readSnapshot,saveSnapshot} from '@/shared/lib/viewSnapshot';
import React,{useEffect,useMemo,useState} from 'react';
import {useNavigate} from 'react-router-dom';
import {Search,Layers,Heart,Sparkles,Video,Gamepad2,Smartphone,Globe,ChevronRight} from 'lucide-react';
import {Card} from '@/shared/ui/Card';
import {Input} from '@/shared/ui/Input';
import {triggerHaptic} from '@/shared/lib/telegram';
import {cpaApi,type Vertical} from './cpaApi';
const icons={layers:Layers,heart:Heart,sparkles:Sparkles,video:Video,gamepad:Gamepad2,smartphone:Smartphone,globe:Globe};
export const Offers:React.FC=()=>{
 const nav=useNavigate();const [items,setItems]=useState<Vertical[]>(()=>readSnapshot<Vertical[]>('catalog')||[]),[search,setSearch]=useState('');
 const [loading,setLoading]=useState(true),[error,setError]=useState('');
 useEffect(()=>{let live=true;cpaApi.catalog().then(r=>{if(live){saveSnapshot('catalog',r.verticals);setItems(r.verticals)}}).catch(e=>{if(live)setError(e instanceof Error?e.message:'Ошибка загрузки')}).finally(()=>{if(live)setLoading(false)});return()=>{live=false}},[]);
 const filtered=useMemo(()=>items.filter(v=>v.title.toLowerCase().includes(search.trim().toLowerCase())),[items,search]);
 return <div className="flex flex-col gap-4 p-4 select-none pb-32 animate-fade-in w-full">
   <div className="flex flex-col text-left"><span className="text-[10px] text-textSecondary font-bold uppercase tracking-wider">CPA Каталог</span><h1 className="text-2xl font-bold text-white mt-1">Офферы</h1></div>
   <Input placeholder="Поиск по вертикалям..." value={search} onChange={e=>setSearch(e.target.value)} icon={<Search size={16}/>}/>
   {loading&&!items.length&&<p role="status" className="text-xs text-textSecondary">Загружаем вертикали…</p>}
   {error&&<p role="alert" className="rounded-app-xs border border-white/10 p-3 text-sm text-textSecondary">{error}</p>}
   {(items.length>0||(!loading&&!error))&&<div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-3 w-full">
     {filtered.length?filtered.map(v=>{const Icon=icons[v.icon_name as keyof typeof icons]||Layers;return <Card key={v.slug} clickable padding="sm" onClick={()=>{triggerHaptic.lightImpact();nav('/offers/'+encodeURIComponent(v.slug))}} className="flex items-center justify-between hover-lift shadow-premium">
       <div className="flex items-center gap-3"><div className="w-11 h-11 rounded-app-xs border border-accentPurple/20 bg-accentPurple/10 flex items-center justify-center text-accentPurple"><Icon size={20}/></div><div className="flex flex-col text-left"><b className="text-sm text-white">{v.title}</b><span className="text-[10px] text-textSecondary mt-1">{v.offers_count} офферов доступно</span></div></div>
       <ChevronRight size={16} className="text-gray-600 mr-1"/>
     </Card>}):<div className="col-span-full py-20 text-center rounded-card bg-bgCard/35 border border-white/[0.04] text-xs text-textSecondary">Нет опубликованных вертикалей или совпадений по поиску</div>}
   </div>}
 </div>
};
