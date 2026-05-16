# 06 — Cross-Chain Bridge (Burn → Mint on Base)

## 1. Overview

A **one-way bridge** moves any NFT from Arbitrum, Monad, Solana, or Aptos
to Base, preserving its level. The mechanism is **burn-and-mint**:

```
Source chain                Server                       Base
─────────────               ──────                       ────
1. Player triggers burn
2. Player signs + submits burn tx
3. Source contract emits BridgeBurn event
                            4. Indexer detects event
                            5. Reads level from event payload
                            6. Signs EIP-712 BridgeReceipt
                            7. Returns receipt to player UI
8. Player calls bridgeMint(receipt, sig) on Base V3
                                                          9. Base V3 verifies sig + nonce
                                                          10. Mints new NFT at receipted level
                                                          11. Emits BridgeMint event
                            12. Server copies wins row to new (base, tokenId)
                            13. Server marks bridge job complete
```

End state: NFT no longer exists on source, equivalent NFT exists on Base
with the same level and inherited battle-win history.

---

## 2. Player Fantasy

"I have an NFT on Arbitrum but I want to sell it on the Base marketplace.
I click Bridge → Confirm two transactions → Wait 1-2 minutes → My NFT
appears on Base with my battle history and level preserved."

---

## 3. Detailed Rules

### 3.1 Eligibility

A player can bridge:

- Any NFT they own on Arbitrum, Monad, Solana, or Aptos.
- At any level (1, 2, or 3).
- Any number of times across different NFTs (no rate limit beyond gas cost).

A player **cannot**:

- Bridge a Base-native NFT (no source-chain to mint back on; bridge is
  one-way).
- Bridge an NFT they don't own (signature/event mismatch).
- Bridge with an expired receipt (24 h TTL).
- Replay a receipt (nonce-protected on Base).

### 3.2 Source-side mechanism per chain

| Chain | Burn function | Event |
|-------|---------------|-------|
| Arbitrum | `bridgeBurn(uint256 tokenId, address targetEvm)` on V3 NFT contract | `BridgeBurn(sourceTokenId, owner, level, targetEvm)` |
| Monad | Same as Arbitrum | Same |
| Solana | Metaplex Core `burn` ix + memo `bridge:<targetEvm>` | Server polls confirmed tx with memo |
| Aptos | `bridge_burn` entry function | `BridgeBurnEvent` Move event |

EVM V3 contracts (Base, Arbitrum, Monad) all expose:

```solidity
function bridgeBurn(uint256 tokenId, address targetEvm) external nonReentrant {
    require(ownerOf(tokenId) == msg.sender, "Not owner");
    uint8 level = tokenLevel(tokenId);
    _burn(tokenId);
    emit BridgeBurn(tokenId, msg.sender, level, targetEvm, block.chainid);
}
```

**Note**: Base's V3 also has this function, but the server **refuses to
issue a Base→Base bridge receipt** (would mint a duplicate). The function
exists on Base only for symmetry/code reuse.

### 3.3 Server-side orchestrator

A new module `server/bridge-orchestrator.js` runs as part of the main server
process. It:

1. Subscribes to `BridgeBurn` events on each EVM chain (via viem
   `watchContractEvent`).
2. Polls Solana for confirmed burn txs with the right memo pattern.
3. Polls Aptos for `BridgeBurnEvent`s via the indexer API.
4. For each event:
   - Validates chain finality (≥ 2 confirmations on EVM, ≥ 12 epochs on Aptos, ≥ 32 slots on Solana).
   - Idempotently writes a `bridge_jobs` row.
   - Signs an EIP-712 `BridgeReceipt` with the bridge signer wallet.
   - Stores the signature.
5. Client polls `GET /api/nft/bridge/status/<job_id>` to retrieve the
   receipt when ready.

### 3.4 Receipt format (EIP-712)

Domain:

```
{
  name: "DemonKingBase",
  version: "3",
  chainId: 8453,           // Base — receipt is verified on Base
  verifyingContract: <Base V3 proxy>
}
```

