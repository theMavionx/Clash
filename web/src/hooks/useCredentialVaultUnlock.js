import { useCallback, useEffect, useLayoutEffect, useRef, useState } from 'react';
import { useWallet as useSolWallet } from '@solana/wallet-adapter-react';
import { useEvmWallet } from '../contexts/EvmWalletContext';
import { useAptosWallet } from '../contexts/AptosWalletContext';
import { useOptionalPrivy } from '../components/PrivyAuthProvider';
import { captureCredentialScope, assertCredentialScope } from '../lib/encryptedCredentialStorage';

const BASE = '/api/players/trading-credentials';
const PURPOSE = 'unlock-trading-credentials';
const safeErrors = new WeakSet();

function unlockError(message, code = 'VAULT_UNLOCK_FAILED') {
  const error = Object.assign(new Error(message), { code });
  safeErrors.add(error);
  return error;
}

function requestError(status) {
  if (status === 401) return unlockError('Wallet verification expired or your login changed. Please retry.', 'VAULT_AUTH_REQUIRED');
  if (status === 403) return unlockError('Verify an existing credential-owner wallet before unlocking.', 'VAULT_WALLET_MISMATCH');
  if (status === 429) return unlockError('Too many wallet verification requests. Please retry shortly.', 'VAULT_RATE_LIMIT');
  return unlockError('Credential wallet verification is unavailable. Please retry.', 'VAULT_UNAVAILABLE');
}

function canonicalWallet(value) {
  const wallet = String(value || '').trim();
  if (/^0x[0-9a-f]{40}$/iu.test(wallet)) return { wallet: wallet.toLowerCase(), chain: 'evm' };
  if (/^0x[0-9a-f]{1,64}$/iu.test(wallet)) return { wallet: `0x${wallet.slice(2).padStart(64, '0').toLowerCase()}`, chain: 'aptos' };
  if (/^[1-9A-HJ-NP-Za-km-z]{32,44}$/u.test(wallet)) return { wallet, chain: 'solana' };
  throw unlockError('Choose a supported credential-owner wallet.', 'VAULT_INVALID_WALLET');
}

function matches(address, wallet) {
  try { return canonicalWallet(address).wallet === wallet; } catch { return false; }
}

function asHex(value) {
  if (typeof value === 'string') {
    const hex = value.startsWith('0x') ? value : `0x${value}`;
    if (/^0x(?:[0-9a-f]{2})+$/iu.test(hex)) return hex;
    throw unlockError('The wallet returned an unsupported signature.');
  }
  const bytes = value instanceof Uint8Array || Array.isArray(value) ? value
    : value?.toUint8Array?.() || value?.bcsToBytes?.();
  if (!bytes || !bytes.length) throw unlockError('The wallet did not return a signature.');
  return `0x${Array.from(bytes, byte => byte.toString(16).padStart(2, '0')).join('')}`;
}

/** Select by exact anchored address only; never fall back to the first Privy wallet. */
function selectSigner(context, target) {
  const { wallet, chain } = target;
  if (chain === 'evm') {
    const evm = context.evmWallet;
    if (matches(evm?.address, wallet) && (evm?.walletClient?.signMessage || evm?.provider?.request)) {
      if (evm.walletClient?.account?.address && !matches(evm.walletClient.account.address, wallet)) {
        throw unlockError('Reconnect the selected credential-owner wallet.', 'VAULT_WALLET_MISMATCH');
      }
      return { kind: 'evm', client: evm.walletClient, provider: evm.provider, identity: evm.walletClient || evm.provider };
    }
    const privyWallet = context.privy?.authenticated && context.privy.evmWallets?.find(candidate => matches(candidate?.address, wallet));
    if (privyWallet?.getEthereumProvider) return { kind: 'privy-evm', identity: privyWallet, wallet: privyWallet };
  }
  if (chain === 'solana') {
    const sol = context.solWallet;
    if (sol?.publicKey?.toBase58?.() === wallet && typeof sol.signMessage === 'function' && sol.connected !== false) {
      return { kind: 'solana', identity: sol.signMessage, signMessage: sol.signMessage };
    }
    const privyWallet = context.privy?.authenticated && context.privy.solanaWallets?.find(candidate => candidate?.address === wallet);
    if (privyWallet && typeof context.privy.solanaSignMessage === 'function') {
      return { kind: 'privy-solana', identity: privyWallet, wallet: privyWallet, signMessage: context.privy.solanaSignMessage };
    }
  }
  if (chain === 'aptos') {
    const aptos = context.aptosWallet;
    if (matches(aptos?.address, wallet) && aptos?.publicKey && typeof aptos.signMessage === 'function') {
      return { kind: 'aptos', identity: aptos.signMessage, publicKey: aptos.publicKey, signMessage: aptos.signMessage };
    }
  }
  throw unlockError(`Connect the credential-owner wallet ${wallet} to unlock.`, 'VAULT_WALLET_REQUIRED');
}

