// Real orchestration + local fake vault/wallet/network. Never contacts an exchange.
import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import vm from 'node:vm';
import { createRequire } from 'node:module';
import { fileURLToPath } from 'node:url';
import { rolldown } from 'rolldown';

const root = path.dirname(fileURLToPath(import.meta.url)), require = createRequire(import.meta.url);
const names = ['botGameCredentials', 'botGameAuth', 'nadoLinkedSignerStorage'];
const realFiles = new Set(names.map(name => path.join(root, `src/lib/${name}.js`)));
const helperExports = new Map();
for (const file of realFiles) {
  const source = fs.readFileSync(file, 'utf8');
  for (const match of source.matchAll(/(?:import|export)\s*\{([^}]+)\}\s*from\s*['"]([^'"]+)['"]/g)) {
    if (!match[2].startsWith('.')) continue;
    const resolved = path.resolve(path.dirname(file), match[2].endsWith('.js') ? match[2] : `${match[2]}.js`);
    if (realFiles.has(resolved)) continue;
    const exports = helperExports.get(resolved) || new Set();
    match[1].split(',').map(value => value.trim().split(/\s+as\s+/)[0]).filter(Boolean).forEach(name => exports.add(name));
    helperExports.set(resolved, exports);
  }
}
const built = await rolldown({
  input: '\0bot-fixture', cwd: root,
  external: id => !id.startsWith('\0') && !id.startsWith('.') && !path.isAbsolute(id),
  plugins: [{ name: 'fake-dependencies',
    resolveId(id, importer) {
      if (id === '\0bot-fixture') return id;
      if (!id.startsWith('.')) return null;
      const resolved = path.resolve(path.dirname(importer), id.endsWith('.js') ? id : `${id}.js`);
      return realFiles.has(resolved) ? resolved : `\0helper:${resolved}`;
    },
    load(id) {
      if (id === '\0bot-fixture') return `export * from ${JSON.stringify(path.join(root, 'src/lib/botGameCredentials.js'))};
        export {ensureGameExchangeReady} from ${JSON.stringify(path.join(root, 'src/lib/botGameAuth.js'))};`;
      if (id.startsWith('\0helper:')) return [...helperExports.get(id.slice(8))].map(name => (
        `export const ${name}=globalThis.helpers[${JSON.stringify(name)}];`
      )).join('\n');
      return null;
    },
    transform(source) { return source.replaceAll('import.meta.env', '({})'); },
  }],
});
const output = await built.generate({ format: 'cjs' });
await built.close();

const wallet = `0x${'12'.repeat(20)}`, privateKey = `0x${'34'.repeat(32)}`;
const otherPrivateKey = `0x${'56'.repeat(32)}`;
const clone = value => value == null ? null : JSON.parse(JSON.stringify(value));
const hibachi = key => ({ apiKey: 'fake-hibachi-api-key', accountId: '123', privateKey: key });
const deferred = () => { let resolve; const promise = new Promise(done => { resolve = done; }); return { promise, resolve }; };

