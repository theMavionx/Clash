const crypto = require('crypto');
const bs58Module = require('bs58');

const bs58 = bs58Module.default || bs58Module;
const FIXED_SCALE = 100_000_000n;
const TIF = Object.freeze({ GTC: 0, IOC: 1, ALO: 2 });
const SIGNATURE_DOMAINS = Object.freeze({ mainnet: 1, testnet: 2, devnet: 3 });

function fail(message) {
  throw Object.assign(new Error(message), { status: 400 });
}

function concat(parts) {
  return Buffer.concat(parts.map(part => Buffer.from(part)));
}

function writeU8(value) {
  const n = Number(value);
  if (!Number.isInteger(n) || n < 0 || n > 255) fail('u8 out of range');
  return Buffer.from([n]);
}

function writeBool(value) {
  return writeU8(value === true ? 1 : 0);
}

function writeU32(value) {
  const n = Number(value);
  if (!Number.isInteger(n) || n < 0 || n > 0xffffffff) fail('u32 out of range');
  const out = Buffer.allocUnsafe(4);
  out.writeUInt32LE(n);
  return out;
}

function writeU16(value) {
  const n = Number(value);
  if (!Number.isInteger(n) || n < 0 || n > 0xffff) fail('u16 out of range');
  const out = Buffer.allocUnsafe(2);
  out.writeUInt16LE(n);
  return out;
}

function writeU64(value) {
  let n;
  try { n = BigInt(value); } catch { fail('u64 must be an integer'); }
  if (n < 0n || n > 0xffffffffffffffffn) fail('u64 out of range');
  const out = Buffer.allocUnsafe(8);
  out.writeBigUInt64LE(n);
  return out;
}

function writeF64(value) {
  const n = Number(value);
  if (!Number.isFinite(n)) fail('f64 must be finite');
  const out = Buffer.allocUnsafe(8);
  out.writeDoubleLE(n);
  return out;
}

function writeString(value) {
  const encoded = Buffer.from(String(value || ''), 'utf8');
  if (!encoded.length || encoded.length > 128) fail('Bulk symbol/string length is invalid');
  return concat([writeU64(encoded.length), encoded]);
}

function decode32(value, label = 'base58 value') {
  let decoded;
  try { decoded = Buffer.from(bs58.decode(String(value || '').trim())); } catch { fail(`${label} must be base58`); }
  if (decoded.length !== 32) fail(`${label} must decode to 32 bytes`);
  return decoded;
}

// Exact decimal -> 1e8 conversion. This avoids Number precision drift and
// matches Rust f64::round (half away from zero) for positive order values.
function decimalToFixed(value) {
  const raw = String(value ?? '').trim();
  const match = raw.match(/^\+?(\d+)(?:\.(\d*))?(?:[eE]([+-]?\d+))?$/);
  if (!match) fail('Bulk fixed-point value must be a non-negative decimal');
  const whole = match[1];
  const fraction = match[2] || '';
  const exponent = Number(match[3] || 0);
  if (!Number.isInteger(exponent) || Math.abs(exponent) > 100) fail('Bulk decimal exponent out of range');
  const digits = BigInt((whole + fraction).replace(/^0+(?=\d)/, '') || '0');
  const decimals = fraction.length - exponent;
  let fixed;
  if (decimals <= 8) {
    fixed = digits * (10n ** BigInt(8 - decimals));
  } else {
    const divisor = 10n ** BigInt(decimals - 8);
    const quotient = digits / divisor;
    const remainder = digits % divisor;
    fixed = quotient + (remainder * 2n >= divisor ? 1n : 0n);
  }
  if (fixed > 0xffffffffffffffffn) fail('Bulk fixed-point value out of range');
  return fixed;
}

function writeFixed(value) {
  return writeU64(decimalToFixed(value));
}

function writeOptionalFixed(value) {
  if (value == null || value === '') return writeU8(0);
  return concat([writeU8(1), writeFixed(value)]);
}

function signatureDomainByte(value = 'mainnet') {
  if (Number.isInteger(value) && value >= 1 && value <= 3) return value;
  const key = String(value || '').trim().toLowerCase();
  if (SIGNATURE_DOMAINS[key]) return SIGNATURE_DOMAINS[key];
  fail('Bulk signature domain must be mainnet, testnet, or devnet');
}

function normalizeBuilderCode(value) {
  if (!value || typeof value !== 'object' || Array.isArray(value)) fail('builderCode object required');
  const to = String(value.to || '').trim();
  decode32(to, 'builderCode.to');
  const fee = Number(value.fee);
  if (!Number.isInteger(fee) || fee < 1 || fee > 15) fail('builderCode.fee must be 1..15 bps');
  return { to, fee };
}

