const crypto = require('crypto');
const nacl = require('tweetnacl');
const bs58Module = require('bs58');
const {
  PublicKey,
  Transaction,
  VersionedTransaction,
} = require('@solana/web3.js');

const bs58 = bs58Module.default || bs58Module;

const DEFAULT_API_BASE_URL = 'https://sanctum-api.ironforge.network';
const WRAPPED_SOL_MINT = 'So11111111111111111111111111111111111111112';
const DEFAULT_ORDER_TTL_MS = 90_000;
const DEFAULT_REQUEST_TIMEOUT_MS = 5_000;
const STATUS_CACHE_MS = 60_000;
const MIN_SOL_LAMPORTS = 1_000_000n; // 0.001 SOL
const MAX_SOL_LAMPORTS = 10_000_000_000_000n; // 10,000 SOL
const MAX_SIGNED_TX_BASE64_LENGTH = 12_000;
const VALID_SIGNATURE_RE = /^[1-9A-HJ-NP-Za-km-z]{80,90}$/;

class SanctumError extends Error {
  constructor(code, message, status = 400, details = null) {
    super(message);
    this.name = 'SanctumError';
    this.code = code;
    this.status = status;
    this.details = details;
  }
}

function normalizeApiBaseUrl(value) {
  const raw = String(value || DEFAULT_API_BASE_URL).trim().replace(/\/+$/, '');
  let url;
  try {
    url = new URL(raw);
  } catch {
    throw new SanctumError('CONFIG_INVALID', 'SANCTUM_API_BASE_URL is invalid', 503);
  }
  if (url.protocol !== 'https:' && !['localhost', '127.0.0.1'].includes(url.hostname)) {
    throw new SanctumError('CONFIG_INVALID', 'Sanctum API must use HTTPS', 503);
  }
  return url.toString().replace(/\/$/, '');
}

function normalizePublicKey(value, fieldName = 'wallet') {
  const raw = String(value || '').trim();
  try {
    return new PublicKey(raw).toBase58();
  } catch {
    throw new SanctumError('INVALID_WALLET', `${fieldName} is not a valid Solana address`, 400);
  }
}

function parseSolToLamports(value) {
  const text = String(value ?? '').trim();
  if (!/^(?:0|[1-9]\d*)(?:\.\d{1,9})?$/.test(text)) {
    throw new SanctumError('INVALID_AMOUNT', 'Enter a valid SOL amount with at most 9 decimals', 400);
  }
  const [whole, fraction = ''] = text.split('.');
  const lamports = (BigInt(whole) * 1_000_000_000n) + BigInt((fraction + '000000000').slice(0, 9));
  if (lamports < MIN_SOL_LAMPORTS) {
    throw new SanctumError('AMOUNT_TOO_SMALL', 'Minimum stake is 0.001 SOL', 400);
  }
  if (lamports > MAX_SOL_LAMPORTS) {
    throw new SanctumError('AMOUNT_TOO_LARGE', 'Maximum stake per order is 10,000 SOL', 400);
  }
  return lamports.toString();
}

function parseSlippageBps(value) {
  if (value === undefined || value === null || value === '') return 30;
  const parsed = Number(value);
  if (!Number.isInteger(parsed) || parsed < 1 || parsed > 500) {
    throw new SanctumError('INVALID_SLIPPAGE', 'Slippage must be between 1 and 500 bps', 400);
  }
  return parsed;
}

function decodeBase64Transaction(value, fieldName = 'transaction') {
  const text = String(value || '').trim();
  if (!text || text.length > MAX_SIGNED_TX_BASE64_LENGTH || !/^[A-Za-z0-9+/]+={0,2}$/.test(text)) {
    throw new SanctumError('INVALID_TRANSACTION', `${fieldName} is not valid base64`, 400);
  }
  const raw = Buffer.from(text, 'base64');
  if (!raw.length || raw.length > 8_000) {
    throw new SanctumError('INVALID_TRANSACTION', `${fieldName} has an invalid size`, 400);
  }
  return raw;
}

