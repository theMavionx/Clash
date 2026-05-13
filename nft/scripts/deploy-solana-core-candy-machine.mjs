import fs from 'node:fs';
import path from 'node:path';
import crypto from 'node:crypto';
import {
  loadEnv,
  NFT_DIR,
  parseSolanaKeypair,
  publicBaseUrl,
  requirePublicKey,
  solanaCollectionUri,
  solanaHiddenUri,
  solanaItemUri,
  solanaPriceLamports,
} from './lib-env.mjs';

const LAMPORTS_PER_SOL = 1_000_000_000;

async function getSolanaBalance(rpcUrl, address) {
  const response = await fetch(rpcUrl, {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify({
      jsonrpc: '2.0',
      id: 1,
      method: 'getBalance',
      params: [address],
    }),
  });
  const json = await response.json();
  if (json.error) throw new Error(json.error.message || JSON.stringify(json.error));
  return Number(json.result.value || 0);
}

const env = loadEnv();
const rpcUrl = env.NFT_SOLANA_RPC_URL || env.SOLANA_RPC_URL || env.VITE_SOLANA_RPC_URL || 'https://solana-rpc.publicnode.com';
const maxSupply = Number(env.NFT_SOLANA_SUPPLY || env.NFT_SUPPLY || 250);
if (maxSupply !== 250) throw new Error('This drop is expected to have exactly 250 Solana NFTs.');
const useConfigLines = env.NFT_SOLANA_USE_CONFIG_LINES === '1'
  || String(env.NFT_SOLANA_METADATA_MODE || '').toLowerCase() === 'config-lines';
const metadataMode = useConfigLines ? 'config-lines' : 'hidden-settings';

const solanaKeypair = parseSolanaKeypair(env);
const balance = await getSolanaBalance(rpcUrl, solanaKeypair.publicKey.toBase58());
const minSol = Number(env.NFT_SOLANA_DEPLOY_MIN_SOL || (useConfigLines ? '0.45' : '0.015'));
console.log(`Solana deployer: ${solanaKeypair.publicKey.toBase58()}`);
console.log(`Solana balance: ${balance / LAMPORTS_PER_SOL} SOL`);
console.log(`Solana metadata mode: ${metadataMode}`);
if (balance < Math.ceil(minSol * LAMPORTS_PER_SOL)) {
  console.error(`Solana balance is below ${minSol} SOL. Fund deployer before creating collection/candy machine.`);
  process.exit(1);
}

const { createUmi } = await import('@metaplex-foundation/umi-bundle-defaults');
const { dateTime, generateSigner, keypairIdentity, lamports, none, some, transactionBuilder } = await import('@metaplex-foundation/umi');
const { mplCore, createCollectionV1 } = await import('@metaplex-foundation/mpl-core');
const {
  addConfigLines,
  create,
  findCandyGuardPda,
  mplCandyMachine,
} = await import('@metaplex-foundation/mpl-core-candy-machine');

const umi = createUmi(rpcUrl).use(mplCore()).use(mplCandyMachine());
const umiKeypair = umi.eddsa.createKeypairFromSecretKey(solanaKeypair.secretKey);
umi.use(keypairIdentity(umiKeypair));

const name = env.NFT_NAME || 'Demon King';
const symbol = env.NFT_SYMBOL || 'DMNK';
const priceLamports = solanaPriceLamports(env);
const saleActive = env.NFT_SOLANA_SALE_ACTIVE === '1' || String(env.NFT_SOLANA_SALE_ACTIVE || '').toLowerCase() === 'true';
const closedStartDate = env.NFT_SOLANA_CLOSED_START_DATE || '2100-01-01T00:00:00.000Z';
const startDate = env.NFT_SOLANA_START_DATE || (saleActive ? null : closedStartDate);
const destination = env.NFT_SOLANA_TREASURY
  ? requirePublicKey(env.NFT_SOLANA_TREASURY, 'NFT_SOLANA_TREASURY').toBase58()
  : umi.identity.publicKey;

const collection = generateSigner(umi);
const candyMachine = generateSigner(umi);
const collectionUri = solanaCollectionUri(env);
const hiddenUri = solanaHiddenUri(env);
const hiddenHash = Uint8Array.from(
  crypto
    .createHash('sha256')
    .update(JSON.stringify({ name, symbol, hiddenUri, maxSupply }))
    .digest()
);

const configLineSettings = useConfigLines
  ? {
      prefixName: '',
      nameLength: 32,
      prefixUri: '',
      uriLength: 200,
      isSequential: true,
    }
  : none();
const hiddenSettings = useConfigLines
  ? none()
  : some({
      name,
      uri: hiddenUri,
      hash: hiddenHash,
    });

console.log(`Creating MPL Core collection: ${collection.publicKey}`);
console.log(`Creating Core Candy Machine: ${candyMachine.publicKey}`);
await transactionBuilder()
  .add(createCollectionV1(umi, {
    collection,
    name,
    uri: collectionUri,
    plugins: none(),
  }))
  .add(await create(umi, {
    candyMachine,
    collection: collection.publicKey,
    collectionUpdateAuthority: umi.identity,
    itemsAvailable: maxSupply,
    maxEditionSupply: 0,
    isMutable: true,
    configLineSettings,
    hiddenSettings,
    guards: {
      solPayment: some({
        lamports: lamports(priceLamports),
        destination,
      }),
      startDate: startDate ? some({ date: dateTime(startDate) }) : none(),
    },
    groups: [],
  }))
  .sendAndConfirm(umi);

if (useConfigLines) {
  const batchSize = Number(env.NFT_SOLANA_CONFIG_BATCH_SIZE || 8);
  for (let start = 0; start < maxSupply; start += batchSize) {
    const configLines = [];
    for (let i = start + 1; i <= Math.min(start + batchSize, maxSupply); i++) {
      configLines.push({
        name: `${name} #${i}`,
        uri: solanaItemUri(env, i),
      });
    }
    console.log(`Adding config lines ${start + 1}-${start + configLines.length}`);
    await addConfigLines(umi, {
      candyMachine: candyMachine.publicKey,
      index: start,
      configLines,
    }).sendAndConfirm(umi);
  }
} else {
  console.log(`Using hidden settings metadata: ${hiddenUri}`);
}

const [candyGuard] = findCandyGuardPda(umi, { base: candyMachine.publicKey });
const deployment = {
  chain: 'solana',
  standard: 'metaplex-core-candy-machine',
  rpcUrl,
  authority: umi.identity.publicKey,
  collection: collection.publicKey,
  candyMachine: candyMachine.publicKey,
  candyGuard,
  maxSupply,
  priceLamports: priceLamports.toString(),
  treasury: destination,
  saleActive,
  startDate,
  metadataBase: `${publicBaseUrl(env)}/api/nft/solana/`,
  metadataMode,
  collectionUri,
  hiddenUri: useConfigLines ? null : hiddenUri,
  hiddenHash: useConfigLines ? null : Buffer.from(hiddenHash).toString('hex'),
  deployedAt: new Date().toISOString(),
};
fs.mkdirSync(path.join(NFT_DIR, 'deployments'), { recursive: true });
fs.writeFileSync(path.join(NFT_DIR, 'deployments', 'solana-mainnet.json'), `${JSON.stringify(deployment, null, 2)}\n`);
console.log(`Solana deployment saved: ${path.join(NFT_DIR, 'deployments', 'solana-mainnet.json')}`);
