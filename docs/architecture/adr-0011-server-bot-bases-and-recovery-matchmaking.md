# ADR-0011: Server Bot Bases And Recovery Matchmaking

## Status
Accepted

## Date
2026-06-12

## Context

### Problem Statement
Raid matchmaking needs to keep the global raid success rate near 55-60% while
the current player distribution is heavily concentrated at TH1 and sparse at
higher Town Hall levels. TH3 and TH4 players have too few live targets, and
players with repeated losses need a fair recovery path that does not alter
combat after a battle starts.

### Constraints
- Combat must remain server-authoritative and replay-verified.
- Do not modify troop, defense, or projectile behavior to force outcomes.
- Reuse the existing Godot enemy payload shape: `players`, `buildings`,
  resources, `battle_sessions`, and replay submission.
- Preserve tournament attack policies for live targets.
- Prevent intentional quick-loss farming from triggering recovery rewards.

### Requirements
- Add bot bases that can be returned by `/find-enemy`.
- Track issued targets, power ratios, recovery state, and final raid result.
- Compute `attack_power` from loaded ships and troop levels.
- Compute `base_power` from buildings, defense stats, Town Hall level, and
  tombstone guard threat.
- Bias matchmaking toward easier bot bases only through target selection.
- Keep recovery bot rewards lower than normal live-player rewards.
- Expose stats that show whether raids are inside the 55-60% target band.

## Decision

Represent bot bases as deterministic templates in code, then materialize only
the selected template as a temporary `players` row marked with `is_bot = 1` at
the moment `/find-enemy` reserves a battle. The materialized target is backed by
real `buildings` rows so the existing client payload, server verifier, loot, and
battle-session paths stay unchanged. Random matchmaking combines live-player
candidates with virtual bot-template candidates when the live pool is thin, when
the player is struggling, or when higher Town Hall levels lack enough live
targets. The battle itself remains unchanged; only the selected defender changes.

The matchmaker writes one `raid_matchmaking` row per `/find-enemy` session. The
row records power values, target type, recovery level, candidate counts, and the
final result written from `storeReplay`. Surrenders and very short/no-ship
losses are stored as non-recovery results so they do not count toward loss
streak recovery.

### Architecture Diagram

```text
Player taps Find Enemy
  -> validate ships and troops
  -> compute attack_power
  -> read recent raid results
  -> score live candidates
  -> optionally score virtual bot templates
  -> materialize selected bot template if needed
  -> reserve selected defender in battle_sessions
  -> insert raid_matchmaking analytics row
  -> Godot loads normal enemy payload

Battle result submitted
  -> server replay verifier resolves victory/defeat
  -> existing loot/trophy paths run
  -> bot/recovery reward multipliers apply when target_is_bot
  -> storeReplay completes raid_matchmaking row
```

### Key Interfaces
- `players.is_bot`, `players.bot_difficulty`, `players.bot_variant`,
  `players.bot_generation` for materialized temporary bot targets
- `raid_matchmaking`
- `server/matchmaking_defs.js`
- `db.findEnemy(playerId)`
- `GET /matchmaking/stats`
- `GET /admin/matchmaking/stats?days=7`
- Admin panel `Stats > Matchmaking Health`
- Admin panel `Players > MM 7d`

## Alternatives Considered

### Fully Separate Bot Payloads Outside Players
- **Description**: Generate bot bases directly in `/find-enemy` without ever
  storing them as players or buildings.
- **Pros**: No bot rows in the player table.
- **Cons**: Requires special-case battle sessions, replay verification,
  resources, loot, and building loading.
- **Rejection Reason**: The existing client and server battle flow already
  expects a defender ID backed by server buildings.

### Modify Combat Outcomes For Struggling Players
- **Description**: Change damage, hit chance, HP, or defense behavior during a
  battle after detecting a struggling player.
- **Pros**: Very direct control over win rate.
- **Cons**: Feels unfair if discovered, breaks replay trust, and complicates
  server verification.
- **Rejection Reason**: The design goal is fair target selection, not combat
  manipulation.

### Live-Only Matchmaking
- **Description**: Keep using only real player bases and widen TH/rating ranges.
- **Pros**: No artificial targets.
- **Cons**: Sparse TH2-TH4 pools cause repeated targets, long waits, or unfair
  power mismatches.
- **Rejection Reason**: Current population distribution cannot support stable
  higher-TH matchmaking by live targets alone.

## Consequences

### Positive
- Higher Town Hall players always have valid raid targets.
- Struggling players get a fair recovery path without hidden combat changes.
- Matchmaking can be tuned from measurable `attack_power/base_power` ratios.
- Analytics can report global and per-TH success rate against the 55-60% band.
- The database does not carry 96 always-present bot players; only selected
  temporary targets are created.

### Negative
- Temporary bot rows appear in `players` during/after issued raids and must be
  filtered where human-only lists matter.
- Bot layouts need upkeep as building types or combat balance changes.
- Replay/admin debugging may keep generated bot targets for a short retention
  window before cleanup.

### Risks
- **Bot farming**: mitigated with lower bot loot/trophy multipliers and by not
  counting surrender/abandoned losses toward recovery.
- **Tournament abuse**: mitigated by respecting `enemy_only` tournament match
  policy and by marking bot targets explicitly.
- **Power formula drift**: mitigated by using `combat_defs` values and balance
  reports after tuning changes.
- **Native SQLite local mismatch**: runtime verification depends on a Node
  version matching the installed `better-sqlite3` binary.

## Performance Implications
- **CPU**: Moderate per `/find-enemy`; up to live and bot candidate pools are
  scored, each using cached prepared statements and simple formulas.
- **Memory**: Low; generated bot templates are deterministic JS objects.
- **Load Time**: Bot templates are generated in memory; no startup seeding of 96
  player/building rows is required.
- **Network**: No new client round trips for finding an enemy; stats endpoints
  are optional.

## Migration Plan
1. Add idempotent player columns and `raid_matchmaking`.
2. Generate deterministic bot templates in code.
3. Switch `/find-enemy` to power-based live/virtual-bot scoring.
4. Materialize only the selected bot template as a temporary defender row.
5. Complete matchmaking analytics from battle replay storage.
6. Add stats endpoints for player and admin inspection.
7. Surface global and per-player matchmaking telemetry in the admin panel.
8. Tune ratio bands after enough live raid data exists.

## Validation Criteria
- Server files pass `node --check`.
- Bot templates have no grid overlaps or out-of-bounds placements.
- `combat_balance_report` continues to run.
- `/find-enemy` returns normal enemy payloads with optional `matchmaking`
  metadata.
- Admin panel shows global success rate, bot share, recovery usage, TH slices,
  target mix, and per-player 7d matchmaking rows.
- `raid_matchmaking` reports global success rate near 55-60% after sufficient
  raids.

## Related Decisions
- None yet.
