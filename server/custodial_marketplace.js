const crypto = require('crypto');
const gameDb = require('./db');
const {
  CHAIN_IDS,
  EVM_CHAINS,
  ALL_CHAINS,
  aptosAccount,
  aptosFullnodeBase,
  buildSolanaBridgeMemo,
  deploymentOf,
  getSolanaBridgeAssetInfo,
  normalizeBridgeCollectionSlug,
  normalizeAptosAddress,
  parseSolanaSecretKey,
  solanaConnection,
} = require('./bridge_helpers');
const {
  createSolanaConnection,
  solanaNonHeliusRpcUrls,
  solanaRpcUrls,
  withSolanaRpcFallback,
} = require('./solana_rpc');

const TRANSFER_TOPIC = '0xddf252ad1be2c89b69c2b068fc378daa952ba7f163c4a11628f55a4df523b3ef';
const BASE_USDC_TOKEN = '0x833589fCD6eDb6E08f4c7C32D4f71b54bdA02913';
const INK_USDC_TOKEN = '0x2D270e6886d130D724215A266106e6832161EAEd';
const SOLANA_USDC_MINT = 'EPjFWdd5AufqSSqeM2qN1xzybapC8G4wEGGkZwyTDt1v';
const APTOS_USDC_METADATA = '0xbae207659db88bea0cbead6da0ed00aac12edcdda169e591cd41c94180b46f3b';
const APTOS_TOKEN_TYPE = '0x4::token::Token';
const SOLANA_MEMO_PROGRAM = 'MemoSq4gqABAXKb96qnH8TysNcWxMyWCqXgDLGmfcHr';
let settlementWorkerStarted = false;
let settlementWorkerRunning = false;
let depositVerifierRunning = false;

const EVM_CHAIN_META = {
  base: { chainId: 8453, label: 'Base', rpcEnv: ['MARKETPLACE_BASE_RPC_URL', 'GAME_SHOP_BASE_RPC_URL', 'BASE_RPC_URL', 'NFT_BASE_RPC_URL'], rpcDefault: 'https://mainnet.base.org' },
  arbitrum: { chainId: 42161, label: 'Arbitrum', rpcEnv: ['MARKETPLACE_ARBITRUM_RPC_URL', 'GAME_SHOP_ARB_RPC_URL', 'ARBITRUM_RPC_URL', 'NFT_ARBITRUM_RPC_URL'], rpcDefault: 'https://arb1.arbitrum.io/rpc' },
  monad: { chainId: 143, label: 'Monad', rpcEnv: ['MARKETPLACE_MONAD_RPC_URL', 'GAME_SHOP_MONAD_RPC_URL', 'MONAD_RPC_URL', 'NFT_MONAD_RPC_URL'], rpcDefault: 'https://rpc.monad.xyz' },
  ink: { chainId: 57073, label: 'Ink', rpcEnv: ['MARKETPLACE_INK_RPC_URL', 'GAME_SHOP_INK_RPC_URL', 'INK_RPC_URL', 'NFT_INK_RPC_URL'], rpcDefault: 'https://rpc-gel.inkonchain.com' },
};

const ERC721_ABI = [
  { name: 'ownerOf', type: 'function', stateMutability: 'view', inputs: [{ type: 'uint256' }], outputs: [{ type: 'address' }] },
  { name: 'tokenLevel', type: 'function', stateMutability: 'view', inputs: [{ type: 'uint256' }], outputs: [{ type: 'uint8' }] },
  { name: 'getLevel', type: 'function', stateMutability: 'view', inputs: [{ type: 'uint256' }], outputs: [{ type: 'uint8' }] },
  { name: 'safeTransferFrom', type: 'function', stateMutability: 'nonpayable', inputs: [{ type: 'address' }, { type: 'address' }, { type: 'uint256' }], outputs: [] },
  { name: 'bridgeBurn', type: 'function', stateMutability: 'payable', inputs: [{ type: 'uint256' }, { type: 'uint256' }], outputs: [] },
  { name: 'bridgeFeeWei', type: 'function', stateMutability: 'view', inputs: [], outputs: [{ type: 'uint256' }] },
];

const ERC20_ABI = [
  { name: 'transfer', type: 'function', stateMutability: 'nonpayable', inputs: [{ type: 'address' }, { type: 'uint256' }], outputs: [{ type: 'bool' }] },
  { name: 'balanceOf', type: 'function', stateMutability: 'view', inputs: [{ type: 'address' }], outputs: [{ type: 'uint256' }] },
];

function httpError(status, message) {
  const err = new Error(message);
  err.status = status;
  return err;
}

function safeJsonParse(raw, fallback = {}) {
  try { return raw ? JSON.parse(raw) : fallback; } catch { return fallback; }
}

function nowSec() {
  return Math.floor(Date.now() / 1000);
}

function isEvmChain(chain) {
  return EVM_CHAINS.has(String(chain || '').toLowerCase());
}

function normalizeChain(value, label = 'chain') {
  const chain = String(value || '').trim().toLowerCase();
  if (!ALL_CHAINS.includes(chain)) throw httpError(400, `Unsupported ${label}`);
  return chain;
}

function normalizeSolanaPubkey(value, label = 'Solana address') {
  try {
    const { PublicKey } = require('@solana/web3.js');
    return new PublicKey(String(value || '').trim()).toBase58();
  } catch {
    throw httpError(400, `${label} is malformed`);
  }
}

function normalizeEvmAddress(value, label = 'EVM address') {
  const s = String(value || '').trim();
  if (!/^0x[0-9a-fA-F]{40}$/.test(s)) throw httpError(400, `${label} is malformed`);
  return `0x${s.slice(2).toLowerCase()}`;
}

function normalizeAptosWallet(value, label = 'Aptos address') {
  const normalized = normalizeAptosAddress(value);
  if (!normalized) throw httpError(400, `${label} is malformed`);
  return normalized;
}

function normalizeAddressForChain(chain, value, label = 'wallet') {
  if (isEvmChain(chain)) return normalizeEvmAddress(value, label);
  if (chain === 'solana') return normalizeSolanaPubkey(value, label);
  if (chain === 'aptos') return normalizeAptosWallet(value, label);
  throw httpError(400, `Unsupported chain ${chain}`);
}

function normalizeAddressForChainSafe(chain, value) {
  try {
    return normalizeAddressForChain(chain, value, 'wallet');
  } catch {
    return '';
  }
}

function sameChainAddress(chain, a, b) {
  const left = normalizeAddressForChainSafe(chain, a);
  const right = normalizeAddressForChainSafe(chain, b);
  return !!left && !!right && left === right;
}

function cachedPlayerNft(playerId, collection, chain, tokenId) {
  const normalizedChain = String(chain || '').toLowerCase();
  const normalizedCollection = String(collection || 'demon_king').toLowerCase();
  const normalizedTokenId = String(tokenId || '').trim();
  if (!playerId || !normalizedChain || !normalizedTokenId) return null;
  return gameDb.db.prepare(`
    SELECT player_id, collection, chain, token_id, wallet, level, image_url, active, source, updated_at
      FROM player_nfts
     WHERE player_id = ?
       AND lower(collection) = ?
       AND lower(chain) = ?
       AND token_id = ?
       AND active = 1
     ORDER BY updated_at DESC
     LIMIT 1
  `).get(String(playerId), normalizedCollection, normalizedChain, normalizedTokenId) || null;
}

function mergeCachedNftLevel(assetInfo, cached) {
  if (!cached) return assetInfo;
  const cachedLevel = Number(cached.level || 0);
  if (![1, 2, 3].includes(cachedLevel)) return assetInfo;
  const currentLevel = Number(assetInfo?.level || 1);
  if (cachedLevel <= currentLevel) return assetInfo;
  return {
    ...assetInfo,
    level: cachedLevel,
    cachedLevelSource: 'player_nfts',
  };
}

function marketplaceCollectionDbKey(order = {}) {
  const chain = String(order.asset_chain || '').toLowerCase();
  const meta = safeJsonParse(order.metadata_json, {});
  const textCandidates = [
    order.collection,
    order.collection_slug,
    order.collectionSlug,
    order.asset_collection_slug,
    meta.collection,
    meta.collectionSlug,
    meta.assetCollectionSlug,
    meta.assetInfo?.collectionSlug,
    meta.assetInfo?.collectionKey,
    meta.assetInfo?.collectionName,
    meta.assetInfo?.name,
  ].filter(Boolean);
  for (const candidate of textCandidates) {
    const text = String(candidate || '').toLowerCase();
    if (text.includes('dragon')) return 'dragon';
    const slug = normalizeBridgeCollectionSlug(candidate);
    if (slug === 'dragon') return 'dragon';
    if (slug === 'demonking') return 'demon_king';
  }

  const onChainCollection = String(order.asset_collection || meta.assetInfo?.collection || '').trim();
  if (onChainCollection && chain) {
    for (const slug of ['dragon', 'demonking']) {
      const dep = deploymentOf(chain, slug) || {};
      const candidates = [
        dep.proxy,
        dep.nft,
        dep.contract,
        dep.collection,
        dep.candyMachine,
      ].filter(Boolean);
      if (candidates.some((value) => sameChainAddress(chain, value, onChainCollection))) {
        return slug === 'dragon' ? 'dragon' : 'demon_king';
      }
    }
  }

  return 'demon_king';
}

function marketplaceAssetImageUrl(order = {}) {
  const meta = safeJsonParse(order.metadata_json, {});
  return meta.assetInfo?.imageUrl || meta.assetInfo?.image || meta.imageUrl || null;
}

function deactivateMarketplaceAssetFromPlayerInventory(order = {}) {
  const collection = marketplaceCollectionDbKey(order);
  const chain = String(order.asset_chain || '').toLowerCase();
  const tokenId = String(order.asset_id || '').trim();
  if (!collection || !chain || !tokenId) return 0;
  const info = gameDb.db.prepare(`
    UPDATE player_nfts
       SET active = 0,
           updated_at = datetime('now')
     WHERE collection = ?
       AND chain = ?
       AND token_id = ?
       AND active = 1
  `).run(collection, chain, tokenId);
  return Number(info?.changes || 0);
}

function bindMarketplaceAssetToPlayer(order = {}, playerId, wallet, source, txHash = null, ref = {}) {
  const owner = String(wallet || '').trim();
  const id = String(playerId || '').trim();
  const chain = String(ref.chain || order.asset_chain || '').toLowerCase();
  const tokenId = String(ref.tokenId || order.asset_id || '').trim();
  if (!id || !owner || !chain || !tokenId) return null;
  const collection = marketplaceCollectionDbKey(order);
  try {
    return gameDb.bindPlayerCollectionNft(id, collection, owner, {
      chain,
      tokenId,
      level: Number(order.level || 1),
      imageUrl: marketplaceAssetImageUrl(order),
    }, {
      source,
      txHash,
    });
  } catch (err) {
    console.warn('[custodial-marketplace] failed to bind delivered NFT inventory', {
      order_id: order.id,
      player_id: id,
      collection,
      chain,
      token_id: tokenId,
      error: err?.message || String(err),
    });
    return null;
  }
}

function normalizeAssetIdForChain(chain, value, label = 'assetId') {
  const raw = String(value || '').trim();
  if (!raw) throw httpError(400, `${label} required`);
  if (isEvmChain(chain)) {
    try {
      const tokenId = BigInt(raw);
      if (tokenId < 0n) throw new Error('negative');
      return tokenId.toString();
    } catch {
      throw httpError(400, `${label} is malformed`);
    }
  }
  if (chain === 'solana') return normalizeSolanaPubkey(raw, label);
  if (chain === 'aptos') return normalizeAptosWallet(raw, label);
  return raw;
}

function parseUsdcUnits(value, label = 'USDC amount') {
  const s = String(value ?? '').trim();
  if (!/^\d+(?:\.\d{1,6})?$/.test(s)) throw httpError(400, `${label} must be a positive USDC amount`);
  const [whole, frac = ''] = s.split('.');
  const units = BigInt(whole) * 1_000_000n + BigInt(frac.padEnd(6, '0') || '0');
  if (units <= 0n) throw httpError(400, `${label} must be greater than zero`);
  return units;
}

function formatUnits(units, decimals = 6) {
  const v = BigInt(String(units || '0'));
  const scale = 10n ** BigInt(Number(decimals) || 0);
  const whole = scale > 0n ? v / scale : v;
  const frac = scale > 0n ? (v % scale).toString().padStart(Number(decimals) || 0, '0').replace(/0+$/, '') : '';
  return frac ? `${whole.toString()}.${frac}` : whole.toString();
}

function scaleUsdc6ToDecimals(units, decimals) {
  const raw = BigInt(String(units || '0'));
  const d = Number(decimals);
  if (d === 6) return raw;
  if (d > 6) return raw * (10n ** BigInt(d - 6));
  return raw / (10n ** BigInt(6 - d));
}

function decimalToScaledBigInt(value, scaleDecimals = 12) {
  const raw = String(value ?? '').trim();
  if (!raw || /^nan$/i.test(raw)) return 0n;
  if (/e/i.test(raw)) {
    const n = Number(raw);
    if (!Number.isFinite(n) || n <= 0) return 0n;
    return decimalToScaledBigInt(n.toFixed(scaleDecimals), scaleDecimals);
  }
  const sign = raw.startsWith('-') ? -1n : 1n;
  const unsigned = raw.replace(/^[+-]/, '');
  if (!/^\d+(?:\.\d+)?$/.test(unsigned)) return 0n;
  const [whole, frac = ''] = unsigned.split('.');
  const scaledFrac = (frac + '0'.repeat(scaleDecimals)).slice(0, scaleDecimals);
  return sign * (BigInt(whole || '0') * (10n ** BigInt(scaleDecimals)) + BigInt(scaledFrac || '0'));
}

function usd6ToTokenUnits(usdUnits, tokenUsdPrice, decimals) {
  const rawUsd = BigInt(String(usdUnits || '0'));
  const priceScale = 12;
  const price = decimalToScaledBigInt(tokenUsdPrice, priceScale);
  const d = Math.max(0, Number(decimals) || 0);
  if (price <= 0n) {
    throw httpError(503, 'CLASH price is unavailable');
  }
  const numerator = rawUsd * (10n ** BigInt(d)) * (10n ** BigInt(priceScale));
  const denominator = 1_000_000n * price;
  const units = (numerator + denominator - 1n) / denominator;
  if (units <= 0n) {
    throw httpError(503, 'CLASH quote could not be calculated');
  }
  return units;
}

function shortLabel(chain) {
  return EVM_CHAIN_META[chain]?.label || (chain === 'solana' ? 'Solana' : chain === 'aptos' ? 'Aptos' : chain);
}

function firstEnv(...keys) {
  for (const key of keys) {
    const value = String(process.env[key] || '').trim();
    if (value) return value;
  }
  return null;
}

function envFlag(name, defaultValue = false) {
  const raw = process.env[name];
  if (raw == null || raw === '') return !!defaultValue;
  return !/^(0|false|no|off)$/i.test(String(raw).trim());
}

function marketplaceFeeBps() {
  return Math.max(0, Math.min(2000, Number(process.env.CUSTODIAL_MARKETPLACE_FEE_BPS || '400') || 0));
}

function marketplaceRoyaltyBps() {
  return Math.max(0, Math.min(1000, Number(
    process.env.CUSTODIAL_MARKETPLACE_ROYALTY_BPS
      || process.env.NFT_COLLECTION_ROYALTY_BPS
      || process.env.NFT_SELLER_FEE_BASIS_POINTS
      || '250'
  ) || 0));
}

function quoteMarketplaceSplit(priceUnits, feeBps = marketplaceFeeBps(), royaltyBps = marketplaceRoyaltyBps()) {
  const price = BigInt(String(priceUnits || '0'));
  const fee = price * BigInt(feeBps) / 10_000n;
  const royalty = price * BigInt(royaltyBps) / 10_000n;
  const sellerAmount = price - fee - royalty;
  return { feeBps, royaltyBps, fee, royalty, sellerAmount };
}

function proportionalTokenAmount(totalTokenUnits, partUsdUnits, totalUsdUnits) {
  const total = BigInt(String(totalTokenUnits || '0'));
  const part = BigInt(String(partUsdUnits || '0'));
  const whole = BigInt(String(totalUsdUnits || '0'));
  if (total <= 0n || part <= 0n || whole <= 0n) return 0n;
  return total * part / whole;
}

function solanaSellerPayoutUnits(order) {
  if (String(order?.payment_chain || '').toLowerCase() !== 'solana') {
    return BigInt(String(order?.seller_amount_usdc_units || '0'));
  }
  if (String(order?.payment_token || 'usdc').toLowerCase() === 'usdc') {
    return BigInt(String(order?.seller_amount_usdc_units || '0'));
  }
  return proportionalTokenAmount(
    order?.payment_amount_usdc_units,
    order?.seller_amount_usdc_units,
    order?.price_usdc_units
  );
}

function solanaRevenuePayoutUnits(order, sellerTokenUnits) {
  if (String(order?.payment_chain || '').toLowerCase() !== 'solana') return 0n;
  const paid = BigInt(String(order?.payment_amount_usdc_units || '0'));
  if (paid <= 0n) return 0n;
  if (String(order?.payment_token || 'usdc').toLowerCase() === 'usdc') {
    const feeRoyalty = BigInt(String(order?.fee_usdc_units || '0')) + BigInt(String(order?.royalty_usdc_units || '0'));
    const priceAmount = BigInt(String(order?.price_usdc_units || '0'));
    const paymentSalt = paid > priceAmount ? paid - priceAmount : 0n;
    return feeRoyalty + paymentSalt;
  }
  const seller = BigInt(String(sellerTokenUnits || '0'));
  return paid > seller ? paid - seller : 0n;
}

function solanaSellerPayoutTokenConfig(ctx, order, baseConfig) {
  const paymentChain = String(order?.payment_chain || '').toLowerCase();
  if (paymentChain === 'solana') {
    return {
      ...baseConfig,
      token: order?.payment_token || baseConfig.token,
      tokenAddress: order?.payment_token_address || baseConfig.tokenAddress,
      decimals: Number(order?.payment_decimals || baseConfig.decimals || 6),
      label: order?.payment_label || baseConfig.label || baseConfig.token || 'token',
    };
  }
  const sol = ctx.gameShopSolanaConfig?.() || {};
  return {
    ...baseConfig,
    token: 'usdc',
    tokenAddress: normalizeSolanaPubkey(
      process.env.MARKETPLACE_SOLANA_USDC_MINT || sol.usdcMint || SOLANA_USDC_MINT,
      'Solana payout USDC mint'
    ),
    decimals: 6,
    label: 'USDC',
  };
}

function insertEvent(orderId, eventType, { actorPlayerId = null, txHash = null, data = {} } = {}) {
  gameDb.db.prepare(`
    INSERT INTO custodial_marketplace_events
      (order_id, event_type, actor_player_id, tx_hash, data_json)
    VALUES (?, ?, ?, ?, ?)
  `).run(orderId, eventType, actorPlayerId, txHash, JSON.stringify(data || {}));
}

function getOrder(orderId) {
  return gameDb.db.prepare('SELECT * FROM custodial_marketplace_orders WHERE id = ?').get(String(orderId || '')) || null;
}

function playerNameById(playerId) {
  if (!playerId) return null;
  return gameDb.db.prepare('SELECT name FROM players WHERE id = ?').get(String(playerId))?.name || null;
}

function getOpenOrderByAsset(assetChain, assetId) {
  return gameDb.db.prepare(`
    SELECT * FROM custodial_marketplace_orders
    WHERE asset_chain = ?
      AND asset_id = ?
      AND status IN ('awaiting_deposit', 'active', 'reserved', 'paid', 'delivering')
    ORDER BY updated_at DESC
    LIMIT 1
  `).get(assetChain, assetId) || null;
}

