import { createRequire } from 'node:module';

const require = createRequire(import.meta.url);
const { classifyGameIntent, tryStaticReply } = require('../../server/hermes_client.js');

const cases = [
  ['show my Decibel account', 'decibel_account', ['decibel_get_account']],
  ['show my positions', 'decibel_account', ['decibel_get_account']],
  ['what orders do I have open?', 'decibel_account', ['decibel_get_account']],
  ['check my pnl on Decibel', 'decibel_account', ['decibel_get_account']],
  ['balance and equity please', 'decibel_account', ['decibel_get_account']],
  ['prices for BTC and ETH', 'decibel_markets', ['decibel_get_markets']],
  ['show Decibel markets', 'decibel_markets', ['decibel_get_markets']],
  ['mark price SOL', 'decibel_markets', ['decibel_get_markets']],
  ['open long BTC with 10 USDC at 5x', 'decibel_place_order', ['decibel_get_account', 'decibel_place_order']],
  ['long ETH 25 dollars 3x', 'decibel_place_order', ['decibel_get_account', 'decibel_place_order']],
  ['short SOL with 12 USDC', 'decibel_place_order', ['decibel_get_account', 'decibel_place_order']],
  ['buy APT notional 50', 'decibel_place_order', ['decibel_get_account', 'decibel_place_order']],
  ['sell BTC limit 80000 size 0.001', 'decibel_place_order', ['decibel_get_account', 'decibel_place_order']],
  ['open a trade', 'decibel_place_order', ['decibel_get_account', 'decibel_place_order']],
  ['place market order long ETH 5 usdc', 'decibel_place_order', ['decibel_get_account', 'decibel_place_order']],
  ['set leverage BTC 7x', 'decibel_leverage', ['decibel_get_positions', 'decibel_set_leverage']],
  ['change ETH leverage to 3x', 'decibel_leverage', ['decibel_get_positions', 'decibel_set_leverage']],
  ['close my BTC position', 'decibel_close_position', ['decibel_get_positions', 'decibel_close_position']],
  ['reduce ETH by 50 percent', 'decibel_close_position', ['decibel_get_positions', 'decibel_close_position']],
  ['close all SOL', 'decibel_close_position', ['decibel_get_positions', 'decibel_close_position']],
  ['cancel my BTC order', 'decibel_cancel_order', ['decibel_get_positions', 'decibel_cancel_order']],
  ['cancel order 123 on ETH', 'decibel_cancel_order', ['decibel_get_positions', 'decibel_cancel_order']],
  ['set tp 90000 sl 78000 BTC', 'decibel_tpsl', ['decibel_get_positions', 'decibel_set_tpsl']],
  ['take profit ETH 4000', 'decibel_tpsl', ['decibel_get_positions', 'decibel_set_tpsl']],
  ['stop loss SOL 120', 'decibel_tpsl', ['decibel_get_positions', 'decibel_set_tpsl']],
  ['відкрий лонг BTC на 10 USDC 5x', 'decibel_place_order', ['decibel_get_account', 'decibel_place_order']],
  ['покажи мої позиції', 'decibel_account', ['decibel_get_account']],
  ['закрий позицію ETH', 'decibel_close_position', ['decibel_get_positions', 'decibel_close_position']],
  ['скасуй ордер BTC', 'decibel_cancel_order', ['decibel_get_positions', 'decibel_cancel_order']],
  ['постав стоп лосс BTC 80000', 'decibel_tpsl', ['decibel_get_positions', 'decibel_set_tpsl']],
  ['плече ETH 4x', 'decibel_leverage', ['decibel_get_positions', 'decibel_set_leverage']],
  ['открой шорт SOL на 15 USDC', 'decibel_place_order', ['decibel_get_account', 'decibel_place_order']],
  ['покажи баланс decibel', 'decibel_account', ['decibel_get_account']],
  ['купить BTC на 20 usdc', 'decibel_place_order', ['decibel_get_account', 'decibel_place_order']],
  ['продать ETH short', 'decibel_place_order', ['decibel_get_account', 'decibel_place_order']],
  ['查看 BTC 价格', 'decibel_markets', ['decibel_get_markets']],
  ['开多 BTC 10 USDC', 'decibel_place_order', ['decibel_get_account', 'decibel_place_order']],
  ['平仓 ETH', 'decibel_close_position', ['decibel_get_positions', 'decibel_close_position']],
  ['BTC 杠杆 5x', 'decibel_leverage', ['decibel_get_positions', 'decibel_set_leverage']],
  ['set TP and SL for APT', 'decibel_tpsl', ['decibel_get_positions', 'decibel_set_tpsl']],
  ['what are your skills', 'skills', []],
  ['collect resources', 'collect_resources', []],
  ['attack a base', 'battle', []],
  ['attack egor4042007', 'targeted_battle', []],
  ['build my base', 'auto_build_base', []],
  ['build order for my base', 'auto_build_base', []],
  ['upgrade sawmill', 'upgrade', []],
  ['load troops into ships', 'fleet', []],
  ['hello', 'general', []],
  ['thanks', 'general', []],
  ['show positions and then attack a base', 'decibel_account', ['decibel_get_account']],
];

function includesExpectedTools(actual = [], expected = []) {
  return expected.every((tool) => actual.includes(tool));
}

const rows = [];
const failures = [];
for (const [message, expectedKind, expectedTools] of cases) {
  const intent = classifyGameIntent(message);
  const actualTools = Array.isArray(intent.expected_tools) ? intent.expected_tools : [];
  const ok = intent.kind === expectedKind && includesExpectedTools(actualTools, expectedTools);
  const row = {
    ok,
    message,
    expectedKind,
    actualKind: intent.kind,
    expectedTools,
    actualTools,
    actionRequired: !!intent.action_required,
  };
  rows.push(row);
  if (!ok) failures.push(row);
}

const staticReply = tryStaticReply('what are your skills');
const staticOk = /Decibel positions\/orders/.test(staticReply?.output_text || '');
if (!staticOk) {
  failures.push({
    ok: false,
    message: 'static skills reply',
    expectedKind: 'skills reply includes Decibel',
    actualKind: staticReply?.output_text || null,
    expectedTools: [],
    actualTools: [],
  });
}

const grouped = rows.reduce((acc, row) => {
  acc[row.actualKind] = (acc[row.actualKind] || 0) + 1;
  return acc;
}, {});

console.log(JSON.stringify({
  ok: failures.length === 0,
  total: rows.length,
  passed: rows.length - failures.length,
  failed: failures.length,
  grouped,
  failures,
  sample_routes: rows
    .filter((row) => row.expectedTools.length)
    .slice(0, 12)
    .map((row) => ({
      message: row.message,
      intent: row.actualKind,
      tools: row.actualTools,
    })),
}, null, 2));

if (failures.length) process.exit(1);
