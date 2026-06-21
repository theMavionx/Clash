// V3 NFT client helpers — paired with server/nft_v3_endpoints.js.
//
import { formatUnits } from 'viem';
import { SOLANA_RPC_URLS, createSolanaConnection, solanaNonHeliusRpcUrls } from './solanaRpc';

// Public API:
//   fetchNftState(chain, tokenId)
//   fetchUpgradeQuote({ chain, tokenId, owner, newLevel, payment })
//   executeUpgrade({ evmWallet, chainKey, quoteResponse })
//
// Chain switching: each function expects the caller to have already
// connected the right wallet (Base / Arbitrum / Monad / Ink). `executeUpgrade`
// does the final `ensureChain` flip just before sending the tx.

const CHAIN_IDS = {
  base: 8453,
  arbitrum: 42161,
  monad: 143,
  ink: 57073,
};

const NFT_IMAGE_BASE_URL = String(import.meta.env?.VITE_NFT_IMAGE_BASE_URL || '/cdn/nft').replace(/\/+$/, '');
const LOCAL_NFT_IMAGE_BASE_URL = '/cdn/nft';
const LEGACY_NFT_IMAGE_HOSTS = new Set(['cdn.clashofperps.fun']);
const NFT_USE_TOKEN_IMAGE_PATHS = String(import.meta.env?.VITE_NFT_USE_TOKEN_IMAGE_PATHS || '').trim() === '1';
const OWNED_NFT_CACHE_TTL_MS = 60_000;
const OWNED_EVM_RPC_TIMEOUT_MS = 8_000;
const OWNED_SOLANA_DAS_TIMEOUT_MS = 7_000;
const OWNED_SOLANA_MAGIC_EDEN_TIMEOUT_MS = 7_000;
const OWNED_SOLANA_TOKEN2022_TIMEOUT_MS = 9_000;
const OWNED_SOLANA_CORE_TIMEOUT_MS = 14_000;
const OWNED_SERVER_FALLBACK_TIMEOUT_MS = 12_000;
const OWNED_EVM_SCAN_CHUNK_SIZE = 80;
const OWNED_CACHE_PREFIX = 'nft-owned-v4:';
const DEMON_KING_SYNC_CACHE_TTL_MS = 5 * 60_000;
const DEMON_KING_SYNC_CACHE_PREFIX = 'demon-king-sync:';
const DEMON_KING_EVM_CHAINS = ['base', 'arbitrum', 'monad', 'ink'];
const DEMON_KING_SUPPORTED_CHAINS = [...DEMON_KING_EVM_CHAINS, 'solana', 'aptos'];
const DEMON_KING_CHAIN_BY_DEX = {
  avantis: 'base',
  gmx: 'arbitrum',
  hyperliquid: 'arbitrum',
  risex: 'arbitrum',
  nado: 'ink',
  monad: 'monad',
  pacifica: 'solana',
  phoenix: 'solana',
  decibel: 'aptos',
};
const DEMON_KING_CHAIN_BY_EVM_CHAIN_ID = {
  8453: 'base',
  42161: 'arbitrum',
  143: 'monad',
  57073: 'ink',
};

const ownedNftMemoryCache = new Map();
const demonKingSyncMemoryCache = new Map();
const demonKingSyncInflight = new Map();

export const NFT_RARITY_LABELS = {
  common: 'Common',
  epic: 'Epic',
  legendary: 'Legendary',
};

const NFT_RARITY_CARD_COLORS = {
  common: {
    border: '#2F80ED',
    badgeBg: 'linear-gradient(180deg, #62B0FF 0%, #1769D1 100%)',
    badgeBorder: '#B9DEFF',
    badgeColor: '#FFFFFF',
    glow: 'rgba(47, 128, 237, 0.28)',
    shadow: 'rgba(47, 128, 237, 0.18)',
  },
  epic: {
    border: '#8B5CF6',
    badgeBg: 'linear-gradient(180deg, #B56BFF 0%, #6D28D9 100%)',
    badgeBorder: '#E6D1FF',
    badgeColor: '#FFFFFF',
    glow: 'rgba(139, 92, 246, 0.3)',
    shadow: 'rgba(139, 92, 246, 0.2)',
  },
  legendary: {
    border: '#F2BE37',
    badgeBg: 'linear-gradient(180deg, #FFE66A 0%, #F4A51C 100%)',
    badgeBorder: '#FFF2A8',
    badgeColor: '#4A2A00',
    glow: 'rgba(242, 190, 55, 0.38)',
    shadow: 'rgba(168, 107, 26, 0.24)',
  },
};

function normalizeNftLevel(level) {
  const n = Number(level);
  return [1, 2, 3].includes(n) ? n : 1;
}

export function normalizeNftRarity(value) {
  const key = String(value || '').trim().toLowerCase();
  return Object.prototype.hasOwnProperty.call(NFT_RARITY_LABELS, key) ? key : null;
}

function demonKingLegacyRarityFallback(level) {
  return normalizeNftLevel(level) > 1 ? 'legendary' : null;
}

function nftCollectionUsesRarity(collection = 'demonking') {
  const slug = normalizeNftCollectionSlug(collection);
  return slug === 'demonking' || slug === 'dragon';
}

function nftCollectionDbRarityKey(collection = 'demonking') {
  return normalizeNftCollectionSlug(collection) === 'demonking' ? 'demon_king' : normalizeNftCollectionSlug(collection);
}

export function nftRarityLabel(rarity, legacyLevel = 1) {
  const key = normalizeNftRarity(rarity) || demonKingLegacyRarityFallback(legacyLevel);
  return key ? NFT_RARITY_LABELS[key] : 'Unrevealed';
}

export function nftRarityCardStyle(rarity, legacyLevel = 1, options = {}) {
  const key = normalizeNftRarity(rarity) || demonKingLegacyRarityFallback(legacyLevel);
  const colors = key ? NFT_RARITY_CARD_COLORS[key] : null;
  if (!colors) return {};
  const active = !!options.active;
  return {
    border: `2px solid ${colors.border}`,
    boxShadow: active
      ? `0 0 0 2px ${colors.glow}, 0 3px 10px ${colors.shadow}, inset 0 0 0 1px rgba(255,255,255,0.45)`
      : `0 0 0 2px ${colors.glow}, 0 2px 7px ${colors.shadow}`,
  };
}

export function nftRarityBadgeStyle(rarity, legacyLevel = 1, options = {}) {
  const key = normalizeNftRarity(rarity) || demonKingLegacyRarityFallback(legacyLevel);
  const colors = key ? NFT_RARITY_CARD_COLORS[key] : null;
  if (!colors) return {};
  const compact = !!options.compact;
  return {
    display: 'inline-flex',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 3,
    padding: compact ? '1px 5px' : '2px 7px',
    borderRadius: compact ? 5 : 7,
    background: colors.badgeBg,
    border: `1px solid ${colors.badgeBorder}`,
    color: colors.badgeColor,
    boxShadow: `0 2px 6px ${colors.shadow}, inset 0 1px 0 rgba(255,255,255,0.45)`,
    textShadow: key === 'legendary'
      ? '0 1px 0 rgba(255,255,255,0.45)'
      : '0 1px 1px rgba(0,0,0,0.4)',
    fontWeight: 900,
    lineHeight: 1,
    whiteSpace: 'nowrap',
  };
}

