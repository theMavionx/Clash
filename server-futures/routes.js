const express = require('express');
const { v4: uuidv4 } = require('uuid');
const db = require('./db');
const pacifica = require('./pacifica');
const avantis = require('./avantis');
const deposit = require('./deposit');
const decibel = require('./decibel');
const gmx = require('./gmx');
const gmxRewards = require('./gmx-rewards-worker');
const phoenixRewards = require('./phoenix-rewards-worker');

const router = express.Router();

const DECIBEL_MIN_REWARD_NOTIONAL_USD = 1;
const DECIBEL_MAX_REWARD_NOTIONAL_USD = 10_000_000;
// 10 bps = 0.1%. Must match web/src/lib/decibel.js BUILDER_FEE_BPS — the
// signed order's builderFee field is validated against this exact value
// (see assertBuilderFeeAllowed below). Env override allowed for staging.
const DEFAULT_DECIBEL_BUILDER_FEE_BPS = 10;
const DECIBEL_BUILDER_FEE_BPS_RAW = Number(process.env.DECIBEL_BUILDER_FEE_BPS || DEFAULT_DECIBEL_BUILDER_FEE_BPS);
const DECIBEL_BUILDER_FEE_BPS = Number.isFinite(DECIBEL_BUILDER_FEE_BPS_RAW) && DECIBEL_BUILDER_FEE_BPS_RAW > 0
  ? DECIBEL_BUILDER_FEE_BPS_RAW
  : DEFAULT_DECIBEL_BUILDER_FEE_BPS;
const DEFAULT_DECIBEL_BUILDER_SUBACCOUNT =
  '0xfa4d46a481f5bc95de01a629ec95b7876e946ebe1e86374284d899ac4366984a';
const DECIBEL_ALLOWED_BUILDER_ADDRS = new Set(
  String(process.env.DECIBEL_ALLOWED_BUILDER_ADDRS || process.env.DECIBEL_BUILDER_SUBACCOUNT || DEFAULT_DECIBEL_BUILDER_SUBACCOUNT)
    .split(',')
    .map(s => normalizeAptosAddress(s))
    .filter(Boolean)
);

const PERPL_API_BASE = process.env.PERPL_API_BASE || 'https://app.perpl.xyz/api/v1';
const PERPL_FILL_LOOKBACK = Math.max(10, Math.min(250, Number(process.env.PERPL_FILL_LOOKBACK || 100)));
const PERPL_MARKETS_FALLBACK = {
  1: { symbol: 'BTC', price_decimals: 1, size_decimals: 5 },
  10: { symbol: 'MON', price_decimals: 6, size_decimals: 0 },
  20: { symbol: 'ETH', price_decimals: 2, size_decimals: 3 },
  30: { symbol: 'SOL', price_decimals: 2, size_decimals: 3 },
};
let perplContextCache = { at: 0, markets: PERPL_MARKETS_FALLBACK };

function normalizeEvmAddress(addr) {
  const s = String(addr || '').trim().toLowerCase();
  return /^0x[0-9a-f]{40}$/.test(s) ? s : null;
}

function perplRows(payload) {
  if (Array.isArray(payload)) return payload;
  if (Array.isArray(payload?.data)) return payload.data;
  if (Array.isArray(payload?.fills)) return payload.fills;
  if (Array.isArray(payload?.items)) return payload.items;
  return [];
}

async function getPerplMarkets() {
  if (Date.now() - perplContextCache.at < 60_000 && perplContextCache.markets) {
    return perplContextCache.markets;
  }
  try {
    const r = await fetch(`${PERPL_API_BASE}/pub/context`, { headers: { accept: 'application/json' } });
    if (!r.ok) throw new Error(`HTTP ${r.status}`);
    const j = await r.json();
    const out = {};
    for (const m of perplRows(j?.markets || j)) {
      const id = Number(m?.id ?? m?.market_id ?? m?.mkt);
      if (!Number.isFinite(id)) continue;
      const cfg = m?.config || m;
      const state = m?.state || {};
      const priceDecimals = Number(cfg?.price_decimals ?? PERPL_MARKETS_FALLBACK[id]?.price_decimals ?? 1);
      const markWire = Number(state?.mrk ?? state?.lst ?? state?.mid ?? state?.ask ?? state?.bid ?? 0);
      out[id] = {
        symbol: String(m?.name || m?.symbol || PERPL_MARKETS_FALLBACK[id]?.symbol || `MKT${id}`).toUpperCase(),
        price_decimals: priceDecimals,
        size_decimals: Number(cfg?.size_decimals ?? PERPL_MARKETS_FALLBACK[id]?.size_decimals ?? 5),
        mark: Number.isFinite(markWire) && markWire > 0 ? markWire / 10 ** priceDecimals : null,
      };
    }
    if (Object.keys(out).length) {
      perplContextCache = { at: Date.now(), markets: out };
      return out;
    }
  } catch (e) {
    console.warn('[perpl] context cache refresh failed:', e.message);
  }
  return perplContextCache.markets || PERPL_MARKETS_FALLBACK;
}

async function perplAuthedGet(path, { cookie, authNonce }) {
  const r = await fetch(`${PERPL_API_BASE}${path}`, {
    headers: {
      accept: 'application/json',
      cookie,
      'x-auth-nonce': authNonce,
      origin: 'https://app.perpl.xyz',
      referer: 'https://app.perpl.xyz/',
    },
  });
  const text = await r.text();
  let data = null;
  try { data = text ? JSON.parse(text) : null; } catch { data = text; }
  if (!r.ok) {
    const msg = typeof data === 'string' ? data : (data?.error || data?.message || text);
    throw new Error(`Perpl ${path} ${r.status}: ${msg || 'request failed'}`);
  }
  return data;
}

function perplFillTime(fill) {
  const raw = fill?.at?.t ?? fill?.created_at ?? fill?.timestamp ?? fill?.time ?? fill?.ts;
  const n = Number(raw);
  if (Number.isFinite(n)) return n > 1e12 ? new Date(n).toISOString() : new Date(n * 1000).toISOString();
  const d = new Date(raw || 0);
  return Number.isFinite(d.getTime()) ? d.toISOString() : new Date().toISOString();
}

function perplOrderTypeLabel(t, reduceOnly = false) {
  const n = Number(t);
  if (n === 1 || n === 2) return 'market';
  if (n === 3 || n === 4 || reduceOnly) return 'close';
  return 'trade';
}

function perplSideFromOrderType(t, rawSize = 0, reduceOnly = false) {
  const n = Number(t);
  const isClose = n === 3 || n === 4 || reduceOnly;
  const isLong = n === 1 || n === 3 || (n !== 2 && n !== 4 && Number(rawSize) > 0);
  if (isClose) return isLong ? 'close_long' : 'close_short';
  return isLong ? 'long' : 'short';
}

function perplNumericId(value) {
  const n = Number(value);
  return Number.isSafeInteger(n) && n > 0 ? n : null;
}

