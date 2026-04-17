// Cleanup script — closes every open Avantis position for the given PK so
// locked collateral returns to the user's wallet. Only used to tidy up test
// runs; not part of the production flow.

const { privateKeyToAccount } = require('viem/accounts');
const avantis = require('./avantis');

const PK = process.env.AVANTIS_TEST_PK;
if (!PK) { console.error('Set AVANTIS_TEST_PK'); process.exit(1); }

async function sleep(ms) { return new Promise(r => setTimeout(r, ms)); }

async function run() {
  const address = privateKeyToAccount(PK).address;
  console.log('Cleaning up open positions for', address);

  const positions = await avantis.getPositions(PK);
  console.log(`Open positions: ${positions.length}`);
  if (positions.length === 0) {
    console.log('Nothing to do.');
    return;
  }

  for (const p of positions) {
    const pi = p.pairIndex ?? p.pair_index ?? p.trade?.pairIndex;
    const idx = p.index ?? p.trade?.index ?? 0;
    // Core API returns exact remaining collateral under `collateral`
    // (scaled by 10^6). Opening fees + funding drain this over time —
    // closing with a value greater than this reverts INV_AMOUNT.
    const rawCollateral = p.collateral ?? p.trade?.collateral;
    const collateral = rawCollateral ? Number(rawCollateral) / 1e6 : 0;
    // Round DOWN to 6 decimals so we never exceed on-chain value.
    const closeAmount = Math.floor(collateral * 1e6) / 1e6;
    console.log(`Closing pair=${pi} index=${idx} collateral=${collateral.toFixed(6)} → close=${closeAmount}`);
    try {
      const r = await avantis.closePosition(PK, {
        pair_index: pi,
        trade_index: idx,
        amount: closeAmount,
      });
      console.log('  ->', r.tx_hash, r.status);
    } catch (e) {
      console.error('  ❌', e.message.slice(0, 200));
    }
    await sleep(3000);
  }

  await sleep(4000);
  const usdc = await avantis.getUsdcBalance(address);
  const eth = await avantis.getEthBalance(address);
  console.log(`\nFinal USDC: ${usdc.toFixed(4)}`);
  console.log(`Final ETH:  ${eth.toFixed(6)}`);
}

run().catch(e => { console.error(e); process.exit(1); });
