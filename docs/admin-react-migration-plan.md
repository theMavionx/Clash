# Admin Panel React Migration Plan

## Goal

Replace the server-rendered `/api/admin/panel` monolith with a production React admin panel that is fast to scan, safe for destructive actions, comfortable to scroll, and consistent with the Clash visual palette.

The backend admin API remains the source of truth. The migration should not rewrite gameplay, economy, tournament, marketplace, NFT, or log endpoints unless a UI requirement exposes an API gap.

## Current State

The old admin UI is embedded in `server/index.js` as one large HTML/CSS/JS string. It contains:

- Login with `x-admin-key`
- Players table and account tools
- Battle replays
- Tasks CRUD and task progress
- Tournaments CRUD, leaderboard, daily point logs, prize tiers
- Elfa stats
- Server logs
- Client logs
- AI log reports
- Feedback
- Stats and player activity
- Earnings and revenue analytics
- Shop and AI chat billing
- Custodial marketplace stats and orders
- NFT supply and bridge analytics

The biggest UX failure is complex nested editing inside a long page, especially tournament prize tiers and rewards. The current UI makes horizontal overflow, form grouping, and destructive actions hard to reason about.

## New Information Architecture

### Overview

Purpose: show the admin what needs attention first.

Primary blocks:

- Online and active players
- Active tournaments
- Replay verification health
- Recent tournament list
- Recent player operation targets

### Players

Purpose: daily support and test operations.

Layout:

- Top stats: players, online, active 7d, shielded
- Filters: search by name/id/wallet, DEX filter
- Sticky-header table with horizontal scroll
- Per-row `Tools` drawer for actions

Actions:

- Add exact resources
- Quick trophy deltas
- Reset trophies
- Max village by Town Hall level
- Max everything
- Reset account
- Delete account

Safety:

- Dangerous actions stay out of the main table
- Reset/delete require confirmation
- All actions refresh the table after completion

### Tournaments

Purpose: create, edit, inspect, and close tournaments without form overload.

Layout:

- Top stats: total, active, draft, ended
- Searchable tournament table
- Per-row actions: edit, leaderboard, end, delete
- Edit/create opens a right-side wizard drawer

Wizard steps:

1. Schedule
   - Name
   - Description
   - Status
   - Start/end time
   - Pre-registration window

2. Eligibility
   - Single/custom/all DEX scope
   - Primary DEX
   - Individual vs DEX-vs-DEX mode
   - Team score metric
   - Member reward metric
   - Attack policy

3. Scoring
   - Sort metric
   - Live vs daily pool scoring
   - Point weights
   - Gold/seeker/trophy boosts
   - Shield hours
   - Freeze trophies
   - Seeker-only flag

4. Rewards
   - Prize currency
   - COP reward flag
   - Volume unlock tiers
   - Multiple rewards per tier
   - Payout preset regeneration
   - Manual payout adjustment

5. Review
   - Full API payload preview before save

Validation:

- Name required
- Start/end required and end must be after start
- At least one eligible DEX
- DEX-vs-DEX requires at least two DEXes
- Point weights must total 100 when points are used
- Reward payouts cannot exceed their pool

### Battle Replays

Purpose: inspect verification outcomes.

Layout:

- Filter accepted/rejected/all
- Search attacker/defender
- Sticky table with reason, simulation stats, loot, duration

### Admin Data Sections

1. Stats
   - Activity cards
   - Device breakdown
   - Town Hall distribution
   - DEX adoption
   - Export player activity CSV

2. Earnings
   - 24h/30d/all-time cards
   - DEX revenue table
   - Tournament revenue table
   - Force refresh action with stale-state indicator

3. Client Logs
   - Level/time/source filters
   - Group by user/player
   - Expandable details
   - Link to AI report generation

4. Marketplace
   - Order state columns
   - Settlement/payout action queue
   - Recent events
   - Vault/treasury readiness warnings

5. NFT / Bridge
   - Supply by chain
   - Bridge route health
   - Pending destination mints
   - Error rate cards

6. Tasks
   - CRUD form drawer
   - Task type specific fields
   - Progress inspection drawer
   - Reset progress action

7. Shop
   - Payment config health
   - Solana reconcile action
   - AI chat settings and billing

8. Feedback, Logs, AI Reports, Elfa
   - Focused tables and diagnostics instead of JSON fallback
   - Add filters before adding actions where data volume grows

The React app still keeps a generic debug renderer in code as a defensive fallback for any future admin tab that is added to navigation before its dedicated panel exists. Current navigation tabs are all routed to purpose-built panels.

## Visual System

The admin UI uses the project palette in a restrained operations style:

- Background: `#0a0b1a`
- Surfaces: `#172033`, `#1f2937`
- Primary accent: Clash gold `#ffd700`
- Secondary resource colors: wood green, ore purple, blue for system states
- Cards use 8px radius
- Tables use sticky headers and constrained scroll containers
- Main actions are gold; dangerous actions are red; success actions are green

This intentionally avoids the cartoon button style used in the game UI because admin work needs density, scanability, and repeat-use comfort.

## Routing And Deployment

New files:

- `web/admin.html`
- `web/src/admin/main.jsx`
- `web/src/admin/AdminApp.jsx`
- `web/src/admin/api.js`
- `web/src/admin/tournamentUtils.js`
- `web/src/admin/admin.css`

Build:

- Vite now builds both `index.html` and `admin.html`.

Server:

- `/api/admin/panel` serves `web/dist/admin.html` when built.
- `/api/admin/panel?legacy=1` keeps the old server-rendered panel available.
- In local dev without `web/dist/admin.html`, the route loads the admin entry from `CLASH_ADMIN_DEV_ORIGIN` or `http://localhost:5173`.

## Rollout Plan

1. Ship React shell and tournament wizard behind the existing `/dashboard` path.
2. Keep legacy panel available with `?legacy=1`.
3. Use the React Players and Tournaments tabs for daily admin work.
4. Use purpose-built panels for all current navigation tabs.
5. After a production soak period, remove the old inline HTML from `server/index.js`.
6. Add browser screenshot smoke tests for login, players, tournament wizard, and mobile drawer layout once Playwright is available in the repo or CI.

## Acceptance Criteria

- Admin can login with the existing admin key.
- Admin can browse core sections without page-level reloads.
- Player table is searchable and horizontally scrollable.
- Player tools are in a focused drawer with confirmations for destructive actions.
- Tournament create/edit is step-based and validates before save.
- Task create/edit is available from the Tasks tab with verifier params and rewards.
- Existing admin endpoints remain compatible.
- `/api/admin/panel?legacy=1` still opens the old panel during migration.
- Vite build includes `dist/admin.html`.
