import { defineChain } from 'viem';

export const ARC_CHAIN_ID = Number(import.meta.env.VITE_ARC_CHAIN_ID || 5042002);
export const ARC_CHAIN_ID_HEX = `0x${ARC_CHAIN_ID.toString(16)}`;
export const ARC_CHAIN_NAME = String(import.meta.env.VITE_ARC_CHAIN_NAME || 'Arc Testnet').trim();
export const ARC_NETWORK_CTA = String(import.meta.env.VITE_ARC_NETWORK_CTA || `${ARC_CHAIN_NAME} network`).trim();
export const ARC_RPC_URLS = String(import.meta.env.VITE_ARC_RPC_URLS || import.meta.env.VITE_ARC_RPC_URL || 'https://rpc.testnet.arc.network')
  .split(',')
  .map(s => s.trim())
  .filter(Boolean);
export const ARC_WS_URL = String(import.meta.env.VITE_ARC_WS_URL || 'wss://rpc.testnet.arc.network').trim();
export const ARC_EXPLORER_URL = String(import.meta.env.VITE_ARC_EXPLORER_URL || 'https://testnet.arcscan.app').trim();

export const arcChain = defineChain({
  id: ARC_CHAIN_ID,
  name: ARC_CHAIN_NAME,
  nativeCurrency: { name: 'USDC', symbol: 'USDC', decimals: 6 },
  rpcUrls: {
    default: {
      http: ARC_RPC_URLS,
      webSocket: ARC_WS_URL ? [ARC_WS_URL] : undefined,
    },
  },
  blockExplorers: {
    default: { name: 'Arcscan', url: ARC_EXPLORER_URL },
  },
});

export async function ensureArcChain(provider) {
  if (!provider) throw new Error('No EVM wallet connected');
  const current = await provider.request({ method: 'eth_chainId' });
  if (String(current).toLowerCase() === ARC_CHAIN_ID_HEX.toLowerCase()) return;
  const delay = (ms) => new Promise(resolve => setTimeout(resolve, ms));
  const verify = async () => {
    for (let i = 0; i < 5; i += 1) {
      const next = await provider.request({ method: 'eth_chainId' }).catch(() => null);
      if (String(next || '').toLowerCase() === ARC_CHAIN_ID_HEX.toLowerCase()) return;
      if (i < 4) await delay(120);
    }
    throw new Error(`Wallet is not on Arc. Switch to ${ARC_CHAIN_NAME} and retry.`);
  };
  try {
    await provider.request({
      method: 'wallet_switchEthereumChain',
      params: [{ chainId: ARC_CHAIN_ID_HEX }],
    });
    await verify();
  } catch (err) {
    if (err?.code === 4902 || /unrecognized|not been added/i.test(err?.message || '')) {
      await provider.request({
        method: 'wallet_addEthereumChain',
        params: [{
          chainId: ARC_CHAIN_ID_HEX,
          chainName: ARC_CHAIN_NAME,
          nativeCurrency: { name: 'USDC', symbol: 'USDC', decimals: 6 },
          rpcUrls: ARC_RPC_URLS,
          blockExplorerUrls: [ARC_EXPLORER_URL],
        }],
      });
      await provider.request({
        method: 'wallet_switchEthereumChain',
        params: [{ chainId: ARC_CHAIN_ID_HEX }],
      }).catch(() => {});
      await verify();
      return;
    }
    throw err;
  }
}
