# Clash of Perps UI — ClashBot design system

Source of truth: the ClashBot / Copybot web app in `C:\Users\Admin\Documents\clashbot`
(`src/index.css`, `src/theme.ts`, `src/SiteNav.tsx`, `src/ThemeToggle.tsx`, `src/StyledSelect.tsx`,
`src/TradePage.tsx`, `src/CopyTradingPage.tsx`, `src/CopyTradingSetupModal.tsx`, `src/CopyBotsView.tsx`,
`src/CreateBotModal.tsx`) built with Tailwind CSS v4.3. All values below are copied from those files or
from the Tailwind v4 theme they compile against. Nothing here is approximated.

Every React UI surface in `web/src` must use this system. The Godot game, illustrated game art (troops,
buildings, resource icons), DEX/venue logos and the battle HUD's per-ability glow feedback are not UI chrome
and keep their own look.

## Where it lives

| What | File |
|---|---|
| Colour role tokens (`--terminal-*`, light on `:root`, dark on `[data-ui-theme='dark']`) | `web/src/components/FuturesTerminal.css` |
| Shape, type, elevation, component-state tokens (`--cb-*`) and shared `.cb-*` component classes, native range / switch / checkbox styling, uiButton hover contract | `web/src/styles/clashbot.css` (imported once in `web/src/main.jsx`) |
| Inline-style helpers: `uiButton`, `uiIconButton`, `uiCloseButton`, `radius`, `shadow`, `uiScrim`, `uiModal`, `uiModalTitle`, `uiInput`, `uiLabel`, `uiCaption`, `uiCard`, `uiTile`, `uiSegmented`, `uiSegment`, `uiBadge`, `uiSwitchTrack`, `uiSwitchKnob`, `rangeProgress` | `web/src/styles/theme.js` |
| Basic-mode wizard aliases | `web/src/components/basic/styles.js` |

Theme switch: `useFuturesTheme` writes `data-ui-theme` (and legacy `data-futures-theme`) on `<html>`.
Dark is the default, as in ClashBot (`index.html` boots `data-theme="dark"`).

## Colour

ClashBot light uses its `:root` hex tokens; dark is `html[data-theme="dark"]` plus the utility remaps in
`index.css` (e.g. `.bg-gray-100` → `#1d212b`). Our roles map 1:1.

