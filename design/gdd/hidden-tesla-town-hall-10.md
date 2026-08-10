# Town Hall 10 and Hidden Tesla

> Status: implemented and locally verified
> Date: 2026-08-08
> Canonical building key: `hidden_tesla`

## Scope

Town Hall 10 becomes the live progression cap in Godot, the Node server, combat
snapshots/replays, bot villages, admin/max-village tools, the React UI, exports,
and local test fixtures. The existing authored `Town Hall Level 10.glb`, its
palette, and flag texture are the production TH10 visual.

TH-based buildings receive a tenth progression row and track the Town Hall
level one-for-one through TH10. Intentional caps remain intentional: Port stays
L3 and Altar stays L1. Tombstone now reaches L9 at TH9 and L10 at TH10 like the
other standard buildings. Flamethrower already has an authored L10 row. Hidden Tesla unlocks at TH10
and may be upgraded from L1 through L10 immediately, matching the existing
Cannon/Air Bomb late-unlock convention.

Recommended TH10 count is two Hidden Teslas. This adds a meaningful surprise
defense without importing Clash of Clans' whole historical four-Tesla economy
into a base whose scale and army sizes differ from that game.

## Hidden and reveal states

Hidden Tesla is a 2x2 defense with four authoritative states:

1. `hidden`: the complete defense is concealed from the attacker, including its
   tower, hatch, anchors, selection outline, HP UI, and range indicator. It
   cannot fire and is excluded from every direct target-selection path.
2. `revealing`: hatch halves open and the tower rises for 30 simulation ticks
   (0.50 seconds); it remains untargetable and cannot deal damage.
3. `active`: tower is fully raised, targetable, and attacks normally.
4. `destroyed`: combat and VFX stop and ordinary destruction scoring applies.

Reveal is permanent for the rest of the battle. It begins only when a living,
deployed ground or air troop enters the 1.20-world-unit trigger radius. Dead or
undeployed troops, ships, projectiles, destruction percentage, and the survival
state of the Town Hall never reveal it.

The trigger is intentionally 0.15 units wider than the 1.05 firing range. This
is a late visual warning, not extra damage coverage: the hatch begins opening as
an already-deployed troop commits to the approach, but the Tesla remains unable
to target or damage anything outside 1.05 units or before the 30-tick reveal ends.

While hidden, proximity is sampled every 3 fixed ticks (20 Hz). This bounds the
additional reveal latency to 50 ms while avoiding a full troop scan every physics
frame. The server and Godot mirror use the same integer schedule.

At reveal tick zero, the complete defense becomes visible in its closed pose.
The two hatch halves rotate around their authored local-Z hinge axes to 160
degrees, ending 20 degrees above the grass. The tower starts rising only after
45 percent reveal progress, once the hatch has cleared the central opening, and
reaches its authored height before tick 30. The opened hatch remains visible
beside the tower in the active state.

The reveal tick, cause, building stable order, and triggering troop stable order
are recorded in replay telemetry. Troops with a defense preference cannot see or
path toward a hidden Tesla. Area effects may snapshot an already-hidden building,
but it does not become a direct troop target until `active`.

## Attack rules

- Valid targets: ground and air.
- Damage: single target; no splash and no chain damage.
- Attack range: fixed 1.05 world units.
- Target scan: every 9 fixed ticks, nearest valid target first, with stable replay
  order and stable unit id as deterministic tie-breakers.
- Fire cadence: one shot every 39 ticks (0.65 seconds), measured launch-to-launch.
- First shot: only after the reveal animation completes and a valid target exists.
- Hit resolution: direct authoritative hit on the fire tick. Lightning is visual;
  it never determines collision or damage.
- Freeze: pauses acquisition and firing but never resets the reveal state or
  cadence. Destruction cancels future shots and presentation immediately.
- Altar ward bonus uses the ordinary defense rule.

The Godot shot reuses `mechanical_lightning_vfx.gd`, the project's existing
electric-dragon lightning implementation, as one arc from the Tesla socket to
the authoritative target. It must not chain to secondary units.

## Final level curve

The compact damage curve keeps the firing range at exactly half of the original
2.10 coverage. The 1.20 reveal radius creates a 0.15-unit late-warning band.
Typical troop movement of 0.34-0.77 units per second crosses 0.17-0.385 units
during the 0.50-second rise, so an approaching unit normally reaches firing
range only as the reveal completes.

