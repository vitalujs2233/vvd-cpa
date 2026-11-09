import React,{useCallback,useEffect,useMemo,useRef,useState} from 'react';
import {ArrowRight,ArrowUpRight,BarChart3,Check,ChevronLeft,ChevronRight,Globe2,Layers,Menu,Search,ShieldCheck,Users,Wrench,Target,MousePointerClick,Wallet,Link2,Activity,LayoutDashboard,X,Zap,Headphones} from 'lucide-react';
import {API_BASE_URL} from '@/shared/lib/api';
import {directoryIcons,type DirectoryData,type DirectoryService} from '@/pages/tools/serviceDirectoryApi';
import {BrowserAccount, TelegramBrowserLogin, type useBrowserSession} from './WebAuth';
import './PublicWebsite.css';

const BOT_URL='https://t.me/vvd_cpa_bot';
const BASE_URL='https://vitalujs2233.github.io/vvd-cpa/';
const INITIAL:DirectoryData={version:0,categories:[],services:[]};
// Public directory only: keep a short-lived copy to avoid blank cards when switching views.
const DIRECTORY_CACHE_KEY='vvd_public_directory_v1';
const DIRECTORY_CACHE_TTL=5*60*1000;
let directoryMemory:{data:DirectoryData;time:number}|null=null;
function validDirectory(data:DirectoryData):boolean{
  return Boolean(data&&Array.isArray(data.categories)&&Array.isArray(data.services));
}
function readPublicDirectoryCache():DirectoryData|null{
  if(directoryMemory&&Date.now()-directoryMemory.time<DIRECTORY_CACHE_TTL)return directoryMemory.data;
  try{
    const raw=sessionStorage.getItem(DIRECTORY_CACHE_KEY);
    if(!raw)return null;
    const stored=JSON.parse(raw) as {data:DirectoryData;time:number};
    if(typeof stored.time!=='number'||Date.now()-stored.time>=DIRECTORY_CACHE_TTL||!validDirectory(stored.data))return null;
    directoryMemory=stored;
    return stored.data;
  }catch{return null;}
}
function savePublicDirectoryCache(data:DirectoryData):void{
  directoryMemory={data,time:Date.now()};
  try{sessionStorage.setItem(DIRECTORY_CACHE_KEY,JSON.stringify(directoryMemory))}catch{/* Private browsing may disable storage. */}
}
const allowedLink=(url:string)=>{
  try {return new URL(url).protocol==='https:'?url:'';} catch {return '';}
};
const readCategory=()=>new URLSearchParams(window.location.search).get('category')||'';
const getSiteUrl=(category='')=>BASE_URL+'?page=services'+(category?'&category='+encodeURIComponent(category):'');
const isCatalogPage=()=>new URLSearchParams(window.location.search).get('page')==='services'||Boolean(readCategory());

