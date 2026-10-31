import React,{useEffect,useRef,useState} from 'react';
import { Info,Send,ChevronLeft,ExternalLink,MessageCircle,UserRound } from 'lucide-react';
import { marketApi, type PublicCharacter } from './marketApi';
import { aiApi,fileUrl,type ChatEntry,type PublicSession } from './aiApi';

type QueuedMessage={id:string;content:string;status:'pending'|'sending'|'failed'};
type VisibleEntry=ChatEntry & {queueId?:string};
const err=(e:unknown)=>e instanceof Error&&e.message!=='network_error'?e.message:'Не удалось связаться с сервером. Проверьте соединение и попробуйте снова.';
export const PublicAIPage:React.FC<{slug:string}>=({slug})=>{
  const [person,setPerson]=useState<PublicCharacter|null>(null),[session,setSession]=useState<PublicSession|null>(null);
  const [entries,setEntries]=useState<VisibleEntry[]>([]),[text,setText]=useState(''),[busy,setBusy]=useState(false);
  const [error,setError]=useState(''),[info,setInfo]=useState(false),[adult,setAdult]=useState(false);
  const bottom=useRef<HTMLDivElement>(null);
  const draft=useRef('');
  const [paused,setPaused]=useState(false);
  const queue=useRef({items:[] as QueuedMessage[],running:false,paused:false,cancelled:false,
    token:'',slug,nextAllowed:0,timer:0,wake:()=>{}});
  const saveQueue=(state:typeof queue.current)=>{
    try{sessionStorage.setItem('vvd_ai_outbox_'+state.slug,JSON.stringify({token:state.token,items:state.items}));}catch{/* In-memory queue still retains messages. */}
  };
  const drain=async()=>{
    const state=queue.current;
    if(state.running||state.paused||state.cancelled||!state.token)return;
    state.running=true;setBusy(true);
    try{
      while(!state.cancelled&&!state.paused){
        const item=state.items.find(item=>item.status==='pending');
        if(!item)break;
        const delay=Math.max(0,state.nextAllowed-Date.now());
        if(delay)await new Promise<void>(resolve=>{state.wake=resolve;state.timer=window.setTimeout(resolve,delay);});
        if(state.cancelled)break;
        item.status='sending';saveQueue(state);
        try{
          const answer=await aiApi.send(state.slug,state.token,item.content);
          if(state.cancelled)break;
          state.items=state.items.filter(entry=>entry.id!==item.id);saveQueue(state);
          // Keep each answer beside its own message, before later queued turns.
          setEntries(prev=>{
            const index=prev.findIndex(entry=>entry.queueId===item.id);
            return index<0?prev:[...prev.slice(0,index+1),answer,...prev.slice(index+1)];
          });
          // Existing server cooldown: wait after completion, not just after starting fetch.
          state.nextAllowed=Date.now()+3100;
        }catch(e){
          if(state.cancelled)break;
          item.status='failed';state.paused=true;saveQueue(state);setPaused(true);
          setError(err(e)+' Сообщение «'+item.content+'» сохранено. Ответ не получен; запрос не будет повторён автоматически. Остальные сообщения остаются в очереди.');
        }
      }
    }finally{
      state.running=false;
      if(!state.cancelled)setBusy(false);
    }
  };
  const continueQueue=()=>{
    const state=queue.current;
    state.paused=false;setPaused(false);state.nextAllowed=Date.now()+3100;
    void drain();
  };
  useEffect(()=>{
    let active=true;
    const state={items:[] as QueuedMessage[],running:false,paused:false,cancelled:false,
      token:'',slug,nextAllowed:0,timer:0,wake:()=>{}};
    queue.current=state;draft.current='';setText('');setSession(null);setEntries([]);setBusy(false);setPaused(false);setError('');
    async function load(){
      try{
        const p=await marketApi.publicModel(slug);
        const key='vvd_ai_session_'+slug;
        const previousToken=(()=>{try{return localStorage.getItem(key)||sessionStorage.getItem(key);}catch{return sessionStorage.getItem(key);}})();
        const s=await aiApi.begin(slug,previousToken);
        if(!active)return;
        try{localStorage.setItem(key,s.token);}catch{/* Private browsing may block persistent storage. */}
        try{sessionStorage.setItem(key,s.token);}catch{/* Session storage may be unavailable. */}
        state.token=s.token;
        try{
          const saved=JSON.parse(sessionStorage.getItem('vvd_ai_outbox_'+slug)||'null');
          if(saved?.token===s.token&&Array.isArray(saved.items)){
            state.items=saved.items.filter((item:QueuedMessage)=>item&&typeof item.id==='string'&&typeof item.content==='string'&&item.content.length<=1000&&['pending','sending','failed'].includes(item.status));
            state.items.forEach(item=>{if(item.status==='sending')item.status='failed';});
          }
        }catch{/* Ignore malformed local storage, never invent or resend a request. */}
        const pending=state.items.filter(item=>item.status==='pending');
        const uncertain=state.items.filter(item=>item.status==='failed');
        if(state.items.length){
          state.paused=true;setPaused(true);
          setError('Сохранённая очередь восстановлена. '+(uncertain.length?'Проверьте историю: ответ не был получен для '+uncertain.map(item=>'«'+item.content+'»').join(', ')+'. Эти запросы не повторяются автоматически. ':''));
        }
        saveQueue(state);
        setPerson(p);setSession(s);setEntries([...s.messages,...pending.map(item=>({role:'user' as const,content:item.content,queueId:item.id}))]);
      }catch(e){if(active)setError(err(e));}
    }
    void load();return()=>{active=false;state.cancelled=true;window.clearTimeout(state.timer);state.wake();};
  },[slug]);
  useEffect(()=>{bottom.current?.scrollIntoView({behavior:'smooth'});},[entries,busy]);
  const send=(e:React.FormEvent)=>{
    e.preventDefault();
    const message=draft.current.trim();
    if(!message||!session?.can_chat)return;
    const state=queue.current;
    if(state.cancelled||state.token!==session.token)return;
    const item:QueuedMessage={id:crypto.randomUUID(),content:message,status:'pending'};
    // Consume the draft synchronously so double submit cannot enqueue it twice.
    draft.current='';setText('');
    state.items.push(item);saveQueue(state);
    setEntries(prev=>[...prev,{role:'user',content:message,queueId:item.id}]);
    if(!state.paused)void drain();
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
        <p className="flex items-center gap-1.5 text-xs text-textSecondary">{session?.can_chat?<><span aria-hidden="true" className="h-1.5 w-1.5 shrink-0 rounded-full bg-green-500"/>В сети</>:'Общение временно недоступно'}</p></div>
      <button type="button" onClick={()=>setInfo(!info)} aria-label="Информация о чате" className="rounded-full border border-white/10 p-2 text-accentBrightGold"><Info size={20}/></button>
    </header>
    {info&&<section className="border-b border-white/10 bg-bgCard p-4 text-sm">
      <b>Виртуальный собеседник</b>
      <p className="mt-1 text-xs leading-5 text-textSecondary">Вы общаетесь с искусственным интеллектом, а не с реальным человеком. Ответы могут содержать ошибки. Не отправляйте личные данные. Ссылки на предложения — реклама.</p>
      {person?.description&&<p className="mt-2 text-xs text-textSecondary">{person.description}</p>}
    </section>}
    <div className="flex-1 space-y-4 overflow-y-auto px-4 py-5" aria-live="polite">
      {person&&<div className="max-w-[87%] rounded-2xl rounded-tl-sm bg-bgCard px-4 py-3 text-sm leading-6">{person.greeting||'Привет!'}</div>}
      {entries.map((m,i)=><div key={i} className={'flex '+(m.role==='user'?'justify-end':'justify-start')}>
        <div className={'max-w-[87%] whitespace-pre-wrap break-words rounded-2xl px-4 py-3 text-sm leading-6 '+(m.role==='user'?'rounded-tr-sm bg-accentGold/20':'rounded-tl-sm bg-bgCard')}>{m.content}{m.photo&&<img src={fileUrl(m.photo.url)} alt={m.photo.title||'Фото персонажа'} className="mt-3 h-auto w-full rounded-xl" onLoad={()=>bottom.current?.scrollIntoView({behavior:'smooth'})}/>}{m.offer&&<button type="button" disabled={!adult} onClick={()=>void offer()} className="mt-3 block w-full rounded-app-xs border border-accentGold/40 p-3 text-left text-xs text-accentBrightGold disabled:opacity-60">Реклама · {m.offer.title} →</button>}
        </div>
      </div>)}
      {busy&&<div className="flex w-fit items-center gap-1.5 rounded-2xl rounded-tl-sm bg-bgCard px-4 py-4" role="status" aria-label="AI печатает">
        {[0,1,2].map(dot=><span key={dot} aria-hidden="true" className="h-1.5 w-1.5 rounded-full bg-accentBrightGold motion-safe:animate-pulse" style={{animationDelay:`${dot*200}ms`,animationDuration:'1.2s'}}/>)}
      </div>}
      {error&&<div role="alert" className="rounded-app-xs border border-white/10 p-3 text-xs text-textSecondary">{error}{paused&&queue.current.items.some(item=>item.status==='pending')&&<button type="button" onClick={continueQueue} className="mt-2 block text-accentBrightGold underline">Продолжить очередь</button>}</div>}
      <div ref={bottom}/>
    </div>
    <div className="shrink-0 space-y-2 border-t border-white/10 bg-bgCard px-3 py-3 pb-[max(14px,env(safe-area-inset-bottom))]">
      {person?.affiliate_url&&<label className="flex items-center gap-2 text-xs text-textSecondary"><input type="checkbox" checked={adult} onChange={e=>setAdult(e.target.checked)}/> Подтверждаю, что мне есть 18 лет</label>}
      {person?.affiliate_url&&<button type="button" onClick={()=>void offer()} disabled={!session||!adult} className="flex w-full items-center justify-center gap-2 rounded-app-xs bg-gold-gradient px-4 py-3 text-sm font-bold text-bgMain disabled:opacity-50">
        <ExternalLink size={16}/>{person.button_label||'Посмотреть предложение'} <span className="text-[10px] font-normal">· Реклама</span>
      </button>}
      <form onSubmit={send} className="flex gap-2">
        <input type="text" value={text} maxLength={1000} disabled={!session?.can_chat}
          onChange={e=>{draft.current=e.target.value;setText(e.target.value);}} placeholder={session?.can_chat?'Написать сообщение…':'Чат пока недоступен'}
          aria-label="Сообщение" className="min-w-0 flex-1 rounded-app-xs border border-white/10 bg-bgMain px-4 py-3 text-sm outline-none focus:border-accentGold/50 disabled:opacity-60"/>
        <button type="submit" aria-label="Отправить" disabled={!text.trim()||!session?.can_chat}
          className="rounded-app-xs bg-accentGold px-4 text-bgMain disabled:opacity-40"><Send size={19}/></button>
      </form>
    </div>
  </div>;
};
