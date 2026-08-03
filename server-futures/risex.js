const RISEX_API = String(process.env.RISEX_API_URL || 'https://api.rise.trade').replace(/\/+$/u, '');
const RISEX_BRIDGE_API = String(process.env.RISEX_BRIDGE_API_URL || 'https://www.rise.trade/api/bridge').replace(/\/+$/u, '');
const RISEX_BRIDGE_HISTORY_API = String(
  process.env.RISEX_BRIDGE_HISTORY_API_URL || 'https://api.bridge.risechain.com/v1/bridge',
).replace(/\/+$/u, '');
const RISEX_FILL_LOOKBACK_LIMIT = Math.max(10, Math.min(1000, Number(process.env.RISEX_FILL_LOOKBACK_LIMIT || 100)));
const RISEX_RISE_CHAIN_ID = 4153;
const RISEX_BUILDER_FEE_RECIPIENT = String(
  process.env.RISEX_BUILDER_FEE_RECIPIENT || '0x39B36f1EDF2eF5a6f2e02991b3a85Fb356eB5005',
).trim().toLowerCase();
const RISEX_BUILDER_ID = (() => {
  const value = Number(process.env.RISEX_BUILDER_ID || 10);
  return Number.isInteger(value) && value > 0 && value <= 65_535 ? value : 10;
})();
// RISEx denominates this field in hundredths of a basis point: 100 = 1 bps.
const RISEX_BUILDER_FEE_BPS = 100;
const RISEX_FEE_MANAGER_ADDRESS = String(
  process.env.RISEX_FEE_MANAGER_ADDRESS || '0x11541dc387b9C307043ea732127DF92b80bab52b',
).trim().toLowerCase();
const RISEX_EXPLORER_API = String(
  process.env.RISEX_EXPLORER_API_URL || 'https://explorer.risechain.com/api',
).trim();
const RISEX_FEE_MANAGER_DEPLOYMENT_BLOCK = Math.max(
  0,
  Number(process.env.RISEX_FEE_MANAGER_DEPLOYMENT_BLOCK || 7_345_361),
);
const RISEX_GET_BUILDER_INFO_SELECTOR = '0x18726b21';
const RISEX_GET_ACCOUNT_REGISTRY_SELECTOR = '0x0ab142ed';
const RISEX_GET_USER_ID_SELECTOR = '0x2b956ff7';
const RISEX_GET_BUILDER_MAX_FEE_BPS_SELECTOR = '0xeeb43af8';
const RISEX_BUILDER_MAX_FEE_APPROVED_TOPIC = '0x481214c985f009a837ac9f61b88ad1d32a7e25be02d470b8d6942d3629b288dc';
const RISEX_BUILDER_CACHE_MS = Math.max(
  15_000,
  Number(process.env.RISEX_BUILDER_CACHE_MS || 5 * 60_000),
);
const RISEX_BUILDER_APPROVAL_CACHE_MS = Math.max(
  5_000,
  Number(process.env.RISEX_BUILDER_APPROVAL_CACHE_MS || 15_000),
);
const RISEX_ORDER_PROOF_CACHE_MS = Math.max(
  15_000,
  Number(process.env.RISEX_ORDER_PROOF_CACHE_MS || 10 * 60_000),
);
const RISEX_MARKET_CACHE_MS = Math.max(
  15_000,
  Number(process.env.RISEX_MARKET_CACHE_MS || 60_000),
);
const RISEX_PLACE_ORDER_TOPIC = '0x91b555b0d6e41c11a3e63bf27ce5de22d51f82ff6127a7aa895593945a344b5c';
const RISEX_PLACE_ORDER_WORD_COUNT = 15;
const RISEX_PLACE_ORDER_BUILDER_ID_WORD = 11;
const RISEX_PLACE_ORDER_BUILDER_FEE_WORD = 14;
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
let clashBuilderCache = null;
let accountRegistryCache = null;
let systemConfigCache = null;
let systemConfigPromise = null;
let marketInfoCache = null;
let marketInfoPromise = null;
const risexUserIdCache = new Map();
const builderApprovalCache = new Map();
const orderBuilderProofCache = new Map();

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

