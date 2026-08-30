const { randomUUID } = require('node:crypto');
const { getAddress, isAddressEqual, recoverMessageAddress } = require('viem');

const TTL_MS = 10 * 60_000;
const MAX_CHALLENGES = 400;
const MIN_SLOT = 4; // Also leave existing SDK/UI slots 2 and 3 untouched.
const MAX_SLOT = 254;
const fail = (message, status = 400, code) => Object.assign(new Error(message), { status, code });

function accountIndex(value) {
  if (value == null || String(value).trim() === '') throw fail('Choose a Lighter account');
  const index = Number(value);
  if (!Number.isSafeInteger(index) || index < 0) throw fail('Invalid Lighter account index');
  return index;
}

function address(value) {
  try { return getAddress(String(value || '')); } catch { throw fail('Connect the EVM wallet that owns this Lighter account'); }
}

function publicKey(value) {
  const raw = String(value || '');
  const key = raw.replace(/^0x/iu, '').toLowerCase();
  if (/^[0-9a-f]{80}$/u.test(key)) return key;
  // Native ChangePubKey JSON serializes the 40-byte key as base64.
  if (/^[A-Za-z0-9+/]{54}==$/u.test(raw)) {
    const bytes = Buffer.from(raw, 'base64');
    if (bytes.length === 40 && bytes.toString('base64') === raw) return bytes.toString('hex');
  }
  throw fail('Invalid Lighter public key', 502);
}

function keyAt(keys, index) {
  return keys.find(key => Number(key.api_key_index ?? key.index) === index);
}

function occupied(key) {
  // A returned row with no key is ambiguous, not permission to overwrite it.
  return !!key;
}

function associated(keys, entry) {
  const row = keyAt(keys, entry.apiKeyIndex);
  return !!row && Number(row.account_index ?? entry.accountIndex) === entry.accountIndex
    && publicKey(row.public_key ?? row.pub_key) === publicKey(entry.publicKey);
}

function freeApiKeyIndex(keys, reserved = new Set()) {
  for (let index = MIN_SLOT; index <= MAX_SLOT; index++) {
    if (!occupied(keyAt(keys, index)) && !reserved.has(index)) return index;
  }
  throw fail('No unused Lighter API-key slot is available. Revoke an unused key on Lighter first.', 409);
}

