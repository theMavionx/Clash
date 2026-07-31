# Harpoon Defense Balance Check

> **2026-07-31 progression follow-up:** The original TH6-TH7 combat findings remain valid,
> but the count contract is superseded: one Harpoon remains legal at TH6-TH7 and the second
> is reserved for TH8. See `harpoon-th8-count-and-sight-optimization-2026-07-31.md`.

- **Date:** 2026-07-31
- **Scope:** TH6 L1 and TH7 L2 Harpoon Defense
- **Verdict:** **PASS WITH MONITORING**

## Authored contract

| Level | Town Hall gate | Damage | Range | Pull duration | Reload | HP |
|---|---:|---:|---:|---:|---:|---:|
| 1 | TH6 | 100 | 1.55 | 1.20 s | 7.0 s | 5,200 |
| 2 | TH7 | 140 | 1.70 | 1.40 s | 7.0 s | 7,200 |

The defense targets air troops only, deals its damage once on a successful hook, and pulls the target toward the tower until a 0.60-unit safety ring rather than onto the building. The fixed seven-second cadence is shared by client and server. A recently controlled target has a 90-tick immunity window, preventing multiple Harpoons from permanently locking one troop.

Progression limits are enforced independently on both sides:

- TH6 may build exactly one Harpoon at L1 and cannot upgrade it further.
- TH7 may upgrade the same Harpoon to L2.
- The current game has no Town Hall level above TH7, so L2 is the authored maximum.

## Automated balance evidence

The extended deterministic lab compared the same generated bases and attack seeds with and without Harpoon across 300 base layouts, 1,000 sampled battles, and a 10,000-battle counter matrix.

| Segment | With Harpoon | Baseline without Harpoon | Delta |
|---|---:|---:|---:|
| Overall attacker win rate | 58.0% | 58.5% | -0.5 pp |
| Mixed Fire Dragon counter bases | 65.0% | 65.67% | -0.67 pp |
| Discovery battles | 62.0% | 62.0% | 0.0 pp |
| Pure Fire Dragon sample | 62.0% | 61.33% | +0.67 pp |
| Pure Fire Dragon mechanical matrix | 60.0% | 60.67% | -0.67 pp |

All generated battles were valid. The small direction changes in the Fire Dragon subsets are consistent with seed, composition, and layout noise; the larger counter matrix shows a slight defensive effect rather than a dominant hard counter.

The legacy TH6 diagnostic now also places the Harpoon it reports. Its focused estimate is 14.3 DPS with 11.43% control uptime, which is consistent with a utility defense on a seven-second cadence rather than a primary damage tower.

## Abuse and interaction checks

- Ground troops are ignored and receive neither damage nor displacement.
- A target already inside the 0.60 stop ring is not dragged through the tower.
- Deterministic target reservations and tie-breaking prevent two Harpoons from claiming the same target on the same tick.
- Freeze and building destruction release active control and reservations.
- Ward modifies damage through the existing authoritative modifier path.
- Forged or stale client combat events do not become authoritative server hits.
- Combat telemetry records launch, hit, damage, pull, release, and interruption outcomes.

## Conclusion

The current tuning meets the intended role: it disrupts nearby air formations, applies modest chip damage, and creates positioning value without replacing normal anti-air damage defenses. The data does not justify a numerical change before a real player playtest.

Recommended post-integration telemetry to monitor:

- TH6/TH7 attacker win rate split by air composition;
- average successful hooks and total control time per defense;
- percentage of hooks interrupted by Freeze or building destruction;
- Fire Dragon survival and time-to-core with and without Harpoon;
- stacked-Harpoon control uptime if future Town Hall levels raise the building limit.

Source reports:

- `production/reports/harpoon-balance-extended-2026-07-31.md`
- `production/reports/harpoon-balance-baseline-extended-without-harpoon-2026-07-31.md`
- `production/reports/harpoon-balance-extended-2026-07-31.json`
- `production/reports/harpoon-balance-baseline-extended-without-harpoon-2026-07-31.json`
