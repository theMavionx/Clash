import fs from 'node:fs';
import path from 'node:path';
import { createUmi } from '@metaplex-foundation/umi-bundle-defaults';
import { dateTime, keypairIdentity, lamports, none, publicKey, some } from '@metaplex-foundation/umi';
import { mplCore } from '@metaplex-foundation/mpl-core';
import { mplCandyMachine, updateCandyGuard } from '@metaplex-foundation/mpl-core-candy-machine';
import {
  loadEnv,
  NFT_DIR,
  parseSolanaKeypair,
  requirePublicKey,
  solanaPriceLamports,
} from './lib-env.mjs';
import { buildSolanaGuardConfig } from './lib-solana-guards.mjs';

const mode = (process.argv[2] || '').toLowerCase();
if (!['open', 'close'].includes(mode)) {
  console.error('Usage: npm run sale:solana -- open|close');
  process.exit(1);
}

const env = loadEnv();
const deploymentPath = path.join(NFT_DIR, 'deployments', 'solana-mainnet.json');
if (!fs.existsSync(deploymentPath)) throw new Error('Missing deployments/solana-mainnet.json');

const deployment = JSON.parse(fs.readFileSync(deploymentPath, 'utf8'));
const rpcUrl = env.NFT_SOLANA_RPC_URL || env.SOLANA_RPC_URL || env.VITE_SOLANA_RPC_URL || deployment.rpcUrl || 'https://solana-rpc.publicnode.com';
const keypair = parseSolanaKeypair(env);
const umi = createUmi(rpcUrl).use(mplCore()).use(mplCandyMachine());
umi.use(keypairIdentity(umi.eddsa.createKeypairFromSecretKey(keypair.secretKey)));

const saleActive = mode === 'open';
const closedStartDate = env.NFT_SOLANA_CLOSED_START_DATE || '2100-01-01T00:00:00.000Z';
const startDate = saleActive ? null : closedStartDate;
const priceLamports = env.NFT_SOLANA_PRICE_LAMPORTS || env.NFT_SOLANA_PRICE_SOL || env.NFT_PRICE_SOL
  ? solanaPriceLamports(env)
  : BigInt(deployment.priceLamports || '0');
const destination = env.NFT_SOLANA_TREASURY
  ? requirePublicKey(env.NFT_SOLANA_TREASURY, 'NFT_SOLANA_TREASURY').toBase58()
  : publicKey(deployment.treasury || umi.identity.publicKey);

deployment.priceLamports = priceLamports.toString();
deployment.treasury = destination.toString();
deployment.saleActive = saleActive;
deployment.startDate = startDate;
if (!deployment.paymentGroups) {
  deployment.paymentGroups = {
    sol: {
      lamports: priceLamports.toString(),
      destination: destination.toString(),
    },
  };
} else if (deployment.paymentGroups.sol) {
  deployment.paymentGroups.sol.lamports = priceLamports.toString();
  deployment.paymentGroups.sol.destination = destination.toString();
}

const guardConfig = buildSolanaGuardConfig(deployment, { dateTime, lamports, none, publicKey, some });

const sig = await updateCandyGuard(umi, {
  candyGuard: publicKey(deployment.candyGuard),
  authority: umi.identity,
  ...guardConfig,
}).sendAndConfirm(umi);

deployment.updatedAt = new Date().toISOString();
fs.writeFileSync(deploymentPath, `${JSON.stringify(deployment, null, 2)}\n`);
console.log(`Solana sale ${mode}; signature=${sig.signature}`);