async function apiRequest(path, { method = 'GET', body, signal, timeoutMs = 15_000 } = {}) {
  const url = `${RISEX_API}${path.startsWith('/') ? path : `/${path}`}`;
  const controller = signal ? null : new AbortController();
  const timeout = controller
    ? setTimeout(() => controller.abort(), Math.max(1_000, Number(timeoutMs) || 15_000))
    : null;
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

async function listBuilders() {
  let data = null;
  let lastError = null;
  for (let attempt = 0; attempt < 2; attempt += 1) {
    try {
      data = await apiRequest('/v1/builders');
      break;
    } catch (error) {
      lastError = error;
      if (attempt === 0) await new Promise(resolve => setTimeout(resolve, 500));
    }
  }
  if (data == null) throw lastError || new Error('RISEx builder registry is unavailable');
  return rows(data, ['builders']).map((entry) => ({
    builder_id: Number(entry?.builder_id ?? entry?.builderId ?? entry?.id),
    fee_recipient: normalizeAddress(entry?.fee_recipient ?? entry?.feeRecipient),
    is_active: entry?.is_active !== false && entry?.isActive !== false,
    raw: entry,
  })).filter(
    entry => Number.isInteger(entry.builder_id)
      && entry.builder_id > 0
      && entry.fee_recipient
      && entry.is_active,
  );
}

function getBuilderInfoCallData(builderId) {
  const value = Number(builderId);
  if (!Number.isInteger(value) || value <= 0 || value > 65_535) {
    throw new Error(`Invalid RISEx builder ID: ${builderId}`);
  }
  return `${RISEX_GET_BUILDER_INFO_SELECTOR}${value.toString(16).padStart(64, '0')}`;
}

function getUserIdCallData(account) {
  const clean = normalizeAddress(account);
  if (!clean) throw new Error('RISEx account required (0x...)');
  return `${RISEX_GET_USER_ID_SELECTOR}${clean.slice(2).padStart(64, '0')}`;
}

function getBuilderMaxFeeBpsCallData(userId, builderId) {
  const canonicalUserId = Number(userId);
  const canonicalBuilderId = Number(builderId);
  if (!Number.isInteger(canonicalUserId) || canonicalUserId < 0 || canonicalUserId > 0xffffffff) {
    throw new Error(`Invalid RISEx user ID: ${userId}`);
  }
  if (!Number.isInteger(canonicalBuilderId) || canonicalBuilderId <= 0 || canonicalBuilderId > 65_535) {
    throw new Error(`Invalid RISEx builder ID: ${builderId}`);
  }
  return `${RISEX_GET_BUILDER_MAX_FEE_BPS_SELECTOR}`
    + `${canonicalUserId.toString(16).padStart(64, '0')}`
    + `${canonicalBuilderId.toString(16).padStart(64, '0')}`;
}

function decodeAddressResult(result, label) {
  const payload = String(result || '').replace(/^0x/u, '');
  if (!/^[0-9a-fA-F]{64}$/u.test(payload)) {
    throw new Error(`RISEx ${label} returned malformed address data`);
  }
  const address = normalizeAddress(`0x${payload.slice(24)}`);
  if (!address) throw new Error(`RISEx ${label} returned an invalid address`);
  return address;
}

function decodeUintResult(result, max, label) {
  const payload = String(result || '').replace(/^0x/u, '');
  if (!/^[0-9a-fA-F]{64}$/u.test(payload)) {
    throw new Error(`RISEx ${label} returned malformed integer data`);
  }
  const value = BigInt(`0x${payload}`);
  if (value > BigInt(max)) {
    throw new Error(`RISEx ${label} returned a value outside its supported range`);
  }
  return Number(value);
}

function decodeBuilderInfoResult(result) {
  const payload = String(result || '').replace(/^0x/u, '');
  if (!/^[0-9a-fA-F]{128,}$/u.test(payload) || payload.length % 64 !== 0) {
    throw new Error('RISEx FeeManager returned malformed builder info');
  }
  const feeRecipient = normalizeAddress(`0x${payload.slice(24, 64)}`);
  const activeWord = BigInt(`0x${payload.slice(64, 128)}`);
  if (activeWord !== 0n && activeWord !== 1n) {
    throw new Error('RISEx FeeManager returned an invalid builder active flag');
  }
  return {
    fee_recipient: feeRecipient,
    is_active: activeWord === 1n,
  };
}

async function getBuilderInfoOnchain(builderId = RISEX_BUILDER_ID) {
  if (!isEvmAddress(RISEX_FEE_MANAGER_ADDRESS)) {
    throw new Error('RISEX_FEE_MANAGER_ADDRESS is not a valid EVM address');
  }
  const data = getBuilderInfoCallData(builderId);
  let lastError = null;
  for (const rpcUrl of rpcUrlsForChain(RISEX_RISE_CHAIN_ID)) {
    try {
      const result = await rpcRequest(
        rpcUrl,
        'eth_call',
        [{ to: RISEX_FEE_MANAGER_ADDRESS, data }, 'latest'],
      );
      return {
        builder_id: Number(builderId),
        ...decodeBuilderInfoResult(result),
      };
    } catch (error) {
      lastError = error;
    }
  }
  throw lastError || new Error('No RISE RPC is configured for RISEx builder verification');
}

async function riseEthCall(to, data, label) {
  return riseRpcRequest('eth_call', [{ to, data }, 'latest'], label);
}

async function riseRpcRequest(method, params, label) {
  let lastError = null;
  for (const rpcUrl of rpcUrlsForChain(RISEX_RISE_CHAIN_ID)) {
    try {
      return await rpcRequest(rpcUrl, method, params);
    } catch (error) {
      lastError = error;
    }
  }
  throw lastError || new Error(`No RISE RPC is configured for ${label}`);
}

async function getFeeManagerAccountRegistry() {
  if (accountRegistryCache) return accountRegistryCache;
  const result = await riseEthCall(
    RISEX_FEE_MANAGER_ADDRESS,
    RISEX_GET_ACCOUNT_REGISTRY_SELECTOR,
    'RISEx account registry lookup',
  );
  accountRegistryCache = decodeAddressResult(result, 'FeeManager account registry lookup');
  return accountRegistryCache;
}

async function getRisexUserId(account) {
  const clean = normalizeAddress(account);
  if (!clean) throw new Error('RISEx account required (0x...)');
  if (risexUserIdCache.has(clean)) return risexUserIdCache.get(clean);
  const registry = await getFeeManagerAccountRegistry();
  const result = await riseEthCall(
    registry,
    getUserIdCallData(clean),
    'RISEx user ID lookup',
  );
  const userId = decodeUintResult(result, 0xffffffff, 'account registry user ID lookup');
  risexUserIdCache.set(clean, userId);
  return userId;
}

function decodeBuilderApprovalEventLog(log) {
  const topics = Array.isArray(log?.topics) ? log.topics : [];
  if (String(topics[0] || '').toLowerCase() !== RISEX_BUILDER_MAX_FEE_APPROVED_TOPIC) {
    throw new Error('RISEx builder approval log has an unexpected event topic');
  }
  const data = String(log?.data || '').replace(/^0x/u, '');
  if (!/^[0-9a-fA-F]{128}$/u.test(data)) {
    throw new Error('RISEx builder approval log has malformed event data');
  }
  return {
    user_id: decodeUintResult(topics[1], 0xffffffff, 'builder approval user ID'),
    builder_id: decodeUintResult(topics[2], 65_535, 'builder approval builder ID'),
    old_max_fee_bps: decodeUintResult(`0x${data.slice(0, 64)}`, 65_535, 'old builder fee approval'),
    new_max_fee_bps: decodeUintResult(`0x${data.slice(64, 128)}`, 65_535, 'new builder fee approval'),
    block_number: BigInt(log?.blockNumber || 0).toString(),
    log_index: BigInt(log?.logIndex || 0).toString(),
    transaction_hash: String(log?.transactionHash || '').toLowerCase(),
  };
}

function builderApprovalEventIsLater(left, right) {
  if (!right) return true;
  const leftBlock = BigInt(left?.block_number || 0);
  const rightBlock = BigInt(right?.block_number || 0);
  if (leftBlock !== rightBlock) return leftBlock > rightBlock;
  return BigInt(left?.log_index || 0) > BigInt(right?.log_index || 0);
}

async function findIndexedBuilderApprovalEvent(userId, builderId) {
  const params = new URLSearchParams({
    module: 'logs',
    action: 'getLogs',
    fromBlock: String(RISEX_FEE_MANAGER_DEPLOYMENT_BLOCK),
    toBlock: 'latest',
    address: RISEX_FEE_MANAGER_ADDRESS,
    topic0: RISEX_BUILDER_MAX_FEE_APPROVED_TOPIC,
    topic1: uintTopic(userId),
    topic2: uintTopic(builderId),
    topic0_1_opr: 'and',
    topic0_2_opr: 'and',
    topic1_2_opr: 'and',
  });
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), 10_000);
  try {
    const response = await fetch(`${RISEX_EXPLORER_API}?${params}`, {
      headers: { accept: 'application/json' },
      signal: controller.signal,
    });
    const payload = await response.json().catch(() => null);
    const rawLogs = Array.isArray(payload?.result) ? payload.result : [];
    const noRecords = payload?.status === '0'
      && /no (?:logs|records|transactions) found/i.test(String(payload?.message || payload?.result || ''));
    if (!response.ok || (payload?.status === '0' && !noRecords)) {
      throw new Error(
        payload?.message
        || payload?.result
        || `RISE explorer log query failed (${response.status})`,
      );
    }
    let latest = null;
    for (const raw of rawLogs) {
      const decoded = decodeBuilderApprovalEventLog(raw);
      if (decoded.user_id !== userId || decoded.builder_id !== builderId) continue;
      if (builderApprovalEventIsLater(decoded, latest)) latest = decoded;
    }
    return latest;
  } finally {
    clearTimeout(timeout);
  }
}

