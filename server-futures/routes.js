const express = require('express');
const { v4: uuidv4 } = require('uuid');
const db = require('./db');
const pacifica = require('./pacifica');
const deposit = require('./deposit');

const router = express.Router();

// ---------- Auth Middleware ----------
// Reuses x-token from game server — player_id passed via header
// In production, validate token against game server

function auth(req, res, next) {
  const playerId = req.headers['x-player-id'];
  const playerName = req.headers['x-player-name'] || 'unknown';
  if (!playerId) return res.status(401).json({ error: 'Missing x-player-id header' });
  req.playerId = playerId;
  req.playerName = playerName;
  next();
}

// ==================== WALLET ====================

// Get or create custodial wallet for player
router.post('/wallet', auth, (req, res) => {
  try {
    const { wallet, created } = db.getOrCreateWallet(
      req.playerId,
      req.playerName,
      pacifica.generateWallet
    );
    res.json({
      public_key: wallet.public_key,
      created,
    });
  } catch (e) {
    console.error('Wallet creation error:', e);
    res.status(500).json({ error: 'Failed to create wallet' });
  }
});

// Get wallet info (public key only — never expose secret)
router.get('/wallet', auth, (req, res) => {
  const wallet = db.getWallet(req.playerId);
  if (!wallet) return res.status(404).json({ error: 'No wallet found. Call POST /wallet first.' });
  res.json({ public_key: wallet.public_key });
});

// ==================== ACCOUNT INFO ====================

// Get Pacifica account info (balance, equity, etc.)
router.get('/account', auth, async (req, res) => {
  try {
    const wallet = db.getWallet(req.playerId);
    if (!wallet) return res.status(404).json({ error: 'No wallet' });

    const info = await pacifica.getAccountInfo(wallet.secret_key);
    res.json(info);
  } catch (e) {
    console.error('Account info error:', e);
    res.status(500).json({ error: 'Failed to get account info' });
  }
});

// ==================== MARKET DATA ====================

router.get('/markets', async (req, res) => {
  try {
    const info = await pacifica.getMarketInfo();
    res.json(info);
  } catch (e) {
    res.status(500).json({ error: 'Failed to get market info' });
  }
});

