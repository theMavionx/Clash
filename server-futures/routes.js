const express = require('express');
const { v4: uuidv4 } = require('uuid');
const db = require('./db');
const pacifica = require('./pacifica');
const avantis = require('./avantis');
const deposit = require('./deposit');
const decibel = require('./decibel');

const router = express.Router();

const DECIBEL_MIN_REWARD_NOTIONAL_USD = 1;
const DECIBEL_MAX_REWARD_NOTIONAL_USD = 10_000_000;

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
    mainDb.pragma('journal_mode = WAL');
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
  const SUPPORTED_DEXES = new Set(['avantis', 'pacifica', 'decibel']);
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
    const clientOrderId = decibel.normalizeClientOrderId(req.body?.clientOrderId)
      || decibel.newClientOrderId();
    const orderPayload = {
      ...req.body,
      clientOrderId,
      subaccountAddr: verified.subaccount,
    };
    const result = await decibel.placeOrder(orderPayload);
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
    const result = await decibel.placeTpSlOrderForPosition({
      ...req.body,
      subaccountAddr: verified.subaccount,
    });
    res.json(result);
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
    const info = dex === 'avantis'
      ? await avantis.getMarketInfo()
      : await pacifica.getMarketInfo();
    res.json(info);
  } catch (e) {
    res.status(500).json({ error: 'Failed to get market info' });
  }
});

router.get('/prices', async (req, res) => {
  const dex = (req.query.dex || 'pacifica').toLowerCase();
  try {
    const prices = dex === 'avantis'
      ? await avantis.getPrices()
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

// ==================== TRADE REPORT (non-custodial: Avantis, Decibel) ====================
// Client reports are accepted for backwards-compatible UI flow, but they are
// not rewardable. The per-DEX rewards worker polls the upstream venue and
// records `verified_source='worker'` rows that /claim-gold reads.
const TRADE_REPORT_DEXES = new Set(['avantis', 'decibel']);
router.post('/trade-report', auth, (req, res) => {
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
    // Do not write rewardable Avantis rows from the browser. A valid game token
    // proves account ownership, not that tx_hash/amount/leverage happened on
    // chain. The rewards worker records verified rows from Avantis Core API
    // with verified_source='worker', and /claim-gold only credits those rows.
    res.json({ ok: true, verified: false, credited: false, reason: 'Trade report accepted; rewards are credited after worker verification.' });
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
