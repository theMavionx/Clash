# Balance Check: Barn-to-troop level gate

## Data Sources Analyzed

- `server/db.js`
- `scripts/building_system.gd`
- `web/src/components/BarnPanel.jsx`
- `design/gdd/economy-balance.md`
- `design/gdd/troop-unlock-progression.md`
- `design/balance/th8-th9-progression-2026-08-02.md`

## Health Summary: HEALTHY

The former progression rule compressed troop levels 5-9 behind Barn level 5.
The authoritative server, Godot guard, and React lock state now use one invariant:
target troop level N requires Barn level N. The separate Town Hall level-N gate is
unchanged.

## Outliers Detected

| Item/Value | Expected Range | Previous | Resolution |
|---|---:|---:|---|
| Troop Lv6 Barn requirement | 6 | 5 | 6 |
| Troop Lv7 Barn requirement | 7 | 5 | 7 |
| Troop Lv8 Barn requirement | 8 | 5 | 8 |
| Troop Lv9 Barn requirement | 9 | 5 | 9 |
| React troop-level read cap | 9 | 7 | 9 |

## Degenerate Strategies Found

- Players could stop Barn progression at Lv5 while buying all later troop power,
  bypassing four intended building upgrade gates.

## Progression Analysis

| Target troop level | Required Barn | Required Town Hall |
|---:|---:|---:|
| 2 | 2 | 2 |
| 3 | 3 | 3 |
| 4 | 4 | 4 |
| 5 | 5 | 5 |
| 6 | 6 | 6 |
| 7 | 7 | 7 |
| 8 | 8 | 8 |
| 9 | 9 | 9 |

## Recommendations

| Priority | Issue | Suggested Fix | Impact |
|---|---|---|---|
| Complete | Compressed Barn gate | Require exact target level on all runtime surfaces | Restores intended progression |
| Monitor | Existing players may already own over-levelled troops | Preserve paid levels; require matching Barn for future upgrades | Avoids destructive migration |

## Values That Need Attention

No combat values changed. Live telemetry should be monitored for the time needed to
upgrade Barn Lv6-Lv9, but no economy retuning is required for this gate correction.

## Verification

- Server upgrade regression: PASS for every target level 2-9, checking both the
  blocked Barn N-1 request and successful Barn N request.
- Godot client gate probe: PASS for levels 1-9.
- TH8-TH9 and troop-unlock regression suites: PASS.
- React production build: PASS.
- Godot 4.6 project scan: PASS; only the existing nested-project and scan-shutdown
  warnings were emitted.
- The broad quick-repo check also surfaced pre-existing failures in player-ship
  migration, Mechanical Dragon expected-vector length, and the old TH6 array
  expectation. None touches the Barn gate changed here; they remain separate
  branch cleanup work.
