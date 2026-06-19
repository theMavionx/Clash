# Clash Project Story

This is the first project brief a fresh agent should read after `AGENTS.md`.
It explains what the repository is, what game is being built, what systems exist,
and what the owner currently wants Codex agents to help with.

## One-Sentence Game

Clash is a Clash-of-Clans-style fantasy island base-builder made with Godot 4.6.1,
with a Node.js + SQLite backend, web deployment, PvP attacks, base progression,
resources, troops, defenses, bots, and admin tooling.

## Player Fantasy

The player owns a small fantasy island base, upgrades buildings, collects resources,
trains or unlocks troops, attacks other bases, defends their own base, and progresses
toward stronger Town Hall levels and richer island systems.

## Core Game Loop

1. Player enters the game as a wallet user or local guest.
2. Player sees their island/base in the Godot client.
3. Resource buildings produce gold, wood, and ore.
4. Player collects resources and upgrades buildings.
5. Player attacks PvP/bot bases with troops deployed from ships.
6. Combat rewards and losses affect progression.
7. Higher Town Hall and building levels unlock stronger economy, defenses, and units.

## Current Active Goals

The source of truth is `production/active-goals.md`.

Current high-level priorities:

1. PvP arena bots and matchmaking should guide normal players toward about 55-58%
   win rate without feeling fake.
2. Full game balance pass across resources, buildings, troops, defenses, upgrades,
   production, and progression.
3. Agent workflow improvements: memory, goals, skills, hooks, local checks, and deploy helpers.
4. Resource building upgrade content for Sawmill, Storage, and Mine.

## Game Systems

Buildings:

- Town Hall: central progression building.
- Mine: ore/gold production identity depending on context.
- Sawmill: wood production.
- Barn: storage/farm-style resource building.
- Storage: protected resource capacity.
- Port: ship/deployment/naval gameplay.
- Turret: direct defensive fire.
- Archer Tower: ranged defensive structure.
- Tombstone: spawns skeleton guards.

Troops:

- Active troop roster: knight, mage, archer, demon king, fire dragon.
- Removed/inactive legacy units: barbarian and ranger.
- Shared behavior is in `scripts/base_troop.gd`.
- Server combat values live in `server/combat_defs.js`.

Combat and PvP:

- Godot handles client gameplay, deployment, visuals, and local battle presentation.
- Server-side definitions and replay/session logic keep combat measurable and auditable.
- PvP bot/matchmaking work lives around `server/matchmaking_defs.js`,
  `server/combat_session.js`, `server/routes.js`, and `tools/pvp-balance/`.

Resources and Progression:

- Main resources: gold, wood, ore.
- Server authoritative building definitions are in `server/db.js`.
- Client building definitions are in `scripts/building_system.gd`.
- Balance work must keep client/server values synchronized.

Admin and Web:

- Web app lives in `web/`.
- Local admin playtest key is `local-dev-admin` when started through
  `tools/codex/playtest-local.cmd`.
- Production admin/deploy secrets must not be changed or used without owner approval.

NFT/Chain/Futures:

- NFT, bridge, marketplace, and futures work exists in `nft/`, `server-futures/`,
  `hermes-orchestrator/`, and related server routes.
- Treat these as risky integration areas. Avoid touching them unless the task requires it.

## Key Files

- `AGENTS.md`: top-level Codex rules.
- `production/owner-agent-rules.md`: owner-specific workflow rules.
- `production/agent-memory.md`: compact durable memory.
- `production/active-goals.md`: current goals.
- `production/session-state/active.md`: current checkpoint.
- `design/gdd/economy-balance.md`: balance/design context.
- `scripts/building_system.gd`: client building definitions and placement.
- `scripts/attack_system.gd`: attack/deployment flow.
- `scripts/base_troop.gd`: shared troop behavior.
- `scripts/bs_battle.gd`: battle/replay flow.
- `server/db.js`: SQLite schema, player/resource/building data, server building defs.
- `server/routes.js`: backend API surface.
- `server/combat_defs.js`: server combat definitions.
- `server/matchmaking_defs.js`: PvP bot/matchmaking tuning.
- `tools/codex/`: local helper commands.
- `.agents/skills/`: project skills.

## Start Command Behavior

When the owner says `Старт`, `Start`, `Start Context`, or `Story`, the agent should:

1. Read `AGENTS.md`.
2. Read `production/owner-agent-rules.md`.
3. Read `production/project-story.md`.
4. Read `production/agent-memory.md`.
5. Read `production/active-goals.md`.
6. Read `production/session-state/active.md` if present.
7. Check git status and current branch.
8. Summarize what this game is, what active goals exist, what branch/state the repo is in,
   and what the best next action is.

## Safety Rules

- No commits, pushes, merges, deploys, or production database changes without explicit owner approval.
- Balance work belongs on `codex/balance` unless the owner says otherwise.
- Preserve dirty worktree changes; do not reset or revert user work.
- For gameplay/UI/server changes, verify locally when feasible.
- If local testing finds a bug caused by the current change, fix it and verify again.
- Do not break working systems by default. Warn before intentional removals or compatibility breaks.

## How The Agent Should Help

Default posture:

- Read context first.
- Make focused changes.
- Prefer implementation plus verification.
- Keep explanations simple.
- Turn repeated owner workflows into short activation words when useful.
- Keep `production/user-request-log.md` updated for explicit owner requests.
