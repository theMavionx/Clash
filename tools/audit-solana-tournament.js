#!/usr/bin/env node
'use strict';

const fs = require('fs');
const path = require('path');

const ROOT = path.resolve(__dirname, '..');

const VERIFIED_SOURCES_BY_DEX = {
  avantis: ['worker'],
  decibel: ['decibel_fill', 'server'],
  gmx: ['worker', 'server'],
  ostium: ['ostium_api'],
  monad: ['perpl_api', 'perpl_ws'],
  phoenix: ['worker', 'tx'],
  hyperliquid: ['hyperliquid_api'],
  risex: ['risex_api'],
  nado: ['nado_api'],
  hibachi: ['hibachi_api'],
  hotstuff: ['hotstuff_api'],
  grvt: ['grvt_builder'],
  katana: ['katana_api'],
  gmtrade: ['gmtrade_tx', 'gmtrade_position_after_tx', 'gmtrade_close_tx_client_notional'],
  flash: ['flash_tx'],
  lighter: ['lighter_integrator'],
};

const FUTURES_DEXES = new Set(Object.keys(VERIFIED_SOURCES_BY_DEX));
const SOLANA_WALLET_RE = /^[1-9A-HJ-NP-Za-km-z]{32,44}$/;
const EVM_WALLET_RE = /^0x[0-9a-fA-F]{40}$/;
const APTOS_WALLET_RE = /^0x[0-9a-fA-F]{1,64}$/;

function usage() {
  return [
    'Usage:',
    '  node tools/audit-solana-tournament.js --tournament 19 [--main-db PATH] [--futures-db PATH] [--live] [--json]',
    '',
    'Read-only audit. It never calls claim/sync endpoints and never writes SQLite.',
    '',
    'Env fallbacks:',
    '  CLASH_MAIN_DB, CLASH_FUTURES_DB, PHOENIX_API_URL, PACIFICA_BUILDER_CODE',
  ].join('\n');
}

function parseArgs(argv) {
  const out = {
    tournament: null,
    mainDb: process.env.CLASH_MAIN_DB || path.join(ROOT, 'server', 'clash.db'),
    futuresDb: process.env.CLASH_FUTURES_DB || path.join(ROOT, 'server-futures', 'futures.db'),
    live: false,
    json: false,
    limit: 1000,
  };
  for (let i = 0; i < argv.length; i += 1) {
    const arg = argv[i];
    if (arg === '--help' || arg === '-h') {
      console.log(usage());
      process.exit(0);
    }
    if (arg === '--live') {
      out.live = true;
      continue;
    }
    if (arg === '--json') {
      out.json = true;
      continue;
    }
    if (arg === '--tournament' || arg === '-t') {
      out.tournament = Number(argv[++i]);
      continue;
    }
    if (arg === '--main-db') {
      out.mainDb = path.resolve(argv[++i]);
      continue;
    }
    if (arg === '--futures-db') {
      out.futuresDb = path.resolve(argv[++i]);
      continue;
    }
    if (arg === '--limit') {
      out.limit = Math.max(1, Math.min(5000, Number(argv[++i]) || out.limit));
      continue;
    }
    throw new Error(`Unknown argument: ${arg}`);
  }
  if (!Number.isInteger(out.tournament) || out.tournament <= 0) {
    throw new Error('Missing required --tournament <id>');
  }
  return out;
}

function requireBetterSqlite3() {
  const candidates = [
    'better-sqlite3',
    path.join(ROOT, 'server-futures', 'node_modules', 'better-sqlite3'),
    path.join(ROOT, 'server', 'node_modules', 'better-sqlite3'),
  ];
  for (const candidate of candidates) {
    try {
      return require(candidate);
    } catch {}
  }
  throw new Error('better-sqlite3 not found. Run from repo root or install server-futures dependencies.');
}

function openReadonly(Database, filePath, label) {
  const resolved = path.resolve(filePath);
  if (!fs.existsSync(resolved)) {
    throw new Error(`${label} not found: ${resolved}`);
  }
  const db = new Database(resolved, { readonly: true, fileMustExist: true });
  try { db.pragma('query_only = ON'); } catch {}
  try { db.pragma('journal_mode = WAL'); } catch {}
  return db;
}

