# Harpoon Defense

> **Status:** Production specification with future-safe TH8 progression
> **Owner decisions:** air-only targeting, low impact damage, inward pull with a safe standoff, exactly 7.00 seconds reload
> **Progression scope:** Town Hall 6-8 count gates, Harpoon levels 1-8
> **Last updated:** 2026-08-01

## 1. Overview

Harpoon is a 2x2, single-target control defense unlocked at Town Hall 6. It attacks only hostile units whose canonical movement class is `air`, deals deliberately low impact damage, and reels the target toward the Harpoon without ever placing it on the building. It exists to disrupt an air push and expose one nearby flyer to the rest of the base, not to replace Archer Tower as an anti-air damage source. One Harpoon is allowed at TH6-TH7 and the second unlocks at TH8. The level cap tracks the late-game Town Hall: L6 at TH6, L7 at TH7, and L8 at TH8.

The specification includes the complete production contract: progression, targeting, damage, forced movement, deterministic replay, counterplay, telemetry, and client/server parity. The L6/L7 durability and range reflect the current owner-directed endpoint tuning; L1-L5 create the upgrade journey and L8 remains conservative because TH8 also unlocks a second Harpoon.

## 2. Player Fantasy

The defender should feel that base layout matters: a well-placed Harpoon drags one dangerous flyer into a prepared kill zone. The attacker should feel disrupted but not cheated; the range, wind-up, rope, seven-second reload, and stop ring make the result readable and predictable even though troops are not directly controlled after deployment.

In MDA terms, the target aesthetics are **Challenge** and **Expression**. The mechanics create a positional defense whose value comes from placement and combinations, while the dynamics encourage spread deployments, sacrificial air units, Freeze timing, and ground pressure. This supports competence through clear cause-and-effect and autonomy through army composition and deployment choices rather than twitch dodging.

## 3. Progression And Economy

The canonical building key is `harpoon` and the player-facing name is `Harpoon`.

| Level | TH required | HP | Gold | Wood | Ore | Impact | Range | Pull speed |
|---:|---:|---:|---:|---:|---:|---:|---:|---:|
| 1 | 6 | 1,800 | 12,000 | 22,000 | 18,000 | 45 | 1.20 | 0.85 |
| 2 | 6 | 2,400 | 20,000 | 42,000 | 35,000 | 55 | 1.27 | 0.92 |
| 3 | 6 | 3,200 | 30,000 | 56,000 | 47,000 | 65 | 1.45 | 0.99 |
| 4 | 6 | 4,300 | 41,000 | 70,000 | 59,000 | 75 | 1.64 | 1.06 |
| 5 | 6 | 5,600 | 54,000 | 84,000 | 71,000 | 88 | 1.82 | 1.13 |
| 6 | 6 | 7,200 | 68,000 | 98,000 | 83,000 | 100 | 1.95 | 1.20 |
| 7 | 7 | 10,000 | 86,000 | 122,000 | 104,000 | 140 | 2.08 | 1.40 |
| 8 | 8 | 12,000 | 108,000 | 142,000 | 124,000 | 165 | 2.20 | 1.48 |

Reload is 7.00 seconds, pull duration cap is 0.80 seconds, and stop distance is 0.60 at every level.

- Footprint: 2x2 main-island cells.
- Base cap: zero at TH1-5, one at TH6-TH7, and two from TH8 onward.
- Level cap: L6 at TH6, L7 at TH7, and L8 from TH8 onward. A second Harpoon before TH8, L7 at TH6, and L8 at TH7 are invalid.
- The Altar ward increases Harpoon impact damage by the normal defense rule, using ceiling rounding. It does not increase range, pull speed, duration, or control immunity.
- The construction price sits above Mortar L1 (8,000/12,000/10,000) and below Cannon L1 (16,000/36,000/30,000). Every L2-L6 upgrade fits the established 106,000-per-resource TH6 ceiling. L7 and the future-safe L8 price each fit the current 143,000 late-game ceiling; the TH8 economy must revalidate that assumption before TH8 launch.
- Harpoon L6 is part of the complete-village TH6-to-TH7 gate. This follows the owner-approved rule that every normal building slot available at the current Town Hall must be built and maxed; optional Altar remains excluded.
- Placement and upgrades use authored prices rather than the generic building multiplier.
- While under construction or upgrading, Harpoon follows the existing inactive-defense contract.

