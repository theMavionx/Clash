# Context Management

## File-Backed State

For long tasks, maintain `production/session-state/active.md` as the durable checkpoint. Update it after significant milestones, decisions, implementation progress, and verification results.

Include:

- Current task and goal.
- Progress checklist.
- Files being edited.
- Decisions made and rationale.
- Open questions or blockers.
- Tests or checks run.

## Recovery

After compaction, crash, or a new session:

1. Read `production/session-state/active.md`.
2. Read the files listed as active.
3. Continue from the next unfinished step.

## Efficient Exploration

- Use `rg` and `rg --files` first.
- Read targeted files directly when the area is clear.
- For broad or unfamiliar areas, summarize findings instead of carrying huge file dumps in conversation.
- Keep reusable decisions in docs, ADRs, or session state, not only in chat.