async function getBuilderApprovalEventFromReceipt(transactionHash, userId, builderId) {
  const hash = String(transactionHash || '').toLowerCase();
  if (!/^0x[0-9a-f]{64}$/u.test(hash)) {
    throw new Error('RISEx builder approval transaction hash is invalid');
  }
  const receipt = await riseRpcRequest(
    'eth_getTransactionReceipt',
    [hash],
    'RISEx builder approval receipt verification',
  );
  if (!receipt || BigInt(receipt?.status || 0) !== 1n) {
    throw new Error('RISEx builder approval transaction is not confirmed successfully');
  }
  let latest = null;
  for (const log of Array.isArray(receipt?.logs) ? receipt.logs : []) {
    if (normalizeAddress(log?.address) !== RISEX_FEE_MANAGER_ADDRESS) continue;
    if (String(log?.topics?.[0] || '').toLowerCase() !== RISEX_BUILDER_MAX_FEE_APPROVED_TOPIC) continue;
    const decoded = decodeBuilderApprovalEventLog(log);
    if (decoded.user_id !== userId || decoded.builder_id !== builderId) continue;
    if (builderApprovalEventIsLater(decoded, latest)) latest = decoded;
  }
  if (!latest) {
    throw new Error('Confirmed RISEx transaction does not contain the expected builder approval event');
  }
  return latest;
}

async function readBuilderMaxFeeBps(userId, builderId) {
  const result = await riseEthCall(
    RISEX_FEE_MANAGER_ADDRESS,
    getBuilderMaxFeeBpsCallData(userId, builderId),
    'RISEx builder approval lookup',
  );
  return decodeUintResult(result, 65_535, 'builder fee approval lookup');
}

async function builderApprovalStatusFromEvent(account, userId, builderId, requiredMaxFeeBps, event) {
  const currentMaxFeeBps = await readBuilderMaxFeeBps(userId, builderId);
  const explicitlyApprovedMaxFeeBps = event?.new_max_fee_bps ?? null;
  return {
    account,
    user_id: userId,
    builder_id: builderId,
    required_max_fee_bps: requiredMaxFeeBps,
    current_max_fee_bps: currentMaxFeeBps,
    explicit_max_fee_bps: explicitlyApprovedMaxFeeBps,
    has_approval: !!event,
    approved: !!event
      && explicitlyApprovedMaxFeeBps >= requiredMaxFeeBps
      && currentMaxFeeBps >= requiredMaxFeeBps,
    source: event
      ? 'risex_fee_manager_event_verified_onchain'
      : 'risex_fee_manager_no_approval_event',
    approval_event: event,
    checked_at_ms: Date.now(),
  };
}

async function getBuilderApprovalStatus(account, options = {}) {
  const clean = normalizeAddress(account);
  if (!clean) throw new Error('RISEx account required (0x...)');
  const builderId = Number(options.builderId || RISEX_BUILDER_ID);
  const requiredMaxFeeBps = Number(options.requiredMaxFeeBps || RISEX_BUILDER_FEE_BPS);
  if (!Number.isInteger(requiredMaxFeeBps) || requiredMaxFeeBps <= 0 || requiredMaxFeeBps > 65_535) {
    throw new Error(`Invalid RISEx builder fee ceiling: ${options.requiredMaxFeeBps}`);
  }
  const cacheKey = `${clean}:${builderId}:${requiredMaxFeeBps}`;
  const cached = builderApprovalCache.get(cacheKey);
  if (
    options.force !== true
    && cached
    && Date.now() - cached.checked_at_ms < RISEX_BUILDER_APPROVAL_CACHE_MS
  ) {
    return cached;
  }

  const userId = await getRisexUserId(clean);
  const indexedEvent = await findIndexedBuilderApprovalEvent(userId, builderId);
  const onchainEvent = indexedEvent
    ? await getBuilderApprovalEventFromReceipt(
      indexedEvent.transaction_hash,
      userId,
      builderId,
    )
    : null;
  const status = await builderApprovalStatusFromEvent(
    clean,
    userId,
    builderId,
    requiredMaxFeeBps,
    onchainEvent,
  );
  builderApprovalCache.set(cacheKey, status);
  return status;
}

async function verifyBuilderApprovalTransaction(account, transactionHash, options = {}) {
  const clean = normalizeAddress(account);
  if (!clean) throw new Error('RISEx account required (0x...)');
  const builderId = Number(options.builderId || RISEX_BUILDER_ID);
  const requiredMaxFeeBps = Number(options.requiredMaxFeeBps || RISEX_BUILDER_FEE_BPS);
  const userId = await getRisexUserId(clean);
  const event = await getBuilderApprovalEventFromReceipt(
    transactionHash,
    userId,
    builderId,
  );
  const status = await builderApprovalStatusFromEvent(
    clean,
    userId,
    builderId,
    requiredMaxFeeBps,
    event,
  );
  builderApprovalCache.set(`${clean}:${builderId}:${requiredMaxFeeBps}`, status);
  return status;
}

async function getClashBuilderConfig({ force = false } = {}) {
  const now = Date.now();
  if (!force && clashBuilderCache && now - clashBuilderCache.fetched_at_ms < RISEX_BUILDER_CACHE_MS) {
    return clashBuilderCache;
  }
  if (!isEvmAddress(RISEX_BUILDER_FEE_RECIPIENT)) {
    throw new Error('RISEX_BUILDER_FEE_RECIPIENT is not a valid EVM address');
  }
  let builders = [];
  let apiError = null;
  try {
    builders = await listBuilders();
  } catch (error) {
    apiError = error;
  }
  const indexed = builders.find(
    builder => builder.builder_id === RISEX_BUILDER_ID
      && builder.fee_recipient === RISEX_BUILDER_FEE_RECIPIENT,
  ) || null;
  let onchain = null;
  let onchainError = null;
  try {
    onchain = await getBuilderInfoOnchain(RISEX_BUILDER_ID);
  } catch (error) {
    onchainError = error;
  }
  if (onchainError) {
    if (!force && clashBuilderCache) {
      return {
        ...clashBuilderCache,
        stale: true,
        registry_error: `on-chain: ${onchainError?.message || String(onchainError)}`,
      };
    }
    throw new Error(
      `RISEx on-chain builder registry unavailable: ${onchainError?.message || onchainError}`,
    );
  }
  const registered = onchain?.is_active === true
    && onchain?.builder_id === RISEX_BUILDER_ID
    && onchain?.fee_recipient === RISEX_BUILDER_FEE_RECIPIENT;

  clashBuilderCache = {
    registered,
    builder_id: registered ? RISEX_BUILDER_ID : null,
    builder_fee_bps: RISEX_BUILDER_FEE_BPS,
    fee_recipient: RISEX_BUILDER_FEE_RECIPIENT,
    registry_source: 'risex_onchain',
    api_indexed: !!indexed,
    onchain_builder: onchain,
    ...(apiError ? { registry_api_error: apiError?.message || String(apiError) } : {}),
    fetched_at_ms: now,
  };
  return clashBuilderCache;
}

