import assert from 'node:assert/strict';
import test from 'node:test';
import fs from 'node:fs';
import vm from 'node:vm';
import crypto from 'node:crypto';
import { createRequire } from 'node:module';
import { createCredentialVaultSync } from './src/lib/credentialVaultSync.js';

const require = createRequire(new URL('../server/package.json', import.meta.url));
const { privateKeyToAccount } = require('viem/accounts');
const nacl = require('tweetnacl');
const bs58 = require('bs58').default || require('bs58');
const { canonicalUnlockWallet, verifyUnlockProof } = require('../server/trading_credential_unlock.js');

// Evaluate the production pure flow without mounting React or loading wallet SDK/provider trees.
// Only import/export declarations are removed; executable flow/signing code is unchanged.
const source = fs.readFileSync(new URL('./src/hooks/useCredentialVaultUnlock.js', import.meta.url), 'utf8');
const executable = source.replace(/^import .*;\r?\n/gmu, '').replace(/^export default .*;$/gmu, '').replace(/^export function /gmu, 'function ');
const { createCredentialVaultUnlocker } = vm.runInNewContext(`${executable}\n({ createCredentialVaultUnlocker });`, {
  TextEncoder, Uint8Array, AbortController, setTimeout, clearTimeout,
});
const ORIGIN = 'https://clashofperps.fun';
const account = () => privateKeyToAccount(`0x${crypto.randomBytes(32).toString('hex')}`);
const hex = value => `0x${Buffer.from(value).toString('hex')}`;
const aptosKey = pair => `0x${crypto.createHash('sha3-256').update(pair.publicKey).update(Buffer.from([0])).digest('hex')}`;

function challengeFor(wallet, playerId = 'alice') {
  const target = canonicalUnlockWallet(wallet), challengeId = crypto.randomBytes(32).toString('base64url');
  const issuedAt = new Date().toISOString(), expiresAt = new Date(Date.now() + 120_000).toISOString();
  return { ...target, challengeId, nonce: challengeId, expiresAt, message: [
    'Clash trading credential vault', 'Version: 1', 'Action: unlock-trading-credentials', `Origin: ${ORIGIN}`,
    `Player: ${playerId}`, `Wallet: ${target.wallet}`, `Chain: ${target.chain}`, `Nonce: ${challengeId}`,
    `Issued At: ${issuedAt}`, `Expires At: ${expiresAt}`,
    'Authorize this browser to access your saved trading credentials. This does not submit a transaction.',
  ].join('\n') };
}

function harness(options = {}) {
  const signer = account(), prompts = [], requests = [], notifications = [];
  let epoch = 1, currentToken = 'alice-token', currentPlayer = 'alice', challenge;
  let context = {
    token: 'alice-token', playerId: 'alice',
    evmWallet: {
      address: signer.address,
      provider: { request: async ({ method }) => { assert.equal(method, 'eth_accounts'); return [signer.address]; } },
      walletClient: {
        account: { address: signer.address },
        signMessage: async input => {
          prompts.push(input);
          const signature = await signer.signMessage(input);
          await options.duringSign?.(h);
          return signature;
        },
      },
    },
    onUnlocked: result => { notifications.push(result); },
  };
  const unlock = createCredentialVaultUnlocker({
    getContext: () => context,
    captureScope: options.captureScope || (() => ({ playerId: currentPlayer, epoch })),
    assertScope: options.assertScope || ((scope, expected) => {
      assert.equal(Object.hasOwn(scope, 'token'), false, 'scope never exposes a token');
      if (scope.epoch !== epoch || scope.playerId !== currentPlayer || expected.token !== currentToken) {
        throw Object.assign(new Error('Stale scope'), { code: 'VAULT_SCOPE_CHANGED' });
      }
    }),
    getOrigin: () => ORIGIN,
    fetchImpl: async (url, input) => {
      const body = JSON.parse(input.body);
      requests.push({ url, ...input, body });
      if (options.responseError) return options.responseError;
      assert.equal(input.credentials, 'include');
      assert.equal(input.headers['x-token'], 'alice-token');
      if (url.endsWith('/challenge')) {
        challenge = challengeFor(body.wallet);
        await options.duringChallenge?.(h, challenge);
        return { ok: true, json: async () => { await options.duringChallengeBody?.(h); return challenge; } };
      }
      assert.ok(url.endsWith('/unlock'));
      assert.equal(body.challengeId, challenge.challengeId);
      const verified = await verifyUnlockProof(challenge, body, { lookupAptosAuthenticationKey: async () => options.aptosAuthenticationKey });
      await options.duringUnlock?.(h);
      return { ok: verified, json: async () => verified
        ? { ok: true, unlocked: true, verifiedWallet: challenge.wallet, expiresAt: new Date(Date.now() + 3600_000).toISOString() }
        : { error: 'Invalid proof', code: 'VAULT_SIGNATURE_INVALID' } };
    },
  });
  const h = { signer, prompts, requests, notifications, unlock,
    get context() { return context; }, set context(value) { context = value; },
    invalidate: (token = 'new-token', player = 'alice') => { epoch++; currentToken = token; currentPlayer = player; },
    setCurrentToken: token => { currentToken = token; },
  };
  return h;
}

