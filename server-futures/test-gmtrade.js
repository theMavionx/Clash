process.env.GMTRADE_MARKETS_JSON = JSON.stringify({
  SOL: {
    market_token: 'So11111111111111111111111111111111111111112',
    long_token: 'So11111111111111111111111111111111111111112',
    short_token: 'EPjFWdd5AufqSSqeM2qN1xzybapC8G4wEGGkZwyTDt1v',
    collateral_token: 'EPjFWdd5AufqSSqeM2qN1xzybapC8G4wEGGkZwyTDt1v',
    collateral_decimals: 6,
  },
});
process.env.GMTRADE_COLLATERAL_MINT = 'So11111111111111111111111111111111111111112';
process.env.GMTRADE_EXECUTION_LAMPORTS = '0';
process.env.GMTRADE_ORDER_SOL_BUFFER_LAMPORTS = '0';

const assert = require('assert');
const { Keypair, PublicKey, Transaction, VersionedTransaction } = require('@solana/web3.js');
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

  const orderIx = {
    accounts: [
      0, 0, 13, 2, 6, 4, 1, 14,
      14, 14, 14, 3, 15, 3, 3, 5,
      7, 10, 12, 15, 15, 15, 15, 11, 15,
    ],
    data: 'XSE8t7hu2S3vH2CvoMyiCqZdNpDvkdYjXE1N8sqvhZYx4ZSiJ7iowxbW78FjDMgddCDjNnZGJTmU34knADJFbQPLX7SnjihtBtXJxmaqnhLZ595LzqkJViFjRU3k2bKbvkF9AbBjpQsYQN7KQccWACmYTSo9DGTKaEHVfHCRAjyYeWzHDZZ',
  };
  const orderKeys = [
    '9HqCqKxVa8BiZeqZJRadCMizue3DBctmEjUjqA1veTKs',
    '4CuGQq5CHJbvYa3uAMfq1icjAGyKEherPNYZjmiWnpm4',
    '4tM9cPqNpEYmstNdJMCc6rwdq42939w1SRFYoqMsqPQF',
    '75XM3zZsyeobxccnknAGkzmaPUEfqXMTZWcFuAC155Uj',
    '8Bxc8eDrapdMtyZ5EQ5UtCTFETUaMRGkvWwr38nNjUFu',
    '93vqzT38NaFLkGtxT6JMSZfqMR8CHihWdAm94c6pijcE',
    'BbVuy9HKX4Hof2aFWuba5XeQA74HC1bKosPN6M2Fb2Uy',
    '11111111111111111111111111111111',
    'ComputeBudget111111111111111111111111111111',
    'L2TExMFKdjpN9kozasaurPirfHy9P8sbXoAN1qA3S95',
    'TokenkegQfeZyiNwAJbNbGKPFXCWuBvf9Ss623VQ5DA',
    '8a4wJ2bMiH6XWDZ7biTnejkss8VG7GMwd9Mg6F5fDfHF',
    'ATokenGPvbdGVxr1b2hvZbsiqW5xWH25efTNsLJA8knL',
    'CTDLvGGXnoxvqLyTpGzdGLg9pD6JexKxKXSV8tqqo8bN',
    'EPjFWdd5AufqSSqeM2qN1xzybapC8G4wEGGkZwyTDt1v',
    'Gmso1uvJnLbawvw7yezdfCDcPydwW2s2iqG3w6MDucLo',
  ];
  const order = gmtrade._internal.decodeGmtradeCreateOrderV2Instruction(orderIx, orderKeys);
  assert.equal(order.kind_name, 'LimitIncrease');
  assert.equal(order.side, 'long');
  assert.equal(order.margin_usd, 90);
  assert.equal(order.size_delta_usd, 1800);

  const innerOffset = 16;
  const innerBuf = Buffer.alloc(innerOffset + 256 + positionSize * 2);
  innerBuf.writeUInt8(1, innerOffset);
  innerBuf.writeBigUInt64LE(130910n, innerOffset + 8);
  new PublicKey('CTDLvGGXnoxvqLyTpGzdGLg9pD6JexKxKXSV8tqqo8bN').toBuffer().copy(innerBuf, innerOffset + 48);
  Keypair.generate().publicKey.toBuffer().copy(innerBuf, innerOffset + 80);
  new PublicKey('9HqCqKxVa8BiZeqZJRadCMizue3DBctmEjUjqA1veTKs').toBuffer().copy(innerBuf, innerOffset + 112);
  Keypair.generate().publicKey.toBuffer().copy(innerBuf, innerOffset + 144);
  Keypair.generate().publicKey.toBuffer().copy(innerBuf, innerOffset + 176);
  innerBuf.writeBigInt64LE(1781278534n, innerOffset + 240);
  innerBuf.writeBigUInt64LE(426009503n, innerOffset + 248);
  writeU128Le(innerBuf, innerOffset + 256 + 64, 3600n * 10n ** 20n);
  writeU128Le(innerBuf, innerOffset + 256 + positionSize + 64, 0n);
  const innerEvents = gmtrade._internal.decodeTradeEventsFromInnerInstructions({
    slot: 426009503,
    meta: {
      innerInstructions: [{
        instructions: [{
          programIdIndex: 1,
          data: bs58Encode(innerBuf),
        }],
      }],
    },
  }, ['11111111111111111111111111111111', 'Gmso1uvJnLbawvw7yezdfCDcPydwW2s2iqG3w6MDucLo']);
  assert.equal(innerEvents.length, 1);
  assert.equal(innerEvents[0].user, '9HqCqKxVa8BiZeqZJRadCMizue3DBctmEjUjqA1veTKs');
  assert.equal(innerEvents[0].is_increase, false);
  assert.equal(innerEvents[0].size_delta_usd, 3600);

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
  assert.equal(decoded.kind, 'versioned');
  assert.equal(decoded.tx.signatures.length > 0, true);

  console.log(JSON.stringify({
    ok: true,
    decoder: event.decoder,
    event_delta_usd: event.size_delta_usd,
    create_order_delta_usd: order.size_delta_usd,
    inner_event_delta_usd: innerEvents[0].size_delta_usd,
    builder: built.builder,
    tx_kind: decoded.kind,
    tx_count: built.transactions.length,
  }, null, 2));
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
