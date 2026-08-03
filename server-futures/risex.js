const RISEX_API = String(process.env.RISEX_API_URL || 'https://api.rise.trade').replace(/\/+$/u, '');
const RISEX_BRIDGE_API = String(process.env.RISEX_BRIDGE_API_URL || 'https://www.rise.trade/api/bridge').replace(/\/+$/u, '');
const RISEX_FILL_LOOKBACK_LIMIT = Math.max(10, Math.min(250, Number(process.env.RISEX_FILL_LOOKBACK_LIMIT || 100)));
const RISEX_RISE_CHAIN_ID = 4153;
const ERC20_BALANCE_OF_SELECTOR = '0x70a08231';
const BASE_ALCHEMY_KEY = String(process.env.BASE_ALCHEMY_KEY || process.env.ALCHEMY_BASE_API_KEY || '').trim();
const BASE_ALCHEMY_RPC = BASE_ALCHEMY_KEY
  ? `https://base-mainnet.g.alchemy.com/v2/${encodeURIComponent(BASE_ALCHEMY_KEY)}`
  : '';
const RISEX_DEFAULT_RPC_URLS = Object.freeze({
  1: ['https://ethereum-rpc.publicnode.com', 'https://rpc.ankr.com/eth'],
  8453: [...(BASE_ALCHEMY_RPC ? [BASE_ALCHEMY_RPC] : []), 'https://mainnet.base.org'],
  42161: ['https://arb1.arbitrum.io/rpc', 'https://arbitrum-one-rpc.publicnode.com'],
  [RISEX_RISE_CHAIN_ID]: ['https://rpc.risechain.com'],
});
const RISEX_BRIDGE_CHAINS = Object.freeze({
  1: {
    id: 1,
    key: 'ethereum',
    name: 'Ethereum',
    lzEid: 30101,
    usdc: '0xa0b86991c6218b36c1d19d4a2e9eb0ce3606eb48',
  },
  8453: {
    id: 8453,
    key: 'base',
    name: 'Base',
    lzEid: 30184,
    usdc: '0x833589fcd6edb6e08f4c7c32d4f71b54bda02913',
  },
  42161: {
    id: 42161,
    key: 'arbitrum',
    name: 'Arbitrum',
    lzEid: 30110,
    usdc: '0xaf88d065e77c8cc2239327c5edb3a432268e5831',
  },
  [RISEX_RISE_CHAIN_ID]: {
    id: RISEX_RISE_CHAIN_ID,
    key: 'rise',
    name: 'RISE',
    lzEid: 30401,
    usdc: '0xe436820ba0c69702c1d3e601d421c0ef38262739',
  },
});

function isEvmAddress(addr) {
  return /^0x[0-9a-fA-F]{40}$/.test(String(addr || '').trim());
}

function normalizeAddress(addr) {
  const s = String(addr || '').trim().toLowerCase();
  return isEvmAddress(s) ? s : null;
}

function splitList(value) {
  return String(value || '')
    .split(/[,\s]+/)
    .map(s => s.trim())
    .filter(Boolean);
}

function rpcUrlsForChain(chainId) {
  const id = Number(chainId);
  const envValue = id === 1
    ? process.env.RISEX_ETHEREUM_RPC_URLS || process.env.ETHEREUM_RPC_URLS || process.env.ETH_RPC_URLS || process.env.ETHEREUM_RPC_URL || process.env.ETH_RPC_URL
    : id === 8453
      ? process.env.RISEX_BASE_RPC_URLS || process.env.BASE_RPC_URLS || process.env.BASE_RPC_URL
      : id === 42161
        ? process.env.RISEX_ARBITRUM_RPC_URLS || process.env.ARBITRUM_RPC_URLS || process.env.ARBITRUM_RPC_URL
        : id === RISEX_RISE_CHAIN_ID
          ? process.env.RISEX_RISE_RPC_URLS || process.env.RISE_RPC_URLS || process.env.RISE_RPC_URL
          : '';
  const fromEnv = splitList(envValue);
  return fromEnv.length ? fromEnv : (RISEX_DEFAULT_RPC_URLS[id] || []);
}

function num(value, fallback = 0) {
  const n = Number(value);
  return Number.isFinite(n) ? n : fallback;
}

