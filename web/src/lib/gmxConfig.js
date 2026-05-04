// GMX V2 — Arbitrum-only configuration. We deliberately don't ship Avalanche
// support here even though @gmx-io/sdk supports it; Avalanche requires its
// own wallet/chain plumbing and the user explicitly scoped the integration
// to Arbitrum. Adding AVAX later is a one-line ARBITRUM_CHAIN_ID → both swap.
//
// Note on API URLs: GMX rotated their public REST host. The old
// `arbitrum-api.gmxinfra.io` documented in some search results returns 404
// on the modern endpoints (/markets/tickers etc.). The SDK ships the
// current canonical URL `https://arbitrum.gmxapi.io/v1` plus a `.ai/v1`
// failover. We don't override it — passing no `apiUrl` to GmxApiSdk lets
// the SDK pick host + activate its built-in fallback chain.

export const ARBITRUM_CHAIN_ID = 42161;
export const ARBITRUM_CHAIN_ID_HEX = '0xa4b1';

// EIP-3326/3085 helper — ensure the connected EVM wallet is on Arbitrum
// before any GMX write call. Idempotent; safe to call before every tx.
// Mirrors `ensureBaseChain` in lib/avantisContract.js so multi-DEX users
// switching between Avantis and GMX get parallel switch UX.
export async function ensureArbitrumChain(provider) {
  if (!provider) throw new Error('No EVM wallet connected');
  const current = await provider.request({ method: 'eth_chainId' });
  if (String(current).toLowerCase() === ARBITRUM_CHAIN_ID_HEX) return;
  try {
    await provider.request({
      method: 'wallet_switchEthereumChain',
      params: [{ chainId: ARBITRUM_CHAIN_ID_HEX }],
    });
  } catch (err) {
    // 4902 = chain not added; fall through to wallet_addEthereumChain.
    if (err?.code === 4902 || /unrecognized|not been added/i.test(err?.message || '')) {
      await provider.request({
        method: 'wallet_addEthereumChain',
        params: [{
          chainId: ARBITRUM_CHAIN_ID_HEX,
          chainName: 'Arbitrum One',
          nativeCurrency: { name: 'ETH', symbol: 'ETH', decimals: 18 },
          rpcUrls: ['https://arb1.arbitrum.io/rpc'],
          blockExplorerUrls: ['https://arbiscan.io'],
        }],
      });
      return;
    }
    throw err;
  }
}

// Subsquid GraphQL — used by GmxSdk v1 for trade history. Phase 2 wires this.
export const GMX_SUBSQUID_URL = 'https://gmx.squids.live/gmx-synthetics-arbitrum:live/api/graphql';

// Oracle keeper URL — required by GmxSdk v1 (`oracle.fetchTickers()`,
// `tokens.getTokenRecentPrices`). The SDK has internal defaults but does
// NOT auto-resolve them in the constructor — you must pass `oracleUrl`
// explicitly or `tokens.getTokensData()` blows up with `Cannot read
// properties of undefined (reading 'replace')`. Verified against the SDK
// source: build/cjs/src/clients/v1/modules/oracle.js#L12.
export const GMX_ORACLE_URL = 'https://arbitrum-api.gmxinfra.io';

// GMX V2 contract addresses on Arbitrum. Pulled from the SDK's bundled
// CONTRACTS table (configs/contracts.js) — kept here so we don't have to
// import the SDK module just to grab one address. SyntheticsRouter is the
// spender the user approves USDC to before a first trade; the SDK's
// `sdk.orders.long(...)` write will revert with "InsufficientAllowance" if
// allowance(account, router) < payAmount.
export const GMX_SYNTHETICS_ROUTER = '0x7452c558d45f8afC8c83dAe62C3f8A5BE19c71f6';
export const GMX_EXCHANGE_ROUTER = '0x1C3fa76e6E1088bCE750f23a5BFcffa1efEF6A41';

