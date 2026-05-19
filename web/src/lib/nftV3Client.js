// V3 NFT client helpers — paired with server/nft_v3_endpoints.js.
//
import { SOLANA_RPC_URLS, createSolanaConnection, solanaNonHeliusRpcUrls } from './solanaRpc';

// Public API:
//   fetchNftState(chain, tokenId)
//   fetchUpgradeQuote({ chain, tokenId, owner, newLevel, payment })
//   executeUpgrade({ evmWallet, chainKey, quoteResponse })
//
// Chain switching: each function expects the caller to have already
// connected the right wallet (Base / Arbitrum / Monad). `executeUpgrade`
// does the final `ensureChain` flip just before sending the tx.

const CHAIN_IDS = {
  base: 8453,
  arbitrum: 42161,
  monad: 143,
};

const NFT_IMAGE_BASE_URL = String(import.meta.env?.VITE_NFT_IMAGE_BASE_URL || '/cdn/nft').replace(/\/+$/, '');
const NFT_USE_TOKEN_IMAGE_PATHS = String(import.meta.env?.VITE_NFT_USE_TOKEN_IMAGE_PATHS || '').trim() === '1';
const OWNED_NFT_CACHE_TTL_MS = 60_000;
const OWNED_EVM_RPC_TIMEOUT_MS = 8_000;
const OWNED_SOLANA_DAS_TIMEOUT_MS = 7_000;
const OWNED_SOLANA_MAGIC_EDEN_TIMEOUT_MS = 7_000;
const OWNED_SOLANA_TOKEN2022_TIMEOUT_MS = 9_000;
const OWNED_SOLANA_CORE_TIMEOUT_MS = 14_000;
const OWNED_SERVER_FALLBACK_TIMEOUT_MS = 12_000;
const OWNED_EVM_SCAN_CHUNK_SIZE = 80;
const OWNED_CACHE_PREFIX = 'nft-owned-v3:';

const ownedNftMemoryCache = new Map();

function normalizeNftLevel(level) {
  const n = Number(level);
  return [1, 2, 3].includes(n) ? n : 1;
}

export function nftLevelImageUrl(level, id = null) {
  const lvl = normalizeNftLevel(level);
  if (NFT_USE_TOKEN_IMAGE_PATHS && id != null && id !== '') {
    return `${NFT_IMAGE_BASE_URL}/${lvl}/${encodeURIComponent(String(id))}.jpg`;
  }
  return `${NFT_IMAGE_BASE_URL}/${lvl}/default.jpg`;
}

const EVM_OWNED_CONFIG = {
  base: {
    chainId: 8453,
    contract: '0x404807F93E47AF3eaAec0E983f18DCB35E966FEC',
    rpcEnv: ['VITE_BASE_RPC_URL'],
    rpcUrls: [
      'https://base-rpc.publicnode.com',
      'https://base.drpc.org',
      'https://developer-access-mainnet.base.org',
    ],
  },
  arbitrum: {
    chainId: 42161,
    contract: '0x5Cc846B2bA0f030A5165a456eD903A5989E19F3F',
    rpcEnv: ['VITE_ARBITRUM_RPC_URL'],
    rpcUrls: [
      '/rpc/arb-pokt',
      '/rpc/arb-onfinality',
      '/rpc/arb-public',
      '/rpc/arb-tenderly',
      '/rpc/arb',
      'https://arb1.arbitrum.io/rpc',
      'https://arbitrum-one.publicnode.com',
      'https://arbitrum.llamarpc.com',
    ],
  },
  monad: {
    chainId: 143,
    contract: '0x5Cc846B2bA0f030A5165a456eD903A5989E19F3F',
    rpcEnv: ['VITE_MONAD_RPC_URL'],
    rpcUrls: [
      'https://rpc.monad.xyz',
      'https://rpc1.monad.xyz',
      'https://rpc2.monad.xyz',
      'https://rpc3.monad.xyz',
      'https://rpc-mainnet.monadinfra.com',
    ],
  },
};

const SOLANA_NFT_COLLECTION = 'FaNGuNf3rQjrWZaUeaGvwj63oAGuh5J3mc8wPUtHas4m';
const SOLANA_TOKEN2022_COLLECTION_ID = 'demon-king-token2022-v1';
const SOLANA_TOKEN2022_SYMBOL = 'DKING';

const EVM_OWNED_ABI = [
  {
    type: 'function',
    name: 'totalMinted',
    stateMutability: 'view',
    inputs: [],
    outputs: [{ type: 'uint256' }],
  },
  {
    type: 'function',
    name: 'ownerOf',
    stateMutability: 'view',
    inputs: [{ name: 'tokenId', type: 'uint256' }],
    outputs: [{ type: 'address' }],
  },
  {
    type: 'function',
    name: 'tokenLevel',
    stateMutability: 'view',
    inputs: [{ name: 'tokenId', type: 'uint256' }],
    outputs: [{ type: 'uint8' }],
  },
];