function getRecoverableCustodiedOrderByAsset(assetChain, assetId, sellerPlayerId, sellerWallet) {
  return gameDb.db.prepare(`
    SELECT * FROM custodial_marketplace_orders
    WHERE asset_chain = ?
      AND asset_id = ?
      AND status = 'cancelled'
      AND seller_player_id = ?
      AND lower(seller_wallet) = lower(?)
    ORDER BY updated_at DESC
    LIMIT 1
  `).get(assetChain, assetId, sellerPlayerId, sellerWallet) || null;
}

function playerMarketplaceWallets(player) {
  const out = { evm: new Set(), solana: new Set(), aptos: new Set() };
  const add = (chainType, value) => {
    const type = String(chainType || '').toLowerCase();
    const raw = String(value || '').trim();
    if (!raw) return;
    if (type === 'evm') {
      const normalized = normalizeAddressForChainSafe('base', raw);
      if (normalized) out.evm.add(normalized);
      return;
    }
    if (type === 'solana') {
      const normalized = normalizeAddressForChainSafe('solana', raw);
      if (normalized) out.solana.add(normalized);
      return;
    }
    if (type === 'aptos') {
      const normalized = normalizeAddressForChainSafe('aptos', raw);
      if (normalized) out.aptos.add(normalized);
    }
  };
  const legacyWallet = String(player?.wallet || '').trim();
  if (/^0x[0-9a-fA-F]{40}$/.test(legacyWallet)) add('evm', legacyWallet);
  else if (/^0x[0-9a-fA-F]{1,64}$/.test(legacyWallet)) add('aptos', legacyWallet);
  else add('solana', legacyWallet);
  if (player?.id) {
    const walletRows = gameDb.db.prepare(`
      SELECT chain_type, address FROM player_wallets WHERE player_id = ?
    `).all(String(player.id));
    for (const row of walletRows) add(row.chain_type, row.address);
    const dexRows = gameDb.db.prepare(`
      SELECT chain_type, wallet_address FROM player_dex_accounts
      WHERE player_id = ? AND wallet_address IS NOT NULL AND LENGTH(wallet_address) > 0
    `).all(String(player.id));
    for (const row of dexRows) add(row.chain_type, row.wallet_address);
  }
  return out;
}

function walletSetForChain(wallets, chain) {
  const key = isEvmChain(chain) ? 'evm' : String(chain || '').toLowerCase();
  return wallets?.[key] || new Set();
}

function orderSellerMatchesPlayer(order, player) {
  if (!order) return false;
  if (String(order.seller_player_id || '') === String(player?.id || '')) return true;
  const wallets = walletSetForChain(playerMarketplaceWallets(player), order.asset_chain);
  for (const wallet of wallets) {
    if (sameChainAddress(order.asset_chain, order.seller_wallet, wallet)) return true;
  }
  return false;
}

function orderBuyerMatchesPlayer(order, player) {
  if (!order) return false;
  if (String(order.buyer_player_id || '') === String(player?.id || '')) return true;
  const wallets = walletSetForChain(playerMarketplaceWallets(player), order.payment_chain);
  for (const wallet of wallets) {
    if (sameChainAddress(order.payment_chain, order.buyer_wallet, wallet)) return true;
  }
  return false;
}

function mineOrdersWhere(player) {
  const wallets = playerMarketplaceWallets(player);
  const clauses = ['seller_player_id = ?', 'buyer_player_id = ?'];
  const params = [player.id, player.id];
  const evmWallets = Array.from(wallets.evm);
  if (evmWallets.length) {
    const placeholders = evmWallets.map(() => '?').join(',');
    clauses.push(`(asset_chain IN (${Array.from(EVM_CHAINS).map(() => '?').join(',')}) AND lower(seller_wallet) IN (${placeholders}))`);
    params.push(...Array.from(EVM_CHAINS), ...evmWallets);
    clauses.push(`(payment_chain IN (${Array.from(EVM_CHAINS).map(() => '?').join(',')}) AND lower(buyer_wallet) IN (${placeholders}))`);
    params.push(...Array.from(EVM_CHAINS), ...evmWallets);
  }
  const solWallets = Array.from(wallets.solana);
  if (solWallets.length) {
    const placeholders = solWallets.map(() => '?').join(',');
    clauses.push(`(asset_chain = 'solana' AND seller_wallet IN (${placeholders}))`);
    params.push(...solWallets);
    clauses.push(`(payment_chain = 'solana' AND buyer_wallet IN (${placeholders}))`);
    params.push(...solWallets);
  }
  const aptosWallets = Array.from(wallets.aptos);
  if (aptosWallets.length) {
    const placeholders = aptosWallets.map(() => '?').join(',');
    clauses.push(`(asset_chain = 'aptos' AND lower(seller_wallet) IN (${placeholders}))`);
    params.push(...aptosWallets);
    clauses.push(`(payment_chain = 'aptos' AND lower(buyer_wallet) IN (${placeholders}))`);
    params.push(...aptosWallets);
  }
  return { where: clauses.join(' OR '), params };
}

function cancelAwaitingDepositOrder(order, { actorPlayerId = null, eventType = 'cancelled_before_deposit', data = {} } = {}) {
  gameDb.db.transaction(() => {
    gameDb.db.prepare(`
      UPDATE custodial_marketplace_orders
         SET status = 'cancelled',
             cancelled_at = datetime('now'),
             updated_at = datetime('now')
       WHERE id = ? AND status = 'awaiting_deposit'
    `).run(order.id);
    insertEvent(order.id, eventType, { actorPlayerId, data });
  })();
  return getOrder(order.id);
}

function awaitingDepositTtlSeconds() {
  return Math.max(300, Math.min(86_400, Number(process.env.CUSTODIAL_MARKETPLACE_DEPOSIT_TTL_SECONDS || 1800) || 1800));
}

function isAwaitingDepositStale(order) {
  if (!order || order.status !== 'awaiting_deposit') return false;
  const createdMs = Date.parse(`${String(order.created_at || '').replace(' ', 'T')}Z`);
  if (!Number.isFinite(createdMs)) return false;
  return Date.now() - createdMs > awaitingDepositTtlSeconds() * 1000;
}

function markOrderDepositVerified(order, { actorPlayerId = null, txHash = null, eventType = 'deposit_verified' } = {}) {
  gameDb.db.transaction(() => {
    gameDb.db.prepare(`
      UPDATE custodial_marketplace_orders
         SET status = 'active',
             deposit_tx_hash = COALESCE(?, deposit_tx_hash),
             deposit_verified_at = COALESCE(deposit_verified_at, datetime('now')),
             error = NULL,
             updated_at = datetime('now')
       WHERE id = ? AND status = 'awaiting_deposit'
    `).run(txHash, order.id);
    const deactivated = deactivateMarketplaceAssetFromPlayerInventory(order);
    insertEvent(order.id, eventType, { actorPlayerId, txHash, data: { vault: order.vault_address } });
    if (deactivated > 0) {
      insertEvent(order.id, 'inventory_deactivated_for_listing', {
        actorPlayerId,
        data: {
          collection: marketplaceCollectionDbKey(order),
          chain: order.asset_chain,
          assetId: order.asset_id,
          rows: deactivated,
        },
      });
    }
  })();
  return getOrder(order.id);
}

function recoverCustodiedListing(order, {
  actorPlayerId,
  sellerWallet,
  payoutChain,
  payoutAddress,
  vault,
  assetInfo,
  priceUnits,
  fee,
  royalty,
  sellerAmount,
  feeBps,
  royaltyBps,
  metadata,
}) {
  gameDb.db.transaction(() => {
    gameDb.db.prepare(`
      UPDATE custodial_marketplace_orders
         SET status = 'active',
             seller_wallet = ?,
             seller_payout_chain = ?,
             seller_payout_address = ?,
             asset_standard = ?,
             asset_collection = ?,
             level = ?,
             price_usdc_units = ?,
             fee_bps = ?,
             fee_usdc_units = ?,
             royalty_bps = ?,
             royalty_usdc_units = ?,
             seller_amount_usdc_units = ?,
             payment_chain = 'base',
             payment_token = 'usdc',
             payment_token_address = NULL,
             payment_decimals = 6,
             payment_label = 'USDC',
             payment_treasury = NULL,
             payment_amount_usdc_units = NULL,
             payment_nonce = NULL,
             payment_deadline = NULL,
             buyer_player_id = NULL,
             buyer_wallet = NULL,
             buyer_dest_chain = NULL,
             buyer_dest_address = NULL,
             vault_chain = ?,
             vault_address = ?,
             deposit_verified_at = COALESCE(deposit_verified_at, datetime('now')),
             cancelled_at = NULL,
             cancel_tx_hash = NULL,
             error = NULL,
             metadata_json = ?,
             updated_at = datetime('now')
       WHERE id = ?
    `).run(
      sellerWallet,
      payoutChain,
      payoutAddress,
      assetInfo.standard || null,
      assetInfo.collection || null,
      Number(assetInfo.level || 1),
      priceUnits.toString(),
      feeBps,
      fee.toString(),
      royaltyBps,
      royalty.toString(),
      sellerAmount.toString(),
      order.asset_chain,
      vault.address,
      JSON.stringify(metadata || {}),
      order.id,
    );
    const inventoryOrder = {
      ...order,
      asset_collection: assetInfo.collection || order.asset_collection,
      metadata_json: JSON.stringify(metadata || {}),
    };
    const deactivated = deactivateMarketplaceAssetFromPlayerInventory(inventoryOrder);
    insertEvent(order.id, 'listing_recovered_from_cancelled_deposit', {
      actorPlayerId,
      data: {
        assetChain: order.asset_chain,
        assetId: order.asset_id,
        sellerWallet,
        priceUsdcUnits: priceUnits.toString(),
        vault: vault.address,
      },
    });
    if (deactivated > 0) {
      insertEvent(order.id, 'inventory_deactivated_for_listing', {
        actorPlayerId,
        data: {
          collection: marketplaceCollectionDbKey(inventoryOrder),
          chain: order.asset_chain,
          assetId: order.asset_id,
          rows: deactivated,
        },
      });
    }
  })();
  return getOrder(order.id);
}

async function activateOrderIfVaultOwnsAsset(order, { actorPlayerId = null, txHash = null, eventType = 'deposit_verified' } = {}) {
  if (!order) return null;
  if (order.status === 'active') return order;
  if (order.status !== 'awaiting_deposit') return null;
  let txVerifyError = null;
  if (txHash && isEvmChain(order.asset_chain)) {
    try {
      await verifyEvmNftDepositTx(order, txHash);
      return markOrderDepositVerified(order, { actorPlayerId, txHash, eventType });
    } catch (err) {
      txVerifyError = err;
    }
  }
  try {
    await verifyAssetOwner(order.asset_chain, order.asset_id, order.vault_address);
  } catch (err) {
    if (txVerifyError) throw txVerifyError;
    throw err;
  }
  return markOrderDepositVerified(order, { actorPlayerId, txHash, eventType });
}

function backfillOpenOrderFees() {
  const rows = gameDb.db.prepare(`
    SELECT id, price_usdc_units, fee_bps, royalty_bps, seller_amount_usdc_units
    FROM custodial_marketplace_orders
    WHERE status IN ('awaiting_deposit', 'active', 'reserved')
      AND (
        COALESCE(fee_bps, 0) <> ?
        OR COALESCE(royalty_bps, 0) <> ?
        OR COALESCE(fee_usdc_units, '0') = '0'
        OR COALESCE(royalty_usdc_units, '0') = '0'
      )
  `).all(marketplaceFeeBps(), marketplaceRoyaltyBps());
  if (!rows.length) return;
  const update = gameDb.db.prepare(`
    UPDATE custodial_marketplace_orders
    SET fee_bps = ?,
        fee_usdc_units = ?,
        royalty_bps = ?,
        royalty_usdc_units = ?,
        seller_amount_usdc_units = ?,
        updated_at = CURRENT_TIMESTAMP
    WHERE id = ?
  `);
  let changed = 0;
  const tx = gameDb.db.transaction(() => {
    for (const row of rows) {
      const split = quoteMarketplaceSplit(row.price_usdc_units);
      if (split.sellerAmount <= 0n) {
        console.warn(`[custodial-marketplace] skipped fee backfill for ${row.id}: seller amount <= 0`);
        continue;
      }
      update.run(
        split.feeBps,
        split.fee.toString(),
        split.royaltyBps,
        split.royalty.toString(),
        split.sellerAmount.toString(),
        row.id
      );
      insertEvent(row.id, 'fees_backfilled', {
        data: {
          feeBps: split.feeBps,
          feeUsdcUnits: split.fee.toString(),
          royaltyBps: split.royaltyBps,
          royaltyUsdcUnits: split.royalty.toString(),
          sellerAmountUsdcUnits: split.sellerAmount.toString(),
        },
      });
      changed += 1;
    }
  });
  tx();
  if (changed) console.log(`[custodial-marketplace] backfilled marketplace fees for ${changed} open order(s)`);
}

function clearReleasedReservationPaymentState() {
  const info = gameDb.db.prepare(`
    UPDATE custodial_marketplace_orders
       SET payment_chain = 'base',
           payment_token = 'usdc',
           payment_token_address = NULL,
           payment_decimals = 6,
           payment_label = 'USDC',
           payment_treasury = NULL,
           payment_amount_usdc_units = NULL,
           payment_nonce = NULL,
           payment_deadline = NULL,
           buyer_wallet = NULL,
           buyer_dest_chain = NULL,
           buyer_dest_address = NULL,
           error = NULL,
           updated_at = datetime('now')
     WHERE status = 'active'
       AND buyer_player_id IS NULL
       AND (
         payment_amount_usdc_units IS NOT NULL
         OR payment_deadline IS NOT NULL
         OR payment_treasury IS NOT NULL
       )
  `).run();
  if (info.changes) console.log(`[custodial-marketplace] cleared stale payment reservation state for ${info.changes} active order(s)`);
  return info.changes || 0;
}

function listEvents(orderId) {
  return gameDb.db.prepare(`
    SELECT event_type, actor_player_id, tx_hash, data_json, created_at
    FROM custodial_marketplace_events
    WHERE order_id = ?
    ORDER BY id ASC
  `).all(orderId).map((row) => ({
    type: row.event_type,
    actorPlayerId: row.actor_player_id,
    txHash: row.tx_hash,
    data: safeJsonParse(row.data_json, {}),
    createdAt: row.created_at,
  }));
}

function recoverExpiredReservationPaymentOrder(order, player, config) {
  if (!order || order.status !== 'active' || order.payment_tx_hash || order.delivery_tx_hash || order.payout_tx_hash) return null;
  const events = listEvents(order.id);
  const latestAction = [...events].reverse().find((event) => [
    'buy_intent',
    'reservation_released',
    'reservation_expired',
    'payment_verified',
    'delivered',
    'cancelled',
  ].includes(event.type));
  if (!['reservation_expired', 'reservation_released'].includes(latestAction?.type)) return null;
  const buyIntent = [...events].reverse().find((event) => event.type === 'buy_intent');
  if (!buyIntent || String(buyIntent.actorPlayerId || '') !== String(player?.id || '')) return null;
  const data = buyIntent.data || {};
  const paymentChain = normalizeChain(data.paymentChain || 'base', 'paymentChain');
  const payment = config?.payments?.[paymentChain];
  if (!payment?.ready) return null;
  const buyerWallet = normalizeAddressForChain(paymentChain, data.buyerWallet, 'Buyer wallet');
  const destChain = normalizeChain(data.destChain || paymentChain, 'destinationChain');
  const destAddress = normalizeAddressForChain(destChain, data.destAddress || buyerWallet, 'Destination wallet');
  const amount = String(data.amountTokenUnits || '').trim();
  if (!/^\d+$/.test(amount) || BigInt(amount) <= 0n) return null;
  return {
    order: {
      ...order,
      status: 'reserved',
      buyer_player_id: player.id,
      buyer_wallet: buyerWallet,
      buyer_dest_chain: destChain,
      buyer_dest_address: destAddress,
      payment_chain: paymentChain,
      payment_token: payment.token || data.paymentToken || 'usdc',
      payment_token_address: payment.tokenAddress || null,
      payment_decimals: Number(payment.decimals || 6),
      payment_label: payment.tokenLabel || data.paymentLabel || String(payment.token || 'USDC').toUpperCase(),
      payment_treasury: payment.treasury,
      payment_amount_usdc_units: amount,
      payment_deadline: Number(data.deadline || 0),
    },
    buyIntent,
  };
}

function latestBridgeBurnEvent(orderId, { sourceChain, destChain, destAddress } = {}) {
  const wantedSource = String(sourceChain || '').toLowerCase();
  const wantedDest = String(destChain || '').toLowerCase();
  const wantedAddress = String(destAddress || '').toLowerCase();
  return listEvents(orderId).reverse().find((event) => {
    if (event.type !== 'bridge_burned' || !event.txHash) return false;
    const data = event.data || {};
    if (wantedSource && String(data.sourceChain || '').toLowerCase() !== wantedSource) return false;
    if (wantedDest && String(data.destChain || '').toLowerCase() !== wantedDest) return false;
    if (wantedAddress && String(data.destAddress || '').toLowerCase() !== wantedAddress) return false;
    return true;
  }) || null;
}

function deliveryAssetFromBridge(row) {
  if (!row?.delivery_tx_hash) return null;
  const destChain = String(row.buyer_dest_chain || '').toLowerCase();
  const deliveryTxHash = String(row.delivery_tx_hash || '');
  try {
    const bridgeRow = gameDb.db.prepare(`
      SELECT dest_tx_or_asset
      FROM used_bridge_refs
      WHERE dest_chain = ?
        AND dest_tx_or_asset IS NOT NULL
        AND (dest_tx_or_asset = ? OR dest_tx_or_asset LIKE ?)
      ORDER BY created_at DESC
      LIMIT 1
    `).get(destChain, deliveryTxHash, `%@${deliveryTxHash}`);
    const raw = String(bridgeRow?.dest_tx_or_asset || '');
    if (!raw) return null;
    const [assetAddress, txHash] = raw.includes('@') ? raw.split('@') : [null, raw];
    return {
      chain: destChain,
      assetId: assetAddress || null,
      txHash: txHash || raw,
      raw,
    };
  } catch {
    return null;
  }
}

