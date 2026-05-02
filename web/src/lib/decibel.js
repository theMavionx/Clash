// Decibel Perp DEX integration constants and SDK factories.
//
// Decibel runs on Aptos mainnet. The SDK is split into a read client (no
// signer required, used for markets/prices/account state) and a write
// client (needs an Aptos signer that can return AccountAuthenticator from a
// RawTransaction — i.e. an Ed25519Account holding a private key, NOT a
// browser wallet adapter).
//
// Petra/Pontem can only `signAndSubmitTransaction(InputTransactionData)` —
// they cannot sign a built RawTransaction. So we use Decibel's documented
// "API Wallet" pattern: the server-futures process owns an Ed25519Account
// private key from env/secret management, the user signs a one-time
// `delegateTradingToForSubaccount` from Petra to grant it trading rights on
// their subaccount, and from then on every order is signed server-side.
//
// Builder code attribution: every trade carries `builderAddr` + `builderFee`
// (basis points). The user is asked to call `approveMaxBuilderFee(...)` once
// per subaccount; after that all `placeOrder` calls deduct up to that cap.

// ───── Builder fee config ─────────────────────────────────────────────────

// Builder address registered on app.decibel.trade. Aptos format: "0x" + 64
// hex chars. The 6-char codes like `Z7ZFYZ` / `DC13WJ` are referral codes
// (consumer-side), NOT builder addresses — `placeOrder` validates this
// on-chain and reverts with "invalid address" if you pass a short code.
export const BUILDER_ADDR = '0xc82aea3965cd4f0731baf1e9a28cea65b0697911aea346577e6488d542653332';

// 1 basis point = 0.01%. Per builder agreement / user request.
export const BUILDER_FEE_BPS = 1;

// Referral code (consumer-side, the 6-char alphanumeric thing on
// app.decibel.trade). Decibel's perp_engine aborts with
// `EACCOUNT_WITHOUT_REFERRER_OR_IN_ALLOW_LIST` (0xe) on any trade-time
// call when the trading subaccount has no referrer redeemed against it.
// We auto-redeem this on activation so brand-new users skip past that
// wall without needing to detour through the marketing site.
//
// This is DIFFERENT from BUILDER_ADDR — referral is a server-side row in
// Decibel's referral registry, builder is the on-chain fee recipient.
// Setting both is normal: referral unblocks trading, builder routes
// per-trade fees to us.
export const REFERRAL_CODE = 'Z7ZFYZ';

// Returns true when the integration is wired to actually charge builder
// fees. Used by the hook to skip the `approveMaxBuilderFee` flow and the
// per-trade `builderAddr` field if the address hasn't been set yet.
export function isBuilderConfigured() {
  return typeof BUILDER_ADDR === 'string'
    && BUILDER_ADDR.startsWith('0x')
    && BUILDER_ADDR.length === 66; // 0x + 64 hex
}

// ───── Network / SDK config ───────────────────────────────────────────────

// Aptos mainnet fullnode. Public free tier — fine for low-volume read
// traffic from a few hundred concurrent players. Set VITE_APTOS_NODE_API_KEY
// in `.env` to upgrade to authenticated rate limits without code changes.
const APTOS_FULLNODE = 'https://fullnode.mainnet.aptoslabs.com/v1';
const APTOS_NODE_API_KEY = (typeof import.meta !== 'undefined' && import.meta.env)
  ? (import.meta.env.VITE_APTOS_NODE_API_KEY || undefined)
  : undefined;
const APTOS_GAS_STATION_API_KEY = (typeof import.meta !== 'undefined' && import.meta.env)
  ? (import.meta.env.VITE_APTOS_GAS_STATION_API_KEY
    || import.meta.env.VITE_DECIBEL_GAS_STATION_API_KEY
    || undefined)
  : undefined;

// Decibel's own infra. Verified against `@decibeltrade/sdk` MAINNET_CONFIG
// (constants.js): the public REST/WS run under Aptos Labs infrastructure
// at `api.mainnet.aptoslabs.com/decibel`, NOT a `decibel.trade` subdomain.
// The marketing site uses decibel.trade but the API is hosted by Aptos.
const DECIBEL_HTTP = 'https://api.mainnet.aptoslabs.com/decibel';
const DECIBEL_WS = 'wss://api.mainnet.aptoslabs.com/decibel/ws';

// Decibel package address on Aptos mainnet. Verified against the SDK's
// shipped `MAINNET_CONFIG` (constants.js) — same value the SDK derives the
// USDC / TestC / PerpEngineGlobal addresses from. Re-stated here so we can
// use it for raw payload-building without going through the SDK module.
export const DECIBEL_PACKAGE_MAINNET =
  '0x50ead22afd6ffd9769e3b3d6e0e64a2a350d68e8b102c4e72e33d0b8cfdfdb06';

// USDC fungible-asset address on Aptos mainnet — the SDK's
// `MAINNET_CONFIG.deployment.usdc`. Required as the SECOND argument to
// `deposit_to_subaccount_at` / `withdraw_from_cross_collateral` Move calls.
export const DECIBEL_USDC_MAINNET =
  '0xbae207659db88bea0cbead6da0ed00aac12edcdda169e591cd41c94180b46f3b';

// Aptos mainnet chain identifier.
export const APTOS_CHAIN_ID = 1;

// Cached singletons. Re-creating SDK clients per render churns the
// internal Aptos provider's HTTP keep-alive and breaks WebSocket
// subscriptions. We build them once and share across the app.
let _readClient = null;
let _sdkModule = null;

