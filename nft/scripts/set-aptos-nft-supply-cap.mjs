import fs from 'node:fs';
import path from 'node:path';
import {
  Account,
  Aptos,
  AptosConfig,
  Ed25519PrivateKey,
  Network,
} from '@aptos-labs/ts-sdk';
import { loadEnv, NFT_DIR } from './lib-env.mjs';

const DEFAULT_CAP = 333n;

const env = loadEnv();
const deploymentPath = path.join(NFT_DIR, 'deployments', 'aptos-mainnet.json');
const deployment = JSON.parse(fs.readFileSync(deploymentPath, 'utf8'));
const moduleId = deployment.module;
const targetCap = BigInt(env.NFT_TARGET_GLOBAL_SUPPLY_CAP || env.NFT_GLOBAL_SUPPLY_CAP || DEFAULT_CAP);

function aptosAccount() {
  const explicit = String(env.GAME_SHOP_APTOS_KEY || env.NFT_APTOS_KEY || '').trim();
  const mnemonic = String(env.GAME_SHOP_APTOS_MNEMONIC || env.NFT_BASE || '').trim();
  if (explicit) {
    return Account.fromPrivateKey({ privateKey: new Ed25519PrivateKey(explicit) });
  }
  if (!mnemonic) throw new Error('Missing GAME_SHOP_APTOS_KEY / NFT_APTOS_KEY / NFT_BASE mnemonic');
  return Account.fromDerivationPath({ path: "m/44'/637'/0'/0'/0'", mnemonic });
}

const account = aptosAccount();
const expectedAdmin = String(deployment.admin || '').toLowerCase();
if (expectedAdmin && account.accountAddress.toString().toLowerCase() !== expectedAdmin) {
  throw new Error(`Aptos signer ${account.accountAddress} is not deployment admin ${deployment.admin}`);
}

const fullnode = env.NFT_APTOS_RPC_URL || env.APTOS_RPC_URL || 'https://fullnode.mainnet.aptoslabs.com/v1';
const aptos = new Aptos(new AptosConfig({ network: Network.MAINNET, fullnode }));

console.log(`[aptos] module=${moduleId}`);
console.log(`[aptos] signer=${account.accountAddress}`);
console.log(`[aptos] target max_supply=${targetCap.toString()}`);

async function viewU64(functionName) {
  const result = await aptos.view({
    payload: {
      function: `${moduleId}::${functionName}`,
      functionArguments: [],
    },
  });
  return BigInt(result?.[0] || 0);
}

const [currentMax, totalMinted] = await Promise.all([
  viewU64('get_max_supply'),
  viewU64('get_total_minted'),
]);
console.log(`[aptos] max_supply=${currentMax.toString()} total_minted=${totalMinted.toString()}`);

if (totalMinted > targetCap) {
  throw new Error(`Aptos total_minted ${totalMinted} is above target cap ${targetCap}`);
}

if (currentMax <= targetCap) {
  console.log('[aptos] already at or below target; no on-chain change');
  deployment.currentMaxSupply = currentMax.toString();
  deployment.currentMaxSupplyCheckedAt = new Date().toISOString();
  fs.writeFileSync(deploymentPath, `${JSON.stringify(deployment, null, 2)}\n`);
  process.exit(0);
}

const aptBalance = await aptos.getAccountAPTAmount({ accountAddress: account.accountAddress }).catch(() => null);
console.log(`[aptos] signer_apt_balance_octas=${aptBalance == null ? 'unknown' : String(aptBalance)}`);
if (aptBalance != null && BigInt(aptBalance) === 0n) {
  throw new Error(`Aptos signer ${account.accountAddress} has 0 APT; fund it for gas before lowering max_supply`);
}

const gasUnitPrice = Number(env.NFT_APTOS_GAS_UNIT_PRICE || env.APTOS_GAS_UNIT_PRICE || 100);
const maxGasAmount = Number(env.NFT_APTOS_MAX_GAS_AMOUNT || env.APTOS_MAX_GAS_AMOUNT || 200000);
const maxFeeOctas = BigInt(gasUnitPrice) * BigInt(maxGasAmount);
console.log(`[aptos] gas_unit_price=${gasUnitPrice} max_gas_amount=${maxGasAmount} max_fee_octas=${maxFeeOctas.toString()}`);
if (aptBalance != null && BigInt(aptBalance) < maxFeeOctas) {
  throw new Error(
    `Aptos signer ${account.accountAddress} has ${aptBalance} octas, below max fee budget ${maxFeeOctas}; `
    + 'fund it or lower NFT_APTOS_MAX_GAS_AMOUNT/NFT_APTOS_GAS_UNIT_PRICE',
  );
}

const tx = await aptos.transaction.build.simple({
  sender: account.accountAddress,
  data: {
    function: `${moduleId}::set_max_supply`,
    functionArguments: [targetCap.toString()],
  },
  options: {
    gasUnitPrice,
    maxGasAmount,
  },
});
const submitted = await aptos.signAndSubmitTransaction({ signer: account, transaction: tx });
console.log(`[aptos] tx=${submitted.hash}`);
await aptos.waitForTransaction({ transactionHash: submitted.hash });

const postMax = await viewU64('get_max_supply');
if (postMax !== targetCap) throw new Error(`Aptos max_supply mismatch: expected ${targetCap}, got ${postMax}`);

deployment.currentMaxSupply = targetCap.toString();
deployment.currentMaxSupplyTxHash = submitted.hash;
deployment.currentMaxSupplyUpdatedAt = new Date().toISOString();
fs.writeFileSync(deploymentPath, `${JSON.stringify(deployment, null, 2)}\n`);
console.log('[aptos] ok updated aptos-mainnet.json');
