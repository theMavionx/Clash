// GMX V2 SDK singleton + lazy loader.
//
// We only ship the V2 (HTTP-only) SDK now. Every read AND write is
// expressed via the V2 `/orders/txns/prepare` API: backend resolves the
// market, computes acceptable price + fees + execution fee, and returns a
// classic-mode `{ to, data, value }` payload that we send via the user's
// wallet directly. This sidesteps every issue the V1 SDK had:
//   * V1 needed an in-process marketsInfoData snapshot built from 100-500
//     parallel multicall reads — overwhelmed even paid Alchemy under the
//     default 1KB batchSize.
//   * V1 silently skipped any market whose tokens weren't in its bundled
//     token config — every recently-listed pair (SYRUP, etc.) was invisible
//     to opens AND closes ("No open <side> SYRUP position").
//   * V1's bundle dragged ~700KB of unused code into the page.
//
// @gmx-io/sdk's V2 entry is ~80KB gzipped. Even that is deferred to first
// call so users who never pick GMX in the DEX picker pay nothing.

import { ARBITRUM_CHAIN_ID } from './gmxConfig';

let _apiSdkModule = null;
let _apiSdkInstance = null;

async function loadApiSdkModule() {
  if (_apiSdkModule) return _apiSdkModule;
  _apiSdkModule = await import('@gmx-io/sdk/v2');
  return _apiSdkModule;
}

/**
 * Returns the cached GmxApiSdk instance. Read AND write client. Reads go
 * straight to GMX's REST API (markets, tickers, positions, orders, ohlcv).
 * Writes are built via prepareOrder/prepareCancelOrder and sent by the
 * caller through their viem walletClient.
 */
export async function getGmxApiSdk() {
  if (_apiSdkInstance) return _apiSdkInstance;
  const mod = await loadApiSdkModule();
  // No apiUrl override: lets the SDK pick the canonical host AND activate
  // its built-in fallback (arbitrum.gmxapi.io → arbitrum.gmxapi.ai). If we
  // pin apiUrl here, the SDK skips the fallback list — bad for resilience.
  _apiSdkInstance = new mod.GmxApiSdk({
    chainId: ARBITRUM_CHAIN_ID,
  });
  return _apiSdkInstance;
}
