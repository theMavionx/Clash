# Bug Report

## Summary

**Title**: Hibachi TP/SL orders fail after batch API schema change  
**ID**: BUG-2026-0828-HIBACHI-TPSL  
**Severity**: S2-Major  
**Priority**: P1-Immediate  
**Status**: Fixed, pending production verification  
**Reported**: 2026-08-28  
**Reporter**: Clash player report

## Classification

- **Category**: Network / Trading UI
- **System**: Hibachi order adapter and TP/SL error presentation
- **Frequency**: Always for attached TP/SL; sometimes for standalone TP/SL depending on price precision
- **Regression**: Yes; Hibachi changed the `/trade/orders` batch request schema

## Environment

- **Build**: `20260828072103-48b83ea9`
- **Platform**: Web client, production futures API
- **Scene/Level**: Hibachi trading panel
- **Game State**: Valid trading-enabled Hibachi API key and open position

## Reproduction Steps

**Preconditions**: Connected Hibachi account with Trading permission.

1. Enable TP/SL while opening an order, or set TP/SL on an existing position.
2. Enter a percentage that produces a price not aligned to the market tick.
3. Submit the order.

**Expected Result**: TP/SL trigger orders are accepted at valid tick-aligned prices.  
**Actual Result**: Attached orders return HTTP 422 because `orders[0].action` is missing; standalone triggers can fail local tick-size validation. A price containing `423` can also be mislabeled as a Perpl access-code error.

## Technical Context

- **Affected files**: `server-futures/hibachi.js`, `web/src/components/FuturesPanel.jsx`
- **Related systems**: Hibachi signing, batch orders, conditional orders, error humanization
- **Root cause**: The current Hibachi batch API requires an `action` discriminator (`place`, `modify`, or `cancel`) on every row. Clash still sent the former row shape. Percentage TP/SL prices were also passed without using Hibachi's tick-rounding rule, and the Perpl classifier matched bare digit substring `423` inside a price.

## Evidence

- Production futures log: `Hibachi /trade/orders 422 ... orders[0]: missing field action`.
- Earlier production futures logs: `79423.87 exceeds tick size 0.1` and equivalent failures.
- Client log ID `1598519` captured the 422 response for Tradooor.
- The official Hibachi SDK defines `CreateOrder.action = "place"` and rounds prices to the nearest contract tick.

## Related Issues

- Hibachi read-only Trading permission diagnostics
- Hibachi Cloudflare rate-limit and proxy-pool handling

## Notes

Batch rows now carry `action: "place"`. Generated trigger prices are rounded with exact decimal arithmetic before signing. Perpl-specific status handling is scoped to Perpl so Hibachi prices cannot trigger that message.
