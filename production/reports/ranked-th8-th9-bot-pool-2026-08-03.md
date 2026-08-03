# Ranked TH8/TH9 bot pool audit — 2026-08-03

## Data sources analyzed

- Production `players`, `buildings`, `tournaments` and
  `tournament_ranked_raids` rows, read-only before the change.
- `server/matchmaking_defs.js` authored 900-layout TH8 and TH9 catalogs.
- `server/db.js` exact-Town-Hall ranked candidate filtering and materialization.
- Production replay simulator cohorts generated from the current hard catalogs.

## Health summary: CONCERNS RESOLVED FOR AVAILABILITY

Clashbot is Town Hall 9 and had faced exactly one ranked TH9 bot in active
tournament 24 on 2026-08-03. The database contained four already materialized
TH9 bots, but materialized rows are not the candidate inventory. The real source
was the virtual hard template pool.

The ranked configuration admitted only `corner-keep`: 23 eligible hard layouts
at TH8 and one at TH9. The daily no-repeat rule correctly excluded that one TH9
ID after the first attack, producing the reported empty-pool error even though
720 hard templates per tier were already authored.

## Outliers detected

| Item | Expected | Before | After |
|---|---:|---:|---:|
| TH8 ranked hard candidates | at least 100 | 23 | 720 |
| TH9 ranked hard candidates | at least 100 | 1 | 720 |
| Exact Town Hall | required | exact | exact |
| Same defender per attacker/day | no repeats | blocked | blocked |
| Normal/easy templates in ranked | none | none | none |

## Balance analysis

| Cohort | Bases | Battles | Attacker wins | Invalid | Assessment |
|---|---:|---:|---:|---:|---|
| TH8 complete hard catalog | 720 | 2,400 | 43.2% | 0 | Intentionally hard; monitor live results |
| TH9 complete hard catalog | 720 | 2,400 | 57.0% | 0 | Target band |

A hand-picked TH8 subset was rejected after focused simulation produced only
31.7% attacker wins. Exposing the complete authored hard catalog gives greater
geometric variety and the strongest measured TH8 result available without
admitting normal/easy bases or changing combat stats.

## Safeguards

- Candidate identity remains the immutable template ID.
- `tournament_ranked_raids` excludes every defender already faced by that
  attacker during the current UTC day.
- Active battle reservations exclude concurrently reserved defenders.
- Ranked matching remains exact-TH and may ignore shields only for ranked play.
- A selected virtual bot is materialized transactionally; unused templates do
  not occupy production database rows.
- Persistent `bot-ranked-*` rows remain excluded from disposable bot cleanup.
- Automated tests require 720 hard layouts and all 18 high-tier archetypes at
  both TH8 and TH9, then create several non-repeating exact-TH matches.

## Remaining monitoring

TH8's hard-only cohort is below the global 55–60% attacker target. This release
does not weaken defenses or silently add easy bases because the owner requested
hard ranked opponents. Production TH8 win rate should be reviewed after enough
new matches accumulate.
