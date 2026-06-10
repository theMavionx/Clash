// V3 NFT endpoints (upgrade quotes, bridge orchestration).
//
// Adds on top of the existing routes.js (mint quotes, supply gate, metadata).
// Imported by routes.js via `mountNftV3Endpoints(router, ctx)` near the bottom
// of the file. Kept in a separate module to avoid bloating routes.js further.
//
// Endpoints exposed:
//   POST /nft/upgrade/quote      — sign EIP-712 quote for L1→L2 or L2→L3
//   POST /bridge/init             — record bridge intent, return burn tx
//   POST /bridge/confirm          — verify source burn, return EIP-712 receipt
//   GET  /nft/state/:chain/:id    — aggregated view (owner, level, listing)
//   GET  /marketplace/listings    — paginated active listings from indexer
//
// All write endpoints are rate-limited and require buyer == on-chain owner.

const crypto = require('crypto');
const path = require('path');
const fs = require('fs');
const gameDb = require('./db');
const {
  createSolanaConnection,
  solanaNonHeliusRpcUrls,
  solanaRpcUrls,
  withSolanaRpcFallback,
} = require('./solana_rpc');

const NFT_ROOT = path.resolve(__dirname, '..', 'nft');
const {
  deploymentOf: bridgeHelperDeploymentOf,
  getSolanaBridgeAssetInfo: bridgeHelperGetSolanaBridgeAssetInfo,
  normalizeBridgeCollectionSlug: normalizeBridgeCollectionSlugValue,
} = require('./bridge_helpers');
const deploymentOf = bridgeHelperDeploymentOf;
const normalizeBridgeCollectionSlug = normalizeBridgeCollectionSlugValue;

// 30s in-memory cache for /nft/owned/:chain/:address results. The bridge
// wizard polls this endpoint each time the player flips source chains and
// re-mounts step 1; without a cache that's 5+ multicall round-trips per
// wallet inspection, and public Base RPC rate-limits us into failure.
// Module-scoped so the cache survives multiple mount calls.
const _ownedNftCache = new Map();

// In-memory rate limit per IP. Production should swap for redis or
// rate-limiter-flexible.
function makeRateLimiter(maxPerMinute) {
  const buckets = new Map();
  return (key) => {
    const now = Date.now();
    const arr = (buckets.get(key) || []).filter((t) => now - t < 60_000);
    if (arr.length >= maxPerMinute) {
      return { ok: false, retryAfterSec: 60 - Math.floor((now - arr[0]) / 1000) };
    }
    arr.push(now);
    buckets.set(key, arr);
    return { ok: true };
  };
}

function readJsonIfExists(p) {
  try { return fs.existsSync(p) ? JSON.parse(fs.readFileSync(p, 'utf8')) : null; }
  catch { return null; }
}

function solanaCoreAssetWasMigrated(assetId) {
  const migration = readJsonIfExists(path.join(NFT_ROOT, 'deployments', 'solana-token2022-migration-mainnet.json')) || {};
  const entries = Array.isArray(migration.entries) ? migration.entries : [];
  const wanted = String(assetId || '');
  return !!wanted && entries.some((entry) => String(entry.oldAsset || entry.asset || '') === wanted);
}

function normalizeNftLevel(level) {
  const n = Number(level);
  return [1, 2, 3].includes(n) ? n : 1;
}

function upgradeUsdPriceE6(chainKey, payment, deployment = {}) {
  const envPrefix = `NFT_${String(chainKey || '').toUpperCase()}`;
  if (payment === 'cop') {
    return BigInt(
      process.env.NFT_UPGRADE_COP_USD_PRICE_E6
      || process.env[`${envPrefix}_CLASH_USD_PRICE_E6`]
      || process.env.NFT_BASE_CLASH_USD_PRICE_E6
      || deployment.clashUsdPriceE6
      || '5000000'
    );
  }
  return BigInt(
    process.env.NFT_UPGRADE_USD_PRICE_E6
    || process.env[`${envPrefix}_USD_PRICE_E6`]
    || deployment.baseUsdPriceE6
    || '8900000'
  );
}

function playerFromUpgradeRequest(req) {
  const token = String(
    req.get?.('x-token')
    || req.get?.('x-player-token')
    || req.body?.playerToken
    || req.body?.token
    || ''
  ).trim();
  if (!token) return null;
  try { return gameDb.stmts.getPlayerByToken.get(token) || null; } catch { return null; }
}

function nftLevelImageUrl(level, id = null) {
  const base = String(process.env.NFT_IMAGE_BASE_URL || '/cdn/nft').replace(/\/+$/, '');
  const lvl = 1;
  if (process.env.NFT_USE_TOKEN_IMAGE_PATHS === '1' && id != null && id !== '') {
    return `${base}/${lvl}/${encodeURIComponent(String(id))}.jpg`;
  }
  return `${base}/${lvl}/default.jpg`;
}

function demonKingTokenId(token) {
  return String(token?.tokenId || token?.tokenAddress || token?.assetId || token?.asset || token?.mint || token?.id || '').trim();
}

function demonKingRarityForToken(chainKey, token) {
  const tokenId = demonKingTokenId(token);
  const legacyLevel = normalizeNftLevel(token?.level || token?.legacyLevel || 1);
  const row = tokenId
    ? gameDb.getNftRarity?.('demon_king', chainKey, tokenId, { legacyLevel })
    : null;
  const fallback = legacyLevel > 1 ? 'legendary' : null;
  const rarity = gameDb.normalizeNftRarity?.(row?.rarity || token?.rarity) || fallback;
  return {
    rarity,
    rarityLabel: rarity ? gameDb.NFT_RARITY_LABELS?.[rarity] || rarity : 'Unrevealed',
    legacyLevel,
    rarityRevealedAt: row?.revealedAt || null,
  };
}

function demonKingRarityLabelForTokenId(chainKey, tokenId, legacyLevel = 1) {
  const row = tokenId
    ? gameDb.getNftRarity?.('demon_king', chainKey, String(tokenId), { legacyLevel })
    : null;
  const rarity = gameDb.normalizeNftRarity?.(row?.rarity) || null;
  return rarity ? gameDb.NFT_RARITY_LABELS?.[rarity] || rarity : 'Unrevealed';
}

function demonKingBridgeSourceTokenId(sourceChain, burned = {}) {
  if (sourceChain === 'solana') return burned.asset || null;
  if (sourceChain === 'aptos') return burned.tokenIndex || burned.tokenAddress || null;
  return burned.tokenId || null;
}

function demonKingBridgeSourceRarity(collectionSlug, sourceChain, burned = {}) {
  if (collectionSlug !== 'demonking') return null;
  const sourceTokenId = demonKingBridgeSourceTokenId(sourceChain, burned);
  return demonKingRarityForToken(sourceChain, {
    tokenId: sourceTokenId,
    tokenAddress: burned.tokenAddress,
    tokenIndex: burned.tokenIndex,
    asset: burned.asset,
    level: burned.level,
  });
}

function preserveDemonKingBridgeRarity({
  collectionSlug,
  sourceChain,
  destChain,
  burned = {},
  destTokenIds = [],
  destOwner = null,
  sourceRef = null,
  destTx = null,
} = {}) {
  if (collectionSlug !== 'demonking') return [];
  const sourceTokenId = demonKingBridgeSourceTokenId(sourceChain, burned);
  const sourceRarity = demonKingBridgeSourceRarity(collectionSlug, sourceChain, burned);
  if (!sourceRarity?.rarity) return [];
  const uniqueDestIds = [...new Set((destTokenIds || []).map((id) => String(id || '').trim()).filter(Boolean))];
  const saved = [];
  for (const tokenId of uniqueDestIds) {
    const row = gameDb.upsertNftRarity?.({
      collection: 'demon_king',
      chain: destChain,
      tokenId,
      rarity: sourceRarity.rarity,
      legacyLevel: sourceRarity.legacyLevel || burned.level || 1,
      ownerWallet: destOwner || null,
      source: 'bridge-preserve',
      metadata: {
        sourceChain,
        sourceTokenId,
        sourceRef,
        destTx,
        destChain,
        destTokenId: tokenId,
      },
    });
    if (row) saved.push(row);
  }
  return saved;
}

function aptosMintedEventFromTx(tx) {
  const events = Array.isArray(tx?.events) ? tx.events : [];
  return events.find((event) => (
    /::demon_king::MintedEvent$/i.test(String(event?.type || ''))
    || (event?.data?.token_index != null && event?.data?.token_address)
  )) || null;
}

function evmMintedTokenIdFromReceipt(receipt, contractAddress, recipientAddress) {
  const transferTopic = '0xddf252ad1be2c89b69c2b068fc378daa952ba7f163c4a11628f55a4df523b3ef';
  const zeroTopic = `0x${'0'.repeat(64)}`;
  const contract = String(contractAddress || '').toLowerCase();
  const recipient = String(recipientAddress || '').toLowerCase().replace(/^0x/, '');
  if (!contract || !/^[0-9a-f]{40}$/.test(recipient)) return null;
  const recipientTopic = `0x${recipient.padStart(64, '0')}`;
  const logs = Array.isArray(receipt?.logs) ? receipt.logs : [];
  const mintLog = logs.find((log) => (
    String(log?.address || '').toLowerCase() === contract
    && String(log?.topics?.[0] || '').toLowerCase() === transferTopic
    && String(log?.topics?.[1] || '').toLowerCase() === zeroTopic
    && String(log?.topics?.[2] || '').toLowerCase() === recipientTopic
  ));
  try {
    return mintLog?.topics?.[3] ? BigInt(mintLog.topics[3]).toString() : null;
  } catch {
    return null;
  }
}

function solanaRoyaltyPlugin(publicKey, deployment = {}) {
  const treasury = process.env.NFT_SOLANA_FEE_RECIPIENT
    || process.env.NFT_SOLANA_ROYALTY_TREASURY
    || process.env.NFT_SOLANA_TREASURY
    || deployment.royaltyTreasury
    || deployment.treasury
    || '';
  const basisPoints = Number(
    process.env.NFT_SOLANA_SELLER_FEE_BASIS_POINTS
    || process.env.NFT_SOLANA_ROYALTY_BPS
    || process.env.NFT_SELLER_FEE_BASIS_POINTS
    || deployment.royaltyBps
    || 250
  );
  if (!treasury || !Number.isFinite(basisPoints) || basisPoints <= 0) return null;
  return {
    type: 'Royalties',
    basisPoints,
    creators: [{ address: publicKey(treasury), percentage: 100 }],
    ruleSet: { type: 'None' },
  };
}

function decorateDemonKingOwnedBody(body, chainKey) {
  if (!body || !Array.isArray(body.tokens)) return body;
  return {
    ...body,
    tokens: body.tokens.map((token) => {
      const rarity = demonKingRarityForToken(chainKey || token?.chain || body.chain, token);
      return {
        ...token,
        level: rarity.legacyLevel,
        legacyLevel: rarity.legacyLevel,
        rarity: rarity.rarity,
        rarityLabel: rarity.rarityLabel,
        rarityRevealedAt: rarity.rarityRevealedAt,
        imageUrl: nftLevelImageUrl(1, demonKingTokenId(token) || token?.imageUrl || 'demon-king'),
      };
    }),
  };
}