function fixed18(value, fallback = 0) {
  if (value == null || value === '') return fallback;
  const text = String(value).trim();
  const n = Number(text);
  if (!Number.isFinite(n)) return fallback;
  // RISEx position snapshots currently expose on-chain fixed-18 integers
  // for size, quote amount, prices, and leverage, while trade history returns
  // decimal strings. Only scale whole integer-looking values so decimals like
  // "76639.4" pass through unchanged.
  if (/^-?\d+$/u.test(text) && Math.abs(n) >= 1e9) return n / 1e18;
  return n;
}

function rows(payload, keys = []) {
  if (Array.isArray(payload)) return payload;
  for (const key of keys) {
    if (Array.isArray(payload?.[key])) return payload[key];
    if (Array.isArray(payload?.data?.[key])) return payload.data[key];
  }
  if (Array.isArray(payload?.data)) return payload.data;
  return [];
}

function unwrap(payload) {
  if (payload && typeof payload === 'object' && payload.data && !Array.isArray(payload)) {
    return payload.data;
  }
  return payload;
}

function errorText(data, fallback = '') {
  if (typeof data === 'string') return data;
  return data?.message
    || data?.error?.message
    || data?.error
    || data?.detail?.message
    || data?.detail
    || fallback;
}

async function apiRequest(path, { method = 'GET', body, signal } = {}) {
  const url = `${RISEX_API}${path.startsWith('/') ? path : `/${path}`}`;
  const controller = signal ? null : new AbortController();
  const timeout = controller ? setTimeout(() => controller.abort(), 15_000) : null;
  try {
    const res = await fetch(url, {
      method,
      headers: {
        accept: 'application/json',
        ...(body ? { 'content-type': 'application/json' } : {}),
      },
      body: body ? JSON.stringify(body) : undefined,
      signal: signal || controller?.signal,
    });
    const text = await res.text();
    let data = null;
    try { data = text ? JSON.parse(text) : null; } catch { data = text; }
    if (!res.ok) {
      const msg = errorText(data, text);
      throw new Error(`RISEx ${method} ${path} ${res.status}: ${msg || 'request failed'}`);
    }
    return unwrap(data);
  } finally {
    if (timeout) clearTimeout(timeout);
  }
}

async function bridgeRequest(path, { method = 'GET', body, signal } = {}) {
  const url = `${RISEX_BRIDGE_API}${path.startsWith('/') ? path : `/${path}`}`;
  const controller = signal ? null : new AbortController();
  const timeout = controller ? setTimeout(() => controller.abort(), 30_000) : null;
  try {
    const res = await fetch(url, {
      method,
      headers: {
        accept: 'application/json',
        ...(body ? { 'content-type': 'application/json' } : {}),
      },
      body: body ? JSON.stringify(body) : undefined,
      signal: signal || controller?.signal,
    });
    const text = await res.text();
    let data = null;
    try { data = text ? JSON.parse(text) : null; } catch { data = text; }
    if (!res.ok) {
      const msg = errorText(data, text);
      throw new Error(`RISEx bridge ${method} ${path} ${res.status}: ${msg || 'request failed'}`);
    }
    return unwrap(data);
  } finally {
    if (timeout) clearTimeout(timeout);
  }
}

function bridgeChain(chainId) {
  const id = Number(chainId || 42161);
  const chain = RISEX_BRIDGE_CHAINS[id];
  if (!chain) throw new Error(`Unsupported RISEx bridge source chain: ${chainId}`);
  return chain;
}

function bridgeDappId(sourceChainId) {
  return Number(sourceChainId) === RISEX_RISE_CHAIN_ID ? 0 : 1;
}

function balanceOfCallData(account) {
  const clean = normalizeAddress(account);
  if (!clean) throw new Error('account required (0x...)');
  return `${ERC20_BALANCE_OF_SELECTOR}${clean.slice(2).padStart(64, '0')}`;
}

async function rpcRequest(url, method, params) {
  const res = await fetch(url, {
    method: 'POST',
    headers: { accept: 'application/json', 'content-type': 'application/json' },
    body: JSON.stringify({ jsonrpc: '2.0', id: Date.now(), method, params }),
  });
  const text = await res.text();
  let data = null;
  try { data = text ? JSON.parse(text) : null; } catch { data = null; }
  if (!res.ok || data?.error) {
    throw new Error(data?.error?.message || text || `RPC ${method} failed (${res.status})`);
  }
  return data?.result;
}

