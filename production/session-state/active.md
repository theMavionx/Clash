# Active Session State

Last updated: 2026-06-18

## Current Focus

The repository is being prepared for faster owner-driven Codex work. Durable context now lives in:

- `production/agent-memory.md`
- `production/active-goals.md`
- project skills under `.agents/skills/`
- helper scripts under `tools/codex/`
- balance work branch: `codex/balance`

## Active Goals

See `production/active-goals.md`.

Main current goals:

1. PvP arena bots and matchmaking targeting a normal player win rate of 55-58%.
2. Full game balance pass across resources, buildings, troops, defenses, upgrades, and progression.
3. Agent workflow, memory, hooks, skills, and deployment automation.
4. Resource building upgrade content for Sawmill, Storage, and Mine.

## Git Notes

- Preserve dirty user changes.
- Do not commit, push, merge, or deploy without explicit user instruction.
- Put balance-related work and balance commits on `codex/balance`.
- Pull-request prompts on GitHub are expected when a non-main branch is ahead of `main`.

## Quality Notes

- Before reporting a feature/gameplay/UI/server task as done, run the most relevant focused
  local verification that is feasible.
- Prefer local playtests, replay simulations, local web/server checks, or Godot/live inspection
  for user-facing gameplay work.
- If verification finds a bug caused by the current change, fix it and verify again.
- Do not break existing working systems by default; warn before intentional removals or
  compatibility breaks.

## Next Useful Checkpoint

Run:

```powershell
tools/codex/start-context.cmd -Full
tools/codex/check-repo.cmd -Mode Quick
```

Current execution focus: G-002 Full Game Balance Pass checkpoint complete.

Completed on 2026-06-18:

1. Added TH4/TH2-TH4 support to `tools/pvp-balance/run.js`.
2. Tuned TH4 normal/hard bot templates in `server/matchmaking_defs.js`.
3. Improved TH4 PvP breakability from 22.1% attacker win rate to 57.8%.
4. Verified mixed TH2-TH4 PvP at 56.9% across 3000 generated battles.
5. Documented before/after reasoning in `production/reports/g002-full-balance-pass-2026-06-18.md`.

Remaining follow-up:

- Decide target economy max-out pace. Current live server pacing is about 102 days
  to full TH4 max before raid income, which may be acceptable for monetization but
  no longer matches the older 4-week economy fantasy.
