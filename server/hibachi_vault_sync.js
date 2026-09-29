'use strict';

// Background Hibachi trade sync from server-stored credentials.
//
// Hibachi fills were imported only while the player had the game open, because
// the API key and private key came from browser headers. Players who connected
// a key but traded elsewhere never had volume, tournament credit or trade
// records recorded. This job reads each player's Hibachi credentials from the
// trading credential vault and runs the same reconciliation the browser path
// uses, so records stay complete whether or not the player opens the game.
//
// Never logs credential values; only player names and import counts.

const { tradingCredentialId } = require('./trading_credential_vault');

const HIBACHI_STORAGE_KEY = 'clash_hibachi_credentials_v1';
// Every connected account/sub-account (e.g. FX), stored as { accounts: [...] }.
const HIBACHI_ACCOUNTS_STORAGE_KEY = 'clash_hibachi_accounts_v1';
const DEFAULT_INTERVAL_MS = 10 * 60 * 1000;
// Upper bound per account per run. Runs are incremental from the last stored
// fill, so paging stops as soon as it reaches already-recorded executions.
const DEFAULT_LIMIT = 5_000;
// Re-read a little before the newest stored fill so late-arriving executions
// with slightly older timestamps are never skipped; duplicates are upserts.
const INCREMENTAL_OVERLAP_MS = 15 * 60 * 1000;

function parseCredentials(value) {
  let raw = value;
  if (typeof raw === 'string') {
    try { raw = JSON.parse(raw); } catch { return null; }
  }
  if (raw && typeof raw === 'object' && raw.value && !raw.apiKey) raw = raw.value;
  if (typeof raw === 'string') {
    try { raw = JSON.parse(raw); } catch { return null; }
  }
  const apiKey = String(raw?.apiKey || '').trim();
  const accountId = String(raw?.accountId || '').trim();
  const privateKey = String(raw?.privateKey || '').trim();
  if (!apiKey || !accountId || !privateKey) return null;
  return { apiKey, accountId, privateKey };
}

function parseAccountList(value) {
  let raw = value;
  if (typeof raw === 'string') {
    try { raw = JSON.parse(raw); } catch { return []; }
  }
  const list = Array.isArray(raw) ? raw : Array.isArray(raw?.accounts) ? raw.accounts : [];
  return list.map(parseCredentials).filter(Boolean);
}

function createHibachiVaultSync({
  db, vault, getPlayer, reconcile, lastExecutedAt = () => null, limit = DEFAULT_LIMIT, log = console,
}) {
  function incrementalStart(accountId) {
    let last = null;
    try { last = Date.parse(lastExecutedAt(accountId) || ''); } catch { last = null; }
    return Number.isFinite(last) ? last - INCREMENTAL_OVERLAP_MS : undefined;
  }

  const credentialId = tradingCredentialId(HIBACHI_STORAGE_KEY);
  const accountsId = tradingCredentialId(HIBACHI_ACCOUNTS_STORAGE_KEY);
  let running = false;

  function playersWithCredentials() {
    return db.prepare(`
      SELECT DISTINCT player_id FROM trading_credential_vault
      WHERE dex = 'hibachi' AND credential_id IN (?, ?) AND deleted = 0
      ORDER BY player_id
    `).all(credentialId, accountsId).map(row => row.player_id);
  }

  function readValue(playerId, id) {
    try { return vault.readForPlayer(playerId, id)?.value; } catch { return null; }
  }

  // Active key plus the saved account list, one entry per Hibachi account id.
  function accountsForPlayer(playerId) {
    const byId = new Map();
    for (const account of [parseCredentials(readValue(playerId, credentialId)), ...parseAccountList(readValue(playerId, accountsId))]) {
      if (account && !byId.has(account.accountId)) byId.set(account.accountId, account);
    }
    return [...byId.values()];
  }

  async function runOnce() {
    if (running) return { skipped: 'already_running' };
    running = true;
    const summary = { players: 0, accounts: 0, synced: 0, imported: 0, updated: 0, missing: 0, failed: 0 };
    try {
      for (const playerId of playersWithCredentials()) {
        summary.players++;
        const player = getPlayer(playerId);
        const accounts = player ? accountsForPlayer(playerId) : [];
        if (!accounts.length) {
          summary.missing++;
          continue;
        }
        for (const credentials of accounts) {
          summary.accounts++;
          const label = `player=${player.name || playerId} account=${credentials.accountId}`;
          try {
            const result = await reconcile(player, {
              dex: 'hibachi',
              // Per-account reason keeps each sub-account's reconcile cooldown separate.
              reason: `vault_sync:${credentials.accountId}`,
              credentials,
              limit,
              startTime: incrementalStart(credentials.accountId),
            });
            if (result?.ok === false) {
              summary.failed++;
              log.warn(`[hibachi-vault-sync] ${label} failed: ${String(result.error || result.skipped || result.code || 'unknown').slice(0, 160)}`);
            } else {
              summary.synced++;
              summary.imported += Number(result?.imported || 0);
              summary.updated += Number(result?.updated || 0);
            }
          } catch (error) {
            summary.failed++;
            log.warn(`[hibachi-vault-sync] ${label} error: ${String(error?.message || error).slice(0, 160)}`);
          }
        }
      }
      return summary;
    } finally {
      running = false;
    }
  }

  function start({ intervalMs = DEFAULT_INTERVAL_MS, initialDelayMs = 60_000 } = {}) {
    const tick = () => runOnce()
      .then(result => {
        if (result.players) log.log('[hibachi-vault-sync]', result);
      })
      .catch(error => log.warn('[hibachi-vault-sync] run failed:', error?.message || error));
    setTimeout(tick, initialDelayMs).unref?.();
    setInterval(tick, intervalMs).unref?.();
  }

  return { runOnce, start, playersWithCredentials };
}

module.exports = {
  createHibachiVaultSync, parseCredentials, parseAccountList,
  HIBACHI_STORAGE_KEY, HIBACHI_ACCOUNTS_STORAGE_KEY,
};
