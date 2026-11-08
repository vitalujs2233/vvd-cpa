import React,{useEffect,useMemo,useState} from 'react';
import {ArrowRight,Check,ExternalLink,KeyRound,LoaderCircle,LogOut,ShieldCheck,UserRound,Wallet,X} from 'lucide-react';
import {API_BASE_URL} from '@/shared/lib/api';

const STORAGE='vvd_cpa_browser_session_v1';
const OIDC_SCRIPT='https://oauth.telegram.org/js/telegram-login.js';
const BOT_URL='https://t.me/vvd_cpa_bot';

export type BrowserUser={
  telegram_id:number;first_name:string;last_name?:string|null;
  username?:string|null;photo_url?:string|null;partner_code?:string|null;
  role:string;status:string;
};
export type BrowserProfile={
  user:BrowserUser;
  wallet:{balance:number;hold:number;withdrawn:number};
};
type Challenge={nonce:string;client_id:number};
type TelegramLoginResult={id_token?:string;error?:string};
type TelegramLoginAPI={auth:(options:{client_id:number;scope:string[];nonce:string;lang:string},callback:(result:TelegramLoginResult)=>void)=>void};

function sdk():TelegramLoginAPI|undefined{
  return (window as unknown as {Telegram?:{Login?:TelegramLoginAPI}}).Telegram?.Login;
}
function getSession():string{
  try{return sessionStorage.getItem(STORAGE)||'';}catch{return '';}
}
function saveSession(value:string){
  try{sessionStorage.setItem(STORAGE,value);}catch{/* disabled private storage */}
}
function clearSession(){
  try{sessionStorage.removeItem(STORAGE);}catch{/* session may be blocked */}
}
async function readJson<T>(url:string,options?:RequestInit):Promise<T>{
  const res=await fetch(API_BASE_URL+url,{...options,cache:'no-store'});
  if(!res.ok)throw new Error('http_'+res.status);
  return res.json() as Promise<T>;
}
function withSession(session:string):RequestInit{
  return {headers:{'X-Telegram-Init-Data':session}};
}
function loadTelegramScript():Promise<void>{
  if(sdk())return Promise.resolve();
  return new Promise((resolve,reject)=>{
    const existing=document.getElementById('vvd-web-oidc-sdk') as HTMLScriptElement|null;
    const script=existing||document.createElement('script');
    if(!existing){
      script.id='vvd-web-oidc-sdk';
      script.src=OIDC_SCRIPT;script.async=true;
    }
    const ok=()=>sdk()?resolve():reject(new Error('telegram_sdk_missing'));
    const fail=()=>reject(new Error('telegram_sdk_unavailable'));
    script.addEventListener('load',ok,{once:true});
    script.addEventListener('error',fail,{once:true});
    if(!existing)document.head.appendChild(script);
  });
}

export const useBrowserSession=()=>{
  const [session,setSession]=useState(getSession);
  const [profile,setProfile]=useState<BrowserProfile|null>(null);
  const [restoring,setRestoring]=useState(Boolean(getSession()));
  const [loginOpen,setLoginOpen]=useState(false);
  useEffect(()=>{
    if(!session){setProfile(null);setRestoring(false);return;}
    let active=true;
    void readJson<BrowserProfile>('/web-auth/me',withSession(session)).then(data=>{
      if(active){setProfile(data);setRestoring(false);}
    }).catch(()=>{
      if(active){clearSession();setSession('');setProfile(null);setRestoring(false);}
    });
    return()=>{active=false;};
  },[session]);
  const login=(value:string)=>{
    saveSession(value);
    setRestoring(true);
    setSession(value);
    setLoginOpen(false);
  };
  const logout=async()=>{
    const previous=session;
    clearSession();setSession('');setProfile(null);setRestoring(false);
    if(previous){try{await readJson('/web-auth/logout',{...withSession(previous),method:'POST'});}catch{/* logout locally regardless of network */}}
  };
  return {profile,restoring,isLoggedIn:Boolean(profile),loginOpen,setLoginOpen,login,logout};
};

