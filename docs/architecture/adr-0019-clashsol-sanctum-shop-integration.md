# ADR-0019: clashSOL Sanctum Shop Integration

## Status
Accepted

## Date
2026-08-08

## Context

### Problem Statement

Clash needs an in-game shop flow where a player can stake SOL into a branded
`clashSOL` liquid staking token without surrendering custody of their Solana
wallet. The linked Sanctum API can read existing LST metadata and APY, create an
unsigned swap transaction, and execute the signed transaction. It does not
create or deploy a new LST.

Sanctum currently launches new LSTs manually after receiving branding, a
revenue wallet, and a correctly configured SPL mint. Until that external
process is complete, Clash must not present a fake staking action or treat an
ordinary SPL token as a functioning LST.

### Constraints

- `clashSOL` needs a Sanctum-deployed stake pool before the trading API can use
  its mint.
- The Sanctum API requires an API key that must not enter the browser bundle.
- The player's Solana private key must remain in an external wallet adapter or
  Privy embedded wallet.
- An unsigned transaction returned by Sanctum must preserve its signers,
  account roles, lookup tables, and swap instructions between the order and
  execute requests. Wallet-added Compute Budget pricing is permitted only
  within the bounds recorded by ADR-0026.
- The Clash API must not become a generic authenticated proxy for arbitrary
  Sanctum swaps.
- Mainnet mint creation, authority transfer, partner-form submission and
  funded transactions are external mutations and need explicit owner approval.

### Requirements

- Show a truthful launch-pending state before the Sanctum pool is live.
- Once live, fetch authoritative `clashSOL` metadata and APY through a
  server-side API-key proxy.
- Restrict order construction to wrapped SOL as input and the configured
  `clashSOL` mint as output.
- Persist short-lived order intents and semantically compare the signed
  transaction with the message returned by Sanctum: every non-Compute field is
  immutable, while the recent blockhash and ADR-0026-bounded Compute Budget
  limit/price may be refreshed by the signing wallet.
- Support external Solana wallet adapters and Privy embedded Solana wallets.
- Keep the shop responsive and usable on mobile.

## Decision

Implement a two-state integration.

1. **Launch-pending state**: the shop exposes the `clashSOL` product and the
   genuine Sanctum launch requirements, but does not create an order while the
   API key, mint, or discoverable Sanctum pool is missing.
2. **Live state**: the Clash server calls Sanctum with its private API key,
   builds an exact-input wrapped-SOL-to-`clashSOL` order for a validated wallet,
   persists the upstream response and unsigned message hash, and returns only a
   short-lived order id plus the transaction and safe quote fields. The browser
   signs that transaction. The server verifies the signature and message hash,
   retrieves the original upstream order from SQLite, and sends both to
   Sanctum's execute endpoint. Before execution, the server compares signer
   keys, static account roles, address-lookup tables, and every non-Compute
   instruction, then validates any wallet-adjusted Compute Budget instructions
   against ADR-0026.

The client never supplies input/output mints or an arbitrary upstream order
object. The server owns those fields from configuration and stored intent.

### Architecture Diagram

```text
Sanctum partner launch (external, one time)
    branding + 9-decimal zero-supply mint + revenue wallet
                         |
                         v
             Sanctum deploys clashSOL pool
                         |
                         v
Shop status -> Clash server -> Sanctum /lsts/{clashSOL mint}
                         |
Player enters SOL        v
Shop -> Clash order endpoint -> Sanctum /swap/token/order
                         |
                 durable order intent
                         |
                         v
External/Privy wallet signs the reviewed transaction
                         |
                         v
Clash verifies signer + semantic message shape -> Sanctum /swap/token/execute
                         |
                         v
                 clashSOL reaches player ATA
```

### Key Interfaces

- `GET /api/sanctum/clashsol/status`: launch readiness and allowlisted metadata.
- `POST /api/sanctum/clashsol/orders`: authenticated exact-input order creation
  for the connected Solana wallet.
- `POST /api/sanctum/clashsol/orders/:id/execute`: authenticated signed
  transaction verification and execution.
- `sanctum_order_intents`: short-lived authoritative upstream order and
  transaction-message ledger.
- Server configuration: `SANCTUM_API_KEY`, `CLASHSOL_MINT`, optional
  `SANCTUM_API_BASE_URL`, and bounded timeout/cache settings.

## Alternatives Considered

### Alternative 1: Create clashSOL Through the Sanctum API

