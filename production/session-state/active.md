# Active Session State

Last updated: 2026-07-05

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

Main current goals:

1. PvP arena bots and matchmaking targeting a normal player win rate of 55-58%.
2. Full game balance pass across resources, buildings, troops, defenses, upgrades, and progression.
3. Agent workflow, memory, hooks, skills, and deployment automation.
4. Resource building upgrade content for Sawmill, Storage, and Mine.
5. Mortar functionality and Town Hall 5 expansion with TH5 unlocks.
6. Dango realtime exchange integration with WebSocket-backed trade credit.

## Git Notes

- Preserve dirty user changes.
- Do not commit, push, merge, or deploy without explicit user instruction.
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

## Next Useful Checkpoint

Run:

```powershell
tools/codex/start-context.cmd -Full
tools/codex/check-repo.cmd -Mode Quick
```

Current execution focus: G-006 Dango Realtime Exchange Integration audit and
foundation checkpoint complete.

Completed on 2026-07-05:

1. Added Dango as a selectable self-custody futures DEX across server, futures
   server, admin/tournament lists, and `FuturesPanel`.
2. Added `server-futures/dango.js` and `dango-realtime-worker.js` using Dango
   REST `/query`, `/simulate`, `/broadcast`, GraphQL reads, and native `/ws`
   `perpsEvents`.
3. Added Dango verified fill rows as `trade_history.dex = 'dango'` with
   `verified_source = 'dango_ws'` so gold, quests, and tournaments use the
   existing reward path.
4. Added signed message flows for order/cancel, margin deposit/withdraw, and
   conditional TP/SL. Unsigned writes return `428 DANGO_SIGNATURE_REQUIRED`
   with a Dango `execute` payload.
5. Verified syntax, frontend build, Dango live market/account/order reads,
   backfill smoke, and native WebSocket open/close.

Remaining follow-up:

- Build and verify the browser Dango Tx signing/session credential UX against a
  real Dango account; current server routes correctly prepare and broadcast
  signed Tx payloads but cannot complete unsigned writes by design.
- Run a real Dango filled-trade smoke on testnet/mainnet account before calling
  player trading end-to-end complete.

## Public Dashboard Checkpoint (2026-07-10)

- Added a lightweight public `/dashboard` web entry for lifetime users, rolling
  24h/7d activity, verified indexed trading volume, and published $CLASH
  buyback/burn totals and transaction references.
- Added an append-only `$CLASH` transaction ledger plus protected admin review
  and publish flow. Manual treasury records validate Solana signature format;
  admins remain responsible for checking transaction meaning before publishing.
- Added production nginx/Express routing, focused API smoke coverage, frontend
  lint/build verification, responsive browser rendering, and Quick repo checks.
- Not deployed; production release still requires explicit owner approval.
