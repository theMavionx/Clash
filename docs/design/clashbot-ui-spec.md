# Clash of Perps UI — ClashBot design spec

Source of truth: the ClashBot/Copybot web app (`C:\Users\Admin\Documents\clashbot`, `src/index.css`, `src/SiteNav.tsx`, `src/TradePage.tsx`, `src/CopyTradingPage.tsx`). Every React UI surface in `web/src` must look like ClashBot: same palette, type scale, shapes and component patterns. The Godot 3D game itself and illustrated game art (troop/building icons, gold/wood/ore icons, logos) stay as they are; only the UI chrome around them changes.

## Tokens (already defined in `web/src/components/FuturesTerminal.css` `:root` / `[data-ui-theme='dark']`)
Always use these CSS variables. Never hard-code hex/rgba colors in JSX or CSS except `#ffffff` text on a filled orange/dark button.

| Role | Variable | Dark value |
|---|---|---|
| Page background | `--terminal-canvas` | `#0d0f14` |
| Card / panel | `--terminal-surface` | `#171a22` |
| Raised (dropdown, hover card) | `--terminal-surface-raised` | `#1d212b` |
| Inset / muted / input | `--terminal-surface-muted`, `--terminal-input` | `#12151c` |
| Hover row | `--terminal-hover` | `#20242d` |
| Hairline border | `--terminal-border` | `#2a2f3a` |
| Strong border | `--terminal-border-strong` | `#3a414f` |
| Primary text | `--terminal-text` | `#f4f5f7` |
| Secondary text | `--terminal-text-secondary` | `#c0c6d0` |
| Muted text (labels, captions) | `--terminal-text-muted` | `#a7afbc` |
| Faint text (hints) | `--terminal-text-faint` | `#7e8797` |
| Accent (one per view: primary CTA, active underline, focus) | `--terminal-orange` / `--terminal-brand` | `#f26522` (hover `--terminal-brand-strong` `#dc5418`) |
| Accent text on dark | `--terminal-brand-text` | `#ff9b67` |
| Accent tint | `--terminal-brand-soft` + `--terminal-brand-border` | orange 12% / 42% |
| Long / profit / success | `--terminal-long` (+ `-soft`, `-border`) | `#34d399` |
| Short / loss / error | `--terminal-short` (+ `-soft`, `-border`) | `#f87171` |
| Warning | `--terminal-warning` (+ `-soft`, `-border`) | `#fcd34d` |
| Info | `--terminal-info` (+ `-soft`, `-border`) | `#7dd3fc` |
| Solid dark button | `--terminal-neutral-button` (hover `-hover`) | `#07080b` (hover `#20242d`) |

Rules:
- No blue/navy/slate/purple/teal surface tints, no gradients on panels or buttons, no glow/outer shadows on cards (ClashBot cards are flat: 1px hairline border + `--terminal-shadow-card` at most), no inner bevels, no text-shadow.
- Green and red are only for long/short, PnL, success/error status. Orange only for the main action, active indicator and focus. Everything else is neutral gray.
- Venue/brand colors (DEX logos) only inside their logo images, never as panel backgrounds or borders.

## Typography
- Font: inherited system stack (`ui-sans-serif, system-ui, …`). Never set fontFamily except `inherit` or a monospace stack for addresses/IDs.
- Sentence case everywhere. No `textTransform: 'uppercase'` and no ALL-CAPS strings for titles, buttons or tabs. Exception: tiny metric captions above numbers (ClashBot "TRADERS", "EXCHANGES", "PNL", "FEES"): 10–11px, weight 600, `letterSpacing: '0.06em'`, uppercase, `--terminal-text-faint`.
- Scale: page/hero title 28–40px weight 600–700, letterSpacing -0.02em; panel/section title 16–18px weight 600; body 13–14px weight 500; secondary/caption 12px; labels 11–12px weight 500 muted. Big numbers 20–28px weight 600, tabular-nums.
- Weights: 500 normal UI, 600 emphasis and buttons, 700 only for hero numbers/titles. Never 750/800/900.

## Shapes & spacing
- Cards/panels/modals: `borderRadius: 16`, `border: 1px solid var(--terminal-border)`, `background: var(--terminal-surface)`, padding 16–20.
- Inner tiles (stat tiles, list rows inside a card): radius 12–14, background `--terminal-surface-muted` or transparent with hairline border.
- Buttons, tabs, segmented controls, chips, badges, inputs in toolbars: pill `borderRadius: 999`. Form inputs: radius 12, min-height 40–44, background `--terminal-input`, hairline border.
- Spacing on a 4px grid (8, 12, 16, 20, 24).

## Components
- Buttons: use `uiButton(variant)` from `web/src/styles/theme.js` (pill, 600, no shadow). Primary = orange fill + white text (one per view). Neutral = solid dark `--terminal-neutral-button` + white text (e.g. Connect Wallet, Try again). Secondary = surface + hairline border. Ghost = text only. Hover changes color only, no translate/scale.
- Top navigation / tab bars: one pill container (`--terminal-surface`, hairline border, radius 999, padding 4–5) with text tabs 13–14px weight 500; active tab = `--terminal-text` with a 1px bottom border (desktop) or solid dark pill with white text (segmented/mobile); inactive `--terminal-text-muted`, hover `--terminal-text`.
- Segmented period/filter controls (e.g. 1 Day / 7 Days / 30 Days): pill container on `--terminal-surface-muted`; selected segment solid `--terminal-neutral-button` with white text.
- Stat tiles: small icon in a 28px rounded square (`--terminal-surface-muted`), caption label muted 12px, value 22–28px white weight 600, optional delta badge top-right.
- Badges/chips: pill, 11px weight 600, tinted background (`*-soft`) + matching text color (`--terminal-long` etc.) + `*-border` hairline. Leverage/venue tags: pill on `--terminal-surface-muted`, muted text.
- Progress bars: 6px track `--terminal-surface-muted`, radius 999, fill `--terminal-long` (or neutral gray when done).
- Tables/lists: header row 11px uppercase faint captions; rows 13–14px; row hover `--terminal-hover`; dividers `--terminal-border`.
- Modals: centered card (radius 16) on `--terminal-overlay` scrim; header row with sentence-case 16–18px title and a ghost circular close button.
- Empty/error states: centered, small 32px circular tinted icon, 14px semibold title, 12px muted text, neutral dark pill button.

## Don'ts
- Don't change behavior, data flow, handlers, test ids or copy meaning — this is a visual pass. Renaming ALL-CAPS strings to sentence case is fine.
- Don't restyle illustrated game art or DEX logos.
- Don't add new dependencies or Tailwind.
