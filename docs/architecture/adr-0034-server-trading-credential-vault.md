# ADR-0034: Player-scoped encrypted trading credential vault

## Status

Accepted for owner-requested implementation and production deployment. Supersedes
the browser-only persistence portions of ADR-0031 and ADR-0033, not their trading
validation, referral, environment or explicit-signing rules.

## Date

2026-08-31

## Context

### Problem Statement

The owner requested encrypted server storage and login-time restoration of exchange
API keys and delegated trading signers, with a future server-bot integration path.
Existing browser-global records could select another player's credentials on a
shared browser. Some legacy adapters persisted signing material as plaintext.

### Constraints

- Game bearer tokens are long-lived and also passed to the existing bot service;
  they must not independently authorize secret restoration or modification.
- Existing linked-wallet tables and the current canonical wallet are mutable.
  They are not reliable historical ownership proofs for an established vault.
- Preserve venue signing, permissions, eToro Real-only restrictions, referral and
  reward behavior. Do not place live trades as verification.
- Never upload browser storage wholesale. Main wallet, seed, Privy and browser
  encryption-master material are outside this migration.

### Requirements

- Player isolation, durable deletion markers, replay-safe writes and race-safe
  account switches; preserve generated keys during failures and conflicts.
- A dedicated production encryption key outside source, bundles, SQLite and logs.
- Keep an encrypted local cache for current-device operation; explicitly show
  pending uploads and require proof before restoring secrets on a new browser.

## Decision

Store a versioned allowlist of API/delegate records in dedicated main-DB tables.
Encrypt JSON with AES-256-GCM, independent random 96-bit IVs and 128-bit tags;
authenticated data binds format, player, record ID and revision. Each environment
MUST have a different keyring: environment separation is by key, not an AAD field.
An active key ID selects new writes; older IDs remain usable for existing rows and
HMAC retry receipts. Invalid/missing key configuration fails closed for secrets.

The keyring is an owner-only file, configured through
`CLASH_CREDENTIAL_VAULT_KEY_FILE`. The deploy utility creates it exclusively only
when no existing ciphertext/receipts require a previous key, validates referenced
key IDs, and verifies a protected backup in a separate directory. Operators must
also maintain an off-host protected backup; the local backup does not protect
against host loss. Keyring contents are never logged or embedded in Vite settings.

Manifest reads require a real-player bearer token. Secret endpoints additionally
require a random, token- and player-bound HttpOnly Secure SameSite=Strict host-only
cookie. Only its hash is persisted. Fresh verified EVM/Solana game login can issue
the cookie; cached login probes cannot. Aptos uses explicit vault unlock because
the existing game proof verifier does not always check rotated authentication keys.

Explicit unlock uses a short-lived, single-use server challenge bound to origin,
player, token and exact wallet. EVM personal signing, Solana Ed25519 and native
Aptos Ed25519 are supported. Aptos checks its current on-chain authentication key;
unsupported keyless/multisig/unified schemes fail closed. Direct Farcaster Solana
SDK-only signing is not implemented; wallet-adapter/Privy Solana are supported.

Independent immutable owner anchors protect established vaults. First empty-vault
enrollment is trust-on-first-use of a freshly proved canonical login wallet; it is
not proof of historical account ownership. Later issuance requires an anchored
wallet or an existing valid vault capability plus fresh new-wallet proof.

### Architecture Diagram

Verified player + wallet proof → dedicated browser capability → encrypted vault
↔ player-namespaced encrypted browser cache → existing venue adapters.

No new public bot-secret export route or automatic trading authorization is added.
The internal `readForPlayer` service provides a future integration boundary;
future bots need a separate, explicit permission and execution design. Existing
Phantom `secret_ref` transport is unchanged and is not upgraded by this decision.

### Key Interfaces

Base: `/api/players/trading-credentials`, same-origin, no-store.

- GET `/`: metadata, server-confirmed player identity, unlock state/anchor wallets.
- POST `/challenge`, POST `/unlock`: purpose-bound signature proof; cookie only.
- POST `/restore`: decrypted values for that player only, after both capabilities.
- PUT `/:id`, DELETE `/:id`: expected revision + stable operation ID, CAS conflict
  detection, authenticated replay receipts and durable tombstones.
- POST `/session/logout`: revoke this capability and pending/in-flight challenges.
- 32 KiB per record, 256 records per player; bounded request and per-player rates.

