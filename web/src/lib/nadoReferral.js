const DEFAULT_NADO_FUUL_API_BASE = 'https://api.fuul.xyz/api/v1/';
const DEFAULT_NADO_REFERRAL_CODE = '13z8hnl';

// Fuul keys used by browser applications are public, project-scoped SDK keys.
// Keep an environment override so Nado can rotate its key without a code change.
const DEFAULT_NADO_FUUL_API_KEY = '777a33c4c76c8a5fc22093bb7f83fa63dd428cd90e07fc603f2f87a5fd43e8ff';

export const NADO_REFERRAL_CODE = String(
  import.meta.env?.VITE_NADO_REFERRAL_CODE || DEFAULT_NADO_REFERRAL_CODE,
).trim();
export const NADO_REFERRAL_URL = String(
  import.meta.env?.VITE_NADO_REFERRAL_URL || `https://app.nado.xyz?join=${NADO_REFERRAL_CODE}`,
).trim();
export const NADO_FUUL_API_BASE = String(
  import.meta.env?.VITE_NADO_FUUL_API_BASE || DEFAULT_NADO_FUUL_API_BASE,
).trim();
export const NADO_FUUL_API_KEY = String(
  import.meta.env?.VITE_NADO_FUUL_API_KEY || DEFAULT_NADO_FUUL_API_KEY,
).trim();

const EVM_ADDRESS_RE = /^0x[0-9a-fA-F]{40}$/;
const NADO_REFERRAL_VERIFICATION_STORAGE_PREFIX = 'clash_nado_referral_verified_v1';

export const NADO_REFERRAL_ACCESS = Object.freeze({
  DISCONNECTED: 'disconnected',
  CHECKING: 'checking',
  REQUIRED: 'required',
  UNAVAILABLE: 'unavailable',
  READY: 'ready',
});

// Referral state is wallet-scoped. Treat a stale result from a previously
// connected wallet as unknown so a wallet switch can never inherit another
// wallet's approval for even a single render.
export function nadoReferralAccessState(status, walletAddress) {
  const wallet = String(walletAddress || '').trim().toLowerCase();
  if (!wallet) return NADO_REFERRAL_ACCESS.DISCONNECTED;
  const statusWallet = String(status?.wallet || '').trim().toLowerCase();
  if (!status || statusWallet !== wallet || status?.checking === true) {
    return NADO_REFERRAL_ACCESS.CHECKING;
  }
  if (status?.has_referrer === true) return NADO_REFERRAL_ACCESS.READY;
  if (status?.has_referrer === false) return NADO_REFERRAL_ACCESS.REQUIRED;
  return NADO_REFERRAL_ACCESS.UNAVAILABLE;
}

export function requireNadoReferralVerification(status, walletAddress, code = NADO_REFERRAL_CODE) {
  const access = nadoReferralAccessState(status, walletAddress);
  if (access === NADO_REFERRAL_ACCESS.READY) return status;
  if (access === NADO_REFERRAL_ACCESS.REQUIRED) {
    throw new Error(`Accept the Clash Nado referral ${assertReferralCode(code)} before opening a trade`);
  }
  throw new Error('Nado referral verification is unavailable. Accept and verify the referral before opening a trade.');
}

function referralVerificationStorage(options = {}) {
  if (options.storage) return options.storage;
  if (typeof window !== 'undefined') return window.localStorage;
  return null;
}

function referralVerificationKey(address) {
  return `${NADO_REFERRAL_VERIFICATION_STORAGE_PREFIX}:${assertEvmAddress(address).toLowerCase()}`;
}

export function readNadoReferralVerification(address, options = {}) {
  const storage = referralVerificationStorage(options);
  if (!storage) return null;
  try {
    const record = JSON.parse(storage.getItem(referralVerificationKey(address)) || 'null');
    const wallet = assertEvmAddress(address).toLowerCase();
    if (record?.verified !== true || String(record?.wallet || '').toLowerCase() !== wallet) return null;
    return record;
  } catch {
    return null;
  }
}

export function rememberNadoReferralVerification(address, details = {}, options = {}) {
  const storage = referralVerificationStorage(options);
  if (!storage) return null;
  const wallet = assertEvmAddress(address).toLowerCase();
  const record = {
    wallet,
    verified: true,
    verified_at: Date.now(),
    source: String(details?.source || 'nado_verification'),
    code: details?.code ? String(details.code) : null,
    linked_our_referral: details?.linked_our_referral === true,
  };
  try {
    storage.setItem(referralVerificationKey(wallet), JSON.stringify(record));
    return record;
  } catch {
    return null;
  }
}

