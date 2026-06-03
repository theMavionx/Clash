const { privateKeyToAccount } = require('viem/accounts');

const DEFAULT_HOTSTUFF_BROKER_ADDRESS = '0xB36402e87a86206D3a114a98B53f31362291fe1B';
const DEFAULT_HOTSTUFF_AGENT_ADDRESS = '0xd186C1F7a6ad2A6380fd019978C299DB4cFe5589';

const HOTSTUFF_API = String(process.env.HOTSTUFF_API_URL || 'https://api.hotstuff.trade').replace(/\/+$/u, '');
const HOTSTUFF_BROKER_ADDRESS = String(
  process.env.HOTSTUFF_BROKER_ADDRESS || process.env.VITE_HOTSTUFF_BROKER_ADDRESS || DEFAULT_HOTSTUFF_BROKER_ADDRESS,
).trim().toLowerCase();
const HOTSTUFF_AGENT_ADDRESS = String(
  process.env.HOTSTUFF_AGENT_ADDRESS || process.env.HOTSTUFF_API_WALLET_ADDRESS || DEFAULT_HOTSTUFF_AGENT_ADDRESS,
).trim().toLowerCase();
const HOTSTUFF_API_WALLET_PRIVATE_KEY = String(process.env.HOTSTUFF_API_WALLET_PRIVATE_KEY || '').trim();
const HOTSTUFF_CLOID_PREFIX = String(process.env.HOTSTUFF_CLOID_PREFIX || 'clash-hs-');
const HOTSTUFF_FILL_LOOKBACK_LIMIT = Math.max(10, Math.min(250, Number(process.env.HOTSTUFF_FILL_LOOKBACK_LIMIT || 100)));
const HOTSTUFF_FILL_IMPORT_MAX_PAGES = Math.max(1, Math.min(50, Number(process.env.HOTSTUFF_FILL_IMPORT_MAX_PAGES || 10)));
const HOTSTUFF_BROKER_MIN_ACCOUNT_VALUE_USDC = Number(process.env.HOTSTUFF_BROKER_MIN_ACCOUNT_VALUE_USDC || 100);

function isEvmAddress(addr) {
  return /^0x[0-9a-fA-F]{40}$/.test(String(addr || '').trim());
}

function normalizeAddress(addr) {
  const s = String(addr || '').trim().toLowerCase();
  return isEvmAddress(s) ? s : null;
}

function deriveApiWalletAddress() {
  if (!HOTSTUFF_API_WALLET_PRIVATE_KEY) return null;
  try {
    return privateKeyToAccount(HOTSTUFF_API_WALLET_PRIVATE_KEY).address;
  } catch {
    return null;
  }
}

function num(value, fallback = 0) {
  const n = Number(value);
  return Number.isFinite(n) ? n : fallback;
}

async function postInfo(method, params = {}) {
  const r = await fetch(`${HOTSTUFF_API}/info`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ method, params }),
  });
  const text = await r.text();
  let data = null;
  try { data = text ? JSON.parse(text) : null; } catch { data = text; }
  if (!r.ok) {
    const msg = typeof data === 'string' ? data : (data?.error || data?.message || text);
    throw new Error(`Hotstuff info ${r.status}: ${msg || 'request failed'}`);
  }
  return data;
}

function symbolOf(value) {
  return String(value || '')
    .trim()
    .toUpperCase()
    .replace(/-PERP$/u, '')
    .replace(/\/USD[TC]?$/u, '');
}

async function getPerpInstruments() {
  const data = await postInfo('instruments', { type: 'perps' });
  return Array.isArray(data?.perps) ? data.perps : [];
}

async function tickerMap() {
  const instruments = await getPerpInstruments();
  const rows = await Promise.all(instruments
    .filter(m => !m?.delisted && m?.name)
    .slice(0, 80)
    .map(async (m) => {
      try {
        const t = await postInfo('ticker', { symbol: m.name });
        const row = Array.isArray(t) ? t[0] : t;
        return [String(m.name), row || null];
      } catch {
        return [String(m.name), null];
      }
    }));
  return new Map(rows);
}

