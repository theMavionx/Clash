import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import test from 'node:test';

const component = await readFile(new URL('./src/components/trading/ImperialRouteCard.jsx', import.meta.url), 'utf8');
const css = await readFile(new URL('./src/components/trading/ImperialRouteCard.css', import.meta.url), 'utf8');
const terminal = await readFile(new URL('./src/components/FuturesPanel.jsx', import.meta.url), 'utf8');

test('Imperial route card exposes the authoritative auto-route decision and every candidate', () => {
  assert.match(component, /Auto-route&nbsp; ON/);
  assert.match(component, /quote\?\.reason/);
  assert.match(component, /quote\?\.candidates/);
  assert.match(component, /imperial-route-option__best/);
  assert.match(component, /aria-expanded=\{expanded\}/);
});

test('Imperial route cost comparison explains the complete API breakdown', () => {
  for (const label of [
    'Open fee',
    'Close fee',
    'Entry slippage',
    'Exit slippage',
    'Borrow',
    'Liquidation risk',
    'Boost loan',
    'Estimated total',
    'Deposit',
  ]) assert.match(component, new RegExp(label));
  assert.match(component, /costs\?\.pLiq/);
  assert.match(component, /number\(value\) \/ base \* 10_000/);
});

test('route comparison is bounded, responsive, and supports reduced motion', () => {
  assert.match(css, /\.imperial-route-list[\s\S]*?max-height:\s*250px;[\s\S]*?overflow:\s*auto;/);
  assert.match(css, /@media \(max-width:\s*480px\)/);
  assert.match(css, /@media \(prefers-reduced-motion:\s*reduce\)/);
});

test('terminal replaces the old route summary and accurately describes server-injected builder routing', () => {
  assert.match(terminal, /<ImperialRouteCard/);
  assert.doesNotMatch(terminal, /IMPERIAL SMART ROUTE/);
  assert.match(terminal, /No separate wallet approval is required\./);
  assert.match(terminal, /Imperial does not require a separate per-user builder approval\./);
  assert.match(terminal, /label: isRunning \? 'CONNECTING\.\.\.' : 'SIGN & CONNECT'/);
});
