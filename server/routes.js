const express = require('express');
const fs = require('fs');
const path = require('path');
const crypto = require('crypto');
const nacl = require('tweetnacl');
const bs58 = require('bs58').default || require('bs58');
const db = require('./db');
const tasks = require('./tasks');
const elfa = require('./elfa');
const diag = require('./diag');
const earnings = require('./earnings');
const { broadcastToPlayer } = require('./websocket');

const router = express.Router();

// Temporary lenient battle mode: still runs server-side replay verification and
// logs/stores all mismatch diagnostics, but does not block player rewards unless
// explicitly re-enabled with BATTLE_REPLAY_STRICT=1.
const STRICT_BATTLE_REPLAY_VERIFICATION = process.env.BATTLE_REPLAY_STRICT === '1';

// ---------- Validation Helpers ----------
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
const NFT_IMAGE_PATH = path.join(__dirname, 'public', 'nft', 'demonking.png');
const ZERO_EVM_ADDRESS = '0x0000000000000000000000000000000000000000';
const BASE_USDC_TOKEN = '0x833589fCD6eDb6E08f4c7C32D4f71b54bdA02913';
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

function nftImageUrl(req) {
  return process.env.NFT_IMAGE_URL || `${nftPublicBase(req)}/api/nft/image`;
}

function nftTokenMetadata(req, chain, tokenId) {
  const name = process.env.NFT_NAME || 'Demon King';
  const description = process.env.NFT_DESCRIPTION || 'Demon King from Clash of Perps.';
  const id = Number(tokenId);
  return {
    name: `${name} #${id}`,
    symbol: process.env.NFT_SYMBOL || 'DMNK',
    description,
    image: nftImageUrl(req),
    external_url: process.env.NFT_EXTERNAL_URL || `${nftPublicBase(req)}/`,
    attributes: [
      { trait_type: 'Game', value: 'Clash of Perps' },
      { trait_type: 'Character', value: 'Demon King' },
      { trait_type: 'Chain', value: chain },
      { trait_type: 'Edition', value: id },
      { trait_type: 'Max Supply', value: NFT_MAX_SUPPLY },
    ],
    properties: {
      category: 'image',
      files: [{ uri: nftImageUrl(req), type: 'image/png' }],
    },
  };
}

function nftHiddenMetadata(req, chain) {
  const name = process.env.NFT_NAME || 'Demon King';
  const description = process.env.NFT_DESCRIPTION || 'Demon King from Clash of Perps.';
  return {
    name,
    symbol: process.env.NFT_SYMBOL || 'DMNK',
    description,
    image: nftImageUrl(req),
    external_url: process.env.NFT_EXTERNAL_URL || `${nftPublicBase(req)}/`,
    attributes: [
      { trait_type: 'Game', value: 'Clash of Perps' },
      { trait_type: 'Character', value: 'Demon King' },
      { trait_type: 'Chain', value: chain },
      { trait_type: 'Max Supply', value: NFT_MAX_SUPPLY },
    ],
    properties: {
      category: 'image',
      files: [{ uri: nftImageUrl(req), type: 'image/png' }],
    },
  };
}

function sendNftMetadata(req, res, chain, rawTokenId) {
  const tokenId = String(rawTokenId || '').replace(/\.json$/i, '');
  if (!/^\d+$/.test(tokenId)) return res.status(400).json({ error: 'bad token id' });
  const id = Number(tokenId);
  if (id < 1 || id > NFT_MAX_SUPPLY) return res.status(404).json({ error: 'token metadata not found' });
  res.set('Cache-Control', process.env.NFT_METADATA_CACHE || 'public, max-age=60');
  res.json(nftTokenMetadata(req, chain, id));
}

function readJsonIfExists(file) {
  try {
    if (!fs.existsSync(file)) return null;
    return JSON.parse(fs.readFileSync(file, 'utf8'));
  } catch {
    return null;
  }
}

function nftBaseShopDeployment() {
  return readJsonIfExists(path.join(NFT_ROOT, 'deployments', 'base-shop-v2-mainnet.json'))
    || readJsonIfExists(path.join(NFT_ROOT, 'deployments', 'base-shop-mainnet.json'))
    || {};
}

