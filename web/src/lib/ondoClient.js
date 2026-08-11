export const ONDO_CHAIN_ID = 1;
export const ONDO_USDC_ADDRESS = '0xA0b86991c6218b36c1d19D4a2e9Eb0cE3606eB48';
export const ONDO_APP_URL = 'https://app.ondoperps.xyz';
export const ONDO_DOCS_URL = 'https://docs.ondoperps.xyz';
export const ONDO_WS_URL = 'wss://api.ondoperps.xyz/ws';
export const ONDO_SESSION_STORAGE_PREFIX = 'clash_ondo_session_v1';
export const ONDO_REGION_BLOCKED_MESSAGE = 'Ondo Perps is not available in your country or IP region.';

export const ONDO_USDC_ABI = [{
  type: 'function',
  name: 'balanceOf',
  stateMutability: 'view',
  inputs: [{ name: 'account', type: 'address' }],
  outputs: [{ name: '', type: 'uint256' }],
}, {
  type: 'function',
  name: 'transfer',
  stateMutability: 'nonpayable',
  inputs: [{ name: 'to', type: 'address' }, { name: 'amount', type: 'uint256' }],
  outputs: [{ name: '', type: 'bool' }],
}];

export function isOndoAddress(value) {
  return /^0x[0-9a-fA-F]{40}$/u.test(String(value || '').trim());
}

export function ondoMarketName(value) {
  const raw = String(value || '').trim().toUpperCase();
  if (!raw) return '';
  if (/-USD\.P$/u.test(raw)) return raw;
  return `${raw.replace(/-PERP$/u, '').replace(/\/USD$/u, '').replace(/USD\.P$/u, '')}-USD.P`;
}

export function ondoOrderSide(value) {
  const side = String(value || '').trim().toLowerCase();
  return ['buy', 'bid', 'long'].includes(side) ? 'buy' : 'sell';
}

export function buildOndoWsPing(id) {
  const value = String(id || '').trim();
  if (!value) throw new Error('Ondo WebSocket ping ID required');
  return { op: 'ping', id: value };
}

function decimalScale(value) {
  const text = String(value ?? '').trim();
  const match = /^(\d+)(?:\.(\d+))?$/u.exec(text);
  if (!match) throw new Error('Invalid decimal value');
  return { digits: BigInt(`${match[1]}${match[2] || ''}`), scale: (match[2] || '').length };
}

function pow10(value) {
  return 10n ** BigInt(value);
}

function decimalString(value, scale) {
  const negative = value < 0n;
  const abs = negative ? -value : value;
  const padded = abs.toString().padStart(scale + 1, '0');
  if (scale === 0) return `${negative ? '-' : ''}${padded}`;
  const whole = padded.slice(0, -scale);
  const fraction = padded.slice(-scale).replace(/0+$/u, '');
  return `${negative ? '-' : ''}${whole}${fraction ? `.${fraction}` : ''}`;
}

export function alignOndoDecimal(value, increment) {
  const input = decimalScale(value);
  const step = decimalScale(increment);
  if (input.digits <= 0n || step.digits <= 0n) throw new Error('Ondo amount and increment must be positive');
  const scale = Math.max(input.scale, step.scale);
  const inputInt = input.digits * pow10(scale - input.scale);
  const stepInt = step.digits * pow10(scale - step.scale);
  const aligned = (inputInt / stepInt) * stepInt;
  if (aligned <= 0n) throw new Error(`Amount is below Ondo minimum increment ${increment}`);
  return decimalString(aligned, scale);
}

export function buildOndoOrderRequest({ market, side, type = 'market', size, price, timeInForce = 'GTC', reduceOnly = false, clientOrderId, takeProfit, stopLoss }) {
  const orderType = String(type || 'market').toLowerCase();
  if (!['market', 'limit'].includes(orderType)) throw new Error('Ondo supports market and limit orders');
  const body = {
    market: ondoMarketName(market),
    side: ondoOrderSide(side),
    type: orderType,
    size: String(size),
    reduceOnly: !!reduceOnly,
  };
  if (orderType === 'limit') {
    body.price = String(price);
    body.timeInForce = ['GTC', 'IOC'].includes(String(timeInForce).toUpperCase()) ? String(timeInForce).toUpperCase() : 'GTC';
  }
  if (clientOrderId) body.clientOrderId = String(clientOrderId);
  if (Number(takeProfit) > 0) body.takeProfit = String(takeProfit);
  if (Number(stopLoss) > 0) body.stopLoss = String(stopLoss);
  return body;
}

