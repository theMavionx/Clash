const { alchemySolanaRpcUrl } = require('./solana_rpc');
const TOKEN = '0xceB9A7C4eC7bf0EE14Bac1f16C97571bC22DB979';
function rpcUrl(env = process.env) {
  let inherited = '';
  try { inherited = new URL(alchemySolanaRpcUrl(env)).pathname.split('/v2/')[1] || ''; } catch {}
  const key = env.ROBINHOOD_ALCHEMY_API_KEY || inherited;
  const raw = env.GAME_SHOP_ROBINHOOD_RPC_URL || env.MIGRATION_ROBINHOOD_RPC_URL
    || (key ? `https://robinhood-mainnet.g.alchemy.com/v2/${key}` : '');
  let url;
  try { url = new URL(raw); } catch { throw new Error('Robinhood paid RPC is not configured'); }
  if (url.protocol !== 'https:' || url.hostname !== 'robinhood-mainnet.g.alchemy.com' || !/^\/v2\/[^/]+$/.test(url.pathname)) {
    throw new Error('Robinhood shop requires paid Alchemy RPC');
  }
  return url.toString();
}
function selectPrice(pairs) {
  const pair = (pairs || []).filter(p => p.chainId === 'robinhood'
    && String(p.baseToken?.address).toLowerCase() === TOKEN.toLowerCase()
    && Number.isFinite(Number(p.priceUsd)) && Number(p.priceUsd) > 0
    && Number(p.liquidity?.usd) >= 10000).sort((a,b)=>b.liquidity.usd-a.liquidity.usd)[0];
  if (!pair) throw new Error('Robinhood CLASH price unavailable; no payment requested');
  return String(pair.priceUsd);
}
let cached;
async function price() {
  if (cached?.until > Date.now()) return cached.price;
  const r = await fetch(`https://api.dexscreener.com/latest/dex/tokens/${TOKEN}`, { signal: AbortSignal.timeout(8000) });
  if (!r.ok) throw new Error('Robinhood CLASH price unavailable');
  const value = selectPrice((await r.json()).pairs);
  cached = { price: value, until: Date.now() + 60000 };
  return value;
}
function validRead(body) {
  if (!body || Array.isArray(body) || !Array.isArray(body.params)) return false;
  const p = body.params;
  if (['eth_chainId','eth_blockNumber'].includes(body.method)) return p.length === 0;
  if (body.method === 'eth_getTransactionReceipt') return p.length === 1 && /^0x[0-9a-f]{64}$/i.test(p[0]);
  if (body.method === 'eth_getBlockByNumber') return p.length === 2 && /^(latest|safe|finalized|0x[0-9a-f]+)$/i.test(p[0]) && p[1] === false;
  if (body.method === 'eth_call') return p.length === 2 && p[0]?.to?.toLowerCase() === TOKEN.toLowerCase()
    && /^0x70a082310{24}[0-9a-f]{40}$/i.test(p[0].data) && p[1] === 'latest';
  return false;
}
module.exports = { TOKEN, rpcUrl, price, selectPrice, validRead };
