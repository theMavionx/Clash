// Arcus destination for ClashBot copy bots: a fresh Ed25519 API key, scoped
// to subaccount 0 and registered at Arcus with an EIP-712 `CreateApiKey`
// signature from the player's wallet (POST https://api.arcus.xyz/v1/createApiKey,
// CORS *). Request body and typed data follow the Arcus API reference
// (docs.arcus.xyz/api-reference/onboarding/create-api-key, OpenAPI
// 2026.10.23) and ClashBot's server/arcus-signing.ts arcusCreateApiKeyTypedData.
//
// Trade-only: Arcus API keys sign orders/cancels only; deposits and
// withdrawals need the owner wallet. Only the key's private seed is handed to
// ClashBot; the player's wallet key never leaves the wallet.
import { ed25519 } from '@noble/curves/ed25519';

const API_URL = 'https://api.arcus.xyz';
const CHAIN_ID = 4663; // ClashBot ARCUS_PRODUCTION_CHAIN_ID / Arcus production EIP-712 domain
const ACCOUNT_INDEX = 0;
const KEY_NAME = 'clashbot-copy';
// Arcus accepts validUntil within [now+1d, now+180d]; stay a day inside the upper bound.
const VALIDITY_MS = 179 * 24 * 60 * 60 * 1000;

export const requirements = {
  chain: 'evm',
  label: 'Your wallet signs one Arcus "Create API key" message for a ClashBot-only trading key on subaccount 0 (179 days). API keys trade only; they cannot withdraw.',
};

const hex = (bytes) => Array.from(bytes, (byte) => byte.toString(16).padStart(2, '0')).join('');

function owner(walletCtx) {
  const text = String(walletCtx?.evmWalletAddress || walletCtx?.walletAddress || '').trim().toLowerCase();
  if (!/^0x[0-9a-f]{40}$/.test(text)) throw new Error('Connect your EVM wallet to set up Arcus.');
  return text;
}

function splitSignature(signature) {
  const raw = String(signature || '').replace(/^0x/, '');
  if (!/^[0-9a-fA-F]{130}$/.test(raw)) throw new Error('The wallet returned an invalid Arcus signature');
  let v = parseInt(raw.slice(128, 130), 16);
  if (v < 27) v += 27;
  return { r: `0x${raw.slice(0, 64)}`, s: `0x${raw.slice(64, 128)}`, v: `0x${v.toString(16)}` };
}

/**
 * @param {{ walletCtx: object, onProgress?: (message: string) => void }} ctx
 * @returns {Promise<{ destinationAccount: string, credential: object }>}
 */
export async function connect(ctx) {
  const { walletCtx, onProgress, onStage } = ctx || {};
  onStage?.('wallet');
  const wallet = walletCtx?.evmProvider;
  if (!wallet?.request) throw new Error('Connect your EVM wallet to set up Arcus.');
  const address = owner(walletCtx);

  const seed = new Uint8Array(32);
  crypto.getRandomValues(seed);
  const publicKey = hex(ed25519.getPublicKey(seed));
  const validUntil = Date.now() + VALIDITY_MS;
  // Recommended Arcus replay nonce: current time in nanoseconds (base-10).
  const nonce = (BigInt(Date.now()) * 1_000_000n).toString();
  const typedData = {
    domain: { name: 'Arcus API Key', version: '1', chainId: CHAIN_ID },
    types: {
      EIP712Domain: [
        { name: 'name', type: 'string' }, { name: 'version', type: 'string' }, { name: 'chainId', type: 'uint256' },
      ],
      CreateApiKey: [
        { name: 'apiWalletName', type: 'string' },
        { name: 'apiWalletPublicKey', type: 'string' },
        { name: 'validUntil', type: 'uint256' },
        { name: 'nonce', type: 'string' },
        { name: 'accountIndex', type: 'uint8' },
      ],
    },
    primaryType: 'CreateApiKey',
    message: { apiWalletName: KEY_NAME, apiWalletPublicKey: publicKey, validUntil, nonce, accountIndex: ACCOUNT_INDEX },
  };
  onStage?.('api_key');
  onProgress?.('Sign the Arcus API key request in your wallet…');
  let signature;
  try {
    signature = await wallet.request({ method: 'eth_signTypedData_v4', params: [address, JSON.stringify(typedData)] });
  } catch (error) {
    if (error?.code === 4001) throw new Error('The Arcus API key signature was rejected in the wallet.');
    throw error;
  }

  onStage?.('register');
  onProgress?.('Registering the ClashBot API key at Arcus…');
  let response;
  try {
    response = await fetch(`${API_URL}/v1/createApiKey`, {
      method: 'POST',
      headers: { 'content-type': 'application/json', accept: 'application/json' },
      body: JSON.stringify({
        address, publicKey, apiWalletName: KEY_NAME, accountIndex: ACCOUNT_INDEX, validUntil, nonce,
        signature: splitSignature(signature),
      }),
    });
  } catch {
    throw new Error('Arcus is unreachable right now. Try again in a moment.');
  }
  const payload = await response.json().catch(() => ({}));
  if (!response.ok) {
    const detail = typeof payload?.error === 'string' ? payload.error : payload?.error?.message || payload?.message || '';
    if (response.status === 401) throw new Error('Arcus did not accept the wallet signature.');
    throw new Error(`Arcus refused the API key${detail ? `: ${detail}` : ` (HTTP ${response.status})`}`);
  }
  if (payload?.apiKey && String(payload.apiKey).toLowerCase().replace(/^0x/, '') !== publicKey) {
    throw new Error('Arcus registered a different API key than requested');
  }
  // 202: accepted, ingested shortly. ClashBot re-checks that the key is ACTIVE at provision.
  await new Promise((resolve) => { setTimeout(resolve, 2_000); });

  return {
    destinationAccount: address,
    credential: {
      schema: 'arcus.apikey.v1', owner: address, accountIndex: ACCOUNT_INDEX, publicKey,
      privateKey: `0x${hex(seed)}`, validUntil, apiWalletName: KEY_NAME,
      onboardingProvenance: 'wallet-signed-eip712-trade-key-v1',
    },
  };
}
