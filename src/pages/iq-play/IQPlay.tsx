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
  const mutedRef=useRef(true);
  const applauseRef=useRef<HTMLAudioElement|null>(null);
  const applauseStopRef=useRef<number|null>(null);
  const applauseUrl=`${import.meta.env.BASE_URL}audio/iq-crowd-cheer-and-applause.mp3`;
  const playRealApplause=(full:boolean)=>{
    if(mutedRef.current)return;
    if(applauseStopRef.current!==null)window.clearTimeout(applauseStopRef.current);
    if(applauseRef.current){applauseRef.current.pause();applauseRef.current.currentTime=0;}
    const audio=new Audio(applauseUrl);audio.volume=full?.78:.58;
    applauseRef.current=audio;
    void audio.play().catch(()=>{/* Audio file unavailable or playback blocked */});
    if(!full)applauseStopRef.current=window.setTimeout(()=>{
      audio.volume=.2;window.setTimeout(()=>{audio.pause();},200);
    },1700);
  };

  type Sound='intro'|'correct'|'wrong'|'win'|'lose'|'tick';
  const contextRef=useRef<AudioContext|null>(null);
  const musicTimerRef=useRef<number|null>(null);
  const musicStepRef=useRef(0);
  const nextBeatRef=useRef(0);
  const suspenseRef=useRef(false);
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
  // Procedural studio audience: filtered crowd wash, staggered claps and room reflections.
  // Uses no external recordings and remains silent until sound is enabled.
  const crowdBufferRef=useRef<AudioBuffer|null>(null);
  const crowdBedRef=useRef<{source:AudioBufferSourceNode;gain:GainNode}|null>(null);
  const noiseBuffer=(ctx:AudioContext)=>{
    if(crowdBufferRef.current)return crowdBufferRef.current;
    const buffer=ctx.createBuffer(1,ctx.sampleRate*3,ctx.sampleRate),data=buffer.getChannelData(0);
    let prev=0;
    for(let i=0;i<data.length;i++){
      prev=prev*.93+(Math.random()*2-1)*.07;
      data[i]=prev;
    }
    crowdBufferRef.current=buffer;
    return buffer;
  };
  const studioClap=(ctx:AudioContext,at:number,level:number)=>{
    const source=ctx.createBufferSource(),filter=ctx.createBiquadFilter(),gain=ctx.createGain();
    source.buffer=noiseBuffer(ctx);filter.type='bandpass';filter.frequency.value=850+Math.random()*1800;
    filter.Q.value=.55;gain.gain.setValueAtTime(.0001,at);
    gain.gain.exponentialRampToValueAtTime(level,at+.008);
    gain.gain.exponentialRampToValueAtTime(.0001,at+.075+Math.random()*.065);
    source.connect(filter);filter.connect(gain);gain.connect(ctx.destination);
    source.start(at,Math.random()*2);source.stop(at+.17);
  };
  const audience=(ctx:AudioContext,at:number,kind:'applause'|'ovation'|'gasp')=>{
    const duration=kind==='ovation'?3.2:kind==='applause'?1.4:.7;
    if(kind==='gasp'){
      const src=ctx.createBufferSource(),filter=ctx.createBiquadFilter(),gain=ctx.createGain();
      src.buffer=noiseBuffer(ctx);filter.type='bandpass';filter.frequency.value=520;filter.Q.value=.42;
      gain.gain.setValueAtTime(.0001,at);gain.gain.linearRampToValueAtTime(.16,at+.16);
      gain.gain.exponentialRampToValueAtTime(.0001,at+duration);
      src.connect(filter);filter.connect(gain);gain.connect(ctx.destination);
      src.start(at,.2);src.stop(at+duration);
      return;
    }
    const count=kind==='ovation'?95:36;
    for(let i=0;i<count;i++){
      const time=at+.07+Math.random()*duration*.86;
      const swell=Math.min(1,(time-at)/.35,(at+duration-time)/.32);
      studioClap(ctx,time,(kind==='ovation'?.16:.115)*Math.max(.15,swell));
    }
  };
  const startAudienceBed=()=>{
    if(crowdBedRef.current)return;
    const ctx=audioContext(),source=ctx.createBufferSource(),filter=ctx.createBiquadFilter(),gain=ctx.createGain();
    source.buffer=noiseBuffer(ctx);source.loop=true;
    filter.type='lowpass';filter.frequency.value=440;
    gain.gain.value=.0001;
    source.connect(filter);filter.connect(gain);gain.connect(ctx.destination);
    source.start();gain.gain.setTargetAtTime(.055,ctx.currentTime,.6);
    crowdBedRef.current={source,gain};
  };
  const stopAudienceBed=()=>{
    const bed=crowdBedRef.current;if(!bed)return;
    const ctx=contextRef.current;
    if(ctx){bed.gain.gain.setTargetAtTime(.0001,ctx.currentTime,.12);
      try{bed.source.stop(ctx.currentTime+.5);}catch{/* already stopped */}}
    crowdBedRef.current=null;
  };
  const playSound=useCallback((kind:Sound)=>{
    if(mutedRef.current)return;
    const ctx=audioContext(),t=ctx.currentTime+.015;
    const chord=(notes:number[],at:number,duration:number,volume:number,timbre:'strings'|'brass')=>
      notes.forEach(n=>tone(ctx,at,n,duration,volume,timbre));
    if(kind==='intro'){
      audience(ctx,t+.18,'applause');hit(ctx,t,.17);chord([196,293.66,392],t,.85,.032,'strings');
      chord([261.63,392,523.25],t+.55,1.15,.042,'brass');
    }else if(kind==='correct'){
      playRealApplause(false);hit(ctx,t,.11);
      chord([392,493.88,587.33],t,.5,.038,'brass');
      tone(ctx,t+.22,783.99,.65,.11,'bell');
    }else if(kind==='wrong'){
      audience(ctx,t+.1,'gasp');hit(ctx,t,.21);
      chord([220,261.63,311.13],t,.85,.045,'brass');
      tone(ctx,t+.26,155.56,.85,.095,'bass');
    }else if(kind==='win'){
      playRealApplause(true);[0,.26,.52,.78].forEach((d,i)=>{hit(ctx,t+d,.14);tone(ctx,t+d,[392,493.88,587.33,783.99][i],.9,.09,'bell');});
      chord([261.63,329.63,392,523.25],t+.8,2.1,.05,'brass');
      chord([523.25,659.25,783.99],t+1.12,1.9,.035,'strings');
    }else if(kind==='lose'){
      audience(ctx,t+.1,'gasp');hit(ctx,t,.22);chord([233.08,293.66,349.23],t,1.2,.042,'brass');
      chord([196,233.08,293.66],t+.55,1.65,.035,'strings');
      tone(ctx,t+.65,98,1.3,.1,'bass');
    }else{
      tone(ctx,t,880,.11,.055,'bell');
    }
  },[]);
  const stopMusic=()=>{
    stopAudienceBed();
    if(applauseStopRef.current!==null)window.clearTimeout(applauseStopRef.current);
    applauseRef.current?.pause();
    if(musicTimerRef.current!==null){window.clearInterval(musicTimerRef.current);musicTimerRef.current=null;}
    // Stop only future scheduled notes when muting; allow brief effects to decay.
    soundNodesRef.current.forEach(o=>{try{o.stop();}catch{/* already stopped */}});
    soundNodesRef.current.clear();
  };
  const startMusic=()=>{
    if(musicTimerRef.current!==null)return;
    const ctx=audioContext(),beat=.53;
    startAudienceBed();
    musicStepRef.current=0;nextBeatRef.current=ctx.currentTime+.09;
    // Original 16-bar TV-quiz-inspired score: alternating motifs, harmonic turns,
    // string ostinato, brass swells, timpani and an accelerated suspense layer.
    const chords=[
      [146.83,293.66,349.23,440],[130.81,261.63,329.63,392],
      [164.81,329.63,392,493.88],[123.47,246.94,311.13,369.99],
      [174.61,349.23,440,523.25],[146.83,293.66,369.99,440],
      [130.81,261.63,329.63,440],[164.81,329.63,415.3,493.88],
      [146.83,293.66,349.23,440],[196,392,493.88,587.33],
      [174.61,349.23,440,523.25],[164.81,329.63,392,493.88],
      [130.81,261.63,329.63,392],[123.47,246.94,311.13,415.3],
      [146.83,293.66,369.99,440],[146.83,293.66,349.23,440]
    ];
    const lead=[
      587.33,0,698.46,783.99,880,0,783.99,698.46,
      659.25,0,587.33,523.25,493.88,0,587.33,659.25,
      698.46,783.99,880,0,1046.5,880,783.99,698.46,
      659.25,0,783.99,659.25,587.33,523.25,493.88,0,
      698.46,0,880,1046.5,1174.66,0,1046.5,880,
      783.99,698.46,659.25,0,880,783.99,698.46,0,
      659.25,0,783.99,880,987.77,880,783.99,659.25,
      587.33,698.46,783.99,0,659.25,587.33,523.25,0
    ];
    const schedule=()=>{
      while(nextBeatRef.current<ctx.currentTime+.3){
        const step=musicStepRef.current,bar=Math.floor(step/4)%16,pos=step%4,at=nextBeatRef.current;
        const harmony=chords[bar],intense=suspenseRef.current;
        if(pos===0){
          harmony.slice(1).forEach(f=>tone(ctx,at,f,beat*3.85,intense?.024:.016,'strings'));
          if(bar%2===0)tone(ctx,at+.07,harmony[2]/2,beat*3.5,.026,'brass');
          hit(ctx,at,intense?.13:.07);
        }
        // Pulsing low strings and syncopated rhythmic movement.
        tone(ctx,at,harmony[0]/2,beat*.72,intense?.07:.048,'bass');
        tone(ctx,at+.25*beat,harmony[1],beat*.38,.014,'strings');
        if(pos===2)hit(ctx,at,intense?.09:.048);
        if(pos===1||pos===3)tone(ctx,at+.16*beat,harmony[2],beat*.32,.013,'strings');
        const melody=lead[step%lead.length];
        if(melody)tone(ctx,at+.08,melody,beat*(pos===3?1.35:.86),intense?.06:.046,
          bar%4===3?'brass':'bell');
        if(intense){
          tone(ctx,at+.5*beat,harmony[0]*2,beat*.27,.028,'pulse');
          if(pos===3)hit(ctx,at+.55*beat,.075);
        }
        musicStepRef.current++;
        nextBeatRef.current+=beat;
      }
    };
    schedule();
    musicTimerRef.current=window.setInterval(schedule,90);
  };
  const toggleSound=()=>{
    if(muted){mutedRef.current=false;setMuted(false);startMusic();playSound('intro');}
    else{mutedRef.current=true;setMuted(true);stopMusic();}
  };
  useEffect(()=>()=>{stopMusic();if(contextRef.current)void contextRef.current.close();},[]);
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
  const start=async()=>{if(!muted)playSound('intro');setBusy(true);setError('');setFeedback('');setAnswerEffect(null);try{sync(await apiRequest<Round>('/iq-play/rounds',{method:'POST'}));}catch(e){setError(e instanceof Error?e.message:'Не удалось начать игру');}finally{setBusy(false);}};
  const answer=async(choice:number)=>{if(!round||busy||answerEffect||round.status!=='active'||choice===round.blocked_index)return;
    setBusy(true);setError('');
    try{const response=await apiRequest<Response>(`/iq-play/rounds/${round.round_id}/answers`,{method:'POST',body:JSON.stringify({position:round.position,choice,event_id:crypto.randomUUID()})});
      const effectKind=response.outcome==='correct'?(response.round.status==='won'?'win':'correct'):(response.round.status==='lost'?'lose':'wrong');
      const gained=Math.max(0,response.round.round_xp-round.round_xp);
      showAnswerEffect(effectKind,gained);
      if(!muted)playSound(effectKind);
      setFeedback(response.outcome==='wrong'?'Неверно! Используй второй шанс.':'');
      sync(response.round);
      if(response.round.status!=='active')setProfile(await apiRequest<Profile>('/iq-play/profile'));
    }catch{setError('Ответ не отправлен. Проверьте соединение и повторите.');}
    finally{setBusy(false);}
  };
  const seconds=remaining(round?.deadline,offset);
  suspenseRef.current=round?.status==='active'&&seconds<=7&&seconds>0;
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
    <div className="iq-stage" aria-hidden="true"><div className="iq-stage-beam iq-beam-left"/><div className="iq-stage-beam iq-beam-right"/><div className="iq-stage-halo"/><div className="iq-stage-dots"/><div className="iq-audience"><span/><span/><span/><span/><span/><span/><span/><span/><span/><span/><span/><span/></div></div>
    {answerEffect&&<div className={'iq-answer-effect iq-effect-'+answerEffect.kind} role="status" aria-live="polite">
      <div className="iq-effect-card"><div className="iq-effect-symbol">{answerEffect.kind==='correct'?'✓':answerEffect.kind==='win'?'★':'✕'}</div>
      <strong>{answerEffect.kind==='correct'?'ПРАВИЛЬНО!':answerEffect.kind==='win'?'ПОБЕДА!':answerEffect.kind==='lose'?'ИГРА ОКОНЧЕНА':'НЕВЕРНО!'}</strong>
      {answerEffect.xp>0&&<span className="iq-effect-xp">+{answerEffect.xp} XP</span>}
      {answerEffect.kind==='wrong'&&<small>Используй второй шанс</small>}</div>
    </div>}
    <header className="iq-header"><button onClick={()=>navigate('/')} aria-label="Назад"><ArrowLeft size={20}/></button><span>VVD <strong>IQ PLAY</strong></span><button onClick={toggleSound} aria-label={muted?'Включить звук':'Выключить звук'}>{muted?<VolumeX size={20}/>:<Volume2 size={20}/>}</button></header>
    <section className="iq-hero"><div className="iq-emblem"><Brain size={42}/><Crown size={20}/></div><h1>IQ PLAY</h1><p>Прокачай себя в арбитраже</p></section>
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
