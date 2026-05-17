const HYPERLIQUID_API = process.env.HYPERLIQUID_API_URL || 'https://api.hyperliquid.xyz';

function isEvmAddress(addr) {
  return /^0x[0-9a-fA-F]{40}$/.test(String(addr || '').trim());
}

async function postInfo(body, { signal } = {}) {
  const res = await fetch(`${HYPERLIQUID_API}/info`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(body),
    signal,
  });
  const text = await res.text();
  let data = null;
  try { data = text ? JSON.parse(text) : null; } catch { data = text; }
  if (!res.ok) {
    const msg = typeof data === 'string' ? data : (data?.error || data?.message || text);
    throw new Error(`Hyperliquid info ${res.status}: ${msg || 'request failed'}`);
  }
  return data;
}

function num(value, fallback = 0) {
  const n = Number(value);
  return Number.isFinite(n) ? n : fallback;
}

function normalizeAbstractionMode(value) {
  const raw = typeof value === 'object' && value !== null
    ? (value.abstraction || value.mode || value.result)
    : value;
  return String(raw || 'disabled');
}

function spotUsdcTotals(spotState) {
  const balances = Array.isArray(spotState?.balances) ? spotState.balances : [];
  const usdc = balances.find(row => (
    String(row?.coin || '').toUpperCase() === 'USDC'
    || Number(row?.token) === 0
  ));
  const total = num(usdc?.total);
  let available = total;
  const afterMaintenance = Array.isArray(spotState?.tokenToAvailableAfterMaintenance)
    ? spotState.tokenToAvailableAfterMaintenance
    : [];
  const usdcAfterMaintenance = afterMaintenance.find(row => (
    Array.isArray(row) && Number(row[0]) === 0
  ));
  if (usdcAfterMaintenance) available = num(usdcAfterMaintenance[1], total);
  return { total, available };
}

function symbolOf(value) {
  return String(value || '').trim().toUpperCase().replace(/-PERP$/, '').replace(/\/USD$/, '');
}

function lotSize(szDecimals) {
  const decimals = Math.max(0, Math.min(8, Number(szDecimals) || 0));
  return decimals === 0 ? '1' : `0.${'0'.repeat(decimals - 1)}1`;
}

function normalizeMarkets(payload) {
  const meta = Array.isArray(payload) ? payload[0] : payload?.meta;
  const ctxs = Array.isArray(payload) ? payload[1] : payload?.assetCtxs;
  const universe = Array.isArray(meta?.universe) ? meta.universe : [];
  return universe.map((m, index) => {
    const ctx = Array.isArray(ctxs) ? ctxs[index] : {};
    const symbol = symbolOf(m?.name);
    const mark = num(ctx?.markPx || ctx?.midPx || ctx?.oraclePx || ctx?.prevDayPx);
    const openInterestBase = num(ctx?.openInterest);
    return {
      symbol,
      base: symbol,
      pair: `${symbol}/USD`,
      market_name: `${symbol}-PERP`,
      asset_id: index,
      pair_index: index,
      lot_size: lotSize(m?.szDecimals),
      tick_size: mark >= 1000 ? '1' : mark >= 1 ? '0.01' : '0.0001',
      min_order_size: lotSize(m?.szDecimals),
      max_leverage: Number(m?.maxLeverage || 50),
      mark,
      mid: num(ctx?.midPx, mark),
      oracle: num(ctx?.oraclePx, mark),
      yesterday_price: num(ctx?.prevDayPx),
      volume_24h: num(ctx?.dayNtlVlm),
      open_interest: mark > 0 ? openInterestBase * mark : openInterestBase,
      funding_rate: num(ctx?.funding),
      next_funding_rate: num(ctx?.funding),
      _hyperliquid: { index, szDecimals: Number(m?.szDecimals ?? 5), meta: m, ctx },
      _raw: { meta: m, ctx },
    };
  }).filter(m => m.symbol);
}

async function getMarketInfo() {
  return normalizeMarkets(await postInfo({ type: 'metaAndAssetCtxs' }));
}

async function getPrices() {
  const markets = await getMarketInfo();
  return markets.map(m => ({
    symbol: m.symbol,
    mark: String(m.mark || ''),
    mid: String(m.mid || m.mark || ''),
    oracle: String(m.oracle || m.mark || ''),
    yesterday_price: String(m.yesterday_price || ''),
    volume_24h: m.volume_24h || 0,
    open_interest: String(m.open_interest || 0),
    funding_rate: m.funding_rate || 0,
  }));
}

