function numberOrNull(value) {
  const n = Number(value);
  return Number.isFinite(n) ? n : null;
}

export function ostiumMarketSymbol(market, fallback = '') {
  return String(
    market?.display_symbol
      || market?.symbol
      || market?.pair
      || market?.market_name
      || fallback
      || ''
  ).trim();
}

export function isOstiumMarketClosed(market) {
  if (!market || typeof market !== 'object') return false;
  const isMarketOpen = market.is_market_open ?? market.isMarketOpen;
  return isMarketOpen === false;
}

export function ostiumDayTradeLeverageLimit(market) {
  const n = numberOrNull(
    market?.overnight_max_leverage
      ?? market?.overnightMaxLeverage
      ?? market?.is_day_trade_required_above
      ?? market?.isDayTradeRequiredAbove
  );
  return n != null && n > 0 ? n : null;
}

export function isOstiumDayTradingClosed(market) {
  if (!market || typeof market !== 'object') return false;
  return (market.is_day_trading_closed ?? market.isDayTradingClosed) === true;
}

export function ostiumOpenTradeBlockReason(market, leverage = null) {
  if (!market || typeof market !== 'object') return '';
  if (isOstiumMarketClosed(market)) return 'market_closed';

  const dayLimit = ostiumDayTradeLeverageLimit(market);
  const lev = numberOrNull(leverage);
  if (dayLimit != null && lev != null && lev > dayLimit && isOstiumDayTradingClosed(market)) {
    return 'day_trading_closed';
  }
  return '';
}

export function formatOstiumMarketWait(seconds) {
  const s = numberOrNull(seconds);
  if (s == null || s <= 0) return '';
  if (s < 60) return 'Reopens in under 1 minute.';
  const minutesTotal = Math.ceil(s / 60);
  const days = Math.floor(minutesTotal / 1440);
  const hours = Math.floor((minutesTotal % 1440) / 60);
  const minutes = minutesTotal % 60;
  if (days > 0) {
    const h = hours > 0 ? ` ${hours}h` : '';
    return `Reopens in ${days}d${h}.`;
  }
  if (hours > 0) {
    const m = minutes > 0 ? ` ${minutes}m` : '';
    return `Reopens in ${hours}h${m}.`;
  }
  return `Reopens in ${minutes}m.`;
}

export function ostiumMarketScheduleText(market) {
  const seconds = market?.seconds_to_toggle_is_day_trading_closed
    ?? market?.secondsToToggleIsDayTradingClosed;
  const wait = formatOstiumMarketWait(seconds);
  if (wait) return wait;

  const schedule = market?.schedule && typeof market.schedule === 'object'
    ? market.schedule
    : null;
  const hours = Array.isArray(schedule?.openingHours) && schedule.openingHours.length
    ? String(schedule.openingHours[0])
    : '';
  if (hours) {
    const timezone = schedule?.timezone ? ` ${schedule.timezone}` : '';
    return `Trading hours: ${hours}${timezone}.`;
  }
  return 'Pick an open market to trade now.';
}

export function ostiumOpenTradeBlockMessage(market, symbol, leverage = null) {
  const reason = ostiumOpenTradeBlockReason(market, leverage);
  if (!reason) return '';
  const label = ostiumMarketSymbol(market, symbol) || 'This';
  if (reason === 'day_trading_closed') {
    const dayLimit = ostiumDayTradeLeverageLimit(market);
    const limitText = dayLimit != null ? ` Lower leverage to ${dayLimit}x or less,` : '';
    return `${label} day trading is closed at the selected leverage.${limitText} pick an open market, or wait.`;
  }
  return `${label} market is closed. ${ostiumMarketScheduleText(market)}`;
}
