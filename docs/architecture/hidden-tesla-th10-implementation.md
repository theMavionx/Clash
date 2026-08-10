# TH10 / Hidden Tesla implementation map

Date: 2026-08-08
Status: approved by owner for direct implementation

## Data flow

`scripts/building_system.gd` and `server/db.js` remain mirrored authorities for
progression/placement data. `server/combat_defs.js` owns authoritative combat
stats and `server/combat_session.js` owns Hidden Tesla state transitions and
damage. Godot mirrors that fixed-tick state machine in
`scripts/tower_hidden_tesla.gd` for local combat presentation and probes.

TH10 promotion extends the live cap, Town Hall scene/HP/cost rows, capacity
tables, all Town-Hall-tracking building level rows, snapshot/bot fixtures, web
presentation, and progression tests. Intentional Port/Altar caps remain.

## Hidden target contract

- A Hidden Tesla building carries `teslaState = hidden|revealing|active|destroyed`.
- Server `isCombatTargetBuilding` excludes a living Hidden Tesla until `active`.
- Godot building dictionaries carry `combat_targetable`; BaseTroop's cached list
  excludes entries where it is false.
- Reveal updates targetability and invalidates the building cache immediately.
- Proximity checks use all living deployed troops, not only currently targetable
  troops. No destruction-percentage or Town Hall-state fallback can reveal it.
- Revealing lasts 30 fixed ticks and cannot fire or be targeted.
- Active Tesla uses deterministic scan/order rules and direct one-target damage.
- Old snapshots have no Hidden Tesla and therefore preserve old behavior.

## Source ownership

- Assets/wrappers: `Model/HiddenTesla/**`.
- Client data/spawn/runtime: `scripts/building_system.gd`.
- Client combat/VFX: `scripts/tower_hidden_tesla.gd` and focused probes.
- Server progression: `server/db.js`.
- Server stats/snapshot/combat/replay: `server/combat_defs.js`,
  `server/combat_session.js`, `server/combat_snapshot.js` where required.
- Bots/admin/UI: dynamic catalogs plus explicit building icon/label maps in
  `server/**`, `tools/**`, and `web/src/**`.
- Verification: progression, combat, parity, Godot probe, asset audit, web build,
  and TH10 PvP balance report.

## Determinism

The combat clock is 60 Hz. Hidden proximity checks run every 3 ticks; active
target scans run every 9 ticks. Reveal trigger, 30-tick rise, 39-tick reload,
stable building order, stable troop replay order, target HP, and emitted trace
events are integer-tick authored. Render delta affects only interpolation.
Godot caches the authored `RevealTriggerOrigin` marker during visual binding so
the 20 Hz hidden scan never traverses the scene tree. Lightning is
presentation-only and is spawned from the model socket to the
server-authoritative target on the fire event.

## Risk controls

- The archive's L5 source was empty, but the owner supplied a valid replacement.
  Production now uses the authored L5 geometry and original L5 PBR maps; the
  prior L6-derived fallback is retained only as a recoverable audit artifact.
  The dedicated L5 visual probe remains a regression gate.
- L10 source is vertically offset: wrapper normalization corrects the asset,
  never combat coordinates.
- Hidden buildings still participate in collision/avoidance and destruction
  totals but not direct target lists before reveal.
- TH10 costs must remain within mirrored base/storage capacity.
- Existing TH1-TH9 progression and snapshot-v2 replays are regression gates.
