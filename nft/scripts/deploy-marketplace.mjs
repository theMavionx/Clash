// Deploy DemonKingMarketplace (UUPS proxy + V1 impl) on Base.
//
// Usage:
//   node scripts/deploy-marketplace.mjs --chain=base
//
// Prerequisites:
//   - DemonKingBaseV3 already upgraded (base-v3-mainnet.json exists).
//   - Deployer is funded with native gas on the target chain.
//
// Post-deploy:
//   - The deployer can call setAcceptedPaymentToken(token, true) to whitelist
//     additional ERC-20s (USDC and CoP recommended on Base).
//   - The marketplace pulls royalty info from the V3 NFT via EIP-2981, so no
//     additional royalty config is required.

import fs from 'node:fs';
import path from 'node:path';
import readline from 'node:readline/promises';
import { stdin, stdout } from 'node:process';
import {
  createPublicClient,
  createWalletClient,
  defineChain,
  encodeFunctionData,
  formatEther,
  getAddress,
  http,
  parseGwei,
} from 'viem';
import { arbitrum, base } from 'viem/chains';
import { loadEnv, NFT_DIR, parseEthAccount } from './lib-env.mjs';

const monad = defineChain({
  id: 143,
  name: 'Monad',
  nativeCurrency: { name: 'Monad', symbol: 'MON', decimals: 18 },
  rpcUrls: { default: { http: ['https://rpc.monad.xyz'] } },
});

const TREASURY = '0xC024884ad9C5540996492Cc2DD080964941A3094';

const CHAINS = {
  base:     { chain: base,     defaultRpc: 'https://mainnet.base.org',     envRpc: ['NFT_BASE_RPC_URL', 'BASE_RPC_URL'],
              v3DeployFile: 'base-v3-mainnet.json',     marketDeployFile: 'base-marketplace-mainnet.json',
              usdcDefault: '0x833589fCD6eDb6E08f4c7C32D4f71b54bdA02913' },
  arbitrum: { chain: arbitrum, defaultRpc: 'https://arb1.arbitrum.io/rpc', envRpc: ['NFT_ARBITRUM_RPC_URL', 'ARBITRUM_RPC_URL'],
              v3DeployFile: 'arbitrum-v3-mainnet.json', marketDeployFile: 'arbitrum-marketplace-mainnet.json',
              usdcDefault: '0xaf88d065e77c8cC2239327C5EDb3A432268e5831' },
  monad:    { chain: monad,    defaultRpc: 'https://rpc.monad.xyz',        envRpc: ['NFT_MONAD_RPC_URL', 'MONAD_RPC_URL'],
              v3DeployFile: 'monad-v3-mainnet.json',    marketDeployFile: 'monad-marketplace-mainnet.json',
              usdcDefault: '0x754704Bc059F8C67012fEd69BC8A327a5aafb603' },
};

const cliArg = process.argv.slice(2).find((a) => a.startsWith('--chain=')) || '';
const chainKey = (cliArg ? cliArg.split('=')[1] : process.env.CLASH_DEPLOY_CHAIN || 'base').toLowerCase();
const spec = CHAINS[chainKey];
if (!spec) {
  console.error(`Unknown chain "${chainKey}". Use --chain=base|arbitrum|monad.`);
  process.exit(1);
}

const env = loadEnv();
const marketArtifactPath = path.join(NFT_DIR, 'artifacts', 'DemonKingMarketplace.json');
const proxyArtifactPath  = path.join(NFT_DIR, 'artifacts', 'DemonKingProxy.json');
if (!fs.existsSync(marketArtifactPath) || !fs.existsSync(proxyArtifactPath)) {
  throw new Error('Missing artifacts. Run `npm run compile:base` first.');
}
const marketArtifact = JSON.parse(fs.readFileSync(marketArtifactPath, 'utf8'));
const proxyArtifact = JSON.parse(fs.readFileSync(proxyArtifactPath, 'utf8'));

const v3DeployPath = path.join(NFT_DIR, 'deployments', spec.v3DeployFile);
if (!fs.existsSync(v3DeployPath)) {
  throw new Error(`Missing V3 deployment ${spec.v3DeployFile}. Run deploy-evm-v3.mjs first.`);
}
const v3Deployment = JSON.parse(fs.readFileSync(v3DeployPath, 'utf8'));
const nftAddress = getAddress(v3Deployment.proxy);

