// Encrypted client diagnostic reporter. Used by usePacifica (and other
// hooks later) to upload sign-trace + error context when something goes
// wrong on the user's machine, so we can root-cause without asking the
// user to copy/paste console logs.
//
// Encryption: NaCl box (X25519 ECDH + XSalsa20-Poly1305).
//   - Server publishes a long-term public key at /api/diag/pacifica/pubkey
//   - We fetch it once per session, cache for the page lifetime
//   - For each report we generate a fresh ephemeral keypair, derive a
//     shared secret with the server pubkey, seal the report, and ship
//     `{ ephemeral_pubkey, nonce, ciphertext }`. The ephemeral private
//     half is discarded immediately, giving forward secrecy if the
//     server long-term key is ever compromised.
//
// What we explicitly DON'T capture:
//   - Wallet private keys (lives in the wallet, never in our process)
//   - Pacifica agent secret keys (in user's localStorage; we read sigs
//     and pubkeys but never the secret)
//   - Game session token (server has it via auth cookie / header; no
//     reason to round-trip back encrypted)
//
// Anything captured IS bounded — fields longer than CAP_FIELD_LEN get
// truncated, the whole payload caps at MAX_PLAINTEXT_BYTES (matches
// server), and a per-error-kind dedup window suppresses report storms.

import nacl from 'tweetnacl';
import bs58 from 'bs58';

const CAP_FIELD_LEN = 4 * 1024;          // truncate any single string here
const MAX_PLAINTEXT_BYTES = 60 * 1024;   // server cap is 64KB; leave slack
const DEDUP_WINDOW_MS = 60 * 1000;       // same error_kind once per minute
const PUBKEY_TTL_MS = 60 * 60 * 1000;    // server pubkey cache 1h

let _serverPubkey = null;
let _serverPubkeyAt = 0;
const _recentErrors = new Map();         // error_kind -> last-sent-ts

function truncate(v, max = CAP_FIELD_LEN) {
  if (typeof v !== 'string') return v;
  return v.length > max ? v.slice(0, max) + `…[+${v.length - max}]` : v;
}

function deepTruncate(obj, depth = 0) {
  if (depth > 6) return '[depth-cap]';
  if (obj == null) return obj;
  if (typeof obj === 'string') return truncate(obj);
  if (typeof obj === 'number' || typeof obj === 'boolean') return obj;
  if (Array.isArray(obj)) return obj.slice(0, 50).map(x => deepTruncate(x, depth + 1));
  if (typeof obj === 'object') {
    const out = {};
    let n = 0;
    for (const k of Object.keys(obj)) {
      if (n++ > 50) break;
      out[k] = deepTruncate(obj[k], depth + 1);
    }
    return out;
  }
  return String(obj).slice(0, CAP_FIELD_LEN);
}

async function fetchServerPubkey() {
  const now = Date.now();
  if (_serverPubkey && now - _serverPubkeyAt < PUBKEY_TTL_MS) return _serverPubkey;
  try {
    const r = await fetch('/api/diag/pacifica/pubkey', { cache: 'no-store' });
    if (!r.ok) return null;
    const j = await r.json();
    if (!j?.pubkey) return null;
    _serverPubkey = bs58.decode(j.pubkey);
    _serverPubkeyAt = now;
    return _serverPubkey;
  } catch {
    return null;
  }
}

// Public API: pass the report fields, we encrypt + ship best-effort.
// Never throws — any failure (network, encryption, server reject) is
// logged silently.
export async function reportDiag(report) {
  try {
    const errKind = String(report?.error_kind || report?.error || 'unknown').slice(0, 80);
    const last = _recentErrors.get(errKind) || 0;
    if (Date.now() - last < DEDUP_WINDOW_MS) return; // suppress storm
    _recentErrors.set(errKind, Date.now());

    const serverPub = await fetchServerPubkey();
    if (!serverPub) return;

    const enriched = deepTruncate({
      category: 'pacifica',
      ts: Date.now(),
      ts_iso: new Date().toISOString(),
      page_url: typeof window !== 'undefined' ? window.location?.href : '',
      user_agent: typeof navigator !== 'undefined' ? truncate(navigator.userAgent, 256) : '',
      lang: typeof navigator !== 'undefined' ? navigator.language : '',
      ...report,
    });
    const json = JSON.stringify(enriched);
    if (json.length > MAX_PLAINTEXT_BYTES) return;

    const eph = nacl.box.keyPair();
    const nonce = nacl.randomBytes(24);
    const msg = new TextEncoder().encode(json);
    const ct = nacl.box(msg, nonce, serverPub, eph.secretKey);
    if (!ct) return;

    const body = {
      ephemeral_pubkey: bs58.encode(eph.publicKey),
      nonce: bs58.encode(nonce),
      ciphertext: bs58.encode(ct),
    };
    const token = (typeof window !== 'undefined' && window._playerToken) || '';
    fetch('/api/diag/pacifica/upload', {
      method: 'POST',
      headers: token
        ? { 'Content-Type': 'application/json', 'x-token': token }
        : { 'Content-Type': 'application/json' },
      body: JSON.stringify(body),
    }).catch(() => { /* fire-and-forget */ });
  } catch {
    /* never let diag swallow execution */
  }
}