| Role | Token | Light | Dark | ClashBot source |
|---|---|---|---|---|
| Page background | `--terminal-canvas` | `#f5f5f5` | `#0d0f14` | `--app-bg` |
| Card / panel (`bg-white`) | `--terminal-surface` | `#ffffff` | `#171a22` | `--app-panel` |
| Raised / soft (`bg-gray-100`) | `--terminal-surface-raised`, `--cb-soft` | `#ffffff` / `#f3f4f6` | `#1d212b` | `--app-panel-raised` |
| Muted / inset / input (`bg-gray-50`) | `--terminal-surface-muted`, `--terminal-input` | `#f3f4f6` / `#f9fafb` | `#12151c` | `--app-panel-muted` |
| Selected (`bg-gray-200`) | `--terminal-selected`, `--cb-switch-off` | `#e5e7eb` | `#292e38` | dark remap |
| Row hover (`bg-gray-800`) | `--terminal-hover` | `#f3f4f6` | `#20242d` | dark remap |
| Hairline border (`border-gray-100/200`) | `--terminal-border` | `#e5e7eb` | `#2a2f3a` | `--app-border` |
| Strong border (`border-gray-300`) | `--terminal-border-strong` | `#d1d5db` | `#3a414f` | `--app-border-strong` |
| Text (`text-gray-900`) | `--terminal-text` | `#111827` | `#f4f5f7` | `--app-text` |
| Control text (`text-gray-700`) | `--terminal-text-control` | `#374151` | `#d7dbe2` | dark remap |
| Secondary (`text-gray-600`) | `--terminal-text-secondary` | `#4b5563` | `#c0c6d0` | dark remap |
| Muted (`text-gray-500`) | `--terminal-text-muted` | `#6b7280` | `#a7afbc` | `--app-text-muted` |
| Faint (`text-gray-400`) | `--terminal-text-faint` | `#9ca3af` | `#7e8797` | `--app-text-subtle` |
| Accent (`bg-[#F26522]`) | `--cb-accent`, `--terminal-orange` | `#f26522` | `#f26522` | `--control-accent` |
| Accent hover (`hover:bg-[#E05A1A]`) | `--cb-accent-hover` | `#e05a1a` | `#e05a1a` | TradePage CTA |
| Accent hover text (`hover:text-[#D95618]`) | `--cb-accent-hover-text` | `#d95618` | `#d95618` | Filters button |
| Accent text | `--terminal-brand-text` | `#c2410c` | `#ff9b67` | `--adaptive-accent-text` / dark `.text-orange-*` |
| Accent tint (`bg-orange-50`) | `--cb-accent-tint` | `#fff7ed` | `rgba(242,101,34,.12)` | dark remap |
| Accent border (`border-orange-200/300`) | `--cb-accent-border(-strong)` | `#fed7aa` / `#fdba74` | `rgba(242,101,34,.42)` | dark remap |
| Neutral solid (`bg-gray-900`) | `--cb-neutral` | `#111827` | `#07080b` | dark remap |
| Neutral hover (`hover:bg-gray-800`) | `--cb-neutral-hover` | `#1f2937` | `#20242d` | dark remap |
| Danger solid (`bg-red-600`, hover `red-700`) | `--cb-danger`, `--cb-danger-hover` | `#dc2626` / `#b91c1c` | same | CopyBotsView confirm |
| Long / success | `--terminal-long` (+`-soft`, `-border`) | `#087a55` | `#34d399` (soft `rgba(16,185,129,.13)`, border `rgba(52,211,153,.32)`) | `.text-emerald-*` remap |
| Short / error | `--terminal-short` (+`-soft`, `-border`) | `#d14343` | `#f87171` (soft `rgba(239,68,68,.13)`, border `rgba(248,113,113,.32)`) | `.text-red-*` remap |
| Warning | `--terminal-warning` (+`-soft`, `-border`) | `#b45309` | `#fcd34d` | `.text-amber-*` remap |
| Info | `--terminal-info` (+`-soft`, `-border`) | `#2563eb` | `#7dd3fc` | `.text-sky-*` remap |
| Tab underline (`border-gray-900`) | `--cb-tab-underline` | `#111827` | `#d5dae2` | dark remap |
| Tooltip surface | `--cb-tooltip` | `rgba(255,255,255,.98)` | `rgba(23,25,31,.97)` | `--adaptive-surface-tooltip` |
| Scrim (`bg-gray-950/35`) | `--cb-scrim` = `--terminal-overlay` | `rgb(3 7 18 / .35)` | same | setup / confirm modals |
| Scrim, destructive (`bg-gray-950/45`) | `--cb-scrim-strong` | `rgb(3 7 18 / .45)` | same | delete confirm |

Rules: orange only for the main action, the selected/checked state, focus and slider fill. Emerald/red only
for long/short, PnL and success/error. Everything else neutral gray. No panel gradients, glows or text-shadow.
Venue colours only inside their logos.

## Typography

- Family: Tailwind `font-sans` = `ui-sans-serif, system-ui, sans-serif, 'Apple Color Emoji', 'Segoe UI Emoji', 'Segoe UI Symbol', 'Noto Color Emoji'` (`--cb-font-sans`, set on `*` in `web/src/index.css`). Mono for addresses: `--cb-font-mono`.
- Weights (ClashBot usage: 507× semibold, 156× medium, 12× bold): **500** body / nav / page titles, **600** labels, buttons, values, card titles. 700 only for the leverage tag and logo mark. Never 750–900.
- Scale (ClashBot px sizes by frequency: 10, 12, 11, 9, 14, 13):

| Use | Size / weight / tracking | ClashBot example |
|---|---|---|
| Page title | 32px (40px ≥sm) / 500 / `-0.025em`, line-height 1 | TradePage "Dashboard" |
| Display title | 34px (46px ≥sm) / 500 / `-0.035em` | Copy Trading h1 |
| Page subtitle | 15px / 500 / muted | "Monitor and manage…" |
| Dialog title | 18px (21px ≥sm) / 600 / `-0.025em` | setup modal h2 |
| Confirm title | 21px / 600 | "Stop Copy Bot #12?" |
| Card title | 18px / 600 / `-0.025em` | bot card exchange |
| Section title | 14px / 600; popover title 17px / 600 | modal `Section` |
| Body | 14px / 500; dense 12–13px | rows |
| Secondary / hint | 12px muted; 10–11px faint, line-height 16px | descriptions |
| Caption / field label | 10px / 600 / uppercase / `0.1em–0.12em` / faint or muted | "TRADERS", NumberField label |
| Badge | 9px / 600 / uppercase / `0.1em` | "Multi-exchange live" |
| Stat value | 18px / 600 tabular-nums; hero 24px / 600 | header stat tiles |

