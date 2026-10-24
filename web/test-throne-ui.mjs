// Minimal Throne UI render checks (setup screen, standing card, venue registry). No network.
// Run: node --test test-throne-ui.mjs
import { test, after } from 'node:test';
import assert from 'node:assert/strict';
import { fileURLToPath } from 'node:url';
import { existsSync, readFileSync } from 'node:fs';
import { createServer } from 'vite';
import react from '@vitejs/plugin-react';
import React from 'react';
import { renderToStaticMarkup } from 'react-dom/server';

const root = fileURLToPath(new URL('./', import.meta.url));
const server = await createServer({ root, configFile: false, plugins: [react()], logLevel: 'silent',
  server: { middlewareMode: true, hmr: false }, appType: 'custom' });
after(() => server.close());
test('setup screen offers one-tap wallet connect and a deposit link', async () => {
  const { default: ThroneSetup } = await server.ssrLoadModule('/src/components/trading/ThroneSetup.jsx');
  const html = renderToStaticMarkup(React.createElement(ThroneSetup, { connectWithWallet: () => {}, evmAddress: '0x38c8af2baf91998349f0b291fad7301af5a6541e' }));
  assert.match(html, /Connect Throne/u);
  assert.match(html, /Connect with wallet/u);
  assert.match(html, /0x38c8…541e/u);
  assert.match(html, /href="https:\/\/throne.network"/u);
  assert.match(html, /src="\/throne-logo.png"/u);
  const busy = renderToStaticMarkup(React.createElement(ThroneSetup, { connectWithWallet: () => {}, loading: true, onboardingStep: 'Sign to create your Throne account…' }));
  assert.match(busy, /Sign to create your Throne account/u);
  assert.match(renderToStaticMarkup(React.createElement(ThroneSetup, { restoring: true })), /Loading your Throne account/u);
});

test('standing card renders nothing without an address and a loading state with one', async () => {
  const { default: ThroneStandingCard } = await server.ssrLoadModule('/src/components/trading/ThroneStandingCard.jsx');
  assert.equal(renderToStaticMarkup(React.createElement(ThroneStandingCard, { address: '' })), '');
  const html = renderToStaticMarkup(React.createElement(ThroneStandingCard, { address: '0x38c8af2baf91998349f0b291fad7301af5a6541e', token: 't' }));
  assert.match(html, /Throne board/u);
  assert.match(html, /Loading standing/u);
});

test('Throne is registered as a venue with its local logo', async () => {
  const source = readFileSync(new URL('./src/contexts/DexContext.jsx', import.meta.url), 'utf8');
  assert.match(source, /throne: \{\s*id: 'throne', label: 'Throne'/u);
  assert.match(source, /logo: '\/throne-logo.png'/u);
  assert.ok(existsSync(new URL('./public/throne-logo.png', import.meta.url)));
  const png = readFileSync(new URL('./public/throne-logo.png', import.meta.url));
  assert.deepEqual([...png.subarray(1, 4)], [0x50, 0x4e, 0x47]);
});
