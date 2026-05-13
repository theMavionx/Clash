# Clash NFT Drop

Two independent 250-supply drops:

- Base: ERC-721 contract `DemonKingBase`.
- Solana: Metaplex Core Candy Machine with Sol Payment guard.

## Required Env

Keep secrets in `web/.env` or root `.env`; never commit them.

```env
# Base / MetaMask private key, 32-byte hex.
# A 12/24-word MetaMask mnemonic also works, but a single private key is safer.
# This is NOT the wallet address.
NFT_BASE=0x...

# Solana keypair. Existing 64-byte base58 key is supported.
NFT_KEY=...

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
npm run set-price:base
npm run sale:base -- open
npm run deploy:solana
```

The Base contract starts paused with `saleActive=false`. Set the price and
unpause/open sale only when the mint UI is ready.

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