function setMetadata(title:string,description:string,category=''){
  document.title=title;
  let meta=document.querySelector<HTMLMetaElement>('meta[name="description"]');
  if(!meta){meta=document.createElement('meta');meta.name='description';document.head.appendChild(meta);}
  meta.content=description;
  let canonical=document.querySelector<HTMLLinkElement>('link[rel="canonical"]');
  if(!canonical){canonical=document.createElement('link');canonical.rel='canonical';document.head.appendChild(canonical);}
  canonical.href=category?getSiteUrl(category):new URLSearchParams(window.location.search).get('page')==='services'?getSiteUrl():BASE_URL;
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


/** Public read-only feeds, managed by the existing Mini App administration. */
type PublicBanner={id:string;title:string;image_url:string;target_url:string;updated_at:string};
type PublicInfo={id:string;title:string;subtitle:string;description:string;image_url:string|null;target_url:string;updated_at:string};
const publicMedia=(path:string,kind:'home-ads'|'home-info',version:string)=>{
  if(!path.startsWith('/'+kind+'/images/'))return '';
  return API_BASE_URL+path+'?v='+encodeURIComponent(version);
};
// The public landing page never follows Mini App-only internal destinations.
const publicTarget=(url:string)=>allowedLink(url);

const PublicHomeBanners:React.FC=()=>{
  const [items,setItems]=useState<PublicBanner[]>([]);
  const [autoplay,setAutoplay]=useState(false);
  const [active,setActive]=useState(0);
  const rail=useRef<HTMLDivElement>(null);
  const paused=useRef(false);
  useEffect(()=>{
    let mounted=true;
    const controller=new AbortController();
    const timeout=window.setTimeout(()=>controller.abort(),90000);
    void fetch(API_BASE_URL+'/home-ads/published',{signal:controller.signal})
      .then(response=>{if(!response.ok)throw new Error('banners');return response.json();})
      .then((feed:{items:PublicBanner[];autoplay:boolean})=>{
        if(!mounted||!Array.isArray(feed.items))return;
        setItems(feed.items.slice(0,4));
        setAutoplay(Boolean(feed.autoplay));
      }).catch(()=>{}).finally(()=>window.clearTimeout(timeout));
    return()=>{mounted=false;controller.abort();window.clearTimeout(timeout)};
  },[]);
  const select=(index:number)=>{
    const container=rail.current;
    if(!container)return;
    const slide=container.children[index] as HTMLElement|undefined;
    if(!slide)return;
    container.scrollTo({left:slide.offsetLeft-(container.children[0] as HTMLElement).offsetLeft,behavior:'smooth'});
    setActive(index);
  };
  useEffect(()=>{
    if(!autoplay||items.length<2||window.matchMedia('(prefers-reduced-motion: reduce)').matches)return;
    const interval=window.setInterval(()=>{
      if(document.hidden||paused.current)return;
      setActive(index=>{
        const next=(index+1)%items.length;
        const el=rail.current;
        const slide=el?.children[next] as HTMLElement|undefined;
        if(el&&slide)el.scrollTo({left:slide.offsetLeft-(el.children[0] as HTMLElement).offsetLeft,behavior:'smooth'});
        return next;
      });
    },6500);
    return()=>window.clearInterval(interval);
  },[autoplay,items.length]);
  if(!items.length)return null;
  return <section className="vvd-web-public-banners" aria-label="Баннеры VVD CPA">
    <div ref={rail} className="vvd-web-banner-rail" onTouchStart={()=>{paused.current=true}} onPointerDown={()=>{paused.current=true}}
      onScroll={event=>{
        const el=event.currentTarget;
        const first=el.children[0] as HTMLElement|undefined;
        if(!first)return;
        let index=0,smallest=Infinity;
        Array.from(el.children).forEach((child,i)=>{
          const delta=Math.abs((child as HTMLElement).offsetLeft-first.offsetLeft-el.scrollLeft);
          if(delta<smallest){smallest=delta;index=i}
        });
        setActive(index);
      }}>
      {items.map((banner,index)=>{
        const src=publicMedia(banner.image_url,'home-ads',banner.updated_at);
        const href=publicTarget(banner.target_url);
        return <div className="vvd-web-banner-slide" key={banner.id}>
          {src&&<img src={src} alt={banner.title||'VVD CPA'} loading={index===0?'eager':'lazy'} decoding="async"/>}
          {href&&<a href={href} target="_blank" rel="noopener noreferrer" aria-label={'Открыть: '+banner.title} className="vvd-web-banner-link"/>}
        </div>;
      })}
    </div>
    {items.length>1&&<div className="vvd-web-banner-dots" aria-label="Выбор баннера">
      {items.map((banner,index)=><button type="button" key={banner.id} onClick={()=>{paused.current=true;select(index)}}
        aria-label={'Баннер '+(index+1)} aria-current={active===index?'true':undefined}
        className={active===index?'is-active':''}/>)}
    </div>}
  </section>;
};

const PublicHomeInfo:React.FC=()=>{
  const [items,setItems]=useState<PublicInfo[]>([]);
  useEffect(()=>{
    let mounted=true;
    const controller=new AbortController();
    const timeout=window.setTimeout(()=>controller.abort(),90000);
    void fetch(API_BASE_URL+'/home-info/published',{signal:controller.signal})
      .then(response=>{if(!response.ok)throw new Error('info');return response.json();})
      .then((feed:{items:PublicInfo[]})=>{if(mounted&&Array.isArray(feed.items))setItems(feed.items);})
      .catch(()=>{}).finally(()=>window.clearTimeout(timeout));
    return()=>{mounted=false;controller.abort();window.clearTimeout(timeout)};
  },[]);
  if(!items.length)return null;
  return <section className="vvd-web-public-info" aria-label="Информация VVD CPA">
    {items.map(item=>{
      const src=item.image_url?publicMedia(item.image_url,'home-info',item.updated_at):'';
      const href=publicTarget(item.target_url);
      return <article key={item.id} className={'vvd-web-public-info-card'+(src&&!item.title&&!item.subtitle&&!item.description?' is-image-only':'')}>
        {item.subtitle&&<p className="vvd-web-public-info-subtitle">{item.subtitle}</p>}
        {item.title&&<h2>{item.title}</h2>}
        {src&&<img src={src} alt={item.title||'Информация VVD CPA'} loading="lazy" decoding="async"/>}
        {item.description&&<p className="vvd-web-public-info-description">{item.description}</p>}
        {href&&<a className="vvd-web-public-info-link" href={href} target="_blank" rel="noopener noreferrer">Подробнее <ArrowUpRight size={16}/></a>}
      </article>;
    })}
  </section>;
};

export const PublicWebsite:React.FC<{auth:ReturnType<typeof useBrowserSession>;onOpenApp:()=>void}>=({auth,onOpenApp})=>{
  const [data,setData]=useState<DirectoryData>(()=>readPublicDirectoryCache()||INITIAL);
  const [loading,setLoading]=useState(()=>!readPublicDirectoryCache());
  const [error,setError]=useState(false);
  const [catalogAttempt,setCatalogAttempt]=useState(0);
  const [categoryId,setCategoryId]=useState(readCategory);
  const [catalogView,setCatalogView]=useState(isCatalogPage);
  const [query,setQuery]=useState('');
  const [mobileMenu,setMobileMenu]=useState(false);
  const [accountView,setAccountView]=useState(()=>new URLSearchParams(window.location.search).has('account'));
  const viewport=useRef<HTMLDivElement>(null);

  useEffect(()=>{
    let mounted=true;
    const controller=new AbortController();
    // A sleeping backend or interrupted mobile request must not leave skeletons forever.
    // Render Free may need time to wake up after inactivity; keep the first request alive.
    const timeout=setTimeout(()=>controller.abort(),90000);
    fetch(API_BASE_URL+'/service-directory',{signal:controller.signal})
      .then(res=>{if(!res.ok)throw new Error('catalog_error');return res.json();})
      .then((res:DirectoryData)=>{
        if(!validDirectory(res))throw new Error('invalid_catalog');
        if(mounted){savePublicDirectoryCache(res);setData(res);setError(false);}
      })
      .catch(()=>{if(mounted)setError(true);})
      .finally(()=>{clearTimeout(timeout);if(mounted)setLoading(false);});
    return()=>{mounted=false;clearTimeout(timeout);controller.abort();};
  },[catalogAttempt]);

  useEffect(()=>{
    const onHistory=()=>{setCategoryId(readCategory());setCatalogView(isCatalogPage());setAccountView(new URLSearchParams(window.location.search).has('account'));setQuery('');viewport.current?.scrollTo({top:0,behavior:'auto'});};
    window.addEventListener('popstate',onHistory);
    return()=>window.removeEventListener('popstate',onHistory);
  },[]);

  const showCategory=useCallback((id:string)=>{
    window.history.pushState(null,'',getSiteUrl(id));
    setCategoryId(id);setCatalogView(true);setAccountView(false);setQuery('');setMobileMenu(false);
    viewport.current?.scrollTo({top:0,behavior:'instant'});
  },[]);
  const openCatalog=useCallback(()=>{
    if(!catalogView||categoryId||accountView)window.history.pushState(null,'',getSiteUrl());
    setCatalogView(true);setCategoryId('');setAccountView(false);setQuery('');setMobileMenu(false);
    viewport.current?.scrollTo({top:0,behavior:'auto'});
  },[catalogView,categoryId,accountView]);
  const openMain=useCallback(()=>{
    if(catalogView||categoryId||accountView)window.history.pushState(null,'',BASE_URL);
    setCatalogView(false);setCategoryId('');setAccountView(false);setQuery('');setMobileMenu(false);
    viewport.current?.scrollTo({top:0,behavior:'auto'});
  },[catalogView,categoryId,accountView]);
  const openAccount=()=>{
    if(auth.isLoggedIn){onOpenApp();return;}
    window.history.pushState(null,'',BASE_URL+'?account=1');
    setCategoryId('');setCatalogView(false);setAccountView(true);setMobileMenu(false);
    viewport.current?.scrollTo({top:0,behavior:'auto'});
  };
  const jumpTo=(id:string)=>{
    if(catalogView||categoryId||accountView){window.history.pushState(null,'',BASE_URL);setCatalogView(false);setCategoryId('');setAccountView(false);}
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
    }else if(catalogView){
      setMetadata('Каталог сервисов — VVD CPA','Инструменты для вебмастеров и арбитражников: категории, описания и полезные сервисы.');
    }else{
      setMetadata('VVD CPA — CPA партнёрская сеть для арбитражников и вебмастеров','VVD CPA — CPA-партнёрская сеть: офферы, партнёрские ссылки, монетизация трафика, аналитика, баланс и инструменты для арбитражников и вебмастеров. Веб-кабинет и Telegram Mini App.');
    }
  },[category,accountView,catalogView]);

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
          <button type="button" onClick={openCatalog}>Каталог сервисов</button>
          <button type="button" onClick={()=>jumpTo('features')}>Как работает</button>
          <button type="button" onClick={openAccount}>Личный кабинет</button>
        </nav>
        {auth.isLoggedIn
          ?<button type="button" className="vvd-web-header-action" onClick={openAccount}><ShieldCheck size={17}/> Кабинет <ArrowRight size={15}/></button>
          :<button type="button" className="vvd-web-header-action" onClick={()=>auth.setLoginOpen(true)}><span className="vvd-web-login-long">Войти / Регистрация</span><span className="vvd-web-login-short">Войти</span><ArrowRight size={15}/></button>}
        <button type="button" onClick={()=>setMobileMenu(v=>!v)} className="vvd-web-mobile-menu" aria-label={mobileMenu?'Закрыть меню':'Открыть меню'} aria-expanded={mobileMenu}>{mobileMenu?<X size={23}/>:<Menu size={23}/>}</button>
      </header>

      {accountView ? (auth.profile
        ?<BrowserAccount profile={auth.profile} onCatalog={openCatalog} onLogout={()=>{void auth.logout();openMain();}}/>
        :<main className="vvd-web-account">
          <div className="vvd-web-account-heading"><span className="vvd-web-eyebrow">ЛИЧНЫЙ КАБИНЕТ</span><h1>{auth.restoring?'Проверяем сессию…':'Вход через Telegram'}</h1><p>Один аккаунт для сайта и Mini App. Войти и зарегистрироваться можно с помощью Telegram.</p></div>
          {!auth.restoring&&<button type="button" className="vvd-web-gold-button" onClick={()=>auth.setLoginOpen(true)}>Войти / Зарегистрироваться <ArrowRight size={17}/></button>}
        </main>
      ) : catalogView && !categoryId ? <main className="vvd-web-public-main">
        <section className="vvd-web-section" id="catalog">
          <div className="vvd-web-section-heading">
            <div><span className="vvd-web-eyebrow">ИНСТРУМЕНТЫ ДЛЯ РАБОТЫ С ТРАФИКОМ</span><h2>Каталог сервисов</h2><p>Отдельный каталог полезных инструментов для арбитражников и вебмастеров: изучай категории, сравнивай предложения и переходи к нужному сервису. Каталог доступен без регистрации.</p></div>
            <div className="vvd-web-catalog-count">{loading?'Загрузка каталога':data.categories.length+' категорий'}</div>
          </div>
          <label className="vvd-web-search"><Search size={21}/><input type="search" value={query} onChange={e=>setQuery(e.target.value)} placeholder="Найти категорию или сервис..." aria-label="Поиск по каталогу"/></label>
          {error&&<div className="vvd-web-notice" role="alert">
            Не удалось обновить каталог. {data.categories.length?'Показаны последние загруженные категории.':'Сервер временно не отвечает.'}
            <button type="button" className="vvd-web-outline-button" style={{marginTop:12}} onClick={()=>{
              setError(false);
              setLoading(!data.categories.length);
              setCatalogAttempt(n=>n+1);
            }}>Повторить загрузку каталога</button>
          </div>}
          {loading?<div className="vvd-web-categories-grid" aria-busy="true">{[0,1,2,3,4,5].map(n=><div key={n} className="vvd-web-placeholder"/>)}</div>:
            filtered.length>0?<div className="vvd-web-categories-grid">
              {filtered.map(c=>{
                const Icon=directoryIcons[c.icon]||Layers;
                return <a key={c.id} href={getSiteUrl(c.id)} onClick={event=>{event.preventDefault();showCategory(c.id);}} className="vvd-web-category-card">
                  <div className="vvd-web-category-icon"><Icon size={26} strokeWidth={1.6}/></div>
                  <ChevronRight className="vvd-web-card-arrow" size={20}/>
                  <h3>{c.name}</h3><p>{c.description}</p>
                </a>;
              })}
            </div>:<div className="vvd-web-notice">По вашему запросу разделов не найдено.</div>}
        </section>
      </main>
      : categoryId ? <main className="vvd-web-category-view">
        <button type="button" className="vvd-web-back" onClick={openCatalog}><ChevronLeft size={18}/> Все категории</button>
        {category?<>
          <div className="vvd-web-category-hero">
            <div className="vvd-web-category-badge">
              {React.createElement(directoryIcons[category.icon]||Layers,{size:34,strokeWidth:1.5})}
            </div>
            <div><span className="vvd-web-eyebrow">VVD CPA / КАТАЛОГ СЕРВИСОВ</span><h1>{category.name}</h1><p>{category.description}</p><span className="vvd-web-muted">{services.length?services.length+' предложений':'Предложения появятся после подключения партнёров'}</span></div>
          </div>
          {services.length>0?<div className="vvd-web-services-grid">{services.map(s=><ServiceTile key={s.id} service={s}/>)}</div>:
          <div className="vvd-web-empty-service"><Layers size={30}/><h2>Сервисы скоро появятся</h2><p>Мы добавляем предложения по мере подключения партнёрских программ. Сейчас здесь нет опубликованных сервисов.</p><button type="button" onClick={openCatalog}>Смотреть другие категории <ArrowRight size={17}/></button></div>}
        </>:<div className="vvd-web-empty-service"><h1>Раздел не найден</h1><p>Возможно, категория была переименована или скрыта.</p><button onClick={openCatalog}>Вернуться в каталог</button></div>}
      </main> :
      <main className="vvd-web-public-main">
        <section className="vvd-web-workspace-intro" id="top" aria-labelledby="vvd-web-intro-title">
          <div className="vvd-web-workspace-copy">
            <span className="vvd-web-eyebrow"><span className="vvd-web-dot"/> CPA-ПАРТНЁРСКАЯ СЕТЬ · VVD CPA</span>
            <h1 id="vvd-web-intro-title">Зарабатывай на своём трафике.<br/><em>VVD CPA — партнёрка.</em></h1>
            <p>Монетизируй свой трафик через смартлинки разных вертикалей. <strong>Выплаты, аналитика и поддержка</strong> — в одной платформе.</p>
            <div className="vvd-web-hero-points" aria-label="Преимущества VVD CPA">
              <span><Link2 size={18} aria-hidden="true"/> Смартлинки</span>
              <span><Layers size={18} aria-hidden="true"/> Мультивертикаль</span>
              <span><Wallet size={18} aria-hidden="true"/> Выплаты по запросу</span>
              <span><Zap size={18} aria-hidden="true"/> Быстрый холд</span>
              <span><Headphones size={18} aria-hidden="true"/> Саппорт 24/7</span>
              <span><Globe2 size={18} aria-hidden="true"/> Весь мир</span>
            </div>
            <div className="vvd-web-workspace-actions">
              <button type="button" className={auth.isLoggedIn?'vvd-web-gold-button':'vvd-web-gold-button vvd-web-telegram-pulse'} onClick={()=>auth.isLoggedIn?openAccount():auth.setLoginOpen(true)}>{auth.isLoggedIn?'Открыть кабинет':'Начать через Telegram'} <ArrowRight size={16}/></button>
              <button type="button" className="vvd-web-outline-button" onClick={openCatalog}>Каталог сервисов <ArrowRight size={16}/></button>
            </div>
          </div>
          <div className="vvd-web-hero-panel" aria-label="Что есть внутри партнёрской платформы">
            <div className="vvd-web-hero-panel-heading"><span className="vvd-web-panel-symbol"><Layers size={22}/></span><div><small>ОДНА ПЛАТФОРМА</small><strong>Смартлинки · Доход · Выплаты</strong></div></div>
            <div className="vvd-web-hero-panel-grid">
              <div><Link2 size={19}/><strong>Смартлинки</strong><span>Офферы разных вертикалей</span></div>
              <div><Activity size={19}/><strong>Статистика</strong><span>Клики и конверсии</span></div>
              <div><Wallet size={19}/><strong>Выплаты</strong><span>Баланс и история выплат</span></div>
              <div><Wrench size={19}/><strong>Инструменты</strong><span>Сервисы для трафика</span></div>
            </div>
            <div className="vvd-web-hero-panel-footer"><ShieldCheck size={15}/> Один Telegram-аккаунт для сайта и Mini App</div>
          </div>
        </section>

        <PublicHomeBanners/>

        <PublicHomeInfo/>

        <section className="vvd-web-section vvd-web-feature-section" id="features" aria-labelledby="vvd-how-heading">
          <div className="vvd-web-section-heading"><div><span className="vvd-web-eyebrow">КАК УСТРОЕНА ПАРТНЁРСКАЯ СЕТЬ</span><h2 id="vvd-how-heading">Как зарабатывать с VVD CPA</h2><p>VVD CPA объединяет CPA-предложения и инструменты для партнёров в одном кабинете. Работа с офферами требует соблюдения условий рекламодателей и правил источников трафика.</p></div></div>
          <div className="vvd-web-steps">
            <article><span>01</span><div><h3>Выбери смартлинк</h3><p>Подбери вертикаль и изучи условия оффера и источники трафика.</p></div></article>
            <article><span>02</span><div><h3>Направляй трафик</h3><p>Привлекай подходящую аудиторию по партнёрской ссылке.</p></div></article>
            <article><span>03</span><div><h3>Отслеживай доход</h3><p>Смотри конверсии, начисления и выплаты в кабинете.</p></div></article>
          </div>
          <div className="vvd-web-section-heading vvd-web-inside-heading"><div><span className="vvd-web-eyebrow">ПОСЛЕ РЕГИСТРАЦИИ ЧЕРЕЗ TELEGRAM</span><h2>Всё необходимое в одном кабинете</h2><p>На сайте и в Telegram Mini App открывается один и тот же VVD CPA с общим аккаунтом и данными.</p></div></div>
          <div className="vvd-web-features-grid">
            <div className="vvd-web-feature"><span><Target size={24}/></span><h3>CPA-офферы и ссылки</h3><p>Список доступных предложений, условия и инструменты для получения партнёрских ссылок.</p></div>
            <div className="vvd-web-feature"><span><BarChart3 size={24}/></span><h3>Аналитика трафика</h3><p>Клики, конверсии, разбивка по источникам и другим параметрам, доступным в системе.</p></div>
            <div className="vvd-web-feature"><span><LayoutDashboard size={24}/></span><h3>Кабинет и инструменты</h3><p>Баланс, история начислений, профиль и раздел инструментов VVD CPA.</p></div>
          </div>
        </section>

        <section className="vvd-web-cta">
          <div><span className="vvd-web-eyebrow">ОДИН АККАУНТ · ДВА СПОСОБА ВХОДА</span><h2>Начни работу с VVD CPA</h2><p>Войди через Telegram, чтобы открыть партнёрский кабинет прямо в браузере. Те же разделы доступны и в Mini App.</p></div>
          <div className="vvd-web-cta-actions">
            <button type="button" className="vvd-web-gold-button" onClick={()=>auth.isLoggedIn?openAccount():auth.setLoginOpen(true)}>{auth.isLoggedIn?'Перейти в кабинет':'Войти / Зарегистрироваться'} <ArrowRight size={17}/></button>
            <a className="vvd-web-outline-button" href={BOT_URL} target="_blank" rel="noopener noreferrer">Telegram Mini App <ArrowUpRight size={17}/></a>
          </div>
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
      onLogin={session=>{auth.login(session);onOpenApp();}}
    />}
  </div>;
};