function validateChallenge(challenge, target, playerId, origin) {
  const id = challenge?.challengeId;
  if (!/^[A-Za-z0-9_-]{43}$/u.test(id || '') || challenge.nonce !== id || challenge.wallet !== target.wallet
    || challenge.chain !== target.chain || typeof challenge.message !== 'string' || challenge.message.length > 2500
    || !Number.isFinite(Date.parse(challenge.expiresAt)) || Date.parse(challenge.expiresAt) <= Date.now()) {
    throw unlockError('The wallet challenge expired or did not match this session.', 'VAULT_CHALLENGE_INVALID');
  }
  const lines = challenge.message.split('\n');
  const issuedAt = lines[8]?.replace(/^Issued At: /u, '');
  const expected = [
    'Clash trading credential vault', 'Version: 1', `Action: ${PURPOSE}`, `Origin: ${origin}`,
    `Player: ${playerId}`, `Wallet: ${target.wallet}`, `Chain: ${target.chain}`, `Nonce: ${id}`,
    `Issued At: ${issuedAt}`, `Expires At: ${challenge.expiresAt}`,
    'Authorize this browser to access your saved trading credentials. This does not submit a transaction.',
  ].join('\n');
  if (!Number.isFinite(Date.parse(issuedAt)) || expected !== challenge.message) {
    throw unlockError('The wallet challenge did not match the requested purpose.', 'VAULT_CHALLENGE_INVALID');
  }
}

async function signChallenge(signer, challenge, check) {
  check();
  if (signer.kind === 'evm' || signer.kind === 'privy-evm') {
    const provider = signer.provider || (signer.wallet ? await signer.wallet.getEthereumProvider() : null);
    check();
    if (provider?.request) {
      const accounts = await provider.request({ method: 'eth_accounts' });
      check();
      if (!Array.isArray(accounts) || !accounts.some(address => matches(address, challenge.wallet))) {
        throw unlockError('The signing provider is not connected to the credential-owner wallet.', 'VAULT_WALLET_MISMATCH');
      }
    } else if (!matches(signer.client?.account?.address, challenge.wallet)) {
      throw unlockError('Reconnect the credential-owner wallet before signing.', 'VAULT_WALLET_MISMATCH');
    }
    const signature = signer.client?.signMessage
      ? await signer.client.signMessage({ account: challenge.wallet, message: challenge.message })
      : await provider.request({ method: 'personal_sign', params: [asHex(new TextEncoder().encode(challenge.message)), challenge.wallet] });
    check();
    return { signature };
  }
  if (signer.kind === 'solana' || signer.kind === 'privy-solana') {
    const message = new TextEncoder().encode(challenge.message);
    const result = signer.kind === 'solana'
      ? await signer.signMessage(message) : await signer.signMessage({ message, wallet: signer.wallet });
    check();
    const signature = result?.signature || result;
    return { signature: typeof signature === 'string' ? signature : asHex(signature) };
  }
  const result = await signer.signMessage({ message: challenge.message, nonce: challenge.nonce });
  check();
  const fullMessage = `APTOS\nmessage: ${challenge.message}\nnonce: ${challenge.nonce}`;
  if (result?.fullMessage !== fullMessage) throw unlockError('The Aptos wallet returned an unsupported message format.');
  return { publicKey: asHex(signer.publicKey), signature: asHex(result.signature), fullMessage };
}

function beforeDeadline(promise, ms) {
  let timer;
  return Promise.race([promise, new Promise((_, reject) => {
    timer = setTimeout(() => reject(unlockError('Wallet verification expired. Please retry.', 'VAULT_CHALLENGE_INVALID')), ms);
  })]).finally(() => clearTimeout(timer));
}

