## Hotfix: Decibel Aptos API key rotation
Date: 2026-07-25
Severity: S2
Reporter: Owner
Status: READY FOR DEPLOYMENT

### Problem
Decibel reads and transaction preparation depend on Aptos Labs/Geomi APIs with
per-key request limits. The integration used one credential, so exhausting that
quota caused Decibel API failures for every player until the limit reset.

### Root Cause
The server and parts of the browser client were configured around one static
Aptos API key. There was no shared key pool, cooldown, or retry on an alternate
credential after an authentication, quota, or rate-limit response.

### Fix
- Keep the primary key in `DECIBEL_API_KEY` and load additional server-only keys
  from `DECIBEL_API_KEYS`.
- Rotate keys round-robin for Decibel REST, Aptos fullnode views, transaction
  build/submit/wait, gas price reads, and reward reconciliation.
- Put a limited key on a five-minute cooldown and retry the same operation with
  the next key.
- Route recurring browser reads through authenticated server endpoints so the
  failover keys are never embedded in the web bundle.
- Preserve the existing direct browser read as a compatibility fallback.

### Testing
- Key-pool unit test covers rotation, cooldown, expiry, non-retryable errors,
  environment parsing, and deduplication.
- Live failover probe used an invalid first credential and confirmed that the
  second credential completed the Aptos request with HTTP 200.
- Every new credential returned HTTP 200 from both Aptos fullnode and Decibel
  markets endpoints.
- Node syntax checks, web lint, production web build, and diff whitespace check.
- Production smoke checks must confirm process health, pool size, Decibel
  markets response, and no new key-limit errors after deployment.

### Approvals
- [x] Release approved by owner in the current task
- [x] Targeted regression checks passed locally
- [ ] Post-deployment production smoke check

### Rollback Plan
Revert the hotfix commit, redeploy the previous production commit, and remove
`DECIBEL_API_KEYS` from the shared production environment. The existing
`DECIBEL_API_KEY` remains unchanged, so rollback restores the former single-key
behavior without a database migration.

### Follow-up
Review key-limit telemetry and cooldown behavior within 48 hours. No schema,
Godot, or player-data changes are part of this hotfix.
