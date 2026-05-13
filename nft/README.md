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
npm run deploy:solana
```

The Base contract starts paused with `saleActive=false`. Set the price and
unpause/open sale only when the mint UI is ready.

For the 250-item Solana Core Candy Machine, expect roughly `0.43 SOL` just for
rent-exempt accounts before fees. Keep extra SOL on the deployer to avoid a
half-created drop.
