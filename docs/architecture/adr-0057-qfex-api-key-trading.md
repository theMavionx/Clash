# ADR-0057: QFEX API-key trading and verified reward attribution

## Status

Accepted

## Date

2026-09-22

## Context

### Problem Statement

Add QFEX to the shared terminal and game accounting. The owner chose API keys first; OAuth client registration and the Clash builder code are not available yet.

### Constraints

- Preserve all existing exchanges and their reward rules.
- Never request withdrawal permission or persist plaintext API secrets.
- QFEX client order IDs are not guaranteed unique. A socket timeout does not prove rejection.
- The QFEX account identity is independent of the player's login wallet chain.

### Requirements

Support authenticated balances, positions, orders, market/limit placement, cancellation, reduce-only closing, leverage, history, candles and orderbook. Integrate verified fills with Gold, tasks and tournament volume exactly once.

## Decision

Use the existing player-scoped encrypted credential mechanism. The server signs documented HMAC requests to fixed QFEX production origins; API keys need trading and read permissions only. Each mutation has a durable account/player/action UUID plus payload hash before sending. Unknown outcomes remain pending reconciliation, never blind retries. Resolve the selected account from authenticated upstream data and bind it to one player for rewards.

Builder code is optional server configuration attached to each authenticated TradeWS connection. Missing code does not block trading, but cannot earn builder-attributed game rewards. Rewards require server-origin accepted order proof, the bound account, official fill ID and verified execution data; source labels alone are insufficient. Task start is compared with execution time, not merely import order.

### Architecture Diagram

Terminal → authenticated QFEX routes → HMAC REST / TradeWS → QFEX

Accepted command journal + authenticated execution → verified trade ledger → Gold / tasks / tournaments

### Key Interfaces

- `/api/futures/qfex/{config,credentials/check,account-snapshot,history,candles,orderbook}`
- `/api/futures/qfex/{orders,orders/cancel,positions/close,leverage}` with stable `actionId` UUID.
- `/api/futures/qfex/actions/:actionId` reconciles uncertainty without resubmitting.
- `/api/futures/qfex/import-trades` imports only provable eligible fills.
- `QFEX_BUILDER_CODE` belongs in trusted server configuration, never a browser-controlled order field.

## Alternatives Considered

### Alternative 1: OAuth first

- Description: QFEX Connect authorization.
- Pros: Recommended onboarding, avoids manual key entry.
- Cons: Requires an issued OAuth client ID.
- Rejection Reason: Owner explicitly selected API keys first; OAuth can be added later.

### Alternative 2: Browser-reported trade volume and fire-and-forget orders

- Description: Reward frontend confirmations and resend on network error.
- Pros: Smaller integration.
- Cons: Forged rewards, duplicate orders, cross-account replay.
- Rejection Reason: Unacceptable accounting and financial correctness risk.

## Consequences

### Positive

- Existing terminal and rewards infrastructure reused; secrets stay out of logs and ledger.
- Duplicate submissions and late-import task overcounting explicitly guarded.

### Negative

- API keys require user setup; no automated withdrawals/deposits.
- Rewards stay unavailable until a real builder code is configured and eligible fills exist.

### Risks

- Upstream schema or permission differences: fixtures plus read-only live public checks; authenticated funded smoke still required before claiming end-to-end live execution verified.
- Unknown command: retain durable intent and reconcile; do not assume nonexecution from missing history.
- Inactive builder code: configuration is not proof of QFEX commercial activation; verify issued code with QFEX before reward launch.

## Performance Implications

- CPU: HMAC signing and bounded JSON normalization; no wallet derivation.
- Memory: Bounded market/snapshot caches and short-lived sockets.
- Load Time: Account-specific authentication on setup and refresh.
- Network: Shared public data cache and bounded private refresh; no uncontrolled retry loop.

## Migration Plan

Add QFEX to venue registries and tournament constraint migration without changing existing records. Create additive account/intent tables. Deploy only after owner approval; enter builder configuration separately. Existing API-key venues and historical reward records are unchanged.

## Validation Criteria

Adapter protocol, precision, account binding and mutation replay tests; authenticated route guards and redaction; Gold/task/tournament fixture with forged/duplicate fills; frontend build and credential-scope checks; live public market/candle/orderbook checks. No funded action in automated tests.

## Related Decisions

- ADR-0034: player-scoped encrypted credential storage.
- Official QFEX docs: https://docs.qfex.com/api-reference/builder-integration
