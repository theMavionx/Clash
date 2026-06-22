// Pacifica agent-wallet (a.k.a. API agent key) integration.
//
// One-time master-wallet signature binds an ephemeral keypair as an "agent
// wallet" on Pacifica. All subsequent trade-related signed requests can
// then be signed with the AGENT KEY directly, with no popup, until the
// user revokes the agent or it expires (we choose a self-imposed expiry).
//
// Format derived from the official SDK:
//   https://github.com/pacifica-fi/python-sdk/blob/main/rest/api_agent_keys.py
//   https://github.com/pacifica-fi/python-sdk/blob/main/rest/api_agent_keys_detailed.py
//
// Bind request (signed by master):
//   POST /agent/bind
//   header  = { type: "bind_agent_wallet", timestamp, expiry_window: 30000 }
//   payload = { agent_wallet: <agent_pubkey_base58> }
//   body    = {
//     account: <master_pubkey>, agent_wallet: <agent_pubkey>,
//     signature: <master_signature_base58>, timestamp, expiry_window
//   }
//
// Subsequent trades (signed by agent):
//   header  = { type: "create_market_order", timestamp, expiry_window: 30000 }
//   payload = { ...trade fields }
//   body    = {
//     account: <master_pubkey>, agent_wallet: <agent_pubkey>,
//     signature: <agent_signature_base58>, timestamp, expiry_window,
//     ...payload
//   }

import { useCallback, useEffect, useRef, useState } from 'react';
import bs58 from 'bs58';
import { ed25519 } from '@noble/curves/ed25519';
// Share the clock-skew compensation with usePacifica.js so agent-signed
// timestamps stay aligned with master-signed ones. Lives in lib/ rather than
// usePacifica to avoid a circular import.
import { pacificaNow } from '../lib/pacificaTime';
import { reportDiag } from '../lib/diagReporter';
import {
  decodeAgentSecret,
  forgetPacificaAgent,
  readPacificaAgent,
} from '../lib/pacificaAgentStorage';
import { bindPacificaAgent as bindPacificaAgentCore } from '../lib/pacificaBind';

const API = 'https://api.pacifica.fi/api/v1';
const PACIFICA_SIGN_EXPIRY_WINDOW_MS = 30_000;

function buildMessage(type, payload, timestamp = pacificaNow()) {
  // Same canonical shape Pacifica uses everywhere: sorted keys, compact
  // JSON, header-fields plus `data: payload`. Default timestamp goes through
  // pacificaNow() so the offset captured from `Date` headers in usePacifica
  // is applied here too.
  const header = { type, timestamp, expiry_window: PACIFICA_SIGN_EXPIRY_WINDOW_MS };
  return JSON.stringify(sortKeys({ ...header, data: payload }));
}

function sortKeys(v) {
  if (Array.isArray(v)) return v.map(sortKeys);
  if (v && typeof v === 'object') {
    return Object.keys(v).sort().reduce((acc, k) => { acc[k] = sortKeys(v[k]); return acc; }, {});
  }
  return v;
}

// Sign a JSON message with the agent's secret key. Solana Ed25519: secret
// is the 32-byte private scalar. nacl-style "secretKey" is 64 bytes (priv
// + pub); for noble we pass just the 32-byte priv portion.
function signWithAgent(secretKey32, messageStr) {
  const msgBytes = new TextEncoder().encode(messageStr);
  const sig = ed25519.sign(msgBytes, secretKey32);
  return bs58.encode(sig);
}

function generateAgentKeypair() {
  // Random 32-byte secret. Pubkey derived from it.
  const secret = ed25519.utils.randomPrivateKey();
  const pubkey = ed25519.getPublicKey(secret);
  return { secret, pubkey };
}

