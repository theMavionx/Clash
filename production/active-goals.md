# Active Goals

This file is the durable list of current goals. Keep it short, current, and specific enough
that a fresh agent can continue the work.

Status legend: `active`, `blocked`, `done`, `paused`.

## G-001 PvP Arena Bots And Matchmaking

- Status: implemented locally; ready for owner-reviewed release
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

- Battle-entry performance checkpoint completed 2026-07-11: Chrome combat warmup
  fell from 10.26 s to 1.75 s, black-only Fire Dragon assets reduced the Web PCK by
  about 3.82 MiB, and the active mixed-unit Chrome test measured 60 FPS idle versus
  40 FPS combat median with no game errors. See
  `production/reports/battle-entry-warmup-performance-2026-07-11.md`.
- Audit the current bot/matchmaking implementation and list what is already working,
  what is missing, and what needs tuning.

## G-002 Full Game Balance Pass

- Status: complete (external funded smoke pending Bulk beta access)
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
- TH1-TH7 troop-progression checkpoint completed on 2026-07-28. Effective troop
  level is capped by Town Hall, and the corrected same-TH/maxed 1,400-battle
  sample records 62.1-69.5% attacker wins at TH1-TH4 and 49.5-53.7% at
  TH5-TH7 with zero invalid replays. See
  `production/reports/troop-town-hall-level-balance-check-2026-07-28.md`.
- TH1-TH7 adversarial balance-lab checkpoint completed on 2026-07-29. The
  production replay simulator now covers 300 organized defensive layouts, 500
  population attack policies, 100 spawn mechanics, pure-unit stress cohorts,
  and a separate 1,500-policy counter catalog.
- TH5-TH7 offense checkpoint completed on 2026-07-29. Two independent
  holdouts produce combined same-TH population win rates of 54.60% at TH5,
  55.59% at TH6, and 55.39% at TH7. All 600 generated bases have a valid legal
  counter, with zero final unbeaten, untested, invalid-only, or invalid cases.
  The strict runner rejects any TH5+ tier outside 53-57% or any incomplete
  breakability result. See
  `production/reports/th5-th7-55pct-breakability-balance-check-2026-07-29.md`.
- TH5-TH7 real-combat/FPS checkpoint completed locally on 2026-08-01. The production Digger
  layout measures 53.9% attacker wins over 800 replays; selected ranked cohorts measure
  TH5 55.1%, TH6 53.7%, and TH7 56.6%, with 56.3% combined over 1,800 battles. Sixteen real
  `TestMain` scenarios have identical core results at 10/20/60 FPS. The owner authorized this
  checkpoint for the 2026-08-01 production release. See
  `production/reports/th5-th7-real-combat-fps-balance-2026-08-01.md`.
- All-unit role checkpoint completed on 2026-07-29. Two strict actual-code
  holdouts produce pooled policy win rates of 55.24% at TH5, 55.87% at TH6,
  and 56.25% at TH7. Equal-slot probes cover all 12 active/currently authored
  roles, NFT rarity lifts stay at 0.83-1.33 percentage points, and exhaustive
  counter-search leaves 0/600 unbeaten bases with zero invalid replays. See
  `production/reports/all-unit-role-utility-balance-check-2026-07-29.md`.
- Owner-approved Harpoon progression checkpoint completed on 2026-07-31: keep
  exactly one Harpoon at TH6 and TH7, reserve the second-building unlock for
  TH8, and remove the non-functional authored sight assembly from the runtime
  model. Client/server placement, Godot animation, TestMain and performance
  regressions pass. TH8 combat balance remains a launch gate because the
  playable Town Hall progression currently ends at TH7.
- Harpoon full-level progression rebalance completed on 2026-07-31: the
  temporary L1/L2 cap is now a complete L1-L8 curve with Town Hall caps TH6=L6,
  TH7=L7, and future TH8=L8. Playable endpoint strength is preserved, authored
  prices are monotonic and storage-safe, bot caps and trophy weights are synced,
  and client/server combat parity passes. The same-seed 1,200-battle holdout
  moved attacker win rate only +0.42 percentage points to 53.00% with zero
  invalid battles. Two-L8-Harpoon TH8 balance remains a launch gate. The focused
  Godot progression/combat/animation/performance probes pass; full TestMain did
  not enter its scene harness after startup warmup in a 10-minute headless run.
- Harpoon facing follow-up completed on 2026-07-31: spawn yaw now resolves the
  actual `AttackSystem/shipPlane` troop deployment zone and survives the
  zero-scale construction tween. Once a real air target owns yaw, target loss,
  retract, reload, ready, and upgrade paths retain the last combat heading;
  targetless simulation no longer rotates the upper assembly back home.
- Remaining follow-up: decide whether economy max-out should target roughly 4, 8,
  or 12+ weeks; current live server pacing is about 102 days to full TH4 max before
  raid income.
