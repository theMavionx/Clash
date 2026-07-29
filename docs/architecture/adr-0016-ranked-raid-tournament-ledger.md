# ADR-0016: Tournament-Scoped Ranked Raid Ledger

## Status
Accepted

## Date
2026-07-29

## Context

### Problem Statement
The existing tournament counters are cumulative player metrics. They cannot represent a fair
raid event where every participant receives a fixed number of attacks per UTC day and the
leaderboard score is offense trophies minus trophies lost while defending. Players must also
be able to enter several tournaments at once without sharing attack quotas, shields, defenses,
or scores.

### Constraints
- Existing casual raids and trading tournaments must keep their current behavior.
- Battle outcomes remain server-authoritative and replay-verified.
- Match reservation, result submission, surrender, and retry paths must be idempotent.
- Tournament shields must not alter the player's normal village shield.
- SQLite is the production source of truth.

### Requirements
- Cap ranked attacks independently by tournament, player, and UTC day.
- Cap incoming attacks and apply shields independently by tournament.
- Keep aggregate defender capacity sufficient for every participant to spend the configured
  attack quota; a finite defense cap cannot be lower than the attack cap.
- Track offense and defense trophy deltas with a complete audit trail.
- Support preregistration and multiple simultaneous ranked events.
- Optionally include the verified altar trophy bonus.

## Decision
Store each ranked attack as an append-only ledger row keyed by the existing battle session ID.
Reserve the daily attack slot atomically when matchmaking reserves the defender. Finalize that
same row once after the server validates the submitted battle result. Maintain tournament
shields in a separate tournament/player state table.

The leaderboard's materialized total remains in `tournament_participants.trophies` for
compatibility with existing tournament views. The ranked ledger is the auditable source used
to explain and rebuild that total.

### Architecture Diagram
```text
Attack selector
      |
      | tournament_id
      v
ranked matchmaking transaction
  | reserve battle_session
  | reserve tournament_ranked_raids slot
  v
server-authoritative battle verification
  |
  | idempotent finalize by battle_session_id
  v
tournament_ranked_raids ----> tournament_participants.trophies
              |
              +-------------> tournament_ranked_player_state.shield_until
```

### Key Interfaces
- `GET /api/tournaments/ranked-raids`: ranked event cards and current-player counters.
- `GET /api/find-enemy?tournament_id=:id`: reserve a tournament-scoped opponent and attack slot.
- Existing battle result and surrender routes finalize the reserved ranked ledger row.
- Admin tournament create/update accepts battle mode, attack cap, shield duration, defense cap,
  and altar bonus policy.

## Alternatives Considered

### Alternative 1: Reuse Main Player Trophies
- **Description**: Apply ranked wins and defense losses directly to `players.trophies`.
- **Pros**: Minimal schema work.
- **Cons**: Simultaneous events contaminate one another and normal play changes event scores.
- **Rejection Reason**: It cannot meet tournament isolation.

### Alternative 2: Derive Score from Battle History on Every Read
- **Description**: Scan battle sessions and reclassify them whenever a leaderboard is requested.
- **Pros**: No separate ledger.
- **Cons**: Expensive, ambiguous for old battles, and difficult to make retry-safe.
- **Rejection Reason**: Reservation-time quotas and reliable auditability require explicit state.

## Consequences

### Positive
- Every score change has a battle-session audit record.
- Quotas, defense caps, and shields are independent across simultaneous tournaments.
- Existing casual and trading tournament paths remain unchanged.
- Repeated result submissions cannot double-credit trophies.

### Negative
- A reserved or surrendered attack consumes a daily slot to prevent opponent-shopping abuse.
- Ranked events default to equal attack and defense caps (20/20); `0` keeps defenses unlimited.
- Materialized leaderboard totals require reconciliation support if manually edited.
- Additional indexes and rows are written for ranked raids.

### Risks
- A stale reservation could consume a slot permanently; stale cleanup marks it cancelled or
  expired while keeping the slot consumed by policy.
- Concurrent finalization could race; the transaction and `status = 'reserved'` predicate make
  the transition single-use.
- Admin configuration could create no available defenders; UI exposes shield and defense-cap
  values, and matchmaking returns a specific availability error.

## Performance Implications
- **CPU**: Indexed per-player/day counts are small and bounded.
- **Memory**: No meaningful persistent process memory increase.
- **Load Time**: One lightweight ranked-event request is prefetched when the game session starts.
- **Network**: One additional authenticated request, cached client-side for 30 seconds.

## Migration Plan
Add nullable/defaulted columns to tournaments and battle sessions. Create the ledger and
tournament shield tables with indexes. Existing tournaments default to `casual`; no historical
battle is reclassified.

## Validation Criteria
- Two simultaneous tournaments maintain independent attack counters and scores.
- The configured daily limit cannot be exceeded under concurrent requests.
- Victory, defeat, surrender, and duplicate result submission produce deterministic totals.
- Casual attack behavior is unchanged when no ranked tournament exists.
- Admin and mobile attack-selection flows pass browser smoke tests.

## Related Decisions
- [ADR-0011: Server Bot Bases and Recovery Matchmaking](./adr-0011-server-bot-bases-and-recovery-matchmaking.md)
- [ADR-0015: Server-Authoritative Horror Evolution Splitting](./adr-0015-server-authoritative-horror-evolution-splitting.md)