test('EVM fake wallet signs exactly one server challenge and unlocks only after verified response', async () => {
  const h = harness();
  assert.equal(h.prompts.length, 0, 'constructing the flow does not prompt');
  const result = await h.unlock(h.signer.address);
  assert.equal(result.unlocked, true); assert.equal(h.prompts.length, 1); assert.equal(h.requests.length, 2);
  assert.equal(h.prompts[0].account, h.signer.address.toLowerCase());
  assert.match(h.prompts[0].message, /Action: unlock-trading-credentials/);
  assert.deepEqual(h.requests[0].body, { wallet: h.signer.address.toLowerCase() });
  assert.deepEqual(Object.keys(h.requests[1].body).sort(), ['challengeId', 'signature']);
  assert.equal(h.notifications.length, 1);
});

test('stale expected player or token at start cannot request a challenge or open a prompt', async () => {
  for (const change of ['player', 'token']) {
    const h = harness();
    if (change === 'player') h.invalidate('bob-token', 'bob');
    else h.setCurrentToken('new-token');
    await assert.rejects(h.unlock(h.signer.address), { code: 'VAULT_SCOPE_CHANGED' });
    assert.equal(h.prompts.length, 0); assert.equal(h.requests.length, 0);
  }
});

test('account switch while challenge request or JSON body is pending prevents signing', async () => {
  for (const option of ['duringChallenge', 'duringChallengeBody']) {
    const h = harness({ [option]: async state => state.invalidate('bob-token', 'bob') });
    await assert.rejects(h.unlock(h.signer.address), { code: 'VAULT_SCOPE_CHANGED' });
    assert.equal(h.prompts.length, 0); assert.equal(h.requests.length, 1); assert.equal(h.notifications.length, 0);
  }
});

test('logout/token epoch change while signing prevents the unlock POST', async () => {
  const h = harness({ duringSign: async state => state.invalidate() });
  await assert.rejects(h.unlock(h.signer.address), { code: 'VAULT_SCOPE_CHANGED' });
  assert.equal(h.prompts.length, 1); assert.equal(h.requests.length, 1); assert.equal(h.notifications.length, 0);
});

test('wallet change while signing fails closed even if the player epoch has not changed', async () => {
  const other = account();
  const h = harness({ duringSign: async state => { state.context = { ...state.context, evmWallet: { ...state.context.evmWallet, address: other.address } }; } });
  await assert.rejects(h.unlock(h.signer.address), { code: 'VAULT_WALLET_REQUIRED' });
  assert.equal(h.requests.length, 1); assert.equal(h.notifications.length, 0);
});

test('late unlock response after account switch never refreshes the new player vault', async () => {
  const h = harness({ duringUnlock: async state => state.invalidate('bob-token', 'bob') });
  await assert.rejects(h.unlock(h.signer.address), { code: 'VAULT_SCOPE_CHANGED' });
  assert.equal(h.requests.length, 2); assert.equal(h.notifications.length, 0);
});