async function getMarketInfo() {
  const [instruments, tickers] = await Promise.all([getPerpInstruments(), tickerMap()]);
  const data = instruments
    .filter(m => !m?.delisted)
    .map(m => {
      const t = tickers.get(String(m.name)) || {};
      const base = symbolOf(m.name);
      const mark = num(t.mark_price || t.last_price || t.mid_price || t.index_price);
      return {
        symbol: base,
        base,
        pair: `${base}/USD`,
        market_name: m.name,
        pair_index: Number(m.id),
        lot_size: String(m.lot_size || ''),
        tick_size: String(m.tick_size || ''),
        min_order_size: String(m.min_notional_usd || 10),
        max_leverage: Number(m.max_leverage || 1),
        isolated_only: !!m.only_isolated,
        mark,
        oracle: num(t.index_price, mark),
        mid: num(t.mid_price, mark),
        yesterday_price: mark && Number.isFinite(num(t.change_24h))
          ? mark / (1 + (num(t.change_24h) / 100))
          : 0,
        open_interest: num(t.open_interest),
        volume_24h: num(t.volume_24h),
        funding_rate: num(t.funding_rate),
        _hotstuff: { instrumentId: Number(m.id), raw: m, ticker: t },
      };
    });
  return { success: true, data };
}

async function getPrices() {
  const info = await getMarketInfo();
  return {
    success: true,
    data: (info.data || []).map(m => ({
      symbol: m.symbol,
      mark: String(m.mark || ''),
      mid: String(m.mid || m.mark || ''),
      oracle: String(m.oracle || m.mark || ''),
      yesterday_price: String(m.yesterday_price || ''),
      open_interest: String(m.open_interest || 0),
      volume_24h: m.volume_24h || 0,
      funding_rate: m.funding_rate || 0,
    })),
  };
}

async function getAccountByAddress(address) {
  const clean = normalizeAddress(address);
  if (!clean) throw new Error('address query param required (0x...)');
  const [summary, fees] = await Promise.all([
    postInfo('account_summary', { user: clean }),
    postInfo('user_fees', { user: clean }).catch(() => null),
  ]);
  return {
    balance: String(summary?.total_account_equity ?? summary?.margin_balance ?? 0),
    usdc: String(summary?.total_account_equity ?? summary?.margin_balance ?? 0),
    account_equity: String(summary?.total_account_equity ?? 0),
    available_to_spend: String(summary?.available_balance ?? 0),
    available_to_withdraw: String(summary?.withdrawable_balance_notional ?? summary?.available_balance ?? 0),
    total_margin_used: String(summary?.initial_margin ?? 0),
    derivative_account_equity: String(summary?.derivative_account_equity ?? 0),
    spot_account_equity: String(summary?.spot_account_equity ?? 0),
    positions_count: Object.keys(summary?.perp_positions || {}).length,
    maker_fee: fees?.perp_maker_fee_rate != null ? String(fees.perp_maker_fee_rate) : null,
    taker_fee: fees?.perp_taker_fee_rate != null ? String(fees.perp_taker_fee_rate) : null,
    fee_tier: fees?.total_volume_threshold != null ? String(fees.total_volume_threshold) : null,
    fee_info: fees || null,
    _raw: summary,
  };
}

async function getHotstuffConfigStatus() {
  const broker = normalizeAddress(HOTSTUFF_BROKER_ADDRESS);
  const agent = normalizeAddress(HOTSTUFF_AGENT_ADDRESS);
  const derivedApiWallet = deriveApiWalletAddress();
  const status = {
    api: HOTSTUFF_API,
    broker_address: broker,
    broker_configured: !!broker,
    broker_min_account_value_usdc: HOTSTUFF_BROKER_MIN_ACCOUNT_VALUE_USDC,
    agent_address: agent,
    api_wallet_private_key_configured: !!HOTSTUFF_API_WALLET_PRIVATE_KEY,
    api_wallet_address: derivedApiWallet,
    api_wallet_matches_agent: !!derivedApiWallet && !!agent && derivedApiWallet.toLowerCase() === agent,
    cloid_prefix: HOTSTUFF_CLOID_PREFIX,
    fill_lookback_limit: HOTSTUFF_FILL_LOOKBACK_LIMIT,
  };
  if (broker) {
    try {
      const account = await getAccountByAddress(broker);
      const value = num(account?.account_equity ?? account?.balance);
      status.broker_account_value_usdc = value;
      status.broker_min_balance_ok = value >= HOTSTUFF_BROKER_MIN_ACCOUNT_VALUE_USDC;
    } catch (e) {
      status.broker_account_check_error = e?.message || String(e);
    }
  }
  return status;
}

