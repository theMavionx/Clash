// End-to-end smoke test that drives the server orchestrator over HTTP.
//
// Unlike the inline smoke tests (smoke-test-bridge-aptos-to-base.mjs etc.)
// that perform receipt signing themselves, this one talks to a running
// node server's /bridge/init and /bridge/confirm endpoints — exactly the
// path a real player goes through.
//
// Usage:
//   node nft/scripts/smoke-test-bridge-orchestrator.mjs \
//     --source=aptos --dest=base --baseUrl=http://localhost:4000 \
//     --token=0xcb284b8fa792833571f53ca8297be6765af2a659a1d3db51085cb981f8e68efa
//
//   node nft/scripts/smoke-test-bridge-orchestrator.mjs \
//     --source=arbitrum --dest=base --baseUrl=http://localhost:4000
//      (defaults to adminMint + bridgeBurn on Arbitrum, mint on Base)
//
// Required env:
//   NFT_EVM_KEY or NFT_BASE  — for EVM source signing (adminMint, bridgeBurn).
//   APTOS_CLI_PATH           — for Aptos source CLI invocations (auto-fallback to ./tools/aptos-cli/aptos.exe).
//   NFT_SOLANA_KEY           — for Solana source signing (asset burn).
//
// Cost per run: $0.005-0.05 depending on chains involved.

import fs from 'node:fs';
import path from 'node:path';
import { spawnSync } from 'node:child_process';
import {
  createPublicClient,
  createWalletClient,
  getAddress,
  http,
} from 'viem';
import { base, arbitrum } from 'viem/chains';
import { loadEnv, NFT_DIR, parseEthAccount, parseSolanaKeypair } from './lib-env.mjs';

const args = Object.fromEntries(
  process.argv.slice(2).map((a) => {
    const i = a.indexOf('=');
    return i === -1 ? [a.replace(/^--/, ''), 'true'] : [a.slice(2, i), a.slice(i + 1)];
  }),
);

const SOURCE   = (args.source || 'arbitrum').toLowerCase();
const DEST     = (args.dest   || 'base').toLowerCase();
const BASE_URL = (args.baseUrl || process.env.NFT_BRIDGE_BASE_URL || 'http://localhost:4000').replace(/\/+$/, '');

const env = loadEnv();

async function post(pathname, body) {
  const r = await fetch(`${BASE_URL}${pathname}`, {
    method: 'POST', headers: { 'content-type': 'application/json' },
    body: JSON.stringify(body),
  });
  const text = await r.text();
  let j; try { j = JSON.parse(text); } catch { j = { raw: text }; }
  if (!r.ok) {
    const e = new Error(`${pathname} → ${r.status} ${j?.error || text.slice(0, 200)}`);
    e.status = r.status; e.body = j; throw e;
  }
  return j;
}

function readEvmDeployment(chain) {
  return JSON.parse(fs.readFileSync(path.join(NFT_DIR, 'deployments', `${chain}-v3-mainnet.json`), 'utf8'));
}

const CHAINS = {
  base:     { id: 8453,  viem: base,     rpcEnvs: ['NFT_BASE_RPC_URL', 'BASE_RPC_URL'],         defaultRpc: 'https://mainnet.base.org' },
  arbitrum: { id: 42161, viem: arbitrum, rpcEnvs: ['NFT_ARBITRUM_RPC_URL', 'ARBITRUM_RPC_URL'], defaultRpc: 'https://arb1.arbitrum.io/rpc' },
};

function rpcUrlFor(chain) {
  const spec = CHAINS[chain]; if (!spec) return null;
  for (const k of spec.rpcEnvs) if (env[k]) return env[k];
  return spec.defaultRpc;
}

