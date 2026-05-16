# 08 — Server Architecture

> ⚠ **Phase 1 vs Phase B scope.** In Phase 1, upgrade quotes verify
> ownership + freshness only — **no battle-win gate**. Wins-related tables,
> endpoints, recorder, and thresholds are **Phase B work** and are documented
> below for reference, but they are NOT implemented in the Phase 1 ship.
> Wherever this doc says "battle wins" or "win threshold", treat it as Phase B.

## 1. Overview

The server is the single trusted authority for:

- Issuing **mint quotes** (EIP-712 / ed25519 / Ed25519 signatures).
- Issuing **upgrade quotes** — Phase 1: ownership + freshness. Phase B adds
  battle-win threshold gating.
- Issuing **bridge receipts** — only after observing finalized burn events.
- Tracking **battle wins per NFT** keyed by `(chain, tokenId)` — **Phase B only**.
- Resolving **token metadata** with the right level-specific image.
- Enforcing the **global supply cap** of 500.

This document specifies database tables, endpoints, key handling, and the
state machines.

---

## 2. Player Fantasy

Server is invisible to the player. From the player's perspective, things
"just work": they win battles → their unit becomes eligible to upgrade →
they pay → it transforms. They never see the server's role.

---

## 3. Detailed Rules

### 3.1 Trust model

The server holds two private keys:

- **Upgrade quote signer key** — signs mint and upgrade quotes.
- **Bridge quote signer key** — signs bridge receipts. Separate from
  upgrade signer so a leak of one doesn't compromise the other.

Both keys are loaded from environment variables, never logged, never written
to tracked files. See [11-security-and-testing.md](11-security-and-testing.md) §3.

**The client is never trusted.** Win counts come from the server's battle
ledger, not from client payloads. Quote-eligibility checks happen in
authoritative code paths only.

### 3.2 Database tables (additions)

```sql
-- Battle wins per NFT (chain, tokenId).
CREATE TABLE nft_battle_wins (
    chain        TEXT NOT NULL,
    token_id     TEXT NOT NULL,
    wins         INTEGER NOT NULL DEFAULT 0,
    last_update  INTEGER NOT NULL,
    PRIMARY KEY (chain, token_id)
);
CREATE INDEX idx_nft_battle_wins_lookup ON nft_battle_wins (chain, token_id);

-- Used upgrade nonces (server-side gate; the contract also has its own mapping).
CREATE TABLE nft_upgrade_nonces (
    nonce        TEXT PRIMARY KEY,
    issued_at    INTEGER NOT NULL,
    chain        TEXT NOT NULL,
    token_id     TEXT NOT NULL,
    target_level INTEGER NOT NULL,
    consumed_at  INTEGER
);

-- Bridge job tracking (state machine).
CREATE TABLE bridge_jobs (
    job_id              TEXT PRIMARY KEY,
    source_chain        TEXT NOT NULL,
    source_tx_hash      TEXT NOT NULL,
    source_token_id     TEXT NOT NULL,
    target_evm_address  TEXT NOT NULL,
    level               INTEGER NOT NULL,
    state               TEXT NOT NULL,         -- 'NEW'|'FINALIZED'|'SIGNED'|'CLAIMED'|'EXPIRED'|'FAILED'
    receipt_id          TEXT,
    signature           TEXT,
    deadline            INTEGER,
    base_token_id       INTEGER,
    created_at          INTEGER NOT NULL,
    updated_at          INTEGER NOT NULL,
    UNIQUE(source_chain, source_tx_hash, source_token_id)
);
CREATE INDEX idx_bridge_jobs_state ON bridge_jobs (state, deadline);

-- Solana upgrade payment nonces (separate from EVM because payment flow differs).
CREATE TABLE solana_upgrade_nonces (
    nonce        TEXT PRIMARY KEY,
    asset_addr   TEXT NOT NULL,
    target_level INTEGER NOT NULL,
    issued_at    INTEGER NOT NULL,
    consumed_at  INTEGER
);

-- Indexer cursors so the bridge orchestrator can resume after restart.
CREATE TABLE indexer_cursors (
    chain        TEXT PRIMARY KEY,
    last_block   INTEGER NOT NULL,
    updated_at   INTEGER NOT NULL
);
```

All tables go in `server/db.js` migration block. Migrations are idempotent
(`CREATE TABLE IF NOT EXISTS`).

