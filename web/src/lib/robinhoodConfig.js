import { defineChain, createPublicClient, http } from 'viem';
export const ROBINHOOD_CHAIN_ID = 4663;
export const ROBINHOOD_RPC_URL = typeof window === 'undefined' ? 'https://clashofperps.fun/api/shop/robinhood/rpc' : `${window.location.origin}/api/shop/robinhood/rpc`;
export const robinhoodChain = defineChain({ id: ROBINHOOD_CHAIN_ID, name: 'Robinhood Chain',
  nativeCurrency: { name: 'Ether', symbol: 'ETH', decimals: 18 },
  rpcUrls: { default: { http: [ROBINHOOD_RPC_URL] } },
  blockExplorers: { default: { name: 'Blockscout', url: 'https://robinhoodchain.blockscout.com' } },
});
export const robinhoodPublicClient = createPublicClient({ chain: robinhoodChain, transport: http(ROBINHOOD_RPC_URL, {
  retryCount: 0, timeout: 15000,
  fetchFn: (url, options) => {
    const headers = new Headers(options?.headers);
    headers.set('x-token', typeof window === 'undefined' ? '' : window._playerToken || '');
    return fetch(url, { ...options, headers });
  },
}) });
export async function ensureRobinhoodChain(provider) {
  try { await provider.request({ method: 'wallet_switchEthereumChain', params: [{ chainId: '0x1237' }] }); }
  catch (error) {
    if (Number(error?.code ?? error?.data?.originalError?.code) !== 4902) throw error;
    await provider.request({ method: 'wallet_addEthereumChain', params: [{ chainId: '0x1237', chainName: 'Robinhood Chain',
      nativeCurrency: { name: 'Ether', symbol: 'ETH', decimals: 18 },
      rpcUrls: ['https://rpc.mainnet.chain.robinhood.com'], blockExplorerUrls: ['https://robinhoodchain.blockscout.com'] }] });
    await provider.request({ method: 'wallet_switchEthereumChain', params: [{ chainId: '0x1237' }] });
  }
}