/** Dependency-injected flow used by the hook and offline wallet/session-race tests. */
export function createCredentialVaultUnlocker({ getContext, captureScope, assertScope, fetchImpl, getOrigin }) {
  return async wallet => {
    const start = getContext(), token = start.token, playerId = String(start.playerId || '');
    if (!token || !playerId) throw unlockError('Sign in before unlocking credentials.', 'VAULT_AUTH_REQUIRED');
    const scope = captureScope();
    if (scope?.playerId !== playerId) throw unlockError('The player session changed. Please retry.', 'VAULT_SCOPE_CHANGED');
    const target = canonicalWallet(wallet), signer = selectSigner(start, target);
    const check = (checkedScope = scope) => {
      if (checkedScope?.playerId !== playerId) throw unlockError('The player session changed. Please retry.', 'VAULT_SCOPE_CHANGED');
      // Expected-token comparison stays inside the coordinator, never in the public scope object.
      assertScope(checkedScope, { token });
      const current = getContext();
      if (current.token !== token || String(current.playerId || '') !== playerId) {
        throw unlockError('The player session changed. Please retry.', 'VAULT_SCOPE_CHANGED');
      }
      const currentSigner = selectSigner(current, target);
      if (currentSigner.kind !== signer.kind || currentSigner.identity !== signer.identity
        || currentSigner.publicKey !== signer.publicKey || currentSigner.provider !== signer.provider
        || currentSigner.signMessage !== signer.signMessage) {
        throw unlockError('The connected signing wallet changed. Please retry.', 'VAULT_WALLET_MISMATCH');
      }
    };
    const post = async (path, body) => {
      check();
      const controller = new AbortController(), timer = setTimeout(() => controller.abort(), 15_000);
      try {
        const response = await fetchImpl(`${BASE}${path}`, { method: 'POST', credentials: 'include',
          headers: { 'Content-Type': 'application/json', Accept: 'application/json', 'x-token': token },
          body: JSON.stringify(body), signal: controller.signal });
        check();
        // Error payloads are untrusted and may accidentally contain secrets; never render or parse them.
        if (!response.ok) throw requestError(response.status);
        const result = await response.json();
        check();
        return result;
      } finally { clearTimeout(timer); }
    };
    check();
    const challenge = await post('/challenge', { wallet: target.wallet });
    validateChallenge(challenge, target, playerId, getOrigin());
    check();
    const proof = await beforeDeadline(signChallenge(signer, challenge, check), Math.max(1, Math.min(120_000, Date.parse(challenge.expiresAt) - Date.now())));
    check();
    if (Date.parse(challenge.expiresAt) <= Date.now()) throw unlockError('Wallet verification expired. Please retry.', 'VAULT_CHALLENGE_INVALID');
    const result = await post('/unlock', { challengeId: challenge.challengeId, ...proof });
    check();
    if (result?.unlocked !== true || result.verifiedWallet !== target.wallet) throw unlockError('Wallet unlock was not confirmed.');
    await getContext().onUnlocked?.(result);
    // A successful restore can intentionally invalidate trading signers by advancing
    // the vault generation. Accept that generation only for the original identity,
    // login token, and still-connected exact signing wallet/provider.
    check(captureScope());
    return result;
  };
}

/** Explicit user action only: this hook never signs or unlocks automatically on mount. */
export function useCredentialVaultUnlock({ token, playerId, onUnlocked }) {
  const evmWallet = useEvmWallet(), aptosWallet = useAptosWallet(), solWallet = useSolWallet(), privy = useOptionalPrivy();
  const [busy, setBusy] = useState(false), [error, setError] = useState('');
  const latest = useRef(null), inFlight = useRef(false), mounted = useRef(false);
  useLayoutEffect(() => { latest.current = { token, playerId, onUnlocked, evmWallet, aptosWallet, solWallet, privy }; });
  useEffect(() => { mounted.current = true; return () => { mounted.current = false; }; }, []);
  const unlock = useCallback(async wallet => {
    if (inFlight.current) throw unlockError('Wallet verification is already in progress.', 'VAULT_UNLOCK_BUSY');
    inFlight.current = true; setBusy(true); setError('');
    try {
      return await createCredentialVaultUnlocker({
        getContext: () => {
          if (!mounted.current) throw unlockError('Wallet verification was cancelled.', 'VAULT_SCOPE_CHANGED');
          return latest.current;
        },
        captureScope: captureCredentialScope, assertScope: assertCredentialScope,
        fetchImpl: (...args) => fetch(...args), getOrigin: () => window.location.origin,
      })(wallet);
    } catch (failure) {
      const message = safeErrors.has(failure)
        ? failure.message : 'Wallet verification was cancelled or failed. Please retry.';
      if (mounted.current) setError(message);
      throw unlockError(message, safeErrors.has(failure) ? failure.code : 'VAULT_UNLOCK_FAILED');
    } finally {
      inFlight.current = false;
      if (mounted.current) setBusy(false);
    }
  }, []);
  return { unlock, busy, error };
}

export default useCredentialVaultUnlock;
