function finiteNumber(value) {
  const number = Number(value);
  return Number.isFinite(number) ? number : null;
}

function normalizeMarketIdentifier(value) {
  return String(value || '')
    .trim()
    .toUpperCase()
    .replace(/[^A-Z0-9]/gu, '');
}

function normalizeAptosAddress(value) {
  const raw = String(value || '').trim().toLowerCase();
  if (!raw) return '';
  const hex = raw.startsWith('0x') ? raw.slice(2) : raw;
  if (!/^[0-9a-f]+$/u.test(hex)) return '';
  return `0x${hex.padStart(64, '0')}`;
}

function findMarket(markets, identifier) {
  const address = normalizeAptosAddress(identifier);
  const name = normalizeMarketIdentifier(identifier);
  return (Array.isArray(markets) ? markets : []).find((market) => {
    if (address && normalizeAptosAddress(market?.market_addr) === address) return true;
    if (!name) return false;
    return [market?.market_name, market?.pair, market?.symbol]
      .some(value => normalizeMarketIdentifier(value) === name);
  }) || null;
}

function findContext(contexts, market) {
  if (!market) return null;
  const address = normalizeAptosAddress(market.market_addr);
  const names = new Set([
    market.market_name,
    market.pair,
    market.symbol,
  ].map(normalizeMarketIdentifier).filter(Boolean));

  return (Array.isArray(contexts) ? contexts : []).find((context) => {
    const identifier = context?.market ?? context?.market_addr ?? context?.market_name;
    const contextAddress = normalizeAptosAddress(identifier);
    if (address && contextAddress && address === contextAddress) return true;
    return names.has(normalizeMarketIdentifier(identifier));
  }) || null;
}

function signedFundingRate(price) {
  const direct = finiteNumber(price?.funding_rate ?? price?.fundingRate);
  if (direct != null) return direct;

  const bps = finiteNumber(price?.funding_rate_bps ?? price?.fundingRateBps);
  if (bps == null) return 0;
  const sign = price?.is_funding_positive === false
    ? -1
    : price?.is_funding_positive === true
      ? 1
      : (bps < 0 ? -1 : 1);
  return sign * Math.abs(bps) / 10_000;
}

// Decibel splits its public market header across two endpoints:
//   /prices         -> mark/oracle/funding/open interest
//   /asset_contexts -> 24h volume/change/previous-day price
// Keep the merge in one pure normalizer so schema changes are covered by a
// focused test instead of being silently dropped by the React hook.
export function normalizeDecibelMarketData(price = {}, markets = [], contexts = []) {
  const priceIdentifier = price.market ?? price.market_addr ?? price.marketAddr
    ?? price.market_name ?? price.marketName;
  const market = findMarket(markets, priceIdentifier);
  const context = findContext(contexts, market);
  const fallbackName = price.market_name ?? price.marketName ?? context?.market ?? '';
  const symbol = market?.symbol
    || String(fallbackName).split(/[-/]/u)[0].toUpperCase();

  const mark = finiteNumber(
    price.mark_px ?? price.markPrice ?? price.mark_price
      ?? context?.mark_price ?? price.mid_px ?? context?.mid_price
      ?? price.oracle_px ?? context?.oracle_price ?? price.price,
  ) ?? 0;
  const mid = finiteNumber(price.mid_px ?? price.midPrice ?? context?.mid_price) ?? mark;
  const oracle = finiteNumber(
    price.oracle_px ?? price.oraclePrice ?? price.oracle_price ?? context?.oracle_price,
  ) ?? mark;
  const previousDay = finiteNumber(
    price.yesterday_px ?? price.yesterdayPrice ?? price.yesterday_price
      ?? price.openPrice24h ?? price.open_price_24h
      ?? context?.previous_day_price,
  ) ?? 0;
  const explicitChange = finiteNumber(
    price.price_change_pct_24h ?? price.priceChangePct24h
      ?? context?.price_change_pct_24h,
  );
  const change24h = explicitChange != null
    ? explicitChange
    : (mark > 0 && previousDay > 0 ? ((mark - previousDay) / previousDay) * 100 : 0);
  const volume24h = finiteNumber(
    price.volume_24h ?? price.volume24h ?? context?.volume_24h,
  ) ?? 0;
  // Decibel REST reports open_interest as quote notional (the API examples
  // use multi-million values for BTC), which is also what the trading header
  // labels in USD. Do not multiply it by mark price a second time.
  const openInterest = finiteNumber(
    price.open_interest ?? price.openInterest ?? context?.open_interest,
  ) ?? 0;
  const openInterestBase = finiteNumber(
    price.open_interest_base ?? price.openInterestBase
      ?? context?.open_interest_base ?? context?.openInterestBase,
  );
  const openInterestUsd = finiteNumber(
    price.open_interest_usd ?? price.openInterestUsd
      ?? context?.open_interest_usd ?? context?.openInterestUsd,
  ) ?? openInterest;
  const fundingRate = signedFundingRate(price);

  return {
    symbol,
    market_addr: market?.market_addr || priceIdentifier || null,
    market_name: market?.market_name || String(fallbackName || ''),
    mark: String(mark),
    mid: String(mid),
    oracle: String(oracle),
    yesterday_price: String(previousDay),
    price_change_pct_24h: change24h,
    volume_24h: volume24h,
    open_interest: openInterestUsd,
    open_interest_usd: openInterestUsd,
    open_interest_base: openInterestBase,
    funding_rate: String(fundingRate),
    funding_rate_bps: finiteNumber(price.funding_rate_bps ?? price.fundingRateBps) ?? 0,
    funding_period_s: finiteNumber(price.funding_period_s ?? price.fundingPeriodS),
    transaction_unix_ms: finiteNumber(price.transaction_unix_ms ?? price.transactionUnixMs),
    _raw: { ...(context || {}), ...price },
  };
}

export function mergeDecibelMarketStats(markets = [], prices = []) {
  const bySymbol = new Map(
    (Array.isArray(prices) ? prices : [])
      .filter(price => price?.symbol)
      .map(price => [price.symbol, price]),
  );
  return (Array.isArray(markets) ? markets : []).map((market) => {
    const price = bySymbol.get(market?.symbol);
    if (!price) return market;
    return {
      ...market,
      mark: price.mark,
      mid: price.mid,
      oracle: price.oracle,
      yesterday_price: price.yesterday_price,
      price_change_pct_24h: price.price_change_pct_24h,
      volume_24h: price.volume_24h,
      open_interest: price.open_interest,
      open_interest_usd: price.open_interest_usd,
      open_interest_base: price.open_interest_base,
      funding_rate: price.funding_rate,
      funding_rate_bps: price.funding_rate_bps,
      funding_period_s: price.funding_period_s,
    };
  });
}
