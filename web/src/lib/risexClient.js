import {
  encodePacked,
  formatUnits,
  hexToBytes,
  keccak256,
} from 'viem';
import { generatePrivateKey, privateKeyToAccount } from 'viem/accounts';
import {
  RISEX_AUTH_ADDRESS,
  RISE_CHAIN_ID,
} from './risexConfig';

export const RISEX_SIGNER_STORAGE_PREFIX = 'clash_risex_signer_v1';
export const RISEX_REGISTER_MESSAGE = 'Please sign in with your wallet to access RISEx.';
export const RISEX_SIGNER_TTL_SECONDS = 30 * 24 * 60 * 60;
export const RISEX_PERMIT_TTL_SECONDS = 300;
export const RISEX_MIN_DEPOSIT_USDC = 1;

export const RISEX_SIDE = Object.freeze({ LONG: 0, SHORT: 1 });
export const RISEX_ORDER_TYPE = Object.freeze({ MARKET: 0, LIMIT: 1 });
export const RISEX_TIF = Object.freeze({ GTC: 0, GTT: 1, FOK: 2, IOC: 3 });
export const RISEX_STP = Object.freeze({ EXPIRE_MAKER: 0, EXPIRE_TAKER: 1, EXPIRE_BOTH: 2 });

export const REGISTER_SIGNER_TYPES = {
  RegisterSigner: [
    { name: 'signer', type: 'address' },
    { name: 'message', type: 'string' },
    { name: 'expiration', type: 'uint32' },
    { name: 'nonceAnchor', type: 'uint48' },
    { name: 'nonceBitmap', type: 'uint8' },
  ],
};

export const VERIFY_WITNESS_TYPES = {
  VerifyWitness: [
    { name: 'account', type: 'address' },
    { name: 'hash', type: 'bytes32' },
    { name: 'nonceAnchor', type: 'uint48' },
    { name: 'nonceBitmap', type: 'uint8' },
    { name: 'deadline', type: 'uint32' },
    { name: 'permission', type: 'uint8' },
  ],
};

const EIP712_DOMAIN_TYPES = [
  { name: 'name', type: 'string' },
  { name: 'version', type: 'string' },
  { name: 'chainId', type: 'uint256' },
  { name: 'verifyingContract', type: 'address' },
];

const MAX_BITMAP_INDEX = 207;
const RISEX_PERMISSION_ALL = 1;
const runtimeSignerCache = new Map();

export function isRisexAddress(addr) {
  return /^0x[0-9a-fA-F]{40}$/.test(String(addr || '').trim());
}

export function normalizeRisexSymbol(value) {
  return String(value || '')
    .trim()
    .toUpperCase()
    .replace(/-PERP$/u, '')
    .replace(/\/USDC$/u, '')
    .replace(/\/USD$/u, '');
}

export function risexErrorMessage(error, fallback = 'RISEx request failed') {
  if (!error) return fallback;
  const msg = error?.shortMessage
    || error?.details
    || error?.response?.data?.message
    || error?.response?.data?.error
    || error?.data?.message
    || error?.message
    || String(error);
  return msg || fallback;
}

export function normalizeRisexMarkets(rows = []) {
  return (Array.isArray(rows) ? rows : [])
    .map((m) => {
      const marketId = Number(m?.market_id ?? m?.id);
      const symbol = normalizeRisexSymbol(
        m?.base_symbol
        || m?.symbol
        || m?.market_name
        || m?.base_asset_symbol
        || m?.display_base_asset_symbol
        || m?.display_name
        || m?.underlying
        || m?.config?.name,
      );
      const mark = Number(m?.mark_price ?? m?.mark ?? m?.oracle_price ?? 0);
      const stepSize = Number(m?.config?.step_size ?? m?.step_size ?? 0.000001);
      const stepPrice = Number(m?.config?.step_price ?? m?.step_price ?? 0.1);
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
        min_order_size: String(m?.config?.min_order_size ?? m?.min_order_size ?? stepSize ?? 0.000001),
        max_leverage: Number(m?.config?.max_leverage ?? m?.max_leverage ?? 25),
        mark,
        mid: Number(m?.mid_price ?? m?.mid ?? mark),
        oracle: Number(m?.oracle_price ?? mark),
        volume_24h: Number(m?.volume_24h ?? m?.quote_volume_24h ?? m?.daily_volume ?? 0),
        open_interest: Number(m?.open_interest ?? 0),
        funding_rate: Number(m?.funding_rate ?? m?.current_funding_rate ?? 0),
        _risex: { marketId, stepSize, stepPrice, raw: m },
        _raw: m,
      };
    })
    .filter(m => m.symbol && Number.isFinite(m.market_id));
}

