// Cross-chain bridge helpers — used by nft_v3_endpoints.js to handle
// Aptos / Solana source verification + destination signing.
//
// Conventions:
//   - sourceRef (32-byte keccak256) is the canonical bridge replay-id.
//     Each source chain uses a deterministic encoding so that the same
//     asset bridges from the same source produce the same hash, but two
//     different assets never collide.
//   - destinationChainId is included in every BridgeReceipt's signed
//     payload. The dest contract verifies it matches block.chainid
//     (EVM) or trusts the signature (Aptos/Solana).
//
// Cross-chain chainId convention (synthetic IDs used in receipts):
//   EVM chains: actual block.chainid (8453 Base, 42161 Arbitrum, 143 Monad)
//   Aptos mainnet: 100001  (Aptos's native chain_id=1, prefixed to avoid EVM collision)
//   Solana mainnet: 200001 (Solana has no native chain id; arbitrary unique)

const path = require('node:path');
const fs = require('node:fs');
const crypto = require('node:crypto');
const {
  createSolanaConnection,
  solanaNonHeliusRpcUrls,
  solanaPrimaryRpcUrl,
  solanaRpcUrls,
  withSolanaRpcFallback,
} = require('./solana_rpc');

const NFT_ROOT = path.resolve(__dirname, '..', 'nft');

const CHAIN_IDS = {
  base: 8453,
  arbitrum: 42161,
  monad: 143,
  aptos: 100001,
  solana: 200001,
};

const EVM_CHAINS = new Set(['base', 'arbitrum', 'monad']);
const NON_EVM_CHAINS = new Set(['aptos', 'solana']);
const ALL_CHAINS = [...EVM_CHAINS, ...NON_EVM_CHAINS];

function readJsonIfExists(p) {
  try { return fs.existsSync(p) ? JSON.parse(fs.readFileSync(p, 'utf8')) : null; }
  catch { return null; }
}

function normalizeBridgeCollectionSlug(value) {
  const slug = String(value || 'demonking')
    .trim()
    .toLowerCase()
    .replace(/[_\s]+/g, '-')
    .replace(/[^a-z0-9-]+/g, '-')
    .replace(/^-+|-+$/g, '');
  if (!slug || slug === 'demonking' || slug === 'demon-king') return 'demonking';
  if (slug === 'voidspore') return 'voidspore';
  return slug;
}

function v3DeploymentPath(chainKey, collectionSlug = 'demonking') {
  const collection = normalizeBridgeCollectionSlug(collectionSlug);
  if (collection !== 'demonking') {
    if (EVM_CHAINS.has(chainKey) || chainKey === 'aptos' || chainKey === 'solana') {
      return path.join(NFT_ROOT, 'deployments', `${collection}-${chainKey}-mainnet.json`);
    }
    return null;
  }
  if (EVM_CHAINS.has(chainKey)) return path.join(NFT_ROOT, 'deployments', `${chainKey}-v3-mainnet.json`);
  if (chainKey === 'aptos')      return path.join(NFT_ROOT, 'deployments', 'aptos-mainnet.json');
  if (chainKey === 'solana')     return path.join(NFT_ROOT, 'deployments', 'solana-mainnet.json');
  return null;
}

function deploymentOf(chainKey, collectionSlug = 'demonking') {
  const p = v3DeploymentPath(chainKey, collectionSlug);
  return p ? readJsonIfExists(p) : null;
}

function solanaToken2022Migration() {
  return readJsonIfExists(path.join(NFT_ROOT, 'deployments', 'solana-token2022-migration-mainnet.json')) || {};
}

function solanaMigratedCoreAsset(asset) {
  const wanted = String(asset || '');
  if (!wanted) return null;
  const migration = solanaToken2022Migration();
  const entries = Array.isArray(migration.entries) ? migration.entries : [];
  return entries.find((entry) => String(entry.oldAsset || entry.asset || '') === wanted) || null;
}

function normalizeAptosAddress(addrLike) {
  const hex = String(addrLike || '').replace(/^0x/i, '').toLowerCase();
  if (!/^[0-9a-f]{1,64}$/.test(hex)) return null;
  return `0x${hex.padStart(64, '0')}`;
}

function aptosAddressBytes(addrLike) {
  const addr = normalizeAptosAddress(addrLike);
  return addr ? Buffer.from(addr.slice(2), 'hex') : null;
}

function aptosPrimaryFungibleStoreAddress(ownerAddr, metadataAddr = '0x000000000000000000000000000000000000000000000000000000000000000a') {
  const owner = aptosAddressBytes(ownerAddr);
  const metadata = aptosAddressBytes(metadataAddr);
  if (!owner || !metadata) return null;
  // Matches aptos_framework::object::create_user_derived_object_address(owner, metadata).
  const digest = crypto.createHash('sha3-256')
    .update(Buffer.concat([owner, metadata, Buffer.from([0xfc])]))
    .digest('hex');
  return normalizeAptosAddress(`0x${digest}`);
}

function normalizeAptosStructType(type) {
  const parts = String(type || '').split('::');
  if (parts.length < 3) return null;
  const addr = normalizeAptosAddress(parts[0]);
  if (!addr) return null;
  return `${addr}::${parts.slice(1).join('::')}`;
}

function aptosNativeFeePaidOctas(tx, treasuryAddr) {
  const treasury = normalizeAptosAddress(treasuryAddr);
  if (!treasury) return 0n;
  const treasuryAptStore = aptosPrimaryFungibleStoreAddress(treasury);
  let paid = 0n;
  for (const ev of tx.events || []) {
    const t = String(ev.type || '');
    const data = ev.data || {};
    if (t === '0x1::fungible_asset::Deposit' || t.endsWith('::fungible_asset::Deposit')) {
      const store = normalizeAptosAddress(data.store);
      const owner = normalizeAptosAddress(data.owner || data.account);
      if ((store && store === treasuryAptStore) || (owner && owner === treasury)) {
        paid += BigInt(data.amount || 0);
      }
    }
    if (t === '0x1::coin::DepositEvent' || /::DepositEvent$/.test(t)) {
      const ownerAccount = normalizeAptosAddress(ev.guid?.account_address || ev.guid?.id?.addr);
      if (ownerAccount && ownerAccount === treasury) paid += BigInt(data.amount || 0);
    }
  }
  return paid;
}

