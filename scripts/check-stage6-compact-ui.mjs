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
assert.ok(/212\\s+175\\s+55|#d4af37/i.test(goldRule[1]),'Compiled bar background must use VVD gold #D4AF37');
