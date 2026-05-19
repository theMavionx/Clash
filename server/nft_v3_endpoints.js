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
const {
  createSolanaConnection,
  solanaRpcUrls,
  withSolanaRpcFallback,
} = require('./solana_rpc');

const NFT_ROOT = path.resolve(__dirname, '..', 'nft');

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

function normalizeNftLevel(level) {
  const n = Number(level);
  return [1, 2, 3].includes(n) ? n : 1;
}

function nftLevelImageUrl(level, id = null) {
  const base = String(process.env.NFT_IMAGE_BASE_URL || 'https://cdn.clashofperps.fun/nft').replace(/\/+$/, '');
  const lvl = normalizeNftLevel(level);
  if (process.env.NFT_USE_TOKEN_IMAGE_PATHS === '1' && id != null && id !== '') {
    return `${base}/${lvl}/${encodeURIComponent(String(id))}.jpg`;
  }
  return `${base}/${lvl}/default.jpg`;
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
  return solanaRpcUrls();
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
  ].filter(Array.isArray).flat();
  const levelAttr = attrs.find((row) => String(row?.key || row?.trait_type || '').toLowerCase() === 'level');
  const level = Number(levelAttr?.value);
  return normalizeNftLevel(level || 1);
}

function solanaCoreAssetToken(asset) {
  const assetId = solanaCoreAssetId(asset);
  const level = solanaCoreAssetLevel(asset);
  return {
    asset: assetId,
    level,
    name: asset?.name || `Demon King L${level}`,
    imageUrl: nftLevelImageUrl(level, assetId),
    chain: 'solana',
    standard: 'mpl-core',
  };
}

