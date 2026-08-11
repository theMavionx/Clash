# ADR-0020: Ondo SIWE Trading and Server Builder Routing

## Status
Accepted

## Date
2026-08-11

## Context

### Problem Statement

Clash needs a complete Ondo Perps integration before Ondo issues the Clash
builder code. Ondo accounts authenticate with an EVM wallet through SIWE and
then use a bearer JWT for trading. Eligible orders support a `builderCode`
object, but the browser must not be able to remove the Clash code or raise the
fee above the owner-approved 1 basis point.

### Constraints

- Ondo authentication uses Ethereum mainnet (`chainId: 1`) and ERC-4361 SIWE.
- The JWT represents an authenticated trading session and must remain scoped to
  the wallet that signed the challenge.
- Ondo has not issued the Clash builder code yet.
- Builder fee attribution exists on each order request, not as an on-chain
  approval that Clash can independently discover.
- Existing futures UI, rewards, tournament, and earnings behavior must remain
  compatible with other venues.
- Clash must not expose Ondo account or trading functionality to users in the
  United States, Canada, U.S. territories, or comprehensively sanctioned
  jurisdictions.

### Requirements

- Support public markets, marks, depth, candles, account, balance, positions,
  orders, fills, funding, market/limit orders, cancel, leverage, TP/SL,
  Ethereum USDC deposit, and withdrawal.
- Force `feeRateBps: 1` from trusted server configuration on every order after
  Ondo issues the builder code.
- Do not claim builder-attributed rewards for unproven external orders.
- Store the JWT only in wallet-scoped browser storage and verify its wallet
  owner server-side before every private operation.

## Decision

The browser performs the visible SIWE signing step and stores the resulting JWT
under a wallet-specific local-storage key. All Ondo API operations flow through
the Clash futures server. Before every private request, the server resolves the
JWT through Ondo `/v1/account` and checks that its wallet identifier matches the
wallet registered to the authenticated Clash player.

The browser sends only order intent. The server deletes any client-supplied
`builderCode` or `builder_code` and, when `ONDO_PERPS_BUILDER_CODE` is
configured, injects exactly:

```json
{"builderCode":{"code":"<server env>","feeRateBps":1}}
```

Successful builder-routed order IDs are persisted. Fill import credits rewards
only when account and order ID match that server proof and uses
`verified_source='ondo_builder_fill'`. Until the builder code is issued, normal
Ondo trading remains usable but builder reward import stays disabled rather
than inventing attribution.

Before Ondo renders, the browser asks the Clash futures server for regional
eligibility. The server derives country/region from trusted Cloudflare,
Vercel, or CloudFront visitor-location headers and repeats the same check as
middleware on every `/ondo` account, auth, order, deposit, withdrawal, and fill
route. The browser gate is therefore not the security boundary. Missing edge
geo is allowed for local development; production Cloudflare headers are
forwarded explicitly by the deploy-managed Nginx configuration.

### Architecture Diagram

```text
Ethereum wallet -- SIWE signature --> Clash futures server --> Ondo auth
       |                                      |                   |
       |<----------- wallet-scoped JWT -------|<------------------|
       |                                      |
order intent + JWT -------------------------->|
                                              | verify JWT wallet
                                              | strip client builder fields
                                              | inject server code + 1 bps
                                              v
                                         Ondo order API
                                              |
                                              +--> builder-order proof
                                                        |
Ondo fills ---------------------------------------------+
                                                        v
                                      verified trade_history/rewards
```

### Key Interfaces

- `GET /api/futures/ondo/eligibility`
- `POST /api/futures/ondo/auth/challenge` and `/auth/complete`
- `GET /api/futures/ondo/account|positions|orders|fills|funding`
- `POST /api/futures/ondo/orders|leverage|stop-order`
- `DELETE /api/futures/ondo/orders/:orderId|stop-order`
- `POST /api/futures/ondo/deposit-address|withdraw|import-fills`
- `ondo_builder_orders` proof ledger

## Alternatives Considered

### Alternative 1: Direct Browser-to-Ondo Requests

- **Description**: Send the JWT and order directly from React to Ondo.
- **Pros**: One fewer network hop.
- **Cons**: Users can remove or alter builder routing; Clash cannot establish a
  durable proof for rewards.
- **Rejection Reason**: Builder fee and reward attribution are trusted business
  rules and cannot be browser-authoritative.

### Alternative 2: Store Ondo JWTs on the Clash Server

- **Description**: Persist every user's bearer token server-side.
- **Pros**: Easier background polling and bot execution.
- **Cons**: Creates a reusable trading-session credential database and expands
  the compromise blast radius.
- **Rejection Reason**: Manual browser trading does not require server custody
  of long-lived user session tokens.

### Alternative 3: Send a Placeholder Builder Code Now

- **Description**: Include a guessed or temporary code until Ondo responds.
- **Pros**: No deployment-time configuration switch.
- **Cons**: Orders may be rejected or incorrectly attributed.
- **Rejection Reason**: The integration must never fabricate fee attribution.

## Consequences

### Positive

- The browser cannot tamper with the builder code or 1 bps fee.
- A leaked JWT cannot be used through Clash for another registered wallet.
- Trading works before builder activation, while rewards fail closed.
- Existing shared futures components can render Ondo normalized data.

### Negative

- Private requests add a Clash proxy hop and periodic owner verification.
- Browser storage loss requires a new SIWE signature.
- Background MM bots are not enabled by this browser-session design.
- Country-level geolocation cannot identify named people on sanctions lists;
  Ondo's own account controls remain authoritative for person/wallet screening.

### Risks

- **Ondo API schema drift**: validate normalized payloads and live public reads
  with focused tests.
- **Builder code not allowlisted**: expose configuration state and keep reward
  import disabled until Ondo confirms activation.
- **JWT theft in a compromised browser**: wallet-scope storage, never log the
  token, and validate the token owner on the server.
- **False reward credit**: require a persisted order proof and exact fill/order
  match.

## Performance Implications

- **CPU**: Low; JSON normalization and token hash lookup per private request.
- **Memory**: Bounded public-data and token-owner caches.
- **Load Time**: One lazy venue hook and a small official SVG asset.
- **Network**: Public data is cached; private calls add one Clash proxy hop.

## Migration Plan

1. Ship the Ondo adapter, routes, UI hook, and normalized history support.
2. Validate public reads and local UI while builder configuration reports
   `pending_ondo_issuance`.
3. Ask Ondo to issue/allowlist the Clash builder code for the production URL.
4. Set `ONDO_PERPS_BUILDER_CODE` on production and restart futures service.
5. Execute one owner-authorized small order, verify the request proof and fill,
   then enable Ondo reward/tournament promotion.

## Validation Criteria

- A browser-supplied builder tuple is discarded and replaced by server code at
  exactly 1 bps.
- JWT wallet A cannot access wallet B through Clash routes.
- Market, price, depth, and candle reads pass against the live public API.
- Market/limit, cancel, leverage, TP/SL, deposit, and withdrawal schemas match
  the official API reference.
- Only proof-linked fills use `ondo_builder_fill` for rewards.
- Ondo is selectable and renders correctly in the local browser UI.

## Related Decisions

- [ADR-0004: Builder-Aware Decibel Trading MCP](./adr-0004-builder-aware-decibel-trading-mcp.md)
- [ADR-0018: Bulk Browser Signing and Builder Attribution](./adr-0018-bulk-browser-signing-and-builder-attribution.md)
