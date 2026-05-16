# NFT V3 System — Master Plan

> **Status:** Draft — awaiting approval before any code is written.
> **Owner:** Egor (decisions), Claude (implementation).
> **Date:** 2026-05-16.

---

## 1. Overview

This plan transforms the current single-level NFT collection into a **3-level
progression system** with a **Base-hub marketplace** and a **one-way bridge**
from every other chain into Base. The system must:

- Preserve all **50 existing NFTs** (43 on Base V2, 7 on Solana CM). No one is
  forced to re-mint. They become Level 1 automatically.
- Mint Level 1 on all 5 chains (Base, Arbitrum, Monad, Solana, **Aptos — new**).
- Allow per-token **upgrade L1→L2 and L2→L3** on any chain, paid in USDC
  ($8.9) or CoP ($5), and gated by **battle-win counts** (1000 wins for L2,
  10 000 wins for L3).
- Provide a **bridge** that burns the NFT on the source chain and mints an
  equivalent **same-level** NFT on Base.
- Provide a **marketplace on Base only** — simple list / buy / cancel with
  EIP-2981 royalties. All NFTs gravitate to Base via the bridge for sale.
- Track battle wins server-side, per (chain, tokenId), so they survive
  transfers, sales, and bridges.

The end state is: all liquidity and trading on Base, all chains can still mint
fresh L1s for new players, all NFTs (old and new) participate.

---

## 2. Player Fantasy

> "My Demon King unit started weak but grew with me. After every battle won, I
> see the counter tick up. At 1000 wins he transformed — new art, new aura.
> By the time I'd fought 10 000 victories he became a legend. When I wanted
> to trade him, I bridged him to Base and listed for 0.5 ETH. The next player
> bought him **with his battle history intact**."

Player feels: ownership, progression, persistence of effort across time, and
clean liquidity when it's time to exit.

---

## 3. High-Level Architecture

```
                         ┌──────────────────────────────┐
                         │   GLOBAL SUPPLY CAP = 500    │
                         │   (server-enforced)          │
                         └──────────────────────────────┘
                                       │
            ┌──────────────────┬───────┼───────┬──────────────────┐
            │                  │       │       │                  │
        ┌───▼───┐         ┌────▼────┐  │   ┌──▼─────┐        ┌────▼───┐
        │ Base  │         │Arbitrum │  │   │ Monad  │        │ Solana │
        │  V3   │         │   V3    │  │   │   V3   │        │  CM v2 │
        └───┬───┘         └────┬────┘  │   └────┬───┘        └────┬───┘
            │                  │       │        │                 │
            │ ─────────────────┴───────┼────────┴─────────────────┘
            │           Burn → server signs receipt
            │                          │
            │   ┌──────────────────────▼──────┐
            └───┤  bridgeMint(receipt, sig)   │
                │  on Base V3                 │
                └─────────────────────────────┘

                ┌─────────────────────────────────┐
                │     Marketplace (Base only)     │
                │  list / buy / cancel / royalty  │
                └─────────────────────────────────┘

                                                       ┌──────┐
                                                       │ Aptos│ (new build, also bridges out)
                                                       │  v1  │
                                                       └──────┘
```

**Key invariants:**

- Every NFT on every chain has a `level ∈ {1,2,3}` stored on-chain.
- `tokenURI()` returns metadata that varies by level — the **server** is the
  authoritative metadata resolver; it reads on-chain level and returns the
  matching image. No baseURI swap is required when upgrading.
- Upgrade is permissionless within ownership in Phase 1: anyone holding a
  level-N NFT can pay $8.9 and bump it to N+1, up to level 3. **No win gate.**
- Battle-win tracking is **Phase B** (separate, later ship). When it exists,
  wins will be stored server-side keyed by `(source_chain, tokenId)` and the
  bridge will migrate win history to the new (chain, tokenId) row.
- Upgrade and mint quotes are **EIP-712 signed by the server** on EVM chains,
  and **ed25519-signed memo receipts** on Solana, and **Ed25519 module-call
  receipts** on Aptos.

---

## 4. Phasing

### 4.1 Phase 1 (initial ship — locked scope)