- TH8-TH9 progression checkpoint completed locally on 2026-08-02. Client/server
  cap, storage-safe economy, building/trap counts, Flamethrower/Air Bomb gates,
  troop L8/L9 power, max-village support and 900-layout bot cohorts are mirrored.
  The final 1,500-battle same-TH matrix produced TH8 55.4%, TH9 55.1%, 55.3%
  combined and zero invalid replays; see
  `design/balance/th8-th9-progression-2026-08-02.md`.

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
- TH5 unlocks exactly one Mortar and allows it to reach L5; TH6 adds the second
  Mortar and raises the cap to L6; TH7 raises both to L7.
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

Owner-approved progression follow-up (2026-07-31):

- The later progression pass is now approved: Mortar caps at L5/L6/L7 for
  TH5/TH6/TH7 respectively, matching the Town Hall tier instead of lagging at
  L1/L2/L3.
- The seven-level server/client stat curve, authored upgrade costs, bot-base
  caps, UI stat presentation, and local verification supersede the older L1-L3
  checkpoint above.

## G-007 Town Hall 9 Air Bomb Defense

- Status: active
- Priority: P0
- Owner intent: add two Town Hall 9 anti-air defenses from the supplied
  `AirBombBase.rar`. Each shot is one rigid payload made from both balloons, the
  suspension rig, and one barrel bomb; the full payload rises vertically, homes
  toward an air troop, resolves air-only splash damage, and then reloads.

Scope:

- Import and audit the model and PBR textures under a dedicated `Model/air_bomb/`
  folder.
- Apply the base owner's resolved flag texture to both balloon meshes through the
  same cache/fallback path as the Town Hall flag and main ship sails.
- Add mirrored Godot/server building definitions, TH9 count and level gates,
  placement/upgrades, save/load, enemy snapshots, bot layouts, UI and exports.
- Implement deterministic fixed-tick homing, air-only radial damage, reload,
  Freeze/destruction behavior, replay telemetry and client/server parity.
- Verify the complete launch/flight/impact/reload sequence frame-by-frame and at
  10, 20, 30, 60 and 120 render FPS, then run asset and balance audits.

Current checkpoint:

- Local implementation and verification are complete on `codex/building-assets`:
  client/server fixed-tick flight, full-payload visuals, shared owner flag,
  air-only splash, Freeze/owner-destruction behavior, TH9 limit of two, UI,
  Godot import/export, frame captures, render-FPS parity, focused regressions,
  and the live TH5-TH7 balance regression suite complete without invalid
  simulations.
- The TH8/TH9 implementation gate is cleared locally: TH9 exposes exactly two
  Air Bombs, legal economy, L9 troops, valid snapshot-v2 bot battles, and a
  55.1% same-tier attacker win rate with zero invalid replays.
- Owner authorized committing and pushing all current workspace changes on
  2026-08-02. Production deployment and production database mutation remain
  outside this request.

## G-008 Bulk Trade Integration

- Status: active
- Priority: P0
- Owner intent: add Bulk Trade as a complete self-custody Solana futures venue
  before its closed beta opens, including Clash builder attribution and the
  `clashofperps` referral deposit route.

Scope:

- Bulk v0.1.2 public market/account reads, order book and candles.
- Browser Ed25519 signing for market, limit, cancel, leverage, TP/SL and builder
  approval actions; no player private keys on Clash servers.
- Builder recipient `Drvzmh5iRfHRuKHgmm6Q77CqxhqvsXaLvrKkfMP8qci9` on every
  eligible order, with server-side signature and payload verification.
- Verified fill import for gold, quests and tournament volume, scoped by account
  and order id so counterparties cannot collide.
- Bulk referral/deposit link, official branding, DEX picker and earnings snapshot.

Current checkpoint:

- Official v0.1.2 Rust/Python SDK and live mainnet read endpoints were audited.
  The exact Bulk binary wire format, browser Ed25519 signing, builder approval,
  per-order builder tuple, proof-gated fills, rewards/tournaments, earnings,
  referral flow, DEX selection and trading UI are implemented locally.
- Deterministic wire, adapter, signed-order/fill-attribution, earnings, schema and
  tournament regression suites pass; the production web bundle builds and the
  Bulk registration/login flow was visually verified in a local browser.
- Live public market/ticker/candle reads work. A real funded account/order could
  not be exercised while Bulk remains closed beta, and no production mutation,
  commit, push or deployment is authorized by this goal.
- 2026-08-04 continuation audit found and fixed two launch blockers that the
  deterministic write tests did not cover: the live L2 snapshot requires
  lowercase `l2book` and returns `[bids, asks]` under `levels`, while the
  official HTTP write response stores statuses under `response.data.statuses`.
  Both live and named beta order-book shapes are normalized, prefixed rejection
  statuses cannot be mistaken for submitted orders, and market minimum notional
  is enforced before wallet signing.
- Live read-only verification now returns markets, prices, candles and populated
  bid/ask levels. Focused Bulk tests, proof/fill attribution regressions, ESLint,
  server syntax checks and the production web build pass. The only remaining
  launch check is one funded order/cancel against Bulk after beta access opens;
  it is an external smoke test rather than unfinished integration code.

