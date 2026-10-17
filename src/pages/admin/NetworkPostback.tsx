import React,{useEffect,useState} from 'react';
import {cpaApi,type PostbackConfig,type PostbackCheckState} from '@/pages/offers/cpaApi';
const control='w-full rounded-app-xs border border-white/10 bg-bgCard px-3 py-2 text-xs text-textPrimary';
const fieldNames=['click','transaction','status','amount','currency'] as const;
export const NetworkPostback:React.FC<{id:number}>=({id})=>{
 const [data,setData]=useState<PostbackConfig|null>(null),[secret,setSecret]=useState(''),[error,setError]=useState(''),[busy,setBusy]=useState(false),[notice,setNotice]=useState('');
 const [mapText,setMapText]=useState('');
 const [checkState,setCheckState]=useState<PostbackCheckState|null>(null),[checkError,setCheckError]=useState('');
 useEffect(()=>{let valid=true;setSecret('');setError('');setData(null);setCheckState(null);setCheckError('');
 if(id===2)cpaApi.getPostbackCheck(id).then(x=>{if(valid)setCheckState(x)}).catch(()=>{if(valid)setCheckError('Не удалось загрузить результат проверки. Попробуйте открыть раздел заново.')});
 cpaApi.getPostback(id).then(x=>{if(valid){setData(x);setMapText(JSON.stringify(x.postback_status_map,null,2))}}).catch(e=>{if(valid)setError(String(e))});
 return()=>{valid=false};},[id]);
 const save=async()=>{if(!data)return;setBusy(true);setError('');try{const parsed=JSON.parse(mapText);if(!parsed||typeof parsed!=='object'||Array.isArray(parsed))throw Error('Некорректное соответствие статусов');await cpaApi.savePostback(id,{...data,postback_status_map:parsed});setData(d=>d?{...d,postback_status_map:parsed}:d);setNotice('Настройки сохранены')}catch(e){setError(String(e))}finally{setBusy(false)}};
 const check=async()=>{if(id!==2||busy||checkState?.completed)return;if(!window.confirm('Запустить серверную проверку на одном существующем клике VVD Test Network? Будет создана одна помеченная тестовая конверсия pending без начислений. Продолжить?'))return;
 setBusy(true);setCheckError('');setNotice('');try{const r=await cpaApi.checkPostback(id);setNotice('Postback: '+r.http_first+'; повтор: '+r.http_duplicate+'; неверный секрет: '+r.http_bad_secret+'; неизвестный клик: '+r.http_unknown_click+'; атрибуция: '+(r.attribution?'OK':'Ошибка')+'; финансы: '+(r.financial_unchanged?'не изменены':'Ошибка')+'. Приём выключен.');setCheckState(await cpaApi.getPostbackCheck(id))}catch(e){if(e instanceof Error&&'status' in e&&(e as Error&{status:number}).status===409){setCheckError('Проверка уже выполнена. Повторное создание тестовой конверсии заблокировано.');try{setCheckState(await cpaApi.getPostbackCheck(id))}catch{}}else setCheckError('Не удалось выполнить проверку: '+String(e))}finally{setBusy(false)}};
 const rotate=async()=>{if(!window.confirm('Старый секрет перестанет действовать, а приём postback отключится. Продолжить?'))return;setBusy(true);setError('');
 try{const result=await cpaApi.rotatePostback(id);setSecret(result.secret_once);setData(d=>d?{...d,postback_enabled:false,configured:true}:d);setNotice('Новый секрет показан один раз. Сохраните его в кабинете партнёрской сети.')}
 catch(e){setError(String(e))}finally{setBusy(false)}};
 return <div className="rounded-app-xs border border-accentPurple/20 bg-accentPurple/5 p-3 space-y-3">
  <h3 className="font-bold text-sm">Postback · входящие конверсии</h3>
  {error&&<p role="alert" className="text-xs text-textSecondary">{error}</p>}
  {!data? <p className="text-xs text-textSecondary">Загрузка конфигурации…</p>:<>
   <p className="text-xs text-textSecondary break-all select-text">URL: {data.endpoint}</p>
   <p className="text-xs text-textSecondary">Секрет: {data.configured?'настроен':'не настроен'} · Последняя проверка: {data.postback_last_received_at?new Date(data.postback_last_received_at).toLocaleString('ru-RU'):'Нет данных'}</p>
   <label className="block text-xs text-textSecondary">Формат Postback
     <select className={control+' mt-1'} value={data.postback_method} onChange={e=>setData({...data,postback_method:e.target.value as 'POST_JSON'|'GET_QUERY',postback_enabled:false})}>
       <option value="POST_JSON">POST / JSON (совместимый)</option>
       <option value="GET_QUERY">GET / Query (требует проверки отправителя)</option>
     </select>
   </label>
   {data.postback_method==='GET_QUERY'&&!data.get_auth_ready&&<p role="alert" className="text-xs text-textSecondary">GET приём отключён: {data.get_auth_reason}. X-Forwarded-For не подтверждает отправителя; секрет в URL не допускается.</p>}
   <label className="flex items-center gap-2 text-xs"><input type="checkbox" checked={data.postback_enabled} disabled={!data.configured||(data.postback_method==='GET_QUERY'&&!data.get_auth_ready)} onChange={e=>setData({...data,postback_enabled:e.target.checked})}/>Принимать Postback</label>
   {fieldNames.map(k=><label key={k} className="block text-xs text-textSecondary">Параметр: {k}<input className={control+' mt-1'} value={data.postback_params[k]} onChange={e=>setData({...data,postback_params:{...data.postback_params,[k]:e.target.value}})}/></label>)}
   <label className="block text-xs text-textSecondary">Соответствие статусов (JSON)
    <textarea className={control+' mt-1 min-h-24'} value={mapText} onChange={e=>setMapText(e.target.value)}/>
   </label>
   <button type="button" disabled={busy} onClick={()=>void save()} className="w-full rounded-app-xs border border-accentPurple/50 p-2 text-xs">Сохранить Postback</button>
   {id===2&&<div className="space-y-2" aria-live="polite">
    {checkState?.completed&&checkState.test_conversions===1&&checkState.status==="pending"&&checkState.zero_payout&&<p role="status" className="rounded-app-xs border border-accentPurple/40 bg-accentPurple/10 p-3 text-xs text-textPrimary">Postback проверен успешно. Тестовая конверсия: 1. Статус: pending. Начисления: $0</p>}
    {checkError&&<p role="alert" className="rounded-app-xs border border-white/20 p-2 text-xs text-textSecondary">{checkError}</p>}
    <button type="button" disabled={busy||checkState===null||checkState.completed} onClick={()=>void check()} className="w-full rounded-app-xs border border-accentPurple/50 p-2 text-xs disabled:opacity-60">{checkState?.completed?"Проверка уже выполнена":"Проверить Postback"}</button>
   </div>}
   <button type="button" disabled={busy} onClick={()=>void rotate()} className="w-full rounded-app-xs border border-white/10 p-2 text-xs">Создать / заменить секрет</button>
   {secret&&<div className="space-y-2"><p className="text-xs text-textSecondary">Однократный показ секрета для заголовка X-VVD-Postback-Key. Не передавайте его в чат.</p>
     <p className="break-all select-text text-xs">{secret}</p>
     <button type="button" onClick={()=>void navigator.clipboard.writeText(secret)} className="rounded-app-xs border border-accentPurple/50 px-3 py-2 text-xs">Скопировать секрет</button>
     <button type="button" onClick={()=>setSecret('')} className="rounded-app-xs border border-white/10 px-3 py-2 text-xs">Скрыть</button></div>}
  </>}
  {notice&&<p role="status" className="text-xs text-textSecondary">{notice}</p>}
 </div>;
};