// Minimum ABI we need — must match DemonKingBaseV3 exactly.
const V3_UPGRADE_ABI = [
  {
    type: 'function',
    name: 'upgradeToken',
    stateMutability: 'payable',
    inputs: [
      { name: 'tokenId', type: 'uint256' },
      { name: 'newLevel', type: 'uint8' },
      { name: 'paymentToken', type: 'address' },
      { name: 'priceUnits', type: 'uint256' },
      { name: 'nonce', type: 'bytes32' },
      { name: 'deadline', type: 'uint256' },
      { name: 'signature', type: 'bytes' },
    ],
    outputs: [],
  },
];

const ERC20_ALLOWANCE_ABI = [
  { type: 'function', name: 'allowance', stateMutability: 'view',
    inputs: [{ type: 'address' }, { type: 'address' }], outputs: [{ type: 'uint256' }] },
  { type: 'function', name: 'approve', stateMutability: 'nonpayable',
    inputs: [{ type: 'address' }, { type: 'uint256' }], outputs: [{ type: 'bool' }] },
];

const ZERO_ADDRESS = '0x0000000000000000000000000000000000000000';

function isNativeToken(addr) {
  return !addr || /^0x0{40}$/i.test(addr);
}

/**
 * Get aggregate state for a token from the server:
 *   { chain, chainId, contract, tokenId, owner, level, levelLabel,
 *     starCount, upgradeable, nextLevel, upgradePriceUsdE6,
 *     usdc, cop, paused, imageUrl, wins, nextLevelRequiredWins }
 */
export async function fetchNftState(chain, tokenId) {
  const r = await fetch(`/api/nft/state/${chain}/${tokenId}`, { cache: 'no-store' });
  const j = await r.json().catch(() => ({}));
  if (!r.ok) throw new Error(j?.error || `state read failed (${r.status})`);
  return j;
}

/**
 * Request a server-signed upgrade quote.
 *   { chain, chainId, contract, owner, tokenId, currentLevel, newLevel,
 *     payment, paymentToken, priceUnits, priceFormatted, usdPriceE6,
 *     priceSource, nonce, deadline, signature, callData }
 */
export async function fetchUpgradeQuote({ chain, tokenId, owner, newLevel, payment }) {
  const r = await fetch('/api/nft/upgrade/quote', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ chain, tokenId: String(tokenId), owner, newLevel, payment }),
  });
  const j = await r.json().catch(() => ({}));
  if (!r.ok) throw new Error(j?.error || `quote failed (${r.status})`);
  return j;
}

/**
 * Execute the upgrade transaction.
 *   - For native ETH payment: sends `priceUnits` as msg.value.
 *   - For ERC-20 payment: first ensures allowance, then calls upgradeToken.
 *
 * Returns { hash, receipt }.
 *
 * `evmWallet` shape (mirrors what NftMintPanel uses):
 *   {
 *     ensureChain(chainId): Promise<void>,
 *     getPublicClient(chainId): viem PublicClient,
 *     getWalletClient(chainId): viem WalletClient,
 *   }
 */
export async function executeUpgrade({ evmWallet, chainKey, quoteResponse }) {
  if (!evmWallet) throw new Error('Wallet is not connected');
  const chainId = CHAIN_IDS[chainKey];
  if (!chainId) throw new Error(`Unsupported chain: ${chainKey}`);

  await evmWallet.ensureChain(chainId);
  const publicClient = evmWallet.getPublicClient(chainId);
  const walletClient = evmWallet.getWalletClient(chainId);
  if (!publicClient || !walletClient) throw new Error(`Wallet client for ${chainKey} is not ready`);

  const {
    contract,
    owner,
    tokenId,
    newLevel,
    paymentToken,
    priceUnits,
    nonce,
    deadline,
    signature,
  } = quoteResponse;

  const priceUnitsBig = BigInt(priceUnits);
  const tokenIdBig = BigInt(tokenId);
  const deadlineBig = BigInt(deadline);
  const isNative = isNativeToken(paymentToken);

  // ERC-20 path: approve marketplace contract to pull our tokens. The V3
  // contract itself is the spender for upgradeToken (it calls transferFrom
  // on msg.sender inside upgradeToken when paymentToken != address(0)).
  if (!isNative) {
    const allowance = await publicClient.readContract({
      address: paymentToken,
      abi: ERC20_ALLOWANCE_ABI,
      functionName: 'allowance',
      args: [owner, contract],
    });
    if (allowance < priceUnitsBig) {
      const approveHash = await walletClient.writeContract({
        address: paymentToken,
        abi: ERC20_ALLOWANCE_ABI,
        functionName: 'approve',
        args: [contract, priceUnitsBig],
      });
      await publicClient.waitForTransactionReceipt({ hash: approveHash });
    }
  }

  const hash = await walletClient.writeContract({
    address: contract,
    abi: V3_UPGRADE_ABI,
    functionName: 'upgradeToken',
    args: [tokenIdBig, newLevel, paymentToken, priceUnitsBig, nonce, deadlineBig, signature],
    value: isNative ? priceUnitsBig : 0n,
  });
  const receipt = await publicClient.waitForTransactionReceipt({ hash });
  return { hash, receipt };
}

/**
 * Combined one-shot: fetch quote + execute. Returns the same shape as
 * executeUpgrade plus the original quote response under `.quote`.
 */