function normalizePerplFill(fill, markets) {
  const marketId = Number(fill?.mkt ?? fill?.market_id ?? fill?.market);
  const market = markets[marketId] || PERPL_MARKETS_FALLBACK[marketId];
  if (!market) return null;
  const price = Number(fill?.p ?? fill?.price ?? 0) / 10 ** Number(market.price_decimals || 1);
  const rawSize = Number(fill?.s ?? fill?.size ?? fill?.fs ?? 0);
  const amount = Math.abs(rawSize) / 10 ** Number(market.size_decimals || 5);
  const sideType = Number(fill?.t ?? fill?.type ?? fill?.ot);
  const isClose = sideType === 3 || sideType === 4 || fill?.ro === true || fill?.reduce_only === true;
  const side = perplSideFromOrderType(sideType, rawSize, isClose);
  const notional = price * amount;
  if (!Number.isFinite(notional) || notional <= 0 || notional > 10_000_000) return null;
  const orderId = perplNumericId(fill?.oid ?? fill?.order_id);
  const id = String(orderId ?? fill?.fid ?? fill?.id ?? fill?.rq ?? `${marketId}:${rawSize}:${fill?.p}:${fill?.at?.t || ''}`);
  const fee = Number(fill?.f ?? fill?.fee ?? 0) / 1e6;
  const pnl = fill?.pnl ?? fill?.realized_pnl;
  return {
    symbol: market.symbol,
    side,
    orderType: perplOrderTypeLabel(sideType, isClose),
    amount: String(amount),
    price: String(price),
    orderId,
    clientOrderId: `perpl:${id}`,
    status: 'filled',
    dex: 'monad',
    notional_usd: notional,
    verifiedSource: 'perpl_api',
    pnl: Number.isFinite(Number(pnl)) ? String(Number(pnl) / 1e6) : null,
    fee,
    createdAt: perplFillTime(fill),
  };
}

// ---------- Auth Middleware ----------
// Validates x-token by reading the main game server's SQLite DB directly.
// Both services run on the same host so cross-SQLite-file reads are cheap
// and avoid an HTTP round-trip per futures request. Read-only, no writes.
const Database = require('better-sqlite3');
const path = require('path');

const MAIN_DB_PATH = process.env.CLASH_MAIN_DB
  || path.join(__dirname, '..', 'server', 'clash.db');
let mainDb = null;
let playerByTokenStmt = null;
function ensureMainDb() {
  if (mainDb) return;
  try {
    mainDb = new Database(MAIN_DB_PATH, { readonly: true, fileMustExist: true });
    try { mainDb.pragma('journal_mode = WAL'); } catch {}
    // Also pull the player's saved DEX — used to reject client-header spoof.
    playerByTokenStmt = mainDb.prepare('SELECT id, name, wallet, dex FROM players WHERE token = ?');
  } catch (e) {
    console.error('[futures] Failed to open main DB at', MAIN_DB_PATH, e.message);
  }
}

function auth(req, res, next) {
  const token = req.headers['x-token'];
  if (!token) return res.status(401).json({ error: 'Missing x-token header' });
  ensureMainDb();
  if (!mainDb) return res.status(503).json({ error: 'Auth DB unavailable' });
  let player = null;
  try { player = playerByTokenStmt.get(token); } catch (e) { /* swallow */ }
  if (!player) return res.status(401).json({ error: 'Invalid token' });
  req.playerId = player.id;
  req.playerName = player.name;
  req.playerWallet = player.wallet;

  // Trust the SERVER-stored dex, not whatever the client asks for. The client
  // header/query is still useful as a best-effort sanity check: if it explicitly
  // asks for the wrong dex, reject so the UI can prompt the user to /set-dex.
  const SUPPORTED_DEXES = new Set(['avantis', 'pacifica', 'decibel', 'gmx', 'monad', 'phoenix']);
  const storedDex = SUPPORTED_DEXES.has(player.dex) ? player.dex : 'pacifica';
  const askedDex = (req.query.dex || req.headers['x-dex'] || storedDex).toLowerCase();
  const normalizedAsked = SUPPORTED_DEXES.has(askedDex) ? askedDex : 'pacifica';
  if (normalizedAsked !== storedDex) {
    return res.status(409).json({
      error: `Account is registered for '${storedDex}'. Switch DEX in your profile before calling ${normalizedAsked} endpoints.`,
      stored_dex: storedDex,
      requested_dex: normalizedAsked,
    });
  }
  req.dex = storedDex;
  next();
}

// ==================== WALLET ====================

// Get or create custodial wallet for player
router.post('/wallet', auth, (req, res) => {
  try {
    if (req.dex === 'avantis' || req.dex === 'gmx' || req.dex === 'monad' || req.dex === 'phoenix') {
      return res.status(410).json({
        error: `${req.dex} is self-custody. Connect the chain wallet in the client instead.`,
      });
    }
    const isAvantis = req.dex === 'avantis';
    const generateFn = isAvantis ? avantis.generateWallet : pacifica.generateWallet;
    const chain = isAvantis ? 'base' : 'solana';

    const { wallet, created } = db.getOrCreateWallet(
      req.playerId,
      req.playerName,
      generateFn,
      req.dex,
      chain
    );
    res.json({
      public_key: wallet.public_key,
      dex: req.dex,
      chain: wallet.chain,
      created,
    });
  } catch (e) {
    console.error('Wallet creation error:', e);
    res.status(500).json({ error: 'Failed to create wallet' });
  }
});

// Get wallet info (public key only — never expose secret)
router.get('/wallet', auth, (req, res) => {
  if (req.dex === 'avantis' || req.dex === 'gmx' || req.dex === 'monad' || req.dex === 'phoenix') {
    return res.status(410).json({
      error: `${req.dex} is self-custody. Connect the chain wallet in the client instead.`,
    });
  }
  const wallet = db.getWallet(req.playerId, req.dex);
  if (!wallet) return res.status(404).json({ error: 'No wallet found. Call POST /wallet first.' });
  res.json({ public_key: wallet.public_key, dex: req.dex, chain: wallet.chain });
});

// ==================== ACCOUNT INFO ====================

// Get account info (balance, equity, etc.)
// Avantis is now non-custodial: the client passes ?address=<user's wallet>
// and we proxy Avantis Core API by that address (public data). Pacifica
// remains custodial → uses token auth to look up the server-held keypair.
router.get('/account', async (req, res) => {
  const dex = (req.query.dex || 'pacifica').toLowerCase();
  try {
    if (dex === 'avantis') {
      const address = String(req.query.address || '').trim();
      if (!/^0x[0-9a-fA-F]{40}$/.test(address)) {
        return res.status(400).json({ error: 'address query param required (0x...)' });
      }
      const info = await avantis.getAccountInfoByAddress(address);
      return res.json(info);
    }
    if (dex === 'gmx') {
      const address = String(req.query.address || '').trim();
      if (!/^0x[0-9a-fA-F]{40}$/.test(address)) {
        return res.status(400).json({ error: 'address query param required (0x...)' });
      }
      const info = await gmx.getAccountByAddress(address);
      return res.json(info);
    }
    // Pacifica (custodial) — keep legacy auth-gated flow.
    return authGate(req, res, async () => {
      const wallet = db.getWallet(req.playerId, 'pacifica');
      if (!wallet) return res.status(404).json({ error: 'No wallet' });
      const info = await pacifica.getAccountInfo(wallet.secret_key);
      res.json(info);
    });
  } catch (e) {
    console.error('Account info error:', e);
    res.status(500).json({ error: 'Failed to get account info' });
  }
});