function writeBuilderCode(value) {
  if (value === undefined) return Buffer.alloc(0);
  const builder = normalizeBuilderCode(value);
  return concat([writeU8(1), decode32(builder.to, 'builderCode.to'), writeU8(builder.fee)]);
}

function actionEntry(action) {
  if (!action || typeof action !== 'object' || Array.isArray(action)) fail('Bulk action must be an object');
  const keys = Object.keys(action);
  if (keys.length !== 1) fail('Bulk action must contain exactly one variant');
  return [keys[0], action[keys[0]] || {}];
}

function serializeAction(action) {
  const [kind, body] = actionEntry(action);
  if (kind === 'm') {
    return concat([
      writeU32(0), writeString(body.c), writeBool(body.b), writeFixed(body.sz),
      writeBool(body.r === true), writeBool(body.i === true), writeBuilderCode(body.builderCode),
    ]);
  }
  if (kind === 'l') {
    const tif = String(body.tif || 'GTC').toUpperCase();
    if (!(tif in TIF)) fail('Bulk limit tif must be GTC, IOC, or ALO');
    return concat([
      writeU32(1), writeString(body.c), writeBool(body.b), writeFixed(body.px), writeFixed(body.sz),
      writeU32(TIF[tif]), writeBool(body.r === true), writeBool(body.i === true),
      writeBuilderCode(body.builderCode),
    ]);
  }
  if (kind === 'cx') {
    return concat([writeU32(3), writeString(body.c), decode32(body.oid, 'order id')]);
  }
  if (kind === 'cxa') {
    const symbols = Array.isArray(body.c) ? body.c : [];
    return concat([writeU32(4), writeU64(symbols.length), ...symbols.map(writeString)]);
  }
  if (kind === 'st' || kind === 'tp') {
    return concat([
      writeU32(kind === 'st' ? 5 : 6), writeString(body.c), writeBool(body.d),
      writeFixed(body.sz), writeFixed(body.tr), writeOptionalFixed(body.lim),
      writeBool(body.i === true),
    ]);
  }
  if (kind === 'trl') {
    return concat([
      writeU32(9), writeString(body.c), writeBool(body.b), writeFixed(body.sz),
      writeU32(body.trb), writeU32(body.stb), writeOptionalFixed(body.lim),
      writeBool(body.i === true),
    ]);
  }
  if (kind === 'updateUserSettings') {
    const settings = Object.entries(body.m || {}).sort(([left], [right]) => left.localeCompare(right));
    if (!settings.length || settings.length > 64) fail('Bulk leverage settings required');
    return concat([
      writeU32(18), writeU64(settings.length),
      ...settings.flatMap(([symbol, leverage]) => [writeString(symbol), writeF64(leverage)]),
    ]);
  }
  if (kind === 'abc') {
    const builder = normalizeBuilderCode(body);
    return concat([writeU32(40), decode32(builder.to, 'builder recipient'), writeU8(builder.fee)]);
  }
  if (kind === 'rbc') {
    return concat([writeU32(41), decode32(body.to, 'builder recipient')]);
  }
  fail(`Unsupported Bulk action '${kind}'`);
}

function serializeOrderHashAction(action) {
  const [kind, body] = actionEntry(action);
  if (kind === 'm') {
    return concat([
      writeU32(0), writeString(body.c), writeBool(body.b), writeFixed(body.sz),
      writeBool(body.r === true), writeBool(body.i === true),
    ]);
  }
  if (kind === 'l') {
    const tif = String(body.tif || 'GTC').toUpperCase();
    if (!(tif in TIF)) fail('Bulk limit tif must be GTC, IOC, or ALO');
    return concat([
      writeU32(1), writeString(body.c), writeBool(body.b), writeFixed(body.px), writeFixed(body.sz),
      writeU32(TIF[tif]), writeBool(body.r === true), writeBool(body.i === true),
    ]);
  }
  return null;
}

function serializeTransaction(actions, nonce, account, signatureDomain = 'mainnet') {
  if (!Array.isArray(actions) || !actions.length || actions.length > 16) fail('Bulk transaction requires 1..16 actions');
  return concat([
    writeU64(actions.length),
    ...actions.map(serializeAction),
    writeU64(nonce),
    decode32(account, 'Bulk account'),
    writeU8(signatureDomainByte(signatureDomain)),
  ]);
}

function orderIdForAction(action, seqno, nonce, account) {
  const canonicalOrder = serializeOrderHashAction(action);
  if (!canonicalOrder) return null;
  const digest = crypto.createHash('sha256').update(concat([
    writeU32(seqno), canonicalOrder, decode32(account, 'Bulk account'), writeU64(nonce),
  ])).digest();
  return bs58.encode(digest);
}

function formatFixed(value) {
  const n = Number(value);
  if (!Number.isFinite(n)) fail('Bulk clear-sign number must be finite');
  return n.toFixed(8);
}