export async function upgradeNft({ evmWallet, chainKey, tokenId, owner, newLevel, payment }) {
  const quote = await fetchUpgradeQuote({ chain: chainKey, tokenId, owner, newLevel, payment });
  const { hash, receipt } = await executeUpgrade({ evmWallet, chainKey, quoteResponse: quote });
  return { hash, receipt, quote };
}

// ====================================================================
// Bridge client helpers — talk to server's /bridge/init + /bridge/confirm
// (see server/nft_v3_endpoints.js).
//
// Flow:
//   1) bridgeInit({sourceChain, destChain, sourceTokenId/Address/Asset, destAddress})
//      → returns instructions for the source-chain burn tx (function name,
//        args, contract/module to call).
//   2) Caller submits the source burn tx (UI handles wallet signing).
//   3) bridgeConfirm({sourceChain, destChain, burnTxHash, destAddress})
//      → server verifies the burn and either:
//          - returns a signed receipt the caller submits on the EVM/Aptos dest, OR
//          - returns a server-mediated Solana mint result (already done).
// ====================================================================

export async function bridgeInit({ sourceChain, destChain, sourceTokenId, sourceTokenAddress, sourceAsset, destAddress, sourceOwner }) {
  const r = await fetch('/api/bridge/init', {
    method: 'POST', headers: { 'content-type': 'application/json' },
    body: JSON.stringify({ sourceChain, destChain, sourceTokenId, sourceTokenAddress, sourceAsset, destAddress, sourceOwner }),
  });
  const j = await r.json();
  if (!r.ok) throw Object.assign(new Error(j.error || `bridge/init failed (${r.status})`), { status: r.status, body: j });
  return j;
}

export async function bridgeConfirm({ sourceChain, destChain, burnTxHash, destAddress }) {
  const r = await fetch('/api/bridge/confirm', {
    method: 'POST', headers: { 'content-type': 'application/json' },
    body: JSON.stringify({ sourceChain, destChain, burnTxHash, destAddress }),
  });
  const j = await r.json();
  if (!r.ok) throw Object.assign(new Error(j.error || `bridge/confirm failed (${r.status})`), { status: r.status, body: j });
  return j;
}

// /bridge/relay — server submits the destination mint itself. Player only
// signs the source burn; everything after that is server-side, so no
// wallet-drop / out-of-gas / dismissed-prompt risk between burn and mint.
export async function bridgeRelay({ sourceChain, destChain, burnTxHash, destAddress }) {
  const r = await fetch('/api/bridge/relay', {
    method: 'POST', headers: { 'content-type': 'application/json' },
    body: JSON.stringify({ sourceChain, destChain, burnTxHash, destAddress }),
  });
  const j = await r.json();
  if (!r.ok) throw Object.assign(new Error(j.error || `bridge/relay failed (${r.status})`), { status: r.status, body: j });
  return j;
}

// Fetch the NFTs an address owns on a given chain. Backs the bridge UI's
// "pick an NFT" step so the player doesn't have to memorise token IDs or
// asset pubkeys.
//
// Returns:
//   {
//     chain: 'base' | 'arbitrum' | 'monad' | 'aptos' | 'solana',
//     owner: <address>,
//     total: <number>,
//     tokens: [
//       // EVM:    { tokenId, level, imageUrl }
//       // Aptos:  { tokenAddress, level, imageUrl }
//       // Solana: { asset, level, name, imageUrl }
//     ],
//   }
//
// Browser-first loaders avoid the server-side collection scans that can stall
// under public RPC rate limits. Server lookup stays as a bounded fallback.
function siteOrigin() {
  if (typeof window !== 'undefined' && window.location?.origin) return window.location.origin;
  return 'https://clashofperps.fun';
}

function normalizeRpcUrl(url) {
  const raw = String(url || '').trim();
  if (!raw) return '';
  if (raw.startsWith('/')) return `${siteOrigin()}${raw}`;
  return raw;
}

function envValue(name) {
  try {
    return String(import.meta.env?.[name] || '').trim();
  } catch {
    return '';
  }
}

function envFlag(name, fallback = false) {
  const raw = envValue(name);
  if (!raw) return fallback;
  return /^(1|true|yes|on)$/i.test(raw);
}

function uniqueValues(values) {
  const seen = new Set();
  return values.filter((value) => {
    const normalized = String(value || '').trim();
    if (!normalized || seen.has(normalized)) return false;
    seen.add(normalized);
    return true;
  });
}

function abortError() {
  try {
    return new DOMException('Aborted', 'AbortError');
  } catch {
    const err = new Error('Aborted');
    err.name = 'AbortError';
    return err;
  }
}

function throwIfAborted(signal) {
  if (signal?.aborted) throw abortError();
}

function isAbortError(err) {
  return err?.name === 'AbortError';
}

function withTimeout(promise, timeoutMs, label, signal) {
  return new Promise((resolve, reject) => {
    throwIfAborted(signal);
    let settled = false;
    const timeout = setTimeout(() => {
      if (settled) return;
      settled = true;
      reject(new Error(`${label} timed out`));
    }, timeoutMs);
    const onAbort = () => {
      if (settled) return;
      settled = true;
      clearTimeout(timeout);
      reject(abortError());
    };
    signal?.addEventListener?.('abort', onAbort, { once: true });
    promise.then(
      (value) => {
        if (settled) return;
        settled = true;
        clearTimeout(timeout);
        signal?.removeEventListener?.('abort', onAbort);
        resolve(value);
      },
      (err) => {
        if (settled) return;
        settled = true;
        clearTimeout(timeout);
        signal?.removeEventListener?.('abort', onAbort);
        reject(err);
      },
    );
  });
}