function publicOrder(row, { includePrivate = false } = {}) {
  if (!row) return null;
  const meta = safeJsonParse(row.metadata_json, {});
  const paymentDecimals = Number(row.payment_decimals || meta.paymentDecimals || 6);
  const buyerPlayerName = includePrivate ? playerNameById(row.buyer_player_id) : null;
  const deliveryAsset = deliveryAssetFromBridge(row);
  const rarityRow = gameDb.getNftRarity?.('demon_king', row.asset_chain, row.asset_id, { legacyLevel: row.level });
  const out = {
    id: row.id,
    status: row.status,
    sellerPlayerId: includePrivate ? row.seller_player_id : undefined,
    sellerWallet: row.seller_wallet,
    sellerPayoutChain: row.seller_payout_chain,
    sellerPayoutAddress: row.seller_payout_address,
    assetChain: row.asset_chain,
    assetId: row.asset_id,
    assetStandard: row.asset_standard,
    assetCollection: row.asset_collection,
    level: Number(row.level || 1),
    legacyLevel: Number(row.level || 1),
    rarity: rarityRow?.rarity || meta.rarity || (Number(row.level || 1) > 1 ? 'legendary' : null),
    rarityLabel: rarityRow?.rarityLabel || meta.rarityLabel || (Number(row.level || 1) > 1 ? 'Legendary' : 'Unrevealed'),
    priceUsdcUnits: row.price_usdc_units,
    priceUsdc: formatUnits(row.price_usdc_units, 6),
    feeBps: Number(row.fee_bps || 0),
    feeUsdcUnits: row.fee_usdc_units,
    feeUsdc: formatUnits(row.fee_usdc_units || '0', 6),
    royaltyBps: Number(row.royalty_bps || 0),
    royaltyUsdcUnits: row.royalty_usdc_units || '0',
    royaltyUsdc: formatUnits(row.royalty_usdc_units || '0', 6),
    sellerAmountUsdcUnits: row.seller_amount_usdc_units,
    sellerAmountUsdc: formatUnits(row.seller_amount_usdc_units, 6),
    paymentChain: row.payment_chain,
    paymentToken: row.payment_token,
    paymentTokenAddress: row.payment_token_address,
    paymentDecimals,
    paymentLabel: row.payment_label || 'USDC',
    paymentTreasury: row.payment_treasury,
    buyerPlayerId: includePrivate ? row.buyer_player_id : undefined,
    buyerPlayerName: buyerPlayerName || undefined,
    buyerWallet: includePrivate ? row.buyer_wallet : undefined,
    buyerDestChain: row.buyer_dest_chain,
    buyerDestAddress: row.buyer_dest_address,
    vaultChain: row.vault_chain,
    vaultAddress: row.vault_address,
    depositTxHash: row.deposit_tx_hash,
    depositVerifiedAt: row.deposit_verified_at,
    paymentTxHash: row.payment_tx_hash,
    paymentVerifiedAt: row.payment_verified_at,
    deliveryTxHash: row.delivery_tx_hash,
    deliveryAssetId: deliveryAsset?.assetId || (
      row.delivery_tx_hash && row.asset_chain === row.buyer_dest_chain ? row.asset_id : undefined
    ),
    deliveryAsset: deliveryAsset || undefined,
    deliveredAt: row.delivered_at,
    payoutTxHash: row.payout_tx_hash,
    paidOutAt: row.paid_out_at,
    error: includePrivate ? row.error : undefined,
    createdAt: row.created_at,
    updatedAt: row.updated_at,
    metadata: meta,
  };
  if (row.status === 'reserved') {
    out.reservation = {
      buyerPlayerId: includePrivate ? row.buyer_player_id : undefined,
      buyerPlayerName: buyerPlayerName || undefined,
      buyerWallet: includePrivate ? row.buyer_wallet : undefined,
      destChain: row.buyer_dest_chain,
      destAddress: includePrivate ? row.buyer_dest_address : undefined,
      deadline: row.payment_deadline,
      expiresInSeconds: row.payment_deadline ? Math.max(0, Number(row.payment_deadline) - nowSec()) : null,
    };
  }
  if (row.status === 'awaiting_deposit') {
    out.deposit = { chain: row.vault_chain, assetId: row.asset_id, vaultAddress: row.vault_address };
  }
  if (row.payment_amount_usdc_units) {
    out.payment = {
      chain: row.payment_chain,
      token: row.payment_token,
      tokenAddress: row.payment_token_address,
      treasury: row.payment_treasury,
      decimals: paymentDecimals,
      label: row.payment_label || 'USDC',
      amountTokenUnits: row.payment_amount_usdc_units,
      amountFormatted: formatUnits(row.payment_amount_usdc_units, paymentDecimals),
      deadline: row.payment_deadline,
      nonce: includePrivate ? row.payment_nonce : undefined,
    };
  }
  return out;
}

function solanaCustodyKeypair() {
  const raw = String(
    process.env.MARKETPLACE_SOLANA_CUSTODY_KEY
    || process.env.CUSTODIAL_MARKETPLACE_SOLANA_KEY
    || process.env.SOLANA_NFT_KEY
    || process.env.NFT_SOLANA_KEY
    || process.env.NFT_KEY
    || ''
  ).trim();
  if (!raw) return null;
  const { Keypair } = require('@solana/web3.js');
  return Keypair.fromSecretKey(parseSolanaSecretKey(raw));
}

function solanaCustodyAddress() {
  try { return solanaCustodyKeypair()?.publicKey?.toBase58?.() || null; } catch { return null; }
}

function configuredSolanaRevenueTreasury(ctx = {}) {
  const sol = ctx.gameShopSolanaConfig?.() || {};
  const solDeployment = deploymentOf('solana') || {};
  return firstEnv(
    'MARKETPLACE_SOLANA_USDC_TREASURY',
    'CUSTODIAL_MARKETPLACE_SOLANA_TREASURY',
    'GAME_SHOP_SOLANA_TREASURY',
    'NFT_SOLANA_TREASURY',
    'NFT_BRIDGE_SOLANA_TREASURY'
  )
    || sol.treasury
    || solDeployment.treasury
    || solDeployment.owner
    || null;
}

function solanaMarketplacePaymentTreasury(ctx = {}) {
  const explicitPaymentTreasury = firstEnv(
    'MARKETPLACE_SOLANA_PAYMENT_TREASURY',
    'CUSTODIAL_MARKETPLACE_SOLANA_PAYMENT_TREASURY'
  );
  if (explicitPaymentTreasury) return normalizeSolanaPubkey(explicitPaymentTreasury, 'Solana USDC payment treasury');

  const signerAddress = solanaCustodyAddress();
  if (signerAddress && envFlag('CUSTODIAL_MARKETPLACE_SOLANA_SIGNER_ESCROW', true)) {
    return signerAddress;
  }

  const revenueTreasury = configuredSolanaRevenueTreasury(ctx);
  return revenueTreasury ? normalizeSolanaPubkey(revenueTreasury, 'Solana USDC treasury') : null;
}

async function evmCustodyAddress(ctx) {
  const explicit = process.env.MARKETPLACE_EVM_NFT_VAULT || process.env.CUSTODIAL_MARKETPLACE_EVM_VAULT || null;
  const legacyTreasury = ctx.gameShopEvmConfig?.('base')?.treasury || null;
  let signerAddress = null;
  if (ctx.parseNftEvmAccount) {
    try {
      const account = await ctx.parseNftEvmAccount();
      signerAddress = normalizeEvmAddress(account.address, 'EVM NFT vault');
    } catch {
      signerAddress = null;
    }
  }
  if (explicit) {
    const address = normalizeEvmAddress(explicit, 'EVM NFT vault');
    const canAutoSign = !!signerAddress && address === signerAddress;
    return { address, canAutoSign, externalVault: !canAutoSign };
  }
  if (signerAddress) return { address: signerAddress, canAutoSign: true, externalVault: false };
  if (legacyTreasury) {
    return {
      address: normalizeEvmAddress(legacyTreasury, 'EVM legacy shop treasury vault'),
      canAutoSign: false,
      externalVault: true,
      legacyTreasuryVault: true,
    };
  }
  return { address: null, canAutoSign: false, externalVault: false };
}

function isVaultUsable(vault, allowExternalVault) {
  if (!vault?.address) return false;
  return !!vault.autoDeliveryReady || !!allowExternalVault || !!vault.legacyTreasuryVault;
}

function solanaVault(ctx = {}) {
  let signerPubkey = null;
  try { signerPubkey = solanaCustodyKeypair()?.publicKey?.toBase58?.() || null; } catch {}
  const explicit = process.env.MARKETPLACE_SOLANA_NFT_VAULT || process.env.CUSTODIAL_MARKETPLACE_SOLANA_VAULT || null;
  const solanaDeployment = deploymentOf('solana') || {};
  const legacyTreasury = ctx.gameShopSolanaConfig?.()?.treasury
    || firstEnv('NFT_SOLANA_TREASURY', 'NFT_BRIDGE_SOLANA_TREASURY')
    || solanaDeployment.treasury
    || solanaDeployment.owner
    || null;
  const addressRaw = explicit || signerPubkey || legacyTreasury || null;
  if (!addressRaw) return { address: null, canAutoSign: false, externalVault: false };
  const address = normalizeSolanaPubkey(addressRaw, 'Solana NFT vault');
  const canAutoSign = !!signerPubkey && address === signerPubkey;
  return { address, canAutoSign, externalVault: !!address && !canAutoSign, legacyTreasuryVault: !explicit && !signerPubkey && !!legacyTreasury };
}

function aptosVault(ctx = {}) {
  const explicit = process.env.MARKETPLACE_APTOS_NFT_VAULT || process.env.CUSTODIAL_MARKETPLACE_APTOS_VAULT || null;
  const acc = aptosAccount();
  const signerAddress = acc?.accountAddress?.toString?.() ? normalizeAptosWallet(acc.accountAddress.toString(), 'Aptos signer') : null;
  const aptosDeployment = deploymentOf('aptos') || {};
  const legacyTreasury = ctx.gameShopAptosConfig?.()?.treasury
    || firstEnv('NFT_APTOS_TREASURY', 'NFT_BRIDGE_APTOS_TREASURY')
    || aptosDeployment.treasury
    || aptosDeployment.admin
    || null;
  const addressRaw = explicit || signerAddress || legacyTreasury || null;
  if (!addressRaw) return { address: null, canAutoSign: false, externalVault: false };
  const address = normalizeAptosWallet(addressRaw, 'Aptos NFT vault');
  const canAutoSign = !!signerAddress && address === signerAddress;
  return { address, canAutoSign, externalVault: !!address && !canAutoSign, legacyTreasuryVault: !explicit && !signerAddress && !!legacyTreasury };
}

async function vaultsConfig(ctx) {
  const evm = await evmCustodyAddress(ctx);
  return {
    base: { chain: 'base', address: evm.address, autoDeliveryReady: evm.canAutoSign, externalVault: evm.externalVault, legacyTreasuryVault: evm.legacyTreasuryVault },
    arbitrum: { chain: 'arbitrum', address: evm.address, autoDeliveryReady: evm.canAutoSign, externalVault: evm.externalVault, legacyTreasuryVault: evm.legacyTreasuryVault },
    monad: { chain: 'monad', address: evm.address, autoDeliveryReady: evm.canAutoSign, externalVault: evm.externalVault, legacyTreasuryVault: evm.legacyTreasuryVault },
    ink: { chain: 'ink', address: evm.address, autoDeliveryReady: evm.canAutoSign, externalVault: evm.externalVault, legacyTreasuryVault: evm.legacyTreasuryVault },
    solana: (() => {
      try {
        const v = solanaVault(ctx);
        return { chain: 'solana', address: v.address, autoDeliveryReady: v.canAutoSign, externalVault: v.externalVault, legacyTreasuryVault: v.legacyTreasuryVault };
      } catch {
        return { chain: 'solana', address: null, autoDeliveryReady: false, externalVault: false };
      }
    })(),
    aptos: (() => {
      try {
        const v = aptosVault(ctx);
        return { chain: 'aptos', address: v.address, autoDeliveryReady: v.canAutoSign, externalVault: v.externalVault, legacyTreasuryVault: v.legacyTreasuryVault };
      } catch {
        return { chain: 'aptos', address: null, autoDeliveryReady: false, externalVault: false };
      }
    })(),
  };
}

function solanaCustodySignerReady() {
  try { return !!solanaCustodyKeypair(); } catch { return false; }
}

function solanaBridgeMintReady() {
  const dep = deploymentOf('solana') || {};
  const hasRpc = solanaRpcUrls([dep.rpcUrl]).length > 0;
  const hasSigner = solanaCustodySignerReady();
  const mintStandard = String(process.env.NFT_SOLANA_MINT_STANDARD || 'mpl-core').toLowerCase();
  if (mintStandard === 'mpl-core' || mintStandard === 'core') {
    return hasRpc && hasSigner && !!dep.collection && !!dep.candyMachine;
  }
  return hasRpc && hasSigner;
}

async function destinationDeliveryReadiness(ctx) {
  const evm = await evmCustodyAddress(ctx);
  const evmReady = (chain) => !!evm.canAutoSign && !!evmRpcUrl(chain) && !!deploymentOf(chain)?.proxy;
  return {
    base: evmReady('base'),
    arbitrum: evmReady('arbitrum'),
    monad: evmReady('monad'),
    ink: evmReady('ink'),
    aptos: !!aptosVault(ctx).canAutoSign && !!deploymentOf('aptos')?.module,
    solana: solanaBridgeMintReady(),
  };
}

async function assertDestinationDeliveryReady(destChain, ctx) {
  const readiness = await destinationDeliveryReadiness(ctx);
  if (!readiness[destChain]) {
    throw httpError(503, `${shortLabel(destChain)} NFT delivery is not configured`);
  }
}

function evmRpcUrl(chain) {
  const meta = EVM_CHAIN_META[chain];
  if (!meta) return null;
  for (const key of meta.rpcEnv) {
    if (process.env[key]) return process.env[key];
  }
  return meta.rpcDefault;
}

function paymentConfigs(ctx) {
  const payments = {};
  for (const chain of ['base', 'arbitrum', 'monad', 'ink']) {
    const shop = ctx.gameShopEvmConfig?.(chain) || {};
    const usdcSpec = (shop.payments || []).find((p) => p.id === 'usdc') || {};
    const fallbackToken = chain === 'base'
      ? BASE_USDC_TOKEN
      : chain === 'ink'
        ? INK_USDC_TOKEN
        : (usdcSpec.token || shop.usdcMint);
    const envChain = chain.toUpperCase();
    const shortChain = chain === 'arbitrum' ? 'ARB' : envChain;
    const treasury = firstEnv(
      `MARKETPLACE_${envChain}_USDC_TREASURY`,
      `MARKETPLACE_${shortChain}_USDC_TREASURY`,
      `CUSTODIAL_MARKETPLACE_${envChain}_TREASURY`,
      `CUSTODIAL_MARKETPLACE_${shortChain}_TREASURY`,
      `GAME_SHOP_${envChain}_TREASURY`,
      `GAME_SHOP_${shortChain}_TREASURY`,
      `NFT_${envChain}_ROYALTY_RECEIVER`,
      `NFT_${shortChain}_ROYALTY_RECEIVER`,
      'GAME_SHOP_EVM_TREASURY',
      'GAME_SHOP_TREASURY',
      'NFT_ROYALTY_RECEIVER'
    )
      || shop.treasury
      || null;
    payments[chain] = {
      chain,
      chainId: EVM_CHAIN_META[chain].chainId,
      label: EVM_CHAIN_META[chain].label,
      token: 'usdc',
      tokenLabel: 'USDC',
      tokenAddress: fallbackToken ? normalizeEvmAddress(fallbackToken, `${chain} USDC token`) : null,
      decimals: Number(usdcSpec.decimals || shop.usdcDecimals || (chain === 'monad' ? 18 : 6)),
      treasury: treasury ? normalizeEvmAddress(treasury, `${chain} USDC treasury`) : null,
      explorer: shop.explorer || null,
      rpcUrl: evmRpcUrl(chain),
      ready: !!treasury && !!fallbackToken,
    };
  }
  const sol = ctx.gameShopSolanaConfig?.() || {};
  const solanaPaymentTreasury = solanaMarketplacePaymentTreasury(ctx);
  const solanaRevenueTreasuryRaw = configuredSolanaRevenueTreasury(ctx);
  const solanaRevenueTreasury = solanaRevenueTreasuryRaw
    ? normalizeSolanaPubkey(solanaRevenueTreasuryRaw, 'Solana marketplace revenue treasury')
    : null;
  const solanaUsdcMint = process.env.MARKETPLACE_SOLANA_USDC_MINT || sol.usdcMint || SOLANA_USDC_MINT;
  payments.solana = {
    chain: 'solana',
    label: 'Solana',
    token: 'usdc',
    tokenLabel: 'USDC',
    tokenAddress: normalizeSolanaPubkey(solanaUsdcMint, 'Solana USDC mint'),
    decimals: 6,
    treasury: solanaPaymentTreasury,
    revenueTreasury: solanaRevenueTreasury,
    rpcUrl: null,
    ready: !!solanaPaymentTreasury,
  };
  const apt = ctx.gameShopAptosConfig?.() || {};
  const aptDeployment = deploymentOf('aptos') || {};
  const aptosTreasury = firstEnv(
    'MARKETPLACE_APTOS_USDC_TREASURY',
    'CUSTODIAL_MARKETPLACE_APTOS_TREASURY',
    'GAME_SHOP_APTOS_TREASURY',
    'NFT_APTOS_TREASURY',
    'NFT_BRIDGE_APTOS_TREASURY'
  )
    || apt.treasury
    || aptDeployment.treasury
    || aptDeployment.admin
    || null;
  payments.aptos = {
    chain: 'aptos',
    label: 'Aptos',
    token: 'usdc',
    tokenLabel: 'USDC',
    tokenAddress: normalizeAptosWallet(process.env.MARKETPLACE_APTOS_USDC || apt.usdcAddress || aptDeployment.usdcMetadata || APTOS_USDC_METADATA, 'Aptos USDC metadata'),
    decimals: 6,
    treasury: aptosTreasury ? normalizeAptosWallet(aptosTreasury, 'Aptos USDC treasury') : null,
    ready: !!aptosTreasury,
  };
  return payments;
}

async function marketplaceRuntimeConfig(ctx) {
  const vaults = await vaultsConfig(ctx);
  const payments = paymentConfigs(ctx);
  const deliveryReady = await destinationDeliveryReadiness(ctx);
  const feeBps = marketplaceFeeBps();
  const royaltyBps = marketplaceRoyaltyBps();
  const allowExternalVault = process.env.CUSTODIAL_MARKETPLACE_ALLOW_EXTERNAL_VAULT === '1';
  const supportedChains = ALL_CHAINS.filter((chain) => isVaultUsable(vaults[chain], allowExternalVault));
  const supportedPaymentChains = ALL_CHAINS.filter((chain) => payments[chain]?.ready);
  const supportedDestinationChains = ALL_CHAINS.filter((chain) => deliveryReady[chain]);
  return {
    enabled: process.env.CUSTODIAL_MARKETPLACE_ENABLED !== '0',
    feeBps,
    royaltyBps,
    supportedAssets: supportedChains,
    supportedPaymentChains,
    supportedDestinationChains,
    vaults,
    deliveryReady,
    payments,
    vault: vaults.solana,
    payment: payments.base,
    autoPayoutEnabled: envFlag(
      'CUSTODIAL_MARKETPLACE_AUTO_PAYOUT_USDC',
      envFlag('CUSTODIAL_MARKETPLACE_AUTO_PAYOUT_SOLANA_USDC', true)
    )
      && envFlag('CUSTODIAL_MARKETPLACE_AUTO_PAYOUT', true),
    crossChainAutoRelay: process.env.CUSTODIAL_MARKETPLACE_AUTO_BRIDGE !== '0',
    allowExternalVault,
    ready: supportedChains.length > 0 && supportedPaymentChains.length > 0,
  };
}

async function rpcCall(rpcUrl, method, params) {
  const response = await fetch(rpcUrl, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ jsonrpc: '2.0', id: 1, method, params }),
  });
  const body = await response.json().catch(() => ({}));
  if (!response.ok || body.error) throw httpError(502, body?.error?.message || `RPC ${method} failed`);
  return body.result;
}

async function evmClients(chain, ctx) {
  const { createPublicClient, createWalletClient, defineChain, http } = await import('viem');
  const viemChains = await import('viem/chains');
  const monad = defineChain({
    id: 143,
    name: 'Monad',
    nativeCurrency: { name: 'Monad', symbol: 'MON', decimals: 18 },
    rpcUrls: { default: { http: ['https://rpc.monad.xyz'] } },
  });
  const ink = defineChain({
    id: 57073,
    name: 'Ink',
    nativeCurrency: { name: 'ETH', symbol: 'ETH', decimals: 18 },
    rpcUrls: { default: { http: ['https://rpc-gel.inkonchain.com'] } },
    blockExplorers: { default: { name: 'Ink Explorer', url: 'https://explorer.inkonchain.com' } },
  });
  const chainObj = { base: viemChains.base, arbitrum: viemChains.arbitrum, monad, ink }[chain];
  const rpc = evmRpcUrl(chain);
  const publicClient = createPublicClient({ chain: chainObj, transport: http(rpc) });
  const account = ctx?.parseNftEvmAccount ? await ctx.parseNftEvmAccount() : null;
  const walletClient = account ? createWalletClient({ account, chain: chainObj, transport: http(rpc) }) : null;
  return { publicClient, walletClient, account };
}