At the playable endpoints, HP is 7,200 at L6 and 10,000 at L7. This keeps Harpoon just below the same-tier Archer Tower (7,800/10,200) and Turret (9,000/12,000), while making a common same-level Fire Dragon require three clean direct hits instead of two. Ground troops can still remove the utility defense without being attacked by it.

## 4. Detailed Rules

### 4.1 Valid Targets

A target is valid only when all of the following are true:

1. It is alive, hostile, active, and targetable by defenses.
2. Its canonical target class is `air`: `unit_target_type == "air"` on the Godot client and `flying == true` in the server simulation.
3. Its horizontal center-to-center distance from the Harpoon is no greater than the current level's search range.
4. It is not reserved by another Harpoon and does not have active post-pull immunity.

This includes Fire Dragon, Mechanical Dragon, Windlings, and future units explicitly registered as air. Ground troops, guards, buildings, visual flight height, animation state, and model Y position do not affect eligibility.

### 4.2 Target Selection And Reservation

- Target scans occur every 0.15 seconds, matching existing defense cadence.
- Choose the nearest valid target by horizontal squared distance.
- Equal-distance ties resolve by stable troop `replayOrder`. Multiple Harpoons resolve reservation conflicts by stable defender building order/ID.
- Tracking may occur during reload, but a target is reserved only for the final 0.45-second wind-up, the projectile flight, and the pull.
- One air unit can be reserved by at most one Harpoon. Other Harpoons skip it and select their nearest unreserved target.
- If the target dies, becomes invalid, gains another authoritative reservation first, or leaves search range during wind-up, cancel the wind-up, release the reservation, and rescan. A canceled pre-fire wind-up does not start reload.
- Once fired, the shot is committed. It spends the reload even if the projectile later loses its target.
- A target that completed or partially completed a successful pull gains 1.50 seconds of global Harpoon immunity after release. Failed pre-impact shots do not grant immunity.

### 4.3 Aim, Fire, And Reload

- The upper assembly may yaw through 360 degrees; the base remains static.
- Baseline yaw speed is 120 degrees/second. Firing requires at most 2 degrees yaw error and 0.45 seconds of uninterrupted final wind-up.
- Projectile speed is 4.00 world units/second. It homes toward the reserved target, preserving the existing visible-projectile semantics.
- A fired projectile is lost without damage if the target dies, becomes non-air/untargetable, leaves the battle, or moves beyond `search_range + 0.25` before impact.
- `reload_ready_at = fire_time + 7.00 seconds`. The minimum interval between launches is exactly 7.00 seconds when a valid target is already tracked and aimed.
- Tracking and yaw may continue during reload. Final wind-up may overlap the last 0.45 seconds of reload so the wind-up does not silently turn the requested seven-second reload into 7.45 seconds.
- Freeze blocks target reservation, firing, and active pull, but it does not move `reload_ready_at`. If reload completes while frozen, the Harpoon may fire only after Freeze ends and a valid wind-up is completed.
- At battle start the weapon is loaded. Its first launch follows normal scan, yaw, and wind-up timing; it does not wait seven seconds.

### 4.4 Impact And Pull

1. On valid impact, apply level damage once, before displacement.
2. If the damage kills the target, do not start a pull; clean up the projectile and reservation normally.
3. If the target is already at or inside the 0.60 stop distance, apply damage but no displacement.
4. Otherwise start a maximum 0.80-second pull. Suppress the target's voluntary horizontal movement, separation, orbit, and standoff correction while pulled. Attack timers and already-started attacks continue; flight height and cosmetic bobbing remain visual only.
5. Each authoritative 60 Hz tick moves the target radially toward the Harpoon, never past the 0.60 stop ring.
6. End the pull when the target reaches the stop ring, the duration expires, the target/Harpoon dies, the target becomes invalid, Freeze interrupts the Harpoon, or legal combat bounds prevent progress.
7. Release reservation, apply the 1.50-second immunity after any successful impact/pull, and retract the rope.

