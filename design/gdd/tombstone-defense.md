# Tombstone defense

> Status: implemented
> Scope: Tombstone skeleton count, guard progression, client/server parity
> Updated: 2026-08-03

## Role

Tombstone is a ground-control defense. It deploys persistent melee guards that
intercept hostile ground troops, create pathing pressure, and protect nearby
buildings. Guards cannot attack air targets. Destroying the owning Tombstone
removes its guards, and home-island respawn restores only the legal count for
that Tombstone level.

## Active-guard contract

Each Tombstone owns its own guard cap. Levels 1-5 add one guard per level;
levels 6-8 remain at five active guards. Upgrading beyond level 5 improves only
guard HP and per-hit damage. Attack interval, movement speed, detection radius,
formation size, and target rules do not improve after level 5.

| Tombstone level | Active guards | HP per guard | Damage per guard | Attack interval | Move speed | Detection radius | Total guard HP | Total hit damage |
|---:|---:|---:|---:|---:|---:|---:|---:|---:|
| 1 | 1 | 360 | 38 | 0.86 s | 0.46 | 0.95 | 360 | 38 |
| 2 | 2 | 520 | 53 | 0.86 s | 0.52 | 1.10 | 1,040 | 106 |
| 3 | 3 | 620 | 66 | 0.86 s | 0.54 | 1.25 | 1,860 | 198 |
| 4 | 4 | 820 | 97 | 0.86 s | 0.58 | 1.40 | 3,280 | 388 |
| 5 | 5 | 998 | 125 | 0.86 s | 0.60 | 1.52 | 4,990 | 625 |
| 6 | 5 | 1,378 | 179 | 0.86 s | 0.60 | 1.52 | 6,890 | 895 |
| 7 | 5 | 1,848 | 238 | 0.86 s | 0.60 | 1.52 | 9,240 | 1,190 |
| 8 | 5 | 2,416 | 310 | 0.86 s | 0.60 | 1.52 | 12,080 | 1,550 |

The L6-L8 per-guard values consolidate the previous six-, seven-, and
eight-body combat budgets into five guards. Aggregate HP is equal within two
points and aggregate per-swing damage is equal within two points of the prior
live curve. This removes excess agents without turning the count cap into a
late-game defense nerf.

## Runtime authority

- `server/combat_session.js` is authoritative for ranked replay outcomes and
  derives guard count from `SKELETON_GUARD.maxActivePerTombstone`.
- `scripts/building_system.gd` mirrors the cap for home, enemy, reset, upgrade,
  relocation, and battle spawns while applying the full Tombstone level to
  each guard's stats.
- Existing live Tombstone rows need no migration. The cap is derived at spawn
  time from their current level.
- Altar Ward continues to modify guard damage only. It does not create guards
  or raise their cap.
- Necromancer summons have an isolated source curve and are intentionally not
  changed by Tombstone tuning.

## Acceptance gates

1. Levels 1-8 spawn `1,2,3,4,5,5,5,5` guards on both client and server.
2. L6-L8 use their authored HP/damage tier even though body count remains five.
3. L6-L8 attack interval, movement speed, and detection radius equal L5.
4. A moved or respawned Tombstone cannot restore a sixth guard.
5. Client/server combat tables remain byte-for-value equivalent.
6. Late-wave target reacquisition remains functional after the cap change.
