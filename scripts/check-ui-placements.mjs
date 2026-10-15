import { readFileSync } from 'node:fs';
import assert from 'node:assert/strict';

const home = readFileSync('src/pages/home/Home.tsx', 'utf8');
const app = readFileSync('src/App.tsx', 'utf8');
const tools = readFileSync('src/pages/tools/Tools.tsx', 'utf8');
const topup = readFileSync('src/pages/tools/ToolsTopup.tsx', 'utf8');

assert.doesNotMatch(home, /StarsTopup|StarsWallet|ToolsTopup|Пополнить|Баланс инструментов/i,
  'Home must never contain the tools payment wallet');
assert.match(home, /balance\.available\.toFixed\(2\)/,
  'Home must preserve the CPA dollar balance');
assert.match(home, /handleDvizhClick/);
assert.match(home, /<Flame size=/);
assert.match(app, /to="\/tools"/);
assert.match(app, /path="dvizh"/);
assert.match(app, /path="tools"/);
assert.match(tools, /Баланс инструментов/);
assert.match(tools, /<ToolsTopup\s*\/>/);
assert.match(topup, /Пополнить/);
assert.match(topup, /createStarsInvoice/);
assert.match(topup, /openStarsInvoice/);

console.log('UI placement verified: Home unchanged, wallet and top-up confined to Tools.');