function tableExists(db, name) {
  return !!db.prepare("SELECT 1 FROM sqlite_master WHERE type='table' AND name = ?").get(name);
}

function tableColumns(db, name) {
  if (!tableExists(db, name)) return new Set();
  return new Set(db.prepare(`PRAGMA table_info(${name})`).all().map(row => row.name));
}

function cleanDate(value) {
  const text = String(value || '').trim();
  if (!text) return null;
  return text.replace(/[zZ]$/, '').replace(/\s*UTC$/i, '').replace('T', ' ').slice(0, 19);
}

function dateMs(value) {
  const clean = cleanDate(value);
  if (!clean) return null;
  const ms = Date.parse(`${clean.replace(' ', 'T')}Z`);
  return Number.isFinite(ms) ? ms : null;
}

function inWindow(tournament, participant, row) {
  const tradeMs = dateMs(row?.created_at);
  if (!tradeMs) return false;
  const startMs = Math.max(dateMs(tournament.start_at) || 0, dateMs(participant.joined_at) || 0);
  const endMs = dateMs(tournament.end_at) || Infinity;
  return tradeMs >= startMs && tradeMs <= endMs;
}

function parseJsonList(value) {
  if (Array.isArray(value)) return value;
  const text = String(value || '').trim();
  if (!text) return [];
  try {
    const parsed = JSON.parse(text);
    return Array.isArray(parsed) ? parsed : [];
  } catch {
    return text.split(',').map(item => item.trim()).filter(Boolean);
  }
}

function eligibleDexes(tournament) {
  const scope = String(tournament.dex_scope || 'single').toLowerCase();
  if (scope === 'all') return Object.keys(VERIFIED_SOURCES_BY_DEX).concat(['pacifica']);
  const list = parseJsonList(tournament.eligible_dexes)
    .map(item => String(item || '').trim().toLowerCase())
    .filter(Boolean);
  if (list.length) return [...new Set(list)];
  return [String(tournament.dex || 'pacifica').toLowerCase()];
}

function isSolanaWallet(value) {
  return SOLANA_WALLET_RE.test(String(value || '').trim());
}

function isEvmWallet(value) {
  return EVM_WALLET_RE.test(String(value || '').trim());
}

function isAptosWallet(value) {
  const text = String(value || '').trim();
  return APTOS_WALLET_RE.test(text) && !EVM_WALLET_RE.test(text);
}

function walletMatchesDex(dex, wallet) {
  if (!wallet) return false;
  if (dex === 'pacifica' || dex === 'phoenix' || dex === 'gmtrade' || dex === 'flash') return isSolanaWallet(wallet);
  if (dex === 'decibel') return isAptosWallet(wallet);
  return isEvmWallet(wallet);
}

function rowKey(row) {
  return `${row.player_id}:${row.dex}`;
}

function addTotals(map, playerId, dex, patch) {
  const key = `${playerId}:${dex}`;
  const row = map.get(key) || {
    player_id: playerId,
    dex,
    rows: 0,
    trades_count: 0,
    volume_usd: 0,
    pnl_usd: 0,
    sources: {},
  };
  row.rows += Number(patch.rows || 0);
  row.trades_count += Number(patch.trades_count || 0);
  row.volume_usd += Number(patch.volume_usd || 0);
  row.pnl_usd += Number(patch.pnl_usd || 0);
  if (patch.source) row.sources[patch.source] = (row.sources[patch.source] || 0) + 1;
  map.set(key, row);
}

function num(value) {
  const n = Number(value);
  return Number.isFinite(n) ? n : 0;
}

function round2(value) {
  return Math.round(num(value) * 100) / 100;
}

function nearlyEqual(a, b, epsilon = 0.01) {
  return Math.abs(num(a) - num(b)) <= epsilon;
}

function getParticipants(mainDb, tournamentId, limit) {
  return mainDb.prepare(`
    SELECT tp.*,
           p.name,
           p.dex AS player_dex,
           p.wallet AS player_wallet
      FROM tournament_participants tp
      JOIN players p ON p.id = tp.player_id
     WHERE tp.tournament_id = ?
       AND tp.left_at IS NULL
     ORDER BY tp.volume_usd DESC, tp.trades_count DESC, tp.player_id ASC
     LIMIT ?
  `).all(tournamentId, limit);
}

