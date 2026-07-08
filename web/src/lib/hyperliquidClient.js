import { ExchangeClient, HttpTransport, InfoClient } from '@nktkas/hyperliquid';
import { generatePrivateKey, privateKeyToAccount } from 'viem/accounts';
import { readEncryptedCredential, writeEncryptedCredential } from './encryptedCredentialStorage';

export const HYPERLIQUID_TESTNET = String(import.meta.env.VITE_HYPERLIQUID_TESTNET || '').trim() === '1';
export const HYPERLIQUID_API_URL = String(import.meta.env.VITE_HYPERLIQUID_API_URL || '').trim();
export const HYPERLIQUID_BUILDER_ADDRESS = String(import.meta.env.VITE_HYPERLIQUID_BUILDER_ADDRESS || '').trim();
export const HYPERLIQUID_BUILDER_FEE_TENTH_BPS = Number(import.meta.env.VITE_HYPERLIQUID_BUILDER_FEE_TENTH_BPS || 10);
export const HYPERLIQUID_REFERRAL_CODE = String(import.meta.env.VITE_HYPERLIQUID_REFERRAL_CODE || 'CLASHOFPERPS').trim();
export const HYPERLIQUID_ARBITRUM_CHAIN_ID = 42161;
export const HYPERLIQUID_SIGNATURE_CHAIN_ID_HEX = `0x${HYPERLIQUID_ARBITRUM_CHAIN_ID.toString(16)}`;
export const HYPERLIQUID_BRIDGE2_ADDRESS = '0x2Df1c51E09aECF9cacB7bc98cB1742757f163dF7';
export const HYPERLIQUID_ARBITRUM_USDC_ADDRESS = '0xaf88d065e77c8cC2239327C5EDb3A432268e5831';
export const HYPERLIQUID_USDC_DECIMALS = 6;
export const HYPERLIQUID_MIN_DEPOSIT_USDC = 5;

export const HYPERLIQUID_USDC_ABI = [
  { type: 'function', name: 'balanceOf', stateMutability: 'view',
    inputs: [{ name: 'account', type: 'address' }],
    outputs: [{ type: 'uint256' }] },
  { type: 'function', name: 'transfer', stateMutability: 'nonpayable',
    inputs: [{ name: 'to', type: 'address' }, { name: 'amount', type: 'uint256' }],
    outputs: [{ type: 'bool' }] },
];

const DEFAULT_TIMEOUT_MS = 12_000;
const PERP_MAX_BUILDER_FEE_TENTH_BPS = 10; // 0.01%.
const AGENT_STORAGE_PREFIX = 'clash_hyperliquid_agent_v1';
const AGENT_NAME = 'clashofperps';
const AGENT_DEFAULT_TTL_MS = 24 * 60 * 60 * 1000;
const AGENT_MIN_VALID_MS = 2 * 60 * 1000;
const runtimeAgentCache = new Map();

function cleanNum(value, fallback = 0) {
  const n = Number(value);
  return Number.isFinite(n) ? n : fallback;
}

function trimZeros(value) {
  return String(value)
    .replace(/(\.\d*?)0+$/u, '$1')
    .replace(/\.$/u, '');
}

export function isHyperliquidAddress(addr) {
  return /^0x[0-9a-fA-F]{40}$/.test(String(addr || '').trim());
}

export function hyperliquidTransport() {
  return new HttpTransport({
    isTestnet: HYPERLIQUID_TESTNET,
    timeout: DEFAULT_TIMEOUT_MS,
    ...(HYPERLIQUID_API_URL ? { apiUrl: HYPERLIQUID_API_URL } : {}),
  });
}

export function createHyperliquidInfoClient() {
  return new InfoClient({ transport: hyperliquidTransport() });
}

export function getOrCreateHyperliquidAgent(owner) {
  const key = String(owner || '').toLowerCase();
  if (!isHyperliquidAddress(key)) throw new Error('Connect your EVM wallet first');
  const existing = readPersistedAgent(key);
  if (existing) return existing;
  const next = agentFromPrivateKey(generatePrivateKey(), Date.now() + agentTtlMs());
  persistAgent(key, next);
  return next;
}

export function readHyperliquidAgent(owner) {
  const key = String(owner || '').toLowerCase();
  if (!isHyperliquidAddress(key)) return null;
  return readPersistedAgent(key);
}

export function rememberHyperliquidAgent(owner, record, validUntil) {
  if (!owner || !record?.privateKey) return record;
  const next = agentFromPrivateKey(record.privateKey, validUntil || record.validUntil);
  persistAgent(owner, next);
  return next;
}

export function hyperliquidAgentName(validUntil) {
  return `${AGENT_NAME} valid_until ${Math.floor(Number(validUntil) || Date.now() + agentTtlMs())}`;
}

