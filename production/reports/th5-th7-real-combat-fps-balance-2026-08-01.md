# TH5-TH7 real combat, FPS parity, and ranked balance — 2026-08-01

## Scope

This pass compared the authoritative Node replay with real `TestMain` Godot combat,
removed render/wall-clock dependencies from battle actions, and tuned the actual TH5-TH7
ranked bot cohorts without increasing troop or defense attack speed.

## Changes

- Server movement now mirrors Godot troop/building avoidance and deterministic overlap ordering.
- Mortar replay uses the client projectile travel curve and fixed impact point.
- Battle actions, boosts, rally expiry, and post-victory shutdown use physics simulation time.
- Expensive troop capacity was rebalanced while preserving per-unit strength. Server and client
  slot costs are identical; existing ships migrate from slot-cost version 2 to 3 and refund
  non-NFT overflow units.
- Ranked bots remain exact-TH and ignore shields, but use the empirically validated geometry for
  each playable high tier: TH5/TH6 `asymmetric-left`, TH7 `corner-keep`.

## Balance evidence

All reported battles used the current production constants, full base HP normalization (matching
the server repair-before-raid flow), max same-TH troop levels, and zero invalid replays.

| Cohort | Battles | Attacker win rate |
|---|---:|---:|
| Production Digger TH7 base | 800 | 53.9% |
| Tuned ranked candidate, TH5-TH7 combined | 1,800 | 56.3% |
| TH5 selected geometry (`asymmetric-left`) | 185 | 55.1% |
| TH6 selected geometry (`asymmetric-left`) | 361 | 53.7% |
| TH7 selected geometry (`corner-keep`) | 339 | 56.6% |

The former mixed `corner-keep` + `rear-keep` ranked cohort measured 63.1% attacker wins over
3,000 battles. The selected per-TH geometry removes the soft `rear-keep` cohort while retaining
20 deterministic TH5 layouts, 40 TH6 layouts, and 37 TH7 layouts. Each pool remains above the
ranked daily attack limit and preserves the no-repeat rule.

Primary machine-readable reports:

- `.tmp-codex/final-balance/production-final-candidate/digger.json`
- `.tmp-codex/final-balance/production-final-candidate/ranked-th5-th7.json`
- `.tmp-codex/final-balance/production-slots-maxed/ranked-th5-th7.json`

## FPS and server/Godot parity

- Sixteen real `TestMain` battles were run at 10, 20, 30, 60, and 120 render FPS.
- 10 FPS vs 60 FPS: zero differences in result, duration, Town Hall HP, destroyed-building count,
  surviving troops, or per-building HP across all 16 scenarios.
- 20 FPS vs 60 FPS: zero differences in the same fields across all 16 scenarios.
- Server vs Godot: 16/16 outcome agreement, 7/16 strict tolerance matches, Town Hall HP MAE
  0.04685625, destroyed-building MAE 1.25, duration MAE 5.52175 seconds, zero failed cases.
- The low-FPS post-victory extra-hit regression was reproduced at 10/20 FPS and fixed by stopping
  attacker physics immediately when the Town Hall is destroyed.

## Verification

- `server/test-client-server-combat-parity.js`: PASS
- `server/test-player-ship-migration.js`: PASS
- `server/test-mortar-combat.js`: PASS
- `server/test-necromancer-combat.js`: PASS
- `server/test-ranked-global-matchmaking.js`: PASS
- `server/test-raid-bot-pool.js`: PASS
- `tools/tests/test_combat_clock.gd` at 10 and 20 FPS: PASS
- Existing repository balance/regression command: PASS before the final narrow slot/pool tuning;
  all affected focused tests were re-run afterward.

## Residual risk

An exhaustive base-by-army cross-product was attempted twice, but exceeded the bounded local
runtime (five minutes for 60 bases and four minutes for 12 bases) before writing a report. The
release decision therefore uses the completed 800-, 1,800-, and 3,000-battle sampled populations
plus real Godot parity runs. Production telemetry should still be monitored after deployment.
