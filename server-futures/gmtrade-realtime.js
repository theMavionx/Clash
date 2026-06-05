const path = require('path');
const Database = require('better-sqlite3');
const { Connection, PublicKey } = require('@solana/web3.js');
const { WebSocket, WebSocketServer } = require('ws');
const gmtrade = require('./gmtrade');

const MAIN_DB_PATH = process.env.CLASH_MAIN_DB
  || path.join(__dirname, '..', 'server', 'clash.db');
const GMTRADE_RPC_URL =
  process.env.GMTRADE_SOLANA_RPC_URL
  || process.env.SOLANA_RPC_URL
  || process.env.HELIUS_RPC_URL
  || 'https://rpc-1.gmtrade.xyz/';
const GMTRADE_WSS_URL =
  process.env.GMTRADE_SOLANA_WSS_URL
  || process.env.SOLANA_WSS_URL
  || ((process.env.GMTRADE_SOLANA_RPC_URL || process.env.SOLANA_RPC_URL || process.env.HELIUS_RPC_URL)
    ? GMTRADE_RPC_URL.replace(/^http/i, 'ws')
    : 'wss://api.mainnet-beta.solana.com');
const GMTRADE_ENABLE_CHAIN_WS = String(
  process.env.GMTRADE_ENABLE_CHAIN_WS
  || (process.env.GMTRADE_SOLANA_WSS_URL || process.env.SOLANA_WSS_URL ? '1' : '0')
).trim() === '1';
const SNAPSHOT_INTERVAL_MS = Math.max(1000, Math.min(15_000, Number(process.env.GMTRADE_REALTIME_SNAPSHOT_MS || 2500)));
const MARKET_INTERVAL_MS = Math.max(10_000, Math.min(120_000, Number(process.env.GMTRADE_REALTIME_MARKETS_MS || 30_000)));
const AUTH_TIMEOUT_MS = 8000;

let mainDb = null;
let playerByTokenStmt = null;

function ensureMainDb() {
  if (mainDb) return;
  mainDb = new Database(MAIN_DB_PATH, { readonly: true, fileMustExist: true });
  try { mainDb.pragma('journal_mode = WAL'); } catch {}
  playerByTokenStmt = mainDb.prepare('SELECT id, name, wallet, dex FROM players WHERE token = ?');
}

function authenticate(token) {
  if (!token) throw Object.assign(new Error('Missing auth token'), { status: 401 });
  ensureMainDb();
  const player = playerByTokenStmt.get(token);
  if (!player) throw Object.assign(new Error('Invalid auth token'), { status: 401 });
  if (String(player.dex || '').toLowerCase() !== 'gmtrade') {
    throw Object.assign(new Error(`Account is registered for '${player.dex || 'pacifica'}', not gmtrade`), { status: 409 });
  }
  return player;
}

function sendJson(ws, payload) {
  if (ws.readyState !== WebSocket.OPEN) return;
  ws.send(JSON.stringify(payload));
}

function normalizeWallet(wallet, playerWallet) {
  const value = String(wallet || playerWallet || '').trim();
  if (!gmtrade.isSolanaAddress(value)) {
    throw Object.assign(new Error('Valid GMTrade Solana wallet required'), { status: 400 });
  }
  if (playerWallet && value !== String(playerWallet).trim()) {
    throw Object.assign(new Error('Connected wallet does not match registered GMTrade wallet'), { status: 409 });
  }
  return value;
}

