import React,{useCallback,useEffect,useMemo,useRef,useState} from 'react';
import {ArrowRight,ArrowUpRight,BarChart3,Check,ChevronLeft,ChevronRight,Globe2,Layers,Menu,Search,ShieldCheck,Sparkles,Users,Wrench,X} from 'lucide-react';
import {API_BASE_URL} from '@/shared/lib/api';
import {directoryIcons,type DirectoryData,type DirectoryService} from '@/pages/tools/serviceDirectoryApi';
import {BrowserAccount, TelegramBrowserLogin, useBrowserSession} from './WebAuth';
import './PublicWebsite.css';

const BOT_URL='https://t.me/vvd_cpa_bot';
const BASE_URL='https://vitalujs2233.github.io/vvd-cpa/';
const INITIAL:DirectoryData={version:0,categories:[],services:[]};
const allowedLink=(url:string)=>{
  try {return new URL(url).protocol==='https:'?url:'';} catch {return '';}
};
const readCategory=()=>new URLSearchParams(window.location.search).get('category')||'';
const getSiteUrl=(category='')=>category?BASE_URL+'?category='+encodeURIComponent(category):BASE_URL;

function setMetadata(title:string,description:string,category=''){
  document.title=title;
  let meta=document.querySelector<HTMLMetaElement>('meta[name="description"]');
  if(!meta){meta=document.createElement('meta');meta.name='description';document.head.appendChild(meta);}
  meta.content=description;
  let canonical=document.querySelector<HTMLLinkElement>('link[rel="canonical"]');
  if(!canonical){canonical=document.createElement('link');canonical.rel='canonical';document.head.appendChild(canonical);}
  canonical.href=getSiteUrl(category);
}

const ServiceTile:React.FC<{service:DirectoryService}>=({service})=>{
  const Icon=directoryIcons[service.icon]||Layers;
  const dest=allowedLink(service.website_url);
  const benefits=(service.benefits||'').split(/\n/).map(x=>x.trim()).filter(Boolean).slice(0,3);
  return <article className="vvd-web-service-card">
    <div className="vvd-web-service-top">
      <div className="vvd-web-service-graphic">
        {allowedLink(service.image_url)?<img src={service.image_url} alt={service.name} loading="lazy"/>:<Icon size={33} strokeWidth={1.7}/>}
      </div>
      <div><h3>{service.name}</h3><p>{service.description}</p></div>
    </div>
    {benefits.length>0&&<ul className="vvd-web-benefit-list">{benefits.map((text,index)=><li key={index}><Check size={14}/>{text}</li>)}</ul>}
    {(service.discount_text||service.promo_code)&&<div className="vvd-web-deal">
      {service.discount_text&&<span>{service.discount_text}</span>}
      {service.promo_code&&<strong>Промокод: {service.promo_code}</strong>}
    </div>}
    {dest&&<a className="vvd-web-service-action" href={dest} target="_blank" rel={service.partner_link?'noopener noreferrer sponsored nofollow':'noopener noreferrer'}>
      Перейти на сайт <ArrowUpRight size={17}/>
    </a>}
    {service.partner_link&&<span className="vvd-web-disclosure">Партнёрская ссылка</span>}
  </article>;
};

