// Local-only regression suite: real adapter code and throwaway keys, no exchange requests.
import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import vm from 'node:vm';
import { createRequire } from 'node:module';
import { fileURLToPath } from 'node:url';
import { rolldown } from 'rolldown';
import { privateKeyToAccount } from 'viem/accounts';
import { Keypair } from '@solana/web3.js';

const root = path.dirname(fileURLToPath(import.meta.url));
const require = createRequire(import.meta.url);
const owner = `0x${'12'.repeat(20)}`;
const secret = `0x${'34'.repeat(32)}`;
const address = privateKeyToAccount(secret).address.toLowerCase();
const solana = Keypair.fromSeed(new Uint8Array(32).fill(17));
const solOwner = Keypair.fromSeed(new Uint8Array(32).fill(18)).publicKey.toBase58();
const solSecret = Buffer.from(solana.secretKey).toString('base64');
const future = Date.now() + 86_400_000;
const copy = value => value == null ? null : JSON.parse(JSON.stringify(value));
const files = {
  nado: ['nadoLinkedSignerStorage', 'readNadoLinkedSigner', 'rememberNadoLinkedSigner', 'forgetNadoLinkedSigner'],
  risex: ['risexClient', 'readRisexSigner', 'rememberRisexSigner', 'forgetRisexSigner', 'getOrCreateRisexSigner'],
  hyperliquid: ['hyperliquidClient', 'readHyperliquidAgent', 'readHyperliquidAgentAsync', 'rememberHyperliquidAgent', 'forgetHyperliquidAgent', 'getOrCreateHyperliquidAgent'],
  avantis: ['avantisSmartWallet', 'readAvantisSmartWalletDelegate', 'importAvantisSmartWalletDelegate', 'forgetAvantisSmartWalletDelegate', 'getOrCreateAvantisSmartWalletDelegate'],
  ostium: ['ostiumSmartWallet', 'readOstiumSmartWalletDelegate', 'importOstiumSmartWalletDelegate', 'forgetOstiumSmartWalletDelegate', 'getOrCreateOstiumSmartWalletDelegate'],
  phoenix: ['phoenixOneTap', 'readPhoenixOneTapRecord', 'getPhoenixOneTapSession', 'writePhoenixOneTapRecord', 'markPhoenixOneTapSession', 'clearPhoenixOneTapSession', 'getOrCreatePhoenixOneTapSession', 'importPhoenixOneTapSigner'],
  aster: ['asterV3', 'readAsterAgent', 'createAndStoreAsterAgent', 'clearAsterAgent'],
  leverup: ['leverupV2', 'readLeverupAgent', 'createAndStoreLeverupAgent', 'clearLeverupAgent', 'leverupStorageKey'],
  pacifica: ['pacificaAgentStorage', 'readPacificaAgent', 'persistPacificaAgent', 'forgetPacificaAgent', 'listStoredPacificaMasters', 'findAnyPacificaAgent'],
  ostiumDelegate: ['ostiumDelegateWallet', 'loadOstiumDelegate', 'loadOstiumDelegates', 'ensureOstiumDelegate', 'saveOstiumDelegate', 'clearOstiumDelegate'],
  avantisSetup: ['avantisSmartWalletSetup', 'enableAvantisSmartWallet'],
  ostiumSetup: ['ostiumOneTapSetup', 'enableOstiumOneTap', 'topUpOstiumDelegateGas'],
  hyperliquidSetup: ['hyperliquidAgentSetup', 'ensureHyperliquidAgentApproved'],
  nadoSetup: ['nadoLinkedSignerSetup', 'ensureNadoLinkedSignerReady'],
  pacificaBind: ['pacificaBind', 'bindPacificaAgent'],
  scopes: ['../hooks/useCredentialOperationScope', 'useCredentialOperationScope'],
};