// =====================================================================
// Aptos: ed25519 key from NFT_BASE + REST helpers
// =====================================================================

let _aptosAccountCache = null;
function aptosAccount() {
  if (_aptosAccountCache !== null) return _aptosAccountCache;
  try {
    const sdkPath = process.env.APTOS_SDK_PATH
      || require.resolve('@aptos-labs/ts-sdk', {
        paths: [path.join(__dirname, '..', 'server-futures', 'node_modules'),
                path.join(__dirname, '..', 'nft', 'node_modules')],
      });
    const sdk = require(sdkPath);
    const explicit = String(process.env.GAME_SHOP_APTOS_KEY || '').trim();
    const mnemonic = String(process.env.NFT_BASE || '').trim();
    if (!explicit && !mnemonic) { _aptosAccountCache = false; return false; }
    _aptosAccountCache = explicit
      ? sdk.Account.fromPrivateKey({ privateKey: new sdk.Ed25519PrivateKey(explicit) })
      : sdk.Account.fromDerivationPath({ path: "m/44'/637'/0'/0'/0'", mnemonic });
    return _aptosAccountCache;
  } catch (err) {
    console.warn('[bridge] aptosAccount derive failed:', err?.message || err);
    _aptosAccountCache = false;
    return false;
  }
}

function aptosFullnodeBase() {
  return (process.env.NFT_APTOS_RPC_URL
    || process.env.APTOS_RPC_URL
    || 'https://fullnode.mainnet.aptoslabs.com').replace(/\/+$/, '');
}

// Verify an Aptos bridge-burn transaction. Returns { tokenAddress, owner,
// level, destinationChainId, tokenIndex } or null if not found / wrong shape.
async function verifyAptosBurnTx(txHash, options = {}) {
  const collectionSlug = normalizeBridgeCollectionSlug(options.collection || options.collectionSlug);
  const dep = deploymentOf('aptos', collectionSlug) || {};
  const expectedModule = String(dep.module || '').split('::');
  const expectedPublisher = normalizeAptosAddress(expectedModule[0] || dep.admin);
  const expectedModuleName = expectedModule[1] || (collectionSlug === 'voidspore' ? 'voidspore' : 'demon_king');
  const expectedType = expectedPublisher
    ? `${expectedPublisher}::${expectedModuleName}::BridgeBurnEvent`
    : null;
  const url = `${aptosFullnodeBase()}/v1/transactions/by_hash/${txHash}`;
  const r = await fetch(url, {
    headers: process.env.APTOS_NODE_API_KEY ? { Authorization: `Bearer ${process.env.APTOS_NODE_API_KEY}` } : {},
  });
  if (!r.ok) return { error: `Aptos REST ${r.status}` };
  const j = await r.json();
  if (!j?.success) return { error: 'tx failed on chain' };
  // Look for the BridgeBurnEvent emitted by OUR deployed module only.
  const burnEvent = (j.events || []).find((e) => {
    const normalized = normalizeAptosStructType(e.type);
    return expectedType ? normalized === expectedType : normalized?.endsWith(`::${expectedModuleName}::BridgeBurnEvent`);
  });
  if (!burnEvent) return { error: 'no BridgeBurnEvent in tx' };
  const d = burnEvent.data || {};
  const treasury = dep.treasury || process.env.NFT_BRIDGE_APTOS_TREASURY || process.env.NFT_APTOS_TREASURY;
  return {
    owner: d.owner,
    tokenAddress: d.token_address,
    level: Number(d.level),
    destinationChainId: BigInt(d.destination_chain_id || 0),
    tokenIndex: Number(d.token_index || 0),
    feePaidOctas: aptosNativeFeePaidOctas(j, treasury),
  };
}

// Sign a MintQuote for `clash_nft::mint_with_quote`. The Move function
// verifies ed25519 over the BCS-concat of:
//   bcs(buyer) ‖ bcs(u64 usdc_amount) ‖ bcs(u64 quantity)
//     ‖ nonce(raw bytes) ‖ bcs(u64 deadline) ‖ account_hash(raw bytes)
//
// `nonce` and `account_hash` are passed through as raw vector<u8> — we use
// 16-byte random nonce and an empty account_hash (the on-chain code accepts
// any value; we don't currently bind to off-chain identity).
async function signAptosMintQuote({ buyerAddress, usdcAmount, quantity, nonce, deadline, accountHash }) {
  const acc = aptosAccount();
  if (!acc) throw new Error('Aptos signer not available (set NFT_BASE)');

  const buf = [];
  buf.push(addressToBytes(buyerAddress));            // 32 bytes
  buf.push(u64LeBytes(BigInt(usdcAmount)));          // 8 bytes
  buf.push(u64LeBytes(BigInt(quantity)));            // 8 bytes
  buf.push(hexToBytes(nonce));                       // raw bytes (no BCS length prefix — vector<u8> append, not BCS-serialize)
  buf.push(u64LeBytes(BigInt(deadline)));            // 8 bytes
  buf.push(hexToBytes(accountHash || '0x'));         // raw bytes (empty by default)
  const msg = concat(buf);

  const sig = acc.sign(msg);
  return '0x' + Buffer.from(sig.toUint8Array()).toString('hex');
}

