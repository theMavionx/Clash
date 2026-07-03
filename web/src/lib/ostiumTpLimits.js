export const OSTIUM_MAX_TAKE_PROFIT_PCT = 900;

function finiteNumber(value) {
  const n = Number(value);
  return Number.isFinite(n) ? n : null;
}

function firstFinite(...values) {
  for (const value of values) {
    const n = finiteNumber(value);
    if (n != null) return n;
  }
  return null;
}

function normalizeScaledLeverage(value) {
  const n = finiteNumber(value);
  if (n == null || n <= 0) return null;
  if (n > 10_000) {
    for (const scale of [1e10, 1e18]) {
      const scaled = n / scale;
      if (Number.isFinite(scaled) && scaled > 0 && scaled <= 500) return scaled;
    }
  }
  return n;
}

export function ostiumPositionOpenSide(position = {}) {
  const raw = position?._raw?.position || position?._raw || {};
  if (typeof position?.buy === 'boolean') return position.buy ? 'bid' : 'ask';
  if (typeof raw?.buy === 'boolean') return raw.buy ? 'bid' : 'ask';

  const sign = firstFinite(position?.sign, position?.position_sign, position?.side_sign, raw?.sign, raw?.position_sign, raw?.sideSign);
  if (sign != null && sign < 0) return 'ask';
  if (sign != null && sign > 0) return 'bid';

  const side = String(
    position?.side
    ?? position?.d
    ?? position?.position_side
    ?? position?.direction
    ?? raw?.side
    ?? raw?.d
    ?? raw?.position_side
    ?? raw?.direction
    ?? '',
  ).trim().toLowerCase();
  if (['ask', 'sell', 'short', 'false'].includes(side)) return 'ask';
  if (['bid', 'buy', 'long', 'true'].includes(side)) return 'bid';

  const amount = firstFinite(position?.amount, position?.position, position?.size, position?.base_amount, raw?.szi, raw?.size);
  if (amount != null && amount < 0) return 'ask';
  return 'bid';
}

export function ostiumPositionEntryPrice(position = {}) {
  const raw = position?._raw?.position || position?._raw || {};
  return firstFinite(
    position?.entry_price,
    position?.entryPrice,
    position?.open_price,
    position?.openPrice,
    position?.price,
    raw?.entryPx,
    raw?.entryPrice,
    raw?.openPx,
    raw?.openPrice,
    raw?.price,
  );
}

export function ostiumPositionTriggerReferencePrice(position = {}) {
  const raw = position?._raw?.position || position?._raw || {};
  return firstFinite(
    position?.mark_price,
    position?.markPrice,
    position?.current_price,
    position?.currentPrice,
    position?.index_price,
    position?.indexPrice,
    position?.mid_price,
    position?.midPrice,
    position?.price,
    raw?.mark,
    raw?.markPx,
    raw?.markPrice,
    raw?.currentPx,
    raw?.currentPrice,
    raw?.indexPx,
    raw?.midPx,
    raw?.price,
    ostiumPositionEntryPrice(position),
  );
}

export function ostiumPositionLiquidationPrice(position = {}) {
  const raw = position?._raw?.position || position?._raw || {};
  return firstFinite(
    position?.liquidation_price,
    position?.liquidationPrice,
    position?.liq_price,
    position?.liqPrice,
    position?.liquidation,
    raw?.liquidationPx,
    raw?.liquidationPrice,
    raw?.liqPx,
    raw?.liqPrice,
  );
}

export function ostiumPositionLeverage(position = {}) {
  const raw = position?._raw?.position || position?._raw || {};
  const direct = normalizeScaledLeverage(firstFinite(
    position?.leverage,
    position?.lev,
    raw?.leverage,
    raw?.lev,
  ));
  if (direct != null) return direct;

  const sizeUsd = firstFinite(position?.size_usd, position?.sizeUsd, position?.notional_usd, position?.notional, raw?.ntl, raw?.notional, raw?.sizeUsd);
  const margin = firstFinite(position?.margin, position?.collateral, position?.collateralUsed, raw?.collateral, raw?.collateralUsed);
  return sizeUsd != null && sizeUsd > 0 && margin != null && margin > 0 ? sizeUsd / margin : null;
}

export function ostiumTakeProfitPnlPct(position = {}, takeProfit) {
  const tp = finiteNumber(takeProfit);
  if (tp == null || tp <= 0) return null;

  const entry = ostiumPositionEntryPrice(position);
  const leverage = ostiumPositionLeverage(position);
  if (entry == null || entry <= 0 || leverage == null || leverage <= 0) return null;

  const isLong = ostiumPositionOpenSide(position) !== 'ask';
  const priceMovePct = isLong
    ? ((tp - entry) / entry) * 100
    : ((entry - tp) / entry) * 100;
  return priceMovePct > 0 ? priceMovePct * leverage : 0;
}

