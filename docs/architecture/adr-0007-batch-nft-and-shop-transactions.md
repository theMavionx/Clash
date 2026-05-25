# ADR-0007: Batch NFT And Shop Transactions

## Status
Accepted

## Date
2026-05-25

## Context

### Problem Statement
Players need to buy game shop items and mint, bridge, or upgrade multiple Demon King NFTs in one user flow, for example 10 items at a time. The existing UI exposes one item at a time even though several backend routes and contracts already accept `quantity`.

### Constraints
- EVM direct mint and game shop contracts already include `quantity` in the signed quote tuple.
- Aptos direct mint quotes already include `quantity`; Aptos transactions call a Move function with `functionArguments`.
- Solana game shop can pay an aggregate quote in one transfer transaction.
- Current Solana NFT mint path uses Metaplex Core Candy Machine and creates one asset signer per mint transaction.
- Current bridge and upgrade contracts expose single-token methods: `bridgeBurn(tokenId, destinationChainId)` and `upgradeToken(tokenId, ...)`.
- Server cannot burn or upgrade a user's source-chain NFT without a user signature or a previously granted custody/delegation model.

### Requirements
- Let players choose quantities up to 10 where the current protocol already supports it.
- Keep source-of-truth ownership on-chain.
- Preserve current bridge ledger idempotency per consumed source NFT.
- Do not imply one on-chain transaction when the current contracts do not support it.
- Keep UI safe against partial completion by showing progress and preserving retries.

## Decision

Use a hybrid batch model:

1. **Direct NFT mint**
   - Base, Arbitrum, Monad, and Aptos pass `quantity` into the existing quote and mint helpers.
   - Solana NFT mint accepts the same UI quantity but processes it as a client-side sequential batch using the existing one-asset Candy Machine flow. A later contract/program-specific optimization can pack multiple mint instructions only if it fits Solana transaction size/compute limits.

2. **Game shop**
   - Expose a per-product quantity control.
   - Pass `quantity` into existing `/shop/*/quote` and `/shop/*/redeem` flows.
   - Display and animate the multiplied reward totals.

3. **Bridge**
   - Keep the current one-source-NFT bridge endpoints as the execution primitive.
   - Add batch bridge later as a coordinator that queues selected source NFTs and processes each burn/relay independently with progress, retry, and idempotency.
   - Do not add a server-only bridge batch unless contracts are upgraded with batch burn or users grant explicit source-chain authority.

4. **Upgrade**
   - Keep the current one-NFT upgrade endpoints as the execution primitive.
   - Add batch upgrade later as a coordinator over selected NFTs. A true one-transaction upgrade requires new contract methods such as `upgradeTokens(uint256[] tokenIds, ...)` or chain-specific Move/Solana batch functions.

### Architecture Diagram

```text
UI quantity / multi-select
        |
        +-- direct mint/shop with quantity ---> existing quote/redeem route ---> one aggregate tx where supported
        |
        +-- Solana NFT mint batch -----------> sequential mintV1 txs with progress
        |
        +-- bridge/upgrade batch (next) -----> per-token job queue ---> existing single-token endpoints
```

### Key Interfaces

- `mintBaseNft({ quantity })`
- `mintEvmNft({ quantity })`
- `mintAptosNft({ quantity })`
- `buy*ShopItem({ quantity })`
- Future bridge batch job:
  - `{ sourceChain, destChain, destAddress, sourceItems: [{ sourceTokenId | sourceTokenAddress | sourceAsset }] }`
- Future upgrade batch job:
  - `{ chain, owner, payment, tokenIds: string[] }`

## Alternatives Considered

### Alternative 1: One Server-Side Batch For Everything
- **Description**: User submits desired items, server burns/bridges/upgrades and charges a $1 fee.
- **Pros**: Best UX if custody or delegation exists.
- **Cons**: Server cannot authorize source-chain burns/upgrades for user-owned NFTs today.
- **Rejection Reason**: Would break ownership/security assumptions without new contract authority.

### Alternative 2: New Batch Contract Methods Everywhere
- **Description**: Deploy batch `mint`, `bridgeBurnBatch`, and `upgradeBatch` functions per chain.
- **Pros**: True one-signature batch UX.
- **Cons**: Requires contract deployments, audits, migration, and extra mobile wallet QA.
- **Rejection Reason**: Too broad for immediate UI support; keep as future optimization.

### Alternative 3: Client Coordinator On Existing Single-Token Calls
- **Description**: UI processes N single-token bridge/upgrade/mint operations with progress and retry.
- **Pros**: Works with current contracts; preserves idempotent per-token ledger.
- **Cons**: More wallet prompts; partial success must be handled clearly.
- **Rejection Reason**: Accepted for bridge/upgrade future work and Solana NFT mint fallback.

## Consequences

### Positive
- Game shop and most NFT mint flows support 10-item purchase immediately.
- No contract redeploy needed for the first phase.
- Bridge and upgrade design remains safe and audit-friendly.

### Negative
- Solana NFT batch mint is not a single transaction in the current implementation.
- Bridge and upgrade still require additional coordinator UI/API work for multi-select execution.

### Risks
- Solana sequential mint can partially complete if the user cancels midway.
  - Mitigation: show progress and sync minted NFTs after the flow.
- Quantity quote may exceed supply or per-product max.
  - Mitigation: server already validates quantity and supply.
- Future server-side bridge fees can confuse users if charged per item.
  - Mitigation: display total fee before the first signature.

## Performance Implications
- **CPU**: Minimal for quote-based batch purchase; linear for sequential Solana mint.
- **Memory**: Minimal.
- **Load Time**: No meaningful change.
- **Network**: Fewer quote/redeem calls for game shop and EVM/Aptos mint; Solana NFT mint remains N transactions.

## Migration Plan
1. Add quantity controls for direct NFT mint and game shop.
2. Keep Solana NFT mint as a sequential coordinator with progress.
3. Add bridge multi-select + queue using existing `/bridge/init` and `/bridge/relay`.
4. Add upgrade multi-select + queue using existing upgrade endpoints.
5. Consider batch contract methods after mainnet usage proves demand.

## Validation Criteria
- Buying `quantity = 10` game shop resources grants 10x rewards and displays 10x rewards.
- Minting `quantity = 10` on Base/EVM/Aptos sends quote quantity 10.
- Minting `quantity > 1` on Solana produces one minted asset per successful wallet approval.
- Bridge/upgrade continue to work one token at a time until coordinator work lands.

## Related Decisions
- Solana transactions and instructions: https://solana.com/docs/core/transactions/transaction-structure
- Solana instructions: https://solana.com/docs/core/instructions
- Aptos TypeScript transaction building: https://aptos.dev/build/sdks/ts-sdk/building-transactions
- Aptos TypeScript batching: https://aptos.dev/build/sdks/ts-sdk/building-transactions/batching-transactions
- viem contract writes: https://viem.sh/docs/contract/writeContract