// Sign a MintQuote for `clash_nft::mint_with_quote_payment`.
// This binds the selected payment metadata address into the signature so a
// USDC quote cannot be replayed as an APT payment, or vice versa.
async function signAptosMintQuotePayment({ buyerAddress, paymentMetadata, paymentAmount, quantity, nonce, deadline, accountHash }) {
  const acc = aptosAccount();
  if (!acc) throw new Error('Aptos signer not available (set NFT_BASE)');

  const buf = [];
  buf.push(addressToBytes(buyerAddress));
  buf.push(addressToBytes(paymentMetadata));
  buf.push(u64LeBytes(BigInt(paymentAmount)));
  buf.push(u64LeBytes(BigInt(quantity)));
  buf.push(hexToBytes(nonce));
  buf.push(u64LeBytes(BigInt(deadline)));
  buf.push(hexToBytes(accountHash || '0x'));
  const msg = concat(buf);

  const sig = acc.sign(msg);
  return '0x' + Buffer.from(sig.toUint8Array()).toString('hex');
}

// Sign an UpgradeQuote for `clash_nft::upgrade_with_quote`.
// Move verifies:
//   owner_addr || token_addr || new_level(u8) || usdc_amount(u64 LE)
//     || nonce(raw bytes) || deadline(u64 LE)
async function signAptosUpgradeQuote({ ownerAddress, tokenAddress, newLevel, usdcAmount, nonce, deadline }) {
  const acc = aptosAccount();
  if (!acc) throw new Error('Aptos signer not available (set NFT_BASE)');

  const buf = [];
  buf.push(addressToBytes(ownerAddress));
  buf.push(addressToBytes(tokenAddress));
  buf.push(new Uint8Array([Number(newLevel) & 0xff]));
  buf.push(u64LeBytes(BigInt(usdcAmount)));
  buf.push(hexToBytes(nonce));
  buf.push(u64LeBytes(BigInt(deadline)));
  const msg = concat(buf);

  const sig = acc.sign(msg);
  return '0x' + Buffer.from(sig.toUint8Array()).toString('hex');
}

// Sign a BridgeReceipt for an Aptos destination. The Move function
// `bridge_mint` verifies ed25519 over:
//   bcs(to) ‖ u8(level) ‖ source_ref(32) ‖ bcs(u64 dest_chain_id) ‖ bcs(u64 deadline)
async function signAptosBridgeReceipt({ to, level, sourceRef, destinationChainId, deadline }) {
  const acc = aptosAccount();
  if (!acc) throw new Error('Aptos signer not available (set NFT_BASE)');

  // BCS encode each part. Aptos addresses are 32 bytes LE-padded in BCS.
  const buf = [];
  buf.push(addressToBytes(to));                     // 32 bytes
  buf.push(new Uint8Array([Number(level) & 0xff])); // u8
  buf.push(hexToBytes(sourceRef));                  // 32 bytes
  buf.push(u64LeBytes(BigInt(destinationChainId))); // 8 bytes
  buf.push(u64LeBytes(BigInt(deadline)));            // 8 bytes
  const msg = concat(buf);

  const sig = acc.sign(msg);   // SDK helper — Ed25519Account.sign(message)
  return '0x' + Buffer.from(sig.toUint8Array()).toString('hex');
}

function addressToBytes(addrLike) {
  // Aptos address is 32 bytes. Accept "0x..." (any length up to 64 hex chars,
  // left-pad with zeros on the high bytes).
  const hex = String(addrLike).replace(/^0x/, '').padStart(64, '0');
  return new Uint8Array(Buffer.from(hex, 'hex'));
}

function hexToBytes(h) {
  const s = String(h).replace(/^0x/, '');
  return new Uint8Array(Buffer.from(s, 'hex'));
}

function u64LeBytes(n) {
  const b = new Uint8Array(8);
  const view = new DataView(b.buffer);
  view.setBigUint64(0, BigInt(n), true);  // little-endian
  return b;
}

function concat(parts) {
  const total = parts.reduce((s, p) => s + p.length, 0);
  const out = new Uint8Array(total);
  let off = 0;
  for (const p of parts) { out.set(p, off); off += p.length; }
  return out;
}

// =====================================================================
// Solana: burn-tx verification + server-mediated mint
// =====================================================================

const SOLANA_MEMO_PROGRAM   = 'MemoSq4gqABAXKb96qnH8TysNcWxMyWCqXgDLGmfcHr';
// Metaplex Core program id (mpl-core, mainnet).
const SOLANA_MPL_CORE_PROGRAM = 'CoREENxT6tW1HoK8ypY1SxRMZTcVPm7R94rH4PZNhX7d';

let _solanaConnection = null;
let _solanaConnections = null;
function solanaConnection() {
  if (_solanaConnection) return _solanaConnection;
  const { Connection } = require('@solana/web3.js');
  const rpc = solanaPrimaryRpcUrl();
  if (!rpc) throw new Error('Solana RPC endpoint is not configured');
  _solanaConnection = createSolanaConnection(Connection, rpc, 'confirmed');
  return _solanaConnection;
}

function solanaConnections() {
  if (_solanaConnections) return _solanaConnections;
  const { Connection } = require('@solana/web3.js');
  _solanaConnections = solanaRpcUrls().map((rpc) => createSolanaConnection(Connection, rpc, 'confirmed'));
  return _solanaConnections;
}

function ixProgramIdStr(ix) {
  const p = ix.programId;
  if (!p) return null;
  if (typeof p.toBase58 === 'function') return p.toBase58();
  return String(p);
}

function ixAccountKeysStr(ix) {
  const acc = ix.accounts || [];
  return acc.map((a) => (typeof a.toBase58 === 'function' ? a.toBase58() : String(a)));
}

function ixDataBytes(ix, bs58) {
  const raw = ix?.data;
  if (!raw) return Buffer.alloc(0);
  if (Buffer.isBuffer(raw)) return raw;
  if (raw instanceof Uint8Array) return Buffer.from(raw);
  if (Array.isArray(raw)) return Buffer.from(raw);
  if (typeof raw !== 'string') return Buffer.alloc(0);
  try {
    const decoded = bs58.decode(raw);
    if (decoded?.length) return Buffer.from(decoded);
  } catch {}
  try {
    const decoded = Buffer.from(raw, 'base64');
    if (decoded?.length) return decoded;
  } catch {}
  return Buffer.alloc(0);
}

