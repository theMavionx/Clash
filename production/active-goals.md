# Active Goals

This file is the durable list of current goals. Keep it short, current, and specific enough
that a fresh agent can continue the work.

Status legend: `active`, `blocked`, `done`, `paused`.

## G-001 PvP Arena Bots And Matchmaking

- Status: active
- Priority: P0
- Owner intent: normal players should win around 55-58% of PvP arena matches.
- Core idea: if a player loses too much, match them with an easier bot/opponent; if they win too much, match them with a stronger bot/player.
- Important constraint: this should feel fair and believable, not like guaranteed wins or fake outcomes.

Key files and docs:

- `server/matchmaking_defs.js`
- `server/db.js`
- `server/routes.js`
- `server/combat_defs.js`
- `server/combat_session.js`
- `scripts/attack_system.gd`
- `scripts/bs_battle.gd`
- `docs/architecture/adr-0011-server-bot-bases-and-recovery-matchmaking.md`

Acceptance criteria:

- Bot/opponent selection is server-authoritative.
- Matchmaking reacts to recent player performance.
- Easy/recovery matches exist for losing streaks.
- Harder matches exist for strong winning streaks.
- There is enough logging or stored telemetry to audit win-rate behavior.
- The expected win-rate target is documented near the implementation.
- Local syntax checks pass.

Next checkpoint:

- Audit the current bot/matchmaking implementation and list what is already working,
  what is missing, and what needs tuning.

## G-002 Full Game Balance Pass

- Status: active
- Priority: P0
- Owner intent: rebalance all tunable game parameters so the game is playable, fair,
  and still supports monetization.
- Known concern: Town Hall level 4 may be too hard or impossible to destroy.

Scope:

- Building HP for every level.
- Building upgrade costs and timings.
- Resource production: gold, wood, ore.
- Resource storage and progression pacing.
- Troop HP, damage, attack speed, range, movement speed, targeting, and costs.
- Defensive structures: turret, archer tower, tombstone, skeleton guards, and any magic/other defenses.
- PvP and PvE combat time-to-kill.
- Early, mid, and late progression pacing.
- Server/client duplicate constants.

Key files and docs:

- `design/gdd/economy-balance.md`
- `server/db.js`
- `server/combat_defs.js`
- `server/combat_session.js`
- `scripts/building_system.gd`
- `scripts/base_troop.gd`
- `scripts/attack_system.gd`

Acceptance criteria:

- TH4 and other bases are breakable by intended attackers at the intended stage.
- No single troop, defense, or building level creates an obvious dead end.
- Resource production, costs, and storage create a reasonable upgrade loop.
- Defense values and troop values produce readable combat outcomes.
- Authoritative server values and client display/gameplay values are synchronized.
- Balance changes are documented with before/after reasoning.

Next checkpoint:

- G-002 implementation checkpoint complete on 2026-06-18. TH4 PvP bot breakability
  was tuned from 22.1% attacker win rate to 57.8%; mixed TH2-TH4 simulation is
  56.9% across 3000 generated battles. See
  `production/reports/g002-full-balance-pass-2026-06-18.md`.
- Remaining follow-up: decide whether economy max-out should target roughly 4, 8,
  or 12+ weeks; current live server pacing is about 102 days to full TH4 max before
  raid income.

## G-003 Agent Workflow, Memory, And Deploy Automation

- Status: active
- Priority: P1
- Owner intent: make the repo faster to work with by adding memory, goals, skills,
  hooks, and deployment helpers.

Scope:

- Fresh-chat startup memory.
- Active goals file.
- Goal execution workflow.
- Deployment workflow.
- PvP matchmaking skill.
- Balance pass skill.
- Local git hooks and check commands.

Acceptance criteria:

- `AGENTS.md` points to memory and goals.
- A fresh agent can run `tools/codex/start-context.cmd` to load project context.
- Goal work starts from `production/active-goals.md`.
- Deploy work has a safe preflight path.
- Git hooks can be installed locally.

Next checkpoint:

- Validate helper scripts and document how to use them.

## G-004 Resource Building Upgrade Content

- Status: active
- Priority: P1
- Branch: `codex/building-assets` for new models, textures, import metadata, visual
  progression, and test-only building registrations; use `codex/balance` for
  tuning-only economy/combat values.