const bundled = await rolldown({
  input: '\0credential-adapter-fixture',
  cwd: root,
  external: id => !id.startsWith('\0') && !id.startsWith('.') && !path.isAbsolute(id),
  plugins: [{ name: 'fake-vault-only',
    resolveId(id) {
      if (id === '\0credential-adapter-fixture') return id;
      if (/encryptedCredentialStorage(?:\.js)?$/.test(id)) return '\0fixture-vault';
      return null;
    },
    load(id) {
      if (id === '\0credential-adapter-fixture') return Object.entries(files).map(([name, [file, ...exports]]) => (
        `import {${exports.join(',')}} from ${JSON.stringify(path.join(root, `src/lib/${file}.js`))}; export const ${name}={${exports.join(',')}};`
      )).join('\n');
      if (id === '\0fixture-vault') return `
      const vault=globalThis.testVault;
      export const captureCredentialScope=()=>vault.capture();
      export const assertCredentialScope=scope=>vault.assert(scope);
      export const peekEncryptedCredential=name=>vault.peek(name);
      export const listCredentialNames=()=>vault.names();
      export const readEncryptedCredential=name=>vault.read(name);
      export const writeEncryptedCredential=(name,value,options)=>vault.write(name,value,options);
      export const removeEncryptedCredential=(name,options)=>vault.remove(name,options);
    `;
      return null;
    },
    transform(source) { return source.replaceAll('import.meta.env', '({})').replaceAll('import.meta', '({})'); },
  }],
});
const bundle = await bundled.generate({ format: 'cjs' });
await bundled.close();

function fixture() {
  const players = new Map(), changes = [], raw = new Map();
  let active = null, epoch = 0, ready = false, rawAccesses = 0, delayedRead = null;
  const browserWindow = { location: { origin: 'http://localhost' }, _playerToken: null };
  const bank = player => {
    if (!players.has(player)) players.set(player, new Map());
    return players.get(player);
  };
  const vault = {
    login(player, hydrated = true) { active = player; ready = hydrated; epoch += 1; browserWindow._playerToken = `token-${player}-${epoch}`; },
    logout() { active = null; ready = false; epoch += 1; browserWindow._playerToken = null; },
    capture() {
      if (!active || !ready) throw new Error('Secure storage is not ready');
      return Object.freeze({ playerId: active, epoch });
    },
    assert(scope) {
      if (!active || !ready || scope?.playerId !== active || scope?.epoch !== epoch) throw new Error('Trading account changed');
    },
    peek(name) { return active && ready ? copy(bank(active).get(name)) : null; },
    names() { return active && ready ? [...bank(active).keys()] : []; },
    read(name) { return delayedRead ? delayedRead(name) : Promise.resolve(vault.peek(name)); },
    write(name, value, { scope } = {}) {
      vault.assert(scope || vault.capture());
      changes.push({ type: 'write', player: active, name });
      bank(active).set(name, copy(value));
      return Promise.resolve();
    },
    remove(name, { scope } = {}) {
      vault.assert(scope || vault.capture());
      changes.push({ type: 'remove', player: active, name });
      bank(active).delete(name);
      return Promise.resolve();
    },
    seed(player, name, value) { bank(player).set(name, copy(value)); },
    deferRead(callback) { delayedRead = callback; },
  };
  const browserStorage = {
    getItem(key) { rawAccesses += 1; return raw.get(key) || null; },
    setItem(key, value) { rawAccesses += 1; raw.set(key, value); },
    removeItem(key) { rawAccesses += 1; raw.delete(key); },
    key(index) { rawAccesses += 1; return [...raw.keys()][index] || null; },
    get length() { rawAccesses += 1; return raw.size; },
  };
  const module = { exports: {} };
  let hookIndex = 0;
  const refs = new Map(), effects = new Map(), pendingEffects = [];
  const react = {
    useRef(value) { const index = hookIndex++; if (!refs.has(index)) refs.set(index, { current: value }); return refs.get(index); },
    useCallback(callback) { hookIndex++; return callback; },
    useLayoutEffect(run, deps) {
      const index = hookIndex++, previous = effects.get(index);
      if (!previous || deps.some((value, i) => value !== previous.deps[i])) pendingEffects.push(() => {
        previous?.cleanup?.(); effects.set(index, { deps, run, cleanup: run() });
      });
    },
  };
  const hook = {
    render(props) {
      hookIndex = 0;
      const result = module.exports.scopes.useCredentialOperationScope(props);
      pendingEffects.splice(0).forEach(run => run());
      return result;
    },
    unmount() { effects.forEach(effect => effect.cleanup?.()); },
    strictReplay() { effects.forEach(effect => { effect.cleanup?.(); effect.cleanup = effect.run(); }); },
  };
  browserWindow.localStorage = browserStorage;
  browserWindow.sessionStorage = browserStorage;
  const context = vm.createContext({
    module, exports: module.exports, testVault: vault,
    require: name => {
      if (name === '@nktkas/hyperliquid') return {};
      if (name === 'react') return react;
      return require(name);
    },
    window: browserWindow,
    localStorage: browserStorage, sessionStorage: browserStorage,
    console, URL, URLSearchParams, Buffer, TextEncoder, TextDecoder, Uint8Array,
    btoa, atob, setTimeout, clearTimeout,
    fetch: () => { throw new Error('Network is forbidden in credential adapter tests'); },
  });
  vm.runInContext(bundle.output[0].code, context);
  return { api: module.exports, vault, changes, raw, hook, window: browserWindow, rawAccesses: () => rawAccesses };
}

