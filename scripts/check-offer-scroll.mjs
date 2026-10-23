// Isolated browser fixture: no production API calls or Telegram authentication.
import {chromium} from 'playwright';
import {writeFileSync,unlinkSync} from 'node:fs';
import {createServer} from 'vite';
import assert from 'node:assert/strict';
const files=['scroll-fixture.html','scroll-fixture.tsx'];
writeFileSync(files[0],'<html><head><meta name="viewport" content="width=device-width,initial-scale=1"></head><body><div id="root"></div><script type="module" src="/vvd-cpa/scroll-fixture.tsx"></script></body></html>');
writeFileSync(files[1],`import React from 'react';import{createRoot}from'react-dom/client';import{MemoryRouter,Routes,Route}from'react-router-dom';import{OfferDetail}from'./src/pages/offers/OfferDetail';import'./src/index.css';createRoot(document.getElementById('root')).render(<div style={{minHeight:'100dvh'}}><MemoryRouter initialEntries={['/offers/test/test']}><Routes><Route path="/offers/:id/:offerId" element={<OfferDetail/>}/></Routes></MemoryRouter></div>);`);
const server=await createServer({server:{host:'127.0.0.1',port:3011,strictPort:true}});
let browser;
try{
 await server.listen();
 browser=await chromium.launch({headless:true});
 const page=await browser.newPage({viewport:{width:390,height:900},isMobile:true,hasTouch:true});
 await page.addInitScript(()=>{
   window.Telegram={WebApp:{initData:'LOCAL_FIXTURE',viewportHeight:600,onEvent:(name,fn)=>window.onTelegramResize=fn,offEvent:()=>{}}};
   Object.defineProperty(navigator,'clipboard',{value:{writeText:async text=>window.copied=text}});
 });
 await page.route('https://vvd-cpa-v2.onrender.com/**',route=>route.fulfill({json:route.request().url().includes('/cpa/links/')?{url:'https://example.test/r/test'}:{vertical:{is_active:true,cpa_link_allowed:true},offer:{id:'test',title:'Offer',description:'Описание '.repeat(100),geo:'All',hold_override_days:10}}}));
 await page.goto('http://127.0.0.1:3011/vvd-cpa/scroll-fixture.html');
 const scroller=page.getByTestId('offer-scroll');
 await page.getByLabel('sub1',{exact:true}).fill('tiktok');
 assert.equal(await scroller.evaluate(e=>e.clientHeight),600);
 await scroller.evaluate(e=>e.scrollTop=e.scrollHeight);
 const copy=page.getByRole('button',{name:'Скопировать',exact:true});
 const rect=await copy.boundingBox();
 assert(rect.y>=0&&rect.y+rect.height<=600,'Copy button must fit visible Telegram sheet');
 const card=await copy.evaluate(e=>{const r=e.closest('.glass-card-glow').getBoundingClientRect();return {bottom:r.bottom,height:r.height};});
 assert(card.bottom<=600,'Complete bottom edge of card must be reachable');
 assert(card.height>200,'Card must not shrink to hide its contents');
 const horizontal=page.getByLabel('Метки sub1–sub5');
 assert(await horizontal.evaluate(e=>e.scrollWidth>e.clientWidth));
 await horizontal.evaluate(e=>e.scrollLeft=e.scrollWidth);
 assert(await horizontal.evaluate(e=>e.scrollLeft>0));
 await copy.click();assert.equal(new URL(await page.evaluate(()=>window.copied)).searchParams.get('sub1'),'tiktok');
 await page.evaluate(()=>{window.Telegram.WebApp.viewportHeight=350;window.onTelegramResize();});
 await page.waitForFunction(()=>document.querySelector('[data-testid="offer-scroll"]').clientHeight===350);
 await page.evaluate(()=>{window.Telegram.WebApp.viewportHeight=600;window.onTelegramResize();});
 await page.waitForFunction(()=>document.querySelector('[data-testid="offer-scroll"]').clientHeight===600);
 assert(await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth));
 console.log('Passed: Telegram sheet height, full card bottom, copy button, horizontal tags and viewport resize.');
}finally{await browser?.close();await server.close();for(const file of files)unlinkSync(file);}