| Phase | Title | Deliverables | Est. duration |
|-------|-------|--------------|---------------|
| 0 | Plans approved | This document set agreed and locked | 1 day |
| 1 | Contracts: Base V3 | `DemonKingBaseV3.sol` with levels + upgrade + bridge mint; UUPS upgrade of Base V2 proxy | 3 days |
| 2 | Contracts: Arbitrum V3 + Monad V3 | Same V3 impl deployed; UUPS upgrade of existing proxies | 1 day |
| 3 | Contracts: Marketplace | `DemonKingMarketplace.sol` deployed on Base; EIP-2981 royalty receiver wired | 3 days |
| 4 | Solana: level attribute + upgrade path | Asset attribute mutator + server flow | 4 days |
| 5 | Aptos: new Move module | Mint + upgrade + bridge-burn (ships with V3 launch — not deferred) | 5 days |
| 6 | Server: upgrade quotes, bridge orchestrator, marketplace indexer | Endpoints, DB tables (minus wins), event indexers | 3 days |
| 7 | Client: UI for upgrade, bridge, marketplace | New panels in `web/src/components/` | 4 days |
| 8 | Asset pipeline | Place 3 source art files at `assets/nft/source/L<N>.jpg`, generate CDN derivatives | 1 day |
| 9 | Migration of existing 50 NFTs | All read as L1 implicitly (zero storage write needed) | 0 days |
| 10 | Audit, smoke tests, rollout | Manual security review, dry-run on Base, gradual release | 4 days |

**Phase 1 total: ~29 working days (~6 weeks).** Phases 1-5 run partially in
parallel (Aptos + Solana + EVM are independent).

### 4.2 Phase B (later — deferred)

Adds win-based upgrade gating on top of Phase 1. Phase 1 ships **without**
this; players can upgrade by simply paying. Phase B can ship months later
without re-deploying contracts (server-side gate addition).

| Phase | Title | Deliverables | Est. duration |
|-------|-------|--------------|---------------|
| B1 | Battle-win recorder | Hook into `combat_session.js` victory event, write to `nft_battle_wins` table | 2 days |
| B2 | Upgrade-quote gating | Server's `/nft/upgrade/quote` enforces `wins >= threshold` | 1 day |
| B3 | Win-history transfer on bridge/sale | Orchestrator copies wins row on `BridgeMint` and `Sold` events | 1 day |
| B4 | UI: progress bars + unlock state | Wire wins display, lock upgrade button until threshold | 2 days |

**Phase B total: ~6 days, no contract changes.**

---

## 5. Document Index

Each sub-plan is self-contained and follows the 8-section design-doc standard
from `.claude/docs/coding-standards.md`.

1. [01-token-model.md](01-token-model.md) — Level/wins data model, metadata
   resolution, off-chain image layout.
2. [02-base-v3-upgrade.md](02-base-v3-upgrade.md) — `DemonKingBaseV3.sol`,
   storage layout, UUPS upgrade procedure for Base V2.
3. [03-evm-v3-deploy.md](03-evm-v3-deploy.md) — Arbitrum & Monad V3 deployment
   (same implementation as Base, different proxies).
4. [04-solana-v2.md](04-solana-v2.md) — Metaplex Core attribute mutation,
   server-signed upgrade for Solana, existing 7-NFT migration.
5. [05-aptos-module.md](05-aptos-module.md) — Move module: mint, upgrade,
   bridge-burn entry functions; resource accounts; signer setup.
6. [06-bridge.md](06-bridge.md) — Cross-chain burn-and-mint bridge, EIP-712
   receipts, replay protection, indexer architecture.
7. [07-marketplace.md](07-marketplace.md) — `DemonKingMarketplace.sol` spec:
   listings, royalty, batch operations, payment tokens.
8. [08-server-architecture.md](08-server-architecture.md) — DB schema for
   wins + nonces, new endpoints, bridge orchestrator state machine.
9. [09-client-ux.md](09-client-ux.md) — Panel designs for mint/upgrade/
   bridge/market, wallet flows, state machines.
10. [10-rollout-and-migration.md](10-rollout-and-migration.md) — Phased
    deployment, existing-NFT migration script, rollback plan.
