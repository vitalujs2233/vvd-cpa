import React, { useEffect, useMemo, useState } from 'react';
import { Link, useNavigate, useParams } from 'react-router-dom';
import { ArrowLeft, Check, ChevronRight, Copy, ExternalLink, Gift, Search, Layers } from 'lucide-react';
import { triggerHaptic } from '@/shared/lib/telegram';
import { directoryApi, directoryIcons, type DirectoryData, type DirectoryCategory, type DirectoryService } from './serviceDirectoryApi';
import './ServiceDirectory.css';

const initial: DirectoryData = { version:0, categories:[], services:[] };

const useDirectory = () => {
  const [data,setData] = useState<DirectoryData>(initial);
  const [loading,setLoading] = useState(true);
  const [error,setError] = useState('');
  useEffect(()=>{
    let live=true;
    directoryApi.published().then(value=>{if(live){setData(value);setError('');}})
      .catch(()=>{if(live)setError('Не удалось загрузить каталог. Попробуйте открыть страницу ещё раз.');})
      .finally(()=>{if(live)setLoading(false);});
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
  <main className="flex flex-col gap-4 p-4 pb-28 animate-fade-in">{children}</main>;

const CategoryTile:React.FC<{category:DirectoryCategory;count:number;featured?:boolean}> = ({category,count,featured}) => {
  const Icon=directoryIcons[category.icon]||Layers;
  return <Link to={'/tools/directory/'+category.id} className={'vvd-directory-category block p-4 transition-colors '+(featured?'col-span-2':'')}>
    <div className={'flex '+(featured?'items-center':'items-start')+' gap-3'}>
      <div className="flex h-12 w-12 shrink-0 items-center justify-center rounded-app-xs border border-accentGold/35 bg-accentGold/10 text-accentBrightGold">
        <Icon size={23} strokeWidth={1.8}/>
      </div>
      <div className={'min-w-0 flex-1 '+(featured?'':'pt-1')}>
        <h2 className="text-[14px] font-bold text-white leading-5">{category.name}</h2>
        <p className="mt-1 text-[11px] leading-4 text-textSecondary">{category.description}</p>
        <p className="mt-2 text-[10px] font-semibold text-accentBrightGold">{count ? count+' предложений' : 'Скоро предложения'}</p>
      </div>
      <ChevronRight size={18} className="mt-1 shrink-0 text-textSecondary"/>
    </div>
  </Link>;
};

export const ServiceDirectoryPage:React.FC=()=>{
  const {data,loading,error}=useDirectory();
  const [query,setQuery]=useState('');
  const matching=useMemo(()=>{
    const term=query.trim().toLowerCase();
    if(!term)return data.categories;
    return data.categories.filter(c=>
      (c.name+' '+c.description).toLowerCase().includes(term) ||
      data.services.some(s=>s.category_id===c.id&&(s.name+' '+s.description).toLowerCase().includes(term))
    );
  },[data,query]);
  return <DirectoryShell>
    <BackTitle title="Каталог сервисов" subtitle="Полезные инструменты и предложения для вебмастеров — в одном месте"/>
    <label className="flex items-center gap-3 rounded-card border border-accentGold/30 bg-bgCard/90 px-4 py-3 shadow-premium">
      <Search size={19} className="shrink-0 text-accentBrightGold"/>
      <input type="search" value={query} onChange={e=>setQuery(e.target.value)} placeholder="Поиск категорий и сервисов..." className="w-full min-w-0 bg-transparent text-sm text-white placeholder:text-textSecondary outline-none" aria-label="Поиск по каталогу"/>
    </label>
    <div className="flex items-center justify-between gap-2">
      <span className="text-sm font-bold text-white">Разделы каталога</span>
      <span className="text-xs text-textSecondary">{matching.length} категорий</span>
    </div>
    {error&&<p role="alert" className="rounded-card border border-red-400/30 bg-red-400/5 p-3 text-xs text-textSecondary">{error}</p>}
    {loading?<p className="text-xs text-textSecondary">Загружаем категории…</p>:
      matching.length===0?
        <div className="vvd-directory-category p-6 text-center text-sm text-textSecondary">По запросу ничего не найдено.</div>:
        <div className="grid grid-cols-2 gap-3">
          {matching.map((category,i)=> <CategoryTile key={category.id} category={category} count={data.services.filter(s=>s.category_id===category.id).length} featured={i===0}/>)}
        </div>
    }
    <p className="text-[11px] leading-5 text-textSecondary">Внутри каждой категории собраны только подходящие сервисы. Ссылки могут быть партнёрскими; условия скидок устанавливают сами сервисы.</p>
  </DirectoryShell>;
};

const ServiceCard:React.FC<{service:DirectoryService}>=({service})=>{
  const [copied,setCopied]=useState(false);
  const benefits=service.benefits.split(/\n+/).map(v=>v.trim()).filter(Boolean);
  return <article className="vvd-directory-service flex flex-col gap-4 p-4">
    <div className="flex items-start gap-3">
      <div className="flex h-[76px] w-[76px] shrink-0 items-center justify-center overflow-hidden rounded-card border border-accentGold/25 bg-accentGold/10">
        {service.image_url ? <img src={service.image_url} loading="lazy" alt={service.name} className="h-full w-full object-contain p-1"/> :
          <Layers size={30} className="text-accentBrightGold"/>}
      </div>
      <div className="min-w-0 flex-1">
        <h2 className="text-base font-bold text-white">{service.name}</h2>
        <p className="mt-1 text-xs leading-5 text-textSecondary whitespace-pre-wrap">{service.description}</p>
      </div>
    </div>
    {benefits.length>0&&<div className="flex flex-col gap-2 border-t border-white/[0.06] pt-3">
      <b className="text-xs text-white">Преимущества</b>
      {benefits.map((v,i)=><p key={i} className="flex gap-2 text-xs leading-5 text-textSecondary"><Check size={14} className="mt-0.5 shrink-0 text-accentBrightGold"/><span>{v}</span></p>)}
    </div>}
    {(service.discount_text||service.promo_code)&&<div className="flex flex-wrap items-center gap-2 rounded-card border border-accentGold/20 bg-accentGold/[0.06] p-3">
      <Gift size={17} className="text-accentBrightGold"/>
      {service.discount_text&&<span className="flex-1 text-xs font-semibold text-accentBrightGold">{service.discount_text}</span>}
      {service.promo_code&&<button type="button" onClick={async()=>{
        try {await navigator.clipboard.writeText(service.promo_code);setCopied(true);}
        catch {setCopied(false);}
      }} className="flex items-center gap-1 rounded-app-xs border border-accentGold/35 px-2 py-1.5 text-xs font-bold text-accentBrightGold" title="Скопировать промокод">
        {copied?<Check size={13}/>:<Copy size={13}/>} {service.promo_code}
      </button>}
    </div>}
    <a href={service.website_url} target="_blank" rel={service.partner_link?'noopener noreferrer sponsored nofollow':'noopener noreferrer'} className="flex min-h-11 items-center justify-center gap-2 rounded-app-xs bg-gold-gradient px-4 py-3 text-sm font-bold text-bgMain">
      Перейти на сайт <ExternalLink size={16}/>
    </a>
    <p className="text-[10px] leading-4 text-textSecondary">{service.partner_link?'Партнёрская ссылка. ':''}Переход на сторонний сайт; его условия и цены действуют отдельно от VVD CPA.</p>
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
  return <DirectoryShell>
    <BackTitle title={category?.name||'Категория каталога'} subtitle={category?.description||'Каталог полезных сервисов VVD CPA'}/>
    {category&&<div className="vvd-directory-feature p-4">
      <div className="relative z-10 flex items-center gap-3">
        <div className="flex h-12 w-12 shrink-0 items-center justify-center rounded-app-xs border border-accentGold/40 bg-accentGold/15 text-accentBrightGold"><Icon size={24}/></div>
        <div className="min-w-0"><p className="text-xs text-textSecondary">Сервисы категории</p><b className="text-lg text-white">{category.name}</b></div>
        <span className="ml-auto vvd-directory-label">{data.services.filter(s=>s.category_id===categoryId).length}</span>
      </div>
    </div>}
    <label className="flex items-center gap-3 rounded-card border border-accentGold/25 bg-bgCard/90 px-4 py-3">
      <Search size={18} className="text-accentBrightGold"/>
      <input type="search" placeholder="Найти сервис..." value={query} onChange={e=>setQuery(e.target.value)} className="min-w-0 flex-1 bg-transparent text-sm text-white outline-none placeholder:text-textSecondary" aria-label="Найти сервис"/>
    </label>
    {error&&<p role="alert" className="text-xs text-textSecondary">{error}</p>}
    {loading?<p className="text-xs text-textSecondary">Загружаем предложения…</p>:
      !category?<div className="vvd-directory-category p-5 text-xs text-textSecondary">Категория не найдена или скрыта администратором.</div>:
      services.length?services.map(s=><ServiceCard key={s.id} service={s}/>):
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
