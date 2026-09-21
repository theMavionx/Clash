# CLASH migration — 2026-09-21

## Scope
Custodial Solana CLASH to Robinhood chain 4663 ERC-20 migration at `/migration`, integrated with the existing admin password. No contracts deployed. Default ratio 1:1; $2 SOL service fee; confirmed deposited lots liquidated at $400 or residual up to $100 after ten minutes. Simulation slippage 5%, 7.5%, max 10%; ambiguous/failed broadcasts held for reconciliation.

## Verification
- Full repository Deploy gate passed (existing bundle-size warnings).
- 22 server tests passed: exact integers, authentication, encrypted/redacted secrets, immutable quotes, inventory/eligibility reservations, duplicate submissions, competing workers, crash recovery, canonical transaction signing, simulation failures, pause, nonce conflict, late receipts and queue fairness.
- Four frontend unit tests passed.
- Browser desktop/mobile flow passed: restore/cancel, lost response without re-signing, session expiry, admin configuration/keys/snapshot/audit. Screenshots remain local under `web/artifacts/migration`.
- Paid Alchemy read verified Solana mint decimals6 and supply798,350,493.182067. Destination supply validation requires1billion; no tokens are created by this service.
- Robinhood paid RPC returned403 with the existing key. No public RPC fallback.
- No funded deposit, sale or payout performed by the agent. Mock tests do not establish mainnet execution success.

## Activation checklist
1. Open existing Admin > Migration. Enter destination token contract; it must already exist on Robinhood mainnet and expose standard ERC-20 behavior with1billion total supply.
2. Enter dedicated Solana and EVM private keys through write-only fields. Seed phrases are not accepted. Fund the Solana treasury with SOL; fund EVM treasury with destination CLASH inventory and ETH for gas.
3. Configure a paid Robinhood-enabled Alchemy API key and Jupiter API key. Source Solana RPC uses the existing paid Alchemy configuration.
4. Capture the finalized current snapshot at the intended cutoff. This is not an arbitrary historical-date lookup. Snapshot becomes immutable once any quote/request exists; later purchases never increase wallet allowance.
5. Review amounts, ratio and slippage caps, then enable after readiness passes. No artificial one-user cap.
6. Owner should perform a small funded test and verify both receipts before wider announcement.

## Custody and recovery
- Back up the shared database AND separate `server/migration-master.key` through a secure private backup. The master key is generated on the first secret save. Database ciphertext alone cannot restore secrets.
- Keep these treasuries dedicated; external EVM nonce use can interrupt payout reconciliation.
- Pause blocks new spends but continues receipt reconciliation. Do not clear request/sale rows or resend manually on an RPC timeout.
- Review states retain reservations. There is intentionally no generic force-pay/release button; establish exact chain evidence before recovery.
- Existing requests retain their original token address, ratio and recipient after configuration changes.
- DexScreener liquidity/mint checks are not a manipulation-proof oracle. Nonstandard/fee-on-transfer tokens are not supported.

## Deployment
Application commit `3bb38d33`; canonical atomic release `20260921074659-3bb38d33` completed07:51:34UTC. Five Clash PM2 services online with zero restarts. `/migration`200/no-store; `/api/migration/status`200 with enabledfalse and missing prerequisites; unauthenticated admin403. Public migration JS SHA256 matches the release file (`a2165b2d1ac59587f6367426edd6a5595f42660aa26d7ca437e40f8a48848830`). Bounded API error-tail scan contained no migration/TypeError/SyntaxError/ReferenceError matches.

API briefly returned502 during the scheduled service restart; health verification subsequently passed and the independent public probes above succeeded. Existing background NFT/RPC429 messages remain unrelated to migration. Canonical retention removed old build20260918103439-9992eb4e; prior palette release retained for rollback. Migration acceptance is NOT active and no user funds have been accepted by this release verification.
