# Defense Range Rebalance — 2026-08-09

> Follow-up: the firing radius remains `1.05`, while the later Hidden Tesla
> warning pass moved only the proximity reveal radius from `0.875` to `1.20`.
> See `hidden-tesla-late-warning-balance-check-2026-08-09.md` for current evidence.

## Balance Check Report

**Verdict:** BALANCED for the requested global range pass. The representative mixed-army cohort is within 0.67 percentage points of the 55% attacker-win target. TH-specific policy outliers remain and should be handled as a separate troop/army progression pass rather than hidden by globally inflating defense damage.

## Scope

- Hidden Tesla attack radius was reduced exactly 50%, from `2.10` to `1.05`.
- Hidden Tesla proximity reveal radius was reduced exactly 50%, from `1.75` to `0.875`.
- The remaining defenses received role-based compact range curves instead of one shared multiplier.
- Client GDScript, authoritative server definitions, shared Flamethrower data, test fixtures, and GDD tables were synchronized.
- Damage, cadence, projectile speed, splash, pull strength, and HP were not increased to compensate for the shorter range.

## Final Range Curves

The canonical battle cell is `0.137931` world units and the island is about 29 cells wide. Even the longest defense now reaches about 13.4 cells rather than covering most of the island.

| Defense | L1 range | L10 range | L10 cells | Role |
|---|---:|---:|---:|---|
| Hidden Tesla | 1.05 | 1.05 | 7.6 | concealed close/mid-range single target |
| Turret | 0.95 | 1.50 | 10.9 | fast general-purpose projectile |
| Archer Tower | 1.00 | 1.75 | 12.7 | longer general-purpose coverage |
| Mage Tower | 0.95 | 1.43 | 10.4 | short-range ramping beam |
| Mortar | 1.10 | 1.85 | 13.4 | long-range ground splash; min range 0.45–0.69 |
| Air Bomb | 1.10 | 1.85 | 13.4 | long-range anti-air splash |
| Cannon | 1.00 | 1.60 | 11.6 | ground-only direct fire |
| Harpoon | 0.95 | 1.70 | 12.3 | anti-air control with 7 s reload |
| Flamethrower | 0.80 | 1.55 | 11.2 | fixed-sector ground stream |
| Skeleton Guard detection | 0.70 | 0.95 | 6.9 | local interception; fixed after L5 |

## Combat Power Sanity Check

Damage values and attack cadence were intentionally preserved. Representative L10 values:

| Defense | Damage model | Approx. sustained DPS | Notes |
|---|---:|---:|---|
| Turret | 660 / 0.70 s | 942.9 | direct projectile |
| Archer Tower | 570 / 1.00 s | 570.0 | direct projectile |
| Mage Tower | 82–430 / 0.25 s | 328–1720 | ramps while beam remains connected |
| Mortar | 415 / 2.40 s | 172.9 | splash; has dead zone |
| Air Bomb | 2280 / 4.50 s | 506.7 | air-only splash |
| Cannon | 840 / 1.60 s | 525.0 | ground-only |
| Harpoon | 126 / 7.00 s | 18.0 | value is primarily pull/control |
| Hidden Tesla | 707 / 0.65 s | 1087.7 | single target, concealed until proximity reveal |
| Flamethrower | 3 × 400 / 1.50 s | 800.0 | ground cone; fixed facing |

No defense received a hidden damage multiplier. The balance lab supports experimental per-level/per-type scaling, but those switches do not affect production combat.

## Simulation Results

Command:

```text
node tools/pvp-balance/run.js --bases 200 --matches 3000 --attack-policies 300 --same-th-only --profile th1-th10 --seed 8091423
```

| Cohort | Attacker wins | Invalid |
|---|---:|---:|
| Mixed policy exploration | 54.33% (884 / 1627) | 0 |
| Pure-unit counter matrix | 85.80% (1178 / 1373) | 0 |
| Combined diagnostic sample | 68.73% (2062 / 3000) | 0 |

The mixed policy cohort is the release-facing balance signal because it uses valid mixed armies and deployment policies. The pure-unit matrix is a counter/discovery diagnostic; it intentionally includes degenerate single-unit armies and must not be used alone to multiply every defense's damage.

Mixed-policy results by Town Hall:

| TH | Attacker win rate |
|---:|---:|
| 1 | 61.96% |
| 2 | 72.39% |
| 3 | 38.65% |
| 4 | 60.74% |
| 5 | 58.90% |
| 6 | 63.80% |
| 7 | 53.37% |
| 8 | 29.63% |
| 9 | 34.57% |
| 10 | 69.14% |

These tier outliers predate the range pass and point to troop unlock/capacity and army-policy progression, especially at TH2, TH8, TH9, and TH10. They should be tuned with those systems in scope; compensating through global defense DPS would damage the already-correct 54.33% aggregate and distort TTK.

## Runtime Verification

- Authoritative Tesla replay: PASS — boundary `0.875`, attack range `1.05`, 30 reveal ticks, 39 reload ticks, ground/air single-target, Freeze and destroy behavior deterministic.
- Harpoon replay: PASS — compact L6–L9 pulls finish at the `0.60` stop ring, 7 s cadence, air-only targeting, reservation, Freeze interruption, and post-pull attack recovery.
- Cannon replay: PASS — compact targeting, deterministic tie-break, target-death projectile cleanup, ground-only behavior, and Freeze.
- Client/server combat parity: PASS for all ten levels of Turret, Archer, Mage, Mortar, Cannon, Harpoon, Air Bomb, Hidden Tesla, and guards.
- Godot client probes: PASS for Hidden Tesla, Harpoon, Air Bomb, Cannon levels, TH7 progression, and Tombstone guard cap.
- Rendered Hidden Tesla scene: PASS, 82 captured frames covering hidden, reveal, active, first lightning, reload, and second lightning.
- Hidden Tesla performance: two towers and 45 troops; hidden scan `1.671 µs`, active scan `1.651 µs`, 12,000 scan calls, zero persistent-node growth.
- Local Web export/browser smoke: PASS — main scene rendered in the Web build with no browser warnings or errors.

## Remaining Risk

The range change itself is synchronized and verified. A future balance pass should focus on the TH-specific army/progression outliers above and validate them against real player telemetry before changing damage. No production telemetry was available for this local pass.