// Resolve destAddress for a given destination chain. EVM dests use the
// deployer's EVM address; Aptos uses the same (Aptos accounts can be
// derived from ed25519 but for tests we use a known target like the
// admin address from the deployment); Solana uses the parsed keypair.
function destAddressFor(destChain) {
  if (CHAINS[destChain] || destChain === 'base' || destChain === 'arbitrum' || destChain === 'monad') {
    const { account } = parseEthAccount(env);
    return getAddress(account.address);
  }
  if (destChain === 'aptos') {
    if (args.destAddr) return args.destAddr;
    const dep = JSON.parse(fs.readFileSync(path.join(NFT_DIR, 'deployments', 'aptos-mainnet.json'), 'utf8'));
    return dep.admin;
  }
  if (destChain === 'solana') {
    if (args.destAddr) return args.destAddr;
    return parseSolanaKeypair(env).publicKey.toBase58();
  }
  throw new Error(`Unsupported destChain ${destChain}`);
}

// ─── EVM source: adminMint (test prep) + bridgeBurn ────────────────────
async function evmAdminMintAndBurn({ sourceChain, destChain, prebuiltTokenId }) {
  const { account } = parseEthAccount(env);
  const me = getAddress(account.address);
  const dep = readEvmDeployment(sourceChain);
  const proxy = getAddress(dep.proxy);
  const spec = CHAINS[sourceChain];
  if (!spec) throw new Error(`EVM source ${sourceChain} not in CHAINS map`);
  const pub = createPublicClient({ chain: spec.viem, transport: http(rpcUrlFor(sourceChain)) });
  const wal = createWalletClient({ account, chain: spec.viem, transport: http(rpcUrlFor(sourceChain)) });
  const destAddress = destAddressFor(destChain);

  const ABI = [
    { name: 'adminMint',  type: 'function', stateMutability: 'nonpayable',
      inputs: [{ type: 'address' }, { type: 'uint256' }], outputs: [] },
    { name: 'totalMinted', type: 'function', stateMutability: 'view',
      inputs: [], outputs: [{ type: 'uint256' }] },
    { name: 'bridgeBurn', type: 'function', stateMutability: 'nonpayable',
      inputs: [{ type: 'uint256' }, { type: 'uint256' }], outputs: [] },
  ];

  let tokenId;
  if (prebuiltTokenId !== undefined) {
    tokenId = BigInt(prebuiltTokenId);
    console.log(`[evm-source] reusing existing tokenId ${tokenId}`);
  } else {
    console.log(`[evm-source] adminMint on ${sourceChain} to ${me}…`);
    const pre = await pub.readContract({ address: proxy, abi: ABI, functionName: 'totalMinted' });
    const mintHash = await wal.writeContract({ address: proxy, abi: ABI, functionName: 'adminMint', args: [me, 1n] });
    await pub.waitForTransactionReceipt({ hash: mintHash, confirmations: 2 });
    tokenId = pre + 1n;
    console.log(`  ✓ tokenId ${tokenId} (tx ${mintHash})`);
  }

  const init = await post('/bridge/init', {
    sourceChain, destChain, sourceTokenId: tokenId.toString(), destAddress,
  });
  console.log(`[orchestrator] /bridge/init → mode=${init.mode}, destChainId=${init.destChainId}, destAddress=${destAddress}`);

  const burnHash = await wal.writeContract({
    address: proxy, abi: ABI, functionName: 'bridgeBurn',
    args: [tokenId, BigInt(init.destChainId)],
  });
  await pub.waitForTransactionReceipt({ hash: burnHash, confirmations: 2 });
  console.log(`  ✓ bridgeBurn tx ${burnHash}`);
  return { burnTxHash: burnHash, destAddress };
}

// ─── Aptos source: bridge_burn via aptos CLI ───────────────────────────
async function aptosBurn({ sourceTokenAddress, destChainId }) {
  const APTOS_BIN = process.env.APTOS_CLI_PATH
    || path.resolve(NFT_DIR, '..', 'tools', 'aptos-cli', 'aptos.exe');
  const APTOS_CWD = path.resolve(NFT_DIR, 'move', 'clash_nft');
  const aptosDeploy = JSON.parse(fs.readFileSync(path.join(NFT_DIR, 'deployments', 'aptos-mainnet.json'), 'utf8'));
  const moduleAddr = aptosDeploy.admin;
  console.log(`[aptos-source] bridge_burn(token=${sourceTokenAddress}, dest=${destChainId})…`);
  const res = spawnSync(APTOS_BIN, [
    'move', 'run', '--profile', 'mainnet',
    '--function-id', `${moduleAddr}::demon_king::bridge_burn`,
    '--args', `address:${sourceTokenAddress}`, `u64:${destChainId}`,
    '--assume-yes',
  ], { encoding: 'utf8', cwd: APTOS_CWD });
  if (res.status !== 0) {
    console.error(res.stdout || ''); console.error(res.stderr || '');
    throw new Error('Aptos bridge_burn failed');
  }
  const txHash = res.stdout.match(/"transaction_hash"\s*:\s*"(0x[0-9a-f]+)"/)?.[1];
  if (!txHash) throw new Error('Could not parse Aptos transaction_hash from CLI output');
  console.log(`  ✓ Aptos burn tx ${txHash}`);
  return txHash;
}

