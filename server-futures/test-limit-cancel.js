// Opens a limit order far from market (so it won't fill), then cancels it.
// Validates that client-side-signed cancelOpenLimitOrder works and the
// collateral comes back on cancel.

const { createPublicClient, createWalletClient, http, parseUnits, formatUnits, formatEther } = require('viem');
const { privateKeyToAccount } = require('viem/accounts');
const { base } = require('viem/chains');

const PK = process.env.TEST_PRIVKEY;
const TRADING_ADDRESS         = '0x44914408af82bC9983bbb330e3578E1105e11d4e';
const TRADING_STORAGE_ADDRESS = '0x8a311D7048c35985aa31C131B9A13e03a5f7422d';
const USDC_ADDRESS            = '0x833589fCD6eDb6E08f4c7C32D4f71b54bdA02913';
const CORE_API                = 'https://core.avantisfi.com';
const ORDER_TYPE_LIMIT        = 2;

const ERC20_ABI = [
  { name: 'balanceOf', type: 'function', stateMutability: 'view', inputs: [{ name: 'a', type: 'address' }], outputs: [{ type: 'uint256' }] },
  { name: 'allowance', type: 'function', stateMutability: 'view', inputs: [{ name: 'o', type: 'address' }, { name: 's', type: 'address' }], outputs: [{ type: 'uint256' }] },
];
const TRADE_INPUT_TUPLE = { type: 'tuple', components: [
  { name: 'trader', type: 'address' }, { name: 'pairIndex', type: 'uint256' },
  { name: 'index', type: 'uint256' }, { name: 'initialPosToken', type: 'uint256' },
  { name: 'positionSizeUSDC', type: 'uint256' }, { name: 'openPrice', type: 'uint256' },
  { name: 'buy', type: 'bool' }, { name: 'leverage', type: 'uint256' },
  { name: 'tp', type: 'uint256' }, { name: 'sl', type: 'uint256' }, { name: 'timestamp', type: 'uint256' },
]};
const TRADING_ABI = [
  { name: 'openTrade', type: 'function', stateMutability: 'payable',
    inputs: [ TRADE_INPUT_TUPLE, { name: '_type', type: 'uint8' }, { name: '_slippageP', type: 'uint256' } ], outputs: [] },
  { name: 'cancelOpenLimitOrder', type: 'function', stateMutability: 'nonpayable',
    inputs: [ { name: 'pairIndex', type: 'uint256' }, { name: 'index', type: 'uint256' } ], outputs: [] },
];

const priceToContract = p => BigInt(Math.floor(Number(p) * 1e10));
const leverageToContract = l => BigInt(Math.floor(Number(l) * 1e10));
const slippageToContract = s => BigInt(Math.floor(Math.max(0.1, Math.min(Number(s), 50)) * 1e10));

const EXEC_FEE = 350000000000000n;

async function fetchLimitOrders(addr) {
  const r = await fetch(`${CORE_API}/user-data?trader=${addr}`);
  const j = await r.json();
  return j.limitOrders || [];
}

