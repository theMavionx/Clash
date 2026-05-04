// GMX V2 (Arbitrum) — end-to-end test script.
//
// Runs against a real Arbitrum mainnet wallet with real funds. The wallet
// private key is loaded from server-futures/.env (TEST_PRIVKEY). Funded
// with ~$30 USDC + ~$5 ETH on Arbitrum, this script exercises the full
// trade cycle our useGmx hook performs in the browser:
//
//   1. balances       — ETH + USDC + USDC.allowance(SyntheticsRouter)
//   2. info           — markets + positions + orders for the test wallet
//   3. approve        — ensure USDC is approved (idempotent)
//   4. open           — open a tiny LONG position
//   5. close          — close that position fully
//
// Usage:
//   node test-gmx.js            # reads balances + positions, no trades
//   node test-gmx.js approve    # approve USDC to MAX_UINT256 if needed
//   node test-gmx.js open       # open $5 LONG ETH 2x (uses real funds!)
//   node test-gmx.js close      # close every open ETH position
//   node test-gmx.js full       # approve → open → wait → close (full cycle)
//
// SDK lives in web/node_modules (it's a frontend dep). We point require
// resolution there so this server-side test stays in sync with what the
// browser actually ships.

const path = require('path');
const fs = require('fs');

// Reach into web/node_modules so we don't need to install @gmx-io/sdk in
// server-futures/package.json just for this script. We resolve subpath
// exports manually because Node's CJS require ignores `package.exports`
// when the package is loaded by absolute path.
const WEB_NODE_MODULES = path.join(__dirname, '..', 'web', 'node_modules');
const SDK_BASE = path.join(WEB_NODE_MODULES, '@gmx-io', 'sdk', 'build', 'cjs', 'src');
function webRequire(pkg) {
  // Map known SDK subpaths to their real CJS file paths.
  const subpathMap = {
    '@gmx-io/sdk':              path.join(SDK_BASE, 'clients', 'v1', 'index.js'),
    '@gmx-io/sdk/v2':           path.join(SDK_BASE, 'clients', 'v2', 'index.js'),
    '@gmx-io/sdk/utils/trade':  path.join(SDK_BASE, 'utils', 'trade', 'index.js'),
    '@gmx-io/sdk/types/orders': path.join(SDK_BASE, 'utils', 'orders', 'types.js'),
  };
  return require(subpathMap[pkg] || path.join(WEB_NODE_MODULES, pkg));
}

// Load env (TEST_PRIVKEY) from server-futures/.env without dotenv dep.
function loadEnv() {
  try {
    const text = fs.readFileSync(path.join(__dirname, '.env'), 'utf8');
    for (const line of text.split(/\r?\n/)) {
      const m = line.match(/^([A-Z_][A-Z0-9_]*)=(.*)$/);
      if (m) process.env[m[1]] = m[2].trim();
    }
  } catch { /* no .env, fall back to ambient */ }
}
loadEnv();

const { GmxSdk } = webRequire('@gmx-io/sdk');
const { GmxApiSdk } = webRequire('@gmx-io/sdk/v2');
const { getDecreasePositionAmounts } = webRequire('@gmx-io/sdk/utils/trade');
const { createPublicClient, createWalletClient, http, parseUnits, formatUnits, formatEther } = webRequire('viem');
const { arbitrum } = webRequire('viem/chains');
const { privateKeyToAccount } = webRequire('viem/accounts');

const PRIVKEY = process.env.TEST_PRIVKEY;
if (!PRIVKEY) {
  console.error('Missing TEST_PRIVKEY in server-futures/.env');
  process.exit(1);
}

// Public RPC; override via ARBITRUM_RPC_URL if you have an Alchemy key
// (recommended — public RPC is heavily rate-limited under multicall load).
const RPC = process.env.ARBITRUM_RPC_URL || 'https://arb1.arbitrum.io/rpc';

const SYNTHETICS_ROUTER = '0x7452c558d45f8afC8c83dAe62C3f8A5BE19c71f6';
const USDC_ADDR = '0xaf88d065e77c8cC2239327C5EDb3A432268e5831';
const MAX_UINT256 = (1n << 256n) - 1n;