// Lazy import — the SDK is ~250 KB gz and we shouldn't pull it for
// players who never click the futures panel, never mind never select
// Decibel. Cached so the second call is O(1).
async function _loadSdk() {
  if (_sdkModule) return _sdkModule;
  _sdkModule = await import('@decibeltrade/sdk');
  return _sdkModule;
}

// Builds the DecibelConfig used by both Read and Write clients. Starts
// from the SDK's bundled MAINNET_CONFIG (which has all derived deployment
// addresses correct) and only overrides our infra preferences.
async function _buildConfig() {
  const sdk = await _loadSdk();
  const base = sdk.MAINNET_CONFIG ? { ...sdk.MAINNET_CONFIG } : {};
  return {
    ...base,
    fullnodeUrl: APTOS_FULLNODE,
    tradingHttpUrl: DECIBEL_HTTP,
    tradingWsUrl: DECIBEL_WS,
    chainId: APTOS_CHAIN_ID,
    ...(APTOS_GAS_STATION_API_KEY ? { gasStationApiKey: APTOS_GAS_STATION_API_KEY } : {}),
  };
}

// Read-only client. Safe to call without a connected wallet — used for
// markets, prices, public account state by address.
export async function getReadClient() {
  if (_readClient) return _readClient;
  const sdk = await _loadSdk();
  const cfg = await _buildConfig();
  // Pass `nodeApiKey` via the second-arg options bag, per docs.
  _readClient = new sdk.DecibelReadDex(
    cfg,
    APTOS_NODE_API_KEY ? { nodeApiKey: APTOS_NODE_API_KEY } : undefined,
  );
  return _readClient;
}

// Write client factory for environments that own an Ed25519Account-shape
// signer (server-futures). Passing a Petra adapter directly will throw at
// the first write call.
//
// `skipSimulate: true` is critical for the api-wallet pattern. Decibel's
// SDK runs a pre-flight `transaction.simulate.simple({estimateMaxGasAmount:
// true})` and then sets `max_gas_amount = max(simulatedMaxGas * 2, 200_000)`.
// For a `place_order_to_subaccount` call the simulator returns a generous
// estimate (~500_000 gas units) that, after the 2x buffer, demands a
// validator-fee threshold of ~1M gas × 100 octa = 1 APT just to ENTER the
// mempool — even though actual gas burned is ~5_000-15_000. With this off
// the SDK uses the 200_000 default ceiling, giving a 0.02 APT threshold
// (real burn still ~0.0001 APT). The api-wallet now needs only ~0.05 APT
// of standing balance instead of >1 APT, and trades pass validator
// admission without the user funding obscene amounts of gas. The on-chain
// engine still rejects with a clean Move abort if the order is malformed
// — we just skip the redundant local simulation.
export async function makeWriteClient(account) {
  const sdk = await _loadSdk();
  const cfg = await _buildConfig();
  return new sdk.DecibelWriteDex(
    cfg,
    account,
    {
      ...(APTOS_NODE_API_KEY ? { nodeApiKey: APTOS_NODE_API_KEY } : {}),
      skipSimulate: true,
    },
  );
}

export function isGasSponsored() {
  return !!APTOS_GAS_STATION_API_KEY;
}

// Derives the deterministic primary subaccount address for `ownerAddr`.
// Decibel's `user_subaccounts` REST endpoint sometimes lags the indexer
// (returns empty even when the on-chain object exists), so the canonical
// way to find a user's primary subaccount is to compute it via the SDK's
// `getPrimarySubaccountAddr` helper. Same address the SDK's own write
// flows use internally, so we get a stable identity even right after
// `create_new_subaccount` lands and before the indexer catches up.
export async function getPrimarySubaccountAddr(ownerAddr) {
  const sdk = await _loadSdk();
  return sdk.getPrimarySubaccountAddr(
    ownerAddr,
    sdk.CompatVersion.V0_4,
    DECIBEL_PACKAGE_MAINNET,
  );
}

// Resolves to the `TimeInForce` enum exported by the SDK. Returned as a
// promise so the caller can `await` and use it in object literals.
// Falls through to numeric values if the named enum keys aren't present —
// the on-chain enum is u8 (0=GTC, 1=PostOnly, 2=IOC) per the docs, so
// numeric fallback is always safe.
export async function getTimeInForce() {
  const sdk = await _loadSdk();
  const tif = sdk.TimeInForce || {};
  return {
    GoodTillCanceled: tif.GoodTillCanceled ?? tif.GTC ?? 0,
    PostOnly: tif.PostOnly ?? 1,
    ImmediateOrCancel: tif.ImmediateOrCancel ?? tif.IOC ?? 2,
  };
}

// Re-export the SDK's chain-unit helper so the rest of the app uses the
// EXACT scaling the SDK expects, instead of duplicating `* 1e6` math.
// Falls back to a 1e6 scaler ONLY if the SDK doesn't expose one (older
// builds) — chained tagged with a console.warn so the mismatch surfaces.
export async function amountToChainUnits(human, decimals = 6) {
  const sdk = await _loadSdk();
  if (typeof sdk.amountToChainUnits === 'function') {
    return sdk.amountToChainUnits(human, decimals);
  }
  console.warn('[decibel] sdk.amountToChainUnits missing — falling back to manual scaling');
  return BigInt(Math.round(Number(human) * Math.pow(10, decimals)));
}

export async function chainUnitsToAmount(chainUnits, decimals = 6) {
  const sdk = await _loadSdk();
  if (typeof sdk.chainUnitsToAmount === 'function') {
    return sdk.chainUnitsToAmount(chainUnits, decimals);
  }
  return Number(chainUnits) / Math.pow(10, decimals);
}

// Display label for the "powered by" footer + DEX picker. Kept here so we
// have one place to rename if Decibel rebrands.
export const DECIBEL_LABEL = 'DECIBEL';
