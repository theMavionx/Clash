# clashSOL Sanctum Launch Checklist

This document separates the external Sanctum launch from the Clash shop code.
The shop can be implemented and tested locally now, but a real `clashSOL`
cannot be minted until Sanctum has deployed and registered its stake pool.

## Proposed Branding

- Token name: `Clash Staked SOL`
- Token symbol: `clashSOL`
- Product: `Clash of Perps`
- Logo candidate: `web/public/icons/icon-512.png`
- Website: `https://clashofperps.fun`
- One-line description: `Stake SOL, stay liquid, and support the Clash of Perps ecosystem.`

The owner should approve the final logo, description and revenue wallet before
submitting the Sanctum form.

## Required External Launch Steps

1. Submit Sanctum's LST launch form with the approved branding and optional
   revenue wallet.
2. Create an SPL token mint with:
   - 9 decimals;
   - zero initial supply;
   - no freeze authority;
   - approved on-chain and off-chain metadata.
3. Temporarily transfer mint authority to the address Sanctum supplies for the
   launch. After deployment, mint authority must belong to the stake pool.
4. Wait for Sanctum to deploy/register the pool and confirm its mint is
   returned by `GET /lsts/{mint}`.
5. Obtain a Sanctum API key.
6. Configure the Clash server:

```dotenv
SANCTUM_API_KEY=
CLASHSOL_MINT=
# Optional override; use only for Sanctum-approved environments.
SANCTUM_API_BASE_URL=https://sanctum-api.ironforge.network
```

7. Run the read-only metadata/order smoke, followed by one owner-approved
   funded stake and unstake check before enabling production.

Sanctum's current public launch instructions are available at:

- https://docs.google.com/forms/d/e/1FAIpQLSfT2BheMDYsC7JS9xJaZhSVnGPTHLeCmVU7mhDpliENvvfS8A/viewform?usp=dialog
- https://learn.sanctum.so/docs/creating-your-own-lst-with-sanctum/the-setup-process-launching-your-lst
- https://learn.sanctum.so/docs/creating-your-own-lst-with-sanctum/the-setup-process-launching-your-lst/creating-the-token-mint
- https://learn.sanctum.so/docs/for-developers/sanctum-api

## Fee Model To Disclose

According to the current Sanctum documentation:

- the default epoch fee is 5% of staking yield;
- the operator can optionally receive half of that fee;
- direct stake-pool withdrawal fees are 10 bps.

These are protocol settings, not a guaranteed APY. The live shop must display
the APY and conversion amount returned by Sanctum instead of hardcoding yield.

## Go-Live Evidence

- `clashSOL` metadata mint exactly matches `CLASHSOL_MINT`.
- Stake pool program/pool/vote-account metadata is present.
- API key remains absent from `web/dist` and browser requests.
- A wallet-signed order produces the expected `clashSOL` token balance change.
- The transaction signature links to Solana mainnet explorer.
- Failed/rejected/expired transactions do not show success and cannot replay.
