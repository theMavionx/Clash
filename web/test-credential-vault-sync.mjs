import assert from 'node:assert/strict';
import { test } from 'node:test';
import { createHash } from 'node:crypto';
import { createCredentialVaultSync } from './src/lib/credentialVaultSync.js';

const NAME = 'fixture_api';
const PREFIX = 'clash_player_credential_v1:';
const BINDING = 'clash_credential_legacy_owner_v1:';
const CONFLICT = 'clash_credential_conflict_v1:';
const copy = value => value == null ? null : structuredClone(value);
const idFor = name => createHash('sha256').update(name).digest('hex');
const response = (body, status = 200) => ({ ok: status >= 200 && status < 300, status, json: async () => copy(body) });
const row = (name, value, revision = 1, deleted = false) => ({ id: idFor(name), storageKey: name, revision, deleted, value });

function deferred() {
  let resolve;
  const promise = new Promise(done => { resolve = done; });
  return { promise, resolve };
}

function harness(options = {}) {
  const memory = new Map(), plain = new Map(), remote = new Map(), receipts = new Map(), calls = [];
  const tokens = new Map([['alice-token', 'alice'], ['bob-token', 'bob']]);
  const state = { token: undefined, unlocked: true, anchored: true, configured: true, putStatus: null, manifestPlayer: null };
  let hold = null, holdStorage = null, afterRequest = null, failWrite = null;
  const records = player => { if (!remote.has(player)) remote.set(player, new Map()); return remote.get(player); };
  const describe = name => name.startsWith('fixture_') ? { dex: name === 'fixture_etoro' ? 'etoro' : 'fixture',
    label: 'Fixture exchange', owner: name === 'fixture_owned' ? 'owner-alice' : null,
    playerId: name === 'fixture_only_alice' ? 'alice' : null } : null;
  const storage = {
    list: async () => [...new Set([...memory.keys(), ...plain.keys()])],
    read: async name => copy(memory.get(name)),
    write: async (name, value) => {
      if (failWrite?.(name)) throw new Error('Fixture persistence unavailable');
      if (holdStorage?.predicate(name, value)) {
        const current = holdStorage; holdStorage = null;
        current.entered.resolve(); await current.release.promise;
      }
      memory.set(name, copy(value));
    },
    remove: async name => { memory.delete(name); },
    readPlain: name => copy(plain.get(name)), removePlain: name => plain.delete(name),
  };
  function serve(call) {
    const { path, method, body, player } = call, table = records(player);
    if (path === '/session/logout') return response({ ok: true });
    if (!path) return response({ identity: { playerId: state.manifestPlayer || player, loginWallet: `owner-${player}` },
      unlocked: state.unlocked, keyStatus: { configured: state.configured },
      session: state.unlocked ? { verifiedWallet: `owner-${player}` } : null,
      unlockWallets: state.anchored ? [`owner-${player}`] : [], records: [...table.values()].map(({ value: _value, ...meta }) => meta) });
    if (path === '/restore') return response({ records: [...table.values()].filter(item => !item.deleted && (!body.ids || body.ids.includes(item.id))) });
    if (method === 'PUT' || method === 'DELETE') {
      if (state.putStatus) return response({ error: 'unsafe-upstream-fixture-secret' }, state.putStatus);
      const name = body.storageKey, existing = table.get(name), revision = existing?.revision || 0;
      const receiptKey = `${player}:${body.operationId}`, receipt = receipts.get(receiptKey);
      if (receipt) return receipt.input === JSON.stringify(body) ? response(receipt.body) : response({}, 409);
      if (body.expectedRevision !== revision) return response({}, 409);
      if (method === 'DELETE' && !existing) return response({}, 404);
      const saved = row(name, method === 'DELETE' ? null : body.value, revision + 1, method === 'DELETE');
      table.set(name, saved);
      const result = { record: saved, replayed: false };
      receipts.set(receiptKey, { input: JSON.stringify(body), body: result });
      return response(result);
    }
    return response({}, 404);
  }
  const fetchImpl = async (url, input = {}) => {
    const token = input.headers?.['x-token'];
    const call = { path: url.slice('/api/players/trading-credentials'.length), method: input.method || 'GET',
      player: tokens.get(token), token, body: input.body ? JSON.parse(input.body) : {}, input };
    calls.push(call);
    const result = serve(call);
    if (hold?.predicate(call)) {
      const current = hold; hold = null;
      current.entered.resolve(call); await current.release.promise;
    }
    return await afterRequest?.(call, result) || result;
  };
  const manager = createCredentialVaultSync({ storage, describe, fetchImpl, currentToken: () => state.token,
    canMigrate: (name, _value, context) => describe(name)?.owner === context.verifiedWallet, ...options });
  return { manager, state, memory, plain, calls, records, storage,
    async begin(player = 'alice', token = `${player}-token`) { state.token = token; tokens.set(token, player); await manager.begin({ playerId: player, token }); },
    holdNext(predicate) { const pending = { predicate, entered: deferred(), release: deferred() }; hold = pending;
      return { entered: pending.entered.promise, release: () => pending.release.resolve() }; },
    holdStorageWrite(predicate) { const pending = { predicate, entered: deferred(), release: deferred() }; holdStorage = pending;
      return { entered: pending.entered.promise, release: () => pending.release.resolve() }; },
    afterRequest(callback) { afterRequest = callback; }, failWrite(predicate) { failWrite = predicate; },
  };
}