The pulled unit stays on the same side of the Harpoon where it was caught. Harpoon does not choose a free destination tile, throw the unit, stun attacks, ground a flyer, change its target class, or deal rope damage over time.

### 4.5 State Model

| State | Valid transitions | Notes |
|---|---|---|
| Ready/Tracking | Wind-up, Idle | Scans air targets; can yaw without reservation. |
| Reloading/Tracking | Wind-up, Ready, Disabled | Uses absolute `reload_ready_at`; tracks but cannot launch early. |
| Wind-up | Fire, Ready/Reloading | Reserves one target; cancels cleanly if it becomes invalid. |
| Projectile | Pull, Reloading | Reload already started; invalid target produces a miss/retract. |
| Pull | Reloading | One reserved target; ends at stop ring or an interruption. |
| Disabled | Previous legal non-control state | Construction, upgrade, destruction, or Freeze; active rope is broken. |

## 5. Formulas

All distance and displacement calculations use the horizontal XZ plane. Simulation uses the existing fixed tick `dt = 1/60 s`.

### Distance and eligibility

`d = sqrt((Tx - Hx)^2 + (Tz - Hz)^2)`

The target is in search range when `d <= R`. Use squared distances for selection, then stable replay ordering for ties.

### Impact damage

`impact_damage = ceil(base_damage[level] * (1 + ward_bonus_pct / 100))`

With the maximum current 15% ward, damage is 52 at L1, 115 at L6, 161 at L7, and 190 at L8. Damage is clamped to at least 1 and applied exactly once.

### Pull step

For `d > S`:

`step = min(P * dt, d - S)`

`T_next = T_current + normalize(H - T_current) * step`

Where:

| Symbol | Meaning | Baseline/range |
|---|---|---|
| `H` | Harpoon XZ center | Valid building position |
| `T` | target XZ center | Valid combat position |
| `R` | search range | 1.20 L1 through 2.20 L8 |
| `S` | stop distance | 0.60 |
| `P` | pull speed | 0.85 L1 through 1.48 L8 |
| `Dmax` | maximum pull duration | 0.80 s |

Example: an L6 Harpoon hit at 1.50 distance still reaches the stop ring in 0.75 seconds. A target caught at the new full 1.95 range instead moves the same maximum 0.96 units during the fixed 0.80-second pull and finishes at distance 0.99. L7 and L8 full-range catches finish at approximately 0.96 and 1.016 respectively. Increasing search range therefore expands engagement coverage without secretly increasing pull speed, displacement per cycle, or control uptime.

### Control ceiling

`maximum_nominal_control_uptime = Dmax / reload = 0.80 / 7.00 = 11.43%`

Actual uptime is lower when a target starts closer, the shot misses, or the rope is interrupted. Damage DPS before ward rises from 6.43 at L1 to 14.29 at L6, 20.00 at L7, and 23.57 at L8, intentionally tiny beside current same-tier Archer Tower DPS (473 at L6 and 675 at L7).

### Current troop-health relationship

Using current authoritative same-level common stats:

| Matchup | Target HP | Base Harpoon hit | HP removed |
|---|---:|---:|---:|
| TH6/L6 Fire Dragon | 10,368 | 100 | 0.96% |
| TH6/L6 Mechanical Dragon | 3,945 | 100 | 2.53% |
| L6 Windling | 310 | 100 | 32.26% |
| TH7/L7 Fire Dragon | 15,208 | 140 | 0.92% |
| TH7/L7 Mechanical Dragon | 5,704 | 140 | 2.45% |
| L7 Windling | 450 | 140 | 31.11% |

This preserves the owner's low-damage intent. The closest Windling can deliberately absorb a cycle, but a same-tier Windling is not one-shot before or after the current maximum ward bonus.

### Current building-survivability relationship

Direct-hit damage below includes the authoritative same-level troop power multiplier.

| Matchup | Harpoon HP | Damage per hit | Direct hits to destroy |
|---|---:|---:|---:|
| TH6/L6 Fire Dragon | 7,200 | 3,091 | 3 |
| TH6/L6 Mechanical Dragon | 7,200 | 1,013 | 8 |
| TH7/L7 Fire Dragon | 10,000 | 4,754 | 3 |
| TH7/L7 Mechanical Dragon | 10,000 | 1,665 | 7 |

