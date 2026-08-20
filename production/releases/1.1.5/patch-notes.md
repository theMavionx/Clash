# Patch 1.1.5 — LeverUp Broker Routing
*20 August 2026*

## Highlights

LeverUp V2 trading on Monad now routes Clash attribution across the complete
trade lifecycle without adding an extra fee for players.

## Quality of Life

- LeverUp market and limit opens, closes, partial and batch closes, plus TP/SL
  creation and updates now consistently use the official Clash broker.
- Broker status is verified live before use, reducing the chance of a stale
  setup causing missing attribution.

## Bug Fixes

- Fixed validation of batch TP/SL payloads in LeverUp V2.

## Known Issues

- LeverUp trade volume is not yet eligible for tournament or Daily Gold rewards
  because the public aggregate broker record does not prove individual player
  fills.
