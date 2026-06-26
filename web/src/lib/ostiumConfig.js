import { ARBITRUM_CHAIN_ID, ARBITRUM_RPC_URLS } from './gmxConfig';

export const OSTIUM_CHAIN_ID = ARBITRUM_CHAIN_ID;
export const OSTIUM_BUILDER_ADDRESS = (
  import.meta.env.VITE_OSTIUM_BUILDER_ADDRESS
  || '0xB36402e87a86206D3a114a98B53f31362291fe1B'
).trim();

function clampBuilderFee(value) {
  const fee = Number(value);
  if (!Number.isFinite(fee)) return 2;
  return Math.max(0, Math.min(50, fee));
}

export const OSTIUM_BUILDER_FEE_BPS = clampBuilderFee(
  import.meta.env.VITE_OSTIUM_BUILDER_FEE_BPS || 2,
);

export const OSTIUM_RPC_URL = (
  import.meta.env.VITE_OSTIUM_ARBITRUM_RPC_URL
  || import.meta.env.VITE_ARBITRUM_RPC_URL
  || ARBITRUM_RPC_URLS[0]
  || ''
);

export const OSTIUM_SUBGRAPH_URL = import.meta.env.VITE_OSTIUM_SUBGRAPH_URL || '';
export const OSTIUM_BUILDER_API_URL = import.meta.env.VITE_OSTIUM_BUILDER_API_URL || '';

export function ostiumClientConfig(extra = {}) {
  return {
    ...(OSTIUM_RPC_URL ? { rpcUrl: OSTIUM_RPC_URL } : {}),
    ...(OSTIUM_SUBGRAPH_URL ? { subgraphUrl: OSTIUM_SUBGRAPH_URL } : {}),
    ...(OSTIUM_BUILDER_API_URL ? { builderApiUrl: OSTIUM_BUILDER_API_URL } : {}),
    builder: {
      address: OSTIUM_BUILDER_ADDRESS,
      feeBps: OSTIUM_BUILDER_FEE_BPS,
    },
    ...extra,
  };
}
