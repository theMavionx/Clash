import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import vm from 'node:vm';
import React from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import { transformWithOxc } from 'vite';
import { fmtTime, fmtUsd } from './src/admin/tournamentUtils.js';

const source = readFileSync(new URL('./src/admin/TradingDiagnostics.jsx', import.meta.url), 'utf8')
  .replace(/^import .*;\r?\n/gm, '').replace('export default function', 'function');
const { code } = await transformWithOxc(source, 'TradingDiagnostics.jsx', { jsx: { runtime: 'classic' } });
const Component = vm.runInNewContext(`${code}\nTradingDiagnostics;`, { React, fmtTime, fmtUsd });
const render = row => renderToStaticMarkup(React.createElement(Component, { row }));
const data = {
  observed_at: '2026-09-06T12:00:00Z',
  executions: { status: 'available', trades: 4, volume_usd: 400, signer_evidence: 'server_verified_order_signer',
    signer_breakdown: [{ signer_mode: 'one_tap', trades: 2 }, { signer_mode: 'owner', trades: 1 }, { signer_mode: 'unknown', trades: 1 }] },
  submissions: { status: 'available', orders: 6, signer_breakdown: [{ signer_mode: 'one_tap', orders: 6 }] },
  rewards: { status: 'available', accounts: 1, paid_gold: 100, pending_gold: 25, earned_gold: 125 },
  claims: { status: 'available', attempts: 1, last_claim_at: '2026-09-06 12:00:00',
    recent: [{ result: 'paid', credited_trade_count: 4, total_gold_paid: 100 }] },
};
const bulk = { dex: 'bulk', builder_enabled: false, builder_fee_bps: 1, effective_builder_fee_bps: 0,
  address: 'RecipientFixture', exact: false, estimated_fee_usd: 0.01, trades: 1, volume_usd: 100, trading_diagnostics: data };
const html = render(bulk);
for (const text of ['Clash-routed verified fills: 4', 'Executed fills: one-tap 2', 'Submitted orders: one-tap 6',
  'Builder disabled', 'Effective fee 0 bps', 'Recipient readiness: unverified', 'exact total unknown', 'Builder-attributed indexed fills: 1',
  '100 paid', '25 pending', 'Latest result: paid', 'storage overflow only', 'not submit, repair, import or claim']) assert(html.includes(text), text);
assert(!html.includes('<button'), 'read-only diagnostics have no trading/repair controls');
assert(html.includes('<details') && html.includes('<summary'), 'compact accessible disclosure');

const imperial = render({ dex: 'imperial', builder_code: 'CLASH', builder_status: 'active', exact: true, earned_usd: 1.25,
  trading_diagnostics: { ...data, executions: { ...data.executions, signer_evidence: 'not_recorded' },
    submissions: { ...data.submissions, signer_evidence: 'not_recorded' },
    claims: { status: 'available', attempts: 0, recent: [] } } });
assert(imperial.includes('Builder CLASH · active'));
assert(imperial.includes('Executed fills: signer evidence not recorded'));
assert(imperial.includes(`Revenue: ${fmtUsd(1.25, 4)} exact`));
assert(imperial.includes('none recorded'));
assert(imperial.includes('No claim record does not mean no eligible trades'));
const missing = render({ ...bulk, trading_diagnostics: { observed_at: data.observed_at } });
assert(missing.includes('Verified fill index unavailable'));
assert(missing.includes('Gold ledger unavailable'));
assert(missing.includes('Claim telemetry unavailable'));
assert(render({ dex: 'imperial', trading_diagnostics: { observed_at: data.observed_at } }).includes('Builder-attributed indexed fills: Unknown'));
assert.equal(render({ dex: 'bulk' }), '');
console.log('Trading diagnostics UI: actual React SSR covers builder-disabled, one-tap/owner/unknown, exact/unknown, Gold and missing data.');
