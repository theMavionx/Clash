# G-001 Backend Battle Telemetry Contract

Date: 2026-06-24
Status: MVP complete and locally verified

## Purpose

Backend battle telemetry records server-side evidence for each meaningful battle step so
combat, rewards, trophies, matchmaking, and replay validity can be audited without trusting
client-only observation.

Telemetry is diagnostic. It must not make battle outcomes, rewards, or stored replay results
client-authoritative.

## Storage

Table: `battle_telemetry_events`

| Column | Meaning |
|---|---|
| `id` | Stable ascending local event id. |
| `battle_session_id` | Battle reservation/session id when available. |
| `replay_id` | Stored replay id once a replay exists. |
| `event_type` | Normalized telemetry event name. |
| `attacker_id` | Attacking player id when available. |
| `defender_id` | Defending player or materialized bot id when available. |
| `payload_json` | Bounded JSON payload. |
| `created_at` | SQLite server timestamp. |

Indexes support recent reads, session timelines, replay lookups, event type filters, and
attacker filters.

## Event Types

| Event | When Written | Required Meaning |
|---|---|---|
| `battle_started` | After target reservation in matchmaking or named target flow. | A battle session was created and a defender was reserved. |
| `result_submitted` | At the start of `/attack/result` after session validation. | The client submitted a replay/result for this session. |
| `verification_done` | After server replay verification runs. | The server has a replay status, resolved result, TH HP, destroyed count, warnings, and sim summary. |
| `reward_applied` | After `battleVictory`, replay storage, and casualty application. | Victory rewards/trophies were applied and returned to the attacker. |
| `defeat_recorded` | After `battleDefeat`, replay storage, and casualty application. | Defeat trophy changes and casualties were applied. |
| `surrendered` | After `/battle/surrender`. | A surrender was recorded, including trophy loss/cooldown/idempotency data. |
| `telemetry_error` | Around validation, replay, or reward errors. | The battle path hit an error stage worth auditing. |

## Shared Payload Shape

Battle result events include a replay summary when available:

| Field | Meaning |
|---|---|
| `claimed_result` | Client submitted `victory` or `defeat`. |
| `strict_replay_verification` | Whether strict replay rejection is enabled. |
| `action_count` | Count of non-`battle_start` replay actions. |
| `ship_count` | Count of `place_ship` actions. |
| `rally_count` | Count of `rally_drop` actions. |
| `troop_counts` | Deployed troop counts by normalized troop name. |
| `first_action_t`, `last_action_t`, `action_span_sec` | Replay timing summary. |

`battle_started` also records matchmaking context:

| Field | Meaning |
|---|---|
| `match_type` | `live`, `bot`, or `named`. |
| `target_is_bot`, `target_bot_difficulty` | Bot metadata when applicable. |
| `attacker_th`, `defender_th` | Town Hall levels. |
| `attack_power`, `base_power`, `base_power_ratio` | Matchmaking power snapshot. |
| `attack_ship_count`, `attack_troop_count`, `attack_ship_capacity` | Attacker loadout summary. |
| `selection_reason`, `recovery_level` | Matchmaking tuning context when available. |
| `attack_cost_gold`, `reserved_until` | Cost and reservation expiry. |

`verification_done` records replay validation:

| Field | Meaning |
|---|---|
| `replay_status` | `ACCEPTED`, `REPLAY_WARNING`, `REJECTED`, or `SIM_MISMATCH_ALLOWED`. |
| `replay_reason`, `stored_accept_reason` | Human-readable verification reason. |
| `server_resolved_result`, `verification_resolved_result` | Authoritative result used for reward/defeat flow. |
| `valid`, `warnings` | Verification validity and non-fatal warnings. |
| `town_hall_destroyed`, `town_hall_hp_pct`, `buildings_destroyed` | Battle outcome evidence. |
| `troops_spawned`, `troops_alive`, `guards_alive`, `sim_time_sec` | Server simulation summary. |
| `trace_events`, `trace_dropped` | Debug trace size summary. |

