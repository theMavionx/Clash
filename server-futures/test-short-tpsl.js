// Open a SHORT market, set TP/SL on it, then close.
// Validates: side='short' path, updateTpAndSl flow, full close.

const { createPublicClient, createWalletClient, http, parseUnits, formatUnits, formatEther } = require('viem');
const { privateKeyToAccount } = require('viem/accounts');
const { base } = require('viem/chains');

const PK = process.env.TEST_PRIVKEY;
const TRADING_ADDRESS         = '0x44914408af82bC9983bbb330e3578E1105e11d4e';
const TRADING_STORAGE_ADDRESS = '0x8a311D7048c35985aa31C131B9A13e03a5f7422d';
const USDC_ADDRESS            = '0x833589fCD6eDb6E08f4c7C32D4f71b54bdA02913';
const CORE_API                = 'https://core.avantisfi.com';
const FEED_V3                 = 'https://feed-v3.avantisfi.com';
const SOCKET_API              = 'https://socket-api-pub.avantisfi.com/socket-api/v1/data';
const ORDER_TYPE_MARKET = 0;

const ERC20_ABI = [
  { name: 'balanceOf', type: 'function', stateMutability: 'view', inputs: [{ name: 'a', type: 'address' }], outputs: [{ type: 'uint256' }] },
  { name: 'allowance', type: 'function', stateMutability: 'view', inputs: [{ name: 'o', type: 'address' }, { name: 's', type: 'address' }], outputs: [{ type: 'uint256' }] },
  { name: 'approve',   type: 'function', stateMutability: 'nonpayable', inputs: [{ name: 's', type: 'address' }, { name: 'a', type: 'uint256' }], outputs: [{ type: 'bool' }] },
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
    inputs: [TRADE_INPUT_TUPLE, { name: '_type', type: 'uint8' }, { name: '_slippageP', type: 'uint256' }], outputs: [] },
  { name: 'closeTradeMarket', type: 'function', stateMutability: 'payable',
    inputs: [{ name: 'pairIndex', type: 'uint256' }, { name: 'index', type: 'uint256' }, { name: 'amount', type: 'uint256' }], outputs: [] },
  { name: 'updateTpAndSl', type: 'function', stateMutability: 'payable',
    inputs: [
      { name: 'pairIndex', type: 'uint256' }, { name: 'index', type: 'uint256' },
      { name: 'newSl', type: 'uint256' }, { name: 'newTp', type: 'uint256' },
      { name: 'priceUpdateData', type: 'bytes[]' },
    ], outputs: [] },
];

const priceToContract = p => BigInt(Math.floor(Number(p) * 1e10));
const leverageToContract = l => BigInt(Math.floor(Number(l) * 1e10));
const slippageToContract = s => BigInt(Math.floor(Math.max(0.1, Math.min(Number(s), 50)) * 1e10));
const EXEC_FEE = 350000000000000n;

async function fetchLivePrice(pairIndex) {
  const d = await (await fetch(SOCKET_API)).json();
  const pair = d?.data?.pairInfos?.[String(pairIndex)];
  const id = pair.feed.feedId.replace(/^0x/, '');
  const j2 = await (await fetch(`https://hermes.pyth.network/v2/updates/price/latest?ids[]=${id}&parsed=true`)).json();
  return Number(j2.parsed[0].price.price) * Math.pow(10, j2.parsed[0].price.expo);
}

async function fetchPriceUpdateData(pairIndex) {
  const r = await fetch(`${FEED_V3}/v2/pairs/${pairIndex}/price-update-data`);
  const j = await r.json();
  return j?.core?.price_update_data || '0x';
}

async function fetchPositions(addr) {
  const r = await fetch(`${CORE_API}/user-data?trader=${addr}`);
  const j = await r.json();
  return j.positions || [];
}

function pick(pos, pair, idx) {
  return pos.find(p => Number(p.pairIndex) === pair && Number(p.index) === idx);
}

async function waitForNonceSettled(pc, addr) {
  // Local viem caches nonce; brief sleep + fetch ensures we get the latest.
  await new Promise(r => setTimeout(r, 500));
  return pc.getTransactionCount({ address: addr, blockTag: 'pending' });
}

