#!/usr/bin/env node
const path = require('path');
let Database;
try {
  Database = require('better-sqlite3');
} catch {
  const candidates = [
    path.join(__dirname, '..', 'server', 'node_modules', 'better-sqlite3'),
    path.join(process.cwd(), 'server', 'node_modules', 'better-sqlite3'),
    '/opt/clash/current/server/node_modules/better-sqlite3',
  ];
  const found = candidates.find((p) => {
    try { require.resolve(p); return true; } catch { return false; }
  });
  if (!found) throw new Error('Cannot find better-sqlite3');
  Database = require(found);
}

const args = new Set(process.argv.slice(2));
const APPLY = args.has('--apply');
const MAIN_DB = process.env.CLASH_MAIN_DB || process.argv.find(a => a.startsWith('--main-db='))?.slice('--main-db='.length) || path.join(__dirname, '..', 'server', 'clash.db');
const FUTURES_DB = process.env.CLASH_FUTURES_DB || process.argv.find(a => a.startsWith('--futures-db='))?.slice('--futures-db='.length) || path.join(__dirname, '..', 'server-futures', 'futures.db');

const EVM_RE = /^0x[0-9a-fA-F]{40}$/;
const APTOS_RE = /^0x[0-9a-fA-F]{1,64}$/;
const SOLANA_RE = /^[1-9A-HJ-NP-Za-km-z]{32,44}$/;
const REQUIRED_CHAIN = {
  pacifica: 'solana',
  phoenix: 'solana',
  gmtrade: 'solana',
  flash: 'solana',
  decibel: 'aptos',
  avantis: 'evm',
  gmx: 'evm',
  monad: 'evm',
  hyperliquid: 'evm',
  risex: 'evm',
  nado: 'evm',
  hibachi: 'evm',
  hotstuff: 'evm',
  grvt: 'evm',
  katana: 'evm',
};

function chainOf(wallet) {
  const raw = String(wallet || '').trim();
  if (EVM_RE.test(raw)) return 'evm';
  if (APTOS_RE.test(raw) && !EVM_RE.test(raw)) return 'aptos';
  if (SOLANA_RE.test(raw)) return 'solana';
  return '';
}

function canonical(wallet) {
  const raw = String(wallet || '').trim();
  if (EVM_RE.test(raw)) return raw.toLowerCase();
  if (APTOS_RE.test(raw) && !EVM_RE.test(raw)) return `0x${raw.slice(2).toLowerCase().padStart(64, '0')}`;
  return raw;
}

function dexWalletValid(row) {
  const dex = String(row?.dex || '').toLowerCase();
  const required = REQUIRED_CHAIN[dex];
  if (!required) return false;
  return String(row?.chain_type || '').toLowerCase() === required
    && chainOf(row?.wallet_address) === required;
}

function makeGraph() {
  return { byPlayer: new Map(), byWallet: new Map() };
}

function addEdge(graph, playerId, wallet) {
  const p = String(playerId || '').trim();
  const w = canonical(wallet);
  if (!p || !w) return;
  if (!graph.byPlayer.has(p)) graph.byPlayer.set(p, new Set());
  if (!graph.byWallet.has(w)) graph.byWallet.set(w, new Set());
  graph.byPlayer.get(p).add(w);
  graph.byWallet.get(w).add(p);
}

function components(graph) {
  const seen = new Set();
  const out = [];
  for (const start of graph.byPlayer.keys()) {
    if (seen.has(start)) continue;
    const players = new Set();
    const wallets = new Set();
    const q = [start];
    seen.add(start);
    while (q.length) {
      const p = q.shift();
      players.add(p);
      for (const w of graph.byPlayer.get(p) || []) {
        wallets.add(w);
        for (const next of graph.byWallet.get(w) || []) {
          if (!seen.has(next)) {
            seen.add(next);
            q.push(next);
          }
        }
      }
    }
    if (players.size > 1) out.push({ players: [...players], wallets: [...wallets] });
  }
  return out;
}

function tableExists(db, name) {
  return !!db.prepare("SELECT 1 FROM sqlite_master WHERE type='table' AND name=?").get(name);
}

function columns(db, table) {
  return db.prepare(`PRAGMA table_info(${table})`).all().map(r => r.name);
}

