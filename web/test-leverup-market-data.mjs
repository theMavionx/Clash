import test from 'node:test';
import assert from 'node:assert/strict';
import vm from 'node:vm';
import {readFileSync} from 'node:fs';
import {formatUnits} from 'viem';
const server=readFileSync(new URL('../server-futures/leverup.js',import.meta.url),'utf8');
const hook=readFileSync(new URL('./src/hooks/useLeverup.js',import.meta.url),'utf8');
test('LeverUp oracle prices carry marked-to-market OI; unavailable OI is not fabricated as zero',async()=>{
  let available=true;
  const c=vm.createContext({formatUnits,LEVERUP_SERVICE_URL:'fixture',isEvmAddress:()=>true,
    getMarketInfo:async()=>[{symbol:'BTC',pairBase:'0xabc',long_open_interest_qty:2,short_open_interest_qty:3,open_interest_available:available}],
    request:async()=>({prices:{'0xabc':String(80000n*10n**18n)}})});
  vm.runInContext(server.slice(server.indexOf('async function getPrices()'),server.indexOf('async function getAccountByAddress'))+'\nglobalThis.read=getPrices;',c);
  let rows=await c.read();assert.equal(rows[0].oracle_price,80000);assert.equal(rows[0].open_interest_usd,400000);
  available=false;rows=await c.read();assert.equal(rows[0].open_interest_usd,null);
});
test('hook maps the official oracle price to the actual terminal field',async()=>{
  let rows;
  const c=vm.createContext({useCallback:f=>f,normalizeSymbol:s=>s,pricesRef:{current:[]},setPrices:r=>rows=r,
    fetchJson:async()=>[{symbol:'BTC',mark_price:80000,oracle_price:80001,open_interest_usd:400000}]});
  vm.runInContext(hook.slice(hook.indexOf('  const fetchPrices ='),hook.indexOf('  const fetchAccount ='))+'\nglobalThis.read=fetchPrices;',c);
  await c.read();assert.equal(rows[0].oracle,'80001');assert.equal(rows[0].open_interest_usd,400000);
});