export function normalizeRisexPrices(markets = []) {
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

function signerStorage() {
  if (typeof window === 'undefined') return null;
  try { return window.localStorage || window.sessionStorage || null; } catch { return null; }
}

function signerStorageKey(owner) {
  return `${RISEX_SIGNER_STORAGE_PREFIX}:${String(owner || '').toLowerCase()}`;
}

function isPrivateKey(value) {
  return /^0x[0-9a-fA-F]{64}$/.test(String(value || '').trim());
}

function signerFromPrivateKey(privateKey, expiresAt = Math.floor(Date.now() / 1000) + RISEX_SIGNER_TTL_SECONDS) {
  const account = privateKeyToAccount(privateKey);
  return {
    account,
    privateKey,
    address: account.address.toLowerCase(),
    expiresAt: Number(expiresAt) || Math.floor(Date.now() / 1000) + RISEX_SIGNER_TTL_SECONDS,
  };
}

export function readRisexSigner(owner) {
  const key = signerStorageKey(owner);
  const storage = signerStorage();
  const raw = runtimeSignerCache.get(key) || (() => {
    if (!storage) return null;
    try { return storage.getItem(key); } catch { return null; }
  })();
  if (!raw) return null;
  try {
    const parsed = JSON.parse(raw);
    if (!isPrivateKey(parsed?.privateKey)) return null;
    if (Number(parsed?.expiresAt || 0) <= Math.floor(Date.now() / 1000) + 60) return null;
    return signerFromPrivateKey(parsed.privateKey, parsed.expiresAt);
  } catch {
    return null;
  }
}

export function rememberRisexSigner(owner, record) {
  if (!owner || !record?.privateKey) return record;
  const next = signerFromPrivateKey(record.privateKey, record.expiresAt);
  const payload = JSON.stringify({
    privateKey: next.privateKey,
    address: next.address,
    expiresAt: next.expiresAt,
  });
  const key = signerStorageKey(owner);
  runtimeSignerCache.set(key, payload);
  const storage = signerStorage();
  if (storage) {
    try { storage.setItem(key, payload); } catch { /* storage disabled */ }
  }
  return next;
}

export function getOrCreateRisexSigner(owner) {
  if (!isRisexAddress(owner)) throw new Error('Connect your EVM wallet first');
  const existing = readRisexSigner(owner);
  if (existing) return existing;
  return rememberRisexSigner(owner, signerFromPrivateKey(generatePrivateKey()));
}

export function risexDomain(input = {}) {
  return {
    name: input.name || 'RISEx',
    version: input.version || '1',
    chainId: Number(input.chainId ?? input.chain_id ?? RISE_CHAIN_ID),
    verifyingContract: input.verifyingContract || input.verifying_contract || RISEX_AUTH_ADDRESS,
  };
}

export function normalizeRisexInviteCode(value) {
  const compact = String(value || '')
    .trim()
    .toUpperCase()
    .replace(/[^A-Z0-9]/gu, '');
  if (!compact) return '';
  if (compact.length <= 4) return compact;
  return `${compact.slice(0, 4)}-${compact.slice(4)}`;
}

export function risexInviteMessage(code) {
  const canonical = normalizeRisexInviteCode(code);
  if (!canonical) throw new Error('Enter a RISEx invite code');
  return `This signature verifies that I own the associated account and intend on redeeming code ${canonical} to access RISEx`;
}

function typedDataPayload({ domain, types, primaryType, message }) {
  return {
    domain,
    types: { EIP712Domain: EIP712_DOMAIN_TYPES, ...types },
    primaryType,
    message,
  };
}

function withoutDomain(types = {}) {
  const { EIP712Domain: _domain, ...rest } = types;
  return rest;
}

function stringifyTypedData(value) {
  return JSON.stringify(value, (_key, item) => (
    typeof item === 'bigint' ? item.toString() : item
  ));
}

export async function signTypedDataCompat({ provider, walletClient, account, domain, types, primaryType, message }) {
  const cleanAccount = String(account || '').trim();
  if (provider?.request) {
    const payload = typedDataPayload({ domain, types, primaryType, message });
    try {
      return await provider.request({
        method: 'eth_signTypedData_v4',
        params: [cleanAccount, stringifyTypedData(payload)],
      });
    } catch (jsonError) {
      try {
        return await provider.request({
          method: 'eth_signTypedData_v4',
          params: [cleanAccount, payload],
        });
      } catch {
        if (!walletClient?.signTypedData) throw jsonError;
      }
    }
  }
  if (walletClient?.signTypedData) {
    return walletClient.signTypedData({
      account: cleanAccount,
      domain,
      types: withoutDomain(types),
      primaryType,
      message,
    });
  }
  throw new Error('Wallet signer is not ready');
}

export async function signMessageCompat({ provider, walletClient, account, message }) {
  const cleanAccount = String(account || '').trim();
  if (walletClient?.signMessage) {
    try {
      return await walletClient.signMessage({ account: cleanAccount, message });
    } catch (walletError) {
      if (!provider?.request) throw walletError;
    }
  }
  if (provider?.request) {
    try {
      return await provider.request({
        method: 'personal_sign',
        params: [message, cleanAccount],
      });
    } catch (messageFirstError) {
      try {
        return await provider.request({
          method: 'personal_sign',
          params: [cleanAccount, message],
        });
      } catch {
        throw messageFirstError;
      }
    }
  }
  throw new Error('Wallet message signer is not ready');
}

export function fixSignatureV(signature) {
  const bytes = hexToBytes(signature);
  if (bytes.length === 65 && bytes[64] < 27) bytes[64] += 27;
  return `0x${Array.from(bytes).map(b => b.toString(16).padStart(2, '0')).join('')}`;
}

export async function createRisexRegisterPayload({
  account,
  signer,
  domain,
  nonceState,
  provider,
  walletClient,
  label = 'clashofperps',
}) {
  const expiresAt = Math.floor(Date.now() / 1000) + RISEX_SIGNER_TTL_SECONDS;
  let nonceAnchor = Number(nonceState?.nonce_anchor || 0);
  let nonceBitmap = Number(nonceState?.current_bitmap_index ?? nonceState?.nonce_bitmap_index ?? 0);
  if (nonceBitmap > MAX_BITMAP_INDEX) {
    nonceAnchor += 1;
    nonceBitmap = 0;
  }
  const cleanDomain = risexDomain(domain);
  const message = {
    signer: signer.address,
    message: RISEX_REGISTER_MESSAGE,
    expiration: expiresAt,
    nonceAnchor,
    nonceBitmap,
  };
  const accountSignature = fixSignatureV(await signTypedDataCompat({
    provider,
    walletClient,
    account,
    domain: cleanDomain,
    types: REGISTER_SIGNER_TYPES,
    primaryType: 'RegisterSigner',
    message,
  }));
  return {
    account,
    signer: signer.address,
    message: RISEX_REGISTER_MESSAGE,
    nonce_anchor: String(nonceAnchor),
    nonce_bitmap: nonceBitmap,
    nonce_bitmap_index: nonceBitmap,
    expiration: String(expiresAt),
    account_signature: accountSignature,
    label,
  };
}

export async function createRisexInviteRedeemPayload({
  account,
  code,
  provider,
  walletClient,
}) {
  const canonicalCode = normalizeRisexInviteCode(code);
  const message = risexInviteMessage(canonicalCode);
  const signature = await signMessageCompat({
    provider,
    walletClient,
    account,
    message,
  });
  return {
    code: canonicalCode,
    address: account,
    signature,
  };
}

function encodeOrderFlags(p) {
  let orderFlags = 0;
  if (p.side & 1) orderFlags |= 1;
  if (p.post_only) orderFlags |= 2;
  if (p.reduce_only) orderFlags |= 4;
  orderFlags |= (p.stp_mode & 3) << 3;
  return orderFlags & 0xff;
}

export function encodeRisexOrder(orderParams) {
  const encoded = encodePacked(
    ['uint64', 'uint128', 'uint128', 'uint8', 'uint8', 'uint8', 'uint32'],
    [
      BigInt(orderParams.market_id),
      BigInt(orderParams.size ?? orderParams.size_steps ?? 0),
      BigInt(orderParams.price ?? orderParams.price_ticks ?? 0),
      encodeOrderFlags(orderParams),
      Number(orderParams.order_type ?? 0),
      Number(orderParams.tif ?? orderParams.time_in_force ?? 0),
      Number(orderParams.expiry ?? 0),
    ],
  );
  return keccak256(encoded);
}

export function encodeRisexCancelOrder(cancelParams) {
  const orderId = cancelParams?.order_id ?? cancelParams?.resting_order_id;
  if (orderId == null) {
    throw new Error('RISEx cancel needs order_id from the open order');
  }
  const marketId = BigInt(cancelParams.market_id);
  const packed = (marketId << 192n) | BigInt(orderId);
  const encoded = `0x${packed.toString(16).padStart(64, '0')}`;
  return keccak256(encoded);
}

export async function createRisexPermit({
  account,
  signer,
  domain,
  nonceState,
  hash,
  permission = RISEX_PERMISSION_ALL,
}) {
  const nonceAnchor = Number(nonceState?.nonce_anchor || 0);
  let nonceBitmapIndex = Number(nonceState?.current_bitmap_index ?? nonceState?.nonce_bitmap_index ?? 0);
  let nextAnchor = nonceAnchor;
  if (nonceBitmapIndex > MAX_BITMAP_INDEX) {
    nextAnchor += 1;
    nonceBitmapIndex = 0;
  }
  const deadline = Math.floor(Date.now() / 1000) + RISEX_PERMIT_TTL_SECONDS;
  const rawSig = fixSignatureV(await signer.account.signTypedData({
    domain: risexDomain(domain),
    types: VERIFY_WITNESS_TYPES,
    primaryType: 'VerifyWitness',
    message: {
      account,
      hash,
      nonceAnchor: nextAnchor,
      nonceBitmap: nonceBitmapIndex,
      deadline,
      permission,
    },
  }));
  return {
    account,
    signer: signer.address,
    nonce_anchor: String(nextAnchor),
    nonce_bitmap: nonceBitmapIndex,
    nonce_bitmap_index: nonceBitmapIndex,
    deadline: String(deadline),
    permission,
    signature: rawSig,
  };
}

export function nextRisexClientOrderId() {
  const now = BigInt(Date.now());
  const rnd = BigInt(Math.floor(Math.random() * 1_000_000));
  return String((now << 20n) + rnd);
}

function decimalStepCount(value, step) {
  const n = Number(value);
  const s = Number(step);
  if (!Number.isFinite(n) || !Number.isFinite(s) || n <= 0 || s <= 0) return 0;
  return Math.max(1, Math.round(n / s));
}

export function buildRisexOrderParams({
  market,
  side,
  amountUsd,
  amountBase,
  leverage = 1,
  price,
  orderType = 'market',
  reduceOnly = false,
  postOnly = false,
}) {
  if (!market) throw new Error('Select a valid RISEx market');
  const mark = Number(price || market.mark || market.mid || 0);
  if (!Number.isFinite(mark) || mark <= 0) throw new Error('RISEx market price is unavailable');
  const stepSize = Number(market?._risex?.stepSize || market.lot_size || 0.000001);
  const stepPrice = Number(market?._risex?.stepPrice || market.tick_size || 0.1);
  const notional = Number(amountBase) > 0
    ? Number(amountBase) * mark
    : Number(amountUsd || 0) * Number(leverage || 1);
  const baseSize = Number(amountBase) > 0
    ? Number(amountBase)
    : notional / mark;
  const sizeSteps = decimalStepCount(baseSize, stepSize);
  if (!sizeSteps) throw new Error('Enter a positive order size');
  const minOrder = Number(market.min_order_size || stepSize || 0);
  if (minOrder > 0 && sizeSteps * stepSize + 1e-12 < minOrder) {
    throw new Error(`Minimum RISEx order size is ${minOrder} ${market.symbol}`);
  }
  const isLimit = String(orderType || '').toLowerCase() === 'limit';
  const priceTicks = isLimit ? decimalStepCount(mark, stepPrice) : 0;
  const expiry = Math.floor(Date.now() / 1000) + (isLimit ? 24 * 60 * 60 : 5 * 60);
  const timeInForce = isLimit ? RISEX_TIF.GTC : RISEX_TIF.IOC;
  return {
    market_id: Number(market.market_id ?? market.pair_index),
    side: side === 'ask' || side === 'short' || side === 'sell' ? RISEX_SIDE.SHORT : RISEX_SIDE.LONG,
    order_type: isLimit ? RISEX_ORDER_TYPE.LIMIT : RISEX_ORDER_TYPE.MARKET,
    price_ticks: priceTicks,
    size_steps: sizeSteps,
    time_in_force: timeInForce,
    tif: timeInForce,
    post_only: !!postOnly,
    reduce_only: !!reduceOnly,
    stp_mode: RISEX_STP.EXPIRE_MAKER,
    expiry,
    ttl_units: 0,
    client_order_id: nextRisexClientOrderId(),
    builder_id: 0,
  };
}

export function formatRisexUsdc(raw) {
  try {
    return Number(formatUnits(raw, 6));
  } catch {
    return null;
  }
}
