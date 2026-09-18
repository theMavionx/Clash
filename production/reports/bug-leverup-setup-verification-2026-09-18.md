# LeverUp setup verification reports the wrong failure

## Summary
- ID BUG-LEVERUP-SETUP-20260918; S2 / P1; reported by owner, 2026-09-18.
- Environment: production `df54e2c6`, LeverUp V2 browser setup / Monad 143; regression unknown.
- Owner reports repeated failure. Screenshot shows signer authorized, allowance incomplete, generic signer verification error.

## Reproduction and cause
- Authorize signer and approve USDC. Receipt succeeds on one RPC node; a subsequent latest-state read can still return the prior allowance on another node.
- The actual activation callback reproduced this with a lagging RPC mock. Previously final verification did not carry receipt block numbers and converted every verification failure into the same signer error.
- Separate confirmed code defect: key creation ignored encrypted-storage write rejection, permitting authorization before durable storage succeeded.
- The user's exact onchain cause is not proven without public transaction hash/wallet. Read-only 48-hour client-log sample contains network errors but no matching generic setup message; do not infer a specific wallet or successful retry.

## Changes
- Read post-transaction authorization and allowance at the confirmed receipt block, including after revocation; check revocation receipt status.
- Wait for new key persistence before authorization; retain legacy synchronous adapter compatibility through explicit awaitPersistence option.
- Distinguish permission, allowance, missing local signer and RPC failures; no weakened permission/allowance gate, automatic order or approval retry.
- Successful setup is not reported failed solely because subsequent account refresh fails.

## Verification
- 65 focused test entries passed: actual setup callbacks with lagging latest reads, persistence failure/no transaction, reverted approval, RPC failure; credential isolation, protocol and closed-position regressions.
- Additional actual signer-adapter persistence rejection test passed (five setup tests total); full canonical Deploy gate passed. No funded order, approval or signer authorization performed on behalf of users.
- Production lookup for York/Jork/Йорк and near-name variants found no unambiguous LeverUp-linked match. No wallet was attributed to the reporter by guesswork.

## Remaining checks
- User-specific onchain transaction diagnosis pending public hash/address.
- Existing dependency audit/engine warnings are outside this change.

## Production release
- Application `01f14322`, release `20260918063801-01f14322`; canonical deployment completed 06:41:57 UTC, 2026-09-18.
- At 06:42:11 UTC public `useOstium-CNmancoE.js` containing confirmed-block verification byte-matched release; five Clash PM2 services online, zero restarts; online/prices 200, unauthenticated positions 401. Futures error log unchanged at 384521 bytes.
- Live read-only Monad allowance call at block 105822022 passed; no user authorization, approval or trading test transaction.
- Rollback `20260918060101-df54e2c6` retained. Normal retention removed `20260917143924-34257b81`; shared databases preserved and old source recoverable from Git.
- Canonical deployment's existing Solana payment-sync completed its separate pricing update successfully; no changes to that subsystem.