/** Wallet-approved setup only; never accepts an arbitrary transaction to sign/send. */
function createLighterOnboarding({ getProfile, request, runSigner, now = Date.now, pause = ms => new Promise(resolve => setTimeout(resolve, ms)) }) {
  const challenges = new Map();
  const preparing = new Map();
  const rates = new Map();
  const profileId = () => {
    const p = getProfile();
    return JSON.stringify([p.dexId, p.api, p.chainId]);
  };
  const player = value => {
    if (typeof value !== 'string' || !value || value.length > 128) throw fail('Login required', 401);
    return value;
  };
  const prune = () => {
    for (const [id, entry] of challenges) if (entry.expiresAt <= now() && !entry.inflight) challenges.delete(id);
    for (const [id, entry] of rates) if (entry.until <= now()) rates.delete(id);
  };
  const read = path => request(path, { fresh: true });
  async function owned(index, owner) {
    const data = await read(`/api/v1/account?by=index&value=${index}`);
    const row = data?.accounts?.find(value => Number(value.account_index ?? value.index) === index);
    if (!row) throw fail('Lighter account was not found', 404);
    if (!isAddressEqual(address(row.l1_address), owner)) throw fail('This Lighter account belongs to another wallet', 409);
    return row;
  }
  async function keysFor(index) {
    const data = await read(`/api/v1/apikeys?account_index=${index}&api_key_index=255`);
    if (!Array.isArray(data?.api_keys) || data.api_keys.some(row =>
      !row || !Number.isInteger(Number(row.api_key_index ?? row.index))
      || Number(row.api_key_index ?? row.index) < 0 || Number(row.api_key_index ?? row.index) > 254
      || Number(row.account_index ?? index) !== index)) {
      throw fail('Lighter returned an invalid API-key list', 502);
    }
    return data.api_keys;
  }
  async function nextNonce(index, slot) {
    const data = await read(`/api/v1/nextNonce?account_index=${index}&api_key_index=${slot}`);
    if (!['number', 'string'].includes(typeof data?.nonce) || String(data.nonce).trim() === ''
      || !Number.isSafeInteger(Number(data.nonce)) || Number(data.nonce) < 0) {
      throw fail('Lighter returned an invalid API-key nonce', 502);
    }
    return Number(data.nonce);
  }
  async function discover(ownerInput) {
    const owner = address(ownerInput);
    const data = await read(`/api/v1/accountsByL1Address?l1_address=${encodeURIComponent(owner)}`);
    if (!Array.isArray(data?.sub_accounts)) throw fail('Lighter returned an invalid account list', 502);
    const accounts = [];
    for (const row of data.sub_accounts) {
      if (!isAddressEqual(address(row.l1_address), owner)) continue;
      const index = accountIndex(row.index ?? row.account_index);
      if (!accounts.some(value => value.accountIndex === index)) accounts.push({
        accountIndex: index, kind: String(row.account_type ?? row.type ?? 'Account'),
      });
    }
    return { owner, deployment: getProfile().dexId, accounts: accounts.sort((a, b) => a.accountIndex - b.accountIndex) };
  }
  function view(entry) {
    return {
      owner: entry.owner, deployment: entry.deployment, accountIndex: entry.accountIndex,
      apiKeyIndex: entry.apiKeyIndex, publicKey: entry.publicKey, challengeId: entry.id,
      expiresAt: entry.expiresAt, message: entry.message, nonce: entry.nonce, transactionExpiresAt: entry.transactionExpiresAt,
      // Existing Clash custody: encrypted browser storage, not a new server vault.
      // Persist BEFORE asking for the wallet signature so a server restart cannot lose the key.
      credentials: { accountIndex: entry.accountIndex, apiKeyIndex: entry.apiKeyIndex, apiPrivateKey: entry.privateKey },
    };
  }
  async function prepare({ playerId, wallet, accountIndex: rawIndex }) {
    const owner = address(wallet), index = accountIndex(rawIndex), pid = player(playerId), profile = profileId();
    const scope = JSON.stringify([profile, pid, owner.toLowerCase(), index]);
    prune();
    if (preparing.has(scope)) return preparing.get(scope);
    const old = [...challenges.values()].find(entry => entry.scope === scope && entry.expiresAt > now());
    if (old) return view(old);
    if (challenges.size + preparing.size >= MAX_CHALLENGES) throw fail('Lighter setup is busy. Try again shortly.', 429);
    const rate = rates.get(pid) || { count: 0, until: now() + 5 * 60_000 };
    if (rate.count >= 5) throw fail('Too many Lighter setup attempts. Try again in a few minutes.', 429);
    rate.count++;
    rates.set(pid, rate);
    const pending = (async () => {
      await owned(index, owner);
      const keys = await keysFor(index);
      // Reserve across players/tabs on this deployment, not just within one login.
      const reserved = new Set([...challenges.values()].filter(entry => entry.profile === profile
        && entry.accountIndex === index && entry.expiresAt > now()).map(entry => entry.apiKeyIndex));
      const slot = freeApiKeyIndex(keys, reserved);
      // Reserve before any further await; a simultaneous prepare cannot select this slot.
      const entry = { id: randomUUID(), profile, scope, playerId: pid, owner, accountIndex: index,
        apiKeyIndex: slot, deployment: getProfile().dexId, expiresAt: now() + TTL_MS, attempted: false };
      challenges.set(entry.id, entry);
      try {
        entry.nonce = await nextNonce(index, slot);
        let result;
        try { result = await runSigner('api_key_prepare', { account_index: index, api_key_index: slot, nonce: entry.nonce }); }
        catch { throw fail('Could not initialize the Lighter key signer. Please retry.', 502); }
        const secret = String(result?.api_private_key || '');
        const key = String(result?.public_key || '');
        const tx = JSON.parse(String(result?.tx_info || 'null'));
        const expiry = Number(tx?.ExpiredAt) < 10_000_000_000 ? Number(tx?.ExpiredAt) * 1000 : Number(tx?.ExpiredAt);
        if (!/^(0x)?[0-9a-f]{80}$/iu.test(secret) || Number(result?.tx_type) !== 8
          || !result?.tx_hash || !result?.message_to_sign
          || String(result.message_to_sign).length > 4000 || !tx
          || Number(tx.AccountIndex) !== index || Number(tx.ApiKeyIndex) !== slot
          || Number(tx.Nonce) !== entry.nonce || publicKey(tx.PubKey) !== publicKey(key)
          || !Number.isSafeInteger(expiry) || expiry <= now() || expiry > now() + 24 * 60 * 60_000) {
          throw fail('Lighter signer returned an invalid key-registration transaction', 502);
        }
        Object.assign(entry, { privateKey: secret, publicKey: key, message: String(result.message_to_sign),
          txType: 8, txInfo: String(result.tx_info), txHash: String(result.tx_hash),
          transactionExpiresAt: expiry });
        return view(entry);
      } catch (error) {
        challenges.delete(entry.id);
        // Never expose native signer output (it can contain the generated private key).
        if (error?.code || error?.status) throw error;
        throw fail('Could not prepare the Lighter API key. Please retry.', 502);
      }
    })();
    preparing.set(scope, pending);
    try { return await pending; } finally { preparing.delete(scope); }
  }
  async function submit({ playerId, challengeId, signature }) {
    const pid = player(playerId);
    prune();
    const entry = challenges.get(String(challengeId || ''));
    if (!entry || entry.expiresAt <= now()) throw fail('Lighter setup expired. Checking the saved key is safe; do not register another key yet.', 410, 'LIGHTER_SETUP_EXPIRED');
    if (entry.playerId !== pid || entry.profile !== profileId()) throw fail('Lighter setup belongs to another login or deployment', 403);
    if (!/^0x[0-9a-f]{130}$/iu.test(String(signature || ''))) throw fail('Invalid wallet signature');
    let recovered;
    try { recovered = await recoverMessageAddress({ message: entry.message, signature }); }
    catch { throw fail('Invalid wallet signature'); }
    if (!isAddressEqual(recovered, entry.owner)) throw fail('Lighter setup was signed by another wallet', 403);
    if (entry.inflight) return entry.inflight;
    entry.inflight = (async () => {
      await owned(entry.accountIndex, entry.owner);
      let keys = await keysFor(entry.accountIndex);
      const creds = { account_index: entry.accountIndex, api_key_index: entry.apiKeyIndex, api_private_key: entry.privateKey };
      if (!associated(keys, entry)) {
        if (occupied(keyAt(keys, entry.apiKeyIndex))) throw fail('This API-key slot is now occupied. No existing key was replaced.', 409);
        if (!entry.attempted) {
          if (await nextNonce(entry.accountIndex, entry.apiKeyIndex) !== entry.nonce) {
            throw fail('Lighter key nonce changed. No transaction was sent.', 409);
          }
          entry.attempted = true; // Set before dispatch; ambiguous retries only read.
          try {
            await runSigner('send_tx', { ...creds, tx_type: entry.txType, tx_info: entry.txInfo,
              tx_hash: entry.txHash, l1_signature: signature, nonce: entry.nonce, one_tap: true });
          } catch { /* Upstream may have accepted it; only association proves success. */ }
        }
        for (let attempt = 0; attempt < 3; attempt++) {
          if (attempt) await pause(attempt * 350);
          try { keys = await keysFor(entry.accountIndex); } catch { continue; }
          if (associated(keys, entry)) break;
        }
      }
      if (!associated(keys, entry)) {
        throw fail('Lighter has not confirmed this key yet. Retry to check the same key; it will not be submitted twice.', 409, 'LIGHTER_SETUP_PENDING');
      }
      try { await runSigner('check_client', { ...creds, nonce: entry.nonce, one_tap: true }); }
      catch { throw fail('Lighter key verification is temporarily unavailable. Retry to check the same key.', 502, 'LIGHTER_SETUP_PENDING'); }
      return { ok: true, owner: entry.owner, deployment: entry.deployment, accountIndex: entry.accountIndex,
        apiKeyIndex: entry.apiKeyIndex, publicKey: entry.publicKey };
    })();
    try { return await entry.inflight; } finally { entry.inflight = null; }
  }
  async function recover({ wallet, accountIndex: rawIndex, apiKeyIndex, apiPrivateKey, publicKey: pub }) {
    const owner = address(wallet), index = accountIndex(rawIndex), slot = Number(apiKeyIndex);
    if (!Number.isInteger(slot) || slot < MIN_SLOT || slot > MAX_SLOT || !/^(0x)?[0-9a-f]{80}$/iu.test(String(apiPrivateKey || ''))) {
      throw fail('Invalid saved Lighter key');
    }
    publicKey(pub);
    await owned(index, owner);
    if (!associated(await keysFor(index), { accountIndex: index, apiKeyIndex: slot, publicKey: pub })) {
      return { ok: false, nonce: await nextNonce(index, slot), checkedAt: now() };
    }
    try {
      await runSigner('check_client', { account_index: index, api_key_index: slot, api_private_key: apiPrivateKey, one_tap: true });
    } catch { throw fail('Could not verify the saved Lighter key. Retry the same connection.', 502); }
    return { ok: true };
  }
  return { discover, prepare, submit, recover };
}

module.exports = { createLighterOnboarding, freeApiKeyIndex };
