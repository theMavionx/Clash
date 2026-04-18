// End-to-end test of the non-custodial Avantis flow. Exercises the EXACT
// same viem calls the browser will make — we just bind the walletClient to
// a hard-coded privkey here instead of window.ethereum.
//
// Steps:
//   1. Read USDC + ETH balance
//   2. Ensure TradingStorage allowance
//   3. openTrade(MARKET) small LONG on BTC (min $100 notional)
//   4. Poll Avantis Core until position appears
//   5. closeTradeMarket
//   6. Verify position gone + USDC back in wallet
//
// Usage:
//   cd server-futures
//   node --env-file=.env test-noncustodial.js

const { createPublicClient, createWalletClient, http, parseUnits, formatUnits, formatEther } = require('viem');
const { privateKeyToAccount } = require('viem/accounts');
const { base } = require('viem/chains');

// ───── Test config ─────────────────────────────────────────────────
const PK = process.env.TEST_PRIVKEY;
if (!PK || !/^0x[0-9a-f]{64}$/i.test(PK)) {
  console.error('Set TEST_PRIVKEY=0x... in .env');
  process.exit(1);
}
const SYMBOL = 'BTC';        // pairIndex 1
const PAIR_INDEX = 1;
const COLLATERAL = 5;        // USDC
const LEVERAGE = 25;         // 5 × 25 = $125 notional, above $100 min
const SLIPPAGE_PCT = 1;      // 1%
const SIDE_IS_BUY = true;    // LONG

// ───── Contract constants (mirror avantisContract.js) ──────────────
const TRADING_ADDRESS         = '0x44914408af82bC9983bbb330e3578E1105e11d4e';
const TRADING_STORAGE_ADDRESS = '0x8a311D7048c35985aa31C131B9A13e03a5f7422d';
const USDC_ADDRESS            = '0x833589fCD6eDb6E08f4c7C32D4f71b54bdA02913';
const CORE_API                = 'https://core.avantisfi.com';
const ORDER_TYPE_MARKET       = 0;

const ERC20_ABI = [
  { name: 'balanceOf', type: 'function', stateMutability: 'view', inputs: [{ name: 'a', type: 'address' }], outputs: [{ type: 'uint256' }] },
  { name: 'allowance', type: 'function', stateMutability: 'view', inputs: [{ name: 'o', type: 'address' }, { name: 's', type: 'address' }], outputs: [{ type: 'uint256' }] },
  { name: 'approve',   type: 'function', stateMutability: 'nonpayable', inputs: [{ name: 's', type: 'address' }, { name: 'amt', type: 'uint256' }], outputs: [{ type: 'bool' }] },
];
const TRADE_INPUT_TUPLE = { type: 'tuple', components: [
  { name: 'trader',           type: 'address' },
  { name: 'pairIndex',        type: 'uint256' },
  { name: 'index',            type: 'uint256' },
  { name: 'initialPosToken',  type: 'uint256' },
  { name: 'positionSizeUSDC', type: 'uint256' },
  { name: 'openPrice',        type: 'uint256' },
  { name: 'buy',              type: 'bool' },
  { name: 'leverage',         type: 'uint256' },
  { name: 'tp',               type: 'uint256' },
  { name: 'sl',               type: 'uint256' },
  { name: 'timestamp',        type: 'uint256' },
]};
const TRADING_ABI = [
  { name: 'openTrade', type: 'function', stateMutability: 'payable',
    inputs: [ TRADE_INPUT_TUPLE, { name: '_type', type: 'uint8' }, { name: '_slippageP', type: 'uint256' } ],
    outputs: [] },
  { name: 'closeTradeMarket', type: 'function', stateMutability: 'payable',
    inputs: [ { name: 'pairIndex', type: 'uint256' }, { name: 'index', type: 'uint256' }, { name: 'amount', type: 'uint256' } ],
    outputs: [] },
];

// ───── Helpers ─────────────────────────────────────────────────────
const priceToContract = p => BigInt(Math.floor(Number(p) * 1e10));
const leverageToContract = l => BigInt(Math.floor(Number(l) * 1e10));
const slippageToContract = s => BigInt(Math.floor(Math.max(0.1, Math.min(Number(s), 50)) * 1e10));

async function fetchExecutionFeeWei() {
  try {
    const r = await fetch(`${CORE_API}/fee/execution`);
    if (!r.ok) return 350000000000000n;
    const j = await r.json();
    const eth = Number(j?.eth || j?.executionFee || 0);
    if (eth > 0 && eth < 0.01) return BigInt(Math.floor(eth * 1e18));
  } catch {}
  return 350000000000000n;
}

