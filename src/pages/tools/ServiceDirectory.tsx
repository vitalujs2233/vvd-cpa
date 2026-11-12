import React, { useEffect, useMemo, useState } from 'react';
import { Link, useNavigate, useParams } from 'react-router-dom';
import { ArrowLeft, Check, ChevronRight, Copy, ExternalLink, Gift, Search, Layers } from 'lucide-react';
import { triggerHaptic } from '@/shared/lib/telegram';
import { directoryApi, directoryIcons, type DirectoryData, type DirectoryCategory, type DirectoryService } from './serviceDirectoryApi';
import './ServiceDirectory.css';
import { UnifiedCategoryCard,serviceCountLabel } from '@/shared/ui/UnifiedCategoryCard';

const initial: DirectoryData = { version:0, categories:[], services:[] };

const useDirectory = () => {
  // A days-old persisted catalog can omit newly published services. Avoid
  // showing an empty category that suddenly fills when the API responds.
  const [data,setData] = useState<DirectoryData>(()=>directoryApi.recentSnapshot()??initial);
  const [loading,setLoading] = useState(()=>!directoryApi.recentSnapshot());
  const [error,setError] = useState('');
  useEffect(()=>{
    let live=true;
    const recent=directoryApi.recentSnapshot();
    if(recent){setData(recent);setLoading(false);}
    void directoryApi.published(true).then(value=>{
      if(live){setData(value);setError('');setLoading(false);}
    }).catch(()=>{
      if(!live)return;
      const fallback=directoryApi.snapshot();
      if(fallback){
        setData(fallback);
        setError('Не удалось обновить каталог. Показана сохранённая версия.');
      }else setError('Не удалось загрузить каталог. Проверьте соединение.');
      setLoading(false);
    });
    return()=>{live=false;};
  },[]);
  return {data,loading,error};
};

const BackTitle:React.FC<{title:string;subtitle?:string}> = ({title,subtitle}) => {
  const navigate=useNavigate();
  return <div className="flex items-start gap-3">
    <button type="button" aria-label="Назад" onClick={()=>{triggerHaptic.lightImpact();navigate(-1);}} className="mt-0.5 flex h-10 w-10 shrink-0 items-center justify-center rounded-full border border-white/15 bg-bgCard/80 text-accentBrightGold">
      <ArrowLeft size={19}/>
    </button>
    <div className="min-w-0"><h1 className="text-xl font-bold text-white">{title}</h1>{subtitle&&<p className="mt-1 text-xs leading-5 text-textSecondary">{subtitle}</p>}</div>
  </div>;
};

const DirectoryShell:React.FC<{children:React.ReactNode}> = ({children}) =>
  <main className="flex flex-col gap-4 p-4 pb-28">{children}</main>;

// Shorten only the original catalog copy; preserve descriptions edited by the owner.
const conciseDescription = (description:string) => ({
  'Библиотеки рекламы и анализ креативов':'Поиск и анализ рекламы',
  'Инструменты для работы с браузерными профилями':'Управление профилями',
  'Площадки и источники трафика':'Источники трафика',
  'Аналитика рекламных кампаний':'Учёт трафика и конверсий',
  'Конструкторы, домены и размещение сайтов':'Домены и размещение сайтов',
  'Прокси и сетевые инструменты':'Прокси и работа с сетью',
  'Поставщики виртуальных номеров':'Номера для приёма SMS',
  'Дополнительные решения для вебмастеров':'Другие инструменты для работы',
}[description] || description);

const CategoryTile:React.FC<{category:DirectoryCategory;count:number}> = ({category,count}) => (
  <UnifiedCategoryCard to={'/tools/directory/'+category.id} icon={directoryIcons[category.icon]||Layers}
    title={category.name} description={conciseDescription(category.description)}
    status={count ? serviceCountLabel(count) : 'Сервисы скоро появятся'}/>
);

