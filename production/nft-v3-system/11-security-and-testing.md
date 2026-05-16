# 11 — Security & Testing

## 1. Overview

Threat model, audit checklist, and the test matrix that must pass before
mainnet rollout. The system handles user funds and bridges value across
chains — security debt is a permanent liability.

---

## 2. Threat Model

### 2.1 Adversaries

| Adversary | Goal | Capability |
|-----------|------|------------|
| **External player (cheater)** | Free upgrade or duplicate NFT | Submit crafted requests, replay signed payloads, sandwich tx |
| **External attacker (mass exploit)** | Drain treasury or mint without payment | Read all on-chain code, fuzz endpoints, hijack RPCs |
| **Compromised user wallet** | Mint or transfer NFTs not legitimately theirs | Sign txs from a stolen private key |
| **Compromised server signer key** | Sign infinite upgrade quotes / bridge receipts | Issue any signature scoped to our domains |
| **Malicious frontend (XSS)** | Trick user into signing wrong tx | Inject script, modify tx payload |
| **Reorg / chain rollback** | Double-mint via bridge | Cause a deep chain reorg |
| **Insider with deployer key** | Drain treasury, change royalty, etc. | Full owner-level control of every contract |

### 2.2 Trust boundaries

```
Player wallet  ──signs──→  Public web UI  ──HTTPS──→  Server  ──signs──→  Blockchain
                              │                          │
                              │                  ┌───────┴───────┐
                              │                  │ DB (battle    │
                              │                  │  wins, nonces,│
                              │                  │  jobs)        │
                              │                  └───────────────┘
                              │
                              └── reads on-chain state directly when needed
```

The server is the **only** trusted authority for signing quotes and
receipts. The server **trusts**: its own DB, on-chain state of contracts
it controls, and the master signer key.

---

## 3. Critical Security Properties

These must hold under all conditions. Each is checked in tests.

| # | Property | Test method |
|---|----------|-------------|
| S1 | **No mint without payment.** Every L1 mint pays $8.9 or 5 CoP to treasury. | Static analysis + integration test |
| S2 | **No upgrade without payment + win threshold.** Server signs only after both checks; contract verifies signature. | Integration test (fuzzed) |
| S3 | **No bridge mint without source burn.** Each receiptId is bound to a real, observed, finalized burn event. | Audit + replay tests |
| S4 | **No replay.** Each nonce / receiptId is consumed exactly once on-chain. | Replay attack tests |
| S5 | **No supply > 500.** Global cap is checked by server before signing any mint quote. Bridge mints exempt. | Stress test |
| S6 | **No expired signatures accepted.** All quotes/receipts include `deadline`; contract checks `block.timestamp <= deadline`. | Replay tests |
| S7 | **No private-key leak.** Mnemonic, signer keys, admin key never logged, never written to tracked files. | Pre-commit hook + secrets scan |
| S8 | **No owner privilege escalation.** Proxy owner can upgrade impl but cannot mint/burn without normal flow. | Audit |
| S9 | **No royalty bypass.** Marketplace always reads EIP-2981 royalty and pays it; cap at price. | Audit + integration test |
| S10 | **No frontend tx manipulation.** Wallet shows the exact tx the server returned; UI displays a hash players can verify. | Manual audit + code review |

---

## 4. Test Matrix

### 4.1 Unit tests (Solidity — Foundry or Hardhat)