// Gate helper so we can run `auth` middleware inline for Pacifica-only paths
// without turning this whole handler into middleware spaghetti.
function authGate(req, res, next) {
  return auth(req, res, (err) => { if (err) return; next(); });
}

function normalizeAptosAddress(addr) {
  return decibel.normalizeAptosAddress(addr);
}

function ensureDecibel(req, res) {
  if (req.dex !== 'decibel') {
    res.status(409).json({
      error: `Account is registered for '${req.dex}'. Switch DEX to decibel before calling Decibel endpoints.`,
      stored_dex: req.dex,
      requested_dex: 'decibel',
    });
    return false;
  }
  return true;
}

async function requireDecibelOwnerAndSubaccount(req, res) {
  if (!ensureDecibel(req, res)) return null;
  const owner = normalizeAptosAddress(req.body?.owner || req.query?.owner || req.playerWallet);
  const playerWallet = normalizeAptosAddress(req.playerWallet);
  if (!owner || !playerWallet || owner !== playerWallet) {
    res.status(403).json({ error: 'owner must match the wallet registered to this game account' });
    return null;
  }
  const subaccount = normalizeAptosAddress(
    req.body?.subaccountAddr || req.body?.subaccount || req.query?.subaccountAddr || req.query?.subaccount
  );
  if (!subaccount) {
    res.status(400).json({ error: 'subaccountAddr required' });
    return null;
  }
  const primary = normalizeAptosAddress(await decibel.getPrimarySubaccountAddr(owner));
  if (subaccount !== primary) {
    res.status(400).json({ error: 'subaccountAddr does not match the registered wallet primary Decibel subaccount' });
    return null;
  }
  return { owner, subaccount };
}

function requireDecibelBuilderFee(req, res) {
  const builderAddr = normalizeAptosAddress(req.body?.builderAddr);
  const builderFee = Number(req.body?.builderFee);
  if (!builderAddr) {
    res.status(400).json({ error: 'builderAddr required for Decibel order fee routing' });
    return null;
  }
  if (!Number.isFinite(builderFee) || builderFee !== DECIBEL_BUILDER_FEE_BPS) {
    res.status(400).json({ error: `builderFee must be ${DECIBEL_BUILDER_FEE_BPS} bps` });
    return null;
  }
  if (DECIBEL_ALLOWED_BUILDER_ADDRS.size > 0 && !DECIBEL_ALLOWED_BUILDER_ADDRS.has(builderAddr)) {
    res.status(400).json({ error: 'builderAddr is not an approved Clash builder subaccount' });
    return null;
  }
  return { builderAddr, builderFee: DECIBEL_BUILDER_FEE_BPS };
}

// ==================== DECIBEL SERVER-SIDE SIGNER ====================

router.get('/decibel/signer', auth, async (req, res) => {
  try {
    if (!ensureDecibel(req, res)) return;
    const info = await decibel.getServerSignerInfo();
    res.json(info);
  } catch (e) {
    console.error('[decibel] signer error:', e);
    res.status(500).json({ error: e.message || 'Decibel server signer unavailable' });
  }
});

router.post('/decibel/orders/place', auth, async (req, res) => {
  try {
    const verified = await requireDecibelOwnerAndSubaccount(req, res);
    if (!verified) return;
    const builder = requireDecibelBuilderFee(req, res);
    if (!builder) return;
    const clientOrderId = decibel.normalizeClientOrderId(req.body?.clientOrderId)
      || decibel.newClientOrderId();
    const orderPayload = {
      ...req.body,
      ...builder,
      clientOrderId,
      subaccountAddr: verified.subaccount,
    };
    const result = await decibel.placeOrder(orderPayload);
    if (result?.success === false) {
      return res.status(400).json({ ...result, clientOrderId: orderPayload.clientOrderId });
    }
    if (result?.success !== false) {
      try {
        const reward = decibel.rewardInfoFromPlaceOrder(orderPayload, result);
        if (reward.rewardable) {
          const n = Number(reward.notional_usd);
          if (
            Number.isFinite(n)
            && n >= DECIBEL_MIN_REWARD_NOTIONAL_USD
            && n <= DECIBEL_MAX_REWARD_NOTIONAL_USD
          ) {
            db.addTrade(req.playerId, {
              symbol: reward.symbol,
              side: reward.side,
              orderType: reward.orderType,
              amount: String(reward.amount),
              price: String(reward.price),
              orderId: reward.txHash || result.orderId || null,
              clientOrderId: reward.clientOrderId,
              status: 'filled',
              dex: 'decibel',
              notional_usd: n,
              verifiedSource: 'server',
            });
          } else {
            console.log(`[decibel] reward row skipped: notional ${Number.isFinite(n) ? n.toFixed(4) : String(n)} outside reward range`);
          }
        }
      } catch (e) {
        console.warn('[decibel] reward row skipped:', e.message);
      }
    }
    res.json({ ...result, clientOrderId: orderPayload.clientOrderId });
  } catch (e) {
    console.error('[decibel] place order error:', e);
    res.status(500).json({ error: e.message || 'Failed to place Decibel order' });
  }
});

router.post('/decibel/orders/cancel', auth, async (req, res) => {
  try {
    const verified = await requireDecibelOwnerAndSubaccount(req, res);
    if (!verified) return;
    const result = await decibel.cancelOrder({
      ...req.body,
      subaccountAddr: verified.subaccount,
    });
    if (result?.success === false) return res.status(400).json(result);
    res.json(result);
  } catch (e) {
    console.error('[decibel] cancel order error:', e);
    res.status(500).json({ error: e.message || 'Failed to cancel Decibel order' });
  }
});