async function readErc20Balance({ chainId, token, account }) {
  const cleanToken = normalizeAddress(token);
  const cleanAccount = normalizeAddress(account);
  if (!cleanToken) throw new Error('token required (0x...)');
  if (!cleanAccount) throw new Error('account required (0x...)');
  const urls = rpcUrlsForChain(chainId);
  if (!urls.length) throw new Error(`No RPC configured for chain ${chainId}`);
  const data = balanceOfCallData(cleanAccount);
  let lastError = null;
  for (const url of urls) {
    try {
      const result = await rpcRequest(url, 'eth_call', [{ to: cleanToken, data }, 'latest']);
      if (!/^0x[0-9a-fA-F]*$/u.test(String(result || ''))) {
        throw new Error(`Invalid RPC balance response: ${String(result || '').slice(0, 80)}`);
      }
      return BigInt(result || '0x0');
    } catch (e) {
      lastError = e;
    }
  }
  throw new Error(lastError?.message || `Failed to read ERC20 balance on chain ${chainId}`);
}

async function getBridgeSourceUsdcBalance(account, opts = {}) {
  const clean = normalizeAddress(account);
  if (!clean) throw new Error('account required (0x...)');
  const source = bridgeChain(opts.sourceChainId);
  const raw = await readErc20Balance({
    chainId: source.id,
    token: source.usdc,
    account: clean,
  });
  const balance = Number(raw) / 1e6;
  return {
    account: clean,
    source_chain_id: source.id,
    source_chain: source.name,
    usdc: source.usdc,
    balance_raw: raw.toString(),
    balance_usdc: balance,
    balance,
  };
}

function symbolOf(value) {
  return String(value || '')
    .trim()
    .toUpperCase()
    .replace(/-PERP$/u, '')
    .replace(/\/USDC$/u, '')
    .replace(/\/USD$/u, '');
}

function normalizeMarket(m) {
  const cfg = m?.config || m;
  const state = m?.state || m;
  const marketId = Number(m?.market_id ?? m?.id);
  const symbol = symbolOf(
    m?.base_symbol
    || m?.symbol
    || m?.market_name
    || m?.name
    || m?.base_asset_symbol
    || m?.display_base_asset_symbol
    || m?.display_name
    || m?.underlying
    || cfg?.name
  );
  if (!Number.isFinite(marketId) || !symbol) return null;
  const mark = num(state?.mark_price ?? state?.mark ?? state?.index_price ?? state?.oracle_price ?? m?.mark_price);
  const stepSize = num(cfg?.step_size ?? m?.step_size, 0.000001);
  const stepPrice = num(cfg?.step_price ?? m?.step_price, mark >= 1000 ? 0.1 : 0.01);
  return {
    symbol,
    base: symbol,
    pair: `${symbol}/USDC`,
    market_name: `${symbol}/USDC`,
    market_id: marketId,
    asset_id: marketId,
    pair_index: marketId,
    lot_size: String(stepSize || 0.000001),
    tick_size: String(stepPrice || 0.1),
    min_order_size: String(cfg?.min_order_size ?? stepSize ?? 0.000001),
    max_leverage: Number(cfg?.max_leverage ?? m?.max_leverage ?? 25),
    mark,
    mid: num(state?.mid_price ?? state?.mid ?? mark),
    oracle: num(state?.oracle_price ?? mark),
    volume_24h: num(state?.volume_24h ?? state?.quote_volume_24h ?? state?.daily_volume ?? m?.volume_24h ?? m?.quote_volume_24h),
    open_interest: num(state?.open_interest ?? m?.open_interest),
    funding_rate: num(state?.funding_rate ?? state?.current_funding_rate ?? m?.funding_rate ?? m?.current_funding_rate),
    _risex: { marketId, stepSize, stepPrice, raw: m },
    _raw: m,
  };
}

async function getSystemConfig() {
  return apiRequest('/v1/system/config');
}

async function getEip712Domain() {
  const data = await apiRequest('/v1/auth/eip712-domain');
  return {
    name: data?.name || 'RISEx',
    version: data?.version || '1',
    chainId: Number(data?.chain_id ?? data?.chainId ?? 4153),
    verifyingContract: data?.verifying_contract || data?.verifyingContract,
    ...data,
  };
}