export const ServiceDirectoryPage:React.FC=()=>{
  const {data,loading,error}=useDirectory();
  const [query,setQuery]=useState('');
  const matching=useMemo(()=>{
    const term=query.trim().toLowerCase();
    if(!term)return data.categories;
    return data.categories.filter(c=>
      (c.name+' '+c.description+' '+conciseDescription(c.description)).toLowerCase().includes(term) ||
      data.services.some(s=>s.category_id===c.id&&(s.name+' '+s.description).toLowerCase().includes(term))
    );
  },[data,query]);
  if(loading)return <DirectoryShell>
    <div className="vvd-directory-category flex min-h-[360px] flex-col items-center justify-center gap-3 p-6 text-center" aria-busy="true">
      <Layers size={31} className="text-accentBrightGold"/>
      <strong className="text-base text-white">Открываем каталог сервисов</strong>
      <p className="text-xs text-textSecondary">Подготавливаем разделы каталога…</p>
    </div>
  </DirectoryShell>;
  return <DirectoryShell>
    <BackTitle title="Каталог сервисов" subtitle="Сервисы для рекламы и работы с трафиком"/>
    <label className="flex items-center gap-3 rounded-card border border-accentGold/30 bg-bgCard/90 px-4 py-3 shadow-premium">
      <Search size={19} className="shrink-0 text-accentBrightGold"/>
      <input type="search" value={query} onChange={e=>setQuery(e.target.value)} placeholder="Найти сервис или категорию" className="w-full min-w-0 bg-transparent text-sm text-white placeholder:text-textSecondary outline-none" aria-label="Поиск по каталогу"/>
    </label>
    <div className="flex items-center justify-between gap-2">
      <span className="text-sm font-bold text-white">Разделы каталога</span>
      <span className="text-xs text-textSecondary">Категорий: {matching.length}</span>
    </div>
    {error&&<p role="alert" className="rounded-card border border-red-400/30 bg-red-400/5 p-3 text-xs text-textSecondary">{error}</p>}
    {matching.length===0?
        <div className="vvd-directory-category p-6 text-center text-sm text-textSecondary">По запросу ничего не найдено.</div>:
        <div className="vvd-mini-directory-category-grid">
          {matching.map(category=> <CategoryTile key={category.id} category={category} count={data.services.filter(s=>s.category_id===category.id).length}/>)}
        </div>
    }
    <p className="text-[11px] leading-5 text-textSecondary">Ссылки могут быть партнёрскими. Условия и скидки — на сайтах сервисов.</p>
  </DirectoryShell>;
};

const ServiceCard:React.FC<{service:DirectoryService;priority?:boolean}>=({service,priority=false})=>{
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
  const benefits=service.benefits.split(/\n+/).map(v=>v.trim()).filter(Boolean);
  const ServiceIcon=directoryIcons[service.icon]||Layers;
  return <article className="vvd-directory-service vvd-directory-service-card">
    <div className={'vvd-directory-service-banner'+(service.image_url?' has-image':'')}>
      {service.image_url
        ?<img src={service.image_url} loading={priority?'eager':'lazy'} fetchPriority={priority?'high':'auto'} decoding="async" alt={service.name+' — логотип'}/>
        :<ServiceIcon size={46} strokeWidth={1.5} className="text-accentBrightGold" aria-hidden="true"/>}
    </div>
    <div className="vvd-directory-service-content">
      <div className="vvd-directory-service-copy">
        <h2 className="text-lg font-bold text-white">{service.name}</h2>
        <p className="mt-2 text-sm leading-6 text-textSecondary whitespace-pre-wrap">{service.description}</p>
      </div>
      {benefits.length>0&&<div className="flex flex-col gap-2 border-t border-white/[0.06] pt-3">
        <b className="text-xs text-white">Преимущества</b>
        {benefits.map((v,i)=><p key={i} className="flex gap-2 text-xs leading-5 text-textSecondary"><Check size={14} className="mt-0.5 shrink-0 text-accentBrightGold"/><span>{v}</span></p>)}
      </div>}
      {(service.discount_text||service.promo_code)&&<div className="vvd-directory-service-deal">
        {service.discount_text&&<span className="text-xs font-semibold text-accentBrightGold">{service.discount_text}</span>}
        {service.promo_code&&<button type="button" onClick={()=>void copyPromo()}
          className="vvd-directory-service-promo" title="Скопировать промокод"
          aria-label={'Скопировать промокод '+service.promo_code}>
          <span>Промокод: <b>{service.promo_code}</b></span>
          {copyStatus==='copied'?<Check size={18} aria-hidden="true"/>:<Copy size={18} aria-hidden="true"/>}
        </button>}
        {copyStatus!=='idle'&&<span className="vvd-directory-service-copy-status" role="status">{copyStatus==='copied'?'Скопировано':'Не удалось скопировать'}</span>}
      </div>}
      {service.website_url&&<>
        <a href={service.website_url} target="_blank" rel={service.partner_link?'noopener noreferrer sponsored nofollow':'noopener noreferrer'} className="flex min-h-11 items-center justify-center gap-2 rounded-app-xs bg-gold-gradient px-4 py-3 text-sm font-bold text-bgMain">
          Перейти на сайт <ExternalLink size={16}/>
        </a>
        <p className="text-[10px] leading-4 text-textSecondary">{service.partner_link?'Партнёрская ссылка. ':''}Переход на сторонний сайт; его условия и цены действуют отдельно от VVD CPA.</p>
      </>}
    </div>
  </article>;
};

