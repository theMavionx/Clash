// Deliberately excludes error messages, signatures, transaction bytes and wallet secrets.
export function walletKind(name = '') {
  const n = String(name).toLowerCase();
  return n.includes('seeker') ? 'seeker' : n.includes('mobile') ? 'mobile' :
    n.includes('phantom') ? 'phantom' : n.includes('solflare') ? 'solflare' : 'other';
}
export function reportMigrationStage(token, id, stage, { adapter, elapsedMs, errorCode } = {}, fetchImpl = fetch) {
  if (!token || !id) return;
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), 3000);
  // Best effort: never await telemetry on the money path or retry a financial action because it failed.
  Promise.resolve().then(() => fetchImpl('/api/migration/client-events', {
    method: 'POST', keepalive: true, signal: controller.signal,
    headers: { Authorization: 'Bearer ' + token, 'Content-Type': 'application/json' },
    body: JSON.stringify({ id, stage, adapter: walletKind(adapter), elapsedMs, errorCode }),
  })).catch(() => {}).finally(() => clearTimeout(timer));
}
