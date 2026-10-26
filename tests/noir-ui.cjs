const fs=require('fs'),vm=require('vm'),test=require('node:test'),assert=require('node:assert/strict'),ts=require('typescript');
const deps=process.env.AI_UI_TEST_DEPS||process.cwd()+'/node_modules';
const React=require(require.resolve('react',{paths:[deps]})),renderer=require(require.resolve('react-test-renderer',{paths:[deps]})),{act}=renderer;
const source=fs.readFileSync('src/pages/tools/MarketplacePages.tsx','utf8');
const chunk=source.slice(source.indexOf('export const ToolsNumbers:'),source.indexOf('export const MyNumbers:'));
const code=ts.transpileModule("import React,{useState,useEffect,useRef} from 'react';\n"+chunk,{compilerOptions:{jsx:ts.JsxEmit.React,module:ts.ModuleKind.CommonJS,esModuleInterop:true}}).outputText;
async function mount(api){const exports={},wrap=tag=>p=>React.createElement(tag,p,p.children);vm.runInNewContext(code,{exports,require:()=>React,marketApi:api,ApiError:class extends Error{},useNavigate:()=>()=>{},crypto:{randomUUID:()=>'11111111-1111-4111-8111-111111111111'},Shell:wrap('div'),Card:wrap('div'),Status:wrap('p'),Button:wrap('button'),Link:wrap('a'),NavHeader:()=>null,Phone:()=>null,inputClass:'input',usd:v=>'$'+v,setTimeout,clearTimeout,Date,Intl});let view;await act(async()=>{view=renderer.create(React.createElement(exports.ToolsNumbers));});return {view,text:()=>JSON.stringify(view.toJSON()),choose:async(label,value)=>act(async()=>view.root.findByProps({'aria-label':label}).props.onChange({target:{value}}))};}
const quote={code:'a',name:'Example',price:'1.30',stock:2,available:true,expires_at:Date.now()/1000+20};
const api={noirCheckoutConfig:async()=>({purchases_enabled:false}),noirCountries:async()=>({countries:[{code:'us'},{code:'gb'}]}),noirServices:async()=>({services:[quote]}),noirPrice:async()=>quote};
test('select country/service displays server price and keeps purchase disabled',async()=>{let calls=0;const f=await mount({...api,noirPrice:async()=>{calls++;return quote;}});await f.choose('Страна','us');await f.choose('Сервис для SMS','a');assert.ok(f.text().includes('$1.30'));assert.equal(calls,1);assert.ok(f.view.root.findAllByType('button').find(b=>b.props.children==='Купить номер').props.disabled);await f.choose('Страна','gb');assert.ok(!f.text().includes('$1.30'));f.view.unmount();});
test('late quote from previous selection cannot overwrite current country',async()=>{let finish;const f=await mount({...api,noirPrice:()=>new Promise(r=>finish=r)});await f.choose('Страна','us');await f.choose('Сервис для SMS','a');await f.choose('Страна','gb');await act(async()=>finish(quote));assert.ok(!f.text().includes('$1.30'));f.view.unmount();});
test('error can be retried; empty catalogue is explicit',async()=>{let calls=0;const f=await mount({...api,noirCountries:async()=>{if(!calls++)throw Error('Временно недоступен');return {countries:[]};}});assert.ok(f.text().includes('Временно недоступен'));await act(async()=>f.view.root.findAllByType('button').find(b=>!b.props.disabled).props.onClick());assert.ok(f.text().includes('Нет доступных стран'));f.view.unmount();});
test('missing price is never displayed as zero',async()=>{const f=await mount({...api,noirPrice:async()=>({...quote,price:null,available:false,message:'Цена недоступна'})});await f.choose('Страна','us');await f.choose('Сервис для SMS','a');assert.ok(f.text().includes('Цена недоступна'));assert.ok(!f.text().includes('$0'));f.view.unmount();});

test('enabled checkout sends one request on double click',async()=>{let done,calls=0;const f=await mount({...api,noirCheckoutConfig:async()=>({purchases_enabled:true}),noirPurchase:()=>{calls++;return new Promise(r=>done=r)}});await f.choose('Страна','us');await f.choose('Сервис для SMS','a');const buy=f.view.root.findAllByType('button').find(b=>b.props.children==='Купить номер');await act(async()=>{buy.props.onClick();buy.props.onClick();});assert.equal(calls,1);await act(async()=>done({state:'settled'}));f.view.unmount();});
test('uncertain HTTP response retries same request id',async()=>{const ids=[];const f=await mount({...api,noirCheckoutConfig:async()=>({purchases_enabled:true}),noirPurchase:async b=>{ids.push(b.request_id);if(ids.length===1)throw Error('network');return {state:'settled'};}});await f.choose('Страна','us');await f.choose('Сервис для SMS','a');await act(async()=>f.view.root.findAllByType('button').find(b=>b.props.children==='Купить номер').props.onClick());await act(async()=>f.view.root.findAllByType('button').find(b=>b.props.children==='Проверить покупку').props.onClick());assert.equal(ids.length,2);assert.equal(ids[0],ids[1]);f.view.unmount();});

