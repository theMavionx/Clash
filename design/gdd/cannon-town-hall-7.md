# Town Hall 7 and Cannon

> Status: implementation-ready
> Scope: TH7 progression tier and Cannon L1-L7
> Updated: 2026-07-28

## 1. Overview

Town Hall 7 extends every established, upgradeable building line by one level and unlocks the complete Cannon L1-L7 progression. All seven Cannon levels are available at TH7. Port and Altar remain content-capped. Cannon is a short-to-medium-range, ground-only, single-target projectile defense with a fixed base and an independently yawing barrel.

## 2. TH7 progression

- TH6 to TH7 costs 70,000 gold, 100,000 wood, and 92,000 ore. Every resource fits inside the TH6 maximum capacity of 106,000.
- The existing TH6 prerequisite families remain required before the TH7 upgrade.
- TH7 raises Town Hall HP from 52,000 to 72,000.
- TH7 base capacity is 35,000 per resource. Each L7 Storage adds 36,000 per resource, so a village with three L7 Storages holds 143,000 per resource.
- The generic L7 building-upgrade multiplier is 17.
- Upgrade completion, not start, applies the new HP, production, storage, and combat values.

| Building line | TH7 cap | HP at cap | TH7 output/combat |
|---|---:|---:|---|
| Town Hall | 7 | 72,000 | 35,000 base capacity per resource |
| Mine | 7 | 18,000 | 225 ore/minute; 7,500 internal capacity |
| Barn | 7 | 28,000 | Existing non-production behavior |
| Sawmill | 7 | 18,000 | 300 wood/minute; 9,000 internal capacity |
| Storage | 7 | 18,000 | +36,000 capacity per resource |
| Turret | 7 | 12,000 | 315 damage, 0.21 s interval, 1.62 range |
| Archer Tower | 7 | 10,200 | 288 damage, 0.32 s interval, 2.30 range |
| Mage Tower | 7 | 8,300 | 52–281 damage/tick, 0.10 s tick, 1.8 s ramp, 2.08 range |
| Mortar | 7 | 8,100 | 460 splash damage, 1.70 s interval, 0.78–2.40 range, 0.52 splash radius |
| Tombstone | 6 | 4,700 | Six L6 guards; 1,148 HP and 131 damage per guard |
| Shark Trap | 7 | 1 | 2,900 trigger damage |
| Cannon | 7 | 9,000 | 675 damage, 0.75 s interval, 2.00 range |

Port remains L3 and Altar remains L1. Their UI and API must not expose placeholder TH7 levels.

### TH7 count limits

Existing TH6 limits are preserved: Mine 4, Sawmill 4, Barn 1, Storage 3, Turret 3, Archer Tower 3, Mage Tower 2, Mortar 2, Tombstone 3, Shark Trap 3, Town Hall 1, and Altar 1. Cannon unlocks at TH7 with a limit of two.

## 3. Cannon rules

- Build cost: 6,800 gold, 15,500 wood, and 13,000 ore.
- Footprint: 3×3. It participates in the Altar ward bonus and normal defensive power scoring.
- It acquires only living hostile ground troops inside its current level's
  detection range. Air troops, buildings, allies, and dead/dying troops are invalid.
- It follows the existing deterministic defense convention: nearest valid target, stable replay ordering on ties, 0.15 s target scans.
- The barrel rotates on local Y at up to 240 degrees/second using the shortest angular path. The authored base transform never changes.
- All Cannon levels unlock together at TH7; the normal sequential upgrade order still applies.
- Projectile speed is 3.2 units/second and hit radius is 0.05 at every level.
- Existing projectile semantics remain authoritative: a projectile whose target becomes invalid despawns without damage; each projectile applies damage at most once.
- While upgrading, Cannon follows the existing building-upgrade inactivity contract.

