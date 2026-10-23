import React,{useEffect,useState} from 'react';
import {ArrowLeft,ArrowUp,ArrowDown,Trash2,Plus,Upload,Save} from 'lucide-react';
import {apiRequest,API_BASE_URL} from '@/shared/lib/api';
import type {HomeAd} from '@/pages/home/HomeAdCarousel';

type AdminFeed={items:HomeAd[];autoplay:boolean};
export const HomeAdsAdmin:React.FC<{onBack:()=>void}>=({onBack})=>{
 const [items,setItems]=useState<HomeAd[]>([]);
 const [autoplay,setAutoplay]=useState(false);
 const [title,setTitle]=useState('');
 const [target,setTarget]=useState('');
 const [image,setImage]=useState<File|null>(null);
 const [preview,setPreview]=useState('');
 const [busy,setBusy]=useState(false);
 const [message,setMessage]=useState('');
 const [editing,setEditing]=useState<string|null>(null);
 const [draftTitle,setDraftTitle]=useState('');
 const [draftTarget,setDraftTarget]=useState('');
 const [draftActive,setDraftActive]=useState(false);
 const load=async()=>{const result=await apiRequest<AdminFeed>('/home-ads/admin');setItems(result.items);setAutoplay(result.autoplay)};
 useEffect(()=>{load().catch(()=>setMessage('Не удалось загрузить баннеры'))},[]);
 useEffect(()=>{if(!image){setPreview('');return;}const url=URL.createObjectURL(image);setPreview(url);return()=>URL.revokeObjectURL(url)},[image]);
 const perform=async(action:()=>Promise<unknown>)=>{setBusy(true);setMessage('');try{await action();await load();setMessage('Изменения сохранены')}catch(e){setMessage(e instanceof Error?e.message:'Не удалось сохранить')}finally{setBusy(false)}};
 const checkFile=(file:File|null)=>{if(!file)return false;if(!['image/jpeg','image/png','image/webp'].includes(file.type)||file.size>5*1024*1024){setMessage('Только JPG, PNG или WebP до 5 МБ');return false}return true};
 const create=()=>{if(!image||!checkFile(image)||!title.trim()){setMessage('Укажите название и изображение');return}const body=new FormData();body.append('image',image);body.append('title',title);body.append('target_url',target);body.append('is_active','false');void perform(async()=>{await apiRequest('/home-ads/admin',{method:'POST',body});setTitle('');setTarget('');setImage(null)})};
 const beginEdit=(item:HomeAd)=>{setEditing(item.id);setDraftTitle(item.title);setDraftTarget(item.target_url);setDraftActive(item.is_active)};
 const saveEdit=(id:string)=>void perform(async()=>{await apiRequest('/home-ads/admin/'+id,{method:'PUT',body:JSON.stringify({title:draftTitle,target_url:draftTarget,is_active:draftActive})});setEditing(null)});
 const replaceImage=(id:string,file:File|null)=>{if(!checkFile(file)||!file)return;const body=new FormData();body.append('image',file);void perform(()=>apiRequest('/home-ads/admin/'+id+'/image',{method:'POST',body}))};
 const remove=(item:HomeAd)=>{if(!window.confirm('Удалить баннер «'+item.title+'»?'))return;void perform(()=>apiRequest('/home-ads/admin/'+item.id,{method:'DELETE'}))};
 const move=(index:number,direction:number)=>{const next=[...items];const to=index+direction;if(to<0||to>=next.length)return;[next[index],next[to]]=[next[to],next[index]];void perform(()=>apiRequest('/home-ads/admin/order/items',{method:'PUT',body:JSON.stringify({ids:next.map(x=>x.id)})}))};
 return <div className="flex flex-col gap-4 pb-24 animate-fade-in">
  <button onClick={onBack} className="flex gap-2 items-center text-accentGoldBright"><ArrowLeft size={18}/>Назад</button>
  <h1 className="text-xl font-bold text-white">Рекламные баннеры</h1>
  <p className="text-xs text-textSecondary">Добавляйте изображения по одному, повторяя форму для каждого баннера. Можно включить до 4 баннеров одновременно. Рекомендуемый формат — 3:1.</p>
  {message&&<p role="status" className="text-xs text-accentGoldBright">{message}</p>}
  <label className="flex items-center justify-between rounded-card bg-bgCard p-3 text-sm text-white">Автоматическое перелистывание (5 секунд)<input type="checkbox" checked={autoplay} disabled={busy} onChange={e=>{const checked=e.target.checked;void perform(()=>apiRequest('/home-ads/admin/settings/autoplay',{method:'PUT',body:JSON.stringify({autoplay:checked})}))}}/></label>
  <div className="rounded-card bg-bgCard p-3 flex flex-col gap-3">
   <h2 className="font-bold text-white">Добавить баннер</h2>
   <input aria-label="Название баннера" placeholder="Название" maxLength={160} value={title} onChange={e=>setTitle(e.target.value)} className="w-full rounded-lg bg-black/30 p-3 text-white"/>
   <input aria-label="Ссылка баннера" placeholder="HTTPS, tg:// или /внутренняя-страница" value={target} onChange={e=>setTarget(e.target.value)} className="w-full rounded-lg bg-black/30 p-3 text-white"/>
   <label className="flex gap-2 items-center text-sm text-accentGoldBright"><Upload size={18}/>Выбрать изображение<input type="file" accept="image/jpeg,image/png,image/webp" className="max-w-36 text-xs" onChange={e=>{const f=e.target.files?.[0]||null;if(checkFile(f))setImage(f)}}/></label>
   {preview&&<img src={preview} alt="Предпросмотр загружаемого баннера" className="w-full aspect-[3/1] object-contain rounded-card bg-black/30"/>}
   <button disabled={busy} onClick={create} className="rounded-xl bg-[#EFC35C] p-3 font-bold text-[#15120B] flex gap-2 items-center justify-center disabled:opacity-50"><Plus size={18}/>Добавить (неактивный)</button>
  </div>
  {items.map((item,i)=><div key={item.id} className="rounded-card bg-bgCard p-3 flex flex-col gap-3">
   <img src={API_BASE_URL+item.image_url+'?v='+encodeURIComponent(item.updated_at||'')} alt={item.title} className="w-full aspect-[3/1] object-contain rounded-card bg-black/30"/>
   <div className="flex items-center justify-between gap-2"><span className="font-bold text-white">{i+1}. {item.title}</span><span className="text-xs text-textSecondary">{item.is_active?'Активен':'Выключен'}</span></div>
   <p className="text-xs text-textSecondary break-all">{item.target_url||'Без ссылки'}</p>
   {editing===item.id?<div className="flex flex-col gap-2">
    <input aria-label="Изменить название" value={draftTitle} onChange={e=>setDraftTitle(e.target.value)} className="rounded-lg bg-black/30 p-3 text-white"/>
    <input aria-label="Изменить ссылку" value={draftTarget} onChange={e=>setDraftTarget(e.target.value)} className="rounded-lg bg-black/30 p-3 text-white"/>
    <label className="flex items-center gap-2 text-sm text-white"><input type="checkbox" checked={draftActive} onChange={e=>setDraftActive(e.target.checked)}/>Показывать пользователям</label>
    <button disabled={busy} onClick={()=>saveEdit(item.id)} className="w-full min-h-12 rounded-xl bg-[#EFC35C] p-3 font-bold text-[#15120B] flex items-center justify-center gap-2 disabled:opacity-50"><Save size={16}/>Сохранить</button>
    <button onClick={()=>setEditing(null)} className="text-xs text-textSecondary">Отмена</button>
   </div>:<button onClick={()=>beginEdit(item)} className="rounded-lg border border-accentGold/30 p-2 text-accentGoldBright">Редактировать</button>}
   <label className="text-xs text-textSecondary">Заменить изображение <input type="file" accept="image/jpeg,image/png,image/webp" className="block mt-1 w-full" disabled={busy} onChange={e=>{replaceImage(item.id,e.target.files?.[0]||null);e.target.value=''}}/></label>
   <div className="flex justify-between gap-2">
    <button disabled={busy||i===0} onClick={()=>move(i,-1)} aria-label="Выше" className="p-2 text-accentGoldBright"><ArrowUp size={20}/></button>
    <button disabled={busy||i===items.length-1} onClick={()=>move(i,1)} aria-label="Ниже" className="p-2 text-accentGoldBright"><ArrowDown size={20}/></button>
    <button disabled={busy} onClick={()=>remove(item)} className="p-2 text-red-400 flex items-center gap-1"><Trash2 size={18}/>Удалить</button>
   </div>
  </div>)}
  {!items.length&&<p className="text-xs text-textSecondary">Баннеров пока нет. Добавьте изображение выше.</p>}
 </div>;
};
