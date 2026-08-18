# Active Session State

Last updated: 2026-08-18

## Current Focus

Release checkpoint (2026-08-14): the owner authorized committing, pushing, and
deploying the complete reviewed `main` worktree. The candidate combines
Robinhood Lighter account `3156`/referral attribution, Aster and Decibel
builder/referral tracking, tournament and battle-result UI, and Godot building
move/grid improvements. Before release, the canonical deploy configuration must
pin the RH Lighter integrator index/owner/one-bps fee/referral, all focused
exchange/UI/Godot checks must pass, and production must verify the `rhlighter`
tournament-schema migration without losing rows. No funded order is part of the
release smoke.

The active implementation task is the live `clashSOL` Sanctum Battle Shop and
completed-day holder reward integration (goal G-010). Sanctum now resolves the launched
9-decimal SanctumSpl clashSOL mint. Current work moves the existing secure swap
flow out of the construction picker, adds SOL↔clashSOL exact-input swaps, daily
server-verified Gold entitlements at an initial 2,000 Gold per clashSOL, player
history, and admin configuration/metrics. Reward observations run every 30
minutes, mature on the next UTC day from the minimum observed balance, and can
be claimed partially when Gold storage is constrained. The API key remains
server-only.

Implementation checkpoint: Sanctum's external pool is live and the complete
bidirectional swap, completed-day reward, admin and audit-export implementation
is on production. The v1.1.3 follow-up release fixes the first owner-signed
swap incident: a wallet-refreshed recent blockhash and standard Compute Budget
limit/price are accepted only after exact comparison of signer keys, account
roles, lookup tables, and every non-Compute instruction; the calculated wallet
priority fee is capped at 0.005 SOL. Primary signatures
are stored before execute; ambiguous upstream/RPC outcomes reconcile as
submission-unknown instead of inviting a duplicate; and old/cleared browser
sessions recover the server's active order. The Battle Shop now presents a
bridge-style four-stage status, minimizes safely, polls while nonterminal, and
shows explorer/error/balance receipts. Its Marketplace navigation also keeps
full-height tabs and actions under long-list overflow. Focused lifecycle,
migration, reward, UI, lint and build gates are being finalized before the
authorized v1.1.3 commit/push/deploy. A funded retry remains owner-signed in
the browser.

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

For Robinhood Lighter v1.1.2, verify the owner account `3156` is shown as
self-referral-exempt, then let the owner explicitly approve the same-master
integrator before attempting any trade. For clashSOL, ship v1.1.3, verify the
bounded wallet-fee and Battle Shop layout fixes in production, continue
monitoring the first completed UTC-day reward finalization/claim, and run the
funded swap checklist only with an owner wallet signature. General context
recovery remains:

```powershell
tools/codex/start-context.cmd -Full
tools/codex/check-repo.cmd -Mode Quick
```

G-006 Dango Realtime Exchange Integration was retired on 2026-07-30 after the
exchange ceased operation. Historical records remain readable, but Dango is no
longer selectable and no Dango workers or API routes are started.

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
