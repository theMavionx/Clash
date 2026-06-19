# Active Goals

This file is the durable list of current goals. Keep it short, current, and specific enough
that a fresh agent can continue the work.

Status legend: `active`, `blocked`, `done`, `paused`.

## G-001 PvP Arena Bots And Matchmaking

- Status: active
- Priority: P0
- Owner intent: normal players should win around 55-58% of PvP arena matches.
- Core idea: if a player loses too much, match them with an easier bot/opponent; if they win too much, match them with a stronger bot/player.
- Important constraint: this should feel fair and believable, not like guaranteed wins or fake outcomes.

Key files and docs:

- `server/matchmaking_defs.js`
- `server/db.js`
- `server/routes.js`
- `server/combat_defs.js`
- `server/combat_session.js`
- `scripts/attack_system.gd`
- `scripts/bs_battle.gd`
- `docs/architecture/adr-0011-server-bot-bases-and-recovery-matchmaking.md`

Acceptance criteria:

- Bot/opponent selection is server-authoritative.
- Matchmaking reacts to recent player performance.
- Easy/recovery matches exist for losing streaks.
- Harder matches exist for strong winning streaks.
- There is enough logging or stored telemetry to audit win-rate behavior.
- The expected win-rate target is documented near the implementation.
- Local syntax checks pass.

Next checkpoint:

- Audit the current bot/matchmaking implementation and list what is already working,
  what is missing, and what needs tuning.

## G-002 Full Game Balance Pass

- Status: active
- Priority: P0
- Owner intent: rebalance all tunable game parameters so the game is playable, fair,
  and still supports monetization.
- Known concern: Town Hall level 4 may be too hard or impossible to destroy.

Scope:

- Building HP for every level.
- Building upgrade costs and timings.
- Resource production: gold, wood, ore.
- Resource storage and progression pacing.
- Troop HP, damage, attack speed, range, movement speed, targeting, and costs.
- Defensive structures: turret, archer tower, tombstone, skeleton guards, and any magic/other defenses.
- PvP and PvE combat time-to-kill.
- Early, mid, and late progression pacing.
- Server/client duplicate constants.

Key files and docs:

- `design/gdd/economy-balance.md`
- `server/db.js`
- `server/combat_defs.js`
- `server/combat_session.js`
- `scripts/building_system.gd`
- `scripts/base_troop.gd`
- `scripts/attack_system.gd`

Acceptance criteria:

- TH4 and other bases are breakable by intended attackers at the intended stage.
- No single troop, defense, or building level creates an obvious dead end.
- Resource production, costs, and storage create a reasonable upgrade loop.
- Defense values and troop values produce readable combat outcomes.
- Authoritative server values and client display/gameplay values are synchronized.
- Balance changes are documented with before/after reasoning.

Next checkpoint:

- G-002 implementation checkpoint complete on 2026-06-18. TH4 PvP bot breakability
  was tuned from 22.1% attacker win rate to 57.8%; mixed TH2-TH4 simulation is
  56.9% across 3000 generated battles. See
  `production/reports/g002-full-balance-pass-2026-06-18.md`.
- Remaining follow-up: decide whether economy max-out should target roughly 4, 8,
  or 12+ weeks; current live server pacing is about 102 days to full TH4 max before
  raid income.

## G-003 Agent Workflow, Memory, And Deploy Automation

- Status: active
- Priority: P1
- Owner intent: make the repo faster to work with by adding memory, goals, skills,
  hooks, and deployment helpers.

Scope:

- Fresh-chat startup memory.
- Active goals file.
- Goal execution workflow.
- Deployment workflow.
- PvP matchmaking skill.
- Balance pass skill.
- Local git hooks and check commands.

Acceptance criteria:

- `AGENTS.md` points to memory and goals.
- A fresh agent can run `tools/codex/start-context.cmd` to load project context.
- Goal work starts from `production/active-goals.md`.
- Deploy work has a safe preflight path.
- Git hooks can be installed locally.

Next checkpoint:

- Validate helper scripts and document how to use them.

## G-004 Resource Building Upgrade Content

- Status: active
- Priority: P1
- Owner intent: add proper progression content for resource buildings so upgrades feel
  visually and mechanically meaningful.
- Core idea: add or complete upgraded versions for the Sawmill, Storage, and Mine,
  including new levels, models/visuals, costs, stats, and client/server sync.

Scope:

- New or upgraded Sawmill progression.
- New or upgraded Storage progression.
- New or upgraded Mine progression.
- Upgrade costs, HP, production/storage values, and unlock requirements.
- Client display data and Godot building definitions.
- Server authoritative building definitions.

Key files and docs:

- `scripts/building_system.gd`
- `server/db.js`
- `web/src/components/BuildingInfoPanel.jsx`
- `web/src/components/ShopPanel.jsx`
- `design/gdd/economy-balance.md`
- `Model/Sawmill/`
- `Model/Storage/`
- `Model/Mine/`

Acceptance criteria:

- Sawmill, Storage, and Mine have clear upgrade progression.
- New levels are not just scaled copies; they have distinct visual/function changes.
- Server and client agree on costs, HP, production/storage values, and max levels.
- Existing player data can handle the new/changed levels safely.
- The changes are included in the full balance pass before production deployment.

Next checkpoint:

- Audit current Sawmill, Storage, and Mine level definitions, available models, and
  server/client mismatches before adding new levels.

## Parking Lot

- Add CI once the local checks are stable.
- Split oversized backend/admin modules when feature pressure slows work.
- Refresh `production/session-state/active.md` after every major milestone.
