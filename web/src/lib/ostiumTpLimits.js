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
