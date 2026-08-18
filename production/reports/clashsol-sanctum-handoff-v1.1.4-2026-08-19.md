# clashSOL Official Sanctum Handoff v1.1.4 Release Checklist

## Scope

- Hide the embedded clashSOL swap and all active client balance/order recovery.
- Send players to the official preselected Sanctum clashSOL stake page.
- Keep Daily Gold, holder-wallet linking, capacity-safe claim and history in
  Battle Shop with clearer benefits and completed-day timing.
- Suppress zero APY and label the same-validator peer median as an estimate
  until clashSOL publishes a valid completed-epoch APY.

## Pre-release gates

- [x] Focused Sanctum server/reward/migration/rate-limit tests pass.
- [x] Focused Battle Shop/admin tests pass.
- [x] Desktop and 390px browser checks show the official CTA, only Daily
      Gold/History tabs, no swap input, 44px controls and no horizontal overflow.
- [x] ESLint and production Vite build pass.
- [x] Canonical Deploy gate passes on the final v1.1.4 snapshot.
- [x] Release-manager, QA, DevOps and producer gates are GO.

## Production verification

- [ ] Production source/current SHA equals the pushed v1.1.4 commit.
- [ ] Required PM2 services, Nginx and public web/API/MCP health are green.
- [ ] clashSOL status returns measured APY or the labelled peer estimate.
- [ ] Production Battle Shop opens the exact official Sanctum URL and exposes
      no embedded swap controls.
- [ ] Daily Gold wallet link/claim/history routes remain healthy.
- [ ] Tag `v1.1.4` is pushed only after successful production verification.

## Player-facing patch note

Getting clashSOL is now simpler: Battle Shop opens the official Sanctum staking
page with clashSOL already selected. Return with the same wallet to earn and
claim Daily Gold in Clash. The rewards screen now explains the daily rate,
completed-day snapshot timing, custody and safely banked claim remainder.

## Rollback

No schema migration or funded transaction is part of this release. Roll back
to the prior immutable release if the official link, reward routes or UI health
checks fail. Historical swap and reward ledgers remain untouched.
