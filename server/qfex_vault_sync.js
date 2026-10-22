'use strict';

// Background QFEX fill sync from server-stored credentials.
//
// QFEX fills were imported only while the player had the game open. A close
// placed just before the import (QFEX indexes fills a few seconds later) was
// left unimported until the player came back, so no Gold was credited. This
// job reads each player's QFEX keys from the trading credential vault and runs
// the same reconciliation the browser path uses. Reward proof is unchanged:
// only fills of our own accepted, builder-coded orders are credited.
//
// Never logs credential values; only player names and import counts.

const { tradingCredentialId } = require('./trading_credential_vault');

const QFEX_STORAGE_KEY = 'clash_qfex_credentials_v1';
const DEFAULT_INTERVAL_MS = 5 * 60 * 1000;
const DEFAULT_LIMIT = 200;

function parseQfexCredentials(value) {
  let raw = value;
  if (typeof raw === 'string') {
    try { raw = JSON.parse(raw); } catch { return null; }
  }
  if (raw && typeof raw === 'object' && raw.value && !raw.publicKey) raw = raw.value;
  if (typeof raw === 'string') {
    try { raw = JSON.parse(raw); } catch { return null; }
  }
  const publicKey = String(raw?.publicKey || '').trim();
  const secretKey = String(raw?.secretKey || '').trim();
  const accountId = String(raw?.accountId || '').trim();
  if (!publicKey || !secretKey) return null;
  return { publicKey, secretKey, ...(accountId ? { accountId } : {}) };
}

function createQfexVaultSync({ db, vault, getPlayer, reconcile, limit = DEFAULT_LIMIT, log = console }) {
  const credentialId = tradingCredentialId(QFEX_STORAGE_KEY);
  let running = false;

  function playersWithCredentials() {
    return db.prepare(`
      SELECT DISTINCT player_id FROM trading_credential_vault
      WHERE dex = 'qfex' AND credential_id = ? AND deleted = 0
      ORDER BY player_id
    `).all(credentialId).map(row => row.player_id);
  }

  async function runOnce() {
    if (running) return { skipped: 'already_running' };
    running = true;
    const summary = { players: 0, synced: 0, imported: 0, missing: 0, failed: 0 };
    try {
      for (const playerId of playersWithCredentials()) {
        summary.players++;
        const player = getPlayer(playerId);
        let credentials = null;
        try {
          credentials = player ? parseQfexCredentials(vault.readForPlayer(playerId, credentialId)?.value) : null;
        } catch {
          credentials = null;
        }
        if (!credentials) {
          summary.missing++;
          continue;
        }
        try {
          const result = await reconcile(player, { dex: 'qfex', reason: 'vault_sync', credentials, limit });
          if (result?.ok === false) {
            summary.failed++;
            log.warn(`[qfex-vault-sync] player=${player.name || playerId} failed: ${String(result.error || result.skipped || result.code || 'unknown').slice(0, 160)}`);
          } else {
            summary.synced++;
            summary.imported += Number(result?.imported || 0);
          }
        } catch (error) {
          summary.failed++;
          log.warn(`[qfex-vault-sync] player=${player.name || playerId} error: ${String(error?.message || error).slice(0, 160)}`);
        }
      }
      return summary;
    } finally {
      running = false;
    }
  }

  function start({ intervalMs = DEFAULT_INTERVAL_MS, initialDelayMs = 90_000 } = {}) {
    const tick = () => runOnce()
      .then(result => {
        if (result.players) log.log('[qfex-vault-sync]', result);
      })
      .catch(error => log.warn('[qfex-vault-sync] run failed:', error?.message || error));
    setTimeout(tick, initialDelayMs).unref?.();
    setInterval(tick, intervalMs).unref?.();
  }

  return { runOnce, start, playersWithCredentials };
}

module.exports = { createQfexVaultSync, parseQfexCredentials, QFEX_STORAGE_KEY };
