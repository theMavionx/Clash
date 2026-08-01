# Balance Check: Harpoon Mage-Tower Range — 2026-08-01

## Data Sources Analyzed

- `server/combat_defs.js`
- `scripts/tower_harpoon.gd`
- `scripts/tower_mage.gd`
- `scripts/building_system.gd`
- `design/gdd/harpoon-defense.md`
- authoritative Harpoon combat traces and the TH5-TH7 PvP balance lab

## Health Summary: HEALTHY

The live Harpoon endpoints were materially shorter than the same-level Mage Tower: 1.55 versus
1.95 at L6 and 1.70 versus 2.08 at L7. The new curve matches Mage Tower from L3 through L7 and
extends naturally to 2.20 at the future L8, without decreasing L1-L2.

## Outliers Detected

| Item | Expected range | Old | New |
|---|---:|---:|---:|
| L6 search radius | near Mage Tower L6 (1.95) | 1.55 | 1.95 |
| L7 search radius | near Mage Tower L7 (2.08) | 1.70 | 2.08 |
| Control uptime | no increase | 11.43% maximum | 11.43% maximum |

## Degenerate Strategies Found

None introduced. Harpoon remains air-only, reserves one target, reloads for seven seconds, and has
at most 0.80 seconds of pull per cycle. Search coverage increased, but pull speed and maximum
displacement did not. A full-range L6 target now finishes near distance 0.99 instead of being pulled
all the way to the 0.60 stop ring.

## Progression Analysis

The range curve is now `1.20 / 1.27 / 1.45 / 1.64 / 1.82 / 1.95 / 2.08 / 2.20`. It is monotonic,
does not nerf early levels, matches Mage Tower at L3-L7, and remains below same-level Archer Tower
at the live L6-L7 endpoints.

## Verification

- Authoritative Harpoon combat and expanded full-range pull assertions: PASS.
- Godot Harpoon client probe and TH7 progression probe: PASS.
- Client/server combat parity: PASS.
- TH6 scenario search: 135 wins out of 200 before and after the range change.
- TH5-TH7 same-TH hard-base lab: 29.3% to 29.0% attacker wins, 300 matches, 0 invalid.
- Quick repository regression suite, including ranked global matchmaking: PASS.

## Recommendations

| Priority | Issue | Suggested action | Impact |
|---|---|---|---|
| Monitor | All-air live sample is still small | Track Harpoon locks per raid and specialized air win rate | Confirms real-layout effect |
| Future | Two L8 Harpoons are not live | Revalidate 2.20 range before TH8 launch | Prevents overlapping denial zones |

## Values That Need Attention

No immediate retuning is required. Damage, reload, pull duration, pull speed, and immunity should
remain fixed until live telemetry shows the increased search coverage overperforming.
