# 05 — Aptos Move Module

## 1. Overview

Aptos has no NFT contract yet. We build a fresh Move module
(`demon_king::nft`) implementing:

- L1 mint with server-signed payment quote
- L2 / L3 upgrade with server-signed quote (verifies battle wins server-side)
- Bridge-burn that emits a structured event the server indexes
- Owner-only admin functions

Aptos's account model is fundamentally different from EVM:
- No proxy upgrades — modules are upgraded via Aptos's native code upgrade
  mechanism when published under a resource account with `upgrade_policy =
  compatible`. We use `Compatible` so all existing assets remain valid
  after future upgrades.
- "NFTs" on Aptos use the `aptos_token_objects` framework: every NFT is its
  own object (an account) with its own address.

This is a **5-day implementation effort** by itself.

---

## 2. Player Fantasy

Aptos players use a Petra/Pontem wallet, see the same Demon King mint flow,
upgrade and bridge their NFT to Base when they want to sell. Visual parity
with EVM.

---

## 3. Detailed Rules

### 3.1 Module path & deployment

```
addr: <resource_account>
module: demon_king::nft

Published with:
  upgrade_policy = Compatible
```

The resource account is derived deterministically from the master signer
(your wallet derived from the NFT_BASE mnemonic via Aptos derivation path
`m/44'/637'/0'/0'/0'`). Its address is recorded in
`nft/deployments/aptos-mainnet.json` after publish.

### 3.2 Storage

A single global `Config` resource lives at `@demon_king`:

```move
struct Config has key {
    quote_signer_pubkey: vector<u8>,   // ed25519 public key (32 bytes)
    bridge_signer_pubkey: vector<u8>,
    treasury: address,
    cop_token: address,                 // FungibleAsset metadata for CoP
    usdc_token: address,
    next_token_id: u64,                 // monotonic ID counter
    used_nonces: Table<u64, bool>,
    max_supply: u64,
    total_minted: u64,
    sale_active: bool,
    upgrade_price_octas: u64,           // 0 — payment off-module via FA transfer
    base_uri: String,
    collection_object: address,
}
```

Plus per-asset metadata via the standard `aptos_token_objects::token`
extended with our `Level` resource:

```move
struct Level has key {
    level: u8,    // 1, 2, or 3
}
```

This `Level` resource lives at each token's object address.

### 3.3 Entry functions

```move
public entry fun mint_with_quote(
    user: &signer,
    quantity: u64,
    price_octas: u64,
    nonce: u64,
    deadline: u64,
    signature: vector<u8>,
)
```

Verifies an ed25519 signature over `(user, quantity, price, nonce, deadline, chain_id=137)`
using `Config.quote_signer_pubkey`. Charges payment (FA transfer to
treasury). Mints `quantity` new tokens at L1.

```move
public entry fun upgrade_token(
    user: &signer,
    token: Object<DemonKingToken>,
    new_level: u8,
    price_octas: u64,
    nonce: u64,
    deadline: u64,
    signature: vector<u8>,
)
```

Verifies signature, checks current `level == new_level - 1`, checks
ownership, takes payment, updates the `Level` resource.

```move
public entry fun bridge_burn(
    user: &signer,
    token: Object<DemonKingToken>,
    target_evm_address: vector<u8>,    // 20 bytes
)
```

Captures the token's level into a `BridgeBurnEvent`, burns the token
(destroys the object), emits the event for the server indexer to pick up.

```move
public entry fun admin_set_signer(admin: &signer, new_signer: vector<u8>)
public entry fun admin_set_price(admin: &signer, new_price: u64)
public entry fun admin_pause(admin: &signer, paused: bool)
```

All admin functions check `signer::address_of(admin) == @demon_king`.

### 3.4 Bridge burn event

```move
#[event]
struct BridgeBurnEvent has drop, store {
    source_token_id: u64,
    source_owner: address,
    target_evm_address: vector<u8>,
    level: u8,
    timestamp: u64,
}
```

The server's Aptos indexer polls or subscribes to this event stream and
issues an EIP-712 receipt for Base mint upon confirmation.

### 3.5 Payment

