# Clash Agent Memory

This file is the compact project memory for fresh Codex chats. Load it before broad work.

## Project Shape

- Game: Clash-style mobile strategy/base-builder in Godot 4.6.1.
- Client/gameplay: GDScript under `scripts/`, scenes under `scenes/`, assets under `assets/`.
- Backend: Node.js + SQLite under `server/`.
- Futures/bots/admin surfaces: `server-futures/`, `web/src/`, `web/src/admin/`.
- Deployment: scripts under `deploy/`, especially `deploy/export-upload-deploy.ps1`.
- Durable planning: `production/active-goals.md`, `production/session-state/active.md`,
  `production/owner-agent-rules.md`, `production/project-story.md`,
  `design/gdd/economy-balance.md`, and architecture ADRs under `docs/architecture/`.

## Startup Routine

For a new chat, context recovery, or "analyze repo" request:

1. Read `AGENTS.md`.
2. Read this file.
3. Read `production/owner-agent-rules.md`.
4. Read `production/project-story.md`.
5. Read `production/active-goals.md`.
6. Read `production/session-state/active.md` if it exists.
7. Check git state with `git status --short --branch`.
8. Fetch remote context if network is available: `git fetch origin --prune`.
9. Compare the current branch with `origin/main`.
10. Preserve user changes. Do not reset, checkout, or revert files without an explicit request.

Owner-facing aliases for this startup workflow:

- `Старт`
- `Start`
- `Start Context`
- `Story` when the owner wants the project/game brief

The shortcut command is:

```powershell
tools/codex/start-context.cmd
```

Short alias:

```powershell
tools/codex/start.cmd
```

Use `-Full` when you need full active-goal detail.

## Current Operating Notes

- `origin/main` is the integration branch.
- `codex/mm-bots` has been used for bot/matchmaking work and may diverge from `main`.
- `codex/balance` is the dedicated branch for balance-related work and balance commits.
- `codex/building-assets` is the dedicated branch for new building models, Town Hall
  variants, building textures, Godot import metadata, test-only building registrations,
  and building asset pipeline docs.
- GitHub branch protection was not configured at the time of the last inspection.
- Collaborators can commit directly to `main` if they have write/admin access.
- Pull-request prompts appear when someone pushes to a non-main branch that is ahead of `main`.
- `production/active-goals.md` is the source of truth for what the user wants next.
- Troop upgrades are intended to track both progression buildings exactly: target troop LvN
  requires both Town Hall LvN and Barn LvN. Playable troops currently reach Lv9; server
  `TROOP_DEFS` is authoritative, and matching stats must stay in sync across
  `server/combat_defs.js`, `scripts/*troop*.gd`, and `web/src/components/BarnPanel.jsx`.

## Risky Areas

- `server/routes.js` and `server/db.js` are large and central.
- `scripts/building_system.gd` owns client building definitions.
- `web/src/admin/AdminApp.jsx` is large and often touched.
- Client/server building, troop, and economy constants must stay in sync.
- PvP bot/matchmaking logic must remain server-authoritative and measurable.

## Verification Commands

Quick syntax check:

```powershell
tools/codex/check-repo.cmd -Mode Quick
```

Full local check:

```powershell
tools/codex/check-repo.cmd -Mode Full
```

Deploy preflight:

```powershell
tools/codex/check-repo.cmd -Mode Deploy
```

Common direct checks:

```powershell
node --check server/index.js
node --check server/routes.js
node --check server/db.js
npm.cmd --prefix web run lint
npm.cmd --prefix web run build
```

Manual local playtest:

```powershell
tools/codex/playtest-local.cmd
```

This starts local server/web if needed and opens the game in guest mode plus the admin panel.
The local playtest admin key is `local-dev-admin`; it is set only for the local server process.

Full owner-facing local test:

```powershell
tools/codex/playtest-local.cmd -ExportGodot -GuestCount 2 -OpenServerDashboard
```

Use this for `Play Test`, `Local Test`, or `Тест локально`. It exports Godot locally,
starts local server/web, opens two separate guest player sessions, and opens the local admin panel.
Stop local playtest background servers with:

```powershell
tools/codex/stop-local-playtest.cmd
```

Local balance test:

```powershell
tools/codex/local-test-balance.cmd
```

Use this when the owner says `Local Test Balance` or asks for local balance verification.

## Deploy Defaults

- Use the `deploy-clash` skill before deployment.
- Prefer deploying from `main`.
- Run a deploy preflight first.
- Do not deploy with dirty local changes unless the user explicitly accepts that risk.
- Main wrapper:

```powershell
tools/codex/deploy-local-to-prod.cmd -Branch main
```

## Collaboration Rules

- No commits, pushes, PR merges, or production deploys without explicit user instruction.
- Keep balance-related commits on `codex/balance` unless the user directs otherwise.
- Keep building model/asset/content commits on `codex/building-assets` unless the user
  directs otherwise.
- Explain multi-file edits before applying them.
- A task is only complete after the agent has run focused local verification when feasible.
- For gameplay/UI/server changes, prefer real local checks, local playtests, replay simulations,
  or Godot/live inspection over static inspection alone.
- Verify the actual changed behavior before calling work complete. For example, a new defense
  projectile needs evidence that it fires, travels/impacts, and damages a target or records
  combat telemetry.
- If a live behavior check is not possible, run the strongest fallback check and clearly state
  the remaining unverified risk.
- If the agent finds a bug caused by its change, it should fix it and re-run the focused check
  before reporting completion.
- Do not break existing working systems by default. Warn before intentional removals,
  compatibility breaks, schema risks, or production-impacting actions.
- Append every explicit user request to `production/user-request-log.md` with a timestamp
  and the user's original wording before starting substantial work. Create the file if missing.
- Update `production/active-goals.md` when goal status or next steps change.
- For Godot scene work, prefer `TestMain` and live inspection when available.
