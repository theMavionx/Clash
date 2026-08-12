# ADR-0021: LeverUp V2 Browser One-Click Trading

## Status
Accepted

## Date
2026-08-12

## Context

### Problem Statement

Clash needs a native LeverUp integration using the current V2 gasless intent
protocol on Monad mainnet. LeverUp V2 is not a bearer-token API: the trader
authorizes a separate agent key once onchain, then that key signs EIP-712 trade
intents which the LeverUp relayer submits. LeverUp also attributes fees through
a numeric broker ID, but Clash has not received its broker ID yet.

### Constraints

- LeverUp V2 runs on Monad mainnet (`chainId: 143`) and verifies intents
  against the LeverUp Diamond.
- The browser agent private key must never leave wallet-scoped local storage.
- Intent nonces are monotonic millisecond values and must be serialized as
  decimal strings.
- The relayer selects short-lived oracle data itself, but anti-DDoS fee-token
  configuration changes over time and must be refreshed.
- A nonzero, unverified broker ID can silently break order execution; broker
  `0` means LeverUp's default broker, not “no broker”.
- The browser is not trusted to invent or replace a future Clash broker ID.

### Requirements

- Support public markets and prices, wallet balance, open positions, limit and
  decrease orders, trade history, market/limit open, close/partial close,
  cancel, embedded TP/SL and standalone TP/SL through V2 intents.
- Verify the stored browser signer against `getAgentAuth` before showing 1CT as
  enabled or allowing it to sign an intent.
- Keep the signer key recoverable per connected wallet and Monad deployment,
  and revoke onchain before deleting it.
- Make the future Clash broker ID server-configurable and validate it onchain
  before returning it as active.
- Do not credit LeverUp tournament volume, gold, or earnings until the broker
  is configured and the relevant order/fill can be proven to carry it.

## Decision

Clash uses LeverUp V2's browser-agent integration. A random secp256k1 key is
generated locally and stored under a versioned key containing the trader
address, chain ID, and Diamond address. The trader authorizes the official
`uint256.max` wildcard permission with one Monad transaction, matching the V2
reference client. Verification also accepts an existing authorization whose
explicit bits 0-13 are all present, so previously authorized agents remain
usable.

The React hook performs EIP-712 signing locally. The Clash futures server
proxies public LeverUp REST reads and signed intent submission, but never
receives the agent private key. Before forwarding an intent it validates the
envelope, action, trader, deadline, nonce and action-data shape. When a Clash
broker is active it also decodes every fee-bearing action and rejects a broker
value that differs from the trusted configuration.

`LEVERUP_BROKER_ID` is optional. With no configured ID, ordinary trading uses
broker `0` and the UI reports broker rewards as pending configuration. When an
ID is supplied, the server reads `getBrokerById` from the documented Diamond
and activates it only when the returned receiver is nonzero and the record
matches the requested ID. `extraFee` remains exactly zero unless the owner
later approves a separate decision.

### Architecture Diagram

```text
Trader wallet -- authorizeAgent --> LeverUp Diamond (Monad 143)
      |
      +-- wallet-scoped browser agent key
                    |
                    +-- EIP-712 V2 intent signature
                                  |
                                  v
                     Clash futures validation proxy
                       | public REST        | signed envelope only
                       v                    v
                LeverUp service      LeverUp V2 relayer
                                           |
                                           v
                                  LeverUp Diamond settlement
```

### Key Interfaces

- `GET /api/futures/leverup/config|fee-config`
- `GET /api/futures/markets|prices?dex=leverup`
- `GET /api/futures/leverup/account|positions|orders?dex=leverup&address=...`
- `GET /api/futures/leverup/history?dex=leverup&account=...`
- `POST /api/futures/leverup/intents`
- `GET /api/futures/leverup/intents/:intentHash`
- Browser library for V2 action-data encoding, EIP-712 signing, signer storage,
  authorization reads, fee selection, and status polling.

## Alternatives Considered

### Alternative 1: Direct Onchain Trading From the Owner Wallet

