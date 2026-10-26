const {chromium}=require('playwright');
const {spawn}=require('node:child_process');
const fs=require('node:fs'),assert=require('node:assert/strict');
const host='http://127.0.0.1:3012';
const delay=ms=>new Promise(r=>setTimeout(r,ms));
async function api(path,post=false){const r=await fetch(host+path,{method:post?'POST':'GET'});assert.equal(r.status,200,await r.clone().text());return r.json();}
(async()=>{
 fs.mkdirSync('proxy-process-screenshots',{recursive:true});
 const browser=await chromium.launch();const evidence=[];
 try{for(const kind of ['ipv4','isp','mobile']){
  const log=fs.openSync(`proxy-process-screenshots/${kind}-http.log`,'w');
  const server=spawn('python',['scripts/proxy_ui_test_server.py'],{env:{...process.env,PROXY_TEST_KIND:kind},stdio:['ignore',log,log]});
  let page;
  try{
   let ready=false;for(let i=0;i<60;i++){try{ready=(await api('/test/health')).kind===kind;}catch{}if(ready)break;await delay(500);}assert.ok(ready,'isolated HTTP server starts');
   page=await browser.newPage({viewport:{width:390,height:844}});const errors=[];page.on('pageerror',e=>errors.push(e.message));
   await page.route('**/*',r=>/^http:\/\/127\.0\.0\.1:301[12]\//.test(r.request().url())?r.continue():r.abort());
   await page.clock.install();
   await page.goto('http://127.0.0.1:3011/vvd-cpa/tests/proxy-unified-preview.html');
   await page.getByLabel('Тип прокси').selectOption(kind);
   await page.getByLabel(/Количество IP/).fill('2');
   await page.getByRole('button',{name:'Рассчитать цену'}).click();
   await page.getByRole('button',{name:'Купить за $33.80'}).click();
   await page.getByText('Статус заказа: Ожидает оплаты',{exact:true}).waitFor();
   await page.waitForFunction(()=>[...document.querySelectorAll('button')].some(b=>b.textContent==='Обновить'&&!b.disabled));
   let report=await api('/test/report');assert.equal(report.orders.length,1);assert.equal(report.supplier_calls,0);assert.equal(report.balances[0],'100.00');
   const id=report.orders[0].id;
   // Test-only operator grants a real permit in the disposable DB; production stays closed.
   await api('/test/permit/'+id,true);
   await page.clock.fastForward(10000);
   const pay=page.getByRole('button',{name:'Контрольная покупка за $33.80'});await pay.waitFor();
   page.once('dialog',d=>d.accept());await pay.click();
   await page.getByText('Статус заказа: Ожидает выдачи',{exact:true}).waitFor();
   await page.waitForFunction(()=>[...document.querySelectorAll('button')].some(b=>b.textContent==='Обновить'&&!b.disabled));
   assert.equal(await page.getByRole('region').count(),0);
   await api('/test/inventory/1',true);await page.clock.fastForward(10000);
   await page.getByText('В инвентаре появились не все прокси. Принадлежность заказу ещё проверяется.',{exact:true}).waitFor();
   assert.equal(await page.getByRole('region').count(),0);
   await page.waitForFunction(()=>[...document.querySelectorAll('button')].some(b=>b.textContent==='Обновить'&&!b.disabled));
   await api('/test/reconnect',true);await api('/test/inventory/2',true);await page.clock.fastForward(10000);
   await page.getByText('Статус заказа: Выдан',{exact:true}).waitFor();
   // Confirmed cards open automatically when pending delivery becomes complete.
   await page.getByRole('region',{name:'Прокси №1',exact:true}).waitFor();
   assert.equal(await page.getByRole('region').count(),2);
   await page.getByText('192.0.2.1',{exact:true}).waitFor();
   assert.equal(await page.evaluate(()=>document.documentElement.scrollWidth>innerWidth),false);
   await page.screenshot({path:`proxy-process-screenshots/${kind}-unified.png`,fullPage:true});
   await page.reload();await page.getByRole('link',{name:'Мои прокси →'}).click();
   await page.getByText('Статус заказа: Выдан',{exact:true}).waitFor();
   await page.getByText('ID заказа: '+id,{exact:true}).waitFor();
   report=await api('/test/report');assert.equal(report.supplier_calls,1);assert.equal(report.purchase_transactions,1);assert.equal(report.orders.length,1);assert.equal(report.balances[0],'66.20');assert.equal(report.balances[1],'0.00');assert.deepEqual(errors,[]);
   evidence.push({kind,order_id:id,...report});console.log(`PASS ${kind}: Buy → real prepare/permit/payment handlers → delayed/partial supplier mock → auto cards → reload; one test debit`);
  }finally{if(page)await page.close();server.kill('SIGTERM');await new Promise(r=>server.once('exit',r));fs.closeSync(log);}
 }}finally{await browser.close();fs.writeFileSync('proxy-process-screenshots/unified-results.json',JSON.stringify({mock_only:true,scenarios:evidence},null,2));}
})().catch(e=>{console.error(e);process.exit(1)});