test('disabled checkout explains reason',async()=>{const f=await mount({...api,noirCheckoutConfig:async()=>({purchases_enabled:false,reason:'Покупки временно недоступны. Проводится проверка системы выдачи.'})});assert.ok(f.text().includes('Проводится проверка системы выдачи'));f.view.unmount();});

async function mountProxy(api){const navigations=[];const exports={},wrap=tag=>p=>React.createElement(tag,p,p.children);const chunk=source.slice(source.indexOf('export const ToolsProxy:'),source.indexOf('export const MyProxies:'));const code=ts.transpileModule("import React,{useState,useEffect,useRef} from 'react';\n"+chunk,{compilerOptions:{jsx:ts.JsxEmit.React,module:ts.ModuleKind.CommonJS,esModuleInterop:true}}).outputText;vm.runInNewContext(code,{exports,require:()=>React,marketApi:api,useNavigate:()=>path=>navigations.push(path),window:{confirm:()=>true},crypto:{randomUUID:()=>'test-request'},Shell:wrap('div'),Card:wrap('div'),Status:wrap('p'),Button:wrap('button'),Link:wrap('a'),NavHeader:()=>null,inputClass:'input',usd:v=>'$'+v,toText:e=>e.message});let view;await act(async()=>{view=renderer.create(React.createElement(exports.ToolsProxy));});view.navigations=navigations;return view;}
const proxyApi={proxyIpv4CheckoutConfig:async()=>({purchases_enabled:true,supported_purchase_types:['ipv6']}),proxyIpv4Catalog:async()=>({minimum_count:1,data:{countries:[{code:'GBR',name:'England'}],days:[3],tariffs:[{country:'GBR',mobileOperator:[{name:'three_unitedkingdom',rotationTime:[0]}]}]}}),proxyIpv4Quote:async()=>({customer_total_usd:'33.80'})};
for(const kind of ['ipv4','isp','mobile','ipv6'])test(kind+' Buy prepares once and navigates without a paid request',async()=>{
 let prepared=[],paid=0,finish;
 const view=await mountProxy({...proxyApi,proxyIpv4Prepare:body=>{prepared.push(body);return new Promise(r=>finish=r);},proxyIpv4Purchase:async()=>{paid++;}});
 await act(async()=>view.root.findAllByType('select')[0].props.onChange({target:{value:kind}}));
 await act(async()=>view.root.findAllByType('button').find(b=>b.props.children==='Рассчитать цену').props.onClick());
 const buy=view.root.findAllByType('button').find(b=>b.props.children==='Купить за $33.80');assert.equal(buy.props.disabled,false);
 await act(async()=>{buy.props.onClick();buy.props.onClick();});assert.equal(prepared.length,1);
 await act(async()=>finish({id:'test',customer_total_usd:'33.80'}));assert.equal(paid,0);assert.deepEqual(view.navigations,['/tools/proxy/my']);view.unmount();
});
test('changed quote does not navigate or call paid endpoint',async()=>{
 const view=await mountProxy({...proxyApi,proxyIpv4Prepare:async()=>({id:'test',customer_total_usd:'40'})});
 await act(async()=>view.root.findAllByType('button').find(b=>b.props.children==='Рассчитать цену').props.onClick());
 await act(async()=>view.root.findAllByType('button').find(b=>b.props.children==='Купить за $33.80').props.onClick());
 assert.deepEqual(view.navigations,[]);assert.ok(JSON.stringify(view.toJSON()).includes('Цена изменилась'));view.unmount();
});
test('retry after lost prepare response reuses UUID; loading config cannot authorize prepare',async()=>{
 const bodies=[];const view=await mountProxy({...proxyApi,proxyIpv4Prepare:async b=>{bodies.push(b);throw Error('offline');}});
 await act(async()=>view.root.findAllByType('button').find(b=>b.props.children==='Рассчитать цену').props.onClick());
 for(let i=0;i<2;i++)await act(async()=>view.root.findAllByType('button').find(b=>b.props.children==='Купить за $33.80').props.onClick());
 assert.equal(bodies[0].request_id,bodies[1].request_id);assert.deepEqual(view.navigations,[]);view.unmount();
});