Sentence case everywhere except captions and badges (uppercase, letter-spaced). No other letter-spacing.

## Shape

Tailwind v4 radius scale plus ClashBot's arbitrary radii (`--cb-radius-*`, `radius.*` in theme.js):

| Token | px | Use |
|---|---|---|
| `xs` | 4 | leverage tag (`rounded`) |
| `sm` | 8 | `rounded-lg`, tiny chips inside tiles |
| `md` | 12 | `rounded-xl`: inputs, selects, menu options, icon tiles, warning notes |
| `lg` | 16 | `rounded-2xl`: stat tiles, alerts, menus, toggle rows, choice cards, inner panels |
| `card` | 20 | bot / list cards (`rounded-[20px]`) |
| `section` | 22 | modal form sections |
| `xl` | 24 | dialogs (mobile), filter popover (`rounded-3xl`), floating panels |
| `modal` | 26 | confirm dialogs, sticky toolbar |
| `sheet` | 28 | large dialogs ≥380px, empty states, table sections |
| `dialog` | 30 | full setup dialog ≥sm |
| `pill` | 999 | buttons, tabs, segmented controls, chips, badges, search field, switches |

Spacing: Tailwind 4px grid (8/12/16/20/24). Card padding 20–28; tile `12px 16px`; dialog header `16px 24px`.

## Elevation

| Token | Value (light) | Dark |
|---|---|---|
| `--cb-shadow-sm` (cards, primary button, segment) | `0 1px 3px 0 rgb(0 0 0/.1), 0 1px 2px -1px rgb(0 0 0/.1)` | colour `rgba(0,0,0,.38)` (`--app-shadow`) |
| `--cb-shadow-md` (card hover, sticky toolbar) | `0 4px 6px -1px …/.1, 0 2px 4px -2px …/.1` | `rgba(0,0,0,.38)` |
| `--cb-shadow-lg` / `-xl` / `-2xl` | Tailwind v4 values | `rgba(0,0,0,.38)` |
| `--cb-shadow-menu` | `0 18px 45px rgba(17,24,39,.16)` | same |
| `--cb-shadow-popover` | `0 20px 60px rgba(17,24,39,.18)` | same |
| `--cb-shadow-dialog` | `0 24px 80px rgba(17,24,39,.2)` | `0 30px 100px rgba(0,0,0,.65)` |
| `--cb-shadow-sheet` | `0 30px 100px rgba(17,24,39,.28)` | `0 30px 100px rgba(0,0,0,.65)` |
| `--cb-ring-focus` | `0 0 0 3px rgba(242,101,34,.12)` | same |
| `--cb-ring-selected` | `0 0 0 2px rgba(242,101,34,.08)` | same |

`--terminal-shadow-card` is aliased to `--cb-shadow-sm`. Motion: `150ms cubic-bezier(.4,0,.2,1)`
(Tailwind default), theme transitions 180ms, colour-only hovers (no translate/scale on buttons).

## Components

### Buttons — `uiButton(variant, { size, ...overrides })` / `.cb-btn.cb-btn--{variant}`
Pill, 1px border, 600 weight, `inline-flex` centred, gap 8.

| Size | min-height / padding / font | Source |
|---|---|---|
| `sm` | 32 / `0 16px` / 11px 600 | confirm actions (`px-5 py-2.5 text-[11px]`) |
| `md` (default) | 40 / `0 20px` / 12px 600 | Filters, segment, Apply filters |
| `lg` | 44 / `0 24px` / 14px 500 | "Create New Bot" CTA |

| Variant | Rest | Hover |
|---|---|---|
| `primary` | `#F26522` fill, white, `shadow-sm` | `#E05A1A` |
| `neutral` | `bg-gray-900` (dark `#07080b`), white | `gray-800` (dark `#20242d`) |
| `secondary` | surface, hairline border, `text-gray-700` | `border-orange-200`, `text-[#D95618]` |
| `ghost` | transparent, `text-gray-500` | `bg-gray-100` (dark `#1d212b`), `text-gray-900` |
| `danger` | `bg-red-600`, white | `bg-red-700` |
| `soft` | `bg-gray-100`, `text-gray-500` (close buttons) | `bg-gray-200`, `text-gray-900` |
| `success` / `warning` / `info` | tinted soft bg + semantic text + semantic border | border → semantic colour |

