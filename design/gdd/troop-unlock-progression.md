# Troop Unlock Progression

## Purpose

The regular troop roster must arrive gradually instead of presenting every
advanced unit at Town Hall 6. `min_town_hall_level` in the client and server
troop definitions is the runtime source of truth for recruitment, ship loading,
upgrade availability, and UI lock state.

## Canonical Unlock Schedule

| Town Hall | Newly available regular troops |
| ---: | --- |
| 1 | Knight, Mage, Archer |
| 2 | None |
| 3 | None |
| 4 | Pea Shooter |
| 5 | Mimic |
| 6 | Mechanical Dragon |
| 7 | Necromancer |
| 8 | Wind Mage |
| 9 | Ice Golem |
| 10 | Horror |

Town Hall 8 and 9 gates are playable. Town Hall 10 remains data-ready; the
existing gate contract will expose Horror without another roster rebalance
when TH10 is promoted.

## Design Rationale

- TH6 introduces Mechanical Dragon as a five-slot flying siege unit.
- TH7 adds Necromancer after players have learned heavy-unit composition.
  Its eighteen-slot summon gameplay is a larger complexity step.
- TH8 adds Wind Mage and its corridor positioning plus temporary Windlings.
- TH9 adds Ice Golem as an eleven-slot defensive vanguard and a late-game
  composition anchor.
- TH10 adds Horror, the most expensive and mechanically complex regular unit,
  with a deterministic `1 -> 2 -> 4` evolution family.

No combat statistics, ship-slot costs, recruitment costs, or upgrade curves are
changed by this schedule.

## NFT-backed Troops

Demon King and Fire Dragon do not receive Town Hall gates. They remain governed
by their existing NFT ownership and token-loading validation. Adding a Town
Hall requirement would invalidate previously acquired access, so ownership and
progression remain separate contracts.

## Runtime Contract

- Client: `scripts/building_system.gd` exposes each gate to the game and React
  bridge.
- Server: `server/db.js` validates recruitment, ship loading, swapping, and
  troop upgrades.
- The effective troop level may never exceed the current Town Hall level.
  TH5 therefore exposes at most troop Lv5, TH6 at most Lv6, TH7 at most Lv7,
  TH8 at most Lv8, and TH9 at most Lv9, even when a legacy database row
  contains a higher value.
- Existing over-levelled rows are preserved non-destructively. Combat, API
  responses, matchmaking power, and upgrade status use the effective capped
  level; the stored value becomes effective only after the Town Hall reaches
  it.
- The React roster consumes `min_town_hall_level` dynamically; it must not
  maintain a duplicate hardcoded schedule.
- A locked request returns `TOWN_HALL_LEVEL_REQUIRED` with current and required
  Town Hall levels.
- Every troop upgrade also requires a Barn whose level matches the target troop
  level. Barn Lv5 therefore permits upgrades only through troop Lv5; Lv6-Lv9
  require Barn Lv6-Lv9 respectively. A Barn-locked request returns
  `BARN_LEVEL_REQUIRED` with the current and required Barn levels.

The effective primary-troop HP/damage curve and its validated same-TH win-rate
bands are documented in
`design/balance/troop-town-hall-winrate-rebalance-2026-07-28.md`.