- Owner intent: add proper progression content for resource buildings so upgrades feel
  visually and mechanically meaningful.
- Core idea: add or complete upgraded versions for the Sawmill, Storage, and Mine,
  including new levels, models/visuals, costs, stats, and client/server sync.

Scope:

- New or upgraded Sawmill progression.
- New or upgraded Storage progression.
- New or upgraded Mine progression.
- Upgrade costs, HP, production/storage values, and unlock requirements.
- Client display data and Godot building definitions.
- Server authoritative building definitions.

Key files and docs:

- `scripts/building_system.gd`
- `server/db.js`
- `web/src/components/BuildingInfoPanel.jsx`
- `web/src/components/ShopPanel.jsx`
- `design/gdd/economy-balance.md`
- `Model/Sawmill/`
- `Model/Storage/`
- `Model/Mine/`

Acceptance criteria:

- Sawmill, Storage, and Mine have clear upgrade progression.
- New levels are not just scaled copies; they have distinct visual/function changes.
- Server and client agree on costs, HP, production/storage values, and max levels.
- Existing player data can handle the new/changed levels safely.
- The changes are included in the full balance pass before production deployment.

Next checkpoint:

- Audit current Sawmill, Storage, and Mine level definitions, available models, and
  server/client mismatches before adding new levels.

## G-005 Mortar And Town Hall 5 Expansion

- Status: active
- Priority: P1
- Branch: `codex/building-assets` for Mortar assets, building models, textures,
  Godot import metadata, and visual progression; use `codex/balance` for final
  combat/economy tuning values.
- Owner intent: make Mortar a real working defense building and add Town Hall 5
  progression with new unlocks.
- Core idea: TH5 should feel like a meaningful new tier: it unlocks a new defense
  building, new resource-building levels, and at least one new magic/defense level.

Scope:

- Make Mortar fully functional, not only a test-only model registration.
- Add Mortar placement/build flow, unlock rules, HP, cost, range, reload, damage,
  projectile behavior, splash behavior, targeting rules, and UI/admin support.
- Add Town Hall level 5 upgrade support across server and client.
- Add TH5 upgrade costs, HP, upgrade timing, display text, max-level logic, and
  safe handling for existing player data.
- Add TH5 unlocks for a new Sawmill level, Mine level, and Storage level.
- Add a new Mage Tower level for TH5, or audit/complete Mage Tower first if the
  implementation is currently partial or missing.
- Add Mortar as the new TH5 building.
- Keep server authoritative building definitions and Godot/client building
  definitions synchronized.

Key files and docs:

- `scripts/building_system.gd`
- `scripts/bs_cannon.gd`
- `scripts/attack_system.gd`
- `server/db.js`
- `server/routes.js`
- `server/combat_defs.js`
- `server/combat_session.js`
- `web/src/admin/AdminApp.jsx`
- `web/src/components/BuildingInfoPanel.jsx`
- `web/src/components/ShopPanel.jsx`
- `Model/Mortar/`
- `Model/Sawmill/`
- `Model/Mine/`
- `Model/Storage/`

Acceptance criteria:

- Players can upgrade Town Hall to level 5.
- TH5 unlock rules are visible and enforced consistently on server and client.
- Sawmill, Mine, and Storage receive new TH5-appropriate levels.
- Mage Tower has a new TH5-appropriate level, or the plan clearly documents why
  Mage Tower must be implemented before it can be leveled.
- Mortar can be built/unlocked at TH5 and works in actual combat, not only as a
  static model.
- TH5 unlocks exactly one Mortar and caps it at level 1 until a later approved
  progression pass adds higher Mortar levels.
- TH5 increases Mine, Sawmill, and Storage count limits by one each.
- Mortar is testable locally through the normal local playtest/admin flow.
- Mortar and TH5 values are included in the balance pass before production deploy.
- Local verification covers at least syntax checks, local playtest placement, and
  a focused combat/balance check for Mortar impact.

Next checkpoint:

- Refresh browser/manual playtest for the current reachable max fleet: 3 ships x
  9 troop slots. Previous 6x15/90-troop stress data is now historical overload
  data, not the current player maximum.
- Continue the balance pass for TH4/TH5 because the latest local smoke check has
  0 invalid replays but still warns that matched TH4/TH5 attacks struggle against
  heavy defenses.

Latest local checkpoint:

- Mortar dead zone is implemented in Godot and the server verifier.
- Mortar attack radius is reduced by 1.5x and has a minimum range/dead zone.
- Mortar selection visuals show a white attack radius and red dead zone only
  while the Mortar is selected.
- Godot CLI was not available from PATH, so live editor verification still needs
  a manual local playtest.

## G-006 Dango Realtime Exchange Integration

- Status: active
- Priority: P0
- Owner intent: add Dango as a full selectable futures exchange with fast
  WebSocket-backed fills so gold, quests, positions, orders, and tournament
  volume update without the long delays seen in polling-only integrations.
- Core idea: Dango trade credit must be server-authoritative from Dango
  `perpsEvents`, while browser trading must use Dango's signed Tx/session
  credential flow instead of storing user master keys server-side.

Scope:

- Dango DEX selection and account linking.
- Dango market/prices/account/positions/orders reads.
- Dango signed order, cancel, TP/SL, deposit, and withdraw routes.
- Native Dango `perpsEvents` WebSocket worker for fills and rewardable volume.
- Gold and quest credit through existing `trade_history` and claim pipelines.
- Tournament/admin DEX lists and labels.
- Frontend FuturesPanel hook integration.

Key files and docs:

- `docs/architecture/adr-0012-dango-realtime-exchange-integration.md`
- `server-futures/dango.js`
- `server-futures/dango-realtime-worker.js`
- `server-futures/routes.js`
- `server-futures/db.js`
- `web/src/hooks/useDango.js`
- `web/src/contexts/DexContext.jsx`
- `web/src/components/FuturesPanel.jsx`
- Dango API docs: https://docs.dango.exchange/perps/8-api.html
- Dango constants: https://docs.dango.exchange/perps/9-constants.html

Acceptance criteria:

- Dango appears as a selectable DEX in normal and admin/tournament flows.
- Dango market data, account state, positions, and open orders load without
  requiring a wallet popup.
- Dango write flows use browser/user-authorized signing or session credentials;
  the server never fabricates unsigned trades as successful.
- Filled Dango orders are recorded by a server-side WebSocket worker with
  deterministic `client_order_id` deduplication.
- `/claim-gold`, quest completion, and tournament scoring see Dango trades
  through the same verified trade history path as other exchanges.
- WebSocket reconnect resumes from the last seen block height or performs a
  documented backfill path.
- Local syntax/build checks pass.

Next checkpoint:

- First Dango foundation pass implemented: adapter, realtime worker, DEX
  registry entries, frontend hook wiring, syntax checks, frontend build,
  live market read smoke, and native WebSocket handshake smoke. Full browser
  signing/session credential UX remains the next checkpoint before Dango
  trading can be considered end-to-end complete from the player UI.
- Docs audit checkpoint completed on 2026-07-05: Dango REST/GraphQL/WebSocket
  requests were rechecked against the API reference. Fixed request body shapes
  for REST `/simulate` and `/broadcast`, `submit_order`, `cancel_order`,
  `orders_by_user`, `user_state_extended`, native WebSocket ids, and the testnet
  perps contract constant. Remaining gap is still the browser signing/session
  credential UX plus deposit/withdraw/TP-SL UI flows.
- Follow-up bug audit completed on 2026-07-05: fixed Dango reward source
  recognition in `server/trade_reconciliation.js`, added Dango smart-account
  resolution from Ethereum key hash, fixed raw Tx acceptance in Dango proxy
  routes, made Dango backfill paginated, and ensured WebSocket reconnect paths
  reopen subscriptions after `ws_error`.
- Continued Dango audit completed on 2026-07-05: added docs-matched signed
  message flows for margin deposit/withdraw and standalone conditional TP/SL,
  normalized Dango fixed-point numeric payloads to six decimals, fixed Dango
  close-long size direction, preserved direct account-address resolution before
  Ethereum key-hash fallback, and included native WebSocket error codes so
  `resync` reconnects are reliably detected. Verified syntax, frontend build,
  live Dango market/account/order reads, paginated fill backfill smoke, and
  native `/ws` open/close. Remaining blocker for true end-to-end trading is
  browser Tx signing/session credential UX with a real Dango account.

## Parking Lot

- Add CI once the local checks are stable.
- Split oversized backend/admin modules when feature pressure slows work.
- Refresh `production/session-state/active.md` after every major milestone.
