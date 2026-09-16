'use strict';
const assert = require('node:assert/strict');
const test = require('node:test');
process.env.HIBACHI_WS_ENABLED = 'false';
const hibachi = require('./hibachi');
const creds = {apiKey:'fixture-key',accountId:7,privateKey:'fixture-secret'};
test('funding uses authenticated bounded settlement read and preserves signed decimal values', async () => {
  const oldFetch=global.fetch;
  hibachi.__testing.resetCaches();
  const calls=[];
  global.fetch=async (url,opts)=>{
    calls.push({url:String(url),opts});
    return new Response(JSON.stringify({settlements:[{symbol:'BTC/USDT-P',direction:'Long',quantity:'0.00123456789',settledAmount:'-0.00000123',timestamp:1789540000000}]}),{status:200});
  };
  try {
    const result=await hibachi.getAccountFundingHistory(creds,{limit:10000});
    assert.equal(calls.length,1);
    const url=new URL(calls[0].url);
    assert.equal(url.pathname,'/trade/account/settlements_history');
    assert.equal(url.searchParams.get('limit'),'100');
    assert.equal(url.searchParams.get('accountId'),'7');
    assert.equal(result[0].symbol,'BTC');
    assert.equal(result[0].payout,'-0.00000123');
    assert.equal(result[0].amount,'0.00123456789');
    assert.equal(result[0].rate,null);
    assert.equal(result[0].side,'bid');
    await hibachi.getAccountFundingHistory(creds,{limit:10000});
    assert.equal(calls.length,1,'repeat read reuses cache');
  } finally {global.fetch=oldFetch;hibachi.__testing.resetCaches();}
});
test('malformed funding response is not silently displayed as empty history',async()=>{
  const oldFetch=global.fetch;
  hibachi.__testing.resetCaches();
  global.fetch=async()=>new Response(JSON.stringify({unexpected:[]}),{status:200});
  try {await assert.rejects(()=>hibachi.getAccountFundingHistory(creds),/Unexpected Hibachi/);}
  finally {global.fetch=oldFetch;hibachi.__testing.resetCaches();}
});
test('missing settlement amount cannot become a misleading zero payment',async()=>{
  const oldFetch=global.fetch;
  hibachi.__testing.resetCaches();
  global.fetch=async()=>new Response(JSON.stringify({settlements:[{symbol:'BTC',direction:'Long',quantity:'1',timestamp:1789540000000}]}),{status:200});
  try {await assert.rejects(()=>hibachi.getAccountFundingHistory(creds),/Invalid Hibachi/);}
  finally {global.fetch=oldFetch;hibachi.__testing.resetCaches();}
});
