const Database = require('better-sqlite3');
const path = require('path');
const db = require('./db');
const dango = require('./dango');

const MAIN_DB_PATH = process.env.CLASH_MAIN_DB
  || path.join(__dirname, '..', 'server', 'clash.db');
const REFRESH_MS = Math.max(15_000, Number(process.env.DANGO_WORKER_REFRESH_MS || 60_000));
const RECONNECT_MIN_MS = Math.max(1000, Number(process.env.DANGO_WS_RECONNECT_MIN_MS || 2000));
const RECONNECT_MAX_MS = Math.max(RECONNECT_MIN_MS, Number(process.env.DANGO_WS_RECONNECT_MAX_MS || 30_000));
const USERS_PER_SUBSCRIPTION = Math.max(1, Math.min(1000, Number(process.env.DANGO_WS_USERS_PER_SUBSCRIPTION || 200)));
const BACKFILL_ON_START = process.env.DANGO_BACKFILL_ON_START !== '0';
const STATE_LAST_BLOCK = 'perps_events_last_block';

let mainDb = null;
let running = false;
let subscriptions = [];
let refreshTimer = null;
let reconnectTimer = null;
let reconnectAttempt = 0;
let lastHeight = 0;
let playerByUser = new Map();
let lastUsersKey = '';

function shortAddr(addr) {
  const s = String(addr || '');
  return s.length > 16 ? `${s.slice(0, 10)}...${s.slice(-6)}` : s;
}

function loadLastHeight() {
  const raw = db.getDexWorkerState('dango', STATE_LAST_BLOCK, '0');
  const n = Number(raw);
  return Number.isFinite(n) && n > 0 ? Math.floor(n) : 0;
}

function saveLastHeight(height) {
  const n = Math.floor(Number(height || 0));
  if (!Number.isFinite(n) || n <= 0 || n <= lastHeight) return;
  lastHeight = n;
  try {
    db.setDexWorkerState('dango', STATE_LAST_BLOCK, String(n));
  } catch (e) {
    console.warn('[dango-realtime-worker] failed to save worker height:', e.message);
  }
}

function loadLinkedPlayers(sourceDb = mainDb) {
  if (!sourceDb) return [];
  const rows = sourceDb.prepare(`
    SELECT DISTINCT
      p.id AS player_id,
      p.name AS player_name,
      p.dex AS player_dex,
      COALESCE(NULLIF(pda.wallet_address, ''), CASE WHEN p.dex = 'dango' THEN p.wallet ELSE NULL END) AS wallet
    FROM players p
    LEFT JOIN player_dex_accounts pda
      ON pda.player_id = p.id AND pda.dex = 'dango'
    WHERE (p.dex = 'dango' OR pda.dex = 'dango')
      AND COALESCE(NULLIF(pda.wallet_address, ''), CASE WHEN p.dex = 'dango' THEN p.wallet ELSE NULL END) IS NOT NULL
      AND COALESCE(NULLIF(pda.wallet_address, ''), CASE WHEN p.dex = 'dango' THEN p.wallet ELSE NULL END) != ''
    ORDER BY p.id
  `).all();
  const out = [];
  const seen = new Set();
  for (const row of rows) {
    const user = dango.normalizeDangoAddress(row.wallet);
    if (!user || seen.has(user)) continue;
    seen.add(user);
    out.push({
      playerId: String(row.player_id),
      playerName: row.player_name || '',
      user,
    });
  }
  return out;
}

function closeSubscriptions() {
  for (const sub of subscriptions) {
    try { sub.close(); } catch {}
  }
  subscriptions = [];
}

function updatePlayerMap(players) {
  playerByUser = new Map(players.map(row => [row.user, row]));
  lastUsersKey = players.map(row => row.user).sort().join(',');
}

async function resolveLinkedPlayers(players) {
  const out = [];
  const seen = new Set();
  for (const row of players) {
    const user = await dango.resolveAccountAddress(row.user).catch(() => row.user);
    if (!user || seen.has(user)) continue;
    seen.add(user);
    out.push({
      ...row,
      linkedWallet: row.user,
      user,
    });
  }
  return out;
}

async function backfillRecent(players, reason = 'startup', opts = {}) {
  if (!players.length) return { imported: 0, skipped: 0 };
  const sinceHeight = opts.sinceHeight != null
    ? Math.max(0, Math.floor(Number(opts.sinceHeight || 0)))
    : lastHeight;
  let imported = 0;
  let skipped = 0;
  for (const row of players) {
    try {
      const result = await dango.importRecentFillsForPlayer(row.playerId, row.user, db.addTrade, {
        sinceHeight,
      });
      imported += result.imported || 0;
      skipped += result.skipped || 0;
    } catch (e) {
      console.warn(`[dango-realtime-worker] backfill failed for ${shortAddr(row.user)}:`, e.message);
    }
  }
  if (imported > 0) {
    console.log(`[dango-realtime-worker] backfill(${reason}) recorded ${imported} Dango fill row(s)`);
  }
  return { imported, skipped };
}

