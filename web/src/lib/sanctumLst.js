import { Buffer } from 'buffer';
import { Transaction, VersionedTransaction } from '@solana/web3.js';

export const CLASHSOL_SYMBOL = 'clashSOL';

function sessionToken(explicitToken) {
  return explicitToken || (typeof window !== 'undefined' ? window._playerToken : null) || '';
}

async function apiJson(url, { method = 'GET', token, body, signal } = {}) {
  const response = await fetch(url, {
    method,
    signal,
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
    throw error;
  }
  return payload;
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

export function createClashSolOrder({ wallet, amountSol, slippageBps = 30, token, signal }) {
  return apiJson('/api/sanctum/clashsol/orders', {
    method: 'POST',
    token,
    signal,
    body: { wallet, amountSol, slippageBps },
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
