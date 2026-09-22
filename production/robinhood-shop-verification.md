# Robinhood CLASH shop payment migration — 2026-09-22

Owner clarified payment-based benefits, not token-holder eligibility. Supply and
existing benefits are unchanged. Contract: 0xceB9A7C4eC7bf0EE14Bac1f16C97571bC22DB979,
Robinhood chain 4663, 18 decimals. Pricing uses the liquid Robinhood DexScreener
pair, never the old Solana price. Paid Alchemy reads only; existing merchant
treasury is reused. No funded transaction is part of verification.

## Balance check

Sources: server/routes.js shop products/price/grant functions and
design/gdd/economy-balance.md. Existing resource grants, gold sinks, progression
and limits are unchanged. Resource/shield default 20% discount, Altar $12,
AI lifetime $20, AI pack $5 with 150 credits, flag $5. No holder faucet added.
Duplicate receipt redemption cannot create extra resources or credits.
Concern: historical Solana AI grants did not apply the advertised CLASH bonus;
new Robinhood grants explicitly deliver the advertised 150 credits.

## Verification

- Isolated SQLite + HTTP quote/redeem test: expected prices, missing receipt,
  underpayment, wrong buyer, confirmation wait, 150-credit grant, idempotency.
- Client recovery test: failed verification reuses saved payment; uncertain
  wallet submission is locked instead of automatically resending.
- Existing authenticated Town Hall flag recovery regression passes.
- Production read-only RPC: chain 4663, token decimals 18, merchant treasury is
  an EOA, existing quote signer configured. No secrets printed.
- Web production build and syntax checks pass. Funded browser checkout not run.

## Explicit limitation

Solana NFT Candy Machine CLASH mint is a separate on-chain payment flow and
remains unchanged, including its deployment price sync. Bridging that payment
into a Robinhood-funded NFT mint needs a separate settlement design; changing
the label or token address would break minting. Tournament reward distribution
and clashSOL staking are also unchanged. Historical Solana shop receipts remain
redeemable; only new generic shop CLASH quotes move to Robinhood.
