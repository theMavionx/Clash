export function formatUnits(value, decimals = 6) {
  try {
    const units = BigInt(value || 0); const d = Math.max(0, Math.min(36, Number(decimals)));
    const sign = units < 0n ? '-' : ''; const raw = (units < 0n ? -units : units).toString().padStart(d + 1, '0');
    if (!d) return sign + raw;
    return sign + raw.slice(0, -d) + (raw.slice(-d).replace(/0+$/, '') ? '.' + raw.slice(-d).replace(/0+$/, '') : '');
  } catch { return '—'; }
}
export function parseUnits(value, decimals = 6) {
  if (!/^\d+(?:\.\d+)?$/.test(value)) return null;
  const [whole, fraction = ''] = value.split('.');
  if (fraction.length > decimals || whole.length > 40) return null;
  return BigInt(whole + fraction.padEnd(decimals, '0'));
}
export function maxMigrationAmount(account, decimals = 6) {
  if (!Number.isInteger(decimals) || decimals < 0 || decimals > 36) return '';
  const values = [account?.balanceUnits, account?.remainingUnits];
  if (!values.every(value => typeof value === 'string' && /^\d+$/.test(value))) return '';
  const [balance, remaining] = values.map(value => BigInt(value));
  const maximum = balance < remaining ? balance : remaining;
  return maximum > 0n ? formatUnits(maximum, decimals) : '';
}
export function validRequest(amount, address, account, decimals = 6) {
  const units = parseUnits(amount, decimals);
  return units !== null && units > 0n && /^0x[0-9a-fA-F]{40}$/.test(address) && !/^0x0{40}$/i.test(address)
    && units <= BigInt(account?.remainingUnits || 0) && units <= BigInt(account?.balanceUnits || 0);
}
export function expiryMs(value) {
  if (typeof value === 'number') return value < 1e12 ? value * 1000 : value;
  return Date.parse(value);
}
/** Only explicit pre-acceptance rejections release the UI's signed retry lock. */
export function depositDefinitelyRejected(error) {
  return error?.status >= 400 && error.status < 500 && [
    'INVALID_TRANSACTION', 'TRANSACTION_CHANGED', 'INVALID_SIGNATURE',
    'TREASURY_CHANGED', 'DEPOSIT_SIMULATION_FAILED', 'QUOTE_EXPIRED', 'MIGRATION_CLOSED',
  ].includes(error.code);
}
// datetime-local is a wall-clock input. Interpret it explicitly as UTC, never device time.
export function snapshotUtcIso(value, now = Date.now()) {
  if (!/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}$/.test(value || '')) return null;
  const time = Date.parse(value + ':00.000Z');
  if (!Number.isFinite(time) || time > now || new Date(time).toISOString().slice(0, 16) !== value) return null;
  return new Date(time).toISOString();
}
export function formatUtc(value) {
  const date = new Date(expiryMs(value));
  return Number.isFinite(date.getTime()) ? date.toISOString().replace('T', ' ').replace('.000Z', ' UTC') : '—';
}
/** Wall-clock picker is explicitly UTC, independent of the administrator's device timezone. */
export function deadlineUtcMs(value) {
  if (!/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}$/.test(value || '')) return null;
  const ms = Date.parse(value + ':00.000Z');
  return Number.isSafeInteger(ms) && ms > 0 && ms <= Date.UTC(2100, 0, 1) &&
    new Date(ms).toISOString().slice(0, 16) === value ? ms : null;
}
export function closingCountdown(closesAt, now) {
  if (!Number.isSafeInteger(closesAt) || closesAt <= 0 || !Number.isFinite(now)) return null;
  const seconds = Math.max(0, Math.ceil((closesAt - now) / 1000));
  const days = Math.floor(seconds / 86400);
  const clock = [Math.floor(seconds / 3600) % 24, Math.floor(seconds / 60) % 60, seconds % 60]
    .map(value => String(value).padStart(2, '0')).join(':');
  return { closed: closesAt <= now, text: (days ? days + 'd ' : '') + clock };
}
