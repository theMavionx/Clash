const number = value => value == null || value === '' || !Number.isFinite(Number(value)) ? null : Number(value);
export const imperialSymbol = value => String(value || '').toUpperCase().replace(/[-/](USD|USDC|PERP)$/i, '').replace(/PERP$/i, '');
export function imperialPosition(row) {
  const sizeUsd = number(row.sizeUsd ?? row.size_usd);
  const mark = number(row.markPrice ?? row.mark_price);
  const entry = number(row.entryPrice ?? row.entry_price);
  // Notional is entry-denominated. Dividing by a moving mark changes the
  // apparent token quantity of a position which has not traded.
  const amount = number(row.sizeTokenAmount ?? row.quantity) ?? (entry > 0 && sizeUsd != null ? sizeUsd / entry : 0);
  const cross = ['cross', 'unified'].includes(String(row.directVenue?.marginMode || '').toLowerCase());
  const triggers = row.tpslOrders || [];
  const trigger = kind => number(triggers.find(order => [kind, kind === 'take_profit' ? 'tp' : 'sl'].includes(String(order.orderType).toLowerCase().replace(/[- ]/g, '_')))?.triggerPriceUsd);
  return {
    ...row, dex: 'imperial', source: 'imperial', pnl_source: 'imperial_api',
    symbol: imperialSymbol(row.asset || row.symbol),
    side: String(row.side).toLowerCase() === 'short' || Number(row.side) === 1 ? 'ask' : 'bid',
    amount, size: amount, size_usd: sizeUsd,
    entry_price: number(row.entryPrice ?? row.entry_price), mark_price: mark,
    margin: number(cross ? row.directVenue?.positionInitialMarginUsd : row.collateralUsd),
    unrealized_pnl: number(row.pnlUsd), pnl_pct: number(row.pnlPercent),
    pnl_includes_fees: true,
    // A Phoenix cross seat has no individual leg liquidation price. Never invent one.
    liquidation_price: cross ? null : number(row.ourLiquidationPriceUsd ?? row.liquidationPrice),
    leverage: number(row.effectiveLeverageX ?? row.leverageX ?? row.baseLeverageX),
    is_isolated: !cross, margin_mode: cross ? 'cross' : 'isolated',
    trade_index: String(row.id ?? row.positionPda ?? row.position_pda),
    pair_index: ({jupiter:0,flash:1,flash_trade:1,phoenix:2,gmtrade:3,flash_v2:4,pairs:5,touch:6})[row.underwriter] ?? number(row.underwriter),
    take_profit: number(row.takeProfitPrice) ?? trigger('take_profit'), stop_loss: number(row.stopLossPrice) ?? trigger('stop_loss'),
    opened_at: row.openedAt == null ? null : Number(row.openedAt) * 1000,
  };
}

// Imperial's public position UI supplements lifecycle snapshots with a live
// execution-venue mark. Match its cash-capital basis, including partial exits.
// Keep API values as the fallback when the live mark or source fields are absent.
export function imperialLivePosition(position, priceRows, now = Date.now()) {
  const venue = ({flash_trade:'flash'})[position.underwriter] || position.underwriter;
  const market = priceRows.find(row => row.symbol === position.symbol);
  const fresh = row => row?.price > 0 && Number.isFinite(Number(row.fetchedAtUnixMs)) && now - Number(row.fetchedAtUnixMs) <= 60000 && Number(row.fetchedAtUnixMs) <= now + 5000;
  const venueQuote = market?.venues?.find(row => row.venue === venue);
  const indexQuote = {price:market?.oracle,fetchedAtUnixMs:market?.oracle_at};
  const indexFallback = !fresh(venueQuote) && ['phoenix','jupiter','flash','flash_v2','gmtrade'].includes(String(venue)) && fresh(indexQuote);
  const quote = indexFallback ? indexQuote : venueQuote;
  const timestamp = number(quote?.fetchedAtUnixMs ?? quote?.fetchedAt);
  const mark = number(quote?.price);
  const entry = number(position.entry_price), size = number(position.size_usd), collateral = number(position.collateralUsd);
  const feesOwed = number(position.feesOwed);
  if (!(mark > 0) || timestamp == null || now - timestamp > 60000 || timestamp > now + 5000
    || !(entry > 0) || !(size > 0) || collateral == null || feesOwed == null || !position.is_isolated) return position;
  const value = field => number(field) ?? 0;
  const actions = position.actions || [];
  const isEntry = action => ['increase','add_collateral','open'].includes(action.actionType);
  const actionFee = action => (isEntry(action)
    ? value(action.platformFee) + value(action.swapSlippage)
    : value(action.tx3PlatformFee) + value(action.tx3SweepSlippage))
    + value(action.jupiterFee) + value(action.interest);
  let deposits = 0, received = 0, paid = 0, realized = 0;
  for (const action of actions) {
    if (isEntry(action)) {
      deposits += value(action.collateralDeposited) || (Math.abs(value(action.collateralDelta)) + (action.actionType === 'increase' ? value(action.jupiterFee) : 0));
      paid += actionFee(action);
    }
    received += value(action.userReceived);
    if (['decrease','liquidation'].includes(action.actionType) && action.pnlRealized != null) {
      const pnl = value(action.pnlRealized);
      realized += (action.hasProfit === false ? -Math.abs(pnl) : action.hasProfit === true ? Math.abs(pnl) : pnl) - actionFee(action);
    }
  }
  if (!actions.length) paid = value(position.totalFeesUsd);
  if (value(position.maxSizeUsd) > 0) paid *= Math.min(1, size / value(position.maxSizeUsd));
  const boosted = value(position.ownedCollateralUsd) > 0 || value(position.borrowedCollateralUsd) > 0;
  const cap = boosted ? (venue === 'phoenix' ? collateral : value(position.ownedCollateralUsd)) : null;
  const grossCapital = deposits > 0 ? (cap > 0 ? Math.min(deposits, cap + received) : deposits) : collateral;
  const remainingCapital = deposits > received ? (cap > 0 ? Math.min(deposits - received, cap) : deposits - received) : null;
  const sizeMatches = Math.abs(actions.reduce((sum, action) => sum + value(action.sizeDelta), 0) - size) <= Math.max(1, size * .01);
  const useCapital = remainingCapital > 0 && sizeMatches && !['flash','flash_v2','1','4'].includes(String(venue));
  const pricePnl = size * (mark - entry) / entry * (position.side === 'bid' ? 1 : -1);
  const pnl = useCapital ? collateral + pricePnl - feesOwed - remainingCapital : pricePnl - paid - feesOwed + realized;
  return {...position, mark_price:mark, unrealized_pnl:pnl, pnl_pct:grossCapital > 0 ? pnl / grossCapital * 100 : 0,
    pnl_source:'imperial_live', pnl_includes_fees:true, live_mark_at:timestamp, live_mark_basis:indexFallback ? 'index' : 'venue'};
}