function parsedAccountKeyStr(key) {
  const p = key?.pubkey || key;
  if (!p) return '';
  return typeof p.toBase58 === 'function' ? p.toBase58() : String(p);
}

function solanaTxPostBalance(parsed, pubkey) {
  const keys = parsed?.transaction?.message?.accountKeys || [];
  const idx = keys.findIndex((key) => parsedAccountKeyStr(key) === String(pubkey));
  if (idx < 0) return null;
  const value = parsed?.meta?.postBalances?.[idx];
  return value == null ? null : BigInt(value);
}

async function waitForSolanaAssetBurned(conn, asset, minContextSlot) {
  const { PublicKey } = require('@solana/web3.js');
  const key = new PublicKey(asset);
  let last = null;
  const delays = [0, 800, 1500, 2500, 4000, 6000];
  for (const delayMs of delays) {
    if (delayMs) await new Promise((resolve) => setTimeout(resolve, delayMs));
    try {
      const info = await conn.getAccountInfo(key, {
        commitment: 'confirmed',
        minContextSlot: Number(minContextSlot || 0),
      });
      if (!info) return { burned: true, reason: 'account-not-found' };
      const owner = info.owner?.toBase58?.() || String(info.owner || '');
      last = { owner, lamports: info.lamports, dataLength: info.data?.length || 0 };
      if (owner !== SOLANA_MPL_CORE_PROGRAM) return { burned: true, reason: `owner=${owner}` };
      if (!info.data || info.data.length === 0) return { burned: true, reason: 'empty-data' };
    } catch (err) {
      const msg = String(err?.message || err);
      last = { error: msg };
      if (!/minimum context slot|minContextSlot|Slot .* was skipped|not available/i.test(msg)) {
        await new Promise((resolve) => setTimeout(resolve, 500));
      }
    }
  }
  return { burned: false, last };
}

function solanaBridgeMemoSecret() {
  const secret = String(process.env.NFT_BRIDGE_MEMO_SECRET || process.env.NFT_BASE || process.env.NFT_EVM_KEY || '').trim();
  if (!secret) throw new Error('NFT_BRIDGE_MEMO_SECRET or NFT_BASE required for Solana bridge memo signing');
  return secret;
}

function solanaBridgeMemoPayload({ asset, owner, collection, level, destinationChainId, destAddress, feeLamports }) {
  return [
    String(asset),
    String(owner),
    String(collection),
    String(Number(level)),
    String(destinationChainId),
    String(destAddress),
    String(feeLamports || 0),
  ].join('|');
}

function signSolanaBridgeMemo(fields) {
  const payload = solanaBridgeMemoPayload(fields);
  return crypto.createHmac('sha256', solanaBridgeMemoSecret()).update(payload).digest('hex');
}

function buildSolanaBridgeMemo(fields) {
  const sig = signSolanaBridgeMemo(fields);
  return [
    'bridge2',
    fields.asset,
    fields.owner,
    fields.collection,
    Number(fields.level),
    String(fields.destinationChainId),
    fields.destAddress,
    String(fields.feeLamports || 0),
    sig,
  ].join(':');
}

function parseSolanaBridgeMemo(memoText, opts = {}) {
  const s = String(memoText || '');
  const v2 = s.match(/^bridge2:([1-9A-HJ-NP-Za-km-z]{32,44}):([1-9A-HJ-NP-Za-km-z]{32,44}):([1-9A-HJ-NP-Za-km-z]{32,44}):([123]):(\d+):([0-9a-zA-Z]{1,90}):(\d+):([0-9a-fA-F]{64})$/);
  if (v2) {
    const [, asset, owner, collection, levelStr, destChainStr, destAddrRaw, feeLamportsStr, sig] = v2;
    const fields = {
      asset,
      owner,
      collection,
      level: Number(levelStr),
      destinationChainId: BigInt(destChainStr),
      destAddress: destAddrRaw,
      feeLamports: BigInt(feeLamportsStr),
    };
    const expected = signSolanaBridgeMemo(fields);
    const ok = crypto.timingSafeEqual(Buffer.from(expected, 'hex'), Buffer.from(sig.toLowerCase(), 'hex'));
    if (!ok) return { error: 'bad signed bridge memo' };
    return fields;
  }

  if (opts.allowLegacy || process.env.NFT_BRIDGE_ALLOW_LEGACY_SOLANA_MEMO === '1') {
    const legacy = s.match(/^bridge:([1-9A-HJ-NP-Za-km-z]{32,44}):([123]):(\d+):([0-9a-zA-Z]{1,80})$/);
    if (legacy) {
      const [, asset, levelStr, destChainStr, destAddrRaw] = legacy;
      return {
        asset,
        owner: null,
        collection: null,
        level: Number(levelStr),
        destinationChainId: BigInt(destChainStr),
        destAddress: destAddrRaw,
        feeLamports: 0n,
        legacy: true,
      };
    }
  }
  return { error: 'memo not in signed bridge2 format' };
}

function solanaAssetOwner(asset) {
  return String(asset?.owner || asset?.ownerAddress || '');
}

function solanaAssetCollection(asset) {
  const grouping = Array.isArray(asset?.grouping) ? asset.grouping : [];
  const group = grouping.find((row) => String(row?.group_key || row?.key || '').toLowerCase() === 'collection');
  const groupValue = String(group?.group_value || group?.value || '');
  if (/^[1-9A-HJ-NP-Za-km-z]{32,44}$/.test(groupValue)) return groupValue;
  const ua = asset?.updateAuthority;
  if (ua?.type === 'Collection') return String(ua.address || '');
  if (ua?.__kind === 'Collection') return String(ua.fields?.[0] || '');
  const candidates = [
    asset?.collection?.address,
    asset?.collection?.publicKey,
    asset?.collection,
    asset?.collectionAddress,
  ];
  for (const c of candidates) {
    const s = String(c || '');
    if (/^[1-9A-HJ-NP-Za-km-z]{32,44}$/.test(s)) return s;
  }
  return '';
}