router.post('/decibel/tpsl', auth, async (req, res) => {
  try {
    const verified = await requireDecibelOwnerAndSubaccount(req, res);
    if (!verified) return;
    const body = req.body || {};
    const hasTp = body.tpTriggerPrice != null || body.tpLimitPrice != null || body.tpSize != null;
    const hasSl = body.slTriggerPrice != null || body.slLimitPrice != null || body.slSize != null;
    const tpOrderId = body.tpOrderId || body.tp_order_id;
    const slOrderId = body.slOrderId || body.sl_order_id;
    const base = {
      ...body,
      subaccountAddr: verified.subaccount,
    };
    const results = [];
    if (hasTp && tpOrderId) {
      results.push({
        leg: 'tp',
        ...(await decibel.updateTpOrderForPosition({
          ...base,
          prevOrderId: tpOrderId,
        })),
      });
    }
    if (hasSl && slOrderId) {
      results.push({
        leg: 'sl',
        ...(await decibel.updateSlOrderForPosition({
          ...base,
          prevOrderId: slOrderId,
        })),
      });
    }
    const placePayload = {
      ...base,
      ...(hasTp && !tpOrderId ? {
        tpTriggerPrice: body.tpTriggerPrice,
        tpLimitPrice: body.tpLimitPrice,
        tpSize: body.tpSize,
      } : {
        tpTriggerPrice: undefined,
        tpLimitPrice: undefined,
        tpSize: undefined,
      }),
      ...(hasSl && !slOrderId ? {
        slTriggerPrice: body.slTriggerPrice,
        slLimitPrice: body.slLimitPrice,
        slSize: body.slSize,
      } : {
        slTriggerPrice: undefined,
        slLimitPrice: undefined,
        slSize: undefined,
      }),
    };
    if ((hasTp && !tpOrderId) || (hasSl && !slOrderId)) {
      results.push({
        leg: hasTp && !tpOrderId && hasSl && !slOrderId ? 'tp_sl' : (hasTp && !tpOrderId ? 'tp' : 'sl'),
        ...(await decibel.placeTpSlOrderForPosition(placePayload)),
      });
    }
    const failed = results.find(r => r?.success === false);
    if (failed) return res.status(400).json({ success: false, results, error: failed.error || 'Decibel TP/SL failed' });
    const hashes = results.map(r => r.transactionHash || r.hash).filter(Boolean);
    res.json({
      success: true,
      results,
      transactionHash: hashes[hashes.length - 1] || null,
      hash: hashes[hashes.length - 1] || null,
    });
  } catch (e) {
    console.error('[decibel] TP/SL error:', e);
    res.status(500).json({ error: e.message || 'Failed to update Decibel TP/SL' });
  }
});

router.post('/decibel/leverage', auth, async (req, res) => {
  try {
    const verified = await requireDecibelOwnerAndSubaccount(req, res);
    if (!verified) return;
    const result = await decibel.configureUserSettingsForMarket({
      ...req.body,
      subaccountAddr: verified.subaccount,
    });
    if (result?.success === false) return res.status(400).json(result);
    res.json(result);
  } catch (e) {
    console.error('[decibel] leverage error:', e);
    res.status(500).json({ error: e.message || 'Failed to update Decibel leverage' });
  }
});

// ==================== MARKET DATA ====================

router.get('/markets', async (req, res) => {
  const dex = (req.query.dex || 'pacifica').toLowerCase();
  try {
    const info = dex === 'avantis' ? await avantis.getMarketInfo()
      : dex === 'gmx' ? await gmx.getMarketInfo()
      : await pacifica.getMarketInfo();
    res.json(info);
  } catch (e) {
    res.status(500).json({ error: 'Failed to get market info' });
  }
});

router.get('/prices', async (req, res) => {
  const dex = (req.query.dex || 'pacifica').toLowerCase();
  try {
    const prices = dex === 'avantis' ? await avantis.getPrices()
      : dex === 'gmx' ? await gmx.getPrices()
      : await pacifica.getPrices();
    res.json(prices);
  } catch (e) {
    res.status(500).json({ error: 'Failed to get prices' });
  }
});

router.get('/orderbook', async (req, res) => {
  const { symbol, agg_level } = req.query;
  if (!symbol) return res.status(400).json({ error: 'symbol required' });
  try {
    const book = await pacifica.getOrderbook(symbol, agg_level);
    res.json(book);
  } catch (e) {
    res.status(500).json({ error: 'Failed to get orderbook' });
  }
});

router.get('/candles', async (req, res) => {
  const { symbol, interval, start_time, end_time } = req.query;
  if (!symbol || !interval || !start_time) {
    return res.status(400).json({ error: 'symbol, interval, start_time required' });
  }
  try {
    const candles = await pacifica.getCandles(symbol, interval, start_time, end_time);
    res.json(candles);
  } catch (e) {
    res.status(500).json({ error: 'Failed to get candles' });
  }
});

router.get('/trades', async (req, res) => {
  const { symbol } = req.query;
  if (!symbol) return res.status(400).json({ error: 'symbol required' });
  try {
    const trades = await pacifica.getRecentTrades(symbol);
    res.json(trades);
  } catch (e) {
    res.status(500).json({ error: 'Failed to get trades' });
  }
});

// ==================== POSITIONS ====================

router.get('/positions', async (req, res) => {
  const dex = (req.query.dex || 'pacifica').toLowerCase();
  try {
    if (dex === 'avantis') {
      const address = String(req.query.address || '').trim();
      if (!/^0x[0-9a-fA-F]{40}$/.test(address)) {
        return res.status(400).json({ error: 'address query param required' });
      }
      const positions = await avantis.getPositionsByAddress(address);
      return res.json(positions);
    }
    if (dex === 'gmx') {
      const address = String(req.query.address || '').trim();
      if (!/^0x[0-9a-fA-F]{40}$/.test(address)) {
        return res.status(400).json({ error: 'address query param required' });
      }
      const positions = await gmx.getPositionsByAddress(address);
      return res.json(positions);
    }
    return authGate(req, res, async () => {
      const wallet = db.getWallet(req.playerId, 'pacifica');
      if (!wallet) return res.status(404).json({ error: 'No wallet' });
      const positions = await pacifica.getPositions(wallet.secret_key);
      res.json(positions);
    });
  } catch (e) {
    console.error('Positions error:', e);
    res.status(500).json({ error: 'Failed to get positions' });
  }
});

// ==================== ORDERS ====================

router.get('/orders', async (req, res) => {
  const dex = (req.query.dex || 'pacifica').toLowerCase();
  try {
    if (dex === 'avantis') {
      const address = String(req.query.address || '').trim();
      if (!/^0x[0-9a-fA-F]{40}$/.test(address)) {
        return res.status(400).json({ error: 'address query param required' });
      }
      const orders = await avantis.getOpenOrdersByAddress(address);
      return res.json(orders);
    }
    if (dex === 'gmx') {
      const address = String(req.query.address || '').trim();
      if (!/^0x[0-9a-fA-F]{40}$/.test(address)) {
        return res.status(400).json({ error: 'address query param required' });
      }
      const orders = await gmx.getOrdersByAddress(address);
      return res.json(orders);
    }
    return authGate(req, res, async () => {
      const wallet = db.getWallet(req.playerId, 'pacifica');
      if (!wallet) return res.status(404).json({ error: 'No wallet' });
      const orders = await pacifica.getOpenOrders(wallet.secret_key);
      res.json(orders);
    });
  } catch (e) {
    console.error('Orders error:', e);
    res.status(500).json({ error: 'Failed to get orders' });
  }
});

// Reject Avantis writes on the server — they're now signed client-side.
// Middleware at the top of each write handler makes the error consistent.
function avantisMigratedGuard(req, res, next) {
  if (req.dex === 'avantis') {
    return res.status(410).json({
      error: 'Avantis is now non-custodial. Update your client — trades are signed in the user wallet.',
      migrated: true,
    });
  }
  next();
}

