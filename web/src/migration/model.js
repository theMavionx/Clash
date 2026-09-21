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
export function validRequest(amount, address, account, decimals = 6) {
  const units = parseUnits(amount, decimals);
  return units !== null && units > 0n && /^0x[0-9a-fA-F]{40}$/.test(address) && !/^0x0{40}$/i.test(address)
    && units <= BigInt(account?.remainingUnits || 0) && units <= BigInt(account?.balanceUnits || 0);
}
export function expiryMs(value) {
  if (typeof value === 'number') return value < 1e12 ? value * 1000 : value;
  return Date.parse(value);
}
