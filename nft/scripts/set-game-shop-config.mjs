import fs from 'node:fs';
import path from 'node:path';
import { createPublicClient, createWalletClient, getAddress, http, parseGwei } from 'viem';
import { base } from 'viem/chains';
import { loadEnv, NFT_DIR, parseEthAccount } from './lib-env.mjs';

const env = loadEnv();
const deploymentPath = path.join(NFT_DIR, 'deployments', 'game-shop-base-mainnet.json');
const artifactPath = path.join(NFT_DIR, 'artifacts', 'ClashGameShopV1.json');
if (!fs.existsSync(deploymentPath)) throw new Error('Missing deployments/game-shop-base-mainnet.json');
if (!fs.existsSync(artifactPath)) throw new Error('Missing artifact. Run npm run compile:base first.');

const deployment = JSON.parse(fs.readFileSync(deploymentPath, 'utf8'));
const artifact = JSON.parse(fs.readFileSync(artifactPath, 'utf8'));
const rpcUrl = env.GAME_SHOP_BASE_RPC_URL || env.NFT_BASE_RPC_URL || env.BASE_RPC_URL || env.VITE_BASE_RPC_URL || 'https://mainnet.base.org';
const { account } = parseEthAccount(env);
const publicClient = createPublicClient({ chain: base, transport: http(rpcUrl) });
const walletClient = createWalletClient({ account, chain: base, transport: http(rpcUrl) });
const address = deployment.shop || deployment.proxy;
const maxPriorityFeePerGas = env.GAME_SHOP_BASE_PRIORITY_GWEI || env.NFT_BASE_PRIORITY_GWEI
  ? parseGwei(env.GAME_SHOP_BASE_PRIORITY_GWEI || env.NFT_BASE_PRIORITY_GWEI)
  : undefined;

if (env.GAME_SHOP_QUOTE_SIGNER) {
  const quoteSigner = getAddress(env.GAME_SHOP_QUOTE_SIGNER);
  await write('setQuoteSigner', [quoteSigner]);
  deployment.quoteSigner = quoteSigner;
}
if (env.GAME_SHOP_TREASURY) {
  const treasury = getAddress(env.GAME_SHOP_TREASURY);
  await write('setTreasury', [treasury]);
  deployment.treasury = treasury;
}
if (env.GAME_SHOP_COP_TOKEN || env.NFT_BASE_CLASH_TOKEN || env.CLASH_BASE_TOKEN) {
  const copToken = getAddress(env.GAME_SHOP_COP_TOKEN || env.NFT_BASE_CLASH_TOKEN || env.CLASH_BASE_TOKEN);
  await write('setCopToken', [copToken]);
  await write('setPaymentToken', [copToken, true]);
  deployment.copToken = copToken;
}
if (env.GAME_SHOP_MAX_QTY) {
  await write('setMaxQuantityPerPurchase', [BigInt(env.GAME_SHOP_MAX_QTY)]);
}
if (env.GAME_SHOP_SALE_ACTIVE != null) {
  const active = env.GAME_SHOP_SALE_ACTIVE !== '0';
  await write('setSaleActive', [active]);
  deployment.saleActive = active;
}

fs.writeFileSync(deploymentPath, `${JSON.stringify(deployment, null, 2)}\n`);
console.log(`ClashGameShop config checked for ${address}`);

async function write(functionName, args) {
  const hash = await walletClient.writeContract({
    address,
    abi: artifact.abi,
    functionName,
    args,
    maxPriorityFeePerGas,
  });
  console.log(`${functionName} tx: ${hash}`);
  await publicClient.waitForTransactionReceipt({ hash, confirmations: 2 });
}