async function fetchWithTimeout(url, options = {}, timeoutMs, label, outerSignal) {
  throwIfAborted(outerSignal);
  const controller = new AbortController();
  let timedOut = false;
  const timeout = setTimeout(() => {
    timedOut = true;
    controller.abort();
  }, timeoutMs);
  const onAbort = () => controller.abort();
  outerSignal?.addEventListener?.('abort', onAbort, { once: true });
  try {
    return await fetch(url, { ...options, signal: controller.signal });
  } catch (err) {
    if (outerSignal?.aborted) throw abortError();
    if (timedOut) throw new Error(`${label} timed out`);
    if (controller.signal.aborted) throw abortError();
    throw new Error(`${label} failed: ${err?.message || String(err)}`);
  } finally {
    clearTimeout(timeout);
    outerSignal?.removeEventListener?.('abort', onAbort);
  }
}

function ownedCacheKey(chain, address) {
  return `${OWNED_CACHE_PREFIX}${String(chain || '').toLowerCase()}:${String(address || '').toLowerCase()}`;
}

function readOwnedCache(key) {
  const now = Date.now();
  const memory = ownedNftMemoryCache.get(key);
  if (memory?.expiresAt > now) return memory.value;
  if (memory) ownedNftMemoryCache.delete(key);
  try {
    const raw = window?.sessionStorage?.getItem(key);
    if (!raw) return null;
    const parsed = JSON.parse(raw);
    if (parsed?.expiresAt > now && parsed?.value) {
      ownedNftMemoryCache.set(key, parsed);
      return parsed.value;
    }
    window.sessionStorage.removeItem(key);
  } catch {}
  return null;
}

function writeOwnedCache(key, value) {
  const entry = { expiresAt: Date.now() + OWNED_NFT_CACHE_TTL_MS, value };
  ownedNftMemoryCache.set(key, entry);
  try {
    window?.sessionStorage?.setItem(key, JSON.stringify(entry));
  } catch {}
}

function evmRpcUrls(chain) {
  const config = EVM_OWNED_CONFIG[chain];
  if (!config) return [];
  const envUrls = config.rpcEnv.map(envValue).filter(Boolean);
  return uniqueValues([...envUrls, ...config.rpcUrls]);
}

function evmChainDefinition(chain, defineChain, viemChains) {
  if (chain === 'base') return viemChains.base;
  if (chain === 'arbitrum') return viemChains.arbitrum;
  return defineChain({
    id: 143,
    name: 'Monad',
    nativeCurrency: { name: 'Monad', symbol: 'MON', decimals: 18 },
    rpcUrls: { default: { http: ['https://rpc.monad.xyz'] } },
    blockExplorers: { default: { name: 'Monadscan', url: 'https://monadscan.com' } },
    contracts: { multicall3: { address: '0xcA11bde05977b3631167028862bE2a173976CA11' } },
  });
}

async function createOwnedEvmClient(chain) {
  const [{ createPublicClient, defineChain, fallback, http }, viemChains] = await Promise.all([
    import('viem'),
    import('viem/chains'),
  ]);
  const urls = evmRpcUrls(chain);
  const transports = urls.map((url) => http(url, {
    retryCount: 1,
    retryDelay: 250,
    timeout: OWNED_EVM_RPC_TIMEOUT_MS,
  }));
  return createPublicClient({
    chain: evmChainDefinition(chain, defineChain, viemChains),
    transport: transports.length > 1
      ? fallback(transports, { rank: false, retryCount: 0 })
      : transports[0] || http(undefined, { timeout: OWNED_EVM_RPC_TIMEOUT_MS }),
    batch: { multicall: { wait: 25, batchSize: 30_000 } },
  });
}

function evmOwnedToken(chain, id, level) {
  return {
    tokenId: String(id),
    level: normalizeNftLevel(level),
    imageUrl: nftLevelImageUrl(level, id),
    chain,
  };
}