test('verified local restore and writes are namespaced by server-confirmed player, never exposed in snapshots', async () => {
  const h = harness(); h.records('alice').set(NAME, row(NAME, { apiKey: 'alice-fixture' }));
  h.records('bob').set(NAME, row(NAME, { apiKey: 'bob-fixture' }));
  await h.begin(); assert.equal(h.manager.peek(NAME).apiKey, 'alice-fixture');
  await h.begin('bob'); assert.equal(h.manager.peek(NAME).apiKey, 'bob-fixture');
  assert.equal(h.memory.get(`${PREFIX}alice:${NAME}`).value.apiKey, 'alice-fixture');
  assert.equal(h.memory.get(`${PREFIX}bob:${NAME}`).value.apiKey, 'bob-fixture');
  assert.equal(JSON.stringify(h.manager.getSnapshot()).includes('fixture"'), false);
  assert.deepEqual(Object.keys(h.manager.capture()).sort(), ['epoch', 'playerId']);
});

test('A delayed manifest cannot hydrate A after B login', async () => {
  const h = harness(), held = h.holdNext(call => call.path === '' && call.player === 'alice');
  h.records('alice').set(NAME, row(NAME, { apiKey: 'alice-fixture' }));
  h.records('bob').set(NAME, row(NAME, { apiKey: 'bob-fixture' }));
  const old = h.begin(); await held.entered; await h.begin('bob'); held.release(); await old;
  assert.equal(h.manager.getSnapshot().playerId, 'bob'); assert.equal(h.manager.peek(NAME).apiKey, 'bob-fixture');
  assert.equal(h.calls.some(call => call.player === 'alice' && call.path === '/restore'), false);
});

test('A delayed restore cannot change B cache or persistence', async () => {
  const h = harness(), held = h.holdNext(call => call.path === '/restore' && call.player === 'alice');
  h.records('alice').set(NAME, row(NAME, { apiKey: 'alice-fixture' }));
  h.records('bob').set(NAME, row(NAME, { apiKey: 'bob-fixture' }));
  const old = h.begin(); await held.entered; await h.begin('bob'); held.release(); await old;
  assert.equal(h.manager.peek(NAME).apiKey, 'bob-fixture');
  assert.equal(h.memory.get(`${PREFIX}bob:${NAME}`).value.apiKey, 'bob-fixture');
});

test('pending writes retain their originating player scope across login', async () => {
  const h = harness(); await h.begin();
  const held = h.holdNext(call => call.method === 'PUT');
  const writing = h.manager.write(NAME, { apiKey: 'alice-fixture' }, { scope: h.manager.capture() });
  const rejected = assert.rejects(writing, /account changed/i);
  await held.entered; await h.begin('bob'); held.release(); await rejected;
  assert.equal(h.manager.peek(NAME), null); assert.equal(h.records('bob').size, 0);
  assert.equal(h.memory.has(`${PREFIX}bob:${NAME}`), false);
});

