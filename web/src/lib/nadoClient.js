import BigNumber from 'bignumber.js';
import { createNadoClient } from '@nadohq/client';
import { getOrderNonce, packOrderAppendix } from '@nadohq/shared';
import {
  NADO_BUILDER_FEE_RATE,
  NADO_BUILDER_ID,
  NADO_CHAIN_ENV,
  NADO_SUBACCOUNT_NAME,
} from './nadoConfig';

export const NADO_PRODUCT_DECIMALS = 18;
const SCALE = new BigNumber(10).pow(NADO_PRODUCT_DECIMALS);
const NADO_PRODUCT_TYPE_PERP = 1;

function nadoBuilderAppendix() {
  const builderId = Math.floor(Number(NADO_BUILDER_ID));
  const builderFeeRate = Math.floor(Number(NADO_BUILDER_FEE_RATE));
  if (builderId <= 0) return undefined;
  if (builderId > 65535) throw new Error('Nado builder ID must fit into 16 bits');
  if (builderFeeRate < 0 || builderFeeRate > 1023) {
    throw new Error('Nado builder fee rate must be 0-1023 in 0.1 bps units');
  }
  return { builderId, builderFeeRate };
}

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

function formatUsdThreshold(value) {
  const n = Number(value);
  if (!Number.isFinite(n) || n <= 0) return '0';
  if (n < 1) return n.toFixed(4);
  if (n < 100) return n.toFixed(2);
  return n.toFixed(0);
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
      const lotSize = String(m?.lot_size ?? m?.size_increment ?? rawToDecimal(m?._nado?.sizeIncrementRaw || 0).toFixed());
      const minNotionalRawValue = m?._nado?.minNotionalRaw ?? m?.min_notional_raw ?? m?._nado?.minSizeRaw;
      const minNotionalRaw = minNotionalRawValue != null ? String(minNotionalRawValue) : '';
      const minNotionalFromRaw = minNotionalRaw ? rawToDecimal(minNotionalRaw).toNumber() : 0;
      const minNotionalInput = Number(m?.min_notional_usd);
      const explicitMinNotional = Number.isFinite(minNotionalFromRaw) && minNotionalFromRaw > 0
        ? minNotionalFromRaw
        : Number.isFinite(minNotionalInput) && minNotionalInput > 0
          ? minNotionalInput
          : 0;
      const suppliedMinBase = Number(m?.min_order_size);
      const minBase = explicitMinNotional > 0 && mark > 0
        ? explicitMinNotional / mark
        : Number.isFinite(suppliedMinBase) && suppliedMinBase > 0
          ? suppliedMinBase
          : 0;
      const minOrderSize = String(minBase || 0);
      const derivedMinNotional = mark > 0 && minBase > 0 ? minBase * mark : 0;
      const minNotionalUsd = explicitMinNotional > 0 ? explicitMinNotional : derivedMinNotional;
      return {
        symbol,
        base: symbol,
        pair: `${symbol}/USDT`,
        market_name: `${symbol}/USDT`,
        market_id: marketId,
        asset_id: marketId,
        pair_index: marketId,
        lot_size: lotSize,
        tick_size: String(m?.tick_size ?? m?.price_increment ?? 0.01),
        min_order_size: minOrderSize,
        min_notional_usd: minNotionalUsd,
        max_leverage: Number(m?.max_leverage ?? 25),
        mark,
        mid: finiteNumber(m?.mid, mark),
        oracle: finiteNumber(m?.oracle, mark),
        volume_24h: Number(m?.volume_24h ?? 0),
        open_interest: Number(m?.open_interest ?? 0),
        funding_rate: Number(m?.funding_rate ?? 0),
        _nado: {
          productId: marketId,
          sizeIncrementRaw: String(m?._nado?.sizeIncrementRaw ?? bn(lotSize || 0).times(SCALE).toFixed(0)),
          minNotionalRaw: minNotionalRaw || bn(minNotionalUsd || 0).times(SCALE).toFixed(0),
          minSizeRaw: String(m?._nado?.minSizeRaw ?? bn(minOrderSize || 0).times(SCALE).toFixed(0)),
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

function nadoMaxLeverage(symbol) {
  const longWeight = finiteNumber(symbol?.longWeightInitial, 0);
  const shortWeight = finiteNumber(symbol?.shortWeightInitial, 0);
  const values = [];
  if (longWeight > 0 && longWeight < 1) values.push(1 / (1 - longWeight));
  if (shortWeight > 1) values.push(1 / (shortWeight - 1));
  const leverage = values.length ? Math.min(...values) : 25;
  return Math.max(1, Math.min(100, Math.floor(leverage + 1e-6)));
}

export async function fetchNadoMarketsDirect(publicClient) {
  if (!publicClient) throw new Error('Nado public client is not ready');
  const client = createNadoClient(NADO_CHAIN_ENV, { publicClient });
  const symbolsPayload = await client.context.engineClient.getSymbols({});
  const allMarkets = await client.market.getAllMarkets().catch(() => []);
  const rawSymbols = Object.values(symbolsPayload?.symbols || {})
    .filter(symbol => Number(symbol?.type) === NADO_PRODUCT_TYPE_PERP && !symbol?.isolatedOnly);
  const productIds = rawSymbols.map(symbol => Number(symbol.productId)).filter(Number.isFinite);
  const pricesPayload = productIds.length
    ? await client.market.getLatestMarketPrices({ productIds }).catch(() => ({ marketPrices: [] }))
    : { marketPrices: [] };
  const priceByProduct = new Map((pricesPayload?.marketPrices || []).map(price => [Number(price.productId), price]));
  const productById = new Map((allMarkets || []).map(market => [
    Number(market.productId ?? market?.product?.productId),
    market,
  ]));

  const rows = rawSymbols.map((symbol) => {
    const productId = Number(symbol.productId);
    const price = priceByProduct.get(productId) || {};
    const product = productById.get(productId)?.product || productById.get(productId) || {};
    const bid = finiteNumber(price.bid);
    const ask = finiteNumber(price.ask);
    const mark = bid > 0 && ask > 0 ? (bid + ask) / 2 : finiteNumber(product.oraclePrice);
    const base = normalizeNadoSymbol(symbol.symbol);
    const minNotional = rawToDecimal(symbol.minSize || 0);
    const minBaseSize = mark > 0 ? minNotional.div(mark) : new BigNumber(0);
    return {
      symbol: base,
      base,
      pair: `${base}/USDT`,
      market_name: `${base}/USDT`,
      market_id: productId,
      asset_id: productId,
      pair_index: productId,
      lot_size: rawToDecimal(symbol.sizeIncrement || 0).toFixed(),
      tick_size: String(symbol.priceIncrement || 0.01),
      min_order_size: minBaseSize.toFixed(),
      min_notional_usd: minNotional.toFixed(),
      max_leverage: nadoMaxLeverage(symbol),
      mark,
      mid: mark,
      oracle: finiteNumber(product.oraclePrice, mark),
      bid: bid || mark,
      ask: ask || mark,
      volume_24h: 0,
      open_interest: rawToDecimal(product.openInterest || 0).toFixed(),
      funding_rate: 0,
      isolated_only: !!symbol.isolatedOnly,
      _nado: {
        productId,
        symbol: symbol.symbol,
        sizeIncrementRaw: String(symbol.sizeIncrement || '0'),
        minNotionalRaw: String(symbol.minSize || '0'),
        minSizeRaw: String(symbol.minSize || '0'),
        raw: symbol,
      },
      _raw: symbol,
    };
  }).filter(row => row.symbol && Number.isFinite(row.market_id));

  return normalizeNadoMarkets(rows);
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
  const baseSize = Number(amountBase) > 0 ? bn(amountBase) : notional.div(mark);
  const rawSize = roundRawToStep(baseSize.times(SCALE), market?._nado?.sizeIncrementRaw || bn(market.lot_size || 0).times(SCALE));
  if (!rawSize.isFinite() || rawSize.lte(0)) throw new Error('Enter a positive order size');
  if (!reduceOnly) {
    const minNotionalRaw = market?._nado?.minNotionalRaw;
    const minNotionalFromRaw = minNotionalRaw != null ? rawToDecimal(minNotionalRaw).toNumber() : 0;
    const minNotional = Number.isFinite(minNotionalFromRaw) && minNotionalFromRaw > 0
      ? minNotionalFromRaw
      : Number(market.min_notional_usd ?? 0);
    const roundedNotional = rawSize.abs().div(SCALE).times(mark);
    if (Number.isFinite(minNotional) && minNotional > 0 && roundedNotional.lt(minNotional)) {
      throw new Error(
        `Nado minimum order size is $${formatUsdThreshold(minNotional)} notional `
        + `(yours is $${formatUsdThreshold(roundedNotional.toNumber())} after lot rounding)`,
      );
    }
  }

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
      subaccountName: NADO_SUBACCOUNT_NAME,
      expiration: String(Math.floor(Date.now() / 1000) + (expirationSeconds || (isLimit ? 7 * 24 * 60 * 60 : 5 * 60))),
      price: roundedPrice,
      amount: signedAmount,
      nonce: getOrderNonce(),
      appendix: packOrderAppendix({
        orderExecutionType: isLimit ? 'default' : 'ioc',
        reduceOnly: !!reduceOnly,
        triggerType,
        builder: nadoBuilderAppendix(),
      }),
    },
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
  };
}
