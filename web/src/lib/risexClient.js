import {
  encodeAbiParameters,
  formatUnits,
  hexToBytes,
  keccak256,
  stringToHex,
} from 'viem';
import { generatePrivateKey, privateKeyToAccount } from 'viem/accounts';
import {
  RISEX_AUTH_ADDRESS,
  RISEX_ROUTER_ADDRESS,
  RISE_CHAIN_ID,
} from './risexConfig';

export const RISEX_SIGNER_STORAGE_PREFIX = 'clash_risex_signer_v1';
export const RISEX_REGISTER_MESSAGE = 'Registering signer for RISEx';
export const RISEX_SIGNER_TTL_SECONDS = 365 * 24 * 60 * 60;
export const RISEX_PERMIT_TTL_SECONDS = 300;
export const RISEX_MIN_DEPOSIT_USDC = 1;

export const RISEX_SIDE = Object.freeze({ LONG: 0, SHORT: 1 });
export const RISEX_ORDER_TYPE = Object.freeze({ MARKET: 0, LIMIT: 1 });
export const RISEX_TIF = Object.freeze({ GTC: 0, GTT: 1, FOK: 2, IOC: 3 });
export const RISEX_STP = Object.freeze({ EXPIRE_MAKER: 0, EXPIRE_TAKER: 1, EXPIRE_BOTH: 2 });
export const RISEX_TPSL_STOP_TYPE = Object.freeze({ TAKE_PROFIT: 'TAKE_PROFIT', STOP_LOSS: 'STOP_LOSS' });
export const RISEX_TPSL_PRICE_OPTION = Object.freeze({ LAST_TRADED_PRICE: 'LAST_TRADED_PRICE', MARK_PRICE: 'MARK_PRICE' });
export const RISEX_TPSL_MAX_BUDGET = (1n << 96n) - 1n;
export const RISEX_TPSL_ALLOWANCE_TTL_SECONDS = 365 * 24 * 60 * 60;

export const PERMIT_SINGLE_TYPES = {
  PermitSingle: [
    { name: 'account', type: 'address' },
    { name: 'operator', type: 'address' },
    { name: 'budget', type: 'uint96' },
    { name: 'allowanceExpiry', type: 'uint32' },
    { name: 'nonceAnchor', type: 'uint48' },
    { name: 'nonceBitmap', type: 'uint8' },
  ],
};

export const PLACE_TPSL_ORDER_TYPES = {
  PlaceTpslOrder: [
    { name: 'account', type: 'address' },
    { name: 'marketId', type: 'uint64' },
    { name: 'side', type: 'uint8' },
    { name: 'size', type: 'string' },
    { name: 'stopType', type: 'uint8' },
    { name: 'stopPrice', type: 'string' },
    { name: 'limitPrice', type: 'string' },
    { name: 'orderType', type: 'uint8' },
    { name: 'stopPriceOption', type: 'uint8' },
    { name: 'tif', type: 'uint8' },
    { name: 'deadline', type: 'uint32' },
    { name: 'sizePercentBps', type: 'uint32' },
  ],
};

export const CANCEL_TPSL_ORDER_TYPES = {
  CancelTpslOrder: [
    { name: 'account', type: 'address' },
    { name: 'orderId', type: 'string' },
    { name: 'deadline', type: 'uint32' },
  ],
};

export const REGISTER_SIGNER_TYPES = {
  RegisterSigner: [
    { name: 'account', type: 'address' },
    { name: 'signer', type: 'address' },
    { name: 'message', type: 'string' },
    { name: 'expiration', type: 'uint32' },
    { name: 'nonceAnchor', type: 'uint48' },
    { name: 'nonceBitmap', type: 'uint8' },
  ],
};

export const VERIFY_SIGNER_TYPES = {
  VerifySigner: [
    { name: 'account', type: 'address' },
    { name: 'nonceAnchor', type: 'uint48' },
    { name: 'nonceBitmap', type: 'uint8' },
  ],
};