function getLinkedState(mainDb, participants, dexList) {
  const participantIds = participants.map(row => row.player_id);
  if (!participantIds.length) return { dexAccounts: [], rewards: [], wallets: [], pacificaAgents: [] };
  const placeholders = participantIds.map(() => '?').join(',');
  const state = { dexAccounts: [], rewards: [], wallets: [], pacificaAgents: [] };

  if (tableExists(mainDb, 'player_dex_accounts')) {
    state.dexAccounts = mainDb.prepare(`
      SELECT player_id, dex, chain_type, wallet_address, account_id, status, updated_at
        FROM player_dex_accounts
       WHERE player_id IN (${placeholders})
         AND lower(dex) IN (${dexList.map(() => '?').join(',')})
       ORDER BY player_id, dex, CASE WHEN status = 'ready' THEN 0 ELSE 1 END, updated_at DESC, id DESC
    `).all(...participantIds, ...dexList);
  }

  if (tableExists(mainDb, 'trading_rewards')) {
    state.rewards = mainDb.prepare(`
      SELECT *
        FROM trading_rewards
       WHERE player_id IN (${placeholders})
         AND lower(dex) IN (${dexList.map(() => '?').join(',')})
       ORDER BY player_id, dex
    `).all(...participantIds, ...dexList);
  }

  if (tableExists(mainDb, 'player_wallets')) {
    state.wallets = mainDb.prepare(`
      SELECT player_id, chain_type, address, label, is_primary, updated_at
        FROM player_wallets
       WHERE player_id IN (${placeholders})
       ORDER BY player_id, is_primary DESC, updated_at DESC, id DESC
    `).all(...participantIds);
  }

  if (tableExists(mainDb, 'pacifica_agents') && dexList.includes('pacifica')) {
    state.pacificaAgents = mainDb.prepare(`
      SELECT player_id, agent_wallet, bound_at
        FROM pacifica_agents
       WHERE player_id IN (${placeholders})
       ORDER BY player_id, bound_at DESC
    `).all(...participantIds);
  }

  return state;
}

function buildWalletResolver(participants, linkedState) {
  const byPlayer = new Map(participants.map(row => [row.player_id, row]));
  const dexAccounts = new Map();
  const rewards = new Map();
  const wallets = new Map();
  const pacificaAgents = new Map();

  for (const row of linkedState.dexAccounts) {
    const key = `${row.player_id}:${String(row.dex || '').toLowerCase()}`;
    if (!dexAccounts.has(key)) dexAccounts.set(key, row);
  }
  for (const row of linkedState.rewards) {
    rewards.set(`${row.player_id}:${String(row.dex || '').toLowerCase()}`, row);
  }
  for (const row of linkedState.wallets) {
    const chainRows = wallets.get(row.player_id) || [];
    chainRows.push(row);
    wallets.set(row.player_id, chainRows);
  }
  for (const row of linkedState.pacificaAgents) {
    const rows = pacificaAgents.get(row.player_id) || [];
    rows.push(row);
    pacificaAgents.set(row.player_id, rows);
  }

  function chainForDex(dex) {
    if (dex === 'pacifica' || dex === 'phoenix' || dex === 'gmtrade' || dex === 'flash') return 'solana';
    if (dex === 'decibel') return 'aptos';
    return 'evm';
  }

  return function resolve(playerId, dex) {
    const player = byPlayer.get(playerId) || {};
    const normalizedDex = String(dex || '').toLowerCase();
    const candidates = [];
    const dexRow = dexAccounts.get(`${playerId}:${normalizedDex}`);
    if (dexRow?.wallet_address) candidates.push({ source: 'player_dex_accounts', wallet: dexRow.wallet_address, account_id: dexRow.account_id || null });
    const reward = rewards.get(`${playerId}:${normalizedDex}`);
    if (reward?.wallet) candidates.push({ source: 'trading_rewards.wallet', wallet: reward.wallet, account_id: null });
    if (normalizedDex === 'pacifica' && reward?.agent_wallet) {
      candidates.push({ source: 'trading_rewards.agent_wallet', wallet: reward.agent_wallet, account_id: null });
    }
    if (normalizedDex === 'pacifica') {
      for (const agent of pacificaAgents.get(playerId) || []) {
        candidates.push({ source: 'pacifica_agents', wallet: agent.agent_wallet, account_id: null });
      }
    }
    const chain = chainForDex(normalizedDex);
    for (const row of wallets.get(playerId) || []) {
      if (String(row.chain_type || '').toLowerCase() === chain) {
        candidates.push({ source: `player_wallets.${chain}`, wallet: row.address, account_id: null });
      }
    }
    if (player.player_wallet) candidates.push({ source: 'players.wallet', wallet: player.player_wallet, account_id: null });

    const seen = new Set();
    const valid = [];
    for (const candidate of candidates) {
      const wallet = String(candidate.wallet || '').trim();
      if (!wallet || seen.has(wallet)) continue;
      seen.add(wallet);
      if (walletMatchesDex(normalizedDex, wallet)) valid.push({ ...candidate, wallet });
    }
    return valid;
  };
}

