import React,{useEffect,useState} from 'react';
import {ArrowLeft} from 'lucide-react';
import {apiRequest} from '@/shared/lib/api';
import {InfoPage,type InfoItem} from '@/pages/info/InfoPage';
const empty=(kind:'section'|'banner'):InfoItem=>({id:crypto.randomUUID(),kind,title:'',description:'',body:'',quote:'',icon:'info',image_url:'',button_text:'',button_url:'',visible:true});
export const InfoAdmin:React.FC<{onBack:()=>void}>=({onBack})=>{
 const [items,setItems]=useState<InfoItem[]>([]),[history,setHistory]=useState<number[]>([]),[preview,setPreview]=useState(false),[notice,setNotice]=useState(''),[busy,setBusy]=useState(false);
 const refresh=async()=>{const d=await apiRequest<{items:InfoItem[];history:{id:number}[]}>('/info/admin');setItems(d.items);setHistory(d.history.map(x=>x.id))};
 useEffect(()=>{refresh().catch(()=>setNotice('Не удалось загрузить данные'))},[]);
 const run=async(path:string,method='POST',body?:unknown)=>{setBusy(true);try{await apiRequest('/info/admin/'+path,{method,body:body?JSON.stringify(body):undefined});await refresh();setNotice('Сохранено')}catch{setNotice('Операция не выполнена')}finally{setBusy(false)}};
 const change=(index:number,key:keyof InfoItem,value:string|boolean)=>setItems(s=>s.map((x,i)=>i===index?{...x,[key]:value}:x));
 return <div className="p-4 pb-24 flex flex-col gap-4"><button onClick={onBack} className="flex items-center gap-2 text-accentGoldBright"><ArrowLeft size={18}/>Админ-панель</button><h1 className="font-bold text-xl">Управление информацией</h1>
 {notice&&<p role="status" className="text-xs text-textSecondary">{notice}</p>}
 <div className="flex flex-wrap gap-2">{(['section','banner'] as const).map(k=><button key={k} className="border border-accentGold/30 rounded-card p-2" onClick={()=>setItems(s=>[...s,empty(k)])}>+ {k==='section'?'Раздел':'Баннер'}</button>)}</div>
 {items.map((item,i)=><div key={item.id} className="rounded-card border border-accentGold/20 bg-bgCard p-3 flex flex-col gap-2">
 <div className="flex justify-between text-xs"><b>{item.kind==='section'?'Раздел':'Баннер'} {i+1}</b><label><input type="checkbox" checked={item.visible} onChange={e=>change(i,'visible',e.target.checked)}/> Показывать</label></div>
 {(['title','description','body','quote','icon','image_url','button_text','button_url'] as const).map(k=><label key={k} className="text-xs text-textSecondary">{({title:'Название',description:'Описание',body:'Полный текст',quote:'Цитата',icon:'Иконка',image_url:'HTTPS изображение',button_text:'Текст кнопки',button_url:'HTTPS ссылка'} as Record<string,string>)[k]}<textarea rows={k==='body'?5:1} className="w-full bg-bgMain text-white border border-white/10 rounded-app-xs p-2" value={item[k]} onChange={e=>change(i,k,e.target.value)}/></label>)}
 <div className="flex gap-3 text-accentGoldBright text-sm"><button disabled={i===0} onClick={()=>setItems(s=>{const a=[...s];[a[i-1],a[i]]=[a[i],a[i-1]];return a})}>↑</button><button disabled={i===items.length-1} onClick={()=>setItems(s=>{const a=[...s];[a[i],a[i+1]]=[a[i+1],a[i]];return a})}>↓</button><button onClick={()=>setItems(s=>s.filter(x=>x.id!==item.id))}>Удалить</button></div>
 </div>)}
 <div className="flex flex-wrap gap-2">{[['Сохранить черновик',()=>run('draft','PUT',{items})],['Опубликовать',()=>run('publish')],['Предпросмотр',()=>setPreview(!preview)]] .map(([label,fn])=><button key={label as string} disabled={busy} className="rounded-card border border-accentGold/30 px-3 py-2 text-sm" onClick={fn as ()=>void}>{label as string}</button>)}</div>
 {preview&&<InfoPage previewItems={items}/>}
 <h2 className="font-bold">История версий</h2>{history.map(id=><button key={id} disabled={busy} className="text-left text-sm text-accentGoldBright" onClick={()=>{if(window.confirm('Восстановить опубликованную версию '+id+'?'))run('restore/'+id)}}>Восстановить версию {id}</button>)}
 </div>;
};