export function isHyperliquidAgentApproved(agent, agents) {
  const address = String(agent?.address || '').toLowerCase();
  if (!address || !Array.isArray(agents)) return null;
  return agents.find(row => (
    String(row?.address || '').toLowerCase() === address
    && Number(row?.validUntil || 0) > Date.now() + AGENT_MIN_VALID_MS
  )) || null;
}

function eip712DomainTypes() {
  return [
    { name: 'name', type: 'string' },
    { name: 'version', type: 'string' },
    { name: 'chainId', type: 'uint256' },
    { name: 'verifyingContract', type: 'address' },
  ];
}

function withEip712Domain(types = {}) {
  return types.EIP712Domain ? types : { EIP712Domain: eip712DomainTypes(), ...types };
}

function withoutEip712Domain(types = {}) {
  const { EIP712Domain: _domain, ...rest } = types;
  return rest;
}

function typedDataJson(value) {
  return JSON.stringify(value, (_key, item) => (
    typeof item === 'bigint' ? item.toString() : item
  ));
}

function isPrivateKey(value) {
  return /^0x[0-9a-fA-F]{64}$/.test(String(value || '').trim());
}

function agentStorage() {
  if (typeof window === 'undefined') return null;
  try { return window.localStorage || window.sessionStorage || null; } catch { return null; }
}

function agentStorageKey(owner) {
  return `${AGENT_STORAGE_PREFIX}:${String(owner || '').toLowerCase()}`;
}

function agentTtlMs() {
  const hours = Number(import.meta.env.VITE_HYPERLIQUID_AGENT_TTL_HOURS || 24);
  return Number.isFinite(hours) && hours > 0
    ? Math.min(hours, 24 * 7) * 60 * 60 * 1000
    : AGENT_DEFAULT_TTL_MS;
}

function agentFromPrivateKey(privateKey, validUntil = Date.now() + agentTtlMs()) {
  const account = privateKeyToAccount(privateKey);
  return {
    account,
    address: account.address.toLowerCase(),
    privateKey,
    validUntil: Number(validUntil) || Date.now() + agentTtlMs(),
  };
}

function agentFromStoredRecord(parsed) {
  if (!isPrivateKey(parsed?.privateKey)) return null;
  if (Number(parsed?.validUntil || 0) <= Date.now() + AGENT_MIN_VALID_MS) return null;
  return agentFromPrivateKey(parsed.privateKey, parsed.validUntil);
}

function persistAgent(owner, record) {
  const payload = JSON.stringify({
    privateKey: record.privateKey,
    address: record.address,
    validUntil: record.validUntil,
  });
  const key = agentStorageKey(owner);
  runtimeAgentCache.set(key, payload);
  const storage = agentStorage();
  if (storage) {
    try { storage.setItem(key, payload); } catch { /* storage disabled */ }
  }
  writeEncryptedCredential(key, {
    privateKey: record.privateKey,
    address: record.address,
    validUntil: record.validUntil,
  }).catch(() => {});
}

function readPersistedAgent(owner) {
  const key = agentStorageKey(owner);
  const storage = agentStorage();
  const raw = runtimeAgentCache.get(key) || (() => {
    if (!storage) return null;
    try { return storage.getItem(key); } catch { return null; }
  })();
  if (!raw) return null;
  try {
    return agentFromStoredRecord(JSON.parse(raw));
  } catch {
    return null;
  }
}

/** Fallback when localStorage is blocked (Tracking Prevention / private mode). */
export async function readHyperliquidAgentAsync(owner) {
  const sync = readHyperliquidAgent(owner);
  if (sync) return sync;
  const key = agentStorageKey(owner);
  try {
    const parsed = await readEncryptedCredential(key);
    const agent = agentFromStoredRecord(parsed);
    if (agent) persistAgent(owner, agent);
    return agent;
  } catch {
    return null;
  }
}

function normalizeRpcChainId(value) {
  if (value == null) return null;
  if (typeof value === 'number') return Number.isFinite(value) ? value : null;
  if (typeof value === 'bigint') return Number(value);
  const text = String(value).trim();
  if (!text) return null;
  if (/^0x/i.test(text)) return Number.parseInt(text, 16);
  const num = Number(text);
  return Number.isFinite(num) ? num : null;
}

async function readWalletChainId(provider, walletClient) {
  if (provider?.request) {
    const id = normalizeRpcChainId(await provider.request({ method: 'eth_chainId' }));
    if (id) return id;
  }
  if (walletClient?.getChainId) {
    const id = normalizeRpcChainId(await walletClient.getChainId());
    if (id) return id;
  }
  return HYPERLIQUID_ARBITRUM_CHAIN_ID;
}

