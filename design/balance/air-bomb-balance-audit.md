# Air Bomb provisional balance audit

> Status: CONCERNS - implementation curve is internally consistent, but live
> TH9 armies/economy do not exist yet, so this is not a production balance lock.
> Updated: 2026-08-01

## Invariants checked

- Damage grows from 140 to 1,880 (13.43x) while current primary flying troop HP
  grows roughly 10x through the existing seven-level curve. The last two Air
  Bomb levels intentionally reserve headroom for future TH8/TH9 troops.
- HP grows from 3,200 to 15,200 (4.75x).
- Range grows only 17.8% (2.25 to 2.65).
- Reload (270 ticks), splash radius (0.31), rise (21 ticks), homing speed (1.19),
  turning speed and maximum homing lifetime never improve with level.
- The owner-requested radius change is a 50% reduction in linear radius
  (`0.62 -> 0.31`) and therefore a 75% reduction in covered area
  (`1.208 -> 0.302` square world units).
- The owner-requested 30% flight-speed reduction (`1.70 -> 1.19`) increases the
  1.50-unit reference flight from 50 to 71 movement ticks (about 0.35 seconds)
  without changing damage, reload cadence, or turn speed.
- At 1.19 units/s and 144 homing ticks, one projectile can travel at most 2.856
  horizontal world units after its rise. A static target at the L9 acquisition
  edge (2.65) remains reachable; a fastest-tier flyer continuously retreating
  from the projectile can intentionally bait it into the lifetime limit.
- Target loss no longer wastes a committed shot when another valid flyer is
  nearby. Retargeting uses the launch-time range from the projectile's current
  position, never resets the 144-tick lifetime, and can still produce only one
  impact. This improves reliability against staggered air groups without raising
  per-hit damage, splash size, cadence, or maximum projectile travel distance.
- A level upgrade therefore adds visible damage/HP and modest coverage, never a
  hidden attack-speed multiplier.
- Ground-only armies receive exactly zero acquisition and zero splash damage.

## Current-air reference points

These references use current authoritative L7 HP and one same-level Air Bomb.
They intentionally exclude other defenses, movement, Freeze and building focus.

| Flying troop | L7 HP | Air Bomb L7 damage | Center hits to defeat | Approx. reload span after first hit |
|---|---:|---:|---:|---:|
| Mechanical Dragon | 5,704 | 1,200 | 5 | 18.0 s |
| Fire Dragon | 15,208 | 1,200 | 13 | 54.0 s |

At the 50% splash edge those hit counts approximately double. Two legal Air
Bombs can punish a clump materially, but one building cannot quickly erase a
same-tier tank flyer. The 0.35-second vertical lift adds readable reaction time
without changing the fixed 4.5-second cadence.

## Risks and launch gate

- There are no authoritative TH9 troop levels, storage capacities, bot layouts
  or target win-rate bands yet. L8-L9 costs and combat values are provisional.
- Splash value depends strongly on real deployment spacing; isolated-fixture
  DPS cannot establish the intended win-rate effect.
- Projectile-centered retargeting can select a replacement outside the original
  building-centered coverage circle when the bomb is already near its edge.
  Lifetime and one-impact limits bound that extension, but staggered-air live
  telemetry should be compared before and after this behavior ships at TH9.
- Before live TH9 promotion, run split, staggered, clumped swarm, tank-air,
  mixed, Freeze and ground-only matrices against two Air Bombs and all other
  legal TH9 defenses. Lock values only after those runs meet the future TH9
  win-rate target.

Current verdict: safe to keep data-ready behind the unreachable TH9 gate; not
approved for widening the live Town Hall cap.
