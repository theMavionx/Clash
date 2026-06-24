# Clash - Game Studio Agent Architecture

Clash of Clans style game built with Godot 4.6.1, managed through coordinated Codex subagents.

## Technology Stack

- **Engine**: Godot 4.6.1
- **Language**: GDScript
- **Backend**: Node.js + SQLite
- **Version Control**: Git
- **MCP**: Godot MCP server for live scene inspection

## Project Structure

@.codex/docs/directory-structure.md

## Scene Workflow

@docs/scene-workflow.md

## Technical Preferences

@.codex/docs/technical-preferences.md

## Coordination Rules

@.codex/docs/coordination-rules.md

## Collaboration Protocol

**User-driven collaboration, not autonomous execution.**

- Agents follow user instructions directly
- Multi-file changes should be explained before applying
- Ordinary repository file edits do not require separate owner confirmation when they are part
  of the requested task or checkpoint work, including `.md` docs, reports, rules,
  active-goal/session files, and local request logs.
- No commits, pushes, pull-request merges, production deploys, or production database changes
  without explicit owner approval in the current conversation
- Use Godot MCP tools when available for scene inspection
- Local checks, local servers, local playtests, and draft file edits are allowed when they help
  complete the requested task

## Quality Bar

- For feature, gameplay, UI, balance, server, or content changes, the task is not done until
  the agent has run the most relevant local verification it can reasonably run.
- New functionality must not break existing working behavior. When adding a unit, building,
  defense, UI flow, backend route, economy value, or telemetry path, verify the new behavior
  and the closest existing systems that could regress. Existing units and flows must keep
  working as they did before unless the owner explicitly approved a behavior change.
- Prefer a real local flow over static inspection when the change affects gameplay or user
  experience: start local services, open the local client, run a replay/simulation, or use
  Godot/live inspection when available.
- Verification must check the actual behavior changed, not only syntax. For example, after
  adding a defense projectile, confirm the projectile spawns, travels to a target, impacts,
  and the target HP changes or combat telemetry records damage.
- For each meaningful change, choose the closest practical verification level: focused unit
  or syntax check, local simulation/replay, local web/server smoke check, manual local
  playtest, Godot scene inspection, or browser/admin flow.
- If a real local verification cannot be run, state exactly why, run the strongest fallback
  check available, and do not describe the behavior as fully verified.
- If verification finds a bug caused by the change, fix it and re-run the focused check before
  reporting completion.
- Do not break existing working systems while adding or removing functionality. If a requested
  change intentionally breaks compatibility or removes behavior, warn the owner before doing it.
- Preserve existing behavior by default; changes should be additive or narrowly targeted unless
  the owner explicitly asks for a replacement/removal.
- In the final report, state what was changed, what was verified, and any remaining risk or check
  that could not be run.

## Coding Standards

@.codex/docs/coding-standards.md

## Context Management

@.codex/docs/context-management.md

## Project Memory

@production/agent-memory.md

## Project Story

@production/project-story.md

## Owner-Agent Rules

@production/owner-agent-rules.md

## Active Goals

@production/active-goals.md

## Personal Workflow

- At the start of a fresh chat, context recovery, broad repo analysis, or goal work, read:
  `AGENTS.md`, `production/owner-agent-rules.md`, `production/project-story.md`,
  `production/agent-memory.md`, `production/active-goals.md`, and
  `production/session-state/active.md`.
- Check GitHub remote freshness only at the start of a new work session, not before every
  small task in an active back-and-forth. A new work session means a fresh chat/context
  recovery, the owner returning after a meaningful break such as a new day, broad repo/goal
  startup, or the owner explicitly says they pushed/changed commits on GitHub. Then run
  `git fetch origin --prune`, check `git status --short --branch`, compare the current branch
  with `origin/main`, and summarize any new remote commits/authors. Local `git status` checks
  are still okay whenever needed to protect dirty work. Do not pull, merge, rebase, reset, or
  discard local work without explicit owner approval.
- When accepting incoming changes from GitHub, resolve conflicts if they appear and verify that
  the project still works. Preserve local owner work and intended incoming changes, remove
  conflict markers, confirm there are no unmerged paths, and run the closest practical local
  check. If a conflict cannot be resolved safely, stop and report the blocker.
- For a fresh chat or after context loss, load project memory first:
  `tools/codex/start-context.cmd`
- If the owner says `Старт`, `Start`, `Start Context`, or `Story`, run the project-start
  workflow and summarize the game, repo state, active goals, and best next action.
- Treat `production/active-goals.md` as the source of truth for current goals.
- When starting goal work, update the goal status/checkpoint before broad edits.
- When the owner starts executing a goal, first offer two modes unless already specified:
  full goal run to completion with self-verification, or step-by-step execution with owner
  checks after each meaningful action before continuing. In step-by-step mode, say exactly
  where and how the owner can verify the work and give feedback.
- For all goal work, if local game/admin/browser windows can be opened safely, open them and run
  the needed local action yourself so the owner can inspect a ready state. Do not only describe
  manual steps when an automated local setup or seeded verification flow is practical.
- For production deploys, use the `deploy-clash` skill and the existing deploy scripts.
- Optional local git hooks live in `tools/codex/git-hooks/` and can be installed with
  `tools/codex/install-git-hooks.cmd`.
- For manual owner playtests, use `tools/codex/playtest-local.cmd`.
- Local playtest URLs should open in Chrome in one browser window with multiple tabs; do not
  fall back to Firefox/default browser if Chrome is unavailable.
- On localhost guest sessions only, suppress first-run/tutorial/news/update notices that block
  quick inspection. Do not suppress them for production or normal accounts.
- For local balance verification, use `tools/codex/local-test-balance.cmd`.

## Branch Discipline

- `main` is the integration branch.
- Balance-related work belongs on `codex/balance`.
- Before starting balance work, run `git status --short --branch`; if not already on
  `codex/balance`, switch to it only when doing so will not overwrite local changes.
- Keep balance commits limited to economy, combat, progression, resource buildings, and
  tuning support files. Use a separate branch for unrelated features.
- New building content belongs on `codex/building-assets`.
- Use `codex/building-assets` for new/updated building models, Town Hall variants,
  resource/defense building visuals, Godot `.import` files, textures, test-only building
  registrations, and building asset pipeline docs.
- If a building change includes combat/economy numbers, split pure visuals/assets from
  balance tuning when practical; put tuning-only changes on `codex/balance`.

## Engine Version Reference

@docs/engine-reference/godot/VERSION.md

## Game Systems

### Buildings
Defined in `scripts/building_system.gd` -> `building_defs` dictionary.
Server definitions in `server/db.js` -> `BUILDING_DEFS`.
Types: Town Hall, Mine, Barn, Port, Sawmill, Turret, Storage, Archer Tower, Tombstone.

### Troops
Base class: `scripts/base_troop.gd`. Active individuals: knight, mage, archer, demon king, fire dragon.
Deployed from ships via `scripts/attack_system.gd`.
Dual targeting: closest building OR skeleton guard.

### Defense
- **Turrets**: Auto-fire at troops
- **Archer Towers**: Ranged defense
- **Tombstone**: Spawns skeleton guards that chase and attack troops

### Server Sync
Buildings and troop levels sync with Node.js backend.
Resources: gold, wood, ore. Production buildings generate resources over time.
