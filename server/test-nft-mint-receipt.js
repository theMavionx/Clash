const assert = require('assert');
const {
  ERC721_TRANSFER_TOPIC,
  extractErc721MintTokenIds,
  normalizeConfirmedMintTxs,
  resolveEvmMintTokenIds,
} = require('./nft_mint_receipt');

const contract = '0xeff4ed14b1288a2733b85cc165c416b2a4f1e468';
const buyer = '0x1393ffefdd7a8ebda633f35c62977266a0c51493';
const topicAddress = (address) => `0x${address.slice(2).padStart(64, '0')}`;
const tokenTopic = (tokenId) => `0x${BigInt(tokenId).toString(16).padStart(64, '0')}`;
const transferLog = (to, tokenId, address = contract) => ({
  address,
  topics: [
    ERC721_TRANSFER_TOPIC,
    topicAddress('0x0000000000000000000000000000000000000000'),
    topicAddress(to),
    tokenTopic(tokenId),
  ],
});

const receipt = {
  status: '0x1',
  logs: [
    transferLog('0x1111111111111111111111111111111111111111', 7),
    transferLog(buyer, 18),
  ],
};

assert.deepEqual(normalizeConfirmedMintTxs([{
  tx: '0xabc',
  reservationId: 'reservation-1',
  chain: 'BASE',
  quantity: 1,
  tokenIds: ['18'],
  buyer,
  payment: 'usdc',
  confirmedAt: '2026-07-21T13:35:40.518Z',
}]), [{
  tx: '0xabc',
  reservationId: 'reservation-1',
  chain: 'base',
  quantity: 1,
  tokenIds: ['18'],
  buyer,
  payment: 'usdc',
  confirmedAt: '2026-07-21T13:35:40.518Z',
}]);

assert.deepEqual(extractErc721MintTokenIds(receipt, {
  contract,
  recipient: buyer,
  quantity: 1,
}), ['18']);

assert.throws(() => extractErc721MintTokenIds({ ...receipt, status: '0x0' }, {
  contract,
  recipient: buyer,
  quantity: 1,
}), /failed on-chain/);

assert.throws(() => extractErc721MintTokenIds(receipt, {
  contract,
  recipient: buyer,
  quantity: 2,
}), /expected 2/);

(async () => {
  const tokenIds = await resolveEvmMintTokenIds({
    chain: 'base',
    txHash: '0x266853a507e6a5d165808a8be88bc2d8aa994b1c69906b5a9ba6706852604663',
    contract,
    recipient: buyer,
    quantity: 1,
    rpcCall: async (chain, method) => {
      assert.equal(chain, 'base');
      assert.equal(method, 'eth_getTransactionReceipt');
      return receipt;
    },
  });
  assert.deepEqual(tokenIds, ['18']);
  console.log('NFT mint receipt tests passed');
})().catch((error) => {
  console.error(error);
  process.exitCode = 1;
});