async function getPositionsByAddress(address) {
  const clean = normalizeAddress(address);
  if (!clean) throw new Error('address query param required (0x...)');
  const rows = await postInfo('positions', { user: clean });
  return (Array.isArray(rows) ? rows : []).map(p => {
    const size = Math.abs(num(p.size));
    if (!p?.instrument || size <= 0) return null;
    const side = String(p.position_side || '').toUpperCase() === 'SHORT'
      ? 'ask'
      : num(p.size) < 0 ? 'ask' : 'bid';
    return {
      symbol: symbolOf(p.instrument),
      side,
      amount: String(size),
      size_usd: num(p.position_value),
      entry_price: String(p.entry_price || ''),
      mark_price: '',
      liquidation_price: null,
      margin: String(p.margin || ''),
      leverage: String(p.leverage || 1),
      pnl_usd: String(p.unrealized_pnl ?? p.upnl ?? ''),
      pnl_pct: 0,
      pair_index: Number(p.instrument_id),
      trade_index: null,
      is_isolated: String(p.margin_mode || '').toLowerCase() === 'isolated',
      _raw: p,
    };
  }).filter(Boolean);
}

async function getOrdersByAddress(address) {
  const clean = normalizeAddress(address);
  if (!clean) throw new Error('address query param required (0x...)');
  const payload = await postInfo('open_orders', { user: clean, page: 1, limit: 100 });
  const rows = Array.isArray(payload?.data) ? payload.data : [];
  return rows.map(o => ({
    symbol: symbolOf(o.instrument),
    side: o.side === 'b' ? 'bid' : 'ask',
    amount: String(o.unfilled ?? o.size ?? ''),
    initial_amount: String(o.size ?? ''),
    price: String(o.trigger_px || o.limit_price || ''),
    stop_price: o.trigger_px ? String(o.trigger_px) : null,
    order_id: o.order_id,
    order_type: o.is_market ? 'market' : (o.tpsl || 'limit'),
    tif: o.tif || null,
    reduce_only: !!o.reduce_only,
    pair_index: Number(o.instrument_id),
    trade_index: null,
    client_order_id: o.cloid || null,
    _raw: o,
  }));
}

function isRewardableFill(fill) {
  if (!isEvmAddress(HOTSTUFF_BROKER_ADDRESS)) return false;
  return num(fill?.broker_fee) > 0
    && String(fill?.cloid || '').startsWith(HOTSTUFF_CLOID_PREFIX);
}

function normalizeFill(wallet, fill) {
  const notional = num(fill?.notional_value) || Math.abs(num(fill?.price) * num(fill?.size));
  if (!fill?.instrument || !Number.isFinite(notional) || notional < 10 || notional > 10_000_000) return null;
  const side = String(fill?.direction || '').toLowerCase().includes('close')
    ? (String(fill?.direction || '').toLowerCase().includes('short') ? 'close_short' : 'close_long')
    : (String(fill?.direction || '').toLowerCase().includes('short') || fill?.side === 's' ? 'short' : 'long');
  const key = `hotstuff:${String(wallet).toLowerCase()}:${fill?.trade_id || fill?.tx_hash || fill?.order_id || fill?.cloid}`;
  return {
    symbol: symbolOf(fill.instrument),
    side,
    orderType: String(fill?.direction || '').toLowerCase().includes('close')
      ? 'close'
      : (fill?.crossed ? 'market' : 'limit'),
    amount: String(Math.abs(num(fill?.size))),
    price: String(fill?.price || ''),
    orderId: fill?.order_id || fill?.tx_hash || null,
    clientOrderId: key,
    status: 'filled',
    dex: 'hotstuff',
    notional_usd: notional,
    verifiedSource: 'hotstuff_api',
    pnl: fill?.closed_pnl != null ? String(fill.closed_pnl) : null,
    fee: String(fill?.fee || ''),
    created_at: Date.parse(fill?.block_timestamp || '') || Date.now(),
    _raw: fill,
  };
}

