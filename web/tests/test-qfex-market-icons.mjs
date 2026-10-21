// QFEX market icons: equity namespace, local artwork, no crypto homonyms.
// Run: node tests/test-qfex-market-icons.mjs
import assert from 'node:assert/strict';
import { existsSync, readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { canonTokenSymbol, equityIconSymbol, tokenLabelSymbol, tokenLogoSources } from '../src/lib/tokenLogos.js';

const publicDir = fileURLToPath(new URL('../public', import.meta.url));
const localFiles = sources => sources.filter(src => src.startsWith('/tokens/'));

// Stocks quoted in local currency normalize to their base ticker; FX stays a pair.
assert.equal(canonTokenSymbol('SAMSUNG-KRW'), 'SAMSUNG');
assert.equal(canonTokenSymbol('KIOXIA-JPY'), 'KIOXIA');
assert.equal(canonTokenSymbol('USD-JPY'), 'USDJPY');
assert.equal(equityIconSymbol('EUR'), '', 'FX bases keep the FX badge');
assert.equal(equityIconSymbol('US100'), 'EQ:US100');
assert.equal(tokenLabelSymbol('EQ:US100'), 'US100');

// Every QFEX picker symbol from the production report resolves to real local artwork.
for (const base of ['US100', 'US500', 'COPPER', 'SPCX', 'NATGAS', 'CL', 'TLT', 'TSLA', 'AMD', 'MU', 'NIKKEI', 'KOSPI', 'SAMSUNG', 'SOXL', 'SMH', 'GOLD', 'NFLX']) {
  const files = localFiles(tokenLogoSources(equityIconSymbol(base)));
  assert.ok(files.length, `${base} has local artwork`);
  assert.ok(files.some(file => existsSync(`${publicDir}${file}`)), `${base} artwork file exists`);
}

// Crypto homonyms (SOPH = SOPHiA Genetics on QFEX, PURR = Hyperliquid Strategies) never get the crypto logo.
for (const base of ['SOPH', 'ZETA', 'PURR', 'QNT', 'GME']) {
  const sources = tokenLogoSources(equityIconSymbol(base));
  assert.deepEqual(localFiles(sources), [], `${base} uses no crypto artwork`);
  assert.ok(sources.at(-1).startsWith('data:image/svg+xml'), `${base} falls back to a ticker badge`);
  assert.ok(decodeURIComponent(sources.at(-1)).includes(`>${base}<`), `${base} badge shows the plain ticker`);
}
// Unknown equities get a badge without any network probe.
assert.ok(tokenLogoSources('EQ:JPM').every(src => src.startsWith('data:')));

// Every listed equity file exists and has the declared format.
const source = readFileSync(fileURLToPath(new URL('../src/lib/tokenLogos.js', import.meta.url)), 'utf8');
const listed = [...source.match(/const EQUITY_LOGOS = \{([\s\S]*?)\};/)[1].matchAll(/([A-Z0-9]+): '(svg|png)'/g)];
assert.ok(listed.length >= 50);
for (const [, symbol, ext] of listed) {
  const bytes = readFileSync(`${publicDir}/tokens/equity/${symbol}.${ext}`);
  if (ext === 'png') assert.equal(bytes.subarray(0, 4).toString('hex'), '89504e47', symbol);
  else assert.match(bytes.subarray(0, 300).toString('utf8'), /<svg/, symbol);
}
console.log(`PASS QFEX market icons: ${listed.length} equity logos, homonym guard, FX and local-currency symbols`);