The Fire Dragon remains a fast counter and still destroys Harpoon before its
seven-second reload can complete. The survivability change only removes the
two-hit failure case; it does not let Harpoon permanently control a Dragon or
replace the sturdier general-purpose defenses.

## 6. Counterplay And Fairness

- **Spread or stagger air deployment:** one Harpoon controls only one reserved target and reloads for seven seconds.
- **Bait with a cheaper flyer:** nearest-target priority lets Windlings or another air body absorb the hook.
- **Use ground pressure:** Harpoon cannot attack ground units and has lower HP than the main same-tier direct-fire defenses.
- **Freeze or destroy it:** Freeze breaks an active rope and prevents launch; destroying the building immediately releases the target.
- **Attack from outside the defended arc:** the playable 1.95-2.08 range exceeds the compact Mage Tower L6-L7 ranges of 1.55-1.65 but remains below the same-tier Archer Tower ranges of 2.15-2.30. Layout orientation and a seven-second reload still leave approach windows.
- **Read the wind-up:** the 0.45-second lock presentation, rotating head, launched harpoon, taut rope, stop ring, and reload state must communicate what happened.
- The decorative upper sight is intentionally omitted from the runtime LOD. It has no targeting role; removing its four meshes reduces rendering work without changing aim readability.
- **Persistent combat facing:** on spawn, the upper assembly faces the real troop deployment zone from `AttackSystem/shipPlane`, not the center of the defended building grid. Construction may begin at zero scale, so this one-time heading waits until the transform is invertible. A valid air target then owns yaw; after that target is lost, retract completes, or reload ends, the upper assembly preserves its last combat heading instead of returning to a home angle. The static base never rotates.

The mechanic does not rely on last-frame dodging because attackers cannot steer troops after deployment. Its skill expression comes from deployment order, composition, route choice, spell timing, and which defenses are prioritized. Reservation and post-pull immunity prevent multiple Harpoons or desynchronized reloads from pinning one unit indefinitely.

## 7. Edge Cases

- Ground units are never selected even if their model is visually above the ground. Air eligibility comes only from the canonical combat flag.
- If a target changes from air to ground in a future mechanic, wind-up/projectile/pull terminates immediately. A fired shot still consumes reload.
- If target and Harpoon centers coincide or `d <= 0.60`, apply impact damage only; never normalize a zero vector.
- If impact damage kills the target, do not move or grant a surviving entity immunity.
- If the Harpoon is destroyed, starts upgrading, or is removed during projectile/pull, cancel its owned projectile, break the rope, release reservation, and apply immunity only if a valid impact already occurred.
- Freeze before fire cancels wind-up without spending reload. Freeze after fire cancels projectile/pull; the committed reload remains.
- If legal-bound clamping produces no positional progress for two consecutive ticks, end the pull at the last legal position rather than teleporting or looping.
- Flying units may pass over ground buildings during the radial pull; ground collision and pathfinding do not redirect the rope.
- A pulled unit's attack timer continues. Any authoritative attack already due may land while it is pulled, preventing a hidden stun from being added to the owner's requested effect.
- Projectile and impact apply at most once. Cleanup is idempotent across target death, building death, scene exit, and battle end.
- Equal-distance and same-tick reservation conflicts never use node instance IDs or unordered collection iteration.
- Battle pause stops simulation time. A 7.00-second reload therefore means seven seconds of battle simulation, not wall-clock time while paused.

## 8. Dependencies And Integration Contract

| System | Harpoon requires | Harpoon provides |
|---|---|---|
| Building progression | TH level, count/level validation, authored costs, HP, construction state | `harpoon` definition, L1-L8 caps and shop/upgrade data |
| Troop registry | Canonical `air`/`flying` classification, HP, targetability, stable replay order | No mutation of target class; temporary reservation/immunity state |
| Defense combat | Fixed 60 Hz delta, 0.15 s scans, ward bonus, Freeze state | Air-only target selection, impact damage, forced XZ displacement |
| Replay verifier | Defender snapshot, ordered troops/buildings, authoritative actions | Deterministic fire, impact, pull, release, final XZ and HP |
| Client presentation | Authoritative state and target reference | Yaw, projectile, rope, retract, reload feedback; visuals never author combat |
| Balance/matchmaking | Building level, HP, range, low DPS and utility weight | Harpoon defense-power contribution and air-counter telemetry |