// ─── Dispatch ─────────────────────────────────────────────────────────
console.log(`\n══════ orchestrator smoke ${SOURCE} → ${DEST} via ${BASE_URL} ══════`);

let burnTxHash, destAddress, sourceMeta = {};

if (CHAINS[SOURCE]) {
  // EVM source: adminMint + bridgeBurn. --tokenId=<n> reuses an
  // existing token (e.g. a prior aborted run that already minted).
  const r = await evmAdminMintAndBurn({
    sourceChain: SOURCE, destChain: DEST,
    prebuiltTokenId: args.tokenId !== undefined ? args.tokenId : undefined,
  });
  burnTxHash = r.burnTxHash; destAddress = r.destAddress;
} else if (SOURCE === 'aptos') {
  const token = args.token;
  if (!token) throw new Error('--token=<aptosTokenAddress> required when source=aptos');
  sourceMeta.sourceTokenAddress = token;
  destAddress = args.dest === 'aptos' ? args.destAddr : parseEthAccount(env).account.address;
  if (!destAddress) throw new Error('--destAddr=<dest hex/base58 addr> required');
  const init = await post('/bridge/init', { sourceChain: SOURCE, destChain: DEST, sourceTokenAddress: token, destAddress });
  console.log(`[orchestrator] /bridge/init → ${init.mode}, destChainId=${init.destChainId}`);
  burnTxHash = await aptosBurn({ sourceTokenAddress: token, destChainId: init.destChainId });
} else if (SOURCE === 'solana') {
  throw new Error('Solana source flow not yet automated in this smoke test — run the burn manually then POST /bridge/confirm with the tx sig.');
} else {
  throw new Error(`Unknown source: ${SOURCE}`);
}

// /bridge/confirm
console.log(`\n[orchestrator] /bridge/confirm  source=${SOURCE} dest=${DEST}`);
const confirm = await post('/bridge/confirm', {
  sourceChain: SOURCE, destChain: DEST, burnTxHash, destAddress, ...sourceMeta,
});
console.log(`  ✓ mode=${confirm.mode}`);
console.log(`  sourceRef = ${confirm.sourceRef}`);
console.log(`  level     = ${confirm.burned?.level}`);

if (confirm.mode === 'evm-receipt') {
  console.log(`  destContract = ${confirm.destContract}`);
  console.log(`  signature    = ${String(confirm.signature).slice(0, 18)}…`);
  console.log(`  callData     = bridgeMint(${confirm.callData.args.join(', ')})`);
  console.log(`  → Submit the bridgeMint call on ${DEST} to complete the bridge.`);
} else if (confirm.mode === 'aptos-receipt') {
  console.log(`  destModule = ${confirm.destModule}`);
  console.log(`  signature  = ${String(confirm.signature).slice(0, 18)}…`);
  console.log(`  → Submit bridge_mint on Aptos with the returned args.`);
} else if (confirm.mode === 'solana-mint') {
  console.log(`  assetAddress = ${confirm.assetAddress}`);
  console.log(`  txSig        = ${confirm.txSig}`);
  console.log(`  → Already done. Bridge complete server-side.`);
}

console.log(`\n══════════════════════════════════════════════════════════`);
console.log(`  ✓ ORCHESTRATOR SMOKE PASSED  ${SOURCE} → ${DEST}`);
console.log(`══════════════════════════════════════════════════════════`);