```
DemonKingBaseV3
  ✓ upgradeToken with valid signature succeeds
  ✓ upgradeToken with bad signature reverts
  ✓ upgradeToken with replayed nonce reverts
  ✓ upgradeToken with expired deadline reverts
  ✓ upgradeToken with non-owner sender reverts
  ✓ upgradeToken with invalid level transition (1→3) reverts
  ✓ bridgeMint with valid receipt mints at correct level
  ✓ bridgeMint with replayed receiptId reverts
  ✓ bridgeMint with bad signer reverts
  ✓ tokenLevel returns 1 for never-upgraded token
  ✓ tokenLevel returns 0 for non-existent token (via _requireOwned revert)
  ✓ royaltyInfo returns (treasury, 2.5% * price)
  ✓ supportsInterface(EIP-2981) = true
  ✓ supportsInterface(EIP-4906) = true
  ✓ adminSetLevel works for owner, reverts for non-owner
  ✓ pause blocks upgrade and bridgeMint
  ✓ initializeV3 cannot be called twice (reinitializer guard)
  ✓ storage layout preserved across V2 → V3 upgrade (storage-layout check)

DemonKingMarketplace
  ✓ list with approval succeeds
  ✓ list without approval reverts
  ✓ list with disallowed NFT reverts
  ✓ list with disallowed payment token reverts
  ✓ buy ETH-priced listing transfers NFT, pays royalty + platform fee + seller
  ✓ buy USDC listing same as above
  ✓ buy when seller transferred NFT away reverts
  ✓ buy when listing expired reverts
  ✓ buy with wrong msg.value reverts
  ✓ cancel by seller succeeds
  ✓ cancel by non-seller reverts
  ✓ updatePrice by seller succeeds
  ✓ updatePrice by non-seller reverts
  ✓ pause blocks new listings and buys; cancellation still allowed
  ✓ royalty + platform fee can't exceed sale price
  ✓ EIP-2981 try/catch tolerates NFT without royaltyInfo

Aptos demon_king::nft
  ✓ mint_with_quote with valid signature succeeds
  ✓ mint_with_quote with bad signature aborts
  ✓ mint_with_quote duplicate nonce aborts
  ✓ upgrade_token with valid signature succeeds
  ✓ bridge_burn emits event with correct level and target
  ✓ admin_pause locks new mints
```

### 4.2 Integration tests (end-to-end on Sepolia / devnet)

```
Bridge end-to-end
  ✓ Arbitrum L1 → Base L1 in ≤ 2 min
  ✓ Monad L2 → Base L2 in ≤ 2 min
  ✓ Solana L3 → Base L3 in ≤ 2 min
  ✓ Aptos L1 → Base L1 in ≤ 5 min
  ✓ Bridge job recovers after server restart mid-flight
  ✓ Battle wins migrated to (base, newTokenId)

Upgrade end-to-end
  ✓ Player with 1000 wins can upgrade L1→L2 on EVM
  ✓ Player with 999 wins gets 403
  ✓ Player not owning NFT gets 403
  ✓ Upgrade flow on Solana (with attribute write)

Marketplace end-to-end
  ✓ List with USDC → another wallet buys → NFT moves, royalty paid
  ✓ Front-run scenario: two buyers tx in same block, only one succeeds, other reverts gracefully
  ✓ Stale-listing scenario: seller transferred NFT → buyer's tx reverts

Migration
  ✓ Base V2 → V3 upgrade on Sepolia preserves 5 minted test NFTs (verified by ownerOf + tokenLevel)
  ✓ Solana migration script attaches level=1 to 5 test assets
  ✓ Re-run of Solana migration is no-op (idempotent)
```

### 4.3 Stress tests

```
✓ 10 000 concurrent quote requests don't crash server
✓ 1 000 bridge jobs in NEW state processed within 30 min
✓ DB withstands 100k nft_battle_wins INSERT/UPDATE in 5 min
✓ Marketplace browse endpoint responds < 200ms for 10k listings
```

### 4.4 Adversarial tests (fuzzing)

```
✓ Fuzz upgrade quotes with random tokenId, owner, level — server rejects all malformed inputs
✓ Fuzz bridge receipts with random fields — Base contract rejects all
✓ Fuzz marketplace list with negative price, address(0) seller, etc.
✓ Slither analysis on all .sol files — zero high-severity findings
✓ Mythril analysis on V3 + marketplace — no reentrancy, no integer overflow
```

---

## 5. Manual Audit Checklist

Before mainnet, a human reviews the following:

- [ ] Read every line of `DemonKingBaseV3.sol` against the spec in [02-base-v3-upgrade.md](02-base-v3-upgrade.md).
- [ ] Verify storage layout compatibility output of `check-storage-layout.mjs`.
- [ ] Verify EIP-712 typehash strings match server-side signing code exactly (byte-for-byte).
- [ ] Verify `bridgeQuoteSigner` and `upgradeQuoteSigner` are set correctly on every chain after deploy.
- [ ] Verify ownership of every contract is the expected deployer (not a hot wallet).
- [ ] Run `solhint`, `slither`, `mythril` — review every finding, document acceptance or fix.
- [ ] Diff `DemonKingMarketplace.sol` against Seaport / OpenSea Wyvern for known-bad patterns.
- [ ] Manual review of all `safeTransferFrom` calls — ensure ordering follows CEI pattern.
- [ ] Verify `_requireOwned(tokenId)` is called before any state read on tokenId.
- [ ] Verify `nonReentrant` modifier is on every payable / external state-mutating function.
- [ ] Verify the server signer keys are loaded from env only, with `process.env[key] || throw`.
- [ ] Verify no `console.log` of any signature, key, or sensitive payload.
- [ ] Verify all DB queries use parameterized statements (no string concatenation).
- [ ] Verify HTTP rate limits on upgrade-quote and bridge-init endpoints (e.g., 10/min per wallet).
- [ ] Verify CSP headers and XSS protections on the frontend.
- [ ] Run the secrets scan one final time (the same scan we run in this session).
- [ ] Verify treasury address `0xC024884ad9C5540996492Cc2DD080964941A3094` on every contract matches `.env`.

