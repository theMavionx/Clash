import { Buffer } from 'buffer';
import { Transaction, VersionedTransaction } from '@solana/web3.js';

export const CLASHSOL_SYMBOL = 'clashSOL';
const API_REQUEST_TIMEOUT_MS = 8_000;

function sessionToken(explicitToken) {
  return explicitToken || (typeof window !== 'undefined' ? window._playerToken : null) || '';
}

async function apiJson(url, { method = 'GET', token, body, signal, timeoutMs = API_REQUEST_TIMEOUT_MS } = {}) {
  const controller = new AbortController();
  let timedOut = false;
  const abortFromCaller = () => controller.abort();
  if (signal?.aborted) controller.abort();
  else signal?.addEventListener?.('abort', abortFromCaller, { once: true });
  const timer = window.setTimeout(() => {
    timedOut = true;
    controller.abort();
  }, timeoutMs);
  try {
    const response = await fetch(url, {
      method,
      signal: controller.signal,
      cache: 'no-store',
      headers: {
        ...(body ? { 'content-type': 'application/json' } : {}),
        ...(sessionToken(token) ? { 'x-token': sessionToken(token) } : {}),
      },
      body: body ? JSON.stringify(body) : undefined,
    });
    let payload = null;
    try { payload = await response.json(); } catch { /* handled below */ }
    if (!response.ok) {
      const error = new Error(payload?.error || `Request failed (HTTP ${response.status})`);
      error.code = payload?.code || 'REQUEST_FAILED';
      error.status = response.status;
      error.details = payload?.details || null;
      throw error;
    }
    return payload;
  } catch (error) {
    if (timedOut && error?.name === 'AbortError') {
      const timeoutError = new Error('The swap status request timed out; tracking will continue automatically.');
      timeoutError.name = 'TimeoutError';
      timeoutError.code = 'CLIENT_TIMEOUT';
      timeoutError.retryable = true;
      throw timeoutError;
    }
    throw error;
  } finally {
    window.clearTimeout(timer);
    signal?.removeEventListener?.('abort', abortFromCaller);
  }
}

export function decodeSanctumTransaction(base64) {
  const raw = Buffer.from(String(base64 || ''), 'base64');
  if (!raw.length) throw new Error('Sanctum returned an empty transaction');
  const messageOffset = 1 + ((raw[0] || 0) * 64);
  if (messageOffset < raw.length && (raw[messageOffset] & 0x80) !== 0) {
    return VersionedTransaction.deserialize(raw);
  }
  return Transaction.from(raw);
}

export function serializeSignedSanctumTransaction(transaction) {
  if (transaction instanceof VersionedTransaction) {
    return Buffer.from(transaction.serialize()).toString('base64');
  }
  return Buffer.from(transaction.serialize({ requireAllSignatures: true, verifySignatures: true })).toString('base64');
}

export function formatTokenAtomics(value, decimals = 9, maximumFractionDigits = 6) {
  const text = String(value || '0');
  if (!/^\d+$/.test(text)) return '0';
  const padded = text.padStart(decimals + 1, '0');
  const whole = padded.slice(0, -decimals);
  const fraction = padded.slice(-decimals).replace(/0+$/, '').slice(0, maximumFractionDigits);
  return fraction ? `${whole}.${fraction}` : whole;
}

export function getClashSolStatus({ signal } = {}) {
  return apiJson('/api/sanctum/clashsol/status', { signal });
}

export function getClashSolBalances({ wallet, token, signal } = {}) {
  const params = new URLSearchParams({ wallet: String(wallet || '') });
  return apiJson(`/api/sanctum/clashsol/balances?${params}`, { token, signal });
}

export function createClashSolOrder({ wallet, amount, amountSol, direction = 'stake', slippageBps = 30, token, signal }) {
  return apiJson('/api/sanctum/clashsol/orders', {
    method: 'POST',
    token,
    signal,
    body: { wallet, amount: amount ?? amountSol, direction, slippageBps },
  });
}