Disabled: opacity .4 (`.cb-btn`) / .48 (`.clash-ui-root button`), `not-allowed`. Focus: 2px `#F26522`
outline, offset 2. Hover for inline-style buttons: `uiButton` publishes `--cb-btn-*` / `--cb-btn-*-hover`
custom properties and `clashbot.css` swaps them on `:hover` only while the inline background/border/colour
still reference them, so a caller that overrides `background` for an active state keeps it on hover.

Icon buttons — `uiIconButton(variant, size)`: `secondary` = ThemeToggle (40px, hairline, surface, `shadow-sm`,
hover orange icon); `soft` = close (36px, 32px in popovers; also `uiCloseButton(size)`); `danger` = tinted
(`bg-red-50 text-red-600`).

### Fields — `uiInput()` / `.cb-input`, `.cb-field`, `.cb-label`, `.cb-hint`
- Text input / select: min-height 44 (`h-11`), radius 12, 1px `--terminal-border`, background
  `--terminal-input`, 13px 600, padding `0 12px`; placeholder faint 400.
- Hover: `border-orange-200`. Focus: border `#F26522` + `--cb-ring-focus` (StyledSelect open). App-wide
  rule for `.clash-ui-root` inputs: hairline border, flat, orange border on focus, keyboard outline kept.
- Search: pill, height 40, padding `0 16px`, 12px 500 (`.cb-input--pill`).
- Label: 10px 600 uppercase `0.11em` muted; hint 10px / 16px faint, 6px above.
- Select menu (`.cb-menu`): radius 16, padding 6, `--cb-shadow-menu`; options radius 12, `10px 12px`,
  12px 500; selected `bg-orange-50 text-[#D95618]` + orange check; active `bg-gray-100`.

### Range slider — every native `input[type=range]` (`clashbot.css`), fill via `--range-progress`
Exact `.range-control`: 20px hit area, transparent background; track 6px pill, fill `#F26522` up to
`--range-progress` (legacy `--val` also honoured), unfilled transparent with
`inset 0 0 0 1px rgba(242,101,34,.24)` (dark `.42`); thumb 18px orange disc with a 4px white border (dark:
`#171a22`), `0 0 0 1px rgba(17,24,39,.08), 0 3px 8px rgba(17,24,39,.18)`; hover/focus: thumb
`scale(1.08)` + `0 0 0 4px rgba(242,101,34,.16)` halo, track outline `.42`. Firefox uses
`::-moz-range-progress`. Set the fill with `style={rangeProgress(value, min, max)}`.

### Switch — `uiSwitchTrack`/`uiSwitchKnob`, `.cb-switch`, `input[type=checkbox][role=switch]`
Track 44×24 pill, off `bg-gray-200` (dark `#292e38`), on `#F26522`; knob 16px white, top 4, `shadow-sm`,
`translateX(4px)` → `24px`, 150ms. Row (`.cb-toggle-row`): radius 16, hairline, surface, `12px 16px`,
label 12px 600, description 10px/16px faint; hover `border-orange-100/200`. Disabled opacity .7.
Checkbox / radio: native, `accent-color: #F26522`.

### Segmented control & tabs
- Segmented (`uiSegmented` + `uiSegment(active)`, `.cb-segmented`): track `bg-gray-100` pill, padding 4,
  no gap; segment pill, `0 16px`, 12px 600, `text-gray-500` → hover `text-gray-900`; selected
  `bg-gray-900` (dark `#07080b`) white + `shadow-sm`. Section switcher variant adds hairline border,
  surface background, `shadow-sm`, 40px segments.
- Underline tabs (`.cb-tabs`): 14px 500 muted; active `text-gray-900` + 1px `border-gray-900`
  (`--cb-tab-underline`), gap 24, `pb-0.5`.
- Sort pills (table headers): radius 12, 10px 600 uppercase `0.08em`; active surface + `text-[#D95618]` +
  `shadow-sm`.
- Nav bar (`.cb-nav`): pill, hairline, surface, `shadow-sm`, padding 5; logo mark 36–40px neutral circle.

### Surfaces
- Card (`uiCard`, `.cb-card`): radius 20, hairline, surface, `shadow-sm`; hover `shadow-md` (300ms).
- Stat tile (`.cb-tile`): radius 16, `12px 16px`, caption + 18px 600 value.
- Form section (`.cb-section`): radius 22, `bg-gray-50/70` → `--terminal-surface-muted`, padding 16/20,
  36px icon tile (radius 12, surface, orange icon, `shadow-sm`).