function fetchCredits(mainDb, tournamentId) {
  if (!tableExists(mainDb, 'tournament_trade_credits')) return [];
  return mainDb.prepare(`
    SELECT *
      FROM tournament_trade_credits
     WHERE tournament_id = ?
     ORDER BY player_id, dex, credited_at, trade_id
  `).all(tournamentId);
}

function fetchDailyActivity(mainDb, tournamentId) {
  if (!tableExists(mainDb, 'tournament_daily_activity')) return [];
  return mainDb.prepare(`
    SELECT player_id, dex,
           COALESCE(SUM(trades_count), 0) AS trades_count,
           COALESCE(SUM(volume_usd), 0) AS volume_usd,
           COALESCE(SUM(pnl_usd), 0) AS pnl_usd,
           COUNT(*) AS rows
      FROM tournament_daily_activity
     WHERE tournament_id = ?
     GROUP BY player_id, dex
  `).all(tournamentId);
}

function fetchFuturesRows(futuresDb, tournament, participants, dexList) {
  const rows = [];
  if (!futuresDb || !tableExists(futuresDb, 'trade_history')) return rows;
  const cols = tableColumns(futuresDb, 'trade_history');
  const hasVerified = cols.has('verified_source');
  const hasNotional = cols.has('notional_usd');
  const hasDex = cols.has('dex');
  if (!hasDex) return rows;

  const stmt = futuresDb.prepare(`
    SELECT id, player_id, symbol, side, order_type, amount, price,
           order_id, client_order_id, status, dex,
           ${hasNotional ? 'notional_usd' : '0 AS notional_usd'},
           ${hasVerified ? 'verified_source' : "'client' AS verified_source"},
           pnl,
           created_at
      FROM trade_history
     WHERE player_id = ?
       AND lower(dex) = ?
       AND status = 'filled'
     ORDER BY id ASC
  `);

  for (const participant of participants) {
    for (const dex of dexList) {
      if (!FUTURES_DEXES.has(dex)) continue;
      const sources = VERIFIED_SOURCES_BY_DEX[dex] || ['worker'];
      const found = stmt.all(participant.player_id, dex)
        .filter(row => sources.includes(String(row.verified_source || '')))
        .filter(row => inWindow(tournament, participant, row));
      rows.push(...found);
    }
  }
  return rows;
}

async function fetchJson(url, timeoutMs = 8000) {
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), timeoutMs);
  try {
    const res = await fetch(url, { signal: controller.signal, headers: { accept: 'application/json' } });
    const text = await res.text();
    let data = null;
    try { data = text ? JSON.parse(text) : null; } catch { data = text; }
    if (!res.ok) {
      const err = new Error(`HTTP ${res.status}: ${typeof data === 'string' ? data.slice(0, 120) : JSON.stringify(data).slice(0, 120)}`);
      err.status = res.status;
      throw err;
    }
    return data;
  } finally {
    clearTimeout(timeout);
  }
}

