'use strict';

// Background Throne fill sync from server-stored credentials (mirrors qfex_vault_sync).
//
// Orderly fills of orders placed through Clash are imported while the player has the game
// open. A close placed right before leaving would otherwise wait for the next visit. This
// job reads each player's Throne Orderly key from the trading credential vault and runs the
// same reconciliation as the browser path. Reward proof is unchanged: only fills of our own
// accepted orders on accounts registered under broker `throne` are credited.
//
// Never logs credential values; only player names and import counts.

const { tradingCredentialId } = require('./trading_credential_vault');

const THRONE_STORAGE_KEY = 'clash_throne_credentials_v1';
const DEFAULT_INTERVAL_MS = 5 * 60 * 1000;
const DEFAULT_LIMIT = 25;

function parseThroneCredentials(value) {
  let raw = value;
  for (let i = 0; i < 2 && typeof raw === 'string'; i++) {
    try { raw = JSON.parse(raw); } catch { return null; }
  }
  if (raw && typeof raw === 'object' && raw.value && !raw.orderlyKey) {
    raw = raw.value;
    if (typeof raw === 'string') { try { raw = JSON.parse(raw); } catch { return null; } }
  }
  const accountId = String(raw?.accountId || '').trim();
  const orderlyKey = String(raw?.orderlyKey || '').trim();
  const orderlySecret = String(raw?.orderlySecret || '').trim();
  const address = String(raw?.address || '').trim();
  if (!accountId || !orderlyKey || !orderlySecret || !address) return null;
  return { accountId, orderlyKey, orderlySecret, address };
}

function createThroneVaultSync({ db, vault, getPlayer, reconcile, limit = DEFAULT_LIMIT, log = console }) {
  const credentialId = tradingCredentialId(THRONE_STORAGE_KEY);
  let running = false;

  function playersWithCredentials() {
    return db.prepare(`
      SELECT DISTINCT player_id FROM trading_credential_vault
      WHERE dex = 'throne' AND credential_id = ? AND deleted = 0
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
          credentials = player ? parseThroneCredentials(vault.readForPlayer(playerId, credentialId)?.value) : null;
        } catch {
          credentials = null;
        }
        if (!credentials) { summary.missing++; continue; }
        try {
          const result = await reconcile(player, { dex: 'throne', reason: 'vault_sync', credentials, limit });
          if (result?.ok === false) {
            summary.failed++;
            log.warn(`[throne-vault-sync] player=${player.name || playerId} failed: ${String(result.error || result.skipped || result.code || 'unknown').slice(0, 160)}`);
          } else {
            summary.synced++;
            summary.imported += Number(result?.imported || 0);
          }
        } catch (error) {
          summary.failed++;
          log.warn(`[throne-vault-sync] player=${player.name || playerId} error: ${String(error?.message || error).slice(0, 160)}`);
        }
      }
      return summary;
    } finally {
      running = false;
    }
  }

  function start({ intervalMs = DEFAULT_INTERVAL_MS, initialDelayMs = 120_000 } = {}) {
    const tick = () => runOnce()
      .then(result => { if (result.players) log.log('[throne-vault-sync]', result); })
      .catch(error => log.warn('[throne-vault-sync] run failed:', error?.message || error));
    setTimeout(tick, initialDelayMs).unref?.();
    setInterval(tick, intervalMs).unref?.();
  }

  return { runOnce, start, playersWithCredentials };
}

module.exports = { createThroneVaultSync, parseThroneCredentials, THRONE_STORAGE_KEY };
