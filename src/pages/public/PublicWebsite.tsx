import React,{useCallback,useEffect,useLayoutEffect,useMemo,useRef,useState} from 'react';
import {ArrowRight,ArrowUpRight,BarChart3,BookOpen,Check,ChevronLeft,ChevronRight,Home,Layers,LayoutGrid,Menu,Search,Copy,ShieldCheck,UserRound,Link2,Wallet,X} from 'lucide-react';
import {API_BASE_URL} from '@/shared/lib/api';
import {directoryIcons,type DirectoryData,type DirectoryService} from '@/pages/tools/serviceDirectoryApi';
import {BrowserAccount, TelegramBrowserLogin, type useBrowserSession} from './WebAuth';
import './PublicWebsite.css';
import {PublicEditorial} from './PublicEditorial';
import {UnifiedCategoryCard,serviceCountLabel} from '@/shared/ui/UnifiedCategoryCard';
import {PublicPolicy} from './PublicPolicy';
import {iconFor,type InfoItem} from '@/pages/info/InfoPage';
import {LOCALE_SWITCH_ENABLED,useLocale,setLocale,localize} from '@/shared/lib/locale';
import {guestInfoEnglish} from './GuestInfoEnglish';

const BOT_URL='https://t.me/vvd_cpa_bot';
const BASE_URL='https://vitalujs2233.github.io/vvd-cpa/';
const INITIAL:DirectoryData={version:0,categories:[],services:[]};
// Public directory only: keep a short-lived copy to avoid blank cards when switching views.
const DIRECTORY_CACHE_KEY='vvd_public_directory_v1';
const DIRECTORY_CACHE_TTL=60*1000;
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
const isArticlePage=()=>new URLSearchParams(window.location.search).get('page')==='articles';
const readArticle=()=>new URLSearchParams(window.location.search).get('article')||'';
type PolicyPage='privacy'|'cookies';
const readPolicy=():PolicyPage|null=>{
  const page=new URLSearchParams(window.location.search).get('page');
  return page==='privacy'||page==='cookies'?page:null;
};
const policyUrl=(page:PolicyPage)=>BASE_URL+'?page='+page;
const articleUrl=(slug='')=>BASE_URL+'?page=articles'+(slug?'&article='+encodeURIComponent(slug):'');

function setMetadata(title:string,description:string,category=''){
  document.title=title;
  let meta=document.querySelector<HTMLMetaElement>('meta[name="description"]');
  if(!meta){meta=document.createElement('meta');meta.name='description';document.head.appendChild(meta);}
  meta.content=description;
  for(const [selector,value] of [
    ['meta[property="og:title"]',title],['meta[property="og:description"]',description],
    ['meta[name="twitter:title"]',title],['meta[name="twitter:description"]',description]
  ] as const){
    const node=document.querySelector<HTMLMetaElement>(selector);
    if(node)node.content=value;
  }
  let canonical=document.querySelector<HTMLLinkElement>('link[rel="canonical"]');
  if(!canonical){canonical=document.createElement('link');canonical.rel='canonical';document.head.appendChild(canonical);}
  canonical.href=category?getSiteUrl(category):isArticlePage()?articleUrl(readArticle()):isCatalogPage()?getSiteUrl():BASE_URL;
  const ogUrl=document.querySelector<HTMLMetaElement>('meta[property="og:url"]');
  if(ogUrl)ogUrl.content=canonical.href;
  const ogType=document.querySelector<HTMLMetaElement>('meta[property="og:type"]');
  if(ogType)ogType.content=isArticlePage()&&!!readArticle()?'article':'website';
}

