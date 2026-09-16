# ClashBot reference / trading panel UX proposal

Status: owner approved scope, final screenshot-based visual proposal and implementation
on 2026-09-16 («реалізовуй»). Phase 3 implemented and locally verified;
separate phase 4 UX/art review awaits owner approval. Production unchanged.

Exact manual-terminal reference located in registered sibling worktree
`C:/Users/Admin/Documents/clashbot-terminal-ui-production`, commit `07d4863f`:
`src/trading/RhLighterTerminalPage.tsx`, `trading.css`, `rhLighterTerminal.css`,
`TerminalLayout.tsx`, `RhAccountPanel.tsx`, and `orderControls.css`.
Reference is read-only; adapt appearance, not its venue-specific execution models.

## Owner intent

Use `C:/Users/Admin/Documents/clashbot` as the source for trading panel styles,
settings, functions and convenience on desktop and mobile. Retain Clash color.

## Reference inventory and critical boundary

- `src/TradePage.tsx`: bot dashboard visual reference, not a manual exchange terminal.
  Seeded bots/KPIs/risk metrics and local start/stop/delete state are demonstrative.
- `src/CreateBotModal.tsx`: presets, strategy selection, exposure/volume targets,
  schedules and automatic asset selection. These UI options do not establish live
  strategy execution; displayed balances/leverage must not replace real values.
- `src/CopyTradingPage.tsx`, `src/CopyTradingSetupModal.tsx`: backed by separate
  `/copy-api` and `/leaderboard-api` services. Functional migration is additional
  backend/account/permission work, not a CSS copy.
- `src/index.css`, `src/theme.ts`: reference surface/control/responsive treatment.
- Target: `web/src/components/FuturesPanel.jsx`, existing trading subcomponents,
  `FuturesTerminal.css`, `styles/theme.js`, `hooks/useFuturesTheme.js`.

## Proposed structure

Screenshot clarification (2026-09-16): the manual terminal in the supplied second
image is the primary visual reference, not the reference root's bot dashboard.
Desktop uses chart left, orderbook middle, compact order form right. Owner explicitly
confirmed extending the chart downward (like Hibachi), placing positions/history
below it, rather than placing the chart beneath the order form.

Desktop: exchange/account header; market selector, chart and order form; below,
positions/orders/history/funding. Rounded cards, icon-labelled controls, pill
buttons, restrained separators and expandable optional settings. Summarize active
settings beside confirmation. Preserve Basic/Pro and all venue-specific controls.

Mobile: one column, wrapping summaries and full-width primary actions. Bottom
sheets for settings/filters; full-height narrow-screen dialogs with fixed header
and footer and a scrolling body. Position cards show asset/direction/size/PnL first;
secondary metrics expand. Closing positions must remain accessible.

Transfer searchable selectors, sorting, draft/apply/reset filters, progressive
optional-setting groups with counts, step navigation and editable review summaries.
All loading/disabled/empty/error states use real runtime data, never demo values.

## Preserved constraints

- Existing orange tokens: light #f26522 and dark #f47a3c; preserve both themes.
- Existing wallet/signing, credentials, precision, broker/referral and exchange
  execution contracts remain authoritative. No real trades during visual testing.
- Market/limit, TP/SL, leverage/margin, position management, funding and venue
  deposit flows must retain behavior and capability-based visibility.
- Keyboard navigation, labelled fields, focus trap/restore and Escape in dialogs;
  >=44px touch controls, focus visibility, status text beyond color, reduced motion.

## Implementation and verification

- Desktop primary workspace: height max(620px, 100dvh - 180px), chart/book/order
  ticket; activity below, reachable through terminal scrolling. Default book 300px,
  ticket 370px. Ticket resizes 340–400px; book 280–320px.
- Tablet switches chart/book without hiding the order ticket; mobile chart >=360px.
  Fields use decimal keyboard and 16px text, primary targets >=44px.
- Scoped flat neutral palette and preserved orange; canvas resolves scoped colors.
  Explicit trading portal receives the same palette without changing game dialogs.
- Size presets call existing sizing handler. TP/SL scrolls its contents while header
  and Submit/Remove stay visible. Order hooks/signing/precision logic not replaced.
- 33 Node tests pass (reference layout, shared theme, futures theme, LeverUp flow).
  Existing scroll/position-actions checks and 18-venue display metrics pass.
  17 mounted SSR account scenarios pass. Production Vite build passes (large-chunk
  warnings remain). Final `npx eslint . --quiet` exits 0; warnings remain in repo.
- Browser fixture uses actual FuturesPanel, chart, book and position dialogs with
  deterministic local feed adapters, mocked wallet/order hooks and CSP preventing
  external connections. Tested 1920x1080, 1280x720, 1200x900, 1024x768,
  390x844 and 320x740, both themes and compact/fullscreen modes.
- Observed chart height 900px at 1920x1080; activity starts below chart.
  Mobile320 dialog Submit bottom707px inside740px viewport. No horizontal content
  overflow in market strip/ticket/body. Keyboard resize changed chart +10px and
  ticket -10px. Tablet chart/book switch, TP/SL Escape/focus restoration and Close
  dialog verified. Local limit submission retained price80123.4 and margin12.345600.
- No funded trades, live wallet signatures, commits, pushes or deployment.
  Gamepad and real-device wallet flows not verified; venue behavior beyond focused
  regression tests is not claimed fully verified.

Local preview: run `node tests/decibel-deposit-preview.mjs --terminal` from `web`,
then open `http://127.0.0.1:5188/?balance=100&position=1&terminal=1&theme=dark`.
Data is synthetic and clearly marked LOCAL MOCK. This is not production.
