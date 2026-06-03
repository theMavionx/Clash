import { ExchangeClient, HttpTransport, InfoClient, signAction } from '@hotstuff-labs/ts-sdk';
import {
  HOTSTUFF_API_BASE,
  HOTSTUFF_BROKER_ADDRESS,
  HOTSTUFF_BROKER_FEE_RATE,
  HOTSTUFF_CLOID_PREFIX,
} from './hotstuffConfig';

const DEFAULT_TIMEOUT_MS = 12_000;
const HOTSTUFF_OP_CODES = {
  updateMarginMode: 1205,
  updateIsolatedMargin: 1204,
};

function firstHotstuffStatus(response) {
  const status = response?.data?.status;
  return Array.isArray(status) ? status[0] : null;
}

export function hotstuffExchangeError(response) {
  const topLevel = String(response?.error || '').trim();
  if (topLevel) return topLevel;
  const status = firstHotstuffStatus(response);
  const nested = status?.error?.error || status?.error?.message || status?.error;
  if (nested) return typeof nested === 'string' ? nested : JSON.stringify(nested);
  return '';
}

export function assertHotstuffExchangeSuccess(response, fallback = 'Hotstuff request failed') {
  const error = hotstuffExchangeError(response);
  if (error) throw new Error(error);
  return response;
}

export function hotstuffOrderAccepted(response) {
  const statuses = response?.data?.status;
  if (!Array.isArray(statuses) || !statuses.length) return !!response?.tx_hash;
  return statuses.every(status => !!(status?.filled || status?.resting || status?.triggered));
}

export function hotstuffOrderStatusLabel(response) {
  const status = firstHotstuffStatus(response);
  if (!status) return response?.tx_hash ? 'submitted' : 'unknown';
  if (status.filled) return 'filled';
  if (status.resting) return 'resting';
  if (status.triggered) return 'triggered';
  if (status.error) return 'error';
  return 'unknown';
}

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

async function executeHotstuffAction(client, action, params, txType) {
  const nonce = params.nonce ?? Date.now();
  const data = { ...params, nonce };
  const signature = await signAction({
    wallet: client.wallet,
    action: data,
    txType,
  }, {
    isTestnet: client.transport?.isTestnet ?? false,
  });
  return client.transport.request('exchange', {
    action: {
      data,
      type: String(txType),
    },
    signature,
    nonce,
  }).then(response => assertHotstuffExchangeSuccess(response));
}

export function createHotstuffInfoClient() {
  return new InfoClient({ transport: transport() });
}

