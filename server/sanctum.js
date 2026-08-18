const crypto = require('crypto');
const nacl = require('tweetnacl');
const bs58Module = require('bs58');
const {
  Connection,
  PublicKey,
  Transaction,
  VersionedTransaction,
} = require('@solana/web3.js');
const {
  createSolanaConnection,
  solanaRpcUrls,
} = require('./solana_rpc');

const bs58 = bs58Module.default || bs58Module;

const DEFAULT_API_BASE_URL = 'https://sanctum-api.ironforge.network';
const WRAPPED_SOL_MINT = 'So11111111111111111111111111111111111111112';
const LIVE_CLASHSOL_MINT = 'CLAShCrEjid112Mr1tWk7VqaGUAAKbiKdikDQYyDwfes';
const DEFAULT_ORDER_TTL_MS = 90_000;
const DEFAULT_REQUEST_TIMEOUT_MS = 5_000;
const DEFAULT_SIGNATURE_RPC_TIMEOUT_MS = 2_500;
const DEFAULT_SIGNATURE_STATUS_TIMEOUT_MS = 8_000;
const STATUS_CACHE_MS = 60_000;
const MIN_SOL_LAMPORTS = 1_000_000n; // 0.001 SOL
const MAX_SOL_LAMPORTS = 10_000_000_000_000n; // 10,000 SOL
const MAX_SIGNED_TX_BASE64_LENGTH = 12_000;
const COMPUTE_BUDGET_PROGRAM_ID = 'ComputeBudget111111111111111111111111111111';
const MAX_WALLET_COMPUTE_UNIT_LIMIT = 1_400_000n;
const MAX_WALLET_PRIORITY_FEE_LAMPORTS = 5_000_000n; // 0.005 SOL
const VALID_SIGNATURE_RE = /^[1-9A-HJ-NP-Za-km-z]{80,90}$/;
const EXECUTION_STALE_SECONDS = 120;
const UNKNOWN_RECONCILE_GRACE_MS = 10 * 60 * 1000;

class SanctumError extends Error {
  constructor(code, message, status = 400, details = null) {
    super(message);
    this.name = 'SanctumError';
    this.code = code;
    this.status = status;
    this.details = details;
  }
}