| Level | HP | Damage | Interval | Range | DPS |
|---:|---:|---:|---:|---:|---:|
| 1 | 3,200 | 40 | 1.60 s | 1.35 | 25.0 |
| 2 | 3,900 | 100 | 1.10 s | 1.45 | 90.9 |
| 3 | 4,700 | 205 | 0.95 s | 1.55 | 215.8 |
| 4 | 5,600 | 305 | 0.85 s | 1.65 | 358.8 |
| 5 | 6,600 | 447 | 0.85 s | 1.75 | 525.9 |
| 6 | 7,700 | 506 | 0.80 s | 1.85 | 632.5 |
| 7 | 9,000 | 675 | 0.75 s | 2.00 | 900.0 |

Cannon trades air targeting and Archer Tower's longer high-level range for
heavier single-hit burst and greater durability. The final win-rate
calibration is applied through the shared same-TH troop curve rather than an
artificial TH7 defense spike; Cannon remains ground-only with 2.00 range
versus Archer Tower's 2.30.

### Cannon economy

| Upgrade | Gold | Wood | Ore |
|---:|---:|---:|---:|
| Build L1 | 6,800 | 15,500 | 13,000 |
| L1 to L2 | 9,500 | 22,000 | 18,000 |
| L2 to L3 | 14,000 | 32,000 | 27,000 |
| L3 to L4 | 20,000 | 45,000 | 38,000 |
| L4 to L5 | 29,000 | 61,000 | 52,000 |
| L5 to L6 | 41,000 | 81,000 | 69,000 |
| L6 to L7 | 56,000 | 106,000 | 90,000 |

Every individual upgrade fits the legal TH7 capacity of 143,000 per resource. Explicit Cannon prices are used instead of the generic building multiplier because the generic L6-L7 values would exceed that capacity and create an impossible progression step.

## 4. Presentation

Combat events remain authoritative; animation never changes range, collision, or damage.

| Event | Timing/value |
|---|---:|
| Anticipation squash | 0.00–0.08 s; local scale X/Z 1.03, Y 0.94 |
| Projectile + muzzle flash | 0.10 s |
| Recoil peak | 0.14 s; barrel moves 0.18 local units backward |
| Recovery | 0.14–0.32 s; eased return to captured rest transform |
| Muzzle flash | 0.07 s, reusing Turret frames |
| Cannonball | Visible low-poly dark sphere with warm highlight and short trail |

The barrel should feel heavy: a small anticipation stretch, sharp backward kick, subtle overshoot, then settle. Repeated fire restarts the animation from the captured rest transform so scale and offset never accumulate.

## 5. Client/server contract

- Godot `LEVEL_STATS` and server `DEFENSE_STATS` are explicit mirrors and are checked by parity tests.
- `TH_UNLOCK`, `TH_MAX_COUNT`, `TH_MAX_LEVEL`, HP arrays, costs, multiplier, resource capacities, and damage arrays match between Godot and Node.
- Cannon is included in targetable/freezable defense allowlists, server simulation, defense power scoring, admin max-village generation, replay trace output, and build validation.
- Existing API shapes do not change. Cannon appears as the new building type string `cannon`.
- Cannon L1-L7 use the first seven authored scenes. Levels 8-10 remain available for future Town Hall tiers.

## 6. Acceptance criteria

- TH6 can upgrade to TH7 only after its existing required building families are ready and can pay 70k/100k/92k from legal TH6 capacity.
- Client and server both cap main lines, Mortar, and Cannon at L7, Tombstone at L6, Port at L3, and Altar at L1 for TH7.
- A third Cannon and any Cannon before TH7 are rejected server-side.
- A newly built Cannon can be upgraded sequentially from L1 through L7 without another Town Hall upgrade, and every step uses its authored model, HP, combat stats, and explicit price.
- Against a stationary ground target at 1.4 units, the base transform remains constant, the barrel yaws, the muzzle flash and projectile appear, one L7 hit removes 675 HP before ward bonus, the projectile disappears cleanly without a post-hit effect, and the next shot observes the 0.75 s cadence.
- The nearest air troop is ignored.
- Captures at anticipation, fire, recoil peak, recovery, projectile flight, and the clean field state after a hit prove the animation is readable and stable.
- The same behavior is verified at headless simulation level and client scene level; replay trace identifies Cannon fire and hit events as `defenseType: cannon`.
- Existing TH1–TH6 progression and non-Cannon defenses keep passing their focused tests.
