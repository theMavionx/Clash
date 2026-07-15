import { OSTIUM_ORACLE_FEE_BUFFER_USD } from './ostiumConfig';

function finiteNumber(value, fallback = 0) {
  const n = Number(value);
  return Number.isFinite(n) ? n : fallback;
}

function historyMarket(markets, pairId) {
  return (Array.isArray(markets) ? markets : []).find(market =>
    String(market?.pair_index ?? market?.pairId ?? market?.pair_id ?? '') === String(pairId ?? '')
  ) || null;
}

function ostiumFillFee(fill) {
  if (fill?.fee != null && Number.isFinite(Number(fill.fee))) return Math.abs(Number(fill.fee));
  const fees = fill?.fees;
  if (!fees || typeof fees !== 'object') return 0;
  const action = String(fill?.action || fill?.orderAction || '').trim().toLowerCase();
  if (action === 'open') {
    return Math.max(0, finiteNumber(fees.opening, 0))
      + Math.max(0, finiteNumber(fees.builder, 0))
      + Math.max(0, finiteNumber(fees.oracle, OSTIUM_ORACLE_FEE_BUFFER_USD));
  }
  return Math.max(0, finiteNumber(fees.builder, 0));
}

export function normalizeOstiumTrade(fill, markets = []) {
  if (!fill || typeof fill !== 'object') return null;
  const market = historyMarket(markets, fill.pairId ?? fill.pair_id ?? fill.pair_index);
  const symbol = String(
    fill.pairFrom
    || fill.pair_from
    || fill.symbol
    || market?.symbol
    || '',
  ).trim().toUpperCase().replace(/-PERP$/u, '').replace(/\/USD[TC]?$/u, '');
  if (!symbol) return null;

  const action = String(fill.action || fill.orderAction || '').trim();
  const actionLower = action.toLowerCase();
  // Collateral adjustments are account events, not executed trades.
  if (actionLower === 'removecollateral') return null;
  const rawSide = String(fill.side || fill.position_side || fill.positionSide || '').trim().toLowerCase();
  const isShort = rawSide === 's' || rawSide === 'short' || rawSide === 'sell' || rawSide === 'ask';
  const isClose = actionLower !== 'open' && (
    actionLower === 'close'
    || actionLower === 'liquidation'
    || actionLower === 'stoploss'
    || actionLower === 'takeprofit'
    || actionLower === 'closedaytrade'
    || actionLower.includes('close')
  );
  const side = isClose
    ? (isShort ? 'close_short' : 'close_long')
    : (isShort ? 'open_short' : 'open_long');
  const timestamp = fill.timestamp ?? fill.time ?? fill.executedAt ?? fill.created_at;
  const orderId = fill.oid ?? fill.orderId ?? fill.order_id ?? fill.id ?? '';
  const txHash = fill.hash ?? fill.txHash ?? fill.transactionHash ?? '';

  return {
    ...fill,
    _dex: 'ostium',
    id: [txHash, orderId, action || side].filter(Boolean).join(':')
      || `ostium:${symbol}:${timestamp || ''}:${fill.px ?? fill.price ?? ''}`,
    symbol,
    side,
    action: action || side,
    amount: Math.abs(finiteNumber(fill.szi ?? fill.size ?? fill.amount ?? fill.qty, 0)),
    price: finiteNumber(fill.px ?? fill.price ?? fill.fillPrice ?? fill.openPrice, 0),
    fee: ostiumFillFee(fill),
    created_at: timestamp,
    realized_pnl_amount: finiteNumber(
      fill.netPnl
      ?? fill.net_pnl
      ?? fill.closedPnl
      ?? fill.realizedPnl
      ?? fill.realized_pnl
      ?? fill.pnl,
      0,
    ),
  };
}