export function ostiumMaxTakeProfitPrice(position = {}, maxPct = OSTIUM_MAX_TAKE_PROFIT_PCT) {
  const entry = ostiumPositionEntryPrice(position);
  const leverage = ostiumPositionLeverage(position);
  if (entry == null || entry <= 0 || leverage == null || leverage <= 0) return null;
  const move = Number(maxPct) / (100 * leverage);
  if (!Number.isFinite(move) || move < 0) return null;
  return ostiumPositionOpenSide(position) === 'ask'
    ? Math.max(0, entry * (1 - move))
    : entry * (1 + move);
}

function formatPrice(value) {
  if (!Number.isFinite(value)) return String(value);
  return value.toFixed(value >= 1 ? 2 : 8);
}

export function validateOstiumTakeProfitDirection(position = {}, takeProfit) {
  if (takeProfit == null || takeProfit === '') return { ok: true };
  const tp = finiteNumber(takeProfit);
  if (tp == null || tp <= 0) return { ok: true };

  const reference = ostiumPositionTriggerReferencePrice(position);
  if (reference == null || reference <= 0) {
    return {
      ok: false,
      error: 'Refresh Ostium positions before setting TP. Clash needs current price to prevent invalid TP.',
    };
  }

  const isLong = ostiumPositionOpenSide(position) !== 'ask';
  const badTp = isLong ? tp <= reference : tp >= reference;
  if (badTp) {
    return {
      ok: false,
      reference,
      takeProfit: tp,
      error: `TP for ${isLong ? 'LONG' : 'SHORT'} must be ${isLong ? 'above' : 'below'} current price ($${formatPrice(reference)}).`,
    };
  }
  return { ok: true, reference, takeProfit: tp };
}

export function validateOstiumStopLossDirection(position = {}, stopLoss) {
  if (stopLoss == null || stopLoss === '') return { ok: true };
  const sl = finiteNumber(stopLoss);
  if (sl == null || sl <= 0) return { ok: true };

  const reference = ostiumPositionTriggerReferencePrice(position);
  if (reference == null || reference <= 0) {
    return {
      ok: false,
      error: 'Refresh Ostium positions before setting SL. Clash needs current price to prevent invalid SL.',
    };
  }

  const isLong = ostiumPositionOpenSide(position) !== 'ask';
  const liquidation = ostiumPositionLiquidationPrice(position);
  const hasLiquidation = liquidation != null && liquidation > 0;
  const badSl = isLong
    ? sl >= reference || (hasLiquidation && sl <= liquidation)
    : sl <= reference || (hasLiquidation && sl >= liquidation);
  if (badSl) {
    const currentLabel = `$${formatPrice(reference)}`;
    const liquidationLabel = hasLiquidation ? `$${formatPrice(liquidation)}` : 'the liquidation price';
    return {
      ok: false,
      reference,
      liquidation,
      stopLoss: sl,
      error: isLong
        ? `SL should be above liquidation price and below current price. Liq: ${liquidationLabel}, current: ${currentLabel}.`
        : `SL should be below liquidation price and above current price. Liq: ${liquidationLabel}, current: ${currentLabel}.`,
    };
  }
  return { ok: true, reference, liquidation, stopLoss: sl };
}

export function validateOstiumTakeProfitLimit(position = {}, takeProfit, maxPct = OSTIUM_MAX_TAKE_PROFIT_PCT) {
  if (takeProfit == null || takeProfit === '') return { ok: true };
  const tp = finiteNumber(takeProfit);
  if (tp == null || tp <= 0) return { ok: true };

  const pnlPct = ostiumTakeProfitPnlPct(position, tp);
  const maxPrice = ostiumMaxTakeProfitPrice(position, maxPct);
  if (pnlPct == null || maxPrice == null) {
    return {
      ok: false,
      error: 'Refresh Ostium positions before setting TP. Clash needs entry price and leverage to enforce the 900% max TP.',
    };
  }
  if (pnlPct > Number(maxPct) + 1e-8) {
    const maxPriceLabel = maxPrice > 0 ? ` Max TP price for this position is ${maxPrice.toFixed(maxPrice >= 1 ? 2 : 8)}.` : '';
    return {
      ok: false,
      pnlPct,
      maxPrice,
      error: `Ostium max TP is ${maxPct}% profit. This TP is ${pnlPct.toFixed(2)}%.${maxPriceLabel}`,
    };
  }
  return { ok: true, pnlPct, maxPrice };
}
