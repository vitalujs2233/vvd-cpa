import {writeFileSync,readFileSync} from 'node:fs';

const site='https://vitalujs2233.github.io/vvd-cpa/';
const api='https://vvd-cpa-v2.onrender.com/articles';
const base=['', '?page=services','?page=articles'];
const xmlEscape=s=>s.replace(/&/g,'&amp;').replace(/</g,'&lt;').replace(/>/g,'&gt;').replace(/"/g,'&quot;');
const entries=base.map(path=>({url:site+path,lastmod:''}));
const snapshot={categories:[],articles:[],details:{}};

try{
  // Render Free can wake from idle during a deployment; give it time.
  const response=await fetch(api,{signal:AbortSignal.timeout(60000)});
  if(!response.ok)throw new Error('Editorial API HTTP '+response.status);
  const feed=await response.json();
  if(!Array.isArray(feed.articles)||!Array.isArray(feed.categories))throw new Error('Invalid articles feed');
  snapshot.categories=feed.categories;
  snapshot.articles=feed.articles;
  const articles=feed.articles.filter(a=>/^[a-z0-9][a-z0-9-]*$/.test(a.slug));
  for(const a of articles){
    entries.push({url:site+'?page=articles&article='+encodeURIComponent(a.slug),lastmod:(a.updated_at||a.published_at||'').slice(0,10)});
  }
  // Only public published articles can be exposed. The admin endpoint is never called.
  // Limit simultaneous requests to avoid overloading the free backend.
  for(let i=0;i<articles.length;i+=5){
    await Promise.all(articles.slice(i,i+5).map(async a=>{
      try{
        const articleResponse=await fetch(api+'/'+encodeURIComponent(a.slug),{signal:AbortSignal.timeout(10000)});
        if(!articleResponse.ok)return;
        const body=await articleResponse.json();
        if(body.article?.slug===a.slug)snapshot.details[a.slug]=body.article;
      }catch(error){console.warn('Article snapshot skipped:',a.slug,String(error));}
    }));
  }
}catch(error){
  console.warn('Editorial API failed during deployment; try last published public snapshot.',String(error));
  try{
    const last=await fetch(site+'editorial-snapshot.json',{signal:AbortSignal.timeout(12000),cache:'no-store'});
    if(!last.ok)throw new Error('Previous snapshot unavailable');
    const previous=await last.json();
    if(!Array.isArray(previous.articles)||!Array.isArray(previous.categories))throw new Error('Invalid previous snapshot');
    snapshot.categories=previous.categories;
    snapshot.articles=previous.articles;
    snapshot.details=previous.details||{};
    for(const a of snapshot.articles){
      if(/^[a-z0-9][a-z0-9-]*$/.test(a.slug)){
        entries.push({url:site+'?page=articles&article='+encodeURIComponent(a.slug),lastmod:(a.updated_at||a.published_at||'').slice(0,10)});
      }
    }
  }catch(fallbackError){
    throw new Error('Cannot publish a blank editorial catalog when the API is unavailable: '+String(fallbackError));
  }
}
writeFileSync('dist/editorial-snapshot.json',JSON.stringify(snapshot),'utf8');
// Put public catalog in the initial HTML. This script executes BEFORE the React bundle,
// so cards and category filters are already present on the first React paint.
const html=readFileSync('dist/index.html','utf8');
const safeJSON=JSON.stringify(snapshot).replace(/</g,'\\u003c').replace(/\u2028/g,'\\u2028').replace(/\u2029/g,'\\u2029');
const script='<script id="vvd-editorial-bootstrap">window.__VVD_EDITORIAL_BOOTSTRAP__='+safeJSON+';<\/script>';
const preload=snapshot.articles.slice(0,2).map(article=>{
  const raw=article.cover_url||'';
  try{
    const url=new URL(raw);
    if(url.protocol!=='https:')return '';
    return '<link rel="preload" as="image" href="'+xmlEscape(url.href)+'">';
  }catch{return ''}
}).join('');

if(!html.includes('</head>'))throw new Error('HTML head not found');
writeFileSync('dist/index.html',html.replace('</head>',preload+'\n'+script+'\n</head>'),'utf8');
const xml='<?xml version="1.0" encoding="UTF-8"?>\n<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">\n'+
entries.map(e=>'  <url><loc>'+xmlEscape(e.url)+'</loc>'+(e.lastmod?'<lastmod>'+xmlEscape(e.lastmod)+'</lastmod>':'')+'</url>').join('\n')+
'\n</urlset>\n';
writeFileSync('dist/sitemap.xml',xml,'utf8');
console.log('Sitemap:',entries.length,'URLs; public editorial snapshot:',snapshot.articles.length,'articles');