function isVersionedWireTransaction(raw) {
  if (!raw.length) return false;
  // The first byte is the compact-u16 signature count. Solana transactions are
  // capped well below 128 signers, so the message starts after 1 + 64*N bytes.
  const messageOffset = 1 + (raw[0] * 64);
  return messageOffset < raw.length && (raw[messageOffset] & 0x80) !== 0;
}

function inspectTransaction(base64, expectedWallet) {
  const raw = decodeBase64Transaction(base64);
  const wallet = normalizePublicKey(expectedWallet);
  if (isVersionedWireTransaction(raw)) {
    let tx;
    try {
      tx = VersionedTransaction.deserialize(raw);
    } catch {
      throw new SanctumError('INVALID_TRANSACTION', 'Sanctum returned an invalid versioned transaction', 502);
    }
    const requiredSignerCount = Number(tx.message.header.numRequiredSignatures || 0);
    const signerKeys = tx.message.staticAccountKeys.slice(0, requiredSignerCount).map(key => key.toBase58());
    const signerIndex = signerKeys.indexOf(wallet);
    if (signerIndex < 0) {
      throw new SanctumError('SIGNER_MISMATCH', 'The connected wallet is not a required transaction signer', 400);
    }
    const message = Buffer.from(tx.message.serialize());
    return { kind: 'versioned', tx, signerIndex, message, hash: crypto.createHash('sha256').update(message).digest('hex') };
  }

  let tx;
  try {
    tx = Transaction.from(raw);
  } catch {
    throw new SanctumError('INVALID_TRANSACTION', 'Sanctum returned an invalid legacy transaction', 502);
  }
  const signerIndex = tx.signatures.findIndex(entry => entry.publicKey.toBase58() === wallet);
  if (signerIndex < 0) {
    throw new SanctumError('SIGNER_MISMATCH', 'The connected wallet is not a required transaction signer', 400);
  }
  const message = Buffer.from(tx.serializeMessage());
  return { kind: 'legacy', tx, signerIndex, message, hash: crypto.createHash('sha256').update(message).digest('hex') };
}

function verifySignedTransaction(base64, expectedWallet, expectedKind, expectedHash) {
  const inspected = inspectTransaction(base64, expectedWallet);
  if (inspected.kind !== expectedKind || inspected.hash !== expectedHash) {
    throw new SanctumError('TRANSACTION_CHANGED', 'The signed transaction does not match the reviewed Sanctum order', 400);
  }
  const signature = inspected.kind === 'versioned'
    ? inspected.tx.signatures[inspected.signerIndex]
    : inspected.tx.signatures[inspected.signerIndex]?.signature;
  const publicKey = new PublicKey(expectedWallet).toBytes();
  if (!signature || signature.length !== nacl.sign.signatureLength || !nacl.sign.detached.verify(inspected.message, signature, publicKey)) {
    throw new SanctumError('INVALID_SIGNATURE', 'The connected wallet did not sign this Sanctum order', 400);
  }
  return inspected;
}

function safeLstMetadata(payload, configuredMint) {
  const candidates = Array.isArray(payload?.data)
    ? payload.data
    : Array.isArray(payload)
      ? payload
      : [payload?.lst || payload?.data || payload].filter(Boolean);
  const source = candidates.find(item => {
    const mint = String(item?.mint || item?.address || item?.tokenMint || '').trim();
    if (!mint) return false;
    try { return new PublicKey(mint).toBase58() === configuredMint; } catch { return false; }
  });
  if (!source) {
    throw new SanctumError('LST_NOT_DISCOVERABLE', 'clashSOL is not registered in Sanctum yet', 503);
  }
  const mint = normalizePublicKey(source.mint || source.address || source.tokenMint, 'Sanctum LST mint');
  if (mint !== configuredMint) {
    throw new SanctumError('UPSTREAM_MINT_MISMATCH', 'Sanctum returned metadata for a different LST', 502);
  }
  const decimals = Number(source.decimals);
  const poolProgram = String(source.pool?.program || '').trim();
  if (decimals !== 9 || !poolProgram) {
    throw new SanctumError('INVALID_LST_METADATA', 'Sanctum returned incomplete clashSOL pool metadata', 502);
  }
  const apyCandidate = source.latestApy ?? source.avgApy ?? source.apy ?? source.totalApy ?? source.apys?.total ?? null;
  const apy = Number.isFinite(Number(apyCandidate)) ? Number(apyCandidate) : null;
  return {
    mint: configuredMint,
    symbol: String(source.symbol || 'clashSOL').slice(0, 24),
    name: String(source.name || 'Clash Staked SOL').slice(0, 80),
    logoUri: typeof source.logoUri === 'string' ? source.logoUri.slice(0, 1_000) : null,
    decimals,
    poolProgram: poolProgram.slice(0, 40),
    apy,
  };
}