| Level | HP | Damage/shot | Range | Reload |
|---:|---:|---:|---:|---:|
| 1 | 1,800 | 40 | 1.05 | 0.65 s |
| 2 | 2,500 | 78 | 1.05 | 0.65 s |
| 3 | 3,300 | 172 | 1.05 | 0.65 s |
| 4 | 4,300 | 281 | 1.05 | 0.65 s |
| 5 | 5,400 | 343 | 1.05 | 0.65 s |
| 6 | 6,700 | 406 | 1.05 | 0.65 s |
| 7 | 8,200 | 473 | 1.05 | 0.65 s |
| 8 | 9,900 | 546 | 1.05 | 0.65 s |
| 9 | 11,800 | 624 | 1.05 | 0.65 s |
| 10 | 13,900 | 707 | 1.05 | 0.65 s |

Costs fit the authored TH10 storage ceiling and remain mirrored client/server.
The unified TH1-TH10 policy-exploration result is 54.46% attacker wins
(886/1,627, zero invalid), inside the authored 55% +/- 2% gate.

## Asset contract

- Production assets are extracted into `Model/HiddenTesla/level_01` through
  `level_10`, plus a shared `Model/HiddenTesla/hatch` folder.
- Every level wrapper normalizes source bounds, origin, scale, and local socket
  direction without changing the 2x2 gameplay footprint.
- Each raw Tesla is one mesh without embedded materials, so its supplied base
  color, metallic, and roughness maps are applied by the wrapper/material.
- `HatchL` and `HatchR` open outward around authored pivots. Higher levels use
  the same hatch geometry with a small wrapper scale increase so the raised
  tower does not clip it.
- The original archive's `Tesla5.glb` was an empty 132-byte GLB, so the initial
  implementation temporarily reconstructed L5 from L6. The owner later supplied
  a valid 123,272-byte authored L5 mesh. Production now uses that real geometry
  together with the original L5 base-color, metallic, and roughness maps.
- The authored L5 contains 3,393 vertices and 2,278 triangles, making it lighter
  than the 4,749-vertex / 2,518-triangle fallback while preserving the wrapper's
  normalized 0.98-unit height and stable runtime node contract.
- Level 10 has an authored vertical offset; wrapper normalization must remove it
  instead of compensating inside combat code.

## Server and replay contract

The server owns reveal conditions, hidden-target filtering, reveal completion,
acquisition, fire ticks, damage, Freeze/destruction behavior, and battle trace.
Godot mirrors the same 60 Hz integer-tick rules for presentation and local tests.
Old snapshots without `hidden_tesla` remain valid.

Required telemetry: `hidden_tesla_reveal_started`,
`hidden_tesla_reveal_complete`, `hidden_tesla_fire`,
`hidden_tesla_damage`, and `hidden_tesla_destroyed`. Fire/damage records include
building id/order, level, target order/id, tick, damage, and HP before/after.

## Acceptance criteria

1. TH10 is reachable and represented consistently by client, server, UI, combat,
   bots, admin tools, resource caps, snapshots, and exports.
2. TH9 and below reject Hidden Tesla placement. TH10 accepts exactly two; each
   can reach L10 and a third is rejected server-side.
3. A hidden Tesla is completely invisible to the attacker, cannot be selected
   or targeted, exposes no building UI, and emits no attacks.
4. Ground and air trigger fixtures reveal it at the exact 1.20 boundary; an outside
   troop does not. A 51-percent destruction fixture remains hidden without a
   nearby living troop.
5. The rise takes exactly 30 ticks. No shot occurs before completion or while a
   target remains in the 1.20-to-1.05 warning band.
6. Active Tesla attacks both ground and air, hits only one target per shot, and
   never chains despite reusing the electric-dragon lightning VFX.
7. Server and Godot traces agree at 10, 20, 30, 60, and 120 render FPS.
8. Frame captures cover hidden idle, trigger frame, hatch 25/50/75/100 percent,
   tower rise 25/50/75/100 percent, first lock, lightning, damage, Freeze,
   destruction, and cleanup for representative L1/L5/L10 visuals.
9. Placement, selection, upgrades, saving/loading, enemy snapshots, replays, bot
   villages, shop/admin panels, and touch/desktop interaction remain usable.
10. Godot headless probes, server progression/combat tests, asset audit, client/
    server parity, web build, and TH10 balance simulation pass before completion.
