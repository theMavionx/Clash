# Active Goals

This file is the durable list of current goals. Keep it short, current, and specific enough
that a fresh agent can continue the work.

Status legend: `active`, `blocked`, `done`, `paused`.

## G-001 Backend Battle Telemetry

- Status: done
- Priority: P0
- Owner intent: add backend battle telemetry for Clash of Perps so combat outcomes,
  balance, rewards, and replay validity can be audited from server data instead of
  only client-side observation.
- Core idea: every meaningful battle should leave a server-side telemetry trail that
  explains who fought, what was deployed, what happened, what the final result was,
  and whether the result looked valid.
- Important constraint: telemetry must not make client-side battle state authoritative;
  the backend remains the source of truth for stored battle records, rewards, and audit
  data.
- Performance constraint: telemetry must be low-overhead and must not make the game lag.
  Battle flow, rewards, and UI should continue without waiting on telemetry writes; payloads
  must stay bounded, and failed/slow telemetry should be skipped or logged instead of blocking
  the player experience.

Scope:

- Server-side battle/session telemetry model.
- Battle start, troop deployment, damage/result, reward, trophy, and replay validity
  events where practical.
- Persistent SQLite storage or append-only records suitable for admin/debug review.
- Admin or internal API access for recent battle telemetry.
- Performance guardrails for event payload size, write frequency, and failure handling.
- PvP/bot battle metadata: attacker, defender/bot, Town Hall level, matchmaking context,
  troop composition, base summary, result, duration, resources, trophies, and errors.
- Local verification path that proves telemetry is written during an actual local battle
  or focused server simulation.

Key files and docs:

- `server/combat_session.js`
- `server/routes.js`
- `server/db.js`
- `server/combat_defs.js`
- `scripts/attack_system.gd`
- `scripts/bs_battle.gd`
- `web/src/admin/AdminApp.jsx`
- `production/session-state/active.md`

Acceptance criteria:

- Backend stores battle telemetry records with stable IDs and timestamps.
- Telemetry captures battle participants, battle type, troop/building summary, outcome,
  duration, rewards, trophy changes, and validation/replay status.
- Telemetry can be queried locally through an admin/internal flow without touching
  production data.
- Existing battles continue to work if telemetry write fails; failures are logged and
  do not break reward/session completion.
- Telemetry implementation does not add blocking client-side work or unbounded server writes,
  and local verification checks for obvious battle-flow slowdown or repeated telemetry errors.
- Local verification confirms telemetry is created for at least one completed battle.
- Data shape is documented near the implementation or in a short production report.

Implementation notes:

- 2026-06-24: first backend-only slice implemented in `server/db.js` and `server/routes.js`.
  Added durable `battle_telemetry_events` storage, bounded queued writes, and events for
  `battle_started`, `result_submitted`, `verification_done`, `reward_applied`,
  `defeat_recorded`, `surrendered`, and `telemetry_error`.
- Performance guardrails: telemetry payloads are capped at 16 KiB, writes are queued with a
  max queue size of 500 events, and telemetry failures/overflow log warnings without blocking
  battle flow.
- Verification completed so far: syntax/quick repo checks, focused temp-DB write/read test,
  and temp-DB `findEnemy` integration proving `battle_started` telemetry is created.
- 2026-06-24: added read-only admin query access at `/admin/battle-telemetry` and a
  `Battle Telemetry` admin panel with direct `?tab=battle-telemetry` linking.
- Local verification completed: started local server/web playtest, registered local guest
  accounts, prepared an attacker through existing admin/player APIs, bought a ship, loaded
  3 Knights, called `/find-enemy`, then `/battle/surrender`. Confirmed recent telemetry rows
  through the Vite admin API: `battle_started` and `surrendered` in one battle session.
- 2026-06-24: owner manually completed one local battle after a clean local reset. Admin
  telemetry showed one battle session with four expected events: `battle_started`,
  `result_submitted`, `verification_done`, and `defeat_recorded`.
- 2026-06-24: improved the admin Battle Telemetry panel so one row can represent one battle
  session with an event timeline, while raw event rows remain available below for debugging.
- 2026-06-24: verified the local victory/reward path with a controlled local battle session.
  Replay verification returned `ACCEPTED`, the session completed, `reward_applied` telemetry
  was written, attacker trophies increased by +30, and resources changed from `700/1000/1000`
  to `1600/1750/1600` after loot `900/750/600`.
- 2026-06-24: documented the telemetry event contract in
  `production/reports/g001-battle-telemetry-contract-2026-06-24.md`.
- 2026-06-24: focused guardrail test passed on a temporary SQLite DB: oversized payloads
  truncate under 16 KiB, the queue accepts 500 and drops overflow, flush batches cap at 50,
  and an intentional telemetry insert failure does not escape or prevent later telemetry.
- 2026-06-24: optional client/Godot replay telemetry slice implemented with bounded uploads.
  Godot now sends replay diagnostics after replay playback with a 250-event cap; React trims
  replay payloads to 250 events / 128 KiB before posting; the server rate-limits replay
  telemetry to 20 uploads per player per minute, caps summary JSON at 16 KiB and events JSON
  at 128 KiB, and exposes read-only `/admin/replay-telemetry` for the admin panel.
- 2026-06-24: local replay telemetry smoke passed through the running local web/server stack.
  A 300-event upload returned `stored_events: 250`, `dropped_events: 50`, `events_bytes: 30134`,
  and appeared in the admin Battle Telemetry panel under `Client Replay Telemetry` as
  `bounded-replay-smoke`.
- 2026-06-24: live Godot web replay telemetry path verified after a fresh local Godot export.
  A real stored battle replay (`battle_replays.id = 3`) was played through the browser
  `godotBridge` `watch_replay` action. The replay reached the victory overlay and wrote
  `Client Replay Telemetry` row `id = 2` with label `CODEX LIVE REPLAY EXPORT 1782303055987`,
  session `e72c9ef7-cfa7-4d33-8f1b-7d8ca32b4b24`, `events_recorded = 120`,
  `events_dropped = 0`, `summary_bytes = 1622`, and `events_bytes = 42888`.
- Important verification note: GDScript telemetry changes require a local Godot web export
  before browser testing. The first browser replay used the previous export, played the replay,
  but did not emit replay telemetry because the exported Godot build did not yet include the
  new `REPLAY_TELEMETRY_ENABLED` change.
- 2026-06-24: MVP closed after final hardening/status checkpoint. All acceptance criteria
  are covered by local verification: backend events, admin query/UI, failure guardrails,
  completed battle telemetry, victory/reward telemetry, bounded replay telemetry upload, and
  live Godot web replay telemetry.

Final status:

- Complete as MVP. Remaining checkpoints: 0.
- Future optional improvements should be opened as a new goal or follow-up task, for example
  aggregated telemetry dashboards, retention policy controls, or deeper balance analytics.

## Parking Lot

- Add CI once the local checks are stable.
- Split oversized backend/admin modules when feature pressure slows work.
- Refresh `production/session-state/active.md` after every major milestone.
