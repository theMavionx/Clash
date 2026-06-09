import fs from 'node:fs';
import path from 'node:path';
import { Account, Aptos, AptosConfig, Ed25519PrivateKey, Network } from '@aptos-labs/ts-sdk';
import { loadEnv, NFT_DIR } from './lib-env.mjs';

function argValue(name, fallback = '') {
  const row = process.argv.slice(2).find((a) => a === `--${name}` || a.startsWith(`--${name}=`));
  if (!row) return fallback;
  if (row === `--${name}`) return '1';
  return row.split('=').slice(1).join('=');
}

function normalizeSlug(value) {
  return String(value || '').trim().toLowerCase().replace(/[^a-z0-9-]+/g, '-').replace(/^-+|-+$/g, '') || 'dragon';
}

function aptosAccount(env) {
  const explicit = String(env.GAME_SHOP_APTOS_KEY || env.NFT_APTOS_KEY || '').trim();
  const mnemonic = String(env.GAME_SHOP_APTOS_MNEMONIC || env.NFT_BASE || '').trim();
  if (explicit) return Account.fromPrivateKey({ privateKey: new Ed25519PrivateKey(explicit) });
  if (!mnemonic) throw new Error('Missing GAME_SHOP_APTOS_KEY / NFT_APTOS_KEY / GAME_SHOP_APTOS_MNEMONIC / NFT_BASE');
  return Account.fromDerivationPath({ path: "m/44'/637'/0'/0'/0'", mnemonic });
}

const mode = String(process.argv[2] || '').toLowerCase();
if (!['open', 'close'].includes(mode)) {
  console.error('Usage: npm run sale:aptos -- open|close [-- --collection=dragon]');
  process.exit(1);
}

const env = loadEnv();
const collection = normalizeSlug(argValue('collection', env.NFT_COLLECTION_SLUG || env.NEW_NFT_SLUG || 'dragon'));
const deploymentFile = collection === 'demonking' ? 'aptos-mainnet.json' : `${collection}-aptos-mainnet.json`;
const deploymentPath = path.join(NFT_DIR, 'deployments', deploymentFile);
if (!fs.existsSync(deploymentPath)) throw new Error(`Missing deployments/${deploymentFile}`);

const deployment = JSON.parse(fs.readFileSync(deploymentPath, 'utf8'));
const moduleId = deployment.module;
if (!moduleId) throw new Error(`Missing module in deployments/${deploymentFile}`);

const account = aptosAccount(env);
const expectedAdmin = String(deployment.admin || '').toLowerCase();
if (expectedAdmin && account.accountAddress.toString().toLowerCase() !== expectedAdmin) {
  throw new Error(`Aptos signer ${account.accountAddress} is not deployment admin ${deployment.admin}`);
}

const fullnode = env.NFT_APTOS_RPC_URL || env.APTOS_RPC_URL || 'https://fullnode.mainnet.aptoslabs.com/v1';
const aptos = new Aptos(new AptosConfig({ network: Network.MAINNET, fullnode }));
const targetActive = mode === 'open';

async function viewSaleActive() {
  const result = await aptos.view({
    payload: {
      function: `${moduleId}::get_sale_active`,
      functionArguments: [],
    },
  });
  return result?.[0] === true || result?.[0] === 'true';
}

console.log(`[aptos:${collection}] module=${moduleId}`);
console.log(`[aptos:${collection}] signer=${account.accountAddress}`);
const currentActive = await viewSaleActive();
console.log(`[aptos:${collection}] current saleActive=${currentActive}`);
console.log(`[aptos:${collection}] target  saleActive=${targetActive}`);

if (currentActive !== targetActive) {
  const gasUnitPrice = Number(env.NFT_APTOS_GAS_UNIT_PRICE || env.APTOS_GAS_UNIT_PRICE || 100);
  const maxGasAmount = Number(env.NFT_APTOS_MAX_GAS_AMOUNT || env.APTOS_MAX_GAS_AMOUNT || 200000);
  const tx = await aptos.transaction.build.simple({
    sender: account.accountAddress,
    data: {
      function: `${moduleId}::set_sale_active`,
      functionArguments: [targetActive],
    },
    options: { gasUnitPrice, maxGasAmount },
  });
  const submitted = await aptos.signAndSubmitTransaction({ signer: account, transaction: tx });
  console.log(`[aptos:${collection}] set_sale_active tx=${submitted.hash}`);
  await aptos.waitForTransaction({ transactionHash: submitted.hash });
  deployment.saleActivateTxHash = targetActive ? submitted.hash : deployment.saleActivateTxHash || null;
  deployment.saleCloseTxHash = targetActive ? deployment.saleCloseTxHash || null : submitted.hash;
} else {
  console.log(`[aptos:${collection}] sale already ${mode}`);
}

deployment.saleActive = targetActive;
deployment.saleUpdatedAt = new Date().toISOString();
fs.writeFileSync(deploymentPath, `${JSON.stringify(deployment, null, 2)}\n`);
console.log(`[aptos:${collection}] ok`);