const scenarios = [
  { name: 'nado', key: `clash_nado_linked_signer_v1:${owner}`, record: { privateKey: secret, address, expiresAt: Math.floor(future / 1000) },
    read: m => m.readNadoLinkedSigner(owner), write: (m, opts) => m.rememberNadoLinkedSigner(owner, { privateKey: secret, expiresAt: Math.floor(future / 1000) }, opts),
    remove: (m, opts) => m.forgetNadoLinkedSigner(owner, opts) },
  { name: 'risex', key: `clash_risex_signer_v1:${owner}`, record: { privateKey: secret, address, expiresAt: Math.floor(future / 1000) },
    read: m => m.readRisexSigner(owner), write: (m, opts) => m.rememberRisexSigner(owner, { privateKey: secret, expiresAt: Math.floor(future / 1000) }, opts),
    create: (m, opts) => m.getOrCreateRisexSigner(owner, opts), remove: (m, opts) => m.forgetRisexSigner(owner, opts) },
  { name: 'hyperliquid', key: `clash_hyperliquid_agent_v1:${owner}`, record: { privateKey: secret, address, validUntil: future },
    read: m => m.readHyperliquidAgent(owner), write: (m, opts) => m.rememberHyperliquidAgent(owner, { privateKey: secret }, future, opts),
    create: (m, opts) => m.getOrCreateHyperliquidAgent(owner, opts), remove: (m, opts) => m.forgetHyperliquidAgent(owner, opts) },
  ...['avantis', 'ostium'].map(name => {
    const label = name[0].toUpperCase() + name.slice(1);
    return { name, key: `clash_${name}_smart_wallet_delegate_v1:${owner}`, record: { privateKey: secret, address, validUntil: future },
      read: m => m[`read${label}SmartWalletDelegate`](owner), write: (m, opts) => m[`import${label}SmartWalletDelegate`](owner, secret, opts),
      create: (m, opts) => m[`getOrCreate${label}SmartWalletDelegate`](owner, opts), remove: (m, opts) => m[`forget${label}SmartWalletDelegate`](owner, opts) };
  }),
  { name: 'phoenix', key: `clash:phoenix:one_tap:v1:${solOwner}`, record: { owner: solOwner, secretKey: solSecret, publicKey: solana.publicKey.toBase58(), expiresAt: future, approved: true },
    read: m => m.getPhoenixOneTapSession(solOwner), write: (m, opts) => m.writePhoenixOneTapRecord(solOwner, scenarios.find(row => row.name === 'phoenix').record, opts),
    create: (m, opts) => m.getOrCreatePhoenixOneTapSession(solOwner, opts), remove: (m, opts) => m.clearPhoenixOneTapSession(solOwner, opts), secretField: 'secretKey' },
  { name: 'aster', key: `clash_aster_agent_v1:${owner}`, record: { owner, privateKey: secret, address, expired: future },
    read: m => m.readAsterAgent(owner), write: (m, opts) => m.createAndStoreAsterAgent(owner, opts),
    create: (m, opts) => m.createAndStoreAsterAgent(owner, opts), remove: (m, opts) => m.clearAsterAgent(owner, opts) },
  { name: 'leverup', key: `clash:leverup:v2:143:0xea1b8e4ab7f14f7dca68c5b214303b13078fc5ec:${owner}`, record: { version: 2, privateKey: secret, address },
    read: m => m.readLeverupAgent(owner), write: (m, opts) => m.createAndStoreLeverupAgent(owner, opts),
    create: (m, opts) => m.createAndStoreLeverupAgent(owner, opts), remove: (m, opts) => m.clearLeverupAgent(owner, opts) },
  { name: 'pacifica', key: `clash_pacifica_agent:${solOwner}`, record: { master: solOwner, agentSecretB58: 'fixture-agent-secret-only', agentPubkey: solana.publicKey.toBase58(), createdAt: Date.now() },
    read: m => m.readPacificaAgent(solOwner), write: (m, opts) => m.persistPacificaAgent(solOwner, scenarios.find(row => row.name === 'pacifica').record, opts),
    remove: (m, opts) => m.forgetPacificaAgent(solOwner, opts), secretField: 'privateKey' },
];

