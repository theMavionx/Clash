# ADR-0018: Bulk Browser Signing and Builder Attribution

## Status
Accepted

## Date
2026-08-03

## Context

### Problem Statement

Clash needs a self-custodial Bulk Trade integration based on `bulk-client`
v0.1.2. The official release provides Rust and Python clients, but no browser
JavaScript SDK. Bulk orders are not Solana transactions: the exchange expects a
Bulk-specific binary action payload signed by the account's Ed25519 key. Every
eligible order must also carry the Clash builder recipient and fee, and reward
accounting must not trust client-reported volume.

### Constraints

- Bulk is in closed beta, so some public reads and real account operations may
  remain unavailable until the exchange enables the account.
- The user's private key must remain in the connected Solana wallet.
- Serialization must match the official v0.1.2 Rust/Python wire format exactly.
- Bulk supports a builder fee of 1 to 15 basis points and requires a separate
  on-account builder approval.
- Existing DEX integrations, tournament accounting, and reward ledgers must be
  preserved.

### Requirements

- Support markets, prices, candles, account state, orders, positions, fills,
  market/limit orders, cancel, leverage, TP/SL, builder approval, and history.
- Attach builder recipient `Drvzmh5iRfHRuKHgmm6Q77CqxhqvsXaLvrKkfMP8qci9`
  and the configured fee to every opening or closing order.
- Attribute rewards only to fills linked to an order whose signed action was
  validated and persisted by Clash.
- Keep deposit and withdrawal routing on Bulk's official referral URL while
  the exchange is in closed beta.

## Decision

Implement a small, version-pinned Bulk wire adapter in `server-futures` rather
than porting or embedding a private key. The server prepares canonical action
bytes from validated high-level intent. The browser asks the connected Solana
wallet to sign those exact bytes. The server reconstructs the bytes, verifies
the Ed25519 signature, checks that signer and linked account match, and rejects
any order or approval whose builder tuple differs from the configured Clash
recipient and fee before forwarding it to Bulk.

Submitted order proofs are persisted by account and order id. Fill import only
accepts fills that match a persisted proof. These rows use
`verified_source='bulk_builder_signed'`, which is the only Bulk source accepted
for rewards, quests, tournaments, referral estimates, and earnings snapshots.

### Architecture Diagram

```text
Player intent
    |
    v
Clash server: validate + serialize v0.1.2 action + enforce builder tuple
    |
    v
Browser Solana wallet: Ed25519 signMessage (private key never leaves wallet)
    |
    v
Clash server: reserialize + verify signature/account/builder
    |
    +------> Bulk /order
    |
    +------> signed order proof ledger
                    |
Bulk /account fills + exact account/order match
                    |
                    v
verified trade_history -> quests / tournament / rewards / earnings
```

### Key Interfaces

- `GET /api/futures/bulk/config`: immutable public integration configuration.
- `POST /api/futures/bulk/prepare`: validated intent to canonical message bytes.
- `POST /api/futures/bulk/submit`: linked-account and signature verification,
  upstream submission, and proof persistence.
- `GET /api/futures/bulk/builder-status`: on-account builder approval read.
- `POST /api/futures/bulk/import-fills`: proof-gated fill reconciliation.
- `bulk_order_builder_proofs`: server-side attribution ledger.

## Alternatives Considered

### Alternative 1: Browser-only Port of the Entire Client

- **Description**: Reimplement all official client behavior directly in React.
- **Pros**: Fewer Clash server round trips.
- **Cons**: Trusts browser-supplied action content and duplicates attribution
  rules in an environment users can modify.
- **Rejection Reason**: It cannot provide authoritative builder verification or
  reward-proof persistence.

### Alternative 2: Server-Custodial Bulk Signer

- **Description**: Store or derive the player's Ed25519 private key on Clash
  servers and submit orders without wallet interaction.
- **Pros**: Simple order UX and background trading.
- **Cons**: Expands custody and compromise blast radius, and conflicts with the
  current self-custodial login model.
- **Rejection Reason**: Clash must not receive the player's Bulk/Solana private
  key.

### Alternative 3: Wait for an Official JavaScript SDK

- **Description**: Expose only the referral link until Bulk publishes a browser
  package.
- **Pros**: Minimal maintenance.
- **Cons**: Delays the complete integration and gives no builder/reward path.
- **Rejection Reason**: The v0.1.2 wire format is public, deterministic, and can
  be independently verified now.

## Consequences

### Positive

- Private keys remain in the user's wallet.
- Builder routing and reward attribution are verified server-side.
- The wire implementation is small, versioned, and covered by canonical-vector
  and signature tests.
- When closed-beta restrictions lift, the same integration can submit without a
  client rewrite.

### Negative

- Clash owns a compatibility layer that must be compared with each Bulk SDK
  release.
- Every write uses a prepare/sign/submit round trip.
- A fill submitted outside Clash is intentionally excluded from Clash builder
  rewards because no matching builder proof exists locally.

### Risks

- **Wire-format drift**: pin behavior to v0.1.2 and update canonical-vector
  tests before adopting a newer release.
- **Bulk API beta instability**: cache public reads, bound timeouts, show empty
  beta states without reporting false balances, and avoid fabricating data.
- **Tampered browser payload**: reserialize and verify action, signer, linked
  account, and builder tuple on the server.
- **Incorrect reward credit**: require both account-scoped order proof and
  `bulk_builder_signed` source.

## Performance Implications

- **CPU**: Small binary serialization and Ed25519 verification per write.
- **Memory**: Small bounded market/price caches and one proof row per order.
- **Load Time**: Bulk hooks load with the existing trading panel; no Rust or
  Python runtime is shipped to the browser.
- **Network**: Public reads are cached and in-flight requests are deduplicated;
  writes require two Clash requests plus one Bulk request.

## Migration Plan

1. Add the v0.1.2 serializer and canonical tests.
2. Add Bulk read/write routes and proof storage in `server-futures`.
3. Add the Solana wallet hook and trading-panel provider.
4. Add Bulk to login, profile recovery, trade history, tasks, tournaments,
   rewards, referrals, earnings, and admin reporting.
5. Validate public endpoints and local signed flows during closed beta.
6. Run a funded beta smoke trade only after the owner supplies an enabled
   account and explicitly authorizes a real order.

## Validation Criteria

- Canonical market and limit payloads match v0.1.2 vectors.
- Correct signatures pass and modified actions/signatures fail.
- A mismatched linked account or builder tuple is rejected before `/order`.
- Only proof-linked fills enter Bulk reward/tournament calculations.
- Bulk can be selected, authenticated with Solana, and rendered in guest mode.
- Public markets, ticker, prices, and candles work against the live beta API;
  unavailable beta endpoints produce explicit non-success states.

## Related Decisions

- [ADR-0004: Builder-Aware Decibel Trading MCP](./adr-0004-builder-aware-decibel-trading-mcp.md)
- [ADR-0005: Avantis Browser Agent Permission Mode](./adr-0005-avantis-browser-agent-permission-mode.md)
- [ADR-0012: Dango Realtime Exchange Integration](./adr-0012-dango-realtime-exchange-integration.md)
