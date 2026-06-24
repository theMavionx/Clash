# Coordination Rules

## Operating Mode

Codex works user-first in this repository. Implement requested changes directly when the scope is clear, but explain multi-file edits before applying them.

Codex checks GitHub remote freshness only at the start of a new work session, not before every
small task in an active back-and-forth. A new work session means a fresh chat/context recovery,
the owner returning after a meaningful break such as a new day, broad repo/goal startup, or the
owner explicitly says they pushed/changed commits on GitHub. Then run `git fetch origin
--prune`, check `git status --short --branch`, compare the current branch with `origin/main`,
and summarize any new remote commits or authors. This is an inspection step only; local
`git status` checks are still okay whenever needed to protect dirty work. Do not pull, merge,
rebase, reset, or discard local work without explicit owner approval.

When accepting incoming GitHub changes, Codex must resolve conflicts if they appear and keep
the project working. Preserve local owner work and intended incoming changes, remove conflict
markers, confirm there are no unmerged paths, and run the closest practical verification after
the merge. If safe conflict resolution is unclear, stop and report the blocker rather than
guessing.

No commits, pushes, pull-request merges, production deploys, or production database changes are allowed unless the owner explicitly approves that exact action in the current conversation. Local checks, local dev servers, and local playtests are allowed when they do not affect production.

When the owner starts executing a goal, Codex must offer two modes unless the owner already
chose one: full goal run to completion with self-verification, or step-by-step execution with
owner checks after each meaningful action before continuing. In step-by-step mode, every
handoff must say exactly where and how the owner can verify the work and give feedback.

For all goal work, if Codex can safely open the required local game/admin/browser windows and
run the needed local action, it should do so and leave the owner with a ready state to inspect.
Do not only give manual instructions when a local automated setup or seeded verification flow is
practical. If blocked, report the blocker and the closest manual verification path.

For local playtests and admin checks, Codex should open all local URLs in Chrome in one browser
window with multiple tabs. Do not use Firefox or the OS default browser as fallback; if Chrome is
unavailable, print the URLs for the owner.

For localhost guest playtests only, avoid extra first-run/tutorial/news/update notices that block
inspection. Do not suppress those flows for production hosts or normal accounts.

## Definition Of Done

- Inspect the affected system before editing.
- Implement the smallest coherent change that satisfies the request.
- Preserve existing working behavior when adding new functionality. A new unit, building,
  UI flow, backend route, economy value, or telemetry path must not break existing units,
  systems, UI, server sync, replays, or local flows unless the owner explicitly approves the
  behavior change.
- Run focused verification after the change. For gameplay/user-facing changes, prefer a real local check or playtest over static review alone.
- Verify the actual changed behavior, not just that files parse. Gameplay changes should be
  checked through the closest practical live flow, replay, local simulation, or Godot scene
  inspection. Example: a new Mortar projectile is not done until the agent verifies that a
  projectile is emitted, reaches/impacts a target, and damage or telemetry is observed.
- Also verify the nearest existing regression risks. For example, after adding a new unit,
  confirm the existing units still deploy, fight, die, sync with the server, and appear correctly
  in UI/replays.
- If a real behavior check is impossible in the current environment, run the strongest fallback
  check and clearly report the unverified risk instead of claiming full verification.
- If verification exposes a regression or bug caused by the change, fix it and verify again.
- Do not break previously working systems unless the owner explicitly approves the break or replacement.
- Warn before intentional behavior removal, compatibility breaks, schema risks, or production-impacting actions.
- Final updates must include changed scope, checks run, and any remaining unverified risk.

## Branch Discipline

- `main` is the integration branch.
- `codex/balance` is the owner-designated branch for economy, combat, progression, resource-building, and tuning work.
- `codex/building-assets` is the owner-designated branch for new building models, Town Hall variants, resource/defense building visuals, textures, Godot `.import` files, test-only building registrations, and building asset pipeline docs.
- Before balance work, check `git status --short --branch`.
- Do not mix unrelated feature work into balance commits.
- Before building-asset work, check `git status --short --branch`; switch to `codex/building-assets` only when doing so will not overwrite local changes.
- Keep pure asset/model work separate from tuning-only balance work when practical.

## Delegation Model

- Use `producer` for planning, sprint, milestone, release, and cross-team coordination.
- Use `technical-director` or `lead-programmer` for architecture, API boundaries, and risky refactors.
- Use `game-designer`, `systems-designer`, and `economy-designer` for mechanics, formulas, balance, and progression.
- Use `godot-specialist` and Godot sub-specialists for scene, GDScript, shader, and GDExtension work.
- Use `qa-lead` or `qa-tester` for test strategy, regressions, and bug verification.

## Conflict Rules

- Design vs technical feasibility: surface the trade-off and ask before changing intent.
- Client vs server mismatch: treat the server as authoritative for gameplay-critical state.
- Scene workflow ambiguity: put experimental work in `TestMain.tscn`; promote only after approval.
- Cross-domain changes: state affected files and systems before editing.

## Change Hygiene

- Keep edits narrowly scoped.
- Preserve user changes in the worktree.
- Update shared docs when a decision outlives the current conversation.
- Use `production/session-state/active.md` for long-running work checkpoints.
