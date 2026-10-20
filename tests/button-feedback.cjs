const ts=require('typescript'),fs=require('fs'),vm=require('vm'),assert=require('node:assert/strict');
let hooks=[],cursor=0,calls=0,resolve,reject;
const React={useState:v=>{const i=cursor++;if(!(i in hooks))hooks[i]=typeof v==='function'?v():v;return[hooks[i],v=>hooks[i]=v]},useRef:v=>{const i=cursor++;return hooks[i]||(hooks[i]={current:v})},useEffect:()=>{}};
const jsx=(type,props)=>({type,props});
const context={exports:{},navigator:{clipboard:{writeText:()=>{calls++;return new Promise((a,b)=>{resolve=a;reject=b})}}},setTimeout:()=>1,clearTimeout:()=>{},require:n=>n==='react'?React:n==='react/jsx-runtime'?{jsx,jsxs:jsx,Fragment:'fragment'}:{Check:'check',Loader2:'spinner'}};
vm.runInNewContext(ts.transpileModule(fs.readFileSync('src/shared/ui/CopyButton.tsx','utf8'),{compilerOptions:{module:ts.ModuleKind.CommonJS,target:ts.ScriptTarget.ES2020,jsx:ts.JsxEmit.ReactJSX,esModuleInterop:true}}).outputText,context);
const render=()=>{cursor=0;return context.exports.CopyButton({text:'https://example.invalid',children:'Скопировать'}).props.children};
(async()=>{
 let [button]=render();button.props.onClick();button.props.onClick();assert.equal(calls,1,'repeated tap must not duplicate pending copy');
 [button]=render();assert.equal(button.props['aria-busy'],true);assert.equal(button.props.disabled,true);
 resolve();await new Promise(r=>setImmediate(r));let nodes=render();assert.equal(nodes[0].props['aria-label'],'Скопировано');assert.equal(nodes[1].props.children,'Скопировано');
 nodes[0].props.onClick();reject(Error('denied'));await new Promise(r=>setImmediate(r));nodes=render();assert.equal(nodes[1].props.role,'alert');assert.match(nodes[1].props.children,/Не удалось/);assert.equal(nodes[0].props.disabled,false);
 const source=fs.readFileSync('src/shared/ui/Button.tsx','utf8');assert.ok(!source.includes('Пожалуйста, подождите'));assert.ok(source.includes("isLoading ? 'invisible'"));
 console.log('PASS: pending copy, repeat-tap lock, confirmed success, visible clipboard failure, compact loading');
})().catch(e=>{console.error(e);process.exitCode=1});
