# Raid Trophy Progression

**Date:** 2026-07-29
**Runtime source:** `server/raid_trophy_progression.js`

## Reward curve

| Target Town Hall | Ship capacity | Maximum non-NFT reinforcement | Attack win | Defense loss |
| ---: | ---: | ---: | ---: | ---: |
| 1 | 3 | 300 gold | +6 | -3 |
| 2 | 12 | 1,200 gold | +12 | -6 |
| 3 | 27 | 2,700 gold | +18 | -9 |
| 4 | 36 | 3,600 gold | +22 | -11 |
| 5+ | 45 | 4,500 gold | +30 | -15 |

The reward is based on the defender's Town Hall. This prevents a high-level
army from farming a low Town Hall for the full reward, while a genuine upset
against a stronger base still pays the stronger base's tier.

In casual battles and standard tournament trophy routing, attack defeat and
surrender penalties use the attacker's own tier; a successful defense earns
the defender's win value and a failed defense loses its loss value. Ranked
Raids intentionally score only successful attacks and failed defenses:
failed attacks and successful defenses are worth zero, matching the event's
"offense won minus defenses lost" rules.

## Balance rationale

The calibrated same-TH attacker win rates are approximately 67.0%, 62.1%,
65.7%, 69.5%, and 51.7% for TH1 through TH5. Multiplying those rates by the
reward curve yields expected attack trophies of 4.0, 7.5, 11.8, 15.3, and
15.5 per attempt. Expected value therefore grows with progression instead of
making the high-win-rate early Town Halls the most efficient tournament tier.

At twenty perfect wins the daily offense ceilings are 120, 240, 360, 440,
and 600 trophies. TH5 remains the permanent maximum trophy tier because troop
capacity stops growing after Main Ship level 5; later ship levels add energy
and tactical abilities rather than more troop slots.
