# Coordination Rules

## Operating Mode

Codex works user-first in this repository. Implement requested changes directly when the scope is clear, but explain multi-file edits before applying them and never commit unless the user asks.

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