async function requireClashBuilderConfig({ force = false } = {}) {
  const config = await getClashBuilderConfig({ force });
  if (!config.registered || !config.builder_id) {
    throw new Error(
      `Clash RISEx builder is not registered for fee recipient ${RISEX_BUILDER_FEE_RECIPIENT}`,
    );
  }
  return config;
}

async function approveBuilderFee(body) {
  return apiRequest('/v1/orders/builder-fee/approve', { method: 'POST', body });
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

async function rpcRequest(url, method, params, { timeoutMs = 10_000 } = {}) {
  const controller = new AbortController();
  const timeout = setTimeout(
    () => controller.abort(),
    Math.max(1_000, Math.min(30_000, Number(timeoutMs) || 10_000)),
  );
  try {
    const res = await fetch(url, {
      method: 'POST',
      headers: { accept: 'application/json', 'content-type': 'application/json' },
      body: JSON.stringify({ jsonrpc: '2.0', id: Date.now(), method, params }),
      signal: controller.signal,
    });
    const text = await res.text();
    let data = null;
    try { data = text ? JSON.parse(text) : null; } catch { data = null; }
    if (!res.ok || data?.error) {
      throw new Error(data?.error?.message || text || `RPC ${method} failed (${res.status})`);
    }
    return data?.result;
  } finally {
    clearTimeout(timeout);
  }
}

function parseCompositeOrderId(value) {
  const match = /^0x([0-9a-f]{16})([0-9a-f]{16})([0-9a-f]{16})$/iu.exec(String(value || '').trim());
  if (!match) return null;
  return {
    order_id: `0x${match[1]}${match[2]}${match[3]}`.toLowerCase(),
    wide_order_id: BigInt(`0x${match[1]}`),
    block_number: BigInt(`0x${match[2]}`),
    log_index: BigInt(`0x${match[3]}`),
  };
}

function hexQuantity(value) {
  return `0x${BigInt(value).toString(16)}`;
}

function uintTopic(value) {
  return `0x${BigInt(value).toString(16).padStart(64, '0')}`;
}

function addressTopic(value) {
  const address = normalizeAddress(value);
  if (!address) throw new Error(`Invalid indexed address: ${String(value || '')}`);
  return `0x${address.slice(2).padStart(64, '0')}`;
}

function topicAddress(value) {
  const clean = String(value || '').toLowerCase();
  if (!/^0x[0-9a-f]{64}$/u.test(clean)) return null;
  return normalizeAddress(`0x${clean.slice(-40)}`);
}

function decodeCompactUint32Word(word, label) {
  const raw = BigInt(word);
  if (raw < 0n || raw > 0xffffffffn) {
    throw new Error(`${label} is outside the encoded uint32 range`);
  }
  if (raw <= 0xffffn) return Number(raw);
  if ((raw & 0xffffffn) === 0n && (raw >> 24n) <= 0xffffn) {
    return Number(raw >> 24n);
  }
  throw new Error(`${label} has an unsupported packed encoding`);
}

function decodePlaceOrderBuilderFields(log) {
  const data = String(log?.data || '');
  if (!/^0x[0-9a-f]+$/iu.test(data) || (data.length - 2) % 64 !== 0) {
    throw new Error('PlaceOrder event data is malformed');
  }
  const words = [];
  const payload = data.slice(2);
  for (let offset = 0; offset < payload.length; offset += 64) {
    words.push(BigInt(`0x${payload.slice(offset, offset + 64)}`));
  }
  if (words.length !== RISEX_PLACE_ORDER_WORD_COUNT) {
    throw new Error(`Unexpected PlaceOrder event layout (${words.length} words)`);
  }
  return {
    protocol: topicAddress(log?.topics?.[1]),
    market_id: BigInt(log?.topics?.[2] || 0),
    wide_order_id: BigInt(log?.topics?.[3] || 0),
    builder_id: decodeCompactUint32Word(
      words[RISEX_PLACE_ORDER_BUILDER_ID_WORD],
      'PlaceOrder builder_id',
    ),
    builder_fee_bps: decodeCompactUint32Word(
      words[RISEX_PLACE_ORDER_BUILDER_FEE_WORD],
      'PlaceOrder builder_fee_bps',
    ),
  };
}

async function fetchPlaceOrderLog(order, marketId, systemConfig) {
  const ordersManager = normalizeAddress(systemConfig?.addresses?.orders_manager);
  const protocol = normalizeAddress(systemConfig?.addresses?.perps_manager);
  if (!ordersManager || !protocol) {
    throw new Error('RISEx system config is missing OrdersManager or PerpsManager');
  }
  const block = hexQuantity(order.block_number);
  const filter = {
    address: ordersManager,
    fromBlock: block,
    toBlock: block,
    topics: [
      RISEX_PLACE_ORDER_TOPIC,
      addressTopic(protocol),
      uintTopic(marketId),
      uintTopic(order.wide_order_id),
    ],
  };
  let lastError = null;
  for (const rpcUrl of rpcUrlsForChain(RISEX_RISE_CHAIN_ID)) {
    try {
      const logs = await rpcRequest(rpcUrl, 'eth_getLogs', [filter]);
      const exact = (Array.isArray(logs) ? logs : []).find(
        log => BigInt(log?.logIndex || 0) === order.log_index,
      );
      if (!exact) {
        throw new Error(
          `PlaceOrder event not found at block ${order.block_number} log ${order.log_index}`,
        );
      }
      return exact;
    } catch (error) {
      lastError = error;
    }
  }
  throw lastError || new Error('No RISE RPC configured for builder proof');
}

async function verifyFillBuilderProof(fill, builderConfig, systemConfig) {
  const order = parseCompositeOrderId(fill?.order_id);
  if (!order) return { eligible: false, reason: 'invalid_order_id' };
  const marketId = Number(fill?.market_id ?? fill?.marketId ?? fill?.market);
  if (!Number.isInteger(marketId) || marketId < 0) {
    return { eligible: false, reason: 'invalid_market_id' };
  }
  const cacheKey = [
    order.order_id,
    marketId,
    Number(builderConfig?.builder_id || 0),
    Number(builderConfig?.builder_fee_bps || 0),
    normalizeAddress(builderConfig?.fee_recipient) || '',
  ].join(':');
  const cached = orderBuilderProofCache.get(cacheKey);
  if (cached && Date.now() - cached.cached_at_ms < RISEX_ORDER_PROOF_CACHE_MS) {
    return cached.result;
  }

  const log = await fetchPlaceOrderLog(order, marketId, systemConfig);
  const decoded = decodePlaceOrderBuilderFields(log);
  const expectedProtocol = normalizeAddress(systemConfig?.addresses?.perps_manager);
  let reason = null;
  if (decoded.protocol !== expectedProtocol) reason = 'protocol_mismatch';
  else if (decoded.market_id !== BigInt(marketId)) reason = 'market_mismatch';
  else if (decoded.wide_order_id !== order.wide_order_id) reason = 'wide_order_id_mismatch';
  else if (decoded.builder_id !== Number(builderConfig?.builder_id)) reason = 'builder_id_mismatch';
  else if (decoded.builder_fee_bps !== Number(builderConfig?.builder_fee_bps)) reason = 'builder_fee_mismatch';

  const result = {
    eligible: reason == null,
    reason,
    proof: {
      source: 'risex_place_order_onchain',
      builder: {
        verified: reason == null,
        builder_id: decoded.builder_id,
        expected_builder_id: Number(builderConfig?.builder_id),
        builder_fee_bps: decoded.builder_fee_bps,
        expected_builder_fee_bps: Number(builderConfig?.builder_fee_bps),
        fee_recipient: builderConfig?.fee_recipient || null,
      },
      order: {
        composite_order_id: order.order_id,
        wide_order_id: order.wide_order_id.toString(),
        block_number: order.block_number.toString(),
        log_index: order.log_index.toString(),
        placement_tx_hash: log?.transactionHash || null,
        orders_manager: normalizeAddress(log?.address),
        protocol: decoded.protocol,
        market_id: marketId,
      },
      fill,
    },
  };
  orderBuilderProofCache.set(cacheKey, { cached_at_ms: Date.now(), result });
  return result;
}

function persistedBuilderProof(dbModule, fill, builderConfig) {
  const order = parseCompositeOrderId(fill?.order_id);
  const marketId = Number(fill?.market_id ?? fill?.marketId ?? fill?.market);
  const builderId = Number(builderConfig?.builder_id);
  const builderFeeBps = Number(builderConfig?.builder_fee_bps);
  const feeRecipient = normalizeAddress(builderConfig?.fee_recipient);
  if (!order || !Number.isInteger(marketId) || marketId < 0
    || !Number.isInteger(builderId) || !Number.isInteger(builderFeeBps) || !feeRecipient) {
    return null;
  }
  try {
    const row = dbModule.db.prepare(`
      SELECT result_json
      FROM risex_order_builder_proofs
      WHERE order_id = ?
        AND market_id = ?
        AND builder_id = ?
        AND builder_fee_bps = ?
        AND fee_recipient = ?
      LIMIT 1
    `).get(order.order_id, marketId, builderId, builderFeeBps, feeRecipient);
    if (!row?.result_json) return null;
    const parsed = JSON.parse(row.result_json);
    return parsed && typeof parsed === 'object' ? parsed : null;
  } catch {
    return null;
  }
}

function storePersistedBuilderProof(dbModule, fill, builderConfig, result) {
  const order = parseCompositeOrderId(fill?.order_id);
  const marketId = Number(fill?.market_id ?? fill?.marketId ?? fill?.market);
  const builderId = Number(builderConfig?.builder_id);
  const builderFeeBps = Number(builderConfig?.builder_fee_bps);
  const feeRecipient = normalizeAddress(builderConfig?.fee_recipient);
  if (!order || !Number.isInteger(marketId) || marketId < 0
    || !Number.isInteger(builderId) || !Number.isInteger(builderFeeBps) || !feeRecipient
    || !result || typeof result !== 'object') {
    return;
  }
  try {
    dbModule.db.prepare(`
      INSERT INTO risex_order_builder_proofs (
        order_id, market_id, builder_id, builder_fee_bps, fee_recipient,
        eligible, reason, result_json, checked_at
      ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, datetime('now'))
      ON CONFLICT(order_id, market_id, builder_id, builder_fee_bps, fee_recipient) DO UPDATE SET
        eligible = excluded.eligible,
        reason = excluded.reason,
        result_json = excluded.result_json,
        checked_at = excluded.checked_at
    `).run(
      order.order_id,
      marketId,
      builderId,
      builderFeeBps,
      feeRecipient,
      result.eligible ? 1 : 0,
      result.reason || null,
      JSON.stringify(result),
    );
  } catch (error) {
    console.warn('[risex] failed to persist builder proof:', error?.message || error);
  }
}

async function verifyFillBuilderProofCached(fill, builderConfig, systemConfig, dbModule) {
  const persisted = persistedBuilderProof(dbModule, fill, builderConfig);
  if (persisted) return persisted;
  const result = await verifyFillBuilderProof(fill, builderConfig, systemConfig);
  storePersistedBuilderProof(dbModule, fill, builderConfig, result);
  return result;
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
  const active = m?.active !== false;
  const unlocked = cfg?.unlocked !== false;
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
  if (!Number.isFinite(marketId) || !symbol || !active || !unlocked) return null;
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
    _risex: { marketId, stepSize, stepPrice, active, unlocked, raw: m },
    _raw: m,
  };
}