---

## 6. Key Management

| Key | Storage | Rotation procedure |
|-----|---------|-------------------|
| `NFT_BASE` mnemonic (derives EVM + Aptos signer wallets) | Server `.env` only, gitignored | If compromised: generate new mnemonic, transferOwnership on all V3 contracts, update env, restart server, re-sign any in-flight quotes. |
| `NFT_KEY` (Solana base58 secret) | Server `.env` only | Same pattern — update authority on collection via Metaplex SDK, then rotate env. |
| `SERVER_ADMIN_KEY` | Server `.env` only | Change env value, restart. No on-chain rotation needed. |
| `UPGRADE_QUOTE_SIGNER` | Same as `NFT_BASE` derived key | Setter on each V3 contract: `setUpgradeQuoteSigner(newAddr)`. |
| `BRIDGE_QUOTE_SIGNER` | Separate derivation index from `NFT_BASE` (e.g., `m/44'/60'/0'/0/1`) | Setter on each V3 contract: `setBridgeQuoteSigner(newAddr)`. |

**Rule:** signer key is **derived from `NFT_BASE` at a non-zero index** so
that compromise of the deployer (index 0) doesn't trivially compromise
the signer. Two physical files (.env) is operationally simpler than two
mnemonics; key separation comes from BIP-32 derivation paths.

---

## 7. Incident Runbooks

### 7.1 Bridge signer key compromised

1. Immediately call `setBridgeQuoteSigner(newSigner)` on Base, Arbitrum, Monad V3.
2. For Solana: rotate update authority via `updateCollection`.
3. For Aptos: call `admin_set_signer` on the module.
4. Restart server with new env.
5. For any `state=SIGNED` bridge jobs with old signer's signatures:
   - Manually re-sign with new signer key (the burn event is still on-chain).
   - Update DB with new signature.
6. Notify affected users.
7. Public post-mortem within 7 days.

### 7.2 Mass bridge backlog

If finality detection lags (e.g., RPC outage), bridge jobs accumulate in
`state=NEW`. The orchestrator processes them on RPC recovery. No data loss
because:
- All jobs are persisted in DB before signing.
- Cursor-based scan resumes from last processed block.
- Players see "indexing" status until their job advances.

### 7.3 Discovered double-mint on Base

If a bug allows two NFTs to mint from one burn:

1. Immediately call `pause()` on Base V3.
2. Investigate root cause (likely a missing replay check).
3. Identify the duplicate tokenId; coordinate with affected players.
4. Hot-fix V3 implementation, run UUPS upgrade with `reinitializer(N)` if state migration needed.
5. `unpause()`.

---

## 8. Acceptance Criteria

The V3 system is **security-cleared for production** when:

- [ ] All Slither high-severity findings resolved.
- [ ] All Mythril findings resolved.
- [ ] Foundry test suite passes 100%, branch coverage > 90% for V3 + marketplace.
- [ ] Integration test suite passes end-to-end on Sepolia + Solana devnet + Aptos testnet + Monad testnet.
- [ ] Manual audit checklist in §5 fully signed off.
- [ ] Incident runbooks reviewed by ops team (= Egor) and stored in `docs/runbooks/`.
- [ ] Secrets scan returns zero findings for known-sensitive patterns.
- [ ] Storage-layout check passes for every chain's V3 deployment.
- [ ] Bug bounty announcement drafted (optional but recommended for value > $10k locked).

---

## 9. Open Items

- Should we engage a **professional auditor** (Trail of Bits, ChainSecurity, etc.) before mainnet? Budget $20–50k, lead time 4–6 weeks.
  - Recommendation: **yes**, given that the system handles bridged value across 5 chains and a marketplace.
- Bug bounty program: $1k–$10k bounties depending on severity. Run on Immunefi.
- Insurance: probably not at this scale.
