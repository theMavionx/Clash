# Harpoon Survivability Balance Check — 2026-08-01

## Verdict

**PASS.** The Harpoon was a durability outlier against the common same-level Fire Dragon: its
authoritative direct damage destroyed the utility defense in two hits at both live endpoints. The
HP-only adjustment removes that failure case without increasing Harpoon damage or control output.

## Root cause

The balance comparison had not included the troop level power multiplier used by the authoritative
combat simulator. The resulting live direct-hit values were:

| Matchup | Old HP | Fire Dragon damage | Old hits | New HP | New hits |
|---|---:|---:|---:|---:|---:|
| TH6 / L6 | 5,200 | 3,091 | 2 | 7,200 | 3 |
| TH7 / L7 | 7,200 | 4,754 | 2 | 10,000 | 3 |

## Change

Harpoon HP is now `1,800 / 2,400 / 3,200 / 4,300 / 5,600 / 7,200 / 10,000 / 12,000` for L1-L8.
The endpoint increases are 38.5% at L6 and 38.9% at L7. The new values remain below the same-tier
Archer Tower and Turret, so Harpoon is still the less durable specialist defense.

No change was made to damage, range, pull speed, pull duration, reload, target reservation, air-only
targeting, or control immunity. A Fire Dragon still destroys the Harpoon before its seven-second
reload finishes. The same-level Mechanical Dragon takes eight hits at L6 and seven at L7.

## Verification

- Authoritative Harpoon combat regression: PASS, Fire Dragon L6/L7 time-to-kill is exactly 3 hits.
- Ice Golem and Harpoon priority/freeze regression: PASS.
- TH6 and TH7 progression definitions: PASS.
- Client/server combat parity: PASS.
- Godot TH7 progression and complete-village Town Hall gate probes: PASS.
- Quick repository regression suite: PASS.
- Same-TH TH5-TH7 hard-base simulation: 300 matches, 29.3% attacker wins, 0 invalid battles.

## Remaining risk

Rage boosts or multiple attackers can still reduce effective survival time; this is intentional
counterplay. TH8 is represented by the future-safe L8 value but still needs a dedicated economy and
combat validation before TH8 content ships.
