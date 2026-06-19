# Coordination Rules

## Operating Mode

Codex works user-first in this repository. Implement requested changes directly when the scope is clear, but explain multi-file edits before applying them.

No commits, pushes, pull-request merges, production deploys, or production database changes are allowed unless the owner explicitly approves that exact action in the current conversation. Local checks, local dev servers, and local playtests are allowed when they do not affect production.

## Definition Of Done

- Inspect the affected system before editing.
- Implement the smallest coherent change that satisfies the request.
- Run focused verification after the change. For gameplay/user-facing changes, prefer a real local check or playtest over static review alone.
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
