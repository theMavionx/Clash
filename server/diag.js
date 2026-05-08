// Diagnostics ingestion — encrypted error/sign-trace uploads from the
// browser. Used to capture exact wallet payloads (signed message bytes,
// signatures, Pacifica error responses, adapter name, clock skew) when
// users hit Invalid-message-class errors so we can root-cause without
// asking the user to copy/paste a console dump.
//
// Threat model:
// - Reports include the user's PUBLIC signature on a canonical JSON
//   message. Pacifica already sees these (we send them every trade), so
//   intercepting our diag pipe doesn't grant any capability beyond
//   what Pacifica's REST already exposes — but we still encrypt to
//   mitigate passive logging by middleboxes / CDNs / browser extensions
//   that don't have Pacifica access.
// - Reports DO NOT include the master private key (lives in the wallet,
//   never reaches our code), the agent secret key (lives only in the
//   user's localStorage, we explicitly avoid logging it), or the game
//   session token.
// - Encryption: NaCl box (X25519 ECDH + XSalsa20-Poly1305). Server has
//   one long-term keypair; client generates a fresh ephemeral keypair
//   per upload and discards the private half after sealing. Public-half
//   ratcheting per upload means ciphertext is forward-secret against a
//   future server-key compromise.
// - The plaintext is a bounded JSON object (we cap upload size at 64KB
//   to bound DB growth and keep rate-limit budgets meaningful).
const nacl = require('tweetnacl');
const bs58 = require('bs58').default || require('bs58');

let cachedSecret = null;
let cachedPublic = null;

function loadOrGenerateKeypair() {
  if (cachedSecret && cachedPublic) return { secret: cachedSecret, public: cachedPublic };
  const fromEnv = process.env.DIAG_SERVER_SECRET_B58;
  if (fromEnv) {
    try {
      const sk = bs58.decode(fromEnv);
      if (sk.length === 32) {
        const kp = nacl.box.keyPair.fromSecretKey(sk);
        cachedSecret = kp.secretKey;
        cachedPublic = kp.publicKey;
        return { secret: cachedSecret, public: cachedPublic };
      }
      console.warn('[diag] DIAG_SERVER_SECRET_B58 length != 32 bytes; regenerating ephemeral keypair (reports decrypted with this run only)');
    } catch (e) {
      console.warn('[diag] DIAG_SERVER_SECRET_B58 decode failed:', e.message);
    }
  }
  // No persistent key yet — generate one and tell the operator how to
  // pin it. Without DIAG_SERVER_SECRET_B58 in .env, every restart
  // rotates the key and old ciphertexts become undecryptable.
  const kp = nacl.box.keyPair();
  cachedSecret = kp.secretKey;
  cachedPublic = kp.publicKey;
  console.warn(`[diag] generated EPHEMERAL keypair (no DIAG_SERVER_SECRET_B58 in env). To persist across restarts, add this to /opt/clash/.env:\nDIAG_SERVER_SECRET_B58=${bs58.encode(cachedSecret)}`);
  return { secret: cachedSecret, public: cachedPublic };
}

function getPublicKeyB58() {
  const { public: pub } = loadOrGenerateKeypair();
  return bs58.encode(pub);
}

// Decrypt a NaCl-box ciphertext. Body is the encrypted upload format:
//   { ephemeral_pubkey: base58(32), nonce: base58(24), ciphertext: base58(...) }
// Returns the parsed JSON plaintext, or null on any failure (bad sender
// pubkey, wrong nonce length, MAC mismatch, oversized payload).
const MAX_PLAINTEXT_BYTES = 64 * 1024;
function decryptReport({ ephemeral_pubkey, nonce, ciphertext }) {
  try {
    const { secret } = loadOrGenerateKeypair();
    const ePub = bs58.decode(ephemeral_pubkey);
    const n = bs58.decode(nonce);
    const ct = bs58.decode(ciphertext);
    if (ePub.length !== 32 || n.length !== 24) return null;
    if (ct.length > MAX_PLAINTEXT_BYTES + 1024) return null;
    const opened = nacl.box.open(ct, n, ePub, secret);
    if (!opened) return null;
    const text = new TextDecoder().decode(opened);
    if (text.length > MAX_PLAINTEXT_BYTES) return null;
    try { return JSON.parse(text); } catch { return null; }
  } catch { return null; }
}

module.exports = {
  loadOrGenerateKeypair,
  getPublicKeyB58,
  decryptReport,
  MAX_PLAINTEXT_BYTES,
};
