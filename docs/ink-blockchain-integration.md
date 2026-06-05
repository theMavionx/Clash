# Ink Blockchain Integration

## Scope

Ink is configured as an EVM chain for Demon King NFTs, bridge destinations,
custodial marketplace assets/payments, and game shop purchases.

Deployment was performed on Ink mainnet on 2026-06-05. The code reads the
deployment JSON files in `nft/deployments/`.

## Network

- Chain: Ink mainnet
- Chain ID: `57073`
- Native token: `ETH`
- RPC: `https://rpc-gel.inkonchain.com`
- Explorer: `https://explorer.inkonchain.com`
- Circle USDC: `0x2D270e6886d130D724215A266106e6832161EAEd`

## Deployment Order

Already completed from `nft/` after `npm install` and `npm run compile:base`:

```powershell
npm run deploy:evm:nft -- --chain=ink
npm run deploy:evm:v3 -- --chain=ink
npm run deploy:evm:shop -- --chain=ink
npm run deploy:marketplace -- --chain=ink
npm run config:evm:metadata-uri -- --chain=ink --execute
```

Expected deployment files:

- `nft/deployments/ink-mainnet.json`
- `nft/deployments/ink-v3-mainnet.json`
- `nft/deployments/ink-shop-v2-mainnet.json`
- `nft/deployments/ink-marketplace-mainnet.json`

## Deployed Contracts

- Demon King proxy / canonical NFT contract: `0x5Cc846B2bA0f030A5165a456eD903A5989E19F3F`
- Demon King V2 implementation: `0x8fc6e18371ddd76654ab1f0859099c040aed255a`
- Demon King V3 implementation: `0x404807f93e47af3eaaec0e983f18dcb35e966fec`
- Demon King shop proxy: `0x4500d3fe42ad88f541e9e382b21bda3535dfd96b`
- Demon King shop implementation: `0x861dd570f758800c190fd87a1657ba34bcbdefd7`
- Demon King marketplace proxy: `0x8290ab5e90db8bbf46c900b536bb5fdd7500d5e2`
- Demon King marketplace implementation: `0x9fcf060f3edc9b7a5cdf9a43997fffdf53d6ff4a`

Deployment transactions:

- V2 implementation: `0x00f5e5863f982d30a67ee4b7848b0d8e0880b2e6b3b910770ef531564384161e`
- V2 proxy: `0xa4c1ed06bc8dcdea8b2047926d0f50cdbcf54711533e56bbb21cce334fa1d0d9`
- V3 implementation: `0xd9a5bb83064c79a84352fe943575f27bbb5a562528819f1c691d043e40b230b4`
- V3 upgrade: `0x9b3abc8bf5fcc21eb2097cba9fa470b671183b88c1f40d77e898cb7fa0602fb4`
- Shop implementation: `0x6019625082d078a025259abdd1b0049a69de8a00a4c9405d86e6bb77de7dbcf4`
- Shop proxy: `0xa10347e8c9a6af657e265e9f545d9bdfae9bf1fa894a30a0b082047e61f6d54f`
- Authorized shop minter: `0xaf54f9d22eb5108e26ad2944b8091abeb9d7dbdf4388560da9abd22dd67c66b3`
- Activated shop sale: `0x3e53c8ca8a5449873e2b07f94db07b7a3cdf2fa660432f65136b65e140597537`
- Unpaused NFT proxy: `0x4a0a12c6f31a6d9f7ba1db9b0ff592cc5d8d5f1e32f6c24d57077a06b88bed28`
- Marketplace implementation: `0x497a61b020753ef8d21392db37f98aba624ac6436aee85c8bf56d293c2c0290d`
- Marketplace proxy: `0x51ac3ff4f7fdea0f39fda9e66d5273df567d0a5310c3a9c13c287e25804666ce`
- Marketplace USDC whitelist: `0xd30de73abbb5cd4c6d9f013bd45a5f38c71755c704068a21613416de667cb245`

Current on-chain readiness:

- NFT `paused`: `false`
- Shop `saleActive`: `true`
- Shop authorized minter on NFT: `true`
- Native ETH payment allowed: `true`
- USDC payment allowed: `true`
- Max supply: `333`
- Marketplace native ETH accepted: `true`
- Marketplace USDC accepted: `true`

## Runtime Env

Use `nft/ink.env.example` as the operator template. The deployment JSON exists
and the shop is authorized as minter. Keep revenue treasury env values reviewed
before production sale traffic.

Important env names:

- `NFT_INK_RPC_URL` / `INK_RPC_URL`
- `NFT_INK_USDC_TOKEN`
- `GAME_SHOP_INK_TREASURY`
- `MARKETPLACE_INK_USDC_TREASURY`
- `NFT_INK_ROYALTY_RECEIVER`
- `VITE_NFT_INK_CONTRACT`

## API Surface

- `POST /api/nft/evm/quote` with `chain=ink`, `payment=usdc|eth|native`
- `POST /api/shop/evm/quote` with `chain=ink`, `payment=usdc|eth`
- `POST /api/shop/evm/redeem` with `chain=ink`
- `GET /api/nft/ink/:tokenId`
- `GET /api/nft/owned/ink/:address`
- Bridge endpoints accept `sourceChain` or `destChain` equal to `ink`
- Custodial marketplace config includes Ink once vault/treasury env is set
