// Mocked React interaction tests; no provider calls or production credentials.
const fs=require('node:fs'),path=require('node:path'),vm=require('node:vm'),assert=require('node:assert/strict'),test=require('node:test');
const deps=process.env.AI_UI_TEST_DEPS||path.resolve('node_modules');
const React=require(require.resolve('react',{paths:[deps]})),renderer=require(require.resolve('react-test-renderer',{paths:[deps]})),ts=require('typescript');
const {act}=renderer;
const code=ts.transpileModule(fs.readFileSync('src/pages/tools/CyberYozhPanels.tsx','utf8'),{compilerOptions:{jsx:ts.JsxEmit.React,module:ts.ModuleKind.CommonJS,esModuleInterop:true,target:ts.ScriptTarget.ES2020}}).outputText;
async function mount(name,api,props={}){
 const exports={};
 vm.runInNewContext(code,{exports,Error,setTimeout,clearTimeout,setInterval,clearInterval,Date,require:n=>{
  if(n==='react')return React;
  if(n==='react-router-dom')return {Link:p=>React.createElement('a',p,p.children)};
  if(n==='lucide-react')return new Proxy({},{get:()=>()=>React.createElement('i')});
  if(n.includes('/Card'))return {Card:p=>React.createElement('div',p,p.children)};
  if(n.includes('/Button'))return {Button:p=>React.createElement('button',p,p.children)};
  if(n==='./marketApi')return {cyberApi:api,usd:v=>'$'+v};
  throw Error(n);
 }});
 let view;await act(async()=>{view=renderer.create(React.createElement(exports[name],props));});
 return {view,text:()=>JSON.stringify(view.toJSON()),select:async(label,value)=>act(async()=>{view.root.findByProps({'aria-label':label}).props.onChange({target:{value}});})};
}
const empty={message:'Сервис готовится к подключению',offers:[],countries:[],services:[],periods:{},mock:false,purchases_enabled:false};
test('preparation has no fake price or enabled purchase',async()=>{
 const f=await mount('NumbersPanel',{catalog:async()=>empty});
 assert.ok(f.text().includes('Сервис готовится к подключению'));
 assert.ok(!f.text().includes('$'));
 assert.ok(f.view.root.findAllByType('button').every(b=>b.props.disabled));
 f.view.unmount();
});
test('numbers country / service / period selection gets server price',async()=>{
 const offer={id:'1',price:'1.20',available:true,stock:'5'};const calls=[];
 const f=await mount('NumbersPanel',{catalog:async()=>({...empty,mock:true,message:'Тестовый каталог',countries:[{code:'2',name:'Test'}],services:[{code:'example',name:'Example',provider:'virtual'}],periods:{virtual:['MIN_15']}}),search:async s=>{calls.push(s);return {offers:[offer]};},quote:async()=>({amount:'1.20',offer})});
 await f.select('Страна','2');await f.select('Тип номера','virtual');await f.select('Сервис','example');await f.select('Срок','MIN_15');
 assert.equal(calls.length,1);assert.equal(calls[0].country,'2');assert.ok(f.text().includes('$1.20'));assert.ok(f.text().includes('Тестовая стоимость'));
 f.view.unmount();
});
test('proxy country period quantity use server total and reset dependent selection',async()=>{
 const offer={id:'p',title:'ISP',category:'residential_static',country:'de',period_months:3,max_quantity:2,available:true,price:'8.80',protocols:['socks5']};const calls=[];
 const f=await mount('ProxyPanel',{catalog:async()=>({...empty,offers:[offer]}),quote:async(c,s)=>{calls.push(s);return {amount:s.quantity===2?'17.60':'8.80',offer};}});
 await f.select('Тип прокси','residential_static');await f.select('Страна','de');await f.select('Тариф','p');await f.select('Срок аренды','3');await f.select('Количество','2');
 assert.ok(f.text().includes('За штуку за выбранный срок'));assert.ok(f.text().includes('$8.80'));assert.ok(f.text().includes('$17.60'));assert.equal(calls.at(-1).quantity,2);
 await f.select('Страна','');assert.ok(!f.text().includes('$17.60'));
 f.view.unmount();
});
test('catalog error has retry; no purchase becomes available',async()=>{
 let count=0;const f=await mount('ProxyPanel',{catalog:async()=>{if(!count++)throw Error('Нет соединения');return empty;}});
 assert.ok(f.text().includes('Нет соединения'));
 const retry=f.view.root.findAllByType('button').find(b=>!b.props.disabled);
 await act(async()=>retry.props.onClick());assert.ok(f.text().includes('Сервис готовится к подключению'));
 f.view.unmount();
});

test('slow catalog resolves without losing data; failed search can be retried',async()=>{
 let finish;const pending=new Promise(r=>finish=r);let searches=0;
 const offer={id:'1',price:'1.35',available:true,stock:'5'};
 const f=await mount('NumbersPanel',{catalog:()=>pending,search:async()=>{if(!searches++)throw Error('Поставщик временно недоступен');return {offers:[offer]};},quote:async()=>({amount:'1.35',offer})});
 assert.ok(f.text().includes('Загружаем каталог'));
 await act(async()=>finish({...empty,countries:[{code:'2',name:'Test'}],services:[{code:'example',name:'Example',provider:'virtual'}],periods:{virtual:['MIN_15']}}));
 await f.select('Страна','2');await f.select('Тип номера','virtual');await f.select('Сервис','example');await f.select('Срок','MIN_15');
 assert.ok(f.text().includes('Поставщик временно недоступен'));
 const retry=f.view.root.findAllByType('button').find(b=>b.props.children==='Повторить поиск');
 await act(async()=>retry.props.onClick());assert.ok(f.text().includes('$1.35'));f.view.unmount();
});

test('catalog API deduplicates in-flight reads and translates aborted fetch',async()=>{
 const exports={};let finish,abortTimeout,calls=0;
 const apiCode=ts.transpileModule(fs.readFileSync('src/pages/tools/marketApi.ts','utf8'),{compilerOptions:{module:ts.ModuleKind.CommonJS,target:ts.ScriptTarget.ES2020}}).outputText;
 vm.runInNewContext(apiCode,{exports,Error,Map,Promise,AbortController,URLSearchParams,setTimeout:fn=>{abortTimeout=fn;return 1;},clearTimeout:()=>{},require:()=>({API_BASE_URL:'https://test.invalid',apiRequest:()=>{},authorizedFetch:(_url,init)=>{calls++;return new Promise((resolve,reject)=>{finish=()=>resolve({ok:true,json:async()=>empty});init.signal.addEventListener('abort',()=>reject(Error('Fetch is aborted')));});}})});
 const a=exports.cyberApi.catalog('numbers'),b=exports.cyberApi.catalog('numbers');assert.equal(calls,1);finish();await Promise.all([a,b]);
 const failed=exports.cyberApi.catalog('proxy');abortTimeout();await assert.rejects(failed,/Сервис отвечает слишком долго/);
 const retry=exports.cyberApi.catalog('proxy');finish();await retry;assert.equal(calls,3);
});
