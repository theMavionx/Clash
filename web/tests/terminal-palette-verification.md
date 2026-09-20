# Terminal palette verification — 2026-09-20

Local-only change. No commit, push, production deployment, live order, or production data mutation.

Dark terminal and its portals use the owner's black/neutral palette, green/red trade colors, and retained orange brand accent. Shared game/root and light theme tokens remain unchanged. Art/UX review corrections include passive card surfaces, Funding Refresh styling, and a dark backing for signed percentages on hovered market rows.

## Checks

- `npm run build`: passed (existing large-chunk warnings).
- 33 focused theme, app-theme, scrollbar, terminal layout, and inline TP/SL tests: passed.
- `node tests/terminal-palette-screenshots.mjs`: passed on Edge desktop 1920×1080 and phone viewport 390×844; checked actual scoped colors, market hover background, visible keyboard focus, light isolation, and no page errors.
- 24 PNGs and a browsable `web/artifacts/terminal-palette/index.html` gallery generated. Seven tabs, leverage, market selector, position TP/SL, ticket, and light regression captured on both viewports.
- Additional implementation batch: 56 checks passed. Three Imperial source-string tests already fail at HEAD; a separate native-chart test requires an absent port-5198 fixture. Local mounted real chart/book used here instead.

## Limits

Screenshots use deterministic local market/account data. Orders, history, funding and quests are empty-state coverage, not confirmation of live service behavior. Existing mobile Account horizontal clipping remains outside this color-only change. No live wallet/setup or real exchange transaction was tested.

## Reproduce

From `web`, set `FIXTURE_PORT=5200` and `FIXTURE_HMR_PORT=25200`, then run `node tests/decibel-deposit-preview.mjs --terminal --palette`. In another terminal run `node tests/terminal-palette-screenshots.mjs`.