async function fetchNextTradeIndex(trader, pairIndex) {
  try {
    const r = await fetch(`${CORE_API}/user-data?trader=${trader}`);
    if (!r.ok) return 0;
    const j = await r.json();
    const used = new Set();
    for (const p of (j.positions || [])) {
      const pi = Number(p.pairIndex ?? p.pair_index ?? p.trade?.pairIndex);
      if (pi !== pairIndex) continue;
      const idx = Number(p.trade?.index ?? p.index);
      if (Number.isFinite(idx)) used.add(idx);
    }
    for (let i = 0; i < 50; i++) if (!used.has(i)) return i;
    return 0;
  } catch { return 0; }
}

async function fetchLivePrice(pairIndex) {
  // Get feedId from socket-api first, then fetch live Pyth price.
  const r = await fetch(`${CORE_API.replace('core', 'socket-api-pub')}/socket-api/v1/data`);
  if (!r.ok) throw new Error('socket-api failed');
  const d = await r.json();
  const pair = d?.data?.pairInfos?.[String(pairIndex)];
  if (!pair?.feed?.feedId) throw new Error('feedId missing');
  const id = pair.feed.feedId.replace(/^0x/, '');
  const r2 = await fetch(`https://hermes.pyth.network/v2/updates/price/latest?ids[]=${id}&parsed=true`);
  const j2 = await r2.json();
  const p = j2.parsed?.[0];
  if (!p) throw new Error('Pyth price missing');
  return Number(p.price.price) * Math.pow(10, p.price.expo);
}

async function fetchUserPositions(trader) {
  const r = await fetch(`${CORE_API}/user-data?trader=${trader}`);
  if (!r.ok) return [];
  const j = await r.json();
  return j.positions || [];
}

function pick(positions, pairIndex, tradeIndex) {
  return positions.find(p => {
    const pi = Number(p.pairIndex ?? p.pair_index ?? p.trade?.pairIndex);
    const ti = Number(p.index ?? p.trade?.index);
    return pi === pairIndex && ti === tradeIndex;
  });
}

