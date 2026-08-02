# TH8-TH9 progression and balance audit

Status: PASS WITH MONITORING  
Date: 2026-08-02  
Deterministic report: `artifacts/pvp-balance/th8-th9-progression-2026-08-02.md`

## Implemented progression

- Live Town Hall cap moves from 7 to 9; TH10 remains blocked.
- TH8 unlocks one Flamethrower, a second Harpoon, a third Cannon, a third
  Mage Tower, a fourth Shark Trap, and a fourth Storage.
- TH9 unlocks exactly two Air Bomb defenses and a fifth Shark Trap.
- Flamethrower is capped at L8/L9 at TH8/TH9. Air Bomb is capped at L9 at TH9.
- Core buildings reach L8/L9. Tombstone reaches L7/L8; Harpoon reaches L8 and
  then holds; Port remains L3.
- Wind Mage unlocks at TH8 and Ice Golem at TH9. Playable troops reach the
  same level as their Town Hall, while Horror remains locked behind TH10.
  Reaching each troop level also requires the Barn at that same level, so the
  TH8 and TH9 troop tiers require Barn Lv8 and Lv9 respectively.
- All troop and defense attack cadences remain constant. Late-tier growth is
  expressed through HP, damage, and modest range increases only.

## Economy checks

| Gate | Upgrade cost (gold/wood/ore) | Legal capacity before upgrade | Result |
|---|---:|---:|---|
| TH7 -> TH8 | 120,000 / 140,000 / 130,000 | 143,000 each | Fits |
| TH8 -> TH9 | 175,000 / 220,000 / 200,000 | 230,000 each | Fits |

TH9 capacity is 275,000 per resource with four L9 Storages. Building costs,
troop costs, production rates, trophy values, and server/client level caps are
mirrored and covered by progression/parity tests.

## Deterministic combat result

The production replay verifier simulated 1,500 same-TH battles over 120 unique
bases, 236 army templates, 240 attack policies, all 100 spawn mechanics, legal
tactics/boosts, and the full TH8-TH9 building inventory.

| Matchup | Battles | Attacker wins | Invalid replays | Avg destruction |
|---|---:|---:|---:|---:|
| TH8 -> TH8 | 825 | 55.4% | 0 | 60.5% |
| TH9 -> TH9 | 675 | 55.1% | 0 | 58.0% |
| Combined | 1,500 | 55.3% | 0 | 59.4% |

No exercised base was unbeaten in the non-adaptive population. Ground damage
families remain viable: pure Knight, Archer, Mage and Pea Shooter cohorts land
near the target band at both tiers. Wind Mage and Ice Golem are support/tank
roles and are not expected to succeed as homogeneous armies.

## Risks to monitor

- Homogeneous multi-NFT Demon King and Fire Dragon lab armies remain high-win
  outliers. The synthetic matrix can duplicate an NFT to fill all 45 slots, so
  this is not automatically representative of ownership-constrained live
  rosters. Monitor real multi-copy NFT lineups before changing the established
  TH1-TH7 NFT contract.
- Random policy exploration is weaker than the controlled composition matrix;
  onboarding should continue to teach role-complete armies rather than imply
  that every arbitrary mix is equally viable.
- The first live TH9 cohort should be checked for clumped-air versus split-air
  outcomes around the two Air Bomb defenses.

## Verification gates

- Client/server combat parity: PASS.
- TH7 regression and TH8-TH9 upgrade/capacity gates: PASS.
- TH9 bot materialization, Flamethrower facing, snapshot v2 and Air Bomb count:
  PASS.
- Raid bot catalog: 900 unique layouts at TH8 and 900 at TH9; PASS.
- Air Bomb and Flamethrower client probes at fixed 10 and 20 FPS: PASS.
- Godot 4.6 headless project scan: PASS.