### 3.3 New endpoints

| Method | Path | Purpose |
|--------|------|---------|
| `POST` | `/api/nft/upgrade/quote` | Issue an upgrade quote for `(chain, tokenId, targetLevel)`. Verifies ownership, current level, win count. |
| `POST` | `/api/nft/upgrade/finalize` | (Solana only) Verify payment tx, then submit attribute-write tx as authority. |
| `POST` | `/api/nft/bridge/init` | Player declares intent to bridge `(chain, tokenId, targetEvm)`. Returns instructions for the burn (function call, memo, etc.). |
| `GET`  | `/api/nft/bridge/status/:jobId` | Returns current state of a bridge job. When `state='SIGNED'`, includes the receipt + signature. |
| `GET`  | `/api/nft/wins/:chain/:tokenId` | Public — return win count for an NFT (used by UI to show eligibility). |
| `POST` | `/api/admin/wins/grant` | Admin-only — manually grant wins for testing or compensation. Guarded by `SERVER_ADMIN_KEY`. |
| `GET`  | `/api/nft/:chain/:tokenId` | (Existing — extended) returns metadata with level-specific image. |

### 3.4 Upgrade-quote endpoint logic

```javascript
POST /api/nft/upgrade/quote
Body: { chain, tokenId, paymentToken }  // paymentToken ∈ {'usdc', 'cop'}

1. Authenticate request (wallet signature in session).
2. Read on-chain level via the appropriate chain's NFT contract.
   - If level >= 3 → 400 "Already max level".
   - targetLevel = level + 1.
3. Read on-chain owner of tokenId.
   - If owner != requesting wallet → 403 "Not owner".
4. Read battle wins from nft_battle_wins (chain, tokenId).
   - threshold = targetLevel == 2 ? 1000 : 10000
   - If wins < threshold → 403 "Not enough battle wins: <wins>/<threshold>".
5. Compute payment amount:
   - usdc: 8_900_000 (8.9 USDC with 6 decimals)
   - cop: floor(5 / cop_usd_oracle_price * 10^cop_decimals)
6. Generate nonce = randomBytes(32) (base64).
7. Insert nft_upgrade_nonces row.
8. Sign EIP-712 (EVM) or build memo (Solana/Aptos) with:
   { tokenId, owner, newLevel: targetLevel, priceWei: 0 /* paid off-chain */, nonce, deadline: now + 30 min }
9. Return { signature, nonce, deadline, paymentInstruction }.
```

`priceWei` is 0 because the actual $8.9 USDC payment happens via a
**separate USDC transfer to the upgrade shop contract** before calling
`upgradeToken` — same pattern as the existing mint shop. Specifically: a
new `DemonKingUpgradeShop` contract on each EVM chain (or extension of
existing `DemonKingBaseShopV2`) handles the USDC→upgrade flow:

```solidity
function payAndUpgrade(
    uint256 tokenId,
    uint8 newLevel,
    uint256 priceUSDC,
    bytes32 nonce,
    uint256 deadline,
    bytes calldata signature
) external nonReentrant {
    require(block.timestamp <= deadline, "Quote expired");
    // Verify the shop's signature over the same fields.
    // Pull USDC from msg.sender to treasury.
    // Then call nft.upgradeToken(tokenId, newLevel, 0, nonce, deadline, nftSignature)
    // where nftSignature is the V3 NFT contract's separate signature
    // signed by the same server, scoped to the V3 NFT domain.
}
```

This pattern keeps the V3 NFT contract clean (one signature responsibility:
verify that this upgrade was server-approved). The shop handles the
payment integration.

Alternative simpler design: combine into one signature that the V3 NFT
contract verifies. The NFT contract then makes the USDC transfer
internally before flipping the level. We'll choose at implementation time
based on gas analysis and audit feedback.

### 3.5 Battle-win recording

In `server/combat_session.js`, when a battle ends with `result=victory`:

```javascript
function recordVictory(playerWallet, nftBattleParticipants) {
    // nftBattleParticipants: [{ chain, tokenId }] — every NFT the player used
    for (const p of nftBattleParticipants) {
        db.prepare(`
          INSERT INTO nft_battle_wins (chain, token_id, wins, last_update)
          VALUES (?, ?, 1, ?)
          ON CONFLICT(chain, token_id) DO UPDATE SET
            wins = wins + 1,
            last_update = excluded.last_update
        `).run(p.chain, p.tokenId, Date.now());
    }
}
```