function normalizeCollectionTokenRarity(token, collection = 'demonking') {
  if (!token || typeof token !== 'object') return token;
  const collectionSlug = normalizeNftCollectionSlug(collection);
  const legacyLevel = normalizeNftLevel(token.legacyLevel ?? token.legacy_level ?? token.level);
  const rarity = normalizeNftRarity(token.rarity)
    || (collectionSlug === 'demonking' ? demonKingLegacyRarityFallback(legacyLevel) : null);
  return {
    ...token,
    level: collectionSlug === 'demonking' ? legacyLevel : 1,
    legacyLevel,
    rarity,
    rarityLabel: rarity ? NFT_RARITY_LABELS[rarity] : 'Unrevealed',
  };
}

function normalizeDemonKingTokenRarity(token) {
  return normalizeCollectionTokenRarity(token, 'demonking');
}

export function normalizeNftCollectionSlug(value) {
  const slug = String(value || 'demonking')
    .trim()
    .toLowerCase()
    .replace(/[_\s]+/g, '-')
    .replace(/[^a-z0-9-]+/g, '-')
    .replace(/^-+|-+$/g, '');
  if (!slug || slug === 'demonking' || slug === 'demon-king') return 'demonking';
  return slug;
}

export function nftLevelImageUrl(level, id = null, collection = 'demonking') {
  const lvl = normalizeNftLevel(level);
  const collectionSlug = normalizeNftCollectionSlug(collection);
  if (collectionSlug !== 'demonking') {
    const ext = collectionSlug === 'dragon' ? 'jpg' : (lvl === 3 ? 'jpg' : 'png');
    return `/cdn/nft/${collectionSlug}/${lvl}/default.${ext}`;
  }
  // Demon King rarity reveal keeps the original artwork for every token.
  // The old on-chain level is retained as legacy data only.
  if (NFT_USE_TOKEN_IMAGE_PATHS && id != null && id !== '') {
    return `${NFT_IMAGE_BASE_URL}/1/${encodeURIComponent(String(id))}.jpg`;
  }
  return `${NFT_IMAGE_BASE_URL}/1/default.jpg`;
}

