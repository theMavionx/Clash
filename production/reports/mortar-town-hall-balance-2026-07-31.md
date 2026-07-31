# Balance Check: Mortar Town Hall Progression

**Date:** 2026-07-31

**Scope:** Mortar levels 1-7, Town Hall caps 5-7, client/server parity, raid simulation
**Verdict:** HEALTHY, with TH7 telemetry to monitor

## Data Sources Analyzed

- `scripts/tower_mortar.gd` — client targeting, projectile timing, damage and splash presentation.
- `scripts/building_system.gd` — Town Hall level caps, health, cost and UI payloads.
- `server/combat_defs.js` — authoritative projectile and splash combat values.
- `server/db.js` — authoritative building levels, costs, hit points and trophy values.
- `server/matchmaking_defs.js` — competitive bot progression by Town Hall.
- `tools/pvp-balance/run.js` — deterministic same-Town-Hall raid simulation.
- `server/test-mortar-combat.js` — authoritative projectile, cadence and multi-target splash trace.

## Health Summary

The old Mortar progression stopped at L3 for TH7 even though the building had four partial stat tiers and the other major defenses reached L7. Its old splash radius of 0.22-0.34 was also smaller than the common 0.40 troop-neighbor spacing, so its intended area-denial role often collapsed into single-target damage.

The corrected curve now reaches L5 at TH5, L6 at TH6 and L7 at TH7. A same-seed 1,200-battle comparison lowered attacker win rate from 51.3% to 48.3% without invalid battles. This is a meaningful defensive improvement but remains inside the configured global target band of 47-63% attacker wins.

## Progression Analysis

| Level | TH cap | HP | Damage | Reload | Direct DPS | Range | Min range | Splash |
|---:|---:|---:|---:|---:|---:|---:|---:|---:|
| 1 | pre-TH5 data | 1,700 | 95 | 2.40 s | 39.6 | 1.43 | 0.70 | 0.30 |
| 2 | pre-TH5 data | 2,400 | 135 | 2.25 s | 60.0 | 1.60 | 0.75 | 0.34 |
| 3 | pre-TH5 data | 3,200 | 185 | 2.10 s | 88.1 | 1.77 | 0.80 | 0.38 |
| 4 | pre-TH5 data | 4,100 | 245 | 1.95 s | 125.6 | 1.93 | 0.82 | 0.42 |
| 5 | TH5 | 5,200 | 300 | 1.90 s | 157.9 | 2.10 | 0.82 | 0.45 |
| 6 | TH6 | 6,500 | 370 | 1.80 s | 205.6 | 2.25 | 0.80 | 0.49 |
| 7 | TH7 | 8,100 | 460 | 1.70 s | 270.6 | 2.40 | 0.78 | 0.52 |

At the three live Town Hall caps, a same-tier knight requires five direct hits: approximately 9.5 seconds at TH5, 9.0 seconds at TH6 and 8.5 seconds at TH7. The inner blind zone remains, preserving melee counterplay. Against tightly grouped units the server applies 45% splash falloff to neighbors instead of multiplying full direct damage.

## Outliers Detected

| Finding | Severity | Resolution |
|---|---|---|
| TH7 Mortar was capped at L3 while peer defenses reached L7 | High | Resolved with TH5/L5, TH6/L6 and TH7/L7 caps on client and server |
| Old splash radius was below common 0.40 formation spacing | High | Resolved with 0.45/0.49/0.52 late-game radii and an authoritative two-neighbor splash test |
| Only four authored visual levels exist | Low, visual | L4 visuals are deliberately reused for L5-L7; combat and progression remain distinct |

## Degenerate Strategies Found

No new degenerate strategy was reproduced. Mortar still cannot attack inside its 0.78-0.82 minimum range, targets only ground troops, uses delayed projectiles and remains vulnerable after melee units enter the blind zone. The building count remains one at TH5 and two from TH6 onward.

## Simulation Comparison

| Sample | Baseline attacker WR | Corrected attacker WR | Change | Invalid battles |
|---|---:|---:|---:|---:|
| All TH5-TH7, 1,200 battles | 51.3% | 48.3% | -3.0 pp | 0 |
| TH5 | 51.6% | 48.9% | -2.7 pp | 0 |
| TH6 | 53.5% | 49.8% | -3.7 pp | 0 |
| TH7 | 49.1% | 46.5% | -2.6 pp | 0 |

The TH7 point estimate is 0.5 percentage points below the nominal global lower band, but attackers still won 200 of 430 TH7 battles. Treat it as a monitoring signal rather than evidence of an unbreakable defense.

## Recommendations

| Priority | Recommendation | Reason |
|---:|---|---|
| 1 | Monitor live TH7 attacker win rate and clustered-unit losses | TH7 is close to the lower simulation boundary |
| 2 | Keep the current one/two Mortar count cap | More Mortars would amplify splash and reduce blind-zone counterplay |
| 3 | Author distinct L5-L7 visual upgrades later | Removes the remaining presentation debt without changing balance |

## Values That Need Attention

- TH7 attacker win rate: 46.5% in the completed deterministic sample; re-check after real player telemetry is available.
- The dedicated adversarial breakability search exceeded the local two-minute execution window in three reduced configurations. It did not produce a completed verdict. The strongest completed fallback is the 1,200-battle raid sample plus an authoritative combat trace confirming spawn, flight, impact, damage, cadence and splash behavior.
- L5-L7 currently reuse the authored L4 Mortar model and projectile presentation.