function scorePlayer(db, id) {
  const row = db.prepare(`
    SELECT
      p.*,
      COALESCE((SELECT MAX(level) FROM buildings b WHERE b.player_id = p.id AND b.type = 'town_hall'), 0) AS town_hall_level,
      COALESCE((SELECT SUM(level) FROM buildings b WHERE b.player_id = p.id), 0) AS building_level_sum,
      COALESCE((SELECT COUNT(*) FROM buildings b WHERE b.player_id = p.id), 0) AS building_count,
      COALESCE((SELECT SUM(total_volume) FROM trading_rewards tr WHERE tr.player_id = p.id), 0) AS reward_volume,
      COALESCE((SELECT COUNT(*) FROM player_tasks pt WHERE pt.player_id = p.id), 0) AS task_count,
      COALESCE((SELECT COUNT(*) FROM player_dex_accounts da WHERE da.player_id = p.id AND da.status = 'ready'), 0) AS ready_dexes
    FROM players p
    WHERE p.id = ?
  `).get(id);
  if (!row) return null;
  return {
    ...row,
    name_penalty: /^player_[0-9a-f]/i.test(row.name || '') ? 1 : 0,
    resource_sum: Number(row.gold || 0) + Number(row.wood || 0) + Number(row.ore || 0),
    seen_ts: Date.parse(`${row.last_seen_at || row.created_at || '1970-01-01'}Z`) || 0,
  };
}

function chooseCanonical(db, playerIds) {
  const ranked = playerIds.map(id => scorePlayer(db, id)).filter(Boolean);
  ranked.sort((a, b) => (
    a.name_penalty - b.name_penalty
    || Number(b.town_hall_level || 0) - Number(a.town_hall_level || 0)
    || Number(b.building_level_sum || 0) - Number(a.building_level_sum || 0)
    || Number(b.building_count || 0) - Number(a.building_count || 0)
    || Number(b.reward_volume || 0) - Number(a.reward_volume || 0)
    || Number(b.ready_dexes || 0) - Number(a.ready_dexes || 0)
    || Number(b.task_count || 0) - Number(a.task_count || 0)
    || Number(b.resource_sum || 0) - Number(a.resource_sum || 0)
    || Number(b.trophies || 0) - Number(a.trophies || 0)
    || Number(b.seen_ts || 0) - Number(a.seen_ts || 0)
    || String(a.created_at || '').localeCompare(String(b.created_at || ''))
    || String(a.id).localeCompare(String(b.id))
  ));
  return ranked[0] || null;
}

function upsertDexAccount(db, canonicalId, row) {
  const existing = db.prepare('SELECT * FROM player_dex_accounts WHERE player_id = ? AND dex = ?').get(canonicalId, row.dex);
  if (!existing) {
    db.prepare(`
      INSERT INTO player_dex_accounts (player_id, dex, chain_type, wallet_address, account_id, status, metadata_json, created_at, updated_at)
      VALUES (?, ?, ?, ?, ?, ?, ?, COALESCE(?, datetime('now')), COALESCE(?, datetime('now')))
    `).run(canonicalId, row.dex, row.chain_type, canonical(row.wallet_address), row.account_id, row.status, row.metadata_json || '{}', row.created_at, row.updated_at);
    return;
  }
  const existingValidReady = existing.status === 'ready' && dexWalletValid(existing);
  const incomingValidReady = row.status === 'ready' && dexWalletValid(row);
  const replace = incomingValidReady && (!existingValidReady || String(row.updated_at || '') > String(existing.updated_at || ''));
  if (replace) {
    db.prepare(`
      UPDATE player_dex_accounts
      SET chain_type = ?, wallet_address = ?, account_id = COALESCE(?, account_id),
          status = ?, metadata_json = ?, updated_at = datetime('now')
      WHERE player_id = ? AND dex = ?
    `).run(row.chain_type, canonical(row.wallet_address), row.account_id, row.status, row.metadata_json || '{}', canonicalId, row.dex);
  }
}

