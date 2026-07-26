# Pea Shooter

## Intent

Pea Shooter is a compact mid-game ranged troop built from the authored
`Polygonal Pea Shooter` model and a lightweight pooled projectile. It fills the space between a
fragile one-slot Archer and a four-slot Mage:

- five occupied ship slots;
- 500 Gold to load, following the global 100 Gold per occupied slot rule;
- unlocked at Town Hall level 4;
- durable enough to survive light splash damage;
- shorter range and slower movement than an Archer;
- a readable three-pea burst instead of a single hidden damage packet.

It should be useful in mixed armies, but replacing five Archers with one Pea
Shooter must not be a strict upgrade.

## Authoritative combat contract

- Server key: `pea_shooter`
- Client name: `PeaShooter`
- Target type: ground
- Valid targets: buildings and skeleton guards
- Attack animation: the authored 1.6667-second `Projectile Combo Attack`
- Attack cycle: 1.75 seconds at every level
- Burst shots: three
- Shot phases: 0.22, 0.50, and 0.78 of the attack cycle
- Projectile speed: 2.15 world units per second
- Every projectile is a separate authoritative hit and telemetry event.
- A projectile already in flight is lost if its target dies or becomes invalid.
- A later burst shot uses the troop's current valid target. If no valid target
  exists at its shot phase, that shot is skipped and the troop resumes
  retargeting.
- The client and server use the same per-pea damage. Damage is not multiplied
  again at impact.

## Progression

| Level | HP | Damage per pea | Full-burst damage | Cycle |
| --- | ---: | ---: | ---: | ---: |
| 1 | 1,250 | 110 | 330 | 1.75s |
| 2 | 1,650 | 150 | 450 | 1.75s |
| 3 | 2,150 | 195 | 585 | 1.75s |
| 4 | 2,800 | 280 | 840 | 1.75s |
| 5 | 3,550 | 380 | 1,140 | 1.75s |
| 6 | 4,450 | 510 | 1,530 | 1.75s |
| 7 | 5,500 | 680 | 2,040 | 1.75s |

Upgrade costs use Gold and Wood:

| Upgrade | Gold | Wood |
| --- | ---: | ---: |
| 1 -> 2 | 300 | 300 |
| 2 -> 3 | 600 | 600 |
| 3 -> 4 | 1,200 | 1,200 |
| 4 -> 5 | 2,400 | 2,400 |
| 5 -> 6 | 4,200 | 4,200 |
| 6 -> 7 | 7,000 | 7,000 |

## Balance guardrails

- Pea Shooter sustained damage per occupied slot stays at or below the
  comparable Archer group at the high end.
- Its added durability is paid for with shorter range, slower movement, burst
  overkill risk, and a larger five-slot commitment.
- Its level-one full-burst DPS is approximately equal to five level-one
  Archers, so the unlock does not invalidate the starter roster.
- It has no splash, chain, summon, flight, trap immunity, or defense priority.

## Presentation

- Use the source green albedo rather than a generic tint.
- Use a low-poly green sphere with subtle emission. The source projectile FBX
  has a pointed silhouette and does not read as a pea in combat.
- Share one sphere mesh and one material across the six-entry projectile pool
  so the three-shot burst does not allocate render resources during combat.
- Spawn each projectile from the animated mouth/head area.
- The attack animation is stretched only from 1.6667 seconds to the stable
  1.75-second combat cycle.
- The portrait is rendered from the actual combat model with a transparent
  background.

## Acceptance criteria

1. Loading one Pea Shooter consumes five ship slots and 500 Gold.
2. Town Hall levels below 4 cannot buy or load it.
3. One attack animation emits exactly three projectiles at the configured
   phases in both Godot and the server simulation.
4. Client and server produce matching target damage and projectile telemetry.
5. Projectiles are pooled and leave no nodes after death or scene cleanup.
6. The unit appears in Barn, ship, attack, battle log, and result UI.
7. The mobile attack selector remains horizontally scrollable without overlap.
8. Frame captures show the authored pose and green projectile at all three
   release phases.