const ServiceTile:React.FC<{service:DirectoryService;priority?:boolean}>=({service,priority=false})=>{
  const Icon=directoryIcons[service.icon]||Layers;
  const dest=allowedLink(service.website_url);
  const benefits=(service.benefits||'').split(/\n/).map(x=>x.trim()).filter(Boolean).slice(0,3);
  const [copyStatus,setCopyStatus]=useState<'idle'|'copied'|'error'>('idle');
  useEffect(()=>{
    if(copyStatus==='idle')return;
    const timeout=window.setTimeout(()=>setCopyStatus('idle'),2200);
    return()=>window.clearTimeout(timeout);
  },[copyStatus]);
  const copyPromo=async()=>{
    try{
      await navigator.clipboard.writeText(service.promo_code);
      setCopyStatus('copied');
    }catch{setCopyStatus('error');}
  };
  return <article className="vvd-web-service-card">
    <div className={'vvd-web-service-banner'+(allowedLink(service.image_url)?' has-image':'')}>
      {allowedLink(service.image_url)
        ?<img src={service.image_url} alt={service.name+' — логотип'} loading={priority?'eager':'lazy'} fetchPriority={priority?'high':'auto'} decoding="async"/>
        :<Icon size={46} strokeWidth={1.5} aria-hidden="true"/>}
    </div>
    <div className="vvd-web-service-content">
      <div className="vvd-web-service-info">
        <h3>{service.name}</h3>
        <p>{service.description}</p>
      </div>
      {benefits.length>0&&<ul className="vvd-web-benefit-list">{benefits.map((text,index)=><li key={index}><Check size={14}/>{text}</li>)}</ul>}
      {(service.discount_text||service.promo_code)&&<div className="vvd-web-deal">
        {service.discount_text&&<span>{service.discount_text}</span>}
        {service.promo_code&&<button type="button" className="vvd-web-promo-copy" onClick={()=>void copyPromo()}
          aria-label={'Скопировать промокод '+service.promo_code} title="Скопировать промокод">
          <span>Промокод: <strong>{service.promo_code}</strong></span>
          {copyStatus==='copied'?<Check size={18} aria-hidden="true"/>:<Copy size={18} aria-hidden="true"/>}
        </button>}
        {copyStatus!=='idle'&&<span className="vvd-web-promo-status" role="status">
          {copyStatus==='copied'?'Скопировано':'Не удалось скопировать'}
        </span>}
      </div>}
      {dest&&<a className="vvd-web-service-action" href={dest} target="_blank" rel={service.partner_link?'noopener noreferrer sponsored nofollow':'noopener noreferrer'}>
        Перейти на сайт <ArrowUpRight size={17}/>
      </a>}
      {dest&&service.partner_link&&<span className="vvd-web-disclosure">Партнёрская ссылка</span>}
    </div>
  </article>;
};


/** Public read-only feeds, managed by the existing Mini App administration. */
type PublicBanner={id:string;title:string;image_url:string;target_url:string;updated_at:string};
type PublicInfo={id:string;title:string;subtitle:string;description:string;image_url:string|null;target_url:string;updated_at:string};
type PublicWhyInfo=InfoItem;
// Only public, admin-managed homepage media metadata is cached here, never account data.
// Render it on repeat visits while refreshing the live feed in the background.
const readPublicHomeFeed=<T,>(key:string):T|null=>{
  try {
    const raw=window.localStorage.getItem('vvd:public-home:'+key);
    if(!raw)return null;
    const saved=JSON.parse(raw) as {at:number;data:T};
    if(!saved||typeof saved.at!=='number'||Date.now()-saved.at>24*60*60*1000||!saved.data)return null;
    return saved.data;
  }catch{return null;}
};
const savePublicHomeFeed=<T,>(key:string,data:T)=>{
  try{window.localStorage.setItem('vvd:public-home:'+key,JSON.stringify({at:Date.now(),data}));}catch{/* Storage can be disabled. */}
};
const publicMedia=(path:string,kind:'home-ads'|'home-info',version:string)=>{
  if(!path.startsWith('/'+kind+'/images/'))return '';
  return API_BASE_URL+path+'?v='+encodeURIComponent(version);
};
// The public landing page never follows Mini App-only internal destinations.
const publicTarget=(url:string)=>allowedLink(url);

const PublicHomeBanners:React.FC=()=>{
  const [items,setItems]=useState<PublicBanner[]>(()=>readPublicHomeFeed<{items:PublicBanner[];autoplay:boolean}>('ads')?.items||[]);
  const [autoplay,setAutoplay]=useState(()=>readPublicHomeFeed<{items:PublicBanner[];autoplay:boolean}>('ads')?.autoplay||false);
  const [loading,setLoading]=useState(()=>!readPublicHomeFeed('ads'));
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
        const next={items:feed.items.slice(0,4),autoplay:Boolean(feed.autoplay)};
        savePublicHomeFeed('ads',next);
        setItems(next.items);
        setAutoplay(next.autoplay);
      }).catch(()=>{}).finally(()=>{if(mounted)setLoading(false);window.clearTimeout(timeout)});
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
  if(!items.length)return loading
    ?<section className="vvd-web-public-banners vvd-web-home-media-loading" aria-label="Загрузка баннеров" aria-busy="true">
      <div className="vvd-web-banner-slide vvd-web-media-skeleton"/>
    </section>
    :null;
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
          {src&&<img src={src} alt={banner.title||'VVD CPA'} loading={index===0?'eager':'lazy'} fetchPriority={index===0?'high':'low'} decoding="async"/>}
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
  const [items,setItems]=useState<PublicInfo[]>(()=>readPublicHomeFeed<PublicInfo[]>('info')||[]);
  const [loading,setLoading]=useState(()=>!readPublicHomeFeed('info'));
  useEffect(()=>{
    let mounted=true;
    const controller=new AbortController();
    const timeout=window.setTimeout(()=>controller.abort(),90000);
    void fetch(API_BASE_URL+'/home-info/published',{signal:controller.signal})
      .then(response=>{if(!response.ok)throw new Error('info');return response.json();})
      .then((feed:{items:PublicInfo[]})=>{
        if(!mounted||!Array.isArray(feed.items))return;
        savePublicHomeFeed('info',feed.items);
        setItems(feed.items);
      })
      .catch(()=>{}).finally(()=>{if(mounted)setLoading(false);window.clearTimeout(timeout)});
    return()=>{mounted=false;controller.abort();window.clearTimeout(timeout)};
  },[]);
  if(!items.length)return loading
    ?<section className="vvd-web-public-info vvd-web-home-media-loading" aria-label="Загрузка информационного баннера" aria-busy="true">
      <div className="vvd-web-public-info-card vvd-world-banner vvd-web-media-skeleton"/>
    </section>
    :null;
  return <section className="vvd-web-public-info" aria-label="Информация VVD CPA">
    {items.map((item,index)=>{
      const src=item.image_url?publicMedia(item.image_url,'home-info',item.updated_at):'';
      const href=publicTarget(item.target_url);
      return <article key={item.id} className={'vvd-web-public-info-card'+(item.id==='e44a0b70-c27b-4419-9249-c8379ac02ea2'?' vvd-world-banner':'')+(src&&!item.title&&!item.subtitle&&!item.description?' is-image-only':'')}>
        {item.subtitle&&<p className="vvd-web-public-info-subtitle">{item.subtitle}</p>}
        {item.title&&<h2>{item.title}</h2>}
        {src&&<img src={src} alt={item.title||'Информация VVD CPA'} loading={index===0?'eager':'lazy'} decoding="async"/>}
        {item.description&&<p className="vvd-web-public-info-description">{item.description}</p>}
        {href&&<a className="vvd-web-public-info-link" href={href} target="_blank" rel="noopener noreferrer">Подробнее <ArrowUpRight size={16}/></a>}
      </article>;
    })}
  </section>;
};


