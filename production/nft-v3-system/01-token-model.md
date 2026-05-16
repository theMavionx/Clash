# 01 — Token & Level Data Model

## 1. Overview

This document specifies how `level` is stored, read, and rendered for every
NFT on every chain. It is the foundation all other documents reference.

The single rule: **on-chain stores level as an integer; off-chain server
resolves that integer into the correct image/metadata.** Existing NFTs default
to `level=1` without any storage write.

---

## 2. Player Fantasy

The player sees their unit's **level number** rendered as a star count
(1★ / 2★ / 3★) overlaid on its art. The art itself is identical across
levels — only the star badge differentiates. Leveling up "adds a star" and
the player feels their NFT growing in rank without changing identity.

---

## 3. Detailed Rules

### 3.1 Level enum (across all chains)

```
1 = Level 1 (initial mint, 1★)
2 = Level 2 (upgraded once,  2★)
3 = Level 3 (upgraded twice, 3★ — terminal)
```

No tier names (Bronze/Silver/Gold are NOT used). All UI labels use the
numeric level and star count only.

`level` is **immutable downward** — it can only increase. No level-0, no
level-4, no "downgrade".

### 3.1a Canonical Art Sources

Three source images, identical Demon King composition with star badge
varying by level:

| Level | Stars | Source file (user-supplied) | CDN destination |
|-------|-------|------------------------------|-----------------|
| 1 | 1★ | `c0333843-2761-4715-8f7d-e8fcccd8c6c2.jpg` | `cdn.clashofperps.fun/nft/1/<id>.jpg` |
| 2 | 2★ | `51dfd478-cb81-4bcf-8c00-589aca0268b5.jpg` | `cdn.clashofperps.fun/nft/2/<id>.jpg` |
| 3 | 3★ | `8337f4e3-e556-4ea6-b824-124d6aa50945.jpg` | `cdn.clashofperps.fun/nft/3/<id>.jpg` |

Asset pipeline step (Phase 8 in [00-master-plan.md](00-master-plan.md) §4):

1. Copy the three source files to `assets/nft/source/L1.jpg`, `L2.jpg`, `L3.jpg`
   (canonical, version-controlled in `assets/`).
2. Run `scripts/generate-nft-cdn-assets.mjs` to produce `<level>/default.jpg`
   plus per-id variants when individual art is later supplied.
3. Sync to CDN via the existing static-asset pipeline.

Until per-token unique art exists, every `<id>.jpg` route falls back to the
level's `default.jpg` via Nginx `try_files`. This means the same image
serves all NFTs at a given level — acceptable for V3 launch.

### 3.2 EVM storage (Base / Arbitrum / Monad V3)

```solidity
// Appended to existing storage; existing tokens read as 0, which equals "level 1" via the helper below.
mapping(uint256 => uint8) private _tokenLevelRaw;

function tokenLevel(uint256 tokenId) public view returns (uint8) {
    _requireOwned(tokenId);
    uint8 raw = _tokenLevelRaw[tokenId];
    return raw == 0 ? 1 : raw;  // unset == L1 (legacy/default)
}
```

This is the **key invariant**: a brand-new mapping entry of `0` is interpreted
as L1. All 43 existing Base NFTs (and the 7 Solana ones once we mirror the
same logic) automatically read as L1 after the V3 upgrade with **zero storage
writes** required. Migration of existing NFTs is therefore O(0) — free.

### 3.3 Solana storage (Metaplex Core attributes)

Each minted asset gets a `MutableAttributes` plugin attached with one entry:

```
[{ key: "level", value: "1" }]
```

For the 7 already-minted Solana NFTs, we **add the plugin on first read** if
missing — server lazily provisions it via Metaplex Core's `addPlugin` ix when
the player first interacts with an upgrade. Cost: ~0.001 SOL rent, paid by
treasury. See [04-solana-v2.md](04-solana-v2.md).

### 3.4 Aptos storage

Each Aptos digital asset stores `level: u8` as a property on its
`PropertyMap` resource. See [05-aptos-module.md](05-aptos-module.md).

### 3.5 Metadata resolution

Token URIs across all chains point to the same server pattern:

```
https://clashofperps.fun/api/nft/<chain>/<tokenId>
```

The server endpoint:

1. Reads on-chain `tokenLevel(tokenId)` from the proxy contract (or the
   Solana/Aptos equivalent).
2. Caches the read for 60 seconds (level changes are rare; staleness is OK).
3. Returns metadata JSON:

   ```json
   {
     "name": "Demon King #<id>",
     "description": "Demon King, level <N>.",
     "image": "https://clashofperps.fun/cdn/nft/<level>/<id>.jpg",
     "attributes": [
       { "trait_type": "Level", "value": <level>, "display_type": "number" },
       { "trait_type": "Stars", "value": <level>, "display_type": "number" }
     ]
   }
   ```

The `image` URL **changes per level**. The contract base URI never changes.
Marketplaces (OpenSea, Magic Eden, etc.) re-fetch metadata when level
upgrades happen — we trigger this with a standard `MetadataUpdate(tokenId)`
event (EIP-4906).

### 3.6 Battle-win counter — **DEFERRED to Phase B**

> ⚠ **Not in Phase 1.** The win-threshold gate (1 000 wins for L2, 10 000 for
> L3) and the `nft_battle_wins` table are deferred. In Phase 1, **any owner
> can upgrade** by paying $8.9 USDC or 5 CoP. No win check.
>
> Phase B (see [00-master-plan.md §4.2](00-master-plan.md)) will add the gate
> server-side without re-deploying contracts.

