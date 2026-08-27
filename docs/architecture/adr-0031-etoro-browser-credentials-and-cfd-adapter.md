# ADR-0031: eToro Browser Credentials and CFD Adapter

## Status
Accepted

## Date
2026-08-27

## Context

### Problem Statement
Clash needs an eToro trading integration with the same market, account, order,
position, history, Gold, quest, and tournament behavior as the existing venues.
eToro's public trading API authenticates either a registered multi-user OAuth
application or a user's API key plus user key. Clash does not yet have approved
eToro OAuth client credentials.

eToro exposes leveraged retail trading as CFD or margin-trade settlements rather
than the perpetual-futures contract model used by most existing Clash venues.
The adapter must present those eligible leveraged instruments through the common
Clash futures UI without pretending they have funding rates or perpetual-contract
semantics.

### Constraints
- API secrets must not be persisted by Clash servers or written to logs.
- Real and Demo credentials and routes must never be mixed.
- Only eToro eligibility responses may determine settlement type, direction,
  leverage values, and minimum investment.
- Existing wallet-based Clash authentication remains the game identity layer;
  eToro credentials authorize only eToro requests.
- Referral or App Store attribution cannot be claimed until eToro approves a
  registered Clash application and supplies OAuth client credentials.
- Existing DEX behavior must remain unchanged.

### Requirements
- Support market discovery, rates, candles, account balance, open positions,
  pending orders, market and MIT orders, cancellation, partial/full close, and
  TP/SL edits. Confirm asynchronous market-order acceptance through the order
  lookup endpoint so an upstream rejection is not shown as a successful fill.
- Support both Real and Demo eToro accounts.
- Import eToro-confirmed positions and closed trades into the verified futures
  ledger so Gold, quests, and tournaments use the existing reward pipeline.
- Keep credentials encrypted at rest in the user's browser and transient on the
  server.
- Leave a clean upgrade path to eToro OAuth without replacing the adapter.

## Decision

Implement a dedicated server-side eToro adapter over the official eToro REST API
and a browser-side `useEtoro` hook.

The browser stores `{ apiKey, userKey, environment }` using the existing
AES-GCM encrypted credential store. Each authenticated `/api/futures/etoro/*`
request forwards those values in eToro-specific headers. The futures server
translates them to eToro's `x-api-key`, `x-user-key`, and unique `x-request-id`
headers, then discards them after the request.

The adapter discovers instruments and calls the eligibility endpoint. It exposes
only instruments with an openable `cfd` or `marginTrade` configuration and uses
the returned direction, leverage values, settlement type, and minimum amount for
order validation. Real and Demo select distinct official portfolio, eligibility,
execution, and history paths.

Clash continues to use the player's existing EVM-signed game login as the local
player identity. The eToro account is represented in UI and telemetry by a
non-secret SHA-256 credential fingerprint or upstream account id; it is never
used as a login secret.

Verified reward imports use upstream position ids as stable deduplication keys.
An open position and its later closed-history record update the same ledger row,
so volume is credited once. The verified source is `etoro_api`.

### Architecture Diagram

```text
Browser
  EVM game login -----> Clash main server (player identity/rewards)
  AES-GCM eToro keys
        |
        | transient eToro headers + Clash token
        v
Clash futures server -----> official eToro Public API
        |                         | markets / eligibility / trading
        | verified normalized    | portfolio / history
        v                         v
  futures.db trade_history -> Gold / quests / tournaments
```

### Key Interfaces
- `GET /api/futures/etoro/config`
- `POST /api/futures/etoro/credentials/check`
- `GET /api/futures/etoro/account-snapshot`
- `GET /api/futures/etoro/candles`
- `GET /api/futures/etoro/history`
- `POST /api/futures/etoro/orders`
- `DELETE /api/futures/etoro/orders/:orderId`
- `POST /api/futures/etoro/positions/:positionId/close`
- `PATCH /api/futures/etoro/positions/:positionId`
- `POST /api/futures/etoro/import-trades`

## Alternatives Considered

### Alternative 1: Persist API keys on the Clash server
- **Description**: Encrypt user keys in the server database and run background
  eToro polling.
- **Pros**: Rewards can refresh without the browser being open.
- **Cons**: Expands breach impact, key rotation burden, and operational access to
  trading credentials.
- **Rejection Reason**: Browser-scoped credentials meet the product requirement
  while materially reducing custody and secret-management risk.

### Alternative 2: Wait for eToro OAuth approval
- **Description**: Ship only after registering Clash and receiving OAuth client
  credentials.
- **Pros**: One-click multi-user connection and formal app attribution.
- **Cons**: Blocks the requested integration on an external approval with no
  known completion date.
- **Rejection Reason**: eToro officially supports API-key/user-key auth, so BYOK
  provides a functional first release and can later coexist with OAuth.

### Alternative 3: Model eToro instruments as perpetual futures
- **Description**: Add synthetic funding and perpetual labels to make eToro look
  identical to on-chain perp venues.
- **Pros**: Minimal UI wording changes.
- **Cons**: Financially inaccurate and could mislead users about settlement and
  carrying costs.
- **Rejection Reason**: The common UI can support leveraged direction and margin
  while clearly labelling eToro CFD/margin instruments and omitting funding.

## Consequences

### Positive
- eToro works without server-side secret persistence.
- Demo and Real routing is explicit and testable.
- Eligibility-driven validation prevents unsupported leverage or settlement
  assumptions.
- Existing reward, quest, and tournament infrastructure can consume eToro rows.
- OAuth can be added as another credential provider behind the same adapter.

### Negative
- The browser must be online with saved credentials to refresh rewards.
- BYOK setup is less convenient than OAuth.
- Current Clash attribution cannot be asserted in the eToro App Store or referral
  program.

### Risks
- **Upstream schema drift**: normalize documented aliases and cover canonical
  payloads with adapter contract tests.
- **Accidental Real order**: show the selected environment in setup and account
  UI, and route every operation from the stored environment.
- **Secret leakage**: never serialize credentials into responses, database proof
  JSON, telemetry, or errors.
- **Reward duplication**: use stable environment + position id keys and verified
  upserts.

## Performance Implications
- **CPU**: Negligible normalization and SHA-256 fingerprint work.
- **Memory**: Small per-credential market cache with bounded TTL.
- **Load Time**: Initial setup requires market search, eligibility, portfolio,
  and rates; subsequent reads reuse a five-minute market cache.
- **Network**: One normalized account snapshot per visible refresh; request count
  remains within eToro rate limits and 429 responses preserve retry guidance.

## Migration Plan
1. Add `etoro` to DEX registration, reward, task, tournament, and telemetry lists.
2. Deploy the adapter and dedicated routes.
3. Deploy the encrypted credential hook, setup gate, logo, chart, history, and
   account controls.
4. When eToro approves the Clash app, add OAuth token acquisition as an alternate
   credential provider without changing normalized trading interfaces.

## Validation Criteria
- Contract tests cover Real/Demo paths, authentication headers, eligibility
  filtering, market/limit payloads, close/cancel/TP-SL, normalization, redaction,
  and reward deduplication.
- Web build and focused client tests pass.
- Local HTTP smoke tests prove auth gates and sanitized errors.
- Production health, asset, config, and unauthenticated route checks pass after
  deployment.

## Related Decisions
- [ADR-0018: Bulk Browser Signing and Builder Attribution](./adr-0018-bulk-browser-signing-and-builder-attribution.md)
- [ADR-0030: DomFi Self-Custody Referral Trading](./adr-0030-domfi-self-custody-referral-trading.md)
