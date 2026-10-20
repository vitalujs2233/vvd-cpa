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
  const musicTimer=useRef<number|null>(null);
  const mutedRef=useRef(true);
  const [soundError,setSoundError]=useState('');
  type Sound='intro'|'correct'|'wrong'|'win'|'lose'|'music'|'test';
  const createSound=useCallback((kind:Sound)=>{
    // Render short layered chiptune phrases into WAV for iOS Telegram WebView.
    const rate=22050;
    const notes:Record<Sound,Array<[number,number,number]>>={
      intro:[[523,0,.12],[659,.13,.12],[784,.27,.23]],
      correct:[[659,0,.1],[880,.11,.12],[1047,.24,.24]],
      wrong:[[330,0,.14],[247,.16,.24]],
      win:[[523,0,.12],[659,.13,.12],[784,.26,.12],[1047,.4,.4]],
      lose:[[392,0,.18],[330,.2,.18],[262,.4,.3]],
      music:[[262,0,.22],[330,.28,.22],[392,.56,.22],[523,.84,.24],[392,1.16,.22],[330,1.44,.22],[294,1.72,.22],[392,2,.3]],
      test:[[523,0,.12],[659,.14,.12],[784,.28,.28]]
    };
    const phrase=notes[kind], duration=Math.max(...phrase.map(n=>n[1]+n[2]))+.08;
    const samples=Math.ceil(rate*duration),buf=new ArrayBuffer(44+samples*2),v=new DataView(buf);
    const str=(at:number,s:string)=>{for(let i=0;i<s.length;i++)v.setUint8(at+i,s.charCodeAt(i));};
    str(0,'RIFF');v.setUint32(4,36+samples*2,true);str(8,'WAVE');str(12,'fmt ');
    v.setUint32(16,16,true);v.setUint16(20,1,true);v.setUint16(22,1,true);
    v.setUint32(24,rate,true);v.setUint32(28,rate*2,true);v.setUint16(32,2,true);
    v.setUint16(34,16,true);str(36,'data');v.setUint32(40,samples*2,true);
    for(let i=0;i<samples;i++){
      const t=i/rate;let value=0;
      for(const [freq,start,len] of phrase){
        const local=t-start;
        if(local<0||local>=len)continue;
        const envelope=Math.min(1,local/.012)*Math.min(1,(len-local)/.075);
        const harmonic=Math.sin(2*Math.PI*freq*local)*.72+Math.sin(4*Math.PI*freq*local)*.18+Math.sin(6*Math.PI*freq*local)*.1;
        value+=harmonic*envelope;
      }
      v.setInt16(44+i*2,Math.round(Math.max(-1,Math.min(1,value*.52))*32767),true);
    }
    return URL.createObjectURL(new Blob([buf],{type:'audio/wav'}));
  },[]);
  const playSound=useCallback((kind:Sound)=>{
    const url=createSound(kind),player=audioRef.current??new Audio();
    audioRef.current=player;player.pause();player.src=url;
    player.volume=kind==='music'?.28:.75;
    player.onerror=()=>setSoundError('Не удалось загрузить игровой звук.');
    void player.play().then(()=>setSoundError('')).catch(()=>setSoundError('Telegram заблокировал звук.')).finally(()=>{
      window.setTimeout(()=>URL.revokeObjectURL(url),5000);
    });
  },[createSound]);
  const toggleSound=()=>{
    if(muted){mutedRef.current=false;setMuted(false);playSound('intro');}
    else{mutedRef.current=true;setMuted(true);audioRef.current?.pause();}
  };
  useEffect(()=>{
    if(muted)return;
    musicTimer.current=window.setInterval(()=>{
      if(!mutedRef.current&&(!audioRef.current||audioRef.current.paused||audioRef.current.ended))playSound('music');
    },3000);
    return()=>{if(musicTimer.current!==null)window.clearInterval(musicTimer.current);};
  },[muted,playSound]);
  useEffect(()=>()=>{audioRef.current?.pause();},[]);
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
    {!muted&&<div className="iq-sound-check" role="status"><span>{soundError||'Музыка и игровые эффекты включены'}</span><button type="button" onClick={()=>playSound('test')}>🔊 Проверить звук</button></div>}
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
