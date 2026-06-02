import { ExchangeClient, HttpTransport, InfoClient } from '@hotstuff-labs/ts-sdk';
import {
  HOTSTUFF_API_BASE,
  HOTSTUFF_BROKER_ADDRESS,
  HOTSTUFF_BROKER_FEE_RATE,
  HOTSTUFF_CLOID_PREFIX,
} from './hotstuffConfig';

const DEFAULT_TIMEOUT_MS = 12_000;

export function isHotstuffAddress(addr) {
  return /^0x[0-9a-fA-F]{40}$/.test(String(addr || '').trim());
}

function transport() {
  return new HttpTransport({
    isTestnet: false,
    timeout: DEFAULT_TIMEOUT_MS,
    server: {
      mainnet: { api: `${HOTSTUFF_API_BASE}/`, rpc: `${HOTSTUFF_API_BASE}/` },
    },
  });
}

export function createHotstuffInfoClient() {
  return new InfoClient({ transport: transport() });
}

export function createHotstuffExchangeClient(wallet) {
  return new ExchangeClient({ transport: transport(), wallet });
}

export function hotstuffBrokerConfig() {
  if (!isHotstuffAddress(HOTSTUFF_BROKER_ADDRESS)) return null;
  const fee = Number(HOTSTUFF_BROKER_FEE_RATE);
  if (!Number.isFinite(fee) || fee <= 0) return null;
  return { broker: HOTSTUFF_BROKER_ADDRESS, fee: HOTSTUFF_BROKER_FEE_RATE };
}

export function makeHotstuffCloid() {
  return `${HOTSTUFF_CLOID_PREFIX}${Date.now()}-${Math.floor(Math.random() * 1_000_000)}`;
}

function trimZeros(value) {
  return String(value)
    .replace(/(\.\d*?)0+$/u, '$1')
    .replace(/\.$/u, '');
}

export function formatHotstuffSize(value, market) {
  const n = Number(value);
  if (!Number.isFinite(n) || n <= 0) return '0';
  const step = Number(market?.lot_size || 0.000001);
  if (!Number.isFinite(step) || step <= 0) return trimZeros(n.toFixed(6));
  const rounded = Math.max(step, Math.floor(n / step) * step);
  const decimals = Math.min(10, Math.max(0, String(step).split('.')[1]?.length || 0));
  return trimZeros(rounded.toFixed(decimals));
}

export function formatHotstuffPrice(value, market, { marketOrder = false, side = 'long' } = {}) {
  const n = Number(value);
  if (!Number.isFinite(n) || n <= 0) return '0';
  const tick = Number(market?.tick_size || 0.01);
  const aggressive = marketOrder
    ? n * (/short|sell|ask/i.test(String(side)) ? 0.985 : 1.015)
    : n;
  if (!Number.isFinite(tick) || tick <= 0) return trimZeros(aggressive.toFixed(4));
  const rounded = /short|sell|ask/i.test(String(side))
    ? Math.floor(aggressive / tick) * tick
    : Math.ceil(aggressive / tick) * tick;
  const decimals = Math.min(8, Math.max(0, String(tick).split('.')[1]?.length || 0));
  return trimZeros(rounded.toFixed(decimals));
}

export function buildHotstuffOrder({ market, side, amountUsd, amountBase, leverage = 1, price, orderType = 'market', reduceOnly = false }) {
  if (!market?._hotstuff?.instrumentId && !market?.pair_index) throw new Error('Select a valid Hotstuff market');
  const mark = Number(price || market.mark || market.mid || 0);
  if (!Number.isFinite(mark) || mark <= 0) throw new Error('Hotstuff market price is unavailable');
  const notional = Number(amountBase) > 0
    ? Number(amountBase) * mark
    : Number(amountUsd || 0) * Number(leverage || 1);
  const baseSize = Number(amountBase) > 0 ? Number(amountBase) : notional / mark;
  const isLimit = String(orderType || '').toLowerCase() === 'limit';
  return {
    instrumentId: Number(market._hotstuff?.instrumentId ?? market.pair_index),
    side: /short|sell|ask/i.test(String(side)) ? 's' : 'b',
    positionSide: 'BOTH',
    price: formatHotstuffPrice(mark, market, { marketOrder: !isLimit, side }),
    size: formatHotstuffSize(baseSize, market),
    tif: isLimit ? 'GTC' : 'IOC',
    ro: !!reduceOnly,
    po: false,
    cloid: makeHotstuffCloid(),
    triggerPx: '',
    isMarket: !isLimit,
    tpsl: '',
    grouping: 'normal',
  };
}

export function hotstuffErrorMessage(error, fallback = 'Hotstuff request failed') {
  const text = String(error?.shortMessage || error?.details || error?.message || error || fallback);
  if (/user rejected|denied|cancel/i.test(text)) return 'Signature cancelled';
  if (/broker|fee/i.test(text)) return text.slice(0, 260);
  if (/margin|balance|collateral/i.test(text)) return 'Insufficient Hotstuff margin. Deposit or reduce size.';
  return text.slice(0, 260);
}
