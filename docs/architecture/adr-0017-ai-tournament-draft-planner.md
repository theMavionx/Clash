# ADR-0017: Guarded AI tournament draft planner

## Status
Accepted

## Date
2026-07-29

## Context

Tournament administrators currently configure schedules, eligibility, scoring,
daily rewards, and final rewards across several wizard steps. Long or
day-specific events are repetitive to enter and easy to configure
inconsistently. The project already has a server-side OpenRouter connection,
but an AI model must not receive an admin key, write to the database, activate
an event, or trigger a payout.

Daily rewards also need a stable representation for one reward plan and volume
target per UTC day without another database migration.

## Decision

Add an authenticated, server-side AI planning endpoint that accepts a natural
language request plus the current wizard draft. The model receives a fixed
system prompt describing supported fields and returns strict JSON. The server
then strips unknown fields, clamps values, validates enums and dates, and
returns a draft preview.

The endpoint never calls tournament create/update, activation, synchronization,
or payout functions. The browser applies the returned draft only to local
wizard state. The administrator must review the normal wizard and save through
the existing validated tournament endpoints.

Daily plans extend `reward_config.daily_pools` with:

- `day_utc`: an optional `YYYY-MM-DD` reward day. Empty means every day.
- `volume_target_usd`: the configured daily volume target.
- `volume_target_scope`: `player` or `tournament`.

Because `reward_config` is already stored as JSON, this extension is backward
compatible and requires no schema migration. Existing undated daily pools
continue to apply every day.

OpenRouter model selection uses a configured tournament-specific model chain,
then the shared fallback chain. Secrets remain server-only.

## Alternatives Considered

### Let AI call the existing create endpoint
- **Pros**: one-click creation.
- **Cons**: model mistakes immediately become production state.
- **Rejection Reason**: event activation and rewards require human review.

### Store daily plans in a new relational table
- **Pros**: stronger querying and foreign-key constraints.
- **Cons**: migration and dual-write complexity for data already represented
  by the reward schedule.
- **Rejection Reason**: the current requirement is configuration and display,
  and the JSON contract is already the canonical reward schedule.

### Run OpenRouter directly from the browser
- **Pros**: simpler server route.
- **Cons**: exposes the API key and bypasses server normalization.
- **Rejection Reason**: secrets and validation must stay server-side.

## Consequences

### Positive
- Multi-day events can be drafted from one plain-language request.
- Every generated field still passes deterministic server normalization.
- Existing tournaments and reward schedules remain compatible.
- Model or provider failures can fall back without exposing secrets.

### Negative
- AI output can still need human correction.
- OpenRouter availability and latency affect draft generation.
- Daily volume targets are configuration metadata; payout execution remains a
  separate operational workflow.

## Security
- Endpoint requires the existing admin authentication middleware.
- Prompt length and returned array sizes are bounded.
- Unknown fields are removed before returning the draft.
- The model receives no API keys, wallets, database rows, or executable tools.
- Generated drafts cannot save, activate, delete, synchronize, or pay.

## Validation Criteria
- A mocked first-model failure falls back to the next model.
- Invalid fields, enums, dates, and excessive values are rejected or clamped.
- A daily plan survives admin create/read normalization unchanged.
- The admin wizard can generate, review, edit, and save the draft.
- The player panel shows only the current dated daily reward plus undated pools.
