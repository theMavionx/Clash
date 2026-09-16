# Bug Report

## Summary
**Title**: Trading workspace wheel trapped over ticket/chart
**ID**: BUG-20260916-TERMINAL-WHEEL
**Severity**: S2-Major
**Priority**: P1-Immediate
**Status**: Fixed locally; pending release
**Reported**: 2026-09-16
**Reporter**: Owner

## Classification
- Category: UI; system: trading terminal
- Frequency: always over non-overflowing order ticket
- Regression: exposed by taller workspace with activity below chart

## Environment
Windows, in-app Chromium, local mocked terminal at port 5188; actual React
components and chart, no funded exchange actions. Based on commit 9754becf plus
prepared terminal redesign.

## Reproduction Steps
1. Open `/?balance=100&position=1&terminal=1&theme=dark` on local preview.
2. At top of terminal, wheel down over order ticket at its center.
3. Compare with wheel down over outer scrollbar gutter.

Expected: inner content scrolls if possible, then scroll chains to workspace.
Actual: ticket overscroll containment blocks parent even without inner overflow;
chart captures ordinary wheel for scaling instead of page navigation.

## Technical Context
- FuturesPanel: ticket `overscrollBehaviorY: contain` changed to `auto`.
- TradingViewWidget: ordinary wheel and vertical touch yield to workspace;
  Shift+wheel opts into zoom; drag/pinch retained. Modifier described in tooltip.
- Ticket numeric-input wheel blurs focused field, retaining amount and native scroll.
- Nested modal containment remains intentional, preventing background movement.

## Evidence / Verification
- Before: ticket wheel leaves workspace scrollTop=0, ticket scrollTop=0.
- After: real wheel over ticket, chart, book moves workspace 0→248.8px.
- Focused amount 12.34 remains exactly `12.34` after real wheel and parent scroll.
- Six layout/wheel regression tests and targeted ESLint passed.
- Browser preview remains open with updated implementation.
- No test orders, production data edits, or account interaction for this test.

## Related Issues
[Terminal UX report](trading-panel-clashbot-ux-2026-09-16.md)
