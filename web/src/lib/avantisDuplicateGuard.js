export const AVANTIS_DUPLICATE_ACTIVE_TTL_MS = 15 * 60 * 1000;
export const AVANTIS_DUPLICATE_CONFIRMED_TTL_MS = 90 * 1000;

const ACTIVE_ACTION_STATUSES = new Set([
  'started',
  'wallet_prompt',
  'signing',
  'confirming',
  'submitted',
]);
const RECENT_CONFIRMED_STATUSES = new Set(['confirmed', 'done']);

function finite(value) {
  const n = Number(value);
  return Number.isFinite(n) ? n : null;
}

function roundCents(value) {
  const n = finite(value);
  return n == null ? '' : String(Math.round(n * 100));
}

function roundTenths(value) {
  const n = finite(value);
  return n == null ? '' : String(Math.round(n * 10) / 10);
}

function cleanSymbol(value) {
  return String(value || '').trim().toUpperCase().replace(/[-_/ ]?(?:USD|USDC|PERP)$/i, '');
}

export function normalizeAvantisOrderSide(value) {
  const side = String(value || '').trim().toLowerCase();
  if (side === 'long' || side === 'buy' || side === 'bid') return 'long';
  if (side === 'short' || side === 'sell' || side === 'ask') return 'short';
  return side;
}

export function avantisPlaceOrderSignature(action) {
  if (!action || action.dex !== 'avantis' || action.type !== 'place_order') return '';
  const args = action.args || {};
  const symbol = cleanSymbol(args.symbol);
  const side = normalizeAvantisOrderSide(args.side);
  const orderType = String(args.order_type || 'market').trim().toLowerCase();
  const wallet = String(action.wallet || '').trim().toLowerCase();
  const chain = String(action.chain || 'base').trim().toLowerCase();
  if (!symbol || !side) return '';
  return [
    'avantis-place-order',
    chain,
    wallet,
    symbol,
    side,
    orderType,
    roundCents(args.collateral_usd),
    roundTenths(args.leverage || 1),
    orderType === 'limit' ? roundCents(args.price) : '',
  ].join('|');
}

export function describeAvantisPlaceOrder(action) {
  const args = action?.args || {};
  const side = normalizeAvantisOrderSide(args.side).toUpperCase() || 'LONG';
  const symbol = cleanSymbol(args.symbol) || 'MARKET';
  const orderType = String(args.order_type || 'market').toUpperCase();
  const collateral = finite(args.collateral_usd);
  const leverage = finite(args.leverage || 1);
  const collateralText = collateral == null ? '$0.00' : `$${collateral.toFixed(collateral >= 100 ? 0 : 2)}`;
  const leverageText = leverage == null ? '1x' : `${Number(leverage.toFixed(2)).toString()}x`;
  return `${side} ${symbol} ${orderType}, ${collateralText} collateral, ${leverageText}`;
}

function signatureFromLedgerRow(row) {
  if (!row || typeof row !== 'object') return '';
  return row.signature
    || avantisPlaceOrderSignature(row.action)
    || avantisPlaceOrderSignature(row.browser_action)
    || avantisPlaceOrderSignature(row.result?.action);
}

function ledgerRowBlocks(row, now) {
  const status = String(row?.status || '').toLowerCase();
  const at = Number(row?.at || 0);
  const age = Number.isFinite(at) && at > 0 ? now - at : 0;
  if (ACTIVE_ACTION_STATUSES.has(status)) return age <= AVANTIS_DUPLICATE_ACTIVE_TTL_MS;
  if (RECENT_CONFIRMED_STATUSES.has(status)) return age <= AVANTIS_DUPLICATE_CONFIRMED_TTL_MS;
  return false;
}

function positionCollateralUsd(position) {
  return finite(
    position?.collateral_usd
    ?? position?.collateralUsd
    ?? position?.margin
    ?? position?.collateral
  );
}

export function findDuplicateAvantisPlaceOrder(action, options = {}) {
  const signature = avantisPlaceOrderSignature(action);
  if (!signature) return null;

  const now = Number(options.now || Date.now());
  const locks = options.locks;
  if (locks?.has?.(signature)) {
    return { type: 'in_flight', status: 'signing', signature };
  }

  const ledger = options.ledger && typeof options.ledger === 'object' ? options.ledger : {};
  for (const [id, row] of Object.entries(ledger)) {
    if (signatureFromLedgerRow(row) !== signature) continue;
    if (!ledgerRowBlocks(row, now)) continue;
    return {
      type: 'browser_action',
      status: String(row?.status || 'pending'),
      action_id: id,
      tx_hash: row?.tx_hash || null,
      signature,
    };
  }

  const args = action.args || {};
  const wantedSymbol = cleanSymbol(args.symbol);
  const wantedSide = normalizeAvantisOrderSide(args.side);
  const wantedLeverage = finite(args.leverage || 1);
  const wantedCollateral = finite(args.collateral_usd);
  if (!wantedSymbol || !wantedSide || wantedLeverage == null || wantedCollateral == null) return null;

  const positions = Array.isArray(options.positions) ? options.positions : [];
  for (const position of positions) {
    const posSymbol = cleanSymbol(position?.symbol);
    const posSide = normalizeAvantisOrderSide(position?.side);
    const posLeverage = finite(position?.leverage);
    const posCollateral = positionCollateralUsd(position);
    if (posSymbol !== wantedSymbol || posSide !== wantedSide) continue;
    if (posLeverage == null || Math.abs(posLeverage - wantedLeverage) > 0.05) continue;
    if (posCollateral == null) continue;
    const collateralTolerance = Math.max(0.1, Math.abs(wantedCollateral) * 0.08);
    if (Math.abs(posCollateral - wantedCollateral) > collateralTolerance) continue;
    return {
      type: 'open_position',
      status: 'open',
      symbol: posSymbol,
      side: posSide,
      leverage: posLeverage,
      collateral_usd: posCollateral,
      pair_index: position?.pair_index ?? position?.pairIndex ?? null,
      trade_index: position?.trade_index ?? position?.tradeIndex ?? null,
      signature,
    };
  }

  return null;
}

export function duplicateAvantisPlaceOrderMessage(action, duplicate) {
  const summary = describeAvantisPlaceOrder(action);
  if (duplicate?.type === 'open_position') {
    return `Avantis duplicate blocked: ${summary} is already open. Close or change the existing position first; no second transaction was signed.`;
  }
  if (duplicate?.type === 'in_flight') {
    return `Avantis duplicate blocked: ${summary} is already being signed/submitted. Waiting for the current transaction; no second transaction was signed.`;
  }
  return `Avantis duplicate blocked: ${summary} was already submitted recently. Waiting for confirmation/state refresh; no second transaction was signed.`;
}