test('read awaiting A hydration cannot return the B value after login changes', async () => {
  const h = harness(), held = h.holdNext(call => call.path === '' && call.player === 'alice');
  h.records('alice').set(NAME, row(NAME, { apiKey: 'alice-fixture' }));
  h.records('bob').set(NAME, row(NAME, { apiKey: 'bob-fixture' }));
  const beginning = h.begin(); await held.entered;
  const reading = h.manager.read(NAME), rejected = assert.rejects(reading, /account changed/i);
  await h.begin('bob'); held.release(); await beginning; await rejected;
  assert.equal(h.manager.peek(NAME).apiKey, 'bob-fixture');
});

test('lock synchronously clears keys and denies stale scopes; a new token invalidates old scope', async () => {
  const h = harness(); await h.begin(); await h.manager.write(NAME, { apiKey: 'fixture' });
  const scope = h.manager.capture(); h.manager.lock({ revoke: false });
  assert.equal(h.manager.peek(NAME), null); assert.deepEqual(h.manager.names(), []);
  assert.throws(() => h.manager.write(NAME, {}, { scope }), /account changed/i);
  await h.begin('alice', 'rotated-token');
  assert.throws(() => h.manager.assert(scope), /account changed/i);
  assert.throws(() => h.manager.assert(h.manager.capture(), { token: 'alice-token' }), /account changed/i);
});

test('server identity mismatch never hydrates locally saved secrets', async () => {
  const h = harness(); h.state.manifestPlayer = 'bob';
  h.memory.set(`${PREFIX}alice:${NAME}`, { ownerId: 'alice', storageKey: NAME, revision: 1, value: { apiKey: 'fixture' } });
  await h.begin(); assert.equal(h.manager.getSnapshot().ready, false); assert.equal(h.manager.peek(NAME), null);
  assert.throws(() => h.manager.capture(), /wait/i);
});

test('locked hydrated sessions can capture scope and persist locally without claiming upload', async () => {
  const h = harness(); h.state.unlocked = false; await h.begin();
  await h.manager.write(NAME, { apiKey: 'pending-fixture' }, { scope: h.manager.capture() });
  assert.equal(h.manager.getSnapshot().pending, 1); assert.equal(h.calls.filter(call => call.method === 'PUT').length, 0);
  assert.equal(h.memory.get(`${PREFIX}alice:${NAME}`).dirty, true);
  h.state.unlocked = true; await h.manager.refresh();
  assert.equal(h.manager.getSnapshot().pending, 0); assert.equal(h.records('alice').get(NAME).value.apiKey, 'pending-fixture');
});

test('late revision-one restore cannot roll back an acknowledged revision-two write', async () => {
  const h = harness(); h.records('alice').set(NAME, row(NAME, { apiKey: 'old-fixture' })); await h.begin();
  const held = h.holdNext(call => call.path === '/restore'), refreshing = h.manager.refresh();
  await held.entered; await h.manager.write(NAME, { apiKey: 'new-fixture' });
  assert.equal(h.manager.peek(NAME).apiKey, 'new-fixture'); held.release(); await refreshing;
  assert.equal(h.manager.peek(NAME).apiKey, 'new-fixture');
  assert.equal(h.memory.get(`${PREFIX}alice:${NAME}`).revision, 2);
});

test('CAS conflict preserves registered local key in encrypted archive before accepting remote', async () => {
  const h = harness(); h.records('alice').set(NAME, row(NAME, { apiKey: 'old-fixture' })); await h.begin();
  h.records('alice').set(NAME, row(NAME, { apiKey: 'remote-fixture' }, 2));
  await h.manager.write(NAME, { apiKey: 'registered-local-fixture' });
  assert.equal(h.manager.peek(NAME).apiKey, 'remote-fixture');
  const archive = [...h.memory].find(([key]) => key.startsWith(CONFLICT));
  assert.equal(archive[1].entry.value.apiKey, 'registered-local-fixture');
  assert.equal(h.manager.getSnapshot().conflicts.length, 1);
  assert.equal(JSON.stringify(h.manager.getSnapshot()).includes('registered-local-fixture'), false);
});

