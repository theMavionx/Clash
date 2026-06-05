# ADR-0010: Ink EVM NFT And Shop Integration

## Status
Accepted

## Date
2026-06-04

## Context

### Problem Statement
Players need to buy Demon King NFTs and game shop items with ETH or USDC on
Ink, without deploying contracts yet.

### Constraints
- Reuse existing EVM Demon King V3 and `DemonKingBaseShopV2` contracts.
- Do not deploy during this implementation pass.
- Keep Base, Arbitrum, Monad, Solana, and Aptos behavior unchanged.
- Use current Ink mainnet parameters and Circle USDC.

### Requirements
- Server accepts Ink as an EVM NFT, bridge, marketplace, and shop chain.
- Shop purchases support Ink ETH and Ink USDC.
- Demon King NFT mint/upgrade/owned flows support Ink.
- Deployment scripts can target Ink and write Ink deployment JSON.
- Client can switch to Ink, quote Ink purchases, and show Ink explorer links.

## Decision

Treat Ink as another EVM chain target in the existing multi-chain NFT/shop
architecture. The existing contracts are sufficient: native payment is
`address(0)` and USDC is a configured ERC-20 token.

### Architecture Diagram

```text
Godot/Web client
  -> Ink wallet switch
  -> server quote endpoints
  -> Ink ETH transfer or Ink USDC transfer/mintWithQuote
  -> server receipt verification and game grant

nft/scripts
  -> deploy V2 proxy
  -> upgrade to V3
  -> deploy shop proxy
  -> write Ink deployment JSON
```

### Key Interfaces
- `chain=ink`
- `chainId=57073`
- `USDC=0x2D270e6886d130D724215A266106e6832161EAEd`
- `nft/deployments/ink-v3-mainnet.json`
- `nft/deployments/ink-shop-v2-mainnet.json`

## Alternatives Considered

### Separate Ink-Specific Contracts
- **Description**: Create a dedicated Ink NFT/shop contract family.
- **Pros**: Could encode Ink-specific naming.
- **Cons**: More audit and maintenance surface.
- **Rejection Reason**: Ink is EVM-compatible and the existing contracts already support the needed payment modes.

### Server-Only Off-Chain NFT Sales
- **Description**: Accept Ink payments and mint elsewhere manually.
- **Pros**: No chain deployment.
- **Cons**: Does not satisfy Demon King NFT ownership on Ink.
- **Rejection Reason**: The requested end state requires Ink blockchain NFT integration.

## Consequences

### Positive
- Minimal contract surface change.
- Existing bridge, marketplace, and shop patterns stay consistent.
- Operators can deploy Ink later using the same script family.

### Negative
- Ink behavior depends on deployment JSON and env being correctly populated.
- Browser owned NFT scan needs `VITE_NFT_INK_CONTRACT` after deployment.

### Risks
- **Incorrect treasury env**: mitigate with sale flags disabled by default.
- **USDC address drift**: use official Circle Ink USDC address and document it.
- **RPC instability**: configure multiple browser and server fallback RPCs.

## Performance Implications
- **CPU**: Low; Ink follows existing EVM request paths.
- **Memory**: Low; no new long-lived data structures beyond chain config.
- **Load Time**: Minimal; Ink config is included in existing shop/NFT payloads.
- **Network**: Adds Ink RPC calls only for Ink-specific actions.

## Migration Plan
1. Add Ink to server and client EVM chain registries.
2. Add Ink to NFT/shop/custodial marketplace config.
3. Add Ink deployment script targets.
4. Keep sale disabled until deployment files and treasuries are verified.
5. Enable Ink sale via env once contracts are deployed.

## Validation Criteria
- Server modules parse after adding Ink.
- Frontend build succeeds.
- NFT scripts accept `--chain=ink`.
- API config includes Ink when treasury env is present.
- No deploy is required for code verification.

## Related Decisions
- [ADR-0009: Server Custodial NFT Marketplace](adr-0009-server-custodial-nft-marketplace.md)
