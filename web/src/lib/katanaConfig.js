import { defineChain } from 'viem';

export const KATANA_CHAIN_ID = 747474;
export const KATANA_CHAIN_ID_HEX = `0x${KATANA_CHAIN_ID.toString(16)}`;
export const KATANA_CHAIN_NAME = 'Katana';
export const KATANA_RPC_URLS = ['https://rpc.katana.network/'];
export const KATANA_EXPLORER_URL = 'https://katanascan.com';
export const KATANA_PERPS_REFERRAL_CODE = String(import.meta.env.VITE_KATANA_PERPS_REFERRAL_CODE || 'CLASHOFPERPS').trim();
export const KATANA_PERPS_APP_URL = 'https://perps.katana.network';
export const KATANA_PERPS_REFERRAL_URL = `${KATANA_PERPS_APP_URL}/r/${encodeURIComponent(KATANA_PERPS_REFERRAL_CODE)}`;

export const katanaChain = defineChain({
  id: KATANA_CHAIN_ID,
  name: KATANA_CHAIN_NAME,
  nativeCurrency: { name: 'ETH', symbol: 'ETH', decimals: 18 },
  rpcUrls: {
    default: { http: KATANA_RPC_URLS },
  },
  blockExplorers: {
    default: { name: 'Katanascan', url: KATANA_EXPLORER_URL },
  },
});

export async function ensureKatanaChain(provider) {
  if (!provider?.request) throw new Error('No EVM wallet connected');
  const current = await provider.request({ method: 'eth_chainId' }).catch(() => null);
  if (String(current || '').toLowerCase() === KATANA_CHAIN_ID_HEX) return;

  const verify = async () => {
    for (let i = 0; i < 5; i += 1) {
      const next = await provider.request({ method: 'eth_chainId' }).catch(() => null);
      if (String(next || '').toLowerCase() === KATANA_CHAIN_ID_HEX) return;
      if (i < 4) await new Promise(resolve => setTimeout(resolve, 120));
    }
    throw new Error('Wallet is not on Katana. Switch to Katana and retry.');
  };

  try {
    await provider.request({
      method: 'wallet_switchEthereumChain',
      params: [{ chainId: KATANA_CHAIN_ID_HEX }],
    });
    await verify();
  } catch (err) {
    if (err?.code !== 4902 && err?.data?.originalError?.code !== 4902 && !/unrecognized|not been added/i.test(err?.message || '')) {
      throw err;
    }
    await provider.request({
      method: 'wallet_addEthereumChain',
      params: [{
        chainId: KATANA_CHAIN_ID_HEX,
        chainName: KATANA_CHAIN_NAME,
        nativeCurrency: { name: 'ETH', symbol: 'ETH', decimals: 18 },
        rpcUrls: KATANA_RPC_URLS,
        blockExplorerUrls: [KATANA_EXPLORER_URL],
      }],
    });
    await provider.request({
      method: 'wallet_switchEthereumChain',
      params: [{ chainId: KATANA_CHAIN_ID_HEX }],
    }).catch(() => {});
    await verify();
  }
}
