# ADR-0048: Owner-operated migration sales runner

## Status

Accepted for local implementation; not deployed or activated by this task.

Later amendment: [ADR-0052](adr-0052-confirmed-deposit-sales.md) supersedes only the paid-only lot gate with finalized confirmed-deposit eligibility, per owner's2026-09-21 instruction. Historical text below records the original decision.

## Date

2026-09-21

## Context

### Problem Statement

Owner requested an automatic CLASH-to-SOL script that waits for balance and tries smaller slippage before increasing it. An embedded migration sales queue already exists. A second independent wallet-balance seller could liquidate unrelated treasury holdings or duplicate an in-flight sale.

### Constraints

- Preserve existing custody, paid-Alchemy routing, encrypted keys, batch thresholds and receipt finality.
- Never infer sale entitlement from the entire wallet balance.
- No funded execution or production activation by the implementing agent.

### Requirements

- Poll safely, explain waiting states and protect the gas reserve.
- Read-only by default; explicit owner-operated execution mode.
- Share settlement identity, SQLite lease and restart recovery with the embedded worker.

## Decision

Expose `salesPreview()` and lease-protected `tickSales()` on the existing migration service. Add `server/migration_sales_worker.js` as an explicit CLI entry point. Default mode opens an existing DB read-only and does not initialize schema, decrypt keys, simulate, sign or broadcast. The CLI never enables migration or changes configuration. The main API remains responsible for deposit and payout reconciliation.

Use only unsold `paid` lots associated with the current treasury. Check the finalized Token-2022 ATA and at least 0.01 SOL before preparation; recheck balance during preparation. Defaults remain $400 batches or $100 residual batches after ten minutes from the oldest unsold deposit. Owner's subsequent instruction on 2026-09-21 introduces a hard $100 estimated input-value floor: smaller remainders wait, regardless of elapsed time. Validate the floor in batch selection and again using the fresh price during sale preparation. Round a target batch up to the next source base unit to prevent a $99.999999 boundary sale. Untracked treasury tokens are excluded. This replaces ADR-0040's smaller-final-remainder rule for new sales; existing signed sales still reconcile unchanged.

Start simulation at the smaller of 50 bps and the admin-configured starting slippage. Escalate through 50/100/200/500/1000 bps as applicable, including the exact configured maximum, never beyond it. Escalate only on a structured custom 6001 failure of the Jupiter swap instruction during simulation. Provider/network/other simulation failures do not increase slippage. Fresh route, price-floor and exact simulated balance-delta checks remain mandatory. Signed/broadcast failures never produce replacement trades automatically.

### Architecture Diagram

CLI check → read-only ledger + finalized balance → waiting/ready summary.

CLI execute or embedded worker → shared lease → paid lots → balance/price/batch gates → bounded simulations → persist signed bytes → later identical-byte broadcast → finalized receipt → atomic lot consumption.

### Key Interfaces

- `salesPreview()`: non-mutating wait/ready/pending/review summary with integer unit strings.
- `tickSales()`: sales-only processing under the same lease as `tick()`.
- `saleBalance(address)`: finalized source ATA amount and native SOL balance; no key required.
- CLI: `--db`, `--once`, `--interval-ms`, explicit `--execute`, `--help`.

## Alternatives Considered

### Alternative 1: Separate balance-only seller

- Description: poll wallet and swap all CLASH.
- Pros: small standalone script.
- Cons: untracked holdings, duplicate trades and no migration lot accounting.
- Rejection Reason: cannot preserve treasury and settlement invariants.

### Alternative 2: CLI invokes the entire migration tick

- Description: call deposit, payout and sale orchestration together.
- Pros: no separate sales interface.
- Cons: starting a seller could also initiate unrelated payouts.
- Rejection Reason: unnecessarily expands the operator's action scope.

## Consequences

### Positive

- One authoritative queue across processes; no new private-key storage or signing HTTP endpoint.
- Read-only readiness checks and meaningful waiting reasons.
- Lower initial slippage while preserving the operator's configured maximum.

### Negative

- Requires the existing migration DB/API; not a generic wallet liquidator.
- Pausing migration also pauses sales. Stopping only the CLI does not stop the embedded worker.
- `--once --execute` may only prepare/persist a sale; later cycles reconcile/broadcast it.

### Risks

- Simulation does not guarantee execution: failed/expired/ambiguous sends stay reserved for reconciliation.
- RPC balance/price changes: recheck and simulate before signing; verify exact finalized receipt.
- Emergency pause during preparation: recheck enabled state before persistence and before broadcast.
- Lost lease: fence callbacks and persistence; no replacement signed sale may be broadcast without a durable ledger row.

## Performance Implications

- CPU: existing integer math and bounded simulation ladder.
- Memory: same ledger queries as existing worker; no new unbounded in-memory history.
- Load Time: no browser/client change.
- Network: finalized balance reads per check; simulation only when an execution batch is eligible. CLI polling defaults to 15 seconds and backs off provider errors up to five minutes. Logs omit repeated unchanged summaries.

## Migration Plan

No schema migration or configuration change. Ship core, chain and CLI together in a future reviewed release. Do not auto-register a process or start execution during development. Operator instructions describe preview, execution, emergency pause and recovery. Keep prior releases available.

## Validation Criteria

Local tests cover read-only DB byte stability, missing files, CLI argument validation, missing balance/gas, paid-lot isolation, thresholds, shared lease, restart/identical bytes, expired review, pause races, slippage ladder/caps, typed simulation errors, redacted diagnostics and actual CLI process execution against an isolated paused DB. All funded-chain behavior remains untested by this task.

## Related Decisions

- [ADR-0040](adr-0040-clash-custodial-migration.md): custodial ledger and liquidation invariants.
- [ADR-0046](adr-0046-current-treasury-inventory.md): inventory versus settlement finality.