async function fetchOwnedNftsBrowserEvm({ chain, address, signal }) {
  const config = EVM_OWNED_CONFIG[chain];
  if (!config) throw new Error(`Unsupported EVM chain: ${chain}`);
  const { getAddress } = await import('viem');
  const owner = getAddress(address);
  const client = await createOwnedEvmClient(chain);
  const contract = getAddress(config.contract);
  const totalMinted = await withTimeout(client.readContract({
    address: contract,
    abi: EVM_OWNED_ABI,
    functionName: 'totalMinted',
  }), OWNED_EVM_RPC_TIMEOUT_MS, `${chain} totalMinted`, signal);
  const total = Number(totalMinted);
  if (!Number.isFinite(total) || total <= 0) {
    return { chain, owner, contract, total: 0, tokens: [], source: 'browser-evm' };
  }

  const ownedIds = [];
  for (let start = 1; start <= total; start += OWNED_EVM_SCAN_CHUNK_SIZE) {
    throwIfAborted(signal);
    const end = Math.min(total, start + OWNED_EVM_SCAN_CHUNK_SIZE - 1);
    const ids = Array.from({ length: end - start + 1 }, (_, idx) => start + idx);
    const calls = ids.map((id) => ({
      address: contract,
      abi: EVM_OWNED_ABI,
      functionName: 'ownerOf',
      args: [BigInt(id)],
    }));
    const owners = await withTimeout(client.multicall({ contracts: calls, allowFailure: true }),
      OWNED_EVM_RPC_TIMEOUT_MS, `${chain} owner scan`, signal);
    owners.forEach((row, idx) => {
      if (row?.status !== 'success') return;
      try {
        if (getAddress(row.result) === owner) ownedIds.push(ids[idx]);
      } catch {}
    });
  }

  let levels = [];
  if (ownedIds.length) {
    const levelCalls = ownedIds.map((id) => ({
      address: contract,
      abi: EVM_OWNED_ABI,
      functionName: 'tokenLevel',
      args: [BigInt(id)],
    }));
    const levelRows = await withTimeout(client.multicall({ contracts: levelCalls, allowFailure: true }),
      OWNED_EVM_RPC_TIMEOUT_MS, `${chain} level scan`, signal);
    levels = levelRows.map((row) => (row?.status === 'success' ? Number(row.result) || 1 : 1));
  }

  const tokens = ownedIds.map((id, idx) => evmOwnedToken(chain, id, levels[idx] || 1));
  return { chain, owner, contract, total, tokens, source: 'browser-evm' };
}

function solanaDasUrls() {
  const heliusKey = envValue('VITE_HELIUS_API_KEY') || envValue('VITE_SOLANA_HELIUS_API_KEY');
  const alchemyKey = envValue('VITE_ALCHEMY_SOLANA_API_KEY') || envValue('VITE_SOLANA_ALCHEMY_API_KEY');
  return uniqueValues([
    envValue('VITE_SOLANA_DAS_RPC_URL'),
    heliusKey ? `https://mainnet.helius-rpc.com/?api-key=${encodeURIComponent(heliusKey)}` : '',
    alchemyKey ? `https://solana-mainnet.g.alchemy.com/v2/${encodeURIComponent(alchemyKey)}` : '',
  ]).map(normalizeRpcUrl);
}

function solanaCoreRpcUrls() {
  if (!envFlag('VITE_SOLANA_ENABLE_CORE_GPA', false)) return [];
  return solanaNonHeliusRpcUrls(uniqueValues([
    envValue('VITE_SOLANA_CORE_RPC_URL'),
    envValue('VITE_SOLANA_RPC_URL'),
    ...SOLANA_RPC_URLS,
    'https://solana-rpc.publicnode.com',
  ]).map(normalizeRpcUrl));
}

async function solanaDasRpc(url, method, params, signal) {
  const res = await fetchWithTimeout(url, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ jsonrpc: '2.0', id: 'owned-nfts', method, params }),
  }, OWNED_SOLANA_DAS_TIMEOUT_MS, `Solana DAS ${method}`, signal);
  const payload = await res.json().catch(() => null);
  if (!res.ok) throw new Error(`Solana DAS HTTP ${res.status}`);
  if (payload?.error) throw new Error(payload.error.message || `Solana DAS ${payload.error.code || 'error'}`);
  if (!payload?.result) throw new Error('Solana DAS returned no result');
  return payload.result;
}

function isSolanaCollectionAsset(asset) {
  const grouping = Array.isArray(asset?.grouping) ? asset.grouping : [];
  return grouping.some((row) => (
    String(row?.group_key || row?.key || '').toLowerCase() === 'collection'
    && String(row?.group_value || row?.value || '') === SOLANA_NFT_COLLECTION
  ));
}

function solanaAttributeLists(asset) {
  return [
    asset?.content?.metadata?.attributes,
    asset?.content?.metadata?.properties?.attributes,
    asset?.attributes?.attributeList,
    asset?.plugins?.attributes?.attributeList,
  ].filter(Array.isArray);
}

function solanaAssetLevel(asset) {
  for (const attrs of solanaAttributeLists(asset)) {
    const attr = attrs.find((row) => {
      const key = String(row?.trait_type || row?.key || row?.name || '').trim().toLowerCase();
      return key === 'level';
    });
    if (!attr) continue;
    const level = Number(attr.value);
    if ([1, 2, 3].includes(level)) return level;
  }
  const nameLevel = String(asset?.content?.metadata?.name || asset?.content?.json_uri || '').match(/\bL(?:evel)?\s*([123])\b/i);
  return nameLevel ? Number(nameLevel[1]) : 1;
}

function solanaAssetImage(asset, level) {
  return asset?.content?.links?.image
    || asset?.content?.files?.find?.((file) => file?.uri)?.uri
    || nftLevelImageUrl(level, asset?.id || 'solana');
}