function demonKingDisplayIdFromText(value) {
  const text = String(value || '').trim();
  if (!text) return '';
  const hashMatch = text.match(/#\s*(\d{1,10})\b/);
  if (hashMatch) return hashMatch[1];
  const namedMatch = text.match(/\b(?:demon\s*king|king)\s+(?:no\.?\s*)?#?\s*(\d{1,10})\b/i);
  if (namedMatch) return namedMatch[1];
  const fieldMatch = text.match(/\b(?:token|id|index|serial|number)[\s:_-]*#?\s*(\d{1,10})\b/i);
  if (fieldMatch) return fieldMatch[1];
  const uriMatch = text.match(/\/api\/nft\/(?:base|arbitrum|monad|ink|aptos|solana)\/(?:token2022\/)?(\d{1,10})(?:[/?#]|$)/i);
  return uriMatch ? uriMatch[1] : '';
}

function parseMaybeJsonObject(value) {
  if (!value) return {};
  if (typeof value === 'object') return value;
  try {
    const parsed = JSON.parse(String(value));
    return parsed && typeof parsed === 'object' ? parsed : {};
  } catch {
    return {};
  }
}

function timeoutPromise(promise, ms, label) {
  let timer = null;
  const timeout = new Promise((_, reject) => {
    timer = setTimeout(() => reject(new Error(`${label} timed out`)), ms);
  });
  return Promise.race([promise, timeout]).finally(() => {
    if (timer) clearTimeout(timer);
  });
}

function solanaOwnedRpcUrls() {
  return solanaNonHeliusRpcUrls(solanaRpcUrls());
}

const MPL_CORE_PROGRAM_ID = 'CoREENxT6tW1HoK8ypY1SxRMZTcVPm7R94rH4PZNhX7d';

function publicKeyText(value) {
  if (!value) return '';
  if (typeof value === 'string') return value;
  if (typeof value.toString === 'function' && value.toString !== Object.prototype.toString) return value.toString();
  if (typeof value.toBase58 === 'function') return value.toBase58();
  return '';
}

function solanaCoreAssetId(asset) {
  return publicKeyText(asset?.publicKey || asset?.address || asset?.id);
}

function solanaCoreAssetCollection(asset) {
  const grouping = Array.isArray(asset?.grouping) ? asset.grouping : [];
  const group = grouping.find((row) => String(row?.group_key || row?.key || '').toLowerCase() === 'collection');
  const groupValue = publicKeyText(group?.group_value || group?.value);
  if (/^[1-9A-HJ-NP-Za-km-z]{32,44}$/.test(groupValue)) return groupValue;
  const ua = asset?.updateAuthority;
  if (ua?.type === 'Collection') return publicKeyText(ua.address);
  if (ua?.__kind === 'Collection') return publicKeyText(ua.fields?.[0]);
  for (const candidate of [asset?.collection?.publicKey, asset?.collection?.address, asset?.collection, asset?.collectionAddress]) {
    const text = publicKeyText(candidate);
    if (/^[1-9A-HJ-NP-Za-km-z]{32,44}$/.test(text)) return text;
  }
  return '';
}

function solanaCoreAssetLevel(asset) {
  const attrs = [
    asset?.attributes?.attributeList,
    asset?.plugins?.attributes?.attributeList,
    asset?.content?.metadata?.attributes,
    asset?.content?.metadata?.properties?.attributes,
  ].filter(Array.isArray).flat();
  const levelAttr = attrs.find((row) => String(row?.key || row?.trait_type || '').toLowerCase() === 'level');
  const level = Number(levelAttr?.value);
  if ([1, 2, 3].includes(level)) return level;
  const text = `${asset?.name || ''} ${asset?.uri || ''} ${asset?.content?.metadata?.name || ''} ${asset?.content?.json_uri || ''}`;
  const nameLevel = text.match(/\bL(?:evel)?\s*([123])\b/i);
  if (nameLevel) return Number(nameLevel[1]);
  return normalizeNftLevel(level || 1);
}

function solanaCoreAssetToken(asset) {
  const assetId = solanaCoreAssetId(asset);
  const level = solanaCoreAssetLevel(asset);
  const imageUrl = String(
    asset?.content?.links?.image
    || asset?.content?.files?.find?.((file) => String(file?.mime || file?.type || '').startsWith('image/') || file?.uri)?.uri
    || ''
  );
  const uri = asset?.uri || asset?.content?.json_uri || asset?.content?.metadata?.uri || '';
  return {
    asset: assetId,
    mint: assetId,
    tokenId: assetId,
    level,
    name: asset?.name || asset?.content?.metadata?.name || `Demon King L${level}`,
    imageUrl: imageUrl || nftLevelImageUrl(level, assetId),
    uri,
    chain: 'solana',
    standard: 'mpl-core',
  };
}

function solanaCoreAssetLooksRelevant(asset, collection) {
  if (solanaCoreAssetCollection(asset) === collection) return true;
  const name = String(asset?.name || asset?.content?.metadata?.name || '').toLowerCase();
  const uri = String(asset?.uri || asset?.content?.json_uri || asset?.content?.metadata?.uri || '').toLowerCase();
  const attrs = [
    asset?.attributes?.attributeList,
    asset?.plugins?.attributes?.attributeList,
    asset?.content?.metadata?.attributes,
    asset?.content?.metadata?.properties?.attributes,
  ].filter(Array.isArray).flat();
  return (name.includes('demon king') && uri.includes('/api/nft/solana/'))
    || attrs.some((attr) => String(attr?.key || attr?.trait_type || '').toLowerCase() === 'sourceref');
}

async function solanaDasRpc(url, method, params, timeoutMs = 10_000) {
  const response = await timeoutPromise(fetch(url, {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify({ jsonrpc: '2.0', id: 1, method, params }),
  }), timeoutMs, `Solana DAS ${method}`);
  const text = await response.text();
  let json = null;
  try { json = text ? JSON.parse(text) : null; } catch {}
  if (!response.ok || !json || json.error) {
    const msg = json?.error?.message || text || `HTTP ${response.status}`;
    throw new Error(`Solana DAS ${method} failed: ${String(msg).slice(0, 240)}`);
  }
  return json.result;
}

function solanaDasToken2022LooksRelevant(asset) {
  if (asset?.interface === 'MplCoreAsset') return false;
  const name = String(asset?.content?.metadata?.name || asset?.name || '').toLowerCase();
  const uri = String(asset?.content?.json_uri || asset?.uri || asset?.content?.metadata?.uri || '').toLowerCase();
  const attrs = [
    asset?.content?.metadata?.attributes,
    asset?.content?.metadata?.properties?.attributes,
  ].filter(Array.isArray).flat();
  return name.includes('demon king')
    && (
      uri.includes('/api/nft/solana/token2022/')
      || uri.includes('/api/nft/solana/')
      || attrs.some((attr) => String(attr?.value || '').toLowerCase().includes('demon-king-token2022'))
    );
}

function solanaDasToken2022Token(asset) {
  const mint = String(asset?.id || '');
  const level = solanaCoreAssetLevel(asset);
  const imageUrl = String(
    asset?.content?.links?.image
    || asset?.content?.files?.find?.((file) => String(file?.mime || file?.type || '').startsWith('image/') || file?.uri)?.uri
    || ''
  );
  return {
    asset: mint,
    mint,
    tokenId: mint,
    level,
    name: asset?.content?.metadata?.name || `Demon King L${level}`,
    imageUrl: imageUrl || nftLevelImageUrl(level, mint),
    uri: asset?.content?.json_uri || asset?.uri || '',
    chain: 'solana',
    standard: 'token2022',
  };
}

async function listOwnedSolanaDemonKingNftsFromDas(ownerRaw, collection) {
  let lastErr = null;
  for (const rpc of solanaRpcUrls()) {
    try {
      const tokens = [];
      let page = 1;
      while (page <= 5) {
        const result = await solanaDasRpc(rpc, 'getAssetsByOwner', {
          ownerAddress: ownerRaw,
          page,
          limit: 1000,
          displayOptions: {
            showCollectionMetadata: true,
            showFungible: false,
            showNativeBalance: false,
            showUnverifiedCollections: true,
          },
        });
        const items = Array.isArray(result?.items) ? result.items : [];
        for (const asset of items) {
          if (publicKeyText(asset?.ownership?.owner) !== ownerRaw) continue;
          let token = null;
          if (asset?.interface === 'MplCoreAsset') {
            const assetId = solanaCoreAssetId(asset);
            if (!assetId || solanaCoreAssetWasMigrated(assetId)) continue;
            if (!solanaCoreAssetLooksRelevant(asset, collection)) continue;
            token = solanaCoreAssetToken(asset);
          } else if (solanaDasToken2022LooksRelevant(asset)) {
            token = solanaDasToken2022Token(asset);
          }
          if (!token) continue;
          try {
            const info = await bridgeHelperGetSolanaBridgeAssetInfo(token.tokenId || token.asset || token.mint, ownerRaw);
            tokens.push({
              ...token,
              standard: info.standard || token.standard,
              tokenAccount: info.tokenAccount || token.tokenAccount,
              level: normalizeNftLevel(info.level || token.level),
              collection: info.collection || token.collection,
              legacyCollectionless: info.legacyCollectionless || undefined,
            });
          } catch {
            // DAS can keep stale burned/migrated Solana assets visible for a
            // while. If the bridge verifier cannot read and validate it, the
            // marketplace cannot list it, so keep it out of the owned list.
          }
        }
        const total = Number(result?.total) || items.length;
        if (items.length < 1000 || page * 1000 >= total) break;
        page += 1;
      }
      return {
        chain: 'solana',
        owner: ownerRaw,
        collection,
        total: tokens.length,
        tokens,
        source: 'server-solana-das',
      };
    } catch (err) {
      lastErr = err;
    }
  }
  if (lastErr) throw lastErr;
  return null;
}

async function listOwnedSolanaCoreNftsFromRecentMints(ownerRaw, collection) {
  const [{ Connection, PublicKey }, { createUmi }, { mplCore, fetchAsset }, { publicKey }] = await Promise.all([
    import('@solana/web3.js'),
    import('@metaplex-foundation/umi-bundle-defaults'),
    import('@metaplex-foundation/mpl-core'),
    import('@metaplex-foundation/umi'),
  ]);
  const ownerPk = new PublicKey(ownerRaw);
  let lastErr = null;
  for (const rpc of solanaOwnedRpcUrls()) {
    try {
      const conn = createSolanaConnection(Connection, rpc, 'confirmed');
      const signatures = await timeoutPromise(
        conn.getSignaturesForAddress(ownerPk, { limit: 15 }, 'confirmed'),
        6_000,
        'Solana recent signature scan',
      );
      const parsedRows = await timeoutPromise(Promise.allSettled(signatures.map((row) => (
        conn.getParsedTransaction(row.signature, {
          commitment: 'confirmed',
          maxSupportedTransactionVersion: 0,
        })
      ))), 10_000, 'Solana recent mint tx scan');

      const candidateAssets = new Set();
      for (const row of parsedRows) {
        const tx = row.status === 'fulfilled' ? row.value : null;
        if (!tx || tx.meta?.err) continue;
        const logs = tx.meta?.logMessages || [];
        if (!logs.some((line) => /Instruction: MintV1|Instruction: MintAsset/i.test(String(line)))) continue;
        const topIxs = tx.transaction?.message?.instructions || [];
        const innerIxs = (tx.meta?.innerInstructions || [])
          .flatMap((set) => (set.instructions || []));
        for (const ix of topIxs.concat(innerIxs)) {
          const info = ix?.parsed?.info || {};
          if (ix?.parsed?.type !== 'createAccount') continue;
          if (String(info.owner || '') !== MPL_CORE_PROGRAM_ID) continue;
          const asset = String(info.newAccount || '');
          if (/^[1-9A-HJ-NP-Za-km-z]{32,44}$/.test(asset)) candidateAssets.add(asset);
        }
      }
      if (!candidateAssets.size) return null;

      const umi = createUmi(rpc).use(mplCore());
      const settled = await timeoutPromise(Promise.allSettled([...candidateAssets].map(async (assetId) => {
        const asset = await fetchAsset(umi, publicKey(assetId));
        if (publicKeyText(asset?.owner) !== ownerRaw) return null;
        if (solanaCoreAssetWasMigrated(assetId)) return null;
        if (!solanaCoreAssetLooksRelevant(asset, collection)) return null;
        return solanaCoreAssetToken(asset);
      })), 8_000, 'Solana recent Core asset fetch');
      const tokens = settled
        .filter((row) => row.status === 'fulfilled' && row.value)
        .map((row) => row.value);
      return {
        chain: 'solana',
        owner: ownerRaw,
        collection,
        total: tokens.length,
        tokens,
        source: 'server-solana-recent-core',
      };
    } catch (err) {
      lastErr = err;
    }
  }
  if (lastErr) throw lastErr;
  return null;
}

async function listOwnedSolanaToken2022Nfts(ownerRaw) {
  const { Connection, PublicKey } = require('@solana/web3.js');
  const {
    TOKEN_2022_PROGRAM_ID,
    getTokenMetadata,
  } = require('@solana/spl-token');
  const {
    solanaToken2022CollectionId,
    token2022LooksLikeDemonKing,
    levelFromToken2022Metadata,
  } = require('./solana_token2022_nft');

  const ownerPk = new PublicKey(ownerRaw);
  let lastErr = null;
  for (const rpc of solanaOwnedRpcUrls()) {
    try {
      const conn = createSolanaConnection(Connection, rpc, 'confirmed');
      const rows = await timeoutPromise(
        conn.getParsedTokenAccountsByOwner(ownerPk, { programId: TOKEN_2022_PROGRAM_ID }, 'confirmed'),
        8_000,
        'Solana Token-2022 owner scan',
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
      )).slice(0, 60);

      const settled = await timeoutPromise(Promise.allSettled(candidates.map(async (candidate) => {
        const mintPk = new PublicKey(candidate.mint);
        const meta = await getTokenMetadata(conn, mintPk, 'confirmed', TOKEN_2022_PROGRAM_ID).catch(() => null);
        if (!token2022LooksLikeDemonKing(meta)) return null;
        const level = normalizeNftLevel(levelFromToken2022Metadata(meta));
        return {
          asset: candidate.mint,
          mint: candidate.mint,
          tokenAccount: candidate.tokenAccount,
          level,
          name: meta?.name || `Demon King L${level}`,
          imageUrl: nftLevelImageUrl(level, candidate.mint),
          chain: 'solana',
          standard: 'token2022',
        };
      })), 10_000, 'Solana Token-2022 metadata scan');

      const tokens = settled
        .filter((row) => row.status === 'fulfilled' && row.value)
        .map((row) => row.value);
      return {
        chain: 'solana',
        owner: ownerRaw,
        collection: solanaToken2022CollectionId(),
        total: tokens.length,
        tokens,
        source: 'server-solana-token2022',
      };
    } catch (err) {
      lastErr = err;
    }
  }
  if (lastErr) throw lastErr;
  return {
    chain: 'solana',
    owner: ownerRaw,
    collection: 'demon-king-token2022-v1',
    total: 0,
    tokens: [],
    source: 'server-solana-token2022',
  };
}

function v3Deployment(chainKey) {
  return readJsonIfExists(path.join(NFT_ROOT, 'deployments', `${chainKey}-v3-mainnet.json`));
}

const SUPPORTED_EVM_CHAINS = {
  base:     { chainId: 8453,  defaultRpc: 'https://mainnet.base.org',     domainName: 'DemonKingBase'     },
  arbitrum: { chainId: 42161, defaultRpc: 'https://arb1.arbitrum.io/rpc', domainName: 'DemonKingArbitrum' },
  monad:    { chainId: 143,   defaultRpc: 'https://rpc.monad.xyz',        domainName: 'DemonKingMonad'    },
  ink:      { chainId: 57073, defaultRpc: 'https://rpc-gel.inkonchain.com', domainName: 'DemonKingInk'      },
};

const NFT_V3_ABI = [
  { name: 'ownerOf', type: 'function', stateMutability: 'view',
    inputs: [{ type: 'uint256' }], outputs: [{ type: 'address' }] },
  { name: 'tokenLevel', type: 'function', stateMutability: 'view',
    inputs: [{ type: 'uint256' }], outputs: [{ type: 'uint8' }] },
  { name: 'getLevel', type: 'function', stateMutability: 'view',
    inputs: [{ type: 'uint256' }], outputs: [{ type: 'uint8' }] },
  { name: 'usedBridgeRefs', type: 'function', stateMutability: 'view',
    inputs: [{ type: 'bytes32' }], outputs: [{ type: 'bool' }] },
  { name: 'paused', type: 'function', stateMutability: 'view',
    inputs: [], outputs: [{ type: 'bool' }] },
  { name: 'quoteSigner', type: 'function', stateMutability: 'view',
    inputs: [], outputs: [{ type: 'address' }] },
  { name: 'bridgeFeeWei', type: 'function', stateMutability: 'view',
    inputs: [], outputs: [{ type: 'uint256' }] },
];

function evmRpc(chainKey, env) {
  const spec = SUPPORTED_EVM_CHAINS[chainKey];
  if (!spec) return null;
  return env[`NFT_${chainKey.toUpperCase()}_RPC_URL`]
    || env[`${chainKey.toUpperCase()}_RPC_URL`]
    || spec.defaultRpc;
}

function evmViemChain(chainKey, defineChain, viemChains) {
  if (chainKey === 'base') return viemChains.base;
  if (chainKey === 'arbitrum') return viemChains.arbitrum;
  if (chainKey === 'ink') {
    return defineChain({
      id: 57073,
      name: 'Ink',
      nativeCurrency: { name: 'ETH', symbol: 'ETH', decimals: 18 },
      rpcUrls: { default: { http: ['https://rpc-gel.inkonchain.com'] } },
      blockExplorers: { default: { name: 'Ink Explorer', url: 'https://explorer.inkonchain.com' } },
      contracts: { multicall3: { address: '0xcA11bde05977b3631167028862bE2a173976CA11' } },
    });
  }
  return defineChain({
    id: 143,
    name: 'Monad',
    nativeCurrency: { name: 'Monad', symbol: 'MON', decimals: 18 },
    rpcUrls: { default: { http: ['https://rpc.monad.xyz'] } },
    contracts: { multicall3: { address: '0xcA11bde05977b3631167028862bE2a173976CA11' } },
  });
}

const DEMON_KING_EVM_CHAINS = ['base', 'arbitrum', 'monad', 'ink'];
const DEMON_KING_SYNC_CHAINS = [...DEMON_KING_EVM_CHAINS, 'solana', 'aptos'];
const DEMON_KING_SYNC_DB_TTL_MS = Math.max(
  30_000,
  Number(process.env.NFT_DEMON_KING_SYNC_TTL_MS || 15 * 60_000)
);
const DEMON_KING_OWNED_MEMORY_TTL_MS = Math.max(
  15_000,
  Number(process.env.NFT_DEMON_KING_OWNED_MEMORY_TTL_MS || 2 * 60_000)
);
const EVM_OWNER_SCAN_CHUNK_SIZE = Math.max(
  5,
  Math.min(40, Number(process.env.NFT_EVM_OWNER_SCAN_CHUNK_SIZE || 24))
);
const _demonKingSyncInflight = new Map();

function normalizeDemonKingSyncChains(value) {
  const rows = Array.isArray(value) ? value : String(value || '').split(',');
  const chains = rows
    .map((chain) => String(chain || '').trim().toLowerCase())
    .filter((chain) => DEMON_KING_SYNC_CHAINS.includes(chain));
  return [...new Set(chains.length ? chains : DEMON_KING_SYNC_CHAINS)];
}

function sqliteTimeMs(value) {
  if (!value) return 0;
  const normalized = String(value).includes('T') ? String(value) : `${value}Z`.replace(' ', 'T');
  const ms = Date.parse(normalized);
  return Number.isFinite(ms) ? ms : 0;
}

function walletCheckCovers(check, requestedChains) {
  if (!check?.checkedAt) return false;
  if (Date.now() - sqliteTimeMs(check.checkedAt) > DEMON_KING_SYNC_DB_TTL_MS) return false;
  const checkedChains = new Set(Array.isArray(check.chains) ? check.chains : []);
  return requestedChains.every((chain) => checkedChains.has(chain));
}

function playerLinkedEvmWallets(player, getAddress) {
  return [
    player?.wallet,
    player?.nft_gold_boost_wallet,
  ].filter((wallet) => /^0x[0-9a-fA-F]{40}$/.test(String(wallet || '')))
    .map((wallet) => {
      try { return getAddress(wallet); } catch { return null; }
    })
    .filter(Boolean);
}

function playerLinkedDemonKingWallet(player, chainKey, wallet, getAddress) {
  const candidates = [
    player?.wallet,
    player?.nft_gold_boost_wallet,
  ].filter(Boolean);
  if (DEMON_KING_EVM_CHAINS.includes(chainKey)) {
    if (!/^0x[0-9a-fA-F]{40}$/.test(String(wallet || ''))) return false;
    let expected = null;
    try { expected = getAddress(wallet); } catch { return false; }
    return candidates
      .filter((candidate) => /^0x[0-9a-fA-F]{40}$/.test(String(candidate || '')))
      .some((candidate) => {
        try { return getAddress(candidate) === expected; } catch { return false; }
      });
  }
  if (chainKey === 'aptos') {
    const { normalizeAptosAddress } = require('./bridge_helpers');
    const expected = normalizeAptosAddress(wallet);
    if (!expected) return false;
    return candidates.some((candidate) => normalizeAptosAddress(candidate) === expected);
  }
  if (chainKey === 'solana') {
    const expected = String(wallet || '').trim();
    if (!/^[1-9A-HJ-NP-Za-km-z]{32,44}$/.test(expected)) return false;
    return candidates.some((candidate) => String(candidate || '').trim() === expected);
  }
  return false;
}

function multicallErrorText(err, depth = 0) {
  if (!err || depth > 4) return '';
  return [
    err.shortMessage,
    err.details,
    err.message,
    multicallErrorText(err.cause, depth + 1),
  ].filter(Boolean).join(' ');
}

function multicallChunkLooksLikeRpcFailure(results) {
  if (!Array.isArray(results) || !results.length) return false;
  if (!results.every((r) => r?.status === 'failure')) return false;
  const text = results.map((r) => multicallErrorText(r?.error)).join(' ');
  return /rate limit|over rate|rpc request|timeout|network|fetch/i.test(text);
}

async function listOwnedEvmDemonKingNfts(chainKey, ownerRaw, options = {}) {
  if (!SUPPORTED_EVM_CHAINS[chainKey]) throw new Error(`Unsupported EVM NFT chain: ${chainKey}`);
  if (!/^0x[0-9a-fA-F]{40}$/.test(String(ownerRaw || ''))) {
    const err = new Error('EVM address malformed');
    err.status = 400;
    throw err;
  }

  const { createPublicClient, getAddress, http, defineChain } = await import('viem');
  const viemChains = await import('viem/chains');
  const chainViem = evmViemChain(chainKey, defineChain, viemChains);
  const deployment = v3Deployment(chainKey);
  if (!deployment?.proxy) {
    const err = new Error(`${chainKey} V3 not deployed`);
    err.status = 503;
    throw err;
  }

  const owner = getAddress(ownerRaw);
  const proxy = getAddress(deployment.proxy);
  const cacheKey = `evm:${chainKey}:${owner.toLowerCase()}`;
  const cached = _ownedNftCache.get(cacheKey);
  if (!options.force && cached && Date.now() - cached.at < DEMON_KING_OWNED_MEMORY_TTL_MS) {
    return cached.body;
  }

  const envRpc1 = process.env[`NFT_${chainKey.toUpperCase()}_RPC_URL`];
  const envRpc2 = process.env[`${chainKey.toUpperCase()}_RPC_URL`];
  const publicAlts = {
    base: ['https://mainnet.base.org', 'https://base.llamarpc.com', 'https://base-rpc.publicnode.com'],
    arbitrum: ['https://arb1.arbitrum.io/rpc', 'https://arbitrum.llamarpc.com', 'https://arbitrum-one.publicnode.com'],
    monad: ['https://rpc.monad.xyz'],
    ink: ['https://rpc-gel.inkonchain.com', 'https://rpc-qnd.inkonchain.com', 'https://ink.drpc.org'],
  }[chainKey] || [];
  const rpcs = [envRpc1, envRpc2, ...publicAlts].filter(Boolean);

  async function tryRpcs(fn) {
    let lastErr;
    for (let attempt = 0; attempt < 2; attempt++) {
      for (const rpc of rpcs) {
        try {
          const client = createPublicClient({ chain: chainViem, transport: http(rpc) });
          return await timeoutPromise(fn(client), 12_000, `${chainKey} owned NFT scan`);
        } catch (e) { lastErr = e; }
      }
      await new Promise((r) => setTimeout(r, 250 * (attempt + 1)));
    }
    throw lastErr || new Error(`${chainKey} RPC unavailable`);
  }

  const totalMinted = await tryRpcs((client) => client.readContract({
    address: proxy,
    abi: [{ name: 'totalMinted', type: 'function', stateMutability: 'view', inputs: [], outputs: [{ type: 'uint256' }] }],
    functionName: 'totalMinted',
  }));
  const total = Math.max(0, Number(totalMinted) || 0);
  const ids = Array.from({ length: total }, (_, i) => BigInt(i + 1));
  const ownerAbi = [{ name: 'ownerOf', type: 'function', stateMutability: 'view', inputs: [{ type: 'uint256' }], outputs: [{ type: 'address' }] }];
  const levelAbi = [{ name: 'tokenLevel', type: 'function', stateMutability: 'view', inputs: [{ type: 'uint256' }], outputs: [{ type: 'uint8' }] }];
  const ownerResults = [];
  const chunkSize = EVM_OWNER_SCAN_CHUNK_SIZE;
  for (let i = 0; i < ids.length; i += chunkSize) {
    const contracts = ids.slice(i, i + chunkSize)
      .map((id) => ({ address: proxy, abi: ownerAbi, functionName: 'ownerOf', args: [id] }));
    ownerResults.push(...await tryRpcs(async (client) => {
      const results = await client.multicall({ contracts, allowFailure: true });
      if (multicallChunkLooksLikeRpcFailure(results)) {
        throw new Error(`${chainKey} owner scan multicall RPC failure`);
      }
      return results;
    }));
  }

  const mine = [];
  for (let i = 0; i < total; i++) {
    const r = ownerResults[i];
    if (r?.status === 'success' && r.result && getAddress(r.result) === owner) {
      mine.push(BigInt(i + 1));
    }
  }

  const levels = [];
  const failedLevelIds = [];
  for (let i = 0; i < mine.length; i += chunkSize) {
    const contracts = mine.slice(i, i + chunkSize)
      .map((id) => ({ address: proxy, abi: levelAbi, functionName: 'tokenLevel', args: [id] }));
    const levelResults = await tryRpcs(async (client) => {
      const results = await client.multicall({ contracts, allowFailure: true });
      if (multicallChunkLooksLikeRpcFailure(results)) {
        throw new Error(`${chainKey} level scan multicall RPC failure`);
      }
      return results;
    });
    levels.push(...levelResults.map((r, offset) => {
      if (r?.status === 'success') return Number(r.result);
      failedLevelIds.push(String(mine[i + offset]));
      return null;
    }));
  }
  if (failedLevelIds.length) {
    const err = new Error(`${chainKey} V3 level read failed for ${failedLevelIds.length} owned NFT(s)`);
    err.status = 502;
    throw err;
  }

  const tokens = mine.map((id, i) => ({
    chain: chainKey,
    tokenId: id.toString(),
    level: normalizeNftLevel(levels[i]),
    imageUrl: nftLevelImageUrl(levels[i], id.toString()),
  }));
  const body = { chain: chainKey, owner, contract: proxy, total: tokens.length, tokens, source: 'server-evm-demon-king' };
  _ownedNftCache.set(cacheKey, { at: Date.now(), body });
  return body;
}

function collectionLevelImageUrl(collectionSlug, level, id = null) {
  const slug = normalizeBridgeCollectionSlugValue(collectionSlug);
  if (slug === 'voidspore' || slug === 'dragon') {
    const lvl = normalizeNftLevel(level);
    const ext = slug === 'dragon' ? 'jpg' : (lvl === 3 ? 'jpg' : 'png');
    return `/cdn/nft/${slug}/${lvl}/default.${ext}`;
  }
  return nftLevelImageUrl(level, id);
}

function collectionDisplayName(collectionSlug) {
  const slug = normalizeBridgeCollectionSlugValue(collectionSlug);
  if (slug === 'voidspore') return 'Voidspore';
  if (slug === 'dragon') return 'Dragon';
  return 'Demon King';
}

async function listOwnedEvmCollectionNfts(collectionSlugRaw, chainKey, ownerRaw, options = {}) {
  const collectionSlug = normalizeBridgeCollectionSlugValue(collectionSlugRaw);
  if (collectionSlug === 'demonking') return listOwnedEvmDemonKingNfts(chainKey, ownerRaw, options);
  if (!SUPPORTED_EVM_CHAINS[chainKey]) throw new Error(`Unsupported EVM NFT chain: ${chainKey}`);
  if (!/^0x[0-9a-fA-F]{40}$/.test(String(ownerRaw || ''))) {
    const err = new Error('EVM address malformed');
    err.status = 400;
    throw err;
  }

  const { createPublicClient, getAddress, http, defineChain } = await import('viem');
  const viemChains = await import('viem/chains');
  const chainViem = evmViemChain(chainKey, defineChain, viemChains);
  const deployment = bridgeHelperDeploymentOf(chainKey, collectionSlug);
  if (!deployment?.proxy && !deployment?.contract) {
    const err = new Error(`${collectionDisplayName(collectionSlug)} ${chainKey} is not deployed`);
    err.status = 503;
    throw err;
  }

  const owner = getAddress(ownerRaw);
  const proxy = getAddress(deployment.proxy || deployment.contract);
  const cacheKey = `${collectionSlug}:evm:${chainKey}:${owner.toLowerCase()}`;
  const cached = _ownedNftCache.get(cacheKey);
  if (!options.force && cached && Date.now() - cached.at < DEMON_KING_OWNED_MEMORY_TTL_MS) {
    return cached.body;
  }

  const envKey = collectionSlug.toUpperCase().replace(/[^A-Z0-9]+/g, '_');
  const envRpc1 = process.env[`NFT_${envKey}_${chainKey.toUpperCase()}_RPC_URL`];
  const envRpc2 = process.env[`NFT_${chainKey.toUpperCase()}_RPC_URL`];
  const envRpc3 = process.env[`${chainKey.toUpperCase()}_RPC_URL`];
  const publicAlts = {
    base: ['https://mainnet.base.org', 'https://base.llamarpc.com', 'https://base-rpc.publicnode.com'],
    arbitrum: ['https://arb1.arbitrum.io/rpc', 'https://arbitrum.llamarpc.com', 'https://arbitrum-one.publicnode.com'],
    monad: ['https://rpc.monad.xyz'],
    ink: ['https://rpc-gel.inkonchain.com', 'https://rpc-qnd.inkonchain.com', 'https://ink.drpc.org'],
  }[chainKey] || [];
  const rpcs = [envRpc1, envRpc2, envRpc3, deployment.rpcUrl, ...publicAlts].filter(Boolean);

  async function tryRpcs(fn) {
    let lastErr;
    for (let attempt = 0; attempt < 2; attempt++) {
      for (const rpc of rpcs) {
        try {
          const client = createPublicClient({ chain: chainViem, transport: http(rpc) });
          return await timeoutPromise(fn(client), 12_000, `${collectionSlug} ${chainKey} owned NFT scan`);
        } catch (e) { lastErr = e; }
      }
      await new Promise((r) => setTimeout(r, 250 * (attempt + 1)));
    }
    throw lastErr || new Error(`${chainKey} RPC unavailable`);
  }

  const totalMinted = await tryRpcs((client) => client.readContract({
    address: proxy,
    abi: [{ name: 'totalMinted', type: 'function', stateMutability: 'view', inputs: [], outputs: [{ type: 'uint256' }] }],
    functionName: 'totalMinted',
  }));
  const total = Math.max(0, Number(totalMinted) || 0);
  const ids = Array.from({ length: total }, (_, i) => BigInt(i + 1));
  const ownerAbi = [{ name: 'ownerOf', type: 'function', stateMutability: 'view', inputs: [{ type: 'uint256' }], outputs: [{ type: 'address' }] }];
  const levelAbi = [{ name: 'tokenLevel', type: 'function', stateMutability: 'view', inputs: [{ type: 'uint256' }], outputs: [{ type: 'uint8' }] }];
  const ownerResults = [];
  const chunkSize = EVM_OWNER_SCAN_CHUNK_SIZE;
  for (let i = 0; i < ids.length; i += chunkSize) {
    const contracts = ids.slice(i, i + chunkSize)
      .map((id) => ({ address: proxy, abi: ownerAbi, functionName: 'ownerOf', args: [id] }));
    ownerResults.push(...await tryRpcs(async (client) => {
      const results = await client.multicall({ contracts, allowFailure: true });
      if (multicallChunkLooksLikeRpcFailure(results)) {
        throw new Error(`${collectionDisplayName(collectionSlug)} ${chainKey} owner scan multicall RPC failure`);
      }
      return results;
    }));
  }

  const mine = [];
  for (let i = 0; i < total; i++) {
    const r = ownerResults[i];
    if (r?.status === 'success' && r.result && getAddress(r.result) === owner) mine.push(BigInt(i + 1));
  }

  const levels = [];
  const failedLevelIds = [];
  for (let i = 0; i < mine.length; i += chunkSize) {
    const contracts = mine.slice(i, i + chunkSize)
      .map((id) => ({ address: proxy, abi: levelAbi, functionName: 'tokenLevel', args: [id] }));
    const levelResults = await tryRpcs(async (client) => {
      const results = await client.multicall({ contracts, allowFailure: true });
      if (multicallChunkLooksLikeRpcFailure(results)) {
        throw new Error(`${collectionDisplayName(collectionSlug)} ${chainKey} level scan multicall RPC failure`);
      }
      return results;
    });
    levels.push(...levelResults.map((r, offset) => {
      if (r?.status === 'success') return Number(r.result);
      failedLevelIds.push(String(mine[i + offset]));
      return null;
    }));
  }
  if (failedLevelIds.length) {
    const err = new Error(`${collectionDisplayName(collectionSlug)} ${chainKey} level read failed for ${failedLevelIds.length} owned NFT(s)`);
    err.status = 502;
    throw err;
  }

  const tokens = mine.map((id, i) => ({
    chain: chainKey,
    tokenId: id.toString(),
    level: normalizeNftLevel(levels[i]),
    name: `${collectionDisplayName(collectionSlug)} #${id.toString()}`,
    imageUrl: collectionLevelImageUrl(collectionSlug, levels[i], id.toString()),
  }));
  const body = { collection: collectionSlug, chain: chainKey, owner, contract: proxy, total: tokens.length, tokens, source: `server-evm-${collectionSlug}` };
  _ownedNftCache.set(cacheKey, { at: Date.now(), body });
  return body;
}

function solanaCoreAssetLooksLikeCollection(asset, collectionSlug, collectionAddress) {
  if (solanaCoreAssetCollection(asset) === collectionAddress) return true;
  const slug = normalizeBridgeCollectionSlugValue(collectionSlug);
  const name = String(asset?.name || '').toLowerCase();
  const uri = String(asset?.uri || '').toLowerCase();
  if (slug === 'voidspore' || slug === 'dragon') return name.includes(slug) || uri.includes(`/api/nft/${slug}/solana/`);
  return solanaCoreAssetLooksRelevant(asset, collectionAddress);
}

function solanaCoreCollectionToken(asset, collectionSlug) {
  const assetId = solanaCoreAssetId(asset);
  const level = solanaCoreAssetLevel(asset);
  return {
    asset: assetId,
    mint: assetId,
    tokenId: assetId,
    level,
    name: asset?.name || `${collectionDisplayName(collectionSlug)} L${level}`,
    imageUrl: collectionLevelImageUrl(collectionSlug, level, assetId),
    chain: 'solana',
    standard: 'mpl-core',
  };
}

async function listOwnedSolanaCollectionNfts(collectionSlugRaw, ownerRaw, options = {}) {
  const collectionSlug = normalizeBridgeCollectionSlugValue(collectionSlugRaw);
  if (collectionSlug === 'demonking') return listOwnedSolanaDemonKingNfts(ownerRaw, options);
  const dep = bridgeHelperDeploymentOf('solana', collectionSlug);
  if (!dep?.collection) {
    const err = new Error(`${collectionDisplayName(collectionSlug)} Solana collection is not deployed`);
    err.status = 503;
    throw err;
  }
  const owner = String(ownerRaw || '').trim();
  if (!/^[1-9A-HJ-NP-Za-km-z]{32,44}$/.test(owner)) {
    const err = new Error('Solana address malformed');
    err.status = 400;
    throw err;
  }

  const cacheKey = `${collectionSlug}:solana:${owner}`;
  const cached = _ownedNftCache.get(cacheKey);
  if (!options.force && cached && Date.now() - cached.at < DEMON_KING_OWNED_MEMORY_TTL_MS) {
    return cached.body;
  }

  const { createUmi } = await import('@metaplex-foundation/umi-bundle-defaults');
  const { mplCore, fetchAssetsByOwner } = await import('@metaplex-foundation/mpl-core');
  const { publicKey } = await import('@metaplex-foundation/umi');
  const assets = await withSolanaRpcFallback(async (rpc) => {
    const umi = createUmi(rpc).use(mplCore());
    return timeoutPromise(
      fetchAssetsByOwner(umi, publicKey(owner), { skipDerivePlugins: true }),
      12_000,
      `${collectionDisplayName(collectionSlug)} Solana owner scan ${rpc}`,
    );
  }, { urls: solanaNonHeliusRpcUrls(solanaRpcUrls([dep.rpcUrl])), label: `${collectionDisplayName(collectionSlug)} Solana owner scan` });

  const tokens = assets
    .filter((asset) => publicKeyText(asset.owner) === owner)
    .filter((asset) => solanaCoreAssetLooksLikeCollection(asset, collectionSlug, dep.collection))
    .map((asset) => solanaCoreCollectionToken(asset, collectionSlug))
    .filter((token) => token.asset);

  const body = {
    collection: collectionSlug,
    chain: 'solana',
    owner,
    collectionAddress: dep.collection,
    total: tokens.length,
    tokens,
    source: `server-solana-${collectionSlug}`,
  };
  _ownedNftCache.set(cacheKey, { at: Date.now(), body });
  return body;
}

function normalizeSolanaDemonKingToken(token = {}) {
  const tokenId = String(token.tokenId || token.tokenAddress || token.asset || token.mint || token.id || '').trim();
  if (!tokenId) return null;
  const level = normalizeNftLevel(token.level);
  return {
    ...token,
    chain: 'solana',
    tokenId,
    asset: token.asset || token.mint || tokenId,
    mint: token.mint || token.asset || tokenId,
    level,
    imageUrl: token.imageUrl || nftLevelImageUrl(level, tokenId),
  };
}

function normalizeAptosCollectionToken(token = {}, collectionSlug = 'demonking') {
  const tokenId = String(token.tokenId || token.tokenAddress || token.asset || token.id || '').trim();
  if (!tokenId) return null;
  const level = normalizeNftLevel(token.level);
  return {
    ...token,
    chain: 'aptos',
    tokenId,
    tokenAddress: token.tokenAddress || tokenId,
    level,
    imageUrl: token.imageUrl || collectionLevelImageUrl(collectionSlug, level, tokenId),
  };
}

function normalizeAptosDemonKingToken(token = {}) {
  return normalizeAptosCollectionToken(token, 'demonking');
}

async function listOwnedAptosCollectionNfts(collectionSlugRaw, ownerRaw, options = {}) {
  const { deploymentOf, normalizeAptosAddress } = require('./bridge_helpers');
  const collectionSlug = normalizeBridgeCollectionSlugValue(collectionSlugRaw);
  const dep = deploymentOf('aptos', collectionSlug);
  if (!dep?.collection) {
    const err = new Error(`${collectionDisplayName(collectionSlug)} Aptos not deployed`);
    err.status = 503;
    throw err;
  }
  const owner = normalizeAptosAddress(ownerRaw);
  if (!owner) {
    const err = new Error('Aptos address malformed');
    err.status = 400;
    throw err;
  }

  const cacheKey = `${collectionSlug}:aptos:${owner}`;
  const cached = _ownedNftCache.get(cacheKey);
  if (!options.force && cached && Date.now() - cached.at < DEMON_KING_OWNED_MEMORY_TTL_MS) {
    return cached.body;
  }

  const indexerUrl = process.env.APTOS_INDEXER_URL || 'https://indexer.mainnet.aptoslabs.com/v1/graphql';
  const query = `query Q($owner:String!, $collection:String!) {
    current_token_ownerships_v2(
      where: {owner_address:{_eq:$owner}, current_token_data:{collection_id:{_eq:$collection}}, amount:{_gt:0}}
    ) {
      token_data_id
      current_token_data { token_name token_uri token_properties }
    }
  }`;
  const headers = { 'content-type': 'application/json' };
  if (process.env.APTOS_NODE_API_KEY) headers.Authorization = `Bearer ${process.env.APTOS_NODE_API_KEY}`;
  const response = await timeoutPromise(fetch(indexerUrl, {
    method: 'POST',
    headers,
    body: JSON.stringify({ query, variables: { owner, collection: dep.collection } }),
  }), 12_000, `${collectionDisplayName(collectionSlug)} Aptos owner scan`);
  const json = await response.json().catch(() => ({}));
  if (!response.ok || json?.errors?.length) {
    const err = new Error(json?.errors?.[0]?.message || `Aptos indexer ${response.status}`);
    err.status = response.ok ? 502 : response.status;
    throw err;
  }

  const rows = json?.data?.current_token_ownerships_v2 || [];
  const tokens = rows.map((row) => {
    let level = 1;
    const props = parseMaybeJsonObject(row.current_token_data?.token_properties);
    if (props?.level != null) level = Number(props.level);
    const tokenName = row.current_token_data?.token_name || `${collectionDisplayName(collectionSlug)} ${row.token_data_id}`;
    const tokenUri = row.current_token_data?.token_uri || '';
    const displayId = String(
      props.token_index
      || props.tokenIndex
      || props.index
      || props.serial
      || demonKingDisplayIdFromText(tokenName)
      || demonKingDisplayIdFromText(tokenUri)
      || ''
    ).replace(/^#/, '');
    return normalizeAptosCollectionToken({
      tokenId: row.token_data_id,
      tokenAddress: row.token_data_id,
      level,
      name: tokenName,
      uri: tokenUri,
      displayId,
      tokenIndex: displayId,
      imageUrl: collectionLevelImageUrl(collectionSlug, level, row.token_data_id),
      standard: 'aptos-token-v2',
    }, collectionSlug);
  }).filter(Boolean);

  const body = {
    chain: 'aptos',
    owner,
    collection: dep.collection,
    total: tokens.length,
    tokens,
    source: `server-aptos-${collectionSlug}`,
  };
  _ownedNftCache.set(cacheKey, { at: Date.now(), body });
  return body;
}

async function listOwnedAptosDemonKingNfts(ownerRaw, options = {}) {
  return listOwnedAptosCollectionNfts('demonking', ownerRaw, options);
}

async function listOwnedSolanaDemonKingNfts(ownerRaw, options = {}) {
  const { deploymentOf } = require('./bridge_helpers');
  const dep = deploymentOf('solana');
  if (!dep?.collection) {
    const err = new Error('Solana not deployed');
    err.status = 503;
    throw err;
  }
  const owner = String(ownerRaw || '').trim();
  if (!/^[1-9A-HJ-NP-Za-km-z]{32,44}$/.test(owner)) {
    const err = new Error('Solana address malformed');
    err.status = 400;
    throw err;
  }

  const cacheKey = `solana:${owner}`;
  const cached = _ownedNftCache.get(cacheKey);
  if (!options.force && cached && Date.now() - cached.at < DEMON_KING_OWNED_MEMORY_TTL_MS) {
    return cached.body;
  }

  let token2022Body = null;
  let token2022Error = null;
  const tokenRows = [];
  const sources = [];
  try {
    token2022Body = await listOwnedSolanaToken2022Nfts(owner);
    if (token2022Body.tokens.length) {
      token2022Body = {
        ...token2022Body,
        tokens: token2022Body.tokens.map(normalizeSolanaDemonKingToken).filter(Boolean),
      };
      tokenRows.push(...token2022Body.tokens);
      sources.push(token2022Body.source || 'server-solana-token2022');
    }
  } catch (err) {
    token2022Error = err;
  }

  let recentCoreBody = null;
  try {
    recentCoreBody = await listOwnedSolanaCoreNftsFromRecentMints(owner, dep.collection);
    if (recentCoreBody?.tokens?.length) {
      recentCoreBody = {
        ...recentCoreBody,
        tokens: recentCoreBody.tokens.map(normalizeSolanaDemonKingToken).filter(Boolean),
      };
      tokenRows.push(...recentCoreBody.tokens);
      sources.push(recentCoreBody.source || 'server-solana-recent-core');
    }
  } catch {}

  try {
    const dasBody = await listOwnedSolanaDemonKingNftsFromDas(owner, dep.collection);
    if (dasBody?.tokens?.length) {
      const dasTokens = dasBody.tokens.map(normalizeSolanaDemonKingToken).filter(Boolean);
      tokenRows.push(...dasTokens);
      sources.push(dasBody.source || 'server-solana-das');
    }
  } catch {}

  const { createUmi } = await import('@metaplex-foundation/umi-bundle-defaults');
  const { mplCore, fetchAssetsByOwner } = await import('@metaplex-foundation/mpl-core');
  const { publicKey } = await import('@metaplex-foundation/umi');
  let assets = [];
  try {
    assets = await withSolanaRpcFallback(async (rpc) => {
      const umi = createUmi(rpc).use(mplCore());
      return timeoutPromise(
        fetchAssetsByOwner(umi, publicKey(owner), { skipDerivePlugins: true }),
        12_000,
        `Solana Core owner scan ${rpc}`,
      );
    }, { urls: solanaOwnedRpcUrls(), label: 'Solana Core owner scan' });
  } catch (err) {
    if (!tokenRows.length) throw token2022Error || err;
  }

  const coreTokens = assets
    .filter((asset) => publicKeyText(asset.owner) === owner)
    .filter((asset) => !solanaCoreAssetWasMigrated(solanaCoreAssetId(asset)))
    .filter((asset) => solanaCoreAssetLooksRelevant(asset, dep.collection))
    .map(solanaCoreAssetToken)
    .map(normalizeSolanaDemonKingToken)
    .filter(Boolean);
  if (coreTokens.length) {
    tokenRows.push(...coreTokens);
    sources.push('server-solana-core');
  }

  const tokensById = new Map();
  for (const token of tokenRows) {
    const normalized = normalizeSolanaDemonKingToken(token);
    if (!normalized) continue;
    const key = normalized.tokenId;
    const prev = tokensById.get(key) || {};
    tokensById.set(key, {
      ...prev,
      ...normalized,
      standard: normalized.standard || prev.standard,
      tokenAccount: normalized.tokenAccount || prev.tokenAccount,
      uri: normalized.uri || prev.uri,
    });
  }
  const tokens = [...tokensById.values()];

  const body = {
    chain: 'solana',
    owner,
    collection: dep.collection,
    total: tokens.length,
    tokens,
    source: sources.length ? Array.from(new Set(sources)).join('+') : 'server-solana-demon-king',
    token2022Error: token2022Error ? (token2022Error?.message || String(token2022Error)).slice(0, 160) : undefined,
  };
  _ownedNftCache.set(cacheKey, { at: Date.now(), body });
  return body;
}

/**
 * Mount V3 endpoints on the supplied Express router.
 *
 * @param {object} router — express router (the one exported by routes.js).
 * @param {object} ctx — shared helpers from routes.js:
 *   - parseNftEvmAccount(): returns { signTypedData, address } via viem
 *   - assertGlobalSupplyAvailable(qty): throws if global cap would be hit
 *     (bridge mints are exempt → we DON'T call it for bridge endpoints)
 *   - logError(label, err): structured logger
 */
function mountNftV3Endpoints(router, ctx) {
  if (!ctx?.parseNftEvmAccount) {
    throw new Error('mountNftV3Endpoints: ctx.parseNftEvmAccount is required');
  }

  const upgradeLimit  = makeRateLimiter(10);
  const bridgeLimit   = makeRateLimiter(Number(process.env.NFT_BRIDGE_RATE_LIMIT_PER_MIN || 20));
  const readLimit     = makeRateLimiter(60);

  router.post('/nft/demon-king/sync', async (req, res) => {
    try {
      const ip = req.ip || req.connection?.remoteAddress || 'unknown';
      const rl = readLimit(ip);
      if (!rl.ok) return res.status(429).json({ error: 'rate limited' });

      const player = playerFromUpgradeRequest(req);
      if (!player?.id) return res.status(401).json({ error: 'Game account token required' });

      const { getAddress } = await import('viem');
      const walletRaw = String(req.body?.wallet || req.query?.wallet || '').trim();
      const requestedChains = normalizeDemonKingSyncChains(req.body?.chains ?? req.query?.chains);
      const walletByChain = new Map();
      for (const chain of requestedChains) {
        try {
          if (DEMON_KING_EVM_CHAINS.includes(chain)) {
            if (/^0x[0-9a-fA-F]{40}$/.test(walletRaw)) walletByChain.set(chain, getAddress(walletRaw));
          } else if (chain === 'aptos') {
            const { normalizeAptosAddress } = require('./bridge_helpers');
            const owner = normalizeAptosAddress(walletRaw);
            if (owner) walletByChain.set(chain, owner);
          } else if (chain === 'solana' && /^[1-9A-HJ-NP-Za-km-z]{32,44}$/.test(walletRaw)) {
            walletByChain.set(chain, walletRaw);
          }
        } catch {}
      }
      const syncChains = requestedChains.filter((chain) => walletByChain.has(chain));
      if (!syncChains.length) {
        return res.status(400).json({ error: 'Wallet does not match requested Demon King chain(s)' });
      }
      for (const chain of syncChains) {
        if (!playerLinkedDemonKingWallet(player, chain, walletByChain.get(chain), getAddress)) {
          const label = chain === 'aptos' ? 'Aptos' : chain === 'solana' ? 'Solana' : 'EVM';
          return res.status(403).json({ error: `Connect or verify this ${label} wallet on the game account first` });
        }
      }
      const wallet = walletByChain.get(syncChains[0]);
      const force = req.body?.force === true || String(req.body?.force || req.query?.force || '') === '1';
      const cachedTokens = gameDb.listPlayerDemonKingNfts(player.id, wallet)
        .filter((token) => syncChains.includes(token.chain));
      const check = gameDb.getDemonKingNftWalletCheck(player.id, wallet);

      if (!force && walletCheckCovers(check, syncChains)) {
        res.set('Cache-Control', 'private, no-store');
        return res.json({
          ok: true,
          cached: true,
          stale: false,
          wallet,
          chains: syncChains,
          checkedAt: check.checkedAt,
          total: cachedTokens.length,
          tokens: cachedTokens,
        });
      }

      const inflightKey = `${player.id}:${wallet.toLowerCase()}:${syncChains.join(',')}:${force ? 'force' : 'normal'}`;
      if (_demonKingSyncInflight.has(inflightKey)) {
        const body = await _demonKingSyncInflight.get(inflightKey);
        res.set('Cache-Control', 'private, no-store');
        return res.json({ ...body, deduped: true });
      }

      const job = (async () => {
        const tokens = [];
        const errors = [];
        const successfulChains = [];
        for (const chain of syncChains) {
          try {
            const owner = walletByChain.get(chain);
            const body = DEMON_KING_EVM_CHAINS.includes(chain)
              ? await listOwnedEvmDemonKingNfts(chain, owner, { force })
              : chain === 'solana'
                ? await listOwnedSolanaDemonKingNfts(owner, { force })
                : await listOwnedAptosDemonKingNfts(owner, { force });
            successfulChains.push(chain);
            for (const token of body.tokens || []) {
              const tokenId = String(token.tokenId || token.tokenAddress || token.asset || token.mint || token.id || '');
              if (!tokenId) continue;
              const level = normalizeNftLevel(token.level);
              tokens.push({
                ...token,
                chain,
                tokenId,
                level,
                imageUrl: token.imageUrl || nftLevelImageUrl(level, tokenId),
              });
            }
          } catch (err) {
            errors.push({ chain, error: (err?.message || String(err)).slice(0, 180) });
          }
        }

        if (!successfulChains.length) {
          if (cachedTokens.length) {
            return {
              ok: true,
              cached: true,
              stale: true,
              wallet,
              chains: syncChains,
              checkedAt: check?.checkedAt || null,
              total: cachedTokens.length,
              tokens: cachedTokens,
              errors,
            };
          }
          const err = new Error(errors[0]?.error || 'Demon King ownership sync failed');
          err.status = 502;
          err.errors = errors;
          throw err;
        }

        const scannedTokenByKey = new Map(tokens.map((token) => [
          `${String(token.chain || '').toLowerCase()}:${String(token.tokenId || token.tokenAddress || token.asset || token.mint || token.id || '')}`,
          token,
        ]));
        const boundTokens = gameDb.replacePlayerDemonKingNfts(player.id, wallet, tokens, {
          chains: successfulChains,
          source: force ? 'force-sync' : 'sync',
        }).filter((token) => syncChains.includes(token.chain));
        const responseTokens = boundTokens.map((token) => {
          const scanned = scannedTokenByKey.get(`${String(token.chain || '').toLowerCase()}:${String(token.tokenId || '')}`) || {};
          return {
            ...scanned,
            ...token,
            displayId: scanned.displayId || scanned.display_id || scanned.tokenIndex || scanned.token_index || undefined,
            tokenIndex: scanned.tokenIndex || scanned.token_index || scanned.displayId || scanned.display_id || undefined,
            name: scanned.name || token.name,
            uri: scanned.uri || scanned.tokenUri || token.uri,
            standard: scanned.standard || token.standard,
          };
        });
        const nextCheck = gameDb.getDemonKingNftWalletCheck(player.id, wallet);
        return {
          ok: true,
          cached: false,
          stale: false,
          partial: errors.length > 0,
          wallet,
          chains: syncChains,
          checkedAt: nextCheck?.checkedAt || null,
          total: responseTokens.length,
          tokens: responseTokens,
          errors,
        };
      })();

      _demonKingSyncInflight.set(inflightKey, job);
      try {
        const body = await job;
        res.set('Cache-Control', 'private, no-store');
        return res.json(body);
      } finally {
        _demonKingSyncInflight.delete(inflightKey);
      }
    } catch (err) {
      ctx.logError?.('nft-demon-king-sync', err);
      res.status(err?.status || 500).json({
        error: (err?.message || 'Demon King ownership sync failed').slice(0, 200),
        errors: Array.isArray(err?.errors) ? err.errors : undefined,
      });
    }
  });

  router.post('/nft/:collectionSlug/sync', async (req, res, next) => {
    const collectionSlug = normalizeBridgeCollectionSlugValue(req.params.collectionSlug);
    if (collectionSlug === 'demonking') return next();
    if (!['dragon', 'voidspore'].includes(collectionSlug)) return res.status(400).json({ error: 'Unsupported NFT collection sync' });

    try {
      const ip = req.ip || req.connection?.remoteAddress || 'unknown';
      const rl = readLimit(ip);
      if (!rl.ok) return res.status(429).json({ error: 'rate limited' });

      const player = playerFromUpgradeRequest(req);
      if (!player?.id) return res.status(401).json({ error: 'Game account token required' });

      const { getAddress } = await import('viem');
      const walletRaw = String(req.body?.wallet || req.query?.wallet || '').trim();
      const requestedChains = normalizeDemonKingSyncChains(req.body?.chains ?? req.query?.chains);
      const walletByChain = new Map();
      for (const chain of requestedChains) {
        try {
          if (DEMON_KING_EVM_CHAINS.includes(chain)) {
            if (/^0x[0-9a-fA-F]{40}$/.test(walletRaw)) walletByChain.set(chain, getAddress(walletRaw));
          } else if (chain === 'aptos') {
            const { normalizeAptosAddress } = require('./bridge_helpers');
            const owner = normalizeAptosAddress(walletRaw);
            if (owner) walletByChain.set(chain, owner);
          } else if (chain === 'solana' && /^[1-9A-HJ-NP-Za-km-z]{32,44}$/.test(walletRaw)) {
            walletByChain.set(chain, walletRaw);
          }
        } catch {}
      }
      const syncChains = requestedChains.filter((chain) => walletByChain.has(chain));
      if (!syncChains.length) return res.status(400).json({ error: 'Wallet does not match requested NFT chain(s)' });

      for (const chain of syncChains) {
        if (!playerLinkedDemonKingWallet(player, chain, walletByChain.get(chain), getAddress)) {
          const label = chain === 'aptos' ? 'Aptos' : chain === 'solana' ? 'Solana' : 'EVM';
          return res.status(403).json({ error: `Connect or verify this ${label} wallet on the game account first` });
        }
      }

      const wallet = walletByChain.get(syncChains[0]);
      const force = req.body?.force === true || String(req.body?.force || req.query?.force || '') === '1';
      const cachedTokens = gameDb.listPlayerCollectionNfts(player.id, collectionSlug, wallet)
        .filter((token) => syncChains.includes(token.chain));
      const check = gameDb.getCollectionNftWalletCheck(player.id, collectionSlug, wallet);

      if (!force && walletCheckCovers(check, syncChains)) {
        res.set('Cache-Control', 'private, no-store');
        return res.json({
          ok: true,
          cached: true,
          stale: false,
          collection: collectionSlug,
          wallet,
          chains: syncChains,
          checkedAt: check.checkedAt,
          total: cachedTokens.length,
          tokens: cachedTokens,
        });
      }

      const tokens = [];
      const errors = [];
      const successfulChains = [];
      for (const chain of syncChains) {
        try {
          const owner = walletByChain.get(chain);
          const body = DEMON_KING_EVM_CHAINS.includes(chain)
            ? await listOwnedEvmCollectionNfts(collectionSlug, chain, owner, { force })
            : chain === 'solana'
              ? await listOwnedSolanaCollectionNfts(collectionSlug, owner, { force })
              : await listOwnedAptosCollectionNfts(collectionSlug, owner, { force });
          successfulChains.push(chain);
          for (const token of body.tokens || []) {
            const tokenId = String(token.tokenId || token.tokenAddress || token.asset || token.mint || token.id || '');
            if (!tokenId) continue;
            const level = normalizeNftLevel(token.level);
            tokens.push({
              ...token,
              collection: collectionSlug,
              chain,
              tokenId,
              level,
              imageUrl: token.imageUrl || collectionLevelImageUrl(collectionSlug, level, tokenId),
            });
          }
        } catch (err) {
          errors.push({ chain, error: (err?.message || String(err)).slice(0, 180) });
        }
      }

      if (!successfulChains.length) {
        if (cachedTokens.length) {
          res.set('Cache-Control', 'private, no-store');
          return res.json({
            ok: true,
            cached: true,
            stale: true,
            collection: collectionSlug,
            wallet,
            chains: syncChains,
            checkedAt: check?.checkedAt || null,
            total: cachedTokens.length,
            tokens: cachedTokens,
            errors,
          });
        }
        return res.status(502).json({
          error: (errors[0]?.error || `${collectionDisplayName(collectionSlug)} ownership sync failed`).slice(0, 200),
          errors,
        });
      }

      const scannedTokenByKey = new Map(tokens.map((token) => [
        `${String(token.chain || '').toLowerCase()}:${String(token.tokenId || token.tokenAddress || token.asset || token.mint || token.id || '')}`,
        token,
      ]));
      const boundTokens = gameDb.replacePlayerCollectionNfts(player.id, collectionSlug, wallet, tokens, {
        chains: successfulChains,
        source: force ? 'force-sync' : 'sync',
      }).filter((token) => syncChains.includes(token.chain));
      const responseTokens = boundTokens.map((token) => {
        const scanned = scannedTokenByKey.get(`${String(token.chain || '').toLowerCase()}:${String(token.tokenId || '')}`) || {};
        return {
          ...scanned,
          ...token,
          collection: collectionSlug,
          displayId: scanned.displayId || scanned.display_id || scanned.tokenIndex || scanned.token_index || undefined,
          tokenIndex: scanned.tokenIndex || scanned.token_index || scanned.displayId || scanned.display_id || undefined,
          name: scanned.name || token.name,
          uri: scanned.uri || scanned.tokenUri || token.uri,
          standard: scanned.standard || token.standard,
        };
      });
      const nextCheck = gameDb.getCollectionNftWalletCheck(player.id, collectionSlug, wallet);
      res.set('Cache-Control', 'private, no-store');
      return res.json({
        ok: true,
        cached: false,
        stale: false,
        partial: errors.length > 0,
        collection: collectionSlug,
        wallet,
        chains: syncChains,
        checkedAt: nextCheck?.checkedAt || null,
        total: responseTokens.length,
        tokens: responseTokens,
        errors,
      });
    } catch (err) {
      ctx.logError?.('nft-collection-sync', err);
      return res.status(err?.status || 500).json({
        error: (err?.message || 'NFT ownership sync failed').slice(0, 200),
        errors: Array.isArray(err?.errors) ? err.errors : undefined,
      });
    }
  });

  // ─── POST /nft/upgrade/quote ──────────────────────────────────
  router.post('/nft/upgrade/quote', async (req, res) => {
    return res.status(410).json({
      error: 'Demon King NFT upgrades are retired. Rarity reveal replaces NFT levels.',
      code: 'NFT_UPGRADES_RETIRED',
    });
    try {
      const ip = req.ip || req.connection?.remoteAddress || 'unknown';
      const rl = upgradeLimit(ip);
      if (!rl.ok) {
        res.set('Retry-After', String(rl.retryAfterSec));
        return res.status(429).json({ error: 'Too many upgrade-quote requests.' });
      }

      const { createPublicClient, getAddress, http, zeroAddress } = await import('viem');

      const chainKey = String(req.body?.chain || '').toLowerCase();
      if (chainKey === 'aptos') {
        const player = playerFromUpgradeRequest(req);
        if (!player?.id) return res.status(401).json({ error: 'Log in to upgrade Demon King' });
        const {
          deploymentOf,
          normalizeAptosAddress,
          signAptosUpgradeQuote,
        } = require('./bridge_helpers');
        const deployment = deploymentOf('aptos') || {};
        if (!deployment?.module || !deployment?.usdcMetadata) {
          return res.status(503).json({ error: 'Aptos Demon King upgrade is not configured' });
        }
        const owner = normalizeAptosAddress(req.body?.owner);
        if (!owner) return res.status(400).json({ error: 'owner must be a valid Aptos address' });
        if (!playerLinkedDemonKingWallet(player, 'aptos', owner, (v) => v)) {
          return res.status(403).json({ error: 'Connect or verify the Aptos wallet that owns this Demon King NFT first' });
        }
        const tokenAddress = normalizeAptosAddress(req.body?.tokenAddress || req.body?.tokenId || req.body?.token_id);
        if (!tokenAddress) return res.status(400).json({ error: 'tokenId must be a valid Aptos object address' });
        const newLevel = Number(req.body?.newLevel || 0);
        if (![2, 3].includes(newLevel)) return res.status(400).json({ error: 'newLevel must be 2 or 3' });
        const payment = String(req.body?.payment || 'usdc').toLowerCase();
        if (payment !== 'usdc') return res.status(400).json({ error: 'Aptos NFT upgrades use USDC only' });

        const owned = await listOwnedAptosDemonKingNfts(owner, { force: true });
        const token = (owned.tokens || []).find((item) => {
          const id = normalizeAptosAddress(item.tokenAddress || item.tokenId || item.asset || item.id);
          return id === tokenAddress;
        });
        if (!token) return res.status(403).json({ error: 'Aptos wallet does not own this Demon King NFT' });
        const currentLevel = normalizeNftLevel(token.level);
        if (newLevel !== currentLevel + 1) {
          return res.status(409).json({ error: `Must upgrade by exactly 1. Current level: ${currentLevel}` });
        }
        const requiredWins = gameDb.demonKingRequiredWins(newLevel);
        const battleWins = gameDb.getDemonKingBattleWins(player.id, 'aptos', tokenAddress);
        if (requiredWins != null && battleWins < requiredWins) {
          return res.status(403).json({
            error: `Demon King level ${newLevel} requires ${requiredWins} battle wins`,
            code: 'DEMON_KING_WINS_REQUIRED',
            battle_wins: battleWins,
            required_wins: requiredWins,
            next_level: newLevel,
          });
        }

        const usdPriceE6 = BigInt(
          process.env.NFT_UPGRADE_USD_PRICE_E6
          || process.env.NFT_APTOS_USD_PRICE_E6
          || deployment.upgradeUsdPriceE6
          || '8900000'
        );
        const usdcAmount = usdPriceE6;
        const ttl = Math.max(60, Math.min(900, Number(process.env.NFT_UPGRADE_DEADLINE_SECONDS || 600)));
        const deadline = BigInt(Math.floor(Date.now() / 1000) + ttl);
        const nonce = `0x${crypto.randomBytes(16).toString('hex')}`;
        const signature = await signAptosUpgradeQuote({
          ownerAddress: owner,
          tokenAddress,
          newLevel,
          usdcAmount,
          nonce,
          deadline,
        });

        gameDb.bindPlayerDemonKingNft(player.id, owner, {
          chain: 'aptos',
          tokenId: tokenAddress,
          level: currentLevel,
          imageUrl: token.imageUrl || nftLevelImageUrl(currentLevel, tokenAddress),
        }, { source: 'aptos-upgrade-quote' });

        res.set('Cache-Control', 'no-store');
        return res.json({
          chain: 'aptos',
          owner,
          tokenId: tokenAddress,
          tokenAddress,
          currentLevel,
          newLevel,
          payment: 'usdc',
          paymentToken: deployment.usdcMetadata,
          priceUnits: usdcAmount.toString(),
          priceFormatted: formatUnits(usdcAmount, 6),
          decimals: 6,
          priceSymbol: 'USDC',
          usdPriceE6: usdPriceE6.toString(),
          priceSource: 'USDC 1:1 USD',
          nonce,
          deadline: deadline.toString(),
          signature,
          callData: {
            functionId: `${deployment.module}::upgrade_with_quote`,
            args: [tokenAddress, newLevel, usdcAmount.toString(), nonce, deadline.toString(), signature],
          },
        });
      }
      const spec = SUPPORTED_EVM_CHAINS[chainKey];
      if (!spec) return res.status(400).json({ error: 'Unsupported chain. Use base|arbitrum|monad|ink.' });

      const deployment = v3Deployment(chainKey);
      if (!deployment?.proxy) {
        return res.status(503).json({ error: `${chainKey} V3 not deployed yet` });
      }

      let owner;
      try {
        owner = getAddress(String(req.body?.owner || ''));
      } catch {
        return res.status(400).json({ error: 'owner must be a valid EVM address' });
      }
      const tokenIdRaw = req.body?.tokenId;
      if (tokenIdRaw === undefined || tokenIdRaw === null || tokenIdRaw === '') {
        return res.status(400).json({ error: 'tokenId required' });
      }
      let tokenId;
      try {
        tokenId = BigInt(tokenIdRaw);
      } catch {
        return res.status(400).json({ error: 'tokenId must be a valid integer' });
      }
      if (tokenId <= 0n) return res.status(400).json({ error: 'tokenId must be positive' });
      const newLevel = Number(req.body?.newLevel || 0);
      if (![2, 3].includes(newLevel)) {
        return res.status(400).json({ error: 'newLevel must be 2 or 3' });
      }
      const payment = String(req.body?.payment || 'usdc').toLowerCase();
      if (!['eth', 'native', 'usdc', 'cop'].includes(payment)) {
        return res.status(400).json({ error: 'payment must be eth|usdc|cop' });
      }

      // ── On-chain validation: ownership + current level + paused state ──
      const rpcUrl = evmRpc(chainKey, process.env);
      const publicClient = createPublicClient({ transport: http(rpcUrl) });
      const proxyAddr = getAddress(deployment.proxy);
      const chainOwner = await publicClient.readContract({
        address: proxyAddr,
        abi: NFT_V3_ABI,
        functionName: 'ownerOf',
        args: [tokenId],
      }).catch(() => null);
      if (!chainOwner) return res.status(404).json({ error: 'Token does not exist' });

      const [currentLevel, paused] = await Promise.all([
        publicClient.readContract({ address: proxyAddr, abi: NFT_V3_ABI, functionName: 'tokenLevel', args: [tokenId] }),
        publicClient.readContract({ address: proxyAddr, abi: NFT_V3_ABI, functionName: 'paused' }),
      ]);
      if (paused) return res.status(423).json({ error: 'Contract is paused' });
      if (getAddress(chainOwner) !== owner) {
        return res.status(403).json({ error: 'Caller is not the on-chain owner' });
      }
      if (newLevel !== Number(currentLevel) + 1) {
        return res.status(409).json({ error: `Must upgrade by exactly 1. Current level: ${currentLevel}` });
      }

      // ── Phase B (deferred): battle-win threshold ──
      // const wins = await readWins(chainKey, tokenId);
      // if (wins < winThreshold(newLevel)) return res.status(403).json({ error: 'Not enough wins' });

      // ── Price ──
      const player = playerFromUpgradeRequest(req);
      if (!player) {
        return res.status(401).json({ error: 'Log in to upgrade Demon King' });
      }
      const requiredWins = gameDb.demonKingRequiredWins(newLevel);
      const battleWins = gameDb.getDemonKingBattleWins(player.id, chainKey, tokenId.toString());
      if (requiredWins != null && battleWins < requiredWins) {
        return res.status(403).json({
          error: `Demon King level ${newLevel} requires ${requiredWins} battle wins`,
          code: 'DEMON_KING_WINS_REQUIRED',
          battle_wins: battleWins,
          required_wins: requiredWins,
          next_level: newLevel,
        });
      }

      const usdPriceE6 = upgradeUsdPriceE6(chainKey, payment, deployment);
      let paymentToken = zeroAddress;
      let priceUnits = 0n;
      let decimals = 18;
      let priceSource = 'usd-fixed';
      let priceSymbol = 'ETH';

      if (payment === 'eth' || payment === 'native') {
        paymentToken = zeroAddress;
        decimals = 18;
        priceSymbol = chainKey === 'monad' ? 'MON' : 'ETH';
        const ethUsd = await ctx.fetchNftUsdPrice('eth');
        // (usd * 1e18) / ethUsd ; ethUsd is e6
        priceUnits = (usdPriceE6 * 10n ** 18n) / ethUsd;
        priceSource = `ETH/USD ${ethUsd}`;
      } else if (payment === 'usdc') {
        paymentToken = getAddress(deployment.usdcToken);
        decimals = 6;
        priceSymbol = 'USDC';
        priceUnits = usdPriceE6;     // USDC has 6 decimals; usdPriceE6 IS the unit count
      } else if (payment === 'cop') {
        const cop = deployment.copToken;
        if (!cop || /^0x0{40}$/i.test(cop)) {
          return res.status(409).json({ error: 'CoP not configured on this chain yet' });
        }
        paymentToken = getAddress(cop);
        decimals = Number(process.env.NFT_COP_DECIMALS || 18);
        priceSymbol = 'CoP';
        const copUsd = await ctx.fetchClashUsdPrice({ clashToken: cop });
        priceUnits = (usdPriceE6 * 10n ** BigInt(decimals)) / BigInt(copUsd.price);
        priceSource = `CoP/USD ${copUsd.price}`;
      }

      // ── Sign EIP-712 ──
      const ttl = Math.max(60, Math.min(900, Number(process.env.NFT_UPGRADE_DEADLINE_SECONDS || 600)));
      const deadline = BigInt(Math.floor(Date.now() / 1000) + ttl);
      const nonce = `0x${crypto.randomBytes(32).toString('hex')}`;

      const account = await ctx.parseNftEvmAccount();
      const domain = {
        name: deployment.eip712Name || spec.domainName,
        version: deployment.eip712Version || '3',
        chainId: spec.chainId,
        verifyingContract: proxyAddr,
      };
      const types = {
        UpgradeQuote: [
          { name: 'owner', type: 'address' },
          { name: 'tokenId', type: 'uint256' },
          { name: 'newLevel', type: 'uint8' },
          { name: 'paymentToken', type: 'address' },
          { name: 'priceUnits', type: 'uint256' },
          { name: 'nonce', type: 'bytes32' },
          { name: 'deadline', type: 'uint256' },
        ],
      };
      const message = { owner, tokenId, newLevel, paymentToken, priceUnits, nonce, deadline };
      const signature = await account.signTypedData({ domain, types, primaryType: 'UpgradeQuote', message });

      res.set('Cache-Control', 'no-store');
      res.json({
        chain: chainKey,
        chainId: spec.chainId,
        contract: proxyAddr,
        owner,
        tokenId: tokenId.toString(),
        currentLevel: Number(currentLevel),
        newLevel,
        payment,
        paymentToken,
        priceUnits: priceUnits.toString(),
        priceFormatted: formatUnits(priceUnits, decimals),
        decimals,
        priceSymbol,
        usdPriceE6: usdPriceE6.toString(),
        priceSource,
        nonce,
        deadline: deadline.toString(),
        signature,
        // Convenience for the client to construct the tx call:
        callData: {
          functionName: 'upgradeToken',
          args: [tokenId.toString(), newLevel, paymentToken, priceUnits.toString(), nonce, deadline.toString(), signature],
        },
      });
    } catch (err) {
      ctx.logError?.('nft-v3-upgrade-quote', err);
      res.status(err?.status || 500).json({ error: (err?.message || 'quote failed').slice(0, 200) });
    }
  });

  // ─── GET /nft/state/:chain/:tokenId ──────────────────────────────
  // Aggregated UI snapshot — owner + level + price ladder.
  router.get('/nft/state/:chain/:tokenId', async (req, res) => {
    try {
      const ip = req.ip || req.connection?.remoteAddress || 'unknown';
      const rl = readLimit(ip);
      if (!rl.ok) return res.status(429).json({ error: 'rate limited' });

      const { createPublicClient, getAddress, http } = await import('viem');
      const chainKey = String(req.params.chain || '').toLowerCase();
      const spec = SUPPORTED_EVM_CHAINS[chainKey];
      if (!spec) return res.status(400).json({ error: 'Unsupported chain' });

      const deployment = v3Deployment(chainKey);
      if (!deployment?.proxy) return res.status(503).json({ error: 'V3 not deployed on this chain' });

      const tokenId = BigInt(req.params.tokenId);
      const publicClient = createPublicClient({ transport: http(evmRpc(chainKey, process.env)) });
      const proxyAddr = getAddress(deployment.proxy);

      const [chainOwner, level, paused] = await Promise.all([
        publicClient.readContract({ address: proxyAddr, abi: NFT_V3_ABI, functionName: 'ownerOf', args: [tokenId] })
          .catch(() => null),
        publicClient.readContract({ address: proxyAddr, abi: NFT_V3_ABI, functionName: 'tokenLevel', args: [tokenId] })
          .catch(() => null),
        publicClient.readContract({ address: proxyAddr, abi: NFT_V3_ABI, functionName: 'paused' })
          .catch(() => false),
      ]);

      if (!chainOwner) return res.status(404).json({ error: 'Token does not exist' });

      const upgradeable = Number(level) < 3 && !paused;
      const nextLevel = upgradeable ? Number(level) + 1 : null;
      const requiredWins = nextLevel ? gameDb.demonKingRequiredWins(nextLevel) : null;
      const player = playerFromUpgradeRequest(req);
      const battleWins = player ? gameDb.getDemonKingBattleWins(player.id, chainKey, tokenId.toString()) : null;
      const rarity = demonKingRarityForToken(chainKey, { tokenId: tokenId.toString(), level });

      res.set('Cache-Control', player ? 'private, no-store' : 'public, max-age=15');
      res.json({
        chain: chainKey,
        chainId: spec.chainId,
        contract: proxyAddr,
        tokenId: tokenId.toString(),
        owner: chainOwner,
        level: Number(level),
        legacyLevel: Number(level),
        rarity: rarity.rarity,
        rarityLabel: rarity.rarityLabel,
        levelLabel: `Level ${Number(level)}`,
        starCount: Number(level),
        maxLevel: 3,
        upgradeable: false,
        nextLevel: null,
        upgradesRetired: true,
        upgradePriceUsdE6: upgradeUsdPriceE6(chainKey, 'usdc', deployment).toString(),
        usdc: deployment.usdcToken,
        cop: deployment.copToken || null,
        paused,
        imageUrl: nftLevelImageUrl(1, tokenId.toString()),
        wins: battleWins,
        nextLevelRequiredWins: requiredWins,
      });
    } catch (err) {
      ctx.logError?.('nft-v3-state', err);
      res.status(err?.status || 500).json({ error: (err?.message || 'state read failed').slice(0, 200) });
    }
  });

  // ─── GET /nft/owned/:chain/:address ─────────────────────────────
  // Lists token IDs owned by `address` on the given chain. Used by the
  // bridge UI to populate the "which NFT to bridge?" picker. Implementation:
  //
  //   - EVM (base/arbitrum/monad): iterate ownerOf(1..totalMinted). Total
  //     supply is small (~10-500), so this is acceptable on-demand. We
  //     parallelise with Promise.all + filter for the requested owner.
  //   - Aptos: query the indexer/REST API for tokens by owner under our
  //     collection. Falls back gracefully if the indexer is unavailable.
  //   - Solana: Token-2022 owner scan first, then legacy Core collection scan.
  async function handleCollectionOwnedLookup(req, res, defaultCollectionSlug = null) {
    try {
      const ip = req.ip || 'unknown';
      const rl = readLimit(ip);
      if (!rl.ok) return res.status(429).json({ error: 'rate limited' });

      const collectionSlug = normalizeBridgeCollectionSlug(defaultCollectionSlug || req.params.collectionSlug);
      if (!BRIDGE_COLLECTIONS[collectionSlug]) return res.status(404).json({ error: 'collection not found' });
      const collection = BRIDGE_COLLECTIONS[collectionSlug];
      const chainKey = String(req.params.chain || '').toLowerCase();
      const ownerRaw = String(req.params.address || '').trim();
      if (!chainKey || !ownerRaw) return res.status(400).json({ error: 'chain + address required' });
      ensureBridgeChainSupported(collection, chainKey, 'source');

      let body;
      if (SUPPORTED_EVM_CHAINS[chainKey]) {
        body = await listOwnedEvmCollectionNfts(collectionSlug, chainKey, ownerRaw);
      } else if (chainKey === 'solana') {
        body = await listOwnedSolanaCollectionNfts(collectionSlug, ownerRaw);
      } else if (chainKey === 'aptos') {
        body = await listOwnedAptosCollectionNfts(collectionSlug, ownerRaw);
      } else {
        return res.status(400).json({ error: `${collection.label} is not configured on ${chainKey}` });
      }
      if (collectionSlug === 'demonking') body = decorateDemonKingOwnedBody(body, chainKey);
      res.set('Cache-Control', 'public, max-age=10');
      return res.json(body);
    } catch (err) {
      ctx.logError?.('nft-collection-owned', err);
      return res.status(err?.status || 500).json({ error: (err?.message || 'owned lookup failed').slice(0, 200) });
    }
  }

  router.get('/nft/demon-king/owned/:chain/:address', (req, res) => (
    handleCollectionOwnedLookup(req, res, 'demonking')
  ));
  router.get('/nft/demonking/owned/:chain/:address', (req, res) => (
    handleCollectionOwnedLookup(req, res, 'demonking')
  ));
  router.get('/nft/:collectionSlug/owned/:chain/:address', (req, res) => (
    handleCollectionOwnedLookup(req, res)
  ));

  router.get('/nft/owned/:chain/:address', async (req, res) => {
    try {
      const ip = req.ip || 'unknown';
      const rl = readLimit(ip);
      if (!rl.ok) return res.status(429).json({ error: 'rate limited' });

      const chainKey = String(req.params.chain || '').toLowerCase();
      const ownerRaw = String(req.params.address || '').trim();
      if (!chainKey || !ownerRaw) return res.status(400).json({ error: 'chain + address required' });

      // EVM path. Resilient against public RPC rate-limits: per-chain
      // RPC URL list (env primary → public fallback), retry with exponential
      // back-off across endpoints, and per-(chain, owner) memo cache so the
      // wizard's repeated polls don't hammer the chain.
      if (SUPPORTED_EVM_CHAINS[chainKey]) {
        const { createPublicClient, getAddress, http, defineChain } = await import('viem');
        const viemChains = await import('viem/chains');
        const chainViem = evmViemChain(chainKey, defineChain, viemChains);
        const deployment = v3Deployment(chainKey);
        if (!deployment?.proxy) return res.status(503).json({ error: `${chainKey} V3 not deployed` });
        if (!/^0x[0-9a-fA-F]{40}$/.test(ownerRaw)) return res.status(400).json({ error: 'EVM address malformed' });
        const owner = getAddress(ownerRaw);
        const proxy = getAddress(deployment.proxy);

        // 30s in-memory cache. Wizard renders re-trigger fetch on chain
        // switch + every poll; multiple identical reads in quick succession
        // should hit the cache instead of the RPC.
        const cacheKey = `${chainKey}:${owner.toLowerCase()}`;
        const cached = _ownedNftCache.get(cacheKey);
        if (cached && Date.now() - cached.at < 30_000) {
          res.set('Cache-Control', 'public, max-age=10');
          return res.json(cached.body);
        }

        // Build RPC fallback list: env override → public default → known
        // alternates. Tried in order on each transport call until one works.
        const envRpc1 = process.env[`NFT_${chainKey.toUpperCase()}_RPC_URL`];
        const envRpc2 = process.env[`${chainKey.toUpperCase()}_RPC_URL`];
        const publicAlts = {
          base: ['https://mainnet.base.org', 'https://base.llamarpc.com', 'https://base-rpc.publicnode.com'],
          arbitrum: ['https://arb1.arbitrum.io/rpc', 'https://arbitrum.llamarpc.com', 'https://arbitrum-one.publicnode.com'],
          monad: ['https://rpc.monad.xyz'],
          ink: ['https://rpc-gel.inkonchain.com', 'https://rpc-qnd.inkonchain.com', 'https://ink.drpc.org'],
        }[chainKey] || [];
        const rpcs = [envRpc1, envRpc2, ...publicAlts].filter(Boolean);

        async function tryRpcs(fn) {
          // Try each RPC up to 2 times with 250ms back-off. Throw the last
          // error so the caller surfaces a single coherent failure message.
          let lastErr;
          for (let attempt = 0; attempt < 2; attempt++) {
            for (const rpc of rpcs) {
              try {
                const client = createPublicClient({ chain: chainViem, transport: http(rpc) });
                return await fn(client);
              } catch (e) { lastErr = e; }
            }
            await new Promise((r) => setTimeout(r, 250 * (attempt + 1)));
          }
          throw lastErr;
        }

        const totalMinted = await tryRpcs((client) => client.readContract({
          address: proxy, abi: [{ name:'totalMinted', type:'function', stateMutability:'view', inputs:[], outputs:[{type:'uint256'}] }],
          functionName: 'totalMinted',
        }));
        const total = Number(totalMinted);
        const ownerAbi = [{ name:'ownerOf', type:'function', stateMutability:'view', inputs:[{type:'uint256'}], outputs:[{type:'address'}] }];
        const levelAbi = [{ name:'tokenLevel', type:'function', stateMutability:'view', inputs:[{type:'uint256'}], outputs:[{type:'uint8'}] }];
        const ids = Array.from({ length: total }, (_, i) => BigInt(i + 1));
        const ownerCalls = ids.map((id) => ({ address: proxy, abi: ownerAbi, functionName: 'ownerOf', args: [id] }));
        const ownerResults = await tryRpcs((client) => client.multicall({ contracts: ownerCalls, allowFailure: true }));
        const mine = [];
        for (let i = 0; i < total; i++) {
          const r = ownerResults[i];
          if (r?.status === 'success' && r.result && getAddress(r.result) === owner) {
            mine.push(BigInt(i + 1));
          }
        }
        let levels = [];
        if (mine.length > 0) {
          const levelCalls = mine.map((id) => ({ address: proxy, abi: levelAbi, functionName: 'tokenLevel', args: [id] }));
          const levelResults = await tryRpcs((client) => client.multicall({ contracts: levelCalls, allowFailure: true }));
          const failedLevelIds = [];
          levels = levelResults.map((r, i) => {
            if (r?.status === 'success') return Number(r.result);
            failedLevelIds.push(String(mine[i]));
            return null;
          });
          if (failedLevelIds.length) {
            return res.status(502).json({ error: `${chainKey} V3 level read failed for ${failedLevelIds.length} owned NFT(s)` });
          }
        }
        const tokens = mine.map((id, i) => ({
          tokenId: id.toString(),
          level: normalizeNftLevel(levels[i]),
          imageUrl: nftLevelImageUrl(levels[i], id.toString()),
        }));
        const body = decorateDemonKingOwnedBody({ chain: chainKey, owner, contract: proxy, total: tokens.length, tokens }, chainKey);
        _ownedNftCache.set(cacheKey, { at: Date.now(), body });
        res.set('Cache-Control', 'public, max-age=10');
        return res.json(body);
      }

      // Aptos path
      if (chainKey === 'aptos') {
        const ownedBody = decorateDemonKingOwnedBody(await listOwnedAptosDemonKingNfts(ownerRaw), chainKey);
        res.set('Cache-Control', 'public, max-age=10');
        return res.json(ownedBody);
        const { deploymentOf, aptosFullnodeBase } = require('./bridge_helpers');
        const dep = deploymentOf('aptos');
        if (!dep?.collection) return res.status(503).json({ error: 'Aptos not deployed' });
        if (!/^0x[0-9a-fA-F]{1,64}$/.test(ownerRaw)) return res.status(400).json({ error: 'Aptos address malformed' });
        const owner = '0x' + ownerRaw.replace(/^0x/, '').padStart(64, '0').toLowerCase();
        // Aptos indexer GraphQL — official mainnet endpoint.
        const indexerUrl = process.env.APTOS_INDEXER_URL || 'https://indexer.mainnet.aptoslabs.com/v1/graphql';
        const q = `query Q($owner:String!, $collection:String!) {
          current_token_ownerships_v2(
            where: {owner_address:{_eq:$owner}, current_token_data:{collection_id:{_eq:$collection}}, amount:{_gt:0}}
          ) {
            token_data_id
            current_token_data { token_name token_properties }
          }
        }`;
        const headers = { 'content-type':'application/json' };
        if (process.env.APTOS_NODE_API_KEY) headers.Authorization = `Bearer ${process.env.APTOS_NODE_API_KEY}`;
        const r = await fetch(indexerUrl, { method:'POST', headers,
          body: JSON.stringify({ query: q, variables: { owner, collection: dep.collection } }) });
        const j = await r.json();
        const rows = j?.data?.current_token_ownerships_v2 || [];
        const tokens = rows.map((row) => {
          // Aptos token_properties is a JSON string from indexer; parse `level` if present.
          let level = 1;
          try {
            const props = row.current_token_data?.token_properties;
            const parsed = typeof props === 'string' ? JSON.parse(props) : props;
            if (parsed?.level != null) level = Number(parsed.level);
          } catch { /* ignore */ }
          level = normalizeNftLevel(level);
          return {
            tokenAddress: row.token_data_id,
            level,
            imageUrl: nftLevelImageUrl(level, row.current_token_data?.token_name || 'aptos'),
          };
        });
        res.set('Cache-Control', 'public, max-age=10');
        return res.json({ chain: 'aptos', owner, collection: dep.collection, total: tokens.length, tokens });
      }

      // Solana path
      if (chainKey === 'solana') {
        const ownedBody = decorateDemonKingOwnedBody(await listOwnedSolanaDemonKingNfts(ownerRaw), chainKey);
        res.set('Cache-Control', 'public, max-age=10');
        return res.json(ownedBody);
        const { deploymentOf } = require('./bridge_helpers');
        const dep = deploymentOf('solana');
        if (!dep?.collection) return res.status(503).json({ error: 'Solana not deployed' });
        if (!/^[1-9A-HJ-NP-Za-km-z]{32,44}$/.test(ownerRaw)) return res.status(400).json({ error: 'Solana address malformed' });

        const cacheKey = `solana:${ownerRaw}`;
        const cached = _ownedNftCache.get(cacheKey);
        if (cached && Date.now() - cached.at < 30_000) {
          res.set('Cache-Control', 'public, max-age=10');
          return res.json(cached.body);
        }

        let token2022Body = null;
        let token2022Error = null;
        try {
          token2022Body = await listOwnedSolanaToken2022Nfts(ownerRaw);
          if (token2022Body.tokens.length) {
            _ownedNftCache.set(cacheKey, { at: Date.now(), body: token2022Body });
            res.set('Cache-Control', 'public, max-age=10');
            return res.json(token2022Body);
          }
        } catch (err) {
          token2022Error = err;
        }

        let recentCoreBody = null;
        try {
          recentCoreBody = await listOwnedSolanaCoreNftsFromRecentMints(ownerRaw, dep.collection);
          if (recentCoreBody?.tokens?.length) {
            _ownedNftCache.set(cacheKey, { at: Date.now(), body: recentCoreBody });
            res.set('Cache-Control', 'public, max-age=10');
            return res.json(recentCoreBody);
          }
        } catch {}

        const { createUmi } = await import('@metaplex-foundation/umi-bundle-defaults');
        const { mplCore, fetchAssetsByOwner } = await import('@metaplex-foundation/mpl-core');
        const { publicKey } = await import('@metaplex-foundation/umi');
        let assets = [];
        try {
          assets = await withSolanaRpcFallback(async (rpc) => {
            const umi = createUmi(rpc).use(mplCore());
            return timeoutPromise(
              fetchAssetsByOwner(umi, publicKey(ownerRaw), { skipDerivePlugins: true }),
              12_000,
              `Solana Core owner scan ${rpc}`,
            );
          }, { urls: solanaOwnedRpcUrls(), label: 'Solana Core owner scan' });
        } catch (err) {
          if (recentCoreBody) {
            _ownedNftCache.set(cacheKey, { at: Date.now(), body: recentCoreBody });
            res.set('Cache-Control', 'public, max-age=10');
            return res.json(recentCoreBody);
          }
          if (token2022Body) {
            _ownedNftCache.set(cacheKey, { at: Date.now(), body: token2022Body });
            res.set('Cache-Control', 'public, max-age=10');
            return res.json(token2022Body);
          }
          throw token2022Error || err;
        }
        const tokens = assets
          .filter((a) => publicKeyText(a.owner) === ownerRaw)
          .filter((a) => !solanaCoreAssetWasMigrated(solanaCoreAssetId(a)))
          .filter((a) => solanaCoreAssetLooksRelevant(a, dep.collection))
          .map(solanaCoreAssetToken);
        if (!tokens.length && recentCoreBody) {
          _ownedNftCache.set(cacheKey, { at: Date.now(), body: recentCoreBody });
          res.set('Cache-Control', 'public, max-age=10');
          return res.json(recentCoreBody);
        }
        if (!tokens.length && token2022Body) {
          _ownedNftCache.set(cacheKey, { at: Date.now(), body: token2022Body });
          res.set('Cache-Control', 'public, max-age=10');
          return res.json(token2022Body);
        }
        const body = { chain: 'solana', owner: ownerRaw, collection: dep.collection, total: tokens.length, tokens, source: 'server-solana-core' };
        _ownedNftCache.set(cacheKey, { at: Date.now(), body });
        res.set('Cache-Control', 'public, max-age=10');
        return res.json(body);
      }

      return res.status(400).json({ error: `Unsupported chain ${chainKey}` });
    } catch (err) {
      ctx.logError?.('nft-owned', err);
      res.status(err?.status || 500).json({ error: (err?.message || 'owned query failed').slice(0, 200) });
    }
  });

  // ─── GET /marketplace/listings ──────────────────────────────────
  // Returns active listings indexed from on-chain Listed/Cancelled/Sold
  // events by ./marketplace_indexer.js.
  //
  // Query params:
  //   chain   — base (default). Future: arbitrum / monad.
  //   seller  — filter to a single seller (checksum or lowercase ok).
  //   limit   — page size (default 50, max 200).
  //   offset  — page offset (default 0).
  //   active  — '1' (default) or '0' to include sold/cancelled.
  router.get('/marketplace/listings', async (req, res) => {
    try {
      const ip = req.ip || 'unknown';
      const rl = readLimit(ip);
      if (!rl.ok) return res.status(429).json({ error: 'rate limited' });

      const { db } = require('./db');
      const { getIndexerStatus } = require('./marketplace_indexer');

      const chainKey  = String(req.query.chain || 'base').toLowerCase();
      const seller    = req.query.seller ? String(req.query.seller).toLowerCase() : null;
      const limit     = Math.min(200, Math.max(1, Number(req.query.limit) || 50));
      const offset    = Math.max(0, Number(req.query.offset) || 0);
      const activeOnly = String(req.query.active ?? '1') === '1';

      const deployment = readJsonIfExists(path.join(NFT_ROOT, 'deployments', `${chainKey}-marketplace-mainnet.json`));
      if (!deployment?.marketplace) return res.status(503).json({ error: `${chainKey} marketplace not deployed` });

      const where = ['chain = ?'];
      const params = [chainKey];
      if (activeOnly) where.push('active = 1');
      if (seller) { where.push('lower(seller) = ?'); params.push(seller); }

      const rows = db.prepare(`
        SELECT token_id, seller, payment_token, price_wei, created_at, expires_at,
               active, listed_block, listed_tx,
               cancelled_block, cancelled_tx, sold_block, sold_tx, buyer, sold_price_wei
          FROM marketplace_listings
         WHERE ${where.join(' AND ')}
         ORDER BY created_at DESC
         LIMIT ? OFFSET ?
      `).all(...params, limit, offset);

      const total = db.prepare(`
        SELECT COUNT(*) as c FROM marketplace_listings WHERE ${where.join(' AND ')}
      `).get(...params).c;

      const idxStatus = getIndexerStatus().find((s) => s.chain === chainKey) || null;

      res.set('Cache-Control', 'public, max-age=10');
      res.json({
        chain: chainKey,
        chainId: deployment.chainId || 8453,
        marketplace: deployment.marketplace,
        listings: rows.map((r) => ({
          tokenId: r.token_id,
          seller: r.seller,
          paymentToken: r.payment_token,
          priceWei: r.price_wei,
          createdAt: r.created_at,
          expiresAt: r.expires_at || null,
          active: !!r.active,
          listedBlock: r.listed_block,
          listedTx: r.listed_tx,
          // Settled fields are null for active listings.
          cancelledBlock: r.cancelled_block,
          cancelledTx: r.cancelled_tx,
          soldBlock: r.sold_block,
          soldTx: r.sold_tx,
          buyer: r.buyer,
          soldPriceWei: r.sold_price_wei,
        })),
        total,
        limit, offset,
        indexerStatus: idxStatus ? (idxStatus.running ? 'running' : 'stopped') : 'not_started',
        indexer: idxStatus,
      });
    } catch (err) {
      ctx.logError?.('marketplace-listings', err);
      res.status(500).json({ error: 'listings query failed' });
    }
  });

  // ─── GET /marketplace/listing/:chain/:tokenId ───────────────────
  router.get('/marketplace/listing/:chain/:tokenId', async (req, res) => {
    try {
      const ip = req.ip || 'unknown';
      const rl = readLimit(ip);
      if (!rl.ok) return res.status(429).json({ error: 'rate limited' });

      const { db } = require('./db');
      const chainKey = String(req.params.chain || '').toLowerCase();
      const tokenId  = String(req.params.tokenId || '');
      if (!chainKey || !tokenId) return res.status(400).json({ error: 'chain and tokenId required' });

      const row = db.prepare(`
        SELECT * FROM marketplace_listings WHERE chain = ? AND token_id = ?
      `).get(chainKey, tokenId);
      if (!row) return res.status(404).json({ error: 'listing not indexed (or never listed)' });

      const events = db.prepare(`
        SELECT event_type, block_number, tx_hash, raw_data, indexed_at
          FROM marketplace_events
         WHERE chain = ? AND token_id = ?
         ORDER BY block_number DESC, log_index DESC
         LIMIT 50
      `).all(chainKey, tokenId);

      res.set('Cache-Control', 'public, max-age=10');
      res.json({
        chain: chainKey,
        tokenId,
        listing: {
          seller: row.seller,
          paymentToken: row.payment_token,
          priceWei: row.price_wei,
          createdAt: row.created_at,
          expiresAt: row.expires_at || null,
          active: !!row.active,
          listedBlock: row.listed_block,
          listedTx: row.listed_tx,
          cancelledBlock: row.cancelled_block,
          cancelledTx: row.cancelled_tx,
          soldBlock: row.sold_block,
          soldTx: row.sold_tx,
          buyer: row.buyer,
          soldPriceWei: row.sold_price_wei,
        },
        events: events.map((e) => ({
          type: e.event_type,
          block: e.block_number,
          tx: e.tx_hash,
          data: JSON.parse(e.raw_data),
          indexedAt: e.indexed_at,
        })),
      });
    } catch (err) {
      ctx.logError?.('marketplace-listing-single', err);
      res.status(500).json({ error: 'listing query failed' });
    }
  });

  // ─── GET /marketplace/indexer/status ────────────────────────────
  router.get('/marketplace/indexer/status', async (req, res) => {
    try {
      const { getIndexerStatus } = require('./marketplace_indexer');
      res.set('Cache-Control', 'no-store');
      res.json({ indexers: getIndexerStatus() });
    } catch (err) {
      res.status(500).json({ error: 'indexer status query failed' });
    }
  });

  // ─── Bridge endpoints: full N-to-N mesh (Base/Arb/Monad/Aptos/Solana). ─
  //
  // Per-source verification + per-destination signing/minting:
  //   EVM source     →  EVM/Aptos dest  →  user submits dest tx with receipt
  //   EVM source     →  Solana dest     →  server submits Solana mint (free)
  //   Aptos source   →  EVM/Aptos dest  →  user submits dest tx with receipt
  //   Aptos source   →  Solana dest     →  server submits Solana mint (free)
  //   Solana source  →  EVM/Aptos dest  →  user submits dest tx with receipt
  //
  // Solana ↔ Solana is rejected (same chain).
  // Same-chain bridges are rejected.

  const bridgeHelpers = require('./bridge_helpers');
  const { CHAIN_IDS, EVM_CHAINS, ALL_CHAINS, deploymentOf, normalizeBridgeCollectionSlug,
          normalizeAptosAddress,
          aptosAccount, signAptosBridgeReceipt, verifyAptosBurnTx,
          verifySolanaBurnTx, buildSourceRef,
          getSolanaBridgeAssetInfo, buildSolanaBridgeMemo,
          parseSolanaSecretKey, solanaConnection } = bridgeHelpers;

  // SQLite ledger handle. `./db` exports `{ db }`.
  // Replay-protection ledger for cross-chain bridges. Inserts fail with
  // SQLITE_CONSTRAINT_PRIMARYKEY when a (sourceRef, destChain) pair has
  // already been consumed.
  const bridgeDb = (() => {
    try { return require('./db').db; }
    catch (err) { console.warn('[bridge] sqlite handle missing:', err?.message); return null; }
  })();
  const insertUsedBridgeRefStmt = bridgeDb?.prepare(`
    INSERT INTO used_bridge_refs
      (source_ref, dest_chain, source_chain, burn_tx_hash, dest_address, dest_tx_or_asset, level)
    VALUES (?, ?, ?, ?, ?, ?, ?)
  `);
  const findUsedBridgeRefStmt = bridgeDb?.prepare(`
    SELECT * FROM used_bridge_refs WHERE source_ref = ? AND dest_chain = ?
  `);
  const findBridgeRefByBurnStmt = bridgeDb?.prepare(`
    SELECT * FROM used_bridge_refs WHERE burn_tx_hash = ? AND dest_chain = ?
  `);
  const insertBridgeLogStmt = bridgeDb?.prepare(`
    INSERT INTO bridge_logs
      (request_id, phase, status, source_chain, dest_chain, source_ref, burn_tx_hash,
       dest_address, dest_tx_or_asset, level, error, data, ip)
    VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
  `);

  function recordUsedBridgeRef(row) {
    if (!insertUsedBridgeRefStmt) return;
    try {
      insertUsedBridgeRefStmt.run(
        row.source_ref, row.dest_chain, row.source_chain, row.burn_tx_hash,
        row.dest_address, row.dest_tx_or_asset || null, row.level,
      );
    } catch (err) {
      // Already consumed — caller should treat this as a replay.
      const code = err?.code || '';
      if (code === 'SQLITE_CONSTRAINT_PRIMARYKEY' || code === 'SQLITE_CONSTRAINT_UNIQUE') {
        const dup = new Error('sourceRef already consumed for this destination');
        dup.code = 'BRIDGE_REPLAY';
        throw dup;
      }
      throw err;
    }
  }

  function findUsedBridgeRef(sourceRef, destChain) {
    if (!findUsedBridgeRefStmt) return null;
    try { return findUsedBridgeRefStmt.get(sourceRef, destChain) || null; }
    catch { return null; }
  }

  function findBridgeRefByBurn(burnTxHash, destChain) {
    if (!findBridgeRefByBurnStmt) return null;
    try { return findBridgeRefByBurnStmt.get(burnTxHash, destChain) || null; }
    catch { return null; }
  }

  const EVM_DEST_DOMAIN = {
    base:     { chainId: 8453,  name: 'DemonKingBase'     },
    arbitrum: { chainId: 42161, name: 'DemonKingArbitrum' },
    monad:    { chainId: 143,   name: 'DemonKingMonad'    },
    ink:      { chainId: 57073, name: 'DemonKingInk'      },
  };

  const BRIDGE_COLLECTIONS = {
    demonking: {
      slug: 'demonking',
      label: 'Demon King',
      evmEip712Version: '3',
      chains: new Set(ALL_CHAINS),
    },
    voidspore: {
      slug: 'voidspore',
      label: 'Voidspore',
      evmEip712Version: '1',
      chains: new Set(['base', 'arbitrum', 'monad', 'ink', 'aptos', 'solana']),
    },
    dragon: {
      slug: 'dragon',
      label: 'Dragon',
      evmEip712Version: '1',
      chains: new Set(['base', 'arbitrum', 'monad', 'ink', 'aptos', 'solana']),
    },
  };

  function bridgeCollectionFromReq(req) {
    const slug = normalizeBridgeCollectionSlug(req.body?.collection || req.query?.collection);
    return BRIDGE_COLLECTIONS[slug] || null;
  }

  function bridgeCollectionChainList(collection) {
    return [...(collection?.chains || [])].join('|');
  }

  function ensureBridgeChainSupported(collection, chainKey, role) {
    if (!collection?.chains?.has(chainKey)) {
      const err = new Error(`${collection?.label || 'NFT'} ${role} chain is not supported. Use ${bridgeCollectionChainList(collection)}.`);
      err.status = 400;
      throw err;
    }
  }

  function bridgeDeploymentOf(chainKey, collectionSlug) {
    return deploymentOf(chainKey, collectionSlug);
  }

  function evmDestSpec(chainKey, collectionSlug, deployment = null) {
    const baseSpec = EVM_DEST_DOMAIN[chainKey];
    if (!baseSpec) return null;
    if (normalizeBridgeCollectionSlug(collectionSlug) === 'demonking') return baseSpec;
    return {
      chainId: baseSpec.chainId,
      name: deployment?.eip712Name || `ClashCollection:${collectionSlug}:${chainKey}`,
      version: deployment?.eip712Version || '1',
    };
  }

  // Lightweight per-chain destAddress normalizer. Aligns the API boundary
  // with the actual on-chain shape and keeps bridge memo/receipt data stable.
  function normalizeDestAddressForChain(chainKey, addr) {
    const s = String(addr || '').trim();
    if (SUPPORTED_EVM_CHAINS[chainKey]) {
      return /^0x[0-9a-fA-F]{40}$/.test(s) ? s : null;
    }
    if (chainKey === 'aptos') {
      return normalizeAptosAddress(s);
    }
    if (chainKey === 'solana') {
      try {
        const { PublicKey } = require('@solana/web3.js');
        return new PublicKey(s).toBase58();
      } catch {
        return null;
      }
    }
    return null;
  }

  // res.json crashes on BigInt — recursively stringify any BigInt fields in
  // a burn-snapshot before serialising.
  function jsonable(obj) {
    if (obj === null || obj === undefined) return obj;
    if (typeof obj === 'bigint') return obj.toString();
    if (Array.isArray(obj)) return obj.map(jsonable);
    if (typeof obj === 'object') {
      const out = {};
      for (const k of Object.keys(obj)) out[k] = jsonable(obj[k]);
      return out;
    }
    return obj;
  }

  const BRIDGE_BURN_EVENT_ABI = [{
    type: 'event',
    name: 'BridgeBurn',
    inputs: [
      { name: 'tokenId', type: 'uint256', indexed: true },
      { name: 'owner', type: 'address', indexed: true },
      { name: 'level', type: 'uint8', indexed: false },
      { name: 'destinationChainId', type: 'uint256', indexed: false },
    ],
  }];

  const BRIDGE_FEE_USD_E6 = BigInt(process.env.NFT_BRIDGE_FEE_USD_E6 || '200000'); // $0.20
  const BRIDGE_NATIVE = {
    base:     { asset: 'eth', symbol: 'ETH', decimals: 18, explicitEnv: ['NFT_BRIDGE_BASE_FEE_WEI', 'NFT_BRIDGE_EVM_FEE_WEI'] },
    arbitrum: { asset: 'eth', symbol: 'ETH', decimals: 18, explicitEnv: ['NFT_BRIDGE_ARBITRUM_FEE_WEI', 'NFT_BRIDGE_EVM_FEE_WEI'] },
    monad:    { asset: 'mon', symbol: 'MON', decimals: 18, explicitEnv: ['NFT_BRIDGE_MONAD_FEE_WEI'] },
    ink:      { asset: 'eth', symbol: 'ETH', decimals: 18, explicitEnv: ['NFT_BRIDGE_INK_FEE_WEI', 'NFT_BRIDGE_EVM_FEE_WEI'] },
    aptos:    { asset: 'apt', symbol: 'APT', decimals: 8,  explicitEnv: ['NFT_BRIDGE_APTOS_FEE_OCTAS'] },
    solana:   { asset: 'sol', symbol: 'SOL', decimals: 9,  explicitEnv: ['NFT_BRIDGE_SOLANA_FEE_LAMPORTS'] },
  };

  function decimalUsdToE6(value) {
    const s = String(value || '').trim();
    const m = s.match(/^(\d+)(?:\.(\d+))?$/);
    if (!m) throw new Error(`Bad USD price: ${value}`);
    const whole = BigInt(m[1]);
    const frac = BigInt((m[2] || '').slice(0, 6).padEnd(6, '0') || '0');
    return whole * 1_000_000n + frac;
  }

  function explicitFeeUnitsFor(chainKey) {
    const cfg = BRIDGE_NATIVE[chainKey];
    for (const envName of cfg?.explicitEnv || []) {
      const raw = process.env[envName];
      if (raw && /^\d+$/.test(String(raw))) return { amount: BigInt(raw), source: envName };
    }
    return null;
  }

  async function quoteNativeBridgeFee(sourceChain, sourceContract) {
    const cfg = BRIDGE_NATIVE[sourceChain];
    if (!cfg) return null;

    const explicit = explicitFeeUnitsFor(sourceChain);
    if (explicit) {
      return {
        usdPriceE6: BRIDGE_FEE_USD_E6.toString(),
        amount: explicit.amount,
        amountFormatted: formatUnits(explicit.amount, cfg.decimals),
        decimals: cfg.decimals,
        symbol: cfg.symbol,
        source: explicit.source,
      };
    }

    if (EVM_CHAINS.has(sourceChain) && sourceContract) {
      try {
        const { createPublicClient, getAddress, http } = await import('viem');
        const client = createPublicClient({ transport: http(evmRpc(sourceChain, process.env)) });
        const feeWei = await client.readContract({
          address: getAddress(sourceContract), abi: NFT_V3_ABI, functionName: 'bridgeFeeWei',
        });
        if (feeWei > 0n) {
          return {
            usdPriceE6: BRIDGE_FEE_USD_E6.toString(),
            amount: feeWei,
            amountFormatted: formatUnits(feeWei, cfg.decimals),
            decimals: cfg.decimals,
            symbol: cfg.symbol,
            source: 'contract.bridgeFeeWei',
          };
        }
      } catch { /* older impl or RPC issue: fall back to USD quote */ }
    }

    const priceUsdE6 = decimalUsdToE6(await ctx.fetchNftUsdPrice(cfg.asset));
    if (priceUsdE6 <= 0n) throw new Error(`${cfg.symbol}/USD price unavailable`);
    const scale = 10n ** BigInt(cfg.decimals);
    const amount = (BRIDGE_FEE_USD_E6 * scale + priceUsdE6 - 1n) / priceUsdE6;
    return {
      usdPriceE6: BRIDGE_FEE_USD_E6.toString(),
      amount,
      amountFormatted: formatUnits(amount, cfg.decimals),
      decimals: cfg.decimals,
      symbol: cfg.symbol,
      source: `${cfg.symbol}/USD ${priceUsdE6.toString()}`,
    };
  }

  function bridgeFeeJson(fee) {
    if (!fee) return null;
    return {
      usdPriceE6: fee.usdPriceE6,
      amount: fee.amount.toString(),
      amountFormatted: fee.amountFormatted,
      decimals: fee.decimals,
      symbol: fee.symbol,
      source: fee.source,
    };
  }

  function evmBridgeFeePaidFromReceipt(txRcp, sourceProxy, keccak256) {
    const bridgeFeeTopic = keccak256(new TextEncoder().encode('BridgeFeePaid(address,uint256,uint256,uint256)'));
    const proxy = String(sourceProxy || '').toLowerCase();
    let paid = 0n;
    for (const log of txRcp?.logs || []) {
      if (String(log.address || '').toLowerCase() !== proxy) continue;
      if (log.topics?.[0] !== bridgeFeeTopic) continue;
      const dataHex = String(log.data || '').replace(/^0x/, '');
      if (dataHex.length < 128) continue;
      paid += BigInt(`0x${dataHex.slice(64, 128)}`);
    }
    return paid;
  }

  function bridgeLogRequestId(req) {
    const fromHeader = req.headers?.['x-request-id'] || req.headers?.['x-correlation-id'];
    if (Array.isArray(fromHeader) && fromHeader[0]) return String(fromHeader[0]).slice(0, 128);
    if (fromHeader) return String(fromHeader).slice(0, 128);
    return crypto.randomUUID ? crypto.randomUUID() : crypto.randomBytes(16).toString('hex');
  }

  function bridgeLogPhase(req) {
    const url = String(req.originalUrl || req.url || '');
    if (url.includes('/bridge/init')) return 'init';
    if (url.includes('/bridge/confirm')) return 'confirm';
    if (url.includes('/bridge/relay')) return 'relay';
    return 'bridge';
  }

  function bridgeLogText(value, max = 700) {
    if (value === null || value === undefined) return null;
    const s = String(value);
    return s.length > max ? `${s.slice(0, max)}...` : s;
  }

  function bridgeLogData(payload, httpStatus, req = null) {
    const body = jsonable(payload || {});
    const out = {
      httpStatus,
      batch: req?.body?.batchId ? {
        id: String(req.body.batchId).slice(0, 96),
        index: Number(req.body.batchIndex) || null,
        total: Number(req.body.batchTotal) || null,
      } : null,
      mode: body.mode || null,
      destinationChainId: body.destinationChainId || body.destChainId || null,
      bridgeFee: body.bridgeFee || null,
      destContract: body.destContract || null,
      destModule: body.destModule || null,
      gasUsed: body.gasUsed || null,
      assetAddress: body.assetAddress || null,
      tokenAccount: body.tokenAccount || null,
      standard: body.standard || null,
      txSig: body.txSig || null,
      destTxHash: body.destTxHash || null,
      note: body.note || null,
      retryable: body.retryable || null,
      retryAfterSec: body.retryAfterSec || null,
      error: body.error || null,
    };
    try {
      const text = JSON.stringify(out);
      return text.length > 4000 ? `${text.slice(0, 4000)}...` : text;
    } catch {
      return JSON.stringify({ httpStatus });
    }
  }

  function bridgeLogDestTxOrAsset(payload) {
    const body = payload || {};
    if (body.destTxHash) return String(body.destTxHash);
    if (body.assetAddress && body.txSig) return `${body.assetAddress}@${body.txSig}`;
    if (body.txSig) return String(body.txSig);
    if (body.priorDestTxOrAsset) return String(body.priorDestTxOrAsset);
    return null;
  }

  function recordBridgeLog(row) {
    if (!insertBridgeLogStmt) return;
    try {
      const level = Number(row.level);
      insertBridgeLogStmt.run(
        row.request_id,
        row.phase,
        row.status,
        row.source_chain || null,
        row.dest_chain || null,
        row.source_ref || null,
        row.burn_tx_hash || null,
        row.dest_address || null,
        row.dest_tx_or_asset || null,
        Number.isFinite(level) ? level : null,
        bridgeLogText(row.error, 700),
        row.data || null,
        row.ip || null,
      );
    } catch (err) {
      console.warn('[bridge-log] sqlite write failed:', err?.message || err);
    }
  }

  router.use('/bridge', (req, res, next) => {
    const requestId = bridgeLogRequestId(req);
    res.set('X-Bridge-Request-Id', requestId);

    let logged = false;
    const logResponse = (payload) => {
      if (logged) return;
      logged = true;
      const body = jsonable(payload || {});
      recordBridgeLog({
        request_id: requestId,
        phase: bridgeLogPhase(req),
        status: res.statusCode >= 400 ? 'error' : 'ok',
        source_chain: body.sourceChain || req.body?.sourceChain || null,
        dest_chain: body.destChain || req.body?.destChain || null,
        source_ref: body.sourceRef || req.body?.sourceRef || null,
        burn_tx_hash: req.body?.burnTxHash || null,
        dest_address: body.destAddress || body.recipient || req.body?.destAddress || null,
        dest_tx_or_asset: bridgeLogDestTxOrAsset(body),
        level: body.level || body.burned?.level || req.body?.level || null,
        error: res.statusCode >= 400 ? (body.error || `HTTP ${res.statusCode}`) : null,
        data: bridgeLogData(body, res.statusCode, req),
        ip: req.ip || req.connection?.remoteAddress || null,
      });
    };

    const originalJson = res.json.bind(res);
    res.json = (payload) => {
      logResponse(payload);
      return originalJson(payload);
    };
    res.on('finish', () => logResponse(null));
    next();
  });

  // POST /bridge/init — returns instructions for the burn tx.
  router.post('/bridge/init', async (req, res) => {
    try {
      const ip = req.ip || 'unknown';
      const rl = bridgeLimit(ip);
      if (!rl.ok) {
        res.set('Retry-After', String(rl.retryAfterSec));
        return res.status(429).json({ error: 'rate limited', retryable: true, retryAfterSec: rl.retryAfterSec });
      }

      const { getAddress, isAddress } = await import('viem');
      const collection = bridgeCollectionFromReq(req);
      if (!collection) return res.status(400).json({ error: 'Unsupported NFT collection. Use demonking, voidspore, or dragon.' });
      const collectionSlug = collection.slug;
      const sourceChain = String(req.body?.sourceChain || '').toLowerCase();
      const destChain   = String(req.body?.destChain   || '').toLowerCase();
      const tokenIdRaw  = req.body?.sourceTokenId;
      const destAddress = normalizeDestAddressForChain(destChain, req.body?.destAddress);
      const sourceOwner = String(req.body?.sourceOwner || '');

      if (sourceChain === destChain) return res.status(400).json({ error: 'sourceChain == destChain' });
      if (!ALL_CHAINS.includes(destChain)) return res.status(400).json({ error: 'Unsupported destChain. Use base|arbitrum|monad|ink|aptos|solana.' });
      if (!ALL_CHAINS.includes(sourceChain)) return res.status(400).json({ error: 'Unsupported sourceChain. Use base|arbitrum|monad|ink|aptos|solana.' });
      ensureBridgeChainSupported(collection, sourceChain, 'source');
      ensureBridgeChainSupported(collection, destChain, 'destination');
      const destSpec = evmDestSpec(destChain, collectionSlug);  // null for non-EVM
      if (!destAddress) {
        return res.status(400).json({ error: `destAddress malformed for chain "${destChain}"` });
      }

      // Source = EVM (Base/Arbitrum/Monad): instruct user to call bridgeBurn.
      if (EVM_CHAINS.has(sourceChain)) {
        if (tokenIdRaw === undefined) return res.status(400).json({ error: 'sourceTokenId required' });
        const sourceDeployment = bridgeDeploymentOf(sourceChain, collectionSlug);
        if (!sourceDeployment?.proxy && !sourceDeployment?.contract) return res.status(503).json({ error: `${collection.label} ${sourceChain} contract not deployed yet` });
        const sourceProxy = sourceDeployment.proxy || sourceDeployment.contract;
        // destChainId works for ALL destinations (EVM uses block.chainid, Aptos/Solana
        // use the synthetic ids from CHAIN_IDS). EVM dest emits the value into the
        // BridgeBurn event verbatim; the orchestrator's /bridge/confirm cross-checks it.
        const destChainId = destSpec ? destSpec.chainId : CHAIN_IDS[destChain];
        const bridgeFee = await quoteNativeBridgeFee(sourceChain, sourceProxy);
        return res.json({
          collection: collectionSlug,
          mode: 'evm-burn',
          sourceChain,
          sourceContract: getAddress(sourceProxy),
          sourceChainId: EVM_DEST_DOMAIN[sourceChain].chainId,
          burn: {
            functionName: 'bridgeBurn',
            args: [String(tokenIdRaw), String(destChainId)],
            value: bridgeFee.amount.toString(),
            humanReadable: `bridgeBurn(tokenId=${tokenIdRaw}, destinationChainId=${destChainId})`,
          },
          bridgeFee: bridgeFeeJson(bridgeFee),
          destChain,
          destChainId,
          // Only EVM destinations get the checksummed form; Aptos/Solana keep raw.
          destAddress: destSpec ? getAddress(destAddress) : destAddress,
        });
      }

      // Source = Aptos: instruct user to call bridge_burn on the Move module.
      if (sourceChain === 'aptos') {
        const aptosDeploy = bridgeDeploymentOf('aptos', collectionSlug);
        if (!aptosDeploy?.module) return res.status(503).json({ error: 'Aptos module not deployed' });
        if (!req.body?.sourceTokenAddress) return res.status(400).json({ error: 'sourceTokenAddress required (Aptos token object address)' });
        const bridgeFee = await quoteNativeBridgeFee('aptos');
        return res.json({
          collection: collectionSlug,
          mode: 'aptos-burn',
          sourceChain,
          sourceModule: aptosDeploy.module,
          sourceChainId: CHAIN_IDS.aptos,
          burn: {
            functionName: 'bridge_burn',
            args: [String(req.body.sourceTokenAddress), String(destSpec ? destSpec.chainId : CHAIN_IDS[destChain])],
            humanReadable: `bridge_burn(token=${req.body.sourceTokenAddress}, destChainId=${CHAIN_IDS[destChain]})`,
          },
          bridgeFee: bridgeFeeJson(bridgeFee),
          destChain,
          destChainId: CHAIN_IDS[destChain],
          destAddress,
        });
      }

      // Source = Solana: instruct user to burn the asset with a memo.
      if (sourceChain === 'solana') {
        if (!req.body?.sourceAsset) return res.status(400).json({ error: 'sourceAsset required (Solana asset pubkey)' });
        if (!sourceOwner) return res.status(400).json({ error: 'sourceOwner required for Solana bridge' });
        const assetInfo = await getSolanaBridgeAssetInfo(String(req.body.sourceAsset), sourceOwner, { collection: collectionSlug });
        const bridgeFee = await quoteNativeBridgeFee('solana');
        const solanaDeploy = bridgeDeploymentOf('solana', collectionSlug);
        const feeTreasury = process.env.NFT_BRIDGE_SOLANA_TREASURY
          || process.env.NFT_SOLANA_TREASURY
          || solanaDeploy?.treasury
          || null;
        if (bridgeFee.amount > 0n && !feeTreasury) {
          return res.status(503).json({ error: 'Solana bridge fee treasury not configured' });
        }
        const memo = buildSolanaBridgeMemo({
          asset: assetInfo.asset,
          owner: assetInfo.owner,
          collection: assetInfo.collection,
          level: assetInfo.level,
          destinationChainId: CHAIN_IDS[destChain],
          destAddress,
          feeLamports: bridgeFee.amount,
        });
        return res.json({
          collection: collectionSlug,
          mode: 'solana-burn',
          sourceChain,
          sourceChainId: CHAIN_IDS.solana,
          burn: {
            program: assetInfo.standard === 'token2022' ? 'spl-token-2022' : 'mpl-core',
            instruction: 'burn',
            asset: req.body.sourceAsset,
            mint: assetInfo.standard === 'token2022' ? (assetInfo.mint || assetInfo.asset) : null,
            tokenAccount: assetInfo.tokenAccount || null,
            collection: assetInfo.collection,
            owner: assetInfo.owner,
            level: assetInfo.level,
            requiredMemo: memo,
            note: 'Burn the asset, include the signed memo, and pay the bridge fee transfer in the same tx.',
          },
          bridgeFee: bridgeFeeJson(bridgeFee),
          feeTreasury,
          destChain,
          destChainId: CHAIN_IDS[destChain],
          destAddress,
        });
      }
      return res.status(400).json({ error: 'Unsupported sourceChain' });
    } catch (err) {
      ctx.logError?.('bridge-init', err);
      res.status(err?.status || 500).json({ error: (err?.message || 'init failed').slice(0, 200) });
    }
  });

  // POST /bridge/confirm — verifies burn on source, mints/signs for destination.
  router.post('/bridge/confirm', async (req, res) => {
    try {
      const ip = req.ip || 'unknown';
      const rl = bridgeLimit(ip);
      if (!rl.ok) {
        res.set('Retry-After', String(rl.retryAfterSec));
        return res.status(429).json({ error: 'rate limited', retryable: true, retryAfterSec: rl.retryAfterSec });
      }

      const collection = bridgeCollectionFromReq(req);
      if (!collection) return res.status(400).json({ error: 'Unsupported NFT collection. Use demonking, voidspore, or dragon.' });
      const collectionSlug = collection.slug;
      const sourceChain = String(req.body?.sourceChain || '').toLowerCase();
      const destChain   = String(req.body?.destChain   || '').toLowerCase();
      const burnTxHash  = String(req.body?.burnTxHash  || '');
      const destAddress = normalizeDestAddressForChain(destChain, req.body?.destAddress);

      if (!ALL_CHAINS.includes(sourceChain) || !ALL_CHAINS.includes(destChain)) {
        return res.status(400).json({ error: 'Unsupported chain. Use base|arbitrum|monad|ink|aptos|solana.' });
      }
      if (sourceChain === destChain) return res.status(400).json({ error: 'sourceChain == destChain' });
      ensureBridgeChainSupported(collection, sourceChain, 'source');
      ensureBridgeChainSupported(collection, destChain, 'destination');
      if (!destAddress) {
        return res.status(400).json({ error: `destAddress malformed for chain "${destChain}"` });
      }
      if (!burnTxHash) return res.status(400).json({ error: 'burnTxHash required' });
      const grandfatheredBridge = findBridgeRefByBurn(burnTxHash, destChain);

      // ── Step 1: verify source burn ──
      let burned;
      if (EVM_CHAINS.has(sourceChain)) {
        const { createPublicClient, getAddress, http, keccak256 } = await import('viem');
        const sourceDeployment = bridgeDeploymentOf(sourceChain, collectionSlug);
        if (!sourceDeployment?.proxy && !sourceDeployment?.contract) return res.status(503).json({ error: `${collection.label} ${sourceChain} contract not deployed` });
        const sourceProxyAddress = sourceDeployment.proxy || sourceDeployment.contract;
        if (!/^0x[0-9a-fA-F]{64}$/.test(burnTxHash)) return res.status(400).json({ error: 'EVM burnTxHash malformed' });
        const client = createPublicClient({ transport: http(evmRpc(sourceChain, process.env)) });
        const txRcp = await client.getTransactionReceipt({ hash: burnTxHash });
        if (!txRcp || txRcp.status !== 'success') return res.status(404).json({ error: 'burn tx not found or reverted' });
        const head = await client.getBlock();
        const confirmations = Number(head.number - txRcp.blockNumber);
        if (confirmations < 2) {
          return res.status(425).json({
            error: `need 2 confirmations, have ${confirmations}`,
            retryable: true,
            retryAfterSec: 45,
          });
        }
        const sourceTx = await client.getTransaction({ hash: burnTxHash });
        const requiredFee = await quoteNativeBridgeFee(sourceChain, sourceProxyAddress);
        const sourceProxy = getAddress(sourceProxyAddress).toLowerCase();
        const feePaid = [
          BigInt(sourceTx?.value || 0),
          evmBridgeFeePaidFromReceipt(txRcp, sourceProxy, keccak256),
        ].reduce((max, n) => n > max ? n : max, 0n);
        if (!grandfatheredBridge && feePaid < requiredFee.amount) {
          return res.status(402).json({
            error: `Bridge fee under-paid: need ${requiredFee.amount} wei, paid ${feePaid}`,
            bridgeFee: bridgeFeeJson(requiredFee),
          });
        }
        const burnTopic = keccak256(new TextEncoder().encode('BridgeBurn(uint256,address,uint8,uint256)'));
        const log = txRcp.logs.find((l) => l.address.toLowerCase() === sourceProxy && l.topics[0] === burnTopic);
        if (!log) return res.status(404).json({ error: 'BridgeBurn event not in tx logs' });
        const dataHex = log.data.replace(/^0x/, '');
        burned = {
          kind: 'evm',
          tokenId: BigInt(log.topics[1]).toString(),
          owner: '0x' + log.topics[2].slice(26),
          level: Number(BigInt('0x' + dataHex.slice(0, 64))),
          destinationChainId: BigInt('0x' + dataHex.slice(64, 128)),
          confirmations,
          feePaid: feePaid.toString(),
          bridgeFeeRequired: requiredFee.amount.toString(),
        };
      } else if (sourceChain === 'aptos') {
        if (!/^0x[0-9a-fA-F]{64}$/.test(burnTxHash)) return res.status(400).json({ error: 'Aptos burnTxHash malformed' });
        const r = await verifyAptosBurnTx(burnTxHash, { collection: collectionSlug });
        if (r.error) return res.status(404).json({ error: `Aptos verify: ${r.error}` });
        const requiredFee = await quoteNativeBridgeFee('aptos');
        const feePaid = BigInt(r.feePaidOctas || 0);
        if (!grandfatheredBridge && feePaid < requiredFee.amount) {
          return res.status(402).json({
            error: `Bridge fee under-paid: need ${requiredFee.amount} octas, paid ${feePaid}`,
            bridgeFee: bridgeFeeJson(requiredFee),
          });
        }
        burned = {
          kind: 'aptos',
          tokenAddress: r.tokenAddress,
          owner: r.owner,
          level: r.level,
          destinationChainId: r.destinationChainId,
          tokenIndex: r.tokenIndex,
          feePaidOctas: feePaid.toString(),
          bridgeFeeRequiredOctas: requiredFee.amount.toString(),
        };
      } else if (sourceChain === 'solana') {
        const r = await verifySolanaBurnTx(burnTxHash, { allowLegacy: !!grandfatheredBridge, collection: collectionSlug });
        if (r.error) return res.status(404).json({ error: `Solana verify: ${r.error}` });
        burned = {
          kind: 'solana',
          asset: r.asset,
          level: r.level,
          destinationChainId: r.destinationChainId,
          destAddressFromMemo: r.destAddress,
          feePaidLamports: r.feePaidLamports?.toString?.() || '0',
          bridgeFeeRequiredLamports: r.feeLamports?.toString?.() || '0',
        };
        // The destination address embedded in the burn's memo must match
        // what the API caller asked for. Otherwise an attacker who can
        // observe a victim's burn could re-route the resulting NFT.
        const memoAddr  = String(r.destAddress).toLowerCase();
        const askedAddr = String(destAddress).toLowerCase();
        if (memoAddr !== askedAddr) {
          return res.status(409).json({
            error: `Burn memo destAddress (${r.destAddress}) does not match requested destAddress (${destAddress})`,
          });
        }
      }

      // Cross-check the burn's encoded destinationChainId.
      if (burned.destinationChainId !== BigInt(CHAIN_IDS[destChain])) {
        return res.status(409).json({
          error: `Burn destinationChainId ${burned.destinationChainId} != requested destChain ${destChain} (${CHAIN_IDS[destChain]})`,
        });
      }

      // ── Step 2: build sourceRef + replay-protect ──
      const sourceRefParams = burned.kind === 'evm'
        ? { tokenId: burned.tokenId }
        : burned.kind === 'aptos'
        ? { tokenAddress: burned.tokenAddress }
        : { asset: burned.asset };
      sourceRefParams.collection = collectionSlug;
      const sourceRef = await buildSourceRef(sourceChain, sourceRefParams);

      // Refuse re-issuing receipts/mints for an already-consumed (sourceRef,
      // destChain) pair. Defence-in-depth — EVM/Aptos destination contracts
      // also reject replays, but Solana destination mints are server-mediated
      // and rely solely on this ledger.
      //
      // EDGE CASE — "burn signed, mint never landed":
      //   Old code unconditionally 409'd here, leaving the player with a
      //   burned NFT and no way to redeem it without admin intervention.
      //   Now we check the destination contract's on-chain
      //   `usedBridgeRefs[sourceRef]` (EVM) or used_nonces (Aptos) — if the
      //   chain says "not consumed", the prior receipt expired or its tx
      //   never confirmed, and we drop the stale row + re-issue a fresh
      //   receipt with a new deadline. Solana destinations skip this gate
      //   because their server-mediated mint already clears the row on
      //   failure (see release-on-fail block further down).
      const prior = findUsedBridgeRef(sourceRef, destChain);
      if (prior) {
        let stillUnused = false;
        try {
          if (EVM_CHAINS.has(destChain)) {
            const { createPublicClient, getAddress, http } = await import('viem');
            const destDeployment = bridgeDeploymentOf(destChain, collectionSlug);
            const destProxyAddress = destDeployment?.proxy || destDeployment?.contract;
            const client = createPublicClient({ transport: http(evmRpc(destChain, process.env)) });
            const consumed = await client.readContract({
              address: getAddress(destProxyAddress), abi: NFT_V3_ABI,
              functionName: 'usedBridgeRefs', args: [sourceRef],
            });
            stillUnused = !consumed;
          } else if (destChain === 'aptos') {
            // Aptos: the on-chain used_nonces vector is queried via a view
            // (not exposed yet) — fall back to allowing retry. The Move
            // module itself rejects on replay anyway, so re-issuing is
            // safe from a correctness standpoint.
            stillUnused = true;
          } else if (destChain === 'solana') {
            const recovered = await recoverSolanaBridgeMintRecord(sourceRef, collectionSlug);
            if (recovered) {
              return res.json({
                collection: collectionSlug,
                mode: 'solana-mint-existing',
                sourceChain, destChain,
                burned: jsonable(burned),
                sourceRef,
                destinationChainId: CHAIN_IDS.solana,
                recipient: prior.dest_address,
                level: recovered.level || prior.level || burned.level,
                assetAddress: recovered.assetAddress,
                txSig: recovered.txSig,
                note: 'Recovered an already-minted Solana bridge asset from collection metadata.',
              });
            }
            stillUnused = true;
          }
        } catch { /* RPC down — conservative path: keep 409 */ }

        if (stillUnused) {
          // Recover the row so a fresh insert can proceed downstream.
          try {
            bridgeDb?.prepare(`DELETE FROM used_bridge_refs
              WHERE source_ref = ? AND dest_chain = ?`).run(sourceRef, destChain);
          } catch { /* best-effort */ }
          // Fall through — the rest of the handler runs as if it's the
          // first attempt, signing a brand-new receipt with extended deadline.
        } else {
          return res.status(409).json({
            error: `sourceRef already bridged to ${destChain} at ${prior.created_at}`,
            priorDestTxOrAsset: prior.dest_tx_or_asset,
          });
        }
      }

      // ── Step 3: sign / submit for destination ──
      const ttl = Math.max(60, Math.min(86_400, Number(process.env.NFT_BRIDGE_DEADLINE_SECONDS || 86_400)));
      const deadline = BigInt(Math.floor(Date.now() / 1000) + ttl);

      if (EVM_CHAINS.has(destChain)) {
        // EVM destination: sign EIP-712 BridgeReceipt for the V3 contract.
        const { getAddress } = await import('viem');
        const destDeployment = bridgeDeploymentOf(destChain, collectionSlug);
        if (!destDeployment?.proxy && !destDeployment?.contract) return res.status(503).json({ error: `${collection.label} ${destChain} contract not deployed` });
        const destProxyAddress = destDeployment.proxy || destDeployment.contract;
        const destSpec = evmDestSpec(destChain, collectionSlug, destDeployment);
        const account = await ctx.parseNftEvmAccount();
        const signature = await account.signTypedData({
          domain: {
            name: destDeployment.eip712Name || destSpec.name,
            version: destDeployment.eip712Version || destSpec.version || collection.evmEip712Version,
            chainId: destSpec.chainId,
            verifyingContract: getAddress(destProxyAddress),
          },
          types: {
            BridgeReceipt: [
              { name: 'to', type: 'address' },
              { name: 'level', type: 'uint8' },
              { name: 'sourceRef', type: 'bytes32' },
              { name: 'destinationChainId', type: 'uint256' },
              { name: 'deadline', type: 'uint256' },
            ],
          },
          primaryType: 'BridgeReceipt',
          message: {
            to: getAddress(destAddress),
            level: burned.level,
            sourceRef,
            destinationChainId: BigInt(destSpec.chainId),
            deadline,
          },
        });
        // Reserve the (sourceRef, destChain) slot before returning. EVM dest
        // contract enforces replay protection too — this is local bookkeeping
        // so a re-call to /bridge/confirm fails fast without re-signing.
        try {
          recordUsedBridgeRef({
            source_ref: sourceRef, dest_chain: destChain,
            source_chain: sourceChain, burn_tx_hash: burnTxHash,
            dest_address: destAddress, dest_tx_or_asset: null,
            level: burned.level,
          });
        } catch (err) {
          if (err.code === 'BRIDGE_REPLAY') {
            return res.status(409).json({ error: err.message });
          }
          throw err;
        }
        return res.json({
          collection: collectionSlug,
          mode: 'evm-receipt',
          sourceChain, destChain,
          burned: jsonable(burned),
          sourceRef,
          destinationChainId: destSpec.chainId,
          destContract: getAddress(destProxyAddress),
          deadline: deadline.toString(),
          signature,
          callData: {
            functionName: 'bridgeMint',
            args: [getAddress(destAddress), burned.level, sourceRef, deadline.toString(), signature],
          },
        });
      }

      if (destChain === 'aptos') {
        // Aptos destination: ed25519-sign for the Move bridge_mint function.
        if (!aptosAccount()) return res.status(503).json({ error: 'Aptos signer not configured' });
        const aptosDeploy = bridgeDeploymentOf('aptos', collectionSlug);
        if (!aptosDeploy?.module) return res.status(503).json({ error: 'Aptos module not deployed' });
        const signature = await signAptosBridgeReceipt({
          to: destAddress,
          level: burned.level,
          sourceRef,
          destinationChainId: CHAIN_IDS.aptos,
          deadline,
        });
        try {
          recordUsedBridgeRef({
            source_ref: sourceRef, dest_chain: destChain,
            source_chain: sourceChain, burn_tx_hash: burnTxHash,
            dest_address: destAddress, dest_tx_or_asset: null,
            level: burned.level,
          });
        } catch (err) {
          if (err.code === 'BRIDGE_REPLAY') return res.status(409).json({ error: err.message });
          throw err;
        }
        return res.json({
          collection: collectionSlug,
          mode: 'aptos-receipt',
          sourceChain, destChain,
          burned: jsonable(burned),
          sourceRef,
          destinationChainId: CHAIN_IDS.aptos,
          destModule: aptosDeploy.module,
          deadline: deadline.toString(),
          signature,
          callData: {
            functionName: 'bridge_mint',
            args: [
              destAddress,                      // to: address
              String(burned.level),             // level: u8
              sourceRef,                        // source_ref: vector<u8>
              String(CHAIN_IDS.aptos),          // destination_chain_id: u64
              deadline.toString(),              // deadline: u64
              signature,                        // signature: vector<u8>
            ],
          },
        });
      }

      if (destChain === 'solana') {
        // Solana destination: server submits the mint itself. The user gets
        // a free new asset; we pay ~$0.001 in SOL gas from treasury.
        //
        // Reserve the slot BEFORE the mint to make concurrent /bridge/confirm
        // calls race-safe (SQLite primary-key conflict aborts the loser).
        try {
          recordUsedBridgeRef({
            source_ref: sourceRef, dest_chain: 'solana',
            source_chain: sourceChain, burn_tx_hash: burnTxHash,
            dest_address: destAddress, dest_tx_or_asset: null,
            level: burned.level,
          });
        } catch (err) {
          if (err.code === 'BRIDGE_REPLAY') return res.status(409).json({ error: err.message });
          throw err;
        }
        try {
          const mintRes = await mintSolanaAssetForBridge({
            recipient: destAddress, level: burned.level, sourceRef, collection: collectionSlug,
          });
          // Record dest tx + asset address for post-mortem.
          try {
            bridgeDb?.prepare(`UPDATE used_bridge_refs SET dest_tx_or_asset = ?
                               WHERE source_ref = ? AND dest_chain = 'solana'`)
              .run(`${mintRes.assetAddress}@${mintRes.txSig}`, sourceRef);
          } catch { /* best-effort */ }
          return res.json({
            collection: collectionSlug,
            mode: 'solana-mint',
            sourceChain, destChain,
            burned: jsonable(burned),
            sourceRef,
            destinationChainId: CHAIN_IDS.solana,
            recipient: destAddress,
            level: burned.level,
            assetAddress: mintRes.assetAddress,
            tokenAccount: mintRes.tokenAccount || null,
            standard: mintRes.standard || 'mpl-core',
            txSig: mintRes.txSig,
            note: 'Solana mint happens server-side. No further user action required.',
          });
        } catch (err) {
          // Mint failed — release the slot so the user can retry.
          try {
            bridgeDb?.prepare(`DELETE FROM used_bridge_refs
                               WHERE source_ref = ? AND dest_chain = 'solana'
                                 AND dest_tx_or_asset IS NULL`).run(sourceRef);
          } catch { /* best-effort */ }
          ctx.logError?.('bridge-confirm-solana-mint', err);
          return res.status(500).json({ error: `Solana mint failed: ${err?.message || err}` });
        }
      }

      return res.status(400).json({ error: 'Unhandled destination chain' });
    } catch (err) {
      ctx.logError?.('bridge-confirm', err);
      res.status(err?.status || 500).json({ error: (err?.message || 'confirm failed').slice(0, 200) });
    }
  });

  // ──────────────────────────────────────────────────────────────────
  // POST /bridge/relay — full server-side relay.
  //
  // User only signs the SOURCE burn tx. Once that lands, they call this
  // endpoint and the server:
  //   1. Verifies the burn (same as /bridge/confirm).
  //   2. Builds the dest-side tx itself and submits it from the deployer
  //      wallet (server pays gas — typically <$0.10 per relay).
  //   3. Returns the final dest tx hash + new asset/token id.
  //
  // Why this exists: the old flow had the user sign a second tx on the
  // dest chain. If their wallet disconnected, ran out of gas, or just
  // dismissed the prompt, the source NFT was already burned and they had
  // to either remember the receipt forever or wait for admin recovery.
  // Now any single point of failure between burn and dest mint is on the
  // server's side and we can retry deterministically.
  //
  // Gas: the same NFT_BASE-mnemonic deployer used for adminMint/deploy.
  // It already holds ETH on Base/Arb, MON on Monad, APT on Aptos — see
  // pre-deploy funding. Solana uses the candy authority (NFT_KEY) like
  // /bridge/confirm already does for the server-mediated Solana mint.
  router.post('/bridge/relay', async (req, res) => {
    try {
      const ip = req.ip || 'unknown';
      const rl = bridgeLimit(ip);
      if (!rl.ok) {
        res.set('Retry-After', String(rl.retryAfterSec));
        return res.status(429).json({ error: 'rate limited', retryable: true, retryAfterSec: rl.retryAfterSec });
      }

      const collection = bridgeCollectionFromReq(req);
      if (!collection) return res.status(400).json({ error: 'Unsupported NFT collection. Use demonking, voidspore, or dragon.' });
      const collectionSlug = collection.slug;
      const sourceChain = String(req.body?.sourceChain || '').toLowerCase();
      const destChain   = String(req.body?.destChain   || '').toLowerCase();
      const burnTxHash  = String(req.body?.burnTxHash  || '');
      const destAddress = normalizeDestAddressForChain(destChain, req.body?.destAddress);

      if (!ALL_CHAINS.includes(sourceChain) || !ALL_CHAINS.includes(destChain)) {
        return res.status(400).json({ error: 'Unsupported chain' });
      }
      if (sourceChain === destChain) return res.status(400).json({ error: 'sourceChain == destChain' });
      ensureBridgeChainSupported(collection, sourceChain, 'source');
      ensureBridgeChainSupported(collection, destChain, 'destination');
      if (!destAddress) {
        return res.status(400).json({ error: `destAddress malformed for chain "${destChain}"` });
      }
      if (!burnTxHash) return res.status(400).json({ error: 'burnTxHash required' });
      const grandfatheredBridge = findBridgeRefByBurn(burnTxHash, destChain);

      // ── 1) Verify source burn (lifted from /bridge/confirm) ──
      let burned;
      if (EVM_CHAINS.has(sourceChain)) {
        const { createPublicClient, getAddress, http, keccak256 } = await import('viem');
        const sourceDeployment = bridgeDeploymentOf(sourceChain, collectionSlug);
        if (!sourceDeployment?.proxy && !sourceDeployment?.contract) return res.status(503).json({ error: `${collection.label} ${sourceChain} contract not deployed` });
        const sourceProxyAddress = sourceDeployment.proxy || sourceDeployment.contract;
        if (!/^0x[0-9a-fA-F]{64}$/.test(burnTxHash)) return res.status(400).json({ error: 'EVM burnTxHash malformed' });
        const client = createPublicClient({ transport: http(evmRpc(sourceChain, process.env)) });
        const txRcp = await client.getTransactionReceipt({ hash: burnTxHash });
        if (!txRcp || txRcp.status !== 'success') return res.status(404).json({ error: 'burn tx not found or reverted' });
        const head = await client.getBlock();
        const confirmations = Number(head.number - txRcp.blockNumber);
        if (confirmations < 2) {
          return res.status(425).json({
            error: `need 2 confirmations, have ${confirmations}`,
            retryable: true,
            retryAfterSec: 45,
          });
        }
        const sourceTx = await client.getTransaction({ hash: burnTxHash });
        const requiredFee = await quoteNativeBridgeFee(sourceChain, sourceProxyAddress);
        const sourceProxy = getAddress(sourceProxyAddress).toLowerCase();
        const feePaid = [
          BigInt(sourceTx?.value || 0),
          evmBridgeFeePaidFromReceipt(txRcp, sourceProxy, keccak256),
        ].reduce((max, n) => n > max ? n : max, 0n);
        if (!grandfatheredBridge && feePaid < requiredFee.amount) {
          return res.status(402).json({
            error: `Bridge fee under-paid: need ${requiredFee.amount} wei, paid ${feePaid}`,
            bridgeFee: bridgeFeeJson(requiredFee),
          });
        }
        const burnTopic = keccak256(new TextEncoder().encode('BridgeBurn(uint256,address,uint8,uint256)'));
        const log = txRcp.logs.find((l) => l.address.toLowerCase() === sourceProxy && l.topics[0] === burnTopic);
        if (!log) return res.status(404).json({ error: 'BridgeBurn event not in tx logs' });
        const dataHex = log.data.replace(/^0x/, '');
        burned = {
          kind: 'evm',
          tokenId: BigInt(log.topics[1]).toString(),
          owner: '0x' + log.topics[2].slice(26),
          level: Number(BigInt('0x' + dataHex.slice(0, 64))),
          destinationChainId: BigInt('0x' + dataHex.slice(64, 128)),
          feePaid: feePaid.toString(),
          bridgeFeeRequired: requiredFee.amount.toString(),
        };
      } else if (sourceChain === 'aptos') {
        if (!/^0x[0-9a-fA-F]{64}$/.test(burnTxHash)) return res.status(400).json({ error: 'Aptos burnTxHash malformed' });
        const r = await verifyAptosBurnTx(burnTxHash, { collection: collectionSlug });
        if (r.error) return res.status(404).json({ error: `Aptos verify: ${r.error}` });
        const requiredFee = await quoteNativeBridgeFee('aptos');
        const feePaid = BigInt(r.feePaidOctas || 0);
        if (!grandfatheredBridge && feePaid < requiredFee.amount) {
          return res.status(402).json({
            error: `Bridge fee under-paid: need ${requiredFee.amount} octas, paid ${feePaid}`,
            bridgeFee: bridgeFeeJson(requiredFee),
          });
        }
        burned = { kind: 'aptos', tokenAddress: r.tokenAddress, owner: r.owner,
          level: r.level, destinationChainId: r.destinationChainId,
          feePaidOctas: feePaid.toString(), bridgeFeeRequiredOctas: requiredFee.amount.toString() };
      } else if (sourceChain === 'solana') {
        const r = await verifySolanaBurnTx(burnTxHash, { allowLegacy: !!grandfatheredBridge, collection: collectionSlug });
        if (r.error) return res.status(404).json({ error: `Solana verify: ${r.error}` });
        if (String(r.destAddress).toLowerCase() !== String(destAddress).toLowerCase()) {
          return res.status(409).json({ error: `Memo destAddress (${r.destAddress}) != requested (${destAddress})` });
        }
        burned = {
          kind: 'solana',
          asset: r.asset,
          level: r.level,
          destinationChainId: r.destinationChainId,
          feePaidLamports: r.feePaidLamports?.toString?.() || '0',
          bridgeFeeRequiredLamports: r.feeLamports?.toString?.() || '0',
        };
      }

      if (burned.destinationChainId !== BigInt(CHAIN_IDS[destChain])) {
        return res.status(409).json({
          error: `Burn destinationChainId ${burned.destinationChainId} != ${destChain} (${CHAIN_IDS[destChain]})`,
        });
      }

      // ── 2) Build sourceRef + replay-protect with smart retry ──
      const sourceRefParams = burned.kind === 'evm'
        ? { tokenId: burned.tokenId }
        : burned.kind === 'aptos'
        ? { tokenAddress: burned.tokenAddress }
        : { asset: burned.asset };
      sourceRefParams.collection = collectionSlug;
      const sourceRef = await buildSourceRef(sourceChain, sourceRefParams);

      const prior = findUsedBridgeRef(sourceRef, destChain);
      if (prior) {
        if (prior.dest_tx_or_asset) {
          const [assetAddress, txSig] = String(prior.dest_tx_or_asset).includes('@')
            ? String(prior.dest_tx_or_asset).split('@')
            : [null, prior.dest_tx_or_asset];
          return res.json({
            collection: collectionSlug,
            mode: 'relay-existing',
            sourceChain,
            destChain,
            burned: jsonable(burned),
            sourceRef,
            destAddress: prior.dest_address,
            level: prior.level,
            destTxHash: txSig,
            assetAddress,
            note: 'Bridge was already completed; returning the recorded destination result.',
          });
        }
        // Same smart-retry logic as /bridge/confirm — if the dest contract
        // still hasn't consumed this sourceRef, the prior attempt failed
        // before landing, and we drop the stale row to retry.
        let stillUnused = false;
        try {
          if (EVM_CHAINS.has(destChain)) {
            const { createPublicClient, getAddress, http } = await import('viem');
            const destDeployment = bridgeDeploymentOf(destChain, collectionSlug);
            const destProxyAddress = destDeployment?.proxy || destDeployment?.contract;
            const client = createPublicClient({ transport: http(evmRpc(destChain, process.env)) });
            const consumed = await client.readContract({
              address: getAddress(destProxyAddress), abi: NFT_V3_ABI,
              functionName: 'usedBridgeRefs', args: [sourceRef],
            });
            stillUnused = !consumed;
          } else if (destChain === 'aptos') { stillUnused = true; }
          else if (destChain === 'solana') {
            const recovered = await recoverSolanaBridgeMintRecord(sourceRef, collectionSlug);
            if (recovered) {
              return res.json({
                collection: collectionSlug,
                mode: 'relay-existing',
                sourceChain,
                destChain,
                burned: jsonable(burned),
                sourceRef,
                destAddress: prior.dest_address,
                level: recovered.level || prior.level || burned.level,
                destTxHash: recovered.txSig,
                assetAddress: recovered.assetAddress,
                note: 'Recovered an already-minted Solana bridge asset from collection metadata.',
              });
            }
            stillUnused = true;
          }
        } catch { /* keep prior on RPC failure */ }
        if (stillUnused) {
          try { bridgeDb?.prepare(`DELETE FROM used_bridge_refs WHERE source_ref = ? AND dest_chain = ?`).run(sourceRef, destChain); } catch {}
        } else {
          return res.status(409).json({
            error: `sourceRef already bridged to ${destChain} at ${prior.created_at}`,
            priorDestTxOrAsset: prior.dest_tx_or_asset,
          });
        }
      }

      // Reserve the slot. Released on submission failure so the user can retry.
      try {
        recordUsedBridgeRef({
          source_ref: sourceRef, dest_chain: destChain,
          source_chain: sourceChain, burn_tx_hash: burnTxHash,
          dest_address: destAddress, dest_tx_or_asset: null,
          level: burned.level,
        });
      } catch (err) {
        if (err.code === 'BRIDGE_REPLAY') return res.status(409).json({ error: err.message });
        throw err;
      }

      const releaseSlotOnFail = () => {
        try {
          bridgeDb?.prepare(`DELETE FROM used_bridge_refs
            WHERE source_ref = ? AND dest_chain = ? AND dest_tx_or_asset IS NULL`).run(sourceRef, destChain);
        } catch { /* best-effort */ }
      };

      const ttl = Math.max(60, Math.min(86_400, Number(process.env.NFT_BRIDGE_DEADLINE_SECONDS || 86_400)));
      const deadline = BigInt(Math.floor(Date.now() / 1000) + ttl);

      // ── 3) Submit dest tx server-side ───────────────────────────
      try {
        if (EVM_CHAINS.has(destChain)) {
          // Sign EIP-712 receipt, then send a bridgeMint tx ourselves
          // from the deployer wallet. Deployer is the same key used for
          // the V3 deploy/upgrade — it already holds enough gas on each
          // chain. Anyone can submit bridgeMint(...) given a valid signed
          // receipt, so the dest-side `recipient` field still goes to the
          // player's `destAddress` regardless of who sends the tx.
          const { createPublicClient, createWalletClient, getAddress, http } = await import('viem');
          const viemChains = await import('viem/chains');
          const { defineChain } = await import('viem');
          const chainViem = evmViemChain(destChain, defineChain, viemChains);

          const destDeployment = bridgeDeploymentOf(destChain, collectionSlug);
          if (!destDeployment?.proxy && !destDeployment?.contract) return res.status(503).json({ error: `${collection.label} ${destChain} contract not deployed` });
          const destProxyAddress = destDeployment.proxy || destDeployment.contract;
          const destSpec = evmDestSpec(destChain, collectionSlug, destDeployment);

          // Reuse the ctx.parseNftEvmAccount() viem account for BOTH the
          // EIP-712 signature AND the on-chain submission. Same key signs
          // and submits = no separate "relayer" key to manage.
          const account = await ctx.parseNftEvmAccount();
          const signature = await account.signTypedData({
            domain: {
              name: destDeployment.eip712Name || destSpec.name,
              version: destDeployment.eip712Version || destSpec.version || collection.evmEip712Version,
              chainId: destSpec.chainId,
              verifyingContract: getAddress(destProxyAddress),
            },
            types: {
              BridgeReceipt: [
                { name: 'to', type: 'address' }, { name: 'level', type: 'uint8' },
                { name: 'sourceRef', type: 'bytes32' }, { name: 'destinationChainId', type: 'uint256' },
                { name: 'deadline', type: 'uint256' },
              ],
            },
            primaryType: 'BridgeReceipt',
            message: {
              to: getAddress(destAddress), level: burned.level, sourceRef,
              destinationChainId: BigInt(destSpec.chainId), deadline,
            },
          });

          const publicClient = createPublicClient({ chain: chainViem, transport: http(evmRpc(destChain, process.env)) });
          const walletClient = createWalletClient({ account, chain: chainViem, transport: http(evmRpc(destChain, process.env)) });

          const hash = await walletClient.writeContract({
            address: getAddress(destProxyAddress),
            abi: [{
              type: 'function', name: 'bridgeMint', stateMutability: 'nonpayable',
              inputs: [
                { name:'to', type:'address' }, { name:'level', type:'uint8' },
                { name:'sourceRef', type:'bytes32' }, { name:'deadline', type:'uint256' },
                { name:'signature', type:'bytes' },
              ], outputs: [],
            }],
            functionName: 'bridgeMint',
            args: [getAddress(destAddress), burned.level, sourceRef, deadline, signature],
          });
          const rcp = await publicClient.waitForTransactionReceipt({ hash, confirmations: 2 });
          const evmDestTokenId = evmMintedTokenIdFromReceipt(rcp, destProxyAddress, destAddress);
          const rarityRows = preserveDemonKingBridgeRarity({
            collectionSlug,
            sourceChain,
            destChain,
            burned,
            destTokenIds: [evmDestTokenId],
            destOwner: getAddress(destAddress),
            sourceRef,
            destTx: hash,
          });
          const rarityRow = rarityRows[0] || null;
          try {
            bridgeDb?.prepare(`UPDATE used_bridge_refs SET dest_tx_or_asset = ?
              WHERE source_ref = ? AND dest_chain = ?`).run(hash, sourceRef, destChain);
          } catch { /* best-effort */ }
          return res.json({
            collection: collectionSlug,
            mode: 'relay-evm', sourceChain, destChain,
            burned: jsonable(burned), sourceRef,
            destChainId: destSpec.chainId, destContract: getAddress(destProxyAddress),
            destAddress: getAddress(destAddress), level: burned.level,
            tokenId: evmDestTokenId,
            rarity: rarityRow?.rarity || null,
            rarityLabel: rarityRow?.rarityLabel || null,
            destTxHash: hash, gasUsed: rcp.gasUsed?.toString?.() || null,
          });
        }

        if (destChain === 'aptos') {
          // Aptos relay — server's ed25519 account submits bridge_mint.
          // The server's key is BOTH the quote signer AND the submitter:
          // first it signs the BCS payload (verified inside the Move
          // module), then it submits the entry function via Aptos SDK.
          const aptosDeploy = bridgeDeploymentOf('aptos', collectionSlug);
          if (!aptosDeploy?.module) return res.status(503).json({ error: 'Aptos not deployed' });
          if (!aptosAccount()) return res.status(503).json({ error: 'Aptos signer not configured' });
          const signature = await require('./bridge_helpers').signAptosBridgeReceipt({
            to: destAddress, level: burned.level, sourceRef,
            destinationChainId: CHAIN_IDS.aptos, deadline,
          });
          // Build + submit via aptos SDK.
          const path = require('path');
          const sdkPath = process.env.APTOS_SDK_PATH
            || require.resolve('@aptos-labs/ts-sdk', {
              paths: [path.join(__dirname, '..', 'server-futures', 'node_modules'),
                      path.join(__dirname, '..', 'nft', 'node_modules')],
            });
          const sdk = require(sdkPath);
          const aptos = new sdk.Aptos(new sdk.AptosConfig({ network: 'mainnet' }));
          const tx = await aptos.transaction.build.simple({
            sender: aptosAccount().accountAddress,
            data: {
              function: `${aptosDeploy.module}::bridge_mint`,
              functionArguments: [
                destAddress, burned.level,
                Array.from(Buffer.from(sourceRef.replace(/^0x/, ''), 'hex')),
                Number(CHAIN_IDS.aptos), Number(deadline),
                Array.from(Buffer.from(signature.replace(/^0x/, ''), 'hex')),
              ],
            },
          });
          const submitted = await aptos.signAndSubmitTransaction({
            signer: aptosAccount(), transaction: tx,
          });
          const aptosTx = await aptos.waitForTransaction({ transactionHash: submitted.hash });
          const mintEvent = aptosMintedEventFromTx(aptosTx);
          const aptosDestTokenIndex = mintEvent?.data?.token_index != null
            ? String(mintEvent.data.token_index)
            : null;
          const aptosDestTokenAddress = mintEvent?.data?.token_address
            ? normalizeAptosAddress(mintEvent.data.token_address)
            : null;
          const rarityRows = preserveDemonKingBridgeRarity({
            collectionSlug,
            sourceChain,
            destChain,
            burned,
            destTokenIds: [aptosDestTokenIndex, aptosDestTokenAddress],
            destOwner: destAddress,
            sourceRef,
            destTx: submitted.hash,
          });
          const rarityRow = rarityRows[0] || null;
          try {
            bridgeDb?.prepare(`UPDATE used_bridge_refs SET dest_tx_or_asset = ?
              WHERE source_ref = ? AND dest_chain = ?`).run(submitted.hash, sourceRef, destChain);
          } catch { /* best-effort */ }
          return res.json({
            collection: collectionSlug,
            mode: 'relay-aptos', sourceChain, destChain,
            burned: jsonable(burned), sourceRef,
            destAddress, level: burned.level,
            tokenIndex: aptosDestTokenIndex,
            tokenAddress: aptosDestTokenAddress,
            rarity: rarityRow?.rarity || null,
            rarityLabel: rarityRow?.rarityLabel || null,
            destTxHash: submitted.hash,
          });
        }

        if (destChain === 'solana') {
          // Solana already had the relay pattern; just call its helper.
          const sourceRarity = demonKingBridgeSourceRarity(collectionSlug, sourceChain, burned);
          const mintRes = await mintSolanaAssetForBridge({
            recipient: destAddress,
            level: burned.level,
            sourceRef,
            collection: collectionSlug,
            rarityLabel: sourceRarity?.rarityLabel || null,
          });
          try {
            bridgeDb?.prepare(`UPDATE used_bridge_refs SET dest_tx_or_asset = ?
              WHERE source_ref = ? AND dest_chain = ?`)
              .run(`${mintRes.assetAddress}@${mintRes.txSig}`, sourceRef, destChain);
          } catch { /* best-effort */ }
          const rarityRows = preserveDemonKingBridgeRarity({
            collectionSlug,
            sourceChain,
            destChain,
            burned,
            destTokenIds: [mintRes.assetAddress],
            destOwner: destAddress,
            sourceRef,
            destTx: mintRes.txSig,
          });
          const rarityRow = rarityRows[0] || null;
          return res.json({
            collection: collectionSlug,
            mode: 'relay-solana', sourceChain, destChain,
            burned: jsonable(burned), sourceRef,
            destAddress, level: burned.level,
            rarity: rarityRow?.rarity || null,
            rarityLabel: rarityRow?.rarityLabel || null,
            assetAddress: mintRes.assetAddress, tokenAccount: mintRes.tokenAccount || null,
            standard: mintRes.standard || 'mpl-core', txSig: mintRes.txSig,
          });
        }
        return res.status(400).json({ error: 'Unhandled destination chain' });
      } catch (submitErr) {
        // Submit failed — release the slot so the player can retry.
        releaseSlotOnFail();
        ctx.logError?.('bridge-relay-submit', submitErr);
        return res.status(500).json({ error: `dest tx failed: ${(submitErr?.message || submitErr).toString().slice(0, 200)}` });
      }
    } catch (err) {
      ctx.logError?.('bridge-relay', err);
      res.status(err?.status || 500).json({ error: (err?.message || 'relay failed').slice(0, 200) });
    }
  });

  // ── Solana mint helper for bridge-into-Solana. Server-mediated. ────
  async function mintSolanaAssetForBridge({ recipient, level, sourceRef, collection = 'demonking', rarityLabel = null }) {
    const collectionSlug = normalizeBridgeCollectionSlug(collection);
    const collectionLabel = collectionDisplayName(collectionSlug);
    const mintStandard = collectionSlug === 'demonking'
      ? String(process.env.NFT_SOLANA_MINT_STANDARD || 'mpl-core').toLowerCase()
      : 'mpl-core';
    const solanaDeploy = deploymentOf('solana', collectionSlug);
    if (mintStandard !== 'mpl-core' && mintStandard !== 'core') {
      const rawKey = process.env.SOLANA_NFT_KEY || process.env.NFT_SOLANA_KEY || process.env.NFT_KEY;
      if (!rawKey) throw new Error('Solana authority key missing (SOLANA_NFT_KEY / NFT_SOLANA_KEY / NFT_KEY)');
      const { mintToken2022Nft } = require('./solana_token2022_nft');
      const { Connection } = require('@solana/web3.js');
      const connection = await withSolanaRpcFallback(async (rpc) => {
        const candidate = createSolanaConnection(Connection, rpc, 'confirmed');
        await candidate.getLatestBlockhash('confirmed');
        return candidate;
      }, {
        extraUrls: [solanaDeploy?.rpcUrl],
        label: 'Solana bridge Token-2022 RPC probe',
      });
      return mintToken2022Nft({
        recipient,
        level,
        sourceRef,
        payerSecretKey: parseSolanaSecretKey(rawKey),
        connection,
      });
    }

    if (!solanaDeploy?.candyMachine || !solanaDeploy?.collection) {
      throw new Error('Solana deployment missing candyMachine or collection');
    }
    const { createUmi } = await import('@metaplex-foundation/umi-bundle-defaults');
    const { generateSigner, keypairIdentity, publicKey } = await import('@metaplex-foundation/umi');
    const { mplCore, create: createAsset, fetchCollection } = await import('@metaplex-foundation/mpl-core');

    // Authority key = the same Solana key used by the candy-machine deploy.
    // Accept SOLANA_NFT_KEY / NFT_SOLANA_KEY / NFT_KEY in any of the formats
    // supported by nft/scripts/lib-env.mjs::parseSolanaKeypair (JSON array,
    // 32-byte hex seed, or base58 secret/seed).
    const rawKey = process.env.SOLANA_NFT_KEY || process.env.NFT_SOLANA_KEY || process.env.NFT_KEY;
    if (!rawKey) throw new Error('Solana authority key missing (SOLANA_NFT_KEY / NFT_SOLANA_KEY / NFT_KEY)');
    const secretBytes = parseSolanaSecretKey(rawKey);

    // Resilient submission. Shared Solana RPC providers can return
    // "block height exceeded" on `sendAndConfirm` under load, so we:
    //   - send with skipPreflight + processed commitment for speed
    //   - retry the WHOLE build-and-send up to 3 times with a fresh blockhash
    //   - confirm via repeated getSignatureStatuses (not the bundled poll)
    const { base58 } = await import('@metaplex-foundation/umi/serializers');
    return withSolanaRpcFallback(async (rpc) => {
      const umi = createUmi(rpc).use(mplCore());
      const authKeypair = umi.eddsa.createKeypairFromSecretKey(secretBytes);
      umi.use(keypairIdentity(authKeypair));
      const collectionAccount = await fetchCollection(umi, publicKey(solanaDeploy.collection));
      let lastErr;
      for (let attempt = 1; attempt <= 3; attempt++) {
        const asset = generateSigner(umi);
        const normalizedLevel = Math.max(1, Math.min(3, Number(level || 1) || 1));
        const metadataPath = collectionSlug === 'demonking'
          ? '/api/nft/solana/bridged'
          : `/api/nft/${collectionSlug}/solana/bridged`;
        const metadataUrl = new URL(metadataPath, `${(process.env.NFT_PUBLIC_BASE_URL || 'https://clashofperps.fun').replace(/\/+$/, '')}/`);
        if (collectionSlug === 'demonking') {
          metadataUrl.searchParams.set('asset', asset.publicKey.toString());
        } else {
          metadataUrl.searchParams.set('level', String(normalizedLevel));
        }
        metadataUrl.searchParams.set('src', String(sourceRef || '').slice(0, 80));
        const plugins = collectionSlug === 'demonking'
          ? [
              {
                type: 'Attributes',
                attributeList: [
                  { key: 'Game', value: 'Clash of Perps' },
                  { key: 'Character', value: 'Demon King' },
                  { key: 'Chain', value: 'Solana' },
                  { key: 'Standard', value: 'Metaplex Core' },
                  { key: 'Rarity', value: rarityLabel || demonKingRarityLabelForTokenId('solana', asset.publicKey.toString(), normalizedLevel) },
                  { key: 'Max Supply', value: '333' },
                ],
              },
              solanaRoyaltyPlugin(publicKey, solanaDeploy),
            ].filter(Boolean)
          : [
              { type: 'Attributes', attributeList: [
                { key: 'level',     value: String(normalizedLevel) },
                { key: 'sourceRef', value: String(sourceRef) },
              ]},
            ];
        const ix = createAsset(umi, {
          asset,
          collection: collectionAccount,
          authority: umi.identity,
          name: collectionSlug === 'demonking' ? collectionLabel : `${collectionLabel} L${normalizedLevel}`,
          uri: metadataUrl.toString(),
          owner: publicKey(recipient),
          plugins,
        });
        try {
          const sig = await ix.sendAndConfirm(umi, {
            send:    { skipPreflight: true, commitment: 'processed', maxRetries: 5 },
            confirm: { commitment: 'confirmed', strategy: { type: 'blockhash' } },
          });
          const txSig = base58.deserialize(sig.signature)[0];
          return { assetAddress: asset.publicKey.toString(), txSig, standard: 'mpl-core' };
        } catch (err) {
          lastErr = err;
          const msg = String(err?.message || err);
          // Confirm-side hiccup: the tx may have actually landed even though the
          // SDK gave up waiting. Poll getSignatureStatuses by extracting the
          // signature from the error if present.
          const sigMatch = msg.match(/Signature\s+([1-9A-HJ-NP-Za-km-z]{40,88})/);
          if (sigMatch) {
            const probeSig = sigMatch[1];
            const conn = solanaConnection();
            for (let i = 0; i < 20; i++) {
              await new Promise(r => setTimeout(r, 2000));
              const s = await conn.getSignatureStatuses([probeSig]);
              const v = s?.value?.[0];
              if (v?.confirmationStatus === 'confirmed' || v?.confirmationStatus === 'finalized') {
                return { assetAddress: asset.publicKey.toString(), txSig: probeSig, standard: 'mpl-core' };
              }
              if (v?.err) break;
            }
          }
          if (!/block height|expired|already.*processed/i.test(msg) || attempt === 3) throw err;
          await new Promise(r => setTimeout(r, 1500 * attempt));  // back-off before retry
        }
      }
      throw lastErr;
    }, {
      urls: solanaRpcUrls([solanaDeploy.rpcUrl]),
      label: 'Solana bridge mint',
    });
  }

  async function recoverSolanaBridgeMintRecord(sourceRef, collection = 'demonking') {
    const collectionSlug = normalizeBridgeCollectionSlug(collection);
    const solanaDeploy = deploymentOf('solana', collectionSlug);
    if (!solanaDeploy?.collection) return null;
    const { createUmi } = await import('@metaplex-foundation/umi-bundle-defaults');
    const { mplCore, fetchAssetsByCollection } = await import('@metaplex-foundation/mpl-core');
    const { publicKey } = await import('@metaplex-foundation/umi');

    const assets = await withSolanaRpcFallback(async (rpc) => {
      const umi = createUmi(rpc).use(mplCore());
      return fetchAssetsByCollection(umi, publicKey(solanaDeploy.collection));
    }, {
      urls: solanaRpcUrls([solanaDeploy.rpcUrl]),
      label: 'Solana bridge mint recovery',
    });
    const wanted = String(sourceRef || '').toLowerCase();
    const hit = assets.find((asset) => {
      const attrs = asset?.attributes?.attributeList;
      if (!Array.isArray(attrs)) return false;
      return attrs.some((attr) =>
        String(attr?.key || '').toLowerCase() === 'sourceref'
        && String(attr?.value || '').toLowerCase() === wanted
      );
    });
    if (!hit) return null;

    const attrs = Array.isArray(hit?.attributes?.attributeList) ? hit.attributes.attributeList : [];
    const levelAttr = attrs.find((attr) => String(attr?.key || '').toLowerCase() === 'level');
    const level = Math.max(1, Math.min(3, Number(levelAttr?.value || 1) || 1));
    const assetAddress = hit.publicKey?.toString?.() || String(hit.publicKey || '');
    const txSig = 'recovered';
    try {
      bridgeDb?.prepare(`UPDATE used_bridge_refs SET dest_tx_or_asset = ?
        WHERE source_ref = ? AND dest_chain = 'solana' AND dest_tx_or_asset IS NULL`)
        .run(`${assetAddress}@${txSig}`, sourceRef);
    } catch { /* best-effort */ }
    return {
      assetAddress,
      txSig,
      owner: hit.owner?.toString?.() || String(hit.owner || ''),
      level,
    };
  }
}

function formatUnits(amount, decimals) {
  const s = String(amount);
  const pad = s.padStart(decimals + 1, '0');
  const head = pad.slice(0, -decimals).replace(/^0+/, '') || '0';
  const tail = pad.slice(-decimals).replace(/0+$/, '');
  return tail ? `${head}.${tail}` : head;
}

module.exports = { mountNftV3Endpoints };
