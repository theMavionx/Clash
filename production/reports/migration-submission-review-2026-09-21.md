## Code Review: Migration submission UI and model

Scope: complete web/src/migration/main.jsx and model.js; backend deposit/settlement boundary inspected with focused regression coverage. Category: web UI/networking. Not a claim of a comprehensive custody-system security audit.

### Standards Compliance: 3/6 passing

- Main component spans more than 40 lines and has high aggregate complexity (main.jsx:21).
- Legacy exported display/model helpers lack full doc comments (model.js:1).
- UI fetch dependency is direct; chain/core tests use injected services. Existing monetary configuration remains server-owned.

### Architecture: MINOR ISSUES

Monolithic rendering and orchestration should eventually split. Server remains authoritative for money, allocation and settlement. This release does not undertake a broad refactor during owner testing.

### SOLID: ISSUES FOUND

The main component mixes wallet lifecycle, network orchestration and presentation; new rejection policy is a pure tested helper rather than another UI-only condition.

### Game-Specific Concerns

Financial state recovery, wallet generation checks and idempotency matter here; frame-rate rules do not apply. Session data remains in memory; signed payloads are not stored in browser storage or logs.

### Positive Observations

Server signatures require exact message equality; quote and payout amounts use integer units. Lost-submit-response recovery resends the same payload without re-signing. Ledger reservations, restart recovery, nonce conflict and receipt matching have deterministic tests.

### Required Changes

- Fixed: Phantom can add priority-fee instructions to an unsigned quote; set bounded compute instructions before approval, preserve exact equality.
- Fixed: definitive submit rejection left a misleading pending lock; release only for narrowly allowlisted pre-acceptance errors, preserving uncertainty lock for network/5xx/unknown responses.
- Fixed: idempotent submit response for expired/cancelled request showed success notice; show actual terminal outcome.

### Suggestions

Split presentation from orchestration, add complete API-boundary schemas, and expand automated integration coverage to real wallet extensions. A live owner-approved deposit → finalized payout is still required. A successful unsigned RPC simulation does not prove wallet integration or live settlement.

### Verdict: APPROVED WITH SUGGESTIONS

For this bounded compatibility/recovery release only. Passing deterministic and mocked-browser checks do not mean the entire migration has zero bugs or has completed a full external security audit.
