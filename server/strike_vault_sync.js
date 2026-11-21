'use strict';

// Background Strike fill sync from server-stored credentials (mirrors qfex_vault_sync).
//
// Strike fills of orders placed through Clash are imported while the player has the game
// open. A close placed right before leaving would otherwise wait for the next visit. This
// job reads each player's Strike API wallet key from the trading credential vault and runs
// the same reconciliation as the browser path. Reward proof is unchanged: only fills of our
// own accepted orders that Strike reports under builder code clashofperps are credited.
//
// Never logs credential values; only player names and import counts.

const { tradingCredentialId } = require('./trading_credential_vault');

const STRIKE_STORAGE_KEY = 'clash_strike_credentials_v1';
const DEFAULT_INTERVAL_MS = 5 * 60 * 1000;
const DEFAULT_LIMIT = 25;

function parseStrikeCredentials(value) {
  let raw = value;
  for (let i = 0; i < 2 && typeof raw === 'string'; i++) {
    try { raw = JSON.parse(raw); } catch { return null; }
  }
  if (raw && typeof raw === 'object' && raw.value && !raw.privateKey) {
    raw = raw.value;
    if (typeof raw === 'string') { try { raw = JSON.parse(raw); } catch { return null; } }
  }
  const accountId = String(raw?.accountId || '').trim();
  const publicKey = String(raw?.publicKey || '').trim();
  const privateKey = String(raw?.privateKey || '').trim();
  const address = String(raw?.address || '').trim();
  if (!accountId || !publicKey || !privateKey || !address) return null;
  return { accountId, publicKey, privateKey, address };
}

function createStrikeVaultSync({ db, vault, getPlayer, reconcile, limit = DEFAULT_LIMIT, log = console }) {
  const credentialId = tradingCredentialId(STRIKE_STORAGE_KEY);
  let running = false;

  function playersWithCredentials() {
    return db.prepare(`
      SELECT DISTINCT player_id FROM trading_credential_vault
      WHERE dex = 'strike' AND credential_id = ? AND deleted = 0
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
          credentials = player ? parseStrikeCredentials(vault.readForPlayer(playerId, credentialId)?.value) : null;
        } catch {
          credentials = null;
        }
        if (!credentials) { summary.missing++; continue; }
        try {
          const result = await reconcile(player, { dex: 'strike', reason: 'vault_sync', credentials, limit });
          if (result?.ok === false) {
            summary.failed++;
            log.warn(`[strike-vault-sync] player=${player.name || playerId} failed: ${String(result.error || result.skipped || result.code || 'unknown').slice(0, 160)}`);
          } else {
            summary.synced++;
            summary.imported += Number(result?.imported || 0);
          }
        } catch (error) {
          summary.failed++;
          log.warn(`[strike-vault-sync] player=${player.name || playerId} error: ${String(error?.message || error).slice(0, 160)}`);
        }
      }
      return summary;
    } finally {
      running = false;
    }
  }

  function start({ intervalMs = DEFAULT_INTERVAL_MS, initialDelayMs = 120_000 } = {}) {
    const tick = () => runOnce()
      .then(result => { if (result.players) log.log('[strike-vault-sync]', result); })
      .catch(error => log.warn('[strike-vault-sync] run failed:', error?.message || error));
    setTimeout(tick, initialDelayMs).unref?.();
    setInterval(tick, intervalMs).unref?.();
  }

  return { runOnce, start, playersWithCredentials };
}

module.exports = { createStrikeVaultSync, parseStrikeCredentials, STRIKE_STORAGE_KEY };
