const ts=require('typescript'),fs=require('fs'),vm=require('vm'),assert=require('node:assert/strict'),React=require('react'),{renderToString}=require('react-dom/server');
let tab='history';
const state={
 'account:123':{partner_code:'VVD1'},
 'balance:123':{available:60,real_withdrawable:60,real_finance_active:true,real_finance_available:true},
 'api:/withdrawals/VVD1':{withdrawals:[{id:1,amount:50,payment_method:'USDT TRC20',wallet:'Ttest',status:'rejected',created_at:'2026-10-20T11:00:00Z',processed_at:null}]}
};
const box=({children,...props})=>React.createElement('div',null,children);
const deps={
 'react':React,'react/jsx-runtime':require('react/jsx-runtime'),'lucide-react':require('lucide-react'),
 'react-router-dom':{useNavigate:()=>()=>{},useSearchParams:()=>[new URLSearchParams(tab?'tab='+tab:''),()=>{}]},
 '@/shared/lib/viewSnapshot':{readSnapshot:k=>state[k],readApiSnapshot:p=>state['api:'+p],saveSnapshot:()=>{}},
 '@/shared/lib/api':{authorizedFetch:()=>{throw Error('No requests allowed during initial render');}},
 '@/shared/lib/telegram':{triggerHaptic:{}},'@/shared/ui/Card':{Card:box},'@/shared/ui/Button':{Button:box},'@/shared/ui/Input':{Input:()=>null}
};
const context={exports:{},console,window:{Telegram:{WebApp:{initDataUnsafe:{user:{id:123}}}}},require:n=>deps[n]};
vm.runInNewContext(ts.transpileModule(fs.readFileSync('src/pages/withdrawal/Withdrawal.tsx','utf8'),{compilerOptions:{module:ts.ModuleKind.CommonJS,target:ts.ScriptTarget.ES2020,jsx:ts.JsxEmit.ReactJSX,esModuleInterop:true}}).outputText,context);
let html=renderToString(React.createElement(context.exports.Withdrawal));
assert.ok(html.includes('50.00'));assert.ok(!html.includes('Загрузка выплат'));
tab='';html=renderToString(React.createElement(context.exports.Withdrawal));assert.ok(html.includes('60.00'));assert.ok(!html.includes('...'));
console.log('PASS: payout balance and history present on initial render, no request required to display');
