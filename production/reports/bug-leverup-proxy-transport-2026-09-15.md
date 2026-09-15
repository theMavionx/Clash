# Bug Report: LeverUp external transport gaps

## Summary

- ID: BUG-LEVERUP-PROXY-20260915
- Severity: S2-Major; Priority: P1; Category: Network
- Reported: 2026-09-15 by owner; frequency unknown; regression unknown.
- Baseline: 7410f627, production application release 3bc445d9.
- Status: deployed and verified on 2026-09-15.

## Reproduction and evidence

The previous order-input investigation observed external LeverUp 504 and Monad
RPC 429 responses. The generic public-read proxy only classifies selected public
service URLs, excluding relayer fee configuration, intent status and authenticated
submission. These adapter calls therefore lacked explicit proxy routing.

To reproduce deterministically, interrupt a LeverUp read connection or stall its
response body. Previously the adapter failed after its single request timeout.
Expected: bounded recovery for safe reads and distribution of independent requests.
For signed submissions an interrupted response has an unknown outcome, not proof
of rejection; never send it automatically through another proxy.

Current production-origin baseline probes returned HTTP 200 for pairs and fees
both directly and through three new proxies. Direct latency was 282–491 ms and
proxy latency 613–1658 ms. These samples do not reproduce a permanent outage and
do not establish that proxies are always faster.

## Implementation

- Dedicated LeverUp REST transport reuses Hibachi pool mechanics and the protected
  runtime file. File precedence: LEVERUP_PROXY_FILE, CLASH_PUBLIC_PROXY_FILE,
  HIBACHI_PROXY_FILE. Explicit LEVERUP_PROXIES supports local fixtures.
- Round-robin independent requests; default 16 simultaneous calls per process
  (configurable 1–64). Full capacity fails before transmission, without an unbounded queue.
- GET and the exact oracle-price POST are safe reads. At most two proxy attempts
  share an eight-second total budget, including response-body consumption.
- Signed commands use one attempt, disable redirects and report uncertain outcome
  after transmission errors. Existing payload/signing/fee/broker logic is unchanged.
- No retry on HTTP errors and no direct fallback with a configured pool. 429/403
  starts a provider-wide cooldown; no rotation to evade an upstream refusal.
- Existing Monad read RPC routing is unchanged; this patch is REST-specific.
- Credentials and raw proxy errors are not exposed. Logs show only pool size and
  concurrency. Production retains the 99 successfully validated proxies.

## Verification

- Focused suite: 13 checks passed including fee concurrency, real local HTTP CONNECT
  tunneling, broken-tunnel recovery, parallel reads, full 99-entry distribution,
  body timeout, cancellation, concurrency cap, error redaction, 429/403 behavior,
  exact oracle-POST classification, and single-attempt submission behavior.
- Existing LeverUp V2 signing/broker/UI and reward-proof tests passed.
- Canonical Deploy gate passed (including Godot behavior, frontend lint/build,
  rewards and new transport tests). Existing UID fallback/chunk warnings remain.
- Isolated candidate tested from production using the protected 99-entry pool:
  eight concurrent pairs/fees reads returned HTTP 200 and valid JSON via eight
  distinct proxies (489–1687 ms), zero failures/retries/direct fallback.
- Same 13 focused tests passed using the production Node.js runtime before cutover.
- Official submit documentation fetch was unavailable; implementation does not
  assume relayer idempotency or introduce replay based on undocumented behavior.
- No funded trades, wallet authorization or signed production submissions in tests.

## Remaining limitations

Proxies cannot repair a provider outage or rate-limit policy. An accepted command
whose response is lost remains uncertain and requires status/account reconciliation;
this change prevents transport retries but does not add durable intent recovery.

## Release verification

- Commit `8892890c` pushed to origin/main and deployed with the canonical atomic
  scripts to `/opt/clash/releases/20260915105335-8892890c`; completed 10:57:20 UTC.
- Live module SHA-256 matches the verified local file:
  `59891b653917733835e4c4816bbb3c08208c35d901444de1471a45309da5e84c`.
- API and futures startup logs confirm 99 proxies / 16 concurrent requests.
  All five Clash services online, zero post-release restarts; canonical runtime
  verification passed. API/futures/MCP health all HTTP 200.
- Active API returned HTTP 200 for 24 markets, 24 prices and 52 fee configuration
  rows. Public-domain fee-config also returned HTTP 200.
- Browser-ingested LeverUp error/warning count was zero from 10:56:16 to
  10:57:30 UTC. This short window does not establish successful funded trading.
- Previous application release `20260915101711-3bc445d9` retained for rollback.
  Standard retention removed `20260914105559-5aff5fd8` (rebuildable from Git).
- Existing deploy-time payment sync refreshed dragon:clash to 101368.474405 CLASH
  per 10 USD at price 0.00009865; this was the canonical payment-configuration
  operation, not a LeverUp test trade. No new application dependencies added;
  existing npm audit/engine warnings remain outside this transport change.