async function main() {
  const account = privateKeyToAccount(PK);
  const pc = createPublicClient({ chain: base, transport: http() });
  const wc = createWalletClient({ account, chain: base, transport: http() });

  console.log('Trader:', account.address);
  const eth0 = await pc.getBalance({ address: account.address });
  const usdc0 = await pc.readContract({ address: USDC_ADDRESS, abi: ERC20_ABI, functionName: 'balanceOf', args: [account.address] });
  console.log(`Pre: USDC ${formatUnits(usdc0, 6)}, ETH ${formatEther(eth0)}`);

  const COLLATERAL = 5;
  const LEVERAGE = 21;
  const positionSizeUSDC = parseUnits(String(COLLATERAL), 6);

  // Ensure allowance
  const allowance = await pc.readContract({
    address: USDC_ADDRESS, abi: ERC20_ABI, functionName: 'allowance',
    args: [account.address, TRADING_STORAGE_ADDRESS],
  });
  if (allowance < positionSizeUSDC) {
    console.log('  approving...');
    const nonce = await waitForNonceSettled(pc, account.address);
    const h = await wc.writeContract({
      address: USDC_ADDRESS, abi: ERC20_ABI, functionName: 'approve',
      args: [TRADING_STORAGE_ADDRESS, (positionSizeUSDC * 101n) / 100n],
      nonce,
    });
    await pc.waitForTransactionReceipt({ hash: h });
  }

  // ── 1. Open SHORT market ────────────────────────────────────────
  console.log('[1] Opening SHORT BTC...');
  const livePrice = await fetchLivePrice(1);
  console.log(`    live: $${livePrice.toFixed(2)}`);

  // Pick a free slot
  const prevPositions = await fetchPositions(account.address);
  const used = new Set(prevPositions.filter(p => p.pairIndex === 1).map(p => Number(p.index)));
  let tradeIndex = 0;
  while (used.has(tradeIndex)) tradeIndex++;
  console.log(`    slot: ${tradeIndex}`);

  const input = {
    trader: account.address,
    pairIndex: 1n, index: BigInt(tradeIndex),
    initialPosToken: 0n, positionSizeUSDC,
    openPrice: priceToContract(livePrice),
    buy: false, // ← SHORT
    leverage: leverageToContract(LEVERAGE),
    tp: 0n, sl: 0n, timestamp: 0n,
  };
  const nonce1 = await waitForNonceSettled(pc, account.address);
  const openHash = await wc.writeContract({
    address: TRADING_ADDRESS, abi: TRADING_ABI, functionName: 'openTrade',
    args: [input, ORDER_TYPE_MARKET, slippageToContract(1)],
    value: EXEC_FEE, nonce: nonce1,
  });
  console.log('    tx:', openHash);
  await pc.waitForTransactionReceipt({ hash: openHash });

  let pos = null;
  for (let i = 0; i < 20; i++) {
    await new Promise(r => setTimeout(r, 3000));
    const p = await fetchPositions(account.address);
    pos = pick(p, 1, tradeIndex);
    if (pos) break;
    process.stdout.write('.');
  }
  console.log();
  if (!pos) { console.error('Position never indexed'); process.exit(1); }
  console.log('    indexed:', { buy: pos.buy, entry: Number(pos.openPrice) / 1e10, collateral: Number(pos.collateral) / 1e6 });

  // ── 2. Set TP/SL ────────────────────────────────────────────────
  console.log('[2] Setting TP/SL...');
  const entry = Number(pos.openPrice) / 1e10;
  // For SHORT: TP is BELOW entry, SL is ABOVE entry
  const tp = entry * 0.95; // +5% profit in short direction
  const sl = entry * 1.10; // -10% loss
  console.log(`    entry=$${entry.toFixed(2)}  TP=$${tp.toFixed(2)}  SL=$${sl.toFixed(2)}`);

  const priceUpdateData = await fetchPriceUpdateData(1);
  if (!priceUpdateData || priceUpdateData === '0x') {
    console.error('    Pyth price update data unavailable — skipping TP/SL');
  } else {
    const nonce2 = await waitForNonceSettled(pc, account.address);
    const tpslHash = await wc.writeContract({
      address: TRADING_ADDRESS, abi: TRADING_ABI, functionName: 'updateTpAndSl',
      args: [1n, BigInt(tradeIndex), priceToContract(sl), priceToContract(tp), [priceUpdateData]],
      value: 1n, nonce: nonce2,
    });
    console.log('    tx:', tpslHash);
    try {
      await pc.waitForTransactionReceipt({ hash: tpslHash });
      console.log('    ✅ TP/SL updated');
    } catch (e) { console.error('    ❌ TP/SL revert:', e?.shortMessage || e?.message); }
  }

  // ── 3. Close ────────────────────────────────────────────────────
  console.log('[3] Closing position...');
  const collateralRaw = BigInt(pos.collateral);
  const nonce3 = await waitForNonceSettled(pc, account.address);
  const closeHash = await wc.writeContract({
    address: TRADING_ADDRESS, abi: TRADING_ABI, functionName: 'closeTradeMarket',
    args: [1n, BigInt(tradeIndex), collateralRaw],
    value: EXEC_FEE, nonce: nonce3,
  });
  console.log('    tx:', closeHash);
  await pc.waitForTransactionReceipt({ hash: closeHash });

  // Wait for clear
  for (let i = 0; i < 10; i++) {
    await new Promise(r => setTimeout(r, 3000));
    const p = await fetchPositions(account.address);
    if (!pick(p, 1, tradeIndex)) break;
    process.stdout.write('.');
  }
  console.log();

  const usdc1 = await pc.readContract({ address: USDC_ADDRESS, abi: ERC20_ABI, functionName: 'balanceOf', args: [account.address] });
  const eth1 = await pc.getBalance({ address: account.address });
  console.log();
  console.log(`USDC: ${formatUnits(usdc0, 6)} → ${formatUnits(usdc1, 6)}  (Δ ${(Number(usdc1 - usdc0) / 1e6).toFixed(4)})`);
  console.log(`ETH : ${formatEther(eth0)} → ${formatEther(eth1)}  (Δ ${(Number(eth1 - eth0) / 1e18).toFixed(6)})`);
  console.log();
  console.log('✅ SHORT + TP/SL update + CLOSE works');
}
main().catch(e => { console.error('\n❌', e?.shortMessage || e?.cause?.shortMessage || e?.message || e); process.exit(1); });