`reward_applied` records reward/trophy outcome:

| Field | Meaning |
|---|---|
| `result` | `victory`. |
| `loot`, `loot_base` | Actual attacker loot and base loot before bonuses. |
| `altar_prosperity_bonus_pct` | Resource bonus percentage. |
| `trophy_base`, `trophy_bonus`, `trophy_delta`, `trophies` | Trophy outcome. |
| `target_is_bot`, `loot_multiplier` | Bot/reward profile metadata. |
| `casualties` | Paid casualties applied to ships. |
| `nft_troop_win_counts` | NFT-backed troop win counters by collection. |

`defeat_recorded` records defeat outcome:

| Field | Meaning |
|---|---|
| `result` | `defeat`. |
| `trophy_delta`, `defender_trophy_delta` | Attacker and defender trophy deltas. |
| `trophies`, `defender_trophies` | Post-result trophy values. |
| `target_is_bot` | Whether the defender is a bot. |
| `casualties` | Paid casualties applied to ships. |

`surrendered` records surrender outcome:

| Field | Meaning |
|---|---|
| `already_surrendered` | Whether this was an idempotent repeat surrender. |
| `trophy_delta`, `trophies` | Surrender trophy result. |
| `cooldown` | Surrender cooldown metadata when available. |

`telemetry_error` records:

| Field | Meaning |
|---|---|
| `stage` | Error stage, for example `session_validation`, `basic_validation`, `replay_verification`, or `reward_apply`. |
| `error` | Sanitized error text. |
| `server_resolved_result` | Included when the error happens after verification. |

## Admin Read Contract

Endpoint: `GET /api/admin/battle-telemetry`

Headers:

- `x-admin-key: local-dev-admin` for local playtest.

Filters:

- `limit` capped at 500.
- `battle_session_id` or `battleSessionId` or `session`.
- `attacker_id` or `attackerId` or `player_id`.
- `defender_id` or `defenderId`.
- `event_type` or `eventType`.

Response:

- `events`: recent telemetry rows with parsed `payload`.
- `summary.returned`: event row count.
- `summary.event_counts`: count by event type.
- `summary.sessions`: unique session count in the response.
- `summary.latest_created_at`: latest event timestamp.
- `filters`: normalized filters used by the query.

The admin UI groups returned events by `battle_session_id` into battle sessions, while keeping
raw rows visible for debugging.

## Client Replay Telemetry

Client replay telemetry is optional diagnostic data sent after Godot replay playback. It is
not used as authoritative combat/reward state.

Upload endpoint: `POST /api/replay-telemetry`

Headers:

- `x-token`: authenticated player token.

Payload:

- `replay`: battle session id, replay label, attacker name, expected result/duration, actual
  replay elapsed time, and wall-clock elapsed time.
- `summary`: aggregate counts and final replay state.
- `events`: capped replay event sample.

Guardrails:

- Godot records/sends at most 250 replay events per replay.
- React trims outgoing replay telemetry to 250 events and a 128 KiB request body target.
- Browser queue before token availability is capped at 5 replay payloads.
- Server accepts at most 20 replay telemetry uploads per player per minute.
- Server stores summary JSON capped at 16 KiB and events JSON capped at 128 KiB.
- Oversized server-side JSON is replaced with a truncated wrapper instead of failing the
  battle flow.

Read endpoint: `GET /api/admin/replay-telemetry`

Filters:

- `limit` capped at 200.
- `battle_session_id` or `battleSessionId` or `session`.
- `player_id` or `playerId`.

The admin Battle Telemetry tab shows these rows in `Client Replay Telemetry`, separate from
server battle sessions and raw battle events.

## Performance And Failure Contract

- Payloads are capped to 16 KiB. Oversized payloads are stored as a truncated wrapper with
  `truncated`, `original_bytes`, `max_payload_bytes`, and `preview`.