When Phase B ships, the rules below apply. Documented here for reference so
the architecture is consistent end-to-end.

Storing battle wins on-chain would cost gas every win — prohibitive.
Wins live in the server DB. Schema in [08-server-architecture.md](08-server-architecture.md):

```sql
-- Phase B only — not created in Phase 1 migrations.
CREATE TABLE nft_battle_wins (
  chain        TEXT NOT NULL,        -- 'base' | 'arbitrum' | 'monad' | 'solana' | 'aptos'
  token_id     TEXT NOT NULL,        -- chain-native ID format (EVM: decimal; Solana/Aptos: address)
  wins         INTEGER NOT NULL DEFAULT 0,
  last_update  INTEGER NOT NULL,
  PRIMARY KEY (chain, token_id)
);
```

Wins recording rules (Phase B):

- Only **PvP wins** count. PvE and raids don't.
- When a player wins a PvP match with N owned NFTs active in that battle,
  **all N** receive +1 win.
- Recorded only by the authoritative battle-completion handler in
  `server/combat_session.js` when `result=victory`. Client input is never trusted.

### 3.7 Wins survive ownership change — **Phase B**

When a marketplace sale completes (Base only):
- The NFT moves to the buyer.
- The `nft_battle_wins` row stays unchanged — buyer inherits the battle history.

When an NFT is bridged from chain X to Base:
- The bridge orchestrator copies the wins row from `(X, oldId)` to `(base, newId)` and deletes the old row.
- Detail in [06-bridge.md](06-bridge.md) §6.

---

## 4. Formulas

### Level → unlock requirement (Phase B only — Phase 1 has no requirement)

```
required_wins(L) =
  L == 2 ? 1000 :
  L == 3 ? 10000 :
  ∞  (no further levels)
```

In Phase 1 this function is effectively `required_wins(L) = 0` — payment
and ownership are the only checks.

### Level → image path

```
image_path = "https://clashofperps.fun/cdn/nft/" + level + "/" + tokenId + ".jpg"
```

### Metadata-cache TTL

```
metadata_ttl_seconds = 60          // server reads on-chain level every 60s
level_cache_invalidate_on = MetadataUpdate(tokenId) event  // immediate refresh after upgrade
```

---

## 5. Edge Cases

| Case | Handling |
|------|----------|
| Token doesn't exist → `tokenLevel(999)` | Reverts via `_requireOwned` (ERC-721 standard). |
| Existing NFT (Base #1..#43) before V3 upgrade | Returns `0` from mapping; helper returns `1`. Image renders as Level 1 (1★). |
| Concurrent upgrade attempts on same tokenId | Second tx reverts on `require(level < 3)` re-read. No race. |
| Marketplace front-end shows stale image after upgrade | EIP-4906 `MetadataUpdate(tokenId)` event tells indexers to refetch. |
| Server-cache stale | `MetadataUpdate` event in server's event listener invalidates cache for that tokenId. |
| Bridge after upgrade | Source contract still reports correct level via `tokenLevel()` until burn; bridge receipt includes that level. |
| Bridge orphan: burn happened but server crash before signing | See [06-bridge.md](06-bridge.md) §7 — burn events are indexed by block; orchestrator resumes on restart. |

---

## 6. Dependencies

- Phase 1 contract: `DemonKingBaseV3.sol` ([02-base-v3-upgrade.md](02-base-v3-upgrade.md))
- Phase 4 Solana: attribute mutator program ([04-solana-v2.md](04-solana-v2.md))
- Phase 5 Aptos: Move module ([05-aptos-module.md](05-aptos-module.md))
- Phase 6 server: DB schema ([08-server-architecture.md](08-server-architecture.md))

---

## 7. Tuning Knobs

| Knob | Default | Where |
|------|---------|-------|
| Max level | 3 | Contract constant `MAX_LEVEL` |
| Metadata cache TTL | 60 s | Server env `NFT_METADATA_CACHE_SECONDS` |
| CDN image base URL | `clashofperps.fun/cdn/nft/` | Server env `NFT_IMAGE_BASE_URL` |

---

## 8. Acceptance Criteria (Phase 1)

- [ ] `tokenLevel(id)` returns `1` for all pre-existing Base V2 NFTs after V3 upgrade, without any storage write.
- [ ] `tokenLevel(id)` returns `2` immediately after a successful `upgradeToken(id)` tx.
- [ ] Server-resolved tokenURI returns the correct image URL for that level within 60 seconds of the upgrade, instantly after the `MetadataUpdate` event is processed.
- [ ] OpenSea/MagicEden show updated artwork within ≤ 5 min of upgrade (subject to their indexer cadence).
- [ ] A bridged NFT mints on Base at exactly the level it had on the source chain (verified by reading post-bridge `tokenLevel`).
- [ ] Three CDN endpoints `/cdn/nft/1/default.jpg`, `/cdn/nft/2/default.jpg`, `/cdn/nft/3/default.jpg` serve the three star-variant images.

**Phase B add-ons:**

- [ ] `nft_battle_wins` row populates on every PvP victory (all active NFTs of the winning player get +1).
- [ ] Battle-win row for `(chain, tokenId)` persists across sales on the marketplace (buyer sees inherited wins in the upgrade-eligibility UI).
- [ ] Server upgrade-quote endpoint rejects when `wins < threshold`.
