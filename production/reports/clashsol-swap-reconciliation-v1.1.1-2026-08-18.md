# clashSOL Swap Reconciliation v1.1.1 Release Checklist

## Scope

- Safely accept a wallet-refreshed recent blockhash only when every other
  Solana message field remains identical to the reviewed Sanctum order.
- Persist the primary transaction signature before execute and reconcile
  ambiguous submission outcomes through multiple Solana RPCs.
- Recover the latest active server order when browser storage is absent.
- Present wallet, submit, on-chain confirmation and balance receipt as four
  explicit Battle Shop stages, including minimize/reopen and Solscan details.
- Preserve all v1.1.0 intent rows while adding nullable lifecycle columns.

## Pre-release gates

- [x] Focused Sanctum server, reward, migration and rate-limit tests pass.
- [x] Focused Battle Shop and admin tests pass.
- [x] ESLint, Vite production build and canonical Deploy gate pass.
- [x] UX, art, QA, release-manager, DevOps and producer gates are GO.
- [ ] Targeted production schema and `sanctum_order_intents` backup restores in
      a probe database; pre-deploy row/status counts are recorded.

## Production verification

- [ ] Production source/current SHA equals the pushed v1.1.1 commit.
- [ ] Six nullable lifecycle columns exist and pre-existing row count matches.
- [ ] Required PM2 services, Nginx, public game/API/MCP health are green.
- [ ] Sanctum public status is live; active-order endpoint requires auth.
- [ ] Affected legacy intents are readable and do not block a new quote.
- [ ] Desktop/mobile Battle Shop progress UI has no console or layout error.
- [ ] Tag `v1.1.1` is pushed only after successful production verification.

## Wallet-signed follow-up

The release performs no funded transaction. The owner may retry a small swap
after deployment, review the quote, approve the wallet signature, and verify
the four stages, Solscan receipt and clashSOL balance delta.

## Rollback

Do not roll back with unresolved `executing`, `submission_unknown` or
`submitted` rows. Reconcile them first. The previous immutable release ignores
the additive columns. If old v1.1.0 history semantics are required, normalize
accurately confirmed rows to legacy `consumed` before switching the symlink.