- Choice card (`.cb-choice`): radius 16, padding 16; selected `border-orange-300`, `bg-orange-50`,
  `--cb-ring-selected`, 20px orange check disc.
- Summary row (`.cb-row`): `12px 0`, hairline divider, label 11px 500 faint, value 11px 600.
- Empty state: radius 28, centred, 44px tinted circular icon, 14–18px 600 title, 12px muted copy,
  neutral pill action.

### Overlays
- Scrim (`uiScrim`, `.cb-scrim`): `--cb-scrim` + `backdrop-filter: blur(3px)`; destructive
  `.cb-scrim--strong` (`/45`, blur 8px). Every React backdrop using `--terminal-overlay` now carries the
  3px blur (the tutorial spotlight is exempt).
- Dialog (`uiModal`, `.cb-modal`): radius 24 (28 ≥380px, 30 for the full setup dialog), hairline,
  surface, `--cb-shadow-dialog`; header `16px 24px` with a hairline bottom border, 18/21px 600 title and a
  36px soft close button; footer actions right-aligned, gap 8. Mobile: full-screen sheet allowed
  (`.cb-scrim--sheet`), `max-height: calc(100dvh - 16px)`.
- Confirm (`.cb-modal--confirm`): max-width 448, padding 24, radius 26, `shadow-2xl`; 44px tinted icon
  disc, 21px 600 title, 12px/20px muted body, ghost Cancel + danger/primary confirm (size `sm`).
- Popover (`.cb-popover`): radius 24, padding 20, `--cb-shadow-popover`. Tooltip (`.cb-tooltip`): radius
  12, `8px 12px`, 11px 500, `--cb-tooltip`, `shadow-lg`.
- Toast (`.cb-toast`, ErrorToast): radius 16, surface, semantic hairline, 12px 500, `shadow-lg`, 22px
  tinted icon disc.

### Badges, alerts, progress, loading
- Badge (`uiBadge(tone)`, `.cb-badge`): pill, `4px 10px`, 9px 600 uppercase `0.1em`, tinted background
  + semantic text (neutral `bg-gray-100 text-gray-500`). Tag (`--tag`): radius 4, 11px 700 `0.05em`.
  Count (`--count`): 20px orange disc, 10px white.
- Alert (`.cb-alert--*`): radius 16, `12px 16px`, 12px 500, semantic soft background + border + text.
  Inline warning note: radius 12, `8px 12px`, 11px, amber tint without border.
- Progress (`.cb-progress`): 8px (`h-2`) pill track `bg-gray-100`, fill emerald, `width` transition 500ms.
- Spinner `.cb-spin` (1s linear), skeleton `.cb-skeleton` (Tailwind `animate-pulse`: 2s
  `cubic-bezier(.4,0,.6,1)`, 50% opacity).

### Tables & lists
Header cells 10px 600 uppercase `0.12em` faint with a hairline bottom border; rows 12–14px, hairline
dividers, row hover `--terminal-hover` (dark leaderboard hover `rgba(242,101,34,.09)`).

### Scrollbars (already exact, `FuturesTerminal.css`)
10px (6px <640px), transparent track, thumb pill with a 3px transparent border,
`rgba(55,65,81,.72)` (dark `rgba(126,135,151,.68)`), hover `#F26522`, active `#DC5418`, min-height 44,
no buttons; Firefox `scrollbar-width: thin`. Horizontal rails opt out with `.clash-scroll-hidden`.

### Icons
ClashBot uses lucide-react line icons at 14–18px, stroke 2–2.5, coloured by `currentColor`. Our existing
inline SVG icons follow `--terminal-button-icon` inside buttons. Illustrated game icons are untouched.

## Mobile
Inputs are 16px below 640px (iOS zoom guard), touch targets ≥ 32px (close) / 40–44px (actions), dialogs
may become full-height sheets, scrollbars shrink to 6px. Do not shrink layouts to fit; keep existing
mobile breakpoints.

## Don'ts
- Don't change behaviour, data flow, handlers, test ids or copy meaning — styling only.
- Don't restyle illustrated game art, DEX logos or the battle HUD ability glows.
- Don't add new dependencies or Tailwind. Don't hard-code hex/rgba in JSX — use the tokens above
  (`#ffffff` on filled orange/neutral/danger buttons is the one exception).