function assertEvmAddress(address) {
  const clean = String(address || '').trim();
  if (!EVM_ADDRESS_RE.test(clean)) throw new Error('Nado referral wallet address is invalid');
  return clean;
}

function assertReferralCode(code) {
  const clean = String(code || '').trim();
  if (!/^[a-zA-Z0-9-]{1,30}$/.test(clean)) throw new Error('Nado referral code is invalid');
  return clean;
}

function fuulUrl(path, query = {}) {
  const base = NADO_FUUL_API_BASE.endsWith('/') ? NADO_FUUL_API_BASE : `${NADO_FUUL_API_BASE}/`;
  const url = new URL(String(path || '').replace(/^\/+/, ''), base);
  for (const [key, value] of Object.entries(query)) {
    if (value != null && value !== '') url.searchParams.set(key, String(value));
  }
  return url;
}

async function fuulRequest(path, { method = 'GET', query, body, fetchImpl = fetch } = {}) {
  if (!NADO_FUUL_API_KEY) throw new Error('Nado referral API key is not configured');
  const response = await fetchImpl(fuulUrl(path, query), {
    method,
    headers: {
      Authorization: `Bearer ${NADO_FUUL_API_KEY}`,
      'X-Fuul-Sdk-Version': '0.0.0',
      ...(body == null ? {} : { 'Content-Type': 'application/json' }),
    },
    ...(body == null ? {} : { body: JSON.stringify(body) }),
  });
  const text = await response.text();
  let data = null;
  if (text) {
    try { data = JSON.parse(text); }
    catch { data = { message: text }; }
  }
  if (!response.ok) {
    const detail = data?.message || data?.error || text || `HTTP ${response.status}`;
    throw new Error(`Nado referral request failed: ${detail}`);
  }
  return data || {};
}

export function nadoReferralSignatureMessage(code = NADO_REFERRAL_CODE) {
  return `I am using referral code ${assertReferralCode(code)}`;
}

export async function fetchNadoReferralStatus(address, options = {}) {
  const userIdentifier = assertEvmAddress(address);
  const data = await fuulRequest('referral_codes/status', {
    ...options,
    query: {
      user_identifier: userIdentifier,
      user_identifier_type: 'evm_address',
    },
  });
  return { ...data, referred: data?.referred === true };
}

export async function fetchNadoReferralTermsStatus(address, options = {}) {
  const userIdentifier = assertEvmAddress(address);
  return fuulRequest('project-terms-conditions/status', {
    ...options,
    query: {
      user_identifier: userIdentifier,
      user_identifier_type: 'evm_address',
    },
  });
}

export async function acceptNadoReferralTerms(address, options = {}) {
  const userIdentifier = assertEvmAddress(address);
  return fuulRequest('project-terms-conditions/accept', {
    ...options,
    method: 'POST',
    body: {
      user_identifier: userIdentifier,
      user_identifier_type: 'evm_address',
      source: 'partner_site',
    },
  });
}

export async function fetchNadoReferralCodeAvailability(code = NADO_REFERRAL_CODE, options = {}) {
  const cleanCode = assertReferralCode(code);
  return fuulRequest(`referral_codes/${encodeURIComponent(cleanCode)}`, options);
}

export async function applyNadoReferralCode({
  address,
  signature,
  chainId,
  code = NADO_REFERRAL_CODE,
  fetchImpl = fetch,
}) {
  const userIdentifier = assertEvmAddress(address);
  const cleanCode = assertReferralCode(code);
  const signatureMessage = nadoReferralSignatureMessage(cleanCode);
  if (!/^0x[0-9a-fA-F]+$/.test(String(signature || ''))) {
    throw new Error('Nado referral signature is invalid');
  }
  const numericChainId = Number(chainId);
  if (!Number.isInteger(numericChainId) || numericChainId <= 0) {
    throw new Error('Nado referral chain ID is invalid');
  }
  return fuulRequest(`referral_codes/${encodeURIComponent(cleanCode)}/use`, {
    fetchImpl,
    method: 'PATCH',
    query: {
      user_identifier: userIdentifier,
      user_identifier_type: 'evm_address',
    },
    body: {
      signature: String(signature),
      signature_message: signatureMessage,
      chain_id: numericChainId,
    },
  });
}
