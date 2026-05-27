# ADR-0008: Solana Core NFT Marketplace

## Status

Accepted

## Context

The Demon King NFT exists on Solana as a Metaplex Core Candy Machine collection.
The collection was deployed without a Core `Royalties` plugin, so Solana
marketplaces and indexers did not have an on-chain royalty source for the
project. We also need a Solana-native marketplace path instead of relying only
on the Base ERC-721 marketplace.

The existing repo uses Node.js scripts for Solana operations and does not
currently include Anchor or Solana CLI tooling in the local environment.

## Decision

Use Metaplex Core collection royalties for Solana royalties and add a native
Rust Solana program for fixed-price marketplace listings.

The marketplace program:

- stores one config PDA for authority, collection, treasury, and market fee;
- defaults the market fee to 100 bps (1%);
- stores one listing PDA per Core asset;
- keeps assets in seller custody until purchase;
- requires the seller to grant the listing PDA a Core `TransferDelegate`;
- transfers SOL or SPL Token payments, sends 1% to treasury, and transfers the
  Core asset to the buyer by CPI to Metaplex Core.

Collection royalties remain separate from the market fee. The Solana collection
royalties are configured as 250 bps (2.5%) to the project treasury via the Core
`Royalties` collection plugin.

## Alternatives Considered

- Reuse only external Solana marketplaces.
  This does not give the game a controlled listing and purchase path.

- Build with Anchor.
  Anchor would reduce boilerplate, but the current local tooling does not have
  Anchor installed and the project has no existing Anchor workspace.

- Custodial escrow.
  Holding assets in an escrow account adds more custody and recovery surface.
  A Core transfer delegate keeps the asset in the seller wallet until purchase.

## Consequences

The Solana marketplace can be built and reviewed from this repo, but deployment
still requires Solana SBF tooling and a deployed program id. The client/operator
script needs `NFT_SOLANA_MARKETPLACE_PROGRAM_ID` after deployment.

Cancelling a listing closes the listing PDA; the seller can separately revoke or
replace the Core `TransferDelegate` if desired. The program will only sign Core
transfers for active valid listings.
