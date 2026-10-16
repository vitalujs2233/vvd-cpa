import React,{useEffect,useRef,useState} from 'react';
import { Info,Send,ChevronLeft,ExternalLink,MessageCircle,UserRound } from 'lucide-react';
import { marketApi, type PublicCharacter } from './marketApi';
import { aiApi,fileUrl,type ChatEntry,type PublicSession } from './aiApi';

const err=(e:unknown)=>e instanceof Error?e.message:'Не удалось связаться с сервером';
export const PublicAIPage:React.FC<{slug:string}>=({slug})=>{
  const [person,setPerson]=useState<PublicCharacter|null>(null),[session,setSession]=useState<PublicSession|null>(null);
  const [entries,setEntries]=useState<ChatEntry[]>([]),[text,setText]=useState(''),[busy,setBusy]=useState(false);
  const [error,setError]=useState(''),[info,setInfo]=useState(false),[adult,setAdult]=useState(false);
  const bottom=useRef<HTMLDivElement>(null);
  useEffect(()=>{
    let active=true;
    async function load(){
      try{
        const p=await marketApi.publicModel(slug);
        const key='vvd_ai_session_'+slug;
        const s=await aiApi.begin(slug,sessionStorage.getItem(key));
        if(!active)return;
        sessionStorage.setItem(key,s.token);
        setPerson(p);setSession(s);setEntries(s.messages);
      }catch(e){if(active)setError(err(e));}
    }
    void load();return()=>{active=false;};
  },[slug]);
  useEffect(()=>{bottom.current?.scrollIntoView({behavior:'smooth'});},[entries,busy]);
  const send=async(e:React.FormEvent)=>{
    e.preventDefault();
    const message=text.trim();
    if(!message||!session?.can_chat||busy)return;
    setText('');setBusy(true);setError('');
    setEntries(prev=>[...prev,{role:'user',content:message}]);
    try{const answer=await aiApi.send(slug,session.token,message);setEntries(prev=>[...prev,answer]);}
    catch(e){setError(err(e));}
    finally{setBusy(false);}
  };
  const offer=async()=>{
    if(!session||!adult)return;
    const tab=window.open('about:blank','_blank');
    if(tab)tab.opener=null;
    try{
      const r=await aiApi.click(slug,session.token,adult);
      if(!r.url.startsWith('https://'))throw new Error('Ссылка недоступна');
      if(tab)tab.location.href=r.url;
      else window.location.assign(r.url);
    }catch(e){tab?.close();setError(err(e));}
  };
  return <div className="mx-auto flex h-[100dvh] max-w-2xl flex-col overflow-hidden bg-bgMain text-textPrimary">
    <header className="flex shrink-0 items-center gap-3 border-b border-accentGold/15 bg-bgCard px-4 py-3">
      {person?.photo_url?<img className="h-11 w-11 rounded-full object-cover" src={person.photo_url} alt="Аватар"/>:
        <div className="flex h-11 w-11 items-center justify-center rounded-full bg-accentGold/10 text-accentBrightGold"><UserRound/></div>}
      <div className="min-w-0 flex-1"><h1 className="truncate text-base font-bold">{person?.name||'Диалог'}</h1>
        <p className="text-xs text-textSecondary">{session?.can_chat?'Чат доступен':'Общение временно недоступно'}</p></div>
      <button type="button" onClick={()=>setInfo(!info)} aria-label="Информация о чате" className="rounded-full border border-white/10 p-2 text-accentBrightGold"><Info size={20}/></button>
    </header>
    {info&&<section className="border-b border-white/10 bg-bgCard p-4 text-sm">
      <b>Виртуальный собеседник</b>
      <p className="mt-1 text-xs leading-5 text-textSecondary">Вы общаетесь с искусственным интеллектом, а не с реальным человеком. Ответы могут содержать ошибки. Не отправляйте личные данные. Ссылки на предложения — реклама.</p>
      {person?.description&&<p className="mt-2 text-xs text-textSecondary">{person.description}</p>}
    </section>}
    <div className="flex-1 space-y-4 overflow-y-auto px-4 py-5" aria-live="polite">
      {person&&<div className="mx-auto max-w-[90%] rounded-2xl border border-accentGold/20 bg-accentGold/10 p-3 text-center text-xs leading-5 text-textSecondary">
        Это виртуальный персонаж. Общение происходит с AI, не с настоящим человеком.
      </div>}
      {person&&<div className="max-w-[87%] rounded-2xl rounded-tl-sm bg-bgCard px-4 py-3 text-sm leading-6">{person.greeting||'Привет!'}</div>}
      {entries.map((m,i)=><div key={i} className={'flex '+(m.role==='user'?'justify-end':'justify-start')}>
        <div className={'max-w-[87%] whitespace-pre-wrap break-words rounded-2xl px-4 py-3 text-sm leading-6 '+(m.role==='user'?'rounded-tr-sm bg-accentGold/20':'rounded-tl-sm bg-bgCard')}>{m.content}</div>
      </div>)}
      {busy&&<p className="text-xs text-textSecondary" role="status">Генерируется ответ…</p>}
      {error&&<div role="alert" className="rounded-app-xs border border-white/10 p-3 text-xs text-textSecondary">{error}</div>}
      <div ref={bottom}/>
    </div>
    <div className="shrink-0 space-y-2 border-t border-white/10 bg-bgCard px-3 py-3 pb-[max(14px,env(safe-area-inset-bottom))]">
      {person?.affiliate_url&&<label className="flex items-center gap-2 text-xs text-textSecondary"><input type="checkbox" checked={adult} onChange={e=>setAdult(e.target.checked)}/> Подтверждаю, что мне есть 18 лет</label>}
      {person?.affiliate_url&&<button type="button" onClick={()=>void offer()} disabled={!session||!adult} className="flex w-full items-center justify-center gap-2 rounded-app-xs bg-gold-gradient px-4 py-3 text-sm font-bold text-bgMain disabled:opacity-50">
        <ExternalLink size={16}/>{person.button_label||'Посмотреть предложение'} <span className="text-[10px] font-normal">· Реклама</span>
      </button>}
      <form onSubmit={send} className="flex gap-2">
        <input type="text" value={text} maxLength={1000} disabled={!session?.can_chat||busy}
          onChange={e=>setText(e.target.value)} placeholder={session?.can_chat?'Написать сообщение…':'Чат пока недоступен'}
          aria-label="Сообщение" className="min-w-0 flex-1 rounded-app-xs border border-white/10 bg-bgMain px-4 py-3 text-sm outline-none focus:border-accentGold/50 disabled:opacity-60"/>
        <button type="submit" aria-label="Отправить" disabled={!text.trim()||!session?.can_chat||busy}
          className="rounded-app-xs bg-accentGold px-4 text-bgMain disabled:opacity-40"><Send size={19}/></button>
      </form>
    </div>
  </div>;
};