/** Read the same published /info content as Mini App and the information admin.
    Guest visitors only see published, visible sections; no account or admin data. */
const PublicWhyVvd:React.FC=()=>{
  const lang=useLocale();
  const t=(ru:string,en:string)=>localize(lang,ru,en);
  const [items,setItems]=useState<PublicWhyInfo[]>(()=>readPublicHomeFeed<PublicWhyInfo[]>('why')||[]);
  const [loading,setLoading]=useState(()=>!readPublicHomeFeed('why'));
  useEffect(()=>{
    let mounted=true;
    const controller=new AbortController();
    const timeout=window.setTimeout(()=>controller.abort(),30000);
    void fetch(API_BASE_URL+'/info/published',{signal:controller.signal})
      .then(response=>{if(!response.ok)throw new Error('why-info');return response.json()})
      .then((feed:{items:PublicWhyInfo[]})=>{
        if(!mounted||!Array.isArray(feed.items))return;
        const visible=feed.items.filter(item=>item&&item.visible!==false&&(item.kind==='section'||item.kind==='banner')&&typeof item.title==='string'&&typeof item.body==='string');
        savePublicHomeFeed('why',visible);
        setItems(visible);
      })
      .catch(()=>{})
      .finally(()=>{window.clearTimeout(timeout);if(mounted)setLoading(false)});
    return()=>{mounted=false;controller.abort();window.clearTimeout(timeout)};
  },[]);
  if(!items.length&&!loading)return null;
  return <section className="vvd-web-why" aria-labelledby="vvd-web-why-title">
    <div className="vvd-web-why-heading">
      <span className="vvd-web-eyebrow">{t('О ПЛАТФОРМЕ И СОТРУДНИЧЕСТВЕ','ABOUT THE PLATFORM & PARTNERSHIP')}</span>
      <h2 id="vvd-web-why-title">{t('Почему VVD CPA?','Why VVD CPA?')}</h2>
      <p>{t('Офферы, аналитика, условия работы и поддержка — короткие ответы для вебмастеров.','Offers, analytics, partnership terms and support — clear answers for publishers.')}</p>
    </div>
    <div className="vvd-web-why-items" aria-busy={loading&&!items.length}>
      {items.length?items.map(original=>{
        const item=guestInfoEnglish(original,lang);
        const Icon=iconFor(item);
        const link=allowedLink(item.button_url||'');
        const image=allowedLink(item.image_url||'');
        return item.kind==='section'
          ?<details key={item.id} className="vvd-web-why-item">
            <summary>
              <span className="vvd-web-why-icon"><Icon size={22} strokeWidth={1.7} aria-hidden="true"/></span>
              <span className="vvd-web-why-summary-copy"><strong>{item.title}</strong>{item.description&&<small>{item.description}</small>}</span>
              <ChevronRight size={17} aria-hidden="true"/>
            </summary>
            <div className="vvd-web-why-detail">
              {item.body&&<p>{item.body}</p>}
              {image&&<img src={image} alt={item.title} loading="lazy" decoding="async"/>}
              {link&&<a href={link} target="_blank" rel="noopener noreferrer">{item.button_text||'Подробнее'}</a>}
            </div>
          </details>
          :<article key={item.id} className="vvd-web-why-item vvd-web-why-banner">
            {image&&<img src={image} alt={item.title} loading="lazy" decoding="async"/>}
            <strong>{item.title}</strong>
            {item.description&&<p>{item.description}</p>}
            {item.quote&&<p className="vvd-web-why-quote">{item.quote}</p>}
            {link&&<a href={link} target="_blank" rel="noopener noreferrer">{item.button_text||'Подробнее'}</a>}
          </article>;
      }):Array.from({length:7},(_,index)=><div key={index} className="vvd-web-why-placeholder" aria-hidden="true"/>)}
    </div>
  </section>;
};

