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
  const [muted,setMuted]=useState(true);
  const audioRef=useRef<AudioContext|null>(null);
  const playNote=useCallback((frequency:number,duration=0.16,volume=0.025)=>{
    try{
      const ctx=audioRef.current ?? new AudioContext();
      audioRef.current=ctx;
      if(ctx.state==='suspended')void ctx.resume();
      const osc=ctx.createOscillator(),gain=ctx.createGain();
      osc.type='sine';osc.frequency.value=frequency;
      gain.gain.setValueAtTime(volume,ctx.currentTime);
      gain.gain.exponentialRampToValueAtTime(0.001,ctx.currentTime+duration);
      osc.connect(gain);gain.connect(ctx.destination);
      osc.start();osc.stop(ctx.currentTime+duration);
    }catch{/* Sound is optional. */}
  },[]);
  const toggleSound=()=>{
    if(muted){
      try{
        const ctx=audioRef.current ?? new AudioContext();
        audioRef.current=ctx;
        void ctx.resume().then(()=>playNote(880,0.32,0.09));
      }catch{playNote(880,0.32,0.09);}
    }
    setMuted(value=>!value);
  };
  useEffect(()=>{
    if(muted)return;
    const melody=[392,494,587,494,440,523,659,523];
    let index=0;
    const timer=window.setInterval(()=>playNote(melody[index++%melody.length],0.26,0.045),520);
    return()=>window.clearInterval(timer);
  },[muted,playNote]);
  useEffect(()=>()=>{if(audioRef.current)void audioRef.current.close();},[]);
  const [clock,setClock]=useState(0);
  const [offset,setOffset]=useState(0);
  const [feedback,setFeedback]=useState('');
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
  const start=async()=>{if(!muted)playNote(784);setBusy(true);setError('');setFeedback('');try{sync(await apiRequest<Round>('/iq-play/rounds',{method:'POST'}));}catch(e){setError(e instanceof Error?e.message:'Не удалось начать игру');}finally{setBusy(false);}};
  const answer=async(choice:number)=>{if(!round||busy||round.status!=='active'||choice===round.blocked_index)return;
    setBusy(true);setError('');
    try{const response=await apiRequest<Response>(`/iq-play/rounds/${round.round_id}/answers`,{method:'POST',body:JSON.stringify({position:round.position,choice,event_id:crypto.randomUUID()})});
      if(!muted)playNote(response.outcome==='wrong'?220:740);
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
    <header className="iq-header"><button onClick={()=>navigate('/')} aria-label="Назад"><ArrowLeft size={20}/></button><span>VVD <strong>IQ PLAY</strong></span><button onClick={toggleSound} aria-label={muted?'Включить звук':'Выключить звук'}>{muted?<VolumeX size={20}/>:<Volume2 size={20}/>}</button></header>
    <section className="iq-hero"><div className="iq-emblem"><Brain size={42}/><Crown size={20}/></div><h1>IQ PLAY</h1><p>Прокачай себя в арбитраже</p></section>
    {error&&<div className="iq-error" role="alert">{error}<button onClick={()=>void refresh()}>Повторить загрузку</button></div>}
    {loading?<p className="iq-muted">Загрузка…</p>:round?.status==='active'?<>
      <div className="iq-stats"><span>Вопрос {round.position} из 15</span><span>{round.retry?'Последний шанс':'❤️ 2 шанса'}</span></div>
      <div className="iq-progress"><div style={{width:`${(round.position-1)/15*100}%`}}/></div>
      <div className={`iq-timer ${seconds<=5?'urgent':''}`} role="timer" aria-label="Осталось секунд">{seconds}</div>
      <div className="iq-question">{round.prompt}</div>
      <div className="iq-choices">{round.options?.map((option,i)=><button key={i} disabled={busy||i===round.blocked_index||seconds===0} onClick={()=>void answer(i)}><b>{'ABCD'[i]}</b>{option}</button>)}</div>
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
