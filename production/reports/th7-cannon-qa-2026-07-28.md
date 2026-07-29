# TH7 / Cannon QA Report — 2026-07-28

> Superseded for Cannon progression by
> `production/reports/th7-cannon-levels-qa-2026-07-28.md`, which validates the later L1-L7
> implementation. This report remains the historical L1 baseline.

## Verdict

**PASS**

All requested focused Godot and Node test suites pass. The automated evidence covers TH7
progression, client/server data parity, Cannon ground-only acquisition, fixed-base/yaw behavior,
projectile damage and single-hit behavior, cadence, freeze, ward bonus, replay telemetry, and
the requested TH6/non-Cannon regressions.

The regenerated authored capture set visibly demonstrates anticipation, muzzle flash, recoil,
recovery, a dark highlighted cannonball with a short trail in flight, and an orange impact burst.
This closes the initial presentation-readability concern.

## Scope and environment

- Design reviewed: `design/gdd/cannon-town-hall-7.md`
- Architecture reviewed: `docs/architecture/cannon-th7-architecture.md`
- Branch observed: `main`
- Godot: `C:/Users/Admin/Downloads/Clash-main/Godot_v4.6-stable_win64_console.exe`
- Engine output: `Godot Engine v4.6.stable.official.89cea1439`
- Node tests run from: `server/`
- QA did not edit implementation files.

## Automated verification

### Godot: TH7 progression

Command:

```powershell
& 'C:/Users/Admin/Downloads/Clash-main/Godot_v4.6-stable_win64_console.exe' --headless --path . --script tools/tests/test_th7_progression.gd
```

Result: **PASS**, exit code 0.

Evidence:

```text
TH7_PROGRESSION_TEST_OK
```

The final root-agent rerun completed without resource-leak diagnostics.

### Godot: Cannon scene behavior

Command:

```powershell
& 'C:/Users/Admin/Downloads/Clash-main/Godot_v4.6-stable_win64_console.exe' --headless --path . --script tools/tests/test_cannon.gd
```

Result: **PASS**, exit code 0. Re-run after the projectile/impact presentation update.

Evidence:

```text
PASS: Cannon base/yaw gate/ground targeting/projectile/recoil/freeze/ward/telemetry
```

The focused assertions verify:

- `Cannon1Base` keeps its captured authored transform during anticipation and firing.
- `Cannon1` yaws toward the valid ground target and must converge within the firing tolerance.
- A nearer air troop is ignored.
- Fire waits for the 0.95-second cadence.
- One projectile deals exactly 420 damage once.
- Mid-flight cannonball, warm highlight, directional trail, and pooled impact-burst lifecycle.
- Recoil reaches 0.18 units and recovery restores the captured barrel rest position and scale.
- Freeze, ward-adjusted damage, and Cannon telemetry execute.

### Node: requested server and regression suites

Command:

```powershell
node test-client-server-combat-parity.js
node test-th7-progression.js
node test-cannon-combat.js
node test-th6-progression.js
node test-ice-golem-combat.js
node test-combat-grid-sync.js
```

All six commands completed in sequence with **PASS** and the combined process exited 0.

Evidence:

```text
[COMBAT_PARITY] PASS ... defenses=turret7,archer7,mage7,mortar4,cannon1,guards6 ... progression=th7_cannon
[TH7_PROGRESSION] PASS cost=70000/100000/92000 th6_capacity=106000 th7_capacity=143000 cannons=2 port=3 altar=1
[CANNON_COMBAT] PASS first_fire=1.15 cadence=0.95 hit=420 ward=441 tie_order=2 freeze=7s
[TH6_PROGRESSION] PASS th6=true mortars=2 shark_traps=3 mimic_th=5 ship_capacity=45 manual_deploy=45 mechanical_dragons=11 ice_golems=4 necromancers=3
[ICE_GOLEM_SERVER] PASS first_target=turret guard_hit_t=0.98 freeze_t=0.37 affected=20,30
[combat-grid-test] PASS version=ea6b056dcf7afe28
```

Coverage established by these suites:

- Godot `LEVEL_STATS` / Node `DEFENSE_STATS` and TH7 progression mirrors agree.
- Legal TH6 capacity can pay the TH7 upgrade cost; TH7 capacity reaches 143,000 with three
  L7 Storages.
- Cannon is unavailable before TH7, capped at two buildings, and capped at L1.
- Port remains capped at L3 and Altar at L1.
- Cannon ignores air, selects ground targets deterministically, preserves replay tie ordering,
  emits `defenseType: cannon`, applies 420 base damage, observes 0.95-second cadence, loses
  invalid targets without duplicate damage, and supports ward/freeze/destruction behavior.
- Existing TH6 progression, Ice Golem combat, and combat-grid synchronization remain passing.

## Capture inspection

All six requested PNG files exist under `.codex-artifacts/cannon_capture/`, are non-empty, and
were inspected:

| Capture | Size | QA observation |
|---|---:|---|
| `01_anticipation.png` | 32,672 bytes | Cannon and target are visible; barrel pose differs from later frames. |
| `02_fire.png` | 33,119 bytes | Small warm muzzle flash is visible at the barrel opening. |
| `03_recoil_peak.png` | 31,121 bytes | Recoiled barrel pose and muzzle flash are visible; base/legs remain fixed. |
| `04_recovery.png` | 33,344 bytes | Barrel returns toward its rest pose; base remains visually fixed. |
| `05_projectile_flight.png` | 33,271 bytes | Dark low-poly cannonball, warm highlight, and short orange directional trail are visibly separated from the muzzle. |
| `06_impact.png` | 32,629 bytes | Bright expanding orange impact core/burst is clearly visible over the target. |

The regenerated sequence supports fixed-base and independently moving-barrel presentation and
provides readable visual proof of projectile flight and impact.

## Findings and remaining risks

### QA-CANNON-001 — Flight/impact capture evidence was not visually readable

- Status: **Resolved and verified**
- Original severity: **S3**
- Resolution evidence: regenerated `05_projectile_flight.png` and `06_impact.png`
- Verification: visual inspection confirms the separated dark cannonball/highlight/trail and
  the active impact burst; the focused Godot Cannon test passes after the update.

Additional remaining risks:

- No interactive local village/API playtest was run in this focused QA pass. Server build
  rejection and data parity are covered by automated tests, but the end-to-end UI flow for
  placing two Cannons, rejecting the third, and viewing combat in the normal game camera remains
  unverified here.
- The final root-agent reruns of both focused Godot suites exited cleanly. Earlier intermediate
  Cannon runs exposed a test-cleanup warning, which was removed before this final report.
