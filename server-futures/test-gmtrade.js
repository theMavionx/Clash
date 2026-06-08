process.env.GMTRADE_MARKETS_JSON = JSON.stringify({
  SOL: {
    market_token: 'So11111111111111111111111111111111111111112',
    long_token: 'So11111111111111111111111111111111111111112',
    short_token: 'EPjFWdd5AufqSSqeM2qN1xzybapC8G4wEGGkZwyTDt1v',
    collateral_token: 'EPjFWdd5AufqSSqeM2qN1xzybapC8G4wEGGkZwyTDt1v',
    collateral_decimals: 6,
  },
});
process.env.GMTRADE_SKIP_WALLET_USDC_PREFLIGHT = '1';

const assert = require('assert');
const { Keypair, Transaction, VersionedTransaction } = require('@solana/web3.js');
const bs58 = require('bs58');
const gmtrade = require('./gmtrade');
const bs58Encode = bs58.encode || bs58.default.encode;

function writeU128Le(buf, offset, value) {
  buf.writeBigUInt64LE(value & ((1n << 64n) - 1n), offset);
  buf.writeBigUInt64LE(value >> 64n, offset + 8);
}

function decodeBuiltTransaction(base64) {
  const bytes = Buffer.from(base64, 'base64');
  try {
    return { kind: 'legacy', tx: Transaction.from(bytes) };
  } catch {
    return { kind: 'versioned', tx: VersionedTransaction.deserialize(bytes) };
  }
}

async function main() {
  const eventOffset = 8;
  const positionSize = 272;
  const buf = Buffer.alloc(eventOffset + 256 + positionSize * 2);
  buf.writeUInt8(1 | (1 << 2), eventOffset);
  buf.writeBigUInt64LE(77n, eventOffset + 8);
  for (const offset of [48, 80, 112, 144, 176]) {
    Keypair.generate().publicKey.toBuffer().copy(buf, eventOffset + offset);
  }
  const user = Keypair.generate().publicKey;
  user.toBuffer().copy(buf, eventOffset + 112);
  buf.writeBigInt64LE(1710000000n, eventOffset + 240);
  buf.writeBigUInt64LE(123456n, eventOffset + 248);
  writeU128Le(buf, eventOffset + 256 + 64, 10n * 10n ** 20n);
  writeU128Le(buf, eventOffset + 256 + positionSize + 64, 35n * 10n ** 20n);

  const event = gmtrade._internal.decodeGmtradeTradeEvent(buf.toString('base64'));
  assert.equal(event.user, bs58Encode(user.toBuffer()));
  assert.equal(event.side, 'long');
  assert.equal(event.is_increase, true);
  assert.equal(event.size_delta_usd, 25);

  const built = await gmtrade.buildCreateOrderTx({
    wallet: '1111111QLbz7JHiBTspS962RLKV8GndWFwiEaqKM',
    symbol: 'SOL',
    side: 'long',
    amount: 1,
    leverage: 2,
    recent_blockhash: '11111111111111111111111111111111',
    last_valid_block_height: 1,
  });
  assert.equal(built.ok, true);
  assert.equal(built.builder, 'node_wasm_gmsol_sdk');
  assert.equal(built.transactions.length > 0, true);
  const decoded = decodeBuiltTransaction(built.transactions[0]);
  assert.equal(decoded.kind, 'legacy');
  assert.equal(decoded.tx.signatures.length > 0, true);

  console.log(JSON.stringify({
    ok: true,
    decoder: event.decoder,
    event_delta_usd: event.size_delta_usd,
    builder: built.builder,
    tx_kind: decoded.kind,
    tx_count: built.transactions.length,
  }, null, 2));
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