// Create market order (LONG/SHORT) — Pacifica only; Avantis returns 410.
router.post('/orders/market', auth, avantisMigratedGuard, async (req, res) => {
  try {
    const wallet = db.getWallet(req.playerId, req.dex);
    if (!wallet) return res.status(404).json({ error: 'No wallet' });

    const { symbol, side, amount, slippage_percent, reduce_only } = req.body;
    if (!symbol || !side || !amount) {
      return res.status(400).json({ error: 'symbol, side, amount required' });
    }

    const clientOrderId = uuidv4();
    const result = await pacifica.createMarketOrder(wallet.secret_key, {
      symbol, side, amount,
      slippagePercent: slippage_percent || '0.5',
      reduceOnly: reduce_only || false,
      clientOrderId,
    });

    db.addTrade(req.playerId, {
      symbol, side, orderType: 'market',
      amount: String(amount),
      orderId: result.order_id || result.tx_hash,
      clientOrderId,
      status: result.error ? 'failed' : 'filled',
      dex: 'pacifica',
      notional_usd: Number(amount),
    });

    res.json(result);
  } catch (e) {
    console.error('Market order error:', e);
    res.status(500).json({ error: e.message || 'Failed to create market order' });
  }
});

// Create limit order — Pacifica only; Avantis returns 410.
router.post('/orders/limit', auth, avantisMigratedGuard, async (req, res) => {
  try {
    const wallet = db.getWallet(req.playerId, req.dex);
    if (!wallet) return res.status(404).json({ error: 'No wallet' });

    const { symbol, side, price, amount, tif, reduce_only } = req.body;
    if (!symbol || !side || !price || !amount) {
      return res.status(400).json({ error: 'symbol, side, price, amount required' });
    }

    const clientOrderId = uuidv4();
    const result = await pacifica.createLimitOrder(wallet.secret_key, {
      symbol, side, price, amount,
      tif: tif || 'GTC',
      reduceOnly: reduce_only || false,
      clientOrderId,
    });

    db.addTrade(req.playerId, {
      symbol, side, orderType: 'limit',
      amount: String(amount),
      price: String(price),
      orderId: result.order_id || result.tx_hash,
      clientOrderId,
      status: result.error ? 'failed' : 'open',
      dex: 'pacifica',
      notional_usd: Number(amount),
    });

    res.json(result);
  } catch (e) {
    console.error('Limit order error:', e);
    res.status(500).json({ error: e.message || 'Failed to create limit order' });
  }
});

// Cancel order — Pacifica only; Avantis cancels client-side.
router.post('/orders/cancel', auth, avantisMigratedGuard, async (req, res) => {
  try {
    const wallet = db.getWallet(req.playerId, 'pacifica');
    if (!wallet) return res.status(404).json({ error: 'No wallet' });

    const { symbol, order_id, client_order_id } = req.body;
    if (!symbol) return res.status(400).json({ error: 'symbol required' });
    if (!order_id && !client_order_id) return res.status(400).json({ error: 'order_id or client_order_id required' });
    const result = await pacifica.cancelOrder(wallet.secret_key, {
      symbol,
      orderId: order_id,
      clientOrderId: client_order_id,
    });

    res.json(result);
  } catch (e) {
    console.error('Cancel order error:', e);
    res.status(500).json({ error: e.message || 'Failed to cancel order' });
  }
});

// Cancel all orders (Pacifica only; Avantis doesn't support cancel-all natively)
router.post('/orders/cancel-all', auth, async (req, res) => {
  try {
    const wallet = db.getWallet(req.playerId, req.dex);
    if (!wallet) return res.status(404).json({ error: 'No wallet' });

    if (req.dex === 'avantis') {
      return res.status(400).json({ error: 'cancel-all not supported for Avantis. Cancel orders individually.' });
    }

    const { symbol, all_symbols } = req.body;
    const result = await pacifica.cancelAllOrders(wallet.secret_key, {
      symbol,
      allSymbols: all_symbols !== false,
    });

    res.json(result);
  } catch (e) {
    console.error('Cancel all orders error:', e);
    res.status(500).json({ error: 'Failed to cancel orders' });
  }
});

// ==================== CLOSE POSITION (Avantis) ====================

// Avantis positions close client-side now. Kept as 410 for old clients.
router.post('/positions/close', auth, avantisMigratedGuard, (req, res) => {
  res.status(400).json({ error: 'Pacifica uses /orders/market with reduce_only=true.' });
});

// ==================== LEVERAGE ====================

router.post('/leverage', auth, async (req, res) => {
  if (req.dex === 'avantis') {
    return res.status(400).json({ error: 'Avantis does not support changing leverage on open positions. Set leverage when opening the trade.' });
  }
  try {
    const wallet = db.getWallet(req.playerId, req.dex);
    if (!wallet) return res.status(404).json({ error: 'No wallet' });

    const { symbol, leverage } = req.body;
    if (!symbol || !leverage) return res.status(400).json({ error: 'symbol, leverage required' });

    const result = await pacifica.updateLeverage(wallet.secret_key, { symbol, leverage });
    res.json(result);
  } catch (e) {
    console.error('Leverage error:', e);
    res.status(500).json({ error: 'Failed to update leverage' });
  }
});

// ==================== TP/SL ====================

router.post('/tpsl', auth, avantisMigratedGuard, async (req, res) => {
  try {
    const wallet = db.getWallet(req.playerId, 'pacifica');
    if (!wallet) return res.status(404).json({ error: 'No wallet' });

    // Pacifica TP/SL (Avantis handled client-side)
    const { symbol, side, take_profit, stop_loss } = req.body;
    if (!symbol || !side) return res.status(400).json({ error: 'symbol, side required' });

    const payload = { symbol, side, builder_code: 'clashofperps' };
    if (take_profit) payload.take_profit = take_profit;
    if (stop_loss) payload.stop_loss = stop_loss;

    const body = pacifica.buildSignedRequest('set_position_tpsl', payload, wallet.secret_key);
    const result = await fetch('https://api.pacifica.fi/api/v1/positions/tpsl', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(body),
    }).then(r => r.json());

    res.json(result);
  } catch (e) {
    console.error('TP/SL error:', e);
    res.status(500).json({ error: e.message || 'Failed to set TP/SL' });
  }
});

// ==================== WITHDRAW ====================

router.post('/withdraw', auth, avantisMigratedGuard, async (req, res) => {
  try {
    const wallet = db.getWallet(req.playerId, 'pacifica');
    if (!wallet) return res.status(404).json({ error: 'No wallet' });

    const { amount } = req.body;
    if (!amount || parseFloat(amount) <= 0) {
      return res.status(400).json({ error: 'amount required' });
    }

    const result = await pacifica.withdraw(wallet.secret_key, { amount: parseFloat(amount) });
    balanceCache.delete(`${req.playerId}:pacifica`);
    res.json(result);
  } catch (e) {
    console.error('Withdraw error:', e);
    const msg = e?.shortMessage || e?.cause?.shortMessage || e?.message || 'Withdrawal failed';
    res.status(500).json({ error: String(msg).slice(0, 300) });
  }
});

