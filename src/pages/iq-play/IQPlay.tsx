import React, {useCallback,useEffect,useRef,useState} from 'react';
import {useNavigate} from 'react-router-dom';
import {Brain,Crown,ArrowLeft,Trophy,Volume2,VolumeX} from 'lucide-react';
import {apiRequest} from '@/shared/lib/api';
import './IQPlay.css';

type Profile={xp:number;games:number;wins:number;best_correct:number;level:number;league:string;achievements:string[]};
type Round={round_id:string;status:'active'|'won'|'lost';position:number;correct_count:number;round_xp:number;retry:boolean;server_now:string;prompt?:string;options?:string[];blocked_index?:number|null;deadline?:string;seconds?:number};
type Response={outcome:string;round:Round};
const initial:Profile={xp:0,games:0,wins:0,best_correct:0,level:1,league:'Новичок',achievements:[]};
const remaining=(deadline?:string,offset=0)=>deadline?Math.max(0,Math.ceil((new Date(deadline).getTime()-Date.now()-offset)/1000)):0;

export const IQPlay:React.FC=()=>{
  const navigate=useNavigate();
  const [profile,setProfile]=useState<Profile>(initial);
  const [round,setRound]=useState<Round|null>(null);
  const [loading,setLoading]=useState(true);
  const [busy,setBusy]=useState(false);
  const [error,setError]=useState('');
  const [musicMuted,setMusicMuted]=useState(false);
  const [musicError,setMusicError]=useState(false);
  const musicRef=useRef<HTMLAudioElement|null>(null);
  const fadeRef=useRef<number|null>(null);
  const musicSrc=`${import.meta.env.BASE_URL}audio/franzian-deo-question-thinking-time-472736.mp3`;
  const fadeMusic=(target:number)=>{
    const audio=musicRef.current;if(!audio)return;
    if(fadeRef.current!==null)window.clearInterval(fadeRef.current);
    fadeRef.current=window.setInterval(()=>{
      const delta=target-audio.volume;
      if(Math.abs(delta)<.015){
        audio.volume=target;
        if(fadeRef.current!==null)window.clearInterval(fadeRef.current);
        fadeRef.current=null;
      }else audio.volume=Math.max(0,Math.min(1,audio.volume+Math.sign(delta)*.012));
    },40);
  };
  const startMusic=()=>{
    const audio=musicRef.current;
    if(!audio||musicMuted)return;
    setMusicError(false);
    void audio.play().catch(()=>setMusicError(true));
  };
  const toggleMusic=()=>{
    const audio=musicRef.current;
    if(!audio)return;
    if(musicMuted){setMusicMuted(false);setMusicError(false);void audio.play().catch(()=>setMusicError(true));}
    else{setMusicMuted(true);audio.pause();}
  };
  useEffect(()=>()=>{
    if(fadeRef.current!==null)window.clearInterval(fadeRef.current);
    musicRef.current?.pause();
  },[]);
  useEffect(()=>{
    const audio=musicRef.current;
    if(!audio)return;
    if(round?.status==='active'&&!musicMuted){
      if(audio.paused)void audio.play().catch(()=>setMusicError(true));
    }else audio.pause();
  },[round?.status,musicMuted]);
  useEffect(()=>{
    if(!musicMuted&&round?.status==='active')fadeMusic(answerEffect?.kind==='correct'?.09:.25);
  },[answerEffect?.kind,round?.status,musicMuted]);
  const [clock,setClock]=useState(0);
  const [offset,setOffset]=useState(0);
  const [feedback,setFeedback]=useState('');
  const [answerEffect,setAnswerEffect]=useState<{kind:'correct'|'wrong'|'win'|'lose';xp:number}|null>(null);
  const effectTimer=useRef<number|null>(null);
  const showAnswerEffect=(kind:'correct'|'wrong'|'win'|'lose',xp:number)=>{
    if(effectTimer.current!==null)window.clearTimeout(effectTimer.current);
    setAnswerEffect({kind,xp});
    effectTimer.current=window.setTimeout(()=>{setAnswerEffect(null);effectTimer.current=null;},1050);
  };
  useEffect(()=>()=>{if(effectTimer.current!==null)window.clearTimeout(effectTimer.current);},[]);
  const sync=(r:Round)=>{setRound(r);setOffset(Date.now()-new Date(r.server_now).getTime());};
  const refresh=useCallback(async()=>{
    setError('');
    try {
      const [p,r]=await Promise.all([apiRequest<Profile>('/iq-play/profile'),apiRequest<Round|null>('/iq-play/rounds/active')]);
      setProfile(p);if(r)sync(r);
    }catch{setError('Не удалось загрузить игру. Проверьте соединение.');}
    finally{setLoading(false);}
  },[]);
  useEffect(()=>{void refresh();},[refresh]);
  useEffect(()=>{const id=window.setInterval(()=>setClock(x=>x+1),250);return()=>window.clearInterval(id);},[]);
  const start=async()=>{
    startMusic();
    setBusy(true);setError('');setFeedback('');setAnswerEffect(null);try{sync(await apiRequest<Round>('/iq-play/rounds',{method:'POST'}));}catch(e){setError(e instanceof Error?e.message:'Не удалось начать игру');}finally{setBusy(false);}};
  const answer=async(choice:number)=>{if(!round||busy||answerEffect||round.status!=='active'||choice===round.blocked_index)return;
    if(!musicMuted&&musicRef.current?.paused)startMusic();
    setBusy(true);setError('');
    try{const response=await apiRequest<Response>(`/iq-play/rounds/${round.round_id}/answers`,{method:'POST',body:JSON.stringify({position:round.position,choice,event_id:crypto.randomUUID()})});
      const effectKind=response.outcome==='correct'?(response.round.status==='won'?'win':'correct'):(response.round.status==='lost'?'lose':'wrong');
      const gained=Math.max(0,response.round.round_xp-round.round_xp);
      showAnswerEffect(effectKind,gained);
      setFeedback(response.outcome==='wrong'?'Неверно! Используй второй шанс.':'');
      sync(response.round);
      if(response.round.status!=='active')setProfile(await apiRequest<Profile>('/iq-play/profile'));
    }catch{setError('Ответ не отправлен. Проверьте соединение и повторите.');}
    finally{setBusy(false);}
  };
  const seconds=remaining(round?.deadline,offset);
  useEffect(()=>{
    if(!round||round.status!=='active'||seconds!==0||busy)return;
    let live=true;
    setBusy(true);
    void apiRequest<Round>(`/iq-play/rounds/${round.round_id}/timeout`,{method:'POST'})
      .then(r=>{if(live){sync(r);if(r.status!=='active')void apiRequest<Profile>('/iq-play/profile').then(setProfile);}})
      .catch(()=>{if(live)setError('Не удалось проверить таймер. Повторите попытку.');})
      .finally(()=>{if(live)setBusy(false);});
    return()=>{live=false;};
  },[round?.round_id,round?.deadline,round?.status,seconds]);
  return <main className={'iq-root'+(round?.status==='active'?' iq-playing':'')}>
    <audio ref={musicRef} src={musicSrc} preload="auto" loop onError={()=>setMusicError(true)} />
    <div className="iq-stage" aria-hidden="true"><div className="iq-stage-beam iq-beam-left"/><div className="iq-stage-beam iq-beam-right"/><div className="iq-stage-halo"/><div className="iq-stage-dots"/><div className="iq-audience"><span/><span/><span/><span/><span/><span/><span/><span/><span/><span/><span/><span/></div></div>
    {answerEffect&&<div className={'iq-answer-effect iq-effect-'+answerEffect.kind} role="status" aria-live="polite">
      <div className="iq-effect-card"><div className="iq-effect-symbol">{answerEffect.kind==='correct'?'✓':answerEffect.kind==='win'?'★':'✕'}</div>
      <strong>{answerEffect.kind==='correct'?'ПРАВИЛЬНО!':answerEffect.kind==='win'?'ПОБЕДА!':answerEffect.kind==='lose'?'ИГРА ОКОНЧЕНА':'НЕВЕРНО!'}</strong>
      {answerEffect.xp>0&&<span className="iq-effect-xp">+{answerEffect.xp} XP</span>}
      {answerEffect.kind==='wrong'&&<small>Используй второй шанс</small>}</div>
    </div>}
    <header className="iq-header"><button onClick={()=>navigate('/')} aria-label="Назад"><ArrowLeft size={20}/></button><span>VVD <strong>IQ PLAY</strong></span><button onClick={toggleMusic} aria-label={musicMuted?'Включить музыку':'Выключить музыку'}>{musicMuted?<VolumeX size={20}/>:<Volume2 size={20}/>}</button></header>
    <section className="iq-hero"><div className="iq-emblem"><Brain size={42}/><Crown size={20}/></div><h1>IQ PLAY</h1><p>Прокачай себя в арбитраже</p></section>
    {musicError&&!musicMuted&&<p className="iq-warning" role="status">Музыка не запустилась. Нажми на значок динамика, чтобы включить её.</p>}
    {error&&<div className="iq-error" role="alert">{error}<button onClick={()=>void refresh()}>Повторить загрузку</button></div>}
    {loading?<p className="iq-muted">Загрузка…</p>:round?.status==='active'?<>
      <div className="iq-show-label">VVD · ИНТЕЛЛЕКТУАЛЬНОЕ ШОУ</div>
      <div className="iq-stats"><span>Вопрос {round.position} из 15</span><span>{round.retry?'Последний шанс':'❤️ 2 шанса'}</span></div>
      <div className="iq-progress"><div style={{width:`${(round.position-1)/15*100}%`}}/></div>
      <div className={`iq-timer ${seconds<=5?'urgent':''}`} role="timer" aria-label="Осталось секунд" style={{'--iq-time':`${Math.max(0,Math.min(100,seconds/(round.retry?10:round.seconds||30)*100))}%`} as React.CSSProperties}>{seconds}</div>
      <div className="iq-question"><span className="iq-question-label">ВОПРОС НА ЭКРАНЕ</span><span>{round.prompt}</span></div>
      <div className="iq-choices">{round.options?.map((option,i)=><button key={i} disabled={busy||!!answerEffect||i===round.blocked_index||seconds===0} onClick={()=>void answer(i)}><b>{'ABCD'[i]}</b>{option}</button>)}</div>
      {round.retry&&<p className="iq-warning" role="status">Неверный ответ или истекло время. Остался один шанс — 10 секунд.</p>}
      {feedback&&<p className="iq-muted">{feedback}</p>}
      {seconds===0&&<p className="iq-muted">Проверяем таймер на сервере…</p>}
      <p className="iq-muted">За раунд: {round.round_xp} XP</p>
    </>:round?<>
      <div className="iq-result">{round.status==='won'?<Trophy size={64}/>:<Brain size={64}/>}<h2>{round.status==='won'?'ПОБЕДА!':'ИГРА ОКОНЧЕНА'}</h2><p>Правильных ответов: {round.correct_count} / 15</p><p>Заработано {round.round_xp} XP</p></div>
      <button className="iq-primary" disabled={busy} onClick={()=>void start()}>Играть снова</button>
    </>:<>
      <div className="iq-profile"><Crown size={34}/><div><b>{profile.league} · уровень {profile.level}</b><span>{profile.xp.toLocaleString('ru-RU')} XP</span></div></div>
      <div className="iq-grid"><div>🏆<b>{profile.best_correct}/15</b><span>Рекорд</span></div><div>🎮<b>{profile.games}</b><span>Раундов</span></div><div>👑<b>{profile.wins}</b><span>Побед</span></div><div>⭐<b>{profile.achievements.length}/7</b><span>Наград</span></div></div>
      <button className="iq-primary" disabled={busy} onClick={()=>void start()}>{busy?'Загрузка…':'▶ НАЧАТЬ ИГРУ'}</button>
      <p className="iq-muted">15 вопросов · 2 шанса · до 1 800 XP за раунд</p>
    </>}
  </main>;
};
