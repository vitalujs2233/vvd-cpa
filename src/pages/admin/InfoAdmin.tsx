import React,{useEffect,useState} from 'react';
import {ArrowLeft,Plus,Trash2,ChevronUp,ChevronDown,Save,Upload} from 'lucide-react';
import {Card} from '@/shared/ui/Card';
import {apiRequest,authorizedFetch,API_BASE_URL} from '@/shared/lib/api';
import type {InfoSection} from '@/pages/home/InfoPage';
type Version={id:number;status:string;content:InfoSection[];created_at:string;published_at:string|null};
const empty=():InfoSection=>({id:crypto.randomUUID(),title:'Новый раздел',summary:'',body:'',icon:'info',image:'',visible:true,buttons:[]});
export const InfoAdmin:React.FC<{onBack:()=>void}>=({onBack})=>{
 const [items,setItems]=useState<InfoSection[]>([]);
 const [versions,setVersions]=useState<Version[]>([]);
 const [selected,setSelected]=useState<number|null>(null);
 const [dirty,setDirty]=useState(false);
 const [busy,setBusy]=useState(false);
 const [error,setError]=useState('');
 const [preview,setPreview]=useState(false);
 const load=async()=>{const r=await apiRequest<{versions:Version[];defaults:InfoSection[]}>('/admin/info');setVersions(r.versions);const draft=r.versions.find(v=>v.status==='draft');const published=r.versions.find(v=>v.status==='published');setItems(structuredClone(draft?.content||published?.content||r.defaults));setSelected(draft?.id||null)};
 useEffect(()=>{void load().catch(()=>setError('Не удалось загрузить редактор'))},[]);
 const edit=(id:string,patch:Partial<InfoSection>)=>{setDirty(true);setItems(xs=>xs.map(x=>x.id===id?{...x,...patch}:x));};
 const move=(i:number,delta:number)=>{setDirty(true);setItems(xs=>{const copy=[...xs];const j=i+delta;if(j<0||j>=copy.length)return xs;[copy[i],copy[j]]=[copy[j],copy[i]];return copy});};
 const action=async(fn:()=>Promise<void>)=>{setBusy(true);setError('');try{await fn();await load()}catch(e){setError(e instanceof Error?e.message:'Ошибка сохранения')}finally{setBusy(false)}};
 const save=()=>action(async()=>{await apiRequest<{id:number}>('/admin/info/draft',{method:'POST',body:JSON.stringify({sections:items})});setDirty(false)});
 const publish=()=>{if(!selected||dirty){setError('Сначала сохраните текущие изменения как черновик');return}if(!window.confirm('Опубликовать выбранный сохранённый черновик?'))return;void action(async()=>{await apiRequest('/admin/info/publish/'+selected,{method:'POST'})})};
 const upload=async(id:string,file:File)=>{setBusy(true);setError('');try{const data=new FormData();data.append('file',file);const res=await authorizedFetch(API_BASE_URL+'/admin/info/image',{method:'POST',body:data});if(!res.ok)throw new Error('Ошибка загрузки изображения');const result=await res.json();edit(id,{image:result.url})}catch(e){setError(e instanceof Error?e.message:'Ошибка изображения')}finally{setBusy(false)}};
 return <div className="flex flex-col gap-4 animate-fade-in">
 <div className="flex items-center gap-3"><button onClick={onBack} aria-label="Назад" className="w-11 h-11 rounded-full border border-white/10 bg-bgCard/40 flex items-center justify-center"><ArrowLeft size={18}/></button><div><span className="text-[10px] text-accentGold font-bold uppercase">Админ панель</span><h1 className="text-xl font-bold text-white">Управление информацией</h1></div></div>
 <p className="text-xs text-textSecondary">Редактируйте разделы, сохраните черновик, проверьте предварительный просмотр и опубликуйте. Изменения без публикации пользователям не видны.</p>
 {error&&<p role="alert" className="text-xs text-error">{error}</p>}
 <div className="flex flex-wrap gap-2"><button disabled={busy} onClick={()=>{setDirty(true);setItems(xs=>[...xs,empty()])}} className="rounded-app-xs border border-accentGold/30 p-2 text-xs text-accentGoldBright flex gap-1"><Plus size={15}/>Добавить</button><button disabled={busy} onClick={()=>setPreview(x=>!x)} className="rounded-app-xs border border-white/20 p-2 text-xs">{preview?'Редактор':'Предпросмотр'}</button><button disabled={busy} onClick={save} className="rounded-app-xs border border-accentGold/30 p-2 text-xs text-accentGoldBright flex gap-1"><Save size={15}/>Сохранить черновик</button><button disabled={busy||!selected} onClick={publish} className="rounded-app-xs bg-accentGold text-black p-2 text-xs font-bold">Опубликовать</button></div>
 {items.map((s,i)=><Card key={s.id} padding="md" className="flex flex-col gap-3 border-accentGold/20 bg-bgCard">
  <div className="flex items-center justify-between gap-2"><span className="text-xs text-accentGoldBright font-bold">Раздел {i+1}</span><div className="flex gap-2"><button aria-label="Выше" onClick={()=>move(i,-1)}><ChevronUp size={17}/></button><button aria-label="Ниже" onClick={()=>move(i,1)}><ChevronDown size={17}/></button><button aria-label="Удалить" onClick={()=>{setDirty(true);setItems(xs=>xs.filter(x=>x.id!==s.id))}}><Trash2 size={17}/></button></div></div>
  {preview?<><h2 className="font-bold text-sm">{s.title}</h2><p className="text-xs text-textSecondary">{s.summary}</p>{s.image&&<img src={API_BASE_URL+s.image} className="w-full rounded-card max-h-52 object-cover" alt="Баннер"/>}<p className="whitespace-pre-wrap text-xs">{s.body}</p></>:<>
  <label className="text-xs">Заголовок<input value={s.title} maxLength={160} onChange={e=>edit(s.id,{title:e.target.value})} className="w-full rounded-app-xs bg-black/30 border border-white/10 p-2 mt-1 text-white"/></label>
  <label className="text-xs">Краткое описание<input value={s.summary||''} maxLength={500} onChange={e=>edit(s.id,{summary:e.target.value})} className="w-full rounded-app-xs bg-black/30 border border-white/10 p-2 mt-1 text-white"/></label>
  <label className="text-xs">Иконка<select value={s.icon||'info'} onChange={e=>edit(s.id,{icon:e.target.value})} className="w-full rounded-app-xs bg-bgCard border border-white/10 p-2 mt-1"><option value="info">Информация</option><option value="star">Звезда</option><option value="wallet">Выплаты</option><option value="users">Сообщество</option><option value="shield">Правила</option><option value="help">Вопросы</option></select></label>
  <label className="text-xs">Подробный текст (абзацы и списки с новой строки)<textarea value={s.body||''} rows={5} maxLength={30000} onChange={e=>edit(s.id,{body:e.target.value})} className="w-full rounded-app-xs bg-black/30 border border-white/10 p-2 mt-1 text-white whitespace-pre-wrap"/></label>
  <label className="text-xs flex items-center gap-2"><input type="checkbox" checked={s.visible!==false} onChange={e=>edit(s.id,{visible:e.target.checked})}/>Показывать вебмастерам</label>
  <label className="text-xs flex items-center gap-2 text-accentGoldBright"><Upload size={15}/>Загрузить изображение<input type="file" accept="image/png,image/jpeg,image/webp" onChange={e=>{const file=e.target.files?.[0];if(file)void upload(s.id,file)}} className="text-[10px] max-w-[170px]"/></label>
  {s.image&&<button onClick={()=>edit(s.id,{image:''})} className="text-xs text-error text-left">Удалить изображение</button>}
  {(s.buttons||[]).map((b,j)=><div key={j} className="flex flex-col gap-1 border-t border-white/10 pt-2"><input aria-label="Текст кнопки" placeholder="Название кнопки" value={b.label} onChange={e=>edit(s.id,{buttons:s.buttons.map((x,k)=>k===j?{...x,label:e.target.value}:x)})} className="rounded-app-xs bg-black/30 border border-white/10 p-2 text-xs"/><input aria-label="Ссылка кнопки" placeholder="https://... или /offers" value={b.url} onChange={e=>edit(s.id,{buttons:s.buttons.map((x,k)=>k===j?{...x,url:e.target.value}:x)})} className="rounded-app-xs bg-black/30 border border-white/10 p-2 text-xs"/><button onClick={()=>edit(s.id,{buttons:s.buttons.filter((_,k)=>k!==j)})} className="text-error text-xs text-left">Удалить кнопку</button></div>)}
  <button onClick={()=>edit(s.id,{buttons:[...(s.buttons||[]),{label:'Перейти',url:'/offers'}]})} className="text-xs text-accentGoldBright text-left">+ Добавить кнопку или ссылку</button>
  </>}
 </Card>)}
 <h2 className="text-sm font-bold text-white">История версий</h2>
 {versions.map(v=><div key={v.id} className="flex items-center justify-between gap-2 rounded-card border border-white/10 bg-bgCard p-3 text-xs"><span>№{v.id} · {v.status==='published'?'Опубликовано':v.status==='draft'?'Черновик':'Архив'}</span><div className="flex gap-2">{v.status==='draft'&&<button onClick={()=>{setItems(structuredClone(v.content));setSelected(v.id);setDirty(false)}} className="text-accentGoldBright">Открыть</button>}{v.status!=='draft'&&<button onClick={()=>{if(window.confirm('Восстановить эту опубликованную версию?'))void action(async()=>{await apiRequest('/admin/info/restore/'+v.id,{method:'POST'})})}} className="text-accentGoldBright">Восстановить</button>}</div></div>)}
 </div>
};
