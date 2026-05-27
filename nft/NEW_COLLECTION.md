# Voidspore 555 NFT Collection

This is the prepared contract/deploy path for the Voidspore NFT collection that uses
the same model as the current V3 Demon King system:

- global target supply: 555 across all chains;
- collection slug: `voidspore`;
- name/symbol: `Voidspore` / `VOID`;
- levels: 1, 2, 3;
- server-signed upgrade quotes;
- burn-and-mint bridge receipts;
- EIP-2981 royalties;
- EIP-4906 metadata refresh;
- default price: $5.50, CoP price: $4.00, SKR price: $5.00;
- sale stays paused/closed until art and metadata endpoints are ready.

Level art is wired to server metadata routes:

```text
L1: server/public/nft/voidspore/L1.png
L2: server/public/nft/voidspore/L2.png
L3: server/public/nft/voidspore/L3.jpg
```

Metadata/image endpoints:

```text
https://clashofperps.fun/api/nft/voidspore/image/1
https://clashofperps.fun/api/nft/voidspore/base/1
https://clashofperps.fun/api/nft/voidspore/base/contract
https://clashofperps.fun/api/nft/voidspore/solana/collection
https://clashofperps.fun/api/nft/voidspore/solana/hidden
```

Server quote/config endpoints:

```text
GET  /api/nft/voidspore/mint/config
POST /api/nft/voidspore/base/quote
POST /api/nft/voidspore/arbitrum/quote
POST /api/nft/voidspore/monad/quote
```

## EVM Chains

Supported now: Base, Arbitrum, Monad.

Compile:

```bash
cd nft
npm run compile:base
```

Deploy the NFT proxy:

```bash
npm run deploy:collection:evm -- --collection=voidspore --chain=base
npm run deploy:collection:evm -- --collection=voidspore --chain=arbitrum
npm run deploy:collection:evm -- --collection=voidspore --chain=monad
```

Deploy the shop proxy and authorize it as minter:

```bash
npm run deploy:collection:shop -- --collection=voidspore --chain=base
npm run deploy:collection:shop -- --collection=voidspore --chain=arbitrum
npm run deploy:collection:shop -- --collection=voidspore --chain=monad
```

The scripts write:

```text
nft/deployments/<slug>-base-mainnet.json
nft/deployments/<slug>-base-shop-mainnet.json
nft/deployments/<slug>-arbitrum-mainnet.json
nft/deployments/<slug>-arbitrum-shop-mainnet.json
nft/deployments/<slug>-monad-mainnet.json
nft/deployments/<slug>-monad-shop-mainnet.json
```

Useful env overrides:

```env
NFT_COLLECTION_SLUG=voidspore
NFT_COLLECTION_NAME=Voidspore
NFT_COLLECTION_SYMBOL=VOID
NFT_COLLECTION_GLOBAL_SUPPLY_CAP=555
NFT_COLLECTION_MAX_SUPPLY=555
NFT_COLLECTION_MAX_PER_TX=10
NFT_COLLECTION_QUOTE_SIGNER=0x...
NFT_COLLECTION_ROYALTY_RECEIVER=0x...
NFT_COLLECTION_ROYALTY_BPS=250
NFT_COLLECTION_USD_PRICE=5.5
NFT_COLLECTION_CLASH_USD_PRICE=4
NFT_COLLECTION_SKR_USD_PRICE=5
```

Per-collection/per-chain env keys also work. For Voidspore, use:

```env
NFT_VOIDSPORE_BASE_TOKEN_URI=https://clashofperps.fun/api/nft/voidspore/base/
NFT_VOIDSPORE_BASE_CONTRACT_URI=https://clashofperps.fun/api/nft/voidspore/base/contract
NFT_VOIDSPORE_BASE_USDC_TOKEN=0x...
NFT_VOIDSPORE_BASE_CLASH_TOKEN=0x...
```

Default token URI pattern:

```text
https://clashofperps.fun/api/nft/<slug>/<chain>/<tokenId>
```

## Solana

Solana uses Metaplex Core Candy Machine. The new script defaults to 555 and
does not touch the existing Demon King Solana deployment. This is Metaplex
Core, not Token-2022.

```bash
npm run deploy:collection:solana -- --collection=voidspore
```

Output:

```text
nft/deployments/<slug>-solana-mainnet.json
```

Default hidden metadata URI:

```text
https://clashofperps.fun/api/nft/<slug>/solana/hidden
```

Sale is closed by default with a far-future start date. Set
`NFT_COLLECTION_SOLANA_SALE_ACTIVE=1` only for launch.

Default Solana payment groups:

```text
SOL  = $5.50 equivalent
USDC = 5.500000 USDC
SKR  = $5.00 equivalent when NFT_COLLECTION_SOLANA_SKR_MINT is set
```

Solana levels use the Metaplex Core `Attributes` plugin with `level=1|2|3`.
Assets with no `level` attribute are treated as level 1 by the server. To set
the attribute explicitly for a minted asset:

```bash
npm run solana:level -- --collection=voidspore --action=add --asset=<asset> --level=1
npm run solana:level -- --collection=voidspore --action=set --asset=<asset> --level=2
```

## Aptos

The current Aptos Move module in `nft/move/clash_nft` already mirrors the V3
model, but it is single-collection per publisher address. For a second
collection, deploy the same model from a separate Aptos publisher address or
clone the module under a new named address before mainnet publish.

Use `max_supply=555`, the new collection name/URI, and the same quote signer
pattern documented in `nft/move/README.md`.
