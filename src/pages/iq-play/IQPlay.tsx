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
  const audioRef=useRef<HTMLAudioElement|null>(null);
  const musicRef=useRef<HTMLAudioElement|null>(null);
  const musicUrlRef=useRef<string|null>(null);
  const mutedRef=useRef(true);

  type Sound='intro'|'correct'|'wrong'|'win'|'lose'|'tick';
  const contextRef=useRef<AudioContext|null>(null);
  const musicTimerRef=useRef<number|null>(null);
  const musicStepRef=useRef(0);
  const nextBeatRef=useRef(0);
  const soundNodesRef=useRef<Set<OscillatorNode>>(new Set());
  const audioContext=()=>{
    if(!contextRef.current)contextRef.current=new AudioContext();
    if(contextRef.current.state==='suspended')void contextRef.current.resume();
    return contextRef.current;
  };
  // Original cinematic quiz score, synthesized in real time with layered orchestral timbres.
  const tone=(ctx:AudioContext,at:number,freq:number,duration:number,volume:number,
    timbre:'strings'|'brass'|'bell'|'bass'|'pulse')=>{
    const output=ctx.createGain(),filter=ctx.createBiquadFilter();
    filter.type='lowpass';filter.frequency.value=timbre==='bell'?5200:timbre==='brass'?1900:1300;
    output.connect(filter);filter.connect(ctx.destination);
    const attack=timbre==='strings'?.16:timbre==='brass'?.045:.008;
    const release=timbre==='strings'?.25:timbre==='bell'?.35:.14;
    output.gain.setValueAtTime(.0001,at);
    output.gain.exponentialRampToValueAtTime(Math.max(.0002,volume),at+attack);
    output.gain.setValueAtTime(Math.max(.0002,volume),at+Math.max(attack+.01,duration-release));
    output.gain.exponentialRampToValueAtTime(.0001,at+duration);
    const voices=timbre==='strings'?[[-6,.42],[0,.5],[6,.42]]:timbre==='brass'?[[-3,.45],[0,.6],[3,.45]]:[[0,1]];
    voices.forEach(([cents,mix])=>{
      const osc=ctx.createOscillator(),gain=ctx.createGain();
      osc.type=timbre==='bell'?'sine':timbre==='bass'?'triangle':timbre==='pulse'?'sine':'sawtooth';
      osc.frequency.value=freq;osc.detune.value=cents;
      gain.gain.value=mix;osc.connect(gain);gain.connect(output);
      osc.start(at);osc.stop(at+duration+.02);
      soundNodesRef.current.add(osc);
      osc.onended=()=>{soundNodesRef.current.delete(osc);gain.disconnect();};
    });
  };
  const hit=(ctx:AudioContext,at:number,volume=.11)=>{
    const osc=ctx.createOscillator(),gain=ctx.createGain(),filter=ctx.createBiquadFilter();
    osc.type='triangle';osc.frequency.setValueAtTime(105,at);
    osc.frequency.exponentialRampToValueAtTime(45,at+.18);
    filter.type='lowpass';filter.frequency.value=500;
    gain.gain.setValueAtTime(volume,at);
    gain.gain.exponentialRampToValueAtTime(.0001,at+.24);
    osc.connect(filter);filter.connect(gain);gain.connect(ctx.destination);
    osc.start(at);osc.stop(at+.25);
  };
  const playSound=useCallback((kind:Sound)=>{
    if(mutedRef.current)return;
    const ctx=audioContext(),t=ctx.currentTime+.015;
    const chord=(notes:number[],at:number,duration:number,volume:number,timbre:'strings'|'brass')=>
      notes.forEach(n=>tone(ctx,at,n,duration,volume,timbre));
    if(kind==='intro'){
      hit(ctx,t,.17);chord([196,293.66,392],t,.85,.032,'strings');
      chord([261.63,392,523.25],t+.55,1.15,.042,'brass');
    }else if(kind==='correct'){
      hit(ctx,t,.11);
      chord([392,493.88,587.33],t,.5,.038,'brass');
      tone(ctx,t+.22,783.99,.65,.11,'bell');
    }else if(kind==='wrong'){
      hit(ctx,t,.21);
      chord([220,261.63,311.13],t,.85,.045,'brass');
      tone(ctx,t+.26,155.56,.85,.095,'bass');
    }else if(kind==='win'){
      [0,.26,.52,.78].forEach((d,i)=>{hit(ctx,t+d,.14);tone(ctx,t+d,[392,493.88,587.33,783.99][i],.9,.09,'bell');});
      chord([261.63,329.63,392,523.25],t+.8,2.1,.05,'brass');
      chord([523.25,659.25,783.99],t+1.12,1.9,.035,'strings');
    }else if(kind==='lose'){
      hit(ctx,t,.22);chord([233.08,293.66,349.23],t,1.2,.042,'brass');
      chord([196,233.08,293.66],t+.55,1.65,.035,'strings');
      tone(ctx,t+.65,98,1.3,.1,'bass');
    }else{
      tone(ctx,t,880,.11,.055,'bell');
    }
  },[]);
  const stopMusic=()=>{
    if(musicTimerRef.current!==null){window.clearInterval(musicTimerRef.current);musicTimerRef.current=null;}
    // Stop only future scheduled notes when muting; allow brief effects to decay.
    soundNodesRef.current.forEach(o=>{try{o.stop();}catch{/* already stopped */}});
    soundNodesRef.current.clear();
  };
  const startMusic=()=>{
    if(musicTimerRef.current!==null)return;
    const ctx=audioContext(),beat=.68;
    musicStepRef.current=0;nextBeatRef.current=ctx.currentTime+.08;
    const roots=[146.83,130.81,164.81,123.47,146.83,174.61,130.81,146.83];
    const harmonies=[[293.66,349.23,440],[261.63,329.63,392],[329.63,392,493.88],
      [246.94,311.13,369.99],[293.66,349.23,440],[349.23,440,523.25],
      [261.63,329.63,392],[293.66,349.23,440]];
    const motif=[587.33,0,698.46,0,659.25,587.33,0,523.25,
      659.25,0,783.99,698.46,0,659.25,587.33,0];
    const schedule=()=>{
      while(nextBeatRef.current<ctx.currentTime+.28){
        const step=musicStepRef.current,bar=Math.floor(step/4)%8,pos=step%4,at=nextBeatRef.current;
        if(pos===0){
          harmonies[bar].forEach(f=>tone(ctx,at,f,beat*3.98,.014,'strings'));
          hit(ctx,at,.075);
        }
        tone(ctx,at,roots[bar]/2,beat*.7,.046,'bass');
        if(pos===2)hit(ctx,at,.055);
        const note=motif[step%16];
        if(note)tone(ctx,at+.12,note,beat*.7,.035,'bell');
        musicStepRef.current++;
        nextBeatRef.current+=beat;
      }
    };
    schedule();
    musicTimerRef.current=window.setInterval(schedule,100);
  };
  const toggleSound=()=>{
    if(muted){mutedRef.current=false;setMuted(false);startMusic();playSound('intro');}
    else{mutedRef.current=true;setMuted(true);stopMusic();}
  };
  useEffect(()=>()=>{stopMusic();if(contextRef.current)void contextRef.current.close();},[]);
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
  const start=async()=>{if(!muted)playSound('intro');setBusy(true);setError('');setFeedback('');try{sync(await apiRequest<Round>('/iq-play/rounds',{method:'POST'}));}catch(e){setError(e instanceof Error?e.message:'Не удалось начать игру');}finally{setBusy(false);}};
  const answer=async(choice:number)=>{if(!round||busy||round.status!=='active'||choice===round.blocked_index)return;
    setBusy(true);setError('');
    try{const response=await apiRequest<Response>(`/iq-play/rounds/${round.round_id}/answers`,{method:'POST',body:JSON.stringify({position:round.position,choice,event_id:crypto.randomUUID()})});
      if(!muted)playSound(response.round.status==='won'?'win':response.round.status==='lost'?'lose':response.outcome==='wrong'?'wrong':'correct');
      setFeedback(response.outcome==='wrong'?'Неверно! Используй второй шанс.':'');
      sync(response.round);
      if(response.round.status!=='active')setProfile(await apiRequest<Profile>('/iq-play/profile'));
    }catch{setError('Ответ не отправлен. Проверьте соединение и повторите.');}
    finally{setBusy(false);}
  };
  const seconds=remaining(round?.deadline,offset);
  const lastTickRef=useRef('');
  useEffect(()=>{
    if(muted||round?.status!=='active'||seconds<1||seconds>5)return;
    const key=round.round_id+':'+round.position+':'+round.retry+':'+seconds;
    if(lastTickRef.current!==key){lastTickRef.current=key;playSound('tick');}
  },[seconds,round?.round_id,round?.position,round?.retry,round?.status,muted,playSound]);
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
