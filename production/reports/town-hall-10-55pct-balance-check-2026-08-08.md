# Town Hall 10 — 55% same-TH balance check

Date: 2026-08-08
Branch: `main`
Target: `policy-exploration|TH10` attacker win rate `55% +/- 2%`

## Outcome

PASS. The final authoritative production configuration produced 1,719 attacker
wins across 3,120 valid same-TH policy-exploration battles: **55.10%**.

| Seed | Policy battles | Attacker wins | Win rate | Invalid | Target gate |
| --- | ---: | ---: | ---: | ---: | --- |
| 8102026 | 1,560 | 837 | 53.65% | 0 | PASS |
| 8102027 | 1,560 | 882 | 56.54% | 0 | PASS |
| Combined | 3,120 | 1,719 | 55.10% | 0 | PASS |

Each seed used the same 120 fixed TH10 base layouts and 240 generated attack
policies. The runner executed 3,000 battles per seed: 1,440 controlled pure-unit
battles followed by 1,560 policy-exploration battles. Adaptive/training cohorts
are excluded from the authored 55% gate.

The combined pure-unit matrix was 1,723/2,880 attacker wins (**59.83%**). The
final reports contain no `pure-troop-outlier` or `degenerate-pure-army` issue.

## Production tuning

The TH10 Main Ship now applies its authoritative HP-and-damage multiplier after
the normal troop-level curve:

- base TH10 primary-troop multiplier: `1.394136x`;
- troop-level catch-up multipliers, L1 through L9:
  `3.0, 3.0, 3.0, 2.85, 2.525, 2.325, 2.075, 1.525, 1.0`;
- L5+ role corrections: Demon King `0.82875x`, Fire Dragon `0.55x`, Horror
  `0.70x`, Ice Golem `1.65x`, Mimic `0.975x`, Wind Mage `1.90x`;
- Main Ship levels 1–9 remain at `1.0x` and are unchanged.

Server combat owns the calculation. Godot mirrors the same table and applies
the resolved scalar before troop `_ready()`. Horror descendants inherit their
root troop's scalar, while unrelated summons retain `1.0x`.

## Verification

Final production balance artifacts:

- `.codex-artifacts/th10-production-balanced-final-seed8102026.json`
- `.codex-artifacts/th10-production-balanced-final-seed8102027.json`
- matching Markdown reports with the same filename stem

Checks run after the final tuning:

| Check | Result |
| --- | --- |
| `node --check server/combat_defs.js` | PASS |
| `node --check server/combat_session.js` | PASS |
| `node --check tools/pvp-balance/run.js` | PASS |
| `node server/test-client-server-combat-parity.js` | PASS; base, level and type multiplier tables match |
| `node server/test-main-ship-tactical-abilities.js` | PASS |
| Godot headless `tools/tests/test_troop_level_power_curve.gd` | PASS |
| TH10 production balance, seed 8102026 | PASS, 53.65%, 0 invalid |
| TH10 production balance, seed 8102027 | PASS, 56.54%, 0 invalid |

Earlier focused regressions in the same work session also passed for the TH10
Town Hall cannon and Hidden Tesla combat state machine.

## Remaining non-blocking observations

- The static stat audit still reports Mage direct DPS per slot at about `3x`
  the roster median. Mage does not produce a pure-army or policy win-rate
  outlier in these final runs, so this was not changed as part of the TH10
  win-rate correction.
- On seed 8102026, generated layout `th10-kill-corridor-057` was unbeaten in 25
  controlled/policy samples. It did not reproduce as a cross-seed critical gate
  and the full policy cohort remained inside the authored band.
