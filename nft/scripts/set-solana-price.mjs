import fs from 'node:fs';
import path from 'node:path';
import { createUmi } from '@metaplex-foundation/umi-bundle-defaults';
import { keypairIdentity, lamports, publicKey, some } from '@metaplex-foundation/umi';
import { mplCore } from '@metaplex-foundation/mpl-core';
import { mplCandyMachine, updateCandyGuard } from '@metaplex-foundation/mpl-core-candy-machine';
import {
  loadEnv,
  NFT_DIR,
  parseSolanaKeypair,
  requirePublicKey,
  solanaPriceLamports,
} from './lib-env.mjs';

const env = loadEnv();
const deploymentPath = path.join(NFT_DIR, 'deployments', 'solana-mainnet.json');
if (!fs.existsSync(deploymentPath)) throw new Error('Missing deployments/solana-mainnet.json');

const deployment = JSON.parse(fs.readFileSync(deploymentPath, 'utf8'));
const rpcUrl = env.NFT_SOLANA_RPC_URL || env.SOLANA_RPC_URL || env.VITE_SOLANA_RPC_URL || deployment.rpcUrl || 'https://solana-rpc.publicnode.com';
const keypair = parseSolanaKeypair(env);
const umi = createUmi(rpcUrl).use(mplCore()).use(mplCandyMachine());
umi.use(keypairIdentity(umi.eddsa.createKeypairFromSecretKey(keypair.secretKey)));

const priceLamports = solanaPriceLamports(env);
const destination = env.NFT_SOLANA_TREASURY
  ? requirePublicKey(env.NFT_SOLANA_TREASURY, 'NFT_SOLANA_TREASURY').toBase58()
  : publicKey(deployment.treasury || umi.identity.publicKey);

const sig = await updateCandyGuard(umi, {
  candyGuard: publicKey(deployment.candyGuard),
  authority: umi.identity,
  guards: {
    solPayment: some({
      lamports: lamports(priceLamports),
      destination,
    }),
  },
  groups: [],
}).sendAndConfirm(umi);

deployment.priceLamports = priceLamports.toString();
deployment.treasury = destination.toString();
deployment.updatedAt = new Date().toISOString();
fs.writeFileSync(deploymentPath, `${JSON.stringify(deployment, null, 2)}\n`);
console.log(`Solana price updated to ${priceLamports.toString()} lamports; signature=${sig.signature}`);