function solanaAssetLevel(asset) {
  const attrs = [
    asset?.attributes?.attributeList,
    asset?.plugins?.attributes?.attributeList,
    asset?.content?.metadata?.attributes,
    asset?.content?.metadata?.properties?.attributes,
  ].filter(Array.isArray).flat();
  const attr = attrs.find((x) => String(x.key || x.trait_type || '').toLowerCase() === 'level');
  const level = Number(attr?.value || 1);
  if ([1, 2, 3].includes(level)) return level;
  const text = `${asset?.name || ''} ${asset?.uri || ''} ${asset?.content?.metadata?.name || ''} ${asset?.content?.json_uri || ''}`;
  const match = text.match(/\bL(?:evel)?\s*([123])\b/i);
  return match ? Number(match[1]) : 1;
}

function solanaAssetUpdateAuthority(asset) {
  const ua = asset?.updateAuthority;
  if (ua?.type === 'Address') return String(ua.address || '');
  if (ua?.__kind === 'Address') return String(ua.fields?.[0] || '');
  return String(ua?.address || ua?.publicKey || '');
}

function solanaAssetLooksLikeLegacyBridge(asset, dep, collectionSlug) {
  if (collectionSlug !== 'demonking') return false;
  const authority = solanaAssetUpdateAuthority(asset);
  const expectedAuthority = String(dep?.authority || '');
  if (expectedAuthority && authority && authority !== expectedAuthority) return false;
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

function bridgeBadRequest(message) {
  const err = new Error(message);
  err.status = 400;
  return err;
}

function bridgeForbidden(message) {
  const err = new Error(message);
  err.status = 403;
  return err;
}

function normalizeSolanaPubkey(value, label) {
  try {
    const { PublicKey } = require('@solana/web3.js');
    return new PublicKey(String(value || '').trim()).toBase58();
  } catch {
    throw bridgeBadRequest(`${label || 'Solana public key'} is malformed`);
  }
}

function normalizeSolanaPubkeySafe(value) {
  try {
    return normalizeSolanaPubkey(value, 'Solana public key');
  } catch {
    return '';
  }
}

async function solanaAccountDescriptor(assetPubkey) {
  const { PublicKey } = require('@solana/web3.js');
  const pubkey = new PublicKey(assetPubkey);
  const connections = solanaConnections();
  if (connections.length === 0) {
    const err = new Error('Solana RPC endpoint is not configured');
    err.status = 503;
    throw err;
  }
  let lastError = null;
  let receivedResponse = false;
  for (const conn of connections) {
    try {
      // eslint-disable-next-line no-await-in-loop
      const account = await conn.getParsedAccountInfo(pubkey, 'confirmed');
      receivedResponse = true;
      const value = account?.value;
      if (!value) continue;
      const parsed = value.data?.parsed || null;
      return {
        exists: true,
        owner: value.owner?.toBase58?.() || String(value.owner || ''),
        parsedType: parsed?.type || null,
        parsedInfo: parsed?.info || null,
      };
    } catch (err) {
      lastError = err;
      // try next RPC
    }
  }
  if (!receivedResponse && lastError) {
    const err = new Error(`Solana account read failed: ${lastError.message || lastError}`);
    err.status = 502;
    throw err;
  }
  return { exists: false, owner: '', parsedType: null, parsedInfo: null };
}

async function getSolanaBridgeAssetInfo(assetPubkey, expectedOwner, opts = {}) {
  const collectionSlug = normalizeBridgeCollectionSlug(opts.collection || opts.collectionSlug);
  const collectionLabel = collectionSlug === 'voidspore' ? 'Voidspore' : 'Demon King';
  const dep = deploymentOf('solana', collectionSlug);
  if (!dep?.collection) throw new Error(`${collectionLabel} Solana collection not configured`);
  const sourceAsset = normalizeSolanaPubkey(assetPubkey, 'Solana source asset');
  const sourceOwner = expectedOwner ? normalizeSolanaPubkey(expectedOwner, 'Solana source owner') : '';
  if (collectionSlug === 'demonking') {
    try {
      const { getToken2022NftInfo } = require('./solana_token2022_nft');
      let token2022Err = null;
      for (const connection of solanaConnections()) {
        try {
          // eslint-disable-next-line no-await-in-loop
          return await getToken2022NftInfo({
            mint: sourceAsset,
            expectedOwner: sourceOwner,
            connection,
            collectionPubkey: dep.collection,
          });
        } catch (err) {
          token2022Err = err;
        }
      }
      throw token2022Err || new Error('Token-2022 read failed');
    } catch (err) {
      const msg = String(err?.message || err);
      const account = await solanaAccountDescriptor(sourceAsset);
      if (!account.exists) {
        const migrated = solanaMigratedCoreAsset(sourceAsset);
        if (migrated) {
          const replacement = migrated.newMint || migrated.mint || migrated.assetAddress || 'the migrated Token-2022 mint';
          throw bridgeBadRequest(`This legacy Solana Core NFT was migrated. Use replacement mint ${replacement}`);
        }
        throw bridgeBadRequest(`Solana source asset was not found. Use the current ${collectionLabel} mint/asset address from the NFT picker.`);
      }
      const { TOKEN_2022_PROGRAM_ID } = require('@solana/spl-token');
      if (account.owner === TOKEN_2022_PROGRAM_ID.toBase58()) {
        const isTokenAccount = String(account.parsedType || '').toLowerCase() === 'account';
        const hint = isTokenAccount && account.parsedInfo?.mint
          ? ` Use mint ${account.parsedInfo.mint} instead of the token account.`
          : '';
        throw bridgeBadRequest(`${msg}.${hint}`.slice(0, 240));
      }
      if (account.owner && account.owner !== SOLANA_MPL_CORE_PROGRAM) {
        throw bridgeBadRequest(`Solana source address is not a ${collectionLabel} NFT asset. Use the NFT mint/asset address, not a wallet, token account, or transaction signature.`);
      }
      if (!new RegExp(`Token-2022|token|mint|owner|1-of-1|${collectionLabel.replace(/\s+/g, '\\s+')}`, 'i').test(msg)) throw err;
    }
  }
  const migrated = collectionSlug === 'demonking' ? solanaMigratedCoreAsset(sourceAsset) : null;
  if (migrated) {
    const replacement = migrated.newMint || migrated.mint || migrated.assetAddress || 'the migrated Token-2022 mint';
    throw bridgeBadRequest(`This legacy Solana Core NFT was migrated. Use replacement mint ${replacement}`);
  }
  const { createUmi } = await import('@metaplex-foundation/umi-bundle-defaults');
  const { mplCore, fetchAsset } = await import('@metaplex-foundation/mpl-core');
  const { publicKey } = await import('@metaplex-foundation/umi');
  const rpcUrls = solanaRpcUrls();
  const reads = [];
  const errors = [];
  for (const rpc of rpcUrls) {
    try {
      const umi = createUmi(rpc).use(mplCore());
      // eslint-disable-next-line no-await-in-loop
      const asset = await fetchAsset(umi, publicKey(sourceAsset));
      const owner = solanaAssetOwner(asset);
      const collection = solanaAssetCollection(asset);
      const collectionMatches = String(collection) === String(dep.collection);
      const acceptedLegacyBridge = !collection && solanaAssetLooksLikeLegacyBridge(asset, dep, collectionSlug);
      reads.push({
        rpc,
        asset,
        owner,
        collection,
        collectionMatches,
        acceptedLegacyBridge,
      });
    } catch (err) {
      errors.push({ rpc, message: err?.message || String(err) });
    }
  }
  if (!reads.length) {
    const err = errors[0]?.message || '';
    if (err) console.warn(`[bridge] Solana source asset read failed across ${rpcUrls.length} RPC(s): ${err}`);
    throw bridgeBadRequest(`Solana source asset is not a ${collectionLabel} NFT or was not found. Use the current mint/asset address from the NFT picker.`);
  }
  const collectionReads = reads.filter((row) => row.collectionMatches || row.acceptedLegacyBridge);
  if (!collectionReads.length) {
    throw bridgeBadRequest(`Solana asset is not in the ${collectionLabel} collection`);
  }
  const selected = sourceOwner
    ? collectionReads.find((row) => normalizeSolanaPubkeySafe(row.owner) === sourceOwner)
    : collectionReads[0];
  if (!selected) {
    const owners = [...new Set(collectionReads.map((row) => String(row.owner || '')).filter(Boolean))].slice(0, 3);
    const suffix = owners.length ? ` (expected ${sourceOwner}, on-chain owner ${owners.join(', ')})` : '';
    throw bridgeForbidden(`Solana source wallet is not the asset owner${suffix}`);
  }
  return {
    standard: 'mpl-core',
    asset: sourceAsset,
    owner: selected.owner,
    collection: selected.collection || dep.collection,
    legacyCollectionless: selected.acceptedLegacyBridge || undefined,
    level: solanaAssetLevel(selected.asset),
  };
}

function solanaSystemTransferLamports(parsed, { from, to }) {
  const ixs = parsed?.transaction?.message?.instructions || [];
  const innerIxLists = (parsed?.meta?.innerInstructions || []).map((g) => g.instructions || []);
  const allIxs = [ixs, ...innerIxLists].flat();
  let total = 0n;
  for (const ix of allIxs) {
    const programId = ixProgramIdStr(ix);
    const parsedIx = ix.parsed || {};
    const info = parsedIx.info || {};
    const isSystem = programId === '11111111111111111111111111111111' || String(ix.program || '') === 'system';
    if (!isSystem || parsedIx.type !== 'transfer') continue;
    const source = String(info.source || info.from || '');
    const dest = String(info.destination || info.to || '');
    if (source !== String(from) || dest !== String(to)) continue;
    total += BigInt(info.lamports || 0);
  }
  return total;
}

async function verifySolanaToken2022Burn({ conn, allIxs, asset, owner }) {
  const { PublicKey } = require('@solana/web3.js');
  const { TOKEN_2022_PROGRAM_ID, getMint } = require('@solana/spl-token');
  const tokenProgram = TOKEN_2022_PROGRAM_ID.toBase58();
  const burnIx = allIxs.find((ix) => {
    if (ixProgramIdStr(ix) !== tokenProgram) return false;
    const parsed = ix.parsed || {};
    const type = String(parsed.type || '').toLowerCase();
    if (type !== 'burn' && type !== 'burnchecked') return false;
    const info = parsed.info || {};
    return String(info.mint || '') === String(asset)
      && (!owner || String(info.owner || info.authority || '') === String(owner));
  });
  if (!burnIx) return { matched: false };

  const info = burnIx.parsed?.info || {};
  const amountRaw = info.tokenAmount?.amount ?? info.amount ?? '0';
  if (BigInt(amountRaw || 0) < 1n) {
    return { matched: true, error: 'Token-2022 burn amount is less than 1' };
  }
  try {
    const mintInfo = await getMint(conn, new PublicKey(asset), 'confirmed', TOKEN_2022_PROGRAM_ID);
    if (BigInt(mintInfo.supply) !== 0n) {
      return { matched: true, error: `Token-2022 mint supply is still ${mintInfo.supply}` };
    }
  } catch (err) {
    return { matched: true, error: `Token-2022 mint read failed: ${err?.message || err}` };
  }
  return { matched: true, burnState: 'token2022-supply-zero' };
}

// Parse a Solana bridge-burn tx. Verifies:
//   - The tx succeeded on chain.
//   - It contains a Metaplex Core burn instruction for the asset.
//   - It contains a server-signed memo with asset, owner, collection, level,
//     destination and bridge fee.
//   - The asset is gone or no longer owned by the Core program after the tx.
// Returns { asset, level, destinationChainId, destAddress } or { error }.
async function verifySolanaBurnTx(txSig, opts = {}) {
  try {
    const collectionSlug = normalizeBridgeCollectionSlug(opts.collection || opts.collectionSlug);
    const { Connection } = require('@solana/web3.js');
    const { conn, parsed } = await withSolanaRpcFallback(async (rpc) => {
      const connection = createSolanaConnection(Connection, rpc, 'confirmed');
      const tx = await connection.getParsedTransaction(txSig, {
        maxSupportedTransactionVersion: 0, commitment: 'confirmed',
      });
      if (!tx) throw new Error('tx not found');
      return { conn: connection, parsed: tx };
    }, { label: 'Solana burn tx read' });
    if (parsed.meta?.err) return { error: 'tx reverted on chain' };

    const ixs = parsed.transaction.message.instructions || [];
    const bs58 = (await import('bs58')).default;

    // 1) Find memo ix and parse the bridge memo.
    const memoIx = ixs.find((ix) => ixProgramIdStr(ix) === SOLANA_MEMO_PROGRAM);
    if (!memoIx) return { error: 'no memo instruction' };
    const memoText = memoIx.parsed
      || (memoIx.data ? ixDataBytes(memoIx, bs58).toString('utf8') : '');
    const parsedMemo = parseSolanaBridgeMemo(memoText, { allowLegacy: !!opts.allowLegacy });
    if (parsedMemo.error) return { error: parsedMemo.error };
    const { asset, owner, collection, level, destinationChainId, feeLamports } = parsedMemo;

    // Validate dest address format per destination chain id.
    const destAddress = normalizeDestAddrForChainId(parsedMemo.destAddress, destinationChainId);
    if (!destAddress) return { error: `memo destAddress malformed for chainId ${destinationChainId}` };

    const solanaDeploy = deploymentOf('solana', collectionSlug);
    const expectedCollection = solanaDeploy?.collection;
    if (!parsedMemo.legacy && expectedCollection && collection !== expectedCollection) {
      return { error: 'memo collection does not match deployment collection' };
    }

    const signers = (parsed.transaction.message.accountKeys || [])
      .filter((k) => k.signer)
      .map((k) => (typeof k.pubkey?.toBase58 === 'function' ? k.pubkey.toBase58() : String(k.pubkey)));
    if (!parsedMemo.legacy && owner && !signers.includes(owner)) {
      return { error: 'memo owner did not sign burn tx' };
    }

    const treasury = process.env.NFT_BRIDGE_SOLANA_TREASURY
      || process.env.NFT_SOLANA_TREASURY
      || solanaDeploy?.treasury;
    let feePaidLamports = 0n;
    if (!parsedMemo.legacy && feeLamports > 0n) {
      if (!treasury) return { error: 'Solana bridge treasury not configured' };
      feePaidLamports = solanaSystemTransferLamports(parsed, { from: owner, to: treasury });
      if (feePaidLamports < feeLamports) {
        return { error: `bridge fee under-paid: need ${feeLamports} lamports, paid ${feePaidLamports}` };
      }
    }

    // 2) Verify there is an MPL Core instruction referencing the asset.
    //    (Outer and inner ixs — burn could be wrapped in a CPI.)
    const innerIxLists = (parsed.meta?.innerInstructions || []).map((g) => g.instructions || []);
    const allIxs = [ixs, ...innerIxLists].flat();
    const token2022Burn = await verifySolanaToken2022Burn({ conn, allIxs, asset, owner });
    if (token2022Burn.matched) {
      if (token2022Burn.error) return { error: token2022Burn.error };
      return {
        standard: 'token2022',
        asset,
        owner,
        collection: parsedMemo.legacy ? null : collection,
        level,
        destinationChainId,
        destAddress,
        feeLamports,
        feePaidLamports,
        burnState: token2022Burn.burnState,
        signers,
      };
    }

    const coreIx = allIxs.find((ix) => {
      if (ixProgramIdStr(ix) !== SOLANA_MPL_CORE_PROGRAM) return false;
      const keys = ixAccountKeysStr(ix);
      if (!keys.includes(asset)) return false;
      return ixDataBytes(ix, bs58)[0] === 12;
    });
    if (!coreIx) return { error: 'no Metaplex Core BurnV1 ix referencing the asset in tx' };

    // 3) Verify the asset actually no longer exists (was truly burned).
    //    UMI's fetchAsset throws:
    //      - AccountNotFoundError when the account was rent-closed
    //      - UnexpectedAccountError when the lamport-balance-zero account
    //        was repurposed (mpl-core uses this for burns that leave the
    //        account around as a generic system account)
    const postBalance = solanaTxPostBalance(parsed, asset);
    const burnState = postBalance === 0n
      ? { burned: true, reason: 'tx-post-balance-zero' }
      : await waitForSolanaAssetBurned(conn, asset, parsed.slot);
    if (!burnState.burned) {
      const detail = burnState.last
        ? ` (${JSON.stringify(burnState.last).slice(0, 160)})`
        : '';
      return { error: `asset still exists post-tx${detail}` };
    }

    return {
      standard: 'mpl-core',
      asset,
      owner,
      collection: parsedMemo.legacy ? null : collection,
      level,
      destinationChainId,
      destAddress,
      feeLamports,
      feePaidLamports,
      burnState: burnState.reason,
      signers,
    };
  } catch (err) {
    return { error: err?.message || 'parse failed' };
  }
}

// Validate / normalise the destination address parsed out of a Solana
// bridge memo. Returns the canonical string, or null if malformed.
function normalizeDestAddrForChainId(raw, chainId) {
  const cid = BigInt(chainId);
  if (cid === BigInt(CHAIN_IDS.base) || cid === BigInt(CHAIN_IDS.arbitrum) || cid === BigInt(CHAIN_IDS.monad)) {
    // EVM: 0x + 40 hex
    return /^0x[0-9a-fA-F]{40}$/.test(raw) ? raw.toLowerCase() : null;
  }
  if (cid === BigInt(CHAIN_IDS.aptos)) {
    // Aptos: 0x + up to 64 hex (will be left-padded by callers)
    return /^0x[0-9a-fA-F]{1,64}$/.test(raw) ? raw.toLowerCase() : null;
  }
  if (cid === BigInt(CHAIN_IDS.solana)) {
    // Solana ↔ Solana not supported, but validate anyway: base58 32-44 chars.
    return /^[1-9A-HJ-NP-Za-km-z]{32,44}$/.test(raw) ? raw : null;
  }
  return null;
}

// =====================================================================
// sourceRef construction — must match destination contract's expectation.
// =====================================================================

async function buildSourceRef(sourceChain, params) {
  const { keccak256, encodeAbiParameters, getAddress } = await import('viem');
  const collectionSlug = normalizeBridgeCollectionSlug(params?.collection || params?.collectionSlug);
  if (EVM_CHAINS.has(sourceChain)) {
    // EVM: keccak256(abi.encode("EVM", chainId, contract, tokenId))
    const deploy = deploymentOf(sourceChain, collectionSlug);
    const contract = getAddress(deploy.proxy);
    return keccak256(encodeAbiParameters(
      [{ type: 'string' }, { type: 'uint256' }, { type: 'address' }, { type: 'uint256' }],
      ['EVM', BigInt(CHAIN_IDS[sourceChain]), contract, BigInt(params.tokenId)],
    ));
  }
  if (sourceChain === 'aptos') {
    // Aptos: keccak256(abi.encode("APTOS", token_address_as_uint256))
    // We pad the 32-byte Aptos token address into a uint256 slot.
    const tokenAddr = String(params.tokenAddress).replace(/^0x/, '').padStart(64, '0');
    return keccak256(encodeAbiParameters(
      [{ type: 'string' }, { type: 'uint256' }],
      ['APTOS', BigInt('0x' + tokenAddr)],
    ));
  }
  if (sourceChain === 'solana') {
    // Solana: keccak256(abi.encode("SOLANA", asset_pubkey_bytes32))
    // asset is base58 → decode to 32 bytes → encode as bytes32.
    const bs58 = await import('bs58');
    const bytes = bs58.default.decode(String(params.asset));
    if (bytes.length !== 32) throw new Error('Solana asset pubkey must decode to 32 bytes');
    const hex = '0x' + Buffer.from(bytes).toString('hex');
    return keccak256(encodeAbiParameters(
      [{ type: 'string' }, { type: 'bytes32' }],
      ['SOLANA', hex],
    ));
  }
  throw new Error(`Unsupported sourceChain: ${sourceChain}`);
}

// Parse a Solana secret key from env. Supports the same formats as
// nft/scripts/lib-env.mjs::parseSolanaKeypair so server + scripts share one
// source of truth.
//
//   1. JSON array: "[1,2,...]" with 64 or 32 bytes (full secret / seed).
//   2. Hex 32 bytes (optionally 0x-prefixed): treated as seed.
//   3. Base58 string: 64-byte secret or 32-byte seed.
function parseSolanaSecretKey(rawIn) {
  const raw = String(rawIn || '').trim();
  if (!raw) throw new Error('Solana key env empty');

  if (/^\s*\[/.test(raw)) {
    const bytes = Uint8Array.from(JSON.parse(raw));
    if (bytes.length === 64) return bytes;
    if (bytes.length === 32) return seedToSecretKey(bytes);
    throw new Error(`Solana JSON key length ${bytes.length}, expected 64 or 32`);
  }
  if (/^(0x)?[0-9a-fA-F]{64}$/.test(raw)) {
    const hex = raw.startsWith('0x') ? raw.slice(2) : raw;
    return seedToSecretKey(Uint8Array.from(Buffer.from(hex, 'hex')));
  }
  // Base58 fallback.
  const bs58 = require('bs58');
  const decoded = bs58.default ? bs58.default.decode(raw) : bs58.decode(raw);
  if (decoded.length === 64) return new Uint8Array(decoded);
  if (decoded.length === 32) return seedToSecretKey(new Uint8Array(decoded));
  throw new Error(`Solana base58 key length ${decoded.length}, expected 64 or 32`);
}

// ed25519 from-seed expansion → 64-byte secret. Uses @solana/web3.js Keypair
// to avoid pulling tweetnacl directly.
function seedToSecretKey(seed32) {
  const { Keypair } = require('@solana/web3.js');
  return new Uint8Array(Keypair.fromSeed(seed32).secretKey);
}

module.exports = {
  CHAIN_IDS,
  EVM_CHAINS,
  NON_EVM_CHAINS,
  ALL_CHAINS,
  deploymentOf,
  normalizeBridgeCollectionSlug,
  normalizeAptosAddress,
  aptosPrimaryFungibleStoreAddress,
  aptosNativeFeePaidOctas,
  aptosAccount,
  aptosFullnodeBase,
  verifyAptosBurnTx,
  signAptosBridgeReceipt,
  signAptosMintQuote,
  signAptosMintQuotePayment,
  signAptosUpgradeQuote,
  solanaConnection,
  verifySolanaBurnTx,
  getSolanaBridgeAssetInfo,
  buildSolanaBridgeMemo,
  signSolanaBridgeMemo,
  buildSourceRef,
  parseSolanaSecretKey,
  normalizeDestAddrForChainId,
};
