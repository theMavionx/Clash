# 10 — Rollout & Migration

## 1. Overview

How we deploy the V3 system to mainnet without disrupting the 50 existing
NFT owners. Phased rollout with explicit go/no-go gates between phases.

---

## 2. Player Fantasy

Existing players notice nothing on rollout day. The next time they open
the game, the upgrade / bridge / marketplace features simply appear and
work. Nobody is asked to "claim" or "migrate" their NFT.

---

## 3. Rollout Phases

### Phase A: Testnet rehearsal (week 1)

- Deploy V3 contracts to Base Sepolia.
- Mint 5 test NFTs on V2 (Base Sepolia equivalent).
- Run `upgradeToAndCall` to V3.
- Verify all 5 tokens still owned, `tokenLevel(id) == 1`.
- Run a paid upgrade, paid bridge, marketplace listing.
- Verify metadata endpoint, EIP-4906 events, OpenSea Sepolia updates.

**Go-gate to Phase B:** every acceptance criterion in [02-base-v3-upgrade.md](02-base-v3-upgrade.md) §9 passes on Sepolia.

### Phase B: Production deploy — contracts (week 2)

Order matters. Each step has a rollback plan.

**B1. Deploy Base V3 implementation.**
- `node nft/scripts/deploy-evm-v3-impl.mjs --chain=base`
- Verify on BaseScan.
- Rollback: drop the implementation address; never call upgradeToAndCall.

**B2. Storage-layout check.**
- `node nft/scripts/check-storage-layout.mjs --v2=base-v2-mainnet.json --v3=<newImpl>`
- Block proceeding if mismatch.

**B3. Schedule upgrade tx — Base V2 → V3.**
- Sign tx in a one-line transaction (not Safe multisig — deployer is EOA).
- After upgrade, verify all 43 existing NFTs:
  - `tokenLevel(1..43)` all return 1.
  - `ownerOf` matches pre-upgrade snapshot.
  - `royaltyInfo` returns `(treasury, 0.025 × salePrice)`.
- If any check fails, immediately call `upgradeToAndCall(V2 impl, …)` to revert.
  (Requires V2 init not to be `reinitializer` constrained — it's not, so the
  revert is feasible. Confirm in rehearsal.)
- Rollback: re-point proxy to V2 implementation.

**B4. Deploy Arbitrum V3 + Monad V3 impls.**
- Same pattern.

**B5. Upgrade Arbitrum V3 + Monad V3 proxies.**
- Same pattern. Less risky because 0 minted tokens.

**B6. Deploy marketplace on Base.**
- `node nft/scripts/deploy-marketplace.mjs --chain=base`
- Configure: `addAllowedNft(baseV3Proxy)`, `addAllowedPaymentToken(USDC)`, `addAllowedPaymentToken(CoP)`.

**B7. Solana migration of 7 assets.**
- `node nft/scripts/solana-migrate-l1.mjs`
- Idempotent; safe to re-run.
- Verify all 7 assets show `level=1` attribute.

**B8. Aptos module publish.**
- `aptos move publish --profile mainnet --upgrade-policy compatible`
- Initialize Config resource with signer pubkeys.

**Go-gate to Phase C:** all contracts deployed and verified, all 50 NFTs read level=1, marketplace empty but functional.

### Phase C: Server deployment (week 3)

**C1. DB migration.**
- Run `server/migrations/2026-05-nft-v3.sql` (creates new tables).
- Idempotent — `CREATE TABLE IF NOT EXISTS`.

**C2. Server code release.**
- Deploy new server build with V3 endpoints behind a feature flag
  `FEATURE_NFT_V3=true`.
- Old endpoints continue to work (mint flow unchanged).