async function getAccountTradeHistory(address, { limit = HOTSTUFF_FILL_LOOKBACK_LIMIT } = {}) {
  const clean = normalizeAddress(address);
  if (!clean) throw new Error('wallet required (0x...)');
  const rows = await fetchFillsPages(clean, { limit, maxPages: HOTSTUFF_FILL_IMPORT_MAX_PAGES });
  return rows.map(f => normalizeFill(clean, f)).filter(Boolean);
}

async function fetchFillsPages(wallet, { limit = HOTSTUFF_FILL_LOOKBACK_LIMIT, maxPages = HOTSTUFF_FILL_IMPORT_MAX_PAGES } = {}) {
  const clean = normalizeAddress(wallet);
  if (!clean) return [];
  const pageLimit = Math.max(1, Math.min(250, Number(limit) || HOTSTUFF_FILL_LOOKBACK_LIMIT));
  const pages = Math.max(1, Math.min(50, Number(maxPages) || HOTSTUFF_FILL_IMPORT_MAX_PAGES));
  const out = [];
  for (let page = 1; page <= pages; page++) {
    const payload = await postInfo('fills', { user: clean, page, limit: pageLimit });
    const rows = Array.isArray(payload?.data) ? payload.data : [];
    out.push(...rows);
    if (!payload?.has_next || rows.length < pageLimit) break;
  }
  return out;
}

async function importFillsForPlayer(playerId, wallet, opts = {}) {
  const cleanWallet = normalizeAddress(wallet);
  if (!cleanWallet) return { ok: false, imported: 0, skipped: 0, total: 0, reason: 'invalid_evm_wallet' };
  const db = require('./db');
  const fills = await fetchFillsPages(cleanWallet, {
    limit: opts.limit,
    maxPages: opts.maxPages || HOTSTUFF_FILL_IMPORT_MAX_PAGES,
  }).catch(() => []);
  let imported = 0;
  let adopted = 0;
  let skipped = 0;
  for (const fill of fills) {
    const trade = normalizeFill(cleanWallet, fill);
    if (!trade) { skipped++; continue; }
    if (!isRewardableFill(fill)) {
      try {
        db.db.prepare(`
          UPDATE trade_history
          SET status = 'ignored'
          WHERE dex = 'hotstuff'
            AND verified_source = 'hotstuff_api'
            AND client_order_id = ?
        `).run(trade.clientOrderId);
      } catch {}
      skipped++;
      continue;
    }
    try {
      const before = db.db.prepare('SELECT id, player_id FROM trade_history WHERE client_order_id = ?').get(trade.clientOrderId);
      if (before) {
        if (before.player_id !== playerId) {
          const moved = db.db.prepare(`
            UPDATE trade_history
            SET player_id = ?
            WHERE id = ? AND dex = 'hotstuff' AND verified_source = 'hotstuff_api'
          `).run(playerId, before.id);
          if (moved.changes > 0) adopted++;
        }
        skipped++;
        continue;
      }
      const r = db.addTrade(playerId, trade);
      if (r?.id) imported++;
      else skipped++;
    } catch (e) {
      skipped++;
      if (!/UNIQUE|constraint/i.test(e.message || '')) {
        console.warn('[hotstuff] addTrade failed:', e.message);
      }
    }
  }
  return { ok: true, imported, adopted, skipped, total: fills.length, broker_configured: isEvmAddress(HOTSTUFF_BROKER_ADDRESS) };
}

module.exports = {
  HOTSTUFF_API,
  HOTSTUFF_BROKER_ADDRESS,
  HOTSTUFF_AGENT_ADDRESS,
  HOTSTUFF_CLOID_PREFIX,
  HOTSTUFF_FILL_IMPORT_MAX_PAGES,
  isEvmAddress,
  normalizeAddress,
  postInfo,
  getHotstuffConfigStatus,
  getMarketInfo,
  getPrices,
  getAccountByAddress,
  getPositionsByAddress,
  getOrdersByAddress,
  getAccountTradeHistory,
  fetchFillsPages,
  importFillsForPlayer,
};
