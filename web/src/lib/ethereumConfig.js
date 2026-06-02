import { mainnet } from 'viem/chains';
import { buildRpcFallbackList, envFlag, sameOriginRpcUrl, siteOrigin, splitRpcUrls } from './rpcPolicy';

export const ETHEREUM_CHAIN_ID = mainnet.id;

const ETHEREUM_FREE_RPC_PATHS = [
  'https://ethereum-rpc.publicnode.com',
  'https://eth.llamarpc.com',
];
const ETHEREUM_PAID_RPC_PATHS = [
  '/rpc/eth-alchemy',
];

const hasEthereumAlchemyProxy = typeof __ETHEREUM_ALCHEMY_PROXY_ENABLED__ === 'boolean'
  ? __ETHEREUM_ALCHEMY_PROXY_ENABLED__
  : true;

function normalizeEthereumRpcUrl(rawUrl) {
  const raw = String(rawUrl || '').trim();
  if (!raw) return '';
  if (raw.startsWith('/')) return sameOriginRpcUrl(raw);
  try {
    const url = new URL(raw, siteOrigin());
    const host = url.hostname.toLowerCase();
    const origin = new URL(siteOrigin()).origin;
    if (url.origin === origin && url.pathname.startsWith('/rpc/eth')) return url.href;
    if (host.startsWith('eth-mainnet.') && host.includes('alchemy')) return sameOriginRpcUrl('/rpc/eth-alchemy');
    if (host === 'ethereum-rpc.publicnode.com') return 'https://ethereum-rpc.publicnode.com';
    if (host === 'eth.llamarpc.com') return 'https://eth.llamarpc.com';
    if (host === 'eth.merkle.io') return '';
    return url.href;
  } catch {
    return '';
  }
}

export const ETHEREUM_RPC_URLS = (() => {
  const override = splitRpcUrls(import.meta.env.VITE_ETHEREUM_RPC_URLS || import.meta.env.VITE_ETHEREUM_RPC_URL);
  const normalizedOverride = override.map(normalizeEthereumRpcUrl).filter(Boolean);
  if (normalizedOverride.length) return normalizedOverride;
  const includeFree = envFlag(import.meta.env.VITE_ETHEREUM_ENABLE_PUBLIC_RPC, true);
  const includeAlchemy = hasEthereumAlchemyProxy
    && envFlag(import.meta.env.VITE_ETHEREUM_ENABLE_ALCHEMY_RPC, true);
  return buildRpcFallbackList({
    publicUrls: ETHEREUM_FREE_RPC_PATHS,
    privateUrls: ETHEREUM_PAID_RPC_PATHS.map(sameOriginRpcUrl),
    includePublic: includeFree,
    includePrivate: includeAlchemy,
  });
})();