- Writes are queued through `recordBattleTelemetry` and flushed later through a bounded batch.
- Queue size is capped at 500 events. Overflow drops new telemetry events and logs a warning.
- Flush batch size is capped at 50 events.
- Telemetry enqueue/insert failures are caught and logged. Battle session validation,
  replay verification, rewards, casualties, and HTTP responses must continue without waiting
  on successful telemetry writes.

## Local Verification

Completed local battle checks:

| Check | Result |
|---|---|
| Manual local defeat battle | One session with `battle_started`, `result_submitted`, `verification_done`, `defeat_recorded`. |
| Controlled local victory battle | One session with `battle_started`, `result_submitted`, `verification_done`, `reward_applied`. |
| Victory reward state | Attacker resources changed from `700/1000/1000` to `1600/1750/1600` after loot `900/750/600`; trophies increased by +30. |
| Replay verification | `ACCEPTED`, Town Hall destroyed, sim time 6.8s. |

Focused guardrail test on a temporary SQLite DB:

| Guardrail | Result |
|---|---|
| Payload cap | 64 KiB source payload stored as 15,955-byte truncated JSON. |
| Queue cap | 500 events accepted, 10 overflow events dropped. |
| Batch cap | First flush persisted 50 events even when requested max was 500. |
| Full drain | Remaining 450 accepted events flushed in bounded batches. |
| Insert failure | Intentional insert failure did not escape `flushBattleTelemetryEvents`; post-failure event persisted successfully. |

Client replay telemetry smoke on the running local stack:

| Check | Result |
|---|---|
| 300-event upload | `POST /api/replay-telemetry` returned `stored_events: 250`, `dropped_events: 50`. |
| Stored size | `summary_bytes: 163`, `events_bytes: 30134`. |
| Admin read path | `GET /api/admin/replay-telemetry?limit=1` through Vite proxy returned the row. |
| Admin UI evidence | Row appears as `bounded-replay-smoke` under `Client Replay Telemetry`. |

Live Godot web replay check:

| Check | Result |
|---|---|
| Fresh Godot export | `tools\codex\playtest-local.cmd -ExportGodot -NoOpen` completed locally. |
| Replay source | Stored battle replay `id = 3`, session `e72c9ef7-cfa7-4d33-8f1b-7d8ca32b4b24`. |
| Browser path | Local Chrome guest loaded Godot, then `godotBridge` sent `watch_replay`. |
| Replay result | Browser reached replay victory overlay for `CODEX LIVE REPLAY EXPORT 1782303055987`. |
| Telemetry row | `Client Replay Telemetry` row `id = 2` was stored. |
| Event counts | `events_recorded = 120`, `events_dropped = 0`. |
| Stored size | `summary_bytes = 1622`, `events_bytes = 42888`. |

Important note: the first browser replay after code changes used the previous Godot export and
did not emit replay telemetry. Re-exporting Godot locally picked up the GDScript change and the
same replay path emitted telemetry correctly.

Verification commands used:

```powershell
node --check server/db.js
node --check server/routes.js
npm.cmd --prefix web run build
tools\codex\check-repo.cmd -Mode Quick
tools\codex\playtest-local.cmd -ExportGodot -NoOpen
git diff --check
```

Additional checks were run through local server/web on `127.0.0.1` only.

## Final MVP Status

G-001 is complete as an MVP.

Completed checkpoint count: 5/5.

Remaining checkpoints: 0.

Verified coverage:

- Server battle telemetry storage and safe queued writes.
- Matchmaking, result submission, verification, reward, defeat, surrender, and telemetry error
  events.
- Admin API and Battle Telemetry UI for session timelines and raw events.
- Bounded client/Godot replay telemetry ingestion.
- Telemetry failure and payload guardrails.
- Manual local defeat battle.
- Controlled local victory/reward battle.
- Live Godot web replay telemetry after fresh local export.

Future improvements should be opened as separate follow-up work, not as blockers for this MVP.