function fixture() {
  const players = new Map(), requests = [], writes = [], setupCalls = [];
  let active = null, epoch = 0, ready = false, rawAccesses = 0, readGate = null, writeGate = null, fetchGate = null;
  const bank = id => { if (!players.has(id)) players.set(id, new Map()); return players.get(id); };
  const browser = { _playerToken: null, location: { origin: 'http://localhost' } };
  const vault = {
    login(id, hydrated = true) { active = id; epoch++; ready = hydrated; browser._playerToken = `token-${id}`; },
    capture() { if (!active || !ready) throw new Error('Secure storage is not ready'); return Object.freeze({ playerId: active, epoch }); },
    assert(scope, options = {}) {
      if (!active || !ready || scope?.playerId !== active || scope?.epoch !== epoch
        || (options.token !== undefined && options.token !== browser._playerToken)) throw new Error('Trading account changed');
    },
    peek(name) { return active && ready ? clone(bank(active).get(name)) : null; },
    names() { return active && ready ? [...bank(active).keys()] : []; },
    read(name) { return readGate ? readGate(name) : Promise.resolve(vault.peek(name)); },
    write(name, value, { scope } = {}) {
      vault.assert(scope);
      bank(active).set(name, clone(value)); writes.push({ playerId: active, name });
      return writeGate ? writeGate(name) : Promise.resolve();
    },
    seed(id, name, value) { bank(id).set(name, clone(value)); },
  };
  const raw = { getItem() { rawAccesses++; return null; }, setItem() { rawAccesses++; }, removeItem() { rawAccesses++; },
    key() { rawAccesses++; return null; }, get length() { rawAccesses++; return 0; } };
  Object.assign(browser, { localStorage: raw, sessionStorage: raw });
  const helpers = {
    captureCredentialScope: vault.capture, assertCredentialScope: vault.assert,
    readEncryptedCredential: vault.read, peekEncryptedCredential: vault.peek, listCredentialNames: vault.names,
    writeEncryptedCredential: vault.write, removeEncryptedCredential: () => Promise.resolve(),
    migratePlainLocalStorageCredential: () => { throw new Error('Legacy plaintext must not be read'); },
    registeredDexWallet: () => '', playerLoginWallet: (player, chain) => chain === 'evm' ? player?.wallet || '' : '',
    botApiUrl: value => `/bot${value}`, botAuthHeaders: (token, extra = {}) => ({ 'x-token': token, ...extra }),
    fetchBotApiJson: async () => ({ ok: true, data: { equity_usd: 1 } }),
    NADO_SUBACCOUNT_NAME: 'default', RISEX_SIGNER_TTL_SECONDS: 3600,
    readNadoReferralVerification: () => true, INK_CHAIN_ID: 57073, HOTSTUFF_CHAIN_ID: 1,
    loadHotstuffStoredAgent: owner => vault.read(`clash_hotstuff_agent_v1:${owner}`),
    ensureHotstuffTradingAgent: async options => {
      setupCalls.push(options); options.assertCurrent();
      await vault.write(`clash_hotstuff_agent_v1:${options.walletAddress}`, { privateKey, address: wallet }, { scope: options.credentialScope });
      options.assertCurrent();
    },
    ensureNadoLinkedSignerReady: async options => { setupCalls.push(options); options.assertCurrent(); },
  };
  const module = { exports: {} };
  const context = vm.createContext({ module, exports: module.exports, require, helpers, window: browser,
    console, Buffer, URL, Uint8Array, TextEncoder, TextDecoder, btoa, atob, setTimeout, clearTimeout,
    fetch: async (url, options) => {
      requests.push({ url, ...options });
      return fetchGate ? fetchGate(url, options) : { ok: true, status: 200, json: async () => ({ data: { id: 'local-fixture' } }) };
    },
  });
  vm.runInContext(output.output[0].code, context);
  return { api: module.exports, vault, requests, writes, setupCalls, browser,
    player: id => ({ id, wallet }), rawAccesses: () => rawAccesses,
    deferRead: callback => { readGate = callback; }, deferWrite: callback => { writeGate = callback; },
    deferFetch: callback => { fetchGate = callback; } };
}

test('Bots cannot read or save allowed credentials until a player-scoped vault is ready', async () => {
  const f = fixture();
  await assert.rejects(f.api.gatherGameCredentials('hibachi', f.player('A')), /not ready/);
  await assert.rejects(f.api.saveHibachiBotCredentials(hibachi(privateKey)), /not ready/);
  assert.throws(() => f.api.saveNadoLinkedSigner(privateKey, wallet), /not ready/);
  assert.equal(f.writes.length, 0); assert.equal(f.rawAccesses(), 0);
});

test('Nado bot save/gather uses the same scoped adapter and never raw local/sessionStorage', async () => {
  const f = fixture(); f.vault.login('A');
  f.api.saveNadoLinkedSigner(privateKey, wallet);
  const gathered = await f.api.gatherGameCredentials('nado', f.player('A'));
  assert.equal(gathered.ok, true); assert.equal(gathered.privateKey, privateKey);
  assert.equal(f.writes[0].playerId, 'A'); assert.equal(f.rawAccesses(), 0);
  f.vault.login('B');
  const other = await f.api.gatherGameCredentials('nado', f.player('B'));
  assert.equal(other.ok, false); assert.equal(other.privateKey, undefined);
});

test('gather rejects mismatched player and a player switch while a credential read is pending', async () => {
  const f = fixture(); f.vault.login('A');
  await assert.rejects(f.api.gatherGameCredentials('hibachi', f.player('B')), /account changed/);
  const gate = deferred(); f.deferRead(() => gate.promise);
  const pending = f.api.gatherGameCredentials('hibachi', f.player('A'));
  f.vault.login('B'); gate.resolve(hibachi(otherPrivateKey));
  await assert.rejects(pending, /account changed/);
  assert.equal(f.requests.length, 0);
});

