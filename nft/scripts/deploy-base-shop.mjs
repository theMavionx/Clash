import fs from 'node:fs';
import path from 'node:path';
import { createPublicClient, createWalletClient, http } from 'viem';
import { base } from 'viem/chains';
import { loadEnv, NFT_DIR, parseEthAccount } from './lib-env.mjs';

const env = loadEnv();
const baseDeploymentPath = path.join(NFT_DIR, 'deployments', 'base-mainnet.json');
const artifactPath = path.join(NFT_DIR, 'artifacts', 'DemonKingBaseShop.json');
if (!fs.existsSync(baseDeploymentPath)) throw new Error('Missing deployments/base-mainnet.json');
if (!fs.existsSync(artifactPath)) throw new Error('Missing artifact. Run npm run compile:base first.');

const baseDeployment = JSON.parse(fs.readFileSync(baseDeploymentPath, 'utf8'));
const artifact = JSON.parse(fs.readFileSync(artifactPath, 'utf8'));
const rpcUrl = env.NFT_BASE_RPC_URL || env.BASE_RPC_URL || env.VITE_BASE_RPC_URL || 'https://base-rpc.publicnode.com';
const { account } = parseEthAccount(env);
const publicClient = createPublicClient({ chain: base, transport: http(rpcUrl) });
const walletClient = createWalletClient({ account, chain: base, transport: http(rpcUrl) });
const chainId = await publicClient.getChainId();
if (chainId !== 8453) throw new Error(`Expected Base mainnet chainId 8453, got ${chainId}`);

const quoteSigner = env.NFT_BASE_SHOP_QUOTE_SIGNER || account.address;
const args = [account.address, baseDeployment.contract, quoteSigner];
const hash = await walletClient.deployContract({
  abi: artifact.abi,
  bytecode: artifact.bytecode,
  args,
});
console.log(`Base shop deploy tx: ${hash}`);
const receipt = await publicClient.waitForTransactionReceipt({ hash, confirmations: 3 });
console.log(`DemonKingBaseShop deployed: ${receipt.contractAddress}`);

const deployment = {
  chain: 'base',
  chainId,
  shop: receipt.contractAddress,
  nft: baseDeployment.contract,
  deployer: account.address,
  quoteSigner,
  txHash: hash,
  blockNumber: receipt.blockNumber?.toString(),
  baseUsdPrice: '8.9',
  clashUsdPrice: '5',
  deployedAt: new Date().toISOString(),
};
fs.writeFileSync(path.join(NFT_DIR, 'deployments', 'base-shop-mainnet.json'), `${JSON.stringify(deployment, null, 2)}\n`);
