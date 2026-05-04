// One-shot ETH → USDC swap on Arbitrum via Uniswap V3 SwapRouter02.
//
// Why Uniswap V3 here (not GMX swap): the GMX swap path requires
// (a) a separate execution-fee in ETH attached to a swap order, (b) a
// keeper-executed two-step flow. For a one-off "convert gas to collateral"
// during testing, Uniswap V3's atomic exactInputSingle with msg.value is
// simpler — single tx, no keeper wait, native ETH auto-wraps.
//
// Pool used: ETH/USDC 0.05% on Arbitrum (the deepest liquidity pair).
//
// Usage:
//   node swap-eth-to-usdc.js [ethAmount]
//   node swap-eth-to-usdc.js 0.004     # swap 0.004 ETH → USDC
//   node swap-eth-to-usdc.js           # default 0.004 ETH

const path = require('path');
const fs = require('fs');

const WEB_NODE_MODULES = path.join(__dirname, '..', 'web', 'node_modules');
function webRequire(pkg) {
  return require(path.join(WEB_NODE_MODULES, pkg));
}

function loadEnv() {
  try {
    const text = fs.readFileSync(path.join(__dirname, '.env'), 'utf8');
    for (const line of text.split(/\r?\n/)) {
      const m = line.match(/^([A-Z_][A-Z0-9_]*)=(.*)$/);
      if (m) process.env[m[1]] = m[2].trim();
    }
  } catch {}
}
loadEnv();

const { createPublicClient, createWalletClient, http, parseEther, formatUnits, formatEther } = webRequire('viem');
const { arbitrum } = webRequire('viem/chains');
const { privateKeyToAccount } = webRequire('viem/accounts');

const PRIVKEY = process.env.TEST_PRIVKEY;
if (!PRIVKEY) { console.error('Missing TEST_PRIVKEY'); process.exit(1); }

const RPC = process.env.ARBITRUM_RPC_URL || 'https://arb1.arbitrum.io/rpc';

// Uniswap V3 on Arbitrum One.
const SWAP_ROUTER_02 = '0x68b3465833fb72A70ecDF485E0e4C7bD8665Fc45';
const WETH_ARB = '0x82aF49447D8a07e3bd95BD0d56f35241523fBab1';
const USDC_ARB = '0xaf88d065e77c8cC2239327C5EDb3A432268e5831';
const POOL_FEE = 500; // 0.05% — main ETH/USDC pool

const SWAP_ABI = [
  { type: 'function', name: 'exactInputSingle', stateMutability: 'payable',
    inputs: [{ type: 'tuple', components: [
      { name: 'tokenIn', type: 'address' },
      { name: 'tokenOut', type: 'address' },
      { name: 'fee', type: 'uint24' },
      { name: 'recipient', type: 'address' },
      { name: 'amountIn', type: 'uint256' },
      { name: 'amountOutMinimum', type: 'uint256' },
      { name: 'sqrtPriceLimitX96', type: 'uint160' },
    ]}],
    outputs: [{ type: 'uint256' }] },
];

const ERC20_BAL = [{ type: 'function', name: 'balanceOf', stateMutability: 'view',
  inputs: [{ name: 'a', type: 'address' }], outputs: [{ type: 'uint256' }] }];

const account = privateKeyToAccount(PRIVKEY);
const publicClient = createPublicClient({ chain: arbitrum, transport: http(RPC) });
const walletClient = createWalletClient({ account, chain: arbitrum, transport: http(RPC) });

(async () => {
  const ethAmount = process.argv[2] || '0.004';
  const amountIn = parseEther(ethAmount);

  console.log(`\n── Swap ${ethAmount} ETH → USDC on Arbitrum ──`);
  const ethBefore = await publicClient.getBalance({ address: account.address });
  const usdcBefore = await publicClient.readContract({
    address: USDC_ARB, abi: ERC20_BAL, functionName: 'balanceOf', args: [account.address],
  });
  console.log('  Before:', formatEther(ethBefore), 'ETH |', formatUnits(usdcBefore, 6), 'USDC');

  if (ethBefore < amountIn + parseEther('0.0005')) {
    console.error(`  Not enough ETH (need ${ethAmount} + 0.0005 buffer)`);
    process.exit(1);
  }

  console.log('  submitting swap tx...');
  const hash = await walletClient.writeContract({
    address: SWAP_ROUTER_02,
    abi: SWAP_ABI,
    functionName: 'exactInputSingle',
    args: [{
      tokenIn: WETH_ARB,
      tokenOut: USDC_ARB,
      fee: POOL_FEE,
      recipient: account.address,
      amountIn,
      amountOutMinimum: 0n,        // testnet-style: accept any output (we control timing)
      sqrtPriceLimitX96: 0n,
    }],
    value: amountIn,                // SwapRouter02 auto-wraps native ETH when tokenIn = WETH
    account,
  });
  console.log('  tx:', hash);
  const r = await publicClient.waitForTransactionReceipt({ hash });
  console.log('  status:', r.status, '| gas used:', r.gasUsed.toString(), '| block:', r.blockNumber.toString());

  const ethAfter = await publicClient.getBalance({ address: account.address });
  const usdcAfter = await publicClient.readContract({
    address: USDC_ARB, abi: ERC20_BAL, functionName: 'balanceOf', args: [account.address],
  });
  console.log('  After: ', formatEther(ethAfter), 'ETH |', formatUnits(usdcAfter, 6), 'USDC');
  console.log('  Δ:    ', formatEther(ethAfter - ethBefore), 'ETH |', formatUnits(usdcAfter - usdcBefore, 6), 'USDC');
})().catch(e => {
  console.error('\n[FATAL]', e?.shortMessage || e?.message || e);
  if (e?.cause?.shortMessage) console.error('  cause:', e.cause.shortMessage);
  process.exit(1);
});
