const {test}=require('node:test'),assert=require('node:assert/strict');
const {fetchChartHistory}=require('./chart-history');
const query={symbol:'Crypto.BTC/USD',resolution:'5',from:1000,to:2000};
const response=data=>({ok:true,json:async()=>data});
test('native execution-venue candles preserve namespaced instruments and all six timeframes',async()=>{
 for(const [resolution,interval] of [['1','1m'],['5','5m'],['15','15m'],['60','1h'],['240','4h'],['1D','1d']]){
  const data=await fetchChartHistory({...query,symbol:'Hyperliquid.xyz:GOLD',resolution},{fetchImpl:async(url,options)=>{
   assert.equal(url,'https://api.hyperliquid.xyz/info');assert.equal(options.method,'POST');
   assert.deepEqual(JSON.parse(options.body),{type:'candleSnapshot',req:{coin:'xyz:GOLD',interval,startTime:1000000,endTime:2000000}});
   return response([{s:'xyz:GOLD',i:interval,t:1500000,o:'10',h:'12',l:'9',c:'11',v:'2'},
    {s:'xyz:NVDA',i:interval,t:1600000,o:'10',h:'12',l:'9',c:'11',v:'2'}]);
  }});
  assert.equal(data.source,'Hyperliquid perpetual');assert.equal(data.price_type,'venue_perpetual');assert.equal(data.pair,'xyz:GOLD');assert.deepEqual(data.t,[1500]);
 }
});
test('native empty/failing charts never fall through to a different asset provider',async()=>{
 for(const value of [[],{error:'bad'}]){let calls=0;const run=fetchChartHistory({...query,symbol:'Hyperliquid.io:GPRO'},{fetchImpl:async()=>{calls++;return response(value);}});
  if(Array.isArray(value))assert.equal((await run).s,'no_data');else await assert.rejects(run,/Invalid venue/);assert.equal(calls,1);
 }
 const data=await fetchChartHistory({...query,symbol:'Hyperliquid.https://evil'},{fetchImpl:async()=>{throw Error('must not request');}});assert.equal(data.s,'no_data');
});
test('native USD Kraken candles normalized, sorted, bounded and source-attributed',async()=>{
 const data=await fetchChartHistory(query,{fetchImpl:async url=>{assert.match(url,/pair=XBTUSD/);return response({error:[],result:{last:9999,XXBTZUSD:[[1500,'10','12','9','11','10','2',1],[1200,'9','10','8','10','9','3',1],[3000,'9','10','8','10','9','1',1],[1600,'11','8','9','10','9','1',1]]}});}});
 assert.equal(data.source,'Kraken');assert.deepEqual(data.t,[1200,1500]);assert.deepEqual(data.c,[10,11]);assert.equal(data.price_type,'spot_reference');
});
test('Kraken failure falls back once to native USD Coinbase with correct OHLC order',async()=>{
 let count=0;const data=await fetchChartHistory(query,{fetchImpl:async url=>{count++;if(!url.includes('coinbase'))throw Error('timeout');assert.match(url,/BTC-USD/);return response([[1500,9,12,10,11,4]]);}});
 assert.equal(count,3);assert.equal(data.source,'Coinbase');assert.deepEqual(data.o,[10]);assert.deepEqual(data.h,[12]);
});
test('Binance native USD index is preferred, milliseconds normalized, no invented volume',async()=>{
 let calls=0;const data=await fetchChartHistory(query,{fetchImpl:async url=>{calls++;assert.match(url,/dapi\.binance\.com/);assert.equal(new URL(url).searchParams.get('pair'),'BTCUSD');return response([[1500000,'10','12','9','11',999]]);}});
 assert.equal(calls,1);assert.equal(data.source,'Binance USD index');assert.equal(data.price_type,'index_reference');assert.deepEqual(data.t,[1500]);assert.deepEqual(data.v,[0]);
});
test('4H Coinbase fallback aggregates real hourly candles into UTC buckets',async()=>{
 const data=await fetchChartHistory({...query,resolution:'240',from:0,to:28800},{fetchImpl:async url=>url.includes('kraken')?response({error:['Unknown asset pair']}):response([[18000,8,14,12,9,3],[14400,9,13,10,12,2]])});
 assert.deepEqual(data.t,[14400]);assert.deepEqual(data.o,[10]);assert.deepEqual(data.h,[14]);assert.deepEqual(data.l,[8]);assert.deepEqual(data.c,[9]);assert.deepEqual(data.v,[5]);
});
test('unsupported markets are explicit and never silently substituted with tokenized assets',async()=>{
 for(const symbol of ['Metal.XAU/USD','Equity.US.AAPL/USD','Crypto.BTC/USDT','../../secret']){const data=await fetchChartHistory({...query,symbol},{fetchImpl:async()=>{throw Error('must not request');}});assert.equal(data.s,'no_data');assert.equal(data.source,null);}
});
test('all chart timeframes use native Kraken intervals; failures never invent candles',async()=>{
 for(const resolution of ['1','5','15','60','240','1D']){let interval;const data=await fetchChartHistory({...query,resolution},{fetchImpl:async url=>{interval=new URL(url).searchParams.get('interval');return response({result:{BTCUSD:[[1500,10,11,9,10,0,1]]}});}});assert.equal(interval,resolution==='1D'?'1440':resolution);assert.equal(data.s,'ok');}
 await assert.rejects(fetchChartHistory(query,{fetchImpl:async()=>({ok:false,status:503})}),/503/);
});