test('remote tombstone discovered during 409 removes active key but archives conflicting local material', async () => {
  const h = harness(); h.records('alice').set(NAME, row(NAME, { apiKey: 'old-fixture' })); await h.begin();
  h.records('alice').set(NAME, row(NAME, null, 2, true));
  await h.manager.write(NAME, { apiKey: 'registered-local-fixture' });
  assert.equal(h.manager.peek(NAME), null); assert.equal(h.memory.get(`${PREFIX}alice:${NAME}`).deleted, true);
  assert.equal([...h.memory].find(([key]) => key.startsWith(CONFLICT))[1].entry.value.apiKey, 'registered-local-fixture');
  assert.equal(h.records('alice').get(NAME).revision, 2);
});

test('conflict archive write failure never overwrites the sole local key', async () => {
  const h = harness(); h.records('alice').set(NAME, row(NAME, { apiKey: 'old-fixture' })); await h.begin();
  h.records('alice').set(NAME, row(NAME, { apiKey: 'remote-fixture' }, 2)); h.failWrite(name => name.startsWith(CONFLICT));
  await assert.rejects(h.manager.write(NAME, { apiKey: 'registered-local-fixture' }), /persistence unavailable/);
  assert.equal(h.memory.get(`${PREFIX}alice:${NAME}`).value.apiKey, 'registered-local-fixture');
  assert.equal(h.manager.peek(NAME).apiKey, 'registered-local-fixture');
  await h.manager.refresh();
  assert.equal(h.memory.get(`${PREFIX}alice:${NAME}`).value.apiKey, 'registered-local-fixture', 'retry cannot discard unarchived durable key');
});

test('transient server failure keeps dirty local value and never returns secret-bearing upstream text', async () => {
  const h = harness(); await h.begin(); h.state.putStatus = 503;
  await h.manager.write(NAME, { apiKey: 'pending-fixture' });
  assert.equal(h.manager.getSnapshot().pending, 1); assert.equal(h.records('alice').size, 0);
  assert.equal(h.manager.getSnapshot().error.includes('unsafe-upstream-fixture-secret'), false);
  h.state.putStatus = null; await h.manager.refresh();
  assert.equal(h.manager.getSnapshot().pending, 0); assert.equal(h.records('alice').get(NAME).value.apiKey, 'pending-fixture');
});

test('ambiguous acknowledged PUT retries with identical operation ID rather than duplicating mutation', async () => {
  const h = harness(); await h.begin(); let failed = false;
  h.afterRequest((call, result) => { if (call.method === 'PUT' && !failed) { failed = true; return response({}, 503); } return result; });
  await h.manager.write(NAME, { apiKey: 'pending-fixture' }); assert.equal(h.manager.getSnapshot().pending, 1);
  await h.manager.refresh();
  assert.equal(h.records('alice').get(NAME).revision, 1); assert.equal(h.manager.getSnapshot().pending, 0);
  const puts = h.calls.filter(call => call.method === 'PUT'); assert.equal(puts[0].body.operationId, puts[1].body.operationId);
});

test('serial writes rebase their own acknowledged predecessor and retain latest value', async () => {
  const h = harness(); await h.begin(); const held = h.holdNext(call => call.method === 'PUT');
  const first = h.manager.write(NAME, { apiKey: 'first-fixture' }); await held.entered;
  const second = h.manager.write(NAME, { apiKey: 'second-fixture' }); held.release(); await Promise.all([first, second]);
  assert.equal(h.records('alice').get(NAME).revision, 2); assert.equal(h.manager.peek(NAME).apiKey, 'second-fixture');
  assert.deepEqual(h.calls.filter(call => call.method === 'PUT').map(call => call.body.expectedRevision), [0, 1]);
});