test('wrong purpose, wallet, nonce, expired or modified server message is never signed', async () => {
  const other = account();
  const edits = [
    challenge => { challenge.message = challenge.message.replace('unlock-trading-credentials', 'wallet-auth'); },
    challenge => { challenge.wallet = other.address.toLowerCase(); },
    challenge => { challenge.nonce = 'wrong'; },
    challenge => { challenge.expiresAt = new Date(Date.now() - 1).toISOString(); },
    challenge => { challenge.message += '\nSend all funds'; },
  ];
  for (const edit of edits) {
    const h = harness({ duringChallenge: (_state, challenge) => edit(challenge) });
    await assert.rejects(h.unlock(h.signer.address), { code: 'VAULT_CHALLENGE_INVALID' });
    assert.equal(h.prompts.length, 0); assert.equal(h.requests.length, 1);
  }
});

test('wrong EVM provider and mismatched wallet-client account are rejected before prompting', async () => {
  for (const part of ['provider', 'client']) {
    const h = harness(), other = account();
    if (part === 'provider') h.context.evmWallet.provider.request = async () => [other.address];
    else h.context.evmWallet.walletClient.account.address = other.address;
    await assert.rejects(h.unlock(h.signer.address), { code: 'VAULT_WALLET_MISMATCH' });
    assert.equal(h.prompts.length, 0); assert.equal(h.notifications.length, 0);
  }
});

test('Privy EVM selects the exact requested wallet, never the first embedded wallet', async () => {
  const h = harness(), wrong = account();
  let selected = 0;
  const target = { address: h.signer.address, getEthereumProvider: async () => ({ request: async ({ method, params }) => {
    if (method === 'eth_accounts') return [h.signer.address];
    assert.equal(method, 'personal_sign'); assert.equal(params[1], h.signer.address.toLowerCase());
    selected++; return h.signer.signMessage({ message: Buffer.from(params[0].slice(2), 'hex').toString('utf8') });
  } }) };
  h.context.evmWallet = null;
  h.context.privy = { authenticated: true, evmWallets: [{ address: wrong.address, getEthereumProvider: () => { throw new Error('Wrong wallet used'); } }, target] };
  assert.equal((await h.unlock(h.signer.address)).unlocked, true); assert.equal(selected, 1);
});

test('Privy does not fall back to an unrelated wallet when the anchor is absent', async () => {
  const h = harness(), wrong = account();
  h.context.evmWallet = null;
  h.context.privy = { authenticated: true, evmWallets: [{ address: wrong.address, getEthereumProvider: () => { throw new Error('Wrong wallet used'); } }] };
  await assert.rejects(h.unlock(h.signer.address), { code: 'VAULT_WALLET_REQUIRED' });
  assert.equal(h.requests.length, 0);
});

test('Solana adapter signs exact UTF-8 bytes and server verifies the detached signature', async () => {
  const h = harness(), pair = nacl.sign.keyPair(), wallet = bs58.encode(pair.publicKey);
  h.context.solWallet = { connected: true, publicKey: { toBase58: () => wallet }, signMessage: async message => nacl.sign.detached(message, pair.secretKey) };
  assert.equal((await h.unlock(wallet)).unlocked, true);
  assert.match(h.requests[1].body.signature, /^0x[0-9a-f]{128}$/u);
  assert.equal(h.notifications.length, 1);
});

test('Privy Solana selects only the exact case-sensitive owner wallet', async () => {
  const h = harness(), pair = nacl.sign.keyPair(), wallet = bs58.encode(pair.publicKey);
  const selected = { address: wallet }, wrong = { address: bs58.encode(nacl.sign.keyPair().publicKey) };
  h.context.privy = { authenticated: true, solanaWallets: [wrong, selected], solanaSignMessage: async ({ message, wallet: provided }) => {
    assert.equal(provided, selected); return { signature: nacl.sign.detached(message, pair.secretKey) };
  } };
  assert.equal((await h.unlock(wallet)).unlocked, true);
});

