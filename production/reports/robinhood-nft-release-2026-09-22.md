# Robinhood CLASH payments / Solana Dragon delivery

- NFT remains on Solana; the $10 CLASH payment uses Robinhood chain 4663 and
  the existing CLASH contract/merchant treasury. Other payment options remain.
- Authenticated quote pins both wallets, exact amount, inventory reservation;
  Solana recipient proves control by signature. One active order per wallet.
- Canonical exact payment plus 12 successor blocks starts delivery without
  Robinhood L1 finalization. Generic shop already uses short confirmations;
  migration payouts now settle after exact successful canonical inclusion.
- Signed delivery persists before broadcast; deterministic asset and fenced
  workers prevent duplicate mint/completion after timeouts or restarts.
- Pending status visible in shop; operator records visible under NFT admin.
  Kill switch NFT_ROBINHOOD_PAYMENTS_ENABLED=0 stops admission, not recovery.
- Finalized absence is still required to release unpaid reservations. Solana
  delivery confirmations are unchanged. Deep Robinhood reorg risk is accepted
  by the owner's requested faster policy. Late payments need operator review.

## Verification

106 migration/queue tests, HTTP shop/NFT signature and access tests, saved
payment recovery, LeverUp proof importer and Gold/task/tournament tests passed.
Production web build and whitespace checks passed. Real production-RPC mint
simulation passed without broadcast (27,577 units). No funded NFT purchase was
made by the agent; a real wallet browser purchase is still an owner smoke test.

## LeverUp

Umpych's three eligible Clash trades already total $1,392.16614216037 in active
tournament 28. Newer screenshot trades use broker 1, not Clash broker 2. Added
specific importer/claim diagnostics rather than crediting unrelated volume.