const rpcUrl = spec.envRpc.map((k) => env[k]).find(Boolean) || spec.defaultRpc;
const { account, source } = parseEthAccount(env);
const publicClient = createPublicClient({ chain: spec.chain, transport: http(rpcUrl) });
const walletClient = createWalletClient({ account, chain: spec.chain, transport: http(rpcUrl) });

const onChainId = await publicClient.getChainId();
if (onChainId !== spec.chain.id) {
  throw new Error(`Expected chainId ${spec.chain.id}, got ${onChainId}.`);
}

const balance = await publicClient.getBalance({ address: account.address });
const treasury = getAddress(env.NFT_MARKETPLACE_TREASURY || env.NFT_ROYALTY_RECEIVER || TREASURY);
const fallbackRoyaltyBps = Number(env.NFT_MARKETPLACE_FALLBACK_ROYALTY_BPS || '250');
const platformFeeBps = Number(env.NFT_MARKETPLACE_FEE_BPS || env.CUSTODIAL_MARKETPLACE_FEE_BPS || '100');
const usdcToken = getAddress(env[`NFT_${chainKey.toUpperCase()}_USDC_TOKEN`] || spec.usdcDefault);
const copTokenRaw = env[`NFT_${chainKey.toUpperCase()}_CLASH_TOKEN`] || env.NFT_CLASH_TOKEN || env.GAME_SHOP_COP_TOKEN || '';
const copToken = copTokenRaw && /^0x[0-9a-fA-F]{40}$/.test(copTokenRaw) ? getAddress(copTokenRaw) : null;

console.log('\n=== Marketplace Deploy Plan ===');
console.log(`  Chain          : ${spec.chain.name} (chainId ${spec.chain.id})`);
console.log(`  RPC            : ${rpcUrl}`);
console.log(`  Deployer       : ${account.address}  (${source})`);
console.log(`  Native balance : ${formatEther(balance)} ${spec.chain.nativeCurrency.symbol}`);
console.log(`  NFT (proxy)    : ${nftAddress}`);
console.log(`  Treasury       : ${treasury}`);
console.log(`  Fallback bps   : ${fallbackRoyaltyBps}   (${fallbackRoyaltyBps / 100}%)`);
console.log(`  Platform fee   : ${platformFeeBps}   (${platformFeeBps / 100}%)`);
console.log(`  Whitelist USDC : ${usdcToken}`);
console.log(`  Whitelist CoP  : ${copToken || '(skip — set via setAcceptedPaymentToken later)'}`);
console.log('');

if (balance === 0n) {
  console.error(`Deployer has 0 ${spec.chain.nativeCurrency.symbol}. Fund it first.`);
  process.exit(1);
}

if (env.CONFIRM_MARKETPLACE_DEPLOY !== 'yes') {
  const rl = readline.createInterface({ input: stdin, output: stdout });
  const ans = (await rl.question(`Deploy marketplace on ${spec.chain.name}? [y/N] `)).trim().toLowerCase();
  rl.close();
  if (ans !== 'y' && ans !== 'yes') {
    console.log('Aborted.');
    process.exit(0);
  }
}

const maxPriorityFeePerGas = env[`NFT_${chainKey.toUpperCase()}_PRIORITY_GWEI`]
  ? parseGwei(env[`NFT_${chainKey.toUpperCase()}_PRIORITY_GWEI`])
  : undefined;

// --- Step 1: deploy implementation ---
console.log('\n[1/3] Deploying marketplace implementation…');
const implHash = await walletClient.deployContract({
  abi: marketArtifact.abi, bytecode: marketArtifact.bytecode, maxPriorityFeePerGas,
});
const implReceipt = await publicClient.waitForTransactionReceipt({ hash: implHash, confirmations: 2 });
const implementation = implReceipt.contractAddress;
console.log(`  ✓ Implementation: ${implementation}`);

// --- Step 2: deploy proxy + initialize ---
console.log('\n[2/3] Deploying proxy with initialize(...)…');
const initData = encodeFunctionData({
  abi: marketArtifact.abi,
  functionName: 'initialize',
  args: [account.address, nftAddress, treasury, fallbackRoyaltyBps, platformFeeBps],
});
const proxyHash = await walletClient.deployContract({
  abi: proxyArtifact.abi, bytecode: proxyArtifact.bytecode,
  args: [implementation, initData], maxPriorityFeePerGas,
});
const proxyReceipt = await publicClient.waitForTransactionReceipt({ hash: proxyHash, confirmations: 2 });
const marketAddress = proxyReceipt.contractAddress;
console.log(`  ✓ Proxy: ${marketAddress}`);

