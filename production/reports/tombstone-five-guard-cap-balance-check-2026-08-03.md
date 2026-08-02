# Tombstone five-guard cap balance check — 2026-08-03

## Outcome

Implemented a per-Tombstone maximum of five active skeleton guards across the
Godot client and authoritative server replay. Tombstone level still determines
guard stats, so levels 6-8 keep five bodies and improve only HP and per-hit
damage. Attack cadence, movement speed, and detection radius stay at L5 values.

The late-tier guard values consolidate the prior total combat budget into five
guards. This avoids turning the requested unit-count cap into an unintended
late-game defense nerf and reduces simultaneous guard agents at a fully built
three-Tombstone base:

| Tier | Previous bodies | New bodies | Previous total HP | New total HP | Previous total hit | New total hit |
|---:|---:|---:|---:|---:|---:|---:|
| L6 / TH7 | 6 | 5 | 6,888 | 6,890 | 894 | 895 |
| L7 / TH8 | 7 | 5 | 9,240 | 9,240 | 1,190 | 1,190 |
| L8 / TH9 | 8 | 5 | 12,080 | 12,080 | 1,552 | 1,550 |

At three maxed Tombstones this lowers live defensive guard nodes from 18 to 15
at TH7, 21 to 15 at TH8, and 24 to 15 at TH9. No building rows or production
player data require migration because count is derived when guards spawn.

## Deterministic before/after replay

Both runs used the production `server/combat_session.js`, seed `8035`, 180
unique TH7-TH9 bases, 300 attack policies, same-Town-Hall matchmaking, and
2,250 battles. The input settings were identical; only the Tombstone change
differed.

| Cohort | Before | After | Delta |
|---|---:|---:|---:|
| Overall attacker win rate | 64.4% | 64.9% | +0.5 pp |
| TH7 -> TH7 | 79.3% | 81.0% | +1.7 pp |
| TH8 -> TH8 | 54.7% | 54.3% | -0.4 pp |
| TH9 -> TH9 | 59.0% | 59.3% | +0.3 pp |
| Pure-unit matrix | 70.9% | 71.8% | +0.9 pp |
| Policy exploration | 39.4% | 38.6% | -0.8 pp |
| Invalid battles | 0 | 0 | 0 |

The structural cap is balance-safe for its intended scope: overall movement is
0.5 percentage points and TH8/TH9 remain within 0.4 points of their prior
mixed-population result. TH7 moves 1.7 points because post-L5 detection and
movement progression was intentionally removed, but the Tombstone-wide HP and
damage budget remains unchanged.

The run also confirms pre-existing roster/cohort issues that are not caused by
this cap: controlled pure armies overperform while realistic policy exploration
at TH8/TH9 remains below the 47%-63% target band. Broad troop/defense retuning
should be handled as a separate balance change rather than hidden inside the
Tombstone body-count correction.

The verification gate also found stale descriptive `slotCost` values in the
balance role registry. They were synchronized to the already-authoritative DB,
combat replay, and Godot values (for example Demon King 6 rather than 5). This
does not change production rosters; policy generation already reads live slot
costs from `TROOP_DEFS`, but the registry parity test now protects all roles
against future drift.

Raw reports:

- `artifacts/pvp-balance/tombstone-cap-before-2026-08-03.md`
- `artifacts/pvp-balance/tombstone-cap-after-2026-08-03.md`

## Verification

- Server guard-count replay: PASS for L1-L8 counts `1,2,3,4,5,5,5,5`.
- Godot real spawn/reuse/removal probe: PASS for L8 -> L6 -> L3 transitions;
  every retained guard receives the full Tombstone stat level.
- Client/server combat parity: PASS for all eight guard tiers and cap constant.
- Aggregate late-tier budget invariant: PASS within two HP/damage points.
- Server and Godot late-wave reacquisition regressions: PASS.
- Necromancer parity: PASS; summoned-skeleton stats remain unchanged.
- Balance role registry vs DB/combat slot costs: PASS for all active troops.

## Verdict

**PASS for the Tombstone cap, with broader balance concerns recorded.** The
requested maximum of five is authoritative and consistent, late-tier upgrades
remain meaningful, and the change does not materially shift TH8/TH9 outcomes.
