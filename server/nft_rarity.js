const crypto = require('crypto');

function collectionSlug(collection) {
  return String(collection?.slug || collection || 'collection').trim().toLowerCase();
}

function collectionMintRaritySeed(collection) {
  const slug = collectionSlug(collection);
  const envKey = `NFT_${slug.toUpperCase()}_RARITY_REVEAL_SEED`;
  return String(process.env[envKey] || process.env.NFT_RARITY_REVEAL_SEED || '').trim()
    || `clash-${slug}-rarity-v1`;
}

function collectionMintRarity(collection, chain, tokenId, entropy = {}) {
  const slug = collectionSlug(collection);
  const seed = collectionMintRaritySeed(slug);
  const tx = String(entropy.tx || '').trim().toLowerCase();
  const reservationId = String(entropy.reservationId || '').trim().toLowerCase();
  const buyer = String(entropy.buyer || '').trim().toLowerCase();
  const hash = crypto.createHash('sha256')
    .update([
      seed,
      slug,
      String(chain || '').toLowerCase(),
      String(tokenId),
      tx,
      reservationId,
      buyer,
    ].join('|'))
    .digest('hex');
  const bucket = Number.parseInt(hash.slice(0, 8), 16) / 0x100000000;
  if (bucket < 0.10) return 'legendary';
  if (bucket < 0.40) return 'epic';
  return 'common';
}

module.exports = {
  collectionMintRarity,
  collectionMintRaritySeed,
};