function magicEdenSolanaTokenLooksRelevant(token) {
  const candidates = [
    token?.mccAddress,
    token?.mcc_address,
    token?.mcc,
    token?.collectionAddress,
    token?.collectionMint,
    token?.collectionMintAddress,
    token?.onChainCollectionAddress,
    token?.collectionDetails?.mccAddress,
    token?.collectionDetails?.collectionAddress,
  ].map((value) => String(value || ''));
  if (candidates.includes(SOLANA_NFT_COLLECTION)) return true;
  const name = String(token?.name || token?.title || '').toLowerCase();
  const collection = String(token?.collection || token?.collectionName || '').toLowerCase();
  const uri = String(token?.uri || token?.tokenUri || token?.metadataUri || '').toLowerCase();
  const attrs = Array.isArray(token?.attributes) ? token.attributes : [];
  return name.includes('demon king')
    || collection.includes('demon king')
    || uri.includes('/api/nft/solana/')
    || attrs.some((attr) => String(attr?.trait_type || attr?.key || '').toLowerCase() === 'sourceref');
}

function magicEdenSolanaToken(token) {
  const id = String(
    token?.mintAddress
    || token?.mint
    || token?.asset
    || token?.id
    || ''
  );
  const level = solanaAssetLevel({
    content: {
      metadata: {
        name: token?.name,
        attributes: Array.isArray(token?.attributes) ? token.attributes : [],
      },
      json_uri: token?.uri || token?.tokenUri || token?.metadataUri,
    },
  });
  return {
    asset: id,
    level,
    name: token?.name || 'Demon King',
    imageUrl: token?.image || token?.img || token?.imageUrl || nftLevelImageUrl(level, id || 'solana'),
    chain: 'solana',
  };
}

async function fetchOwnedNftsFromMagicEden(address, signal) {
  const baseUrl = `https://api-mainnet.magiceden.dev/v2/wallets/${encodeURIComponent(address)}/tokens`;
  const tokens = [];
  let lastError = null;
  const queries = [
    { kind: 'collection', qs: `offset=0&limit=500&listStatus=both&mcc_address=${encodeURIComponent(SOLANA_NFT_COLLECTION)}` },
    { kind: 'wallet', qs: 'offset=0&limit=500&listStatus=both' },
  ];
  for (const query of queries) {
    try {
      const res = await fetchWithTimeout(`${baseUrl}?${query.qs}`, {
        headers: { Accept: 'application/json' },
        credentials: 'omit',
        cache: 'no-store',
      }, OWNED_SOLANA_MAGIC_EDEN_TIMEOUT_MS, 'Magic Eden Solana NFT lookup', signal);
      const rows = await res.json().catch(() => null);
      if (!res.ok) throw new Error(`Magic Eden HTTP ${res.status}`);
      if (!Array.isArray(rows)) throw new Error('Magic Eden returned no token list');
      const matched = rows
        .filter(magicEdenSolanaTokenLooksRelevant)
        .map(magicEdenSolanaToken)
        .filter((token) => token.asset);
      tokens.push(...matched);
      if (tokens.length || query.kind === 'wallet') break;
    } catch (err) {
      if (isAbortError(err)) throw err;
      lastError = err;
    }
  }
  if (tokens.length) {
    const unique = [];
    const seen = new Set();
    for (const token of tokens) {
      if (seen.has(token.asset)) continue;
      seen.add(token.asset);
      unique.push(token);
    }
    return {
      chain: 'solana',
      owner: address,
      collection: SOLANA_NFT_COLLECTION,
      total: unique.length,
      tokens: unique,
      source: 'browser-solana-magiceden',
    };
  }
  if (lastError) throw lastError;
  return null;
}

function publicKeyString(value) {
  if (!value) return '';
  if (typeof value === 'string') return value;
  if (typeof value.toBase58 === 'function') return value.toBase58();
  if (typeof value.toString === 'function' && value.toString !== Object.prototype.toString) return value.toString();
  return '';
}

function solanaCoreAssetId(asset) {
  return publicKeyString(asset?.publicKey || asset?.address || asset?.id);
}

function solanaCoreAssetCollection(asset) {
  const ua = asset?.updateAuthority;
  if (ua?.__kind === 'Collection') return publicKeyString(ua.fields?.[0]);
  const candidates = [
    asset?.collection?.publicKey,
    asset?.collection?.address,
    asset?.collection,
    asset?.collectionAddress,
  ];
  for (const candidate of candidates) {
    const s = publicKeyString(candidate);
    if (/^[1-9A-HJ-NP-Za-km-z]{32,44}$/.test(s)) return s;
  }
  return '';
}

function solanaCoreAssetLooksRelevant(asset) {
  if (solanaCoreAssetCollection(asset) === SOLANA_NFT_COLLECTION) return true;
  const name = String(asset?.name || '').toLowerCase();
  const uri = String(asset?.uri || '').toLowerCase();
  const attrs = solanaAttributeLists(asset).flat();
  return name.includes('demon king')
    || uri.includes('/api/nft/solana/')
    || attrs.some((attr) => String(attr?.key || attr?.trait_type || '').toLowerCase() === 'sourceref');
}

function solanaCoreAssetToken(asset) {
  const id = solanaCoreAssetId(asset);
  const level = solanaAssetLevel(asset);
  return {
    asset: id,
    level,
    name: asset?.name || 'Demon King',
    imageUrl: nftLevelImageUrl(level, id || 'solana'),
    chain: 'solana',
  };
}