## G-006 Dango Realtime Exchange Integration

- Status: retired
- Priority: none
- Retirement note: Dango ceased operation. The selectable exchange, network
  adapter, realtime worker, trading routes, reward import, and admin creation
  paths were removed on 2026-07-30. Historical DB values remain supported for
  audit and old tournament records.
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

## G-010 clashSOL Sanctum LST Integration

- Status: v1.1.4 official-Sanctum handoff and Daily Gold release candidate in progress
- Priority: P1
- Owner intent: let players stake SOL into a branded `clashSOL` LST from the
  in-game shop through Sanctum while preserving self-custody.
- Core constraint: Sanctum's current API does not launch new LSTs. Sanctum
  manually deploys the pool after branding, revenue-wallet and mint handoff;
  the API can only read and transact against an already deployed LST.

Scope:

- Document and prepare the external `clashSOL` launch package and configuration.
- Keep the Sanctum API key server-side.
- Add metadata/status, exact-in SOL-to-clashSOL order and signed-transaction
  execution endpoints restricted to the configured mint.
- Persist short-lived order intents so the public client cannot use Clash as an
  arbitrary Sanctum proxy or alter the upstream order before signing.
- Add a polished shop entry and external/Privy Solana wallet signing flow.
- Move clashSOL into the real Battle Shop, support SOL↔clashSOL swaps, and add
  server-verified completed-day holder Gold with admin-configurable rates,
  minimum-balance observations, capacity-safe partial claims, history, and
  operational metrics.
- Show an explicit launch-pending state until `SANCTUM_API_KEY` and
  `CLASHSOL_MINT` are configured and the mint is discoverable through Sanctum.

Current checkpoint:

- Official API and launch documentation audited. Permissionless LST creation
  is not available, so the external launch package is documented separately.
- Local implementation is complete: server-only API-key service, fixed
  wrapped-SOL-to-clashSOL orders, durable intent ledger, exact message and
  Ed25519 signature verification, replay protection, shop card/modal, and
  external/Privy wallet signing paths.
- Focused server, migration, quota, reward, Battle Shop and admin tests pass.
  Desktop/mobile light/dark layouts, the live public mint/status, full web
  build, lint and canonical Deploy gate were verified on the release candidate.
- Sanctum API access was received and verified against the production `/lsts`
  endpoint on 2026-08-10. The key is configured outside Git. The agreed epoch
  fee split is 5% to Clash and 5% to Sanctum.
- Sanctum launched clashSOL on 2026-08-18. The official API now resolves the
  9-decimal SanctumSpl mint `CLAShCrEjid112Mr1tWk7VqaGUAAKbiKdikDQYyDwfes`.
  The Battle Shop/reward/admin integration is release-approved. Rewards use
  30-minute observations, mature after the UTC day, and preserve any amount
  that does not fit Gold storage. Abuse controls cover quote/balance quotas,
  active-intent caps and retention cleanup. Remaining work is the authorized
  production rollout and an optional separately approved owner-signed funded
  mainnet swap smoke; the API key remains outside Git.
- The first owner-signed production attempt on wallet
  `4Ze3bbJbmBjAUutV3LT1XUmqZG67fAR5PUr7vkXUgU2g` was rejected before broadcast
  because the wallet refreshed its recent blockhash and standard priority-fee
  settings. v1.1.3 preserves signer keys, account roles, lookup tables and all
  non-Compute instructions while allowing only a bounded Compute Budget
  limit/price (maximum calculated priority fee 0.005 SOL). It also retains the
  durable submitted/unknown/confirmed reconciliation and bridge-style
  four-stage receipt, and prevents Marketplace overflow from collapsing the
  Battle Shop navigation.
- On 2026-08-19 the owner chose to pause the embedded player-side swap despite
  the validated wallet-compatibility work. v1.1.4 routes new staking through
  the official preselected `https://app.sanctum.so/stake/clashSOL` page,
  disables embedded balance/order/restore/polling work, and keeps Clash-owned
  Daily Gold, wallet linking, capacity-safe claims, APY/status and history in
  Battle Shop. Direct clashSOL APY remains pending its first valid epoch; the
  UI may show a clearly labelled, non-guaranteed same-validator peer median.

Acceptance criteria:

- API credentials never enter the browser bundle or logs.
- The server only constructs orders between wrapped SOL and the configured
  `clashSOL` mint and verifies the wallet-signed transaction message against
  the stored upstream order before execution.
- Missing launch configuration produces a stable, informative shop state and
  never a fake success.
- The official Sanctum staking handoff and Clash holder-wallet linking paths
  are supported; the dormant embedded wallet-signing path is not player-visible.
- Server tests, frontend tests/build/lint and a local browser shop flow pass.

## Parking Lot

- Add CI once the local checks are stable.
- Split oversized backend/admin modules when feature pressure slows work.
- Refresh `production/session-state/active.md` after every major milestone.
