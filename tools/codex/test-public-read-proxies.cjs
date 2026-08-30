// Public read-only compatibility check. Never prints proxy URLs/passwords.
// node tools/codex/test-public-read-proxies.cjs --file "path/to/proxies.txt" --all
const fs = require('node:fs');
const { HibachiProxyPool } = require('../../server-futures/hibachi-proxy-pool');
const { createPublicReadTransport } = require('../../server-futures/public-read-proxy');
const args = process.argv.slice(2);
const fileIndex = args.indexOf('--file');
const file = (fileIndex >= 0 ? args[fileIndex + 1] : '') || process.env.CLASH_PUBLIC_PROXY_FILE;
if (!file) throw new Error('--file or CLASH_PUBLIC_PROXY_FILE required');
const inventory = new HibachiProxyPool(fs.readFileSync(file, 'utf8').split(/\r?\n/));
const entries = args.includes('--all') ? inventory.entries : inventory.entries.slice(0, 5);
let cursor = 0;
const results = [];
async function worker() {
  while (cursor < entries.length) {
    const entry = entries[cursor++];
    const pool = new HibachiProxyPool([entry.proxyUrl], { readAttempts: 1 });
    const transport = createPublicReadTransport({ pool });
    const result = { id: entry.id };
    const targets = [
      ['rpc', 'https://rpc-gel.inkonchain.com/', { jsonrpc: '2.0', id: 1, method: 'eth_chainId', params: [] },
        json => json?.result === '0xdef1'],
      ['prices', 'https://archive.prod.nado.xyz/v1', { candlesticks: { product_id: 38, granularity: 300, limit: 2 } },
        json => json?.candlesticks?.length > 0 && json.candlesticks.every(row => Number(row.close_x18) > 0)],
    ];
    for (const [label, url, body, validate] of targets) {
      try {
        const response = await transport.fetch(url, { method: 'POST', headers: { 'content-type': 'application/json' },
          body: JSON.stringify(body), signal: AbortSignal.timeout(10000) });
        result[label] = { ok: response.ok && validate(await response.json()), status: response.status };
      } catch (error) { result[label] = { ok: false, code: error.code || error.name }; }
    }
    result.proxiedRequests = transport.stats().requests;
    await transport.close();
    results.push(result);
    if (results.length % 20 === 0) console.log(JSON.stringify({ checked: results.length,
      rpc: results.filter(row => row.rpc.ok).length, prices: results.filter(row => row.prices.ok).length }));
  }
}
(async () => {
  console.log(JSON.stringify({ configured: inventory.entries.length, checking: entries.length }));
  await Promise.all(Array.from({ length: 5 }, worker));
  const failures = results.filter(row => !row.rpc.ok || !row.prices.ok || row.proxiedRequests !== 2);
  console.log(JSON.stringify({ total: results.length, rpcPass: results.filter(row => row.rpc.ok).length,
    pricesPass: results.filter(row => row.prices.ok).length, failures }, null, 2));
  if (failures.length) process.exitCode = 1;
})().catch(error => { console.error(error.name); process.exitCode = 1; });
