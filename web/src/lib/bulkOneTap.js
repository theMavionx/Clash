import { ed25519 } from '@noble/curves/ed25519';
import bs58 from 'bs58';

const TRADING_ACTIONS = new Set(['m', 'l', 'cx', 'cxa', 'st', 'tp', 'trl', 'updateUserSettings']);
export const bulkAgentKey = (account, network) => `clash_bulk_agent_v1:${network}:${account}`;

export function validateBulkAgent(value, account, network) {
  if (!value) return null;
  if (value.account !== account || value.network !== network) throw new Error('Bulk one-tap key scope mismatch.');
  const secret = bs58.decode(value.secretKey);
  if (secret.length !== 32 || bs58.encode(ed25519.getPublicKey(secret)) !== value.publicKey || value.publicKey === account) {
    throw new Error('Saved Bulk one-tap key is invalid. Do not clear storage; reconnect secure storage.');
  }
  return value;
}

/** Secrets stay in this closure and the existing encrypted player vault, never
 * in the public hook state. Dependencies make lifecycle/race tests deterministic. */
export function createBulkOneTap({ account, network, capture, assert, read, write, fetchAccount,
  sendOwner, isCurrent = () => true, onChange = () => {}, delay = ms => new Promise(resolve => setTimeout(resolve, ms)) }) {
  const name = bulkAgentKey(account, network);
  let record = null, scope, disposed = false, busy = false, approved = false, ready = false, message = '';
  const check = () => {
    if (disposed || !isCurrent()) throw new Error('Bulk wallet or player changed. Retry from the current account.');
    if (scope) assert(scope);
  };
  const state = () => ({ enabled: record?.enabled === true && approved, approved, ready, busy,
    signer: record?.publicKey || '', saved: !!record, message });
  const publish = () => { if (!disposed && isCurrent()) onChange(state()); };
  const save = async next => { check(); await write(name, next, { scope }); check(); record = next; publish(); };
  const verify = async () => {
    approved = false; publish();
    const snapshot = await fetchAccount(); check();
    if (snapshot?.available === false) throw new Error('Bulk account verification is unavailable. Retry shortly.');
    approved = (snapshot?.authorizedAgentWallets || []).includes(record?.publicKey);
    publish(); return approved;
  };
  const lock = async fn => {
    if (busy) return { error: 'Bulk one-tap setup is already running.' };
    busy = true; message = ''; publish();
    try { check(); scope ||= capture(); check(); return await fn(); }
    catch (error) { message = error?.message || 'Bulk one-tap setup failed.'; return { error: message }; }
    finally { busy = false; publish(); }
  };
  const load = () => lock(async () => {
    record = validateBulkAgent(await read(name), account, network); check();
    if (record) await verify();
    ready = true; publish(); return { success: true };
  });
  const waitFor = async expected => {
    for (let attempt = 0; attempt < 5; attempt++) {
      if (attempt) await delay(600);
      if (await verify() === expected) return;
    }
    throw new Error('Bulk has not confirmed the permission change yet. Retry to check it; your key is safely retained.');
  };
  return {
    state, load,
    dispose() { disposed = true; record = null; },
    async setEnabled(enabled) {
      return lock(async () => {
        if (!ready) throw new Error('Wait for encrypted key storage to load, then retry.');
        if (!enabled) {
          if (record) await save({ ...record, enabled: false });
          return { success: true };
        }
        if (!record) {
          const secret = crypto.getRandomValues(new Uint8Array(32));
          const next = { account, network, publicKey: bs58.encode(ed25519.getPublicKey(secret)),
            secretKey: bs58.encode(secret), enabled: false, createdAt: Date.now() };
          await save(next); // persist before granting rights; never orphan a granted key
        }
        if (!await verify()) {
          await sendOwner({ kind: 'register_agent', agent: record.publicKey }, check); check();
          await waitFor(true);
        }
        await save({ ...record, enabled: true });
        return { success: true };
      });
    },
    async revoke() {
      return lock(async () => {
        if (!record) throw new Error('No saved Bulk one-tap key.');
        await save({ ...record, enabled: false });
        if (await verify()) {
          await sendOwner({ kind: 'revoke_agent', agent: record.publicKey }, check); check();
          await waitFor(false);
        }
        return { success: true }; // retain disabled recovery record, not an active grant
      });
    },
    signer() { check(); return record?.enabled && approved && !busy ? record.publicKey : null; },
    sign(prepared) {
      check();
      if (!record?.enabled || !approved || busy) throw new Error('Bulk one-tap is not ready.');
      const tx = prepared?.transaction;
      if (prepared.network !== network || prepared.signature_mode !== 'raw' || tx?.account !== account
        || tx?.signer !== record.publicKey || !tx.actions?.length
        || !tx.actions.every(action => Object.keys(action).length === 1 && TRADING_ACTIONS.has(Object.keys(action)[0]))) {
        throw new Error('Bulk one-tap transaction scope or permissions mismatch.');
      }
      const bytes = Uint8Array.from(atob(prepared.message_base64), ch => ch.charCodeAt(0));
      return ed25519.sign(bytes, bs58.decode(record.secretKey));
    },
  };
}
