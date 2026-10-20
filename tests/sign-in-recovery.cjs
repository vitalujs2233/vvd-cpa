const fs=require('fs'),ts=require('typescript'),vm=require('vm'),assert=require('node:assert/strict');
function setup(answers){
 let calls=0;
 const context={exports:{},window:{Telegram:{WebApp:{initData:'signed-test'}}},Headers,FormData,AbortController,
 setTimeout:(fn,ms)=>ms===1500?setTimeout(fn,0):0,clearTimeout,
 fetch:async()=>{calls++;const answer=answers.shift();if(answer instanceof Error)throw answer;return answer;},
 require:()=>({saveSnapshot:()=>{}})};
 vm.runInNewContext(ts.transpileModule(fs.readFileSync('src/shared/lib/api.ts','utf8'),{compilerOptions:{module:ts.ModuleKind.CommonJS,target:ts.ScriptTarget.ES2020}}).outputText,context);
 return {api:context.exports,calls:()=>calls};
}
const ok=()=>({ok:true,json:async()=>({user:{telegram_id:123}})});
const fail=(status,code)=>({ok:false,status,json:async()=>({detail:{code}})});
(async()=>{
 let s=setup([Error('offline'),ok()]);const a=s.api.loginViaTelegramApi(),b=s.api.loginViaTelegramApi();assert.equal(a,b);assert.equal((await a).user.telegram_id,123);assert.equal(s.calls(),2);
 s=setup([fail(401,'invalid_signature')]);await assert.rejects(s.api.loginViaTelegramApi(),e=>e.code==='invalid_signature');assert.equal(s.calls(),1);
 s=setup([fail(503,'account_storage_error'),fail(503,'account_storage_error'),ok()]);await assert.rejects(s.api.loginViaTelegramApi());assert.equal(s.calls(),2);await s.api.loginViaTelegramApi();assert.equal(s.calls(),3);
 s=setup([Error('offline')]);await assert.rejects(s.api.apiRequest('/withdrawals',{method:'POST'}));assert.equal(s.calls(),1,'payouts must never be retried automatically');
 console.log('PASS: temporary sign-in retry, shared request, no retry on bad signature, manual recovery, no payout retries');
})().catch(e=>{console.error(e);process.exitCode=1});
