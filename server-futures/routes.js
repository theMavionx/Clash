const express = require('express');
const { v4: uuidv4 } = require('uuid');
const db = require('./db');
const pacifica = require('./pacifica');
const avantis = require('./avantis');
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
  // Resolve DEX from query param or header (default: pacifica)
  const dex = (req.query.dex || req.headers['x-dex'] || 'pacifica').toLowerCase();
  req.dex = dex === 'avantis' ? 'avantis' : 'pacifica';
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
router.get('/account', auth, async (req, res) => {
  try {
    const wallet = db.getWallet(req.playerId, req.dex);
    if (!wallet) return res.status(404).json({ error: 'No wallet' });

    const info = req.dex === 'avantis'
      ? await avantis.getAccountInfo(wallet.secret_key)
      : await pacifica.getAccountInfo(wallet.secret_key);
    res.json(info);
  } catch (e) {
    console.error('Account info error:', e);
    res.status(500).json({ error: 'Failed to get account info' });
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

router.get('/positions', auth, async (req, res) => {
  try {
    const wallet = db.getWallet(req.playerId, req.dex);
    if (!wallet) return res.status(404).json({ error: 'No wallet' });

    const positions = req.dex === 'avantis'
      ? await avantis.getPositions(wallet.secret_key)
      : await pacifica.getPositions(wallet.secret_key);
    res.json(positions);
  } catch (e) {
    console.error('Positions error:', e);
    res.status(500).json({ error: 'Failed to get positions' });
  }
});

// ==================== ORDERS ====================

router.get('/orders', auth, async (req, res) => {
  try {
    const wallet = db.getWallet(req.playerId, req.dex);
    if (!wallet) return res.status(404).json({ error: 'No wallet' });

    const orders = req.dex === 'avantis'
      ? await avantis.getOpenOrders(wallet.secret_key)
      : await pacifica.getOpenOrders(wallet.secret_key);
    res.json(orders);
  } catch (e) {
    console.error('Orders error:', e);
    res.status(500).json({ error: 'Failed to get orders' });
  }
});

// Create market order (LONG/SHORT)
router.post('/orders/market', auth, async (req, res) => {
  try {
    const wallet = db.getWallet(req.playerId, req.dex);
    if (!wallet) return res.status(404).json({ error: 'No wallet' });

    const { symbol, side, amount, leverage, slippage_percent, reduce_only, tp, sl } = req.body;
    if (!symbol || !side || !amount) {
      return res.status(400).json({ error: 'symbol, side, amount required' });
    }

    const clientOrderId = uuidv4();
    let result;

    if (req.dex === 'avantis') {
      if (!leverage) return res.status(400).json({ error: 'leverage required for Avantis' });
      result = await avantis.createMarketOrder(wallet.secret_key, {
        symbol,
        side,
        amount,
        leverage: parseFloat(leverage),
        slippage_percent: slippage_percent || 1,
        tp: tp || 0,
        sl: sl || 0,
      });
    } else {
      result = await pacifica.createMarketOrder(wallet.secret_key, {
        symbol,
        side,
        amount,
        slippagePercent: slippage_percent || '0.5',
        reduceOnly: reduce_only || false,
        clientOrderId,
      });
    }

    // Log trade
    db.addTrade(req.playerId, {
      symbol,
      side,
      orderType: 'market',
      amount: String(amount),
      orderId: result.order_id || result.tx_hash,
      clientOrderId,
      status: result.error ? 'failed' : (req.dex === 'avantis' ? result.status : 'filled'),
    });

    res.json(result);
  } catch (e) {
    console.error('Market order error:', e);
    res.status(500).json({ error: e.message || 'Failed to create market order' });
  }
});

// Create limit order
router.post('/orders/limit', auth, async (req, res) => {
  try {
    const wallet = db.getWallet(req.playerId, req.dex);
    if (!wallet) return res.status(404).json({ error: 'No wallet' });

    const { symbol, side, price, amount, leverage, tif, reduce_only, tp, sl } = req.body;
    if (!symbol || !side || !price || !amount) {
      return res.status(400).json({ error: 'symbol, side, price, amount required' });
    }

    const clientOrderId = uuidv4();
    let result;

    if (req.dex === 'avantis') {
      if (!leverage) return res.status(400).json({ error: 'leverage required for Avantis' });
      result = await avantis.createLimitOrder(wallet.secret_key, {
        symbol,
        side,
        price: parseFloat(price),
        amount,
        leverage: parseFloat(leverage),
        tp: tp || 0,
        sl: sl || 0,
      });
    } else {
      result = await pacifica.createLimitOrder(wallet.secret_key, {
        symbol,
        side,
        price,
        amount,
        tif: tif || 'GTC',
        reduceOnly: reduce_only || false,
        clientOrderId,
      });
    }

    db.addTrade(req.playerId, {
      symbol,
      side,
      orderType: 'limit',
      amount: String(amount),
      price: String(price),
      orderId: result.order_id || result.tx_hash,
      clientOrderId,
      status: result.error ? 'failed' : 'open',
    });

    res.json(result);
  } catch (e) {
    console.error('Limit order error:', e);
    res.status(500).json({ error: e.message || 'Failed to create limit order' });
  }
});

// Cancel order
router.post('/orders/cancel', auth, async (req, res) => {
  try {
    const wallet = db.getWallet(req.playerId, req.dex);
    if (!wallet) return res.status(404).json({ error: 'No wallet' });

    let result;
    if (req.dex === 'avantis') {
      // Avantis uses pair_index + trade_index
      const { pair_index, trade_index } = req.body;
      if (pair_index === undefined || trade_index === undefined) {
        return res.status(400).json({ error: 'pair_index and trade_index required for Avantis' });
      }
      result = await avantis.cancelLimitOrder(wallet.secret_key, {
        pair_index: parseInt(pair_index),
        trade_index: parseInt(trade_index),
      });
    } else {
      const { symbol, order_id, client_order_id } = req.body;
      if (!symbol) return res.status(400).json({ error: 'symbol required' });
      if (!order_id && !client_order_id) return res.status(400).json({ error: 'order_id or client_order_id required' });
      result = await pacifica.cancelOrder(wallet.secret_key, {
        symbol,
        orderId: order_id,
        clientOrderId: client_order_id,
      });
    }

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

// Close an open position on Avantis
router.post('/positions/close', auth, async (req, res) => {
  try {
    if (req.dex !== 'avantis') {
      return res.status(400).json({ error: 'Use /orders/market with reduce_only=true for Pacifica' });
    }

    const wallet = db.getWallet(req.playerId, req.dex);
    if (!wallet) return res.status(404).json({ error: 'No wallet' });

    const { pair_index, trade_index, amount } = req.body;
    if (pair_index === undefined || trade_index === undefined || !amount) {
      return res.status(400).json({ error: 'pair_index, trade_index, amount required' });
    }

    const result = await avantis.closePosition(wallet.secret_key, {
      pair_index: parseInt(pair_index),
      trade_index: parseInt(trade_index),
      amount: parseFloat(amount),
    });

    res.json(result);
  } catch (e) {
    console.error('Close position error:', e);
    res.status(500).json({ error: e.message || 'Failed to close position' });
  }
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

router.post('/tpsl', auth, async (req, res) => {
  try {
    const wallet = db.getWallet(req.playerId, req.dex);
    if (!wallet) return res.status(404).json({ error: 'No wallet' });

    if (req.dex === 'avantis') {
      const { pair_index, trade_index, take_profit, stop_loss } = req.body;
      if (pair_index === undefined || trade_index === undefined) {
        return res.status(400).json({ error: 'pair_index, trade_index required for Avantis' });
      }
      const result = await avantis.updateTpSl(wallet.secret_key, {
        pair_index: parseInt(pair_index),
        trade_index: parseInt(trade_index),
        take_profit: take_profit ? parseFloat(take_profit) : 0,
        stop_loss: stop_loss ? parseFloat(stop_loss) : 0,
      });
      return res.json(result);
    }

    // Pacifica
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
  if (req.dex === 'avantis') {
    return res.status(400).json({ error: 'Avantis does not use a vault. Close positions to withdraw USDC to your wallet.' });
  }
  try {
    const wallet = db.getWallet(req.playerId, req.dex);
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
  const dexFilter = req.dex;
  // Filter by dex if we can (trades don't have a dex column yet, show all)
  res.json(trades);
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