router.get('/prices', async (req, res) => {
  try {
    const prices = await pacifica.getPrices();
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

router.get('/positions', auth, async (req, res) => {
  try {
    const wallet = db.getWallet(req.playerId);
    if (!wallet) return res.status(404).json({ error: 'No wallet' });

    const positions = await pacifica.getPositions(wallet.secret_key);
    res.json(positions);
  } catch (e) {
    console.error('Positions error:', e);
    res.status(500).json({ error: 'Failed to get positions' });
  }
});

// ==================== ORDERS ====================

router.get('/orders', auth, async (req, res) => {
  try {
    const wallet = db.getWallet(req.playerId);
    if (!wallet) return res.status(404).json({ error: 'No wallet' });

    const orders = await pacifica.getOpenOrders(wallet.secret_key);
    res.json(orders);
  } catch (e) {
    console.error('Orders error:', e);
    res.status(500).json({ error: 'Failed to get orders' });
  }
});

// Create market order (LONG/SHORT)
router.post('/orders/market', auth, async (req, res) => {
  try {
    const wallet = db.getWallet(req.playerId);
    if (!wallet) return res.status(404).json({ error: 'No wallet' });

    const { symbol, side, amount, slippage_percent, reduce_only } = req.body;
    if (!symbol || !side || !amount) {
      return res.status(400).json({ error: 'symbol, side, amount required' });
    }

    const clientOrderId = uuidv4();
    const result = await pacifica.createMarketOrder(wallet.secret_key, {
      symbol,
      side,
      amount,
      slippagePercent: slippage_percent || '0.5',
      reduceOnly: reduce_only || false,
      clientOrderId,
    });

    // Log trade
    db.addTrade(req.playerId, {
      symbol,
      side,
      orderType: 'market',
      amount: String(amount),
      orderId: result.order_id,
      clientOrderId,
      status: result.error ? 'failed' : 'filled',
    });

    res.json(result);
  } catch (e) {
    console.error('Market order error:', e);
    res.status(500).json({ error: 'Failed to create market order' });
  }
});

// Create limit order
router.post('/orders/limit', auth, async (req, res) => {
  try {
    const wallet = db.getWallet(req.playerId);
    if (!wallet) return res.status(404).json({ error: 'No wallet' });

    const { symbol, side, price, amount, tif, reduce_only } = req.body;
    if (!symbol || !side || !price || !amount) {
      return res.status(400).json({ error: 'symbol, side, price, amount required' });
    }

    const clientOrderId = uuidv4();
    const result = await pacifica.createLimitOrder(wallet.secret_key, {
      symbol,
      side,
      price,
      amount,
      tif: tif || 'GTC',
      reduceOnly: reduce_only || false,
      clientOrderId,
    });

    db.addTrade(req.playerId, {
      symbol,
      side,
      orderType: 'limit',
      amount: String(amount),
      price: String(price),
      orderId: result.order_id,
      clientOrderId,
      status: result.error ? 'failed' : 'open',
    });

    res.json(result);
  } catch (e) {
    console.error('Limit order error:', e);
    res.status(500).json({ error: 'Failed to create limit order' });
  }
});

// Cancel order
router.post('/orders/cancel', auth, async (req, res) => {
  try {
    const wallet = db.getWallet(req.playerId);
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
    res.status(500).json({ error: 'Failed to cancel order' });
  }
});

// Cancel all orders
router.post('/orders/cancel-all', auth, async (req, res) => {
  try {
    const wallet = db.getWallet(req.playerId);
    if (!wallet) return res.status(404).json({ error: 'No wallet' });

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

// ==================== LEVERAGE ====================

router.post('/leverage', auth, async (req, res) => {
  try {
    const wallet = db.getWallet(req.playerId);
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

router.post('/tpsl', auth, async (req, res) => {
  try {
    const wallet = db.getWallet(req.playerId);
    if (!wallet) return res.status(404).json({ error: 'No wallet' });

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

router.post('/withdraw', auth, async (req, res) => {
  try {
    const wallet = db.getWallet(req.playerId);
    if (!wallet) return res.status(404).json({ error: 'No wallet' });

    const { amount } = req.body;
    if (!amount || parseFloat(amount) <= 0) {
      return res.status(400).json({ error: 'amount required' });
    }

    const result = await pacifica.withdraw(wallet.secret_key, { amount: parseFloat(amount) });
    res.json(result);
  } catch (e) {
    console.error('Withdraw error:', e);
    res.status(500).json({ error: e.message || 'Withdrawal failed' });
  }
});

// ==================== TRADE HISTORY ====================

router.get('/history', auth, (req, res) => {
  const trades = db.getTrades(req.playerId);
  res.json(trades);
});

// ==================== DEPOSITS ====================

// Get deposit history
router.get('/deposits', auth, (req, res) => {
  const deposits = db.getDeposits(req.playerId);
  res.json(deposits);
});

// Get USDC & SOL balance on custodial wallet
const balanceCache = new Map();
router.get('/balance', auth, async (req, res) => {
  const wallet = db.getWallet(req.playerId);
  if (!wallet) return res.status(404).json({ error: 'No wallet' });

  // Return cache if fresh (10s)
  const cached = balanceCache.get(req.playerId);
  if (cached && Date.now() - cached.ts < 10000) {
    return res.json(cached.data);
  }

  let usdc = 0, sol = 0;
  try { usdc = await deposit.getUsdcBalance(wallet.public_key); } catch {}
  try { sol = await deposit.getSolBalance(wallet.public_key); } catch {}

  const data = { usdc, sol, public_key: wallet.public_key };
  balanceCache.set(req.playerId, { data, ts: Date.now() });
  res.json(data);
});

// Deposit USDC from custodial wallet into Pacifica vault
router.post('/deposit/pacifica', auth, async (req, res) => {
  try {
    const wallet = db.getWallet(req.playerId);
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

// Manual activation endpoint (in case auto didn't work)
router.post('/activate', auth, async (req, res) => {
  try {
    const wallet = db.getWallet(req.playerId);
    if (!wallet) return res.status(404).json({ error: 'No wallet' });

    const result = await activateAccount(wallet.secret_key);
    res.json(result);
  } catch (e) {
    console.error('Activation error:', e);
    res.status(500).json({ error: e.message || 'Activation failed' });
  }
});

module.exports = router;