async function getNonceState(account) {
  if (!isEvmAddress(account)) throw new Error('account query param required (0x...)');
  return apiRequest(`/v1/nonce-state/${account}`);
}

async function getSigners(account) {
  if (!isEvmAddress(account)) throw new Error('account query param required (0x...)');
  return apiRequest(`/v1/auth/signers?account=${encodeURIComponent(account)}`);
}

async function getSessionKeyStatus(account, signer) {
  if (!isEvmAddress(account) || !isEvmAddress(signer)) throw new Error('account and signer required (0x...)');
  return apiRequest(`/v1/auth/session-key-status?account=${encodeURIComponent(account)}&signer=${encodeURIComponent(signer)}`);
}

async function registerSigner(body) {
  return apiRequest('/v1/auth/register-signer', { method: 'POST', body });
}

function inviteStatusImpliesAccess(check, accountInfo) {
  const status = String(accountInfo?.status || check?.status || check?.invite_status || '').toLowerCase();
  // PENDING = already redeemed / waiting activation — do NOT re-ask for a code.
  // Live: invite/check often reports has_access=false + status PENDING for traders
  // who already use RISEx on the native site.
  return /\b(pending|active|approved|redeemed|access|enabled|exists|whitelisted)\b/u.test(status);
}

function inviteHasAccess(check, accountInfo) {
  if (accountInfo?.has_access === true || check?.has_access === true) return true;
  if (check?.redeemed === true || accountInfo?.redeemed === true) return true;
  if (inviteStatusImpliesAccess(check, accountInfo)) return true;
  const errBlob = `${check?.error || ''} ${accountInfo?.error || ''}`.toLowerCase();
  if (/account already exists|already redeemed|already has access|already registered/i.test(errBlob)) {
    return true;
  }
  if (accountInfo?.has_access != null) return accountInfo.has_access === true;
  if (check?.has_access != null) return check.has_access === true;
  return false;
}

/** Secondary proof the wallet is already onboarded on RISEx (no invite code needed). */
async function inferAccessFromTradingEvidence(account) {
  const clean = normalizeAddress(account);
  if (!clean) return { has_access: false, evidence: null };
  try {
    const [signers, positions, orders] = await Promise.all([
      getSigners(clean).catch(() => null),
      getPositionsByAddress(clean).catch(() => []),
      getOrdersByAddress(clean).catch(() => []),
    ]);
    const signerRows = Array.isArray(signers)
      ? signers
      : (Array.isArray(signers?.signers) ? signers.signers : []);
    if (signerRows.length > 0) {
      return { has_access: true, evidence: 'existing_signers' };
    }
    if (Array.isArray(positions) && positions.length > 0) {
      return { has_access: true, evidence: 'open_positions' };
    }
    if (Array.isArray(orders) && orders.length > 0) {
      return { has_access: true, evidence: 'open_orders' };
    }
  } catch (e) {
    console.warn('[risex] access evidence probe failed:', e?.message || e);
  }
  return { has_access: false, evidence: null };
}

async function getInviteStatus(account) {
  if (!isEvmAddress(account)) throw new Error('account query param required (0x...)');
  const clean = normalizeAddress(account);
  const [check, accountInfo] = await Promise.all([
    apiRequest(`/v1/invite/check/${clean}`).catch(e => ({ error: e.message })),
    apiRequest(`/v1/invite/account/${clean}`).catch(e => ({ error: e.message })),
  ]);
  let hasAccess = inviteHasAccess(check, accountInfo);
  let accessEvidence = hasAccess
    ? (inviteStatusImpliesAccess(check, accountInfo) ? 'invite_status' : 'invite_flags')
    : null;
  // Invite API flakes: false/empty while the wallet already trades on rise.trade.
  if (!hasAccess) {
    const inferred = await inferAccessFromTradingEvidence(clean);
    if (inferred.has_access) {
      hasAccess = true;
      accessEvidence = inferred.evidence;
    }
  }
  return {
    ...check,
    ...accountInfo,
    redeemed: check?.redeemed === true || accountInfo?.redeemed === true || hasAccess,
    has_access: hasAccess,
    access_evidence: accessEvidence,
    check_error: check?.error || null,
    account_error: accountInfo?.error || null,
  };
}

async function redeemInvite(body) {
  return apiRequest('/v1/invite/redeem', { method: 'POST', body });
}

