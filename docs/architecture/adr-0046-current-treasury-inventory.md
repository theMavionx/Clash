# ADR-0046: Current treasury availability versus settlement finality

## Status
Accepted

## Date
2026-09-21

## Context
### Problem and requirements
Treasury has 20 USDG in latest/safe states but zero at a finalized head about17minutes behind. Owner requests read-only transfer simulation and relaxing this inventory gate. Readiness is not confirmation that a migration payout settled. Keep chain, target metadata, exact amounts, reservations, signing/nonce guards and finalized receipt verification.

## Decision
Pin EVM treasury health reads (contract bytecode, metadata, token inventory and ETH gas balance) to one latest block number. Existing quote liability reservations are retained. Every real payout still simulates before signing, checks nonce state and retains finality/canonical receipt/exact Transfer verification before marking paid. Solana deposits and historical eligibility remain finalized.

### Architecture and interfaces
Latest block → coherent treasury health snapshot → reservation checks → owner-signed Solana deposit → existing payout simulation/sign/broadcast → finalized canonical receipt verification. Same health interface; no config or DB schema change.

## Alternatives considered
### Keep finalized inventory
Protects against reorgs but unnecessarily delays availability of operator treasury funding; rejected for readiness after owner request.
### Remove all confirmation/simulation guards
Faster but risks duplicate or unbacked settlements; rejected. Settlement correctness remains unchanged.

## Consequences
### Positive
Spendable funds are recognized immediately without relying on stale finalized inventory. Consistent block snapshot avoids mixing head states.
### Negative and risks
Latest state can reorganize or treasury can spend externally after a quote. Existing pre-send simulation fails closed and liabilities remain for operator recovery; this does not guarantee future liquidity. Reservations may conservatively double-count already-sent/unfinalized payouts, reducing capacity rather than overspending.

## Performance implications
One latest-header read per health request. Other read counts unchanged. No new dependency or browser work.

## Migration plan
Deploy narrow backend change, verify production readiness without altering wallets/quotes or sending transactions. Existing paused state remains until deliberately enabled for testing.

## Validation criteria
Pinned latest reads with positive inventory despite delayed finality; zero inventory/gas still rejected; receipt finality retained; simulation reverts prevent signing; full ledger/idempotency regressions. Live eth_call and eth_estimateGas only, no broadcast.

## Related decisions
- ADR0045 official USDG payout