async function livePhoenix(wallet) {
  const base = String(process.env.PHOENIX_API_URL || 'https://perp-api.phoenix.trade').replace(/\/+$/, '');
  const data = await fetchJson(`${base}/trader/${encodeURIComponent(wallet)}/trades-history?limit=200`);
  const rows = Array.isArray(data) ? data
    : Array.isArray(data?.data) ? data.data
    : Array.isArray(data?.value) ? data.value
    : [];
  return {
    source: 'phoenix_api_trades_history',
    rows: rows.length,
    recent: rows.slice(0, 5).map(row => ({
      signature: row.signature || null,
      symbol: row.marketSymbol || row.symbol || row.market || null,
      price: row.price ?? null,
      realized_pnl: row.realizedPnl ?? null,
      timestamp: row.timestamp || row.created_at || row.time || null,
    })),
  };
}

async function livePacifica(wallet) {
  const builder = process.env.PACIFICA_BUILDER_CODE || 'clashofperps';
  const params = new URLSearchParams({ account: wallet, limit: '200', builder_code: builder });
  const data = await fetchJson(`https://api.pacifica.fi/api/v1/trades/history?${params.toString()}`);
  const rows = data?.success && Array.isArray(data.data) ? data.data : Array.isArray(data) ? data : [];
  return {
    source: 'pacifica_api_trades_history',
    rows: rows.length,
    has_more: !!data?.has_more,
    recent: rows.slice(0, 5).map(row => ({
      history_id: row.history_id ?? null,
      order_id: row.order_id ?? null,
      symbol: row.symbol ?? null,
      side: row.side ?? null,
      price: row.price ?? null,
      amount: row.amount ?? null,
      realized_pnl: row.realized_pnl ?? row.pnl ?? null,
    })),
  };
}

async function liveFlash(wallet) {
  const flash = require(path.join(ROOT, 'server-futures', 'flash.js'));
  const positions = await flash.getPositionsByAddress(wallet);
  return {
    source: 'flash_onchain_positions',
    positions: Array.isArray(positions) ? positions.length : 0,
    rows: Array.isArray(positions) ? positions.slice(0, 5).map(row => ({
      symbol: row.symbol || row.market_name || null,
      side: row.side || row.direction || null,
      size_usd: row.size_usd ?? row.sizeUsd ?? null,
      pnl_usd: row.pnl_usd ?? row.pnlUsd ?? null,
      entry_price: row.entry_price ?? row.entryPrice ?? null,
    })) : [],
  };
}

async function runLiveChecks(participants, dexList, resolveWallet) {
  const out = [];
  for (const participant of participants) {
    for (const dex of dexList) {
      const wallets = resolveWallet(participant.player_id, dex);
      if (!wallets.length) continue;
      const primary = wallets[0];
      if (dex !== 'pacifica' && dex !== 'phoenix' && dex !== 'flash') continue;
      const row = {
        player_id: participant.player_id,
        name: participant.name,
        dex,
        wallet: primary.wallet,
        wallet_source: primary.source,
        ok: false,
        result: null,
        error: null,
      };
      try {
        if (dex === 'pacifica') row.result = await livePacifica(primary.wallet);
        if (dex === 'phoenix') row.result = await livePhoenix(primary.wallet);
        if (dex === 'flash') row.result = await liveFlash(primary.wallet);
        row.ok = true;
      } catch (e) {
        row.error = e.message || String(e);
      }
      out.push(row);
    }
  }
  return out;
}

