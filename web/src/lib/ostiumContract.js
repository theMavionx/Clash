// Ostium on-chain primitives (Arbitrum mainnet). Mirrors avantisContract.js
// for setDelegate + USDC approve in Bots Smart Wallet flow.

import {
  ARBITRUM_CHAIN_ID,
  ARBITRUM_RPC_URLS,
  ARBITRUM_USDC_NATIVE,
  ERC20_ABI,
  ensureArbitrumChain,
} from './gmxConfig';

export { ARBITRUM_CHAIN_ID, ensureArbitrumChain, ERC20_ABI };

export const OSTIUM_CHAIN_ID = ARBITRUM_CHAIN_ID;
export const OSTIUM_PRIMARY_RPC_URL = ARBITRUM_RPC_URLS[0] || 'https://arbitrum-one.publicnode.com';

// Ostium mainnet (Arbitrum 42161) — matches phantom-adapters exchange_config::ostium
export const TRADING_ADDRESS = '0x6D0bA1f9996DBD8885827e1b2e8f6593e7702411';
export const TRADING_STORAGE_ADDRESS = '0xcCd5891083A8acD2074690F65d3024E7D13d66E7';
export const USDC_ADDRESS = ARBITRUM_USDC_NATIVE;

export const TRADING_ABI = [
  { name: 'delegations', type: 'function', stateMutability: 'view',
    inputs: [{ name: 'delegator', type: 'address' }],
    outputs: [{ type: 'address' }] },
  { name: 'setDelegate', type: 'function', stateMutability: 'nonpayable',
    inputs: [{ name: 'delegate', type: 'address' }],
    outputs: [] },
  { name: 'removeDelegate', type: 'function', stateMutability: 'nonpayable',
    inputs: [],
    outputs: [] },
];

export async function fetchOstiumDelegate(publicClient, trader) {
  if (!publicClient || !trader) return null;
  try {
    const delegate = await publicClient.readContract({
      address: TRADING_ADDRESS,
      abi: TRADING_ABI,
      functionName: 'delegations',
      args: [trader],
    });
    return delegate || null;
  } catch {
    return null;
  }
}
