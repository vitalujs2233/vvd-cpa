const {chromium}=require('playwright');
const assert=require('node:assert/strict');
const fs=require('node:fs');
(async()=>{
  fs.mkdirSync('proxy-screenshots',{recursive:true});
  const browser=await chromium.launch();
  try {
    for(const width of [320,390]){
      const page=await browser.newPage({viewport:{width,height:844},deviceScaleFactor:1});
      const errors=[];page.on('pageerror',e=>errors.push(e.message));
      // Fixture may only read resources from the local test server.
      await page.route('**/*',r=>r.request().url().startsWith('http://127.0.0.1:3011/')?r.continue():r.abort());
      await page.goto('http://127.0.0.1:3011/vvd-cpa/tests/proxy-delivery-preview.html'+(width===320?'?partial':''));
      await page.getByRole('button',{name:'Посмотреть мои прокси'}).click();
      await page.getByRole('button',{name:'Показать пароль'}).waitFor();
      assert.equal(await page.getByText('example-only',{exact:true}).count(),0);
      assert.equal(await page.evaluate(()=>document.documentElement.scrollWidth>innerWidth),false,'horizontal overflow');
      await page.screenshot({path:`proxy-screenshots/proxy-${width}.png`,fullPage:true});
      await page.getByRole('button',{name:'Показать пароль'}).click();
      await page.getByText('example-only',{exact:true}).waitFor();
      await page.getByRole('button',{name:'Скрыть пароль'}).click();
      assert.equal(await page.getByText('example-only',{exact:true}).count(),0);
      assert.deepEqual(errors,[]);
      console.log(`PASS ${width}px: no overflow, password reveal/hide, no browser errors`);
      await page.close();
    }
  }finally{await browser.close();}
})().catch(e=>{console.error(e);process.exit(1);});