function normalizeNftImageUrl(url, level = 1, id = null, collection = 'demonking') {
  const lvl = normalizeNftLevel(level);
  const collectionSlug = normalizeNftCollectionSlug(collection);
  const fallback = nftLevelImageUrl(lvl, id, collection);
  const text = String(url || '').trim();
  if (!text) return fallback;
  try {
    const parsed = new URL(text, globalThis?.location?.origin || 'http://localhost');
    const legacyHost = LEGACY_NFT_IMAGE_HOSTS.has(parsed.hostname.toLowerCase());
    if (collectionSlug === 'dragon' && /\/cdn\/nft\/dragon\/[12]\/default\.png$/i.test(parsed.pathname)) {
      return fallback;
    }
    if (collectionSlug === 'demonking' && /\/cdn\/nft\/[23]\//i.test(parsed.pathname)) {
      return fallback;
    }
    if (collectionSlug === 'demonking' && /\/api\/nft\/image\/[23](?:[/?#]|$)/i.test(parsed.pathname)) {
      return fallback;
    }
    if (!legacyHost) return text;
    const match = parsed.pathname.match(/\/nft\/(.+)$/i);
    return match ? `${LOCAL_NFT_IMAGE_BASE_URL}/${match[1]}` : fallback;
  } catch {
    return text;
  }
}

function normalizeNftPayloadImages(payload, collection = null) {
  if (!payload || typeof payload !== 'object') return payload;
  const collectionSlug = normalizeNftCollectionSlug(collection || payload.collection);
  const tokens = Array.isArray(payload.tokens)
    ? payload.tokens.map((token) => {
        const normalized = {
          ...token,
          imageUrl: normalizeNftImageUrl(token?.imageUrl, token?.level, token?.tokenId || token?.id || token?.asset || token?.mint, collectionSlug),
        };
        return nftCollectionUsesRarity(collectionSlug) ? normalizeCollectionTokenRarity(normalized, collectionSlug) : normalized;
      })
    : payload.tokens;
  return { ...payload, tokens };
}

function nftTokenLookupId(token) {
  return String(token?.tokenId || token?.tokenAddress || token?.assetId || token?.asset || token?.mint || token?.id || '').trim();
}

export async function fetchNftRarities({ collection = 'demonking', chain, tokenIds = [], signal } = {}) {
  const collectionSlug = normalizeNftCollectionSlug(collection);
  const chainKey = String(chain || '').trim().toLowerCase();
  const ids = [...new Set((Array.isArray(tokenIds) ? tokenIds : String(tokenIds || '').split(','))
    .map((id) => String(id || '').trim())
    .filter(Boolean))].slice(0, 500);
  if (!nftCollectionUsesRarity(collectionSlug) || !chainKey || !ids.length) return {};
  const params = new URLSearchParams({
    collection: nftCollectionDbRarityKey(collectionSlug),
    chain: chainKey,
    ids: ids.join(','),
  });
  const res = await fetch(`/api/nft/rarities?${params.toString()}`, {
    signal,
    cache: 'no-store',
  });
  const json = await res.json().catch(() => ({}));
  if (!res.ok) throw new Error(json?.error || `rarities (${res.status})`);
  const out = {};
  const rows = json?.rarities && typeof json.rarities === 'object' ? json.rarities : {};
  Object.entries(rows).forEach(([id, row]) => {
    const rarity = normalizeNftRarity(row?.rarity);
    if (!rarity) return;
    out[String(id)] = {
      ...row,
      rarity,
      rarityLabel: NFT_RARITY_LABELS[rarity],
    };
  });
  return out;
}

async function enrichDemonKingRarities(payload, collection = 'demonking', signal) {
  const collectionSlug = normalizeNftCollectionSlug(collection || payload?.collection);
  if (!nftCollectionUsesRarity(collectionSlug) || !payload || !Array.isArray(payload.tokens) || !payload.tokens.length) {
    return normalizeNftPayloadImages(payload, collectionSlug);
  }
  const normalized = normalizeNftPayloadImages(payload, collectionSlug);
  const tokens = Array.isArray(normalized.tokens) ? normalized.tokens : [];
  const chainKey = String(normalized.chain || tokens[0]?.chain || '').trim().toLowerCase();
  if (!chainKey) return normalized;
  const ids = tokens.map(nftTokenLookupId).filter(Boolean);
  if (!ids.length) return normalized;
  try {
    const rarities = await fetchNftRarities({ collection: collectionSlug, chain: chainKey, tokenIds: ids, signal });
    return {
      ...normalized,
      tokens: tokens.map((token) => {
        const id = nftTokenLookupId(token);
        const rarityRow = id ? rarities[id] : null;
        return normalizeCollectionTokenRarity({
          ...token,
          ...(rarityRow ? {
            rarity: rarityRow.rarity,
            rarityLabel: rarityRow.rarityLabel,
            rarityRevealedAt: rarityRow.revealedAt || rarityRow.revealed_at || null,
          } : {}),
        }, collectionSlug);
      }),
    };
  } catch {
    return normalized;
  }
}

const EVM_OWNED_CONFIG = {
  base: {
    chainId: 8453,
    contract: '0x404807F93E47AF3eaAec0E983f18DCB35E966FEC',
    rpcEnv: ['VITE_BASE_RPC_URL'],
    rpcUrls: [
      '/rpc/base-alchemy',
      '/rpc/base',
    ],
  },
  arbitrum: {
    chainId: 42161,
    contract: '0x5Cc846B2bA0f030A5165a456eD903A5989E19F3F',
    rpcEnv: ['VITE_ARBITRUM_RPC_URL'],
    rpcUrls: [
      '/rpc/arb-public',
      '/rpc/arb-tenderly',
      '/rpc/arb',
      '/rpc/arb-onfinality',
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
  ink: {
    chainId: 57073,
    contract: '0x5Cc846B2bA0f030A5165a456eD903A5989E19F3F',
    rpcEnv: ['VITE_INK_RPC_URL'],
    rpcUrls: [
      '/rpc/ink',
      'https://rpc-gel.inkonchain.com',
      'https://rpc-qnd.inkonchain.com',
      'https://ink.drpc.org',
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
  {
    type: 'function',
    name: 'getLevel',
    stateMutability: 'view',
    inputs: [{ name: 'tokenId', type: 'uint256' }],
    outputs: [{ type: 'uint8' }],
  },
  {
    type: 'function',
    name: 'paused',
    stateMutability: 'view',
    inputs: [],
    outputs: [{ type: 'bool' }],
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
  { type: 'function', name: 'balanceOf', stateMutability: 'view',
    inputs: [{ type: 'address' }], outputs: [{ type: 'uint256' }] },
  { type: 'function', name: 'allowance', stateMutability: 'view',
    inputs: [{ type: 'address' }, { type: 'address' }], outputs: [{ type: 'uint256' }] },
  { type: 'function', name: 'approve', stateMutability: 'nonpayable',
    inputs: [{ type: 'address' }, { type: 'uint256' }], outputs: [{ type: 'bool' }] },
];

const ZERO_ADDRESS = '0x0000000000000000000000000000000000000000';

function isNativeToken(addr) {
  return !addr || /^0x0{40}$/i.test(addr);
}

function compactFormattedUnits(value) {
  const text = String(value || '0');
  if (!text.includes('.')) return text;
  const [head, tail] = text.split('.');
  const trimmed = tail.replace(/0+$/, '');
  if (!trimmed) return head;
  return `${head}.${trimmed.slice(0, 8)}`;
}

function quotePaymentDecimals(quoteResponse, isNative) {
  const direct = Number(quoteResponse?.decimals);
  if (Number.isFinite(direct) && direct >= 0) return direct;
  if (isNative) return 18;
  const payment = String(quoteResponse?.payment || '').toLowerCase();
  if (payment === 'usdc') return 6;
  return 18;
}

function quotePaymentSymbol(chainKey, quoteResponse, isNative) {
  if (quoteResponse?.priceSymbol) return String(quoteResponse.priceSymbol);
  const payment = String(quoteResponse?.payment || '').toLowerCase();
  if (isNative || payment === 'native') return chainKey === 'monad' ? 'MON' : 'ETH';
  if (payment === 'cop') return 'CoP';
  if (payment === 'usdc') return 'USDC';
  return payment ? payment.toUpperCase() : 'token';
}

function insufficientBalanceError({ symbol, decimals, balance, required, native = false }) {
  const have = compactFormattedUnits(formatUnits(BigInt(balance), decimals));
  const need = compactFormattedUnits(formatUnits(BigInt(required), decimals));
  const suffix = native ? ' plus gas' : '';
  const message = `Insufficient ${symbol} balance. Need ${need} ${symbol}${suffix}, wallet has ${have} ${symbol}.`;
  const err = new Error(message);
  err.code = 'INSUFFICIENT_BALANCE';
  err.shortMessage = message;
  err.required = required.toString();
  err.balance = balance.toString();
  err.symbol = symbol;
  return err;
}

/**
 * Get token state. EVM chains read owner/level directly from browser RPC first;
 * the server endpoint is only a fallback when the browser RPC path is unavailable.
 *   { chain, chainId, contract, tokenId, owner, level, levelLabel,
 *     starCount, upgradeable, nextLevel, upgradePriceUsdE6,
 *     usdc, cop, paused, imageUrl, wins, nextLevelRequiredWins }
 */
export async function fetchNftState(chain, tokenId, options = {}) {
  const chainKey = String(chain || '').toLowerCase();
  let rpcError = null;
  if (EVM_OWNED_CONFIG[chainKey]) {
    try {
      return await fetchNftStateBrowserEvm({
        chain: chainKey,
        tokenId,
        evmWallet: options?.evmWallet,
        signal: options?.signal,
      });
    } catch (err) {
      rpcError = err;
    }
  }

  const headers = {};
  if (typeof window !== 'undefined' && window._playerToken) headers['x-token'] = window._playerToken;
  const r = await fetch(`/api/nft/state/${chainKey || chain}/${tokenId}`, { cache: 'no-store', headers });
  const j = await r.json().catch(() => ({}));
  if (!r.ok) {
    const message = j?.error || rpcError?.message || `state read failed (${r.status})`;
    throw Object.assign(new Error(message), { status: r.status, body: j, rpcError });
  }
  return {
    ...j,
    imageUrl: normalizeNftImageUrl(j?.imageUrl, j?.level, j?.tokenId || tokenId),
    source: 'server',
  };
}

/**
 * Request a server-signed upgrade quote.
 *   { chain, chainId, contract, owner, tokenId, currentLevel, newLevel,
 *     payment, paymentToken, priceUnits, priceFormatted, usdPriceE6,
 *     priceSource, nonce, deadline, signature, callData }
 */
export async function fetchUpgradeQuote({ chain, tokenId, owner, newLevel, payment }) {
  const headers = { 'Content-Type': 'application/json' };
  if (typeof window !== 'undefined' && window._playerToken) headers['x-token'] = window._playerToken;
  const r = await fetch('/api/nft/upgrade/quote', {
    method: 'POST',
    headers,
    body: JSON.stringify({ chain, tokenId: String(tokenId), owner, newLevel, payment }),
  });
  const j = await r.json().catch(() => ({}));
  if (!r.ok) throw Object.assign(new Error(j?.error || `quote failed (${r.status})`), { status: r.status, body: j });
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

  if (priceUnitsBig > 0n) {
    const decimals = quotePaymentDecimals(quoteResponse, isNative);
    const symbol = quotePaymentSymbol(chainKey, quoteResponse, isNative);
    if (isNative) {
      const balance = await publicClient.getBalance({ address: owner });
      if (balance < priceUnitsBig) {
        throw insufficientBalanceError({ symbol, decimals, balance, required: priceUnitsBig, native: true });
      }
    } else {
      const balance = await publicClient.readContract({
        address: paymentToken,
        abi: ERC20_ALLOWANCE_ABI,
        functionName: 'balanceOf',
        args: [owner],
      });
      if (balance < priceUnitsBig) {
        throw insufficientBalanceError({ symbol, decimals, balance, required: priceUnitsBig });
      }
    }
  }

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

function aptosHexVectorArg(hex) {
  const clean = String(hex || '').replace(/^0x/i, '');
  if (!clean) return [];
  const out = [];
  for (let i = 0; i < clean.length; i += 2) {
    out.push(parseInt(clean.slice(i, i + 2), 16));
  }
  return out;
}

async function waitForAptosTx(txHash) {
  const fullnode = (typeof window !== 'undefined' && window.APTOS_FULLNODE)
    || 'https://fullnode.mainnet.aptoslabs.com/v1';
  for (let i = 0; i < 30; i += 1) {
    const response = await fetch(`${fullnode}/transactions/by_hash/${txHash}`).catch(() => null);
    if (response?.ok) {
      const data = await response.json().catch(() => null);
      if (data?.success === true) return data;
      if (data?.success === false) throw new Error(`Aptos tx failed on-chain: ${data?.vm_status || 'unknown'}`);
    }
    await new Promise((resolve) => setTimeout(resolve, 1500));
  }
  return null;
}

export async function fetchAptosUpgradeQuote({ owner, tokenId, tokenAddress, newLevel }) {
  return fetchUpgradeQuote({
    chain: 'aptos',
    tokenId: tokenAddress || tokenId,
    owner,
    newLevel,
    payment: 'usdc',
  });
}

export async function upgradeAptosNft({ aptosWallet, owner, tokenId, tokenAddress, newLevel }) {
  if (!aptosWallet) throw new Error('Aptos wallet is not connected');
  const quote = await fetchAptosUpgradeQuote({ owner, tokenId, tokenAddress, newLevel });
  const payload = {
    data: {
      function: quote?.callData?.functionId,
      typeArguments: [],
      functionArguments: [
        quote.tokenAddress || quote.tokenId,
        Number(quote.newLevel || newLevel),
        String(quote.priceUnits),
        aptosHexVectorArg(quote.nonce),
        String(quote.deadline),
        aptosHexVectorArg(quote.signature),
      ],
    },
  };
  if (!payload.data.function) throw new Error('Aptos upgrade quote is missing call data');
  const submitFn = aptosWallet.loginSignAndSubmit
    || aptosWallet.signAndSubmitTransaction
    || aptosWallet.signAndSubmit;
  if (typeof submitFn !== 'function') {
    throw new Error('Connected Aptos wallet cannot sign transactions');
  }
  const result = await submitFn.call(aptosWallet, payload);
  const txHash = result?.hash
    || result?.txnHash
    || result?.transactionHash
    || result?.signature;
  if (!txHash) throw new Error('Aptos tx submission returned no hash');
  const receipt = await waitForAptosTx(txHash);
  return { txHash, receipt, quote };
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

export async function bridgeInit({
  collection = 'demonking',
  sourceChain,
  destChain,
  sourceTokenId,
  sourceTokenAddress,
  sourceAsset,
  destAddress,
  sourceOwner,
  batchId,
  batchIndex,
  batchTotal,
}) {
  const r = await fetch('/api/bridge/init', {
    method: 'POST', headers: { 'content-type': 'application/json' },
    body: JSON.stringify({
      collection: normalizeNftCollectionSlug(collection),
      sourceChain,
      destChain,
      sourceTokenId,
      sourceTokenAddress,
      sourceAsset,
      destAddress,
      sourceOwner,
      batchId,
      batchIndex,
      batchTotal,
    }),
  });
  const j = await r.json();
  if (!r.ok) throw Object.assign(new Error(j.error || `bridge/init failed (${r.status})`), { status: r.status, body: j });
  return j;
}

export async function bridgeConfirm({ collection = 'demonking', sourceChain, destChain, burnTxHash, destAddress }) {
  const r = await fetch('/api/bridge/confirm', {
    method: 'POST', headers: { 'content-type': 'application/json' },
    body: JSON.stringify({ collection: normalizeNftCollectionSlug(collection), sourceChain, destChain, burnTxHash, destAddress }),
  });
  const j = await r.json();
  if (!r.ok) throw Object.assign(new Error(j.error || `bridge/confirm failed (${r.status})`), { status: r.status, body: j });
  return j;
}

// /bridge/relay — server submits the destination mint itself. Player only
// signs the source burn; everything after that is server-side, so no
// wallet-drop / out-of-gas / dismissed-prompt risk between burn and mint.
export async function bridgeRelay({ collection = 'demonking', sourceChain, destChain, burnTxHash, destAddress, batchId, batchIndex, batchTotal }) {
  const r = await fetch('/api/bridge/relay', {
    method: 'POST', headers: { 'content-type': 'application/json' },
    body: JSON.stringify({ collection: normalizeNftCollectionSlug(collection), sourceChain, destChain, burnTxHash, destAddress, batchId, batchIndex, batchTotal }),
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

function normalizeEvmRpcUrl(chain, url) {
  const normalized = normalizeRpcUrl(url);
  if (chain !== 'base' || !normalized) return normalized;
  try {
    const parsed = new URL(normalized, siteOrigin());
    const origin = new URL(siteOrigin()).origin;
    const host = parsed.hostname.toLowerCase();
    if (parsed.origin === origin && parsed.pathname.startsWith('/rpc/base')) return parsed.href;
    if (host.startsWith('base-mainnet.') && host.includes('alchemy')) return `${siteOrigin()}/rpc/base-alchemy`;
    if (host === ['mainnet', 'base', 'org'].join('.')) return `${siteOrigin()}/rpc/base`;
    if (
      (host.includes('publicnode') && host.includes('base'))
      || (host.endsWith('drpc.org') && host.startsWith('base.'))
      || (host.includes('developer-access') && host.includes('base'))
      || (host.includes('blockpi') && host.includes('base'))
      || (host === 'rpcfree.com' && parsed.pathname.includes('base'))
      || (host === '1rpc.io' && parsed.pathname.includes('base'))
    ) {
      return '';
    }
  } catch {}
  return normalized;
}

function envValue(name) {
  try {
    switch (name) {
      case 'VITE_BASE_RPC_URL':
        return String(import.meta.env.VITE_BASE_RPC_URL || '').trim();
      case 'VITE_ARBITRUM_RPC_URL':
        return String(import.meta.env.VITE_ARBITRUM_RPC_URL || '').trim();
      case 'VITE_MONAD_RPC_URL':
        return String(import.meta.env.VITE_MONAD_RPC_URL || '').trim();
      case 'VITE_SOLANA_DAS_RPC_URL':
        return String(import.meta.env.VITE_SOLANA_DAS_RPC_URL || '').trim();
      case 'VITE_SOLANA_CORE_RPC_URL':
        return String(import.meta.env.VITE_SOLANA_CORE_RPC_URL || '').trim();
      case 'VITE_SOLANA_RPC_URL':
        return String(import.meta.env.VITE_SOLANA_RPC_URL || '').trim();
      case 'VITE_SOLANA_ENABLE_CORE_GPA':
        return String(import.meta.env.VITE_SOLANA_ENABLE_CORE_GPA || '').trim();
      default:
        return '';
    }
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

function ownedCacheKey(collection, chain, address) {
  return `${OWNED_CACHE_PREFIX}${normalizeNftCollectionSlug(collection)}:${String(chain || '').toLowerCase()}:${String(address || '').toLowerCase()}`;
}

function readOwnedCache(key) {
  const now = Date.now();
  const memory = ownedNftMemoryCache.get(key);
  if (memory?.expiresAt > now) return normalizeNftPayloadImages(memory.value);
  if (memory) ownedNftMemoryCache.delete(key);
  try {
    const raw = window?.sessionStorage?.getItem(key);
    if (!raw) return null;
    const parsed = JSON.parse(raw);
    if (parsed?.expiresAt > now && parsed?.value) {
      ownedNftMemoryCache.set(key, parsed);
      return normalizeNftPayloadImages(parsed.value);
    }
    window.sessionStorage.removeItem(key);
  } catch {}
  return null;
}

function writeOwnedCache(key, value) {
  const entry = { expiresAt: Date.now() + OWNED_NFT_CACHE_TTL_MS, value: normalizeNftPayloadImages(value) };
  ownedNftMemoryCache.set(key, entry);
  try {
    window?.sessionStorage?.setItem(key, JSON.stringify(entry));
  } catch {}
}

function normalizeDemonKingChains(chains) {
  const rows = Array.isArray(chains) ? chains : String(chains || '').split(',');
  const filtered = rows
    .map((chain) => String(chain || '').trim().toLowerCase())
    .filter((chain) => DEMON_KING_SUPPORTED_CHAINS.includes(chain));
  return [...new Set(filtered.length ? filtered : DEMON_KING_EVM_CHAINS)];
}

function demonKingPlayerCacheScope(token) {
  const text = String(token || 'guest');
  let hash = 2166136261;
  for (let i = 0; i < text.length; i += 1) {
    hash ^= text.charCodeAt(i);
    hash = Math.imul(hash, 16777619);
  }
  return (hash >>> 0).toString(36);
}

function demonKingSyncCacheKey(wallet, chains, token = null, collection = 'demonking') {
  return `${DEMON_KING_SYNC_CACHE_PREFIX}${normalizeNftCollectionSlug(collection)}:${demonKingPlayerCacheScope(token)}:${String(wallet || '').toLowerCase()}:${normalizeDemonKingChains(chains).join(',')}`;
}

function readDemonKingSyncCache(key) {
  const now = Date.now();
  const memory = demonKingSyncMemoryCache.get(key);
  if (memory?.expiresAt > now) return normalizeNftPayloadImages(memory.value);
  if (memory) demonKingSyncMemoryCache.delete(key);
  try {
    const raw = window?.sessionStorage?.getItem(key);
    if (!raw) return null;
    const parsed = JSON.parse(raw);
    if (parsed?.expiresAt > now && parsed?.value) {
      demonKingSyncMemoryCache.set(key, parsed);
      return normalizeNftPayloadImages(parsed.value);
    }
    window.sessionStorage.removeItem(key);
  } catch {}
  return null;
}

function writeDemonKingSyncCache(key, value) {
  const entry = { expiresAt: Date.now() + DEMON_KING_SYNC_CACHE_TTL_MS, value: normalizeNftPayloadImages(value) };
  demonKingSyncMemoryCache.set(key, entry);
  try {
    window?.sessionStorage?.setItem(key, JSON.stringify(entry));
  } catch {}
}

export function clearDemonKingNftCache(wallet = null) {
  const walletLower = wallet ? String(wallet).toLowerCase() : null;
  for (const key of [...demonKingSyncMemoryCache.keys()]) {
    if (!walletLower || key.includes(walletLower)) demonKingSyncMemoryCache.delete(key);
  }
  for (const key of [...ownedNftMemoryCache.keys()]) {
    if (!walletLower || key.includes(walletLower)) ownedNftMemoryCache.delete(key);
  }
  try {
    const storage = window?.sessionStorage;
    if (!storage) return;
    for (let i = storage.length - 1; i >= 0; i -= 1) {
      const key = storage.key(i);
      if (!key) continue;
      const isDemonKingKey = key.startsWith(DEMON_KING_SYNC_CACHE_PREFIX);
      const isOwnedKey = key.startsWith(OWNED_CACHE_PREFIX);
      if ((isDemonKingKey || isOwnedKey) && (!walletLower || key.includes(walletLower))) {
        storage.removeItem(key);
      }
    }
  } catch {}
}

function isEvmWalletAddress(value) {
  return /^0x[0-9a-fA-F]{40}$/.test(String(value || '').trim());
}

function isAptosWalletAddress(value) {
  return /^0x[0-9a-fA-F]{1,64}$/.test(String(value || '').trim());
}

function isSolanaWalletAddress(value) {
  return /^[1-9A-HJ-NP-Za-km-z]{32,44}$/.test(String(value || '').trim());
}

function pushUniqueWallet(list, value) {
  const wallet = String(value || '').trim();
  if (!wallet) return;
  const key = isEvmWalletAddress(wallet) || (isAptosWalletAddress(wallet) && !isSolanaWalletAddress(wallet))
    ? wallet.toLowerCase()
    : wallet;
  if (list.some((existing) => {
    const existingText = String(existing || '').trim();
    const existingKey = isEvmWalletAddress(existingText) || (isAptosWalletAddress(existingText) && !isSolanaWalletAddress(existingText))
      ? existingText.toLowerCase()
      : existingText;
    return existingKey === key;
  })) return;
  list.push(wallet);
}

function addWalletHint(hints, raw) {
  const wallet = String(raw || '').trim();
  if (!wallet) return;
  if (isEvmWalletAddress(wallet)) {
    if (!hints.evmAddress) hints.evmAddress = wallet;
    pushUniqueWallet(hints.evmAddresses, wallet);
    return;
  }
  if (isSolanaWalletAddress(wallet)) {
    if (!hints.solAddress) hints.solAddress = wallet;
    pushUniqueWallet(hints.solAddresses, wallet);
    return;
  }
  if (isAptosWalletAddress(wallet)) {
    if (!hints.aptosAddress) hints.aptosAddress = wallet;
    pushUniqueWallet(hints.aptosAddresses, wallet);
  }
}

export function resolveDemonKingPlayerWalletHints(playerState, liveWallets = {}) {
  const hints = {
    evmAddress: null,
    solAddress: null,
    aptosAddress: null,
    evmAddresses: [],
    solAddresses: [],
    aptosAddresses: [],
  };

  addWalletHint(hints, liveWallets.evmAddress);
  addWalletHint(hints, liveWallets.solAddress);
  addWalletHint(hints, liveWallets.aptosAddress);
  addWalletHint(hints, playerState?.wallet);
  addWalletHint(hints, playerState?.nft_gold_boost_wallet);

  (Array.isArray(playerState?.wallets) ? playerState.wallets : []).forEach((row) => {
    addWalletHint(hints, row?.address || row?.wallet_address || row?.wallet);
  });
  (Array.isArray(playerState?.dex_accounts) ? playerState.dex_accounts : []).forEach((row) => {
    addWalletHint(hints, row?.wallet_address || row?.address || row?.wallet);
    addWalletHint(hints, row?.metadata?.wallet || row?.metadata?.wallet_address);
  });

  return hints;
}

export function resolveDemonKingPlayerInventorySyncTarget({
  player = null,
  evmAddress = null,
  solAddress = null,
  aptosAddress = null,
} = {}) {
  const hints = resolveDemonKingPlayerWalletHints(player, { evmAddress, solAddress, aptosAddress });
  return resolveDemonKingInventorySyncTarget({
    evmAddresses: hints.evmAddresses,
    solAddresses: hints.solAddresses,
    aptosAddresses: hints.aptosAddresses,
  });
}

export function resolveDemonKingConnectedSyncTarget({
  dex = '',
  evmAddress = null,
  evmChainId = null,
  solAddress = null,
  aptosAddress = null,
} = {}) {
  const evm = String(evmAddress || '').trim();
  const sol = String(solAddress || '').trim();
  const apt = String(aptosAddress || '').trim();
  const targetForChain = (chain) => {
    if (DEMON_KING_EVM_CHAINS.includes(chain) && isEvmWalletAddress(evm)) {
      return { wallet: evm, chains: [chain] };
    }
    if (chain === 'solana' && isSolanaWalletAddress(sol)) {
      return { wallet: sol, chains: ['solana'] };
    }
    if (chain === 'aptos' && isAptosWalletAddress(apt) && !isEvmWalletAddress(apt)) {
      return { wallet: apt, chains: ['aptos'] };
    }
    return null;
  };

  const preferred = DEMON_KING_CHAIN_BY_DEX[String(dex || '').toLowerCase()];
  if (preferred) return targetForChain(preferred);

  const evmChain = DEMON_KING_CHAIN_BY_EVM_CHAIN_ID[Number(evmChainId)];
  const evmTarget = evmChain ? targetForChain(evmChain) : null;
  if (evmTarget) return evmTarget;
  if (isEvmWalletAddress(evm)) {
    return { wallet: evm, chains: DEMON_KING_EVM_CHAINS };
  }

  return targetForChain('solana')
    || targetForChain('aptos');
}

export function resolveDemonKingInventorySyncTarget({
  evmAddress = null,
  solAddress = null,
  aptosAddress = null,
  evmAddresses = [],
  solAddresses = [],
  aptosAddresses = [],
} = {}) {
  const evm = String(evmAddress || '').trim();
  const sol = String(solAddress || '').trim();
  const apt = String(aptosAddress || '').trim();
  const evmList = [];
  const solList = [];
  const aptosList = [];
  const wallets = {};
  const chains = [];

  [...(Array.isArray(evmAddresses) ? evmAddresses : [evmAddresses]), evm]
    .forEach((wallet) => { if (isEvmWalletAddress(wallet)) pushUniqueWallet(evmList, wallet); });
  [...(Array.isArray(solAddresses) ? solAddresses : [solAddresses]), sol]
    .forEach((wallet) => { if (isSolanaWalletAddress(wallet)) pushUniqueWallet(solList, wallet); });
  [...(Array.isArray(aptosAddresses) ? aptosAddresses : [aptosAddresses]), apt]
    .forEach((wallet) => {
      if (isAptosWalletAddress(wallet) && !isEvmWalletAddress(wallet)) pushUniqueWallet(aptosList, wallet);
    });

  if (evmList.length) {
    wallets.evm = evmList;
    chains.push(...DEMON_KING_EVM_CHAINS);
  }
  if (solList.length) {
    wallets.solana = solList;
    chains.push('solana');
  }
  if (aptosList.length) {
    wallets.aptos = aptosList;
    chains.push('aptos');
  }

  if (!chains.length) return null;
  return { wallets, chains: [...new Set(chains)] };
}

function normalizeDemonKingSyncJobs({ wallet, wallets, chains }) {
  const requested = normalizeDemonKingChains(chains);
  const jobs = [];
  const seen = new Set();
  const addJob = (walletValue, candidateChains) => {
    const values = Array.isArray(walletValue) ? walletValue : [walletValue];
    for (const value of values) {
      const walletText = String(value || '').trim();
      if (!walletText) continue;
      const chainList = requested.filter((chain) => candidateChains.includes(chain));
      if (!chainList.length) continue;
      const walletKey = isEvmWalletAddress(walletText) || (isAptosWalletAddress(walletText) && !isSolanaWalletAddress(walletText))
        ? walletText.toLowerCase()
        : walletText;
      const key = `${walletKey}:${chainList.join(',')}`;
      if (seen.has(key)) continue;
      seen.add(key);
      jobs.push({ wallet: walletText, chains: chainList });
    }
  };

  if (wallets && typeof wallets === 'object') {
    addJob(wallets.evm || wallets.ethereum || wallets.base || wallet, DEMON_KING_EVM_CHAINS);
    addJob(wallets.solana || wallets.sol, ['solana']);
    addJob(wallets.aptos || wallets.apt, ['aptos']);
    return jobs;
  }

  const walletText = String(wallet || '').trim();
  if (!walletText) return jobs;
  if (isEvmWalletAddress(walletText)) addJob(walletText, DEMON_KING_EVM_CHAINS);
  if (isSolanaWalletAddress(walletText)) addJob(walletText, ['solana']);
  if (!isEvmWalletAddress(walletText) && isAptosWalletAddress(walletText)) addJob(walletText, ['aptos']);
  return jobs;
}

async function syncDemonKingNftWallet({ wallet, chains, force, signal, token, collection = 'demonking' }) {
  const walletText = String(wallet || '').trim();
  const chainList = normalizeDemonKingChains(chains);
  const collectionSlug = normalizeNftCollectionSlug(collection);
  if (!walletText || !chainList.length) {
    return { ok: true, collection: collectionSlug, wallet: walletText, chains: chainList, total: 0, tokens: [] };
  }

  const cacheKey = demonKingSyncCacheKey(walletText, chainList, token, collectionSlug);
  if (!force) {
    const cached = readDemonKingSyncCache(cacheKey);
    if (cached) return cached;
  } else {
    clearDemonKingNftCache(walletText);
  }

  const inflightKey = `${collectionSlug}:${demonKingPlayerCacheScope(token)}:${String(walletText).toLowerCase()}:${chainList.join(',')}:${force ? 'force' : 'normal'}`;
  if (demonKingSyncInflight.has(inflightKey)) return demonKingSyncInflight.get(inflightKey);

  const job = (async () => {
    const syncPath = collectionSlug === 'demonking' ? '/api/nft/demon-king/sync' : `/api/nft/${collectionSlug}/sync`;
    const syncLabel = collectionSlug === 'demonking' ? 'Demon King NFT sync' : `${collectionSlug} NFT sync`;
    const res = await fetchWithTimeout(syncPath, {
      method: 'POST',
      headers: { 'content-type': 'application/json', 'x-token': token },
      body: JSON.stringify({ wallet: walletText, chains: chainList, force }),
      cache: 'no-store',
    }, 20_000, syncLabel, signal);
    const json = await res.json().catch(() => ({}));
    if (!res.ok) throw new Error(json?.error || `${syncLabel} failed (${res.status})`);
    const value = await enrichDemonKingRarities({
      ...json,
      tokens: Array.isArray(json?.tokens) ? json.tokens : [],
    }, collectionSlug, signal);
    writeDemonKingSyncCache(cacheKey, value);
    try {
      window?.dispatchEvent?.(new CustomEvent('demon-king-nfts:updated', {
        detail: { wallet: walletText, chains: chainList, tokens: value.tokens, force },
      }));
    } catch {}
    return value;
  })();

  demonKingSyncInflight.set(inflightKey, job);
  try {
    return await job;
  } finally {
    demonKingSyncInflight.delete(inflightKey);
  }
}

export async function syncDemonKingNfts({ wallet, wallets = null, chains = DEMON_KING_SUPPORTED_CHAINS, force = false, signal, collection = 'demonking' } = {}) {
  const jobs = normalizeDemonKingSyncJobs({ wallet, wallets, chains });
  const requestedChains = normalizeDemonKingChains(chains);
  const collectionSlug = normalizeNftCollectionSlug(collection);
  if (!jobs.length) {
    return { ok: true, collection: collectionSlug, wallet: String(wallet || ''), chains: requestedChains, total: 0, tokens: [] };
  }

  const token = typeof window !== 'undefined' ? window._playerToken : null;
  if (!token) throw new Error('Game account token required');

  const settled = await Promise.allSettled(jobs.map((job) => syncDemonKingNftWallet({
    ...job,
    force,
    signal,
    token,
    collection: collectionSlug,
  })));

  const tokensByKey = new Map();
  const errors = [];
  const walletsSynced = [];
  const chainsSynced = new Set();
  for (let i = 0; i < settled.length; i += 1) {
    const row = settled[i];
    const job = jobs[i];
    if (row.status === 'rejected') {
      errors.push({ wallet: job.wallet, chains: job.chains, error: row.reason?.message || String(row.reason) });
      continue;
    }
    walletsSynced.push(row.value.wallet || job.wallet);
    (row.value.chains || job.chains || []).forEach((chain) => chainsSynced.add(chain));
    for (const tokenItem of row.value.tokens || []) {
      const tokenId = String(tokenItem.tokenId || tokenItem.tokenAddress || tokenItem.asset || tokenItem.mint || tokenItem.id || '').trim();
      const chain = String(tokenItem.chain || '').toLowerCase();
      if (!chain || !tokenId) continue;
      tokensByKey.set(`${chain}:${tokenId}`, {
        ...tokenItem,
        chain,
        tokenId,
      });
    }
  }

  if (!tokensByKey.size && errors.length === jobs.length) {
    throw new Error(errors[0]?.error || 'Demon King NFT sync failed');
  }

  const value = normalizeNftPayloadImages({
    ok: true,
    collection: collectionSlug,
    partial: errors.length > 0,
    wallets: walletsSynced,
    chains: [...chainsSynced],
    total: tokensByKey.size,
    tokens: [...tokensByKey.values()],
    errors,
  }, collectionSlug);
  try {
    window?.dispatchEvent?.(new CustomEvent('demon-king-nfts:updated', {
      detail: { wallets: walletsSynced, chains: value.chains, tokens: value.tokens, force },
    }));
  } catch {}
  return value;
}

export const syncCollectionNfts = syncDemonKingNfts;

function evmRpcUrls(chain) {
  const config = EVM_OWNED_CONFIG[chain];
  if (!config) return [];
  const envUrls = config.rpcEnv.map(envValue).filter(Boolean);
  return uniqueValues([...config.rpcUrls, ...envUrls].map((url) => normalizeEvmRpcUrl(chain, url)));
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

function evmOwnedContract(chain) {
  const config = EVM_OWNED_CONFIG[chain];
  if (!config) return '';
  return envValue(`VITE_NFT_${String(chain || '').toUpperCase()}_CONTRACT`)
    || config.contract
    || '';
}

async function fetchNftStateBrowserEvm({ chain, tokenId, evmWallet, signal }) {
  const config = EVM_OWNED_CONFIG[chain];
  if (!config) throw new Error(`Unsupported EVM chain: ${chain}`);
  const { getAddress } = await import('viem');
  const tokenIdText = String(tokenId || '').trim();
  if (!/^\d+$/.test(tokenIdText)) {
    const err = new Error('Token ID must be numeric');
    err.status = 400;
    throw err;
  }

  const tokenIdBig = BigInt(tokenIdText);
  const client = evmWallet?.getPublicClient?.(config.chainId) || await createOwnedEvmClient(chain);
  const contractRaw = evmOwnedContract(chain);
  if (!contractRaw) throw new Error(`${chain} NFT contract is not configured`);
  const contract = getAddress(contractRaw);
  const [owner, level, paused] = await Promise.all([
    withTimeout(client.readContract({
      address: contract,
      abi: EVM_OWNED_ABI,
      functionName: 'ownerOf',
      args: [tokenIdBig],
    }), OWNED_EVM_RPC_TIMEOUT_MS, `${chain} ownerOf(${tokenIdText})`, signal),
    withTimeout(client.readContract({
      address: contract,
      abi: EVM_OWNED_ABI,
      functionName: 'tokenLevel',
      args: [tokenIdBig],
    }), OWNED_EVM_RPC_TIMEOUT_MS, `${chain} tokenLevel(${tokenIdText})`, signal),
    withTimeout(client.readContract({
      address: contract,
      abi: EVM_OWNED_ABI,
      functionName: 'paused',
    }).catch(() => false), OWNED_EVM_RPC_TIMEOUT_MS, `${chain} paused`, signal),
  ]).catch((err) => {
    if (isAbortError(err)) throw err;
    const wrapped = new Error(err?.shortMessage || err?.message || 'Token does not exist');
    wrapped.status = /does not exist|invalid token/i.test(wrapped.message) ? 404 : undefined;
    wrapped.cause = err;
    throw wrapped;
  });

  const normalizedLevel = normalizeNftLevel(Number(level));
  const upgradeable = normalizedLevel < 3 && !paused;
  return {
    chain,
    chainId: config.chainId,
    contract,
    tokenId: tokenIdText,
    owner: getAddress(owner),
    level: normalizedLevel,
    levelLabel: `Level ${normalizedLevel}`,
    starCount: normalizedLevel,
    maxLevel: 3,
    upgradeable,
    nextLevel: upgradeable ? normalizedLevel + 1 : null,
    paused: !!paused,
    imageUrl: nftLevelImageUrl(normalizedLevel, tokenIdText),
    source: 'rpc',
  };
}

async function fetchOwnedNftsBrowserEvm({ chain, address, signal }) {
  const config = EVM_OWNED_CONFIG[chain];
  if (!config) throw new Error(`Unsupported EVM chain: ${chain}`);
  const { getAddress } = await import('viem');
  const owner = getAddress(address);
  const client = await createOwnedEvmClient(chain);
  const contractRaw = evmOwnedContract(chain);
  if (!contractRaw) throw new Error(`${chain} NFT contract is not configured`);
  const contract = getAddress(contractRaw);
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
    const failed = levelRows.filter((row) => row?.status !== 'success').length;
    if (failed) throw new Error(`${chain} level scan failed for ${failed} NFT(s)`);
    levels = levelRows.map((row) => Number(row.result) || 1);
  }

  const tokens = ownedIds.map((id, idx) => evmOwnedToken(chain, id, levels[idx] || 1));
  return { chain, owner, contract, total, tokens, source: 'browser-evm' };
}

function solanaDasUrls() {
  return uniqueValues([
    envValue('VITE_SOLANA_DAS_RPC_URL'),
    ...SOLANA_RPC_URLS,
  ]).map(normalizeRpcUrl);
}

function solanaCoreRpcUrls() {
  if (!envFlag('VITE_SOLANA_ENABLE_CORE_GPA', false)) return [];
  return solanaNonHeliusRpcUrls(uniqueValues([
    envValue('VITE_SOLANA_CORE_RPC_URL'),
    envValue('VITE_SOLANA_RPC_URL'),
    ...SOLANA_RPC_URLS,
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
  if (grouping.some((row) => (
    String(row?.group_key || row?.key || '').toLowerCase() === 'collection'
    && String(row?.group_value || row?.value || '') === SOLANA_NFT_COLLECTION
  ))) return true;
  return solanaCoreAssetLooksRelevant(asset) || solanaDasToken2022LooksRelevant(asset);
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
  const grouping = Array.isArray(asset?.grouping) ? asset.grouping : [];
  const group = grouping.find((row) => String(row?.group_key || row?.key || '').toLowerCase() === 'collection');
  const groupValue = publicKeyString(group?.group_value || group?.value);
  if (/^[1-9A-HJ-NP-Za-km-z]{32,44}$/.test(groupValue)) return groupValue;
  const ua = asset?.updateAuthority;
  if (ua?.type === 'Collection') return publicKeyString(ua.address);
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
  const name = String(asset?.name || asset?.content?.metadata?.name || '').toLowerCase();
  const uri = String(asset?.uri || asset?.content?.json_uri || asset?.content?.metadata?.uri || '').toLowerCase();
  const attrs = solanaAttributeLists(asset).flat();
  return (name.includes('demon king') && uri.includes('/api/nft/solana/'))
    || attrs.some((attr) => String(attr?.key || attr?.trait_type || '').toLowerCase() === 'sourceref');
}

function solanaCoreAssetToken(asset) {
  const id = solanaCoreAssetId(asset);
  const level = solanaAssetLevel(asset);
  return {
    asset: id,
    mint: id,
    tokenId: id,
    level,
    name: asset?.name || asset?.content?.metadata?.name || 'Demon King',
    imageUrl: nftLevelImageUrl(level, id || 'solana'),
    uri: asset?.uri || asset?.content?.json_uri || asset?.content?.metadata?.uri || '',
    chain: 'solana',
    standard: 'mpl-core',
  };
}

function solanaDasToken2022LooksRelevant(asset) {
  if (asset?.interface === 'MplCoreAsset') return false;
  const name = String(asset?.content?.metadata?.name || asset?.name || '').toLowerCase();
  const uri = String(asset?.content?.json_uri || asset?.uri || asset?.content?.metadata?.uri || '').toLowerCase();
  return name.includes('demon king')
    && (
      uri.includes('/api/nft/solana/token2022/')
      || uri.includes('/api/nft/solana/')
      || uri.includes('demon-king-token2022')
    );
}

function solanaDasToken2022Token(asset) {
  const mint = String(asset?.id || '');
  const level = solanaAssetLevel(asset);
  return {
    asset: mint,
    mint,
    tokenId: mint,
    level,
    name: asset?.content?.metadata?.name || `Demon King L${level}`,
    imageUrl: solanaAssetImage(asset, level),
    uri: asset?.content?.json_uri || asset?.uri || '',
    chain: 'solana',
    standard: 'token2022',
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
      if (asset?.interface === 'MplCoreAsset') tokens.push(solanaCoreAssetToken(asset));
      else if (solanaDasToken2022LooksRelevant(asset)) tokens.push(solanaDasToken2022Token(asset));
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

async function fetchOwnedNftsFromServer({ collection = 'demonking', chain, address, signal }) {
  const collectionSlug = normalizeNftCollectionSlug(collection);
  const url = collectionSlug === 'demonking'
    ? `/api/nft/demon-king/owned/${encodeURIComponent(chain)}/${encodeURIComponent(address)}`
    : `/api/nft/${encodeURIComponent(collectionSlug)}/owned/${encodeURIComponent(chain)}/${encodeURIComponent(address)}`;
  const r = await fetchWithTimeout(url, {
    cache: 'no-store',
  }, OWNED_SERVER_FALLBACK_TIMEOUT_MS, 'server owned NFT lookup', signal);
  const j = await r.json().catch(() => ({}));
  if (!r.ok) throw Object.assign(new Error(j.error || `nft/owned failed (${r.status})`), { status: r.status, body: j });
  return { ...j, source: j.source || 'server' };
}

export async function fetchOwnedNfts({ collection = 'demonking', chain, address, signal } = {}) {
  if (!chain || !address) throw new Error('chain + address required');
  const collectionSlug = normalizeNftCollectionSlug(collection);
  const chainKey = String(chain).toLowerCase();
  const key = ownedCacheKey(collectionSlug, chainKey, address);
  const cached = readOwnedCache(key);
  if (cached) return cached;

  if (chainKey === 'solana') {
    try {
      const value = await enrichDemonKingRarities(
        await fetchOwnedNftsFromServer({ collection: collectionSlug, chain: chainKey, address, signal }),
        collectionSlug,
        signal,
      );
      writeOwnedCache(key, value);
      return value;
    } catch (err) {
      if (isAbortError(err)) throw err;
      throw new Error(err?.message || 'Solana NFT ownership lookup failed');
    }
  }

  let browserError = null;
  try {
    let direct = null;
    if (collectionSlug !== 'demonking') {
      direct = null;
    } else if (EVM_OWNED_CONFIG[chainKey]) {
      direct = await fetchOwnedNftsBrowserEvm({ chain: chainKey, address, signal });
    } else if (chainKey === 'solana') {
      direct = await fetchOwnedNftsBrowserSolana({ address, signal });
    }
    if (direct && (chainKey !== 'solana' || (direct.tokens || []).length > 0)) {
      const value = await enrichDemonKingRarities(direct, collectionSlug, signal);
      writeOwnedCache(key, value);
      return value;
    }
  } catch (err) {
    if (isAbortError(err)) throw err;
    browserError = err;
  }

  try {
    const fallback = await enrichDemonKingRarities(
      await fetchOwnedNftsFromServer({ collection: collectionSlug, chain: chainKey, address, signal }),
      collectionSlug,
      signal,
    );
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
