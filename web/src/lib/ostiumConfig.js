import { ARBITRUM_CHAIN_ID, ARBITRUM_RPC_URLS } from './gmxConfig';
import { sameOriginWsUrl } from './rpcPolicy';

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
export const OSTIUM_ALCHEMY_WS_URL = (
  import.meta.env.VITE_OSTIUM_ARBITRUM_WS_URL
  || import.meta.env.VITE_ARBITRUM_WS_URL
  || sameOriginWsUrl('/rpc/arb-alchemy-ws')
);

export const OSTIUM_SUBGRAPH_URL = (
  import.meta.env.VITE_OSTIUM_SUBGRAPH_URL
  || '/api/futures/ostium/subgraph/gn'
);
export const OSTIUM_BUILDER_API_URL = import.meta.env.VITE_OSTIUM_BUILDER_API_URL || '';
export const OSTIUM_TRADING_CALLBACKS_ADDRESS = (
  import.meta.env.VITE_OSTIUM_TRADING_CALLBACKS_ADDRESS
  || '0x7720fC8c8680bF4a1Af99d44c6c265a74e9742a9'
).trim();
export const OSTIUM_DELEGATE_MIN_ETH = (
  import.meta.env.VITE_OSTIUM_DELEGATE_MIN_ETH
  || '0.00005'
);
export const OSTIUM_DELEGATE_TARGET_ETH = (
  import.meta.env.VITE_OSTIUM_DELEGATE_TARGET_ETH
  || '0.00030'
);
export const OSTIUM_MAX_ALLOWANCE_CHECK_USD = (
  import.meta.env.VITE_OSTIUM_MAX_ALLOWANCE_CHECK_USD
  || '1000000000'
);
export const OSTIUM_ORACLE_FEE_BUFFER_USD = 0.10;

export function ostiumOracleFeeBufferMessage(maxMargin, availableBalance = null) {
  const max = Number(maxMargin);
  const available = Number(availableBalance);
  const maxText = Number.isFinite(max) ? max.toFixed(2) : '0.00';
  const balanceText = Number.isFinite(available) ? ` from your $${available.toFixed(2)} balance` : '';
  return `Ostium charges a ${OSTIUM_ORACLE_FEE_BUFFER_USD.toFixed(2)} USDC oracle fee, which is refunded upon successful full closure of the position via a market order. Use $${maxText} margin or less${balanceText}.`;
}

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
