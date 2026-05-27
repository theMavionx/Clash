# ADR-0009: Server Custodial NFT Marketplace

## Status

Accepted

## Date

2026-05-27

## Context

### Problem Statement

The game needs a player-to-player Demon King NFT marketplace, but deploying and
operating a new Solana smart contract is expensive and adds release risk. The
product goal is to let players list Demon King NFTs from every currently
supported chain, pay with stable USDC on any supported payment chain, and let
the server settle delivery and payouts using wallets already used by the game
shop.

### Constraints

- Avoid deploying a new Solana program for the first production version.
- Reuse existing treasury/payment wallets where purchase money already arrives.
- Keep accounting auditable on the server.
- Do not silently accept NFT custody if the server cannot sign delivery
  transactions.
- Support Base, Arbitrum, Monad, Solana, and Aptos as marketplace asset,
  payment, and delivery chains where the underlying NFT deployment exists.
- Use USDC as the stable quote/payment rail on every payment chain.

### Requirements

- Sellers can create listings for owned Demon King NFTs on Base, Arbitrum,
  Monad, Solana, or Aptos.
- The NFT is transferred to a server-controlled vault on its source chain before
  the listing becomes active.
- Buyers pay USDC to the existing treasury wallet on Base, Arbitrum, Monad,
  Solana, or Aptos.
- The server verifies on-chain payment before marking an order paid.
- Same-chain delivery is automated when the matching custody signer is
  configured.
- Cross-chain delivery uses the existing server-side bridge relay after the
  custody wallet burns the source NFT.
- Solana uses Metaplex Core as the current production NFT standard; Token-2022
  support remains only as legacy compatibility for already migrated assets.
- Manual admin settlement remains available for cases that cannot be automated
  safely yet.

## Decision

Implement the marketplace as a server-custodial flow rather than a new Solana
marketplace program.

The server owns the marketplace order ledger, verifies NFT ownership/custody and
USDC payments, and records every important state transition in an event log.
Listings are only public after the seller transfers the NFT into the configured
source-chain custody vault. Buyers reserve an order, receive a salted
chain-local USDC amount, pay the chosen treasury wallet, and submit the
transaction hash for verification.

For same-chain delivery, the server transfers the escrowed NFT from custody to
the buyer. For cross-chain delivery, the server burns the NFT from custody on
the source chain and calls the existing bridge relay to mint on the destination
chain. This keeps the user flow single-payment and avoids requiring the buyer
or seller to sign bridge transactions after payment.

### Architecture Diagram

```text
Seller source-chain wallet
  -> NFT transfer
  -> Server source-chain custody vault
  -> active listing in SQLite

Buyer payment-chain wallet
  -> USDC transfer
  -> Existing game treasury wallet on that chain
  -> server receipt verification
  -> order paid

Server custody signer / bridge relay
  -> same-chain NFT transfer, or
  -> source-chain bridge burn + destination-chain bridge relay mint
  -> order delivered
```

### Key Interfaces

- `GET /api/marketplace/custodial/config`
- `GET /api/marketplace/custodial/listings`
- `GET /api/marketplace/custodial/orders/mine`
- `POST /api/marketplace/custodial/listings`
- `POST /api/marketplace/custodial/listings/:id/deposit`
- `POST /api/marketplace/custodial/listings/:id/cancel`
- `POST /api/marketplace/custodial/orders/:id/buy-intent`
- `POST /api/marketplace/custodial/orders/:id/payment`
- `GET /api/admin/marketplace/custodial/orders`
- `POST /api/admin/marketplace/custodial/orders/:id/settle`
- `POST /api/admin/marketplace/custodial/orders/:id/payout`

## Alternatives Considered

### Alternative 1: New Solana Marketplace Program

- **Description**: Deploy the Rust Solana marketplace program described in
  ADR-0008.
- **Pros**: Stronger on-chain escrow/delegation model and less server custody.
- **Cons**: Higher deployment cost, additional SBF tooling, smart contract audit
  surface, and slower iteration.
- **Rejection Reason**: The current priority is shipping a working marketplace
  without Solana program deployment cost.

### Alternative 2: External Marketplace Only

- **Description**: Rely on third-party marketplaces for listing and purchase.
- **Pros**: Lowest implementation cost.
- **Cons**: Poor in-game UX, weaker task/gold attribution, less control over
  cross-chain delivery and supported payment rails.
- **Rejection Reason**: The game needs a controlled marketplace flow integrated
  with player accounts and rewards.

### Alternative 3: Fully Manual OTC Server Desk

- **Description**: Admin manually receives NFTs, tracks payments, and sends
  payouts without a productized listing ledger.
- **Pros**: Very fast to operate for one-off cases.
- **Cons**: Error-prone, not self-serve, weak audit trail.
- **Rejection Reason**: The marketplace needs user-facing listings and an
  auditable order state machine.

## Consequences

### Positive

- No new Solana smart contract is required for launch.
- The server can verify all payment and custody transitions before changing
  order state.
- Existing treasury/payment infrastructure is reused.
- The UI can ship as a normal in-game marketplace instead of a preview-only
  surface.
- Cross-chain delivery reuses the existing bridge system instead of creating a
  second bridge implementation.

### Negative

- The server temporarily custodies listed NFTs.
- Server key management becomes critical across EVM, Solana, and Aptos.
- Unexpected Solana standards still need manual settlement until implemented.

### Risks

- **Custody signer compromise**: mitigate with dedicated vault keys, minimum
  balances, restricted env access, and event logging.
- **Payment replay**: mitigate with unique payment transaction hashes and salted
  order amounts.
- **NFT stuck in vault**: mitigate by refusing ready state without a signer and
  by keeping admin settlement/cancel paths.
- **Bridge relay failure**: keep the paid order state and expose admin settlement
  so delivery can be retried after RPC or gas issues.
- **Unsupported NFT standard**: Metaplex Core is the default Solana path;
  Token-2022 remains supported only for already migrated legacy assets.

## Performance Implications

- **CPU**: Low; payment and custody checks are per user action.
- **Memory**: Low; orders are stored in SQLite.
- **Load Time**: Minimal impact; marketplace data loads only on the NFT shop
  marketplace tab.
- **Network**: Adds chain RPC receipt checks and ownership checks during
  list/buy/deliver flows.

## Migration Plan

1. Add the custodial marketplace tables and event log.
2. Mount custodial marketplace API routes behind existing auth/admin auth.
3. Replace the marketplace tab with the custodial UI.
4. Configure dedicated EVM, Solana, and Aptos custody signers before enabling
   production use.
5. Keep the old Solana program work as reference, but do not require it for the
   first production release.

## Validation Criteria

- Server routes and database migrations load cleanly.
- Frontend production build succeeds.
- Listing cannot become active until the NFT is verified in custody on its
  source chain.
- A USDC payment transaction cannot be reused for another order.
- Orders show correct status transitions in seller and buyer views.
- Same-chain delivery works on configured chains.
- Cross-chain delivery burns from custody and relays through the existing bridge.
- Admin can inspect and manually settle orders that cannot be auto-delivered.

## Related Decisions

- [ADR-0008: Solana Core NFT Marketplace](adr-0008-solana-core-nft-marketplace.md)