async function fetchOwnedNftsFromSolanaDasEndpoint(url, address, signal) {
  const limit = 1000;
  const tokens = [];
  let page = 1;
  let total = 0;
  while (page <= 5) {
    throwIfAborted(signal);
    const result = await solanaDasRpc(url, 'getAssetsByOwner', {
      ownerAddress: address,
      page,
      limit,
      displayOptions: {
        showCollectionMetadata: true,
        showFungible: false,
        showNativeBalance: false,
      },
    }, signal);
    const items = Array.isArray(result.items) ? result.items : [];
    total = Number(result.total) || items.length;
    for (const asset of items) {
      if (!isSolanaCollectionAsset(asset)) continue;
      const level = solanaAssetLevel(asset);
      tokens.push({
        asset: String(asset.id),
        level,
        name: asset?.content?.metadata?.name || 'Demon King',
        imageUrl: solanaAssetImage(asset, level),
        chain: 'solana',
      });
    }
    if (items.length < limit || (Number(result.total) && page * limit >= Number(result.total))) break;
    page += 1;
  }
  return { chain: 'solana', owner: address, collection: SOLANA_NFT_COLLECTION, total, tokens, source: 'browser-solana-das' };
}

function solanaToken2022AdditionalMetadata(meta) {
  return Array.isArray(meta?.additionalMetadata) ? meta.additionalMetadata : [];
}

function solanaToken2022MetadataText(meta) {
  const extra = solanaToken2022AdditionalMetadata(meta)
    .map((row) => Array.isArray(row) ? row.join('=') : String(row || ''))
    .join(' ');
  return `${meta?.name || ''} ${meta?.symbol || ''} ${meta?.uri || ''} ${extra}`;
}

function solanaToken2022MetadataLooksRelevant(meta) {
  if (!meta) return false;
  const symbol = String(meta.symbol || '').trim().toUpperCase();
  const name = String(meta.name || '').trim().toLowerCase();
  const uri = String(meta.uri || '').trim().toLowerCase();
  const extra = solanaToken2022AdditionalMetadata(meta)
    .map((row) => String(Array.isArray(row) ? row.join('=') : row || '').toLowerCase());
  return symbol === SOLANA_TOKEN2022_SYMBOL
    && name.includes('demon king')
    && (
      uri.includes('/api/nft/solana/token2022/')
      || uri.includes(SOLANA_TOKEN2022_COLLECTION_ID)
      || extra.some((row) => row.includes(SOLANA_TOKEN2022_COLLECTION_ID))
    );
}

function solanaToken2022Level(meta) {
  const match = solanaToken2022MetadataText(meta).match(/(?:level|lvl|l)[=\s:_-]*([123])\b/i);
  return match ? Number(match[1]) : 1;
}

function solanaToken2022Token({ mint, tokenAccount, meta }) {
  const level = solanaToken2022Level(meta);
  return {
    asset: mint,
    mint,
    tokenAccount,
    level,
    name: meta?.name || `Demon King L${level}`,
    imageUrl: nftLevelImageUrl(level, mint),
    chain: 'solana',
    standard: 'token2022',
  };
}

async function fetchOwnedToken2022SolanaNftsFromRpc(url, address, signal) {
  const [{ Connection, PublicKey }, splToken] = await Promise.all([
    import('@solana/web3.js'),
    import('@solana/spl-token'),
  ]);
  const { TOKEN_2022_PROGRAM_ID, getTokenMetadata } = splToken;
  const owner = new PublicKey(address);
  const conn = createSolanaConnection(Connection, url, 'confirmed');
  const rows = await withTimeout(
    conn.getParsedTokenAccountsByOwner(owner, { programId: TOKEN_2022_PROGRAM_ID }, 'confirmed'),
    OWNED_SOLANA_TOKEN2022_TIMEOUT_MS,
    'Solana Token-2022 owner scan',
    signal,
  );
  const candidates = (rows.value || []).map((row) => {
    const parsed = row?.account?.data?.parsed?.info || {};
    const amount = parsed?.tokenAmount || {};
    return {
      mint: String(parsed.mint || ''),
      tokenAccount: row.pubkey?.toBase58?.() || String(row.pubkey || ''),
      amount: String(amount.amount || '0'),
      decimals: Number(amount.decimals),
    };
  }).filter((row) => (
    /^[1-9A-HJ-NP-Za-km-z]{32,44}$/.test(row.mint)
    && row.tokenAccount
    && row.amount === '1'
    && row.decimals === 0
  )).slice(0, 40);

  const tokens = [];
  await withTimeout(Promise.all(candidates.map(async (candidate) => {
    try {
      throwIfAborted(signal);
      const mintPk = new PublicKey(candidate.mint);
      const meta = await getTokenMetadata(conn, mintPk, 'confirmed', TOKEN_2022_PROGRAM_ID);
      if (!solanaToken2022MetadataLooksRelevant(meta)) return;
      tokens.push(solanaToken2022Token({ ...candidate, meta }));
    } catch (err) {
      if (isAbortError(err)) throw err;
    }
  })), OWNED_SOLANA_TOKEN2022_TIMEOUT_MS, 'Solana Token-2022 metadata scan', signal);

  return {
    chain: 'solana',
    owner: address,
    collection: SOLANA_TOKEN2022_COLLECTION_ID,
    total: tokens.length,
    tokens,
    source: 'browser-solana-token2022',
  };
}