// ==================== TRADE HISTORY ====================

router.get('/history', auth, (req, res) => {
  const trades = db.getTrades(req.playerId);
  res.json(trades);
});

router.post('/monad/report-fill', auth, async (req, res) => {
  try {
    if (req.dex !== 'monad') {
      return res.status(409).json({
        error: `Account is registered for '${req.dex}'. Switch DEX to monad before reporting Perpl fills.`,
      });
    }
    const wallet = normalizeEvmAddress(req.body?.wallet || req.playerWallet);
    const playerWallet = normalizeEvmAddress(req.playerWallet);
    if (!wallet) return res.status(400).json({ error: 'wallet required (0x...)' });
    if (playerWallet && wallet !== playerWallet) {
      return res.status(409).json({ error: 'wallet does not match player account' });
    }

    const order = req.body?.order || {};
    const marketId = Number(order?.mkt ?? order?.market_id ?? order?.market);
    const orderType = Number(order?.t ?? order?.type);
    const rq = Number(order?.rq ?? order?.request_id);
    const orderId = perplNumericId(order?.oid ?? order?.order_id ?? order?.id);
    const status = Number(order?.st ?? order?.status);
    const statusReason = Number(order?.sr ?? order?.status_reason ?? order?.statusReason);
    const filledWire = Math.abs(Number(order?.fs ?? order?.filled_size ?? order?.filledSize ?? order?.s ?? order?.size ?? 0));
    if (!Number.isFinite(marketId) || !Number.isFinite(orderType) || !orderId || filledWire <= 0) {
      return res.status(400).json({ error: 'invalid Perpl fill report' });
    }
    if (status !== 4 && ![16, 22, 43].includes(statusReason)) {
      return res.status(400).json({ error: 'Perpl order is not filled', status, status_reason: statusReason });
    }
    // Perpl request ids are seeded from Date.now(). Keep the fallback instant,
    // but reject stale/fabricated reports from old tabs.
    if (!Number.isFinite(rq) || Math.abs(Date.now() - rq) > 2 * 60 * 60 * 1000) {
      return res.status(400).json({ error: 'stale Perpl request id' });
    }

    const markets = await getPerplMarkets();
    const market = markets[marketId] || PERPL_MARKETS_FALLBACK[marketId];
    if (!market) return res.status(400).json({ error: 'unknown Perpl market' });

    const priceDecimals = Number(market.price_decimals || 1);
    const sizeDecimals = Number(market.size_decimals || 5);
    const fallbackMark = Number(req.body?.mark ?? req.body?.price ?? 0);
    const price = Number(market.mark) > 0
      ? Number(market.mark)
      : (Number.isFinite(fallbackMark) && fallbackMark > 0 ? fallbackMark : 0);
    const amount = filledWire / 10 ** sizeDecimals;
    const notional = amount * price;
    if (!Number.isFinite(notional) || notional < 10 || notional > 10_000_000) {
      return res.status(400).json({ error: 'Perpl fill notional outside reward bounds', notional });
    }

    const clientOrderId = `perpl:${orderId || rq}`;
    const existing = db.db.prepare(`
      SELECT id FROM trade_history
      WHERE dex = 'monad' AND (
        client_order_id = ?
        OR (? IS NOT NULL AND order_id = ?)
      )
      LIMIT 1
    `).get(clientOrderId, orderId, orderId);
    if (existing) {
      return res.json({ ok: true, imported: false, duplicate: true, trade_id: existing.id, notional_usd: notional });
    }

    const row = {
      symbol: market.symbol,
      side: perplSideFromOrderType(orderType, order?.s ?? order?.size ?? 0),
      orderType: perplOrderTypeLabel(orderType),
      amount: String(amount),
      price: String(price),
      orderId,
      clientOrderId,
      status: 'filled',
      dex: 'monad',
      notional_usd: notional,
      verifiedSource: 'perpl_ws',
      pnl: null,
    };
    const inserted = db.addTrade(req.playerId, row);
    console.log(`[perpl] ws fill report imported player=${req.playerName} rq=${rq} oid=${orderId || '-'} ${row.symbol} ${row.side} $${notional.toFixed(2)}`);
    res.json({ ok: true, imported: true, trade_id: inserted.id, notional_usd: notional, symbol: row.symbol, side: row.side });
  } catch (e) {
    console.warn('[perpl] ws fill report failed:', e.message);
    res.status(502).json({ error: 'Failed to record Perpl fill', detail: e.message });
  }
});

// ==================== TRADE REPORT (non-custodial: Avantis, Decibel) ====================
// Client reports are accepted for backwards-compatible UI flow. Browser-only
// payloads are not rewardable; market opens on Avantis are immediately
// re-read from Core API and recorded as `verified_source='worker'`. Everything
// else is picked up by the per-DEX rewards workers.
const TRADE_REPORT_DEXES = new Set(['avantis', 'decibel']);

function avantisCollateralUsd(row) {
  const raw = row?.collateral ?? row?.trade?.positionSizeUSDC ?? row?.positionSizeUSDC ?? row?.trade?.initialPosToken;
  const n = Number(raw);
  if (!Number.isFinite(n) || n <= 0) return 0;
  return n > 10000 ? n / 1e6 : n;
}

function avantisLeverage(row) {
  const n = Number(row?.leverage ?? row?.trade?.leverage ?? 0);
  if (!Number.isFinite(n) || n <= 0) return 1;
  return n > 10000 ? n / 1e10 : n;
}

function avantisBool(v) {
  if (v === true || v === 1 || v === '1') return true;
  if (typeof v === 'string') return v.toLowerCase() === 'true';
  return false;
}

async function recordVerifiedAvantisOpen(req, body) {
  const orderType = String(body.order_type || 'market').toLowerCase();
  if (orderType !== 'market') return false;
  const dedup = String(body.dedup_key || '').trim();
  const m = dedup.match(/^avantis:open:(0x[0-9a-fA-F]{40}):(\d+):(\d+)$/);
  if (!m) return false;
  const address = String(body.address || '').trim().toLowerCase();
  const dedupAddress = m[1].toLowerCase();
  if (address !== dedupAddress) return false;
  const pairIdx = Number(m[2]);
  const tradeIdx = Number(m[3]);
  let hit = null;
  for (let i = 0; i < 6 && !hit; i++) {
    const positions = await avantis.getPositionsByAddress(address);
    hit = positions.find(p =>
      Number(p?.pairIndex ?? p?.pair_index ?? p?.trade?.pairIndex) === pairIdx
      && Number(p?.index ?? p?.trade?.index) === tradeIdx
    );
    if (!hit) await new Promise(r => setTimeout(r, 1000));
  }
  if (!hit) return false;
  const collateral = avantisCollateralUsd(hit);
  const lev = avantisLeverage(hit);
  const notional = collateral * lev;
  if (!Number.isFinite(notional) || notional < 50 || notional > 10_000_000) return false;
  const side = avantisBool(hit.buy ?? hit.trade?.buy) ? 'long' : 'short';
  let symbol = String(body.symbol || '').toUpperCase();
  try {
    const { indexMap } = await avantis.getPairsMap();
    const p = indexMap?.[pairIdx];
    if (p?.from) {
      const from = String(p.from).toUpperCase();
      const to = String(p.to || 'USD').toUpperCase();
      symbol = from === 'USD' && to && to !== 'USD' ? `${from}${to}` : from;
    }
  } catch {}
  db.addTrade(req.playerId, {
    symbol,
    side,
    orderType: 'market',
    amount: String(collateral),
    orderId: dedup,
    clientOrderId: dedup,
    status: 'filled',
    dex: 'avantis',
    notional_usd: notional,
    verifiedSource: 'worker',
  });
  return true;
}