async function acceptTerms(account) {
  if (!isEvmAddress(account)) throw new Error('account required (0x...)');
  return apiRequest('/v1/terms/accept', { method: 'POST', body: { account: normalizeAddress(account) } });
}

async function placeOrder(body) {
  return apiRequest('/v1/orders/place', { method: 'POST', body });
}

async function cancelOrder(body) {
  return apiRequest('/v1/orders/cancel', { method: 'POST', body });
}

async function getBridgeDepositAddress({ account, sourceChainId = 42161, destChainId = RISEX_RISE_CHAIN_ID } = {}) {
  const clean = normalizeAddress(account);
  if (!clean) throw new Error('account required (0x...)');
  const source = bridgeChain(sourceChainId);
  const dest = bridgeChain(destChainId);
  if (dest.id !== RISEX_RISE_CHAIN_ID) throw new Error('RISEx deposits must target RISE mainnet');
  if (source.id === dest.id) throw new Error('RISEx bridge deposits must come from Ethereum, Arbitrum, or Base');
  const body = {
    srcEid: source.lzEid,
    dstEid: dest.lzEid,
    srcAddr: clean,
    dstAddr: clean,
    dappId: bridgeDappId(source.id),
    direction: 'deposit',
  };
  const data = await bridgeRequest('/address', { method: 'POST', body });
  const address = normalizeAddress(data?.address || data?.depositAddress || data?.deposit_address);
  if (!address) throw new Error('RISEx bridge did not return a deposit address');
  return {
    ...data,
    address,
    account: clean,
    direction: 'deposit',
    source_chain_id: source.id,
    source_chain: source.name,
    source_lz_eid: source.lzEid,
    source_usdc: source.usdc,
    dest_chain_id: dest.id,
    dest_chain: dest.name,
    dest_lz_eid: dest.lzEid,
    dapp_id: body.dappId,
  };
}

async function processBridgeDeposit({ account, sourceChainId = 42161, destChainId = RISEX_RISE_CHAIN_ID, txHash } = {}) {
  const clean = normalizeAddress(account);
  if (!clean) throw new Error('account required (0x...)');
  const hash = String(txHash || '').trim();
  if (!/^0x[0-9a-fA-F]{64}$/u.test(hash)) throw new Error('source transfer tx_hash required');
  const source = bridgeChain(sourceChainId);
  const dest = bridgeChain(destChainId);
  if (dest.id !== RISEX_RISE_CHAIN_ID) throw new Error('RISEx deposits must target RISE mainnet');
  if (source.id === dest.id) throw new Error('RISEx bridge deposits must come from Ethereum, Arbitrum, or Base');
  const body = {
    srcEid: source.lzEid,
    dstEid: dest.lzEid,
    userTransferTxHash: hash,
    token: source.usdc,
    receiver: clean,
    dappId: bridgeDappId(source.id),
  };
  const data = await bridgeRequest('/process', { method: 'POST', body });
  return {
    ...data,
    account: clean,
    tx_hash: hash,
    source_chain_id: source.id,
    source_chain: source.name,
    source_lz_eid: source.lzEid,
    dest_chain_id: dest.id,
    dest_chain: dest.name,
    dest_lz_eid: dest.lzEid,
  };
}

async function getBridgeStatus(jobId) {
  const clean = String(jobId || '').trim();
  if (!clean) throw new Error('jobId required');
  return bridgeRequest(`/status?jobId=${encodeURIComponent(clean)}`);
}

async function getBridgeHistory(account, opts = {}) {
  const clean = normalizeAddress(account);
  if (!clean) throw new Error('account query param required (0x...)');
  const params = new URLSearchParams({
    address: clean,
    limit: String(Math.max(1, Math.min(100, Number(opts.limit) || 20))),
    offset: String(Math.max(0, Number(opts.offset) || 0)),
  });
  return bridgeRequest(`/history?${params.toString()}`);
}

async function getTransferHistory(account, opts = {}) {
  const clean = normalizeAddress(account);
  if (!clean) throw new Error('account query param required (0x...)');
  const params = new URLSearchParams({ account: clean });
  if (opts.type) params.set('type', String(opts.type));
  if (opts.limit) params.set('limit', String(Math.max(1, Math.min(1000, Number(opts.limit) || 100))));
  if (opts.page) params.set('page', String(Math.max(1, Number(opts.page) || 1)));
  return apiRequest(`/v1/account/transfer-history?${params.toString()}`);
}

