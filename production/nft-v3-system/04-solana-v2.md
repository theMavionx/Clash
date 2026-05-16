# 04 — Solana Level Attribute & Upgrade Flow

## 1. Overview

Solana NFTs were minted via Metaplex Core Candy Machine
(`9jQn…jWAu`) in `hidden-settings` mode. There is **no upgradeable program**
the way EVM has UUPS proxies — but Metaplex Core supports a `MutableAttributes`
plugin on each asset, which the **update authority** can write to without
user signature. We use this plugin to store `level`.

This document specifies:
- How to attach the level attribute to all 7 existing assets (migration).
- How to attach the level attribute to every new mint (server hook).
- How the upgrade flow works (player pays, server flips the attribute).
- How the bridge-burn flow on Solana works.

The candy machine itself is unchanged. New L1 mints continue through the
existing flow.

---

## 2. Player Fantasy

For Solana players, the experience matches EVM: their NFT shows L1, they pay
$8.9 USDC or 5 CoP, the attribute flips to L2, the image swaps. No new
wallet adapters, no new programs to interact with.

---

## 3. Detailed Rules

### 3.1 Authority chain

```
Candy Machine update_authority = "BoioDvoTv4sbpfYb2M533732vfkJrsqKF7BvEpxz7iau"
                                  └─ derived from NFT_BASE mnemonic (Solana)
```

This account is also the **collection update authority**. It can:
- Add/update plugins on any minted asset in the collection.
- Sign attribute mutation transactions without user signature.

**Critical:** the level attribute is server-controlled, NOT user-controlled.
Players never sign an attribute write directly; the server signs as the
update authority after verifying payment + win count.

### 3.2 Level storage

Each asset gets a `Attributes` plugin (Metaplex Core's mutable-attribute
primitive). The plugin holds:

```rust
attributes_list: vec![
    Attribute { key: "level".to_string(), value: "1".to_string() }
]
```

After upgrade:

```rust
attributes_list: vec![
    Attribute { key: "level".to_string(), value: "2".to_string() }
]
```

The on-chain attribute is the source of truth for level. The server's
metadata endpoint reads it via `getAsset()` and returns the right image URI.

### 3.3 Migration of 7 existing assets

A one-time script `nft/scripts/solana-migrate-l1.mjs`:

1. Lists all assets in the collection via Metaplex Core's `fetchAssetsByCollection`.
2. For each asset, checks if it has the `Attributes` plugin.
3. If missing, sends an `addPlugin` instruction with `level=1`.
4. If present and `level` key missing, sends `updatePlugin` to add the key.
5. Tracks progress in `nft/deployments/solana-migration-l1.log.json` so
   re-runs are idempotent.

Cost: ~0.001 SOL rent per asset × 7 = ~0.007 SOL (~$0.70). Paid by treasury.

### 3.4 New mints — auto-attach plugin

The existing Solana mint flow (in `server/routes.js` Solana mint endpoint)
already returns a server-signed memo. We extend it: **immediately after the
candy machine mint tx confirms**, the server submits a second tx as the
update authority to add the level=1 plugin to the new asset.

This happens in `nft/scripts/finalize-solana-mint.mjs` (background worker
invoked by the mint confirmation handler). If this second tx fails for any
reason, the asset still exists at L1 by default in the server's resolver —
but a retry loop attempts to attach the plugin every 60 s for 24 h. After
24 h, an admin alert is emitted.

### 3.5 Upgrade flow on Solana

Mirror of the EVM upgrade flow, but with a different signing scheme:

1. Player presses **Upgrade** in UI.
2. UI calls `POST /api/nft/solana/upgrade-quote` with the asset address.
3. Server:
   - Verifies the asset is owned by the connected wallet.
   - Reads on-chain `level` (must be `< 3`).
   - Reads battle wins for `(solana, asset_address)` — must meet threshold.
   - Returns a payment instruction: send $8.9 USDC (or 5 CoP) to treasury
     `4dJVN3sQSCjeypkc8knCaRQmeT68upDQwZY7a9s8qjHA` with a server-issued
     memo `upgrade:<asset>:<targetLevel>:<nonce>`.
4. Player wallet signs and submits the payment tx.
5. UI polls `POST /api/nft/solana/upgrade-finalize` with the tx signature.
6. Server:
   - Verifies tx is confirmed.
   - Verifies recipient = treasury, amount = quote amount, memo matches.
   - Marks nonce as used.
   - Submits the **attribute-mutation tx** as update authority, flipping
     level to `targetLevel`.
   - Returns `{ ok: true, level: targetLevel }`.

No user-signed Solana program calls beyond the payment — the upgrade itself
is server-authored.

### 3.6 Anti-replay & atomicity concerns

- Each upgrade payment has a unique server-issued nonce embedded in the
  memo. Server's DB tracks consumed nonces (`upgrade_nonces` table). Replay
  of the same payment tx → second `upgrade-finalize` returns "nonce used".