**C3. Bridge orchestrator startup.**
- First run scans from `current_block - 1000` to `current_block` to catch
  any retroactive burns. (Shouldn't be any, but defensive.)
- Cursor persists after first scan.

**C4. Backfill: seed `nft_battle_wins` for existing NFTs.**
- Scan replay telemetry: for every battle since launch with a `result=victory`,
  attribute the win to the NFTs that participated.
- Run as one-time script `server/scripts/backfill-nft-wins.mjs`.
- Outputs a report of (chain, tokenId, wins) per row.
- **Optional**: if telemetry doesn't have NFT-level participation data
  (likely the case since wins-per-NFT didn't exist before), start everyone at 0 wins and announce the policy to players.

**Decision needed (Q-Phase-C):** start existing NFTs at 0 wins, OR seed
based on a proxy heuristic (e.g., 100 wins per L1 NFT to give early
adopters a head start)? Default: 0 wins, transparent, fair.

**C5. Activate feature flag.**
- Flip `FEATURE_NFT_V3=true`.
- Verify upgrade/bridge/marketplace endpoints respond healthily.

**Go-gate to Phase D:** server returns valid quotes for upgrade and a
bridge for at least one rehearsal NFT on testnet mirror.

### Phase D: Client release (week 4)

**D1. Build & deploy frontend with new panels.**
- Feature flag in env: `VITE_FEATURE_NFT_V3=true`.
- Hide new panels until flag set.

**D2. Soft launch — 10% rollout.**
- 10% of players see the new UI (random hash bucket on wallet address).
- Monitor error rate, support tickets, on-chain success rate.

**D3. Ramp to 50% → 100%.**
- 24 h at each step. Roll back if error rate > 1% or support spike.

**Go-gate to Phase E:** 100% rollout, no critical bugs reported for 48 h.

### Phase E: Old contract cleanup (week 5+)

- Call `renounceOwnership()` on Base V1 (`0x8fc6…255a`) so it can never be
  unpaused or modified.
- Document V1 as **dead** in `nft/deployments/base-mainnet.json` with a
  `decommissioned: true` flag.

---

## 4. Existing NFT Migration Specifics

### 4.1 Base V2 → V3 (43 NFTs)

**Zero player action required.** The UUPS upgrade preserves all storage.
After upgrade:

- All 43 NFTs still owned by their original wallets.
- All tokenIds (1..43) unchanged.
- `tokenLevel(id) == 1` via default-zero-equals-one helper (no storage
  write needed).

The single transaction that does this is the `upgradeToAndCall(V3, initData)`
called by the proxy's owner (deployer wallet `0x1EC2…7828`).

### 4.2 Solana (7 NFTs)

**Migration script writes `level=1` attribute to each existing asset.**
This requires 7 update-authority signed transactions on Solana, total cost
~0.007 SOL (~$0.70). Script is idempotent.

Player perceives nothing — their existing NFTs simply gain a `Level` trait
in their wallet.

### 4.3 Arbitrum + Monad (0 NFTs)

No migration needed — there are no tokens to migrate. The V3 upgrade is
purely structural.

### 4.4 Aptos (no existing NFTs)

No migration needed. Fresh module launch.

### 4.5 Battle-win history

**Decision needed:** see Phase C, step C4. Default: start at 0.

Alternative for fairness: grant existing-NFT owners a "boost" via the
admin grant endpoint, e.g., 100 wins per NFT they own. We'd announce
this transparently as a "founding holder bonus" if desired.

---

## 5. Rollback Plans

| Phase | Failure mode | Rollback |
|-------|--------------|----------|
| B3 (Base proxy upgrade) | Any existing NFT broken | Call `upgradeToAndCall(V2, "")` to restore V2 impl. Verify all NFTs again. |
| B5 (Arbitrum/Monad upgrade) | Same | Same. |
| B7 (Solana migration) | Wrong attribute written | Run a "fix" script that overwrites with correct value. Plugin updates are non-destructive. |
| B8 (Aptos publish) | Module is broken at publish | Aptos requires the module to publish successfully — if it doesn't, no state exists, no rollback needed. If it does publish but has a bug, fix via compatible upgrade. |
| C2 (server release) | Server crashes on startup | Revert deployment to prior version. Feature flag remains off — old code path unchanged. |
| C3 (bridge orchestrator) | Orchestrator picks up phantom event | Set state=FAILED on the job, manually adjudicate. Future runs are unaffected. |
| C5 (feature flag) | Mass failures | Flip flag back to false; no new feature traffic. |
| D2-D3 (client rollout) | UI bugs | Hash-bucket rollback; or feature flag off in client env. |

---

## 6. Communications

What we tell players, when:

| When | Channel | Message |
|------|---------|---------|
| 1 week before Phase B | In-game announcement + Discord | "New NFT features coming next week: levels, upgrades, bridge to Base, marketplace. No action needed from you." |
| Day of Phase B (upgrade) | Status page + Discord | "Upgrading Base contract today. Brief outage on mint flow; existing NFTs unaffected." |
| Day of Phase D (client release) | In-game banner | "Upgrade your Demon King! New marketplace launched. Check the NFT panel." |
| Phase C decision on battle-win backfill | In-game + Discord | If choosing 0-wins baseline: "All NFTs start with 0 wins. Win battles to unlock upgrades." If choosing boost: "Founding holders receive 100 free wins per NFT." |

---

## 7. Tuning Knobs

| Knob | Default | Where |
|------|---------|-------|
| Rollout % bucket size | 10 → 50 → 100 | Server feature flag |
| Backfill heuristic | none (0 baseline) | Backfill script flag |
| Phase A duration | 1 week | Calendar |
| Phase B-E duration | 1 week each | Calendar |

---

## 8. Acceptance Criteria

Rollout is **complete** when:

- [ ] All 5 chains have V3 contracts (or equivalents) deployed and verified.
- [ ] All 50 existing NFTs read level=1 without storage writes (Base) or with idempotent attribute writes (Solana).
- [ ] No support tickets in 14 days about "missing NFT" or "level wrong".
- [ ] Bridge has processed ≥ 10 successful end-to-end transfers in production.
- [ ] Marketplace has ≥ 5 successful sales.
- [ ] Upgrade has been used ≥ 20 times with no failures.
- [ ] V1 Base contract has had `renounceOwnership` called.
- [ ] All session-state files updated to reflect new architecture.
- [ ] Architecture docs added to `docs/architecture/` describing V3 system for future contributors.
