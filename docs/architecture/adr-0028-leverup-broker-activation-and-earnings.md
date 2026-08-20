# ADR-0028: LeverUp Broker Activation and Earnings

## Status
Accepted

## Date
2026-08-20

## Context

### Problem Statement

LeverUp has registered Clash Of Perps as broker `2` on Monad with receiver
`0xB36402e87a86206D3a114a98B53f31362291fe1B`. Clash must attach that numeric
ID to every fee-bearing LeverUp V2 action, prevent stale configuration from
redirecting attribution, and show the resulting aggregate commissions in the
admin earnings dashboard.

### Constraints

- LeverUp broker registration is permissioned and uses a `uint24` ID; the
  receiver wallet is not itself a broker ID.
- Broker `0` credits LeverUp's default broker rather than disabling referral.
- Open, close, partial close, batch close, and TP/SL create/update each carry
  their own broker field.
- `extraFee` is a separate user surcharge and is not required for the protocol
  fee share.
- The public broker record exposes aggregate lifetime and pending commissions,
  not per-user fill attribution.

### Requirements

- Route all fee-bearing V2 actions through broker `2` only while its on-chain
  receiver exactly matches the approved Clash wallet.
- Keep `extraFee` at zero.
- Fail closed to broker `0` if ID verification is unavailable or mismatched.
- Surface lifetime and withdrawable commissions per token in admin earnings.
- Keep tournament and player rewards disabled until a per-user proof source is
  implemented.

## Decision

Production forces `LEVERUP_BROKER_ID=2` and
`LEVERUP_BROKER_RECEIVER=0xB36402e87a86206D3a114a98B53f31362291fe1B`.
The futures adapter reads `getBrokerById(2)` from the official LeverUp Diamond
and activates attribution only when both the returned ID and receiver match.
The browser receives only this verified result; it cannot select another
broker. Server validation decodes each fee-bearing action and rejects any
broker value other than the verified ID. Open actions also reject every
non-zero `extraFee`.

The admin earnings reader reuses the same verified adapter record. It reports
the broker's per-token `total` (lifetime) and `pending` (withdrawable) values.
Known stablecoins are represented as USD at $1; unknown non-zero token balances
remain visible but are excluded from the USD total. Aggregate broker earnings
are operational revenue metrics only and are not player/tournament proof.

The registered `commissionP=5000` means Clash receives 50% of LeverUp's
existing protocol trade fee. It does not increase the fee paid by the trader.

### Architecture Diagram

```text
LeverUp Diamond getBrokerById(2)
             |
             +-- ID == 2 && receiver == approved wallet?
                         | yes                     | no/unavailable
                         v                         v
                 verified broker 2          fail closed broker 0
                         |
              +----------+-----------+
              |                      |
       V2 intent validation    Admin earnings reader
       open/close/TP-SL        total + pending/token
```

### Key Interfaces

- `LEVERUP_BROKER_ID=2`
- `LEVERUP_BROKER_RECEIVER=0xB36402e87a86206D3a114a98B53f31362291fe1B`
- `GET /api/futures/leverup/config`
- `POST /api/futures/leverup/intents`
- `GET /api/admin/earnings` and `GET /api/admin/earnings/leverup`

## Alternatives Considered

### Alternative 1: Use the Receiver Address as the Builder Code

- **Description**: Send the wallet address in LeverUp actions.
- **Pros**: Matches address-based integrations on some other exchanges.
- **Cons**: LeverUp action ABIs require a numeric `uint24` broker ID.
- **Rejection Reason**: The protocol would not attribute those actions to the
  registered Clash broker.

### Alternative 2: Trust Any On-Chain Record Returned for ID 2

- **Description**: Verify only that broker `2` exists and has a non-zero
  receiver.
- **Pros**: Less configuration.
- **Cons**: A reassigned or changed receiver could silently redirect revenue.
- **Rejection Reason**: Production attribution must match the owner-approved
  receiver exactly.

### Alternative 3: Add an `extraFee`

- **Description**: Charge a separate per-open surcharge in addition to the fee
  share.
- **Pros**: Additional revenue.
- **Cons**: Increases user cost and has different failure/allowance semantics.
- **Rejection Reason**: The owner requested builder-fee routing, and the issued
  broker already receives a protocol-fee share without charging users more.

## Consequences

### Positive

- Open, close, partial, batch-close and TP/SL fees are consistently attributed.
- A stale or malicious shared environment cannot redirect the approved broker
  receiver without producing an inactive configuration.
- Admins can monitor exact on-chain lifetime and withdrawable commissions.

### Negative

- A temporary Monad RPC outage disables Clash attribution for newly validated
  intents rather than guessing.
- Unknown commission tokens require explicit decimal/pricing support before
  inclusion in USD totals.

### Risks

- **Receiver changes at LeverUp**: verification fails closed and exposes a
  receiver-mismatch status until the owner approves a new address.
- **Dynamic ABI tuple corruption**: validation restores the removed trader ABI
  word before decoding and behaviorally tests batch TP/SL actions.
- **False player rewards**: aggregate commissions never enter tournament or
  Gold credit paths.

## Performance Implications

- **CPU**: Negligible ABI decoding and token formatting.
- **Memory**: One bounded broker record cache.
- **Load Time**: No client bundle dependency added.
- **Network**: One cached on-chain broker read; admin force-refresh performs a
  fresh read.

## Migration Plan

1. Force-align broker ID and receiver in the shared production environment.
2. Deploy receiver-aware broker verification and all-action validation tests.
3. Verify the production config returns broker `2`, receiver match, and
   `commissionP=5000` before considering attribution active.
4. Expose aggregate commissions in admin earnings.
5. Perform a separately owner-authorized small trade/close smoke when desired;
   no funded trade is part of the automated deployment.

## Validation Criteria

- Live `getBrokerById(2)` returns the approved receiver and 5000 share points.
- All seven fee-bearing V2 actions accept broker `2` and reject another ID.
- Receiver mismatch produces inactive broker `0` routing.
- `extraFee > 0` is rejected.
- Admin lifetime and pending amounts preserve token decimals and exclude
  unknown tokens from USD totals.
- Production health and public LeverUp config pass after deployment.

## Related Decisions

- [ADR-0021: LeverUp V2 Browser One-Click Trading](./adr-0021-leverup-v2-browser-one-click-trading.md)
- [ADR-0024: GMX UI Fee Routing and Attribution](./adr-0024-gmx-ui-fee-routing-and-attribution.md)
