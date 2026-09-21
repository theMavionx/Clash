'use strict';
const integer = value => {
  if (typeof value !== 'string' || !/^\d{1,100}$/.test(value)) throw new Error('INVALID_LEDGER_AMOUNT');
  return value;
};
const timestamp = value => Number.isSafeInteger(value) && value > 0 ? value : null;
/** Explicit admin projection: never expose transaction bytes, auth tokens or secrets. */
function ledgerRow(row) {
  const p = JSON.parse(row.payload);
  return { id: row.id, wallet: row.wallet, status: row.status,
    destination: p.destination, inputUnits: integer(p.inputUnits), outputUnits: integer(p.outputUnits),
    feeLamports: integer(p.feeLamports), targetToken: p.targetToken, targetDecimals: p.targetDecimals,
    depositHash: p.depositHash || null, payoutHash: p.payoutHash || null,
    createdAt: row.created_at, updatedAt: row.updated_at,
    depositedAt: timestamp(p.depositedAt), paidAt: timestamp(p.paidAt), errorCode: p.errorCode || null };
}
/** Paginated, exact-integer ledger over all persisted requests, including old history. */
function readMigrationLedger(db, { wallet = '', page = 1 } = {}) {
  if (typeof wallet !== 'string' || (wallet && !/^[1-9A-HJ-NP-Za-km-z]{32,44}$/.test(wallet)))
    throw new Error('INVALID_LEDGER_FILTER');
  const pageNumber = Number(page);
  if (!Number.isSafeInteger(pageNumber) || pageNumber < 1 || pageNumber > 1000000)
    throw new Error('INVALID_LEDGER_PAGE');
  const where = wallet ? ' WHERE wallet=?' : '', args = wallet ? [wallet] : [];
  const summary = { requests: 0, confirmedDeposits: 0, confirmedInputUnits: '0', confirmedFeeLamports: '0',
    paidRequests: 0, wallets: 0, payouts: [] };
  const payouts = new Map();
  for (const row of db.prepare('SELECT * FROM migration_requests' + where).iterate(...args)) {
    const item = ledgerRow(row);
    summary.requests++;
    if (item.depositedAt) {
      summary.confirmedDeposits++;
      summary.confirmedInputUnits = String(BigInt(summary.confirmedInputUnits) + BigInt(item.inputUnits));
      summary.confirmedFeeLamports = String(BigInt(summary.confirmedFeeLamports) + BigInt(item.feeLamports));
    }
    if (item.status === 'paid' && item.paidAt) {
      summary.paidRequests++;
      const key = `${item.targetToken}:${item.targetDecimals}`;
      const total = payouts.get(key) || { targetToken: item.targetToken, decimals: item.targetDecimals, units: '0' };
      total.units = String(BigInt(total.units) + BigInt(item.outputUnits));
      payouts.set(key, total);
    }
  }
  summary.wallets = db.prepare('SELECT count(DISTINCT wallet) n FROM migration_requests' + where).get(...args).n;
  summary.payouts = [...payouts.values()];
  const pageSize = 50;
  const requests = db.prepare('SELECT * FROM migration_requests' + where + ' ORDER BY created_at DESC,id DESC LIMIT ? OFFSET ?')
    .all(...args, pageSize, (pageNumber - 1) * pageSize).map(ledgerRow);
  return { page: pageNumber, pageSize, pages: Math.max(1, Math.ceil(summary.requests / pageSize)), summary, requests };
}
module.exports = { readMigrationLedger };