const ERC20_ABI = [
  { type: 'function', name: 'allowance', stateMutability: 'view',
    inputs: [{ name: 'owner', type: 'address' }, { name: 'spender', type: 'address' }],
    outputs: [{ type: 'uint256' }] },
  { type: 'function', name: 'approve', stateMutability: 'nonpayable',
    inputs: [{ name: 'spender', type: 'address' }, { name: 'value', type: 'uint256' }],
    outputs: [{ type: 'bool' }] },
  { type: 'function', name: 'balanceOf', stateMutability: 'view',
    inputs: [{ name: 'a', type: 'address' }],
    outputs: [{ type: 'uint256' }] },
];

const account = privateKeyToAccount(PRIVKEY);
// publicClient kept for direct ERC20 reads (balanceOf / allowance). For
// the SDK we DON'T pass publicClient — its internal builder applies the
// SDK's BATCH_CONFIGS multicall coalescing which dramatically lowers
// concurrent-RPC pressure (public RPCs throttle parallel eth_calls hard).
const publicClient = createPublicClient({ chain: arbitrum, transport: http(RPC) });
const walletClient = createWalletClient({ account, chain: arbitrum, transport: http(RPC) });

const sdk = new GmxSdk({
  chainId: 42161,
  rpcUrl: RPC,
  oracleUrl: 'https://arbitrum-api.gmxinfra.io',
  subsquidUrl: 'https://gmx.squids.live/gmx-synthetics-arbitrum:live/api/graphql',
  walletClient,
  // Intentionally omit publicClient — SDK builds its own with batch config.
  account: account.address,
});
sdk.setAccount(account.address);

const apiSdk = new GmxApiSdk({ chainId: 42161 });

// ───── Steps ─────

async function showBalances() {
  console.log('\n── Balances for', account.address, '──');
  const eth = await publicClient.getBalance({ address: account.address });
  const usdc = await publicClient.readContract({
    address: USDC_ADDR, abi: ERC20_ABI, functionName: 'balanceOf', args: [account.address],
  });
  const allowance = await publicClient.readContract({
    address: USDC_ADDR, abi: ERC20_ABI, functionName: 'allowance',
    args: [account.address, SYNTHETICS_ROUTER],
  });
  console.log(`  ETH:        ${formatEther(eth)}`);
  console.log(`  USDC:       ${formatUnits(usdc, 6)}`);
  console.log(`  USDC allow: ${allowance >= MAX_UINT256 / 2n ? 'MAX' : formatUnits(allowance, 6)}`);
  return { eth, usdc, allowance };
}

async function showPositionsAndOrders() {
  console.log('\n── Positions (V2 API) ──');
  const positions = await apiSdk.fetchPositionsInfo({ address: account.address });
  if (!positions.length) console.log('  (none)');
  for (const p of positions) {
    console.log(`  ${p.indexToken?.symbol} ${p.isLong ? 'LONG' : 'SHORT'} | size ${formatUnits(BigInt(p.sizeInUsd || 0), 30).slice(0, 8)} USD | pnl ${formatUnits(BigInt(p.pnlUsd || 0), 30).slice(0, 6)}`);
  }
  console.log('\n── Orders (V2 API) ──');
  const orders = await apiSdk.fetchOrders({ address: account.address });
  if (!orders.length) console.log('  (none)');
  for (const o of orders) {
    console.log(`  ${o.indexToken?.symbol} type=${o.orderType} ${o.isLong ? 'LONG' : 'SHORT'} | size ${formatUnits(BigInt(o.sizeDeltaUsd || 0), 30).slice(0, 8)} USD | trigger ${formatUnits(BigInt(o.triggerPrice || 0), 30).slice(0, 8)}`);
  }
}

async function ensureApprove() {
  console.log('\n── ensure USDC approve ──');
  const current = await publicClient.readContract({
    address: USDC_ADDR, abi: ERC20_ABI, functionName: 'allowance',
    args: [account.address, SYNTHETICS_ROUTER],
  });
  if (current >= MAX_UINT256 / 2n) {
    console.log('  already MAX-approved → skip');
    return;
  }
  console.log('  approving MAX_UINT256 to', SYNTHETICS_ROUTER);
  const hash = await walletClient.writeContract({
    address: USDC_ADDR, abi: ERC20_ABI, functionName: 'approve',
    args: [SYNTHETICS_ROUTER, MAX_UINT256], account,
  });
  console.log('  tx:', hash);
  const r = await publicClient.waitForTransactionReceipt({ hash });
  console.log('  status:', r.status, '| block:', r.blockNumber.toString());
}

