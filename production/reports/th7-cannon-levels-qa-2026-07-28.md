# TH7 Cannon L1-L7 QA Report — 2026-07-28

## Verdict

PASS for the requested Cannon progression and combat implementation.

Town Hall 7 unlocks two Cannons and allows each one to upgrade sequentially from L1 through
L7 without another Town Hall gate. Godot and Node use matching HP, price, damage, cadence,
range, and max-level data. Each level loads its own authored scene and preserves the fixed-base,
rotating-barrel, muzzle, projectile, recoil, freeze, ward, and telemetry contracts.

## Final Cannon Profile

| Level | HP | Damage | Interval | Range | DPS |
|---:|---:|---:|---:|---:|---:|
| 1 | 3,200 | 40 | 1.60 s | 1.35 | 25.0 |
| 2 | 3,900 | 100 | 1.10 s | 1.45 | 90.9 |
| 3 | 4,700 | 205 | 0.95 s | 1.55 | 215.8 |
| 4 | 5,600 | 305 | 0.85 s | 1.65 | 358.8 |
| 5 | 6,600 | 470 | 0.85 s | 1.75 | 552.9 |
| 6 | 7,700 | 595 | 0.80 s | 1.85 | 743.8 |
| 7 | 9,000 | 750 | 0.75 s | 2.00 | 1,000.0 |

The DPS curve mirrors Archer Tower L1-L7 within 0.3%. Cannon remains distinct through
ground-only targeting, shorter high-level range, delayed projectile travel, and burst/overkill
behavior.

## Automated Verification

- Godot `test_th7_progression.gd`: `TH7_PROGRESSION_TEST_OK`.
- Godot `test_cannon_levels.gd`:
  `CANNON_LEVELS_TEST_OK levels=1-7 visuals=7 fixed_bases=7 scaled_footprints=7`.
- Godot `test_cannon.gd`:
  `PASS: Cannon base/yaw gate/ground targeting/projectile/recoil/freeze/ward/telemetry`.
- Godot GPU `cannon_alignment_capture.gd` rendered and inspected all seven Cannon levels
  against an angled target: maximum barrel aim error `0.0000 deg`, projectile flight error
  `0.0000 deg`, and projectile-to-live-muzzle spawn offset `0.000000`.
- The alignment capture exposed and verified a presentation-order correction: the live
  squash/recoil pose is now composed before the muzzle transform is sampled, so the
  projectile starts at the visible barrel opening rather than at its previous-frame position.
- Runtime size validation now uses the same per-level scales as `BuildingSystem`. Cannon
  foundations measure `0.357-0.374` world units, filling `80.1-91.4%` of their `3x3`
  footprint per horizontal axis; Archer Tower L3-L7 measures `0.302 x 0.350`.
- The normalized game-scale GPU pass also corrected the projectile visual profile and a
  non-uniform-transform trail bug. The cannonball now fits the muzzle, and the trail's live
  Y basis is asserted to equal its capped `0.10` world-unit length and flight direction.
- Building Cannon projectiles now match the Main Ship projectile profile exactly:
  matte-black `Color(0.05, 0.05, 0.05)` with unshaded rendering. The former orange
  cannonball highlight is now a neutral dark-gray readability facet.
- The real hidden OpenGL Compatibility startup pass executes a dedicated
  `building_cannon` step. It rasterized all seven level scenes plus the exact ball,
  highlight, trail, impact, and muzzle-flash variants and completed without errors;
  the cold Cannon step took `219 ms` in the focused desktop probe.
- Node client/server parity:
  `defenses=turret7,archer7,mage7,mortar4,cannon7,guards6`.
- Node TH7 progression:
  `cannons=2xL7`; the test performs every real server upgrade from L1 to L7 and rejects L8.
- Node Cannon combat:
  first fire `0.95 s`, cadence `0.75 s`, hit `750`, Ward L1 hit `788`, deterministic tie
  order `2`, freeze duration `7 s`.
- Existing Node TH6 progression regression remains PASS.
- Export manifest generation resolves 527 project resources including Cannon L1-L7.

## Balance Evidence

The deterministic seed-727 lab generated 144 TH7 bases and ran 288 production replay
simulations:

- final Cannon curve: 22/288 attacker wins (7.6%), 0 invalid;
- TH7-to-TH7: 20/221 attacker wins (9.0%);
- Cannon-fire ablation: 26/288 overall and 23/221 TH7-to-TH7.

The owner explicitly chose Cannon/Archer Tower parity and plans a separate attacker-unit buff.
The broad TH7 offense deficit is therefore recorded as follow-up balance work rather than a
Cannon implementation failure.

## Remaining Manual Check

A normal-camera owner playtest is still useful for subjective pacing of seven consecutive
upgrade reveals and the L7 heavy-shot feel. The authoritative progression, scene hierarchy,
combat behavior, and parity contracts are automated and passing.

No commit, push, or deployment was requested or performed.
