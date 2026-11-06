import React, {useCallback,useEffect,useRef,useState} from 'react';
import {useNavigate} from 'react-router-dom';
import {Brain,Crown,ArrowLeft,Trophy,Volume2,VolumeX} from 'lucide-react';
import {apiRequest} from '@/shared/lib/api';
import './IQPlay.css';

type Profile={xp:number;games:number;wins:number;best_correct:number;level:number;league:string;achievements:string[]};
type Round={round_id:string;status:'active'|'won'|'lost';position:number;correct_count:number;round_xp:number;retry:boolean;server_now:string;prompt?:string;options?:string[];blocked_index?:number|null;deadline?:string;seconds?:number};
type Response={outcome:string;round:Round};
type Leader={rank:number|null;name:string;photo_url?:string|null;xp:number;wins:number;is_admin:boolean;is_me:boolean};
type Leaderboard={leaders:Leader[];bosses:Leader[];me:Leader|null};
const PlayerAvatar:React.FC<{player:Leader}>=({player})=>{const [broken,setBroken]=useState(false);return <span className="iq-player-avatar">{player.photo_url&&!broken?<img src={player.photo_url} alt="" onError={()=>setBroken(true)} referrerPolicy="no-referrer"/>:<span>{player.name.charAt(0).toUpperCase()}</span>}</span>;};
const initial:Profile={xp:0,games:0,wins:0,best_correct:0,level:1,league:'Новичок',achievements:[]};
const remaining=(deadline?:string,offset=0)=>deadline?Math.max(0,Math.ceil((new Date(deadline).getTime()-Date.now()-offset)/1000)):0;

