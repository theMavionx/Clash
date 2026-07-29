# Balance Check: Cannon L1-L7

## Data Sources Analyzed

- `design/gdd/cannon-town-hall-7.md`
- `design/balance/troop-capacity-rebalance-2026-07-25.md`
- `design/balance/main-ship-progression-2026-07-25.md`
- `scripts/building_system.gd`
- `scripts/cannon.gd`
- `scripts/tower_archer.gd`
- `server/db.js`
- `server/combat_defs.js`
- `server/combat_session.js`
- `production/reports/th7-cannon-levels-balance-lab-2026-07-28.json`
- `production/reports/th7-cannon-ablation-balance-lab-2026-07-28.json`

## Health Summary: CANNON HEALTHY / TH7 COMBAT CONCERNS

The Cannon curve meets the owner-selected target: every level is within 0.3% of the
same-level Archer Tower's theoretical DPS and L7 is exactly 1,000 DPS for both defenses.
Cannon does not strictly dominate Archer Tower because it cannot target air, has shorter
high-level range (2.00 versus 2.30), starts each engagement with a delayed projectile, and
loses efficiency to overkill against small targets. It instead gains heavier individual hits
and greater early-level HP.

The complete TH7 defense package remains substantially stronger than the current offense.
This is an acknowledged follow-up domain: the owner chose to keep Cannon near Archer Tower
and strengthen units separately.

## Outliers Detected

| Item/Value | Expected Range | Actual | Issue |
|---|---:|---:|---|
| Cannon/Archer DPS ratio, L1-L7 | 0.95-1.05 | 0.997-1.002 | Healthy parity |
| Cannon L7 DPS | About Archer Tower L7 | 1,000 versus 1,000 | Exact target |
| Cannon L7 range | Below Archer Tower L7 | 2.00 versus 2.30 | Healthy role separation |
| TH7 attacker win rate | 47-63% lab target band | 7.6% | Global TH7 offense deficit |
| TH7-to-TH7 attacker win rate | 47-63% lab target band | 9.0% | Global TH7 offense deficit |

## Progression Analysis

| Level | Cannon DPS | Archer DPS | Ratio | Cannon HP | Upgrade cost (G/W/O) |
|---:|---:|---:|---:|---:|---|
| 1 | 25.0 | 25.0 | 1.000 | 3,200 | Build: 6,800 / 15,500 / 13,000 |
| 2 | 90.9 | 91.2 | 0.997 | 3,900 | 9,500 / 22,000 / 18,000 |
| 3 | 215.8 | 215.4 | 1.002 | 4,700 | 14,000 / 32,000 / 27,000 |
| 4 | 358.8 | 359.1 | 0.999 | 5,600 | 20,000 / 45,000 / 38,000 |
| 5 | 552.9 | 552.6 | 1.001 | 6,600 | 29,000 / 61,000 / 52,000 |
| 6 | 743.8 | 742.9 | 1.001 | 7,700 | 41,000 / 81,000 / 69,000 |
| 7 | 1,000.0 | 1,000.0 | 1.000 | 9,000 | 56,000 / 106,000 / 90,000 |

Every individual payment fits the legal TH7 resource capacity of 143,000. One complete
Cannon costs 176,300 Gold, 362,500 Wood, and 307,000 Ore including construction. At maximum
TH7 production, its Wood and Ore requirements represent about 5.0 and 5.7 hours of raw
production respectively, before other sinks.

## Time-to-Kill Comparison at L7

The table ignores acquisition and projectile travel and starts the clock at the first normal
fire interval.

| Ground target | HP | Cannon shots / time | Archer shots / time |
|---|---:|---:|---:|
| Archer L7 | 840 | 2 / 1.50 s | 3 / 0.96 s |
| Knight L7 | 1,900 | 3 / 2.25 s | 6 / 1.92 s |
| Mage L7 | 2,070 | 3 / 2.25 s | 7 / 2.24 s |
| Ice Golem L7 | 21,000 | 28 / 21.00 s | 66 / 21.12 s |

This shows the intended distinction: sustained damage converges on high-HP targets, while
Cannon's large projectile can lose time to overkill against small targets.

## Degenerate Strategies Found

- Two maxed Cannons add 2,000 ground-only DPS, but do not invalidate flying armies and do not
  replace Archer Towers because they cannot cover air or the outer 0.30 units of Archer range.
- No Cannon level is strictly better than the same-level Archer Tower across targeting,
  range, cadence, and overkill efficiency.
- A deterministic ablation with Cannon fire disabled raised overall wins from 22/288 to
  26/288 and TH7-to-TH7 wins from 20/221 to 23/221. Cannon is material but is not the root
  cause of the broader TH7 defense advantage.

## Recommendations

| Priority | Issue | Suggested Fix | Impact |
|---|---|---|---|
| High | TH7 offense trails the full defense package | Add the planned TH7 unit/ship offense pass | Raises overall base playability without weakening Cannon identity |
| Medium | Small-target overkill makes Cannon feel less consistent | Preserve it as role identity; do not add splash | Keeps Archer Tower and Cannon tactically distinct |
| Low | L1 is intentionally transitional at a late unlock | Keep explicit affordable early upgrades | Lets players reach competitive mid-levels quickly |

## Values That Need Attention

No Cannon value needs immediate reduction under the owner-selected Archer Tower parity target.
The next balance work should focus on TH7 attacking-unit power, army capacity, or tactical
tools and then rerun the same seed `727` A/B lab.