function sessionStorageKey(wallet) {
  return `${ONDO_SESSION_STORAGE_PREFIX}:${String(wallet || '').toLowerCase()}`;
}

export function readOndoSession(wallet, storage = typeof window !== 'undefined' ? window.localStorage : null) {
  if (!isOndoAddress(wallet) || !storage) return null;
  try {
    const parsed = JSON.parse(storage.getItem(sessionStorageKey(wallet)) || 'null');
    if (!parsed || String(parsed.wallet || '').toLowerCase() !== String(wallet).toLowerCase()) return null;
    if (typeof parsed.token !== 'string' || parsed.token.length < 20) return null;
    const expiresAt = Number(parsed.expiresAt || 0);
    if (expiresAt > 0 && expiresAt <= Date.now() + 30_000) {
      storage.removeItem(sessionStorageKey(wallet));
      return null;
    }
    return parsed;
  } catch {
    return null;
  }
}

export function writeOndoSession(wallet, auth, storage = typeof window !== 'undefined' ? window.localStorage : null) {
  if (!isOndoAddress(wallet) || !storage) return null;
  const token = String(auth?.token || '').trim();
  if (token.length < 20) throw new Error('Ondo login did not return a session token');
  const expirationSecs = Number(auth?.expirationSecs || auth?.expiration_secs || 0);
  const record = {
    wallet: String(wallet).toLowerCase(),
    token,
    accountId: String(auth?.accountId || auth?.accountID || ''),
    expiresAt: expirationSecs > 0 ? expirationSecs * 1000 : Date.now() + 12 * 60 * 60_000,
    savedAt: Date.now(),
  };
  storage.setItem(sessionStorageKey(wallet), JSON.stringify(record));
  return record;
}

export function clearOndoSession(wallet, storage = typeof window !== 'undefined' ? window.localStorage : null) {
  if (!wallet || !storage) return;
  try { storage.removeItem(sessionStorageKey(wallet)); } catch { /* storage disabled */ }
}

export function normalizeOndoRegionAccess(payload) {
  const row = payload && typeof payload === 'object' ? payload : {};
  const unavailable = row.status === 'unavailable' || row.reason === 'geo_verification_unavailable';
  const blocked = !unavailable && (
    row.allowed === false || row.status === 'blocked' || row.code === 'ONDO_REGION_BLOCKED'
  );
  return {
    allowed: !blocked && !unavailable,
    status: unavailable ? 'unavailable' : blocked ? 'blocked' : 'allowed',
    country: /^[A-Z]{2}$/u.test(String(row.country || '').toUpperCase())
      ? String(row.country).toUpperCase()
      : null,
    regionCode: String(row.regionCode || '').trim() || null,
    reason: unavailable
      ? 'geo_verification_unavailable'
      : blocked ? String(row.reason || 'restricted_region') : null,
    message: unavailable
      ? String(row.message || 'Unable to verify whether Ondo Perps is available in your region. Please retry.')
      : blocked ? ONDO_REGION_BLOCKED_MESSAGE : null,
  };
}

export function ondoErrorMessage(error, fallback = 'Ondo request failed') {
  const message = String(error?.message || error?.error || fallback).trim();
  if (error?.code === 'ONDO_REGION_BLOCKED' || /ONDO_REGION_BLOCKED|country or IP region|HTTP 451/iu.test(message)) {
    return ONDO_REGION_BLOCKED_MESSAGE;
  }
  if (/auth_expired|session token|unauthorized|401/iu.test(message)) return 'Ondo session expired. Sign in again to continue.';
  if (/account_not_allowed|not allowed|restricted/iu.test(message)) return 'This wallet is not eligible to use Ondo Perps.';
  if (/trading_disabled/iu.test(message)) return 'This Ondo market is currently closed or trading is disabled.';
  return message || fallback;
}
