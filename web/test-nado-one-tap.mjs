import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { createNadoClient } from '@nadohq/client';
import { keccak256 } from 'viem';
import { privateKeyToAccount } from 'viem/accounts';
import { reconcileNadoLinkedSigner } from './src/lib/nadoLinkedSignerReconcile.js';

const hookSource = await readFile(new URL('./src/hooks/useNado.js', import.meta.url), 'utf8');
const panelSource = await readFile(new URL('./src/components/FuturesPanel.jsx', import.meta.url), 'utf8');
const sharedSetupSource = await readFile(new URL('./src/lib/nadoLinkedSignerSetup.js', import.meta.url), 'utf8');
const botAuthSource = await readFile(new URL('./src/lib/botGameAuth.js', import.meta.url), 'utf8');
const botCredentialsSource = await readFile(new URL('./src/lib/botGameCredentials.js', import.meta.url), 'utf8');

assert.match(
  panelSource,
  /dex === 'nado' \|\| dex === 'ondo' \|\| dex === 'katana' \|\| dex === 'flash' \|\| dex === 'ostium'/,
  'Nado OFF -> ENABLE must use the one-tap signer setup branch',
);
assert.match(
  hookSource,
  /linkedSignerApprovedRef\.current\s*&&\s*linkedSignerRef\.current/,
  'cached Nado signer must not be used until remote approval is confirmed',
);
assert.match(
  hookSource,
  /createStandardLinkedSigner\(NADO_SUBACCOUNT_NAME\)/,
  'Futures must recover Nado one-tap through the official deterministic signer API',
);
assert.match(
  sharedSetupSource,
  /createStandardLinkedSigner\(NADO_SUBACCOUNT_NAME\)/,
  'Bots and Futures must use the same recoverable Nado signer strategy',
);
assert.doesNotMatch(
  sharedSetupSource,
  /INK_RPC_URLS\.split\(/,
  'shared bot setup must not call String.split on the configured RPC URL array',
);
const nadoAuthBlock = botAuthSource.slice(
  botAuthSource.indexOf('async function ensureNadoReady'),
  botAuthSource.indexOf('async function ensureOstiumReady'),
);
assert.match(
  nadoAuthBlock,
  /await ensureNadoLinkedSignerReady\(/,
  'Nado bot readiness must verify or repair the signer remotely',
);
assert.ok(
  nadoAuthBlock.indexOf('await ensureNadoLinkedSignerReady(')
    < nadoAuthBlock.indexOf('if (linked?.privateKey) return { ok: true'),
  'bot readiness may read the local key only after remote verification/repair',
);
const nadoCredentialBlock = botCredentialsSource.slice(
  botCredentialsSource.indexOf("if (ex === 'nado')"),
  botCredentialsSource.indexOf("if (ex === 'pacifica')"),
);
assert.doesNotMatch(
  nadoCredentialBlock,
  /ensureGameExchangeReady/,
  'read-only Nado credential probing must not switch chains, sign, or relink',
);
const syncCredentialBlock = botCredentialsSource.slice(
  botCredentialsSource.indexOf('export async function syncGameAccountToPhantom'),
  botCredentialsSource.indexOf('export async function reconnectGameAccountToPhantom'),
);
assert.ok(
  syncCredentialBlock.indexOf("if (ex === 'nado')")
    < syncCredentialBlock.indexOf('const gathered = await gatherGameCredentials'),
  'explicit Nado sync must verify/repair before gathering and exporting the key',
);
assert.match(
  syncCredentialBlock,
  /await ensureGameExchangeReady\(ex, player, walletCtx\)/,
  'explicit Nado sync must run remote readiness',
);

const signature = `0x${'11'.repeat(65)}`;
const owner = '0x39b36f1edf2ef5a6f2e02991b3a85fb356eb5005';
const walletClient = {
  account: { address: owner },
  chain: { id: 57073 },
  signTypedData: async () => signature,
};
const client = createNadoClient('inkMainnet', {
  walletClient,
  publicClient: {},
});
const standard = await client.subaccount.createStandardLinkedSigner('default');
const expectedPrivateKey = keccak256(signature);
assert.equal(standard.privateKey, expectedPrivateKey);
assert.equal(standard.account.address, privateKeyToAccount(expectedPrivateKey).address);

const local = { address: '0x1111111111111111111111111111111111111111', privateKey: `0x${'22'.repeat(32)}` };
const external = '0x2222222222222222222222222222222222222222';
let remoteSigner = external;
let links = 0;
let creates = 0;
const repaired = await reconcileNadoLinkedSigner({
  stored: local,
  createStandardSigner: async () => { creates += 1; return local; },
  getRemote: async () => ({ signer: remoteSigner }),
  linkSigner: async signer => { links += 1; remoteSigner = `0x${signer.slice(2, 42)}`; },
  remember: record => record,
  normalizeSigner: value => String(value || '').toLowerCase(),
  encodeSigner: address => `${address}${'0'.repeat(24)}`,
  wait: async () => {},
});
assert.equal(repaired.record.address, local.address);
assert.equal(links, 1, 'remote mismatch must rotate back to the locally held key');
assert.equal(creates, 0, 'a recoverable local key must not request another wallet signature');

await assert.rejects(
  reconcileNadoLinkedSigner({
    stored: local,
    createStandardSigner: async () => local,
    getRemote: async () => ({ signer: external }),
    linkSigner: async () => {},
    remember: record => record,
    normalizeSigner: value => String(value || '').toLowerCase(),
    encodeSigner: address => address,
    wait: async () => {},
    maxAttempts: 2,
  }),
  /not active yet/,
  'failed remote verification must stay OFF and reject readiness',
);

console.log('PASS: Nado one-tap recovery uses verified, deterministic linked signer setup');
