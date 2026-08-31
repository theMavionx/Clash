import definitions from '../../../shared/trading_credential_catalog.json' with { type: 'json' };

const compiled = definitions.map(row => ({ ...row, regex: new RegExp(row.pattern) }));
export function describeCredential(storageKey) {
  if (typeof storageKey !== 'string' || storageKey.length > 400) return null;
  for (const row of compiled) {
    const match = row.regex.exec(storageKey);
    if (match) return { dex: row.dex, storageType: row.storageType, label: row.label,
      owner: row.ownerGroup ? match[row.ownerGroup] : null,
      playerId: row.playerGroup ? match[row.playerGroup] : null };
  }
  return null;
}
export const credentialNamesEqual = (a, b) => {
  const left = String(a || ''), right = String(b || '');
  return /^0x/i.test(left) ? left.toLowerCase() === right.toLowerCase() : left === right;
};
export function canMigrateCredential(storageKey, value, context) {
  const descriptor = describeCredential(storageKey);
  if (!descriptor || !value || !context?.playerId) return false;
  if (descriptor.playerId && descriptor.playerId !== context.playerId) return false;
  if (value.onboardingPlayerId && value.onboardingPlayerId !== context.playerId) return false;
  if (descriptor.dex === 'etoro' && value.environment !== 'real') return false;
  if (descriptor.owner && credentialNamesEqual(descriptor.owner, context.verifiedWallet)) return true;
  if (value.onboardingPlayerId === context.playerId && credentialNamesEqual(value.onboardingOwner, context.verifiedWallet)) return true;
  // Unscoped API keys need explicit confirmation. Mutable linked-account rows
  // cannot establish which player owned an older shared-browser credential.
  return false;
}