export function usePacificaAgent({ walletAddr, masterSign }) {
  // `masterSign` is a function (msgBytes: Uint8Array) => Uint8Array — the
  // master wallet's signMessage path. Caller (usePacifica) wires this up
  // with the existing wallet-adapter / Privy / FC code.

  const [agent, setAgent] = useState(null); // { agentPubkey, signRequest } or null
  const [binding, setBinding] = useState(false);
  const [bindError, setBindError] = useState(null);
  const agentRef = useRef(null);

  // Restore from browser storage on mount / wallet change.
  useEffect(() => {
    if (!walletAddr) {
      setAgent(null);
      agentRef.current = null;
      return;
    }
    let cancelled = false;
    readPacificaAgent(walletAddr).then((restored) => {
      if (cancelled || !restored) return;
      const secret = decodeAgentSecret(restored.privateKey);
      const next = {
        agentPubkey: restored.agentPubkey,
        createdAt: restored.createdAt || Date.now(),
        secret,
      };
      agentRef.current = next;
      setAgent({ agentPubkey: next.agentPubkey, createdAt: next.createdAt });
    }).catch(() => {});
    return () => { cancelled = true; };
  }, [walletAddr]);

  // Bind a fresh agent. ONE master-wallet signature.
  const bindAgent = useCallback(async () => {
    if (!walletAddr || !masterSign) throw new Error('Master wallet unavailable');
    if (binding) return null;
    setBinding(true);
    setBindError(null);
    try {
      const result = await bindPacificaAgentCore({
        walletAddr,
        masterSign: async (msgBytes) => masterSign(msgBytes),
      });
      const restored = await readPacificaAgent(walletAddr);
      if (restored?.privateKey) {
        const secret = decodeAgentSecret(restored.privateKey);
        agentRef.current = {
          agentPubkey: restored.agentPubkey,
          createdAt: restored.createdAt || Date.now(),
          secret,
        };
        setAgent({ agentPubkey: restored.agentPubkey, createdAt: restored.createdAt });
      }
      return result;
    } catch (e) {
      setBindError(e?.message || String(e));
      throw e;
    } finally {
      setBinding(false);
    }
  }, [walletAddr, masterSign, binding]);

  // Sign a request with the agent key (no wallet popup). Returns the same
  // {message, signature, body} shape that usePacifica's signedRequest uses
  // so the caller just builds the body and POSTs.
  const signWithAgentKey = useCallback((type, payload) => {
    const cur = agentRef.current;
    if (!cur || !walletAddr) return null;
    const timestamp = pacificaNow();
    const message = buildMessage(type, payload, timestamp);
    const signature = signWithAgent(cur.secret, message);
    return {
      account: walletAddr,
      agent_wallet: cur.agentPubkey,
      signature,
      timestamp,
      expiry_window: PACIFICA_SIGN_EXPIRY_WINDOW_MS,
    };
  }, [walletAddr]);

  // Local revoke — just deletes the stored key. Server-side revoke would
  // be `POST /agent/revoke {agent_wallet}` signed by master; included in
  // a separate call so the UI can offer "revoke from server" in addition
  // to "forget locally".
  const forgetLocally = useCallback(() => {
    if (walletAddr) forgetPacificaAgent(walletAddr);
    agentRef.current = null;
    setAgent(null);
  }, [walletAddr]);

  const revokeOnServer = useCallback(async () => {
    if (!walletAddr || !masterSign) return false;
    const cur = agentRef.current;
    if (!cur) { forgetLocally(); return true; }
    try {
      const timestamp = pacificaNow();
      const message = buildMessage(
        'revoke_agent_wallet',
        { agent_wallet: cur.agentPubkey },
        timestamp,
      );
      const msgBytes = new TextEncoder().encode(message);
      const sigBytes = await masterSign(msgBytes);
      if (!sigBytes) throw new Error('No signature');
      const body = {
        account: walletAddr,
        agent_wallet: cur.agentPubkey,
        signature: bs58.encode(sigBytes),
        timestamp,
        expiry_window: PACIFICA_SIGN_EXPIRY_WINDOW_MS,
      };
      await fetch(`${API}/agent/revoke`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(body),
      });
    } catch { /* best-effort — local forget still matters */ }
    forgetLocally();
    return true;
  }, [walletAddr, masterSign, forgetLocally]);

  return {
    // Public state
    agent,                 // { agentPubkey, createdAt } | null
    binding,
    bindError,
    isAgentActive: !!agent,
    // Actions
    bindAgent,             // master pops up ONCE, persists agent
    signWithAgentKey,      // returns a header-bag for signed requests
    forgetLocally,         // wipe local secret (no server call)
    revokeOnServer,        // master pops up to revoke on Pacifica side
  };
}