function formatOptional(value) {
  return value == null || value === '' ? '-' : formatFixed(value);
}

function clearSignActionLine(action) {
  const [kind, body] = actionEntry(action);
  if (kind === 'm') {
    return `Market ${body.c} ${body.b ? 'Buy' : 'Sell'} sz=${formatFixed(body.sz)} ro=${body.r === true} iso=${body.i === true}`;
  }
  if (kind === 'l') {
    const tif = String(body.tif || 'GTC').toUpperCase();
    if (!(tif in TIF)) fail('Bulk limit tif must be GTC, IOC, or ALO');
    return `Limit ${body.c} ${body.b ? 'Buy' : 'Sell'} px=${formatFixed(body.px)} sz=${formatFixed(body.sz)} tif=${tif} ro=${body.r === true} iso=${body.i === true}`;
  }
  if (kind === 'cx') return `Cancel ${body.c} oid=${body.oid}`;
  if (kind === 'cxa') {
    const symbols = Array.isArray(body.c) ? body.c : [];
    return symbols.length ? `CancelAll ${symbols.join(',')}` : 'CancelAll *';
  }
  if (kind === 'st' || kind === 'tp') {
    const label = kind === 'st' ? 'Stop' : 'TakeProfit';
    return `${label} ${body.c} ${body.d ? 'Above' : 'Below'} thresh=${formatFixed(body.tr)} sz=${formatFixed(body.sz)} limit=${formatOptional(body.lim)}`;
  }
  if (kind === 'trl') {
    return `Trailing ${body.c} ${body.b ? 'Buy' : 'Sell'} sz=${formatFixed(body.sz)} trail=${Number(body.trb)}bps step=${Number(body.stb)}bps limit=${formatOptional(body.lim)}`;
  }
  if (kind === 'updateUserSettings') {
    const settings = Object.entries(body.m || {}).sort(([left], [right]) => left.localeCompare(right));
    if (!settings.length) fail('Bulk leverage settings required');
    return `UpdateLeverage ${settings.map(([symbol, leverage]) => `${symbol}:${formatFixed(leverage)}`).join(',')}`;
  }
  if (kind === 'abc') {
    const builder = normalizeBuilderCode(body);
    return `ApproveCommissionFee to=${builder.to} max_fee=${builder.fee}`;
  }
  if (kind === 'rbc') return `RevokeCommissionFee to=${String(body.to || '').trim()}`;
  fail(`Unsupported Bulk clear-sign action '${kind}'`);
}

function clearSignPayload(actions, nonce, account, signatureDomain = 'mainnet') {
  const network = String(signatureDomain || '').trim().toLowerCase();
  const raw = serializeTransaction(actions, nonce, account, signatureDomain);
  const hash = crypto.createHash('sha256').update(raw).digest('hex');
  const lines = [
    'Bulk Exchange Transaction',
    `Network: ${network}`,
    `Account: ${account}`,
    `Nonce: ${String(nonce)}`,
    `Actions: ${actions.length}`,
    `Signable-Hash: ${hash}`,
    ...actions.map((action, index) => `[${index}] ${clearSignActionLine(action)}`),
  ];
  return `${lines.join('\n')}\n`;
}

function offchainMessage(actions, nonce, account, signer = account, signatureDomain = 'mainnet') {
  const payload = Buffer.from(clearSignPayload(actions, nonce, account, signatureDomain), 'utf8');
  if (!payload.length || payload.length > 0xffff) fail('Bulk offchain payload size is invalid');
  const printableAscii = payload.every(byte => byte >= 0x20 && byte <= 0x7e);
  return concat([
    Buffer.from([0xff]), Buffer.from('solana offchain', 'ascii'), writeU8(0),
    writeU8(signatureDomainByte(signatureDomain)), Buffer.alloc(31),
    writeU8(printableAscii ? 0 : 1), writeU8(1), decode32(signer, 'Bulk signer'),
    writeU16(payload.length), payload,
  ]);
}

function base58Message(actions, nonce, account, signatureDomain = 'mainnet') {
  return Buffer.from(bs58.encode(serializeTransaction(actions, nonce, account, signatureDomain)), 'utf8');
}

function transactionOrderIds(actions, nonce, account) {
  return actions.map((action, index) => orderIdForAction(action, index, nonce, account));
}

module.exports = {
  FIXED_SCALE,
  SIGNATURE_DOMAINS,
  TIF,
  decimalToFixed,
  clearSignActionLine,
  clearSignPayload,
  base58Message,
  decode32,
  normalizeBuilderCode,
  orderIdForAction,
  offchainMessage,
  serializeOrderHashAction,
  serializeAction,
  serializeTransaction,
  signatureDomainByte,
  transactionOrderIds,
};