function deepestErrorMessage(error) {
  const seen = new Set();
  const parts = [];
  let cur = error;
  while (cur && !seen.has(cur)) {
    seen.add(cur);
    const msg = cur?.shortMessage || cur?.details || cur?.message || cur?.reason || cur?.data?.message;
    if (msg && !parts.includes(String(msg))) parts.push(String(msg));
    cur = cur?.cause || cur?.error || cur?.data?.cause;
  }
  return parts.filter(Boolean).join(' | ');
}

export function createHyperliquidWalletAdapter({ address, provider, walletClient }) {
  const account = String(address || '').trim();
  if (!isHyperliquidAddress(account)) throw new Error('Connect your EVM wallet first');
  const accountLower = account.toLowerCase();
  return {
    getAddresses: async () => [account],
    getChainId: async () => readWalletChainId(provider, walletClient),
    async signTypedData(params) {
      const payload = {
        domain: params.domain,
        types: withEip712Domain(params.types),
        primaryType: params.primaryType,
        message: params.message,
      };
      const providerErrors = [];
      if (provider?.request) {
        try {
          return await provider.request({
            method: 'eth_signTypedData_v4',
            params: [accountLower, typedDataJson(payload)],
          });
        } catch (e) {
          providerErrors.push(deepestErrorMessage(e) || 'eth_signTypedData_v4 string payload failed');
          try {
            return await provider.request({
              method: 'eth_signTypedData_v4',
              params: [accountLower, payload],
            });
          } catch (objectPayloadError) {
            providerErrors.push(deepestErrorMessage(objectPayloadError) || 'eth_signTypedData_v4 object payload failed');
          }
        }
      }
      if (walletClient?.signTypedData) {
        try {
          return await walletClient.signTypedData({
            account,
            domain: params.domain,
            types: withoutEip712Domain(params.types),
            primaryType: params.primaryType,
            message: params.message,
          });
        } catch (e) {
          providerErrors.push(deepestErrorMessage(e) || 'viem signTypedData failed');
        }
      }
      throw new Error(providerErrors.filter(Boolean).join(' | ') || 'Wallet does not support typed-data signing');
    },
  };
}

export function createHyperliquidExchangeClient(wallet) {
  return new ExchangeClient({
    transport: hyperliquidTransport(),
    wallet,
    signatureChainId: HYPERLIQUID_SIGNATURE_CHAIN_ID_HEX,
  });
}

export function hyperliquidBuilderParams() {
  if (!isHyperliquidAddress(HYPERLIQUID_BUILDER_ADDRESS)) return null;
  const f = Math.max(
    0,
    Math.min(PERP_MAX_BUILDER_FEE_TENTH_BPS, Math.floor(HYPERLIQUID_BUILDER_FEE_TENTH_BPS || 0)),
  );
  return f > 0 ? { b: HYPERLIQUID_BUILDER_ADDRESS, f } : null;
}

export function hyperliquidBuilderMaxFeeRate(builder = hyperliquidBuilderParams()) {
  if (!builder?.f) return null;
  return `${trimZeros((builder.f / 1000).toFixed(4))}%`;
}

export function hyperliquidSymbol(symbol) {
  return String(symbol || '').trim().toUpperCase().replace(/-PERP$/u, '').replace(/\/USD$/u, '');
}

export function hyperliquidLotSize(szDecimals) {
  const decimals = Math.max(0, Math.min(8, Number(szDecimals) || 0));
  return decimals === 0 ? '1' : `0.${'0'.repeat(decimals - 1)}1`;
}

export function formatHyperliquidSize(size, market) {
  const n = Number(size);
  if (!Number.isFinite(n) || n <= 0) return '0';
  const decimals = Math.max(0, Math.min(8, Number(market?.szDecimals ?? market?._hyperliquid?.szDecimals ?? 5) || 0));
  const factor = 10 ** decimals;
  const floored = Math.floor(n * factor) / factor;
  return trimZeros(floored.toFixed(decimals));
}

// Hyperliquid perp prices accept up to 5 significant figures and up to 6
// decimals. Round down for bids and up for asks where requested so market
// orders do not accidentally become less aggressive after formatting.
export function formatHyperliquidPrice(price, { round = 'nearest' } = {}) {
  const n = Number(price);
  if (!Number.isFinite(n) || n <= 0) return '0';
  const abs = Math.abs(n);
  const sigDecimals = Math.max(0, 5 - Math.floor(Math.log10(abs)) - 1);
  const decimals = Math.min(6, sigDecimals);
  const factor = 10 ** decimals;
  let rounded;
  if (round === 'down') rounded = Math.floor(n * factor) / factor;
  else if (round === 'up') rounded = Math.ceil(n * factor) / factor;
  else rounded = Math.round(n * factor) / factor;
  return trimZeros(rounded.toFixed(decimals));
}