export const TelegramBrowserLogin:React.FC<{
  onClose:()=>void;
  onLogin:(session:string)=>void;
}>=({onClose,onLogin})=>{
  const [challenge,setChallenge]=useState<Challenge|null>(null);
  const [sdkReady,setSdkReady]=useState(false);
  const [loading,setLoading]=useState(true);
  const [submitting,setSubmitting]=useState(false);
  const [error,setError]=useState('');

  const prepare=async()=>{
    setLoading(true);setError('');setChallenge(null);setSdkReady(false);
    try{
      const [value]=await Promise.all([
        readJson<Challenge>('/web-auth/challenge',{method:'POST'}),
        loadTelegramScript()
      ]);
      setChallenge(value);setSdkReady(Boolean(sdk()));
    }catch{
      setError('Не удалось подготовить вход через Telegram. Проверь соединение и настройки Login Widget в BotFather.');
    }finally{setLoading(false);}
  };
  useEffect(()=>{void prepare();},[]);
  useEffect(()=>{
    const handle=(e:KeyboardEvent)=>{if(e.key==='Escape'&&!submitting)onClose();};
    window.addEventListener('keydown',handle);
    return()=>window.removeEventListener('keydown',handle);
  },[onClose,submitting]);

  const start=()=>{
    // SDK opens its popup directly in the click handler, before any awaited call.
    if(!challenge||!sdkReady||!sdk()||submitting)return;
    setError('');
    const current=challenge;
    try{
      sdk()!.auth({client_id:current.client_id,scope:['profile'],nonce:current.nonce,lang:'ru'},(result)=>{
        if(result.error){setError('Telegram отменил или не завершил подтверждение. Попробуй ещё раз.');void prepare();return;}
        if(!result.id_token){setError('Telegram не передал подтверждение входа.');return;}
        setSubmitting(true);
        void readJson<{session:string;registered:boolean}>('/web-auth/telegram',{
          method:'POST',headers:{'Content-Type':'application/json'},
          body:JSON.stringify({id_token:result.id_token,nonce:current.nonce})
        }).then(res=>onLogin(res.session)).catch(()=>{
          setError('Не удалось подтвердить вход на сервере. Попробуй снова. Если ошибка повторяется, проверь разрешённый адрес сайта в BotFather.');
          void prepare();
        }).finally(()=>setSubmitting(false));
      });
    }catch{
      setError('Не удалось открыть окно Telegram. Разреши всплывающие окна и попробуй снова.');
    }
  };

  return <div className="vvd-web-login-overlay" role="presentation" onMouseDown={e=>{if(e.target===e.currentTarget&&!submitting)onClose();}}>
    <section className="vvd-web-login-card" role="dialog" aria-modal="true" aria-label="Вход и регистрация через Telegram">
      <button type="button" className="vvd-web-login-close" aria-label="Закрыть" onClick={onClose}><X size={20}/></button>
      <span className="vvd-web-login-icon"><KeyRound size={30}/></span>
      <span className="vvd-web-eyebrow">ЕДИНЫЙ АККАУНТ VVD CPA</span>
      <h2>Войти или зарегистрироваться</h2>
      <p>Подтверди вход в Telegram. Если ты уже используешь VVD CPA, откроется твой существующий аккаунт. Если нет — он будет создан автоматически.</p>
      {error&&<div role="alert" className="vvd-web-login-error">{error}</div>}
      <button type="button" className="vvd-web-gold-button vvd-web-login-action" disabled={loading||submitting||!challenge||!sdkReady} onClick={start}>
        {loading||submitting?<LoaderCircle size={18} className="vvd-web-spin"/>:<ShieldCheck size={18}/>}
        {loading?'Готовим Telegram-вход…':submitting?'Проверяем аккаунт…':'Продолжить через Telegram'}
      </button>
      {error&&<button type="button" className="vvd-web-login-retry" onClick={()=>void prepare()}>Повторить подготовку входа</button>}
      <small>Пароль не требуется. Данные подтверждаются Telegram, а доступ выдаётся только после проверки на сервере.</small>
      <div className="vvd-web-login-divider"/>
      <a href={BOT_URL} target="_blank" rel="noopener noreferrer">Или открыть Mini App в Telegram <ExternalLink size={14}/></a>
    </section>
  </div>;
};

export const BrowserAccount:React.FC<{
  profile:BrowserProfile;onLogout:()=>void;onCatalog:()=>void;
}>=({profile,onLogout,onCatalog})=>{
  const {user,wallet}=profile;
  const displayName=[user.first_name,user.last_name].filter(Boolean).join(' ');
  const formatMoney=(n:number)=>'$'+(Number.isFinite(n)?n:0).toFixed(2);
  const valueCards=useMemo(()=>[
    {name:'Баланс',value:formatMoney(wallet.balance),icon:Wallet},
    {name:'На удержании',value:formatMoney(wallet.hold),icon:ShieldCheck},
    {name:'Выплачено',value:formatMoney(wallet.withdrawn),icon:Check}
  ],[wallet.balance,wallet.hold,wallet.withdrawn]);
  return <main className="vvd-web-account">
    <div className="vvd-web-account-heading"><span className="vvd-web-eyebrow">ЛИЧНЫЙ КАБИНЕТ VVD CPA</span><h1>Твой аккаунт</h1><p>Единый профиль для браузера и Telegram Mini App.</p></div>
    <section className="vvd-web-account-profile">
      <div className="vvd-web-account-avatar">{user.photo_url?<img src={user.photo_url} alt="Фото профиля"/>:<UserRound size={26}/>}</div>
      <div><h2>{displayName||'Пользователь Telegram'}</h2><p>{user.username?'@'+user.username:'Telegram ID: '+user.telegram_id}</p><span>Авторизован через Telegram</span></div>
      <ShieldCheck className="vvd-web-account-shield" size={26}/>
    </section>
    <div className="vvd-web-account-cards">{valueCards.map(item=>{
      const Icon=item.icon;
      return <div key={item.name} className="vvd-web-account-stat"><span><Icon size={18}/>{item.name}</span><strong>{item.value}</strong></div>;
    })}</div>
    <div className="vvd-web-account-choices">
      <button type="button" onClick={onCatalog}><ArrowRight size={17}/> Каталог сервисов</button>
      <a href={BOT_URL} target="_blank" rel="noopener noreferrer"><ExternalLink size={17}/> Открыть полный Mini App</a>
    </div>
    <p className="vvd-web-account-note">В браузере пока доступен просмотр профиля и баланса. Статистика, выплаты и остальные действия остаются в защищённом Telegram Mini App.</p>
    <button className="vvd-web-account-logout" type="button" onClick={onLogout}><LogOut size={17}/> Выйти из аккаунта</button>
  </main>;
};