router.post('/monad/import-fills', auth, async (req, res) => {
  try {
    if (req.dex !== 'monad') {
      return res.status(409).json({
        error: `Account is registered for '${req.dex}'. Switch DEX to monad before importing Perpl fills.`,
      });
    }
    const wallet = normalizeEvmAddress(req.body?.wallet || req.playerWallet);
    const playerWallet = normalizeEvmAddress(req.playerWallet);
    if (!wallet) return res.status(400).json({ error: 'wallet required (0x...)' });
    if (playerWallet && wallet !== playerWallet) {
      return res.status(409).json({ error: 'wallet does not match player account' });
    }
    const authNonce = String(req.body?.auth_nonce || req.headers['x-auth-nonce'] || '').trim();
    if (!authNonce) return res.status(401).json({ error: 'Missing Perpl auth nonce' });
    const cookie = String(req.headers.cookie || '');
    if (!cookie) return res.status(401).json({ error: 'Missing Perpl auth cookie' });

    const markets = await getPerplMarkets();
    const payload = await perplAuthedGet(`/trading/fills?count=${PERPL_FILL_LOOKBACK}`, { cookie, authNonce });
    const rows = perplRows(payload);
    let imported = 0;
    let skipped = 0;
    for (const fill of rows) {
      const row = normalizePerplFill(fill, markets);
      if (!row) { skipped++; continue; }
      try {
        if (row.orderId) {
          const existing = db.db.prepare("SELECT id FROM trade_history WHERE dex = 'monad' AND order_id = ? LIMIT 1").get(row.orderId);
          if (existing) { skipped++; continue; }
        }
        const r = db.addTrade(req.playerId, row);
        if (r?.id) imported++;
      } catch (e) {
        skipped++;
        if (!/UNIQUE|constraint/i.test(e.message || '')) {
          console.warn('[perpl] fill import skipped:', e.message);
        }
      }
    }
    res.json({ ok: true, imported, skipped, total: rows.length });
  } catch (e) {
    console.warn('[perpl] import-fills failed:', e.message);
    res.status(502).json({ error: 'Failed to import Perpl fills', detail: e.message });
  }
});

router.post('/phoenix/import-fills', auth, async (req, res) => {
  try {
    if (req.dex !== 'phoenix') {
      return res.status(409).json({
        error: `Account is registered for '${req.dex}'. Switch DEX to phoenix before importing Phoenix fills.`,
      });
    }
    const wallet = String(req.body?.wallet || req.playerWallet || '').trim();
    const playerWallet = String(req.playerWallet || '').trim();
    if (!phoenixRewards.isSolanaWallet(wallet)) {
      return res.status(400).json({ error: 'wallet required (Solana pubkey)' });
    }
    if (phoenixRewards.isSolanaWallet(playerWallet) && wallet !== playerWallet) {
      return res.status(409).json({ error: 'wallet does not match player account' });
    }

    const result = await phoenixRewards.importFillsForPlayer(req.playerId, wallet, { limit: 100 });
    if (result.imported > 0) {
      console.log(`[phoenix] imported ${result.imported} fill(s) for player=${req.playerName} wallet=${wallet.slice(0, 8)}...`);
    }
    res.json(result);
  } catch (e) {
    console.warn('[phoenix] import-fills failed:', e.message);
    res.status(502).json({ error: 'Failed to import Phoenix fills', detail: e.message });
  }
});

router.post('/gmx/import-fills', auth, async (req, res) => {
  try {
    if (req.dex !== 'gmx') {
      return res.status(409).json({
        error: `Account is registered for '${req.dex}'. Switch DEX to gmx before importing GMX fills.`,
      });
    }
    const wallet = normalizeEvmAddress(req.body?.wallet || req.playerWallet);
    const playerWallet = normalizeEvmAddress(req.playerWallet);
    if (!wallet) return res.status(400).json({ error: 'wallet required (0x...)' });
    if (playerWallet && wallet !== playerWallet) {
      return res.status(409).json({ error: 'wallet does not match player account' });
    }

    const result = await gmxRewards.importTradesForPlayer(req.playerId, wallet, {
      lookbackSeconds: req.body?.lookback_seconds,
      attempts: req.body?.attempts,
      delayMs: req.body?.delay_ms,
    });
    if (result.imported > 0) {
      console.log(`[gmx] imported ${result.imported} fill(s) for player=${req.playerName} wallet=${wallet.slice(0, 10)}...`);
    }
    res.json(result);
  } catch (e) {
    console.warn('[gmx] import-fills failed:', e.message);
    res.status(502).json({ error: 'Failed to import GMX fills', detail: e.message });
  }
});

