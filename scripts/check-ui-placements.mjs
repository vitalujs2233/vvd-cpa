import { readFileSync } from 'node:fs';
import assert from 'node:assert/strict';

const home = readFileSync('src/pages/home/Home.tsx', 'utf8');
const app = readFileSync('src/App.tsx', 'utf8');
const market = readFileSync('src/pages/tools/MarketplacePages.tsx', 'utf8');
const studio = readFileSync('src/pages/tools/AIStudio.tsx', 'utf8');
const api = readFileSync('backend_v2/tools_marketplace.py', 'utf8');

assert.doesNotMatch(home, /StarsTopup|StarsWallet|ToolsTopup|Пополнить|Баланс инструментов/i,
  'Home must never contain tools wallet or top-up');
assert.match(home, /amount\(balance\?\.available\)/);
assert.match(home, /handleDvizhClick/);
assert.match(app, /to="\/tools"/);
assert.match(app, /path="dvizh"/);
for (const route of ['topup','history','purchases','numbers','proxy','ai']) {
  assert.match(app, new RegExp('path="'+route+'"'));
}
assert.match(market, /Баланс инструментов/);
assert.match(market, /usd\(w\.value\.available\)/);
assert.match(market, /Пополнить/);
assert.doesNotMatch(market, /StarsWallet|openStarsInvoice/);
assert.match(studio, /Новый персонаж/);
assert.match(studio, /Выбрать мой смартлинк|Выбрать ссылку/);
assert.match(readFileSync('src/pages/tools/PublicAIChat.tsx','utf8'), /Виртуальный собеседник/);
assert.match(api, /require_telegram_id/);
assert.match(api, /Поставщик не подключён/);
console.log('Marketplace placement and disabled fulfillment checks passed.');
