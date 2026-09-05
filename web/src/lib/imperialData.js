const number = value => value == null || value === '' || !Number.isFinite(Number(value)) ? null : Number(value);
export const imperialSymbol = value => String(value || '').toUpperCase().replace(/[-/](USD|USDC|PERP)$/i, '').replace(/PERP$/i, '');
export function imperialPosition(row) {
  const sizeUsd = number(row.sizeUsd ?? row.size_usd);
  const mark = number(row.markPrice ?? row.mark_price);
  const amount = number(row.sizeTokenAmount ?? row.quantity) ?? (mark > 0 && sizeUsd != null ? sizeUsd / mark : 0);
  const cross = ['cross', 'unified'].includes(String(row.directVenue?.marginMode || '').toLowerCase());
  const triggers = row.tpslOrders || [];
  const trigger = kind => number(triggers.find(order => String(order.orderType).toLowerCase().replace(/[- ]/g, '_') === kind)?.triggerPriceUsd);
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
    if (!action.tx2Signature || !size || !/^(converted|settled|executed|filled|confirmed|success)$/i.test(action.status || '')) return [];
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