router.post('/trade-report', auth, async (req, res) => {
  try {
    if (!TRADE_REPORT_DEXES.has(req.dex)) {
      return res.status(400).json({ error: 'trade-report is for self-custody DEXes only' });
    }
    const { tx_hash, symbol, side, amount, leverage, notional_usd } = req.body || {};
    if (!tx_hash || !symbol || !side || !Number.isFinite(Number(amount))) {
      return res.status(400).json({ error: 'tx_hash, symbol, side, amount required' });
    }
    // Always recompute notional from amount×leverage. Ignore the
    // client-supplied `notional_usd` as a gold-inflation vector — previously
    // a crafted payload could claim $10M notional on a $10 trade.
    const amountNum = Number(amount);
    const leverageNum = Number(leverage || 1);
    if (!Number.isFinite(amountNum) || !Number.isFinite(leverageNum) || amountNum <= 0) {
      return res.status(400).json({ error: 'amount / leverage out of range' });
    }
    const computedNotional = amountNum * leverageNum;
    // Reject if the client-supplied notional disagrees with amount×leverage
    // by >5% (rounding/slippage tolerance). Mismatch = tamper attempt.
    if (Number.isFinite(Number(notional_usd)) && Number(notional_usd) > 0) {
      const claimed = Number(notional_usd);
      const drift = Math.abs(claimed - computedNotional) / Math.max(computedNotional, 1);
      if (drift > 0.05) {
        console.warn(`[trade-report] notional drift for player ${req.playerId}: claimed $${claimed.toFixed(2)} vs computed $${computedNotional.toFixed(2)}`);
        return res.status(400).json({ error: 'notional mismatch' });
      }
    }
    const notional = computedNotional;
    if (!Number.isFinite(notional) || notional < 0 || notional > 10_000_000) {
      return res.status(400).json({ error: 'notional out of range' });
    }
    if (req.dex === 'avantis') {
      const address = String(req.body?.address || '').trim();
      const current = String(req.playerWallet || '').trim();
      const needsWallet = !/^0x[0-9a-fA-F]{40}$/.test(current) || /^fc_/i.test(current);
      if (/^0x[0-9a-fA-F]{40}$/.test(address) && needsWallet) {
        let writeDb = null;
        try {
          writeDb = new Database(MAIN_DB_PATH, { fileMustExist: true });
          writeDb.prepare('UPDATE players SET wallet = ? WHERE id = ?').run(address, req.playerId);
          writeDb.prepare('UPDATE trading_rewards SET wallet = ? WHERE player_id = ? AND dex = ?').run(address, req.playerId, 'avantis');
        } catch (e) {
          console.warn('[trade-report] failed to backfill Avantis wallet:', e.message);
        } finally {
          try { writeDb?.close(); } catch {}
        }
      }
    }
    // Do not write rewardable Avantis rows from the browser. A valid game token
    // proves account ownership, not that tx_hash/amount/leverage happened on
    // chain. For Avantis market opens we can cheaply verify against Core API
    // immediately; everything else still waits for the polling worker.
    const verified = req.dex === 'avantis'
      ? await recordVerifiedAvantisOpen(req, req.body || {})
      : false;
    res.json({
      ok: true,
      verified,
      credited: false,
      reason: verified
        ? 'Trade verified from Avantis Core API; rewards are ready to claim.'
        : 'Trade report accepted; rewards are credited after worker verification.',
    });
  } catch (e) {
    console.error('Trade report error:', e);
    res.status(500).json({ error: 'Failed to record trade' });
  }
});

// ==================== DEPOSITS ====================

// Get deposit history
router.get('/deposits', auth, (req, res) => {
  const deposits = db.getDeposits(req.playerId);
  res.json(deposits);
});

// Get USDC & native balance on custodial wallet
const balanceCache = new Map();
router.get('/balance', auth, async (req, res) => {
  if (req.dex === 'gmx' || req.dex === 'monad') {
    return res.status(410).json({ error: `${req.dex} balances are read directly by the client wallet.` });
  }
  const wallet = db.getWallet(req.playerId, req.dex);
  if (!wallet) return res.status(404).json({ error: 'No wallet' });

  const cacheKey = `${req.playerId}:${req.dex}`;

  // Return cache if fresh (10s)
  const cached = balanceCache.get(cacheKey);
  if (cached && Date.now() - cached.ts < 10000) {
    return res.json(cached.data);
  }

  let data;
  if (req.dex === 'avantis') {
    let usdc = 0, eth = 0;
    try { usdc = await avantis.getUsdcBalance(wallet.public_key); } catch {}
    try { eth = await avantis.getEthBalance(wallet.public_key); } catch {}
    data = { usdc, eth, public_key: wallet.public_key, chain: 'base', dex: 'avantis' };
  } else {
    let usdc = 0, sol = 0;
    try { usdc = await deposit.getUsdcBalance(wallet.public_key); } catch {}
    try { sol = await deposit.getSolBalance(wallet.public_key); } catch {}
    data = { usdc, sol, public_key: wallet.public_key, chain: 'solana', dex: 'pacifica' };
  }

  balanceCache.set(cacheKey, { data, ts: Date.now() });
  res.json(data);
});

// Deposit USDC from custodial wallet into Pacifica vault (Pacifica only)
router.post('/deposit/pacifica', auth, async (req, res) => {
  if (req.dex === 'avantis') {
    return res.status(400).json({ error: 'Avantis does not use a vault deposit. Fund your wallet with USDC on Base directly.' });
  }
  try {
    const wallet = db.getWallet(req.playerId, req.dex);
    if (!wallet) return res.status(404).json({ error: 'No wallet' });

    const { amount } = req.body;
    if (!amount || parseFloat(amount) < 10) {
      return res.status(400).json({ error: 'Minimum deposit is 10 USDC' });
    }

    // Check USDC balance first
    const usdcBalance = await deposit.getUsdcBalance(wallet.public_key);
    if (usdcBalance < parseFloat(amount)) {
      return res.status(400).json({
        error: `Insufficient USDC. Balance: ${usdcBalance}, requested: ${amount}`,
      });
    }

    // Check SOL for gas
    const solBalance = await deposit.getSolBalance(wallet.public_key);
    if (solBalance < 0.005) {
      return res.status(400).json({
        error: `Need SOL for gas. Balance: ${solBalance} SOL, need at least 0.005`,
      });
    }

    // Execute on-chain deposit
    const result = await deposit.depositToPacifica(wallet.secret_key, parseFloat(amount));

    // Record in DB
    db.addDeposit(req.playerId, result.signature, parseFloat(amount), 'USDC');

    // Auto-activate: claim referral + approve builder code
    try {
      await activateAccount(wallet.secret_key);
    } catch (e) {
      console.log('Auto-activate note:', e.message);
    }

    res.json({
      success: true,
      signature: result.signature,
      amount: result.amount,
    });
  } catch (e) {
    console.error('Pacifica deposit error:', e);
    res.status(500).json({ error: e.message || 'Deposit failed' });
  }
});

// ==================== ACTIVATION ====================

// Claim referral code + approve builder code after first deposit
async function activateAccount(secretKey) {
  // Step 1: Claim referral code (gives access/whitelist to platform)
  const claimBody = pacifica.buildSignedRequest('claim_referral_code', {
    code: 'Vip',
  }, secretKey);

  const claimRes = await fetch('https://api.pacifica.fi/api/v1/referral/user/code/claim', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(claimBody),
  });
  const claimData = await claimRes.json();
  console.log('Referral claim:', claimData.success ? 'OK' : claimData.error);

  // Step 2: Approve builder code (allows fee attribution)
  const approveBody = pacifica.buildSignedRequest('approve_builder_code', {
    builder_code: 'clashofperps',
    max_fee_rate: '0.001',
  }, secretKey);

  const approveRes = await fetch('https://api.pacifica.fi/api/v1/account/builder_codes/approve', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(approveBody),
  });
  const approveData = await approveRes.json();
  console.log('Builder approve:', approveData.success ? 'OK' : approveData.error);

  return { claim: claimData, approve: approveData };
}

// Manual activation endpoint (Pacifica only)
router.post('/activate', auth, async (req, res) => {
  if (req.dex === 'avantis') {
    return res.json({ success: true, message: 'No activation needed for Avantis.' });
  }
  try {
    const wallet = db.getWallet(req.playerId, req.dex);
    if (!wallet) return res.status(404).json({ error: 'No wallet' });

    const result = await activateAccount(wallet.secret_key);
    res.json(result);
  } catch (e) {
    console.error('Activation error:', e);
    res.status(500).json({ error: e.message || 'Activation failed' });
  }
});

module.exports = router;