export const VERIFY_WITNESS_TYPES = {
  VerifyWitness: [
    { name: 'account', type: 'address' },
    { name: 'target', type: 'address' },
    { name: 'hash', type: 'bytes32' },
    { name: 'nonceAnchor', type: 'uint48' },
    { name: 'nonceBitmap', type: 'uint8' },
    { name: 'deadline', type: 'uint32' },
  ],
};

const EIP712_DOMAIN_TYPES = [
  { name: 'name', type: 'string' },
  { name: 'version', type: 'string' },
  { name: 'chainId', type: 'uint256' },
  { name: 'verifyingContract', type: 'address' },
];

const MAX_BITMAP_INDEX = 207;
const runtimeSignerCache = new Map();
const ACTION_PLACE_ORDER_HASH = keccak256(stringToHex('RISE_PERPS_PLACE_ORDER_V1'));
const ACTION_CANCEL_ORDER_HASH = keccak256(stringToHex('RISE_PERPS_CANCEL_ORDER_V1'));
const ACTION_APPROVE_BUILDER_FEE_HASH = keccak256(stringToHex('RISE_APPROVE_BUILDER_FEE_V1'));
const V3_FLAG_PERMIT = 1;
const V3_FLAG_BUILDER = 2;
const V3_FLAG_CLIENT_ID = 4;
const V3_FLAG_TTL = 16;

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

function firstFiniteNumber(values, fallback = 0) {
  for (const value of values) {
    const n = Number(value);
    if (Number.isFinite(n)) return n;
  }
  return fallback;
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
      const mark = firstFiniteNumber([
        m?.mark_price,
        m?.mark,
        m?.mid_price,
        m?.mid,
        m?.oracle_price,
        m?.last_price,
        m?.index_price,
      ], 0);
      const stepSize = firstFiniteNumber([
        m?.config?.step_size,
        m?._risex?.stepSize,
        m?.step_size,
        m?.lot_size,
        m?.config?.lot_size,
        m?.config?.size_increment,
        m?.size_increment,
      ], 0.000001);
      const stepPrice = firstFiniteNumber([
        m?.config?.step_price,
        m?._risex?.stepPrice,
        m?.step_price,
        m?.tick_size,
        m?.config?.tick_size,
        m?.config?.price_increment,
        m?.price_increment,
      ], 0.1);
      const minOrderSize = firstFiniteNumber([
        m?.config?.min_order_size,
        m?.min_order_size,
        m?.min_size,
        stepSize,
      ], stepSize);
      const active = m?.active !== false && m?._risex?.active !== false;
      const unlocked = m?.config?.unlocked !== false && m?._risex?.unlocked !== false;
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
        min_order_size: String(minOrderSize || stepSize || 0.000001),
        max_leverage: Number(m?.config?.max_leverage ?? m?.max_leverage ?? 25),
        mark,
        mid: Number(m?.mid_price ?? m?.mid ?? mark),
        oracle: Number(m?.oracle_price ?? mark),
        volume_24h: Number(m?.volume_24h ?? m?.quote_volume_24h ?? m?.daily_volume ?? 0),
        open_interest: Number(m?.open_interest ?? 0),
        funding_rate: Number(m?.funding_rate ?? m?.current_funding_rate ?? 0),
        _risex: { marketId, stepSize, stepPrice, active, unlocked, raw: m },
        _raw: m,
      };
    })
    .filter(
      m => m.symbol
        && Number.isFinite(m.market_id)
        && m._risex.active
        && m._risex.unlocked,
    );
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

