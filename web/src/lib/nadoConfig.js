import { defineChain } from 'viem';

export const INK_CHAIN_ID = Number(import.meta.env.VITE_INK_CHAIN_ID || 57073);
export const INK_CHAIN_ID_HEX = `0x${INK_CHAIN_ID.toString(16)}`;
export const INK_RPC_URLS = String(import.meta.env.VITE_INK_RPC_URLS || import.meta.env.VITE_INK_RPC_URL || 'https://rpc-gel.inkonchain.com,https://rpc-qnd.inkonchain.com,https://ink.drpc.org')
  .split(',')
  .map(s => s.trim())
  .filter(Boolean);
export const INK_EXPLORER_URL = String(import.meta.env.VITE_INK_EXPLORER_URL || 'https://explorer.inkonchain.com').trim();

export const NADO_CHAIN_ENV = 'inkMainnet';
export const NADO_SUBACCOUNT_NAME = String(import.meta.env.VITE_NADO_SUBACCOUNT_NAME || 'default').trim() || 'default';
export const NADO_BUILDER_ID = Number(import.meta.env.VITE_NADO_BUILDER_ID || 3600);
// Nado expects builder fee rate in 0.1 bps units: 10 = 1 bps = 0.01%.
export const NADO_BUILDER_FEE_RATE = Number(import.meta.env.VITE_NADO_BUILDER_FEE_RATE || 10);
export const NADO_QUOTE_PRODUCT_ID = 0;
export const NADO_QUOTE_TOKEN_ADDRESS = '0x0200C29006150606B650577BBE7B6248F58470c1';
export const NADO_QUOTE_TOKEN_SYMBOL = 'USDt0';
export const NADO_QUOTE_TOKEN_DECIMALS = 6;
export const NADO_USDC_PRODUCT_ID = 5;
export const NADO_USDC_TOKEN_ADDRESS = '0x2D270e6886d130D724215A266106e6832161EAEd';
export const NADO_USDC_TOKEN_SYMBOL = 'USDC';
export const NADO_USDC_TOKEN_DECIMALS = 6;
export const NADO_DEPOSIT_ASSETS = [
  {
    id: 'usdt0',
    label: NADO_QUOTE_TOKEN_SYMBOL,
    productId: NADO_QUOTE_PRODUCT_ID,
    address: NADO_QUOTE_TOKEN_ADDRESS,
    decimals: NADO_QUOTE_TOKEN_DECIMALS,
  },
  {
    id: 'usdc',
    label: NADO_USDC_TOKEN_SYMBOL,
    productId: NADO_USDC_PRODUCT_ID,
    address: NADO_USDC_TOKEN_ADDRESS,
    decimals: NADO_USDC_TOKEN_DECIMALS,
  },
];

export const NADO_USDT_ABI = [
  {
    type: 'function',
    name: 'balanceOf',
    stateMutability: 'view',
    inputs: [{ name: 'account', type: 'address' }],
    outputs: [{ type: 'uint256' }],
  },
  {
    type: 'function',
    name: 'allowance',
    stateMutability: 'view',
    inputs: [
      { name: 'owner', type: 'address' },
      { name: 'spender', type: 'address' },
    ],
    outputs: [{ type: 'uint256' }],
  },
  {
    type: 'function',
    name: 'approve',
    stateMutability: 'nonpayable',
    inputs: [
      { name: 'spender', type: 'address' },
      { name: 'amount', type: 'uint256' },
    ],
    outputs: [{ type: 'bool' }],
  },
];

export const inkChain = defineChain({
  id: INK_CHAIN_ID,
  name: 'Ink',
  nativeCurrency: { name: 'ETH', symbol: 'ETH', decimals: 18 },
  rpcUrls: {
    default: { http: INK_RPC_URLS },
  },
  blockExplorers: {
    default: { name: 'Ink Explorer', url: INK_EXPLORER_URL },
  },
  contracts: {
    multicall3: { address: '0xcA11bde05977b3631167028862bE2a173976CA11' },
  },
});

export async function ensureInkChain(provider) {
  if (!provider) throw new Error('No EVM wallet connected');
  const current = await provider.request({ method: 'eth_chainId' });
  if (String(current).toLowerCase() === INK_CHAIN_ID_HEX) return;
  const delay = (ms) => new Promise(resolve => setTimeout(resolve, ms));
  const verify = async () => {
    for (let i = 0; i < 5; i += 1) {
      const next = await provider.request({ method: 'eth_chainId' }).catch(() => null);
      if (String(next || '').toLowerCase() === INK_CHAIN_ID_HEX) return;
      if (i < 4) await delay(120);
    }
    throw new Error('Wallet is not on Ink. Switch to Ink and retry.');
    
  };
  try {
    await provider.request({
      method: 'wallet_switchEthereumChain',
      params: [{ chainId: INK_CHAIN_ID_HEX }],
    });
    await verify();
  } catch (err) {
    if (err?.code === 4902 || /unrecognized|not been added/i.test(err?.message || '')) {
      await provider.request({
        method: 'wallet_addEthereumChain',
        params: [{
          chainId: INK_CHAIN_ID_HEX,
          chainName: 'Ink',
          nativeCurrency: { name: 'ETH', symbol: 'ETH', decimals: 18 },
          rpcUrls: INK_RPC_URLS,
          blockExplorerUrls: [INK_EXPLORER_URL],
        }],
      });
      await provider.request({
        method: 'wallet_switchEthereumChain',
        params: [{ chainId: INK_CHAIN_ID_HEX }],
      }).catch(() => {});
      await verify();
      return;
    }
    throw err;
  }
}
