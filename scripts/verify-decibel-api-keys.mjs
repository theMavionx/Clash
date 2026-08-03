#!/usr/bin/env node

import fs from 'node:fs';
import path from 'node:path';
import { createRequire } from 'node:module';
import { fileURLToPath } from 'node:url';

const here = path.dirname(fileURLToPath(import.meta.url));
const root = path.resolve(here, '..');
const requireFromFutures = createRequire(path.join(root, 'server-futures', 'package.json'));
const WebSocket = requireFromFutures('ws');
const HTTP = 'https://api.mainnet.aptoslabs.com/decibel';
const WS = 'wss://api.mainnet.aptoslabs.com/decibel/ws';

function loadEnv(file) {
  if (!fs.existsSync(file)) return;
  for (const line of fs.readFileSync(file, 'utf8').split(/\r?\n/u)) {
    const match = line.match(/^\s*([A-Za-z_][A-Za-z0-9_]*)\s*=\s*(.*?)\s*$/u);
    if (!match || process.env[match[1]] != null) continue;
    process.env[match[1]] = match[2].replace(/^['"]|['"]$/gu, '');
  }
}

function splitKeys(value) {
  return String(value || '').split(/[\s,;]+/u).map(key => key.trim()).filter(Boolean);
}

function configuredKeys() {
  return [...new Set([
    ...splitKeys(process.env.DECIBEL_API_KEY),
    ...splitKeys(process.env.DECIBEL_API_KEYS),
    ...splitKeys(process.env.APTOS_NODE_API_KEY),
    ...splitKeys(process.env.APTOS_NODE_API_KEYS),
    ...splitKeys(process.env.VITE_APTOS_NODE_API_KEY),
    ...splitKeys(process.env.VITE_APTOS_NODE_API_KEYS),
  ])];
}

async function readJson(pathname, key) {
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), 8_000);
  try {
    const response = await fetch(`${HTTP}${pathname}`, {
      headers: { Authorization: `Bearer ${key}`, accept: 'application/json' },
      signal: controller.signal,
    });
    const payload = response.ok ? await response.json() : null;
    return {
      status: response.status,
      rows: Array.isArray(payload) ? payload.length : 0,
      payload,
    };
  } finally {
    clearTimeout(timeout);
  }
}

function marketAddress(markets) {
  const first = Array.isArray(markets) ? markets[0] : null;
  return String(
    first?.market_addr ?? first?.market_address ?? first?.market ?? first?.address ?? '',
  ).trim().toLowerCase();
}

function verifyDepthSocket(key, marketAddr) {
  return new Promise((resolve, reject) => {
    const socket = new WebSocket(WS, ['decibel', key]);
    const timeout = setTimeout(() => {
      socket.terminate();
      reject(new Error('depth timeout'));
    }, 10_000);
    const finish = (error, value) => {
      clearTimeout(timeout);
      socket.removeAllListeners();
      socket.terminate();
      if (error) reject(error);
      else resolve(value);
    };
    socket.once('open', () => {
      socket.send(JSON.stringify({ method: 'subscribe', topic: `depth:${marketAddr}:1` }));
    });
    socket.on('message', (raw) => {
      try {
        const payload = JSON.parse(String(raw || ''));
        if (payload?.success === false) {
          finish(new Error(payload.error || 'subscription rejected'));
          return;
        }
        if (Array.isArray(payload?.bids) || Array.isArray(payload?.asks)) {
          finish(null, {
            bids: Array.isArray(payload.bids) ? payload.bids.length : 0,
            asks: Array.isArray(payload.asks) ? payload.asks.length : 0,
          });
        }
      } catch (error) {
        finish(error);
      }
    });
    socket.once('error', error => finish(error));
    socket.once('close', code => finish(new Error(`socket closed (${code})`)));
  });
}

loadEnv(path.join(root, 'server-futures', '.env'));
loadEnv(path.join(root, 'web', '.env'));

const keys = configuredKeys();
if (!keys.length) throw new Error('No Decibel/Aptos API keys are configured');

const keyResults = [];
const workingKeys = [];
for (let index = 0; index < keys.length; index += 1) {
  try {
    const result = await readJson('/api/v1/prices', keys[index]);
    const ok = result.status === 200 && result.rows > 0;
    keyResults.push({ key_index: index + 1, status: result.status, rows: result.rows, ok });
    if (ok) workingKeys.push({ key: keys[index], keyIndex: index + 1 });
  } catch (error) {
    keyResults.push({ key_index: index + 1, status: 0, rows: 0, ok: false, error: error.name });
  }
}

if (!workingKeys.length) {
  console.log(JSON.stringify({ key_count: keys.length, keys: keyResults }, null, 2));
  throw new Error('No configured Decibel API key passed the live prices read');
}

const [markets, contexts, prices] = await Promise.all([
  readJson('/api/v1/markets', workingKeys[0].key),
  readJson('/api/v1/asset_contexts', workingKeys[0].key),
  readJson('/api/v1/prices', workingKeys[0].key),
]);
const address = marketAddress(markets.payload);
if (markets.status !== 200 || !markets.rows || contexts.status !== 200 || !contexts.rows
  || prices.status !== 200 || !prices.rows || !address) {
  throw new Error('Decibel markets/asset_contexts live surface is incomplete');
}
const firstMarket = Array.isArray(markets.payload) ? markets.payload[0] : null;
const marketName = String(firstMarket?.market_name ?? firstMarket?.marketName ?? '').trim();
const ticker = marketName
  ? `${marketName.split(/[-/]/u)[0].replace(/[^A-Za-z0-9]/gu, '').toUpperCase()}-PERP`
  : '';
const orderbookChecks = [];
for (const query of [
  `market=${encodeURIComponent(address)}`,
  ...(ticker ? [`ticker_id=${encodeURIComponent(ticker)}`] : []),
]) {
  const result = await readJson(`/api/v1/orderbook?${query}`, workingKeys[0].key);
  orderbookChecks.push({
    query: query.split('=')[0],
    status: result.status,
    bids: Array.isArray(result.payload?.bids) ? result.payload.bids.length : 0,
    asks: Array.isArray(result.payload?.asks) ? result.payload.asks.length : 0,
  });
}
let depth = null;
for (const candidate of workingKeys) {
  try {
    depth = await verifyDepthSocket(candidate.key, address);
    const row = keyResults.find(item => item.key_index === candidate.keyIndex);
    if (row) row.websocket = 'ok';
    break;
  } catch (error) {
    const match = String(error?.message || '').match(/\b(401|403|429)\b/u);
    const row = keyResults.find(item => item.key_index === candidate.keyIndex);
    if (row) row.websocket = match ? `http_${match[1]}` : 'failed';
  }
}
if (!depth) {
  console.log(JSON.stringify({
    key_count: keys.length,
    keys: keyResults,
    markets: markets.rows,
    asset_contexts: contexts.rows,
  }, null, 2));
  throw new Error('No configured Decibel API key passed the live depth WebSocket read');
}

console.log(JSON.stringify({
  key_count: keys.length,
  keys: keyResults,
  markets: markets.rows,
  asset_contexts: contexts.rows,
  prices: prices.rows,
  orderbook: orderbookChecks,
  sample: {
    context: Array.isArray(contexts.payload) ? contexts.payload[0] : null,
    price: Array.isArray(prices.payload) ? prices.payload[0] : null,
  },
  depth,
}, null, 2));
