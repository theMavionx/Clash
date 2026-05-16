# Clash NFT on Aptos (Move module)

V3-feature-parity NFT module mirroring `DemonKingBaseV3` on Base/Arbitrum/Monad.

## Status

**v3-deployed on devnet ✓** — module compiles clean, publishes, and
initializes correctly. Mainnet deploy uses the same procedure with real
USDC FA address + production quote-signer pubkey.

### Devnet deployment (2026-05-16, aptos-cli 9.2.0)

| Field | Value |
|-------|-------|
| Module | `0x9f4f15cb98622264a18b86bc246599a7d0288a5d20a78fece58eb0a04f2ac440::demon_king` |
| Collection object | `0xe90783c291e3b6fad5b0c2ef1aa85e972ad3bbe133ae433ccdc52e409f239b2e` |
| Resource account (mint authority) | `0x900ca1dfff6a6fe76e669d29e40c676fb1f280d3b7a9e0c80bc525f69b01f942` |
| Publish tx | [`0x08ad1eb2…`](https://explorer.aptoslabs.com/txn/0x08ad1eb2e02ef55e685ea1f3c06d63c75a21b5f8aaf98f061dee5f209c64e91e?network=devnet) (gas 59 316) |
| Initialize tx | [`0x97e01e7d…`](https://explorer.aptoslabs.com/txn/0x97e01e7dc46263c130b5d8f26cbcce58bb13da878f460de49f8910af8deca8ab?network=devnet) (gas 17 491) |
| View state | max_supply=500, total_minted=0, upgrade_price=$8.9 ✓ |

Full state saved at [`nft/deployments/aptos-devnet.json`](../deployments/aptos-devnet.json).

### What this module implements

- ✓ Resource-account-based collection ownership (`SignerCapability` stored
  in `Config`, derived at `initialize` time).
- ✓ `mint_with_quote(...)` — ed25519-verified server quote, USDC payment
  via FA primary store, level=1 attached via PropertyMap, MutatorRef
  persisted in a per-token `TokenRefs` resource for later mutations.
- ✓ `upgrade_with_quote(...)` — exactly +1 level bump, server-signed quote,
  USDC payment, nonce-based replay protection, reads the stored
  MutatorRef to update the level attribute.
- ✓ `bridge_burn(...)` — transfers token to resource account ("soft burn")
  and emits `BridgeBurnEvent` carrying level + destination chain id;
  the off-chain indexer relays it as an EIP-712 receipt to Base.
- ✓ Admin setters: sale active, mint price, upgrade price, treasury,
  quote signer pubkey, max supply.
- ✓ View helpers: total_minted, max_supply, sale_active, treasury,
  collection_addr, resource_addr, quote_signer_pubkey, upgrade_price,
  token_level.

### Resolved issues

The three issues noted in the prior draft are fixed:

1. ✓ **PropertyMap mutator-ref persistence** — added `TokenRefs` resource
   stored at each token's own address; `upgrade_with_quote` borrows it via
   `borrow_global<TokenRefs>(token_address)` and uses `&refs.mutator` for
   `property_map::update_typed`. `acquires Config, TokenRefs` added on
   the function.

2. ✓ **`get_token_index` stub** — removed. `bridge_burn` now reads
   `token_index` directly from `TokenRefs`.

3. ✓ **`inline fun assert_admin`** — accepted by aptos-cli 9.2.0 / Move
   compiler 1.x. No syntax adjustment needed.

## To deploy to mainnet

1. Install Aptos CLI on Windows (one-shot binary, no Python required):
   ```powershell
   curl -L -o aptos.zip https://github.com/aptos-labs/aptos-core/releases/download/aptos-cli-v9.2.0/aptos-cli-9.2.0-Windows-x86_64.zip
   Expand-Archive aptos.zip .
   ./aptos.exe --version    # should print: aptos 9.2.0
   ```
   (Linux/macOS: `curl -fsSL https://aptos.dev/scripts/install_cli.sh | sh`)

2. Initialize a mainnet profile using the same `NFT_BASE` mnemonic that
   secures the EVM and Solana signers. Derive the Aptos private key via
   BIP-44 path `m/44'/637'/0'/0'/0'` and pass it as `--private-key`:
   ```
   aptos init --network mainnet --private-key <hex>
   ```

3. Compile + publish:
   ```
   cd nft/move/clash_nft
   aptos move compile --named-addresses clash_nft=<deployer_addr>
   aptos move publish --named-addresses clash_nft=<deployer_addr> --assume-yes
   ```

4. Call `initialize` with mainnet parameters (replace `<USDC_FA>` with the
   real Aptos USDC fungible-asset metadata address, and
   `<quote_signer_pubkey>` with the 32-byte ed25519 pubkey of the server
   signer):
   ```
   aptos move run \
     --function-id "<deployer_addr>::demon_king::initialize" \
     --args 'string:Demon King' \
            'string:Clash of Perps Genesis Demon King NFT collection' \
            'string:https://clashofperps.fun/api/nft/aptos/collection' \
            'string:https://clashofperps.fun/api/nft/aptos/' \
            'u64:500' 'u64:10' 'u64:8900000' 'u64:8900000' \
            'address:<treasury>' \
            'address:<USDC_FA>' \
            'hex:0x<quote_signer_pubkey>' \
     --assume-yes
   ```

5. Activate sale when ready:
   ```
   aptos move run --function-id "<deployer_addr>::demon_king::set_sale_active" \
     --args 'bool:true' --assume-yes
   ```

6. Save the deployment info to `nft/deployments/aptos-mainnet.json` (use
   the existing `aptos-devnet.json` as a template). The server's
   `routes.js` picks it up automatically for supply tracking.

## EIP-712 equivalent for quotes

Aptos doesn't use EIP-712. The server signs a BCS-concatenated message
with ed25519:

- **Mint quote**: `buyer ‖ usdc_amount ‖ quantity ‖ nonce ‖ deadline ‖ account_hash`
- **Upgrade quote**: `owner ‖ token_addr ‖ new_level (u8) ‖ usdc_amount ‖ nonce ‖ deadline`

The server uses the **same `NFT_BASE` mnemonic** as for EVM signing,
derived via Aptos's BIP-44 path. Single key to rotate.

## Integration with the server

After deployment, write `nft/deployments/aptos-mainnet.json`:

```json
{
  "chain": "aptos",
  "module": "<deployer_addr>::demon_king",
  "collection": "<collection_object_addr>",
  "resourceAccount": "<resource_account_addr>",
  "treasury": "<treasury_addr>",
  "usdcMetadata": "<USDC_FA_addr>",
  "quoteSignerPubkey": "0x<32 bytes>",
  "mintUsdPriceE6": 8900000,
  "upgradeUsdPriceE6": 8900000,
  "deployedAt": "..."
}
```

`server/routes.js` already reads this for `readAptosNftMintedCount()`. Add
analogous handlers for `/nft/aptos/mint/quote`, `/nft/aptos/upgrade/quote`,
and `/bridge/init?source=aptos`.

## Cost

- Module publish: ~$0.50
- `initialize` call: ~$0.01
- Per-mint gas: ~$0.001
- Per-upgrade gas: ~$0.0015

Total upfront: under $1.
