import { getAddress } from 'viem';

export const NFT_GOLD_BOOST_CONTRACT = getAddress('0x145B4eA581924882e854F34630a2544b4c2Fe4bD');
export const NFT_GOLD_BOOST_BONUS_PERCENT = 20;
export const NFT_GOLD_BOOST_MESSAGE_TITLE = 'Clash of Perps NFT gold boost';
export const NFT_GOLD_BOOST_TOKEN_IDS = [24n];

export const NFT_GOLD_BOOST_ERC1155_ABI = [
  {
    name: 'balanceOf',
    type: 'function',
    stateMutability: 'view',
    inputs: [{ name: 'owner', type: 'address' }, { name: 'id', type: 'uint256' }],
    outputs: [{ type: 'uint256' }],
  },
];

export function buildNftGoldBoostMessage({ playerId, wallet, timestamp }) {
  return [
    NFT_GOLD_BOOST_MESSAGE_TITLE,
    `Player: ${playerId}`,
    `Wallet: ${getAddress(wallet)}`,
    `Contract: ${NFT_GOLD_BOOST_CONTRACT}`,
    `Timestamp: ${Number(timestamp)}`,
  ].join('\n');
}

export function shortEvmAddress(value) {
  try {
    const address = getAddress(value);
    return `${address.slice(0, 6)}...${address.slice(-4)}`;
  } catch {
    return '';
  }
}