export function makeHyperliquidCloid() {
  const bytes = new Uint8Array(16);
  if (typeof crypto !== 'undefined' && crypto.getRandomValues) {
    crypto.getRandomValues(bytes);
  } else {
    for (let i = 0; i < bytes.length; i += 1) bytes[i] = Math.floor(Math.random() * 256);
  }
  return `0x${Array.from(bytes).map(b => b.toString(16).padStart(2, '0')).join('')}`;
}

export function normalizeHyperliquidMarkets(payload) {
  const meta = Array.isArray(payload) ? payload[0] : payload?.meta;
  const ctxs = Array.isArray(payload) ? payload[1] : payload?.assetCtxs;
  const universe = Array.isArray(meta?.universe) ? meta.universe : [];
  const rows = universe.map((m, index) => {
    const ctx = Array.isArray(ctxs) ? ctxs[index] : {};
    const symbol = hyperliquidSymbol(m?.name);
    if (!symbol) return null;
    const mark = cleanNum(ctx?.markPx || ctx?.midPx || ctx?.oraclePx || ctx?.prevDayPx);
    const openInterestBase = cleanNum(ctx?.openInterest);
    return {
      symbol,
      base: symbol,
      pair: `${symbol}/USD`,
      market_name: `${symbol}-PERP`,
      asset_id: index,
      pair_index: index,
      lot_size: hyperliquidLotSize(m?.szDecimals),
      tick_size: mark >= 1000 ? '1' : mark >= 1 ? '0.01' : '0.0001',
      min_order_size: hyperliquidLotSize(m?.szDecimals),
      max_leverage: Number(m?.maxLeverage || 50),
      funding_rate: cleanNum(ctx?.funding),
      next_funding_rate: cleanNum(ctx?.funding),
      mark,
      oracle: cleanNum(ctx?.oraclePx, mark),
      mid: cleanNum(ctx?.midPx, mark),
      yesterday_price: cleanNum(ctx?.prevDayPx),
      volume_24h: cleanNum(ctx?.dayNtlVlm),
      open_interest: mark > 0 ? openInterestBase * mark : openInterestBase,
      _hyperliquid: {
        index,
        szDecimals: Number(m?.szDecimals ?? 5),
        meta: m,
        ctx,
      },
      _raw: { meta: m, ctx },
    };
  }).filter(Boolean);
  return rows.sort((a, b) => {
    const ai = ['BTC', 'ETH', 'SOL'].indexOf(a.symbol);
    const bi = ['BTC', 'ETH', 'SOL'].indexOf(b.symbol);
    if (ai !== -1 || bi !== -1) return (ai === -1 ? 99 : ai) - (bi === -1 ? 99 : bi);
    return (b.volume_24h || 0) - (a.volume_24h || 0);
  });
}

export function normalizeHyperliquidPrices(markets) {
  return (markets || []).map(m => ({
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

export function parseHyperliquidOrderResponse(result) {
  const statuses = result?.response?.data?.statuses || result?.data?.statuses || [];
  const first = Array.isArray(statuses) ? statuses[0] : null;
  const failed = Array.isArray(statuses)
    ? statuses.find(status => status?.error)
    : null;
  const resting = first?.resting || null;
  const filled = first?.filled || null;
  const error = failed?.error || first?.error || result?.error || null;
  return {
    ok: !error,
    error: error ? String(error) : null,
    oid: resting?.oid ?? filled?.oid ?? null,
    totalSz: filled?.totalSz ?? null,
    avgPx: filled?.avgPx ?? null,
    raw: result,
  };
}

export function hyperliquidErrorMessage(error, fallback = 'Hyperliquid request failed') {
  const text = String(deepestErrorMessage(error) || error?.message || error?.shortMessage || error || fallback);
  if (/user rejected|denied|cancel/i.test(text)) return 'Signature cancelled';
  if (/chainId should be same|provided chainId|must match the active chainId|chain mismatch|unsupported network/i.test(text)) {
    return 'Switch your EVM wallet to Arbitrum, enable One tap trading, then retry.';
  }
  if (/must deposit before performing actions|deposit .*before/i.test(text)) {
    return `Deposit at least ${HYPERLIQUID_MIN_DEPOSIT_USDC} USDC to Hyperliquid first, then enable builder fee.`;
  }
  if (/insufficient margin|margin/i.test(text)) return 'Insufficient Hyperliquid margin. Deposit USDC or reduce size.';
  if (/Builder fee approval was signed|maxBuilderFee|Builder account must be in Standard mode|Current mode:/i.test(text)) {
    return text.slice(0, 260);
  }
  if (/builder/i.test(text) && /100|perps account|account value|eligible|must have/i.test(text)) {
    return text.replace(/perps account value/ig, 'builder account value').slice(0, 260);
  }
  if (/builder/i.test(text) && /approve|fee/i.test(text)) {
    return 'Builder fee is not approved yet. Approve the builder fee on Hyperliquid, then retry.';
  }
  return text.slice(0, 260);
}
