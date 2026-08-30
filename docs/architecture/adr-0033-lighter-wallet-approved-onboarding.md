# ADR-0033: Wallet-approved Lighter onboarding with browser-held credentials

## Status
Accepted for local implementation; production release is not authorized.

## Date
2026-08-31

## Context

### Problem Statement
Clash requires users to copy a Lighter account index, API-key index and private
key. The owner's ClashBot project already offers wallet-approved ChangePubKey
registration. Bring that interaction to Clash without replacing its trading
credential architecture or overwriting existing exchange keys.

### Constraints
- Existing manual keys, referral preservation, integrator approval and per-order
  attribution remain compatible.
- Public Lighter and Robinhood Lighter are distinct deployments.
- No owner-wallet private key, trade, deposit or funded transaction is needed
  for automated verification.

### Requirements
- Discover owned accounts and require a choice when more than one exists.
- Register only an unused API-key slot, with a genuine owner signature.
- Preserve a generated private key through cancellation, ambiguous responses,
  browser reload and server restart.
- Do not submit a registration twice or silently replace another key.

## Decision
Reuse the official pinned lighter-sdk 1.1.1/native SignChangePubKey implementation
and existing encrypted browser credential storage. Unlike ClashBot's copy-bot
vault, Clash keeps the key in the browser and sends it transiently for explicit
existing API signing requests. The authenticated preparation response includes
the **newly generated** key; it is durably encrypted and read back before the
wallet is asked to sign. The owner's L1 private key is never requested.

### Architecture Diagram
Connected wallet → owned-account discovery → unused slot/nonce preparation →
encrypted browser pending record → wallet signature → exact server challenge →
one dispatch → public-key association/private-half verification → saved connection.

### Key Interfaces
- GET /api/futures/{lighter|rh-lighter}/accounts?wallet=...
- POST .../api-key/prepare: wallet/account input; server chooses player,
  deployment, slot, nonce, transaction and message.
- POST .../api-key/submit: challengeId/signature only; no client transaction.
- POST .../api-key/recover: read-only check of owner, exact slot/public key and
  private-half possession after a challenge expires or a process restarts.

Challenges are bounded, short-lived, player/deployment-bound and rate-limited.
Slots 0–3 are preserved; only absent slots 4–254 are selected. Immediately before
dispatch the owner, slot and nonce are rechecked. Ambiguous retries reconcile
the same registration instead of invoking send again.

Browser records are scoped by venue, player, wallet, account and challenge.
Immutable identity copies precede mutable pointers; confirmed per-key copies
also survive competing tabs. An absent key is not a successful registration.
Retirement requires native transaction expiry plus a grace period and fresh
server slot/nonce/time checks; the old key is archived before a subsequent
explicit Connect may prepare another one. Explicit venue Clear removes the
current identity's scoped copies, without deleting other wallets/venues.

## Alternatives Considered

### Copy ClashBot's server vault
- Pros: keep generated secrets out of the browser.
- Cons: requires a new custody, session, database, encryption and trading API
  migration unrelated to the requested connection UX.
- Rejected: preserve the established Clash credential contract.

### One-shot, memory-only generated key
- Pros: smaller implementation.
- Cons: a successful registration followed by a lost response/restart can
  permanently lose the only private half.
- Rejected: durable encrypted browser pending storage is required.

## Consequences

### Positive
- No manual key entry on the normal connection path.
- Existing keys/referrals are preserved; approvals and rewards remain gated.
- Recovery is testable without creating live exchange credentials.

### Negative
- One button can still involve separate wallet confirmations for registration
  and integrator approval.
- Browser encryption is not protection against XSS or a compromised browser.
  It does not change Lighter's native API-key permissions.

### Risks
- EIP-191 EOA signatures are supported; smart-contract/multisig wallets may
  still require exchange-side setup/manual-key fallback.
- A funded/live owner-wallet registration was not performed automatically.
- Browser site-data removal deletes local recovery material; revocation remains
  available on Lighter itself.

## Performance Implications
- CPU: one native key-generation/signing process during setup.
- Memory: at most 400 pending server challenges; existing API signer reused.
- Load Time: no native SDK download into the web client.
- Network: account/slot/nonce discovery, signed registration and bounded
  confirmation reads; normal market/order polling is unchanged.

## Migration Plan
Add the wallet-connect button as default; retain manual entry under Advanced.
Legacy credentials continue to work. No production database migration.

## Validation Criteria
Real EIP-191 verification, authenticated route tests, native SDK offline
preparation, storage/read-back/context-switch tests, timeout and concurrency
regressions, local hook/UI flow, lint and production build.

## Related Decisions
- [Separate Robinhood deployment](adr-0023-robinhood-lighter-deployment-and-partner-attribution.md)
- [Lighter API-key permissions](https://apidocs.lighter.xyz/docs/api-keys)
- [Official native SDK](https://github.com/elliottech/lighter-python/blob/main/lighter/signer_client.py)
- Reference implementation: C:/Users/Admin/Documents/clashbot/src/copyTrading/venues/lighter.ts
  and server/copy-trading/venues/lighter.ts (read-only).
