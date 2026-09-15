# LeverUp Basic order input failure

## Summary

- ID: BUG-LEVERUP-BASIC-UNITS; severity S2-Major; priority P1.
- Reported 2026-09-15 by owner with forwarded LeverUp integration feedback.
- Baseline live build `20260914105559-5aff5fd8`; source baseline `08d0ba2e`.
- Category: UI/request units; reproducible on every LeverUp Basic confirmation.
- Status: deployed and post-release verified.

## Reproduction

In Basic trading, select LeverUp BTC, Long, $10 margin and 20x leverage.
Expected hook call: `('BTC', 'long', 10, '0.5', 20)`.
Actual baseline hook call at $100,000 BTC:
`('BTC', 'bid', '0.0019703462', '0.5')`.

BasicTradeFlow omitted LeverUp from its collateral-taking venue branch. It ran
Pacifica sizing, converted margin into base quantity and omitted leverage.
useLeverup interpreted the resulting BTC quantity as USDC margin at default 1x,
then divided by market price again. Pro correctly selected the collateral path.
This is a unit/routing defect, not merely a rounding error.

## Production evidence (read-only)

- Queried relevant stored browser telemetry and existing intent status proofs;
  no user keys, signatures or signed payloads were retrieved or replayed.
- Browser failures identify Basic mode and the live build above. Logs 1645832,
  1645845 show POST intent 504 responses at about 8.4 seconds; fee reads also
  returned 504, and Monad RPC returned 429. Server logs show LeverUp read timeouts.
- At the initial audit the proof table held 12 market opens: one success and
  eleven failures; one market close succeeded. All eleven failed opens on
  September 15 decoded to `TradingCheckerFacet: Position is too small`.
- Existing telemetry does not persist full signed action data, so the exact
  historical amounts cannot be proven from those logs. The actual Basic callback
  regression reproduces the wrong units deterministically and matches the
  observed contract rejection. Do not claim every 504 was caused by this defect.

## Correction

- Route LeverUp Basic confirmation through the existing USDC-collateral branch,
  retaining the selected side, margin and leverage. No change to Pacifica sizing.
- Centralize LeverUp open amount calculation in integer decimal arithmetic:
  USDC at 6 decimals, base quantity at 10, prices at 18. Floor margin/quantity to
  supported precision, round open fee up to a USDC atomic unit, retain exact
  limit-price strings, reject invalid/zero/overflow values before signing.
- Compare wallet balance against exact funded amount and preserve broker 2 and
  zero extra fee. Existing risk checks and auth stay in place.
- Decode Error(string) and common skip outcomes into actionable messages, with
  safe fallback instead of displaying raw revert hex.
- Coalesce concurrent public fee-config reads and cache only successful results
  for 30 seconds. Failed/expired reads fail closed. No stale-fee fallback and no
  automatic POST replay were introduced. This reduces redundant reads, but does
  not guarantee external API availability.

## Verification

- New regression run against baseline fails with the exact wrong call above;
  the fixed Basic long/short callbacks pass and their actual ABI fields decode
  to $10.08 funding, 0.002 BTC and $100,500/$99,500 slippage bounds at 20x.
- Executed actual hook market/limit callbacks, protective-field order, exact
  decimal boundaries, insufficient collateral, retry after rejection and
  unchanged Pacifica base-quantity behavior. Seven new tests pass.
- Fee tests cover ten concurrent readers, failed request release, cache hits,
  expiry and refusal to return stale configuration.
- Existing LeverUp V2 signing/broker/fee/action tests pass.
- Local browser fixture uses production BasicTradeFlow, with a capture callback
  instead of a wallet or exchange submission. It is a test-only Vite page, not a
  production entry point.
- Browser interaction passed: select BTC, Long, $10, drag leverage to 20x,
  review, slide to confirm. Captured margin=10, leverage=20, amountIn=10080000,
  qty=20000000 and bound=100500000000000000000000, matching the confirmation.
- Production build passed (10,474 modules), lint 0 errors / 136 warnings.
  Initial full gate lacked new-worktree Godot classes/resources; regenerated the
  class cache and reused imported resources after verifying identical Godot
  source/assets against the prior worktree. Focused Archer Tower probe passed.
- Repeated full canonical Deploy gate passed, including rewards/tournaments,
  all Godot behavior probes, lint and web build. Cached Godot resources emit
  UID-to-path fallback warnings but all required behavior assertions pass.
- No funded LeverUp trade, LeverUp on-chain transaction, wallet authorization or
  database repair was performed. Live execution after release requires a
  user-initiated order. The canonical deploy's existing payment-sync step is
  noted separately below.

## References

- https://developer-docs.leverup.xyz/introduction/precision
- https://developer-docs.leverup.xyz/gasless/submit
- https://developer-docs.leverup.xyz/onchain/market-orders

## Release

Canonical preflight passed. Work is isolated in `Clash-leverup-order-fix`,
branch `codex/leverup-order-precision`; unrelated original and Seeker drafts are
excluded. The referenced deploy-clash skill is not installed; use existing
canonical scripts without bypassing checks.

- Released commit `3bc445d9647f819748e2c92c25446dd36400cabb` to `origin/main`
  and `/opt/clash/releases/20260915101711-3bc445d9`. Source HEAD and current
  symlink match. Deploy completed at 10:22:57 UTC through the pinned direct SSH
  route and canonical export-upload-deploy/deploy.sh scripts.
- Canonical runtime verification passed; independent API, futures and MCP
  health checks return HTTP 200. All five Clash services are online with zero
  post-release restarts.
- Public main-DvUpObA_.js, both FuturesPanel chunks and useOstium-D8CaEJGV.js
  match current-release bytes exactly. The latter shared hook chunk contains
  the new integer sizing and decoded-error logic. Broker 2 remains active and
  verified_onchain; five simultaneous fee-config reads return HTTP 200.
- Initial post-release browser-log query finds zero new LeverUp errors. This
  short quiet window is not evidence of a completed live user trade.
- Retention removed build `20260906161228-3434063f`; previous release
  `20260914105559-5aff5fd8` remains available for rollback. No player data was
  deleted. The removed build can be rebuilt from its Git revision.
- The existing canonical Solana payment sync updated `dragon:clash` to
  `99206.349207` CLASH per 10 USD using fetched price `0.0001008` USD. This is
  the standard deploy-time payment configuration refresh, not a LeverUp trade.
