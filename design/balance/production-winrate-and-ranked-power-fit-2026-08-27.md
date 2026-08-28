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

## Final decision

The initial 50% same-type rule and one-Fire-Dragon limit were rejected by the
owner after review. Player composition remains unrestricted: any number of the
same troop may be loaded when the roots fit the ship's total slot capacity and
the player owns each required NFT. There is no composition policy in the API,
no client-side type blocker, and no v5 migration that unloads existing armies.
Rows touched by the short-lived v5 release are rolled back to v4 on access.
Untouched ordinary roots recorded by that migration are restored; prior gold
compensation is retained, and NFT identities are never guessed or synthesized.

Balance is handled through opponent quality instead of loadout prohibition.
Ranked players with at least five competitive recent raids and more than 70%
   wins are removed from the easier live exact-TH draw. They receive a tuned
   hard bot closest to the hard power band, moving up one Town Hall only when
   the strongest same-tier hard base is still below the band. Normal and
   recovery players preserve the previous exact-TH behavior.

## Deterministic balance lab

Seed `82726`, production combat simulator, TH4–TH6, 180 bases, 360 attack
policies, 3,600 valid battles after restoring unrestricted compositions:

| Cohort | Result |
|---|---:|
| Overall attacker win rate | 68.3% |
| Policy exploration | 55.0% |
| Controlled homogeneous/pure matrix | 92.8% |
| Pure Fire Dragon matrix | 100.0% |
| Invalid simulations | 0 |

This deliberately exposes the homogeneous-army outlier instead of hiding it
behind an availability rule. The general policy cohort is healthy at 55%, but
fixed same-TH bases remain too easy for several maxed pure armies. Adaptive
matchmaking protects competitive standings after the player establishes a
strong recent record; a later defense/progression pass should address the pure
matrix without limiting roster choice or silently weakening owned NFT counts.

## Trophy report diagnosis

AmaniPremiere's three inspected ranked wins were each settled exactly once at
`+30`, with three unique ranked ledger entries and `3/20` daily attempts. Five
inspected casual wins also each added `+40` to main trophies. No missing trophy
write or backfill was found. The selector retained the pre-battle tournament
response for up to 30 seconds, so it appeared unchanged. Battle settlement now
includes ranked tournament context on victory and defeat, and the selector
forces one immediate server refresh for that settled result.

### 2026-08-28 follow-up

A later report with the Day 4 view stuck at 120 had a separate root cause. The
three wins after calendar midnight were correctly finalized at +35 each, but
their ranked activity used the `2026-08-28` UTC calendar key while the active
daily-pool round was still `2026-08-27` until the configured 22:00 UTC cutoff.
The ranked day key is now derived from the tournament cutoff, and historical
ranked rows are reconciled idempotently before affected closed pools are
re-awarded.

## Verification requirements

- Four owned Fire Dragons plus five one-slot troops must be a valid 45-slot
  loadout; nine Mechanical Dragons and 45 one-slot troops must also validate.
- The server response and Godot/React bridge must expose no same-type policy.
- Existing v4 ship rows must not be migrated or unloaded for composition.
- Ordinary and recovery ranked matchmaking must remain exact-TH.
- A proven high-win attacker must receive the hard power-fit bot cohort and must
  not randomly fall back to an easier live base.
- Production deployment should wait until no pre-release battle session remains
  active, then verify health, release revision, tournament reads, and migration
  telemetry.
