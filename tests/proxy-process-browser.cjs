const {chromium}=require('playwright');
const fs=require('node:fs'),assert=require('node:assert/strict');
(async()=>{
 const data=JSON.parse(fs.readFileSync('tests/proxy-process-results.json'));
 assert.equal(data.mock_only,true);assert.equal(data.scenarios.length,18);
 fs.mkdirSync('proxy-process-screenshots',{recursive:true});
 const browser=await chromium.launch();
 try{
  for(const [index,s] of data.scenarios.entries()){
   const page=await browser.newPage({viewport:{width:390,height:844}});
   const errors=[];page.on('pageerror',e=>errors.push(e.message));
   await page.route('**/*',r=>r.request().url().startsWith('http://127.0.0.1:3011/')?r.continue():r.abort());
   await page.goto(`http://127.0.0.1:3011/vvd-cpa/tests/proxy-process-preview.html?case=${index}`);
   await page.getByRole('button',{name:'Обновить',exact:true}).waitFor();
   if(s.phase==='approved'){
    await page.getByText('Выдача: Прокси выданы',{exact:true}).waitFor();
    await page.getByRole('button',{name:'Посмотреть мои прокси'}).click();
    assert.equal(await page.getByRole('region').count(),2);
    await page.getByText('192.0.2.1',{exact:true}).waitFor();
    await page.getByText('192.0.2.2',{exact:true}).waitFor();
    await page.screenshot({path:`proxy-process-screenshots/${s.kind}.png`,fullPage:true});
   }else{
    await page.getByText(s.phase==='uncertain'?'Оплата: Требуется проверка результата':'Оплата: Заказ подтверждён',{exact:true}).waitFor();
    assert.equal(await page.getByRole('region').count(),0);
    assert.equal(await page.getByText('Выдача: Прокси выданы',{exact:true}).count(),0);
   }
   assert.equal(await page.evaluate(()=>document.documentElement.scrollWidth>innerWidth),false);
   assert.deepEqual(errors,[]);assert.equal(s.supplier_calls,1);
   console.log(`PASS ${s.kind} ${s.phase}: backend output rendered, no browser purchases`);
   await page.close();
  }
 }finally{await browser.close();}
})().catch(e=>{console.error(e);process.exit(1)});
