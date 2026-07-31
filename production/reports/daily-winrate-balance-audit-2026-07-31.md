# Daily Win-Rate Balance Audit — 2026-07-31

## Scope

- Production `raid_matchmaking` outcomes, read-only, trailing 24 hours ending approximately 2026-07-31 10:50 UTC.
- Comparison with the preceding 24-hour window.
- Focused replay checks for the three highest-volume TH5–TH7 attackers.
- Local deterministic matchmaking and combat simulation only; no production data was mutated.

## Result

The trailing 24-hour attacker win rate was **66.10%**: 271 victories and 139 defeats across 410 decided raids. The configured global target is 57%, with an acceptable 55–60% band.

The aggregate concealed a severe split rather than a uniform troop-stat problem:

| Segment | Decided | Wins | Win rate |
|---|---:|---:|---:|
| TH2 | 42 | 42 | 100.00% |
| TH3 | 20 | 8 | 40.00% |
| TH5 | 59 | 53 | 89.83% |
| TH6 | 103 | 20 | 19.42% |
| TH7 | 174 | 138 | 79.31% |

Four high-volume players supplied most of the sample. One TH7 player produced 180 rows at 81.21% wins, one TH6 player produced 94 rows at 12.90%, one TH5 player produced 51 rows at 97.67%, and one TH2 player produced 34 rows at 100%.

## Root causes

1. **Recovery requested a difficulty that is intentionally not part of the catalog.** The profile selected `easy`, while the generated catalog contained only competitive `normal` and `hard` bases. That mismatch was misleading in API diagnostics and candidate scoring.
2. **Normal and hard high-tier templates are both intentionally demanding.** Normal downgrades at most two buildings, frequently only economy buildings; hard keeps every defense at the Town Hall cap. Per owner direction, no weakened easy-defense catalog should be added.
3. **Layout geometry was absent from candidate strength.** Bases with equal counts and levels had near-identical power scores even though deterministic simulation showed large archetype differences.
4. **Strong low-tier players could remain on live targets.** Bot inclusion did not explicitly cover `strong_player`, and score bias preferred live targets, contributing to the observed TH2 100% result.
5. **The strongest same-tier target could remain below the configured hard ratio.** A proven strong attacker could keep farming the same tier because exact-tier selection ignored that no same-tier base reached the hard band.
6. **Recent-result ordering was ambiguous inside one-second timestamps.** Recovery streak calculation ordered only by `created_at`; `id DESC` is now the deterministic tie-breaker.

No global troop nerf was applied. Production rosters and deterministic combat results showed opposite TH6 and TH7 outcomes with the same Demon King + Fire Dragon family, which rules out one uniform stat adjustment as a safe correction.

## Measures implemented locally

- Retained the 859-base competitive catalog: 172 `normal` and 687 `hard` templates, with no generated `easy` targets.
- Recovery now reports and samples the same-Town-Hall competitive `normal` pool. It does not reduce defense levels or create a separate easy layout class.
- Strong players use the `corner-keep` and `rear-keep` hard-layout pool. On the existing production TH7 sample, those layouts produced 55.56% wins versus 79.10% for the former complete hard pool.
- A strong attacker moves up at most one bot tier only when the strongest same-tier hard base is still below the configured hard power band. Recovery never moves a player up.
- Strong players now select exclusively from the controlled hard bot pool, including early Town Halls with many live targets; weighted randomness can no longer return them to an easier live-base path.
- Matchmaking responses expose `target_bot_archetype` and `attack_highest_troop_level` for future diagnosis.

## Verification

- `server/test-raid-bot-pool.js`: PASS repeatedly; validates the exact normal/hard-only inventory, competitive defense levels, unique layouts, strong TH2 bot routing, one-tier challenge escalation, challenge archetypes, and normal-only recovery routing.
- `server/test-admin-troop-balance-analytics.js`: PASS.
- Quick repository regression suite: PASS, including grid sync, casualty settlement/idempotency, player-ship migration, client/server combat parity, Aptos key pools, rewards workers, and focused combat regressions.
- A targeted TH6 replay confirmed that weakening defenses would increase recovery wins, but that option was explicitly rejected and is not included. Recovery remains in the competitive normal pool.
- Production TH7 historical hard outcomes:
  - former full hard pool: 79.10%;
  - new `corner-keep` + `rear-keep` challenge pool: 55.56%.
- Local same-TH combat population, 1,500 battles / 120 bases / 250 policies: 0 invalid simulations. Pure-unit cohorts remained within the intended tier range: TH5 52.9%, TH6 55.9%, TH7 54.4%. The broader exploratory population was 46.3%, so the change remains matchmaking-only and does not weaken troop stats.

## Follow-up measurement

After deployment, evaluate at least 200 decided raids and report global, per-TH, selection reason, recovery level, bot difficulty, and bot archetype. The immediate acceptance criteria are:

- global 55–60%;
- TH5–TH7 each 50–62% while samples remain small;
- no generated or selected bot reports `target_bot_difficulty=easy`;
- strong TH2–TH7 players consistently route into the controlled hard pool;
- challenge-pool win rate 50–60%.