test('failed durable save sends no server PUT and does not delete original legacy key', async () => {
  const h = harness(); await h.begin(); h.memory.set(NAME, { apiKey: 'legacy-fixture' });
  h.failWrite(name => name.startsWith(PREFIX));
  await assert.rejects(h.manager.write(NAME, { apiKey: 'new-fixture' }), /persistence unavailable/);
  assert.equal(h.calls.filter(call => call.method === 'PUT').length, 0); assert.equal(h.memory.get(NAME).apiKey, 'legacy-fixture');
});

test('only exact proof-bound legacy wallet scope migrates automatically', async () => {
  const h = harness(); h.plain.set('fixture_owned', { apiKey: 'owned-fixture' }); h.plain.set(NAME, { apiKey: 'unscoped-fixture' });
  await h.begin();
  assert.equal(h.records('alice').get('fixture_owned').value.apiKey, 'owned-fixture');
  assert.equal(h.records('alice').has(NAME), false); assert.equal(h.plain.has(NAME), true);
  assert.deepEqual(h.manager.getSnapshot().candidates.map(item => item.name), [NAME]);
});

test('explicit unknown legacy confirmation is unavailable while locked and binds only current player', async () => {
  const h = harness(); h.plain.set(NAME, { apiKey: 'legacy-fixture' }); h.state.unlocked = false; await h.begin();
  await assert.rejects(h.manager.approveLegacy(NAME), /verify your wallet/i);
  h.state.unlocked = true; await h.manager.refresh(); await h.manager.approveLegacy(NAME);
  assert.equal(h.memory.get(BINDING + NAME).playerId, 'alice'); assert.equal(h.plain.has(NAME), false);
  await h.begin('bob'); assert.equal(h.manager.peek(NAME), null); assert.equal(h.records('bob').size, 0);
});

test('other-player binding, player-scoped records and eToro demo credentials are not legacy candidates', async () => {
  const h = harness(); h.plain.set(NAME, { apiKey: 'alice-fixture' }); h.memory.set(BINDING + NAME, { playerId: 'alice' });
  h.plain.set('fixture_only_alice', { apiKey: 'alice-scoped-fixture' });
  h.plain.set('fixture_etoro', { environment: 'demo', apiKey: 'demo-fixture' });
  await h.begin('bob'); assert.deepEqual(h.manager.getSnapshot().candidates, []); assert.equal(h.records('bob').size, 0);
  await assert.rejects(h.manager.write('fixture_only_alice', {}), /does not belong/);
});

test('conflict archive survives coordinator restart and remains player isolated', async () => {
  const h = harness(); h.records('alice').set(NAME, row(NAME, { apiKey: 'old-fixture' })); await h.begin();
  h.records('alice').set(NAME, row(NAME, { apiKey: 'remote-fixture' }, 2)); await h.manager.write(NAME, { apiKey: 'local-fixture' });
  await h.begin('bob'); assert.equal(h.manager.getSnapshot().conflicts.length, 0);
  await h.begin(); assert.equal(h.manager.getSnapshot().conflicts.length, 1);
  await h.manager.useConflict(h.manager.getSnapshot().conflicts[0].key);
  assert.equal(h.records('alice').get(NAME).value.apiKey, 'local-fixture'); assert.equal(h.manager.getSnapshot().conflicts.length, 0);
});

test('missing server key configuration is explicit and local data remains pending, not falsely synced', async () => {
  const h = harness(); h.state.configured = false; h.state.unlocked = false; await h.begin();
  assert.equal(h.manager.getSnapshot().phase, 'unavailable');
  await h.manager.write(NAME, { apiKey: 'offline-fixture' });
  assert.equal(h.manager.getSnapshot().pending, 1); assert.equal(h.records('alice').size, 0);
  assert.equal(h.memory.get(`${PREFIX}alice:${NAME}`).value.apiKey, 'offline-fixture');
});

