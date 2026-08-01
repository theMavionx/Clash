# Fixed combat cadence balance check — 2026-08-01

## Scope and rule

Level upgrades no longer accelerate attacks. Each troop and defense keeps its
level-one attack interval at every level. Progression continues through HP,
damage, range, capacity, and authored utility. Rage remains a temporary tactical
effect rather than permanent level progression.

Mage Tower also moves to a compact range curve of
`1.05 / 1.15 / 1.25 / 1.35 / 1.45 / 1.55 / 1.65`, down from an L7 endpoint of
2.08. L7 radius falls 20.7% and circular coverage area falls 37.1%.

## Data sources analyzed

- `server/combat_defs.js`
- Godot troop and defense `LEVEL_STATS` under `scripts/`
- `design/gdd/cannon-town-hall-7.md`
- `design/gdd/harpoon-defense.md`
- `design/gdd/economy-balance.md`
- `tools/pvp-balance/run.js`

## Health summary

The old curves multiplied level damage growth by cadence growth, producing much
larger late-level DPS spikes than the displayed damage upgrade implied. Troops
transfer the old cadence contribution into per-hit damage, preserving their
intended sustained DPS and role relationships while making every level animate
at one predictable pace.

Defense L1 combat is unchanged. For L2+, the former cadence contribution is
first converted into per-hit damage, then held to 75% of the old sustained DPS.
This measured reduction was selected from a deterministic TH7 sweep: 65%, 75%,
and 85% produced 52.6%, 48.3%, and 44.3% attacker win rates respectively across
1,600 production replays. The 75% curve keeps TH7 deliberately hard without
returning to the prior 31.9% population win rate or making air-pressure policies
as universal as the 65% curve. A final no-multiplier replay against the exact
production tables reproduced 772/1,600 wins (48.3%) with 0 invalid battles.

### Highest live defense tier

| Defense | Old interval | Fixed interval | Old DPS | New hit | New DPS |
|---|---:|---:|---:|---:|---:|
| Turret L7 | 0.21 s | 0.70 s | 1500.0 | 788 | 1125.7 |
| Archer Tower L7 | 0.32 s | 1.00 s | 900.0 | 675 | 675.0 |
| Mage Tower L7 maximum beam | 0.10 s | 0.25 s | 2810.0 | 527 | 2108.0 |
| Mortar L7 direct | 1.70 s | 2.40 s | 270.6 | 487 | 202.9 |
| Cannon L7 | 0.75 s | 1.60 s | 900.0 | 1,080 | 675.0 |
| Tombstone guard L6 | 0.57 s | 0.86 s | 229.8 | 149 | 173.3 |

Harpoon was already fixed at 7.00 seconds and remains unchanged.

### Troops whose L7 cadence changed

| Troop | Old L7 interval | Fixed interval | Old → new raw hit | Sustained DPS |
|---|---:|---:|---:|---:|
| Knight | 0.90 s | 1.40 s | 202 → 314 | preserved |
| Mage | 0.70 s | 1.25 s | 2,387 → 4,263 | preserved |
| Necromancer | 0.81 s | 1.35 s | 5,120 → 8,533 | preserved |
| Barbarian | 0.36 s | 0.60 s | 124 → 207 | preserved |
| Archer | 0.62 s | 1.05 s | 250 → 423 | preserved |
| Ranger | 0.60 s | 1.00 s | 182 → 303 | preserved |
| Mimic | 1.06 s | 1.50 s | 870 → 1,231 | preserved |
| Demon King | 0.90 s | 1.40 s | 1,040 → 1,618 | preserved |
| Fire Dragon | 0.70 s | 1.25 s | 2,732 → 4,879 | preserved |

Wind Mage, Pea Shooter, Mechanical Dragon, Ice Golem, Windling, Harpoon, and
the level axis of Horror already used fixed cadence. Horror evolution-stage
cadence remains a stage mechanic, not a level bonus.

## Deployment-grid compatibility

The owner-authored home build grid is smaller in this release, while the shore
deployment grid is unchanged. The generated combat-grid snapshot now follows
the scene exactly. Cannon idle barrels resolve their one-time spawn heading
from the real deployment-zone center instead of relying on a fixed world yaw,
so all seven models remain visually aligned after grid transforms change.

Town Hall victory is also a hard combat boundary. Armed Shark Traps are
silently neutralized and excluded from the cosmetic building-destruction
cascade; the authoritative simulation cannot create a same-tick trap casualty
after a ship impact has already destroyed the Town Hall.

## Production-base breakability: Digger

The live TH7 snapshot for player `Digger` was fetched read-only from the admin
API on 2026-08-01. The replay preserves all 33 non-Port buildings, including
the live backline placements, and validates grid bounds, overlap, TH caps, and
the single Town Hall contract.

- The final 800-policy production sample records 53.9% attacker wins and zero
  invalid battles after the late-building and legal-capacity pass.
- Slot-cost migration version 3 permits at most nine L7 Mechanical Dragons in
  a 45-slot ship; the previous 11-dragon counter is no longer a legal roster.
- Digger remains a hard gate but is neither mechanically unbreakable nor
  dependent on an over-capacity composition. The reproducible evidence is in
  `production/reports/th5-th7-real-combat-fps-balance-2026-08-01.md`.

## Verification gates

- Client/server parity must prove every level table matches.
- A regression invariant must reject any future level-based cadence reduction.
- Focused Cannon and Mortar simulations must observe 1.60 s and 2.40 s.
- All seven Cannon muzzles must face the generated deployment-zone center
  within 1 degree before target acquisition.
- Town Hall victory must produce zero new Shark Trap triggers or casualties.
- TH7 production-layout simulation must remain deterministic and reject invalid
  bounds, overlaps, level caps, and Town Hall counts even when live backline
  placement is explicitly allowed.
