# Air Bomb production balance audit

> Status: PASS WITH MONITORING - TH9 economy, armies and bot layouts are live,
> and the deterministic TH8-TH9 matrix lands at 55.1% for TH9 with zero invalid
> replays. Monitor real clumped-air and multi-NFT cohorts.
> Updated: 2026-08-02

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

## Risks and monitoring

- Authoritative TH9 troop levels, storage capacity and 900 bot layouts now
  exist. L8-L9 costs fit the legal resource ceiling.
- Splash value depends strongly on real deployment spacing; isolated-fixture
  DPS cannot establish the intended win-rate effect.
- Projectile-centered retargeting can select a replacement outside the original
  building-centered coverage circle when the bomb is already near its edge.
  Lifetime and one-impact limits bound that extension, but staggered-air live
  telemetry should be compared before and after this behavior ships at TH9.
- Continue comparing split, staggered, clumped swarm, tank-air, mixed, Freeze
  and ground-only telemetry after launch; the deterministic matrix already
  exercises the legal TH9 defense inventory and all 100 spawn mechanics.

Current verdict: approved as part of the playable TH9 progression. TH9 reached
55.1% attacker wins over 675 same-tier simulations with zero invalid replays.
