# ADR-0005: Avantis Browser Smart Wallet Delegate Mode

## Status
Accepted

## Date
2026-05-20

## Context

### Problem Statement
ClashHermes needs Avantis AI actions to run after one setup flow, without
storing a production Avantis private key on the VPS. Avantis documentation
describes a Smart Wallet flow where funds remain in the user's EOA wallet and
the Smart Wallet receives permission to place trades. The public Avantis SDKs
show the underlying contract route: the EOA calls `setDelegate(delegate)`, and
the delegate signs `delegatedAction(trader, callData)` for open, close, cancel,
and TP/SL actions.

### Constraints
- Do not store a full Avantis trading key on the VPS.
- Keep user collateral in the user's EOA wallet.
- Use official Avantis Trading contract delegation where possible.
- Keep Decibel and Avantis tool domains separate.
- The browser must still enforce Clash policy limits before submitting an AI
  action.
- The delegate needs Base ETH for gas and Avantis execution fees.

### Requirements
- AI can prepare Avantis actions through MCP/Hermes.
- The frontend can execute prepared Avantis actions through the Avantis
  delegate route after user setup.
- The setup flow must require user wallet transactions for delegation and USDC
  trading approval.
- Normal manual trading through the connected EOA wallet must keep working.
- If delegation is missing, expired, unfunded, or outside policy, the browser
  must block clearly before claiming success.

## Decision

Use Avantis native delegation as the production direction for AI Avantis
automation:

1. MCP Avantis write tools continue to return structured `browser_action`
   payloads. MCP never signs Avantis transactions.
2. The browser validates the prepared action against the active DEX, registered
   wallet, action expiry, and browser policy limits.
3. On the first matching AI action, the browser offers to enable Avantis Smart
   Wallet mode.
4. The browser creates a local delegate key and stores it with a TTL in
   tab-scoped `sessionStorage`.
5. The user's EOA submits `setDelegate(delegate)` on the Avantis Trading
   contract.
6. The user's EOA approves Avantis TradingStorage for USDC trading.
7. Future AI actions are encoded as normal Avantis Trading calldata, then sent
   by the delegate as `delegatedAction(trader, callData)`.
8. If the local delegate is not the on-chain delegate, or the delegate has
   insufficient Base ETH for gas, the browser blocks and asks for setup/funding.
9. The existing Privy hidden-wallet path remains a fallback, but the preferred
   route is native Avantis delegation.

### Architecture Diagram

```text
Hermes agent
  -> MCP Avantis write tool
  -> browser_action + policy + expiry
  -> React AiChatPanel policy guard
  -> useAvantis
       -> encode openTrade/close/cancel/updateTpAndSl
       -> delegate signs delegatedAction(trader, callData)
       -> Avantis Trading contract on Base
```

Setup:

```text
User EOA wallet
  -> setDelegate(browser-local delegate)
  -> approve(TradingStorage, USDC allowance)
  -> fund delegate/Smart Wallet address with Base ETH for gas
```

### Key Interfaces

- Avantis Trading ABI
  - `setDelegate(address delegate)`
  - `removeDelegate()`
  - `delegations(address trader) view returns (address)`
  - `delegatedAction(address trader, bytes call_data) payable`
- Browser delegate storage
  - `sessionStorage.clash_avantis_smart_wallet_delegate_v1:<owner>`
  - fields: private key, delegate address, valid-until timestamp
  - old `localStorage` delegate records are deleted on load
- `useAvantis` write options
  - `smartWallet: boolean`
  - `silentPrivy: boolean`

## Alternatives Considered

### Alternative 1: VPS Agent Wallet
- **Description**: Store an Avantis private key on the server and have Hermes
  sign trades there.
- **Pros**: Full offline automation.
- **Cons**: Server key risk and custodial blast radius.
- **Rejection Reason**: Conflicts with the no-VPS-production-key requirement.

### Alternative 2: External Wallet Prompt Bypass
- **Description**: Make MetaMask/Rabby sign repeatedly after one approval.
- **Pros**: Would keep using the user's existing wallet if possible.
- **Cons**: External wallets intentionally prevent this.
- **Rejection Reason**: Unsafe and not generally possible.

### Alternative 3: Privy Hidden Transactions Only
- **Description**: Use Privy embedded wallet hidden transaction UI after an
  EIP-712 browser permission.
- **Pros**: Works for Privy embedded wallets without a separate gas delegate.
- **Cons**: Does not solve external-wallet automation and is not the Avantis
  native Smart Wallet path.
- **Rejection Reason**: Kept as fallback, not the main production direction.

## Consequences

### Positive
- Uses Avantis-native delegation instead of a custom server signer.
- User funds remain in the EOA wallet.
- AI actions can avoid repeated external wallet prompts after setup.
- Delegate scope is limited to the Avantis Trading contract path.
- Browser policy still blocks oversized AI actions.

### Negative
- The browser-local delegate key can trade through Avantis while the tab
  session remains open and the key is valid.
- Avantis native delegation is broad: contract-level per-method or per-notional
  limits are not exposed by the reviewed SDKs, so Clash policy is enforced in
  the browser and by USDC allowance/funding controls.
- The delegate needs Base ETH funding for gas/execution fees.
- Automation is browser-bound unless a future non-VPS key boundary is added.

### Risks
- XSS could abuse a live delegate.
  - Mitigation: TTL, action IDs, DEX/wallet checks, browser policy limits, and
    clear revoke path.
- Excess USDC allowance increases risk if the delegate is compromised.
  - Mitigation: Avantis collateral remains in the EOA, but users should keep
    allowance/funding sized to the intended automation budget.
- Delegate gas funding can run out.
  - Mitigation: the frontend checks delegate ETH before auto-submission and
    surfaces the delegate address to fund.

## Performance Implications
- **CPU**: Minimal; one extra calldata encoding step.
- **Memory**: Minimal; one delegate record per EOA wallet.
- **Load Time**: One small local helper module, no new npm dependency.
- **Network**: Setup adds `setDelegate` and USDC approval transactions.
  Delegated trades remain one Base transaction per Avantis action.

## Migration Plan
1. Add Avantis delegation ABI entries.
2. Add browser-local delegate creation/storage and delegate wallet client.
3. Add `useAvantis` setup, refresh, revoke, and delegated transaction paths.
4. Route AI Avantis browser actions through Smart Wallet mode when enabled.
5. Update MCP/agent documentation so Hermes describes browser action
   submission accurately.

## Validation Criteria
- `npm --prefix web run build` succeeds.
- AI Avantis actions offer Smart Wallet setup when no delegate is active.
- Existing active delegate calls use `delegatedAction(trader, callData)`.
- Missing delegate ETH blocks before transaction submission with the address to
  fund.
- Manual EOA Avantis trading still works.

## Related Decisions
- [ADR-0002: Per-Player Hermes AI Chat](./adr-0002-per-player-hermes-ai-chat.md)
- [ADR-0003: Hermes Game Agent Runtime Contract](./adr-0003-hermes-game-agent-runtime.md)
- [ADR-0004: Builder-Aware Decibel Trading MCP](./adr-0004-builder-aware-decibel-trading-mcp.md)