async function getMarketInfo() {
  const payload = await apiRequest('/v1/markets');
  return rows(payload, ['markets']).map(normalizeMarket).filter(Boolean);
}

async function marketMap() {
  const markets = await getMarketInfo();
  return new Map(markets.map(m => [Number(m.market_id), m]));
}

async function getPrices() {
  const markets = await getMarketInfo();
  return markets.map(m => ({
    symbol: m.symbol,
    mark: String(m.mark || ''),
    mid: String(m.mid || m.mark || ''),
    oracle: String(m.oracle || m.mark || ''),
    volume_24h: m.volume_24h || 0,
    open_interest: String(m.open_interest || 0),
    funding_rate: m.funding_rate || 0,
  }));
}

function normalizeBalance(data) {
  const balance = data?.balance || data || {};
  const equity = num(balance?.margin_balance ?? balance?.account_equity ?? balance?.equity ?? balance?.total ?? balance);
  const available = num(balance?.available_balance ?? balance?.available_to_spend ?? balance?.withdrawable ?? balance?.free ?? equity);
  const marginUsed = num(balance?.initial_margin ?? balance?.maintenance_margin ?? balance?.margin_used ?? balance?.total_margin_used);
  return {
    balance: String(equity),
    usdc: String(equity),
    account_equity: String(equity),
    available_to_spend: String(available),
    available_to_withdraw: String(available),
    total_margin_used: String(marginUsed),
    positions_count: Number(balance?.positions_count || 0),
    orders_count: Number(balance?.orders_count || 0),
    maker_fee: 0.0002,
    taker_fee: 0.0005,
    _raw: data,
  };
}

async function getAccountByAddress(address) {
  const clean = normalizeAddress(address);
  if (!clean) throw new Error('address query param required (0x...)');
  try {
    return normalizeBalance(await apiRequest(`/v1/account/cross-margin-balance?account=${clean}`));
  } catch (e) {
    if (/failed to get cross margin balance|not found|404/i.test(e.message || '')) {
      return normalizeBalance({ balance: 0 });
    }
    throw e;
  }
}

function sideFromValue(value) {
  const s = String(value || '').toLowerCase();
  if (s === 'short' || s === 'sell' || s === 'ask' || s === '1') return 'ask';
  return 'bid';
}

function normalizePosition(p, byMarket) {
  const marketId = Number(p?.market_id ?? p?.marketId ?? p?.market);
  const market = byMarket.get(marketId);
  const symbol = symbolOf(p?.symbol || p?.market_symbol || market?.symbol);
  const rawSize = fixed18(p?.size ?? p?.position_size ?? p?.base_size ?? p?.quantity);
  const amount = Math.abs(rawSize);
  if (!symbol || amount <= 0) return null;
  const entry = fixed18(p?.entry_price ?? p?.avg_entry_price ?? p?.entryPrice);
  const mark = fixed18(p?.mark_price ?? p?.markPrice, market?.mark || entry);
  const quoteAmount = fixed18(p?.quote_amount ?? p?.quoteAmount, 0);
  const notional = Math.abs(quoteAmount) > 0
    ? Math.abs(quoteAmount)
    : amount * (mark || entry || 0);
  const leverage = fixed18(p?.leverage, 1);
  const margin = fixed18(p?.margin ?? p?.margin_used, notional / Math.max(1, leverage || 1));
  const pnlSource = p?.unrealized_pnl ?? p?.unrealizedPnl ?? p?.pnl;
  const pnl = pnlSource == null || pnlSource === '' ? null : fixed18(pnlSource, 0);
  const pnlPctSource = p?.roe ?? p?.pnl_pct;
  const pnlPct = pnlPctSource == null || pnlPctSource === '' ? null : num(pnlPctSource);
  const liquidation = fixed18(p?.liquidation_price, 0);
  return {
    symbol,
    side: rawSize < 0 ? 'ask' : sideFromValue(p?.side),
    amount: String(amount),
    size_usd: fixed18(p?.position_value ?? p?.notional, notional),
    entry_price: String(entry),
    mark_price: String(mark),
    liquidation_price: liquidation > 0 ? String(liquidation) : null,
    margin: String(margin),
    leverage: String(leverage),
    pnl_usd: pnl == null ? null : String(pnl),
    pnl_pct: pnlPct,
    pair_index: marketId,
    trade_index: null,
    is_isolated: String(p?.margin_mode || '').toLowerCase() === 'isolated',
    _raw: p,
  };
}

