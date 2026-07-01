export const LIGHTER_BROWSER_API = String(
  import.meta.env.VITE_LIGHTER_BROWSER_API_URL
  || import.meta.env.VITE_LIGHTER_API_URL
  || 'https://mainnet.zklighter.elliot.ai',
).replace(/\/+$/u, '');

const REQUEST_TIMEOUT_MS = Math.max(1_000, Math.min(20_000, Number(
  import.meta.env.VITE_LIGHTER_BROWSER_TIMEOUT_MS || 8_000,
)));
const PUBLIC_CACHE_TTL_MS = Math.max(1_000, Math.min(60_000, Number(
  import.meta.env.VITE_LIGHTER_PUBLIC_CACHE_TTL_MS || 12_000,
)));

let cache = new Map();

function num(value, fallback = 0) {
  const n = Number(value);
  return Number.isFinite(n) ? n : fallback;
}

function rows(payload, key) {
  if (Array.isArray(payload)) return payload;
  if (key && Array.isArray(payload?.[key])) return payload[key];
  if (Array.isArray(payload?.data)) return payload.data;
  if (Array.isArray(payload?.result)) return payload.result;
  return [];
}

function normalizeSymbol(value) {
  return String(value || '')
    .trim()
    .toUpperCase()
    .replace(/[-/](PERP|USD|USDC)$/iu, '');
}

async function lighterRequest(path) {
  const now = Date.now();
  const cached = cache.get(path);
  if (cached && now - cached.at < PUBLIC_CACHE_TTL_MS) return cached.data;

  const ctrl = new AbortController();
  const timer = setTimeout(() => ctrl.abort(), REQUEST_TIMEOUT_MS);
  try {
    const res = await fetch(`${LIGHTER_BROWSER_API}${path}`, {
      signal: ctrl.signal,
      headers: {
        accept: 'application/json',
        'content-type': 'application/json',
      },
      cache: 'no-store',
    });
    const text = await res.text();
    let data = null;
    try {
      data = text ? JSON.parse(text) : null;
    } catch {
      data = text;
    }
    if (!res.ok || (data && typeof data === 'object' && data.code && Number(data.code) !== 200)) {
      const msg = typeof data === 'string'
        ? data
        : (data?.message || data?.error || text || `HTTP ${res.status}`);
      throw new Error(`Lighter ${path} failed: ${msg}`);
    }
    cache.set(path, { at: now, data });
    if (cache.size > 120) cache = new Map(Array.from(cache.entries()).slice(-80));
    return data;
  } finally {
    clearTimeout(timer);
  }
}

function buildFundingRateMaps(fundingRows = []) {
  const byId = new Map();
  const bySymbol = new Map();
  for (const row of Array.isArray(fundingRows) ? fundingRows : []) {
    const rate = num(row?.rate ?? row?.funding_rate, NaN);
    if (!Number.isFinite(rate)) continue;
    const exchange = String(row?.exchange || '').toLowerCase();
    const sourceRank = exchange === 'lighter' ? 2 : 1;
    const entry = { rate, source: exchange || 'unknown', rank: sourceRank };
    const marketId = Number(row?.market_id ?? row?.market_index);
    if (Number.isInteger(marketId) && marketId >= 0) {
      const prev = byId.get(marketId);
      if (!prev || entry.rank >= prev.rank) byId.set(marketId, entry);
    }
    const symbol = normalizeSymbol(row?.symbol);
    if (symbol) {
      const prev = bySymbol.get(symbol);
      if (!prev || entry.rank >= prev.rank) bySymbol.set(symbol, entry);
    }
  }
  return { byId, bySymbol };
}

async function getFundingRateMaps() {
  const data = await lighterRequest('/api/v1/funding-rates');
  return buildFundingRateMaps(rows(data, 'funding_rates'));
}