async function fetchOwnedToken2022SolanaNfts(address, signal) {
  let lastError = null;
  let firstResult = null;
  for (const url of SOLANA_RPC_URLS.map(normalizeRpcUrl)) {
    try {
      const result = await fetchOwnedToken2022SolanaNftsFromRpc(url, address, signal);
      if (!firstResult) firstResult = result;
      if (result.tokens.length) return result;
    } catch (err) {
      if (isAbortError(err)) throw err;
      lastError = err;
    }
  }
  if (firstResult) return firstResult;
  if (lastError) throw lastError;
  return null;
}

async function fetchOwnedNftsBrowserSolana({ address, signal }) {
  let lastError = null;
  let emptyBrowserResult = null;
  try {
    const token2022Result = await fetchOwnedToken2022SolanaNfts(address, signal);
    if (token2022Result?.tokens?.length) return token2022Result;
    if (token2022Result) emptyBrowserResult = token2022Result;
  } catch (err) {
    if (isAbortError(err)) throw err;
    lastError = err;
  }
  const urls = solanaDasUrls();
  for (const url of urls) {
    try {
      const dasResult = await fetchOwnedNftsFromSolanaDasEndpoint(url, address, signal);
      if (dasResult?.tokens?.length) return dasResult;
      if (dasResult && !emptyBrowserResult) emptyBrowserResult = dasResult;
    } catch (err) {
      if (isAbortError(err)) throw err;
      lastError = err;
    }
  }
  if (envFlag('VITE_SOLANA_ENABLE_MAGIC_EDEN_INDEXER', false)) {
    try {
      const magicEdenResult = await fetchOwnedNftsFromMagicEden(address, signal);
      if (magicEdenResult?.tokens?.length) return magicEdenResult;
      if (magicEdenResult && !emptyBrowserResult) emptyBrowserResult = magicEdenResult;
    } catch (err) {
      if (isAbortError(err)) throw err;
      lastError = err;
    }
  }
  for (const url of solanaCoreRpcUrls()) {
    try {
      throwIfAborted(signal);
      const { createUmi } = await import('@metaplex-foundation/umi-bundle-defaults');
      const { mplCore, fetchAssetsByOwner } = await import('@metaplex-foundation/mpl-core');
      const { publicKey } = await import('@metaplex-foundation/umi');
      const umi = createUmi(url).use(mplCore());
      const assets = await withTimeout(
        fetchAssetsByOwner(umi, publicKey(address), { skipDerivePlugins: true }),
        OWNED_SOLANA_CORE_TIMEOUT_MS,
        'Solana browser owner scan',
        signal,
      );
      const tokens = (assets || [])
        .filter(solanaCoreAssetLooksRelevant)
        .map(solanaCoreAssetToken)
        .filter((token) => token.asset);
      const coreResult = {
        chain: 'solana',
        owner: address,
        collection: SOLANA_NFT_COLLECTION,
        total: tokens.length,
        tokens,
        source: 'browser-solana-core',
      };
      if (coreResult.tokens.length) return coreResult;
      if (!emptyBrowserResult) emptyBrowserResult = coreResult;
    } catch (err) {
      if (isAbortError(err)) throw err;
      lastError = err;
    }
  }
  if (lastError && !emptyBrowserResult) throw lastError;
  return null;
}

async function fetchOwnedNftsFromServer({ chain, address, signal }) {
  const r = await fetchWithTimeout(`/api/nft/owned/${encodeURIComponent(chain)}/${encodeURIComponent(address)}`, {
    cache: 'no-store',
  }, OWNED_SERVER_FALLBACK_TIMEOUT_MS, 'server owned NFT lookup', signal);
  const j = await r.json().catch(() => ({}));
  if (!r.ok) throw Object.assign(new Error(j.error || `nft/owned failed (${r.status})`), { status: r.status, body: j });
  return { ...j, source: j.source || 'server' };
}

export async function fetchOwnedNfts({ chain, address, signal } = {}) {
  if (!chain || !address) throw new Error('chain + address required');
  const chainKey = String(chain).toLowerCase();
  const key = ownedCacheKey(chainKey, address);
  const cached = readOwnedCache(key);
  if (cached) return cached;

  let browserError = null;
  try {
    let direct = null;
    if (EVM_OWNED_CONFIG[chainKey]) {
      direct = await fetchOwnedNftsBrowserEvm({ chain: chainKey, address, signal });
    } else if (chainKey === 'solana') {
      direct = await fetchOwnedNftsBrowserSolana({ address, signal });
    }
    if (direct && (chainKey !== 'solana' || (direct.tokens || []).length > 0)) {
      writeOwnedCache(key, direct);
      return direct;
    }
  } catch (err) {
    if (isAbortError(err)) throw err;
    browserError = err;
  }

  try {
    const fallback = await fetchOwnedNftsFromServer({ chain: chainKey, address, signal });
    writeOwnedCache(key, fallback);
    return fallback;
  } catch (err) {
    if (isAbortError(err)) throw err;
    const message = browserError
      ? 'NFT auto-load timed out. Paste the token or asset id manually and try again.'
      : (err?.message || 'Failed to load NFTs');
    throw Object.assign(new Error(message), { cause: err, browserError });
  }
}