// Native USDC on Arbitrum (Circle's official, post-bridge migration). The
// bridged variant (USDC.e, 0xff97...DDB5CC8) still exists but liquidity has
// largely moved to native; GMX V2 markets quote against this address.
// Hardcoded here so we can build approve txns without round-tripping the
// /tokens registry on every popup.
export const ARBITRUM_USDC_NATIVE = '0xaf88d065e77c8cC2239327C5EDb3A432268e5831';
export const ARBITRUM_USDC_DECIMALS = 6;

// Minimal ERC20 ABI — only the bits we need to read allowance and call
// approve. Avoids pulling viem's bigger ABI package for one function.
export const ERC20_ABI = [
  { type: 'function', name: 'allowance', stateMutability: 'view',
    inputs: [{ name: 'owner', type: 'address' }, { name: 'spender', type: 'address' }],
    outputs: [{ type: 'uint256' }] },
  { type: 'function', name: 'approve', stateMutability: 'nonpayable',
    inputs: [{ name: 'spender', type: 'address' }, { name: 'value', type: 'uint256' }],
    outputs: [{ type: 'bool' }] },
];

// uint256 max — standard ERC20 "infinite approval" pattern. Same value
// MetaMask's "Spend cap unlimited" toggle sends. Uses MAX_UINT256 string
// to keep the constant a viem-compatible bigint without BigInt() in module
// scope (some older bundlers misalign with BigInt literals).
export const MAX_UINT256 = (1n << 256n) - 1n;

// Arbitrum RPC pool. ALL go through our same-origin Vite proxy because:
//   1. MetaMask's `injected.js` content script scans browser fetch() calls
//      for known RPC hosts and re-routes them through its own provider;
//      its proxy strips Access-Control-Allow-Origin → CORS error in
//      DevTools. Same-origin localhost paths aren't in MM's intercept list.
//   2. The canonical `arb1.arbitrum.io/rpc` returns a double `ACAO: *,*`
//      header which browsers reject outright.
//   3. Multiple upstreams give us automatic failover when one hits its
//      free-tier limit. 1rpc.io, BlastAPI, llamarpc, ankr, tenderly all
//      ration aggressively under multicall load (sdk.markets.getMarketsInfo
//      fires 100+ reads in parallel) and any one can 429 / 404 mid-session.
// Production override: set VITE_ARBITRUM_RPC_URL to a single paid Alchemy /
// Infura / QuickNode key under your domain to skip the rotation entirely.
export const ARBITRUM_RPC_URLS = (() => {
  const envOverride = (typeof import.meta !== 'undefined' && import.meta.env?.VITE_ARBITRUM_RPC_URL) || '';
  if (envOverride) return [envOverride];
  // Order = priority. arb-pokt (Pocket Network public) is the most
  // generous anonymous endpoint we found — it shoulders multicall load
  // without 429 where tenderly/1rpc both ration. Onfinality / publicnode
  // / tenderly fill the rotation so a transient throttle rolls over via
  // viem fallback(). 1rpc.io kept last (250 req/IP/day cap → backup
  // only). For production set VITE_ARBITRUM_RPC_URL to a paid Alchemy /
  // Infura key — the rotation here is a stop-gap.
  return [
    '/rpc/arb-pokt',         // Pocket Network public (most generous)
    '/rpc/arb-onfinality',   // OnFinality public
    '/rpc/arb-public',       // publicnode
    '/rpc/arb-tenderly',     // tenderly gateway public
    '/rpc/arb',              // 1rpc.io (low daily cap; last)
  ];
})();
// Back-compat single-URL export for code paths that haven't migrated to
// the rotation yet (e.g. server-futures/gmx.js direct RPC reads — those
// run server-side, no MetaMask interference, and we don't need fallback
// at the same density as the browser path).
export const ARBITRUM_RPC_URL = ARBITRUM_RPC_URLS[0];
