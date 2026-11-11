import React,{useEffect,useLayoutEffect,useMemo,useRef,useState} from 'react';
import {ArrowLeft,ArrowRight,BookOpen,CalendarDays,Eye,Search,Tag,TrendingUp,Wrench,Link2,Megaphone,BarChart3,Palette,Send,Bot,ClipboardList} from 'lucide-react';
import {editorialApi,bootstrappedEditorial,type Article,type ArticleSummary,type PublicArticles} from './editorialApi';
import {API_BASE_URL} from '@/shared/lib/api';
import {UnifiedCategoryCard} from '@/shared/ui/UnifiedCategoryCard';
import {EditorialContributions} from './EditorialContributions';
import {currentSignedSession} from '@/shared/lib/browserSession';

const safeImage=(value:string)=>value.startsWith(API_BASE_URL+'/articles/images/')||/^https:\/\/[^\s]+$/i.test(value);
const formatDate=(date:string)=>date?new Date(date).toLocaleDateString('ru-RU',{day:'numeric',month:'long',year:'numeric'}):'';
const materialCount=(count:number)=>count+' '+(count%10===1&&count%100!==11?'материал':count%10>=2&&count%10<=4&&(count%100<12||count%100>14)?'материала':'материалов');
const searchWords=(value:string)=>value.toLocaleLowerCase('ru').trim().split(/\s+/).filter(Boolean);
const matchesWords=(words:string[],...fields:string[])=>{
  if(!words.length)return true;
  const text=fields.join(' ').toLocaleLowerCase('ru');
  return words.every(word=>text.includes(word));
};
// Keep the last successful response available when navigating back from an article.
const CACHE_TTL=5*60*1000;
type Surface='web'|'mini';
const categoryIcons:Record<string,React.ElementType>={
  'ubt-traffic':TrendingUp,'services-tools':Wrench,'cpa-partners':Link2,
  'paid-traffic':Megaphone,'seo-traffic':Search,'analytics':BarChart3,
  'creatives-content':Palette,'telegram-traffic':Send,
  'ai-automation':Bot,'cases-reviews':ClipboardList
};
const articleCache=new Map<Surface,{data:PublicArticles;at:number}>();
const readCachedArticles=(surface:Surface):PublicArticles|null=>{
  const recent=articleCache.get(surface);
  if(recent&&Date.now()-recent.at<CACHE_TTL)return recent.data;
  if(surface==='web'){
    const initial=bootstrappedEditorial();
    if(initial?.articles.length||initial?.categories.length)return {articles:initial.articles,categories:initial.categories};
  }
  try{
    const raw=sessionStorage.getItem('vvd_public_articles_'+surface+'_v2');
    if(!raw)return null;
    const saved=JSON.parse(raw) as {data:PublicArticles;at:number};
    if(Number.isFinite(saved.at)&&Date.now()-saved.at<CACHE_TTL&&
      Array.isArray(saved.data?.categories)&&Array.isArray(saved.data?.articles)){
      articleCache.set(surface,saved);return saved.data;
    }
  }catch{/* Optional cache. */}
  return null;
};
const rememberArticles=(surface:Surface,data:PublicArticles)=>{
  const value={data,at:Date.now()};
  articleCache.set(surface,value);
  try{sessionStorage.setItem('vvd_public_articles_'+surface+'_v2',JSON.stringify(value));}catch{}
};
const detailMemory=new Map<string,Article>();
const anonymousViewSession=():string=>{
  const key='vvd_article_view_session_v1';
  try{
    const stored=sessionStorage.getItem(key);
    if(stored&&/^[0-9a-f-]{36}$/i.test(stored))return stored;
    const created=crypto.randomUUID();
    sessionStorage.setItem(key,created);
    return created;
  }catch{
    return crypto.randomUUID();
  }
};
const readCachedDetail=(slug:string,surface:Surface):Article|null=>
  detailMemory.get(surface+':'+slug)||(surface==='web'?bootstrappedEditorial()?.details?.[slug]:null)||null;