test('Aptos signs server nonce and exact wrapper with typed Ed25519 signatures', async () => {
  const pair = nacl.sign.keyPair(), wallet = aptosKey(pair);
  const h = harness({ aptosAuthenticationKey: wallet });
  h.context.aptosWallet = { address: wallet, publicKey: hex(pair.publicKey), signMessage: async ({ message, nonce }) => {
    const fullMessage = `APTOS\nmessage: ${message}\nnonce: ${nonce}`;
    return { fullMessage, signature: { toUint8Array: () => nacl.sign.detached(Buffer.from(fullMessage), pair.secretKey) } };
  } };
  assert.equal((await h.unlock(wallet)).unlocked, true);
  assert.equal(h.requests[1].body.publicKey, hex(pair.publicKey));
  assert.match(h.requests[1].body.fullMessage, /\nnonce: [A-Za-z0-9_-]{43}$/u);
});

test('Aptos arbitrary fullMessage fails locally without submitting an unlock proof', async () => {
  const pair = nacl.sign.keyPair(), wallet = aptosKey(pair), h = harness();
  h.context.aptosWallet = { address: wallet, publicKey: hex(pair.publicKey), signMessage: async () => ({ fullMessage: 'not the challenge', signature: '0x00' }) };
  await assert.rejects(h.unlock(wallet), /unsupported message format/u);
  assert.equal(h.requests.length, 1); assert.equal(h.notifications.length, 0);
});

test('wallet rejection does not submit or persist anything', async () => {
  const h = harness();
  h.context.evmWallet.walletClient.signMessage = async () => { throw Object.assign(new Error('Rejected'), { code: 4001 }); };
  await assert.rejects(h.unlock(h.signer.address), { code: 4001 });
  assert.equal(h.requests.length, 1); assert.equal(h.notifications.length, 0);
  assert.doesNotMatch(source, /localStorage|sessionStorage|saveEncrypted|useAuthFlow/u);
});

test('arbitrary upstream error text and VAULT-prefixed error codes are never propagated', async () => {
  let readErrorBody = false;
  const h = harness({ responseError: { ok: false, status: 503, json: async () => {
    readErrorBody = true; return { code: 'VAULT_UNAVAILABLE', error: 'private-api-secret' };
  } } });
  await assert.rejects(h.unlock(h.signer.address), error => {
    assert.equal(error.code, 'VAULT_UNAVAILABLE');
    assert.equal(error.message.includes('private-api-secret'), false);
    return true;
  });
  assert.equal(readErrorBody, false); assert.equal(h.prompts.length, 0);
});

test('generation-only refresh after confirmed unlock is accepted for the same identity and wallet', async () => {
  const h = harness();
  h.context.onUnlocked = async () => { h.invalidate('alice-token', 'alice'); };
  assert.equal((await h.unlock(h.signer.address)).unlocked, true);
  assert.equal(h.requests.length, 2); assert.equal(h.prompts.length, 1);
});

test('generation-only change before unlock confirmation still invalidates the original proof flow', async () => {
  const h = harness({ duringSign: state => state.invalidate('alice-token', 'alice') });
  await assert.rejects(h.unlock(h.signer.address), { code: 'VAULT_SCOPE_CHANGED' });
  assert.equal(h.requests.length, 1);
});

test('refresh still rejects player, token, context identity, wallet and provider changes', async () => {
  for (const change of ['player', 'token', 'context-player', 'context-token', 'wallet', 'provider']) {
    const h = harness();
    h.context.onUnlocked = async () => {
      h.invalidate('alice-token', 'alice');
      if (change === 'player') h.invalidate('bob-token', 'bob');
      if (change === 'token') h.invalidate('new-token', 'alice');
      if (change === 'context-player') h.context = { ...h.context, playerId: 'bob' };
      if (change === 'context-token') h.context = { ...h.context, token: 'new-token' };
      if (change === 'wallet') h.context.evmWallet = { ...h.context.evmWallet, address: account().address };
      if (change === 'provider') h.context.evmWallet = { ...h.context.evmWallet, provider: { request: async () => [h.signer.address] } };
    };
    const code = change === 'wallet' ? 'VAULT_WALLET_REQUIRED' : change === 'provider' ? 'VAULT_WALLET_MISMATCH' : 'VAULT_SCOPE_CHANGED';
    await assert.rejects(h.unlock(h.signer.address), { code });
  }
});

