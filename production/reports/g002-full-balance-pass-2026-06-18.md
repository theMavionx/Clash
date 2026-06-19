# G-002 Full Game Balance Pass

Date: 2026-06-18
Status: implementation checkpoint complete

## Scope Covered

- Audited server/client combat constants for buildings, troops, defenses, resource caps, and TH gates.
- Added TH4 support to the PvP balance lab.
- Rebalanced TH4 PvP bot templates so TH4 is breakable by intended attackers.
- Ran PvP simulations for TH2/TH3, TH4, and mixed TH2-TH4 profiles.
- Checked current economy pacing from live server constants.

## Code Changes

- `tools/pvp-balance/run.js`
  - Added `th4` and `th2-th4` profiles.
  - Kept TH3 as an average-progress attacker profile (`[3, 2, 2]`) rather than a maxed-port profile.
  - Added TH4 fleet modeling for the PvP lab.

- `server/matchmaking_defs.js`
  - Reduced TH4 normal bot defense pressure:
    - Archer Towers from `4/4/3` to `3/3/2`.
    - Tombstones from `3/3/3` to `3/2/2`.
    - Turrets from `3/3/2` to `2/2/1`.
    - Mage Tower from level 2 to level 1.
  - Reduced TH4 hard bot defense pressure:
    - Archer Towers from `5/5/4` to `4/3/3`.
    - Tombstones from `4/4/3` to `3/3/2`.
    - Turrets from `4/4/3` to `3/2/2`.
    - Mage Towers from `3/2` to `2/1`.

## PvP Simulation Results

| Profile | Before | After | Target | Result |
|---|---:|---:|---:|---|
| TH4 only | 22.1% | 57.8% | 55% +/- 3% | healthy |
| TH2-TH3 | 59.1% | 59.1% | 55% +/- 3% | slight concern |
| TH2-TH4 mixed | not available | 56.9% | 55% +/- 3% | healthy |

Report files:

- `tools/pvp-balance/reports/g002-th4-before-values.md`
- `tools/pvp-balance/reports/g002-th4-tuned.md`
- `tools/pvp-balance/reports/g002-th2-th3-tuned.md`
- `tools/pvp-balance/reports/g002-th2-th4-tuned.md`
- `server/reports/combat_balance_2026-06-18T14-25-34-910Z.json`

## Key Findings

- TH4 was the real breakability blocker in the PvP bot templates. Normal and hard TH4 bots were acting like late-endgame fortress layouts, not ordinary TH4 targets.
- The fix should stay in bot-template tuning, not global troop DPS. Global troop buffs would over-buff TH2/TH3.
- Client/server gameplay constants are broadly synchronized for the production set:
  - Building HP/cost/unlock/count definitions match between `server/db.js` and `scripts/building_system.gd`.
  - Core troop stats match between `server/combat_defs.js` and `scripts/knight.gd`, `scripts/mage.gd`, `scripts/archer.gd`.
  - Defense stats match between `server/combat_defs.js` and `scripts/turret.gd`, `scripts/tower_archer.gd`, `scripts/tower_mage.gd`, `scripts/skeleton_guard.gd`.
  - Resource caps match between `server/db.js` and `scripts/building_system.gd`.
- `design/gdd/economy-balance.md` is stale against live code. Current server values are:
  - `GOLD_DAILY_TRADE = 450`
  - `GOLD_PER_USD_VOLUME = 0.50`
  - `GOLD_PER_USD_VOLUME_DECIBEL = 0.50`
  - target-player daily gold estimate: about 700G/day
- Full TH4 max-out remains a long-term monetization/progression gate:
  - Gross current max totals: 73,545G / 150,175W / 114,945O
  - Net after starting resources: 71,545G / 148,175W / 112,945O
  - At about 700G/day, gold max-out is roughly 102 days before raid income.

## Remaining Balance Notes

- TH2 is attacker-favored in the MVP lab, while TH3 hard scenarios are defender-favored. The mixed TH2-TH4 result is healthy because easy/normal/hard buckets offset each other.
- Hard bot templates should remain separated from recovery matchmaking. Struggling players should be routed to easy/normal targets.
- Economy code was not changed in this pass. The current pacing is not a hard dead-end, but it is a long max-out curve. Decide separately whether the desired business target is about 4 weeks, 8 weeks, or 12+ weeks.

## Verification

- `node --check tools/pvp-balance/run.js`
- `node --check server/matchmaking_defs.js`
- `npm.cmd run pvp:balance -- --matches 1000 --seed 43 --profile th4 --out tools/pvp-balance/reports/g002-th4-tuned.md`
- `npm.cmd run pvp:balance -- --matches 1000 --seed 42 --profile th2-th3 --out tools/pvp-balance/reports/g002-th2-th3-tuned.md`
- `npm.cmd run pvp:balance -- --matches 3000 --seed 44 --profile th2-th4 --out tools/pvp-balance/reports/g002-th2-th4-tuned.md`