- **Description**: Call a hypothetical API endpoint from the shop to create the
  token and stake pool.
- **Pros**: Fully automated launch.
- **Cons**: The endpoint does not exist. Sanctum states that permissionless LST
  launch tooling is still in development.
- **Rejection Reason**: It would fabricate functionality and could create an SPL
  token that is not backed by a Sanctum stake pool.

### Alternative 2: Call Sanctum Directly From the Browser

- **Description**: Put the API key in a Vite environment variable and call the
  order/execute endpoints from React.
- **Pros**: Less server code.
- **Cons**: Vite variables are public, so the key would be extractable. The
  browser could also turn Clash into an arbitrary-key swap client.
- **Rejection Reason**: Secret exposure and missing server-side route controls.

### Alternative 3: Build Stake-Pool Instructions Locally

- **Description**: Bypass the Sanctum API and construct direct stake-pool
  deposit instructions in the browser.
- **Pros**: No Sanctum API dependency for order construction.
- **Cons**: Clash would own pool-version compatibility, account derivation,
  routing, priority-fee and liquidity behavior already handled by Sanctum.
- **Rejection Reason**: The official API is the smaller and safer integration
  boundary once the pool is deployed.

### Alternative 4: Redirect Players to app.sanctum.so

- **Description**: Add only an external link.
- **Pros**: Minimal implementation and maintenance.
- **Cons**: Breaks the in-game flow and cannot provide a polished Clash-owned
  staking experience.
- **Rejection Reason**: The owner requested an in-shop integration.

## Consequences

### Positive

- Player keys remain self-custodial.
- The Sanctum API key remains server-only.
- The integration is useful before launch without falsely claiming readiness.
- A stored intent prevents client-side route, mint, amount, and order tampering.
- Enabling the live flow after launch is configuration-only.

### Negative

- The owner must complete Sanctum's external onboarding and provide the mint and
  API key before a funded transaction can run.
- The order flow adds two Clash requests around the wallet signature.
- Short-lived SQLite intents require cleanup and consume a small amount of disk.

### Risks

- **Sanctum API schema drift**: validate required fields, reject unknown route
  semantics, and keep focused contract tests.
- **Transaction mutation by a wallet**: verify the expected wallet signature,
  require exact signer/account/LUT/non-Compute instruction equality, and allow
  only the bounded Compute Budget exception defined by ADR-0026.
- **Stale order/blockhash**: expire intents quickly and require a fresh quote.
- **API/rate-limit outage**: cache metadata, bound timeouts, and return a clear
  unavailable state without retry storms.
- **Incorrect launch configuration**: verify the returned metadata mint exactly
  matches `CLASHSOL_MINT` before marking the product live.

## Performance Implications

- **CPU**: one SHA-256 and Ed25519 signature verification per execution.
- **Memory**: one small metadata cache entry; order payloads are persisted in
  SQLite instead of retained in process memory.
- **Load Time**: the staking panel is loaded only when the shop product opens.
- **Network**: one cached status read and one order/execute pair per stake.

## Migration Plan

1. Add the durable intent table and Sanctum service module.
2. Add status, order, and execute API routes.
3. Add the `clashSOL` shop card and signing modal.
4. Verify disabled, mocked-live, transaction-signature and responsive UI flows.
5. Submit the external Sanctum launch package with separate owner approval.
6. Configure the real API key and mint, then run one explicitly approved funded
   smoke transaction before production enablement.

## Validation Criteria

- Missing configuration returns launch-pending and never creates an order.
- Wrong wallet, amount, output mint, expired order, modified non-Compute
  transaction, unsupported/excessive wallet fee, bad signature and replayed
  execution are rejected.
- A canonical mocked Sanctum response passes order and execute end to end.
- No API key appears in client source, built assets, API responses, or logs.
- The shop panel renders without overlap at desktop and phone widths.
- Frontend lint/build and server syntax/contract tests pass.

## Related Decisions

- [ADR-0007: Batch NFT and Shop Transactions](./adr-0007-batch-nft-and-shop-transactions.md)
- [ADR-0008: Solana Core NFT Marketplace](./adr-0008-solana-core-nft-marketplace.md)
- [ADR-0018: Bulk Browser Signing and Builder Attribution](./adr-0018-bulk-browser-signing-and-builder-attribution.md)
- [ADR-0026: Bounded Wallet Compute Budget Adjustments for Sanctum](./adr-0026-sanctum-bounded-wallet-compute-budget.md)