USDC and CoP on Aptos are Fungible Assets (FA), not coins. Payment is a
**separate transaction** before the mint/upgrade call — the player first
transfers the FA to treasury, then submits the mint/upgrade tx whose
signature payload includes the FA transfer's transaction hash. The module
verifies the hash via `transaction_context::get_script_hash` or by checking
on-chain payment events. (Simpler alternative: bundle the FA transfer
in the same tx via `aptos_framework::transaction_validation::script_prologue`.)

Final decision on payment-coupling deferred to implementation phase, but
the security property is: **the module rejects mint/upgrade unless the
server's signature was issued AFTER the payment confirmed.**

### 3.6 Compatibility & upgrades

`upgrade_policy = Compatible` means future versions of the module can:
- Add new public entry functions.
- Add new struct fields (at the end).
- Change function bodies.

They CANNOT:
- Remove or rename public entry functions.
- Reorder existing struct fields.

This is enforced by Aptos's bytecode verifier — incompatible upgrades
revert at publish time.

---

## 4. Formulas

### Token ID assignment

```
new_token_id = Config.next_token_id + 1
Config.next_token_id += 1
```

Token IDs are monotonic per chain.

### Token object seed

```
seed = b"DEMON_KING_" || to_bytes(new_token_id)
object_addr = create_named_object(seed)
```

Deterministic: anyone can compute the object address from the token ID.

### Bridge level encoding

```
bridge_payload = abi.encode(
    sourceChainId: 137,           // Aptos canonical chain ID we choose for EIP-712
    sourceTokenId: token_id,
    to: target_evm_address,
    level: level,
    receiptId: keccak256(burn_tx_hash),
    deadline: now + 24h
)
```

`receiptId = keccak256(burn_tx_hash)` ensures each burn gives exactly one
receipt.

---

## 5. Edge Cases

| Case | Handling |
|------|----------|
| Aptos network forks or rolls back the burn tx | Server waits for finality (10 epochs) before issuing receipt. |
| Player transfers token between quote and mint | Module checks `is_owner(user, token)` at execution time. |
| Token object is frozen | Reject upgrade and bridge. |
| Payment FA transfer is to wrong recipient | Server's payment validator catches this and refuses to sign. |
| Upgrade nonce reuse | `Config.used_nonces[nonce]` flag rejects. |
| Resource account key rotated | Old module remains, but new entries blocked at admin functions. |
| FA mint authority on USDC/CoP misconfigured | Out of our control; we just use canonical FA addresses. |

---

## 6. Dependencies

- Aptos signer derived from `NFT_BASE` mnemonic via `m/44'/637'/0'/0'/0'`.
- Treasury account (`4dJVN3sQ…qjHA` is Solana; Aptos uses a different account
  also derived from NFT_BASE — see `aptos-mainnet.json` after deploy).
- New server endpoints `/nft/aptos/quote`, `/nft/aptos/upgrade-quote`,
  `/nft/aptos/bridge-init` (Phase 6).
- Aptos indexer for `BridgeBurnEvent` (Phase 6).

---

## 7. Tuning Knobs

| Knob | Default | Where |
|------|---------|-------|
| Quote signer pubkey | server pubkey | `admin_set_signer` |
| Upgrade USDC amount | $8.9 | Server env (same as other chains) |
| Max supply | 500 | Hardcoded in Config at init |
| Sale active | true at init | `admin_pause(false)` |

---

## 8. Acceptance Criteria

- [ ] Module compiles under `aptos move compile` with no warnings.
- [ ] Module publishes to mainnet under a resource account.
- [ ] An L1 mint with a valid server quote produces a token at L1 in the
      player's wallet.
- [ ] An L2 upgrade with valid quote and L1 → L2 transition succeeds.
- [ ] An L1 → L3 upgrade attempt reverts with `EINVALID_LEVEL_TRANSITION`.
- [ ] A burn emits `BridgeBurnEvent` with the correct level.
- [ ] The server indexer picks up the event within 60 s and issues a Base
      receipt that successfully mints on Base V3.
- [ ] Admin pause prevents new mints/upgrades but allows reads.
- [ ] Module upgrade test: deploy v2 of the module (adding a new event field),
      verify existing tokens still readable.