test('manual save origin stays bound across await and compound Katana save never writes into next player', async () => {
  const f = fixture(); f.vault.login('A');
  const gate = deferred(); f.deferWrite(() => gate.promise);
  const pending = f.api.saveKatanaBotCredentials({ apiKey: 'fixture', apiSecret: 'fixture-secret', wallet, oneTapPrivateKey: privateKey });
  f.vault.login('B'); gate.resolve();
  await assert.rejects(pending, /account changed/);
  assert.deepEqual(f.writes.map(row => row.playerId), ['A']);
  assert.equal(f.rawAccesses(), 0);
});

test('export verifies exact game token and rechecks after custom encryption before any bot POST', async () => {
  const f = fixture(); f.vault.login('A'); f.vault.seed('A', 'clash_hibachi_credentials_v1', hibachi(privateKey));
  await assert.rejects(f.api.syncGameAccountToPhantom({ token: 'token-B', exchangeId: 'hibachi', player: f.player('A') }), /account changed/);
  await assert.rejects(f.api.syncGameAccountToPhantom({ token: 'token-A', exchangeId: 'hibachi', player: f.player('A'),
    encryptSecret: () => { f.vault.login('B'); return 'encrypted-fixture'; } }), /account changed/);
  assert.equal(f.requests.length, 0);
});

test('account creation awaiting reply cannot enable an exchange after a player switch', async () => {
  const f = fixture(); f.vault.login('A'); f.vault.seed('A', 'clash_hibachi_credentials_v1', hibachi(privateKey));
  const gate = deferred(), sent = deferred();
  f.deferFetch(() => { sent.resolve(); return gate.promise; });
  const pending = f.api.syncGameAccountToPhantom({ token: 'token-A', exchangeId: 'hibachi', player: f.player('A') });
  await sent.promise; f.vault.login('B'); gate.resolve({ ok: true, status: 200, json: async () => ({ data: {} }) });
  await assert.rejects(pending, /account changed/);
  assert.equal(f.requests.length, 1); assert.equal(f.requests[0].headers['x-token'], 'token-A');
  assert.equal(f.requests[0].url, '/bot/api/v1/accounts');
});

test('same-player export succeeds, keeps scope and only scans hydrated credential names', async () => {
  const f = fixture(); f.vault.login('A'); f.vault.seed('A', 'clash_hibachi_credentials_v1', hibachi(privateKey));
  f.vault.seed('B', `clash_hotstuff_agent_v1:${wallet}`, { privateKey: otherPrivateKey });
  const result = await f.api.syncGameAccountToPhantom({ token: 'token-A', exchangeId: 'hibachi', player: f.player('A') });
  assert.equal(result.ok, true); assert.equal(f.requests.length, 2);
  assert.equal((await f.api.gatherGameCredentials('hotstuff', f.player('A'))).ok, false);
  assert.equal(f.rawAccesses(), 0);
});

test('bot auth setup forwards original scope and aborts before wallet setup after stale reads', async () => {
  const f = fixture(); f.vault.login('A');
  const ready = await f.api.ensureGameExchangeReady('hotstuff', f.player('A'), { playerToken: 'token-A' });
  assert.equal(ready.ok, true); assert.equal(f.setupCalls[0].credentialScope.playerId, 'A');
  const gate = deferred(); f.deferRead(() => gate.promise);
  const pending = f.api.ensureGameExchangeReady('hotstuff', f.player('A'), { playerToken: 'token-A' });
  f.vault.login('B'); gate.resolve(null);
  await assert.rejects(pending, /account changed/);
  assert.equal(f.setupCalls.length, 1); assert.equal(f.writes.every(row => row.playerId === 'A'), true);
});

test('save-then-sync cannot use saved credentials after its originating account changes', async () => {
  const f = fixture(); f.vault.login('A'); const gate = deferred();
  const pending = f.api.saveThenSyncGameAccount({ token: 'token-A', exchangeId: 'hibachi', player: f.player('A'), saveFn: () => gate.promise });
  f.vault.login('B'); gate.resolve({ privateKey });
  await assert.rejects(pending, /account changed/); assert.equal(f.requests.length, 0);
});
