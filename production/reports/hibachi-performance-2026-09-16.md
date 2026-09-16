# Performance Profile: Hibachi
Generated: 2026-09-16. Local implementation only; production inspected read-only.

## Measurements
Five sequential public BTC REST reads and twenty public WS marks per location.
No account credentials, signed orders or production files/DB/config changes.

| Location | REST latencies (ms) | WS open / first mark (ms) | Mark gap median / max (ms) |
|---|---|---|---|
| Local Windows, 06:29:59 UTC | 438, 274, 314, 272, 468 | 848 / 1234 | 302 / 313 |
| Production VPS, 06:30:20 UTC | 471, 292, 282, 382, 282 | 919 / 1310 | 301 / 310 |

Small read-only sample, direct public endpoints, not proxy/private/execution latency.
Inter-message cadence is not exchange-to-browser latency (no synchronized event clock).

Synthetic loopback test: WS upgrade intentionally never answers; REST responds
after 30ms. HEAD baseline getOrders took **4133ms**; local implementation **67ms**.
This is a ~62x improvement for this failure scenario, not typical trade execution.
Reproduce with `node benchmark-hibachi-cold-read.js --baseline` and without the flag.

Actual new UI transport helper against public Hibachi: ten applied batches in
4201ms including connection startup; marks valid, metadata preserved, no credentials.

## Performance Budgets
No established Hibachi latency SLO found; these observations are not invented SLOs.

| Metric | Existing behavior | Local result / status |
|---|---|---|
| Hook refresh cadence | 45000ms polling | Public mark WS ~301ms upstream + <=100ms batching |
| Cold WS failure overhead before REST | up to 4000ms | Removed: REST begins immediately |
| Account stream lease | documented 10000ms | Ping changed 15000 → 5000ms |
| Account UI refresh | 45000ms polling | Unchanged; private relay remains investigation |

## Top Hotspots
| # | Location | Issue | Impact / effort |
|---|---|---|---|
| 1 | useHibachi.js | Mark updates tied to slow polling | High / small; public WS added |
| 2 | hibachi.js getOrders | Failed WS handshake serializes REST | Measured 4s / small; background warmup |
| 3 | HibachiAccountStream | Lease expiry and incorrect nested deltas | Correctness blocker / medium; repaired, WS-first not enabled |

## Implemented
- Public marks stream, batched rendering, reconnect/watchdog, hidden-tab/unmount cleanup.
- Fresh marks survive slow REST responses; stats/history remain authoritative REST.
- Nonblocking cold order reads; warm WS reuse; single-flight warmup and cooldown.
- 5s account heartbeat; invalidate disconnected/expired snapshot; resubscribe.
- Correct documented nested position/close/side-flip and collateral updates.
- Ignore unrelated order events rather than accidentally deleting positions.
- Preserve u64 IDs in WS messages; old socket close cannot erase newer connection.
- Private stream maps bounded and idle entries released; no trading write replay.

## Verification
- 69 backend tests passed: Hibachi protocol, rate limit, proxy, reconciliation,
  HTTP routes, trade history, public proxy and LeverUp real CONNECT regressions.
- Nine frontend stream/error tests passed; actual public stream helper smoke passed.
- Web production build passed; existing >500kB chunk warnings remain.
- ESLint targeted new hook/helper passed; git diff whitespace check passed.

## Recommendations / Remaining Investigation
1. Release these bounded improvements after normal review; public freshness gain is
   substantial, but authenticated end-to-end private latency remains unmeasured.
2. Profile private account snapshot from an owner-authorized test account on the
   production egress route. Current account default remains REST-first. WS proxy
   routing is not implemented by these changes; REST proxy validation is separate.
3. Design authenticated browser account event relay with session expiry, account
   isolation, replay/gap reconciliation, and bounded subscriptions before replacing
   the 45s private poll. Do not expose API keys in browser URLs.
4. Keep history/backfill REST and ambiguous mutation recovery. No claim that all
   operations are now WebSocket or that user order success is production-verified.

## Sources
[Account WS](https://hibachi-docs.redocly.app/wsapi/account),
[Market WS](https://hibachi-docs.redocly.app/wsapi/market),
[ADR-0039](../../docs/architecture/adr-0039-hibachi-stream-latency.md).