for (const row of scenarios) {
  test(`${row.name}: signed-out/unhydrated reads are null; plaintext never grants access; generation/write denied`, async () => {
    const f = fixture(), m = f.api[row.name];
    f.raw.set(row.key, JSON.stringify(row.record));
    for (const hydrated of [false, true]) {
      if (hydrated) f.vault.login('A', false);
      assert.equal(await row.read(m), null);
      assert.throws(() => row.write(m), /storage.*not ready/i);
      if (row.create) assert.throws(() => row.create(m), /storage.*not ready/i);
    }
    f.vault.login('A');
    assert.equal(await row.read(m), null);
    assert.equal(f.rawAccesses(), 0);
    assert.equal(f.changes.length, 0);
  });

  test(`${row.name}: current-player encrypted restore, synchronous cache write, logout and same-wallet isolation`, async () => {
    const f = fixture(), m = f.api[row.name];
    f.vault.seed('A', row.key, row.record);
    f.vault.login('A');
    const expected = row.record.privateKey || row.record.secretKey || row.record.agentSecretB58;
    assert.equal((await row.read(m))[row.secretField || 'privateKey'], expected);
    await row.write(m);
    assert.equal(f.changes.at(-1).name, row.key);
    assert.equal(f.changes.at(-1).player, 'A');
    const savedA = f.vault.peek(row.key);
    f.vault.login('B');
    assert.equal(await row.read(m), null);
    await row.write(m);
    await row.remove(m);
    assert.equal(await row.read(m), null);
    f.vault.login('A');
    assert.deepEqual(f.vault.peek(row.key), savedA);
    assert.ok(await row.read(m));
    f.vault.logout();
    assert.equal(await row.read(m), null);
    assert.equal(f.rawAccesses(), 0);
  });

  test(`${row.name}: stale scope cannot create, overwrite or tombstone another session, including A→B→A`, async () => {
    const f = fixture(), m = f.api[row.name];
    f.vault.login('A');
    const scope = f.vault.capture();
    f.vault.seed('A', row.key, row.record);
    f.vault.seed('B', row.key, row.record);
    for (const next of ['B', 'A']) {
      f.vault.login(next);
      assert.throws(() => row.write(m, { scope }), /account changed/);
      assert.throws(() => row.remove(m, { scope }), /account changed/);
      if (row.create) assert.throws(() => row.create(m, { scope }), /account changed/);
      assert.deepEqual(f.vault.peek(row.key), row.record);
    }
    assert.equal(f.changes.length, 0);
  });

  test(`${row.name}: forget issues scoped central tombstone and cannot resurrect legacy plaintext`, async () => {
    const f = fixture(), m = f.api[row.name];
    f.vault.login('A');
    f.vault.seed('A', row.key, row.record);
    f.raw.set(row.key, JSON.stringify(row.record));
    await row.remove(m, { scope: f.vault.capture() });
    assert.equal(await row.read(m), null);
    assert.deepEqual(f.changes, [{ type: 'remove', player: 'A', name: row.key }]);
    assert.equal(f.rawAccesses(), 0);
  });
}

test('expiry, owner and private-key checks survive encrypted migration', async () => {
  const f = fixture(); f.vault.login('A');
  for (const row of scenarios.filter(item => ['nado', 'risex', 'hyperliquid', 'avantis', 'ostium', 'phoenix', 'pacifica'].includes(item.name))) {
    const expired = { ...row.record, expiresAt: 1, validUntil: 1, createdAt: 1 };
    f.vault.seed('A', row.key, expired);
    assert.equal(await row.read(f.api[row.name]), null, row.name);
  }
  for (const name of ['aster', 'phoenix', 'pacifica']) {
    const row = scenarios.find(item => item.name === name);
    f.vault.seed('A', row.key, { ...row.record, owner: 'wrong-owner', master: 'wrong-owner' });
    assert.equal(await row.read(f.api[name]), null, name);
  }
  const row = scenarios.find(item => item.name === 'leverup');
  f.vault.seed('A', row.key, { ...row.record, address: owner });
  assert.equal(await row.read(f.api.leverup), null);
  for (const row of scenarios.filter(item => item.record.privateKey)) {
    f.vault.seed('A', row.key, { ...row.record, privateKey: 'malformed-not-a-key' });
    assert.equal(await row.read(f.api[row.name]), null, row.name);
  }
});