- **Description**: Use LeverUp's direct trading ABI for every action.
- **Pros**: No local agent key and no relayer dependency.
- **Cons**: Every trade prompts the owner wallet, needs fresh oracle payloads,
  and pays gas; it does not deliver the requested one-tap experience.
- **Rejection Reason**: LeverUp V2 explicitly provides a safer delegated flow
  for browser one-tap trading.

### Alternative 2: Store User Agent Keys on the Clash Server

- **Description**: Upload browser agent private keys for server-side signing.
- **Pros**: Easy background trading and centralized recovery.
- **Cons**: Creates a custodial database of reusable trading credentials and a
  much larger compromise blast radius.
- **Rejection Reason**: Manual browser trading does not require server custody.

### Alternative 3: Guess or Hardcode the Future Broker ID

- **Description**: Put a placeholder nonzero broker on every action.
- **Pros**: No later configuration change.
- **Cons**: The wrong broker may reject or misattribute real trades.
- **Rejection Reason**: Fee attribution must fail closed and be verifiable.

## Consequences

### Positive

- After one authorization transaction, normal trading is gasless and does not
  prompt the owner wallet.
- The browser signer cannot transfer wallet assets outside its granted V2
  action permissions.
- Clash can add the issued broker ID later without rebuilding signing logic.
- Broker attribution is enforced on all fee-bearing action paths, including
  closes and standalone TP/SL orders.

### Negative

- Clearing browser storage requires authorizing a new agent.
- Passive account reads are eventually consistent because some data comes from
  LeverUp's indexer.
- Background/MM bots are not enabled by this browser-only key design.
- The official wildcard permission automatically covers protocol actions that
  LeverUp may append later; Clash must still add and validate each new action
  before its UI can submit it.

### Risks

- **Stale fee configuration**: refresh every 60 seconds and select only a token
  with sufficient cached balance and allowance.
- **Stale or replaced signer**: compare the local agent to `getAgentAuth` before
  every signed mutation and show OFF on mismatch.
- **Indexer lag after opens**: retry position-dependent actions only while the
  newly opened position is not yet visible.
- **False reward attribution**: keep LeverUp rewards disabled until a verified
  broker ID and proof importer are both active.

## Performance Implications

- **CPU**: Small local ABI encoding and EIP-712 signing cost.
- **Memory**: Bounded market, fee-config, and account caches.
- **Load Time**: One lazy hook and a small local SVG mark.
- **Network**: Cached public reads plus one relayer submit and short status poll
  per mutation.
- **Brand asset**: The venue tile uses LeverUp's official application favicon
  from `https://app.leverup.xyz/favicon.svg`, without redrawing the mark.

## Migration Plan

1. Ship the V2 client, futures adapter/routes, React hook, setup gate, venue
   metadata, and normalized account/history UI.
2. Validate live public reads and dry-run intent construction while broker
   status is `pending_configuration`.
3. Receive the assigned LeverUp broker ID and expected receiver.
4. Configure `LEVERUP_BROKER_ID`, verify `getBrokerById`, and execute one small
   owner-authorized trade.
5. Add proof-backed rewards/earnings import only after the broker event/index
   source is confirmed.

## Validation Criteria

- Live markets/prices normalize correctly from official REST endpoints.
- The 14 V2 action payloads match the official reference client byte-for-byte.
- A stale or externally replaced agent cannot sign and the UI remains OFF.
- `authorizeAgent` grants the official wildcard permission and setup becomes
  ON only after the receipt and `getAgentAuth` verification.
- Every submitted nonce is a string and strictly monotonic.
- Market/limit, cancel, close, partial close and TP/SL dry-run envelopes pass
  focused schema tests without owner signatures.
- No LeverUp reward is credited while the Clash broker is unconfigured.

## Related Decisions

- [ADR-0004: Builder-Aware Decibel Trading MCP](./adr-0004-builder-aware-decibel-trading-mcp.md)
- [ADR-0018: Bulk Browser Signing and Builder Attribution](./adr-0018-bulk-browser-signing-and-builder-attribution.md)
- [ADR-0020: Ondo SIWE Trading and Server Builder Routing](./adr-0020-ondo-siwe-trading-and-server-builder-routing.md)