function nftBaseDeployment() {
  return readJsonIfExists(path.join(NFT_ROOT, 'deployments', 'base-v2-mainnet.json'))
    || readJsonIfExists(path.join(NFT_ROOT, 'deployments', 'base-mainnet.json'))
    || {};
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
  const envKey = asset === 'eth' ? 'NFT_ETH_USD' : asset === 'sol' ? 'NFT_SOL_USD' : null;
  if (envKey && process.env[envKey]) return String(process.env[envKey]);

  const ids = { eth: 'ethereum', sol: 'solana' };
  const symbols = { eth: 'ETHUSDT', sol: 'SOLUSDT' };
  if (!ids[asset]) throw new Error(`Unsupported price asset: ${asset}`);

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
  const cacheMs = Math.max(5_000, Number(process.env.NFT_CLASH_PRICE_CACHE_MS || 30_000));
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

function gameShopDeployment() {
  return readJsonIfExists(path.join(NFT_ROOT, 'deployments', 'game-shop-base-mainnet.json')) || {};
}

function gameShopConfig() {
  const deployment = gameShopDeployment();
  const nftBase = baseNftConfig();
  const copToken = process.env.GAME_SHOP_COP_TOKEN
    || process.env.NFT_BASE_CLASH_TOKEN
    || process.env.CLASH_BASE_TOKEN
    || deployment.copToken
    || nftBase.clashToken
    || ZERO_EVM_ADDRESS;
  const shop = process.env.GAME_SHOP_BASE_CONTRACT || deployment.shop || deployment.proxy || null;
  return {
    chainId: 8453,
    shop,
    copToken,
    copReady: !!copToken && !/^0x0{40}$/i.test(copToken),
    saleActive: process.env.GAME_SHOP_SALE_ACTIVE
      ? process.env.GAME_SHOP_SALE_ACTIVE !== '0'
      : !!deployment.saleActive,
    deployment,
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
};

function gameShopProductsForClient() {
  return Object.values(GAME_SHOP_PRODUCTS).map((product) => ({
    id: product.id,
    sku: product.sku,
    skuBytes32: skuToBytes32(product.sku),
    title: product.title,
    subtitle: product.subtitle,
    kind: product.kind,
    usdPriceE6: product.usdPriceE6,
    priceUsd: unitsToDecimalString(BigInt(product.usdPriceE6), 6),
    durationHours: product.durationHours || null,
    rewards: product.rewards || null,
    maxQuantity: product.maxQuantity,
  }));
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

function applyGameShopProduct(playerId, product, quantity) {
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
    );
    return { resources };
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
  const rpcUrl = process.env.NFT_SOLANA_RPC_URL
    || process.env.SOLANA_RPC_URL
    || process.env.VITE_SOLANA_RPC_URL
    || deployment.rpcUrl
    || 'https://solana-rpc.publicnode.com';
  const maxSupply = Number(process.env.NFT_SOLANA_MAX_SUPPLY || deployment.maxSupply || NFT_MAX_SUPPLY);
  const connection = new Connection(rpcUrl, 'confirmed');
  const account = await connection.getAccountInfo(new PublicKey(deployment.candyMachine), 'confirmed');
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
  let baseSupply = fallbackNftSupply();
  let solanaSupply = fallbackNftSupply();
  try {
    baseSupply = await readBaseNftSupply(baseConfig);
  } catch (err) {
    console.warn('[NFT] failed to read Base supply', err?.message || err);
  }
  try {
    solanaSupply = await readSolanaNftSupply(solanaDeployment);
  } catch (err) {
    console.warn('[NFT] failed to read Solana supply', err?.message || err);
    const solanaMaxSupply = Number(process.env.NFT_SOLANA_MAX_SUPPLY || solanaDeployment.maxSupply || NFT_MAX_SUPPLY);
    const solanaMinted = Number(solanaDeployment.totalMinted ?? solanaDeployment.minted ?? 0);
    solanaSupply = {
      totalMinted: solanaMinted,
      maxSupply: solanaMaxSupply,
      remaining: solanaDeployment.remaining ?? Math.max(0, solanaMaxSupply - solanaMinted),
      source: 'fallback',
    };
  }
  const solanaSaleActive = process.env.NFT_SOLANA_SALE_ACTIVE
    ? process.env.NFT_SOLANA_SALE_ACTIVE !== '0'
    : !!solanaDeployment.saleActive;
  res.set('Cache-Control', 'no-store');
  res.json({
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
    const status = /address/i.test(message) ? 400 : 500;
    res.status(status).json({ error: message.slice(0, 180) });
  }
});

router.get('/nft/image', (req, res) => {
  if (process.env.NFT_IMAGE_URL) return res.redirect(302, process.env.NFT_IMAGE_URL);
  if (!fs.existsSync(NFT_IMAGE_PATH)) return res.status(404).json({ error: 'image missing' });
  res.set('Cache-Control', process.env.NFT_IMAGE_CACHE || 'public, max-age=300');
  res.sendFile(NFT_IMAGE_PATH);
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

router.get('/nft/base/:tokenId', (req, res) => sendNftMetadata(req, res, 'Base', req.params.tokenId));
router.get('/nft/base/:tokenId.json', (req, res) => sendNftMetadata(req, res, 'Base', req.params.tokenId));
router.get('/nft/solana/collection', (req, res) => {
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
      { trait_type: 'Max Supply', value: NFT_MAX_SUPPLY },
    ],
    properties: {
      category: 'image',
      files: [{ uri: nftImageUrl(req), type: 'image/png' }],
    },
  });
});
router.get('/nft/solana/hidden', (req, res) => {
  res.set('Cache-Control', process.env.NFT_METADATA_CACHE || 'public, max-age=60');
  res.json(nftHiddenMetadata(req, 'Solana'));
});
router.get('/nft/solana/hidden.json', (req, res) => {
  res.set('Cache-Control', process.env.NFT_METADATA_CACHE || 'public, max-age=60');
  res.json(nftHiddenMetadata(req, 'Solana'));
});
router.get('/nft/solana/:tokenId', (req, res) => sendNftMetadata(req, res, 'Solana', req.params.tokenId));
router.get('/nft/solana/:tokenId.json', (req, res) => sendNftMetadata(req, res, 'Solana', req.params.tokenId));

// ---------- Game shop: CoP payments on Base, utility granted server-side ----------
router.get('/shop/config', (req, res) => {
  const config = gameShopConfig();
  res.set('Cache-Control', 'no-store');
  res.json({
    base: {
      chainId: config.chainId,
      shop: config.shop,
      copToken: config.copToken,
      copReady: config.copReady,
      saleActive: config.saleActive,
    },
    products: gameShopProductsForClient(),
  });
});

router.post('/shop/base/quote', auth, async (req, res) => {
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
    const sku = String(req.body?.sku || '').trim();
    const product = GAME_SHOP_PRODUCTS[sku];
    if (!product) return res.status(400).json({ error: 'Unknown shop item' });
    const quantity = BigInt(parsePositiveInteger(req.body?.quantity, 1, product.maxQuantity || 10));
    const paymentToken = getAddress(config.copToken);
    const decimals = Number(process.env.GAME_SHOP_COP_DECIMALS || process.env.NFT_BASE_CLASH_DECIMALS || 18);
    const usdPriceE6 = BigInt(product.usdPriceE6);
    const clashUsd = await fetchClashUsdPrice({ clashToken: paymentToken });
    const unitPrice = usdToNativeUnits(unitsToDecimalString(usdPriceE6, 6), clashUsd.price, decimals);
    const ttlSeconds = Math.max(30, Math.min(900, Number(process.env.GAME_SHOP_QUOTE_TTL_SECONDS || 300)));
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

    res.set('Cache-Control', 'no-store');
    res.json({
      chainId: 8453,
      shop: getAddress(config.shop),
      payment: 'cop',
      priceSource: `CoP/USD ${clashUsd.price} (${clashUsd.source})`,
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
    res.status(status).json({ error: message.slice(0, 180) });
  }
});

router.post('/shop/base/redeem', auth, async (req, res) => {
  try {
    const txHash = String(req.body?.txHash || req.body?.hash || '').trim();
    if (!/^0x[0-9a-fA-F]{64}$/.test(txHash)) {
      return res.status(400).json({ error: 'Bad transaction hash' });
    }

    const existing = db.db.prepare('SELECT * FROM utility_purchases WHERE tx_hash = ?').get(txHash);
    if (existing) {
      if (existing.player_id !== req.player.id) return res.status(409).json({ error: 'Purchase already redeemed' });
      return res.json({
        success: true,
        alreadyRedeemed: true,
        product: GAME_SHOP_PRODUCTS[existing.utility] || null,
        shield_until: existing.shield_until || null,
        resources: db.getResources(req.player.id),
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
      const applied = applyGameShopProduct(req.player.id, product, quantity);
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

    res.json({
      success: true,
      product: gameShopProductsForClient().find((item) => item.id === product.id),
      quantity,
      txHash,
      ...grant,
    });
  } catch (err) {
    const message = err?.message || 'redeem failed';
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

  const rows = events.map((ev) => ({
    player_id: playerId,
    ip,
    level: normalizeClientLevel(ev.level),
    source: clampText(ev.source, 64),
    url: clampText(ev.url, 512),
    ua: clampText(ev.ua, 256),
    message: clampText(ev.message || ev.msg || '', 2048) || '(empty)',
    stack: clampText(ev.stack, 4096),
    payload: ev.payload == null ? null : clampText(ev.payload, 8192),
  }));
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
const VALID_DEXES = new Set(['pacifica', 'avantis', 'decibel', 'gmx', 'monad', 'phoenix']);
// DEXes whose trade history is indexed by the futures rewards worker into
// the trade_history table (server-futures/futures.db). GMX joined Phase 3
// once gmx-rewards-worker.js shipped (subsquid GraphQL → trade_history
// rows with verified_source='worker'); we now include it in this set so
// quest progression and per-DEX baselines pick up GMX trades.
const REWARD_INDEXED_DEXES = new Set(['avantis', 'decibel', 'gmx', 'monad', 'phoenix']);
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
    return res.status(400).json({ error: 'dex must be "pacifica", "avantis", "decibel", "gmx", "monad" or "phoenix"' });
  }
  if (dex !== req.player.dex) {
    logAuth('set-dex no-op (DEX is now per-account; client should switch via login-wallet)', {
      player_id: req.player.id, current_dex: req.player.dex, requested_dex: dex,
    });
  }
  res.json({ success: true, dex: req.player.dex, note: 'DEX is per-account; ignore field' });
});

router.post('/players/register', (req, res) => {
  const { name, wallet, dex, fid } = req.body;
  const requestedDex = VALID_DEXES.has(dex) ? dex : 'pacifica';

  // ── Per-DEX canonical lookup ────────────────────────────────────────
  // Each (wallet, dex) is now its own player row. The user's Avantis
  // progress and GMX progress live on separate rows even though both use
  // the same EVM wallet. So we only treat a row as "this is your account"
  // when BOTH the wallet AND the requested DEX match.
  if (wallet) {
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
      const trimmed = typeof name === 'string' ? name.trim() : '';
      const looksAutoDerived = /^player_[0-9a-f]{4,}$/i.test(trimmed);
      if (trimmed.length >= 2 && !looksAutoDerived && trimmed !== existing.name) {
        let finalName = trimmed;
        for (let suffix = 0; suffix <= 99; suffix++) {
          const tryName = suffix === 0 ? finalName : finalName + suffix;
          const clash = db.db.prepare('SELECT id FROM players WHERE name = ? AND id != ?').get(tryName, existing.id);
          if (!clash) {
            db.db.prepare('UPDATE players SET name = ? WHERE id = ?').run(tryName, existing.id);
            existing.name = tryName;
            finalName = tryName;
            break;
          }
        }
      }
      // No more dex-switching on the existing row — DEX is now part of
      // identity. If the caller wanted a different DEX they fall through
      // to the new-row branch above.
      const state = db.getFullPlayerState(existing.id);
      return res.json({ ...state, token: existing.token });
    }
  }

  // ── New-row branch ──────────────────────────────────────────────────
  const trimmed = name.trim();
  if (trimmed.length < 2) {
    return res.status(400).json({ error: 'Name must be at least 2 characters' });
  }
  if (trimmed.length > 30) {
    return res.status(400).json({ error: 'Name must be at most 30 characters' });
  }
  // Try the requested name; if taken, append 1, 2, 3… until unique. This
  // is what gives a user a fresh nick when they create a second-DEX
  // account on the same wallet (e.g. "Player1" on Avantis, "Player11" on
  // GMX) — same suffix mechanism that handled inter-user name clashes.
  let finalName = trimmed;
  let result = null;
  for (let suffix = 0; suffix <= 99; suffix++) {
    const tryName = suffix === 0 ? finalName : finalName + suffix;
    try {
      result = db.registerPlayer(tryName);
      finalName = tryName;
      break;
    } catch (e) {
      if (e.message.includes('UNIQUE') && suffix < 99) continue;
      throw e;
    }
  }
  if (!result) {
    return res.status(409).json({ error: 'Name collision — try a different name' });
  }
  // New rows start as dex='pacifica'. If this wallet already has a Pacifica
  // account and the user creates Phoenix, wallet-first updates would collide
  // with UNIQUE(wallet, dex), so set the requested dex in the wallet update.
  if (wallet) {
    db.db.prepare('UPDATE players SET dex = ?, wallet = ? WHERE id = ?').run(requestedDex, wallet, result.id);
  } else {
    db.db.prepare('UPDATE players SET dex = ? WHERE id = ?').run(requestedDex, result.id);
  }
  const state = db.getFullPlayerState(result.id);
  logAuth('Player registered', { name: finalName, wallet: wallet || null, dex: requestedDex });
  res.json({ ...state, token: result.token });
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

router.post('/agent-events/emit', agentAuth, (req, res) => {
  const action = String(req.body?.action || '').trim();
  const payload = req.body?.payload && typeof req.body.payload === 'object' ? req.body.payload : {};
  if (!action) return res.status(400).json({ error: 'action required' });

  const event = {
    type: 'agent_action',
    data: {
      action,
      payload,
      key: req.agentSession.key,
      at: new Date().toISOString(),
    },
  };
  const delivered = broadcastToPlayer(req.agentSession.player.id, event);
  res.json({ success: true, delivered });
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
  const result = db.addResources(req.player.id, gold, wood, ore);
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
  const result = db.subtractResources(req.player.id, gold, wood, ore);
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
    newOre - current.ore
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
};
function _normalizeTroopName(name) {
  return TROOP_NAME_MAP[String(name || '').toLowerCase()] || String(name || '');
}
function _applyCasualties(playerId, casualties) {
  if (!casualties || typeof casualties !== 'object') return;

  // Count total deployed troops across all ships
  const ports = db.db.prepare('SELECT id, ship_troops, ship_troops_template FROM buildings WHERE player_id = ? AND type = ? AND has_ship = 1').all(playerId, 'port');
  // Count from actual ship_troops (not template) — template may differ after swaps
  const deployed = {};
  for (const port of ports) {
    const troops = JSON.parse(port.ship_troops || '[]');
    for (const t of troops) {
      const name = _normalizeTroopName(t);
      deployed[name] = (deployed[name] || 0) + 1;
    }
  }

  // Cap casualties to deployed counts (prevent client from claiming more losses than deployed)
  const validCasualties = {};
  for (const [name, count] of Object.entries(casualties)) {
    if (typeof count !== 'number' || count <= 0) continue;
    const normalized = _normalizeTroopName(name);
    validCasualties[normalized] = Math.min(
      (validCasualties[normalized] || 0) + count,
      deployed[normalized] || 0
    );
  }

  const remaining = { ...validCasualties };
  for (const port of ports) {
    const troops = JSON.parse(port.ship_troops || '[]');
    const filtered = [];
    for (const t of troops) {
      const name = _normalizeTroopName(t);
      if (remaining[name] && remaining[name] > 0) {
        remaining[name]--;
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
}

// Returns current ship_troops for all ports as [{id, level, ship_troops, ship_troops_template}].
// Used to push the authoritative post-battle state back to the client in /attack/result response.
function _getShipsPayload(playerId) {
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

  // Cap troop levels to server-verified values (prevent level spoofing)
  const troopLevelRows = db.getTroopLevels(req.player.id);
  const serverTroopLevels = {};
  for (const row of troopLevelRows) serverTroopLevels[row.troop_type] = row.level;
  for (const act of gameActions) {
    if (act.type === 'place_ship' && act.troopType && act.troopLevel) {
      const serverLvl = serverTroopLevels[act.troopType] || 1;
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
    const battleResult = db.battleVictory(req.player.id, defender_id, battleSessionId);
    if (battleResult.error) {
      db.storeReplay(req.player.id, defender_id, actions, defenderBuildings, claimedResult, 'error', battleResult.error, null, verification);
      return res.status(400).json(battleResult);
    }
    db.storeReplay(req.player.id, defender_id, actions, defenderBuildings, claimedResult, 'accepted', storedAcceptReason, battleResult.loot, verification);
    // Remove server-simulated casualties from attacker's ships. Real-time
    // /troop-died may already have removed some; _applyCasualties caps against
    // the current ship state, so the final submit is idempotent.
    _applyCasualties(req.player.id, verification.casualties);
    // Return authoritative post-casualty ship state so client can sync immediately
    return res.json({ ...battleResult, ships: _getShipsPayload(req.player.id), casualties: verification.casualties || {} });
  }

  // Defeat — attacker loses trophies, defender gains
  const defeatResult = db.battleDefeat(req.player.id, defender_id, battleSessionId);
  db.storeReplay(req.player.id, defender_id, actions, defenderBuildings, claimedResult, 'accepted', replayStatus === 'ACCEPTED' ? 'Defeat' : storedAcceptReason, null, verification);

  // Remove server-simulated casualties from attacker's ships.
  _applyCasualties(req.player.id, verification.casualties);

  res.json({
    success: true,
    loot: { gold: 0, wood: 0, ore: 0 },
    trophies: defeatResult.attackerTrophies,
    ships: _getShipsPayload(req.player.id),
    casualties: verification.casualties || {},
  });
});

// ==================== TROOPS ====================

// Get troop levels
router.get('/troops', auth, (req, res) => {
  res.json(db.getTroopLevels(req.player.id));
});

// Upgrade a troop
router.post('/troops/:type/upgrade', auth, (req, res) => {
  const { type } = req.params;
  const result = db.upgradeTroop(req.player.id, type);
  if (result.error) return res.status(400).json(result);
  logEconomy('troop_upgrade', { player: req.player.id, troop: type, level: result.level });
  res.json(result);
});

// ==================== MATCHMAKING ====================

// Find enemy with closest trophies
router.get('/find-enemy', auth, (req, res) => {
  // Pre-flight: player must have a port with a ship loaded with troops
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
    ORDER BY r.created_at DESC
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
const TROOP_BUY_COST = 100;
router.post('/troops/buy', auth, (req, res) => {
  const { troop_name } = req.body;
  if (!troop_name) return res.status(400).json({ error: 'troop_name required' });
  const validTroops = ['Knight', 'Mage', 'Barbarian', 'Archer', 'Ranger'];
  if (!validTroops.includes(troop_name)) return res.status(400).json({ error: 'Invalid troop type' });
  if (!db.canAfford(req.player.id, TROOP_BUY_COST, 0, 0)) {
    return res.status(400).json({ error: 'Not enough gold', cost: TROOP_BUY_COST });
  }
  db.subtractResources(req.player.id, TROOP_BUY_COST, 0, 0);
  res.json({ success: true, troop_name, cost: TROOP_BUY_COST, resources: db.getResources(req.player.id) });
});

// Load troop onto a ship at a port
const TROOP_COST = 100;
const REINFORCE_COST = 50;
const VALID_TROOPS = ['Knight', 'Mage', 'Barbarian', 'Archer', 'Ranger'];

// Load a troop into a ship slot (costs 100 gold). Also saves template.
router.post('/buildings/:id/load-troop', auth, (req, res) => {
  const buildingId = parseInt(req.params.id, 10);
  if (isNaN(buildingId)) return res.status(400).json({ error: 'Invalid building ID' });
  const { troop_name } = req.body;
  if (!troop_name || !VALID_TROOPS.includes(troop_name)) return res.status(400).json({ error: 'Invalid troop type' });

  const txn = db.db.transaction(() => {
    const building = db.db.prepare('SELECT * FROM buildings WHERE id = ? AND player_id = ?').get(buildingId, req.player.id);
    if (!building) throw { status: 404, error: 'Building not found' };
    if (building.type !== 'port' || !building.has_ship) throw { status: 400, error: 'No ship at this port' };

    const shipTroops = JSON.parse(building.ship_troops || '[]');
    const capacity = building.level * 3;  // 3x capacity: Lv1=3, Lv2=6, Lv3=9
    if (shipTroops.length >= capacity) throw { status: 400, error: 'Ship is full' };

    const player = db.db.prepare('SELECT gold FROM players WHERE id = ?').get(req.player.id);
    if (player.gold < TROOP_COST) throw { status: 400, error: 'Not enough gold' };

    db.db.prepare('UPDATE players SET gold = gold - ? WHERE id = ?').run(TROOP_COST, req.player.id);
    shipTroops.push(troop_name);
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
router.post('/buildings/:id/swap-troop', auth, (req, res) => {
  const buildingId = parseInt(req.params.id, 10);
  if (isNaN(buildingId)) return res.status(400).json({ error: 'Invalid building ID' });
  const { slot, troop_name } = req.body;
  if (!Number.isInteger(slot) || !troop_name || !VALID_TROOPS.includes(troop_name)) {
    return res.status(400).json({ error: 'Valid integer slot and troop_name required' });
  }

  const txn = db.db.transaction(() => {
    const building = db.db.prepare('SELECT * FROM buildings WHERE id = ? AND player_id = ?').get(buildingId, req.player.id);
    if (!building) throw { status: 404, error: 'Building not found' };
    if (building.type !== 'port' || !building.has_ship) throw { status: 400, error: 'No ship at this port' };

    const shipTroops = JSON.parse(building.ship_troops || '[]');
    if (slot < 0 || slot >= shipTroops.length) throw { status: 400, error: 'Invalid slot' };

    const player = db.db.prepare('SELECT gold FROM players WHERE id = ?').get(req.player.id);
    if (player.gold < TROOP_COST) throw { status: 400, error: 'Not enough gold' };

    db.db.prepare('UPDATE players SET gold = gold - ? WHERE id = ?').run(TROOP_COST, req.player.id);
    shipTroops[slot] = troop_name;
    const troopsJson = JSON.stringify(shipTroops);
    // Update ship_troops only — template stays as the last full loadout so /reinforce
    // can still restore the original slot count after casualties.
    db.db.prepare('UPDATE buildings SET ship_troops = ? WHERE id = ?').run(troopsJson, buildingId);

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

// Get current ship troops for all ports (used before attack to sync)
router.get('/ships', auth, (req, res) => {
  const ports = db.db.prepare('SELECT id, level, ship_troops, ship_troops_template, has_ship FROM buildings WHERE player_id = ? AND type = ?').all(req.player.id, 'port');
  const ships = ports.filter(p => p.has_ship).map(p => ({
    id: p.id,
    level: p.level,
    ship_troops: JSON.parse(p.ship_troops || '[]'),
    ship_troops_template: JSON.parse(p.ship_troops_template || '[]'),
  }));
  res.json({ ships });
});

// Report a single troop death during battle — removes one from ship_troops immediately
// Rate-limited: 5ms cooldown (was 500ms, bumped 100× per user request).
const _troopDiedTimestamps = {};
router.post('/troop-died', auth, (req, res) => {
  const now = Date.now();
  const last = _troopDiedTimestamps[req.player.id] || 0;
  if (now - last < 5) return res.status(429).json({ error: 'Too fast' });
  _troopDiedTimestamps[req.player.id] = now;

  const { troop_name } = req.body;
  if (!troop_name || !VALID_TROOPS.includes(troop_name)) return res.status(400).json({ error: 'Invalid troop' });

  // Find first port that has this troop and remove one instance (atomic)
  const result = db.db.transaction(() => {
    const ports = db.db.prepare('SELECT id, ship_troops FROM buildings WHERE player_id = ? AND type = ? AND has_ship = 1').all(req.player.id, 'port');
    for (const port of ports) {
      const troops = JSON.parse(port.ship_troops || '[]');
      const idx = troops.indexOf(troop_name);
      if (idx !== -1) {
        troops.splice(idx, 1);
        db.db.prepare('UPDATE buildings SET ship_troops = ? WHERE id = ?').run(JSON.stringify(troops), port.id);
        return { removed: troop_name, port_id: port.id };
      }
    }
    return { removed: null };
  })();
  res.json({ success: true, ...result });
});

// Get casualties: compare ship_troops vs ship_troops_template to find missing troops
router.get('/casualties', auth, (req, res) => {
  const ports = db.db.prepare('SELECT * FROM buildings WHERE player_id = ? AND type = ? AND has_ship = 1').all(req.player.id, 'port');
  const casualties = {};
  let totalMissing = 0;

  for (const port of ports) {
    const current = JSON.parse(port.ship_troops || '[]');
    const template = JSON.parse(port.ship_troops_template || '[]');
    // Count how many of each troop type are missing
    const currentCounts = {};
    for (const t of current) currentCounts[t] = (currentCounts[t] || 0) + 1;
    for (const t of template) {
      if (currentCounts[t] && currentCounts[t] > 0) {
        currentCounts[t]--;
      } else {
        casualties[t] = (casualties[t] || 0) + 1;
        totalMissing++;
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
    const ports = db.db.prepare('SELECT * FROM buildings WHERE player_id = ? AND type = ? AND has_ship = 1').all(req.player.id, 'port');

    let totalToRestore = 0;
    const shipsToRestore = [];

    for (const port of ports) {
      const current = JSON.parse(port.ship_troops || '[]');
      const template = JSON.parse(port.ship_troops_template || '[]');
      if (template.length === 0) continue;
      // Count missing troops by type (template - current)
      const currentCounts = {};
      for (const t of current) currentCounts[t] = (currentCounts[t] || 0) + 1;
      const toAdd = [];
      for (const t of template) {
        if (currentCounts[t] && currentCounts[t] > 0) {
          currentCounts[t]--;
        } else {
          toAdd.push(t);
        }
      }
      if (toAdd.length > 0) {
        totalToRestore += toAdd.length;
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

// GET current tutorial state
router.get('/tutorial', auth, (req, res) => {
  const player = db.db.prepare('SELECT tutorial_flags FROM players WHERE id = ?').get(req.player.id);
  res.json({ tutorial_flags: player?.tutorial_flags || 0 });
});

// POST mark a tutorial phase as complete (flag is a bitmask: 1,2,4,8)
router.post('/tutorial/complete', auth, (req, res) => {
  const { flag } = req.body;
  if (!Number.isInteger(flag) || flag < 1 || flag > 15) return res.status(400).json({ error: 'Invalid flag' });
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

const GOLD_PER_USD_VOLUME = 0.30;
// Decibel was 10× — 33× the Pacifica rate. Combined with a $1 min-notional
// floor, that turned the DEX into a self-trade gold farm. Pulled to parity
// with Pacifica for the v2 economy. If we ever need to incentivise Decibel
// liquidity again, do it via a tournament gold_boost, not a base-rate cliff.
const GOLD_PER_USD_VOLUME_DECIBEL = 0.30;
const GOLD_FIRST_DEPOSIT = 500;
const GOLD_FIRST_TRADE = 300;
const GOLD_DAILY_TRADE = 200;
const GOLD_PER_10_USD_PROFIT = 150; // +150 gold per $10 positive PnL

function volumeGoldForDex(dex, usdVolume) {
  const volume = Number(usdVolume);
  if (!Number.isFinite(volume) || volume <= 0) return 0;
  const rate = dex === 'decibel' ? GOLD_PER_USD_VOLUME_DECIBEL : GOLD_PER_USD_VOLUME;
  return Math.floor(volume * rate);
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
// Lazy-open server-futures DB (read-only) so this endpoint can credit gold
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

router.post('/trading/claim-gold', auth, async (req, res) => {
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
  const requestedDex = req.body.dex == null ? playerDex : String(req.body.dex).toLowerCase();
  if (!VALID_DEXES.has(requestedDex)) {
    return res.status(400).json({ error: 'Invalid dex' });
  }
  if (requestedDex !== playerDex) {
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
  if (dex === 'avantis' || dex === 'decibel' || dex === 'gmx' || dex === 'monad' || dex === 'phoenix') {
    const fdb = futuresDbReadonly();
    if (!fdb) {
      return res.json({ gold: 0, reason: 'Futures service unavailable — try again later' });
    }
    let reward = db.db.prepare('SELECT * FROM trading_rewards WHERE player_id = ? AND dex = ?').get(req.player.id, dex);
    if (!reward) {
      db.db.prepare('INSERT INTO trading_rewards (player_id, dex, wallet) VALUES (?, ?, ?)').run(req.player.id, dex, wallet || '');
      reward = db.db.prepare('SELECT * FROM trading_rewards WHERE player_id = ? AND dex = ?').get(req.player.id, dex);
    }
    // GMX briefly used a $50 minimum notional in this claim path. That let
    // task progress see verified trade_history rows while gold/tournament
    // volume skipped them and still advanced last_trade_id. If a GMX row has
    // never paid anything, rewind the cursor once so those verified rows can
    // be credited under the no-threshold GMX rules below.
    if (dex === 'gmx'
      && Number(reward.last_trade_id || 0) > 0
      && Number(reward.total_volume || 0) === 0
      && Number(reward.total_gold || 0) === 0) {
      db.db.prepare('UPDATE trading_rewards SET last_trade_id = 0 WHERE player_id = ? AND dex = ?')
        .run(req.player.id, dex);
      reward = { ...reward, last_trade_id: 0 };
      console.log(`[claim-gold gmx] rewound zero-credit cursor for player=${req.player.name}`);
    }
    let newTrades = [];
    try {
      // Avantis/GMX stay worker-only. Decibel uses server rows as the
      // instant source of truth: they are inserted only after our server-side
      // signer waits for Aptos transaction success. The Decibel worker polls
      // positions and can miss fast open+close cycles, and including both
      // sources would double-count when the worker later writes a duplicate.
      const sourceWhere = dex === 'decibel'
        ? "AND verified_source = 'server'"
        : dex === 'monad'
          ? "AND verified_source IN ('perpl_api', 'perpl_ws')"
          : "AND verified_source = 'worker'";
      newTrades = fdb.prepare(`
        SELECT id, symbol, side, amount, notional_usd, pnl, status, created_at
        FROM trade_history
        WHERE player_id = ? AND dex = ? AND status = 'filled'
          ${sourceWhere} AND id > ?
        ORDER BY id ASC
      `).all(req.player.id, dex, reward.last_trade_id || 0);
    } catch (e) {
      console.warn(`[claim-gold] ${dex} verified trade query failed:`, e.message);
      return res.json({ gold: 0, reason: 'Futures trade verifier unavailable - try again later', dex });
    }

    let decibelPnlRows = [];
    if (dex === 'decibel') {
      try {
        decibelPnlRows = fdb.prepare(`
          SELECT id, symbol, side, amount, notional_usd, pnl, status, created_at
          FROM trade_history
          WHERE player_id = ? AND dex = 'decibel' AND status = 'filled'
            AND verified_source = 'worker'
            AND side IN ('close_long', 'close_short')
            AND pnl IS NOT NULL AND pnl != ''
            AND notional_usd >= 10
          ORDER BY id ASC
          LIMIT 1000
        `).all(req.player.id);
      } catch (e) {
        console.warn('[claim-gold decibel] delayed PnL sync query failed:', e.message);
      }
    }
    const syncDecibelTournamentPnl = () => {
      if (dex !== 'decibel' || !decibelPnlRows.length) {
        return { credited_rows: 0, trades_count: 0, volume_usd: 0, pnl_usd: 0 };
      }
      return db.recordTournamentTradeRows(req.player.id, decibelPnlRows, {
        source: 'trade_history_decibel_pnl',
        count: false,
        volume: false,
        pnl: true,
      });
    };
    console.log(`[claim-gold ${dex}] player=${req.player.name} id=${req.player.id} wallet=${(wallet||'').slice(0,10)} last_trade_id=${reward.last_trade_id||0} new_trades=${newTrades.length} stored_volume=$${(reward.total_volume||0).toFixed(2)} stored_gold=${reward.total_gold||0}`);

    if (newTrades.length === 0 && reward.first_deposit && reward.first_trade) {
      const pnlSync = syncDecibelTournamentPnl();
      if (pnlSync.credited_rows > 0) {
        console.log(`[claim-gold ${dex}] player=${req.player.name} -> SYNCED tournament pnl=$${pnlSync.pnl_usd.toFixed(2)} rows=${pnlSync.credited_rows}`);
        return res.json({
          gold: 0,
          reason: `Tournament PnL synced: $${pnlSync.pnl_usd.toFixed(2)}`,
          dex,
          tournament_pnl_usd: pnlSync.pnl_usd,
        });
      }
      console.log(`[claim-gold ${dex}] player=${req.player.name} -> NO NEW TRADES (returning 0)`);
      return res.json({ gold: 0, reason: 'No new trades' });
    }

    // Sanity: clamp each trade's notional to a sane range so a bugged/forged
    // row (e.g. Infinity from parseFloat("1e100")) cannot mint unlimited gold.
    // Decibel was at $1 — too low because Decibel min_size per market lets
    // self-traded $1 fills count as legitimate. Bumped to $10 to match
    // a sensible micro-trade floor across all four DEXes.
    const SANE_MIN_NOTIONAL = dex === 'gmx'
      ? 0
      : (dex === 'decibel' || dex === 'monad' || dex === 'phoenix') ? 10 : 50;
    const SANE_MAX_NOTIONAL = 10_000_000;

    let totalGold = 0;
    const reasons = [];
    let maxId = reward.last_trade_id || 0;
    let newVolume = 0;
    let newPnl = 0;
    let creditedTrades = 0;
    const creditedTradeRows = [];
    // Track opens separately — "first_trade" bonus should only fire on an
    // actual OPEN (long/short), not on a close-only sequence. Previously a
    // user who closed a pre-reward position without ever opening a new one
    // qualified for the 300-gold bonus. `side` values from the worker are
    // 'long' / 'short' for opens and 'close_long' / 'close_short' for closes.
    let creditedOpens = 0;
    for (const t of newTrades) {
      const raw = Number(t.notional_usd);
      if (!Number.isFinite(raw) || raw < SANE_MIN_NOTIONAL || raw > SANE_MAX_NOTIONAL) {
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
      totalGold += volumeGoldForDex(dex, raw);
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
    if (!reward.first_deposit && !alreadyPaidFirstDeposit && hasRealOpen) { totalGold += GOLD_FIRST_DEPOSIT; reasons.push('First deposit!'); }
    if (!reward.first_trade && !alreadyPaidFirstTrade && creditedOpens > 0) { totalGold += GOLD_FIRST_TRADE; reasons.push('First trade!'); }
    const today = new Date().toISOString().split('T')[0];
    if (reward.last_daily !== today && creditedTrades > 0) { totalGold += GOLD_DAILY_TRADE; reasons.push('Daily bonus'); }

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
      const paidGold = totalGold > 0 ? db.applyGoldReward(req.player.id, totalGold) : 0;
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
        db.addResources(req.player.id, paidGold, 0, 0);
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
      return { raced: false, paid: paidGold };
    });

    const txnResult = creditTxn();
    if (txnResult.raced) {
      console.log(`[claim-gold ${dex}] player=${req.player.name} -> RACED (parallel claim)`);
      return res.json({ gold: 0, reason: 'Already claimed by parallel request', dex });
    }
    if (txnResult.paid > 0) {
      console.log(`[claim-gold ${dex}] player=${req.player.name} -> PAID gold=${txnResult.paid} new_volume=$${newVolume.toFixed(2)} pnl=$${newPnl.toFixed(2)} credited_trades=${creditedTrades} reasons="${reasons.join(' + ')}"`);
      return res.json({ gold: txnResult.paid, reason: reasons.join(' + ') || 'Trading reward', dex });
    }
    console.log(`[claim-gold ${dex}] player=${req.player.name} -> ZERO PAID (had ${newTrades.length} raw trades, all clamped/below threshold)`);
    return res.json({ gold: 0, reason: newTrades.length ? 'Below reward threshold' : 'No new trades', dex });
  }

  // ── Pacifica branch ──
  if (!wallet) return res.status(400).json({ error: 'wallet required — connect wallet in profile' });

  try {
    // Get or create reward record. Agents are managed exclusively by the
    // signature-verified /pacifica/agent endpoint now, so we never write
    // agent_wallet from this body.
    let reward = db.db.prepare('SELECT * FROM trading_rewards WHERE player_id = ? AND dex = ?').get(req.player.id, dex);
    if (!reward) {
      db.db.prepare('INSERT INTO trading_rewards (player_id, dex, wallet) VALUES (?, ?, ?)').run(req.player.id, dex, wallet);
      reward = db.db.prepare('SELECT * FROM trading_rewards WHERE player_id = ? AND dex = ?').get(req.player.id, dex);
    }
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
    if (newTrades.length === 0 && reward.first_deposit && reward.first_trade) {
      console.log(`[claim-gold pacifica] player=${req.player.name} -> NO NEW TRADES (api_total=${allTrades.length}, all <= last_trade_id=${reward.last_trade_id})`);
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

    // Volume rewards
    for (const t of newTrades) {
      const volume = parseFloat(t.price || 0) * parseFloat(t.amount || 0);
      totalGold += volumeGoldForDex('pacifica', volume);
      if (t.history_id > maxTradeId) maxTradeId = t.history_id;
    }

    // PnL profit rewards — check realized PnL from close trades
    let closePnl = 0;
    for (const t of newTrades) {
      const side = (t.side || '').toLowerCase();
      if (side.includes('close')) {
        const pnl = parseFloat(t.realized_pnl || t.pnl || 0);
        if (pnl > 0) closePnl += pnl;
      }
    }
    // Accumulate fractional profit in pool, award 100 gold per $10 crossed
    let pnlPool = (reward.pnl_gold_pool || 0) + closePnl;
    if (pnlPool >= 10) {
      const chunks = Math.floor(pnlPool / 10);
      const pnlGold = chunks * GOLD_PER_10_USD_PROFIT;
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
    if (!reward.first_deposit && !alreadyPaidFirstDepositPac && hasRealPacificaOpen) {
      totalGold += GOLD_FIRST_DEPOSIT;
      reasons.push('First deposit!');
    }
    if (!reward.first_trade && !alreadyPaidFirstTradePac && uniqueOpenTradeCount > 0) {
      totalGold += GOLD_FIRST_TRADE;
      reasons.push('First trade!');
    }

    // Daily bonus
    const today = new Date().toISOString().split('T')[0];
    if (reward.last_daily !== today && uniqueTradeCount > 0) {
      totalGold += GOLD_DAILY_TRADE;
      reasons.push('Daily bonus');
    }

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
      const paidGold = totalGold > 0 ? db.applyGoldReward(req.player.id, totalGold) : 0;
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
        db.addResources(req.player.id, paidGold, 0, 0);
        const reason = reasons.join(' + ') || 'Trading reward';
        db.db.prepare('INSERT INTO gold_history (player_id, amount, reason) VALUES (?, ?, ?)').run(req.player.id, paidGold, reason);
      }
      // Tournament leaderboard: bump trades_count + volume_usd + pnl_usd
      // in lockstep with the gold credit. closePnl already excludes losses
      // (only positive realized PnL counts) but leaderboards typically
      // want NET pnl — recompute the signed sum here.
      if (uniqueTradeCount > 0) {
        let netPnl = 0;
        for (const t of newTrades) {
          const side = (t.side || '').toLowerCase();
          if (side.includes('close')) {
            const v = parseFloat(t.realized_pnl || t.pnl || 0);
            if (Number.isFinite(v)) netPnl += v;
          }
        }
        db.recordTournamentTrade(req.player.id, newVolume, netPnl, uniqueTradeCount);
      }
      return { raced: false, paid: paidGold };
    });
    const txnResPac = creditTxnPac();
    if (txnResPac.raced) {
      console.log(`[claim-gold pacifica] player=${req.player.name} -> RACED (parallel claim)`);
      return res.json({ gold: 0, reason: 'Already claimed by parallel request' });
    }
    console.log(`[claim-gold pacifica] player=${req.player.name} -> ${txnResPac.paid > 0 ? 'PAID' : 'ZERO'} gold=${txnResPac.paid} new_volume=$${newVolume.toFixed(2)} unique_trades=${uniqueTradeCount} unique_opens=${uniqueOpenTradeCount} reasons="${reasons.join(' + ')}" maxId=${maxTradeId}`);

    res.json({
      gold: Math.floor(txnResPac.paid),
      reason: reasons.join(' + ') || 'No new rewards',
      total_gold_earned: (reward.total_gold || 0) + txnResPac.paid,
    });
  } catch (e) {
    console.error(`[claim-gold pacifica] player=${req.player.name} ERROR:`, e.message, e.stack);
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
  if (dex === 'avantis' || dex === 'decibel' || dex === 'gmx' || dex === 'monad' || dex === 'phoenix') {
    const fdb = futuresDbReadonly();
    if (fdb) {
      try {
        const sourceClause = dex === 'decibel'
          ? "AND verified_source IN ('worker', 'server')"
          : dex === 'monad'
            ? "AND verified_source IN ('perpl_api', 'perpl_ws')"
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

const LIVE_TASK_PROGRESS_DEXES = new Set(['avantis', 'decibel', 'gmx', 'monad', 'phoenix']);

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

// List active tasks + player progress
router.get('/tasks', auth, async (req, res) => {
  if (!rateGate('list:' + req.player.id, 500)) {
    return res.status(429).json({ error: 'slow down' });
  }
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
  if (!task || !task.active) return res.status(404).json({ error: 'Task not active' });

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
  if (!claimCheck.ok) return res.status(400).json({ error: claimCheck.reason });

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
    return res.json({ ok: false, completed: false, progress_value: result.progress_value, target_value: result.target_value, breakdown: result.breakdown });
  }
  const nextRepeatableSnapshot = task.repeatable ? await tasks.buildSnapshot(req.player, task) : null;

  // Atomic payout: re-check claimed_at inside the transaction so two
  // concurrent /tasks/:id/claim calls can't both pass canClaim() and
  // double-pay. Previously the rate-limiter's 3s gate was the only guard;
  // two requests arriving within ~ms of each other would both credit.
  const payout = db.db.transaction(() => {
    const latest = db.db.prepare('SELECT claimed_at FROM player_tasks WHERE player_id = ? AND task_id = ?').get(req.player.id, id);
    // For one-shot tasks: if claimed_at already set by a racing request,
    // abort. For repeatable tasks: if claimed_at advanced since we started,
    // the cooldown check we did earlier is stale — abort and let user
    // re-submit rather than risk a duplicate payout within the cooldown.
    if (latest && latest.claimed_at && (!task.repeatable || latest.claimed_at !== pt.claimed_at)) {
      return { raced: true };
    }
    db.addResources(req.player.id, task.reward_gold || 0, task.reward_wood || 0, task.reward_ore || 0);
    if (task.reward_gold > 0) {
      db.db.prepare('INSERT INTO gold_history (player_id, amount, reason) VALUES (?, ?, ?)')
        .run(req.player.id, task.reward_gold, `Quest: ${task.title}`);
    }
    if (task.repeatable) {
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
      db.db.prepare(`UPDATE player_tasks SET claimed_at = datetime('now') WHERE player_id = ? AND task_id = ?`).run(req.player.id, id);
    }
    return { raced: false };
  });
  const payoutRes = payout();
  if (payoutRes.raced) {
    console.log(`[task ${id} claim] player=${req.player.name} -> RACED (parallel claim)`);
    return res.status(409).json({ error: 'Already claimed by parallel request' });
  }
  console.log(`[task ${id} claim] player=${req.player.name} -> PAID gold=${task.reward_gold||0} wood=${task.reward_wood||0} ore=${task.reward_ore||0} (${task.title})`);

  try {
    logEconomy('Task claimed', { player: req.player.name, task: task.title, gold: task.reward_gold, wood: task.reward_wood, ore: task.reward_ore });
  } catch {}

  res.json({
    ok: true,
    completed: true,
    reward: { gold: task.reward_gold, wood: task.reward_wood, ore: task.reward_ore },
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
    if (fdb && (player.dex === 'avantis' || player.dex === 'decibel' || player.dex === 'gmx' || player.dex === 'monad' || player.dex === 'phoenix')) {
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
    db.addResources(p.id, gold, wood, ore);
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
  db.addResources(player.id, gold, wood, ore);
  res.json({ success: true, resources: db.getResources(player.id) });
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
  const ACTIVITY_DEXES = ['avantis', 'decibel', 'gmx', 'monad', 'phoenix'];
  const dexActivity = {};   // { avantis: {...}, decibel: {...}, gmx: {...} }
  const dexTop = {};        // { avantis: [...], decibel: [...], gmx: [...] }
  try {
    const fdb = futuresDbReadonly();
    if (fdb) {
      const sourceWhereForDex = (dex) => dex === 'monad'
        ? "verified_source IN ('perpl_api', 'perpl_ws')"
        : dex === 'decibel'
          ? "verified_source IN ('worker', 'server')"
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
      avantis_activity: dexActivity.avantis || null,
      avantis_top: dexTop.avantis || [],
    },
    ui_modes: byUiMode,
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
// Tournaments are admin-curated per-DEX competitions. Players can join one
// active tournament for their DEX at a time. While joined:
//   - Trophies earned from battles are routed into tournament_participants
//     (with optional trophy_boost). Per tournament, admins choose whether
//     players.trophies stays frozen or also receives the raw battle delta.
//   - Gold earned from /claim-gold is multiplied by gold_boost and the
//     boosted amount lands in both players.gold and tournament_participants.gold.
//   - Volume + pnl + trades_count are tracked in tournament_participants
//     for the leaderboard.
// Tournament state is per-DEX: a Pacifica player can't join a GMX
// tournament. This is enforced by the JOIN against players.dex inside
// getActiveTournamentForPlayer and explicitly checked at /join time.

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

const TOURNAMENT_COMBINED_SORT = 'volume_trophies_50_50';
const TOURNAMENT_SORT_KEYS = ['pnl_usd', 'trophies', 'volume_usd', 'gold', TOURNAMENT_COMBINED_SORT];
const TOURNAMENT_SQL_SORT_COLS = {
  pnl_usd: 'tp.pnl_usd',
  trophies: 'tp.trophies',
  volume_usd: 'tp.volume_usd',
  gold: 'tp.gold',
};

function normalizeTournamentSort(sortBy, fallback = 'pnl_usd') {
  return TOURNAMENT_SORT_KEYS.includes(sortBy) ? sortBy : fallback;
}

function tournamentSortLabel(sortBy) {
  switch (sortBy) {
    case 'trophies': return 'Trophies';
    case 'volume_usd': return 'Volume (USD)';
    case 'gold': return 'Gold';
    case TOURNAMENT_COMBINED_SORT: return '50% Volume / 50% Trophies';
    case 'pnl_usd':
    default:
      return 'PnL (USD)';
  }
}

function applyVolumeTrophyScore(rows) {
  const maxVolume = rows.reduce((m, r) => Math.max(m, Number(r.volume_usd) || 0), 0);
  const maxTrophies = rows.reduce((m, r) => Math.max(m, Number(r.trophies) || 0), 0);
  for (const r of rows) {
    const volumeScore = maxVolume > 0 ? ((Number(r.volume_usd) || 0) / maxVolume) * 50 : 0;
    const trophyScore = maxTrophies > 0 ? ((Number(r.trophies) || 0) / maxTrophies) * 50 : 0;
    r.volume_score = Number(volumeScore.toFixed(4));
    r.trophy_score = Number(trophyScore.toFixed(4));
    r.score = Number((volumeScore + trophyScore).toFixed(4));
  }
  return rows;
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

function tournamentRowToPublic(t) {
  const now = nowSql();
  const phase = tournamentPhase(t, now);
  return {
    id: t.id,
    name: t.name,
    description: t.description || '',
    dex: t.dex,
    start_at: cleanSqlDate(t.start_at),
    end_at: cleanSqlDate(t.end_at),
    gold_boost: Number(t.gold_boost),
    trophy_boost: Number(t.trophy_boost),
    freeze_trophies: Number(t.freeze_trophies ?? 1) !== 0,
    sort_by: t.sort_by,
    sort_label: tournamentSortLabel(t.sort_by),
    status: t.status,
    phase,
    preregistration_enabled: !!Number(t.preregistration_enabled || 0),
    registration_opens_at: cleanSqlDate(t.registration_opens_at),
    registration_closes_at: cleanSqlDate(t.registration_closes_at),
    can_join: canJoinTournament(t, now),
    created_at: t.created_at,
  };
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

// Player's current tournament context: the active tournament for their DEX
// (if any) plus their participation row. UI uses this to decide whether to
// show "Join" or "Leave + leaderboard" on the trophy button.
router.get('/tournaments/me', auth, (req, res) => {
  const dex = req.player.dex;
  const t = db.db.prepare(`
    SELECT * FROM tournaments
    WHERE dex = ? AND status = 'active'
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
  `).get(dex);
  if (!t) return res.json({ tournament: null, joined: false, phase: null, can_join: false });
  const pub = tournamentRowToPublic(t);
  const me = db.db.prepare(`
    SELECT * FROM tournament_participants
    WHERE tournament_id = ? AND player_id = ?
  `).get(t.id, req.player.id);
  let comboMeScore = null;
  if (me && t.sort_by === TOURNAMENT_COMBINED_SORT) {
    const scored = applyVolumeTrophyScore(db.db.prepare(`
      SELECT player_id, trophies, volume_usd
      FROM tournament_participants
      WHERE tournament_id = ? AND left_at IS NULL
    `).all(t.id));
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
      score: comboMeScore?.score ?? null,
      volume_score: comboMeScore?.volume_score ?? null,
      trophy_score: comboMeScore?.trophy_score ?? null,
      joined_at: me.joined_at,
      left_at: me.left_at,
    } : null,
  });
});

// History: ended tournaments for the player's DEX, with their participation
// summary attached so the panel can show "your final standing" without an
// extra round-trip per tournament. Used by the History tab in
// TournamentPanel — the leaderboard itself is fetched lazily on click via
// /tournaments/:id/leaderboard (already public).
router.get('/tournaments/history', auth, (req, res) => {
  const dex = req.player.dex;
  const limit = Math.min(parseInt(req.query.limit, 10) || 20, 100);
  // status = 'ended' OR end_at < now (catch tournaments whose admin forgot
  // to flip the status flag — auto-ended by time still belongs in history).
  const rows = db.db.prepare(`
    SELECT t.*,
           tp.trophies   AS my_trophies,
           tp.gold       AS my_gold,
           tp.trades_count AS my_trades_count,
           tp.volume_usd AS my_volume_usd,
           tp.pnl_usd    AS my_pnl_usd,
           tp.left_at    AS my_left_at
    FROM tournaments t
    LEFT JOIN tournament_participants tp
      ON tp.tournament_id = t.id AND tp.player_id = ?
    WHERE t.dex = ?
      AND (
        t.status = 'ended'
        OR (t.end_at IS NOT NULL AND replace(replace(t.end_at, 'T', ' '), ' UTC', '') <= datetime('now'))
      )
    ORDER BY COALESCE(t.end_at, t.created_at) DESC, t.id DESC
    LIMIT ?
  `).all(req.player.id, dex, limit);
  const comboScores = new Map();
  for (const r of rows) {
    if (r.sort_by !== TOURNAMENT_COMBINED_SORT) continue;
    const scored = applyVolumeTrophyScore(db.db.prepare(`
      SELECT player_id, trophies, volume_usd
      FROM tournament_participants
      WHERE tournament_id = ? AND left_at IS NULL
    `).all(r.id));
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
        score: comboScores.get(r.id)?.score ?? null,
        volume_score: comboScores.get(r.id)?.volume_score ?? null,
        trophy_score: comboScores.get(r.id)?.trophy_score ?? null,
        left_at: r.my_left_at,
      } : null,
    })),
  });
});

// Join a tournament. Player can only join their own DEX's tournament. If
// they have a stale soft-leave row from a previous join we re-activate it
// (preserving counters? — no, reset to zero since the user explicitly
// left). The tournament can be in pre-registration or already live.
router.post('/tournaments/:id/join', auth, (req, res) => {
  const tid = parseInt(req.params.id, 10);
  if (!Number.isFinite(tid)) return res.status(400).json({ error: 'invalid id' });
  const t = db.db.prepare('SELECT * FROM tournaments WHERE id = ?').get(tid);
  if (!t) return res.status(404).json({ error: 'tournament not found' });
  if (t.status !== 'active') return res.status(400).json({ error: 'tournament not active' });
  if (t.dex !== req.player.dex) return res.status(403).json({ error: 'tournament is for a different DEX' });
  const now = nowSql();
  if (cleanSqlDate(t.end_at) && cleanSqlDate(t.end_at) <= now) return res.status(400).json({ error: 'tournament has ended' });
  const phase = tournamentPhase(t, now);
  if (phase === 'scheduled') return res.status(400).json({ error: 'pre-registration is not open' });
  if (phase === 'preregistration' && !isTournamentPreregOpen(t, now)) {
    return res.status(400).json({ error: 'pre-registration is closed' });
  }
  if (!canJoinTournament(t, now)) return res.status(400).json({ error: phase === 'live' ? 'registration is closed' : 'tournament is not joinable' });
  // Insert or re-activate. Reset counters on re-join — explicitly leaving
  // means the player accepts losing their slot's stats.
  db.db.prepare(`
    INSERT INTO tournament_participants (tournament_id, player_id, joined_at, left_at, trophies, gold, trades_count, volume_usd, pnl_usd)
    VALUES (?, ?, datetime('now'), NULL, 0, 0, 0, 0, 0)
    ON CONFLICT(tournament_id, player_id) DO UPDATE SET
      joined_at = datetime('now'),
      left_at = NULL,
      trophies = 0, gold = 0, trades_count = 0, volume_usd = 0, pnl_usd = 0,
      last_activity_at = datetime('now')
  `).run(tid, req.player.id);
  console.log(`[tournament ${tid} join] player=${req.player.name} (${req.player.dex}) phase=${phase} -> JOINED ${t.name}`);
  res.json({ ok: true, joined: true, phase });
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
router.get('/tournaments/:id/leaderboard', (req, res) => {
  const tid = parseInt(req.params.id, 10);
  if (!Number.isFinite(tid)) return res.status(400).json({ error: 'invalid id' });
  const t = db.db.prepare('SELECT * FROM tournaments WHERE id = ?').get(tid);
  if (!t) return res.status(404).json({ error: 'tournament not found' });
  // Whitelist sort columns to defend against future schema drift.
  const sortBy = normalizeTournamentSort(t.sort_by);
  const col = TOURNAMENT_SQL_SORT_COLS[sortBy] || 'tp.pnl_usd';
  const limit = Math.min(parseInt(req.query.limit, 10) || 50, 200);
  const baseSql = `
    SELECT tp.player_id, tp.trophies, tp.gold, tp.trades_count, tp.volume_usd, tp.pnl_usd,
           p.name, p.wallet
    FROM tournament_participants tp
    JOIN players p ON p.id = tp.player_id
    WHERE tp.tournament_id = ? AND tp.left_at IS NULL
  `;
  let rows;
  if (sortBy === TOURNAMENT_COMBINED_SORT) {
    rows = applyVolumeTrophyScore(db.db.prepare(baseSql).all(tid))
      .sort((a, b) =>
        (Number(b.score) || 0) - (Number(a.score) || 0)
        || (Number(b.volume_usd) || 0) - (Number(a.volume_usd) || 0)
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
  res.json({
    tournament: tournamentRowToPublic(t),
    sort_by: sortBy,
    sort_label: tournamentSortLabel(sortBy),
    leaderboard: rows.map((r, i) => ({
      rank: i + 1,
      player_id: r.player_id,
      name: r.name,
      wallet: r.wallet,
      trophies: r.trophies,
      gold: r.gold,
      trades_count: r.trades_count,
      volume_usd: r.volume_usd,
      pnl_usd: r.pnl_usd,
      score: r.score ?? null,
      volume_score: r.volume_score ?? null,
      trophy_score: r.trophy_score ?? null,
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
           SUM(CASE WHEN player_id IS NOT NULL AND left_at IS NULL THEN 1 ELSE 0 END) AS active_players
    FROM tournament_participants
    GROUP BY tournament_id
  `).all();
  const countMap = {};
  for (const c of counts) countMap[c.tournament_id] = c;
  res.json({
    tournaments: rows.map(t => ({
      ...tournamentRowToPublic(t),
      participants: countMap[t.id]?.active_players || 0,
      registered: countMap[t.id]?.players || 0,
    })),
  });
});

// Create a tournament. start_at defaults to now, end_at is optional, boosts
// default to 1.0 (no boost), sort_by defaults to pnl_usd.
router.post('/admin/tournaments', adminAuth, (req, res) => {
  const {
    name, description, dex, start_at, end_at, gold_boost, trophy_boost, sort_by, status,
    freeze_trophies, preregistration_enabled, registration_opens_at, registration_closes_at,
  } = req.body || {};
  if (!name || typeof name !== 'string') return res.status(400).json({ error: 'name required' });
  if (!['pacifica', 'avantis', 'decibel', 'gmx', 'monad', 'phoenix'].includes(dex)) return res.status(400).json({ error: 'invalid dex' });
  const sortCol = normalizeTournamentSort(sort_by);
  const STATUSES = ['active', 'ended', 'draft'];
  const stat = STATUSES.includes(status) ? status : 'active';
  // Boosts clamped to a sane range so an admin typo can't print 1000x gold.
  const gb = Math.max(0.1, Math.min(10, Number(gold_boost) || 1));
  const tb = Math.max(0.1, Math.min(10, Number(trophy_boost) || 1));
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
  const prereg = parseBool(preregistration_enabled) ? 1 : 0;
  const r = db.db.prepare(`
    INSERT INTO tournaments (
      name, description, dex, start_at, end_at, gold_boost, trophy_boost, sort_by, status,
      freeze_trophies, preregistration_enabled, registration_opens_at, registration_closes_at
    )
    VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
  `).run(
    name.trim(),
    (description || '').toString().slice(0, 500),
    dex,
    startIso,
    endIso,
    gb,
    tb,
    sortCol,
    stat,
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
    name, description, dex, start_at, end_at, gold_boost, trophy_boost, sort_by, status,
    freeze_trophies, preregistration_enabled, registration_opens_at, registration_closes_at,
  } = req.body || {};
  const validDexes = ['pacifica', 'avantis', 'decibel', 'gmx', 'monad', 'phoenix'];
  if (dex !== undefined && !validDexes.includes(dex)) return res.status(400).json({ error: 'invalid dex' });
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
  const next = {
    name: name && typeof name === 'string' ? name.trim() : t.name,
    description: description !== undefined ? String(description).slice(0, 500) : t.description,
    dex: dex !== undefined ? dex : t.dex,
    start_at: nextStartAt,
    end_at: nextEndAt,
    gold_boost: gold_boost !== undefined ? Math.max(0.1, Math.min(10, Number(gold_boost) || 1)) : t.gold_boost,
    trophy_boost: trophy_boost !== undefined ? Math.max(0.1, Math.min(10, Number(trophy_boost) || 1)) : t.trophy_boost,
    freeze_trophies: freeze_trophies !== undefined
      ? (parseBool(freeze_trophies) ? 1 : 0)
      : Number(t.freeze_trophies ?? 1),
    sort_by: normalizeTournamentSort(sort_by, t.sort_by),
    status: STATUSES.includes(status) ? status : t.status,
    preregistration_enabled: preregistration_enabled !== undefined
      ? (parseBool(preregistration_enabled) ? 1 : 0)
      : Number(t.preregistration_enabled || 0),
    registration_opens_at: nextRegistrationOpensAt,
    registration_closes_at: nextRegistrationClosesAt,
  };
  db.db.prepare(`
    UPDATE tournaments SET name = ?, description = ?, dex = ?, start_at = ?, end_at = ?,
                            gold_boost = ?, trophy_boost = ?, sort_by = ?, status = ?,
                            freeze_trophies = ?, preregistration_enabled = ?, registration_opens_at = ?, registration_closes_at = ?
    WHERE id = ?
  `).run(
    next.name,
    next.description,
    next.dex,
    next.start_at,
    next.end_at,
    next.gold_boost,
    next.trophy_boost,
    next.sort_by,
    next.status,
    next.freeze_trophies,
    next.preregistration_enabled,
    next.registration_opens_at,
    next.registration_closes_at,
    tid
  );
  const updated = db.db.prepare('SELECT * FROM tournaments WHERE id = ?').get(tid);
  res.json({ ok: true, tournament: tournamentRowToPublic(updated) });
});

// Force-end a tournament: sets status='ended' so it disappears from
// `getActiveTournamentForPlayer` immediately. Counters stay around so the
// admin can still inspect the leaderboard.
router.post('/admin/tournaments/:id/end', adminAuth, (req, res) => {
  const tid = parseInt(req.params.id, 10);
  if (!Number.isFinite(tid)) return res.status(400).json({ error: 'invalid id' });
  db.db.prepare("UPDATE tournaments SET status = 'ended' WHERE id = ?").run(tid);
  res.json({ ok: true });
});

// Delete a tournament (and its participants via ON DELETE CASCADE).
router.delete('/admin/tournaments/:id', adminAuth, (req, res) => {
  const tid = parseInt(req.params.id, 10);
  if (!Number.isFinite(tid)) return res.status(400).json({ error: 'invalid id' });
  db.db.prepare('DELETE FROM tournaments WHERE id = ?').run(tid);
  res.json({ ok: true });
});

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
    const data = await earnings.fetchAllEarnings({ force: req.query.force === '1' });
    res.json(data);
  } catch (e) {
    console.warn('[earnings] aggregate failed:', e.message);
    res.status(500).json({ error: e.message });
  }
});

module.exports = { router, auth, addLog, logBattle, logEconomy, logAuth, logError };
