// The encrypted browser adapter supplies persistence. This module never logs values.
const LOCAL_PREFIX = 'clash_player_credential_v1:';
const BINDING_PREFIX = 'clash_credential_legacy_owner_v1:';
const CONFLICT_PREFIX = 'clash_credential_conflict_v1:';
const BASE = '/api/players/trading-credentials';
const clone = value => value == null ? null : JSON.parse(JSON.stringify(value));

export function createCredentialVaultSync({ storage, describe, canMigrate,
  fetchImpl = (...args) => fetch(...args), cryptoImpl = globalThis.crypto,
  currentToken = () => typeof window === 'undefined' ? undefined : window._playerToken,
} = {}) {
  let active = null, epoch = 0;
  const listeners = new Set();
  let snapshot = Object.freeze({ phase: 'signed-out', playerId: null, ready: false, unlocked: false,
    count: 0, pending: 0, candidates: [], conflicts: [], unlockWallets: [], error: null });
  const publish = (session, error = null) => {
    if (session !== active) return;
    snapshot = Object.freeze({ phase: session ? session.phase : 'signed-out', playerId: session?.playerId || null, epoch,
      ready: !!session?.ready, unlocked: !!session?.unlocked, count: session?.cache.size || 0,
      pending: session ? [...session.entries.values()].filter(row => row.dirty).length : 0,
      candidates: session ? [...session.candidates.values()].map(row => ({ name: row.name, ...describe(row.name) })) : [],
      conflicts: session ? [...session.conflicts.values()].map(row => ({ key: row.key, name: row.name,
        label: describe(row.name)?.label || 'Trading key', deleted: !!row.entry.deleted })) : [],
      unlockWallets: session?.unlockWallets || [], error: error || session?.error || null });
    listeners.forEach(listener => listener());
  };
  function assertSession(session) {
    const token = currentToken();
    if (!session || active !== session || session.epoch !== epoch
      || (token !== undefined && token !== session.token)) throw new Error('Trading account changed. Please retry.');
  }
  function capture() {
    const session = active;
    assertSession(session);
    if (!session.authenticated || !session.ready) throw new Error('Wait for secure trading storage to connect.');
    return Object.freeze({ playerId: session.playerId, epoch: session.epoch });
  }
  function resolveScope(scope) {
    const session = active;
    assertSession(session);
    if (!scope || scope.playerId !== session.playerId || scope.epoch !== session.epoch) {
      throw new Error('Trading account changed. Please retry.');
    }
    return session;
  }
  async function request(session, path = '', options = {}) {
    assertSession(session);
    const response = await fetchImpl(BASE + path, { ...options, credentials: 'same-origin', cache: 'no-store',
      signal: session.controller.signal,
      headers: { 'Content-Type': 'application/json', 'x-token': session.token, ...options.headers } });
    assertSession(session);
    // Do not propagate arbitrary upstream bodies to logger or trading error banners.
    if (!response.ok) {
      const error = new Error(response.status === 403 ? 'Verify your wallet to sync trading keys.'
        : response.status === 409 ? 'A newer saved credential exists. Reload its latest version.'
          : 'Secure key sync is unavailable. Your local changes are pending.');
      error.status = response.status;
      throw error;
    }
    const result = await response.json();
    assertSession(session);
    return result;
  }
  const localName = (session, name) => `${LOCAL_PREFIX}${session.playerId}:${name}`;
  const uuid = () => cryptoImpl.randomUUID();
  async function recordId(name) {
    const bytes = await cryptoImpl.subtle.digest('SHA-256', new TextEncoder().encode(name));
    return [...new Uint8Array(bytes)].map(byte => byte.toString(16).padStart(2, '0')).join('');
  }
  async function persist(session, name, entry) {
    assertSession(session);
    await storage.write(localName(session, name), { ...clone(entry), ownerId: session.playerId, storageKey: name });
    assertSession(session);
  }
  async function cleanupLegacy(session, name) {
    assertSession(session);
    const binding = await storage.read(BINDING_PREFIX + name);
    assertSession(session);
    if (binding?.playerId && binding.playerId !== session.playerId) return;
    await storage.write(BINDING_PREFIX + name, { playerId: session.playerId });
    assertSession(session);
    await storage.remove(name);
    assertSession(session);
    storage.removePlain?.(name);
  }
  function cacheEntry(session, name, entry) {
    session.entries.set(name, entry);
    if (entry.deleted) session.cache.delete(name); else session.cache.set(name, clone(entry.value));
  }
  async function archiveConflict(session, name, local) {
    if (!local?.dirty) return;
    const key = `${CONFLICT_PREFIX}${session.playerId}:${name}:${local.operationId}`;
    const conflict = { key, ownerId: session.playerId, name, entry: clone(local) };
    await storage.write(key, conflict);
    assertSession(session);
    session.conflicts.set(key, conflict);
  }
  async function acceptRemote(session, row) {
    if (!describe(row.storageKey)) return;
    const descriptor = describe(row.storageKey);
    if (descriptor.playerId && descriptor.playerId !== session.playerId) return;
    const local = session.entries.get(row.storageKey);
    if ((local?.revision || 0) > row.revision || (session.revisions.get(row.storageKey) || 0) > row.revision) return;
    if (local?.dirty) {
      // A registered delegate may only exist in this rejected write. Keep its
      // encrypted material until the owner explicitly resolves the conflict.
      await archiveConflict(session, row.storageKey, local);
    }
    const entry = { revision: row.revision, deleted: !!row.deleted, value: row.deleted ? null : row.value,
      dirty: false, operationId: null };
    await persist(session, row.storageKey, entry);
    const afterPersist = session.entries.get(row.storageKey);
    if (afterPersist !== local) {
      // A write started while local encryption was awaiting WebCrypto/IndexedDB.
      // Preserve that operation; its queued CAS will resolve against the server.
      if (afterPersist) await persist(session, row.storageKey, afterPersist);
      return;
    }
    if (!local || local.revision !== entry.revision || local.deleted !== entry.deleted) session.remoteChanged = true;
    cacheEntry(session, row.storageKey, entry);
    // Remove legacy data only when it already belongs to this player.
    const binding = await storage.read(BINDING_PREFIX + row.storageKey);
    assertSession(session);
    if (binding?.playerId === session.playerId) await cleanupLegacy(session, row.storageKey);
  }
  async function flushOne(session, name, operation) {
    assertSession(session);
    if (!session.unlocked || !operation.dirty) return;
    const id = await recordId(name);
    assertSession(session);
    // Serial queues rebase later *local* operations after the preceding acknowledged revision.
    const baseRevision = session.revisions.get(name) ?? operation.revision ?? 0;
    try {
      const data = await request(session, '/' + id, { method: operation.deleted ? 'DELETE' : 'PUT',
        body: JSON.stringify({ storageKey: name, ...(operation.deleted ? {} : { value: operation.value }),
          expectedRevision: baseRevision, operationId: operation.operationId }) });
      session.revisions.set(name, data.record.revision);
      const latest = session.entries.get(name);
      if (latest?.operationId === operation.operationId) {
        const clean = { ...latest, revision: data.record.revision, dirty: false };
        await persist(session, name, clean);
        const afterPersist = session.entries.get(name);
        if (afterPersist === latest) cacheEntry(session, name, clean);
        else if (afterPersist?.dirty) {
          afterPersist.revision = data.record.revision;
          await persist(session, name, afterPersist);
        }
      } else if (latest?.dirty) {
        latest.revision = data.record.revision;
        await persist(session, name, latest);
      }
      session.error = null;
    } catch (error) {
      assertSession(session);
      if (error.status === 409) {
        await archiveConflict(session, name, operation);
        const manifest = await request(session);
        const metadata = manifest.records.find(row => row.id === id);
        const data = metadata?.deleted ? { records: [metadata] }
          : await request(session, '/restore', { method: 'POST', body: JSON.stringify({ ids: [id] }) });
        const remote = data.records.find(row => row.id === id);
        if (remote) {
          session.revisions.set(name, remote.revision);
          await acceptRemote(session, remote);
        }
        session.error = 'A newer saved key exists. Your conflicting local key is preserved; review it before reconnecting.';
      } else {
        if (error.status === 403) session.unlocked = false;
        session.error = error.message;
      }
    }
    publish(session);
  }
  function queue(session, name, work) {
    const previous = session.queues.get(name) || Promise.resolve();
    const next = previous.catch(() => {}).then(work);
    session.queues.set(name, next);
    next.finally(() => { if (session.queues.get(name) === next) session.queues.delete(name); }).catch(() => {});
    return next;
  }
  function write(name, value, { scope } = {}) {
    const session = resolveScope(scope || capture()), descriptor = describe(name);
    if (!descriptor || (descriptor.playerId && descriptor.playerId !== session.playerId)
      || (value?.onboardingPlayerId && value.onboardingPlayerId !== session.playerId)) {
      return Promise.reject(new Error('Credential does not belong to this trading account.'));
    }
    const previous = session.entries.get(name);
    const operation = { value: clone(value), deleted: value == null, dirty: true,
      revision: previous?.revision || session.revisions.get(name) || 0, operationId: uuid() };
    cacheEntry(session, name, operation); // Synchronous adapters see their own write immediately.
    publish(session);
    let durablySaved = false;
    return queue(session, name, async () => {
      assertSession(session);
      const beforePersist = session.entries.get(name);
      if (beforePersist && !beforePersist.dirty && beforePersist.operationId !== operation.operationId) return;
      await persist(session, name, operation);
      durablySaved = true;
      await cleanupLegacy(session, name);
      // A previous conflict/remote tombstone supersedes queued operations too.
      const latest = session.entries.get(name);
      if (latest && !latest.dirty && latest.operationId !== operation.operationId) return;
      await flushOne(session, name, operation);
    }).catch(error => {
      if (active === session) {
        if (!durablySaved && session.entries.get(name)?.operationId === operation.operationId) {
          if (previous) cacheEntry(session, name, previous);
          else { session.entries.delete(name); session.cache.delete(name); }
        }
        session.error = 'Could not safely save the trading key. Existing encrypted data is preserved; retry before authorizing a new signer.';
        publish(session);
      }
      throw error;
    });
  }
  async function discoverLegacy(session) {
    const names = await storage.list();
    assertSession(session);
    session.candidates.clear();
    for (const name of names) {
      const descriptor = describe(name);
      if (!descriptor || session.entries.has(name) || (descriptor.playerId && descriptor.playerId !== session.playerId)) continue;
      const binding = await storage.read(BINDING_PREFIX + name);
      assertSession(session);
      if (binding?.playerId && binding.playerId !== session.playerId) continue;
      const value = await storage.read(name) || storage.readPlain?.(name);
      assertSession(session);
      if (!value || (value.onboardingPlayerId && value.onboardingPlayerId !== session.playerId)) continue;
      if (descriptor.dex === 'etoro' && value.environment !== 'real') continue;
      session.candidates.set(name, { name });
      if (session.unlocked && canMigrate(name, value, { playerId: session.playerId, verifiedWallet: session.verifiedWallet })) {
        await write(name, value, { scope: capture() });
        session.candidates.delete(name);
      }
    }
  }
  async function synchronize(session, initial = false) {
    try {
      const manifest = await request(session);
      if (String(manifest.identity?.playerId || '') !== session.playerId) throw new Error('Trading account identity could not be verified.');
      session.authenticated = true;
      session.unlocked = !!manifest.unlocked;
      session.verifiedWallet = manifest.session?.verifiedWallet || null;
      session.unlockWallets = manifest.unlockWallets?.length ? manifest.unlockWallets
        : [manifest.identity?.loginWallet || manifest.identity?.wallet].filter(Boolean);
      if (initial) {
        const prefix = `${LOCAL_PREFIX}${session.playerId}:`;
        const names = await storage.list();
        assertSession(session);
        for (const key of names.filter(key => key.startsWith(prefix))) {
          const entry = await storage.read(key);
          assertSession(session);
          if (entry?.ownerId === session.playerId && entry.storageKey === key.slice(prefix.length) && describe(entry.storageKey)) {
            cacheEntry(session, entry.storageKey, entry);
          }
        }
        for (const key of names.filter(key => key.startsWith(`${CONFLICT_PREFIX}${session.playerId}:`))) {
          const conflict = await storage.read(key);
          assertSession(session);
          if (conflict?.ownerId === session.playerId && conflict.key === key && describe(conflict.name)) session.conflicts.set(key, conflict);
        }
      }
      for (const row of manifest.records || []) {
        if (!describe(row.storageKey)) continue;
        const local = session.entries.get(row.storageKey);
        if ((local?.revision || 0) > row.revision) continue;
        session.revisions.set(row.storageKey, row.revision);
        if (row.deleted && (!local?.dirty || row.revision > (local.revision || 0))) {
          await acceptRemote(session, row);
        } else if (local?.dirty) {
          // Preserve original CAS base; never blindly overwrite a newer device revision.
          session.revisions.set(row.storageKey, local.revision || 0);
        } else if (!local || local.revision !== row.revision) session.cache.delete(row.storageKey);
      }
      session.ready = true;
      if (session.unlocked) {
        for (const [name, row] of [...session.entries]) if (row.dirty) {
          await queue(session, name, () => flushOne(session, name, row));
        }
        const restored = await request(session, '/restore', { method: 'POST', body: '{}' });
        for (const row of restored.records || []) {
          if (!session.entries.get(row.storageKey)?.dirty) await acceptRemote(session, row);
        }
      }
      session.phase = manifest.keyStatus?.configured ? 'ready' : 'unavailable';
      if (!manifest.keyStatus?.configured) session.error = 'Server key storage is not configured. Keys are only saved on this device.';
      await discoverLegacy(session);
      assertSession(session);
      publish(session);
    } catch (error) {
      if (active !== session) return;
      session.phase = 'error';
      session.error = error.message || 'Secure key sync is unavailable.';
      publish(session);
    }
  }
  function lock({ revoke = true } = {}) {
    const previous = active;
    epoch++;
    active = null;
    previous?.controller.abort();
    previous?.cache.clear();
    previous?.entries.clear();
    publish(null);
    if (revoke && previous?.token) {
      // No secret-bearing body; revokes only this browser session, not exchange API keys.
      void fetchImpl(BASE + '/session/logout', { method: 'POST', credentials: 'same-origin', cache: 'no-store',
        keepalive: true, headers: { 'Content-Type': 'application/json', 'x-token': previous.token }, body: '{}' }).catch(() => {});
    }
  }
  function begin({ playerId, token }) {
    if (active?.playerId === String(playerId) && active?.token === token) return active.readyPromise;
    // Auth responses may have just installed a *new* cookie; never revoke it during initialization.
    lock({ revoke: false });
    if (!playerId || !token) return Promise.resolve();
    const session = { playerId: String(playerId), token, epoch, authenticated: false, ready: false, unlocked: false,
      phase: 'loading', error: null, cache: new Map(), entries: new Map(), revisions: new Map(), candidates: new Map(),
      queues: new Map(), conflicts: new Map(), controller: new AbortController(), unlockWallets: [] };
    active = session;
    publish(session);
    session.readyPromise = synchronize(session, true);
    return session.readyPromise;
  }
  async function refresh() {
    const session = active;
    assertSession(session);
    // Coalesce refreshes; no two restore/write passes can race each other.
    if (session.refreshPromise) return session.refreshPromise;
    session.refreshPromise = (async () => {
      await session.readyPromise;
      await Promise.all([...session.queues.values()].map(promise => promise.catch(() => {})));
      assertSession(session);
      session.remoteChanged = false;
      await synchronize(session, !session.authenticated);
      assertSession(session);
      if (session.remoteChanged) {
        // Only a remote restore/deletion requires new hook instances. Local
        // writes do not remount setup dialogs. Godot and game state stay alive.
        const identity = { playerId: session.playerId, token: session.token };
        lock({ revoke: false });
        await begin(identity);
      }
    })().finally(() => { session.refreshPromise = null; });
    return session.refreshPromise;
  }
  return {
    begin, lock, refresh, capture, assert: (scope, options = {}) => {
      const session = resolveScope(scope);
      if (options.token !== undefined && options.token !== session.token) throw new Error('Trading account changed. Please retry.');
    },
    subscribe(listener) { listeners.add(listener); return () => listeners.delete(listener); },
    getSnapshot: () => snapshot,
    peek(name) { try { assertSession(active); return clone(active?.cache.get(name)); } catch { return null; } },
    names() { try { assertSession(active); return [...active.cache.keys()]; } catch { return []; } },
    async read(name) {
      const session = active;
      if (!session) return null;
      await session.readyPromise;
      assertSession(session);
      return clone(session.cache.get(name));
    },
    write, remove: (name, options) => write(name, null, options),
    async useConflict(key) {
      const scope = capture(), session = resolveScope(scope), conflict = session.conflicts.get(key);
      if (!conflict || !session.unlocked) throw new Error('Unlock your saved keys before resolving this conflict.');
      await write(conflict.name, conflict.entry.deleted ? null : conflict.entry.value, { scope });
      resolveScope(scope);
      if (session.entries.get(conflict.name)?.dirty) return;
      await storage.remove(key);
      resolveScope(scope);
      session.conflicts.delete(key);
      publish(session);
    },
    async approveLegacy(name) {
      const scope = capture(), session = resolveScope(scope);
      if (!session.unlocked || !session.candidates.has(name)) throw new Error('Verify your wallet before importing this saved key.');
      const binding = await storage.read(BINDING_PREFIX + name);
      resolveScope(scope);
      if (binding?.playerId && binding.playerId !== session.playerId) throw new Error('This saved key belongs to another account.');
      const value = await storage.read(name) || storage.readPlain?.(name);
      resolveScope(scope);
      if (!value) throw new Error('Saved key is unavailable. Reconnect the exchange.');
      await write(name, value, { scope });
      resolveScope(scope);
      session.candidates.delete(name);
      publish(session);
    },
  };
}