11. [11-security-and-testing.md](11-security-and-testing.md) — Threat model,
    test matrix, audit checklist, gas-DoS analysis.

---

## 6. Critical Decisions (locked here, referenced everywhere)

| ID | Decision | Locked value |
|----|----------|-------------|
| D1 | Level enum | `1`, `2`, `3` — `uint8`. Displayed in UI as star count (1★ / 2★ / 3★), no Bronze/Silver/Gold names. |
| D2 | Mint price | $8.9 USDC or 5 CoP — unchanged from current |
| D3 | Upgrade price (both L1→L2 and L2→L3) | $8.9 USDC or 5 CoP |
| D4 | L1→L2 unlock requirement | **DEFERRED to Phase B.** Phase 1 has no battle-win gate — any owner can upgrade by paying. |
| D5 | L2→L3 unlock requirement | **DEFERRED to Phase B.** Same as D4. |
| D6 | Wins counter scope | **DEFERRED to Phase B.** When Phase B ships, wins tracked per `(chain, tokenId)`. PvP only. All player-active NFTs in a battle get +1 win. |
| D7 | Bridge direction | One-way from source → Base. No bridge-back. |
| D8 | Bridge mechanism | Burn on source, server signs receipt, mint on Base. |
| D9 | Bridge preserves level | Yes. Receipt includes level; Base mints at that level. |
| D10 | Marketplace location | Base only. |
| D11 | Marketplace payment tokens | ETH, USDC, CoP |
| D12 | Royalty | EIP-2981, 2.5% to treasury `0xC024884ad9C5540996492Cc2DD080964941A3094`. **No separate platform fee.** |
| D13 | Global supply cap | 500 — unchanged. Bridge mints do NOT count against cap (they're 1-to-1 swaps, not new supply). |
| D14 | Existing 50 NFTs default level | L1 on system launch. No user action required. |
| D15 | Metadata for upgraded NFTs | Server-resolved per-request — reads chain `level(id)` then returns level-specific JSON. |
| D16 | Aptos rollout | Launches with V3 (Phase 5 runs in parallel with EVM phases, ships together). |
| D17 | Art assets | 3 universal images (1★ / 2★ / 3★ Demon King), shared across all 5 chains. Same art per level on every chain. Source files: `assets/nft/source/L1.jpg`, `L2.jpg`, `L3.jpg` — to be copied from user's drop. |

---

## 7. Open Questions — RESOLVED (2026-05-16)

| Q | Question | Resolution |
|---|----------|-----------|
| Q1 | Art assets for L2 and L3 | **3 universal images** (same art across all chains), star-count differentiates level. Source files dropped by user; to be copied to `assets/nft/source/L<N>.jpg`. |
| Q2 | Definition of "wins" | **PvP only.** Deferred to Phase B — not implemented in initial launch. |
| Q3 | Multiple NFTs in same battle — who gets the win? | **All active NFTs** the player has in that battle get +1 win. Deferred to Phase B. |
| Q4 | Platform fee on top of royalty? | **No.** Only the 2.5% EIP-2981 royalty. |
| Q5 | Aptos rollout timing | **Launches with V3** (Phase 5 ships together with EVM/Solana). |

---

## 8. Risk Register

| ID | Risk | Severity | Mitigation |
|----|------|----------|------------|
| R1 | UUPS upgrade of Base V2 corrupts storage layout, bricks existing 43 NFTs | **CRITICAL** | Storage gap analysis in [02-base-v3-upgrade.md](02-base-v3-upgrade.md); rehearsal on local fork before mainnet upgrade. |
| R2 | Bridge replay attack — same burn used twice to mint two NFTs | **CRITICAL** | Receipt nonce stored on Base; signer key in HSM-equivalent (rotated mnemonic). See [06-bridge.md](06-bridge.md) §5. |
| R3 | Battle-win counter spoofed (player fakes wins to upgrade for free) | **HIGH** | Wins recorded only by server's authoritative battle ledger, never accepted from client. See [08-server-architecture.md](08-server-architecture.md) §3. |
| R4 | Marketplace front-running (someone sees a buy tx, lists at lower price for sandwich) | LOW | Not relevant for ERC-721 fixed-price; would only matter for AMM. |
| R5 | Solana attribute mutation requires specific authority that we may have lost | MEDIUM | Verify candy-machine update authority is still ours via [04-solana-v2.md](04-solana-v2.md) §4. |
| R6 | Aptos signer-derivation breaks if `NFT_BASE` mnemonic is rotated | MEDIUM | Document mnemonic-rotation rebuild in [05-aptos-module.md](05-aptos-module.md). |

---

## 9. Acceptance Criteria (whole system)

The V3 system is **DONE** (Phase 1) when ALL of the following are true on mainnet:

- [ ] All 5 chains can mint L1 NFTs at $8.9.
- [ ] All 5 chains can upgrade L1→L2 and L2→L3 at $8.9 each by **paying + owning** (no win gate in Phase 1).
- [ ] An NFT bridged from Solana/Arbitrum/Monad/Aptos appears on Base at the **same level** within ≤ 2 minutes of source burn.
- [ ] All 50 pre-existing NFTs (43 Base, 7 Solana) show as **L1** in player UI without re-minting.
- [ ] A pre-existing NFT can be upgraded normally (same code path as new ones).
- [ ] Marketplace on Base allows listing, buying, and cancelling; royalty 2.5% goes to treasury on every sale.
- [ ] Server NEVER signs a quote/receipt that would exceed the 500 global cap (bridge mints are exempt).
- [ ] No private key (mnemonic, signer key, API key) appears in any tracked file.
- [ ] Documentation in `docs/architecture/` describes the system for new contributors.

**Phase B** (later, separate ship) adds the win-gating layer on top of Phase 1:
- [ ] PvP battle wins recorded server-side per `(chain, tokenId)`.
- [ ] Upgrade quote endpoint enforces `wins >= threshold` (1 000 for L2, 10 000 for L3).
- [ ] Wins row transfers across bridges and sales.
- [ ] UI shows progress bars and unlock state for upgrade buttons.

---

## 10. Tuning Knobs

These can be changed post-launch without contract redeployment (server-side
config only) unless marked **on-chain**.

| Knob | Default | Change mechanism |
|------|---------|------------------|
| Mint price USD | $8.9 | Server env `NFT_BASE_USD_PRICE_E6` + on-chain `setUsdPrice()` |
| Upgrade price USD | $8.9 | Server env `NFT_UPGRADE_USD_PRICE_E6` + on-chain `setUpgradePrice()` |
| L2 win threshold | 1 000 | Server env `NFT_L2_WIN_THRESHOLD` (server is authoritative gate) |
| L3 win threshold | 10 000 | Server env `NFT_L3_WIN_THRESHOLD` |
| Global cap | 500 | Server env `NFT_GLOBAL_SUPPLY_CAP` |
| Marketplace royalty | 2.5% | On-chain `setRoyalty(uint256 bps)` on Base V3 |
| Royalty receiver | treasury | On-chain `setRoyaltyReceiver(address)` |
| Bridge receipt TTL | 24 h | Server env `NFT_BRIDGE_DEADLINE_SECONDS` |

---

## 11. What Happens to V1 and V2

- **Base V1 (`0x8fc6…255a`)** — `totalMinted=0`, `paused=true`, `saleActive=false`.
  Action: `renounceOwnership()` so it can never be unpaused. Permanently dead.
- **Base V2 (`0x4048…6fec`)** — 43 NFTs minted. Action: **UUPS-upgrade in place
  to V3 implementation**, preserving all existing tokens and ownership. No new
  proxy.
- **Solana CM (`9jQn…jWAu`)** — 7 NFTs minted. The candy machine itself stays;
  we add a separate "attribute mutator" program/server flow for upgrades. See
  [04-solana-v2.md](04-solana-v2.md).
- **Arbitrum & Monad** — 0 NFTs each, just deployed. UUPS-upgrade in place to V3.

---

## 12. Sign-Off

Once Egor reviews all 11 sub-plans and accepts (or amends) the locked
decisions in §6, Phase 1 begins. **No code is written until then.**