async function verifyEvmAsset(chain, assetId, expectedOwner) {
  const { getAddress } = await import('viem');
  const dep = deploymentOf(chain);
  if (!dep?.proxy) throw httpError(503, `${shortLabel(chain)} NFT contract is not configured`);
  const { publicClient } = await evmClients(chain);
  const contract = getAddress(dep.proxy);
  const tokenId = BigInt(String(assetId));
  const owner = getAddress(await publicClient.readContract({
    address: contract, abi: ERC721_ABI, functionName: 'ownerOf', args: [tokenId],
  }));
  const wanted = getAddress(expectedOwner);
  if (owner !== wanted) throw httpError(403, `${shortLabel(chain)} wallet is not the NFT owner`);
  let level = null;
  try {
    level = Number(await publicClient.readContract({ address: contract, abi: ERC721_ABI, functionName: 'tokenLevel', args: [tokenId] })) || 1;
  } catch {
    try {
      level = Number(await publicClient.readContract({ address: contract, abi: ERC721_ABI, functionName: 'getLevel', args: [tokenId] })) || 1;
    } catch {}
  }
  if (!Number.isFinite(level)) {
    throw httpError(409, `${shortLabel(chain)} NFT contract does not expose a supported level reader`);
  }
  return { chain, standard: 'erc721-v3', asset: String(tokenId), owner: owner.toLowerCase(), collection: contract, level };
}

function evmTopicAddress(topic, label = 'EVM topic address') {
  const raw = String(topic || '').toLowerCase();
  if (!/^0x[0-9a-f]{64}$/.test(raw)) throw httpError(400, `${label} is malformed`);
  return `0x${raw.slice(-40)}`;
}

function evmTopicUint(topic, label = 'EVM topic uint') {
  const raw = String(topic || '');
  if (!/^0x[0-9a-fA-F]{64}$/.test(raw)) throw httpError(400, `${label} is malformed`);
  return BigInt(raw);
}

async function verifyEvmNftDepositTx(order, txHash) {
  if (!order || !isEvmChain(order.asset_chain)) throw httpError(400, 'EVM deposit order required');
  if (!/^0x[0-9a-fA-F]{64}$/.test(String(txHash || ''))) throw httpError(400, 'Bad deposit transaction hash');
  const receipt = await rpcCall(evmRpcUrl(order.asset_chain), 'eth_getTransactionReceipt', [txHash]);
  if (!receipt) throw httpError(400, 'Deposit tx not found or not confirmed yet');
  if (receipt.status !== '0x1') throw httpError(400, 'Deposit tx failed on-chain');

  const dep = deploymentOf(order.asset_chain);
  const contract = normalizeEvmAddress(order.asset_collection || dep?.proxy, 'NFT contract');
  const seller = normalizeEvmAddress(order.seller_wallet, 'Seller wallet');
  const vault = normalizeEvmAddress(order.vault_address, 'Vault wallet');
  const tokenId = BigInt(String(order.asset_id));
  let matchingWrongDirection = null;

  for (const log of receipt.logs || []) {
    if (String(log.address || '').toLowerCase() !== contract) continue;
    if (String(log.topics?.[0] || '').toLowerCase() !== TRANSFER_TOPIC) continue;
    if (!log.topics?.[1] || !log.topics?.[2] || !log.topics?.[3]) continue;
    const from = evmTopicAddress(log.topics[1], 'Transfer from');
    const to = evmTopicAddress(log.topics[2], 'Transfer to');
    const movedTokenId = evmTopicUint(log.topics[3], 'Transfer tokenId');
    if (movedTokenId !== tokenId) continue;
    if (from === seller && to === vault) {
      return { receipt, transfer: { from, to, tokenId: tokenId.toString(), blockNumber: receipt.blockNumber } };
    }
    matchingWrongDirection = { from, to, tokenId: tokenId.toString() };
  }

  if (matchingWrongDirection) {
    throw httpError(403, `${shortLabel(order.asset_chain)} NFT transfer did not move this token from seller to custody vault`);
  }
  throw httpError(400, `${shortLabel(order.asset_chain)} NFT transfer to custody vault not found in tx`);
}

async function aptosFetchTx(txHash) {
  const apiKey = process.env.APTOS_NODE_API_KEY || process.env.DECIBEL_API_KEY;
  const headers = apiKey ? { Authorization: `Bearer ${apiKey}` } : {};
  const r = await fetch(`${aptosFullnodeBase()}/v1/transactions/by_hash/${txHash}`, { headers });
  if (!r.ok) return null;
  return r.json().catch(() => null);
}

async function verifyAptosAsset(assetId, expectedOwner) {
  const dep = deploymentOf('aptos');
  if (!dep?.collection) throw httpError(503, 'Aptos NFT collection is not configured');
  const tokenAddress = normalizeAptosWallet(assetId, 'Aptos token address');
  const owner = normalizeAptosWallet(expectedOwner, 'Aptos owner');
  const indexerUrl = process.env.APTOS_INDEXER_URL || 'https://indexer.mainnet.aptoslabs.com/v1/graphql';
  const query = `query Q($owner:String!, $token:String!) {
    current_token_ownerships_v2(
      where: {owner_address:{_eq:$owner}, token_data_id:{_eq:$token}, amount:{_gt:0}}
      limit: 1
    ) {
      token_data_id
      current_token_data { collection_id token_name token_properties }
    }
  }`;
  const headers = { 'content-type': 'application/json' };
  if (process.env.APTOS_NODE_API_KEY) headers.Authorization = `Bearer ${process.env.APTOS_NODE_API_KEY}`;
  const response = await fetch(indexerUrl, {
    method: 'POST',
    headers,
    body: JSON.stringify({ query, variables: { owner, token: tokenAddress } }),
  });
  const json = await response.json().catch(() => ({}));
  if (!response.ok || json?.errors?.length) {
    throw httpError(502, json?.errors?.[0]?.message || `Aptos indexer ${response.status}`);
  }
  const row = json?.data?.current_token_ownerships_v2?.[0];
  if (!row) throw httpError(403, 'Aptos wallet is not the NFT owner');
  const collection = normalizeAptosWallet(row.current_token_data?.collection_id || dep.collection, 'Aptos collection');
  if (dep.collection && collection !== normalizeAptosWallet(dep.collection, 'Aptos collection')) {
    throw httpError(400, 'Aptos token is not in the Demon King collection');
  }
  const props = safeJsonParse(row.current_token_data?.token_properties, row.current_token_data?.token_properties || {});
  const level = Number(props?.level || props?.Level || 1) || 1;
  return { chain: 'aptos', standard: 'aptos-token-v2', asset: tokenAddress, owner, collection, level };
}

async function verifyAssetOwner(chain, assetId, expectedOwner) {
  if (isEvmChain(chain)) return verifyEvmAsset(chain, assetId, expectedOwner);
  if (chain === 'solana') return getSolanaBridgeAssetInfo(assetId, expectedOwner);
  if (chain === 'aptos') return verifyAptosAsset(assetId, expectedOwner);
  throw httpError(400, `Unsupported asset chain ${chain}`);
}

async function verifyEvmTokenPayment({ payment, txHash, amount, expectedFrom = null }) {
  if (!/^0x[0-9a-fA-F]{64}$/.test(String(txHash || ''))) throw httpError(400, 'Bad transaction hash');
  const receipt = await rpcCall(payment.rpcUrl, 'eth_getTransactionReceipt', [txHash]);
  if (!receipt) throw httpError(400, 'Tx not found or not confirmed yet');
  if (receipt.status !== '0x1') throw httpError(400, 'Tx failed on-chain');
  const label = String(payment.label || payment.token || 'token').toUpperCase();
  const token = normalizeEvmAddress(payment.tokenAddress, `${label} token`);
  const toWanted = normalizeEvmAddress(payment.treasury, `${label} treasury`);
  const fromWanted = expectedFrom ? normalizeEvmAddress(expectedFrom, 'Buyer wallet') : null;
  let best = null;
  for (const log of receipt.logs || []) {
    if (String(log.address || '').toLowerCase() !== token) continue;
    if (String(log.topics?.[0] || '').toLowerCase() !== TRANSFER_TOPIC) continue;
    const from = `0x${String(log.topics?.[1] || '').slice(-40).toLowerCase()}`;
    const to = `0x${String(log.topics?.[2] || '').slice(-40).toLowerCase()}`;
    if (to !== toWanted) continue;
    if (fromWanted && from !== fromWanted) continue;
    const value = BigInt(log.data || '0x0');
    if (value < BigInt(amount)) continue;
    best = { from, to, value: value.toString(), blockNumber: receipt.blockNumber };
    break;
  }
  if (!best) throw httpError(400, `${label} transfer to treasury not found or under-paid`);
  return { receipt, transfer: best };
}

async function verifySolanaTokenPayment({ payment, txHash, amount, expectedFrom = null }) {
  const { PublicKey } = require('@solana/web3.js');
  const { ASSOCIATED_TOKEN_PROGRAM_ID, TOKEN_PROGRAM_ID, getAssociatedTokenAddressSync } = require('@solana/spl-token');
  const label = String(payment.label || payment.token || 'token').toUpperCase();
  const sig = String(txHash || '').trim();
  if (!/^[1-9A-HJ-NP-Za-km-z]{64,100}$/.test(sig)) throw httpError(400, 'Bad Solana transaction signature');
  const parsed = await withSolanaRpcFallback(async (rpc) => {
    const { Connection } = require('@solana/web3.js');
    const conn = createSolanaConnection(Connection, rpc, 'confirmed');
    return conn.getParsedTransaction(sig, { commitment: 'confirmed', maxSupportedTransactionVersion: 0 });
  }, {
    urls: solanaRpcUrls([payment.rpcUrl]),
    label: 'Custodial marketplace Solana payment verification',
  });
  if (!parsed) throw httpError(400, 'Tx not found or not confirmed yet');
  if (parsed.meta?.err) throw httpError(400, 'Tx failed on-chain');
  const mint = new PublicKey(payment.tokenAddress);
  const treasury = new PublicKey(payment.treasury);
  const treasuryAta = getAssociatedTokenAddressSync(mint, treasury, false, TOKEN_PROGRAM_ID, ASSOCIATED_TOKEN_PROGRAM_ID).toBase58();
  const expectedAuthority = expectedFrom ? normalizeSolanaPubkey(expectedFrom, 'Buyer Solana wallet') : null;
  const allIxs = [
    ...(parsed.transaction?.message?.instructions || []),
    ...(parsed.meta?.innerInstructions || []).flatMap((row) => row.instructions || []),
  ];
  let best = null;
  for (const ix of allIxs) {
    const info = ix?.parsed?.info || null;
    const type = String(ix?.parsed?.type || '').toLowerCase();
    if (!info || !['transfer', 'transferchecked', 'transfer_checked'].includes(type)) continue;
    const destination = String(info.destination || '');
    if (destination !== treasuryAta) continue;
    if (info.mint && String(info.mint) !== mint.toBase58()) continue;
    const authority = String(info.authority || info.multisigAuthority || '');
    if (expectedAuthority && authority && authority !== expectedAuthority) continue;
    const value = BigInt(info.tokenAmount?.amount || info.amount || '0');
    if (value < BigInt(amount)) continue;
    best = { from: authority || expectedAuthority || '', to: treasuryAta, value: value.toString() };
    break;
  }
  if (!best) throw httpError(400, `Solana ${label} transfer to treasury not found or under-paid`);
  return { receipt: parsed, transfer: best };
}

async function verifyAptosTokenPayment({ payment, txHash, amount, expectedFrom = null }) {
  if (!/^0x[0-9a-fA-F]{64}$/.test(String(txHash || ''))) throw httpError(400, 'Bad Aptos tx hash');
  const tx = await aptosFetchTx(txHash);
  if (!tx) throw httpError(400, 'Tx not found or not confirmed');
  if (tx.success !== true) throw httpError(400, 'Tx failed on-chain');
  if (expectedFrom && normalizeAptosWallet(tx.sender, 'Aptos tx sender') !== normalizeAptosWallet(expectedFrom, 'Buyer Aptos wallet')) {
    throw httpError(403, 'Aptos tx sender mismatch');
  }
  const label = String(payment.label || payment.token || 'token').toUpperCase();
  const expectedAsset = normalizeAptosWallet(payment.tokenAddress, `Aptos ${label} metadata`);
  const expectedTreasury = normalizeAptosWallet(payment.treasury, `Aptos ${label} treasury`);
  const expectedPrimaryStore = require('./bridge_helpers').aptosPrimaryFungibleStoreAddress(expectedTreasury, expectedAsset);
  let creditedAmount = 0n;
  for (const ev of tx.events || []) {
    const t = String(ev.type || '');
    const data = ev.data || {};
    if (t === '0x1::fungible_asset::Deposit' || t.endsWith('::fungible_asset::Deposit')) {
      const store = normalizeAptosAddress(data.store || '');
      const owner = normalizeAptosAddress(data.owner || data.account || '');
      const metadata = normalizeAptosAddress(data.metadata || data.store_metadata || '');
      const value = BigInt(data.amount || 0);
      if ((expectedPrimaryStore && store === expectedPrimaryStore) || (owner === expectedTreasury && metadata === expectedAsset)) {
        creditedAmount += value;
      }
    }
  }
  if (creditedAmount === 0n) {
    const payload = tx.payload || {};
    const fn = String(payload.function || '');
    const args = Array.isArray(payload.arguments) ? payload.arguments : [];
    if (fn === '0x1::primary_fungible_store::transfer' || fn === '0x1::aptos_account::transfer_fungible_assets') {
      const [a0, a1] = args.map((v) => normalizeAptosAddress(v || ''));
      if ((a0 === expectedAsset && a1 === expectedTreasury) || (a1 === expectedAsset && a0 === expectedTreasury)) {
        creditedAmount = BigInt(args[2] || 0);
      }
    }
  }
  if (creditedAmount < BigInt(amount)) throw httpError(400, `Aptos ${label} transfer to treasury not found or under-paid`);
  return { receipt: tx, transfer: { from: tx.sender, to: expectedTreasury, value: creditedAmount.toString() } };
}

async function verifyPayment({ payment, txHash, amount, expectedFrom = null }) {
  if (isEvmChain(payment.chain)) return verifyEvmTokenPayment({ payment, txHash, amount, expectedFrom });
  if (payment.chain === 'solana') return verifySolanaTokenPayment({ payment, txHash, amount, expectedFrom });
  if (payment.chain === 'aptos') return verifyAptosTokenPayment({ payment, txHash, amount, expectedFrom });
  throw httpError(400, `Unsupported payment chain ${payment.chain}`);
}

async function sendAndConfirmFresh(connection, transaction, signers, label) {
  const latest = await connection.getLatestBlockhash('confirmed');
  transaction.recentBlockhash = latest.blockhash;
  transaction.feePayer = signers[0].publicKey;
  transaction.sign(...signers);
  const signature = await connection.sendRawTransaction(transaction.serialize(), {
    skipPreflight: false,
    preflightCommitment: 'confirmed',
    maxRetries: 5,
  });
  let confirmed;
  try {
    confirmed = await connection.confirmTransaction({
      signature,
      blockhash: latest.blockhash,
      lastValidBlockHeight: latest.lastValidBlockHeight,
    }, 'confirmed');
  } catch (err) {
    if (await waitForSolanaSignature(signature, label)) return signature;
    throw err;
  }
  if (confirmed.value?.err) throw new Error(`${label || 'Solana transaction'} failed: ${JSON.stringify(confirmed.value.err)}`);
  return signature;
}

function extractSolanaSignatureFromError(err) {
  const direct = String(err?.signature || '');
  if (/^[1-9A-HJ-NP-Za-km-z]{40,100}$/.test(direct)) return direct;
  const msg = String(err?.message || err || '');
  const match = msg.match(/Signature\s+([1-9A-HJ-NP-Za-km-z]{40,100})/i)
    || msg.match(/\b([1-9A-HJ-NP-Za-km-z]{64,100})\b/);
  return match ? match[1] : '';
}

async function waitForSolanaSignature(signature, label) {
  if (!signature) return false;
  return withSolanaRpcFallback(async (rpc) => {
    const { Connection } = require('@solana/web3.js');
    const conn = createSolanaConnection(Connection, rpc, 'confirmed');
    for (let i = 0; i < 20; i += 1) {
      if (i > 0) await new Promise((resolve) => setTimeout(resolve, 1500));
      const status = await conn.getSignatureStatuses([signature], { searchTransactionHistory: true }).catch(() => null);
      const value = status?.value?.[0];
      if (value?.err) throw new Error(`${label || 'Solana transaction'} failed: ${JSON.stringify(value.err)}`);
      if (value && ['confirmed', 'finalized'].includes(value.confirmationStatus)) return true;
    }
    return false;
  }, { label: `${label || 'Solana transaction'} signature lookup` }).catch(() => false);
}

async function sendUmiBuilder(builder, umi, label) {
  const { base58 } = await import('@metaplex-foundation/umi/serializers');
  try {
    const result = await builder.sendAndConfirm(umi, {
      send: { skipPreflight: true, commitment: 'processed', maxRetries: 5 },
      confirm: { commitment: 'confirmed', strategy: { type: 'blockhash' } },
    });
    return base58.deserialize(result.signature)[0];
  } catch (err) {
    const signature = extractSolanaSignatureFromError(err);
    if (signature && await waitForSolanaSignature(signature, label)) return signature;
    throw err;
  }
}

async function withSolanaCoreUmi(label, fn) {
  const signer = solanaCustodyKeypair();
  if (!signer) throw httpError(503, 'Solana custody signer is not configured');
  const dep = deploymentOf('solana');
  const configuredRpcUrls = solanaRpcUrls([dep?.rpcUrl]);
  const coreRpcUrls = solanaNonHeliusRpcUrls(configuredRpcUrls);
  return withSolanaRpcFallback(async (rpc) => {
    const { createUmi } = await import('@metaplex-foundation/umi-bundle-defaults');
    const { keypairIdentity } = await import('@metaplex-foundation/umi');
    const { mplCore } = await import('@metaplex-foundation/mpl-core');
    const umi = createUmi(rpc).use(mplCore());
    const umiKeypair = umi.eddsa.createKeypairFromSecretKey(signer.secretKey);
    umi.use(keypairIdentity(umiKeypair));
    return fn({ umi, signer, dep });
  }, {
    urls: coreRpcUrls.length ? coreRpcUrls : configuredRpcUrls,
    label,
  });
}

function solanaCoreCollectionFromAsset(asset) {
  const publicKeyString = (value) => {
    if (!value) return '';
    if (typeof value === 'string') return value;
    if (typeof value.toBase58 === 'function') return value.toBase58();
    if (typeof value.toString === 'function' && value.toString !== Object.prototype.toString) return value.toString();
    return '';
  };
  const grouping = Array.isArray(asset?.grouping) ? asset.grouping : [];
  const group = grouping.find((row) => String(row?.group_key || row?.key || '').toLowerCase() === 'collection');
  const groupValue = publicKeyString(group?.group_value || group?.value);
  if (/^[1-9A-HJ-NP-Za-km-z]{32,44}$/.test(groupValue)) return groupValue;
  const updateAuthority = asset?.updateAuthority;
  if (updateAuthority?.type === 'Collection') return publicKeyString(updateAuthority.address);
  if (updateAuthority?.__kind === 'Collection') {
    const fromFields = Array.isArray(updateAuthority.fields)
      ? updateAuthority.fields[0]
      : updateAuthority.fields;
    return publicKeyString(fromFields?.address || fromFields?.publicKey || fromFields);
  }
  const candidates = [
    asset?.collection?.publicKey,
    asset?.collection?.address,
    asset?.collection,
    asset?.collectionAddress,
  ];
  for (const candidate of candidates) {
    const value = publicKeyString(candidate);
    if (/^[1-9A-HJ-NP-Za-km-z]{32,44}$/.test(value)) return value;
  }
  return '';
}