async function getPositionsByAddress(address) {
  const clean = normalizeAddress(address);
  if (!clean) throw new Error('address query param required (0x...)');
  const [payload, byMarket] = await Promise.all([
    apiRequest(`/v1/positions?account=${clean}`).catch(() => ({ positions: [] })),
    marketMap(),
  ]);
  return rows(payload, ['positions']).map(p => normalizePosition(p, byMarket)).filter(Boolean);
}

function normalizeOrder(o, byMarket) {
  const marketId = Number(o?.market_id ?? o?.marketId ?? o?.market);
  const market = byMarket.get(marketId);
  const symbol = symbolOf(o?.symbol || o?.market_symbol || market?.symbol);
  if (!symbol) return null;
  const amount = o?.size_steps != null
    ? Math.abs(num(o.size_steps) * num(market?._risex?.stepSize, 1))
    : Math.abs(num(o?.size ?? o?.quantity));
  const initialAmount = o?.original_size_steps != null
    ? Math.abs(num(o.original_size_steps) * num(market?._risex?.stepSize, 1))
    : Math.abs(num(o?.original_size ?? o?.size ?? o?.quantity));
  const price = o?.price_ticks != null
    ? num(o.price_ticks) * num(market?._risex?.stepPrice, 1)
    : num(o?.price ?? o?.limit_price);
  return {
    symbol,
    side: sideFromValue(o?.side),
    amount: String(amount),
    initial_amount: String(initialAmount),
    price: String(price),
    stop_price: o?.trigger_price != null ? String(o.trigger_price) : null,
    order_id: o?.order_id ?? o?.resting_order_id ?? o?.id,
    resting_order_id: o?.resting_order_id ?? null,
    order_type: String(o?.order_type ?? o?.type ?? 'limit').toLowerCase(),
    tif: o?.time_in_force ?? o?.tif ?? null,
    reduce_only: !!(o?.reduce_only ?? o?.reduceOnly),
    pair_index: marketId,
    trade_index: null,
    client_order_id: o?.client_order_id ?? null,
    _raw: o,
  };
}

async function getOrdersByAddress(address) {
  const clean = normalizeAddress(address);
  if (!clean) throw new Error('address query param required (0x...)');
  const [payload, byMarket] = await Promise.all([
    apiRequest(`/v1/orders/open?account=${clean}`).catch(() => ({ orders: [] })),
    marketMap(),
  ]);
  return rows(payload, ['orders']).map(o => normalizeOrder(o, byMarket)).filter(Boolean);
}

async function getAccountTradeHistory(address, { marketId, limit = RISEX_FILL_LOOKBACK_LIMIT } = {}) {
  const clean = normalizeAddress(address);
  if (!clean) throw new Error('wallet required (0x...)');
  let path = `/v1/trade-history?account=${clean}&limit=${Math.max(1, Math.min(250, Number(limit) || RISEX_FILL_LOOKBACK_LIMIT))}`;
  if (marketId != null) path += `&market_id=${encodeURIComponent(marketId)}`;
  const payload = await apiRequest(path);
  return rows(payload, ['fills', 'trades']);
}

function fillTime(fill) {
  const raw = fill?.timestamp ?? fill?.time ?? fill?.created_at ?? fill?.createdAt;
  const n = Number(raw);
  if (Number.isFinite(n) && n > 0) return n > 1e12 ? n : n * 1000;
  const parsed = Date.parse(raw || '');
  return Number.isFinite(parsed) ? parsed : 0;
}

function tradeKey(wallet, fill) {
  const base = [
    fill?.fill_id,
    fill?.trade_id,
    fill?.order_id,
    fill?.client_order_id,
    fillTime(fill),
    fill?.market_id,
    fill?.price,
    fill?.size,
  ].filter(v => v !== undefined && v !== null && v !== '').join(':');
  return `risex:${String(wallet).toLowerCase()}:${base || JSON.stringify(fill).slice(0, 120)}`;
}