test('queued operation superseded by conflict does not rewrite rejected dirty material over clean disk record', async () => {
  const h = harness(); h.records('alice').set(NAME, row(NAME, { apiKey: 'old-fixture' })); await h.begin();
  h.records('alice').set(NAME, row(NAME, { apiKey: 'remote-fixture' }, 2));
  const held = h.holdNext(call => call.method === 'PUT');
  const first = h.manager.write(NAME, { apiKey: 'first-local-fixture' }); await held.entered;
  const second = h.manager.write(NAME, { apiKey: 'second-local-fixture' }); held.release();
  await Promise.all([first, second]);
  assert.equal(h.manager.peek(NAME).apiKey, 'remote-fixture');
  const persisted = h.memory.get(`${PREFIX}alice:${NAME}`);
  assert.equal(persisted.dirty, false); assert.equal(persisted.value.apiKey, 'remote-fixture');
  assert.equal(h.manager.getSnapshot().conflicts.length, 2, 'both rejected operations retain recoverable material');
});

test('new write begun during prior acknowledgement persistence is not dropped as a superseded operation', async () => {
  const h = harness(); await h.begin();
  const held = h.holdStorageWrite((name, value) => name === `${PREFIX}alice:${NAME}` && value.dirty === false && value.revision === 1);
  const first = h.manager.write(NAME, { apiKey: 'first-fixture' }); await held.entered;
  const second = h.manager.write(NAME, { apiKey: 'second-fixture' });
  held.release(); await Promise.all([first, second]);
  assert.equal(h.manager.peek(NAME).apiKey, 'second-fixture');
  assert.equal(h.records('alice').get(NAME).value.apiKey, 'second-fixture');
  assert.equal(h.memory.get(`${PREFIX}alice:${NAME}`).value.apiKey, 'second-fixture');
  assert.equal(h.records('alice').get(NAME).revision, 2);
});

test('new write begun during restore persistence survives in both cache and durable record', async () => {
  const h = harness(); h.records('alice').set(NAME, row(NAME, { apiKey: 'first-fixture' })); await h.begin();
  h.records('alice').set(NAME, row(NAME, { apiKey: 'remote-second-fixture' }, 2));
  const held = h.holdStorageWrite((name, value) => name === `${PREFIX}alice:${NAME}` && value.dirty === false && value.revision === 2);
  const refreshing = h.manager.refresh(); await held.entered;
  await h.manager.write(NAME, { apiKey: 'local-third-fixture' }); held.release(); await refreshing;
  assert.equal(h.manager.peek(NAME).apiKey, 'local-third-fixture');
  assert.equal(h.memory.get(`${PREFIX}alice:${NAME}`).value.apiKey, 'local-third-fixture');
  assert.equal(h.records('alice').get(NAME).revision, 3);
});

test('first vault unlock exposes informational loginWallet fallback when no anchor exists', async () => {
  const h = harness(); h.state.anchored = false; h.state.unlocked = false; await h.begin();
  assert.deepEqual(h.manager.getSnapshot().unlockWallets, ['owner-alice']);
  assert.equal(h.manager.getSnapshot().unlocked, false);
});

test('remote delete invalidates old signer scopes after refresh without changing game identity', async () => {
  const h = harness(); h.records('alice').set(NAME, row(NAME, { apiKey: 'old-fixture' })); await h.begin();
  const before = h.manager.capture(); h.records('alice').set(NAME, row(NAME, null, 2, true));
  await h.manager.refresh();
  assert.equal(h.manager.peek(NAME), null); assert.equal(h.manager.getSnapshot().playerId, 'alice');
  assert.throws(() => h.manager.assert(before), /account changed/i);
  assert.notEqual(h.manager.capture().epoch, before.epoch);
  assert.equal(h.calls.filter(call => call.path === '/session/logout').length, 0);
});

test('local save and no-op refresh retain current signer scope rather than remounting active setup', async () => {
  const h = harness(); await h.begin(); const before = h.manager.capture();
  await h.manager.write(NAME, { apiKey: 'fixture' }, { scope: before }); await h.manager.refresh();
  assert.doesNotThrow(() => h.manager.assert(before)); assert.equal(h.manager.capture().epoch, before.epoch);
});