function audit(options) {
  const Database = requireBetterSqlite3();
  const mainDb = openReadonly(Database, options.mainDb, 'main DB');
  let futuresDb = null;
  try {
    futuresDb = openReadonly(Database, options.futuresDb, 'futures DB');
  } catch (e) {
    futuresDb = null;
  }

  const tournament = mainDb.prepare('SELECT * FROM tournaments WHERE id = ?').get(options.tournament);
  if (!tournament) throw new Error(`Tournament ${options.tournament} not found`);
  const dexList = eligibleDexes(tournament);
  const participants = getParticipants(mainDb, tournament.id, options.limit);
  const linkedState = getLinkedState(mainDb, participants, dexList);
  const resolveWallet = buildWalletResolver(participants, linkedState);
  const credits = fetchCredits(mainDb, tournament.id);
  const dailyActivity = fetchDailyActivity(mainDb, tournament.id);
  const futuresRows = fetchFuturesRows(futuresDb, tournament, participants, dexList);

  const participantsById = new Map(participants.map(row => [row.player_id, row]));
  const creditsByTrade = new Map();
  const creditTotals = new Map();
  for (const row of credits) {
    creditsByTrade.set(`${row.source}:${String(row.trade_id)}`, row);
    addTotals(creditTotals, row.player_id, String(row.dex || '').toLowerCase(), {
      rows: 1,
      trades_count: row.trades_count,
      volume_usd: row.volume_usd,
      pnl_usd: row.pnl_usd,
      source: row.source,
    });
  }

  const futuresTotals = new Map();
  const futuresByTrade = new Map();
  for (const row of futuresRows) {
    const dex = String(row.dex || '').toLowerCase();
    futuresByTrade.set(`trade_history:${String(row.id)}`, row);
    addTotals(futuresTotals, row.player_id, dex, {
      rows: 1,
      trades_count: 1,
      volume_usd: row.notional_usd,
      pnl_usd: row.pnl,
      source: row.verified_source,
    });
  }

  const dailyTotals = new Map();
  for (const row of dailyActivity) {
    addTotals(dailyTotals, row.player_id, String(row.dex || '').toLowerCase(), {
      rows: row.rows,
      trades_count: row.trades_count,
      volume_usd: row.volume_usd,
      pnl_usd: row.pnl_usd,
      source: 'daily_activity',
    });
  }

  const findings = [];
  const futuresIssues = [];

  for (const row of futuresRows) {
    const key = `trade_history:${String(row.id)}`;
    const credit = creditsByTrade.get(key);
    if (!credit) {
      futuresIssues.push({
        type: 'missing_tournament_credit',
        player_id: row.player_id,
        name: participantsById.get(row.player_id)?.name || null,
        dex: row.dex,
        trade_history_id: row.id,
        verified_source: row.verified_source,
        notional_usd: round2(row.notional_usd),
        pnl_usd: round2(row.pnl),
        created_at: row.created_at,
      });
      continue;
    }
    const dex = String(row.dex || '').toLowerCase();
    const creditDex = String(credit.dex || '').toLowerCase();
    if (creditDex !== dex) {
      futuresIssues.push({
        type: 'wrong_credit_dex',
        player_id: row.player_id,
        name: participantsById.get(row.player_id)?.name || null,
        trade_history_id: row.id,
        expected_dex: dex,
        credit_dex: creditDex,
      });
    }
    if (!nearlyEqual(credit.volume_usd, row.notional_usd)) {
      futuresIssues.push({
        type: 'wrong_credit_volume',
        player_id: row.player_id,
        name: participantsById.get(row.player_id)?.name || null,
        trade_history_id: row.id,
        dex,
        trade_history_volume_usd: round2(row.notional_usd),
        credit_volume_usd: round2(credit.volume_usd),
      });
    }
    if (!nearlyEqual(credit.pnl_usd, row.pnl)) {
      futuresIssues.push({
        type: 'wrong_credit_pnl',
        player_id: row.player_id,
        name: participantsById.get(row.player_id)?.name || null,
        trade_history_id: row.id,
        dex,
        trade_history_pnl_usd: round2(row.pnl),
        credit_pnl_usd: round2(credit.pnl_usd),
      });
    }
  }

  for (const credit of credits) {
    if (credit.source === 'trade_history' && !futuresByTrade.has(`trade_history:${String(credit.trade_id)}`)) {
      findings.push({
        type: 'orphan_trade_history_credit',
        player_id: credit.player_id,
        name: participantsById.get(credit.player_id)?.name || null,
        dex: credit.dex,
        trade_id: credit.trade_id,
        volume_usd: round2(credit.volume_usd),
        pnl_usd: round2(credit.pnl_usd),
      });
    }
  }

  const players = participants.map((participant) => {
    const row = {
      player_id: participant.player_id,
      name: participant.name,
      player_dex: participant.player_dex,
      team_dex: participant.team_dex || participant.player_dex,
      participant: {
        trades_count: Number(participant.trades_count || 0),
        volume_usd: round2(participant.volume_usd),
        pnl_usd: round2(participant.pnl_usd),
        trophies: Number(participant.trophies || 0),
        gold: Number(participant.gold || 0),
        awarded_points: Number(participant.awarded_points || 0),
      },
      wallets: {},
      by_dex: {},
      warnings: [],
    };
    for (const dex of dexList) {
      const wallets = resolveWallet(participant.player_id, dex);
      row.wallets[dex] = wallets.map(wallet => ({ source: wallet.source, wallet: wallet.wallet, account_id: wallet.account_id }));
      const c = creditTotals.get(`${participant.player_id}:${dex}`) || null;
      const f = futuresTotals.get(`${participant.player_id}:${dex}`) || null;
      const d = dailyTotals.get(`${participant.player_id}:${dex}`) || null;
      row.by_dex[dex] = {
        tournament_credits: c ? {
          rows: c.rows,
          trades_count: c.trades_count,
          volume_usd: round2(c.volume_usd),
          pnl_usd: round2(c.pnl_usd),
          sources: c.sources,
        } : null,
        verified_trade_history: f ? {
          rows: f.rows,
          trades_count: f.trades_count,
          volume_usd: round2(f.volume_usd),
          pnl_usd: round2(f.pnl_usd),
          sources: f.sources,
        } : null,
        daily_activity: d ? {
          rows: d.rows,
          trades_count: d.trades_count,
          volume_usd: round2(d.volume_usd),
          pnl_usd: round2(d.pnl_usd),
        } : null,
      };
      if ((dex === 'phoenix' || dex === 'flash') && f && !c) {
        row.warnings.push(`${dex}: verified trade_history exists but tournament credits are missing`);
      }
      if (c && f && (!nearlyEqual(c.volume_usd, f.volume_usd) || !nearlyEqual(c.pnl_usd, f.pnl_usd) || Number(c.trades_count) !== Number(f.trades_count))) {
        row.warnings.push(`${dex}: tournament credits do not match verified trade_history totals`);
      }
      if (!wallets.length && (participant.player_dex === dex || participant.team_dex === dex)) {
        row.warnings.push(`${dex}: no compatible linked wallet/account found`);
      }
    }
    const creditSum = [...creditTotals.values()]
      .filter(total => total.player_id === participant.player_id)
      .reduce((acc, total) => {
        acc.trades_count += total.trades_count;
        acc.volume_usd += total.volume_usd;
        acc.pnl_usd += total.pnl_usd;
        return acc;
      }, { trades_count: 0, volume_usd: 0, pnl_usd: 0 });
    if (creditSum.trades_count > 0 && Number(participant.trades_count || 0) !== Number(creditSum.trades_count)) {
      row.warnings.push(`participant trades_count ${participant.trades_count} != tournament_trade_credits ${creditSum.trades_count}`);
    }
    if (creditSum.volume_usd > 0 && !nearlyEqual(participant.volume_usd, creditSum.volume_usd)) {
      row.warnings.push(`participant volume ${round2(participant.volume_usd)} != tournament_trade_credits ${round2(creditSum.volume_usd)}`);
    }
    if (creditSum.pnl_usd !== 0 && !nearlyEqual(participant.pnl_usd, creditSum.pnl_usd)) {
      row.warnings.push(`participant pnl ${round2(participant.pnl_usd)} != tournament_trade_credits ${round2(creditSum.pnl_usd)}`);
    }
    return row;
  });

  const totals = {
    participants: participants.length,
    tournament_credits: credits.length,
    verified_futures_rows: futuresRows.length,
    daily_activity_groups: dailyActivity.length,
    futures_issues: futuresIssues.length,
    findings: findings.length,
  };

  return {
    generated_at: new Date().toISOString(),
    db: {
      main: path.resolve(options.mainDb),
      futures: futuresDb ? path.resolve(options.futuresDb) : null,
    },
    tournament: {
      id: tournament.id,
      name: tournament.name,
      status: tournament.status,
      dex: tournament.dex,
      dex_scope: tournament.dex_scope,
      eligible_dexes: dexList,
      start_at: tournament.start_at,
      end_at: tournament.end_at,
      daily_pool_enabled_at: tournament.daily_pool_enabled_at || null,
    },
    totals,
    futures_issues: futuresIssues,
    findings,
    players,
    _resolveWallet: resolveWallet,
  };
}