export function executeClashSolOrder({ orderId, signedTransaction, token, signal }) {
  return apiJson(`/api/sanctum/clashsol/orders/${encodeURIComponent(orderId)}/execute`, {
    method: 'POST',
    token,
    signal,
    body: { signedTransaction },
  });
}

export function getClashSolOrderStatus({ orderId, token, refresh = true, signal }) {
  if (!orderId) throw new Error('A Sanctum order ID is required');
  const params = new URLSearchParams({ refresh: refresh ? '1' : '0' });
  return apiJson(`/api/sanctum/clashsol/orders/${encodeURIComponent(orderId)}?${params}`, {
    token,
    signal,
  });
}

export function getClashSolActiveOrder({ token, signal } = {}) {
  return apiJson('/api/sanctum/clashsol/orders/active', { token, signal });
}

export async function stakeSolForClashSol({ wallet, amountSol, slippageBps = 30, token, onOrder }) {
  const walletAddress = wallet?.publicKey?.toBase58?.() || String(wallet?.publicKey || '');
  if (!walletAddress || typeof wallet?.signTransaction !== 'function') {
    throw new Error('Connect a Solana wallet that supports transaction signing');
  }
  const order = await createClashSolOrder({ wallet: walletAddress, amountSol, slippageBps, token });
  onOrder?.(order);
  const unsigned = decodeSanctumTransaction(order.transaction);
  const signed = await wallet.signTransaction(unsigned);
  const signedTransaction = serializeSignedSanctumTransaction(signed);
  const result = await executeClashSolOrder({ orderId: order.orderId, signedTransaction, token });
  return { ...result, order };
}

export function getClashSolRewardStatus({ wallet, token, signal } = {}) {
  const query = wallet ? `?wallet=${encodeURIComponent(wallet)}` : '';
  return apiJson(`/api/sanctum/clashsol/rewards/status${query}`, { token, signal });
}

export function getClashSolHistory({ limit = 50, cursor, token, signal } = {}) {
  const params = new URLSearchParams({ limit: String(limit) });
  if (cursor != null) params.set('cursor', String(cursor));
  return apiJson(`/api/sanctum/clashsol/history?${params}`, { token, signal });
}

export function linkClashSolRewardWallet({ wallet, authProof, token, signal }) {
  return apiJson('/api/sanctum/clashsol/rewards/link-wallet', {
    method: 'POST',
    token,
    signal,
    body: { wallet, auth_proof: authProof },
  });
}

export function claimClashSolGold({ wallet, token, signal }) {
  return apiJson('/api/sanctum/clashsol/rewards/claim', {
    method: 'POST',
    token,
    signal,
    body: { wallet },
  });
}

function signatureToBase64(signature) {
  if (typeof signature === 'string') return { signature, signatureEncoding: '' };
  const bytes = signature?.signature || signature;
  return {
    signature: Buffer.from(bytes || []).toString('base64'),
    signatureEncoding: 'base64',
  };
}

export function clashSolWalletAuthMessage({ wallet, issuedAt }) {
  return [
    'Clash wallet auth',
    'Action: wallet-auth',
    `Wallet: ${String(wallet || '').trim()}`,
    'DEX: sanctum',
    `Issued At: ${issuedAt}`,
  ].join('\n');
}

export async function createClashSolWalletAuthProof({ wallet, signMessage }) {
  if (!wallet || typeof signMessage !== 'function') {
    throw new Error('Connect a Solana wallet that supports message signing');
  }
  const issuedAt = new Date().toISOString();
  const message = clashSolWalletAuthMessage({ wallet, issuedAt });
  const signed = await signMessage(new TextEncoder().encode(message));
  const normalized = signatureToBase64(signed);
  if (!normalized.signature) throw new Error('Wallet did not return a signature');
  return {
    action: 'wallet-auth',
    chain_type: 'solana',
    wallet,
    dex: 'sanctum',
    issued_at: issuedAt,
    message,
    signature: normalized.signature,
    signature_encoding: normalized.signatureEncoding,
  };
}