export const ServiceCategoryPage:React.FC=()=>{
  const {categoryId}=useParams<{categoryId:string}>();
  const {data,loading,error}=useDirectory();
  const [query,setQuery]=useState('');
  const category=data.categories.find(c=>c.id===categoryId);
  const services=data.services.filter(s=>s.category_id===categoryId &&
    (s.name+' '+s.description+' '+s.benefits).toLowerCase().includes(query.trim().toLowerCase()));
  const Icon=category ? directoryIcons[category.icon]||Layers : Layers;
  if(loading)return <DirectoryShell>
    <BackTitle title="Каталог сервисов" subtitle="Загружаем выбранный раздел"/>
    <div className="vvd-directory-section-meta"><span>Загрузка сервисов…</span></div>
    <div className="vvd-directory-category h-12 animate-pulse" aria-hidden="true"/>
    <div className="vvd-directory-service vvd-directory-loading-card" aria-busy="true" aria-label="Загрузка категории и сервисов">
      <div className="vvd-directory-loading-banner"/>
      <div className="vvd-directory-loading-lines"><span/><span/><span/></div>
    </div>
  </DirectoryShell>;
  return <DirectoryShell>
    <BackTitle title={category?.name||'Категория каталога'} subtitle={category?conciseDescription(category.description):'Каталог сервисов VVD CPA'}/>
    {category&&<div className="vvd-directory-section-meta">
      <span>Сервисов в разделе: {data.services.filter(s=>s.category_id===categoryId).length}</span>
    </div>}
    <label className="flex items-center gap-3 rounded-card border border-accentGold/25 bg-bgCard/90 px-4 py-3">
      <Search size={18} className="text-accentBrightGold"/>
      <input type="search" placeholder="Найти сервис..." value={query} onChange={e=>setQuery(e.target.value)} className="min-w-0 flex-1 bg-transparent text-sm text-white outline-none placeholder:text-textSecondary" aria-label="Найти сервис"/>
    </label>
    {error&&<p role="alert" className="text-xs text-textSecondary">{error}</p>}
    {!category?<div className="vvd-directory-category p-5 text-xs text-textSecondary">Категория не найдена или скрыта администратором.</div>:
      services.length?services.map((s,index)=><ServiceCard key={s.id} service={s} priority={index===0}/>):
      <div className="vvd-directory-service p-5">
        {query?<p className="text-sm text-textSecondary">По вашему запросу сервисов не найдено.</p>:<>
          <span className="vvd-directory-label">Демонстрация оформления</span>
          <div className="mt-4 flex items-center gap-3">
            <div className="flex h-16 w-16 items-center justify-center rounded-card border border-accentGold/30 bg-accentGold/10"><Icon size={27} className="text-accentBrightGold"/></div>
            <div><b className="text-sm text-white">Здесь появятся предложения</b><p className="mt-1 text-xs leading-5 text-textSecondary">Логотип сервиса, описание, преимущества и подтверждённые скидки.</p></div>
          </div>
          <div className="mt-4 rounded-app-xs border border-accentGold/20 bg-accentGold/[0.04] px-3 py-3 text-center text-xs text-textSecondary">Добавьте первый сервис через админ-панель → Каталог сервисов</div>
        </>}
      </div>
    }
  </DirectoryShell>;
};
