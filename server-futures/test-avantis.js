// Direct Avantis integration test — bypasses the HTTP layer and talks to
// avantis.js functions directly. Uses a user-supplied private key via env.
// Do not commit the env file; do not log the key.

const { privateKeyToAccount } = require('viem/accounts');
const avantis = require('./avantis');

const PK = process.env.AVANTIS_TEST_PK;
if (!PK || !/^0x[0-9a-f]{64}$/i.test(PK)) {
  console.error('Set AVANTIS_TEST_PK=0x<64hex> env var');
  process.exit(1);
}

async function sleep(ms) { return new Promise(r => setTimeout(r, ms)); }

function fmt(n, d = 4) { return Number(n).toFixed(d); }

async function run() {
  const address = privateKeyToAccount(PK).address;
  console.log('=== Avantis integration test ===');
  console.log('Trader address:', address);
  console.log();

  // 1. Balances
  console.log('--- 1. Balances ---');
  const usdc = await avantis.getUsdcBalance(address);
  const eth = await avantis.getEthBalance(address);
  console.log(`USDC: ${fmt(usdc, 2)}`);
  console.log(`ETH:  ${fmt(eth, 6)}`);
  if (usdc < 10) {
    console.error('\n❌ Need at least 10 USDC to test a trade. Top up address:', address);
    process.exit(1);
  }
  if (eth < 0.001) {
    console.error('\n❌ Need at least 0.001 ETH for gas. Send ETH to:', address);
    process.exit(1);
  }
  console.log();

  // 2. Markets + prices (read-only)
  console.log('--- 2. Markets + pair mapping ---');
  const marketInfo = await avantis.getMarketInfo();
  console.log(`Total pairs: ${marketInfo.count}`);
  const btcPairIdx = await avantis.pairIndexFromSymbol('BTC');
  console.log(`BTC pairIndex: ${btcPairIdx}`);
  console.log();

  console.log('--- 3. Prices ---');
  const prices = await avantis.getPrices();
  const btcPrice = prices?.['BTC/USD'] || prices?.BTC || null;
  console.log(`BTC price: ${btcPrice}`);
  console.log();

  // 3. Account info
  console.log('--- 4. Account info ---');
  const acct = await avantis.getAccountInfo(PK);
  console.log(`balance_usdc: ${acct.balance_usdc}`);
  console.log(`balance_eth:  ${acct.balance_eth}`);
  console.log(`positions:    ${acct.positions.length}`);
  console.log(`limit_orders: ${acct.limit_orders.length}`);
  console.log();

  // 4. Open market order — long BTC with notional ≥ $100 (Avantis minimum).
  //    5 USDC × 25x = $125 notional.
  const TEST_COLLATERAL = 5;
  const TEST_LEVERAGE = 25;
  console.log(`--- 5. Open market order: LONG BTC, ${TEST_COLLATERAL} USDC, ${TEST_LEVERAGE}x (notional $${TEST_COLLATERAL * TEST_LEVERAGE}) ---`);
  let opened;
  try {
    opened = await avantis.createMarketOrder(PK, {
      symbol: 'BTC',
      side: 'long',
      amount: TEST_COLLATERAL,
      leverage: TEST_LEVERAGE,
      slippage_percent: 1,
      tp: 0,
      sl: 0,
    });
    console.log('Result:', opened);
  } catch (e) {
    console.error('❌ openTrade failed:', e.message);
    process.exit(1);
  }
  console.log();

  // 5. Wait a couple seconds for Core API to index the new trade
  console.log('Waiting 5s for Avantis Core API to reflect the trade…');
  await sleep(5000);

  // 6. Verify position exists
  console.log('--- 6. Positions after open ---');
  const positions = await avantis.getPositions(PK);
  console.log(`Count: ${positions.length}`);
  positions.forEach((p, i) => {
    const pi = p.pairIndex ?? p.pair_index ?? p.trade?.pairIndex;
    const idx = p.index ?? p.trade?.index;
    console.log(`  [${i}] pair=${pi} index=${idx} side=${p.buy || p.trade?.buy ? 'LONG' : 'SHORT'}`);
  });
  console.log();

  if (positions.length === 0) {
    console.log('⚠️  Position not yet visible on Core API — may still be pending. Exiting before close.');
    return;
  }

  // 7. Close the position we just opened. Use the actual remaining collateral
  //    from Core API — opening fees already reduced the effective amount so
  //    passing the original 5 USDC would revert with INV_AMOUNT.
  const target = positions[positions.length - 1];
  const pairIdx = target.pairIndex ?? target.pair_index ?? target.trade?.pairIndex;
  const tradeIdx = target.index ?? target.trade?.index ?? 0;
  const rawTrade = target.trade || target;
  const actualCollateralRaw = rawTrade.positionSizeUSDC ?? rawTrade.initialPosToken ?? target.positionSizeUSDC;
  const actualCollateral = actualCollateralRaw
    ? Number(actualCollateralRaw) / 1e6
    : TEST_COLLATERAL * 0.95; // fallback: 95% of initial
  console.log(`--- 7. Close position pair=${pairIdx} index=${tradeIdx} collateral=${actualCollateral.toFixed(4)} USDC ---`);
  try {
    const closed = await avantis.closePosition(PK, {
      pair_index: pairIdx,
      trade_index: tradeIdx,
      amount: actualCollateral,
    });
    console.log('Result:', closed);
  } catch (e) {
    console.error('❌ closeTradeMarket failed:', e.message);
    process.exit(1);
  }
  console.log();

  // 8. Final balance
  await sleep(3000);
  console.log('--- 8. Final balances ---');
  const finalUsdc = await avantis.getUsdcBalance(address);
  const finalEth = await avantis.getEthBalance(address);
  console.log(`USDC: ${fmt(finalUsdc, 2)} (diff: ${fmt(finalUsdc - usdc, 4)})`);
  console.log(`ETH:  ${fmt(finalEth, 6)} (diff: ${fmt(finalEth - eth, 6)})`);
  console.log();
  console.log('✅ Integration test finished.');
}

run().catch(e => { console.error('FATAL:', e); process.exit(1); });
