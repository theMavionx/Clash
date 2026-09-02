# ADR-0035: Imperial Router as a First-Class Execution Venue with Routed Leverage Boost

## Status

Accepted

## Date

2026-09-02

## Context

### Problem Statement

Clash already integrates several venues that Imperial can route to directly,
including Phoenix, Flash Trade and GMTrade. Imperial is not another order book:
it is a Solana passthrough and routing layer that chooses an underlying venue,
maintains Imperial profiles, exposes unified positions/history, and can attach
Imperial Lending Pool collateral so a user reaches a higher effective leverage
than the selected venue receives natively.

The owner wants to evaluate both of these product shapes:

1. Imperial as a separate selectable perp integration.
2. Imperial as a leverage-boost option inside Clash's existing venue screens.

Imperial also has distinct partner and builder-code mechanisms. The partner code
binds a wallet once, enables a discounted fee tier and attributes volume. The
builder code is attached to each order and charges a fixed extra fee on both open
and close. Clash needs exact attribution without letting the browser remove or
replace the configured builder code.

Official references:

- [Imperial Trading API OpenAPI](https://api.imperial.space/api/v1/openapi.json)
- [Imperial trader mechanics](https://docs.imperial.space/user-workflows/traders)
- [Imperial risk model](https://docs.imperial.space/risk-model)
- [Imperial product overview](https://app.imperial.space/about)

### Constraints

- Imperial is Solana-native and uses six isolated profile/subaccounts per wallet.
- Private trading uses a JWT obtained from a fresh Solana-signed connect message.
  Holding the JWT grants order authority for the wallet's Imperial profiles and
  therefore requires the same treatment as an exchange API key.
- Partner registration is first-code-wins and should happen before the first
  Imperial order. Existing partner attribution must not be overwritten.
- The `CLASH` builder code is registered and active as `Clash of Perps` with a
  10 bps fee. The server verifies that live state before accepting every new
  Imperial order and persists the observed fee in its immutable order proof.
- The official OpenAPI currently documents builder codes and reports ILP-backed
  lifecycle fields, but omits `loanSplit` from the `RouteResult` schema and
  `loanAmountUsd` from `MobileCreateOrderRequest`. The live `/route` response and
  official web client use those fields. Boost must remain feature-gated until
  Imperial confirms this contract as supported for third-party integrators.
- An Imperial-routed Phoenix, Flash or GMTrade position is not the same account or
  lifecycle as a position opened through Clash's direct venue adapter. An existing
  direct position cannot be retroactively boosted; it must be closed and reopened
  through Imperial.
- Boosted positions have an Imperial loan obligation, loan interest and an
  Imperial-controlled protection/liquidation threshold that can be tighter than
  the underlying venue's liquidation price.
- Imperial's dynamic venue availability, leverage caps, liquidity, funding,
  lending capacity and route costs can change between preview and submission.
- The integration must preserve existing direct Phoenix, Flash and GMTrade paths,
  reward accounting, tournament accounting and self-custody guarantees.
- Live trade validation requires separate owner approval; architecture and local
  contract tests must not place funded orders.

### Requirements

- Expose Imperial as a clear routing product without representing it as a new
  underlying order book.
- Support market data, route previews, profiles, balances, deposit/withdraw,
  positions, orders, history, market/limit orders, cancel, partial/full close,
  TP/SL and Imperial advanced order types in staged releases.
- Show the actual underlying venue on every preview, position, order and history
  row.
- Show effective leverage separately from venue leverage, owned collateral,
  borrowed collateral, loan APR and Imperial liquidation/protection price.
- Apply the partner code once when eligible and inject the builder code on the
  trusted server for every eligible open and close order.
- Credit game rewards and tournament volume only from settled Imperial action
  records matched to server-persisted order proofs.
- Never double count the same Imperial-routed action as both `imperial` and the
  underlying `phoenix`, `flash` or `gmtrade` DEX.
- Fail closed when builder configuration, wallet binding, route freshness,
  profile funding or loan terms cannot be verified.

## Decision

Add **Imperial Router** as a first-class Clash execution provider and DEX selector
entry. The default Imperial experience is `Smart route`; an advanced control may
pin the underlying venue. Add `Imperial Boost` inside the Imperial screen as an
explicit leverage mode, not as a transparent modifier on direct DEX positions.

Before wiring the new provider through the panel, replace the relevant repeated
`dex === ...` feature lists with an adapter/capabilities registry for wallet kind,
history, funding, order book, deposit, TP/SL and reward source. The current selector
in `FuturesPanel` and separate supported-DEX arrays in both servers make a partial
integration easy: a tile can render while history, tournaments or claim-gold still
omit it. Imperial should be the first adapter added through the registry, while
unchanged venue behavior remains covered by regression tests.

Do not add a boost toggle directly to the current Phoenix, Flash and GMTrade
adapters in phase one. A later shortcut may say `Route via Imperial` from those
screens, but activating it must visibly switch the execution provider, balance,
position namespace and history to Imperial before the order is confirmed.

### Architecture Diagram

```text
Solana wallet
    |
    | signed imperial:mobile-connect message
    v
Clash futures server -------------------------> Imperial auth/exchange
    |                                                |
    | encrypted, player-scoped JWT                   |
    | partner registration status                    |
    v                                                |
Imperial adapter                                    |
    |                                                |
    +-- public market WS/cache                       |
    +-- GET /route(asset, side, notional, leverage) |
    |       -> venue + costs + optional loanSplit   |
    +-- POST /orders/preflight                       |
    +-- strip client builderCode                     |
    +-- inject server CLASH builderCode ------------>+--> Imperial passthrough
                                                             |
                           +---------------------------------+------------------+
                           |                 |               |                  |
                        Phoenix          Flash Trade      GMTrade           Jupiter/...

Imperial /trades actions + server order proofs
    -> deduplicated imperial trade_history rows
    -> gold, quests, tournaments and builder/revenue reporting
```

### Key Interfaces

#### Browser adapter

Add `useImperial()` with the same normalized interface currently consumed by
`FuturesPanel`: account, profiles, balances, markets, prices, positions, orders,
history, deposit, withdraw, open, close, cancel and TP/SL.

The UI should expose these Imperial-specific fields rather than folding them into
the existing generic leverage number:

- `executionProvider = imperial`
- `underlyingVenue`
- `effectiveLeverageX`
- `baseLeverageX` or `venueLeverageX`
- `ownedCollateralUsd`
- `borrowedCollateralUsd`
- `loanRateBps`
- `ourLiquidationPriceUsd`
- `routeExpectedCostUsd`
- `routeRequiredDepositUsd`

`ourLiquidationPriceUsd` takes display and risk-warning precedence over the
underlying venue liquidation price on an ILP-backed position.

#### Server adapter

Add a dedicated `server-futures/imperial.js` client and `/imperial/*` routes.
Public reads should use bounded caches and Imperial's market WebSocket. Private
routes must resolve the authenticated Clash player, verify the registered Solana
wallet, obtain the player-scoped Imperial credential through ADR-0034, and never
accept an arbitrary wallet or Imperial JWT from another player.

Order flow:

1. Compute the route with wallet, profile, symbol, side, notional, target leverage
   and expected hold time.
2. Display route, required deposit, all upfront fees, projected loan cost and the
   underlying venue.
3. Recompute the route server-side at confirmation.
4. Preflight the exact order. Treat `ok: false` as a valid rejection, not a server
   error.
5. Remove all client-supplied partner/builder fields.
6. Inject the configured builder code and the validated route/underwriter.
7. Submit the order and inspect body `success`; Imperial uses HTTP 200 for valid
   requests rejected by the venue.
8. Persist wallet, profile, request ID, returned signature/order PDA, builder code,
   underlying venue and requested notional as an immutable attribution proof.
9. On close/reduce/cancel, derive profile and underwriter from the authoritative
   Imperial lifecycle/order. Never reroute an existing position's closing leg.

For entry plus attached TP/SL, preflight the entry and use Imperial's native batch
route. The endpoint is explicitly sequential, not atomic: an entry failure skips
all close legs, while a close-leg failure does not roll back a successful entry.
Surface that state as partial success, refresh the live position immediately and
tell the user to add protection again. Never claim or attempt an automatic unwind
without a separately quoted and authorized close.

#### Partner and builder configuration

Use distinct server settings even if Imperial assigns the same visible string:

- `IMPERIAL_PARTNER_CODE=CLASH`
- `IMPERIAL_BUILDER_CODE=CLASH`
- `IMPERIAL_REQUIRE_BUILDER_ACTIVE=true` (default; fail closed while the code is
  unknown or inactive)
- `IMPERIAL_API_URL=https://api.imperial.space/api/v1`
- `IMPERIAL_TIMEOUT_MS=12000`

The builder fee is read from Imperial's authoritative builder summary and copied
into each local execution proof; it is not trusted from an environment variable
or browser payload. Boost is an explicit per-order user choice. Its loan amount
is always recomputed from the fresh server-side route and never accepted from
the client.

On onboarding, call partner registration only when the wallet has no partner.
Accept an existing different partner without rewriting it, but label that wallet
as not partner-attributed. Builder routing remains per-order and must be separately
verified.

Clash calls the builder-summary endpoint only from the server. The trading UI
receives code/active status needed for its fail-closed gate; aggregate fee and
revenue reporting remains in the admin earnings surface.

#### Funding and profiles

Expose Imperial profiles `0..5` and keep the selected profile explicit on every
private request. Do not silently move an existing position between profiles or
underwriters. Isolated/unified mode changes use Imperial's authenticated profile
endpoint and existing positions always retain their authoritative venue/mode.

Use `RouteResult.fundingModel` and `requiredDeposit` as the authority:

- `self_funding`: follow Imperial's supported wallet-funded open flow.
- `prefund_v2`: deposit into the Imperial profile before the order.

Do not size funding from `expectedCostUsd`; it includes expected lifecycle costs
that are not necessarily reserved at open. Funds deposited to an Imperial profile
are separate from collateral held in Clash's direct venue accounts.

#### Rewards, quests and tournaments

Import `/trades` lifecycle actions, not top-level lifecycle totals. Create one
`trade_history` row per settled increase/decrease/liquidation action, keyed by a
stable composite such as:

```text
imperial:{wallet}:{profileIndex}:{lifecycleId}:{actionId}
```

Use the action's `sizeDelta` or `orderSizeUsd` as the executed notional after
normalization, and the action timestamps for daily tournament attribution. Match
`tx1Signature`/action identity to the server order-proof ledger before using the
row for builder-attributed rewards. Record:

- `dex = imperial`
- `verified_source = imperial_api`
- `underlying_venue` in proof metadata
- builder code and server order-proof ID in proof metadata

Imperial-routed actions must be excluded from direct Phoenix/Flash/GMTrade reward
workers even though those venues executed the underlying trade. This prevents
double volume, double gold and double tournament points.

The builder summary is suitable for aggregate revenue reconciliation, not
per-player volume attribution. Per-player accounting must remain action- and
proof-based.

## Alternatives Considered

### Alternative 1: Imperial only as another standalone DEX

- **Description**: Add an Imperial tile and normalized adapter, but expose no ILP
  boost controls.
- **Pros**: Lowest product and risk complexity; clean balance and history boundary;
  smart routing still adds value.
- **Cons**: Hides Imperial's most differentiated leverage product.
- **Rejection Reason**: Good first milestone, but incomplete as the final product.

### Alternative 2: Add `Imperial Boost` directly to every existing DEX adapter

- **Description**: Keep users on the Phoenix/Flash/GMTrade pages and add a toggle
  next to their direct leverage controls.
- **Pros**: Highly visible and feels like a small feature.
- **Cons**: Misrepresents the execution account; direct balances and positions are
  not Imperial profiles, existing positions cannot be boosted, closes cannot be
  freely rerouted, and history/reward attribution becomes ambiguous.
- **Rejection Reason**: Unsafe and misleading unless the UI explicitly changes the
  execution provider. It is not a true modifier on existing direct positions.

### Alternative 3: Replace direct Phoenix, Flash and GMTrade integrations with Imperial

- **Description**: Route all supported Solana perp trades through Imperial.
- **Pros**: One auth, order and history surface; much less venue-specific code over
  time; automatic best execution and builder fees.
- **Cons**: Breaks current direct accounts, referrals, balances, one-tap flows and
  reward sources; makes Imperial a single operational dependency; some direct
  venue features do not map one-to-one.
- **Rejection Reason**: Too disruptive. Existing direct integrations should remain
  available and can be evaluated for deprecation only after production evidence.

### Alternative 4: Separate Imperial Router plus explicit routed boost

- **Description**: Add Imperial as a first-class provider with Smart Route and
  optional ILP boost; later add clearly labeled shortcuts from direct venue pages.
- **Pros**: Honest account boundary, full builder attribution, differentiated UX,
  minimal risk to existing venues, and a path to measure whether routing should
  become the default.
- **Cons**: Adds one more selector entry and temporarily keeps both direct and
  routed implementations.
- **Decision**: Selected.

## Consequences

### Positive

- Clash gains best-execution routing, wider combined market coverage and Imperial
  leverage boost without breaking existing accounts.
- The `CLASH` builder fee is enforced on the server and can be reconciled against
  Imperial's payout summary.
- Unified Imperial history provides a cleaner source for router positions than
  scraping each underlying venue separately.
- Explicit execution-provider labels make game rewards and tournament accounting
  auditable.

### Negative

- Users may hold both direct venue balances and Imperial profile balances.
- Clash must maintain Imperial auth/JWT lifecycle and an additional proof/reward
  importer.
- The generic trading UI needs first-class support for routed venue and two
  leverage values instead of treating every provider as one native DEX.
- Builder revenue applies on open and close and increases user cost; the exact fee
  must be disclosed before confirmation.

### Risks

- **Undocumented ILP request fields**: obtain written partner confirmation and
  contract fixtures before enabling boost; default the flag off.
- **Stale route**: recompute and preflight at confirmation; show the final venue,
  leverage and deposit if they changed.
- **Sequential batch partial success**: inspect every entry and close-leg result;
  expose failed protection orders explicitly and refresh the resulting position.
- **JWT theft**: keep it encrypted in the accepted credential vault, never log it,
  bind every private call to the player and wallet, and expose revocation.
- **Builder code tampering**: inject only on the server and persist the exact order
  proof.
- **Partner-code conflict**: honor first-code-wins and never block position closing
  or risk controls because attribution is missing.
- **Double-counted volume**: identify router-originated actions by Imperial action
  IDs/signatures and exclude them from direct venue importers.
- **Liquidation confusion**: use Imperial's protection price and show owned versus
  borrowed collateral; never display only the underlying venue's looser level.
- **Operational dependency**: health-check Imperial DB, indexer and order bot; keep
  direct venues available when the router is degraded.
- **Jurisdictional restrictions**: mirror Imperial's current production eligibility
  policy server-side and let Imperial's own controls remain authoritative.

## Performance Implications

- **CPU**: Low JSON normalization and proof matching; no local routing optimizer is
  needed because Imperial returns costed candidates.
- **Memory**: Bounded market/mark caches and one encrypted credential plus profile
  metadata per connected player.
- **Load Time**: Lazy-load `useImperial`; use the market WebSocket after selection
  instead of polling all venue endpoints globally.
- **Network**: One server route preview and one preflight before each open; wallet
  state comes from Imperial user WebSocket with reconnect refetch. Respect the
  documented 600 requests/min sustained and 120 burst per wallet/IP budget.

## Migration Plan

1. Ask Imperial to register partner and builder codes for `CLASH`, confirm the
   fixed builder fee and payout wallet, and provide the supported ILP integrator
   contract/version.
2. Introduce the narrow adapter/capabilities registry needed to remove repeated
   Imperial-sensitive DEX lists, then add an Imperial contract client, snapshot
   tests against OpenAPI, health/config gates and public route/market reads without
   exposing it in the venue picker.
3. Add Solana auth, encrypted JWT persistence, partner registration and profile 0
   balance/deposit/withdraw flows.
4. Add non-boosted routed market open/close, positions, orders and history. Keep
   builder rewards disabled until a proof-linked test fill is verified.
5. Add reward/tournament import with action-level deduplication and direct-worker
   exclusion.
6. Enable the separate `Imperial Router` tile for a small owner-approved cohort.
7. Add `Imperial Boost` behind its own flag after loan fields, rate, cap and
   liquidation semantics are confirmed and tested.
8. After production telemetry, consider `Route via Imperial` shortcuts from direct
   venue screens; do not auto-migrate or silently reopen positions.

## Validation Criteria

- `CLASH` partner and builder status is verified against Imperial production and
  the expected fee matches the server configuration.
- A client cannot remove, replace or alter the builder code on open, close, TP/SL
  or batch legs.
- Wallet A's JWT cannot read or trade wallet B's profiles through Clash.
- Route refresh and preflight reject stale/unsupported leverage before placement.
- Non-boosted and boosted previews show underlying venue, venue leverage,
  effective leverage, owned/borrowed collateral, loan APR, required deposit and
  Imperial liquidation price correctly.
- Closing always targets the lifecycle's original profile and underwriter.
- A settled Imperial action creates exactly one reward row and is not imported by
  a direct underlying-venue worker.
- Positions, orders and history recover correctly after WebSocket reconnect.
- A degraded Imperial API hides/disables new Imperial opens while direct venues
  and all existing position risk controls remain usable.
- Local UI, server contract tests and an unfunded/preflight flow pass before any
  owner-authorized funded smoke trade.

## Related Decisions

- [ADR-0018: Bulk Browser Signing and Builder Attribution](adr-0018-bulk-browser-signing-and-builder-attribution.md)
- [ADR-0020: Ondo SIWE Trading and Server Builder Routing](adr-0020-ondo-siwe-trading-and-server-builder-routing.md)
- [ADR-0034: Player-scoped encrypted trading credential vault](adr-0034-server-trading-credential-vault.md)
