'use strict';

function normalizeSubaccount(value) {
  const raw = String(value || '').trim().toLowerCase();
  if (!raw) return '';
  const hex = raw.startsWith('0x') ? raw.slice(2) : raw;
  if (!/^[0-9a-f]{1,64}$/u.test(hex)) return '';
  return `0x${hex.padStart(64, '0')}`;
}

function normalizeFillId(value) {
  return String(value ?? '').trim().toLowerCase();
}

function decibelFillClientOrderId(subaccount, fillId) {
  const account = normalizeSubaccount(subaccount);
  const id = normalizeFillId(fillId);
  if (!account || !id) return '';
  return `decibel:fill:${account}:${id}`;
}

function decibelFillClientOrderIdCandidates(subaccount, fillId) {
  const canonical = decibelFillClientOrderId(subaccount, fillId);
  const id = normalizeFillId(fillId);
  if (!canonical || !id) return [];
  return [
    canonical,
    `decibel:trade-fill:${id}`,
    `decibel:bulk-fill:${id}`,
  ];
}

function findExistingDecibelFill(store, playerId, subaccount, fillId) {
  if (typeof store?.getTradeByClientOrderId !== 'function') return null;
  for (const clientOrderId of decibelFillClientOrderIdCandidates(subaccount, fillId)) {
    const row = store.getTradeByClientOrderId(playerId, 'decibel', clientOrderId);
    if (row) return row;
  }
  return null;
}

function isCreditableDecibelFill(row) {
  return ['decibel_fill', 'server'].includes(String(row?.verified_source || '').toLowerCase());
}

module.exports = {
  normalizeSubaccount,
  normalizeFillId,
  decibelFillClientOrderId,
  decibelFillClientOrderIdCandidates,
  findExistingDecibelFill,
  isCreditableDecibelFill,
};
