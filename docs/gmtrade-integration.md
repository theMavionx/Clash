# GMTrade Integration

GMTrade is integrated as a self-custody Solana futures venue. The live path is:

1. Player registers/selects `gmtrade` with a Solana wallet.
2. Clash can either build a native GMSOL order transaction for the connected Solana wallet, or open the GMTrade app fallback.
3. The player signs/sends the Solana transaction.
4. Clash imports the confirmed GMTrade Solana transaction signature.
5. `server-futures` verifies the transaction is confirmed, signed by the player wallet, and includes a known GMTrade/GMSOL program id.
6. `server-futures` decodes GMTrade `TradeEvent` log data and verifies the event user matches the player wallet.
7. Verified rows are written to `trade_history` with `dex='gmtrade'` and `verified_source='gmtrade_tx'`.
8. Existing gold, quest, stats, tournament, and admin analytics readers credit those rows.

## Environment

Optional:

```bash
GMTRADE_APP_URL=https://gmtrade.xyz/trade
GMTRADE_REFERRAL_CODE=
GMTRADE_SOLANA_RPC_URL=https://rpc-1.gmtrade.xyz/
GMTRADE_RPC_ORIGIN=https://gmtrade.xyz
GMTRADE_PROGRAM_IDS=Gmso1uvJnLbawvw7yezdfCDcPydwW2s2iqG3w6MDucLo,GTuvYD5SxkTq4FLG6JV1FQ5dkczr1AfgDcBHaFsBdtBg
GMTRADE_STORE_ADDRESS=CTDLvGGXnoxvqLyTpGzdGLg9pD6JexKxKXSV8tqqo8bN
GMTRADE_DISCOVER_MARKETS=1
GMTRADE_MARKET_TOKENS_JSON={"SOL":"<gm_market_token_mint>"}
GMTRADE_MARKET_SYMBOLS_JSON={"<index_or_market_token_mint>":"SOL"}
```

Native order building uses `@gmsol-labs/gmsol-sdk@0.9.0` from Node by default. `server-futures/gmtrade.js` includes the official GMTrade app market-token registry from `gmtrade.xyz/trade` and decodes those market accounts on-chain through the GMSOL SDK, so `GMTRADE_MARKETS_JSON` is no longer required for the standard GMTrade markets. The Rust sidecar in `server-futures/gmtrade-builder` is optional and can be used instead in environments that prefer the Rust SDK path.

To build the Rust sidecar, use an environment where Rust build scripts are allowed:

```bash
cd server-futures/gmtrade-builder
cargo build --release
```

Override market addresses only if GMTrade changes a market before the bundled registry is updated:

```bash
GMTRADE_MARKETS_JSON={"SOL":{"market_token":"...","long_token":"...","short_token":"...","collateral_token":"...","collateral_decimals":6}}
```

Or configure only known GM market token mints and let the server derive/decode the market PDA:

```bash
GMTRADE_MARKET_TOKENS_JSON={"SOL":"<gm_market_token_mint>","BTC":"<gm_market_token_mint>"}
```

Optional:

```bash
GMTRADE_RUST_BUILDER_BIN=C:\absolute\path\to\gmtrade-builder.exe
GMTRADE_EXECUTION_LAMPORTS=50000
GMTRADE_ENABLE_NODE_SDK_BUILDER=1
GMTRADE_ALLOW_CLIENT_NOTIONAL_REPORTS=0
```

The installed `@gmsol-labs/gmsol-sdk@0.9.0` npm package exposes GMSOL transaction builders. The Node/WASM builder is enabled by default (`GMTRADE_ENABLE_NODE_SDK_BUILDER=1`) and was locally validated to produce a serialized create-order transaction from configured market metadata. Set `GMTRADE_ENABLE_NODE_SDK_BUILDER=0` to force the Rust sidecar-only path.

Repeat the local GMTrade smoke test with:

```bash
cd server-futures
npm run test:gmtrade
```

The test validates the Node-native GMTrade `TradeEvent` reward decoder and the Node/WASM GMSOL create-order transaction builder. The adapter installs a CommonJS `globalThis.module`/`globalThis.require` bridge before importing the WASM SDK because wasm-bindgen expects `module.require` in Node file execution.

Public GMTrade market data comes from CoinGecko's `gmx-perpetuals-v2-solana` derivatives endpoint and falls back to Pyth for the default core symbols if CoinGecko is unavailable.

`GMTRADE_DISCOVER_MARKETS=1` enables best-effort on-chain discovery with `getProgramAccounts` and `@gmsol-labs/gmsol-sdk` `Market.decode_from_base64`. Env-provided `GMTRADE_MARKETS_JSON` has priority, followed by `GMTRADE_MARKET_TOKENS_JSON`, followed by the official app market-token registry, followed by full program discovery. Full discovery needs an RPC endpoint that allows `getProgramAccounts` for the GMSOL store program; the official registry path only needs `getMultipleAccounts`. If an index token is not one of the built-in common GMTrade mints, map it with `GMTRADE_MARKET_SYMBOLS_JSON`.

The authenticated endpoint `GET /api/futures/gmtrade/markets/discover?force=1` forces a discovery refresh and returns decoded market rows or the RPC/decode error.

## Reward Verification

`/api/futures/gmtrade/trade-report` accepts:

```json
{
  "signature": "solana_tx_signature",
  "symbol": "SOL",
  "side": "long",
  "amount": 10,
  "leverage": 5,
  "price": 70
}
```

The credited notional comes from the decoded on-chain GMTrade `TradeEvent` size delta (`after.size_in_usd - before.size_in_usd`, using GMSOL `MARKET_DECIMALS = 20`), not from the client request. `amount` and `leverage` are retained as UI/import hints and legacy metadata only.

Reward import uses a Node-native decoder for the GMSOL trade-event layout, so gold and quest credit do not require the Rust sidecar. `GMTRADE_ALLOW_CLIENT_NOTIONAL_REPORTS=1` restores the old client-notional fallback for testing only; do not use that in production rewards.
