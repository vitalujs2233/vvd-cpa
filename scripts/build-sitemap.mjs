import {writeFileSync} from 'node:fs';
const site='https://vitalujs2233.github.io/vvd-cpa/';
const base=['', '?page=services','?page=articles'];
const xmlEscape=s=>s.replace(/&/g,'&amp;').replace(/</g,'&lt;').replace(/>/g,'&gt;').replace(/"/g,'&quot;');
let entries=base.map(path=>({url:site+path,lastmod:''}));
try {
  const response=await fetch('https://vvd-cpa-v2.onrender.com/articles',{signal:AbortSignal.timeout(10000)});
  if(!response.ok)throw new Error('Editorial API HTTP '+response.status);
  const data=await response.json();
  if(!Array.isArray(data.articles))throw new Error('Invalid articles list');
  for(const a of data.articles){
    if(!/^[a-z0-9][a-z0-9-]*$/.test(a.slug))continue;
    entries.push({url:site+'?page=articles&article='+encodeURIComponent(a.slug),lastmod:(a.updated_at||a.published_at||'').slice(0,10)});
  }
}catch(error){
  console.warn('Editorial sitemap: API unavailable; base pages still indexed.',String(error));
}
const xml='<?xml version="1.0" encoding="UTF-8"?>\n<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">\n'+
entries.map(e=>'  <url><loc>'+xmlEscape(e.url)+'</loc>'+(e.lastmod?'<lastmod>'+xmlEscape(e.lastmod)+'</lastmod>':'')+'</url>').join('\n')+
'\n</urlset>\n';
writeFileSync('dist/sitemap.xml',xml,'utf8');
console.log('Sitemap generated:',entries.length,'URLs');
