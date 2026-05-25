import BigNumber from 'bignumber.js';
import { getOrderNonce, packOrderAppendix } from '@nadohq/shared';

export const NADO_PRODUCT_DECIMALS = 18;
const SCALE = new BigNumber(10).pow(NADO_PRODUCT_DECIMALS);

export function isNadoAddress(addr) {
  return /^0x[0-9a-fA-F]{40}$/.test(String(addr || '').trim());
}

export function nadoErrorMessage(error, fallback = 'Nado request failed') {
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

function bn(value, fallback = 0) {
  try {
    const x = new BigNumber(value ?? fallback);
    return x.isFinite() ? x : new BigNumber(fallback);
  } catch {
    return new BigNumber(fallback);
  }
}

function rawToDecimal(value) {
  return bn(value).div(SCALE);
}

function finiteNumber(value, fallback = 0) {
  const n = Number(value);
  return Number.isFinite(n) ? n : fallback;
}

export function normalizeNadoSymbol(value) {
  return String(value || '')
    .trim()
    .toUpperCase()
    .replace(/-PERP$/u, '')
    .replace(/\/USDC$/u, '')
    .replace(/\/USDT$/u, '')
    .replace(/\/USD$/u, '');
}

export function normalizeNadoMarkets(rows = []) {
  return (Array.isArray(rows) ? rows : [])
    .map((m) => {
      const marketId = Number(m?.market_id ?? m?.productId ?? m?.id ?? m?._nado?.productId);
      const symbol = normalizeNadoSymbol(m?.symbol || m?.market_name || m?._nado?.symbol);
      const mark = finiteNumber(m?.mark ?? m?.mid ?? m?.oracle);
      return {
        symbol,
        base: symbol,
        pair: `${symbol}/USDT`,
        market_name: `${symbol}/USDT`,
        market_id: marketId,
        asset_id: marketId,
        pair_index: marketId,
        lot_size: String(m?.lot_size ?? m?.size_increment ?? rawToDecimal(m?._nado?.sizeIncrementRaw || 0).toFixed()),
        tick_size: String(m?.tick_size ?? m?.price_increment ?? 0.01),
        min_order_size: String(m?.min_order_size ?? m?.min_notional_usd ?? 100),
        min_notional_usd: Number(m?.min_notional_usd ?? m?.min_order_size ?? 100),
        max_leverage: Number(m?.max_leverage ?? 25),
        mark,
        mid: finiteNumber(m?.mid, mark),
        oracle: finiteNumber(m?.oracle, mark),
        volume_24h: Number(m?.volume_24h ?? 0),
        open_interest: Number(m?.open_interest ?? 0),
        funding_rate: Number(m?.funding_rate ?? 0),
        _nado: {
          productId: marketId,
          sizeIncrementRaw: String(m?._nado?.sizeIncrementRaw ?? bn(m?.lot_size || 0).times(SCALE).toFixed(0)),
          minSizeRaw: String(m?._nado?.minSizeRaw ?? bn(m?.min_order_size || 0).times(SCALE).toFixed(0)),
          raw: m?._nado?.raw || m,
        },
        _raw: m,
      };
    })
    .filter(m => m.symbol && Number.isFinite(m.market_id));
}

export function normalizeNadoPrices(markets = []) {
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

function roundRawToStep(rawValue, rawStep) {
  const raw = bn(rawValue);
  const step = bn(rawStep);
  if (!raw.isFinite() || raw.lte(0) || !step.isFinite() || step.lte(0)) return raw.integerValue(BigNumber.ROUND_DOWN);
  return raw.div(step).integerValue(BigNumber.ROUND_DOWN).times(step);
}

function roundPriceToTick(price, tick, isShort) {
  const p = bn(price);
  const t = bn(tick || 0.01);
  if (!p.isFinite() || p.lte(0) || !t.isFinite() || t.lte(0)) return p;
  const mode = isShort ? BigNumber.ROUND_DOWN : BigNumber.ROUND_UP;
  return p.div(t).integerValue(mode).times(t);
}

export function buildNadoOrderParams({
  market,
  side,
  amountUsd,
  amountBase,
  leverage = 1,
  price,
  orderType = 'market',
  reduceOnly = false,
  slippagePercent = 0.5,
  triggerType,
  expirationSeconds,
}) {
  if (!market) throw new Error('Select a valid Nado market');
  const productId = Number(market.market_id ?? market.pair_index ?? market?._nado?.productId);
  if (!Number.isFinite(productId)) throw new Error('Nado product id is missing');
  const mark = bn(price || market.mark || market.mid || market.oracle || 0);
  if (!mark.isFinite() || mark.lte(0)) throw new Error('Nado market price is unavailable');
  const lev = Math.max(1, Number(leverage || 1));
  const notional = Number(amountBase) > 0
    ? bn(amountBase).times(mark)
    : bn(amountUsd || 0).times(lev);
  const minNotional = Number(market.min_notional_usd ?? market.min_order_size ?? 0);
  if (!reduceOnly && Number.isFinite(minNotional) && minNotional > 0 && notional.lt(minNotional)) {
    throw new Error(`Nado minimum order size is $${minNotional.toFixed(0)} notional`);
  }
  const baseSize = Number(amountBase) > 0 ? bn(amountBase) : notional.div(mark);
  const rawSize = roundRawToStep(baseSize.times(SCALE), market?._nado?.sizeIncrementRaw || bn(market.lot_size || 0).times(SCALE));
  if (!rawSize.isFinite() || rawSize.lte(0)) throw new Error('Enter a positive order size');

  const sideText = String(side || '').toLowerCase();
  const isShort = sideText === 'ask' || sideText === 'short' || sideText === 'sell';
  const isLimit = String(orderType || '').toLowerCase() === 'limit';
  const slippage = Math.max(0, Number(slippagePercent) || 0) / 100;
  const executionPrice = isLimit
    ? mark
    : mark.times(isShort ? (1 - slippage) : (1 + slippage));
  const roundedPrice = roundPriceToTick(executionPrice, market.tick_size, isShort);
  const signedAmount = isShort ? rawSize.negated() : rawSize;

  return {
    productId,
    order: {
      subaccountName: 'default',
      expiration: String(Math.floor(Date.now() / 1000) + (expirationSeconds || (isLimit ? 7 * 24 * 60 * 60 : 5 * 60))),
      price: roundedPrice,
      amount: signedAmount,
      nonce: getOrderNonce(),
      appendix: packOrderAppendix({
        orderExecutionType: isLimit ? 'default' : 'ioc',
        reduceOnly: !!reduceOnly,
        triggerType,
      }),
    },
    spotLeverage: true,
  };
}

export function buildNadoTriggerOrderParams({
  market,
  side,
  amountBase,
  price,
  triggerPrice,
  triggerRequirementType,
}) {
  const params = buildNadoOrderParams({
    market,
    side,
    amountBase,
    price,
    orderType: 'limit',
    reduceOnly: true,
    triggerType: 'price',
    expirationSeconds: 30 * 24 * 60 * 60,
  });

  return {
    productId: params.productId,
    order: params.order,
    nonce: params.order.nonce,
    triggerCriteria: {
      type: 'price',
      criteria: {
        type: triggerRequirementType,
        triggerPrice: bn(triggerPrice),
      },
    },
    spotLeverage: true,
  };
}
