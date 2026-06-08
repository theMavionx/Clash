import fs from 'node:fs';
import path from 'node:path';
import { Account, Aptos, AptosConfig, Ed25519PrivateKey, Network } from '@aptos-labs/ts-sdk';
import { decimalToUnits } from './lib-prices.mjs';
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

function envKeyPart(value) {
  return String(value || '').toUpperCase().replace(/[^A-Z0-9]+/g, '_');
}

function aptosAccount(env) {
  const explicit = String(env.GAME_SHOP_APTOS_KEY || env.NFT_APTOS_KEY || '').trim();
  const mnemonic = String(env.GAME_SHOP_APTOS_MNEMONIC || env.NFT_BASE || '').trim();
  if (explicit) return Account.fromPrivateKey({ privateKey: new Ed25519PrivateKey(explicit) });
  if (!mnemonic) throw new Error('Missing GAME_SHOP_APTOS_KEY / NFT_APTOS_KEY / NFT_BASE mnemonic');
  return Account.fromDerivationPath({ path: "m/44'/637'/0'/0'/0'", mnemonic });
}

const env = loadEnv();
const collection = normalizeSlug(argValue('collection', env.NFT_COLLECTION_SLUG || env.NEW_NFT_SLUG || 'dragon'));
const collectionKey = envKeyPart(collection);
const deploymentFile = collection === 'demonking' ? 'aptos-mainnet.json' : `${collection}-aptos-mainnet.json`;
const deploymentPath = path.join(NFT_DIR, 'deployments', deploymentFile);
if (!fs.existsSync(deploymentPath)) throw new Error(`Missing deployments/${deploymentFile}`);

const deployment = JSON.parse(fs.readFileSync(deploymentPath, 'utf8'));
const moduleId = deployment.module;
const account = aptosAccount(env);
const expectedAdmin = String(deployment.admin || '').toLowerCase();
if (expectedAdmin && account.accountAddress.toString().toLowerCase() !== expectedAdmin) {
  throw new Error(`Aptos signer ${account.accountAddress} is not deployment admin ${deployment.admin}`);
}

const target = decimalToUnits(
  env[`NFT_${collectionKey}_APTOS_USD_PRICE`]
    || env[`NFT_${collectionKey}_USD_PRICE`]
    || env.NFT_APTOS_USD_PRICE
    || env.NFT_COLLECTION_USD_PRICE
    || (collection === 'dragon' ? '15' : '5.5'),
  6,
);
const fullnode = env.NFT_APTOS_RPC_URL || env.APTOS_RPC_URL || 'https://fullnode.mainnet.aptoslabs.com/v1';
const aptos = new Aptos(new AptosConfig({ network: Network.MAINNET, fullnode }));

async function viewU64(functionName) {
  const result = await aptos.view({
    payload: {
      function: `${moduleId}::${functionName}`,
      functionArguments: [],
    },
  });
  return BigInt(result?.[0] || 0);
}

console.log(`[aptos:${collection}] module=${moduleId}`);
console.log(`[aptos:${collection}] signer=${account.accountAddress}`);
const current = await viewU64('get_mint_price').catch(async () => BigInt(deployment.mintUsdPriceE6 || 0));
console.log(`[aptos:${collection}] current mintUsdPriceE6=${current.toString()}`);
console.log(`[aptos:${collection}] target  mintUsdPriceE6=${target.toString()}`);

if (current !== target) {
  const gasUnitPrice = Number(env.NFT_APTOS_GAS_UNIT_PRICE || env.APTOS_GAS_UNIT_PRICE || 100);
  const maxGasAmount = Number(env.NFT_APTOS_MAX_GAS_AMOUNT || env.APTOS_MAX_GAS_AMOUNT || 200000);
  const tx = await aptos.transaction.build.simple({
    sender: account.accountAddress,
    data: {
      function: `${moduleId}::set_mint_price`,
      functionArguments: [target.toString()],
    },
    options: { gasUnitPrice, maxGasAmount },
  });
  const submitted = await aptos.signAndSubmitTransaction({ signer: account, transaction: tx });
  console.log(`[aptos:${collection}] set_mint_price tx=${submitted.hash}`);
  await aptos.waitForTransaction({ transactionHash: submitted.hash });
  deployment.mintPriceTxHash = submitted.hash;
  deployment.mintPriceUpdatedAt = new Date().toISOString();
} else {
  console.log(`[aptos:${collection}] price already matches`);
}

deployment.mintUsdPriceE6 = target.toString();
deployment.mintPriceCheckedAt = new Date().toISOString();
fs.writeFileSync(deploymentPath, `${JSON.stringify(deployment, null, 2)}\n`);
console.log(`[aptos:${collection}] ok`);
