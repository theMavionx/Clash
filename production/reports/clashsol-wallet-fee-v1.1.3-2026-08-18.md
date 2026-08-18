# clashSOL Wallet Compatibility v1.1.3 Release Checklist

## Scope

- Accept standard wallet Compute Budget repricing only after exact semantic
  validation of the reviewed Sanctum route.
- Cap the calculated wallet priority fee at 0.005 SOL and reject unsupported,
  duplicate, malformed, or excessive fee instructions before broadcast.
- Keep Battle Shop tabs, Bridge controls, and the chain picker at their natural
  height when Marketplace content overflows.

## Pre-release gates

- [x] Focused Sanctum server, migration, reward and rate-limit tests pass.
- [x] Focused Battle Shop, theme and scrollbar tests pass.
- [x] Real local Battle Shop browser measurement reports a 54 px tab rail and
      at least 44 px tab controls.
- [x] ESLint has zero errors and the Vite production build passes.
- [x] Canonical Deploy gate passes on the final v1.1.3 snapshot.
- [x] QA, release-manager, DevOps and producer gates are GO.

## Production verification

- [ ] Production source/current SHA equals the pushed v1.1.3 commit.
- [ ] Required PM2 services, Nginx, public game/API/MCP health are green.
- [ ] Sanctum public status and authenticated order routes respond normally.
- [ ] Battle Shop Marketplace tabs remain full height in the deployed browser.
- [ ] Tag `v1.1.3` is pushed only after successful production verification.

## Player-facing patch note

Fixed clashSOL swaps rejected after a wallet recalculated a normal Solana
priority fee. Clash now accepts only tightly bounded fee updates while keeping
the reviewed swap route immutable. Also fixed Battle Shop navigation buttons
collapsing when Marketplace contains a long list.

## Wallet-signed follow-up

Deployment performs no funded transaction. The owner can request a fresh small
quote afterward, approve it in the wallet, and confirm all four swap stages,
the Solscan receipt, and the clashSOL balance update.

## Rollback

This release has no schema migration. Reconcile any executing, unknown, or
submitted intent before code rollback; then switch to the prior immutable
release. Old code ignores the documentation-only and UI changes.