Production integration must cover client/server building definitions, TH unlock/count/level maps, placement and upgrade validation, shop and building UI, server combat stats/simulation, building snapshots, admin max-village generation, defensive power scoring, Freeze allowlists, replay traces, local test registrations, export manifests, and combat parity tests. Old replay snapshots without `harpoon` remain valid.

The visual source of truth for animation feasibility is `prototypes/harpoon-rope-animation/REPORT.md`: static base, `TurretYawPivot`, projectile, procedural rope, taut/reel/retract phases, and clean LOD. Prototype scripts are not production dependencies and must not be copied into the production scene.

## 9. Server Authority, Replay, And Telemetry

- The server reconstructs targets, reservations, impacts, displacement, and cooldowns from the defender snapshot and fixed-step troop motion. The client cannot submit a Harpoon hit or target position.
- Both runtimes use 60 Hz simulation, XZ distances, explicit building order, troop `replayOrder`, and the same rounding/clamping order.
- Authoritative state uses integer ticks where practical: 7.00 s = 420 ticks, 0.80 s = 48 ticks, 0.15 s = 9 ticks, 0.45 s = 27 ticks, and 1.50 s = 90 ticks.
- Position telemetry rounds X/Z to 0.001 only when recording; simulation does not repeatedly quantize positions.
- Required trace events: `harpoon_lock`, `harpoon_lock_cancel`, `harpoon_fire`, `harpoon_projectile_lost`, `harpoon_impact`, `harpoon_pull_start`, `harpoon_pull_end`, and `harpoon_release`.
- Fire records building/level, target ID/type/replay order, fire tick, reload-ready tick, projectile origin, and range. Impact records damage, HP before/after, and impact position. Pull end records reason, start/final distances, duration ticks, and final X/Z.
- Per-tick pull events are not stored. The verifier reproduces them from pull-start inputs and confirms the recorded end summary.
- Reservation state is combat-ephemeral and is not persisted in player/base data.

## 10. Tuning Knobs

All values must live in mirrored external/client-server defense data, not scattered magic constants.

| Knob | Category | Baseline | Safe test range | Failure outside range |
|---|---|---:|---:|---|
| Base damage L6/L7/L8 | Curve | 100 / 140 / 165 | 85-120 / 120-160 / 145-180 | Too high turns control into burst; too low makes impact unreadable. |
| Search range L6/L7/L8 | Feel | 1.95 / 2.08 / 2.20 | 1.85-2.05 / 1.98-2.18 / 2.10-2.30 | Too high denies air approach; too low rarely activates. |
| Reload | Gate | 7.00 s | 7.00 s fixed for Phase 1 | Owner-defined identity; do not level-scale. |
| Stop distance | Feel | 0.60 | 0.55-0.70 | Too low overlaps the tower; too high creates little displacement. |
| Pull speed L6/L7/L8 | Feel | 1.20 / 1.40 / 1.48 | 1.10-1.55 | Too low cannot reach the ring; too high reads as teleportation. |
| Pull duration cap | Gate | 0.80 s | 0.65-0.90 s | Too high creates excessive loss of agency/control uptime. |
| Wind-up | Feel | 0.45 s | 0.35-0.60 s | Too short is unreadable; too long causes frequent random cancels. |
| Projectile speed | Feel | 4.00 | 3.5-5.0 | Too slow produces long chases; too fast hides the projectile. |
| Post-pull immunity | Gate | 1.50 s | 1.0-2.5 s | Too low enables chain-pinning; too high wastes multiple defenses. |
| Yaw speed | Feel | 120 deg/s | 90-140 deg/s | Outside the prototype's readable range or too sluggish. |

Damage, range, pull strength, and durability are the level-growth knobs. Reload and stop distance stay fixed so players learn one consistent timing and safe ring.

