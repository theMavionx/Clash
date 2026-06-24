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

For a new work session, do the GitHub freshness check before editing: fetch `origin`, compare
the current branch against `origin/main`, and tell the owner whether new remote commits exist
and who authored them. Do not run this remote check before every small task in an active
back-and-forth. Treat a fresh chat/context recovery, the owner returning after a meaningful
break such as a new day, broad repo/goal startup, or the owner explicitly saying they
pushed/changed commits on GitHub as a new work session. Do not pull, merge, or rebase
automatically.

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
- Troop upgrades are intended to reach Lv7: Lv5-Lv7 require Town Hall Lv5, server `TROOP_DEFS`
  are authoritative, and matching stats must stay in sync across `server/combat_defs.js`,
  `scripts/*troop*.gd`, and `web/src/components/BarnPanel.jsx`.

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

This starts local server/web if needed and opens the game in guest mode plus the admin panel in
one Chrome window with tabs. The local playtest admin key is `local-dev-admin`; it is set only
for the local server process.
Local guest sessions on localhost suppress first-run/tutorial/news/update notices so the owner
can inspect the game without closing extra panels.

Full owner-facing local test:

```powershell
tools/codex/playtest-local.cmd -ExportGodot -GuestCount 2 -OpenServerDashboard
```

Use this for `Play Test`, `Local Test`, or `Тест локально`. It exports Godot locally,
starts local server/web, and opens two guest player tabs plus the local admin panel in one Chrome
window. Do not fall back to Firefox/default browser; print the URLs if Chrome is unavailable.
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
- Check GitHub for new remote commits at the start of a new work session, not before every
  small task in an active back-and-forth. A new work session means fresh chat/context recovery,
  the owner returning after a meaningful break such as a new day, broad repo/goal startup, or
  the owner explicitly saying they pushed/changed commits on GitHub. Then use
  `git fetch origin --prune`, `git status --short --branch`, and a current-branch vs
  `origin/main` comparison; summarize new remote commits before editing. Local `git status`
  checks are still okay whenever needed to protect dirty work.
- When accepting incoming GitHub changes, do not stop at a conflicted merge state. Resolve
  conflicts carefully, preserve local owner work and intended incoming changes, remove all
  conflict markers, confirm there are no unmerged paths, and run the closest practical
  verification so the project still works. If safe resolution is unclear, stop and report
  the blocker instead of guessing.
- Keep balance-related commits on `codex/balance` unless the user directs otherwise.
- Keep building model/asset/content commits on `codex/building-assets` unless the user
  directs otherwise.
- Explain multi-file edits before applying them.
- Ordinary repo file edits do not need separate owner confirmation when they are part of the
  requested task or checkpoint work, including `.md` docs, reports, rules, active-goal/session
  files, and local request logs. Commits, pushes, merges, deploys, production data changes,
  destructive commands, and broad compatibility breaks still require explicit owner approval.
- When starting work on a goal, ask the owner to choose between two modes unless already
  specified: full goal run to completion with self-verification, or small owner-gated steps
  where each meaningful action is reported with exact owner-check instructions before
  continuing.
- For all goal work, when a local game/admin/browser flow can be opened safely, open the needed
  windows and perform the verification action yourself so the owner can inspect a ready state.
  Seed local data through gameplay/API/admin actions when practical instead of only writing
  instructions. If blocked, state the blocker and provide the closest manual check.
- A task is only complete after the agent has run focused local verification when feasible.
- New functionality must preserve existing behavior. When adding a unit, building, defense,
  UI flow, backend route, economy value, or telemetry path, verify the new path and the nearest
  old paths that could regress. Existing units/systems should continue working exactly as before
  unless the owner explicitly approves a behavior change.
- For gameplay/UI/server changes, prefer real local checks, local playtests, replay simulations,
  or Godot/live inspection over static inspection alone.
- Verify the actual changed behavior before calling work complete. For example, a new defense
  projectile needs evidence that it fires, travels/impacts, and damages a target or records
  combat telemetry.
- Telemetry and analytics must be low-overhead. Keep payloads bounded, avoid blocking
  client/battle flow on telemetry writes, and verify that new telemetry does not make gameplay
  or rewards feel laggy.
- If a live behavior check is not possible, run the strongest fallback check and clearly state
  the remaining unverified risk.
- If the agent finds a bug caused by its change, it should fix it and re-run the focused check
  before reporting completion.
- Do not break existing working systems by default. Warn before intentional removals,
  compatibility breaks, schema risks, or production-impacting actions.
- Append every explicit user request to the local-only `production/user-request-log.md` with a
  timestamp and the user's original wording before starting substantial work. Create the file if
  missing, but do not commit or push it to GitHub.
- Keep request-log entries readable. Try to decode broken text; if a request cannot be recovered
  into understandable wording, ask the owner or remove that unreadable entry instead of preserving
  garbage text.
- Update `production/active-goals.md` when goal status or next steps change.
- For Godot scene work, prefer `TestMain` and live inspection when available.
