// One-off: drain custodial wallet(s) for a given player to a destination
// address on Base. Reads encrypted secret from futures.db, decrypts with
// CLASH_WALLET_ENCRYPTION_KEY, and transfers USDC + residual ETH.
//
// Usage (on prod where .env is available):
//   cd /opt/clash/server-futures
//   node --env-file=/opt/clash/.env drain-custodial.js <player_id_or_address> <destination> [usdc_amount|all]
//
// Example:
//   node --env-file=/opt/clash/.env drain-custodial.js 0x6957dE37B077aa04ad694CFbeEC293413574D5B0 0x1ba8f73CB9A7AEFF75b7e427ea2089236e8B9e37 all

const { createWalletClient, createPublicClient, http, parseUnits, formatUnits, formatEther } = require('viem');
const { privateKeyToAccount } = require('viem/accounts');
const { base } = require('viem/chains');
const db = require('./db');

const USDC = '0x833589fCD6eDb6E08f4c7C32D4f71b54bdA02913';
const ERC20_ABI = [
  { name: 'balanceOf', type: 'function', stateMutability: 'view', inputs: [{name:'a',type:'address'}], outputs: [{type:'uint256'}] },
  { name: 'transfer',  type: 'function', stateMutability: 'nonpayable', inputs: [{name:'to',type:'address'},{name:'amount',type:'uint256'}], outputs: [{type:'bool'}] },
];

async function main() {
  const identifier = process.argv[2];
  const dest = process.argv[3];
  const amountArg = (process.argv[4] || 'all').toLowerCase();

  if (!identifier || !dest) {
    console.error('Usage: node drain-custodial.js <player_id_or_public_key> <destination> [amount|all]');
    process.exit(1);
  }
  if (!/^0x[0-9a-fA-F]{40}$/.test(dest)) {
    console.error('Destination must be a valid 0x... Base address');
    process.exit(1);
  }

  // Resolve wallet row: caller can pass either player_id OR the custodial
  // public_key. dex is hardcoded to avantis since that's the non-custodial
  // migration target — Solana wallets are irrelevant here.
  const row = /^0x[0-9a-fA-F]{40}$/.test(identifier)
    ? db.db.prepare("SELECT * FROM wallets WHERE public_key = ? AND dex = 'avantis'").get(identifier)
    : db.db.prepare("SELECT * FROM wallets WHERE player_id = ? AND dex = 'avantis'").get(identifier);

  if (!row) {
    console.error(`No Avantis wallet found for ${identifier}`);
    process.exit(1);
  }

  // decryptSecret throws if row isn't encrypted — that's fine, we want to know.
  const privkey = db.decryptSecret(row.secret_key);
  const account = privateKeyToAccount(privkey);
  if (account.address.toLowerCase() !== row.public_key.toLowerCase()) {
    console.error(`Address mismatch! Decrypted privkey address ${account.address} != stored public_key ${row.public_key}. Aborting.`);
    process.exit(1);
  }

  const pc = createPublicClient({ chain: base, transport: http() });
  const wc = createWalletClient({ account, chain: base, transport: http() });

  const chainId = await pc.getChainId();
  if (chainId !== 8453) throw new Error(`Wrong chain ${chainId}, expected 8453`);

  console.log('Player ID  :', row.player_id);
  console.log('From (cust):', account.address);
  console.log('To         :', dest);
  console.log();

  const usdc = await pc.readContract({ address: USDC, abi: ERC20_ABI, functionName: 'balanceOf', args: [account.address] });
  const eth  = await pc.getBalance({ address: account.address });
  console.log('Source USDC:', formatUnits(usdc, 6));
  console.log('Source ETH :', formatEther(eth));
  console.log();

  // 1) USDC transfer
  let usdcToSend = 0n;
  if (amountArg === 'all') usdcToSend = usdc;
  else {
    const n = parseFloat(amountArg);
    if (!Number.isFinite(n) || n <= 0) { console.error('Bad amount'); process.exit(1); }
    usdcToSend = parseUnits(String(n), 6);
    if (usdcToSend > usdc) { console.error('Amount exceeds balance'); process.exit(1); }
  }

  if (usdcToSend > 0n) {
    console.log(`→ transferring ${formatUnits(usdcToSend, 6)} USDC...`);
    const hash = await wc.writeContract({
      address: USDC, abi: ERC20_ABI, functionName: 'transfer',
      args: [dest, usdcToSend],
    });
    console.log('  tx:', hash);
    const rx = await pc.waitForTransactionReceipt({ hash });
    console.log('  status:', rx.status, 'block:', rx.blockNumber);
    console.log();
  } else {
    console.log('No USDC to transfer, skipping.');
  }

  // 2) ETH drain — only if user asked for 'all' AND there's meaningful dust
  if (amountArg === 'all') {
    const gasPrice = await pc.getGasPrice();
    const gasLimit = 21000n;
    const fee = gasPrice * gasLimit;
    const buffer = fee * 3n;
    const ethAfter = await pc.getBalance({ address: account.address });
    const toSend = ethAfter > buffer ? ethAfter - buffer : 0n;
    console.log('ETH balance after USDC tx:', formatEther(ethAfter));
    console.log('Gas fee                 :', formatEther(fee), 'ETH');

    if (toSend > 0n) {
      console.log(`→ transferring ${formatEther(toSend)} ETH...`);
      const nonce = await pc.getTransactionCount({ address: account.address, blockTag: 'pending' });
      const hash = await wc.sendTransaction({ to: dest, value: toSend, nonce, gas: gasLimit });
      console.log('  tx:', hash);
      const rx = await pc.waitForTransactionReceipt({ hash });
      console.log('  status:', rx.status);
    } else {
      console.log('ETH balance below gas buffer, leaving it.');
    }
  }

  console.log();
  const usdcAfter = await pc.readContract({ address: USDC, abi: ERC20_ABI, functionName: 'balanceOf', args: [account.address] });
  const ethAfter  = await pc.getBalance({ address: account.address });
  console.log('FINAL Source USDC:', formatUnits(usdcAfter, 6));
  console.log('FINAL Source ETH :', formatEther(ethAfter));

  const dstUsdc = await pc.readContract({ address: USDC, abi: ERC20_ABI, functionName: 'balanceOf', args: [dest] });
  const dstEth  = await pc.getBalance({ address: dest });
  console.log('FINAL Dest   USDC:', formatUnits(dstUsdc, 6));
  console.log('FINAL Dest   ETH :', formatEther(dstEth));
}

main().catch(e => { console.error('FAILED:', e?.message || e); process.exit(1); });