export const IQPlay:React.FC=()=>{
  const navigate=useNavigate();
  const [profile,setProfile]=useState<Profile>(initial);
  const [round,setRound]=useState<Round|null>(null);
  const [showGame,setShowGame]=useState(false);
  const [showLeaders,setShowLeaders]=useState(false);
  const [leaderboard,setLeaderboard]=useState<Leaderboard|null>(null);
  const [leadersLoading,setLeadersLoading]=useState(false);
  const [loading,setLoading]=useState(true);
  const [busy,setBusy]=useState(false);
  const [error,setError]=useState('');
  const [answerEffect,setAnswerEffect]=useState<{kind:'correct'|'wrong'|'win'|'lose';xp:number}|null>(null);
  const [musicMuted,setMusicMuted]=useState(false);
  const [musicError,setMusicError]=useState(false);
  const musicRef=useRef<HTMLAudioElement|null>(null);
  const tensionRef=useRef<HTMLAudioElement|null>(null);
  const winRef=useRef<HTMLAudioElement|null>(null);
  const loseRef=useRef<HTMLAudioElement|null>(null);
  const tensionActiveRef=useRef(false);
  const wrongCueUntilRef=useRef(0);
  const endingPlayedRef=useRef<string|null>(null);
  const fadeRef=useRef<number|null>(null);
  const musicSrc='/vvd-cpa/audio/franzian-deo-question-thinking-time-472736.mp3';
  const stopTension=()=>{const audio=tensionRef.current;if(audio){audio.pause();audio.currentTime=0;}tensionActiveRef.current=false;};
  const stopEndings=()=>{for(const audio of [winRef.current,loseRef.current])if(audio){audio.pause();audio.currentTime=0;}};
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
    if(musicMuted){setMusicMuted(false);setMusicError(false);if(round?.status==='active')void audio.play().catch(()=>setMusicError(true));}
    else{setMusicMuted(true);audio.pause();stopTension();stopEndings();}
  };
  useEffect(()=>()=>{
    if(fadeRef.current!==null)window.clearInterval(fadeRef.current);
    musicRef.current?.pause();tensionRef.current?.pause();winRef.current?.pause();loseRef.current?.pause();
  },[]);
  useEffect(()=>{
    const audio=musicRef.current;
    if(!audio)return;
    if(showGame&&round?.status==='active'&&!musicMuted){
      if(audio.paused)void audio.play().catch(()=>setMusicError(true));
    }else audio.pause();
  },[round?.status,musicMuted,showGame]);
  useEffect(()=>{
    if(showGame&&!musicMuted&&round?.status==='active')fadeMusic(answerEffect?.kind==='correct'?.09:.25);
  },[answerEffect?.kind,round?.status,musicMuted,showGame]);
  const [clock,setClock]=useState(0);
  const [offset,setOffset]=useState(0);
  const [feedback,setFeedback]=useState('');

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
      const [p,r,leaders]=await Promise.all([apiRequest<Profile>('/iq-play/profile'),apiRequest<Round|null>('/iq-play/rounds/active'),apiRequest<Leaderboard>('/iq-play/leaderboard').catch(()=>null)]);
      setProfile(p);if(r)sync(r);if(leaders)setLeaderboard(leaders);
    }catch{setError('Не удалось загрузить игру. Проверьте соединение.');}
    finally{setLoading(false);}
  },[]);
  useEffect(()=>{void refresh();},[refresh]);
  useEffect(()=>{const id=window.setInterval(()=>setClock(x=>x+1),250);return()=>window.clearInterval(id);},[]);
  const backToMenu=()=>{
    if(showLeaders){setShowLeaders(false);return;}
    if(!showGame){navigate('/');return;}
    setShowGame(false);setAnswerEffect(null);setFeedback('');setError('');
    if(effectTimer.current!==null){window.clearTimeout(effectTimer.current);effectTimer.current=null;}
    stopTension();stopEndings();musicRef.current?.pause();
    void apiRequest<Profile>('/iq-play/profile').then(setProfile).catch(()=>{});
  };
  const openLeaders=async()=>{
    if(leadersLoading)return;
    setLeadersLoading(true);setError('');
    try{
      const data=await apiRequest<Leaderboard>('/iq-play/leaderboard');
      setLeaderboard(data);
      setShowLeaders(true);
    }catch{
      if(leaderboard)setShowLeaders(true);
      else setError('Не удалось загрузить рейтинг. Попробуйте ещё раз.');
    }finally{setLeadersLoading(false);}
  };
  const start=async()=>{
    stopTension();stopEndings();endingPlayedRef.current=null;wrongCueUntilRef.current=0;
    startMusic();
    setBusy(true);setError('');setFeedback('');setAnswerEffect(null);try{const fresh=await apiRequest<Round>('/iq-play/rounds?fresh=true',{method:'POST'});sync(fresh);setShowGame(true);}catch(e){setError(e instanceof Error?e.message:'Не удалось начать игру');}finally{setBusy(false);}};
  const answer=async(choice:number)=>{if(!round||busy||answerEffect||round.status!=='active'||choice===round.blocked_index)return;
    if(!musicMuted&&musicRef.current?.paused)startMusic();
    setBusy(true);setError('');
    try{const response=await apiRequest<Response>(`/iq-play/rounds/${round.round_id}/answers`,{method:'POST',body:JSON.stringify({position:round.position,choice,event_id:crypto.randomUUID()})});
      const effectKind=response.outcome==='correct'?(response.round.status==='won'?'win':'correct'):(response.round.status==='lost'?'lose':'wrong');
      const gained=Math.max(0,response.round.round_xp-round.round_xp);
      showAnswerEffect(effectKind,gained);
      if(response.outcome==='wrong'){
        stopTension();
        wrongCueUntilRef.current=Date.now()+2000;
        if(!musicMuted){
          const wrongSound=loseRef.current;
          if(wrongSound){
            wrongSound.pause();wrongSound.currentTime=0;wrongSound.volume=.75;
            void wrongSound.play().catch(()=>{});
          }
          fadeMusic(.08);
        }
        if(response.round.status==='lost')endingPlayedRef.current=response.round.round_id+':lost';
      }
      if(response.outcome==='correct'&&!musicMuted){
        stopTension();
        const cheer=winRef.current;
        if(cheer){
          cheer.pause();
          cheer.currentTime=0;
          cheer.volume=.85;
          void cheer.play().catch(()=>{});
        }
      }
      if(response.round.status!=='active')stopTension();
      setFeedback(response.outcome==='wrong'?'Неверно! Используй второй шанс.':'');
      sync(response.round);
      if(response.round.status!=='active')setProfile(await apiRequest<Profile>('/iq-play/profile'));
    }catch{setError('Ответ не отправлен. Проверьте соединение и повторите.');}
    finally{setBusy(false);}
  };
  const seconds=remaining(round?.deadline,offset);
  useEffect(()=>{
    const tension=tensionRef.current;
    if(!tension)return;
    const lastTen=round?.status==='active'&&seconds>0&&seconds<=10;
    const inWrongCue=Date.now()<wrongCueUntilRef.current;
    const active=showGame&&lastTen&&!musicMuted&&!answerEffect&&!inWrongCue;
    if(active){
      if(!tensionActiveRef.current){
        tensionActiveRef.current=true;
        // Play a continuous middle section, not the last seconds of the MP3.
        if(tension.readyState>=1&&tension.duration>35)tension.currentTime=15;
        else if(tension.readyState<1)tension.addEventListener('loadedmetadata',()=>{
          if(tensionActiveRef.current&&tension.duration>35)tension.currentTime=15;
        },{once:true});
        tension.volume=.42;
        void tension.play().catch(()=>{tensionActiveRef.current=false;});
      }
      tension.volume=seconds<=5?.78:.42;
    }else if(tensionActiveRef.current)stopTension();
    if(showGame&&round?.status==='active'&&!musicMuted){
      fadeMusic(active?.10:answerEffect?.kind==='correct'||inWrongCue?.08:.25);
    }
  },[seconds,round?.status,round?.round_id,musicMuted,answerEffect?.kind,clock,showGame]);
  useEffect(()=>{
    if(!showGame||!round||round.status==='active'||musicMuted)return;
    const key=round.round_id+':'+round.status;
    if(endingPlayedRef.current===key)return;
    endingPlayedRef.current=key;
    stopTension();
    // Victory audio already plays on the final correct answer; do not replay it.
    const audio=round.status==='lost'?loseRef.current:null;
    if(audio){audio.currentTime=0;audio.volume=.85;void audio.play().catch(()=>{});}
  },[round?.round_id,round?.status,musicMuted,showGame]);
  useEffect(()=>{
    if(!showGame||!round||round.status!=='active'||seconds!==0)return;
    let live=true;
    let retryTimer:number|undefined;
    const roundId=round.round_id;
    const checkTimeout=async()=>{
      setBusy(true);
      try{
        const r=await apiRequest<Round>(`/iq-play/rounds/${roundId}/timeout`,{method:'POST'});
        if(!live)return;
        if(r.status==='active'&&r.deadline===round.deadline){
          // Client reached zero slightly before the server: try again shortly.
          retryTimer=window.setTimeout(()=>{if(live)void checkTimeout();},700);
          return;
        }
        setError('');
        sync(r);
        if(r.status!=='active')void apiRequest<Profile>('/iq-play/profile').then(p=>{if(live)setProfile(p);}).catch(()=>{});
      }catch{
        if(live){
          setError('Не удалось проверить таймер. Повторяем запрос…');
          retryTimer=window.setTimeout(()=>{if(live)void checkTimeout();},1800);
        }
      }finally{if(live)setBusy(false);}
    };
    void checkTimeout();
    return()=>{live=false;if(retryTimer!==undefined)window.clearTimeout(retryTimer);};
  },[round?.round_id,round?.deadline,round?.status,seconds,showGame]);
  if(loading)return <main className="iq-root iq-initial-loading"><div className="iq-load-card" role="status"><Brain size={42}/><strong>VVD IQ PLAY</strong><span>Подготавливаем игру…</span></div></main>;
  return <main className={'iq-root'+(showGame&&round?.status==='active'?' iq-playing':'')}>
    <audio ref={musicRef} src={musicSrc} preload="auto" loop onError={()=>setMusicError(true)} />
    <audio ref={tensionRef} src="/vvd-cpa/audio/%D0%9F%D0%BE%D1%81%D0%BB%D0%B5%D0%B4%D0%BD%D0%B8%D0%B5%20%D1%81%D0%B5%D0%BA%D1%83%D0%BD%D0%B4%D1%8B%20%D0%BD%D0%B0%D0%BF%D1%80%D1%8F%D0%B6%D0%B5%D0%BD%D0%B8%D1%8F%20.mp3" preload="auto" loop />
    <audio ref={winRef} src="/vvd-cpa/audio/%D0%92%D1%8B%D0%B8%D0%B3%D1%80%D1%8B%D1%88%20.mp3" preload="auto" />
    <audio ref={loseRef} src="/vvd-cpa/audio/%D0%9F%D1%80%D0%BE%D0%B8%D0%B3%D1%80%D0%B8%D1%88%D1%8C.mp3" preload="auto" />
    <div className="iq-stage" aria-hidden="true"><div className="iq-curtain iq-curtain-left"/><div className="iq-curtain iq-curtain-right"/><div className="iq-stage-proscenium"/><div className="iq-stage-beam iq-beam-left"/><div className="iq-stage-beam iq-beam-right"/><div className="iq-stage-halo"/><div className="iq-stage-dots"/><div className="iq-audience-video"><img src="/vvd-cpa/iq-audience.gif" alt="" loading="eager" /></div></div>
    {answerEffect&&<div className={'iq-answer-effect iq-effect-'+answerEffect.kind} role="status" aria-live="polite">
      <div className="iq-effect-card"><div className="iq-effect-symbol">{answerEffect.kind==='correct'?'✓':answerEffect.kind==='win'?'★':'✕'}</div>
      <strong>{answerEffect.kind==='correct'?'ПРАВИЛЬНО!':answerEffect.kind==='win'?'ПОБЕДА!':answerEffect.kind==='lose'?'ИГРА ОКОНЧЕНА':'НЕВЕРНО!'}</strong>
      {answerEffect.xp>0&&<span className="iq-effect-xp">+{answerEffect.xp} XP</span>}
      {answerEffect.kind==='wrong'&&<small>Используй второй шанс</small>}</div>
    </div>}
    <header className="iq-header"><button onClick={backToMenu} aria-label={showLeaders?"В меню IQ Play":showGame?"В меню IQ Play":"На главную VVD"}><ArrowLeft size={20}/></button><span>VVD <strong>IQ PLAY</strong></span><button onClick={toggleMusic} aria-label={musicMuted?'Включить музыку':'Выключить музыку'}>{musicMuted?<VolumeX size={20}/>:<Volume2 size={20}/>}</button></header>
    <section className="iq-hero"><div className="iq-emblem"><Brain size={42}/><Crown size={20}/></div><h1>IQ PLAY</h1><p>Прокачай себя в арбитраже</p></section>
    {musicError&&!musicMuted&&<p className="iq-warning" role="status">Музыка не запустилась. Нажми на значок динамика, чтобы включить её.</p>}
    {error&&<div className="iq-error" role="alert">{error}<button onClick={()=>void refresh()}>Повторить загрузку</button></div>}
    {showLeaders?<section className="iq-leaderboard"><h2>🏆 ЛИДЕРЫ IQ PLAY</h2><p className="iq-muted">Рейтинг по реальным XP · победы решают равенство</p><>{leaderboard?.bosses.length? <div className="iq-boss-panel iq-boss-challenge">
  <strong>👑 ЛЕГЕНДАРНЫЙ БОСС VVD</strong>
  {leaderboard.bosses.map((boss,i)=><div className="iq-boss-identity" key={i}><PlayerAvatar player={boss}/><span>{boss.name}</span></div>)}
  <div className="iq-boss-goal-label">⚔️ СМОЖЕШЬ ПОКОРИТЬ БОССА?</div>
  <div className="iq-boss-goal">50 000 XP</div>
  <div className="iq-boss-explainer">Особый вызов · цель по суммарным XP, не место в рейтинге</div>
  {leaderboard.me?<><div className="iq-boss-progress" role="progressbar" aria-label="Прогресс к вызову Босса" aria-valuemin={0} aria-valuemax={50000} aria-valuenow={Math.min(50000,leaderboard.me.xp)}><div style={{width:`${Math.min(100,Math.max(0,leaderboard.me.xp/50000*100))}%`}}/></div>
  <div className="iq-boss-progress-text">{leaderboard.me.xp>=50000?'🏅 Покоритель Босса — цель достигнута!':`Ваш прогресс: ${leaderboard.me.xp.toLocaleString('ru-RU')} / 50 000 XP`}</div></>:<p className="iq-boss-progress-text">Играй, набирай XP и открой звание «Покоритель Босса»</p>}
</div>:null}{leaderboard?.leaders.map(p=><div className={'iq-leader-row'+(p.is_me?' iq-leader-me':'')} key={p.rank}><b>#{p.rank}</b><PlayerAvatar player={p}/><span>{p.is_admin?'👑 ':''}{p.name}{p.is_me?' · Вы':''}</span><strong>{p.xp.toLocaleString('ru-RU')} XP</strong></div>)}{leaderboard?.me&&!leaderboard.leaders.some(p=>p.is_me)&&<div className="iq-leader-row iq-leader-me"><b>#{leaderboard.me.rank}</b><PlayerAvatar player={leaderboard.me}/><span>{leaderboard.me.name} · Вы</span><strong>{leaderboard.me.xp.toLocaleString('ru-RU')} XP</strong></div>}</></section>:showGame&&round?.status==='active'?<>
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
    </>:showGame&&round?<>
      <div className="iq-result">{round.status==='won'?<Trophy size={64}/>:<Brain size={64}/>}<h2>{round.status==='won'?'ПОБЕДА!':'ИГРА ОКОНЧЕНА'}</h2><p>Правильных ответов: {round.correct_count} / 15</p><p>Заработано {round.round_xp} XP</p></div>
      <button className="iq-primary" disabled={busy} onClick={()=>void start()}>Играть снова</button>
    </>:<>
      <div className="iq-profile"><Crown size={34}/><div><b>{profile.league} · уровень {profile.level}</b><span>{profile.xp.toLocaleString('ru-RU')} XP</span></div></div>
      <button className="iq-leader-button" disabled={leadersLoading} onClick={()=>void openLeaders()}><span className="iq-leader-icon"><Trophy size={26}/></span><span className="iq-leader-copy"><strong>ТАБЛИЦА ЛИДЕРОВ</strong><small>Рейтинг игроков · Вызов Босса VVD</small></span><span className="iq-leader-arrow" aria-hidden="true">›</span></button>
      <div className="iq-grid"><div>🏆<b>{profile.best_correct}/15</b><span>Рекорд</span></div><div>🎮<b>{profile.games}</b><span>Раундов</span></div><div>👑<b>{profile.wins}</b><span>Побед</span></div><div>⭐<b>{profile.achievements.length}/7</b><span>Наград</span></div></div>
      <button className="iq-primary" disabled={busy} onClick={()=>void start()}>{busy?'Загрузка…':'▶ НАЧАТЬ ИГРУ'}</button>
      <p className="iq-muted">15 вопросов · 2 шанса · до 1 800 XP за раунд</p>
    </>}
  </main>;
};
