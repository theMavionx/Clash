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

const env = loadEnv();
const deploymentPath = path.join(NFT_DIR, 'deployments', 'aptos-mainnet.json');
const deployment = JSON.parse(fs.readFileSync(deploymentPath, 'utf8'));
const moduleId = deployment.module;
const feeOctas = BigInt(env.NFT_BRIDGE_APTOS_FEE_OCTAS || '21000000');

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
console.log(`[aptos] target fee=${feeOctas.toString()} octas`);

let currentFee = null;
try {
  const view = await aptos.view({
    payload: {
      function: `${moduleId}::get_bridge_fee_octas`,
      functionArguments: [],
    },
  });
  currentFee = BigInt(view?.[0] || 0);
  console.log(`[aptos] current fee=${currentFee.toString()} octas`);
} catch (err) {
  console.log(`[aptos] current fee unreadable before tx (${err?.message || err})`);
}

if (currentFee === feeOctas) {
  console.log('[aptos] already set');
  process.exit(0);
}

const tx = await aptos.transaction.build.simple({
  sender: account.accountAddress,
  data: {
    function: `${moduleId}::set_bridge_fee_octas`,
    functionArguments: [feeOctas.toString()],
  },
});
const submitted = await aptos.signAndSubmitTransaction({ signer: account, transaction: tx });
console.log(`[aptos] tx=${submitted.hash}`);
await aptos.waitForTransaction({ transactionHash: submitted.hash });

const view = await aptos.view({
  payload: {
    function: `${moduleId}::get_bridge_fee_octas`,
    functionArguments: [],
  },
});
const postFee = BigInt(view?.[0] || 0);
if (postFee !== feeOctas) throw new Error(`Aptos fee mismatch: expected ${feeOctas}, got ${postFee}`);

deployment.bridgeFeeOctas = feeOctas.toString();
deployment.bridgeFeeTxHash = submitted.hash;
deployment.bridgeFeeUpdatedAt = new Date().toISOString();
fs.writeFileSync(deploymentPath, `${JSON.stringify(deployment, null, 2)}\n`);
console.log('[aptos] ok updated aptos-mainnet.json');
