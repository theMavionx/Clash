// Perpl Foundation client — REST (read-only) + Trading WebSocket (orders).
//
// Perpl auth model in one breath: SIWE login binds the wallet to a JWT
// cookie + a session nonce. Every later REST call sends `X-Auth-Nonce` +
// the cookie; the trading WS opens with mt:4 (AuthSignIn) carrying the
// same nonce. From that point, orders are authorized by a strictly-
// monotonic per-session `rq` (request id) — there is NO per-trade wallet
// signature to sign.
//
// Phase 1 ships:
//   - SIWE login helper (loginWithEoa) — fetches the SIWE payload, asks the
//     wallet to personal_sign it, exchanges for a session nonce.
//   - REST GET helper that injects X-Auth-Nonce + sends cookies.
//   - Public /pub/context fetch (no auth).
//   - Trading WS connection wrapper — auths on open, exposes a typed
//     `send(envelope)` and a `subscribe(handler)` for incoming frames.
//   - Order-id sequencer (`mintRq`) seeded from WalletSnapshot.lfr.
//
// Deliberately NOT in phase 1:
//   - Account creation flow (USDC→AUSD swap + on-chain createAccount).
//     That's a multi-step on-chain pipeline — better to land it once we
//     have the read path proven first.
//   - Order placement helpers. The hook will compose mt:22 envelopes
//     directly using PERPL_ORDER_TYPE / PERPL_TIF — keeping the client
//     dumb until we know the patterns we need.

import {
  PERPL_API_BASE,
  PERPL_WS_TRADING,
  PERPL_MT,
} from './monadConfig';

export const PERPL_REGION_BLOCKED_MESSAGE = 'Perpl is not available in your country or IP region.';

function throwRegionBlocked() {
  const e = new Error(PERPL_REGION_BLOCKED_MESSAGE);
  e.code = 'PERPL_REGION_BLOCKED';
  throw e;
}

// ───── Session state ─────────────────────────────────────────────────────
// Module-singleton because the JWT cookie is browser-global anyway, and
// we want the hook to share a single auth handshake across re-mounts.
let _authNonce = null;
let _authedAddress = null;

export function getAuthNonce() { return _authNonce; }
export function getAuthedAddress() { return _authedAddress; }
export function isPerplAuthed() { return !!_authNonce; }

// ───── REST helpers ──────────────────────────────────────────────────────
// All authed requests need the cookie (credentials:'include') and the
// X-Auth-Nonce header. We never throw on non-OK by default — the caller
// gets `{ ok, status, data }` so it can branch on 418 (whitelist gate)
// vs. 401 (re-login) without try/catch dance.
async function perplFetch(path, { method = 'GET', body, authed = false, credentials = null } = {}) {
  const headers = { 'Content-Type': 'application/json' };
  if (authed && _authNonce) headers['X-Auth-Nonce'] = _authNonce;
  let res;
  try {
    res = await fetch(`${PERPL_API_BASE}${path}`, {
      method,
      headers,
      credentials: credentials || (authed ? 'include' : 'omit'),
      body: body ? JSON.stringify(body) : undefined,
    });
  } catch (e) {
    return { ok: false, status: 0, error: e?.message || 'network error' };
  }
  let data = null;
  const text = await res.text();
  try { data = text ? JSON.parse(text) : null; } catch { data = text; }
  return { ok: res.ok, status: res.status, data };
}

// Public read — no auth, no cookies. Returns the parsed JSON or null on
// failure. Caller can pull markets, fees, leverage caps, gas stats from here.
export async function fetchPerplContext() {
  const r = await perplFetch('/pub/context');
  if (!r.ok) {
    console.warn('[perpl] /pub/context failed', r.status, r.error);
    return null;
  }
  if (!r.data || typeof r.data !== 'object' || !Array.isArray(r.data.markets)) {
    console.warn('[perpl] /pub/context returned non-context payload', typeof r.data);
    return null;
  }
  return r.data;
}

// ───── SIWE login ────────────────────────────────────────────────────────
// signMessageAsync: (msg: string) => Promise<string>  (hex-encoded sig)
// Wallet adapter must produce a personal_sign-style EIP-191 signature —
// most viem walletClients' `signMessage({ message })` does this directly.
export async function loginWithEoa({ chainId, address, signMessageAsync }) {
  if (!address) throw new Error('Missing wallet address for Perpl login');
  // 1. Fetch the SIWE payload Perpl expects us to sign.
  const payloadRes = await perplFetch('/auth/payload', {
    method: 'POST',
    body: { chain_id: chainId, address },
  });
  if (!payloadRes.ok) {
    if (payloadRes.status === 451) throwRegionBlocked();
    throw new Error(`Perpl /auth/payload ${payloadRes.status}: ${payloadRes.data?.error || payloadRes.error}`);
  }
  const payload = payloadRes.data || {};
  const msg = payload.msg || payload.message;
  const payloadNonce = payload.nonce;
  const mac = payload.mac;
  const issuedAt = payload.t ?? payload.issued_at;
  if (!msg) throw new Error('Perpl /auth/payload returned no message');

  // 2. Wallet personal_signs the SIWE message.
  const signature = await signMessageAsync(msg);

  // 3. Exchange signature for session nonce + JWT cookie.
  const connectRes = await perplFetch('/auth/connect', {
    method: 'POST',
    credentials: 'include',
    body: {
      chain_id: chainId,
      address,
      message: msg,
      signature,
      nonce: payloadNonce,
      mac,
      t: issuedAt,
      issued_at: issuedAt,
    },
  });
  if (!connectRes.ok) {
    if (connectRes.status === 451) throwRegionBlocked();
    // 418 = wallet not in Perpl's access list. Surface explicitly so the UI
    // can show "request access at perpl.xyz" instead of a generic error.
    if (connectRes.status === 418) {
      const e = new Error('Perpl access not granted for this wallet');
      e.code = 'PERPL_NOT_WHITELISTED';
      throw e;
    }
    throw new Error(`Perpl /auth/connect ${connectRes.status}: ${connectRes.data?.error || ''}`);
  }
  _authNonce = connectRes.data?.nonce || null;
  _authedAddress = address;
  if (!_authNonce) throw new Error('Perpl /auth/connect returned no nonce');
  return { nonce: _authNonce, address };
}