type Props={slug:string;surface?:Surface;onArticle:(slug:string)=>void;onBack:()=>void;onMetadata:(title:string,description:string,cover?:string,date?:string)=>void;contributionAuthenticated?:boolean;onContributionLogin?:()=>void};
export const PublicEditorial:React.FC<Props>=({slug,surface='web',onArticle,onBack,onMetadata,contributionAuthenticated,onContributionLogin})=>{
  const articleRoot=useRef<HTMLElement>(null);
  const [data,setData]=useState<PublicArticles>(()=>readCachedArticles(surface)||{categories:[],articles:[]});
  const [item,setItem]=useState<Article|null>(()=>readCachedDetail(slug,surface));
  const [category,setCategory]=useState('all');
  const [query,setQuery]=useState('');
  const [contributionOpen,setContributionOpen]=useState(false);
  const [loading,setLoading]=useState(()=>slug?!readCachedDetail(slug,surface):!readCachedArticles(surface));
  const [error,setError]=useState('');
  const [retry,setRetry]=useState(0);
  const [liveViews,setLiveViews]=useState<Record<string,number>>({});
  useEffect(()=>{
    let mounted=true;
    let liveAnswered=false;
    setError('');
    if(slug){
      const cached=readCachedDetail(slug,surface);
      setItem(cached||null);
      setLoading(!cached);
      if(cached)onMetadata(cached.seo_title||cached.title,cached.seo_description||cached.excerpt,cached.cover_url,cached.published_at);
      // Static first, then refresh from the backend when available.
      if(surface==='web'&&!bootstrappedEditorial())void editorialApi.snapshot().then(v=>{
        if(!mounted||liveAnswered)return;
        const article=v.details[slug];
        if(article){
          detailMemory.set(surface+':'+slug,article);setItem(article);setLoading(false);
          onMetadata(article.seo_title||article.title,article.seo_description||article.excerpt,article.cover_url,article.published_at);
        }
      }).catch(()=>{});
      void editorialApi.detail(slug,surface).then(v=>{
        if(!mounted)return;
        liveAnswered=true;
        detailMemory.set(surface+':'+slug,v.article);setItem(v.article);setError('');setLoading(false);
        onMetadata(v.article.seo_title||v.article.title,v.article.seo_description||v.article.excerpt,v.article.cover_url,v.article.published_at);
      }).catch(()=>{
        if(mounted&&!readCachedDetail(slug,surface)){setError('Статья не найдена или временно недоступна.');setLoading(false);}
      });
    }else{
      setItem(null);
      onMetadata('Статьи и кейсы — VVD CPA','Статьи, кейсы, обучение и полезные материалы для вебмастеров и арбитражников.');
      const cached=readCachedArticles(surface);
      if(cached)setData(cached);
      setLoading(!cached);
      if(surface==='web'&&!bootstrappedEditorial())void editorialApi.snapshot().then(v=>{
        if(!mounted||liveAnswered)return;
        const feed={categories:v.categories,articles:v.articles};
        rememberArticles(surface,feed);setData(feed);setLoading(false);
      }).catch(()=>{});
      void editorialApi.list(surface).then(v=>{
        if(!mounted)return;
        liveAnswered=true;rememberArticles(surface,v);
        // No needless re-render if server matches the already visible HTML snapshot.
        setData(previous=>JSON.stringify(previous)===JSON.stringify(v)?previous:v);
        setError('');setLoading(false);
      }).catch(()=>{
        if(mounted&&!readCachedArticles(surface)){setError('Не удалось загрузить статьи.');setLoading(false);}
      });
    }
    return()=>{mounted=false};
  },[slug,surface,retry,onMetadata]);
  // Recording happens once when the reader opens an article. Reaching the
  // bottom never adds another view. The server deduplicates repeat opens
  // from this anonymous session for thirty minutes.
  useEffect(()=>{
    if(!slug)return;
    let active=true;
    void editorialApi.recordView(slug,surface,anonymousViewSession()).then(result=>{
      if(!active)return;
      setLiveViews(prev=>({...prev,[slug]:result.views}));
      const key=surface+':'+slug;
      const cached=detailMemory.get(key);
      if(cached)detailMemory.set(key,{...cached,view_count:result.views});
      setItem(current=>current?.slug===slug?{...current,view_count:result.views}:current);
      setData(previous=>({...previous,articles:previous.articles.map(a=>
        a.slug===slug?{...a,view_count:result.views}:a)}));
    }).catch(()=>{/* View analytics must never block reading an article. */});
    return()=>{active=false};
  },[slug,surface]);
  const searchTerms=useMemo(()=>searchWords(query),[query]);
  const categories=useMemo(()=>new Map(data.categories.map(c=>[c.id,c])),[data.categories]);
  const filteredCategories=useMemo(()=>data.categories.filter(c=>
    matchesWords(searchTerms,c.name,c.description)||
    data.articles.some(a=>a.category_id===c.id&&matchesWords(searchTerms,a.title,a.excerpt,a.seo_title,a.seo_description,...a.tags))
  ),[data,searchTerms]);
  const results=useMemo(()=>data.articles.filter(a=>{
    if(category!=='all'&&a.category_id!==category)return false;
    const parent=categories.get(a.category_id);
    return matchesWords(searchTerms,a.title,a.excerpt,a.seo_title,a.seo_description,...a.tags,
      parent?.name||'',parent?.description||'');
  }),[data.articles,category,categories,searchTerms]);
  const selectedCategory=categories.get(category);
  // The website scrolls inside .vvd-web-portal while the Mini App scrolls
  // inside .scrollable-container. Reset the right viewport after React has
  // rendered a new article/list/category, before it is painted on screen.
  useLayoutEffect(()=>{
    const scroller=articleRoot.current?.closest<HTMLElement>('.vvd-web-portal, .scrollable-container');
    if(scroller)scroller.scrollTo({top:0,behavior:'auto'});
    else window.scrollTo({top:0,behavior:'auto'});
  },[slug,category,surface,contributionOpen]);
  const chooseCategory=(id:string)=>{
    setCategory(id);setQuery('');
  };
  return <main className="vvd-web-articles" ref={articleRoot}>
    {!slug&&contributionOpen?<EditorialContributions categories={data.categories} authenticated={contributionAuthenticated??Boolean(currentSignedSession())} onLogin={onContributionLogin||(()=>{})} onClose={()=>setContributionOpen(false)}/> : <>
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
        <div className="vvd-article-meta">
          <span><CalendarDays size={16}/> {formatDate(item.published_at)}</span>
          <span><BookOpen size={16}/> {item.author_name||'VVD CPA'}</span>
          <span aria-label={'Просмотров: '+(liveViews[slug]??item.view_count??0)}><Eye size={16}/> {(liveViews[slug]??item.view_count??0).toLocaleString('ru-RU')}</span>
        </div>
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
        <button type="button" className="vvd-web-outline-button vvd-community-entry" onClick={()=>{setContributionOpen(true);setCategory('all');setQuery('')}}>✍ Предложить свою статью</button>
        <label className="vvd-web-search"><Search size={20}/><input type="search" value={query} onChange={e=>setQuery(e.target.value)} placeholder="Поиск категорий, статей и ключевых слов…"/></label>
        {category==='all'?<>
          <div className="vvd-editorial-category-heading"><h2>{searchTerms.length?'Найденные категории':'Выберите категорию'}</h2></div>
          <div className="vvd-editorial-category-grid" aria-label="Категории статей">
            {filteredCategories.map(c=>{
              const amount=data.articles.filter(a=>a.category_id===c.id).length;
              return <UnifiedCategoryCard key={c.id} onClick={()=>chooseCategory(c.id)}
                icon={categoryIcons[c.id]||BookOpen}
                imageUrl={c.image_url&&safeImage(c.image_url)?c.image_url:undefined}
                title={c.name} description={c.description}
                status={amount?materialCount(amount):'Материалы готовятся'}/>;
            })}
          </div>
          {searchTerms.length>0&&filteredCategories.length===0&&!loading&&!error&&<div className="vvd-web-notice">Категории по запросу не найдены.</div>}
          <div className="vvd-editorial-category-heading"><h2>{searchTerms.length?'Найденные статьи':'Последние публикации'}</h2></div>
        </>:<div className="vvd-editorial-selected-category">
          <button type="button" className="vvd-web-back" onClick={()=>chooseCategory('all')}><ArrowLeft size={17}/> Все категории</button>
          <h2>{selectedCategory?.name||'Статьи'}</h2>
          {selectedCategory?.description&&<p>{selectedCategory.description}</p>}
        </div>}
        {error?<div className="vvd-web-notice" role="alert">{error} <button type="button" className="vvd-web-outline-button" onClick={()=>setRetry(v=>v+1)}>Повторить</button></div>:
        results.length?<div className="vvd-article-grid">{results.map((a,i)=><ArticleCard key={a.slug} priority={i<2} article={a} categoryName={categories.get(a.category_id)?.name||''} categoryCover={categories.get(a.category_id)?.image_url||''} onClick={()=>onArticle(a.slug)} viewCount={liveViews[a.slug]??a.view_count??0}/>)}</div>:
        loading?<div className="vvd-article-grid" aria-label="Загружаем статьи" aria-busy="true">
          {[0,1,2].map(i=><div className="vvd-article-card vvd-article-loading-card" key={i} aria-hidden="true">
            <div className="vvd-article-loading-image"/><div className="vvd-article-card-copy"><div className="vvd-article-loading-line"/><div className="vvd-article-loading-line short"/></div>
          </div>)}
        </div>:
        <div className="vvd-web-notice">{searchTerms.length?'По запросу ничего не найдено. Попробуй другое слово.':category!=='all'?'В этой категории пока нет опубликованных материалов.':'Здесь появятся первые статьи и кейсы VVD CPA.'}</div>}
      </section>
    }
    </>}
  </main>;
};

const ArticleCard:React.FC<{article:ArticleSummary;categoryName:string;categoryCover:string;priority:boolean;onClick:()=>void;viewCount:number}>=({article:a,categoryName,categoryCover,priority,onClick,viewCount})=>
  <button type="button" className="vvd-article-card" onClick={onClick}>
    {(a.cover_url&&safeImage(a.cover_url)?a.cover_url:(categoryCover&&safeImage(categoryCover)?categoryCover:""))?<img src={a.cover_url&&safeImage(a.cover_url)?a.cover_url:categoryCover} alt="" loading={priority?"eager":"lazy"} fetchPriority={priority?"high":"auto"} decoding="async"/>:<div className="vvd-article-placeholder"><BookOpen size={36}/></div>}
    <div className="vvd-article-card-copy">
      <span className="vvd-web-eyebrow">{categoryName}</span>
      <h2>{a.title}</h2>
      <p>{a.excerpt}</p>
      <div className="vvd-article-card-bottom"><small>{formatDate(a.published_at)}</small><span className="vvd-article-card-views" aria-label={'Просмотров: '+viewCount}><Eye size={14}/> {viewCount.toLocaleString('ru-RU')}</span><span>Читать <ArrowRight size={16}/></span></div>
    </div>
  </button>;