export function imperialMarketUpdate(rows, message, now = Date.now()) {
  const symbol=imperialSymbol(message.symbol), price=number(message.price);
  const at=number(message.fetched_at_unix_ms ?? message.fetchedAtUnixMs);
  if (!(price>0) || at==null || now-at>60000 || at>now+5000 || !symbol) return rows;
  const old=rows.find(row=>row.symbol===symbol)||{symbol,venues:[]};
  const previousAt=message.venue==='index' ? old.oracle_at : old.venues?.find(row=>row.venue===message.venue)?.fetchedAtUnixMs;
  if (previousAt != null && Number(previousAt)>at) return rows;
  const next=message.venue==='index' ? {...old,price,mark_price:price,oracle:price,oracle_at:at,oracle_source:message.source}
    : {...old,venues:[...(old.venues||[]).filter(row=>row.venue!==message.venue),{venue:message.venue,price,fetchedAtUnixMs:at,source:message.source}]};
  return [...rows.filter(row=>row.symbol!==symbol),next];
}

export function imperialCloseBps(positions, id, amount, fullClose) {
  if (fullClose) return 10000;
  const position = positions.find(row => String(row.trade_index) === String(id));
  const total = Math.abs(Number(position?.amount));
  const requested = Number(amount);
  if (!(total > 0) || !(requested > 0) || requested > total * 1.000001) throw new Error('Refresh the Imperial position before selecting a partial close.');
  return Math.max(1, Math.min(10000, Math.round(requested / total * 10000)));
}

export function imperialTradeRows(lifecycles) {
  return (lifecycles || []).flatMap(lifecycle => (lifecycle.actions || []).flatMap(action => {
    const size = Math.abs(number(action.sizeDelta) ?? 0);
    if (!action.tx2Signature || !size || !/^(converted|settled|executed|filled|confirmed|success|completed)$/i.test(action.status || '')) return [];
    const close = /decrease|close|liquidat/i.test(action.actionType || '');
    const side = `${close ? 'close' : 'open'}_${String(lifecycle.side).toLowerCase() === 'short' ? 'short' : 'long'}`;
    const price = number(action.entryPrice);
    return [{id:action.id || action.tx2Signature,symbol:imperialSymbol(lifecycle.asset),side,action:side,
      amount:Math.abs(number(action.sizeDeltaTokens) ?? (price > 0 ? size / price : 0)),price,
      notional_usd:size,fee:number(action.jupiterFee ?? action.platformFee),
      created_at:Number(action.tx2Timestamp ?? lifecycle.lastActionAt) * 1000,
      realized_pnl_amount:close ? number(action.pnlRealized) : null,
      signature:action.tx2Signature,profile_index:lifecycle.profileIndex,underwriter:lifecycle.underwriter}];
  }));
}

export function imperialFundingRows(events) {
  return (events || []).map(row => ({...row,_dex:'imperial',symbol:imperialSymbol(row.symbol),
    // FundingEventResponse.amount is signed MICRO-USD, positive means paid.
    // Its per-second scaled rate is not comparable to this shared period-rate
    // column; neither is USD notional a token quantity. Keep those unknown.
    payout: -(number(row.amount) ?? 0) / 1e6, rate:null, amount:null,
    fee:0,created_at:Number(row.eventAt) * 1000}));
}