function fundingForOrderBook(row, fundingMaps) {
  const marketId = Number(row?.market_id ?? row?.market_index);
  const symbol = normalizeSymbol(row?.symbol);
  return (Number.isInteger(marketId) ? fundingMaps?.byId?.get(marketId) : null)
    || (symbol ? fundingMaps?.bySymbol?.get(symbol) : null)
    || { rate: 0, source: null };
}

function marketFromOrderBook(row, fundingMaps = null) {
  const symbol = normalizeSymbol(row?.symbol);
  const priceDecimals = Number(row?.supported_price_decimals || 2);
  const sizeDecimals = Number(row?.supported_size_decimals || 4);
  const lotSize = sizeDecimals >= 0 ? String(1 / (10 ** Math.min(sizeDecimals, 12))) : '0.0001';
  const lastPrice = num(row?.last_trade_price ?? row?.last_price, 0);
  const markPrice = num(row?.mark_price ?? row?.index_price ?? lastPrice, lastPrice);
  const funding = fundingForOrderBook(row, fundingMaps);
  return {
    symbol,
    base: symbol,
    base_symbol: symbol,
    quote: 'USDC',
    market_id: Number(row?.market_id),
    market_index: Number(row?.market_id),
    market_type: row?.market_type || 'perp',
    lot_size: lotSize,
    min_size: row?.min_base_amount || lotSize,
    min_notional: row?.min_quote_amount || '10',
    price_decimals: priceDecimals,
    size_decimals: sizeDecimals,
    max_leverage: 50,
    funding_rate: funding.rate,
    next_funding_rate: funding.rate,
    funding_rate_source: funding.source ? `lighter_funding_rates:${funding.source}` : null,
    price: markPrice,
    mark: markPrice,
    mark_price: markPrice,
    last_price: lastPrice,
    last_trade_price: lastPrice,
    index_price: num(row?.index_price ?? markPrice, markPrice),
    taker_fee: num(row?.taker_fee, 0),
    maker_fee: num(row?.maker_fee, 0),
    pyth_symbol: `Crypto.${symbol}/USD`,
    _raw: row,
  };
}

async function getOrderBooks(filter = 'perp') {
  if (String(filter || '').toLowerCase() === 'perp') {
    const details = rows(await lighterRequest('/api/v1/orderBookDetails'), 'order_book_details');
    if (details.length) return details;
  }
  return rows(await lighterRequest(`/api/v1/orderBooks?filter=${encodeURIComponent(filter)}`), 'order_books');
}

export async function fetchLighterMarketsDirect() {
  const [orderBooks, fundingMaps] = await Promise.all([
    getOrderBooks('perp'),
    getFundingRateMaps().catch((err) => {
      console.warn('[Lighter browser] funding-rates read failed:', err?.message || err);
      return buildFundingRateMaps([]);
    }),
  ]);
  return orderBooks
    .filter(row => row?.status === 'active' && row?.market_type === 'perp')
    .map(row => marketFromOrderBook(row, fundingMaps))
    .filter(row => row.symbol);
}

export async function fetchLighterPricesDirect() {
  const [orderBooks, fundingMaps] = await Promise.all([
    getOrderBooks('perp'),
    getFundingRateMaps().catch((err) => {
      console.warn('[Lighter browser] funding-rates read failed:', err?.message || err);
      return buildFundingRateMaps([]);
    }),
  ]);
  const out = {};
  for (const row of orderBooks) {
    const symbol = normalizeSymbol(row?.symbol);
    const price = num(
      row?.last_trade_price
      ?? row?.last_price
      ?? row?.mark_price
      ?? row?.index_price,
      NaN,
    );
    if (!symbol || !Number.isFinite(price) || price <= 0) continue;
    const funding = fundingForOrderBook(row, fundingMaps);
    out[symbol] = {
      symbol,
      price,
      funding_rate: funding.rate,
      next_funding_rate: funding.rate,
      funding_rate_source: funding.source ? `lighter_funding_rates:${funding.source}` : null,
      change_24h: num(row?.daily_price_change, 0),
      volume_24h: num(row?.daily_quote_token_volume, 0),
    };
  }
  return out;
}