function printText(report) {
  console.log(`Tournament #${report.tournament.id}: ${report.tournament.name}`);
  console.log(`Window: ${report.tournament.start_at || '-'} -> ${report.tournament.end_at || 'open'} | DEX: ${report.tournament.eligible_dexes.join(', ')}`);
  console.log(`DB: main=${report.db.main} futures=${report.db.futures || 'unavailable'}`);
  console.log(`Totals: participants=${report.totals.participants}, credits=${report.totals.tournament_credits}, verified_futures_rows=${report.totals.verified_futures_rows}, issues=${report.totals.futures_issues + report.totals.findings}`);
  console.log('');

  if (report.futures_issues.length || report.findings.length) {
    console.log('Issues:');
    for (const issue of [...report.futures_issues, ...report.findings].slice(0, 200)) {
      console.log(`- ${issue.type}: ${issue.name || issue.player_id} ${issue.dex || issue.expected_dex || ''} ${issue.trade_history_id ? `trade_history#${issue.trade_history_id}` : issue.trade_id ? `trade#${issue.trade_id}` : ''} vol=${issue.notional_usd ?? issue.volume_usd ?? issue.trade_history_volume_usd ?? ''} pnl=${issue.pnl_usd ?? issue.trade_history_pnl_usd ?? ''}`);
    }
    console.log('');
  }

  console.log('Players:');
  for (const player of report.players) {
    const dexLines = Object.entries(player.by_dex)
      .map(([dex, state]) => {
        const credit = state.tournament_credits;
        const verified = state.verified_trade_history;
        const wallets = player.wallets[dex] || [];
        const walletLabel = wallets.length ? wallets.map(w => `${w.source}:${String(w.wallet).slice(0, 8)}...`).join(',') : 'no-wallet';
        return `${dex}{credit=${credit ? `${credit.trades_count}/$${credit.volume_usd}/pnl=${credit.pnl_usd}` : '-'} verified=${verified ? `${verified.trades_count}/$${verified.volume_usd}/pnl=${verified.pnl_usd}` : '-'} wallet=${walletLabel}}`;
      })
      .join(' ');
    const warnings = player.warnings.length ? ` WARN=[${player.warnings.join('; ')}]` : '';
    console.log(`- ${player.name} (${player.player_id}) team=${player.team_dex} participant=${player.participant.trades_count}/$${player.participant.volume_usd}/pnl=${player.participant.pnl_usd} ${dexLines}${warnings}`);
  }
}

async function main() {
  const options = parseArgs(process.argv.slice(2));
  const report = audit(options);
  if (options.live) {
    report.live_checks = await runLiveChecks(
      report.players.map(player => ({
        player_id: player.player_id,
        name: player.name,
        player_dex: player.player_dex,
        team_dex: player.team_dex,
      })),
      report.tournament.eligible_dexes,
      report._resolveWallet,
    );
  }
  delete report._resolveWallet;

  if (options.json) {
    console.log(JSON.stringify(report, null, 2));
  } else {
    printText(report);
    if (options.live && report.live_checks) {
      console.log('');
      console.log('Live checks:');
      for (const row of report.live_checks) {
        if (row.ok) {
          const count = row.result?.rows ?? row.result?.positions ?? 0;
          console.log(`- ${row.name} ${row.dex} ${row.wallet_source}:${String(row.wallet).slice(0, 8)}... ok rows=${count} source=${row.result?.source || '-'}`);
        } else {
          console.log(`- ${row.name} ${row.dex} ${row.wallet_source}:${String(row.wallet).slice(0, 8)}... ERROR ${row.error}`);
        }
      }
    }
  }
}

main().catch((e) => {
  console.error(e.message || e);
  process.exit(1);
});