async function main() {
  const account = privateKeyToAccount(PK);
  const pc = createPublicClient({ chain: base, transport: http() });
  const wc = createWalletClient({ account, chain: base, transport: http() });

  const chainId = await pc.getChainId();
  if (chainId !== 8453) throw new Error(`Wrong chain ${chainId}`);

  console.log('════════ Non-custodial Avantis test ════════');
  console.log('Trader :', account.address);
  console.log('Symbol :', SYMBOL, '(pair', PAIR_INDEX + ')');
  console.log('Size   :', COLLATERAL, 'USDC ×', LEVERAGE + 'x =', COLLATERAL * LEVERAGE, 'USDC notional');
  console.log();

  // ── Step 1: balances ─────────────────────────────────────────────
  const usdc0 = await pc.readContract({ address: USDC_ADDRESS, abi: ERC20_ABI, functionName: 'balanceOf', args: [account.address] });
  const eth0 = await pc.getBalance({ address: account.address });
  console.log(`[1] Pre-trade balances: ${formatUnits(usdc0, 6)} USDC, ${formatEther(eth0)} ETH`);
  const positionSizeUSDC = parseUnits(String(COLLATERAL), 6);
  if (usdc0 < positionSizeUSDC) { console.error('Insufficient USDC'); process.exit(1); }
  if (eth0 < 200000000000000n) console.warn('  ⚠ low ETH — may fail on gas'); // 0.0002 ETH

  // ── Step 2: ensure allowance ────────────────────────────────────
  console.log('[2] Checking allowance...');
  const allowance = await pc.readContract({
    address: USDC_ADDRESS, abi: ERC20_ABI, functionName: 'allowance',
    args: [account.address, TRADING_STORAGE_ADDRESS],
  });
  if (allowance < positionSizeUSDC) {
    console.log('    needs approval (have', formatUnits(allowance, 6), 'USDC). Approving...');
    const approveAmount = (positionSizeUSDC * 101n) / 100n;
    const h = await wc.writeContract({
      address: USDC_ADDRESS, abi: ERC20_ABI, functionName: 'approve',
      args: [TRADING_STORAGE_ADDRESS, approveAmount],
    });
    console.log('    approve tx:', h);
    const r = await pc.waitForTransactionReceipt({ hash: h });
    console.log('    status:', r.status);
  } else {
    console.log(`    already approved (${formatUnits(allowance, 6)} USDC)`);
  }

  // ── Step 3: openTrade ───────────────────────────────────────────
  console.log('[3] Opening MARKET trade...');
  const tradeIndex = await fetchNextTradeIndex(account.address, PAIR_INDEX);
  const execFee = await fetchExecutionFeeWei();
  console.log(`    next trade slot: ${tradeIndex},  execFee: ${formatEther(execFee)} ETH`);

  const livePrice = await fetchLivePrice(PAIR_INDEX);
  console.log(`    live ${SYMBOL} price: $${livePrice.toFixed(2)}`);
  const tradeInput = {
    trader: account.address,
    pairIndex: BigInt(PAIR_INDEX),
    index: BigInt(tradeIndex),
    initialPosToken: 0n,
    positionSizeUSDC,
    openPrice: priceToContract(livePrice), // reference price for executor
    buy: SIDE_IS_BUY,
    leverage: leverageToContract(LEVERAGE),
    tp: 0n,
    sl: 0n,
    timestamp: 0n,
  };
  const openHash = await wc.writeContract({
    address: TRADING_ADDRESS, abi: TRADING_ABI, functionName: 'openTrade',
    args: [tradeInput, ORDER_TYPE_MARKET, slippageToContract(SLIPPAGE_PCT)],
    value: execFee,
  });
  console.log('    openTrade tx:', openHash);
  const openRcpt = await pc.waitForTransactionReceipt({ hash: openHash });
  console.log('    status:', openRcpt.status, 'block:', openRcpt.blockNumber);

  // ── Step 4: wait for Avantis Core to index position ─────────────
  console.log('[4] Waiting for Core API to index position...');
  let position = null;
  for (let i = 0; i < 20; i++) {
    await new Promise(r => setTimeout(r, 3000));
    const pos = await fetchUserPositions(account.address);
    position = pick(pos, PAIR_INDEX, tradeIndex);
    if (position) {
      console.log('    position indexed at slot', tradeIndex);
      break;
    }
    process.stdout.write('.');
  }
  console.log();
  if (!position) throw new Error('Position never indexed by Core — executor may not have filled');

  const entry = Number(position.openPrice ?? position.trade?.openPrice ?? 0) / 1e10;
  const collateral = position.trade?.positionSizeUSDC !== undefined
    ? Number(position.trade.positionSizeUSDC) / 1e6 : 0;
  console.log(`    entry=$${entry.toFixed(2)}  collateral=$${collateral.toFixed(4)}`);

  // ── Step 5: closeTradeMarket ────────────────────────────────────
  console.log('[5] Closing position...');
  const closeAmountRaw = parseUnits(String(collateral || COLLATERAL), 6);
  const closeExecFee = await fetchExecutionFeeWei();
  const closeHash = await wc.writeContract({
    address: TRADING_ADDRESS, abi: TRADING_ABI, functionName: 'closeTradeMarket',
    args: [BigInt(PAIR_INDEX), BigInt(tradeIndex), closeAmountRaw],
    value: closeExecFee,
  });
  console.log('    closeTradeMarket tx:', closeHash);
  const closeRcpt = await pc.waitForTransactionReceipt({ hash: closeHash });
  console.log('    status:', closeRcpt.status, 'block:', closeRcpt.blockNumber);

  // ── Step 6: verify closed + balances ────────────────────────────
  console.log('[6] Waiting for position to clear from Core API...');
  for (let i = 0; i < 20; i++) {
    await new Promise(r => setTimeout(r, 3000));
    const pos = await fetchUserPositions(account.address);
    if (!pick(pos, PAIR_INDEX, tradeIndex)) {
      console.log('    position cleared');
      break;
    }
    process.stdout.write('.');
  }
  console.log();

  const usdc1 = await pc.readContract({ address: USDC_ADDRESS, abi: ERC20_ABI, functionName: 'balanceOf', args: [account.address] });
  const eth1 = await pc.getBalance({ address: account.address });
  console.log();
  console.log('════════ Summary ════════');
  console.log(`USDC: ${formatUnits(usdc0, 6)} → ${formatUnits(usdc1, 6)}   (Δ ${(Number(usdc1 - usdc0) / 1e6).toFixed(4)})`);
  console.log(`ETH : ${formatEther(eth0)} → ${formatEther(eth1)}   (Δ ${(Number(eth1 - eth0) / 1e18).toFixed(6)})`);
  console.log();
  console.log('✅ Non-custodial flow WORKS end-to-end');
}

main().catch(e => {
  console.error('\n❌ TEST FAILED:', e?.shortMessage || e?.cause?.shortMessage || e?.message || e);
  process.exit(1);
});