async function fetchSolanaCoreAssetAndCollection(umi, assetId) {
  const { publicKey } = await import('@metaplex-foundation/umi');
  const { fetchAsset, fetchCollection } = await import('@metaplex-foundation/mpl-core');
  const asset = await fetchAsset(umi, publicKey(assetId));
  const collectionAddress = solanaCoreCollectionFromAsset(asset);
  const collection = collectionAddress
    ? await fetchCollection(umi, publicKey(collectionAddress)).catch((err) => {
      throw httpError(502, `Solana Core collection ${collectionAddress} could not be loaded: ${err?.message || err}`);
    })
    : null;
  return { asset, collection };
}

async function transferEvmNft({ chain, tokenId, to, ctx }) {
  const { getAddress } = await import('viem');
  const dep = deploymentOf(chain);
  if (!dep?.proxy) throw httpError(503, `${shortLabel(chain)} NFT contract is not configured`);
  const { publicClient, walletClient, account } = await evmClients(chain, ctx);
  if (!walletClient || !account) throw httpError(503, 'EVM custody signer is not configured');
  const hash = await walletClient.writeContract({
    address: getAddress(dep.proxy),
    abi: ERC721_ABI,
    functionName: 'safeTransferFrom',
    args: [getAddress(account.address), getAddress(to), BigInt(tokenId)],
  });
  await publicClient.waitForTransactionReceipt({ hash, confirmations: 2 });
  return hash;
}

async function transferSolanaToken2022Nft({ mint, to }) {
  const signer = solanaCustodyKeypair();
  if (!signer) throw httpError(503, 'Solana custody signer is not configured');
  const from = signer.publicKey.toBase58();
  const info = await getSolanaBridgeAssetInfo(mint, from);
  if (info.standard !== 'token2022') throw httpError(409, 'Automatic Solana delivery supports Token-2022 Demon King NFTs only');
  const { Connection, PublicKey, Transaction } = require('@solana/web3.js');
  const {
    ASSOCIATED_TOKEN_PROGRAM_ID,
    TOKEN_2022_PROGRAM_ID,
    createAssociatedTokenAccountIdempotentInstruction,
    createTransferCheckedInstruction,
    getAssociatedTokenAddressSync,
  } = require('@solana/spl-token');
  const mintPk = new PublicKey(mint);
  const destOwner = new PublicKey(normalizeSolanaPubkey(to, 'Destination Solana wallet'));
  const srcAta = new PublicKey(info.tokenAccount);
  const destAta = getAssociatedTokenAddressSync(mintPk, destOwner, false, TOKEN_2022_PROGRAM_ID, ASSOCIATED_TOKEN_PROGRAM_ID);
  return withSolanaRpcFallback(async (rpc) => {
    const conn = createSolanaConnection(Connection, rpc, 'confirmed');
    const tx = new Transaction().add(
      createAssociatedTokenAccountIdempotentInstruction(signer.publicKey, destAta, destOwner, mintPk, TOKEN_2022_PROGRAM_ID, ASSOCIATED_TOKEN_PROGRAM_ID),
      createTransferCheckedInstruction(srcAta, mintPk, destAta, signer.publicKey, 1, 0, [], TOKEN_2022_PROGRAM_ID),
    );
    return sendAndConfirmFresh(conn, tx, [signer], 'Custodial marketplace Solana NFT transfer');
  }, { label: 'Custodial marketplace Solana NFT transfer' });
}

async function transferSolanaCoreNft({ assetId, to }) {
  const owner = solanaCustodyKeypair()?.publicKey?.toBase58?.();
  if (!owner) throw httpError(503, 'Solana custody signer is not configured');
  const info = await getSolanaBridgeAssetInfo(assetId, owner);
  if (info.standard !== 'mpl-core') throw httpError(409, 'Solana Core delivery expected a Metaplex Core Demon King asset');
  const dest = normalizeSolanaPubkey(to, 'Destination Solana wallet');
  return withSolanaCoreUmi('Custodial marketplace Solana Core transfer', async ({ umi }) => {
    const { publicKey } = await import('@metaplex-foundation/umi');
    const { transfer } = await import('@metaplex-foundation/mpl-core');
    const { asset, collection } = await fetchSolanaCoreAssetAndCollection(umi, assetId);
    const builder = transfer(umi, {
      asset,
      ...(collection ? { collection } : {}),
      authority: umi.identity,
      newOwner: publicKey(dest),
    });
    return sendUmiBuilder(builder, umi, 'Custodial marketplace Solana Core transfer');
  });
}

async function transferSolanaNft({ assetId, to }) {
  const owner = solanaCustodyKeypair()?.publicKey?.toBase58?.();
  if (!owner) throw httpError(503, 'Solana custody signer is not configured');
  const info = await getSolanaBridgeAssetInfo(assetId, owner);
  if (info.standard === 'token2022') return transferSolanaToken2022Nft({ mint: assetId, to });
  if (info.standard === 'mpl-core') return transferSolanaCoreNft({ assetId, to });
  throw httpError(409, `Unsupported Solana NFT standard ${info.standard || ''}`);
}

async function transferAptosNft({ tokenAddress, to }) {
  const acc = aptosAccount();
  if (!acc) throw httpError(503, 'Aptos custody signer is not configured');
  const sdkPath = process.env.APTOS_SDK_PATH
    || require.resolve('@aptos-labs/ts-sdk', { paths: [require('path').join(__dirname, '..', 'server-futures', 'node_modules'), require('path').join(__dirname, '..', 'nft', 'node_modules')] });
  const sdk = require(sdkPath);
  const aptos = new sdk.Aptos(new sdk.AptosConfig({ network: 'mainnet' }));
  const tx = await aptos.transaction.build.simple({
    sender: acc.accountAddress,
    data: {
      function: '0x1::object::transfer',
      typeArguments: [APTOS_TOKEN_TYPE],
      functionArguments: [normalizeAptosWallet(tokenAddress, 'Aptos token'), normalizeAptosWallet(to, 'Aptos recipient')],
    },
  });
  const submitted = await aptos.signAndSubmitTransaction({ signer: acc, transaction: tx });
  await aptos.waitForTransaction({ transactionHash: submitted.hash });
  return submitted.hash;
}

async function transferAssetSameChain(order, destAddress, ctx) {
  const chain = String(order.asset_chain || '').toLowerCase();
  if (isEvmChain(chain)) return transferEvmNft({ chain, tokenId: order.asset_id, to: destAddress, ctx });
  if (chain === 'solana') return transferSolanaNft({ assetId: order.asset_id, to: destAddress });
  if (chain === 'aptos') return transferAptosNft({ tokenAddress: order.asset_id, to: destAddress });
  throw httpError(400, `Unsupported asset chain ${chain}`);
}

async function burnEvmForBridge({ order, destChain, ctx }) {
  const chain = String(order.asset_chain || '').toLowerCase();
  const { getAddress } = await import('viem');
  const dep = deploymentOf(chain);
  if (!dep?.proxy) throw httpError(503, `${shortLabel(chain)} NFT contract is not configured`);
  const { publicClient, walletClient } = await evmClients(chain, ctx);
  if (!walletClient) throw httpError(503, 'EVM custody signer is not configured');
  let value = 0n;
  try {
    value = BigInt(await publicClient.readContract({ address: getAddress(dep.proxy), abi: ERC721_ABI, functionName: 'bridgeFeeWei', args: [] }) || 0);
  } catch {}
  const hash = await walletClient.writeContract({
    address: getAddress(dep.proxy),
    abi: ERC721_ABI,
    functionName: 'bridgeBurn',
    args: [BigInt(order.asset_id), BigInt(CHAIN_IDS[destChain])],
    value,
  });
  await publicClient.waitForTransactionReceipt({ hash, confirmations: 2 });
  return hash;
}

async function burnAptosForBridge({ order, destChain }) {
  const acc = aptosAccount();
  if (!acc) throw httpError(503, 'Aptos custody signer is not configured');
  const dep = deploymentOf('aptos');
  if (!dep?.module) throw httpError(503, 'Aptos module is not configured');
  const sdkPath = process.env.APTOS_SDK_PATH
    || require.resolve('@aptos-labs/ts-sdk', { paths: [require('path').join(__dirname, '..', 'server-futures', 'node_modules'), require('path').join(__dirname, '..', 'nft', 'node_modules')] });
  const sdk = require(sdkPath);
  const aptos = new sdk.Aptos(new sdk.AptosConfig({ network: 'mainnet' }));
  const tx = await aptos.transaction.build.simple({
    sender: acc.accountAddress,
    data: {
      function: `${dep.module}::bridge_burn`,
      functionArguments: [normalizeAptosWallet(order.asset_id, 'Aptos token'), String(CHAIN_IDS[destChain])],
    },
  });
  const submitted = await aptos.signAndSubmitTransaction({ signer: acc, transaction: tx });
  await aptos.waitForTransaction({ transactionHash: submitted.hash });
  return submitted.hash;
}

async function burnSolanaToken2022ForBridge({ order, destChain, destAddress }) {
  const signer = solanaCustodyKeypair();
  if (!signer) throw httpError(503, 'Solana custody signer is not configured');
  const owner = signer.publicKey.toBase58();
  const info = await getSolanaBridgeAssetInfo(order.asset_id, owner);
  if (info.standard !== 'token2022') throw httpError(409, 'Automatic Solana bridge supports Token-2022 Demon King NFTs only');
  const { PublicKey, SystemProgram, Transaction, TransactionInstruction } = require('@solana/web3.js');
  const {
    TOKEN_2022_PROGRAM_ID,
    createBurnCheckedInstruction,
    createCloseAccountInstruction,
  } = require('@solana/spl-token');
  const memo = buildSolanaBridgeMemo({
    asset: order.asset_id,
    owner,
    collection: info.collection || null,
    level: Number(order.level || info.level || 1),
    destinationChainId: CHAIN_IDS[destChain],
    destAddress,
    feeLamports: 0,
  });
  const conn = solanaConnection();
  const tokenAccountPk = new PublicKey(info.tokenAccount);
  const mintPk = new PublicKey(order.asset_id);
  const tx = new Transaction().add(
    createBurnCheckedInstruction(tokenAccountPk, mintPk, signer.publicKey, 1, 0, [], TOKEN_2022_PROGRAM_ID),
    createCloseAccountInstruction(tokenAccountPk, signer.publicKey, signer.publicKey, [], TOKEN_2022_PROGRAM_ID),
    new TransactionInstruction({
      programId: new PublicKey(SOLANA_MEMO_PROGRAM),
      keys: [],
      data: Buffer.from(memo, 'utf8'),
    }),
  );
  return sendAndConfirmFresh(conn, tx, [signer], 'Custodial marketplace Solana bridge burn');
}

async function burnSolanaCoreForBridge({ order, destChain, destAddress }) {
  const owner = solanaCustodyKeypair()?.publicKey?.toBase58?.();
  if (!owner) throw httpError(503, 'Solana custody signer is not configured');
  const info = await getSolanaBridgeAssetInfo(order.asset_id, owner);
  if (info.standard !== 'mpl-core') throw httpError(409, 'Solana Core bridge expected a Metaplex Core Demon King asset');
  const memo = buildSolanaBridgeMemo({
    asset: order.asset_id,
    owner,
    collection: info.collection || null,
    level: Number(order.level || info.level || 1),
    destinationChainId: CHAIN_IDS[destChain],
    destAddress,
    feeLamports: 0,
  });
  return withSolanaCoreUmi('Custodial marketplace Solana Core bridge burn', async ({ umi }) => {
    const { publicKey } = await import('@metaplex-foundation/umi');
    const { burn } = await import('@metaplex-foundation/mpl-core');
    const { asset, collection } = await fetchSolanaCoreAssetAndCollection(umi, order.asset_id);
    const burnBuilder = burn(umi, {
      asset,
      ...(collection ? { collection } : {}),
      authority: umi.identity,
    });
    const memoIx = {
      programId: publicKey(SOLANA_MEMO_PROGRAM),
      keys: [],
      data: new Uint8Array(Buffer.from(memo, 'utf8')),
    };
    const builder = burnBuilder.add({ bytesCreatedOnChain: 0, instruction: memoIx, signers: [] });
    return sendUmiBuilder(builder, umi, 'Custodial marketplace Solana Core bridge burn');
  });
}

async function burnSolanaForBridge({ order, destChain, destAddress }) {
  const owner = solanaCustodyKeypair()?.publicKey?.toBase58?.();
  if (!owner) throw httpError(503, 'Solana custody signer is not configured');
  const info = await getSolanaBridgeAssetInfo(order.asset_id, owner);
  if (info.standard === 'token2022') return burnSolanaToken2022ForBridge({ order, destChain, destAddress });
  if (info.standard === 'mpl-core') return burnSolanaCoreForBridge({ order, destChain, destAddress });
  throw httpError(409, `Unsupported Solana NFT standard ${info.standard || ''}`);
}

function internalApiBase() {
  const raw = String(
    process.env.CUSTODIAL_MARKETPLACE_INTERNAL_API_BASE
    || process.env.BRIDGE_API_BASE
    || process.env.INTERNAL_API_BASE_URL
    || process.env.APP_PUBLIC_URL
    || process.env.PUBLIC_BASE_URL
    || `http://127.0.0.1:${process.env.PORT || 4000}/api`
  ).replace(/\/+$/, '');
  return raw.endsWith('/api') ? raw : `${raw}/api`;
}

async function relayBridge({ sourceChain, destChain, burnTxHash, destAddress }) {
  const url = `${internalApiBase()}/bridge/relay`;
  const response = await fetch(url, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ sourceChain, destChain, burnTxHash, destAddress }),
  });
  const json = await response.json().catch(() => ({}));
  if (!response.ok) throw httpError(response.status || 502, json?.error || 'bridge relay failed');
  return json;
}

async function bridgeAssetToDestination(order, ctx) {
  const sourceChain = String(order.asset_chain || '').toLowerCase();
  const destChain = String(order.buyer_dest_chain || '').toLowerCase();
  const destAddress = order.buyer_dest_address;
  await assertDestinationDeliveryReady(destChain, ctx);
  const priorBurn = latestBridgeBurnEvent(order.id, { sourceChain, destChain, destAddress });
  let burnTxHash = priorBurn?.txHash || null;
  if (!burnTxHash) {
    if (isEvmChain(sourceChain)) burnTxHash = await burnEvmForBridge({ order, destChain, ctx });
    else if (sourceChain === 'aptos') burnTxHash = await burnAptosForBridge({ order, destChain });
    else if (sourceChain === 'solana') burnTxHash = await burnSolanaForBridge({ order, destChain, destAddress });
    else throw httpError(400, `Unsupported source chain ${sourceChain}`);
    insertEvent(order.id, 'bridge_burned', { txHash: burnTxHash, data: { sourceChain, destChain, destAddress } });
  }
  const relay = await relayBridge({ sourceChain, destChain, burnTxHash, destAddress });
  return {
    burnTxHash,
    relay,
    deliveryTxHash: relay.destTxHash || relay.txSig || relay.txHash || relay.assetAddress || burnTxHash,
  };
}

function rememberBuyerDeliveryWallet(order) {
  const playerId = String(order?.buyer_player_id || '').trim();
  const destAddress = String(order?.buyer_dest_address || '').trim();
  const destChain = String(order?.buyer_dest_chain || '').toLowerCase();
  if (!playerId || !destAddress) return;
  if (!['base', 'arbitrum', 'monad', 'ink', 'aptos'].includes(destChain)) return;
  try {
    gameDb.db.prepare(`
      UPDATE players
         SET nft_gold_boost_wallet = ?
       WHERE id = ?
         AND (nft_gold_boost_wallet IS NULL
              OR TRIM(nft_gold_boost_wallet) = ''
              OR lower(nft_gold_boost_wallet) = lower(?))
    `).run(destAddress, playerId, destAddress);
  } catch {}
}

async function maybeAutoDeliver(order, ctx, actorPlayerId) {
  const fresh = getOrder(order.id);
  if (!fresh || fresh.status !== 'paid') return fresh || order;
  const sourceChain = String(fresh.asset_chain || '').toLowerCase();
  const destChain = String(fresh.buyer_dest_chain || sourceChain).toLowerCase();
  let txHash;
  let mode;
  let bridged = null;
  if (sourceChain === destChain) {
    txHash = await transferAssetSameChain(fresh, fresh.buyer_dest_address, ctx);
    mode = `auto_${sourceChain}_transfer`;
  } else {
    if (process.env.CUSTODIAL_MARKETPLACE_AUTO_BRIDGE === '0') return fresh;
    bridged = await bridgeAssetToDestination(fresh, ctx);
    txHash = bridged.deliveryTxHash;
    mode = `auto_bridge_${sourceChain}_to_${destChain}`;
  }
  gameDb.db.prepare(`
    UPDATE custodial_marketplace_orders
       SET status = 'delivered',
           delivery_tx_hash = ?,
           delivered_at = datetime('now'),
           error = NULL,
           updated_at = datetime('now')
     WHERE id = ? AND status = 'paid'
  `).run(txHash, fresh.id);
  insertEvent(fresh.id, 'delivered', { actorPlayerId, txHash, data: { mode, sourceChain, destChain } });
  const afterDelivery = getOrder(fresh.id);
  rememberBuyerDeliveryWallet(afterDelivery);
  const deliveryAsset = deliveryAssetFromBridge(afterDelivery);
  const deliveryTokenId = sourceChain === destChain
    ? afterDelivery.asset_id
    : (
        bridged?.relay?.assetAddress
        || bridged?.relay?.tokenAddress
        || bridged?.relay?.tokenId
        || deliveryAsset?.assetId
        || null
      );
  bindMarketplaceAssetToPlayer(
    afterDelivery,
    afterDelivery.buyer_player_id,
    afterDelivery.buyer_dest_address,
    'marketplace-delivery',
    txHash,
    {
      chain: destChain,
      tokenId: deliveryTokenId,
    },
  );
  if (ctx.config?.autoPayoutEnabled) {
    const payout = await maybeAutoPayoutBestEffort(afterDelivery, ctx, actorPlayerId);
    return payout.order;
  }
  return afterDelivery;
}

async function payoutEvmUsdc({ chain, to, amount, ctx }) {
  const config = paymentConfigs(ctx)[chain];
  const { getAddress } = await import('viem');
  const { publicClient, walletClient } = await evmClients(chain, ctx);
  if (!walletClient) throw httpError(503, 'EVM payout signer is not configured');
  const tokenAmount = scaleUsdc6ToDecimals(amount, config.decimals);
  const hash = await walletClient.writeContract({
    address: getAddress(config.tokenAddress),
    abi: ERC20_ABI,
    functionName: 'transfer',
    args: [getAddress(to), tokenAmount],
  });
  await publicClient.waitForTransactionReceipt({ hash, confirmations: 2 });
  return hash;
}