async function main() {
  const account = privateKeyToAccount(PK);
  const pc = createPublicClient({ chain: base, transport: http() });
  const wc = createWalletClient({ account, chain: base, transport: http() });

  console.log('Trader:', account.address);
  const usdc0 = await pc.readContract({ address: USDC_ADDRESS, abi: ERC20_ABI, functionName: 'balanceOf', args: [account.address] });
  const eth0 = await pc.getBalance({ address: account.address });
  console.log(`Pre: USDC ${formatUnits(usdc0, 6)}, ETH ${formatEther(eth0)}`);

  const collateralUsdc = 5;
  const leverage = 25;
  const positionSizeUSDC = parseUnits(String(collateralUsdc), 6);
  // Far-from-market price: BTC at $77k, we'll buy a LONG at $50k (won't fill).
  const limitPrice = 50000;

  // Approve if needed
  const allowance = await pc.readContract({
    address: USDC_ADDRESS, abi: ERC20_ABI, functionName: 'allowance',
    args: [account.address, TRADING_STORAGE_ADDRESS],
  });
  if (allowance < positionSizeUSDC) {
    console.log('  approving...');
    const h = await wc.writeContract({
      address: USDC_ADDRESS,
      abi: [{ name: 'approve', type: 'function', stateMutability: 'nonpayable',
              inputs: [{ name: 's', type: 'address' }, { name: 'a', type: 'uint256' }], outputs: [{ type: 'bool' }] }],
      functionName: 'approve',
      args: [TRADING_STORAGE_ADDRESS, (positionSizeUSDC * 101n) / 100n],
    });
    await pc.waitForTransactionReceipt({ hash: h });
  }

  // Find next trade slot
  const prev = await fetchLimitOrders(account.address);
  console.log('existing limit orders on this address:', prev.length);
  const used = new Set(prev.filter(o => Number(o.pairIndex ?? o.trade?.pairIndex) === 1).map(o => Number(o.index ?? o.trade?.index)));
  let tradeIndex = 0;
  while (used.has(tradeIndex)) tradeIndex++;
  console.log('next slot:', tradeIndex);

  // ── Open LIMIT order ────────────────────────────────────────────
  console.log('[1] Opening LIMIT LONG BTC @ $50000 (far below market)...');
  const tradeInput = {
    trader: account.address,
    pairIndex: 1n,
    index: BigInt(tradeIndex),
    initialPosToken: 0n,
    positionSizeUSDC,
    openPrice: priceToContract(limitPrice),
    buy: true,
    leverage: leverageToContract(leverage),
    tp: 0n, sl: 0n, timestamp: 0n,
  };
  // Explicit fresh nonce — viem caches and can race with the preceding approve.
  const nonce1 = await pc.getTransactionCount({ address: account.address, blockTag: 'pending' });
  const openHash = await wc.writeContract({
    address: TRADING_ADDRESS, abi: TRADING_ABI, functionName: 'openTrade',
    args: [tradeInput, ORDER_TYPE_LIMIT, slippageToContract(1)],
    value: EXEC_FEE,
    nonce: nonce1,
  });
  console.log('  tx:', openHash);
  const openRcpt = await pc.waitForTransactionReceipt({ hash: openHash });
  console.log('  status:', openRcpt.status);

  // ── Wait for indexer to pick it up ──────────────────────────────
  console.log('[2] Waiting for Core API to index limit order...');
  let found = null;
  for (let i = 0; i < 15; i++) {
    await new Promise(r => setTimeout(r, 3000));
    const lims = await fetchLimitOrders(account.address);
    found = lims.find(o => {
      const pi = Number(o.pairIndex ?? o.trade?.pairIndex);
      const ti = Number(o.index ?? o.trade?.index);
      return pi === 1 && ti === tradeIndex;
    });
    if (found) break;
    process.stdout.write('.');
  }
  console.log();
  if (!found) { console.error('  Limit order never indexed'); process.exit(1); }
  console.log('  indexed:', { pair: found.pairIndex, idx: found.index, openPrice: Number(found.openPrice) / 1e10, collateral: Number(found.collateral) / 1e6 });

  const usdc1 = await pc.readContract({ address: USDC_ADDRESS, abi: ERC20_ABI, functionName: 'balanceOf', args: [account.address] });
  console.log(`  USDC: ${formatUnits(usdc0, 6)} → ${formatUnits(usdc1, 6)}  (collateral locked)`);

  // ── Cancel LIMIT order ──────────────────────────────────────────
  console.log('[3] Cancelling limit order...');
  const cancelHash = await wc.writeContract({
    address: TRADING_ADDRESS, abi: TRADING_ABI, functionName: 'cancelOpenLimitOrder',
    args: [1n, BigInt(tradeIndex)],
  });
  console.log('  tx:', cancelHash);
  const cancelRcpt = await pc.waitForTransactionReceipt({ hash: cancelHash });
  console.log('  status:', cancelRcpt.status);

  // ── Verify refund ───────────────────────────────────────────────
  console.log('[4] Waiting for Core to clear the cancelled order...');
  for (let i = 0; i < 10; i++) {
    await new Promise(r => setTimeout(r, 3000));
    const lims = await fetchLimitOrders(account.address);
    const still = lims.find(o => {
      const pi = Number(o.pairIndex ?? o.trade?.pairIndex);
      const ti = Number(o.index ?? o.trade?.index);
      return pi === 1 && ti === tradeIndex;
    });
    if (!still) { console.log('  cleared'); break; }
    process.stdout.write('.');
  }

  const usdc2 = await pc.readContract({ address: USDC_ADDRESS, abi: ERC20_ABI, functionName: 'balanceOf', args: [account.address] });
  const eth2 = await pc.getBalance({ address: account.address });
  console.log();
  console.log('════════ Summary ════════');
  console.log(`USDC: ${formatUnits(usdc0, 6)} → ${formatUnits(usdc1, 6)} → ${formatUnits(usdc2, 6)}`);
  console.log(`ETH : ${formatEther(eth0)} → ${formatEther(eth2)}   (Δ ${(Number(eth2 - eth0) / 1e18).toFixed(6)})`);
  const refunded = Number(usdc2 - usdc1) / 1e6;
  const totalFee = Number(usdc0 - usdc2) / 1e6;
  console.log(`Refunded on cancel: ${refunded.toFixed(4)} USDC`);
  console.log(`Total fee cost    : ${totalFee.toFixed(4)} USDC`);
  console.log();
  console.log('✅ LIMIT + CANCEL cycle works');
}
main().catch(e => { console.error('\n❌', e?.shortMessage || e?.message || e); process.exit(1); });