async function openTinyLong({ symbol = 'ETH', collateralUsdc = 5, leverage = 2 } = {}) {
  console.log(`\n── opening LONG ${symbol} $${collateralUsdc} ${leverage}x ──`);

  const info = await sdk.markets.getMarketsInfo();
  // GMX V1 SDK uses canonical symbols (`ETH`, `BTC`) on `indexToken.symbol`,
  // even though the underlying long token wraps to WETH/WBTC.
  const market = Object.values(info.marketsInfoData).find(m =>
    !m.isSpotOnly && !m.isDisabled &&
    m.indexToken?.symbol === symbol &&
    m.shortToken?.symbol === 'USDC'
  );
  if (!market) throw new Error(`No USDC-quoted ${symbol} market on GMX`);
  const usdc = Object.values(info.tokensData).find(t => t.symbol === 'USDC');
  console.log('  market:', market.name, '|', market.marketTokenAddress);
  console.log('  usdc :', usdc.address);

  const payAmount = parseUnits(String(collateralUsdc), 6);
  console.log('  payAmount:', String(payAmount), '| leverage(bps):', leverage * 10000);

  await sdk.orders.long({
    marketAddress: market.marketTokenAddress,
    payTokenAddress: usdc.address,
    collateralTokenAddress: usdc.address,
    payAmount,
    leverage: BigInt(leverage * 10000),
    allowedSlippageBps: 100, // 1%
    marketsInfoData: info.marketsInfoData,
    tokensData: info.tokensData,
    skipSimulation: false,
  });
  console.log('  order submitted; keeper will execute in 1-3s');
}

async function closeAllPositions(filterSymbol) {
  console.log('\n── closing positions ──');
  const info = await sdk.markets.getMarketsInfo();
  const constants = await sdk.positions.getPositionsConstants();
  const positionsInfoData = await sdk.positions.getPositionsInfo({
    marketsInfoData: info.marketsInfoData,
    tokensData: info.tokensData,
    showPnlInLeverage: false,
  });
  const allPositions = Object.values(positionsInfoData);
  const targets = filterSymbol
    ? allPositions.filter(p => String(p.indexToken?.symbol).toUpperCase() === filterSymbol.toUpperCase())
    : allPositions;
  if (!targets.length) { console.log('  (no positions)'); return; }
  for (const position of targets) {
    console.log(`  closing ${position.indexToken.symbol} ${position.isLong ? 'LONG' : 'SHORT'} size=${formatUnits(BigInt(position.sizeInUsd), 30).slice(0, 8)}`);
    const decreaseAmounts = getDecreasePositionAmounts({
      marketInfo: position.marketInfo,
      collateralToken: position.collateralToken,
      isLong: position.isLong,
      position,
      closeSizeUsd: BigInt(position.sizeInUsd),
      keepLeverage: false,
      triggerPrice: undefined,
      userReferralInfo: undefined,
      minCollateralUsd: constants.minCollateralUsd ?? 0n,
      minPositionSizeUsd: constants.minPositionSizeUsd ?? 0n,
      uiFeeFactor: 0n,
      triggerOrderType: undefined,
    });
    await sdk.orders.createDecreaseOrder({
      marketsInfoData: info.marketsInfoData,
      tokensData: info.tokensData,
      marketInfo: position.marketInfo,
      decreaseAmounts,
      collateralToken: position.collateralToken,
      allowedSlippage: 100,
      isLong: position.isLong,
      isTrigger: false,
    });
    console.log('    decrease order submitted');
  }
}