function solanaCoreAssetLooksRelevant(asset, collection) {
  if (solanaCoreAssetCollection(asset) === collection) return true;
  const name = String(asset?.name || '').toLowerCase();
  const uri = String(asset?.uri || '').toLowerCase();
  return name.includes('demon king') && uri.includes('/api/nft/solana/');
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
  const bridgeLimit   = makeRateLimiter(5);
  const readLimit     = makeRateLimiter(60);

  // ─── POST /nft/upgrade/quote ──────────────────────────────────
  router.post('/nft/upgrade/quote', async (req, res) => {
    try {
      const ip = req.ip || req.connection?.remoteAddress || 'unknown';
      const rl = upgradeLimit(ip);
      if (!rl.ok) {
        res.set('Retry-After', String(rl.retryAfterSec));
        return res.status(429).json({ error: 'Too many upgrade-quote requests.' });
      }

      const { createPublicClient, getAddress, http, zeroAddress } = await import('viem');

      const chainKey = String(req.body?.chain || '').toLowerCase();
      const spec = SUPPORTED_EVM_CHAINS[chainKey];
      if (!spec) return res.status(400).json({ error: 'Unsupported chain. Use base|arbitrum|monad.' });

      const deployment = v3Deployment(chainKey);
      if (!deployment?.proxy) {
        return res.status(503).json({ error: `${chainKey} V3 not deployed yet` });
      }

      const owner = getAddress(String(req.body?.owner || ''));
      const tokenIdRaw = req.body?.tokenId;
      if (tokenIdRaw === undefined || tokenIdRaw === null || tokenIdRaw === '') {
        return res.status(400).json({ error: 'tokenId required' });
      }
      const tokenId = BigInt(tokenIdRaw);
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
      const [chainOwner, currentLevel, paused] = await Promise.all([
        publicClient.readContract({ address: proxyAddr, abi: NFT_V3_ABI, functionName: 'ownerOf', args: [tokenId] }),
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
      const usdPriceE6 = BigInt(process.env.NFT_UPGRADE_USD_PRICE_E6 || '8900000');
      let paymentToken = zeroAddress;
      let priceUnits = 0n;
      let decimals = 18;
      let priceSource = 'usd-fixed';

      if (payment === 'eth' || payment === 'native') {
        paymentToken = zeroAddress;
        decimals = 18;
        const ethUsd = await ctx.fetchNftUsdPrice('eth');
        // (usd * 1e18) / ethUsd ; ethUsd is e6
        priceUnits = (usdPriceE6 * 10n ** 18n) / ethUsd;
        priceSource = `ETH/USD ${ethUsd}`;
      } else if (payment === 'usdc') {
        paymentToken = getAddress(deployment.usdcToken);
        decimals = 6;
        priceUnits = usdPriceE6;     // USDC has 6 decimals; usdPriceE6 IS the unit count
      } else if (payment === 'cop') {
        const cop = deployment.copToken;
        if (!cop || /^0x0{40}$/i.test(cop)) {
          return res.status(409).json({ error: 'CoP not configured on this chain yet' });
        }
        paymentToken = getAddress(cop);
        decimals = Number(process.env.NFT_COP_DECIMALS || 18);
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

      const usdPriceE6 = process.env.NFT_UPGRADE_USD_PRICE_E6 || '8900000';
      const upgradeable = Number(level) < 3 && !paused;

      res.set('Cache-Control', 'public, max-age=15');
      res.json({
        chain: chainKey,
        chainId: spec.chainId,
        contract: proxyAddr,
        tokenId: tokenId.toString(),
        owner: chainOwner,
        level: Number(level),
        levelLabel: `Level ${Number(level)}`,
        starCount: Number(level),
        maxLevel: 3,
        upgradeable,
        nextLevel: upgradeable ? Number(level) + 1 : null,
        upgradePriceUsdE6: usdPriceE6,
        usdc: deployment.usdcToken,
        cop: deployment.copToken || null,
        paused,
        imageUrl: nftLevelImageUrl(level, tokenId.toString()),
        // Phase B: wins-related fields. Phase 1 returns nulls.
        wins: null,
        nextLevelRequiredWins: null,
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
        const monad = defineChain({ id:143, name:'Monad', nativeCurrency:{name:'Monad',symbol:'MON',decimals:18}, rpcUrls:{default:{http:['https://rpc.monad.xyz']}}, contracts:{ multicall3:{ address:'0xcA11bde05977b3631167028862bE2a173976CA11' } } });
        const chainViem = { base: viemChains.base, arbitrum: viemChains.arbitrum, monad }[chainKey];
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
          levels = levelResults.map((r) => (r?.status === 'success' ? Number(r.result) : 1));
        }
        const tokens = mine.map((id, i) => ({
          tokenId: id.toString(),
          level: normalizeNftLevel(levels[i]),
          imageUrl: nftLevelImageUrl(levels[i], id.toString()),
        }));
        const body = { chain: chainKey, owner, contract: proxy, total: tokens.length, tokens };
        _ownedNftCache.set(cacheKey, { at: Date.now(), body });
        res.set('Cache-Control', 'public, max-age=10');
        return res.json(body);
      }

      // Aptos path
      if (chainKey === 'aptos') {
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
          }, { label: 'Solana Core owner scan' });
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
  const { CHAIN_IDS, EVM_CHAINS, ALL_CHAINS, deploymentOf,
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
  };

  // Lightweight per-chain destAddress validators. Aligns the lax `length<4`
  // checks at the API boundary with the actual on-chain shape.
  function validateDestAddressForChain(chainKey, addr) {
    const s = String(addr || '');
    if (chainKey === 'base' || chainKey === 'arbitrum' || chainKey === 'monad') {
      return /^0x[0-9a-fA-F]{40}$/.test(s);
    }
    if (chainKey === 'aptos') {
      // Aptos uses 1..64 hex chars after 0x; the receipt signer left-pads to 32 bytes.
      return /^0x[0-9a-fA-F]{1,64}$/.test(s);
    }
    if (chainKey === 'solana') {
      return /^[1-9A-HJ-NP-Za-km-z]{32,44}$/.test(s);
    }
    return false;
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

  function bridgeLogData(payload, httpStatus) {
    const body = jsonable(payload || {});
    const out = {
      httpStatus,
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
        data: bridgeLogData(body, res.statusCode),
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
      if (!rl.ok) { res.set('Retry-After', String(rl.retryAfterSec)); return res.status(429).json({ error: 'rate limited' }); }

      const { getAddress, isAddress } = await import('viem');
      const sourceChain = String(req.body?.sourceChain || '').toLowerCase();
      const destChain   = String(req.body?.destChain   || '').toLowerCase();
      const tokenIdRaw  = req.body?.sourceTokenId;
      const destAddress = String(req.body?.destAddress || '');
      const sourceOwner = String(req.body?.sourceOwner || '');

      if (sourceChain === destChain) return res.status(400).json({ error: 'sourceChain == destChain' });
      if (!ALL_CHAINS.includes(destChain)) return res.status(400).json({ error: 'Unsupported destChain. Use base|arbitrum|monad|aptos|solana.' });
      if (!ALL_CHAINS.includes(sourceChain)) return res.status(400).json({ error: 'Unsupported sourceChain. Use base|arbitrum|monad|aptos|solana.' });
      const destSpec = EVM_DEST_DOMAIN[destChain];  // null for non-EVM
      if (!validateDestAddressForChain(destChain, destAddress)) {
        return res.status(400).json({ error: `destAddress malformed for chain "${destChain}"` });
      }

      // Source = EVM (Base/Arbitrum/Monad): instruct user to call bridgeBurn.
      if (EVM_DEST_DOMAIN[sourceChain]) {
        if (tokenIdRaw === undefined) return res.status(400).json({ error: 'sourceTokenId required' });
        const sourceDeployment = v3Deployment(sourceChain);
        if (!sourceDeployment?.proxy) return res.status(503).json({ error: `${sourceChain} V3 not deployed yet` });
        // destChainId works for ALL destinations (EVM uses block.chainid, Aptos/Solana
        // use the synthetic ids from CHAIN_IDS). EVM dest emits the value into the
        // BridgeBurn event verbatim; the orchestrator's /bridge/confirm cross-checks it.
        const destChainId = destSpec ? destSpec.chainId : CHAIN_IDS[destChain];
        const bridgeFee = await quoteNativeBridgeFee(sourceChain, sourceDeployment.proxy);
        return res.json({
          mode: 'evm-burn',
          sourceChain,
          sourceContract: getAddress(sourceDeployment.proxy),
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
        const aptosDeploy = deploymentOf('aptos');
        if (!aptosDeploy?.module) return res.status(503).json({ error: 'Aptos module not deployed' });
        if (!req.body?.sourceTokenAddress) return res.status(400).json({ error: 'sourceTokenAddress required (Aptos token object address)' });
        const bridgeFee = await quoteNativeBridgeFee('aptos');
        return res.json({
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
        const assetInfo = await getSolanaBridgeAssetInfo(String(req.body.sourceAsset), sourceOwner);
        const bridgeFee = await quoteNativeBridgeFee('solana');
        const solanaDeploy = deploymentOf('solana');
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
          mode: 'solana-burn',
          sourceChain,
          sourceChainId: CHAIN_IDS.solana,
          burn: {
            program: assetInfo.standard === 'token2022' ? 'spl-token-2022' : 'mpl-core',
            instruction: 'burn',
            asset: req.body.sourceAsset,
            mint: assetInfo.mint || assetInfo.asset,
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
      if (!rl.ok) { res.set('Retry-After', String(rl.retryAfterSec)); return res.status(429).json({ error: 'rate limited' }); }

      const sourceChain = String(req.body?.sourceChain || '').toLowerCase();
      const destChain   = String(req.body?.destChain   || '').toLowerCase();
      const burnTxHash  = String(req.body?.burnTxHash  || '');
      const destAddress = String(req.body?.destAddress || '');

      if (!ALL_CHAINS.includes(sourceChain) || !ALL_CHAINS.includes(destChain)) {
        return res.status(400).json({ error: 'Unsupported chain. Use base|arbitrum|monad|aptos|solana.' });
      }
      if (sourceChain === destChain) return res.status(400).json({ error: 'sourceChain == destChain' });
      if (!validateDestAddressForChain(destChain, destAddress)) {
        return res.status(400).json({ error: `destAddress malformed for chain "${destChain}"` });
      }
      if (!burnTxHash) return res.status(400).json({ error: 'burnTxHash required' });
      const grandfatheredBridge = findBridgeRefByBurn(burnTxHash, destChain);

      // ── Step 1: verify source burn ──
      let burned;
      if (EVM_CHAINS.has(sourceChain)) {
        const { createPublicClient, getAddress, http, keccak256 } = await import('viem');
        const sourceDeployment = deploymentOf(sourceChain);
        if (!sourceDeployment?.proxy) return res.status(503).json({ error: `${sourceChain} V3 not deployed` });
        if (!/^0x[0-9a-fA-F]{64}$/.test(burnTxHash)) return res.status(400).json({ error: 'EVM burnTxHash malformed' });
        const client = createPublicClient({ transport: http(evmRpc(sourceChain, process.env)) });
        const txRcp = await client.getTransactionReceipt({ hash: burnTxHash });
        if (!txRcp || txRcp.status !== 'success') return res.status(404).json({ error: 'burn tx not found or reverted' });
        const head = await client.getBlock();
        const confirmations = Number(head.number - txRcp.blockNumber);
        if (confirmations < 2) return res.status(425).json({ error: `need 2 confirmations, have ${confirmations}` });
        const sourceTx = await client.getTransaction({ hash: burnTxHash });
        const requiredFee = await quoteNativeBridgeFee(sourceChain, sourceDeployment.proxy);
        const feePaid = BigInt(sourceTx?.value || 0);
        if (!grandfatheredBridge && feePaid < requiredFee.amount) {
          return res.status(402).json({
            error: `Bridge fee under-paid: need ${requiredFee.amount} wei, paid ${feePaid}`,
            bridgeFee: bridgeFeeJson(requiredFee),
          });
        }
        const sourceProxy = getAddress(sourceDeployment.proxy).toLowerCase();
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
        const r = await verifyAptosBurnTx(burnTxHash);
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
        const r = await verifySolanaBurnTx(burnTxHash, { allowLegacy: !!grandfatheredBridge });
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
            const destDeployment = deploymentOf(destChain);
            const client = createPublicClient({ transport: http(evmRpc(destChain, process.env)) });
            const consumed = await client.readContract({
              address: getAddress(destDeployment.proxy), abi: NFT_V3_ABI,
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
            const recovered = await recoverSolanaBridgeMintRecord(sourceRef);
            if (recovered) {
              return res.json({
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
        const destDeployment = deploymentOf(destChain);
        if (!destDeployment?.proxy) return res.status(503).json({ error: `${destChain} V3 not deployed` });
        const destSpec = EVM_DEST_DOMAIN[destChain];
        const account = await ctx.parseNftEvmAccount();
        const signature = await account.signTypedData({
          domain: {
            name: destDeployment.eip712Name || destSpec.name,
            version: destDeployment.eip712Version || '3',
            chainId: destSpec.chainId,
            verifyingContract: getAddress(destDeployment.proxy),
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
          mode: 'evm-receipt',
          sourceChain, destChain,
          burned: jsonable(burned),
          sourceRef,
          destinationChainId: destSpec.chainId,
          destContract: getAddress(destDeployment.proxy),
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
        const aptosDeploy = deploymentOf('aptos');
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
            recipient: destAddress, level: burned.level, sourceRef,
          });
          // Record dest tx + asset address for post-mortem.
          try {
            bridgeDb?.prepare(`UPDATE used_bridge_refs SET dest_tx_or_asset = ?
                               WHERE source_ref = ? AND dest_chain = 'solana'`)
              .run(`${mintRes.assetAddress}@${mintRes.txSig}`, sourceRef);
          } catch { /* best-effort */ }
          return res.json({
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
      if (!rl.ok) { res.set('Retry-After', String(rl.retryAfterSec)); return res.status(429).json({ error: 'rate limited' }); }

      const sourceChain = String(req.body?.sourceChain || '').toLowerCase();
      const destChain   = String(req.body?.destChain   || '').toLowerCase();
      const burnTxHash  = String(req.body?.burnTxHash  || '');
      const destAddress = String(req.body?.destAddress || '');

      if (!ALL_CHAINS.includes(sourceChain) || !ALL_CHAINS.includes(destChain)) {
        return res.status(400).json({ error: 'Unsupported chain' });
      }
      if (sourceChain === destChain) return res.status(400).json({ error: 'sourceChain == destChain' });
      if (!validateDestAddressForChain(destChain, destAddress)) {
        return res.status(400).json({ error: `destAddress malformed for chain "${destChain}"` });
      }
      if (!burnTxHash) return res.status(400).json({ error: 'burnTxHash required' });
      const grandfatheredBridge = findBridgeRefByBurn(burnTxHash, destChain);

      // ── 1) Verify source burn (lifted from /bridge/confirm) ──
      let burned;
      if (EVM_CHAINS.has(sourceChain)) {
        const { createPublicClient, getAddress, http, keccak256 } = await import('viem');
        const sourceDeployment = deploymentOf(sourceChain);
        if (!sourceDeployment?.proxy) return res.status(503).json({ error: `${sourceChain} V3 not deployed` });
        if (!/^0x[0-9a-fA-F]{64}$/.test(burnTxHash)) return res.status(400).json({ error: 'EVM burnTxHash malformed' });
        const client = createPublicClient({ transport: http(evmRpc(sourceChain, process.env)) });
        const txRcp = await client.getTransactionReceipt({ hash: burnTxHash });
        if (!txRcp || txRcp.status !== 'success') return res.status(404).json({ error: 'burn tx not found or reverted' });
        const head = await client.getBlock();
        const confirmations = Number(head.number - txRcp.blockNumber);
        if (confirmations < 2) return res.status(425).json({ error: `need 2 confirmations, have ${confirmations}` });
        const sourceTx = await client.getTransaction({ hash: burnTxHash });
        const requiredFee = await quoteNativeBridgeFee(sourceChain, sourceDeployment.proxy);
        const feePaid = BigInt(sourceTx?.value || 0);
        if (!grandfatheredBridge && feePaid < requiredFee.amount) {
          return res.status(402).json({
            error: `Bridge fee under-paid: need ${requiredFee.amount} wei, paid ${feePaid}`,
            bridgeFee: bridgeFeeJson(requiredFee),
          });
        }
        const sourceProxy = getAddress(sourceDeployment.proxy).toLowerCase();
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
        const r = await verifyAptosBurnTx(burnTxHash);
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
        const r = await verifySolanaBurnTx(burnTxHash, { allowLegacy: !!grandfatheredBridge });
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
      const sourceRef = await buildSourceRef(sourceChain, sourceRefParams);

      const prior = findUsedBridgeRef(sourceRef, destChain);
      if (prior) {
        if (prior.dest_tx_or_asset) {
          const [assetAddress, txSig] = String(prior.dest_tx_or_asset).includes('@')
            ? String(prior.dest_tx_or_asset).split('@')
            : [null, prior.dest_tx_or_asset];
          return res.json({
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
            const destDeployment = deploymentOf(destChain);
            const client = createPublicClient({ transport: http(evmRpc(destChain, process.env)) });
            const consumed = await client.readContract({
              address: getAddress(destDeployment.proxy), abi: NFT_V3_ABI,
              functionName: 'usedBridgeRefs', args: [sourceRef],
            });
            stillUnused = !consumed;
          } else if (destChain === 'aptos') { stillUnused = true; }
          else if (destChain === 'solana') {
            const recovered = await recoverSolanaBridgeMintRecord(sourceRef);
            if (recovered) {
              return res.json({
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
          const monad = defineChain({ id:143, name:'Monad', nativeCurrency:{name:'Monad',symbol:'MON',decimals:18}, rpcUrls:{default:{http:['https://rpc.monad.xyz']}} });
          const chainViem = { base: viemChains.base, arbitrum: viemChains.arbitrum, monad }[destChain];

          const destDeployment = deploymentOf(destChain);
          if (!destDeployment?.proxy) return res.status(503).json({ error: `${destChain} V3 not deployed` });
          const destSpec = EVM_DEST_DOMAIN[destChain];

          // Reuse the ctx.parseNftEvmAccount() viem account for BOTH the
          // EIP-712 signature AND the on-chain submission. Same key signs
          // and submits = no separate "relayer" key to manage.
          const account = await ctx.parseNftEvmAccount();
          const signature = await account.signTypedData({
            domain: {
              name: destDeployment.eip712Name || destSpec.name,
              version: destDeployment.eip712Version || '3',
              chainId: destSpec.chainId,
              verifyingContract: getAddress(destDeployment.proxy),
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
            address: getAddress(destDeployment.proxy),
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
          try {
            bridgeDb?.prepare(`UPDATE used_bridge_refs SET dest_tx_or_asset = ?
              WHERE source_ref = ? AND dest_chain = ?`).run(hash, sourceRef, destChain);
          } catch { /* best-effort */ }
          return res.json({
            mode: 'relay-evm', sourceChain, destChain,
            burned: jsonable(burned), sourceRef,
            destChainId: destSpec.chainId, destContract: getAddress(destDeployment.proxy),
            destAddress: getAddress(destAddress), level: burned.level,
            destTxHash: hash, gasUsed: rcp.gasUsed?.toString?.() || null,
          });
        }

        if (destChain === 'aptos') {
          // Aptos relay — server's ed25519 account submits bridge_mint.
          // The server's key is BOTH the quote signer AND the submitter:
          // first it signs the BCS payload (verified inside the Move
          // module), then it submits the entry function via Aptos SDK.
          const aptosDeploy = deploymentOf('aptos');
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
          await aptos.waitForTransaction({ transactionHash: submitted.hash });
          try {
            bridgeDb?.prepare(`UPDATE used_bridge_refs SET dest_tx_or_asset = ?
              WHERE source_ref = ? AND dest_chain = ?`).run(submitted.hash, sourceRef, destChain);
          } catch { /* best-effort */ }
          return res.json({
            mode: 'relay-aptos', sourceChain, destChain,
            burned: jsonable(burned), sourceRef,
            destAddress, level: burned.level,
            destTxHash: submitted.hash,
          });
        }

        if (destChain === 'solana') {
          // Solana already had the relay pattern; just call its helper.
          const mintRes = await mintSolanaAssetForBridge({
            recipient: destAddress, level: burned.level, sourceRef,
          });
          try {
            bridgeDb?.prepare(`UPDATE used_bridge_refs SET dest_tx_or_asset = ?
              WHERE source_ref = ? AND dest_chain = ?`)
              .run(`${mintRes.assetAddress}@${mintRes.txSig}`, sourceRef, destChain);
          } catch { /* best-effort */ }
          return res.json({
            mode: 'relay-solana', sourceChain, destChain,
            burned: jsonable(burned), sourceRef,
            destAddress, level: burned.level,
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
  async function mintSolanaAssetForBridge({ recipient, level, sourceRef }) {
    const mintStandard = String(process.env.NFT_SOLANA_MINT_STANDARD || 'token2022').toLowerCase();
    const solanaDeploy = deploymentOf('solana');
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
    const { mplCore, create: createAsset } = await import('@metaplex-foundation/mpl-core');

    // Authority key = the same Solana key used by the candy-machine deploy.
    // Accept SOLANA_NFT_KEY / NFT_SOLANA_KEY / NFT_KEY in any of the formats
    // supported by nft/scripts/lib-env.mjs::parseSolanaKeypair (JSON array,
    // 32-byte hex seed, or base58 secret/seed).
    const rawKey = process.env.SOLANA_NFT_KEY || process.env.NFT_SOLANA_KEY || process.env.NFT_KEY;
    if (!rawKey) throw new Error('Solana authority key missing (SOLANA_NFT_KEY / NFT_SOLANA_KEY / NFT_KEY)');
    const secretBytes = parseSolanaSecretKey(rawKey);

    // Resilient submission. Public RPC (solana-rpc.publicnode.com) often
    // returns "block height exceeded" on `sendAndConfirm` under load, so we:
    //   - send with skipPreflight + processed commitment for speed
    //   - retry the WHOLE build-and-send up to 3 times with a fresh blockhash
    //   - confirm via repeated getSignatureStatuses (not the bundled poll)
    const { base58 } = await import('@metaplex-foundation/umi/serializers');
    return withSolanaRpcFallback(async (rpc) => {
      const umi = createUmi(rpc).use(mplCore());
      const authKeypair = umi.eddsa.createKeypairFromSecretKey(secretBytes);
      umi.use(keypairIdentity(authKeypair));
      let lastErr;
      for (let attempt = 1; attempt <= 3; attempt++) {
        const asset = generateSigner(umi);
        const ix = createAsset(umi, {
          asset,
          collection: publicKey(solanaDeploy.collection),
          name: `Demon King (bridged)`,
          uri: `${(process.env.NFT_PUBLIC_BASE_URL || 'https://clashofperps.fun').replace(/\/+$/, '')}/api/nft/solana/bridged`,
          owner: publicKey(recipient),
          plugins: [
            { type: 'Attributes', attributeList: [
              { key: 'level',     value: String(level) },
              { key: 'sourceRef', value: String(sourceRef) },
            ]},
          ],
        });
        try {
          const sig = await ix.sendAndConfirm(umi, {
            send:    { skipPreflight: true, commitment: 'processed', maxRetries: 5 },
            confirm: { commitment: 'confirmed', strategy: { type: 'blockhash' } },
          });
          const txSig = base58.deserialize(sig.signature)[0];
          return { assetAddress: asset.publicKey.toString(), txSig };
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
                return { assetAddress: asset.publicKey.toString(), txSig: probeSig };
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
      extraUrls: [solanaDeploy.rpcUrl],
      label: 'Solana bridge mint',
    });
  }

  async function recoverSolanaBridgeMintRecord(sourceRef) {
    const solanaDeploy = deploymentOf('solana');
    if (!solanaDeploy?.collection) return null;
    const { createUmi } = await import('@metaplex-foundation/umi-bundle-defaults');
    const { mplCore, fetchAssetsByCollection } = await import('@metaplex-foundation/mpl-core');
    const { publicKey } = await import('@metaplex-foundation/umi');

    const assets = await withSolanaRpcFallback(async (rpc) => {
      const umi = createUmi(rpc).use(mplCore());
      return fetchAssetsByCollection(umi, publicKey(solanaDeploy.collection));
    }, {
      extraUrls: [solanaDeploy.rpcUrl],
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
