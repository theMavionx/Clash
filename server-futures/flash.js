const crypto = require('crypto');
const {
  PublicKey,
  SYSVAR_INSTRUCTIONS_PUBKEY,
  SystemProgram,
  TransactionInstruction,
  TransactionMessage,
  VersionedTransaction,
} = require('@solana/web3.js');
const bs58 = require('bs58');
const {
  ASSOCIATED_TOKEN_PROGRAM_ID,
  TOKEN_PROGRAM_ID,
  createAssociatedTokenAccountIdempotentInstruction,
  getAssociatedTokenAddressSync,
} = require('@solana/spl-token');
const {
  findBasketAddress,
  findUserDepositLedgerAddress,
} = require('magic-trade-client');
const {
  solanaRpcUrls,
  splitSolanaRpcUrls,
} = require('../server/solana_rpc');

const FLASH_API = String(process.env.FLASH_API_URL || 'https://flashapi.trade').replace(/\/+$/, '');
const FLASH_PROD_API = String(process.env.FLASH_PROD_API_URL || 'https://api.prod.flash.trade').replace(/\/+$/, '');
const FLASH_APP_URL = String(process.env.FLASH_APP_URL || 'https://flash.trade').replace(/\/+$/, '');
const FLASH_REFERRAL_CODE = String(process.env.FLASH_REFERRAL_CODE || 'clash').trim();
const FLASH_REFERRAL_URL = String(
  process.env.FLASH_REFERRAL_URL
  || `https://www.flash.trade?referral=${encodeURIComponent(FLASH_REFERRAL_CODE || 'clash')}`,
).trim();
const FLASH_DOCS_URL = 'https://docs.flash.trade/flash-trade/flash-trade-protocol/build-on-flash/flash-trade-api';
const FLASH_DEFAULT_ER_RPC_URL = 'https://flash.magicblock.xyz';
const FLASH_LEGACY_ER_RPC_URL = 'https://flashtrade.magicblock.app';
const FLASH_V2_RPC_URL = String(process.env.FLASH_V2_RPC_URL || process.env.ER_RPC_URL || process.env.FLASH_MAGIC_ROUTER_RPC || FLASH_DEFAULT_ER_RPC_URL).trim().replace(/\/+$/, '');
const FLASH_USDC_MINT = String(process.env.FLASH_USDC_MINT || 'EPjFWdd5AufqSSqeM2qN1xzybapC8G4wEGGkZwyTDt1v');
const FLASH_USDC_DECIMALS = 6;
const FLASH_MAIN_PROGRAM_ID = 'FLASH6Lo6h3iasJKWDs2F8TkW2UKf3s15C8PMGuVfgBn';
const FLASH_BETA_PROGRAM_ID = 'FTv2RxXarPfNta45HTTMVaGvjzsGg27FXJ3hEKWBhrzV';
const FLASH_PROGRAM_IDS = Array.from(new Set([
  FLASH_MAIN_PROGRAM_ID,
  ...String(process.env.FLASH_PROGRAM_IDS || `${FLASH_MAIN_PROGRAM_ID},${FLASH_BETA_PROGRAM_ID}`)
    .split(',')
    .map(s => s.trim())
    .filter(Boolean),
  FLASH_BETA_PROGRAM_ID,
]));
const FLASH_V2_PROGRAM_ID = FLASH_MAIN_PROGRAM_ID;
const FLASH_MAIN_PROGRAM_PK = new PublicKey(FLASH_MAIN_PROGRAM_ID);
const FLASH_ER_DISCRIMINATORS = Object.freeze({
  openPosition: Buffer.from([56, 132, 228, 149, 65, 34, 167, 111]),
  closePosition: Buffer.from([119, 84, 92, 18, 238, 109, 30, 92]),
  placeTriggerOrder: Buffer.from([18, 150, 225, 93, 42, 182, 3, 56]),
  placeLimitOrder: Buffer.from([81, 75, 213, 34, 116, 52, 25, 191]),
  cancelTriggerOrder: Buffer.from([200, 204, 193, 155, 116, 240, 109, 102]),
  cancelLimitOrder: Buffer.from([214, 63, 140, 71, 200, 34, 22, 175]),
});
const FLASH_ACCOUNT_DISCRIMINATORS = Object.freeze({
  initUserDepositLedger: Buffer.from([85, 112, 206, 148, 18, 19, 5, 147]),
  initBasket: Buffer.from([187, 239, 128, 81, 174, 70, 94, 236]),
  delegateBasket: Buffer.from([196, 119, 186, 43, 197, 234, 15, 178]),
  depositDirect: Buffer.from([206, 183, 178, 8, 196, 87, 27, 150]),
  createReferral: Buffer.from([61, 17, 240, 245, 172, 66, 159, 232]),
});
const FLASH_LEGACY_DISCRIMINATORS = Object.freeze({
  openPosition: '87802f4d0f98f031',
  swapAndOpen: '1ad12a00a93e1e76',
  closePosition: '7b86510031446262',
  closeAndSwap: '93a4b9f09b21a57d',
  placeTriggerOrder: '209c32bce89f70ec',
  cancelTriggerOrder: '58df6801468a3ffe',
  placeLimitOrder: '6cb021ba92e501c5',
  cancelLimitOrder: '2e05ef05194d6f78',
});
const GPL_SESSION_PROGRAM_ID = String(process.env.GPL_SESSION_PROGRAM_ID || 'KeyspM2ssCJbqUhQ4k7sveSiY4WjnYsrXkC8oDbwde5');
const FLASH_DELEGATION_PROGRAM_ID = 'DELeGGvXpWV2fqJUhqcF5ZSYMS4JTLjteaAMARRSaeSh';
const FLASH_DELEGATION_PROGRAM_PK = new PublicKey(FLASH_DELEGATION_PROGRAM_ID);
const GPL_SESSION_TOKEN_V2_DISCRIMINATOR = Buffer.from([178, 3, 85, 254, 13, 116, 128, 41]);
const REQUEST_TIMEOUT_MS = Math.max(1000, Math.min(15_000, Number(process.env.FLASH_TIMEOUT_MS || 7000)));
const SOLANA_RPC_TIMEOUT_MS = Math.max(1000, Math.min(20_000, Number(process.env.FLASH_SOLANA_RPC_TIMEOUT_MS || 8000)));
const PUBLIC_CACHE_TTL_MS = Math.max(1000, Math.min(60_000, Number(process.env.FLASH_PUBLIC_CACHE_TTL_MS || 12_000)));
const TX_MAX_AGE_MS = Math.max(60_000, Number(process.env.FLASH_TX_REWARD_MAX_AGE_MS || 24 * 60 * 60_000));
const FLASH_DUST_POSITION_USD = Math.max(0.01, Math.min(1, Number(process.env.FLASH_DUST_POSITION_USD || 0.10)));
const FLASH_DUST_COLLATERAL_USD = Math.max(0, Math.min(0.05, Number(process.env.FLASH_DUST_COLLATERAL_USD || 0.01)));

let cache = new Map();

const FLASH_PROGRAM_ERROR_BY_CODE = (() => {
  try {
    // The Magic Trade IDL is the authoritative source for Flash program errors.
    // Keep this runtime lookup server-side so error decoding tracks SDK updates.
    // eslint-disable-next-line global-require, import/no-dynamic-require
    const idl = require('magic-trade-client/dist/idl/magic_trade.json');
    return new Map((Array.isArray(idl?.errors) ? idl.errors : []).map(row => [
      Number(row.code),
      { code: Number(row.code), name: row.name, msg: row.msg || '' },
    ]).filter(([code]) => Number.isFinite(code)));
  } catch {
    return new Map();
  }
})();

const FLASH_PROGRAM_ERROR_OVERRIDES = new Map([
  [6013, {
    code: 6013,
    name: 'InvalidPositionState',
    msg: 'Flash position does not exist or is already closed.',
  }],
  [6081, {
    code: 6081,
    name: 'DeprecatedInstruction',
    msg: 'Flash rejected this transaction because the builder returned a deprecated instruction. Refresh and try again after the Flash builder is updated.',
  }],
]);

