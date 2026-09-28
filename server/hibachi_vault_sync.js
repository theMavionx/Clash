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
const DEFAULT_INTERVAL_MS = 60 * 60 * 1000;
const DEFAULT_LIMIT = 500;

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

function createHibachiVaultSync({ db, vault, getPlayer, reconcile, limit = DEFAULT_LIMIT, log = console }) {
  const credentialId = tradingCredentialId(HIBACHI_STORAGE_KEY);
  let running = false;

  function playersWithCredentials() {
    return db.prepare(`
      SELECT DISTINCT player_id FROM trading_credential_vault
      WHERE dex = 'hibachi' AND credential_id = ? AND deleted = 0
      ORDER BY player_id
    `).all(credentialId).map(row => row.player_id);
  }

  async function runOnce() {
    if (running) return { skipped: 'already_running' };
    running = true;
    const summary = { players: 0, synced: 0, imported: 0, updated: 0, missing: 0, failed: 0 };
    try {
      for (const playerId of playersWithCredentials()) {
        summary.players++;
        const player = getPlayer(playerId);
        let credentials = null;
        try {
          credentials = player ? parseCredentials(vault.readForPlayer(playerId, credentialId)?.value) : null;
        } catch {
          credentials = null;
        }
        if (!credentials) {
          summary.missing++;
          continue;
        }
        try {
          const result = await reconcile(player, {
            dex: 'hibachi',
            reason: 'vault_sync',
            credentials,
            limit,
          });
          if (result?.ok === false) {
            summary.failed++;
            log.warn(`[hibachi-vault-sync] player=${player.name || playerId} failed: ${String(result.error || result.skipped || result.code || 'unknown').slice(0, 160)}`);
          } else {
            summary.synced++;
            summary.imported += Number(result?.imported || 0);
            summary.updated += Number(result?.updated || 0);
          }
        } catch (error) {
          summary.failed++;
          log.warn(`[hibachi-vault-sync] player=${player.name || playerId} error: ${String(error?.message || error).slice(0, 160)}`);
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

module.exports = { createHibachiVaultSync, parseCredentials, HIBACHI_STORAGE_KEY };
