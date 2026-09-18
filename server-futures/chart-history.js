// Public native-USD index/spot candles for display only, never execution prices.
const MINUTES = { '1': 1, '5': 5, '15': 15, '60': 60, '240': 240, D: 1440, '1D': 1440 };
function pairFor(symbol) {
  const match = /^(Crypto|FX)\.([A-Z0-9]{1,20})\/([A-Z]{3,5})$/i.exec(String(symbol));
  if (!match || (match[1].toLowerCase() === 'crypto' && match[3].toUpperCase() !== 'USD')) return null;
  return { type: match[1].toLowerCase(), base: match[2].toUpperCase(), quote: match[3].toUpperCase() };
}
function candle(row) {
  const [t,o,h,l,c,v] = row.map(Number);
  if (![t,o,h,l,c].every(Number.isFinite) || t <= 0 || Math.min(o,h,l,c) <= 0 || h < Math.max(o,l,c) || l > Math.min(o,h,c)) return null;
  return [t,o,h,l,c,Number.isFinite(v) && v >= 0 ? v : 0];
}
function udf(rows, query, source, pair) {
  const unique = new Map();
  for (const row of rows) { const c = candle(row); if (c && c[0] >= query.from && c[0] <= query.to) unique.set(c[0],c); }
  const sorted = [...unique.values()].sort((a,b)=>a[0]-b[0]).slice(-720);
  return { s: sorted.length ? 'ok' : 'no_data', source, pair,
    price_type: source==='Binance USD index'?'index_reference':'spot_reference', t: sorted.map(r=>r[0]), o: sorted.map(r=>r[1]),
    h: sorted.map(r=>r[2]), l: sorted.map(r=>r[3]), c: sorted.map(r=>r[4]), v: sorted.map(r=>r[5]) };
}
async function json(url, fetchImpl) {
  const response = await fetchImpl(url, { signal: AbortSignal.timeout(5000), headers: { accept: 'application/json' } });
  if (!response.ok) throw new Error(`Chart provider HTTP ${response.status}`);
  return response.json();
}
async function fetchChartHistory(query, {fetchImpl=fetch}={}) {
  const pair = pairFor(query.symbol), minutes = MINUTES[query.resolution];
  if (!pair || !minutes) return {s:'no_data', reason:'unsupported_reference_market', source:null};
  const market = `${pair.base}/${pair.quote}`;
  if (pair.type==='crypto') {
    try {
      const interval = minutes===1440?'1d':minutes>=60?`${minutes/60}h`:`${minutes}m`;
      const params = new URLSearchParams({pair:pair.base+'USD',interval,startTime:String(query.from*1000),endTime:String(query.to*1000),limit:'720'});
      const data = await json(`https://dapi.binance.com/dapi/v1/indexPriceKlines?${params}`,fetchImpl);
      const result=udf((Array.isArray(data)?data:[]).map(r=>[Number(r[0])/1000,r[1],r[2],r[3],r[4],0]),query,'Binance USD index',market);
      if(result.s==='ok')return result;
    } catch { /* Native-USD spot feeds remain available if this index is absent. */ }
  }
  try {
    const base = ({BTC:'XBT',DOGE:'XDG'})[pair.base] || pair.base;
    const params = new URLSearchParams({pair:base+pair.quote,interval:String(minutes),since:String(query.from)});
    const data = await json(`https://api.kraken.com/0/public/OHLC?${params}`,fetchImpl);
    if (data.error?.length) throw new Error('Kraken market unavailable');
    const rows = Object.entries(data.result||{}).find(([key,value])=>key!=='last'&&Array.isArray(value))?.[1] || [];
    const result = udf(rows.map(r=>[r[0],r[1],r[2],r[3],r[4],r[6]]),query,'Kraken',market);
    if (result.s==='ok') return result;
  } catch { /* Last bounded fallback to another native USD spot market. */ }
  if (pair.type!=='crypto') return {s:'no_data',reason:'unsupported_reference_market',source:null};
  // Coinbase has no 4h granularity: aggregate real hourly candles on UTC boundaries.
  const seconds = minutes===240 ? 3600 : minutes*60;
  const from = Math.max(query.from,query.to-seconds*299);
  const params = new URLSearchParams({granularity:String(seconds),start:new Date(from*1000).toISOString(),end:new Date(query.to*1000).toISOString()});
  const data = await json(`https://api.exchange.coinbase.com/products/${pair.base}-USD/candles?${params}`,fetchImpl);
  if (!Array.isArray(data)) throw new Error('Chart history unavailable');
  let rows=data.map(r=>[r[0],r[3],r[2],r[1],r[4],r[5]]).map(candle).filter(Boolean).sort((a,b)=>a[0]-b[0]);
  if (minutes===240) {
    const buckets=new Map();
    for(const r of rows){const t=Math.floor(r[0]/14400)*14400,prev=buckets.get(t);if(prev){prev[2]=Math.max(prev[2],r[2]);prev[3]=Math.min(prev[3],r[3]);prev[4]=r[4];prev[5]+=r[5];}else buckets.set(t,[t,...r.slice(1)]);}
    rows=[...buckets.values()];
  }
  return udf(rows,query,'Coinbase',market);
}
module.exports={fetchChartHistory,pairFor};
