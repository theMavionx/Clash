// One-off: close the open position on the test wallet. Run after the open
// test has succeeded to free collateral.

const { createPublicClient, createWalletClient, http, parseUnits, formatUnits, formatEther } = require('viem');
const { privateKeyToAccount } = require('viem/accounts');
const { base } = require('viem/chains');

const PK = process.env.TEST_PRIVKEY;
const TRADING_ADDRESS = '0x44914408af82bC9983bbb330e3578E1105e11d4e';
const USDC_ADDRESS    = '0x833589fCD6eDb6E08f4c7C32D4f71b54bdA02913';
const CORE_API        = 'https://core.avantisfi.com';

const TRADING_ABI = [
  { name: 'closeTradeMarket', type: 'function', stateMutability: 'payable',
    inputs: [ { name: 'pairIndex', type: 'uint256' }, { name: 'index', type: 'uint256' }, { name: 'amount', type: 'uint256' } ],
    outputs: [] },
];
const ERC20_ABI = [
  { name: 'balanceOf', type: 'function', stateMutability: 'view', inputs: [{ name: 'a', type: 'address' }], outputs: [{ type: 'uint256' }] },
];

async function fetchExecFee() {
  try {
    const r = await fetch(`${CORE_API}/fee/execution`);
    const j = await r.json();
    const eth = Number(j?.eth || j?.executionFee || 0);
    if (eth > 0 && eth < 0.01) return BigInt(Math.floor(eth * 1e18));
  } catch {}
  return 350000000000000n;
}

async function main() {
  const account = privateKeyToAccount(PK);
  const pc = createPublicClient({ chain: base, transport: http() });
  const wc = createWalletClient({ account, chain: base, transport: http() });

  const ethBal = await pc.getBalance({ address: account.address });
  console.log('ETH balance:', formatEther(ethBal));

  const r = await fetch(`${CORE_API}/user-data?trader=${account.address}`);
  const j = await r.json();
  const pos = (j.positions || [])[0];
  if (!pos) { console.log('No open position'); return; }

  console.log('Position:', {
    pair: pos.pairIndex,
    idx: pos.index,
    buy: pos.buy,
    collateral: Number(pos.collateral) / 1e6,
    entry: Number(pos.openPrice) / 1e10,
  });

  const collateralRaw = BigInt(pos.collateral); // already raw 1e6 from Core API

  // Estimate gas first so we know how much ETH we can afford to send as execFee
  const gasPrice = await pc.getGasPrice();
  const gasLimit = 600000n; // generous upper bound for closeTradeMarket
  const gasReserve = gasPrice * gasLimit * 2n; // 2× buffer
  const defaultExecFee = await fetchExecFee();
  // Max execFee we can afford = balance - gas reserve - 1 wei dust
  const maxAfford = ethBal > gasReserve ? ethBal - gasReserve - 1n : 0n;
  const execFee = defaultExecFee <= maxAfford ? defaultExecFee : maxAfford;
  console.log('gas price    :', formatEther(gasPrice * 1000000000n), 'gwei');
  console.log('gas reserve  :', formatEther(gasReserve), 'ETH');
  console.log('default fee  :', formatEther(defaultExecFee), 'ETH');
  console.log('execFee used :', formatEther(execFee), 'ETH');

  if (execFee <= 0n) {
    console.error('❌ Wallet has no ETH for execFee. Top up and retry.');
    process.exit(1);
  }

  console.log('→ closeTradeMarket...');
  const h = await wc.writeContract({
    address: TRADING_ADDRESS, abi: TRADING_ABI, functionName: 'closeTradeMarket',
    args: [BigInt(pos.pairIndex), BigInt(pos.index), collateralRaw],
    value: execFee,
  });
  console.log('  tx:', h);
  const rx = await pc.waitForTransactionReceipt({ hash: h });
  console.log('  status:', rx.status);

  // Final state
  await new Promise(r => setTimeout(r, 6000));
  const usdc = await pc.readContract({ address: USDC_ADDRESS, abi: ERC20_ABI, functionName: 'balanceOf', args: [account.address] });
  const eth = await pc.getBalance({ address: account.address });
  console.log();
  console.log('FINAL: USDC', formatUnits(usdc, 6), ' ETH', formatEther(eth));
}
main().catch(e => { console.error('FAILED:', e?.shortMessage || e?.message || e); process.exit(1); });