function mergePlayer(db, futuresDb, canonicalId, sourceId, reason) {
  const source = db.prepare('SELECT * FROM players WHERE id = ?').get(sourceId);
  const target = db.prepare('SELECT * FROM players WHERE id = ?').get(canonicalId);
  if (!source || !target || sourceId === canonicalId) return { skipped: true };

  for (const row of db.prepare('SELECT * FROM player_wallets WHERE player_id = ?').all(sourceId)) {
    db.prepare(`
      INSERT INTO player_wallets (player_id, chain_type, address, label, is_primary, created_at, updated_at)
      VALUES (?, ?, ?, ?, 0, COALESCE(?, datetime('now')), datetime('now'))
      ON CONFLICT(chain_type, address) DO UPDATE SET player_id = excluded.player_id, updated_at = datetime('now')
    `).run(canonicalId, row.chain_type, canonical(row.address), row.label, row.created_at);
  }
  for (const row of db.prepare('SELECT * FROM player_auth_identities WHERE player_id = ?').all(sourceId)) {
    db.prepare(`
      INSERT INTO player_auth_identities (player_id, type, identifier, verified_at, created_at)
      VALUES (?, ?, ?, COALESCE(?, datetime('now')), COALESCE(?, datetime('now')))
      ON CONFLICT(type, identifier) DO UPDATE SET player_id = excluded.player_id, verified_at = excluded.verified_at
    `).run(canonicalId, row.type, canonical(row.identifier), row.verified_at, row.created_at);
  }
  for (const row of db.prepare('SELECT * FROM player_dex_accounts WHERE player_id = ?').all(sourceId)) {
    if (dexWalletValid(row)) upsertDexAccount(db, canonicalId, { ...row, wallet_address: canonical(row.wallet_address) });
  }

  for (const row of db.prepare('SELECT * FROM trading_rewards WHERE player_id = ?').all(sourceId)) {
    const existing = db.prepare('SELECT * FROM trading_rewards WHERE player_id = ? AND dex = ?').get(canonicalId, row.dex);
    if (!existing) {
      db.prepare(`
        INSERT INTO trading_rewards (player_id, dex, wallet, last_trade_id, total_volume, total_gold, first_deposit, first_trade, last_daily, pnl_gold_pool, updated_at, agent_wallet)
        VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, datetime('now'), ?)
      `).run(canonicalId, row.dex, row.wallet, row.last_trade_id, row.total_volume, row.total_gold, row.first_deposit, row.first_trade, row.last_daily, row.pnl_gold_pool, row.agent_wallet);
    } else {
      db.prepare(`
        UPDATE trading_rewards
        SET last_trade_id = MAX(last_trade_id, ?),
            total_volume = total_volume + ?,
            total_gold = total_gold + ?,
            first_deposit = MAX(first_deposit, ?),
            first_trade = MAX(first_trade, ?),
            pnl_gold_pool = pnl_gold_pool + ?,
            updated_at = datetime('now')
        WHERE player_id = ? AND dex = ?
      `).run(row.last_trade_id, row.total_volume, row.total_gold, row.first_deposit, row.first_trade, row.pnl_gold_pool, canonicalId, row.dex);
    }
  }

  for (const row of db.prepare('SELECT * FROM player_tasks WHERE player_id = ?').all(sourceId)) {
    const existing = db.prepare('SELECT * FROM player_tasks WHERE player_id = ? AND task_id = ?').get(canonicalId, row.task_id);
    if (!existing) {
      db.prepare(`
        INSERT INTO player_tasks (player_id, task_id, snapshot, progress, progress_value, target_value, started_at, claimed_at)
        VALUES (?, ?, ?, ?, ?, ?, ?, ?)
      `).run(canonicalId, row.task_id, row.snapshot, row.progress, row.progress_value, row.target_value, row.started_at, row.claimed_at);
    } else {
      db.prepare(`
        UPDATE player_tasks
        SET progress = MAX(progress, ?),
            progress_value = MAX(progress_value, ?),
            target_value = MAX(target_value, ?),
            claimed_at = COALESCE(claimed_at, ?)
        WHERE player_id = ? AND task_id = ?
      `).run(row.progress, row.progress_value, row.target_value, row.claimed_at, canonicalId, row.task_id);
    }
  }

  const reassignTables = [
    'gold_history',
    'task_claim_events',
    'trade_claim_results',
    'tournament_trade_credits',
    'tournament_daily_activity',
    'player_activity_events',
    'resource_delta_events',
    'player_nfts',
    'player_nft_wallet_checks',
    'player_nft_battle_win_events',
    'utility_purchases',
    'shop_funnel_events',
    'bridge_logs',
  ];
  for (const table of reassignTables) {
    if (tableExists(db, table) && columns(db, table).includes('player_id')) {
      db.prepare(`UPDATE OR IGNORE ${table} SET player_id = ? WHERE player_id = ?`).run(canonicalId, sourceId);
    }
  }
  if (tableExists(db, 'player_dex_credentials')) {
    db.prepare('UPDATE OR IGNORE player_dex_credentials SET player_id = ? WHERE player_id = ?').run(canonicalId, sourceId);
  }
  if (futuresDb && tableExists(futuresDb, 'trade_history')) {
    futuresDb.prepare('UPDATE trade_history SET player_id = ? WHERE player_id = ?').run(canonicalId, sourceId);
  }

  db.prepare(`
    UPDATE players
    SET gold = MAX(gold, ?),
        wood = MAX(wood, ?),
        ore = MAX(ore, ?),
        trophies = MAX(trophies, ?),
        level = MAX(level, ?),
        battle_wins = MAX(battle_wins, ?),
        wallet = NULL
    WHERE id = ?
  `).run(source.gold || 0, source.wood || 0, source.ore || 0, source.trophies || 0, source.level || 1, source.battle_wins || 0, canonicalId);
  db.prepare('UPDATE players SET wallet = NULL WHERE id = ?').run(sourceId);
  db.prepare('DELETE FROM player_wallets WHERE player_id = ?').run(sourceId);
  db.prepare('DELETE FROM player_auth_identities WHERE player_id = ?').run(sourceId);
  db.prepare('DELETE FROM player_dex_accounts WHERE player_id = ?').run(sourceId);
  db.prepare(`
    INSERT OR IGNORE INTO unified_account_merge_audit (canonical_player_id, merged_player_id, reason, merged_at)
    VALUES (?, ?, ?, datetime('now'))
  `).run(canonicalId, sourceId, reason);
  return { merged: true };
}

