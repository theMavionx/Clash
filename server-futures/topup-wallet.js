// One-off: send 5 USDC + ~$1 worth of ETH from the test privkey to the
// target wallet on Base mainnet. Run with:
//   node topup-wallet.js <destination> [usdc_amount] [eth_amount]

const { createWalletClient, createPublicClient, http, parseUnits, parseEther, formatUnits, formatEther } = require('viem');
const { privateKeyToAccount } = require('viem/accounts');
const { base } = require('viem/chains');

const PRIVKEY = '0xdcfb5cc090eee77a78f5f30d69105da5e5fedbf830b548b86820111c3f2e22b8';
const USDC = '0x833589fCD6eDb6E08f4c7C32D4f71b54bdA02913';
const ERC20_ABI = [
  { name: 'balanceOf', type: 'function', stateMutability: 'view', inputs: [{name:'a',type:'address'}], outputs: [{type:'uint256'}] },
  { name: 'transfer', type: 'function', stateMutability: 'nonpayable', inputs: [{name:'to',type:'address'},{name:'amount',type:'uint256'}], outputs: [{type:'bool'}] },
];

async function main() {
  const to = process.argv[2];
  const usdcAmt = parseFloat(process.argv[3] || '5');
  const ethAmt = parseFloat(process.argv[4] || '0.0005'); // ~$1.7 on ETH=$3400

  if (!/^0x[0-9a-fA-F]{40}$/.test(to || '')) {
    console.error('Usage: node topup-wallet.js 0xRecipient [usdc] [eth]');
    process.exit(1);
  }

  const account = privateKeyToAccount(PRIVKEY);
  const publicClient = createPublicClient({ chain: base, transport: http() });
  const walletClient = createWalletClient({ account, chain: base, transport: http() });

  const chainId = await publicClient.getChainId();
  if (chainId !== 8453) throw new Error(`Wrong chain: ${chainId}, expected 8453 (Base)`);

  console.log('From  :', account.address);
  console.log('To    :', to);
  console.log('Chain :', chainId, '(Base mainnet)');
  console.log();

  // Pre-flight balances
  const srcUsdc = await publicClient.readContract({ address: USDC, abi: ERC20_ABI, functionName: 'balanceOf', args: [account.address] });
  const srcEth = await publicClient.getBalance({ address: account.address });
  console.log('Source USDC balance:', formatUnits(srcUsdc, 6));
  console.log('Source ETH  balance:', formatEther(srcEth));
  console.log();

  const usdcRaw = parseUnits(String(usdcAmt), 6);
  const ethRaw = parseEther(String(ethAmt));

  if (srcUsdc < usdcRaw) throw new Error('Insufficient USDC');
  if (srcEth < ethRaw) throw new Error('Insufficient ETH to send (after gas)');

  // 1) USDC transfer
  console.log(`→ sending ${usdcAmt} USDC...`);
  const usdcHash = await walletClient.writeContract({
    address: USDC,
    abi: ERC20_ABI,
    functionName: 'transfer',
    args: [to, usdcRaw],
  });
  console.log('  tx:', usdcHash);
  const usdcRx = await publicClient.waitForTransactionReceipt({ hash: usdcHash });
  console.log('  status:', usdcRx.status, 'block:', usdcRx.blockNumber);
  console.log();

  // 2) ETH transfer for gas
  console.log(`→ sending ${ethAmt} ETH (gas float)...`);
  const nonce = await publicClient.getTransactionCount({ address: account.address, blockTag: 'pending' });
  const ethHash = await walletClient.sendTransaction({
    to,
    value: ethRaw,
    nonce,
  });
  console.log('  tx:', ethHash);
  const ethRx = await publicClient.waitForTransactionReceipt({ hash: ethHash });
  console.log('  status:', ethRx.status, 'block:', ethRx.blockNumber);
  console.log();

  // Post balances on destination
  const dstUsdc = await publicClient.readContract({ address: USDC, abi: ERC20_ABI, functionName: 'balanceOf', args: [to] });
  const dstEth = await publicClient.getBalance({ address: to });
  console.log('Destination USDC:', formatUnits(dstUsdc, 6));
  console.log('Destination ETH :', formatEther(dstEth));
}

main().catch(e => { console.error('FAILED:', e.message || e); process.exit(1); });
