# ADR-0030: DomFi Self-Custody Referral Trading

## Status

Accepted

## Date

2026-08-27

## Context

### Problem Statement

Clash must add Domination Finance (DomFi) as a complete Base trading venue,
preserve any referral a wallet already has, attach referral code
`CLASHOFPERPS` to the first eligible open for an unbound wallet, and make
positions, orders, charts, history, rewards, and tournaments behave like the
other self-custody exchanges.

### Constraints

- DomFi trades are signed by the user's Base wallet; Clash must not custody a
  private key or relay unsigned client claims as verified fills.
- Referral binding is permanent and occurs through a 20-byte calldata trailer
  on the first market/limit/stop open, not through an ordinary contract
  argument or query parameter.
- A wallet already bound to any referral must remain unchanged and must not be
  prompted to replace it.
- DomFi charges the per-action oracle fee in Base USDC through
  `transferFrom`, despite the legacy API field name `oracle_fee_wei`.
- `@domfi/sdk@0.2.3` declares `viem ^2.52.2`, while the Clash browser and
  futures server intentionally pin `viem 2.45.3` because Nado pins that exact
  version.
- The DomFi REST schema and market list are live protocol data and can expand
  without a Clash release.

### Requirements

- Discover and normalize all active DomFi dominance markets dynamically.
- Read account positions, pending trigger orders, trade history, referral
  binding, wallet USDC, and prices without requiring server-held credentials.
- Support wallet-signed market and trigger opens, closes, cancels, and TP/SL.
- Attach the verified Clash referral only when the wallet has no binding.
- Use DomFi's own candles for dominance assets instead of unrelated Pyth
  crypto spot feeds.
- Import only DomFi API-backed wallet history into reward and tournament
  accounting.
- Keep referral revenue analytics explicitly estimated unless DomFi supplies
  an exact cumulative claim source for the code-owner wallet.

## Decision

Implement DomFi as a dedicated self-custody adapter on Base:

1. `server-futures/domfi.js` owns all public DomFi REST reads, normalizes
   market/account/history shapes, caches only bounded public snapshots, and
   imports wallet-scoped API history as `verified_source='domfi_api'`.
2. The browser uses the existing, pinned `viem 2.45.3` primitives and a small
   audited DomFi ABI surface. It reproduces the official SDK's fixed-point
   units and referral-trailer wire format without force-installing an
   incompatible peer dependency.
3. Before every open, the browser re-reads referral status. If a binding
   exists, it sends ordinary calldata and preserves that binding. If no
   binding exists, it appends the 20-byte `DMFR` v1 trailer containing the
   server-verified numeric ID of `CLASHOFPERPS` and CRC32C checksum.
4. Collateral approval targets DomFi TradingStorage and includes collateral
   plus the current market oracle fee. Close operations also verify that the
   remaining allowance/balance can pay the oracle fee.
5. Markets, prices, candles, positions, orders, and history remain dynamic;
   contract addresses are additionally checked against the approved Base
   deployment before writes.

### Architecture Diagram

```text
DomFi REST API ----> futures adapter ----> Clash-normalized reads
      |                     |
      |                     +----> domfi_api verified history
      |                                   |
      +--> referral lookup/binding         +--> rewards/tournaments
                    |
Browser Base wallet +--> encode audited call + optional DMFR trailer
                                      |
                                      +--> user signs --> DomFi contracts
```

### Key Interfaces

- `GET /api/futures/markets?dex=domfi`
- `GET /api/futures/prices?dex=domfi`
- `GET /api/futures/candles?dex=domfi&symbol=BTCDOM&...`
- `GET /api/futures/positions?dex=domfi&address=0x...`
- `GET /api/futures/orders?dex=domfi&address=0x...`
- `GET /api/futures/domfi/config`
- `GET /api/futures/domfi/referral?address=0x...`
- `GET /api/futures/domfi/account-snapshot?address=0x...`
- `GET /api/futures/domfi/trade-history?address=0x...`

## Alternatives Considered

### Alternative 1: Force-Install the Official SDK

- **Description**: Install `@domfi/sdk` with npm's peer-dependency checks
  disabled.