function normalizeFill(wallet, fill, byMarket) {
  const marketId = Number(fill?.market_id ?? fill?.marketId ?? fill?.market);
  const market = byMarket.get(marketId);
  const symbol = symbolOf(fill?.symbol || fill?.market_symbol || market?.symbol);
  const amount = fill?.size_steps != null
    ? Math.abs(num(fill.size_steps) * num(market?._risex?.stepSize, 1))
    : Math.abs(num(fill?.size ?? fill?.quantity ?? fill?.base_size));
  const price = fill?.price_ticks != null
    ? num(fill.price_ticks) * num(market?._risex?.stepPrice, 1)
    : num(fill?.price ?? fill?.fill_price ?? fill?.execution_price);
  const notional = num(fill?.notional ?? fill?.notional_usd, price * amount);
  if (!symbol || !Number.isFinite(notional) || notional < 1 || notional > 10_000_000) return null;
  const reduceOnly = fill?.reduce_only === true || fill?.reduceOnly === true || /close/i.test(String(fill?.direction || fill?.type || ''));
  const side = sideFromValue(fill?.side);
  return {
    symbol,
    side: reduceOnly ? (side === 'bid' ? 'close_short' : 'close_long') : (side === 'bid' ? 'long' : 'short'),
    orderType: reduceOnly ? 'close' : String(fill?.order_type || fill?.type || 'market').toLowerCase(),
    amount: String(amount),
    price: String(price),
    orderId: fill?.order_id ?? fill?.trade_id ?? null,
    clientOrderId: tradeKey(wallet, fill),
    status: 'filled',
    dex: 'risex',
    notional_usd: notional,
    verifiedSource: 'risex_api',
    pnl: fill?.realized_pnl != null ? String(fill.realized_pnl) : null,
  };
}

async function importFillsForPlayer(playerId, wallet, opts = {}) {
  const cleanWallet = normalizeAddress(wallet);
  if (!cleanWallet) return { ok: false, imported: 0, skipped: 0, total: 0, reason: 'invalid_evm_wallet' };
  const db = require('./db');
  const attempts = Math.max(1, Math.min(6, Number(opts.attempts || 1)));
  const delayMs = Math.max(250, Math.min(5000, Number(opts.delayMs || 1500)));
  let fills = [];
  let byMarket = new Map();
  for (let i = 0; i < attempts; i += 1) {
    [fills, byMarket] = await Promise.all([
      getAccountTradeHistory(cleanWallet, { limit: opts.limit || RISEX_FILL_LOOKBACK_LIMIT }).catch(() => []),
      marketMap().catch(() => new Map()),
    ]);
    if (Array.isArray(fills) && fills.length) break;
    if (i < attempts - 1) await new Promise(r => setTimeout(r, delayMs));
  }
  if (!Array.isArray(fills)) fills = [];

  let imported = 0;
  let adopted = 0;
  let skipped = 0;
  for (const fill of fills) {
    const trade = normalizeFill(cleanWallet, fill, byMarket);
    if (!trade) { skipped++; continue; }
    try {
      const before = db.db.prepare('SELECT id, player_id FROM trade_history WHERE client_order_id = ?').get(trade.clientOrderId);
      if (before) {
        if (before.player_id !== playerId) {
          const moved = db.db.prepare(`
            UPDATE trade_history
            SET player_id = ?
            WHERE id = ? AND dex = 'risex' AND verified_source = 'risex_api'
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
        console.warn('[risex] addTrade failed:', e.message);
      }
    }
  }
  return { ok: true, imported, adopted, skipped, total: fills.length };
}

module.exports = {
  RISEX_API,
  RISEX_BRIDGE_API,
  RISEX_BRIDGE_CHAINS,
  isEvmAddress,
  normalizeAddress,
  apiRequest,
  bridgeRequest,
  getSystemConfig,
  getEip712Domain,
  getNonceState,
  getSigners,
  getSessionKeyStatus,
  registerSigner,
  getInviteStatus,
  inviteHasAccess,
  inferAccessFromTradingEvidence,
  redeemInvite,
  acceptTerms,
  placeOrder,
  cancelOrder,
  getBridgeDepositAddress,
  getBridgeSourceUsdcBalance,
  processBridgeDeposit,
  getBridgeStatus,
  getBridgeHistory,
  getTransferHistory,
  getMarketInfo,
  getPrices,
  getAccountByAddress,
  getPositionsByAddress,
  getOrdersByAddress,
  getAccountTradeHistory,
  importFillsForPlayer,
};
