# Bug and Performance Audit — 2026-07-31

## Scope

- TH6 high-density combat on the real Godot renderer.
- Automated performance harness correctness.
- Production log hotspots in the Hyperliquid rewards and Hermes jobs workers.
- Focused regressions for combat parity, reward attribution, rate limiting, and SQLite job claims.

## Performance budget

- Target: 60 FPS / 16.67 ms frame budget.
- Test scene: `scenes/TestMain.tscn`, maximum TH6 village, 45 knights, 1280×720.
- Renderer: Godot 4.6 Compatibility on the local AMD integrated GPU.
- Measurement: 35-second warmup followed by fixed-duration non-headless samples.

## Confirmed findings and fixes

### Dense troop steering refresh was more frequent than needed

The cached separation vector was already applied every physics tick, but the dense spatial hash was recomputed at 15 Hz. A controlled 45-unit A/B showed that refreshing it at 10 Hz preserved the same client-only crowd steering while reducing physics and tail-frame cost. Combat damage is unaffected because the authoritative server does not derive damage from client-side allied push-apart.

### The TH6 profiler sampled different workloads

Defenses remained active during the delayed spawn queue. They killed knights before the harness raised profile HP, producing 42–44 survivors for a requested 45 and invalidating comparisons. Browser matrix, bottleneck, and defense-breakdown profiles now freeze towers and guards during spawn, arm the intended mode only after HP setup, and report `sample_valid`.

The automated bottleneck profile now also performs cleanup and exits itself instead of relying on a forced `--quit-after` shutdown.

### Hyperliquid rewards worker amplified API load after 429

The worker fetched a full seven-day fill window for every registered wallet every two minutes. After a 429 it continued immediately through the remaining wallets, and `setInterval` could start another tick while the previous one was still running.

The worker now:

- uses a round-robin batch of at most eight wallets per tick;
- spaces wallet reads by 500 ms;
- switches successful wallets to a five-minute overlapping incremental window;
- stops the batch on the first 429 and applies an exponential global cooldown;
- retries the rate-limited wallet after cooldown;
- prevents overlapping ticks.

### Hermes could strand jobs under a lease

`claimDueJobs` previously committed one lease per row. If SQLite became busy partway through a batch, earlier rows stayed locked for ten minutes although the worker never received the returned batch. Claims are now one transaction, with a worker-local 15-second SQLite busy timeout and bounded retries for the expire-and-claim phase. Non-SQLite errors are not retried.

## Measurements

| Scenario | Active | Median FPS | Physics ms | p95 frame ms | Valid |
|---|---:|---:|---:|---:|---|
| Instrumented 15 Hz baseline | 45 | 59.076 | 5.85 | 22.769 | yes |
| Instrumented 10 Hz A/B | 45 | 59.909 | 5.44 | 20.231 | yes |
| Final production-equivalent 10 Hz | 45 | 59.995 | 3.95 | 17.863 | yes |

Controlled A/B change:

- physics: 5.85 → 5.44 ms (`-7.0%`);
- p95 frame: 22.769 → 20.231 ms (`-11.1%`);
- median FPS: 59.076 → 59.909.

The final non-instrumented sample averaged 60.011 FPS, had no frame above 25 ms, and kept all 45 troops alive. The p95 remains 1.19 ms above the strict 16.67 ms budget, so dense TH6 combat is materially improved but still has a small tail-latency concern.

## Verification

- Godot editor import: pass.
- Real non-headless TH6 45-knight profile: pass, `sample_valid=true`.
- `server-futures/test-hyperliquid-rewards-worker.js`: pass, including attribution, batching, incremental lookback, cursor fairness, 429 stop, and cooldown.
- `server/test-hermes-jobs-worker.js`: pass, including atomic claim semantics and bounded SQLite retry.
- `tools/codex/check-repo.ps1 -Mode Quick`: pass.
- Client/server combat parity and all focused troop regressions included in the quick suite: pass.

## Remaining validation

- These changes are local only. Production 429 and SQLite error rates cannot improve until the owner separately authorizes commit, push, and deployment.
- After deployment, compare the counts of `rate limited`, `hermes_jobs_db_busy_retry`, and terminal worker failures over at least one polling cycle.
- The current renderer does not expose useful per-pass GPU timings in this harness; draw-call and frame-time counters remain the practical GPU-side proxy.
- Godot reports the same two 349,524-byte GL textures at shutdown in a plain 60-frame `TestMain` launch with no profiler. This is a pre-existing scene-shutdown warning, not growth observed during the sample; resource ownership still needs a separate renderer-lifetime audit if it also appears during scene changes in a live session.
