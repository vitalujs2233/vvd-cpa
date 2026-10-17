import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import ts from 'typescript';
const file=readFileSync('src/pages/stats/countrySorting.ts','utf8');
const {outputText}=ts.transpileModule(file,{compilerOptions:{module:ts.ModuleKind.CommonJS,target:ts.ScriptTarget.ES2020}});
const module={exports:{}};
Function('module','exports',outputText)(module,module.exports);
const {sortCountries}=module.exports;
const rows=[{country_code:'LV',country_name:'Латвия',clicks:3},{country_code:'DE',country_name:'Германия',clicks:7},{country_code:null,country_name:'Не определена',clicks:1}];
assert.deepEqual(sortCountries(rows,'desc').map(r=>r.clicks),[7,3,1]);
assert.deepEqual(sortCountries(rows,'asc').map(r=>r.clicks),[1,3,7]);
assert.deepEqual(rows.map(r=>r.clicks),[3,7,1]);
const ui=readFileSync('src/pages/stats/Stats.tsx','utf8');
for(const label of ['Клики','Конверсии','CR','EPC','Заработано','На удержании','Доступно к выводу','Последние клики','География трафика'])assert.ok(ui.includes(label),label);
for(const privateLabel of ['CPA Gross','Комиссия VVD 20%','Партнёр 80%','CPA Ledger'])assert.ok(!ui.includes(privateLabel),privateLabel);
assert.ok(ui.includes('grid grid-cols-2'));
assert.ok(ui.includes('min-w-0'));
assert.ok(ui.includes('Показать ещё'));
console.log('Stage 6 compact mobile UI and sorting checks passed');

// Historical clicks must not collapse into tiny unlabeled bars on iPhone.
assert.ok(ui.includes("totalVisible.toLocaleString('ru-RU')"));
assert.ok(ui.includes("visibleDays.length"));
assert.ok(ui.includes("overflow-x-auto"));
assert.ok(ui.includes("w-[7px]"));
assert.ok(ui.includes("Макс. в день"));

import {readdirSync} from 'node:fs';
import {join} from 'node:path';

// Verify actual Tailwind output, not just the TSX classname.
assert.ok(ui.includes('bg-accentGold border-t border-white/25'));
const cssDir='dist/assets';
const cssFiles=readdirSync(cssDir).filter(name=>name.endsWith('.css'));
assert.ok(cssFiles.length>0,'Vite emitted no CSS bundle');
const compiled=cssFiles.map(name=>readFileSync(join(cssDir,name),'utf8')).join('\n');
const goldRule=compiled.match(/\.bg-accentGold\s*\{([^}]+)\}/);
assert.ok(goldRule,'Generated CSS must contain .bg-accentGold rule');
assert.ok(/background-color/.test(goldRule[1]),'Compiled CSS must set background-color');
assert.ok(/212\s+175\s+55|#d4af37/i.test(goldRule[1]),'Compiled bar background must use VVD gold #D4AF37');


// GEO keeps its controls outside a bounded, touch-scrollable list.
const geoStart=ui.indexOf('География трафика');
const recentStart=ui.indexOf('Последние клики',geoStart);
assert.ok(geoStart>=0&&recentStart>geoStart,'GEO must precede recent clicks');
const geo=ui.slice(geoStart,recentStart);
const listStart=geo.indexOf('data-testid="geo-scroll-list"');
assert.ok(listStart>geo.indexOf('aria-label="Сортировка стран"'),'GEO sort control must remain above scroll container');
assert.match(geo,/max-h-\[300px\]/,'GEO list limited to 300px');
assert.match(geo,/overflow-y-auto/,'GEO uses internal vertical scrolling');
assert.match(geo,/overflow-x-hidden/,'GEO prevents horizontal scrolling');
assert.match(geo,/overscroll-y-auto/,'GEO allows page scroll chaining at its boundaries');
assert.match(geo,/touch-pan-y/,'GEO allows finger panning');
assert.ok(geo.includes("WebkitOverflowScrolling:'touch'"),'GEO enables iOS momentum scrolling');
assert.ok(geo.includes('orderedCountries.map'),'All countries remain rendered regardless of viewport');
assert.ok(geo.includes('countryFlag(c.country_code)')&&geo.includes('c.country_name')&&geo.includes('c.clicks.toLocaleString'),'GEO retains flag, name and count');
const many=Array.from({length:200},(_,i)=>({country_code:String(i),country_name:'Country '+i,clicks:(i*37)%241}));
for(const direction of ['asc','desc']){
 const sorted=sortCountries(many,direction);
 assert.equal(sorted.length,200,'Sorting retains all 200 countries');
 for(let i=1;i<sorted.length;i++)assert.ok(direction==='asc'?sorted[i-1].clicks<=sorted[i].clicks:sorted[i-1].clicks>=sorted[i].clicks,'Sort direction must apply to every country, including offscreen entries');
}
console.log('Stage 7 GEO bounded iPhone scroll and full-list sorting checks passed');