Type:

```
BridgeReceipt(uint16 sourceChainId,uint256 sourceTokenId,address to,uint8 level,bytes32 receiptId,uint256 deadline)
```

Where:
- `sourceChainId`: 42161 (Arbitrum), 143 (Monad), 999 (Solana — our canonical), 137 (Aptos — our canonical).
- `sourceTokenId`: numeric ID for EVM, derived numeric for Solana/Aptos (server maintains the mapping).
- `to`: player's Base address.
- `level`: 1..3 read from source at burn time.
- `receiptId`: `keccak256(sourceChainId || sourceTxHash || sourceTokenId)`, deterministic per burn.
- `deadline`: `block.timestamp + 24h`.

The signer is the **bridge signer wallet** stored in `bridgeQuoteSigner` on
each V3 contract. We use a separate signer key from the upgrade signer so
that if one key is compromised, the other domain is unaffected.

### 3.5 Replay protection

Three layers:

1. **`receiptId` deterministic from source tx**: if a player replays the
   same burn tx (impossible on-chain but theoretical), it produces the
   same receiptId, so re-submission to Base hits `usedBridgeReceipts[id]
   = true` and reverts.
2. **`usedBridgeReceipts` mapping on Base V3**: prevents reuse.
3. **EIP-712 deadline**: receipt expires in 24 h.

### 3.6 Battle-win migration

On a successful `BridgeMint` event on Base, the orchestrator:

```sql
INSERT INTO nft_battle_wins (chain, token_id, wins, last_update)
SELECT 'base', :newBaseTokenId, wins, last_update
FROM nft_battle_wins
WHERE chain = :sourceChain AND token_id = :sourceTokenId;

DELETE FROM nft_battle_wins
WHERE chain = :sourceChain AND token_id = :sourceTokenId;
```

If no wins row existed (the NFT had never battled), nothing happens.

This is atomic at the DB level — wrap in a transaction. Reconciliation job
runs daily to catch any missed migrations.

### 3.7 Failure modes & recovery

| Failure | Detection | Recovery |
|---------|-----------|----------|
| Burn confirmed but server didn't pick up event | Orchestrator re-scans block range on restart from `last_scanned_block` cursor. | Auto-resume on next start. |
| Server signed receipt but player loses it (browser close) | Player can re-request via `GET /api/nft/bridge/status/<job_id>` — receipts persist 30 days. | Trivial. |
| Player never submits receipt to Base | Receipt expires after 24 h. Player must restart with new burn (their old NFT is gone — permanent loss). | UI must aggressively warn about deadline. |
| Player submits receipt twice to Base | Second call reverts `Receipt used`. | Normal. |
| Bridge signer key compromised | Owner calls `setBridgeQuoteSigner(newSigner)` on all chains. Old signatures already issued become invalid because verifier checks current `bridgeQuoteSigner`. Players with un-redeemed receipts must contact support for re-issuance with new signer (server can re-sign because the burn event is still on-chain). | Documented in incident runbook. |
| Source chain reorgs after burn | Server waits for finality (varies per chain) before issuing receipt. If reorg deeper than finality threshold occurs, we are at risk of mint-without-burn. Mitigation: finality threshold per chain is conservative (2 conf Arbitrum, 12 epochs Aptos, 32 slots Solana). | Acceptable risk. |

### 3.8 Bridge orchestrator state machine

```
NEW           — burn event observed, not yet finalized
FINALIZED     — burn passed finality threshold
SIGNED        — receipt issued; player can claim
CLAIMED       — Base bridgeMint succeeded (observed by Base event listener)
EXPIRED       — 24 h passed without claim; NFT permanently lost
FAILED        — manual intervention needed (e.g., signer compromised mid-flight)
```

Stored in `bridge_jobs` table:

```sql
CREATE TABLE bridge_jobs (
  job_id              TEXT PRIMARY KEY,
  source_chain        TEXT NOT NULL,
  source_tx_hash      TEXT NOT NULL,
  source_token_id     TEXT NOT NULL,
  target_evm_address  TEXT NOT NULL,
  level               INTEGER NOT NULL,
  state               TEXT NOT NULL,
  receipt_id          TEXT,
  signature           TEXT,
  deadline            INTEGER,
  base_token_id       INTEGER,           -- populated on CLAIMED
  created_at          INTEGER NOT NULL,
  updated_at          INTEGER NOT NULL,
  UNIQUE(source_chain, source_tx_hash, source_token_id)
);
```

---

## 4. Formulas

### Finality thresholds

```
arbitrum  : 2 blocks   ≈ 0.5 s
monad     : 2 blocks   ≈ 1 s
solana    : 32 slots   ≈ 13 s
aptos     : 12 epochs  ≈ 60 s (conservative; could lower to 4)
```

### Receipt ID

```
receiptId = keccak256(
    abi.encode(
        sourceChainId,
        sourceTxHash,
        sourceTokenId
    )
)
```

### Deadline

```
deadline = sourceTxConfirmedAt + 24h
```

---

## 5. Edge Cases

| Case | Handling |
|------|----------|
| Player burns directly without using UI (no memo) | Solana: server cannot detect bridge intent without memo → asset gone, no receipt. UI warns prominently. |
| Player provides wrong targetEvm address in burn | Receipt is bound to address provided in burn; if address was typo'd, player loses NFT. UI requires address confirmation step. |
| Multiple burns of same tokenId (impossible after burn) | `_burn` already reverted second call; OZ guarantees. |
| Bridge signer rotated mid-flight | Re-issuance flow documented in §3.7; serves as design rationale for keeping a separate signer key. |
| Player has 1500 wins on source-chain NFT and 0 wins on existing Base NFT, then bridges | Two separate NFTs on Base with separate win rows. No merge. |
| Player bridges to address they don't own | Mint succeeds (recipient is bound in signature). UI must show address confirmation step prominently. Mistakes are non-recoverable. |
| Source chain RPC down for 24 h | Orchestrator catches up on restart; player's burn waited but receipt eventually issues. Deadline restarts from receipt-issuance time, not burn time. |

---

## 6. Dependencies

- V3 contracts on Base, Arbitrum, Monad ([02](02-base-v3-upgrade.md), [03](03-evm-v3-deploy.md))
- Solana update authority access ([04](04-solana-v2.md))
- Aptos module ([05](05-aptos-module.md))
- Server endpoints + state machine ([08](08-server-architecture.md))

---

## 7. Tuning Knobs

| Knob | Default | Where |
|------|---------|-------|
| Receipt TTL | 24 h | Server env `NFT_BRIDGE_DEADLINE_SECONDS` |
| Finality threshold (per chain) | See §4 formulas | Server env per chain |
| Bridge signer | server signer wallet | On-chain setters per V3 contract |
| Indexer poll interval | 10 s | Server env `BRIDGE_INDEXER_INTERVAL_SECONDS` |
| Indexer scan window | 1000 blocks | Server env `BRIDGE_INDEXER_BLOCK_WINDOW` |

---

## 8. Acceptance Criteria

- [ ] End-to-end: Arbitrum L1 NFT → 2 player txs → appears on Base as L1 NFT within 5 min.
- [ ] End-to-end: Monad L2 NFT → appears on Base as L2 NFT within 5 min.
- [ ] End-to-end: Solana L3 NFT → appears on Base as L3 NFT within 5 min.
- [ ] End-to-end: Aptos L1 NFT → appears on Base as L1 NFT within 5 min.
- [ ] Battle-win row migrated to `(base, newTokenId)` after successful bridge.
- [ ] Replay of receipt to Base reverts.
- [ ] Receipt past deadline reverts.
- [ ] Source chain RPC outage scenario: bridge job recovers after RPC restores, no manual action.
- [ ] Bridge signer rotation: re-issued receipts for in-flight burns succeed.
- [ ] No path exists by which a player can mint on Base without a corresponding burn on source (audit checklist).
