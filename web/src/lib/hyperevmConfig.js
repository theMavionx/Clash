import { defineChain } from 'viem';

export const HYPEREVM_CHAIN_ID = 999;
export const HYPEREVM_CHAIN_ID_HEX = '0x3e7';
export const HYPEREVM_RPC_URLS = [
  'https://rpc.hyperliquid.xyz/evm',
];

export const hyperEvmChain = defineChain({
  id: HYPEREVM_CHAIN_ID,
  name: 'HyperEVM',
  nativeCurrency: { name: 'HYPE', symbol: 'HYPE', decimals: 18 },
  rpcUrls: {
    default: { http: HYPEREVM_RPC_URLS },
  },
  blockExplorers: {
    default: {
      name: 'HyperEVM Explorer',
      url: 'https://hyperevmscan.io',
    },
  },
});

export async function ensureHyperEvmChain(provider) {
  if (!provider) throw new Error('No EVM wallet connected');
  const current = await provider.request({ method: 'eth_chainId' });
  if (String(current).toLowerCase() === HYPEREVM_CHAIN_ID_HEX) return;
  const delay = (ms) => new Promise(resolve => setTimeout(resolve, ms));
  const verify = async () => {
    for (let i = 0; i < 5; i += 1) {
      const next = await provider.request({ method: 'eth_chainId' }).catch(() => null);
      if (String(next || '').toLowerCase() === HYPEREVM_CHAIN_ID_HEX) return;
      if (i < 4) await delay(120);
    }
    throw new Error('Wallet is not on HyperEVM. Switch to HyperEVM and retry.');
  };
  try {
    await provider.request({
      method: 'wallet_switchEthereumChain',
      params: [{ chainId: HYPEREVM_CHAIN_ID_HEX }],
    });
    await verify();
  } catch (err) {
    if (err?.code === 4902 || /unrecognized|not been added/i.test(err?.message || '')) {
      await provider.request({
        method: 'wallet_addEthereumChain',
        params: [{
          chainId: HYPEREVM_CHAIN_ID_HEX,
          chainName: 'HyperEVM',
          nativeCurrency: { name: 'HYPE', symbol: 'HYPE', decimals: 18 },
          rpcUrls: HYPEREVM_RPC_URLS,
          blockExplorerUrls: ['https://hyperevmscan.io'],
        }],
      });
      await provider.request({
        method: 'wallet_switchEthereumChain',
        params: [{ chainId: HYPEREVM_CHAIN_ID_HEX }],
      }).catch(() => {});
      await verify();
      return;
    }
    throw err;
  }
}
