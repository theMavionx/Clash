# Active Session State

Last updated: 2026-06-24

## Current Focus

The repository is being prepared for faster owner-driven Codex work. Durable context now lives in:

- `production/agent-memory.md`
- `production/active-goals.md`
- project skills under `.agents/skills/`
- helper scripts under `tools/codex/`
- balance work branch: `codex/balance`
- building asset/content branch: `codex/building-assets`

## Active Goals

See `production/active-goals.md`.

Current active goal:

- None selected after closing G-001 MVP on 2026-06-24.

## Git Notes

- Preserve dirty user changes.
- Do not commit, push, merge, or deploy without explicit user instruction.
- Check GitHub remote commits at the start of a new work session only: fresh chat/context
  recovery, owner returning after a meaningful break such as a new day, broad repo/goal
  startup, or owner explicitly saying they pushed/changed commits on GitHub. Do not run
  remote freshness checks before every small task in the same active conversation. Local
  `git status` is still okay whenever needed to protect dirty work.
- Put balance-related work and balance commits on `codex/balance`.
- Put new building models, textures, Godot imports, and building asset/content commits
  on `codex/building-assets`.
- Pull-request prompts on GitHub are expected when a non-main branch is ahead of `main`.

## Quality Notes

- Before reporting a feature/gameplay/UI/server task as done, run the most relevant focused
  local verification that is feasible.
- Prefer local playtests, replay simulations, local web/server checks, or Godot/live inspection
  for user-facing gameplay work.
- Verification should prove the actual changed behavior. For Mortar-style defense work, check
  projectile spawn/travel/impact plus target HP damage or combat telemetry, not only syntax.
- If live verification is blocked, run the best fallback and report the remaining risk clearly.
- If verification finds a bug caused by the current change, fix it and verify again.
- Do not break existing working systems by default; warn before intentional removals or
  compatibility breaks.
- Battle telemetry must stay low-overhead: bounded payloads, safe failure handling, and no
  blocking work that can make battles, rewards, or UI feel laggy.
- For goal work, prefer opening the local game/admin/browser flow and seeding the verification
  state for the owner when it is safe and feasible, instead of only giving manual instructions.
- In step-by-step owner-check mode, every checkpoint update should say the current checkpoint
  number, estimated total checkpoints, and how many remain. Revise the estimate explicitly if
  new work appears during verification.
- Local playtest/admin URLs should open in one Chrome window with tabs. Do not fall back to
  Firefox/default browser; if Chrome is unavailable, print the URLs.
- Localhost guest sessions should suppress first-run/tutorial/news/update notices only for local
  guest inspection, not for production or normal accounts.

## Next Useful Checkpoint

Run:

```powershell
tools/codex/start-context.cmd -Full
tools/codex/check-repo.cmd -Mode Quick
```

Current execution focus: none selected.

Next useful checkpoint:

- G-001 Backend Battle Telemetry is complete as MVP. Checkpoint count reached 5/5, with
  0 remaining checkpoints.
- Latest local owner battle produced one
  session with four expected events: `battle_started`, `result_submitted`,
  `verification_done`, and `defeat_recorded`.
- Latest checkpoint: Battle Telemetry admin UI now groups events into Battle Sessions so one
  played battle appears as one session timeline, with raw events kept below for debugging.
- Latest verification: a controlled local victory/reward battle completed through
  `/attack/result`, replay verification returned `ACCEPTED`, `reward_applied` telemetry was
  written, and attacker resources changed from `700/1000/1000` to `1600/1750/1600` after
  loot `900/750/600`.
- Latest checkpoint: telemetry event contract documented in
  `production/reports/g001-battle-telemetry-contract-2026-06-24.md`.
- Latest guardrail check: temporary SQLite test confirmed payload cap, queue cap, bounded flush
  batches, insert-failure isolation, and post-failure recovery.
- Latest checkpoint: optional bounded client/Godot replay telemetry ingestion is implemented.
  Godot sends at most 250 replay events, React trims replay payloads before upload, the server
  rate-limits/caps replay telemetry, and the admin panel now shows `Client Replay Telemetry`.
- Latest local smoke: a 300-event replay telemetry upload through the running local stack
  returned `stored_events: 250`, `dropped_events: 50`, and is visible as `bounded-replay-smoke`
  in the admin Battle Telemetry tab.
- Latest live replay check: after `tools\codex\playtest-local.cmd -ExportGodot -NoOpen`, a
  real stored battle replay was played through the browser `godotBridge` `watch_replay` path.
  It reached the victory overlay and created `Client Replay Telemetry` row `id = 2`,
  label `CODEX LIVE REPLAY EXPORT 1782303055987`, with `events_recorded = 120` and
  `events_dropped = 0`.
- Note for future browser checks: if a GDScript telemetry change seems missing in the web
  client, export Godot locally first; the browser uses the last web export, not raw `.gd`
  files directly.
- Next owner choice: pick the next active goal/follow-up. Optional telemetry follow-ups should
  become a new task instead of reopening G-001 MVP.
