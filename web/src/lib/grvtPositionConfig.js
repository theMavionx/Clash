// GRVT per-position margin type + leverage (`full/v1/set_position_config`).
//
// GRVT deprecated `set_initial_leverage` (error 2106) in favour of this signed call. The
// EIP-712 struct below is the one GRVT's server verifies; it matches the official SDKs:
//   gravity-technologies/grvt-sdk-typescript src/generated/signing.ts
//     (EIP712_SET_SUB_ACCOUNT_POSITION_MARGIN_CONFIG, messageSetSubAccountPositionMarginConfig)
//   type hash 0x75673028b3d75e3ec43589ed8a9291dbea56da6886c45d05efafc68a4ae51395
//   test vector: scenarios/signing.json case "set_position_config".
// Field encoding (from the SDK message builder):
//   subAccountID = sub_account_id (uint64)
//   asset        = instrument_hash of the instrument (uint256, "assetKey")
//   marginType   = PositionMarginType code: ISOLATED = 1, CROSS = 2
//   leverage     = decimal leverage scaled by 10^6 (int32), over-precision rejected
//   nonce/expiration = signature.nonce / signature.expiration (ns)

export const GRVT_POSITION_CONFIG_PRIMARY_TYPE = 'SetSubAccountPositionMarginConfig';
export const GRVT_POSITION_CONFIG_TYPE_HASH = '0x75673028b3d75e3ec43589ed8a9291dbea56da6886c45d05efafc68a4ae51395';
export const GRVT_POSITION_MARGIN_TYPE_CODES = Object.freeze({ ISOLATED: 1, CROSS: 2 });
export const GRVT_LEVERAGE_DECIMALS = 6;

const INT32_MAX = 2_147_483_647n;

export const GRVT_POSITION_CONFIG_TYPES = Object.freeze({
  EIP712Domain: [
    { name: 'name', type: 'string' },
    { name: 'version', type: 'string' },
    { name: 'chainId', type: 'uint256' },
  ],
  [GRVT_POSITION_CONFIG_PRIMARY_TYPE]: [
    { name: 'subAccountID', type: 'uint64' },
    { name: 'asset', type: 'uint256' },
    { name: 'marginType', type: 'uint8' },
    { name: 'leverage', type: 'int32' },
    { name: 'nonce', type: 'uint32' },
    { name: 'expiration', type: 'int64' },
  ],
});

/** GRVT margin type name; anything that is not ISOLATED is CROSS (GRVT's default). */
export function normalizeGrvtMarginType(value, fallback = 'CROSS') {
  const text = String(value ?? '').trim().toUpperCase();
  if (text === 'ISOLATED' || text === '1') return 'ISOLATED';
  if (text === 'CROSS' || text === '2' || text === 'SIMPLE_CROSS_MARGIN' || text === 'PORTFOLIO_CROSS_MARGIN') return 'CROSS';
  return fallback;
}

/** Leverage as GRVT's decimal wire string ("10", "12.5"); throws on non-positive / >6 decimals. */
export function formatGrvtLeverage(value) {
  const text = String(value ?? '').trim();
  if (!/^\d+(\.\d+)?$/u.test(text) || !(Number(text) > 0)) {
    throw new Error('GRVT leverage must be a positive number');
  }
  const [whole, frac = ''] = text.split('.');
  const trimmed = frac.replace(/0+$/u, '');
  if (trimmed.length > GRVT_LEVERAGE_DECIMALS) throw new Error('GRVT leverage supports at most 6 decimals');
  return `${whole.replace(/^0+(?=\d)/u, '')}${trimmed ? `.${trimmed}` : ''}`;
}

/** "10" -> 10_000_000n (leverage x 10^6, int32). */
export function scaleGrvtLeverage(value) {
  const text = formatGrvtLeverage(value);
  const [whole, frac = ''] = text.split('.');
  const scaled = BigInt(`${whole}${frac.padEnd(GRVT_LEVERAGE_DECIMALS, '0')}`);
  if (scaled <= 0n || scaled > INT32_MAX) throw new Error('GRVT leverage is out of range');
  return scaled;
}

/** EIP-712 typed data for set_position_config, ready for eth_signTypedData_v4 / viem. */
export function buildGrvtPositionConfigTypedData({
  subAccountId,
  instrumentHash,
  marginType,
  leverage,
  nonce,
  expiration,
  chainId,
}) {
  if (!String(subAccountId ?? '').trim()) throw new Error('GRVT sub account id required');
  if (instrumentHash === undefined || instrumentHash === null || String(instrumentHash).trim() === '') {
    throw new Error('GRVT instrument hash required');
  }
  const mt = normalizeGrvtMarginType(marginType);
  return {
    domain: { name: 'GRVT Exchange', version: '0', chainId: Number(chainId) },
    types: GRVT_POSITION_CONFIG_TYPES,
    primaryType: GRVT_POSITION_CONFIG_PRIMARY_TYPE,
    message: {
      subAccountID: BigInt(String(subAccountId).trim()),
      asset: BigInt(String(instrumentHash).trim()),
      marginType: GRVT_POSITION_MARGIN_TYPE_CODES[mt],
      leverage: scaleGrvtLeverage(leverage),
      nonce: Number(nonce),
      expiration: BigInt(String(expiration)),
    },
  };
}

/** Full-mode request body (`full/v1/set_position_config`). */
export function buildGrvtPositionConfigRequest({ subAccountId, instrument, marginType, leverage, signature }) {
  return {
    sub_account_id: String(subAccountId),
    instrument: String(instrument),
    margin_type: normalizeGrvtMarginType(marginType),
    leverage: formatGrvtLeverage(leverage),
    signature: {
      signer: String(signature.signer),
      r: String(signature.r),
      s: String(signature.s),
      v: Number(signature.v),
      expiration: String(signature.expiration),
      nonce: Number(signature.nonce),
      chain_id: String(signature.chain_id),
    },
  };
}

/**
 * What to do with the account's GRVT leverage before an opening order.
 * `current` is GRVT's configured leverage for the instrument (get_all_initial_leverage) or null.
 */
export function planGrvtLeverageUpdate({ requested, current }) {
  const want = Number(requested);
  const have = Number(current);
  if (!Number.isFinite(want) || want <= 0) return { update: false, reason: 'invalid_request' };
  if (Number.isFinite(have) && have > 0 && Math.abs(have - want) < 1e-9) return { update: false, reason: 'unchanged' };
  return { update: true, reason: 'changed' };
}

/**
 * After a failed leverage update: an order may still be placed when GRVT's current leverage
 * already covers the order (current >= requested means the margin needed is no larger).
 */
export function grvtLeverageFailureAllowsOrder({ requested, current }) {
  const want = Number(requested);
  const have = Number(current);
  return Number.isFinite(want) && want > 0 && Number.isFinite(have) && have > 0 && have + 1e-9 >= want;
}
