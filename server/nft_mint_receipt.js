const ERC721_TRANSFER_TOPIC = '0xddf252ad1be2c89b69c2b068fc378daa952ba7f163c4a11628f55a4df523b3ef';
const ZERO_ADDRESS = '0x0000000000000000000000000000000000000000';

function normalizeEvmAddress(value) {
  const text = String(value || '').trim().toLowerCase();
  return /^0x[0-9a-f]{40}$/.test(text) ? text : '';
}

function addressFromTopic(topic) {
  const text = String(topic || '').trim().toLowerCase();
  if (!/^0x[0-9a-f]{64}$/.test(text)) return '';
  return `0x${text.slice(-40)}`;
}

function successfulReceipt(receipt) {
  const status = receipt?.status;
  return status === 'success' || status === '0x1' || status === 1 || status === true;
}

function normalizeConfirmedMintTxs(rows, now = Date.now()) {
  return (Array.isArray(rows) ? rows : []).slice(-200).map((row) => ({
    tx: String(row?.tx || '').slice(0, 140),
    reservationId: row?.reservationId ? String(row.reservationId) : null,
    chain: row?.chain ? String(row.chain).toLowerCase() : null,
    quantity: Math.max(1, Math.floor(Number(row?.quantity || 1))),
    tokenIds: Array.isArray(row?.tokenIds)
      ? row.tokenIds.map((id) => String(id || '').trim()).filter(Boolean).slice(0, 10)
      : [],
    buyer: row?.buyer ? String(row.buyer).slice(0, 96) : null,
    payment: row?.payment ? String(row.payment).slice(0, 32) : null,
    confirmedAt: row?.confirmedAt || new Date(now).toISOString(),
  })).filter((row) => row.tx);
}

function extractErc721MintTokenIds(receipt, options = {}) {
  if (!successfulReceipt(receipt)) {
    const err = new Error('NFT mint transaction failed on-chain');
    err.status = 400;
    throw err;
  }

  const contract = normalizeEvmAddress(options.contract);
  const recipient = normalizeEvmAddress(options.recipient);
  const quantity = Math.max(1, Math.floor(Number(options.quantity || 1)));
  if (!contract) throw new Error('NFT collection contract is not configured');
  if (!recipient) throw new Error('NFT mint reservation buyer is invalid');

  const tokenIds = [];
  const seen = new Set();
  for (const log of Array.isArray(receipt?.logs) ? receipt.logs : []) {
    if (normalizeEvmAddress(log?.address) !== contract) continue;
    const topics = Array.isArray(log?.topics) ? log.topics : [];
    if (String(topics[0] || '').toLowerCase() !== ERC721_TRANSFER_TOPIC) continue;
    if (addressFromTopic(topics[1]) !== ZERO_ADDRESS) continue;
    if (addressFromTopic(topics[2]) !== recipient) continue;
    if (!/^0x[0-9a-fA-F]{64}$/.test(String(topics[3] || ''))) continue;
    let tokenId;
    try {
      tokenId = BigInt(topics[3]).toString(10);
    } catch {
      continue;
    }
    if (seen.has(tokenId)) continue;
    seen.add(tokenId);
    tokenIds.push(tokenId);
  }

  if (tokenIds.length !== quantity) {
    const err = new Error(
      `NFT mint receipt contains ${tokenIds.length} token(s) for the reserved buyer; expected ${quantity}`,
    );
    err.status = 409;
    throw err;
  }
  return tokenIds;
}

async function resolveEvmMintTokenIds(options = {}) {
  const txHash = String(options.txHash || '').trim();
  if (!/^0x[0-9a-fA-F]{64}$/.test(txHash)) {
    const err = new Error('Valid EVM mint transaction hash is required');
    err.status = 400;
    throw err;
  }
  if (typeof options.rpcCall !== 'function') throw new Error('EVM RPC call adapter is required');
  const receipt = await options.rpcCall(options.chain, 'eth_getTransactionReceipt', [txHash]);
  if (!receipt) {
    const err = new Error('NFT mint transaction is not confirmed yet');
    err.status = 409;
    throw err;
  }
  return extractErc721MintTokenIds(receipt, options);
}

module.exports = {
  ERC721_TRANSFER_TOPIC,
  normalizeConfirmedMintTxs,
  extractErc721MintTokenIds,
  resolveEvmMintTokenIds,
};
