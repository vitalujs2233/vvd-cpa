import React,{useEffect,useMemo,useState} from 'react';
import {ArrowLeft,ArrowRight,BookOpen,CalendarDays,Search,Tag} from 'lucide-react';
import {editorialApi,type Article,type ArticleSummary,type PublicArticles} from './editorialApi';
import {API_BASE_URL} from '@/shared/lib/api';

const safeImage=(value:string)=>value.startsWith(API_BASE_URL+'/articles/images/')||/^https:\/\/[^\s]+$/i.test(value);
const formatDate=(date:string)=>date?new Date(date).toLocaleDateString('ru-RU',{day:'numeric',month:'long',year:'numeric'}):'';
type Props={slug:string;onArticle:(slug:string)=>void;onBack:()=>void;onMetadata:(title:string,description:string,cover?:string,date?:string)=>void};
export const PublicEditorial:React.FC<Props>=({slug,onArticle,onBack,onMetadata})=>{
  const [data,setData]=useState<PublicArticles>({categories:[],articles:[]});
  const [item,setItem]=useState<Article|null>(null);
  const [category,setCategory]=useState('all');
  const [query,setQuery]=useState('');
  const [loading,setLoading]=useState(true);
  const [error,setError]=useState('');
  const [retry,setRetry]=useState(0);
  useEffect(()=>{
    let live=true;setLoading(true);setError('');
    if(slug){
      editorialApi.detail(slug).then(v=>{if(live){setItem(v.article);onMetadata(v.article.seo_title||v.article.title,v.article.seo_description||v.article.excerpt,v.article.cover_url,v.article.published_at);}})
      .catch(()=>{if(live)setError('Статья не найдена или временно недоступна.');}).finally(()=>{if(live)setLoading(false);});
    }else{
      setItem(null);
      onMetadata('Статьи и кейсы — VVD CPA','Статьи, кейсы, обучение и полезные материалы для вебмастеров и арбитражников.');
      editorialApi.list().then(v=>{if(live)setData(v);}).catch(()=>{if(live)setError('Не удалось загрузить статьи.');})
      .finally(()=>{if(live)setLoading(false);});
    }
    return()=>{live=false};
  },[slug,retry,onMetadata]);
  const results=useMemo(()=>data.articles.filter(a=>(category==='all'||a.category_id===category)&&
    [a.title,a.excerpt,...a.tags].join(' ').toLocaleLowerCase('ru').includes(query.toLocaleLowerCase('ru').trim())),[data,category,query]);
  const categories=new Map(data.categories.map(c=>[c.id,c.name]));
  return <main className="vvd-web-articles">
    {slug?<button className="vvd-web-back" onClick={onBack}><ArrowLeft size={18}/> Все статьи и кейсы</button>:null}
    {loading?<div className="vvd-web-notice">Загружаем материалы…</div>:error?<div className="vvd-web-notice" role="alert">{error} <button className="vvd-web-outline-button" onClick={()=>setRetry(v=>v+1)}>Повторить</button></div>:
      slug&&item?<article className="vvd-article-detail">
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
      </article>:
      !slug?<section>
        <span className="vvd-web-eyebrow">БАЗА ЗНАНИЙ VVD CPA</span>
        <h1 className="vvd-articles-title">Статьи и кейсы</h1>
        <p className="vvd-articles-subtitle">Кейсы, разборы, обучение и инструменты для работы с трафиком.</p>
        <label className="vvd-web-search"><Search size={20}/><input type="search" value={query} onChange={e=>setQuery(e.target.value)} placeholder="Поиск по статьям и тегам…"/></label>
        <div className="vvd-article-filters">
          <button type="button" className={category==='all'?'selected':''} onClick={()=>setCategory('all')}>Все</button>
          {data.categories.map(c=><button type="button" key={c.id} className={category===c.id?'selected':''} onClick={()=>setCategory(c.id)}>{c.name}</button>)}
        </div>
        {results.length?<div className="vvd-article-grid">{results.map(a=><ArticleCard key={a.slug} article={a} categoryName={categories.get(a.category_id)||''} onClick={()=>onArticle(a.slug)}/>)}</div>:
        <div className="vvd-web-notice">{data.articles.length?'По этому запросу публикаций нет.':'Здесь появятся первые статьи и кейсы VVD CPA.'}</div>}
      </section>:<div className="vvd-web-notice">Материал не найден.</div>
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