export const PublicWebsite:React.FC=()=>{
  const [data,setData]=useState<DirectoryData>(INITIAL);
  const [loading,setLoading]=useState(true);
  const [error,setError]=useState(false);
  const [categoryId,setCategoryId]=useState(readCategory);
  const [query,setQuery]=useState('');
  const [mobileMenu,setMobileMenu]=useState(false);
  const [accountView,setAccountView]=useState(()=>new URLSearchParams(window.location.search).has('account'));
  const auth=useBrowserSession();
  const viewport=useRef<HTMLDivElement>(null);

  useEffect(()=>{
    let mounted=true;
    const controller=new AbortController();
    fetch(API_BASE_URL+'/service-directory',{signal:controller.signal})
      .then(res=>{if(!res.ok)throw new Error('catalog_error');return res.json();})
      .then((res:DirectoryData)=>{if(mounted&&Array.isArray(res.categories)&&Array.isArray(res.services)){setData(res);setError(false);}})
      .catch(()=>{if(mounted&&!controller.signal.aborted)setError(true);})
      .finally(()=>{if(mounted)setLoading(false);});
    return()=>{mounted=false;controller.abort();};
  },[]);

  useEffect(()=>{
    const onHistory=()=>{setCategoryId(readCategory());setAccountView(new URLSearchParams(window.location.search).has('account'));setQuery('');viewport.current?.scrollTo({top:0,behavior:'auto'});};
    window.addEventListener('popstate',onHistory);
    return()=>window.removeEventListener('popstate',onHistory);
  },[]);

  const showCategory=useCallback((id:string)=>{
    window.history.pushState(null,'',getSiteUrl(id));
    setCategoryId(id);setAccountView(false);setQuery('');setMobileMenu(false);
    viewport.current?.scrollTo({top:0,behavior:'instant'});
  },[]);
  const openMain=useCallback(()=>{
    if(categoryId||accountView){window.history.pushState(null,'',BASE_URL);setCategoryId('');setAccountView(false);setQuery('');}
    setMobileMenu(false);
    viewport.current?.scrollTo({top:0,behavior:'smooth'});
  },[categoryId,accountView]);
  const openAccount=()=>{
    window.history.pushState(null,'',BASE_URL+'?account=1');
    setCategoryId('');setAccountView(true);setMobileMenu(false);
    viewport.current?.scrollTo({top:0,behavior:'auto'});
  };
  const jumpTo=(id:string)=>{
    if(categoryId||accountView){window.history.pushState(null,'',BASE_URL);setCategoryId('');setAccountView(false);}
    setMobileMenu(false);
    window.setTimeout(()=>document.getElementById(id)?.scrollIntoView({behavior:'smooth',block:'start'}),0);
  };
  const category=data.categories.find(c=>c.id===categoryId);
  const filtered=useMemo(()=>{
    const s=query.trim().toLocaleLowerCase('ru');
    return data.categories.filter(c=>!s||[c.name,c.description].some(text=>text.toLocaleLowerCase('ru').includes(s))||
      data.services.some(service=>service.category_id===c.id&&[service.name,service.description].some(t=>t.toLocaleLowerCase('ru').includes(s))));
  },[data,query]);
  const services=data.services.filter(s=>s.category_id===categoryId);

  useEffect(()=>{
    if(accountView){
      setMetadata('Личный кабинет — VVD CPA','Защищённый вход в личный кабинет VVD CPA через Telegram.');
    }else if(category){
      setMetadata(category.name+' — Каталог сервисов VVD CPA',category.description||'Каталог профессиональных сервисов для вебмастеров.',category.id);
    }else{
      setMetadata('VVD CPA — Каталог сервисов и инструменты для вебмастеров','VVD CPA — каталог полезных сервисов для вебмастеров. AI, аналитика, рекламные сети, инструменты и партнёрские предложения в одном месте.');
    }
  },[category,accountView]);

  return <div className="vvd-web-portal" ref={viewport}>
    <div className="vvd-web-atmosphere" aria-hidden="true">
      <div className="vvd-web-glow vvd-web-glow-one"/><div className="vvd-web-glow vvd-web-glow-two"/>
      <svg viewBox="0 0 1440 950" preserveAspectRatio="xMidYMid slice">
        <g fill="none" stroke="#d7ad52" strokeLinecap="round">
          <path d="M-80 265 C245 44 425 380 755 180 S1195 155 1510 -60" opacity=".24" strokeWidth="1.2"/>
          <path d="M-80 290 C245 69 425 405 755 205 S1195 180 1510 -35" opacity=".16" strokeWidth=".9"/>
          <path d="M-80 240 C245 19 425 355 755 155 S1195 130 1510 -85" opacity=".12" strokeWidth=".8"/>
          <path d="M-80 875 C245 654 425 990 755 790 S1195 765 1510 550" opacity=".17" strokeWidth="1.1"/>
          <path d="M-80 900 C245 679 425 1015 755 815 S1195 790 1510 575" opacity=".1" strokeWidth="1"/>
        </g>
      </svg>
    </div>
    <div className="vvd-web-layout">
      <header className="vvd-web-header">
        <button type="button" className="vvd-web-brand" onClick={openMain} aria-label="VVD CPA — главная">
          <span className="vvd-web-monogram">V</span>
          <span className="vvd-web-brand-copy"><strong>VVD CPA</strong><small>PREMIUM NETWORK</small></span>
        </button>
        <nav className={'vvd-web-nav '+(mobileMenu?'is-open':'')} aria-label="Основная навигация">
          <button type="button" onClick={openMain}>Главная</button>
          <button type="button" onClick={()=>jumpTo('catalog')}>Каталог сервисов</button>
          <button type="button" onClick={()=>jumpTo('features')}>Возможности</button>
          <button type="button" onClick={openAccount}>Личный кабинет</button>
        </nav>
        {auth.isLoggedIn
          ?<button type="button" className="vvd-web-header-action" onClick={openAccount}><ShieldCheck size={17}/> Кабинет <ArrowRight size={15}/></button>
          :<button type="button" className="vvd-web-header-action" onClick={()=>auth.setLoginOpen(true)}>Войти / Регистрация <ArrowRight size={15}/></button>}
        <button type="button" onClick={()=>setMobileMenu(v=>!v)} className="vvd-web-mobile-menu" aria-label={mobileMenu?'Закрыть меню':'Открыть меню'} aria-expanded={mobileMenu}>{mobileMenu?<X size={23}/>:<Menu size={23}/>}</button>
      </header>

      {accountView ? (auth.profile
        ?<BrowserAccount profile={auth.profile} onCatalog={()=>jumpTo('catalog')} onLogout={()=>{void auth.logout();openMain();}}/>
        :<main className="vvd-web-account">
          <div className="vvd-web-account-heading"><span className="vvd-web-eyebrow">ЛИЧНЫЙ КАБИНЕТ</span><h1>{auth.restoring?'Проверяем сессию…':'Вход через Telegram'}</h1><p>Один аккаунт для сайта и Mini App. Войти и зарегистрироваться можно с помощью Telegram.</p></div>
          {!auth.restoring&&<button type="button" className="vvd-web-gold-button" onClick={()=>auth.setLoginOpen(true)}>Войти / Зарегистрироваться <ArrowRight size={17}/></button>}
        </main>
      ) : categoryId ? <main className="vvd-web-category-view">
        <button type="button" className="vvd-web-back" onClick={openMain}><ChevronLeft size={18}/> Все категории</button>
        {category?<>
          <div className="vvd-web-category-hero">
            <div className="vvd-web-category-badge">
              {React.createElement(directoryIcons[category.icon]||Layers,{size:34,strokeWidth:1.5})}
            </div>
            <div><span className="vvd-web-eyebrow">VVD CPA / КАТАЛОГ СЕРВИСОВ</span><h1>{category.name}</h1><p>{category.description}</p><span className="vvd-web-muted">{services.length?services.length+' предложений':'Предложения появятся после подключения партнёров'}</span></div>
          </div>
          {services.length>0?<div className="vvd-web-services-grid">{services.map(s=><ServiceTile key={s.id} service={s}/>)}</div>:
          <div className="vvd-web-empty-service"><Layers size={30}/><h2>Сервисы скоро появятся</h2><p>Мы добавляем предложения по мере подключения партнёрских программ. Сейчас здесь нет опубликованных сервисов.</p><button type="button" onClick={openMain}>Смотреть другие категории <ArrowRight size={17}/></button></div>}
        </>:<div className="vvd-web-empty-service"><h1>Раздел не найден</h1><p>Возможно, категория была переименована или скрыта.</p><button onClick={openMain}>Вернуться в каталог</button></div>}
      </main> :
      <main>
        <section className="vvd-web-workspace-intro" id="top">
          <div>
            <span className="vvd-web-eyebrow"><span className="vvd-web-dot"/> VVD CPA · ЦИФРОВАЯ ПЛАТФОРМА</span>
            <h1>Инструменты и сервисы <em>в одном месте.</em></h1>
            <p>Выбирай категорию, изучай условия и переходи к нужному сервису. Личный кабинет доступен через подтверждённый аккаунт Telegram.</p>
          </div>
          <div className="vvd-web-workspace-actions">
            <button type="button" className="vvd-web-gold-button" onClick={()=>auth.isLoggedIn?openAccount():auth.setLoginOpen(true)}>{auth.isLoggedIn?'Мой кабинет':'Войти / Зарегистрироваться'} <ArrowRight size={16}/></button>
            <a href={BOT_URL} target="_blank" rel="noopener noreferrer" className="vvd-web-outline-button">Открыть Mini App <ArrowUpRight size={16}/></a>
          </div>
        </section>

        <section className="vvd-web-section" id="catalog">
          <div className="vvd-web-section-heading">
            <div><span className="vvd-web-eyebrow">ПОДОБРАННЫЕ ИНСТРУМЕНТЫ</span><h2>Каталог сервисов</h2><p>Разделы без путаницы: в каждой категории только соответствующие предложения.</p></div>
            <div className="vvd-web-catalog-count">{loading?'Загрузка каталога':data.categories.length+' категорий'}</div>
          </div>
          <label className="vvd-web-search"><Search size={21}/><input type="search" value={query} onChange={e=>setQuery(e.target.value)} placeholder="Найти категорию или сервис..." aria-label="Поиск по каталогу"/></label>
          {error&&<div className="vvd-web-notice" role="alert">Каталог временно недоступен. Остальные разделы сайта продолжают работать.</div>}
          {loading?<div className="vvd-web-categories-grid" aria-busy="true">{[0,1,2,3,4,5].map(n=><div key={n} className="vvd-web-placeholder"/>)}</div>:
            filtered.length>0?<div className="vvd-web-categories-grid">
              {filtered.map(c=>{
                const Icon=directoryIcons[c.icon]||Layers;
                const count=data.services.filter(s=>s.category_id===c.id).length;
                return <a key={c.id} href={getSiteUrl(c.id)} onClick={event=>{event.preventDefault();showCategory(c.id);}} className="vvd-web-category-card">
                  <div className="vvd-web-category-icon"><Icon size={26} strokeWidth={1.6}/></div>
                  <ChevronRight className="vvd-web-card-arrow" size={20}/>
                  <h3>{c.name}</h3><p>{c.description}</p>
                  <span>{count?count+' предложений':'Скоро предложения'}</span>
                </a>;
              })}
            </div>:<div className="vvd-web-notice">По вашему запросу разделов не найдено.</div>}
        </section>

        <section className="vvd-web-section vvd-web-feature-section" id="features">
          <div className="vvd-web-section-heading"><div><span className="vvd-web-eyebrow">VVD CPA В TELEGRAM</span><h2>Больше возможностей<br/>в Mini App</h2><p>Веб-сайт помогает изучить платформу. Для работы с личным кабинетом открой VVD CPA в Telegram.</p></div></div>
          <div className="vvd-web-features-grid">
            <div className="vvd-web-feature"><span><BarChart3 size={27}/></span><h3>Аналитика</h3><p>Статистика кликов, конверсий и эффективности ваших ссылок внутри Mini App.</p></div>
            <div className="vvd-web-feature"><span><Wrench size={27}/></span><h3>Инструменты</h3><p>Доступ к существующим инструментам платформы и дополнительным сервисам.</p></div>
            <div className="vvd-web-feature"><span><ShieldCheck size={27}/></span><h3>Личный кабинет</h3><p>Баланс, история начислений и персональные настройки с защищённым Telegram-входом.</p></div>
          </div>
        </section>

        <section className="vvd-web-cta">
          <div><span className="vvd-web-eyebrow">ГОТОВ К РАБОТЕ?</span><h2>VVD CPA всегда под рукой.</h2><p>Открывай Mini App из Telegram и пользуйся личными инструментами и статистикой.</p></div>
          <a className="vvd-web-gold-button" href={BOT_URL} target="_blank" rel="noopener noreferrer">Запустить в Telegram <ArrowUpRight size={18}/></a>
        </section>
      </main>}
      <footer className="vvd-web-footer">
        <div className="vvd-web-footer-brand"><div className="vvd-web-monogram">V</div><div><b>VVD CPA</b><small>ПЛАТФОРМА ДЛЯ ВЕБМАСТЕРОВ</small></div></div>
        <p>© {new Date().getFullYear()} VVD CPA. Условия сторонних сервисов действуют на их сайтах. Некоторые ссылки могут быть партнёрскими.</p>
        <a href={BOT_URL} target="_blank" rel="noopener noreferrer">Наш Telegram <ArrowUpRight size={14}/></a>
      </footer>
    </div>
    {auth.loginOpen&&<TelegramBrowserLogin
      onClose={()=>auth.setLoginOpen(false)}
      onLogin={session=>{auth.login(session);openAccount();}}
    />}
  </div>;
};