function setupGmtradeRealtime(server) {
  const wss = new WebSocketServer({ noServer: true });
  const solana = new Connection(GMTRADE_RPC_URL, {
    commitment: 'confirmed',
    wsEndpoint: GMTRADE_WSS_URL,
  });

  server.on('upgrade', (req, socket, head) => {
    let pathname = '';
    try {
      pathname = new URL(req.url || '/', 'http://127.0.0.1').pathname;
    } catch {
      pathname = '';
    }
    if (pathname !== '/api/gmtrade/realtime' && pathname !== '/api/futures/gmtrade/realtime') return;
    wss.handleUpgrade(req, socket, head, (ws) => {
      wss.emit('connection', ws, req);
    });
  });

  wss.on('connection', (ws) => {
    let authed = false;
    let player = null;
    let wallet = '';
    let snapshotTimer = null;
    let marketTimer = null;
    let refreshTimer = null;
    let lastMarketsAt = 0;
    let positionSubscriptions = new Map();
    let orderSubscriptions = new Map();

    const clearRefreshTimer = () => {
      if (refreshTimer) clearTimeout(refreshTimer);
      refreshTimer = null;
    };

    const cleanup = async () => {
      clearRefreshTimer();
      if (snapshotTimer) clearInterval(snapshotTimer);
      if (marketTimer) clearInterval(marketTimer);
      snapshotTimer = null;
      marketTimer = null;
      const subs = [...positionSubscriptions.values()];
      positionSubscriptions = new Map();
      const orderSubs = [...orderSubscriptions.values()];
      orderSubscriptions = new Map();
      await Promise.allSettled([...subs, ...orderSubs].map(id => solana.removeAccountChangeListener(id)));
    };

    const scheduleSnapshot = (reason, delay = 150) => {
      if (!authed || refreshTimer) return;
      refreshTimer = setTimeout(() => {
        refreshTimer = null;
        pushSnapshot(reason).catch((e) => {
          sendJson(ws, { type: 'error', source: 'snapshot', message: e.message || String(e), at: Date.now() });
        });
      }, delay);
    };

    const syncPositionSubscriptions = async (positions) => {
      if (!GMTRADE_ENABLE_CHAIN_WS) return;
      const nextIds = new Set((Array.isArray(positions) ? positions : [])
        .map(p => p?.position_id || p?.id)
        .filter(Boolean));
      for (const [id, subId] of [...positionSubscriptions.entries()]) {
        if (nextIds.has(id)) continue;
        positionSubscriptions.delete(id);
        solana.removeAccountChangeListener(subId).catch(() => {});
      }
      for (const id of nextIds) {
        if (positionSubscriptions.has(id)) continue;
        try {
          const subId = solana.onAccountChange(new PublicKey(id), () => {
            scheduleSnapshot('position_account_change', 100);
          }, 'confirmed');
          positionSubscriptions.set(id, subId);
        } catch (e) {
          sendJson(ws, { type: 'warning', source: 'position_subscribe', position_id: id, message: e.message || String(e), at: Date.now() });
        }
      }
    };

    const syncOrderSubscriptions = async (orders) => {
      if (!GMTRADE_ENABLE_CHAIN_WS) return;
      const nextIds = new Set((Array.isArray(orders) ? orders : [])
        .map(o => o?.order_id || o?.id)
        .filter(Boolean));
      for (const [id, subId] of [...orderSubscriptions.entries()]) {
        if (nextIds.has(id)) continue;
        orderSubscriptions.delete(id);
        solana.removeAccountChangeListener(subId).catch(() => {});
      }
      for (const id of nextIds) {
        if (orderSubscriptions.has(id)) continue;
        try {
          const subId = solana.onAccountChange(new PublicKey(id), () => {
            scheduleSnapshot('order_account_change', 100);
          }, 'confirmed');
          orderSubscriptions.set(id, subId);
        } catch (e) {
          sendJson(ws, { type: 'warning', source: 'order_subscribe', order_id: id, message: e.message || String(e), at: Date.now() });
        }
      }
    };

    const pushSnapshot = async (reason = 'interval') => {
      if (!authed || ws.readyState !== WebSocket.OPEN) return;
      const now = Date.now();
      const [account, prices, markets] = await Promise.all([
        gmtrade.getAccountByAddress(wallet),
        gmtrade.getPrices().catch(() => ({})),
        (now - lastMarketsAt > MARKET_INTERVAL_MS
          ? gmtrade.getMarketInfo().catch(() => null)
          : Promise.resolve(null)),
      ]);
      if (markets) lastMarketsAt = now;
      await syncPositionSubscriptions(account.positions || []);
      await syncOrderSubscriptions(account.orders || []);
      sendJson(ws, {
        type: 'gmtrade_snapshot',
        reason,
        at: now,
        wallet,
        account,
        positions: account.positions || [],
        orders: account.orders || [],
        prices,
        ...(markets ? { markets } : {}),
        realtime: {
          rpc_url: GMTRADE_RPC_URL,
          ws_endpoint: GMTRADE_WSS_URL,
          chain_ws_enabled: GMTRADE_ENABLE_CHAIN_WS,
          position_subscriptions: positionSubscriptions.size,
          order_subscriptions: orderSubscriptions.size,
          snapshot_interval_ms: SNAPSHOT_INTERVAL_MS,
        },
      });
    };

    const authTimer = setTimeout(() => {
      if (!authed) {
        sendJson(ws, { type: 'error', message: 'GMTrade realtime auth timeout', at: Date.now() });
        try { ws.close(4401, 'auth timeout'); } catch {}
      }
    }, AUTH_TIMEOUT_MS);

    ws.on('message', async (raw) => {
      let msg = null;
      try { msg = JSON.parse(String(raw || '')); } catch { return; }
      if (msg?.type === 'ping') {
        sendJson(ws, { type: 'pong', at: Date.now(), client_at: msg.at || null });
        return;
      }
      if (msg?.type === 'refresh') {
        if (!authed) {
          sendJson(ws, { type: 'error', status: 401, message: 'GMTrade realtime is not authenticated yet', at: Date.now() });
          return;
        }
        pushSnapshot(String(msg.reason || 'client_refresh')).catch((e) => {
          sendJson(ws, { type: 'error', source: 'client_refresh', message: e.message || String(e), at: Date.now() });
        });
        return;
      }
      if (msg?.type !== 'subscribe') return;
      try {
        player = authenticate(String(msg.token || ''));
        wallet = normalizeWallet(msg.wallet, player.wallet);
        authed = true;
        clearTimeout(authTimer);
        sendJson(ws, { type: 'gmtrade_subscribed', wallet, player_id: player.id, at: Date.now() });
        await pushSnapshot('subscribed');
        snapshotTimer = setInterval(() => {
          pushSnapshot('interval').catch((e) => {
            sendJson(ws, { type: 'error', source: 'interval', message: e.message || String(e), at: Date.now() });
          });
        }, SNAPSHOT_INTERVAL_MS);
        marketTimer = setInterval(() => scheduleSnapshot('market_interval', 50), MARKET_INTERVAL_MS);
      } catch (e) {
        sendJson(ws, { type: 'error', status: e.status || 500, message: e.message || String(e), at: Date.now() });
        try { ws.close(e.status === 409 ? 4409 : 4401, 'gmtrade auth failed'); } catch {}
      }
    });

    ws.on('close', () => cleanup().catch(() => {}));
    ws.on('error', () => cleanup().catch(() => {}));
  });

  return wss;
}

module.exports = { setupGmtradeRealtime };
