import { reportClientEvent } from './clientLogger';

// Explicit allowlist: never serialize RPC errors, requests, signatures or keys.
const fields = ['attempt', 'stage', 'wallet', 'chain_id', 'block', 'tx_hash', 'tx_status',
  'agent_approved', 'allowance_raw', 'allowance_ready', 'required_raw', 'asset', 'failure_kind'];
export function logLeverupSetup(event, data = {}, failed = false) {
  const safe = {};
  for (const key of fields) {
    const value = data[key];
    if (['string', 'number', 'boolean', 'bigint'].includes(typeof value)) {
      safe[key] = typeof value === 'bigint' ? String(value) : value;
    }
  }
  reportClientEvent(`leverup.setup.${event}`, safe, {
    source: 'leverup.setup', message: `LeverUp setup ${event}`,
    level: failed ? 'error' : 'info', immediate: true,
  });
}
export function leverupFailureKind(error) {
  const text = String(error?.shortMessage || error?.message || '');
  if (/reject|denied|cancel/i.test(text)) return 'rejected';
  if (/allowance|approval/i.test(text)) return 'allowance';
  if (/storage|persist|key|signer is no longer/i.test(text)) return 'credential_storage';
  if (/permissions|authorization/i.test(text)) return 'agent_authorization';
  if (/account changed|wallet.*match/i.test(text)) return 'account_changed';
  if (/rpc|fetch|network|timeout|429|503/i.test(text)) return 'network';
  return 'other';
}
