# ADR-0045: Official USDG temporary migration payout

## Status
Accepted

## Date
2026-09-21

## Context
### Problem and requirements
Owner requests temporary USDG payouts on Robinhood at 1000 source CLASH per USDG. Existing target supply check assumes a one-billion CLASH token. Preserve standard CLASH checks, exact arithmetic, immutable quotes, encrypted credentials and paid-RPC-only operation.

## Decision
Shared issuer-address metadata identifies only Robinhood USDG at 0x5fc5360D0400a0Fd4f2af552ADD042D716F1d168 (chain4663). For this exact token require symbol USDG, six decimals and positive supply instead of one-billion supply. Other addresses retain original policy. Keep existing chain/code/balance/gas/receipt guards. Fixed config ratio0.001 is not market pricing. Do not enable migration or alter cutoff during configuration.

### Architecture and interfaces
Configured target address → chain validation → immutable quote asset/rate → existing ERC20 transfer and receipt verification. Public history includes stored targetToken; browser labels derive from each quote/history record, never current config for old records.

## Alternatives considered
### Disable all supply checks
Easy but broadens accepted target policy unnecessarily; rejected.
### Native ETH payout
Requires different signing/receipt semantics and is no longer requested; rejected.

## Consequences
### Positive
Minimal verified-address exception; existing ledger and payout mechanics unchanged.
### Negative and risks
USDG is a real valuable asset, not testnet money. Explicit UI fixed-rate/asset disclosure and paused acceptance avoid presenting this as CLASH→CLASH. No market-value equivalence claimed. Issuer upgrades/freezes remain token risks. Paid RPC403 blocks live readiness until fixed; no bypass.

## Performance implications
One extra symbol read during USDG health validation. Negligible shared metadata/label CPU, memory and load cost.

## Migration plan
Deploy additive support, then update only targetToken and ratio through authenticated config API after checking paused state/no requests. Preserve owner snapshot, credentials and acceptance. No funded tests.

## Validation criteria
Wrong address/symbol/decimals/zero supply rejected appropriately; original CLASH supply guard retained. Exact1000→1 quote and historical asset immutability tests, browser USDG review/rate labels and full Deploy gate.

## Related decisions
- ADR0040 custodial migration
- Issuer: https://docs.paxos.com/guides/stablecoin/usdg/mainnet
