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

  type Sound='intro'|'correct'|'wrong'|'win'|'lose'|'music'|'test';
  // Original quiz-show sound design: short cues and a restrained suspense bed.
  // Everything is synthesized locally; no external audio assets or network requests.
  const wav=(data:Float32Array,rate=22050)=>{
    const buf=new ArrayBuffer(44+data.length*2),v=new DataView(buf);
    const write=(at:number,s:string)=>{for(let i=0;i<s.length;i++)v.setUint8(at+i,s.charCodeAt(i));};
    write(0,'RIFF');v.setUint32(4,36+data.length*2,true);write(8,'WAVE');write(12,'fmt ');
    v.setUint32(16,16,true);v.setUint16(20,1,true);v.setUint16(22,1,true);
    v.setUint32(24,rate,true);v.setUint32(28,rate*2,true);v.setUint16(32,2,true);
    v.setUint16(34,16,true);write(36,'data');v.setUint32(40,data.length*2,true);
    for(let i=0;i<data.length;i++)v.setInt16(44+i*2,Math.round(Math.max(-1,Math.min(1,data[i]))*29000),true);
    return URL.createObjectURL(new Blob([buf],{type:'audio/wav'}));
  };
  const createSound=useCallback((kind:Sound)=>{
    const rate=22050;
    type Note=[number,number,number,number];
    const phrases:Record<Sound,Note[]>={
      intro:[[392,0,.12,.28],[523,.13,.12,.33],[659,.26,.15,.36],[784,.43,.3,.4]],
      correct:[[659,0,.09,.28],[880,.11,.12,.32],[1175,.25,.27,.37]],
      wrong:[[392,0,.12,.3],[311,.13,.18,.34],[233,.33,.23,.3]],
      win:[[523,0,.15,.28],[659,.17,.15,.32],[784,.34,.16,.35],[1047,.53,.23,.4],[1319,.78,.5,.4],[1047,.78,.5,.16]],
      lose:[[440,0,.2,.3],[370,.24,.23,.3],[311,.51,.28,.32],[220,.83,.55,.28]],
      music:[],
      test:[[523,0,.12,.3],[659,.15,.12,.3],[784,.3,.3,.35]]
    };
    const notes=phrases[kind],duration=Math.max(.4,...notes.map(n=>n[1]+n[2]))+.12;
    const data=new Float32Array(Math.ceil(rate*duration));
    for(const [freq,start,len,volume] of notes){
      const offset=Math.floor(start*rate),count=Math.min(Math.ceil(len*rate),data.length-offset);
      for(let i=0;i<count;i++){
        const t=i/rate,fade=Math.min(1,t/.014,(len-t)/.095);
        const tone=.75*Math.sin(2*Math.PI*freq*t)+.18*Math.sin(4*Math.PI*freq*t)+.07*Math.sin(6*Math.PI*freq*t);
        data[offset+i]+=tone*Math.max(0,fade)*volume;
      }
    }
    return wav(data,rate);
  },[]);
  const createMusic=useCallback(()=>{
    // 16-beat original suspense loop: soft pulse, ticking accents and changing harmony.
    // The final chord resolves into the opening chord for a seamless repeat.
    const rate=22050,beat=.625,beats=16,duration=beat*beats;
    const data=new Float32Array(Math.ceil(rate*duration));
    const add=(start:number,len:number,freq:number,volume:number,mode:'bell'|'pad'|'bass')=>{
      const offset=Math.floor(start*rate),count=Math.min(Math.ceil(len*rate),data.length-offset);
      for(let i=0;i<count;i++){
        const t=i/rate;
        const envelope=mode==='pad'
          ?Math.min(1,t/.32,(len-t)/.32)
          :Math.exp(-t*(mode==='bell'?5:3))*Math.min(1,t/.008);
        const tone=mode==='bell'
          ?Math.sin(2*Math.PI*freq*t)+.22*Math.sin(2*Math.PI*freq*2.01*t)
          :mode==='bass'
            ?Math.sin(2*Math.PI*freq*t)+.12*Math.sin(4*Math.PI*freq*t)
            :Math.sin(2*Math.PI*freq*t)+.16*Math.sin(2*Math.PI*freq*1.005*t);
        data[offset+i]+=tone*Math.max(0,envelope)*volume;
      }
    };
    const roots=[146.83,130.81,164.81,146.83];
    const chords=[[293.66,349.23,440],[261.63,329.63,392],[329.63,392,493.88],[293.66,349.23,440]];
    for(let bar=0;bar<4;bar++){
      const start=bar*4*beat;
      for(const note of chords[bar])add(start,4*beat,note,.018,'pad');
      for(let pulse=0;pulse<4;pulse++)add(start+pulse*beat,.32,roots[bar],.075,'bass');
    }
    const ticks=[587.33,659.25,698.46,659.25,587.33,523.25,659.25,698.46,
      783.99,698.46,659.25,587.33,523.25,587.33,659.25,587.33];
    ticks.forEach((freq,i)=>add(i*beat,.24,freq,.075,'bell'));
    return wav(data,rate);
  },[]);
  const playSound=useCallback((kind:Sound)=>{
    if(mutedRef.current)return;
    const url=createSound(kind),player=audioRef.current??new Audio();
    audioRef.current=player;player.pause();player.src=url;player.volume=.65;
    void player.play().catch(()=>{}).finally(()=>window.setTimeout(()=>URL.revokeObjectURL(url),5000));
  },[createSound]);
  const toggleSound=()=>{
    if(muted){
      mutedRef.current=false;setMuted(false);
      if(!musicRef.current){
        musicUrlRef.current=createMusic();
        const music=new Audio(musicUrlRef.current);
        music.loop=true;music.volume=.5;musicRef.current=music;
      }
      void musicRef.current.play().catch(()=>{});
    }else{
      mutedRef.current=true;setMuted(true);
      musicRef.current?.pause();audioRef.current?.pause();
    }
  };
  useEffect(()=>()=>{musicRef.current?.pause();audioRef.current?.pause();if(musicUrlRef.current)URL.revokeObjectURL(musicUrlRef.current);},[]);
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
