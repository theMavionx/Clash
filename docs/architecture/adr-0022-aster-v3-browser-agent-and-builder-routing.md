# ADR-0022: Aster V3 browser agent and builder routing

- **Status:** Accepted
- **Date:** 2026-08-12
- **Decision owners:** Clash of Perps

## Context

Aster supports programmatic perpetual trading through its Futures API V3. V3 uses an EIP-712 API Wallet (Agent): the user's main wallet approves an agent once, then the agent signs account reads and orders. Aster Code attribution additionally requires the user to approve a builder wallet and each attributed order to include `builder` and `feeRate`.

The Clash browser must remain self-custodial, support one-tap trading, and must not silently route un-attributed opening volume while the Clash builder wallet is still pending.

## Decision

1. Integrate only Aster Futures API **V3** at `https://fapi.asterdex.com`; V1 is not used.
2. Generate one random EVM Agent per owner wallet in the browser and store it in wallet-scoped local storage. The private key is never uploaded to Clash.
3. The owner signs Aster's official dynamic EIP-712 `ApproveAgent` payload using the Aster Code management domain (`signatureChainId=56`). Subsequent V3 requests use the fixed `Message(msg)` EIP-712 payload on domain chain ID 1666, signed by the local Agent. These signature modes must not be conflated.
4. Clash proxies allow-listed, already-signed V3 requests to avoid browser CORS differences. The proxy validates the linked owner, endpoint, method, signer shape, payload size, and builder invariants; it cannot initiate an unsigned action.
5. Builder configuration is server-owned through `ASTER_BUILDER_ADDRESS` and `ASTER_BUILDER_FEE_RATE`. Clash uses `0.0001`, which is Aster's decimal representation of the approved commercial rate of **1 basis point**. New/opening orders fail closed until this exact address and fee cap are configured and approved. Risk-reducing close and cancel actions remain available.
6. Agent approval includes builder approval when configured. Existing agents can approve the builder separately via `approveBuilder`.
7. Public markets, prices, depth, and candles are read through cached Clash adapters. Account, position, order, leverage, trade-history, close, cancel, and TP/SL requests are signed by the Agent.
8. Aster is not added to Clash rewards, tournaments, or builder-earnings accounting until the builder wallet is provided and live builder-trade attribution is proven.

## Alternatives considered

### Store Agent keys on the Clash backend

This follows Aster's builder-backend example, but would make Clash custodial for the delegated trading key and expand the production secret/incident surface. Rejected for the browser trading flow.

### Ask the owner wallet to sign every request

This avoids a stored Agent key but removes one-tap trading and conflicts with Aster's intended V3 Agent model. Rejected.

### Allow unattributed orders until the builder address arrives

This would make the UI appear complete while permanently losing builder attribution for those fills. Rejected; openings fail closed instead.

### Use Aster V1/HMAC API keys

V1 is legacy and Aster directs new integrations to V3. Rejected.

## Consequences

- Users sign once for an Agent (and builder approval when available), then trade without repeated wallet prompts.
- Clearing browser storage loses the Agent key; the user can approve a new Agent without exposing the old key.
- The server does not hold trading keys, but it must preserve signed parameter ordering exactly.
- The exchange appears in the UI before builder configuration, while opening trades clearly remain disabled.
- A later production configuration change is small: provide the registered Aster builder wallet and verify an attributed live fill before enabling rewards/earnings.

## References

- https://github.com/asterdex/api-docs
- https://asterdex.github.io/aster-api-website/asterCode/integration-flow/
- https://asterdex.github.io/aster-api-website/asterCode/authentication/
- https://asterdex.github.io/aster-api-website/asterCode/endpoints/
- https://docs.asterdex.com/program-and-rewards/aster-code
