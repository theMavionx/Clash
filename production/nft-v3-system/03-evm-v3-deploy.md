# 03 — Arbitrum & Monad V3 Upgrade

## 1. Overview

Arbitrum (`0x5cc8…9f3f` proxy) and Monad (`0x5cc8…9f3f` proxy) both run the
same `DemonKingBaseV2` implementation as Base. Both proxies have zero NFTs
minted and zero historical state — they are UUPS-upgradeable, owned by the
same deployer wallet. We perform the same `upgradeToAndCall` operation as on
Base, using the **same V3 implementation contract code** but a separately
deployed implementation on each chain (implementations are not shared across
chains).

Total scope: 2 implementation deploys + 2 upgrade transactions + verification.

---

## 2. Player Fantasy

Identical to Base — players on Arbitrum and Monad see no difference in their
wallet, but new upgrade and bridge features become available.

---

## 3. Detailed Rules

### 3.1 Implementation per chain

Implementations are deterministic by `(deployer, nonce)` and live on each
chain independently. We deploy a fresh `DemonKingBaseV3` implementation on:

- Arbitrum
- Monad

…using the existing deploy script `nft/scripts/deploy-evm-v3-impl.mjs`
(new, written for this phase). The script takes `--chain=arbitrum` or
`--chain=monad`.

### 3.2 Upgrade transaction

For each chain:

```javascript
proxy.upgradeToAndCall(
  newV3ImplAddress,
  v3.interface.encodeFunctionData('initializeV3', [
    UPGRADE_SIGNER,
    BRIDGE_SIGNER,
    0,                    // upgradePrice in wei (USDC handled off-chain)
    TREASURY,             // 0xC024884ad9C5540996492Cc2DD080964941A3094
    250,                  // royaltyBps 2.5%
    'https://clashofperps.fun/cdn/nft/'
  ])
);
```

### 3.3 Storage compatibility

Same analysis as [02-base-v3-upgrade.md](02-base-v3-upgrade.md) §3. Arbitrum
and Monad share V2's storage layout exactly (same implementation source);
therefore V3's storage layout is also compatible. The same
`check-storage-layout.mjs` script is used.

### 3.4 Per-chain deployment file additions

After upgrade, update each deployment JSON to record V3 state:

```json
{
  "chain": "arbitrum",
  "chainId": 42161,
  "proxy": "0x5cc8…9f3f",
  "implementationV2": "0x8fc6…255a",
  "implementationV3": "0x<newImpl>",
  "implementationV3TxHash": "0x…",
  "upgradeToAndCallTxHash": "0x…",
  "v3InitializedAt": "2026-MM-DDTHH:MM:SSZ",
  ...rest unchanged
}
```

This keeps audit history of every implementation ever pointed to by the proxy.

### 3.5 No data loss

- Arbitrum totalMinted=0 → 0 after upgrade
- Monad totalMinted=0 → 0 after upgrade
- maxSupply, maxPerTx, baseTokenURI all preserved
- New mappings (`_tokenLevelRaw`, `usedUpgradeNonces`, etc.) start empty

### 3.6 Shop contract impact (none)

`DemonKingBaseShopV2` on Arbitrum and Monad **does not need an upgrade**.
It mints NFTs via the V3 NFT proxy's `adminMint(address, quantity)`
function, which is preserved from V2. The shop continues to work unchanged
for L1 mints.

For L2/L3 upgrade payments via USDC/CoP, see
[08-server-architecture.md](08-server-architecture.md) §5. That flow uses a
**separate `DemonKingUpgradeShop`** contract introduced in this phase, or
extends the existing shop with a new entrypoint — decision deferred to
implementation.

---

## 4. Formulas

(No chain-specific math; same as Base. See [02-base-v3-upgrade.md](02-base-v3-upgrade.md) §4.)

---

## 5. Edge Cases

| Case | Handling |
|------|----------|
| Wrong RPC URL during deploy | Deploy script asserts `chainId == expected` after `getChainId()` call. Fails fast. |
| Implementation deployed but `upgradeToAndCall` reverts | Implementation is harmless on its own; can retry the upgrade tx. |
| Upgrade succeeds but `initializeV3` fails | The proxy now points to V3 impl but state is uninitialized. `upgradeToAndCall` atomically reverts if init reverts — no half-state possible. |
| Existing pending mint tx in mempool during upgrade | Will succeed against V3 because mint ABI is unchanged from V2; V3 inherits V2. |
| Wrong-chain replay of upgrade signature | EIP-712 domain separator includes chainId; cross-chain replay impossible. |

---

## 6. Dependencies

- Phase 1 ([02-base-v3-upgrade.md](02-base-v3-upgrade.md)) must complete first.
- The V3 implementation Solidity is identical across chains — no per-chain
  source forks.

---

## 7. Tuning Knobs

Same as Base ([02-base-v3-upgrade.md](02-base-v3-upgrade.md) §8).

---

## 8. Acceptance Criteria

For both Arbitrum and Monad:

- [ ] V3 implementation deployed on the chain.
- [ ] `upgradeToAndCall(V3, initData)` succeeds.
- [ ] `tokenLevel(1)` reverts cleanly with `ERC721NonexistentToken` (no tokens minted yet — correct behavior).
- [ ] `royaltyInfo(1, 1 ether)` returns `(treasury, 0.025 ether)`.
- [ ] `supportsInterface(0x2a55205a)` and `(0x49064906)` both true.
- [ ] Existing Shop V2 still successfully mints an L1 NFT through `adminMint`.
- [ ] `tokenLevel` of the newly minted token returns 1.
- [ ] A bridge mint with a valid receipt succeeds and produces level-correct token.
