import React,{useEffect,useState} from 'react';
import {ArrowLeft,ExternalLink,RefreshCcw,Save,ShieldAlert} from 'lucide-react';
import {maintenanceApi,DEFAULT_MAINTENANCE,type MaintenanceSettings} from '@/pages/maintenance/Maintenance';

const field='w-full rounded-app-xs border border-white/15 bg-bgMain px-3 py-3 text-sm text-white outline-none focus:border-accentGold/70';

export const MaintenanceAdmin:React.FC<{onBack:()=>void}>=({onBack})=>{
  const [settings,setSettings]=useState<MaintenanceSettings|null>(null);
  const [loading,setLoading]=useState(true);
  const [saving,setSaving]=useState(false);
  const [error,setError]=useState('');
  const [notice,setNotice]=useState('');
  const [retry,setRetry]=useState(0);
  useEffect(()=>{
    let mounted=true;
    setLoading(true);setError('');
    maintenanceApi.admin().then(value=>{if(mounted)setSettings(value);})
      .catch(()=>{if(mounted)setError('Не удалось загрузить настройки режима.');})
      .finally(()=>{if(mounted)setLoading(false);});
    return()=>{mounted=false;};
  },[retry]);
  const change=(values:Partial<MaintenanceSettings>)=>{setSettings(s=>s?{...s,...values}:s);setNotice('');};
  const save=async()=>{
    if(!settings||saving)return;
    if(!settings.title.trim()||!settings.message.trim()||!settings.support_label.trim()){
      setError('Заполни заголовок, сообщение и название кнопки.');return;
    }
    try{
      const url=new URL(settings.support_url);
      if(url.protocol!=='https:'||!url.hostname||url.username||url.password)throw Error();
    }catch{setError('Укажи корректную HTTPS-ссылку поддержки.');return;}
    setError('');setSaving(true);
    try{
      const result=await maintenanceApi.save(settings);
      setSettings({...settings,version:result.version});
      setNotice(settings.enabled?'Режим технических работ включён. Пользователи увидят уведомление.':'Режим выключен. Mini App снова доступен.');
    }catch(e){
      setError(e instanceof Error?e.message:'Не удалось сохранить настройки.');
    }finally{setSaving(false);}
  };
  return <div className="flex flex-col gap-4 p-4 pb-28 text-white">
    <button type="button" onClick={onBack} className="flex items-center gap-2 text-sm text-accentBrightGold"><ArrowLeft size={18}/> Админ-панель</button>
    <div className="flex items-center gap-3"><ShieldAlert size={29} className="text-accentBrightGold"/><div><h1 className="text-xl font-bold">Технические работы</h1><p className="text-xs text-textSecondary">Уведомление при открытии Telegram Mini App</p></div></div>
    {error&&<div role="alert" className="rounded-lg border border-red-500/40 bg-red-500/10 p-3 text-sm text-red-300">{error}</div>}
    {notice&&<div role="status" className="rounded-lg border border-accentGold/30 bg-accentGold/10 p-3 text-sm text-accentBrightGold">{notice}</div>}
    {loading?<div className="text-sm text-textSecondary">Загружаем настройки…</div>:
    !settings?<button type="button" onClick={()=>setRetry(n=>n+1)} className="flex items-center gap-2 text-accentBrightGold"><RefreshCcw size={16}/> Повторить</button>:
    <>
      <div className="rounded-card border border-accentGold/25 bg-bgCard p-4">
        <label className="flex items-center justify-between gap-4">
          <span><b className="block text-base">{settings.enabled?'Режим включён':'Режим выключен'}</b><small className="text-textSecondary">Не сохраняется автоматически</small></span>
          <input type="checkbox" role="switch" aria-label="Включить режим технических работ" checked={settings.enabled} onChange={e=>change({enabled:e.target.checked})} className="h-6 w-6 accent-[#F6C453]"/>
        </label>
      </div>
      <div className="rounded-card border border-white/10 bg-bgCard p-4 space-y-4">
        <label className="block text-xs text-textSecondary">Заголовок
          <input className={field} maxLength={150} value={settings.title} onChange={e=>change({title:e.target.value})}/>
        </label>
        <label className="block text-xs text-textSecondary">Сообщение для пользователей
          <textarea className={field} rows={5} maxLength={2000} value={settings.message} onChange={e=>change({message:e.target.value})}/>
        </label>
        <label className="block text-xs text-textSecondary">Ссылка службы поддержки (HTTPS)
          <input className={field} inputMode="url" value={settings.support_url} onChange={e=>change({support_url:e.target.value})}/>
        </label>
        <label className="block text-xs text-textSecondary">Текст кнопки
          <input className={field} maxLength={80} value={settings.support_label} onChange={e=>change({support_label:e.target.value})}/>
        </label>
        <button type="button" className="w-full rounded-app-xs bg-accentGold px-5 py-3 font-bold text-black flex items-center justify-center gap-2 disabled:opacity-60" disabled={saving} onClick={()=>void save()}>
          <Save size={18}/>{saving?'Сохраняем…':'Сохранить настройки'}
        </button>
      </div>
      <div className="rounded-card border border-white/10 bg-bgCard p-3 space-y-2">
        <b className="text-sm">Предпросмотр сообщения</b>
        <div className="rounded-lg border border-accentGold/30 bg-[#17130d] p-4 text-center">
          <h2 className="mb-2 text-lg font-bold text-[#f6cb7b]">{settings.title||DEFAULT_MAINTENANCE.title}</h2>
          <p className="whitespace-pre-line text-sm leading-6 text-[#d6c6aa]">{settings.message||DEFAULT_MAINTENANCE.message}</p>
          <div className="mt-3 rounded-lg bg-[#eac377] px-3 py-2 text-sm font-bold text-[#1d1509]">{settings.support_label||'Связаться с поддержкой'} <ExternalLink size={14} className="inline"/></div>
        </div>
        <p className="text-xs leading-5 text-textSecondary">Для администраторов Mini App остаётся доступен, чтобы выключить режим. Это экран уведомления, а не отключение серверного API или финансовых операций.</p>
      </div>
    </>}
  </div>;
};
