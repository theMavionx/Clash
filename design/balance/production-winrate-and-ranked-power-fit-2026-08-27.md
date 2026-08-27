# Production Win-Rate and Ranked Power-Fit Review — 2026-08-27

## Scope

Production outcomes from the previous 30 days were inspected read-only, then the
dominant armies were replayed with the authoritative combat simulator. The
review covers casual raids, ranked tournament raids, ship composition, ranked
opponent selection, and the reported AmaniPremiere trophy display issue.

## Production evidence

- Casual accepted real-player replays: 4,093 matched outcomes from 4,421 replay
  rows.
- Pure Fire Dragon armies: 2,046 wins in 2,070 attacks (98.84%). The four-Fire-
  Dragon form accounted for 2,027 wins in 2,051 attacks (98.83%).
- Representative active-player rates included 98.5%, 98.2%, 96.0%, and 92.9%.
- Ranked authoritative attempts across the inspected tournaments were 62.75%
  attacker wins. One legal mixed army resolved 123 of 124 attacks as wins
  (99.2%); several current tournament armies were still 100% over small samples.
- Local production-replay reconstruction reproduced the dominant Town Hall
  sniping behavior: four Fire Dragons won 5/5, and three other high-performing
  production compositions also won 5/5 against their recorded bases.
- Removing Rally/Town Hall preference did not remove the dominant outcome.
  The root causes were homogeneous stacking and ranked matching that admitted
  only the attacker's Town Hall even when attack power exceeded that tier.

## Decision

1. A troop type may occupy at most 50% of a ship's slots, rounded up. This is a
   composition constraint, not a troop-stat nerf, and preserves counterplay.
2. Fire Dragon is a hero-class NFT troop and is limited to one owned Dragon per
   battle loadout. Ownership is unchanged and no NFT is deleted.
3. Existing ordinary overflow troops are unloaded and refunded at their
   canonical gold cost by versioned ship migration v5. This forced compensation
   bypasses the storage cap so none of the player's prior value is lost. NFT
   overflow is only unloaded and remains owned.
4. The server remains authoritative. The loadout UI mirrors the returned policy
   and disables invalid additions before the request is sent.
5. Ranked players with at least five competitive recent raids and more than 70%
   wins are removed from the easier live exact-TH draw. They receive a tuned
   hard bot closest to the hard power band, moving up one Town Hall only when
   the strongest same-tier hard base is still below the band. Normal and
   recovery players preserve the previous exact-TH behavior.

## Deterministic balance lab

Seed `82726`, production combat simulator, TH4–TH6, 180 bases, 360 attack
policies, 3,600 valid battles:

| Cohort | Before | After |
|---|---:|---:|
| Overall attacker win rate | 68.3% | 49.4% |
| Policy exploration | 55.0% | 50.2% |
| Controlled homogeneous/pure matrix | 92.8% | 47.9% |
| Fire Dragon controlled cohort | — | 59.4% |
| Invalid simulations | 0 | 0 |

After the constraint, TH5 was 51.7% and TH6 was 54.0%. TH4 remained low at
41.8%; that is a pre-existing progression/base-shape issue and was not hidden by
buffing this unrelated change. No degenerate-pure-army finding remained. The
remaining Mage DPS advisory and base-archetype variance should be monitored in
the next broader TH4 progression pass.

## Trophy report diagnosis

AmaniPremiere's three inspected ranked wins were each settled exactly once at
`+30`, with three unique ranked ledger entries and `3/20` daily attempts. Five
inspected casual wins also each added `+40` to main trophies. No missing trophy
write or backfill was found. The selector retained the pre-battle tournament
response for up to 30 seconds, so it appeared unchanged. Battle settlement now
includes ranked tournament context on victory and defeat, and the selector
forces one immediate server refresh for that settled result.

## Verification requirements

- Composition limits must match in server definitions, migration, HTTP load and
  swap routes, Godot bridge state, React loadout controls, and balance tooling.
- Existing migration must be idempotent and must never convert an NFT to gold.
- Ordinary and recovery ranked matchmaking must remain exact-TH.
- A proven high-win attacker must receive the hard power-fit bot cohort and must
  not randomly fall back to an easier live base.
- Production deployment should wait until no pre-release battle session remains
  active, then verify health, release revision, tournament reads, and migration
  telemetry.