export function clearPerplSession() {
  _authNonce = null;
  _authedAddress = null;
}

// ───── Authed REST reads ─────────────────────────────────────────────────
// Each helper assumes loginWithEoa has run. They return parsed bodies on
// success, null on failure, and never throw — the hook treats null as
// "data not yet available" and re-polls.
export async function fetchPerplProfile() {
  const r = await perplFetch('/profile/ref-code', { authed: true });
  return r.ok ? r.data : null;
}

export async function fetchPerplFills({ limit = 50 } = {}) {
  const r = await perplFetch(`/trading/fills?count=${encodeURIComponent(limit)}`, { authed: true });
  return r.ok ? r.data : null;
}

export async function fetchPerplOrderHistory({ limit = 50 } = {}) {
  const r = await perplFetch(`/trading/order-history?count=${encodeURIComponent(limit)}`, { authed: true });
  return r.ok ? r.data : null;
}

export async function fetchPerplPositionHistory({ limit = 50 } = {}) {
  const r = await perplFetch(`/trading/position-history?count=${encodeURIComponent(limit)}`, { authed: true });
  return r.ok ? r.data : null;
}

// ───── Trading WebSocket ─────────────────────────────────────────────────
// Opens a connection, auths with the cached session nonce, then forwards
// every server frame to the registered handler. Reconnects on close (the
// caller can hard-shutdown via close()). Heartbeat (mt:1) every 30s; if we
// miss two server heartbeats in a row we drop the socket and reconnect.
//
// Returns:
//   { send(envelope), close(), onMessage(handler), getReadyState(), getRq() }
//
// `getRq()` returns the next monotonic order-id for mt:22 envelopes. Seed
// it explicitly via setRqSeed(lfr) once WalletSnapshot mt:21 lands.
export function createPerplTradingSocket({ chainId, sessionId, onOpen, onClose }) {
  if (!_authNonce) throw new Error('Perpl trading WS: no session nonce — log in first');

  let ws = null;
  let handler = null;
  let pingTimer = null;
  let reconnectTimer = null;
  let closed = false;
  let rqCounter = 0;
  let lastSeenSeq = null;

  const session = sessionId || `${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;

  function connect() {
    if (closed) return;
    ws = new WebSocket(PERPL_WS_TRADING);
    ws.onopen = () => {
      // mt:4 AuthSignIn — chain_id + nonce + ses (client session id we make up).
      ws.send(JSON.stringify({ mt: PERPL_MT.AUTH, chain_id: chainId, nonce: _authNonce, ses: session }));
      // 30s app-level ping. The server-side heartbeat is mt:100 (incoming);
      // we send mt:1 to keep the connection alive on the way out.
      pingTimer = setInterval(() => {
        try { ws.send(JSON.stringify({ mt: PERPL_MT.PING })); } catch {}
      }, 30_000);
      try { onOpen?.(); } catch {}
    };
    ws.onmessage = (ev) => {
      let frame;
      try { frame = JSON.parse(ev.data); } catch { return; }
      // Server heartbeats include a sequence number — gap means we missed
      // frames and should reconnect to resync state. Don't trust local cache.
      const seq = Number(frame?.sn ?? frame?.seq);
      if (frame?.mt === PERPL_MT.HEARTBEAT && Number.isFinite(seq)) {
        if (lastSeenSeq != null && seq !== lastSeenSeq + 1) {
          console.warn('[perpl] WS heartbeat seq gap', lastSeenSeq, '→', seq, '— reconnecting');
          try { ws.close(); } catch {}
          return;
        }
        lastSeenSeq = seq;
      }
      try { handler?.(frame); } catch (e) {
        console.warn('[perpl] WS handler threw', e?.message || e);
      }
    };
    ws.onclose = (ev) => {
      clearInterval(pingTimer);
      pingTimer = null;
      try { onClose?.(ev); } catch {}
      // 3401 = "session invalid, please re-auth". Clear the nonce so a
      // fresh login is forced upstream rather than spinning on a dead session.
      if (ev.code === 3401) {
        clearPerplSession();
        return;
      }
      if (closed) return;
      // Plain reconnect with a brief backoff — the auth handshake is cheap.
      reconnectTimer = setTimeout(connect, 2_000);
    };
    ws.onerror = (e) => {
      // Errors are followed by close; don't reconnect from here, let onclose
      // handle it. Just log so we have a breadcrumb.
      console.warn('[perpl] WS error', e?.message || e);
    };
  }

  connect();

  return {
    send(envelope) {
      if (ws?.readyState !== WebSocket.OPEN) {
        throw new Error('Perpl WS not open');
      }
      ws.send(JSON.stringify(envelope));
    },
    onMessage(fn) { handler = fn; },
    setRqSeed(lfr) { rqCounter = Math.max(rqCounter, Number(lfr) || 0); },
    nextRq() { return ++rqCounter; },
    close() {
      closed = true;
      clearInterval(pingTimer);
      clearTimeout(reconnectTimer);
      try { ws?.close(); } catch {}
      ws = null;
    },
    getReadyState() { return ws?.readyState ?? WebSocket.CLOSED; },
  };
}
