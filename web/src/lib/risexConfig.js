import { defineChain } from 'viem';

export const RISE_CHAIN_ID = Number(import.meta.env.VITE_RISE_CHAIN_ID || 4153);
export const RISE_CHAIN_ID_HEX = `0x${RISE_CHAIN_ID.toString(16)}`;
export const RISE_RPC_URLS = String(import.meta.env.VITE_RISE_RPC_URLS || import.meta.env.VITE_RISE_RPC_URL || 'https://rpc.risechain.com')
  .split(',')
  .map(s => s.trim())
  .filter(Boolean);
export const RISE_WS_URL = String(import.meta.env.VITE_RISE_WS_URL || 'wss://rpc.risechain.com/ws').trim();
export const RISE_EXPLORER_URL = String(import.meta.env.VITE_RISE_EXPLORER_URL || 'https://explorer.risechain.com').trim();

export const RISEX_API_BASE = String(import.meta.env.VITE_RISEX_API_URL || '').trim() || '/api/futures/risex';
export const RISEX_ROUTER_ADDRESS = '0xaadde0cea454f2bcb26f46ed54c5709b7bb34a7e';
export const RISEX_AUTH_ADDRESS = '0x0d919daa3f12ae715744eb648c00066c5dbd66f0';
export const RISEX_USDC_ADDRESS = '0xe436820ba0c69702c1d3e601d421c0ef38262739';
export const RISEX_USDC_DECIMALS = 6;
export const RISEX_BRIDGE_URL = String(import.meta.env.VITE_RISEX_BRIDGE_URL || 'https://www.rise.trade/en').trim();
export const RISEX_DEFAULT_DEPOSIT_SOURCE_CHAIN_ID = Number(import.meta.env.VITE_RISEX_DEFAULT_DEPOSIT_SOURCE_CHAIN_ID || 42161);

export const RISEX_BRIDGE_CHAINS = Object.freeze([
  {
    id: 42161,
    key: 'arbitrum',
    name: 'Arbitrum',
    shortName: 'ARB',
    lzEid: 30110,
    usdc: '0xaf88d065e77c8cc2239327c5edb3a432268e5831',
  },
  {
    id: 8453,
    key: 'base',
    name: 'Base',
    shortName: 'BASE',
    lzEid: 30184,
    usdc: '0x833589fcd6edb6e08f4c7c32d4f71b54bda02913',
  },
  {
    id: 1,
    key: 'ethereum',
    name: 'Ethereum',
    shortName: 'ETH',
    lzEid: 30101,
    usdc: '0xa0b86991c6218b36c1d19d4a2e9eb0ce3606eb48',
  },
]);

export const RISEX_BRIDGE_CHAIN_BY_ID = Object.freeze(
  Object.fromEntries(RISEX_BRIDGE_CHAINS.map(chain => [chain.id, chain])),
);

export const RISEX_USDC_ABI = [
  {
    type: 'function',
    name: 'balanceOf',
    stateMutability: 'view',
    inputs: [{ name: 'account', type: 'address' }],
    outputs: [{ type: 'uint256' }],
  },
  {
    type: 'function',
    name: 'transfer',
    stateMutability: 'nonpayable',
    inputs: [
      { name: 'to', type: 'address' },
      { name: 'amount', type: 'uint256' },
    ],
    outputs: [{ type: 'bool' }],
  },
];

export const riseChain = defineChain({
  id: RISE_CHAIN_ID,
  name: 'RISE',
  nativeCurrency: { name: 'ETH', symbol: 'ETH', decimals: 18 },
  rpcUrls: {
    default: {
      http: RISE_RPC_URLS,
      webSocket: RISE_WS_URL ? [RISE_WS_URL] : undefined,
    },
  },
  blockExplorers: {
    default: {
      name: 'RISE Explorer',
      url: RISE_EXPLORER_URL,
    },
  },
  contracts: {
    multicall3: { address: '0xcA11bde05977b3631167028862bE2a173976CA11' },
  },
});

export async function ensureRiseChain(provider) {
  if (!provider) throw new Error('No EVM wallet connected');
  const current = await provider.request({ method: 'eth_chainId' });
  if (String(current).toLowerCase() === RISE_CHAIN_ID_HEX) return;
  const delay = (ms) => new Promise(resolve => setTimeout(resolve, ms));
  const verify = async () => {
    for (let i = 0; i < 5; i += 1) {
      const next = await provider.request({ method: 'eth_chainId' }).catch(() => null);
      if (String(next || '').toLowerCase() === RISE_CHAIN_ID_HEX) return;
      if (i < 4) await delay(120);
    }
    throw new Error('Wallet is not on RISE. Switch to RISE and retry.');
  };
  try {
    await provider.request({
      method: 'wallet_switchEthereumChain',
      params: [{ chainId: RISE_CHAIN_ID_HEX }],
    });
    await verify();
  } catch (err) {
    if (err?.code === 4902 || /unrecognized|not been added/i.test(err?.message || '')) {
      await provider.request({
        method: 'wallet_addEthereumChain',
        params: [{
          chainId: RISE_CHAIN_ID_HEX,
          chainName: 'RISE',
          nativeCurrency: { name: 'ETH', symbol: 'ETH', decimals: 18 },
          rpcUrls: RISE_RPC_URLS,
          blockExplorerUrls: [RISE_EXPLORER_URL],
        }],
      });
      await provider.request({
        method: 'wallet_switchEthereumChain',
        params: [{ chainId: RISE_CHAIN_ID_HEX }],
      }).catch(() => {});
      await verify();
      return;
    }
    throw err;
  }
}
