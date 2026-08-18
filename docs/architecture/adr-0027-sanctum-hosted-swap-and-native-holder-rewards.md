# ADR-0027: Sanctum-Hosted clashSOL Swap and Native Holder Rewards

## Status
Accepted

## Date
2026-08-19

## Context

### Problem Statement

The embedded clashSOL swap implemented by ADR-0019 repeatedly failed before
broadcast when Solana wallets recompiled otherwise equivalent versioned
transactions. Although ADR-0026 and the resolved-semantics validator make that
path safer and more compatible, the owner wants the player-facing transaction
flow temporarily moved to Sanctum's official application while Clash retains
its differentiated daily Gold holder reward.

### Constraints

- Player custody and transaction review must remain in the connected Solana
  wallet.
- The external destination must preselect the real clashSOL product.
- Clash must not imply that a redirect is an in-game swap or that it controls
  Sanctum's quote, fees, confirmation, or staking APY.
- Daily Gold calculation, wallet linking, capacity-safe claims, and reward
  history remain authoritative Clash server responsibilities.
- Historical embedded-swap records remain visible in activity history.

### Requirements

- Hide all embedded swap controls and background order recovery/polling.
- Link to `https://app.sanctum.so/stake/clashSOL` in a new tab with clear
  external-service labeling.
- Explain the four-step path: open Sanctum, stake SOL, return with the same
  wallet, hold through the UTC day and claim after maturation.
- Keep measured APY when available and explicitly label any same-validator
  peer median as an estimate.
- Keep Daily Gold status, wallet linking, partial claims, and paginated history
  inside Battle Shop.

## Decision

The Battle Shop clashSOL surface becomes a rewards hub with an official Sanctum
staking handoff. Clash fetches public clashSOL metadata/APY and local reward
state, but it does not request balances, create new swap intents, restore active
orders, sign transactions, submit transactions, or poll swap confirmations
while `EMBEDDED_SWAP_ENABLED` is false.

The reviewed embedded implementation remains dormant for a future separately
approved re-enable. Any existing order and swap history stays in the database;
the active player surface exposes only Sanctum's hosted staking link plus
Clash-owned Daily Gold and History tabs.

### Architecture Diagram

```text
Battle Shop clashSOL
    |-- public metadata/APY -> Clash API -> Sanctum API
    |-- Stake CTA ----------> app.sanctum.so/stake/clashSOL
    |                              |
    |                    wallet signs on Sanctum
    |                              |
    `-- same wallet link -> Clash reward observations
                                |
                       completed UTC-day reward
                                |
                         capacity-safe Gold claim
```

### Key Interfaces

- External stake URL: `https://app.sanctum.so/stake/clashSOL`.
- `GET /api/sanctum/clashsol/status`: metadata, measured APY, or clearly
  identified peer estimate.
- Authenticated reward status/link/claim/history routes defined by ADR-0025.
- `EMBEDDED_SWAP_ENABLED = false`: client release gate preventing embedded
  order, signing, restore, polling, and balance reads.

## Alternatives Considered

### Alternative 1: Immediately Re-enable the Resolved-Semantics Validator

- **Description**: Ship the wallet compatibility work and keep swaps in Clash.
- **Pros**: Fewer clicks and a fully native transaction experience.
- **Cons**: Requires a funded wallet matrix across Phantom, Solflare, Privy,
  Backpack and mobile before confidence is adequate.
- **Rejection Reason**: The owner prioritized a reliable official route now.

### Alternative 2: Remove All Sanctum UI

- **Description**: Hide clashSOL entirely until the embedded flow is restored.
- **Pros**: Smallest surface and no redirect.
- **Cons**: Existing holders cannot discover rewards, link wallets, claim Gold,
  or see history.
- **Rejection Reason**: It removes the working holder-reward product.

### Alternative 3: Keep Both Embedded and External Swap Buttons

- **Description**: Offer players a choice of execution venue.
- **Pros**: Provides a fallback without removing the native path.
- **Cons**: Preserves the failing path, duplicates decisions, and can make
  users retry the same financial action through two flows.
- **Rejection Reason**: Ambiguous transaction ownership and double-submit risk.

## Consequences

### Positive

- Transaction construction, wallet compatibility, and broadcast UX are owned
  by Sanctum's official application.
- Clash no longer receives signed swap payloads in the active player flow.
- Daily Gold remains a clear marketing differentiator with a truthful timing
  explanation and custody model.
- Existing rewards and history remain accessible.

### Negative

- The player leaves the game for the staking transaction and must return.
- Clash cannot show live transaction stages for new hosted swaps.
- The external Sanctum page and availability are outside Clash control.

### Risks

- **Wrong wallet linked after returning**: explicitly tell players to use the
  same wallet and show the shortened linked wallet in reward status.
- **External URL drift**: protect the exact official path with a focused source
  contract and verify it during release smoke tests.
- **APY misunderstanding**: label direct epoch APY separately from the
  same-validator peer estimate and state that neither is guaranteed.
- **Dormant code accidentally reappears**: gate every visible/internal swap
  entry point and assert the flag, tab list, and CTA in tests.

## Performance Implications

- **CPU**: lower client/server swap-processing work in the active flow.
- **Memory**: unchanged reward state; no active client swap progress state.
- **Load Time**: slightly less API work because wallet balance and active-order
  reads are skipped.
- **Network**: status/reward/history reads remain; transaction network traffic
  moves to Sanctum after the player opens the external page.

## Migration Plan

1. Default the clashSOL section to Daily Gold.
2. Add the official Sanctum staking card and four-step handoff.
3. Remove Swap from the visible tab list.
4. Gate balance, active-order restore, polling, progress chip/modal and embedded
   controls behind `EMBEDDED_SWAP_ENABLED = false`.
5. Preserve activity history and server tables for audit/recovery.
6. Re-enable only after a separate ADR amendment and funded wallet matrix.

## Validation Criteria

- No embedded swap tab, amount input, review button, wallet signature request,
  order creation, restore, or polling runs in the active player flow.
- Official CTA resolves to the preselected clashSOL Sanctum page.
- Daily Gold explains rate, custody, completed-day calculation, next snapshot,
  linked wallet, partial storage claims, and remaining banked rewards.
- Desktop/mobile light/dark layouts have one vertical scroll owner, 44px
  controls, no horizontal overflow, and readable long copy.
- Focused Sanctum tests, lint, production build, browser smoke, and canonical
  deployment gate pass.

## Related Decisions

- [ADR-0019: clashSOL Sanctum Shop Integration](./adr-0019-clashsol-sanctum-shop-integration.md)
- [ADR-0025: clashSOL Daily Holder Rewards](./adr-0025-clashsol-daily-holder-rewards.md)
- [ADR-0026: Bounded Wallet Compute Budget Adjustments for Sanctum](./adr-0026-sanctum-bounded-wallet-compute-budget.md)
