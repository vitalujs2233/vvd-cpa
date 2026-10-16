import React,{useEffect,useState} from 'react';
import {cpaApi,type PostbackConfig} from '@/pages/offers/cpaApi';
const control='w-full rounded-app-xs border border-white/10 bg-bgCard px-3 py-2 text-xs text-textPrimary';
const fieldNames=['click','transaction','status','amount','currency'] as const;
export const NetworkPostback:React.FC<{id:number}>=({id})=>{
 const [data,setData]=useState<PostbackConfig|null>(null),[secret,setSecret]=useState(''),[error,setError]=useState(''),[busy,setBusy]=useState(false),[notice,setNotice]=useState('');
 useEffect(()=>{let valid=true;setSecret('');setError('');setData(null);
 cpaApi.getPostback(id).then(x=>{if(valid)setData(x)}).catch(e=>{if(valid)setError(String(e))});
 return()=>{valid=false};},[id]);
 const save=async()=>{if(!data)return;setBusy(true);setError('');try{await cpaApi.savePostback(id,data);setNotice('Настройки сохранены')}catch(e){setError(String(e))}finally{setBusy(false)}};
 const rotate=async()=>{if(!window.confirm('Старый секрет перестанет действовать, а приём postback отключится. Продолжить?'))return;setBusy(true);setError('');
 try{const result=await cpaApi.rotatePostback(id);setSecret(result.secret_once);setData(d=>d?{...d,postback_enabled:false,configured:true}:d);setNotice('Новый секрет показан один раз. Сохраните его в кабинете партнёрской сети.')}
 catch(e){setError(String(e))}finally{setBusy(false)}};
 return <div className="rounded-app-xs border border-accentPurple/20 bg-accentPurple/5 p-3 space-y-3">
  <h3 className="font-bold text-sm">Postback · входящие конверсии</h3>
  {error&&<p role="alert" className="text-xs text-textSecondary">{error}</p>}
  {!data? <p className="text-xs text-textSecondary">Загрузка конфигурации…</p>:<>
   <p className="text-xs text-textSecondary break-all select-text">URL: {data.endpoint}</p>
   <p className="text-xs text-textSecondary">Секрет: {data.configured?'настроен':'не настроен'} · Последняя проверка: {data.postback_last_received_at?new Date(data.postback_last_received_at).toLocaleString('ru-RU'):'Нет данных'}</p>
   <label className="flex items-center gap-2 text-xs"><input type="checkbox" checked={data.postback_enabled} disabled={!data.configured} onChange={e=>setData({...data,postback_enabled:e.target.checked})}/>Принимать Postback</label>
   {fieldNames.map(k=><label key={k} className="block text-xs text-textSecondary">Параметр: {k}<input className={control+' mt-1'} value={data.postback_params[k]} onChange={e=>setData({...data,postback_params:{...data.postback_params,[k]:e.target.value}})}/></label>)}
   <label className="block text-xs text-textSecondary">Соответствие статусов (JSON)
    <textarea className={control+' mt-1 min-h-24'} value={JSON.stringify(data.postback_status_map,null,2)} onChange={e=>{try{const mapping=JSON.parse(e.target.value);if(mapping&&typeof mapping==='object'&&!Array.isArray(mapping))setData({...data,postback_status_map:mapping});}catch{setError('Для сохранения нужен корректный JSON')}}}/>
   </label>
   <button type="button" disabled={busy} onClick={()=>void save()} className="w-full rounded-app-xs border border-accentPurple/50 p-2 text-xs">Сохранить Postback</button>
   <button type="button" disabled={busy} onClick={()=>void rotate()} className="w-full rounded-app-xs border border-white/10 p-2 text-xs">Создать / заменить секрет</button>
   {secret&&<div className="space-y-2"><p className="text-xs text-textSecondary">Однократный показ секрета для заголовка X-VVD-Postback-Key. Не передавайте его в чат.</p>
     <p className="break-all select-text text-xs">{secret}</p>
     <button type="button" onClick={()=>void navigator.clipboard.writeText(secret)} className="rounded-app-xs border border-accentPurple/50 px-3 py-2 text-xs">Скопировать секрет</button>
     <button type="button" onClick={()=>setSecret('')} className="rounded-app-xs border border-white/10 px-3 py-2 text-xs">Скрыть</button></div>}
  </>}
  {notice&&<p role="status" className="text-xs text-textSecondary">{notice}</p>}
 </div>;
};
