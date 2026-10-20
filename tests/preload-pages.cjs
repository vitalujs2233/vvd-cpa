const ts=require('typescript'),fs=require('fs'),vm=require('vm'),assert=require('node:assert/strict');
const window={Telegram:{WebApp:{initData:'session'}}};
function load(path,deps={}){const c={exports:{},window,require:n=>deps[n]};vm.runInNewContext(ts.transpileModule(fs.readFileSync(path,'utf8'),{compilerOptions:{module:ts.ModuleKind.CommonJS,target:ts.ScriptTarget.ES2020}}).outputText,c);return c.exports;}
const snapshots=load('src/shared/lib/viewSnapshot.ts');
let calls=[],running=0,max=0,fail=false;
const data={
 '/cpa/catalog/dating':{vertical:{slug:'dating',cpa_link_allowed:true},offers:[{id:'o1',title:'Offer'}]},
 '/cpa/links/o1':{url:'https://example.invalid/link'},
 '/withdrawals/VVD1':{success:true,withdrawals:[{id:1,amount:50}]},
 '/tools-market/ai':{models:[{id:'m1'}]},
 '/admin/users':{users:[{telegram_id:123,partner_code:'VVD1'}]},
 '/cpa/admin/networks':{items:[{id:1}]}
};
const pages=load('src/shared/lib/preloadPages.ts',{'./viewSnapshot':snapshots,'./api':{apiRequest:async(path,options)=>{
 assert.equal(options,undefined,'preloading must not issue writes');calls.push(path);max=Math.max(max,++running);
 await new Promise(r=>setImmediate(r));running--;
 if(fail&&path==='/withdrawals/VVD1')throw Error('offline');
 const result=data[path]||{};snapshots.saveSnapshot('api:'+path,result);return result;
}}});
(async()=>{
 snapshots.saveSnapshot('catalog',[{slug:'dating'}]);
 await pages.preloadPages(123,'VVD1','user');
 assert.ok(max<=4);assert.ok(!calls.some(x=>x.startsWith('/admin/')||x.startsWith('/cpa/admin/')));
 assert.equal(snapshots.readApiSnapshot('/cpa/catalog/dating/o1').offer.title,'Offer');
 assert.equal(snapshots.readApiSnapshot('/withdrawals/VVD1').withdrawals[0].amount,50);
 assert.ok(calls.includes('/ai-studio/models/m1/settings'));
 calls=[];await pages.preloadPages(123,'VVD1','admin');
 assert.ok(calls.includes('/admin/chat/banner'));assert.ok(calls.includes('/admin/cpa/partners/VVD1/hold'));assert.ok(calls.includes('/cpa/admin/networks/1/postback'));assert.ok(max<=4);
 fail=true;await assert.rejects(pages.preloadPages(123,'VVD1','user'),/историю/);
 console.log('PASS: bounded reads, history, offer detail hydration, model pages, role separation, failure handling');
})().catch(e=>{console.error(e);process.exitCode=1});
