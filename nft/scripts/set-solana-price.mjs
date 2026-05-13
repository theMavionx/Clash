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

const env = loadEnv();
const deploymentPath = path.join(NFT_DIR, 'deployments', 'solana-mainnet.json');
if (!fs.existsSync(deploymentPath)) throw new Error('Missing deployments/solana-mainnet.json');

const deployment = JSON.parse(fs.readFileSync(deploymentPath, 'utf8'));
const rpcUrl = env.NFT_SOLANA_RPC_URL || env.SOLANA_RPC_URL || env.VITE_SOLANA_RPC_URL || deployment.rpcUrl || 'https://solana-rpc.publicnode.com';
const keypair = parseSolanaKeypair(env);
const umi = createUmi(rpcUrl).use(mplCore()).use(mplCandyMachine());
umi.use(keypairIdentity(umi.eddsa.createKeypairFromSecretKey(keypair.secretKey)));

const priceLamports = solanaPriceLamports(env);
const saleActive = deployment.saleActive === true;
const startDate = env.NFT_SOLANA_START_DATE
  || deployment.startDate
  || (saleActive ? null : (env.NFT_SOLANA_CLOSED_START_DATE || '2100-01-01T00:00:00.000Z'));
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
console.log(`Solana price updated to ${priceLamports.toString()} lamports; signature=${sig.signature}`);
