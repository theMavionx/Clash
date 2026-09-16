'use strict';
// Read-only diagnostic. Never logs proxy URLs, credentials, bodies or exit IPs.
const fs = require('node:fs');
const {fetch, ProxyAgent} = require('undici');
const {HibachiProxyPool, proxySourceLines} = require('./hibachi-proxy-pool');

async function main() {
  const file = process.argv[2] || process.env.HIBACHI_PROXY_FILE;
  if (!file) throw new Error('Pass the protected proxy file path.');
  const pool = new HibachiProxyPool(proxySourceLines({HIBACHI_PROXY_FILE:file}));
  if (!pool.configured) throw new Error('Proxy pool is empty.');
  const results = [];
  let cursor = 0;
  await Promise.all(Array.from({length:2}, async () => {
    while (cursor < pool.entries.length) {
      const index = cursor++;
      const entry = pool.entries[index];
      const dispatcher = new ProxyAgent(entry.proxyUrl);
      const result = {row:index+1, proxyId:entry.id};
      try {
        for (const [name,url] of [
          ['market','https://data-api.hibachi.xyz/market/exchange-info'],
          ['accountOrigin','https://api.hibachi.xyz/auth/csrf'],
        ]) {
          const started = Date.now();
          try {
            const response = await fetch(url, {dispatcher, redirect:'error', signal:AbortSignal.timeout(8000)});
            const data = await response.json();
            const valid = name === 'market' ? Array.isArray(data.futureContracts)
              : data.status === 'success' && typeof data.data?.state === 'string';
            result[name] = {ok:response.ok && valid, status:response.status, latencyMs:Date.now()-started};
            if (response.status === 429) result[name].rateLimited = true;
          } catch (error) {
            const code = String(error?.cause?.code || error?.code || error?.name || 'TRANSPORT_ERROR');
            result[name] = {ok:false, code:/^[A-Z_a-z0-9]+$/.test(code) ? code : 'TRANSPORT_ERROR', latencyMs:Date.now()-started};
          }
          await new Promise(resolve=>setTimeout(resolve,500));
        }
      } finally { await dispatcher.destroy(); }
      results.push(result);
      if (results.length % 10 === 0) process.stderr.write(`Checked ${results.length}/${pool.entries.length} proxies\n`);
    }
  }));
  results.sort((a,b)=>a.row-b.row);
  const report = {checkedAt:new Date().toISOString(), location:'local workstation', total:results.length,
    marketPassed:results.filter(r=>r.market.ok).length,
    accountOriginPassed:results.filter(r=>r.accountOrigin.ok).length,
    bothPassed:results.filter(r=>r.market.ok && r.accountOrigin.ok).length,
    note:'Public unauthenticated checks only; does not prove account permissions or production VPS reachability.', results};
  const output = JSON.stringify(report,null,2);
  if (process.argv[3]) fs.writeFileSync(process.argv[3], output+'\n');
  console.log(JSON.stringify({...report,results:undefined}));
}
main().catch(()=>{console.error('Proxy diagnostic failed; verify the file and dependency setup. No credentials printed.');process.exitCode=1;});