export function createHotstuffExchangeClient(wallet) {
  const client = new ExchangeClient({ transport: transport(), wallet });
  const wrap = (methodName) => {
    if (typeof client[methodName] !== 'function') return;
    const original = client[methodName].bind(client);
    client[methodName] = (...args) => original(...args).then(response => assertHotstuffExchangeSuccess(response));
  };
  [
    'addAgent',
    'revokeAgent',
    'updatePerpInstrumentLeverage',
    'approveBrokerFee',
    'createReferralCode',
    'setReferrer',
    'claimReferralRewards',
    'placeOrder',
    'cancelByOid',
    'cancelByCloid',
    'cancelByInstrument',
    'cancelAll',
    'accountSpotWithdrawRequest',
    'accountDerivativeWithdrawRequest',
    'accountSpotBalanceTransferRequest',
    'accountDerivativeBalanceTransferRequest',
    'accountInternalBalanceTransferRequest',
  ].forEach(wrap);
  if (typeof client.updateMarginMode !== 'function') {
    client.updateMarginMode = (params) => executeHotstuffAction(
      client,
      'updateMarginMode',
      params,
      HOTSTUFF_OP_CODES.updateMarginMode,
    );
  }
  if (typeof client.updateIsolatedMargin !== 'function') {
    client.updateIsolatedMargin = (params) => executeHotstuffAction(
      client,
      'updateIsolatedMargin',
      params,
      HOTSTUFF_OP_CODES.updateIsolatedMargin,
    );
  }
  return client;
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

export function formatHotstuffTriggerPrice(value, market) {
  const n = Number(value);
  if (!Number.isFinite(n) || n <= 0) return '0';
  const tick = Number(market?.tick_size || 0.01);
  if (!Number.isFinite(tick) || tick <= 0) return trimZeros(n.toFixed(4));
  const rounded = Math.round(n / tick) * tick;
  const decimals = Math.min(8, Math.max(0, String(tick).split('.')[1]?.length || 0));
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
  const minNotional = Number(market?._hotstuff?.raw?.min_notional_usd ?? market?.min_notional_usd ?? market?.min_order_size ?? 0);
  if (Number.isFinite(minNotional) && minNotional > 0 && notional + 1e-9 < minNotional) {
    throw new Error(`Hotstuff minimum position size for ${market.symbol || market.market_name || 'this market'} is $${minNotional}.`);
  }
  const baseSize = Number(amountBase) > 0 ? Number(amountBase) : notional / mark;
  const isLimit = String(orderType || '').toLowerCase() === 'limit';
  const size = formatHotstuffSize(baseSize, market);
  if (!(Number(size) > 0)) throw new Error('Hotstuff order size is too small for this market.');
  const roundedNotional = Number(size) * mark;
  if (Number.isFinite(minNotional) && minNotional > 0 && roundedNotional + 1e-9 < minNotional) {
    throw new Error(
      `Hotstuff minimum position size for ${market.symbol || market.market_name || 'this market'} is $${minNotional}. Increase margin or leverage.`,
    );
  }
  return {
    instrumentId: Number(market._hotstuff?.instrumentId ?? market.pair_index),
    side: /short|sell|ask/i.test(String(side)) ? 's' : 'b',
    positionSide: 'BOTH',
    price: formatHotstuffPrice(mark, market, { marketOrder: !isLimit, side }),
    size,
    tif: isLimit ? 'GTC' : 'IOC',
    ro: !!reduceOnly,
    po: false,
    cloid: makeHotstuffCloid(),
    triggerPx: '',
    isMarket: !isLimit,
    tpsl: '',
    grouping: '',
  };
}

export function buildHotstuffTpslOrder({ market, closeSide, triggerPrice, size, kind }) {
  if (!market?._hotstuff?.instrumentId && !market?.pair_index) throw new Error('Select a valid Hotstuff market');
  const normalizedKind = String(kind || '').toLowerCase();
  if (normalizedKind !== 'tp' && normalizedKind !== 'sl') throw new Error('Hotstuff TP/SL kind must be tp or sl');
  const trigger = Number(triggerPrice);
  if (!Number.isFinite(trigger) || trigger <= 0) throw new Error('Enter a valid TP/SL trigger price');
  const side = /short|sell|ask/i.test(String(closeSide)) ? 's' : 'b';
  return {
    instrumentId: Number(market._hotstuff?.instrumentId ?? market.pair_index),
    side,
    positionSide: 'BOTH',
    price: formatHotstuffPrice(trigger, market, { marketOrder: true, side }),
    size: formatHotstuffSize(size, market),
    tif: 'IOC',
    ro: true,
    po: false,
    cloid: makeHotstuffCloid(),
    triggerPx: formatHotstuffTriggerPrice(trigger, market),
    isMarket: true,
    tpsl: normalizedKind,
    grouping: 'position',
  };
}

export function hotstuffErrorMessage(error, fallback = 'Hotstuff request failed') {
  const text = String(error?.shortMessage || error?.details || error?.message || error || fallback);
  if (/user rejected|denied|cancel/i.test(text)) return 'Signature cancelled';
  if (/broker|fee/i.test(text)) return text.slice(0, 260);
  if (/margin|balance|collateral/i.test(text)) return text.slice(0, 260);
  return text.slice(0, 260);
}
