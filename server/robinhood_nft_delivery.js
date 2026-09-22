'use strict';
const crypto = require('node:crypto');
const { Connection, PublicKey, VersionedTransaction } = require('@solana/web3.js');
const { alchemySolanaRpcUrl } = require('./solana_rpc');
const { parseSolanaSecretKey } = require('./bridge_helpers');

async function context(deployment) {
  const rpc = alchemySolanaRpcUrl();
  if (!rpc || new URL(rpc).hostname !== 'solana-mainnet.g.alchemy.com') throw new Error('Paid Solana RPC unavailable');
  const secret = parseSolanaSecretKey(process.env.SOLANA_NFT_KEY || process.env.NFT_SOLANA_KEY || process.env.NFT_KEY);
  const { createUmi } = await import('@metaplex-foundation/umi-bundle-defaults');
  const umiLib = await import('@metaplex-foundation/umi');
  const core = await import('@metaplex-foundation/mpl-core');
  const umi = createUmi(rpc, { commitment: 'finalized' }).use(core.mplCore());
  umi.use(umiLib.keypairIdentity(umi.eddsa.createKeypairFromSecretKey(secret)));
  const collection = await core.fetchCollection(umi, umiLib.publicKey(deployment.collection));
  if (String(collection.updateAuthority) !== String(umi.identity.publicKey)) throw new Error('NFT collection authority mismatch');
  return { secret, umi, umiLib, core, collection, connection: new Connection(rpc, { commitment: 'finalized', fetch: (url, opts) => fetch(url, { ...opts, signal: AbortSignal.timeout(12000) }) }) };
}
async function preflight(deployment, recipient) {
  const address = new PublicKey(recipient);
  if (!PublicKey.isOnCurve(address.toBytes())) throw new Error('Recipient must be a Solana wallet');
  if (!deployment.saleActive) throw new Error('NFT sale is closed');
  const ctx = await context(deployment);
  const balance = await ctx.connection.getBalance(new PublicKey(ctx.umi.identity.publicKey), 'finalized');
  if (balance < 50_000_000) throw new Error('NFT delivery gas reserve unavailable');
  return { balance, authority: String(ctx.umi.identity.publicKey) };
}
async function deliver(deployment, row, persistSigned, { simulateOnly = false } = {}) {
  const { secret, umi, umiLib, core, collection, connection } = await context(deployment);
  const seed = crypto.createHmac('sha256', secret).update(`clash.rh-nft.asset.v1:${row.id}`).digest();
  const signer = umiLib.createSignerFromKeypair(umi, umi.eddsa.createKeypairFromSeed(seed));
  const asset = String(signer.publicKey);
  if (row.asset && row.asset !== asset) throw new Error('NFT asset signer changed; operator recovery required');
  const account = await umi.rpc.getAccount(signer.publicKey, { commitment: 'finalized' });
  const existing = account.exists ? await core.fetchAsset(umi, signer.publicKey) : null;
  if (existing) {
    const source = existing.attributes?.attributeList?.find(a => a.key === 'SourceRef')?.value;
    if (source !== `rhshop:${row.id}` || existing.updateAuthority?.address !== String(collection.publicKey)) throw new Error('NFT recovery identity mismatch');
    if (!row.delivery_tx) throw new Error('NFT exists without recorded delivery transaction');
    const status = (await connection.getSignatureStatuses([row.delivery_tx], { searchTransactionHistory: true })).value[0];
    if (!status?.err && status?.confirmationStatus === 'finalized') return { confirmed: true, asset, signature: row.delivery_tx };
    // A stale build may have landed before a replacement. The finalized
    // deterministic asset proves delivery even if the replacement failed.
    const history = await connection.getSignaturesForAddress(new PublicKey(asset), { limit: 100 }, 'finalized');
    const successful = history.filter(tx => !tx.err);
    if (!successful.length) throw new Error('Finalized NFT exists; transaction history recovery pending');
    return { confirmed: true, asset, signature: successful[successful.length-1].signature };
  }
  if (row.signed_tx) {
    const status = (await connection.getSignatureStatuses([row.delivery_tx], { searchTransactionHistory: true })).value[0];
    if (status?.confirmationStatus === 'finalized' && !status.err) {
      // The recipient may already have burned the delivered asset. Our durable,
      // pre-broadcast signed mint plus its finalized signature proves delivery.
      const sent = VersionedTransaction.deserialize(Buffer.from(row.signed_tx, 'base64'));
      const bs58 = require('bs58').default || require('bs58');
      const accounts = sent.message.staticAccountKeys.map(key => key.toBase58());
      if (bs58.encode(sent.signatures[0]) !== row.delivery_tx || !accounts.includes(asset) || !accounts.includes(row.recipient)) throw new Error('Recorded NFT transaction identity mismatch');
      return { confirmed: true, asset, signature: row.delivery_tx };
    }
    if (status && !status.err) return { confirmed: false };
    const height = await connection.getBlockHeight('finalized');
    if (height <= row.last_valid_block) {
      if (!status?.err) await connection.sendRawTransaction(Buffer.from(row.signed_tx,'base64'), { skipPreflight: false, maxRetries: 0 });
      return { confirmed: false };
    }
    // Expired attempts rebuild the SAME asset. Solana's account uniqueness
    // prevents a delayed old transaction and a new one minting two NFTs.
  }
  const source = `rhshop:${row.id}`;
  const uri = new URL('/api/nft/dragon/solana/bridged', process.env.NFT_PUBLIC_BASE_URL || 'https://clashofperps.fun');
  uri.searchParams.set('asset',asset); uri.searchParams.set('src',source);
  const plugins = [{ type: 'Attributes', attributeList: [{ key: 'SourceRef', value: source }, { key: 'Game', value: 'Clash of Perps' }, { key: 'Character', value: 'Dragon' }] }];
  if (deployment.royaltyTreasury) plugins.push({ type: 'Royalties', basisPoints: Number(deployment.royaltyBps || 250), creators: [{ address: umiLib.publicKey(deployment.royaltyTreasury), percentage: 100 }], ruleSet: { type: 'None' } });
  const blockhash = await connection.getLatestBlockhash('finalized');
  const builder = core.create(umi, { asset: signer, collection, authority: umi.identity,
    owner: umiLib.publicKey(row.recipient), name: 'Dragon', uri: uri.toString(), plugins }).setBlockhash(blockhash);
  const signed = await builder.buildAndSign(umi);
  const bytes = umi.transactions.serialize(signed);
  const raw = Buffer.from(bytes);
  const bs58 = require('bs58').default || require('bs58');
  const signature = bs58.encode(signed.signatures[0]);
  const simulated = await connection.simulateTransaction(VersionedTransaction.deserialize(raw), { sigVerify: true, commitment: 'confirmed' });
  if (simulated.value.err) throw new Error('NFT delivery simulation failed');
  if (simulateOnly) return { simulation: true, asset, unitsConsumed: simulated.value.unitsConsumed };
  persistSigned({ asset, signature, raw: raw.toString('base64'), lastValidBlockHeight: blockhash.lastValidBlockHeight });
  await connection.sendRawTransaction(raw, { skipPreflight: false, maxRetries: 0 });
  return { confirmed: false };
}
module.exports = { preflight, deliver };
