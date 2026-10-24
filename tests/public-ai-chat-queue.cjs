// Run against React 18 with react-test-renderer installed in AI_UI_TEST_DEPS or node_modules.
// No network, Gemini key or production data: API replies and time are controlled.
const fs=require('node:fs');
const path=require('node:path');
const vm=require('node:vm');
const assert=require('node:assert/strict');
const test=require('node:test');
const deps=process.env.AI_UI_TEST_DEPS||path.resolve('node_modules');
const React=require(require.resolve('react',{paths:[deps]}));
const renderer=require(require.resolve('react-test-renderer',{paths:[deps]}));
const ts=require('typescript');
const {act}=renderer;
const source=fs.readFileSync('src/pages/tools/PublicAIChat.tsx','utf8');
const code=ts.transpileModule(source,{compilerOptions:{jsx:ts.JsxEmit.React,module:ts.ModuleKind.CommonJS,esModuleInterop:true,target:ts.ScriptTarget.ES2020}}).outputText;
const tick=async()=>{await Promise.resolve();await Promise.resolve();};
async function fixture(saved){
 const store=new Map(saved||[]),calls=[],timers=[];let now=10000,id=0,history=[];
 const session={token:'test-session-token',can_chat:true,greeting:'Привет!',messages:history,offer:{title:'Реклама',available:true}};
 const api={begin:async()=>({...session,messages:history}),click:async()=>({url:'https://example.test'}),send:(slug,token,message)=>new Promise((resolve,reject)=>calls.push({slug,token,message,resolve,reject,time:now}))};
 const fakeDate=class extends Date {static now(){return now;}};
 const exports={};
 const context={exports,Error,require:name=>{
   if(name==='react')return React;
   if(name==='lucide-react')return new Proxy({},{get:(_,name)=>()=>React.createElement('i',{'data-icon':String(name)})});
   if(name==='./marketApi')return {marketApi:{publicModel:async()=>({name:'Марина',greeting:'Приветствие',affiliate_url:'https://example.test',button_label:'Реклама',photo_url:null})}};
   if(name==='./aiApi')return {aiApi:api,fileUrl:url=>url};
   throw Error(name);
 },Date:fakeDate,crypto:{randomUUID:()=>String(++id)},sessionStorage:{getItem:k=>store.get(k)||null,setItem:(k,v)=>store.set(k,v)},window:{setTimeout:(fn,ms)=>{const t={fn,ms};timers.push(t);return t;},clearTimeout:t=>{if(t)t.cancelled=true;}}};
 vm.runInNewContext(code,context);
 let view;
 const mount=async()=>{await act(async()=>{view=renderer.create(React.createElement(exports.PublicAIPage,{slug:'marina'}));await tick();});};
 await mount();
 const submit=async text=>{
   await act(async()=>{view.root.findByProps({'aria-label':'Сообщение'}).props.onChange({target:{value:text}});});
   await act(async()=>{view.root.findByType('form').props.onSubmit({preventDefault(){}});await tick();});
 };
 const advance=async()=>{await act(async()=>{const t=timers.shift();assert.ok(t);assert.ok(t.ms>=3100);now+=t.ms;if(!t.cancelled)t.fn();await tick();});};
 return {calls,store,submit,advance,mount,setHistory:items=>{history=items;},get view(){return view;},text:()=>JSON.stringify(view.toJSON()),async resolve(index,answer){await act(async()=>{calls[index].resolve(answer);await tick();});},async reject(index){await act(async()=>{calls[index].reject(new Error('Сбой связи'));await tick();});}};
}
const reply=text=>({role:'assistant',content:text});
test('free typing, sequential calls, cooldown, ordered replies and unchanged photo/status/info UI',async()=>{
 const f=await fixture();
 assert.ok(!f.text().includes('Это виртуальный персонаж. Общение происходит'));
 assert.ok(f.text().includes('В сети'));
 await act(async()=>f.view.root.findByProps({'aria-label':'Информация о чате'}).props.onClick());
 assert.ok(f.text().includes('Вы общаетесь с искусственным интеллектом'));
 await f.submit('Первое');
 assert.equal(f.view.root.findByProps({'aria-label':'Сообщение'}).props.disabled,false);
 await f.submit('Второе');
 assert.equal(f.calls.length,1);
 assert.ok(f.text().includes('Первое')&&f.text().includes('Второе'));
 assert.equal(f.view.root.findByProps({'aria-label':'AI печатает'}).findAllByType('span').length,3);
 await f.resolve(0,reply('Ответ один'));
 assert.equal(f.calls.length,1);
 await f.advance();assert.equal(f.calls.length,2);assert.equal(f.calls[1].message,'Второе');
 await f.resolve(1,{...reply('Ответ два'),photo:{url:'/allowed-photo',title:'Фото'}});
 const html=f.text();assert.ok(html.indexOf('Первое')<html.indexOf('Ответ один'));assert.ok(html.indexOf('Ответ один')<html.indexOf('Второе'));assert.ok(html.indexOf('Второе')<html.indexOf('Ответ два'));
 assert.equal(f.view.root.findAllByProps({'aria-label':'AI печатает'}).length,0);
 assert.equal(f.view.root.findByType('img').props.src,'/allowed-photo');
 assert.equal(f.view.root.findAllByProps({type:'checkbox'}).length,1);
 assert.ok(html.includes('Реклама'));
 f.view.unmount();
});
test('double submit consumes draft once',async()=>{
 const f=await fixture();
 await act(async()=>f.view.root.findByProps({'aria-label':'Сообщение'}).props.onChange({target:{value:'Один раз'}}));
 await act(async()=>{const submit=f.view.root.findByType('form').props.onSubmit;submit({preventDefault(){}});submit({preventDefault(){}});await tick();});
 assert.equal(f.calls.length,1);assert.equal(JSON.parse(f.store.get('vvd_ai_outbox_marina')).items.length,1);
 await f.resolve(0,reply('Ответ'));f.view.unmount();
});
test('failure pauses, preserves messages and resumes only untouched pending requests',async()=>{
 const f=await fixture();await f.submit('Сохранить первое');await f.submit('Сохранить второе');await f.reject(0);
 assert.equal(f.calls.length,1);assert.ok(f.text().includes('Сбой связи'));assert.ok(f.text().includes('Сохранить первое'));
 const items=JSON.parse(f.store.get('vvd_ai_outbox_marina')).items;assert.equal(items[0].status,'failed');assert.equal(items[1].status,'pending');
 assert.equal(f.view.root.findAllByProps({'aria-label':'AI печатает'}).length,0);
 await act(async()=>f.view.root.findAllByType('button').find(b=>b.children.includes('Продолжить очередь')).props.onClick());
 await f.advance();assert.equal(f.calls.length,2);assert.equal(f.calls[1].message,'Сохранить второе');
 await f.resolve(1,reply('Готово'));f.view.unmount();
});
test('reload restores pending messages, does not replay uncertain in-flight request',async()=>{
 const f=await fixture();await f.submit('Уже принято');await f.submit('Ещё в очереди');f.view.unmount();
 f.setHistory([{role:'user',content:'Уже принято'},reply('Серверный ответ')]);await f.mount();
 assert.equal(f.calls.length,1);assert.ok(f.text().includes('Серверный ответ'));assert.ok(f.text().includes('Ещё в очереди'));
 await act(async()=>f.view.root.findAllByType('button').find(b=>b.children.includes('Продолжить очередь')).props.onClick());
 await f.advance();assert.equal(f.calls.length,2);assert.equal(f.calls[1].message,'Ещё в очереди');
 await f.resolve(1,reply('Второй ответ'));f.view.unmount();
});
