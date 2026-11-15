import React,{useCallback,useEffect,useMemo,useState} from 'react';
import {ArrowLeft,Search,ShieldBan,ShieldCheck,Save} from 'lucide-react';
import {authorizedFetch,API_BASE_URL} from '@/shared/lib/api';

type Partner={
  telegram_id:number; partner_code:string|null; first_name:string|null;
  last_name:string|null; username:string|null; status:string; role:string;
};
type Settings={title:string;message:string;version:number};
type ApiErrorResponse={detail?:string|{code?:string}};

async function jsonRequest<T>(path:string,options:RequestInit={}):Promise<T>{
  const response=await authorizedFetch(API_BASE_URL+path,{
    ...options,cache:'no-store',
    headers:{'Content-Type':'application/json',...options.headers}
  });
  const data=await response.json() as T & ApiErrorResponse;
  if(!response.ok){
    const detail=typeof data.detail==='string'?data.detail:'Ошибка запроса. Попробуйте ещё раз.';
    throw new Error(detail);
  }
  return data;
}

export const AccountBlocksAdmin:React.FC<{onBack:()=>void}>=({onBack})=>{
  const [users,setUsers]=useState<Partner[]>([]);
  const [settings,setSettings]=useState<Settings|null>(null);
  const [search,setSearch]=useState('');
  const [reason,setReason]=useState('');
  const [busy,setBusy]=useState<number|null>(null);
  const [saving,setSaving]=useState(false);
  const [loading,setLoading]=useState(true);
  const [error,setError]=useState('');
  const [notice,setNotice]=useState('');
  const load=useCallback(async()=>{
    try{
      const [people,config]=await Promise.all([
        jsonRequest<{users:Partner[]}>('/admin/account-blocks/users'),
        jsonRequest<Settings>('/admin/account-blocks/settings')
      ]);
      setUsers(people.users);setSettings(config);setError('');
    }catch(e){setError(e instanceof Error?e.message:'Не удалось загрузить данные');}
    finally{setLoading(false);}
  },[]);
  useEffect(()=>{void load();},[load]);
  const filtered=useMemo(()=>{
    const q=search.trim().replace(/^@/,'').toLowerCase();
    return users.filter(user=>!q || [
      user.telegram_id,user.partner_code,user.first_name,user.last_name,
      user.username,((user.first_name||'')+' '+(user.last_name||'')).trim()
    ].some(value=>String(value||'').toLowerCase().includes(q)));
  },[users,search]);
  const change=async(user:Partner,action:'block'|'unblock')=>{
    if(busy!==null)return;
    if(action==='block'&&!reason.trim()){
      setError('Перед блокировкой укажите причину для журнала администратора.');
      return;
    }
    const caption=action==='block'?'Заблокировать':'Разблокировать';
    if(!window.confirm(caption+' пользователя '+(user.username?'@'+user.username:user.partner_code||user.telegram_id)+'?'))return;
    setBusy(user.telegram_id);setError('');setNotice('');
    try{
      const result=await jsonRequest<{success:boolean;status:string}>('/admin/account-blocks/'+user.telegram_id,{
        method:'POST',body:JSON.stringify({action,reason:reason.trim()})
      });
      setUsers(previous=>previous.map(item=>item.telegram_id===user.telegram_id?{...item,status:result.status}:item));
      setReason('');setNotice(action==='block'?'Пользователь заблокирован.':'Доступ пользователя восстановлен.');
    }catch(e){setError(e instanceof Error?e.message:'Не удалось изменить статус');}
    finally{setBusy(null);}
  };
  const save=async()=>{
    if(!settings||saving)return;
    setSaving(true);setError('');setNotice('');
    try{
      const response=await jsonRequest<{success:boolean;version:number}>('/admin/account-blocks/settings',{
        method:'PUT',body:JSON.stringify(settings)
      });
      setSettings({...settings,version:response.version});
      setNotice('Текст страницы блокировки сохранён.');
    }catch(e){setError(e instanceof Error?e.message:'Не удалось сохранить текст');}
    finally{setSaving(false);}
  };
  return <section className="flex flex-col gap-4 text-left">
    <div className="flex items-center gap-3">
      <button aria-label="Назад" type="button" onClick={onBack} className="rounded-xl border border-white/15 bg-bgCard p-3 text-accentBrightGold"><ArrowLeft size={18}/></button>
      <div><div className="text-[10px] uppercase tracking-widest text-accentGold">Админ панель</div>
        <h1 className="text-xl font-bold text-white">Блокировка пользователей</h1></div>
    </div>
    {error&&<p role="alert" className="rounded-xl border border-red-500/30 p-3 text-sm text-red-300">{error}</p>}
    {notice&&<p role="status" className="rounded-xl border border-green-500/30 p-3 text-sm text-green-300">{notice}</p>}
    <div className="rounded-card border border-accentGold/20 bg-bgCard p-4">
      <div className="mb-3 flex items-center gap-2 text-sm font-bold text-white"><ShieldBan size={18} className="text-accentGold"/> Страница блокировки</div>
      <p className="mb-4 text-xs text-textSecondary">Этот текст видит заблокированный пользователь при входе в Mini App. Кнопка поддержки остаётся доступна.</p>
      <label className="block text-xs text-textSecondary">Заголовок
        <input maxLength={150} value={settings?.title||''} onChange={e=>setSettings(old=>old?{...old,title:e.target.value}:old)}
          className="mt-2 w-full rounded-xl border border-white/15 bg-bgMain p-3 text-white" disabled={!settings||saving}/>
      </label>
      <label className="mt-4 block text-xs text-textSecondary">Сообщение
        <textarea maxLength={2000} rows={5} value={settings?.message||''} onChange={e=>setSettings(old=>old?{...old,message:e.target.value}:old)}
          className="mt-2 w-full rounded-xl border border-white/15 bg-bgMain p-3 text-white" disabled={!settings||saving}/>
      </label>
      <button type="button" onClick={()=>void save()} disabled={!settings||saving||!settings.title.trim()||!settings.message.trim()}
        className="mt-4 flex w-full items-center justify-center gap-2 rounded-xl bg-accentGold p-3 font-bold text-black disabled:opacity-40">
        <Save size={16}/> {saving?'Сохраняем…':'Сохранить текст'}
      </button>
    </div>
    <div className="rounded-card border border-white/10 bg-bgCard p-4">
      <h2 className="mb-3 text-sm font-bold text-white">Пользователи · {users.length}</h2>
      <label className="relative block">
        <Search size={16} className="absolute left-3 top-3.5 text-textSecondary"/>
        <input value={search} onChange={e=>setSearch(e.target.value)} placeholder="Ник, Telegram ID или VVD-код"
          className="w-full rounded-xl border border-white/15 bg-bgMain py-3 pl-10 pr-3 text-sm text-white"/>
      </label>
      <label className="mt-4 block text-xs text-textSecondary">Причина блокировки (только для журнала администратора)
        <textarea rows={2} maxLength={1000} value={reason} onChange={e=>setReason(e.target.value)}
          placeholder="Например: подозрение на недействительный трафик"
          className="mt-2 w-full rounded-xl border border-white/15 bg-bgMain p-3 text-sm text-white"/>
      </label>
      {loading?<p className="p-5 text-center text-xs text-textSecondary">Загрузка пользователей…</p>:
      <div className="mt-4 flex flex-col gap-3">
        {filtered.map(user=><article key={user.telegram_id} className="rounded-xl border border-white/10 bg-bgMain p-3">
          <div className="flex items-start justify-between gap-3">
            <div className="min-w-0">
              <p className="text-sm font-bold text-white break-words">{[user.first_name,user.last_name].filter(Boolean).join(' ')||'Без имени'}</p>
              <p className="text-xs text-accentBrightGold">@{user.username||'без username'}</p>
              <p className="mt-1 text-xs text-textSecondary">Telegram ID: {user.telegram_id}</p>
              <p className="text-xs text-textSecondary">VVD-код: {user.partner_code||'—'}</p>
            </div>
            <span className={'text-[11px] font-semibold '+(user.status==='blocked'?'text-red-400':'text-green-400')}>
              {user.status==='blocked'?'Заблокирован':user.status==='active'?'Активен':'Статус: '+user.status}
            </span>
          </div>
          {user.role==='admin'?<p className="mt-2 text-xs text-textSecondary">Администратор — блокировка недоступна.</p>:
           user.status==='active'?<button type="button" disabled={busy!==null} onClick={()=>void change(user,'block')}
             className="mt-3 flex w-full items-center justify-center gap-2 rounded-xl border border-red-500/40 p-2.5 text-sm font-bold text-red-300 disabled:opacity-40"><ShieldBan size={16}/> Заблокировать</button>:
           user.status==='blocked'?<button type="button" disabled={busy!==null} onClick={()=>void change(user,'unblock')}
             className="mt-3 flex w-full items-center justify-center gap-2 rounded-xl border border-green-500/40 p-2.5 text-sm font-bold text-green-300 disabled:opacity-40"><ShieldCheck size={16}/> Разблокировать</button>:null}
        </article>)}
        {!filtered.length&&<p className="p-4 text-center text-xs text-textSecondary">Пользователи не найдены</p>}
      </div>}
    </div>
  </section>;
};
