// GRVT create_order / bulk_orders EIP-712 payload (OrderWithBuilderFee).
// Mirrors gravity-technologies/grvt-sdk-typescript src/generated/signing.ts
// (messageOrderWithBuilderFee / messageOrderWithBuilderFeeOrderLeg):
//   contractSize = leg.size x 10^instrument.base_decimals   <- per instrument (6 for many alts, 3 for some)
//   limitPrice   = leg.limit_price x 10^9 ("0" for market)
//   builderFee   = order.builder_fee (percent, e.g. "0.01" = 0.01%) x 10^4
//   timeInForce  = TimeInForce code (GTT 1, AON 2, IOC 3, FOK 4)
// Test vector: scenarios/signing.json case "order_with_builder_fee".

export const GRVT_ORDER_PRIMARY_TYPE = 'OrderWithBuilderFee';
export const GRVT_PRICE_DECIMALS = 9;
export const GRVT_DEFAULT_BASE_DECIMALS = 9;

export const GRVT_ORDER_TYPES = Object.freeze({
  EIP712Domain: [
    { name: 'name', type: 'string' },
    { name: 'version', type: 'string' },
    { name: 'chainId', type: 'uint256' },
  ],
  [GRVT_ORDER_PRIMARY_TYPE]: [
    { name: 'subAccountID', type: 'uint64' },
    { name: 'isMarket', type: 'bool' },
    { name: 'timeInForce', type: 'uint8' },
    { name: 'postOnly', type: 'bool' },
    { name: 'reduceOnly', type: 'bool' },
    { name: 'legs', type: 'OrderLeg[]' },
    { name: 'builder', type: 'address' },
    { name: 'builderFee', type: 'uint32' },
    { name: 'nonce', type: 'uint32' },
    { name: 'expiration', type: 'int64' },
  ],
  OrderLeg: [
    { name: 'assetID', type: 'uint256' },
    { name: 'contractSize', type: 'uint64' },
    { name: 'limitPrice', type: 'uint64' },
    { name: 'isBuyingContract', type: 'bool' },
  ],
});

/** Instrument base_decimals from GRVT all_instruments metadata (9 when absent). */
export function grvtBaseDecimals(instrumentMeta) {
  const n = Number(instrumentMeta?.base_decimals);
  return Number.isInteger(n) && n >= 0 && n <= 18 ? n : GRVT_DEFAULT_BASE_DECIMALS;
}

/** "0.01", 9 -> 10000000n. Over-precision throws (GRVT rejects it; never round a signed size). */
export function scaleGrvtDecimal(value, decimals, label = 'value') {
  const text = String(value ?? '').trim();
  if (!/^\d+(\.\d+)?$/u.test(text)) throw new Error(`Invalid GRVT ${label}`);
  const [whole, frac = ''] = text.split('.');
  const trimmed = frac.replace(/0+$/u, '');
  if (trimmed.length > decimals) throw new Error(`GRVT ${label} has more than ${decimals} decimals`);
  return BigInt(`${whole}${trimmed.padEnd(decimals, '0')}`.replace(/^0+(?=\d)/u, '') || '0');
}

/** Decimal string for a size already snapped to the lot step, capped at base_decimals. */
export function formatGrvtSize(value, baseDecimals) {
  const n = Number(value);
  if (!Number.isFinite(n) || n <= 0) throw new Error('Invalid GRVT size');
  return n.toFixed(Math.min(baseDecimals, 18)).replace(/\.?0+$/u, '') || '0';
}

export function buildGrvtOrderTypedData({
  subAccountId,
  isMarket,
  timeInForceCode,
  postOnly = false,
  reduceOnly = false,
  legs,
  builder,
  builderFee,
  nonce,
  expiration,
  chainId,
}) {
  if (!Array.isArray(legs) || !legs.length) throw new Error('GRVT order requires legs');
  return {
    domain: { name: 'GRVT Exchange', version: '0', chainId: Number(chainId) },
    types: GRVT_ORDER_TYPES,
    primaryType: GRVT_ORDER_PRIMARY_TYPE,
    message: {
      subAccountID: BigInt(String(subAccountId)),
      isMarket: !!isMarket,
      timeInForce: Number(timeInForceCode),
      postOnly: !!postOnly,
      reduceOnly: !!reduceOnly,
      legs: legs.map(leg => ({
        assetID: BigInt(String(leg.instrumentHash)),
        contractSize: scaleGrvtDecimal(leg.size, Number(leg.baseDecimals ?? GRVT_DEFAULT_BASE_DECIMALS), 'order size'),
        limitPrice: isMarket ? 0n : scaleGrvtDecimal(leg.limitPrice ?? '0', GRVT_PRICE_DECIMALS, 'limit price'),
        isBuyingContract: !!leg.isBuying,
      })),
      builder,
      builderFee: Number(scaleGrvtDecimal(builderFee ?? '0', 4, 'builder fee')),
      nonce: Number(nonce),
      expiration: BigInt(String(expiration)),
    },
  };
}