async function payoutSolanaToken({ to, amount, ctx, order = null }) {
  const signer = solanaCustodyKeypair();
  if (!signer) throw httpError(503, 'Solana payout signer is not configured');
  const baseConfig = paymentConfigs(ctx).solana;
  const config = solanaSellerPayoutTokenConfig(ctx, order, baseConfig);
  const label = String(config.label || config.token || 'token').toUpperCase();
  const { Connection, PublicKey, Transaction } = require('@solana/web3.js');
  const {
    ASSOCIATED_TOKEN_PROGRAM_ID,
    TOKEN_PROGRAM_ID,
    createAssociatedTokenAccountIdempotentInstruction,
    createTransferCheckedInstruction,
    getAssociatedTokenAddressSync,
  } = require('@solana/spl-token');
  const mintPk = new PublicKey(config.tokenAddress);
  const destOwner = new PublicKey(normalizeSolanaPubkey(to, 'Seller payout wallet'));
  const srcAta = getAssociatedTokenAddressSync(mintPk, signer.publicKey, false, TOKEN_PROGRAM_ID, ASSOCIATED_TOKEN_PROGRAM_ID);
  const destAta = getAssociatedTokenAddressSync(mintPk, destOwner, false, TOKEN_PROGRAM_ID, ASSOCIATED_TOKEN_PROGRAM_ID);
  const sellerAmount = BigInt(String(amount || '0'));
  if (sellerAmount <= 0n) throw httpError(400, 'Solana payout amount must be greater than zero');

  const signerAddress = signer.publicKey.toBase58();
  const orderPaymentTreasury = order?.payment_chain === 'solana' && order?.payment_treasury
    ? normalizeSolanaPubkey(order.payment_treasury, 'Solana payment treasury')
    : null;
  if (orderPaymentTreasury && orderPaymentTreasury !== signerAddress) {
    throw httpError(
      409,
      `Solana payment was received by ${orderPaymentTreasury}, but automatic payout signer is ${signerAddress}. Configure Solana payment treasury to the signer escrow or provide a treasury signer.`
    );
  }

  const revenueOwnerRaw = config.revenueTreasury || configuredSolanaRevenueTreasury(ctx);
  const revenueOwner = revenueOwnerRaw
    ? new PublicKey(normalizeSolanaPubkey(revenueOwnerRaw, `Solana ${label} revenue treasury`))
    : null;
  const revenueAmount = revenueOwner && revenueOwner.toBase58() !== signerAddress && order?.payment_chain === 'solana'
    ? solanaRevenuePayoutUnits(order, sellerAmount)
    : 0n;
  const requiredSourceAmount = sellerAmount + revenueAmount;

  const revenueAta = revenueAmount > 0n
    ? getAssociatedTokenAddressSync(mintPk, revenueOwner, false, TOKEN_PROGRAM_ID, ASSOCIATED_TOKEN_PROGRAM_ID)
    : null;
  return withSolanaRpcFallback(async (rpc) => {
    const conn = createSolanaConnection(Connection, rpc, 'confirmed');
    const [srcInfo, destInfo, revenueInfo, signerLamports, tokenRentLamports] = await Promise.all([
      conn.getAccountInfo(srcAta, 'confirmed'),
      conn.getAccountInfo(destAta, 'confirmed'),
      revenueAta ? conn.getAccountInfo(revenueAta, 'confirmed') : Promise.resolve(null),
      conn.getBalance(signer.publicKey, 'confirmed'),
      conn.getMinimumBalanceForRentExemption(165),
    ]);
    if (!srcInfo) throw httpError(409, `Solana payout source USDC account is missing for ${signerAddress}`);
    let sourceUsdc = 0n;
    try {
      sourceUsdc = BigInt((await conn.getTokenAccountBalance(srcAta, 'confirmed')).value.amount || '0');
    } catch (err) {
      const msg = String(err?.message || err || '');
      if (/429|too many requests|max usage reached|rate.?limit|timeout|fetch failed|econnreset|etimedout/i.test(msg)) throw err;
      sourceUsdc = 0n;
    }
    if (sourceUsdc < requiredSourceAmount) {
      throw httpError(
        409,
        `Solana payout treasury has insufficient ${label}: need ${formatUnits(requiredSourceAmount, config.decimals)}, available ${formatUnits(sourceUsdc, config.decimals)}`
      );
    }
    const rentNeeded = (destInfo ? 0 : tokenRentLamports) + (revenueAta && !revenueInfo ? tokenRentLamports : 0);
    if (signerLamports < rentNeeded + 10_000) {
      throw httpError(
        409,
        `Solana payout treasury needs SOL for recipient token accounts: need about ${formatUnits(String(rentNeeded + 10_000), 9)} SOL`
      );
    }

    const tx = new Transaction();
    tx.add(createAssociatedTokenAccountIdempotentInstruction(
      signer.publicKey,
      destAta,
      destOwner,
      mintPk,
      TOKEN_PROGRAM_ID,
      ASSOCIATED_TOKEN_PROGRAM_ID
    ));
    tx.add(createTransferCheckedInstruction(srcAta, mintPk, destAta, signer.publicKey, sellerAmount, config.decimals, [], TOKEN_PROGRAM_ID));
    if (revenueAmount > 0n && revenueAta) {
      tx.add(createAssociatedTokenAccountIdempotentInstruction(
        signer.publicKey,
        revenueAta,
        revenueOwner,
        mintPk,
        TOKEN_PROGRAM_ID,
        ASSOCIATED_TOKEN_PROGRAM_ID
      ));
      tx.add(createTransferCheckedInstruction(srcAta, mintPk, revenueAta, signer.publicKey, revenueAmount, config.decimals, [], TOKEN_PROGRAM_ID));
    }
    return sendAndConfirmFresh(conn, tx, [signer], 'Custodial marketplace seller payout');
  }, { label: 'Custodial marketplace seller payout' });
}

async function payoutAptosUsdc({ to, amount, ctx }) {
  const acc = aptosAccount();
  if (!acc) throw httpError(503, 'Aptos payout signer is not configured');
  const config = paymentConfigs(ctx).aptos;
  const sdkPath = process.env.APTOS_SDK_PATH
    || require.resolve('@aptos-labs/ts-sdk', { paths: [require('path').join(__dirname, '..', 'server-futures', 'node_modules'), require('path').join(__dirname, '..', 'nft', 'node_modules')] });
  const sdk = require(sdkPath);
  const aptos = new sdk.Aptos(new sdk.AptosConfig({ network: 'mainnet' }));
  const tx = await aptos.transaction.build.simple({
    sender: acc.accountAddress,
    data: {
      function: '0x1::primary_fungible_store::transfer',
      typeArguments: ['0x1::fungible_asset::Metadata'],
      functionArguments: [config.tokenAddress, normalizeAptosWallet(to, 'Seller payout wallet'), String(amount)],
    },
  });
  const submitted = await aptos.signAndSubmitTransaction({ signer: acc, transaction: tx });
  await aptos.waitForTransaction({ transactionHash: submitted.hash });
  return submitted.hash;
}

async function maybeAutoPayout(order, ctx, actorPlayerId) {
  const fresh = getOrder(order.id);
  if (!fresh || fresh.status !== 'delivered' || fresh.payout_tx_hash) return fresh || order;
  const chain = String(fresh.seller_payout_chain || '').toLowerCase();
  let txHash;
  if (isEvmChain(chain)) txHash = await payoutEvmUsdc({ chain, to: fresh.seller_payout_address, amount: fresh.seller_amount_usdc_units, ctx });
  else if (chain === 'solana') txHash = await payoutSolanaToken({ to: fresh.seller_payout_address, amount: solanaSellerPayoutUnits(fresh), ctx, order: fresh });
  else if (chain === 'aptos') txHash = await payoutAptosUsdc({ to: fresh.seller_payout_address, amount: fresh.seller_amount_usdc_units, ctx });
  else return fresh;
  gameDb.db.prepare(`
    UPDATE custodial_marketplace_orders
       SET payout_tx_hash = ?,
           paid_out_at = datetime('now'),
           error = NULL,
           updated_at = datetime('now')
     WHERE id = ?
  `).run(txHash, fresh.id);
  insertEvent(fresh.id, 'seller_paid', { actorPlayerId, txHash, data: { mode: `auto_${chain}_usdc` } });
  return getOrder(fresh.id);
}

async function maybeAutoPayoutBestEffort(order, ctx, actorPlayerId) {
  try {
    return { order: await maybeAutoPayout(order, ctx, actorPlayerId), payoutError: null };
  } catch (err) {
    const payoutError = (err?.message || 'payout failed').slice(0, 240);
    gameDb.db.prepare(`
      UPDATE custodial_marketplace_orders
         SET error = ?,
             updated_at = datetime('now')
       WHERE id = ?
    `).run(`payout failed: ${payoutError}`, order.id);
    insertEvent(order.id, 'payout_failed', { actorPlayerId, data: { error: payoutError } });
    return { order: getOrder(order.id), payoutError };
  }
}

function requireOrderSeller(order, playerId) {
  if (!order) throw httpError(404, 'Listing not found');
  if (String(order.seller_player_id || '') !== String(playerId || '')) throw httpError(403, 'This listing belongs to another player');
}

function requireOrderBuyer(order, playerId) {
  if (!order) throw httpError(404, 'Order not found');
  if (String(order.buyer_player_id || '') !== String(playerId || '')) throw httpError(403, 'This order belongs to another player');
}

function requireOrderSellerForPlayer(order, player) {
  if (!order) throw httpError(404, 'Listing not found');
  if (!orderSellerMatchesPlayer(order, player)) throw httpError(403, 'This listing belongs to another player');
}

function requireOrderBuyerForPlayer(order, player) {
  if (!order) throw httpError(404, 'Order not found');
  if (!orderBuyerMatchesPlayer(order, player)) throw httpError(403, 'This order belongs to another player');
}

function canCancelStatus(order) {
  if (order.status === 'awaiting_deposit' || order.status === 'active') return true;
  if (order.status === 'reserved') return Number(order.payment_deadline || 0) < nowSec();
  return false;
}

function releaseExpiredReservations() {
  let changed = clearReleasedReservationPaymentState();
  const expired = gameDb.db.prepare(`
    SELECT id FROM custodial_marketplace_orders
    WHERE status = 'reserved'
      AND payment_deadline IS NOT NULL
      AND payment_deadline < ?
    LIMIT 200
  `).all(nowSec());
  if (!expired.length) return changed;
  gameDb.db.transaction(() => {
    const update = gameDb.db.prepare(`
      UPDATE custodial_marketplace_orders
         SET status = 'active',
             buyer_player_id = NULL,
             buyer_wallet = NULL,
             buyer_dest_chain = NULL,
             buyer_dest_address = NULL,
             payment_chain = 'base',
             payment_token = 'usdc',
             payment_token_address = NULL,
             payment_decimals = 6,
             payment_label = 'USDC',
             payment_treasury = NULL,
             payment_amount_usdc_units = NULL,
             payment_nonce = NULL,
             payment_deadline = NULL,
             error = NULL,
             updated_at = datetime('now')
       WHERE id = ? AND status = 'reserved'
    `);
    for (const row of expired) {
      update.run(row.id);
      insertEvent(row.id, 'reservation_expired', { data: { releasedAt: nowSec() } });
    }
  })();
  changed += expired.length;
  return changed;
}

function settlementRetrySeconds() {
  return Math.max(60, Math.min(3600, Number(process.env.CUSTODIAL_MARKETPLACE_SETTLEMENT_RETRY_SECONDS || 300) || 300));
}

async function runSettlementSweep(ctx) {
  if (settlementWorkerRunning) return;
  settlementWorkerRunning = true;
  try {
    const config = await marketplaceRuntimeConfig(ctx);
    const retrySeconds = settlementRetrySeconds();
    const paidRows = gameDb.db.prepare(`
      SELECT * FROM custodial_marketplace_orders
      WHERE status = 'paid'
        AND datetime(updated_at) <= datetime('now', '-30 seconds')
      ORDER BY updated_at ASC
      LIMIT 10
    `).all();
    for (const row of paidRows) {
      try {
        // eslint-disable-next-line no-await-in-loop
        await maybeAutoDeliver(row, { ...ctx, config }, null);
      } catch (err) {
        const message = (err?.message || 'delivery failed').slice(0, 240);
        gameDb.db.prepare(`
          UPDATE custodial_marketplace_orders
             SET error = ?,
                 updated_at = datetime('now')
           WHERE id = ? AND status = 'paid'
        `).run(message, row.id);
        insertEvent(row.id, 'delivery_failed', { data: { error: message, mode: 'settlement_worker' } });
      }
    }

    if (config.autoPayoutEnabled) {
      const payoutRows = gameDb.db.prepare(`
        SELECT * FROM custodial_marketplace_orders
        WHERE status = 'delivered'
          AND payout_tx_hash IS NULL
          AND datetime(updated_at) <= datetime('now', '-' || ? || ' seconds')
        ORDER BY updated_at ASC
        LIMIT 10
      `).all(retrySeconds);
      for (const row of payoutRows) {
        // eslint-disable-next-line no-await-in-loop
        await maybeAutoPayoutBestEffort(row, { ...ctx, config }, null);
      }
    }
  } catch (err) {
    console.warn('[custodial-marketplace] settlement sweep failed:', err?.message || err);
  } finally {
    settlementWorkerRunning = false;
  }
}

async function runDepositVerificationSweep() {
  if (depositVerifierRunning) return;
  depositVerifierRunning = true;
  try {
    const rows = gameDb.db.prepare(`
      SELECT * FROM custodial_marketplace_orders
      WHERE status = 'awaiting_deposit'
      ORDER BY updated_at ASC
      LIMIT 50
    `).all();
    let verified = 0;
    for (const row of rows) {
      try {
        const updated = await activateOrderIfVaultOwnsAsset(row, { eventType: 'deposit_auto_verified' });
        if (updated?.status === 'active') verified += 1;
      } catch (err) {
        if (Number(err?.status) !== 403 && Number(err?.status) !== 400 && Number(err?.status) !== 404) {
          console.warn(`[custodial-marketplace] deposit auto verify failed for ${row.id}:`, err?.message || err);
        }
      }
    }
    if (verified) console.log(`[custodial-marketplace] auto-verified ${verified} custodial deposit(s)`);
  } finally {
    depositVerifierRunning = false;
  }
}

function startSettlementWorker(ctx) {
  if (settlementWorkerStarted || process.env.CUSTODIAL_MARKETPLACE_SETTLEMENT_WORKER === '0') return;
  settlementWorkerStarted = true;
  const intervalMs = Math.max(30_000, Math.min(15 * 60_000, Number(process.env.CUSTODIAL_MARKETPLACE_SETTLEMENT_INTERVAL_MS || 60_000) || 60_000));
  setTimeout(() => runDepositVerificationSweep().catch(() => {}), 5_000).unref?.();
  setTimeout(() => runSettlementSweep(ctx).catch(() => {}), 10_000).unref?.();
  setInterval(() => runDepositVerificationSweep().catch(() => {}), intervalMs).unref?.();
  setInterval(() => runSettlementSweep(ctx).catch(() => {}), intervalMs).unref?.();
  console.log(`[custodial-marketplace] settlement worker scheduled every ${intervalMs}ms`);
}