async function setTpSl({ symbol = 'ETH', isLong = true, tpPct = 5, slPct = 3 } = {}) {
  // Read current mark, derive TP/SL prices from percentages, submit two
  // trigger-decrease orders. Mirrors useGmx.setTpsl().
  console.log(`\n── set TP/SL on ${isLong ? 'LONG' : 'SHORT'} ${symbol} (TP +${tpPct}%, SL -${slPct}%) ──`);
  const info = await sdk.markets.getMarketsInfo();
  const constants = await sdk.positions.getPositionsConstants();
  const positionsInfoData = await sdk.positions.getPositionsInfo({
    marketsInfoData: info.marketsInfoData,
    tokensData: info.tokensData,
    showPnlInLeverage: false,
  });
  const position = Object.values(positionsInfoData).find(p =>
    p.indexToken?.symbol === symbol && p.isLong === isLong
  );
  if (!position) throw new Error(`No open ${symbol} position to attach TP/SL to`);
  const markPrice = BigInt(position.markPrice);
  const indexDecimals = Number(position.indexToken?.decimals || 18);
  // markPrice is 30-decimal USD-per-base. ±pct in same units.
  const tpPrice = isLong
    ? (markPrice * BigInt(10000 + tpPct * 100)) / 10000n
    : (markPrice * BigInt(10000 - tpPct * 100)) / 10000n;
  const slPrice = isLong
    ? (markPrice * BigInt(10000 - slPct * 100)) / 10000n
    : (markPrice * BigInt(10000 + slPct * 100)) / 10000n;
  console.log(`  mark: ${formatUnits(markPrice, 30 - indexDecimals).slice(0, 8)} | TP: ${formatUnits(tpPrice, 30 - indexDecimals).slice(0, 8)} | SL: ${formatUnits(slPrice, 30 - indexDecimals).slice(0, 8)}`);

  const { OrderType } = webRequire('@gmx-io/sdk/types/orders');
  const submit = async (triggerPrice, orderType, label) => {
    const decreaseAmounts = getDecreasePositionAmounts({
      marketInfo: position.marketInfo,
      collateralToken: position.collateralToken,
      isLong: position.isLong,
      position,
      closeSizeUsd: BigInt(position.sizeInUsd),
      keepLeverage: false,
      triggerPrice,
      userReferralInfo: undefined,
      minCollateralUsd: constants.minCollateralUsd ?? 0n,
      minPositionSizeUsd: constants.minPositionSizeUsd ?? 0n,
      uiFeeFactor: 0n,
      triggerOrderType: orderType,
    });
    await sdk.orders.createDecreaseOrder({
      marketsInfoData: info.marketsInfoData,
      tokensData: info.tokensData,
      marketInfo: position.marketInfo,
      decreaseAmounts,
      collateralToken: position.collateralToken,
      allowedSlippage: 100,
      isLong: position.isLong,
      isTrigger: true,
    });
    console.log(`  ${label} submitted`);
  };
  await submit(tpPrice, OrderType.LimitDecrease, 'TP');
  await submit(slPrice, OrderType.StopLossDecrease, 'SL');
}

async function cancelAllOrders() {
  console.log('\n── cancel all open orders ──');
  const orders = await apiSdk.fetchOrders({ address: account.address });
  const keys = (orders || []).map(o => o.key).filter(Boolean);
  if (!keys.length) { console.log('  (none)'); return; }
  console.log('  cancelling', keys.length, 'order(s)');
  await sdk.orders.cancelOrders(keys);
  console.log('  cancellation tx submitted');
}

async function partialCloseDemo() {
  console.log('\n── partial close 50% ETH LONG ──');
  const info = await sdk.markets.getMarketsInfo();
  const constants = await sdk.positions.getPositionsConstants();
  const positionsInfoData = await sdk.positions.getPositionsInfo({
    marketsInfoData: info.marketsInfoData,
    tokensData: info.tokensData,
    showPnlInLeverage: false,
  });
  const position = Object.values(positionsInfoData).find(p =>
    p.indexToken?.symbol === 'ETH' && p.isLong === true
  );
  if (!position) { console.log('  (no position)'); return; }
  const sizeBefore = BigInt(position.sizeInUsd);
  const closeHalf = sizeBefore / 2n;
  const decreaseAmounts = getDecreasePositionAmounts({
    marketInfo: position.marketInfo,
    collateralToken: position.collateralToken,
    isLong: position.isLong,
    position,
    closeSizeUsd: closeHalf,
    keepLeverage: false,
    triggerPrice: undefined,
    userReferralInfo: undefined,
    minCollateralUsd: constants.minCollateralUsd ?? 0n,
    minPositionSizeUsd: constants.minPositionSizeUsd ?? 0n,
    uiFeeFactor: 0n,
    triggerOrderType: undefined,
  });
  await sdk.orders.createDecreaseOrder({
    marketsInfoData: info.marketsInfoData,
    tokensData: info.tokensData,
    marketInfo: position.marketInfo,
    decreaseAmounts,
    collateralToken: position.collateralToken,
    allowedSlippage: 100,
    isLong: position.isLong,
    isTrigger: false,
  });
  console.log(`  closing ${formatUnits(closeHalf, 30).slice(0, 6)} of ${formatUnits(sizeBefore, 30).slice(0, 6)} USD`);
}

