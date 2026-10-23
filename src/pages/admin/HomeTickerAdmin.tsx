import React,{useEffect,useState} from 'react';
import {ArrowLeft,ArrowDown,ArrowUp,Plus,Save,Trash2} from 'lucide-react';
import {apiRequest} from '@/shared/lib/api';
import {tickerColor,type TickerItem,type TickerFeed} from '@/pages/home/HomeTicker';

const choices:TickerItem['color'][]=['gold','green','red'];
const names={gold:'Золотистый — стандартный',green:'Зелёный — событие',red:'Красный — предупреждение'};
export const HomeTickerAdmin:React.FC<{onBack:()=>void}>=({onBack})=>{
 const [feed,setFeed]=useState<TickerFeed>({enabled:false,items:[]});
 const [busy,setBusy]=useState(false);
 const [message,setMessage]=useState('');
 const [draft,setDraft]=useState({text:'',color:'gold' as TickerItem['color'],target_url:'',is_active:true});
 const [editing,setEditing]=useState<string|null>(null);
 const [edit,setEdit]=useState(draft);
 const load=async()=>setFeed(await apiRequest<TickerFeed>('/home-ticker/admin'));
 useEffect(()=>{void load().catch(()=>setMessage('Не удалось загрузить сообщения'))},[]);
 const perform=async(fn:()=>Promise<unknown>)=>{setBusy(true);setMessage('');try{await fn();await load();setMessage('Сохранено')}catch(e){setMessage(e instanceof Error?e.message:'Ошибка сохранения')}finally{setBusy(false)}};
 const add=()=>{if(!draft.text.trim()){setMessage('Введите текст');return}void perform(async()=>{await apiRequest('/home-ticker/admin/messages',{method:'POST',body:JSON.stringify(draft)});setDraft({text:'',color:'gold',target_url:'',is_active:true})})};
 const save=(id:string)=>void perform(async()=>{await apiRequest('/home-ticker/admin/messages/'+id,{method:'PUT',body:JSON.stringify(edit)});setEditing(null)});
 const remove=(item:TickerItem)=>{if(!window.confirm('Удалить сообщение?'))return;void perform(()=>apiRequest('/home-ticker/admin/messages/'+item.id,{method:'DELETE'}))};
 const move=(i:number,delta:number)=>{const list=[...feed.items],next=i+delta;if(next<0||next>=list.length)return;[list[i],list[next]]=[list[next],list[i]];void perform(()=>apiRequest('/home-ticker/admin/order',{method:'PUT',body:JSON.stringify({ids:list.map(item=>item.id)})}))};
 const startEdit=(item:TickerItem)=>{setEditing(item.id);setEdit({text:item.text,color:item.color,target_url:item.target_url,is_active:item.is_active})};
 const fields=(value:typeof draft,set:(next:typeof draft)=>void)=><div className="flex flex-col gap-3">
  <textarea aria-label="Текст сообщения" rows={2} maxLength={500} placeholder="Текст сообщения" value={value.text} onChange={e=>set({...value,text:e.target.value})} className="w-full rounded-lg bg-black/40 p-3 text-white"/>
  <select aria-label="Цвет сообщения" value={value.color} onChange={e=>set({...value,color:e.target.value as TickerItem['color']})} className="w-full rounded-lg bg-black/40 p-3 text-white">{choices.map(color=><option key={color} value={color}>{names[color]}</option>)}</select>
  <input aria-label="Ссылка сообщения" placeholder="Ссылка (необязательно)" value={value.target_url} onChange={e=>set({...value,target_url:e.target.value})} className="w-full rounded-lg bg-black/40 p-3 text-white"/>
  <label className="flex items-center gap-2 text-white text-sm"><input type="checkbox" checked={value.is_active} onChange={e=>set({...value,is_active:e.target.checked})}/>Сообщение активно</label>
  <div className="rounded-lg bg-black/80 border border-[#b48a36]/40 px-3 py-2 text-xs truncate" style={{color:tickerColor(value.color)}}>✦ {value.text||'Предпросмотр сообщения'}</div>
 </div>;
 return <div className="flex flex-col gap-4 pb-24 animate-fade-in">
  <button onClick={onBack} className="flex items-center gap-2 text-accentGoldBright"><ArrowLeft size={18}/>Назад</button>
  <h1 className="text-xl font-bold text-white">Бегущая строка</h1>
  {message&&<p role="status" className="text-sm text-accentGoldBright">{message}</p>}
  <label className="flex items-center justify-between gap-3 rounded-card bg-bgCard p-4 text-white"><span>Бегущая строка: {feed.enabled?'ВКЛ':'ВЫКЛ'}</span><input type="checkbox" disabled={busy} checked={feed.enabled} onChange={e=>{const enabled=e.target.checked;void perform(()=>apiRequest('/home-ticker/admin/settings',{method:'PUT',body:JSON.stringify({enabled})}))}}/></label>
  <div className="rounded-card bg-bgCard p-4 flex flex-col gap-3"><h2 className="font-bold text-white">Новое сообщение</h2>{fields(draft,setDraft)}<button disabled={busy} onClick={add} className="min-h-12 rounded-xl bg-[#EFC35C] font-bold text-[#15120B] flex justify-center items-center gap-2 disabled:opacity-50"><Plus size={18}/>Добавить сообщение</button></div>
  {feed.items.map((item,i)=><div key={item.id} className="rounded-card bg-bgCard p-4 flex flex-col gap-3">
   <div className="flex justify-between items-start gap-2"><strong className="text-white">{i+1}. Сообщение</strong><span className="text-xs text-textSecondary">{item.is_active?'Активно':'Выключено'}</span></div>
   {editing===item.id?<>{fields(edit,setEdit)}<button disabled={busy} onClick={()=>save(item.id)} className="min-h-12 rounded-xl bg-[#EFC35C] font-bold text-[#15120B] flex justify-center items-center gap-2"><Save size={18}/>Сохранить</button><button className="text-textSecondary" onClick={()=>setEditing(null)}>Отмена</button></>:<>
    <p className="text-sm break-words" style={{color:tickerColor(item.color)}}>{item.text}</p>
    {item.target_url&&<p className="text-xs text-textSecondary break-all">{item.target_url}</p>}
    <button onClick={()=>startEdit(item)} className="rounded-lg border border-accentGold/30 p-3 text-accentGoldBright">Редактировать</button>
   </>}
   <div className="flex items-center justify-between"><button disabled={busy||i===0} aria-label="Переместить выше" onClick={()=>move(i,-1)} className="p-2 text-accentGoldBright disabled:opacity-30"><ArrowUp size={20}/></button><button disabled={busy||i===feed.items.length-1} aria-label="Переместить ниже" onClick={()=>move(i,1)} className="p-2 text-accentGoldBright disabled:opacity-30"><ArrowDown size={20}/></button><button disabled={busy} onClick={()=>remove(item)} className="flex gap-2 items-center p-2 text-red-400"><Trash2 size={18}/>Удалить</button></div>
  </div>)}
  {!feed.items.length&&<p className="text-sm text-textSecondary">Сообщений пока нет. Добавьте первое объявление.</p>}
 </div>;
};