function mountCustodialMarketplace(router, ctx = {}) {
  const auth = ctx.auth;
  const adminAuth = ctx.adminAuth;
  if (!auth) throw new Error('auth middleware required');
  backfillOpenOrderFees();
  clearReleasedReservationPaymentState();
  startSettlementWorker(ctx);

  router.get('/marketplace/custodial/config', async (req, res) => {
    try {
      const config = await marketplaceRuntimeConfig(ctx);
      res.set('Cache-Control', 'no-store');
      res.json(config);
    } catch (err) {
      res.status(err?.status || 500).json({ error: err?.message || 'marketplace config failed' });
    }
  });

  router.get('/marketplace/custodial/listings', (req, res) => {
    try {
      releaseExpiredReservations();
      const status = String(req.query.status || 'active').toLowerCase();
      const assetChain = String(req.query.assetChain || req.query.chain || '').toLowerCase();
      const level = String(req.query.level || '').toLowerCase();
      const sort = String(req.query.sort || req.query.order || 'newest').toLowerCase();
      const limit = Math.min(100, Math.max(1, Number(req.query.limit) || 50));
      const offset = Math.max(0, Number(req.query.offset) || 0);
      const allowed = new Set(['active', 'reserved', 'paid', 'delivered', 'cancelled', 'all']);
      if (!allowed.has(status)) throw httpError(400, 'Unsupported status filter');
      const sortSql = {
        newest: 'created_at DESC',
        date_desc: 'created_at DESC',
        oldest: 'created_at ASC',
        date_asc: 'created_at ASC',
        price_asc: 'CAST(price_usdc_units AS INTEGER) ASC, created_at DESC',
        lowest: 'CAST(price_usdc_units AS INTEGER) ASC, created_at DESC',
        price_desc: 'CAST(price_usdc_units AS INTEGER) DESC, created_at DESC',
        highest: 'CAST(price_usdc_units AS INTEGER) DESC, created_at DESC',
      }[sort] || 'created_at DESC';
      const where = [];
      const params = [];
      if (status !== 'all') {
        where.push('status = ?');
        params.push(status);
      } else {
        where.push("status IN ('active', 'reserved', 'paid', 'delivered')");
      }
      if (assetChain) {
        normalizeChain(assetChain, 'assetChain');
        where.push('asset_chain = ?');
        params.push(assetChain);
      }
      if (level && level !== 'all') {
        const lvl = Number(level);
        if (![1, 2, 3].includes(lvl)) throw httpError(400, 'Unsupported level filter');
        where.push('level = ?');
        params.push(lvl);
      }
      const sqlWhere = where.length ? `WHERE ${where.join(' AND ')}` : '';
      const rows = gameDb.db.prepare(`
        SELECT * FROM custodial_marketplace_orders
        ${sqlWhere}
        ORDER BY ${sortSql}
        LIMIT ? OFFSET ?
      `).all(...params, limit, offset);
      const total = gameDb.db.prepare(`SELECT COUNT(*) AS c FROM custodial_marketplace_orders ${sqlWhere}`).get(...params)?.c || 0;
      const statsWhere = [];
      const statsParams = [];
      if (assetChain) {
        statsWhere.push('asset_chain = ?');
        statsParams.push(assetChain);
      }
      if (level && level !== 'all') {
        statsWhere.push('level = ?');
        statsParams.push(Number(level));
      }
      const statsSql = statsWhere.length ? `AND ${statsWhere.join(' AND ')}` : '';
      const activeStats = gameDb.db.prepare(`
        SELECT
          COUNT(*) AS listed_count,
          MIN(CAST(price_usdc_units AS INTEGER)) AS floor_usdc_units
        FROM custodial_marketplace_orders
        WHERE status = 'active' ${statsSql}
      `).get(...statsParams) || {};
      const salesStats = gameDb.db.prepare(`
        SELECT COALESCE(SUM(CAST(price_usdc_units AS INTEGER)), 0) AS volume_usdc_units
        FROM custodial_marketplace_orders
        WHERE status = 'delivered' ${statsSql}
      `).get(...statsParams) || {};
      res.set('Cache-Control', 'no-store');
      res.json({
        listings: rows.map((r) => publicOrder(r)),
        total,
        limit,
        offset,
        filters: {
          status,
          assetChain: assetChain || null,
          level: level || 'all',
          sort,
        },
        stats: {
          listedCount: Number(activeStats.listed_count || 0),
          volumeUsdcUnits: String(salesStats.volume_usdc_units || '0'),
          floorUsdcUnits: activeStats.floor_usdc_units == null ? null : String(activeStats.floor_usdc_units),
        },
      });
    } catch (err) {
      res.status(err?.status || 500).json({ error: err?.message || 'listings query failed' });
    }
  });

  router.get('/marketplace/custodial/orders/mine', auth, (req, res) => {
    try {
      releaseExpiredReservations();
      const mine = mineOrdersWhere(req.player);
      const rows = gameDb.db.prepare(`
        SELECT * FROM custodial_marketplace_orders
        WHERE ${mine.where}
        ORDER BY updated_at DESC
        LIMIT 200
      `).all(...mine.params);
      res.set('Cache-Control', 'no-store');
      res.json({ orders: rows.map((r) => publicOrder(r, { includePrivate: true })) });
    } catch (err) {
      res.status(err?.status || 500).json({ error: err?.message || 'orders query failed' });
    }
  });

  router.get('/marketplace/custodial/orders/:id', auth, (req, res) => {
    try {
      releaseExpiredReservations();
      const order = getOrder(req.params.id);
      if (!order) throw httpError(404, 'Order not found');
      const isParty = orderSellerMatchesPlayer(order, req.player) || orderBuyerMatchesPlayer(order, req.player);
      if (!isParty) throw httpError(403, 'This order belongs to another player');
      res.set('Cache-Control', 'no-store');
      res.json({ success: true, order: publicOrder(order, { includePrivate: true }) });
    } catch (err) {
      res.status(err?.status || 500).json({ error: err?.message || 'order query failed' });
    }
  });

  router.post('/marketplace/custodial/listings', auth, async (req, res) => {
    try {
      const config = await marketplaceRuntimeConfig(ctx);
      if (!config.enabled) throw httpError(503, 'Custodial marketplace is disabled');
      if (!config.ready) throw httpError(503, 'Custodial marketplace wallets are not configured');
      const assetChain = normalizeChain(req.body?.assetChain || req.body?.chain || 'solana', 'assetChain');
      const vault = config.vaults[assetChain];
      if (!vault?.address) throw httpError(503, `${shortLabel(assetChain)} custody vault is not configured`);
      let sellerWallet = normalizeAddressForChain(assetChain, req.body?.sellerWallet || req.body?.owner || req.player.wallet, 'Seller wallet');
      const connectedSellerWallet = normalizeAddressForChainSafe(
        assetChain,
        req.body?.connectedSellerWallet || req.body?.connectedWallet || req.body?.walletAddress,
      );
      const assetId = normalizeAssetIdForChain(assetChain, req.body?.assetId || req.body?.mint || req.body?.tokenId || req.body?.tokenAddress || '', 'assetId');
      const payoutChain = normalizeChain(req.body?.sellerPayoutChain || assetChain, 'sellerPayoutChain');
      const payoutAddress = normalizeAddressForChain(payoutChain, req.body?.sellerPayoutAddress || sellerWallet, 'Seller payout wallet');
      const priceUnits = parseUsdcUnits(req.body?.priceUsdc ?? req.body?.price, 'Listing price');
      const { fee, royalty, sellerAmount } = quoteMarketplaceSplit(priceUnits, config.feeBps, config.royaltyBps);
      if (sellerAmount <= 0n) throw httpError(400, 'Listing price is too small after marketplace fee and royalty');
      let assetInfo = null;
      let existing = getOpenOrderByAsset(assetChain, assetId);
      if (existing) {
        if (String(existing.seller_player_id || '') !== String(req.player.id || '')) {
          throw httpError(409, 'This NFT already has an active custodial listing');
        }
        if (existing.status === 'awaiting_deposit') {
          try {
            const activated = await activateOrderIfVaultOwnsAsset(existing, {
              actorPlayerId: req.player.id,
              eventType: 'deposit_verified_on_relist',
            });
            if (activated?.status === 'active') {
              return res.json({ success: true, resumed: true, order: publicOrder(activated, { includePrivate: true }) });
            }
          } catch (err) {
            if (Number(err?.status) !== 403) throw err;
          }
          if (isAwaitingDepositStale(existing)) {
            cancelAwaitingDepositOrder(existing, {
              actorPlayerId: req.player.id,
              eventType: 'cancelled_stale_awaiting_deposit',
              data: {
                assetChain,
                assetId,
                ageSeconds: Math.floor((Date.now() - Date.parse(`${String(existing.created_at || '').replace(' ', 'T')}Z`)) / 1000),
                ttlSeconds: awaitingDepositTtlSeconds(),
              },
            });
            console.warn(`[marketplace] cancelled stale pending listing ${existing.id} for ${shortId(assetId)} after failed deposit verification`);
            existing = null;
          }
          if (existing && assetChain === 'solana') {
            const onChainInfo = await verifyAssetOwner(assetChain, assetId, null).catch(() => null);
            const onChainOwner = onChainInfo?.owner || '';
            const playerWallet = normalizeAddressForChainSafe(assetChain, req.player?.wallet);
            const requestOwnsAsset = onChainOwner && (
              sameChainAddress(assetChain, onChainOwner, sellerWallet)
              || sameChainAddress(assetChain, onChainOwner, connectedSellerWallet)
              || sameChainAddress(assetChain, onChainOwner, playerWallet)
            );
            if (requestOwnsAsset && !sameChainAddress(assetChain, onChainOwner, existing.seller_wallet)) {
              cancelAwaitingDepositOrder(existing, {
                actorPlayerId: req.player.id,
                eventType: 'cancelled_stale_seller_wallet',
                data: {
                  assetChain,
                  assetId,
                  staleSellerWallet: existing.seller_wallet,
                  requestedSellerWallet: sellerWallet,
                  connectedSellerWallet,
                  onChainOwner,
                },
              });
              console.warn(`[marketplace] cancelled stale pending Solana listing ${existing.id} for ${shortId(assetId)}; owner moved from ${shortId(existing.seller_wallet)} to ${shortId(onChainOwner)}`);
              sellerWallet = onChainOwner;
              assetInfo = onChainInfo;
              existing = null;
            }
          }
          if (existing) {
            return res.status(409).json({
              error: 'This NFT already has a pending listing. Finish the custody transfer or cancel it from Orders.',
              order: publicOrder(existing, { includePrivate: true }),
            });
          }
        } else {
          return res.json({ success: true, alreadyListed: true, order: publicOrder(existing, { includePrivate: true }) });
        }
      }
      try {
        assetInfo = assetInfo || await verifyAssetOwner(assetChain, assetId, sellerWallet);
      } catch (err) {
        if (assetChain === 'solana') {
          const onChainInfo = await verifyAssetOwner(assetChain, assetId, null).catch(() => null);
          const onChainOwner = onChainInfo?.owner || '';
          const playerWallet = normalizeAddressForChainSafe(assetChain, req.player?.wallet);
          if (
            onChainOwner
            && (
              sameChainAddress(assetChain, onChainOwner, sellerWallet)
              || sameChainAddress(assetChain, onChainOwner, connectedSellerWallet)
              || sameChainAddress(assetChain, onChainOwner, playerWallet)
            )
          ) {
            console.warn(`[marketplace] corrected Solana seller wallet for ${shortId(assetId)} from ${shortId(sellerWallet)} to on-chain owner ${shortId(onChainOwner)}`);
            sellerWallet = onChainOwner;
            assetInfo = onChainInfo;
          }
        }
        if (!assetInfo) {
          if (Number(err?.status) === 403) {
            const recoverable = getRecoverableCustodiedOrderByAsset(assetChain, assetId, req.player.id, sellerWallet);
            if (recoverable) {
              const vaultInfo = await verifyAssetOwner(assetChain, assetId, vault.address).catch(() => null);
              if (vaultInfo) {
                const metadata = {
                  assetInfo: vaultInfo,
                  createdIp: req.ip || null,
                  note: String(req.body?.note || '').slice(0, 200),
                  recoveredFromCancelledOrder: true,
                };
                const recovered = recoverCustodiedListing(recoverable, {
                  actorPlayerId: req.player.id,
                  sellerWallet,
                  payoutChain,
                  payoutAddress,
                  vault,
                  assetInfo: vaultInfo,
                  priceUnits,
                  fee,
                  royalty,
                  sellerAmount,
                  feeBps: config.feeBps,
                  royaltyBps: config.royaltyBps,
                  metadata,
                });
                return res.json({ success: true, recovered: true, order: publicOrder(recovered, { includePrivate: true }) });
              }
            }
          }
          throw err;
        }
      }
      assetInfo = mergeCachedNftLevel(
        assetInfo,
        cachedPlayerNft(
          req.player.id,
          marketplaceCollectionDbKey({
            asset_chain: assetChain,
            asset_collection: assetInfo?.collection || null,
            metadata_json: JSON.stringify({ assetInfo }),
          }),
          assetChain,
          assetInfo?.asset || assetId,
        ),
      );
      const id = crypto.randomUUID();
      const metadata = { assetInfo, createdIp: req.ip || null, note: String(req.body?.note || '').slice(0, 200) };
      gameDb.db.transaction(() => {
        gameDb.db.prepare(`
          INSERT INTO custodial_marketplace_orders
            (id, status, seller_player_id, seller_wallet, seller_payout_chain, seller_payout_address,
             asset_chain, asset_id, asset_standard, asset_collection, level,
             price_usdc_units, fee_bps, fee_usdc_units, royalty_bps, royalty_usdc_units, seller_amount_usdc_units,
             payment_chain, payment_token, payment_token_address, payment_decimals, payment_label, payment_treasury,
             vault_chain, vault_address, metadata_json)
          VALUES (?, 'awaiting_deposit', ?, ?, ?, ?, ?, ?, ?, ?, ?,
                  ?, ?, ?, ?, ?, ?, 'base', 'usdc', NULL, 6, 'USDC', NULL, ?, ?, ?)
        `).run(
          id,
          req.player.id,
          sellerWallet,
          payoutChain,
          payoutAddress,
          assetChain,
          assetInfo.asset || assetId,
          assetInfo.standard || null,
          assetInfo.collection || null,
          Number(assetInfo.level || 1),
          priceUnits.toString(),
          config.feeBps,
          fee.toString(),
          config.royaltyBps,
          royalty.toString(),
          sellerAmount.toString(),
          assetChain,
          vault.address,
          JSON.stringify(metadata),
        );
        insertEvent(id, 'listing_created', {
          actorPlayerId: req.player.id,
          data: { assetChain, assetId, sellerWallet, priceUsdcUnits: priceUnits.toString(), marketplaceFeeUsdcUnits: fee.toString(), royaltyUsdcUnits: royalty.toString(), vault: vault.address },
        });
      })();
      res.status(201).json({ success: true, order: publicOrder(getOrder(id), { includePrivate: true }) });
    } catch (err) {
      const code = err?.code || '';
      const msg = code.includes('SQLITE_CONSTRAINT')
        ? 'This NFT already has an active custodial listing'
        : (err?.message || 'listing create failed');
      res.status(err?.status || (code.includes('SQLITE_CONSTRAINT') ? 409 : 500)).json({ error: msg.slice(0, 240) });
    }
  });

  router.post('/marketplace/custodial/listings/:id/deposit', auth, async (req, res) => {
    try {
      const order = getOrder(req.params.id);
      requireOrderSellerForPlayer(order, req.player);
      if (order.status === 'active') return res.json({ success: true, alreadyVerified: true, order: publicOrder(order, { includePrivate: true }) });
      if (order.status !== 'awaiting_deposit') throw httpError(409, `Listing is ${order.status}`);
      const txHash = String(req.body?.txHash || req.body?.txSignature || '').trim() || null;
      const updated = await activateOrderIfVaultOwnsAsset(order, { actorPlayerId: req.player.id, txHash });
      res.json({ success: true, order: publicOrder(updated || getOrder(order.id), { includePrivate: true }) });
    } catch (err) {
      const code = err?.code || '';
      res.status(err?.status || (code.includes('SQLITE_CONSTRAINT') ? 409 : 500)).json({ error: (err?.message || 'deposit verify failed').slice(0, 240) });
    }
  });

  router.post('/marketplace/custodial/listings/:id/cancel', auth, async (req, res) => {
    try {
      let order = getOrder(req.params.id);
      requireOrderSellerForPlayer(order, req.player);
      if (!canCancelStatus(order)) throw httpError(409, `Listing is ${order.status}`);
      if (order.status === 'awaiting_deposit') {
        try {
          const deposited = await activateOrderIfVaultOwnsAsset(order, {
            actorPlayerId: req.player.id,
            eventType: 'deposit_verified_during_cancel',
          });
          if (deposited?.status === 'active') {
            order = deposited;
          } else {
            cancelAwaitingDepositOrder(order, { actorPlayerId: req.player.id });
            return res.json({ success: true, order: publicOrder(getOrder(order.id), { includePrivate: true }) });
          }
        } catch {
          cancelAwaitingDepositOrder(order, { actorPlayerId: req.player.id });
          return res.json({ success: true, order: publicOrder(getOrder(order.id), { includePrivate: true }) });
        }
      }
      const txHash = await transferAssetSameChain(order, order.seller_wallet, ctx);
      gameDb.db.transaction(() => {
        gameDb.db.prepare(`
          UPDATE custodial_marketplace_orders
             SET status = 'cancelled',
                 cancel_tx_hash = ?,
                 cancelled_at = datetime('now'),
                 updated_at = datetime('now')
           WHERE id = ?
        `).run(txHash, order.id);
        insertEvent(order.id, 'cancelled_returned', { actorPlayerId: req.player.id, txHash });
      })();
      const returnedOrder = getOrder(order.id);
      bindMarketplaceAssetToPlayer(returnedOrder, returnedOrder.seller_player_id, returnedOrder.seller_wallet, 'marketplace-cancel-return', txHash);
      res.json({ success: true, order: publicOrder(getOrder(order.id), { includePrivate: true }) });
    } catch (err) {
      res.status(err?.status || 500).json({ error: (err?.message || 'cancel failed').slice(0, 240) });
    }
  });

  router.post('/marketplace/custodial/orders/:id/buy-intent', auth, async (req, res) => {
    try {
      releaseExpiredReservations();
      const config = await marketplaceRuntimeConfig(ctx);
      if (!config.ready) throw httpError(503, 'Custodial marketplace wallets are not configured');
      const paymentChain = normalizeChain(req.body?.paymentChain || req.body?.chain || 'base', 'paymentChain');
      const payment = config.payments[paymentChain];
      if (!payment?.ready) throw httpError(503, `${shortLabel(paymentChain)} payments are not configured`);
      const buyerWallet = normalizeAddressForChain(paymentChain, req.body?.buyerWallet || req.body?.buyer, 'Buyer wallet');
      const destChain = normalizeChain(req.body?.destChain || req.body?.destinationChain || paymentChain, 'destinationChain');
      if (!config.supportedDestinationChains.includes(destChain)) throw httpError(400, 'Unsupported destination chain');
      const destAddress = normalizeAddressForChain(destChain, req.body?.destAddress || req.body?.destinationAddress || buyerWallet, 'Destination wallet');
      const ttlSeconds = Math.max(60, Math.min(300, Number(process.env.CUSTODIAL_MARKETPLACE_PAYMENT_TTL_SECONDS || 300)));
      let clashUsd = null;
      if (paymentChain === 'solana' && String(payment.token || '').toLowerCase() === 'clash') {
        clashUsd = await ctx.fetchNftUsdPrice?.('clash');
      }
      const result = gameDb.db.transaction(() => {
        const order = getOrder(req.params.id);
        if (!order) throw httpError(404, 'Listing not found');
        if (orderSellerMatchesPlayer(order, req.player)) throw httpError(400, 'You cannot buy your own listing');
        const deadline = Number(order.payment_deadline || 0);
        const expiredReservation = order.status === 'reserved' && deadline < nowSec();
        const sameBuyer = order.status === 'reserved'
          && order.buyer_player_id === req.player.id
          && String(order.buyer_wallet || '').toLowerCase() === String(buyerWallet || '').toLowerCase();
        if (order.status !== 'active' && !expiredReservation && !sameBuyer) throw httpError(409, `Listing is ${order.status}`);
        if (sameBuyer && deadline >= nowSec() && order.payment_amount_usdc_units) return order;
        const nonce = `0x${crypto.randomBytes(12).toString('hex')}`;
        const baseAmount = paymentChain === 'solana' && String(payment.token || '').toLowerCase() === 'clash'
          ? usd6ToTokenUnits(order.price_usdc_units, clashUsd, payment.decimals)
          : scaleUsdc6ToDecimals(order.price_usdc_units, payment.decimals);
        const salt = BigInt(crypto.randomInt(1, 1000));
        const amount = baseAmount + salt;
        const nextDeadline = nowSec() + ttlSeconds;
        gameDb.db.prepare(`
          UPDATE custodial_marketplace_orders
             SET status = 'reserved',
                 buyer_player_id = ?,
                 buyer_wallet = ?,
                 buyer_dest_chain = ?,
                 buyer_dest_address = ?,
                 payment_chain = ?,
                 payment_token = ?,
                 payment_token_address = ?,
                 payment_decimals = ?,
                 payment_label = ?,
                 payment_treasury = ?,
                 payment_amount_usdc_units = ?,
                 payment_nonce = ?,
                 payment_deadline = ?,
                 error = NULL,
                 updated_at = datetime('now')
           WHERE id = ?
        `).run(
          req.player.id,
          buyerWallet,
          destChain,
          destAddress,
          paymentChain,
          payment.token || 'usdc',
          payment.tokenAddress,
          payment.decimals,
          payment.tokenLabel || String(payment.token || 'USDC').toUpperCase(),
          payment.treasury,
          amount.toString(),
          nonce,
          nextDeadline,
          order.id,
        );
        insertEvent(order.id, 'buy_intent', {
          actorPlayerId: req.player.id,
          data: {
            buyerWallet,
            paymentChain,
            paymentToken: payment.token || 'usdc',
            paymentLabel: payment.tokenLabel || String(payment.token || 'USDC').toUpperCase(),
            destChain,
            destAddress,
            amountTokenUnits: amount.toString(),
            deadline: nextDeadline,
          },
        });
        return getOrder(order.id);
      })();
      res.set('Cache-Control', 'no-store');
      res.json({ success: true, order: publicOrder(result, { includePrivate: true }) });
    } catch (err) {
      res.status(err?.status || 500).json({ error: (err?.message || 'buy intent failed').slice(0, 240) });
    }
  });

  router.post('/marketplace/custodial/orders/:id/release-reservation', auth, (req, res) => {
    try {
      const order = getOrder(req.params.id);
      requireOrderBuyerForPlayer(order, req.player);
      if (order.status !== 'reserved') {
        return res.json({ success: true, alreadyReleased: true, order: publicOrder(order, { includePrivate: true }) });
      }
      const reason = String(req.body?.reason || 'buyer_released').slice(0, 160);
      gameDb.db.transaction(() => {
        gameDb.db.prepare(`
          UPDATE custodial_marketplace_orders
             SET status = 'active',
                 buyer_player_id = NULL,
                 buyer_wallet = NULL,
                 buyer_dest_chain = NULL,
                 buyer_dest_address = NULL,
                 payment_chain = 'base',
                 payment_token = 'usdc',
                 payment_token_address = NULL,
                 payment_decimals = 6,
                 payment_label = 'USDC',
                 payment_treasury = NULL,
                 payment_amount_usdc_units = NULL,
                 payment_nonce = NULL,
                 payment_deadline = NULL,
                 error = NULL,
                 updated_at = datetime('now')
           WHERE id = ? AND status = 'reserved' AND buyer_player_id = ?
        `).run(order.id, req.player.id);
        insertEvent(order.id, 'reservation_released', {
          actorPlayerId: req.player.id,
          data: { reason, releasedAt: nowSec() },
        });
      })();
      res.set('Cache-Control', 'no-store');
      res.json({ success: true, order: publicOrder(getOrder(order.id), { includePrivate: true }) });
    } catch (err) {
      res.status(err?.status || 500).json({ error: (err?.message || 'release reservation failed').slice(0, 240) });
    }
  });

  router.post('/marketplace/custodial/orders/:id/payment', auth, async (req, res) => {
    try {
      const config = await marketplaceRuntimeConfig(ctx);
      let order = getOrder(req.params.id);
      let recovery = null;
      if (order?.status === 'active') {
        recovery = recoverExpiredReservationPaymentOrder(order, req.player, config);
        if (recovery) order = recovery.order;
      }
      requireOrderBuyerForPlayer(order, req.player);
      if (order.status === 'delivered') {
        let finalOrder = order;
        let payoutError = null;
        if (config.autoPayoutEnabled && !order.payout_tx_hash) {
          const payout = await maybeAutoPayoutBestEffort(order, { ...ctx, config }, req.player.id);
          finalOrder = payout.order;
          payoutError = payout.payoutError;
        }
        return res.json({ success: true, alreadyDelivered: true, payoutError, order: publicOrder(finalOrder, { includePrivate: true }) });
      }
      if (order.status === 'paid') {
        let maybeDelivered = order;
        let deliveryError = null;
        try { maybeDelivered = await maybeAutoDeliver(order, { ...ctx, config }, req.player.id); }
        catch (deliverErr) {
          deliveryError = (deliverErr?.message || 'delivery failed').slice(0, 240);
          gameDb.db.prepare(`UPDATE custodial_marketplace_orders SET error = ?, updated_at = datetime('now') WHERE id = ?`).run(deliveryError, order.id);
          insertEvent(order.id, 'delivery_failed', { actorPlayerId: req.player.id, data: { error: deliveryError } });
          maybeDelivered = getOrder(order.id);
        }
        return res.json({ success: true, alreadyPaid: true, deliveryError, order: publicOrder(maybeDelivered, { includePrivate: true }) });
      }
      if (order.status !== 'reserved') throw httpError(409, `Order is ${order.status}`);
      if (!recovery && Number(order.payment_deadline || 0) < nowSec() - 300) throw httpError(400, 'Payment quote expired');
      const txHash = String(req.body?.txHash || '').trim();
      const duplicate = gameDb.db.prepare(`SELECT id FROM custodial_marketplace_orders WHERE payment_tx_hash = ? AND id != ?`).get(txHash, order.id);
      if (duplicate) throw httpError(409, 'Payment transaction was already used');
      const payment = {
        ...(config.payments[order.payment_chain] || {}),
        chain: order.payment_chain,
        tokenAddress: order.payment_token_address,
        treasury: order.payment_treasury,
        decimals: Number(order.payment_decimals || 6),
      };
      const verified = await verifyPayment({
        payment,
        txHash,
        amount: order.payment_amount_usdc_units,
        expectedFrom: order.buyer_wallet,
      });
      if (recovery && order.payment_deadline && verified.receipt?.blockTime && Number(verified.receipt.blockTime) > Number(order.payment_deadline) + 600) {
        throw httpError(400, 'Payment transaction confirmed after quote expiry');
      }
      gameDb.db.transaction(() => {
        const result = gameDb.db.prepare(`
          UPDATE custodial_marketplace_orders
             SET status = 'paid',
                 buyer_player_id = ?,
                 buyer_wallet = ?,
                 buyer_dest_chain = ?,
                 buyer_dest_address = ?,
                 payment_chain = ?,
                 payment_token = ?,
                 payment_token_address = ?,
                 payment_decimals = ?,
                 payment_label = ?,
                 payment_treasury = ?,
                 payment_amount_usdc_units = ?,
                 payment_tx_hash = ?,
                 payment_verified_at = datetime('now'),
                 metadata_json = ?,
                 updated_at = datetime('now')
           WHERE id = ?
             AND payment_tx_hash IS NULL
             AND delivery_tx_hash IS NULL
             AND status = ?
        `).run(
          order.buyer_player_id,
          order.buyer_wallet,
          order.buyer_dest_chain,
          order.buyer_dest_address,
          order.payment_chain,
          order.payment_token,
          order.payment_token_address,
          Number(order.payment_decimals || 6),
          order.payment_label,
          order.payment_treasury,
          order.payment_amount_usdc_units,
          txHash,
          JSON.stringify({ ...safeJsonParse(order.metadata_json, {}), paymentTransfer: verified.transfer, recoveredExpiredReservation: !!recovery }),
          order.id,
          recovery ? 'active' : 'reserved',
        );
        if (!result.changes) throw httpError(409, recovery ? 'Order changed before payment recovery completed' : 'Order changed before payment verification completed');
        insertEvent(order.id, 'payment_verified', { actorPlayerId: req.player.id, txHash, data: { ...verified.transfer, recoveredExpiredReservation: !!recovery } });
      })();
      const afterPayment = getOrder(order.id);
      let afterDelivery = afterPayment;
      let deliveryError = null;
      try { afterDelivery = await maybeAutoDeliver(afterPayment, { ...ctx, config }, req.player.id); }
      catch (deliverErr) {
        deliveryError = (deliverErr?.message || 'delivery failed').slice(0, 240);
        gameDb.db.prepare(`UPDATE custodial_marketplace_orders SET error = ?, updated_at = datetime('now') WHERE id = ?`).run(deliveryError, order.id);
        insertEvent(order.id, 'delivery_failed', { actorPlayerId: req.player.id, data: { error: deliveryError } });
        afterDelivery = getOrder(order.id);
      }
      res.json({ success: true, deliveryError, order: publicOrder(afterDelivery, { includePrivate: true }) });
    } catch (err) {
      res.status(err?.status || 500).json({ error: (err?.message || 'payment verify failed').slice(0, 240) });
    }
  });

  if (adminAuth) {
    router.get('/admin/marketplace/custodial/stats', adminAuth, (req, res) => {
      try {
        const limit = Math.min(500, Math.max(25, Number(req.query.limit) || 200));
        const toCount = (value) => Number(value || 0);
        const toUnits = (value) => String(value == null ? '0' : value);

        const summary = gameDb.db.prepare(`
          SELECT
            COUNT(*) AS total_orders,
            SUM(CASE WHEN status = 'awaiting_deposit' THEN 1 ELSE 0 END) AS awaiting_deposit,
            SUM(CASE WHEN status = 'active' THEN 1 ELSE 0 END) AS active_listings,
            SUM(CASE WHEN status = 'reserved' THEN 1 ELSE 0 END) AS reserved_orders,
            SUM(CASE WHEN status = 'paid' THEN 1 ELSE 0 END) AS paid_orders,
            SUM(CASE WHEN status = 'delivering' THEN 1 ELSE 0 END) AS delivering_orders,
            SUM(CASE WHEN status = 'delivered' THEN 1 ELSE 0 END) AS delivered_orders,
            SUM(CASE WHEN status = 'cancelled' THEN 1 ELSE 0 END) AS cancelled_orders,
            SUM(CASE WHEN TRIM(COALESCE(error, '')) <> '' THEN 1 ELSE 0 END) AS error_orders,
            SUM(CASE WHEN status IN ('paid', 'delivering') THEN 1 ELSE 0 END) AS settlement_due,
            SUM(CASE WHEN status = 'delivered' AND TRIM(COALESCE(payout_tx_hash, '')) = '' THEN 1 ELSE 0 END) AS payout_due,
            SUM(CASE WHEN datetime(created_at) >= datetime('now', '-24 hours') THEN 1 ELSE 0 END) AS created_24h,
            SUM(CASE WHEN status = 'delivered' AND datetime(COALESCE(delivered_at, updated_at)) >= datetime('now', '-24 hours') THEN 1 ELSE 0 END) AS sales_24h,
            SUM(CASE WHEN TRIM(COALESCE(error, '')) <> '' AND datetime(updated_at) >= datetime('now', '-24 hours') THEN 1 ELSE 0 END) AS errors_24h,
            COALESCE(SUM(CASE WHEN status = 'delivered' THEN CAST(price_usdc_units AS INTEGER) ELSE 0 END), 0) AS sales_volume_usdc_units,
            COALESCE(SUM(CASE WHEN status IN ('awaiting_deposit', 'active', 'reserved', 'paid', 'delivering', 'delivered') THEN CAST(price_usdc_units AS INTEGER) ELSE 0 END), 0) AS gross_volume_usdc_units,
            COALESCE(SUM(CASE WHEN status = 'delivered' THEN CAST(fee_usdc_units AS INTEGER) ELSE 0 END), 0) AS fee_usdc_units,
            COALESCE(SUM(CASE WHEN status = 'delivered' THEN CAST(royalty_usdc_units AS INTEGER) ELSE 0 END), 0) AS royalty_usdc_units,
            COALESCE(SUM(CASE WHEN status = 'delivered' THEN CAST(fee_usdc_units AS INTEGER) + CAST(royalty_usdc_units AS INTEGER) ELSE 0 END), 0) AS project_revenue_usdc_units,
            COALESCE(SUM(CASE WHEN status = 'delivered' THEN CAST(seller_amount_usdc_units AS INTEGER) ELSE 0 END), 0) AS seller_payout_usdc_units,
            COALESCE(SUM(CASE WHEN status = 'delivered' AND TRIM(COALESCE(payout_tx_hash, '')) = '' THEN CAST(seller_amount_usdc_units AS INTEGER) ELSE 0 END), 0) AS payout_due_usdc_units,
            MAX(updated_at) AS latest_at
          FROM custodial_marketplace_orders
        `).get() || {};

        const byStatus = gameDb.db.prepare(`
          SELECT
            COALESCE(status, 'unknown') AS status,
            COUNT(*) AS orders,
            SUM(CASE WHEN status = 'delivered' THEN 1 ELSE 0 END) AS sales,
            SUM(CASE WHEN status IN ('awaiting_deposit', 'active', 'reserved', 'paid', 'delivering') THEN 1 ELSE 0 END) AS open_orders,
            SUM(CASE WHEN TRIM(COALESCE(error, '')) <> '' THEN 1 ELSE 0 END) AS errors,
            COALESCE(SUM(CASE WHEN status = 'delivered' THEN CAST(price_usdc_units AS INTEGER) ELSE 0 END), 0) AS sales_volume_usdc_units,
            COALESCE(SUM(CAST(price_usdc_units AS INTEGER)), 0) AS listed_volume_usdc_units,
            MAX(updated_at) AS latest_at
          FROM custodial_marketplace_orders
          GROUP BY COALESCE(status, 'unknown')
          ORDER BY orders DESC
        `).all();

        const groupRows = (column) => gameDb.db.prepare(`
          SELECT
            COALESCE(${column}, 'unknown') AS chain,
            COUNT(*) AS orders,
            SUM(CASE WHEN status IN ('awaiting_deposit', 'active', 'reserved', 'paid', 'delivering') THEN 1 ELSE 0 END) AS open_orders,
            SUM(CASE WHEN status = 'delivered' THEN 1 ELSE 0 END) AS sales,
            SUM(CASE WHEN TRIM(COALESCE(error, '')) <> '' THEN 1 ELSE 0 END) AS errors,
            COALESCE(SUM(CASE WHEN status = 'delivered' THEN CAST(price_usdc_units AS INTEGER) ELSE 0 END), 0) AS sales_volume_usdc_units,
            COALESCE(SUM(CASE WHEN status IN ('awaiting_deposit', 'active', 'reserved', 'paid', 'delivering', 'delivered') THEN CAST(price_usdc_units AS INTEGER) ELSE 0 END), 0) AS gross_volume_usdc_units,
            MAX(updated_at) AS latest_at
          FROM custodial_marketplace_orders
          GROUP BY COALESCE(${column}, 'unknown')
          ORDER BY orders DESC
        `).all();

        const recentOrders = gameDb.db.prepare(`
          SELECT * FROM custodial_marketplace_orders
          ORDER BY datetime(updated_at) DESC
          LIMIT ?
        `).all(limit);

        const recentErrors = gameDb.db.prepare(`
          SELECT * FROM custodial_marketplace_orders
          WHERE TRIM(COALESCE(error, '')) <> ''
          ORDER BY datetime(updated_at) DESC
          LIMIT ?
        `).all(limit);

        const recentEvents = gameDb.db.prepare(`
          SELECT
            e.id,
            e.order_id,
            e.event_type,
            e.actor_player_id,
            e.tx_hash,
            e.data_json,
            e.created_at,
            o.status,
            o.asset_chain,
            o.asset_id,
            o.payment_chain,
            o.price_usdc_units
          FROM custodial_marketplace_events e
          LEFT JOIN custodial_marketplace_orders o ON o.id = e.order_id
          ORDER BY e.id DESC
          LIMIT ?
        `).all(limit).map((row) => ({
          id: row.id,
          orderId: row.order_id,
          type: row.event_type,
          actorPlayerId: row.actor_player_id,
          txHash: row.tx_hash,
          data: safeJsonParse(row.data_json, {}),
          createdAt: row.created_at,
          order: {
            status: row.status,
            assetChain: row.asset_chain,
            assetId: row.asset_id,
            paymentChain: row.payment_chain,
            priceUsdcUnits: row.price_usdc_units,
          },
        }));

        res.set('Cache-Control', 'no-store');
        res.json({
          summary: {
            totalOrders: toCount(summary.total_orders),
            awaitingDeposit: toCount(summary.awaiting_deposit),
            activeListings: toCount(summary.active_listings),
            reservedOrders: toCount(summary.reserved_orders),
            paidOrders: toCount(summary.paid_orders),
            deliveringOrders: toCount(summary.delivering_orders),
            deliveredOrders: toCount(summary.delivered_orders),
            cancelledOrders: toCount(summary.cancelled_orders),
            errorOrders: toCount(summary.error_orders),
            settlementDue: toCount(summary.settlement_due),
            payoutDue: toCount(summary.payout_due),
            created24h: toCount(summary.created_24h),
            sales24h: toCount(summary.sales_24h),
            errors24h: toCount(summary.errors_24h),
            salesVolumeUsdcUnits: toUnits(summary.sales_volume_usdc_units),
            grossVolumeUsdcUnits: toUnits(summary.gross_volume_usdc_units),
            feeUsdcUnits: toUnits(summary.fee_usdc_units),
            royaltyUsdcUnits: toUnits(summary.royalty_usdc_units),
            projectRevenueUsdcUnits: toUnits(summary.project_revenue_usdc_units),
            sellerPayoutUsdcUnits: toUnits(summary.seller_payout_usdc_units),
            payoutDueUsdcUnits: toUnits(summary.payout_due_usdc_units),
            latestAt: summary.latest_at || null,
          },
          byStatus: byStatus.map((row) => ({
            status: row.status,
            orders: toCount(row.orders),
            openOrders: toCount(row.open_orders),
            sales: toCount(row.sales),
            errors: toCount(row.errors),
            salesVolumeUsdcUnits: toUnits(row.sales_volume_usdc_units),
            listedVolumeUsdcUnits: toUnits(row.listed_volume_usdc_units),
            latestAt: row.latest_at || null,
          })),
          byAssetChain: groupRows('asset_chain').map((row) => ({
            chain: row.chain,
            orders: toCount(row.orders),
            openOrders: toCount(row.open_orders),
            sales: toCount(row.sales),
            errors: toCount(row.errors),
            salesVolumeUsdcUnits: toUnits(row.sales_volume_usdc_units),
            grossVolumeUsdcUnits: toUnits(row.gross_volume_usdc_units),
            latestAt: row.latest_at || null,
          })),
          byPaymentChain: groupRows('payment_chain').map((row) => ({
            chain: row.chain,
            orders: toCount(row.orders),
            openOrders: toCount(row.open_orders),
            sales: toCount(row.sales),
            errors: toCount(row.errors),
            salesVolumeUsdcUnits: toUnits(row.sales_volume_usdc_units),
            grossVolumeUsdcUnits: toUnits(row.gross_volume_usdc_units),
            latestAt: row.latest_at || null,
          })),
          recentOrders: recentOrders.map((r) => publicOrder(r, { includePrivate: true })),
          recentErrors: recentErrors.map((r) => publicOrder(r, { includePrivate: true })),
          recentEvents,
        });
      } catch (err) {
        res.status(err?.status || 500).json({ error: err?.message || 'admin marketplace stats query failed' });
      }
    });

    router.get('/admin/marketplace/custodial/orders', adminAuth, (req, res) => {
      try {
        const status = String(req.query.status || 'all').toLowerCase();
        const limit = Math.min(500, Math.max(1, Number(req.query.limit) || 200));
        const where = status === 'all' ? '' : 'WHERE status = ?';
        const params = status === 'all' ? [] : [status];
        const rows = gameDb.db.prepare(`
          SELECT * FROM custodial_marketplace_orders
          ${where}
          ORDER BY updated_at DESC
          LIMIT ?
        `).all(...params, limit);
        res.set('Cache-Control', 'no-store');
        res.json({ orders: rows.map((r) => ({ ...publicOrder(r, { includePrivate: true }), events: listEvents(r.id) })) });
      } catch (err) {
        res.status(err?.status || 500).json({ error: err?.message || 'admin orders query failed' });
      }
    });

    router.post('/admin/marketplace/custodial/orders/:id/settle', adminAuth, async (req, res) => {
      try {
        const config = await marketplaceRuntimeConfig(ctx);
        const order = getOrder(req.params.id);
        if (!order) throw httpError(404, 'Order not found');
        if (order.status !== 'paid' && order.status !== 'delivering') throw httpError(409, `Order is ${order.status}`);
        let txHash = String(req.body?.deliveryTxHash || '').trim();
        if (!txHash && String(req.body?.mode || '').toLowerCase() === 'auto') {
          const delivered = await maybeAutoDeliver(order, { ...ctx, config }, null);
          return res.json({ success: true, order: publicOrder(delivered, { includePrivate: true }) });
        }
        if (!txHash) throw httpError(400, 'deliveryTxHash required or mode=auto');
        gameDb.db.transaction(() => {
          gameDb.db.prepare(`
            UPDATE custodial_marketplace_orders
               SET status = 'delivered',
                   delivery_tx_hash = ?,
                   delivered_at = datetime('now'),
                   error = NULL,
                   updated_at = datetime('now')
             WHERE id = ?
          `).run(txHash, order.id);
          insertEvent(order.id, 'delivered', { txHash, data: { mode: 'manual' } });
        })();
        let after = getOrder(order.id);
        rememberBuyerDeliveryWallet(after);
        let payoutError = null;
        if (config.autoPayoutEnabled && !after.payout_tx_hash) {
          const payout = await maybeAutoPayoutBestEffort(after, { ...ctx, config }, null);
          after = payout.order;
          payoutError = payout.payoutError;
        }
        res.json({ success: true, payoutError, order: publicOrder(after, { includePrivate: true }) });
      } catch (err) {
        res.status(err?.status || 500).json({ error: (err?.message || 'settle failed').slice(0, 240) });
      }
    });

    router.post('/admin/marketplace/custodial/orders/:id/payout', adminAuth, async (req, res) => {
      try {
        const config = await marketplaceRuntimeConfig(ctx);
        const order = getOrder(req.params.id);
        if (!order) throw httpError(404, 'Order not found');
        if (order.status !== 'delivered') throw httpError(409, `Order is ${order.status}`);
        let txHash = String(req.body?.payoutTxHash || '').trim();
        if (!txHash && String(req.body?.mode || '').toLowerCase() === 'auto') {
          const after = await maybeAutoPayout(order, { ...ctx, config }, null);
          return res.json({ success: true, order: publicOrder(after, { includePrivate: true }) });
        }
        if (!txHash) throw httpError(400, 'payoutTxHash required or mode=auto');
        gameDb.db.transaction(() => {
          gameDb.db.prepare(`
            UPDATE custodial_marketplace_orders
               SET payout_tx_hash = ?,
                   paid_out_at = datetime('now'),
                   error = NULL,
                   updated_at = datetime('now')
             WHERE id = ?
          `).run(txHash, order.id);
          insertEvent(order.id, 'seller_paid', { txHash, data: { mode: 'manual' } });
        })();
        res.json({ success: true, order: publicOrder(getOrder(order.id), { includePrivate: true }) });
      } catch (err) {
        res.status(err?.status || 500).json({ error: (err?.message || 'payout failed').slice(0, 240) });
      }
    });
  }
}

module.exports = {
  mountCustodialMarketplace,
  marketplaceRuntimeConfig,
};