function main() {
  const db = new Database(MAIN_DB);
  const futuresDb = (() => {
    try { return new Database(FUTURES_DB); } catch { return null; }
  })();
  db.pragma('foreign_keys = OFF');
  db.exec(`
    CREATE TABLE IF NOT EXISTS unified_account_merge_audit (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      canonical_player_id TEXT NOT NULL,
      merged_player_id TEXT NOT NULL,
      reason TEXT NOT NULL,
      merged_at TEXT NOT NULL DEFAULT (datetime('now')),
      UNIQUE(canonical_player_id, merged_player_id)
    );
  `);

  const graph = makeGraph();
  for (const row of db.prepare("SELECT id, wallet FROM players WHERE wallet IS NOT NULL AND wallet <> ''").all()) addEdge(graph, row.id, row.wallet);
  for (const row of db.prepare("SELECT player_id, identifier FROM player_auth_identities WHERE identifier IS NOT NULL AND identifier <> ''").all()) addEdge(graph, row.player_id, row.identifier);
  for (const row of db.prepare("SELECT player_id, address FROM player_wallets WHERE address IS NOT NULL AND address <> ''").all()) addEdge(graph, row.player_id, row.address);
  for (const row of db.prepare("SELECT player_id, dex, chain_type, wallet_address FROM player_dex_accounts WHERE wallet_address IS NOT NULL AND wallet_address <> ''").all()) {
    if (dexWalletValid(row)) addEdge(graph, row.player_id, row.wallet_address);
  }

  const comps = components(graph);
  const invalidDexRows = db.prepare('SELECT * FROM player_dex_accounts').all().filter(row => row.wallet_address && !dexWalletValid(row));
  const plan = comps.map(comp => {
    const canonical = chooseCanonical(db, comp.players);
    return {
      canonical: canonical?.id,
      canonical_name: canonical?.name,
      players: comp.players,
      wallets: comp.wallets,
      merge_count: canonical ? comp.players.filter(id => id !== canonical.id).length : 0,
    };
  }).filter(p => p.canonical && p.merge_count > 0);

  console.log(JSON.stringify({
    apply: APPLY,
    main_db: MAIN_DB,
    futures_db: futuresDb ? FUTURES_DB : null,
    duplicate_components: comps.length,
    planned_merges: plan.reduce((sum, p) => sum + p.merge_count, 0),
    invalid_dex_rows: invalidDexRows.length,
    sample_plan: plan.slice(0, 10),
    sample_invalid_dex_rows: invalidDexRows.slice(0, 10).map(r => ({ id: r.id, player_id: r.player_id, dex: r.dex, chain_type: r.chain_type, wallet_address: r.wallet_address, status: r.status })),
  }, null, 2));

  if (!APPLY) {
    db.close();
    if (futuresDb) futuresDb.close();
    return;
  }

  const tx = db.transaction(() => {
    for (const row of invalidDexRows) {
      let metadata = {};
      try { metadata = JSON.parse(row.metadata_json || '{}') || {}; } catch { metadata = {}; }
      metadata.migration_invalid_wallet = {
        chain_type: row.chain_type || '',
        wallet_address: row.wallet_address || '',
      };
      db.prepare(`
        UPDATE player_dex_accounts
        SET chain_type = NULL,
            wallet_address = NULL,
            status = 'disconnected',
            metadata_json = ?,
            updated_at = datetime('now')
        WHERE id = ?
      `).run(JSON.stringify(metadata), row.id);
    }
    for (const item of plan) {
      for (const sourceId of item.players) {
        if (sourceId !== item.canonical) mergePlayer(db, futuresDb, item.canonical, sourceId, `wallet_component:${item.wallets.join(',').slice(0, 400)}`);
      }
    }
  });
  tx();
  console.log(JSON.stringify({ ok: true, applied: true, components: plan.length }, null, 2));
  db.close();
  if (futuresDb) futuresDb.close();
}

main();