- If the server crashes between step 6's "mark nonce used" and "submit
  attribute tx", restart-recovery checks payments awaiting attribute-write
  and retries. (Detail in [08-server-architecture.md](08-server-architecture.md) §6.)
- The attribute-write tx itself is **server-paid** (~0.00005 SOL each) and
  retried with exponential backoff on RPC failure.

### 3.7 Bridge-burn on Solana

For the bridge to Base, Solana assets are **burned** (not transferred). Use
Metaplex Core's `burn` instruction:

1. Player initiates bridge via UI.
2. UI calls `POST /api/nft/bridge/init` with `{ chain: 'solana', asset, target_evm_address }`.
3. Server returns a burn instruction the player signs and submits.
4. Server polls for confirmation and reads `level` from the asset's last-known
   state **before** burn confirms — we capture this at quote-time and bind it
   to the bridge nonce.
5. Once burn confirmed, server signs an EIP-712 `BridgeReceipt` for Base.
6. Player submits the receipt to Base V3's `bridgeMint()`.

The "capture level before burn" requirement means the server records the
asset's level when it returns the burn instruction. If the player upgrades
the asset between quote-time and burn-time, the bridge receipt could
under-report the level. To prevent that, the quote includes a deadline of
≤ 5 minutes — short enough that an interleaved upgrade is operationally
implausible. Detail in [06-bridge.md](06-bridge.md) §4.

---

## 4. Formulas

### Payment amount in USDC

Same as EVM:
```
usdc_amount = $8.9 × 10^6  (6 decimals)
```

### Payment amount in CoP (Solana SPL token, 6 decimals)

```
cop_amount = $5 × 10^6 / cop_usd_oracle_price
```

where `cop_usd_oracle_price` is fetched from the existing
`fetchSplTokenUsdPrice` function in `server/routes.js`.

### Attribute write rent cost (server-paid)

```
rent_lamports = 5000  // exempt rent base for Attributes plugin
tx_fee = 5000         // 1 signature
total = 10000         // ~0.00001 SOL per write
```

Negligible — budget $50 in SOL covers 5M attribute writes.

---

## 5. Edge Cases

| Case | Handling |
|------|----------|
| Existing asset already has `level` attribute (e.g., migration ran twice) | Script checks and skips. Idempotent. |
| Player burns NFT directly (not via bridge UI) | No bridge receipt issued; NFT is gone with no Base mint. Player loses the asset. UI must clearly warn against direct burns. |
| Asset frozen (rare Metaplex state) | Upgrade flow checks `frozen=false` before allowing payment; rejects with "asset frozen, contact support". |
| Server's Solana RPC outage | Upgrade quote queue persists; retry on RPC restore. Player sees "processing" state for up to 1 hour. |
| User pays but server fails to attribute-write 100× | After 24 h of retries, mark for manual intervention. Refund or compensation per case. |
| Race: user transfers asset between payment and attribute-write | Owner check at finalize step rejects if asset moved. Refund handler invoked. |

---

## 6. Dependencies

- Existing Metaplex Core Candy Machine (`9jQn…jWAu`) — verified update authority is ours.
- `@metaplex-foundation/mpl-core` SDK (already in repo for mint flow).
- New server module `server/solana-upgrade.js` (Phase 6).
- `solana_upgrade_nonces` DB table (Phase 6).

---

## 7. Tuning Knobs

| Knob | Default | Where |
|------|---------|-------|
| Upgrade USDC amount | $8.9 × 10^6 | Server env `NFT_UPGRADE_USDC_E6` |
| Upgrade CoP USD price | $5 | Server env `NFT_UPGRADE_COP_USD` |
| Migration batch size | 10 assets per tx | Script flag `--batch=10` |
| Attribute write retry interval | 60 s | Server env `SOLANA_ATTR_RETRY_SECONDS` |
| Bridge quote TTL | 300 s | Server env `NFT_BRIDGE_DEADLINE_SECONDS` |

---

## 8. Acceptance Criteria

- [ ] All 7 existing Solana assets have `Attributes` plugin with `level=1` after migration script.
- [ ] Migration script is idempotent (running twice produces no double-write).
- [ ] A fresh L1 mint receives the `level=1` attribute within 60 s of mint confirmation.
- [ ] Player can upgrade L1 → L2 on Solana via UI: payment confirms, attribute flips, image swaps within 30 s.
- [ ] Replay of same upgrade payment tx fails with "nonce used".
- [ ] Player cannot upgrade an asset they don't own.
- [ ] A burned Solana asset's `level` is captured into the bridge receipt
  before burn confirmation, and the Base mint reflects that exact level.
- [ ] Server-paid attribute-write retries succeed without manual intervention
  for transient RPC failures.