export function forgetRisexSigner(owner) {
  const key = signerStorageKey(owner);
  runtimeSignerCache.delete(key);
  const storage = signerStorage();
  if (storage) {
    try { storage.removeItem(key); } catch { /* storage disabled */ }
  }
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

function hexSignatureToBase64(signature) {
  const bytes = hexToBytes(signature);
  let binary = '';
  for (const byte of bytes) binary += String.fromCharCode(byte);
  if (typeof btoa === 'function') return btoa(binary);
  const BufferCtor = globalThis.Buffer;
  if (BufferCtor?.from) return BufferCtor.from(bytes).toString('base64');
  throw new Error('Base64 encoder is not available');
}

function nextRisexNonceFields(nonceState) {
  let nonceAnchor = Number(nonceState?.nonce_anchor || 0);
  let nonceBitmap = Number(
    nonceState?.current_bitmap_index
    ?? nonceState?.nonce_bitmap_index
    ?? 0,
  );
  if (!Number.isInteger(nonceAnchor) || nonceAnchor < 0 || nonceAnchor > 0xffffffffffff) {
    throw new Error('RISEx nonce anchor is invalid');
  }
  if (!Number.isInteger(nonceBitmap) || nonceBitmap < 0) {
    throw new Error('RISEx nonce bitmap index is invalid');
  }
  if (nonceBitmap > MAX_BITMAP_INDEX) {
    nonceAnchor += 1;
    nonceBitmap = 0;
  }
  return { nonceAnchor, nonceBitmap };
}

function canonicalPositiveDecimal(value, label) {
  const raw = String(value ?? '').trim();
  const n = Number(raw);
  if (!raw || !Number.isFinite(n) || n <= 0) throw new Error(`${label} must be positive`);
  const expanded = /e/iu.test(raw) ? n.toFixed(18) : raw;
  const canonical = expanded
    .replace(/^\+/u, '')
    .replace(/^(\d+)\.(\d*?)0+$/u, '$1.$2')
    .replace(/\.$/u, '');
  if (!/^\d+(?:\.\d+)?$/u.test(canonical) || Number(canonical) <= 0) {
    throw new Error(`${label} must be a decimal string`);
  }
  return canonical;
}

function risexTpslSide(value) {
  const side = String(value ?? '').trim().toLowerCase();
  return side === 'ask' || side === 'sell' || side === 'short' || side === '1'
    ? RISEX_SIDE.SHORT
    : RISEX_SIDE.LONG;
}

function risexTpslEnumValues(params) {
  const stopType = String(params.stop_type || '').toUpperCase();
  const orderType = String(params.order_type || 'MARKET').toUpperCase();
  const stopPriceOption = String(params.stop_price_option || 'MARK_PRICE').toUpperCase();
  const tif = String(params.tif || (orderType === 'LIMIT' ? 'GTC' : 'FOK')).toUpperCase();
  const stopTypeValue = stopType === RISEX_TPSL_STOP_TYPE.STOP_LOSS ? 1 : 0;
  const orderTypeValue = orderType === 'LIMIT' ? 1 : 0;
  const priceOptionValue = stopPriceOption === RISEX_TPSL_PRICE_OPTION.MARK_PRICE ? 1 : 0;
  const tifValue = RISEX_TIF[tif];
  if (![RISEX_TPSL_STOP_TYPE.TAKE_PROFIT, RISEX_TPSL_STOP_TYPE.STOP_LOSS].includes(stopType)) {
    throw new Error('RISEx TP/SL stop type is invalid');
  }
  if (!['MARKET', 'LIMIT'].includes(orderType)) throw new Error('RISEx TP/SL order type is invalid');
  if (!Object.values(RISEX_TPSL_PRICE_OPTION).includes(stopPriceOption)) {
    throw new Error('RISEx TP/SL price option is invalid');
  }
  if (!Number.isInteger(tifValue)) throw new Error('RISEx TP/SL time in force is invalid');
  return {
    stopType,
    stopTypeValue,
    orderType,
    orderTypeValue,
    stopPriceOption,
    priceOptionValue,
    tif,
    tifValue,
  };
}

export async function createRisexPermitSinglePayload({
  account,
  operator,
  domain,
  nonceState,
  provider,
  walletClient,
}) {
  if (!isRisexAddress(account) || !isRisexAddress(operator)) {
    throw new Error('RISEx allowance account or operator is invalid');
  }
  const { nonceAnchor, nonceBitmap } = nextRisexNonceFields(nonceState);
  const allowanceExpiry = Math.floor(Date.now() / 1000) + RISEX_TPSL_ALLOWANCE_TTL_SECONDS;
  const message = {
    account,
    operator,
    budget: RISEX_TPSL_MAX_BUDGET,
    allowanceExpiry,
    nonceAnchor,
    nonceBitmap,
  };
  const signature = fixSignatureV(await signTypedDataCompat({
    provider,
    walletClient,
    account,
    domain: risexDomain(domain),
    types: PERMIT_SINGLE_TYPES,
    primaryType: 'PermitSingle',
    message,
  }));
  return {
    account,
    operator,
    budget: RISEX_TPSL_MAX_BUDGET.toString(),
    allowance_expiry: allowanceExpiry,
    nonce_anchor: String(nonceAnchor),
    nonce_bitmap_index: nonceBitmap,
    signature,
  };
}

export async function createRisexTpslOrderPayload({ account, signer, domain, params }) {
  if (!isRisexAddress(account) || !signer?.account || !isRisexAddress(signer.address)) {
    throw new Error('RISEx TP/SL signer is unavailable');
  }
  const marketId = Number(params?.market_id);
  if (!Number.isInteger(marketId) || marketId <= 0) throw new Error('RISEx TP/SL market is invalid');
  const size = canonicalPositiveDecimal(params?.size, 'RISEx TP/SL size');
  const stopPrice = canonicalPositiveDecimal(params?.stop_price, 'RISEx TP/SL stop price');
  const sizePercentBps = Number(params?.size_percent_bps ?? 10_000);
  if (!Number.isInteger(sizePercentBps) || sizePercentBps < 0 || sizePercentBps > 10_000) {
    throw new Error('RISEx TP/SL size percent is invalid');
  }
  const side = risexTpslSide(params?.side);
  const values = risexTpslEnumValues(params || {});
  const limitPrice = values.orderType === 'LIMIT'
    ? canonicalPositiveDecimal(params?.limit_price, 'RISEx TP/SL limit price')
    : '0';
  const deadline = Math.floor(Date.now() / 1000) + RISEX_PERMIT_TTL_SECONDS;
  const rawSignature = fixSignatureV(await signer.account.signTypedData({
    domain: risexDomain(domain),
    types: PLACE_TPSL_ORDER_TYPES,
    primaryType: 'PlaceTpslOrder',
    message: {
      account,
      marketId: BigInt(marketId),
      side,
      size,
      stopType: values.stopTypeValue,
      stopPrice,
      limitPrice,
      orderType: values.orderTypeValue,
      stopPriceOption: values.priceOptionValue,
      tif: values.tifValue,
      deadline,
      sizePercentBps,
    },
  }));
  return {
    account,
    market_id: marketId,
    side,
    size,
    stop_type: values.stopType,
    order_type: values.orderType,
    stop_price: stopPrice,
    limit_price: limitPrice,
    stop_price_option: values.stopPriceOption,
    tif: values.tif,
    signer: signer.address,
    signature: hexSignatureToBase64(rawSignature),
    deadline,
    size_percent_bps: sizePercentBps,
  };
}

export async function createRisexCancelTpslPayload({ account, signer, domain, orderId }) {
  const cleanOrderId = String(orderId || '').trim();
  if (!isRisexAddress(account) || !signer?.account || !isRisexAddress(signer.address)) {
    throw new Error('RISEx TP/SL signer is unavailable');
  }
  if (!cleanOrderId) throw new Error('RISEx TP/SL order id is missing');
  const deadline = Math.floor(Date.now() / 1000) + RISEX_PERMIT_TTL_SECONDS;
  const rawSignature = fixSignatureV(await signer.account.signTypedData({
    domain: risexDomain(domain),
    types: CANCEL_TPSL_ORDER_TYPES,
    primaryType: 'CancelTpslOrder',
    message: { account, orderId: cleanOrderId, deadline },
  }));
  return {
    account,
    order_id: cleanOrderId,
    signer: signer.address,
    signature: hexSignatureToBase64(rawSignature),
    deadline,
  };
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
  let nonceBitmap = Number(
    nonceState?.current_bitmap_index
    ?? nonceState?.nonce_bitmap_index
    ?? 0,
  );
  if (!Number.isInteger(nonceAnchor) || nonceAnchor < 0 || nonceAnchor > 0xffffffffffff) {
    throw new Error('RISEx signer nonce anchor is invalid');
  }
  if (!Number.isInteger(nonceBitmap) || nonceBitmap < 0) {
    throw new Error('RISEx signer nonce bitmap index is invalid');
  }
  if (nonceBitmap > MAX_BITMAP_INDEX) {
    nonceAnchor += 1;
    nonceBitmap = 0;
  }
  const cleanDomain = risexDomain(domain);
  const message = {
    account,
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
  const signerSignature = fixSignatureV(await signer.account.signTypedData({
    domain: cleanDomain,
    types: VERIFY_SIGNER_TYPES,
    primaryType: 'VerifySigner',
    message: {
      account,
      nonceAnchor,
      nonceBitmap,
    },
  }));
  return {
    account,
    signer: signer.address,
    message: message.message,
    nonce_anchor: String(nonceAnchor),
    nonce_bitmap_index: nonceBitmap,
    expiration: String(expiresAt),
    account_signature: accountSignature,
    signer_signature: signerSignature,
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
  orderFlags |= (p.order_type & 1) << 5;
  orderFlags |= ((p.time_in_force ?? p.tif ?? 0) & 3) << 6;
  return orderFlags & 0xff;
}

function encodeRisexOrderData(p) {
  const marketId = BigInt(Number(p.market_id) & 0xffff);
  const sizeSteps = BigInt(p.size_steps ?? p.size ?? 0) & 0xffffffffn;
  const priceTicks = BigInt(p.price_ticks ?? p.price ?? 0) & 0xffffffn;
  const headerVersion = 1n;
  let data = 0n;
  data |= marketId << 70n;
  data |= sizeSteps << 38n;
  data |= priceTicks << 14n;
  data |= BigInt(encodeOrderFlags(p)) << 6n;
  data |= (headerVersion & 31n) << 1n;
  return data;
}

function encodeRisexHeaderFlags(p) {
  const builderId = Number(p.builder_id ?? 0);
  const clientOrderId = BigInt(p.client_order_id ?? 0);
  const ttlUnits = Number(p.ttl_units ?? 0);
  let flags = V3_FLAG_PERMIT;
  if (builderId !== 0) flags |= V3_FLAG_BUILDER;
  if (clientOrderId !== 0n) flags |= V3_FLAG_CLIENT_ID;
  if (ttlUnits !== 0) flags |= V3_FLAG_TTL;
  return flags;
}

export function encodeRisexOrder(orderParams) {
  const p = {
    ...orderParams,
    size_steps: orderParams.size_steps ?? orderParams.size ?? 0,
    price_ticks: orderParams.price_ticks ?? orderParams.price ?? 0,
    time_in_force: orderParams.time_in_force ?? orderParams.tif ?? 0,
    builder_id: orderParams.builder_id ?? 0,
    builder_fee_bps: orderParams.builder_fee_bps ?? 0,
    client_order_id: orderParams.client_order_id ?? 0,
    ttl_units: orderParams.ttl_units ?? 0,
  };
  const builderId = Number(p.builder_id);
  if (builderId !== 0) {
    const builderFeeBps = Number(p.builder_fee_bps);
    if (!Number.isInteger(builderFeeBps) || builderFeeBps <= 0 || builderFeeBps > 65_535) {
      throw new Error('RISEx builder fee must be a positive uint16 value');
    }
    const encodedV3 = encodeAbiParameters(
      [
        { type: 'bytes32' },
        { type: 'uint8' },
        { type: 'uint88' },
        { type: 'uint16' },
        { type: 'uint16' },
        { type: 'uint64' },
        { type: 'uint16' },
      ],
      [
        ACTION_PLACE_ORDER_HASH,
        encodeRisexHeaderFlags(p),
        encodeRisexOrderData(p),
        builderId,
        builderFeeBps,
        BigInt(p.client_order_id),
        Number(p.ttl_units),
      ],
    );
    return keccak256(encodedV3);
  }
  const encoded = encodeAbiParameters(
    [
      { type: 'bytes32' },
      { type: 'uint8' },
      { type: 'uint88' },
      { type: 'uint16' },
      { type: 'uint64' },
      { type: 'uint16' },
    ],
    [
      ACTION_PLACE_ORDER_HASH,
      encodeRisexHeaderFlags(p),
      encodeRisexOrderData(p),
      Number(p.builder_id),
      BigInt(p.client_order_id),
      Number(p.ttl_units),
    ],
  );
  return keccak256(encoded);
}

export function encodeRisexBuilderFeeApproval({ builderId, maxFeeBps }) {
  const canonicalBuilderId = Number(builderId);
  const canonicalMaxFeeBps = Number(maxFeeBps);
  if (!Number.isInteger(canonicalBuilderId) || canonicalBuilderId <= 0 || canonicalBuilderId > 65_535) {
    throw new Error('RISEx builder id must be a positive uint16 value');
  }
  if (!Number.isInteger(canonicalMaxFeeBps) || canonicalMaxFeeBps <= 0 || canonicalMaxFeeBps > 65_535) {
    throw new Error('RISEx builder fee ceiling must be a positive uint16 value');
  }
  return keccak256(encodeAbiParameters(
    [{ type: 'bytes32' }, { type: 'uint16' }, { type: 'uint16' }],
    [ACTION_APPROVE_BUILDER_FEE_HASH, canonicalBuilderId, canonicalMaxFeeBps],
  ));
}

export function encodeRisexCancelOrder(cancelParams) {
  const orderId = cancelParams?.resting_order_id ?? cancelParams?.order_id;
  if (orderId == null) {
    throw new Error('RISEx cancel needs resting_order_id from the open order');
  }
  const marketId = Number(cancelParams.market_id);
  const restingOrderId = BigInt(orderId);
  if (!Number.isInteger(marketId) || marketId <= 0 || marketId > 0xffff) {
    throw new Error('RISEx cancel market_id must be a positive uint16 value');
  }
  if (restingOrderId < 0n || restingOrderId > 0xffffffffffn) {
    throw new Error('RISEx cancel resting_order_id must fit uint40');
  }
  const encoded = encodeAbiParameters(
    [{ type: 'bytes32' }, { type: 'uint16' }, { type: 'uint40' }],
    [ACTION_CANCEL_ORDER_HASH, marketId, restingOrderId],
  );
  return keccak256(encoded);
}

export async function createRisexPermit({
  account,
  signer,
  domain,
  nonceState,
  hash,
  target = RISEX_ROUTER_ADDRESS,
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
      target,
      hash,
      nonceAnchor: nextAnchor,
      nonceBitmap: nonceBitmapIndex,
      deadline,
    },
  }));
  return {
    account,
    signer: signer.address,
    nonce_anchor: String(nextAnchor),
    nonce_bitmap_index: nonceBitmapIndex,
    deadline,
    signature: hexSignatureToBase64(rawSig),
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
  builder,
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
  const builderId = Number(builder?.builder_id);
  const builderFeeBps = Number(builder?.builder_fee_bps);
  if (!builder?.registered || !Number.isInteger(builderId) || builderId <= 0) {
    throw new Error('Clash RISEx builder code is not registered yet');
  }
  if (!Number.isInteger(builderFeeBps) || builderFeeBps <= 0) {
    throw new Error('Clash RISEx builder fee is unavailable');
  }
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
    builder_id: builderId,
    builder_fee_bps: builderFeeBps,
  };
}

export function formatRisexUsdc(raw) {
  try {
    return Number(formatUnits(raw, 6));
  } catch {
    return null;
  }
}