test('Hyperliquid and Pacifica discard deferred encrypted reads after login switch', async () => {
  for (const name of ['hyperliquid', 'pacifica']) {
    const f = fixture(); f.vault.login('A');
    const row = scenarios.find(item => item.name === name);
    let resolveRead;
    f.vault.deferRead(() => new Promise(resolve => { resolveRead = resolve; }));
    const pending = name === 'hyperliquid'
      ? f.api.hyperliquid.readHyperliquidAgentAsync(owner)
      : f.api.pacifica.readPacificaAgent(solOwner);
    assert.equal(typeof resolveRead, 'function');
    f.vault.login('B');
    resolveRead(row.record);
    assert.equal(await pending, null);
    assert.equal(f.changes.length, 0);
  }
});

test('Pacifica discovery sees current-player names only, preserves case and rejects stale scopes', async () => {
  const f = fixture();
  const row = scenarios.find(item => item.name === 'pacifica');
  f.vault.seed('A', row.key, row.record);
  f.raw.set('clash_pacifica_agent:anotherWallet', JSON.stringify(row.record));
  f.vault.login('B');
  assert.equal((await f.api.pacifica.findAnyPacificaAgent()), null);
  assert.equal(f.api.pacifica.listStoredPacificaMasters().length, 0);
  f.vault.login('A');
  const scope = f.vault.capture();
  assert.deepEqual(Array.from(f.api.pacifica.listStoredPacificaMasters()), [solOwner]);
  assert.equal((await f.api.pacifica.findAnyPacificaAgent()).master, solOwner);
  f.vault.login('B');
  assert.equal(await f.api.pacifica.findAnyPacificaAgent([solOwner], { scope }), null);
  assert.equal(f.rawAccesses(), 0);
});

test('synchronous readers observe write immediately, before persistence promise resolves', () => {
  for (const row of scenarios.filter(item => item.name !== 'pacifica')) {
    const f = fixture(); f.vault.login('A');
    const realWrite = f.vault.write;
    f.vault.write = (...args) => { realWrite(...args); return new Promise(() => {}); };
    row.write(f.api[row.name]);
    assert.ok(row.read(f.api[row.name]), row.name);
  }
});