test('real storage wrappers permit hydrated locked unlock and privately reject stale expected login tokens', async () => {
  let token = 'alice-token';
  const manager = createCredentialVaultSync({
    storage: { list: async () => [] }, describe: () => null, canMigrate: () => false,
    cryptoImpl: crypto.webcrypto, currentToken: () => token,
    fetchImpl: async () => ({ ok: true, json: async () => ({ identity: { playerId: 'alice' },
      keyStatus: { configured: true }, unlocked: false, records: [], unlockWallets: [] }) }),
  });
  await manager.begin({ playerId: 'alice', token });
  assert.equal(manager.getSnapshot().ready, true); assert.equal(manager.getSnapshot().unlocked, false);
  const storageSource = fs.readFileSync(new URL('./src/lib/encryptedCredentialStorage.js', import.meta.url), 'utf8');
  const wrapper = name => {
    const declaration = storageSource.match(new RegExp(`export const ${name} = ([^\\n]+);`));
    assert.ok(declaration, `${name} public wrapper exists`);
    return vm.runInNewContext(`(${declaration[1]})`, { credentialVault: manager });
  };
  const captureScope = wrapper('captureCredentialScope'), assertScope = wrapper('assertCredentialScope');
  const scope = captureScope();
  assert.deepEqual(Object.keys(scope).sort(), ['epoch', 'playerId']);
  assert.doesNotThrow(() => assertScope(scope, { token }));
  assert.throws(() => assertScope(scope, { token: 'stale-token' }), /account changed/u);
  const h = harness({ captureScope, assertScope });
  assert.equal((await h.unlock(h.signer.address)).unlocked, true);
  token = 'rotated-token';
  await manager.begin({ playerId: 'alice', token });
  assert.throws(() => assertScope(scope, { token }), /account changed/u);
  await assert.rejects(h.unlock(h.signer.address), /account changed/u);
  assert.equal(h.requests.length, 2, 'stale same-player hook token never sends a new challenge');
});

test('real coordinator remote restore may advance generation without rejecting the confirmed unlock', async () => {
  const saved = new Map(), name = 'test-unlock-generation';
  const record = { id: 'fixture-id', storageKey: name, revision: 1, deleted: false, value: { fixture: 'offline-only' } };
  let remoteUnlocked = false;
  const manager = createCredentialVaultSync({
    storage: {
      list: async () => [...saved.keys()], read: async key => saved.get(key),
      write: async (key, value) => { saved.set(key, structuredClone(value)); },
      remove: async key => { saved.delete(key); },
    },
    describe: key => key === name ? { dex: 'fixture' } : null, canMigrate: () => false,
    cryptoImpl: crypto.webcrypto, currentToken: () => 'alice-token',
    fetchImpl: async url => ({ ok: true, json: async () => url.endsWith('/restore')
      ? { records: [record] }
      : { identity: { playerId: 'alice' }, keyStatus: { configured: true }, unlocked: remoteUnlocked,
        records: [{ ...record, value: undefined }], unlockWallets: [] } }),
  });
  await manager.begin({ playerId: 'alice', token: 'alice-token' });
  const original = manager.capture();
  const h = harness({ captureScope: manager.capture, assertScope: manager.assert });
  h.context.onUnlocked = async () => { remoteUnlocked = true; await manager.refresh(); };
  assert.equal((await h.unlock(h.signer.address)).unlocked, true);
  assert.notEqual(manager.capture().epoch, original.epoch);
  assert.throws(() => manager.assert(original), /account changed/u);
  assert.deepEqual(manager.peek(name), record.value);
  assert.equal(h.requests.length, 2);
});