**Per (Q3 in master plan):** decision is pending. Default assumption: only
the "active" NFT for the battle gets a win. If decision changes to "all
participating NFTs", the code is the same — just include all in
`nftBattleParticipants`.

### 3.6 Bridge orchestrator state machine

(Already detailed in [06-bridge.md](06-bridge.md) §3.8.)

The orchestrator runs as a long-lived async loop within the main server
process. On each iteration:

```
1. For each EVM chain: scan blocks since indexer_cursors.last_block,
   look for BridgeBurn events.
2. For each Solana confirmed tx: check for bridge memo pattern.
3. For each Aptos event: poll BridgeBurnEvent feed.
4. For new burns: insert bridge_jobs row in state NEW.
5. For NEW jobs: if confirmation count >= finality threshold, advance to FINALIZED.
6. For FINALIZED jobs: sign receipt, advance to SIGNED.
7. For CLAIMED detection: watch BridgeMint events on Base.
8. For SIGNED jobs whose deadline has passed: advance to EXPIRED.
```

Loop interval: 10 seconds (configurable via `BRIDGE_INDEXER_INTERVAL_SECONDS`).

### 3.7 Metadata endpoint

```javascript
GET /api/nft/:chain/:tokenId

1. Read level from on-chain (chain-specific reader; cached 60 s).
2. Read trait data (any future per-NFT traits).
3. Return JSON:
   {
     name: `Demon King #${tokenId}`,
     description: levelDescription(level),
     image: `${IMAGE_BASE}${level}/${tokenId}.png`,
     attributes: [
       { trait_type: 'Level', value: levelName(level) },
       { trait_type: 'Rank Number', value: level }
     ]
   }
```

Where `levelName(level)` ∈ `{Bronze, Silver, Gold}`.

Cache invalidated on:
- `TokenLevelUpgraded` event (EVM)
- Solana attribute write success
- Aptos `level` update tx confirmation

### 3.8 Global supply cap (unchanged)

The existing `assertGlobalSupplyAvailable(quantity)` continues to gate ALL
fresh mints. Bridge mints are **exempt** because they don't increase
supply (1 burn ↔ 1 mint). The exemption is enforced by the V3 contract
checking `usedBridgeReceipts` separately and NOT incrementing any
global-supply counter that the cap depends on. We verify by audit that
the cap reader only counts non-bridge mints. (Pragmatically: `totalMinted`
on Base V3 will include bridge mints, so we adjust `readBaseNftMintedCount`
to subtract `bridgeMintCount` — a new view-only counter on V3.)

### 3.9 Admin endpoints

```
POST /api/admin/wins/grant
  Auth: X-Admin-Key header == process.env.SERVER_ADMIN_KEY
  Body: { chain, tokenId, delta }
  Effect: db UPSERT with wins += delta

POST /api/admin/bridge/force-state
  Auth: same
  Body: { jobId, state }
  Effect: manual state machine override for stuck jobs

POST /api/admin/level/force-set
  Auth: same
  Body: { chain, tokenId, level }
  Effect: server submits attribute-mutation tx (Solana) or admin tx (EVM).
  EVM equivalent doesn't exist on V3 — would require a new admin function
  on the contract OR the owner calls `upgradeToken` bypass which doesn't
  exist. Decision: admin force-set is only available on Solana/Aptos
  (where the server is the update authority) and via a possible future
  `adminSetLevel(uint256, uint8)` on V3 (gated by `onlyOwner`). Added
  in V3 spec for completeness:

  // 02-base-v3-upgrade.md addendum:
  function adminSetLevel(uint256 tokenId, uint8 newLevel) external onlyOwner {
      require(newLevel >= 1 && newLevel <= MAX_LEVEL, "Bad level");
      _requireOwned(tokenId);
      uint8 oldLevel = tokenLevel(tokenId);
      _tokenLevelRaw[tokenId] = newLevel;
      emit TokenLevelUpgraded(tokenId, oldLevel, newLevel, ownerOf(tokenId));
      emit MetadataUpdate(tokenId);
  }