async function getSystemConfig({ force = false } = {}) {
  const fresh = systemConfigCache
    && Date.now() - systemConfigCache.cached_at_ms < RISEX_MARKET_CACHE_MS;
  if (!force && fresh) return systemConfigCache.value;
  if (!force && systemConfigPromise) return systemConfigPromise;

  systemConfigPromise = apiRequest('/v1/system/config')
    .then((value) => {
      systemConfigCache = { value, cached_at_ms: Date.now() };
      return value;
    })
    .finally(() => {
      systemConfigPromise = null;
    });
  return systemConfigPromise;
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

function inviteHasAccess(check, accountInfo) {
  if (accountInfo?.has_access === true || check?.has_access === true) return true;
  // RISEx mainnet can return `status: PENDING` for an already-redeemed
  // account while `/v1/invite/redeem` rejects a second attempt with
  // "account already exists for this address". For Clash setup that is
  // enough to continue to signer registration; the downstream RISEx auth
  // endpoint will still be the source of truth if the account truly cannot
  // trade yet.
  if (check?.redeemed === true || accountInfo?.redeemed === true) return true;
  if (accountInfo?.has_access != null) return accountInfo.has_access === true;
  if (check?.has_access != null) return check.has_access === true;
  const status = String(accountInfo?.status || check?.status || '').toLowerCase();
  return /\b(active|approved|redeemed|access|enabled)\b/u.test(status);
}

async function getInviteStatus(account) {
  if (!isEvmAddress(account)) throw new Error('account query param required (0x...)');
  const clean = normalizeAddress(account);
  const [check, accountInfo] = await Promise.all([
    apiRequest(`/v1/invite/check/${clean}`).catch(e => ({ error: e.message })),
    apiRequest(`/v1/invite/account/${clean}`).catch(e => ({ error: e.message })),
  ]);
  return {
    ...check,
    ...accountInfo,
    redeemed: check?.redeemed === true,
    has_access: inviteHasAccess(check, accountInfo),
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

async function getAllowanceStatus(account) {
  const clean = normalizeAddress(account);
  if (!clean) throw new Error('account query param required (0x...)');
  return apiRequest(`/v1/auth/allowance-status?account=${encodeURIComponent(clean)}`);
}

async function approveSingle(body) {
  return apiRequest('/v1/auth/approve-single', { method: 'POST', body });
}

async function getTpslOrders(account, opts = {}) {
  const clean = normalizeAddress(account);
  if (!clean) throw new Error('account query param required (0x...)');
  const params = new URLSearchParams({
    account: clean,
    status: String(opts.status || 'ACCEPTED').toUpperCase(),
    page: String(Math.max(1, Number(opts.page) || 1)),
    limit: String(Math.max(1, Math.min(100, Number(opts.limit) || 100))),
  });
  if (opts.marketId != null) params.set('market_id', String(Number(opts.marketId)));
  if (opts.stopType) params.set('stop_type', String(opts.stopType).toUpperCase());
  return apiRequest(`/v1/orders/tpsl?${params.toString()}`);
}

async function placeTpslOrder(body) {
  return apiRequest('/v1/orders/tpsl', { method: 'POST', body });
}

async function cancelTpslOrder(body) {
  return apiRequest('/v1/orders/tpsl/cancel', { method: 'POST', body });
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
    limit: String(Math.max(1, Math.min(100, Number(opts.limit) || 20))),
    offset: String(Math.max(0, Number(opts.offset) || 0)),
    tokenSymbol: 'usdc',
  });
  if (opts.sourceEid) params.set('srcEid', String(Number(opts.sourceEid)));
  if (opts.destEid) params.set('dstEid', String(Number(opts.destEid)));
  const url = `${RISEX_BRIDGE_HISTORY_API}/history/${encodeURIComponent(clean)}?${params.toString()}`;
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), 15_000);
  try {
    const res = await fetch(url, {
      headers: { accept: 'application/json' },
      signal: controller.signal,
    });
    const text = await res.text();
    let data = null;
    try { data = text ? JSON.parse(text) : null; } catch { data = text; }
    if (!res.ok) {
      throw new Error(
        `RISEx bridge history GET ${res.status}: ${errorText(data, text) || 'request failed'}`,
      );
    }
    return data;
  } finally {
    clearTimeout(timeout);
  }
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