function withTimeout(promise, timeoutMs, errorFactory) {
  let timer = null;
  const timeout = new Promise((_, reject) => {
    timer = setTimeout(() => reject(errorFactory()), timeoutMs);
  });
  return Promise.race([promise, timeout]).finally(() => clearTimeout(timer));
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

function parseSolToLamports(value, symbol = 'token') {
  const text = String(value ?? '').trim();
  if (!/^(?:0|[1-9]\d*)(?:\.\d{1,9})?$/.test(text)) {
    throw new SanctumError('INVALID_AMOUNT', `Enter a valid ${symbol} amount with at most 9 decimals`, 400);
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

function normalizeSwapDirection(value) {
  const direction = String(value || 'stake').trim().toLowerCase();
  if (!['stake', 'unstake'].includes(direction)) {
    throw new SanctumError('INVALID_DIRECTION', 'Use stake or unstake for clashSOL swaps', 400);
  }
  return direction;
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

function versionedMessageShape(message) {
  return {
    header: {
      numRequiredSignatures: message.header.numRequiredSignatures,
      numReadonlySignedAccounts: message.header.numReadonlySignedAccounts,
      numReadonlyUnsignedAccounts: message.header.numReadonlyUnsignedAccounts,
    },
    staticAccountKeys: message.staticAccountKeys.map(key => key.toBase58()),
    compiledInstructions: message.compiledInstructions.map(instruction => ({
      programIdIndex: instruction.programIdIndex,
      accountKeyIndexes: Array.from(instruction.accountKeyIndexes),
      data: Buffer.from(instruction.data).toString('base64'),
    })),
    addressTableLookups: message.addressTableLookups.map(lookup => ({
      accountKey: lookup.accountKey.toBase58(),
      writableIndexes: Array.from(lookup.writableIndexes),
      readonlyIndexes: Array.from(lookup.readonlyIndexes),
    })),
  };
}

function legacyMessageShape(transaction) {
  const message = transaction.compileMessage();
  return {
    header: message.header,
    accountKeys: message.accountKeys.map(key => key.toBase58()),
    instructions: message.instructions.map(instruction => ({
      programIdIndex: instruction.programIdIndex,
      accounts: Array.from(instruction.accounts),
      data: instruction.data,
    })),
  };
}

function transactionShape(inspected) {
  return inspected.kind === 'versioned'
    ? versionedMessageShape(inspected.tx.message)
    : legacyMessageShape(inspected.tx);
}

function versionedAccountModel(message) {
  const refs = [];
  const staticAccounts = message.staticAccountKeys.map((key, index) => {
    const signerCount = Number(message.header.numRequiredSignatures || 0);
    const readonlySignerStart = signerCount - Number(message.header.numReadonlySignedAccounts || 0);
    const readonlyUnsignedStart = message.staticAccountKeys.length - Number(message.header.numReadonlyUnsignedAccounts || 0);
    const signer = index < signerCount;
    const writable = signer ? index < readonlySignerStart : index < readonlyUnsignedStart;
    const address = key.toBase58();
    refs.push(`static:${address}`);
    return { address, signer, writable };
  });
  const writableLookupRefs = [];
  const readonlyLookupRefs = [];
  const lookups = message.addressTableLookups.map(lookup => {
    const table = lookup.accountKey.toBase58();
    const writableIndexes = Array.from(lookup.writableIndexes);
    const readonlyIndexes = Array.from(lookup.readonlyIndexes);
    writableIndexes.forEach(index => writableLookupRefs.push(`lookup:${table}:w:${index}`));
    readonlyIndexes.forEach(index => readonlyLookupRefs.push(`lookup:${table}:r:${index}`));
    return { table, writableIndexes, readonlyIndexes };
  });
  refs.push(...writableLookupRefs, ...readonlyLookupRefs);
  return {
    refs,
    signerKeys: staticAccounts.filter(account => account.signer).map(account => account.address),
    staticAccounts: staticAccounts
      .filter(account => account.address !== COMPUTE_BUDGET_PROGRAM_ID)
      .sort((a, b) => a.address.localeCompare(b.address)),
    lookups: lookups.sort((a, b) => a.table.localeCompare(b.table)),
  };
}

function versionedSemanticShape(message) {
  const accounts = versionedAccountModel(message);
  const instructions = message.compiledInstructions.map(instruction => {
    const program = accounts.refs[instruction.programIdIndex];
    const accountRefs = Array.from(instruction.accountKeyIndexes).map(index => accounts.refs[index]);
    if (!program || accountRefs.some(ref => !ref)) {
      throw new SanctumError('INVALID_TRANSACTION', 'The signed Sanctum transaction has invalid account indexes', 400);
    }
    return {
      program,
      accounts: accountRefs,
      data: Buffer.from(instruction.data).toString('base64'),
    };
  });
  return {
    signerKeys: accounts.signerKeys,
    staticAccounts: accounts.staticAccounts,
    lookups: accounts.lookups,
    swapInstructions: instructions.filter(instruction => instruction.program !== `static:${COMPUTE_BUDGET_PROGRAM_ID}`),
    computeInstructions: instructions.filter(instruction => instruction.program === `static:${COMPUTE_BUDGET_PROGRAM_ID}`),
  };
}

function validateWalletPriorityFeeInstructions(instructions) {
  if (instructions.length > 2) {
    throw new SanctumError('WALLET_PRIORITY_FEE_UNSAFE', 'The wallet added an unsupported priority-fee configuration', 400);
  }
  let computeUnitLimit = null;
  let computeUnitPrice = null;
  for (const instruction of instructions) {
    const data = Buffer.from(instruction.data, 'base64');
    if (data.length === 5 && data[0] === 2 && computeUnitLimit == null) {
      computeUnitLimit = BigInt(data.readUInt32LE(1));
      continue;
    }
    if (data.length === 9 && data[0] === 3 && computeUnitPrice == null) {
      computeUnitPrice = data.readBigUInt64LE(1);
      continue;
    }
    throw new SanctumError('WALLET_PRIORITY_FEE_UNSAFE', 'The wallet added an unsupported priority-fee instruction', 400);
  }
  if (computeUnitLimit != null && (computeUnitLimit < 1n || computeUnitLimit > MAX_WALLET_COMPUTE_UNIT_LIMIT)) {
    throw new SanctumError('WALLET_PRIORITY_FEE_UNSAFE', 'The wallet requested an unsafe compute-unit limit', 400);
  }
  const feeLimit = computeUnitLimit ?? MAX_WALLET_COMPUTE_UNIT_LIMIT;
  const maximumPriorityFee = ((computeUnitPrice ?? 0n) * feeLimit + 999_999n) / 1_000_000n;
  if (maximumPriorityFee > MAX_WALLET_PRIORITY_FEE_LAMPORTS) {
    throw new SanctumError('WALLET_PRIORITY_FEE_TOO_HIGH', 'The wallet priority fee is above the 0.005 SOL safety limit', 400);
  }
}

function verifySafeVersionedWalletAdjustments(signed, reviewed) {
  const signedShape = versionedSemanticShape(signed.tx.message);
  const reviewedShape = versionedSemanticShape(reviewed.tx.message);
  if (
    JSON.stringify(signedShape.signerKeys) !== JSON.stringify(reviewedShape.signerKeys)
    || JSON.stringify(signedShape.staticAccounts) !== JSON.stringify(reviewedShape.staticAccounts)
    || JSON.stringify(signedShape.lookups) !== JSON.stringify(reviewedShape.lookups)
    || JSON.stringify(signedShape.swapInstructions) !== JSON.stringify(reviewedShape.swapInstructions)
  ) {
    return false;
  }
  // Wallets may add or recalculate Compute Budget instructions while signing
  // (for example, their priority-fee estimator). They may not change any
  // signer, account role, lookup table, or non-compute swap instruction.
  validateWalletPriorityFeeInstructions(signedShape.computeInstructions);
  return true;
}

function verifyReviewedSignedTransaction(base64, expectedWallet, expectedKind, expectedHash, reviewedBase64) {
  try {
    return { inspected: verifySignedTransaction(base64, expectedWallet, expectedKind, expectedHash), blockhashRefreshed: false };
  } catch (error) {
    if (error?.code !== 'TRANSACTION_CHANGED' || !reviewedBase64) throw error;
    const signed = inspectTransaction(base64, expectedWallet);
    const reviewed = inspectTransaction(reviewedBase64, expectedWallet);
    const safeWalletAdjustment = signed.kind === 'versioned'
      && reviewed.kind === 'versioned'
      && signed.kind === expectedKind
      && verifySafeVersionedWalletAdjustments(signed, reviewed);
    const blockhashOnlyAdjustment = signed.kind === reviewed.kind
      && signed.kind === expectedKind
      && JSON.stringify(transactionShape(signed)) === JSON.stringify(transactionShape(reviewed));
    if (!safeWalletAdjustment && !blockhashOnlyAdjustment) {
      throw error;
    }
    const signature = signed.kind === 'versioned'
      ? signed.tx.signatures[signed.signerIndex]
      : signed.tx.signatures[signed.signerIndex]?.signature;
    const publicKey = new PublicKey(expectedWallet).toBytes();
    if (!signature || signature.length !== nacl.sign.signatureLength || !nacl.sign.detached.verify(signed.message, signature, publicKey)) {
      throw new SanctumError('INVALID_SIGNATURE', 'The connected wallet did not sign this Sanctum order', 400);
    }
    return { inspected: signed, blockhashRefreshed: true };
  }
}

async function defaultSignatureStatusReader(signature, { perRpcTimeoutMs = DEFAULT_SIGNATURE_RPC_TIMEOUT_MS } = {}) {
  const urls = solanaRpcUrls();
  if (urls.length === 0) throw new Error('Sanctum transaction confirmation failed: no Solana RPC endpoint is configured');
  let lastError = null;
  for (const rpcUrl of urls) {
    try {
      const connection = createSolanaConnection(Connection, rpcUrl, 'confirmed');
      // eslint-disable-next-line no-await-in-loop
      const result = await withTimeout(
        connection.getSignatureStatuses([signature], { searchTransactionHistory: true }),
        perRpcTimeoutMs,
        () => new Error('Solana signature-status RPC timed out'),
      );
      const value = result?.value?.[0] || null;
      if (value) {
        return {
          slot: Number(value.slot || 0) || null,
          confirmations: value.confirmations,
          confirmationStatus: value.confirmationStatus || null,
          err: value.err || null,
        };
      }
    } catch (error) {
      lastError = error;
    }
  }
  // A null result is final only when every configured RPC answered. If even
  // one endpoint failed, retain submission_unknown rather than risk a false
  // terminal result during provider degradation.
  if (lastError) throw lastError;
  return null;
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
  if (Array.isArray(source)) {
    const latest = source
      .filter(row => Number.isFinite(Number(row?.apy)))
      .sort((a, b) => Number(b?.epochEndTs || b?.epoch || 0) - Number(a?.epochEndTs || a?.epoch || 0))[0];
    return latest ? Number(latest.apy) : null;
  }
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
  const value = candidates.map(Number).find(candidate => Number.isFinite(candidate) && candidate >= 0);
  return value ?? null;
}

function safeJsonError(payload, fallback) {
  const candidate = payload?.message || payload?.error?.message || payload?.error || payload?.detail;
  return typeof candidate === 'string' && candidate.trim() ? candidate.trim().slice(0, 300) : fallback;
}

function positiveInteger(value, fallback) {
  const parsed = Number(value);
  return Number.isSafeInteger(parsed) && parsed > 0 ? parsed : fallback;
}

function createSanctumService({
  db,
  fetchImpl = globalThis.fetch,
  apiKey = process.env.SANCTUM_API_KEY,
  clashSolMint = process.env.CLASHSOL_MINT || LIVE_CLASHSOL_MINT,
  apiBaseUrl = process.env.SANCTUM_API_BASE_URL || DEFAULT_API_BASE_URL,
  requestTimeoutMs = DEFAULT_REQUEST_TIMEOUT_MS,
  orderTtlMs = DEFAULT_ORDER_TTL_MS,
  pendingIntentLimit = process.env.SANCTUM_PENDING_INTENT_LIMIT,
  expiredIntentRetentionMs = process.env.SANCTUM_EXPIRED_INTENT_RETENTION_MS,
  orderPayloadRetentionMs = process.env.SANCTUM_ORDER_PAYLOAD_RETENTION_MS,
  signatureStatusReader = defaultSignatureStatusReader,
  signatureRpcTimeoutMs = DEFAULT_SIGNATURE_RPC_TIMEOUT_MS,
  signatureStatusTimeoutMs = DEFAULT_SIGNATURE_STATUS_TIMEOUT_MS,
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
  const safePendingIntentLimit = positiveInteger(pendingIntentLimit, 3);
  const safeSignatureRpcTimeoutMs = positiveInteger(signatureRpcTimeoutMs, DEFAULT_SIGNATURE_RPC_TIMEOUT_MS);
  const safeSignatureStatusTimeoutMs = positiveInteger(signatureStatusTimeoutMs, DEFAULT_SIGNATURE_STATUS_TIMEOUT_MS);
  const safeExpiredIntentRetentionMs = Math.max(
    24 * 60 * 60 * 1000,
    positiveInteger(expiredIntentRetentionMs, 7 * 24 * 60 * 60 * 1000),
  );
  const safeOrderPayloadRetentionMs = Math.max(
    safeExpiredIntentRetentionMs,
    positiveInteger(orderPayloadRetentionMs, 30 * 24 * 60 * 60 * 1000),
  );
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
          response.status === 429
            ? 'UPSTREAM_RATE_LIMIT'
            : response.status >= 500
              ? 'UPSTREAM_SERVER_ERROR'
              : 'UPSTREAM_ERROR',
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
      const reason = configError
        ? 'configuration_invalid'
        : !normalizedApiKey
          ? 'api_key_missing'
          : 'mint_not_deployed';
      return {
        available: false,
        launchStatus: reason === 'api_key_missing' ? 'configuration_required' : 'awaiting_sanctum_deployment',
        name: 'Clash Staked SOL',
        symbol: 'clashSOL',
        mint: normalizedMint || null,
        reason,
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
    const value = {
      available: true,
      launchStatus: 'live',
      ...metadata,
      apy,
      apyPeriod: 'last_epoch',
      updatedAt: new Date(now()).toISOString(),
    };
    statusCache = { value, expiresAt: now() + STATUS_CACHE_MS };
    return value;
  }

  function getLocalStatus({ degraded = false, error = '' } = {}) {
    return {
      available: configured,
      launchStatus: configured ? 'live' : 'configuration_required',
      degraded: !!degraded,
      name: 'Clash Staked SOL',
      symbol: 'clashSOL',
      mint: normalizedMint || null,
      apy: null,
      apyPeriod: 'last_epoch',
      ...(error ? { warning: String(error).slice(0, 180) } : {}),
      updatedAt: new Date(now()).toISOString(),
    };
  }

  function cleanupExpiredIntents() {
    const stamp = now();
    db.prepare(`
      UPDATE sanctum_order_intents
      SET status = 'submission_unknown',
          last_error = COALESCE(last_error, 'Submission interrupted before Sanctum responded'),
          last_error_code = COALESCE(last_error_code, 'SUBMISSION_INTERRUPTED'),
          last_error_stage = COALESCE(last_error_stage, 'broadcast')
      WHERE status = 'executing'
        AND execution_started_at <= datetime('now', ?)
    `).run(`-${EXECUTION_STALE_SECONDS} seconds`);
    db.prepare(`
      UPDATE sanctum_order_intents
      SET status = 'expired',
          last_error = COALESCE(last_error, 'Order expired'),
          last_error_code = COALESCE(last_error_code, 'ORDER_EXPIRED'),
          last_error_stage = COALESCE(last_error_stage, 'quote')
      WHERE status = 'pending' AND expires_at_ms <= ?
    `).run(stamp);
    db.prepare(`
      DELETE FROM sanctum_order_intents
      WHERE status = 'expired' AND expires_at_ms < ?
    `).run(stamp - safeExpiredIntentRetentionMs);
    db.prepare(`
      UPDATE sanctum_order_intents
      SET order_json = '{}'
      WHERE status IN ('consumed', 'confirmed', 'failed')
        AND order_json <> '{}'
        AND expires_at_ms < ?
    `).run(stamp - safeOrderPayloadRetentionMs);
  }

  async function getLatestActiveOrder({ playerId }) {
    cleanupExpiredIntents();
    const player = String(playerId || '').trim();
    if (!player) throw new SanctumError('AUTH_REQUIRED', 'Authentication is required', 401);
    const rows = db.prepare(`
      SELECT *
      FROM sanctum_order_intents
      WHERE player_id = ? AND status IN ('executing', 'submission_unknown', 'submitted')
      ORDER BY created_at DESC, rowid DESC
    `).all(player);
    for (const row of rows) {
      let view = orderStatusView(row);
      if (row.tx_signature) {
        // eslint-disable-next-line no-await-in-loop
        view = await getOrderStatus({ playerId: player, orderId: row.id });
      }
      if (['executing', 'submission_unknown', 'submitted'].includes(view.status)) return view;
    }
    return null;
  }

  async function createOrder({ playerId, wallet, amountSol, amount, direction: directionInput, slippageBps }) {
    cleanupExpiredIntents();
    const player = String(playerId || '').trim();
    if (!player) throw new SanctumError('AUTH_REQUIRED', 'Authentication is required', 401);
    const normalizedWallet = normalizePublicKey(wallet);
    const direction = normalizeSwapDirection(directionInput);
    const inputMint = direction === 'stake' ? WRAPPED_SOL_MINT : normalizedMint;
    const outputMint = direction === 'stake' ? normalizedMint : WRAPPED_SOL_MINT;
    const inputAmount = parseSolToLamports(amount ?? amountSol, direction === 'stake' ? 'SOL' : 'clashSOL');
    const slippage = parseSlippageBps(slippageBps);
    const activeSubmission = await getLatestActiveOrder({ playerId: player });
    if (activeSubmission) {
      throw new SanctumError(
        'SWAP_IN_PROGRESS',
        'An existing clashSOL swap is still being tracked. Wait for its final status before starting another.',
        409,
      );
    }
    const pending = db.prepare(`
      SELECT COUNT(*) AS count
      FROM sanctum_order_intents
      WHERE player_id = ? AND status = 'pending'
    `).get(player);
    if (Number(pending?.count || 0) >= safePendingIntentLimit) {
      throw new SanctumError(
        'TOO_MANY_PENDING_ORDERS',
        'Finish or let an existing clashSOL quote expire before requesting another.',
        429,
      );
    }
    const status = await getStatus();
    if (!status.available) {
      throw new SanctumError('NOT_LIVE', 'clashSOL is awaiting Sanctum deployment', 503);
    }
    const upstream = await request('/swap/token/order', {
      query: {
        inp: inputMint,
        out: outputMint,
        mode: 'ExactIn',
        signer: normalizedWallet,
        amt: inputAmount,
        slippageBps: slippage,
        swapSrc: ['Inf', 'SanctumRouter', 'Jup'],
      },
    });
    if (
      String(upstream?.inp || '') !== inputMint
      || String(upstream?.out || '') !== outputMint
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
      inputMint,
      outputMint,
      inputAmount,
      String(upstream.outAmt),
      slippage,
      JSON.stringify(upstream),
      inspected.hash,
      inspected.kind,
      expiresAtMs,
    );
    db.prepare(`UPDATE sanctum_order_intents SET direction = ? WHERE id = ?`).run(direction, id);
    return {
      orderId: id,
      direction,
      expiresAtMs,
      transaction: upstream.tx,
      inputMint,
      outputMint,
      inputAmount,
      outputAmount: String(upstream.outAmt),
      slippageBps: slippage,
      route: upstream.swapSrcData.swapSrc,
    };
  }

  function orderStatusView(row, { rpcUnavailable = false } = {}) {
    const status = row.status === 'consumed' ? 'submitted' : row.status;
    const stage = status === 'pending'
      ? 'wallet_signature'
      : status === 'executing'
        ? 'broadcast'
        : status === 'submission_unknown'
          ? 'reconciliation'
          : status === 'submitted'
            ? 'on_chain_confirmation'
            : status === 'confirmed'
              ? 'balance_refresh'
              : status === 'expired'
                ? 'quote'
                : 'failed';
    return {
      orderId: row.id,
      status,
      stage,
      direction: row.direction || 'stake',
      wallet: row.wallet,
      inputAmount: row.input_amount,
      quotedOutputAmount: row.output_amount,
      expiresAtMs: Number(row.expires_at_ms),
      txSignature: row.tx_signature || null,
      signature: row.tx_signature || null,
      explorerUrl: row.tx_signature ? `https://solscan.io/tx/${row.tx_signature}` : null,
      confirmationStatus: row.confirmation_status || null,
      slot: row.confirmation_slot == null ? null : Number(row.confirmation_slot),
      submittedAt: row.submitted_at || row.consumed_at || null,
      confirmedAt: row.confirmed_at || null,
      rpcUnavailable,
      error: row.last_error ? {
        code: row.last_error_code || 'SWAP_FAILED',
        message: row.last_error,
        stage: row.last_error_stage || 'unknown',
        retryable: ['UPSTREAM_TIMEOUT', 'UPSTREAM_UNAVAILABLE', 'UPSTREAM_SERVER_ERROR', 'CONFIRMATION_UNAVAILABLE'].includes(row.last_error_code),
      } : null,
    };
  }

  async function getOrderStatus({ playerId, orderId, refresh = true }) {
    cleanupExpiredIntents();
    const player = String(playerId || '').trim();
    const id = String(orderId || '').trim();
    let row = db.prepare('SELECT * FROM sanctum_order_intents WHERE id = ? AND player_id = ? LIMIT 1').get(id, player);
    if (!row) throw new SanctumError('ORDER_NOT_FOUND', 'Sanctum order was not found', 404);
    if (!refresh || !row.tx_signature || !['executing', 'submission_unknown', 'submitted', 'consumed'].includes(row.status)) {
      return orderStatusView(row);
    }
    let chainStatus;
    try {
      chainStatus = await withTimeout(
        Promise.resolve().then(() => signatureStatusReader(row.tx_signature, {
          perRpcTimeoutMs: safeSignatureRpcTimeoutMs,
        })),
        safeSignatureStatusTimeoutMs,
        () => new Error('Solana transaction reconciliation timed out'),
      );
    } catch {
      return orderStatusView(row, { rpcUnavailable: true });
    }
    if (!chainStatus) {
      // Only a successful on-chain lookup may terminalize an uncertain
      // submission. Cleanup never guesses while RPC is unavailable. Waiting
      // beyond the quote lifetime plus the reconciliation grace also ensures
      // the transaction's recent blockhash can no longer land later.
      if (['submission_unknown', 'submitted'].includes(row.status) && Number(row.expires_at_ms) < now() - UNKNOWN_RECONCILE_GRACE_MS) {
        db.prepare(`
          UPDATE sanctum_order_intents
          SET status = 'failed',
              last_error = 'No Solana transaction was found after the reconciliation window ended',
              last_error_code = 'SUBMISSION_NOT_FOUND',
              last_error_stage = 'reconciliation'
          WHERE id = ? AND player_id = ? AND status IN ('submission_unknown', 'submitted')
        `).run(id, player);
        row = db.prepare('SELECT * FROM sanctum_order_intents WHERE id = ? AND player_id = ? LIMIT 1').get(id, player);
      }
      return orderStatusView(row);
    }
    if (chainStatus.err) {
      db.prepare(`
        UPDATE sanctum_order_intents
        SET status = 'failed', confirmation_status = 'failed', confirmation_slot = ?,
            last_error = 'The Solana transaction failed on-chain',
            last_error_code = 'ONCHAIN_FAILED', last_error_stage = 'on_chain'
        WHERE id = ? AND player_id = ?
      `).run(chainStatus.slot, id, player);
    } else if (['confirmed', 'finalized'].includes(chainStatus.confirmationStatus)) {
      db.prepare(`
        UPDATE sanctum_order_intents
        SET status = 'confirmed', confirmation_status = ?, confirmation_slot = ?,
            confirmed_at = COALESCE(confirmed_at, datetime('now')),
            last_error = NULL, last_error_code = NULL, last_error_stage = NULL
        WHERE id = ? AND player_id = ?
      `).run(chainStatus.confirmationStatus, chainStatus.slot, id, player);
    } else {
      db.prepare(`
        UPDATE sanctum_order_intents
        SET status = 'submitted', confirmation_status = ?, confirmation_slot = ?
        WHERE id = ? AND player_id = ?
      `).run(chainStatus.confirmationStatus || 'processed', chainStatus.slot, id, player);
    }
    row = db.prepare('SELECT * FROM sanctum_order_intents WHERE id = ? AND player_id = ? LIMIT 1').get(id, player);
    return orderStatusView(row);
  }

  async function executeOrder({ playerId, orderId, signedTransaction }) {
    cleanupExpiredIntents();
    const player = String(playerId || '').trim();
    const id = String(orderId || '').trim();
    const row = db.prepare('SELECT * FROM sanctum_order_intents WHERE id = ? LIMIT 1').get(id);
    if (!row || row.player_id !== player) {
      throw new SanctumError('ORDER_NOT_FOUND', 'Sanctum order was not found', 404);
    }
    if (['consumed', 'submitted', 'confirmed', 'submission_unknown'].includes(row.status)) {
      return getOrderStatus({ playerId: player, orderId: id });
    }
    if (row.status === 'executing') {
      throw new SanctumError('ORDER_EXECUTING', 'This Sanctum order is already being submitted', 409);
    }
    if (row.status === 'expired' || Number(row.expires_at_ms) <= now()) {
      throw new SanctumError('ORDER_EXPIRED', 'This Sanctum quote expired. Request a new one.', 410);
    }
    let verified;
    let reviewedOrder;
    try {
      reviewedOrder = JSON.parse(row.order_json);
      verified = verifyReviewedSignedTransaction(
        signedTransaction,
        row.wallet,
        row.tx_kind,
        row.unsigned_tx_hash,
        reviewedOrder?.tx,
      );
    } catch (error) {
      db.prepare(`
        UPDATE sanctum_order_intents
        SET status = 'failed', last_error = ?, last_error_code = ?, last_error_stage = 'signature_validation'
        WHERE id = ? AND player_id = ? AND status = 'pending'
      `).run(
        String(error?.message || 'Signed transaction validation failed').slice(0, 300),
        String(error?.code || 'INVALID_TRANSACTION').slice(0, 80),
        id,
        player,
      );
      throw error;
    }
    // Solana identifies a transaction by its first signature, which is not
    // necessarily the connected wallet's signature on a multi-signer route.
    const transactionSignature = verified.inspected.kind === 'versioned'
      ? verified.inspected.tx.signatures[0]
      : verified.inspected.tx.signatures[0]?.signature;
    if (
      !transactionSignature
      || transactionSignature.length !== nacl.sign.signatureLength
      || Buffer.from(transactionSignature).every(byte => byte === 0)
    ) {
      throw new SanctumError('INVALID_SIGNATURE', 'The Sanctum transaction is missing its primary signature', 400);
    }
    const derivedSignature = bs58.encode(Buffer.from(transactionSignature));
    const claimed = db.prepare(`
      UPDATE sanctum_order_intents
      SET status = 'executing', execution_started_at = datetime('now'),
          tx_signature = ?, last_error = NULL, last_error_code = NULL, last_error_stage = NULL
      WHERE id = ? AND player_id = ? AND status = 'pending' AND expires_at_ms > ?
    `).run(derivedSignature, id, player, now());
    if (claimed.changes !== 1) {
      throw new SanctumError('ORDER_CONFLICT', 'This Sanctum order changed state. Request a new quote.', 409);
    }
    try {
      const result = await request('/swap/token/execute', {
        method: 'POST',
        body: { signedTx: signedTransaction, orderResponse: reviewedOrder },
      });
      const signature = String(result?.signature || '').trim();
      if (!VALID_SIGNATURE_RE.test(signature) || bs58.decode(signature).length !== 64) {
        throw new SanctumError('INVALID_UPSTREAM_RESPONSE', 'Sanctum returned an invalid transaction signature', 502);
      }
      if (signature !== derivedSignature) {
        throw new SanctumError('SIGNATURE_MISMATCH', 'Sanctum returned a different transaction signature', 502);
      }
      db.prepare(`
        UPDATE sanctum_order_intents
        SET status = 'submitted', tx_signature = ?, submitted_at = datetime('now'),
            consumed_at = datetime('now'), confirmation_status = 'processed',
            last_error = NULL, last_error_code = NULL, last_error_stage = NULL
        WHERE id = ? AND status = 'executing'
      `).run(signature, id);
      const linked = db.prepare(`
        SELECT player_id FROM player_wallets
        WHERE chain_type = 'solana' AND address = ?
        LIMIT 1
      `).get(row.wallet);
      if (!linked) {
        db.prepare(`
          INSERT OR IGNORE INTO player_wallets
            (player_id, chain_type, address, label, is_primary, updated_at)
          VALUES (?, 'solana', ?, 'Sanctum swap signer', 1, datetime('now'))
        `).run(player, row.wallet);
      } else if (linked.player_id === player) {
        db.prepare(`
          UPDATE player_wallets
          SET updated_at = datetime('now')
          WHERE player_id = ? AND chain_type = 'solana' AND address = ?
        `).run(player, row.wallet);
      }
      return getOrderStatus({ playerId: player, orderId: id });
    } catch (error) {
      const uncertain = ['UPSTREAM_TIMEOUT', 'UPSTREAM_UNAVAILABLE', 'UPSTREAM_SERVER_ERROR'].includes(error?.code);
      db.prepare(`
        UPDATE sanctum_order_intents
        SET status = ?, execution_started_at = NULL, last_error = ?,
            last_error_code = ?, last_error_stage = 'broadcast'
        WHERE id = ? AND status = 'executing'
      `).run(
        uncertain ? 'submission_unknown' : 'failed',
        String(error?.message || 'Sanctum execution failed').slice(0, 300),
        String(error?.code || 'SWAP_EXECUTION_FAILED').slice(0, 80),
        id,
      );
      throw error;
    }
  }

  return {
    getStatus,
    getLocalStatus,
    createOrder,
    executeOrder,
    getOrderStatus,
    getLatestActiveOrder,
    configured,
  };
}

module.exports = {
  SanctumError,
  LIVE_CLASHSOL_MINT,
  WRAPPED_SOL_MINT,
  createSanctumService,
  inspectTransaction,
  parseSolToLamports,
  normalizeSwapDirection,
  verifySignedTransaction,
  verifyReviewedSignedTransaction,
};