// ───── Dispatch ─────

(async () => {
  const cmd = process.argv[2] || 'info';
  console.log(`\n== test-gmx (${cmd}) ==`);
  await showBalances();

  if (cmd === 'info') {
    await showPositionsAndOrders();
  } else if (cmd === 'approve') {
    await ensureApprove();
    await showBalances();
  } else if (cmd === 'open') {
    await ensureApprove();
    await openTinyLong({ symbol: 'ETH', collateralUsdc: 5, leverage: 2 });
    console.log('\nwaiting 6s for keeper...');
    await new Promise(r => setTimeout(r, 6000));
    await showPositionsAndOrders();
  } else if (cmd === 'close') {
    await closeAllPositions(process.argv[3]);
    console.log('\nwaiting 6s for keeper...');
    await new Promise(r => setTimeout(r, 6000));
    await showPositionsAndOrders();
  } else if (cmd === 'full') {
    await ensureApprove();
    await openTinyLong({ symbol: 'ETH', collateralUsdc: 5, leverage: 2 });
    console.log('\nwaiting 8s for keeper...');
    await new Promise(r => setTimeout(r, 8000));
    await showPositionsAndOrders();
    console.log('\nclosing in 5s...');
    await new Promise(r => setTimeout(r, 5000));
    await closeAllPositions('ETH');
    console.log('\nwaiting 8s for close keeper...');
    await new Promise(r => setTimeout(r, 8000));
    await showPositionsAndOrders();
    await showBalances();
  } else if (cmd === 'tpsl') {
    // Open a small position, attach TP/SL, verify orders, cancel, close.
    await ensureApprove();
    await openTinyLong({ symbol: 'ETH', collateralUsdc: 3, leverage: 2 });
    console.log('\nwaiting 10s for keeper...');
    await new Promise(r => setTimeout(r, 10000));
    await showPositionsAndOrders();
    await setTpSl({ symbol: 'ETH', isLong: true, tpPct: 5, slPct: 3 });
    console.log('\nwaiting 6s for trigger orders to register...');
    await new Promise(r => setTimeout(r, 6000));
    await showPositionsAndOrders();
    await cancelAllOrders();
    console.log('\nwaiting 6s for cancel...');
    await new Promise(r => setTimeout(r, 6000));
    await showPositionsAndOrders();
    await closeAllPositions('ETH');
    console.log('\nwaiting 8s for close keeper...');
    await new Promise(r => setTimeout(r, 8000));
    await showPositionsAndOrders();
    await showBalances();
  } else if (cmd === 'partial') {
    // Open, half-close, verify size shrunk, full-close.
    await ensureApprove();
    await openTinyLong({ symbol: 'ETH', collateralUsdc: 3, leverage: 2 });
    console.log('\nwaiting 10s for open keeper...');
    await new Promise(r => setTimeout(r, 10000));
    await showPositionsAndOrders();
    await partialCloseDemo();
    console.log('\nwaiting 8s for partial close keeper...');
    await new Promise(r => setTimeout(r, 8000));
    await showPositionsAndOrders();
    await closeAllPositions('ETH');
    console.log('\nwaiting 8s for full close keeper...');
    await new Promise(r => setTimeout(r, 8000));
    await showPositionsAndOrders();
    await showBalances();
  } else {
    console.log('Unknown cmd. Use: info | approve | open | close [SYM] | full | tpsl | partial');
  }
})().catch(e => {
  console.error('\n[FATAL]', e?.shortMessage || e?.message || e);
  if (e?.cause?.shortMessage) console.error('  cause:', e.cause.shortMessage);
  process.exit(1);
});
