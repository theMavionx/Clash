# Server ↔ Godot Combat Parity and FPS Audit

**Date:** 2026-07-29
**Engine:** Godot 4.6 stable
**Godot scene:** `res://scenes/TestMain.tscn`
**Server simulator:** `server/combat_session.js`
**Fixture population:** current TH1-TH7 maxed-offense catalog, 300 organized bases,
500 attack policies, seed `290729`

## Verdict

**CONDITIONALLY RELIABLE AND FPS-INDEPENDENT.**

The server simulator is suitable for aggregate balance iteration. It is not an
exact oracle for an individual replay: 47 of 50 outcomes matched Godot, while
only 22 of 50 cases met every strict HP/destruction/duration tolerance.

Godot combat itself is deterministic across the tested render rates. All 50
cases produced exactly the same outcome, Town Hall HP, destroyed-building
count, surviving-troop count, and combat duration at 30, 60, and 120 FPS.

## Method

1. Generate 50 exact server fixtures from the production balance catalog.
2. Instantiate a fresh production `TestMain.tscn` for every case.
3. Load the same building snapshot, troop levels, ship level, NFT rarity,
Ward level, deploy timings, spawn points, and tactical ability actions.
4. Run the Godot battle at 60 physics ticks per second.
5. Repeat the complete suite with fixed render rates of 30, 60, and 120 FPS.
6. Compare both server ↔ Godot and Godot FPS ↔ FPS results.

## Server ↔ Godot Result

| Metric | Result |
| --- | ---: |
| Cases | 50 |
| Outcome agreement | 47 / 50 (94.0%) |
| Strict agreement | 22 / 50 (44.0%) |
| Server victories | 28 / 50 |
| Godot victories | 29 / 50 |
| Aggregate win-rate difference | 2 percentage points |
| Town Hall HP mean absolute error | 10.74 percentage points |
| Destroyed buildings mean absolute error | 2.46 |
| Duration mean absolute error | 9.42 seconds |
| Invalid/error cases | 0 |

Outcome mismatches:

| Fixture | Matchup | Army | Spawn / tactic | Server | Godot |
| --- | --- | --- | --- | --- | --- |
| `battle-00031` | TH3 → TH3 | random-4 | wide-line / cannon-focus | defeat | victory |
| `battle-00036` | TH1 → TH1 | balanced | right-flank / rally-core | victory | defeat |
| `battle-00048` | TH6 → TH6 | pure Pea Shooter | wide-line / rally-core | defeat | victory |

## FPS Matrix

| Fixed render FPS | Physics Hz | Cases | Outcome agreement with server | Godot victories |
| ---: | ---: | ---: | ---: | ---: |
| 30 | 60 | 50 | 94.0% | 29 |
| 60 | 60 | 50 | 94.0% | 29 |
| 120 | 60 | 50 | 94.0% | 29 |

Across the three Godot runs:

- 0/50 differences in battle outcome;
- 0/50 differences in final Town Hall HP;
- 0/50 differences in destroyed-building count;
- 0/50 differences in surviving-troop count;
- 0/50 differences in combat duration;
- identical combat telemetry event counts.

Some sampled projectile coordinates differ by `0.001` after report rounding,
and runtime instance IDs/wall-clock timestamps naturally differ. These values
do not participate in authoritative damage or targeting and did not change any
combat result.

## FPS-Safety Changes

- `Necromancer` attack release, summon release, and skeleton activation tweens
now use physics processing.
- `Wind Mage` Windling activation tween now uses physics processing.
- `Skeleton Barrel` skeleton activation now uses physics processing.
- Live and replay Main Ship ability timers, projectiles, defeat checks, and
skeleton respawn checks now all advance in `_physics_process`.
- Destroyed defense roots and detached Archer Tower combat units stop
processing on the lethal physics tick; the delayed swell/explosion can no
longer emit a render-cadence-dependent final shot.
- Troops, summons, defenses, projectile simulation, target selection, and
attack state machines were audited and run from `_physics_process`.
- Cosmetic-only bob, fade, recoil, impact, UI, and VFX animation remains in
idle processing.

This follows Godot's documented model: gameplay logic belongs in
`_physics_process`, whose fixed tick rate is independent from rendered frame
rate, while `_process` is called once per rendered frame:

- https://docs.godotengine.org/en/4.6/tutorials/scripting/idle_and_physics_processing.html
- https://docs.godotengine.org/en/stable/tutorials/physics/interpolation/using_physics_interpolation.html
- https://docs.godotengine.org/en/4.6/classes/class_engine.html
- https://docs.godotengine.org/en/4.6/classes/class_projectsettings.html

## Remaining Limits

- The server simulator is reliable for population-level balance direction, but
the 6% outcome mismatch and 44% strict agreement prohibit treating it as an
exact replay oracle.
- Top policies and extreme base geometries should be confirmed in Godot before
future global stat changes.
- The headless dummy renderer logs existing null-material warnings, one
resource-at-exit warning, and Fire Dragon VFX pool expansion warnings. No
GDScript parse/runtime errors occurred, and these warnings did not alter the
deterministic combat result.
