# ADR-0037: BULK wallet-authorized one-tap trading

## Status

Accepted for local owner-requested implementation; production release and funded smoke require separate approval.

## Date

2026-09-06

## Context

### Problem Statement

The owner requested BULK one-tap trading and repair of the shared UI's broken market-close call. BULK supports a native registered Ed25519 agent distinct from the owner. The existing adapter assumed signer==account, so every action required a wallet popup.

### Constraints

- Preserve owner signing, explicit permission approval and builder fee policy.
- No live trading, permission changes or treasury operations as tests.
- Reuse ADR-0034's encrypted player-scoped server vault and local cache; never save the primary wallet secret.
- BULK registration has no configurable expiry field. Local pause is not protocol revocation.

### Requirements

One owner-approved registration, automatic browser signing for trade actions, explicit pause/revoke, cross-player/wallet/network isolation, encrypted recovery, native authorization verification, and exact reduce-only full/partial closes.

## Decision

Generate a 32-byte Ed25519 agent seed with browser CSPRNG. Persist it through the existing encrypted credential API before sending an owner-signed `agentWalletCreation {a,d:false}`. A pending/rejected/lost-response registration retains the same disabled key. Enabling verifies `authorizedAgentWallets` first and after registration; a successful HTTP submission alone is not proof of permission. Restoring an enabled key also verifies the current exchange grant.

The owner signs registration/revocation using BULK's documented single-owner-action Base58 compatibility path. Delegates sign canonical network-bound raw bytes. Clash verifies the signature against the distinct signer and performs a fresh native account authorization read before every delegated submit. BULK enforces authorization at execution too. No automatic retry of a trading submission or fallback resend is added.

Agent permissions through Clash are limited to the existing m/l/cx/cxa/st/tp/trl/leverage actions. Agent management and builder approval require the owner. Transfers and arbitrary actions are not accepted by this adapter. Native grants can trade the registered account (and BULK may inherit master grants to subaccounts); the UI must not imply that an agent is harmless or cannot cause trading losses.

Pause persists enabled=false and restores normal owner signing. Revoke first pauses, then requests a master-wallet removal signature and verifies absence. Retain the disabled recovery record rather than losing a key during an ambiguous revoke. Other keys are untouched.

The compact one-tap control opens the existing native top-layer dialog. The server advertises support, keeping new UI hidden against an old backend during rollout.

### Architecture Diagram

Owner wallet -> explicit BULK agent grant -> native grant verification

Player-scoped encrypted vault <-> browser agent -> signed restricted actions -> Clash signature/grant checks -> BULK execution

### Key Interfaces

- Credential: `clash_bulk_agent_v1:<network>:<owner>`; secretKey, publicKey, account, network, enabled, createdAt.
- `/bulk/prepare`: register_agent/revoke_agent with public agent key; optional signer on trade requests. No secret in either request.
- `/bulk/submit`: verifies signer, account and action permissions; owner-management cannot be delegated.
- Shared Close: symbol, open side, base amount, pair/index; normalized to opposite-side reduce-only market action, preserving isolated routing and eight-decimal wire precision.
- Signed-order proof: canonical signed action ID, never response-array position; retain verified signer/mode metadata for agent audits.

## Alternatives Considered

### Browser-only plaintext session key

Simple but inconsistent with the owner-requested vault, unsafe storage and poor recovery. Rejected.

### Server custodial execution of every order

Would suit unattended bots, but adds autonomous execution authority and a broader secret-using backend. Not part of one-tap UI; rejected for this change. Existing encrypted-at-rest server backup does not authorize bot execution.

## Consequences

### Positive

No per-order wallet popup after explicit approval; revocable native permissions; no new key-storage infrastructure; compatibility with owner signing retained.

### Negative

One extra read before delegated submission. Vault unlock may require a separate wallet proof. Permission indexing delays can leave setup pending. No native expiry guarantee.

### Risks

- A stolen agent can incur trading losses: explicit UI warning, encrypted storage, native revoke.
- Context switch during async setup/signing: vault epoch and current hook identity checks before signing/submitting/state writes; discard obsolete responses.
- Lost responses: retain the candidate key, verify before a user-requested retry; do not automatically resend trades.
- Counterparty statuses in order replies: correlate only canonical signed IDs, preserving account ownership gates. Existing erroneous production proofs require a separate audited repair.
- Vault encryption does not protect against an active same-origin compromise; existing CSP/session protections remain necessary.

## Performance Implications

- CPU/memory: one small Ed25519 key and per-action signature using an existing noble dependency.
- Load: one encrypted record and, if present, one account verification.
- Network: account grant verification before each delegated server write; no new polling loop.

## Migration Plan

Add allowlisted delegate name to the shared catalog; ship backend support before enabling UI through the support flag. No new DB schema, automatic grants, existing-key migration, builder activation or historical-fill correction. Run focused signed-payload/vault/UI tests before any separately approved deploy.

## Validation Criteria

Owner-only management; denied/revoked/foreign signer blocked before upstream write; wire layout matches documented discriminator17/pubkey/delete flag; nonce/network/tamper checks; pending-key recovery; storage failure before permission; no cross-context signing; exact long/short/partial/isolated Close; browser enable/sign/pause/revoke/error flow with local test keys.

## Related Decisions

- [ADR-0034](adr-0034-server-trading-credential-vault.md)
- [Audit](../../production/reports/bulk-pnl-attribution-audit-2026-09-06.md)
- [BULK agent API](https://docs.bulk.trade/api-reference/manageAgentWallet)
- [BULK signing](https://docs.bulk.trade/api-reference/signing)
- [BULK transfer ownership](https://docs.bulk.trade/api-reference/transfer)