// --- Step 3: whitelist payment tokens ---
console.log('\n[3/3] Whitelisting payment tokens…');
async function whitelist(token, label) {
  const txHash = await walletClient.writeContract({
    address: marketAddress,
    abi: marketArtifact.abi,
    functionName: 'setAcceptedPaymentToken',
    args: [token, true],
    maxPriorityFeePerGas,
  });
  await publicClient.waitForTransactionReceipt({ hash: txHash, confirmations: 1 });
  console.log(`  ✓ ${label} accepted: ${token}`);
  return txHash;
}
const usdcWhitelistTx = await whitelist(usdcToken, 'USDC');
const copWhitelistTx = copToken ? await whitelist(copToken, 'CoP') : null;

// --- Verify ---
console.log('\n[verify] Reading marketplace state…');
const MARKET_VIEW_ABI = [
  { name: 'demonKing', type: 'function', stateMutability: 'view', inputs: [], outputs: [{ type: 'address' }] },
  { name: 'treasury',  type: 'function', stateMutability: 'view', inputs: [], outputs: [{ type: 'address' }] },
  { name: 'defaultRoyaltyBps', type: 'function', stateMutability: 'view', inputs: [], outputs: [{ type: 'uint16' }] },
  { name: 'platformFeeBps', type: 'function', stateMutability: 'view', inputs: [], outputs: [{ type: 'uint16' }] },
  { name: 'acceptedPaymentToken', type: 'function', stateMutability: 'view', inputs: [{ type: 'address' }], outputs: [{ type: 'bool' }] },
];
const [nftRead, treasuryRead, bpsRead, platformFeeRead, ethAccepted, usdcAccepted] = await Promise.all([
  publicClient.readContract({ address: marketAddress, abi: MARKET_VIEW_ABI, functionName: 'demonKing' }),
  publicClient.readContract({ address: marketAddress, abi: MARKET_VIEW_ABI, functionName: 'treasury' }),
  publicClient.readContract({ address: marketAddress, abi: MARKET_VIEW_ABI, functionName: 'defaultRoyaltyBps' }),
  publicClient.readContract({ address: marketAddress, abi: MARKET_VIEW_ABI, functionName: 'platformFeeBps' }),
  publicClient.readContract({ address: marketAddress, abi: MARKET_VIEW_ABI, functionName: 'acceptedPaymentToken', args: ['0x0000000000000000000000000000000000000000'] }),
  publicClient.readContract({ address: marketAddress, abi: MARKET_VIEW_ABI, functionName: 'acceptedPaymentToken', args: [usdcToken] }),
]);
if (getAddress(nftRead) !== nftAddress) throw new Error(`demonKing mismatch: ${nftRead}`);
if (getAddress(treasuryRead) !== treasury) throw new Error(`treasury mismatch: ${treasuryRead}`);
if (bpsRead !== fallbackRoyaltyBps) throw new Error(`bps mismatch: ${bpsRead}`);
if (platformFeeRead !== platformFeeBps) throw new Error(`platform fee mismatch: ${platformFeeRead}`);
if (!ethAccepted) throw new Error('ETH should be accepted by default');
if (!usdcAccepted) throw new Error('USDC whitelist failed');
console.log('  ✓ Marketplace state verified.');

// --- Write deployment JSON ---
const deployment = {
  chain: chainKey,
  chainId: spec.chain.id,
  marketplace: marketAddress,
  proxy: marketAddress,
  implementation,
  demonKing: nftAddress,
  treasury,
  defaultRoyaltyBps: fallbackRoyaltyBps,
  platformFeeBps,
  acceptedPaymentTokens: {
    eth: '0x0000000000000000000000000000000000000000',
    usdc: usdcToken,
    ...(copToken ? { cop: copToken } : {}),
  },
  implTxHash: implHash,
  proxyTxHash: proxyHash,
  usdcWhitelistTxHash: usdcWhitelistTx,
  ...(copWhitelistTx ? { copWhitelistTxHash: copWhitelistTx } : {}),
  deployer: account.address,
  deployedAt: new Date().toISOString(),
};
fs.writeFileSync(path.join(NFT_DIR, 'deployments', spec.marketDeployFile), `${JSON.stringify(deployment, null, 2)}\n`);
console.log(`\n✓ Wrote ${spec.marketDeployFile}.`);
console.log('\nNext:');
console.log('  - Indexer: watch Listed/Cancelled/Sold events from marketplace.');
console.log('  - UI: NftMarketplacePanel reads listings from the indexer DB.');
console.log('  - Optional: add more payment tokens via setAcceptedPaymentToken(token, true).');