export const PublicWebsite:React.FC<{auth:ReturnType<typeof useBrowserSession>;onOpenApp:()=>void}>=({auth,onOpenApp})=>{
  const lang=useLocale();
  const t=(ru:string,en:string)=>localize(lang,ru,en);
  const [data,setData]=useState<DirectoryData>(()=>readPublicDirectoryCache()||INITIAL);
  const [loading,setLoading]=useState(()=>!readPublicDirectoryCache());
  const [error,setError]=useState(false);
  const [catalogAttempt,setCatalogAttempt]=useState(0);
  const [categoryId,setCategoryId]=useState(readCategory);
  const [catalogView,setCatalogView]=useState(isCatalogPage);
  const [articlesView,setArticlesView]=useState(isArticlePage);
  const [articleSlug,setArticleSlug]=useState(readArticle);
  const [policyPage,setPolicyPage]=useState<PolicyPage|null>(readPolicy);
  const [query,setQuery]=useState('');
  const [mobileMenu,setMobileMenu]=useState(false);
  const [accountView,setAccountView]=useState(()=>new URLSearchParams(window.location.search).has('account'));
  const viewport=useRef<HTMLDivElement>(null);
  // The public website has its own scrolling viewport. Reset it synchronously
  // whenever the visitor opens the catalog or switches service categories.
  useLayoutEffect(()=>{
    if(catalogView&&viewport.current)viewport.current.scrollTop=0;
  },[catalogView,categoryId]);

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
    const onHistory=()=>{setCategoryId(readCategory());setCatalogView(isCatalogPage());setArticlesView(isArticlePage());setArticleSlug(readArticle());setPolicyPage(readPolicy());setAccountView(new URLSearchParams(window.location.search).has('account'));setQuery('');if(viewport.current)viewport.current.scrollTop=0;};
    window.addEventListener('popstate',onHistory);
    return()=>window.removeEventListener('popstate',onHistory);
  },[]);

  const showCategory=useCallback((id:string)=>{
    window.history.pushState(null,'',getSiteUrl(id));
    setCategoryId(id);setCatalogView(true);setArticlesView(false);setPolicyPage(null);setArticleSlug('');setAccountView(false);setQuery('');setMobileMenu(false);
    if(viewport.current)viewport.current.scrollTop=0;
  },[]);
  const openCatalog=useCallback(()=>{
    if(!catalogView||categoryId||accountView)window.history.pushState(null,'',getSiteUrl());
    setCatalogView(true);setArticlesView(false);setPolicyPage(null);setArticleSlug('');setCategoryId('');setAccountView(false);setQuery('');setMobileMenu(false);
    if(viewport.current)viewport.current.scrollTop=0;
  },[catalogView,articlesView,categoryId,accountView,policyPage]);
  const openArticles=useCallback((slug='')=>{
    window.history.pushState(null,'',articleUrl(slug));
    setArticlesView(true);setArticleSlug(slug);setPolicyPage(null);setCatalogView(false);setCategoryId('');setAccountView(false);setMobileMenu(false);
    if(viewport.current)viewport.current.scrollTop=0;
  },[]);
  const onArticleMetadata=useCallback((title:string,description:string,cover?:string,date?:string)=>{
    setMetadata(title+' — VVD CPA',description);
    let imageMeta=document.querySelector<HTMLMetaElement>('meta[property="og:image"]');
    if(!imageMeta){imageMeta=document.createElement('meta');imageMeta.setAttribute('property','og:image');document.head.appendChild(imageMeta);}
    imageMeta.content=cover||'';
    let script=document.querySelector<HTMLScriptElement>('#vvd-editorial-jsonld');
    if(script)script.remove();
    if(date&&readArticle()){
      script=document.createElement('script');script.id='vvd-editorial-jsonld';script.type='application/ld+json';
      script.textContent=JSON.stringify({'@context':'https://schema.org','@type':'Article',headline:title,description,datePublished:date,image:cover||undefined,mainEntityOfPage:articleUrl(readArticle()),publisher:{'@type':'Organization',name:'VVD CPA'}});
      document.head.appendChild(script);
    }
  },[]);
  useEffect(()=>{
    if(articlesView&&articleSlug)return;
    document.querySelector('#vvd-editorial-jsonld')?.remove();
    const imageMeta=document.querySelector<HTMLMetaElement>('meta[property="og:image"]');
    if(imageMeta)imageMeta.content='';
  },[articlesView,articleSlug]);
  const openMain=useCallback(()=>{
    if(catalogView||articlesView||categoryId||accountView||policyPage)window.history.pushState(null,'',BASE_URL);
    setCatalogView(false);setArticlesView(false);setPolicyPage(null);setArticleSlug('');setCategoryId('');setAccountView(false);setQuery('');setMobileMenu(false);
    if(viewport.current)viewport.current.scrollTop=0;
  },[catalogView,articlesView,categoryId,accountView,policyPage]);
  const openPolicy=(page:PolicyPage)=>{
    if(policyPage!==page)window.history.pushState(null,'',policyUrl(page));
    setPolicyPage(page);setCategoryId('');setCatalogView(false);setArticlesView(false);
    setArticleSlug('');setAccountView(false);setMobileMenu(false);
    if(viewport.current)viewport.current.scrollTop=0;
  };
  const openAccount=()=>{
    if(auth.isLoggedIn){onOpenApp();return;}
    window.history.pushState(null,'',BASE_URL+'?account=1');
    setCategoryId('');setCatalogView(false);setArticlesView(false);setPolicyPage(null);setArticleSlug('');setAccountView(true);setMobileMenu(false);
    if(viewport.current)viewport.current.scrollTop=0;
  };
  const category=data.categories.find(c=>c.id===categoryId);
  const filtered=useMemo(()=>{
    const s=query.trim().toLocaleLowerCase('ru');
    return data.categories.filter(c=>!s||[c.name,c.description].some(text=>text.toLocaleLowerCase('ru').includes(s))||
      data.services.some(service=>service.category_id===c.id&&[service.name,service.description].some(t=>t.toLocaleLowerCase('ru').includes(s))));
  },[data,query]);
  const services=data.services.filter(s=>s.category_id===categoryId);

  useEffect(()=>{
    if(policyPage){
      setMetadata(
        (policyPage==='privacy'?'Политика конфиденциальности':'Политика файлов cookie')+' — VVD CPA',
        policyPage==='privacy'?'Информация об обработке персональных данных VVD CPA.':'Информация о cookie и хранении данных браузера VVD CPA.'
      );
      let canonical=document.querySelector<HTMLLinkElement>('link[rel="canonical"]');
      if(!canonical){canonical=document.createElement('link');canonical.rel='canonical';document.head.appendChild(canonical);}
      canonical.href=policyUrl(policyPage);
      const ogUrl=document.querySelector<HTMLMetaElement>('meta[property="og:url"]');
      if(ogUrl)ogUrl.content=canonical.href;
    }else if(accountView){
      setMetadata('Личный кабинет — VVD CPA','Защищённый вход в личный кабинет VVD CPA через Telegram.');
    }else if(category){
      setMetadata(category.name+' — Каталог сервисов VVD CPA',category.description||'Каталог профессиональных сервисов для вебмастеров.',category.id);
    }else if(catalogView){
      setMetadata('Каталог сервисов — VVD CPA','Инструменты для вебмастеров и арбитражников: категории, описания и полезные сервисы.');
    }else if(articlesView){
      if(!articleSlug)setMetadata('Статьи и кейсы — VVD CPA','Полезные статьи, кейсы и обучение для вебмастеров.');
    }else{
      setMetadata('VVD CPA — CPA партнёрская сеть для арбитражников и вебмастеров','VVD CPA — CPA-партнёрская сеть: офферы, партнёрские ссылки, монетизация трафика, аналитика, баланс и инструменты для арбитражников и вебмастеров. Веб-кабинет и Telegram Mini App.');
    }
  },[category,accountView,catalogView,articlesView,articleSlug,policyPage]);

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
          <button type="button" onClick={openMain}><span className="vvd-web-nav-icon"><Home size={17}/></span><span>{t('Главная','Home')}</span></button>
          <button type="button" onClick={openCatalog}><span className="vvd-web-nav-icon"><LayoutGrid size={17}/></span><span>{t('Каталог сервисов','Service directory')}</span></button>
          <button type="button" onClick={()=>openArticles()}><span className="vvd-web-nav-icon"><BookOpen size={17}/></span><span>{t('Статьи и кейсы','Articles & cases')}</span></button>
          <button type="button" onClick={openAccount}><span className="vvd-web-nav-icon"><UserRound size={17}/></span><span>{t('Личный кабинет','Account')}</span></button>
        </nav>
        {/* Localization paused: keep the prepared control ready for reactivation. */}
        {LOCALE_SWITCH_ENABLED&&<div className="vvd-web-locale-switch" role="group" aria-label={t('Язык сайта','Website language')}>
          <button type="button" aria-label="Русский" aria-pressed={lang==='ru'} className={lang==='ru'?'is-active':''} onClick={()=>setLocale('ru')}>RU</button>
          <button type="button" aria-label="English" aria-pressed={lang==='en'} className={lang==='en'?'is-active':''} onClick={()=>setLocale('en')}>EN</button>
        </div>}
        {auth.isLoggedIn
          ?<button type="button" className="vvd-web-header-action" onClick={openAccount}><ShieldCheck size={17}/> {t('Кабинет','Account')} <ArrowRight size={15}/></button>
          :<button type="button" className="vvd-web-header-action" onClick={()=>auth.setLoginOpen(true)}><span className="vvd-web-login-long">{t('Войти / Регистрация','Sign in / Register')}</span><span className="vvd-web-login-short">{t('Войти','Sign in')}</span><ArrowRight size={15}/></button>}
        <button type="button" onClick={()=>setMobileMenu(v=>!v)} className="vvd-web-mobile-menu" aria-label={mobileMenu?'Закрыть меню':'Открыть меню'} aria-expanded={mobileMenu}>{mobileMenu?<X size={23}/>:<Menu size={23}/>}</button>
      </header>

      {policyPage ? <PublicPolicy kind={policyPage} onBack={openMain}/>
       : accountView ? (auth.profile
        ?<BrowserAccount profile={auth.profile} onCatalog={openCatalog} onLogout={()=>{void auth.logout();openMain();}}/>
        :<main className="vvd-web-account">
          <div className="vvd-web-account-heading"><span className="vvd-web-eyebrow">ЛИЧНЫЙ КАБИНЕТ</span><h1>{auth.restoring?'Проверяем сессию…':'Вход через Telegram'}</h1><p>Один аккаунт для сайта и Mini App. Войти и зарегистрироваться можно с помощью Telegram.</p></div>
          {!auth.restoring&&<button type="button" className="vvd-web-gold-button" onClick={()=>auth.setLoginOpen(true)}>Войти / Зарегистрироваться <ArrowRight size={17}/></button>}
        </main>
      ) : articlesView ? <PublicEditorial slug={articleSlug} onArticle={openArticles} onBack={()=>openArticles()} onMetadata={onArticleMetadata} contributionAuthenticated={Boolean(auth.profile)} onContributionLogin={()=>auth.setLoginOpen(true)}/>
      : catalogView && !categoryId ? <main className="vvd-web-public-main">
        <section className="vvd-web-section vvd-web-catalog-section" id="catalog">
          <div className="vvd-web-section-heading">
            <div><span className="vvd-web-eyebrow">ИНСТРУМЕНТЫ ДЛЯ РАБОТЫ С ТРАФИКОМ</span><h2>Каталог сервисов</h2><p>Отдельный каталог полезных инструментов для арбитражников и вебмастеров</p></div>
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
              {filtered.map(c=><UnifiedCategoryCard key={c.id}
                href={getSiteUrl(c.id)}
                onClick={event=>{event.preventDefault();showCategory(c.id);}}
                icon={directoryIcons[c.icon]||Layers}
                title={c.name}
                description={c.description}
                status={(()=>{const n=data.services.filter(service=>service.category_id===c.id).length;return n?serviceCountLabel(n):'Сервисы скоро появятся';})()}
              />)}
            </div>:<div className="vvd-web-notice">По вашему запросу разделов не найдено.</div>}
        </section>
      </main>
      : categoryId ? <main className="vvd-web-category-view">
        <button type="button" className="vvd-web-back" onClick={openCatalog}><ChevronLeft size={18}/> Все категории</button>
        {loading&&!data.categories.length
          ?<div className="vvd-web-directory-loading" aria-busy="true" aria-label="Загрузка категории и сервисов">
            <div className="vvd-web-directory-loading-heading"/>
            <div className="vvd-web-directory-loading-summary"/>
            <div className="vvd-web-directory-loading-card">
              <div className="vvd-web-directory-loading-banner"/>
              <div className="vvd-web-directory-loading-lines"><span/><span/><span/></div>
            </div>
          </div>
          :category?<>
          <header className="vvd-web-directory-intro">
            <span className="vvd-web-eyebrow">КАТАЛОГ СЕРВИСОВ</span>
            <h1>{category.name}</h1>
            <p>{category.description}</p>
            <span className="vvd-web-muted">{services.length?services.length+' предложений':'Сервисы пока не добавлены'}</span>
          </header>
          {services.length>0?<div className="vvd-web-services-grid">{services.map((s,index)=><ServiceTile key={s.id} service={s} priority={index===0}/>)}</div>:
          <div className="vvd-web-empty-service"><Layers size={30}/><h2>Сервисы скоро появятся</h2><p>Мы добавляем предложения по мере подключения партнёрских программ. Сейчас здесь нет опубликованных сервисов.</p><button type="button" onClick={openCatalog}>Смотреть другие категории <ArrowRight size={17}/></button></div>}
        </>:<div className="vvd-web-empty-service"><h1>Раздел не найден</h1><p>Возможно, категория была переименована или скрыта.</p><button onClick={openCatalog}>Вернуться в каталог</button></div>}
      </main> :
      <main className="vvd-web-public-main">
        <section className="vvd-web-workspace-intro vvd-web-workspace-intro-compact" id="top" aria-labelledby="vvd-web-intro-title">
          <div className="vvd-web-workspace-copy">
            <div className="vvd-web-hero-support-row">
              <span className="vvd-web-eyebrow"><span className="vvd-web-dot"/> {t('CPA-ПАРТНЁРСКАЯ СЕТЬ · VVD CPA','CPA AFFILIATE NETWORK · VVD CPA')}</span>
              <a className="vvd-web-hero-support" href="https://t.me/vilitolu" target="_blank" rel="noopener noreferrer" aria-label="Поддержка VVD CPA — открыть чат Telegram">
                <span aria-hidden="true">👨‍🚀</span><span>{t('Поддержка','Support')}</span>
              </a>
            </div>
            <h1 id="vvd-web-intro-title">{t('Зарабатывай на своём трафике.','Monetize your traffic.')}<br/><em>{t('VVD CPA — партнёрка.','VVD CPA — affiliate network.')}</em></h1>
            <p>{t('Монетизируй свой трафик через смартлинки разных вертикалей.','Monetize traffic with smartlinks across different verticals.')} <strong>{t('Выплаты, аналитика и поддержка','Payouts, analytics and support')}</strong> {t('— в одной платформе.','— in one platform.')}</p>
            <div className="vvd-web-hero-points" aria-label="Возможности VVD CPA">
              <span><Link2 size={18} aria-hidden="true"/> {t('Партнёрские предложения','Affiliate offers')}</span>
              <span><BarChart3 size={18} aria-hidden="true"/> {t('Аналитика','Analytics')}</span>
              <span><Wallet size={18} aria-hidden="true"/> {t('Выплаты','Payouts')}</span>
              <span><BookOpen size={18} aria-hidden="true"/> {t('Сервисы и знания','Tools & knowledge')}</span>
            </div>
            <div className="vvd-web-workspace-actions">
              <button type="button" className={auth.isLoggedIn?'vvd-web-gold-button':'vvd-web-gold-button vvd-web-telegram-pulse'} onClick={()=>auth.isLoggedIn?openAccount():auth.setLoginOpen(true)}>{auth.isLoggedIn?t('Открыть кабинет','Open account'):t('Начать через Telegram','Get started with Telegram')} <ArrowRight size={16}/></button>
            </div>
          </div>
        </section>

        <nav className="vvd-web-home-shortcuts" aria-label="Полезные разделы VVD CPA">
          <button type="button" onClick={openCatalog}>
            <LayoutGrid size={21} aria-hidden="true"/>
            <span><strong>{t('Каталог сервисов','Service directory')}</strong><small>{t('Инструменты для работы','Tools for publishers')}</small></span>
            <ArrowRight size={17} aria-hidden="true"/>
          </button>
          <button type="button" onClick={()=>openArticles()}>
            <BookOpen size={21} aria-hidden="true"/>
            <span><strong>{t('Статьи и кейсы','Articles & cases')}</strong><small>{t('Обучение и разборы','Guides and insights')}</small></span>
            <ArrowRight size={17} aria-hidden="true"/>
          </button>
        </nav>

        <PublicHomeBanners/>

        <section className="vvd-web-section vvd-web-feature-section" id="features" aria-labelledby="vvd-how-heading">
          <div className="vvd-web-section-heading"><div><span className="vvd-web-eyebrow">{t('КОРОТКО О ПЛАТФОРМЕ','ABOUT THE PLATFORM')}</span><h2 id="vvd-how-heading">{t('Как работает VVD CPA','How VVD CPA works')}</h2><p>{t('Три шага: выбрать подходящее предложение, ознакомиться с условиями и отслеживать результат в кабинете.','Three steps: choose an offer, review its conditions, and track results in your account.')}</p></div></div>
          <div className="vvd-web-steps">
            <article><span>01</span><div><h3>{t('Выбери смартлинк','Choose a smartlink')}</h3><p>{t('Подбери вертикаль и изучи условия оффера и источники трафика.','Pick a vertical and review the offer rules and traffic sources.')}</p></div></article>
            <article><span>02</span><div><h3>{t('Направляй трафик','Send traffic')}</h3><p>{t('Привлекай подходящую аудиторию по партнёрской ссылке.','Direct relevant audiences through your affiliate link.')}</p></div></article>
            <article><span>03</span><div><h3>{t('Отслеживай доход','Track results')}</h3><p>{t('Смотри конверсии, начисления и выплаты в кабинете.','Check conversions, earnings and payouts in your account.')}</p></div></article>
          </div>
        </section>

        {/* Two published UBT guides, intentionally curated for first-time visitors. */}
        <section className="vvd-web-featured-articles" aria-labelledby="vvd-featured-ubt-heading">
          <div className="vvd-web-featured-heading">
            <span className="vvd-web-eyebrow">{t('ПОЛЕЗНО ВЕБМАСТЕРАМ','FOR PUBLISHERS')}</span>
            <h2 id="vvd-featured-ubt-heading">{t('С чего начать с УБТ','Getting started with organic traffic')}</h2>
            <p>{t('Два практических материала об органическом привлечении аудитории.','Two practical guides to reaching audiences organically.')}</p>
          </div>
          <div className="vvd-web-featured-grid">
            <a href={articleUrl('ubt-organicheskiy-trafik-polnoe-rukovodstvo')} className="vvd-web-featured-card"
              onClick={event=>{event.preventDefault();openArticles('ubt-organicheskiy-trafik-polnoe-rukovodstvo');}}>
              <img src={BASE_URL+'articles/ubt-organic-traffic-guide.svg'} alt="Обложка статьи об УБТ-трафике" loading="lazy" decoding="async"/>
              <span className="vvd-web-featured-body">
                <span className="vvd-web-featured-tag">{t('УБТ · Основы','ORGANIC · BASICS')}</span>
                <strong>{t('УБТ-трафик: как привлекать аудиторию без рекламного бюджета','Organic traffic: reaching audiences without an ad budget')}</strong>
                <span className="vvd-web-featured-description">{t('Где находить органическую аудиторию и как выстроить полезный контент.','Where to find organic audiences and how to plan useful content.')}</span>
                <span className="vvd-web-featured-action">{t('Читать статью','Read article')} <ArrowRight size={16} aria-hidden="true"/></span>
              </span>
            </a>
            <a href={articleUrl('short-video-organic')} className="vvd-web-featured-card"
              onClick={event=>{event.preventDefault();openArticles('short-video-organic');}}>
              <img src={BASE_URL+'articles/library-2026/short-video-organic.svg'} alt="Обложка статьи про YouTube Shorts" loading="lazy" decoding="async"/>
              <span className="vvd-web-featured-body">
                <span className="vvd-web-featured-tag">{t('УБТ · Короткие видео','ORGANIC · SHORT VIDEOS')}</span>
                <strong>{t('УБТ через YouTube Shorts: как создавать полезные короткие видео','Organic traffic with YouTube Shorts: creating useful short videos')}</strong>
                <span className="vvd-web-featured-description">{t('Темы, структура роликов и способы оценивать органический интерес.','Topics, video structure and ways to evaluate organic interest.')}</span>
                <span className="vvd-web-featured-action">{t('Читать статью','Read article')} <ArrowRight size={16} aria-hidden="true"/></span>
              </span>
            </a>
          </div>
        </section>

        {/* Editorial information blocks follow the explanation, before the final signup CTA. */}
        <PublicHomeInfo/>
        <PublicWhyVvd/>

        <section className="vvd-web-cta">
          <div><span className="vvd-web-eyebrow">{t('ОДИН АККАУНТ · ДВА СПОСОБА ВХОДА','ONE ACCOUNT · TWO WAYS TO ACCESS')}</span><h2>{t('Начни работу с VVD CPA','Get started with VVD CPA')}</h2><p>{t('Войди через Telegram, чтобы открыть партнёрский кабинет прямо в браузере. Те же разделы доступны и в Mini App.','Sign in with Telegram to access your affiliate dashboard in the browser. The same sections are available in the Mini App.')}</p></div>
          <div className="vvd-web-cta-actions">
            <button type="button" className="vvd-web-gold-button" onClick={()=>auth.isLoggedIn?openAccount():auth.setLoginOpen(true)}>{auth.isLoggedIn?t('Перейти в кабинет','Go to account'):t('Войти / Зарегистрироваться','Sign in / Register')} <ArrowRight size={17}/></button>
            <a className="vvd-web-outline-button" href={BOT_URL} target="_blank" rel="noopener noreferrer">Telegram Mini App <ArrowUpRight size={17}/></a>
          </div>
        </section>
      </main>}
      <footer className="vvd-web-footer">
        <div className="vvd-web-footer-brand"><div className="vvd-web-monogram">V</div><div><b>VVD CPA</b><small>{t('ПЛАТФОРМА ДЛЯ ВЕБМАСТЕРОВ','PLATFORM FOR PUBLISHERS')}</small></div></div>
        <div className="vvd-web-footer-legal">
           <nav aria-label="Правовая информация">
             <a href={policyUrl('privacy')} onClick={event=>{event.preventDefault();openPolicy('privacy');}}>{t('Политика конфиденциальности','Privacy policy')}</a>
             <a href={policyUrl('cookies')} onClick={event=>{event.preventDefault();openPolicy('cookies');}}>{t('Политика файлов cookie','Cookie policy')}</a>
           </nav>
           <p>© {new Date().getFullYear()} VVD CPA. {t('Условия сторонних сервисов действуют на их сайтах. Некоторые ссылки могут быть партнёрскими.','Third-party services have their own terms. Some links may be affiliate links.')}</p>
         </div>
        <a href={BOT_URL} target="_blank" rel="noopener noreferrer">{t('Наш Telegram','Our Telegram')} <ArrowUpRight size={14}/></a>
      </footer>
    </div>
    {auth.loginOpen&&<TelegramBrowserLogin
      onClose={()=>auth.setLoginOpen(false)}
      onLogin={session=>{auth.login(session);if(!articlesView)onOpenApp();}}
    />}
  </div>;
};
