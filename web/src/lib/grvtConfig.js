import { defineChain } from 'viem';

export const GRVT_CHAIN_ID = Number(import.meta.env.VITE_GRVT_CHAIN_ID || 325);
export const GRVT_CHAIN_ID_HEX = `0x${GRVT_CHAIN_ID.toString(16)}`;
export const GRVT_CHAIN_NAME = String(import.meta.env.VITE_GRVT_CHAIN_NAME || 'GRVT Exchange').trim();
export const GRVT_RPC_URLS = String(import.meta.env.VITE_GRVT_RPC_URLS || import.meta.env.VITE_GRVT_RPC_URL || 'https://rpc.grvt.io')
  .split(',')
  .map(s => s.trim())
  .filter(Boolean);
export const GRVT_EXPLORER_URL = String(import.meta.env.VITE_GRVT_EXPLORER_URL || 'https://explorer.grvt.io').trim();

export const grvtChain = defineChain({
  id: GRVT_CHAIN_ID,
  name: GRVT_CHAIN_NAME,
  nativeCurrency: { name: 'ETH', symbol: 'ETH', decimals: 18 },
  rpcUrls: {
    default: { http: GRVT_RPC_URLS },
  },
  blockExplorers: {
    default: { name: 'GRVT Explorer', url: GRVT_EXPLORER_URL },
  },
});

export async function ensureGrvtChain(provider) {
  if (!provider?.request) throw new Error('No EVM wallet connected');
  const current = await provider.request({ method: 'eth_chainId' }).catch(() => null);
  if (String(current || '').toLowerCase() === GRVT_CHAIN_ID_HEX) return;

  const delay = (ms) => new Promise(resolve => setTimeout(resolve, ms));
  const verify = async () => {
    for (let i = 0; i < 5; i += 1) {
      const next = await provider.request({ method: 'eth_chainId' }).catch(() => null);
      if (String(next || '').toLowerCase() === GRVT_CHAIN_ID_HEX) return;
      if (i < 4) await delay(120);
    }
    throw new Error('Wallet is not on GRVT Exchange. Switch to GRVT Exchange and retry.');
  };

  try {
    await provider.request({
      method: 'wallet_switchEthereumChain',
      params: [{ chainId: GRVT_CHAIN_ID_HEX }],
    });
    await verify();
  } catch (err) {
    if (err?.code !== 4902 && err?.data?.originalError?.code !== 4902 && !/unrecognized|not been added/i.test(err?.message || '')) {
      throw err;
    }
    await provider.request({
      method: 'wallet_addEthereumChain',
      params: [{
        chainId: GRVT_CHAIN_ID_HEX,
        chainName: GRVT_CHAIN_NAME,
        nativeCurrency: { name: 'ETH', symbol: 'ETH', decimals: 18 },
        rpcUrls: GRVT_RPC_URLS,
        blockExplorerUrls: [GRVT_EXPLORER_URL],
      }],
    });
    await provider.request({
      method: 'wallet_switchEthereumChain',
      params: [{ chainId: GRVT_CHAIN_ID_HEX }],
    }).catch(() => {});
    await verify();
  }
}
