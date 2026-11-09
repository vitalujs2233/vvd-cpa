import React,{useEffect,useMemo,useState} from 'react';
import {ArrowLeft,ArrowRight,BookOpen,CalendarDays,Search,Tag} from 'lucide-react';
import {editorialApi,type Article,type ArticleSummary,type PublicArticles} from './editorialApi';
import {API_BASE_URL} from '@/shared/lib/api';

const safeImage=(value:string)=>value.startsWith(API_BASE_URL+'/articles/images/')||/^https:\/\/[^\s]+$/i.test(value);
const formatDate=(date:string)=>date?new Date(date).toLocaleDateString('ru-RU',{day:'numeric',month:'long',year:'numeric'}):'';
// Keep the last successful response available when navigating back from an article.
const ARTICLE_CACHE_KEY='vvd_public_articles_v1';
const CACHE_TTL=5*60*1000;
let articleCache:{data:PublicArticles;at:number}|null=null;
const readCachedArticles=():PublicArticles|null=>{
  if(articleCache && Date.now()-articleCache.at<CACHE_TTL)return articleCache.data;
  try{
    const raw=sessionStorage.getItem(ARTICLE_CACHE_KEY);
    if(!raw)return null;
    const saved=JSON.parse(raw) as {data:PublicArticles;at:number};
    if(Number.isFinite(saved.at) && Date.now()-saved.at<CACHE_TTL &&
       Array.isArray(saved.data?.categories) && Array.isArray(saved.data?.articles)){
      articleCache=saved;return saved.data;
    }
  }catch{/* Browsers may disable session storage. */}
  return null;
};
const rememberArticles=(data:PublicArticles)=>{
  articleCache={data,at:Date.now()};
  try{sessionStorage.setItem(ARTICLE_CACHE_KEY,JSON.stringify(articleCache));}catch{/* Optional cache. */}
};
const detailMemory=new Map<string,Article>();
type Props={slug:string;onArticle:(slug:string)=>void;onBack:()=>void;onMetadata:(title:string,description:string,cover?:string,date?:string)=>void};
export const PublicEditorial:React.FC<Props>=({slug,onArticle,onBack,onMetadata})=>{
  const [data,setData]=useState<PublicArticles>(()=>readCachedArticles()||{categories:[],articles:[]});
  const [item,setItem]=useState<Article|null>(()=>detailMemory.get(slug)||null);
  const [category,setCategory]=useState('all');
  const [query,setQuery]=useState('');
  const [loading,setLoading]=useState(()=>slug?!detailMemory.has(slug):!readCachedArticles());
  const [error,setError]=useState('');
  const [retry,setRetry]=useState(0);
  useEffect(()=>{
    let mounted=true;
    let liveAnswered=false;
    setError('');
    if(slug){
      const cached=detailMemory.get(slug);
      setItem(cached||null);
      setLoading(!cached);
      // Static first, then refresh from the backend when available.
      void editorialApi.snapshot().then(v=>{
        if(!mounted||liveAnswered)return;
        const article=v.details[slug];
        if(article){
          detailMemory.set(slug,article);setItem(article);setLoading(false);
          onMetadata(article.seo_title||article.title,article.seo_description||article.excerpt,article.cover_url,article.published_at);
        }
      }).catch(()=>{});
      void editorialApi.detail(slug).then(v=>{
        if(!mounted)return;
        liveAnswered=true;
        detailMemory.set(slug,v.article);setItem(v.article);setError('');setLoading(false);
        onMetadata(v.article.seo_title||v.article.title,v.article.seo_description||v.article.excerpt,v.article.cover_url,v.article.published_at);
      }).catch(()=>{
        if(mounted&&!detailMemory.has(slug)){setError('Статья не найдена или временно недоступна.');setLoading(false);}
      });
    }else{
      setItem(null);
      onMetadata('Статьи и кейсы — VVD CPA','Статьи, кейсы, обучение и полезные материалы для вебмастеров и арбитражников.');
      const cached=readCachedArticles();
      if(cached)setData(cached);
      setLoading(!cached);
      void editorialApi.snapshot().then(v=>{
        if(!mounted||liveAnswered)return;
        const feed={categories:v.categories,articles:v.articles};
        rememberArticles(feed);setData(feed);setLoading(false);
      }).catch(()=>{});
      void editorialApi.list().then(v=>{
        if(!mounted)return;
        liveAnswered=true;rememberArticles(v);setData(v);setError('');setLoading(false);
      }).catch(()=>{
        if(mounted&&!readCachedArticles()){setError('Не удалось загрузить статьи.');setLoading(false);}
      });
    }
    return()=>{mounted=false};
  },[slug,retry,onMetadata]);
  const results=useMemo(()=>data.articles.filter(a=>(category==='all'||a.category_id===category)&&
    [a.title,a.excerpt,...a.tags].join(' ').toLocaleLowerCase('ru').includes(query.toLocaleLowerCase('ru').trim())),[data,category,query]);
  const categories=new Map(data.categories.map(c=>[c.id,c.name]));
  return <main className="vvd-web-articles">
    {slug?<button className="vvd-web-back" onClick={onBack}><ArrowLeft size={18}/> Все статьи и кейсы</button>:null}
    {slug ? (loading && !item ? <div className="vvd-article-detail">
        <span className="vvd-web-eyebrow">VVD CPA / СТАТЬИ И КЕЙСЫ</span>
        <div className="vvd-article-loading-title" aria-hidden="true"/>
        <div className="vvd-article-loading-line" aria-hidden="true"/>
        <div className="vvd-article-loading-cover" aria-hidden="true"/>
      </div> : error ? <div className="vvd-web-notice" role="alert">{error} <button className="vvd-web-outline-button" onClick={()=>setRetry(v=>v+1)}>Повторить</button></div> :
      item?<article className="vvd-article-detail">
        <div className="vvd-web-eyebrow">VVD CPA / СТАТЬИ И КЕЙСЫ</div>
        <h1>{item.title}</h1>
        <p className="vvd-article-lead">{item.excerpt}</p>
        <div className="vvd-article-meta"><CalendarDays size={16}/> {formatDate(item.published_at)} <BookOpen size={16}/> VVD CPA</div>
        {item.cover_url&&safeImage(item.cover_url)&&<img className="vvd-article-cover" src={item.cover_url} alt={item.title}/>}
        <div className="vvd-article-body">
          {item.blocks.map((block,index)=>{
            if(block.type==='heading')return <h2 key={index}>{block.text}</h2>;
            if(block.type==='quote')return <blockquote key={index}>{block.text}</blockquote>;
            if(block.type==='image')return block.url&&safeImage(block.url)?<figure key={index}><img loading="lazy" src={block.url} alt={block.alt||block.text||item.title}/>{block.text&&<figcaption>{block.text}</figcaption>}</figure>:null;
            if(block.type==='link')return block.url?.startsWith('https://')?<p key={index}><a href={block.url} target="_blank" rel="noopener noreferrer sponsored">{block.text||block.url} <ArrowRight size={15}/></a></p>:null;
            return <p key={index}>{block.text}</p>;
          })}
        </div>
        <div className="vvd-article-tags">{item.tags.map(tag=><span key={tag}><Tag size={13}/> {tag}</span>)}</div>
        <button className="vvd-web-outline-button" onClick={onBack}><ArrowLeft size={16}/> К списку статей</button>
      </article>:<div className="vvd-web-notice">Материал не найден.</div>) :
      <section>
        <span className="vvd-web-eyebrow">БАЗА ЗНАНИЙ VVD CPA</span>
        <h1 className="vvd-articles-title">Статьи и кейсы</h1>
        <p className="vvd-articles-subtitle">Кейсы, разборы, обучение и инструменты для работы с трафиком.</p>
        <label className="vvd-web-search"><Search size={20}/><input type="search" value={query} onChange={e=>setQuery(e.target.value)} placeholder="Поиск по статьям и тегам…"/></label>
        <div className="vvd-article-filters">
          <button type="button" className={category==='all'?'selected':''} onClick={()=>setCategory('all')}>Все</button>
          {data.categories.map(c=><button type="button" key={c.id} className={category===c.id?'selected':''} onClick={()=>setCategory(c.id)}>{c.name}</button>)}
        </div>
        {error?<div className="vvd-web-notice" role="alert">{error} <button type="button" className="vvd-web-outline-button" onClick={()=>setRetry(v=>v+1)}>Повторить</button></div>:
        results.length?<div className="vvd-article-grid">{results.map(a=><ArticleCard key={a.slug} article={a} categoryName={categories.get(a.category_id)||''} onClick={()=>onArticle(a.slug)}/>)}</div>:
        loading?<div className="vvd-article-grid" aria-label="Загружаем статьи" aria-busy="true">
          {[0,1,2].map(i=><div className="vvd-article-card vvd-article-loading-card" key={i} aria-hidden="true">
            <div className="vvd-article-loading-image"/><div className="vvd-article-card-copy"><div className="vvd-article-loading-line"/><div className="vvd-article-loading-line short"/></div>
          </div>)}
        </div>:
        <div className="vvd-web-notice">{data.articles.length?'По этому запросу публикаций нет.':'Здесь появятся первые статьи и кейсы VVD CPA.'}</div>}
      </section>
    }
  </main>;
};

const ArticleCard:React.FC<{article:ArticleSummary;categoryName:string;onClick:()=>void}>=({article:a,categoryName,onClick})=>
  <button type="button" className="vvd-article-card" onClick={onClick}>
    {a.cover_url&&safeImage(a.cover_url)?<img src={a.cover_url} alt="" loading="lazy"/>:<div className="vvd-article-placeholder"><BookOpen size={36}/></div>}
    <div className="vvd-article-card-copy">
      <span className="vvd-web-eyebrow">{categoryName}</span>
      <h2>{a.title}</h2>
      <p>{a.excerpt}</p>
      <div className="vvd-article-card-bottom"><small>{formatDate(a.published_at)}</small><span>Читать <ArrowRight size={16}/></span></div>
    </div>
  </button>;