Browser adapters capture an opaque player/epoch scope before asynchronous work.
Logout/account switch clears the cache synchronously and invalidates old callbacks.
Read/acknowledgement generations cannot overwrite newer local writes. A rejected
registered key is retained in an encrypted local conflict archive, not discarded.
Applying changed remote credentials remounts credential-using UI under a new epoch;
GodotCanvas and game state remain mounted. Ordinary local writes do not remount.

## Alternatives Considered

### Alternative 1: Browser-only persistence

- Pros: no additional server custody or wallet-proof UX.
- Cons: no cross-device restore; browser data loss loses generated delegates.
- Rejected: does not meet the owner's explicit server-sync requirement.

### Alternative 2: Bearer-token-only restore or bulk localStorage upload

- Pros: simpler integration and fewer prompts.
- Cons: grants the existing bot token access to every secret; mixes shared-browser
  players and can upload wallet masters/seeds or unrelated session material.
- Rejected: unacceptable authority expansion and ownership ambiguity.

### Alternative 3: Client-password encryption inaccessible to the server

- Pros: server cannot decrypt records.
- Cons: adds recovery/password management and does not support the requested
  future server-side trading use. Not chosen for this owner-approved custody model.

## Consequences

### Positive

- API/delegate restoration across browsers, encrypted at rest, current-player only.
- Safe retry/deletion/conflict handling; no automatic signup, order or bot consent.
- Shared schema keeps frontend and backend storage scope aligned.

### Negative

- The server can decrypt trading credentials; host compromise remains consequential.
- New-browser restoration needs wallet verification; ambiguous old keys need an
  explicit import confirmation. Offline changes remain visibly pending.
- Deleting a stored key does not revoke it at the exchange or retract an existing
  copy from an offline browser; use venue revocation for immediate trading denial.

### Risks

- XSS can access keys while the browser is unlocked: encrypted storage is not XSS
  protection. Keep secrets out of logs, public caches and exposed debug state.
- Do not reuse keyrings between environments; retain old keys until ciphertext and
  receipt migration is verified. Restore a missing key instead of generating one.
- Primary keys are rejected when derivable owners match known scope/anchor fields;
  arbitrary unscoped imported keys cannot be classified universally. UI requests
  API/delegate material only; excluded wallet-only bot secrets remain device-only.
- Challenges are process-local: restart requires a new proof, not replay.
- Audit/receipt retention is currently unbounded; add maintenance with replay and
  key-rotation constraints before large-scale growth.

## Performance Implications

- CPU: small AES-GCM payloads; wallet proofs only at enrollment/session renewal.
- Memory: only the active player's browser cache; API decrypts requested records.
- Load time: authenticated manifest plus one restore before trading-hook hydration.
- Network: sync on login/manual refresh and local mutations; no continuous global
  secret polling. Current cookie lifetime is 30 days; expired sessions require proof.

## Migration Plan

1. Deploy the versioned schema and separate protected keyring using atomic release.
2. Confirm server identity before reading any player-namespaced local records.
3. Auto-import an old owner-scoped record only when its exact owner matches the
   freshly verified vault wallet. Unknown/global records require explicit consent.
4. Bind each imported legacy name to one player; remove plaintext only after durable
   encrypted local persistence. Preserve the legacy IndexedDB encryption key until
   all old records are migrated. Never replace malformed encryption keys silently.
5. Exclude main-wallet-only GMX/GMTrade/PERPL and legacy Decibel bot-secret records;
   wallet-only venues have no equivalent API key to upload. Existing Decibel server
   signers continue under their existing server-managed design.
6. Verify with synthetic, unfunded keys, then production health/denial checks only.
   Do not change tournament data or other unrelated pending work.

## Validation Criteria

Behavior tests cover AEAD tampering/player swaps, CAS/idempotency, tombstones,
rotation/restart, cookie and replay boundaries, actual main login proof handlers,
legacy multi-record decryption, privacy-mode storage fallback, delayed A→B work,
stale restore/acknowledgement races, bot export cancellation, primary-key exclusion,
and failed persistence/conflict preservation. Build and exercise the real local UI
against an in-memory vault before deployment; no real funded trades.

## Related Decisions

- [ADR-0031: eToro adapter](adr-0031-etoro-browser-credentials-and-cfd-adapter.md)
- [ADR-0033: Lighter onboarding](adr-0033-lighter-wallet-approved-onboarding.md)
- [ADR-0005: Avantis browser delegate](adr-0005-avantis-browser-agent-permission-mode.md)
