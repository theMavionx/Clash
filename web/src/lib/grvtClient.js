export const GRVT_MARKET_API = String(
  import.meta.env.VITE_GRVT_MARKET_API_URL || 'https://market-data.grvt.io',
).replace(/\/+$/u, '');

const REQUEST_TIMEOUT_MS = 10_000;
const INSTRUMENT_CACHE_TTL_MS = 30_000;

let instrumentsCache = { at: 0, rows: null };

function num(value, fallback = 0) {
  const n = Number(value);
  return Number.isFinite(n) ? n : fallback;
}

function rows(payload) {
  if (Array.isArray(payload)) return payload;
  if (Array.isArray(payload?.result)) return payload.result;
  if (Array.isArray(payload?.r)) return payload.r;
  if (Array.isArray(payload?.results)) return payload.results;
  if (Array.isArray(payload?.data)) return payload.data;
  if (Array.isArray(payload?.orders)) return payload.orders;
  if (Array.isArray(payload?.positions)) return payload.positions;
  return [];
}

function symbolOf(value) {
  return String(value || '')
    .trim()
    .toUpperCase()
    .replace(/_USDT?_PERP$/u, '')
    .replace(/_USD_PERP$/u, '')
    .replace(/-PERP$/u, '')
    .replace(/\/USD[TC]?$/u, '');
}

function normalizeTickerFundingRate(value) {
  const n = Number(value);
  if (!Number.isFinite(n)) return 0;
  if (Math.abs(n) <= 1) return n / 100;
  return n / 1_000_000;
}

async function postMarket(endpoint, body = {}) {
  const ctrl = new AbortController();
  const timer = setTimeout(() => ctrl.abort(), REQUEST_TIMEOUT_MS);
  try {
    const res = await fetch(`${GRVT_MARKET_API}/full/v1/${endpoint}`, {
      method: 'POST',
      signal: ctrl.signal,
      headers: {
        accept: 'application/json',
        'content-type': 'application/json',
      },
      body: JSON.stringify(body || {}),
    });
    const text = await res.text();
    let data = null;
    try {
      data = text ? JSON.parse(text) : null;
    } catch {
      data = text;
    }
    if (!res.ok) {
      const msg = typeof data === 'string' ? data : (data?.error || data?.message || text);
      throw new Error(`GRVT market ${endpoint} ${res.status}: ${msg || 'request failed'}`);
    }
    return data;
  } finally {
    clearTimeout(timer);
  }
}

async function getInstruments() {
  if (instrumentsCache.rows && Date.now() - instrumentsCache.at < INSTRUMENT_CACHE_TTL_MS) {
    return instrumentsCache.rows;
  }
  const payload = await postMarket('all_instruments', { is_active: true });
  const list = rows(payload)
    .filter(item => String(item?.kind || '').toUpperCase() === 'PERPETUAL' || /_Perp$/iu.test(String(item?.instrument || '')));
  instrumentsCache = { at: Date.now(), rows: list };
  return list;
}

async function ticker(instrument) {
  try {
    return (await postMarket('ticker', { instrument }))?.result || null;
  } catch {
    return null;
  }
}

export async function fetchGrvtMarketsDirect() {
  const instruments = await getInstruments();
  const visible = instruments.slice(0, 120);
  const tickers = await Promise.all(visible.map(item => ticker(item.instrument)));
  const data = visible.map((instrument, idx) => {
    const tickerRow = tickers[idx] || {};
    const mark = num(tickerRow.mark_price || tickerRow.markPrice || tickerRow.last_price || tickerRow.index_price);
    const open24h = num(tickerRow.open_price || tickerRow.openPrice || tickerRow.price_24h_ago || tickerRow.price24hAgo);
    const changePct = num(tickerRow.change_24h || tickerRow.price_change_24h || tickerRow.priceChange24h, NaN);
    const yesterday = open24h > 0
      ? open24h
      : (mark && Number.isFinite(changePct) ? mark / (1 + changePct / 100) : 0);
    const base = symbolOf(instrument.instrument);
    return {
      symbol: base,
      base,
      pair: `${base}/${instrument.quote || 'USDT'}`,
      market_name: instrument.instrument,
      pair_index: idx,
      lot_size: String(instrument.min_size || ''),
      tick_size: String(instrument.tick_size || ''),
      min_order_size: String(instrument.min_size || ''),
      min_notional_usd: Number(instrument.min_notional || 0),
      max_leverage: 50,
      mark,
      mid: mark,
      oracle: num(tickerRow.index_price, mark),
      yesterday_price: yesterday,
      price_change_24h: mark && yesterday > 0 ? ((mark - yesterday) / yesterday) * 100 : 0,
      high_24h: num(tickerRow.high_price),
      low_24h: num(tickerRow.low_price),
      open_interest: num(tickerRow.open_interest),
      volume_24h: num(tickerRow.volume_24h),
      funding_rate: normalizeTickerFundingRate(tickerRow.funding_rate ?? tickerRow.fr2),
      funding_interval_hours: Number(tickerRow.funding_interval_hours || tickerRow.fi || 0) || null,
      next_funding_time: tickerRow.next_funding_time || tickerRow.nf || null,
      _grvt: { instrument: instrument.instrument, raw: instrument, ticker: tickerRow },
      _raw: instrument,
    };
  }).filter(market => market.symbol);
  return { success: true, data };
}

export async function fetchGrvtPricesDirect() {
  const info = await fetchGrvtMarketsDirect();
  return {
    success: true,
    data: (info.data || []).map(market => ({
      symbol: market.symbol,
      mark: String(market.mark || ''),
      mid: String(market.mid || market.mark || ''),
      oracle: String(market.oracle || market.mark || ''),
      yesterday_price: String(market.yesterday_price || ''),
      open_interest: String(market.open_interest || 0),
      volume_24h: market.volume_24h || 0,
      funding_rate: market.funding_rate || 0,
      funding_interval_hours: market.funding_interval_hours || null,
      next_funding_time: market.next_funding_time || null,
    })),
  };
}