```

(That spec addendum will be incorporated into [02-base-v3-upgrade.md](02-base-v3-upgrade.md) §4 in the final implementation pass.)

---

## 4. Formulas

### Win threshold per target level

```
threshold(targetLevel) =
  targetLevel == 2 ? 1000 :
  targetLevel == 3 ? 10000 :
  ∞
```

### Quote signing (EIP-712)

Domain per EVM chain V3 contract:

```
{ name: "DemonKingBase", version: "3", chainId, verifyingContract: <proxy> }
```

Type:

```
UpgradeQuote(uint256 tokenId,address owner,uint8 newLevel,uint256 priceWei,bytes32 nonce,uint256 deadline)
```

### Quote signing (Solana / Aptos)

Server constructs a memo / payload, hashes it with sha256 (or whatever the
chain expects), and signs with ed25519. Detail in
[04-solana-v2.md](04-solana-v2.md) §3.5 and [05-aptos-module.md](05-aptos-module.md) §3.3.

---

## 5. Edge Cases

| Case | Handling |
|------|----------|
| DB crash mid-write | SQLite WAL mode + transaction wraps multi-row writes. |
| Two concurrent quote requests for same tokenId | Both get unique nonces; only one upgrade tx can succeed (contract nonce mapping). Other player's nonce becomes orphaned in DB — janitor sweeps after 24 h. |
| Player requests quote but never pays | Nonce orphaned. No state corruption. Janitor cleanup. |
| Player upgrades but tx is rolled back by chain reorg | Server's contract event listener detects the rollback (rare on Base — finality is fast), but if it happens, server reverses the wins-row (no-op since wins didn't change) and the nonce remains "used" on-chain (which is fine — it's wasted but doesn't cause double-upgrade). |
| Indexer falls behind during outage | Cursor-based scan resumes from `last_block`. Re-scanning is idempotent thanks to `UNIQUE(source_chain, source_tx_hash, source_token_id)` constraint. |
| Bridge sees same burn twice (e.g., chain reorg replay) | UNIQUE constraint rejects duplicate. |
| Win count inflation by client | Impossible — clients never set wins. |
| Bridge signer key compromise | Documented runbook: rotate via `setBridgeQuoteSigner` on all chains, restart server with new key, manually re-sign any in-flight receipts. |

---

## 6. Dependencies

- All V3 contracts ([02](02-base-v3-upgrade.md), [03](03-evm-v3-deploy.md))
- Solana update authority ([04](04-solana-v2.md))
- Aptos module ([05](05-aptos-module.md))
- Existing `server/combat_session.js` for victory recording hook
- Existing `server/db.js` for SQLite migration

---

## 7. Tuning Knobs

| Knob | Default | Where |
|------|---------|-------|
| `NFT_UPGRADE_USDC_E6` | 8_900_000 | env |
| `NFT_UPGRADE_COP_USD` | 5 | env |
| `NFT_L2_WIN_THRESHOLD` | 1000 | env |
| `NFT_L3_WIN_THRESHOLD` | 10000 | env |
| `NFT_BRIDGE_DEADLINE_SECONDS` | 86400 | env |
| `BRIDGE_INDEXER_INTERVAL_SECONDS` | 10 | env |
| `NFT_METADATA_CACHE_SECONDS` | 60 | env |
| Quote TTL | 1800 (30 min) | env `NFT_QUOTE_TTL_SECONDS` |
| `SERVER_ADMIN_KEY` | (secret) | env |

---

## 8. Acceptance Criteria

- [ ] All new tables migrate cleanly on first server start; re-run is idempotent.
- [ ] Wins increment exactly once per battle-victory event.
- [ ] Upgrade quote rejects request when win count below threshold.
- [ ] Upgrade quote rejects request when player doesn't own the NFT.
- [ ] Upgrade quote is consumed (nonce flag set) on successful tx; further reuse fails.
- [ ] Bridge orchestrator resumes from cursor after restart with no duplicate jobs.
- [ ] Bridge orchestrator processes a new Arbitrum burn end-to-end within 2 min.
- [ ] Metadata endpoint returns level-correct image for upgraded NFTs within 60 s of upgrade tx confirmation.
- [ ] Admin endpoints require `SERVER_ADMIN_KEY` header and otherwise return 401.
- [ ] No secret keys appear in server logs at any verbosity level.
- [ ] `replay_telemetry`, `bridge_jobs`, and `nft_battle_wins` tables withstand 10 000 row inserts in stress test without lock contention.