function extractFlashCustomErrorCode(value) {
  if (value == null) return null;
  if (typeof value === 'number') return Number.isFinite(value) ? value : null;
  if (typeof value === 'string') {
    const hex = value.match(/custom program error:\s*0x([0-9a-f]+)/i);
    if (hex?.[1]) return parseInt(hex[1], 16);
    const custom = value.match(/\bCustom["']?\s*[:=]\s*(\d{4,})\b/i);
    if (custom?.[1]) return Number(custom[1]);
    const flashCode = value.match(/\b(60\d{2}|61\d{2})\b/);
    return flashCode?.[1] ? Number(flashCode[1]) : null;
  }
  if (Array.isArray(value)) {
    if (value.length >= 2) {
      const nested = extractFlashCustomErrorCode(value[1]);
      if (nested != null) return nested;
    }
    for (const item of value) {
      const code = extractFlashCustomErrorCode(item);
      if (code != null) return code;
    }
    return null;
  }
  if (typeof value === 'object') {
    if (Number.isFinite(Number(value.code)) && Number(value.code) > 0) return Number(value.code);
    if (Number.isFinite(Number(value.Custom))) return Number(value.Custom);
    if (Number.isFinite(Number(value.custom))) return Number(value.custom);
    if (value.InstructionError) return extractFlashCustomErrorCode(value.InstructionError);
    if (value.instructionError) return extractFlashCustomErrorCode(value.instructionError);
    for (const key of ['err', 'error', 'message', 'data']) {
      const code = extractFlashCustomErrorCode(value[key]);
      if (code != null) return code;
    }
  }
  return null;
}

function decodeFlashProgramError(err, logs = []) {
  const code = extractFlashCustomErrorCode(err) ?? extractFlashCustomErrorCode(logs);
  if (code == null) return null;
  const def = FLASH_PROGRAM_ERROR_OVERRIDES.get(code) || FLASH_PROGRAM_ERROR_BY_CODE.get(code) || { code, name: '', msg: '' };
  return {
    code,
    name: def.name || '',
    message: def.msg || def.name || `Flash program error ${code}`,
  };
}

function redactRpcUrl(raw) {
  const text = String(raw || '').trim();
  if (!text) return '';
  try {
    const url = new URL(text);
    for (const key of [...url.searchParams.keys()]) {
      if (/key|token|secret|pass|auth/i.test(key)) url.searchParams.set(key, '[redacted]');
    }
    url.pathname = url.pathname.replace(/\/v2\/[^/?#]+/i, '/v2/[redacted]');
    return url.toString();
  } catch {
    return text
      .replace(/([?&][^=]*(?:key|token|secret|pass|auth)[^=]*=)[^&#\s]+/ig, '$1[redacted]')
      .replace(/\/v2\/[^/?#\s]+/ig, '/v2/[redacted]');
  }
}

function isSolanaAddress(addr) {
  const text = String(addr || '').trim();
  if (!/^[1-9A-HJ-NP-Za-km-z]{32,44}$/.test(text)) return false;
  try { return new PublicKey(text).toBase58() === text; } catch { return false; }
}

function flashSolanaRpcUrls() {
  return Array.from(new Set([
    ...solanaRpcUrls([
      ...splitSolanaRpcUrls(process.env.FLASH_SOLANA_RPC_URLS),
      ...splitSolanaRpcUrls(process.env.FLASH_SOLANA_RPC_URL),
    ]),
    'https://api.mainnet-beta.solana.com',
    'https://solana-rpc.publicnode.com',
  ].filter(Boolean)));
}

function flashErRpcUrls() {
  return Array.from(new Set([
    FLASH_LEGACY_ER_RPC_URL,
    FLASH_DEFAULT_ER_RPC_URL,
    ...splitSolanaRpcUrls(process.env.FLASH_V2_RPC_URLS),
    ...splitSolanaRpcUrls(process.env.FLASH_V2_RPC_URL),
    ...splitSolanaRpcUrls(process.env.ER_RPC_URL),
    ...splitSolanaRpcUrls(process.env.FLASH_MAGIC_ROUTER_RPC),
    FLASH_V2_RPC_URL,
  ].filter(Boolean).map(url => String(url).trim().replace(/\/+$/, ''))));
}

function flashFundingRpcUrls() {
  return Array.from(new Set([
    ...flashErRpcUrls(),
    ...flashSolanaRpcUrls(),
  ].filter(Boolean)));
}

function normalizeFlashSession(value) {
  return String(value || '').trim();
}

function flashSessionAllowsTrade(session) {
  const key = normalizeFlashSession(session).toLowerCase().replace(/[\s_-]+/g, '');
  if (!key) return true;
  return !['closed', 'halted', 'paused', 'suspended'].includes(key);
}

function flashSessionLabel(session) {
  const text = normalizeFlashSession(session);
  if (!text) return 'unknown session';
  return text.replace(/([a-z])([A-Z])/g, '$1 $2').toLowerCase();
}

function flashLeverageFromRaw(value) {
  const n = Number(value);
  if (!Number.isFinite(n) || n <= 0) return null;
  return Math.round((n / 10_000) * 100) / 100;
}

function flashUsdFromRaw(value) {
  const n = Number(value);
  if (!Number.isFinite(n) || n <= 0) return null;
  return n / 1_000_000;
}

async function withFlashSolanaRpc(label, task) {
  const urls = flashSolanaRpcUrls();
  let lastError = null;
  for (const rpcUrl of urls) {
    const ctrl = new AbortController();
    const timer = setTimeout(() => ctrl.abort(), SOLANA_RPC_TIMEOUT_MS);
    try {
      // eslint-disable-next-line no-await-in-loop
      return await task(rpcUrl, ctrl.signal);
    } catch (e) {
      lastError = e;
      console.warn(`[flash] ${label} RPC failed on ${redactRpcUrl(rpcUrl)}:`, e?.message || e);
    } finally {
      clearTimeout(timer);
    }
  }
  throw lastError || new Error(`${label} failed: no Solana RPC endpoint available`);
}

async function flashSolanaRpcRequest(label, method, params) {
  return withFlashSolanaRpc(label, async (rpcUrl, signal) => {
    const res = await fetch(rpcUrl, {
      method: 'POST',
      signal,
      headers: {
        accept: 'application/json',
        'content-type': 'application/json',
        'user-agent': 'ClashOfPerps/1.0 flash-solana',
      },
      body: JSON.stringify({
        jsonrpc: '2.0',
        id: `flash-${Date.now()}`,
        method,
        params,
      }),
    });
    const text = await res.text();
    let data = null;
    try { data = text ? JSON.parse(text) : null; } catch { data = null; }
    if (!res.ok || data?.error) {
      const err = new Error(data?.error?.message || (text ? text.slice(0, 400) : `HTTP ${res.status}`));
      err.status = res.ok ? 502 : res.status;
      err.data = data || text;
      throw err;
    }
    return data?.result;
  });
}

async function flashJsonRpcRequest(rpcUrl, label, method, params, signal) {
  const res = await fetch(rpcUrl, {
    method: 'POST',
    signal,
    headers: {
      accept: 'application/json',
      'content-type': 'application/json',
      'user-agent': 'ClashOfPerps/1.0 flash-rpc',
    },
    body: JSON.stringify({
      jsonrpc: '2.0',
      id: `flash-${Date.now()}`,
      method,
      params,
    }),
  });
  const text = await res.text();
  let data = null;
  try { data = text ? JSON.parse(text) : null; } catch { data = null; }
  if (!res.ok || data?.error) {
    const err = new Error(data?.error?.message || (text ? text.slice(0, 400) : `HTTP ${res.status}`));
    err.status = res.ok ? 502 : res.status;
    err.rpc_url = redactRpcUrl(rpcUrl);
    throw err;
  }
  return data?.result;
}

async function flashV2RpcRequest(label, method, params) {
  const endpoint = String(FLASH_V2_RPC_URL || '').trim();
  if (!endpoint) throw Object.assign(new Error('Flash v2 RPC endpoint is not configured'), { status: 503 });
  const ctrl = new AbortController();
  const timer = setTimeout(() => ctrl.abort(), SOLANA_RPC_TIMEOUT_MS);
  try {
    const res = await fetch(endpoint, {
      method: 'POST',
      signal: ctrl.signal,
      headers: {
        accept: 'application/json',
        'content-type': 'application/json',
        'user-agent': 'ClashOfPerps/1.0 flash-rpc-read',
      },
      body: JSON.stringify({
        jsonrpc: '2.0',
        id: `flash-v2-${Date.now()}`,
        method,
        params,
      }),
    });
    const text = await res.text();
    let data = null;
    try { data = text ? JSON.parse(text) : null; } catch { data = null; }
    if (!res.ok || data?.error) {
      const err = new Error(data?.error?.message || (text ? text.slice(0, 400) : `HTTP ${res.status}`));
      err.status = res.ok ? 502 : res.status;
      err.data = data || text;
      throw err;
    }
    return data?.result;
  } finally {
    clearTimeout(timer);
  }
}

async function flashErRpcRequestAny(label, method, params) {
  const urls = flashErRpcUrls();
  let lastError = null;
  for (const rpcUrl of urls) {
    const ctrl = new AbortController();
    const timer = setTimeout(() => ctrl.abort(), SOLANA_RPC_TIMEOUT_MS);
    try {
      // eslint-disable-next-line no-await-in-loop
      return await flashJsonRpcRequest(rpcUrl, label, method, params, ctrl.signal);
    } catch (e) {
      lastError = e;
      console.warn(`[flash] ${label} ER RPC failed on ${redactRpcUrl(rpcUrl)}:`, e?.message || e);
    } finally {
      clearTimeout(timer);
    }
  }
  throw lastError || Object.assign(new Error(`${label} failed: no Flash ER RPC endpoint available`), { status: 503 });
}

async function buildFlashErVersionedTransaction(instructions, signerPk) {
  const latest = await flashErRpcRequestAny('latest blockhash', 'getLatestBlockhash', [
    { commitment: 'confirmed' },
  ]);
  const blockhash = latest?.value?.blockhash || latest?.blockhash;
  if (!blockhash) {
    throw Object.assign(new Error('Flash ER RPC returned no recent blockhash'), { status: 502, data: latest });
  }
  const message = new TransactionMessage({
    payerKey: signerPk,
    recentBlockhash: blockhash,
    instructions,
  }).compileToV0Message();
  const tx = new VersionedTransaction(message);
  return Buffer.from(tx.serialize()).toString('base64');
}

async function buildFlashBaseVersionedTransaction(instructions, payerPk) {
  const latest = await flashSolanaRpcRequest('latest base blockhash', 'getLatestBlockhash', [
    { commitment: 'confirmed' },
  ]);
  const blockhash = latest?.value?.blockhash || latest?.blockhash;
  if (!blockhash) {
    throw Object.assign(new Error('Solana RPC returned no recent blockhash'), { status: 502, data: latest });
  }
  const message = new TransactionMessage({
    payerKey: payerPk,
    recentBlockhash: blockhash,
    instructions,
  }).compileToV0Message();
  const tx = new VersionedTransaction(message);
  return Buffer.from(tx.serialize()).toString('base64');
}

async function getWalletUsdcBalance(owner) {
  if (!isSolanaAddress(owner)) throw Object.assign(new Error('valid Solana owner required'), { status: 400 });
  const accounts = await flashSolanaRpcRequest('wallet USDC balance', 'getTokenAccountsByOwner', [
    owner,
    { mint: FLASH_USDC_MINT },
    { encoding: 'jsonParsed', commitment: 'confirmed' },
  ]);
  return (Array.isArray(accounts?.value) ? accounts.value : []).reduce((sum, row) => {
    const amount = Number(row?.account?.data?.parsed?.info?.tokenAmount?.uiAmount || 0);
    return sum + (Number.isFinite(amount) ? amount : 0);
  }, 0);
}

async function request(path, options = {}) {
  const method = String(options.method || 'GET').toUpperCase();
  const key = `${method}:${path}:${method === 'GET' ? '' : JSON.stringify(options.body || {})}`;
  const now = Date.now();
  if (method === 'GET') {
    const cached = cache.get(key);
    if (cached && now - cached.at < PUBLIC_CACHE_TTL_MS) return cached.data;
  }
  const ctrl = new AbortController();
  const timer = setTimeout(() => ctrl.abort(), REQUEST_TIMEOUT_MS);
  try {
    const res = await fetch(`${FLASH_API}${path}`, {
      method,
      signal: ctrl.signal,
      headers: {
        accept: 'application/json',
        'content-type': 'application/json',
        'user-agent': 'ClashOfPerps/1.0 flash',
      },
      body: method === 'GET' ? undefined : JSON.stringify(options.body || {}),
    });
    const text = await res.text();
    let data = null;
    try { data = text ? JSON.parse(text) : null; } catch { data = text; }
    if (!res.ok) {
      const err = new Error(data?.err || data?.error || data?.message || `Flash API ${res.status}`);
      err.status = res.status;
      err.data = data;
      throw err;
    }
    if (data?.err) {
      const err = new Error(String(data.err));
      err.status = 400;
      err.data = data;
      throw err;
    }
    if (method === 'GET') cache.set(key, { at: now, data });
    if (cache.size > 250) cache = new Map([...cache.entries()].slice(-150));
    return data;
  } finally {
    clearTimeout(timer);
  }
}

async function requestFirst(paths, options = {}) {
  let lastError = null;
  for (const path of paths) {
    try {
      // eslint-disable-next-line no-await-in-loop
      return await request(path, options);
    } catch (e) {
      lastError = e;
      if (e?.status !== 404) throw e;
    }
  }
  throw lastError || Object.assign(new Error('Flash API endpoint unavailable'), { status: 404 });
}

function flashAccountBuilderPaths(name) {
  return [
    `/transaction-builder/${name}`,
    `/v2/transaction-builder/${name}`,
  ];
}

async function requestProd(path) {
  const key = `GET:${FLASH_PROD_API}${path}`;
  const now = Date.now();
  const cached = cache.get(key);
  if (cached && now - cached.at < PUBLIC_CACHE_TTL_MS) return cached.data;
  const ctrl = new AbortController();
  const timer = setTimeout(() => ctrl.abort(), REQUEST_TIMEOUT_MS);
  try {
    const res = await fetch(`${FLASH_PROD_API}${path}`, {
      method: 'GET',
      signal: ctrl.signal,
      headers: {
        accept: 'application/json',
        'content-type': 'application/json',
        'user-agent': 'ClashOfPerps/1.0 flash-prod-read',
      },
    });
    const text = await res.text();
    let data = null;
    try { data = text ? JSON.parse(text) : null; } catch { data = text; }
    if (!res.ok) {
      const err = new Error(data?.err || data?.error || data?.message || `Flash prod API ${res.status}`);
      err.status = res.status;
      err.data = data;
      throw err;
    }
    cache.set(key, { at: now, data });
    if (cache.size > 250) cache = new Map([...cache.entries()].slice(-150));
    return data;
  } finally {
    clearTimeout(timer);
  }
}

async function requestFlashApp(path) {
  const key = `GET:${FLASH_APP_URL}${path}`;
  const now = Date.now();
  const cached = cache.get(key);
  if (cached && now - cached.at < PUBLIC_CACHE_TTL_MS) return cached.data;
  const ctrl = new AbortController();
  const timer = setTimeout(() => ctrl.abort(), REQUEST_TIMEOUT_MS);
  try {
    const res = await fetch(`${FLASH_APP_URL}${path}`, {
      method: 'GET',
      signal: ctrl.signal,
      redirect: 'follow',
      headers: {
        accept: 'application/json',
        'content-type': 'application/json',
        'user-agent': 'ClashOfPerps/1.0 flash-app-read',
      },
    });
    const text = await res.text();
    let data = null;
    try { data = text ? JSON.parse(text) : null; } catch { data = text; }
    if (!res.ok) {
      const err = new Error(data?.err || data?.error || data?.message || `Flash app API ${res.status}`);
      err.status = res.status;
      err.data = data;
      throw err;
    }
    cache.set(key, { at: now, data });
    if (cache.size > 250) cache = new Map([...cache.entries()].slice(-150));
    return data;
  } finally {
    clearTimeout(timer);
  }
}

function normalizeFlashDepositStats(data) {
  if (!data || typeof data !== 'object') return null;
  const liquid = Number(data.v2LiquidBalanceUsd);
  return {
    has_v2_deposit: data.hasV2Deposit === true,
    has_v2_depositor_record: data.hasV2DepositorRecord === true,
    deposits_usd: numberFromUi(data.v2DepositsUsd),
    withdrawals_usd: numberFromUi(data.v2WithdrawalsUsd),
    net_usd: numberFromUi(data.v2NetUsd),
    liquid_balance_usd: Number.isFinite(liquid) ? Math.max(0, liquid) : null,
    deposit_count: Number.isFinite(Number(data.v2DepositCount)) ? Number(data.v2DepositCount) : null,
    open_position_count: Number.isFinite(Number(data.openPositionCount)) ? Number(data.openPositionCount) : null,
    open_position_collateral_usd: numberFromUi(data.openPositionCollateralUsd),
    active_lp_value_usd: numberFromUi(data.activeLpValueUsd),
    active_lp_net_amount: numberFromUi(data.activeLpNetAmount),
    active_stake_amount: numberFromUi(data.activeStakeAmount),
  };
}

async function getFlashV2DepositStats(owner) {
  if (!isSolanaAddress(owner)) return null;
  const raw = await requestFlashApp(`/api/fstats/v2-deposit/${encodeURIComponent(owner)}`);
  return normalizeFlashDepositStats(raw);
}

function decodeSignedTransaction(rawBase64) {
  const text = String(rawBase64 || '').trim();
  if (!text) throw Object.assign(new Error('rawTransactionBase64 is required'), { status: 400 });
  let bytes;
  try {
    bytes = Buffer.from(text, 'base64');
  } catch {
    throw Object.assign(new Error('rawTransactionBase64 is invalid base64'), { status: 400 });
  }
  if (!bytes.length || bytes.length > 20_000) {
    throw Object.assign(new Error('rawTransactionBase64 has invalid size'), { status: 400 });
  }
  try {
    return { bytes, tx: VersionedTransaction.deserialize(bytes) };
  } catch (e) {
    throw Object.assign(new Error(`signed Flash transaction is not a valid v0 transaction: ${e.message}`), { status: 400 });
  }
}

async function submitSignedTransaction(rawBase64, options = {}) {
  const { bytes, tx } = decodeSignedTransaction(rawBase64);
  const endpoints = options.rpcUrl
    ? [String(options.rpcUrl).trim().replace(/\/+$/, '')]
    : Array.from(new Set([
      ...flashErRpcUrls(),
      ...flashSolanaRpcUrls(),
    ]));
  if (!endpoints.length) throw Object.assign(new Error('Flash RPC endpoint is not configured'), { status: 503 });
  const timeoutMs = Math.max(1000, Math.min(30_000, Number(options.timeoutMs || process.env.FLASH_V2_RPC_TIMEOUT_MS || 18_000)));
  const startedAt = Date.now();
  const errors = [];
  for (const endpoint of endpoints) {
    const ctrl = new AbortController();
    const timer = setTimeout(() => ctrl.abort(), timeoutMs);
    try {
      const res = await fetch(endpoint, {
        method: 'POST',
        signal: ctrl.signal,
        headers: {
          accept: 'application/json',
          'content-type': 'application/json',
          'user-agent': 'ClashOfPerps/1.0 flash-rpc',
        },
        body: JSON.stringify({
          jsonrpc: '2.0',
          id: `flash-${Date.now()}`,
          method: 'sendTransaction',
          params: [
            bytes.toString('base64'),
            {
              encoding: 'base64',
              skipPreflight: options.skipPreflight === true,
              preflightCommitment: options.preflightCommitment || 'confirmed',
              maxRetries: Number.isFinite(Number(options.maxRetries)) ? Number(options.maxRetries) : 3,
            },
          ],
        }),
      });
      const text = await res.text();
      let data = null;
      try { data = text ? JSON.parse(text) : null; } catch { data = text; }
      if (!res.ok || data?.error) {
        const err = data?.error || {};
        const message = err.message || (typeof data === 'string' && data) || `Flash RPC ${res.status}`;
        const error = new Error(message);
        error.status = res.ok ? 502 : res.status;
        error.data = data;
        throw error;
      }
      if (!data?.result) {
        const error = new Error('Flash RPC returned no transaction signature');
        error.status = 502;
        error.data = data;
        throw error;
      }
      return {
        signature: data.result,
        endpoint: redactRpcUrl(endpoint),
        submitted_ms: Date.now() - startedAt,
        tx: {
          version: tx.version,
          required_signatures: tx.message?.header?.numRequiredSignatures || 0,
          static_accounts: tx.message?.staticAccountKeys?.length || 0,
          instructions: tx.message?.compiledInstructions?.length || 0,
          recent_blockhash: tx.message?.recentBlockhash || '',
        },
      };
    } catch (e) {
      if (e?.name === 'AbortError') {
        const error = new Error(`Flash RPC broadcast timed out after ${timeoutMs}ms`);
        error.status = 504;
        errors.push({ endpoint: redactRpcUrl(endpoint), message: error.message, status: error.status });
      } else {
        errors.push({ endpoint: redactRpcUrl(endpoint), message: e.message || String(e), status: e.status || null, data: e.data || null });
      }
    } finally {
      clearTimeout(timer);
    }
  }
  const detail = errors.map(err => `${err.endpoint}: ${err.message}`).join(' | ');
  const error = new Error(detail || 'Flash RPC broadcast failed on all endpoints');
  error.status = errors.find(err => err.status)?.status || 502;
  error.data = { attempts: errors };
  throw error;
}

function normalizeToken(symbol, fallback = 'SOL') {
  return String(symbol || fallback).toUpperCase().replace(/[-/](PERP|USD|USDC)$/i, '').trim();
}

function normalizeSide(side) {
  const s = String(side || '').trim().toUpperCase();
  if (s === 'BID' || s === 'BUY' || s === 'LONG') return 'LONG';
  if (s === 'ASK' || s === 'SELL' || s === 'SHORT') return 'SHORT';
  if (s === 'SWAP') return 'SWAP';
  return s || 'LONG';
}

function flashPublicKey(value, label = 'Flash account') {
  try {
    return new PublicKey(String(value || '').trim());
  } catch {
    throw Object.assign(new Error(`${label} is not a valid Solana address`), { status: 400 });
  }
}

function findFlashReferralAddress(owner, programPk = FLASH_MAIN_PROGRAM_PK) {
  const ownerPk = flashPublicKey(owner, 'Flash referral owner');
  return PublicKey.findProgramAddressSync([
    Buffer.from('referral'),
    ownerPk.toBuffer(),
  ], programPk);
}

function findFlashTokenStakeAddress(owner, programPk = FLASH_MAIN_PROGRAM_PK) {
  const ownerPk = flashPublicKey(owner, 'Flash token stake owner');
  return PublicKey.findProgramAddressSync([
    Buffer.from('token_stake'),
    ownerPk.toBuffer(),
  ], programPk);
}

function flashAccountInfoBuffer(info) {
  const data = info?.value?.data;
  if (Array.isArray(data) && data[0]) return Buffer.from(data[0], data[1] || 'base64');
  if (typeof data === 'string' && data) return Buffer.from(data, 'base64');
  return null;
}

function decodeFlashReferralAccount(buffer, referralAccount) {
  const data = Buffer.from(buffer || []);
  if (data.length < 74) {
    return {
      referral_account: referralAccount,
      is_initialized: null,
      bump: null,
      referer_token_stake_account: null,
      referer_booster_account: null,
      raw_size: data.length,
      decode_warning: 'Flash referral account is smaller than the expected layout',
    };
  }
  return {
    referral_account: referralAccount,
    is_initialized: data[8] === 1,
    bump: data[9],
    referer_token_stake_account: new PublicKey(data.subarray(10, 42)).toBase58(),
    referer_booster_account: new PublicKey(data.subarray(42, 74)).toBase58(),
    raw_size: data.length,
  };
}

async function getFlashReferralCodeInfo(code = FLASH_REFERRAL_CODE) {
  const referralCode = String(code || '').trim();
  if (!referralCode) {
    throw Object.assign(new Error('Flash referral code is not configured'), { status: 503 });
  }
  const payload = await requestProd(`/referral-code/code/${encodeURIComponent(referralCode)}`);
  const walletAddress = String(payload?.walletAddress || payload?.wallet_address || '').trim();
  const tokenStakeAccount = String(payload?.tokenStakeAccount || payload?.token_stake_account || '').trim();
  if (!isSolanaAddress(walletAddress) || !isSolanaAddress(tokenStakeAccount)) {
    throw Object.assign(new Error('Flash referral code returned invalid account data'), {
      status: 502,
      data: payload,
    });
  }
  const derivedTokenStake = findFlashTokenStakeAddress(walletAddress)[0].toBase58();
  return {
    id: payload?.id ?? null,
    code: String(payload?.code || referralCode),
    wallet_address: walletAddress,
    token_stake_account: tokenStakeAccount,
    derived_token_stake_account: derivedTokenStake,
    token_stake_matches_derived: tokenStakeAccount === derivedTokenStake,
    created_at: payload?.createdAt || payload?.created_at || null,
  };
}

async function getFlashReferralTokenStakeStatus(tokenStakeAccount) {
  const address = String(tokenStakeAccount || '').trim();
  if (!isSolanaAddress(address)) return { exists: false, address };
  const info = await flashSolanaRpcRequest('Flash referral token stake', 'getAccountInfo', [
    address,
    { encoding: 'base64', commitment: 'confirmed' },
  ]).catch(e => {
    console.warn('[flash/referral] token stake read failed:', e?.message || e);
    return { _read_error: e?.message || String(e || '') };
  });
  if (info?._read_error) {
    return {
      exists: null,
      address,
      read_error: info._read_error,
    };
  }
  return {
    exists: !!info?.value,
    address,
    owner_program: info?.value?.owner || null,
    lamports: info?.value?.lamports ?? null,
  };
}

async function getUserReferralByAddress(owner) {
  if (!isSolanaAddress(owner)) throw Object.assign(new Error('valid Solana owner required'), { status: 400 });
  const ownerPk = flashPublicKey(owner, 'Flash referral owner');
  const [referralAccount] = findFlashReferralAddress(ownerPk.toBase58());
  const codeInfo = await getFlashReferralCodeInfo();
  const tokenStakeStatus = await getFlashReferralTokenStakeStatus(codeInfo.token_stake_account);
  const info = await flashSolanaRpcRequest('Flash referral account', 'getAccountInfo', [
    referralAccount.toBase58(),
    { encoding: 'base64', commitment: 'confirmed' },
  ]);
  const accountData = flashAccountInfoBuffer(info);
  if (!accountData) {
    return {
      ok: true,
      owner: ownerPk.toBase58(),
      has_referrer: false,
      has_any_referrer: false,
      matches_clash: false,
      referral_account: referralAccount.toBase58(),
      referral_code: codeInfo.code,
      referral_url: FLASH_REFERRAL_URL,
      expected_referer_wallet: codeInfo.wallet_address,
      expected_token_stake_account: codeInfo.token_stake_account,
      expected_token_stake_exists: tokenStakeStatus.exists,
      token_stake_matches_derived: codeInfo.token_stake_matches_derived,
      program_id: FLASH_MAIN_PROGRAM_ID,
    };
  }
  const decoded = decodeFlashReferralAccount(accountData, referralAccount.toBase58());
  const matchesClash = decoded.referer_token_stake_account === codeInfo.token_stake_account;
  return {
    ok: true,
    owner: ownerPk.toBase58(),
    has_referrer: matchesClash,
    has_any_referrer: decoded.is_initialized !== false,
    matches_clash: matchesClash,
    referral_code: codeInfo.code,
    referral_url: FLASH_REFERRAL_URL,
    expected_referer_wallet: codeInfo.wallet_address,
    expected_token_stake_account: codeInfo.token_stake_account,
    expected_token_stake_exists: tokenStakeStatus.exists,
    token_stake_matches_derived: codeInfo.token_stake_matches_derived,
    program_id: FLASH_MAIN_PROGRAM_ID,
    ...decoded,
  };
}

function writeU64Le(value, label = 'u64') {
  const raw = typeof value === 'bigint' ? value : BigInt(value);
  if (raw < 0n || raw > 0xffffffffffffffffn) {
    throw Object.assign(new Error(`${label} is outside u64 range`), { status: 400 });
  }
  const buf = Buffer.alloc(8);
  buf.writeBigUInt64LE(raw);
  return buf;
}

function writeI32Le(value, label = 'i32') {
  const raw = Number(value);
  if (!Number.isInteger(raw) || raw < -2147483648 || raw > 2147483647) {
    throw Object.assign(new Error(`${label} is outside i32 range`), { status: 400 });
  }
  const buf = Buffer.alloc(4);
  buf.writeInt32LE(raw);
  return buf;
}

function encodeFlashOraclePrice(price, exponent) {
  return Buffer.concat([
    writeU64Le(price, 'Flash oracle price'),
    writeI32Le(exponent, 'Flash oracle exponent'),
  ]);
}

function readFlashOraclePrice(buf, offset = 8) {
  if (!Buffer.isBuffer(buf) || buf.length < offset + 12) {
    throw Object.assign(new Error('Flash builder returned malformed oracle price data'), { status: 502 });
  }
  return {
    price: buf.readBigUInt64LE(offset),
    exponent: buf.readInt32LE(offset + 8),
  };
}

function flashPrivilegeByte(value) {
  const n = Number(value || 0);
  if (!Number.isInteger(n) || n < 0 || n > 2) return 0;
  return n;
}

function encodeFlashPricePrivilegeParams(discriminator, params) {
  return Buffer.concat([
    discriminator,
    encodeFlashOraclePrice(params.price, params.exponent),
    Buffer.from([flashPrivilegeByte(params.privilege)]),
  ]);
}

function encodeFlashOpenErParams(params) {
  return Buffer.concat([
    FLASH_ER_DISCRIMINATORS.openPosition,
    encodeFlashOraclePrice(params.price, params.exponent),
    writeU64Le(params.collateralAmount, 'Flash collateral amount'),
    writeU64Le(params.sizeAmount, 'Flash size amount'),
    Buffer.from([flashPrivilegeByte(params.privilege)]),
  ]);
}

function encodeFlashTriggerErParams(params) {
  return Buffer.concat([
    FLASH_ER_DISCRIMINATORS.placeTriggerOrder,
    encodeFlashOraclePrice(params.price, params.exponent),
    writeU64Le(params.deltaSizeAmount, 'Flash trigger size amount'),
    Buffer.from([params.isStopLoss ? 1 : 0]),
  ]);
}

function encodeFlashLimitErParams(params) {
  return Buffer.concat([
    FLASH_ER_DISCRIMINATORS.placeLimitOrder,
    encodeFlashOraclePrice(params.limitPrice, params.limitExponent),
    writeU64Le(params.reserveAmount, 'Flash reserve amount'),
    writeU64Le(params.sizeAmount, 'Flash limit size amount'),
    encodeFlashOraclePrice(params.stopLossPrice || 0n, params.stopLossExponent || 0),
    encodeFlashOraclePrice(params.takeProfitPrice || 0n, params.takeProfitExponent || 0),
  ]);
}

function encodeFlashCancelTriggerErParams(params) {
  return Buffer.concat([
    FLASH_ER_DISCRIMINATORS.cancelTriggerOrder,
    flashPublicKey(params.market, 'Flash market').toBuffer(),
    Buffer.from([Number(params.orderId) & 0xff, params.isStopLoss ? 1 : 0]),
  ]);
}

function encodeFlashCancelLimitErParams(params) {
  return Buffer.concat([
    FLASH_ER_DISCRIMINATORS.cancelLimitOrder,
    flashPublicKey(params.market, 'Flash market').toBuffer(),
    Buffer.from([Number(params.orderId) & 0xff]),
  ]);
}

function flashInstructionDiscriminator(data) {
  const buf = Buffer.from(data || []);
  return buf.length >= 8 ? buf.subarray(0, 8).toString('hex') : '';
}

function parseLegacyOpenParams(data) {
  const buf = Buffer.from(data || []);
  if (buf.length < 37) {
    throw Object.assign(new Error('Flash open builder returned malformed instruction data'), { status: 502 });
  }
  const price = readFlashOraclePrice(buf, 8);
  return {
    ...price,
    collateralAmount: buf.readBigUInt64LE(20),
    sizeAmount: buf.readBigUInt64LE(28),
    privilege: buf[36] || 0,
  };
}

function parseLegacyPricePrivilegeParams(data, label = 'Flash builder') {
  const buf = Buffer.from(data || []);
  if (buf.length < 21) {
    throw Object.assign(new Error(`${label} returned malformed instruction data`), { status: 502 });
  }
  return {
    ...readFlashOraclePrice(buf, 8),
    privilege: buf[20] || 0,
  };
}

function parseLegacyTriggerParams(data) {
  const buf = Buffer.from(data || []);
  if (buf.length < 29) {
    throw Object.assign(new Error('Flash trigger builder returned malformed instruction data'), { status: 502 });
  }
  return {
    ...readFlashOraclePrice(buf, 8),
    deltaSizeAmount: buf.readBigUInt64LE(20),
    isStopLoss: buf[28] === 1,
  };
}

function parseLegacyLimitParams(data) {
  const buf = Buffer.from(data || []);
  if (buf.length < 60) {
    throw Object.assign(new Error('Flash limit builder returned malformed instruction data'), { status: 502 });
  }
  const limit = readFlashOraclePrice(buf, 8);
  const stopLoss = readFlashOraclePrice(buf, 36);
  const takeProfit = readFlashOraclePrice(buf, 48);
  return {
    limitPrice: limit.price,
    limitExponent: limit.exponent,
    reserveAmount: buf.readBigUInt64LE(20),
    sizeAmount: buf.readBigUInt64LE(28),
    stopLossPrice: stopLoss.price,
    stopLossExponent: stopLoss.exponent,
    takeProfitPrice: takeProfit.price,
    takeProfitExponent: takeProfit.exponent,
  };
}

function parseUiAmountToRaw(value, decimals, label = 'amount') {
  const text = String(value ?? '').trim().replace(/,/g, '.');
  if (!/^\d+(?:\.\d+)?$/.test(text)) {
    throw Object.assign(new Error(`${label} must be a positive decimal amount`), { status: 400 });
  }
  const [wholeRaw, fractionRaw = ''] = text.split('.');
  if (fractionRaw.length > decimals) {
    throw Object.assign(new Error(`${label} supports at most ${decimals} decimals`), { status: 400 });
  }
  const whole = BigInt(wholeRaw || '0');
  const fraction = BigInt((fractionRaw + '0'.repeat(decimals)).slice(0, decimals) || '0');
  const scale = 10n ** BigInt(decimals);
  const raw = whole * scale + fraction;
  if (raw <= 0n) throw Object.assign(new Error(`${label} must be positive`), { status: 400 });
  return raw;
}

function flashPda(seed) {
  return PublicKey.findProgramAddressSync([Buffer.from(seed)], FLASH_MAIN_PROGRAM_PK)[0];
}

function flashPdaWithKey(seed, key, program = FLASH_MAIN_PROGRAM_PK) {
  return PublicKey.findProgramAddressSync([
    Buffer.from(seed),
    flashPublicKey(key, `Flash ${seed} PDA key`).toBuffer(),
  ], program)[0];
}

function flashMainAccountContext(owner) {
  const ownerPk = flashPublicKey(owner, 'Flash owner');
  const [basket] = findBasketAddress(ownerPk, FLASH_MAIN_PROGRAM_PK);
  const [userDepositLedger] = findUserDepositLedgerAddress(ownerPk, FLASH_MAIN_PROGRAM_PK);
  return {
    ownerPk,
    basket,
    userDepositLedger,
    perpetuals: flashPda('perpetuals'),
    eventAuthority: flashPda('__event_authority'),
    program: FLASH_MAIN_PROGRAM_PK,
  };
}

function flashSignerContext(owner, body = {}) {
  const ownerPk = flashPublicKey(owner, 'Flash owner');
  const signer = String(body.signer || body.sessionSigner || body.session_signer || '').trim();
  const sessionToken = String(body.sessionToken || body.session_token || '').trim();
  if (signer || sessionToken) {
    if (!isSolanaAddress(signer) || !isSolanaAddress(sessionToken)) {
      throw Object.assign(new Error('valid signer and sessionToken are required for Flash one tap trading'), { status: 400 });
    }
    return {
      ownerPk,
      signerPk: flashPublicKey(signer, 'Flash session signer'),
      sessionTokenPk: flashPublicKey(sessionToken, 'Flash session token'),
      hasSession: true,
    };
  }
  return {
    ownerPk,
    signerPk: ownerPk,
    // Anchor optional account placeholder. Omitting it shifts account order.
    sessionTokenPk: FLASH_MAIN_PROGRAM_PK,
    hasSession: false,
  };
}

function flashMeta(pubkey, isSigner = false, isWritable = false) {
  return { pubkey, isSigner, isWritable };
}

function applyTradingSessionPayload(payload, body) {
  const signer = String(body.signer || body.sessionSigner || body.session_signer || '').trim();
  const sessionToken = String(body.sessionToken || body.session_token || '').trim();
  if (signer || sessionToken) {
    if (!isSolanaAddress(signer) || !isSolanaAddress(sessionToken)) {
      throw Object.assign(new Error('valid signer and sessionToken are required for Flash one tap trading'), { status: 400 });
    }
    payload.signer = signer;
    payload.sessionToken = sessionToken;
  }
  return payload;
}

async function getHealth() {
  return request('/health');
}

async function getTokens() {
  return request('/tokens');
}

async function getRawCustodies() {
  return request('/raw/custodies');
}

async function getPrices() {
  const [prices, fundingRates] = await Promise.all([
    request('/prices'),
    getFundingRates().catch(e => {
      console.warn('[flash] funding rates unavailable:', e?.message || e);
      return new Map();
    }),
  ]);
  return Object.entries(prices || {}).map(([symbol, row]) => ({
    symbol,
    price: Number(row?.priceUi ?? row?.price_ui ?? 0),
    price_ui: row?.priceUi ?? row?.price_ui,
    raw_price: row?.price,
    exponent: row?.exponent,
    timestamp_us: row?.timestampUs ?? row?.timestamp_us,
    market_session: row?.marketSession,
    funding_rate: fundingRates.get(symbol)?.hourlyRate ?? 0,
    funding_rate_raw: fundingRates.get(symbol)?.rawRate ?? null,
    funding_rate_source: fundingRates.has(symbol) ? 'flash_raw_custody_borrow_rate' : null,
  }));
}

async function getMarketInfo() {
  const [tokens, prices, custodies] = await Promise.allSettled([getTokens(), getPrices(), getRawCustodies()]);
  const priceMap = new Map((prices.status === 'fulfilled' ? prices.value : []).map(p => [p.symbol, p]));
  const custodyByMint = new Map((custodies.status === 'fulfilled' && Array.isArray(custodies.value) ? custodies.value : [])
    .map(row => [String(row?.account?.tokenMint || row?.tokenMint || '').trim(), row?.account || row])
    .filter(([mint]) => mint));
  return (tokens.status === 'fulfilled' && Array.isArray(tokens.value) ? tokens.value : []).map(t => {
    const symbol = normalizeToken(t.symbol);
    const price = priceMap.get(symbol) || {};
    const custody = custodyByMint.get(String(t.mintKey || '').trim()) || {};
    const pricing = custody.pricing || {};
    const maxInitialLeverage = flashLeverageFromRaw(pricing.maxInitialLeverage);
    const maxMaintenanceLeverage = flashLeverageFromRaw(pricing.maxLeverage);
    const minInitialLeverage = flashLeverageFromRaw(pricing.minInitialLeverage);
    const minCollateralUsd = flashUsdFromRaw(pricing.minCollateralUsd);
    const marketSession = normalizeFlashSession(price.market_session);
    const tradeInitAllowed = custody.permissions?.tradeInit !== false && t.permissions?.tradeInit !== false;
    const sessionOpen = flashSessionAllowsTrade(marketSession);
    return {
      symbol,
      name: symbol,
      base: symbol,
      quote: 'USDC',
      price: price.price || 0,
      funding_rate: price.funding_rate || 0,
      funding_rate_raw: price.funding_rate_raw ?? null,
      funding_rate_source: price.funding_rate_source || null,
      funding_label: 'MARGIN/h',
      max_leverage: maxInitialLeverage ? Math.min(100, maxInitialLeverage) : 100,
      max_initial_leverage: maxInitialLeverage,
      max_maintenance_leverage: maxMaintenanceLeverage,
      min_initial_leverage: minInitialLeverage,
      min_collateral_usd: minCollateralUsd,
      min_order_size: 1,
      tick_size: symbol === 'BTC' ? '0.1' : '0.01',
      market_session: marketSession || null,
      market_status: marketSession ? flashSessionLabel(marketSession) : 'open',
      trade_init_allowed: tradeInitAllowed,
      is_market_open: sessionOpen && tradeInitAllowed,
      token: t,
      source: 'flash_main',
    };
  });
}

async function assertFlashMarketCanOpen(symbol, leverage) {
  const wantedSymbol = normalizeToken(symbol);
  const markets = await getMarketInfo();
  const market = markets.find(row => row.symbol === wantedSymbol);
  if (!market) return;
  if (market.is_market_open === false) {
    const reason = market.trade_init_allowed === false
      ? 'new positions are disabled'
      : `market session is ${market.market_status || flashSessionLabel(market.market_session)}`;
    throw Object.assign(new Error(`${wantedSymbol} is not open for Flash trading right now (${reason}).`), {
      status: 400,
      data: { symbol: wantedSymbol, market_session: market.market_session, market_status: market.market_status },
    });
  }
  const maxInitial = Number(market.max_initial_leverage || market.max_leverage || 0);
  const requestedLeverage = Number(leverage || 1);
  if (Number.isFinite(maxInitial) && maxInitial > 0 && Number.isFinite(requestedLeverage) && requestedLeverage > maxInitial + 1e-9) {
    throw Object.assign(new Error(`${wantedSymbol} max initial leverage on Flash is ${maxInitial}x. Lower leverage and retry.`), {
      status: 400,
      data: { symbol: wantedSymbol, requested_leverage: requestedLeverage, max_initial_leverage: maxInitial },
    });
  }
}

async function getFundingRates() {
  const [tokens, custodies] = await Promise.all([
    getTokens(),
    request('/raw/custodies'),
  ]);
  const symbolByMint = new Map((Array.isArray(tokens) ? tokens : [])
    .map(t => [String(t?.mintKey || '').trim(), normalizeToken(t?.symbol, '')])
    .filter(([mint, symbol]) => mint && symbol));
  const rates = new Map();
  for (const row of Array.isArray(custodies) ? custodies : []) {
    const account = row?.account || row;
    const symbol = symbolByMint.get(String(account?.tokenMint || '').trim());
    if (!symbol) continue;
    const rawRate = Number(account?.borrowRateState?.currentRate ?? 0);
    if (!Number.isFinite(rawRate)) continue;
    // Flash custody borrow rates are fixed-point hourly rates. 1e9 maps the
    // raw value to a decimal fraction, so 20_000 -> 0.0020% per hour.
    const hourlyRate = rawRate / 1_000_000_000;
    rates.set(symbol, {
      rawRate,
      hourlyRate: Number.isFinite(hourlyRate) ? hourlyRate : 0,
      custody: row?.pubkey || '',
    });
  }
  return rates;
}

async function getRawMarkets() {
  return request('/raw/markets');
}

async function getFlashV2MarketHints() {
  const [markets, custodies, tokens] = await Promise.all([
    getRawMarkets(),
    getRawCustodies(),
    getTokens(),
  ]);
  const custodyToSymbol = new Map();
  const symbolByMint = new Map((Array.isArray(tokens) ? tokens : [])
    .map(t => [String(t?.mintKey || '').trim(), normalizeToken(t?.symbol, '')])
    .filter(([mint, symbol]) => mint && symbol));
  const hints = new Map();
  for (const row of Array.isArray(custodies) ? custodies : []) {
    const account = row?.account || row;
    const pubkey = String(row?.pubkey || account?.pubkey || '').trim();
    const symbol = symbolByMint.get(String(account?.tokenMint || '').trim());
    if (pubkey && symbol) custodyToSymbol.set(pubkey, symbol);
    if (symbol) {
      for (const market of Array.isArray(account?.supportedMarkets) ? account.supportedMarkets : []) {
        const marketKey = String(market || '').trim();
        if (!marketKey || hints.has(marketKey)) continue;
        hints.set(marketKey, {
          market: marketKey,
          symbol,
          source: 'flash_v2_custody_supported_markets',
        });
      }
    }
  }
  for (const row of Array.isArray(markets) ? markets : []) {
    const account = row?.account || row;
    const market = String(row?.pubkey || account?.pubkey || '').trim();
    if (!market) continue;
    const targetCustody = String(account?.targetCustody || account?.target_custody || '').trim();
    const symbol = custodyToSymbol.get(targetCustody) || '';
    hints.set(market, {
      market,
      symbol,
      side: normalizeSide(account?.side),
      source: 'flash_v2_raw_markets',
    });
  }
  return hints;
}

function flashRawCustodySymbol(account, symbolByMint) {
  const mint = String(account?.mint || account?.tokenMint || account?.mintKey || '').trim();
  return symbolByMint.get(mint) || '';
}

async function getFlashMainMarketContext(options = {}) {
  const symbol = normalizeToken(options.symbol || options.marketSymbol || options.outputTokenSymbol || 'SOL');
  const side = normalizeSide(options.side || options.tradeType || 'LONG');
  const marketPubkey = String(options.marketPubkey || options.market || '').trim();
  const receivingSymbol = normalizeToken(options.receivingSymbol || options.inputTokenSymbol || options.withdrawTokenSymbol || 'USDC', 'USDC');
  const [tokens, custodies, markets] = await Promise.all([
    getTokens(),
    getRawCustodies(),
    getRawMarkets(),
  ]);
  const symbolByMint = new Map((Array.isArray(tokens) ? tokens : [])
    .map(t => [String(t?.mintKey || '').trim(), normalizeToken(t?.symbol, '')])
    .filter(([mint, sym]) => mint && sym));
  const custodiesByAccount = new Map();
  const custodyRows = [];
  for (const row of Array.isArray(custodies) ? custodies : []) {
    const account = row?.account || row;
    const pubkey = String(row?.pubkey || account?.pubkey || account?.custodyAccount || '').trim();
    if (!pubkey) continue;
    const custody = {
      pubkey,
      symbol: flashRawCustodySymbol(account, symbolByMint),
      pool: String(account?.pool || '').trim(),
      mint: String(account?.mint || account?.tokenMint || account?.mintKey || '').trim(),
      tokenAccount: String(account?.token_account || account?.tokenAccount || '').trim(),
      oracle: String(account?.oracle?.int_oracle_account || account?.intOracleAddress || account?.oracleAccount || '').trim(),
      extOracle: String(account?.oracle?.ext_oracle_account || account?.extOracleAddress || account?.erOracleAccount || '').trim(),
      uid: account?.uid ?? account?.custodyId ?? null,
      decimals: Number(account?.decimals),
      raw: account,
    };
    custodiesByAccount.set(pubkey, custody);
    custodyRows.push(custody);
  }
  const marketRows = (Array.isArray(markets) ? markets : []).map(row => {
    const account = row?.account || row;
    const market = {
      pubkey: String(row?.pubkey || account?.pubkey || account?.marketAccount || '').trim(),
      pool: String(account?.pool || '').trim(),
      targetCustody: String(account?.target_custody || account?.targetCustody || '').trim(),
      lockCustody: String(account?.collateral_custody || account?.collateralCustody || '').trim(),
      side: normalizeSide(account?.side),
      raw: account,
    };
    market.target = custodiesByAccount.get(market.targetCustody) || null;
    market.lock = custodiesByAccount.get(market.lockCustody) || null;
    return market;
  }).filter(m => m.pubkey && m.target && m.lock);

  let market = null;
  if (marketPubkey) {
    market = marketRows.find(row => row.pubkey === marketPubkey) || null;
  }
  if (!market) {
    const candidates = marketRows.filter(row => row.side === side && row.target?.symbol === symbol);
    market = candidates.find(row => custodyRows.some(c => c.pool === row.pool && c.symbol === receivingSymbol))
      || candidates[0]
      || null;
  }
  if (!market) {
    throw Object.assign(new Error(`Flash market is not available for ${symbol} ${side}`), { status: 400 });
  }
  const receiving = custodyRows.find(c => c.pool === market.pool && c.symbol === receivingSymbol)
    || (receivingSymbol === market.lock?.symbol ? market.lock : null)
    || (receivingSymbol === market.target?.symbol ? market.target : null);
  if (!receiving) {
    throw Object.assign(new Error(`Flash ${receivingSymbol} custody is not available in ${market.target?.symbol || symbol} pool`), { status: 400 });
  }
  for (const [label, custody] of [['target', market.target], ['lock', market.lock], ['receiving', receiving]]) {
    if (!custody?.oracle || !isSolanaAddress(custody.oracle)) {
      throw Object.assign(new Error(`Flash ${label} oracle is missing for ${market.target?.symbol || symbol}`), { status: 502 });
    }
  }
  return {
    symbol: market.target?.symbol || symbol,
    side: market.side,
    market,
    pool: market.pool,
    target: market.target,
    lock: market.lock,
    receiving,
  };
}

async function getFlashProdMarketHints() {
  const [volumeRows, statRows] = await Promise.all([
    requestProd('/market-stat/volume-24hr?source=all&program=flash'),
    requestProd('/market-stat/24hr?source=all&program=flash'),
  ]);
  const statsByVolume = new Map();
  for (const row of Array.isArray(statRows) ? statRows : []) {
    const symbol = normalizeToken(row?.token, '');
    const volume = Number(row?.volume24h);
    if (!symbol || !Number.isFinite(volume)) continue;
    const key = Math.round(volume * 100);
    const list = statsByVolume.get(key) || [];
    list.push({ symbol, volume });
    statsByVolume.set(key, list);
  }
  const hints = new Map();
  for (const row of Array.isArray(volumeRows) ? volumeRows : []) {
    const market = String(row?.market || '').trim();
    const totalSizeUsd = Number(row?.totalSizeUsd);
    if (!market || !Number.isFinite(totalSizeUsd)) continue;
    const volume = totalSizeUsd / 1_000_000;
    const key = Math.round(volume * 100);
    const candidates = (statsByVolume.get(key) || [])
      .filter(item => Math.abs(item.volume - volume) < 0.02);
    if (candidates.length === 1) {
      hints.set(market, {
        market,
        symbol: candidates[0].symbol,
        source: 'flash_prod_market_stats',
      });
    }
  }
  return hints;
}

function inferFlashHistorySymbol(row = {}, tokens = []) {
  const entry = rawPriceToUi(
    row.entryPrice ?? row.oracleAccountPrice ?? row.exitPrice,
    row.entryPriceExponent ?? row.oracleAccountPriceExponent ?? row.exitPriceExponent,
  );
  const sizeUsd = rawTokenAmountToUi(row.sizeUsd ?? row.deltaSizeUsd ?? row.finalSizeUsd, FLASH_USDC_DECIMALS);
  const sizeRaw = rawAmount(row.sizeAmount ?? row.deltaSizeAmount ?? row.finalSizeAmount);
  if (!(entry > 0) || !(sizeUsd > 0) || !(sizeRaw > 0n)) return '';
  const expectedAmount = sizeUsd / entry;
  if (!(expectedAmount > 0)) return '';
  let best = null;
  for (const token of Array.isArray(tokens) ? tokens : []) {
    const symbol = normalizeToken(token?.symbol, '');
    const decimals = Number(token?.decimals);
    if (!symbol || symbol === 'USDC' || !Number.isFinite(decimals) || decimals < 0 || decimals > 12) continue;
    const amountUi = rawTokenAmountToUi(sizeRaw, decimals);
    if (!(amountUi > 0)) continue;
    const relError = Math.abs(amountUi - expectedAmount) / Math.max(expectedAmount, 1e-12);
    if (!best || relError < best.relError) best = { symbol, relError };
  }
  return best && best.relError <= 0.001 ? best.symbol : '';
}

async function getFlashHistoryMarketHints(owner) {
  if (!isSolanaAddress(owner)) return new Map();
  const params = new URLSearchParams({
    page: '1',
    take: '50',
    source: 'all',
    program: 'flash',
    order: 'DESC',
    timestamp: String(Math.floor(Date.now() / 1000) - 7 * 24 * 60 * 60),
  });
  const [data, tokens] = await Promise.all([
    requestProd(`/trading-history-v2/find-all-by-user-v4/${encodeURIComponent(owner)}?${params.toString()}`),
    getTokens().catch(() => []),
  ]);
  const hints = new Map();
  for (const row of Array.isArray(data?.data) ? data.data : []) {
    const market = String(row?.market || '').trim();
    if (!market || hints.has(market)) continue;
    const side = normalizeSide(row?.side);
    const symbol = inferFlashHistorySymbol(row, tokens);
    hints.set(market, {
      market,
      symbol,
      side,
      source: 'flash_prod_trade_history',
      last_trade_type: row?.tradeType || row?.trade_type || null,
      last_trade_timestamp: Number(row?.timestamp || 0) || null,
    });
  }
  return hints;
}

async function getFlashMarketHints(owner) {
  const [v2, prod, history] = await Promise.all([
    getFlashV2MarketHints().catch(e => {
      console.warn('[flash] v2 market hints unavailable:', e?.message || e);
      return new Map();
    }),
    getFlashProdMarketHints().catch(e => {
      console.warn('[flash] prod market hints unavailable:', e?.message || e);
      return new Map();
    }),
    getFlashHistoryMarketHints(owner).catch(e => {
      console.warn('[flash] trade history market hints unavailable:', e?.message || e);
      return new Map();
    }),
  ]);
  const merged = new Map();
  for (const source of [v2, prod, history]) {
    for (const [market, hint] of source.entries()) {
      merged.set(market, {
        ...(merged.get(market) || {}),
        ...hint,
        symbol: hint.symbol || merged.get(market)?.symbol || '',
        side: hint.side || merged.get(market)?.side || '',
      });
    }
  }
  return merged;
}

async function getPositionsByAddress(owner, includePnlInLeverageDisplay = true) {
  if (!isSolanaAddress(owner)) throw Object.assign(new Error('valid Solana owner required'), { status: 400 });
  const snapshot = await getOwnerSnapshot(owner);
  return snapshot.positions;
}

async function getOrdersByAddress(owner) {
  if (!isSolanaAddress(owner)) throw Object.assign(new Error('valid Solana owner required'), { status: 400 });
  const snapshot = await getOwnerSnapshot(owner);
  return snapshot.orders;
}

function metricSide(side) {
  const s = String(side || '').trim().toUpperCase();
  if (s === 'SHORT' || s === 'ASK' || s === 'SELL') return 'SHORT';
  return 'LONG';
}

function numberFromUi(value) {
  const n = Number(value);
  return Number.isFinite(n) ? n : 0;
}

function isDustMetric(metric = {}) {
  const sizeUsd = numberFromUi(metric.sizeUsdUi ?? metric.size_usd_ui ?? metric.sizeUsd ?? metric.size_usd);
  const collateralUsd = numberFromUi(metric.collateralUsdUi ?? metric.collateral_usd_ui ?? metric.collateralUsd ?? metric.collateral_usd);
  const amount = numberFromUi(metric.sizeAmountUi ?? metric.size_amount_ui ?? metric.amount);
  return sizeUsd > 0
    && sizeUsd < FLASH_DUST_POSITION_USD
    && collateralUsd <= FLASH_DUST_COLLATERAL_USD
    && amount <= 0.000001;
}

function isDustPosition(pos = {}) {
  return !!pos?._flashDust || isDustMetric(pos?.metric || pos);
}

function accountDiscriminator(name) {
  return crypto.createHash('sha256').update(`account:${name}`).digest().subarray(0, 8);
}

function bs58Encode(bytes) {
  const mod = bs58.encode ? bs58 : bs58.default;
  return mod.encode(bytes);
}

function rawTokenAmountToUi(raw, decimals = FLASH_USDC_DECIMALS) {
  const value = typeof raw === 'bigint' ? raw : BigInt(String(raw || 0));
  const scale = 10n ** BigInt(decimals);
  const whole = value / scale;
  const fraction = value % scale;
  return Number(whole) + (Number(fraction) / Number(scale));
}

function rawPriceToUi(raw, exponent) {
  const value = Number(raw);
  const exp = Number(exponent);
  if (!Number.isFinite(value) || !Number.isFinite(exp)) return 0;
  return value * Math.pow(10, exp);
}

function rawAmount(value) {
  if (typeof value === 'bigint') return value;
  if (typeof value === 'number' && Number.isFinite(value)) return BigInt(Math.trunc(value));
  const text = String(value ?? '').trim();
  return /^\d+$/.test(text) ? BigInt(text) : 0n;
}

function sumRawMint(entries = [], mint = FLASH_USDC_MINT) {
  const target = String(mint);
  return (Array.isArray(entries) ? entries : []).reduce((sum, entry) => (
    String(entry?.mint || '') === target ? sum + rawAmount(entry?.amount) : sum
  ), 0n);
}

function readPubkey(bytes, offset) {
  if (offset + 32 > bytes.length) throw new Error('Flash account data is truncated while reading pubkey');
  return new PublicKey(bytes.subarray(offset, offset + 32)).toBase58();
}

function readI64(bytes, offset) {
  if (offset + 8 > bytes.length) throw new Error('Flash account data is truncated while reading i64');
  return bytes.readBigInt64LE(offset);
}

function readU64(bytes, offset) {
  if (offset + 8 > bytes.length) throw new Error('Flash account data is truncated while reading u64');
  return bytes.readBigUInt64LE(offset);
}

function readOraclePrice(bytes, offset) {
  const price = readU64(bytes, offset);
  if (offset + 12 > bytes.length) throw new Error('Flash account data is truncated while reading oracle price');
  const exponent = bytes.readInt32LE(offset + 8);
  return {
    price,
    exponent,
    ui: Number(price) * Math.pow(10, exponent),
  };
}

function readFlashVector(bytes, offset, reader) {
  if (offset + 4 > bytes.length) throw new Error('Flash account data is truncated while reading vector length');
  const length = bytes.readUInt32LE(offset);
  let cursor = offset + 4;
  const rows = [];
  for (let i = 0; i < length; i += 1) {
    const read = reader(bytes, cursor);
    rows.push(read.value);
    cursor = read.offset;
  }
  return { value: rows, offset: cursor };
}

function readFlashLedger(bytes, offset) {
  return {
    value: {
      mint: readPubkey(bytes, offset),
      amount: readU64(bytes, offset + 32),
    },
    offset: offset + 40,
  };
}

function readFlashPositionMeta(bytes, offset) {
  const startOffset = offset;
  const metaMarket = readPubkey(bytes, offset);
  offset += 32;
  const owner = readPubkey(bytes, offset);
  offset += 32;
  const market = readPubkey(bytes, offset);
  offset += 32;
  const delegate = readPubkey(bytes, offset);
  offset += 32;
  const openTime = readI64(bytes, offset);
  offset += 8;
  const updateTime = readI64(bytes, offset);
  offset += 8;
  const entryPrice = readOraclePrice(bytes, offset);
  offset += 12;
  const sizeAmount = readU64(bytes, offset);
  offset += 8;
  const sizeUsd = readU64(bytes, offset);
  offset += 8;
  const lockedAmount = readU64(bytes, offset);
  offset += 8;
  const lockedUsd = readU64(bytes, offset);
  offset += 8;
  const priceImpactUsd = readU64(bytes, offset);
  offset += 8;
  const collateralUsd = readU64(bytes, offset);
  offset += 8;
  const unsettledValueUsd = readU64(bytes, offset);
  offset += 8;
  const unsettledFeesUsd = readU64(bytes, offset);
  offset += 8;
  const cumulativeLockFeeSnapshotLo = readU64(bytes, offset);
  const cumulativeLockFeeSnapshotHi = readU64(bytes, offset + 8);
  offset += 16;
  const degenSizeUsd = readU64(bytes, offset);
  offset += 8;
  const referencePrice = readOraclePrice(bytes, offset);
  offset += 12;
  if (offset + 17 > bytes.length) throw new Error('Flash account data is truncated while reading position flags');
  const isActive = bytes[offset] !== 0;
  offset += 1;
  const buffer = Array.from(bytes.subarray(offset, offset + 2));
  offset += 2;
  const priceImpactSet = bytes[offset];
  offset += 1;
  const sizeDecimals = bytes[offset];
  offset += 1;
  const lockedDecimals = bytes[offset];
  offset += 1;
  const collateralDecimals = bytes[offset];
  offset += 1;
  const bump = bytes[offset];
  offset += 1;
  const migrateFlag = bytes[offset] !== 0;
  offset += 1;
  const padding = Array.from(bytes.subarray(offset, offset + 7));
  offset += 7;
  return {
    value: {
      meta_market: metaMarket,
      market,
      owner,
      delegate,
      open_time: Number(openTime),
      update_time: Number(updateTime),
      entry_price: entryPrice,
      reference_price: referencePrice,
      size_amount: sizeAmount,
      size_usd: sizeUsd,
      locked_amount: lockedAmount,
      locked_usd: lockedUsd,
      price_impact_usd: priceImpactUsd,
      collateral_usd: collateralUsd,
      unsettled_value_usd: unsettledValueUsd,
      unsettled_fees_usd: unsettledFeesUsd,
      cumulative_lock_fee_snapshot: (cumulativeLockFeeSnapshotHi << 64n) + cumulativeLockFeeSnapshotLo,
      degen_size_usd: degenSizeUsd,
      is_active: isActive,
      buffer,
      price_impact_set: priceImpactSet,
      size_decimals: sizeDecimals,
      locked_decimals: lockedDecimals,
      collateral_decimals: collateralDecimals,
      bump,
      migrate_flag: migrateFlag,
      padding,
      bytes: offset - startOffset,
    },
    offset,
  };
}

function decodeFlashBasket(data, expectedOwner = '') {
  const bytes = Buffer.from(data || []);
  const discriminator = accountDiscriminator('Basket');
  if (bytes.length < 92 || !bytes.subarray(0, 8).equals(discriminator)) {
    throw new Error('Flash basket account has invalid layout');
  }
  let offset = 8;
  const owner = readPubkey(bytes, offset);
  offset += 32;
  if (expectedOwner && owner !== expectedOwner) {
    throw new Error('Flash basket owner mismatch');
  }
  const delegate = readPubkey(bytes, offset);
  offset += 32;
  const basketBump = bytes[offset];
  offset += 1;
  const padding = Array.from(bytes.subarray(offset, offset + 5));
  offset += 5;
  const positionsActive = bytes[offset] !== 0;
  offset += 1;
  const ordersActive = bytes[offset] !== 0;
  offset += 1;
  const debits = readFlashVector(bytes, offset, readFlashLedger);
  offset = debits.offset;
  const pendingCredits = readFlashVector(bytes, offset, readFlashLedger);
  offset = pendingCredits.offset;
  const positions = readFlashVector(bytes, offset, readFlashPositionMeta);
  offset = positions.offset;
  let ordersCount = null;
  if (offset + 4 <= bytes.length) {
    ordersCount = bytes.readUInt32LE(offset);
  }
  return {
    owner,
    delegate,
    basket_bump: basketBump,
    padding,
    positions_active: positionsActive,
    orders_active: ordersActive,
    debits: debits.value,
    pending_credits: pendingCredits.value,
    positions: positions.value,
    orders_count: ordersCount,
    decoded_offset: offset,
    account_size: bytes.length,
  };
}

function isFlashBasketLayoutDecodeError(error) {
  return /Flash (basket )?account (data is truncated|has invalid layout|owner mismatch)/i.test(String(error?.message || error || ''));
}

function decodeUserDepositLedger(data, expectedOwner = '') {
  const bytes = Buffer.from(data || []);
  const discriminator = accountDiscriminator('UserDepositLedger');
  if (bytes.length < 52 || !bytes.subarray(0, 8).equals(discriminator)) {
    throw new Error('Flash user deposit ledger account has invalid layout');
  }
  const owner = new PublicKey(bytes.subarray(16, 48)).toBase58();
  if (expectedOwner && owner !== expectedOwner) {
    throw new Error('Flash user deposit ledger owner mismatch');
  }
  const depositsLen = bytes.readUInt32LE(48);
  const deposits = [];
  let offset = 52;
  for (let i = 0; i < depositsLen; i += 1) {
    if (offset + 40 > bytes.length) throw new Error('Flash user deposit ledger is truncated');
    deposits.push({
      mint: new PublicKey(bytes.subarray(offset, offset + 32)).toBase58(),
      amount: bytes.readBigUInt64LE(offset + 32),
    });
    offset += 40;
  }
  return { owner, deposits };
}

async function readFlashLedgerFromRpc(rpcUrl, owner, ledgerPubkey, signal, programId = FLASH_V2_PROGRAM_ID) {
  const discriminator = bs58Encode(accountDiscriminator('UserDepositLedger'));
  const gpa = await flashJsonRpcRequest(rpcUrl, 'Flash user deposit ledger', 'getProgramAccounts', [
    programId,
    {
      encoding: 'base64',
      filters: [
        { memcmp: { offset: 0, bytes: discriminator } },
        { memcmp: { offset: 16, bytes: owner } },
      ],
    },
  ], signal).catch(() => null);
  const first = Array.isArray(gpa) ? gpa[0] : null;
  const firstBase64 = Array.isArray(first?.account?.data) ? first.account.data[0] : null;
  if (firstBase64) {
    return {
      pubkey: first.pubkey || ledgerPubkey.toBase58(),
      ledger: decodeUserDepositLedger(Buffer.from(firstBase64, 'base64'), owner),
    };
  }

  const info = await flashJsonRpcRequest(rpcUrl, 'Flash user deposit ledger', 'getAccountInfo', [
    ledgerPubkey.toBase58(),
    { encoding: 'base64', commitment: 'confirmed' },
  ], signal).catch(() => null);
  const infoBase64 = Array.isArray(info?.value?.data) ? info.value.data[0] : null;
  if (!infoBase64) return null;
  return {
    pubkey: ledgerPubkey.toBase58(),
    ledger: decodeUserDepositLedger(Buffer.from(infoBase64, 'base64'), owner),
  };
}

async function getFlashUserDepositLedger(owner, ledgerPubkey, programId = FLASH_V2_PROGRAM_ID) {
  const erUrls = new Set(flashErRpcUrls());
  let lastError = null;
  for (const rpcUrl of flashFundingRpcUrls()) {
    const ctrl = new AbortController();
    const timer = setTimeout(() => ctrl.abort(), SOLANA_RPC_TIMEOUT_MS);
    try {
      // eslint-disable-next-line no-await-in-loop
      const read = await readFlashLedgerFromRpc(rpcUrl, owner, ledgerPubkey, ctrl.signal, programId);
      if (read?.ledger) {
        return {
          ...read,
          rpc_url: redactRpcUrl(rpcUrl),
          source: erUrls.has(String(rpcUrl).replace(/\/+$/, '')) ? 'er' : 'base',
        };
      }
    } catch (e) {
      lastError = e;
      console.warn(`[flash] Flash user deposit ledger RPC failed on ${redactRpcUrl(rpcUrl)}:`, e?.message || e);
    } finally {
      clearTimeout(timer);
    }
  }
  if (lastError) throw lastError;
  return null;
}

function deriveGplSessionToken(sessionSigner, authority) {
  return PublicKey.findProgramAddressSync([
    Buffer.from('session_token_v2'),
    new PublicKey(FLASH_V2_PROGRAM_ID).toBuffer(),
    new PublicKey(sessionSigner).toBuffer(),
    new PublicKey(authority).toBuffer(),
  ], new PublicKey(GPL_SESSION_PROGRAM_ID))[0].toBase58();
}

function decodeGplSessionToken(data) {
  const bytes = Buffer.from(data || []);
  if (bytes.length < 144 || !bytes.subarray(0, 8).equals(GPL_SESSION_TOKEN_V2_DISCRIMINATOR)) {
    throw new Error('Flash session token v2 account has invalid layout');
  }
  return {
    authority: new PublicKey(bytes.subarray(8, 40)).toBase58(),
    targetProgram: new PublicKey(bytes.subarray(40, 72)).toBase58(),
    sessionSigner: new PublicKey(bytes.subarray(72, 104)).toBase58(),
    feePayer: new PublicKey(bytes.subarray(104, 136)).toBase58(),
    validUntil: Number(bytes.readBigInt64LE(136)),
  };
}

async function verifyFlashSessionSigner({ sessionToken, signer, owner, blockTime }) {
  if (!isSolanaAddress(sessionToken) || !isSolanaAddress(signer) || !isSolanaAddress(owner)) {
    throw Object.assign(new Error('invalid Flash session signer proof'), { status: 403 });
  }
  const expectedToken = deriveGplSessionToken(signer, owner);
  if (sessionToken !== expectedToken) {
    throw Object.assign(new Error('Flash session token does not match signer and owner'), { status: 403 });
  }
  const account = await flashSolanaRpcRequest('Flash session token', 'getAccountInfo', [
    sessionToken,
    { encoding: 'base64', commitment: 'confirmed' },
  ]);
  if (!account?.value) throw Object.assign(new Error('Flash session token account was not found'), { status: 403 });
  if (String(account.value.owner || '') !== GPL_SESSION_PROGRAM_ID) {
    throw Object.assign(new Error('Flash session token is not owned by GPL Session program'), { status: 403 });
  }
  const base64 = Array.isArray(account.value.data) ? account.value.data[0] : null;
  const decoded = decodeGplSessionToken(Buffer.from(base64 || '', 'base64'));
  if (decoded.authority !== owner) throw Object.assign(new Error('Flash session token authority mismatch'), { status: 403 });
  if (decoded.targetProgram !== FLASH_V2_PROGRAM_ID) throw Object.assign(new Error('Flash session token target program mismatch'), { status: 403 });
  if (decoded.sessionSigner !== signer) throw Object.assign(new Error('Flash session token signer mismatch'), { status: 403 });
  const referenceTime = Number(blockTime || Math.floor(Date.now() / 1000));
  if (!(decoded.validUntil > referenceTime)) {
    throw Object.assign(new Error('Flash session token is expired'), { status: 403 });
  }
  return decoded;
}

async function getFlashFundingState(owner, snapshot = {}, erBasket = null) {
  const ownerKey = new PublicKey(owner);
  const fundingProgramId = erBasket?.program_id || FLASH_V2_PROGRAM_ID;
  const programId = new PublicKey(fundingProgramId);
  const [derivedBasket] = findBasketAddress(ownerKey, programId);
  const [ledgerPubkey] = findUserDepositLedgerAddress(ownerKey, programId);
  const basketPubkey = String(erBasket?.pubkey || snapshot?.basketPubkey || derivedBasket.toBase58());
  const [basketRaw, ledgerRead] = await Promise.all([
    erBasket ? Promise.resolve(null) : basketPubkey
      ? request(`/v2/raw/baskets/${basketPubkey}`).catch(() => null)
      : Promise.resolve(null),
    getFlashUserDepositLedger(owner, ledgerPubkey, fundingProgramId).catch(() => null),
  ]);
  if (!ledgerRead?.ledger) return null;
  const ledger = ledgerRead.ledger;
  const basketAccount = erBasket || basketRaw?.account || {};
  const depositsRaw = sumRawMint(ledger.deposits);
  const debitsRaw = sumRawMint(basketAccount.debits || basketAccount.debitsRaw || []);
  const pendingCreditsRaw = sumRawMint(basketAccount.pendingCredits || basketAccount.pending_credits || []);
  // Flash V2 is double-entry: the deposit ledger is cumulative, while basket
  // debits and pendingCredits are counter-entries. All three must be netted
  // from the same coherent ER-fed source.
  const availableRaw = depositsRaw - debitsRaw + pendingCreditsRaw;
  const availableClampedRaw = availableRaw > 0n ? availableRaw : 0n;
  return {
    source: 'magic_trade_client_user_deposit_ledger',
    program_id: fundingProgramId,
    ledger_source: ledgerRead.source,
    ledger_rpc_url: ledgerRead.rpc_url,
    basket_pubkey: basketPubkey,
    deposit_ledger_pubkey: ledgerRead.pubkey || ledgerPubkey.toBase58(),
    deposit_ledger_usdc: rawTokenAmountToUi(depositsRaw),
    basket_debits_usdc: rawTokenAmountToUi(debitsRaw),
    basket_pending_credits_usdc: rawTokenAmountToUi(pendingCreditsRaw),
    available_usdc: rawTokenAmountToUi(availableClampedRaw),
    available_raw: availableClampedRaw.toString(),
  };
}

async function getParsedFlashTransaction(signature) {
  const params = [
    signature,
    {
      encoding: 'jsonParsed',
      maxSupportedTransactionVersion: 0,
      commitment: 'confirmed',
    },
  ];
  const v2 = await flashV2RpcRequest('Flash v2 transaction lookup', 'getTransaction', params).catch((e) => {
    console.warn('[flash] v2 transaction lookup failed:', e?.message || e);
    return null;
  });
  if (v2) return v2;
  return flashSolanaRpcRequest('Flash mainnet transaction lookup', 'getTransaction', params).catch(() => null);
}

function displayLiquidationPrice({ side, entry, sizeUsd, collateralUsd, apiLiq }) {
  if (!(entry > 0) || !(sizeUsd > 0) || !(collateralUsd > 0)) return apiLiq || 0;
  const ratio = Math.max(0, Math.min(0.95, collateralUsd / sizeUsd)) * 0.92;
  const derived = side === 'SHORT' ? entry * (1 + ratio) : entry * (1 - ratio);
  if (!(derived > 0)) return apiLiq || 0;
  if (!(apiLiq > 0)) return derived;
  // Flash v2 owner metrics can report a raw liquidation tick close to entry
  // while the app displays the margin-ratio liquidation level. Use the value
  // that is directionally consistent with entry and closer to their UI.
  if (side === 'LONG' && apiLiq >= entry * 0.995) return derived;
  if (side === 'SHORT' && apiLiq <= entry * 1.005) return derived;
  return apiLiq;
}

function rawUsdFromMetric(value) {
  const n = Number(value);
  return Number.isFinite(n) ? n / 1_000_000 : 0;
}

function flashPositionPnlView({ metric = {}, side, entry, mark, sizeUsd, amount, collateralUsd }) {
  const dir = side === 'SHORT' ? -1 : 1;
  const notional = sizeUsd > 0 ? sizeUsd : (entry > 0 && amount > 0 ? entry * amount : 0);
  const pricePnl = mark > 0 && entry > 0 && notional > 0
    ? ((mark - entry) / entry) * notional * dir
    : numberFromUi(metric.pnlWithoutFeeUsdUi ?? metric.pnlWithFeeUsdUi);
  const feesUsd = rawUsdFromMetric(metric.exitFeeUsd) + rawUsdFromMetric(metric.borrowFeeUsd);
  const pnlWithFees = pricePnl - feesUsd;
  return {
    pnlWithoutFees: pricePnl,
    pnlWithFees,
    pnlPctWithoutFees: collateralUsd > 0 ? (pricePnl / collateralUsd) * 100 : undefined,
    pnlPctWithFees: collateralUsd > 0 ? (pnlWithFees / collateralUsd) * 100 : undefined,
    feesUsd,
  };
}

function positionFromMetric(marketPubkey, metric = {}, priceMap = new Map(), hint = {}) {
  const side = metricSide(metric.side || metric.sideUi || hint.side);
  const symbol = normalizeToken(metric.marketSymbol || metric.symbol || hint.symbol || marketPubkey);
  const collateralUsd = numberFromUi(metric.collateralUsdUi);
  const sizeUsd = numberFromUi(metric.sizeUsdUi);
  const entry = numberFromUi(metric.entryPriceUi);
  const amount = numberFromUi(metric.sizeAmountUi);
  const mark = numberFromUi(priceMap.get(symbol)?.price);
  const pnlView = flashPositionPnlView({ metric, side, entry, mark, sizeUsd, amount, collateralUsd });
  const isDust = isDustMetric(metric);
  const pnl = isDust ? 0 : pnlView.pnlWithoutFees;
  const leverage = numberFromUi(metric.leverageUi);
  const apiLiq = numberFromUi(metric.liquidationPriceUi);
  const liq = displayLiquidationPrice({ side, entry, sizeUsd, collateralUsd, apiLiq });
  const collateralLeverage = collateralUsd > 0 && sizeUsd > 0 ? sizeUsd / collateralUsd : 0;
  return {
    marketPubkey,
    marketSymbol: symbol,
    symbol,
    side: side === 'SHORT' ? 'ask' : 'bid',
    side_label: side.toLowerCase(),
    tradeType: side,
    collateralSymbol: metric.collateralSymbol || 'USDC',
    entryPriceUi: metric.entryPriceUi,
    entry_price: entry || metric.entryPriceUi,
    mark_price: mark || undefined,
    sizeAmountUi: metric.sizeAmountUi,
    amount: metric.sizeAmountUi,
    sizeUsdUi: metric.sizeUsdUi,
    notional_usd: sizeUsd,
    collateralUsdUi: metric.collateralUsdUi,
    margin: metric.collateralUsdUi,
    pnlWithFeeUsdUi: metric.pnlWithFeeUsdUi,
    pnlWithoutFeeUsdUi: metric.pnlWithoutFeeUsdUi,
    pnl_usd: pnl,
    pnl_pct: isDust ? 0 : pnlView.pnlPctWithoutFees,
    pnl_without_fees_usd: isDust ? 0 : pnlView.pnlWithoutFees,
    pnl_without_fees_pct: isDust ? 0 : pnlView.pnlPctWithoutFees,
    pnl_with_fees_usd: isDust ? 0 : pnlView.pnlWithFees,
    pnl_with_fees_pct: isDust ? 0 : pnlView.pnlPctWithFees,
    flash_position_fees_usd: isDust ? 0 : pnlView.feesUsd,
    pnl_source: 'flash_mark_price_without_fees',
    liquidationPriceUi: metric.liquidationPriceUi,
    liquidation_price: isDust ? undefined : (liq || metric.liquidationPriceUi),
    leverage: isDust ? undefined : (collateralLeverage > 0 ? Math.round(collateralLeverage * 10) / 10 : undefined),
    effective_leverage: Number.isFinite(leverage) && leverage > 0 ? leverage : undefined,
    inputUsdUi: metric.sizeUsdUi,
    _flashDust: isDust,
    _flashDustUsd: isDust ? sizeUsd : undefined,
    positionKey: marketPubkey ? `mb-${marketPubkey}` : `${symbol}:${side}`,
    source: 'flash_main_basket',
    metric: {
      ...metric,
      marketSymbol: metric.marketSymbol || hint.symbol || metric.symbol,
      symbol: metric.symbol || hint.symbol || metric.marketSymbol,
      market_hint_source: hint.source || undefined,
    },
  };
}

function orderFromMetric(marketPubkey, metric = {}, parent = {}, hint = {}) {
  const side = metricSide(metric.side || metric.sideUi || parent.side || parent.sideUi || hint.side);
  const symbol = normalizeToken(metric.marketSymbol || metric.symbol || parent.marketSymbol || parent.symbol || hint.symbol || marketPubkey);
  const triggerPriceUi = metric.triggerPriceUi ?? metric.trigger_price_ui;
  const limitPriceUi = metric.entryPriceUi ?? metric.entry_price_ui ?? metric.limitPriceUi ?? metric.limit_price_ui;
  return {
    ...metric,
    marketPubkey,
    marketSymbol: symbol,
    symbol,
    side: side === 'SHORT' ? 'ask' : 'bid',
    tradeType: side,
    orderId: metric.orderId ?? metric.order_id ?? metric.id,
    order_id: metric.orderId ?? metric.order_id ?? metric.id,
    order_type: metric.order_type || metric.orderType || metric.type || (triggerPriceUi ? 'TRIGGER' : 'LIMIT'),
    type: metric.type || metric.order_type || metric.orderType || (triggerPriceUi ? 'TRIGGER' : 'LIMIT'),
    triggerPriceUi,
    trigger_price: triggerPriceUi,
    price: triggerPriceUi ?? limitPriceUi ?? metric.price,
    amount: metric.sizeAmountUi ?? metric.size_amount_ui ?? metric.amount,
    initial_amount: metric.sizeAmountUi ?? metric.size_amount_ui ?? metric.amount,
    _readOnly: true,
    source: 'flash_main_basket',
  };
}

function ordersFromMetricBundle(marketPubkey, metric = {}, hint = {}) {
  if (!metric || typeof metric !== 'object') return [];
  if (Array.isArray(metric)) return metric.flatMap(row => ordersFromMetricBundle(marketPubkey, row, hint));
  const rows = [];
  const pushRows = (items, type) => {
    for (const row of Array.isArray(items) ? items : []) {
      rows.push(orderFromMetric(marketPubkey, { ...row, type: row?.type || type }, metric, hint));
    }
  };
  pushRows(metric.limitOrders || metric.limit_orders, 'LIMIT');
  pushRows(metric.takeProfitOrders || metric.take_profit_orders, 'TP');
  pushRows(metric.stopLossOrders || metric.stop_loss_orders, 'SL');
  if (rows.length) return rows;
  return [orderFromMetric(marketPubkey, metric, {}, hint)];
}

function flashMetricFromErPosition(pos = {}, hint = {}) {
  const market = String(pos.market || pos.meta_market || '').trim();
  const symbol = hint.symbol ? normalizeToken(hint.symbol, '') : market;
  const side = normalizeSide(hint.side || 'LONG');
  const sizeUsd = rawTokenAmountToUi(pos.size_usd, FLASH_USDC_DECIMALS);
  const collateralUsd = rawTokenAmountToUi(pos.collateral_usd, FLASH_USDC_DECIMALS);
  const sizeAmount = rawTokenAmountToUi(pos.size_amount, Number(pos.size_decimals || 0));
  const lockedAmount = rawTokenAmountToUi(pos.locked_amount, Number(pos.locked_decimals || 0));
  const entry = Number(pos.entry_price?.ui || 0);
  const reference = Number(pos.reference_price?.ui || 0);
  return {
    marketSymbol: symbol,
    symbol,
    side,
    sideUi: side,
    entryPriceUi: entry || undefined,
    referencePriceUi: reference || undefined,
    sizeAmountUi: sizeAmount,
    sizeUsdUi: sizeUsd,
    collateralUsdUi: collateralUsd,
    lockedAmountUi: lockedAmount,
    leverageUi: collateralUsd > 0 && sizeUsd > 0 ? sizeUsd / collateralUsd : undefined,
    openTime: pos.open_time || null,
    updateTime: pos.update_time || null,
    isActive: pos.is_active === true,
    sizeUsdRaw: pos.size_usd?.toString?.() || String(pos.size_usd || ''),
    collateralUsdRaw: pos.collateral_usd?.toString?.() || String(pos.collateral_usd || ''),
    sizeAmountRaw: pos.size_amount?.toString?.() || String(pos.size_amount || ''),
    source: 'flash_er_basket',
  };
}

function positionsFromFlashErBasket(basket = {}, marketHints = new Map(), priceMap = new Map()) {
  const positions = [];
  for (const pos of Array.isArray(basket.positions) ? basket.positions : []) {
    if (pos?.is_active !== true) continue;
    if (!(rawAmount(pos.size_usd) > 0n) && !(rawAmount(pos.collateral_usd) > 0n)) continue;
    const market = String(pos.market || pos.meta_market || '').trim();
    const hint = marketHints.get(market) || {};
    const metric = flashMetricFromErPosition(pos, hint);
    const normalized = positionFromMetric(market, metric, priceMap);
    positions.push({
      ...normalized,
      marketPubkey: market,
      positionKey: market ? `mb-${market}` : normalized.positionKey,
      source: 'flash_er_basket',
      flash_program_id: basket.program_id || null,
      flash_basket_pubkey: basket.pubkey || null,
      flash_er_rpc_url: basket.rpc_url || null,
      metric: {
        ...normalized.metric,
        ...metric,
        er_position: {
          owner: pos.owner,
          market,
          open_time: pos.open_time,
          update_time: pos.update_time,
          entry_price: pos.entry_price?.ui || null,
          reference_price: pos.reference_price?.ui || null,
          size_decimals: pos.size_decimals,
          locked_decimals: pos.locked_decimals,
          collateral_decimals: pos.collateral_decimals,
        },
      },
    });
  }
  return positions;
}

function mergeFlashPositions(primary = [], secondary = []) {
  const merged = [];
  const seen = new Set();
  const keyOf = (pos = {}) => String(pos.marketPubkey || pos.market_pubkey || pos.positionKey || `${pos.symbol}:${pos.tradeType}` || '').trim();
  for (const list of [primary, secondary]) {
    for (const pos of Array.isArray(list) ? list : []) {
      const key = keyOf(pos);
      if (key && seen.has(key)) continue;
      if (key) seen.add(key);
      merged.push(pos);
    }
  }
  return merged;
}

function flashPositionHasSize(metric = {}) {
  return numberFromUi(metric.sizeAmountUi ?? metric.size_amount_ui ?? metric.amount) > 0
    || numberFromUi(metric.sizeUsdUi ?? metric.size_usd_ui ?? metric.sizeUsd ?? metric.size_usd) > 0
    || numberFromUi(metric.collateralUsdUi ?? metric.collateral_usd_ui ?? metric.collateralUsd ?? metric.collateral_usd) > 0;
}

function flashMetricMatchesMarketSide(marketPubkey, metric = {}, hint = {}, marketSymbol = '', side = '', requestedMarketPubkey = '') {
  if (requestedMarketPubkey && String(marketPubkey || '').trim() === requestedMarketPubkey) {
    const metricTradeType = metricSide(metric.side || metric.sideUi || hint.side);
    return metricTradeType === side && flashPositionHasSize(metric);
  }
  const symbol = normalizeToken(metric.marketSymbol || metric.symbol || hint.symbol || marketPubkey, '');
  if (!symbol || symbol !== marketSymbol) return false;
  const metricTradeType = metricSide(metric.side || metric.sideUi || hint.side);
  return metricTradeType === side && flashPositionHasSize(metric);
}

function flashPositionMatchesMarketSide(pos = {}, marketSymbol = '', side = '') {
  const symbol = normalizeToken(pos.marketSymbol || pos.symbol || pos.metric?.marketSymbol || pos.metric?.symbol, '');
  const tradeType = metricSide(pos.tradeType || pos.sideUi || pos.side || pos.metric?.sideUi || pos.metric?.side);
  return symbol === marketSymbol && tradeType === side && !isDustPosition(pos);
}

function flashPositionProgramMismatchError(marketSymbol, side, action = 'manage', position = null) {
  const err = new Error(
    `${marketSymbol} ${side} is not on the active Flash main program. Refresh positions before trying to ${action}.`
  );
  err.status = 409;
  err.data = {
    code: 'FLASH_POSITION_PROGRAM_MISMATCH',
    marketSymbol,
    side,
    action,
    flash_program_id: position?.flash_program_id || null,
    source: position?.source || null,
  };
  return err;
}

async function assertFlashMainPosition(owner, marketSymbol, side, requestHint = {}, action = 'manage') {
  const requestedProgramId = String(requestHint.flashProgramId || requestHint.flash_program_id || '').trim();
  const requestedMarketPubkey = String(requestHint.marketPubkey || requestHint.market_pubkey || '').trim();
  if (requestedProgramId && requestedProgramId !== FLASH_MAIN_PROGRAM_ID) {
    throw flashPositionProgramMismatchError(marketSymbol, side, action, {
      flash_program_id: requestedProgramId,
      source: String(requestHint.positionSource || requestHint.position_source || '').trim(),
    });
  }

  const [erBasket, snapshot, marketHints] = await Promise.all([
    getFlashErBasket(owner).catch(e => {
      console.warn('[flash] position basket check unavailable:', e?.message || e);
      return null;
    }),
    request(`/v2/owner/${owner}`).catch(() => null),
    getFlashMarketHints(owner).catch(e => {
      console.warn('[flash] position market hints unavailable:', e?.message || e);
      return new Map();
    }),
  ]);
  const mainPosition = erBasket
    ? positionsFromFlashErBasket(erBasket, marketHints, new Map()).find(pos => (
      (!requestedMarketPubkey || String(pos.marketPubkey || pos.market_pubkey || '') === requestedMarketPubkey)
      && flashPositionMatchesMarketSide(pos, marketSymbol, side)
      && (!pos.flash_program_id || pos.flash_program_id === FLASH_MAIN_PROGRAM_ID)
    ))
    : null;
  if (mainPosition) {
    return { ok: true, source: 'flash_main_basket', marketPubkey: mainPosition.marketPubkey || requestedMarketPubkey };
  }

  for (const [marketPubkey, metric] of Object.entries(snapshot?.positionMetrics || {})) {
    if (flashMetricMatchesMarketSide(marketPubkey, metric, marketHints.get(marketPubkey) || {}, marketSymbol, side, requestedMarketPubkey)) {
      return { ok: true, source: 'flash_beta_basket', marketPubkey };
    }
  }

  const err = new Error(`Flash ${marketSymbol} ${side} position was not found. Refresh positions before trying to ${action}.`);
  err.status = 409;
  err.data = {
    code: 'FLASH_POSITION_NOT_FOUND',
    marketSymbol,
    side,
    action,
  };
  throw err;
}

async function readFlashBasketFromRpc(rpcUrl, owner, programId, signal) {
  const discriminator = bs58Encode(accountDiscriminator('Basket'));
  const gpa = await flashJsonRpcRequest(rpcUrl, 'Flash basket', 'getProgramAccounts', [
    programId,
    {
      encoding: 'base64',
      filters: [
        { memcmp: { offset: 0, bytes: discriminator } },
        { memcmp: { offset: 8, bytes: owner } },
      ],
    },
  ], signal).catch(() => null);
  const rows = Array.isArray(gpa) ? gpa : [];
  for (const row of rows) {
    const data = Array.isArray(row?.account?.data) ? row.account.data[0] : null;
    if (!data) continue;
    const basket = decodeFlashBasket(Buffer.from(data, 'base64'), owner);
    return {
      ...basket,
      pubkey: row.pubkey || null,
      program_id: programId,
      rpc_url: redactRpcUrl(rpcUrl),
      source: 'flash_er_getProgramAccounts',
    };
  }

  let derivedBasket = null;
  try {
    derivedBasket = findBasketAddress(new PublicKey(owner), new PublicKey(programId))[0].toBase58();
  } catch {}
  if (!derivedBasket) return null;
  const info = await flashJsonRpcRequest(rpcUrl, 'Flash basket', 'getAccountInfo', [
    derivedBasket,
    { encoding: 'base64', commitment: 'confirmed' },
  ], signal).catch(() => null);
  const infoBase64 = Array.isArray(info?.value?.data) ? info.value.data[0] : null;
  if (!infoBase64) return null;
  const basket = decodeFlashBasket(Buffer.from(infoBase64, 'base64'), owner);
  return {
    ...basket,
    pubkey: derivedBasket,
    program_id: programId,
    rpc_url: redactRpcUrl(rpcUrl),
    source: 'flash_er_getAccountInfo',
  };
}

async function getFlashErBasket(owner) {
  const programs = Array.from(new Set([FLASH_MAIN_PROGRAM_ID, ...FLASH_PROGRAM_IDS, FLASH_BETA_PROGRAM_ID].filter(Boolean)));
  let lastError = null;
  let firstBasket = null;
  for (const rpcUrl of flashErRpcUrls()) {
    for (const programId of programs) {
      const ctrl = new AbortController();
      const timer = setTimeout(() => ctrl.abort(), SOLANA_RPC_TIMEOUT_MS);
      try {
        // eslint-disable-next-line no-await-in-loop
        const basket = await readFlashBasketFromRpc(rpcUrl, owner, programId, ctrl.signal);
        if (basket?.positions?.some(pos => pos?.is_active === true && rawAmount(pos.size_usd) > 0n)) return basket;
        if (basket && !firstBasket) firstBasket = basket;
      } catch (e) {
        lastError = e;
        if (!isFlashBasketLayoutDecodeError(e)) {
          console.warn(`[flash] ER basket read failed on ${redactRpcUrl(rpcUrl)} program ${programId}:`, e?.message || e);
        }
      } finally {
        clearTimeout(timer);
      }
    }
  }
  if (firstBasket) return firstBasket;
  if (lastError && !isFlashBasketLayoutDecodeError(lastError)) throw lastError;
  return null;
}

async function getFlashErBasketForProgram(owner, programId) {
  if (!programId) return null;
  let lastError = null;
  for (const rpcUrl of flashErRpcUrls()) {
    const ctrl = new AbortController();
    const timer = setTimeout(() => ctrl.abort(), SOLANA_RPC_TIMEOUT_MS);
    try {
      // eslint-disable-next-line no-await-in-loop
      const basket = await readFlashBasketFromRpc(rpcUrl, owner, programId, ctrl.signal);
      if (basket) return basket;
    } catch (e) {
      lastError = e;
      if (!isFlashBasketLayoutDecodeError(e)) {
        console.warn(`[flash] ER basket read failed on ${redactRpcUrl(rpcUrl)} program ${programId}:`, e?.message || e);
      }
    } finally {
      clearTimeout(timer);
    }
  }
  if (lastError && !isFlashBasketLayoutDecodeError(lastError)) throw lastError;
  return null;
}

async function getOwnerSnapshot(owner) {
  if (!isSolanaAddress(owner)) throw Object.assign(new Error('valid Solana owner required'), { status: 400 });
  const [snapshot, prices, walletUsdc, marketHints, depositStats] = await Promise.all([
    request(`/v2/owner/${owner}`).catch(e => {
      console.warn('[flash] beta owner snapshot unavailable:', e?.message || e);
      return null;
    }),
    getPrices().catch(() => []),
    getWalletUsdcBalance(owner).catch(() => null),
    getFlashMarketHints(owner).catch(() => new Map()),
    getFlashV2DepositStats(owner).catch(e => {
      console.warn('[flash] Flash app deposit stats unavailable:', e?.message || e);
      return null;
    }),
  ]);
  const priceMap = new Map((Array.isArray(prices) ? prices : []).map(row => [row.symbol, row]));
  const positionMetrics = snapshot?.positionMetrics || {};
  const orderMetrics = snapshot?.orderMetrics || {};
  const v2Positions = Object.entries(positionMetrics).map(([marketPubkey, metric]) => (
    positionFromMetric(marketPubkey, metric, priceMap, marketHints.get(marketPubkey) || {})
  ));
  const erBasket = await getFlashErBasket(owner).catch(e => {
    console.warn('[flash] ER basket unavailable:', e?.message || e);
    return null;
  });
  const erPositions = erBasket ? positionsFromFlashErBasket(erBasket, marketHints, priceMap) : [];
  const positions = mergeFlashPositions(erPositions, v2Positions);
  const activePositions = positions.filter(pos => !isDustPosition(pos));
  const orders = Object.entries(orderMetrics).flatMap(([marketPubkey, metric]) => (
    ordersFromMetricBundle(marketPubkey, metric, marketHints.get(marketPubkey) || {})
  ));
  const collateralUsd = activePositions.reduce((sum, p) => sum + numberFromUi(p.collateralUsdUi), 0);
  const pnlUsd = activePositions.reduce((sum, p) => sum + numberFromUi(p.pnl_usd), 0);
  // Flash production trading now targets the FLASH6 main program.  The /v2
  // owner endpoint is beta-only, so free collateral must come from the FLASH6
  // deposit ledger and basket debits/pending credits read on-chain.
  const fundingBasket = erBasket?.program_id === FLASH_MAIN_PROGRAM_ID
    ? erBasket
    : await getFlashErBasketForProgram(owner, FLASH_MAIN_PROGRAM_ID).catch(e => {
      console.warn('[flash] main ER basket unavailable:', e?.message || e);
      return null;
    });
  const fundingState = await getFlashFundingState(owner, snapshot, fundingBasket).catch(e => {
    console.warn('[flash] main funding state unavailable:', e?.message || e);
    return null;
  });
  const betaBasket = erBasket?.program_id === FLASH_BETA_PROGRAM_ID
    ? erBasket
    : await getFlashErBasketForProgram(owner, FLASH_BETA_PROGRAM_ID).catch(e => {
      console.warn('[flash] beta ER basket unavailable:', e?.message || e);
      return null;
    });
  const betaFundingState = betaBasket
    ? await getFlashFundingState(owner, snapshot, betaBasket).catch(e => {
      console.warn('[flash] beta funding state unavailable:', e?.message || e);
      return null;
    })
    : null;
  const explicitFreeMargin = numberFromUi(
    snapshot?.availableToSpend
    ?? snapshot?.available_to_spend
    ?? snapshot?.availableToWithdraw
    ?? snapshot?.available_to_withdraw
    ?? snapshot?.withdrawable
  );
  const depositStatsUsdc = Number.isFinite(Number(depositStats?.liquid_balance_usd))
    ? Math.max(0, Number(depositStats.liquid_balance_usd))
    : null;
  const basketUsdc = fundingState
    ? fundingState.available_usdc
    : Math.max(0, explicitFreeMargin || depositStatsUsdc || 0);
  const freeMarginUsdc = Math.max(0, basketUsdc);
  const accountEquity = Math.max(0, basketUsdc + collateralUsd + pnlUsd);
  return {
    owner,
    dex: 'flash',
    ...snapshot,
    positions,
    orders,
    balance: accountEquity,
    equity: accountEquity,
    account_equity: accountEquity,
    flash_usdc_balance: basketUsdc,
    flash_in_basket_usdc: basketUsdc,
    account_balance_usdc: basketUsdc,
    flash_balance_source: fundingState?.source || (explicitFreeMargin > 0 ? 'flash_beta_owner_field' : (depositStatsUsdc != null ? 'flash_app_beta_deposit_stats' : 'unavailable')),
    flash_deposit_ledger_usdc: fundingState?.deposit_ledger_usdc ?? null,
    flash_basket_debits_usdc: fundingState?.basket_debits_usdc ?? null,
    flash_basket_pending_credits_usdc: fundingState?.basket_pending_credits_usdc ?? null,
    flash_beta_available_usdc: betaFundingState?.available_usdc ?? null,
    flash_beta_deposit_ledger_usdc: betaFundingState?.deposit_ledger_usdc ?? null,
    flash_beta_basket_debits_usdc: betaFundingState?.basket_debits_usdc ?? null,
    flash_beta_basket_pending_credits_usdc: betaFundingState?.basket_pending_credits_usdc ?? null,
    flash_beta_basket_pubkey: betaFundingState?.basket_pubkey || betaBasket?.pubkey || null,
    flash_beta_program_id: betaFundingState?.program_id || betaBasket?.program_id || FLASH_BETA_PROGRAM_ID,
    flash_beta_deposit_ledger_pubkey: betaFundingState?.deposit_ledger_pubkey || null,
    flash_beta_deposit_ledger_source: betaFundingState?.ledger_source || null,
    flash_beta_deposit_ledger_rpc_url: betaFundingState?.ledger_rpc_url || null,
    flash_beta_available_raw: betaFundingState?.available_raw || null,
    flash_app_liquid_balance_usd: depositStats?.liquid_balance_usd ?? null,
    flash_app_deposits_usd: depositStats?.deposits_usd ?? null,
    flash_app_withdrawals_usd: depositStats?.withdrawals_usd ?? null,
    flash_app_net_usd: depositStats?.net_usd ?? null,
    flash_app_deposit_count: depositStats?.deposit_count ?? null,
    flash_app_open_position_count: depositStats?.open_position_count ?? null,
    flash_app_open_position_collateral_usd: depositStats?.open_position_collateral_usd ?? null,
    flash_basket_pubkey: fundingState?.basket_pubkey || fundingBasket?.pubkey || erBasket?.pubkey || snapshot?.basketPubkey || null,
    flash_program_id: fundingState?.program_id || fundingBasket?.program_id || erBasket?.program_id || null,
    flash_er_basket_source: erBasket?.source || null,
    flash_er_basket_rpc_url: erBasket?.rpc_url || null,
    flash_deposit_ledger_pubkey: fundingState?.deposit_ledger_pubkey || null,
    flash_deposit_ledger_source: fundingState?.ledger_source || null,
    flash_deposit_ledger_rpc_url: fundingState?.ledger_rpc_url || null,
    flash_available_raw: fundingState?.available_raw || null,
    wallet_usdc: walletUsdc,
    margin_used: collateralUsd,
    total_margin_used: collateralUsd,
    free_margin: freeMarginUsdc,
    available_to_spend: freeMarginUsdc,
    available_to_withdraw: freeMarginUsdc,
    withdrawable: freeMarginUsdc,
    total_position_size_usd: activePositions.reduce((sum, p) => sum + numberFromUi(p.sizeUsdUi), 0),
    positions_count: activePositions.length,
    dust_positions_count: positions.length - activePositions.length,
    orders_count: orders.length,
    source: erPositions.length ? 'flash_main_basket_with_beta_owner_fallback' : 'flash_main_account',
  };
}

function getFlashLegacyBuilderInstruction(result, allowedDiscriminators = []) {
  const raw = result?.transactionBase64 || result?.transaction || '';
  if (!raw) throw Object.assign(new Error('Flash builder returned no transactionBase64'), { status: 502, data: result });
  let tx;
  try {
    tx = VersionedTransaction.deserialize(Buffer.from(raw, 'base64'));
  } catch (e) {
    throw Object.assign(new Error(`Flash builder returned invalid transaction: ${e.message}`), { status: 502, data: result });
  }
  const staticKeys = tx.message.staticAccountKeys || [];
  for (const ix of tx.message.compiledInstructions || []) {
    const programKey = staticKeys[ix.programIdIndex];
    if (!programKey || programKey.toBase58() !== FLASH_MAIN_PROGRAM_ID) continue;
    const data = Buffer.from(ix.data || []);
    const discriminator = flashInstructionDiscriminator(data);
    if (!allowedDiscriminators.length || allowedDiscriminators.includes(discriminator)) {
      return { data, discriminator };
    }
  }
  throw Object.assign(new Error('Flash builder returned no recognizable Flash instruction'), { status: 502, data: result });
}

function flashErBaseAccounts(signerContext) {
  const [basket] = findBasketAddress(signerContext.ownerPk, FLASH_MAIN_PROGRAM_PK);
  return {
    owner: signerContext.ownerPk,
    signer: signerContext.signerPk,
    sessionToken: signerContext.sessionTokenPk,
    perpetuals: flashPda('perpetuals'),
    basket,
    eventAuthority: flashPda('__event_authority'),
    program: FLASH_MAIN_PROGRAM_PK,
  };
}

function flashErOpenInstruction(signerContext, context, params) {
  const base = flashErBaseAccounts(signerContext);
  const [userDepositLedger] = findUserDepositLedgerAddress(signerContext.ownerPk, FLASH_MAIN_PROGRAM_PK);
  const reallocVault = flashPda('realloc_vault');
  const keys = [
    flashMeta(base.owner),
    flashMeta(base.signer, true),
    flashMeta(base.sessionToken),
    flashMeta(base.perpetuals),
    flashMeta(base.basket, false, true),
    flashMeta(userDepositLedger),
    flashMeta(flashPublicKey(context.pool, 'Flash pool'), false, true),
    flashMeta(flashPublicKey(context.market.pubkey, 'Flash market'), false, true),
    flashMeta(flashPublicKey(context.target.pubkey, 'Flash target custody')),
    flashMeta(flashPublicKey(context.lock.pubkey, 'Flash lock custody'), false, true),
    flashMeta(flashPublicKey(context.receiving.pubkey, 'Flash receiving custody'), false, true),
    flashMeta(flashPublicKey(context.target.oracle, 'Flash target oracle')),
    flashMeta(flashPublicKey(context.lock.oracle, 'Flash lock oracle')),
    flashMeta(flashPublicKey(context.receiving.oracle, 'Flash receiving oracle')),
    flashMeta(reallocVault, false, true),
    flashMeta(base.eventAuthority),
    flashMeta(base.program),
    flashMeta(SYSVAR_INSTRUCTIONS_PUBKEY),
  ];
  return new TransactionInstruction({
    programId: FLASH_MAIN_PROGRAM_PK,
    keys,
    data: encodeFlashOpenErParams(params),
  });
}

function flashErCloseInstruction(signerContext, context, params) {
  const base = flashErBaseAccounts(signerContext);
  const reallocVault = flashPda('realloc_vault');
  const keys = [
    flashMeta(base.owner),
    flashMeta(base.signer, true),
    flashMeta(base.sessionToken),
    flashMeta(base.perpetuals),
    flashMeta(base.basket, false, true),
    flashMeta(flashPublicKey(context.pool, 'Flash pool'), false, true),
    flashMeta(flashPublicKey(context.market.pubkey, 'Flash market'), false, true),
    flashMeta(flashPublicKey(context.target.pubkey, 'Flash target custody')),
    flashMeta(flashPublicKey(context.lock.pubkey, 'Flash lock custody'), false, true),
    flashMeta(flashPublicKey(context.receiving.pubkey, 'Flash dispensing custody'), false, true),
    flashMeta(flashPublicKey(context.target.oracle, 'Flash target oracle')),
    flashMeta(flashPublicKey(context.lock.oracle, 'Flash lock oracle')),
    flashMeta(flashPublicKey(context.receiving.oracle, 'Flash dispensing oracle')),
    flashMeta(reallocVault, false, true),
    flashMeta(base.eventAuthority),
    flashMeta(base.program),
    flashMeta(SYSVAR_INSTRUCTIONS_PUBKEY),
  ];
  return new TransactionInstruction({
    programId: FLASH_MAIN_PROGRAM_PK,
    keys,
    data: encodeFlashPricePrivilegeParams(FLASH_ER_DISCRIMINATORS.closePosition, params),
  });
}

function flashErPlaceTriggerInstruction(signerContext, context, params) {
  const base = flashErBaseAccounts(signerContext);
  const reallocVault = flashPda('realloc_vault');
  const keys = [
    flashMeta(base.owner),
    flashMeta(base.signer, true),
    flashMeta(base.sessionToken),
    flashMeta(base.perpetuals),
    flashMeta(base.basket, false, true),
    flashMeta(flashPublicKey(context.pool, 'Flash pool')),
    flashMeta(flashPublicKey(context.market.pubkey, 'Flash market')),
    flashMeta(flashPublicKey(context.target.pubkey, 'Flash target custody')),
    flashMeta(flashPublicKey(context.lock.pubkey, 'Flash lock custody')),
    flashMeta(flashPublicKey(context.receiving.pubkey, 'Flash receive custody')),
    flashMeta(flashPublicKey(context.target.oracle, 'Flash target oracle')),
    flashMeta(flashPublicKey(context.lock.oracle, 'Flash lock oracle')),
    flashMeta(reallocVault, false, true),
    flashMeta(base.eventAuthority),
    flashMeta(base.program),
    flashMeta(SYSVAR_INSTRUCTIONS_PUBKEY),
  ];
  return new TransactionInstruction({
    programId: FLASH_MAIN_PROGRAM_PK,
    keys,
    data: encodeFlashTriggerErParams(params),
  });
}

function flashErPlaceLimitInstruction(signerContext, context, params) {
  const base = flashErBaseAccounts(signerContext);
  const [userDepositLedger] = findUserDepositLedgerAddress(signerContext.ownerPk, FLASH_MAIN_PROGRAM_PK);
  const reallocVault = flashPda('realloc_vault');
  const reserve = context.reserve || context.receiving;
  const receive = context.receive || context.lock;
  const keys = [
    flashMeta(base.owner),
    flashMeta(base.signer, true),
    flashMeta(base.sessionToken),
    flashMeta(base.perpetuals),
    flashMeta(base.basket, false, true),
    flashMeta(userDepositLedger),
    flashMeta(flashPublicKey(context.pool, 'Flash pool')),
    flashMeta(flashPublicKey(context.market.pubkey, 'Flash market')),
    flashMeta(flashPublicKey(context.target.pubkey, 'Flash target custody')),
    flashMeta(flashPublicKey(context.lock.pubkey, 'Flash lock custody')),
    flashMeta(flashPublicKey(reserve.pubkey, 'Flash reserve custody'), false, true),
    flashMeta(flashPublicKey(receive.pubkey, 'Flash receive custody')),
    flashMeta(flashPublicKey(context.target.oracle, 'Flash target oracle')),
    flashMeta(flashPublicKey(reserve.oracle, 'Flash reserve oracle')),
    flashMeta(reallocVault, false, true),
    flashMeta(base.eventAuthority),
    flashMeta(base.program),
    flashMeta(SYSVAR_INSTRUCTIONS_PUBKEY),
  ];
  return new TransactionInstruction({
    programId: FLASH_MAIN_PROGRAM_PK,
    keys,
    data: encodeFlashLimitErParams(params),
  });
}

function flashErCancelOrderInstruction(signerContext, context, params) {
  const base = flashErBaseAccounts(signerContext);
  const isTriggerOrder = params.isTriggerOrder === true;
  const keys = isTriggerOrder
    ? [
      flashMeta(base.owner),
      flashMeta(base.signer, true),
      flashMeta(base.sessionToken),
      flashMeta(base.perpetuals),
      flashMeta(base.basket, false, true),
      flashMeta(base.eventAuthority),
      flashMeta(base.program),
    ]
    : [
      flashMeta(base.owner),
      flashMeta(base.signer, true),
      flashMeta(base.sessionToken),
      flashMeta(base.perpetuals),
      flashMeta(base.basket, false, true),
      flashMeta(flashPublicKey(context.pool, 'Flash pool')),
      flashMeta(flashPublicKey(context.target.pubkey, 'Flash target custody')),
      flashMeta(flashPublicKey(context.lock.pubkey, 'Flash lock custody')),
      flashMeta(flashPublicKey(context.receiving.pubkey, 'Flash reserve custody'), false, true),
      flashMeta(base.eventAuthority),
      flashMeta(base.program),
    ];
  const data = isTriggerOrder
    ? encodeFlashCancelTriggerErParams(params)
    : encodeFlashCancelLimitErParams(params);
  return new TransactionInstruction({ programId: FLASH_MAIN_PROGRAM_PK, keys, data });
}

function flashInitDepositLedgerInstruction(owner) {
  const base = flashMainAccountContext(owner);
  return new TransactionInstruction({
    programId: FLASH_MAIN_PROGRAM_PK,
    keys: [
      flashMeta(base.ownerPk),
      flashMeta(base.ownerPk, true, true),
      flashMeta(base.userDepositLedger, false, true),
      flashMeta(SystemProgram.programId),
    ],
    data: Buffer.concat([
      FLASH_ACCOUNT_DISCRIMINATORS.initUserDepositLedger,
      Buffer.from([4]),
    ]),
  });
}

function flashInitBasketInstruction(owner) {
  const base = flashMainAccountContext(owner);
  return new TransactionInstruction({
    programId: FLASH_MAIN_PROGRAM_PK,
    keys: [
      flashMeta(base.ownerPk),
      flashMeta(base.ownerPk, true, true),
      flashMeta(base.basket, false, true),
      flashMeta(SystemProgram.programId),
    ],
    data: Buffer.concat([
      FLASH_ACCOUNT_DISCRIMINATORS.initBasket,
      Buffer.from([4, 4, 4, 4]),
    ]),
  });
}

function flashDelegateBasketInstruction(owner, payer = owner) {
  const base = flashMainAccountContext(owner);
  const payerPk = flashPublicKey(payer, 'Flash payer');
  const bufferBasket = flashPdaWithKey('buffer', base.basket, FLASH_MAIN_PROGRAM_PK);
  const delegationRecordBasket = flashPdaWithKey('delegation', base.basket, FLASH_DELEGATION_PROGRAM_PK);
  const delegationMetadataBasket = flashPdaWithKey('delegation-metadata', base.basket, FLASH_DELEGATION_PROGRAM_PK);
  return new TransactionInstruction({
    programId: FLASH_MAIN_PROGRAM_PK,
    keys: [
      flashMeta(payerPk, true, true),
      flashMeta(base.ownerPk),
      flashMeta(bufferBasket, false, true),
      flashMeta(delegationRecordBasket, false, true),
      flashMeta(delegationMetadataBasket, false, true),
      flashMeta(base.basket, false, true),
      flashMeta(base.eventAuthority),
      flashMeta(base.program),
      flashMeta(base.program),
      flashMeta(FLASH_DELEGATION_PROGRAM_PK),
      flashMeta(SystemProgram.programId),
    ],
    data: FLASH_ACCOUNT_DISCRIMINATORS.delegateBasket,
  });
}

function flashDepositDirectInstruction(owner, amountRaw, tokenMint = FLASH_USDC_MINT) {
  const base = flashMainAccountContext(owner);
  const tokenMintPk = flashPublicKey(tokenMint, 'Flash deposit token mint');
  const depositorTokenAccount = getAssociatedTokenAddressSync(
    tokenMintPk,
    base.ownerPk,
    true,
    TOKEN_PROGRAM_ID,
    ASSOCIATED_TOKEN_PROGRAM_ID,
  );
  const tradeVault = flashPdaWithKey('trade_vault', tokenMintPk, FLASH_MAIN_PROGRAM_PK);
  const tradeVaultTokenAccount = flashPdaWithKey('trade_vault_token_account', tokenMintPk, FLASH_MAIN_PROGRAM_PK);
  return new TransactionInstruction({
    programId: FLASH_MAIN_PROGRAM_PK,
    keys: [
      flashMeta(base.ownerPk, true, true),
      flashMeta(base.ownerPk),
      flashMeta(base.perpetuals),
      flashMeta(depositorTokenAccount, false, true),
      flashMeta(tokenMintPk),
      flashMeta(tradeVault, false, true),
      flashMeta(tradeVaultTokenAccount, false, true),
      flashMeta(base.userDepositLedger, false, true),
      flashMeta(TOKEN_PROGRAM_ID),
      flashMeta(SystemProgram.programId),
      flashMeta(base.eventAuthority),
      flashMeta(base.program),
    ],
    data: Buffer.concat([
      FLASH_ACCOUNT_DISCRIMINATORS.depositDirect,
      writeU64Le(amountRaw, 'Flash deposit amount'),
    ]),
  });
}

async function buildOpenPositionTx(body, owner) {
  if (!isSolanaAddress(owner)) throw Object.assign(new Error('Flash Solana wallet is not linked'), { status: 409 });
  const inputAmountUi = String(body.inputAmountUi || body.input_amount_ui || body.amount || body.margin_usd || '').trim();
  if (!inputAmountUi || !(Number(inputAmountUi) > 0)) {
    throw Object.assign(new Error('inputAmountUi is required'), { status: 400 });
  }
  const payload = {
    inputTokenSymbol: normalizeToken(body.inputTokenSymbol || body.input_token_symbol || body.inputToken || 'USDC', 'USDC'),
    outputTokenSymbol: normalizeToken(body.outputTokenSymbol || body.output_token_symbol || body.symbol || body.market || 'SOL'),
    inputAmountUi,
    leverage: Number(body.leverage || 1),
    tradeType: normalizeSide(body.tradeType || body.trade_type || body.side),
    owner,
    orderType: String(body.orderType || body.order_type || 'MARKET').toUpperCase(),
    slippagePercentage: String(body.slippagePercentage || body.slippage_percentage || body.slippage || '0.5'),
  };
  await assertFlashMarketCanOpen(payload.outputTokenSymbol, payload.leverage);
  if (body.limitPrice || body.limit_price || body.price) payload.limitPrice = String(body.limitPrice || body.limit_price || body.price);
  if (body.takeProfit || body.take_profit) payload.takeProfit = String(body.takeProfit || body.take_profit);
  if (body.stopLoss || body.stop_loss) payload.stopLoss = String(body.stopLoss || body.stop_loss);
  if (body.degenMode != null || body.degen_mode != null) payload.degenMode = body.degenMode === true || body.degen_mode === true;
  if (body.tradingFeeDiscountPercent != null) payload.tradingFeeDiscountPercent = Number(body.tradingFeeDiscountPercent);
  if (body.tokenStakeFafAccount) payload.tokenStakeFafAccount = String(body.tokenStakeFafAccount);
  if (body.userReferralAccount) payload.userReferralAccount = String(body.userReferralAccount);
  if (body.privilege) payload.privilege = String(body.privilege).toUpperCase();
  applyTradingSessionPayload(payload, body);
  const result = await request('/transaction-builder/open-position', { method: 'POST', body: payload });
  if (!result?.transactionBase64) throw Object.assign(new Error('Flash builder returned no transactionBase64'), { status: 502, data: result });
  const legacyIx = getFlashLegacyBuilderInstruction(result, [
    FLASH_LEGACY_DISCRIMINATORS.openPosition,
    FLASH_LEGACY_DISCRIMINATORS.swapAndOpen,
    FLASH_LEGACY_DISCRIMINATORS.placeLimitOrder,
  ]);
  const signerContext = flashSignerContext(owner, body);
  const context = await getFlashMainMarketContext({
    symbol: payload.outputTokenSymbol,
    side: payload.tradeType,
    receivingSymbol: payload.inputTokenSymbol,
    marketPubkey: body.marketPubkey || body.market_pubkey,
  });
  let transaction;
  let erInstructionName;
  if (legacyIx.discriminator === FLASH_LEGACY_DISCRIMINATORS.placeLimitOrder) {
    const params = parseLegacyLimitParams(legacyIx.data);
    const limitContext = { ...context, reserve: context.receiving, receive: context.lock };
    transaction = await buildFlashErVersionedTransaction([
      flashErPlaceLimitInstruction(signerContext, limitContext, params),
    ], signerContext.signerPk);
    erInstructionName = 'place_limit_order_er';
  } else {
    const params = parseLegacyOpenParams(legacyIx.data);
    transaction = await buildFlashErVersionedTransaction([
      flashErOpenInstruction(signerContext, context, params),
    ], signerContext.signerPk);
    erInstructionName = 'open_position_er';
  }
  return {
    ...result,
    transaction,
    transactions: [transaction],
    request: payload,
    builder: 'flash_trade_main_er',
    legacy_builder: 'flash_trade_main',
    legacy_instruction: legacyIx.discriminator,
    er_instruction: erInstructionName,
    txKind: 'trading',
    api: FLASH_API,
  };
}

async function buildClosePositionTx(body, owner) {
  if (!isSolanaAddress(owner)) throw Object.assign(new Error('Flash Solana wallet is not linked'), { status: 409 });
  const marketSymbol = normalizeToken(body.marketSymbol || body.market_symbol || body.symbol || body.outputTokenSymbol || body.output_token_symbol || 'SOL');
  const side = normalizeSide(body.side || body.tradeType || body.trade_type);
  const marketPubkey = String(body.marketPubkey || body.market_pubkey || '').trim();
  const positionKey = String(body.positionKey || body.position_key || (marketPubkey ? `mb-${marketPubkey}` : '')).trim();
  const payload = {
    positionKey,
    marketSymbol,
    side,
    inputUsdUi: String(body.inputUsdUi || body.input_usd_ui || body.amount || body.notional_usd || '').trim(),
    withdrawTokenSymbol: normalizeToken(body.withdrawTokenSymbol || body.withdraw_token_symbol || body.token || 'USDC', 'USDC'),
    owner,
    slippagePercentage: String(body.slippagePercentage || body.slippage_percentage || body.slippage || '0.5'),
  };
  if (body.inputSizeAmountUi || body.input_size_amount_ui || body.sizeAmountUi || body.size_amount_ui) {
    payload.inputSizeAmountUi = String(body.inputSizeAmountUi || body.input_size_amount_ui || body.sizeAmountUi || body.size_amount_ui);
  }
  if (body.entryPriceUi || body.entry_price_ui) payload.entryPriceUi = String(body.entryPriceUi || body.entry_price_ui);
  if (body.sizeUsdUi || body.size_usd_ui) payload.sizeUsdUi = String(body.sizeUsdUi || body.size_usd_ui);
  if (!payload.positionKey || !payload.marketSymbol || !payload.side || !payload.inputUsdUi) {
    throw Object.assign(new Error('positionKey, marketSymbol, side and inputUsdUi are required'), { status: 400 });
  }
  await assertFlashMainPosition(owner, marketSymbol, side, body, 'close');
  applyTradingSessionPayload(payload, body);
  const result = await request('/transaction-builder/close-position', { method: 'POST', body: payload });
  if (result?.err) throw Object.assign(new Error(String(result.err)), { status: 400, data: result });
  if (!result?.transactionBase64) throw Object.assign(new Error('Flash builder returned no transactionBase64'), { status: 502, data: result });
  const legacyIx = getFlashLegacyBuilderInstruction(result, [
    FLASH_LEGACY_DISCRIMINATORS.closePosition,
    FLASH_LEGACY_DISCRIMINATORS.closeAndSwap,
  ]);
  const params = parseLegacyPricePrivilegeParams(legacyIx.data, 'Flash close builder');
  const signerContext = flashSignerContext(owner, body);
  const context = await getFlashMainMarketContext({
    symbol: marketSymbol,
    side,
    receivingSymbol: payload.withdrawTokenSymbol,
    marketPubkey,
  });
  const transaction = await buildFlashErVersionedTransaction([
    flashErCloseInstruction(signerContext, context, params),
  ], signerContext.signerPk);
  return {
    ...result,
    transaction,
    transactions: [transaction],
    request: payload,
    builder: 'flash_trade_main_er',
    legacy_builder: 'flash_trade_main',
    legacy_instruction: legacyIx.discriminator,
    er_instruction: 'close_position_er',
    txKind: 'trading',
    api: FLASH_API,
  };
}

async function buildPlaceTpSlTx(body, owner) {
  if (!isSolanaAddress(owner)) throw Object.assign(new Error('Flash Solana wallet is not linked'), { status: 409 });
  const marketSymbol = normalizeToken(body.marketSymbol || body.market_symbol || body.symbol || body.outputTokenSymbol || body.output_token_symbol || 'SOL');
  const side = normalizeSide(body.side || body.tradeType || body.trade_type);
  const takeProfitUi = String(body.takeProfitUi || body.take_profit_ui || body.takeProfit || body.take_profit || '').trim();
  const stopLossUi = String(body.stopLossUi || body.stop_loss_ui || body.stopLoss || body.stop_loss || '').trim();
  const sizeAmountUi = String(body.sizeAmountUi || body.size_amount_ui || body.amount || body.size || '').trim();
  if (!marketSymbol || !side || !sizeAmountUi) {
    throw Object.assign(new Error('marketSymbol, side and sizeAmountUi are required'), { status: 400 });
  }
  if (!takeProfitUi && !stopLossUi) {
    throw Object.assign(new Error('takeProfitUi or stopLossUi is required'), { status: 400 });
  }
  if (!(Number(sizeAmountUi) > 0)) {
    throw Object.assign(new Error('sizeAmountUi must be positive'), { status: 400 });
  }
  const marketPubkey = String(body.marketPubkey || body.market_pubkey || '').trim();
  const positionKey = String(body.positionKey || body.position_key || (marketPubkey ? `mb-${marketPubkey}` : '')).trim();
  if (!positionKey) {
    throw Object.assign(new Error('positionKey is required for Flash TP/SL'), { status: 400 });
  }
  await assertFlashMainPosition(owner, marketSymbol, side, body, 'set TP/SL on');
  const basePayload = {
    positionKey,
    marketSymbol,
    side,
    sizeAmountUi,
    receiveTokenSymbol: normalizeToken(body.receiveTokenSymbol || body.receive_token_symbol || body.withdrawTokenSymbol || 'USDC', 'USDC'),
    owner,
  };
  applyTradingSessionPayload(basePayload, body);
  const requests = [];
  if (takeProfitUi) requests.push({ ...basePayload, triggerPriceUi: takeProfitUi, isStopLoss: false });
  if (stopLossUi) requests.push({ ...basePayload, triggerPriceUi: stopLossUi, isStopLoss: true });
  const results = [];
  for (const payload of requests) {
    // eslint-disable-next-line no-await-in-loop
    const result = await request('/transaction-builder/place-trigger-order', { method: 'POST', body: payload });
    if (result?.err) throw Object.assign(new Error(String(result.err)), { status: 400, data: result });
    if (!result?.transactionBase64) throw Object.assign(new Error('Flash builder returned no transactionBase64'), { status: 502, data: result });
    results.push({ result, payload });
  }
  const signerContext = flashSignerContext(owner, body);
  const context = await getFlashMainMarketContext({
    symbol: marketSymbol,
    side,
    receivingSymbol: basePayload.receiveTokenSymbol,
    marketPubkey,
  });
  const transactions = [];
  for (const row of results) {
    const legacyIx = getFlashLegacyBuilderInstruction(row.result, [
      FLASH_LEGACY_DISCRIMINATORS.placeTriggerOrder,
    ]);
    const params = parseLegacyTriggerParams(legacyIx.data);
    // eslint-disable-next-line no-await-in-loop
    const transaction = await buildFlashErVersionedTransaction([
      flashErPlaceTriggerInstruction(signerContext, context, params),
    ], signerContext.signerPk);
    transactions.push(transaction);
    row.legacyInstruction = legacyIx.discriminator;
  }
  const first = results[0]?.result || {};
  return {
    ...first,
    transaction: transactions[0],
    transactions,
    request: requests[0],
    requests: results.map(row => row.payload),
    builder: 'flash_trade_main_er',
    legacy_builder: 'flash_trade_main',
    legacy_instruction: results.map(row => row.legacyInstruction),
    er_instruction: 'place_trigger_order_er',
    txKind: 'trading',
    api: FLASH_API,
  };
}

async function buildCancelOrderTx(body, owner) {
  if (!isSolanaAddress(owner)) throw Object.assign(new Error('Flash Solana wallet is not linked'), { status: 409 });
  const marketSymbol = normalizeToken(body.marketSymbol || body.market_symbol || body.symbol || body.outputTokenSymbol || body.output_token_symbol || 'SOL');
  const side = normalizeSide(body.side || body.tradeType || body.trade_type);
  const orderIdRaw = body.orderId ?? body.order_id ?? body.id;
  const orderId = Number(orderIdRaw);
  if (!Number.isInteger(orderId) || orderId < 0 || orderId > 255) {
    throw Object.assign(new Error('orderId must be a Flash u8 order id'), { status: 400 });
  }
  const rawType = String(body.orderType || body.order_type || body.type || '').trim().toUpperCase();
  const isTriggerOrder = rawType === 'TRIGGER' || rawType === 'TP' || rawType === 'SL' || body.isStopLoss != null || body.is_stop_loss != null;
  const payload = {
    marketSymbol,
    side,
    orderId,
    owner,
  };
  if (isTriggerOrder) {
    payload.isStopLoss = body.isStopLoss != null
      ? body.isStopLoss === true || body.isStopLoss === 'true'
      : body.is_stop_loss === true || body.is_stop_loss === 'true' || rawType === 'SL';
  }
  applyTradingSessionPayload(payload, body);
  const signerContext = flashSignerContext(owner, body);
  const context = await getFlashMainMarketContext({
    symbol: marketSymbol,
    side,
    receivingSymbol: normalizeToken(body.reserveTokenSymbol || body.reserve_token_symbol || body.inputTokenSymbol || 'USDC', 'USDC'),
    marketPubkey: String(body.marketPubkey || body.market_pubkey || '').trim(),
  });
  const market = String(body.marketPubkey || body.market_pubkey || context.market.pubkey || '').trim();
  const transaction = await buildFlashErVersionedTransaction([
    flashErCancelOrderInstruction(signerContext, context, {
      market,
      orderId,
      isStopLoss: payload.isStopLoss === true,
      isTriggerOrder,
    }),
  ], signerContext.signerPk);
  return {
    transaction,
    transactions: [transaction],
    request: payload,
    builder: 'flash_trade_main_er',
    er_instruction: isTriggerOrder ? 'cancel_trigger_order_er' : 'cancel_limit_order_er',
    txKind: 'trading',
    api: FLASH_API,
  };
}

async function buildInitDepositLedgerTx(owner) {
  if (!isSolanaAddress(owner)) throw Object.assign(new Error('Flash Solana wallet is not linked'), { status: 409 });
  const base = flashMainAccountContext(owner);
  const transaction = await buildFlashBaseVersionedTransaction([
    flashInitDepositLedgerInstruction(owner),
  ], base.ownerPk);
  return {
    transaction,
    transactions: [transaction],
    request: { owner },
    builder: 'flash_trade_main_account',
    instruction: 'init_user_deposit_ledger',
    txKind: 'account',
    api: FLASH_API,
    flash_program_id: FLASH_MAIN_PROGRAM_ID,
    user_deposit_ledger: base.userDepositLedger.toBase58(),
  };
}

async function buildInitBasketTx(owner) {
  if (!isSolanaAddress(owner)) throw Object.assign(new Error('Flash Solana wallet is not linked'), { status: 409 });
  const base = flashMainAccountContext(owner);
  const transaction = await buildFlashBaseVersionedTransaction([
    flashInitBasketInstruction(owner),
  ], base.ownerPk);
  return {
    transaction,
    transactions: [transaction],
    request: { owner },
    builder: 'flash_trade_main_account',
    instruction: 'init_basket',
    txKind: 'account',
    api: FLASH_API,
    flash_program_id: FLASH_MAIN_PROGRAM_ID,
    basket: base.basket.toBase58(),
  };
}

async function buildDelegateBasketTx(owner, payer = owner) {
  if (!isSolanaAddress(owner) || !isSolanaAddress(payer)) throw Object.assign(new Error('Flash Solana wallet is not linked'), { status: 409 });
  const payload = { payer, owner };
  const base = flashMainAccountContext(owner);
  const transaction = await buildFlashBaseVersionedTransaction([
    flashDelegateBasketInstruction(owner, payer),
  ], flashPublicKey(payer, 'Flash payer'));
  return {
    transaction,
    transactions: [transaction],
    request: payload,
    builder: 'flash_trade_main_account',
    instruction: 'delegate_basket',
    txKind: 'account',
    api: FLASH_API,
    flash_program_id: FLASH_MAIN_PROGRAM_ID,
    basket: base.basket.toBase58(),
  };
}

async function buildDepositDirectTx(body, owner) {
  if (!isSolanaAddress(owner)) throw Object.assign(new Error('Flash Solana wallet is not linked'), { status: 409 });
  const amount = String(body.amount || body.inputAmountUi || body.input_amount_ui || '').trim();
  if (!amount || !(Number(amount) > 0)) throw Object.assign(new Error('amount is required'), { status: 400 });
  const tokenMint = String(body.tokenMint || body.token_mint || FLASH_USDC_MINT);
  if (tokenMint !== FLASH_USDC_MINT) {
    throw Object.assign(new Error('Only USDC deposits are supported for Flash in Clash'), { status: 400 });
  }
  const payload = {
    owner,
    tokenMint,
    amount,
  };
  const base = flashMainAccountContext(owner);
  const tokenMintPk = flashPublicKey(tokenMint, 'Flash deposit token mint');
  const depositorTokenAccount = getAssociatedTokenAddressSync(
    tokenMintPk,
    base.ownerPk,
    true,
    TOKEN_PROGRAM_ID,
    ASSOCIATED_TOKEN_PROGRAM_ID,
  );
  const amountRaw = parseUiAmountToRaw(amount, FLASH_USDC_DECIMALS, 'Flash deposit amount');
  const transaction = await buildFlashBaseVersionedTransaction([
    createAssociatedTokenAccountIdempotentInstruction(
      base.ownerPk,
      depositorTokenAccount,
      base.ownerPk,
      tokenMintPk,
      TOKEN_PROGRAM_ID,
      ASSOCIATED_TOKEN_PROGRAM_ID,
    ),
    flashDepositDirectInstruction(owner, amountRaw, tokenMint),
  ], base.ownerPk);
  return {
    transaction,
    transactions: [transaction],
    request: payload,
    builder: 'flash_trade_main_account',
    instruction: 'deposit_direct',
    txKind: 'account',
    api: FLASH_API,
    flash_program_id: FLASH_MAIN_PROGRAM_ID,
    user_deposit_ledger: base.userDepositLedger.toBase58(),
    token_account: depositorTokenAccount.toBase58(),
    amount_raw: amountRaw.toString(),
  };
}

async function buildReferralTx(body, owner) {
  if (!isSolanaAddress(owner)) throw Object.assign(new Error('Flash Solana wallet is not linked'), { status: 409 });
  const ownerPk = flashPublicKey(owner, 'Flash referral owner');
  const current = await getUserReferralByAddress(ownerPk.toBase58());
  if (current.has_referrer === true) {
    return {
      ok: true,
      skipped: true,
      already_linked: true,
      referral: current,
      referral_code: current.referral_code,
      referral_url: current.referral_url,
      txKind: 'setup',
    };
  }
  if (current.has_any_referrer === true && current.matches_clash !== true) {
    throw Object.assign(new Error('This Flash wallet already has a different on-chain referrer. Use a wallet without a Flash referrer or contact support.'), {
      status: 409,
      data: current,
    });
  }
  if (current.expected_token_stake_exists === false) {
    throw Object.assign(new Error('Flash referral code is configured, but its token stake account is not available on-chain.'), {
      status: 502,
      data: current,
    });
  }
  const tokenStakeAccount = flashPublicKey(current.expected_token_stake_account, 'Flash referral token stake');
  const referralAccount = flashPublicKey(current.referral_account, 'Flash referral account');
  const ix = new TransactionInstruction({
    programId: FLASH_MAIN_PROGRAM_PK,
    keys: [
      flashMeta(ownerPk, true, true),
      flashMeta(ownerPk, true, true),
      flashMeta(tokenStakeAccount),
      flashMeta(referralAccount, false, true),
      flashMeta(SystemProgram.programId),
    ],
    data: FLASH_ACCOUNT_DISCRIMINATORS.createReferral,
  });
  const transaction = await buildFlashBaseVersionedTransaction([ix], ownerPk);
  return {
    ok: true,
    transaction,
    transactions: [transaction],
    txKind: 'setup',
    builder: 'flash_trade_main_referral',
    referral: current,
    referral_code: current.referral_code,
    referral_url: current.referral_url,
  };
}

async function buildRequestWithdrawalTx(body, owner) {
  if (!isSolanaAddress(owner)) throw Object.assign(new Error('Flash Solana wallet is not linked'), { status: 409 });
  const amount = String(body.amount || body.inputAmountUi || body.input_amount_ui || '').trim();
  if (!amount || !(Number(amount) > 0)) throw Object.assign(new Error('amount is required'), { status: 400 });
  const payload = {
    owner,
    tokenMint: String(body.tokenMint || body.token_mint || FLASH_USDC_MINT),
    amount,
    includeCustodySettlement: body.includeCustodySettlement !== false && body.include_custody_settlement !== false,
  };
  const result = await requestFirst(flashAccountBuilderPaths('request-withdrawal'), { method: 'POST', body: payload });
  if (!result?.transactionBase64) throw Object.assign(new Error('Flash builder returned no transactionBase64'), { status: 502, data: result });
  return { ...result, transaction: result.transactionBase64, transactions: [result.transactionBase64], request: payload, builder: 'flash_trade_account', txKind: 'account', api: FLASH_API };
}

async function buildExecuteWithdrawalTx(body, owner) {
  if (!isSolanaAddress(owner)) throw Object.assign(new Error('Flash Solana wallet is not linked'), { status: 409 });
  const payload = {
    owner,
    tokenMint: String(body.tokenMint || body.token_mint || FLASH_USDC_MINT),
    includeCustodySettlement: body.includeCustodySettlement !== false && body.include_custody_settlement !== false,
  };
  const result = await requestFirst(flashAccountBuilderPaths('execute-withdrawal'), { method: 'POST', body: payload });
  if (!result?.transactionBase64) throw Object.assign(new Error('Flash builder returned no transactionBase64'), { status: 502, data: result });
  return { ...result, transaction: result.transactionBase64, transactions: [result.transactionBase64], request: payload, builder: 'flash_trade_account', txKind: 'account', api: FLASH_API };
}

function txAccountKeyText(key) {
  return String(key?.pubkey || key?.publicKey || key || '');
}

function collectTxProgramIds(parsedTx) {
  const programs = new Set();
  const keys = parsedTx?.transaction?.message?.accountKeys || [];
  const keyAt = (index) => txAccountKeyText(keys[index]);
  const addInstruction = (ix) => {
    if (!ix) return;
    const direct = ix.programId?.toString?.() || ix.programId || ix.programAddress || ix.program;
    if (direct) programs.add(String(direct));
    if (Number.isInteger(ix.programIdIndex)) {
      const key = keyAt(ix.programIdIndex);
      if (key) programs.add(key);
    }
  };
  for (const ix of parsedTx?.transaction?.message?.instructions || []) addInstruction(ix);
  for (const group of parsedTx?.meta?.innerInstructions || []) {
    for (const ix of group?.instructions || []) addInstruction(ix);
  }
  for (const line of parsedTx?.meta?.logMessages || []) {
    const match = String(line || '').match(/^Program ([1-9A-HJ-NP-Za-km-z]{32,44}) invoke/i);
    if (match?.[1]) programs.add(match[1]);
  }
  return programs;
}

function txSignedByWallet(parsedTx, wallet) {
  const keys = parsedTx?.transaction?.message?.accountKeys || [];
  return keys.some((key, index) => {
    const text = txAccountKeyText(key);
    const signer = key?.signer === true || (index === 0 && key?.signer !== false);
    return signer && text === wallet;
  });
}

async function getTransactionStatus(signature) {
  if (!signature) throw Object.assign(new Error('signature required'), { status: 400 });
  const parsed = await getParsedFlashTransaction(signature);
  const logs = Array.isArray(parsed?.meta?.logMessages) ? parsed.meta.logMessages.slice(-30) : [];
  const programError = decodeFlashProgramError(parsed?.meta?.err, logs);
  return {
    found: !!parsed,
    err: parsed?.meta?.err || null,
    program_error: programError,
    error_message: programError?.message || null,
    logs,
    slot: parsed?.slot || null,
    blockTime: parsed?.blockTime || null,
    confirmationStatus: parsed ? 'confirmed' : null,
  };
}

async function recordTradeReport(db, playerId, body, owner) {
  const signature = String(body.signature || body.tx_hash || body.tx || '').trim();
  if (!signature) throw Object.assign(new Error('signature required'), { status: 400 });
  if (!isSolanaAddress(owner)) throw Object.assign(new Error('Flash Solana wallet is not linked'), { status: 409 });
  let decoded;
  try {
    const mod = bs58.decode || bs58.default?.decode;
    decoded = mod(signature);
  } catch {}
  if (!decoded || decoded.length !== 64) throw Object.assign(new Error('invalid Solana signature'), { status: 400 });
  const parsed = await getParsedFlashTransaction(signature);
  if (!parsed) throw Object.assign(new Error('Flash transaction not found yet'), { status: 404 });
  if (parsed.meta?.err) throw Object.assign(new Error('Flash transaction failed on-chain'), { status: 400, data: parsed.meta.err });
  const sessionSigner = String(body.signer || body.sessionSigner || body.session_signer || '').trim();
  const sessionToken = String(body.sessionToken || body.session_token || '').trim();
  let signerProof = { type: 'owner', signer: owner };
  if (!txSignedByWallet(parsed, owner)) {
    if (!sessionSigner || !sessionToken || !txSignedByWallet(parsed, sessionSigner)) {
      throw Object.assign(new Error('Flash transaction was not signed by linked wallet or an authorized session signer'), { status: 403 });
    }
    const session = await verifyFlashSessionSigner({
      sessionToken,
      signer: sessionSigner,
      owner,
      blockTime: parsed.blockTime,
    });
    signerProof = {
      type: 'gpl_session',
      signer: sessionSigner,
      sessionToken,
      validUntil: session.validUntil,
    };
  }
  const programs = collectTxProgramIds(parsed);
  if (!FLASH_PROGRAM_IDS.length) {
    throw Object.assign(new Error('FLASH_PROGRAM_IDS must be configured before Flash rewards can be verified'), { status: 503 });
  }
  const hasFlashProgram = FLASH_PROGRAM_IDS.some(id => programs.has(id));
  if (!hasFlashProgram) throw Object.assign(new Error('Flash program not found in transaction'), { status: 400 });
  if (parsed.blockTime && Date.now() - parsed.blockTime * 1000 > TX_MAX_AGE_MS) {
    throw Object.assign(new Error('Flash transaction is too old for rewards'), { status: 400 });
  }
  const symbol = normalizeToken(body.symbol || body.outputTokenSymbol || body.output_token_symbol || 'SOL');
  const side = normalizeSide(body.side || body.tradeType || body.trade_type);
  const leverage = Math.max(1, Number(body.leverage || 1));
  const amount = Math.max(0, Number(body.amount || body.inputAmountUi || body.input_amount_ui || body.margin_usd || 0));
  const notional = Math.max(0, Math.min(10_000_000, Number(body.notional_usd || body.notionalUsd || (amount * leverage)) || 0));
  const inserted = db.addTrade(playerId, {
    symbol,
    side: side.toLowerCase(),
    orderType: String(body.order_type || body.orderType || 'market').toLowerCase(),
    amount: String(amount || notional),
    price: body.price == null ? null : String(body.price),
    orderId: signature,
    clientOrderId: `flash:${signature}`,
    status: 'filled',
    dex: 'flash',
    notional_usd: notional,
    verifiedSource: 'flash_tx',
    fee: body.fee == null ? null : String(body.fee),
    proofJson: JSON.stringify({
      signature,
      owner,
      signerProof,
      programs: Array.from(programs),
      blockTime: parsed.blockTime || null,
      slot: parsed.slot || null,
      source: 'flash_transaction_builder',
    }),
  });
  return {
    ...inserted,
    signature,
    notional_usd: notional,
    block_time: parsed.blockTime || null,
  };
}

function configStatus() {
  return {
    dex: 'flash',
    label: 'Flash Trade',
    api: FLASH_API,
    app_url: FLASH_APP_URL,
    referral_code: FLASH_REFERRAL_CODE,
    referral_url: FLASH_REFERRAL_URL,
    referral_onchain_supported: true,
    referral_program_id: FLASH_MAIN_PROGRAM_ID,
    docs_url: FLASH_DOCS_URL,
    v2_rpc_url: FLASH_V2_RPC_URL,
    usdc_mint: FLASH_USDC_MINT,
    program_ids: FLASH_PROGRAM_IDS,
    rewards_verification_ready: FLASH_PROGRAM_IDS.length > 0,
    transaction_builder_main: true,
    transaction_builder_v2_account_setup_fallback: false,
    native_order_builder: true,
    v2_client_sdk: 'magic-trade-client@0.2.0',
    flash_main_funding_balance: 'max(FLASH6 UserDepositLedger.deposits - FLASH6 Basket.debits + FLASH6 Basket.pendingCredits, 0); /v2/owner is beta-only fallback and must not drive spendable balance',
  };
}

module.exports = {
  FLASH_API,
  FLASH_APP_URL,
  FLASH_DOCS_URL,
  FLASH_PROGRAM_IDS,
  configStatus,
  isSolanaAddress,
  getHealth,
  getTokens,
  getPrices,
  getMarketInfo,
  getOwnerSnapshot,
  getWalletUsdcBalance,
  getUserReferralByAddress,
  getPositionsByAddress,
  getOrdersByAddress,
  buildReferralTx,
  buildOpenPositionTx,
  buildClosePositionTx,
  buildPlaceTpSlTx,
  buildCancelOrderTx,
  buildInitDepositLedgerTx,
  buildInitBasketTx,
  buildDelegateBasketTx,
  buildDepositDirectTx,
  buildRequestWithdrawalTx,
  buildExecuteWithdrawalTx,
  getTransactionStatus,
  submitSignedTransaction,
  recordTradeReport,
};
