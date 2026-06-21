#!/usr/bin/env node

const db = require('../server/db');
const tradeRecon = require('../server/trade_reconciliation');

function arg(name, fallback = '') {
  const prefix = `--${name}=`;
  const hit = process.argv.find(a => a.startsWith(prefix));
  return hit ? hit.slice(prefix.length) : fallback;
}

function hasFlag(name) {
  return process.argv.includes(`--${name}`);
}

const apply = hasFlag('apply');
const dexFilter = String(arg('dex', '')).trim().toLowerCase();
const playerFilter = String(arg('player', '')).trim();
const limit = Math.max(1, Math.min(1000, Number(arg('limit', '100')) || 100));
const reason = String(arg('reason', 'backfill')).trim().toLowerCase() || 'backfill';

if (!apply) {
  console.error('Dry safety: pass --apply to import verified fills. Example: node scripts/reconcile-futures-trades.js --dex=gmtrade --player=wanfar --apply');
  process.exit(2);
}

function loadPlayers() {
  const params = [];
  const where = [];
  if (playerFilter) {
    where.push('(p.id = ? OR lower(p.name) = lower(?))');
    params.push(playerFilter, playerFilter);
  }
  if (dexFilter) {
    where.push(`(
      lower(p.dex) = ?
      OR EXISTS (SELECT 1 FROM player_dex_accounts pda WHERE pda.player_id = p.id AND lower(pda.dex) = ?)
      OR EXISTS (SELECT 1 FROM trading_rewards tr WHERE tr.player_id = p.id AND lower(tr.dex) = ?)
    )`);
    params.push(dexFilter, dexFilter, dexFilter);
  }
  const playerCols = new Set(db.db.prepare('PRAGMA table_info(players)').all().map(c => c.name));
  const orderParts = [];
  if (playerCols.has('last_seen')) orderParts.push('p.last_seen DESC');
  if (playerCols.has('created_at')) orderParts.push('p.created_at DESC');
  orderParts.push('p.id DESC');
  const sql = `
    SELECT p.*
    FROM players p
    ${where.length ? `WHERE ${where.join(' AND ')}` : ''}
    ORDER BY ${orderParts.join(', ')}
    LIMIT 5000
  `;
  return db.db.prepare(sql).all(...params);
}

function dexesForPlayer(player) {
  const out = new Set();
  const current = String(player?.dex || '').toLowerCase();
  if (tradeRecon.FUTURES_REWARD_DEXES.has(current)) out.add(current);
  try {
    const rows = db.db.prepare(`
      SELECT dex FROM player_dex_accounts WHERE player_id = ?
      UNION
      SELECT dex FROM trading_rewards WHERE player_id = ?
    `).all(player.id, player.id);
    for (const row of rows) {
      const dex = String(row.dex || '').toLowerCase();
      if (tradeRecon.FUTURES_REWARD_DEXES.has(dex)) out.add(dex);
    }
  } catch {}
  if (dexFilter) return out.has(dexFilter) ? [dexFilter] : [];
  return [...out];
}

(async () => {
  const players = loadPlayers();
  const totals = { players: players.length, dexes: 0, imported: 0, adopted: 0, updated: 0, checked: 0, errors: 0, skipped: 0 };
  for (const player of players) {
    for (const dex of dexesForPlayer(player)) {
      totals.dexes += 1;
      const wallet = tradeRecon.resolveWalletForDex(player, dex, null);
      const result = await tradeRecon.reconcileTradesForPlayer(player, {
        dex,
        wallet,
        reason,
        limit,
        force: true,
      });
      totals.imported += Number(result.imported || result.backfill?.imported || 0);
      totals.adopted += Number(result.adopted || 0);
      totals.updated += Number(result.updated || 0);
      totals.checked += Number(result.checked || result.backfill?.checked || 0);
      totals.errors += Number(result.errors || result.backfill?.errors || 0);
      if (result.skipped) totals.skipped += 1;
      console.log(JSON.stringify({
        player: player.name,
        player_id: player.id,
        dex,
        wallet: wallet ? `${String(wallet).slice(0, 8)}...${String(wallet).slice(-6)}` : null,
        ok: result.ok,
        imported: result.imported || 0,
        adopted: result.adopted || 0,
        updated: result.updated || 0,
        checked: result.checked || result.backfill?.checked || 0,
        skipped: result.skipped || null,
        error: result.error || null,
      }));
    }
  }
  console.log('SUMMARY', JSON.stringify(totals));
})().catch((e) => {
  console.error('FAILED', e);
  process.exit(1);
});
