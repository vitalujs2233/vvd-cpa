import React,{useEffect,useState} from 'react';
import {ArrowLeft,ArrowUp,ArrowDown,Trash2,Save,Plus} from 'lucide-react';
import {apiRequest,API_BASE_URL} from '@/shared/lib/api';
import {WorldMapArt,type HomeInfoBlock} from '@/pages/home/HomeInfoBlocks';

type Feed={items:HomeInfoBlock[]};
type Draft={title:string;subtitle:string;description:string;target_url:string;is_active:boolean};
const blank:Draft={title:'',subtitle:'',description:'',target_url:'',is_active:false};
export const HomeInfoAdmin:React.FC<{onBack:()=>void}>=({onBack})=>{
 const [items,setItems]=useState<HomeInfoBlock[]>([]);
 const [draft,setDraft]=useState<Draft>(blank);
 const [editing,setEditing]=useState<string|null>(null);
 const [edit,setEdit]=useState<Draft>(blank);
 const [file,setFile]=useState<File|null>(null);
 const [preview,setPreview]=useState('');
 const [busy,setBusy]=useState(false);
 const [message,setMessage]=useState('');
 const load=async()=>{const data=await apiRequest<Feed>('/home-info/admin');setItems(data.items)};
 useEffect(()=>{void load().catch(()=>setMessage('Не удалось загрузить блоки'))},[]);
 useEffect(()=>{if(!file){setPreview('');return}const url=URL.createObjectURL(file);setPreview(url);return()=>URL.revokeObjectURL(url)},[file]);
 const perform=async(fn:()=>Promise<unknown>)=>{setBusy(true);setMessage('');try{await fn();await load();setMessage('Сохранено')}catch(e){setMessage(e instanceof Error?e.message:'Ошибка сохранения')}finally{setBusy(false)}};
 const valid=(f:File|null)=>{if(!f)return false;if(!['image/jpeg','image/png','image/webp'].includes(f.type)||f.size>5*1024*1024){setMessage('Только JPG, PNG, WebP до 5 МБ');return false}return true};
 const upload=async(id:string,f:File)=>{const body=new FormData();body.append('image',f);await apiRequest('/home-info/admin/blocks/'+id+'/image',{method:'POST',body})};
 const create=()=>{if(!draft.title.trim()){setMessage('Введите заголовок');return}void perform(async()=>{const result=await apiRequest<{id:string}>('/home-info/admin/blocks',{method:'POST',body:JSON.stringify(draft)});if(file)await upload(result.id,file);setDraft(blank);setFile(null)})};
 const save=(id:string)=>void perform(async()=>{await apiRequest('/home-info/admin/blocks/'+id,{method:'PUT',body:JSON.stringify(edit)});setEditing(null)});
 const remove=(item:HomeInfoBlock)=>{if(window.confirm('Удалить блок «'+item.title+'»?'))void perform(()=>apiRequest('/home-info/admin/blocks/'+item.id,{method:'DELETE'}))};
 const move=(i:number,d:number)=>{const ordered=[...items],j=i+d;if(j<0||j>=ordered.length)return;[ordered[i],ordered[j]]=[ordered[j],ordered[i]];void perform(()=>apiRequest('/home-info/admin/order',{method:'PUT',body:JSON.stringify({ids:ordered.map(x=>x.id)})}))};
 const fields=(value:Draft,set:(v:Draft)=>void)=><div className="flex flex-col gap-3">
  <input maxLength={180} aria-label="Заголовок" placeholder="Заголовок" className="w-full rounded-lg bg-black/40 p-3 text-white" value={value.title} onChange={e=>set({...value,title:e.target.value})}/>
  <input maxLength={180} aria-label="Дополнительный заголовок" placeholder="Дополнительный заголовок" className="w-full rounded-lg bg-black/40 p-3 text-white" value={value.subtitle} onChange={e=>set({...value,subtitle:e.target.value})}/>
  <textarea maxLength={1200} rows={4} aria-label="Описание" placeholder="Описание" className="w-full rounded-lg bg-black/40 p-3 text-white" value={value.description} onChange={e=>set({...value,description:e.target.value})}/>
  <input maxLength={2048} aria-label="Ссылка" placeholder="Ссылка (необязательно)" className="w-full rounded-lg bg-black/40 p-3 text-white" value={value.target_url} onChange={e=>set({...value,target_url:e.target.value})}/>
  <label className="flex items-center gap-2 text-sm text-white"><input type="checkbox" checked={value.is_active} onChange={e=>set({...value,is_active:e.target.checked})}/>Показывать на главной</label>
  <div className="rounded-card border border-[#b18a38]/45 bg-[#0c0b09] p-3 text-center"><p className="text-xs text-[#eac46c]">{value.subtitle||'Дополнительный заголовок'}</p><strong className="block my-2 text-[#f1d18a] break-words">{value.title||'Заголовок'}</strong><p className="text-xs text-[#d6c7a8] whitespace-pre-wrap break-words">{value.description||'Описание'}</p></div>
 </div>;
 return <div className="flex flex-col gap-4 pb-24">
  <button onClick={onBack} className="flex items-center gap-2 text-accentGoldBright"><ArrowLeft size={18}/>Назад</button>
  <h1 className="text-xl font-bold text-white">Информационные блоки главной</h1>
  {message&&<p role="status" className="text-sm text-accentGoldBright">{message}</p>}
  <div className="rounded-card bg-bgCard p-4 flex flex-col gap-3"><h2 className="font-bold text-white">Добавить блок</h2>{fields(draft,setDraft)}
   <label className="text-xs text-textSecondary">Изображение (необязательно)<input type="file" accept="image/jpeg,image/png,image/webp" className="block mt-2 w-full" disabled={busy} onChange={e=>{const f=e.target.files?.[0]||null;if(f&&!valid(f))return;setFile(f)}}/></label>
   {preview?<img src={preview} alt="Предпросмотр" className="w-full max-h-56 object-contain"/>:<WorldMapArt/>}
   <button disabled={busy} onClick={create} className="min-h-12 rounded-xl bg-[#EFC35C] text-[#15120B] font-bold flex items-center justify-center gap-2 disabled:opacity-50"><Plus size={18}/>Добавить блок</button>
  </div>
  {items.map((item,i)=><div key={item.id} className="rounded-card bg-bgCard p-4 flex flex-col gap-3">
   <div className="flex justify-between gap-2"><strong className="text-white">{i+1}. {item.title}</strong><span className="text-xs text-textSecondary">{item.is_active?'Включён':'Выключен'}</span></div>
   {item.image_url?<img src={API_BASE_URL+item.image_url+'?v='+encodeURIComponent(item.updated_at)} alt={item.title} className="w-full max-h-52 object-contain"/>:<WorldMapArt/>}
   {editing===item.id?<>{fields(edit,setEdit)}<button disabled={busy} onClick={()=>save(item.id)} className="min-h-12 rounded-xl bg-[#EFC35C] text-[#15120B] font-bold flex items-center justify-center gap-2"><Save size={18}/>Сохранить</button><button onClick={()=>setEditing(null)} className="text-textSecondary">Отмена</button></>:<button onClick={()=>{setEditing(item.id);setEdit({title:item.title,subtitle:item.subtitle,description:item.description,target_url:item.target_url,is_active:item.is_active})}} className="rounded-lg border border-accentGold/30 p-3 text-accentGoldBright">Редактировать</button>}
   <label className="text-xs text-textSecondary">Заменить изображение<input type="file" accept="image/jpeg,image/png,image/webp" className="block mt-2 w-full" disabled={busy} onChange={e=>{const f=e.target.files?.[0]||null;if(valid(f)&&f)void perform(()=>upload(item.id,f));e.target.value=''}}/></label>
   {item.image_url&&<button disabled={busy} onClick={()=>{if(window.confirm('Удалить изображение?'))void perform(()=>apiRequest('/home-info/admin/blocks/'+item.id+'/image',{method:'DELETE'}))}} className="text-xs text-red-400">Удалить изображение</button>}
   <div className="flex justify-between"><button aria-label="Выше" disabled={busy||i===0} onClick={()=>move(i,-1)} className="p-2 text-accentGoldBright disabled:opacity-30"><ArrowUp size={20}/></button><button aria-label="Ниже" disabled={busy||i===items.length-1} onClick={()=>move(i,1)} className="p-2 text-accentGoldBright disabled:opacity-30"><ArrowDown size={20}/></button><button disabled={busy} onClick={()=>remove(item)} className="p-2 flex items-center gap-1 text-red-400"><Trash2 size={18}/>Удалить</button></div>
  </div>)}
 </div>;
};
