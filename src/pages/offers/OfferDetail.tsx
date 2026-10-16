import React,{useEffect,useState} from 'react';
import {useParams,useNavigate,Link} from 'react-router-dom';
import {ArrowLeft,Globe,Calendar,ChevronRight} from 'lucide-react';
import {Card} from '@/shared/ui/Card';
import {cpaApi,type PublicOffer,type Vertical} from './cpaApi';
export const OfferDetail:React.FC=()=>{
 const {id,offerId}=useParams();const nav=useNavigate();
 const [vertical,setVertical]=useState<Vertical|null>(null),[offers,setOffers]=useState<PublicOffer[]>([]),[offer,setOffer]=useState<PublicOffer|null>(null);
 const [loading,setLoading]=useState(true),[error,setError]=useState('');
 useEffect(()=>{if(!id)return;let active=true;setLoading(true);
  const task=offerId?cpaApi.offer(id,offerId).then(r=>({vertical:r.vertical,offers:[] as PublicOffer[],offer:r.offer})):cpaApi.vertical(id).then(r=>({...r,offer:null}));
  task.then(r=>{if(active){setVertical(r.vertical);setOffers(r.offers);setOffer(r.offer)}}).catch(e=>{if(active)setError(e instanceof Error?e.message:'Ошибка загрузки')}).finally(()=>{if(active)setLoading(false)});
  return()=>{active=false};
 },[id,offerId]);
 const back=()=>nav(offerId?'/offers/'+id:'/offers');
 return <div className="flex flex-col gap-4 p-4 select-none pb-32 animate-fade-in">
   <div className="flex items-center gap-3"><button type="button" onClick={back} aria-label="Назад" className="w-11 h-11 rounded-full bg-bgCard/40 border border-white/10 flex items-center justify-center text-textSecondary"><ArrowLeft size={18}/></button>
     <div><span className="text-[10px] text-accentPurple font-bold uppercase tracking-wider">{offer?'Оффер':'Вертикаль'}</span><h1 className="text-xl font-bold text-white">{offer?.title||vertical?.title||'Офферы'}</h1></div></div>
   {loading&&<p role="status" className="text-xs text-textSecondary">Загружаем данные…</p>}
   {error&&<p role="alert" className="text-sm text-textSecondary">{error}</p>}
   {!loading&&!error&&!offer&&<><p className="text-xs text-textSecondary">{vertical?.description||''}</p>
     {offers.length?offers.map(o=><Link key={o.id} to={'/offers/'+encodeURIComponent(id||'')+'/'+encodeURIComponent(o.id)}><Card padding="sm" className="flex items-center justify-between"><div className="flex-1 min-w-0"><h2 className="text-sm font-bold text-white">{o.title}</h2><p className="mt-1 text-xs text-textSecondary line-clamp-2">{o.description||o.payout_terms||'Условия уточняются'}</p></div><ChevronRight size={18}/></Card></Link>):<Card padding="lg" className="py-16 text-center text-xs text-textSecondary">В этой вертикали пока нет опубликованных офферов</Card>}
   </>}
   {offer&&<><Card padding="lg" className="space-y-3"><h2 className="text-base font-bold">{offer.title}</h2><p className="text-sm text-textSecondary whitespace-pre-wrap">{offer.description||'Описание пока не добавлено'}</p></Card>
     <div className="grid grid-cols-2 gap-3"><Card padding="sm" className="flex items-center gap-2"><Globe className="text-accentPurple" size={17}/><div><p className="text-[10px] text-textSecondary">ГЕО</p><p className="text-xs font-bold">{offer.geo||'Нет данных'}</p></div></Card><Card padding="sm" className="flex items-center gap-2"><Calendar className="text-accentPurple" size={17}/><div><p className="text-[10px] text-textSecondary">Холд</p><p className="text-xs font-bold">{offer.hold_override_days} дней</p></div></Card></div>
     <Card padding="lg" className="space-y-2"><h3 className="text-sm font-bold">Условия</h3><p className="text-xs text-textSecondary">Модель оплаты: {offer.payment_model||'Нет данных'}</p><p className="text-xs text-textSecondary">Вознаграждение: {offer.payout_terms||'Нет данных'}</p><p className="text-xs text-textSecondary">Трафик: {offer.traffic_restrictions||'Уточняйте условия у менеджера'}</p></Card>
     <Card variant="glow" padding="lg" className="text-center space-y-2"><p className="font-bold text-sm">Персональная VVD-ссылка</p><p className="text-xs text-textSecondary">Подключение ссылки готовится</p><p className="text-[11px] text-textSecondary">Новые ссылки на конкретный оффер будут доступны после проверки трекинга на этапе 3.</p></Card>
   </>}
 </div>
};
