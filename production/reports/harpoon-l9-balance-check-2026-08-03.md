# Harpoon L9 balance check

**Date:** 2026-08-03

**Scope:** promote Harpoon from a TH9 cap of L8 to a true L9 progression tier

**Verdict:** PASS WITH MONITORING

## Outcome

Harpoon now follows the live late-game progression contract: L6 at TH6, L7 at
TH7, L8 at TH8, and L9 at TH9. The second Harpoon still unlocks at TH8. The
new tier is mirrored by the Godot client, server progression, replay verifier,
competitive bot profiles, trophy scoring, and upgrade tests.

| Stat | L8 | L9 | Change |
|---|---:|---:|---:|
| HP | 12,000 | 13,800 | +15.0% |
| Impact damage | 100 | 112 | +12.0% |
| Range | 2.20 | 2.30 | +4.5% |
| Pull speed | 1.48 | 1.55 | +4.7% |
| Reload | 7.00 s | 7.00 s | unchanged |
| Pull duration cap | 0.80 s | 0.80 s | unchanged |
| Upgrade price | 108k/142k/124k | 135k/185k/160k | fits TH8's 230k cap |

The L9 base DPS is 16.0 before Ward. Maximum current Ward produces 129 impact
damage. Control uptime remains capped at 11.43% because neither the 420-tick
reload nor the 48-tick pull cap scales with level. A full-range L9 catch ends
at approximately 1.06 distance after 48 deterministic pull ticks.

## Balance comparison

The post-change run repeated the exact authoritative late-tier baseline
parameters: seed 8029, 120 unique bases, 240 attack policies, same-Town-Hall
matchmaking, TH8-TH9 profile, and 1,500 replay simulations.

| Cohort | Before | After | Delta |
|---|---:|---:|---:|
| Combined TH8-TH9 attacker wins | 55.3% | 55.1% | -0.2 pp |
| TH8 -> TH8 | 55.4% | 55.4% | 0.0 pp |
| TH9 -> TH9 | 55.1% | 54.8% | -0.3 pp |
| Invalid replays | 0 | 0 | 0 |

This is the expected narrow effect: only TH9 defenders receive L9 Harpoons,
and the overall attacker win rate remains effectively on the 55% target. The
lab's strict exit still reports pre-existing sampled composition extremes
(notably homogeneous NFT armies and policy-exploration Town Hall targeting);
those findings also existed in the baseline and are not caused by L9 Harpoon.

## Verification

- `server/test-harpoon-combat.js`: PASS; L9 impact/Ward, 48-tick pull, and
  full-range final position are authoritative and deterministic.
- `server/test-client-server-combat-parity.js`: PASS; all nine client/server
  rows match and reload remains 420 ticks.
- `server/test-th6-progression.js`, `server/test-th7-progression.js`, and
  `server/test-th8-th9-progression.js`: PASS; TH8 rejects L9, TH9 accepts it,
  both Harpoons upgrade to 13,800 HP, and the price fits legal capacity.
- `server/test-raid-bot-pool.js`: PASS; TH9 bots materialize L9 Harpoons while
  TH8 bots remain at L8.
- Godot `harpoon_client_probe.gd`: PASS; L9 runtime stats and Ward rounding
  match the server.
- Godot `test_th7_progression.gd`: PASS; earlier-tier regression remains
  intact while the shared tables extend through L9.

## Monitoring

Continue observing live TH9 air-army outcomes after enough real attacks are
available. If air defense proves excessive, adjust L9 impact damage first;
do not shorten or level-scale the owner-defined seven-second reload.