async function getAccountByAddress(address) {
  if (!isEvmAddress(address)) throw new Error('address query param required (0x...)');
  const [state, spotState, abstractionRaw] = await Promise.all([
    postInfo({ type: 'clearinghouseState', user: address }),
    postInfo({ type: 'spotClearinghouseState', user: address }).catch(() => null),
    postInfo({ type: 'userAbstraction', user: address }).catch(() => null),
  ]);
  const abstractionMode = normalizeAbstractionMode(abstractionRaw);
  const isUnifiedAccount = abstractionMode === 'unifiedAccount' || abstractionMode === 'portfolioMargin';
  const spot = spotUsdcTotals(spotState);
  const perpEquity = num(state?.marginSummary?.accountValue);
  const perpAvailable = num(state?.withdrawable);
  const equity = isUnifiedAccount ? Math.max(spot.total, perpEquity) : perpEquity;
  const available = isUnifiedAccount ? Math.max(spot.available, perpAvailable) : perpAvailable;
  return {
    balance: String(equity),
    usdc: String(equity),
    account_equity: String(equity),
    available_to_spend: String(available),
    available_to_withdraw: String(available),
    total_margin_used: String(num(state?.marginSummary?.totalMarginUsed)),
    spot_usdc_balance: String(spot.total),
    spot_usdc_available: String(spot.available),
    perp_account_equity: String(perpEquity),
    perp_available_to_withdraw: String(perpAvailable),
    abstraction_mode: abstractionMode,
    is_unified_account: isUnifiedAccount,
    hyperliquid_total_usdc: String(isUnifiedAccount ? equity : equity + spot.total),
    positions_count: Array.isArray(state?.assetPositions) ? state.assetPositions.length : 0,
    _raw: state,
    _spotRaw: spotState,
  };
}

async function marketMap() {
  const rows = await getMarketInfo();
  return new Map(rows.map(m => [m.symbol, m]));
}

async function getPositionsByAddress(address) {
  if (!isEvmAddress(address)) throw new Error('address query param required (0x...)');
  const [state, bySymbol] = await Promise.all([
    postInfo({ type: 'clearinghouseState', user: address }),
    marketMap(),
  ]);
  return (state?.assetPositions || []).map(row => {
    const p = row?.position || row;
    const symbol = symbolOf(p?.coin);
    const market = bySymbol.get(symbol);
    const amount = Math.abs(num(p?.szi));
    if (!symbol || amount <= 0) return null;
    return {
      symbol,
      side: num(p.szi) >= 0 ? 'bid' : 'ask',
      amount: String(amount),
      size_usd: num(p.positionValue),
      entry_price: String(num(p.entryPx)),
      mark_price: String(num(market?.mark)),
      liquidation_price: p.liquidationPx != null ? String(p.liquidationPx) : null,
      margin: String(num(p.marginUsed)),
      leverage: String(num(p.leverage?.value, 1)),
      pnl_usd: String(num(p.unrealizedPnl)),
      pnl_pct: num(p.returnOnEquity) * 100,
      pair_index: market?._hyperliquid?.index ?? null,
      is_isolated: p.leverage?.type === 'isolated',
      _raw: row,
    };
  }).filter(Boolean);
}

async function getOrdersByAddress(address) {
  if (!isEvmAddress(address)) throw new Error('address query param required (0x...)');
  const [orders, bySymbol] = await Promise.all([
    postInfo({ type: 'frontendOpenOrders', user: address }),
    marketMap(),
  ]);
  return (orders || []).map(o => {
    const symbol = symbolOf(o?.coin);
    const market = bySymbol.get(symbol);
    return {
      symbol,
      side: o?.side === 'B' ? 'bid' : 'ask',
      amount: String(o?.sz ?? o?.origSz ?? ''),
      initial_amount: String(o?.origSz ?? o?.sz ?? ''),
      price: String(o?.isTrigger ? o?.triggerPx : o?.limitPx || ''),
      stop_price: o?.isTrigger ? String(o?.triggerPx || '') : null,
      order_id: o?.oid,
      order_type: o?.orderType || (o?.isTrigger ? 'trigger' : 'limit'),
      tif: o?.tif || null,
      reduce_only: !!o?.reduceOnly,
      pair_index: market?._hyperliquid?.index ?? null,
      client_order_id: o?.cloid || null,
      _raw: o,
    };
  }).filter(o => o.symbol);
}

async function getUserFills(address, { startTime, endTime } = {}) {
  if (!isEvmAddress(address)) throw new Error('wallet required (0x...)');
  if (startTime || endTime) {
    return postInfo({
      type: 'userFillsByTime',
      user: address,
      startTime: Number(startTime || Date.now() - 24 * 60 * 60 * 1000),
      ...(endTime ? { endTime: Number(endTime) } : {}),
    });
  }
  return postInfo({ type: 'userFills', user: address });
}

module.exports = {
  HYPERLIQUID_API,
  isEvmAddress,
  postInfo,
  getMarketInfo,
  getPrices,
  getAccountByAddress,
  getPositionsByAddress,
  getOrdersByAddress,
  getUserFills,
};