## 11. Acceptance Criteria

### Functional and progression

1. TH1-5 cannot build Harpoon. TH6 can build exactly one and upgrade it through L6; TH7 can upgrade it to L7 but still allows only one building; TH8 can upgrade to L8 and build the second Harpoon. A second Harpoon before TH8, L7 at TH6, and L8 at TH7 are rejected by the server and client UI.
2. Placement and all seven upgrades deduct the authored L1-L8 prices exactly; HP follows 1,800/2,400/3,200/4,300/5,600/7,200/10,000/12,000 only after completion.
3. The live TH6-to-TH7 complete-village gate requires one L6 Harpoon. Old defender/replay snapshots without Harpoon remain valid and deterministic.
4. Client definitions, server definitions, shop, max-village, competitive bot caps, defensive scoring, export content, and level UI expose identical L1-L8 data.

### Combat behavior

5. With equidistant ground and air units, Harpoon selects only air. Fire Dragon, Mechanical Dragon, and Windling are valid; Knight, Archer, guards, and buildings are invalid.
6. Nearest-air selection and replay-order ties match client/server. Two Harpoons in a test-only fixture reserve different targets; one target never has two ropes.
7. An L6 hit at 1.50 distance deals exactly 100 base damage and stops the target at 0.60 after 45 ticks (0.75 s), never closer. At the expanded full range, L7 and L8 use all 48 pull ticks and finish near 0.96 and 1.016 respectively; L8 deals exactly 165 base damage.
8. A target already within 0.60 takes impact damage but is not displaced.
9. The pulled unit cannot voluntarily move horizontally but may complete an already-due attack. It remains classified as air and resumes normal AI after release.
10. Continuous valid targeting produces launch timestamps no closer than 420 ticks; an already tracked/aimed target permits the next launch exactly at tick 420. First fire does not wait through an initial reload.
11. Target death, range break, Harpoon destruction, Freeze, upgrade state, and scene cleanup each remove projectile/rope/reservation without duplicate damage or leaked nodes.
12. Successful release applies 90 ticks of immunity. Failed pre-impact shots do not.
13. An unboosted fixed-cadence common L6 or L7 Fire Dragon requires exactly two stronger direct hits to destroy a same-level full-HP Harpoon; the first hit leaves it alive and the second remains lethal.

### Determinism and balance

14. The same defender snapshot and deployment actions produce identical target IDs, HP, casualties, launch ticks, pull-end reasons, and target X/Z within 0.001 in Godot and the authoritative server.
15. Normal, low-FPS, and headless replay runs produce the same outcomes; all required Harpoon telemetry events are present and no client event can forge damage or displacement.
16. Frame captures cover Ready, wind-up, fire, projectile flight, impact, taut rope, mid-pull, stop ring, retract, reload, interrupted rope, and settled state; the static base has zero drift and rope endpoints remain attached. A spawned Harpoon faces the `AttackSystem/shipPlane` deployment center within 2 degrees from any legal placement, including the zero-scale construction path. After targeting, 90 or more targetless simulation ticks, retract, reload, ready, Freeze recovery, and level changes preserve the latest combat heading.
17. A 300-layout/500-attack TH6-TH7 balance matrix has zero invalid replays. Adding one max-level Harpoon changes ground/mixed-army win rate by no more than 3 percentage points, reduces specialized all-air win rate by a target 5-12 points (hard ceiling 15), and preserves at least one legal 45-slot winning TH6 composition against a maxed TH6 defense.
18. Focused regression tests for Archer Tower, Turret, Mortar, Cannon, Freeze, Fire Dragon, Mechanical Dragon, Windlings, building upgrades, and old replays continue to pass.

## 12. Open Questions And Launch Gates

- TH8 is not currently playable, so the combined effect of two L8 Harpoons remains a TH8 launch gate even though level/count validation and individual L8 combat are implemented.
- Construction duration and any unique audio/VFX treatment should follow existing progression/presentation pipelines; they must not change the combat rules above.
- Review the all-air win-rate delta after a meaningful sample. Tune damage first only for readability; tune range or pull duration only if the control effect, rather than raw damage, is overperforming.
