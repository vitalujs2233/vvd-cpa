// Isolated startup regression tests: no production requests.
const ts=require('typescript'),fs=require('fs'),vm=require('vm'),assert=require('node:assert/strict');
const window={Telegram:{WebApp:{initData:'session-a'}}};
function load(path,dependencies={}) {
  const context={exports:{},window,URLSearchParams,Intl,Date,console,require:name=>dependencies[name]};
  vm.runInNewContext(ts.transpileModule(fs.readFileSync(path,'utf8'),{compilerOptions:{module:ts.ModuleKind.CommonJS,target:ts.ScriptTarget.ES2020}}).outputText,context);
  return context.exports;
}
const snapshots=load('src/shared/lib/viewSnapshot.ts');
let requests=[];
const startup=load('src/shared/lib/startupData.ts',{
  './viewSnapshot':snapshots,
  './preloadPages':{preloadPages:async()=>{}},
  './chatSnapshot':load('src/shared/lib/chatSnapshot.ts'),
  './api':{API_BASE_URL:'https://isolated',authorizedFetch:url=>new Promise(resolve=>requests.push({url,resolve}))}
});
function answer(request,ok=true){
  const url=request.url;
  const data=url.includes('/balance/')?{available:60,hold:40,paid:0}:
    url.includes('/chat/messages')?{success:true,messages:[{id:'m1',sender_id:'123',sender_name:'Partner',text:'Hello',created_at:'2026-10-20T11:00:00Z'}]}:
    url.includes('/cpa/catalog')?{verticals:[{slug:'dating'}]}:
    url.includes('/countries?')?{success:true,countries:[]}:
    url.includes('/breakdown?')?{success:true,offers:[]}:
    url.includes('/clicks?')?{success:true,clicks:[]}:
    {success:true,summary:{clicks:6},statistics:[]};
  request.resolve({ok,json:async()=>data});
}
(async()=>{
  const first=startup.preloadStartupData(123);
  assert.equal(startup.preloadStartupData(123),first,'duplicate mounts must share startup');
  assert.equal(requests.length,7);
  let ready=false;first.then(()=>ready=true);
  requests.filter(r=>!r.url.includes('/chat/messages')).forEach(r=>answer(r));
  await new Promise(r=>setImmediate(r));
  assert.equal(ready,false,'keep splash while any section is still loading');
  answer(requests.find(r=>r.url.includes('/chat/messages')));await first;
  assert.equal(ready,true);
  assert.equal(snapshots.readSnapshot('dvizh:messages')[0].text,'Hello');
  assert.equal(snapshots.readSnapshot('dvizh:messages')[0].senderId,'123');
  assert.equal(snapshots.readSnapshot('balance:123').available,60);
  const keys=startup.statisticsSources(123,new URLSearchParams({period:'today',tz:startup.statisticsTimezone})).map(startup.statisticsSnapshotKey);
  assert.equal(snapshots.readSnapshot(keys[0]).summary.clicks,6);
  assert.equal(snapshots.readSnapshot('catalog')[0].slug,'dating');
  requests=[];
  const failure=startup.preloadStartupData(123);
  requests.forEach((r,i)=>answer(r,i!==0));
  await assert.rejects(failure,startup.StartupDataError);
  requests=[];
  const retry=startup.preloadStartupData(123);requests.forEach(r=>answer(r));await retry;
  window.Telegram.WebApp.initData='session-b';
  assert.equal(snapshots.readSnapshot('balance:123'),undefined);
  console.log('PASS: startup waits for all data, deduplicates mounts, shares snapshots, fails safely, retries, isolates sessions');
})().catch(error=>{console.error(error);process.exitCode=1});
