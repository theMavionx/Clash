/**
 * Pacifica agent bind — same flow as Futures/usePacificaAgent, callable from Bots.
 */
import bs58 from 'bs58';
import { ed25519 } from '@noble/curves/ed25519';
import { pacificaNow } from './pacificaTime';
import { pacificaRequest } from './pacificaClient';
import { persistPacificaAgent } from './pacificaAgentStorage';

const PACIFICA_SIGN_EXPIRY_WINDOW_MS = 30_000;

function sortKeys(v) {
  if (Array.isArray(v)) return v.map(sortKeys);
  if (v && typeof v === 'object') {
    return Object.keys(v).sort().reduce((acc, k) => { acc[k] = sortKeys(v[k]); return acc; }, {});
  }
  return v;
}

function buildMessage(type, payload, timestamp = pacificaNow()) {
  const header = { type, timestamp, expiry_window: PACIFICA_SIGN_EXPIRY_WINDOW_MS };
  return JSON.stringify(sortKeys({ ...header, data: payload }));
}

function generateAgentKeypair() {
  const secret = ed25519.utils.randomPrivateKey();
  const pubkey = ed25519.getPublicKey(secret);
  return { secret, pubkey };
}

/**
 * One-time master-wallet signature → bind agent on Pacifica + persist locally.
 * @param {{ walletAddr: string, masterSign: (msg: Uint8Array) => Promise<Uint8Array> }} opts
 */
export async function bindPacificaAgent({ walletAddr, masterSign }) {
  if (!walletAddr || !masterSign) {
    throw new Error('Solana wallet not connected');
  }

  const { secret, pubkey } = generateAgentKeypair();
  const agentPubkeyB58 = bs58.encode(pubkey);
  const timestamp = pacificaNow();
  const message = buildMessage('bind_agent_wallet', { agent_wallet: agentPubkeyB58 }, timestamp);
  const msgBytes = new TextEncoder().encode(message);
  const sigBytes = await masterSign(msgBytes);
  if (!sigBytes?.length) throw new Error('No signature returned');
  const signature = bs58.encode(sigBytes);

  const body = {
    account: walletAddr,
    agent_wallet: agentPubkeyB58,
    signature,
    timestamp,
    expiry_window: PACIFICA_SIGN_EXPIRY_WINDOW_MS,
  };

  const result = await pacificaRequest('/agent/bind', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(body),
  });
  const { response: res, text } = result;
  const data = result.data && typeof result.data === 'object' ? result.data : null;
  if (!res.ok || data?.error) {
    throw new Error(data?.error || data?.message || text || 'Pacifica agent bind failed');
  }

  const createdAt = Date.now();
  persistPacificaAgent(walletAddr, {
    agentSecretB58: bs58.encode(secret),
    agentPubkey: agentPubkeyB58,
    createdAt,
  });

  try {
    const token = window._playerToken;
    if (token) {
      fetch('/api/pacifica/agent', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', 'x-token': token },
        body: JSON.stringify(body),
      }).catch(() => {});
    }
  } catch { /* non-fatal */ }

  return { agentPubkey: agentPubkeyB58, createdAt };
}
