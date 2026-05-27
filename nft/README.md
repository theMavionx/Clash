# Clash NFT Drop

Two independent 250-supply drops:

- Base: ERC-721 contract `DemonKingBase`.
- Solana: Metaplex Core Candy Machine with Sol Payment guard.

For the prepared reusable 555-supply model for a new collection, see
[`NEW_COLLECTION.md`](NEW_COLLECTION.md).

## Required Env

Keep secrets in `web/.env` or root `.env`; never commit them.

```env
# Required in .env, never in committed files:
# - NFT_BASE: Base / MetaMask private key, 32-byte hex.
#   A 12/24-word MetaMask mnemonic also works, but a single private key is safer.
#   This is NOT the wallet address.
# - NFT_KEY: Solana keypair. Existing 64-byte base58 key is supported.

# Optional prices.
NFT_BASE_PRICE_ETH=0.001
NFT_SOLANA_PRICE_SOL=0.05

# Optional Solana metadata mode.
# Default is cheap hidden settings with one server-proxied URI.
# Set to config-lines only if every Solana NFT needs a unique on-chain URI.
NFT_SOLANA_METADATA_MODE=hidden-settings

# Optional RPCs. Public fallbacks exist but paid RPC is safer for deploys.
NFT_BASE_RPC_URL=https://mainnet.base.org
NFT_SOLANA_RPC_URL=https://solana-rpc.publicnode.com
```

## Commands

```bash
npm install
npm run doctor
npm run compile:base
npm run deploy:base
npm run deploy:base-shop
npm run token:base-shop -- cop allow
npm run transfer:base-shop
npm run quote:base-shop -- cop 0xBuyer 1
npm run set-price:base
npm run sale:base -- open
npm run deploy:solana
npm run config:solana:royalties
npm run build:solana:marketplace
npm run marketplace:solana -- pda
npm run set-payments:solana
npm run set-price:solana
npm run sale:solana -- open
npm run quote:prices -- 8.9
```

The Base contract starts paused with `saleActive=false`. Set the price and
unpause/open sale only when the mint UI is ready.

## Shop Payment Layer

The already deployed Base NFT contract only accepts native ETH in its direct
`mint` function. For the in-game shop, use `DemonKingBaseShop` instead:

- deploy `DemonKingBaseShop`;
- allow the payment tokens we want;
- transfer NFT ownership to the shop contract;
- have the backend/frontend request short-lived signed quotes;
- users call `mintWithQuote`.

Payments are forwarded directly to the contract owner/deployer address. Rescue
withdrawals also send only to `owner()`.

Target pricing:

- Base CoP: `$5.00` per NFT. Set `NFT_BASE_CLASH_TOKEN` after CoP launches.
  `NFT_COP_USD_PRICE` can override the DexScreener price if needed.
- Base ETH/USDC shop quotes: `$8.90` per NFT if enabled.
- Solana SOL/USDC/SKR Candy Machine groups: `$8.90` per NFT.

`quote:base-shop` computes native ETH from live ETH/USD, fixed USDC units, or
CoP units from `NFT_COP_USD_PRICE` or DexScreener, then signs the EIP-712 quote. Keep the
quote TTL short; default is 300 seconds.

The Solana Candy Machine also starts closed by default via a far-future
`startDate` guard. Set `NFT_SOLANA_PRICE_SOL` and run `npm run sale:solana --
open` only when the mint UI is ready. To deploy it open immediately, set
`NFT_SOLANA_SALE_ACTIVE=1` before `npm run deploy:solana`.

`set-payments:solana` computes `$8.90` in SOL from live SOL/USD, configures
USDC as exactly `8.900000` USDC, and adds an SKR token-payment group when
`NFT_SOLANA_SKR_MINT` or `GAME_SHOP_SOLANA_SKR_MINT` is set. SKR decimals are
read from the mint account, with a 6-decimal fallback. If a previously deployed
Candy Guard account is too small to add payment groups, deploy a fresh Candy
Machine with the groups from the start before opening the public sale.

Solana deploy now defaults to Metaplex Core Candy Machine `hiddenSettings`.
That keeps one stable metadata URI on-chain:

```text
https://clashofperps.fun/api/nft/solana/hidden
```

The image and metadata stay on our server proxy, so they can be adjusted without
rewriting on-chain URIs. This is much cheaper than storing 250 config lines on
chain. If unique per-token on-chain names/URIs are required later, run with
`NFT_SOLANA_USE_CONFIG_LINES=1` or `NFT_SOLANA_METADATA_MODE=config-lines`;
that older mode needs roughly `0.43 SOL` in rent-exempt Candy Machine accounts
before fees.

## Solana Royalties

The Solana collection uses a Metaplex Core collection-level `Royalties` plugin.
Run this after deploying the collection, or whenever the treasury changes:

```bash
npm run config:solana:royalties -- --bps=250
```

The script defaults to 250 bps (2.5%) and sends 100% of royalties to
`NFT_SOLANA_TREASURY` or the treasury saved in `deployments/solana-mainnet.json`.
It also updates Solana metadata JSON with `seller_fee_basis_points` and
`fee_recipient`.

## Solana Marketplace

`nft/solana/marketplace` is a native Solana program for fixed-price Metaplex
Core asset listings. It keeps assets in the seller wallet until purchase. The
seller grants the listing PDA a Core `TransferDelegate`, and the program signs
with that PDA only when a valid listing is bought.

The marketplace fee is separate from collection royalties. Configure our market
fee to 100 bps (1%):

```bash
npm run build:solana:marketplace
# deploy the SBF program with Solana CLI, then set:
# NFT_SOLANA_MARKETPLACE_PROGRAM_ID=<deployed_program_id>
npm run marketplace:solana -- init --fee-bps=100
```

Common admin/operator commands:

```bash
npm run marketplace:solana -- pda --asset=<core_asset_pubkey>
npm run marketplace:solana -- list --asset=<core_asset_pubkey> --price-lamports=100000000
npm run marketplace:solana -- buy --asset=<core_asset_pubkey> --seller=<seller_pubkey>
npm run marketplace:solana -- cancel --asset=<core_asset_pubkey>
```

For SPL-token listings, pass `--payment-mint=<mint>` on `list` and pass
`--buyer-token`, `--seller-token`, and `--treasury-token` on `buy`.