- **Pros**: Less local transaction-encoding code.
- **Cons**: Runs an SDK tested against a newer `viem` beside Nado's exact
  older pin and hides the incompatibility from the lockfile solver.
- **Rejection Reason**: A financial write path must not rely on a forced,
  unresolved peer graph.

### Alternative 2: Upgrade the Shared `viem`

- **Description**: Move the entire browser/server graph to `viem 2.52.2`.
- **Pros**: Satisfies DomFi's declared peer range.
- **Cons**: Breaks Nado's exact dependency contract and expands this exchange
  integration into a cross-DEX migration.
- **Rejection Reason**: The change would put existing working venues at risk.

### Alternative 3: Open the DomFi Referral Site Externally

- **Description**: Add only a logo/link and let DomFi's site handle trading.
- **Pros**: Minimal code.
- **Cons**: No in-Clash positions, orders, risk controls, charts, rewards, or
  tournaments; it does not meet the requested parity with other exchanges.
- **Rejection Reason**: This is not a full exchange integration.

## Consequences

### Positive

- Existing wallet referrals are preserved automatically.
- Unbound wallets attach the verified Clash code without an extra referral
  transaction or misleading prompt.
- Clash keeps its stable shared `viem` version and Nado integration.
- New DomFi markets appear automatically.

### Negative

- Clash owns a small audited subset of DomFi's wire encoding and must compare
  it against new SDK releases.
- Direct wallet trading uses one signature per action; DomFi delegation and
  EIP-7702 batching are intentionally outside this first integration.

### Risks

- **Protocol/schema upgrade**: write preparation fails closed when deployment
  addresses or API readiness do not match the approved configuration.
- **Referral trailer drift**: deterministic unit tests compare the 20-byte
  trailer structure and CRC32C checksum against the official v1 format.
- **Stale public reads**: short-lived cached reads are marked stale and never
  used to invent a successful write.
- **Client reward inflation**: browser trade payloads are not reward proof;
  the server imports DomFi's wallet-scoped account history.
- **Referral revenue reporting**: verified DomFi volume uses the documented
  0.25-0.5 bps referrer-share range; the midpoint is labelled as an estimate
  and is never added to exact earned revenue.

## Performance Implications

- **CPU**: Negligible normalization and CRC32C encoding.
- **Memory**: Bounded public market, market-state, and price snapshots.
- **Load Time**: No new npm runtime dependency or duplicate `viem` bundle.
- **Network**: One shared market/price poll and wallet-scoped account reads;
  referral status is checked before opens only.

## Migration Plan

1. Add the read adapter and verify live status, markets, prices, candles, and
   referral code resolution.
2. Add browser wallet writes and deterministic calldata/referral tests.
3. Register DomFi across the DEX picker, wallet routing, tournaments, reward
   reconciliation, telemetry, and admin filters.
4. Run local server/browser smoke tests and production builds.
5. Deploy only after explicit owner authorization, then run read-only
   production health checks; a funded trade requires separate authorization.

## Validation Criteria

- Live API reports ready and returns at least one active market and price.
- `CLASHOFPERPS` resolves to a numeric referral ID and an empty wallet binding
  returns `attach_on_next_open=true`.
- Referral trailer is exactly 20 bytes, starts with `DMFR`, carries uint64 ID
  in big-endian order, and has a valid CRC32C checksum.
- Market/limit open calldata decodes to the expected DomFi `openTrade` tuple;
  only an unbound open has a trailer.
- Position/order/history fixtures normalize protocol P6/P18/P2 units exactly.
- Existing DEX tests and the production web build remain green.
- A verified DomFi fill advances Gold, trade-volume quests, tournament
  participant totals, and daily-pool activity in one atomic claim flow.

## Related Decisions

- [ADR-0021: LeverUp V2 Browser One-Click Trading](./adr-0021-leverup-v2-browser-one-click-trading.md)
- [ADR-0024: GMX UI Fee Routing and Attribution](./adr-0024-gmx-ui-fee-routing-and-attribution.md)
- [ADR-0028: LeverUp Broker Activation and Earnings](./adr-0028-leverup-broker-activation-and-earnings.md)
