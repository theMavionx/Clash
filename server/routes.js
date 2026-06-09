const express = require('express');
const fs = require('fs');
const os = require('os');
const path = require('path');
const crypto = require('crypto');
const zlib = require('zlib');
const nacl = require('tweetnacl');
const bs58 = require('bs58').default || require('bs58');
const db = require('./db');
const hermesClient = require('./hermes_client');
const hermesJobs = require('./hermes_jobs');
const logAiAnalyzer = require('./log_ai_analyzer');
const tasks = require('./tasks');
const elfa = require('./elfa');
const diag = require('./diag');
const earnings = require('./earnings');
const { broadcastToPlayer, consumePendingAgentEvents } = require('./websocket');
const {
  solanaToken2022CollectionId,
  solanaToken2022Symbol,
  upgradeToken2022NftLevel,
} = require('./solana_token2022_nft');
const {
  createSolanaConnection,
  solanaNonHeliusRpcUrls,
  solanaRpcUrls: buildSolanaRpcUrls,
  withSolanaRpcFallback,
} = require('./solana_rpc');

const router = express.Router();

// Temporary lenient battle mode: still runs server-side replay verification and
// logs/stores all mismatch diagnostics, but does not block player rewards unless
// explicitly re-enabled with BATTLE_REPLAY_STRICT=1.
const STRICT_BATTLE_REPLAY_VERIFICATION = process.env.BATTLE_REPLAY_STRICT === '1';
const BATTLE_DEBUG_TRACE = process.env.CLASH_BATTLE_DEBUG_TRACE !== '0';
const AI_CHAT_DETAILED_LOGS = process.env.CLASH_AI_CHAT_DETAILED_LOGS !== '0';

// ---------- Validation Helpers ----------
function normalizePlayerNameInput(value) {
  return String(value || '').trim().replace(/\s+/g, ' ');
}

function validatePlayerNameInput(value) {
  const name = normalizePlayerNameInput(value);
  if (name.length < 2) return { error: 'Nickname must be at least 2 characters' };
  if (name.length > 30) return { error: 'Nickname must be at most 30 characters' };
  return { name };
}

function isLocalGuestWallet(wallet) {
  return /^local_guest_[A-Za-z0-9_-]+$/.test(String(wallet || ''));
}

function localGuestNameFromWallet(wallet) {
  const cleaned = String(wallet || '')
    .replace(/^local_guest_/i, '')
    .replace(/[^A-Za-z0-9]/g, '')
    .slice(0, 12);
  const fallback = crypto.createHash('sha1').update(String(wallet || '')).digest('hex').slice(0, 10);
  return `Guest_${cleaned || fallback}`.slice(0, 30);
}

function makeUniquePlayerName(baseName) {
  const base = normalizePlayerNameInput(baseName).slice(0, 30) || 'Guest';
  const exists = (name) => db.db.prepare('SELECT id FROM players WHERE lower(name) = lower(?) LIMIT 1').get(name);
  if (!exists(base)) return base;
  for (let i = 1; i < 1000; i += 1) {
    const suffix = String(i);
    const candidate = `${base.slice(0, Math.max(1, 30 - suffix.length))}${suffix}`;
    if (!exists(candidate)) return candidate;
  }
  return `Guest_${crypto.randomBytes(5).toString('hex')}`;
}

const SOLANA_WALLET_RE = /^[1-9A-HJ-NP-Za-km-z]{32,44}$/; // Solana base58
const EVM_WALLET_RE = /^0x[0-9a-fA-F]{40}$/;              // Base/Ethereum 20-byte hex
const APTOS_WALLET_RE = /^0x[0-9a-fA-F]{1,64}$/;          // Aptos account, padded or not
function isValidWallet(w) {
  if (typeof w !== 'string') return false;
  return SOLANA_WALLET_RE.test(w)
    || EVM_WALLET_RE.test(w)
    || (APTOS_WALLET_RE.test(w) && !EVM_WALLET_RE.test(w));
}
// Kept as alias so older references keep working.
const WALLET_RE = SOLANA_WALLET_RE;
void WALLET_RE;

function normalizeAptosWallet(w) {
  const raw = String(w || '').trim().toLowerCase();
  if (!APTOS_WALLET_RE.test(raw) || EVM_WALLET_RE.test(raw)) return raw;
  return `0x${raw.slice(2).padStart(64, '0')}`;
}

function walletLookupCandidates(wallet) {
  const raw = String(wallet || '').trim();
  const set = new Set([raw]);
  if (APTOS_WALLET_RE.test(raw) && !EVM_WALLET_RE.test(raw)) {
    const padded = normalizeAptosWallet(raw);
    const unpadded = `0x${padded.slice(2).replace(/^0+/, '') || '0'}`;
    set.add(padded);
    set.add(unpadded);
  }
  return Array.from(set).filter(Boolean);
}

function getPlayerByWalletAnyForm(wallet, excludeId = null) {
  const candidates = walletLookupCandidates(wallet);
  const placeholders = candidates.map(() => '?').join(',');
  const params = [...candidates];
  let where = `wallet IN (${placeholders})`;
  if (excludeId != null) {
    where += ' AND id != ?';
    params.push(excludeId);
  }
  return db.db.prepare(
    `SELECT * FROM players WHERE ${where} ORDER BY COALESCE(trophies, 0) DESC, id DESC LIMIT 1`
  ).get(...params);
}

// ---------- NFT metadata proxy ----------
// Keep on-chain token URIs stable while letting us replace image/metadata
// content from the server via env/deploy changes.
const NFT_MAX_SUPPLY = Number(process.env.NFT_MAX_SUPPLY || process.env.NFT_BASE_MAX_SUPPLY || 250);
const NFT_DEFAULT_GLOBAL_SUPPLY_CAP = 333;
// Marketplace-hub bridge mints can create Base token IDs above Base's
// original sale cap. Keep metadata available up to the global cap by
// default; override if a future migration needs a wider tokenId window.
const NFT_METADATA_MAX_TOKEN_ID = Number(
  process.env.NFT_METADATA_MAX_TOKEN_ID
  || process.env.NFT_GLOBAL_SUPPLY_CAP
  || Math.max(NFT_MAX_SUPPLY, NFT_DEFAULT_GLOBAL_SUPPLY_CAP)
);
const NFT_METADATA_SUPPLY_LABEL = Number(
  process.env.NFT_GLOBAL_SUPPLY_CAP
  || NFT_DEFAULT_GLOBAL_SUPPLY_CAP
);
const NFT_IMAGE_PATH = path.join(__dirname, 'public', 'nft', 'demonking.png');
const NFT_LEVEL_IMAGE_PATHS = {
  1: path.join(__dirname, 'public', 'nft', 'L1.jpg'),
  2: path.join(__dirname, 'public', 'nft', 'L2.jpg'),
  3: path.join(__dirname, 'public', 'nft', 'L3.jpg'),
};

// Cache of (chain, tokenId) → level reads, 60s TTL. Keeps metadata reads
// cheap when marketplaces refresh every NFT after an upgrade.
const _nftLevelCache = new Map();
async function readNftLevelCached(chainKey, tokenId) {
  const key = `${chainKey}:${tokenId}`;
  const hit = _nftLevelCache.get(key);
  const now = Date.now();
  if (hit && now - hit.at < 60_000) return hit.level;
  let level = 1;
  try {
    const cfg = (typeof evmNftChainConfig === 'function') ? evmNftChainConfig(chainKey) : null;
    const addr = cfg?.nft || null;
    if (addr) {
      const { createPublicClient, http, getAddress } = await import('viem');
      const rpcMap = {
        base: process.env.NFT_BASE_RPC_URL || process.env.BASE_RPC_URL || 'https://mainnet.base.org',
        arbitrum: process.env.NFT_ARBITRUM_RPC_URL || process.env.ARBITRUM_RPC_URL || 'https://arb1.arbitrum.io/rpc',
        monad: process.env.NFT_MONAD_RPC_URL || process.env.MONAD_RPC_URL || 'https://rpc.monad.xyz',
        ink: process.env.NFT_INK_RPC_URL || process.env.INK_RPC_URL || 'https://rpc-gel.inkonchain.com',
      };
      const rpcUrl = rpcMap[chainKey];
      const client = createPublicClient({ transport: http(rpcUrl) });
      const raw = await client.readContract({
        address: getAddress(addr),
        abi: [{ name: 'tokenLevel', type: 'function', stateMutability: 'view',
                inputs: [{ type: 'uint256' }], outputs: [{ type: 'uint8' }] }],
        functionName: 'tokenLevel', args: [BigInt(tokenId)],
      });
      level = Math.max(1, Math.min(3, Number(raw) || 1));
    }
  } catch {
    // Metadata endpoint only: if the V3 level read is temporarily unavailable,
    // serve the L1 image instead of failing token metadata rendering.
  }
  _nftLevelCache.set(key, { level, at: now });
  return level;
}
function invalidateNftLevelCache(chainKey, tokenId) {
  _nftLevelCache.delete(`${chainKey}:${tokenId}`);
}
const ZERO_EVM_ADDRESS = '0x0000000000000000000000000000000000000000';
const BASE_USDC_TOKEN = '0x833589fCD6eDb6E08f4c7C32D4f71b54bdA02913';
const INK_USDC_TOKEN = '0x2D270e6886d130D724215A266106e6832161EAEd';
const NFT_ROOT = path.resolve(__dirname, '..', 'nft');
let clashUsdPriceCache = null;
const nftQuoteRateBuckets = new Map();
const utilityQuoteRateBuckets = new Map();
const BASE_NFT_SUPPLY_ABI = [
  {
    name: 'totalMinted',
    type: 'function',
    stateMutability: 'view',
    inputs: [],
    outputs: [{ type: 'uint256' }],
  },
  // V3.2+ exposes currentSupply() = totalMinted - totalBurned. Older V3
  // implementations don't have it; readers fall back to totalMinted in
  // that case so the server still works during a partial rollout.
  {
    name: 'currentSupply',
    type: 'function',
    stateMutability: 'view',
    inputs: [],
    outputs: [{ type: 'uint256' }],
  },
  {
    name: 'totalBurned',
    type: 'function',
    stateMutability: 'view',
    inputs: [],
    outputs: [{ type: 'uint256' }],
  },
  {
    name: 'owner',
    type: 'function',
    stateMutability: 'view',
    inputs: [],
    outputs: [{ type: 'address' }],
  },
  {
    name: 'ownerOf',
    type: 'function',
    stateMutability: 'view',
    inputs: [{ type: 'uint256' }],
    outputs: [{ type: 'address' }],
  },
  {
    name: 'maxSupply',
    type: 'function',
    stateMutability: 'view',
    inputs: [],
    outputs: [{ type: 'uint256' }],
  },
];
const GAME_PURCHASE_EVENT_ABI = [
  {
    type: 'event',
    name: 'GamePurchase',
    inputs: [
      { name: 'buyer', type: 'address', indexed: true },
      { name: 'paymentToken', type: 'address', indexed: true },
      { name: 'sku', type: 'bytes32', indexed: true },
      { name: 'unitPrice', type: 'uint256', indexed: false },
      { name: 'quantity', type: 'uint256', indexed: false },
      { name: 'usdPriceE6', type: 'uint256', indexed: false },
      { name: 'account', type: 'bytes32', indexed: false },
      { name: 'nonce', type: 'uint256', indexed: false },
    ],
  },
];

function nftPublicBase(req) {
  const configured = process.env.NFT_PUBLIC_BASE_URL || process.env.PUBLIC_BASE_URL || process.env.APP_PUBLIC_URL;
  if (configured) return configured.replace(/\/+$/, '');
  const proto = req.headers['x-forwarded-proto'] || req.protocol || 'https';
  return `${proto}://${req.get('host')}`;
}

function normalizeNftLevel(level) {
  const n = Number(level);
  return [1, 2, 3].includes(n) ? n : 1;
}

function nftImageUrl(req, level) {
  const lvl = normalizeNftLevel(level);
  if (level && [1, 2, 3].includes(Number(level))) {
    return `${nftPublicBase(req)}/api/nft/image/${lvl}`;
  }
  return process.env.NFT_IMAGE_URL || `${nftPublicBase(req)}/api/nft/image`;
}

function solanaCoreUpgradeMetadataUrl(req, level, sourceRef) {
  const url = new URL('/api/nft/solana/bridged', `${nftPublicBase(req)}/`);
  url.searchParams.set('level', String(normalizeNftLevel(level)));
  if (sourceRef) url.searchParams.set('src', String(sourceRef).slice(0, 80));
  return url.toString();
}

async function upgradeSolanaCoreNftLevel({ req, assetId, owner, level, sourceRef }) {
  const rawKey = process.env.SOLANA_NFT_KEY || process.env.NFT_SOLANA_KEY || process.env.NFT_KEY;
  if (!rawKey) throw Object.assign(new Error('Solana NFT authority key is not configured'), { status: 503 });
  const { parseSolanaSecretKey } = require('./bridge_helpers');
  const secretBytes = parseSolanaSecretKey(rawKey);
  const metadataUri = solanaCoreUpgradeMetadataUrl(req, level, sourceRef);
  const metadataName = `${process.env.NFT_NAME || 'Demon King'} L${normalizeNftLevel(level)}`;
  return withSolanaRpcFallback(async (rpc) => {
    const { createUmi } = await import('@metaplex-foundation/umi-bundle-defaults');
    const { keypairIdentity, publicKey } = await import('@metaplex-foundation/umi');
    const { base58 } = await import('@metaplex-foundation/umi/serializers');
    const { mplCore, fetchAsset, fetchCollection, update } = await import('@metaplex-foundation/mpl-core');
    const umi = createUmi(rpc).use(mplCore());
    const authKeypair = umi.eddsa.createKeypairFromSecretKey(secretBytes);
    umi.use(keypairIdentity(authKeypair));
    const asset = await fetchAsset(umi, publicKey(assetId));
    const actualOwner = String(asset?.owner || '');
    if (owner && actualOwner && actualOwner !== owner) {
      const err = new Error(`Solana source wallet is not the asset owner (expected ${owner}, on-chain owner ${actualOwner})`);
      err.status = 403;
      throw err;
    }
    const collectionAddress = String(asset?.updateAuthority?.type || '') === 'Collection'
      ? String(asset.updateAuthority.address || '')
      : '';
    const collection = collectionAddress ? await fetchCollection(umi, publicKey(collectionAddress)) : undefined;
    const sig = await update(umi, {
      asset,
      ...(collection ? { collection } : {}),
      authority: umi.identity,
      name: metadataName,
      uri: metadataUri,
    }).sendAndConfirm(umi, {
      send: { skipPreflight: true, commitment: 'processed', maxRetries: 5 },
      confirm: { commitment: 'confirmed', strategy: { type: 'blockhash' } },
    });
    return {
      standard: 'mpl-core',
      updateTxSig: base58.deserialize(sig.signature)[0],
      uri: metadataUri,
      name: metadataName,
    };
  }, { label: 'Solana Core NFT upgrade' });
}

function nftSellerFeeBasisPoints(chain) {
  if (String(chain || '').toLowerCase() === 'solana') {
    return Number(process.env.NFT_SOLANA_SELLER_FEE_BASIS_POINTS
      || process.env.NFT_SOLANA_ROYALTY_BPS
      || process.env.NFT_SELLER_FEE_BASIS_POINTS
      || 250);
  }
  return Number(process.env.NFT_SELLER_FEE_BASIS_POINTS || 0);
}

function nftFeeRecipient(chain) {
  if (String(chain || '').toLowerCase() === 'solana') {
    const dep = readJsonIfExists(path.join(NFT_ROOT, 'deployments', 'solana-mainnet.json')) || {};
    return process.env.NFT_SOLANA_FEE_RECIPIENT
      || process.env.NFT_SOLANA_ROYALTY_TREASURY
      || process.env.NFT_SOLANA_TREASURY
      || dep.royaltyTreasury
      || dep.treasury
      || '';
  }
  return process.env.NFT_FEE_RECIPIENT || '';
}

function attachRoyaltyMetadata(metadata, chain) {
  const fee = nftSellerFeeBasisPoints(chain);
  const recipient = nftFeeRecipient(chain);
  if (Number.isFinite(fee) && fee > 0) metadata.seller_fee_basis_points = fee;
  if (recipient) metadata.fee_recipient = recipient;
  return metadata;
}

function nftTokenMetadata(req, chain, tokenId, level) {
  const name = process.env.NFT_NAME || 'Demon King';
  const description = process.env.NFT_DESCRIPTION || 'Demon King from Clash of Perps.';
  const id = Number(tokenId);
  const lvl = normalizeNftLevel(level);
  const imageUrl = nftImageUrl(req, lvl);
  return attachRoyaltyMetadata({
    name: `${name} #${id}`,
    symbol: process.env.NFT_SYMBOL || 'DMNK',
    description,
    image: imageUrl,
    external_url: process.env.NFT_EXTERNAL_URL || `${nftPublicBase(req)}/`,
    attributes: [
      { trait_type: 'Game', value: 'Clash of Perps' },
      { trait_type: 'Character', value: 'Demon King' },
      { trait_type: 'Chain', value: chain },
      { trait_type: 'Edition', value: id },
      { trait_type: 'Level', value: lvl, display_type: 'number' },
      { trait_type: 'Stars', value: lvl, display_type: 'number' },
      { trait_type: 'Max Supply', value: NFT_METADATA_SUPPLY_LABEL },
    ],
    properties: {
      category: 'image',
      files: [{ uri: imageUrl, type: 'image/jpeg' }],
    },
  }, chain);
}

function nftHiddenMetadata(req, chain) {
  const name = process.env.NFT_NAME || 'Demon King';
  const description = process.env.NFT_DESCRIPTION || 'Demon King from Clash of Perps.';
  return attachRoyaltyMetadata({
    name,
    symbol: process.env.NFT_SYMBOL || 'DMNK',
    description,
    image: nftImageUrl(req),
    external_url: process.env.NFT_EXTERNAL_URL || `${nftPublicBase(req)}/`,
    attributes: [
      { trait_type: 'Game', value: 'Clash of Perps' },
      { trait_type: 'Character', value: 'Demon King' },
      { trait_type: 'Chain', value: chain },
      { trait_type: 'Max Supply', value: NFT_METADATA_SUPPLY_LABEL },
    ],
    properties: {
      category: 'image',
      files: [{ uri: nftImageUrl(req), type: 'image/png' }],
    },
  }, chain);
}

const NFT_COLLECTION_CHAIN_LABELS = {
  base: 'Base',
  arbitrum: 'Arbitrum',
  monad: 'Monad',
  ink: 'Ink',
  aptos: 'Aptos',
  solana: 'Solana',
};

const NFT_COLLECTION_PRESETS = {
  voidspore: {
    slug: 'voidspore',
    envKey: 'VOIDSPORE',
    name: 'Voidspore',
    symbol: 'VOID',
    character: 'Voidspore',
    description: 'Voidspore from Clash of Perps.',
    maxSupply: 555,
    images: {
      1: 'L1.png',
      2: 'L2.png',
      3: 'L3.jpg',
    },
  },
};

function normalizeCollectionSlug(value) {
  return String(value || '').trim().toLowerCase().replace(/[^a-z0-9-]+/g, '-').replace(/^-+|-+$/g, '');
}

function collectionEnv(envKey, keys, fallback = '') {
  for (const key of keys) {
    if (!key) continue;
    const fullKey = key.includes('%s') ? key.replace('%s', envKey) : key;
    if (process.env[fullKey] != null && process.env[fullKey] !== '') return process.env[fullKey];
  }
  return fallback;
}

function nftCollectionConfig(slugRaw) {
  const slug = normalizeCollectionSlug(slugRaw);
  const preset = NFT_COLLECTION_PRESETS[slug];
  if (!preset) return null;
  const envKey = preset.envKey;
  return {
    ...preset,
    name: collectionEnv(envKey, ['NFT_%s_NAME', 'NFT_COLLECTION_NAME'], preset.name),
    symbol: collectionEnv(envKey, ['NFT_%s_SYMBOL', 'NFT_COLLECTION_SYMBOL'], preset.symbol),
    description: collectionEnv(envKey, ['NFT_%s_DESCRIPTION', 'NFT_COLLECTION_DESCRIPTION'], preset.description),
    maxSupply: Number(collectionEnv(envKey, ['NFT_%s_GLOBAL_SUPPLY_CAP', 'NFT_%s_MAX_SUPPLY', 'NFT_COLLECTION_GLOBAL_SUPPLY_CAP'], preset.maxSupply)),
    externalUrl: collectionEnv(envKey, ['NFT_%s_EXTERNAL_URL', 'NFT_COLLECTION_EXTERNAL_URL'], ''),
  };
}

function nftCollectionDeployment(slug, chainKey) {
  return readJsonIfExists(path.join(NFT_ROOT, 'deployments', `${slug}-${chainKey}-mainnet.json`)) || {};
}

function nftCollectionImagePath(collection, level) {
  const lvl = normalizeNftLevel(level);
  return path.join(__dirname, 'public', 'nft', collection.slug, collection.images[lvl]);
}

function nftCollectionImageMime(filePath) {
  return path.extname(filePath).toLowerCase() === '.png' ? 'image/png' : 'image/jpeg';
}

function nftCollectionImageUrl(req, collection, level) {
  const lvl = normalizeNftLevel(level);
  return `${nftPublicBase(req)}/api/nft/${collection.slug}/image/${lvl}`;
}

function nftCollectionExternalUrl(req, collection) {
  return collection.externalUrl || `${nftPublicBase(req)}/`;
}

function nftCollectionSellerFeeBasisPoints(collection, chainKey) {
  const dep = nftCollectionDeployment(collection.slug, chainKey);
  return Number(collectionEnv(collection.envKey, [
    `NFT_${collection.envKey}_${String(chainKey || '').toUpperCase()}_ROYALTY_BPS`,
    'NFT_%s_ROYALTY_BPS',
    'NFT_COLLECTION_ROYALTY_BPS',
  ], dep.royaltyBps ?? (chainKey === 'solana' ? 250 : 250)));
}

function nftCollectionFeeRecipient(collection, chainKey) {
  const dep = nftCollectionDeployment(collection.slug, chainKey);
  return collectionEnv(collection.envKey, [
    `NFT_${collection.envKey}_${String(chainKey || '').toUpperCase()}_ROYALTY_RECEIVER`,
    `NFT_${collection.envKey}_${String(chainKey || '').toUpperCase()}_TREASURY`,
    'NFT_%s_ROYALTY_RECEIVER',
    'NFT_%s_TREASURY',
    'NFT_COLLECTION_ROYALTY_RECEIVER',
    'NFT_COLLECTION_TREASURY',
  ], dep.royaltyReceiver || dep.treasury || '');
}

function attachCollectionRoyaltyMetadata(metadata, collection, chainKey) {
  const fee = nftCollectionSellerFeeBasisPoints(collection, chainKey);
  const recipient = nftCollectionFeeRecipient(collection, chainKey);
  if (Number.isFinite(fee) && fee > 0) metadata.seller_fee_basis_points = fee;
  if (recipient) metadata.fee_recipient = recipient;
  return metadata;
}

async function readCollectionNftLevelCached(collection, chainKey, tokenId) {
  if (!['base', 'arbitrum', 'monad', 'ink'].includes(chainKey)) return 1;
  const key = `${collection.slug}:${chainKey}:${tokenId}`;
  const hit = _nftLevelCache.get(key);
  const now = Date.now();
  if (hit && now - hit.at < 60_000) return hit.level;

  let level = 1;
  try {
    const dep = nftCollectionDeployment(collection.slug, chainKey);
    const addr = dep.proxy || dep.contract;
    if (addr) {
      const { createPublicClient, http, getAddress } = await import('viem');
      const rpcMap = {
        base: process.env[`NFT_${collection.envKey}_BASE_RPC_URL`] || process.env.NFT_BASE_RPC_URL || process.env.BASE_RPC_URL || 'https://mainnet.base.org',
        arbitrum: process.env[`NFT_${collection.envKey}_ARBITRUM_RPC_URL`] || process.env.NFT_ARBITRUM_RPC_URL || process.env.ARBITRUM_RPC_URL || 'https://arb1.arbitrum.io/rpc',
        monad: process.env[`NFT_${collection.envKey}_MONAD_RPC_URL`] || process.env.NFT_MONAD_RPC_URL || process.env.MONAD_RPC_URL || 'https://rpc.monad.xyz',
        ink: process.env[`NFT_${collection.envKey}_INK_RPC_URL`] || process.env.NFT_INK_RPC_URL || process.env.INK_RPC_URL || 'https://rpc-gel.inkonchain.com',
      };
      const client = createPublicClient({ transport: http(rpcMap[chainKey]) });
      const raw = await client.readContract({
        address: getAddress(addr),
        abi: [{ name: 'tokenLevel', type: 'function', stateMutability: 'view',
                inputs: [{ type: 'uint256' }], outputs: [{ type: 'uint8' }] }],
        functionName: 'tokenLevel',
        args: [BigInt(tokenId)],
      });
      level = normalizeNftLevel(raw);
    }
  } catch {
    level = 1;
  }

  _nftLevelCache.set(key, { level, at: now });
  return level;
}

function nftCollectionShopDeployment(collection, chainKey) {
  return readJsonIfExists(path.join(NFT_ROOT, 'deployments', `${collection.slug}-${chainKey}-shop-mainnet.json`)) || {};
}

function nftCollectionChainHasDeployment(collection, chainKey) {
  const dep = nftCollectionDeployment(collection.slug, chainKey);
  if (chainKey === 'solana') return !!(dep.collection || dep.candyMachine);
  if (chainKey === 'aptos') return !!(dep.module && dep.collection);
  return !!(dep.proxy || dep.contract);
}

async function readCollectionEvmMintedCount(collection, chainKey) {
  const dep = nftCollectionDeployment(collection.slug, chainKey);
  const contractAddr = process.env[`NFT_${collection.envKey}_${String(chainKey).toUpperCase()}_CONTRACT`]
    || dep.proxy
    || dep.contract;
  if (!contractAddr) return null;
  try {
    const { createPublicClient, http } = await import('viem');
    const viemChains = await import('viem/chains');
    const monadChain = {
      id: 143,
      name: 'Monad',
      nativeCurrency: { name: 'MON', symbol: 'MON', decimals: 18 },
      rpcUrls: { default: { http: ['https://rpc.monad.xyz'] } },
    };
    const inkChain = {
      id: 57073,
      name: 'Ink',
      nativeCurrency: { name: 'ETH', symbol: 'ETH', decimals: 18 },
      rpcUrls: { default: { http: ['https://rpc-gel.inkonchain.com'] } },
      blockExplorers: { default: { name: 'Ink Explorer', url: 'https://explorer.inkonchain.com' } },
    };
    const chain = { base: viemChains.base, arbitrum: viemChains.arbitrum, monad: monadChain, ink: inkChain }[chainKey];
    const rpcUrl = process.env[`NFT_${collection.envKey}_${String(chainKey).toUpperCase()}_RPC_URL`]
      || GAME_SHOP_EVM_CHAINS[chainKey]?.rpcUrl?.()
      || 'https://mainnet.base.org';
    const publicClient = createPublicClient({ chain, transport: http(rpcUrl) });
    return await readEvmCurrentSupplyOrTotalMinted({
      address: contractAddr,
      publicClient,
      chainKey,
      deployment: dep,
    });
  } catch {
    return null;
  }
}

async function readCollectionSolanaMintedCount(collection) {
  const dep = nftCollectionDeployment(collection.slug, 'solana');
  const collectionAddr = dep.collection;
  if (!collectionAddr) return null;
  try {
    const { createUmi } = await import('@metaplex-foundation/umi-bundle-defaults');
    const { mplCore, fetchCollection } = await import('@metaplex-foundation/mpl-core');
    const { publicKey } = await import('@metaplex-foundation/umi');
    const col = await withSolanaRpcFallback(async (rpcUrl) => {
      const umi = createUmi(rpcUrl).use(mplCore());
      return fetchCollection(umi, publicKey(collectionAddr));
    }, {
      urls: solanaNonHeliusRpcUrls(solanaRpcUrls([dep.rpcUrl])),
      label: `${collection.slug} Solana collection supply read`,
    });
    if (Number.isFinite(Number(col.currentSize))) return Number(col.currentSize);
    const minted = Number(col.numMinted ?? 0);
    const burned = Number(col.numBurned ?? 0);
    return Math.max(0, minted - burned);
  } catch {
    try {
      const r = await readSolanaNftSupply(dep);
      return Number.isFinite(r?.totalMinted) ? r.totalMinted : null;
    } catch {
      return null;
    }
  }
}

async function readCollectionAptosMintedCount(collection) {
  const dep = nftCollectionDeployment(collection.slug, 'aptos');
  if (!dep?.module) return null;
  try {
    const { Aptos, AptosConfig, Network } = await import('@aptos-labs/ts-sdk');
    const fullnode = process.env.NFT_APTOS_RPC_URL || process.env.APTOS_RPC_URL || 'https://fullnode.mainnet.aptoslabs.com/v1';
    const aptos = new Aptos(new AptosConfig({ network: Network.MAINNET, fullnode }));
    const result = await aptos.view({
      payload: { function: `${dep.module}::current_supply`, functionArguments: [] },
    });
    return Number(result?.[0] || 0);
  } catch {
    return Number.isFinite(Number(dep.totalMinted)) ? Number(dep.totalMinted) : null;
  }
}

async function readCollectionGlobalSupply(collection) {
  const [base, arbitrum, monad, ink, aptos, solana] = await Promise.all([
    readCollectionEvmMintedCount(collection, 'base'),
    readCollectionEvmMintedCount(collection, 'arbitrum'),
    readCollectionEvmMintedCount(collection, 'monad'),
    readCollectionEvmMintedCount(collection, 'ink'),
    readCollectionAptosMintedCount(collection),
    readCollectionSolanaMintedCount(collection),
  ]);
  const raw = { base, arbitrum, monad, ink, aptos, solana };
  const perChain = {
    base: Number.isFinite(Number(base)) ? Number(base) : 0,
    arbitrum: Number.isFinite(Number(arbitrum)) ? Number(arbitrum) : 0,
    monad: Number.isFinite(Number(monad)) ? Number(monad) : 0,
    ink: Number.isFinite(Number(ink)) ? Number(ink) : 0,
    aptos: Number.isFinite(Number(aptos)) ? Number(aptos) : 0,
    solana: Number.isFinite(Number(solana)) ? Number(solana) : 0,
  };
  const unknownChains = Object.entries(raw)
    .filter(([chain, value]) => value == null && nftCollectionChainHasDeployment(collection, chain))
    .map(([chain]) => chain);
  const total = Object.values(perChain).reduce((sum, value) => sum + value, 0);
  return {
    collection: collection.slug,
    total,
    cap: collection.maxSupply,
    remaining: Math.max(0, collection.maxSupply - total),
    perChain,
    unknownChains,
  };
}

async function assertCollectionGlobalSupplyAvailable(collection, quantity) {
  const supply = await readCollectionGlobalSupply(collection);
  if (supply.unknownChains?.length) {
    const err = new Error(`Supply temporarily unavailable for ${supply.unknownChains.join(', ')}. Try again shortly.`);
    err.status = 503;
    throw err;
  }
  const wanted = Number(quantity) || 1;
  if (supply.total + wanted > collection.maxSupply) {
    const err = new Error(`Sold out: only ${Math.max(0, collection.maxSupply - supply.total)} of ${collection.maxSupply} ${collection.name} NFTs remain across all chains`);
    err.status = 409;
    throw err;
  }
  return supply;
}

function nftCollectionTokenMetadata(req, collection, chainKey, tokenId, level) {
  const lvl = normalizeNftLevel(level);
  const chain = NFT_COLLECTION_CHAIN_LABELS[chainKey] || chainKey;
  const imageUrl = nftCollectionImageUrl(req, collection, lvl);
  const idValue = /^\d+$/.test(String(tokenId)) ? Number(tokenId) : String(tokenId);
  return attachCollectionRoyaltyMetadata({
    name: `${collection.name} #${tokenId}`,
    symbol: collection.symbol,
    description: collection.description,
    image: imageUrl,
    external_url: nftCollectionExternalUrl(req, collection),
    attributes: [
      { trait_type: 'Game', value: 'Clash of Perps' },
      { trait_type: 'Collection', value: collection.name },
      { trait_type: 'Character', value: collection.character },
      { trait_type: 'Chain', value: chain },
      { trait_type: 'Edition', value: idValue },
      { trait_type: 'Level', value: lvl, display_type: 'number' },
      { trait_type: 'Stars', value: lvl, display_type: 'number' },
      { trait_type: 'Max Supply', value: collection.maxSupply },
    ],
    properties: {
      category: 'image',
      files: [{ uri: imageUrl, type: nftCollectionImageMime(nftCollectionImagePath(collection, lvl)) }],
    },
  }, collection, chainKey);
}

function nftCollectionHiddenMetadata(req, collection, chainKey) {
  const imageUrl = nftCollectionImageUrl(req, collection, 1);
  const chain = NFT_COLLECTION_CHAIN_LABELS[chainKey] || chainKey;
  return attachCollectionRoyaltyMetadata({
    name: collection.name,
    symbol: collection.symbol,
    description: collection.description,
    image: imageUrl,
    external_url: nftCollectionExternalUrl(req, collection),
    attributes: [
      { trait_type: 'Game', value: 'Clash of Perps' },
      { trait_type: 'Collection', value: collection.name },
      { trait_type: 'Character', value: collection.character },
      { trait_type: 'Chain', value: chain },
      { trait_type: 'Max Supply', value: collection.maxSupply },
    ],
    properties: {
      category: 'image',
      files: [{ uri: imageUrl, type: nftCollectionImageMime(nftCollectionImagePath(collection, 1)) }],
    },
  }, collection, chainKey);
}

function sendNftCollectionImage(req, res, levelRaw = 1) {
  const collection = nftCollectionConfig(req.params.collectionSlug);
  if (!collection) return res.status(404).json({ error: 'collection not found' });
  const level = normalizeNftLevel(levelRaw);
  const filePath = nftCollectionImagePath(collection, level);
  if (!fs.existsSync(filePath)) return res.status(404).json({ error: `level ${level} image missing` });
  res.set('Cache-Control', process.env.NFT_IMAGE_CACHE || 'public, max-age=300');
  res.type(nftCollectionImageMime(filePath));
  return res.sendFile(filePath);
}

function sendNftCollectionContractMetadata(req, res) {
  const collection = nftCollectionConfig(req.params.collectionSlug);
  const chainKey = String(req.params.chain || '').toLowerCase();
  if (!collection || !NFT_COLLECTION_CHAIN_LABELS[chainKey]) return res.status(404).json({ error: 'collection not found' });
  const imageUrl = nftCollectionImageUrl(req, collection, 1);
  res.set('Cache-Control', process.env.NFT_METADATA_CACHE || 'public, max-age=60');
  return res.json({
    name: collection.name,
    symbol: collection.symbol,
    description: collection.description,
    image: imageUrl,
    external_link: nftCollectionExternalUrl(req, collection),
    seller_fee_basis_points: nftCollectionSellerFeeBasisPoints(collection, chainKey),
    fee_recipient: nftCollectionFeeRecipient(collection, chainKey),
  });
}

function sendNftCollectionCollectionMetadata(req, res) {
  const collection = nftCollectionConfig(req.params.collectionSlug);
  const chainKey = String(req.params.chain || '').toLowerCase();
  if (!collection || !NFT_COLLECTION_CHAIN_LABELS[chainKey]) return res.status(404).json({ error: 'collection not found' });
  res.set('Cache-Control', process.env.NFT_METADATA_CACHE || 'public, max-age=60');
  return res.json(nftCollectionHiddenMetadata(req, collection, chainKey));
}

async function sendNftCollectionTokenMetadata(req, res, rawTokenId) {
  const collection = nftCollectionConfig(req.params.collectionSlug);
  const chainKey = String(req.params.chain || '').toLowerCase();
  if (!collection || !NFT_COLLECTION_CHAIN_LABELS[chainKey]) return res.status(404).json({ error: 'collection not found' });

  const tokenId = String(rawTokenId || '').replace(/\.json$/i, '');
  const isSolanaAsset = chainKey === 'solana' && SOLANA_WALLET_RE.test(tokenId);
  if (!/^\d+$/.test(tokenId) && !isSolanaAsset) return res.status(400).json({ error: 'bad token id' });
  if (/^\d+$/.test(tokenId)) {
    const id = Number(tokenId);
    if (id < 1 || id > collection.maxSupply) return res.status(404).json({ error: 'token metadata not found' });
  }

  let level = normalizeNftLevel(req.query.level || 1);
  if (/^\d+$/.test(tokenId)) {
    level = await readCollectionNftLevelCached(collection, chainKey, tokenId);
  }
  res.set('Cache-Control', process.env.NFT_METADATA_CACHE || 'public, max-age=60');
  return res.json(nftCollectionTokenMetadata(req, collection, chainKey, tokenId, level));
}

function sendSolanaToken2022Metadata(req, res) {
  const mint = String(req.params.mint || '').trim();
  if (!SOLANA_WALLET_RE.test(mint)) return res.status(400).json({ error: 'bad mint' });
  const level = normalizeNftLevel(req.query.level || 1);
  const imageUrl = nftImageUrl(req, level, mint);
  const name = `${process.env.NFT_NAME || 'Demon King'} L${level}`;
  res.set('Cache-Control', process.env.NFT_METADATA_CACHE || 'public, max-age=60');
  res.json(attachRoyaltyMetadata({
    name,
    symbol: solanaToken2022Symbol(),
    description: process.env.NFT_DESCRIPTION || 'Demon King from Clash of Perps.',
    image: imageUrl,
    external_url: process.env.NFT_EXTERNAL_URL || `${nftPublicBase(req)}/`,
    attributes: [
      { trait_type: 'Game', value: 'Clash of Perps' },
      { trait_type: 'Character', value: 'Demon King' },
      { trait_type: 'Chain', value: 'Solana' },
      { trait_type: 'Standard', value: 'Token-2022' },
      { trait_type: 'Collection', value: solanaToken2022CollectionId() },
      { trait_type: 'Level', value: level, display_type: 'number' },
      { trait_type: 'Stars', value: level, display_type: 'number' },
      { trait_type: 'Max Supply', value: NFT_METADATA_SUPPLY_LABEL },
    ],
    properties: {
      category: 'image',
      files: [{ uri: imageUrl, type: 'image/jpeg' }],
    },
  }, 'Solana'));
}

function sendSolanaBridgedCoreMetadata(req, res) {
  const level = normalizeNftLevel(req.query.level || 1);
  const imageUrl = nftImageUrl(req, level);
  const sourceRef = String(req.query.src || '').slice(0, 80);
  res.set('Cache-Control', process.env.NFT_METADATA_CACHE || 'public, max-age=60');
  res.json(attachRoyaltyMetadata({
    name: `${process.env.NFT_NAME || 'Demon King'} L${level}`,
    symbol: process.env.NFT_SYMBOL || 'DMNK',
    description: process.env.NFT_DESCRIPTION || 'Demon King from Clash of Perps.',
    image: imageUrl,
    external_url: process.env.NFT_EXTERNAL_URL || `${nftPublicBase(req)}/`,
    attributes: [
      { trait_type: 'Game', value: 'Clash of Perps' },
      { trait_type: 'Character', value: 'Demon King' },
      { trait_type: 'Chain', value: 'Solana' },
      { trait_type: 'Standard', value: 'Metaplex Core' },
      { trait_type: 'Level', value: level, display_type: 'number' },
      { trait_type: 'Stars', value: level, display_type: 'number' },
      ...(sourceRef ? [{ trait_type: 'Bridge Source', value: sourceRef }] : []),
      { trait_type: 'Max Supply', value: NFT_METADATA_SUPPLY_LABEL },
    ],
    properties: {
      category: 'image',
      files: [{ uri: imageUrl, type: 'image/jpeg' }],
    },
  }, 'Solana'));
}

async function sendNftMetadata(req, res, chain, rawTokenId) {
  const tokenId = String(rawTokenId || '').replace(/\.json$/i, '');
  if (!/^\d+$/.test(tokenId)) return res.status(400).json({ error: 'bad token id' });
  const id = Number(tokenId);
  if (id < 1 || id > NFT_METADATA_MAX_TOKEN_ID) return res.status(404).json({ error: 'token metadata not found' });
  // Map UI chain labels to internal keys for the level read.
  const chainKeyByLabel = { Base: 'base', Arbitrum: 'arbitrum', Monad: 'monad', Ink: 'ink' };
  const chainKey = chainKeyByLabel[chain] || null;
  let level = 1;
  if (chainKey) {
    try { level = await readNftLevelCached(chainKey, id); } catch { level = 1; }
  }
  res.set('Cache-Control', process.env.NFT_METADATA_CACHE || 'public, max-age=60');
  res.json(nftTokenMetadata(req, chain, id, level));
}

function readJsonIfExists(file) {
  try {
    if (!fs.existsSync(file)) return null;
    return JSON.parse(fs.readFileSync(file, 'utf8'));
  } catch {
    return null;
  }
}

const _aptosNftLevelCache = new Map();

function nftAptosDeployment() {
  return readJsonIfExists(path.join(NFT_ROOT, 'deployments', 'aptos-mainnet.json')) || {};
}

function parseAptosTokenLevel(tokenProperties) {
  try {
    const parsed = typeof tokenProperties === 'string' ? JSON.parse(tokenProperties) : tokenProperties;
    const raw = parsed?.level?.value ?? parsed?.level ?? parsed?.Level;
    return normalizeNftLevel(raw);
  } catch {
    return 1;
  }
}

async function readAptosNftLevelCached(tokenId) {
  const id = Number(tokenId);
  const key = `aptos:${id}`;
  const hit = _aptosNftLevelCache.get(key);
  const now = Date.now();
  if (hit && now - hit.at < 60_000) return hit.level;

  let level = 1;
  const dep = nftAptosDeployment();
  if (dep?.collection && id >= 1 && id <= NFT_METADATA_MAX_TOKEN_ID) {
    try {
      const indexerUrl = process.env.APTOS_INDEXER_URL || 'https://indexer.mainnet.aptoslabs.com/v1/graphql';
      const tokenName = `${process.env.NFT_NAME || 'Demon King'} #${id}`;
      const query = `query Q($collection:String!, $tokenName:String!) {
        current_token_datas_v2(
          where: {collection_id:{_eq:$collection}, token_name:{_eq:$tokenName}},
          limit: 1
        ) {
          token_properties
        }
      }`;
      const headers = { 'content-type': 'application/json' };
      if (process.env.APTOS_NODE_API_KEY) headers.Authorization = `Bearer ${process.env.APTOS_NODE_API_KEY}`;
      const r = await fetch(indexerUrl, {
        method: 'POST',
        headers,
        body: JSON.stringify({ query, variables: { collection: dep.collection, tokenName } }),
      });
      const j = await r.json().catch(() => null);
      const row = j?.data?.current_token_datas_v2?.[0] || null;
      if (row) level = parseAptosTokenLevel(row.token_properties);
    } catch {
      level = 1;
    }
  }
  _aptosNftLevelCache.set(key, { level, at: now });
  return level;
}

async function sendAptosNftMetadata(req, res, rawTokenId) {
  const tokenId = String(rawTokenId || '').replace(/\.json$/i, '');
  if (!/^\d+$/.test(tokenId)) return res.status(400).json({ error: 'bad token id' });
  const id = Number(tokenId);
  if (id < 1 || id > NFT_METADATA_MAX_TOKEN_ID) return res.status(404).json({ error: 'token metadata not found' });
  const level = await readAptosNftLevelCached(id);
  res.set('Cache-Control', process.env.NFT_METADATA_CACHE || 'public, max-age=60');
  res.json(nftTokenMetadata(req, 'Aptos', id, level));
}

function sendAptosCollectionMetadata(req, res) {
  const name = process.env.NFT_NAME || 'Demon King';
  res.set('Cache-Control', process.env.NFT_METADATA_CACHE || 'public, max-age=60');
  res.json({
    name,
    symbol: process.env.NFT_SYMBOL || 'DMNK',
    description: process.env.NFT_DESCRIPTION || 'Demon King from Clash of Perps.',
    image: nftImageUrl(req),
    external_url: process.env.NFT_EXTERNAL_URL || `${nftPublicBase(req)}/`,
    attributes: [
      { trait_type: 'Game', value: 'Clash of Perps' },
      { trait_type: 'Chain', value: 'Aptos' },
      { trait_type: 'Max Supply', value: NFT_METADATA_SUPPLY_LABEL },
    ],
    properties: {
      category: 'image',
      files: [{ uri: nftImageUrl(req), type: 'image/jpeg' }],
    },
  });
}

function nftBaseShopDeployment() {
  return readJsonIfExists(path.join(NFT_ROOT, 'deployments', 'base-shop-v2-mainnet.json')) || {};
}

function nftBaseDeployment() {
  return readJsonIfExists(path.join(NFT_ROOT, 'deployments', 'base-v3-mainnet.json')) || {};
}

function decimalToUnits(value, decimals) {
  const raw = String(value || '').trim();
  if (!/^\d+(\.\d+)?$/.test(raw)) throw new Error(`Invalid decimal value: ${value}`);
  const [whole, frac = ''] = raw.split('.');
  return BigInt(whole) * 10n ** BigInt(decimals)
    + BigInt((frac + '0'.repeat(decimals)).slice(0, decimals));
}

function parsePositiveInteger(value, fallback, max) {
  const raw = value == null || value === '' ? fallback : value;
  const number = Number(raw);
  if (!Number.isSafeInteger(number) || number < 1 || number > max) {
    throw new Error(`Quantity must be an integer from 1 to ${max}`);
  }
  return number;
}

function requestIp(req) {
  const forwarded = String(req.headers['x-forwarded-for'] || '').split(',')[0].trim();
  return forwarded || req.ip || req.socket?.remoteAddress || 'unknown';
}

function checkNftQuoteRateLimit(req) {
  const windowMs = Math.max(1_000, Number(process.env.NFT_QUOTE_RATE_WINDOW_MS || 60_000));
  const max = Math.max(1, Number(process.env.NFT_QUOTE_RATE_LIMIT || 30));
  const now = Date.now();
  const ip = requestIp(req);
  const bucket = nftQuoteRateBuckets.get(ip) || { count: 0, resetAt: now + windowMs };
  if (bucket.resetAt <= now) {
    bucket.count = 0;
    bucket.resetAt = now + windowMs;
  }
  bucket.count += 1;
  nftQuoteRateBuckets.set(ip, bucket);

  if (nftQuoteRateBuckets.size > 5_000) {
    for (const [key, value] of nftQuoteRateBuckets) {
      if (value.resetAt <= now) nftQuoteRateBuckets.delete(key);
    }
  }

  return {
    ok: bucket.count <= max,
    retryAfterSec: Math.max(1, Math.ceil((bucket.resetAt - now) / 1000)),
  };
}

function checkUtilityQuoteRateLimit(req) {
  const windowMs = Math.max(1_000, Number(process.env.UTILITY_QUOTE_RATE_WINDOW_MS || 60_000));
  const max = Math.max(1, Number(process.env.UTILITY_QUOTE_RATE_LIMIT || 30));
  const now = Date.now();
  const ip = requestIp(req);
  const bucket = utilityQuoteRateBuckets.get(ip) || { count: 0, resetAt: now + windowMs };
  if (bucket.resetAt <= now) {
    bucket.count = 0;
    bucket.resetAt = now + windowMs;
  }
  bucket.count += 1;
  utilityQuoteRateBuckets.set(ip, bucket);

  if (utilityQuoteRateBuckets.size > 5_000) {
    for (const [key, value] of utilityQuoteRateBuckets) {
      if (value.resetAt <= now) utilityQuoteRateBuckets.delete(key);
    }
  }

  return {
    ok: bucket.count <= max,
    retryAfterSec: Math.max(1, Math.ceil((bucket.resetAt - now) / 1000)),
  };
}

function unitsToDecimalString(units, decimals) {
  const scale = 10n ** BigInt(decimals);
  const whole = units / scale;
  const frac = (units % scale).toString().padStart(decimals, '0').replace(/0+$/, '');
  return frac ? `${whole}.${frac}` : whole.toString();
}

function usdToNativeUnits(usdAmount, assetUsd, decimals) {
  const usd = decimalToUnits(usdAmount, 12);
  const price = decimalToUnits(assetUsd, 12);
  const scale = 10n ** BigInt(decimals);
  return (usd * scale + price - 1n) / price;
}

async function fetchNftUsdPrice(asset) {
  const envKey = asset === 'eth' ? 'NFT_ETH_USD'
    : asset === 'sol' ? 'NFT_SOL_USD'
    : asset === 'apt' ? 'NFT_APT_USD'
    : asset === 'mon' ? 'NFT_MON_USD'
    : asset === 'skr' ? 'NFT_SKR_USD'
    : asset === 'clash' ? 'NFT_CLASH_USD'
    : null;
  if (envKey && process.env[envKey]) return String(process.env[envKey]);

  // SKR — no major CoinGecko/Binance feed (newly launched Solana Mobile
  // token). Resolve via DexScreener using the SKR mint configured on the
  // Solana shop. Cached for 60s to avoid hammering on every quote.
  if (asset === 'skr' || asset === 'clash') {
    const mint = asset === 'skr'
      ? (process.env.GAME_SHOP_SOLANA_SKR_MINT || process.env.NFT_SOLANA_SKR_MINT || SOLANA_SKR_MINT_DEFAULT)
      : (process.env.GAME_SHOP_SOLANA_CLASH_MINT || process.env.NFT_SOLANA_CLASH_MINT || process.env.SOLANA_CLASH_MINT);
    if (!mint) {
      throw new Error(`${asset.toUpperCase()} price unavailable: set ${asset === 'skr' ? 'GAME_SHOP_SOLANA_SKR_MINT / NFT_SOLANA_SKR_MINT' : 'GAME_SHOP_SOLANA_CLASH_MINT / NFT_SOLANA_CLASH_MINT'} or ${envKey}`);
    }
    return fetchSplTokenUsdPrice(mint);
  }

  // MON (Monad native) and SKR (Solana Mobile Seeker) launched late and
  // don't yet have stable CoinGecko slugs in some indexers. The env-var
  // override above is the recommended path for those — falling back to
  // CoinGecko/Binance below works for ETH/SOL/APT/MON.
  const ids = { eth: 'ethereum', sol: 'solana', apt: 'aptos', mon: 'monad' };
  const symbols = { eth: 'ETHUSDT', sol: 'SOLUSDT', apt: 'APTUSDT', mon: 'MONUSDT' };
  if (!ids[asset]) {
    throw new Error(`Price for ${asset.toUpperCase()} is not configured. Set ${envKey || `NFT_${asset.toUpperCase()}_USD`} or accept the default oracle path.`);
  }

  try {
    const r = await fetch(`https://api.coingecko.com/api/v3/simple/price?ids=${ids[asset]}&vs_currencies=usd`);
    if (!r.ok) throw new Error(`CoinGecko ${r.status}`);
    const json = await r.json();
    const value = json?.[ids[asset]]?.usd;
    if (!value) throw new Error('CoinGecko price missing');
    return String(value);
  } catch {
    const r = await fetch(`https://api.binance.com/api/v3/ticker/price?symbol=${symbols[asset]}`);
    if (!r.ok) throw new Error(`Binance ${r.status}`);
    const json = await r.json();
    if (!json?.price) throw new Error('Binance price missing');
    return String(json.price);
  }
}

// Generic SPL-token USD price feed via DexScreener. Used for SKR (Solana
// Mobile Seeker) and any other newer Solana token without a CoinGecko slug.
// Cached for 60s to keep DexScreener happy across the quote spam window.
const _splTokenPriceCache = new Map();
async function fetchSplTokenUsdPrice(mint) {
  const now = Date.now();
  const cached = _splTokenPriceCache.get(mint);
  if (cached && cached.expiresAt > now) return cached.value;
  const r = await fetch(`https://api.dexscreener.com/latest/dex/tokens/${mint}`);
  if (!r.ok) throw new Error(`DexScreener ${r.status}`);
  const json = await r.json();
  const pairs = Array.isArray(json?.pairs) ? json.pairs : [];
  // Prefer Solana pairs against stable/native quote tokens. DexScreener can
  // surface unrelated memecoin quote pools with a bogus USD price and high
  // reported liquidity; those must not price shop payments.
  const minLiquidityUsd = Math.max(0, Number(process.env.NFT_SPL_MIN_LIQUIDITY_USD || 5_000));
  const allowedQuoteSymbols = new Set(
    String(process.env.NFT_SPL_ALLOWED_QUOTE_SYMBOLS || 'USDC,USDT,SOL,WSOL')
      .split(',')
      .map((symbol) => symbol.trim().toUpperCase())
      .filter(Boolean),
  );
  const best = pairs
    .filter((p) => String(p?.chainId || '').toLowerCase() === 'solana'
      && String(p?.baseToken?.address || '').toLowerCase() === mint.toLowerCase()
      && allowedQuoteSymbols.has(String(p?.quoteToken?.symbol || '').toUpperCase())
      && Number(p?.priceUsd) > 0
      && Number(p?.liquidity?.usd || 0) >= minLiquidityUsd)
    .sort((a, b) => Number(b?.liquidity?.usd || 0) - Number(a?.liquidity?.usd || 0))[0];
  if (!best) {
    throw new Error(
      `No deep DexScreener pair for mint ${mint} with quote ${[...allowedQuoteSymbols].join('/')} (min $${minLiquidityUsd} liquidity)`,
    );
  }
  const value = String(best.priceUsd);
  _splTokenPriceCache.set(mint, { value, expiresAt: now + 60_000 });
  return value;
}

async function fetchClashUsdPrice(config) {
  const override = process.env.NFT_COP_USD_PRICE
    || process.env.COP_USD_PRICE
    || process.env.NFT_CLASH_USD_PRICE
    || process.env.CLASH_USD_PRICE;
  if (override) return { price: String(override), source: 'env' };

  const token = String(config?.clashToken || '').toLowerCase();
  if (!token || /^0x0{40}$/i.test(token)) {
    throw new Error('CoP token is not configured');
  }

  const now = Date.now();
  // 10-minute cache: every quote inside the same window prices the SKU at
  // the same CoP amount, so a single approve covers any number of repeat
  // purchases without surprise allowance shortfalls when the dex price
  // wobbles a few % between requests. Combined with the buy-side retry the
  // 600s cache also keeps "Quote expired" reverts inside the same 10-min
  // session from happening because the unitPrice doesn't drift between the
  // pre-flight quote and the actual purchase quote.
  const cacheMs = Math.max(5_000, Number(process.env.NFT_CLASH_PRICE_CACHE_MS || 600_000));
  if (clashUsdPriceCache?.token === token && clashUsdPriceCache.expiresAt > now) {
    return clashUsdPriceCache.value;
  }

  const r = await fetch(`https://api.dexscreener.com/latest/dex/tokens/${token}`);
  if (!r.ok) throw new Error(`DexScreener ${r.status}`);
  const json = await r.json();
  const pairs = Array.isArray(json?.pairs) ? json.pairs : [];
  const minLiquidityUsd = Math.max(0, Number(process.env.NFT_CLASH_MIN_LIQUIDITY_USD || 10_000));
  const bestPair = pairs
    .filter((pair) => (
      String(pair?.chainId || '').toLowerCase() === 'base'
      && String(pair?.baseToken?.address || '').toLowerCase() === token
      && Number(pair?.priceUsd) > 0
      && Number(pair?.liquidity?.usd || 0) >= minLiquidityUsd
      && ['WETH', 'ETH', 'USDC', 'USDBC'].includes(String(pair?.quoteToken?.symbol || '').toUpperCase())
    ))
    .sort((a, b) => Number(b?.liquidity?.usd || 0) - Number(a?.liquidity?.usd || 0))[0];

  if (!bestPair) throw new Error(`CoP/USD price missing or liquidity below ${minLiquidityUsd}`);
  const priceNumber = Number(bestPair.priceUsd);
  const minPrice = Number(process.env.NFT_CLASH_MIN_USD || 0);
  const maxPrice = Number(process.env.NFT_CLASH_MAX_USD || 0);
  if (minPrice > 0 && priceNumber < minPrice) throw new Error('CoP/USD price below safety floor');
  if (maxPrice > 0 && priceNumber > maxPrice) throw new Error('CoP/USD price above safety ceiling');

  const value = {
    price: String(bestPair.priceUsd),
    source: `DexScreener ${bestPair.dexId || 'base'} ${bestPair.pairAddress || ''}`.trim(),
  };
  clashUsdPriceCache = { token, value, expiresAt: now + cacheMs };
  return value;
}

async function parseNftEvmAccount() {
  const raw = process.env.NFT_BASE_SHOP_QUOTE_KEY
    || process.env.NFT_EVM_KEY
    || process.env.NFT_BASE
    || process.env.BASE_NFT_KEY
    || process.env.NFT_KEY;
  if (!raw) throw new Error('NFT quote signer is not configured');

  const { privateKeyToAccount, mnemonicToAccount } = await import('viem/accounts');
  if (/^(0x)?[0-9a-fA-F]{64}$/.test(raw)) {
    return privateKeyToAccount(raw.startsWith('0x') ? raw : `0x${raw}`);
  }

  const words = raw.trim().split(/\s+/);
  if (words.length >= 12 && words.length <= 24 && words.every((word) => /^[a-z]+$/i.test(word))) {
    const hdPath = process.env.NFT_BASE_MNEMONIC_PATH || "m/44'/60'/0'/0/0";
    return mnemonicToAccount(raw.trim(), { path: hdPath });
  }

  throw new Error('NFT quote signer key is not a usable EVM key');
}

function baseNftConfig() {
  const nftDeployment = nftBaseDeployment();
  const shopDeployment = nftBaseShopDeployment();
  const clashToken = process.env.NFT_BASE_CLASH_TOKEN || process.env.CLASH_BASE_TOKEN || shopDeployment.clashToken || ZERO_EVM_ADDRESS;
  return {
    chainId: 8453,
    nft: process.env.NFT_BASE_CONTRACT || nftDeployment.proxy || nftDeployment.contract || null,
    shop: process.env.NFT_BASE_SHOP_CONTRACT || shopDeployment.shop || shopDeployment.proxy || null,
    usdcToken: process.env.NFT_BASE_USDC_TOKEN || shopDeployment.usdcToken || BASE_USDC_TOKEN,
    clashToken,
    clashReady: !!clashToken && !/^0x0{40}$/i.test(clashToken),
    baseUsdPriceE6: String(process.env.NFT_BASE_USD_PRICE_E6 || shopDeployment.baseUsdPriceE6 || '8900000'),
    clashUsdPriceE6: String(process.env.NFT_BASE_CLASH_USD_PRICE_E6 || shopDeployment.clashUsdPriceE6 || '5000000'),
    saleActive: process.env.NFT_BASE_SHOP_SALE_ACTIVE
      ? process.env.NFT_BASE_SHOP_SALE_ACTIVE !== '0'
      : !!shopDeployment.saleActive,
  };
}

// Multi-chain NFT deployment registry. Each entry mirrors the Base shape
// (NFT + shop contracts, USDC + native pricing) so the same quote/mint
// route handlers can serve every EVM chain. When `nft` or `shop` is null
// the chain is considered "not yet deployed" — quote endpoints respond
// 503 instead of trying to sign for a nonexistent contract.
const NFT_EVM_CHAIN_SPECS = {
  base: {
    chainId: 8453,
    label: 'Base',
    rpc: () => process.env.NFT_BASE_RPC_URL || process.env.BASE_RPC_URL || process.env.VITE_BASE_RPC_URL || 'https://mainnet.base.org',
    deploymentFile: 'base-shop-v2-mainnet.json',
    nftDeploymentFile: 'base-v3-mainnet.json',
    explorer: 'https://basescan.org',
    domainName: 'DemonKingBaseShop',
    nativeSymbol: 'ETH',
    nativeOracleAsset: 'eth',
    usdcDefault: BASE_USDC_TOKEN,
    usdcDecimals: 6,
  },
  arbitrum: {
    chainId: 42161,
    label: 'Arbitrum',
    rpc: () => process.env.NFT_ARBITRUM_RPC_URL || process.env.ARBITRUM_RPC_URL || 'https://arb1.arbitrum.io/rpc',
    deploymentFile: 'arbitrum-shop-v2-mainnet.json',
    nftDeploymentFile: 'arbitrum-v3-mainnet.json',
    explorer: 'https://arbiscan.io',
    domainName: 'DemonKingArbitrumShop',
    nativeSymbol: 'ETH',
    nativeOracleAsset: 'eth',
    usdcDefault: '0xaf88d065e77c8cC2239327C5EDb3A432268e5831',
    usdcDecimals: 6,
  },
  monad: {
    chainId: 143,
    label: 'Monad',
    rpc: () => process.env.NFT_MONAD_RPC_URL || process.env.MONAD_RPC_URL || 'https://rpc.monad.xyz',
    deploymentFile: 'monad-shop-v2-mainnet.json',
    nftDeploymentFile: 'monad-v3-mainnet.json',
    explorer: 'https://monadexplorer.com',
    domainName: 'DemonKingMonadShop',
    nativeSymbol: 'MON',
    nativeOracleAsset: 'mon',
    usdcDefault: '0x754704Bc059F8C67012fEd69BC8A327a5aafb603',
    usdcDecimals: 18,
  },
  ink: {
    chainId: 57073,
    label: 'Ink',
    rpc: () => process.env.NFT_INK_RPC_URL || process.env.INK_RPC_URL || process.env.GAME_SHOP_INK_RPC_URL || 'https://rpc-gel.inkonchain.com',
    deploymentFile: 'ink-shop-v2-mainnet.json',
    nftDeploymentFile: 'ink-v3-mainnet.json',
    explorer: 'https://explorer.inkonchain.com',
    domainName: 'DemonKingInkShop',
    nativeSymbol: 'ETH',
    nativeOracleAsset: 'eth',
    usdcDefault: INK_USDC_TOKEN,
    usdcDecimals: 6,
  },
};

function evmNftChainConfig(chainKey) {
  const spec = NFT_EVM_CHAIN_SPECS[chainKey];
  if (!spec) return null;
  // Per-chain shop + NFT proxy lookups go via env override → deployment
  // JSON → null. Falling back to null lets the endpoint surface a clean
  // "not deployed" 503 instead of attempting to sign for nothing.
  const shopFile = readJsonIfExists(path.join(NFT_ROOT, 'deployments', spec.deploymentFile)) || {};
  const nftFile = readJsonIfExists(path.join(NFT_ROOT, 'deployments', spec.nftDeploymentFile)) || {};
  const envPrefix = `NFT_${chainKey.toUpperCase()}`;
  const nft = process.env[`${envPrefix}_CONTRACT`] || nftFile.proxy || nftFile.contract || null;
  const shop = process.env[`${envPrefix}_SHOP_CONTRACT`] || shopFile.shop || shopFile.proxy || null;
  const usdcToken = process.env[`${envPrefix}_USDC_TOKEN`] || shopFile.usdcToken || spec.usdcDefault;
  const usdPriceE6 = String(process.env[`${envPrefix}_USD_PRICE_E6`] || shopFile.baseUsdPriceE6 || '8900000');
  const saleActive = process.env[`${envPrefix}_SHOP_SALE_ACTIVE`]
    ? process.env[`${envPrefix}_SHOP_SALE_ACTIVE`] !== '0'
    : !!shopFile.saleActive;
  return {
    chainKey,
    chainId: spec.chainId,
    label: spec.label,
    nft,
    shop,
    usdcToken,
    usdcDecimals: spec.usdcDecimals,
    nativeSymbol: spec.nativeSymbol,
    nativeOracleAsset: spec.nativeOracleAsset,
    domainName: spec.domainName,
    explorer: spec.explorer,
    usdPriceE6,
    saleActive,
    deployed: !!(nft && shop),
  };
}

// Global NFT supply tracker — single source of truth aggregating per-chain
// mint counts, with 10s cache + RPC fallbacks. Defined below at ~line 1109.

async function verifyDemonKingNftUpgradeProof(player, proof, nextLevel) {
  const chainKey = String(proof?.chain || '').toLowerCase();
  if (chainKey === 'aptos' || chainKey === 'solana') {
    const tokenIdRaw = String(proof?.tokenId ?? proof?.token_id ?? '').trim();
    const tokenOk = chainKey === 'aptos'
      ? /^0x[0-9a-fA-F]{1,64}$/.test(tokenIdRaw)
      : SOLANA_WALLET_RE.test(tokenIdRaw);
    if (!tokenOk) return { error: 'Demon King NFT tokenId is invalid', status: 400 };
    const normalizeOwner = (value) => (
      chainKey === 'aptos'
        ? (APTOS_WALLET_RE.test(String(value || '')) ? `0x${String(value).replace(/^0x/i, '').padStart(64, '0').toLowerCase()}` : null)
        : (SOLANA_WALLET_RE.test(String(value || '')) ? String(value).trim() : null)
    );
    const ownerHint = proof?.owner ? normalizeOwner(proof.owner) : null;
    const cached = db.getPlayerDemonKingNft(player.id, chainKey, tokenIdRaw);
    if (!cached || !freshDemonKingBinding(cached)) {
      return { error: `Sync your ${chainKey === 'aptos' ? 'Aptos' : 'Solana'} Demon King wallet first`, status: 403 };
    }
    const cachedOwner = normalizeOwner(cached.wallet);
    if (!cachedOwner || (ownerHint && ownerHint !== cachedOwner)) {
      return { error: 'Demon King NFT owner mismatch', status: 403 };
    }
    const level = normalizeNftLevel(cached.level);
    if (level < Number(nextLevel)) {
      return {
        error: `Demon King NFT must be upgraded to level ${nextLevel}`,
        status: 403,
        nft_level: level,
        next_level: nextLevel,
      };
    }
    return {
      nftVerified: true,
      nftLevel: level,
      nftChain: chainKey,
      nftTokenId: tokenIdRaw,
      nftOwner: cachedOwner,
      txHash: proof?.txHash || proof?.tx_hash || null,
      cached: true,
    };
  }
  const cfg = evmNftChainConfig(chainKey);
  const spec = NFT_EVM_CHAIN_SPECS[chainKey];
  if (!cfg || !spec || !cfg.nft) {
    return { error: 'Demon King NFT upgrades are available on configured EVM, Aptos, and Solana chains only.', status: 400 };
  }
  const tokenIdRaw = proof?.tokenId ?? proof?.token_id;
  if (tokenIdRaw === undefined || tokenIdRaw === null || tokenIdRaw === '') {
    return { error: 'Demon King NFT tokenId required', status: 400 };
  }
  try {
    const { createPublicClient, getAddress, http } = await import('viem');
    const ownerHint = proof?.owner ? getAddress(String(proof.owner)) : null;
    const client = createPublicClient({ transport: http(spec.rpc()) });
    const tokenId = BigInt(tokenIdRaw);
    const nftAddress = getAddress(cfg.nft);
    const abi = [
      { name: 'ownerOf', type: 'function', stateMutability: 'view', inputs: [{ type: 'uint256' }], outputs: [{ type: 'address' }] },
      { name: 'tokenLevel', type: 'function', stateMutability: 'view', inputs: [{ type: 'uint256' }], outputs: [{ type: 'uint8' }] },
      { name: 'paused', type: 'function', stateMutability: 'view', inputs: [], outputs: [{ type: 'bool' }] },
    ];
    const [chainOwner, tokenLevel, paused] = await Promise.all([
      client.readContract({ address: nftAddress, abi, functionName: 'ownerOf', args: [tokenId] }),
      client.readContract({ address: nftAddress, abi, functionName: 'tokenLevel', args: [tokenId] }),
      client.readContract({ address: nftAddress, abi, functionName: 'paused' }).catch(() => false),
    ]);
    const onchainOwner = getAddress(chainOwner);
    if (paused) return { error: 'Demon King NFT contract is paused', status: 423 };
    if (ownerHint && ownerHint !== onchainOwner) {
      return { error: 'Demon King NFT owner mismatch', status: 403 };
    }
    const linkedWallets = [
      player?.wallet,
      player?.nft_gold_boost_wallet,
    ].filter((wallet) => EVM_WALLET_RE.test(String(wallet || '')));
    const linkedMatch = linkedWallets.some((wallet) => getAddress(wallet) === onchainOwner);
    if (!linkedMatch) {
      return { error: 'Connect or verify the EVM wallet that owns this Demon King NFT first', status: 403 };
    }
    const level = Number(tokenLevel || 1);
    if (level < Number(nextLevel)) {
      return {
        error: `Demon King NFT must be upgraded to level ${nextLevel}`,
        status: 403,
        nft_level: level,
        next_level: nextLevel,
      };
    }
    db.bindPlayerDemonKingNft(player.id, onchainOwner, {
      chain: chainKey,
      tokenId: String(tokenIdRaw),
      level,
    }, {
      source: 'upgrade',
      txHash: proof?.txHash || proof?.tx_hash || null,
    });
    return {
      nftVerified: true,
      nftLevel: level,
      nftChain: chainKey,
      nftTokenId: String(tokenIdRaw),
      nftOwner: onchainOwner,
      txHash: proof?.txHash || proof?.tx_hash || null,
    };
  } catch (err) {
    return {
      error: err?.shortMessage || err?.message || 'Failed to verify Demon King NFT upgrade',
      status: 400,
    };
  }
}

const DEMON_KING_BOUND_NFT_TTL_MS = Math.max(
  30_000,
  Number(process.env.NFT_DEMON_KING_BOUND_TTL_MS || 30 * 60_000)
);

function sqliteDateMs(value) {
  if (!value) return 0;
  const normalized = String(value).includes('T') ? String(value) : `${String(value).replace(' ', 'T')}Z`;
  const ms = Date.parse(normalized);
  return Number.isFinite(ms) ? ms : 0;
}

function freshDemonKingBinding(row) {
  if (!row?.verifiedAt) return false;
  return Date.now() - sqliteDateMs(row.verifiedAt) <= DEMON_KING_BOUND_NFT_TTL_MS;
}

function parseDemonKingTroopEntry(entry) {
  const raw = String(entry || '').trim();
  const parts = raw.split(':');
  if (parts.length < 3 || parts[0] !== 'DemonKing') {
    return { error: 'Demon King requires an owned NFT token' };
  }
  const chainKey = String(parts[1] || '').toLowerCase();
  const tokenIdRaw = String(parts[2] || '').trim();
  const isEvmDemonKing = !!(evmNftChainConfig(chainKey) && NFT_EVM_CHAIN_SPECS[chainKey]);
  const tokenIdOk = isEvmDemonKing
    ? /^\d+$/.test(tokenIdRaw)
    : chainKey === 'aptos'
      ? /^0x[0-9a-fA-F]{1,64}$/.test(tokenIdRaw)
      : chainKey === 'solana'
        ? SOLANA_WALLET_RE.test(tokenIdRaw)
        : false;
  if (!tokenIdOk) {
    return { error: 'Demon King NFT tokenId is invalid' };
  }
  let encodedLevel = 1;
  const levelPart = String(parts[3] || '').trim();
  const levelMatch = /^L([1-3])$/i.exec(levelPart);
  if (levelMatch) encodedLevel = Number(levelMatch[1]);
  return { chainKey, tokenIdRaw, encodedLevel };
}

async function verifyDemonKingNftLoadToken(player, entry, ownerHintRaw) {
  const parsed = parseDemonKingTroopEntry(entry);
  if (parsed.error) return { error: parsed.error, status: 400 };
  const { chainKey, tokenIdRaw } = parsed;
  const cfg = evmNftChainConfig(chainKey);
  const spec = NFT_EVM_CHAIN_SPECS[chainKey];
  const cached = db.getPlayerDemonKingNft(player.id, chainKey, tokenIdRaw);

  if (chainKey === 'aptos' || chainKey === 'solana') {
    const normalizeOwner = (value) => (
      chainKey === 'aptos'
        ? (APTOS_WALLET_RE.test(String(value || '')) ? `0x${String(value).replace(/^0x/i, '').padStart(64, '0').toLowerCase()}` : null)
        : (SOLANA_WALLET_RE.test(String(value || '')) ? String(value).trim() : null)
    );
    const ownerHint = ownerHintRaw ? normalizeOwner(ownerHintRaw) : null;
    if (!cached || !freshDemonKingBinding(cached)) {
      return { error: `Sync your ${chainKey === 'aptos' ? 'Aptos' : 'Solana'} Demon King wallet first`, status: 403 };
    }
    const cachedOwner = normalizeOwner(cached.wallet);
    if (!cachedOwner || (ownerHint && ownerHint !== cachedOwner)) {
      return { error: 'Demon King NFT owner mismatch', status: 403 };
    }
    const level = normalizeNftLevel(cached.level);
    return {
      nftVerified: true,
      nftLevel: level,
      nftChain: chainKey,
      nftTokenId: String(tokenIdRaw),
      nftOwner: cachedOwner,
      troopEntry: `DemonKing:${chainKey}:${tokenIdRaw}:L${level}`,
      cached: true,
    };
  }

  try {
    const { createPublicClient, getAddress, http } = await import('viem');
    const ownerHint = ownerHintRaw ? getAddress(String(ownerHintRaw)) : null;
    const linkedWallets = [
      player?.wallet,
      player?.nft_gold_boost_wallet,
    ].filter((wallet) => EVM_WALLET_RE.test(String(wallet || '')));
    if (cached && freshDemonKingBinding(cached)) {
      const cachedOwner = getAddress(cached.wallet);
      const cachedLinked = linkedWallets.some((wallet) => getAddress(wallet) === cachedOwner);
      if (cachedLinked && (!ownerHint || ownerHint === cachedOwner)) {
        const level = normalizeNftLevel(cached.level);
        return {
          nftVerified: true,
          nftLevel: level,
          nftChain: chainKey,
          nftTokenId: String(tokenIdRaw),
          nftOwner: cachedOwner,
          troopEntry: `DemonKing:${chainKey}:${tokenIdRaw}:L${level}`,
          cached: true,
        };
      }
    }

    const client = createPublicClient({ transport: http(spec.rpc()) });
    const tokenId = BigInt(tokenIdRaw);
    const nftAddress = getAddress(cfg.nft);
    const abi = [
      { name: 'ownerOf', type: 'function', stateMutability: 'view', inputs: [{ type: 'uint256' }], outputs: [{ type: 'address' }] },
      { name: 'tokenLevel', type: 'function', stateMutability: 'view', inputs: [{ type: 'uint256' }], outputs: [{ type: 'uint8' }] },
      { name: 'paused', type: 'function', stateMutability: 'view', inputs: [], outputs: [{ type: 'bool' }] },
    ];
    const [chainOwner, tokenLevel, paused] = await Promise.all([
      client.readContract({ address: nftAddress, abi, functionName: 'ownerOf', args: [tokenId] }),
      client.readContract({ address: nftAddress, abi, functionName: 'tokenLevel', args: [tokenId] }),
      client.readContract({ address: nftAddress, abi, functionName: 'paused' }).catch(() => false),
    ]);
    if (paused) return { error: 'Demon King NFT contract is paused', status: 423 };

    const onchainOwner = getAddress(chainOwner);
    if (ownerHint && ownerHint !== onchainOwner) {
      return { error: 'Demon King NFT owner mismatch', status: 403 };
    }

    const linkedMatch = linkedWallets.some((wallet) => getAddress(wallet) === onchainOwner);
    if (!linkedMatch) {
      return { error: 'Connect or verify the EVM wallet that owns this Demon King NFT first', status: 403 };
    }

    const level = normalizeNftLevel(tokenLevel);
    db.bindPlayerDemonKingNft(player.id, onchainOwner, {
      chain: chainKey,
      tokenId: String(tokenIdRaw),
      level,
    }, { source: 'load' });
    return {
      nftVerified: true,
      nftLevel: level,
      nftChain: chainKey,
      nftTokenId: String(tokenIdRaw),
      nftOwner: onchainOwner,
      troopEntry: `DemonKing:${chainKey}:${tokenIdRaw}:L${level}`,
    };
  } catch (err) {
    return {
      error: err?.shortMessage || err?.message || 'Failed to verify Demon King NFT ownership',
      status: 400,
    };
  }
}

function gameShopDeployment() {
  return readJsonIfExists(path.join(NFT_ROOT, 'deployments', 'game-shop-base-mainnet.json')) || {};
}

function gameShopBaseCopEnabled() {
  return process.env.GAME_SHOP_BASE_COP_ENABLED === '1';
}

function gameShopConfig() {
  const deployment = gameShopDeployment();
  const nftBase = baseNftConfig();
  const baseCopEnabled = gameShopBaseCopEnabled();
  const copToken = baseCopEnabled
    ? (process.env.GAME_SHOP_COP_TOKEN
      || process.env.NFT_BASE_CLASH_TOKEN
      || process.env.CLASH_BASE_TOKEN
      || deployment.copToken
      || nftBase.clashToken
      || ZERO_EVM_ADDRESS)
    : ZERO_EVM_ADDRESS;
  const shop = process.env.GAME_SHOP_BASE_CONTRACT || deployment.shop || deployment.proxy || null;
  return {
    chainId: 8453,
    shop,
    copToken,
    copReady: baseCopEnabled && !!copToken && !/^0x0{40}$/i.test(copToken),
    saleActive: process.env.GAME_SHOP_SALE_ACTIVE
      ? process.env.GAME_SHOP_SALE_ACTIVE !== '0'
      : !!deployment.saleActive,
    deployment,
  };
}

// Solana shop runs an off-chain "memo'd transfer" model — there's no
// deployed program. Treasury is a regular wallet, USDC mint is the standard
// Circle one, and SOL payments use SystemProgram.transfer. The redeem
// endpoint verifies the on-chain tx itself (recipient, amount, memo, sig).
const SOLANA_USDC_MINT_DEFAULT = 'EPjFWdd5AufqSSqeM2qN1xzybapC8G4wEGGkZwyTDt1v';
const SOLANA_MEMO_PROGRAM_ID = 'MemoSq4gqABAXKb96qnH8TysNcWxMyWCqXgDLGmfcHr';

// =====================================================================
// Multi-chain EVM shop (Base, Arbitrum, Monad). CoP on Base still uses the
// deployed ClashGameShopV1 quote-signing contract; USDC/native payments use
// the lighter "token/native transfer + server memo + receipt verification"
// model.
// =====================================================================
const GAME_SHOP_EVM_CHAINS = {
  base: {
    chainId: 8453,
    label: 'Base',
    rpcUrl: () => process.env.GAME_SHOP_BASE_RPC_URL || process.env.BASE_RPC_URL || process.env.NFT_BASE_RPC_URL || 'https://mainnet.base.org',
    treasuryEnv: 'GAME_SHOP_BASE_TREASURY',
    explorer: 'https://basescan.org',
    nativeSymbol: 'ETH',
    nativeDecimals: 18,
    payments: {
      usdc: { kind: 'erc20', token: BASE_USDC_TOKEN, decimals: 6, label: 'USDC', stable: true },
      eth:  { kind: 'native', decimals: 18, label: 'ETH', oracleAsset: 'eth' },
    },
  },
  arbitrum: {
    chainId: 42161,
    label: 'Arbitrum',
    rpcUrl: () => process.env.GAME_SHOP_ARB_RPC_URL || process.env.ARBITRUM_RPC_URL || 'https://arb1.arbitrum.io/rpc',
    treasuryEnv: 'GAME_SHOP_ARBITRUM_TREASURY',
    explorer: 'https://arbiscan.io',
    nativeSymbol: 'ETH',
    nativeDecimals: 18,
    payments: {
      usdc: { kind: 'erc20', token: '0xaf88d065e77c8cC2239327C5EDb3A432268e5831', decimals: 6, label: 'USDC', stable: true },
      eth:  { kind: 'native', decimals: 18, label: 'ETH', oracleAsset: 'eth' },
    },
  },
  monad: {
    chainId: 143,
    label: 'Monad',
    rpcUrl: () => process.env.GAME_SHOP_MONAD_RPC_URL || process.env.MONAD_RPC_URL || 'https://rpc.monad.xyz',
    treasuryEnv: 'GAME_SHOP_MONAD_TREASURY',
    explorer: 'https://monadexplorer.com',
    nativeSymbol: 'MON',
    nativeDecimals: 18,
    payments: {
      usdc: { kind: 'erc20', token: '0x754704Bc059F8C67012fEd69BC8A327a5aafb603', decimals: 18, label: 'USDC', stable: true }, // non-standard 18 dec on Monad
      mon:  { kind: 'native', decimals: 18, label: 'MON', oracleAsset: 'mon' },
    },
  },
  ink: {
    chainId: 57073,
    label: 'Ink',
    rpcUrl: () => process.env.GAME_SHOP_INK_RPC_URL || process.env.INK_RPC_URL || process.env.NFT_INK_RPC_URL || 'https://rpc-gel.inkonchain.com',
    treasuryEnv: 'GAME_SHOP_INK_TREASURY',
    explorer: 'https://explorer.inkonchain.com',
    nativeSymbol: 'ETH',
    nativeDecimals: 18,
    payments: {
      usdc: { kind: 'erc20', token: INK_USDC_TOKEN, decimals: 6, label: 'USDC', stable: true },
      eth:  { kind: 'native', decimals: 18, label: 'ETH', oracleAsset: 'eth' },
    },
  },
};

function evmPaymentSpec(chainKey, paymentKey) {
  const chain = GAME_SHOP_EVM_CHAINS[chainKey];
  if (!chain) return null;
  const spec = chain.payments?.[paymentKey] || null;
  if (!spec) return null;
  if (spec.kind === 'erc20') {
    return {
      ...spec,
      token: process.env[`GAME_SHOP_${chainKey.toUpperCase()}_${paymentKey.toUpperCase()}_TOKEN`] || spec.token,
    };
  }
  return spec;
}

function defaultEvmPayment(chainKey) {
  return GAME_SHOP_EVM_CHAINS[chainKey]?.payments?.usdc ? 'usdc' : null;
}

function gameShopEvmConfig(chainKey) {
  const spec = GAME_SHOP_EVM_CHAINS[chainKey];
  if (!spec) return null;
  // Treasury: per-chain override → shared EVM treasury env → Base treasury
  // from the on-chain ClashGameShop deployment (because Base shop's owner
  // already set it). Same wallet across all EVM chains by default — one
  // place to consolidate revenue, simpler bookkeeping.
  const deployment = gameShopDeployment();
  const treasury = process.env[spec.treasuryEnv]
    || process.env.GAME_SHOP_EVM_TREASURY
    || deployment.treasury
    || null;
  const saleActive = process.env[`GAME_SHOP_${chainKey.toUpperCase()}_SALE_ACTIVE`]
    ? process.env[`GAME_SHOP_${chainKey.toUpperCase()}_SALE_ACTIVE`] !== '0'
    : !!treasury;
  // Surface the per-payment options as a flat array so the client UI can
  // render its toggle without re-walking the keyed payments object. ID is
  // stable (used as the `payment` field in quote/redeem); label is for UI.
  const payments = Object.entries(spec.payments).map(([id, p]) => ({
    id,
    kind: p.kind,
    label: p.label,
    decimals: p.decimals,
    stable: !!p.stable,
    token: p.kind === 'erc20'
      ? (process.env[`GAME_SHOP_${chainKey.toUpperCase()}_${id.toUpperCase()}_TOKEN`] || p.token)
      : null,
  }));
  // Back-compat fields — older client code reads usdcMint/usdcDecimals.
  // Surface them only when USDC is actually one of the payments.
  const usdcSpec = spec.payments?.usdc?.kind === 'erc20' ? spec.payments.usdc : null;
  return {
    chain: chainKey,
    chainId: spec.chainId,
    label: spec.label,
    treasury,
    usdcMint: usdcSpec
      ? (process.env[`GAME_SHOP_${chainKey.toUpperCase()}_USDC_TOKEN`] || usdcSpec.token)
      : null,
    usdcDecimals: usdcSpec?.decimals || null,
    nativeSymbol: spec.nativeSymbol,
    nativeDecimals: spec.nativeDecimals,
    payments,
    explorer: spec.explorer,
    saleActive,
    ready: !!treasury,
  };
}

// =====================================================================
// Aptos game shop (Decibel). The treasury is derived from the SAME BIP-39
// mnemonic that already controls the Base treasury (NFT_BASE env), just
// via the standard Aptos derivation path `m/44'/637'/0'/0'/0'` (SLIP-44
// coin type 637, ed25519 instead of secp256k1). One seed phrase controls
// both wallets — no separate Aptos-only secret to backup.
// =====================================================================
const APTOS_DERIVATION_PATH = "m/44'/637'/0'/0'/0'";

let _aptosTreasuryCache = null;
function deriveAptosTreasuryFromMnemonic() {
  if (_aptosTreasuryCache !== null) return _aptosTreasuryCache;
  // Direct override (raw ed25519 private key) takes precedence — useful
  // for a hot/cold split where the shop key isn't derived from the same
  // mnemonic. Returns null silently on any failure so callers can treat
  // the shop as "not configured" rather than crash module load.
  try {
    const explicitKey = String(process.env.GAME_SHOP_APTOS_KEY || '').trim();
    const mnemonic = String(
      process.env.GAME_SHOP_APTOS_MNEMONIC
      || process.env.NFT_BASE
      || '',
    ).trim();
    if (!explicitKey && !mnemonic) { _aptosTreasuryCache = ''; return ''; }
    const sdkPath = process.env.APTOS_SDK_PATH
      || require.resolve('@aptos-labs/ts-sdk', { paths: [path.join(__dirname, '..', 'server-futures', 'node_modules')] });
    const sdk = require(sdkPath);
    let account;
    if (explicitKey) {
      account = sdk.Account.fromPrivateKey({ privateKey: new sdk.Ed25519PrivateKey(explicitKey) });
    } else {
      account = sdk.Account.fromDerivationPath({ path: APTOS_DERIVATION_PATH, mnemonic });
    }
    _aptosTreasuryCache = account.accountAddress.toString();
    return _aptosTreasuryCache;
  } catch {
    _aptosTreasuryCache = '';
    return '';
  }
}

function gameShopAptosConfig() {
  const treasury = process.env.GAME_SHOP_APTOS_TREASURY
    || deriveAptosTreasuryFromMnemonic()
    || null;
  const usdcAddress = process.env.GAME_SHOP_APTOS_USDC
    || '0xbae207659db88bea0cbead6da0ed00aac12edcdda169e591cd41c94180b46f3b'; // native Circle USDC (FA)
  const saleActive = process.env.GAME_SHOP_APTOS_SALE_ACTIVE
    ? process.env.GAME_SHOP_APTOS_SALE_ACTIVE !== '0'
    : !!treasury;
  return {
    chain: 'aptos',
    network: process.env.GAME_SHOP_APTOS_NETWORK || 'mainnet',
    treasury,
    usdcAddress,
    saleActive,
    ready: !!treasury,
  };
}

function gameShopSolanaConfig() {
  // Treasury can be configured per-env or pulled from the nft deployment
  // (reuse the same Solana wallet the NFT mint uses — they're the same
  // server identity, no reason to maintain two recipients). Falls back to
  // null when not configured so the client knows the Solana shop is off.
  const deployment = gameShopDeployment();
  const nftDeployment = readJsonIfExists(
    path.join(NFT_ROOT, 'deployments', 'solana-mainnet.json'),
  ) || {};
  const treasury = process.env.GAME_SHOP_SOLANA_TREASURY
    || process.env.NFT_SOLANA_TREASURY
    || deployment.solanaTreasury
    || nftDeployment.treasury
    || nftDeployment.owner
    || null;
  const usdcMint = process.env.GAME_SHOP_SOLANA_USDC_MINT
    || process.env.NFT_SOLANA_USDC_MINT
    || nftDeployment.usdcMint
    || SOLANA_USDC_MINT_DEFAULT;
  // SKR — Solana Mobile Seeker token. No fallback default because Solana
  // Mobile hadn't published a long-lived mint at code-write time; the
  // operator wires this in via env when ready. If unset, the SKR
  // payment option silently disappears from the UI (`ready === false`).
  const skrMint = process.env.GAME_SHOP_SOLANA_SKR_MINT
    || process.env.NFT_SOLANA_SKR_MINT
    || nftDeployment.skrMint
    || nftDeployment.paymentGroups?.skr?.mint
    || SOLANA_SKR_MINT_DEFAULT
    || null;
  // SKR uses 6 decimals. The quote path still reads the mint account on-chain
  // so a future replacement mint cannot silently misprice payments.
  const skrDecimals = Number(process.env.GAME_SHOP_SOLANA_SKR_DECIMALS || process.env.NFT_SOLANA_SKR_DECIMALS || SOLANA_SKR_DECIMALS_DEFAULT);
  const clashMint = process.env.GAME_SHOP_SOLANA_CLASH_MINT
    || process.env.NFT_SOLANA_CLASH_MINT
    || process.env.SOLANA_CLASH_MINT
    || nftDeployment.clashMint
    || nftDeployment.paymentGroups?.clash?.mint
    || null;
  const clashDecimals = Number(process.env.GAME_SHOP_SOLANA_CLASH_DECIMALS || process.env.NFT_SOLANA_CLASH_DECIMALS || process.env.CLASH_DECIMALS || 9);
  const saleActive = process.env.GAME_SHOP_SOLANA_SALE_ACTIVE
    ? process.env.GAME_SHOP_SOLANA_SALE_ACTIVE !== '0'
    : !!treasury; // any wallet that's configured = open
  return {
    chain: 'solana',
    cluster: process.env.GAME_SHOP_SOLANA_CLUSTER || 'mainnet-beta',
    treasury,
    usdcMint,
    skrMint,
    skrDecimals,
    skrReady: !!skrMint,
    clashMint,
    clashDecimals,
    clashReady: !!clashMint,
    memoProgram: SOLANA_MEMO_PROGRAM_ID,
    saleActive,
    ready: !!treasury,
  };
}

const GAME_SHOP_PRODUCTS = {
  shield_24h: {
    id: 'shield_24h',
    sku: 'shield_24h',
    title: '24h Shield',
    subtitle: 'Protect your base from raids',
    kind: 'shield',
    usdPriceE6: '5000000',
    durationHours: 24,
    maxQuantity: 3,
  },
  resource_pack_s: {
    id: 'resource_pack_s',
    sku: 'resource_pack_s',
    title: 'Resource Pack',
    subtitle: 'Gold, wood, and ore for upgrades',
    kind: 'resources',
    usdPriceE6: '2000000',
    rewards: { gold: 2500, wood: 2500, ore: 2500 },
    maxQuantity: 5,
  },
  resource_pack_m: {
    id: 'resource_pack_m',
    sku: 'resource_pack_m',
    title: 'War Chest',
    subtitle: 'A bigger push for your base',
    kind: 'resources',
    usdPriceE6: '5000000',
    rewards: { gold: 7500, wood: 7500, ore: 7500 },
    maxQuantity: 3,
  },
  altar: {
    id: 'altar',
    sku: 'altar',
    title: 'Altar',
    subtitle: 'Get up to a 40% boost to all resources; base up to 40% stronger; up to +10 trophies per attack',
    kind: 'altar',
    usdPriceE6: '15000000',
    copDiscountBps: 2000,
    boosts: { resourcesPct: 40, basePct: 40, trophyPerAttack: 10 },
    maxQuantity: 1,
  },
  ai_messages_100: {
    id: 'ai_messages_100',
    sku: 'ai_messages_100',
    title: 'AI Message Pack',
    subtitle: '100 AI agent messages, or 150 when paid with CLASH',
    kind: 'ai_messages',
    usdPriceE6: '5000000',
    messageCredits: 100,
    copBonusCredits: 150,
    copDiscountBps: 0,
    maxQuantity: 10,
  },
  ai_lifetime_daily_100: {
    id: 'ai_lifetime_daily_100',
    sku: 'ai_lifetime_daily_100',
    title: 'AI Lifetime Pass',
    subtitle: 'Permanent AI access with 100 messages per day',
    kind: 'ai_subscription',
    usdPriceE6: '30000000',
    copUsdPriceE6: '20000000',
    dailyLimit: 100,
    maxQuantity: 1,
  },
  demon_king_upgrade: {
    id: 'demon_king_upgrade',
    sku: 'demon_king_upgrade',
    title: 'Demon King Upgrade',
    subtitle: 'Upgrade a verified Demon King NFT level',
    kind: 'nft_upgrade',
    usdPriceE6: '8900000',
    maxQuantity: 1,
    hidden: true,
  },
};

function getGameShopCopDiscountBps(product) {
  if (product && product.copUsdPriceE6) return null;
  if (product && product.copDiscountBps != null) {
    return Math.max(0, Math.min(9000, Number(product.copDiscountBps) || 0));
  }
  return Math.max(0, Math.min(9000, Number(process.env.GAME_SHOP_COP_DISCOUNT_BPS || 2000)));
}

function gameShopUsdPriceE6ForPayment(product, { chain = '', payment = '' } = {}) {
  const base = BigInt(product.usdPriceE6);
  const chainKey = String(chain).toLowerCase();
  const paymentKey = String(payment).toLowerCase();
  if ((chainKey === 'base' && paymentKey === 'cop') || (chainKey === 'solana' && paymentKey === 'clash')) {
    if (product.copUsdPriceE6) return BigInt(product.copUsdPriceE6);
    const discountBps = BigInt(getGameShopCopDiscountBps(product) || 0);
    return (base * (10_000n - discountBps)) / 10_000n;
  }
  return base;
}

function gameShopProductsForClient() {
  return Object.values(GAME_SHOP_PRODUCTS).filter((product) => !product.hidden).map((product) => {
    const copDiscountBps = getGameShopCopDiscountBps(product);
    const copUsdPriceE6 = gameShopUsdPriceE6ForPayment(product, { chain: 'base', payment: 'cop' });
    const clashUsdPriceE6 = gameShopUsdPriceE6ForPayment(product, { chain: 'solana', payment: 'clash' });
    const hasCopPrice = product.copUsdPriceE6 || copDiscountBps != null;
    return {
      id: product.id,
      sku: product.sku,
      skuBytes32: skuToBytes32(product.sku),
      title: product.title,
      subtitle: product.subtitle,
      kind: product.kind,
      usdPriceE6: product.usdPriceE6,
      priceUsd: unitsToDecimalString(BigInt(product.usdPriceE6), 6),
      copUsdPriceE6: hasCopPrice ? copUsdPriceE6.toString() : null,
      copPriceUsd: hasCopPrice ? unitsToDecimalString(copUsdPriceE6, 6) : null,
      clashUsdPriceE6: hasCopPrice ? clashUsdPriceE6.toString() : null,
      clashPriceUsd: hasCopPrice ? unitsToDecimalString(clashUsdPriceE6, 6) : null,
      copDiscountBps,
      durationHours: product.durationHours || null,
      rewards: product.rewards || null,
      boosts: product.boosts || null,
      messageCredits: product.messageCredits || null,
      copBonusCredits: product.copBonusCredits || null,
      dailyLimit: product.dailyLimit || null,
      maxQuantity: product.maxQuantity,
    };
  });
}

function skuToBytes32(sku) {
  const raw = String(sku || '').trim();
  const bytes = Buffer.from(raw, 'utf8');
  if (bytes.length < 1 || bytes.length > 32) throw new Error('Bad SKU');
  const out = Buffer.alloc(32);
  bytes.copy(out);
  return `0x${out.toString('hex')}`;
}

function bytes32ToSku(value) {
  const hex = String(value || '').replace(/^0x/i, '');
  if (!/^[0-9a-fA-F]{64}$/.test(hex)) return '';
  return Buffer.from(hex, 'hex').toString('utf8').replace(/\0+$/g, '');
}

function gameAccountHash(playerId) {
  return `0x${crypto.createHash('sha256').update(`clash-player:${playerId}`).digest('hex')}`;
}

function sqliteDateFromDate(date) {
  return date.toISOString().replace('T', ' ').slice(0, 19);
}

function extendPlayerShield(playerId, durationHours) {
  const player = db.stmts.getPlayerById.get(playerId);
  if (!player) return null;
  const now = new Date();
  const currentUntil = player.shield_until ? new Date(`${player.shield_until}Z`) : null;
  const baseTime = currentUntil && currentUntil > now ? currentUntil.getTime() : now.getTime();
  const next = new Date(baseTime + Math.max(1, durationHours) * 3600_000);
  const shieldUntil = sqliteDateFromDate(next);
  db.db.prepare('UPDATE players SET shield_until = ? WHERE id = ?').run(shieldUntil, playerId);
  return shieldUntil;
}

const AI_CHAT_FREE_MESSAGES_SETTING_KEY = 'ai_chat.free_messages_per_day';
const AI_CHAT_DEFAULT_FREE_MESSAGES_PER_DAY = Math.max(0, Number(process.env.AI_CHAT_FREE_MESSAGES_PER_DAY || 10));

function readAppSettingJson(key, fallback = null) {
  const row = db.db.prepare('SELECT value_json FROM app_settings WHERE key = ?').get(key);
  if (!row) return fallback;
  try { return JSON.parse(row.value_json); } catch { return fallback; }
}

function writeAppSettingJson(key, value) {
  db.db.prepare(`
    INSERT INTO app_settings (key, value_json, updated_at)
    VALUES (?, ?, datetime('now'))
    ON CONFLICT(key) DO UPDATE SET
      value_json = excluded.value_json,
      updated_at = datetime('now')
  `).run(key, JSON.stringify(value));
  return value;
}

function getAiChatFreeMessagesPerDay() {
  const configured = readAppSettingJson(AI_CHAT_FREE_MESSAGES_SETTING_KEY, null);
  const raw = configured?.free_messages_per_day ?? configured;
  const value = Number(raw);
  return Number.isFinite(value) ? Math.max(0, Math.min(1000, Math.floor(value))) : AI_CHAT_DEFAULT_FREE_MESSAGES_PER_DAY;
}

function aiChatDayKey(date = new Date()) {
  return date.toISOString().slice(0, 10);
}

function ensureAiMessageRows(playerId, day = aiChatDayKey()) {
  db.db.prepare(`
    INSERT INTO ai_message_credit_balances (player_id, credits, updated_at)
    VALUES (?, 0, datetime('now'))
    ON CONFLICT(player_id) DO NOTHING
  `).run(playerId);
  db.db.prepare(`
    INSERT INTO ai_message_entitlements (player_id, lifetime_daily_limit, updated_at)
    VALUES (?, 0, datetime('now'))
    ON CONFLICT(player_id) DO NOTHING
  `).run(playerId);
  db.db.prepare(`
    INSERT INTO ai_message_daily_usage (player_id, day, updated_at)
    VALUES (?, ?, datetime('now'))
    ON CONFLICT(player_id, day) DO NOTHING
  `).run(playerId, day);
}

function getAiMessageQuotaStatus(playerId) {
  const day = aiChatDayKey();
  ensureAiMessageRows(playerId, day);
  const freeDailyLimit = getAiChatFreeMessagesPerDay();
  const balance = db.db.prepare('SELECT credits FROM ai_message_credit_balances WHERE player_id = ?').get(playerId) || {};
  const entitlement = db.db.prepare('SELECT lifetime_daily_limit FROM ai_message_entitlements WHERE player_id = ?').get(playerId) || {};
  const usage = db.db.prepare('SELECT * FROM ai_message_daily_usage WHERE player_id = ? AND day = ?').get(playerId, day) || {};
  const lifetimeDailyLimit = Math.max(0, Number(entitlement.lifetime_daily_limit || 0));
  const freeAvailable = lifetimeDailyLimit > 0
    ? 0
    : Math.max(0, freeDailyLimit - Number(usage.free_used || 0));
  const subscriptionAvailable = Math.max(0, lifetimeDailyLimit - Number(usage.subscription_used || 0));
  const credits = Math.max(0, Number(balance.credits || 0));
  return {
    day,
    free_daily_limit: freeDailyLimit,
    free_used: Number(usage.free_used || 0),
    free_available: freeAvailable,
    lifetime_daily_limit: lifetimeDailyLimit,
    subscription_used: Number(usage.subscription_used || 0),
    subscription_available: subscriptionAvailable,
    credits,
    credit_used_today: Number(usage.credit_used || 0),
    total_used_today: Number(usage.total_used || 0),
    available_messages: freeAvailable + subscriptionAvailable + credits,
  };
}

function addAiMessageCredits(playerId, credits, reason = 'grant', metadata = null) {
  const amount = Math.max(0, Math.floor(Number(credits) || 0));
  ensureAiMessageRows(playerId);
  if (amount <= 0) return getAiMessageQuotaStatus(playerId);
  db.db.prepare(`
    UPDATE ai_message_credit_balances
    SET credits = credits + ?, updated_at = datetime('now')
    WHERE player_id = ?
  `).run(amount, playerId);
  const row = db.db.prepare('SELECT credits FROM ai_message_credit_balances WHERE player_id = ?').get(playerId);
  db.db.prepare(`
    INSERT INTO ai_message_credit_ledger (player_id, delta, balance_after, reason, metadata_json)
    VALUES (?, ?, ?, ?, ?)
  `).run(playerId, amount, Number(row?.credits || 0), reason, metadata ? JSON.stringify(metadata) : null);
  return getAiMessageQuotaStatus(playerId);
}

function activateAiLifetimePass(playerId, dailyLimit, metadata = null) {
  const limit = Math.max(0, Math.floor(Number(dailyLimit) || 0));
  ensureAiMessageRows(playerId);
  db.db.prepare(`
    INSERT INTO ai_message_entitlements (player_id, lifetime_daily_limit, updated_at)
    VALUES (?, ?, datetime('now'))
    ON CONFLICT(player_id) DO UPDATE SET
      lifetime_daily_limit = MAX(lifetime_daily_limit, excluded.lifetime_daily_limit),
      updated_at = datetime('now')
  `).run(playerId, limit);
  db.db.prepare(`
    INSERT INTO ai_message_credit_ledger (player_id, delta, balance_after, reason, metadata_json)
    VALUES (?, 0, (SELECT credits FROM ai_message_credit_balances WHERE player_id = ?), 'lifetime_pass', ?)
  `).run(playerId, playerId, metadata ? JSON.stringify(metadata) : null);
  return getAiMessageQuotaStatus(playerId);
}

function reserveAiChatMessage(playerId) {
  return db.db.transaction(() => {
    const before = getAiMessageQuotaStatus(playerId);
    const day = before.day;
    let bucket = null;
    if (before.lifetime_daily_limit > 0 && before.subscription_available > 0) bucket = 'subscription';
    else if (before.lifetime_daily_limit <= 0 && before.free_available > 0) bucket = 'free';
    else if (before.credits > 0) bucket = 'credit';

    if (!bucket) return { ok: false, quota: before };
    if (bucket === 'credit') {
      db.db.prepare(`
        UPDATE ai_message_credit_balances
        SET credits = credits - 1, updated_at = datetime('now')
        WHERE player_id = ? AND credits > 0
      `).run(playerId);
      db.db.prepare(`
        UPDATE ai_message_daily_usage
        SET credit_used = credit_used + 1, total_used = total_used + 1, updated_at = datetime('now')
        WHERE player_id = ? AND day = ?
      `).run(playerId, day);
      const row = db.db.prepare('SELECT credits FROM ai_message_credit_balances WHERE player_id = ?').get(playerId);
      db.db.prepare(`
        INSERT INTO ai_message_credit_ledger (player_id, delta, balance_after, reason, metadata_json)
        VALUES (?, -1, ?, 'chat_message', ?)
      `).run(playerId, Number(row?.credits || 0), JSON.stringify({ day }));
    } else {
      const column = bucket === 'subscription' ? 'subscription_used' : 'free_used';
      db.db.prepare(`
        UPDATE ai_message_daily_usage
        SET ${column} = ${column} + 1, total_used = total_used + 1, updated_at = datetime('now')
        WHERE player_id = ? AND day = ?
      `).run(playerId, day);
    }
    return { ok: true, reservation: { bucket, day }, quota: getAiMessageQuotaStatus(playerId) };
  })();
}

function refundAiChatReservation(playerId, reservation) {
  if (!reservation?.bucket || !reservation?.day) return getAiMessageQuotaStatus(playerId);
  return db.db.transaction(() => {
    ensureAiMessageRows(playerId, reservation.day);
    if (reservation.bucket === 'credit') {
      db.db.prepare(`
        UPDATE ai_message_credit_balances
        SET credits = credits + 1, updated_at = datetime('now')
        WHERE player_id = ?
      `).run(playerId);
      db.db.prepare(`
        UPDATE ai_message_daily_usage
        SET credit_used = MAX(0, credit_used - 1),
            total_used = MAX(0, total_used - 1),
            updated_at = datetime('now')
        WHERE player_id = ? AND day = ?
      `).run(playerId, reservation.day);
      const row = db.db.prepare('SELECT credits FROM ai_message_credit_balances WHERE player_id = ?').get(playerId);
      db.db.prepare(`
        INSERT INTO ai_message_credit_ledger (player_id, delta, balance_after, reason, metadata_json)
        VALUES (?, 1, ?, 'chat_refund', ?)
      `).run(playerId, Number(row?.credits || 0), JSON.stringify({ day: reservation.day }));
    } else {
      const column = reservation.bucket === 'subscription' ? 'subscription_used' : 'free_used';
      db.db.prepare(`
        UPDATE ai_message_daily_usage
        SET ${column} = MAX(0, ${column} - 1),
            total_used = MAX(0, total_used - 1),
            updated_at = datetime('now')
        WHERE player_id = ? AND day = ?
      `).run(playerId, reservation.day);
    }
    return getAiMessageQuotaStatus(playerId);
  })();
}

function applyGameShopProduct(playerId, product, quantity, context = {}) {
  if (product.kind === 'shield') {
    const shieldUntil = extendPlayerShield(playerId, (product.durationHours || 24) * quantity);
    return {
      shield_until: shieldUntil,
      resources: db.getResources(playerId),
    };
  }
  if (product.kind === 'resources') {
    const rewards = product.rewards || {};
    const resources = db.addResources(
      playerId,
      (rewards.gold || 0) * quantity,
      (rewards.wood || 0) * quantity,
      (rewards.ore || 0) * quantity,
      {
        sourceType: 'shop_purchase',
        metadata: {
          sku: product.sku,
          kind: product.kind,
          quantity,
          chain: context.chain || null,
          payment: context.payment || null,
          source: context.source || null,
        },
      },
    );
    return { resources };
  }
  if (product.kind === 'altar') {
    const boosts = product.boosts || {};
    return {
      altar: {
        active: true,
        resources_boost_pct: boosts.resourcesPct || 40,
        base_boost_pct: boosts.basePct || 40,
        trophy_boost_per_attack: boosts.trophyPerAttack || 10,
      },
      shop_entitlements: { altar: true },
      building_unlocks: { altar: true },
    };
  }
  if (product.kind === 'ai_messages') {
    const paidWithCop = String(context.payment || '').toLowerCase() === 'cop';
    const unitCredits = paidWithCop && product.copBonusCredits
      ? product.copBonusCredits
      : product.messageCredits;
    const granted = Math.max(0, Number(unitCredits || 0) * quantity);
    const quota = addAiMessageCredits(playerId, granted, 'purchase', {
      sku: product.sku,
      chain: context.chain || null,
      payment: context.payment || null,
      quantity,
    });
    return { ai_messages_granted: granted, ai_quota: quota };
  }
  if (product.kind === 'ai_subscription') {
    const quota = activateAiLifetimePass(playerId, product.dailyLimit || 100, {
      sku: product.sku,
      chain: context.chain || null,
      payment: context.payment || null,
      quantity,
    });
    return { ai_subscription: { lifetime_daily_limit: product.dailyLimit || 100 }, ai_quota: quota };
  }
  return {};
}

function isOwnedGameShopProduct(playerId, product) {
  if (!playerId || !product) return false;
  if (product.kind === 'altar') return db.hasUtilityPurchase(playerId, product.sku || product.id);
  return false;
}

function ownedGameShopGrant(playerId, utility) {
  const product = GAME_SHOP_PRODUCTS[utility];
  if (!product || !isOwnedGameShopProduct(playerId, product)) return {};
  if (product.kind === 'altar') {
    return applyGameShopProduct(playerId, product, 1, { ownedSnapshot: true });
  }
  return {};
}

async function parseGameShopEvmAccount() {
  const raw = process.env.GAME_SHOP_QUOTE_KEY
    || process.env.NFT_BASE_SHOP_QUOTE_KEY
    || process.env.NFT_EVM_KEY
    || process.env.NFT_BASE
    || process.env.BASE_NFT_KEY
    || process.env.NFT_KEY;
  if (!raw) throw new Error('Game shop quote signer is not configured');

  const { privateKeyToAccount, mnemonicToAccount } = await import('viem/accounts');
  if (/^(0x)?[0-9a-fA-F]{64}$/.test(raw)) {
    return privateKeyToAccount(raw.startsWith('0x') ? raw : `0x${raw}`);
  }

  const words = raw.trim().split(/\s+/);
  if (words.length >= 12 && words.length <= 24 && words.every((word) => /^[a-z]+$/i.test(word))) {
    const hdPath = process.env.GAME_SHOP_MNEMONIC_PATH || process.env.NFT_BASE_MNEMONIC_PATH || "m/44'/60'/0'/0/0";
    return mnemonicToAccount(raw.trim(), { path: hdPath });
  }

  throw new Error('Game shop quote signer key is not a usable EVM key');
}

// Parse the server's Solana signing keypair. We reuse the same env vars
// the nft/scripts/lib-env.mjs convention uses: NFT_KEY (Solana base58),
// SOLANA_NFT_KEY, or NFT_SOLANA_KEY. The keypair is used only to sign the
// quote memo bytes (off-chain ed25519) — it does NOT pay for the user's
// purchase tx, so the wallet doesn't need SOL on it. Cached after first
// call so we don't re-derive on every quote.
let _solanaSignerKeypair = null;
function getSolanaSignerKeypair() {
  if (_solanaSignerKeypair) return _solanaSignerKeypair;
  const raw = String(
    process.env.GAME_SHOP_SOLANA_QUOTE_KEY
    || process.env.SOLANA_NFT_KEY
    || process.env.NFT_SOLANA_KEY
    || process.env.NFT_KEY
    || '',
  ).trim();
  if (!raw) throw new Error('Solana game shop signer is not configured');
  const { Keypair } = require('@solana/web3.js');
  // Accept JSON byte array, hex (32 or 64), or base58 (32 or 64). Mirrors
  // parseSolanaKeypair in nft/scripts/lib-env.mjs.
  if (/^\s*\[/.test(raw)) {
    const bytes = Uint8Array.from(JSON.parse(raw));
    if (bytes.length === 64) {
      _solanaSignerKeypair = Keypair.fromSecretKey(bytes);
      return _solanaSignerKeypair;
    }
    if (bytes.length === 32) {
      _solanaSignerKeypair = Keypair.fromSeed(bytes);
      return _solanaSignerKeypair;
    }
    throw new Error(`Unsupported Solana key byte length: ${bytes.length}`);
  }
  if (/^(0x)?[0-9a-fA-F]{64}$/.test(raw)) {
    const hex = raw.startsWith('0x') ? raw.slice(2) : raw;
    _solanaSignerKeypair = Keypair.fromSeed(Uint8Array.from(Buffer.from(hex, 'hex')));
    return _solanaSignerKeypair;
  }
  const decoded = bs58.decode(raw);
  if (decoded.length === 64) {
    _solanaSignerKeypair = Keypair.fromSecretKey(decoded);
    return _solanaSignerKeypair;
  }
  if (decoded.length === 32) {
    _solanaSignerKeypair = Keypair.fromSeed(decoded);
    return _solanaSignerKeypair;
  }
  throw new Error(`Unsupported Solana key length: ${decoded.length} bytes`);
}

let _solanaConnectionCache = null;
let _solanaConnectionListCache = null;
function solanaRpcUrls(extraUrls = []) {
  return buildSolanaRpcUrls(extraUrls);
}

function getSolanaConnection() {
  if (_solanaConnectionCache) return _solanaConnectionCache;
  const { Connection } = require('@solana/web3.js');
  const rpcUrl = solanaRpcUrls()[0];
  if (!rpcUrl) throw new Error('Solana RPC endpoint is not configured');
  _solanaConnectionCache = createSolanaConnection(Connection, rpcUrl, 'confirmed');
  return _solanaConnectionCache;
}

function getSolanaConnections() {
  if (_solanaConnectionListCache) return _solanaConnectionListCache;
  const { Connection } = require('@solana/web3.js');
  _solanaConnectionListCache = solanaRpcUrls().map((rpcUrl) => createSolanaConnection(Connection, rpcUrl, 'confirmed'));
  return _solanaConnectionListCache;
}

async function getParsedTransactionWithSolanaFallback(signature, options) {
  let lastError = null;
  for (const connection of getSolanaConnections()) {
    try {
      // eslint-disable-next-line no-await-in-loop
      const parsed = await connection.getParsedTransaction(signature, options);
      if (parsed) return parsed;
    } catch (err) {
      lastError = err;
    }
  }
  if (lastError) {
    const err = new Error(`Solana RPC could not read tx: ${lastError.message || lastError}`);
    err.status = 503;
    throw err;
  }
  return null;
}

const SOLANA_SKR_MINT_DEFAULT = 'SKRbvo6Gf7GondiT3BbTfuRDPqLWei4j2Qy2NPGZhW3';
const SOLANA_SKR_DECIMALS_DEFAULT = 6;
const _solanaMintDecimalsCache = new Map();
async function resolveSolanaMintDecimals(mint, fallback = SOLANA_SKR_DECIMALS_DEFAULT) {
  const fallbackDecimals = Number.isFinite(Number(fallback)) ? Number(fallback) : SOLANA_SKR_DECIMALS_DEFAULT;
  if (!mint || !SOLANA_WALLET_RE.test(String(mint))) return fallbackDecimals;

  const cached = _solanaMintDecimalsCache.get(mint);
  const now = Date.now();
  if (cached && cached.expiresAt > now) return cached.decimals;

  let decimals = fallbackDecimals;
  try {
    const { PublicKey } = require('@solana/web3.js');
    const { getMint, TOKEN_PROGRAM_ID, TOKEN_2022_PROGRAM_ID } = require('@solana/spl-token');
    const mintPk = new PublicKey(mint);
    const programs = [TOKEN_PROGRAM_ID, TOKEN_2022_PROGRAM_ID].filter(Boolean);
    let mintInfo = null;
    for (const connection of getSolanaConnections()) {
      for (const programId of programs) {
        try {
          // eslint-disable-next-line no-await-in-loop
          mintInfo = await getMint(connection, mintPk, 'confirmed', programId);
          break;
        } catch {
          // Try the next token program. SKR can be either SPL Token or Token-2022
          // depending on the deployed mint, so the mint account is the source of truth.
        }
      }
      if (mintInfo) break;
    }
    if (Number.isFinite(Number(mintInfo?.decimals))) {
      decimals = Number(mintInfo.decimals);
    }
  } catch (err) {
    console.warn('[shop] failed to read Solana mint decimals; using fallback', {
      mint,
      fallbackDecimals,
      message: err?.message || String(err),
    });
  }

  _solanaMintDecimalsCache.set(mint, { decimals, expiresAt: now + 10 * 60 * 1000 });
  return decimals;
}

async function createBasePublicClient() {
  const { createPublicClient, http } = await import('viem');
  const { base } = await import('viem/chains');
  const rpcUrl = process.env.GAME_SHOP_BASE_RPC_URL
    || process.env.NFT_BASE_RPC_URL
    || process.env.BASE_RPC_URL
    || process.env.VITE_BASE_RPC_URL
    || 'https://mainnet.base.org';
  return createPublicClient({ chain: base, transport: http(rpcUrl) });
}

function fallbackNftSupply(source = 'fallback') {
  return {
    totalMinted: null,
    maxSupply: NFT_MAX_SUPPLY,
    remaining: null,
    source,
  };
}

// Global cross-chain NFT supply cap. The cap of 333 is enforced by the
// server (single source of truth) across Base + Solana + Arbitrum + Monad
// + Aptos. EVM contracts still use their per-chain `maxSupply` for primary
// sale/admin minting, while bridgeMint is allowed to exceed a local cap so
// Base can serve as the marketplace hub. We sign initial mint quotes only
// while the SUM of live NFTs across chains is under this global limit.
// Set via env so we can lift it later without a code change.
const NFT_GLOBAL_SUPPLY_CAP = Number(process.env.NFT_GLOBAL_SUPPLY_CAP || NFT_DEFAULT_GLOBAL_SUPPLY_CAP);
const NFT_SUPPLY_CACHE_SETTING_KEY = 'nft.global_supply_snapshot.v1';
const NFT_SUPPLY_CHAINS = ['base', 'solana', 'arbitrum', 'monad', 'ink', 'aptos'];
const NFT_SUPPLY_CACHE_TTL_MS = Math.max(1000, Number(process.env.NFT_SUPPLY_CACHE_TTL_MS || 10_000));
const NFT_SUPPLY_REFRESH_INTERVAL_MS = Math.max(60_000, Number(process.env.NFT_SUPPLY_REFRESH_INTERVAL_MS || 5 * 60_000));

// Light-weight in-memory cache for the most recent per-chain supply read
// so a flood of quote requests doesn't fan out RPC calls to every chain.
// 10s TTL is enough — within that window we trust the cache; outside we
// re-read on demand. Cache misses fall back to "unknown" which we treat
// as "let the quote through" to avoid blocking buyers when an RPC is
// flaky; primary mint contracts still gate their own sale/admin mints.
let _nftGlobalSupplyCache = {
  fetchedAt: 0,
  syncedAt: 0,
  perChain: {},
  perChainRaw: {},
  total: 0,
  cap: NFT_GLOBAL_SUPPLY_CAP,
  source: 'empty',
};
let _nftGlobalSupplyRefreshTimer = null;
let _nftGlobalSupplyRefreshInFlight = null;

function finiteNftSupplyCount(value) {
  const n = Number(value);
  if (!Number.isFinite(n) || n < 0) return null;
  return Math.floor(n);
}

function parseNftSupplyTime(value) {
  if (Number.isFinite(Number(value)) && Number(value) > 0) return Number(value);
  if (typeof value === 'string' && value.trim()) {
    const t = Date.parse(value);
    return Number.isFinite(t) ? t : 0;
  }
  return 0;
}

function normalizeNftSupplySnapshot(raw) {
  if (!raw || typeof raw !== 'object') return null;
  const perChainSource = raw.perChain || raw.per_chain || {};
  const perChain = {};
  for (const chain of NFT_SUPPLY_CHAINS) {
    const n = finiteNftSupplyCount(perChainSource[chain]);
    if (n != null) perChain[chain] = n;
  }
  if (!Object.keys(perChain).length) return null;

  const fetchedAt = parseNftSupplyTime(raw.fetchedAt ?? raw.fetched_at ?? raw.cachedAt ?? raw.cached_at);
  const syncedAt = parseNftSupplyTime(raw.syncedAt ?? raw.synced_at) || fetchedAt;
  const chainSyncedAt = {};
  const rawChainSyncedAt = raw.chainSyncedAt || raw.chain_synced_at || {};
  for (const chain of NFT_SUPPLY_CHAINS) {
    chainSyncedAt[chain] = parseNftSupplyTime(rawChainSyncedAt[chain]) || syncedAt || 0;
  }

  const total = finiteNftSupplyCount(raw.total)
    ?? Object.values(perChain).reduce((sum, n) => sum + (Number.isFinite(n) ? n : 0), 0);
  const sourceByChain = raw.sourceByChain || raw.source_by_chain || {};
  const fallbackSourceByChain = raw.fallbackSourceByChain || raw.fallback_source_by_chain || {};

  return {
    fetchedAt,
    syncedAt,
    chainSyncedAt,
    perChain,
    perChainRaw: raw.perChainRaw || raw.per_chain_raw || {},
    total,
    cap: finiteNftSupplyCount(raw.cap) ?? NFT_GLOBAL_SUPPLY_CAP,
    source: raw.source || 'persisted',
    liveChains: Array.isArray(raw.liveChains) ? raw.liveChains.filter((chain) => NFT_SUPPLY_CHAINS.includes(chain)) : [],
    fallbackChains: Array.isArray(raw.fallbackChains) ? raw.fallbackChains.filter((chain) => NFT_SUPPLY_CHAINS.includes(chain)) : [],
    sourceByChain,
    fallbackSourceByChain,
  };
}

function readPersistedNftSupplySnapshot() {
  try {
    return normalizeNftSupplySnapshot(readAppSettingJson(NFT_SUPPLY_CACHE_SETTING_KEY, null));
  } catch (err) {
    console.warn('[NFT] failed to read persisted supply snapshot', err?.message || err);
    return null;
  }
}

function persistNftSupplySnapshot(snapshot) {
  const normalized = normalizeNftSupplySnapshot(snapshot);
  if (!normalized) return null;
  try {
    const value = {
      fetchedAt: normalized.fetchedAt,
      syncedAt: normalized.syncedAt,
      chainSyncedAt: normalized.chainSyncedAt,
      perChain: normalized.perChain,
      total: normalized.total,
      cap: normalized.cap,
      source: normalized.source,
      sourceByChain: normalized.sourceByChain,
      fallbackSourceByChain: normalized.fallbackSourceByChain,
      liveChains: normalized.liveChains,
      fallbackChains: normalized.fallbackChains,
    };
    writeAppSettingJson(NFT_SUPPLY_CACHE_SETTING_KEY, value);
    return value;
  } catch (err) {
    console.warn('[NFT] failed to persist supply snapshot', err?.message || err);
    return null;
  }
}

function nftSupplyIso(ms) {
  return ms ? new Date(ms).toISOString() : null;
}

function cachedNftChainSupply(chain, maxSupply = NFT_MAX_SUPPLY, source = 'cached_fallback') {
  const max = finiteNftSupplyCount(maxSupply) ?? NFT_MAX_SUPPLY;
  const snapshots = [
    normalizeNftSupplySnapshot(_nftGlobalSupplyCache),
    readPersistedNftSupplySnapshot(),
  ];
  for (const snapshot of snapshots) {
    const minted = finiteNftSupplyCount(snapshot?.perChain?.[chain]);
    if (minted == null) continue;
    return {
      totalMinted: minted,
      maxSupply: max,
      remaining: Math.max(0, max - minted),
      source,
      cachedAt: nftSupplyIso(snapshot.fetchedAt),
      syncedAt: nftSupplyIso(snapshot.chainSyncedAt?.[chain] || snapshot.syncedAt),
      stale: true,
    };
  }
  return null;
}

// Generic EVM "live tokens on this chain" reader. Prefers the V3.2+
// `currentSupply()` view (totalMinted - totalBurned, so a bridge_burn
// decrements the local count); falls back to plain `totalMinted()` on
// older implementations.
function parseEvmAddressList(value) {
  return String(value || '')
    .split(/[,\s]+/)
    .map((item) => item.trim())
    .filter((item) => /^0x[0-9a-fA-F]{40}$/.test(item));
}

function shouldScanEvmOwnersForSupply(chainKey) {
  const normalized = String(chainKey || '').toUpperCase();
  if (process.env[`NFT_${normalized}_SUPPLY_OWNER_SCAN`] != null) {
    return process.env[`NFT_${normalized}_SUPPLY_OWNER_SCAN`] !== '0';
  }
  if (process.env.NFT_EVM_SUPPLY_OWNER_SCAN != null) {
    return process.env.NFT_EVM_SUPPLY_OWNER_SCAN !== '0';
  }
  // Arbitrum had bridge burns before totalBurned existed, so currentSupply()
  // over-counts there. ownerOf scan is the canonical live set.
  return String(chainKey || '').toLowerCase() === 'arbitrum';
}

async function evmExcludedSupplyOwners({ chainKey, deployment, contractOwner }) {
  const { getAddress } = await import('viem');
  const normalized = String(chainKey || '').toUpperCase();
  const raw = [
    process.env.NFT_EVM_SUPPLY_EXCLUDED_OWNERS,
    process.env[`NFT_${normalized}_SUPPLY_EXCLUDED_OWNERS`],
  ].filter(Boolean).join(',');
  const set = new Set(parseEvmAddressList(raw).map((addr) => getAddress(addr).toLowerCase()));

  if (String(chainKey || '').toLowerCase() === 'arbitrum'
      && process.env.NFT_ARBITRUM_COUNT_OPERATOR_SUPPLY !== '1') {
    for (const addr of [deployment?.owner, deployment?.deployer, contractOwner]) {
      if (/^0x[0-9a-fA-F]{40}$/.test(String(addr || ''))) {
        set.add(getAddress(addr).toLowerCase());
      }
    }
  }
  return set;
}

async function readEvmLiveOwnerSupply({ address, publicClient, chainKey, deployment, totalMinted }) {
  const maxScan = Math.max(0, Number(process.env.NFT_EVM_LIVE_OWNER_SCAN_MAX || 750));
  const total = Number(totalMinted);
  if (!Number.isSafeInteger(total) || total < 0 || total > maxScan) return null;
  if (total === 0) return 0;

  const { getAddress } = await import('viem');
  const checksumAddr = getAddress(address);
  let contractOwner = null;
  try {
    contractOwner = await publicClient.readContract({
      address: checksumAddr,
      abi: BASE_NFT_SUPPLY_ABI,
      functionName: 'owner',
    });
  } catch {
    // Non-ownable legacy deployments simply have no default owner exclusion.
  }

  const excludedOwners = await evmExcludedSupplyOwners({ chainKey, deployment, contractOwner });
  const ids = Array.from({ length: total }, (_, index) => BigInt(index + 1));
  const results = await publicClient.multicall({
    contracts: ids.map((id) => ({
      address: checksumAddr,
      abi: BASE_NFT_SUPPLY_ABI,
      functionName: 'ownerOf',
      args: [id],
    })),
    allowFailure: true,
  });

  let live = 0;
  let excluded = 0;
  let missing = 0;
  for (const result of results) {
    if (result?.status !== 'success' || !result.result) {
      missing += 1;
      continue;
    }
    const owner = getAddress(result.result).toLowerCase();
    if (excludedOwners.has(owner)) {
      excluded += 1;
      continue;
    }
    live += 1;
  }
  if (missing > 0 || excluded > 0) {
    console.warn(`[NFT] ${chainKey} supply owner scan: live=${live}, missing=${missing}, excluded=${excluded}, totalMinted=${total}`);
  }
  return live;
}

async function readEvmCurrentSupplyOrTotalMinted({ address, publicClient, chainKey = 'base', deployment = {} }) {
  const { getAddress } = await import('viem');
  const checksumAddr = getAddress(address);
  let totalMinted = null;
  try {
    totalMinted = await publicClient.readContract({
      address: checksumAddr, abi: BASE_NFT_SUPPLY_ABI, functionName: 'totalMinted',
    });
  } catch {
    totalMinted = null;
  }

  if (totalMinted != null && shouldScanEvmOwnersForSupply(chainKey)) {
    try {
      const scanned = await readEvmLiveOwnerSupply({
        address: checksumAddr,
        publicClient,
        chainKey,
        deployment,
        totalMinted,
      });
      if (scanned != null) return scanned;
    } catch (err) {
      console.warn(`[NFT] ${chainKey} supply owner scan failed`, err?.message || err);
    }
  }

  try {
    const cs = await publicClient.readContract({
      address: checksumAddr, abi: BASE_NFT_SUPPLY_ABI, functionName: 'currentSupply',
    });
    return Number(cs);
  } catch {
    // Pre-V3.2 (no currentSupply selector) → use totalMinted.
    try {
      if (totalMinted == null) {
        totalMinted = await publicClient.readContract({
          address: checksumAddr, abi: BASE_NFT_SUPPLY_ABI, functionName: 'totalMinted',
        });
      }
      return Number(totalMinted);
    } catch { return null; }
  }
}

async function readBaseNftMintedCount(config) {
  try {
    if (!config?.nft) return null;
    const { createPublicClient, http } = await import('viem');
    const { base } = await import('viem/chains');
    const rpcUrl = process.env.NFT_BASE_RPC_URL || process.env.BASE_RPC_URL || 'https://mainnet.base.org';
    const publicClient = createPublicClient({ chain: base, transport: http(rpcUrl) });
    const n = await readEvmCurrentSupplyOrTotalMinted({ address: config.nft, publicClient, chainKey: 'base' });
    if (n != null) return n;
    // Last-ditch: original readBaseNftSupply path (returns {totalMinted,...}).
    const r = await readBaseNftSupply(config);
    return Number.isFinite(r?.totalMinted) ? r.totalMinted : null;
  } catch { return null; }
}

async function readSolanaNftMintedCount(deployment) {
  // Switched from candy_machine.itemsRedeemed → collection.ConcurrentSupply
  // (mpl-core CollectionV1). The candy-machine counter never decrements
  // on burnV1 and ignores bridge mints that go around the candy machine,
  // so it under-reports both ways. The collection's ConcurrentSupply
  // reflects EVERY mint/burn of an asset pinned to the collection,
  // matching the EVM `currentSupply()` semantics.
  try {
    const collectionAddr = process.env.NFT_SOLANA_COLLECTION || deployment?.collection;
    if (!collectionAddr) {
      const r = await readSolanaNftSupply(deployment);
      return Number.isFinite(r?.totalMinted) ? r.totalMinted : null;
    }
    // mpl-core CollectionV1 lives at the collection account itself. We use
    // UMI's deserializer rather than hand-rolling the byte layout — the
    // `numMinted` and `numBurned` fields are at variable offsets depending
    // on plugin presence, so we let the SDK figure it out.
    const { createUmi } = await import('@metaplex-foundation/umi-bundle-defaults');
    const { mplCore, fetchCollection } = await import('@metaplex-foundation/mpl-core');
    const { publicKey } = await import('@metaplex-foundation/umi');
    const col = await withSolanaRpcFallback(async (rpcUrl) => {
      const umi = createUmi(rpcUrl).use(mplCore());
      return fetchCollection(umi, publicKey(collectionAddr));
    }, {
      urls: solanaNonHeliusRpcUrls(solanaRpcUrls([deployment?.rpcUrl])),
      label: 'Solana NFT collection supply read',
    });
    const numMinted = Number(col.numMinted ?? 0);
    const numBurned = Number(col.currentSize != null
      ? (numMinted - Number(col.currentSize)) // some SDK versions expose currentSize directly
      : 0);
    // Prefer currentSize when available (already net of burns); otherwise
    // fall back to numMinted (matches V2 behaviour exactly).
    if (Number.isFinite(Number(col.currentSize))) return Number(col.currentSize);
    return Math.max(0, numMinted - numBurned);
  } catch {
    // Network failure or unexpected SDK shape — defer to the old reader.
    try {
      const r = await readSolanaNftSupply(deployment);
      return Number.isFinite(r?.totalMinted) ? r.totalMinted : null;
    } catch { return null; }
  }
}

async function readEvmGenericNftMintedCount(chainKey) {
  // For Arbitrum/Monad — same V3 contract pattern as Base. Prefers V3.2+
  // currentSupply() so bridge round-trips net to zero; falls back to
  // totalMinted() on older impls.
  const deployment = readJsonIfExists(path.join(NFT_ROOT, 'deployments', `${chainKey}-v3-mainnet.json`)) || {};
  const contractAddr = process.env[`NFT_${chainKey.toUpperCase()}_CONTRACT`] || deployment.proxy || deployment.contract;
  if (!contractAddr) return null;
  try {
    const { createPublicClient, http } = await import('viem');
    const viemChains = await import('viem/chains');
    const monadChain = { id: 143, name: 'Monad', nativeCurrency: { name: 'MON', symbol: 'MON', decimals: 18 }, rpcUrls: { default: { http: ['https://rpc.monad.xyz'] } } };
    const inkChain = { id: 57073, name: 'Ink', nativeCurrency: { name: 'ETH', symbol: 'ETH', decimals: 18 }, rpcUrls: { default: { http: ['https://rpc-gel.inkonchain.com'] } } };
    const chain = { base: viemChains.base, arbitrum: viemChains.arbitrum, monad: monadChain, ink: inkChain }[chainKey];
    const rpcUrl = GAME_SHOP_EVM_CHAINS[chainKey]?.rpcUrl?.()
      || `https://${chainKey}.gateway.tenderly.co`; // last-ditch fallback
    const publicClient = createPublicClient({ chain, transport: http(rpcUrl) });
    return await readEvmCurrentSupplyOrTotalMinted({
      address: contractAddr,
      publicClient,
      chainKey,
      deployment,
    });
  } catch { return null; }
}

async function readAptosNftMintedCount() {
  // Prefer the v3.2+ view function `clash_nft::demon_king::current_supply`
  // which returns `total_minted - total_burned` so bridge_burn calls
  // properly decrement the off-chain global counter. Falls back to the
  // raw ConcurrentSupply read on older deploys (no BurnStats yet).
  const deployment = readJsonIfExists(path.join(NFT_ROOT, 'deployments', 'aptos-mainnet.json')) || {};
  const collectionAddr = process.env.NFT_APTOS_COLLECTION || deployment.collection;
  const moduleAddr = deployment.module || (deployment.admin
    ? `${deployment.admin}::demon_king` : null);
  const fullnode = process.env.NFT_APTOS_RPC_URL || aptosFullnode();
  const apiKey = process.env.APTOS_NODE_API_KEY;
  const headers = apiKey ? { Authorization: `Bearer ${apiKey}`, 'content-type': 'application/json' }
                          : { 'content-type': 'application/json' };

  if (moduleAddr) {
    try {
      const r = await fetch(`${fullnode}/view`, {
        method: 'POST', headers,
        body: JSON.stringify({
          function: `${moduleAddr}::current_supply`,
          type_arguments: [], arguments: [],
        }),
      });
      if (r.ok) {
        const arr = await r.json();
        const v = Array.isArray(arr) ? Number(arr[0]) : null;
        if (Number.isFinite(v)) return v;
      }
    } catch { /* view not deployed yet — fall through */ }
  }

  if (!collectionAddr) return null;
  try {
    const r = await fetch(`${fullnode}/accounts/${collectionAddr}/resource/0x4::collection::ConcurrentSupply`, { headers });
    if (!r.ok) return null;
    const json = await r.json();
    const value = json?.data?.current_supply?.value;
    if (value == null) return null;
    const minted = Number(value);
    return Number.isFinite(minted) ? minted : null;
  } catch { return null; }
}

// Per-chain baseline minted counts from deployment JSON. Used as a floor
// when a chain RPC fails on the very first fetch (no prior cache yet) so
// the UI never shows a number lower than what we deployed with.
function nftBaselinePerChain() {
  const dep = (file) => readJsonIfExists(path.join(NFT_ROOT, 'deployments', file)) || {};
  const numOr0 = (v) => (Number.isFinite(Number(v)) ? Number(v) : 0);
  const baseV3 = dep('base-v3-mainnet.json');
  const arbV3  = dep('arbitrum-v3-mainnet.json');
  const monV3  = dep('monad-v3-mainnet.json');
  const inkV3  = dep('ink-v3-mainnet.json');
  const sol    = dep('solana-mainnet.json');
  const apt    = dep('aptos-mainnet.json');
  return {
    base:     numOr0(baseV3.totalMintedAtUpgrade),
    arbitrum: numOr0(arbV3.totalMintedAtUpgrade),
    monad:    numOr0(monV3.totalMintedAtUpgrade),
    ink:      numOr0(inkV3.totalMintedAtUpgrade),
    solana:   numOr0(sol.totalMinted),
    aptos:    numOr0(apt.totalMinted),
  };
}

async function readGlobalNftSupply(options = {}) {
  const force = !!options.force;
  const shouldPersist = options.persist !== false;
  const now = Date.now();
  if (!force && now - _nftGlobalSupplyCache.fetchedAt < NFT_SUPPLY_CACHE_TTL_MS && Object.keys(_nftGlobalSupplyCache.perChain).length > 0) {
    return _nftGlobalSupplyCache;
  }
  const previous = normalizeNftSupplySnapshot(_nftGlobalSupplyCache);
  const persisted = readPersistedNftSupplySnapshot();
  const baseConfig = baseNftConfig();
  const solanaDeployment = readJsonIfExists(path.join(NFT_ROOT, 'deployments', 'solana-mainnet.json')) || {};
  const [base, solana, arbitrum, monad, ink, aptos] = await Promise.all([
    readBaseNftMintedCount(baseConfig),
    readSolanaNftMintedCount(solanaDeployment),
    readEvmGenericNftMintedCount('arbitrum'),
    readEvmGenericNftMintedCount('monad'),
    readEvmGenericNftMintedCount('ink'),
    readAptosNftMintedCount(),
  ]);
  const perChainRaw = { base, solana, arbitrum, monad, ink, aptos };

  // Fallback ladder for each chain:
  //   1) live RPC reading (preferred)
  //   2) last known value from previous cache snapshot
  //   3) persisted server snapshot from app_settings
  //   4) baseline from deployment JSON (fresh-boot fallback only)
  //
  // Do not ratchet counts upward here. V3 currentSupply() and the Solana/
  // Aptos collection readers are net-of-bridge-burn, so a legitimate bridge
  // can make a source chain decrease before the destination mint lands.
  const baseline = nftBaselinePerChain();
  const resolvedPerChain = {};
  const sourceByChain = {};
  const fallbackSourceByChain = {};
  const liveChains = [];
  const fallbackChains = [];
  const chainSyncedAt = {};
  for (const k of NFT_SUPPLY_CHAINS) {
    const live = finiteNftSupplyCount(perChainRaw[k]);
    const prev = finiteNftSupplyCount(previous?.perChain?.[k]);
    const prevSource = previous?.sourceByChain?.[k]
      || previous?.fallbackSourceByChain?.[k]
      || previous?.source
      || 'empty';
    const stored = finiteNftSupplyCount(persisted?.perChain?.[k]);
    const storedSource = persisted?.sourceByChain?.[k]
      || persisted?.fallbackSourceByChain?.[k]
      || persisted?.source
      || 'persisted';
    const floor = finiteNftSupplyCount(baseline[k]) ?? 0;

    if (live != null) {
      resolvedPerChain[k] = live;
      sourceByChain[k] = 'rpc';
      chainSyncedAt[k] = now;
      liveChains.push(k);
      continue;
    }
    if (prev != null && prevSource !== 'baseline') {
      resolvedPerChain[k] = prev;
      sourceByChain[k] = prevSource === 'rpc' ? 'memory' : prevSource;
      fallbackSourceByChain[k] = sourceByChain[k];
      chainSyncedAt[k] = previous?.chainSyncedAt?.[k] || previous?.syncedAt || 0;
      fallbackChains.push(k);
      continue;
    }
    if (stored != null && storedSource !== 'baseline') {
      resolvedPerChain[k] = stored;
      sourceByChain[k] = 'persisted';
      fallbackSourceByChain[k] = 'persisted';
      chainSyncedAt[k] = persisted?.chainSyncedAt?.[k] || persisted?.syncedAt || 0;
      fallbackChains.push(k);
      continue;
    }
    if (prev != null) {
      resolvedPerChain[k] = prev;
      sourceByChain[k] = prevSource || 'memory';
      fallbackSourceByChain[k] = sourceByChain[k];
      chainSyncedAt[k] = previous?.chainSyncedAt?.[k] || previous?.syncedAt || 0;
      fallbackChains.push(k);
      continue;
    }
    if (stored != null) {
      resolvedPerChain[k] = stored;
      sourceByChain[k] = storedSource || 'persisted';
      fallbackSourceByChain[k] = sourceByChain[k];
      chainSyncedAt[k] = persisted?.chainSyncedAt?.[k] || persisted?.syncedAt || 0;
      fallbackChains.push(k);
      continue;
    }

    resolvedPerChain[k] = floor;
    sourceByChain[k] = 'baseline';
    fallbackSourceByChain[k] = 'baseline';
    chainSyncedAt[k] = 0;
    fallbackChains.push(k);
  }
  const total = Object.values(resolvedPerChain).reduce((sum, n) => sum + (Number.isFinite(n) ? n : 0), 0);
  const syncedAt = Object.values(chainSyncedAt).reduce((max, t) => Math.max(max, Number(t) || 0), 0);
  const chainSources = Object.values(sourceByChain);
  const source = liveChains.length === NFT_SUPPLY_CHAINS.length ? 'rpc'
    : liveChains.length > 0 ? 'mixed'
    : chainSources.length > 0 && chainSources.every((item) => item === 'persisted') ? 'persisted'
    : chainSources.some((item) => item && item !== 'baseline') ? 'cached'
    : 'baseline';
  _nftGlobalSupplyCache = {
    fetchedAt: now,
    syncedAt,
    chainSyncedAt,
    perChain: resolvedPerChain,
    perChainRaw,
    total,
    cap: NFT_GLOBAL_SUPPLY_CAP,
    source,
    sourceByChain,
    fallbackSourceByChain,
    liveChains,
    fallbackChains,
  };
  if (shouldPersist && liveChains.length > 0) {
    persistNftSupplySnapshot(_nftGlobalSupplyCache);
  }
  return _nftGlobalSupplyCache;
}

// Reusable gate — every quote endpoint calls this before signing.
async function refreshNftSupplyCache(reason = 'timer') {
  if (_nftGlobalSupplyRefreshInFlight) return _nftGlobalSupplyRefreshInFlight;
  _nftGlobalSupplyRefreshInFlight = readGlobalNftSupply({ force: true })
    .catch((err) => {
      console.warn(`[NFT] background supply refresh failed (${reason})`, err?.message || err);
      return null;
    })
    .finally(() => {
      _nftGlobalSupplyRefreshInFlight = null;
    });
  return _nftGlobalSupplyRefreshInFlight;
}

function startNftSupplyBackgroundRefresh() {
  if (_nftGlobalSupplyRefreshTimer || process.env.NFT_SUPPLY_REFRESH_DISABLE === '1') return;
  const startupTimer = setTimeout(() => { refreshNftSupplyCache('startup'); }, 15_000);
  if (typeof startupTimer.unref === 'function') startupTimer.unref();
  _nftGlobalSupplyRefreshTimer = setInterval(() => {
    refreshNftSupplyCache('interval');
  }, NFT_SUPPLY_REFRESH_INTERVAL_MS);
  if (typeof _nftGlobalSupplyRefreshTimer.unref === 'function') _nftGlobalSupplyRefreshTimer.unref();
}

startNftSupplyBackgroundRefresh();

async function assertGlobalSupplyAvailable(quantity) {
  const supply = await readGlobalNftSupply();
  const wanted = Number(quantity) || 1;
  if (supply.total + wanted > NFT_GLOBAL_SUPPLY_CAP) {
    const err = new Error(`Sold out: only ${Math.max(0, NFT_GLOBAL_SUPPLY_CAP - supply.total)} of ${NFT_GLOBAL_SUPPLY_CAP} NFTs remain across all chains`);
    err.status = 409;
    throw err;
  }
}

async function readBaseNftSupply(config) {
  if (!config?.nft) return fallbackNftSupply('not_deployed');

  const { createPublicClient, getAddress, http } = await import('viem');
  const { base } = await import('viem/chains');
  const rpcUrl = process.env.NFT_BASE_RPC_URL
    || process.env.BASE_RPC_URL
    || process.env.VITE_BASE_RPC_URL
    || 'https://mainnet.base.org';
  const publicClient = createPublicClient({ chain: base, transport: http(rpcUrl) });
  const address = getAddress(config.nft);
  const [totalMinted, maxSupply] = await Promise.all([
    publicClient.readContract({ address, abi: BASE_NFT_SUPPLY_ABI, functionName: 'totalMinted' }),
    publicClient.readContract({ address, abi: BASE_NFT_SUPPLY_ABI, functionName: 'maxSupply' }),
  ]);
  const minted = Number(totalMinted);
  const max = Number(maxSupply);
  return {
    totalMinted: minted,
    maxSupply: max,
    remaining: Math.max(0, max - minted),
    source: 'rpc',
  };
}

async function readSolanaNftSupply(deployment) {
  if (!deployment?.candyMachine) {
    return fallbackNftSupply('not_deployed');
  }

  const { Connection, PublicKey } = require('@solana/web3.js');
  const maxSupply = Number(process.env.NFT_SOLANA_MAX_SUPPLY || deployment.maxSupply || NFT_MAX_SUPPLY);
  const account = await withSolanaRpcFallback(async (rpcUrl) => {
    const connection = createSolanaConnection(Connection, rpcUrl, 'confirmed');
    return connection.getAccountInfo(new PublicKey(deployment.candyMachine), 'confirmed');
  }, {
    extraUrls: [deployment.rpcUrl],
    label: 'Solana NFT candy-machine supply read',
  });
  if (!account?.data || account.data.length < 112) {
    return {
      totalMinted: 0,
      maxSupply,
      remaining: maxSupply,
      source: 'missing_account',
    };
  }

  const totalMinted = Number(account.data.readBigUInt64LE(104));
  return {
    totalMinted,
    maxSupply,
    remaining: Math.max(0, maxSupply - totalMinted),
    source: 'rpc',
  };
}

router.get('/nft/mint/config', async (req, res) => {
  const solanaDeployment = readJsonIfExists(path.join(NFT_ROOT, 'deployments', 'solana-mainnet.json')) || {};
  const baseConfig = baseNftConfig();
  const solanaMaxSupply = Number(process.env.NFT_SOLANA_MAX_SUPPLY || solanaDeployment.maxSupply || NFT_MAX_SUPPLY);
  let baseSupply = fallbackNftSupply();
  let solanaSupply = fallbackNftSupply();
  try {
    baseSupply = await readBaseNftSupply(baseConfig);
  } catch (err) {
    console.warn('[NFT] failed to read Base supply', err?.message || err);
    baseSupply = cachedNftChainSupply('base', NFT_MAX_SUPPLY, 'cached_fallback') || baseSupply;
  }
  try {
    solanaSupply = await readSolanaNftSupply(solanaDeployment);
  } catch (err) {
    console.warn('[NFT] failed to read Solana supply', err?.message || err);
    const solanaMinted = Number(solanaDeployment.totalMinted ?? solanaDeployment.minted ?? 0);
    solanaSupply = cachedNftChainSupply('solana', solanaMaxSupply, 'cached_fallback') || {
      totalMinted: solanaMinted,
      maxSupply: solanaMaxSupply,
      remaining: solanaDeployment.remaining ?? Math.max(0, solanaMaxSupply - solanaMinted),
      source: 'fallback',
    };
  }
  const solanaSaleActive = process.env.NFT_SOLANA_SALE_ACTIVE
    ? process.env.NFT_SOLANA_SALE_ACTIVE !== '0'
    : !!solanaDeployment.saleActive;
  // Global supply state across all chains — UI displays this as "X / cap"
  // and disables mint buttons when remaining=0 even if a single chain has
  // headroom. Falls back gracefully on RPC errors.
  let globalSupply = { totalMinted: 0, cap: NFT_GLOBAL_SUPPLY_CAP, remaining: NFT_GLOBAL_SUPPLY_CAP, perChain: {} };
  try {
    const s = await readGlobalNftSupply();
    globalSupply = {
      totalMinted: s.total,
      cap: s.cap || NFT_GLOBAL_SUPPLY_CAP,
      remaining: Math.max(0, (s.cap || NFT_GLOBAL_SUPPLY_CAP) - s.total),
      perChain: s.perChain,
      source: s.source,
      cachedAt: nftSupplyIso(s.fetchedAt),
      syncedAt: nftSupplyIso(s.syncedAt),
      liveChains: s.liveChains || [],
      fallbackChains: s.fallbackChains || [],
      sourceByChain: s.sourceByChain || {},
    };
    if (finiteNftSupplyCount(baseSupply?.totalMinted) == null) {
      baseSupply = cachedNftChainSupply('base', baseSupply?.maxSupply || NFT_MAX_SUPPLY, 'global_cache_fallback') || baseSupply;
    }
    if (finiteNftSupplyCount(solanaSupply?.totalMinted) == null || solanaSupply?.source !== 'rpc') {
      solanaSupply = cachedNftChainSupply('solana', solanaSupply?.maxSupply || solanaMaxSupply, 'global_cache_fallback') || solanaSupply;
    }
  } catch (err) {
    console.warn('[NFT] failed to read global supply', err?.message || err);
  }

  res.set('Cache-Control', 'no-store');
  res.json({
    global: globalSupply,
    base: {
      ...baseConfig,
      supply: baseSupply,
    },
    solana: {
      collection: process.env.NFT_SOLANA_COLLECTION || solanaDeployment.collection || null,
      candyMachine: process.env.NFT_SOLANA_CANDY_MACHINE || solanaDeployment.candyMachine || null,
      candyGuard: process.env.NFT_SOLANA_CANDY_GUARD || solanaDeployment.candyGuard || null,
      saleActive: solanaSaleActive,
      startDate: solanaSaleActive ? null : (process.env.NFT_SOLANA_START_DATE || solanaDeployment.startDate || null),
      priceLamports: String(process.env.NFT_SOLANA_PRICE_LAMPORTS || solanaDeployment.priceLamports || '0'),
      groups: solanaDeployment.groups || solanaDeployment.paymentGroups || null,
      paymentGroups: solanaDeployment.paymentGroups || solanaDeployment.groups || null,
      supply: solanaSupply,
    },
  });
});

router.post('/nft/base/quote', async (req, res) => {
  try {
    const rate = checkNftQuoteRateLimit(req);
    if (!rate.ok) {
      res.set('Retry-After', String(rate.retryAfterSec));
      return res.status(429).json({ error: 'Too many NFT quote requests. Try again shortly.' });
    }

    const { getAddress, zeroAddress } = await import('viem');
    const config = baseNftConfig();
    if (!config.shop) return res.status(503).json({ error: 'Base shop is not deployed' });
    if (!config.saleActive && process.env.NFT_BASE_REQUIRE_ACTIVE_QUOTE === '1') {
      return res.status(423).json({ error: 'Base NFT sale is not active' });
    }

    const buyer = getAddress(String(req.body?.buyer || ''));
    const payment = String(req.body?.payment || '').toLowerCase();
    const quantity = BigInt(parsePositiveInteger(req.body?.quantity, 1, 10));
    // Global cross-chain supply gate — must pass before we sign anything.
    // The contract has its own per-chain cap (250 here) but we additionally
    // refuse to sign when total minted across Base/Solana/Arbitrum/Monad/
    // Aptos has hit NFT_GLOBAL_SUPPLY_CAP (default 333). Stops the case
    // where each chain individually has headroom but the global drop is
    // already exhausted.
    await assertGlobalSupplyAvailable(Number(quantity));
    const ttlSeconds = Math.max(30, Math.min(900, Number(process.env.NFT_BASE_QUOTE_TTL_SECONDS || 300)));
    const deadline = BigInt(Math.floor(Date.now() / 1000) + ttlSeconds);
    const nonce = BigInt(`0x${crypto.randomBytes(16).toString('hex')}`);

    let paymentToken = zeroAddress;
    let unitPrice = 0n;
    let decimals = 18;
    let usdPriceE6 = BigInt(config.baseUsdPriceE6);
    let priceSource = 'fixed';

    if (payment === 'eth' || payment === 'native') {
      paymentToken = zeroAddress;
      decimals = 18;
      const ethUsd = await fetchNftUsdPrice('eth');
      unitPrice = usdToNativeUnits(unitsToDecimalString(usdPriceE6, 6), ethUsd, decimals);
      priceSource = `ETH/USD ${ethUsd}`;
    } else if (payment === 'usdc') {
      paymentToken = getAddress(config.usdcToken);
      decimals = Number(process.env.NFT_BASE_USDC_DECIMALS || 6);
      unitPrice = usdPriceE6 * 10n ** BigInt(Math.max(0, decimals - 6));
    } else if (payment === 'cop' || payment === 'clash') {
      if (!config.clashReady) return res.status(409).json({ error: 'CoP is not live yet' });
      const clashUsd = await fetchClashUsdPrice(config);
      paymentToken = getAddress(config.clashToken);
      decimals = Number(process.env.NFT_BASE_CLASH_DECIMALS || 18);
      usdPriceE6 = BigInt(config.clashUsdPriceE6);
      unitPrice = usdToNativeUnits(unitsToDecimalString(usdPriceE6, 6), clashUsd.price, decimals);
      priceSource = `CoP/USD ${clashUsd.price} (${clashUsd.source})`;
    } else {
      return res.status(400).json({ error: 'Unsupported payment method' });
    }

    const account = await parseNftEvmAccount();
    const domain = {
      name: 'DemonKingBaseShop',
      version: '1',
      chainId: 8453,
      verifyingContract: getAddress(config.shop),
    };
    const types = {
      MintQuote: [
        { name: 'buyer', type: 'address' },
        { name: 'paymentToken', type: 'address' },
        { name: 'unitPrice', type: 'uint256' },
        { name: 'quantity', type: 'uint256' },
        { name: 'usdPriceE6', type: 'uint256' },
        { name: 'nonce', type: 'uint256' },
        { name: 'deadline', type: 'uint256' },
      ],
    };
    const message = { buyer, paymentToken, unitPrice, quantity, usdPriceE6, nonce, deadline };
    const signature = await account.signTypedData({
      domain,
      types,
      primaryType: 'MintQuote',
      message,
    });
    const total = unitPrice * quantity;

    res.set('Cache-Control', 'no-store');
    res.json({
      chainId: 8453,
      shop: getAddress(config.shop),
      payment,
      priceSource,
      decimals,
      quantity: quantity.toString(),
      unitPrice: unitPrice.toString(),
      unitPriceFormatted: unitsToDecimalString(unitPrice, decimals),
      total: total.toString(),
      totalFormatted: unitsToDecimalString(total, decimals),
      usdPriceE6: usdPriceE6.toString(),
      quote: {
        buyer,
        paymentToken,
        unitPrice: unitPrice.toString(),
        quantity: quantity.toString(),
        usdPriceE6: usdPriceE6.toString(),
        nonce: nonce.toString(),
        deadline: deadline.toString(),
      },
      signature,
    });
  } catch (err) {
    const message = err?.message || 'quote failed';
    const status = /address/i.test(message) || err?.status === 409 ? (err?.status || 400) : 500;
    res.status(status).json({ error: message.slice(0, 180) });
  }
});

// Per-chain NFT shop deployment lookup. Returns null until you deploy
// DemonKingBaseShopV2 to that chain via `npm run deploy:evm:shop --
// --chain=arbitrum`. The shop file format matches base-shop-v2-mainnet.json.
function evmNftShopDeployment(chainKey) {
  const file = path.join(NFT_ROOT, 'deployments', `${chainKey}-shop-v2-mainnet.json`);
  return readJsonIfExists(file) || null;
}

// Generic EVM NFT quote for any chain where we've deployed
// DemonKingBase V3 proxy + DemonKingBaseShopV2 (Arbitrum, Monad — Base stays on
// its dedicated route for back-compat with the client). The flow + EIP-712
// signing payload are identical to Base's; only the chainId, verifying
// contract, and USDC mint differ per chain.
router.post('/nft/evm/quote', async (req, res) => {
  try {
    const rate = checkNftQuoteRateLimit(req);
    if (!rate.ok) {
      res.set('Retry-After', String(rate.retryAfterSec));
      return res.status(429).json({ error: 'Too many NFT quote requests. Try again shortly.' });
    }

    const chainKey = String(req.body?.chain || '').toLowerCase();
    const evmConfig = GAME_SHOP_EVM_CHAINS[chainKey];
    if (!evmConfig) return res.status(400).json({ error: 'Unsupported EVM NFT chain.' });

    const shopDeployment = evmNftShopDeployment(chainKey);
    if (!shopDeployment?.shop) {
      return res.status(503).json({ error: `${chainKey} NFT shop is not deployed yet` });
    }
    if (!shopDeployment.saleActive && process.env.NFT_EVM_REQUIRE_ACTIVE_QUOTE === '1') {
      return res.status(423).json({ error: `${chainKey} NFT sale is not active` });
    }

    const { getAddress, zeroAddress } = await import('viem');
    const buyer = getAddress(String(req.body?.buyer || ''));
    const payment = String(req.body?.payment || '').toLowerCase();
    const quantity = BigInt(parsePositiveInteger(req.body?.quantity, 1, 10));
    await assertGlobalSupplyAvailable(Number(quantity));

    const ttlSeconds = Math.max(30, Math.min(900, Number(process.env.NFT_EVM_QUOTE_TTL_SECONDS || 300)));
    const deadline = BigInt(Math.floor(Date.now() / 1000) + ttlSeconds);
    const nonce = BigInt(`0x${crypto.randomBytes(16).toString('hex')}`);

    // Per-chain native + stable. Native uses the chain's oracle asset
    // (eth/mon), USDC is the shop's stored stable. CoP is intentionally
    // omitted here — only Base ships CoP for now.
    const usdcDec = shopDeployment.usdcToken
      ? Number(process.env[`NFT_${chainKey.toUpperCase()}_USDC_DECIMALS`] || evmConfig.payments?.usdc?.decimals || 6)
      : 6;
    const baseUsdPriceE6 = BigInt(shopDeployment.baseUsdPriceE6 || '8900000');

    let paymentToken = zeroAddress;
    let unitPrice = 0n;
    let decimals = 18;
    let usdPriceE6 = baseUsdPriceE6;
    let priceSource = 'fixed';

    const nativeSpec = evmConfig.payments?.[evmConfig.nativeSymbol.toLowerCase()];
    if (payment === 'native' || payment === evmConfig.nativeSymbol.toLowerCase()) {
      paymentToken = zeroAddress;
      decimals = nativeSpec?.decimals ?? evmConfig.nativeDecimals ?? 18;
      const assetUsd = await fetchNftUsdPrice(nativeSpec?.oracleAsset || 'eth');
      unitPrice = usdToNativeUnits(unitsToDecimalString(usdPriceE6, 6), assetUsd, decimals);
      priceSource = `${evmConfig.nativeSymbol}/USD ${assetUsd}`;
    } else if (payment === 'usdc') {
      if (!shopDeployment.usdcToken || /^0x0{40}$/i.test(shopDeployment.usdcToken)) {
        return res.status(400).json({ error: 'USDC payment not configured for this chain' });
      }
      paymentToken = getAddress(shopDeployment.usdcToken);
      decimals = usdcDec;
      // Same trick as Base USDC: scale to token decimals from the
      // shop-stored 6-dec USD price. For 6-dec USDC this is identity.
      unitPrice = usdPriceE6 * 10n ** BigInt(Math.max(0, decimals - 6));
      priceSource = 'USDC 1:1 USD';
    } else {
      return res.status(400).json({ error: `Unsupported payment for ${chainKey}: ${payment}` });
    }

    const account = await parseNftEvmAccount();
    const domain = {
      name: 'DemonKingBaseShop',
      version: '1',
      chainId: evmConfig.chainId,
      verifyingContract: getAddress(shopDeployment.shop || shopDeployment.proxy),
    };
    const types = {
      MintQuote: [
        { name: 'buyer', type: 'address' },
        { name: 'paymentToken', type: 'address' },
        { name: 'unitPrice', type: 'uint256' },
        { name: 'quantity', type: 'uint256' },
        { name: 'usdPriceE6', type: 'uint256' },
        { name: 'nonce', type: 'uint256' },
        { name: 'deadline', type: 'uint256' },
      ],
    };
    const message = { buyer, paymentToken, unitPrice, quantity, usdPriceE6, nonce, deadline };
    const signature = await account.signTypedData({
      domain,
      types,
      primaryType: 'MintQuote',
      message,
    });
    const total = unitPrice * quantity;

    res.set('Cache-Control', 'no-store');
    res.json({
      chain: chainKey,
      chainId: evmConfig.chainId,
      shop: getAddress(shopDeployment.shop || shopDeployment.proxy),
      payment,
      priceSource,
      decimals,
      quantity: quantity.toString(),
      unitPrice: unitPrice.toString(),
      unitPriceFormatted: unitsToDecimalString(unitPrice, decimals),
      total: total.toString(),
      totalFormatted: unitsToDecimalString(total, decimals),
      usdPriceE6: usdPriceE6.toString(),
      quote: {
        buyer,
        paymentToken,
        unitPrice: unitPrice.toString(),
        quantity: quantity.toString(),
        usdPriceE6: usdPriceE6.toString(),
        nonce: nonce.toString(),
        deadline: deadline.toString(),
      },
      signature,
    });
  } catch (err) {
    const message = err?.message || 'quote failed';
    const status = err?.status === 409 ? 409 : /address|chain/i.test(message) ? 400 : 500;
    res.status(status).json({ error: message.slice(0, 180) });
  }
});

// ────────────────────────────────────────────────────────────────────
// POST /nft/aptos/quote — sign an ed25519 MintQuote that
// clash_nft::mint_with_quote(_payment) verifies on-chain.
//
// Aptos supports USDC and native APT. USDC keeps the original entrypoint for
// backwards compatibility; APT uses the payment-aware entrypoint added in the
// v3.3 module upgrade.
// ────────────────────────────────────────────────────────────────────
router.get('/nft/:collectionSlug/mint/config', async (req, res) => {
  try {
    const collection = nftCollectionConfig(req.params.collectionSlug);
    if (!collection) return res.status(404).json({ error: 'collection not found' });
    const supply = await readCollectionGlobalSupply(collection).catch(() => null);
    const evm = {};
    for (const chainKey of ['base', 'arbitrum', 'monad', 'ink']) {
      const dep = nftCollectionDeployment(collection.slug, chainKey);
      const shop = nftCollectionShopDeployment(collection, chainKey);
      evm[chainKey] = {
        chainId: GAME_SHOP_EVM_CHAINS[chainKey]?.chainId || null,
        nft: dep.proxy || dep.contract || null,
        shop: shop.shop || shop.proxy || null,
        saleActive: !!shop.saleActive,
        usdcToken: shop.usdcToken || null,
        clashToken: shop.clashToken || null,
        clashReady: !!shop.clashToken && !/^0x0{40}$/i.test(String(shop.clashToken)),
        baseUsdPriceE6: String(shop.baseUsdPriceE6 || '5500000'),
        clashUsdPriceE6: String(shop.clashUsdPriceE6 || '4000000'),
        supply: supply ? {
          totalMinted: Number(supply.perChain?.[chainKey] || 0),
          maxSupply: collection.maxSupply,
          remaining: Math.max(0, collection.maxSupply - Number(supply.perChain?.[chainKey] || 0)),
        } : null,
      };
    }
    const aptos = nftCollectionDeployment(collection.slug, 'aptos');
    const solana = nftCollectionDeployment(collection.slug, 'solana');
    res.set('Cache-Control', 'no-store');
    return res.json({
      collection: {
        slug: collection.slug,
        name: collection.name,
        symbol: collection.symbol,
        maxSupply: collection.maxSupply,
      },
      metadata: {
        image: `${nftPublicBase(req)}/api/nft/${collection.slug}/image/1`,
        baseTokenUri: `${nftPublicBase(req)}/api/nft/${collection.slug}/base/`,
        solanaCollectionUri: `${nftPublicBase(req)}/api/nft/${collection.slug}/solana/collection`,
        solanaHiddenUri: `${nftPublicBase(req)}/api/nft/${collection.slug}/solana/hidden`,
      },
      global: supply,
      evm,
      aptos: {
        module: aptos.module || null,
        collection: aptos.collection || null,
        resourceAccount: aptos.resourceAccount || null,
        saleActive: !!aptos.saleActive,
        usdcMetadata: aptos.usdcMetadata || null,
        aptMetadata: '0x000000000000000000000000000000000000000000000000000000000000000a',
        mintUsdPriceE6: String(aptos.mintUsdPriceE6 || '5500000'),
        supply: supply ? {
          totalMinted: Number(supply.perChain?.aptos || 0),
          maxSupply: collection.maxSupply,
          remaining: Math.max(0, collection.maxSupply - Number(supply.perChain?.aptos || 0)),
        } : null,
      },
      solana: {
        collection: solana.collection || null,
        candyMachine: solana.candyMachine || null,
        candyGuard: solana.candyGuard || null,
        saleActive: !!solana.saleActive,
        paymentGroups: solana.paymentGroups || solana.groups || null,
        priceLamports: solana.priceLamports || null,
        supply: supply ? {
          totalMinted: Number(supply.perChain?.solana || 0),
          maxSupply: collection.maxSupply,
          remaining: Math.max(0, collection.maxSupply - Number(supply.perChain?.solana || 0)),
        } : null,
      },
    });
  } catch (err) {
    return res.status(500).json({ error: (err?.message || 'config failed').slice(0, 180) });
  }
});

async function handleAptosNftQuote(req, res, collection = null) {
  try {
    const rate = checkNftQuoteRateLimit(req);
    if (!rate.ok) {
      res.set('Retry-After', String(rate.retryAfterSec));
      return res.status(429).json({ error: 'Too many NFT quote requests. Try again shortly.' });
    }

    const aptosDeploy = collection
      ? nftCollectionDeployment(collection.slug, 'aptos')
      : readJsonIfExists(path.join(NFT_ROOT, 'deployments', 'aptos-mainnet.json'));
    const label = collection?.name || 'Aptos NFT';
    if (!aptosDeploy?.module) {
      return res.status(503).json({ error: `${label} Aptos module not deployed` });
    }
    const requireActive = collection
      ? (process.env[`NFT_${collection.envKey}_APTOS_REQUIRE_ACTIVE_QUOTE`] === '1'
        || process.env[`NFT_${collection.envKey}_REQUIRE_ACTIVE_QUOTE`] === '1'
        || process.env.NFT_COLLECTION_REQUIRE_ACTIVE_QUOTE === '1')
      : process.env.NFT_APTOS_REQUIRE_ACTIVE_QUOTE === '1';
    if (!aptosDeploy.saleActive && requireActive) {
      return res.status(423).json({ error: `${label} Aptos sale is not active` });
    }
    const { signAptosMintQuote, signAptosMintQuotePayment } = require('./bridge_helpers');

    const buyerRaw = String(req.body?.buyer || '').trim();
    if (!/^0x[0-9a-fA-F]{1,64}$/.test(buyerRaw)) {
      return res.status(400).json({ error: 'buyer must be a 0x-prefixed Aptos address' });
    }
    const buyer = '0x' + buyerRaw.replace(/^0x/, '').padStart(64, '0').toLowerCase();
    const quantity = BigInt(parsePositiveInteger(req.body?.quantity, 1, 10));
    const payment = String(req.body?.payment || 'usdc').toLowerCase();
    if (payment !== 'usdc' && payment !== 'apt') {
      return res.status(400).json({ error: 'Unsupported Aptos NFT payment (use usdc or apt)' });
    }

    if (collection) {
      await assertCollectionGlobalSupplyAvailable(collection, Number(quantity));
    } else {
      await assertGlobalSupplyAvailable(Number(quantity));
    }

    const usdPriceE6 = BigInt(aptosDeploy.mintUsdPriceE6 || (collection ? '5500000' : '8900000'));
    const usdAmount = unitsToDecimalString(usdPriceE6 * quantity, 6);
    const aptMetadata = '0x000000000000000000000000000000000000000000000000000000000000000a';
    let decimals;
    let paymentMetadata;
    let unitPrice;
    let totalAmount;
    let priceSource;
    if (payment === 'usdc') {
      if (!aptosDeploy.usdcMetadata) {
        return res.status(503).json({ error: 'Aptos USDC metadata is not configured' });
      }
      decimals = 6;
      paymentMetadata = aptosDeploy.usdcMetadata;
      unitPrice = usdPriceE6;
      totalAmount = unitPrice * quantity;
      priceSource = 'USDC 1:1 USD';
    } else {
      decimals = 8;
      paymentMetadata = aptMetadata;
      const aptUsd = await fetchNftUsdPrice('apt').catch(() => null);
      if (!aptUsd) return res.status(503).json({ error: 'APT price unavailable; try USDC' });
      totalAmount = usdToNativeUnits(usdAmount, aptUsd, decimals);
      unitPrice = totalAmount / quantity;
      priceSource = `APT/USD ${aptUsd}`;
    }

    const ttlSeconds = Math.max(60, Math.min(900, Number(process.env.NFT_APTOS_QUOTE_TTL_SECONDS || 300)));
    const deadline = BigInt(Math.floor(Date.now() / 1000) + ttlSeconds);
    const nonce = '0x' + crypto.randomBytes(16).toString('hex');
    const accountHash = '0x';

    const signature = payment === 'usdc'
      ? await signAptosMintQuote({ buyerAddress: buyer, usdcAmount: totalAmount, quantity, nonce, deadline, accountHash })
      : await signAptosMintQuotePayment({ buyerAddress: buyer, paymentMetadata, paymentAmount: totalAmount, quantity, nonce, deadline, accountHash });

    const functionId = payment === 'usdc'
      ? `${aptosDeploy.module}::mint_with_quote`
      : `${aptosDeploy.module}::mint_with_quote_payment`;
    const functionArguments = payment === 'usdc'
      ? [totalAmount.toString(), quantity.toString(), nonce, deadline.toString(), accountHash, signature]
      : [paymentMetadata, totalAmount.toString(), quantity.toString(), nonce, deadline.toString(), accountHash, signature];

    res.set('Cache-Control', 'no-store');
    return res.json({
      collection: collection?.slug || 'demonking',
      chain: 'aptos',
      chainId: 1,
      module: aptosDeploy.module,
      shop: aptosDeploy.module,
      usdcMetadata: aptosDeploy.usdcMetadata,
      aptMetadata,
      payment,
      paymentMetadata,
      decimals,
      priceSource,
      quantity: quantity.toString(),
      unitPrice: unitPrice.toString(),
      unitPriceFormatted: unitsToDecimalString(unitPrice, decimals),
      total: totalAmount.toString(),
      totalFormatted: unitsToDecimalString(totalAmount, decimals),
      usdPriceE6: usdPriceE6.toString(),
      callData: { functionId, typeArguments: [], functionArguments },
      signature,
      nonce,
      deadline: deadline.toString(),
    });
  } catch (err) {
    const message = err?.message || 'aptos quote failed';
    const status = err?.status === 409 ? 409 : /address|chain|collection/i.test(message) ? 400 : 500;
    return res.status(status).json({ error: message.slice(0, 180) });
  }
}

router.post('/nft/:collectionSlug/:chain/quote', async (req, res) => {
  try {
    const rate = checkNftQuoteRateLimit(req);
    if (!rate.ok) {
      res.set('Retry-After', String(rate.retryAfterSec));
      return res.status(429).json({ error: 'Too many NFT quote requests. Try again shortly.' });
    }

    const collection = nftCollectionConfig(req.params.collectionSlug);
    const chainKey = String(req.params.chain || '').toLowerCase();
    if (collection && chainKey === 'aptos') {
      return handleAptosNftQuote(req, res, collection);
    }
    const evmConfig = GAME_SHOP_EVM_CHAINS[chainKey];
    if (!collection || !evmConfig) return res.status(404).json({ error: 'collection or chain not found' });

    const shopDeployment = nftCollectionShopDeployment(collection, chainKey);
    const shopAddress = shopDeployment.shop || shopDeployment.proxy;
    if (!shopAddress) return res.status(503).json({ error: `${collection.name} ${chainKey} shop is not deployed yet` });
    const requireActive = process.env[`NFT_${collection.envKey}_REQUIRE_ACTIVE_QUOTE`] === '1'
      || process.env.NFT_COLLECTION_REQUIRE_ACTIVE_QUOTE === '1';
    if (!shopDeployment.saleActive && requireActive) {
      return res.status(423).json({ error: `${collection.name} ${chainKey} sale is not active` });
    }

    const { getAddress, zeroAddress } = await import('viem');
    const buyer = getAddress(String(req.body?.buyer || ''));
    const payment = String(req.body?.payment || '').toLowerCase();
    const quantity = BigInt(parsePositiveInteger(req.body?.quantity, 1, 10));
    await assertCollectionGlobalSupplyAvailable(collection, Number(quantity));

    const ttlSeconds = Math.max(30, Math.min(900, Number(process.env.NFT_COLLECTION_QUOTE_TTL_SECONDS || process.env.NFT_EVM_QUOTE_TTL_SECONDS || 300)));
    const deadline = BigInt(Math.floor(Date.now() / 1000) + ttlSeconds);
    const nonce = BigInt(`0x${crypto.randomBytes(16).toString('hex')}`);

    const baseUsdPriceE6 = BigInt(shopDeployment.baseUsdPriceE6 || '5500000');
    const clashUsdPriceE6 = BigInt(shopDeployment.clashUsdPriceE6 || '4000000');
    let paymentToken = zeroAddress;
    let unitPrice = 0n;
    let decimals = 18;
    let usdPriceE6 = baseUsdPriceE6;
    let priceSource = 'fixed';

    const nativeSpec = evmConfig.payments?.[evmConfig.nativeSymbol.toLowerCase()];
    if (payment === 'native' || payment === evmConfig.nativeSymbol.toLowerCase()) {
      paymentToken = zeroAddress;
      decimals = nativeSpec?.decimals ?? evmConfig.nativeDecimals ?? 18;
      const assetUsd = await fetchNftUsdPrice(nativeSpec?.oracleAsset || 'eth');
      unitPrice = usdToNativeUnits(unitsToDecimalString(usdPriceE6, 6), assetUsd, decimals);
      priceSource = `${evmConfig.nativeSymbol}/USD ${assetUsd}`;
    } else if (payment === 'usdc') {
      if (!shopDeployment.usdcToken || /^0x0{40}$/i.test(shopDeployment.usdcToken)) {
        return res.status(400).json({ error: 'USDC payment not configured for this collection/chain' });
      }
      paymentToken = getAddress(shopDeployment.usdcToken);
      decimals = Number(process.env[`NFT_${collection.envKey}_${chainKey.toUpperCase()}_USDC_DECIMALS`]
        || process.env[`NFT_${chainKey.toUpperCase()}_USDC_DECIMALS`]
        || evmConfig.payments?.usdc?.decimals
        || 6);
      unitPrice = usdPriceE6 * 10n ** BigInt(Math.max(0, decimals - 6));
      priceSource = 'USDC 1:1 USD';
    } else if (payment === 'cop' || payment === 'clash') {
      if (!shopDeployment.clashToken || /^0x0{40}$/i.test(shopDeployment.clashToken)) {
        return res.status(409).json({ error: 'CoP payment not configured for this collection/chain' });
      }
      const clashUsd = await fetchClashUsdPrice({ clashToken: shopDeployment.clashToken });
      paymentToken = getAddress(shopDeployment.clashToken);
      decimals = Number(process.env[`NFT_${collection.envKey}_${chainKey.toUpperCase()}_CLASH_DECIMALS`]
        || process.env[`NFT_${chainKey.toUpperCase()}_CLASH_DECIMALS`]
        || process.env.NFT_BASE_CLASH_DECIMALS
        || 18);
      usdPriceE6 = clashUsdPriceE6;
      unitPrice = usdToNativeUnits(unitsToDecimalString(usdPriceE6, 6), clashUsd.price, decimals);
      priceSource = `CoP/USD ${clashUsd.price} (${clashUsd.source})`;
    } else {
      return res.status(400).json({ error: `Unsupported payment for ${collection.name} ${chainKey}: ${payment}` });
    }

    const account = await parseNftEvmAccount();
    const domain = {
      name: shopDeployment.eip712Name || `ClashCollectionShop:${collection.slug}:${chainKey}`,
      version: shopDeployment.eip712Version || '1',
      chainId: evmConfig.chainId,
      verifyingContract: getAddress(shopAddress),
    };
    const types = {
      MintQuote: [
        { name: 'buyer', type: 'address' },
        { name: 'paymentToken', type: 'address' },
        { name: 'unitPrice', type: 'uint256' },
        { name: 'quantity', type: 'uint256' },
        { name: 'usdPriceE6', type: 'uint256' },
        { name: 'nonce', type: 'uint256' },
        { name: 'deadline', type: 'uint256' },
      ],
    };
    const message = { buyer, paymentToken, unitPrice, quantity, usdPriceE6, nonce, deadline };
    const signature = await account.signTypedData({ domain, types, primaryType: 'MintQuote', message });
    const total = unitPrice * quantity;

    res.set('Cache-Control', 'no-store');
    return res.json({
      collection: collection.slug,
      chain: chainKey,
      chainId: evmConfig.chainId,
      shop: getAddress(shopAddress),
      payment,
      priceSource,
      decimals,
      quantity: quantity.toString(),
      unitPrice: unitPrice.toString(),
      unitPriceFormatted: unitsToDecimalString(unitPrice, decimals),
      total: total.toString(),
      totalFormatted: unitsToDecimalString(total, decimals),
      usdPriceE6: usdPriceE6.toString(),
      quote: {
        buyer,
        paymentToken,
        unitPrice: unitPrice.toString(),
        quantity: quantity.toString(),
        usdPriceE6: usdPriceE6.toString(),
        nonce: nonce.toString(),
        deadline: deadline.toString(),
      },
      signature,
    });
  } catch (err) {
    const message = err?.message || 'quote failed';
    const status = err?.status === 409 ? 409 : /address|chain|collection/i.test(message) ? 400 : 500;
    return res.status(status).json({ error: message.slice(0, 180) });
  }
});

router.post('/nft/aptos/quote', async (req, res) => {
  try {
    const rate = checkNftQuoteRateLimit(req);
    if (!rate.ok) {
      res.set('Retry-After', String(rate.retryAfterSec));
      return res.status(429).json({ error: 'Too many NFT quote requests. Try again shortly.' });
    }

    const aptosDeploy = readJsonIfExists(path.join(NFT_ROOT, 'deployments', 'aptos-mainnet.json'));
    if (!aptosDeploy?.module) {
      return res.status(503).json({ error: 'Aptos NFT module not deployed' });
    }
    if (!aptosDeploy.saleActive && process.env.NFT_APTOS_REQUIRE_ACTIVE_QUOTE === '1') {
      return res.status(423).json({ error: 'Aptos NFT sale is not active' });
    }
    const { signAptosMintQuote, signAptosMintQuotePayment } = require('./bridge_helpers');

    const buyerRaw = String(req.body?.buyer || '').trim();
    if (!/^0x[0-9a-fA-F]{1,64}$/.test(buyerRaw)) {
      return res.status(400).json({ error: 'buyer must be a 0x-prefixed Aptos address' });
    }
    const buyer = '0x' + buyerRaw.replace(/^0x/, '').padStart(64, '0').toLowerCase();
    const quantity = BigInt(parsePositiveInteger(req.body?.quantity, 1, 10));
    const payment = String(req.body?.payment || 'usdc').toLowerCase();
    if (payment !== 'usdc' && payment !== 'apt') {
      return res.status(400).json({ error: 'Unsupported Aptos NFT payment (use usdc or apt)' });
    }

    // Global cross-chain supply gate (same one used by Base/Solana/EVM).
    await assertGlobalSupplyAvailable(Number(quantity));

    const usdPriceE6 = BigInt(aptosDeploy.mintUsdPriceE6 || '8900000');
    const usdAmount = unitsToDecimalString(usdPriceE6 * quantity, 6);
    const aptMetadata = '0x000000000000000000000000000000000000000000000000000000000000000a';
    let decimals, paymentMetadata, unitPrice, totalAmount, priceSource;
    if (payment === 'usdc') {
      if (!aptosDeploy.usdcMetadata) {
        return res.status(503).json({ error: 'Aptos USDC metadata is not configured' });
      }
      // Aptos USDC has 6 decimals (same as USD price scale), so unitPrice == usdPriceE6.
      decimals = 6;
      paymentMetadata = aptosDeploy.usdcMetadata;
      unitPrice = usdPriceE6;
      totalAmount = unitPrice * quantity;
      priceSource = 'USDC 1:1 USD';
    } else {
      decimals = 8;
      paymentMetadata = aptMetadata;
      const aptUsd = await fetchNftUsdPrice('apt').catch(() => null);
      if (!aptUsd) return res.status(503).json({ error: 'APT price unavailable; try USDC' });
      totalAmount = usdToNativeUnits(usdAmount, aptUsd, decimals);
      unitPrice = totalAmount / quantity;
      priceSource = `APT/USD ${aptUsd}`;
    }

    const ttlSeconds = Math.max(60, Math.min(900, Number(process.env.NFT_APTOS_QUOTE_TTL_SECONDS || 300)));
    const deadline = BigInt(Math.floor(Date.now() / 1000) + ttlSeconds);

    // Move's mint_with_quote takes nonce as vector<u8>. 16 random bytes is plenty.
    const nonce = '0x' + crypto.randomBytes(16).toString('hex');
    // account_hash is appended to the signed payload but never validated
    // on-chain — we leave it empty so any submitter (buyer's wallet) can
    // include the receipt unchanged.
    const accountHash = '0x';

    const signature = payment === 'usdc'
      ? await signAptosMintQuote({
          buyerAddress: buyer,
          usdcAmount: totalAmount,
          quantity,
          nonce,
          deadline,
          accountHash,
        })
      : await signAptosMintQuotePayment({
          buyerAddress: buyer,
          paymentMetadata,
          paymentAmount: totalAmount,
          quantity,
          nonce,
          deadline,
          accountHash,
        });

    const functionId = payment === 'usdc'
      ? `${aptosDeploy.module}::mint_with_quote`
      : `${aptosDeploy.module}::mint_with_quote_payment`;
    const functionArguments = payment === 'usdc'
      ? [
          totalAmount.toString(),
          quantity.toString(),
          nonce,
          deadline.toString(),
          accountHash,
          signature,
        ]
      : [
          paymentMetadata,
          totalAmount.toString(),
          quantity.toString(),
          nonce,
          deadline.toString(),
          accountHash,
          signature,
        ];

    res.set('Cache-Control', 'no-store');
    res.json({
      chain: 'aptos',
      chainId: 1,
      module: aptosDeploy.module,
      shop: aptosDeploy.module,                  // alias for UI consistency with EVM response
      usdcMetadata: aptosDeploy.usdcMetadata,
      aptMetadata,
      payment,
      paymentMetadata,
      decimals,
      priceSource,
      quantity: quantity.toString(),
      unitPrice: unitPrice.toString(),
      unitPriceFormatted: unitsToDecimalString(unitPrice, decimals),
      total: totalAmount.toString(),
      totalFormatted: unitsToDecimalString(totalAmount, decimals),
      usdPriceE6: usdPriceE6.toString(),
      callData: {
        functionId,
        typeArguments: [],
        functionArguments,
      },
      signature,
      nonce,
      deadline: deadline.toString(),
    });
  } catch (err) {
    const message = err?.message || 'aptos quote failed';
    const status = err?.status === 409 ? 409 : /address|chain/i.test(message) ? 400 : 500;
    res.status(status).json({ error: message.slice(0, 180) });
  }
});

router.get('/nft/image', (req, res) => {
  // Default L1 image when no level is specified (back-compat).
  const lvl1 = NFT_LEVEL_IMAGE_PATHS[1];
  if (fs.existsSync(lvl1)) {
    res.set('Cache-Control', process.env.NFT_IMAGE_CACHE || 'public, max-age=300');
    return res.sendFile(lvl1);
  }
  if (process.env.NFT_IMAGE_URL) return res.redirect(302, process.env.NFT_IMAGE_URL);
  if (!fs.existsSync(NFT_IMAGE_PATH)) return res.status(404).json({ error: 'image missing' });
  res.set('Cache-Control', process.env.NFT_IMAGE_CACHE || 'public, max-age=300');
  res.sendFile(NFT_IMAGE_PATH);
});

// Level-specific images: /api/nft/image/1, /api/nft/image/2, /api/nft/image/3.
router.get('/nft/image/:level', (req, res) => {
  const lvl = Number(req.params.level);
  if (![1, 2, 3].includes(lvl)) return res.status(400).json({ error: 'level must be 1, 2, or 3' });
  const filePath = NFT_LEVEL_IMAGE_PATHS[lvl];
  if (!fs.existsSync(filePath)) return res.status(404).json({ error: `level ${lvl} image missing` });
  res.set('Cache-Control', process.env.NFT_IMAGE_CACHE || 'public, max-age=300');
  res.sendFile(filePath);
});

router.get('/nft/base/contract', (req, res) => {
  const name = process.env.NFT_NAME || 'Demon King';
  res.set('Cache-Control', process.env.NFT_METADATA_CACHE || 'public, max-age=60');
  res.json({
    name,
    description: process.env.NFT_DESCRIPTION || 'Demon King from Clash of Perps.',
    image: nftImageUrl(req),
    external_link: process.env.NFT_EXTERNAL_URL || `${nftPublicBase(req)}/`,
    seller_fee_basis_points: Number(process.env.NFT_SELLER_FEE_BASIS_POINTS || 0),
    fee_recipient: process.env.NFT_FEE_RECIPIENT || '',
  });
});

router.get('/nft/base/:tokenId', async (req, res) => { await sendNftMetadata(req, res, 'Base', req.params.tokenId); });
router.get('/nft/base/:tokenId.json', async (req, res) => { await sendNftMetadata(req, res, 'Base', req.params.tokenId); });
router.get('/nft/arbitrum/:tokenId', async (req, res) => { await sendNftMetadata(req, res, 'Arbitrum', req.params.tokenId); });
router.get('/nft/arbitrum/:tokenId.json', async (req, res) => { await sendNftMetadata(req, res, 'Arbitrum', req.params.tokenId); });
router.get('/nft/monad/:tokenId', async (req, res) => { await sendNftMetadata(req, res, 'Monad', req.params.tokenId); });
router.get('/nft/monad/:tokenId.json', async (req, res) => { await sendNftMetadata(req, res, 'Monad', req.params.tokenId); });
router.get('/nft/ink/:tokenId', async (req, res) => { await sendNftMetadata(req, res, 'Ink', req.params.tokenId); });
router.get('/nft/ink/:tokenId.json', async (req, res) => { await sendNftMetadata(req, res, 'Ink', req.params.tokenId); });
router.get('/nft/aptos/collection', sendAptosCollectionMetadata);
router.get('/nft/aptos/collection.json', sendAptosCollectionMetadata);
router.get('/nft/aptos/:tokenId', async (req, res) => { await sendAptosNftMetadata(req, res, req.params.tokenId); });
router.get('/nft/aptos/:tokenId.json', async (req, res) => { await sendAptosNftMetadata(req, res, req.params.tokenId); });
router.get('/nft/solana/collection', (req, res) => {
  const name = process.env.NFT_NAME || 'Demon King';
  res.set('Cache-Control', process.env.NFT_METADATA_CACHE || 'public, max-age=60');
  res.json(attachRoyaltyMetadata({
    name,
    symbol: process.env.NFT_SYMBOL || 'DMNK',
    description: process.env.NFT_DESCRIPTION || 'Demon King from Clash of Perps.',
    image: nftImageUrl(req),
    external_url: process.env.NFT_EXTERNAL_URL || `${nftPublicBase(req)}/`,
    attributes: [
      { trait_type: 'Game', value: 'Clash of Perps' },
      { trait_type: 'Max Supply', value: NFT_METADATA_SUPPLY_LABEL },
    ],
    properties: {
      category: 'image',
      files: [{ uri: nftImageUrl(req), type: 'image/png' }],
    },
  }, 'Solana'));
});
router.get('/nft/solana/hidden', (req, res) => {
  res.set('Cache-Control', process.env.NFT_METADATA_CACHE || 'public, max-age=60');
  res.json(nftHiddenMetadata(req, 'Solana'));
});
router.get('/nft/solana/hidden.json', (req, res) => {
  res.set('Cache-Control', process.env.NFT_METADATA_CACHE || 'public, max-age=60');
  res.json(nftHiddenMetadata(req, 'Solana'));
});
router.get('/nft/solana/bridged', sendSolanaBridgedCoreMetadata);
router.get('/nft/solana/bridged.json', sendSolanaBridgedCoreMetadata);
router.get('/nft/solana/token2022/:mint', sendSolanaToken2022Metadata);
router.get('/nft/solana/token2022/:mint.json', sendSolanaToken2022Metadata);
router.get('/nft/solana/:tokenId', (req, res) => sendNftMetadata(req, res, 'Solana', req.params.tokenId));
router.get('/nft/solana/:tokenId.json', (req, res) => sendNftMetadata(req, res, 'Solana', req.params.tokenId));

router.get('/nft/:collectionSlug/image', (req, res) => sendNftCollectionImage(req, res, 1));
router.get('/nft/:collectionSlug/image/:level', (req, res) => sendNftCollectionImage(req, res, req.params.level));
router.get('/nft/:collectionSlug/:chain/contract', sendNftCollectionContractMetadata);
router.get('/nft/:collectionSlug/:chain/contract.json', sendNftCollectionContractMetadata);
router.get('/nft/:collectionSlug/:chain/collection', sendNftCollectionCollectionMetadata);
router.get('/nft/:collectionSlug/:chain/collection.json', sendNftCollectionCollectionMetadata);
router.get('/nft/:collectionSlug/:chain/hidden', sendNftCollectionCollectionMetadata);
router.get('/nft/:collectionSlug/:chain/hidden.json', sendNftCollectionCollectionMetadata);
router.get('/nft/:collectionSlug/:chain/bridged', (req, res) => sendNftCollectionTokenMetadata(req, res, req.query.asset || req.query.id || '1'));
router.get('/nft/:collectionSlug/:chain/bridged.json', (req, res) => sendNftCollectionTokenMetadata(req, res, req.query.asset || req.query.id || '1'));
router.get('/nft/:collectionSlug/:chain/:tokenId', (req, res, next) => {
  if (String(req.params.collectionSlug || '').toLowerCase() === 'owned') return next();
  return sendNftCollectionTokenMetadata(req, res, req.params.tokenId);
});
router.get('/nft/:collectionSlug/:chain/:tokenId.json', (req, res, next) => {
  if (String(req.params.collectionSlug || '').toLowerCase() === 'owned') return next();
  return sendNftCollectionTokenMetadata(req, res, req.params.tokenId);
});

// ---------- Game shop: utility resources granted server-side ----------
router.get('/shop/config', async (req, res) => {
  const config = gameShopConfig();
  const solana = gameShopSolanaConfig();
  const solanaSkrDecimals = solana.skrReady
    ? await resolveSolanaMintDecimals(solana.skrMint, solana.skrDecimals)
    : solana.skrDecimals;
  const solanaClashDecimals = solana.clashReady
    ? await resolveSolanaMintDecimals(solana.clashMint, solana.clashDecimals)
    : solana.clashDecimals;
  const baseEvm = gameShopEvmConfig('base');
  const arbitrum = gameShopEvmConfig('arbitrum');
  const monad = gameShopEvmConfig('monad');
  const ink = gameShopEvmConfig('ink');
  const aptos = gameShopAptosConfig();
  const copDiscountBps = Math.max(0, Math.min(9000, Number(process.env.GAME_SHOP_COP_DISCOUNT_BPS || 2000)));
  const basePayments = baseEvm?.payments || [];
  res.set('Cache-Control', 'no-store');
  res.json({
    base: {
      chainId: config.chainId,
      shop: config.shop,
      treasury: baseEvm?.treasury || config.deployment?.treasury || null,
      usdcMint: baseEvm?.usdcMint || BASE_USDC_TOKEN,
      usdcDecimals: baseEvm?.usdcDecimals || 6,
      nativeSymbol: baseEvm?.nativeSymbol || 'ETH',
      nativeDecimals: baseEvm?.nativeDecimals || 18,
      payments: basePayments,
      saleActive: config.saleActive,
      ready: !!baseEvm?.ready,
    },
    solana: {
      chain: solana.chain,
      cluster: solana.cluster,
      treasury: solana.treasury,
      usdcMint: solana.usdcMint,
      skrMint: solana.skrMint,
      skrDecimals: solanaSkrDecimals,
      skrReady: solana.skrReady,
      clashMint: solana.clashMint,
      clashDecimals: solanaClashDecimals,
      clashReady: solana.clashReady,
      clashDiscountBps: copDiscountBps,
      memoProgram: solana.memoProgram,
      saleActive: solana.saleActive,
      ready: solana.ready,
    },
    arbitrum: {
      chain: arbitrum.chain,
      chainId: arbitrum.chainId,
      treasury: arbitrum.treasury,
      usdcMint: arbitrum.usdcMint,
      usdcDecimals: arbitrum.usdcDecimals,
      nativeSymbol: arbitrum.nativeSymbol,
      nativeDecimals: arbitrum.nativeDecimals,
      payments: arbitrum.payments,
      saleActive: arbitrum.saleActive,
      ready: arbitrum.ready,
    },
    monad: {
      chain: monad.chain,
      chainId: monad.chainId,
      treasury: monad.treasury,
      usdcMint: monad.usdcMint,
      usdcDecimals: monad.usdcDecimals,
      nativeSymbol: monad.nativeSymbol,
      nativeDecimals: monad.nativeDecimals,
      payments: monad.payments,
      saleActive: monad.saleActive,
      ready: monad.ready,
    },
    ink: {
      chain: ink.chain,
      chainId: ink.chainId,
      treasury: ink.treasury,
      usdcMint: ink.usdcMint,
      usdcDecimals: ink.usdcDecimals,
      nativeSymbol: ink.nativeSymbol,
      nativeDecimals: ink.nativeDecimals,
      payments: ink.payments,
      saleActive: ink.saleActive,
      ready: ink.ready,
    },
    aptos: {
      chain: aptos.chain,
      network: aptos.network,
      treasury: aptos.treasury,
      usdcAddress: aptos.usdcAddress,
      saleActive: aptos.saleActive,
      ready: aptos.ready,
    },
    products: gameShopProductsForClient(),
  });
});

router.post('/shop/base/quote', auth, async (req, res) => {
  const quoteStartedAt = Date.now();
  const requestedSku = String(req.body?.sku || '').trim();
  db.recordShopFunnelEvent({
    playerId: req.player.id,
    eventType: 'quote_requested',
    sku: requestedSku || null,
    chain: 'base',
    payment: 'cop',
    quantity: req.body?.quantity,
    metadata: { route: '/shop/base/quote' },
  });
  try {
    const rate = checkUtilityQuoteRateLimit(req);
    if (!rate.ok) {
      res.set('Retry-After', String(rate.retryAfterSec));
      return res.status(429).json({ error: 'Too many shop quote requests. Try again shortly.' });
    }

    const { getAddress } = await import('viem');
    const config = gameShopConfig();
    if (!config.shop) return res.status(503).json({ error: 'Game shop is not deployed' });
    if (!config.copReady) return res.status(503).json({ error: 'CoP token is not configured' });
    if (!config.saleActive && process.env.GAME_SHOP_REQUIRE_ACTIVE_QUOTE === '1') {
      return res.status(423).json({ error: 'Game shop sale is not active' });
    }

    const buyer = getAddress(String(req.body?.buyer || ''));
    const sku = requestedSku;
    const product = GAME_SHOP_PRODUCTS[sku];
    if (!product) return res.status(400).json({ error: 'Unknown shop item' });
    if (isOwnedGameShopProduct(req.player.id, product)) {
      return res.status(409).json({ error: `${product.title || product.sku} already purchased` });
    }
    const quantity = BigInt(parsePositiveInteger(req.body?.quantity, 1, product.maxQuantity || 10));
    const paymentToken = getAddress(config.copToken);
    const decimals = Number(process.env.GAME_SHOP_COP_DECIMALS || process.env.NFT_BASE_CLASH_DECIMALS || 18);
    const fullUsdPriceE6 = BigInt(product.usdPriceE6);
    const productDiscountBps = getGameShopCopDiscountBps(product);
    const discountBps = BigInt(productDiscountBps || 0);
    const usdPriceE6 = gameShopUsdPriceE6ForPayment(product, { chain: 'base', payment: 'cop' });
    const clashUsd = await fetchClashUsdPrice({ clashToken: paymentToken });
    const unitPrice = usdToNativeUnits(unitsToDecimalString(usdPriceE6, 6), clashUsd.price, decimals);
    // 600s default: gives the buy flow comfortable headroom for two wallet
    // signatures (approve + purchase) plus block confirmation. The previous
    // 300s window occasionally expired between approve and purchase on
    // slower wallets and the contract reverted with "Quote expired".
    const ttlSeconds = Math.max(30, Math.min(900, Number(process.env.GAME_SHOP_QUOTE_TTL_SECONDS || 600)));
    const deadline = BigInt(Math.floor(Date.now() / 1000) + ttlSeconds);
    const nonce = BigInt(`0x${crypto.randomBytes(16).toString('hex')}`);
    const account = gameAccountHash(req.player.id);
    const skuBytes32 = skuToBytes32(product.sku);

    const signer = await parseGameShopEvmAccount();
    const domain = {
      name: 'ClashGameShop',
      version: '1',
      chainId: 8453,
      verifyingContract: getAddress(config.shop),
    };
    const types = {
      PurchaseQuote: [
        { name: 'buyer', type: 'address' },
        { name: 'paymentToken', type: 'address' },
        { name: 'sku', type: 'bytes32' },
        { name: 'unitPrice', type: 'uint256' },
        { name: 'quantity', type: 'uint256' },
        { name: 'usdPriceE6', type: 'uint256' },
        { name: 'account', type: 'bytes32' },
        { name: 'nonce', type: 'uint256' },
        { name: 'deadline', type: 'uint256' },
      ],
    };
    const message = { buyer, paymentToken, sku: skuBytes32, unitPrice, quantity, usdPriceE6, account, nonce, deadline };
    const signature = await signer.signTypedData({
      domain,
      types,
      primaryType: 'PurchaseQuote',
      message,
    });
    const total = unitPrice * quantity;

    db.recordShopFunnelEvent({
      playerId: req.player.id,
      eventType: 'quote_succeeded',
      sku: product.sku,
      chain: 'base',
      payment: 'cop',
      token: paymentToken,
      quantity: quantity.toString(),
      usdPriceE6: (usdPriceE6 * quantity).toString(),
      tokenAmount: total.toString(),
      priceSource: `CoP/USD ${clashUsd.price} (${clashUsd.source})`,
      quoteId: nonce.toString(),
      metadata: { latency_ms: Date.now() - quoteStartedAt, unit_price: unitPrice.toString() },
    });
    res.set('Cache-Control', 'no-store');
    res.json({
      chainId: 8453,
      shop: getAddress(config.shop),
      payment: 'cop',
      priceSource: `CoP/USD ${clashUsd.price} (${clashUsd.source})`,
      discountBps: productDiscountBps == null ? null : discountBps.toString(),
      fullUsdPriceE6: fullUsdPriceE6.toString(),
      decimals,
      product: gameShopProductsForClient().find((item) => item.id === product.id),
      quantity: quantity.toString(),
      unitPrice: unitPrice.toString(),
      unitPriceFormatted: unitsToDecimalString(unitPrice, decimals),
      total: total.toString(),
      totalFormatted: unitsToDecimalString(total, decimals),
      quote: {
        buyer,
        paymentToken,
        sku: skuBytes32,
        unitPrice: unitPrice.toString(),
        quantity: quantity.toString(),
        usdPriceE6: usdPriceE6.toString(),
        account,
        nonce: nonce.toString(),
        deadline: deadline.toString(),
      },
      signature,
    });
  } catch (err) {
    const message = err?.message || 'quote failed';
    const status = /address|sku|quantity|item/i.test(message) ? 400 : 500;
    db.recordShopFunnelEvent({
      playerId: req.player.id,
      eventType: 'quote_failed',
      sku: requestedSku || null,
      chain: 'base',
      payment: 'cop',
      quantity: req.body?.quantity,
      errorCode: String(status),
      errorMessage: message.slice(0, 180),
      metadata: { latency_ms: Date.now() - quoteStartedAt, route: '/shop/base/quote' },
    });
    res.status(status).json({ error: message.slice(0, 180) });
  }
});

router.post('/shop/base/redeem', auth, async (req, res) => {
  const redeemStartedAt = Date.now();
  const requestedTxHash = String(req.body?.txHash || req.body?.hash || '').trim();
  db.recordShopFunnelEvent({
    playerId: req.player.id,
    eventType: 'redeem_requested',
    chain: 'base',
    payment: 'cop',
    txHash: requestedTxHash || null,
    metadata: { route: '/shop/base/redeem' },
  });
  try {
    const txHash = requestedTxHash;
    if (!/^0x[0-9a-fA-F]{64}$/.test(txHash)) {
      return res.status(400).json({ error: 'Bad transaction hash' });
    }

    const existing = db.db.prepare('SELECT * FROM utility_purchases WHERE tx_hash = ?').get(txHash);
    if (existing) {
      if (existing.player_id !== req.player.id) return res.status(409).json({ error: 'Purchase already redeemed' });
      db.recordShopFunnelEvent({
        playerId: req.player.id,
        eventType: 'redeem_duplicate',
        sku: existing.utility,
        chain: existing.chain || 'base',
        payment: 'cop',
        token: existing.token,
        txHash,
        metadata: { latency_ms: Date.now() - redeemStartedAt, purchase_id: existing.id },
      });
      return res.json({
        success: true,
        alreadyRedeemed: true,
        product: GAME_SHOP_PRODUCTS[existing.utility] || null,
        shield_until: existing.shield_until || null,
        resources: db.getResources(req.player.id),
        ...ownedGameShopGrant(req.player.id, existing.utility),
      });
    }

    const config = gameShopConfig();
    if (!config.shop) return res.status(503).json({ error: 'Game shop is not deployed' });
    const { decodeEventLog, getAddress } = await import('viem');
    const publicClient = await createBasePublicClient();
    const receipt = await publicClient.getTransactionReceipt({ hash: txHash });
    if (!receipt || receipt.status !== 'success') {
      return res.status(400).json({ error: 'Purchase transaction is not confirmed' });
    }

    const shopAddress = getAddress(config.shop).toLowerCase();
    let purchase = null;
    for (const log of receipt.logs || []) {
      if (String(log.address || '').toLowerCase() !== shopAddress) continue;
      try {
        const decoded = decodeEventLog({
          abi: GAME_PURCHASE_EVENT_ABI,
          data: log.data,
          topics: log.topics,
        });
        if (decoded?.eventName === 'GamePurchase') {
          purchase = decoded.args;
          break;
        }
      } catch {
        // This shop can emit admin/config events too; ignore non-purchase logs.
      }
    }
    if (!purchase) return res.status(400).json({ error: 'Game purchase event not found' });

    const expectedAccount = gameAccountHash(req.player.id).toLowerCase();
    if (String(purchase.account || '').toLowerCase() !== expectedAccount) {
      return res.status(403).json({ error: 'Purchase belongs to another game account' });
    }
    const paymentToken = getAddress(purchase.paymentToken);
    if (config.copReady && paymentToken.toLowerCase() !== getAddress(config.copToken).toLowerCase()) {
      return res.status(400).json({ error: 'Purchase was not paid with CoP' });
    }

    const sku = bytes32ToSku(purchase.sku);
    const product = GAME_SHOP_PRODUCTS[sku];
    if (!product) return res.status(400).json({ error: 'Unknown purchased item' });
    const quantity = Number(purchase.quantity);
    if (!Number.isSafeInteger(quantity) || quantity < 1 || quantity > (product.maxQuantity || 10)) {
      return res.status(400).json({ error: 'Bad purchase quantity' });
    }

    const grant = db.db.transaction(() => {
      const duplicate = db.db.prepare('SELECT id FROM utility_purchases WHERE tx_hash = ?').get(txHash);
      if (duplicate) {
        const err = new Error('Purchase already redeemed');
        err.status = 409;
        throw err;
      }
      const applied = applyGameShopProduct(req.player.id, product, quantity, { chain: 'base', payment: 'cop' });
      db.db.prepare(`
        INSERT INTO utility_purchases
          (player_id, utility, chain, tx_hash, payer, token, recipient, amount, usd_price_e6, duration_hours, shield_until)
        VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
      `).run(
        req.player.id,
        sku,
        'base',
        txHash,
        getAddress(purchase.buyer),
        paymentToken,
        config.deployment?.treasury || '',
        (BigInt(purchase.unitPrice) * BigInt(purchase.quantity)).toString(),
        purchase.usdPriceE6?.toString?.() || String(product.usdPriceE6),
        product.durationHours ? product.durationHours * quantity : null,
        applied.shield_until || null,
      );
      return applied;
    })();

    db.recordShopFunnelEvent({
      playerId: req.player.id,
      eventType: 'redeem_succeeded',
      sku,
      chain: 'base',
      payment: 'cop',
      token: paymentToken,
      quantity,
      usdPriceE6: purchase.usdPriceE6?.toString?.() || String(product.usdPriceE6),
      tokenAmount: (BigInt(purchase.unitPrice) * BigInt(purchase.quantity)).toString(),
      txHash,
      metadata: { latency_ms: Date.now() - redeemStartedAt },
    });
    res.json({
      success: true,
      product: gameShopProductsForClient().find((item) => item.id === product.id),
      quantity,
      txHash,
      ...grant,
    });
  } catch (err) {
    const message = err?.message || 'redeem failed';
    db.recordShopFunnelEvent({
      playerId: req.player.id,
      eventType: 'redeem_failed',
      chain: 'base',
      payment: 'cop',
      txHash: requestedTxHash || null,
      errorCode: String(err?.status || 500),
      errorMessage: message.slice(0, 180),
      metadata: { latency_ms: Date.now() - redeemStartedAt, route: '/shop/base/redeem' },
    });
    res.status(err?.status || 500).json({ error: message.slice(0, 180) });
  }
});

// ---------- Game shop: Solana payments (USDC or SOL), utility granted server-side ----------

function buildSolanaShopMemo({ sku, quantity, account, nonce, deadline, payment, amount }) {
  // Compact JSON payload — client puts these bytes inside a Memo program
  // instruction on their purchase tx. Server's redeem path verifies (a) the
  // memo bytes match what was signed, (b) the ed25519 signature recovers to
  // the configured signer pubkey. Without (a) an attacker who saw a quote
  // could mint a different (cheaper) tx with the same signature; without
  // (b) anyone could fabricate a memo for any account.
  return JSON.stringify({
    v: 1,
    sku,
    qty: Number(quantity),
    acc: account,
    nonce,
    deadline: Number(deadline),
    pay: payment,
    amt: String(amount),
  });
}

function signSolanaShopMemo(payload) {
  const keypair = getSolanaSignerKeypair();
  const msg = new TextEncoder().encode(payload);
  const sig = nacl.sign.detached(msg, keypair.secretKey);
  return bs58.encode(sig);
}

function verifySolanaShopMemoSignature(memoString, signatureB58) {
  try {
    const keypair = getSolanaSignerKeypair();
    const msg = new TextEncoder().encode(memoString);
    const sig = bs58.decode(signatureB58);
    if (sig.length !== 64) return false;
    return nacl.sign.detached.verify(msg, sig, keypair.publicKey.toBytes());
  } catch { return false; }
}

// Parse the {memo, signature} pair our quote emitted out of a confirmed
// Solana tx. We don't trust the client's body for these — we re-extract
// them from the on-chain memo instruction so the signature check actually
// proves the user paid for the SKU we'll grant.
function extractShopMemoFromTx(parsedTx, memoProgramId) {
  const instructions = parsedTx?.transaction?.message?.instructions || [];
  for (const ix of instructions) {
    const program = ix.program || ix.programId?.toString?.() || '';
    const pid = ix.programId?.toString?.() || '';
    if (program === 'spl-memo' || pid === memoProgramId) {
      const raw = typeof ix.parsed === 'string' ? ix.parsed : (ix.parsed?.info?.data ?? ix.data);
      if (typeof raw === 'string' && raw.trim().startsWith('{')) {
        try {
          const parsed = JSON.parse(raw);
          return { memo: raw, parsed };
        } catch {
          return null;
        }
      }
    }
  }
  return null;
}

// Return true if the tx contains a SystemProgram.transfer or SPL-token
// transferChecked/transfer instruction that delivers `expectedAmount` raw
// units of `expectedMint` (or native SOL when expectedMint is null) to
// `expectedTreasury`. We check parsed instructions only — opaque raw
// instructions are rejected so a tx with hand-rolled CPI can't slip past.
function txTransfersToTreasury({ parsedTx, expectedMint, expectedTreasury, expectedAmount }) {
  const expected = BigInt(expectedAmount);
  const instructions = parsedTx?.transaction?.message?.instructions || [];
  const innerSets = parsedTx?.meta?.innerInstructions || [];
  const allIxs = instructions.concat(...innerSets.map((s) => s.instructions || []));

  for (const ix of allIxs) {
    const program = ix.program || '';
    const type = ix.parsed?.type || '';
    const info = ix.parsed?.info || {};
    if (expectedMint == null) {
      // Native SOL transfer
      if (program === 'system' && (type === 'transfer' || type === 'transferWithSeed')) {
        if (String(info.destination) !== String(expectedTreasury)) continue;
        const lamports = BigInt(info.lamports || 0);
        if (lamports >= expected) return true;
      }
    } else {
      // SPL token transfer to the treasury's associated token account.
      // We accept either `transferChecked` (preferred — includes mint) or
      // legacy `transfer` (mint not in instruction; we cross-reference
      // via post-token-balances below as a safety net).
      const isSplTokenProgram = program === 'spl-token' || program === 'spl-token-2022';
      if (isSplTokenProgram && (type === 'transferChecked' || type === 'transferCheckedWithFee' || type === 'transfer')) {
        const amount = BigInt(info.tokenAmount?.amount ?? info.amount ?? 0);
        const mint = info.mint ? String(info.mint) : null;
        if (type === 'transferChecked' || type === 'transferCheckedWithFee') {
          if (mint !== String(expectedMint)) continue;
        }
        // For legacy `transfer`, the mint isn't in the instruction. Verify
        // the destination ATA owner via postTokenBalances.
        const dest = String(info.destination || '');
        const post = (parsedTx?.meta?.postTokenBalances || []).find((b) => b.accountIndex != null
          && String(parsedTx.transaction.message.accountKeys?.[b.accountIndex]?.pubkey || parsedTx.transaction.message.accountKeys?.[b.accountIndex] || '') === dest);
        if (post && (String(post.owner) !== String(expectedTreasury) || String(post.mint) !== String(expectedMint))) continue;
        if (amount >= expected) return true;
      }
    }
  }
  return false;
}

function shopMemoHash(memo) {
  return crypto.createHash('sha256').update(String(memo || ''), 'utf8').digest('hex');
}

function saveSolanaShopQuoteIntent({
  playerId,
  buyer,
  sku,
  quantity,
  payment,
  memo,
  signature,
  treasury,
  mint,
  amount,
  usdPriceE6,
  deadline,
}) {
  try {
    db.db.prepare(`
      INSERT OR IGNORE INTO shop_solana_quotes
        (player_id, buyer, sku, quantity, payment, memo, memo_hash, signature, treasury, mint, amount, usd_price_e6, deadline)
      VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
    `).run(
      playerId,
      String(buyer || ''),
      String(sku || ''),
      Number(quantity || 0),
      String(payment || ''),
      String(memo || ''),
      shopMemoHash(memo),
      String(signature || ''),
      String(treasury || ''),
      mint == null ? null : String(mint),
      String(amount || ''),
      String(usdPriceE6 || ''),
      Number(deadline || 0),
    );
  } catch (err) {
    console.warn('[shop-solana] quote intent save failed', err?.message || err);
  }
}

function getSolanaShopQuoteIntent(memo) {
  try {
    return db.db.prepare('SELECT * FROM shop_solana_quotes WHERE memo_hash = ? LIMIT 1').get(shopMemoHash(memo));
  } catch {
    return null;
  }
}

function setSolanaShopQuoteConsumed(memo, txHash) {
  try {
    db.db.prepare(`
      UPDATE shop_solana_quotes
      SET consumed_tx_hash = ?, consumed_at = datetime('now')
      WHERE memo_hash = ? AND consumed_tx_hash IS NULL
    `).run(String(txHash || ''), shopMemoHash(memo));
  } catch {}
}

function solanaTxSigner(parsedTx) {
  const keys = parsedTx?.transaction?.message?.accountKeys || [];
  const signer = keys.find((key) => key?.signer);
  return String(signer?.pubkey || signer || '');
}

async function verifySolanaShopPurchaseFromTx({
  signature,
  parsedTx,
  player = null,
  memoSignature = '',
  buyer = '',
  expectedSku = null,
  requireQuoteIntent = false,
  source = 'redeem',
} = {}) {
  const solana = gameShopSolanaConfig();
  if (!solana.ready) {
    const err = new Error('Solana game shop is not configured');
    err.status = 503;
    throw err;
  }
  if (!parsedTx) {
    const err = new Error('Solana tx not found or not confirmed yet');
    err.status = 400;
    throw err;
  }
  if (parsedTx.meta?.err) {
    const err = new Error('Solana tx failed on-chain');
    err.status = 400;
    throw err;
  }

  const memoInfo = extractShopMemoFromTx(parsedTx, solana.memoProgram);
  if (!memoInfo) {
    const err = new Error('Shop memo not found in tx');
    err.status = 400;
    throw err;
  }

  const quoteIntent = getSolanaShopQuoteIntent(memoInfo.memo);
  const effectiveMemoSig = String(memoSignature || quoteIntent?.signature || '').trim();
  if (!effectiveMemoSig) {
    const err = new Error('Missing memo signature');
    err.status = requireQuoteIntent ? 409 : 400;
    err.code = 'SHOP_SOLANA_QUOTE_INTENT_MISSING';
    throw err;
  }
  if (!verifySolanaShopMemoSignature(memoInfo.memo, effectiveMemoSig)) {
    const err = new Error('Bad memo signature');
    err.status = 403;
    throw err;
  }
  if (requireQuoteIntent && !quoteIntent) {
    const err = new Error('Shop quote intent not found for on-chain memo');
    err.status = 409;
    err.code = 'SHOP_SOLANA_QUOTE_INTENT_MISSING';
    throw err;
  }

  const memoData = memoInfo.parsed;
  if (memoData?.v !== 1) {
    const err = new Error('Unsupported memo version');
    err.status = 400;
    throw err;
  }

  let grantPlayer = player;
  if (!grantPlayer && quoteIntent?.player_id) {
    grantPlayer = db.db.prepare('SELECT * FROM players WHERE id = ?').get(quoteIntent.player_id);
  }
  if (!grantPlayer?.id) {
    const err = new Error('Purchase player not found');
    err.status = 404;
    throw err;
  }

  const expectedAccount = gameAccountHash(grantPlayer.id);
  if (String(memoData.acc).toLowerCase() !== expectedAccount.toLowerCase()) {
    const err = new Error('Purchase belongs to another game account');
    err.status = 403;
    throw err;
  }

  const sku = String(memoData.sku || '');
  if (expectedSku && sku !== expectedSku) {
    const err = new Error(`Expected ${expectedSku} payment memo`);
    err.status = 400;
    throw err;
  }
  const product = GAME_SHOP_PRODUCTS[sku];
  if (!product) {
    const err = new Error('Unknown purchased item');
    err.status = 400;
    throw err;
  }
  const quantity = Number(memoData.qty);
  if (!Number.isSafeInteger(quantity) || quantity < 1 || quantity > (product.maxQuantity || 10)) {
    const err = new Error('Bad purchase quantity');
    err.status = 400;
    throw err;
  }

  const payment = String(memoData.pay || 'usdc');
  if (payment !== 'usdc' && payment !== 'sol' && payment !== 'skr' && payment !== 'clash') {
    const err = new Error('Bad memo payment token');
    err.status = 400;
    throw err;
  }
  if (payment === 'skr' && !solana.skrReady) {
    const err = new Error('SKR shop is not configured on this server');
    err.status = 503;
    throw err;
  }
  if (payment === 'clash' && !solana.clashReady) {
    const err = new Error('CLASH shop is not configured on this server');
    err.status = 503;
    throw err;
  }

  const expectedAmount = BigInt(memoData.amt);
  const expectedMint = payment === 'usdc' ? solana.usdcMint
                      : payment === 'skr'  ? solana.skrMint
                      : payment === 'clash' ? solana.clashMint
                      : null;
  const expectedDecimals = payment === 'usdc' ? 6
                          : payment === 'skr'  ? await resolveSolanaMintDecimals(solana.skrMint, solana.skrDecimals)
                          : payment === 'clash' ? await resolveSolanaMintDecimals(solana.clashMint, solana.clashDecimals)
                          : 9;

  if (quoteIntent) {
    const quoteDeadline = Number(quoteIntent.deadline || 0);
    const txTime = Number(parsedTx.blockTime || 0);
    if (quoteDeadline && txTime && txTime > quoteDeadline + 600) {
      const err = new Error('Quote deadline expired before tx confirmation');
      err.status = 400;
      throw err;
    }
    const quoteChecks = [
      [String(quoteIntent.player_id), String(grantPlayer.id), 'player'],
      [String(quoteIntent.buyer), String(buyer || quoteIntent.buyer || ''), 'buyer'],
      [String(quoteIntent.sku), sku, 'sku'],
      [String(quoteIntent.quantity), String(quantity), 'quantity'],
      [String(quoteIntent.payment), payment, 'payment'],
      [String(quoteIntent.treasury), String(solana.treasury), 'treasury'],
      [String(quoteIntent.amount), expectedAmount.toString(), 'amount'],
      [String(quoteIntent.usd_price_e6), (gameShopUsdPriceE6ForPayment(product, { chain: 'solana', payment }) * BigInt(quantity)).toString(), 'usd_price_e6'],
    ];
    for (const [actual, expected, field] of quoteChecks) {
      if (actual !== expected) {
        const err = new Error(`Shop quote ${field} mismatch`);
        err.status = 403;
        throw err;
      }
    }
    if (quoteIntent.mint != null && String(quoteIntent.mint) !== String(expectedMint || '')) {
      const err = new Error('Shop quote mint mismatch');
      err.status = 403;
      throw err;
    }
  } else {
    const nowSec = Math.floor(Date.now() / 1000);
    if (Number(memoData.deadline) < nowSec - 600) {
      const err = new Error('Quote deadline expired');
      err.status = 400;
      throw err;
    }
  }

  if (!txTransfersToTreasury({
    parsedTx,
    expectedMint,
    expectedTreasury: solana.treasury,
    expectedAmount,
  })) {
    const tokenLabel = payment === 'usdc' ? 'USDC' : payment === 'skr' ? 'SKR' : payment === 'clash' ? 'CLASH' : 'SOL';
    const err = new Error(`${tokenLabel} transfer to treasury not found or under-paid`);
    err.status = 400;
    throw err;
  }

  return {
    signature,
    solana,
    parsedTx,
    memoInfo,
    memoData,
    quoteIntent,
    player: grantPlayer,
    sku,
    product,
    quantity,
    payment,
    expectedAmount,
    expectedMint,
    expectedDecimals,
    tokenLabel: payment === 'usdc' ? expectedMint : payment === 'skr' ? expectedMint : payment === 'clash' ? expectedMint : 'SOL',
    buyer: String(buyer || quoteIntent?.buyer || solanaTxSigner(parsedTx) || ''),
    source,
  };
}

function recordSolanaShopPurchaseGrant(paymentInfo) {
  return db.db.transaction(() => {
    const duplicate = db.db.prepare('SELECT id FROM utility_purchases WHERE tx_hash = ?').get(paymentInfo.signature);
    if (duplicate) {
      setSolanaShopQuoteConsumed(paymentInfo.memoInfo?.memo, paymentInfo.signature);
      return {
        duplicate: true,
        resources: db.getResources(paymentInfo.player.id),
        purchase: duplicate,
      };
    }
    const applied = applyGameShopProduct(
      paymentInfo.player.id,
      paymentInfo.product,
      paymentInfo.quantity,
      { chain: 'solana', payment: paymentInfo.payment, source: paymentInfo.source },
    );
    db.db.prepare(`
      INSERT INTO utility_purchases
        (player_id, utility, chain, tx_hash, payer, token, recipient, amount, usd_price_e6, duration_hours, shield_until)
      VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
    `).run(
      paymentInfo.player.id,
      paymentInfo.sku,
      'solana',
      paymentInfo.signature,
      paymentInfo.buyer,
      paymentInfo.tokenLabel,
      paymentInfo.solana.treasury,
      paymentInfo.expectedAmount.toString(),
      (BigInt(paymentInfo.product.usdPriceE6) * BigInt(paymentInfo.quantity)).toString(),
      paymentInfo.product.durationHours ? paymentInfo.product.durationHours * paymentInfo.quantity : null,
      applied.shield_until || null,
    );
    setSolanaShopQuoteConsumed(paymentInfo.memoInfo?.memo, paymentInfo.signature);
    const purchase = db.db.prepare('SELECT id, player_id, utility, tx_hash, created_at FROM utility_purchases WHERE tx_hash = ?').get(paymentInfo.signature);
    return {
      duplicate: false,
      ...applied,
      purchase,
    };
  })();
}

async function verifySolanaShopPaymentForPlayer(req, { expectedSku = null } = {}) {
  const signature = String(req.body?.txSignature || req.body?.signature || '').trim();
  if (!/^[1-9A-HJ-NP-Za-km-z]{43,90}$/.test(signature)) {
    const err = new Error('Bad Solana tx signature');
    err.status = 400;
    throw err;
  }
  const solana = gameShopSolanaConfig();
  if (!solana.ready) {
    const err = new Error('Solana game shop is not configured');
    err.status = 503;
    throw err;
  }
  const parsedTx = await getParsedTransactionWithSolanaFallback(signature, {
    commitment: 'confirmed',
    maxSupportedTransactionVersion: 0,
  });
  return verifySolanaShopPurchaseFromTx({
    signature,
    parsedTx,
    player: req.player,
    memoSignature: String(req.body?.signature || req.body?.serverSignature || '').trim(),
    buyer: String(req.body?.buyer || ''),
    expectedSku,
    source: 'redeem',
  });
}

router.post('/shop/solana/redeem', auth, async (req, res) => {
  const redeemStartedAt = Date.now();
  const requestedSignature = String(req.body?.txSignature || req.body?.signature || '').trim();
  db.recordShopFunnelEvent({
    playerId: req.player.id,
    eventType: 'redeem_requested',
    chain: 'solana',
    txHash: requestedSignature || null,
    metadata: { route: '/shop/solana/redeem' },
  });
  try {
    const signature = requestedSignature;
    // Solana tx signature is base58 of 64 bytes → 87-88 chars.
    if (!/^[1-9A-HJ-NP-Za-km-z]{43,90}$/.test(signature)) {
      return res.status(400).json({ error: 'Bad Solana tx signature' });
    }

    const existing = db.db.prepare('SELECT * FROM utility_purchases WHERE tx_hash = ?').get(signature);
    if (existing) {
      if (existing.player_id !== req.player.id) return res.status(409).json({ error: 'Purchase already redeemed' });
      db.recordShopFunnelEvent({
        playerId: req.player.id,
        eventType: 'redeem_duplicate',
        sku: existing.utility,
        chain: 'solana',
        payment: String(existing.token || '').toLowerCase(),
        token: existing.token,
        txHash: signature,
        metadata: { latency_ms: Date.now() - redeemStartedAt, purchase_id: existing.id },
      });
      return res.json({
        success: true,
        alreadyRedeemed: true,
        product: GAME_SHOP_PRODUCTS[existing.utility] || null,
        shield_until: existing.shield_until || null,
        resources: db.getResources(req.player.id),
        ...ownedGameShopGrant(req.player.id, existing.utility),
      });
    }

    const solana = gameShopSolanaConfig();
    if (!solana.ready) return res.status(503).json({ error: 'Solana game shop is not configured' });

    const parsedTx = await getParsedTransactionWithSolanaFallback(signature, {
      commitment: 'confirmed',
      maxSupportedTransactionVersion: 0,
    });
    {
      const paymentInfo = await verifySolanaShopPurchaseFromTx({
        signature,
        parsedTx,
        player: req.player,
        memoSignature: String(req.body?.signature || req.body?.serverSignature || '').trim(),
        buyer: String(req.body?.buyer || ''),
        source: 'redeem',
      });
      const grant = recordSolanaShopPurchaseGrant(paymentInfo);
      db.recordShopFunnelEvent({
        playerId: req.player.id,
        eventType: grant.duplicate ? 'redeem_duplicate' : 'redeem_succeeded',
        sku: paymentInfo.sku,
        chain: 'solana',
        payment: paymentInfo.payment,
        token: paymentInfo.tokenLabel,
        quantity: paymentInfo.quantity,
        usdPriceE6: (BigInt(paymentInfo.product.usdPriceE6) * BigInt(paymentInfo.quantity)).toString(),
        tokenAmount: paymentInfo.expectedAmount.toString(),
        txHash: signature,
        quoteId: paymentInfo.quoteIntent?.id || null,
        metadata: { latency_ms: Date.now() - redeemStartedAt, source: paymentInfo.source },
      });
      return res.json({
        success: true,
        product: gameShopProductsForClient().find((item) => item.id === paymentInfo.product.id),
        quantity: paymentInfo.quantity,
        txSignature: signature,
        payment: paymentInfo.payment,
        amount: paymentInfo.expectedAmount.toString(),
        amountFormatted: unitsToDecimalString(paymentInfo.expectedAmount, paymentInfo.expectedDecimals),
        ...grant,
      });
    }
    /*
    if (!parsedTx) return res.status(400).json({ error: 'Solana tx not found or not confirmed yet' });
    if (parsedTx.meta?.err) {
      return res.status(400).json({ error: 'Solana tx failed on-chain' });
    }

    const memoInfo = extractShopMemoFromTx(parsedTx, solana.memoProgram);
    if (!memoInfo) return res.status(400).json({ error: 'Shop memo not found in tx' });

    // The memo is the canonical source of truth — we re-verify the server's
    // signature against the memo bytes before we trust anything in it.
    // Without this, an attacker could craft a tx that pays $0.01 with a
    // fake memo claiming a $5 shield.
    const memoSig = String(req.body?.signature || req.body?.serverSignature || '').trim();
    if (!memoSig) return res.status(400).json({ error: 'Missing memo signature' });
    if (!verifySolanaShopMemoSignature(memoInfo.memo, memoSig)) {
      return res.status(403).json({ error: 'Bad memo signature' });
    }

    const memoData = memoInfo.parsed;
    if (memoData?.v !== 1) return res.status(400).json({ error: 'Unsupported memo version' });

    const nowSec = Math.floor(Date.now() / 1000);
    if (Number(memoData.deadline) < nowSec - 600) {
      // 10-minute grace beyond the original deadline so a tx confirmed at
      // T-1s before expiry but processed by us a minute later still counts.
      return res.status(400).json({ error: 'Quote deadline expired' });
    }

    const expectedAccount = gameAccountHash(req.player.id);
    if (String(memoData.acc).toLowerCase() !== expectedAccount.toLowerCase()) {
      return res.status(403).json({ error: 'Purchase belongs to another game account' });
    }

    const sku = String(memoData.sku || '');
    const product = GAME_SHOP_PRODUCTS[sku];
    if (!product) return res.status(400).json({ error: 'Unknown purchased item' });

    const quantity = Number(memoData.qty);
    if (!Number.isSafeInteger(quantity) || quantity < 1 || quantity > (product.maxQuantity || 10)) {
      return res.status(400).json({ error: 'Bad purchase quantity' });
    }

    const payment = String(memoData.pay || 'usdc');
    if (payment !== 'usdc' && payment !== 'sol' && payment !== 'skr' && payment !== 'clash') {
      return res.status(400).json({ error: 'Bad memo payment token' });
    }
    if (payment === 'skr' && !solana.skrReady) {
      return res.status(503).json({ error: 'SKR shop is not configured on this server' });
    }
    if (payment === 'clash' && !solana.clashReady) {
      return res.status(503).json({ error: 'CLASH shop is not configured on this server' });
    }
    const expectedAmount = BigInt(memoData.amt);
    const expectedMint = payment === 'usdc' ? solana.usdcMint
                        : payment === 'skr'  ? solana.skrMint
                        : payment === 'clash' ? solana.clashMint
                        : null;  // null for native SOL
    const expectedDecimals = payment === 'usdc' ? 6
                            : payment === 'skr'  ? await resolveSolanaMintDecimals(solana.skrMint, solana.skrDecimals)
                            : payment === 'clash' ? await resolveSolanaMintDecimals(solana.clashMint, solana.clashDecimals)
                            : 9;

    if (!txTransfersToTreasury({
      parsedTx,
      expectedMint,
      expectedTreasury: solana.treasury,
      expectedAmount,
    })) {
      const tokenLabel = payment === 'usdc' ? 'USDC' : payment === 'skr' ? 'SKR' : payment === 'clash' ? 'CLASH' : 'SOL';
      return res.status(400).json({
        error: `${tokenLabel} transfer to treasury not found or under-paid`,
      });
    }

    const grant = db.db.transaction(() => {
      const duplicate = db.db.prepare('SELECT id FROM utility_purchases WHERE tx_hash = ?').get(signature);
      if (duplicate) {
        const err = new Error('Purchase already redeemed');
        err.status = 409;
        throw err;
      }
      const applied = applyGameShopProduct(req.player.id, product, quantity, { chain: 'solana', payment });
      const tokenLabel = payment === 'usdc' ? expectedMint
                       : payment === 'skr'  ? expectedMint
                       : payment === 'clash' ? expectedMint
                       : 'SOL';
      db.db.prepare(`
        INSERT INTO utility_purchases
          (player_id, utility, chain, tx_hash, payer, token, recipient, amount, usd_price_e6, duration_hours, shield_until)
        VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
      `).run(
        req.player.id,
        sku,
        'solana',
        signature,
        String(req.body?.buyer || ''),                       // payer (Solana pubkey) — best-effort, not load-bearing
        tokenLabel,
        solana.treasury,
        expectedAmount.toString(),
        (gameShopUsdPriceE6ForPayment(product, { chain: 'solana', payment }) * BigInt(quantity)).toString(),
        product.durationHours ? product.durationHours * quantity : null,
        applied.shield_until || null,
      );
      return applied;
    })();

    res.json({
      success: true,
      product: gameShopProductsForClient().find((item) => item.id === product.id),
      quantity,
      txSignature: signature,
      payment,
      amount: expectedAmount.toString(),
      amountFormatted: unitsToDecimalString(expectedAmount, expectedDecimals),
      ...grant,
    });
    */
  } catch (err) {
    const message = err?.message || 'redeem failed';
    db.recordShopFunnelEvent({
      playerId: req.player.id,
      eventType: 'redeem_failed',
      chain: 'solana',
      txHash: requestedSignature || null,
      errorCode: err?.code || String(err?.status || 500),
      errorMessage: message.slice(0, 180),
      metadata: { latency_ms: Date.now() - redeemStartedAt, route: '/shop/solana/redeem' },
    });
    res.status(err?.status || 500).json({ error: message.slice(0, 180) });
  }
});

router.post('/nft/solana/upgrade/redeem', auth, async (req, res) => {
  try {
    const paymentInfo = await verifySolanaShopPaymentForPlayer(req, { expectedSku: 'demon_king_upgrade' });
    const signature = paymentInfo.signature;
    const owner = String(req.body?.buyer || '').trim();
    if (!SOLANA_WALLET_RE.test(owner)) return res.status(400).json({ error: 'Invalid Solana owner address' });
    const mint = String(req.body?.tokenId || req.body?.mint || req.body?.tokenAddress || '').trim();
    if (!SOLANA_WALLET_RE.test(mint)) return res.status(400).json({ error: 'Invalid Solana Demon King mint' });
    const newLevel = Number(req.body?.newLevel || req.body?.level || 0);
    if (![2, 3].includes(newLevel)) return res.status(400).json({ error: 'newLevel must be 2 or 3' });

    const existing = db.db.prepare('SELECT * FROM utility_purchases WHERE tx_hash = ?').get(signature);
    if (existing) {
      if (existing.player_id !== req.player.id) return res.status(409).json({ error: 'Upgrade payment already redeemed' });
      const { getSolanaBridgeAssetInfo } = require('./bridge_helpers');
      const current = await getSolanaBridgeAssetInfo(mint, owner);
      const level = normalizeNftLevel(current.level);
      const bound = db.bindPlayerDemonKingNft(req.player.id, owner, {
        chain: 'solana',
        tokenId: mint,
        level,
        imageUrl: nftImageUrl(req, level),
        txHash: signature,
      }, {
        source: 'solana-upgrade-redeem-replay',
        txHash: signature,
      });
      return res.json({
        success: true,
        alreadyRedeemed: true,
        chain: 'solana',
        tokenId: mint,
        level,
        requestedLevel: newLevel,
        txSignature: signature,
        bound,
      });
    }

    const { getSolanaBridgeAssetInfo, parseSolanaSecretKey } = require('./bridge_helpers');
    const current = await getSolanaBridgeAssetInfo(mint, owner);
    const currentLevel = normalizeNftLevel(current.level);
    if (newLevel !== currentLevel + 1) {
      return res.status(409).json({ error: `Must upgrade by exactly 1. Current level: ${currentLevel}` });
    }
    const requiredWins = db.demonKingRequiredWins(newLevel);
    const battleWins = db.getDemonKingBattleWins(req.player.id, 'solana', mint);
    if (requiredWins != null && battleWins < requiredWins) {
      return res.status(403).json({
        error: `Demon King level ${newLevel} requires ${requiredWins} battle wins`,
        code: 'DEMON_KING_WINS_REQUIRED',
        battle_wins: battleWins,
        required_wins: requiredWins,
        next_level: newLevel,
      });
    }

    const rawKey = process.env.SOLANA_NFT_KEY || process.env.NFT_SOLANA_KEY || process.env.NFT_KEY;
    if (!rawKey) return res.status(503).json({ error: 'Solana NFT authority key is not configured' });
    let upgraded;
    if (current.standard === 'mpl-core') {
      upgraded = await upgradeSolanaCoreNftLevel({
        req,
        assetId: mint,
        owner,
        level: newLevel,
        sourceRef: signature,
      });
    } else {
      const { Connection } = require('@solana/web3.js');
      const connection = await withSolanaRpcFallback(async (rpc) => {
        const candidate = createSolanaConnection(Connection, rpc, 'confirmed');
        await candidate.getLatestBlockhash('confirmed');
        return candidate;
      }, {
        label: 'Solana Token-2022 upgrade RPC probe',
      });
      upgraded = await upgradeToken2022NftLevel({
        mint,
        owner,
        level: newLevel,
        payerSecretKey: parseSolanaSecretKey(rawKey),
        connection,
      });
    }

    const bound = db.db.transaction(() => {
      const duplicate = db.db.prepare('SELECT id FROM utility_purchases WHERE tx_hash = ?').get(signature);
      if (duplicate) {
        const err = new Error('Upgrade payment already redeemed');
        err.status = 409;
        throw err;
      }
      db.db.prepare(`
        INSERT INTO utility_purchases
          (player_id, utility, chain, tx_hash, payer, token, recipient, amount, usd_price_e6, duration_hours, shield_until)
        VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
      `).run(
        req.player.id,
        paymentInfo.sku,
        'solana',
        signature,
        owner,
        paymentInfo.tokenLabel,
        paymentInfo.solana.treasury,
        paymentInfo.expectedAmount.toString(),
        (BigInt(paymentInfo.product.usdPriceE6) * BigInt(paymentInfo.quantity)).toString(),
        null,
        null,
      );
      return db.bindPlayerDemonKingNft(req.player.id, owner, {
        chain: 'solana',
        tokenId: mint,
        level: newLevel,
        imageUrl: nftImageUrl(req, newLevel),
        txHash: upgraded.updateTxSig || signature,
      }, {
        source: 'solana-upgrade',
        txHash: upgraded.updateTxSig || signature,
      });
    })();

    res.json({
      success: true,
      chain: 'solana',
      tokenId: mint,
      level: newLevel,
      previousLevel: currentLevel,
      payment: paymentInfo.payment,
      txSignature: signature,
      metadataTxSignature: upgraded.updateTxSig || null,
      bound,
      amount: paymentInfo.expectedAmount.toString(),
      amountFormatted: unitsToDecimalString(paymentInfo.expectedAmount, paymentInfo.expectedDecimals),
    });
  } catch (err) {
    const message = err?.message || 'Solana NFT upgrade redeem failed';
    res.status(err?.status || 500).json({ error: message.slice(0, 180) });
  }
});

router.post('/shop/solana/quote', auth, async (req, res) => {
  const quoteStartedAt = Date.now();
  const requestedSku = String(req.body?.sku || '').trim();
  const requestedPayment = String(req.body?.payment || 'usdc').toLowerCase();
  db.recordShopFunnelEvent({
    playerId: req.player.id,
    eventType: 'quote_requested',
    sku: requestedSku || null,
    chain: 'solana',
    payment: requestedPayment,
    quantity: req.body?.quantity,
    metadata: { route: '/shop/solana/quote' },
  });
  try {
    const rate = checkUtilityQuoteRateLimit(req);
    if (!rate.ok) {
      res.set('Retry-After', String(rate.retryAfterSec));
      return res.status(429).json({ error: 'Too many shop quote requests. Try again shortly.' });
    }

    const solana = gameShopSolanaConfig();
    if (!solana.ready) return res.status(503).json({ error: 'Solana game shop is not configured' });
    if (!solana.saleActive && process.env.GAME_SHOP_REQUIRE_ACTIVE_QUOTE === '1') {
      return res.status(423).json({ error: 'Solana game shop sale is not active' });
    }

    const sku = requestedSku;
    const product = GAME_SHOP_PRODUCTS[sku];
    if (!product) return res.status(400).json({ error: 'Unknown shop item' });
    if (isOwnedGameShopProduct(req.player.id, product)) {
      return res.status(409).json({ error: `${product.title || product.sku} already purchased` });
    }

    const payment = requestedPayment;
    if (payment !== 'usdc' && payment !== 'sol' && payment !== 'skr' && payment !== 'clash') {
      return res.status(400).json({ error: 'Bad payment token (usdc | sol | skr | clash)' });
    }
    if (payment === 'skr' && !solana.skrReady) {
      return res.status(503).json({ error: 'SKR shop is not configured yet — set GAME_SHOP_SOLANA_SKR_MINT' });
    }

    if (payment === 'clash' && !solana.clashReady) {
      return res.status(503).json({ error: 'CLASH shop is not configured yet - set GAME_SHOP_SOLANA_CLASH_MINT' });
    }

    const buyer = String(req.body?.buyer || '').trim();
    if (!buyer || !SOLANA_WALLET_RE.test(buyer)) {
      return res.status(400).json({ error: 'Invalid Solana buyer address' });
    }

    const quantity = parsePositiveInteger(req.body?.quantity, 1, product.maxQuantity || 10);
    const usdPriceE6 = gameShopUsdPriceE6ForPayment(product, { chain: 'solana', payment }) * BigInt(quantity);
    const usdAmount = unitsToDecimalString(usdPriceE6, 6);

    let amount;       // raw on-chain units (lamports for SOL, 1e6 for USDC)
    let decimals;     // tokens decimals
    let priceSource;  // human-readable label for the UI/log
    let mint = null;  // null for native SOL
    if (payment === 'usdc') {
      amount = usdToNativeUnits(usdAmount, '1', 6);
      decimals = 6;
      priceSource = 'USDC 1:1 USD';
      mint = solana.usdcMint;
    } else if (payment === 'sol') {
      const solUsd = await fetchNftUsdPrice('sol');
      amount = usdToNativeUnits(usdAmount, solUsd, 9); // lamports
      decimals = 9;
      priceSource = `SOL/USD ${solUsd}`;
    } else if (payment === 'skr') {
      // SKR (Solana Mobile Seeker). Oracle price comes from env override
      // because no major price API has a canonical SKR/USD feed yet —
      // operator sets NFT_SKR_USD when ready to accept this token. Decimals
      // are read from the mint account so 661 SKR cannot become 0.661 SKR.
      const skrUsd = await fetchNftUsdPrice('skr');
      const skrDecimals = await resolveSolanaMintDecimals(solana.skrMint, solana.skrDecimals);
      amount = usdToNativeUnits(usdAmount, skrUsd, skrDecimals);
      decimals = skrDecimals;
      priceSource = `SKR/USD ${skrUsd}`;
      mint = solana.skrMint;
    } else {
      const clashUsd = await fetchNftUsdPrice('clash');
      const clashDecimals = await resolveSolanaMintDecimals(solana.clashMint, solana.clashDecimals);
      amount = usdToNativeUnits(usdAmount, clashUsd, clashDecimals);
      decimals = clashDecimals;
      priceSource = `CLASH/USD ${clashUsd}`;
      mint = solana.clashMint;
    }

    const ttlSeconds = Math.max(30, Math.min(900, Number(process.env.GAME_SHOP_QUOTE_TTL_SECONDS || 600)));
    const deadline = Math.floor(Date.now() / 1000) + ttlSeconds;
    const nonce = `0x${crypto.randomBytes(16).toString('hex')}`;
    const account = gameAccountHash(req.player.id);

    const memo = buildSolanaShopMemo({
      sku: product.sku,
      quantity,
      account,
      nonce,
      deadline,
      payment,
      amount,
    });
    const signature = signSolanaShopMemo(memo);
    const signerPubkey = getSolanaSignerKeypair().publicKey.toBase58();
    saveSolanaShopQuoteIntent({
      playerId: req.player.id,
      buyer,
      sku: product.sku,
      quantity,
      payment,
      memo,
      signature,
      treasury: solana.treasury,
      mint,
      amount,
      usdPriceE6: usdPriceE6.toString(),
      deadline,
    });

    db.recordShopFunnelEvent({
      playerId: req.player.id,
      eventType: 'quote_succeeded',
      sku: product.sku,
      chain: 'solana',
      payment,
      token: mint || 'SOL',
      quantity,
      usdPriceE6: usdPriceE6.toString(),
      tokenAmount: amount.toString(),
      priceSource,
      quoteId: shopMemoHash(memo),
      metadata: { latency_ms: Date.now() - quoteStartedAt, deadline, buyer },
    });
    res.set('Cache-Control', 'no-store');
    res.json({
      chain: 'solana',
      cluster: solana.cluster,
      treasury: solana.treasury,
      memoProgram: solana.memoProgram,
      payment,
      mint,                                 // null for native SOL transfer
      decimals,
      priceSource,
      product: gameShopProductsForClient().find((item) => item.id === product.id),
      quantity,
      amount: amount.toString(),            // raw units for transfer instruction
      amountFormatted: unitsToDecimalString(amount, decimals),
      usdAmount,
      nonce,
      account,
      deadline,
      memo,
      signature,
      signerPubkey,
    });
  } catch (err) {
    const message = err?.message || 'quote failed';
    const status = /address|sku|quantity|item/i.test(message) ? 400 : 500;
    db.recordShopFunnelEvent({
      playerId: req.player.id,
      eventType: 'quote_failed',
      sku: requestedSku || null,
      chain: 'solana',
      payment: requestedPayment,
      quantity: req.body?.quantity,
      errorCode: String(status),
      errorMessage: message.slice(0, 180),
      metadata: { latency_ms: Date.now() - quoteStartedAt, route: '/shop/solana/quote' },
    });
    res.status(status).json({ error: message.slice(0, 180) });
  }
});

let solanaShopReconcileTimer = null;
let solanaShopReconcileRunning = false;

async function runSolanaShopReconcileSweep(options = {}) {
  const requestedSignature = String(options.txSignature || options.signature || '').trim();
  const limit = requestedSignature
    ? 1
    : Math.max(10, Math.min(250, Number(options.limit || process.env.GAME_SHOP_SOLANA_RECONCILE_LIMIT || 100)));
  const source = String(options.source || 'manual');
  const summary = {
    source,
    limit,
    checked: 0,
    skipped: 0,
    granted: 0,
    duplicates: 0,
    errors: [],
    grants: [],
  };
  const solana = gameShopSolanaConfig();
  if (!solana.ready) {
    summary.disabled = 'solana_shop_not_configured';
    return summary;
  }

  const { Connection, PublicKey } = require('@solana/web3.js');
  const processSignature = async (signature, row = {}) => {
    if (!signature) return;
    summary.checked += 1;
    if (row.err) {
      summary.skipped += 1;
      return;
    }
    const existing = db.db.prepare('SELECT id FROM utility_purchases WHERE tx_hash = ?').get(signature);
    if (existing) {
      summary.duplicates += 1;
      return;
    }
    const parsedTx = await getParsedTransactionWithSolanaFallback(signature, {
      commitment: 'confirmed',
      maxSupportedTransactionVersion: 0,
    });
    const memoInfo = extractShopMemoFromTx(parsedTx, solana.memoProgram);
    if (!memoInfo) {
      summary.skipped += 1;
      return;
    }
    const quoteIntent = getSolanaShopQuoteIntent(memoInfo.memo);
    if (!quoteIntent) {
      summary.skipped += 1;
      return;
    }
    const product = GAME_SHOP_PRODUCTS[String(quoteIntent.sku || '')];
    if (!product || product.kind === 'nft_upgrade') {
      // NFT upgrades need a separate on-chain metadata update after payment.
      // Do not mark those payments consumed from the generic resource worker.
      summary.skipped += 1;
      return;
    }
    const paymentInfo = await verifySolanaShopPurchaseFromTx({
      signature,
      parsedTx,
      requireQuoteIntent: true,
      source: `reconcile:${source}`,
    });
    const grant = recordSolanaShopPurchaseGrant(paymentInfo);
    if (grant.duplicate) {
      summary.duplicates += 1;
      return;
    }
    summary.granted += 1;
    summary.grants.push({
      tx_hash: signature,
      player_id: paymentInfo.player.id,
      sku: paymentInfo.sku,
      quantity: paymentInfo.quantity,
      payment: paymentInfo.payment,
      purchase_id: grant.purchase?.id || null,
      resources: grant.resources || null,
      shield_until: grant.shield_until || null,
    });
    console.log('[shop-solana] reconciled missing purchase', {
      tx_hash: signature,
      player_id: paymentInfo.player.id,
      sku: paymentInfo.sku,
      quantity: paymentInfo.quantity,
      source,
    });
  };

  if (requestedSignature) {
    if (!/^[1-9A-HJ-NP-Za-km-z]{43,90}$/.test(requestedSignature)) {
      summary.errors.push({ tx_hash: requestedSignature, message: 'Bad Solana tx signature', code: 'BAD_SIGNATURE' });
      return summary;
    }
    try {
      await processSignature(requestedSignature);
    } catch (err) {
      summary.errors.push({
        tx_hash: requestedSignature,
        message: err?.message || String(err),
        code: err?.code || null,
      });
      console.warn('[shop-solana] reconcile tx failed', requestedSignature, err?.message || err);
    }
    return summary;
  }

  const treasuryPk = new PublicKey(solana.treasury);
  let signatures = [];
  try {
    signatures = await withSolanaRpcFallback(async (rpcUrl) => {
      const connection = createSolanaConnection(Connection, rpcUrl, 'confirmed');
      return connection.getSignaturesForAddress(treasuryPk, { limit }, 'confirmed');
    }, { label: 'Solana shop reconcile signature scan' });
  } catch (err) {
    summary.errors.push({ stage: 'signatures', message: err?.message || String(err) });
    return summary;
  }

  for (const row of [...signatures].reverse()) {
    const signature = String(row?.signature || '');
    if (!signature) continue;
    try {
      await processSignature(signature, row);
    } catch (err) {
      summary.errors.push({
        tx_hash: signature,
        message: err?.message || String(err),
        code: err?.code || null,
      });
      console.warn('[shop-solana] reconcile tx failed', signature, err?.message || err);
    }
  }
  return summary;
}

function startSolanaShopReconciler() {
  if (solanaShopReconcileTimer || process.env.GAME_SHOP_SOLANA_RECONCILE_ENABLED === '0') return;
  const intervalMs = Math.max(30_000, Number(process.env.GAME_SHOP_SOLANA_RECONCILE_INTERVAL_MS || 90_000));
  const tick = async () => {
    if (solanaShopReconcileRunning) return;
    solanaShopReconcileRunning = true;
    try {
      const result = await runSolanaShopReconcileSweep({ source: 'interval' });
      if (result.granted || result.errors.length) {
        console.log('[shop-solana] reconcile sweep', {
          checked: result.checked,
          granted: result.granted,
          duplicates: result.duplicates,
          skipped: result.skipped,
          errors: result.errors.length,
        });
      }
    } catch (err) {
      console.warn('[shop-solana] reconcile sweep failed', err?.message || err);
    } finally {
      solanaShopReconcileRunning = false;
    }
  };
  solanaShopReconcileTimer = setInterval(tick, intervalMs);
  solanaShopReconcileTimer.unref?.();
  setTimeout(tick, Math.min(15_000, intervalMs)).unref?.();
}

startSolanaShopReconciler();

// ---------- Game shop: generic EVM (Arbitrum, Monad) USDC transfer ----------

function buildEvmShopMemo({ chainKey, chainId, sku, quantity, account, nonce, deadline, amount, treasury, payment, kind, mint }) {
  // Mirrors Solana's memo JSON. The buyer's `acc` ties the quote to a
  // specific game account so a leaked quote can't be redeemed by a
  // different player. The amount embeds a 3-digit nonce salt so the
  // on-chain Transfer can be matched back to this exact quote.
  // `kind` is 'native' (ETH/MON via msg.value) or 'erc20' (USDC etc.).
  return JSON.stringify({
    v: 1,
    chain: chainKey,
    chainId: Number(chainId),
    sku,
    qty: Number(quantity),
    acc: account,
    nonce,
    deadline: Number(deadline),
    pay: payment,
    kind,
    amt: String(amount),
    to: treasury,
    mint: kind === 'erc20' ? mint : null,
  });
}

function signEvmShopMemo(payload) {
  // Reuses the Solana ed25519 signer — there's no on-chain verifier here,
  // we only ever check the signature server-side in /shop/evm/redeem to
  // confirm the memo came from us. Keeping it in one keypair simplifies
  // ops.
  const keypair = getSolanaSignerKeypair();
  const msg = new TextEncoder().encode(payload);
  const sig = nacl.sign.detached(msg, keypair.secretKey);
  return bs58.encode(sig);
}

function verifyEvmShopMemoSignature(memoString, signatureB58) {
  try {
    const keypair = getSolanaSignerKeypair();
    const msg = new TextEncoder().encode(memoString);
    const sig = bs58.decode(signatureB58);
    if (sig.length !== 64) return false;
    return nacl.sign.detached.verify(msg, sig, keypair.publicKey.toBytes());
  } catch { return false; }
}

router.post('/shop/evm/quote', auth, async (req, res) => {
  const quoteStartedAt = Date.now();
  const requestedChain = String(req.body?.chain || '').toLowerCase();
  const requestedPayment = String(req.body?.payment || defaultEvmPayment(requestedChain) || 'usdc').toLowerCase();
  const requestedSku = String(req.body?.sku || '').trim();
  db.recordShopFunnelEvent({
    playerId: req.player.id,
    eventType: 'quote_requested',
    sku: requestedSku || null,
    chain: requestedChain || null,
    payment: requestedPayment,
    quantity: req.body?.quantity,
    metadata: { route: '/shop/evm/quote' },
  });
  try {
    const rate = checkUtilityQuoteRateLimit(req);
    if (!rate.ok) {
      res.set('Retry-After', String(rate.retryAfterSec));
      return res.status(429).json({ error: 'Too many shop quote requests. Try again shortly.' });
    }

    const chainKey = requestedChain;
    const config = gameShopEvmConfig(chainKey);
    if (!config) return res.status(400).json({ error: 'Unsupported EVM shop chain.' });
    if (!config.ready) return res.status(503).json({ error: `${config.label} shop treasury is not configured` });
    if (!config.saleActive && process.env.GAME_SHOP_REQUIRE_ACTIVE_QUOTE === '1') {
      return res.status(423).json({ error: `${config.label} shop sale is not active` });
    }

    const paymentKey = requestedPayment;
    const paymentSpec = evmPaymentSpec(chainKey, paymentKey);
    if (!paymentSpec) {
      return res.status(400).json({ error: `Unsupported payment on ${config.label}: ${paymentKey}` });
    }

    const { getAddress } = await import('viem');
    const buyer = getAddress(String(req.body?.buyer || ''));
    const sku = requestedSku;
    const product = GAME_SHOP_PRODUCTS[sku];
    if (!product) return res.status(400).json({ error: 'Unknown shop item' });
    if (isOwnedGameShopProduct(req.player.id, product)) {
      return res.status(409).json({ error: `${product.title || product.sku} already purchased` });
    }
    const quantity = parsePositiveInteger(req.body?.quantity, 1, product.maxQuantity || 10);

    // Total USD owed for this SKU * quantity. Both USDC (stable, 1:1) and
    // native (ETH/MON, oracle-priced) flows convert via usdToNativeUnits —
    // the only difference is the conversion rate.
    const usdPriceE6 = BigInt(product.usdPriceE6) * BigInt(quantity);
    const usdAmount = unitsToDecimalString(usdPriceE6, 6);

    let baseAmount;
    let priceSource;
    if (paymentSpec.stable) {
      // USDC pegged 1:1 to USD; assetUsd='1' makes this a pure decimals scale.
      baseAmount = usdToNativeUnits(usdAmount, '1', paymentSpec.decimals);
      priceSource = `${paymentSpec.label} 1:1 USD`;
    } else {
      const assetUsd = await fetchNftUsdPrice(paymentSpec.oracleAsset);
      baseAmount = usdToNativeUnits(usdAmount, assetUsd, paymentSpec.decimals);
      priceSource = `${paymentSpec.label}/USD ${assetUsd}`;
    }

    // Embed a 3-digit nonce salt in the on-chain amount so two quotes never
    // produce identical Transfer.value entries — that's how /shop/evm/redeem
    // distinguishes which quote a tx fulfilled. For native transfers the
    // salt lives in the tx `value` instead of an ERC20 Transfer log.
    const nonceRaw = crypto.randomBytes(16);
    const nonce = `0x${nonceRaw.toString('hex')}`;
    const salt = BigInt(nonceRaw.readUInt16BE(0)) % 1000n;
    const amount = baseAmount + salt;

    const ttlSeconds = Math.max(30, Math.min(900, Number(process.env.GAME_SHOP_QUOTE_TTL_SECONDS || 600)));
    const deadline = Math.floor(Date.now() / 1000) + ttlSeconds;
    const account = gameAccountHash(req.player.id);

    const memo = buildEvmShopMemo({
      chainKey,
      chainId: config.chainId,
      sku: product.sku,
      quantity,
      account,
      nonce,
      deadline,
      amount,
      treasury: getAddress(config.treasury),
      payment: paymentKey,
      kind: paymentSpec.kind,
      mint: paymentSpec.kind === 'erc20' ? getAddress(paymentSpec.token) : null,
    });
    const signature = signEvmShopMemo(memo);

    db.recordShopFunnelEvent({
      playerId: req.player.id,
      eventType: 'quote_succeeded',
      sku: product.sku,
      chain: chainKey,
      payment: paymentKey,
      token: paymentSpec.kind === 'erc20' ? getAddress(paymentSpec.token) : paymentKey.toUpperCase(),
      quantity,
      usdPriceE6: usdPriceE6.toString(),
      tokenAmount: amount.toString(),
      priceSource,
      quoteId: nonce,
      metadata: { latency_ms: Date.now() - quoteStartedAt, kind: paymentSpec.kind, buyer },
    });
    res.set('Cache-Control', 'no-store');
    res.json({
      chain: chainKey,
      chainId: config.chainId,
      label: config.label,
      explorer: config.explorer,
      treasury: getAddress(config.treasury),
      payment: paymentKey,
      kind: paymentSpec.kind,
      mint: paymentSpec.kind === 'erc20' ? getAddress(paymentSpec.token) : null,
      decimals: paymentSpec.decimals,
      priceSource,
      product: gameShopProductsForClient().find((p) => p.id === product.id),
      quantity,
      amount: amount.toString(),
      amountFormatted: unitsToDecimalString(amount, paymentSpec.decimals),
      usdAmount,
      nonce,
      account,
      deadline,
      memo,
      signature,
    });
  } catch (err) {
    const message = err?.message || 'quote failed';
    const status = /address|sku|quantity|item|payment/i.test(message) ? 400 : 500;
    db.recordShopFunnelEvent({
      playerId: req.player.id,
      eventType: 'quote_failed',
      sku: requestedSku || null,
      chain: requestedChain || null,
      payment: requestedPayment,
      quantity: req.body?.quantity,
      errorCode: String(status),
      errorMessage: message.slice(0, 180),
      metadata: { latency_ms: Date.now() - quoteStartedAt, route: '/shop/evm/quote' },
    });
    res.status(status).json({ error: message.slice(0, 180) });
  }
});

router.post('/shop/evm/redeem', auth, async (req, res) => {
  const redeemStartedAt = Date.now();
  const requestedChain = String(req.body?.chain || '').toLowerCase();
  const requestedTxHash = String(req.body?.txHash || '').trim();
  db.recordShopFunnelEvent({
    playerId: req.player.id,
    eventType: 'redeem_requested',
    chain: requestedChain || null,
    txHash: requestedTxHash || null,
    metadata: { route: '/shop/evm/redeem' },
  });
  try {
    const chainKey = requestedChain;
    const config = gameShopEvmConfig(chainKey);
    if (!config) return res.status(400).json({ error: 'Unsupported chain' });

    const txHash = requestedTxHash;
    if (!/^0x[0-9a-fA-F]{64}$/.test(txHash)) {
      return res.status(400).json({ error: 'Bad transaction hash' });
    }

    const existing = db.db.prepare('SELECT * FROM utility_purchases WHERE tx_hash = ?').get(txHash);
    if (existing) {
      if (existing.player_id !== req.player.id) return res.status(409).json({ error: 'Purchase already redeemed' });
      db.recordShopFunnelEvent({
        playerId: req.player.id,
        eventType: 'redeem_duplicate',
        sku: existing.utility,
        chain: existing.chain || chainKey,
        payment: String(existing.token || '').toLowerCase(),
        token: existing.token,
        txHash,
        metadata: { latency_ms: Date.now() - redeemStartedAt, purchase_id: existing.id },
      });
      return res.json({
        success: true,
        alreadyRedeemed: true,
        product: GAME_SHOP_PRODUCTS[existing.utility] || null,
        shield_until: existing.shield_until || null,
        resources: db.getResources(req.player.id),
        ...ownedGameShopGrant(req.player.id, existing.utility),
      });
    }

    const memo = String(req.body?.memo || '');
    const memoSignature = String(req.body?.signature || '').trim();
    if (!memo || !memoSignature) {
      return res.status(400).json({ error: 'Missing memo or signature' });
    }
    if (!verifyEvmShopMemoSignature(memo, memoSignature)) {
      return res.status(403).json({ error: 'Bad memo signature' });
    }
    let memoData;
    try { memoData = JSON.parse(memo); } catch { return res.status(400).json({ error: 'Bad memo payload' }); }
    if (memoData?.v !== 1) return res.status(400).json({ error: 'Unsupported memo version' });
    if (String(memoData.chain).toLowerCase() !== chainKey) return res.status(400).json({ error: 'Chain mismatch' });

    const nowSec = Math.floor(Date.now() / 1000);
    if (Number(memoData.deadline) < nowSec - 600) {
      return res.status(400).json({ error: 'Quote deadline expired' });
    }

    const expectedAccount = gameAccountHash(req.player.id);
    if (String(memoData.acc).toLowerCase() !== expectedAccount.toLowerCase()) {
      return res.status(403).json({ error: 'Purchase belongs to another game account' });
    }

    const sku = String(memoData.sku || '');
    const product = GAME_SHOP_PRODUCTS[sku];
    if (!product) return res.status(400).json({ error: 'Unknown purchased item' });
    const quantity = Number(memoData.qty);
    if (!Number.isSafeInteger(quantity) || quantity < 1 || quantity > (product.maxQuantity || 10)) {
      return res.status(400).json({ error: 'Bad purchase quantity' });
    }

    const expectedAmount = BigInt(memoData.amt);
    const memoKind = String(memoData.kind || 'erc20');
    const memoPayment = String(memoData.pay || 'usdc');
    const { getAddress } = await import('viem');
    const expectedTreasury = getAddress(memoData.to).toLowerCase();
    const expectedMint = memoKind === 'erc20' ? getAddress(memoData.mint).toLowerCase() : null;

    // Resolve the decimals + sender post-verification — both branches set
    // these so the utility_purchases insert downstream has clean values
    // independent of which kind was used.
    let txSender = null;
    let amountDecimals;
    const paymentSpec = evmPaymentSpec(chainKey, memoPayment);
    if (paymentSpec) amountDecimals = paymentSpec.decimals;
    else amountDecimals = config.usdcDecimals || 18;

    const rpcUrl = GAME_SHOP_EVM_CHAINS[chainKey].rpcUrl();

    if (memoKind === 'native') {
      // Native (ETH/MON) transfer — need the tx itself, not just the receipt.
      // Receipt confirms inclusion + status; the value/to live on the tx.
      const [receiptResp, txResp] = await Promise.all([
        fetch(rpcUrl, { method: 'POST', headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ jsonrpc: '2.0', id: 1, method: 'eth_getTransactionReceipt', params: [txHash] }) }),
        fetch(rpcUrl, { method: 'POST', headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ jsonrpc: '2.0', id: 2, method: 'eth_getTransactionByHash', params: [txHash] }) }),
      ]);
      const receipt = (await receiptResp.json().catch(() => ({})))?.result;
      const txObj = (await txResp.json().catch(() => ({})))?.result;
      if (!receipt || !txObj) return res.status(400).json({ error: 'Tx not found or not confirmed yet' });
      if (receipt.status !== '0x1') return res.status(400).json({ error: 'Tx failed on-chain' });
      const txTo = String(txObj.to || '').toLowerCase();
      const txValue = BigInt(txObj.value || '0x0');
      if (txTo !== expectedTreasury) {
        return res.status(400).json({ error: 'Native transfer recipient mismatch' });
      }
      if (txValue < expectedAmount) {
        return res.status(400).json({ error: `${memoData.pay?.toUpperCase()} transfer under-paid` });
      }
      // No log-level scan — the tx itself carries the value transfer. Buyer
      // is the tx sender by construction (`from` on the tx).
      txSender = String(txObj.from || receipt.from || '');
    } else {
      // ERC20 (USDC) — Transfer event from sender → treasury.
      const receiptResp = await fetch(rpcUrl, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ jsonrpc: '2.0', id: 1, method: 'eth_getTransactionReceipt', params: [txHash] }),
      });
      const receipt = (await receiptResp.json().catch(() => ({})))?.result;
      if (!receipt) return res.status(400).json({ error: 'Tx not found or not confirmed yet' });
      if (receipt.status !== '0x1') return res.status(400).json({ error: 'Tx failed on-chain' });

      const TRANSFER_TOPIC = '0xddf252ad1be2c89b69c2b068fc378daa952ba7f163c4a11628f55a4df523b3ef';
      let matched = false;
      for (const log of receipt.logs || []) {
        if (String(log.address || '').toLowerCase() !== expectedMint) continue;
        if (log.topics?.[0] !== TRANSFER_TOPIC) continue;
        const from = '0x' + log.topics[1].slice(-40);
        const to = '0x' + log.topics[2].slice(-40);
        if (to.toLowerCase() !== expectedTreasury) continue;
        const txSender = String(receipt.from || '').toLowerCase();
        if (from.toLowerCase() !== txSender) continue;
        const value = BigInt(log.data || '0x0');
        if (value < expectedAmount) continue;
        matched = true;
        break;
      }
      if (!matched) {
        return res.status(400).json({ error: 'Token transfer to treasury not found or under-paid' });
      }
      txSender = String(receipt.from || '');
    }

    const grant = db.db.transaction(() => {
      const duplicate = db.db.prepare('SELECT id FROM utility_purchases WHERE tx_hash = ?').get(txHash);
      if (duplicate) {
        const err = new Error('Purchase already redeemed');
        err.status = 409;
        throw err;
      }
      const applied = applyGameShopProduct(req.player.id, product, quantity, { chain: chainKey, payment: memoPayment });
      db.db.prepare(`
        INSERT INTO utility_purchases
          (player_id, utility, chain, tx_hash, payer, token, recipient, amount, usd_price_e6, duration_hours, shield_until)
        VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
      `).run(
        req.player.id,
        sku,
        chainKey,
        txHash,
        txSender || '',
        expectedMint || memoPayment.toUpperCase(),  // 'ETH' / 'MON' for native payments
        expectedTreasury,
        expectedAmount.toString(),
        (BigInt(product.usdPriceE6) * BigInt(quantity)).toString(),
        product.durationHours ? product.durationHours * quantity : null,
        applied.shield_until || null,
      );
      return applied;
    })();

    db.recordShopFunnelEvent({
      playerId: req.player.id,
      eventType: 'redeem_succeeded',
      sku,
      chain: chainKey,
      payment: memoPayment,
      token: expectedMint || memoPayment.toUpperCase(),
      quantity,
      usdPriceE6: (BigInt(product.usdPriceE6) * BigInt(quantity)).toString(),
      tokenAmount: expectedAmount.toString(),
      txHash,
      metadata: { latency_ms: Date.now() - redeemStartedAt, kind: memoKind },
    });
    res.json({
      success: true,
      product: gameShopProductsForClient().find((p) => p.id === product.id),
      quantity,
      chain: chainKey,
      payment: memoPayment,
      txHash,
      amount: expectedAmount.toString(),
      amountFormatted: unitsToDecimalString(expectedAmount, amountDecimals),
      ...grant,
    });
  } catch (err) {
    const message = err?.message || 'redeem failed';
    db.recordShopFunnelEvent({
      playerId: req.player.id,
      eventType: 'redeem_failed',
      chain: requestedChain || null,
      txHash: requestedTxHash || null,
      errorCode: String(err?.status || 500),
      errorMessage: message.slice(0, 180),
      metadata: { latency_ms: Date.now() - redeemStartedAt, route: '/shop/evm/redeem' },
    });
    res.status(err?.status || 500).json({ error: message.slice(0, 180) });
  }
});

// ---------- Game shop: Aptos (Decibel-side) USDC/APT transfer ----------

const APTOS_FULLNODE_DEFAULT = 'https://fullnode.mainnet.aptoslabs.com/v1';

function aptosFullnode() {
  return process.env.GAME_SHOP_APTOS_FULLNODE
    || process.env.APTOS_FULLNODE
    || APTOS_FULLNODE_DEFAULT;
}

async function aptosFetchTx(version) {
  const base = aptosFullnode().replace(/\/+$/, '');
  const apiKey = process.env.APTOS_NODE_API_KEY || process.env.DECIBEL_API_KEY;
  const headers = apiKey ? { Authorization: `Bearer ${apiKey}` } : {};
  const r = await fetch(`${base}/transactions/by_hash/${version}`, { headers });
  if (!r.ok) return null;
  return r.json().catch(() => null);
}

function buildAptosShopMemo({ sku, quantity, account, nonce, deadline, payment, amount, treasury, asset }) {
  return JSON.stringify({
    v: 1,
    chain: 'aptos',
    sku,
    qty: Number(quantity),
    acc: account,
    nonce,
    deadline: Number(deadline),
    pay: payment,
    amt: String(amount),
    to: treasury,
    asset,
  });
}

router.post('/shop/aptos/quote', auth, async (req, res) => {
  const quoteStartedAt = Date.now();
  const requestedSku = String(req.body?.sku || '').trim();
  const requestedPayment = String(req.body?.payment || 'usdc').toLowerCase();
  db.recordShopFunnelEvent({
    playerId: req.player.id,
    eventType: 'quote_requested',
    sku: requestedSku || null,
    chain: 'aptos',
    payment: requestedPayment,
    quantity: req.body?.quantity,
    metadata: { route: '/shop/aptos/quote' },
  });
  try {
    const rate = checkUtilityQuoteRateLimit(req);
    if (!rate.ok) {
      res.set('Retry-After', String(rate.retryAfterSec));
      return res.status(429).json({ error: 'Too many shop quote requests. Try again shortly.' });
    }

    const config = gameShopAptosConfig();
    if (!config.ready) return res.status(503).json({ error: 'Aptos game shop is not configured' });
    if (!config.saleActive && process.env.GAME_SHOP_REQUIRE_ACTIVE_QUOTE === '1') {
      return res.status(423).json({ error: 'Aptos game shop sale is not active' });
    }

    const sku = requestedSku;
    const product = GAME_SHOP_PRODUCTS[sku];
    if (!product) return res.status(400).json({ error: 'Unknown shop item' });
    if (isOwnedGameShopProduct(req.player.id, product)) {
      return res.status(409).json({ error: `${product.title || product.sku} already purchased` });
    }
    const quantity = parsePositiveInteger(req.body?.quantity, 1, product.maxQuantity || 10);

    const payment = requestedPayment;
    if (payment !== 'usdc' && payment !== 'apt') {
      return res.status(400).json({ error: 'Bad payment token (usdc or apt)' });
    }

    const buyer = String(req.body?.buyer || '').trim();
    if (!/^0x[0-9a-fA-F]{1,64}$/.test(buyer)) {
      return res.status(400).json({ error: 'Invalid Aptos buyer address' });
    }

    const usdPriceE6 = BigInt(product.usdPriceE6) * BigInt(quantity);
    const usdAmount = unitsToDecimalString(usdPriceE6, 6);

    let amount, decimals, asset, priceSource;
    if (payment === 'usdc') {
      // Aptos USDC = 6 decimals like Solana / Arbitrum native.
      decimals = 6;
      amount = usdToNativeUnits(usdAmount, '1', decimals);
      asset = config.usdcAddress;
      priceSource = 'USDC 1:1 USD';
    } else {
      // APT pricing via the same oracle hop NFT mint uses. APT FA = 8 decimals.
      decimals = 8;
      const aptUsd = await fetchNftUsdPrice('apt').catch(() => null);
      if (!aptUsd) return res.status(503).json({ error: 'APT price unavailable; try USDC' });
      amount = usdToNativeUnits(usdAmount, aptUsd, decimals);
      asset = '0xa';
      priceSource = `APT/USD ${aptUsd}`;
    }

    // Amount-salt anti-replay: like EVM, last 3 raw units come from a per-quote
    // nonce so two quotes can't share an on-chain Transfer fingerprint.
    const nonceRaw = crypto.randomBytes(16);
    const nonce = `0x${nonceRaw.toString('hex')}`;
    const salt = BigInt(nonceRaw.readUInt16BE(0)) % 1000n;
    amount = amount + salt;

    const ttlSeconds = Math.max(30, Math.min(900, Number(process.env.GAME_SHOP_QUOTE_TTL_SECONDS || 600)));
    const deadline = Math.floor(Date.now() / 1000) + ttlSeconds;
    const account = gameAccountHash(req.player.id);

    const memo = buildAptosShopMemo({
      sku: product.sku,
      quantity,
      account,
      nonce,
      deadline,
      payment,
      amount,
      treasury: config.treasury,
      asset,
    });
    const signature = signEvmShopMemo(memo); // same ed25519 server signer

    db.recordShopFunnelEvent({
      playerId: req.player.id,
      eventType: 'quote_succeeded',
      sku: product.sku,
      chain: 'aptos',
      payment,
      token: asset,
      quantity,
      usdPriceE6: usdPriceE6.toString(),
      tokenAmount: amount.toString(),
      priceSource,
      quoteId: nonce,
      metadata: { latency_ms: Date.now() - quoteStartedAt, buyer },
    });
    res.set('Cache-Control', 'no-store');
    res.json({
      chain: 'aptos',
      network: config.network,
      treasury: config.treasury,
      asset,
      payment,
      decimals,
      priceSource,
      product: gameShopProductsForClient().find((p) => p.id === product.id),
      quantity,
      amount: amount.toString(),
      amountFormatted: unitsToDecimalString(amount, decimals),
      usdAmount,
      nonce,
      account,
      deadline,
      memo,
      signature,
    });
  } catch (err) {
    const message = err?.message || 'quote failed';
    const status = /address|sku|quantity|item/i.test(message) ? 400 : 500;
    db.recordShopFunnelEvent({
      playerId: req.player.id,
      eventType: 'quote_failed',
      sku: requestedSku || null,
      chain: 'aptos',
      payment: requestedPayment,
      quantity: req.body?.quantity,
      errorCode: String(status),
      errorMessage: message.slice(0, 180),
      metadata: { latency_ms: Date.now() - quoteStartedAt, route: '/shop/aptos/quote' },
    });
    res.status(status).json({ error: message.slice(0, 180) });
  }
});

router.post('/shop/aptos/redeem', auth, async (req, res) => {
  const redeemStartedAt = Date.now();
  const requestedTxHash = String(req.body?.txHash || req.body?.signature || req.body?.hash || '').trim();
  db.recordShopFunnelEvent({
    playerId: req.player.id,
    eventType: 'redeem_requested',
    chain: 'aptos',
    txHash: requestedTxHash || null,
    metadata: { route: '/shop/aptos/redeem' },
  });
  try {
    const txHash = requestedTxHash;
    if (!/^0x[0-9a-fA-F]{64}$/.test(txHash)) {
      return res.status(400).json({ error: 'Bad Aptos tx hash' });
    }

    const existing = db.db.prepare('SELECT * FROM utility_purchases WHERE tx_hash = ?').get(txHash);
    if (existing) {
      if (existing.player_id !== req.player.id) return res.status(409).json({ error: 'Purchase already redeemed' });
      db.recordShopFunnelEvent({
        playerId: req.player.id,
        eventType: 'redeem_duplicate',
        sku: existing.utility,
        chain: 'aptos',
        payment: String(existing.token || '').toLowerCase(),
        token: existing.token,
        txHash,
        metadata: { latency_ms: Date.now() - redeemStartedAt, purchase_id: existing.id },
      });
      return res.json({
        success: true,
        alreadyRedeemed: true,
        product: GAME_SHOP_PRODUCTS[existing.utility] || null,
        shield_until: existing.shield_until || null,
        resources: db.getResources(req.player.id),
        ...ownedGameShopGrant(req.player.id, existing.utility),
      });
    }

    const config = gameShopAptosConfig();
    if (!config.ready) return res.status(503).json({ error: 'Aptos game shop is not configured' });

    const memo = String(req.body?.memo || '');
    const memoSignature = String(req.body?.serverSignature || req.body?.signature || '').trim();
    if (!memo || !memoSignature) return res.status(400).json({ error: 'Missing memo or signature' });
    if (!verifyEvmShopMemoSignature(memo, memoSignature)) {
      return res.status(403).json({ error: 'Bad memo signature' });
    }
    let memoData;
    try { memoData = JSON.parse(memo); } catch { return res.status(400).json({ error: 'Bad memo payload' }); }
    if (memoData?.v !== 1 || memoData?.chain !== 'aptos') {
      return res.status(400).json({ error: 'Invalid memo for Aptos shop' });
    }

    const nowSec = Math.floor(Date.now() / 1000);
    if (Number(memoData.deadline) < nowSec - 600) {
      return res.status(400).json({ error: 'Quote deadline expired' });
    }

    const expectedAccount = gameAccountHash(req.player.id);
    if (String(memoData.acc).toLowerCase() !== expectedAccount.toLowerCase()) {
      return res.status(403).json({ error: 'Purchase belongs to another game account' });
    }

    const sku = String(memoData.sku || '');
    const product = GAME_SHOP_PRODUCTS[sku];
    if (!product) return res.status(400).json({ error: 'Unknown purchased item' });
    const quantity = Number(memoData.qty);
    if (!Number.isSafeInteger(quantity) || quantity < 1 || quantity > (product.maxQuantity || 10)) {
      return res.status(400).json({ error: 'Bad purchase quantity' });
    }

    const payment = String(memoData.pay || 'usdc');
    if (payment !== 'usdc' && payment !== 'apt') {
      return res.status(400).json({ error: 'Bad payment token' });
    }
    const expectedAmount = BigInt(memoData.amt);
    const expectedAsset = normalizeAptosWallet(String(memoData.asset || '').toLowerCase());
    const expectedTreasury = normalizeAptosWallet(String(memoData.to || '').toLowerCase());
    const { aptosPrimaryFungibleStoreAddress } = require('./bridge_helpers');
    const expectedPrimaryStore = aptosPrimaryFungibleStoreAddress(expectedTreasury, expectedAsset);

    const tx = await aptosFetchTx(txHash);
    if (!tx) return res.status(400).json({ error: 'Tx not found or not confirmed' });
    if (tx.success !== true) return res.status(400).json({ error: 'Tx failed on-chain' });

    // Aptos events emitted by 0x1::primary_fungible_store::deposit (or
    // 0x1::coin::deposit for legacy CoinStore) on the recipient store
    // describe the asset transfer. We match deposit-into-treasury-store
    // events whose `metadata`/`store` ties back to our expected FA address
    // and accept the amount as the credited value. Belt-and-braces: we
    // also fall through to checking the legacy CoinStore deposit format
    // (chain still emits both during the FA migration window).
    let creditedAmount = 0n;
    const events = Array.isArray(tx.events) ? tx.events : [];
    for (const ev of events) {
      const t = String(ev.type || '');
      const data = ev.data || {};
      // Deposit on FA primary store (new model). The deposit event is
      // emitted on the recipient's store object. Modern Aptos APT events
      // include `store` but not `owner`, so match the derived primary store
      // address for the exact treasury + asset pair.
      if (t === '0x1::fungible_asset::Deposit' || t.endsWith('::fungible_asset::Deposit')) {
        const store = normalizeAptosWallet(data.store || '');
        const storeOwner = normalizeAptosWallet(data.owner || data.account || '');
        const metadata = normalizeAptosWallet(data.metadata || data.store_metadata || '');
        const amount = BigInt(data.amount || 0);
        if (
          (expectedPrimaryStore && store === expectedPrimaryStore)
          || (storeOwner === expectedTreasury && metadata === expectedAsset)
        ) {
          creditedAmount += amount;
        }
      }
      // Legacy CoinStore deposit (pre-FA APT or wrapped coins). We treat
      // the deposit event as crediting the treasury IFF the event guid's
      // account_address matches the treasury — that's the Aptos-native
      // way to tie an event to its owning resource without needing the
      // store→owner lookup we can't easily do from JSON.
      if (t === '0x1::coin::DepositEvent' || /::DepositEvent$/.test(t)) {
        const ownerAccount = String(ev.guid?.account_address || ev.guid?.id?.addr || '').toLowerCase();
        if (ownerAccount === expectedTreasury) {
          creditedAmount += BigInt(data.amount || 0);
        }
      }
    }

    // Fallback: if events lookup failed (RPC stripping or relayer), parse
    // the entry-function payload. We accept the canonical Aptos transfer
    // forms used by stock wallets so a Petra/Pontem signature still flows.
    if (creditedAmount === 0n) {
      const payload = tx.payload || {};
      const fn = String(payload.function || '');
      const args = Array.isArray(payload.arguments) ? payload.arguments : [];
      const isFaTransfer = fn === '0x1::primary_fungible_store::transfer'
        || fn === '0x1::aptos_account::transfer_fungible_assets';
      const isCoinTransfer = fn === '0x1::aptos_account::transfer'
        || fn === '0x1::coin::transfer'
        || fn === '0x1::aptos_account::transfer_coins';
      if (isFaTransfer) {
        // args[0] = metadata (asset), args[1] = recipient, args[2] = amount.
        // Variants differ; tolerate both orderings.
        const [a0, a1] = args.map((v) => normalizeAptosWallet(v || ''));
        if ((a0 === expectedAsset && a1 === expectedTreasury) || (a1 === expectedAsset && a0 === expectedTreasury)) {
          creditedAmount = BigInt(args[2] || 0);
        } else if (a0 === expectedTreasury) {
          // older fungible_asset::transfer signature: (recipient, amount).
          creditedAmount = BigInt(args[1] || 0);
        }
      } else if (isCoinTransfer) {
        // (recipient, amount)
        if (normalizeAptosWallet(args[0] || '') === expectedTreasury) {
          creditedAmount = BigInt(args[1] || 0);
        }
      }
    }

    if (creditedAmount < expectedAmount) {
      return res.status(400).json({ error: 'Aptos transfer to treasury not found or under-paid' });
    }

    const grant = db.db.transaction(() => {
      const duplicate = db.db.prepare('SELECT id FROM utility_purchases WHERE tx_hash = ?').get(txHash);
      if (duplicate) {
        const err = new Error('Purchase already redeemed');
        err.status = 409;
        throw err;
      }
      const applied = applyGameShopProduct(req.player.id, product, quantity, { chain: 'aptos', payment });
      db.db.prepare(`
        INSERT INTO utility_purchases
          (player_id, utility, chain, tx_hash, payer, token, recipient, amount, usd_price_e6, duration_hours, shield_until)
        VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
      `).run(
        req.player.id,
        sku,
        'aptos',
        txHash,
        String(tx.sender || ''),
        payment === 'usdc' ? expectedAsset : 'APT',
        expectedTreasury,
        expectedAmount.toString(),
        (BigInt(product.usdPriceE6) * BigInt(quantity)).toString(),
        product.durationHours ? product.durationHours * quantity : null,
        applied.shield_until || null,
      );
      return applied;
    })();

    db.recordShopFunnelEvent({
      playerId: req.player.id,
      eventType: 'redeem_succeeded',
      sku,
      chain: 'aptos',
      payment,
      token: payment === 'usdc' ? expectedAsset : 'APT',
      quantity,
      usdPriceE6: (BigInt(product.usdPriceE6) * BigInt(quantity)).toString(),
      tokenAmount: expectedAmount.toString(),
      txHash,
      metadata: { latency_ms: Date.now() - redeemStartedAt },
    });
    res.json({
      success: true,
      product: gameShopProductsForClient().find((p) => p.id === product.id),
      quantity,
      chain: 'aptos',
      txHash,
      payment,
      amount: expectedAmount.toString(),
      ...grant,
    });
  } catch (err) {
    const message = err?.message || 'redeem failed';
    db.recordShopFunnelEvent({
      playerId: req.player.id,
      eventType: 'redeem_failed',
      chain: 'aptos',
      txHash: requestedTxHash || null,
      errorCode: String(err?.status || 500),
      errorMessage: message.slice(0, 180),
      metadata: { latency_ms: Date.now() - redeemStartedAt, route: '/shop/aptos/redeem' },
    });
    res.status(err?.status || 500).json({ error: message.slice(0, 180) });
  }
});

// Per-DEX canonical lookup. Each (wallet, dex) pair is unique post-migration,
// so this returns at most one row. Uses the same Aptos zero-padding fan-out
// as the wallet-only variant so a user who entered an unpadded Aptos
// address on one device still matches their padded record from another.
function getPlayerByWalletAndDexAnyForm(wallet, dex) {
  const candidates = walletLookupCandidates(wallet);
  if (!candidates.length) return null;
  const placeholders = candidates.map(() => '?').join(',');
  return db.db.prepare(
    `SELECT * FROM players WHERE wallet IN (${placeholders}) AND dex = ? LIMIT 1`
  ).get(...candidates, dex);
}

// Return ALL DEX-specific accounts a wallet owns. Used by the wallet-only
// login probe to tell the client which DEX rows already exist so the picker
// can grey out "create new account" hints. Sorted by trophies DESC so the
// user's most-played DEX appears first if the client decides to fall back
// to "any account".
function getAllPlayersByWalletAnyForm(wallet) {
  const candidates = walletLookupCandidates(wallet);
  if (!candidates.length) return [];
  const placeholders = candidates.map(() => '?').join(',');
  return db.db.prepare(
    `SELECT * FROM players WHERE wallet IN (${placeholders}) ORDER BY COALESCE(trophies, 0) DESC, id DESC`
  ).all(...candidates);
}

// ---------- Auth Middleware ----------

// In-memory throttle so the heartbeat UPDATE doesn't fire on every single
// authenticated request — the polling cycle hits /api/state, /api/futures/*,
// /api/tasks etc. several times per second per active user. Bumping at most
// once per 60s per player is enough resolution for the admin "online now"
// (5-min window) + "active 24h" / "active 7d" counters, and keeps the
// players table out of the WAL hot path.
const _lastSeenBumpAt = new Map(); // playerId -> Date.now()
const LAST_SEEN_THROTTLE_MS = 60_000;

function auth(req, res, next) {
  const token = req.headers['x-token'];
  if (!token) return res.status(401).json({ error: 'Missing x-token header' });
  const player = db.authenticatePlayer(token);
  if (!player) return res.status(401).json({ error: 'Invalid token' });
  req.player = player;
  // Heartbeat — bumps last_seen_at server-side. Powers the admin panel's
  // online/active counters (replaces the never-wired WebSocket path).
  // Throttled per-player so a chatty client doesn't write-amp the table.
  try {
    const now = Date.now();
    const prev = _lastSeenBumpAt.get(player.id) || 0;
    if (now - prev >= LAST_SEEN_THROTTLE_MS) {
      _lastSeenBumpAt.set(player.id, now);
      db.stmts.bumpPlayerLastSeen.run(player.id);
      db.stmts.insertPlayerActivity.run(player.id, 'heartbeat', 'api');
    }
  } catch { /* never block auth on a write failure */ }
  next();
}

function extractAgentKey(req) {
  const authHeader = String(req.headers.authorization || '');
  const bearer = authHeader.match(/^Bearer\s+(.+)$/i);
  if (bearer) return bearer[1].trim();
  return String(req.headers['x-ai-agent-key'] || '').trim();
}

function agentAuth(req, res, next) {
  const session = db.authenticateAiAgentKey(extractAgentKey(req));
  if (!session) return res.status(401).json({ error: 'Invalid or missing AI agent key' });
  req.agentSession = session;
  next();
}

// ==================== CLIENT LOGS (no auth) ====================
// Per-IP rate limit — no auth, so only the IP is usable as a key. Bucket
// cleans up expired entries every 5 minutes to bound memory growth under
// abuse. Previously unprotected: a flood of 10k/s could DoS the server's
// stdout / log sink.
const CLIENT_LOG_WINDOW_MS = 60_000;
const CLIENT_LOG_BATCH_MAX = 50;
const CLIENT_LOG_RETENTION_DAYS = 7;
const CLIENT_LOG_MAX_PER_WINDOW = 3000;  // bumped 30 → 3000 (100×) per user request
const clientLogBuckets = new Map(); // ip → { count, resetAt }
const insertClientLog = db.db.prepare(`
  INSERT INTO client_logs
    (player_id, ip, level, source, url, ua, message, stack, payload)
  VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)
`);
const pruneClientLogs = db.db.prepare(
  `DELETE FROM client_logs WHERE created_at < datetime('now', ?)`
);
const insertClientLogBatch = db.db.transaction((rows) => {
  for (const row of rows) {
    insertClientLog.run(
      row.player_id, row.ip, row.level, row.source, row.url,
      row.ua, row.message, row.stack, row.payload
    );
  }
});
const insertReplayTelemetry = db.db.prepare(`
  INSERT INTO replay_telemetry
    (player_id, battle_session_id, replay_label, attacker_name, expected_result,
     expected_duration, actual_elapsed, actual_wall_elapsed, summary, events)
  VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
`);
const insertUserFeedback = db.db.prepare(`
  INSERT INTO user_feedback
    (player_id, kind, message, contact_type, contact_value, page_url, ua, viewport, ip)
  VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)
`);

function clampText(v, max) {
  if (v == null) return null;
  const s = typeof v === 'string' ? v : JSON.stringify(v);
  return String(s).slice(0, max);
}

function normalizeClientLevel(v) {
  const s = String(v || 'info').toLowerCase();
  if (['log', 'info', 'warn', 'error', 'debug', 'unhandledrejection', 'onerror'].includes(s)) return s;
  return s.replace(/[^a-z0-9_-]/g, '').slice(0, 24) || 'info';
}

function normalizeStoredClientLog(row) {
  const message = String(row.message || '');
  const payload = String(row.payload || '');
  if (message === 'Mobile Wallet Adapter was registered as a Standard Wallet. The Wallet Adapter for Mobile Wallet Adapter can be removed from your app.') {
    return null;
  }
  if (message.includes('/api/agent-events/pending failed: Failed to fetch')) {
    return { ...row, level: 'debug', source: 'fetch.noise' };
  }
  if (message.includes('/api/players/login-wallet -> 404')
    && payload.includes('No account found for this wallet on this DEX')) {
    return { ...row, level: 'debug', source: 'fetch.expected_http_status' };
  }
  if (message.includes('funding/overview?perMarketLimit=2')
    && (message.includes('Failed to fetch') || message.includes('signal is aborted'))) {
    return { ...row, level: 'debug', source: 'fetch.transient' };
  }
  if (message.includes('http://localhost/')
    || message.includes('wallet websocket at ws://localhost:')
    || message.includes('Local Network Access')) {
    return { ...row, level: 'debug', source: 'wallet.local_network' };
  }
  if (message.includes('/rpc/solana') && message.includes('signal is aborted')) {
    return { ...row, level: 'debug', source: 'fetch.aborted' };
  }
  if (message.includes('/api/nft/demon-king/sync failed: signal is aborted')) {
    return { ...row, level: 'debug', source: 'fetch.aborted' };
  }
  return row;
}

function clientLogRateOk(ip, n) {
  const now = Date.now();
  const b = clientLogBuckets.get(ip);
  if (b && b.resetAt > now) {
    if (b.count + n > CLIENT_LOG_MAX_PER_WINDOW) return false;
    b.count += n;
    return true;
  }
  clientLogBuckets.set(ip, { count: n, resetAt: now + CLIENT_LOG_WINDOW_MS });
  return true;
}

setInterval(() => {
  const now = Date.now();
  for (const [k, v] of clientLogBuckets) if (v.resetAt < now) clientLogBuckets.delete(k);
  try { pruneClientLogs.run(`-${CLIENT_LOG_RETENTION_DAYS} days`); } catch {}
}, 5 * 60_000).unref?.();

// Public client-log ingestion is non-critical and can be abused for DoS, so
// persist only bounded batches and leave full details to encrypted diagnostics.
router.post('/client-log', (req, res) => {
  try { pruneClientLogs.run(`-${CLIENT_LOG_RETENTION_DAYS} days`); } catch {}
  const ip = clampText(req.headers['x-real-ip'] || req.ip || 'anon', 64);
  const rawEvents = Array.isArray(req.body?.events) ? req.body.events : [req.body || {}];
  const events = rawEvents.slice(0, CLIENT_LOG_BATCH_MAX);
  if (!clientLogRateOk(ip, events.length)) return res.status(429).json({ ok: false });
  let playerId = null;
  const token = req.headers['x-token'];
  if (typeof token === 'string' && token.length > 10) {
    try {
      const player = db.authenticatePlayer(token);
      if (player) playerId = player.id;
    } catch {}
  }

  const rows = events.map((ev) => normalizeStoredClientLog({
    player_id: playerId,
    ip,
    level: normalizeClientLevel(ev.level),
    source: clampText(ev.source, 64),
    url: clampText(ev.url, 512),
    ua: clampText(ev.ua, 256),
    message: clampText(ev.message || ev.msg || '', 2048) || '(empty)',
    stack: clampText(ev.stack, 4096),
    payload: ev.payload == null ? null : clampText(ev.payload, 8192),
  })).filter(Boolean);
  if (rows.length === 0) return res.json({ ok: true, stored: 0 });
  try {
    insertClientLogBatch(rows);
    res.json({ ok: true, stored: rows.length });
  } catch (e) {
    console.warn('[client-log] insert failed:', e.message);
    res.status(500).json({ ok: false });
  }
});

router.all('/client-log', (_req, res) => {
  res.status(204).end();
});

const FEEDBACK_WINDOW_MS = 10 * 60_000;
const FEEDBACK_MAX_PER_WINDOW = 5;
const feedbackBuckets = new Map(); // playerId -> { count, resetAt }
const FEEDBACK_KINDS = new Set(['problem', 'feedback']);
const FEEDBACK_CONTACT_TYPES = new Set(['email', 'twitter', 'telegram', 'discord']);

function feedbackRateOk(playerId) {
  const now = Date.now();
  const b = feedbackBuckets.get(playerId);
  if (b && b.resetAt > now) {
    if (b.count >= FEEDBACK_MAX_PER_WINDOW) return false;
    b.count += 1;
    return true;
  }
  feedbackBuckets.set(playerId, { count: 1, resetAt: now + FEEDBACK_WINDOW_MS });
  return true;
}

setInterval(() => {
  const now = Date.now();
  for (const [k, v] of feedbackBuckets) if (v.resetAt < now) feedbackBuckets.delete(k);
}, 5 * 60_000).unref?.();

router.post('/feedback', auth, (req, res) => {
  if (!feedbackRateOk(req.player.id)) return res.status(429).json({ error: 'Too many feedback messages. Try again later.' });
  const body = req.body || {};
  const kindRaw = String(body.kind || 'feedback').toLowerCase();
  const kind = FEEDBACK_KINDS.has(kindRaw) ? kindRaw : 'feedback';
  const contactTypeRaw = String(body.contact_type || body.contactType || '').toLowerCase();
  const contactType = FEEDBACK_CONTACT_TYPES.has(contactTypeRaw) ? contactTypeRaw : '';
  const message = String(clampText(body.message, 2000) || '').trim();
  const contactValue = String(clampText(body.contact_value || body.contact || '', 160) || '').trim();
  if (message.length < 6) return res.status(400).json({ error: 'Describe the issue or feedback in a few words.' });
  if (!contactType) return res.status(400).json({ error: 'Choose a contact type.' });
  if (contactValue.length < 2) return res.status(400).json({ error: 'Add your contact handle.' });

  const ip = clampText(req.headers['x-real-ip'] || req.ip || 'anon', 64);
  const pageUrl = clampText(body.page_url || body.url || '', 512);
  const ua = clampText(req.headers['user-agent'] || body.ua || '', 512);
  const viewport = clampText(body.viewport || body.metadata?.viewport || '', 80);
  try {
    const result = insertUserFeedback.run(
      req.player.id,
      kind,
      message,
      contactType,
      contactValue,
      pageUrl,
      ua,
      viewport,
      ip
    );
    addLog('feedback', 'Player feedback submitted', {
      id: result.lastInsertRowid,
      player: req.player.name,
      kind,
      contact_type: contactType,
    });
    res.json({ ok: true, id: result.lastInsertRowid });
  } catch (e) {
    console.warn('[feedback] insert failed:', e.message);
    res.status(500).json({ error: 'Failed to save feedback' });
  }
});

router.post('/replay-telemetry', (req, res) => {
  let player = null;
  try {
    const token = req.headers['x-token'];
    if (typeof token === 'string' && token.length > 10) {
      player = db.authenticatePlayer(token);
    }
  } catch {}
  if (!player) return res.status(401).json({ ok: false, error: 'Invalid token' });

  const body = req.body || {};
  try {
    const info = body.replay || {};
    const expectedDuration = Number(info.expected_duration ?? body.expected_duration ?? 0) || 0;
    const actualElapsed = Number(info.actual_elapsed ?? body.actual_elapsed ?? 0) || 0;
    const actualWallElapsed = Number(info.actual_wall_elapsed ?? body.actual_wall_elapsed ?? 0) || 0;
    const battleSessionId = clampText(info.battle_session_id || body.battle_session_id, 128);
    const replayLabel = clampText(info.replay_label || body.replay_label, 128);
    const summary = body.summary || {};
    insertReplayTelemetry.run(
      player.id,
      battleSessionId,
      replayLabel,
      clampText(info.attacker_name || body.attacker_name, 128),
      clampText(info.expected_result || body.expected_result, 32),
      expectedDuration,
      actualElapsed,
      actualWallElapsed,
      clampText(summary, 100_000),
      clampText(body.events || [], 1_500_000)
    );
    const simDiff = actualElapsed - expectedDuration;
    const wallDiff = actualWallElapsed - expectedDuration;
    if (Math.abs(simDiff) >= 1.5 || Math.abs(wallDiff) >= 2.5) {
      const counts = summary && typeof summary === 'object' ? summary.counts : null;
      console.warn('[replay-telemetry] drift', {
        battle_session_id: battleSessionId,
        replay_label: replayLabel,
        expected_duration: expectedDuration,
        actual_elapsed: actualElapsed,
        actual_wall_elapsed: actualWallElapsed,
        sim_diff: Number(simDiff.toFixed(2)),
        wall_diff: Number(wallDiff.toFixed(2)),
        counts,
      });
    }
    res.json({ ok: true });
  } catch (e) {
    console.warn('[replay-telemetry] insert failed:', e.message);
    res.status(500).json({ ok: false });
  }
});

// ==================== PLAYERS ====================

// Register a new player (or recover existing account by wallet)
// Set DEX preference (pacifica | avantis | decibel | gmx). Called after
// register or from RegisterPanel when the user switches DEX pre-connect.
// The value is used by leaderboard badges and by /api/futures/* routing.
// Without `gmx` in this set, the registration handler silently drops the
// requested dex on the floor and the player_row keeps its DEFAULT
// 'pacifica' — which is exactly the bug that produced phantom Pacifica
// accounts whenever a user picked GMX in the picker (the chosen DEX never
// reached the database).
const VALID_DEXES = new Set(['pacifica', 'avantis', 'decibel', 'gmx', 'monad', 'phoenix', 'hyperliquid', 'risex', 'nado', 'hibachi', 'hotstuff', 'grvt', 'katana', 'gmtrade']);
// DEXes whose trade history is indexed by the futures rewards worker into
// the trade_history table (server-futures/futures.db). GMX joined Phase 3
// once gmx-rewards-worker.js shipped (subsquid GraphQL → trade_history
// rows with verified_source='worker'); we now include it in this set so
// quest progression and per-DEX baselines pick up GMX trades.
const REWARD_INDEXED_DEXES = new Set(['avantis', 'decibel', 'gmx', 'monad', 'phoenix', 'hyperliquid', 'risex', 'nado', 'hibachi', 'hotstuff', 'grvt', 'katana', 'gmtrade']);
// (Removed: `currentFuturesRewardBaseline` and `ensureTradingRewardRow`
// helpers — dead code surfaced by audit. The intended use was to seed
// `trading_rewards.last_trade_id` from MAX(trade_history.id) so a fresh
// player wouldn't credit historical trades, but the helpers were never
// wired into any code path. /claim-gold and the task verifier now read
// trade_history rows above `last_trade_id` directly, defaulting to 0
// (legacy behaviour). If we ever need to backfill, restore from git.)

// /players/set-dex is now a no-op endpoint that returns the player's
// existing DEX. Pre-migration this UPDATEd the dex column on the same
// row, but DEX is now part of identity ((wallet, dex) UNIQUE) — switching
// DEX means logging into a different account, handled by the client via
// clearing its token and re-running register/login-wallet against the
// new DEX. Keeping the endpoint as a no-op rather than deleting it
// prevents 404s from stale clients during the deploy window; once all
// clients are on the new auth flow we can drop it.
router.post('/players/set-dex', auth, (req, res) => {
  const { dex } = req.body;
  if (!VALID_DEXES.has(dex)) {
    return res.status(400).json({ error: 'dex must be "pacifica", "avantis", "decibel", "gmx", "monad", "phoenix", "hyperliquid", "risex", "nado", "hibachi", "hotstuff", "grvt", "katana" or "gmtrade"' });
  }
  if (dex !== req.player.dex) {
    logAuth('set-dex no-op (DEX is now per-account; client should switch via login-wallet)', {
      player_id: req.player.id, current_dex: req.player.dex, requested_dex: dex,
    });
  }
  res.json({ success: true, dex: req.player.dex, note: 'DEX is per-account; ignore field' });
});

function normalizeSeekerText(value, max = 128) {
  if (value === null || value === undefined) return '';
  return String(value).trim().replace(/[\x00-\x1F\x7F]/g, '').slice(0, max);
}

function normalizeSeekerCapability(body = {}) {
  const source = normalizeSeekerText(
    body.seeker_source ?? body.seekerSource ?? body.source ?? body.walletSource ?? '',
    64
  );
  const seekerId = normalizeSeekerText(
    body.seeker_id ?? body.seekerId ?? body.skr_handle ?? body.skrHandle ?? body.skr ?? '',
    128
  );
  const rawFlag = body.is_seeker ?? body.isSeeker ?? body.seeker ?? body.solana_mobile ?? body.solanaMobile;
  const sourceLooksMobile = /seeker|saga|solana[_ -]?mobile|mobile wallet adapter|mwa/i.test(source);
  const isSeeker = rawFlag === true || rawFlag === 1 || rawFlag === '1'
    || String(rawFlag).toLowerCase() === 'true'
    || !!seekerId
    || sourceLooksMobile;
  if (!isSeeker) return null;
  return {
    seeker_id: seekerId || '',
    seeker_source: source || 'client',
  };
}

function markPlayerSeekerIfPresent(playerId, body) {
  const seeker = normalizeSeekerCapability(body);
  if (!playerId || !seeker) return null;
  db.stmts.markPlayerSeeker.run(seeker.seeker_id, seeker.seeker_source, playerId);
  return seeker;
}

router.post('/players/register', (req, res) => {
  const { name, wallet, dex, fid } = req.body;
  const requestedDex = VALID_DEXES.has(dex) ? dex : 'pacifica';
  const seekerCapability = normalizeSeekerCapability(req.body || {});

  // ── Per-DEX canonical lookup ────────────────────────────────────────
  // Each (wallet, dex) is now its own player row. The user's Avantis
  // progress and GMX progress live on separate rows even though both use
  // the same EVM wallet. So we only treat a row as "this is your account"
  // when BOTH the wallet AND the requested DEX match.
  if (wallet) {
    const localGuestWallet = isLocalGuestWallet(wallet);
    let existing = getPlayerByWalletAndDexAnyForm(wallet, requestedDex);

    // Migration path for Farcaster placeholder rows (wallet = `fc_<fid>`).
    // Same dex must match — if the placeholder was created on Pacifica and
    // the user is now requesting Avantis, we let the new-row branch run
    // and the placeholder stays for the original DEX.
    if (!existing && fid) {
      const placeholder = 'fc_' + String(fid);
      const placeholderRow = db.db.prepare(
        'SELECT * FROM players WHERE wallet = ? AND dex = ? ORDER BY id DESC LIMIT 1'
      ).get(placeholder, requestedDex);
      if (placeholderRow) {
        db.db.prepare('UPDATE players SET wallet = ? WHERE id = ?').run(wallet, placeholderRow.id);
        placeholderRow.wallet = wallet;
        existing = placeholderRow;
        logAuth('FC placeholder adopted', { fid, wallet, dex: requestedDex, player_id: existing.id });
      }
    }

    if (existing) {
      // Optional rename on re-login (same as before, scoped to this row).
      const trimmed = normalizePlayerNameInput(name);
      const looksAutoDerived = /^player_[0-9a-f]{4,}$/i.test(trimmed);
      if (!localGuestWallet && trimmed.length >= 2 && !looksAutoDerived && trimmed !== existing.name) {
        const validation = validatePlayerNameInput(trimmed);
        if (validation.error) return res.status(400).json({ error: validation.error });
        const clash = db.db.prepare('SELECT id FROM players WHERE lower(name) = lower(?) AND id != ? LIMIT 1').get(validation.name, existing.id);
        if (clash) return res.status(409).json({ error: 'Nickname is already taken' });
        db.db.prepare('UPDATE players SET name = ? WHERE id = ?').run(validation.name, existing.id);
        existing.name = validation.name;
      }
      // No more dex-switching on the existing row — DEX is now part of
      // identity. If the caller wanted a different DEX they fall through
      // to the new-row branch above.
      if (seekerCapability) {
        db.stmts.markPlayerSeeker.run(seekerCapability.seeker_id, seekerCapability.seeker_source, existing.id);
      }
      const state = db.getFullPlayerState(existing.id);
      return res.json({ ...state, token: existing.token });
    }
  }

  // ── New-row branch ──────────────────────────────────────────────────
  const validation = validatePlayerNameInput(
    isLocalGuestWallet(wallet) ? localGuestNameFromWallet(wallet) : name
  );
  if (validation.error) {
    return res.status(400).json({ error: validation.error });
  }
  const trimmed = isLocalGuestWallet(wallet)
    ? makeUniquePlayerName(validation.name)
    : validation.name;
  const taken = db.db.prepare('SELECT id FROM players WHERE lower(name) = lower(?) LIMIT 1').get(trimmed);
  if (taken) {
    return res.status(409).json({ error: 'Nickname is already taken' });
  }
  let result = null;
  try {
    result = db.registerPlayer(trimmed);
  } catch (e) {
    if (String(e?.message || '').includes('UNIQUE')) {
      return res.status(409).json({ error: 'Nickname is already taken' });
    }
    throw e;
  }
  // New rows start as dex='pacifica'. If this wallet already has a Pacifica
  // account and the user creates Phoenix, wallet-first updates would collide
  // with UNIQUE(wallet, dex), so set the requested dex in the wallet update.
  if (wallet) {
    db.db.prepare('UPDATE players SET dex = ?, wallet = ? WHERE id = ?').run(requestedDex, wallet, result.id);
  } else {
    db.db.prepare('UPDATE players SET dex = ? WHERE id = ?').run(requestedDex, result.id);
  }
  if (seekerCapability) {
    db.stmts.markPlayerSeeker.run(seekerCapability.seeker_id, seekerCapability.seeker_source, result.id);
  }
  const state = db.getFullPlayerState(result.id);
  logAuth('Player registered', { name: trimmed, wallet: wallet || null, dex: requestedDex });
  res.json({ ...state, token: result.token });
});

router.patch('/players/name', auth, (req, res) => {
  const validation = validatePlayerNameInput(req.body?.name);
  if (validation.error) return res.status(400).json({ error: validation.error });
  const nextName = validation.name;
  if (nextName === req.player.name) {
    return res.json({ ok: true, name: req.player.name });
  }
  const clash = db.db.prepare('SELECT id FROM players WHERE lower(name) = lower(?) AND id != ? LIMIT 1').get(nextName, req.player.id);
  if (clash) return res.status(409).json({ error: 'Nickname is already taken' });
  try {
    db.db.prepare('UPDATE players SET name = ? WHERE id = ?').run(nextName, req.player.id);
  } catch (e) {
    if (String(e?.message || '').includes('UNIQUE')) {
      return res.status(409).json({ error: 'Nickname is already taken' });
    }
    throw e;
  }
  logAuth('Player renamed', { player_id: req.player.id, from: req.player.name, to: nextName });
  res.json({ ok: true, name: nextName });
});

router.post('/players/device-capability', auth, (req, res) => {
  const seeker = markPlayerSeekerIfPresent(req.player.id, req.body || {});
  if (!seeker) {
    return res.json({
      ok: true,
      seeker_marked: false,
      is_seeker: !!Number(req.player.is_seeker || 0),
      seeker_id: req.player.seeker_id || null,
    });
  }
  logAuth('Seeker capability marked', {
    player_id: req.player.id,
    source: seeker.seeker_source,
    seeker_id: seeker.seeker_id || null,
  });
  res.json({
    ok: true,
    seeker_marked: true,
    is_seeker: true,
    seeker_id: seeker.seeker_id || req.player.seeker_id || null,
    seeker_source: seeker.seeker_source,
  });
});

// Login (get state by token)
router.get('/players/me', auth, (req, res) => {
  const state = db.getFullPlayerState(req.player.id);
  res.json(state);
});

router.get('/players/ai-keys', auth, (req, res) => {
  res.json({ keys: db.listAiAgentKeys(req.player.id) });
});

router.post('/players/ai-keys', auth, (req, res) => {
  const name = typeof req.body?.name === 'string' ? req.body.name : 'AI Agent';
  const result = db.createAiAgentKey(req.player.id, name);
  if (result.error) return res.status(400).json(result);
  logAuth('AI agent key created', { player_id: req.player.id, key_id: result.id });
  res.json(result);
});

router.delete('/players/ai-keys/:id', auth, (req, res) => {
  const result = db.revokeAiAgentKey(req.player.id, req.params.id);
  if (result.error) return res.status(404).json(result);
  logAuth('AI agent key revoked', { player_id: req.player.id, key_id: req.params.id });
  res.json(result);
});

router.get('/ai-chat/status', auth, async (req, res) => {
  const startedAt = Date.now();
  const traceId = String(req.headers['x-request-id'] || crypto.randomUUID()).slice(0, 80);
  const provisionParam = String(req.query?.provision || req.query?.start || '').trim().toLowerCase();
  const shouldProvision = ['1', 'true', 'yes', 'start'].includes(provisionParam);
  res.set('Cache-Control', 'no-store');
  try {
    const agent = db.getOrCreateHermesAgent(req.player.id);
    const quota = getAiMessageQuotaStatus(req.player.id);
    if (agent.error) {
      return res.json({ ok: false, error: agent.error, agent: null, quota, http_status: 400 });
    }
    if (!hermesClient.configured()) {
      const state = db.markHermesAgentState(req.player.id, {
        status: 'unconfigured',
        error: 'Hermes orchestrator is not configured',
      });
      return res.json({
        ok: false,
        error: 'Hermes orchestrator is not configured',
        agent: state,
        quota,
        http_status: 503,
      });
    }
    let status = await hermesClient.getStatus(req.player.id);
    const wasRunning = !!status?.player?.running;
    if (!status?.player?.running && shouldProvision) {
      logAiChatServer('status_provision_start', {
        trace_id: traceId,
        player_id: req.player.id,
        player_name: req.player.name,
      });
      status = await hermesClient.provision(req.player, agent.mcp_key);
    }
    const state = db.markHermesAgentState(req.player.id, {
      status: status?.player?.running ? 'running' : 'ready',
      orchestrator: status?.player || status,
      provisioned: !!status?.player,
    });
    logAiChatServer('status_ok', {
      trace_id: traceId,
      player_id: req.player.id,
      duration_ms: Date.now() - startedAt,
      provision_requested: shouldProvision,
      was_running: wasRunning,
      running: !!status?.player?.running,
      port: status?.player?.port || null,
      model_chain: status?.player?.model_chain || null,
      quota: getAiMessageQuotaStatus(req.player.id),
    });
    res.json({ ok: true, agent: state, hermes: status, quota: getAiMessageQuotaStatus(req.player.id) });
  } catch (err) {
    const state = db.markHermesAgentState(req.player.id, { status: 'error', error: err.message });
    logAiChatServer('status_error', {
      trace_id: traceId,
      player_id: req.player.id,
      duration_ms: Date.now() - startedAt,
      status_code: err.status || 500,
      error: aiChatPreview(err.message, 700),
    });
    res.json({
      ok: false,
      error: err.message,
      agent: state,
      quota: getAiMessageQuotaStatus(req.player.id),
      http_status: err.status || 500,
    });
  }
});

router.get('/ai-chat/quota', auth, (req, res) => {
  res.set('Cache-Control', 'no-store');
  res.json({ ok: true, quota: getAiMessageQuotaStatus(req.player.id) });
});

router.get('/ai-jobs', auth, (req, res) => {
  res.set('Cache-Control', 'no-store');
  res.json({
    ok: true,
    jobs: hermesJobs.listJobs(req.player.id),
    quota: getAiMessageQuotaStatus(req.player.id),
  });
});

router.post('/ai-jobs', auth, (req, res) => {
  res.set('Cache-Control', 'no-store');
  const result = hermesJobs.createJob(req.player.id, req.body || {});
  if (!result.ok) return res.status(400).json(result);
  res.json({
    ...result,
    jobs: hermesJobs.listJobs(req.player.id),
    quota: getAiMessageQuotaStatus(req.player.id),
  });
});

router.patch('/ai-jobs/:id', auth, (req, res) => {
  res.set('Cache-Control', 'no-store');
  const result = hermesJobs.updateJob(req.player.id, req.params.id, req.body || {});
  if (!result.ok) return res.status(404).json(result);
  res.json({
    ...result,
    jobs: hermesJobs.listJobs(req.player.id),
    quota: getAiMessageQuotaStatus(req.player.id),
  });
});

router.delete('/ai-jobs/:id', auth, (req, res) => {
  res.set('Cache-Control', 'no-store');
  const result = hermesJobs.deleteJob(req.player.id, req.params.id);
  if (!result.ok) return res.status(404).json({ ok: false, error: 'Job not found.' });
  res.json({ ok: true, jobs: hermesJobs.listJobs(req.player.id) });
});

router.post('/ai-jobs/:id/run-now', auth, (req, res) => {
  res.set('Cache-Control', 'no-store');
  const result = hermesJobs.runNow(req.player.id, req.params.id);
  if (!result.ok) return res.status(400).json(result);
  res.json({
    ...result,
    jobs: hermesJobs.listJobs(req.player.id),
    quota: getAiMessageQuotaStatus(req.player.id),
  });
});

router.get('/ai-jobs/:id/runs', auth, (req, res) => {
  res.set('Cache-Control', 'no-store');
  const result = hermesJobs.listRuns(req.player.id, req.params.id, req.query?.limit);
  if (!result.ok) return res.status(404).json(result);
  res.json(result);
});

function normalizeAiChatHistory(history) {
  if (!Array.isArray(history)) return [];
  return history
    .map((item) => {
      const role = item?.role === 'assistant' ? 'assistant' : item?.role === 'user' ? 'user' : '';
      const text = typeof item?.text === 'string' ? item.text.trim().slice(0, 1000) : '';
      return role && text ? { role, text } : null;
    })
    .filter(Boolean)
    .slice(-4);
}

function normalizeAiTradeSettings(value) {
  if (!value || typeof value !== 'object') return null;
  if (String(value.dex || '').toLowerCase() !== 'avantis') return null;
  const mode = value.collateral_limit_mode === 'usdc' ? 'usdc' : 'percent';
  const num = (key, min, max, fallback) => {
    const n = Number(value[key]);
    const safe = Number.isFinite(n) ? n : fallback;
    return Math.max(min, Math.min(max, safe));
  };
  return {
    dex: 'avantis',
    collateral_limit_mode: mode,
    max_balance_pct: Number(num('max_balance_pct', 1, 100, 100).toFixed(2)),
    max_collateral_usd: Number(num('max_collateral_usd', 1, 1000, 100).toFixed(2)),
    effective_max_collateral_usd: Number(num('effective_max_collateral_usd', 0.01, 1000, 100).toFixed(6)),
    max_leverage: Number(num('max_leverage', 1, 1000, 50).toFixed(2)),
    effective_max_leverage: Number(num('effective_max_leverage', 1, 1000, 50).toFixed(2)),
    effective_max_notional_usd: Number(num('effective_max_notional_usd', 1, 100000, 1000).toFixed(6)),
    max_slippage_pct: Number(num('max_slippage_pct', 0.1, 50, 5).toFixed(2)),
    wallet_usdc: Number.isFinite(Number(value.wallet_usdc)) ? Number(Number(value.wallet_usdc).toFixed(6)) : null,
  };
}

function buildAiTradeSettingsContext(settings) {
  if (!settings || settings.dex !== 'avantis') return '';
  const collateralRule = settings.collateral_limit_mode === 'percent'
    ? `Use at most ${settings.max_balance_pct}% of the browser wallet USDC balance as collateral. Effective current cap: $${settings.effective_max_collateral_usd}.`
    : `Use at most $${settings.max_collateral_usd} USDC collateral per AI trade. Effective current cap: $${settings.effective_max_collateral_usd}.`;
  return [
    '## Browser Avantis AI Trade Settings',
    'The player configured these limits in the browser before allowing Smart Wallet / agent trading. Treat them as hard caps for Avantis MCP tool arguments.',
    collateralRule,
    `Max leverage: ${settings.effective_max_leverage}x. If the player asks for max leverage, use no more than this and no more than the market cap.`,
    `Max notional from current settings: $${settings.effective_max_notional_usd}.`,
    `Max slippage: ${settings.max_slippage_pct}%.`,
    settings.wallet_usdc != null ? `Browser wallet USDC balance seen by the client: $${settings.wallet_usdc}.` : '',
    'If the player writes a percentage of balance such as 50% of balance / 50% від балансу, pass that exact number as collateral_pct. Do not convert it to a stale dollar amount.',
    'If the player writes a numeric leverage such as 50x / 50 плечем / з 50 плечем, pass that exact number as leverage if it is within these caps. Do not replace it with a lower conservative default.',
    'If a minimum-notional blocker happened only because you used lower leverage than the player requested, retry with the requested leverage before answering.',
    'If the player explicitly asks for all balance/max funds on Avantis, pass collateral_pct no higher than the configured percent cap, or collateral_usd no higher than the configured USDC cap.',
  ].filter(Boolean).join('\n');
}

function combineAiInternalContext(...parts) {
  return parts.map((part) => String(part || '').trim()).filter(Boolean).join('\n\n');
}

function maskAiLogText(value) {
  return String(value ?? '')
    .replace(/cop_ai_[A-Za-z0-9_-]+/g, 'cop_ai_***')
    .replace(/sk-or-v1-[A-Za-z0-9_-]+/g, 'sk-or-v1-***')
    .replace(/(Bearer\s+)[A-Za-z0-9._-]+/gi, '$1***')
    .replace(/("?(?:api_key|token|mcp_key|authorization)"?\s*[:=]\s*")([^"]+)(")/gi, '$1***$3');
}

function aiChatPreview(value, max = 700) {
  const text = maskAiLogText(value).replace(/\s+/g, ' ').trim();
  return text.length > max ? `${text.slice(0, max)}...` : text;
}

function aiChatJson(value, max = 8000) {
  if (value == null) return null;
  let text = '';
  try {
    text = typeof value === 'string' ? value : JSON.stringify(value);
  } catch {
    text = String(value);
  }
  text = maskAiLogText(text);
  return text.length > max ? `${text.slice(0, max)}...` : text;
}

function parseAiChatStoredJson(value) {
  if (!value) return null;
  try {
    return typeof value === 'string' ? JSON.parse(value) : value;
  } catch {
    return null;
  }
}

function collectAiChatBrowserActions(playerId, mcpEventStartId) {
  const rows = db.db.prepare(`
    SELECT id, tool, output_json
    FROM mcp_events
    WHERE id > ?
      AND player_id = ?
      AND tool IN ('avantis_place_order', 'avantis_close_position', 'avantis_cancel_order', 'avantis_set_tpsl')
      AND status = 'ok'
    ORDER BY id ASC
  `).all(mcpEventStartId, playerId);
  const out = [];
  const seen = new Set();
  for (const row of rows) {
    const payload = parseAiChatStoredJson(row.output_json) || {};
    const candidates = [
      payload.browser_action,
      ...(Array.isArray(payload.browser_actions) ? payload.browser_actions : []),
    ].filter(Boolean);
    for (const action of candidates) {
      if (!action || action.dex !== 'avantis' || !action.id) continue;
      if (seen.has(action.id)) continue;
      seen.add(action.id);
      out.push({
        ...action,
        mcp_event_id: row.id,
        mcp_tool: row.tool,
      });
    }
  }
  return out;
}

function browserActionSafeMessage(responseText, intent, browserActions = []) {
  if (!browserActions.length) return responseText;
  if (!hermesClient.responseClaimsActionSucceeded(responseText, intent)) return responseText;
  const summary = browserActions[0]?.summary || 'Avantis action';
  const suffix = browserActions.length > 1 ? ` and ${browserActions.length - 1} more action(s)` : '';
  return `I prepared ${summary}${suffix}. Signing will start in the browser; I will report the Base transaction result after it is submitted.`;
}

function buildAiChatBrowserActionFollowUp(message, intent, browserActions = []) {
  if (intent?.kind !== 'avantis_close_then_place_order') return null;
  const actions = Array.isArray(browserActions) ? browserActions : [];
  const hasClose = actions.some((action) => action?.dex === 'avantis' && action?.type === 'close_position');
  const hasPlace = actions.some((action) => action?.dex === 'avantis' && action?.type === 'place_order');
  if (!hasClose || hasPlace) return null;
  const closedSymbols = [...new Set(actions
    .filter((action) => action?.type === 'close_position')
    .map((action) => String(action?.args?.symbol || '').trim().toUpperCase())
    .filter(Boolean))];
  const avoidSymbols = closedSymbols.includes('BTC') ? ['BTC'] : closedSymbols;
  const avoidText = avoidSymbols.length
    ? ` Avoid these just-closed symbols unless every other valid crypto/token market is blocked: ${avoidSymbols.join(', ')}.`
    : '';
  return {
    kind: 'avantis_open_after_close',
    after_action_types: ['close_position'],
    notice: 'Close confirmed. I am scanning for the replacement trade now.',
    message: [
      'Continue the previous Avantis request after the close transaction confirmed in the browser.',
      'Open a replacement Avantis trade with higher volatility / something interesting.',
      'Use avantis_market_scan first, then avantis_place_order.',
      'For avantis_place_order pass auto_select: true and prefer_volatile: true.',
      avoidText,
      'Prefer crypto/token markets with higher volatility_hourly_pct and strong absolute signal_score; do not default to BTC for an interesting or volatile replacement.',
      'Use the currently available browser-wallet USDC and the active AI trade settings. If the user did not specify size, use a valid affordable amount that meets Avantis minimum notional.',
      `Original player request: ${String(message || '').slice(0, 500)}`,
    ].filter(Boolean).join(' '),
  };
}

function isAvantisWrongDexToolBoundary(responseText, intent) {
  if (!String(intent?.kind || '').startsWith('avantis_')) return false;
  const text = String(responseText || '');
  return /only provides Decibel trading tools|only has Decibel tools|Avantis order placement (?:isn'?t|is not) supported|switch to a Decibel/i.test(text);
}

function buildAvantisWrongDexRetryContext(responseText) {
  return [
    'The previous answer was wrong: this authenticated account is an Avantis account and Avantis MCP tools are available.',
    'Do not say the server only provides Decibel tools.',
    'For this request, use only Avantis tools. Call avantis_place_order when symbol, side, collateral, and leverage are clear.',
    'The correct result of an Avantis write tool is a browser_action prepared for browser-wallet signature, not an already-open on-chain trade.',
    `Previous wrong answer preview: ${aiChatPreview(responseText, 500)}`,
  ].join('\n');
}

function publicAiChatStoredEvent(row) {
  if (!row) return null;
  const output = parseAiChatStoredJson(row.output_json) || {};
  const quota = parseAiChatStoredJson(row.quota_json) || null;
  const message = String(
    output.output_text
    || output.message
    || row.response_preview
    || row.error
    || ''
  ).trim();
  const status = String(row.status || 'ok');
  const isOk = status === 'ok';
  return {
    ok: isOk,
    pending: false,
    status,
    trace_id: row.trace_id,
    message,
    error: isOk ? null : (message || row.error || 'AI request failed'),
    quota: quota?.after || quota || null,
    browser_actions: Array.isArray(output.browser_actions) ? output.browser_actions : [],
    follow_up_after_browser_actions: output.follow_up_after_browser_actions || null,
    created_at: row.created_at,
    duration_ms: row.duration_ms ?? null,
  };
}

function summarizeHermesResult(result = {}) {
  return {
    model: result.model || null,
    fallback: !!result.fallback,
    fallback_index: result.fallback_index ?? null,
    attempted_models: Array.isArray(result.attempted_models) ? result.attempted_models : [],
    timings: result.timings || null,
    timing_events: Array.isArray(result.timing_events || result.timingEvents)
      ? (result.timing_events || result.timingEvents).slice(-80)
      : [],
    attempts: Array.isArray(result.attempts)
      ? result.attempts.map((attempt) => ({
          model: attempt.model || null,
          attempt: attempt.attempt ?? null,
          model_index: attempt.model_index ?? null,
          status: attempt.status || null,
          ensure_ms: attempt.ensure_ms ?? null,
          call_ms: attempt.call_ms ?? null,
          total_ms: attempt.total_ms ?? null,
          error: attempt.error ? aiChatPreview(attempt.error, 300) : null,
        }))
      : [],
    response_id: result.response?.id || result.response_id || null,
  };
}

function logAiChatServer(event, data = {}) {
  if (!AI_CHAT_DETAILED_LOGS) return;
  const payload = {
    event: `ai_chat_${event}`,
    at: new Date().toISOString(),
    ...data,
  };
  try {
    console.log(maskAiLogText(JSON.stringify(payload)));
  } catch {
    console.log(`[ai-chat] ${event}`);
  }
}

function createAiChatStageLogger({ traceId, player, intent, startedAt, requestPreview }) {
  let lastAt = startedAt || Date.now();
  return function logStage(stage, data = {}) {
    const now = Date.now();
    const stepMs = Math.max(0, now - lastAt);
    const elapsedMs = Math.max(0, now - (startedAt || now));
    lastAt = now;
    const payload = {
      stage,
      elapsed_ms: elapsedMs,
      step_ms: stepMs,
      ...data,
    };
    logAiChatServer('stage', {
      trace_id: traceId,
      player_id: player?.id || null,
      player_name: player?.name || null,
      intent: intent?.kind || null,
      ...payload,
    });
    db.logHermesChatEvent({
      traceId,
      eventType: 'stage',
      playerId: player?.id || null,
      playerName: player?.name || null,
      intent: intent?.kind || null,
      status: data.status || 'ok',
      durationMs: stepMs,
      model: data.model || null,
      error: data.error || null,
      requestPreview: stage,
      responsePreview: data.message || data.error || requestPreview || '',
      input: { trace_id: traceId, stage, request_preview: requestPreview || null },
      output: payload,
    });
  };
}

function logHermesTimingEvents({ traceId, player, intent, events = [] }) {
  if (!Array.isArray(events) || events.length === 0) return;
  for (const event of events.slice(-80)) {
    const stage = String(event?.stage || event?.phase || 'unknown').slice(0, 120);
    db.logHermesChatEvent({
      traceId,
      eventType: 'orchestrator_stage',
      playerId: player?.id || null,
      playerName: player?.name || null,
      intent: intent?.kind || null,
      status: event?.status || 'ok',
      durationMs: Number.isFinite(Number(event?.step_ms)) ? Number(event.step_ms) : null,
      model: event?.model || null,
      error: event?.error || null,
      requestPreview: stage,
      responsePreview: event?.message || event?.error || '',
      output: event,
    });
  }
}

function playerFacingAiError(err, intent) {
  if (err?.playerMessage) return String(err.playerMessage);
  const text = String(err?.message || '');
  if (/quota|message limit/i.test(text)) return 'AI message limit reached. Need: open the AI shop or wait for the daily reset.';
  if (/claimed success without calling required MCP tool|claimed success without completing terminal MCP tool/i.test(text)) {
    return 'The agent could not verify that the action actually happened. Need: try again.';
  }
  if (/Hermes orchestrator|fetch failed|ECONNREFUSED|ETIMEDOUT|AbortError|timeout|HTTP\s*5\d\d|OpenRouter|provider/i.test(text)) {
    return 'The AI route is temporarily unavailable. Need: try again in a moment.';
  }
  if (/Decibel/i.test(text)) {
    return 'The Decibel action failed before a verified result. Need: try again with a clear symbol, side, and amount.';
  }
  if (intent?.action_required) {
    return 'The action failed before a verified result. Need: try again or choose a simpler action.';
  }
  return 'The AI request failed. Need: try again.';
}

function observedTerminalToolsForIntent({ intent, playerId, mcpEventStartId, successfulOnly = false }) {
  const terminalGroups = hermesClient.terminalToolGroupsForIntent(intent);
  const terminalTools = [...new Set(terminalGroups.flat())];
  if (!intent?.action_required || terminalGroups.length === 0 || terminalTools.length === 0) {
    return { terminal_groups: terminalGroups, terminal_tools: terminalTools, rows: [], used_tools: [] };
  }
  const placeholders = terminalTools.map(() => '?').join(',');
  const statusClause = successfulOnly
    ? "AND status = 'ok' AND (error IS NULL OR error = '')"
    : '';
  const rows = db.db.prepare(`
    SELECT id, tool, status, duration_ms, error
    FROM mcp_events
    WHERE id > ?
      AND player_id = ?
      AND tool IN (${placeholders})
      ${statusClause}
    ORDER BY id ASC
  `).all(mcpEventStartId, playerId, ...terminalTools);
  return {
    terminal_groups: terminalGroups,
    terminal_tools: terminalTools,
    rows,
    used_tools: rows.map((row) => row.tool),
  };
}

function responseRequestsActionClarification(responseText) {
  const text = String(responseText || '').trim();
  if (!text) return false;
  return /(?:which|what|please\s+(?:provide|specify|choose)|tell me|need\s+(?:the|a|an|your)?\s*(?:symbol|market|side|amount|collateral|size|target|player|order id|position)|missing\s+(?:symbol|market|side|amount|collateral|size|target))/i.test(text)
    || /(?:уточни|вкажи|обери|який|яку|яке|скільки|потрібн[оа]\s+(?:символ|ринок|сторон|сум|розмір|collateral|ціль|кого)|укажи|выбери|какой|какую|сколько|нужн[оа]\s+(?:символ|рынок|сторон|сумм|размер|цель|кого))/iu.test(text);
}

function validateHermesActionAttempt({ intent, responseText, playerId, mcpEventStartId }) {
  const observed = observedTerminalToolsForIntent({
    intent,
    playerId,
    mcpEventStartId,
    successfulOnly: false,
  });
  if (!intent?.action_required || observed.terminal_groups.length === 0) {
    return { ok: true, ...observed };
  }
  if (observed.rows.length > 0) {
    return { ok: true, ...observed };
  }
  if (responseRequestsActionClarification(responseText)) {
    return { ok: true, clarification: true, ...observed };
  }
  return { ok: false, ...observed };
}

function validateHermesActionCompletion({ intent, responseText, playerId, mcpEventStartId }) {
  const terminalGroups = hermesClient.terminalToolGroupsForIntent(intent);
  const claimsSuccess = hermesClient.responseClaimsActionSucceeded(responseText, intent);
  if (!intent?.action_required || !claimsSuccess || terminalGroups.length === 0) {
    return { ok: true, claims_success: claimsSuccess, terminal_groups: terminalGroups, used_tools: [] };
  }

  const observed = observedTerminalToolsForIntent({
    intent,
    playerId,
    mcpEventStartId,
    successfulOnly: true,
  });
  const usedTools = observed.used_tools;
  const ok = hermesClient.terminalToolGroupsSatisfied(usedTools, terminalGroups);
  return {
    ok,
    claims_success: claimsSuccess,
    terminal_groups: terminalGroups,
    terminal_tools: observed.terminal_tools,
    used_tools: usedTools,
    events: observed.rows,
  };
}

function terminalToolLabel(groups = []) {
  return groups.map((group) => group.join(' or ')).join(' AND ');
}

function buildMissingTerminalToolError(completion, responseText) {
  const expected = terminalToolLabel(completion.terminal_groups);
  const err = new Error(`Agent response claimed success without completing terminal MCP tool (${expected}).`);
  err.status = 502;
  err.body = {
    required_terminal_tools: completion.terminal_groups,
    used_tools: completion.used_tools || [],
    response_preview: aiChatPreview(responseText, 500),
  };
  return err;
}

function buildMissingTerminalToolAttemptError(attempt, responseText) {
  const expected = terminalToolLabel(attempt.terminal_groups);
  const err = new Error(`Agent response returned an action answer without calling required MCP tool (${expected}).`);
  err.status = 502;
  err.playerMessage = 'The agent did not call the required action tool. Need: try again in a new chat.';
  err.body = {
    required_terminal_tools: attempt.terminal_groups,
    used_tools: attempt.used_tools || [],
    response_preview: aiChatPreview(responseText, 500),
  };
  return err;
}

function buildTerminalToolAttemptRetryContext(attempt, responseText) {
  return [
    'The previous answer returned advice or a blocker, but no required terminal MCP tool was called.',
    `Required terminal MCP tool for this action request: ${terminalToolLabel(attempt.terminal_groups)}.`,
    'The player request is actionable. Do not answer from memory, old chat history, or model knowledge.',
    'Call the required terminal action tool now. If the tool prepares a browser_action, answer naturally that signing is starting in the browser. If the tool blocks, report the exact tool blocker.',
    'Do not repeat previous minimum-size, balance, network, or server-unreachable blockers unless the MCP tool returns them in this retry.',
    `Previous answer preview: ${aiChatPreview(responseText, 500)}`,
  ].join('\n');
}

function buildTerminalToolRetryContext(completion, responseText) {
  return [
    'The previous answer claimed the action succeeded, but the required terminal MCP tool was not called.',
    `Required terminal MCP tool before any success answer: ${terminalToolLabel(completion.terminal_groups)}.`,
    `Tools successfully observed so far: ${(completion.used_tools || []).join(', ') || 'none'}.`,
    'Continue the same player request now. Do not repeat only read/status tools. Call the required terminal action tool, then answer naturally from that tool result.',
    'If the terminal tool blocks, answer with the exact blocker instead of claiming success.',
    `Previous answer preview: ${aiChatPreview(responseText, 500)}`,
  ].join('\n');
}

function extractRequestedAiBalancePct(message) {
  const raw = String(message || '').normalize('NFKC');
  const explicitPct = raw.match(/(\d+(?:[.,]\d+)?)\s*%\s*(?:of|from|від|от)?\s*(?:(?:my|мого|моего|мій|мой|моїх|моих)\s+)?(?:balance|wallet|баланс|балансу|кошт|грош|средств)/iu);
  if (explicitPct) {
    const value = Number(String(explicitPct[1]).replace(',', '.'));
    if (Number.isFinite(value) && value > 0) return Math.max(0.01, Math.min(100, value));
  }
  if (/\b(all|everything|full\s+balance|max(?:imum)?\s+(?:balance|funds|money))\b|на\s+(?:всі|усі)\s+гроші|на\s+весь\s+баланс|весь\s+баланс|усі\s+гроші|всі\s+гроші|все/iu.test(raw)) {
    return 100;
  }
  return null;
}

function extractRequestedAiLeverage(message) {
  const raw = String(message || '').normalize('NFKC');
  const edge = '[^\\p{L}\\p{N}_]';
  const num = '(\\d+(?:[.,]\\d+)?)';
  const patterns = [
    new RegExp(`(?:^|${edge})${num}\\s*(?:x|х)(?=$|${edge})`, 'iu'),
    new RegExp(`(?:^|${edge})${num}\\s*(?:leverage|lev|плеч[\\p{L}\\p{M}]*|леверидж[\\p{L}\\p{M}]*)(?=$|${edge})`, 'iu'),
    new RegExp(`(?:^|${edge})(?:leverage|lev|плеч[\\p{L}\\p{M}]*|леверидж[\\p{L}\\p{M}]*)\\s*(?:на|at|=|:)?\\s*${num}(?=$|${edge})`, 'iu'),
  ];
  for (const pattern of patterns) {
    const match = raw.match(pattern);
    const value = Number(String(match?.[1] || '').replace(',', '.'));
    if (Number.isFinite(value) && value > 0) return Math.max(1, Math.min(1000, value));
  }
  return null;
}

function messageRequestsMaxLeverage(message) {
  const raw = String(message || '').normalize('NFKC').toLocaleLowerCase();
  return /\bmax(?:imum)?\s+(?:allowed\s+)?leverage\b|\bhighest\s+leverage\b/i.test(raw)
    || /(?:макс(?:имальн[\p{L}\p{M}]*)?|найбільш[\p{L}\p{M}]*|сам(?:ое|ый|ая)[\p{L}\p{M}]*)[\s\S]{0,40}плеч/iu.test(raw)
    || /плеч[\s\S]{0,40}(?:макс(?:имальн[\p{L}\p{M}]*)?|найбільш[\p{L}\p{M}]*|сам(?:ое|ый|ая)[\p{L}\p{M}]*)/iu.test(raw)
    || /(?:до?зв|довз)олен[\p{L}\p{M}]*[\s\S]{0,24}плеч/iu.test(raw);
}

function latestRepairableAvantisMinNotional({ intent, playerId, mcpEventStartId, message, aiTradeSettings }) {
  if (intent?.kind !== 'avantis_place_order') return null;
  const rows = db.db.prepare(`
    SELECT id, input_json, output_json, error
    FROM mcp_events
    WHERE id > ?
      AND player_id = ?
      AND tool = 'avantis_place_order'
      AND status = 'error'
    ORDER BY id DESC
    LIMIT 8
  `).all(mcpEventStartId, playerId);
  const requestedLeverage = extractRequestedAiLeverage(message);
  const requestedPct = extractRequestedAiBalancePct(message);
  const wantsMaxLeverage = messageRequestsMaxLeverage(message);
  const policyMaxLeverage = Number(aiTradeSettings?.effective_max_leverage || aiTradeSettings?.max_leverage || 50);
  for (const row of rows) {
    const input = parseAiChatStoredJson(row.input_json) || {};
    const output = parseAiChatStoredJson(row.output_json) || {};
    const minNotional = Number(output.minimum_notional_usd || 0);
    const usedCollateral = Number(output.collateral_usd || input.collateral_usd || 0);
    const usedLeverage = Number(output.leverage || input.leverage || 0);
    const requiredLeverage = Number(output.required_leverage_for_collateral || 0);
    if (!(minNotional > 0) || !(usedCollateral > 0) || !(requiredLeverage > 0)) continue;

    const targetLeverage = requestedLeverage && requestedLeverage > usedLeverage
      ? requestedLeverage
      : wantsMaxLeverage && policyMaxLeverage > usedLeverage
        ? policyMaxLeverage
        : 0;
    if (!(targetLeverage > usedLeverage)) continue;
    if (targetLeverage + 1e-9 < requiredLeverage) continue;
    if (targetLeverage > policyMaxLeverage + 1e-9) continue;

    const fallbackPct = Number(input.collateral_pct || output.collateral_pct || 0);
    const targetPct = requestedPct ?? (Number.isFinite(fallbackPct) && fallbackPct > 0 ? fallbackPct : null);
    return {
      event_id: row.id,
      input,
      output,
      target_leverage: Number(targetLeverage.toFixed(4)),
      target_collateral_pct: targetPct,
      target_notional: Number((usedCollateral * targetLeverage).toFixed(6)),
      policy_max_leverage: policyMaxLeverage,
      requested_leverage: requestedLeverage,
      requested_balance_pct: requestedPct,
    };
  }
  return null;
}

function buildAvantisMinNotionalRepairContext(repair, responseText) {
  const input = repair?.input || {};
  const output = repair?.output || {};
  const symbol = String(input.symbol || output.symbol || '').toUpperCase();
  const side = String(input.side || output.side || '').toLowerCase();
  const delegatedChoice = input.auto_select === true || input.choose_market === true;
  const pctText = repair.target_collateral_pct != null
    ? `Use collateral_pct: ${repair.target_collateral_pct}.`
    : `Use the same collateral amount from the failed attempt: $${Number(output.collateral_usd || input.collateral_usd || 0).toFixed(6)}.`;
  const targetToolArgs = delegatedChoice
    ? `leverage: ${repair.target_leverage}, auto_select: true, choose_market: true${side ? `, side: ${side}` : ''}`
    : `leverage: ${repair.target_leverage}${symbol ? `, symbol: ${symbol}` : ''}${side ? `, side: ${side}` : ''}`;
  return [
    'The previous Avantis place-order attempt failed only because the model used lower leverage than the player requested or allowed.',
    `Previous failed tool used leverage ${output.leverage || input.leverage}x, but this request allows/requires ${repair.target_leverage}x and policy max is ${repair.policy_max_leverage}x.`,
    `The repaired notional is about $${repair.target_notional}, above the Avantis minimum $${output.minimum_notional_usd || 100}.`,
    pctText,
    `Retry now with avantis_place_order using ${targetToolArgs}.`,
    delegatedChoice ? 'Because this was a delegated-choice trade, you may rerun market selection; choose a market that can support the requested leverage instead of sticking to the previously failed symbol.' : '',
    'Do not answer that leverage exceeds the wallet/policy unless the required leverage is actually above the policy max.',
    `Previous answer preview: ${aiChatPreview(responseText, 500)}`,
  ].filter(Boolean).join('\n');
}

function responseLooksLikeAvantisMinNotionalBlocker(responseText) {
  const text = String(responseText || '').normalize('NFKC');
  if (!text) return false;
  return /(?:minimum|min)\s+(?:notional|position|size|trade)|(?:notional|position|size)[\s\S]{0,80}(?:below|under|too low)|(?:below|under|too low)[\s\S]{0,80}(?:minimum|min|notional|position|size)|мінімальн|замал|недостатн|минимальн|слишком\s+мал|недостаточн/iu.test(text);
}

function expectedAvantisOrderMathFromRequest(message, aiTradeSettings) {
  const settings = aiTradeSettings || {};
  const walletUsdc = Number(settings.wallet_usdc);
  if (!(walletUsdc > 0)) return null;

  const requestedPct = extractRequestedAiBalancePct(message);
  if (!(requestedPct > 0)) return null;

  const requestedLeverage = extractRequestedAiLeverage(message);
  const policyMaxLeverage = Number(settings.effective_max_leverage || settings.max_leverage || 50);
  const leverage = requestedLeverage > 0
    ? requestedLeverage
    : messageRequestsMaxLeverage(message)
      ? policyMaxLeverage
      : 0;
  if (!(leverage > 0)) return null;
  if (policyMaxLeverage > 0 && leverage > policyMaxLeverage + 1e-9) return null;

  const percentCap = settings.collateral_limit_mode === 'percent'
    ? Number(settings.max_balance_pct || 100)
    : 100;
  const cappedPct = Math.max(0.01, Math.min(100, Math.min(requestedPct, percentCap > 0 ? percentCap : 100)));
  let collateralUsd = walletUsdc * (cappedPct / 100);
  const effectiveCollateralCap = Number(settings.effective_max_collateral_usd);
  if (effectiveCollateralCap > 0) {
    collateralUsd = Math.min(collateralUsd, effectiveCollateralCap);
  }
  const notionalUsd = collateralUsd * leverage;
  const effectiveNotionalCap = Number(settings.effective_max_notional_usd);
  if (effectiveNotionalCap > 0 && notionalUsd > effectiveNotionalCap + 1e-9) return null;

  return {
    wallet_usdc: Number(walletUsdc.toFixed(6)),
    requested_pct: Number(requestedPct.toFixed(4)),
    capped_pct: Number(cappedPct.toFixed(4)),
    collateral_usd: Number(collateralUsd.toFixed(6)),
    leverage: Number(leverage.toFixed(4)),
    notional_usd: Number(notionalUsd.toFixed(6)),
    policy_max_leverage: Number(policyMaxLeverage.toFixed(4)),
    minimum_notional_usd: 100,
  };
}

function buildAvantisInvalidMinNotionalMathRepair({ intent, playerId, mcpEventStartId, message, responseText, aiTradeSettings }) {
  if (intent?.kind !== 'avantis_place_order') return null;
  if (!responseLooksLikeAvantisMinNotionalBlocker(responseText)) return null;
  if (collectAiChatBrowserActions(playerId, mcpEventStartId).length > 0) return null;

  const math = expectedAvantisOrderMathFromRequest(message, aiTradeSettings);
  if (!math || math.notional_usd + 1e-9 < math.minimum_notional_usd) return null;

  return {
    ...math,
    delegated_choice: !!intent.delegated_choice,
  };
}

function buildAvantisInvalidMinNotionalMathRepairContext(repair, responseText) {
  const pctClause = repair.requested_pct === repair.capped_pct
    ? `Use collateral_pct: ${repair.requested_pct}.`
    : `The player requested collateral_pct ${repair.requested_pct}, but browser policy caps it at ${repair.capped_pct}; use collateral_pct: ${repair.capped_pct}.`;
  return [
    'The previous Avantis answer was mathematically wrong and must be retried through MCP.',
    `Browser wallet USDC balance is $${repair.wallet_usdc}. ${pctClause}`,
    `Requested leverage is ${repair.leverage}x and policy max is ${repair.policy_max_leverage}x.`,
    `Expected collateral is about $${repair.collateral_usd}; expected notional is about $${repair.notional_usd}, which is above the Avantis minimum $${repair.minimum_notional_usd}.`,
    repair.delegated_choice
      ? `Call avantis_place_order now with collateral_pct: ${repair.capped_pct}, leverage: ${repair.leverage}, auto_select: true, choose_market: true. Choose only a crypto/token market whose max_leverage is at least ${repair.leverage}x. Do not choose DYM if it cannot support that leverage.`
      : `Call avantis_place_order now with leverage: ${repair.leverage} and the requested collateral. Do not answer a minimum-notional blocker unless this exact MCP retry returns it.`,
    'Do not answer from stale chat history or model memory. Report only the fresh MCP tool result.',
    `Previous wrong answer preview: ${aiChatPreview(responseText, 500)}`,
  ].join('\n');
}

function avantisTerminalToolForIntent(intent = {}) {
  switch (intent?.kind) {
    case 'avantis_place_order': return 'avantis_place_order';
    case 'avantis_close_position': return 'avantis_close_position';
    case 'avantis_cancel_order': return 'avantis_cancel_order';
    case 'avantis_tpsl': return 'avantis_set_tpsl';
    default: return '';
  }
}

function responseClaimsAvantisBrowserActionPrepared(responseText, intent = {}) {
  if (!avantisTerminalToolForIntent(intent)) return false;
  const text = String(responseText || '').normalize('NFKC');
  if (!text) return false;
  if (/blocked|error|failed|cannot|can't|can’t|could not|minimum|too low|insufficient|need|немож|не мож|помил|недостат|мінімальн|слишком|минимальн/iu.test(text)) {
    return false;
  }
  return /prepared|ready|browser\s+wallet|wallet\s+confirmation|confirm\s+it|signature|sign|підготов|готов|гаманець|підпис|підтверд|кошел|подпис|подтверд/iu.test(text);
}

function latestAvantisWriteError({ intent, playerId, mcpEventStartId }) {
  const tool = avantisTerminalToolForIntent(intent);
  if (!tool) return null;
  const row = db.db.prepare(`
    SELECT id, tool, input_json, output_json, error
    FROM mcp_events
    WHERE id > ?
      AND player_id = ?
      AND tool = ?
      AND status = 'error'
    ORDER BY id DESC
    LIMIT 1
  `).get(mcpEventStartId, playerId, tool);
  if (!row) return null;
  const input = parseAiChatStoredJson(row.input_json) || {};
  const output = parseAiChatStoredJson(row.output_json) || {};
  const error = String(output.error || row.error || 'Avantis action was blocked by the MCP tool.').trim();
  return {
    event_id: row.id,
    tool: row.tool,
    input,
    output,
    error,
  };
}

function buildAvantisPreparedWithoutActionRetryContext(toolError, responseText) {
  return [
    'The previous answer was wrong: it said an Avantis browser action was prepared, but the MCP write tool returned an error and no browser_action exists.',
    `MCP tool: ${toolError.tool}.`,
    `Exact MCP blocker: ${toolError.error}`,
    `Tool input: ${JSON.stringify(toolError.input || {})}`,
    'Do not say prepared, ready, browser wallet, confirmation, signature, opened, or submitted.',
    'Answer naturally with the exact blocker and the relevant math/policy details from the MCP result if present.',
    `Previous wrong answer preview: ${aiChatPreview(responseText, 500)}`,
  ].join('\n');
}

router.post('/ai-chat/message', auth, async (req, res) => {
  const startedAt = Date.now();
  const mcpEventStartId = Number(db.db.prepare('SELECT COALESCE(MAX(id), 0) AS id FROM mcp_events').get()?.id || 0);
  const traceId = String(req.body?.trace_id || req.body?.traceId || crypto.randomUUID()).slice(0, 80);
  const idempotencyKey = String(req.body?.idempotency_key || crypto.randomUUID()).slice(0, 120);
  const message = typeof req.body?.message === 'string' ? req.body.message.trim() : '';
  if (!message) return res.status(400).json({ ok: false, error: 'message required' });
  if (message.length > 8000) return res.status(400).json({ ok: false, error: 'message too long' });
  const history = normalizeAiChatHistory(req.body?.history);
  const aiTradeSettings = normalizeAiTradeSettings(req.body?.ai_trade_settings);
  const aiTradeSettingsContext = buildAiTradeSettingsContext(aiTradeSettings);
  const intent = hermesClient.classifyGameIntent(message, req.player);
  const quotaBefore = getAiMessageQuotaStatus(req.player.id);
  const logStage = createAiChatStageLogger({
    traceId,
    player: req.player,
    intent,
    startedAt,
    requestPreview: aiChatPreview(message),
  });

  let model = null;
  let reservation = null;
  try {
    logStage('message_received', {
      message: 'AI chat request received',
      message_chars: message.length,
      history_count: history.length,
      action_required: !!intent.action_required,
    });
    logAiChatServer('message_received', {
      trace_id: traceId,
      player_id: req.player.id,
      player_name: req.player.name,
      intent: intent.kind,
      action_required: !!intent.action_required,
      message_chars: message.length,
      history_count: history.length,
      quota_before: quotaBefore,
      request_preview: aiChatPreview(message),
    });
    logStage('load_or_create_agent_start', { message: 'Loading Hermes agent key/state' });
    const agent = db.getOrCreateHermesAgent(req.player.id);
    if (agent.error) return res.status(400).json(agent);
    logStage('load_or_create_agent_done', { message: 'Hermes agent key/state loaded' });
    logStage('quota_reserve_start', { message: 'Reserving AI message quota' });
    const reserved = reserveAiChatMessage(req.player.id);
    if (reserved && !reserved.ok) {
      const durationMs = Date.now() - startedAt;
      logStage('quota_blocked', {
        status: 'blocked',
        message: 'AI message quota blocked the request',
        quota: reserved.quota,
      });
      logAiChatServer('quota_blocked', {
        trace_id: traceId,
        player_id: req.player.id,
        intent: intent.kind,
        duration_ms: durationMs,
        quota: reserved.quota,
      });
      db.logHermesChatEvent({
        traceId,
        eventType: 'message',
        playerId: req.player.id,
        playerName: req.player.name,
        intent: intent.kind,
        status: 'quota_blocked',
        durationMs,
        requestPreview: aiChatPreview(message),
        responsePreview: 'AI message limit reached',
        quota: { before: quotaBefore, after: reserved.quota },
        input: { trace_id: traceId, message, history },
        output: { error: 'AI message limit reached' },
      });
      return res.status(402).json({
        ok: false,
        error: 'AI message limit reached. Open the AI shop to get more messages.',
        quota: reserved.quota,
        trace_id: traceId,
      });
    }
    reservation = reserved?.reservation || null;
    logStage('quota_reserve_done', {
      message: reservation ? `Reserved ${reservation.bucket} message` : 'No quota reservation needed',
      reservation: reservation ? { bucket: reservation.bucket, day: reservation.day } : null,
    });
    logAiChatServer('dispatch_hermes', {
      trace_id: traceId,
      player_id: req.player.id,
      intent: intent.kind,
      idempotency_key: idempotencyKey,
      reservation: reservation ? { source: reservation.source, day: reservation.day } : null,
    });
    logStage('hermes_dispatch_start', {
      message: 'Dispatching request to Hermes orchestrator',
      idempotency_key: idempotencyKey,
    });
    let result = await hermesClient.chat(req.player, agent.mcp_key, message, {
      previous_response_id: req.body?.previous_response_id,
      idempotency_key: idempotencyKey,
      metadata: {
        ...(req.body?.metadata && typeof req.body.metadata === 'object' ? req.body.metadata : {}),
        trace_id: traceId,
        ai_trade_settings: aiTradeSettings || undefined,
      },
      internal_context: aiTradeSettingsContext,
      history,
    });
    logStage('hermes_dispatch_done', {
      message: 'Hermes orchestrator returned a response',
      model: result.model || null,
      fallback: !!result.fallback,
      response_chars: String(result.output_text || '').length,
    });
    let responseText = String(result.output_text || '').trim();
    if (isAvantisWrongDexToolBoundary(responseText, intent)) {
      logStage('hermes_retry_wrong_avantis_boundary_start', {
        status: 'retry',
        message: 'Hermes answered with the Decibel-only blocker for an Avantis request; retrying with strict Avantis routing',
        response_preview: aiChatPreview(responseText, 500),
      });
      result = await hermesClient.chat(req.player, agent.mcp_key, message, {
        previous_response_id: null,
        idempotency_key: `${idempotencyKey}:avantis-boundary-retry`,
        internal_context: combineAiInternalContext(aiTradeSettingsContext, buildAvantisWrongDexRetryContext(responseText)),
        metadata: {
          ...(req.body?.metadata && typeof req.body.metadata === 'object' ? req.body.metadata : {}),
          trace_id: traceId,
          ai_trade_settings: aiTradeSettings || undefined,
          retry_reason: 'wrong_avantis_tool_boundary',
        },
        history: [],
      });
      logStage('hermes_retry_wrong_avantis_boundary_done', {
        message: 'Hermes strict Avantis retry returned a response',
        model: result.model || null,
        fallback: !!result.fallback,
        response_chars: String(result.output_text || '').length,
      });
      responseText = String(result.output_text || '').trim();
      if (isAvantisWrongDexToolBoundary(responseText, intent)) {
        const err = new Error('Avantis route loaded the wrong trading tool boundary.');
        err.status = 502;
        err.playerMessage = 'Avantis route loaded the wrong tool set. Start a new chat and try again.';
        throw err;
      }
    }
    let actionAttempt = validateHermesActionAttempt({
      intent,
      responseText,
      playerId: req.player.id,
      mcpEventStartId,
    });
    if (!actionAttempt.ok) {
      logStage('hermes_retry_missing_terminal_tool_attempt_start', {
        status: 'retry',
        message: 'Hermes answered an action request without calling the terminal MCP tool; retrying once',
        required_terminal_tools: actionAttempt.terminal_groups,
        used_tools: actionAttempt.used_tools,
        response_preview: aiChatPreview(responseText, 500),
      });
      result = await hermesClient.chat(req.player, agent.mcp_key, message, {
        previous_response_id: null,
        idempotency_key: `${idempotencyKey}:terminal-tool-attempt-retry`,
        internal_context: combineAiInternalContext(aiTradeSettingsContext, buildTerminalToolAttemptRetryContext(actionAttempt, responseText)),
        metadata: {
          ...(req.body?.metadata && typeof req.body.metadata === 'object' ? req.body.metadata : {}),
          trace_id: traceId,
          ai_trade_settings: aiTradeSettings || undefined,
          retry_reason: 'missing_terminal_mcp_tool_attempt',
          required_terminal_tools: actionAttempt.terminal_groups,
        },
        history: [],
      });
      logStage('hermes_retry_missing_terminal_tool_attempt_done', {
        message: 'Hermes terminal-tool-attempt retry returned a response',
        model: result.model || null,
        fallback: !!result.fallback,
        response_chars: String(result.output_text || '').length,
      });
      responseText = String(result.output_text || '').trim();
      if (isAvantisWrongDexToolBoundary(responseText, intent)) {
        const err = new Error('Avantis route loaded the wrong trading tool boundary.');
        err.status = 502;
        err.playerMessage = 'Avantis route loaded the wrong tool set. Start a new chat and try again.';
        throw err;
      }
      actionAttempt = validateHermesActionAttempt({
        intent,
        responseText,
        playerId: req.player.id,
        mcpEventStartId,
      });
      if (!actionAttempt.ok) {
        throw buildMissingTerminalToolAttemptError(actionAttempt, responseText);
      }
    }
    const avantisMinRepair = latestRepairableAvantisMinNotional({
      intent,
      playerId: req.player.id,
      mcpEventStartId,
      message,
      aiTradeSettings,
    });
    if (avantisMinRepair) {
      logStage('hermes_retry_avantis_min_notional_repair_start', {
        status: 'retry',
        message: 'Hermes used too little Avantis leverage and hit minimum notional; retrying with parsed request leverage',
        failed_event_id: avantisMinRepair.event_id,
        target_leverage: avantisMinRepair.target_leverage,
        target_collateral_pct: avantisMinRepair.target_collateral_pct,
        target_notional: avantisMinRepair.target_notional,
      });
      result = await hermesClient.chat(req.player, agent.mcp_key, message, {
        previous_response_id: null,
        idempotency_key: `${idempotencyKey}:avantis-min-notional-repair`,
        internal_context: combineAiInternalContext(aiTradeSettingsContext, buildAvantisMinNotionalRepairContext(avantisMinRepair, responseText)),
        metadata: {
          ...(req.body?.metadata && typeof req.body.metadata === 'object' ? req.body.metadata : {}),
          trace_id: traceId,
          ai_trade_settings: aiTradeSettings || undefined,
          retry_reason: 'avantis_min_notional_repair',
          target_leverage: avantisMinRepair.target_leverage,
          target_collateral_pct: avantisMinRepair.target_collateral_pct,
        },
        history: [],
      });
      logStage('hermes_retry_avantis_min_notional_repair_done', {
        message: 'Hermes Avantis minimum-notional repair retry returned a response',
        model: result.model || null,
        fallback: !!result.fallback,
        response_chars: String(result.output_text || '').length,
      });
      responseText = String(result.output_text || '').trim();
      actionAttempt = validateHermesActionAttempt({
        intent,
        responseText,
        playerId: req.player.id,
        mcpEventStartId,
      });
      if (!actionAttempt.ok) {
        throw buildMissingTerminalToolAttemptError(actionAttempt, responseText);
      }
    }
    const avantisMathRepair = buildAvantisInvalidMinNotionalMathRepair({
      intent,
      playerId: req.player.id,
      mcpEventStartId,
      message,
      responseText,
      aiTradeSettings,
    });
    if (avantisMathRepair) {
      logStage('hermes_retry_avantis_invalid_min_notional_math_start', {
        status: 'retry',
        message: 'Hermes answered an Avantis minimum-notional blocker, but requested balance percent and leverage pass the minimum math; retrying with exact parsed parameters',
        wallet_usdc: avantisMathRepair.wallet_usdc,
        requested_pct: avantisMathRepair.requested_pct,
        capped_pct: avantisMathRepair.capped_pct,
        target_leverage: avantisMathRepair.leverage,
        target_notional: avantisMathRepair.notional_usd,
      });
      result = await hermesClient.chat(req.player, agent.mcp_key, message, {
        previous_response_id: null,
        idempotency_key: `${idempotencyKey}:avantis-invalid-min-notional-math-repair`,
        internal_context: combineAiInternalContext(aiTradeSettingsContext, buildAvantisInvalidMinNotionalMathRepairContext(avantisMathRepair, responseText)),
        metadata: {
          ...(req.body?.metadata && typeof req.body.metadata === 'object' ? req.body.metadata : {}),
          trace_id: traceId,
          ai_trade_settings: aiTradeSettings || undefined,
          retry_reason: 'avantis_invalid_min_notional_math_repair',
          target_leverage: avantisMathRepair.leverage,
          target_collateral_pct: avantisMathRepair.capped_pct,
          target_notional: avantisMathRepair.notional_usd,
        },
        history: [],
      });
      logStage('hermes_retry_avantis_invalid_min_notional_math_done', {
        message: 'Hermes Avantis invalid minimum-notional math retry returned a response',
        model: result.model || null,
        fallback: !!result.fallback,
        response_chars: String(result.output_text || '').length,
      });
      responseText = String(result.output_text || '').trim();
      actionAttempt = validateHermesActionAttempt({
        intent,
        responseText,
        playerId: req.player.id,
        mcpEventStartId,
      });
      if (!actionAttempt.ok) {
        throw buildMissingTerminalToolAttemptError(actionAttempt, responseText);
      }
    }
    let avantisPreparedError = latestAvantisWriteError({
      intent,
      playerId: req.player.id,
      mcpEventStartId,
    });
    if (
      avantisPreparedError
      && responseClaimsAvantisBrowserActionPrepared(responseText, intent)
      && collectAiChatBrowserActions(req.player.id, mcpEventStartId).length === 0
    ) {
      logStage('hermes_retry_avantis_prepared_without_browser_action_start', {
        status: 'retry',
        message: 'Hermes claimed an Avantis browser action was prepared, but the write tool errored and no browser_action exists; retrying with exact MCP blocker',
        failed_event_id: avantisPreparedError.event_id,
        failed_tool: avantisPreparedError.tool,
        error: aiChatPreview(avantisPreparedError.error, 500),
      });
      result = await hermesClient.chat(req.player, agent.mcp_key, message, {
        previous_response_id: null,
        idempotency_key: `${idempotencyKey}:avantis-prepared-without-browser-action-repair`,
        internal_context: combineAiInternalContext(aiTradeSettingsContext, buildAvantisPreparedWithoutActionRetryContext(avantisPreparedError, responseText)),
        metadata: {
          ...(req.body?.metadata && typeof req.body.metadata === 'object' ? req.body.metadata : {}),
          trace_id: traceId,
          ai_trade_settings: aiTradeSettings || undefined,
          retry_reason: 'avantis_prepared_without_browser_action',
          failed_tool: avantisPreparedError.tool,
          failed_event_id: avantisPreparedError.event_id,
        },
        history: [],
      });
      logStage('hermes_retry_avantis_prepared_without_browser_action_done', {
        message: 'Hermes Avantis prepared-without-browser-action retry returned a response',
        model: result.model || null,
        fallback: !!result.fallback,
        response_chars: String(result.output_text || '').length,
      });
      responseText = String(result.output_text || '').trim();
      actionAttempt = validateHermesActionAttempt({
        intent,
        responseText,
        playerId: req.player.id,
        mcpEventStartId,
      });
      if (!actionAttempt.ok) {
        throw buildMissingTerminalToolAttemptError(actionAttempt, responseText);
      }
      avantisPreparedError = latestAvantisWriteError({
        intent,
        playerId: req.player.id,
        mcpEventStartId,
      });
      if (
        avantisPreparedError
        && responseClaimsAvantisBrowserActionPrepared(responseText, intent)
        && collectAiChatBrowserActions(req.player.id, mcpEventStartId).length === 0
      ) {
        responseText = avantisPreparedError.error;
        result = { ...result, output_text: responseText };
      }
    }
    let completion = validateHermesActionCompletion({
      intent,
      responseText,
      playerId: req.player.id,
      mcpEventStartId,
    });
    if (!completion.ok) {
      logStage('hermes_retry_missing_terminal_tool_start', {
        status: 'retry',
        message: 'Hermes claimed success before the terminal MCP tool completed; retrying once',
        required_terminal_tools: completion.terminal_groups,
        used_tools: completion.used_tools,
      });
      result = await hermesClient.chat(req.player, agent.mcp_key, message, {
        previous_response_id: result.response?.id || result.response_id || req.body?.previous_response_id,
        idempotency_key: `${idempotencyKey}:terminal-tool-retry`,
        internal_context: combineAiInternalContext(aiTradeSettingsContext, buildTerminalToolRetryContext(completion, responseText)),
        metadata: {
          ...(req.body?.metadata && typeof req.body.metadata === 'object' ? req.body.metadata : {}),
          trace_id: traceId,
          ai_trade_settings: aiTradeSettings || undefined,
          retry_reason: 'missing_terminal_mcp_tool',
          required_terminal_tools: completion.terminal_groups,
        },
        history: [
          ...history,
          { role: 'assistant', text: responseText },
        ].slice(-4),
      });
      logStage('hermes_retry_missing_terminal_tool_done', {
        message: 'Hermes retry returned a response',
        model: result.model || null,
        fallback: !!result.fallback,
        response_chars: String(result.output_text || '').length,
      });
      responseText = String(result.output_text || '').trim();
      completion = validateHermesActionCompletion({
        intent,
        responseText,
        playerId: req.player.id,
        mcpEventStartId,
      });
      if (!completion.ok) {
        throw buildMissingTerminalToolError(completion, responseText);
      }
    }
    model = result.model || null;
    const durationMs = Date.now() - startedAt;
    const quotaAfter = getAiMessageQuotaStatus(req.player.id);
    const resultSummary = summarizeHermesResult(result);
    const browserActions = collectAiChatBrowserActions(req.player.id, mcpEventStartId);
    const followUpAfterBrowserActions = buildAiChatBrowserActionFollowUp(message, intent, browserActions);
    const outputText = browserActionSafeMessage(String(result.output_text || '').trim(), intent, browserActions);
    logHermesTimingEvents({ traceId, player: req.player, intent, events: result.timing_events || result.timingEvents || [] });
    logStage('mark_agent_state_start', { message: 'Persisting Hermes agent state' });
    db.markHermesAgentState(req.player.id, {
      status: 'running',
      orchestrator: result,
      provisioned: true,
      chatted: true,
    });
    logStage('mark_agent_state_done', { message: 'Hermes agent state persisted' });
    logAiChatServer('message_ok', {
      trace_id: traceId,
      player_id: req.player.id,
      intent: intent.kind,
      duration_ms: durationMs,
      model,
      fallback: !!result.fallback,
      attempted_models: resultSummary.attempted_models,
      timings: resultSummary.timings,
      attempts: resultSummary.attempts,
      response_chars: String(outputText || '').length,
      response_preview: aiChatPreview(outputText, 900),
      quota_after: quotaAfter,
    });
    logStage('message_persist_start', { message: 'Writing final AI chat event' });
    db.logHermesChatEvent({
      traceId,
      eventType: 'message',
      playerId: req.player.id,
      playerName: req.player.name,
      intent: intent.kind,
      status: 'ok',
      durationMs,
      model,
      requestPreview: aiChatPreview(message),
      responsePreview: aiChatPreview(outputText, 1200),
      quota: { before: quotaBefore, after: quotaAfter, reservation },
      attempts: resultSummary.attempts,
      input: { trace_id: traceId, idempotency_key: idempotencyKey, message, history },
      output: {
        output_text: outputText,
        browser_actions: browserActions,
        follow_up_after_browser_actions: followUpAfterBrowserActions,
        ...resultSummary,
        timing_events: result.timing_events || result.timingEvents || [],
      },
    });
    logStage('message_persist_done', { message: 'Final AI chat event written' });
    logStage('response_send', {
      message: 'Sending AI chat response to client',
      total_ms: Date.now() - startedAt,
      quota_after: quotaAfter,
    });
    res.json({
      ok: true,
      message: outputText || '',
      quota: getAiMessageQuotaStatus(req.player.id),
      trace_id: traceId,
      browser_actions: browserActions,
      follow_up_after_browser_actions: followUpAfterBrowserActions,
    });
  } catch (err) {
    if (reservation) {
      try { refundAiChatReservation(req.player.id, reservation); } catch {}
    }
    const durationMs = Date.now() - startedAt;
    const quotaAfter = getAiMessageQuotaStatus(req.player.id);
    const playerError = playerFacingAiError(err, intent);
    logStage('message_error', {
      status: 'error',
      message: 'AI chat request failed',
      model,
      error: err.message,
      player_error: playerError,
      total_ms: durationMs,
    });
    db.markHermesAgentState(req.player.id, { status: 'error', error: err.message });
    logAiChatServer('message_error', {
      trace_id: traceId,
      player_id: req.player.id,
      intent: intent.kind,
      duration_ms: durationMs,
      model,
      status_code: err.status || 500,
      error: aiChatPreview(err.message, 700),
      stack: err.stack ? aiChatPreview(err.stack, 1200) : null,
      quota_after: quotaAfter,
    });
    db.logHermesChatEvent({
      traceId,
      eventType: 'message',
      playerId: req.player.id,
      playerName: req.player.name,
      intent: intent.kind,
      status: 'error',
      durationMs,
      model,
      error: err.message,
      requestPreview: aiChatPreview(message),
      responsePreview: aiChatPreview(playerError, 1200),
      quota: { before: quotaBefore, after: quotaAfter, reservation_refunded: !!reservation },
      input: { trace_id: traceId, idempotency_key: idempotencyKey, message, history },
      output: {
        error: playerError,
        internal_error: err.message,
        body: err.body || null,
      },
    });
    res.status(err.status || 500).json({ ok: false, error: playerError, quota: quotaAfter, trace_id: traceId });
  }
});

router.get('/ai-chat/result/:traceId', auth, (req, res) => {
  res.set('Cache-Control', 'no-store');
  const traceId = String(req.params.traceId || '').trim().slice(0, 80);
  if (!traceId) return res.status(400).json({ ok: false, error: 'trace id required' });
  const row = db.db.prepare(`
    SELECT trace_id, status, duration_ms, error, response_preview, output_json, quota_json, created_at
    FROM hermes_chat_events
    WHERE player_id = ?
      AND trace_id = ?
      AND event_type = 'message'
    ORDER BY id DESC
    LIMIT 1
  `).get(req.player.id, traceId);
  const event = publicAiChatStoredEvent(row);
  if (!event) {
    return res.json({
      ok: true,
      pending: true,
      status: 'pending',
      trace_id: traceId,
      quota: getAiMessageQuotaStatus(req.player.id),
    });
  }
  return res.status(event.status === 'quota_blocked' ? 402 : 200).json(event);
});

router.post('/ai-chat/reset', auth, async (req, res) => {
  try {
    const result = await hermesClient.reset(req.player.id, {
      delete_memory: !!req.body?.delete_memory,
      delete_recent_memory: !!req.body?.delete_recent_memory,
      restart: req.body?.restart !== false,
    });
    const state = db.markHermesAgentState(req.player.id, {
      status: 'ready',
      orchestrator: result,
      provisioned: true,
    });
    res.json({ ok: true, agent: state, hermes: result });
  } catch (err) {
    const state = db.markHermesAgentState(req.player.id, { status: 'error', error: err.message });
    res.status(err.status || 500).json({ ok: false, error: err.message, agent: state });
  }
});

router.post('/agent-events/emit', agentAuth, (req, res) => {
  const action = String(req.body?.action || '').trim();
  const payload = req.body?.payload && typeof req.body.payload === 'object' ? req.body.payload : {};
  if (!action) return res.status(400).json({ error: 'action required' });
  const eventId = crypto.randomUUID();

  const event = {
    type: 'agent_action',
    data: {
      event_id: eventId,
      action,
      payload,
      key: req.agentSession.key,
      at: new Date().toISOString(),
    },
  };
  const delivered = broadcastToPlayer(req.agentSession.player.id, event);
  console.log(`[agent-events] ${action} player=${req.agentSession.player.id.slice(0, 8)} delivered=${delivered} event=${eventId}`);
  res.json({ success: true, delivered, event_id: eventId });
});

router.get('/agent-events/pending', auth, (req, res) => {
  res.json({ events: consumePendingAgentEvents(req.player.id) });
});

// Link a wallet to the current account. Per-DEX canonical: a wallet is
// allowed to be bound to MULTIPLE rows as long as those rows belong to
// different DEXes. Collision check therefore compares against rows on
// the SAME DEX as the current account — binding a wallet that's already
// the Avantis row of a different player still routes the client to that
// canonical row; binding one that only collides with this user's GMX row
// is fine.
router.post('/players/link-wallet', auth, (req, res) => {
  const { wallet } = req.body;
  if (!wallet || !isValidWallet(wallet)) return res.status(400).json({ error: 'Valid wallet required' });

  const current = req.player;
  // Same-DEX collision check. We exclude current.id so a no-op rebind
  // (already bound on this DEX to this user) doesn't trip the switch.
  const existing = (() => {
    const candidates = walletLookupCandidates(wallet);
    if (!candidates.length) return null;
    const placeholders = candidates.map(() => '?').join(',');
    return db.db.prepare(
      `SELECT * FROM players WHERE wallet IN (${placeholders}) AND dex = ? AND id != ? LIMIT 1`
    ).get(...candidates, current.dex, current.id);
  })();

  if (existing) {
    const state = db.getFullPlayerState(existing.id);
    logAuth('Wallet already linked to another account on same DEX; returning canonical token', {
      from_account: current.name, to_account: existing.name, wallet, dex: current.dex,
    });
    return res.json({
      success: true,
      switched_account: true,
      token: existing.token,
      ...state,
    });
  }

  db.db.prepare('UPDATE players SET wallet = ? WHERE id = ?').run(wallet, current.id);
  db.db.prepare('UPDATE trading_rewards SET wallet = ? WHERE player_id = ? AND dex = ?').run(wallet, current.id, current.dex);
  res.json({ success: true, switched_account: false });
});

// Login by wallet address. Per-DEX canonical: caller MUST pass `dex` so we
// can match the right row. Without dex we fall back to "any account this
// wallet owns" for back-compat with old clients (returns highest-trophy
// row). New clients always send dex — see useAuthFlow.js.
router.post('/players/login-wallet', (req, res) => {
  const { wallet, dex } = req.body;
  if (!wallet || !isValidWallet(wallet)) return res.status(400).json({ error: 'Valid wallet required' });

  let player;
  if (VALID_DEXES.has(dex)) {
    player = getPlayerByWalletAndDexAnyForm(wallet, dex);
  } else {
    player = getPlayerByWalletAnyForm(wallet);
  }
  if (!player) return res.status(404).json({ error: 'No account found for this wallet on this DEX' });
  const state = db.getFullPlayerState(player.id);
  res.json({ ...state, token: player.token });
});

// ==================== RESOURCES ====================

// Get current resources
router.get('/resources', auth, (req, res) => {
  res.json(db.getResources(req.player.id));
});

// Add resources (admin only — players earn resources through gameplay)
router.post('/resources/add', adminAuth, (req, res) => {
  const { gold = 0, wood = 0, ore = 0 } = req.body;
  if (typeof gold !== 'number' || typeof wood !== 'number' || typeof ore !== 'number') {
    return res.status(400).json({ error: 'gold, wood, ore must be numbers' });
  }
  if (gold < 0 || wood < 0 || ore < 0) {
    return res.status(400).json({ error: 'Values must be non-negative. Use /resources/subtract instead' });
  }
  const result = db.addResources(req.player.id, gold, wood, ore, {
    sourceType: 'admin_resource_add',
    metadata: { route: '/resources/add' },
  });
  res.json(result);
});

// Subtract resources (admin only)
router.post('/resources/subtract', adminAuth, (req, res) => {
  const { gold = 0, wood = 0, ore = 0 } = req.body;
  if (typeof gold !== 'number' || typeof wood !== 'number' || typeof ore !== 'number') {
    return res.status(400).json({ error: 'gold, wood, ore must be numbers' });
  }
  if (gold < 0 || wood < 0 || ore < 0) {
    return res.status(400).json({ error: 'Values must be non-negative' });
  }
  const result = db.subtractResources(req.player.id, gold, wood, ore, {
    sourceType: 'admin_resource_subtract',
    metadata: { route: '/resources/subtract' },
  });
  if (result.error) return res.status(400).json(result);
  res.json(result);
});

// Set resources directly (admin only)
router.post('/resources/set', adminAuth, (req, res) => {
  const { gold, wood, ore } = req.body;
  const current = db.getResources(req.player.id);
  const newGold = typeof gold === 'number' ? Math.max(0, gold) : current.gold;
  const newWood = typeof wood === 'number' ? Math.max(0, wood) : current.wood;
  const newOre = typeof ore === 'number' ? Math.max(0, ore) : current.ore;
  const result = db.addResources(req.player.id,
    newGold - current.gold,
    newWood - current.wood,
    newOre - current.ore,
    {
      sourceType: 'admin_resource_set',
      metadata: { route: '/resources/set' },
    },
  );
  res.json(result);
});

// ==================== BUILDINGS ====================

// List all player buildings
router.get('/buildings', auth, (req, res) => {
  res.json(db.getPlayerBuildings(req.player.id));
});

// Place a building
// Grid is 20x20 cells by design (matches client grid_width/grid_height).
// Cap coordinates server-side so a tampered client can't place buildings
// at grid_x=-999999 — would never collide with legitimate buildings and
// could be abused for defensive "hiding" or resource-locking exploits.
const GRID_MAX_COORD = 40; // generous ceiling; real grids are ≤20 per axis
router.post('/buildings/place', auth, (req, res) => {
  const { type, grid_x, grid_z, grid_index = 0 } = req.body;
  if (!type || grid_x == null || grid_z == null) {
    return res.status(400).json({ error: 'type, grid_x, grid_z are required' });
  }
  if (!Number.isInteger(grid_x) || !Number.isInteger(grid_z)) {
    return res.status(400).json({ error: 'grid_x and grid_z must be integers' });
  }
  if (grid_x < 0 || grid_x > GRID_MAX_COORD || grid_z < 0 || grid_z > GRID_MAX_COORD) {
    return res.status(400).json({ error: `grid_x and grid_z must be in [0, ${GRID_MAX_COORD}]` });
  }
  if (!Number.isInteger(grid_index) || ![0, 1, 2].includes(grid_index)) {
    return res.status(400).json({ error: 'grid_index must be 0, 1, or 2' });
  }
  const result = db.placeBuilding(req.player.id, type, grid_x, grid_z, grid_index);
  if (result.error) return res.status(400).json(result);
  res.json(result);
});

// Collect resources from a production building
router.post('/buildings/:id/collect', auth, (req, res) => {
  const buildingId = parseInt(req.params.id, 10);
  if (isNaN(buildingId)) return res.status(400).json({ error: 'Invalid building ID' });
  const result = db.collectResources(req.player.id, buildingId);
  if (result.error) return res.status(400).json(result);
  if (result.collected > 0) logEconomy('collect', { player: req.player.id, resource: result.resource, amount: result.collected });
  res.json(result);
});

// Get production status for all resource buildings
router.get('/buildings/production', auth, (req, res) => {
  res.json(db.getProductionStatus(req.player.id));
});

// Upgrade a building
router.post('/buildings/:id/upgrade', auth, (req, res) => {
  const buildingId = parseInt(req.params.id, 10);
  if (isNaN(buildingId)) return res.status(400).json({ error: 'Invalid building ID' });
  const result = db.upgradeBuilding(req.player.id, buildingId);
  if (result.error) return res.status(400).json(result);
  res.json(result);
});

// Move a building to a new grid position
router.post('/buildings/:id/move', auth, (req, res) => {
  const buildingId = parseInt(req.params.id, 10);
  if (isNaN(buildingId)) return res.status(400).json({ error: 'Invalid building ID' });
  const grid_x = parseInt(req.body.grid_x, 10);
  const grid_z = parseInt(req.body.grid_z, 10);
  if (!Number.isInteger(grid_x) || !Number.isInteger(grid_z)) return res.status(400).json({ error: 'Valid integer grid_x and grid_z required' });
  if (grid_x < 0 || grid_x > GRID_MAX_COORD || grid_z < 0 || grid_z > GRID_MAX_COORD) {
    return res.status(400).json({ error: `grid_x and grid_z must be in [0, ${GRID_MAX_COORD}]` });
  }
  const grid_index = req.body.grid_index == null ? null : parseInt(req.body.grid_index, 10);
  if (grid_index != null && (!Number.isInteger(grid_index) || ![0, 1, 2].includes(grid_index))) {
    return res.status(400).json({ error: 'grid_index must be 0, 1, or 2' });
  }
  const result = db.moveBuilding(req.player.id, buildingId, grid_x, grid_z, grid_index);
  if (result.error) return res.status(result.error === 'Building not found' ? 404 : 400).json(result);
  res.json(result);
});

// Buy a ship at a port
router.post('/buildings/:id/buy-ship', auth, (req, res) => {
  const buildingId = parseInt(req.params.id, 10);
  if (isNaN(buildingId)) return res.status(400).json({ error: 'Invalid building ID' });
  const result = db.buyShip(req.player.id, buildingId);
  if (result.error) return res.status(400).json(result);
  res.json(result);
});

// Remove a building
router.delete('/buildings/:id', auth, (req, res) => {
  const buildingId = parseInt(req.params.id, 10);
  if (isNaN(buildingId)) return res.status(400).json({ error: 'Invalid building ID' });
  const result = db.removeBuilding(req.player.id, buildingId);
  if (result.error) return res.status(404).json(result);
  res.json(result);
});

// ==================== BATTLE ====================

// Submit battle replay for verification
// Remove casualties from player's ship_troops after battle.
// casualties = {Knight: 1, Mage: 2} — removes that many of each type across all ships.
// Validates: casualty counts can't exceed what was actually deployed.
const TROOP_NAME_MAP = {
  knight: 'Knight',
  mage: 'Mage',
  barbarian: 'Barbarian',
  archer: 'Archer',
  ranger: 'Ranger',
  demonking: 'DemonKing',
  demon_king: 'DemonKing',
  firedragon: 'FireDragon',
  fire_dragon: 'FireDragon',
};
function _troopBaseKey(name) {
  return String(name || '').split(':')[0].toLowerCase();
}
function _normalizeTroopName(name) {
  return TROOP_NAME_MAP[_troopBaseKey(name)] || String(name || '');
}
function _isSlotFiller(name) {
  return String(name || '') === '_SLOT_FILLER_';
}
function _isDemonKing(name) {
  return _normalizeTroopName(name) === 'DemonKing';
}
function _serverTroopKey(name) {
  const normalized = _normalizeTroopName(name);
  if (normalized === 'DemonKing') return 'demon_king';
  if (normalized === 'FireDragon') return 'fire_dragon';
  return String(normalized || '').toLowerCase();
}
function _isHeavyTroop(name) {
  const normalized = _normalizeTroopName(name);
  return normalized === 'DemonKing' || normalized === 'FireDragon';
}
function _isDisabledTroopName(name) {
  return db.isTroopDisabled(_normalizeTroopName(name));
}
function _disabledTroopPayload(name) {
  return {
    error: 'Troop disabled',
    code: 'TROOP_DISABLED',
    troop_name: _normalizeTroopName(name),
  };
}
function _activeTroopError(name) {
  const normalized = _normalizeTroopName(name);
  return _isDisabledTroopName(normalized)
    ? _disabledTroopPayload(normalized)
    : { error: 'Invalid troop type' };
}
function _canonicalTroopEntry(name) {
  const normalized = _normalizeTroopName(name);
  if (normalized !== 'DemonKing') return normalized;
  const raw = String(name || '').trim();
  return raw.startsWith('DemonKing:') ? raw : 'DemonKing';
}
function _demonKingEntryKey(name) {
  const parsed = parseDemonKingTroopEntry(name);
  if (parsed.error) return String(name || '');
  return `${parsed.chainKey}:${parsed.tokenIdRaw}`.toLowerCase();
}
function _loadedDemonKingTokenKeys(playerId) {
  const keys = new Set();
  const ports = db.db.prepare('SELECT ship_troops FROM buildings WHERE player_id = ? AND type = ? AND has_ship = 1').all(playerId, 'port');
  for (const port of ports) {
    let troops = [];
    try { troops = JSON.parse(port.ship_troops || '[]'); } catch { troops = []; }
    for (const troop of troops) {
      if (_isSlotFiller(troop)) continue;
      const parsed = parseDemonKingTroopEntry(troop);
      if (parsed.error) continue;
      keys.add(`${parsed.chainKey}:${parsed.tokenIdRaw}`.toLowerCase());
    }
  }
  return keys;
}
function _findLoadedDemonKingToken(playerId, tokenKey, options = {}) {
  const expectedKey = String(tokenKey || '').toLowerCase();
  if (!expectedKey) return null;
  const exceptBuildingId = Number(options.exceptBuildingId || 0);
  const exceptStart = Number.isInteger(options.exceptStart) ? options.exceptStart : null;
  const exceptEnd = Number.isInteger(options.exceptEnd) ? options.exceptEnd : null;
  const ports = db.db.prepare('SELECT id, ship_troops FROM buildings WHERE player_id = ? AND type = ? AND has_ship = 1').all(playerId, 'port');
  for (const port of ports) {
    let troops = [];
    try { troops = JSON.parse(port.ship_troops || '[]'); } catch { troops = []; }
    for (let index = 0; index < troops.length; index++) {
      const troop = troops[index];
      if (_isSlotFiller(troop)) continue;
      if (port.id === exceptBuildingId && exceptStart !== null && exceptEnd !== null && index >= exceptStart && index < exceptEnd) {
        continue;
      }
      const parsed = parseDemonKingTroopEntry(troop);
      if (parsed.error) continue;
      const key = `${parsed.chainKey}:${parsed.tokenIdRaw}`.toLowerCase();
      if (key === expectedKey) return { buildingId: port.id, slot: index };
    }
  }
  return null;
}
function _firstDuplicateLoadedDemonKingToken(playerId) {
  const seen = new Map();
  const ports = db.db.prepare('SELECT id, ship_troops FROM buildings WHERE player_id = ? AND type = ? AND has_ship = 1').all(playerId, 'port');
  for (const port of ports) {
    let troops = [];
    try { troops = JSON.parse(port.ship_troops || '[]'); } catch { troops = []; }
    for (let index = 0; index < troops.length; index++) {
      const troop = troops[index];
      if (_isSlotFiller(troop)) continue;
      const parsed = parseDemonKingTroopEntry(troop);
      if (parsed.error) continue;
      const key = `${parsed.chainKey}:${parsed.tokenIdRaw}`.toLowerCase();
      const previous = seen.get(key);
      if (previous) return { key, first: previous, duplicate: { buildingId: port.id, slot: index } };
      seen.set(key, { buildingId: port.id, slot: index });
    }
  }
  return null;
}
function _firstDuplicateDemonKingTokenInShipActions(actions = []) {
  const seen = new Map();
  for (const action of Array.isArray(actions) ? actions : []) {
    if (action?.type !== 'place_ship') continue;
    const troops = Array.isArray(action.troops)
      ? action.troops
      : (action.troopType ? [action.troopType] : []);
    for (let index = 0; index < troops.length; index++) {
      const troop = troops[index];
      if (_isSlotFiller(troop)) continue;
      const parsed = parseDemonKingTroopEntry(troop);
      if (parsed.error) continue;
      const key = `${parsed.chainKey}:${parsed.tokenIdRaw}`.toLowerCase();
      const previous = seen.get(key);
      const current = { shipIndex: action.ship_index ?? action.shipIndex ?? null, troopIndex: index };
      if (previous) return { key, first: previous, duplicate: current };
      seen.set(key, current);
    }
  }
  return null;
}
function _demonKingWinTokensFromActions(actions, playerId) {
  const loadedKeys = _loadedDemonKingTokenKeys(playerId);
  const tokens = new Map();
  for (const action of Array.isArray(actions) ? actions : []) {
    if (action?.type !== 'place_ship') continue;
    const troops = Array.isArray(action.troops)
      ? action.troops
      : (action.troopType ? [action.troopType] : []);
    for (const troop of troops) {
      if (_isSlotFiller(troop)) continue;
      const parsed = parseDemonKingTroopEntry(troop);
      if (parsed.error) continue;
      const key = `${parsed.chainKey}:${parsed.tokenIdRaw}`.toLowerCase();
      if (!loadedKeys.has(key)) continue;
      tokens.set(key, { chain: parsed.chainKey, tokenId: parsed.tokenIdRaw });
    }
  }
  return [...tokens.values()];
}
function _troopSlotCost(name) {
  return _isHeavyTroop(name) ? 2 : 1;
}
function _appendTroopSlots(shipTroops, troopName) {
  const normalized = _normalizeTroopName(troopName);
  shipTroops.push(_canonicalTroopEntry(troopName));
  for (let i = 1; i < _troopSlotCost(normalized); i++) shipTroops.push('_SLOT_FILLER_');
}
function _troopUnitSpanAt(shipTroops, index) {
  if (!Array.isArray(shipTroops) || index < 0 || index >= shipTroops.length) return null;
  let start = index;
  if (_isSlotFiller(shipTroops[start])) {
    while (start > 0 && _isSlotFiller(shipTroops[start])) start--;
    if (_isSlotFiller(shipTroops[start])) return null;
  }
  let end = start + 1;
  while (end < shipTroops.length && _isSlotFiller(shipTroops[end])) end++;
  return { start, end };
}
function _swapSpanForReplacement(shipTroops, slot, replacementName, capacity) {
  if (!Array.isArray(shipTroops) || !Number.isInteger(slot) || slot < 0 || slot >= shipTroops.length) return null;
  if (_isSlotFiller(shipTroops[slot])) return null;
  const selected = _troopUnitSpanAt(shipTroops, slot);
  if (!selected) return null;

  let start = selected.start;
  let end = selected.end;
  const replacementSlots = _troopSlotCost(replacementName);
  const avoidImplicitHeavyRemoval = replacementSlots > 1;
  const canAutoRemove = (span) => {
    if (!span) return false;
    return !(avoidImplicitHeavyRemoval && _troopSlotCost(shipTroops[span.start]) > 1);
  };
  const nextLength = () => shipTroops.length - (end - start) + replacementSlots;

  while (nextLength() > capacity) {
    const right = _troopUnitSpanAt(shipTroops, end);
    if (right && right.start === end && canAutoRemove(right)) {
      end = right.end;
      continue;
    }
    const left = _troopUnitSpanAt(shipTroops, start - 1);
    if (left && left.end === start && canAutoRemove(left)) {
      start = left.start;
      continue;
    }
    return null;
  }

  return { start, end };
}

function _parseShipTroopsArray(value) {
  if (Array.isArray(value)) return value.map((item) => String(item));
  if (typeof value === 'string' && value.trim()) {
    try {
      const parsed = JSON.parse(value);
      return Array.isArray(parsed) ? parsed.map((item) => String(item)) : null;
    } catch {
      return null;
    }
  }
  return null;
}

function _shipTroopsMatch(a, b) {
  const left = _parseShipTroopsArray(a);
  const right = _parseShipTroopsArray(b);
  if (!left || !right || left.length !== right.length) return false;
  for (let i = 0; i < left.length; i++) {
    if (String(left[i]) !== String(right[i])) return false;
  }
  return true;
}

function _filterDisabledTroopEntries(troops) {
  if (!Array.isArray(troops)) return [];
  const out = [];
  for (const troop of troops) {
    if (_isSlotFiller(troop)) {
      if (out.length > 0 && _troopSlotCost(out[out.length - 1]) > 1) out.push(troop);
      continue;
    }
    if (_isDisabledTroopName(troop)) continue;
    out.push(troop);
  }
  return out;
}

function _sanitizeDisabledShipTroopsForPlayer(playerId) {
  const ports = db.db.prepare(
    'SELECT id, ship_troops, ship_troops_template FROM buildings WHERE player_id = ? AND type = ?'
  ).all(playerId, 'port');
  let changed = 0;

  for (const port of ports) {
    let current = [];
    let template = [];
    try { current = JSON.parse(port.ship_troops || '[]'); } catch { current = []; }
    try { template = JSON.parse(port.ship_troops_template || '[]'); } catch { template = []; }

    const nextCurrent = _filterDisabledTroopEntries(current);
    const nextTemplate = _filterDisabledTroopEntries(template);
    if (
      JSON.stringify(current) === JSON.stringify(nextCurrent)
      && JSON.stringify(template) === JSON.stringify(nextTemplate)
    ) {
      continue;
    }

    db.db.prepare('UPDATE buildings SET ship_troops = ?, ship_troops_template = ? WHERE id = ?')
      .run(JSON.stringify(nextCurrent), JSON.stringify(nextTemplate), port.id);
    changed += 1;
  }

  return changed;
}

function _resolvePlayerShipEditBuilding(playerId, buildingId, body = {}) {
  const byId = db.db.prepare('SELECT * FROM buildings WHERE id = ? AND player_id = ?').get(buildingId, playerId);
  if (byId) return { building: byId, matchedBy: 'id' };

  const ports = db.db.prepare(
    'SELECT * FROM buildings WHERE player_id = ? AND type = ? AND has_ship = 1 ORDER BY grid_index ASC, grid_x ASC, grid_z ASC, id ASC'
  ).all(playerId, 'port');
  if (!ports.length) return { building: null, matchedBy: null };

  const gridIndex = Number(body.grid_index);
  const gridX = Number(body.grid_x);
  const gridZ = Number(body.grid_z);
  if (Number.isInteger(gridIndex) && Number.isInteger(gridX) && Number.isInteger(gridZ)) {
    const byGrid = ports.find((port) => (
      Number(port.grid_index) === gridIndex
      && Number(port.grid_x) === gridX
      && Number(port.grid_z) === gridZ
    ));
    if (byGrid) return { building: byGrid, matchedBy: 'grid' };
  }

  const clientTroops = _parseShipTroopsArray(body.ship_troops);
  if (clientTroops) {
    const byTroops = ports.filter((port) => _shipTroopsMatch(port.ship_troops, clientTroops));
    if (byTroops.length === 1) return { building: byTroops[0], matchedBy: 'ship_troops' };
  }

  const portNumber = Number(body.port_number);
  if (Number.isInteger(portNumber) && portNumber > 0 && portNumber <= ports.length) {
    return { building: ports[portNumber - 1], matchedBy: 'port_number' };
  }

  return { building: null, matchedBy: null };
}

function _applyCasualties(playerId, casualties) {
  const applied = {};
  if (!casualties || typeof casualties !== 'object') return applied;

  // Count total deployed troops across all ships
  const ports = db.db.prepare('SELECT id, ship_troops, ship_troops_template FROM buildings WHERE player_id = ? AND type = ? AND has_ship = 1').all(playerId, 'port');
  // Count from actual ship_troops (not template) — template may differ after swaps
  const deployed = {};
  for (const port of ports) {
    const troops = JSON.parse(port.ship_troops || '[]');
    for (const t of troops) {
      if (_isSlotFiller(t)) continue;
      const name = _normalizeTroopName(t);
      deployed[name] = (deployed[name] || 0) + 1;
    }
  }

  // Cap casualties to deployed counts (prevent client from claiming more losses than deployed)
  const validCasualties = {};
  for (const [name, count] of Object.entries(casualties)) {
    if (typeof count !== 'number' || count <= 0) continue;
    const normalized = _normalizeTroopName(name);
    // Demon King is NFT-backed and reusable. It can die in combat, but it
    // should not be removed from the saved ship loadout or appear as a paid
    // reinforcement casualty.
    if (normalized === 'DemonKing') continue;
    validCasualties[normalized] = Math.min(
      (validCasualties[normalized] || 0) + count,
      deployed[normalized] || 0
    );
  }

  const remaining = { ...validCasualties };
  for (const port of ports) {
    const troops = JSON.parse(port.ship_troops || '[]');
    const filtered = [];
    let skipNextFiller = false;
    for (const t of troops) {
      if (skipNextFiller && _isSlotFiller(t)) {
        skipNextFiller = false;
        continue;
      }
      skipNextFiller = false;
      const name = _normalizeTroopName(t);
      if (remaining[name] && remaining[name] > 0) {
        remaining[name]--;
        applied[name] = (applied[name] || 0) + 1;
        if (_troopSlotCost(name) > 1) skipNextFiller = true;
      } else {
        filtered.push(t);
      }
    }
    if (filtered.length !== troops.length) {
      db.db.prepare('UPDATE buildings SET ship_troops = ? WHERE id = ?').run(JSON.stringify(filtered), port.id);
    }
  }

  // Defensive log: if any casualties weren't applied, /troop-died removed them first,
  // or client's dict diverged from server state — worth noticing.
  const leftover = Object.entries(remaining).filter(([, c]) => c > 0);
  if (leftover.length > 0) {
    console.log(`[CASUALTIES] Player ${playerId} had ${leftover.length} casualty types not applied (already removed or desync):`, leftover);
  }
  return applied;
}

function _paidCasualties(casualties) {
  const out = {};
  for (const [name, count] of Object.entries(casualties || {})) {
    const normalized = _normalizeTroopName(name);
    if (normalized === 'DemonKing') continue;
    if (typeof count === 'number' && count > 0) out[normalized] = (out[normalized] || 0) + count;
  }
  return out;
}

// Returns current ship_troops for all ports as [{id, level, ship_troops, ship_troops_template}].
// Used to push the authoritative post-battle state back to the client in /attack/result response.
function _getShipsPayload(playerId) {
  _sanitizeDisabledShipTroopsForPlayer(playerId);
  const ports = db.db.prepare('SELECT id, level, ship_troops, ship_troops_template, has_ship FROM buildings WHERE player_id = ? AND type = ?').all(playerId, 'port');
  return ports.filter(p => p.has_ship).map(p => ({
    id: p.id,
    level: p.level,
    ship_troops: JSON.parse(p.ship_troops || '[]'),
    ship_troops_template: JSON.parse(p.ship_troops_template || '[]'),
  }));
}

router.post('/attack/result', auth, (req, res) => {
  const { defender_id, actions, result: claimedResult, battle_session_id } = req.body;
  if (!defender_id) return res.status(400).json({ error: 'defender_id required' });
  if (!actions || !Array.isArray(actions)) return res.status(400).json({ error: 'actions replay required' });
  if (!claimedResult) return res.status(400).json({ error: 'result required (victory/defeat)' });

  const defenderBuildings = db.getPlayerBuildings(defender_id);
  if (!defenderBuildings || defenderBuildings.length === 0) {
    return res.status(400).json({ error: 'Defender has no buildings' });
  }

  // Extract grid_config from battle_start action
  const battleStartAction = actions.find(a => a.type === 'battle_start');
  const gridConfig = battleStartAction?.grid_config;
  const gridConfigs = battleStartAction?.grid_configs;
  const battleSessionId = String(battle_session_id || battleStartAction?.battle_session_id || '').trim();
  const gameActions = actions.filter(a => a.type !== 'battle_start');
  const releaseBattleSession = (status = 'cancelled') => {
    if (!battleSessionId) return;
    try { db.finishBattleSession(battleSessionId, req.player.id, defender_id, status); } catch {}
  };

  const sessionCheck = db.validateBattleSession(battleSessionId, req.player.id, defender_id);
  if (!sessionCheck.ok) {
    db.storeReplay(req.player.id, defender_id, actions, defenderBuildings, claimedResult, 'error', sessionCheck.error, null, null);
    return res.status(409).json({ error: sessionCheck.error });
  }

  // Basic validation
  const shipActions = gameActions.filter(a => a.type === 'place_ship');
  const replayWarnings = [];
  if (claimedResult === 'victory' && shipActions.length === 0) {
    replayWarnings.push('No ships deployed');
    if (STRICT_BATTLE_REPLAY_VERIFICATION) {
      releaseBattleSession('cancelled');
      db.storeReplay(req.player.id, defender_id, actions, defenderBuildings, claimedResult, 'rejected', 'No ships', null, null);
      return res.status(403).json({ error: 'No ships deployed' });
    }
  }
  if (shipActions.length > 5) {
    replayWarnings.push(`Too many ships in replay (${shipActions.length})`);
    if (STRICT_BATTLE_REPLAY_VERIFICATION) {
      releaseBattleSession('cancelled');
      db.storeReplay(req.player.id, defender_id, actions, defenderBuildings, claimedResult, 'rejected', 'Too many ships', null, null);
      return res.status(403).json({ error: 'Too many ships in replay' });
    }
  }
  const duplicateReplayDemonKing = _firstDuplicateDemonKingTokenInShipActions(gameActions);
  if (duplicateReplayDemonKing) {
    releaseBattleSession('cancelled');
    db.storeReplay(req.player.id, defender_id, actions, defenderBuildings, claimedResult, 'rejected', 'Duplicate Demon King NFT in replay', null, null);
    return res.status(403).json({
      error: 'Each Demon King NFT can only be deployed once per battle',
      code: 'DEMON_KING_NFT_DUPLICATE_REPLAY',
    });
  }

  // Cap troop levels to server-verified values (prevent level spoofing)
  const troopLevelRows = db.getTroopLevels(req.player.id);
  const serverTroopLevels = {};
  for (const row of troopLevelRows) serverTroopLevels[row.troop_type] = row.level;
  for (const act of gameActions) {
    if (act.type === 'place_ship' && act.troopType && act.troopLevel) {
      const normalizedTroop = _normalizeTroopName(act.troopType);
      const serverKey = _serverTroopKey(normalizedTroop);
      const serverLvl = serverTroopLevels[serverKey] || 1;
      act.troopLevel = Math.min(act.troopLevel, serverLvl);
    }
  }

  // Run server simulation verification
  const { verifyReplay } = require('./combat_session');
  const verification = verifyReplay({
    defenderBuildings,
    actions: gameActions,
    claimedResult,
    gridConfig,
    gridConfigs,
    serverTroopLevels,
    defenderAltarLevels: db.getAltarSkillLevels(defender_id),
    debugTrace: BATTLE_DEBUG_TRACE,
  });

  const replayReasonParts = [...replayWarnings, verification.reason].filter(Boolean);
  const replayReason = replayReasonParts.join(' | ') || 'No reason';
  const replayStatus = verification.valid
    ? (replayWarnings.length ? 'REPLAY_WARNING' : 'ACCEPTED')
    : (STRICT_BATTLE_REPLAY_VERIFICATION ? 'REJECTED' : 'SIM_MISMATCH_ALLOWED');
  const storedAcceptReason = replayStatus === 'ACCEPTED'
    ? verification.reason
    : `${replayStatus}: ${replayReason}`;
  const serverResolvedResult = verification.resolvedResult || (
    (verification.townHallDestroyed || (verification.townHallHpPct ?? 1) <= 0.02) ? 'victory' : 'defeat'
  );

  logBattle(`${claimedResult}->${serverResolvedResult} ${replayStatus}`, {
    attacker: req.player.id, defender: defender_id,
    reason: replayReason,
    thHp: Math.round((verification.townHallHpPct || 0) * 100) + '%',
    ships: gameActions.filter(a => a.type === 'place_ship').length,
    rallies: gameActions.filter(a => a.type === 'rally_drop').length,
    destroyed: verification.buildingsDestroyed,
  });
  console.log(`[BATTLE] ${claimedResult}->${serverResolvedResult} ${replayStatus} by ${req.player.id} vs ${defender_id}: ${replayReason} (TH ${Math.round((verification.townHallHpPct || 0) * 100)}%)`);
  console.log(`[BATTLE] Ships: ${gameActions.filter(a => a.type === 'place_ship').length}, Rallies: ${gameActions.filter(a => a.type === 'rally_drop').length}, Troops spawned: ${verification._troopsSpawned || '?'}, Buildings destroyed: ${verification.buildingsDestroyed}`);
  console.log(`[BATTLE] Actions:`, JSON.stringify(gameActions.filter(a => a.type === 'place_ship').map(a => ({t: a.t, troops: a.troops, troopType: a.troopType, x: a.x?.toFixed(2), z: a.z?.toFixed(2)}))));
  console.log(`[BATTLE] Grid:`, JSON.stringify(gridConfig));
  if (gridConfigs) console.log(`[BATTLE] Grids:`, JSON.stringify(gridConfigs));
  console.log(`[BATTLE] TroopLevels:`, JSON.stringify(serverTroopLevels));
  console.log(`[BATTLE] Defender buildings:`, defenderBuildings.length, defenderBuildings.map(b => `${b.type}:lv${b.level}:hp${b.hp}`).join(', '));
  if (BATTLE_DEBUG_TRACE) {
    console.log(`[BATTLE TRACE] events=${verification._traceEvents || 0} dropped=${verification._traceDropped || 0} aliveTroops=${verification._troopsAlive || 0} simDebug=stored`);
  }

  if (!verification.valid) {
    const simDebug = {
      reason: replayReason,
      troopsSpawned: verification._troopsSpawned,
      troopsAlive: verification._troopsAlive,
      guardsAlive: verification._guardsAlive,
      simTimeSec: verification._simTimeSec,
      buildingsDestroyed: verification.buildingsDestroyed,
      strict: STRICT_BATTLE_REPLAY_VERIFICATION,
    };
    // Debug info logged server-side only — never expose sim internals to client
    if (STRICT_BATTLE_REPLAY_VERIFICATION) {
      releaseBattleSession('cancelled');
      db.storeReplay(req.player.id, defender_id, actions, defenderBuildings, claimedResult, 'rejected', replayReason, null, verification);
      console.log('[SIM REJECT]', JSON.stringify(simDebug));
      return res.status(403).json({ error: 'Replay verification failed', reason: verification.reason });
    }
    console.log('[SIM MISMATCH ALLOWED]', JSON.stringify(simDebug));
  }

  // Victory verified — grant loot
  if (serverResolvedResult === 'victory') {
    const demonKingWinTokens = _demonKingWinTokensFromActions(gameActions, req.player.id);
    const battleResult = db.battleVictory(req.player.id, defender_id, battleSessionId);
    if (battleResult.error) {
      db.storeReplay(req.player.id, defender_id, actions, defenderBuildings, claimedResult, 'error', battleResult.error, null, verification);
      return res.status(400).json(battleResult);
    }
    const replayId = db.storeReplay(req.player.id, defender_id, actions, defenderBuildings, claimedResult, 'accepted', storedAcceptReason, battleResult.loot, verification);
    let demonKingNftWins = [];
    try {
      demonKingNftWins = db.recordDemonKingBattleWinEvents(replayId, req.player.id, demonKingWinTokens);
    } catch (err) {
      console.warn('[BATTLE] Demon King NFT win record failed:', err?.message || err);
    }
    // Apply casualties exactly once from the authoritative replay result.
    // /troop-died is now telemetry-only; mutating ships there caused double
    // removal when the final replay result was submitted.
    const appliedCasualties = _applyCasualties(req.player.id, verification.casualties);
    // Return authoritative post-casualty ship state so client can sync immediately
    return res.json({
      ...battleResult,
      ships: _getShipsPayload(req.player.id),
      casualties: _paidCasualties(appliedCasualties),
      demon_king_nft_wins: demonKingNftWins,
    });
  }

  // Defeat — attacker loses trophies, defender gains
  const defeatResult = db.battleDefeat(req.player.id, defender_id, battleSessionId);
  db.storeReplay(req.player.id, defender_id, actions, defenderBuildings, claimedResult, 'accepted', replayStatus === 'ACCEPTED' ? 'Defeat' : storedAcceptReason, null, verification);

  // Remove server-simulated casualties from attacker's ships.
  const appliedCasualties = _applyCasualties(req.player.id, verification.casualties);

  res.json({
    success: true,
    loot: { gold: 0, wood: 0, ore: 0 },
    trophies: defeatResult.attackerTrophies,
    ships: _getShipsPayload(req.player.id),
    casualties: _paidCasualties(appliedCasualties),
  });
});

// ==================== TROOPS ====================

// Get troop levels
router.get('/troops', auth, (req, res) => {
  res.json(db.getTroopLevels(req.player.id));
});

router.get('/troops/demon_king/upgrade-status', auth, (req, res) => {
  res.json(db.getDemonKingUpgradeStatus(req.player.id, {
    chain: req.query?.chain,
    tokenId: req.query?.tokenId ?? req.query?.token_id,
  }));
});

// Upgrade a troop
router.post('/troops/:type/upgrade', auth, async (req, res) => {
  const type = _serverTroopKey(req.params.type);
  let upgradeOptions = {};
  if (type === 'demon_king') {
    const proof = {
      ...(req.body?.nft || {}),
      ...req.body,
    };
    upgradeOptions = {
      chain: proof.chain,
      tokenId: proof.tokenId ?? proof.token_id,
      nftChain: proof.chain,
      nftTokenId: proof.tokenId ?? proof.token_id,
    };
    const status = db.getDemonKingUpgradeStatus(req.player.id, {
      chain: proof.chain,
      tokenId: proof.tokenId ?? proof.token_id,
    });
    const nextLevel = status.next_level;
    if (nextLevel && status.wins_ready && proof.chain) {
      const verified = await verifyDemonKingNftUpgradeProof(req.player, proof, nextLevel);
      if (verified.error) return res.status(verified.status || 400).json({ ...status, ...verified });
      upgradeOptions = verified;
    }
  }
  const result = db.upgradeTroop(req.player.id, type, upgradeOptions);
  if (result.error) return res.status(result.status || 400).json(result);
  logEconomy('troop_upgrade', { player: req.player.id, troop: type, level: result.level });
  res.json(result);
});

// ==================== ALTAR SKILLS ====================

router.get('/altar/skills', auth, (req, res) => {
  res.json({
    levels: db.getAltarSkillLevels(req.player.id),
    defs: db.ALTAR_SKILL_DEFS,
  });
});

router.post('/altar/skills/:skillId/upgrade', auth, (req, res) => {
  const skillId = String(req.params.skillId || '').trim();
  const result = db.upgradeAltarSkill(req.player.id, skillId);
  if (result.error) return res.status(400).json(result);
  logEconomy('altar_skill_upgrade', { player: req.player.id, skill: skillId, level: result.level });
  res.json(result);
});

// ==================== MATCHMAKING ====================

// Surrender — lightweight battle exit. Doesn't write a battle_replays row,
// doesn't move trophies or loot; just stamps the matchmaker cooldown so
// /find-enemy excludes this defender from this attacker's pool for 24h.
router.post('/battle/surrender', auth, (req, res) => {
  const defenderId = String(req.body?.defender_id || '').trim();
  if (!defenderId) return res.status(400).json({ error: 'defender_id required' });
  if (defenderId === req.player.id) return res.status(400).json({ error: 'Cannot surrender to yourself' });
  const sessionId = String(req.body?.battle_session_id || req.body?.session_id || '').trim();
  const stamped = db.markSurrender(req.player.id, defenderId, sessionId);
  res.json({ ok: true, stamped, cooldown_hours: 24 });
});

// Find enemy with closest trophies
router.get('/find-enemy', auth, (req, res) => {
  // Pre-flight: player must have a port with a ship loaded with troops
  _sanitizeDisabledShipTroopsForPlayer(req.player.id);
  const buildings = db.getPlayerBuildings(req.player.id);
  const ports = buildings.filter(b => b.type === 'port');
  if (ports.length === 0) {
    return res.status(400).json({ error: 'You need a Port to attack. Build one first.' });
  }
  const portsWithShips = ports.filter(p => p.has_ship === 1);
  if (portsWithShips.length === 0) {
    return res.status(400).json({ error: 'You need a Ship to attack. Buy one at your Port.' });
  }
  let totalTroopsLoaded = 0;
  for (const p of portsWithShips) {
    try {
      const troops = JSON.parse(p.ship_troops || '[]');
      totalTroopsLoaded += troops.length;
    } catch {}
  }
  if (totalTroopsLoaded === 0) {
    return res.status(400).json({ error: 'No troops loaded on your ships. Train troops at the Barn first.' });
  }
  const duplicateDemonKing = _firstDuplicateLoadedDemonKingToken(req.player.id);
  if (duplicateDemonKing) {
    return res.status(409).json({
      error: 'One Demon King NFT is loaded on multiple ships. Unload the duplicate before attacking.',
      code: 'DEMON_KING_NFT_DUPLICATE_LOADED',
    });
  }

  const result = db.findEnemy(req.player.id);
  if (result.error) {
    logBattle('find_enemy failed', { player: req.player.id, error: result.error, attack_cost_gold: result.attack_cost_gold });
    return res.status(result.status || 404).json(result);
  }
  logBattle('find_enemy', { attacker: req.player.id, defender: result.id, name: result.name, battle_session_id: result.battle_session_id, attack_cost_gold: result.attack_cost_gold });
  res.json(result);
});


// ==================== BATTLE LOG ====================

function _battleLogDisplayDuration(replayData, storedDuration) {
  const actions = Array.isArray(replayData?.actions)
    ? replayData.actions
    : (Array.isArray(replayData) ? replayData : []);
  const battleEndTimes = actions
    .map(a => (a?.type === 'battle_end' ? Number(a?.t) : NaN))
    .filter(t => Number.isFinite(t) && t > 0);
  if (battleEndTimes.length) return Math.max(...battleEndTimes);

  const actionTimes = actions
    .filter(a => a?.type !== 'battle_start' && a?.type !== 'battle_end')
    .map(a => Number(a?.t))
    .filter(t => Number.isFinite(t) && t >= 0);
  if (actionTimes.length) {
    const actionDuration = Math.max(0, Math.max(...actionTimes) - Math.min(...actionTimes));
    if (actionDuration >= 1) return actionDuration;
  }

  const fallback = Number(storedDuration);
  return Number.isFinite(fallback) && fallback > 0 ? fallback : 0;
}

// Get battle log — both attacks on player's base AND player's own attacks
router.get('/battle-log', auth, (req, res) => {
  const rows = db.db.prepare(`
    SELECT r.id, r.attacker_id, r.defender_id, r.claimed_result, r.verified_result,
           r.loot_gold, r.loot_wood, r.loot_ore,
           r.sim_th_hp_pct, r.sim_buildings_destroyed, r.duration_sec,
           r.created_at, r.replay_data, r.buildings_snapshot,
           pa.name AS attacker_name, pa.trophies AS attacker_trophies,
           pd.name AS defender_name, pd.trophies AS defender_trophies
    FROM battle_replays r
    LEFT JOIN players pa ON pa.id = r.attacker_id
    LEFT JOIN players pd ON pd.id = r.defender_id
    WHERE (r.defender_id = ? OR r.attacker_id = ?) AND r.verified_result = 'accepted'
    ORDER BY r.created_at DESC, r.id DESC
    LIMIT 50
  `).all(req.player.id, req.player.id);

  res.json(rows.map(r => {
    const isAttacker = r.attacker_id === req.player.id;
    let replayData = null;
    let buildingsSnapshot = null;
    try { replayData = r.replay_data ? JSON.parse(r.replay_data) : null; } catch {}
    try { buildingsSnapshot = r.buildings_snapshot ? JSON.parse(r.buildings_snapshot) : null; } catch {}
    return {
      id: r.id,
      side: isAttacker ? 'attack' : 'defense',
      attacker_name: r.attacker_name || 'Unknown',
      defender_name: r.defender_name || 'Unknown',
      opponent_name: isAttacker ? (r.defender_name || 'Unknown') : (r.attacker_name || 'Unknown'),
      opponent_trophies: isAttacker ? (r.defender_trophies || 0) : (r.attacker_trophies || 0),
      result: r.claimed_result,
      loot: { gold: r.loot_gold, wood: r.loot_wood, ore: r.loot_ore },
      th_hp_pct: r.sim_th_hp_pct,
      buildings_destroyed: r.sim_buildings_destroyed,
      duration: _battleLogDisplayDuration(replayData, r.duration_sec),
      created_at: r.created_at,
      replay_data: replayData,
      buildings_snapshot: buildingsSnapshot,
    };
  }));
});

// ==================== TROOPS ====================

// Buy a troop (deduct gold, server-validated)
const TROOP_BUY_COSTS = {
  Knight: 100,
  Mage: 100,
  Archer: 100,
  DemonKing: 0,
  FireDragon: 0,
};
const VALID_TROOPS = Object.keys(TROOP_BUY_COSTS);
const KNOWN_TROOPS = new Set(Object.values(TROOP_NAME_MAP));
function _troopBuyCost(name) {
  return TROOP_BUY_COSTS[_normalizeTroopName(name)] ?? 100;
}
router.post('/troops/buy', auth, (req, res) => {
  const { troop_name } = req.body;
  if (!troop_name) return res.status(400).json({ error: 'troop_name required' });
  const normalizedTroop = _normalizeTroopName(troop_name);
  if (!VALID_TROOPS.includes(normalizedTroop)) return res.status(400).json(_activeTroopError(normalizedTroop));
  const cost = _troopBuyCost(normalizedTroop);
  if (normalizedTroop === 'DemonKing') {
    return res.json({ success: true, troop_name: normalizedTroop, cost: 0, resources: db.getResources(req.player.id), nft_backed: true });
  }
  if (!db.canAfford(req.player.id, cost, 0, 0)) {
    return res.status(400).json({ error: 'Not enough gold', cost });
  }
  db.subtractResources(req.player.id, cost, 0, 0, {
    sourceType: 'troop_buy',
    metadata: { troop_name: normalizedTroop },
  });
  res.json({ success: true, troop_name: normalizedTroop, cost, resources: db.getResources(req.player.id) });
});

// Load troop onto a ship at a port
const TROOP_COST = 100;
const REINFORCE_COST = 50;

// Load a troop into a ship slot (costs 100 gold). Also saves template.
router.post('/buildings/:id/load-troop', auth, async (req, res) => {
  const buildingId = parseInt(req.params.id, 10);
  if (isNaN(buildingId)) return res.status(400).json({ error: 'Invalid building ID' });
  const { troop_name } = req.body;
  const normalizedTroop = _normalizeTroopName(troop_name);
  if (!troop_name || !VALID_TROOPS.includes(normalizedTroop)) return res.status(400).json(_activeTroopError(normalizedTroop));
  let verifiedDemonKing = null;
  if (normalizedTroop === 'DemonKing') {
    verifiedDemonKing = await verifyDemonKingNftLoadToken(req.player, troop_name, req.body?.owner || req.body?.nft_owner || req.body?.wallet);
    if (verifiedDemonKing.error) return res.status(verifiedDemonKing.status || 400).json(verifiedDemonKing);
  }

  const txn = db.db.transaction(() => {
    const building = db.db.prepare('SELECT * FROM buildings WHERE id = ? AND player_id = ?').get(buildingId, req.player.id);
    if (!building) throw { status: 404, error: 'Building not found' };
    if (building.type !== 'port' || !building.has_ship) throw { status: 400, error: 'No ship at this port' };

    const shipTroops = JSON.parse(building.ship_troops || '[]');
    const capacity = building.level * 3;  // 3x capacity: Lv1=3, Lv2=6, Lv3=9, Lv4=12
    const slotCost = _troopSlotCost(normalizedTroop);
    if (shipTroops.length + slotCost > capacity) throw { status: 400, error: 'Ship is full' };
    const troopEntry = verifiedDemonKing?.troopEntry || _canonicalTroopEntry(troop_name);
    if (normalizedTroop === 'DemonKing') {
      const loaded = _findLoadedDemonKingToken(req.player.id, _demonKingEntryKey(troopEntry));
      if (loaded) {
        throw {
          status: 409,
          error: 'This Demon King NFT is already loaded on a ship',
          code: 'DEMON_KING_NFT_ALREADY_LOADED',
          building_id: loaded.buildingId,
        };
      }
    }

    const player = db.db.prepare('SELECT gold FROM players WHERE id = ?').get(req.player.id);
    const troopCost = _troopBuyCost(normalizedTroop);
    if (player.gold < troopCost) throw { status: 400, error: 'Not enough gold' };

    if (troopCost > 0) db.db.prepare('UPDATE players SET gold = gold - ? WHERE id = ?').run(troopCost, req.player.id);
    _appendTroopSlots(shipTroops, troopEntry);
    const troopsJson = JSON.stringify(shipTroops);
    // Save both current troops and template (what player chose)
    db.db.prepare('UPDATE buildings SET ship_troops = ?, ship_troops_template = ? WHERE id = ?').run(troopsJson, troopsJson, buildingId);

    const updated = db.db.prepare('SELECT gold, wood, ore FROM players WHERE id = ?').get(req.player.id);
    return { ship_troops: shipTroops, ship_level: building.level, ship_capacity: capacity, resources: updated };
  });

  try {
    const result = txn();
    res.json({ success: true, ...result });
  } catch (e) {
    res.status(e.status || 500).json({ error: e.error || 'Server error' });
  }
});

// Swap a troop in a specific slot (costs 100 gold). Does NOT update template.
router.post('/buildings/:id/swap-troop', auth, async (req, res) => {
  const buildingId = parseInt(req.params.id, 10);
  if (isNaN(buildingId)) return res.status(400).json({ error: 'Invalid building ID' });
  const { slot, troop_name } = req.body;
  const normalizedTroop = _normalizeTroopName(troop_name);
  if (!Number.isInteger(slot) || !troop_name) {
    return res.status(400).json({ error: 'Valid integer slot and troop_name required' });
  }
  if (!VALID_TROOPS.includes(normalizedTroop)) return res.status(400).json(_activeTroopError(normalizedTroop));
  let verifiedDemonKing = null;
  if (normalizedTroop === 'DemonKing') {
    verifiedDemonKing = await verifyDemonKingNftLoadToken(req.player, troop_name, req.body?.owner || req.body?.nft_owner || req.body?.wallet);
    if (verifiedDemonKing.error) return res.status(verifiedDemonKing.status || 400).json(verifiedDemonKing);
  }

  const txn = db.db.transaction(() => {
    const building = db.db.prepare('SELECT * FROM buildings WHERE id = ? AND player_id = ?').get(buildingId, req.player.id);
    if (!building) throw { status: 404, error: 'Building not found' };
    if (building.type !== 'port' || !building.has_ship) throw { status: 400, error: 'No ship at this port' };

    const shipTroops = JSON.parse(building.ship_troops || '[]');
    if (slot < 0 || slot >= shipTroops.length) throw { status: 400, error: 'Invalid slot' };
    if (_isSlotFiller(shipTroops[slot])) throw { status: 400, error: 'Cannot replace a reserved heavy-unit slot' };
    const capacity = building.level * 3;
    const span = _swapSpanForReplacement(shipTroops, slot, normalizedTroop, capacity);
    if (!span) throw { status: 400, error: 'Not enough ship capacity for this troop' };
    const slotsToReplace = span.end - span.start;
    const replacement = [];
    const troopEntry = verifiedDemonKing?.troopEntry || _canonicalTroopEntry(troop_name);
    _appendTroopSlots(replacement, troopEntry);
    if (normalizedTroop === 'DemonKing') {
      const loaded = _findLoadedDemonKingToken(req.player.id, _demonKingEntryKey(troopEntry), {
        exceptBuildingId: buildingId,
        exceptStart: span.start,
        exceptEnd: span.end,
      });
      if (loaded) {
        throw {
          status: 409,
          error: 'This Demon King NFT is already loaded on a ship',
          code: 'DEMON_KING_NFT_ALREADY_LOADED',
          building_id: loaded.buildingId,
        };
      }
    }

    const player = db.db.prepare('SELECT gold FROM players WHERE id = ?').get(req.player.id);
    const swapCost = normalizedTroop === 'DemonKing' ? 0 : TROOP_COST;
    if (player.gold < swapCost) throw { status: 400, error: 'Not enough gold' };

    if (swapCost > 0) db.db.prepare('UPDATE players SET gold = gold - ? WHERE id = ?').run(swapCost, req.player.id);
    shipTroops.splice(span.start, slotsToReplace, ...replacement);
    const troopsJson = JSON.stringify(shipTroops);
    // Persist explicit swaps as the new reinforce template.
    db.db.prepare('UPDATE buildings SET ship_troops = ?, ship_troops_template = ? WHERE id = ?').run(troopsJson, troopsJson, buildingId);

    const updated = db.db.prepare('SELECT gold, wood, ore FROM players WHERE id = ?').get(req.player.id);
    return { ship_troops: shipTroops, ship_level: building.level, ship_capacity: building.level * 3, resources: updated };
  });

  try {
    const result = txn();
    res.json({ success: true, ...result });
  } catch (e) {
    res.status(e.status || 500).json({ error: e.error || 'Server error' });
  }
});

// Remove a troop from a specific ship slot. This updates the saved template too:
// explicit player edits should persist across reinforce/reload flows.
router.post('/buildings/:id/remove-troop', auth, (req, res) => {
  const buildingId = parseInt(req.params.id, 10);
  if (isNaN(buildingId)) return res.status(400).json({ error: 'Invalid building ID' });
  const slot = Number(req.body?.slot);
  if (!Number.isInteger(slot)) return res.status(400).json({ error: 'Valid integer slot required' });

  const txn = db.db.transaction(() => {
    const resolved = _resolvePlayerShipEditBuilding(req.player.id, buildingId, req.body || {});
    const building = resolved.building;
    if (!building) {
      throw {
        status: 404,
        error: 'Building not found',
        requested_building_id: buildingId,
      };
    }
    if (building.type !== 'port' || !building.has_ship) throw { status: 400, error: 'No ship at this port' };

    let shipTroops = [];
    try { shipTroops = JSON.parse(building.ship_troops || '[]'); } catch { shipTroops = []; }
    const span = _troopUnitSpanAt(shipTroops, slot);
    if (!span) throw { status: 400, error: 'Invalid troop slot' };

    const removedTroops = shipTroops.slice(span.start, span.end).filter(t => !_isSlotFiller(t));
    shipTroops.splice(span.start, span.end - span.start);
    const troopsJson = JSON.stringify(shipTroops);
    db.db.prepare('UPDATE buildings SET ship_troops = ?, ship_troops_template = ? WHERE id = ?').run(troopsJson, troopsJson, buildingId);

    const updated = db.db.prepare('SELECT gold, wood, ore FROM players WHERE id = ?').get(req.player.id);
    return {
      ship_troops: shipTroops,
      removed_troops: removedTroops,
      ship_level: building.level,
      ship_capacity: building.level * 3,
      resources: updated,
      building_id: building.id,
      requested_building_id: buildingId,
      matched_by: resolved.matchedBy,
    };
  });

  try {
    const result = txn();
    res.json({ success: true, ...result });
  } catch (e) {
    res.status(e.status || 500).json({ error: e.error || 'Server error' });
  }
});

// Get current ship troops for all ports (used before attack to sync)
router.get('/ships', auth, (req, res) => {
  _sanitizeDisabledShipTroopsForPlayer(req.player.id);
  const ports = db.db.prepare('SELECT id, level, ship_troops, ship_troops_template, has_ship FROM buildings WHERE player_id = ? AND type = ?').all(req.player.id, 'port');
  const ships = ports.filter(p => p.has_ship).map(p => ({
    id: p.id,
    level: p.level,
    ship_troops: JSON.parse(p.ship_troops || '[]'),
    ship_troops_template: JSON.parse(p.ship_troops_template || '[]'),
  }));
  res.json({ ships });
});

// Report a single troop death during battle. This endpoint is telemetry-only:
// ship state is mutated once by /attack/result from the authoritative replay.
// Older clients still call this endpoint, so keep accepting it without removing
// troops. Mutating here caused duplicate reinforcement costs when /attack/result
// later applied the same casualty again.
const TROOP_DIED_RATE_WINDOW_MS = 1000;
const TROOP_DIED_RATE_MAX = 120;
const _troopDiedBuckets = new Map();

function _allowTroopDied(playerId) {
  const now = Date.now();
  const key = String(playerId || '');
  const bucket = _troopDiedBuckets.get(key);
  if (bucket && bucket.resetAt > now) {
    if (bucket.count >= TROOP_DIED_RATE_MAX) return false;
    bucket.count += 1;
    return true;
  }
  _troopDiedBuckets.set(key, { count: 1, resetAt: now + TROOP_DIED_RATE_WINDOW_MS });
  if (_troopDiedBuckets.size > 1000) {
    for (const [id, entry] of _troopDiedBuckets) {
      if (!entry || entry.resetAt <= now) _troopDiedBuckets.delete(id);
      if (_troopDiedBuckets.size <= 800) break;
    }
  }
  return true;
}

router.post('/troop-died', auth, (req, res) => {
  if (!_allowTroopDied(req.player.id)) return res.status(429).json({ error: 'Too fast' });

  const { troop_name } = req.body;
  const normalizedTroop = _normalizeTroopName(troop_name);
  if (!troop_name || !KNOWN_TROOPS.has(normalizedTroop)) return res.status(400).json({ error: 'Invalid troop' });
  if (normalizedTroop === 'DemonKing') {
    return res.json({ success: true, recorded: true, removed: null, persistent: true, troop_name: 'DemonKing' });
  }

  res.json({
    success: true,
    recorded: true,
    removed: null,
    troop_name: normalizedTroop,
    applied_by: 'attack_result',
  });
});

// Get casualties: compare ship_troops vs ship_troops_template to find missing troops
router.get('/casualties', auth, (req, res) => {
  _sanitizeDisabledShipTroopsForPlayer(req.player.id);
  const ports = db.db.prepare('SELECT * FROM buildings WHERE player_id = ? AND type = ? AND has_ship = 1').all(req.player.id, 'port');
  const casualties = {};
  let totalMissing = 0;

  for (const port of ports) {
    const current = JSON.parse(port.ship_troops || '[]');
    const template = JSON.parse(port.ship_troops_template || '[]');
    const missingSlots = Math.max(0, template.length - current.length);
    if (missingSlots <= 0) continue;
    // Count how many of each troop type are missing
    const currentCounts = {};
    for (const t of current) {
      if (_isSlotFiller(t)) continue;
      const normalized = _normalizeTroopName(t);
      currentCounts[normalized] = (currentCounts[normalized] || 0) + 1;
    }
    let portMissing = 0;
    for (const t of template) {
      if (portMissing >= missingSlots) break;
      if (_isSlotFiller(t)) continue;
      const normalized = _normalizeTroopName(t);
      if (normalized === 'DemonKing') continue;
      if (currentCounts[normalized] && currentCounts[normalized] > 0) {
        currentCounts[normalized]--;
      } else {
        const slotCost = _troopSlotCost(normalized);
        casualties[normalized] = (casualties[normalized] || 0) + 1;
        totalMissing++;
        portMissing += slotCost;
      }
    }
  }

  res.json({
    casualties,
    total: totalMissing,
    cost: totalMissing * REINFORCE_COST,
  });
});

// Reinforce: restore dead troops from template (costs 50 gold per restored troop)
router.post('/reinforce', auth, (req, res) => {
  const txn = db.db.transaction(() => {
    _sanitizeDisabledShipTroopsForPlayer(req.player.id);
    const ports = db.db.prepare('SELECT * FROM buildings WHERE player_id = ? AND type = ? AND has_ship = 1').all(req.player.id, 'port');

    let totalToRestore = 0;
    const shipsToRestore = [];

    for (const port of ports) {
      const current = JSON.parse(port.ship_troops || '[]');
      const template = JSON.parse(port.ship_troops_template || '[]');
      if (template.length === 0) continue;
      const missingSlots = Math.max(0, template.length - current.length);
      if (missingSlots <= 0) continue;
      // Count missing troops by type (template - current)
      const currentCounts = {};
      for (const t of current) {
        if (_isSlotFiller(t)) continue;
        const normalized = _normalizeTroopName(t);
        currentCounts[normalized] = (currentCounts[normalized] || 0) + 1;
      }
      const toAdd = [];
      for (const t of template) {
        if (toAdd.length >= missingSlots) break;
        if (_isSlotFiller(t)) continue;
        const normalized = _normalizeTroopName(t);
        if (normalized === 'DemonKing') continue;
        if (currentCounts[normalized] && currentCounts[normalized] > 0) {
          currentCounts[normalized]--;
        } else {
          _appendTroopSlots(toAdd, normalized);
          totalToRestore += 1;
        }
      }
      if (toAdd.length > 0) {
        shipsToRestore.push({ port, current, toAdd });
      }
    }

    if (totalToRestore === 0) return { cost: 0, restored: 0, ships: [] };

    const totalCost = totalToRestore * REINFORCE_COST;
    const player = db.db.prepare('SELECT gold FROM players WHERE id = ?').get(req.player.id);
    if (player.gold < totalCost) throw { status: 400, error: `Not enough gold (need ${totalCost})` };

    db.db.prepare('UPDATE players SET gold = gold - ? WHERE id = ?').run(totalCost, req.player.id);

    // Append missing troops to current (preserves swaps, only restores casualties)
    // Cap to ship capacity to prevent overflow from swap+reinforce combo
    const resultShips = [];
    for (const { port, current, toAdd } of shipsToRestore) {
      const capacity = port.level * 3;
      const slotsAvailable = Math.max(0, capacity - current.length);
      const restored = [...current, ...toAdd.slice(0, slotsAvailable)];
      const troopsJson = JSON.stringify(restored);
      db.db.prepare('UPDATE buildings SET ship_troops = ? WHERE id = ?').run(troopsJson, port.id);
      resultShips.push({ id: port.id, ship_troops: restored });
    }

    const updated = db.db.prepare('SELECT gold, wood, ore FROM players WHERE id = ?').get(req.player.id);
    return { cost: totalCost, restored: totalToRestore, ships: resultShips, resources: updated };
  });

  try {
    const result = txn();
    if (result.restored > 0) logEconomy('reinforce', { player: req.player.id, restored: result.restored, cost: result.cost });
    res.json({ success: true, ...result });
  } catch (e) {
    logError('reinforce failed', { player: req.player.id, error: e.error || e.message });
    res.status(e.status || 500).json({ error: e.error || 'Server error' });
  }
});

// Unload all troops from a ship
router.post('/buildings/:id/unload-troops', auth, (req, res) => {
  const buildingId = parseInt(req.params.id, 10);
  if (isNaN(buildingId)) return res.status(400).json({ error: 'Invalid building ID' });

  const building = db.db.prepare('SELECT * FROM buildings WHERE id = ? AND player_id = ?').get(buildingId, req.player.id);
  if (!building) return res.status(404).json({ error: 'Building not found' });

  db.db.prepare('UPDATE buildings SET ship_troops = ?, ship_troops_template = ? WHERE id = ?').run('[]', '[]', buildingId);
  res.json({ success: true, ship_troops: [] });
});

// ==================== TUTORIAL ====================

// Tutorial flags (bitmask): each bit = one completed phase
// Bit 0 (1):  base tutorial (welcome, TH, buildings)
// Bit 1 (2):  army tutorial (port, ship, troops)
// Bit 2 (4):  attack tutorial (first battle guide)
// Bit 3 (8):  trading tutorial
// Bit 4 (16): YouTube video guide

// GET current tutorial state
router.get('/tutorial', auth, (req, res) => {
  const player = db.db.prepare('SELECT tutorial_flags FROM players WHERE id = ?').get(req.player.id);
  res.json({ tutorial_flags: player?.tutorial_flags || 0 });
});

// POST mark a tutorial phase as complete (flag is a bitmask: 1,2,4,8,16)
router.post('/tutorial/complete', auth, (req, res) => {
  const { flag } = req.body;
  if (!Number.isInteger(flag) || flag < 1 || flag > 31) return res.status(400).json({ error: 'Invalid flag' });
  const player = db.db.prepare('SELECT tutorial_flags FROM players WHERE id = ?').get(req.player.id);
  const current = player?.tutorial_flags || 0;
  const updated = current | flag;
  if (updated !== current) {
    db.db.prepare('UPDATE players SET tutorial_flags = ? WHERE id = ?').run(updated, req.player.id);
  }
  res.json({ tutorial_flags: updated });
});

// ==================== FUTURES MODE ====================
// Per-player UI mode for the futures panel. NULL until the user makes their
// first-time choice; then 'basic' or 'pro'. Choice is permanent unless the
// user explicitly switches via the profile toggle. Server is authoritative —
// the client checks on every load and shows the first-time selection screen
// when the value is NULL.

router.get('/players/futures-mode', auth, (req, res) => {
  const row = db.db.prepare('SELECT futures_mode FROM players WHERE id = ?').get(req.player.id);
  res.json({ mode: row?.futures_mode || null });
});

router.post('/players/futures-mode', auth, (req, res) => {
  const { mode } = req.body || {};
  if (mode !== 'basic' && mode !== 'pro') {
    return res.status(400).json({ error: "mode must be 'basic' or 'pro'" });
  }
  db.db.prepare('UPDATE players SET futures_mode = ? WHERE id = ?').run(mode, req.player.id);
  res.json({ mode });
});

// ==================== LEADERBOARD ====================

router.get('/leaderboard', (req, res) => {
  const rows = db.db.prepare(`
    SELECT p.name, p.trophies, p.dex,
      COALESCE((SELECT MAX(b.level) FROM buildings b WHERE b.player_id = p.id AND b.type = 'town_hall'), 1) AS level
    FROM players p
    WHERE p.trophies > 0
    ORDER BY p.trophies DESC
    LIMIT 50
  `).all();
  res.json(rows);
});

// ==================== TROPHIES ====================

// Get trophies
router.get('/trophies', auth, (req, res) => {
  res.json({ trophies: db.getTrophies(req.player.id) });
});

// Recalculate trophies from current buildings & troops
router.post('/trophies/recalculate', auth, (req, res) => {
  const result = db.recalculateTrophies(req.player.id);
  res.json(result);
});

// Get trophy table (what each building is worth)
router.get('/trophies/table', (req, res) => {
  res.json(db.TROPHY_TABLE);
});

// ==================== TRADING REWARDS ====================

const GOLD_PER_USD_VOLUME = 0.50;
// Decibel was 10× — 33× the Pacifica rate. Combined with a $1 min-notional
// floor, that turned the DEX into a self-trade gold farm. Pulled to parity
// with Pacifica for the v2 economy. If we ever need to incentivise Decibel
// liquidity again, do it via a tournament gold_boost, not a base-rate cliff.
const GOLD_PER_USD_VOLUME_DECIBEL = 0.50;
const GOLD_FIRST_DEPOSIT = 500;
const GOLD_FIRST_TRADE = 300;
const GOLD_DAILY_TRADE = 450;
const GOLD_PER_10_USD_PROFIT = 150; // +150 gold per $10 positive PnL

function volumeGoldForDex(dex, usdVolume) {
  const volume = Number(usdVolume);
  if (!Number.isFinite(volume) || volume <= 0) return 0;
  const rate = dex === 'decibel' ? GOLD_PER_USD_VOLUME_DECIBEL : GOLD_PER_USD_VOLUME;
  return Math.floor(volume * rate);
}

function sqliteUtcMs(value) {
  const ms = Date.parse(`${String(value || '').replace(' ', 'T')}Z`);
  return Number.isFinite(ms) ? ms : 0;
}

const NFT_GOLD_BOOST_CONTRACT_RAW =
  process.env.NFT_GOLD_BOOST_CONTRACT || '0x145B4eA581924882e854F34630a2544b4c2Fe4bD';
const NFT_GOLD_BOOST_BONUS_PERCENT = 20;
const NFT_GOLD_BOOST_MULTIPLIER = 1 + (NFT_GOLD_BOOST_BONUS_PERCENT / 100);
const NFT_GOLD_BOOST_CACHE_MS = 60_000;
const NFT_GOLD_BOOST_MESSAGE_TITLE = 'Clash of Perps NFT gold boost';
const NFT_GOLD_BOOST_ERC721_ABI = [
  {
    name: 'balanceOf',
    type: 'function',
    stateMutability: 'view',
    inputs: [{ name: 'owner', type: 'address' }],
    outputs: [{ type: 'uint256' }],
  },
];
const NFT_GOLD_BOOST_ERC1155_ABI = [
  {
    name: 'balanceOf',
    type: 'function',
    stateMutability: 'view',
    inputs: [{ name: 'owner', type: 'address' }, { name: 'id', type: 'uint256' }],
    outputs: [{ type: 'uint256' }],
  },
];
const NFT_GOLD_BOOST_ERC165_ABI = [
  {
    name: 'supportsInterface',
    type: 'function',
    stateMutability: 'view',
    inputs: [{ name: 'interfaceId', type: 'bytes4' }],
    outputs: [{ type: 'bool' }],
  },
];
const nftGoldBoostCache = new Map();
let nftGoldBoostViemPromise = null;

function nftBoostRpcUrls() {
  const baseAlchemyKey = String(process.env.BASE_ALCHEMY_KEY || process.env.ALCHEMY_BASE_API_KEY || '').trim();
  const override = String(
    process.env.NFT_GOLD_BOOST_RPC_URLS
    || process.env.NFT_GOLD_BOOST_RPC_URL
    || process.env.NFT_BASE_RPC_URL
    || process.env.BASE_RPC_URL
    || process.env.VITE_BASE_RPC_URL
    || '',
  )
    .split(',')
    .map((s) => s.trim())
    .filter(Boolean);
  if (override.length) return override;
  return [
    baseAlchemyKey ? `https://base-mainnet.g.alchemy.com/v2/${baseAlchemyKey}` : '',
    'https://base-rpc.publicnode.com',
    'https://base.public.blockpi.network/v1/rpc/public',
    'https://base.drpc.org',
    'https://mainnet.base.org',
  ].filter(Boolean);
}

async function nftGoldBoostViem() {
  if (!nftGoldBoostViemPromise) {
    nftGoldBoostViemPromise = Promise.all([
      import('viem'),
      import('viem/chains'),
    ]).then(([viem, chains]) => {
      const transport = viem.fallback(
        nftBoostRpcUrls().map((url) => viem.http(url, { retryCount: 0, timeout: 10_000 })),
        { rank: false, retryCount: 0 },
      );
      return {
        getAddress: viem.getAddress,
        verifyMessage: viem.verifyMessage,
        contract: viem.getAddress(NFT_GOLD_BOOST_CONTRACT_RAW),
        publicClient: viem.createPublicClient({ chain: chains.base, transport }),
      };
    }).catch((e) => {
      nftGoldBoostViemPromise = null;
      throw e;
    });
  }
  return nftGoldBoostViemPromise;
}

async function normalizeNftGoldBoostAddress(value) {
  try {
    const { getAddress } = await nftGoldBoostViem();
    return getAddress(String(value || '').trim());
  } catch {
    return null;
  }
}

async function buildNftGoldBoostMessage({ playerId, wallet, timestamp }) {
  const { getAddress, contract } = await nftGoldBoostViem();
  return [
    NFT_GOLD_BOOST_MESSAGE_TITLE,
    `Player: ${playerId}`,
    `Wallet: ${getAddress(wallet)}`,
    `Contract: ${contract}`,
    `Timestamp: ${Number(timestamp)}`,
  ].join('\n');
}

async function readNftGoldBoostBalance(wallet) {
  const ownership = await readNftGoldBoostOwnership(wallet);
  return ownership.balance || 0n;
}

function nftGoldBoostTokenIds() {
  const configured = String(process.env.NFT_GOLD_BOOST_TOKEN_IDS || '')
    .split(',')
    .map((s) => s.trim())
    .filter(Boolean)
    .map((s) => {
      try { return BigInt(s); } catch { return null; }
    })
    .filter((v) => v != null && v >= 0n);
  if (configured.length) return Array.from(new Set(configured.map(String))).map(BigInt);
  // Contract 0x145... is ERC-1155; token id 24 is the Neon Pickaxe that
  // carries the Clash of Perps +20% gold boost in its metadata.
  return [24n];
}

async function supportsNftGoldBoostInterface(interfaceId) {
  const { publicClient, contract } = await nftGoldBoostViem();
  try {
    return !!(await publicClient.readContract({
      address: contract,
      abi: NFT_GOLD_BOOST_ERC165_ABI,
      functionName: 'supportsInterface',
      args: [interfaceId],
    }));
  } catch {
    return false;
  }
}

async function readErc1155GoldBoostOwnership(wallet) {
  const { publicClient, contract, getAddress } = await nftGoldBoostViem();
  const owner = getAddress(wallet);
  const ids = nftGoldBoostTokenIds();

  if (typeof publicClient.multicall === 'function') {
    for (let i = 0; i < ids.length; i += 75) {
      const chunk = ids.slice(i, i + 75);
      try {
        const results = await publicClient.multicall({
          allowFailure: true,
          contracts: chunk.map((id) => ({
            address: contract,
            abi: NFT_GOLD_BOOST_ERC1155_ABI,
            functionName: 'balanceOf',
            args: [owner, id],
          })),
        });
        for (let j = 0; j < results.length; j += 1) {
          if (results[j]?.status !== 'success') continue;
          const balance = BigInt(results[j].result || 0);
          if (balance > 0n) {
            return { owns: true, balance, token_id: String(chunk[j]), standard: 'ERC1155' };
          }
        }
      } catch {
        // Fall back to direct reads below.
      }
    }
  }

  for (const id of ids) {
    try {
      const balance = await publicClient.readContract({
        address: contract,
        abi: NFT_GOLD_BOOST_ERC1155_ABI,
        functionName: 'balanceOf',
        args: [owner, id],
      });
      if (BigInt(balance || 0) > 0n) {
        return { owns: true, balance: BigInt(balance), token_id: String(id), standard: 'ERC1155' };
      }
    } catch {
      // Some ERC-1155 implementations revert for unknown ids. Keep scanning.
    }
  }
  return { owns: false, balance: 0n, standard: 'ERC1155' };
}

async function readErc721GoldBoostOwnership(wallet) {
  const { publicClient, contract, getAddress } = await nftGoldBoostViem();
  try {
    const balance = await publicClient.readContract({
      address: contract,
      abi: NFT_GOLD_BOOST_ERC721_ABI,
      functionName: 'balanceOf',
      args: [getAddress(wallet)],
    });
    return {
      owns: BigInt(balance || 0) > 0n,
      balance: BigInt(balance || 0),
      standard: 'ERC721',
    };
  } catch {
    return { owns: false, balance: 0n, standard: 'ERC721' };
  }
}

async function readNftGoldBoostOwnership(wallet) {
  const isErc1155 = await supportsNftGoldBoostInterface('0xd9b67a26');
  if (isErc1155) {
    const erc1155 = await readErc1155GoldBoostOwnership(wallet);
    if (erc1155.owns) return erc1155;
    return erc1155;
  }

  const erc721 = await readErc721GoldBoostOwnership(wallet);
  if (erc721.owns) return erc721;

  // If ERC-165 is missing or blocked, still try ERC-1155 as a fallback.
  const erc1155 = await readErc1155GoldBoostOwnership(wallet);
  if (erc1155.owns) return erc1155;
  return erc721;
}

function nftGoldBoostPayload(result) {
  return {
    eligible: !!result?.eligible,
    bonus_percent: NFT_GOLD_BOOST_BONUS_PERCENT,
    multiplier: NFT_GOLD_BOOST_MULTIPLIER,
    contract: result?.contract || null,
    wallet: result?.wallet || null,
    token_id: result?.token_id || null,
    standard: result?.standard || null,
    verified_at: result?.verified_at || null,
  };
}

function clearNftGoldBoost(playerId) {
  db.db.prepare(`
    UPDATE players
    SET nft_gold_boost_wallet = NULL,
        nft_gold_boost_contract = NULL,
        nft_gold_boost_verified_at = NULL
    WHERE id = ?
  `).run(playerId);
  nftGoldBoostCache.delete(playerId);
}

async function getPlayerNftGoldBoost(player, { force = false, clearIfMissing = false } = {}) {
  const playerId = player?.id;
  if (!playerId) return { eligible: false };
  const cached = nftGoldBoostCache.get(playerId);
  if (!force && cached && Date.now() - cached.at < NFT_GOLD_BOOST_CACHE_MS) {
    return cached.result;
  }

  const row = db.db.prepare(`
    SELECT nft_gold_boost_wallet, nft_gold_boost_contract, nft_gold_boost_verified_at
    FROM players
    WHERE id = ?
  `).get(playerId);
  const { contract, getAddress } = await nftGoldBoostViem();
  const wallet = await normalizeNftGoldBoostAddress(row?.nft_gold_boost_wallet);
  const storedContract = row?.nft_gold_boost_contract
    ? (() => { try { return getAddress(row.nft_gold_boost_contract); } catch { return null; } })()
    : null;

  if (!wallet || !storedContract || storedContract.toLowerCase() !== contract.toLowerCase()) {
    const result = { eligible: false, contract };
    nftGoldBoostCache.set(playerId, { at: Date.now(), result });
    return result;
  }

  const ownership = await readNftGoldBoostOwnership(wallet);
  if (!ownership.owns) {
    if (clearIfMissing) clearNftGoldBoost(playerId);
    const result = { eligible: false, contract };
    nftGoldBoostCache.set(playerId, { at: Date.now(), result });
    return result;
  }

  const result = {
    eligible: true,
    wallet,
    contract,
    token_id: ownership.token_id || null,
    standard: ownership.standard || null,
    verified_at: row.nft_gold_boost_verified_at || null,
  };
  nftGoldBoostCache.set(playerId, { at: Date.now(), result });
  return result;
}

function applyNftGoldBoostAmount(baseGold, boost, reasons) {
  const amount = Number(baseGold) || 0;
  if (amount <= 0 || !boost?.eligible) return amount;
  const boosted = Math.round(amount * NFT_GOLD_BOOST_MULTIPLIER);
  if (boosted > amount && Array.isArray(reasons)) {
    reasons.push(`Base NFT +${NFT_GOLD_BOOST_BONUS_PERCENT}%`);
  }
  return boosted;
}

// Trading rewards table
try {
  db.db.exec(`
    CREATE TABLE IF NOT EXISTS trading_rewards (
      player_id    TEXT NOT NULL,
      dex          TEXT NOT NULL DEFAULT 'pacifica',
      wallet       TEXT NOT NULL,
      last_trade_id INTEGER NOT NULL DEFAULT 0,
      total_volume REAL NOT NULL DEFAULT 0,
      total_gold   INTEGER NOT NULL DEFAULT 0,
      first_deposit INTEGER NOT NULL DEFAULT 0,
      first_trade  INTEGER NOT NULL DEFAULT 0,
      last_daily   TEXT,
      pnl_gold_pool REAL NOT NULL DEFAULT 0,
      updated_at   TEXT NOT NULL DEFAULT (datetime('now')),
      PRIMARY KEY (player_id, dex)
    )
  `);
} catch {}
try { db.db.exec(`ALTER TABLE trading_rewards ADD COLUMN pnl_gold_pool REAL NOT NULL DEFAULT 0`); } catch {}
// `agent_wallet` — most recently bound Pacifica agent pubkey. Pacifica
// indexes /v1/trades/history by SIGNER pubkey — once an agent is bound
// every subsequent trade is signed by that agent, so trade history shows
// up under the agent address, NOT the master we have in players.wallet.
// Without this column /claim-gold and the task verifier query master and
// get back []. We keep the latest one in trading_rewards for hot path
// reads, and append every historical bind into pacifica_agents below so
// nothing's lost when the user clears localStorage and re-binds (every
// rebind generates a new agent — the old one stays valid on Pacifica
// side, with its own residual trade history we still need to query).
try { db.db.exec(`ALTER TABLE trading_rewards ADD COLUMN agent_wallet TEXT`); } catch {}
// Append-only ledger of every agent the player has ever bound. Composite
// PK keeps inserts idempotent — re-POSTing the same agent doesn't create
// a duplicate, and dropping localStorage + rebinding just adds a new row
// alongside the old one. /claim-gold and fetchWalletTrades read EVERY row
// and merge trades by history_id so credit follows the master regardless
// of which agent signed which trade.
try {
  db.db.exec(`
    CREATE TABLE IF NOT EXISTS pacifica_agents (
      player_id    TEXT NOT NULL,
      agent_wallet TEXT NOT NULL,
      bound_at     TEXT NOT NULL DEFAULT (datetime('now')),
      PRIMARY KEY (player_id, agent_wallet)
    );
    CREATE INDEX IF NOT EXISTS idx_pacifica_agents_player ON pacifica_agents(player_id);
  `);
} catch {}

// One-shot legacy migration: older client builds POSTed `wallet=<agent>`
// to /trading/claim-gold (instead of `wallet=<master>, agent_wallet=<agent>`),
// so trading_rewards.wallet ended up holding the agent pubkey while
// players.wallet held the master. New code expects wallet=master and
// agent_wallet=agent — without this fix-up, fetchPacificaAllTrades only
// queries the master (which Pacifica returns [] for) and every Privy
// user's task progress stays stuck at 0 even though they've been
// trading.
//
// CRITICAL — this migration uses heuristic `wallet != players.wallet` to
// detect the legacy shape. After the migration ran once, the same query
// is unsafe: a user who legitimately switched master (Phantom → Privy
// or vice-versa via account-switch flow) will trigger a false positive,
// inserting the OLD master into pacifica_agents as if it were an agent.
// We gate on a meta flag so this runs exactly once, ever.
try {
  db.db.exec(`
    CREATE TABLE IF NOT EXISTS server_meta (
      key   TEXT PRIMARY KEY,
      value TEXT NOT NULL,
      updated_at TEXT NOT NULL DEFAULT (datetime('now'))
    );
  `);
  const META_KEY = 'pacifica_legacy_agent_migration_v1';
  const done = db.db.prepare('SELECT value FROM server_meta WHERE key = ?').get(META_KEY);
  if (!done) {
    const legacyRows = db.db.prepare(`
      SELECT tr.player_id, tr.wallet AS tr_wallet, p.wallet AS player_wallet
      FROM trading_rewards tr
      JOIN players p ON p.id = tr.player_id
      WHERE tr.dex = 'pacifica'
        AND tr.wallet IS NOT NULL AND LENGTH(tr.wallet) > 0
        AND p.wallet IS NOT NULL AND LENGTH(p.wallet) > 0
        AND tr.wallet != p.wallet
    `).all();
    const insertAgent = db.db.prepare('INSERT OR IGNORE INTO pacifica_agents (player_id, agent_wallet) VALUES (?, ?)');
    const setAgentHint = db.db.prepare(`UPDATE trading_rewards SET agent_wallet = ?
      WHERE player_id = ? AND dex = 'pacifica'
        AND (agent_wallet IS NULL OR LENGTH(agent_wallet) = 0)`);
    const restoreMaster = db.db.prepare(`UPDATE trading_rewards SET wallet = ?
      WHERE player_id = ? AND dex = 'pacifica'`);
    const txn = db.db.transaction((rows) => {
      for (const r of rows) {
        insertAgent.run(r.player_id, r.tr_wallet);
        setAgentHint.run(r.tr_wallet, r.player_id);
        restoreMaster.run(r.player_wallet, r.player_id);
      }
    });
    txn(legacyRows);
    db.db.prepare('INSERT OR REPLACE INTO server_meta (key, value) VALUES (?, ?)')
      .run(META_KEY, String(legacyRows.length));
    console.log(`[boot] one-shot migration: flipped ${legacyRows.length} legacy pacifica trading_rewards rows (wallet was agent → master + pacifica_agents). Will not run again.`);
  }
} catch (e) {
  console.warn(`[boot] pacifica legacy migration skipped:`, e.message);
}
// Encrypted client diagnostic uploads. Stored as TEXT JSON because the
// schema of useful fields is endpoint-specific (Pacifica signed-message
// trace today, GMX RPC errors tomorrow) and we want to avoid migrating
// the table every time a new failure mode is logged.
try {
  db.db.exec(`
    CREATE TABLE IF NOT EXISTS diag_reports (
      id          INTEGER PRIMARY KEY AUTOINCREMENT,
      player_id   TEXT,
      category    TEXT NOT NULL DEFAULT 'pacifica',
      adapter     TEXT,
      error_kind  TEXT,
      payload     TEXT NOT NULL,
      created_at  TEXT NOT NULL DEFAULT (datetime('now'))
    );
    CREATE INDEX IF NOT EXISTS idx_diag_recent ON diag_reports(created_at DESC);
    CREATE INDEX IF NOT EXISTS idx_diag_category_recent ON diag_reports(category, created_at DESC);
  `);
} catch (e) { console.warn('[boot] diag_reports table:', e.message); }

// `pacifica_builder_approved` — server-side mirror of the client's 30-day
// localStorage activation cache. If localStorage gets cleared (incognito,
// browser cleanup, Privy iframe context) we used to ask the user to
// re-approve the builder code on every fresh trade flow. Persisting it
// server-side means the client can hydrate its activatedRef from the
// player state and skip the redundant approve_builder_code call.
try { db.db.exec(`ALTER TABLE players ADD COLUMN pacifica_builder_approved INTEGER NOT NULL DEFAULT 0`); } catch {}
try {
  const cols = db.db.prepare('PRAGMA table_info(trading_rewards)').all();
  const hasDex = cols.some(c => c.name === 'dex');
  const pkCols = cols.filter(c => c.pk).sort((a, b) => a.pk - b.pk).map(c => c.name);
  if (!hasDex || pkCols.join(',') !== 'player_id,dex') {
    db.db.exec('DROP TABLE IF EXISTS trading_rewards_old_migrate');
    db.db.exec('ALTER TABLE trading_rewards RENAME TO trading_rewards_old_migrate');
    db.db.exec(`
      CREATE TABLE trading_rewards (
        player_id    TEXT NOT NULL,
        dex          TEXT NOT NULL DEFAULT 'pacifica',
        wallet       TEXT NOT NULL,
        last_trade_id INTEGER NOT NULL DEFAULT 0,
        total_volume REAL NOT NULL DEFAULT 0,
        total_gold   INTEGER NOT NULL DEFAULT 0,
        first_deposit INTEGER NOT NULL DEFAULT 0,
        first_trade  INTEGER NOT NULL DEFAULT 0,
        last_daily   TEXT,
        pnl_gold_pool REAL NOT NULL DEFAULT 0,
        updated_at   TEXT NOT NULL DEFAULT (datetime('now')),
        PRIMARY KEY (player_id, dex)
      )
    `);
    const oldCols = db.db.prepare('PRAGMA table_info(trading_rewards_old_migrate)').all();
    const oldHasDex = oldCols.some(c => c.name === 'dex');
    const dexExpr = oldHasDex
      ? "COALESCE(NULLIF(dex, ''), (SELECT p.dex FROM players p WHERE p.id = trading_rewards_old_migrate.player_id), 'pacifica')"
      : "COALESCE((SELECT p.dex FROM players p WHERE p.id = trading_rewards_old_migrate.player_id), 'pacifica')";
    db.db.exec(`
      INSERT OR REPLACE INTO trading_rewards (
        player_id, dex, wallet, last_trade_id, total_volume, total_gold,
        first_deposit, first_trade, last_daily, pnl_gold_pool, updated_at
      )
      SELECT
        player_id, ${dexExpr}, wallet, last_trade_id, total_volume, total_gold,
        first_deposit, first_trade, last_daily, COALESCE(pnl_gold_pool, 0), updated_at
      FROM trading_rewards_old_migrate
    `);
    db.db.exec('DROP TABLE trading_rewards_old_migrate');
  }
} catch (e) {
  console.warn('[trading_rewards] per-dex migration failed:', e.message);
}

// Rate limiter for claim-gold (max 1 per 250ms per player).
// Previously 5000ms, which was hit by legitimate new-account flows: on
// WebSocket reconnect Pacifica replays account_trades events for every open
// position, and the client debounces each to a claimGold() call 1s later —
// five existing trades = five calls within ~5s, so only one goes through and
// the other four return 429. The rate limit now stops only outright spam
// (>4/sec) while still allowing normal burst traffic. Still cheap server-
// side (claim-gold itself is rate-protected internally by last_trade_id
// transaction + gold_history UNIQUE dedup, so even rapid identical calls
// can't double-credit).
const CLAIM_COOLDOWN_MS = 25;  // bumped 250 → 25ms (100× more lenient) per user request — last_trade_id transaction still prevents double-credit
const TRADE_REWARD_SETTLE_DELAY_SECONDS = 0;
const claimCooldowns = new Map();
setInterval(() => {
  const cutoff = Date.now() - 60000;
  for (const [k, v] of claimCooldowns) { if (v < cutoff) claimCooldowns.delete(k); }
}, 600000);

// ── Solana base58 pubkey validator (exact 32-byte = 43-44 base58 chars).
// Used by /pacifica/agent and /trading/claim-gold to gate any wallet
// pubkey that the client passes. The earlier 32-44 char regex was too
// permissive — a 32-char base58 string is only ~24 bytes, definitely
// not a Solana ed25519 pubkey, but used to pass.
function isValidSolanaPubkey(s) {
  if (typeof s !== 'string') return false;
  if (s.length < 43 || s.length > 44) return false;
  if (!/^[1-9A-HJ-NP-Za-km-z]+$/.test(s)) return false;
  try {
    const bytes = bs58.decode(s);
    return bytes.length === 32;
  } catch { return false; }
}

// Canonical message form Pacifica's bind_agent_wallet uses (matches the
// client at usePacificaAgent.js:buildMessage). Sorted keys + compact JSON
// so signature reproduces byte-for-byte across client/server.
function pacificaCanonicalMessage(type, payload, timestamp, expiryWindow) {
  const sortKeys = (v) => {
    if (Array.isArray(v)) return v.map(sortKeys);
    if (v && typeof v === 'object') {
      return Object.keys(v).sort().reduce((a, k) => { a[k] = sortKeys(v[k]); return a; }, {});
    }
    return v;
  };
  return JSON.stringify(sortKeys({ type, timestamp, expiry_window: expiryWindow, data: payload }));
}

// Verify ed25519 signature with master pubkey. nacl.sign.detached.verify
// returns boolean; we never throw on bad input, just return false.
function verifyMasterSignature({ message, signatureB58, accountB58 }) {
  try {
    const msg = new TextEncoder().encode(message);
    const sig = bs58.decode(signatureB58);
    const pub = bs58.decode(accountB58);
    if (sig.length !== 64 || pub.length !== 32) return false;
    return nacl.sign.detached.verify(msg, sig, pub);
  } catch { return false; }
}

// Cap on agents tracked per player. New binds beyond this evict the
// oldest by bound_at — keeps fan-out cost bounded and the table from
// growing unboundedly under spam. Real users rebind <5 times in a year;
// 10 covers a couple of years of sessions.
const PACIFICA_AGENTS_CAP = 10;

// Persist Pacifica agent_wallet AFTER signature-verified bind. The client
// binds once with `bind_agent_wallet` signed by the master keypair; we
// reuse the SAME signed body to prove ownership server-side. Without
// signature verification, anyone with a game token could POST a stranger's
// agent pubkey and have our server credit their gold from the stranger's
// trade history.
//
// Body: { account, agent_wallet, signature, timestamp, expiry_window }
// — exact shape Pacifica's /agent/bind expects.
router.post('/pacifica/agent', auth, (req, res) => {
  if (req.player.dex !== 'pacifica') {
    return res.status(400).json({ error: 'agent only applies to pacifica accounts' });
  }
  const { account, agent_wallet, signature, timestamp, expiry_window } = req.body || {};

  // Strict pubkey validation (32-byte ed25519 → 43-44 base58 chars).
  if (!isValidSolanaPubkey(account))      return res.status(400).json({ error: 'invalid account pubkey' });
  if (!isValidSolanaPubkey(agent_wallet)) return res.status(400).json({ error: 'invalid agent_wallet pubkey' });
  if (typeof signature !== 'string' || signature.length < 64) {
    return res.status(400).json({ error: 'signature required' });
  }

  // The signed message is unauthenticated otherwise — bound the timestamp
  // window so a stale captured signature can't be replayed forever. 5 min
  // is the same window Pacifica accepts at /agent/bind itself, so the same
  // body that worked on Pacifica still works here.
  const tsNum = Number(timestamp);
  const expiry = Number(expiry_window) || 5000;
  const now = Date.now();
  if (!Number.isFinite(tsNum) || Math.abs(now - tsNum) > 5 * 60 * 1000) {
    return res.status(400).json({ error: 'timestamp out of window (max 5 min skew)' });
  }

  // The CRITICAL check: account in the signed body must match
  // players.wallet. Without this, player A could submit player B's signed
  // bind body (publicly observable on Pacifica's network) and have OUR
  // server attribute B's agent to A's player_id, then claim-gold against
  // B's trade history.
  if (req.player.wallet !== account) {
    return res.status(403).json({ error: 'signed account does not match player.wallet' });
  }

  // Rebuild the exact message Pacifica signs and verify the master sig.
  const message = pacificaCanonicalMessage(
    'bind_agent_wallet',
    { agent_wallet },
    tsNum,
    expiry,
  );
  if (!verifyMasterSignature({ message, signatureB58: signature, accountB58: account })) {
    return res.status(403).json({ error: 'invalid signature' });
  }

  const txn = db.db.transaction(() => {
    db.db.prepare(`
      INSERT OR IGNORE INTO pacifica_agents (player_id, agent_wallet) VALUES (?, ?)
    `).run(req.player.id, agent_wallet);
    // Cap enforcement — drop oldest binds beyond PACIFICA_AGENTS_CAP. Keeps
    // fetchPacificaAllTrades fan-out bounded and blocks /pacifica/agent
    // spam from growing the table unbounded.
    db.db.prepare(`
      DELETE FROM pacifica_agents
      WHERE player_id = ?
        AND agent_wallet IN (
          SELECT agent_wallet FROM pacifica_agents
          WHERE player_id = ?
          ORDER BY bound_at DESC, agent_wallet ASC
          LIMIT -1 OFFSET ?
        )
    `).run(req.player.id, req.player.id, PACIFICA_AGENTS_CAP);
    db.db.prepare(`
      INSERT INTO trading_rewards (player_id, dex, wallet, agent_wallet)
      VALUES (?, 'pacifica', ?, ?)
      ON CONFLICT(player_id, dex) DO UPDATE SET agent_wallet = excluded.agent_wallet
    `).run(req.player.id, account, agent_wallet);
  });
  try { txn(); } catch (e) {
    console.warn(`[pacifica/agent] persist failed:`, e.message);
    return res.status(500).json({ error: 'failed to persist' });
  }

  const totalAgents = db.db.prepare('SELECT COUNT(*) AS n FROM pacifica_agents WHERE player_id = ?').get(req.player.id)?.n || 0;
  console.log(`[pacifica/agent] player=${req.player.name} master=${account.slice(0,10)} agent=${agent_wallet.slice(0,10)} sig=ok -> persisted (total agents tracked: ${totalAgents}/${PACIFICA_AGENTS_CAP})`);
  res.json({ ok: true, agent_wallet, total_agents: totalAgents });
});

// Server-side mirror of the client's localStorage `clash_pacifica_activated`
// flag. Pacifica's builder_code approval is one-time-per-account but the
// client used to forget that whenever localStorage was cleared (incognito,
// browser cleanup, Privy iframe context). The client now hydrates this
// flag from the player state on init and skips the redundant
// approve_builder_code preflight.
router.post('/pacifica/builder-approved', auth, (req, res) => {
  if (req.player.dex !== 'pacifica') return res.status(400).json({ error: 'pacifica only' });
  db.db.prepare('UPDATE players SET pacifica_builder_approved = 1 WHERE id = ?').run(req.player.id);
  console.log(`[pacifica/builder-approved] player=${req.player.name} -> persisted`);
  res.json({ ok: true });
});

// Claim gold — server verifies trades via Pacifica API
// Base NFT gold boost verification endpoints.
router.get('/nft-gold-boost/status', auth, async (req, res) => {
  try {
    const boost = await getPlayerNftGoldBoost(req.player, { force: true, clearIfMissing: true });
    res.json(nftGoldBoostPayload(boost));
  } catch (e) {
    console.warn(`[nft-gold-boost/status] player=${req.player.name} failed:`, e.message);
    res.status(503).json({
      eligible: false,
      bonus_percent: NFT_GOLD_BOOST_BONUS_PERCENT,
      error: 'Unable to verify NFT ownership right now',
    });
  }
});

router.post('/nft-gold-boost/verify', auth, async (req, res) => {
  try {
    const wallet = await normalizeNftGoldBoostAddress(req.body?.wallet);
    const signature = String(req.body?.signature || '').trim();
    const timestamp = Number(req.body?.timestamp);
    if (!wallet) return res.status(400).json({ ok: false, error: 'Valid EVM wallet required' });
    if (!signature || !/^0x[0-9a-fA-F]+$/.test(signature)) {
      return res.status(400).json({ ok: false, error: 'Signature required' });
    }
    if (!Number.isFinite(timestamp) || Math.abs(Date.now() - timestamp) > 10 * 60 * 1000) {
      return res.status(400).json({ ok: false, error: 'Verification signature expired; try again' });
    }

    const { verifyMessage, contract } = await nftGoldBoostViem();
    const message = await buildNftGoldBoostMessage({
      playerId: req.player.id,
      wallet,
      timestamp,
    });
    const signedByWallet = await verifyMessage({ address: wallet, message, signature });
    if (!signedByWallet) return res.status(401).json({ ok: false, error: 'Wallet signature did not match' });

    const ownership = await readNftGoldBoostOwnership(wallet);
    if (!ownership.owns) {
      return res.json({
        ok: true,
        eligible: false,
        bonus_percent: NFT_GOLD_BOOST_BONUS_PERCENT,
        contract,
        wallet,
        error: 'This wallet does not hold the required Base NFT',
      });
    }

    const verifiedAt = new Date().toISOString();
    db.db.prepare(`
      UPDATE players
      SET nft_gold_boost_wallet = ?,
          nft_gold_boost_contract = ?,
          nft_gold_boost_verified_at = ?
      WHERE id = ?
    `).run(wallet, contract, verifiedAt, req.player.id);
    const result = {
      eligible: true,
      wallet,
      contract,
      token_id: ownership.token_id || null,
      standard: ownership.standard || null,
      verified_at: verifiedAt,
    };
    nftGoldBoostCache.set(req.player.id, { at: Date.now(), result });
    console.log(`[nft-gold-boost] player=${req.player.name} wallet=${wallet.slice(0, 10)} -> verified +${NFT_GOLD_BOOST_BONUS_PERCENT}% gold`);
    res.json({ ok: true, ...nftGoldBoostPayload(result) });
  } catch (e) {
    console.warn(`[nft-gold-boost/verify] player=${req.player.name} failed:`, e.message);
    res.status(503).json({ ok: false, error: 'Unable to verify NFT ownership right now' });
  }
});

// Lazy-open server-futures DB (read-only) so claim-gold can credit gold
// for Avantis trades recorded by the futures service. Guarded so the main
// server still works on hosts where server-futures isn't deployed.
let _futuresDb = null;
let _futuresDbUnavailableAt = 0;
function futuresDbReadonly() {
  if (_futuresDb === 'unavailable') {
    if (Date.now() - _futuresDbUnavailableAt < 30_000) return null;
    _futuresDb = null;
  }
  if (_futuresDb) return _futuresDb;
  try {
    const Database = require('better-sqlite3');
    const fpath = process.env.CLASH_FUTURES_DB || require('path').join(__dirname, '..', 'server-futures', 'futures.db');
    if (!require('fs').existsSync(fpath)) throw new Error('futures.db not found at ' + fpath);
    _futuresDb = new Database(fpath, { readonly: true, fileMustExist: true });
    try { _futuresDb.pragma('journal_mode = WAL'); } catch {}
  } catch (e) {
    console.warn('[claim-gold] Avantis futures.db unavailable:', e.message);
    _futuresDb = 'unavailable';
    _futuresDbUnavailableAt = Date.now();
    return null;
  }
  return _futuresDb;
}

async function importGrvtFillsForClaim(playerId) {
  try {
    const futuresDb = require('../server-futures/db');
    const grvt = require('../server-futures/grvt');
    const creds = futuresDb.getGrvtCredentials(playerId);
    if (!creds?.apiKey || !creds?.subAccountId) return null;
    return await grvt.importFillsForPlayer(playerId, creds, { limit: 100 });
  } catch (e) {
    console.warn('[claim-gold grvt] pre-import failed:', e.message);
    return null;
  }
}

async function importHotstuffFillsForClaim(playerId, wallet) {
  try {
    const hotstuff = require('../server-futures/hotstuff');
    if (!hotstuff.isEvmAddress(wallet)) return null;
    return await hotstuff.importFillsForPlayer(playerId, wallet, { limit: 100 });
  } catch (e) {
    console.warn('[claim-gold hotstuff] pre-import failed:', e.message);
    return null;
  }
}

router.post('/trading/claim-gold', auth, async (req, res) => {
  const claimStartedAt = Date.now();
  // Rate limit
  const lastClaim = claimCooldowns.get(req.player.id);
  const sinceLastClaim = lastClaim ? Date.now() - lastClaim : Infinity;
  if (lastClaim && sinceLastClaim < CLAIM_COOLDOWN_MS) {
    const retryAfterMs = Math.max(1, CLAIM_COOLDOWN_MS - sinceLastClaim);
    res.set('Retry-After', '1');
    return res.status(429).json({
      gold: 0,
      reason: 'Please wait before claiming again',
      retry_after_ms: retryAfterMs,
    });
  }
  claimCooldowns.set(req.player.id, Date.now());
  // Wallet is ALWAYS the player's master from auth — body.wallet is no
  // longer trusted, since it allowed impersonation (set body.wallet to
  // a stranger's pubkey, server queries Pacifica with the stranger's
  // address, you receive credit for their trade volume).
  // For Farcaster placeholders ("fc_<fid>"), body.wallet may be the only
  // way to learn the real wallet; we accept it ONLY in that placeholder
  // case and only when it's a valid pubkey.
  const isFcPlaceholder = (w) => typeof w === 'string' && /^fc_/i.test(w);
  let wallet = req.player.wallet;
  if (isFcPlaceholder(wallet) && typeof req.body.wallet === 'string' && isValidWallet(req.body.wallet)) {
    wallet = req.body.wallet;
  }
  // Agent_wallet from body is NO LONGER persisted — only the dedicated
  // /pacifica/agent endpoint (signature-verified) can add to the agent
  // ledger. Fan-out for this claim still uses persisted agents.
  const playerDex = VALID_DEXES.has(String(req.player.dex || '').toLowerCase())
    ? String(req.player.dex).toLowerCase()
    : 'pacifica';
  const recordClaimTelemetry = (event = {}) => {
    db.recordTradeClaimResult({
      playerId: req.player.id,
      dex: event.dex || playerDex,
      futuresMode: req.player.futures_mode || null,
      wallet,
      claimLatencyMs: Date.now() - claimStartedAt,
      ...event,
    });
  };
  const requestedDex = req.body.dex == null ? playerDex : String(req.body.dex).toLowerCase();
  if (!VALID_DEXES.has(requestedDex)) {
    recordClaimTelemetry({ result: 'invalid_dex', reason: 'Invalid dex', metadata: { requested_dex: requestedDex } });
    return res.status(400).json({ error: 'Invalid dex' });
  }
  if (requestedDex !== playerDex) {
    recordClaimTelemetry({
      result: 'dex_mismatch',
      reason: 'Requested DEX does not match registered account DEX',
      metadata: { requested_dex: requestedDex, account_dex: playerDex },
    });
    return res.status(409).json({
      error: `Account is registered for '${playerDex}'. Switch DEX before claiming ${requestedDex} rewards.`,
      dex: playerDex,
    });
  }
  const dex = playerDex;

  // Auto-replace Farcaster `fc_<fid>` placeholder wallets with the real
  // address from the request body. The placeholder is stored by older
  // FC auto-register paths when an EVM provider wasn't yet available;
  // left uncorrected it blocks task verifiers from finding real trades
  // (resolveWallet returns null for non-Solana/non-EVM strings) and
  // makes trading_rewards.wallet useless.
  const isPlaceholderWallet = (w) => typeof w === 'string' && /^fc_/i.test(w);
  if (isValidWallet(wallet) && isPlaceholderWallet(req.player.wallet)) {
    try {
      db.db.prepare('UPDATE players SET wallet = ? WHERE id = ?').run(wallet, req.player.id);
      db.db.prepare('UPDATE trading_rewards SET wallet = ? WHERE player_id = ? AND dex = ?').run(wallet, req.player.id, dex);
      console.log(`[claim-gold] replaced placeholder ${req.player.wallet} with real wallet ${wallet} for player ${req.player.id}`);
    } catch { /* non-fatal */ }
  }

  // ── Self-custody DEXes (Avantis on Base, Decibel on Aptos, GMX on
  // Arbitrum) ── Both Avantis and Decibel already write verified rows into
  // futures.db trade_history via their dedicated rewards-workers; GMX rides
  // the same query but has no worker yet (Phase 3). Until the GMX events
  // indexer ships, the trade_history query returns 0 rows and the user
  // simply gets "No new trades" — that's the desired no-op, NOT a fall-
  // through to the Pacifica branch which would 400 with "wallet required"
  // or worse, hit Pacifica's REST with a non-Solana address.
  if (dex === 'avantis' || dex === 'decibel' || dex === 'gmx' || dex === 'monad' || dex === 'phoenix' || dex === 'hyperliquid' || dex === 'risex' || dex === 'nado' || dex === 'hibachi' || dex === 'hotstuff' || dex === 'grvt' || dex === 'katana' || dex === 'gmtrade') {
    if (dex === 'grvt') {
      await importGrvtFillsForClaim(req.player.id);
    } else if (dex === 'hotstuff') {
      await importHotstuffFillsForClaim(req.player.id, wallet);
    }
    const fdb = futuresDbReadonly();
    if (!fdb) {
      recordClaimTelemetry({ result: 'service_unavailable', reason: 'Futures service unavailable' });
      return res.json({ gold: 0, reason: 'Futures service unavailable — try again later' });
    }
    let reward = db.db.prepare('SELECT * FROM trading_rewards WHERE player_id = ? AND dex = ?').get(req.player.id, dex);
    if (!reward) {
      db.db.prepare('INSERT INTO trading_rewards (player_id, dex, wallet) VALUES (?, ?, ?)').run(req.player.id, dex, wallet || '');
      reward = db.db.prepare('SELECT * FROM trading_rewards WHERE player_id = ? AND dex = ?').get(req.player.id, dex);
    }
    // GMX briefly used a $50 minimum notional in this claim path. Hyperliquid
    // had a similar early-rollout risk while we were tuning import timing.
    // If a row has never paid anything, rewind the cursor once so verified
    // rows can be credited under the current rules.
    if ((dex === 'gmx' || dex === 'hyperliquid' || dex === 'risex' || dex === 'nado' || dex === 'hibachi' || dex === 'hotstuff' || dex === 'grvt' || dex === 'katana')
      && Number(reward.last_trade_id || 0) > 0
      && Number(reward.total_volume || 0) === 0
      && Number(reward.total_gold || 0) === 0) {
      db.db.prepare('UPDATE trading_rewards SET last_trade_id = 0 WHERE player_id = ? AND dex = ?')
        .run(req.player.id, dex);
      reward = { ...reward, last_trade_id: 0 };
      console.log(`[claim-gold ${dex}] rewound zero-credit cursor for player=${req.player.name}`);
    }
    let newTrades = [];
    let hyperliquidWalletRowsAvailable = 0;
    const rewardSettleDelaySql = `-${TRADE_REWARD_SETTLE_DELAY_SECONDS} seconds`;
    const sourceWhere = dex === 'decibel'
      ? "AND verified_source = 'decibel_fill'"
      : dex === 'monad'
        ? "AND verified_source IN ('perpl_api', 'perpl_ws')"
        : dex === 'hyperliquid'
          ? "AND verified_source = 'hyperliquid_api'"
        : dex === 'risex'
          ? "AND verified_source = 'risex_api'"
          : dex === 'nado'
            ? "AND verified_source = 'nado_api'"
          : dex === 'hibachi'
            ? "AND verified_source = 'hibachi_api'"
          : dex === 'hotstuff'
            ? "AND verified_source = 'hotstuff_api'"
          : dex === 'grvt'
            ? "AND verified_source = 'grvt_builder'"
          : dex === 'katana'
            ? "AND verified_source = 'katana_api'"
          : dex === 'gmtrade'
            ? "AND verified_source = 'gmtrade_tx'"
          : dex === 'phoenix'
            ? "AND verified_source IN ('worker', 'tx')"
        : "AND verified_source = 'worker'";
    const hyperliquidWalletPrefix = dex === 'hyperliquid' && EVM_WALLET_RE.test(String(wallet || ''))
      ? `hyperliquid:${String(wallet).toLowerCase()}:%`
      : null;
    try {
      // Avantis/GMX stay worker-only. Decibel rewards count only trades routed
      // through the Clash app/server signer; worker rows may include external
      // Decibel activity and therefore cannot drive rewards or tournament volume.
      if (hyperliquidWalletPrefix) {
        // Hyperliquid fill client_order_id is wallet-scoped. This fallback
        // lets a user keep rewards if the same EVM wallet was re-registered
        // and an older import row sits under a stale player_id. The main DB's
        // UNIQUE(wallet,dex) still keeps the live Hyperliquid account unique.
        hyperliquidWalletRowsAvailable = fdb.prepare(`
          SELECT COUNT(*) AS n
          FROM trade_history
          WHERE dex = 'hyperliquid' AND status = 'filled'
            AND verified_source = 'hyperliquid_api'
            AND lower(client_order_id) LIKE ?
            AND id > ?
        `).get(hyperliquidWalletPrefix, reward.last_trade_id || 0)?.n || 0;
        newTrades = fdb.prepare(`
          SELECT id, symbol, side, amount, notional_usd, pnl, status, verified_source, client_order_id, created_at
          FROM trade_history
          WHERE dex = ? AND status = 'filled'
            ${sourceWhere}
            AND created_at <= datetime('now', ?)
            AND id > ?
            AND (
              player_id = ?
              OR lower(client_order_id) LIKE ?
            )
          ORDER BY id ASC
        `).all(dex, rewardSettleDelaySql, reward.last_trade_id || 0, req.player.id, hyperliquidWalletPrefix);
      } else {
        newTrades = fdb.prepare(`
          SELECT id, symbol, side, amount, notional_usd, pnl, status, verified_source, client_order_id, created_at
          FROM trade_history
          WHERE player_id = ? AND dex = ? AND status = 'filled'
            ${sourceWhere}
            AND created_at <= datetime('now', ?)
            AND id > ?
          ORDER BY id ASC
        `).all(req.player.id, dex, rewardSettleDelaySql, reward.last_trade_id || 0);
      }
    } catch (e) {
      console.warn(`[claim-gold] ${dex} verified trade query failed:`, e.message);
      recordClaimTelemetry({ result: 'verifier_error', reason: e.message, metadata: { phase: 'verified_trade_query' } });
      return res.json({ gold: 0, reason: 'Futures trade verifier unavailable - try again later', dex });
    }
    let settlingTrades = { n: 0, first_at: null };
    try {
      if (hyperliquidWalletPrefix) {
        settlingTrades = fdb.prepare(`
          SELECT COUNT(*) AS n, MIN(created_at) AS first_at
          FROM trade_history
          WHERE dex = ? AND status = 'filled'
            ${sourceWhere}
            AND created_at > datetime('now', ?)
            AND id > ?
            AND (
              player_id = ?
              OR lower(client_order_id) LIKE ?
            )
        `).get(dex, rewardSettleDelaySql, reward.last_trade_id || 0, req.player.id, hyperliquidWalletPrefix) || settlingTrades;
      } else {
        settlingTrades = fdb.prepare(`
          SELECT COUNT(*) AS n, MIN(created_at) AS first_at
          FROM trade_history
          WHERE player_id = ? AND dex = ? AND status = 'filled'
            ${sourceWhere}
            AND created_at > datetime('now', ?)
            AND id > ?
        `).get(req.player.id, dex, rewardSettleDelaySql, reward.last_trade_id || 0) || settlingTrades;
      }
    } catch (e) {
      console.warn(`[claim-gold ${dex}] settling trade query failed:`, e.message);
    }

    // Decibel worker rows can include external Decibel activity, so tournament
    // PnL sync is disabled in app-only accounting mode.
    const syncDecibelTournamentPnl = () => ({ credited_rows: 0, trades_count: 0, volume_usd: 0, pnl_usd: 0 });
    const settlingPayload = () => {
      const firstMs = sqliteUtcMs(settlingTrades.first_at);
      const readyAt = firstMs ? firstMs + TRADE_REWARD_SETTLE_DELAY_SECONDS * 1000 : Date.now() + TRADE_REWARD_SETTLE_DELAY_SECONDS * 1000;
      const retryAfterMs = Math.max(1000, readyAt - Date.now());
      return {
        gold: 0,
        reason: `Trade is settling - rewards unlock in ${Math.ceil(retryAfterMs / 1000)}s`,
        dex,
        retry_after_ms: retryAfterMs,
        pending_trades: Number(settlingTrades.n || 0),
      };
    };
    console.log(`[claim-gold ${dex}] player=${req.player.name} id=${req.player.id} wallet=${(wallet||'').slice(0,10)} last_trade_id=${reward.last_trade_id||0} new_trades=${newTrades.length} wallet_rows=${hyperliquidWalletRowsAvailable || '-'} stored_volume=$${(reward.total_volume||0).toFixed(2)} stored_gold=${reward.total_gold||0}`);
    const lastTradeIdBefore = Number(reward.last_trade_id || 0);
    const rawTradeCount = newTrades.length;
    const rawVolumeUsd = newTrades.reduce((sum, t) => {
      const v = Number(t.notional_usd);
      return Number.isFinite(v) ? sum + v : sum;
    }, 0);
    const hyperliquidClaimDebug = () => dex === 'hyperliquid' ? {
      last_trade_id: reward.last_trade_id || 0,
      wallet_rows_available: hyperliquidWalletRowsAvailable,
      first_deposit: Boolean(reward.first_deposit),
      first_trade: Boolean(reward.first_trade),
      player_id: String(req.player.id || '').slice(0, 8),
      wallet: EVM_WALLET_RE.test(String(wallet || '')) ? `${String(wallet).slice(0, 10)}...` : null,
    } : undefined;

    if (newTrades.length === 0 && Number(settlingTrades.n || 0) > 0) {
      const pnlSync = syncDecibelTournamentPnl();
      if (pnlSync.credited_rows > 0) {
        console.log(`[claim-gold ${dex}] player=${req.player.name} -> SYNCED tournament pnl=$${pnlSync.pnl_usd.toFixed(2)} rows=${pnlSync.credited_rows}`);
        recordClaimTelemetry({
          result: 'tournament_pnl_synced',
          reason: 'Tournament PnL synced',
          lastTradeIdBefore,
          lastTradeIdAfter: lastTradeIdBefore,
          rawTradeCount,
          rawVolumeUsd,
          pnlUsd: pnlSync.pnl_usd,
          settlingTradeCount: Number(settlingTrades.n || 0),
          metadata: { credited_rows: pnlSync.credited_rows },
        });
        return res.json({
          gold: 0,
          reason: `Tournament PnL synced: $${pnlSync.pnl_usd.toFixed(2)}`,
          dex,
          tournament_pnl_usd: pnlSync.pnl_usd,
        });
      }
      console.log(`[claim-gold ${dex}] player=${req.player.name} -> SETTLING pending=${settlingTrades.n}`);
      recordClaimTelemetry({
        result: 'settling',
        reason: 'Trade is settling',
        lastTradeIdBefore,
        lastTradeIdAfter: lastTradeIdBefore,
        rawTradeCount,
        rawVolumeUsd,
        settlingTradeCount: Number(settlingTrades.n || 0),
      });
      return res.json(settlingPayload());
    }

    if (newTrades.length === 0 && reward.first_deposit && reward.first_trade) {
      const pnlSync = syncDecibelTournamentPnl();
      if (pnlSync.credited_rows > 0) {
        console.log(`[claim-gold ${dex}] player=${req.player.name} -> SYNCED tournament pnl=$${pnlSync.pnl_usd.toFixed(2)} rows=${pnlSync.credited_rows}`);
        recordClaimTelemetry({
          result: 'tournament_pnl_synced',
          reason: 'Tournament PnL synced',
          lastTradeIdBefore,
          lastTradeIdAfter: lastTradeIdBefore,
          rawTradeCount,
          rawVolumeUsd,
          pnlUsd: pnlSync.pnl_usd,
          metadata: { credited_rows: pnlSync.credited_rows },
        });
        return res.json({
          gold: 0,
          reason: `Tournament PnL synced: $${pnlSync.pnl_usd.toFixed(2)}`,
          dex,
          tournament_pnl_usd: pnlSync.pnl_usd,
        });
      }
      console.log(`[claim-gold ${dex}] player=${req.player.name} -> NO NEW TRADES (returning 0)`);
      recordClaimTelemetry({
        result: 'no_new_trades',
        reason: 'No new trades',
        lastTradeIdBefore,
        lastTradeIdAfter: lastTradeIdBefore,
        rawTradeCount,
        rawVolumeUsd,
      });
      return res.json({
        gold: 0,
        reason: 'No new trades',
        dex,
        detail: hyperliquidClaimDebug(),
      });
    }

    // Sanity: clamp each trade's notional to a sane range so a bugged/forged
    // row (e.g. Infinity from parseFloat("1e100")) cannot mint unlimited gold.
    // Decibel was at $1 — too low because Decibel min_size per market lets
    // self-traded $1 fills count as legitimate. Bumped to $10 to match
    // a sensible micro-trade floor across all four DEXes.
    const SANE_MIN_NOTIONAL = dex === 'gmx'
      ? 0
      : (dex === 'decibel' || dex === 'monad' || dex === 'phoenix' || dex === 'hyperliquid' || dex === 'risex' || dex === 'nado' || dex === 'hibachi' || dex === 'hotstuff' || dex === 'grvt' || dex === 'katana' || dex === 'gmtrade') ? 10 : 50;
    const SANE_MAX_NOTIONAL = 10_000_000;

    let totalGold = 0;
    const reasons = [];
    let maxId = reward.last_trade_id || 0;
    let newVolume = 0;
    let newPnl = 0;
    let volumeGold = 0;
    let clampedTradeCount = 0;
    let creditedTrades = 0;
    const creditedTradeRows = [];
    // Track opens separately — "first_trade" bonus should only fire on an
    // actual OPEN (long/short), not on a close-only sequence. Previously a
    // user who closed a pre-reward position without ever opening a new one
    // qualified for the 300-gold bonus. `side` values from the worker are
    // 'long' / 'short' for opens and 'close_long' / 'close_short' for closes.
    let creditedOpens = 0;
    for (const t of newTrades) {
      if (t.reward_duplicate) {
        if (t.id > maxId) maxId = t.id;
        continue;
      }
      const raw = Number(t.notional_usd);
      if (!Number.isFinite(raw) || raw < SANE_MIN_NOTIONAL || raw > SANE_MAX_NOTIONAL) {
        clampedTradeCount += 1;
        if (t.id > maxId) maxId = t.id; // still advance cursor to skip it
        continue;
      }
      newVolume += raw;
      // pnl is per-close trade in trade_history; opens have it null/0. Sum
      // across credited trades so the tournament leaderboard shows realised
      // pnl across the claim window. Clamp to a sane band so a malformed
      // row can't poison the cumulative total.
      const pnlRaw = Number(t.pnl);
      if (Number.isFinite(pnlRaw) && pnlRaw > -SANE_MAX_NOTIONAL && pnlRaw < SANE_MAX_NOTIONAL) {
        newPnl += pnlRaw;
      }
      const tradeGold = volumeGoldForDex(dex, raw);
      volumeGold += tradeGold;
      totalGold += tradeGold;
      creditedTrades++;
      creditedTradeRows.push(t);
      const sideLower = String(t.side || '').toLowerCase();
      if (sideLower === 'long' || sideLower === 'short' || sideLower === 'bid' || sideLower === 'ask') {
        creditedOpens++;
      }
      if (t.id > maxId) maxId = t.id;
    }
    if (creditedTrades > 0) reasons.push(`${creditedTrades} trades`);

    // GOLD_FIRST_DEPOSIT: only award once the player has ALSO completed their
    // first real trade. Previously it was granted unconditionally on the first
    // /claim-gold call, letting a brand-new account farm 500 gold without
    // ever depositing or trading.
    //
    // Additional guard: audit gold_history for a prior grant. If an admin
    // resets `trading_rewards.first_deposit=0` (or the row gets deleted and
    // recreated), the flag-based check re-fires and the bonus pays again.
    // Checking gold_history defends against that by making the bonus truly
    // once-per-player.
    //
    // first_trade gate: `creditedOpens > 0` rather than all trades, so close-
    // only activity doesn't trigger the opening bonus.
    const hasRealOpen = creditedOpens > 0 || reward.first_trade;
    const priorBonuses = db.db.prepare(
      "SELECT reason FROM gold_history WHERE player_id = ? AND (reason LIKE '%First deposit!%' OR reason LIKE '%First trade!%')"
    ).all(req.player.id);
    const alreadyPaidFirstDeposit = priorBonuses.some(r => String(r.reason).includes('First deposit!'));
    const alreadyPaidFirstTrade   = priorBonuses.some(r => String(r.reason).includes('First trade!'));
    let firstDepositGold = 0;
    let firstTradeGold = 0;
    let dailyGold = 0;
    if (!reward.first_deposit && !alreadyPaidFirstDeposit && hasRealOpen) {
      firstDepositGold = GOLD_FIRST_DEPOSIT;
      totalGold += firstDepositGold;
      reasons.push('First deposit!');
    }
    if (!reward.first_trade && !alreadyPaidFirstTrade && creditedOpens > 0) {
      firstTradeGold = GOLD_FIRST_TRADE;
      totalGold += firstTradeGold;
      reasons.push('First trade!');
    }
    const today = new Date().toISOString().split('T')[0];
    if (reward.last_daily !== today && creditedTrades > 0) {
      dailyGold = GOLD_DAILY_TRADE;
      totalGold += dailyGold;
      reasons.push('Daily bonus');
    }
    let nftGoldBoost = { eligible: false };
    try {
      nftGoldBoost = await getPlayerNftGoldBoost(req.player, { clearIfMissing: true });
    } catch (e) {
      console.warn(`[claim-gold ${dex}] NFT gold boost skipped:`, e.message);
    }
    const boostedTotalGold = applyNftGoldBoostAmount(totalGold, nftGoldBoost, reasons);
    const nftBoostGold = Math.max(0, Math.round(boostedTotalGold - totalGold));

    // All writes wrapped in a transaction so two concurrent /claim-gold
    // requests from the same player can't both read the same last_trade_id
    // and double-credit overlapping trades. The transaction also guarantees
    // the UPDATE + addResources + gold_history INSERT stay in sync (prior
    // code's trailing try/catch on gold_history could leave total_gold
    // incremented without a history row).
    //
    // Inside the transaction we re-read last_trade_id and short-circuit if
    // it moved past our cursor — a sibling request just processed these
    // trades. `better-sqlite3` transactions are synchronous so this
    // "compare-and-set" is atomic.
    const creditTxn = db.db.transaction(() => {
      const fresh = db.db.prepare('SELECT last_trade_id FROM trading_rewards WHERE player_id = ? AND dex = ?').get(req.player.id, dex);
      const expectedLastId = reward.last_trade_id || 0;
      const actualLastId = (fresh && fresh.last_trade_id) || 0;
      if (actualLastId !== expectedLastId) {
        return { raced: true, paid: 0 };
      }
      // Tournament boost: if the player is in an active tournament for this
      // DEX, the gold credit is multiplied by gold_boost (and the boosted
      // amount is recorded in tournament_participants.gold). Outside any
      // tournament this returns the original number — same as the legacy
      // behaviour.
      const tournamentGold = boostedTotalGold > 0 ? db.applyGoldReward(req.player.id, boostedTotalGold) : 0;
      const prosperityGold = db.applyAltarProsperityResourceBonus(req.player.id, { gold: tournamentGold, wood: 0, ore: 0 });
      const paidGold = prosperityGold.gold;
      db.db.prepare(`
        UPDATE trading_rewards SET
          last_trade_id = ?, total_volume = total_volume + ?, total_gold = total_gold + ?,
          first_deposit = CASE WHEN ? > 0 OR first_trade = 1 THEN 1 ELSE first_deposit END,
          first_trade = CASE WHEN ? > 0 THEN 1 ELSE first_trade END,
          last_daily = CASE WHEN ? > 0 THEN ? ELSE last_daily END,
          updated_at = datetime('now')
        WHERE player_id = ? AND dex = ?
      `).run(maxId, newVolume, paidGold, creditedOpens, creditedOpens, creditedTrades, today, req.player.id, dex);
      if (paidGold > 0) {
        db.addResources(req.player.id, paidGold, 0, 0, {
          sourceType: 'trade_claim',
          metadata: {
            dex,
            credited_trades: creditedTrades,
            credited_opens: creditedOpens,
            credited_volume_usd: newVolume,
            pnl_usd: newPnl,
            reasons,
          },
        });
        // Record the payout in gold_history so ProfileModal's trading-stats
        // timeline shows the same ledger as Pacifica. Reason must contain
        // "trade" / "profit" / "daily" / "deposit" / "volume" for the
        // daily_trade_gold task verifier's heuristic (see tasks.js).
        db.db.prepare('INSERT INTO gold_history (player_id, amount, reason) VALUES (?, ?, ?)')
          .run(req.player.id, paidGold, reasons.join(' + ') || 'Trading reward');
      }
      // Tournament leaderboard: track every credited trade's volume + pnl
      // so volume_usd / pnl_usd / trades_count update in lockstep with the
      // gold credit. No-op outside tournaments. Bumping inside the txn
      // keeps the leaderboard atomic with the gold ledger.
      if (creditedTrades > 0) {
        db.recordTournamentTradeRows(req.player.id, creditedTradeRows, {
          source: 'trade_history',
          count: true,
          volume: true,
          pnl: true,
        });
      }
      syncDecibelTournamentPnl();
      return {
        raced: false,
        paid: paidGold,
        tournament_gold: tournamentGold,
        prosperity_bonus_pct: prosperityGold.prosperity_bonus_pct,
        prosperity_bonus: prosperityGold.bonus.gold,
      };
    });

    const txnResult = creditTxn();
    const selfClaimTelemetryBase = {
      lastTradeIdBefore,
      lastTradeIdAfter: maxId,
      rawTradeCount,
      creditedTradeCount: creditedTrades,
      creditedOpenCount: creditedOpens,
      rawVolumeUsd,
      creditedVolumeUsd: newVolume,
      pnlUsd: newPnl,
      volumeGold,
      firstDepositGold,
      firstTradeGold,
      dailyGold,
      nftBoostGold,
      tournamentGold: txnResult.tournament_gold || 0,
      altarBonusGold: txnResult.prosperity_bonus || 0,
      totalGoldPaid: txnResult.paid || 0,
      clampedTradeCount,
      settlingTradeCount: Number(settlingTrades.n || 0),
      metadata: {
        reasons,
        wallet_rows_available: hyperliquidWalletRowsAvailable || 0,
        sane_min_notional: SANE_MIN_NOTIONAL,
      },
    };
    if (txnResult.raced) {
      console.log(`[claim-gold ${dex}] player=${req.player.name} -> RACED (parallel claim)`);
      recordClaimTelemetry({
        ...selfClaimTelemetryBase,
        result: 'raced',
        reason: 'Already claimed by parallel request',
        totalGoldPaid: 0,
      });
      return res.json({ gold: 0, reason: 'Already claimed by parallel request', dex });
    }
    if (txnResult.paid > 0) {
      console.log(`[claim-gold ${dex}] player=${req.player.name} -> PAID gold=${txnResult.paid} base_gold=${totalGold} nft_boosted_gold=${boostedTotalGold} new_volume=$${newVolume.toFixed(2)} pnl=$${newPnl.toFixed(2)} credited_trades=${creditedTrades} reasons="${reasons.join(' + ')}"`);
      recordClaimTelemetry({
        ...selfClaimTelemetryBase,
        result: 'paid',
        reason: reasons.join(' + ') || 'Trading reward',
      });
      return res.json({
        gold: txnResult.paid,
        reason: reasons.join(' + ') || 'Trading reward',
        dex,
        nft_boost: nftGoldBoostPayload(nftGoldBoost),
        tournament_gold: txnResult.tournament_gold || 0,
        altar_prosperity_bonus_pct: txnResult.prosperity_bonus_pct || 0,
        altar_prosperity_bonus: txnResult.prosperity_bonus || 0,
      });
    }
    console.log(`[claim-gold ${dex}] player=${req.player.name} -> ZERO PAID (had ${newTrades.length} raw trades, all clamped/below threshold)`);
    recordClaimTelemetry({
      ...selfClaimTelemetryBase,
      result: 'zero_payout',
      reason: newTrades.length ? 'Below reward threshold' : 'No new trades',
      totalGoldPaid: 0,
    });
    return res.json({
      gold: 0,
      reason: newTrades.length ? 'Below reward threshold' : 'No new trades',
      dex,
      detail: hyperliquidClaimDebug(),
    });
  }

  // ── Pacifica branch ──
  if (!wallet) {
    recordClaimTelemetry({ result: 'wallet_required', reason: 'wallet required' });
    return res.status(400).json({ error: 'wallet required — connect wallet in profile' });
  }

  try {
    // Get or create reward record. Agents are managed exclusively by the
    // signature-verified /pacifica/agent endpoint now, so we never write
    // agent_wallet from this body.
    let reward = db.db.prepare('SELECT * FROM trading_rewards WHERE player_id = ? AND dex = ?').get(req.player.id, dex);
    if (!reward) {
      db.db.prepare('INSERT INTO trading_rewards (player_id, dex, wallet) VALUES (?, ?, ?)').run(req.player.id, dex, wallet);
      reward = db.db.prepare('SELECT * FROM trading_rewards WHERE player_id = ? AND dex = ?').get(req.player.id, dex);
    }
    const pacLastTradeIdBefore = Number(reward.last_trade_id || 0);
    // Auto-link wallet to player account ONLY when going from FC placeholder
    // to real wallet — never accept body.wallet as an arbitrary override.
    if (isFcPlaceholder(req.player.wallet) && isValidWallet(wallet)) {
      try { db.db.prepare('UPDATE players SET wallet = ? WHERE id = ?').run(wallet, req.player.id); } catch {}
    }

    // Fan out across master + every historical agent — Pacifica indexes
    // by signer, and rebinding (any localStorage wipe) generates a new
    // agent leaving residual unclaimed trades on the OLD agent. The
    // helper merges + dedupes by history_id.
    const playerForFetch = { ...req.player, wallet };
    const t0 = Date.now();
    const allTrades = await tasks.fetchPacificaAllTrades(playerForFetch, { since: reward.last_trade_id || 0 });
    const apiMs = Date.now() - t0;
    console.log(`[claim-gold pacifica] player=${req.player.name} id=${req.player.id} master=${(wallet||'').slice(0,10)} agent=${(reward.agent_wallet||'').slice(0,10)||'-'} last_trade_id=${reward.last_trade_id||0} merged_count=${allTrades.length} total_ms=${apiMs} stored_volume=$${(reward.total_volume||0).toFixed(2)} stored_gold=${reward.total_gold||0}`);

    // Filter only new trades (after last_trade_id) from the merged set.
    const newTrades = allTrades.filter(t => t.history_id > reward.last_trade_id);
    const pacRawVolumeUsd = newTrades.reduce((sum, t) => {
      const volume = parseFloat(t.price || 0) * parseFloat(t.amount || 0);
      return Number.isFinite(volume) ? sum + volume : sum;
    }, 0);
    if (newTrades.length === 0 && reward.first_deposit && reward.first_trade) {
      console.log(`[claim-gold pacifica] player=${req.player.name} -> NO NEW TRADES (api_total=${allTrades.length}, all <= last_trade_id=${reward.last_trade_id})`);
      recordClaimTelemetry({
        result: 'no_new_trades',
        reason: 'No new trades',
        lastTradeIdBefore: pacLastTradeIdBefore,
        lastTradeIdAfter: pacLastTradeIdBefore,
        rawTradeCount: newTrades.length,
        rawVolumeUsd: pacRawVolumeUsd,
        metadata: { api_total: allTrades.length, api_ms: apiMs },
      });
      return res.json({ gold: 0, reason: 'No new trades' });
    }
    // Pacifica trade history is fill-level: one user order can appear as
    // several history_id rows with the same order_id. Sum fill volume/PnL, but
    // count unique order_id values for "trades" bonuses and leaderboards.
    const tradeEventKey = (t) => String(t.order_id || t.client_order_id || t.history_id || '');
    const uniqueTradeCount = new Set(newTrades.map(tradeEventKey).filter(Boolean)).size;
    const isPacificaClose = (t) => String(t.side || '').toLowerCase().includes('close');
    const isPacificaOpen = (t) => !isPacificaClose(t);
    const uniqueOpenTradeCount = new Set(
      newTrades.filter(isPacificaOpen).map(tradeEventKey).filter(Boolean)
    ).size;

    let totalGold = 0;
    const reasons = [];
    let maxTradeId = reward.last_trade_id;
    let volumeGold = 0;

    // Volume rewards
    for (const t of newTrades) {
      const volume = parseFloat(t.price || 0) * parseFloat(t.amount || 0);
      const tradeGold = volumeGoldForDex('pacifica', volume);
      volumeGold += tradeGold;
      totalGold += tradeGold;
      if (t.history_id > maxTradeId) maxTradeId = t.history_id;
    }

    // PnL profit rewards — check realized PnL from close trades
    let closePnl = 0;
    let netPnl = 0;
    for (const t of newTrades) {
      const side = (t.side || '').toLowerCase();
      if (side.includes('close')) {
        const pnl = parseFloat(t.realized_pnl || t.pnl || 0);
        if (Number.isFinite(pnl)) netPnl += pnl;
        if (pnl > 0) closePnl += pnl;
      }
    }
    // Accumulate fractional profit in pool, award 100 gold per $10 crossed
    let pnlPool = (reward.pnl_gold_pool || 0) + closePnl;
    let pnlGold = 0;
    if (pnlPool >= 10) {
      const chunks = Math.floor(pnlPool / 10);
      pnlGold = chunks * GOLD_PER_10_USD_PROFIT;
      totalGold += pnlGold;
      pnlPool -= chunks * 10;
      reasons.push(`+$${(chunks * 10).toFixed(0)} profit`);
    }

    if (uniqueTradeCount > 0) {
      reasons.push(`${uniqueTradeCount} trades`);
    }

    // First deposit / first trade bonuses — once per player forever.
    // Both the flag AND a gold_history audit must say "never paid". If an
    // admin resets trading_rewards.first_deposit=0, the gold_history check
    // still blocks a repeat payout.
    const priorBonusesPac = db.db.prepare(
      "SELECT reason FROM gold_history WHERE player_id = ? AND (reason LIKE '%First deposit!%' OR reason LIKE '%First trade!%')"
    ).all(req.player.id);
    const alreadyPaidFirstDepositPac = priorBonusesPac.some(r => String(r.reason).includes('First deposit!'));
    const alreadyPaidFirstTradePac   = priorBonusesPac.some(r => String(r.reason).includes('First trade!'));
    const hasRealPacificaOpen = uniqueOpenTradeCount > 0 || reward.first_trade;
    let firstDepositGold = 0;
    let firstTradeGold = 0;
    let dailyGold = 0;
    if (!reward.first_deposit && !alreadyPaidFirstDepositPac && hasRealPacificaOpen) {
      firstDepositGold = GOLD_FIRST_DEPOSIT;
      totalGold += firstDepositGold;
      reasons.push('First deposit!');
    }
    if (!reward.first_trade && !alreadyPaidFirstTradePac && uniqueOpenTradeCount > 0) {
      firstTradeGold = GOLD_FIRST_TRADE;
      totalGold += firstTradeGold;
      reasons.push('First trade!');
    }

    // Daily bonus
    const today = new Date().toISOString().split('T')[0];
    if (reward.last_daily !== today && uniqueTradeCount > 0) {
      dailyGold = GOLD_DAILY_TRADE;
      totalGold += dailyGold;
      reasons.push('Daily bonus');
    }
    let nftGoldBoost = { eligible: false };
    try {
      nftGoldBoost = await getPlayerNftGoldBoost(req.player, { clearIfMissing: true });
    } catch (e) {
      console.warn('[claim-gold pacifica] NFT gold boost skipped:', e.message);
    }
    const boostedTotalGold = applyNftGoldBoostAmount(totalGold, nftGoldBoost, reasons);
    const nftBoostGold = Math.max(0, Math.round(boostedTotalGold - totalGold));

    // Atomic write: guard against two concurrent /claim-gold requests both
    // reading the same last_trade_id and crediting overlapping trades.
    // Inside the transaction we re-read the cursor — if another request
    // advanced it, abort gracefully.
    const newVolume = newTrades.reduce((s, t) => s + parseFloat(t.price || 0) * parseFloat(t.amount || 0), 0);
    const creditTxnPac = db.db.transaction(() => {
      const fresh = db.db.prepare('SELECT last_trade_id FROM trading_rewards WHERE player_id = ? AND dex = ?').get(req.player.id, dex);
      const expectedLastId = reward.last_trade_id || 0;
      const actualLastId = (fresh && fresh.last_trade_id) || 0;
      if (actualLastId !== expectedLastId) {
        return { raced: true, paid: 0 };
      }
      const insertTrade = db.db.prepare('INSERT OR IGNORE INTO player_trades (player_id, history_id, symbol, price, amount, fee) VALUES (?, ?, ?, ?, ?, ?)');
      for (const t of newTrades) {
        insertTrade.run(req.player.id, t.history_id, t.symbol || '?', t.price || '0', t.amount || '0', t.builder_fee || '0');
      }
      // Tournament boost: gold credit is multiplied by gold_boost when the
      // player is in an active Pacifica tournament. The boosted amount
      // also lands in tournament_participants.gold for the leaderboard.
      const tournamentGold = boostedTotalGold > 0 ? db.applyGoldReward(req.player.id, boostedTotalGold) : 0;
      const prosperityGold = db.applyAltarProsperityResourceBonus(req.player.id, { gold: tournamentGold, wood: 0, ore: 0 });
      const paidGold = prosperityGold.gold;
      db.db.prepare(`
        UPDATE trading_rewards SET
          last_trade_id = ?, total_volume = total_volume + ?, total_gold = total_gold + ?,
          first_deposit = CASE WHEN ? > 0 OR first_trade = 1 THEN 1 ELSE first_deposit END,
          first_trade = CASE WHEN ? > 0 THEN 1 ELSE first_trade END,
          last_daily = CASE WHEN ? > 0 THEN ? ELSE last_daily END,
          pnl_gold_pool = ?, updated_at = datetime('now')
        WHERE player_id = ? AND dex = ?
      `).run(maxTradeId, newVolume, paidGold, uniqueOpenTradeCount, uniqueOpenTradeCount, uniqueTradeCount, today, pnlPool, req.player.id, dex);
      if (paidGold > 0) {
        db.addResources(req.player.id, paidGold, 0, 0, {
          sourceType: 'trade_claim',
          metadata: {
            dex,
            unique_trades: uniqueTradeCount,
            unique_opens: uniqueOpenTradeCount,
            credited_volume_usd: newVolume,
            pnl_usd: netPnl,
            reasons,
          },
        });
        const reason = reasons.join(' + ') || 'Trading reward';
        db.db.prepare('INSERT INTO gold_history (player_id, amount, reason) VALUES (?, ?, ?)').run(req.player.id, paidGold, reason);
      }
      // Tournament leaderboard: bump trades_count + volume_usd + pnl_usd
      // in lockstep with the gold credit. closePnl already excludes losses
      // (only positive realized PnL counts) but leaderboards typically
      // want NET pnl — recompute the signed sum here.
      if (uniqueTradeCount > 0) {
        let tournamentNetPnl = 0;
        for (const t of newTrades) {
          const side = (t.side || '').toLowerCase();
          if (side.includes('close')) {
            const v = parseFloat(t.realized_pnl || t.pnl || 0);
            if (Number.isFinite(v)) tournamentNetPnl += v;
          }
        }
        db.recordTournamentTrade(req.player.id, newVolume, tournamentNetPnl, uniqueTradeCount);
      }
      return {
        raced: false,
        paid: paidGold,
        tournament_gold: tournamentGold,
        prosperity_bonus_pct: prosperityGold.prosperity_bonus_pct,
        prosperity_bonus: prosperityGold.bonus.gold,
      };
    });
    const txnResPac = creditTxnPac();
    const pacClaimTelemetryBase = {
      lastTradeIdBefore: pacLastTradeIdBefore,
      lastTradeIdAfter: maxTradeId,
      rawTradeCount: newTrades.length,
      creditedTradeCount: uniqueTradeCount,
      creditedOpenCount: uniqueOpenTradeCount,
      rawVolumeUsd: pacRawVolumeUsd,
      creditedVolumeUsd: newVolume,
      pnlUsd: netPnl,
      volumeGold,
      firstDepositGold,
      firstTradeGold,
      dailyGold,
      pnlGold,
      nftBoostGold,
      tournamentGold: txnResPac.tournament_gold || 0,
      altarBonusGold: txnResPac.prosperity_bonus || 0,
      totalGoldPaid: txnResPac.paid || 0,
      metadata: {
        reasons,
        api_total: allTrades.length,
        api_ms: apiMs,
        close_pnl_positive_usd: closePnl,
      },
    };
    if (txnResPac.raced) {
      console.log(`[claim-gold pacifica] player=${req.player.name} -> RACED (parallel claim)`);
      recordClaimTelemetry({
        ...pacClaimTelemetryBase,
        result: 'raced',
        reason: 'Already claimed by parallel request',
        totalGoldPaid: 0,
      });
      return res.json({ gold: 0, reason: 'Already claimed by parallel request' });
    }
    console.log(`[claim-gold pacifica] player=${req.player.name} -> ${txnResPac.paid > 0 ? 'PAID' : 'ZERO'} gold=${txnResPac.paid} base_gold=${totalGold} nft_boosted_gold=${boostedTotalGold} new_volume=$${newVolume.toFixed(2)} unique_trades=${uniqueTradeCount} unique_opens=${uniqueOpenTradeCount} reasons="${reasons.join(' + ')}" maxId=${maxTradeId}`);
    recordClaimTelemetry({
      ...pacClaimTelemetryBase,
      result: txnResPac.paid > 0 ? 'paid' : 'zero_payout',
      reason: reasons.join(' + ') || 'No new rewards',
    });

    res.json({
      gold: Math.floor(txnResPac.paid),
      reason: reasons.join(' + ') || 'No new rewards',
      total_gold_earned: (reward.total_gold || 0) + txnResPac.paid,
      nft_boost: nftGoldBoostPayload(nftGoldBoost),
      tournament_gold: txnResPac.tournament_gold || 0,
      altar_prosperity_bonus_pct: txnResPac.prosperity_bonus_pct || 0,
      altar_prosperity_bonus: txnResPac.prosperity_bonus || 0,
    });
  } catch (e) {
    console.error(`[claim-gold pacifica] player=${req.player.name} ERROR:`, e.message, e.stack);
    recordClaimTelemetry({ result: 'error', reason: e.message, metadata: { phase: 'pacifica_claim' } });
    res.status(500).json({ error: 'Failed to claim rewards' });
  }
});

// Gold & trade history tables
try {
  db.db.exec(`
    CREATE TABLE IF NOT EXISTS gold_history (
      id         INTEGER PRIMARY KEY AUTOINCREMENT,
      player_id  TEXT NOT NULL,
      amount     INTEGER NOT NULL,
      reason     TEXT NOT NULL,
      created_at TEXT NOT NULL DEFAULT (datetime('now'))
    );
    CREATE TABLE IF NOT EXISTS player_trades (
      id           INTEGER PRIMARY KEY AUTOINCREMENT,
      player_id    TEXT NOT NULL,
      history_id   INTEGER UNIQUE,
      symbol       TEXT NOT NULL,
      price        TEXT NOT NULL,
      amount       TEXT NOT NULL,
      fee          TEXT,
      created_at   TEXT NOT NULL DEFAULT (datetime('now'))
    );
    CREATE INDEX IF NOT EXISTS idx_gold_history_player ON gold_history(player_id, created_at);
    CREATE INDEX IF NOT EXISTS idx_player_trades_player ON player_trades(player_id, created_at);
  `);
} catch { /* non-fatal on first boot */ }

// Get trading reward stats + gold history + trade history from Pacifica
router.get('/trading/stats', auth, async (req, res) => {
  const dex = VALID_DEXES.has(String(req.player.dex || '').toLowerCase())
    ? String(req.player.dex).toLowerCase()
    : 'pacifica';
  const reward = db.db.prepare('SELECT * FROM trading_rewards WHERE player_id = ? AND dex = ?').get(req.player.id, dex);
  const goldHistory = db.db.prepare('SELECT amount, reason, created_at FROM gold_history WHERE player_id = ? ORDER BY created_at DESC LIMIT 50').all(req.player.id);

  // Trade list source depends on DEX: Pacifica stores a synced copy in the
  // main DB's `player_trades`, Avantis lives in server-futures/futures.db
  // (trade_history). We normalise both into the same { symbol, price,
  // amount, fee, created_at } shape so ProfileModal renders uniformly.
  let trades = [];
  if (dex === 'avantis' || dex === 'decibel' || dex === 'gmx' || dex === 'monad' || dex === 'phoenix' || dex === 'hyperliquid' || dex === 'risex' || dex === 'nado' || dex === 'hibachi' || dex === 'hotstuff' || dex === 'grvt' || dex === 'katana' || dex === 'gmtrade') {
    const fdb = futuresDbReadonly();
    if (fdb) {
      try {
        const sourceClause = dex === 'decibel'
          ? "AND verified_source = 'decibel_fill'"
          : dex === 'monad'
            ? "AND verified_source IN ('perpl_api', 'perpl_ws')"
            : dex === 'hyperliquid'
              ? "AND verified_source = 'hyperliquid_api'"
            : dex === 'risex'
              ? "AND verified_source = 'risex_api'"
              : dex === 'nado'
                ? "AND verified_source = 'nado_api'"
              : dex === 'hibachi'
                ? "AND verified_source = 'hibachi_api'"
              : dex === 'hotstuff'
                ? "AND verified_source = 'hotstuff_api'"
              : dex === 'grvt'
                ? "AND verified_source = 'grvt_builder'"
              : dex === 'katana'
                ? "AND verified_source = 'katana_api'"
              : dex === 'gmtrade'
                ? "AND verified_source = 'gmtrade_tx'"
              : dex === 'phoenix'
                ? "AND verified_source IN ('worker', 'tx')"
            : "AND verified_source = 'worker'";
        const rows = fdb.prepare(`
          SELECT symbol, side, price, amount, notional_usd, order_type, status, created_at
          FROM trade_history
          WHERE player_id = ? AND dex = ? AND status = 'filled'
            ${sourceClause}
          ORDER BY id DESC
          LIMIT 50
        `).all(req.player.id, dex);
        trades = rows.map(r => ({
          symbol: r.symbol,
          side: r.side,
          // For Avantis the on-chain trade row has `amount` = collateral and
          // `notional_usd` = amount × leverage. ProfileModal shows "price *
          // amount" as the trade value so we surface notional_usd as the
          // "price" column and amount=1 to keep the product correct.
          price: String(r.notional_usd || 0),
          amount: '1',
          fee: 0,
          order_type: r.order_type,
          created_at: r.created_at,
        }));
      } catch (e) {
        console.warn(`[trading/stats] ${dex} futures.db read failed:`, e.message);
      }
    }
  } else {
    trades = db.db.prepare(
      'SELECT symbol, price, amount, fee, created_at FROM player_trades WHERE player_id = ? ORDER BY created_at DESC LIMIT 50'
    ).all(req.player.id);
  }

  res.json({
    ...(reward || { total_volume: 0, total_gold: 0 }),
    gold_history: goldHistory,
    trades,
    dex,
  });
});

// ==================== TASKS (QUESTS) ====================

const LIVE_TASK_PROGRESS_DEXES = new Set(['avantis', 'decibel', 'gmx', 'monad', 'phoenix', 'hyperliquid', 'risex', 'nado', 'hibachi', 'hotstuff', 'grvt', 'katana', 'gmtrade']);

async function maybeRefreshTaskProgress(player, task, playerTask) {
  if (!playerTask || playerTask.claimed_at) return playerTask;
  const dex = String(player?.dex || '').toLowerCase();
  if (!LIVE_TASK_PROGRESS_DEXES.has(dex)) return playerTask;
  try {
    const snap = tasks.parseParams(playerTask.snapshot);
    const result = await tasks.verifyTask(player, task, snap);
    const progress = result.target_value > 0
      ? Math.min(1, result.progress_value / result.target_value)
      : 0;
    tasks.upsertPlayerTask(player.id, task.id, {
      snapshot: snap,
      progress,
      progress_value: result.progress_value,
      target_value: result.target_value,
    });
    return {
      ...playerTask,
      progress,
      progress_value: result.progress_value,
      target_value: result.target_value,
    };
  } catch (e) {
    console.warn(`[tasks] live progress refresh failed player=${player?.name || player?.id} task=${task?.id}:`, e.message);
    return playerTask;
  }
}

// Rate-limit tasks endpoints per player (2s)
const taskRateLimit = new Map();
setInterval(() => {
  const cutoff = Date.now() - 60000;
  for (const [k, v] of taskRateLimit) if (v < cutoff) taskRateLimit.delete(k);
}, 600000);

// Per-player gate for task endpoints. Default 20ms (was 2000ms — bumped
// 100× more lenient per user request). The endpoints below pass shorter
// values (e.g. 500 → 5) which scale with the same factor automatically.
// SQLite-backed task progress is idempotent so spam is safe.
function rateGate(playerId, ms = 20) {
  const effective = Math.max(0, Math.floor(ms / 100));
  if (effective === 0) return true;
  const last = taskRateLimit.get(playerId);
  if (last && Date.now() - last < effective) return false;
  taskRateLimit.set(playerId, Date.now());
  return true;
}

// List active tasks + player progress.
// This is a read-only hydration endpoint hit by React effects and panel
// refreshes. It is idempotent, and the browser can legitimately issue two
// requests in the same tick during reconnect/dev StrictMode, so we do not
// rate-limit it. Claim/start endpoints below keep their write protections.
router.get('/tasks', auth, async (req, res) => {
  const list = tasks.getActiveTasks();
  const out = [];
  for (const t of list) {
    let pt = tasks.getPlayerTask(req.player.id, t.id);
    pt = await maybeRefreshTaskProgress(req.player, t, pt);
    out.push({
      id: t.id,
      type: t.type,
      title: t.title,
      description: t.description,
      params: tasks.parseParams(t.params),
      reward_gold: t.reward_gold,
      reward_wood: t.reward_wood,
      reward_ore: t.reward_ore,
      repeatable: !!t.repeatable,
      cooldown_hours: t.cooldown_hours,
      started: !!pt,
      progress_value: pt ? pt.progress_value : 0,
      target_value: pt ? pt.target_value : 0,
      claimed_at: pt ? pt.claimed_at : null,
    });
  }
  res.json(out);
});

// Start a task (captures baseline snapshot)
router.post('/tasks/:id/start', auth, async (req, res) => {
  const id = parseInt(req.params.id, 10);
  if (!Number.isFinite(id)) return res.status(400).json({ error: 'bad id' });
  const task = tasks.getTaskById(id);
  const recordTaskTelemetry = (resultName, extra = {}) => {
    db.recordTaskClaimEvent({
      playerId: req.player.id,
      taskId: id,
      taskType: task?.type || null,
      taskTitle: task?.title || null,
      result: resultName,
      rewardGold: extra.rewardGold ?? extra.reward_gold ?? task?.reward_gold ?? 0,
      rewardWood: extra.rewardWood ?? extra.reward_wood ?? task?.reward_wood ?? 0,
      rewardOre: extra.rewardOre ?? extra.reward_ore ?? task?.reward_ore ?? 0,
      repeatable: Boolean(task?.repeatable),
      cooldownHours: task?.cooldown_hours || 0,
      ...extra,
    });
  };
  if (!task || !task.active) {
    recordTaskTelemetry('not_active', { errorReason: 'Task not active' });
    return res.status(404).json({ error: 'Task not active' });
  }

  const existing = tasks.getPlayerTask(req.player.id, id);
  if (existing && !existing.claimed_at) {
    console.log(`[task ${id} start] player=${req.player.name} -> ALREADY_STARTED`);
    return res.json({ ok: true, already_started: true });
  }
  // Repeatable + claimed: check cooldown before allowing re-start
  if (existing && existing.claimed_at) {
    const check = tasks.canClaim(existing, task);
    if (!check.ok && check.reason && check.reason.startsWith('Cooldown')) {
      console.log(`[task ${id} start] player=${req.player.name} -> COOLDOWN ${check.reason}`);
      return res.status(429).json({ error: check.reason });
    }
  }

  const snap = await tasks.buildSnapshot(req.player, task);
  db.db.prepare(
    `INSERT OR REPLACE INTO player_tasks (player_id, task_id, snapshot, progress, progress_value, target_value, started_at, claimed_at)
     VALUES (?, ?, ?, 0, 0, 0, datetime('now'), NULL)`
  ).run(req.player.id, id, JSON.stringify(snap));
  console.log(`[task ${id} start] player=${req.player.name} (${req.player.dex}) -> STARTED ${task.title || task.type}`);
  res.json({ ok: true, started: true });
});

// Claim a task — verifies against Pacifica + battle_replays, pays out on success
router.post('/tasks/:id/claim', auth, async (req, res) => {
  if (!rateGate('claim:' + req.player.id, 3000)) {
    return res.status(429).json({ error: 'slow down' });
  }
  const id = parseInt(req.params.id, 10);
  if (!Number.isFinite(id)) return res.status(400).json({ error: 'bad id' });
  const task = tasks.getTaskById(id);
  if (!task || !task.active) return res.status(404).json({ error: 'Task not active' });

  let pt = tasks.getPlayerTask(req.player.id, id);
  if (!pt) {
    // auto-start — snapshot taken now, so there's nothing yet to claim
    const snap = await tasks.buildSnapshot(req.player, task);
    db.db.prepare(
      `INSERT INTO player_tasks (player_id, task_id, snapshot) VALUES (?, ?, ?)`
    ).run(req.player.id, id, JSON.stringify(snap));
    pt = tasks.getPlayerTask(req.player.id, id);
  }
  const claimCheck = tasks.canClaim(pt, task);
  if (!claimCheck.ok) {
    recordTaskTelemetry('blocked', { errorReason: claimCheck.reason });
    return res.status(400).json({ error: claimCheck.reason });
  }

  const snap = tasks.parseParams(pt.snapshot);
  const result = await tasks.verifyTask(req.player, task, snap);

  // Always update cached progress (progress update is an independent fact,
  // kept outside the payout txn so it lands even if the completion check
  // fails or the atomic claim loses a race).
  db.db.prepare(
    `UPDATE player_tasks SET progress_value = ?, target_value = ?, progress = ? WHERE player_id = ? AND task_id = ?`
  ).run(result.progress_value, result.target_value, result.target_value > 0 ? Math.min(1, result.progress_value / result.target_value) : 0, req.player.id, id);

  if (!result.completed) {
    console.log(`[task ${id} claim] player=${req.player.name} -> NOT_COMPLETED progress=${result.progress_value}/${result.target_value} breakdown=${JSON.stringify(result.breakdown||{})}`);
    recordTaskTelemetry('not_completed', {
      progressValue: result.progress_value,
      targetValue: result.target_value,
      metadata: { breakdown: result.breakdown || {} },
    });
    return res.json({ ok: false, completed: false, progress_value: result.progress_value, target_value: result.target_value, breakdown: result.breakdown });
  }
  const nextRepeatableSnapshot = task.repeatable ? await tasks.buildSnapshot(req.player, task) : null;

  // Atomic payout: re-check the snapshot inside the transaction so two
  // concurrent /tasks/:id/claim calls can't both pay the same completed
  // cycle. Repeatable zero-cooldown tasks auto-start the next cycle by
  // replacing the snapshot and clearing claimed_at, so claimed_at alone is
  // not a reliable race guard.
  const payout = db.db.transaction(() => {
    const latest = db.db.prepare('SELECT claimed_at, snapshot FROM player_tasks WHERE player_id = ? AND task_id = ?').get(req.player.id, id);
    if (!latest || String(latest.snapshot || '') !== String(pt.snapshot || '')) {
      return { raced: true };
    }
    // For one-shot tasks: if claimed_at already set by a racing request,
    // abort. For repeatable tasks: if claimed_at advanced since we started,
    // the cooldown check we did earlier is stale — abort and let user
    // re-submit rather than risk a duplicate payout within the cooldown.
    if (latest && latest.claimed_at && (!task.repeatable || latest.claimed_at !== pt.claimed_at)) {
      return { raced: true };
    }
    const reward = db.applyAltarProsperityResourceBonus(req.player.id, {
      gold: task.reward_gold || 0,
      wood: task.reward_wood || 0,
      ore: task.reward_ore || 0,
    });
    db.addResources(req.player.id, reward.gold, reward.wood, reward.ore, {
      sourceType: 'task_claim',
      relatedTaskId: id,
      metadata: {
        task_title: task.title,
        task_type: task.type,
        repeatable: Boolean(task.repeatable),
        cooldown_hours: Number(task.cooldown_hours) || 0,
        prosperity_bonus_pct: reward.prosperity_bonus_pct || 0,
      },
    });
    if (reward.gold > 0) {
      db.db.prepare('INSERT INTO gold_history (player_id, amount, reason) VALUES (?, ?, ?)')
        .run(req.player.id, reward.gold, `Quest: ${task.title}`);
    }
    if (task.repeatable) {
      const cooldownHours = Number(task.cooldown_hours) || 0;
      if (cooldownHours > 0) {
        db.db.prepare(`
          UPDATE player_tasks
          SET claimed_at = datetime('now'),
              snapshot = ?,
              progress = 0,
              progress_value = 0,
              target_value = ?
          WHERE player_id = ? AND task_id = ?
        `).run(JSON.stringify(nextRepeatableSnapshot || {}), result.target_value || 0, req.player.id, id);
      } else {
        db.db.prepare(`
          UPDATE player_tasks
          SET claimed_at = NULL,
              snapshot = ?,
              progress = 0,
              progress_value = 0,
              target_value = ?,
              started_at = datetime('now')
          WHERE player_id = ? AND task_id = ?
        `).run(JSON.stringify(nextRepeatableSnapshot || {}), result.target_value || 0, req.player.id, id);
      }
    } else {
      db.db.prepare(`UPDATE player_tasks SET claimed_at = datetime('now') WHERE player_id = ? AND task_id = ?`).run(req.player.id, id);
    }
    return { raced: false, reward };
  });
  const payoutRes = payout();
  if (payoutRes.raced) {
    console.log(`[task ${id} claim] player=${req.player.name} -> RACED (parallel claim)`);
    recordTaskTelemetry('raced', {
      progressValue: result.progress_value,
      targetValue: result.target_value,
      errorReason: 'Already claimed by parallel request',
    });
    return res.status(409).json({ error: 'Already claimed by parallel request' });
  }
  const paidReward = payoutRes.reward || { gold: task.reward_gold || 0, wood: task.reward_wood || 0, ore: task.reward_ore || 0 };
  console.log(`[task ${id} claim] player=${req.player.name} -> PAID gold=${paidReward.gold||0} wood=${paidReward.wood||0} ore=${paidReward.ore||0} prosperity=${paidReward.prosperity_bonus_pct||0}% (${task.title})`);
  recordTaskTelemetry('paid', {
    progressValue: result.progress_value,
    targetValue: result.target_value,
    rewardGold: paidReward.gold || 0,
    rewardWood: paidReward.wood || 0,
    rewardOre: paidReward.ore || 0,
    metadata: {
      auto_restarted: Boolean(task.repeatable && (Number(task.cooldown_hours) || 0) <= 0),
      reward_base: paidReward.base || { gold: task.reward_gold, wood: task.reward_wood, ore: task.reward_ore },
      altar_prosperity_bonus_pct: paidReward.prosperity_bonus_pct || 0,
      altar_prosperity_bonus: paidReward.bonus || { gold: 0, wood: 0, ore: 0 },
    },
  });

  try {
    logEconomy('Task claimed', { player: req.player.name, task: task.title, gold: paidReward.gold, wood: paidReward.wood, ore: paidReward.ore, altar_prosperity_bonus_pct: paidReward.prosperity_bonus_pct || 0 });
  } catch {}

  res.json({
    ok: true,
    completed: true,
    auto_restarted: Boolean(task.repeatable && (Number(task.cooldown_hours) || 0) <= 0),
    reward: { gold: paidReward.gold, wood: paidReward.wood, ore: paidReward.ore },
    reward_base: paidReward.base || { gold: task.reward_gold, wood: task.reward_wood, ore: task.reward_ore },
    altar_prosperity_bonus_pct: paidReward.prosperity_bonus_pct || 0,
    altar_prosperity_bonus: paidReward.bonus || { gold: 0, wood: 0, ore: 0 },
    progress_value: result.progress_value,
    target_value: result.target_value,
  });
});

// ==================== ELFA (SOCIAL INTEL) ====================

// Per-player rate limit for /elfa/explain — 10/min
const explainRate = new Map();
setInterval(() => {
  const cutoff = Date.now() - 120000;
  for (const [k, arr] of explainRate) {
    const kept = arr.filter(t => t >= cutoff);
    if (kept.length) explainRate.set(k, kept); else explainRate.delete(k);
  }
}, 300000);

function explainRateLimit(playerId) {
  // Bumped 10/min → 1000/min (100× more lenient) per user request. The
  // backing OpenAI / Elfa upstream still has its own quota — that's the
  // real cost gate, not this in-process counter.
  const now = Date.now();
  const arr = (explainRate.get(playerId) || []).filter(t => now - t < 60000);
  if (arr.length >= 1000) return false;
  arr.push(now);
  explainRate.set(playerId, arr);
  return true;
}

// Social signals for all known trending tokens — cached 1h server-side
router.get('/elfa/signals', auth, async (req, res) => {
  const r = await elfa.getAllSignals();
  res.json(r);
});

// Explain why a symbol is moving — cached 10 min, 10 req/min per player
router.get('/elfa/explain/:symbol', auth, async (req, res) => {
  const symbol = String(req.params.symbol || '').toUpperCase();
  if (!/^[A-Z0-9]{1,10}$/.test(symbol)) return res.status(400).json({ error: 'bad symbol' });
  if (!explainRateLimit(req.player.id)) {
    return res.status(429).json({ error: 'Too many requests — try again in a minute' });
  }
  const data = await elfa.getExplain(symbol, req.player.name);
  res.json(data);
});

// Structured trade idea (side/entry/tp/sl/confidence) — hacked on top of /chat
// with a JSON prompt. Cached 30 min. Same rate limit bucket as explain.
router.get('/elfa/trade-idea/:symbol', auth, async (req, res) => {
  const symbol = String(req.params.symbol || '').toUpperCase();
  if (!/^[A-Z0-9]{1,10}$/.test(symbol)) return res.status(400).json({ error: 'bad symbol' });
  if (!explainRateLimit(req.player.id)) {
    return res.status(429).json({ error: 'Too many requests — try again in a minute' });
  }
  const data = await elfa.getTradeIdea(symbol, req.player.name);
  res.json(data);
});

// Admin: per-symbol Elfa stats + error log
router.get('/admin/elfa/stats', adminAuth, (req, res) => {
  res.json({
    has_key: elfa.hasKey(),
    stats: elfa.getStats(),
    errors: elfa.getErrors(),
  });
});

// ==================== FULL STATE ====================

// Get full player state (resources + buildings + troops)
router.get('/state', auth, (req, res) => {
  const state = db.getFullPlayerState(req.player.id);
  if (!state) return res.status(404).json({ error: 'Player not found' });
  res.json(state);
});

// ==================== ADMIN ====================

const ADMIN_KEY = process.env.ADMIN_KEY;
function adminAuth(req, res, next) {
  if (!ADMIN_KEY || req.headers['x-admin-key'] !== ADMIN_KEY) {
    return res.status(403).json({ error: 'Forbidden' });
  }
  next();
}

function isAdminRequest(req) {
  return !!(ADMIN_KEY && req.headers['x-admin-key'] === ADMIN_KEY);
}

router.post('/admin/shop/solana/reconcile', adminAuth, async (req, res) => {
  try {
    const limit = Number(req.body?.limit || req.query?.limit || 100);
    const txSignature = String(req.body?.txSignature || req.body?.signature || req.query?.txSignature || req.query?.signature || '').trim();
    const result = await runSolanaShopReconcileSweep({ source: 'admin', limit, txSignature });
    res.json({ success: true, ...result });
  } catch (err) {
    res.status(err?.status || 500).json({ error: err?.message || 'Solana shop reconcile failed' });
  }
});

// List all players with full details (shields, wallet, last attack)
router.get('/admin/players', adminAuth, (req, res) => {
  const players = db.db.prepare(`
    SELECT id, name, trophies, level, gold, wood, ore, wallet, dex,
           futures_mode, tutorial_flags,
           shield_until, last_attacked_by, last_attacked_at, created_at,
           last_seen_at
    FROM players ORDER BY trophies DESC
  `).all();
  // Pull per-player trading rewards in one shot so the UI can show gold
  // earned from trading next to each row (no N+1 query).
  const rewardsMap = {};
  try {
    const rewards = db.db.prepare(`
      SELECT player_id,
             COALESCE(SUM(total_gold), 0) AS total_gold,
             COALESCE(SUM(total_volume), 0) AS total_volume,
             MAX(last_daily) AS last_daily
      FROM trading_rewards
      GROUP BY player_id
    `).all();
    for (const r of rewards) rewardsMap[r.player_id] = r;
  } catch { /* trading_rewards missing on fresh DB */ }
  res.json(players.map(p => {
    const tr = rewardsMap[p.id];
    // Online = heartbeat within the past 5 min. Same window as the
    // /admin/stats counter so the row badge agrees with the headline
    // number. SQLite returns last_seen_at as "YYYY-MM-DD HH:MM:SS" UTC
    // which `new Date(... + 'Z')` parses correctly cross-browser.
    const lastSeenMs = p.last_seen_at ? new Date(p.last_seen_at + 'Z').getTime() : 0;
    const ageMs = lastSeenMs ? (Date.now() - lastSeenMs) : Infinity;
    return {
      ...p,
      dex: p.dex || null,
      // futures_mode: 'pro' | 'basic' | null. NULL means user has not yet
      // made the first-time selection (haven't opened the futures panel
      // since the feature shipped).
      futures_mode: p.futures_mode || null,
      shield_active: p.shield_until && new Date(p.shield_until + 'Z') > new Date(),
      shield_remaining: p.shield_until ? Math.max(0, Math.round((new Date(p.shield_until + 'Z') - new Date()) / 60000)) : 0,
      buildings_count: db.db.prepare('SELECT COUNT(*) as c FROM buildings WHERE player_id = ?').get(p.id).c,
      trading_gold: tr?.total_gold || 0,
      trading_volume: tr?.total_volume || 0,
      trading_last_daily: tr?.last_daily || null,
      // Heartbeat-derived presence flags. Computed server-side so the
      // panel JS doesn't have to re-implement the same time math 5 places.
      online: ageMs <= 5 * 60 * 1000,
      active_24h: ageMs <= 24 * 60 * 60 * 1000,
      active_7d:  ageMs <= 7 * 24 * 60 * 60 * 1000,
      // Surface the raw last-seen so the panel can render "5 min ago"
      // tooltips. null when player has never been seen on the new column
      // (fresh accounts or accounts that haven't logged in since deploy).
      last_seen_age_sec: lastSeenMs ? Math.floor(ageMs / 1000) : null,
    };
  }));
});

// One-shot fix: seed a Town Hall for every player who is missing one.
// Without a town_hall row, findEnemyCandidates excludes the account from
// matchmaking, so a fresh registrant who never placed buildings becomes
// invisible as a target and the matchmaker keeps reporting "all bases
// shielded" even when there are unshielded accounts. Picks an unoccupied
// cell on grid 0 starting from the centre and spiralling outward; town_hall
// occupies a 4x4 footprint so we keep clearance from existing buildings.
router.post('/admin/seed-town-halls', adminAuth, (req, res) => {
  const TH_HP = 3500; // BUILDING_DEFS.town_hall.hp_levels[0]
  const TH_FOOTPRINT = 4;
  const GRID_SIZE = 27;
  const SEED_CENTER = 12;

  const missing = db.db.prepare(`
    SELECT p.id
    FROM players p
    WHERE NOT EXISTS (
      SELECT 1 FROM buildings b
      WHERE b.player_id = p.id AND b.type = 'town_hall'
    )
  `).all();

  const fetchOccupiedCells = db.db.prepare(`
    SELECT grid_x, grid_z FROM buildings WHERE player_id = ? AND grid_index = 0
  `);
  const insertBuilding = db.db.prepare(`
    INSERT INTO buildings (player_id, type, level, grid_x, grid_z, grid_index, hp, max_hp)
    VALUES (?, 'town_hall', 1, ?, ?, 0, ?, ?)
  `);

  // Spiral cell order from (SEED_CENTER, SEED_CENTER) outward — first free
  // 4x4 block wins. Footprint check is conservative: rejects the cell if
  // any 4x4 corner cell is taken or off-grid.
  function makeSpiral() {
    const order = [];
    const seen = new Set();
    for (let r = 0; r <= GRID_SIZE; r++) {
      for (let dx = -r; dx <= r; dx++) {
        for (let dz = -r; dz <= r; dz++) {
          if (Math.max(Math.abs(dx), Math.abs(dz)) !== r) continue;
          const x = SEED_CENTER + dx;
          const z = SEED_CENTER + dz;
          if (x < 0 || z < 0) continue;
          if (x + TH_FOOTPRINT > GRID_SIZE || z + TH_FOOTPRINT > GRID_SIZE) continue;
          const key = `${x},${z}`;
          if (seen.has(key)) continue;
          seen.add(key);
          order.push([x, z]);
        }
      }
    }
    return order;
  }
  const spiral = makeSpiral();

  function fits(playerCells, x, z) {
    for (let dx = 0; dx < TH_FOOTPRINT; dx++) {
      for (let dz = 0; dz < TH_FOOTPRINT; dz++) {
        if (playerCells.has(`${x + dx},${z + dz}`)) return false;
      }
    }
    return true;
  }

  const result = db.db.transaction(() => {
    let seeded = 0;
    let skipped = 0;
    for (const { id } of missing) {
      const occupied = new Set();
      for (const cell of fetchOccupiedCells.all(id)) {
        occupied.add(`${cell.grid_x},${cell.grid_z}`);
      }
      let placed = false;
      for (const [x, z] of spiral) {
        if (!fits(occupied, x, z)) continue;
        try {
          insertBuilding.run(id, x, z, TH_HP, TH_HP);
          seeded++;
          placed = true;
          break;
        } catch {
          // Tight UNIQUE constraint race or footprint clash with a building
          // we don't track in `occupied` (different grid_index) — fall
          // through and try the next cell.
        }
      }
      if (!placed) skipped++;
    }
    return { missing: missing.length, seeded, skipped };
  })();

  res.json(result);
});

// Shop stats — aggregated view over utility_purchases. Returns summary
// counters, per-SKU breakdown, top buyers, and the recent purchase tail.
// USD figures are derived from usd_price_e6 (microdollars × quantity);
// revenue_usd excludes project-token payments like SKR/CoP so the admin
// panel does not report token face value as cash revenue.
// quantity is encoded in `amount` only as a raw token-units string so we
// fall back to 1× when the SKU lookup fails (unknown SKU shipped before
// a migration). Wrapped in try/catch so a fresh DB without purchases
// returns empty buckets instead of a 500.
function normalizeShopRevenueToken(token) {
  return String(token || '').trim().toLowerCase();
}

function addShopRevenueToken(set, token) {
  const normalized = normalizeShopRevenueToken(token);
  if (normalized) set.add(normalized);
}

function shopRevenueTokenBuckets() {
  const stableTokens = new Set();
  const projectTokens = new Set();
  const nativeTokens = new Set(['apt', 'eth', 'mon', 'sol']);

  for (const chainKey of Object.keys(GAME_SHOP_EVM_CHAINS)) {
    addShopRevenueToken(stableTokens, evmPaymentSpec(chainKey, 'usdc')?.token);
  }

  const solana = gameShopSolanaConfig();
  addShopRevenueToken(stableTokens, solana.usdcMint);
  addShopRevenueToken(projectTokens, solana.skrMint);
  addShopRevenueToken(projectTokens, solana.clashMint);

  const aptos = gameShopAptosConfig();
  addShopRevenueToken(stableTokens, aptos.usdcAddress);

  const baseShop = gameShopConfig();
  addShopRevenueToken(projectTokens, baseShop.copToken);

  return { stableTokens, projectTokens, nativeTokens };
}

function classifyShopRevenueToken(chain, token) {
  const normalized = normalizeShopRevenueToken(token);
  if (!normalized) return 'other';

  const buckets = shopRevenueTokenBuckets();
  if (buckets.projectTokens.has(normalized)) return 'project_token';
  if (buckets.stableTokens.has(normalized)) return 'stable';
  if (buckets.nativeTokens.has(normalized)) return 'native';

  const chainKey = String(chain || '').toLowerCase();
  if (chainKey === 'solana' && normalized === normalizeShopRevenueToken(SOLANA_USDC_MINT_DEFAULT)) {
    return 'stable';
  }
  return 'other';
}

function emptyShopRevenueTotals() {
  return {
    gross_sales_usd: 0,
    revenue_usd: 0,
    stable_revenue_usd: 0,
    native_revenue_usd: 0,
    project_token_value_usd: 0,
    other_token_value_usd: 0,
  };
}

function addShopRevenueRow(totals, row) {
  const usd = (Number(row?.usd_e6_sum) || 0) / 1_000_000;
  const kind = classifyShopRevenueToken(row?.chain, row?.token);
  totals.gross_sales_usd += usd;
  if (kind === 'project_token') {
    totals.project_token_value_usd += usd;
  } else if (kind === 'stable') {
    totals.stable_revenue_usd += usd;
    totals.revenue_usd += usd;
  } else if (kind === 'native') {
    totals.native_revenue_usd += usd;
    totals.revenue_usd += usd;
  } else {
    totals.other_token_value_usd += usd;
  }
  return totals;
}

function getShopRevenueTotals(whereSql = '', params = []) {
  const rows = db.db.prepare(`
    SELECT chain, token,
           COUNT(*) AS purchases,
           COALESCE(SUM(CAST(usd_price_e6 AS INTEGER)), 0) AS usd_e6_sum
    FROM utility_purchases
    ${whereSql}
    GROUP BY chain, token
  `).all(...params);
  return rows.reduce(addShopRevenueRow, emptyShopRevenueTotals());
}

router.get('/admin/shop', adminAuth, (req, res) => {
  try {
    // Aggregate counts by SKU, joined with the live product table so the
    // panel can show a readable title even after a SKU is delisted.
    const bySku = db.db.prepare(`
      SELECT utility AS sku,
             COUNT(*) AS purchases,
             COUNT(DISTINCT player_id) AS unique_buyers,
             COALESCE(SUM(CAST(usd_price_e6 AS INTEGER)), 0) AS usd_e6_sum,
             MIN(created_at) AS first_at,
             MAX(created_at) AS last_at
      FROM utility_purchases
      GROUP BY utility
      ORDER BY purchases DESC
    `).all();
    const productsByid = Object.fromEntries(
      gameShopProductsForClient().map((p) => [p.sku, p]),
    );
    const bySkuEnriched = bySku.map((row) => {
      const product = productsByid[row.sku] || null;
      return {
        sku: row.sku,
        title: product?.title || row.sku,
        kind: product?.kind || null,
        purchases: row.purchases,
        unique_buyers: row.unique_buyers,
        revenue_usd: (Number(row.usd_e6_sum) || 0) / 1_000_000,
        first_at: row.first_at,
        last_at: row.last_at,
      };
    });
    const altarStats = bySkuEnriched.find((row) => row.sku === 'altar') || {
      purchases: 0,
      unique_buyers: 0,
      revenue_usd: 0,
      first_at: null,
      last_at: null,
    };

    // Per-player rollup. The buyer's display name comes from the players
    // table; players who deleted their account leave a NULL name and we
    // surface "(deleted)" so the row still renders rather than disappearing.
    const topBuyers = db.db.prepare(`
      SELECT u.player_id,
             COALESCE(p.name, '(deleted)') AS name,
             COALESCE(p.dex, '-') AS dex,
             COUNT(*) AS purchases,
             COALESCE(SUM(CAST(u.usd_price_e6 AS INTEGER)), 0) AS usd_e6_sum,
             MAX(u.created_at) AS last_at
      FROM utility_purchases u
      LEFT JOIN players p ON p.id = u.player_id
      GROUP BY u.player_id
      ORDER BY usd_e6_sum DESC, purchases DESC
      LIMIT 100
    `).all().map((r) => ({
      player_id: r.player_id,
      name: r.name,
      dex: r.dex,
      purchases: r.purchases,
      spent_usd: (Number(r.usd_e6_sum) || 0) / 1_000_000,
      last_at: r.last_at,
    }));

    // Recent purchase tail — newest 200. Includes tx_hash so the operator
    // can pop the on-chain receipt straight from the panel.
    const recent = db.db.prepare(`
      SELECT u.id, u.player_id,
             COALESCE(p.name, '(deleted)') AS name,
             u.utility AS sku,
             u.chain, u.tx_hash, u.payer, u.token,
             u.amount, u.usd_price_e6,
             u.duration_hours, u.shield_until, u.created_at
      FROM utility_purchases u
      LEFT JOIN players p ON p.id = u.player_id
      ORDER BY u.id DESC
      LIMIT 200
    `).all().map((r) => ({
      ...r,
      title: productsByid[r.sku]?.title || r.sku,
      price_usd: (Number(r.usd_price_e6) || 0) / 1_000_000,
    }));

    // Window counters — separate one-hour and 24-hour buckets so the panel
    // shows velocity at a glance without scrolling the recent list.
    const totals = db.db.prepare(`
      SELECT COUNT(*) AS purchases,
             COUNT(DISTINCT player_id) AS unique_buyers
      FROM utility_purchases
    `).get();
    const windowed = db.db.prepare(`
      SELECT
        COUNT(CASE WHEN created_at > datetime('now', '-1 hour')  THEN 1 END) AS h1,
        COUNT(CASE WHEN created_at > datetime('now', '-24 hours') THEN 1 END) AS h24,
        COUNT(CASE WHEN created_at > datetime('now', '-7 days')   THEN 1 END) AS d7
      FROM utility_purchases
    `).get();
    const revenueTotals = getShopRevenueTotals();
    const h24RevenueTotals = getShopRevenueTotals("WHERE created_at > datetime('now', '-24 hours')");

    res.json({
      summary: {
        total_purchases: totals.purchases || 0,
        unique_buyers: totals.unique_buyers || 0,
        total_revenue_usd: revenueTotals.revenue_usd,
        gross_sales_usd: revenueTotals.gross_sales_usd,
        stable_revenue_usd: revenueTotals.stable_revenue_usd,
        native_revenue_usd: revenueTotals.native_revenue_usd,
        project_token_value_usd: revenueTotals.project_token_value_usd,
        other_token_value_usd: revenueTotals.other_token_value_usd,
        last_1h_purchases: windowed.h1 || 0,
        last_24h_purchases: windowed.h24 || 0,
        last_7d_purchases: windowed.d7 || 0,
        last_24h_revenue_usd: h24RevenueTotals.revenue_usd,
        last_24h_gross_sales_usd: h24RevenueTotals.gross_sales_usd,
        last_24h_project_token_value_usd: h24RevenueTotals.project_token_value_usd,
        altar_purchases: altarStats.purchases || 0,
        altar_unique_buyers: altarStats.unique_buyers || 0,
        altar_revenue_usd: altarStats.revenue_usd || 0,
        altar_first_at: altarStats.first_at || null,
        altar_last_at: altarStats.last_at || null,
        revenue_breakdown: revenueTotals,
      },
      by_sku: bySkuEnriched,
      top_buyers: topBuyers,
      recent,
    });
  } catch (err) {
    res.status(500).json({ error: err?.message || 'shop stats failed' });
  }
});

router.get('/admin/ai-chat/billing', adminAuth, (req, res) => {
  try {
    const freeMessagesPerDay = getAiChatFreeMessagesPerDay();
    const today = aiChatDayKey();
    const usage = db.db.prepare(`
      SELECT
        COALESCE(SUM(total_used), 0) AS all_total,
        COALESCE(SUM(free_used), 0) AS all_free,
        COALESCE(SUM(subscription_used), 0) AS all_subscription,
        COALESCE(SUM(credit_used), 0) AS all_credit,
        COALESCE(SUM(CASE WHEN day = ? THEN total_used ELSE 0 END), 0) AS today_total,
        COALESCE(SUM(CASE WHEN day >= date('now', '-6 days') THEN total_used ELSE 0 END), 0) AS week_total
      FROM ai_message_daily_usage
    `).get(today) || {};
    const balances = db.db.prepare(`
      SELECT
        COALESCE(SUM(credits), 0) AS outstanding_credits,
        COALESCE(SUM(CASE WHEN credits > 0 THEN 1 ELSE 0 END), 0) AS players_with_credits
      FROM ai_message_credit_balances
    `).get() || {};
    const entitlements = db.db.prepare(`
      SELECT COUNT(*) AS lifetime_players
      FROM ai_message_entitlements
      WHERE lifetime_daily_limit > 0
    `).get() || {};
    const purchaseSkus = ['ai_messages_100', 'ai_lifetime_daily_100'];
    const placeholders = purchaseSkus.map(() => '?').join(',');
    const aiPurchaseWhere = "utility IN ('ai_messages_100', 'ai_lifetime_daily_100')";
    const purchases = db.db.prepare(`
      SELECT utility AS sku,
             COUNT(*) AS purchases,
             COUNT(DISTINCT player_id) AS unique_buyers,
             COALESCE(SUM(CAST(usd_price_e6 AS INTEGER)), 0) AS usd_e6_sum,
             MAX(created_at) AS last_at
      FROM utility_purchases
      WHERE utility IN (${placeholders})
      GROUP BY utility
      ORDER BY purchases DESC
    `).all(...purchaseSkus).map((row) => ({
      ...row,
      title: GAME_SHOP_PRODUCTS[row.sku]?.title || row.sku,
      revenue_usd: (Number(row.usd_e6_sum) || 0) / 1_000_000,
    }));
    const hermes = db.db.prepare(`
      SELECT
        COUNT(*) AS total,
        COALESCE(SUM(CASE WHEN status = 'error' THEN 1 ELSE 0 END), 0) AS errors,
        COALESCE(SUM(CASE WHEN created_at > datetime('now', '-24 hours') THEN 1 ELSE 0 END), 0) AS h24,
        COALESCE(SUM(CASE WHEN status = 'error' AND created_at > datetime('now', '-24 hours') THEN 1 ELSE 0 END), 0) AS h24_errors,
        ROUND(AVG(duration_ms), 0) AS avg_duration_ms
      FROM hermes_chat_events
    `).get() || {};
    const hermesModels = db.db.prepare(`
      SELECT COALESCE(model, 'unknown') AS model,
             COUNT(*) AS requests,
             COALESCE(SUM(CASE WHEN status = 'error' THEN 1 ELSE 0 END), 0) AS errors,
             ROUND(AVG(duration_ms), 0) AS avg_duration_ms,
             MAX(created_at) AS last_at
      FROM hermes_chat_events
      WHERE event_type = 'message'
      GROUP BY COALESCE(model, 'unknown')
      ORDER BY requests DESC
      LIMIT 12
    `).all();
    const hermesIntents = db.db.prepare(`
      SELECT COALESCE(intent, 'unknown') AS intent,
             COUNT(*) AS requests,
             COALESCE(SUM(CASE WHEN status = 'error' THEN 1 ELSE 0 END), 0) AS errors,
             ROUND(AVG(duration_ms), 0) AS avg_duration_ms
      FROM hermes_chat_events
      WHERE event_type = 'message'
      GROUP BY COALESCE(intent, 'unknown')
      ORDER BY requests DESC
      LIMIT 12
    `).all();
    const hermesRecent = db.db.prepare(`
      SELECT e.id, e.created_at, e.trace_id, e.event_type, e.intent, e.player_id,
             COALESCE(e.player_name, p.name) AS player_name,
             e.status, e.duration_ms, e.model, e.error,
             e.request_preview, e.response_preview, e.quota_json, e.attempts_json
      FROM hermes_chat_events e
      LEFT JOIN players p ON p.id = e.player_id
      ORDER BY e.id DESC
      LIMIT 60
    `).all().map((row) => ({
      ...row,
      quota: (() => { try { return row.quota_json ? JSON.parse(row.quota_json) : null; } catch { return null; } })(),
      attempts: (() => { try { return row.attempts_json ? JSON.parse(row.attempts_json) : null; } catch { return null; } })(),
      quota_json: undefined,
      attempts_json: undefined,
    }));
    const usageWindows = db.db.prepare(`
      SELECT
        COALESCE(SUM(CASE WHEN day = ? THEN total_used ELSE 0 END), 0) AS messages_today,
        COUNT(DISTINCT CASE WHEN day = ? AND total_used > 0 THEN player_id END) AS users_today,
        COALESCE(SUM(CASE WHEN day >= date('now', '-6 days') THEN total_used ELSE 0 END), 0) AS messages_7d,
        COUNT(DISTINCT CASE WHEN day >= date('now', '-6 days') AND total_used > 0 THEN player_id END) AS users_7d,
        COALESCE(SUM(total_used), 0) AS messages_all,
        COUNT(DISTINCT CASE WHEN total_used > 0 THEN player_id END) AS users_all
      FROM ai_message_daily_usage
    `).get(today, today) || {};
    const hermesWindows = db.db.prepare(`
      SELECT
        COUNT(*) AS events_all,
        COUNT(DISTINCT player_id) AS users_all,
        COALESCE(SUM(CASE WHEN status != 'ok' OR error IS NOT NULL THEN 1 ELSE 0 END), 0) AS errors_all,
        COALESCE(SUM(CASE WHEN created_at > datetime('now', '-24 hours') THEN 1 ELSE 0 END), 0) AS events_24h,
        COUNT(DISTINCT CASE WHEN created_at > datetime('now', '-24 hours') THEN player_id END) AS users_24h,
        COALESCE(SUM(CASE WHEN (status != 'ok' OR error IS NOT NULL) AND created_at > datetime('now', '-24 hours') THEN 1 ELSE 0 END), 0) AS errors_24h,
        COALESCE(SUM(CASE WHEN created_at > datetime('now', '-7 days') THEN 1 ELSE 0 END), 0) AS events_7d,
        COUNT(DISTINCT CASE WHEN created_at > datetime('now', '-7 days') THEN player_id END) AS users_7d,
        COALESCE(SUM(CASE WHEN (status != 'ok' OR error IS NOT NULL) AND created_at > datetime('now', '-7 days') THEN 1 ELSE 0 END), 0) AS errors_7d
      FROM hermes_chat_events
      WHERE event_type = 'message'
    `).get() || {};
    const users = db.db.prepare(`
      WITH actor_ids AS (
        SELECT player_id FROM ai_message_daily_usage
        UNION SELECT player_id FROM hermes_chat_events WHERE player_id IS NOT NULL
        UNION SELECT player_id FROM mcp_events WHERE player_id IS NOT NULL
        UNION SELECT player_id FROM utility_purchases WHERE ${aiPurchaseWhere}
        UNION SELECT player_id FROM ai_message_credit_balances WHERE credits > 0
        UNION SELECT player_id FROM ai_message_entitlements WHERE lifetime_daily_limit > 0
      ),
      usage_rollup AS (
        SELECT player_id,
               COALESCE(SUM(total_used), 0) AS total_used,
               COALESCE(SUM(free_used), 0) AS free_used,
               COALESCE(SUM(subscription_used), 0) AS subscription_used,
               COALESCE(SUM(credit_used), 0) AS credit_used,
               COALESCE(SUM(CASE WHEN day = ? THEN total_used ELSE 0 END), 0) AS today_used,
               COALESCE(SUM(CASE WHEN day >= date('now', '-6 days') THEN total_used ELSE 0 END), 0) AS week_used,
               MAX(day) AS last_usage_day
        FROM ai_message_daily_usage
        GROUP BY player_id
      ),
      hermes_rollup AS (
        SELECT player_id,
               COUNT(*) AS hermes_requests,
               COALESCE(SUM(CASE WHEN status != 'ok' OR error IS NOT NULL THEN 1 ELSE 0 END), 0) AS hermes_errors,
               COALESCE(SUM(CASE WHEN created_at > datetime('now', '-24 hours') THEN 1 ELSE 0 END), 0) AS hermes_h24,
               COALESCE(SUM(CASE WHEN (status != 'ok' OR error IS NOT NULL) AND created_at > datetime('now', '-24 hours') THEN 1 ELSE 0 END), 0) AS hermes_h24_errors,
               ROUND(COALESCE(AVG(duration_ms), 0), 0) AS hermes_avg_duration_ms,
               MAX(created_at) AS last_chat_at
        FROM hermes_chat_events
        WHERE event_type = 'message' AND player_id IS NOT NULL
        GROUP BY player_id
      ),
      mcp_rollup AS (
        SELECT player_id,
               COUNT(*) AS mcp_calls,
               COALESCE(SUM(CASE WHEN status != 'ok' THEN 1 ELSE 0 END), 0) AS mcp_errors,
               COALESCE(SUM(CASE WHEN tool = 'execute_ai_attack_plan' AND status = 'ok' THEN 1 ELSE 0 END), 0) AS mcp_ai_battles,
               MAX(created_at) AS last_mcp_at
        FROM mcp_events
        WHERE player_id IS NOT NULL
        GROUP BY player_id
      ),
      purchase_rollup AS (
        SELECT player_id,
               COUNT(*) AS ai_purchases,
               COALESCE(SUM(CAST(usd_price_e6 AS INTEGER)), 0) AS usd_e6_sum,
               MAX(created_at) AS last_purchase_at
        FROM utility_purchases
        WHERE ${aiPurchaseWhere}
        GROUP BY player_id
      )
      SELECT a.player_id,
             COALESCE(p.name, '(deleted)') AS name,
             COALESCE(p.dex, '-') AS dex,
             COALESCE(u.total_used, 0) AS total_used,
             COALESCE(u.free_used, 0) AS free_used,
             COALESCE(u.subscription_used, 0) AS subscription_used,
             COALESCE(u.credit_used, 0) AS credit_used,
             COALESCE(u.today_used, 0) AS today_used,
             COALESCE(u.week_used, 0) AS week_used,
             u.last_usage_day,
             COALESCE(h.hermes_requests, 0) AS hermes_requests,
             COALESCE(h.hermes_errors, 0) AS hermes_errors,
             COALESCE(h.hermes_h24, 0) AS hermes_h24,
             COALESCE(h.hermes_h24_errors, 0) AS hermes_h24_errors,
             COALESCE(h.hermes_avg_duration_ms, 0) AS hermes_avg_duration_ms,
             h.last_chat_at,
             COALESCE(m.mcp_calls, 0) AS mcp_calls,
             COALESCE(m.mcp_errors, 0) AS mcp_errors,
             COALESCE(m.mcp_ai_battles, 0) AS mcp_ai_battles,
             m.last_mcp_at,
             COALESCE(cb.credits, 0) AS credits,
             COALESCE(en.lifetime_daily_limit, 0) AS lifetime_daily_limit,
             COALESCE(pr.ai_purchases, 0) AS ai_purchases,
             (COALESCE(pr.usd_e6_sum, 0) / 1000000.0) AS spent_usd,
             pr.last_purchase_at
      FROM actor_ids a
      LEFT JOIN players p ON p.id = a.player_id
      LEFT JOIN usage_rollup u ON u.player_id = a.player_id
      LEFT JOIN hermes_rollup h ON h.player_id = a.player_id
      LEFT JOIN mcp_rollup m ON m.player_id = a.player_id
      LEFT JOIN ai_message_credit_balances cb ON cb.player_id = a.player_id
      LEFT JOIN ai_message_entitlements en ON en.player_id = a.player_id
      LEFT JOIN purchase_rollup pr ON pr.player_id = a.player_id
      ORDER BY COALESCE(u.total_used, 0) DESC,
               COALESCE(h.hermes_requests, 0) DESC,
               COALESCE(pr.usd_e6_sum, 0) DESC,
               h.last_chat_at DESC
      LIMIT 200
    `).all(today).map((row) => ({
      ...row,
      spent_usd: Number(row.spent_usd || 0),
    }));
    const paymentsByChain = db.db.prepare(`
      SELECT LOWER(COALESCE(NULLIF(chain, ''), 'unknown')) AS chain,
             COUNT(*) AS payments,
             COUNT(DISTINCT player_id) AS buyers,
             COALESCE(SUM(CAST(usd_price_e6 AS INTEGER)), 0) AS usd_e6_sum,
             COALESCE(SUM(CASE WHEN created_at > datetime('now', '-24 hours') THEN 1 ELSE 0 END), 0) AS h24,
             COALESCE(SUM(CASE WHEN created_at > datetime('now', '-7 days') THEN 1 ELSE 0 END), 0) AS d7,
             MAX(created_at) AS last_at
      FROM utility_purchases
      WHERE ${aiPurchaseWhere}
      GROUP BY LOWER(COALESCE(NULLIF(chain, ''), 'unknown'))
      ORDER BY usd_e6_sum DESC, payments DESC
    `).all().map((row) => ({
      ...row,
      revenue_usd: (Number(row.usd_e6_sum) || 0) / 1_000_000,
    }));
    const paymentsByToken = db.db.prepare(`
      SELECT LOWER(COALESCE(NULLIF(chain, ''), 'unknown')) AS chain,
             UPPER(COALESCE(NULLIF(token, ''), 'unknown')) AS token,
             COUNT(*) AS payments,
             COUNT(DISTINCT player_id) AS buyers,
             COALESCE(SUM(CAST(usd_price_e6 AS INTEGER)), 0) AS usd_e6_sum,
             MAX(created_at) AS last_at
      FROM utility_purchases
      WHERE ${aiPurchaseWhere}
      GROUP BY LOWER(COALESCE(NULLIF(chain, ''), 'unknown')),
               UPPER(COALESCE(NULLIF(token, ''), 'unknown'))
      ORDER BY usd_e6_sum DESC, payments DESC
    `).all().map((row) => ({
      ...row,
      revenue_usd: (Number(row.usd_e6_sum) || 0) / 1_000_000,
    }));
    const paymentsByProductChain = db.db.prepare(`
      SELECT utility AS sku,
             LOWER(COALESCE(NULLIF(chain, ''), 'unknown')) AS chain,
             UPPER(COALESCE(NULLIF(token, ''), 'unknown')) AS token,
             COUNT(*) AS payments,
             COUNT(DISTINCT player_id) AS buyers,
             COALESCE(SUM(CAST(usd_price_e6 AS INTEGER)), 0) AS usd_e6_sum,
             MAX(created_at) AS last_at
      FROM utility_purchases
      WHERE ${aiPurchaseWhere}
      GROUP BY utility,
               LOWER(COALESCE(NULLIF(chain, ''), 'unknown')),
               UPPER(COALESCE(NULLIF(token, ''), 'unknown'))
      ORDER BY usd_e6_sum DESC, payments DESC
    `).all().map((row) => ({
      ...row,
      title: GAME_SHOP_PRODUCTS[row.sku]?.title || row.sku,
      revenue_usd: (Number(row.usd_e6_sum) || 0) / 1_000_000,
    }));
    const paymentRecent = db.db.prepare(`
      SELECT u.id, u.player_id, COALESCE(p.name, '(deleted)') AS name,
             COALESCE(p.dex, '-') AS dex,
             u.utility AS sku, u.chain, u.token, u.tx_hash, u.payer, u.amount,
             u.usd_price_e6, u.created_at
      FROM utility_purchases u
      LEFT JOIN players p ON p.id = u.player_id
      WHERE ${aiPurchaseWhere}
      ORDER BY u.id DESC
      LIMIT 80
    `).all().map((row) => ({
      ...row,
      title: GAME_SHOP_PRODUCTS[row.sku]?.title || row.sku,
      price_usd: (Number(row.usd_price_e6) || 0) / 1_000_000,
    }));
    const revenueSummary = getShopRevenueTotals(`WHERE ${aiPurchaseWhere}`);
    const hermesErrorsRecent = db.db.prepare(`
      SELECT e.id, e.created_at, e.trace_id, e.event_type, e.intent, e.player_id,
             COALESCE(e.player_name, p.name) AS player_name,
             e.status, e.duration_ms, e.model, e.error,
             e.request_preview
      FROM hermes_chat_events e
      LEFT JOIN players p ON p.id = e.player_id
      WHERE e.status != 'ok' OR e.error IS NOT NULL
      ORDER BY e.id DESC
      LIMIT 80
    `).all();
    res.set('Cache-Control', 'no-store');
    res.json({
      settings: { free_messages_per_day: freeMessagesPerDay },
      usage: {
        today: Number(usage.today_total || 0),
        week: Number(usage.week_total || 0),
        all: Number(usage.all_total || 0),
        free: Number(usage.all_free || 0),
        subscription: Number(usage.all_subscription || 0),
        credits: Number(usage.all_credit || 0),
      },
      balances: {
        outstanding_credits: Number(balances.outstanding_credits || 0),
        players_with_credits: Number(balances.players_with_credits || 0),
        lifetime_players: Number(entitlements.lifetime_players || 0),
      },
      usage_windows: {
        messages_today: Number(usageWindows.messages_today || 0),
        users_today: Number(usageWindows.users_today || 0),
        messages_7d: Number(usageWindows.messages_7d || 0),
        users_7d: Number(usageWindows.users_7d || 0),
        messages_all: Number(usageWindows.messages_all || 0),
        users_all: Number(usageWindows.users_all || 0),
        hermes_events_24h: Number(hermesWindows.events_24h || 0),
        hermes_users_24h: Number(hermesWindows.users_24h || 0),
        hermes_errors_24h: Number(hermesWindows.errors_24h || 0),
        hermes_events_7d: Number(hermesWindows.events_7d || 0),
        hermes_users_7d: Number(hermesWindows.users_7d || 0),
        hermes_errors_7d: Number(hermesWindows.errors_7d || 0),
        hermes_events_all: Number(hermesWindows.events_all || 0),
        hermes_users_all: Number(hermesWindows.users_all || 0),
        hermes_errors_all: Number(hermesWindows.errors_all || 0),
      },
      purchases,
      users,
      revenue_summary: revenueSummary,
      payments_by_chain: paymentsByChain,
      payments_by_token: paymentsByToken,
      payments_by_product_chain: paymentsByProductChain,
      payment_recent: paymentRecent,
      hermes: {
        total: Number(hermes.total || 0),
        errors: Number(hermes.errors || 0),
        h24: Number(hermes.h24 || 0),
        h24_errors: Number(hermes.h24_errors || 0),
        avg_duration_ms: Number(hermes.avg_duration_ms || 0),
      },
      hermes_models: hermesModels,
      hermes_intents: hermesIntents,
      hermes_errors_recent: hermesErrorsRecent,
      hermes_recent: hermesRecent,
    });
  } catch (err) {
    res.status(500).json({ error: err?.message || 'ai chat billing failed' });
  }
});

router.post('/admin/ai-chat/settings', adminAuth, (req, res) => {
  try {
    const raw = Number(req.body?.free_messages_per_day);
    if (!Number.isFinite(raw) || raw < 0 || raw > 1000) {
      return res.status(400).json({ error: 'free_messages_per_day must be 0..1000' });
    }
    const value = Math.floor(raw);
    writeAppSettingJson(AI_CHAT_FREE_MESSAGES_SETTING_KEY, { free_messages_per_day: value });
    res.json({ ok: true, settings: { free_messages_per_day: getAiChatFreeMessagesPerDay() } });
  } catch (err) {
    res.status(500).json({ error: err?.message || 'settings update failed' });
  }
});

// Global NFT supply admin endpoint. Live RPC reads of per-chain
// minted-count + the global cap. Returns null for any chain whose
// contract isn't deployed yet or whose RPC is unreachable; the cap
// gating still works (we treat null as 0 in the total). Useful for
// pre-mint reconciliation + admin dashboard.
router.get('/admin/nft-supply', adminAuth, async (req, res) => {
  try {
    // Force-refresh ignores the in-memory 10s cache the quote endpoints
    // hit — admins want the on-chain truth, not stale data.
    const supply = await readGlobalNftSupply({ force: true });
    res.set('Cache-Control', 'no-store');
    res.json({
      cap: NFT_GLOBAL_SUPPLY_CAP,
      total: supply.total,
      remaining: Math.max(0, NFT_GLOBAL_SUPPLY_CAP - supply.total),
      perChain: supply.perChain,
      fetched_at: new Date(supply.fetchedAt).toISOString(),
      synced_at: nftSupplyIso(supply.syncedAt),
      source: supply.source,
      live_chains: supply.liveChains || [],
      fallback_chains: supply.fallbackChains || [],
      source_by_chain: supply.sourceByChain || {},
    });
  } catch (err) {
    res.status(500).json({ error: err?.message || 'nft supply read failed' });
  }
});

router.get('/admin/nft-analytics', adminAuth, async (req, res) => {
  try {
    const supply = await readGlobalNftSupply({ force: true });
    const chainOrder = ['base', 'arbitrum', 'monad', 'ink', 'aptos', 'solana'];
    const perChainSupply = chainOrder.map((chain) => ({
      chain,
      count: Number(supply.perChain?.[chain]) || 0,
      live: supply.perChainRaw?.[chain] != null,
      raw: supply.perChainRaw?.[chain] ?? null,
      source: supply.sourceByChain?.[chain] || null,
      synced_at: nftSupplyIso(supply.chainSyncedAt?.[chain]),
    }));

    const bridgeSummary = db.db.prepare(`
      SELECT COUNT(*) AS total,
             COALESCE(SUM(CASE WHEN created_at >= date('now') THEN 1 ELSE 0 END), 0) AS today,
             COALESCE(SUM(CASE WHEN created_at > datetime('now', '-24 hours') THEN 1 ELSE 0 END), 0) AS h24,
             COALESCE(SUM(CASE WHEN dest_tx_or_asset IS NULL THEN 1 ELSE 0 END), 0) AS pending,
             MAX(created_at) AS latest_at
      FROM used_bridge_refs
    `).get() || {};

    const bridgeRoutes = db.db.prepare(`
      SELECT source_chain,
             dest_chain,
             COUNT(*) AS total,
             COALESCE(SUM(CASE WHEN created_at >= date('now') THEN 1 ELSE 0 END), 0) AS today,
             COALESCE(SUM(CASE WHEN dest_tx_or_asset IS NULL THEN 1 ELSE 0 END), 0) AS pending,
             MAX(created_at) AS latest_at
      FROM used_bridge_refs
      GROUP BY source_chain, dest_chain
      ORDER BY total DESC, latest_at DESC
    `).all();

    const bridgeBySource = db.db.prepare(`
      SELECT source_chain AS chain,
             COUNT(*) AS total,
             COALESCE(SUM(CASE WHEN created_at >= date('now') THEN 1 ELSE 0 END), 0) AS today,
             COALESCE(SUM(CASE WHEN dest_tx_or_asset IS NULL THEN 1 ELSE 0 END), 0) AS pending,
             MAX(created_at) AS latest_at
      FROM used_bridge_refs
      GROUP BY source_chain
      ORDER BY total DESC
    `).all();

    const bridgeByDest = db.db.prepare(`
      SELECT dest_chain AS chain,
             COUNT(*) AS total,
             COALESCE(SUM(CASE WHEN created_at >= date('now') THEN 1 ELSE 0 END), 0) AS today,
             COALESCE(SUM(CASE WHEN dest_tx_or_asset IS NULL THEN 1 ELSE 0 END), 0) AS pending,
             MAX(created_at) AS latest_at
      FROM used_bridge_refs
      GROUP BY dest_chain
      ORDER BY total DESC
    `).all();

    const recentBridges = db.db.prepare(`
      SELECT source_ref, dest_chain, source_chain, burn_tx_hash, dest_address,
             dest_tx_or_asset, level, created_at
      FROM used_bridge_refs
      ORDER BY created_at DESC
      LIMIT 200
    `).all();

    const logSummary = db.db.prepare(`
      SELECT COUNT(*) AS total,
             COALESCE(SUM(CASE WHEN created_at >= date('now') THEN 1 ELSE 0 END), 0) AS today,
             COALESCE(SUM(CASE WHEN created_at > datetime('now', '-24 hours') THEN 1 ELSE 0 END), 0) AS h24,
             COALESCE(SUM(CASE WHEN status = 'error' THEN 1 ELSE 0 END), 0) AS errors_total,
             COALESCE(SUM(CASE WHEN status = 'error' AND created_at > datetime('now', '-24 hours') THEN 1 ELSE 0 END), 0) AS errors_24h,
             MAX(created_at) AS latest_at
      FROM bridge_logs
    `).get() || {};

    const logsByPhase = db.db.prepare(`
      SELECT phase, status, COUNT(*) AS count, MAX(created_at) AS latest_at
      FROM bridge_logs
      GROUP BY phase, status
      ORDER BY latest_at DESC
    `).all();

    const recentLogs = db.db.prepare(`
      SELECT id, request_id, phase, status, source_chain, dest_chain, source_ref,
             burn_tx_hash, dest_address, dest_tx_or_asset, level, error, data, ip, created_at
      FROM bridge_logs
      ORDER BY id DESC
      LIMIT 200
    `).all();

    const paymentByToken = db.db.prepare(`
      SELECT chain,
             COALESCE(NULLIF(token, ''), 'native') AS token,
             COUNT(*) AS payments,
             COUNT(DISTINCT player_id) AS unique_buyers,
             COALESCE(SUM(CAST(usd_price_e6 AS INTEGER)), 0) AS usd_e6_sum,
             COALESCE(SUM(CASE WHEN created_at >= date('now') THEN 1 ELSE 0 END), 0) AS today,
             MAX(created_at) AS latest_at
      FROM utility_purchases
      GROUP BY chain, COALESCE(NULLIF(token, ''), 'native')
      ORDER BY payments DESC, latest_at DESC
    `).all().map((row) => ({
      ...row,
      revenue_usd: (Number(row.usd_e6_sum) || 0) / 1_000_000,
    }));

    const paymentByChain = db.db.prepare(`
      SELECT chain,
             COUNT(*) AS payments,
             COUNT(DISTINCT player_id) AS unique_buyers,
             COALESCE(SUM(CAST(usd_price_e6 AS INTEGER)), 0) AS usd_e6_sum,
             COALESCE(SUM(CASE WHEN created_at >= date('now') THEN 1 ELSE 0 END), 0) AS today,
             MAX(created_at) AS latest_at
      FROM utility_purchases
      GROUP BY chain
      ORDER BY payments DESC
    `).all().map((row) => ({
      ...row,
      revenue_usd: (Number(row.usd_e6_sum) || 0) / 1_000_000,
    }));

    const marketplacePaymentByToken = db.db.prepare(`
      SELECT chain,
             COALESCE(NULLIF(payment_token, ''), 'native') AS token,
             COUNT(*) AS sales,
             MAX(indexed_at) AS latest_at
      FROM marketplace_listings
      WHERE sold_tx IS NOT NULL
      GROUP BY chain, COALESCE(NULLIF(payment_token, ''), 'native')
      ORDER BY sales DESC, latest_at DESC
    `).all();

    res.set('Cache-Control', 'no-store');
    res.json({
      fetched_at: new Date().toISOString(),
      supply: {
        cap: NFT_GLOBAL_SUPPLY_CAP,
        total: supply.total,
        remaining: Math.max(0, NFT_GLOBAL_SUPPLY_CAP - supply.total),
        per_chain: perChainSupply,
        source: supply.source,
        synced_at: nftSupplyIso(supply.syncedAt),
        live_chains: supply.liveChains || [],
        fallback_chains: supply.fallbackChains || [],
      },
      bridges: {
        summary: {
          total: bridgeSummary.total || 0,
          today: bridgeSummary.today || 0,
          h24: bridgeSummary.h24 || 0,
          pending: bridgeSummary.pending || 0,
          latest_at: bridgeSummary.latest_at || null,
        },
        by_route: bridgeRoutes,
        by_source: bridgeBySource,
        by_destination: bridgeByDest,
        recent: recentBridges,
      },
      bridge_logs: {
        summary: {
          total: logSummary.total || 0,
          today: logSummary.today || 0,
          h24: logSummary.h24 || 0,
          errors_total: logSummary.errors_total || 0,
          errors_24h: logSummary.errors_24h || 0,
          latest_at: logSummary.latest_at || null,
        },
        by_phase: logsByPhase,
        recent: recentLogs,
      },
      payments: {
        utility_by_token: paymentByToken,
        utility_by_chain: paymentByChain,
        marketplace_by_token: marketplacePaymentByToken,
      },
    });
  } catch (err) {
    res.status(500).json({ error: err?.message || 'nft analytics failed' });
  }
});

// All battle replays with full details
router.get('/admin/replays', adminAuth, (req, res) => {
  const rows = db.db.prepare(`
    SELECT r.id, r.attacker_id, r.defender_id,
           r.claimed_result, r.verified_result, r.verification_reason,
           r.loot_gold, r.loot_wood, r.loot_ore,
           r.sim_th_hp_pct, r.sim_buildings_destroyed, r.duration_sec,
           r.created_at,
           pa.name AS attacker_name, pd.name AS defender_name
    FROM battle_replays r
    LEFT JOIN players pa ON pa.id = r.attacker_id
    LEFT JOIN players pd ON pd.id = r.defender_id
    ORDER BY r.created_at DESC
    LIMIT 200
  `).all();
  res.json(rows);
});

// Get full details of one replay including actions and verification data
router.get('/admin/replays/:id', adminAuth, (req, res) => {
  const row = db.db.prepare(`
    SELECT r.*, pa.name AS attacker_name, pd.name AS defender_name
    FROM battle_replays r
    LEFT JOIN players pa ON pa.id = r.attacker_id
    LEFT JOIN players pd ON pd.id = r.defender_id
    WHERE r.id = ?
  `).get(parseInt(req.params.id, 10));
  if (!row) return res.status(404).json({ error: 'Replay not found' });
  try { row.replay_data = row.replay_data ? JSON.parse(row.replay_data) : null; } catch {}
  try { row.buildings_snapshot = row.buildings_snapshot ? JSON.parse(row.buildings_snapshot) : null; } catch {}
  try { row.sim_debug = row.sim_debug ? JSON.parse(row.sim_debug) : null; } catch {}
  try { row.verification_data = row.verification_data ? JSON.parse(row.verification_data) : null; } catch {}
  res.json(row);
});

// Delete a player by name
// Diagnose wallet → accounts. Returns every row sharing the given wallet
// (legacy duplicates — DB lacks a UNIQUE constraint on wallet).
router.get('/admin/wallets/:wallet/accounts', adminAuth, (req, res) => {
  const rows = db.db.prepare(
    'SELECT id, name, trophies, wallet, created_at FROM players WHERE wallet = ? ORDER BY COALESCE(trophies, 0) DESC, id DESC'
  ).all(req.params.wallet);
  res.json({ wallet: req.params.wallet, count: rows.length, accounts: rows });
});

// Per-player trading debug: dumps trading_rewards (per dex), gold_history,
// and player_trades. Used to diagnose "task progress = 0" / "gold not
// crediting" reports without shelling into prod. Read-only.
router.get('/admin/players/:id/trading-debug', adminAuth, (req, res) => {
  const playerId = req.params.id;
  const player = db.db.prepare(
    'SELECT id, name, wallet, dex, futures_mode, created_at, last_seen_at FROM players WHERE id = ? OR name = ? LIMIT 1'
  ).get(playerId, playerId);
  if (!player) return res.status(404).json({ error: 'Player not found' });
  let rewards = [];
  try {
    rewards = db.db.prepare(
      'SELECT * FROM trading_rewards WHERE player_id = ? ORDER BY dex'
    ).all(player.id);
  } catch {}
  let goldHistory = [];
  try {
    goldHistory = db.db.prepare(
      'SELECT amount, reason, created_at FROM gold_history WHERE player_id = ? ORDER BY created_at DESC LIMIT 200'
    ).all(player.id);
  } catch {}
  let trades = [];
  try {
    trades = db.db.prepare(
      'SELECT history_id, symbol, price, amount, fee, created_at FROM player_trades WHERE player_id = ? ORDER BY created_at DESC LIMIT 200'
    ).all(player.id);
  } catch {}
  // For self-custody DEXes (Avantis/Decibel/GMX) trades live in
  // futures.db, not the main player_trades table. Read them too so the
  // admin can diagnose "why is my Decibel gold not crediting" without
  // SSHing into the server.
  let futuresTrades = [];
  try {
    const fdb = futuresDbReadonly();
    if (fdb && (player.dex === 'avantis' || player.dex === 'decibel' || player.dex === 'gmx' || player.dex === 'monad' || player.dex === 'phoenix' || player.dex === 'hyperliquid' || player.dex === 'risex' || player.dex === 'nado' || player.dex === 'hibachi' || player.dex === 'hotstuff' || player.dex === 'grvt' || player.dex === 'katana' || player.dex === 'gmtrade')) {
      futuresTrades = fdb.prepare(
        `SELECT id, symbol, side, amount, price, notional_usd, pnl, status, verified_source, dex, created_at
         FROM trade_history WHERE player_id = ? AND dex = ?
         ORDER BY id DESC LIMIT 200`
      ).all(player.id, player.dex);
    }
  } catch (e) {
    console.warn(`[admin/trading-debug] futures.db read failed:`, e.message);
  }
  res.json({
    player,
    rewards,
    rewards_summary: {
      total_volume: rewards.reduce((s, r) => s + Number(r.total_volume || 0), 0),
      total_gold: rewards.reduce((s, r) => s + Number(r.total_gold || 0), 0),
      gold_history_count: goldHistory.length,
      gold_history_sum: goldHistory.reduce((s, r) => s + Number(r.amount || 0), 0),
      cached_trades_count: trades.length,
      futures_trades_count: futuresTrades.length,
    },
    gold_history: goldHistory,
    cached_trades: trades,
    futures_trades: futuresTrades,
  });
});

router.delete('/admin/players/:name', adminAuth, (req, res) => {
  try {
    const player = db.db.prepare('SELECT id FROM players WHERE name = ?').get(req.params.name);
    if (!player) return res.status(404).json({ error: 'Player not found' });
    db.db.prepare('DELETE FROM buildings WHERE player_id = ?').run(player.id);
    db.db.prepare('DELETE FROM troop_levels WHERE player_id = ?').run(player.id);
    try { db.db.prepare('DELETE FROM trading_rewards WHERE player_id = ?').run(player.id); } catch {}
    try { db.db.prepare('DELETE FROM gold_history WHERE player_id = ?').run(player.id); } catch {}
    try { db.db.prepare('DELETE FROM player_trades WHERE player_id = ?').run(player.id); } catch {}
    try { db.db.prepare('DELETE FROM battle_replays WHERE attacker_id = ? OR defender_id = ?').run(player.id, player.id); } catch {}
    db.db.prepare('DELETE FROM players WHERE id = ?').run(player.id);
    res.json({ deleted: req.params.name });
  } catch (e) {
    res.status(500).json({ error: e.message });
  }
});

// Reset a player (keep account, clear buildings & reset resources).
// Also wipes trading state — cursor + first-bonus flags + tournament
// participation rows + cached trades — so the player starts cleanly.
// Without this clear the cursor stays at MAX(history_id) at reset
// time, so the very next trade would fail to register (its history_id
// is OLDER than the cursor) and one-time bonuses (first_deposit,
// first_trade) couldn't be re-earned.
router.post('/admin/players/:name/reset', adminAuth, (req, res) => {
  const player = db.db.prepare('SELECT id FROM players WHERE name = ?').get(req.params.name);
  if (!player) return res.status(404).json({ error: 'Player not found' });
  db.db.prepare('DELETE FROM buildings WHERE player_id = ?').run(player.id);
  db.db.prepare('UPDATE players SET gold = 4000, wood = 4000, ore = 4000, trophies = 0 WHERE id = ?').run(player.id);
  db.db.prepare('UPDATE troop_levels SET level = 1 WHERE player_id = ?').run(player.id);
  try { db.db.prepare('DELETE FROM trading_rewards WHERE player_id = ?').run(player.id); } catch {}
  try { db.db.prepare('DELETE FROM player_trades WHERE player_id = ?').run(player.id); } catch {}
  try { db.db.prepare('DELETE FROM player_tasks WHERE player_id = ?').run(player.id); } catch {}
  try { db.db.prepare('DELETE FROM tournament_participants WHERE player_id = ?').run(player.id); } catch {}
  try { db.db.prepare('DELETE FROM pacifica_agents WHERE player_id = ?').run(player.id); } catch {}
  res.json({ reset: req.params.name });
});

// Reset trophies for one player
router.post('/admin/players/:name/reset-trophies', adminAuth, (req, res) => {
  const player = db.db.prepare('SELECT id FROM players WHERE name = ?').get(req.params.name);
  if (!player) return res.status(404).json({ error: 'Player not found' });
  db.db.prepare('UPDATE players SET trophies = 0 WHERE id = ?').run(player.id);
  res.json({ reset_trophies: req.params.name });
});

// Adjust or set main account trophies for one player.
router.post('/admin/players/:name/trophies', adminAuth, (req, res) => {
  const player = db.db.prepare('SELECT id, name, trophies FROM players WHERE name = ?').get(req.params.name);
  if (!player) return res.status(404).json({ error: 'Player not found' });
  const hasSet = req.body && Object.prototype.hasOwnProperty.call(req.body, 'set');
  const raw = hasSet ? req.body.set : (req.body?.delta ?? req.body?.trophies ?? req.body?.amount);
  const value = Math.trunc(Number(raw));
  if (!Number.isFinite(value)) return res.status(400).json({ error: 'numeric trophies value required' });
  if (!hasSet && value === 0) return res.status(400).json({ error: 'non-zero trophies delta required' });
  if (Math.abs(value) > 1000000) return res.status(400).json({ error: 'trophies value too large' });
  const before = Number(player.trophies || 0);
  const after = Math.max(0, hasSet ? value : before + value);
  db.db.prepare('UPDATE players SET trophies = ? WHERE id = ?').run(after, player.id);
  res.json({
    ok: true,
    player_id: player.id,
    name: player.name,
    before,
    delta: after - before,
    trophies: after,
  });
});

// Reset trophies for ALL players
router.post('/admin/reset-all-trophies', adminAuth, (req, res) => {
  const result = db.db.prepare('UPDATE players SET trophies = 0').run();
  res.json({ reset: result.changes });
});

// Add resources to ALL players
router.post('/admin/add-resources-all', adminAuth, (req, res) => {
  const { gold = 0, wood = 0, ore = 0 } = req.body;
  if (typeof gold !== 'number' || typeof wood !== 'number' || typeof ore !== 'number') {
    return res.status(400).json({ error: 'gold, wood, ore must be numbers' });
  }
  const players = db.db.prepare('SELECT id FROM players').all();
  let updated = 0;
  for (const p of players) {
    db.addResources(p.id, gold, wood, ore, {
      sourceType: 'admin_resource_add_all',
      metadata: { route: '/admin/add-resources-all' },
    });
    updated++;
  }
  res.json({ success: true, players_updated: updated, added: { gold, wood, ore } });
});

// Add resources to a specific player by name
router.post('/admin/players/:name/add-resources', adminAuth, (req, res) => {
  const player = db.db.prepare('SELECT id FROM players WHERE name = ?').get(req.params.name);
  if (!player) return res.status(404).json({ error: 'Player not found' });
  const { gold = 0, wood = 0, ore = 0 } = req.body;
  if (typeof gold !== 'number' || typeof wood !== 'number' || typeof ore !== 'number') {
    return res.status(400).json({ error: 'gold, wood, ore must be numbers' });
  }
  db.addResources(player.id, gold, wood, ore, {
    sourceType: 'admin_player_resource_add',
    metadata: { route: '/admin/players/:name/add-resources', player_name: req.params.name },
  });
  res.json({ success: true, resources: db.getResources(player.id) });
});

function adminParseGridIndex(value, fallback = 0) {
  const parsed = Number(value);
  return Number.isInteger(parsed) && parsed >= 0 ? parsed : fallback;
}

function adminFindBuildingSlot(playerId, type, requestedGridIndex = null) {
  const preferred = requestedGridIndex == null
    ? (type === 'port' ? [1, 0, 2] : [0, 1, 2])
    : [requestedGridIndex];
  for (const gridIndex of preferred) {
    const slot = db.findOpenBuildingSlots(playerId, type, gridIndex, 1)[0];
    if (slot) return slot;
  }
  return null;
}

function adminGrantUtilityPurchase(playerId, utility) {
  if (!utility) return false;
  if (db.hasUtilityPurchase(playerId, utility)) return false;
  const txHash = `local-admin-grant-${playerId}-${utility}-${Date.now()}`;
  db.db.prepare(`
    INSERT INTO utility_purchases
      (player_id, utility, chain, tx_hash, payer, token, recipient, amount, usd_price_e6)
    VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)
  `).run(playerId, utility, 'local_admin', txHash, 'local-admin', 'LOCAL', 'local-admin', '0', '0');
  return true;
}

const ADMIN_MAX_VILLAGE_BUILD_ORDER = [
  'town_hall',
  'mine',
  'sawmill',
  'barn',
  'storage',
  'tombstone',
  'altar',
  'archer_tower',
  'turret',
  'mage_tower',
  'port',
];

const ADMIN_TH_MAX_COUNT = {
  mine: [1, 2, 3, 3],
  sawmill: [1, 2, 3, 3],
  barn: [1, 1, 1, 1],
  port: [1, 2, 5, 5],
  archer_tower: [1, 2, 3, 3],
  tombstone: [0, 1, 3, 3],
  altar: [1, 1, 1, 1],
  turret: [0, 0, 3, 3],
  storage: [0, 1, 2, 3],
  mage_tower: [0, 0, 0, 2],
  town_hall: [1, 1, 1, 1],
};

function adminMaxBuildingCountForTh(type, townHallLevel) {
  const limits = ADMIN_TH_MAX_COUNT[type] || [];
  const idx = Math.max(0, Math.min(limits.length - 1, townHallLevel - 1));
  return Number(limits[idx]) || 0;
}

function adminBuildingTargetLevelForTh(type, def, townHallLevel) {
  const maxLevel = adminBuildingMaxLevel(type, def);
  if (type === 'town_hall') return Math.max(1, Math.min(maxLevel, townHallLevel));
  return Math.max(1, Math.min(maxLevel, townHallLevel));
}

function adminBuildingMaxLevel(type, def) {
  if (type === 'turret') return Math.max(5, Number(def?.max_level) || 1);
  return Number(def?.max_level) || 1;
}

function adminInsertBuilding(playerId, type, level, requestedGridIndex = null) {
  const def = db.BUILDING_DEFS[type];
  if (!def) return { error: `Unknown building type: ${type}` };
  const slot = adminFindBuildingSlot(playerId, type, requestedGridIndex);
  if (!slot) return { error: `No open slot for ${type}` };
  const targetLevel = Math.min(Math.max(Number(level) || 1, 1), adminBuildingMaxLevel(type, def));
  const hpLevels = Array.isArray(def.hp_levels) && def.hp_levels.length ? def.hp_levels : [1000];
  const maxHp = hpLevels[Math.min(targetLevel - 1, hpLevels.length - 1)] || hpLevels[0];
  const purchaseGranted = def.requires_purchase
    ? adminGrantUtilityPurchase(playerId, def.shop_sku || type)
    : false;
  const insert = db.db.prepare(`
    INSERT INTO buildings (player_id, type, level, grid_x, grid_z, grid_index, hp, max_hp, has_ship)
    VALUES (?, ?, ?, ?, ?, ?, ?, ?, 0)
  `).run(playerId, type, targetLevel, slot.grid_x, slot.grid_z, slot.grid_index, maxHp, maxHp);
  const building = db.db.prepare('SELECT * FROM buildings WHERE id = ?').get(insert.lastInsertRowid);
  return { building, purchase_granted: purchaseGranted };
}

// Add a building to a specific player from the admin panel.
// This bypasses resource cost and max-count checks, but still validates that
// the target tile is legal and unoccupied.
router.post('/admin/players/:name/add-building', adminAuth, (req, res) => {
  try {
    const player = db.db.prepare('SELECT id, name FROM players WHERE name = ?').get(req.params.name);
    if (!player) return res.status(404).json({ error: 'Player not found' });

    const type = String(req.body?.type || '').trim().toLowerCase();
    const def = db.BUILDING_DEFS[type];
    if (!def) {
      return res.status(400).json({
        error: 'Unknown building type',
        allowed: Object.keys(db.BUILDING_DEFS),
      });
    }

    const hasManualCoords = req.body?.grid_x != null && req.body?.grid_z != null;
    const autoSlot = req.body?.auto_slot !== false || !hasManualCoords;
    let gridIndex = req.body?.grid_index == null
      ? null
      : adminParseGridIndex(req.body.grid_index, type === 'port' ? 1 : 0);

    let building;
    let purchaseGranted = false;
    if (autoSlot) {
      const inserted = adminInsertBuilding(player.id, type, Number(req.body?.level || 1), gridIndex);
      if (inserted.error) return res.status(400).json({ error: inserted.error });
      building = inserted.building;
      purchaseGranted = inserted.purchase_granted;
    } else {
      const gridX = Number(req.body.grid_x);
      const gridZ = Number(req.body.grid_z);
      gridIndex = gridIndex == null ? (type === 'port' ? 1 : 0) : gridIndex;
      if (!Number.isInteger(gridX) || !Number.isInteger(gridZ)) {
        return res.status(400).json({ error: 'grid_x and grid_z must be integers' });
      }
      const placement = db.canPlaceBuildingAt(player.id, type, gridX, gridZ, gridIndex);
      if (!placement.ok) return res.status(400).json({ error: placement.reason || 'Invalid placement' });

      const requestedLevel = Number(req.body?.level || 1);
      const level = Math.min(Math.max(Number.isInteger(requestedLevel) ? requestedLevel : 1, 1), adminBuildingMaxLevel(type, def));
      const hpLevels = Array.isArray(def.hp_levels) && def.hp_levels.length ? def.hp_levels : [1000];
      const maxHp = hpLevels[Math.min(level - 1, hpLevels.length - 1)] || hpLevels[0];
      purchaseGranted = def.requires_purchase && req.body?.grant_purchase !== false
        ? adminGrantUtilityPurchase(player.id, def.shop_sku || type)
        : false;
      const insert = db.db.prepare(`
        INSERT INTO buildings (player_id, type, level, grid_x, grid_z, grid_index, hp, max_hp, has_ship)
        VALUES (?, ?, ?, ?, ?, ?, ?, ?, 0)
      `).run(player.id, type, level, gridX, gridZ, gridIndex, maxHp, maxHp);
      building = db.db.prepare('SELECT * FROM buildings WHERE id = ?').get(insert.lastInsertRowid);
    }

    res.json({
      success: true,
      player: { id: player.id, name: player.name },
      building,
      purchase_granted: purchaseGranted,
      buildings_count: db.getPlayerBuildings(player.id).length,
    });
  } catch (e) {
    res.status(500).json({ error: e.message });
  }
});

router.post('/admin/players/:name/max-village', adminAuth, (req, res) => {
  try {
    const player = db.db.prepare('SELECT id, name FROM players WHERE name = ?').get(req.params.name);
    if (!player) return res.status(404).json({ error: 'Player not found' });
    const townHallLevel = Math.max(1, Math.min(4, Math.floor(Number(req.body?.town_hall_level || req.body?.level || 1))));
    const result = db.db.transaction(() => {
      db.db.prepare('DELETE FROM buildings WHERE player_id = ?').run(player.id);
      const added = [];
      const purchases = [];
      for (const type of ADMIN_MAX_VILLAGE_BUILD_ORDER) {
        const def = db.BUILDING_DEFS[type];
        if (!def) continue;
        const count = adminMaxBuildingCountForTh(type, townHallLevel);
        if (count <= 0) continue;
        const level = adminBuildingTargetLevelForTh(type, def, townHallLevel);
        for (let i = 0; i < count; i += 1) {
          const inserted = adminInsertBuilding(player.id, type, level);
          if (inserted.error) throw new Error(inserted.error);
          added.push(inserted.building);
          if (inserted.purchase_granted) purchases.push(type);
        }
      }
      return { added, purchases };
    })();
    res.json({
      success: true,
      player: { id: player.id, name: player.name },
      town_hall_level: townHallLevel,
      buildings_added: result.added.length,
      buildings: result.added,
      purchases_granted: result.purchases,
      buildings_count: db.getPlayerBuildings(player.id).length,
    });
  } catch (e) {
    res.status(500).json({ error: e.message });
  }
});

// Server logs — in-memory ring buffer
const LOG_MAX = 500;
const _serverLogs = [];
function addLog(type, message, data = null) {
  _serverLogs.push({ ts: new Date().toISOString(), type, message, data });
  if (_serverLogs.length > LOG_MAX) _serverLogs.shift();
}

// Expose log function for use in other handlers
function logBattle(msg, data) { addLog('battle', msg, data); }
function logEconomy(msg, data) { addLog('economy', msg, data); }
function logAuth(msg, data) { addLog('auth', msg, data); }
function logError(msg, data) { addLog('error', msg, data); }

// Get server logs
router.get('/admin/logs', adminAuth, (req, res) => {
  const type = req.query.type;
  const limit = Math.min(parseInt(req.query.limit) || 100, LOG_MAX);
  let logs = type ? _serverLogs.filter(l => l.type === type) : _serverLogs;
  res.json(logs.slice(-limit));
});

router.get('/admin/client-logs', adminAuth, (req, res) => {
  try { pruneClientLogs.run(`-${CLIENT_LOG_RETENTION_DAYS} days`); } catch {}
  const limit = Math.min(parseInt(req.query.limit, 10) || 200, 500);
  const rawSinceMin = parseInt(req.query.since_min, 10);
  const maxSinceMin = CLIENT_LOG_RETENTION_DAYS * 24 * 60;
  const sinceMin = Number.isFinite(rawSinceMin) && rawSinceMin > 0
    ? Math.min(rawSinceMin, maxSinceMin)
    : maxSinceMin;
  const level = req.query.level ? normalizeClientLevel(req.query.level) : null;
  const q = typeof req.query.q === 'string' ? req.query.q.trim().slice(0, 80) : '';
  const conds = [];
  const args = [];
  conds.push(`cl.created_at >= datetime('now', ?)`);
  args.push(`-${sinceMin} minutes`);
  if (level) {
    conds.push('cl.level = ?');
    args.push(level);
  }
  if (q) {
    conds.push('(cl.message LIKE ? OR cl.url LIKE ? OR cl.source LIKE ? OR p.name LIKE ? OR p.wallet LIKE ? OR p.dex LIKE ?)');
    const like = `%${q}%`;
    args.push(like, like, like, like, like, like);
  }
  args.push(limit);
  const where = conds.length ? `WHERE ${conds.join(' AND ')}` : '';
  const rows = db.db.prepare(`
    SELECT
      cl.id, cl.player_id, cl.ip, cl.level, cl.source, cl.url, cl.ua,
      cl.message, cl.stack, cl.payload, cl.created_at,
      p.name AS player_name,
      p.dex AS player_dex,
      p.wallet AS player_wallet
    FROM client_logs cl
    LEFT JOIN players p ON p.id = cl.player_id
    ${where}
    ORDER BY cl.id DESC
    LIMIT ?
  `).all(...args).map((r) => ({
    ...r,
    payload: (() => { try { return r.payload ? JSON.parse(r.payload) : null; } catch { return r.payload; } })(),
  }));
  res.json({ rows, total: rows.length, retention_days: CLIENT_LOG_RETENTION_DAYS });
});

router.get('/admin/ai-log-reports', adminAuth, (req, res) => {
  try {
    res.json({
      model: logAiAnalyzer.getModel(),
      reports: logAiAnalyzer.listReports(req.query.limit || 20),
    });
  } catch (e) {
    res.status(500).json({ error: e.message });
  }
});

router.get('/admin/ai-log-reports/:id', adminAuth, (req, res) => {
  try {
    const report = logAiAnalyzer.getReport(req.params.id);
    if (!report) return res.status(404).json({ error: 'Report not found' });
    res.json({ report });
  } catch (e) {
    res.status(500).json({ error: e.message });
  }
});

router.post('/admin/ai-log-reports/run', adminAuth, async (req, res) => {
  try {
    const lookbackHours = Math.max(1, Math.min(168, Number(req.body?.lookback_hours || 24) || 24));
    const report = await logAiAnalyzer.runLogAiAnalysis({
      lookbackHours,
      model: typeof req.body?.model === 'string' && req.body.model.trim() ? req.body.model.trim() : undefined,
      limit: req.body?.limit,
    });
    res.json({ ok: true, report });
  } catch (e) {
    res.status(e.status || 500).json({
      error: e.message,
      report: e.report || null,
    });
  }
});

router.get('/admin/feedback', adminAuth, (req, res) => {
  const limit = Math.min(parseInt(req.query.limit, 10) || 200, 500);
  const rawSinceMin = parseInt(req.query.since_min, 10);
  const sinceMin = Number.isFinite(rawSinceMin) && rawSinceMin > 0 ? Math.min(rawSinceMin, 60 * 24 * 90) : null;
  const kind = FEEDBACK_KINDS.has(String(req.query.kind || '').toLowerCase())
    ? String(req.query.kind).toLowerCase()
    : null;
  const q = typeof req.query.q === 'string' ? req.query.q.trim().slice(0, 80) : '';
  const conds = [];
  const args = [];
  if (sinceMin) {
    conds.push(`uf.created_at >= datetime('now', ?)`);
    args.push(`-${sinceMin} minutes`);
  }
  if (kind) {
    conds.push('uf.kind = ?');
    args.push(kind);
  }
  if (q) {
    conds.push('(uf.message LIKE ? OR uf.contact_value LIKE ? OR p.name LIKE ? OR p.wallet LIKE ? OR p.dex LIKE ?)');
    const like = `%${q}%`;
    args.push(like, like, like, like, like);
  }
  args.push(limit);
  const where = conds.length ? `WHERE ${conds.join(' AND ')}` : '';
  const rows = db.db.prepare(`
    SELECT
      uf.id, uf.player_id, uf.kind, uf.message, uf.contact_type, uf.contact_value,
      uf.page_url, uf.ua, uf.viewport, uf.ip, uf.status, uf.created_at, uf.updated_at,
      p.name AS player_name,
      p.wallet AS player_wallet,
      p.dex AS player_dex,
      p.futures_mode AS player_futures_mode
    FROM user_feedback uf
    LEFT JOIN players p ON p.id = uf.player_id
    ${where}
    ORDER BY uf.id DESC
    LIMIT ?
  `).all(...args);
  const summary = db.db.prepare(`
    SELECT
      COUNT(*) AS total,
      COALESCE(SUM(CASE WHEN created_at >= datetime('now', '-24 hours') THEN 1 ELSE 0 END), 0) AS day,
      COALESCE(SUM(CASE WHEN kind = 'problem' THEN 1 ELSE 0 END), 0) AS problems,
      COALESCE(SUM(CASE WHEN kind = 'feedback' THEN 1 ELSE 0 END), 0) AS feedback
    FROM user_feedback
  `).get();
  res.json({ rows, total: rows.length, summary });
});

function parseDevicePayloadText(payload) {
  if (!payload) return '';
  if (typeof payload !== 'string') return JSON.stringify(payload).slice(0, 2000);
  try {
    return JSON.stringify(JSON.parse(payload)).slice(0, 2000);
  } catch {
    return payload.slice(0, 2000);
  }
}

function rowDeviceText(row) {
  return [
    row?.ua,
    row?.seeker_source,
    row?.seeker_id,
    parseDevicePayloadText(row?.payload),
  ].filter(Boolean).join(' ');
}

function isSolanaMobileDevice(row) {
  if (Number(row?.is_seeker || 0) === 1 || row?.seeker_id) return true;
  return /solana\s*mobile|solanamobile|\bseeker\b|\bsaga\b|mobile wallet adapter|\bmwa\b/i.test(rowDeviceText(row));
}

function classifyDeviceFamily(row) {
  const text = rowDeviceText(row);
  if (/bot|crawler|spider|headless|playwright|puppeteer|lighthouse/i.test(text)) return 'bot';
  if (isSolanaMobileDevice(row)) return 'solana_mobile';
  if (!text) return 'unknown';
  if (/ipad|tablet|kindle|silk/i.test(text)) return 'tablet_web';
  if (/mobile|android|iphone|ipod|windows phone/i.test(text)) return 'mobile_web';
  if (/windows nt|macintosh|mac os x|x11|linux/i.test(text)) return 'desktop_web';
  return 'unknown';
}

function classifyDevicePlatform(row) {
  const text = rowDeviceText(row);
  if (/bot|crawler|spider|headless|playwright|puppeteer|lighthouse/i.test(text)) return 'bot';
  if (isSolanaMobileDevice(row)) return 'solana_mobile';
  if (/iphone|ipad|ipod|\bios\b/i.test(text)) return 'ios';
  if (/android/i.test(text)) return 'android';
  if (/windows nt|windows/i.test(text)) return 'windows';
  if (/macintosh|mac os x/i.test(text)) return 'macos';
  if (/linux|x11/i.test(text)) return 'linux';
  return 'unknown';
}

const DEVICE_LABELS = {
  solana_mobile: 'Solana Mobile',
  mobile_web: 'Mobile web',
  tablet_web: 'Tablet web',
  desktop_web: 'Desktop web',
  bot: 'Bot / automation',
  unknown: 'Unknown',
};

const PLATFORM_LABELS = {
  solana_mobile: 'Solana Mobile',
  android: 'Android',
  ios: 'iOS / iPadOS',
  windows: 'Windows',
  macos: 'macOS',
  linux: 'Linux',
  bot: 'Bot / automation',
  unknown: 'Unknown',
};

function rowLatestAt(row) {
  return row?.last_seen_at || row?.log_created_at || row?.seeker_detected_at || null;
}

function isDateWithin(value, ms) {
  if (!value) return false;
  const t = new Date(String(value).replace(' ', 'T') + 'Z').getTime();
  return Number.isFinite(t) && (Date.now() - t) <= ms;
}

function aggregateDeviceRows(rows, classifier, labels) {
  const map = {};
  for (const row of rows) {
    const key = classifier(row);
    if (!map[key]) {
      map[key] = {
        key,
        label: labels[key] || key,
        players: 0,
        active_24h: 0,
        online_now: 0,
        latest_at: null,
      };
    }
    const bucket = map[key];
    bucket.players += 1;
    if (isDateWithin(row.last_seen_at || row.log_created_at, 24 * 60 * 60 * 1000)) bucket.active_24h += 1;
    if (isDateWithin(row.last_seen_at || row.log_created_at, 5 * 60 * 1000)) bucket.online_now += 1;
    const latest = rowLatestAt(row);
    if (latest && (!bucket.latest_at || String(latest) > String(bucket.latest_at))) bucket.latest_at = latest;
  }
  return Object.values(map).sort((a, b) => b.players - a.players || a.label.localeCompare(b.label));
}

function buildDeviceStats() {
  try {
    const rows = db.db.prepare(`
      SELECT
        p.id, COALESCE(NULLIF(p.dex, ''), 'unknown') AS dex,
        p.is_seeker, p.seeker_id, p.seeker_source, p.seeker_detected_at,
        p.last_seen_at,
        cl.ua, cl.payload, cl.created_at AS log_created_at
      FROM players p
      LEFT JOIN (
        SELECT player_id, MAX(id) AS latest_log_id
        FROM client_logs
        WHERE player_id IS NOT NULL
        GROUP BY player_id
      ) latest ON latest.player_id = p.id
      LEFT JOIN client_logs cl ON cl.id = latest.latest_log_id
    `).all();

    const byDexMap = {};
    for (const row of rows) {
      const dex = row.dex || 'unknown';
      const family = classifyDeviceFamily(row);
      const key = dex + '|' + family;
      if (!byDexMap[key]) {
        byDexMap[key] = {
          dex,
          device: family,
          label: DEVICE_LABELS[family] || family,
          players: 0,
          active_24h: 0,
        };
      }
      byDexMap[key].players += 1;
      if (isDateWithin(row.last_seen_at || row.log_created_at, 24 * 60 * 60 * 1000)) byDexMap[key].active_24h += 1;
    }

    const seekerSources = db.db.prepare(`
      SELECT COALESCE(NULLIF(seeker_source, ''), 'client') AS source,
             COUNT(*) AS players
      FROM players
      WHERE COALESCE(is_seeker, 0) = 1 OR seeker_id IS NOT NULL
      GROUP BY COALESCE(NULLIF(seeker_source, ''), 'client')
      ORDER BY players DESC, source ASC
    `).all();

    return {
      summary: aggregateDeviceRows(rows, classifyDeviceFamily, DEVICE_LABELS),
      platforms: aggregateDeviceRows(rows, classifyDevicePlatform, PLATFORM_LABELS),
      by_dex: Object.values(byDexMap).sort((a, b) => b.players - a.players || a.dex.localeCompare(b.dex) || a.label.localeCompare(b.label)),
      seeker_sources: seekerSources,
      solana_mobile_players: rows.filter(isSolanaMobileDevice).length,
    };
  } catch (e) {
    return { summary: [], platforms: [], by_dex: [], seeker_sources: [], solana_mobile_players: 0, error: e.message };
  }
}

function adminSafeGet(sql, params = [], fallback = {}) {
  try {
    return db.db.prepare(sql).get(...params) || fallback;
  } catch (e) {
    return { ...fallback, error: e.message };
  }
}

function adminSafeAll(sql, params = []) {
  try {
    return db.db.prepare(sql).all(...params);
  } catch {
    return [];
  }
}

function adminNum(value, digits = 1) {
  const n = Number(value);
  if (!Number.isFinite(n)) return 0;
  const factor = 10 ** Math.max(0, digits);
  return Math.round(n * factor) / factor;
}

function adminPct(numerator, denominator, digits = 1) {
  const den = Number(denominator) || 0;
  if (den <= 0) return 0;
  return adminNum((Number(numerator) || 0) * 100 / den, digits);
}

function adminFunnelStep(key, label, players, previousPlayers, totalPlayers) {
  const value = Math.max(0, Number(players) || 0);
  return {
    key,
    label,
    players: value,
    from_previous_pct: adminPct(value, previousPlayers),
    from_total_pct: adminPct(value, totalPlayers),
  };
}

function normalizeAdminCombatRow(row) {
  const attacks = Number(row?.attacks || 0);
  const accepted = Number(row?.accepted || 0);
  const acceptedVictories = Number(row?.accepted_victories || 0);
  return {
    attacks,
    attackers: Number(row?.attackers || 0),
    defenders: Number(row?.defenders || 0),
    accepted,
    rejected: Number(row?.rejected || 0),
    claimed_victories: Number(row?.claimed_victories || 0),
    accepted_victories: acceptedVictories,
    acceptance_rate_pct: adminPct(accepted, attacks),
    accepted_win_rate_pct: adminPct(acceptedVictories, attacks),
    avg_duration_sec: adminNum(row?.avg_duration_sec || 0),
    avg_loot_gold: adminNum(row?.avg_loot_gold || 0),
    avg_loot_wood: adminNum(row?.avg_loot_wood || 0),
    avg_loot_ore: adminNum(row?.avg_loot_ore || 0),
    avg_th_hp_remaining_pct: adminNum(row?.avg_th_hp_remaining_pct || 0),
    avg_th_damage_pct: adminNum(row?.avg_th_damage_pct || 0),
    avg_buildings_destroyed: adminNum(row?.avg_buildings_destroyed || 0, 2),
  };
}

function buildAdminCombatStats() {
  const battleAggSql = `
    SELECT
      COUNT(*) AS attacks,
      COUNT(DISTINCT attacker_id) AS attackers,
      COUNT(DISTINCT defender_id) AS defenders,
      COALESCE(SUM(CASE WHEN lower(COALESCE(verified_result, '')) IN ('accepted', 'victory') THEN 1 ELSE 0 END), 0) AS accepted,
      COALESCE(SUM(CASE WHEN lower(COALESCE(verified_result, '')) = 'rejected' THEN 1 ELSE 0 END), 0) AS rejected,
      COALESCE(SUM(CASE WHEN lower(COALESCE(claimed_result, '')) = 'victory' THEN 1 ELSE 0 END), 0) AS claimed_victories,
      COALESCE(SUM(CASE WHEN lower(COALESCE(claimed_result, '')) = 'victory'
        AND lower(COALESCE(verified_result, '')) IN ('accepted', 'victory') THEN 1 ELSE 0 END), 0) AS accepted_victories,
      ROUND(COALESCE(AVG(duration_sec), 0), 1) AS avg_duration_sec,
      ROUND(COALESCE(AVG(loot_gold), 0), 1) AS avg_loot_gold,
      ROUND(COALESCE(AVG(loot_wood), 0), 1) AS avg_loot_wood,
      ROUND(COALESCE(AVG(loot_ore), 0), 1) AS avg_loot_ore,
      ROUND(COALESCE(AVG(CASE WHEN sim_th_hp_pct IS NULL THEN NULL ELSE sim_th_hp_pct * 100 END), 0), 1) AS avg_th_hp_remaining_pct,
      ROUND(COALESCE(AVG(CASE WHEN sim_th_hp_pct IS NULL THEN NULL ELSE (1.0 - sim_th_hp_pct) * 100 END), 0), 1) AS avg_th_damage_pct,
      ROUND(COALESCE(AVG(sim_buildings_destroyed), 0), 2) AS avg_buildings_destroyed
    FROM battle_replays
    WHERE created_at > datetime('now', ?)
  `;
  const windows = [
    { key: '24h', label: 'Last 24h', modifier: '-24 hours' },
    { key: '7d', label: 'Last 7d', modifier: '-7 days' },
    { key: '30d', label: 'Last 30d', modifier: '-30 days' },
  ].map((window) => ({
    ...window,
    ...normalizeAdminCombatRow(adminSafeGet(battleAggSql, [window.modifier])),
  }));

  const thGapRows = adminSafeAll(`
    WITH player_th AS (
      SELECT p.id, COALESCE(MAX(CASE WHEN b.type = 'town_hall' THEN b.level END), 1) AS th_level
      FROM players p
      LEFT JOIN buildings b ON b.player_id = p.id
      GROUP BY p.id
    ),
    replay_th AS (
      SELECT r.*, COALESCE(a.th_level, 1) AS attacker_th, COALESCE(d.th_level, 1) AS defender_th
      FROM battle_replays r
      LEFT JOIN player_th a ON a.id = r.attacker_id
      LEFT JOIN player_th d ON d.id = r.defender_id
      WHERE r.created_at > datetime('now', '-30 days')
    )
    SELECT
      CASE
        WHEN attacker_th < defender_th THEN 'lower_vs_higher'
        WHEN attacker_th > defender_th THEN 'higher_vs_lower'
        ELSE 'same_th'
      END AS bucket,
      COUNT(*) AS attacks,
      COUNT(DISTINCT attacker_id) AS attackers,
      COALESCE(SUM(CASE WHEN lower(COALESCE(verified_result, '')) IN ('accepted', 'victory') THEN 1 ELSE 0 END), 0) AS accepted,
      COALESCE(SUM(CASE WHEN lower(COALESCE(claimed_result, '')) = 'victory'
        AND lower(COALESCE(verified_result, '')) IN ('accepted', 'victory') THEN 1 ELSE 0 END), 0) AS accepted_victories,
      ROUND(COALESCE(AVG(CASE WHEN sim_th_hp_pct IS NULL THEN NULL ELSE (1.0 - sim_th_hp_pct) * 100 END), 0), 1) AS avg_th_damage_pct,
      ROUND(COALESCE(AVG(sim_buildings_destroyed), 0), 2) AS avg_buildings_destroyed
    FROM replay_th
    GROUP BY bucket
    ORDER BY CASE bucket WHEN 'lower_vs_higher' THEN 1 WHEN 'same_th' THEN 2 ELSE 3 END
  `).map((row) => ({
    bucket: row.bucket,
    ...normalizeAdminCombatRow(row),
  }));

  const attackerThRows = adminSafeAll(`
    WITH player_th AS (
      SELECT p.id, COALESCE(MAX(CASE WHEN b.type = 'town_hall' THEN b.level END), 1) AS th_level
      FROM players p
      LEFT JOIN buildings b ON b.player_id = p.id
      GROUP BY p.id
    )
    SELECT
      COALESCE(a.th_level, 1) AS attacker_th,
      COUNT(*) AS attacks,
      COUNT(DISTINCT r.attacker_id) AS attackers,
      COALESCE(SUM(CASE WHEN lower(COALESCE(r.verified_result, '')) IN ('accepted', 'victory') THEN 1 ELSE 0 END), 0) AS accepted,
      COALESCE(SUM(CASE WHEN lower(COALESCE(r.claimed_result, '')) = 'victory'
        AND lower(COALESCE(r.verified_result, '')) IN ('accepted', 'victory') THEN 1 ELSE 0 END), 0) AS accepted_victories,
      ROUND(COALESCE(AVG(CASE WHEN r.sim_th_hp_pct IS NULL THEN NULL ELSE (1.0 - r.sim_th_hp_pct) * 100 END), 0), 1) AS avg_th_damage_pct
    FROM battle_replays r
    LEFT JOIN player_th a ON a.id = r.attacker_id
    WHERE r.created_at > datetime('now', '-30 days')
    GROUP BY attacker_th
    ORDER BY attacker_th
  `).map((row) => ({
    attacker_th: Number(row.attacker_th || 1),
    ...normalizeAdminCombatRow(row),
  }));

  const topAttackers = adminSafeAll(`
    WITH player_th AS (
      SELECT p.id, COALESCE(MAX(CASE WHEN b.type = 'town_hall' THEN b.level END), 1) AS th_level
      FROM players p
      LEFT JOIN buildings b ON b.player_id = p.id
      GROUP BY p.id
    )
    SELECT
      r.attacker_id,
      COALESCE(p.name, r.attacker_id) AS name,
      COALESCE(p.dex, 'unknown') AS dex,
      COALESCE(t.th_level, 1) AS th_level,
      COUNT(*) AS attacks,
      COALESCE(SUM(CASE WHEN lower(COALESCE(r.verified_result, '')) IN ('accepted', 'victory') THEN 1 ELSE 0 END), 0) AS accepted,
      COALESCE(SUM(CASE WHEN lower(COALESCE(r.claimed_result, '')) = 'victory'
        AND lower(COALESCE(r.verified_result, '')) IN ('accepted', 'victory') THEN 1 ELSE 0 END), 0) AS accepted_victories,
      ROUND(COALESCE(AVG(r.loot_gold), 0), 1) AS avg_loot_gold
    FROM battle_replays r
    LEFT JOIN players p ON p.id = r.attacker_id
    LEFT JOIN player_th t ON t.id = r.attacker_id
    WHERE r.created_at > datetime('now', '-30 days')
    GROUP BY r.attacker_id
    ORDER BY attacks DESC, accepted_victories DESC
    LIMIT 12
  `).map((row) => ({
    attacker_id: row.attacker_id,
    name: row.name,
    dex: row.dex,
    th_level: Number(row.th_level || 1),
    attacks: Number(row.attacks || 0),
    accepted: Number(row.accepted || 0),
    accepted_victories: Number(row.accepted_victories || 0),
    accepted_win_rate_pct: adminPct(row.accepted_victories, row.attacks),
    avg_loot_gold: adminNum(row.avg_loot_gold || 0),
  }));

  return {
    note: 'TH bucket slices use current player Town Hall levels, not historical TH at battle time.',
    windows,
    th_gap_30d: thGapRows,
    attacker_th_30d: attackerThRows,
    top_attackers_30d: topAttackers,
  };
}

function buildAdminGrowthFunnelStats({ playerCount, activeQ }) {
  const totalPlayers = Number(playerCount || 0);
  const active24 = Number(activeQ?.active_24h || 0);
  const dexSelected = Number(adminSafeGet(`
    SELECT COUNT(*) AS n
    FROM players
    WHERE dex IS NOT NULL AND LENGTH(TRIM(dex)) > 0
  `).n || 0);
  const futuresModePicked = Number(adminSafeGet(`
    SELECT COUNT(*) AS n
    FROM players
    WHERE futures_mode IS NOT NULL AND LENGTH(TRIM(futures_mode)) > 0
  `).n || 0);
  const trading = adminSafeGet(`
    SELECT
      COUNT(DISTINCT player_id) AS reward_profiles,
      COUNT(DISTINCT CASE WHEN first_deposit > 0 THEN player_id END) AS first_deposit_players,
      COUNT(DISTINCT CASE WHEN first_trade > 0 OR total_volume > 0 THEN player_id END) AS first_trade_players,
      COUNT(DISTINCT CASE WHEN total_volume > 0 THEN player_id END) AS volume_players,
      COALESCE(SUM(total_volume), 0) AS total_volume,
      COALESCE(SUM(total_gold), 0) AS total_gold
    FROM trading_rewards
  `);
  const tradeGold = adminSafeGet(`
    SELECT
      COUNT(*) AS claims,
      COUNT(DISTINCT player_id) AS claimers,
      COALESCE(SUM(amount), 0) AS gold
    FROM gold_history
    WHERE lower(COALESCE(reason, '')) LIKE '%trade%'
       OR lower(COALESCE(reason, '')) LIKE '%daily%'
       OR lower(COALESCE(reason, '')) LIKE '%deposit%'
       OR lower(COALESCE(reason, '')) LIKE '%profit%'
       OR lower(COALESCE(reason, '')) LIKE '%volume%'
  `);
  const taskStats = adminSafeGet(`
    SELECT
      COUNT(*) AS started,
      COUNT(DISTINCT player_id) AS starters,
      COALESCE(SUM(CASE WHEN claimed_at IS NOT NULL THEN 1 ELSE 0 END), 0) AS claims,
      COUNT(DISTINCT CASE WHEN claimed_at IS NOT NULL THEN player_id END) AS claimers
    FROM player_tasks
  `);
  const shop = adminSafeGet(`
    SELECT
      COUNT(*) AS purchases,
      COUNT(DISTINCT player_id) AS buyers,
      ROUND(COALESCE(SUM(CAST(usd_price_e6 AS REAL)), 0) / 1000000.0, 2) AS revenue_usd,
      COALESCE(SUM(CASE WHEN lower(COALESCE(token, '')) IN ('cop', 'clash', 'skr') THEN 1 ELSE 0 END), 0) AS project_token_purchases,
      COUNT(DISTINCT CASE WHEN lower(COALESCE(token, '')) IN ('cop', 'clash', 'skr') THEN player_id END) AS project_token_buyers
    FROM utility_purchases
  `);
  const marketplace = adminSafeGet(`
    SELECT
      COUNT(*) AS orders,
      COUNT(DISTINCT buyer_player_id) AS buyers,
      COUNT(DISTINCT seller_player_id) AS sellers,
      COALESCE(SUM(CASE WHEN payment_verified_at IS NOT NULL
        OR status IN ('paid', 'delivering', 'delivered', 'complete', 'completed') THEN 1 ELSE 0 END), 0) AS paid_orders,
      ROUND(COALESCE(SUM(CASE WHEN payment_verified_at IS NOT NULL
        OR status IN ('paid', 'delivering', 'delivered', 'complete', 'completed')
        THEN CAST(price_usdc_units AS REAL) ELSE 0 END), 0) / 1000000.0, 2) AS paid_usdc
    FROM custodial_marketplace_orders
  `);

  const rawSteps = [
    ['total_players', 'Total players', totalPlayers],
    ['active_24h', 'Active 24h', active24],
    ['dex_selected', 'DEX selected', dexSelected],
    ['futures_mode_picked', 'Futures UI picked', futuresModePicked],
    ['reward_profile', 'Trading reward profile', Number(trading.reward_profiles || 0)],
    ['first_deposit', 'First deposit rewarded', Number(trading.first_deposit_players || 0)],
    ['first_trade', 'First trade / volume', Number(trading.first_trade_players || 0)],
    ['trade_gold_claimer', 'Claimed trade gold', Number(tradeGold.claimers || 0)],
    ['task_claimer', 'Claimed a task', Number(taskStats.claimers || 0)],
    ['shop_buyer', 'Shop buyer', Number(shop.buyers || 0)],
    ['project_token_buyer', 'Paid with project token', Number(shop.project_token_buyers || 0)],
    ['marketplace_buyer', 'Marketplace buyer', Number(marketplace.buyers || 0)],
  ];
  const steps = rawSteps.map(([key, label, players], index) => (
    adminFunnelStep(key, label, players, index > 0 ? rawSteps[index - 1][2] : players, totalPlayers)
  ));

  const byDex = adminSafeAll(`
    WITH trading AS (
      SELECT player_id,
             SUM(total_volume) AS total_volume,
             SUM(total_gold) AS total_gold,
             MAX(first_deposit) AS first_deposit,
             MAX(CASE WHEN first_trade > 0 OR total_volume > 0 THEN 1 ELSE 0 END) AS first_trade
      FROM trading_rewards
      GROUP BY player_id
    ),
    purchases AS (
      SELECT player_id,
             COUNT(*) AS purchases,
             MAX(CASE WHEN lower(COALESCE(token, '')) IN ('cop', 'clash', 'skr') THEN 1 ELSE 0 END) AS project_token_purchase
      FROM utility_purchases
      GROUP BY player_id
    )
    SELECT
      COALESCE(NULLIF(p.dex, ''), 'unknown') AS dex,
      COUNT(*) AS players,
      COALESCE(SUM(CASE WHEN p.last_seen_at > datetime('now', '-24 hours') THEN 1 ELSE 0 END), 0) AS active_24h,
      COALESCE(SUM(CASE WHEN t.player_id IS NOT NULL THEN 1 ELSE 0 END), 0) AS reward_profiles,
      COALESCE(SUM(CASE WHEN t.first_deposit > 0 THEN 1 ELSE 0 END), 0) AS first_deposit_players,
      COALESCE(SUM(CASE WHEN t.first_trade > 0 THEN 1 ELSE 0 END), 0) AS first_trade_players,
      ROUND(COALESCE(SUM(t.total_volume), 0), 2) AS total_volume,
      COALESCE(SUM(t.total_gold), 0) AS total_gold,
      COALESCE(SUM(CASE WHEN purchases.purchases > 0 THEN 1 ELSE 0 END), 0) AS shop_buyers,
      COALESCE(SUM(CASE WHEN purchases.project_token_purchase > 0 THEN 1 ELSE 0 END), 0) AS project_token_buyers
    FROM players p
    LEFT JOIN trading t ON t.player_id = p.id
    LEFT JOIN purchases ON purchases.player_id = p.id
    GROUP BY dex
    ORDER BY players DESC, dex ASC
  `).map((row) => ({
    dex: row.dex,
    players: Number(row.players || 0),
    active_24h: Number(row.active_24h || 0),
    reward_profiles: Number(row.reward_profiles || 0),
    first_deposit_players: Number(row.first_deposit_players || 0),
    first_trade_players: Number(row.first_trade_players || 0),
    total_volume: adminNum(row.total_volume || 0, 2),
    total_gold: Number(row.total_gold || 0),
    shop_buyers: Number(row.shop_buyers || 0),
    project_token_buyers: Number(row.project_token_buyers || 0),
  }));

  const monetizationWindows = [
    { key: '24h', label: 'Last 24h', modifier: '-24 hours' },
    { key: '7d', label: 'Last 7d', modifier: '-7 days' },
    { key: '30d', label: 'Last 30d', modifier: '-30 days' },
  ].map((window) => {
    const row = adminSafeGet(`
      SELECT
        COUNT(*) AS purchases,
        COUNT(DISTINCT player_id) AS buyers,
        ROUND(COALESCE(SUM(CAST(usd_price_e6 AS REAL)), 0) / 1000000.0, 2) AS revenue_usd,
        COALESCE(SUM(CASE WHEN lower(COALESCE(token, '')) IN ('cop', 'clash', 'skr') THEN 1 ELSE 0 END), 0) AS project_token_purchases,
        COUNT(DISTINCT CASE WHEN lower(COALESCE(token, '')) IN ('cop', 'clash', 'skr') THEN player_id END) AS project_token_buyers
      FROM utility_purchases
      WHERE created_at > datetime('now', ?)
    `, [window.modifier]);
    return {
      ...window,
      purchases: Number(row.purchases || 0),
      buyers: Number(row.buyers || 0),
      revenue_usd: adminNum(row.revenue_usd || 0, 2),
      project_token_purchases: Number(row.project_token_purchases || 0),
      project_token_buyers: Number(row.project_token_buyers || 0),
    };
  });

  const topSkus30d = adminSafeAll(`
    SELECT utility AS sku,
           COUNT(*) AS purchases,
           COUNT(DISTINCT player_id) AS buyers,
           ROUND(COALESCE(SUM(CAST(usd_price_e6 AS REAL)), 0) / 1000000.0, 2) AS revenue_usd
    FROM utility_purchases
    WHERE created_at > datetime('now', '-30 days')
    GROUP BY utility
    ORDER BY purchases DESC, revenue_usd DESC
    LIMIT 10
  `).map((row) => ({
    sku: row.sku,
    purchases: Number(row.purchases || 0),
    buyers: Number(row.buyers || 0),
    revenue_usd: adminNum(row.revenue_usd || 0, 2),
  }));

  return {
    note: 'Project token payments are detected from utility_purchases.token values cop/clash/skr.',
    steps,
    trading: {
      reward_profiles: Number(trading.reward_profiles || 0),
      first_deposit_players: Number(trading.first_deposit_players || 0),
      first_trade_players: Number(trading.first_trade_players || 0),
      total_volume: adminNum(trading.total_volume || 0, 2),
      total_gold: Number(trading.total_gold || 0),
      trade_gold_claims: Number(tradeGold.claims || 0),
      trade_gold_claimers: Number(tradeGold.claimers || 0),
      trade_gold_paid: Number(tradeGold.gold || 0),
    },
    tasks: {
      started: Number(taskStats.started || 0),
      starters: Number(taskStats.starters || 0),
      claims: Number(taskStats.claims || 0),
      claimers: Number(taskStats.claimers || 0),
    },
    shop: {
      purchases: Number(shop.purchases || 0),
      buyers: Number(shop.buyers || 0),
      revenue_usd: adminNum(shop.revenue_usd || 0, 2),
      project_token_purchases: Number(shop.project_token_purchases || 0),
      project_token_buyers: Number(shop.project_token_buyers || 0),
    },
    marketplace: {
      orders: Number(marketplace.orders || 0),
      buyers: Number(marketplace.buyers || 0),
      sellers: Number(marketplace.sellers || 0),
      paid_orders: Number(marketplace.paid_orders || 0),
      paid_usdc: adminNum(marketplace.paid_usdc || 0, 2),
    },
    by_dex: byDex,
    monetization_windows: monetizationWindows,
    top_skus_30d: topSkus30d,
  };
}

function buildAdminTelemetryStats() {
  const windowRows = [
    { key: '24h', label: 'Last 24h', modifier: '-24 hours' },
    { key: '7d', label: 'Last 7d', modifier: '-7 days' },
    { key: '30d', label: 'Last 30d', modifier: '-30 days' },
  ].map((window) => {
    const trade = adminSafeGet(`
      SELECT
        COUNT(*) AS events,
        COUNT(DISTINCT player_id) AS players,
        COALESCE(SUM(CASE WHEN result = 'paid' THEN 1 ELSE 0 END), 0) AS paid_events,
        COALESCE(SUM(total_gold_paid), 0) AS gold_paid,
        ROUND(COALESCE(SUM(credited_volume_usd), 0), 2) AS volume_usd
      FROM trade_claim_results
      WHERE created_at > datetime('now', ?)
    `, [window.modifier]);
    const shop = adminSafeGet(`
      SELECT
        COUNT(*) AS events,
        COUNT(DISTINCT player_id) AS players,
        COALESCE(SUM(CASE WHEN event_type LIKE '%succeeded' THEN 1 ELSE 0 END), 0) AS succeeded,
        COALESCE(SUM(CASE WHEN event_type LIKE '%failed' THEN 1 ELSE 0 END), 0) AS failed
      FROM shop_funnel_events
      WHERE created_at > datetime('now', ?)
    `, [window.modifier]);
    const resources = adminSafeGet(`
      SELECT
        COUNT(*) AS events,
        COUNT(DISTINCT player_id) AS players,
        COALESCE(SUM(gold_delta), 0) AS gold_delta,
        COALESCE(SUM(wood_delta), 0) AS wood_delta,
        COALESCE(SUM(ore_delta), 0) AS ore_delta,
        COALESCE(SUM(lost_gold_to_cap), 0) AS lost_gold_to_cap
      FROM resource_delta_events
      WHERE created_at > datetime('now', ?)
    `, [window.modifier]);
    const task = adminSafeGet(`
      SELECT
        COUNT(*) AS events,
        COUNT(DISTINCT player_id) AS players,
        COALESCE(SUM(CASE WHEN result = 'paid' THEN 1 ELSE 0 END), 0) AS paid_events,
        COALESCE(SUM(reward_gold), 0) AS reward_gold,
        COALESCE(SUM(reward_wood), 0) AS reward_wood,
        COALESCE(SUM(reward_ore), 0) AS reward_ore
      FROM task_claim_events
      WHERE created_at > datetime('now', ?)
    `, [window.modifier]);
    return {
      ...window,
      trade_claim_events: Number(trade.events || 0),
      trade_claim_players: Number(trade.players || 0),
      trade_paid_events: Number(trade.paid_events || 0),
      trade_gold_paid: Number(trade.gold_paid || 0),
      trade_volume_usd: adminNum(trade.volume_usd || 0, 2),
      shop_events: Number(shop.events || 0),
      shop_players: Number(shop.players || 0),
      shop_succeeded: Number(shop.succeeded || 0),
      shop_failed: Number(shop.failed || 0),
      resource_events: Number(resources.events || 0),
      resource_players: Number(resources.players || 0),
      resource_gold_delta: Number(resources.gold_delta || 0),
      resource_wood_delta: Number(resources.wood_delta || 0),
      resource_ore_delta: Number(resources.ore_delta || 0),
      resource_lost_gold_to_cap: Number(resources.lost_gold_to_cap || 0),
      task_events: Number(task.events || 0),
      task_players: Number(task.players || 0),
      task_paid_events: Number(task.paid_events || 0),
      task_reward_gold: Number(task.reward_gold || 0),
      task_reward_wood: Number(task.reward_wood || 0),
      task_reward_ore: Number(task.reward_ore || 0),
    };
  });

  const tradeClaimResults7d = adminSafeAll(`
    SELECT
      COALESCE(result, 'unknown') AS result,
      COUNT(*) AS events,
      COUNT(DISTINCT player_id) AS players,
      COALESCE(SUM(total_gold_paid), 0) AS gold_paid,
      ROUND(COALESCE(SUM(credited_volume_usd), 0), 2) AS volume_usd,
      ROUND(COALESCE(AVG(claim_latency_ms), 0), 1) AS avg_latency_ms,
      COALESCE(SUM(settling_trade_count), 0) AS settling_trades
    FROM trade_claim_results
    WHERE created_at > datetime('now', '-7 days')
    GROUP BY result
    ORDER BY events DESC, result ASC
  `).map((row) => ({
    result: row.result,
    events: Number(row.events || 0),
    players: Number(row.players || 0),
    gold_paid: Number(row.gold_paid || 0),
    volume_usd: adminNum(row.volume_usd || 0, 2),
    avg_latency_ms: adminNum(row.avg_latency_ms || 0),
    settling_trades: Number(row.settling_trades || 0),
  }));

  const tradeClaimDex7d = adminSafeAll(`
    SELECT
      COALESCE(dex, 'unknown') AS dex,
      COUNT(*) AS events,
      COUNT(DISTINCT player_id) AS players,
      COALESCE(SUM(CASE WHEN result = 'paid' THEN 1 ELSE 0 END), 0) AS paid_events,
      COALESCE(SUM(total_gold_paid), 0) AS gold_paid,
      ROUND(COALESCE(SUM(credited_volume_usd), 0), 2) AS volume_usd,
      ROUND(COALESCE(AVG(claim_latency_ms), 0), 1) AS avg_latency_ms
    FROM trade_claim_results
    WHERE created_at > datetime('now', '-7 days')
    GROUP BY dex
    ORDER BY events DESC, gold_paid DESC
  `).map((row) => ({
    dex: row.dex,
    events: Number(row.events || 0),
    players: Number(row.players || 0),
    paid_events: Number(row.paid_events || 0),
    paid_rate_pct: adminPct(row.paid_events, row.events),
    gold_paid: Number(row.gold_paid || 0),
    volume_usd: adminNum(row.volume_usd || 0, 2),
    avg_latency_ms: adminNum(row.avg_latency_ms || 0),
  }));

  const shopSteps7d = adminSafeAll(`
    SELECT
      COALESCE(event_type, 'unknown') AS event_type,
      COUNT(*) AS events,
      COUNT(DISTINCT player_id) AS players,
      COALESCE(SUM(CASE WHEN error_code IS NOT NULL OR error_message IS NOT NULL THEN 1 ELSE 0 END), 0) AS errors
    FROM shop_funnel_events
    WHERE created_at > datetime('now', '-7 days')
    GROUP BY event_type
    ORDER BY events DESC, event_type ASC
  `).map((row) => ({
    event_type: row.event_type,
    events: Number(row.events || 0),
    players: Number(row.players || 0),
    errors: Number(row.errors || 0),
  }));

  const shopSkus7d = adminSafeAll(`
    SELECT
      COALESCE(NULLIF(sku, ''), 'unknown') AS sku,
      COUNT(*) AS events,
      COUNT(DISTINCT player_id) AS players,
      COALESCE(SUM(CASE WHEN event_type = 'redeem_succeeded' THEN 1 ELSE 0 END), 0) AS redeems,
      ROUND(COALESCE(SUM(CAST(usd_price_e6 AS REAL)), 0) / 1000000.0, 2) AS quoted_usd
    FROM shop_funnel_events
    WHERE created_at > datetime('now', '-7 days')
    GROUP BY sku
    ORDER BY events DESC, redeems DESC
    LIMIT 12
  `).map((row) => ({
    sku: row.sku,
    events: Number(row.events || 0),
    players: Number(row.players || 0),
    redeems: Number(row.redeems || 0),
    quoted_usd: adminNum(row.quoted_usd || 0, 2),
  }));

  const resourceSources7d = adminSafeAll(`
    SELECT
      COALESCE(source_type, 'resource_change') AS source_type,
      COUNT(*) AS events,
      COUNT(DISTINCT player_id) AS players,
      COALESCE(SUM(gold_delta), 0) AS gold_delta,
      COALESCE(SUM(wood_delta), 0) AS wood_delta,
      COALESCE(SUM(ore_delta), 0) AS ore_delta,
      COALESCE(SUM(lost_gold_to_cap), 0) AS lost_gold_to_cap
    FROM resource_delta_events
    WHERE created_at > datetime('now', '-7 days')
    GROUP BY source_type
    ORDER BY ABS(COALESCE(SUM(gold_delta), 0)) DESC, events DESC
    LIMIT 16
  `).map((row) => ({
    source_type: row.source_type,
    events: Number(row.events || 0),
    players: Number(row.players || 0),
    gold_delta: Number(row.gold_delta || 0),
    wood_delta: Number(row.wood_delta || 0),
    ore_delta: Number(row.ore_delta || 0),
    lost_gold_to_cap: Number(row.lost_gold_to_cap || 0),
  }));

  const taskResults7d = adminSafeAll(`
    SELECT
      COALESCE(result, 'unknown') AS result,
      COUNT(*) AS events,
      COUNT(DISTINCT player_id) AS players,
      COALESCE(SUM(reward_gold), 0) AS reward_gold,
      COALESCE(SUM(reward_wood), 0) AS reward_wood,
      COALESCE(SUM(reward_ore), 0) AS reward_ore
    FROM task_claim_events
    WHERE created_at > datetime('now', '-7 days')
    GROUP BY result
    ORDER BY events DESC, result ASC
  `).map((row) => ({
    result: row.result,
    events: Number(row.events || 0),
    players: Number(row.players || 0),
    reward_gold: Number(row.reward_gold || 0),
    reward_wood: Number(row.reward_wood || 0),
    reward_ore: Number(row.reward_ore || 0),
  }));

  const taskTop7d = adminSafeAll(`
    SELECT
      task_id,
      COALESCE(task_title, task_type, 'unknown') AS task,
      COUNT(*) AS events,
      COUNT(DISTINCT player_id) AS players,
      COALESCE(SUM(CASE WHEN result = 'paid' THEN 1 ELSE 0 END), 0) AS paid_events,
      ROUND(COALESCE(AVG(CASE WHEN target_value > 0 THEN progress_value * 100.0 / target_value ELSE 0 END), 0), 1) AS avg_progress_pct
    FROM task_claim_events
    WHERE created_at > datetime('now', '-7 days')
    GROUP BY task_id, task
    ORDER BY events DESC, paid_events DESC
    LIMIT 12
  `).map((row) => ({
    task_id: row.task_id,
    task: row.task,
    events: Number(row.events || 0),
    players: Number(row.players || 0),
    paid_events: Number(row.paid_events || 0),
    paid_rate_pct: adminPct(row.paid_events, row.events),
    avg_progress_pct: adminNum(row.avg_progress_pct || 0),
  }));

  return {
    note: 'Structured telemetry is stored in SQLite tables: trade_claim_results, shop_funnel_events, resource_delta_events, task_claim_events.',
    windows: windowRows,
    trade_claim_results_7d: tradeClaimResults7d,
    trade_claim_dex_7d: tradeClaimDex7d,
    shop_steps_7d: shopSteps7d,
    shop_skus_7d: shopSkus7d,
    resource_sources_7d: resourceSources7d,
    task_results_7d: taskResults7d,
    task_top_7d: taskTop7d,
  };
}

// Server stats
router.get('/admin/stats', adminAuth, (req, res) => {
  const playerCount = db.db.prepare('SELECT COUNT(*) as c FROM players').get().c;
  const buildingCount = db.db.prepare('SELECT COUNT(*) as c FROM buildings').get().c;
  const replayCount = db.db.prepare('SELECT COUNT(*) as c FROM battle_replays').get().c;
  const accepted = db.db.prepare("SELECT COUNT(*) as c FROM battle_replays WHERE verified_result='accepted'").get().c;
  const rejected = db.db.prepare("SELECT COUNT(*) as c FROM battle_replays WHERE verified_result='rejected'").get().c;
  const totalGold = db.db.prepare('SELECT SUM(gold) as s FROM players').get().s || 0;
  const totalWood = db.db.prepare('SELECT SUM(wood) as s FROM players').get().s || 0;
  const totalOre = db.db.prepare('SELECT SUM(ore) as s FROM players').get().s || 0;
  const shielded = db.db.prepare("SELECT COUNT(*) as c FROM players WHERE shield_until > datetime('now')").get().c;
  const recentBattles = db.db.prepare("SELECT COUNT(*) as c FROM battle_replays WHERE created_at > datetime('now', '-1 hour')").get().c;
  const topPlayers = db.db.prepare('SELECT name, trophies, gold, wood, ore, dex FROM players ORDER BY trophies DESC LIMIT 10').all();

  // DEX breakdown — aggregate by players.dex so we can show Pacifica vs
  // Avantis adoption / volume / gold distribution side by side. Guarded
  // against an empty trading_rewards table on fresh DBs.
  const byDex = db.db.prepare(`
    SELECT COALESCE(dex, 'unknown') AS dex, COUNT(*) AS n
    FROM players GROUP BY dex
  `).all();

  // Futures UI mode breakdown — Pro vs Basic vs not-yet-picked. Mirrors
  // the byDex shape so the admin UI can render it the same way.
  let byUiMode = [];
  try {
    byUiMode = db.db.prepare(`
      SELECT COALESCE(futures_mode, 'none') AS mode, COUNT(*) AS n
      FROM players GROUP BY futures_mode
    `).all();
  } catch { /* futures_mode column may not exist on a very old DB */ }
  let rewardsByDex = [];
  try {
    rewardsByDex = db.db.prepare(`
      SELECT COALESCE(r.dex, 'unknown') AS dex,
             COUNT(r.player_id) AS traders,
             COALESCE(SUM(r.total_gold), 0) AS total_gold,
             COALESCE(SUM(r.total_volume), 0) AS total_volume
      FROM trading_rewards r
      LEFT JOIN players p ON p.id = r.player_id
      GROUP BY r.dex
    `).all();
  } catch { /* trading_rewards missing */ }

  // Per-DEX trade activity from server-futures.trade_history. We compute
  // the same shape (total_trades / active_traders / total_volume /
  // trades_24h) for every DEX whose worker indexes into the futures DB.
  // Pacifica is intentionally absent from this set — it's custodial and
  // the futures worker doesn't index its trades the same way; Pacifica
  // activity comes through the on-chain Solana RPC path elsewhere.
  const ACTIVITY_DEXES = ['avantis', 'decibel', 'gmx', 'monad', 'phoenix', 'hyperliquid', 'risex', 'nado', 'hibachi', 'hotstuff', 'grvt', 'katana', 'gmtrade'];
  const dexActivity = {};   // { avantis: {...}, decibel: {...}, gmx: {...} }
  const dexTop = {};        // { avantis: [...], decibel: [...], gmx: [...] }
  const futuresByPlayer = new Map();
  let grvtBuilderStats = null;
  try {
    const fdb = futuresDbReadonly();
    if (fdb) {
      const sourceWhereForDex = (dex) => dex === 'monad'
        ? "verified_source IN ('perpl_api', 'perpl_ws')"
        : dex === 'hyperliquid'
          ? "verified_source = 'hyperliquid_api'"
        : dex === 'risex'
          ? "verified_source = 'risex_api'"
          : dex === 'nado'
            ? "verified_source = 'nado_api'"
          : dex === 'hibachi'
            ? "verified_source = 'hibachi_api'"
          : dex === 'hotstuff'
            ? "verified_source = 'hotstuff_api'"
          : dex === 'grvt'
            ? "verified_source = 'grvt_builder'"
          : dex === 'katana'
            ? "verified_source = 'katana_api'"
          : dex === 'gmtrade'
            ? "verified_source = 'gmtrade_tx'"
          : dex === 'decibel'
          ? "verified_source = 'decibel_fill'"
        : dex === 'phoenix'
          ? "verified_source IN ('worker', 'tx')"
          : "verified_source = 'worker'";
      const nameLookup = db.db.prepare('SELECT name, wallet FROM players WHERE id = ?');
      for (const dex of ACTIVITY_DEXES) {
        const sourceWhere = sourceWhereForDex(dex);
        const totals = fdb.prepare(`
          SELECT COUNT(*) AS trades,
                 COUNT(DISTINCT player_id) AS traders,
                 COALESCE(SUM(notional_usd), 0) AS volume
          FROM trade_history WHERE dex = ? AND status = 'filled' AND ${sourceWhere}
        `);
        const recent = fdb.prepare(`
          SELECT COUNT(*) AS trades FROM trade_history
          WHERE dex = ? AND status = 'filled' AND ${sourceWhere}
            AND created_at > datetime('now', '-24 hours')
        `);
        const top = fdb.prepare(`
          SELECT player_id, COALESCE(SUM(notional_usd), 0) AS vol, COUNT(*) AS trades
          FROM trade_history WHERE dex = ? AND status = 'filled' AND ${sourceWhere}
          GROUP BY player_id ORDER BY vol DESC LIMIT 10
        `);
        const tot = totals.get(dex) || {};
        const rec = recent.get(dex) || {};
        dexActivity[dex] = {
          total_trades: tot.trades || 0,
          active_traders: tot.traders || 0,
          total_volume: tot.volume || 0,
          trades_24h: rec.trades || 0,
        };
        const raw = top.all(dex);
        dexTop[dex] = raw.map(r => {
          const p = nameLookup.get(r.player_id) || {};
          return {
            player_id: r.player_id,
            name: p.name || '?',
            wallet: p.wallet || '',
            volume: r.vol,
            trades: r.trades,
          };
        });
        const perPlayer = fdb.prepare(`
          SELECT player_id, COALESCE(SUM(notional_usd), 0) AS volume, COUNT(*) AS trades
          FROM trade_history WHERE dex = ? AND status = 'filled' AND ${sourceWhere}
          GROUP BY player_id
        `).all(dex);
        for (const row of perPlayer) {
          if (!row.player_id) continue;
          const existing = futuresByPlayer.get(row.player_id) || { volume_usd: 0, trades_count: 0, by_dex: {} };
          const volume = Number(row.volume || 0);
          const trades = Number(row.trades || 0);
          existing.volume_usd += volume;
          existing.trades_count += trades;
          existing.by_dex[dex] = {
            volume_usd: Number(volume.toFixed(2)),
            trades_count: trades,
          };
          futuresByPlayer.set(row.player_id, existing);
        }
      }
      try {
        const grvt = require('../server-futures/grvt');
        const builderConfig = grvt.getBuilderConfig();
        const feeBps = Number(builderConfig.feeBps || 0) || 0;
        const tradeHistoryColumns = fdb.prepare("PRAGMA table_info(trade_history)").all();
        const hasFeeColumn = tradeHistoryColumns
          .some(col => col && col.name === 'fee');
        const hasProofColumn = tradeHistoryColumns
          .some(col => col && col.name === 'proof_json');
        const feeValue = hasFeeColumn
          ? "CAST(COALESCE(NULLIF(fee, ''), '0') AS REAL)"
          : "0";
        const feeExpr = `CASE
          WHEN ${feeValue} > 0
            THEN ${feeValue}
          ELSE COALESCE(notional_usd, 0) * ? / 10000.0
        END`;
        const summary = fdb.prepare(`
          SELECT COUNT(*) AS fills,
                 COUNT(DISTINCT player_id) AS traders,
                 COALESCE(SUM(notional_usd), 0) AS volume,
                 COALESCE(SUM(${feeExpr}), 0) AS fee_usd,
                 COALESCE(SUM(CASE WHEN ${feeValue} > 0 THEN ${feeValue} ELSE 0 END), 0) AS actual_fee_usd,
                 COALESCE(SUM(CASE WHEN ${feeValue} > 0 THEN 0 ELSE COALESCE(notional_usd, 0) * ? / 10000.0 END), 0) AS estimated_fee_usd,
                 COALESCE(SUM(CASE WHEN created_at > datetime('now', '-24 hours') THEN ${feeExpr} ELSE 0 END), 0) AS fee_24h_usd,
                 COALESCE(SUM(CASE WHEN created_at > datetime('now', '-24 hours') THEN notional_usd ELSE 0 END), 0) AS volume_24h
          FROM trade_history
          WHERE dex = 'grvt' AND status = 'filled' AND verified_source = 'grvt_builder'
        `).get(feeBps, feeBps, feeBps) || {};
        const recent = fdb.prepare(`
          SELECT id, player_id, symbol, side, amount, price, notional_usd, fee, proof_json,
                 order_id, client_order_id, created_at
          FROM trade_history
          WHERE dex = 'grvt' AND status = 'filled' AND verified_source = 'grvt_builder'
          ORDER BY id DESC LIMIT 20
        `.replace(', fee,', hasFeeColumn ? ', fee,' : ", NULL AS fee,")
          .replace(', proof_json,', hasProofColumn ? ', proof_json,' : ", NULL AS proof_json,")).all().map(row => {
          const p = nameLookup.get(row.player_id) || {};
          const clientOrderId = String(row.client_order_id || '');
          const parts = clientOrderId.split(':');
          const subAccountId = parts.length >= 3 ? parts[1] : '';
          const actualFee = Number(row.fee || 0);
          const estimatedFee = Number(row.notional_usd || 0) * feeBps / 10000;
          let proofPayload = null;
          try { proofPayload = row.proof_json ? JSON.parse(row.proof_json) : null; } catch {}
          const rawFill = proofPayload && proofPayload.fill && typeof proofPayload.fill === 'object'
            ? proofPayload.fill
            : {};
          const onchainProof = proofPayload?.tx_hash
            || proofPayload?.transaction_hash
            || proofPayload?.transactionHash
            || rawFill.tx_hash
            || rawFill.transaction_hash
            || rawFill.transactionHash
            || rawFill.txHash
            || null;
          return {
            ...row,
            name: p.name || '?',
            wallet: p.wallet || '',
            sub_account_id: subAccountId,
            fee_usd: actualFee > 0 ? actualFee : estimatedFee,
            fee_source: actualFee > 0 ? 'grvt_fill_fee' : 'estimated_from_builder_bps',
            proof_source: 'GRVT builder fill history',
            onchain_proof: onchainProof,
            proof_json: row.proof_json || null,
            builder_account_id: builderConfig.accountId || null,
          };
        });
        grvtBuilderStats = {
          config: builderConfig,
          fills: summary.fills || 0,
          traders: summary.traders || 0,
          volume_usd: summary.volume || 0,
          volume_24h_usd: summary.volume_24h || 0,
          fee_usd: summary.fee_usd || 0,
          fee_24h_usd: summary.fee_24h_usd || 0,
          actual_fee_usd: summary.actual_fee_usd || 0,
          estimated_fee_usd: summary.estimated_fee_usd || 0,
          recent_proofs: recent,
          proof_note: 'Rows are accepted only when verified_source=grvt_builder from GRVT builder fill history. If GRVT returns an on-chain transaction hash in the raw fill, it is exposed as onchain_proof; otherwise client_order_id/order_id/sub_account_id plus stored proof_json are the audit keys.',
        };
      } catch (e) {
        grvtBuilderStats = { error: e.message || 'GRVT builder stats unavailable' };
      }
    }
  } catch { /* futures unavailable */ }

  // Active-player counters from the heartbeat column. "Online now" =
  // last_seen within the past 5 minutes (matches how the auth middleware
  // throttles bumps to once per 60s — at 5 min the worst-case staleness
  // is ~6 min, plenty for live admin oversight). 24h / 7d are the
  // standard MAU-style retention buckets.
  const activeQ = db.db.prepare(`
    SELECT
      COUNT(CASE WHEN last_seen_at > datetime('now', '-5 minutes')  THEN 1 END) AS online_now,
      COUNT(CASE WHEN last_seen_at > datetime('now', '-24 hours')   THEN 1 END) AS active_24h,
      COUNT(CASE WHEN last_seen_at > datetime('now', '-7 days')     THEN 1 END) AS active_7d,
      COUNT(CASE WHEN last_seen_at > datetime('now', '-30 days')    THEN 1 END) AS active_30d
    FROM players WHERE last_seen_at IS NOT NULL
  `).get();

  // Same buckets sliced by DEX so the panel can show "active Pacifica
  // players today" vs "active GMX players today" and we can spot when a
  // newly-added DEX is actually getting traction.
  const activeByDex = db.db.prepare(`
    SELECT COALESCE(dex, 'unknown') AS dex,
      COUNT(CASE WHEN last_seen_at > datetime('now', '-5 minutes')  THEN 1 END) AS online_now,
      COUNT(CASE WHEN last_seen_at > datetime('now', '-24 hours')   THEN 1 END) AS active_24h,
      COUNT(CASE WHEN last_seen_at > datetime('now', '-7 days')     THEN 1 END) AS active_7d
    FROM players WHERE last_seen_at IS NOT NULL
    GROUP BY dex
  `).all();
  const combatStats = buildAdminCombatStats();
  const growthFunnelStats = buildAdminGrowthFunnelStats({ playerCount, activeQ });
  const telemetryStats = buildAdminTelemetryStats();

  const mcpSummaryFor = (whereSql) => db.db.prepare(`
    SELECT COUNT(*) AS total,
           COALESCE(SUM(CASE WHEN status = 'ok' THEN 1 ELSE 0 END), 0) AS ok,
           COALESCE(SUM(CASE WHEN status != 'ok' THEN 1 ELSE 0 END), 0) AS errors,
           COUNT(DISTINCT player_id) AS unique_players,
           COALESCE(SUM(CASE WHEN tool = 'execute_ai_attack_plan' AND status = 'ok' THEN 1 ELSE 0 END), 0) AS ai_battles,
           ROUND(COALESCE(AVG(duration_ms), 0), 1) AS avg_duration_ms,
           COALESCE(MAX(duration_ms), 0) AS max_duration_ms,
           MAX(created_at) AS latest_at
    FROM mcp_events
    ${whereSql}
  `).get() || {};

  const mcpPopularTools = db.db.prepare(`
    SELECT tool,
           COUNT(*) AS total,
           COALESCE(SUM(CASE WHEN created_at > datetime('now', '-24 hours') THEN 1 ELSE 0 END), 0) AS day,
           COALESCE(SUM(CASE WHEN created_at > datetime('now', '-7 days') THEN 1 ELSE 0 END), 0) AS week,
           COALESCE(SUM(CASE WHEN status != 'ok' THEN 1 ELSE 0 END), 0) AS errors,
           ROUND(COALESCE(AVG(duration_ms), 0), 1) AS avg_duration_ms,
           COALESCE(MAX(duration_ms), 0) AS max_duration_ms,
           MAX(created_at) AS latest_at
    FROM mcp_events
    GROUP BY tool
    ORDER BY week DESC, total DESC, latest_at DESC
    LIMIT 20
  `).all();

  const mcpPopularErrors = db.db.prepare(`
    SELECT tool,
           status,
           COALESCE(NULLIF(error, ''), status) AS error,
           COUNT(*) AS total,
           COALESCE(SUM(CASE WHEN created_at > datetime('now', '-24 hours') THEN 1 ELSE 0 END), 0) AS day,
           COALESCE(SUM(CASE WHEN created_at > datetime('now', '-7 days') THEN 1 ELSE 0 END), 0) AS week,
           MAX(created_at) AS latest_at
    FROM mcp_events
    WHERE status != 'ok'
    GROUP BY tool, status, COALESCE(NULLIF(error, ''), status)
    ORDER BY week DESC, total DESC, latest_at DESC
    LIMIT 20
  `).all();

  const mcpRecent = db.db.prepare(`
    SELECT e.id, e.tool, e.status, e.duration_ms, e.error, e.ai_key_prefix,
           e.created_at, p.name AS player_name
    FROM mcp_events e
    LEFT JOIN players p ON p.id = e.player_id
    ORDER BY e.id DESC
    LIMIT 100
  `).all();

  const playerAnalytics = (() => {
    const now = Date.now();
    const dayMs = 24 * 60 * 60 * 1000;
    const sessionGapMs = 30 * 60 * 1000;
    const toMs = (value) => {
      if (!value) return 0;
      const t = new Date(String(value).replace(' ', 'T') + 'Z').getTime();
      return Number.isFinite(t) ? t : 0;
    };
    const dayKey = (ms) => new Date(ms).toISOString().slice(0, 10);
    const eventRows = [];
    try {
      eventRows.push(...db.db.prepare(`
        SELECT player_id, created_at, event_type AS action, source
        FROM player_activity_events
        WHERE created_at > datetime('now', '-30 days')
      `).all());
    } catch {}
    try {
      eventRows.push(...db.db.prepare(`
        SELECT player_id, created_at, COALESCE(NULLIF(source, ''), level, 'client_log') AS action, 'client_log' AS source
        FROM client_logs
        WHERE player_id IS NOT NULL AND created_at > datetime('now', '-30 days')
      `).all());
    } catch {}

    const eventsByPlayer = new Map();
    const activeDays7 = new Map();
    const activeDays30 = new Map();
    const activePlayersByDay7 = new Map();
    const activePlayersByDay30 = new Map();
    const actionCounts = new Map();
    for (const row of eventRows) {
      const ms = toMs(row.created_at);
      if (!row.player_id || !ms) continue;
      if (!eventsByPlayer.has(row.player_id)) eventsByPlayer.set(row.player_id, []);
      eventsByPlayer.get(row.player_id).push({ ...row, ms });

      const age = now - ms;
      const d = dayKey(ms);
      if (age <= 30 * dayMs) {
        if (!activeDays30.has(row.player_id)) activeDays30.set(row.player_id, new Set());
        activeDays30.get(row.player_id).add(d);
        if (!activePlayersByDay30.has(d)) activePlayersByDay30.set(d, new Set());
        activePlayersByDay30.get(d).add(row.player_id);
      }
      if (age <= 7 * dayMs) {
        if (!activeDays7.has(row.player_id)) activeDays7.set(row.player_id, new Set());
        activeDays7.get(row.player_id).add(d);
        if (!activePlayersByDay7.has(d)) activePlayersByDay7.set(d, new Set());
        activePlayersByDay7.get(d).add(row.player_id);
        const key = String(row.action || row.source || 'activity').slice(0, 80);
        actionCounts.set(key, (actionCounts.get(key) || 0) + 1);
      }
    }

    const sessionsByPlayer = new Map();
    const allSessions = [];
    for (const [playerId, rows] of eventsByPlayer.entries()) {
      rows.sort((a, b) => a.ms - b.ms);
      const sessions = [];
      let start = 0;
      let end = 0;
      let events = 0;
      for (const row of rows) {
        if (!start || row.ms - end > sessionGapMs) {
          if (start) sessions.push({ start, end, events, durationMs: Math.max(0, end - start) });
          start = row.ms;
          events = 0;
        }
        end = row.ms;
        events += 1;
      }
      if (start) sessions.push({ start, end, events, durationMs: Math.max(0, end - start) });
      sessionsByPlayer.set(playerId, sessions);
      allSessions.push(...sessions);
    }

    const activeAvg = (map, days) => {
      let total = 0;
      for (let i = 0; i < days; i += 1) {
        total += map.get(dayKey(now - i * dayMs))?.size || 0;
      }
      return Math.round((total / days) * 10) / 10;
    };
    const avgDurationMin = (sessions) => {
      const withDuration = sessions.filter(s => s.durationMs > 0);
      if (!withDuration.length) return 0;
      const avg = withDuration.reduce((sum, s) => sum + s.durationMs, 0) / withDuration.length;
      return Math.round((avg / 60000) * 10) / 10;
    };

    const thRows = db.db.prepare(`
      WITH player_th AS (
        SELECT p.id, COALESCE(MAX(CASE WHEN b.type = 'town_hall' THEN b.level END), 1) AS th_level
        FROM players p
        LEFT JOIN buildings b ON b.player_id = p.id
        GROUP BY p.id
      ),
      total AS (SELECT COUNT(*) AS n FROM player_th)
      SELECT th_level,
             COUNT(*) AS players,
             ROUND(COUNT(*) * 100.0 / NULLIF((SELECT n FROM total), 0), 1) AS pct
      FROM player_th
      GROUP BY th_level
      ORDER BY th_level
    `).all();
    const thAvgRow = db.db.prepare(`
      WITH player_th AS (
        SELECT p.id, COALESCE(MAX(CASE WHEN b.type = 'town_hall' THEN b.level END), 1) AS th_level
        FROM players p
        LEFT JOIN buildings b ON b.player_id = p.id
        GROUP BY p.id
      )
      SELECT ROUND(AVG(th_level), 2) AS avg_th FROM player_th
    `).get() || {};

    const battleRows = db.db.prepare(`
      SELECT attacker_id AS player_id,
             COUNT(*) AS battles_7d,
             COALESCE(SUM(CASE WHEN verified_result = 'accepted' THEN 1 ELSE 0 END), 0) AS accepted_7d
      FROM battle_replays
      WHERE created_at > datetime('now', '-7 days')
      GROUP BY attacker_id
    `).all();
    const battlesByPlayer = new Map(battleRows.map(r => [r.player_id, r]));
    const playerRowsAll = db.db.prepare(`
      SELECT p.id, p.name, p.dex, p.last_seen_at,
             COALESCE(MAX(CASE WHEN b.type = 'town_hall' THEN b.level END), 1) AS th_level,
             COUNT(b.id) AS buildings_count
      FROM players p
      LEFT JOIN buildings b ON b.player_id = p.id
      GROUP BY p.id
      ORDER BY p.last_seen_at DESC
    `).all().map((p) => {
      const sessions = sessionsByPlayer.get(p.id) || [];
      const evs = eventsByPlayer.get(p.id) || [];
      const latest = evs.length ? evs[evs.length - 1] : null;
      const b = battlesByPlayer.get(p.id) || {};
      const futures = futuresByPlayer.get(p.id) || { volume_usd: 0, trades_count: 0, by_dex: {} };
      return {
        id: p.id,
        name: p.name,
        dex: p.dex || 'unknown',
        th_level: p.th_level || 1,
        buildings_count: p.buildings_count || 0,
        active_days_7d: activeDays7.get(p.id)?.size || 0,
        active_days_30d: activeDays30.get(p.id)?.size || 0,
        sessions_7d: sessions.filter(s => now - s.start <= 7 * dayMs).length,
        avg_session_min_7d: avgDurationMin(sessions.filter(s => now - s.start <= 7 * dayMs)),
        events_7d: evs.filter(e => now - e.ms <= 7 * dayMs).length,
        battles_7d: b.battles_7d || 0,
        accepted_battles_7d: b.accepted_7d || 0,
        futures_volume_usd: Number((Number(futures.volume_usd) || 0).toFixed(2)),
        futures_trades_count: Number(futures.trades_count) || 0,
        futures_by_dex: futures.by_dex || {},
        last_seen_at: p.last_seen_at,
        last_action_at: latest?.created_at || p.last_seen_at || null,
        last_action: latest?.action || null,
      };
    });

    return {
      summary: {
        avg_daily_active_7d: activeAvg(activePlayersByDay7, 7),
        avg_daily_active_30d: activeAvg(activePlayersByDay30, 30),
        sessions_7d: allSessions.filter(s => now - s.start <= 7 * dayMs).length,
        avg_session_min_7d: avgDurationMin(allSessions.filter(s => now - s.start <= 7 * dayMs)),
        observed_events_7d: eventRows.filter(r => {
          const ms = toMs(r.created_at);
          return ms && now - ms <= 7 * dayMs;
        }).length,
        note: 'Session length is estimated from heartbeat/client-log events; a new session starts after 30 minutes of inactivity.',
      },
      town_hall: {
        average: thAvgRow.avg_th || 0,
        distribution: thRows,
      },
      actions: Array.from(actionCounts.entries())
        .map(([action, count]) => ({ action, count }))
        .sort((a, b) => b.count - a.count)
        .slice(0, 20),
      players: playerRowsAll.slice(0, 200),
      players_export: playerRowsAll,
    };
  })();

  res.json({
    players: playerCount, buildings: buildingCount, replays: replayCount,
    accepted, rejected, shielded, recentBattles,
    economy: { totalGold, totalWood, totalOre },
    topPlayers,
    activity: {
      online_now: activeQ?.online_now || 0,
      active_24h: activeQ?.active_24h || 0,
      active_7d:  activeQ?.active_7d  || 0,
      active_30d: activeQ?.active_30d || 0,
      by_dex: activeByDex,
    },
    dex: {
      players_by_dex: byDex,
      rewards_by_dex: rewardsByDex,
      // New unified shape: per-DEX activity + top traders. Old
      // `avantis_activity` / `avantis_top` kept as aliases for one release
      // so the deployed admin panel doesn't blank out mid-deploy.
      activity_by_dex: dexActivity,
      top_by_dex: dexTop,
      grvt_builder: grvtBuilderStats,
      avantis_activity: dexActivity.avantis || null,
      avantis_top: dexTop.avantis || [],
    },
    ui_modes: byUiMode,
    devices: buildDeviceStats(),
    combat: combatStats,
    growth_funnel: growthFunnelStats,
    telemetry: telemetryStats,
    mcp: {
      summary: {
        day: mcpSummaryFor("WHERE created_at > datetime('now', '-24 hours')"),
        week: mcpSummaryFor("WHERE created_at > datetime('now', '-7 days')"),
        all: mcpSummaryFor(''),
      },
      popular_tools: mcpPopularTools,
      popular_errors: mcpPopularErrors,
      recent: mcpRecent,
    },
    player_analytics: playerAnalytics,
    uptime: Math.floor(process.uptime()),
    memory: Math.round(process.memoryUsage().rss / 1024 / 1024),
  });
});

// ---------- Admin: Tasks CRUD ----------
router.get('/admin/tasks', adminAuth, (req, res) => {
  const list = tasks.getAllTasks();
  // Per-task aggregate stats
  const startedRows = db.db.prepare(
    `SELECT task_id, COUNT(*) AS n FROM player_tasks GROUP BY task_id`
  ).all();
  const claimedRows = db.db.prepare(
    `SELECT task_id, COUNT(*) AS n FROM player_tasks WHERE claimed_at IS NOT NULL GROUP BY task_id`
  ).all();
  const progressRows = db.db.prepare(
    `SELECT task_id, AVG(CASE WHEN target_value > 0 THEN progress_value / target_value ELSE 0 END) AS avg_progress,
            MAX(claimed_at) AS last_claim, MAX(started_at) AS last_start
     FROM player_tasks GROUP BY task_id`
  ).all();
  const startedMap = {}; for (const r of startedRows) startedMap[r.task_id] = r.n;
  const claimedMap = {}; for (const r of claimedRows) claimedMap[r.task_id] = r.n;
  const progMap = {}; for (const r of progressRows) progMap[r.task_id] = r;
  res.json(list.map(t => {
    const p = progMap[t.id] || {};
    const started = startedMap[t.id] || 0;
    const claimed = claimedMap[t.id] || 0;
    return {
      ...t,
      params: tasks.parseParams(t.params),
      started_count: started,
      claimed_count: claimed,
      completion_rate: started > 0 ? claimed / started : 0,
      avg_progress: p.avg_progress || 0,
      last_claim: p.last_claim || null,
      last_start: p.last_start || null,
    };
  }));
});

// Overall quest system stats — for the big summary card
router.get('/admin/tasks-summary', adminAuth, (req, res) => {
  const total = db.db.prepare('SELECT COUNT(*) AS n FROM tasks').get().n;
  const active = db.db.prepare('SELECT COUNT(*) AS n FROM tasks WHERE active = 1').get().n;
  const started = db.db.prepare('SELECT COUNT(*) AS n FROM player_tasks').get().n;
  const claimed = db.db.prepare('SELECT COUNT(*) AS n FROM player_tasks WHERE claimed_at IS NOT NULL').get().n;
  const uniquePlayers = db.db.prepare('SELECT COUNT(DISTINCT player_id) AS n FROM player_tasks').get().n;
  const claimers = db.db.prepare('SELECT COUNT(DISTINCT player_id) AS n FROM player_tasks WHERE claimed_at IS NOT NULL').get().n;
  // Rewards paid — sum reward_* for each claimed (player_tasks, task)
  const rewardRow = db.db.prepare(`
    SELECT COALESCE(SUM(t.reward_gold),0) AS gold,
           COALESCE(SUM(t.reward_wood),0) AS wood,
           COALESCE(SUM(t.reward_ore),0)  AS ore
    FROM player_tasks pt
    JOIN tasks t ON t.id = pt.task_id
    WHERE pt.claimed_at IS NOT NULL
  `).get();
  // Recent activity — last 24h
  const cutoff24 = new Date(Date.now() - 24 * 3600 * 1000).toISOString().replace('T', ' ').split('.')[0];
  const started24 = db.db.prepare('SELECT COUNT(*) AS n FROM player_tasks WHERE started_at >= ?').get(cutoff24).n;
  const claimed24 = db.db.prepare('SELECT COUNT(*) AS n FROM player_tasks WHERE claimed_at >= ?').get(cutoff24).n;
  // Top 5 players by claims
  const topPlayers = db.db.prepare(`
    SELECT p.name, COUNT(*) AS claims,
           COALESCE(SUM(t.reward_gold),0) AS gold_earned
    FROM player_tasks pt
    JOIN tasks t   ON t.id = pt.task_id
    JOIN players p ON p.id = pt.player_id
    WHERE pt.claimed_at IS NOT NULL
    GROUP BY pt.player_id
    ORDER BY claims DESC, gold_earned DESC
    LIMIT 5
  `).all();
  // Breakdown by task type
  const byType = db.db.prepare(`
    SELECT t.type, COUNT(pt.task_id) AS claims
    FROM tasks t
    LEFT JOIN player_tasks pt ON pt.task_id = t.id AND pt.claimed_at IS NOT NULL
    GROUP BY t.type
  `).all();
  res.json({
    total, active,
    started, claimed,
    unique_players_started: uniquePlayers,
    unique_players_claimed: claimers,
    completion_rate: started > 0 ? claimed / started : 0,
    rewards: rewardRow,
    last_24h: { started: started24, claimed: claimed24 },
    top_players: topPlayers,
    by_type: byType,
  });
});

// Per-task player breakdown: who started, who claimed, progress, last claim time
router.get('/admin/tasks/:id/players', adminAuth, (req, res) => {
  const id = parseInt(req.params.id, 10);
  if (!Number.isFinite(id)) return res.status(400).json({ error: 'bad id' });
  const task = tasks.getTaskById(id);
  if (!task) return res.status(404).json({ error: 'not found' });
  const rows = db.db.prepare(`
    SELECT pt.player_id, pt.progress_value, pt.target_value,
           pt.started_at, pt.claimed_at, p.name AS player_name, p.wallet
    FROM player_tasks pt
    LEFT JOIN players p ON p.id = pt.player_id
    WHERE pt.task_id = ?
    ORDER BY (pt.claimed_at IS NOT NULL) DESC, pt.started_at DESC
  `).all(id);
  res.json({
    task: { id: task.id, title: task.title, type: task.type, repeatable: !!task.repeatable },
    players: rows,
    started: rows.length,
    claimed: rows.filter(r => r.claimed_at).length,
  });
});

router.post('/admin/tasks', adminAuth, (req, res) => {
  const b = req.body || {};
  if (!tasks.VALID_TYPES.includes(b.type)) return res.status(400).json({ error: 'bad type' });
  if (!b.title || typeof b.title !== 'string') return res.status(400).json({ error: 'title required' });
  const params = typeof b.params === 'object' && b.params !== null ? b.params : {};
  if (params.side && !tasks.VALID_SIDES.includes(params.side)) return res.status(400).json({ error: 'bad side' });
  const r = db.db.prepare(
    `INSERT INTO tasks (type, title, description, params, reward_gold, reward_wood, reward_ore, active, repeatable, cooldown_hours, sort_order)
     VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`
  ).run(
    b.type,
    b.title.trim(),
    b.description || '',
    JSON.stringify(params),
    Number(b.reward_gold) || 0,
    Number(b.reward_wood) || 0,
    Number(b.reward_ore) || 0,
    b.active === false ? 0 : 1,
    b.repeatable ? 1 : 0,
    Number(b.cooldown_hours) || 0,
    Number(b.sort_order) || 0,
  );
  res.json({ id: r.lastInsertRowid });
});

router.patch('/admin/tasks/:id', adminAuth, (req, res) => {
  const id = parseInt(req.params.id, 10);
  if (!Number.isFinite(id)) return res.status(400).json({ error: 'bad id' });
  const b = req.body || {};
  const existing = tasks.getTaskById(id);
  if (!existing) return res.status(404).json({ error: 'not found' });
  const params = b.params && typeof b.params === 'object' ? b.params : tasks.parseParams(existing.params);
  const merged = {
    type: tasks.VALID_TYPES.includes(b.type) ? b.type : existing.type,
    title: b.title != null ? String(b.title).trim() : existing.title,
    description: b.description != null ? String(b.description) : existing.description,
    params: JSON.stringify(params),
    reward_gold: b.reward_gold != null ? Number(b.reward_gold) : existing.reward_gold,
    reward_wood: b.reward_wood != null ? Number(b.reward_wood) : existing.reward_wood,
    reward_ore: b.reward_ore != null ? Number(b.reward_ore) : existing.reward_ore,
    active: b.active != null ? (b.active ? 1 : 0) : existing.active,
    repeatable: b.repeatable != null ? (b.repeatable ? 1 : 0) : existing.repeatable,
    cooldown_hours: b.cooldown_hours != null ? Number(b.cooldown_hours) : existing.cooldown_hours,
    sort_order: b.sort_order != null ? Number(b.sort_order) : existing.sort_order,
  };
  db.db.prepare(
    `UPDATE tasks SET type = ?, title = ?, description = ?, params = ?, reward_gold = ?, reward_wood = ?, reward_ore = ?, active = ?, repeatable = ?, cooldown_hours = ?, sort_order = ? WHERE id = ?`
  ).run(merged.type, merged.title, merged.description, merged.params, merged.reward_gold, merged.reward_wood, merged.reward_ore, merged.active, merged.repeatable, merged.cooldown_hours, merged.sort_order, id);
  res.json({ ok: true });
});

// Reset all player progress for a task (deletes player_tasks rows; keeps task itself)
router.post('/admin/tasks/:id/reset-progress', adminAuth, (req, res) => {
  const id = parseInt(req.params.id, 10);
  if (!Number.isFinite(id)) return res.status(400).json({ error: 'bad id' });
  const r = db.db.prepare('DELETE FROM player_tasks WHERE task_id = ?').run(id);
  res.json({ ok: true, removed: r.changes });
});

router.delete('/admin/tasks/:id', adminAuth, (req, res) => {
  const id = parseInt(req.params.id, 10);
  if (!Number.isFinite(id)) return res.status(400).json({ error: 'bad id' });
  db.db.prepare('DELETE FROM player_tasks WHERE task_id = ?').run(id);
  db.db.prepare('DELETE FROM tasks WHERE id = ?').run(id);
  res.json({ ok: true });
});

// Wipe entire database
router.post('/admin/wipe', adminAuth, (req, res) => {
  db.db.prepare('DELETE FROM buildings').run();
  db.db.prepare('DELETE FROM troop_levels').run();
  db.db.prepare('DELETE FROM players').run();
  res.json({ wiped: true });
});

// ==================== TOURNAMENTS ====================
//
// Tournaments are admin-curated competitions scoped to one DEX, selected
// DEXes, or all DEXes. Players can join when their current DEX is eligible.
// While joined:
//   - Trophies earned from battles are routed into tournament_participants
//     (with optional trophy_boost). Per tournament, admins choose whether
//     players.trophies stays frozen or also receives the raw battle delta.
//   - Gold earned from /claim-gold is multiplied by gold_boost. Seeker/Saga
//     players can receive an extra seeker_gold_boost. The boosted amount lands
//     in both players.gold and tournament_participants.gold.
//   - Volume + pnl + trades_count are tracked in tournament_participants
//     for the leaderboard.
// Tournament scope is enforced by getActiveTournamentForPlayer and explicitly
// checked at /join time.

function nowSql() {
  return new Date().toISOString().replace('T', ' ').slice(0, 19);
}

function cleanSqlDate(v) {
  if (v === null || v === undefined) return null;
  const s = String(v).trim();
  if (!s) return null;
  return s
    .replace(/[zZ]$/, '')
    .replace(/\s*UTC$/i, '')
    .replace('T', ' ')
    .trim();
}

function normalizeTournamentDate(v, fieldName, { nullable = true } = {}) {
  const s = cleanSqlDate(v);
  if (!s) {
    if (nullable) return null;
    throw new Error(`${fieldName} required`);
  }
  const withSeconds = /^\d{4}-\d{2}-\d{2} \d{2}:\d{2}$/.test(s) ? `${s}:00` : s;
  if (!/^\d{4}-\d{2}-\d{2} \d{2}:\d{2}:\d{2}$/.test(withSeconds)) {
    throw new Error(`${fieldName} must be YYYY-MM-DD HH:mm:ss UTC`);
  }
  return withSeconds;
}

function parseBool(v) {
  return v === true || v === 1 || v === '1' || String(v).toLowerCase() === 'true';
}

const TOURNAMENT_POINTS_SORT = 'points';
const TOURNAMENT_COMBINED_SORT = 'volume_trophies_50_50';
const TOURNAMENT_SORT_KEYS = ['pnl_usd', 'trophies', 'volume_usd', 'gold', TOURNAMENT_POINTS_SORT, TOURNAMENT_COMBINED_SORT];
const TOURNAMENT_DEXES = ['pacifica', 'avantis', 'decibel', 'gmx', 'monad', 'phoenix', 'hyperliquid', 'risex', 'nado', 'hibachi', 'hotstuff', 'grvt', 'katana', 'gmtrade'];
const TOURNAMENT_DEX_LABELS = {
  pacifica: 'Pacifica',
  avantis: 'Avantis',
  decibel: 'Decibel',
  gmx: 'GMX',
  monad: 'Perpl',
  phoenix: 'Phoenix',
  hyperliquid: 'Hyperliquid',
  risex: 'RISEx',
  nado: 'Nado',
  hibachi: 'Hibachi',
  hotstuff: 'Hotstuff',
  grvt: 'GRVT',
  katana: 'Katana Perps',
  gmtrade: 'GMTrade',
};
const TOURNAMENT_MODES = ['individual', 'dex_vs_dex'];
const TOURNAMENT_TEAM_PRIZE_MODES = ['winner_takes_all', 'custom_split'];
const TOURNAMENT_ATTACK_MATCH_POLICIES = ['all', 'enemy_or_non_participant', 'enemy_only'];
const TOURNAMENT_SCORING_MODES = ['live', 'daily_pool'];
const TOURNAMENT_TEAM_METRIC_KEYS = ['volume_usd', 'pnl_usd', 'trades_count', 'trophies', 'gold', TOURNAMENT_POINTS_SORT];
const TOURNAMENT_TEAM_METRIC_LABELS = {
  volume_usd: 'Volume',
  pnl_usd: 'Positive PnL',
  trades_count: 'Trades',
  trophies: 'Trophies',
  gold: 'Gold',
  [TOURNAMENT_POINTS_SORT]: 'Custom points',
};
const TOURNAMENT_ATTACK_MATCH_POLICY_LABELS = {
  all: 'Normal matchmaking',
  enemy_or_non_participant: 'Block same-team attacks',
  enemy_only: 'Enemy teams only',
};
const DEFAULT_TOURNAMENT_POINT_WEIGHTS = { trophies: 20, volume: 60, pnl: 20 };
const DEFAULT_TOURNAMENT_PRIZE_CURRENCY = 'USD';
const TOURNAMENT_SQL_SORT_COLS = {
  pnl_usd: 'tp.pnl_usd',
  trophies: 'tp.trophies',
  volume_usd: 'tp.volume_usd',
  gold: 'tp.gold',
};

function normalizeTournamentSort(sortBy, fallback = 'pnl_usd') {
  return TOURNAMENT_SORT_KEYS.includes(sortBy) ? sortBy : fallback;
}

function normalizeTournamentDexList(input) {
  let raw = input;
  if (typeof raw === 'string') {
    const trimmed = raw.trim();
    if (!trimmed) return [];
    try { raw = JSON.parse(trimmed); }
    catch { raw = trimmed.split(',').map(s => s.trim()); }
  }
  if (!Array.isArray(raw)) return [];
  const out = [];
  for (const item of raw) {
    const dex = String(item || '').trim().toLowerCase();
    if (dex === 'all') return [...TOURNAMENT_DEXES];
    if (TOURNAMENT_DEXES.includes(dex) && !out.includes(dex)) out.push(dex);
  }
  return out;
}

function tournamentEligibleDexes(t) {
  const scope = String(t?.dex_scope || 'single').toLowerCase();
  if (scope === 'all') return [...TOURNAMENT_DEXES];
  const list = normalizeTournamentDexList(t?.eligible_dexes);
  if (list.length > 0) return list;
  const dex = String(t?.dex || '').toLowerCase();
  return TOURNAMENT_DEXES.includes(dex) ? [dex] : ['pacifica'];
}

function tournamentDexScope(t) {
  const scope = String(t?.dex_scope || '').toLowerCase();
  if (scope === 'all') return 'all';
  const list = tournamentEligibleDexes(t);
  return list.length > 1 ? 'custom' : 'single';
}

function tournamentDexLabel(t) {
  const list = tournamentEligibleDexes(t);
  if (tournamentDexScope(t) === 'all' || list.length === TOURNAMENT_DEXES.length) return 'All DEXes';
  return list.map(d => TOURNAMENT_DEX_LABELS[d] || d).join(', ');
}

function isTournamentForDex(t, dex) {
  const normalizedDex = String(dex || '').toLowerCase();
  return TOURNAMENT_DEXES.includes(normalizedDex) && tournamentEligibleDexes(t).includes(normalizedDex);
}

function isTournamentSeekerOnly(t) {
  return Number(t?.seeker_only || 0) === 1;
}

function isSeekerPlayer(player) {
  return Number(player?.is_seeker || 0) === 1 || !!player?.seeker_id;
}

function tournamentAccessLabel(t) {
  return isTournamentSeekerOnly(t) ? 'Seeker only' : 'All eligible players';
}

function normalizeTournamentDexConfig(body = {}, fallback = null) {
  const rawScope = body.dex_scope ?? body.scope;
  let requestedScope = ['single', 'custom', 'all'].includes(String(rawScope || '').toLowerCase())
    ? String(rawScope).toLowerCase()
    : null;
  const hasListInput = body.eligible_dexes !== undefined || body.dexes !== undefined || body.dex_list !== undefined;
  let list = normalizeTournamentDexList(body.eligible_dexes ?? body.dexes ?? body.dex_list);
  const bodyDex = String(body.dex || '').trim().toLowerCase();

  if (bodyDex === 'all') requestedScope = 'all';
  if (requestedScope === 'all' || list.length === TOURNAMENT_DEXES.length) {
    return {
      dex: TOURNAMENT_DEXES[0],
      dex_scope: 'all',
      eligible_dexes: JSON.stringify(TOURNAMENT_DEXES),
    };
  }

  if (!hasListInput && !requestedScope && fallback) {
    list = tournamentEligibleDexes(fallback);
    requestedScope = tournamentDexScope(fallback);
  } else if (!list.length && TOURNAMENT_DEXES.includes(bodyDex)) {
    list = [bodyDex];
  }

  if (!list.length && fallback) list = tournamentEligibleDexes(fallback);
  if (!list.length) list = ['pacifica'];

  const dexScope = requestedScope === 'custom' || list.length > 1 ? 'custom' : 'single';
  return {
    dex: list[0],
    dex_scope: dexScope,
    eligible_dexes: JSON.stringify(list),
  };
}

function normalizeTournamentMode(v, fallback = 'individual') {
  const mode = String(v || fallback || 'individual').trim().toLowerCase();
  return TOURNAMENT_MODES.includes(mode) ? mode : 'individual';
}

function normalizeTournamentTeamMetric(v, fallback = 'volume_usd') {
  const metric = String(v || fallback || 'volume_usd').trim().toLowerCase();
  return TOURNAMENT_TEAM_METRIC_KEYS.includes(metric) ? metric : 'volume_usd';
}

function normalizeTournamentTeamPrizeMode(v, fallback = 'winner_takes_all') {
  const mode = String(v || fallback || 'winner_takes_all').trim().toLowerCase();
  return TOURNAMENT_TEAM_PRIZE_MODES.includes(mode) ? mode : 'winner_takes_all';
}

function normalizeTournamentAttackMatchPolicy(v, fallback = 'all') {
  const policy = String(v || fallback || 'all').trim().toLowerCase();
  return TOURNAMENT_ATTACK_MATCH_POLICIES.includes(policy) ? policy : 'all';
}

function normalizeTournamentScoringMode(v, fallback = 'live') {
  const mode = String(v || fallback || 'live').trim().toLowerCase();
  return TOURNAMENT_SCORING_MODES.includes(mode) ? mode : 'live';
}

function tournamentUsesDailyPool(t) {
  return normalizeTournamentScoringMode(t?.scoring_mode, 'live') === 'daily_pool';
}

function normalizeTournamentDailyPoolPoints(v, fallback = 1000) {
  const n = v === undefined || v === null || v === '' ? Number(fallback) : Number(v);
  if (!Number.isFinite(n) || n <= 0) return 1000;
  return Math.max(1, Math.min(1_000_000, Number(n.toFixed(4))));
}

function normalizeTournamentDailyPoolGrowthPct(v, fallback = 0) {
  const n = v === undefined || v === null || v === '' ? Number(fallback) : Number(v);
  if (!Number.isFinite(n)) return 0;
  return Math.max(-99, Math.min(500, Number(n.toFixed(4))));
}

function normalizeTournamentDailyPoolOverrides(input) {
  let raw = input;
  if (typeof raw === 'string') {
    const trimmed = raw.trim();
    if (!trimmed) raw = {};
    else {
      try { raw = JSON.parse(trimmed); }
      catch { throw new Error('daily_pool_overrides must be JSON object keyed by YYYY-MM-DD'); }
    }
  }
  if (raw === undefined || raw === null || raw === '') return {};
  if (!raw || typeof raw !== 'object' || Array.isArray(raw)) {
    throw new Error('daily_pool_overrides must be an object keyed by YYYY-MM-DD');
  }
  const out = {};
  for (const [day, points] of Object.entries(raw)) {
    const key = String(day || '').trim();
    if (!/^\d{4}-\d{2}-\d{2}$/.test(key)) {
      throw new Error('daily_pool_overrides keys must be YYYY-MM-DD');
    }
    if (points === undefined || points === null || points === '') continue;
    const numeric = Number(points);
    if (!Number.isFinite(numeric) || numeric <= 0) {
      throw new Error('daily_pool_overrides values must be positive point amounts');
    }
    out[key] = normalizeTournamentDailyPoolPoints(numeric, 1000);
  }
  return out;
}

function tournamentDailyPoolFirstDay(t) {
  const startMs = Date.parse(`${cleanSqlDate(t?.start_at)?.slice(0, 10) || ''}T00:00:00Z`);
  const enabledMs = Date.parse(`${cleanSqlDate(t?.daily_pool_enabled_at)?.slice(0, 10) || ''}T00:00:00Z`);
  const ms = Math.max(Number.isFinite(startMs) ? startMs : 0, Number.isFinite(enabledMs) ? enabledMs : 0);
  return new Date(ms || Date.now()).toISOString().slice(0, 10);
}

function tournamentDailyPoolDayIndex(t, dayInput) {
  const firstMs = Date.parse(`${tournamentDailyPoolFirstDay(t)}T00:00:00Z`);
  const dayMs = Date.parse(`${String(dayInput || '').slice(0, 10)}T00:00:00Z`);
  if (!Number.isFinite(firstMs) || !Number.isFinite(dayMs) || dayMs <= firstMs) return 0;
  return Math.max(0, Math.floor((dayMs - firstMs) / (24 * 60 * 60 * 1000)));
}

function tournamentDailyPoolPointsForDay(t, dayInput) {
  const day = /^\d{4}-\d{2}-\d{2}$/.test(String(dayInput || '')) ? String(dayInput) : tournamentUtcDayString();
  const base = normalizeTournamentDailyPoolPoints(t?.daily_pool_points, 1000);
  const growthPct = normalizeTournamentDailyPoolGrowthPct(t?.daily_pool_growth_pct, 0);
  let overrides = {};
  try { overrides = normalizeTournamentDailyPoolOverrides(t?.daily_pool_overrides); }
  catch { overrides = {}; }
  const dayIndex = tournamentDailyPoolDayIndex(t, day);
  if (overrides[day] !== undefined) {
    return { points: overrides[day], base, growth_pct: growthPct, day_index: dayIndex, override: true };
  }
  const points = normalizeTournamentDailyPoolPoints(base * Math.pow(1 + growthPct / 100, dayIndex), base);
  return { points, base, growth_pct: growthPct, day_index: dayIndex, override: false };
}

function normalizeTournamentShieldHours(v, fallback = null) {
  if (v === undefined) return fallback;
  if (v === null || v === '') return null;
  const n = Number(v);
  if (!Number.isFinite(n)) throw new Error('shield_hours must be a number of hours, blank, or 0');
  return Math.max(0, Math.min(720, Number(n.toFixed(4))));
}

function normalizeTournamentBoost(v, fallback = 1) {
  const n = v === undefined || v === null || v === '' ? Number(fallback) : Number(v);
  if (!Number.isFinite(n)) return 1;
  return Math.max(0.1, Math.min(10, Number(n.toFixed(4))));
}

function tournamentModeLabel(mode) {
  return normalizeTournamentMode(mode) === 'dex_vs_dex' ? 'DEX vs DEX' : 'Individual';
}

function tournamentMetricLabel(metric) {
  return TOURNAMENT_TEAM_METRIC_LABELS[normalizeTournamentTeamMetric(metric)] || 'Volume';
}

function tournamentAttackMatchPolicyLabel(policy) {
  return TOURNAMENT_ATTACK_MATCH_POLICY_LABELS[normalizeTournamentAttackMatchPolicy(policy)] || 'Normal matchmaking';
}

function normalizeTournamentTeamPrizeSplits(input, eligibleDexes = [], { strict = false } = {}) {
  let raw = input;
  if (typeof raw === 'string') {
    const trimmed = raw.trim();
    if (!trimmed) raw = [];
    else {
      try { raw = JSON.parse(trimmed); }
      catch {
        raw = trimmed.split(',').map((part) => {
          const [dex, share] = part.split(':');
          return { dex, share_pct: share };
        });
      }
    }
  }
  const eligible = new Set((eligibleDexes || []).filter(d => TOURNAMENT_DEXES.includes(d)));
  const entries = Array.isArray(raw)
    ? raw
    : (raw && typeof raw === 'object'
      ? Object.entries(raw).map(([dex, share]) => ({ dex, share_pct: share }))
      : []);
  const byDex = new Map();
  for (const entry of entries) {
    const dex = String(entry?.dex || entry?.team || '').trim().toLowerCase();
    if (!TOURNAMENT_DEXES.includes(dex) || (eligible.size && !eligible.has(dex))) continue;
    const share = sanitizePrizeNumber(entry?.share_pct ?? entry?.share ?? entry?.percent ?? entry?.pct);
    byDex.set(dex, { dex, share_pct: Math.min(100, share) });
  }
  const out = Array.from(byDex.values()).sort((a, b) => a.dex.localeCompare(b.dex));
  const total = out.reduce((s, r) => s + Number(r.share_pct || 0), 0);
  if (strict && Math.abs(total - 100) > 0.01) {
    throw new Error('DEX prize split shares must add up to 100');
  }
  return out;
}

function isTournamentPointsSort(sortBy) {
  return sortBy === TOURNAMENT_POINTS_SORT || sortBy === TOURNAMENT_COMBINED_SORT;
}

function fmtTournamentWeight(n) {
  const v = Number(n) || 0;
  return Number.isInteger(v) ? String(v) : v.toFixed(2).replace(/\.?0+$/, '');
}

function sanitizeTournamentWeight(v, fallback = 0) {
  if (v === undefined || v === null || v === '') return fallback;
  const n = Number(v);
  if (!Number.isFinite(n)) return fallback;
  return Math.max(0, Math.min(100, Number(n.toFixed(4))));
}

function tournamentPointWeights(tOrBody, fallback = DEFAULT_TOURNAMENT_POINT_WEIGHTS) {
  const sortBy = typeof tOrBody === 'string' ? tOrBody : normalizeTournamentSort(tOrBody?.sort_by, TOURNAMENT_POINTS_SORT);
  if (sortBy === TOURNAMENT_COMBINED_SORT) {
    return { trophies: 50, volume: 50, pnl: 0 };
  }
  const weights = {
    trophies: sanitizeTournamentWeight(tOrBody?.points_trophy_weight, fallback.trophies),
    volume: sanitizeTournamentWeight(tOrBody?.points_volume_weight, fallback.volume),
    pnl: sanitizeTournamentWeight(tOrBody?.points_pnl_weight, fallback.pnl),
  };
  const total = weights.trophies + weights.volume + weights.pnl;
  if (sortBy === TOURNAMENT_POINTS_SORT && total <= 0) {
    return { ...DEFAULT_TOURNAMENT_POINT_WEIGHTS };
  }
  return weights;
}

function normalizeTournamentPointWeights(input, fallback = DEFAULT_TOURNAMENT_POINT_WEIGHTS, { requireTotal = false } = {}) {
  const weights = tournamentPointWeights(input || {}, fallback);
  const total = weights.trophies + weights.volume + weights.pnl;
  if (requireTotal && Math.abs(total - 100) > 0.001) {
    throw new Error('point weights must add up to 100');
  }
  return weights;
}

function tournamentSortLabel(tOrSort) {
  const sortBy = typeof tOrSort === 'string' ? tOrSort : normalizeTournamentSort(tOrSort?.sort_by);
  if (typeof tOrSort === 'object' && tournamentUsesDailyPool(tOrSort)) {
    const w = tournamentPointWeights(tOrSort);
    const parts = [];
    if (Number(w.trophies) > 0) parts.push(`${fmtTournamentWeight(w.trophies)}% Trophies`);
    if (Number(w.volume) > 0) parts.push(`${fmtTournamentWeight(w.volume)}% Volume`);
    if (Number(w.pnl) > 0) parts.push(`${fmtTournamentWeight(w.pnl)}% PnL`);
    return `Daily pool (${parts.length ? parts.join(' / ') : 'no enabled metrics'})`;
  }
  switch (sortBy) {
    case 'trophies': return 'Trophies';
    case 'volume_usd': return 'Volume (USD)';
    case 'gold': return 'Gold';
    case TOURNAMENT_POINTS_SORT:
    case TOURNAMENT_COMBINED_SORT: {
      const w = tournamentPointWeights(tOrSort);
      const parts = [];
      if (Number(w.trophies) > 0) parts.push(`${fmtTournamentWeight(w.trophies)}% Trophies`);
      if (Number(w.volume) > 0) parts.push(`${fmtTournamentWeight(w.volume)}% Volume`);
      if (Number(w.pnl) > 0) parts.push(`${fmtTournamentWeight(w.pnl)}% PnL`);
      return `Points (${parts.length ? parts.join(' / ') : 'no enabled metrics'})`;
    }
    case 'pnl_usd':
    default:
      return 'PnL (USD)';
  }
}

function applyTournamentPointsScore(rows, t) {
  if (tournamentUsesDailyPool(t)) {
    for (const r of rows) {
      const awarded = Math.max(0, Number(r.awarded_points) || 0);
      r.volume_score = 0;
      r.trophy_score = 0;
      r.pnl_score = 0;
      r.score = Number(awarded.toFixed(4));
    }
    return rows;
  }
  const w = tournamentPointWeights(t);
  for (const r of rows) {
    const volumeScore = Math.max(0, Number(r.volume_usd) || 0) * (w.volume / 100);
    const trophyScore = Math.max(0, Number(r.trophies) || 0) * (w.trophies / 100);
    const pnlScore = Math.max(0, Number(r.pnl_usd) || 0) * (w.pnl / 100);
    r.volume_score = Number(volumeScore.toFixed(4));
    r.trophy_score = Number(trophyScore.toFixed(4));
    r.pnl_score = Number(pnlScore.toFixed(4));
    r.score = Number((volumeScore + trophyScore + pnlScore).toFixed(4));
  }
  return rows;
}

function tournamentRowMetricValue(row, metric, t) {
  const key = normalizeTournamentTeamMetric(metric);
  if (key === TOURNAMENT_POINTS_SORT) {
    if (row.score === undefined || row.score === null) applyTournamentPointsScore([row], t);
    return Math.max(0, Number(row.score) || 0);
  }
  if (key === 'pnl_usd') return Math.max(0, Number(row.pnl_usd) || 0);
  return Math.max(0, Number(row[key]) || 0);
}

function buildTournamentTeamState(rows, t, prize) {
  const mode = normalizeTournamentMode(t?.mode);
  if (mode !== 'dex_vs_dex') return null;
  const eligible = tournamentEligibleDexes(t);
  const teamScoreBy = normalizeTournamentTeamMetric(t?.team_score_by, 'volume_usd');
  const teamPrizeMode = normalizeTournamentTeamPrizeMode(t?.team_prize_mode);
  const memberRewardBy = normalizeTournamentTeamMetric(t?.team_member_reward_by, 'volume_usd');
  const teams = new Map();
  for (const dex of eligible) {
    teams.set(dex, {
      dex,
      label: TOURNAMENT_DEX_LABELS[dex] || dex,
      players: 0,
      score: 0,
      volume_usd: 0,
      pnl_usd: 0,
      trades_count: 0,
      trophies: 0,
      gold: 0,
      prize_share_pct: 0,
      prize_pool_usd: 0,
      winner: false,
      rank: null,
    });
  }
  for (const row of rows) {
    const dex = String(row.team_dex || row.dex || row.player_dex || t.dex || '').toLowerCase();
    if (!teams.has(dex)) continue;
    row.team_dex = dex;
    row.team_label = TOURNAMENT_DEX_LABELS[dex] || dex;
    row.team_score_value = tournamentRowMetricValue(row, teamScoreBy, t);
    row.member_reward_value = tournamentRowMetricValue(row, memberRewardBy, t);
    const team = teams.get(dex);
    team.players += 1;
    team.score += row.team_score_value;
    team.volume_usd += Math.max(0, Number(row.volume_usd) || 0);
    team.pnl_usd += Math.max(0, Number(row.pnl_usd) || 0);
    team.trades_count += Math.max(0, Number(row.trades_count) || 0);
    team.trophies += Math.max(0, Number(row.trophies) || 0);
    team.gold += Math.max(0, Number(row.gold) || 0);
  }

  const sortedTeams = Array.from(teams.values())
    .sort((a, b) => (Number(b.score) || 0) - (Number(a.score) || 0) || a.dex.localeCompare(b.dex));
  sortedTeams.forEach((team, index) => {
    team.rank = index + 1;
    team.score = Number((Number(team.score) || 0).toFixed(4));
    team.volume_usd = Number((Number(team.volume_usd) || 0).toFixed(2));
    team.pnl_usd = Number((Number(team.pnl_usd) || 0).toFixed(2));
  });

  const pool = Number(prize?.pool_usd || 0) || 0;
  if (pool > 0 && teamPrizeMode === 'custom_split') {
    const splits = normalizeTournamentTeamPrizeSplits(t?.team_prize_splits, eligible);
    const shareByDex = new Map(splits.map(s => [s.dex, Number(s.share_pct || 0)]));
    for (const team of sortedTeams) {
      team.prize_share_pct = Math.max(0, Number(shareByDex.get(team.dex) || 0));
      team.prize_pool_usd = Number((pool * team.prize_share_pct / 100).toFixed(2));
    }
  } else if (pool > 0 && sortedTeams.length) {
    const topScore = Number(sortedTeams[0].score) || 0;
    const winners = topScore > 0
      ? sortedTeams.filter(team => Math.abs((Number(team.score) || 0) - topScore) < 0.0001)
      : [];
    const share = winners.length ? 100 / winners.length : 0;
    for (const team of winners) {
      team.winner = true;
      team.prize_share_pct = Number(share.toFixed(4));
      team.prize_pool_usd = Number((pool / winners.length).toFixed(2));
    }
  }

  const teamMemberTotals = new Map();
  for (const row of rows) {
    if (!teams.has(row.team_dex)) continue;
    teamMemberTotals.set(row.team_dex, (teamMemberTotals.get(row.team_dex) || 0) + (Number(row.member_reward_value) || 0));
  }
  const teamPlayerCounts = new Map();
  for (const row of rows) {
    if (!teams.has(row.team_dex)) continue;
    teamPlayerCounts.set(row.team_dex, (teamPlayerCounts.get(row.team_dex) || 0) + 1);
  }
  const teamPrizeByDex = new Map(sortedTeams.map(team => [team.dex, Number(team.prize_pool_usd || 0)]));
  const teamRankByDex = new Map(sortedTeams.map(team => [team.dex, team.rank]));
  const teamScoreByDex = new Map(sortedTeams.map(team => [team.dex, Number(team.score || 0)]));
  const teamShareByDex = new Map(sortedTeams.map(team => [team.dex, Number(team.prize_share_pct || 0)]));
  for (const row of rows) {
    const teamPool = teamPrizeByDex.get(row.team_dex) || 0;
    const metricTotal = teamMemberTotals.get(row.team_dex) || 0;
    const members = teamPlayerCounts.get(row.team_dex) || 0;
    let prizeAmount = 0;
    if (teamPool > 0) {
      prizeAmount = metricTotal > 0
        ? teamPool * ((Number(row.member_reward_value) || 0) / metricTotal)
        : (members > 0 ? teamPool / members : 0);
    }
    row.team_rank = teamRankByDex.get(row.team_dex) || null;
    row.team_score = teamScoreByDex.get(row.team_dex) || 0;
    row.team_prize_pool_usd = teamPool;
    row.team_prize_share_pct = teamShareByDex.get(row.team_dex) || 0;
    row.prize_amount = Number(prizeAmount.toFixed(2));
  }

  return {
    mode,
    score_by: teamScoreBy,
    score_label: tournamentMetricLabel(teamScoreBy),
    prize_mode: teamPrizeMode,
    member_reward_by: memberRewardBy,
    member_reward_label: tournamentMetricLabel(memberRewardBy),
    teams: sortedTeams,
  };
}

function sanitizePrizeCurrency(v) {
  const s = String(v || DEFAULT_TOURNAMENT_PRIZE_CURRENCY).trim().toUpperCase();
  if (s === 'COP') return 'CLASH';
  return /^[A-Z0-9]{2,12}$/.test(s) ? s : DEFAULT_TOURNAMENT_PRIZE_CURRENCY;
}

function sanitizePrizeNumber(v, fallback = 0) {
  if (v === undefined || v === null || v === '') return fallback;
  const n = Number(v);
  if (!Number.isFinite(n)) return fallback;
  return Math.max(0, Math.min(1_000_000_000, Number(n.toFixed(2))));
}

function sanitizePrizeText(v, fallback = '') {
  const s = String(v ?? '').trim();
  return (s || fallback).replace(/[<>]/g, '').slice(0, 80);
}

function sanitizePrizeType(v) {
  const s = String(v || '').trim().toLowerCase();
  if (['money', 'points', 'amp', 'nft', 'custom'].includes(s)) return s;
  return 'custom';
}

function defaultPrizeRewardLabel(type, label = '') {
  const clean = sanitizePrizeText(label);
  if (clean) return clean;
  if (type === 'money') return 'Cash';
  if (type === 'points') return 'Points';
  if (type === 'amp') return 'AMP';
  if (type === 'nft') return 'NFT';
  return 'Custom reward';
}

function normalizeRewardEvmWallet(v) {
  const s = String(v || '').trim();
  if (!s) return null;
  return EVM_WALLET_RE.test(s) ? s.toLowerCase() : null;
}

const SOLANA_REWARD_WALLET_RE = /^[1-9A-HJ-NP-Za-km-z]{32,44}$/;

function normalizeRewardSolanaWallet(v) {
  const s = String(v || '').trim();
  if (!s) return null;
  return SOLANA_REWARD_WALLET_RE.test(s) ? s : null;
}

function normalizePrizePayouts(input) {
  const arr = Array.isArray(input)
    ? input
    : (input && typeof input === 'object'
      ? Object.entries(input).map(([rank, amount]) => ({ rank, amount_usd: amount }))
      : []);
  const byRank = new Map();
  for (const raw of arr) {
    const rank = Math.floor(Number(raw?.rank ?? raw?.place ?? raw?.position));
    const amount = sanitizePrizeNumber(raw?.amount_usd ?? raw?.amount ?? raw?.prize_usd ?? raw?.prize);
    if (!Number.isFinite(rank) || rank <= 0 || rank > 100 || amount <= 0) continue;
    byRank.set(rank, {
      rank,
      amount_usd: amount,
    });
  }
  return Array.from(byRank.values()).sort((a, b) => a.rank - b.rank);
}

function normalizePrizeRewardPayouts(input) {
  const arr = Array.isArray(input)
    ? input
    : (input && typeof input === 'object'
      ? Object.entries(input).map(([rank, amount]) => ({ rank, amount }))
      : []);
  const byRank = new Map();
  for (const raw of arr) {
    const rank = Math.floor(Number(raw?.rank ?? raw?.place ?? raw?.position));
    const amount = sanitizePrizeNumber(raw?.amount ?? raw?.quantity ?? raw?.points ?? raw?.amount_usd ?? raw?.prize);
    if (!Number.isFinite(rank) || rank <= 0 || rank > 100 || amount <= 0) continue;
    byRank.set(rank, { rank, amount });
  }
  return Array.from(byRank.values()).sort((a, b) => a.rank - b.rank);
}

function normalizePrizeRewards(input, legacyTier = null, { strict = false } = {}) {
  const arr = Array.isArray(input) ? input : [];
  const rewards = [];
  const legacyPayouts = legacyTier ? normalizePrizePayouts(legacyTier.payouts ?? legacyTier.prizes ?? legacyTier.rewards) : [];
  const legacyPool = legacyTier ? sanitizePrizeNumber(legacyTier.pool_usd ?? legacyTier.prize_pool_usd ?? legacyTier.pool ?? legacyTier.amount_usd, 0) : 0;
  if (!arr.length && (legacyPool > 0 || legacyPayouts.length > 0)) {
    rewards.push({
      type: 'money',
      label: 'Cash',
      currency: sanitizePrizeCurrency(legacyTier?.currency || legacyTier?.prize_currency),
      unit: sanitizePrizeCurrency(legacyTier?.currency || legacyTier?.prize_currency),
      pool_amount: legacyPool || Number(legacyPayouts.reduce((s, p) => s + Number(p.amount_usd || 0), 0).toFixed(2)),
      quantity: legacyPool || Number(legacyPayouts.reduce((s, p) => s + Number(p.amount_usd || 0), 0).toFixed(2)),
      payouts: legacyPayouts.map((p) => ({ rank: p.rank, amount: p.amount_usd })),
    });
  }
  for (const raw of arr) {
    const type = sanitizePrizeType(raw?.type || raw?.kind);
    const label = defaultPrizeRewardLabel(type, raw?.label || raw?.name || raw?.title);
    const currency = type === 'money' ? sanitizePrizeCurrency(raw?.currency) : null;
    const unit = type === 'money'
      ? currency
      : sanitizePrizeText(raw?.unit || raw?.currency || (type === 'points' ? 'points' : type === 'amp' ? 'AMP' : type === 'nft' ? 'NFT' : 'reward'), 'reward');
    const payouts = normalizePrizeRewardPayouts(raw?.payouts ?? raw?.rewards ?? raw?.tiers);
    const payoutSum = Number(payouts.reduce((s, p) => s + Number(p.amount || 0), 0).toFixed(2));
    const poolAmount = sanitizePrizeNumber(raw?.pool_amount ?? raw?.pool ?? raw?.amount ?? raw?.quantity ?? raw?.total, payoutSum);
    if (strict && poolAmount > 0 && payoutSum > poolAmount + 0.01) {
      throw new Error(`prize reward "${label}" payouts exceed pool`);
    }
    if (poolAmount <= 0 && payouts.length === 0) continue;
    rewards.push({
      type,
      label,
      currency,
      unit,
      pool_amount: poolAmount,
      quantity: poolAmount,
      payouts,
      payout_sum: payoutSum,
    });
  }
  return rewards;
}

function normalizeTournamentPrizeTiers(input, { strict = false } = {}) {
  let raw = input;
  if (typeof raw === 'string') {
    try { raw = JSON.parse(raw || '[]'); } catch { raw = []; }
  }
  const arr = Array.isArray(raw) ? raw : [];
  const tiers = [];
  for (let i = 0; i < arr.length; i += 1) {
    const tier = arr[i] || {};
    const volume = sanitizePrizeNumber(
      tier.volume_usd ?? tier.total_volume_usd ?? tier.threshold_usd ?? tier.threshold ?? tier.volume,
    );
    const rewardsInput = Array.isArray(tier.rewards) && tier.rewards.some((r) =>
      r && typeof r === 'object' && (r.type || r.kind || r.pool_amount !== undefined || r.label || r.name)
    ) ? tier.rewards : [];
    const rewards = normalizePrizeRewards(rewardsInput, tier, { strict });
    const moneyReward = rewards.find((r) => r.type === 'money') || null;
    const payouts = moneyReward
      ? moneyReward.payouts.map((p) => ({ rank: p.rank, amount_usd: p.amount }))
      : normalizePrizePayouts(tier.payouts ?? tier.prizes ?? tier.rewards);
    const payoutSum = Number(payouts.reduce((s, p) => s + Number(p.amount_usd || 0), 0).toFixed(2));
    const pool = moneyReward
      ? sanitizePrizeNumber(moneyReward.pool_amount, payoutSum)
      : sanitizePrizeNumber(tier.pool_usd ?? tier.prize_pool_usd ?? tier.pool ?? tier.amount_usd, payoutSum);
    if (strict && payoutSum > pool + 0.01) {
      throw new Error(`prize tier #${i + 1} payouts exceed pool`);
    }
    if (pool <= 0 && payouts.length === 0 && rewards.length === 0 && volume <= 0) continue;
    tiers.push({
      volume_usd: volume,
      pool_usd: pool,
      payouts,
      payout_sum_usd: payoutSum,
      rewards,
    });
  }
  return tiers.sort((a, b) => a.volume_usd - b.volume_usd);
}

function tournamentPrizeRewardsByRank(activeTier) {
  const byRank = new Map();
  for (const reward of activeTier?.rewards || []) {
    for (const payout of reward.payouts || []) {
      const rank = Number(payout.rank);
      if (!Number.isFinite(rank) || rank <= 0) continue;
      const list = byRank.get(rank) || [];
      list.push({
        type: reward.type,
        label: reward.label,
        unit: reward.unit,
        currency: reward.currency,
        amount: Number(payout.amount || 0),
      });
      byRank.set(rank, list);
    }
  }
  return byRank;
}

function tournamentTotalVolumeUsd(tournamentId) {
  if (!tournamentId) return 0;
  try {
    const row = db.db.prepare(`
      SELECT COALESCE(SUM(CASE WHEN left_at IS NULL THEN volume_usd ELSE 0 END), 0) AS total
      FROM tournament_participants
      WHERE tournament_id = ?
    `).get(tournamentId);
    return Number(row?.total || 0) || 0;
  } catch {
    return 0;
  }
}

function tournamentPrizeState(t, totalVolumeUsd = null) {
  const tiers = normalizeTournamentPrizeTiers(t?.prize_tiers);
  const totalVolume = sanitizePrizeNumber(
    totalVolumeUsd == null ? tournamentTotalVolumeUsd(t?.id) : totalVolumeUsd,
  );
  let activeTier = null;
  let nextTier = null;
  for (const tier of tiers) {
    if (totalVolume + 0.0001 >= Number(tier.volume_usd || 0)) activeTier = tier;
    else if (!nextTier) nextTier = tier;
  }
  return {
    currency: sanitizePrizeCurrency(t?.prize_currency),
    total_volume_usd: totalVolume,
    tiers,
    active_tier: activeTier,
    next_tier: nextTier,
    pool_usd: activeTier?.pool_usd || 0,
    payouts: activeTier?.payouts || [],
    rewards: activeTier?.rewards || [],
    rewards_by_rank: Array.from(tournamentPrizeRewardsByRank(activeTier).entries()).map(([rank, rewards]) => ({ rank, rewards })),
  };
}

function validateTournamentWindow({ start_at, end_at, registration_opens_at, registration_closes_at }) {
  if (end_at && end_at <= start_at) return 'end_at must be after start_at';
  if (registration_closes_at && end_at && registration_closes_at > end_at) {
    return 'registration_closes_at must be before or equal to end_at';
  }
  const registrationClose = registration_closes_at || end_at;
  if (registration_opens_at && registrationClose && registration_opens_at >= registrationClose) {
    return 'registration_opens_at must be before registration close';
  }
  return null;
}

function tournamentPhase(t, now = nowSql()) {
  if (!t) return null;
  if (t.status === 'ended') return 'ended';
  if (t.status === 'draft') return 'draft';
  const start = cleanSqlDate(t.start_at);
  const end = cleanSqlDate(t.end_at);
  if (end && end <= now) return 'ended';
  if (start && start > now) {
    return Number(t.preregistration_enabled || 0) ? 'preregistration' : 'scheduled';
  }
  return 'live';
}

function isTournamentPreregOpen(t, now = nowSql()) {
  if (!t || !Number(t.preregistration_enabled || 0)) return false;
  if (tournamentPhase(t, now) !== 'preregistration') return false;
  const opens = cleanSqlDate(t.registration_opens_at);
  const closes = cleanSqlDate(t.registration_closes_at) || cleanSqlDate(t.end_at);
  if (opens && opens > now) return false;
  if (closes && closes <= now) return false;
  return true;
}

function isTournamentLiveRegistrationOpen(t, now = nowSql()) {
  if (!t || tournamentPhase(t, now) !== 'live') return false;
  const opens = cleanSqlDate(t.registration_opens_at);
  const closes = cleanSqlDate(t.registration_closes_at) || cleanSqlDate(t.end_at);
  if (opens && opens > now) return false;
  if (closes && closes <= now) return false;
  return true;
}

function canJoinTournament(t, now = nowSql()) {
  const phase = tournamentPhase(t, now);
  if (phase === 'preregistration') return isTournamentPreregOpen(t, now);
  if (phase === 'live') return isTournamentLiveRegistrationOpen(t, now);
  return false;
}

function tournamentRowToPublic(t, options = {}) {
  const now = nowSql();
  const phase = tournamentPhase(t, now);
  const pointWeights = tournamentPointWeights(t);
  const prize = tournamentPrizeState(t, options.totalVolumeUsd);
  const eligibleDexes = tournamentEligibleDexes(t);
  const dexScope = tournamentDexScope(t);
  const mode = normalizeTournamentMode(t.mode);
  const teamScoreBy = normalizeTournamentTeamMetric(t.team_score_by, 'volume_usd');
  const teamPrizeMode = normalizeTournamentTeamPrizeMode(t.team_prize_mode);
  const teamMemberRewardBy = normalizeTournamentTeamMetric(t.team_member_reward_by, 'volume_usd');
  const attackMatchPolicy = normalizeTournamentAttackMatchPolicy(t.attack_match_policy, 'all');
  const scoringMode = normalizeTournamentScoringMode(t.scoring_mode, 'live');
  let dailyPoolOverrides = {};
  try { dailyPoolOverrides = normalizeTournamentDailyPoolOverrides(t.daily_pool_overrides); }
  catch { dailyPoolOverrides = {}; }
  return {
    id: t.id,
    name: t.name,
    description: t.description || '',
    dex: t.dex,
    dex_scope: dexScope,
    eligible_dexes: eligibleDexes,
    dex_label: tournamentDexLabel(t),
    seeker_only: isTournamentSeekerOnly(t),
    access_label: tournamentAccessLabel(t),
    mode,
    mode_label: tournamentModeLabel(mode),
    team_score_by: teamScoreBy,
    team_score_label: tournamentMetricLabel(teamScoreBy),
    team_prize_mode: teamPrizeMode,
    team_prize_splits: normalizeTournamentTeamPrizeSplits(t.team_prize_splits, eligibleDexes),
    team_member_reward_by: teamMemberRewardBy,
    team_member_reward_label: tournamentMetricLabel(teamMemberRewardBy),
    attack_match_policy: attackMatchPolicy,
    attack_match_policy_label: tournamentAttackMatchPolicyLabel(attackMatchPolicy),
    scoring_mode: scoringMode,
    scoring_label: scoringMode === 'daily_pool' ? 'Daily points at 00:00 UTC' : 'Live scoring',
    daily_pool_points: normalizeTournamentDailyPoolPoints(t.daily_pool_points, 1000),
    daily_pool_growth_pct: normalizeTournamentDailyPoolGrowthPct(t.daily_pool_growth_pct, 0),
    daily_pool_overrides: dailyPoolOverrides,
    daily_pool_enabled_at: cleanSqlDate(t.daily_pool_enabled_at),
    start_at: cleanSqlDate(t.start_at),
    end_at: cleanSqlDate(t.end_at),
    gold_boost: Number(t.gold_boost),
    seeker_gold_boost: normalizeTournamentBoost(t.seeker_gold_boost, 1),
    trophy_boost: Number(t.trophy_boost),
    shield_hours: t.shield_hours === null || t.shield_hours === undefined ? null : Number(t.shield_hours),
    shield_label: t.shield_hours === null || t.shield_hours === undefined ? 'Default' : (Number(t.shield_hours) === 0 ? 'No shield' : `${Number(t.shield_hours)}h`),
    freeze_trophies: Number(t.freeze_trophies ?? 1) !== 0,
    sort_by: t.sort_by,
    sort_label: tournamentSortLabel(t),
    points_trophy_weight: pointWeights.trophies,
    points_volume_weight: pointWeights.volume,
    points_pnl_weight: pointWeights.pnl,
    points_weights: pointWeights,
    prize_currency: prize.currency,
    prize_tiers: prize.tiers,
    prize_total_volume_usd: prize.total_volume_usd,
    prize_pool_usd: prize.pool_usd,
    prize_active_tier: prize.active_tier,
    prize_next_tier: prize.next_tier,
    prize_payouts: prize.payouts,
    prize_rewards: prize.rewards,
    prize_rewards_by_rank: prize.rewards_by_rank,
    rewards_in_cop: !!Number(t.rewards_in_cop || 0),
    status: t.status,
    phase,
    preregistration_enabled: !!Number(t.preregistration_enabled || 0),
    registration_opens_at: cleanSqlDate(t.registration_opens_at),
    registration_closes_at: cleanSqlDate(t.registration_closes_at),
    can_join: canJoinTournament(t, now),
    created_at: t.created_at,
  };
}

function tournamentTradeSourceWhere(dex) {
  if (dex === 'decibel') return "verified_source = 'decibel_fill'";
  if (dex === 'monad') return "verified_source IN ('perpl_api', 'perpl_ws')";
  if (dex === 'hyperliquid') return "verified_source = 'hyperliquid_api'";
  if (dex === 'risex') return "verified_source = 'risex_api'";
  if (dex === 'nado') return "verified_source = 'nado_api'";
  if (dex === 'hibachi') return "verified_source = 'hibachi_api'";
  if (dex === 'hotstuff') return "verified_source = 'hotstuff_api'";
  if (dex === 'grvt') return "verified_source = 'grvt_builder'";
  if (dex === 'katana') return "verified_source = 'katana_api'";
  if (dex === 'gmtrade') return "verified_source = 'gmtrade_tx'";
  if (dex === 'phoenix') return "verified_source IN ('worker', 'tx')";
  if (dex === 'gmx') return "verified_source IN ('worker', 'server')";
  return "verified_source = 'worker'";
}

function syncFuturesTournamentRows(playerId, dex) {
  const normalizedDex = String(dex || '').toLowerCase();
  if (!playerId || !['avantis', 'decibel', 'gmx', 'monad', 'phoenix', 'hyperliquid', 'risex', 'nado', 'hotstuff', 'grvt'].includes(normalizedDex)) {
    return { ok: true, skipped: true };
  }
  const fdb = futuresDbReadonly();
  if (!fdb) return { ok: false, reason: 'futures db unavailable' };
  try {
    const sourceWhere = tournamentTradeSourceWhere(normalizedDex);
    let rows = fdb.prepare(`
      SELECT id, symbol, side, amount, notional_usd, pnl, status, created_at, dex
      FROM trade_history
      WHERE player_id = ? AND dex = ? AND status = 'filled'
        AND ${sourceWhere}
      ORDER BY id ASC
      LIMIT 2000
    `).all(playerId, normalizedDex);
    const main = db.recordTournamentTradeRows(playerId, rows, {
      source: 'trade_history',
      dex: normalizedDex,
      count: true,
      volume: true,
      // Decibel counts app/server-signed rows only. Worker close PnL is not
      // app-attributable, so it is intentionally excluded here.
      pnl: normalizedDex !== 'decibel',
    });
    const pnl = { credited_rows: 0, trades_count: 0, volume_usd: 0, pnl_usd: 0 };
    return { ok: true, rows: rows.length, main, pnl };
  } catch (e) {
    console.warn(`[tournament-sync ${normalizedDex}] failed for player=${String(playerId).slice(0, 8)}:`, e.message);
    return { ok: false, reason: e.message };
  }
}

// List all live tournaments visible to players (active, not yet ended).
// We show every DEX's tournaments — the client filters/sorts by the
// player's own DEX. Admin gets full list (incl. drafts) via the admin
// endpoint below.
router.get('/tournaments', (req, res) => {
  const rows = db.db.prepare(`
    SELECT * FROM tournaments
    WHERE status = 'active'
      AND (end_at IS NULL OR replace(replace(end_at, 'T', ' '), ' UTC', '') > datetime('now'))
      AND (
        replace(replace(start_at, 'T', ' '), ' UTC', '') <= datetime('now')
        OR preregistration_enabled = 1
      )
    ORDER BY
      CASE WHEN replace(replace(start_at, 'T', ' '), ' UTC', '') <= datetime('now') THEN 0 ELSE 1 END,
      replace(replace(start_at, 'T', ' '), ' UTC', '') ASC,
      id DESC
  `).all();
  res.json({ tournaments: rows.map(tournamentRowToPublic) });
});

// Player's current tournament context: the active tournament available to their DEX
// (if any) plus their participation row. UI uses this to decide whether to
// show "Join" or "Leave + leaderboard" on the trophy button.
router.get('/tournaments/me', auth, (req, res) => {
  const dex = req.player.dex;
  const seekerAccess = isSeekerPlayer(req.player) ? 1 : 0;
  const t = db.db.prepare(`
    SELECT * FROM tournaments
    WHERE status = 'active'
      AND (
        COALESCE(dex_scope, 'single') = 'all'
        OR dex = ?
        OR instr(COALESCE(eligible_dexes, '[]'), '"' || ? || '"') > 0
      )
      AND (COALESCE(seeker_only, 0) = 0 OR ? = 1)
      AND (end_at IS NULL OR replace(replace(end_at, 'T', ' '), ' UTC', '') > datetime('now'))
      AND (
        replace(replace(start_at, 'T', ' '), ' UTC', '') <= datetime('now')
        OR preregistration_enabled = 1
      )
    ORDER BY
      CASE WHEN replace(replace(start_at, 'T', ' '), ' UTC', '') <= datetime('now') THEN 0 ELSE 1 END,
      replace(replace(start_at, 'T', ' '), ' UTC', '') ASC,
      id DESC
    LIMIT 1
  `).get(dex, dex, seekerAccess);
  if (!t) return res.json({ tournament: null, joined: false, phase: null, can_join: false });
  const pub = tournamentRowToPublic(t);
  let me = db.db.prepare(`
    SELECT * FROM tournament_participants
    WHERE tournament_id = ? AND player_id = ?
  `).get(t.id, req.player.id);
  if (me && me.left_at === null && pub.phase === 'live') {
    const sync = syncFuturesTournamentRows(req.player.id, dex);
    if (sync?.ok && ((sync.main?.credited_rows || 0) > 0 || (sync.pnl?.credited_rows || 0) > 0)) {
      me = db.db.prepare(`
        SELECT * FROM tournament_participants
        WHERE tournament_id = ? AND player_id = ?
      `).get(t.id, req.player.id);
    }
  }
  let comboMeScore = null;
  if (me && (isTournamentPointsSort(t.sort_by) || tournamentUsesDailyPool(t))) {
    const scored = applyTournamentPointsScore(db.db.prepare(`
      SELECT player_id, trophies, volume_usd, pnl_usd, awarded_points
      FROM tournament_participants
      WHERE tournament_id = ? AND left_at IS NULL
    `).all(t.id), t);
    comboMeScore = scored.find(s => s.player_id === req.player.id) || null;
  }
  res.json({
    tournament: pub,
    joined: !!(me && me.left_at === null),
    phase: pub.phase,
    can_join: pub.can_join,
    me: me ? {
      trophies: me.trophies,
      gold: me.gold,
      trades_count: me.trades_count,
      volume_usd: me.volume_usd,
      pnl_usd: me.pnl_usd,
      awarded_points: me.awarded_points || 0,
      score: comboMeScore?.score ?? null,
      volume_score: comboMeScore?.volume_score ?? null,
      trophy_score: comboMeScore?.trophy_score ?? null,
      pnl_score: comboMeScore?.pnl_score ?? null,
      joined_at: me.joined_at,
      left_at: me.left_at,
      team_dex: me.team_dex || null,
      team_label: me.team_dex ? (TOURNAMENT_DEX_LABELS[me.team_dex] || me.team_dex) : null,
      reward_wallet_evm: me.reward_wallet_evm || null,
    } : null,
  });
});

// History: ended tournaments available to the player's DEX, with their participation
// summary attached so the panel can show "your final standing" without an
// extra round-trip per tournament. Used by the History tab in
// TournamentPanel — the leaderboard itself is fetched lazily on click via
// /tournaments/:id/leaderboard (already public).
router.get('/tournaments/history', auth, (req, res) => {
  const dex = req.player.dex;
  const limit = Math.min(parseInt(req.query.limit, 10) || 20, 100);
  const seekerAccess = isSeekerPlayer(req.player) ? 1 : 0;
  // status = 'ended' OR end_at < now (catch tournaments whose admin forgot
  // to flip the status flag — auto-ended by time still belongs in history).
  const rows = db.db.prepare(`
    SELECT t.*,
           tp.trophies   AS my_trophies,
           tp.gold       AS my_gold,
           tp.trades_count AS my_trades_count,
           tp.volume_usd AS my_volume_usd,
           tp.pnl_usd    AS my_pnl_usd,
           tp.awarded_points AS my_awarded_points,
           tp.team_dex   AS my_team_dex,
           tp.reward_wallet_evm AS my_reward_wallet_evm,
           tp.left_at    AS my_left_at
    FROM tournaments t
    LEFT JOIN tournament_participants tp
      ON tp.tournament_id = t.id AND tp.player_id = ?
    WHERE (
        t.status = 'ended'
        OR (t.end_at IS NOT NULL AND replace(replace(t.end_at, 'T', ' '), ' UTC', '') <= datetime('now'))
      )
      AND (
        COALESCE(t.dex_scope, 'single') = 'all'
        OR t.dex = ?
        OR instr(COALESCE(t.eligible_dexes, '[]'), '"' || ? || '"') > 0
      )
      AND (COALESCE(t.seeker_only, 0) = 0 OR ? = 1 OR tp.player_id IS NOT NULL)
    ORDER BY COALESCE(t.end_at, t.created_at) DESC, t.id DESC
    LIMIT ?
  `).all(req.player.id, dex, dex, seekerAccess, limit);
  const comboScores = new Map();
  for (const r of rows) {
    if (!isTournamentPointsSort(r.sort_by) && !tournamentUsesDailyPool(r)) continue;
    const scored = applyTournamentPointsScore(db.db.prepare(`
      SELECT player_id, trophies, volume_usd, pnl_usd, awarded_points
      FROM tournament_participants
      WHERE tournament_id = ? AND left_at IS NULL
    `).all(r.id), r);
    const mine = scored.find(s => s.player_id === req.player.id);
    if (mine) comboScores.set(r.id, mine);
  }
  res.json({
    tournaments: rows.map(r => ({
      ...tournamentRowToPublic(r),
      me: (r.my_trophies != null || r.my_gold != null || r.my_trades_count != null) ? {
        trophies: r.my_trophies || 0,
        gold: r.my_gold || 0,
        trades_count: r.my_trades_count || 0,
        volume_usd: r.my_volume_usd || 0,
        pnl_usd: r.my_pnl_usd || 0,
        awarded_points: r.my_awarded_points || 0,
        score: comboScores.get(r.id)?.score ?? null,
        volume_score: comboScores.get(r.id)?.volume_score ?? null,
        trophy_score: comboScores.get(r.id)?.trophy_score ?? null,
        pnl_score: comboScores.get(r.id)?.pnl_score ?? null,
        team_dex: r.my_team_dex || null,
        team_label: r.my_team_dex ? (TOURNAMENT_DEX_LABELS[r.my_team_dex] || r.my_team_dex) : null,
        reward_wallet_evm: r.my_reward_wallet_evm || null,
        left_at: r.my_left_at,
      } : null,
    })),
  });
});

// Join a tournament. Player can join when their current DEX is in the
// tournament's single/custom/all scope. If
// they have a stale soft-leave row from a previous join we re-activate it
// (preserving counters? — no, reset to zero since the user explicitly
// left). The tournament can be in pre-registration or already live.
router.post('/tournaments/:id/join', auth, (req, res) => {
  const tid = parseInt(req.params.id, 10);
  if (!Number.isFinite(tid)) return res.status(400).json({ error: 'invalid id' });
  const t = db.db.prepare('SELECT * FROM tournaments WHERE id = ?').get(tid);
  if (!t) return res.status(404).json({ error: 'tournament not found' });
  if (t.status !== 'active') return res.status(400).json({ error: 'tournament not active' });
  if (!isTournamentForDex(t, req.player.dex)) {
    return res.status(403).json({ error: `tournament is for ${tournamentDexLabel(t)}, not ${req.player.dex}` });
  }
  if (isTournamentSeekerOnly(t) && !isSeekerPlayer(req.player)) {
    return res.status(403).json({ error: 'tournament is Seeker-only; open the game from a Seeker/Solana Mobile device first' });
  }
  const now = nowSql();
  if (cleanSqlDate(t.end_at) && cleanSqlDate(t.end_at) <= now) return res.status(400).json({ error: 'tournament has ended' });
  const phase = tournamentPhase(t, now);
  if (phase === 'scheduled') return res.status(400).json({ error: 'pre-registration is not open' });
  if (phase === 'preregistration' && !isTournamentPreregOpen(t, now)) {
    return res.status(400).json({ error: 'pre-registration is closed' });
  }
  if (!canJoinTournament(t, now)) return res.status(400).json({ error: phase === 'live' ? 'registration is closed' : 'tournament is not joinable' });
  const rewardWallet = Number(t.rewards_in_cop || 0)
    ? normalizeRewardSolanaWallet(req.body?.reward_wallet_solana ?? req.body?.rewardWalletSolana ?? req.body?.reward_wallet_evm ?? req.body?.rewardWalletEvm)
    : normalizeRewardEvmWallet(req.body?.reward_wallet_evm ?? req.body?.rewardWalletEvm);
  if (Number(t.rewards_in_cop || 0) && !rewardWallet) {
    return res.status(400).json({ error: 'valid Solana reward wallet required for CLASH rewards' });
  }
  // Insert or re-activate. Reset counters on re-join — explicitly leaving
  // means the player accepts losing their slot's stats.
  const teamDex = normalizeTournamentMode(t.mode) === 'dex_vs_dex' ? req.player.dex : null;
  db.db.prepare(`
    INSERT INTO tournament_participants (tournament_id, player_id, joined_at, left_at, trophies, gold, trades_count, volume_usd, pnl_usd, team_dex, reward_wallet_evm)
    VALUES (?, ?, datetime('now'), NULL, 0, 0, 0, 0, 0, ?, ?)
    ON CONFLICT(tournament_id, player_id) DO UPDATE SET
      joined_at = datetime('now'),
      left_at = NULL,
      trophies = 0, gold = 0, trades_count = 0, volume_usd = 0, pnl_usd = 0,
      team_dex = excluded.team_dex,
      reward_wallet_evm = excluded.reward_wallet_evm,
      last_activity_at = datetime('now')
  `).run(tid, req.player.id, teamDex, rewardWallet);
  const sync = phase === 'live' ? syncFuturesTournamentRows(req.player.id, req.player.dex) : null;
  console.log(`[tournament ${tid} join] player=${req.player.name} (${req.player.dex}) phase=${phase} -> JOINED ${t.name}`);
  res.json({ ok: true, joined: true, phase, sync: sync ? { ok: !!sync.ok } : null });
});

// Add or repair the CLASH payout address for an already-registered player.
// This deliberately does not call the join path because join reactivates and
// resets counters on conflict. Older participants may have joined before the
// reward-address requirement existed. The DB column name is legacy.
router.post('/tournaments/:id/reward-wallet', auth, (req, res) => {
  const tid = parseInt(req.params.id, 10);
  if (!Number.isFinite(tid)) return res.status(400).json({ error: 'invalid id' });
  const t = db.db.prepare('SELECT * FROM tournaments WHERE id = ?').get(tid);
  if (!t) return res.status(404).json({ error: 'tournament not found' });
  if (!Number(t.rewards_in_cop || 0)) {
    return res.status(400).json({ error: 'this tournament does not use CLASH reward addresses' });
  }
  const participant = db.db.prepare(`
    SELECT reward_wallet_evm, left_at
    FROM tournament_participants
    WHERE tournament_id = ? AND player_id = ?
  `).get(tid, req.player.id);
  if (!participant || participant.left_at !== null) {
    return res.status(400).json({ error: 'you are not registered in this tournament' });
  }
  const rewardWallet = normalizeRewardSolanaWallet(
    req.body?.reward_wallet_solana ?? req.body?.rewardWalletSolana ?? req.body?.reward_wallet_evm ?? req.body?.rewardWalletEvm,
  );
  if (!rewardWallet) {
    return res.status(400).json({ error: 'valid Solana reward wallet required for CLASH rewards' });
  }
  db.db.prepare(`
    UPDATE tournament_participants
    SET reward_wallet_evm = ?, last_activity_at = datetime('now')
    WHERE tournament_id = ? AND player_id = ? AND left_at IS NULL
  `).run(rewardWallet, tid, req.player.id);
  console.log(`[tournament ${tid} reward-wallet] player=${req.player.name} -> ${rewardWallet}`);
  res.json({ ok: true, reward_wallet_evm: rewardWallet, reward_wallet_solana: rewardWallet });
});

// Soft leave: sets left_at so getActiveTournamentForPlayer stops returning
// this row. Keeps the historical counters around so we can show "your
// previous score in tournament X" later if we want to.
router.post('/tournaments/:id/leave', auth, (req, res) => {
  const tid = parseInt(req.params.id, 10);
  if (!Number.isFinite(tid)) return res.status(400).json({ error: 'invalid id' });
  const r = db.db.prepare(`
    UPDATE tournament_participants SET left_at = datetime('now')
    WHERE tournament_id = ? AND player_id = ? AND left_at IS NULL
  `).run(tid, req.player.id);
  console.log(`[tournament ${tid} leave] player=${req.player.name} -> ${r.changes > 0 ? 'LEFT' : 'NO_OP_was_not_joined'}`);
  res.json({ ok: true, left: r.changes > 0 });
});

// Real-time leaderboard for a tournament. Public endpoint — no auth, anyone
// can spectate. Sort column comes from the tournament's `sort_by` setting,
// not the request, so spectators can't game the ordering by sending crafted
// params.
// Daily-pool readers used by the player-facing tournament panel. The estimate
// mirrors the midnight award formula, but runs against today's current rows.
function tournamentUtcDayString(date = new Date()) {
  return date.toISOString().slice(0, 10);
}

function readTournamentDailyRunDetails(row) {
  if (!row) return {};
  try { return JSON.parse(row.details_json || '{}') || {}; }
  catch { return {}; }
}

function buildTournamentDailyEstimate(activityRows, t, dayUtc = tournamentUtcDayString()) {
  const poolState = tournamentDailyPoolPointsForDay(t, dayUtc);
  const pool = poolState.points;
  const weights = tournamentPointWeights(t);
  const categories = [
    { key: 'trophies', column: 'trophies', weight: weights.trophies },
    { key: 'volume', column: 'volume_usd', weight: weights.volume },
    { key: 'pnl', column: 'pnl_usd', weight: weights.pnl },
  ];
  const byPlayer = new Map(activityRows.map(row => [row.player_id, {
    estimated_points: 0,
    estimated_trophy_points: 0,
    estimated_volume_points: 0,
    estimated_pnl_points: 0,
  }]));
  const details = { pool, pool_state: poolState, weights, categories: {} };
  let totalPoints = 0;

  for (const cat of categories) {
    const catPool = pool * (Math.max(0, Number(cat.weight) || 0) / 100);
    const values = activityRows.map(row => ({
      player_id: row.player_id,
      value: Math.max(0, Number(row[cat.column]) || 0),
    })).filter(row => row.value > 0);
    const rawTotal = values.reduce((sum, row) => sum + row.value, 0);
    details.categories[cat.key] = {
      pool: Number(catPool.toFixed(6)),
      raw_total: Number(rawTotal.toFixed(6)),
      players: values.length,
    };
    if (catPool <= 0 || rawTotal <= 0) continue;

    for (const row of values) {
      const points = Number((catPool * (row.value / rawTotal)).toFixed(6));
      if (points <= 0) continue;
      const target = byPlayer.get(row.player_id) || {
        estimated_points: 0,
        estimated_trophy_points: 0,
        estimated_volume_points: 0,
        estimated_pnl_points: 0,
      };
      target.estimated_points += points;
      if (cat.key === 'trophies') target.estimated_trophy_points += points;
      if (cat.key === 'volume') target.estimated_volume_points += points;
      if (cat.key === 'pnl') target.estimated_pnl_points += points;
      byPlayer.set(row.player_id, target);
      totalPoints += points;
    }
  }

  for (const target of byPlayer.values()) {
    target.estimated_points = Number(target.estimated_points.toFixed(6));
    target.estimated_trophy_points = Number(target.estimated_trophy_points.toFixed(6));
    target.estimated_volume_points = Number(target.estimated_volume_points.toFixed(6));
    target.estimated_pnl_points = Number(target.estimated_pnl_points.toFixed(6));
  }

  return { total_points: Number(totalPoints.toFixed(6)), details, byPlayer };
}

function buildTournamentDailyPointRows(t, options = {}) {
  const tid = Number(t?.id);
  if (!Number.isFinite(tid)) return [];
  const limit = Math.max(1, Math.min(60, parseInt(options.limit, 10) || 7));
  const includeCurrentDay = options.includeCurrentDay !== false && tournamentPhase(t) === 'live';
  const daySet = new Set(db.db.prepare(`
    SELECT day_utc FROM (
      SELECT day_utc FROM tournament_daily_activity WHERE tournament_id = ?
      UNION
      SELECT day_utc FROM tournament_daily_awards WHERE tournament_id = ?
      UNION
      SELECT day_utc FROM tournament_daily_point_runs WHERE tournament_id = ?
    )
  `).all(tid, tid, tid).map(row => row.day_utc).filter(Boolean));
  if (includeCurrentDay) daySet.add(tournamentUtcDayString());
  const days = Array.from(daySet).sort((a, b) => String(b).localeCompare(String(a))).slice(0, limit);
  const participantRows = db.db.prepare(`
    SELECT tp.player_id, p.name, p.wallet, p.dex
    FROM tournament_participants tp
    LEFT JOIN players p ON p.id = tp.player_id
    WHERE tp.tournament_id = ? AND tp.left_at IS NULL
  `).all(tid);
  const runByDay = new Map(db.db.prepare(`
    SELECT day_utc, processed_at, total_points, details_json
    FROM tournament_daily_point_runs
    WHERE tournament_id = ?
  `).all(tid).map(row => [row.day_utc, row]));

  return days.map((day) => {
    const activityRows = db.db.prepare(`
      SELECT a.player_id, p.name, p.wallet, COALESCE(p.dex, a.dex) AS dex,
             COALESCE(SUM(a.trades_count), 0) AS trades_count,
             COALESCE(SUM(a.volume_usd), 0) AS volume_usd,
             COALESCE(SUM(a.pnl_usd), 0) AS pnl_usd,
             COALESCE(SUM(a.trophies), 0) AS trophies,
             COALESCE(SUM(a.gold), 0) AS gold,
             COUNT(*) AS events
      FROM tournament_daily_activity a
      LEFT JOIN players p ON p.id = a.player_id
      WHERE a.tournament_id = ? AND a.day_utc = ?
      GROUP BY a.player_id
    `).all(tid, day);
    const awardRows = db.db.prepare(`
      SELECT a.player_id, p.name, p.wallet, p.dex,
             COALESCE(SUM(a.points), 0) AS awarded_points,
             COALESCE(SUM(CASE WHEN a.category = 'trophies' THEN a.points ELSE 0 END), 0) AS trophy_points,
             COALESCE(SUM(CASE WHEN a.category = 'volume' THEN a.points ELSE 0 END), 0) AS volume_points,
             COALESCE(SUM(CASE WHEN a.category = 'pnl' THEN a.points ELSE 0 END), 0) AS pnl_points,
             COALESCE(SUM(CASE WHEN a.category = 'trophies' THEN a.raw_value ELSE 0 END), 0) AS raw_trophies,
             COALESCE(SUM(CASE WHEN a.category = 'volume' THEN a.raw_value ELSE 0 END), 0) AS raw_volume_usd,
             COALESCE(SUM(CASE WHEN a.category = 'pnl' THEN a.raw_value ELSE 0 END), 0) AS raw_pnl_usd
      FROM tournament_daily_awards a
      LEFT JOIN players p ON p.id = a.player_id
      WHERE a.tournament_id = ? AND a.day_utc = ?
      GROUP BY a.player_id
    `).all(tid, day);
    const byPlayer = new Map();
    for (const row of participantRows) {
      byPlayer.set(row.player_id, {
        player_id: row.player_id,
        name: row.name,
        wallet: row.wallet,
        dex: row.dex,
        events: 0,
        trades_count: 0,
        volume_usd: 0,
        pnl_usd: 0,
        trophies: 0,
        gold: 0,
        awarded_points: 0,
        trophy_points: 0,
        volume_points: 0,
        pnl_points: 0,
        raw_trophies: 0,
        raw_volume_usd: 0,
        raw_pnl_usd: 0,
      });
    }
    for (const row of activityRows) {
      const existing = byPlayer.get(row.player_id) || {};
      byPlayer.set(row.player_id, {
        ...existing,
        player_id: row.player_id,
        name: existing.name || row.name,
        wallet: existing.wallet || row.wallet,
        dex: existing.dex || row.dex,
        events: Number(row.events || 0),
        trades_count: Number(row.trades_count || 0),
        volume_usd: Number(row.volume_usd || 0),
        pnl_usd: Number(row.pnl_usd || 0),
        trophies: Number(row.trophies || 0),
        gold: Number(row.gold || 0),
        awarded_points: Number(existing.awarded_points || 0),
        trophy_points: Number(existing.trophy_points || 0),
        volume_points: Number(existing.volume_points || 0),
        pnl_points: Number(existing.pnl_points || 0),
        raw_trophies: Number(existing.raw_trophies || 0),
        raw_volume_usd: Number(existing.raw_volume_usd || 0),
        raw_pnl_usd: Number(existing.raw_pnl_usd || 0),
      });
    }
    for (const row of awardRows) {
      const existing = byPlayer.get(row.player_id) || {};
      byPlayer.set(row.player_id, {
        ...existing,
        player_id: row.player_id,
        name: existing.name || row.name,
        wallet: existing.wallet || row.wallet,
        dex: existing.dex || row.dex,
        events: Number(existing.events || 0),
        trades_count: Number(existing.trades_count || 0),
        volume_usd: Number(existing.volume_usd || 0),
        pnl_usd: Number(existing.pnl_usd || 0),
        trophies: Number(existing.trophies || 0),
        gold: Number(existing.gold || 0),
        awarded_points: Number(row.awarded_points || 0),
        trophy_points: Number(row.trophy_points || 0),
        volume_points: Number(row.volume_points || 0),
        pnl_points: Number(row.pnl_points || 0),
        raw_trophies: Number(row.raw_trophies || 0),
        raw_volume_usd: Number(row.raw_volume_usd || 0),
        raw_pnl_usd: Number(row.raw_pnl_usd || 0),
      });
    }

    const estimate = buildTournamentDailyEstimate(Array.from(byPlayer.values()), t, day);
    const players = Array.from(byPlayer.values()).map((row) => {
      const estimated = estimate.byPlayer.get(row.player_id) || {};
      return {
        ...row,
        estimated_points: Number(estimated.estimated_points || 0),
        estimated_trophy_points: Number(estimated.estimated_trophy_points || 0),
        estimated_volume_points: Number(estimated.estimated_volume_points || 0),
        estimated_pnl_points: Number(estimated.estimated_pnl_points || 0),
      };
    });
    const processed = !!runByDay.get(day);
    players.sort((a, b) => {
      const primary = processed
        ? (Number(b.awarded_points) || 0) - (Number(a.awarded_points) || 0)
        : (Number(b.estimated_points) || 0) - (Number(a.estimated_points) || 0);
      return primary
        || (Number(b.volume_usd) || 0) - (Number(a.volume_usd) || 0)
        || (Number(b.trophies) || 0) - (Number(a.trophies) || 0)
        || String(a.player_id).localeCompare(String(b.player_id));
    });
    players.forEach((row, index) => { row.rank = index + 1; });
    const estimateSorted = [...players].sort((a, b) =>
      (Number(b.estimated_points) || 0) - (Number(a.estimated_points) || 0)
      || (Number(b.volume_usd) || 0) - (Number(a.volume_usd) || 0)
      || (Number(b.trophies) || 0) - (Number(a.trophies) || 0)
      || String(a.player_id).localeCompare(String(b.player_id))
    );
    estimateSorted.forEach((row, index) => { row.estimate_rank = index + 1; });

    const totals = players.reduce((acc, row) => {
      acc.players += 1;
      acc.events += Number(row.events || 0);
      acc.trades_count += Number(row.trades_count || 0);
      acc.volume_usd += Number(row.volume_usd || 0);
      acc.pnl_usd += Number(row.pnl_usd || 0);
      acc.trophies += Number(row.trophies || 0);
      acc.gold += Number(row.gold || 0);
      acc.awarded_points += Number(row.awarded_points || 0);
      acc.estimated_points += Number(row.estimated_points || 0);
      return acc;
    }, { players: 0, events: 0, trades_count: 0, volume_usd: 0, pnl_usd: 0, trophies: 0, gold: 0, awarded_points: 0, estimated_points: 0 });
    totals.volume_usd = Number(totals.volume_usd.toFixed(2));
    totals.pnl_usd = Number(totals.pnl_usd.toFixed(2));
    totals.awarded_points = Number(totals.awarded_points.toFixed(6));
    totals.estimated_points = Number(totals.estimated_points.toFixed(6));

    const run = runByDay.get(day);
    return {
      day_utc: day,
      processed,
      run: run ? {
        processed_at: run.processed_at,
        total_points: Number(run.total_points || 0),
        details: readTournamentDailyRunDetails(run),
      } : null,
      estimate: estimate.details,
      estimate_total_points: estimate.total_points,
      totals,
      players,
    };
  });
}

router.get('/tournaments/:id/daily-points', (req, res) => {
  const tid = parseInt(req.params.id, 10);
  if (!Number.isFinite(tid)) return res.status(400).json({ error: 'invalid id' });
  const t = db.db.prepare('SELECT * FROM tournaments WHERE id = ?').get(tid);
  if (!t) return res.status(404).json({ error: 'tournament not found' });
  if (!tournamentUsesDailyPool(t)) {
    return res.json({ tournament: tournamentRowToPublic(t), my_player_id: null, days: [] });
  }

  let viewer = null;
  const token = req.headers['x-token'];
  if (typeof token === 'string' && token.length > 10) {
    try { viewer = db.authenticatePlayer(token); } catch {}
  }
  if (viewer && tournamentPhase(t) === 'live' && isTournamentForDex(t, viewer.dex)) {
    const participant = db.db.prepare(`
      SELECT left_at FROM tournament_participants
      WHERE tournament_id = ? AND player_id = ?
    `).get(tid, viewer.id);
    if (participant && participant.left_at === null) {
      try { syncFuturesTournamentRows(viewer.id, viewer.dex); } catch {}
    }
  }

  const totalVolumeUsd = tournamentTotalVolumeUsd(tid);
  const limit = Math.max(1, Math.min(60, parseInt(req.query.limit, 10) || 7));
  res.json({
    tournament: tournamentRowToPublic(t, { totalVolumeUsd }),
    my_player_id: viewer?.id || null,
    server_day_utc: tournamentUtcDayString(),
    days: buildTournamentDailyPointRows(t, { limit }),
  });
});

// Real-time leaderboard for a tournament. Public endpoint, anyone can spectate.
router.get('/tournaments/:id/leaderboard', (req, res) => {
  const tid = parseInt(req.params.id, 10);
  if (!Number.isFinite(tid)) return res.status(400).json({ error: 'invalid id' });
  const t = db.db.prepare('SELECT * FROM tournaments WHERE id = ?').get(tid);
  if (!t) return res.status(404).json({ error: 'tournament not found' });
  // Whitelist sort columns to defend against future schema drift.
  const sortBy = normalizeTournamentSort(t.sort_by);
  const col = TOURNAMENT_SQL_SORT_COLS[sortBy] || 'tp.pnl_usd';
  const limit = Math.min(parseInt(req.query.limit, 10) || 50, 200);
  const includeRewardWallets = isAdminRequest(req);
  const mode = normalizeTournamentMode(t.mode);
  const needsPointsScore = isTournamentPointsSort(sortBy)
    || tournamentUsesDailyPool(t)
    || normalizeTournamentTeamMetric(t.team_score_by, 'volume_usd') === TOURNAMENT_POINTS_SORT
    || normalizeTournamentTeamMetric(t.team_member_reward_by, 'volume_usd') === TOURNAMENT_POINTS_SORT;
  const baseSql = `
    SELECT tp.player_id, tp.trophies, tp.gold, tp.trades_count, tp.volume_usd, tp.pnl_usd, tp.awarded_points,
           tp.team_dex, tp.reward_wallet_evm,
           p.name, p.wallet, p.dex AS player_dex
    FROM tournament_participants tp
    JOIN players p ON p.id = tp.player_id
    WHERE tp.tournament_id = ? AND tp.left_at IS NULL
  `;
  let rows;
  let teamState = null;
  if (mode === 'dex_vs_dex') {
    rows = db.db.prepare(baseSql).all(tid);
    if (needsPointsScore) applyTournamentPointsScore(rows, t);
  } else if (isTournamentPointsSort(sortBy) || tournamentUsesDailyPool(t)) {
    rows = applyTournamentPointsScore(db.db.prepare(baseSql).all(tid), t)
      .sort((a, b) =>
        (Number(b.score) || 0) - (Number(a.score) || 0)
        || (Number(b.volume_usd) || 0) - (Number(a.volume_usd) || 0)
        || (Number(b.pnl_usd) || 0) - (Number(a.pnl_usd) || 0)
        || (Number(b.trophies) || 0) - (Number(a.trophies) || 0)
        || (Number(b.trades_count) || 0) - (Number(a.trades_count) || 0)
        || String(a.player_id).localeCompare(String(b.player_id))
      )
      .slice(0, limit);
  } else {
    rows = db.db.prepare(`
      ${baseSql}
    ORDER BY ${col} DESC, tp.trades_count DESC, tp.player_id ASC
    LIMIT ?
    `).all(tid, limit);
  }
  const totalVolumeUsd = tournamentTotalVolumeUsd(tid);
  const prize = tournamentPrizeState(t, totalVolumeUsd);
  if (mode === 'dex_vs_dex') {
    teamState = buildTournamentTeamState(rows, t, prize);
    const memberMetric = normalizeTournamentTeamMetric(t.team_member_reward_by, 'volume_usd');
    rows = rows
      .sort((a, b) =>
        (Number(a.team_rank || 999) - Number(b.team_rank || 999))
        || (Number(b.member_reward_value) || 0) - (Number(a.member_reward_value) || 0)
        || tournamentRowMetricValue(b, memberMetric, t) - tournamentRowMetricValue(a, memberMetric, t)
        || (Number(b.volume_usd) || 0) - (Number(a.volume_usd) || 0)
        || String(a.player_id).localeCompare(String(b.player_id))
      )
      .slice(0, limit);
  }
  const prizeByRank = new Map((prize.payouts || []).map(p => [Number(p.rank), Number(p.amount_usd || 0)]));
  const prizeRewardsByRank = new Map((prize.rewards_by_rank || []).map(p => [Number(p.rank), Array.isArray(p.rewards) ? p.rewards : []]));
  res.json({
    tournament: tournamentRowToPublic(t, { totalVolumeUsd }),
    sort_by: sortBy,
    sort_label: tournamentSortLabel(t),
    prize,
    teams: teamState,
    leaderboard: rows.map((r, i) => ({
      rank: i + 1,
      player_id: r.player_id,
      name: r.name,
      wallet: r.wallet,
      dex: r.player_dex || r.team_dex || null,
      team_dex: r.team_dex || r.player_dex || null,
      team_label: r.team_label || null,
      team_rank: r.team_rank || null,
      team_score: r.team_score ?? null,
      team_prize_pool_usd: r.team_prize_pool_usd ?? null,
      team_prize_share_pct: r.team_prize_share_pct ?? null,
      member_reward_value: r.member_reward_value ?? null,
      trophies: r.trophies,
      gold: r.gold,
      trades_count: r.trades_count,
      volume_usd: r.volume_usd,
      pnl_usd: r.pnl_usd,
      awarded_points: r.awarded_points || 0,
      score: r.score ?? null,
      volume_score: r.volume_score ?? null,
      trophy_score: r.trophy_score ?? null,
      pnl_score: r.pnl_score ?? null,
      prize_amount: mode === 'dex_vs_dex' ? (r.prize_amount || 0) : (prizeByRank.get(i + 1) || 0),
      prize_currency: prize.currency,
      prize_rewards: mode === 'dex_vs_dex' ? [] : (prizeRewardsByRank.get(i + 1) || []),
      ...(includeRewardWallets ? { reward_wallet_evm: r.reward_wallet_evm || null } : {}),
    })),
  });
});

// ── Admin tournament management ───────────────────────────────────────

// List ALL tournaments (incl. drafts and ended) for the admin panel.
router.get('/admin/tournaments', adminAuth, (req, res) => {
  const rows = db.db.prepare('SELECT * FROM tournaments ORDER BY id DESC').all();
  // Attach participant count per tournament for the admin list view.
  const counts = db.db.prepare(`
    SELECT tournament_id,
           COUNT(player_id) AS players,
           SUM(CASE WHEN player_id IS NOT NULL AND left_at IS NULL THEN 1 ELSE 0 END) AS active_players,
           COALESCE(SUM(CASE WHEN left_at IS NULL THEN volume_usd ELSE 0 END), 0) AS active_volume_usd
    FROM tournament_participants
    GROUP BY tournament_id
  `).all();
  const countMap = {};
  for (const c of counts) countMap[c.tournament_id] = c;
  res.json({
    tournaments: rows.map(t => ({
      ...tournamentRowToPublic(t, { totalVolumeUsd: countMap[t.id]?.active_volume_usd || 0 }),
      participants: countMap[t.id]?.active_players || 0,
      registered: countMap[t.id]?.players || 0,
    })),
  });
});

// Create a tournament. start_at defaults to now, end_at is optional, boosts
// default to 1.0 (no boost), sort_by defaults to raw weighted points.
router.post('/admin/tournaments', adminAuth, (req, res) => {
  const {
    name, description, start_at, end_at, gold_boost, seeker_gold_boost, trophy_boost, sort_by, status,
    shield_hours, freeze_trophies, preregistration_enabled, registration_opens_at, registration_closes_at,
    points_trophy_weight, points_volume_weight, points_pnl_weight,
    scoring_mode, daily_pool_points, daily_pool_growth_pct, daily_pool_overrides,
    prize_currency, prize_tiers, rewards_in_cop, seeker_only,
    mode, team_score_by, team_prize_mode, team_prize_splits, team_member_reward_by, attack_match_policy,
  } = req.body || {};
  if (!name || typeof name !== 'string') return res.status(400).json({ error: 'name required' });
  const dexConfig = normalizeTournamentDexConfig(req.body || {});
  const tournamentMode = normalizeTournamentMode(mode);
  const teamScoreBy = normalizeTournamentTeamMetric(team_score_by, 'volume_usd');
  const teamPrizeMode = normalizeTournamentTeamPrizeMode(team_prize_mode, 'winner_takes_all');
  const teamMemberRewardBy = normalizeTournamentTeamMetric(team_member_reward_by, 'volume_usd');
  const attackMatchPolicy = normalizeTournamentAttackMatchPolicy(attack_match_policy, 'all');
  const scoringMode = normalizeTournamentScoringMode(scoring_mode, 'live');
  const dailyPoolPoints = normalizeTournamentDailyPoolPoints(daily_pool_points, 1000);
  let dailyPoolOverrides;
  let dailyPoolGrowthPct;
  try {
    dailyPoolGrowthPct = normalizeTournamentDailyPoolGrowthPct(daily_pool_growth_pct, 0);
    dailyPoolOverrides = normalizeTournamentDailyPoolOverrides(daily_pool_overrides);
  } catch (e) {
    return res.status(400).json({ error: e.message });
  }
  if (tournamentMode === 'dex_vs_dex' && tournamentEligibleDexes(dexConfig).length < 2) {
    return res.status(400).json({ error: 'DEX vs DEX tournaments need at least two eligible DEXes' });
  }
  const sortCol = scoringMode === 'daily_pool' ? TOURNAMENT_POINTS_SORT : normalizeTournamentSort(sort_by, TOURNAMENT_POINTS_SORT);
  const needsPointWeights = sortCol === TOURNAMENT_POINTS_SORT
    || scoringMode === 'daily_pool'
    || (tournamentMode === 'dex_vs_dex' && (teamScoreBy === TOURNAMENT_POINTS_SORT || teamMemberRewardBy === TOURNAMENT_POINTS_SORT));
  const STATUSES = ['active', 'ended', 'draft'];
  const stat = STATUSES.includes(status) ? status : 'active';
  // Boosts clamped to a sane range so an admin typo can't print 1000x gold.
  const gb = normalizeTournamentBoost(gold_boost, 1);
  const sgb = normalizeTournamentBoost(seeker_gold_boost, 1);
  const tb = normalizeTournamentBoost(trophy_boost, 1);
  const freeze = freeze_trophies === undefined ? 1 : (parseBool(freeze_trophies) ? 1 : 0);
  let startIso, endIso, registrationOpenIso, registrationCloseIso;
  try {
    startIso = start_at && typeof start_at === 'string'
      ? normalizeTournamentDate(start_at, 'start_at', { nullable: false })
      : nowSql();
    endIso = end_at && typeof end_at === 'string' ? normalizeTournamentDate(end_at, 'end_at') : null;
    registrationOpenIso = registration_opens_at && typeof registration_opens_at === 'string'
      ? normalizeTournamentDate(registration_opens_at, 'registration_opens_at')
      : null;
    registrationCloseIso = registration_closes_at && typeof registration_closes_at === 'string'
      ? normalizeTournamentDate(registration_closes_at, 'registration_closes_at')
      : null;
  } catch (e) {
    return res.status(400).json({ error: e.message });
  }
  const windowError = validateTournamentWindow({
    start_at: startIso,
    end_at: endIso,
    registration_opens_at: registrationOpenIso,
    registration_closes_at: registrationCloseIso,
  });
  if (windowError) return res.status(400).json({ error: windowError });
  let pointWeights;
  let prizeTiers;
  let shieldHours;
  try {
    shieldHours = normalizeTournamentShieldHours(shield_hours, null);
    pointWeights = normalizeTournamentPointWeights({
      sort_by: sortCol,
      points_trophy_weight,
      points_volume_weight,
      points_pnl_weight,
    }, DEFAULT_TOURNAMENT_POINT_WEIGHTS, { requireTotal: needsPointWeights });
    prizeTiers = normalizeTournamentPrizeTiers(prize_tiers, { strict: true });
  } catch (e) {
    return res.status(400).json({ error: e.message });
  }
  let teamSplits;
  try {
    teamSplits = teamPrizeMode === 'custom_split'
      ? normalizeTournamentTeamPrizeSplits(team_prize_splits, tournamentEligibleDexes(dexConfig), { strict: tournamentMode === 'dex_vs_dex' })
      : [];
  } catch (e) {
    return res.status(400).json({ error: e.message });
  }
  const prereg = parseBool(preregistration_enabled) ? 1 : 0;
  const r = db.db.prepare(`
    INSERT INTO tournaments (
      name, description, dex, dex_scope, eligible_dexes, mode, team_score_by, team_prize_mode, team_prize_splits, team_member_reward_by, attack_match_policy, start_at, end_at, gold_boost, seeker_gold_boost, trophy_boost, sort_by, status,
      points_trophy_weight, points_volume_weight, points_pnl_weight,
      scoring_mode, daily_pool_points, daily_pool_growth_pct, daily_pool_overrides, daily_pool_enabled_at,
      prize_currency, prize_tiers, rewards_in_cop, seeker_only,
      shield_hours, freeze_trophies, preregistration_enabled, registration_opens_at, registration_closes_at
    )
    VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
  `).run(
    name.trim(),
    (description || '').toString().slice(0, 500),
    dexConfig.dex,
    dexConfig.dex_scope,
    dexConfig.eligible_dexes,
    tournamentMode,
    teamScoreBy,
    teamPrizeMode,
    JSON.stringify(teamSplits),
    teamMemberRewardBy,
    attackMatchPolicy,
    startIso,
    endIso,
    gb,
    sgb,
    tb,
    sortCol,
    stat,
    pointWeights.trophies,
    pointWeights.volume,
    pointWeights.pnl,
    scoringMode,
    dailyPoolPoints,
    dailyPoolGrowthPct,
    JSON.stringify(dailyPoolOverrides),
    scoringMode === 'daily_pool' ? nowSql() : null,
    sanitizePrizeCurrency(prize_currency),
    JSON.stringify(prizeTiers),
    parseBool(rewards_in_cop) ? 1 : 0,
    parseBool(seeker_only) ? 1 : 0,
    shieldHours,
    freeze,
    prereg,
    registrationOpenIso,
    registrationCloseIso
  );
  const t = db.db.prepare('SELECT * FROM tournaments WHERE id = ?').get(r.lastInsertRowid);
  res.json({ ok: true, tournament: tournamentRowToPublic(t) });
});

// Patch tournament fields. All fields optional; only sent ones get updated.
router.patch('/admin/tournaments/:id', adminAuth, (req, res) => {
  const tid = parseInt(req.params.id, 10);
  if (!Number.isFinite(tid)) return res.status(400).json({ error: 'invalid id' });
  const t = db.db.prepare('SELECT * FROM tournaments WHERE id = ?').get(tid);
  if (!t) return res.status(404).json({ error: 'not found' });
  const {
    name, description, start_at, end_at, gold_boost, seeker_gold_boost, trophy_boost, sort_by, status,
    shield_hours, freeze_trophies, preregistration_enabled, registration_opens_at, registration_closes_at,
    points_trophy_weight, points_volume_weight, points_pnl_weight,
    scoring_mode, daily_pool_points, daily_pool_growth_pct, daily_pool_overrides,
    prize_currency, prize_tiers, rewards_in_cop, seeker_only,
    mode, team_score_by, team_prize_mode, team_prize_splits, team_member_reward_by, attack_match_policy,
  } = req.body || {};
  const dexConfig = normalizeTournamentDexConfig(req.body || {}, t);
  const tournamentMode = normalizeTournamentMode(mode !== undefined ? mode : t.mode);
  const teamScoreBy = normalizeTournamentTeamMetric(team_score_by !== undefined ? team_score_by : t.team_score_by, 'volume_usd');
  const teamPrizeMode = normalizeTournamentTeamPrizeMode(team_prize_mode !== undefined ? team_prize_mode : t.team_prize_mode, 'winner_takes_all');
  const teamMemberRewardBy = normalizeTournamentTeamMetric(team_member_reward_by !== undefined ? team_member_reward_by : t.team_member_reward_by, 'volume_usd');
  const attackMatchPolicy = normalizeTournamentAttackMatchPolicy(attack_match_policy !== undefined ? attack_match_policy : t.attack_match_policy, 'all');
  const nextScoringMode = normalizeTournamentScoringMode(scoring_mode !== undefined ? scoring_mode : t.scoring_mode, 'live');
  const nextDailyPoolPoints = normalizeTournamentDailyPoolPoints(daily_pool_points !== undefined ? daily_pool_points : t.daily_pool_points, 1000);
  let nextDailyPoolGrowthPct;
  let nextDailyPoolOverrides;
  try {
    nextDailyPoolGrowthPct = normalizeTournamentDailyPoolGrowthPct(daily_pool_growth_pct !== undefined ? daily_pool_growth_pct : t.daily_pool_growth_pct, 0);
    nextDailyPoolOverrides = normalizeTournamentDailyPoolOverrides(daily_pool_overrides !== undefined ? daily_pool_overrides : t.daily_pool_overrides);
  } catch (e) {
    return res.status(400).json({ error: e.message });
  }
  if (tournamentMode === 'dex_vs_dex' && tournamentEligibleDexes(dexConfig).length < 2) {
    return res.status(400).json({ error: 'DEX vs DEX tournaments need at least two eligible DEXes' });
  }
  const STATUSES = ['active', 'ended', 'draft'];
  let nextStartAt, nextEndAt, nextRegistrationOpensAt, nextRegistrationClosesAt;
  try {
    nextStartAt = start_at !== undefined
      ? normalizeTournamentDate(start_at, 'start_at', { nullable: false })
      : cleanSqlDate(t.start_at);
    nextEndAt = end_at === null || end_at === ''
      ? null
      : (end_at !== undefined ? normalizeTournamentDate(end_at, 'end_at') : cleanSqlDate(t.end_at));
    nextRegistrationOpensAt = registration_opens_at === null || registration_opens_at === ''
      ? null
      : (registration_opens_at !== undefined ? normalizeTournamentDate(registration_opens_at, 'registration_opens_at') : cleanSqlDate(t.registration_opens_at));
    nextRegistrationClosesAt = registration_closes_at === null || registration_closes_at === ''
      ? null
      : (registration_closes_at !== undefined ? normalizeTournamentDate(registration_closes_at, 'registration_closes_at') : cleanSqlDate(t.registration_closes_at));
  } catch (e) {
    return res.status(400).json({ error: e.message });
  }
  const windowError = validateTournamentWindow({
    start_at: nextStartAt,
    end_at: nextEndAt,
    registration_opens_at: nextRegistrationOpensAt,
    registration_closes_at: nextRegistrationClosesAt,
  });
  if (windowError) return res.status(400).json({ error: windowError });
  const nextSortBy = nextScoringMode === 'daily_pool' ? TOURNAMENT_POINTS_SORT : normalizeTournamentSort(sort_by, t.sort_by);
  const needsPointWeights = nextSortBy === TOURNAMENT_POINTS_SORT
    || nextScoringMode === 'daily_pool'
    || (tournamentMode === 'dex_vs_dex' && (teamScoreBy === TOURNAMENT_POINTS_SORT || teamMemberRewardBy === TOURNAMENT_POINTS_SORT));
  let pointWeights;
  let nextPrizeTiers;
  let teamSplits;
  let nextShieldHours;
  try {
    nextShieldHours = normalizeTournamentShieldHours(shield_hours, t.shield_hours === null || t.shield_hours === undefined ? null : Number(t.shield_hours));
    const fallbackWeights = tournamentPointWeights(t);
    pointWeights = normalizeTournamentPointWeights({
      sort_by: nextSortBy,
      points_trophy_weight: points_trophy_weight !== undefined ? points_trophy_weight : t.points_trophy_weight,
      points_volume_weight: points_volume_weight !== undefined ? points_volume_weight : t.points_volume_weight,
      points_pnl_weight: points_pnl_weight !== undefined ? points_pnl_weight : t.points_pnl_weight,
    }, fallbackWeights, { requireTotal: needsPointWeights });
    nextPrizeTiers = prize_tiers !== undefined
      ? normalizeTournamentPrizeTiers(prize_tiers, { strict: true })
      : normalizeTournamentPrizeTiers(t.prize_tiers);
    teamSplits = teamPrizeMode === 'custom_split'
      ? normalizeTournamentTeamPrizeSplits(team_prize_splits !== undefined ? team_prize_splits : t.team_prize_splits, tournamentEligibleDexes(dexConfig), { strict: tournamentMode === 'dex_vs_dex' })
      : [];
  } catch (e) {
    return res.status(400).json({ error: e.message });
  }
  const next = {
    name: name && typeof name === 'string' ? name.trim() : t.name,
    description: description !== undefined ? String(description).slice(0, 500) : t.description,
    dex: dexConfig.dex,
    dex_scope: dexConfig.dex_scope,
    eligible_dexes: dexConfig.eligible_dexes,
    mode: tournamentMode,
    team_score_by: teamScoreBy,
    team_prize_mode: teamPrizeMode,
    team_prize_splits: teamSplits,
    team_member_reward_by: teamMemberRewardBy,
    attack_match_policy: attackMatchPolicy,
    start_at: nextStartAt,
    end_at: nextEndAt,
    gold_boost: gold_boost !== undefined ? normalizeTournamentBoost(gold_boost, 1) : normalizeTournamentBoost(t.gold_boost, 1),
    seeker_gold_boost: seeker_gold_boost !== undefined ? normalizeTournamentBoost(seeker_gold_boost, 1) : normalizeTournamentBoost(t.seeker_gold_boost, 1),
    trophy_boost: trophy_boost !== undefined ? normalizeTournamentBoost(trophy_boost, 1) : normalizeTournamentBoost(t.trophy_boost, 1),
    shield_hours: nextShieldHours,
    freeze_trophies: freeze_trophies !== undefined
      ? (parseBool(freeze_trophies) ? 1 : 0)
      : Number(t.freeze_trophies ?? 1),
    sort_by: nextSortBy,
    points_trophy_weight: pointWeights.trophies,
    points_volume_weight: pointWeights.volume,
    points_pnl_weight: pointWeights.pnl,
    scoring_mode: nextScoringMode,
    daily_pool_points: nextDailyPoolPoints,
    daily_pool_growth_pct: nextDailyPoolGrowthPct,
    daily_pool_overrides: nextDailyPoolOverrides,
    daily_pool_enabled_at: nextScoringMode === 'daily_pool'
      ? (normalizeTournamentScoringMode(t.scoring_mode, 'live') === 'daily_pool' ? (cleanSqlDate(t.daily_pool_enabled_at) || nowSql()) : nowSql())
      : null,
    prize_currency: prize_currency !== undefined ? sanitizePrizeCurrency(prize_currency) : sanitizePrizeCurrency(t.prize_currency),
    prize_tiers: nextPrizeTiers,
    rewards_in_cop: rewards_in_cop !== undefined ? (parseBool(rewards_in_cop) ? 1 : 0) : Number(t.rewards_in_cop || 0),
    seeker_only: seeker_only !== undefined ? (parseBool(seeker_only) ? 1 : 0) : Number(t.seeker_only || 0),
    status: STATUSES.includes(status) ? status : t.status,
    preregistration_enabled: preregistration_enabled !== undefined
      ? (parseBool(preregistration_enabled) ? 1 : 0)
      : Number(t.preregistration_enabled || 0),
    registration_opens_at: nextRegistrationOpensAt,
    registration_closes_at: nextRegistrationClosesAt,
  };
  db.db.prepare(`
    UPDATE tournaments SET name = ?, description = ?, dex = ?, dex_scope = ?, eligible_dexes = ?,
                            mode = ?, team_score_by = ?, team_prize_mode = ?, team_prize_splits = ?, team_member_reward_by = ?, attack_match_policy = ?,
                            start_at = ?, end_at = ?,
                            gold_boost = ?, seeker_gold_boost = ?, trophy_boost = ?, shield_hours = ?, sort_by = ?, status = ?,
                            points_trophy_weight = ?, points_volume_weight = ?, points_pnl_weight = ?,
                            scoring_mode = ?, daily_pool_points = ?, daily_pool_growth_pct = ?, daily_pool_overrides = ?, daily_pool_enabled_at = ?,
                            prize_currency = ?, prize_tiers = ?, rewards_in_cop = ?, seeker_only = ?,
                            freeze_trophies = ?, preregistration_enabled = ?, registration_opens_at = ?, registration_closes_at = ?
    WHERE id = ?
  `).run(
    next.name,
    next.description,
    next.dex,
    next.dex_scope,
    next.eligible_dexes,
    next.mode,
    next.team_score_by,
    next.team_prize_mode,
    JSON.stringify(next.team_prize_splits),
    next.team_member_reward_by,
    next.attack_match_policy,
    next.start_at,
    next.end_at,
    next.gold_boost,
    next.seeker_gold_boost,
    next.trophy_boost,
    next.shield_hours,
    next.sort_by,
    next.status,
    next.points_trophy_weight,
    next.points_volume_weight,
    next.points_pnl_weight,
    next.scoring_mode,
    next.daily_pool_points,
    next.daily_pool_growth_pct,
    JSON.stringify(next.daily_pool_overrides),
    next.daily_pool_enabled_at,
    next.prize_currency,
    JSON.stringify(next.prize_tiers),
    next.rewards_in_cop,
    next.seeker_only,
    next.freeze_trophies,
    next.preregistration_enabled,
    next.registration_opens_at,
    next.registration_closes_at,
    tid
  );
  if (normalizeTournamentScoringMode(t.scoring_mode, 'live') !== 'daily_pool' && next.scoring_mode === 'daily_pool') {
    try { db.seedTournamentDailyPoolBaseline(tid); } catch (e) { console.warn('[tournament daily pool seed]', e.message); }
  }
  const updated = db.db.prepare('SELECT * FROM tournaments WHERE id = ?').get(tid);
  res.json({ ok: true, tournament: tournamentRowToPublic(updated) });
});

// Force-end a tournament: sets status='ended' so it disappears from
// `getActiveTournamentForPlayer` immediately. Counters stay around so the
// admin can still inspect the leaderboard.
router.post('/admin/tournaments/:id/end', adminAuth, (req, res) => {
  const tid = parseInt(req.params.id, 10);
  if (!Number.isFinite(tid)) return res.status(400).json({ error: 'invalid id' });
  const endedAt = nowSql();
  db.db.prepare(`
    UPDATE tournaments
       SET status = 'ended',
           end_at = CASE
             WHEN end_at IS NULL OR end_at = '' OR end_at > ? THEN ?
             ELSE end_at
           END
     WHERE id = ?
  `).run(endedAt, endedAt, tid);
  let daily_pool_result = null;
  try {
    daily_pool_result = db.awardTournamentFinalDailyPoolDay(tid);
  } catch (err) {
    console.warn('[tournament daily pool final award]', err?.message || err);
    daily_pool_result = { ok: false, error: (err?.message || 'daily award failed').slice(0, 180) };
  }
  res.json({ ok: true, daily_pool_result });
});

router.post('/admin/tournaments/:id/daily-points/run', adminAuth, (req, res) => {
  const tid = parseInt(req.params.id, 10);
  if (!Number.isFinite(tid)) return res.status(400).json({ error: 'invalid id' });
  try {
    const now = new Date();
    const yesterdayUtc = new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), now.getUTCDate() - 1)).toISOString().slice(0, 10);
    const explicitDay = req.body?.day || req.query?.day;
    const options = {
      force: parseBool(req.body?.force || req.query?.force),
    };
    const result = explicitDay
      ? db.awardTournamentDailyPoolDay(tid, explicitDay, options)
      : db.awardTournamentDailyPoolDay(tid, yesterdayUtc, options);
    res.json(result);
  } catch (err) {
    res.status(err?.status || 500).json({ ok: false, error: (err?.message || 'daily award failed').slice(0, 180) });
  }
});

router.post('/admin/tournaments/:id/daily-points/finalize', adminAuth, (req, res) => {
  const tid = parseInt(req.params.id, 10);
  if (!Number.isFinite(tid)) return res.status(400).json({ error: 'invalid id' });
  try {
    const result = db.awardTournamentFinalDailyPoolDay(tid, {
      force: parseBool(req.body?.force || req.query?.force),
    });
    res.json(result);
  } catch (err) {
    res.status(err?.status || 500).json({ ok: false, error: (err?.message || 'daily final award failed').slice(0, 180) });
  }
});

router.post('/admin/tournaments/:id/participants/:playerId/adjust-trophies', adminAuth, (req, res) => {
  const tid = parseInt(req.params.id, 10);
  const playerId = String(req.params.playerId || '').trim();
  const delta = Math.trunc(Number(req.body?.delta ?? req.body?.trophies ?? req.body?.amount));
  if (!Number.isFinite(tid)) return res.status(400).json({ error: 'invalid tournament id' });
  if (!playerId) return res.status(400).json({ error: 'player id required' });
  if (!Number.isFinite(delta) || delta === 0 || Math.abs(delta) > 100000) {
    return res.status(400).json({ error: 'non-zero trophies delta required' });
  }
  try {
    const result = db.db.transaction(() => {
      const t = db.db.prepare('SELECT * FROM tournaments WHERE id = ?').get(tid);
      if (!t) {
        const err = new Error('tournament not found');
        err.status = 404;
        throw err;
      }
      const row = db.db.prepare(`
        SELECT tp.*, p.name, p.dex AS player_dex
        FROM tournament_participants tp
        JOIN players p ON p.id = tp.player_id
        WHERE tp.tournament_id = ? AND tp.player_id = ? AND tp.left_at IS NULL
      `).get(tid, playerId);
      if (!row) {
        const err = new Error('active tournament participant not found');
        err.status = 404;
        throw err;
      }
      const before = Number(row.trophies || 0);
      const after = Math.max(0, before + delta);
      const applied = after - before;
      db.db.prepare(`
        UPDATE tournament_participants
           SET trophies = ?, last_activity_at = datetime('now')
         WHERE tournament_id = ? AND player_id = ?
      `).run(after, tid, playerId);
      if (applied !== 0) {
        const eventId = `admin_trophy_adjustment:${tid}:${playerId}:${Date.now()}`;
        const dayUtc = new Date().toISOString().slice(0, 10);
        db.db.prepare(`
          INSERT OR IGNORE INTO tournament_daily_activity (
            tournament_id, day_utc, player_id, source, event_id, dex,
            trades_count, volume_usd, pnl_usd, trophies, gold
          ) VALUES (?, ?, ?, 'admin_trophy_adjustment', ?, ?, 0, 0, 0, ?, 0)
        `).run(tid, dayUtc, playerId, eventId, row.team_dex || row.player_dex || t.dex, applied);
      }
      return {
        ok: true,
        tournament_id: tid,
        player_id: playerId,
        name: row.name,
        before,
        delta: applied,
        trophies: after,
      };
    })();
    res.json(result);
  } catch (err) {
    res.status(err?.status || 500).json({ ok: false, error: (err?.message || 'adjust failed').slice(0, 180) });
  }
});

router.get('/admin/tournaments/:id/daily-points', adminAuth, (req, res) => {
  const tid = parseInt(req.params.id, 10);
  if (!Number.isFinite(tid)) return res.status(400).json({ error: 'invalid id' });
  const t = db.db.prepare('SELECT * FROM tournaments WHERE id = ?').get(tid);
  if (!t) return res.status(404).json({ error: 'tournament not found' });
  const limit = Math.max(1, Math.min(60, parseInt(req.query.limit, 10) || 14));
  try {
    const days = db.db.prepare(`
      SELECT day_utc FROM (
        SELECT day_utc FROM tournament_daily_activity WHERE tournament_id = ?
        UNION
        SELECT day_utc FROM tournament_daily_awards WHERE tournament_id = ?
        UNION
        SELECT day_utc FROM tournament_daily_point_runs WHERE tournament_id = ?
      )
      ORDER BY day_utc DESC
      LIMIT ?
    `).all(tid, tid, tid, limit).map(r => r.day_utc);

    const runByDay = new Map(db.db.prepare(`
      SELECT day_utc, processed_at, total_points, details_json
      FROM tournament_daily_point_runs
      WHERE tournament_id = ?
    `).all(tid).map((row) => {
      let details = {};
      try { details = JSON.parse(row.details_json || '{}'); } catch {}
      return [row.day_utc, {
        day_utc: row.day_utc,
        processed_at: row.processed_at,
        total_points: Number(row.total_points || 0),
        details,
      }];
    }));

    const outputDays = days.map((day) => {
      const activityRows = db.db.prepare(`
        SELECT a.player_id, p.name, p.wallet, p.dex,
               COALESCE(SUM(a.trades_count), 0) AS trades_count,
               COALESCE(SUM(a.volume_usd), 0) AS volume_usd,
               COALESCE(SUM(a.pnl_usd), 0) AS pnl_usd,
               COALESCE(SUM(a.trophies), 0) AS trophies,
               COALESCE(SUM(a.gold), 0) AS gold,
               COUNT(*) AS events
        FROM tournament_daily_activity a
        LEFT JOIN players p ON p.id = a.player_id
        WHERE a.tournament_id = ? AND a.day_utc = ?
        GROUP BY a.player_id
      `).all(tid, day);
      const awardRows = db.db.prepare(`
        SELECT a.player_id, p.name, p.wallet, p.dex,
               COALESCE(SUM(a.points), 0) AS points,
               COALESCE(SUM(CASE WHEN a.category = 'trophies' THEN a.points ELSE 0 END), 0) AS trophy_points,
               COALESCE(SUM(CASE WHEN a.category = 'volume' THEN a.points ELSE 0 END), 0) AS volume_points,
               COALESCE(SUM(CASE WHEN a.category = 'pnl' THEN a.points ELSE 0 END), 0) AS pnl_points,
               COALESCE(SUM(CASE WHEN a.category = 'trophies' THEN a.raw_value ELSE 0 END), 0) AS raw_trophies,
               COALESCE(SUM(CASE WHEN a.category = 'volume' THEN a.raw_value ELSE 0 END), 0) AS raw_volume_usd,
               COALESCE(SUM(CASE WHEN a.category = 'pnl' THEN a.raw_value ELSE 0 END), 0) AS raw_pnl_usd
        FROM tournament_daily_awards a
        LEFT JOIN players p ON p.id = a.player_id
        WHERE a.tournament_id = ? AND a.day_utc = ?
        GROUP BY a.player_id
      `).all(tid, day);
      const byPlayer = new Map();
      for (const row of activityRows) {
        byPlayer.set(row.player_id, {
          player_id: row.player_id,
          name: row.name,
          wallet: row.wallet,
          dex: row.dex,
          events: Number(row.events || 0),
          trades_count: Number(row.trades_count || 0),
          volume_usd: Number(row.volume_usd || 0),
          pnl_usd: Number(row.pnl_usd || 0),
          trophies: Number(row.trophies || 0),
          gold: Number(row.gold || 0),
          points: 0,
          trophy_points: 0,
          volume_points: 0,
          pnl_points: 0,
          raw_trophies: 0,
          raw_volume_usd: 0,
          raw_pnl_usd: 0,
        });
      }
      for (const row of awardRows) {
        const existing = byPlayer.get(row.player_id) || {
          player_id: row.player_id,
          name: row.name,
          wallet: row.wallet,
          dex: row.dex,
          events: 0,
          trades_count: 0,
          volume_usd: 0,
          pnl_usd: 0,
          trophies: 0,
          gold: 0,
        };
        byPlayer.set(row.player_id, {
          ...existing,
          name: existing.name || row.name,
          wallet: existing.wallet || row.wallet,
          dex: existing.dex || row.dex,
          points: Number(row.points || 0),
          trophy_points: Number(row.trophy_points || 0),
          volume_points: Number(row.volume_points || 0),
          pnl_points: Number(row.pnl_points || 0),
          raw_trophies: Number(row.raw_trophies || 0),
          raw_volume_usd: Number(row.raw_volume_usd || 0),
          raw_pnl_usd: Number(row.raw_pnl_usd || 0),
        });
      }
      const category_totals = db.db.prepare(`
        SELECT category,
               COALESCE(SUM(points), 0) AS points,
               COALESCE(SUM(raw_value), 0) AS raw_value,
               COUNT(DISTINCT player_id) AS players
        FROM tournament_daily_awards
        WHERE tournament_id = ? AND day_utc = ?
        GROUP BY category
      `).all(tid, day).map(row => ({
        category: row.category,
        points: Number(row.points || 0),
        raw_value: Number(row.raw_value || 0),
        players: Number(row.players || 0),
      }));
      const players = Array.from(byPlayer.values())
        .sort((a, b) =>
          (Number(b.points) || 0) - (Number(a.points) || 0)
          || (Number(b.volume_usd) || 0) - (Number(a.volume_usd) || 0)
          || (Number(b.trophies) || 0) - (Number(a.trophies) || 0)
          || String(a.player_id).localeCompare(String(b.player_id))
        );
      const totals = players.reduce((acc, row) => {
        acc.players += 1;
        acc.events += Number(row.events || 0);
        acc.trades_count += Number(row.trades_count || 0);
        acc.volume_usd += Number(row.volume_usd || 0);
        acc.pnl_usd += Number(row.pnl_usd || 0);
        acc.trophies += Number(row.trophies || 0);
        acc.gold += Number(row.gold || 0);
        acc.points += Number(row.points || 0);
        return acc;
      }, { players: 0, events: 0, trades_count: 0, volume_usd: 0, pnl_usd: 0, trophies: 0, gold: 0, points: 0 });
      totals.volume_usd = Number(totals.volume_usd.toFixed(2));
      totals.pnl_usd = Number(totals.pnl_usd.toFixed(2));
      totals.points = Number(totals.points.toFixed(6));
      return {
        day_utc: day,
        processed: runByDay.has(day),
        run: runByDay.get(day) || null,
        totals,
        category_totals,
        players,
      };
    });

    res.json({
      ok: true,
      tournament: tournamentRowToPublic(t),
      days: outputDays,
    });
  } catch (err) {
    res.status(500).json({ ok: false, error: (err?.message || 'daily point log failed').slice(0, 180) });
  }
});

// Delete a tournament (and its participants via ON DELETE CASCADE).
router.delete('/admin/tournaments/:id', adminAuth, (req, res) => {
  const tid = parseInt(req.params.id, 10);
  if (!Number.isFinite(tid)) return res.status(400).json({ error: 'invalid id' });
  db.db.prepare('DELETE FROM tournaments WHERE id = ?').run(tid);
  res.json({ ok: true });
});

let tournamentDailyPoolTimer = null;

function runTournamentDailyPoolSweep(label = 'timer') {
  try {
    const result = db.awardPendingTournamentDailyPools({
      maxDays: Math.max(1, Math.min(60, Number(process.env.TOURNAMENT_DAILY_POOL_MAX_DAYS || 14))),
    });
    if (Number(result?.processed || 0) > 0) {
      console.log(`[tournament daily-pool ${label}] processed=${result.processed}`);
    }
  } catch (err) {
    console.warn('[tournament daily-pool] sweep failed:', err?.message || err);
  }
}

function startTournamentDailyPoolScheduler() {
  if (process.env.TOURNAMENT_DAILY_POOL_SCHEDULER === '0') return;
  if (tournamentDailyPoolTimer) return;
  const intervalMs = Math.max(60_000, Number(process.env.TOURNAMENT_DAILY_POOL_INTERVAL_MS || 5 * 60_000));
  setTimeout(() => runTournamentDailyPoolSweep('startup'), 15_000).unref?.();
  tournamentDailyPoolTimer = setInterval(() => runTournamentDailyPoolSweep('interval'), intervalMs);
  tournamentDailyPoolTimer.unref?.();
}

startTournamentDailyPoolScheduler();

// ==================== ENCRYPTED CLIENT DIAGNOSTICS ====================
//
// Upload pipeline for capturing wallet sign-traces / Pacifica error
// bodies / agent-bind failures from production browsers. End-to-end
// encrypted with NaCl box (X25519+XSalsa20-Poly1305): client fetches
// the server's public key, generates an ephemeral keypair per upload,
// seals the report, sends `{ephemeral_pubkey, nonce, ciphertext}`. We
// decrypt server-side with the long-term private key (stored in
// .env as DIAG_SERVER_SECRET_B58, see server/diag.js for setup).
//
// The plaintext is bounded JSON; we cap at MAX_PLAINTEXT_BYTES (64KB)
// so a malicious client can't DOS the table.

// Public key endpoint — anonymous, used by every client to encrypt
// uploads. Doesn't change between deploys (the secret is persisted in
// .env), so clients can cache it for the session.
router.get('/diag/pacifica/pubkey', (req, res) => {
  res.json({ pubkey: diag.getPublicKeyB58(), category: 'pacifica' });
});

// In-memory rate limit per IP — diagnostics are reactive (we don't want
// every single sign-error spamming the table). 30 / minute / IP is well
// above legitimate burst (a stuck user might fire ~5 per minute as they
// retry trades) and well under DDoS volume.
const _diagRate = new Map();
function diagRateOk(ip) {
  const now = Date.now();
  const window = now - 60_000;
  const arr = (_diagRate.get(ip) || []).filter(t => t > window);
  if (arr.length >= 30) { _diagRate.set(ip, arr); return false; }
  arr.push(now);
  _diagRate.set(ip, arr);
  return true;
}
setInterval(() => {
  const cutoff = Date.now() - 5 * 60_000;
  for (const [k, v] of _diagRate) {
    const filtered = v.filter(t => t > cutoff);
    if (filtered.length === 0) _diagRate.delete(k);
    else _diagRate.set(k, filtered);
  }
}, 5 * 60_000);

// Upload endpoint — anonymous accepted (Pacifica errors can hit BEFORE
// the player has a token), but if x-token is supplied we associate the
// row with the player_id for easy filtering in admin.
router.post('/diag/pacifica/upload', (req, res) => {
  const ip = req.ip || req.connection?.remoteAddress || 'unknown';
  if (!diagRateOk(ip)) return res.status(429).json({ error: 'too many reports' });
  const { ephemeral_pubkey, nonce, ciphertext } = req.body || {};
  if (typeof ephemeral_pubkey !== 'string' || typeof nonce !== 'string' || typeof ciphertext !== 'string') {
    return res.status(400).json({ error: 'missing ephemeral_pubkey / nonce / ciphertext' });
  }
  const plaintext = diag.decryptReport({ ephemeral_pubkey, nonce, ciphertext });
  if (!plaintext) {
    return res.status(400).json({ error: 'decrypt failed (wrong key, malformed payload, or oversized)' });
  }
  // Best-effort player_id resolution (no auth middleware here so a stale
  // token doesn't block the upload — the report is still valuable even
  // for logged-out users).
  let playerId = null;
  const token = req.headers['x-token'];
  if (typeof token === 'string' && token.length > 10) {
    try {
      const row = db.db.prepare('SELECT id FROM players WHERE token = ? LIMIT 1').get(token);
      if (row) playerId = row.id;
    } catch {}
  }
  // Pull a few hot fields out of the JSON for index-friendly filtering.
  const adapter = typeof plaintext.adapter === 'string' ? plaintext.adapter.slice(0, 64) : null;
  const errorKind = typeof plaintext.error_kind === 'string' ? plaintext.error_kind.slice(0, 64)
    : (typeof plaintext.error === 'string' ? plaintext.error.slice(0, 64) : null);
  const category = typeof plaintext.category === 'string' ? plaintext.category.slice(0, 32) : 'pacifica';
  try {
    db.db.prepare(
      `INSERT INTO diag_reports (player_id, category, adapter, error_kind, payload) VALUES (?, ?, ?, ?, ?)`
    ).run(playerId, category, adapter, errorKind, JSON.stringify(plaintext));
  } catch (e) {
    console.warn('[diag] insert failed:', e.message);
    return res.status(500).json({ error: 'persist failed' });
  }
  res.json({ ok: true });
});

// Admin: paged list with optional filters (adapter, category, since).
router.get('/admin/diag/pacifica', adminAuth, (req, res) => {
  const limit = Math.min(parseInt(req.query.limit, 10) || 100, 500);
  const adapter = req.query.adapter;
  const category = req.query.category || 'pacifica';
  const sinceMin = parseInt(req.query.since_min, 10);
  const conds = ['category = ?'];
  const args = [category];
  if (adapter) { conds.push('adapter = ?'); args.push(adapter); }
  if (Number.isFinite(sinceMin) && sinceMin > 0) {
    conds.push(`created_at >= datetime('now', ?)`);
    args.push(`-${sinceMin} minutes`);
  }
  args.push(limit);
  const sql = `SELECT id, player_id, category, adapter, error_kind, payload, created_at
               FROM diag_reports WHERE ${conds.join(' AND ')}
               ORDER BY id DESC LIMIT ?`;
  const rows = db.db.prepare(sql).all(...args).map(r => ({
    ...r,
    payload: (() => { try { return JSON.parse(r.payload); } catch { return r.payload; } })(),
  }));
  res.json({ rows, total: rows.length });
});

// Admin: counts per (adapter, error_kind) over a recent window — quick
// triage view to find the dominant failure mode without scrolling.
router.get('/admin/diag/pacifica/summary', adminAuth, (req, res) => {
  const sinceMin = Math.max(1, parseInt(req.query.since_min, 10) || 60);
  const rows = db.db.prepare(`
    SELECT adapter, error_kind, COUNT(*) AS n,
           MIN(created_at) AS first_seen,
           MAX(created_at) AS last_seen
    FROM diag_reports
    WHERE created_at >= datetime('now', ?)
    GROUP BY adapter, error_kind
    ORDER BY n DESC LIMIT 200
  `).all(`-${sinceMin} minutes`);
  res.json({ window_min: sinceMin, rows });
});

// Admin: net commission earned per DEX. Reads on-chain balances + Pacifica
// builder-trades sum (Pacifica is off-chain). Cached server-side for 60s
// to keep tab open / refresh from hammering 4 RPCs. ?force=1 bypasses.
router.get('/admin/earnings', adminAuth, async (req, res) => {
  try {
    const data = await earnings.fetchAllEarnings({
      force: req.query.force === '1',
      mainDb: db.db,
    });
    res.json(data);
  } catch (e) {
    console.warn('[earnings] aggregate failed:', e.message);
    res.status(500).json({ error: e.message });
  }
});

// ─────────────────────────────────────────────────────────────────────
// Admin: local revenue analytics by DEX window and by tournament.
router.get('/admin/revenue-analytics', adminAuth, async (req, res) => {
  try {
    const tournamentLimit = Math.max(1, Math.min(500, parseInt(req.query.tournaments, 10) || 120));
    const data = await earnings.fetchRevenueAnalytics({
      mainDb: db.db,
      tournamentLimit,
    });
    res.json(data);
  } catch (e) {
    console.warn('[earnings] revenue analytics failed:', e.message);
    res.status(500).json({ error: e.message });
  }
});

// V3 NFT endpoints (upgrade quotes, bridge orchestration, state reads).
// Implementation lives in ./nft_v3_endpoints.js — mounted onto this same
// router so all V3 routes share rate limits, logging, and the global
// supply gate context.
// ─────────────────────────────────────────────────────────────────────
// Server-custodial marketplace: no new Solana program, uses server custody
// plus verified treasury payments.
try {
  const { mountCustodialMarketplace } = require('./custodial_marketplace');
  mountCustodialMarketplace(router, {
    auth,
    adminAuth,
    parseNftEvmAccount,
    gameShopEvmConfig,
    gameShopAptosConfig,
    gameShopSolanaConfig,
    fetchNftUsdPrice,
    logError,
  });
} catch (err) {
  console.warn('[custodial-marketplace] failed to mount endpoints:', err?.message || err);
}

try {
  const { mountNftV3Endpoints } = require('./nft_v3_endpoints');
  mountNftV3Endpoints(router, {
    parseNftEvmAccount,
    fetchNftUsdPrice,
    fetchClashUsdPrice,
    assertGlobalSupplyAvailable,
    logError,
  });
} catch (err) {
  console.warn('[nft-v3] failed to mount V3 endpoints:', err?.message || err);
}

module.exports = { router, auth, addLog, logBattle, logEconomy, logAuth, logError };