async function getMarketInfo({ force = false } = {}) {
  const now = Date.now();
  if (!force && marketInfoCache && now - marketInfoCache.fetched_at_ms < RISEX_MARKET_CACHE_MS) {
    return marketInfoCache.markets;
  }
  if (!force && marketInfoPromise) return marketInfoPromise;

  marketInfoPromise = (async () => {
    let lastError = null;
    for (let attempt = 0; attempt < 2; attempt += 1) {
      try {
        const payload = await apiRequest('/v1/markets', { timeoutMs: 30_000 });
        const markets = rows(payload, ['markets']).map(normalizeMarket).filter(Boolean);
        if (!markets.length) throw new Error('RISEx returned no active unlocked markets');
        marketInfoCache = { markets, fetched_at_ms: Date.now() };
        return markets;
      } catch (error) {
        lastError = error;
        if (attempt === 0) await new Promise(resolve => setTimeout(resolve, 500));
      }
    }
    if (marketInfoCache?.markets?.length) return marketInfoCache.markets;
    throw lastError || new Error('RISEx markets are unavailable');
  })();

  try {
    return await marketInfoPromise;
  } finally {
    marketInfoPromise = null;
  }
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
  const balance = data?.summary || data?.balance || data || {};
  const equity = num(
    balance?.account_equity
    ?? balance?.cross_margin_balance
    ?? balance?.total_account_value
    ?? balance?.margin_balance
    ?? balance?.equity
    ?? balance?.total
    ?? balance,
  );
  const collateral = num(
    balance?.usdc_balance
    ?? balance?.collateral_margin_balance
    ?? balance?.collateral_balance
    ?? equity,
  );
  const available = num(
    balance?.free_collateral
    ?? balance?.free_cross_margin_balance
    ?? balance?.available_balance
    ?? balance?.available_to_spend
    ?? balance?.withdrawable_usdc
    ?? balance?.withdrawable
    ?? balance?.free,
  );
  const withdrawable = num(
    balance?.withdrawable_usdc
    ?? balance?.available_to_withdraw
    ?? balance?.free_collateral
    ?? balance?.free_cross_margin_balance
    ?? available,
  );
  const marginUsed = num(
    balance?.total_initial_margin
    ?? balance?.initial_margin
    ?? balance?.margin_used
    ?? balance?.total_margin_used,
  );
  return {
    balance: String(equity),
    usdc: String(equity),
    usdc_balance: String(collateral),
    collateral_balance: String(collateral),
    account_equity: String(equity),
    available_to_spend: String(available),
    available_to_withdraw: String(withdrawable),
    total_margin_used: String(marginUsed),
    maintenance_margin: String(num(
      balance?.total_maintenance_margin
      ?? balance?.total_cross_maintenance_margin
      ?? balance?.maintenance_margin,
    )),
    unrealized_pnl: String(num(balance?.total_unrealized_pnl ?? balance?.unrealized_pnl)),
    total_notional: String(num(balance?.total_notional)),
    margin_usage: String(num(balance?.margin_usage)),
    account_leverage: String(num(balance?.account_leverage)),
    risk_level: balance?.risk_level || null,
    in_liquidation: balance?.in_liquidation === true,
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
  const portfolio = await apiRequest(`/v1/portfolio/details?account=${clean}`);
  return normalizeBalance(portfolio);
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

function normalizeTpslOrder(o, byMarket) {
  const marketId = Number(o?.market_id ?? o?.marketId ?? o?.market);
  const market = byMarket.get(marketId);
  const symbol = symbolOf(o?.symbol || o?.market_symbol || market?.symbol);
  const stopPrice = fixed18(o?.stop_price ?? o?.stopPrice ?? o?.trigger_price ?? o?.triggerPrice);
  const stopType = String(o?.stop_type ?? o?.stopType ?? '').toUpperCase();
  if (!symbol || !(stopPrice > 0) || !['TAKE_PROFIT', 'STOP_LOSS'].includes(stopType)) return null;
  const amount = Math.abs(fixed18(o?.size ?? o?.quantity));
  return {
    symbol,
    side: sideFromValue(o?.side),
    amount: String(amount),
    initial_amount: String(amount),
    price: String(stopPrice),
    stop_price: String(stopPrice),
    trigger_price: String(stopPrice),
    order_id: o?.order_id ?? o?.id,
    resting_order_id: null,
    order_type: stopType,
    stop_type: stopType,
    tif: o?.tif ?? null,
    reduce_only: true,
    is_tpsl: true,
    pair_index: marketId,
    trade_index: null,
    status: o?.status ?? null,
    _risex_tpsl: true,
    _raw: o,
  };
}

async function getOrdersByAddress(address) {
  const clean = normalizeAddress(address);
  if (!clean) throw new Error('address query param required (0x...)');
  const [payload, tpslPayload, byMarket] = await Promise.all([
    apiRequest(`/v1/orders/open?account=${clean}`).catch(() => ({ orders: [] })),
    getTpslOrders(clean, { status: 'ACCEPTED' }).catch(() => ({ orders: [] })),
    marketMap(),
  ]);
  const regular = rows(payload, ['orders']).map(o => normalizeOrder(o, byMarket)).filter(Boolean);
  const tpsl = rows(tpslPayload, ['orders']).map(o => normalizeTpslOrder(o, byMarket)).filter(Boolean);
  return [...regular, ...tpsl];
}

async function getAccountTradeHistory(address, {
  marketId,
  limit = RISEX_FILL_LOOKBACK_LIMIT,
  page = 1,
  maxPages = 1,
  startTime,
  endTime,
  sortedBy = '-time',
  timeoutMs = 15_000,
} = {}) {
  const clean = normalizeAddress(address);
  if (!clean) throw new Error('wallet required (0x...)');
  const pageLimit = Math.max(1, Math.min(1000, Number(limit) || RISEX_FILL_LOOKBACK_LIMIT));
  const pageCount = Math.max(1, Math.min(25, Number(maxPages) || 1));
  let nextPage = Math.max(1, Number(page) || 1);
  const collected = [];
  const seen = new Set();

  for (let index = 0; index < pageCount; index += 1) {
    const qs = new URLSearchParams({
      account: clean,
      limit: String(pageLimit),
      page: String(nextPage),
      sorted_by: sortedBy === 'time' ? 'time' : '-time',
    });
    if (marketId != null) qs.set('market_id', String(marketId));
    if (startTime != null && startTime !== '') qs.set('start_time', String(startTime));
    if (endTime != null && endTime !== '') qs.set('end_time', String(endTime));
    const payload = await apiRequest(`/v1/trade-history?${qs.toString()}`, { timeoutMs });
    const pageRows = rows(payload, ['fills', 'trades']);
    for (const fill of pageRows) {
      // A trade id is normally unique, but keep execution details in the key as
      // well so pagination cannot collapse two partial executions of the same
      // maker/taker order pair.
      const key = [
        fill?.id,
        fill?.fill_id,
        fill?.trade_id,
        fill?.order_id,
        fill?.timestamp ?? fill?.time ?? fill?.created_at ?? fill?.createdAt,
        fill?.market_id,
        fill?.price,
        fill?.size,
        fill?.blockchain_data?.tx_hash,
        fill?.blockchain_data?.log_index,
      ].filter(value => value !== undefined && value !== null && value !== '').join(':')
        || JSON.stringify(fill).slice(0, 240);
      if (seen.has(key)) continue;
      seen.add(key);
      collected.push(fill);
    }
    if (payload?.has_next_page !== true || !pageRows.length) break;
    nextPage = Number(payload?.page || nextPage) + 1;
  }
  return collected;
}

function fillTime(fill) {
  const raw = fill?.timestamp ?? fill?.time ?? fill?.created_at ?? fill?.createdAt;
  const n = Number(raw);
  if (Number.isFinite(n) && n > 0) {
    if (n > 1e16) return Math.floor(n / 1e6);
    if (n > 1e14) return Math.floor(n / 1e3);
    return n > 1e11 ? Math.floor(n) : Math.floor(n * 1000);
  }
  const parsed = Date.parse(raw || '');
  return Number.isFinite(parsed) ? parsed : 0;
}

function tradeKey(wallet, fill) {
  const base = [
    fill?.id,
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

function tradeKeyCandidates(wallet, fill) {
  const cleanWallet = String(wallet || '').toLowerCase();
  const canonical = tradeKey(cleanWallet, fill);
  const values = [canonical];
  const withoutTradeId = [
    fill?.fill_id,
    fill?.trade_id,
    fill?.order_id,
    fill?.client_order_id,
    fillTime(fill),
    fill?.market_id,
    fill?.price,
    fill?.size,
  ].filter(v => v !== undefined && v !== null && v !== '').join(':');
  if (withoutTradeId) values.push(`risex:${cleanWallet}:${withoutTradeId}`);
  const legacy = [
    fill?.order_id,
    fill?.timestamp ?? fill?.time ?? fill?.created_at ?? fill?.createdAt,
    fill?.market_id,
    fill?.price,
    fill?.size,
  ].filter(v => v !== undefined && v !== null && v !== '').join(':');
  if (legacy) values.push(`risex:${cleanWallet}:${legacy}`);
  return [...new Set(values)];
}

function normalizeFill(wallet, fill, byMarket, proof) {
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
  const createdAtMs = fillTime(fill);
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
    verifiedSource: 'risex_builder_onchain',
    pnl: fill?.realized_pnl != null ? String(fill.realized_pnl) : null,
    fee: fill?.fee != null ? String(fill.fee) : null,
    proofJson: proof ? JSON.stringify(proof) : null,
    createdAt: createdAtMs > 0 ? new Date(createdAtMs).toISOString() : null,
  };
}

function findExistingImportedFill(dbModule, playerId, wallet, fill, trade) {
  const candidates = tradeKeyCandidates(wallet, fill);
  if (candidates.length) {
    const placeholders = candidates.map(() => '?').join(', ');
    const exact = dbModule.db.prepare(`
      SELECT id, player_id, verified_source, proof_json, client_order_id
      FROM trade_history
      WHERE dex = 'risex' AND client_order_id IN (${placeholders})
      ORDER BY CASE WHEN verified_source = 'risex_builder_onchain' THEN 0 ELSE 1 END, id DESC
      LIMIT 1
    `).get(...candidates);
    if (exact) return exact;
  }

  if (trade?.orderId == null || trade?.orderId === '') return null;
  const amount = Number(trade.amount);
  const price = Number(trade.price);
  if (!Number.isFinite(amount) || !Number.isFinite(price)) return null;
  return dbModule.db.prepare(`
    SELECT id, player_id, verified_source, proof_json, client_order_id
    FROM trade_history
    WHERE dex = 'risex'
      AND player_id = ?
      AND CAST(order_id AS TEXT) = ?
      AND ABS(CAST(amount AS REAL) - ?) <= MAX(0.000000000001, ABS(?) * 0.000000001)
      AND ABS(CAST(price AS REAL) - ?) <= MAX(0.000000001, ABS(?) * 0.000000001)
    ORDER BY CASE WHEN verified_source = 'risex_builder_onchain' THEN 0 ELSE 1 END, id DESC
    LIMIT 1
  `).get(String(playerId), String(trade.orderId), amount, amount, price, price) || null;
}

function existingFillHasCurrentBuilderProof(row, builderConfig) {
  if (row?.verified_source !== 'risex_builder_onchain' || !row?.proof_json) return false;
  try {
    const proof = JSON.parse(row.proof_json);
    return proof?.source === 'risex_place_order_onchain'
      && proof?.builder?.verified === true
      && Number(proof?.builder?.builder_id) === Number(builderConfig?.builder_id)
      && Number(proof?.builder?.builder_fee_bps) === Number(builderConfig?.builder_fee_bps)
      && normalizeAddress(proof?.builder?.fee_recipient) === normalizeAddress(builderConfig?.fee_recipient);
  } catch {
    return false;
  }
}

async function importFillsForPlayer(playerId, wallet, opts = {}) {
  const cleanWallet = normalizeAddress(wallet);
  if (!cleanWallet) return { ok: false, imported: 0, skipped: 0, total: 0, reason: 'invalid_evm_wallet' };
  const db = require('./db');
  const attempts = Math.max(1, Math.min(6, Number(opts.attempts || 1)));
  const delayMs = Math.max(250, Math.min(5000, Number(opts.delayMs || 1500)));
  let fills = [];
  let byMarket = new Map();
  let fetchError = null;
  for (let i = 0; i < attempts; i += 1) {
    try {
      [fills, byMarket] = await Promise.all([
        getAccountTradeHistory(cleanWallet, {
          limit: opts.limit || RISEX_FILL_LOOKBACK_LIMIT,
          maxPages: opts.maxPages || 1,
          startTime: opts.startTime,
          endTime: opts.endTime,
          timeoutMs: opts.timeoutMs || 15_000,
        }),
        marketMap(),
      ]);
      fetchError = null;
    } catch (error) {
      fetchError = error;
      fills = [];
      byMarket = new Map();
    }
    if (Array.isArray(fills) && fills.length) break;
    if (i < attempts - 1) await new Promise(r => setTimeout(r, delayMs));
  }
  if (!Array.isArray(fills)) fills = [];

  if (fetchError) {
    return {
      ok: false,
      imported: 0,
      upgraded: 0,
      adopted: 0,
      skipped: 0,
      total: 0,
      reason: 'trade_history_unavailable',
      error: fetchError?.message || String(fetchError),
    };
  }

  let builderConfig;
  let systemConfig;
  try {
    [builderConfig, systemConfig] = await Promise.all([
      requireClashBuilderConfig(),
      getSystemConfig(),
    ]);
  } catch (error) {
    return {
      ok: false,
      imported: 0,
      upgraded: 0,
      adopted: 0,
      skipped: 0,
      total: fills.length,
      reason: /not registered/i.test(error?.message || '') ? 'builder_not_registered' : 'builder_proof_unavailable',
      error: error?.message || String(error),
    };
  }

  let imported = 0;
  let upgraded = 0;
  let adopted = 0;
  let skipped = 0;
  const skipReasons = {};
  const proofPromises = new Map();
  for (const fill of fills) {
    const candidate = normalizeFill(cleanWallet, fill, byMarket, null);
    if (!candidate) {
      skipped++;
      skipReasons.invalid_fill = (skipReasons.invalid_fill || 0) + 1;
      continue;
    }

    let before = null;
    try {
      before = findExistingImportedFill(db, playerId, cleanWallet, fill, candidate);
    } catch (error) {
      console.warn('[risex] existing fill lookup failed:', error?.message || error);
    }
    if (existingFillHasCurrentBuilderProof(before, builderConfig)) {
      skipped++;
      skipReasons.already_verified = (skipReasons.already_verified || 0) + 1;
      continue;
    }
    if (before && opts.verifyLegacy === false) {
      skipped++;
      skipReasons.legacy_deferred = (skipReasons.legacy_deferred || 0) + 1;
      continue;
    }

    const orderKey = `${String(fill?.order_id || '').toLowerCase()}:${Number(fill?.market_id ?? fill?.marketId ?? fill?.market)}`;
    if (!proofPromises.has(orderKey)) {
      proofPromises.set(
        orderKey,
        verifyFillBuilderProofCached(fill, builderConfig, systemConfig, db)
          .catch(error => ({ eligible: false, reason: 'proof_error', error: error?.message || String(error) })),
      );
    }
    const verification = await proofPromises.get(orderKey);
    if (!verification?.eligible) {
      skipped++;
      const reason = verification?.reason || 'builder_proof_failed';
      skipReasons[reason] = (skipReasons[reason] || 0) + 1;
      continue;
    }
    const trade = normalizeFill(cleanWallet, fill, byMarket, verification.proof);
    try {
      if (before) {
        const refreshed = db.db.prepare(`
            UPDATE trade_history
            SET player_id = ?,
                verified_source = ?,
                proof_json = ?,
                fee = ?,
                created_at = COALESCE(?, created_at)
            WHERE id = ? AND dex = 'risex'
              AND verified_source IN ('risex_api', 'risex_builder_onchain')
          `).run(
            playerId,
            trade.verifiedSource,
            trade.proofJson,
            trade.fee,
            trade.createdAt,
            before.id,
          );
        if (refreshed.changes > 0) {
          if (before.player_id !== playerId) adopted++;
          else upgraded++;
        } else {
          skipped++;
          skipReasons.already_verified = (skipReasons.already_verified || 0) + 1;
        }
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
  return {
    ok: true,
    imported,
    upgraded,
    adopted,
    skipped,
    total: fills.length,
    skipped_by_reason: skipReasons,
    builder_id: builderConfig.builder_id,
    builder_fee_bps: builderConfig.builder_fee_bps,
  };
}

module.exports = {
  RISEX_API,
  RISEX_BRIDGE_API,
  RISEX_BRIDGE_HISTORY_API,
  RISEX_BRIDGE_CHAINS,
  RISEX_BUILDER_ID,
  RISEX_BUILDER_FEE_RECIPIENT,
  RISEX_BUILDER_FEE_BPS,
  RISEX_FEE_MANAGER_ADDRESS,
  isEvmAddress,
  normalizeAddress,
  apiRequest,
  bridgeRequest,
  listBuilders,
  getBuilderInfoCallData,
  getUserIdCallData,
  getBuilderMaxFeeBpsCallData,
  decodeAddressResult,
  decodeUintResult,
  decodeBuilderInfoResult,
  getBuilderInfoOnchain,
  getFeeManagerAccountRegistry,
  getRisexUserId,
  decodeBuilderApprovalEventLog,
  findIndexedBuilderApprovalEvent,
  getBuilderApprovalEventFromReceipt,
  getBuilderApprovalStatus,
  verifyBuilderApprovalTransaction,
  getClashBuilderConfig,
  requireClashBuilderConfig,
  approveBuilderFee,
  getSystemConfig,
  getEip712Domain,
  getNonceState,
  getSigners,
  getSessionKeyStatus,
  registerSigner,
  getInviteStatus,
  redeemInvite,
  acceptTerms,
  placeOrder,
  cancelOrder,
  getAllowanceStatus,
  approveSingle,
  getTpslOrders,
  placeTpslOrder,
  cancelTpslOrder,
  getBridgeDepositAddress,
  getBridgeSourceUsdcBalance,
  processBridgeDeposit,
  getBridgeStatus,
  getBridgeHistory,
  getTransferHistory,
  getMarketInfo,
  getPrices,
  normalizeBalance,
  getAccountByAddress,
  getPositionsByAddress,
  normalizeTpslOrder,
  getOrdersByAddress,
  getAccountTradeHistory,
  fillTime,
  tradeKey,
  tradeKeyCandidates,
  findExistingImportedFill,
  parseCompositeOrderId,
  decodePlaceOrderBuilderFields,
  verifyFillBuilderProof,
  verifyFillBuilderProofCached,
  importFillsForPlayer,
};
