# LeverUp settlement collateral missing from terminal

## Summary
- ID: BUG-LEVERUP-LVUSD-20260917
- Severity: S2-Major; priority: P1
- Status: fixed locally; deployment verification pending
- Reported: 2026-09-17, owner forwarding user screenshot
- Category: trading / UI / account data; regression: unknown
- Affected build: production 3eef0d2d; desktop and mobile browser terminal.

## Reproduction
1. Hold 0.72 USDC and 20 lvUSD after a LeverUp position settles.
2. Open the LeverUp trading terminal.
3. Observe only 0.72 free and no collateral-token selection.
4. Attempt to reuse the settlement proceeds: market/limit opens hardcode USDC.

Expected: both token balances visible, explicit collateral selection and token-correct order encoding.
Actual: server reads only USDC, hook overwrites account availability with USDC, ticket unit toggle is USDC/base quantity rather than collateral selection.

## Root cause and change
- `server-futures/leverup.js`: read both ERC20 balances; return exact decimal strings alongside display numbers. Failed reads remain errors, not invented zero balances.
- `useLeverup.js`: include lvUSD in nominal free/equity, retain walletUsdc as USDC only. Explicit selected collateral controls market/limit input token, exact balance check, fresh chain balance/allowance check and wallet-confirmed approval when needed. Execution-fee token state invalidated before signing.
- `leverupOrderAmounts.js`: amount and fee rounding use token decimals (USDC 6, lvUSD 18), while quantity/price scales stay unchanged.
- `FuturesPanel.jsx`: token selector, separate token balances, settlement explanation, combined nominal free balance; sizing uses selected token only. Switching tokens clears amount/percentage. No automatic swap or transaction on selection.
- Existing one-click USDC setup gate remains unchanged; first lvUSD use may additionally request a wallet approval and requires native gas. This fix does not implement redemption/swapping.

## Evidence and verification
- Official settlement reference: https://leverup.gitbook.io/docs/liquidity-layer/lvusd-stablecoin — settlement in LVUSD is intended protocol behavior, not a game-initiated swap.
- `web/test-leverup-order-flow.mjs` and `test-leverup-v2.mjs`: 8 test entries pass, including actual hook market/limit callback encoding for both collateral types and rejection before signing on insufficient balance.
- `web/test-leverup-collateral.mjs`: 3 tests pass: actual backend account reader, actual hook account enrichment, selected-token allowance/rejection/account-change behavior.
- `web/test-leverup-collateral-ui.mjs`: mounted FuturesPanel at 1280 and 390px passes token switch, amount reset, combined free balance, mock submit and no document overflow. Start preview with FIXTURE_PORT=5196 and FIXTURE_HMR_PORT=25196.
- Production build and full canonical Deploy gate pass. Existing lint/chunk-size/asset-UID warnings remain; no new gate failure. Thirteen transport/fee-cache tests also pass.

## Limits
No funded order, live user wallet approval, or swap was performed. User-specific wallet holdings were not independently inspected (no account identifier supplied). Combined USD display is nominal protocol collateral, not a guaranteed USDC redemption value. Local tests verify encoding and UI, not real exchange execution.