test('Nado hook uses shared scoped store and no duplicate credential persistence', () => {
  const source = fs.readFileSync(path.join(root, 'src/hooks/useNado.js'), 'utf8');
  assert.match(source, /from ['"]\.\.\/lib\/nadoLinkedSignerStorage['"]/);
  assert.doesNotMatch(source, /runtimeLinkedSignerCache|function readNadoLinkedSigner|function rememberNadoLinkedSigner|LINKED_SIGNER_STORAGE_PREFIX/);
  assert.match(source, /rememberNadoLinkedSigner\(walletAddr, record, \{ scope \}\)/);
  assert.match(source, /await forgetNadoLinkedSigner\(walletAddr, \{ scope \}\)/);
});

test('operation hook blocks retained callbacks on wallet/venue/token changes and unmount; StrictMode remains usable', () => {
  const f = fixture(); f.vault.login('A');
  const props = { player: { id: 'A', token: f.window._playerToken }, wallet: owner, dex: 'nado' };
  const first = f.hook.render(props), scope = first.capture();
  f.hook.strictReplay();
  assert.equal(first.assert(scope), scope);
  const nextWallet = f.hook.render({ ...props, wallet: `0x${'99'.repeat(20)}` });
  assert.throws(() => first.capture(), /changed/);
  assert.throws(() => first.assert(scope), /changed/);
  assert.ok(nextWallet.capture());
  const nextVenue = f.hook.render({ ...props, dex: 'risex' });
  assert.throws(() => nextWallet.capture(), /changed/);
  f.vault.login('B');
  assert.throws(() => nextVenue.capture(), /changed/);
  const nextPlayer = f.hook.render({ ...props, player: { id: 'B', token: f.window._playerToken } });
  const nextScope = nextPlayer.capture();
  f.hook.unmount();
  assert.throws(() => nextPlayer.assert(nextScope), /changed/);
});

test('operation hook rejects token swap before React rerenders', () => {
  const f = fixture(); f.vault.login('A');
  const current = f.hook.render({ player: { player_id: 'A', token: f.window._playerToken }, wallet: owner, dex: 'nado' });
  f.window._playerToken = 'new-login-token';
  assert.throws(() => current.capture(), /changed/);
});

test('Ostium active+archive round trip uses one scope, preserves owner filtering and central tombstones', async () => {
  const f = fixture(); f.vault.login('A');
  const key = `clash_ostium_delegate_wallet_v1:${owner}`;
  const archive = `clash_ostium_delegate_wallet_archive_v1:${owner}`;
  await f.api.ostiumDelegate.saveOstiumDelegate(owner, { privateKey: secret });
  assert.equal(f.vault.peek(key).privateKey, secret);
  assert.equal(f.vault.peek(archive).delegates[0].privateKey, secret);
  assert.equal((await f.api.ostiumDelegate.loadOstiumDelegate(owner)).privateKey, secret);
  f.vault.login('B');
  assert.equal(await f.api.ostiumDelegate.loadOstiumDelegate(owner), null);
  f.vault.login('A');
  await f.api.ostiumDelegate.clearOstiumDelegate(owner);
  assert.equal(f.vault.peek(key), null);
  assert.equal(f.vault.peek(archive), null);
  assert.equal(await f.api.ostiumDelegate.loadOstiumDelegate(owner), null);
  assert.equal(f.rawAccesses(), 0);
});

test('Ostium cannot generate after deferred read or write archive after a login switch', async () => {
  const f = fixture(); f.vault.login('A');
  let release;
  f.vault.deferRead(() => new Promise(resolve => { release = resolve; }));
  const pending = f.api.ostiumDelegate.ensureOstiumDelegate(owner);
  f.vault.login('B'); release(null);
  await assert.rejects(pending, /account changed/);
  assert.equal(f.changes.length, 0);
  f.vault.deferRead(null); f.vault.login('A');
  const realWrite = f.vault.write;
  f.vault.write = (...args) => { realWrite(...args); return new Promise(resolve => { release = resolve; }); };
  const save = f.api.ostiumDelegate.saveOstiumDelegate(owner, { privateKey: secret });
  f.vault.login('B'); release();
  await assert.rejects(save, /account changed/);
  assert.equal(f.changes.length, 1);
  assert.equal(f.changes[0].player, 'A');
  assert.equal(f.vault.names().length, 0);
});

test('Avantis and Ostium setup/top-up stop before key generation or transactions when chain-switch login changes', async () => {
  for (const [module, fn] of [['avantisSetup', 'enableAvantisSmartWallet'], ['ostiumSetup', 'enableOstiumOneTap'], ['ostiumSetup', 'topUpOstiumDelegateGas']]) {
    const f = fixture(); f.vault.login('A');
    let release, txCount = 0;
    const pending = f.api[module][fn]({ walletAddr: owner, walletClient: { writeContract: () => { txCount++; } }, publicClient: {},
      ensureChain: () => new Promise(resolve => { release = resolve; }) });
    f.vault.login('B'); release();
    await assert.rejects(pending, /account changed/);
    assert.equal(txCount, 0);
    assert.equal(f.changes.length, 0);
  }
});

test('Hyperliquid setup discards deferred restore before creating an agent for a new player', async () => {
  const f = fixture(); f.vault.login('A');
  let release;
  f.vault.deferRead(() => new Promise(resolve => { release = resolve; }));
  const pending = f.api.hyperliquidSetup.ensureHyperliquidAgentApproved({ walletAddress: owner });
  f.vault.login('B'); release(null);
  await assert.rejects(pending, /account changed/);
  assert.equal(f.changes.length, 0);
});

test('Pacifica bind discards a wallet signature if login changed during the popup', async () => {
  const f = fixture(); f.vault.login('A');
  let release;
  const pending = f.api.pacificaBind.bindPacificaAgent({ walletAddr: solOwner,
    masterSign: () => new Promise(resolve => { release = resolve; }) });
  f.vault.login('B'); release(new Uint8Array(64).fill(1));
  await assert.rejects(pending, /account changed/);
  assert.equal(f.changes.length, 0);
});

test('Nado setup rejects stale ctx/explicit scope and a login switch during chain selection', async () => {
  const f = fixture(); f.vault.login('A');
  const scope = f.vault.capture();
  let release;
  const pending = f.api.nadoSetup.ensureNadoLinkedSignerReady({ walletAddress: owner, credentialScope: scope,
    ensureChain: () => new Promise(resolve => { release = resolve; }) });
  f.vault.login('B'); release();
  await assert.rejects(pending, /account changed/);
  await assert.rejects(f.api.nadoSetup.ensureNadoLinkedSignerReady({ credentialScope: scope }), /account changed/);
  await assert.rejects(f.api.nadoSetup.ensureNadoLinkedSignerReady({}, { scope }), /account changed/);
  assert.equal(f.changes.length, 0);
});

test('Ostium polling cannot resurrect a removed active credential from an archive or stale hook ref', async () => {
  const f = fixture(); f.vault.login('A');
  const signer = { privateKey: secret, address };
  f.vault.seed('A', `clash_ostium_delegate_wallet_archive_v1:${owner}`, { delegates: [{ wallet: owner, ...signer }] });
  const source = fs.readFileSync(path.join(root, 'src/hooks/useOstium.js'), 'utf8');
  const callbacks = source.slice(source.indexOf('  const loadDelegateCandidates ='), source.indexOf('  const findRegisteredDelegateSigner ='));
  const module = { exports: {} };
  let selected = 0;
  vm.runInNewContext(`${callbacks}\nmodule.exports={loadDelegateCandidates,promoteDelegateSigner};`, {
    module, walletAddr: owner, useCallback: callback => callback,
    captureCredentialOperation: () => f.vault.capture(), assertCredentialOperation: scope => f.vault.assert(scope),
    peekEncryptedCredential: name => f.vault.peek(name),
    loadOstiumDelegates: f.api.ostiumDelegate.loadOstiumDelegates,
    saveOstiumDelegate: f.api.ostiumDelegate.saveOstiumDelegate,
    delegateSignerRef: { current: signer }, setDelegateSigner: () => { selected++; }, console,
  });
  assert.equal((await module.exports.loadDelegateCandidates(signer)).length, 0);
  await assert.rejects(module.exports.promoteDelegateSigner(signer), /removed/);
  assert.equal(selected, 0);
  assert.equal(f.changes.length, 0);
});

test('credential UX explains encrypted server sync after wallet verification without browser-only promises', () => {
  for (const name of ['components/FuturesPanel.jsx', 'components/LighterOneTapConnect.jsx', 'components/AiChatPanel.jsx', 'components/ProfileModal.jsx', 'hooks/useGrvt.js', 'hooks/useKatana.js']) {
    const source = fs.readFileSync(path.join(root, 'src', name), 'utf8');
    assert.match(source, /encrypted server sync (?:requires|after) wallet verification/i, name);
    assert.doesNotMatch(source, /browser-only|stored only in this browser|not stored in the Clash database|Clash does not write it to the database|Private keys are never sent to Clash servers|It is never sent to Clash servers/, name);
  }
});

test('forget copy distinguishes queued server deletion from exchange revocation', () => {
  const profile = fs.readFileSync(path.join(root, 'src/components/ProfileModal.jsx'), 'utf8');
  const terminal = fs.readFileSync(path.join(root, 'src/components/FuturesPanel.jsx'), 'utf8');
  assert.match(profile, /queue server deletion\? This does not revoke the API key/);
  assert.match(profile, /Server deletion is queued if not yet synced\. Exchange permissions are unchanged/);
  assert.match(terminal, /queues server deletion; it does not revoke the agent on Hotstuff/);
  assert.doesNotMatch(profile + terminal, /deleted everywhere|cleared everywhere/);
});

test('credential sync copy leaves wallet/session permission boundaries intact', () => {
  const chat = fs.readFileSync(path.join(root, 'src/components/AiChatPanel.jsx'), 'utf8');
  const lighter = fs.readFileSync(path.join(root, 'src/components/LighterOneTapConnect.jsx'), 'utf8');
  assert.match(chat, /This applies only to this Privy browser wallet and expires in 30 minutes\./);
  assert.match(chat, /AI trading permissions remain separate/);
  assert.match(lighter, /does not enable bots or server-side trading/);
});