function processBatch(batch = {}) {
  const events = Array.isArray(batch.events) ? batch.events : [];
  let inserted = 0;
  let skipped = 0;
  let maxHeight = Number(batch.blockHeight || 0);
  for (const event of events) {
    const trade = dango.tradeFromPerpsEvent(batch, event);
    if (!trade) {
      skipped++;
      continue;
    }
    const user = trade._event?.user || '';
    const player = playerByUser.get(user);
    if (!player) {
      skipped++;
      continue;
    }
    try {
      const result = db.addTrade(player.playerId, trade);
      if (result?.id) inserted++;
      else skipped++;
    } catch (e) {
      skipped++;
      if (!/UNIQUE|constraint/i.test(e?.message || '')) {
        console.warn('[dango-realtime-worker] addTrade failed:', e.message);
      }
    }
    const height = Number(trade._event?.blockHeight || 0);
    if (Number.isFinite(height) && height > maxHeight) maxHeight = height;
  }
  if (maxHeight > 0) saveLastHeight(maxHeight);
  if (inserted > 0) {
    console.log(`[dango-realtime-worker] recorded ${inserted} Dango fill row(s) at block ${maxHeight || '?'}`);
  }
  return { inserted, skipped, maxHeight };
}

function scheduleReconnect(reason, immediate = false) {
  if (!running) return;
  if (reconnectTimer) return;
  const delay = immediate ? 0 : Math.min(RECONNECT_MAX_MS, RECONNECT_MIN_MS * Math.max(1, 2 ** reconnectAttempt));
  reconnectAttempt += 1;
  reconnectTimer = setTimeout(async () => {
    reconnectTimer = null;
    try {
      const players = loadLinkedPlayers();
      await connect(players, reason || 'reconnect');
    } catch (e) {
      console.error('[dango-realtime-worker] reconnect failed:', e.message);
      scheduleReconnect('reconnect_failed');
    }
  }, delay);
  reconnectTimer.unref?.();
}

function connectSockets(players) {
  closeSubscriptions();
  if (!players.length) return;
  const since = lastHeight > 0 ? lastHeight + 1 : null;
  for (let i = 0; i < players.length; i += USERS_PER_SUBSCRIPTION) {
    const chunk = players.slice(i, i + USERS_PER_SUBSCRIPTION);
    const label = `dango:${Math.floor(i / USERS_PER_SUBSCRIPTION) + 1}`;
    const sub = dango.startPerpsEventsSocket({
      users: chunk.map(row => row.user),
      since,
      label,
      onOpen(info) {
        console.log(`[dango-realtime-worker] subscribed ${info.users} Dango user(s), since=${info.since ?? 'live'}`);
      },
      onBatch(batch) {
        processBatch(batch);
      },
      onError(err) {
        console.warn('[dango-realtime-worker] websocket issue:', err?.message || err);
        if (/resync/i.test(err?.message || '')) {
          backfillRecent(players, 'resync').finally(() => scheduleReconnect('resync', true));
        } else {
          scheduleReconnect('ws_error');
        }
      },
    });
    subscriptions.push(sub);
  }
}

async function connect(players, reason = 'refresh') {
  if (!running) return;
  const usersKey = players.map(row => row.user).sort().join(',');
  const changed = usersKey !== lastUsersKey;
  const previousUsers = new Set(playerByUser.keys());
  const newPlayers = players.filter(row => !previousUsers.has(row.user));
  updatePlayerMap(players);
  if (!players.length) {
    closeSubscriptions();
    if (reason !== 'refresh') console.log('[dango-realtime-worker] no linked Dango users yet');
    return;
  }
  if (newPlayers.length) {
    await backfillRecent(newPlayers, `${reason}:new_users`, { sinceHeight: 0 });
  }
  if (BACKFILL_ON_START || /resync|reconnect|refresh|ws_error|startup_failed/i.test(reason)) {
    await backfillRecent(players, reason);
  }
  if (changed || !subscriptions.length || /reconnect|resync|startup|ws_error|startup_failed/i.test(reason)) {
    connectSockets(players);
  }
  reconnectAttempt = 0;
}

async function refreshPlayers(reason = 'refresh') {
  const players = await resolveLinkedPlayers(loadLinkedPlayers());
  await connect(players, reason);
}

function start() {
  if (running) return;
  try {
    mainDb = new Database(MAIN_DB_PATH, { readonly: true, fileMustExist: true });
    try { mainDb.pragma('journal_mode = WAL'); } catch {}
  } catch (e) {
    console.error('[dango-realtime-worker] Cannot open main DB:', e.message, '- worker disabled.');
    return;
  }
  running = true;
  lastHeight = loadLastHeight();
  refreshPlayers('startup').catch((e) => {
    console.error('[dango-realtime-worker] startup refresh failed:', e.message);
    scheduleReconnect('startup_failed');
  });
  refreshTimer = setInterval(() => {
    refreshPlayers('refresh').catch((e) => console.warn('[dango-realtime-worker] refresh failed:', e.message));
  }, REFRESH_MS);
  refreshTimer.unref?.();
  console.log(`[dango-realtime-worker] started (${dango.NETWORK}, refresh ${Math.round(REFRESH_MS / 1000)}s, lastHeight=${lastHeight || 'none'})`);
}

function stop() {
  running = false;
  closeSubscriptions();
  if (refreshTimer) clearInterval(refreshTimer);
  if (reconnectTimer) clearTimeout(reconnectTimer);
  refreshTimer = null;
  reconnectTimer = null;
  try { mainDb?.close?.(); } catch {}
  mainDb = null;
}

module.exports = {
  start,
  stop,
  loadLinkedPlayers,
  resolveLinkedPlayers,
  processBatch,
  backfillRecent,
};
