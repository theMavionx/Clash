# Bug Report: LeverUp external transport gaps

## Summary

- ID: BUG-LEVERUP-PROXY-20260915
- Severity: S2-Major; Priority: P1; Category: Network
- Reported: 2026-09-15 by owner; frequency unknown; regression unknown.
- Baseline: 7410f627, production application release 3bc445d9.
- Status: implemented locally; deployment verification pending.

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
- Production application deployment and post-release smoke pending.
- Official submit documentation fetch was unavailable; implementation does not
  assume relayer idempotency or introduce replay based on undocumented behavior.
- No funded trades, wallet authorization or signed production submissions in tests.

## Remaining limitations

Proxies cannot repair a provider outage or rate-limit policy. An accepted command
whose response is lost remains uncertain and requires status/account reconciliation;
this change prevents transport retries but does not add durable intent recovery.