function extractApy(payload) {
  const source = payload?.apy || payload?.apys || payload?.data || payload || {};
  const candidates = [
    typeof source === 'number' ? source : null,
    source.total,
    source.totalApy,
    source.lstApy,
    source.apy,
    source.last7EpochApy,
    source.last_7_epoch_apy,
    source.annualPercentageYield,
  ];
  const value = candidates.map(Number).find(candidate => Number.isFinite(candidate) && candidate > 0);
  return value ?? null;
}

function safeJsonError(payload, fallback) {
  const candidate = payload?.message || payload?.error?.message || payload?.error || payload?.detail;
  return typeof candidate === 'string' && candidate.trim() ? candidate.trim().slice(0, 300) : fallback;
}

function createSanctumService({
  db,
  fetchImpl = globalThis.fetch,
  apiKey = process.env.SANCTUM_API_KEY,
  clashSolMint = process.env.CLASHSOL_MINT,
  apiBaseUrl = process.env.SANCTUM_API_BASE_URL || DEFAULT_API_BASE_URL,
  requestTimeoutMs = DEFAULT_REQUEST_TIMEOUT_MS,
  orderTtlMs = DEFAULT_ORDER_TTL_MS,
  now = () => Date.now(),
  randomUUID = () => crypto.randomUUID(),
} = {}) {
  if (!db?.prepare || typeof fetchImpl !== 'function') {
    throw new TypeError('createSanctumService requires a SQLite database and fetch implementation');
  }

  const normalizedApiKey = String(apiKey || '').trim();
  let normalizedMint = '';
  let configError = null;
  try {
    normalizedMint = clashSolMint ? normalizePublicKey(clashSolMint, 'CLASHSOL_MINT') : '';
    apiBaseUrl = normalizeApiBaseUrl(apiBaseUrl);
  } catch (error) {
    configError = error;
  }
  const configured = !!normalizedApiKey && !!normalizedMint && !configError;
  let statusCache = null;

  async function request(pathname, { method = 'GET', query = {}, body } = {}) {
    if (!configured) {
      throw configError || new SanctumError('NOT_LIVE', 'clashSOL is awaiting Sanctum deployment', 503);
    }
    const url = new URL(`${apiBaseUrl}${pathname}`);
    url.searchParams.set('apiKey', normalizedApiKey);
    Object.entries(query).forEach(([key, value]) => {
      if (Array.isArray(value)) value.forEach(item => url.searchParams.append(key, String(item)));
      else if (value !== undefined && value !== null) url.searchParams.set(key, String(value));
    });
    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), requestTimeoutMs);
    try {
      const response = await fetchImpl(url, {
        method,
        signal: controller.signal,
        headers: body ? { 'content-type': 'application/json' } : undefined,
        body: body ? JSON.stringify(body) : undefined,
      });
      let payload = null;
      try { payload = await response.json(); } catch { /* handled below */ }
      if (!response.ok) {
        const status = response.status === 429 ? 503 : (response.status >= 500 ? 502 : 400);
        const upstreamMessage = safeJsonError(payload, `Sanctum API returned HTTP ${response.status}`)
          .split(normalizedApiKey).join('[redacted]')
          .replace(/apiKey=[^&\s]+/gi, 'apiKey=[redacted]');
        throw new SanctumError(
          response.status === 429 ? 'UPSTREAM_RATE_LIMIT' : 'UPSTREAM_ERROR',
          upstreamMessage,
          status,
        );
      }
      return payload;
    } catch (error) {
      if (error instanceof SanctumError) throw error;
      if (error?.name === 'AbortError') {
        throw new SanctumError('UPSTREAM_TIMEOUT', 'Sanctum API timed out. Please try again.', 504);
      }
      throw new SanctumError('UPSTREAM_UNAVAILABLE', 'Sanctum API is temporarily unavailable', 502);
    } finally {
      clearTimeout(timer);
    }
  }

  async function getStatus({ force = false } = {}) {
    if (!configured) {
      return {
        available: false,
        launchStatus: 'awaiting_sanctum_deployment',
        name: 'Clash Staked SOL',
        symbol: 'clashSOL',
        mint: normalizedMint || null,
        reason: configError ? 'configuration_invalid' : 'mint_not_deployed',
      };
    }
    if (!force && statusCache && statusCache.expiresAt > now()) return statusCache.value;
    let metadata;
    let apyPayload;
    try {
      const values = await Promise.all([
        request(`/lsts/${encodeURIComponent(normalizedMint)}`),
        request(`/lsts/${encodeURIComponent(normalizedMint)}/apys`).catch(() => null),
      ]);
      metadata = safeLstMetadata(values[0], normalizedMint);
      apyPayload = values[1];
    } catch (error) {
      if (error?.code === 'LST_NOT_DISCOVERABLE') {
        return {
          available: false,
          launchStatus: 'awaiting_sanctum_deployment',
          name: 'Clash Staked SOL',
          symbol: 'clashSOL',
          mint: normalizedMint,
          reason: 'pool_not_discoverable',
        };
      }
      throw error;
    }
    const apy = extractApy(apyPayload) ?? metadata.apy;
    const value = { available: true, launchStatus: 'live', ...metadata, apy };
    statusCache = { value, expiresAt: now() + STATUS_CACHE_MS };
    return value;
  }

  function cleanupExpiredIntents() {
    db.prepare(`
      UPDATE sanctum_order_intents
      SET status = 'expired', last_error = COALESCE(last_error, 'Order expired')
      WHERE status = 'pending' AND expires_at_ms <= ?
    `).run(now());
  }

  async function createOrder({ playerId, wallet, amountSol, slippageBps }) {
    const status = await getStatus();
    if (!status.available) {
      throw new SanctumError('NOT_LIVE', 'clashSOL is awaiting Sanctum deployment', 503);
    }
    cleanupExpiredIntents();
    const player = String(playerId || '').trim();
    if (!player) throw new SanctumError('AUTH_REQUIRED', 'Authentication is required', 401);
    const normalizedWallet = normalizePublicKey(wallet);
    const inputAmount = parseSolToLamports(amountSol);
    const slippage = parseSlippageBps(slippageBps);
    const upstream = await request('/swap/token/order', {
      query: {
        inp: WRAPPED_SOL_MINT,
        out: normalizedMint,
        mode: 'ExactIn',
        signer: normalizedWallet,
        amt: inputAmount,
        slippageBps: slippage,
        swapSrc: ['Inf', 'SanctumRouter', 'Jup'],
      },
    });
    if (
      String(upstream?.inp || '') !== WRAPPED_SOL_MINT
      || String(upstream?.out || '') !== normalizedMint
      || String(upstream?.mode || '') !== 'ExactIn'
      || String(upstream?.inpAmt || '') !== inputAmount
      || !/^\d+$/.test(String(upstream?.outAmt || ''))
      || BigInt(String(upstream.outAmt)) <= 0n
      || typeof upstream?.tx !== 'string'
      || !['Inf', 'SanctumRouter', 'Jup'].includes(String(upstream?.swapSrcData?.swapSrc || ''))
    ) {
      throw new SanctumError('INVALID_UPSTREAM_ORDER', 'Sanctum returned an invalid clashSOL order', 502);
    }
    const inspected = inspectTransaction(upstream.tx, normalizedWallet);
    const id = randomUUID();
    const expiresAtMs = now() + orderTtlMs;
    db.prepare(`
      INSERT INTO sanctum_order_intents (
        id, player_id, wallet, input_mint, output_mint, input_amount,
        output_amount, slippage_bps, order_json, unsigned_tx_hash,
        tx_kind, status, expires_at_ms
      ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, 'pending', ?)
    `).run(
      id,
      player,
      normalizedWallet,
      WRAPPED_SOL_MINT,
      normalizedMint,
      inputAmount,
      String(upstream.outAmt),
      slippage,
      JSON.stringify(upstream),
      inspected.hash,
      inspected.kind,
      expiresAtMs,
    );
    return {
      orderId: id,
      expiresAtMs,
      transaction: upstream.tx,
      inputMint: WRAPPED_SOL_MINT,
      outputMint: normalizedMint,
      inputAmount,
      outputAmount: String(upstream.outAmt),
      slippageBps: slippage,
      route: upstream.swapSrcData.swapSrc,
    };
  }

  async function executeOrder({ playerId, orderId, signedTransaction }) {
    cleanupExpiredIntents();
    const player = String(playerId || '').trim();
    const id = String(orderId || '').trim();
    const row = db.prepare('SELECT * FROM sanctum_order_intents WHERE id = ? LIMIT 1').get(id);
    if (!row || row.player_id !== player) {
      throw new SanctumError('ORDER_NOT_FOUND', 'Sanctum order was not found', 404);
    }
    if (row.status === 'consumed') {
      throw new SanctumError('ORDER_ALREADY_EXECUTED', 'This Sanctum order was already executed', 409);
    }
    if (row.status === 'executing') {
      throw new SanctumError('ORDER_EXECUTING', 'This Sanctum order is already being submitted', 409);
    }
    if (row.status === 'expired' || Number(row.expires_at_ms) <= now()) {
      throw new SanctumError('ORDER_EXPIRED', 'This Sanctum quote expired. Request a new one.', 410);
    }
    verifySignedTransaction(signedTransaction, row.wallet, row.tx_kind, row.unsigned_tx_hash);
    const claimed = db.prepare(`
      UPDATE sanctum_order_intents
      SET status = 'executing', execution_started_at = datetime('now'), last_error = NULL
      WHERE id = ? AND player_id = ? AND status = 'pending' AND expires_at_ms > ?
    `).run(id, player, now());
    if (claimed.changes !== 1) {
      throw new SanctumError('ORDER_CONFLICT', 'This Sanctum order changed state. Request a new quote.', 409);
    }
    try {
      const orderResponse = JSON.parse(row.order_json);
      const result = await request('/swap/token/execute', {
        method: 'POST',
        body: { signedTx: signedTransaction, orderResponse },
      });
      const signature = String(result?.signature || '').trim();
      if (!VALID_SIGNATURE_RE.test(signature) || bs58.decode(signature).length !== 64) {
        throw new SanctumError('INVALID_UPSTREAM_RESPONSE', 'Sanctum returned an invalid transaction signature', 502);
      }
      db.prepare(`
        UPDATE sanctum_order_intents
        SET status = 'consumed', tx_signature = ?, consumed_at = datetime('now'), last_error = NULL
        WHERE id = ? AND status = 'executing'
      `).run(signature, id);
      return { signature, orderId: id };
    } catch (error) {
      db.prepare(`
        UPDATE sanctum_order_intents
        SET status = 'pending', execution_started_at = NULL, last_error = ?
        WHERE id = ? AND status = 'executing' AND expires_at_ms > ?
      `).run(String(error?.message || 'Sanctum execution failed').slice(0, 300), id, now());
      throw error;
    }
  }

  return {
    getStatus,
    createOrder,
    executeOrder,
    configured,
  };
}

module.exports = {
  SanctumError,
  WRAPPED_SOL_MINT,
  createSanctumService,
  inspectTransaction,
  parseSolToLamports,
  verifySignedTransaction,
};
