# ADR-0004: Builder-Aware Decibel Trading MCP

## Status
Accepted

## Date
2026-05-19

## Context

### Problem Statement
Players need to trade Decibel from the in-game Hermes chat: view account state,
positions, open orders, place market and limit orders, close positions, cancel
orders, set leverage, and manage TP/SL. Decibel publishes an MCP through
`@decibeltrade/cli`, but the current public tool schema does not expose Clash
builder routing fields.

### Constraints
- Decibel order writes must preserve Clash builder attribution and builder fee.
- Player agents authenticate with existing `cop_ai_...` MCP keys.
- Hermes must not receive private Decibel API-wallet keys.
- The AI can read positions freely, but write actions must be explicit and
validated server-side.
- Existing browser trading through `server-futures/decibel.js` must keep working.

### Requirements
- Trading tools must work from the same Hermes MCP connection as game tools.
- Every Decibel write must use the Clash server signer and approved builder
subaccount.
- A player may only trade the Decibel account registered to their Clash profile.
- Tool results must be auditable through MCP event logs.
- The interface should cover the same core operations a player can do manually:
account, markets, positions, open orders/history, open order, close position,
cancel order, leverage, and TP/SL.

## Decision

We will not wire Hermes directly to the upstream Decibel MCP for production
trading. Instead, Clash MCP will include a builder-aware Decibel adapter:

- Read tools call Decibel REST through `server-futures/decibel.js`.
- Write tools call the existing Clash server-side signer helpers.
- Builder routing is injected by MCP from server env allowlists and cannot be
overridden by the model.
- Owner/subaccount validation uses the authenticated player's saved wallet and
derived primary Decibel subaccount.
- Successful rewardable orders are recorded through `server-futures/db.js`.

### Architecture Diagram

```text
In-game chat
  |
  v
Hermes per-player agent
  |
  v
Clash MCP /mcp
  |-- game tools
  |-- Decibel trading tools
        |
        v
server-futures/decibel.js
  |-- Decibel REST reads
  |-- Aptos server signer writes
  |-- builderAddr + builderFee enforced
        |
        v
Decibel contracts / API
```

### Key Interfaces

New MCP tools:

```text
decibel_get_account
decibel_get_markets
decibel_get_positions
decibel_place_order
decibel_close_position
decibel_cancel_order
decibel_set_leverage
decibel_set_tpsl
```

`decibel_place_order` accepts:

```json
{
  "symbol": "BTC",
  "side": "long",
  "order_type": "market",
  "collateral_usd": 10,
  "leverage": 5
}
```

## Alternatives Considered

### Alternative 1: Direct Upstream Decibel MCP
- **Description**: Add `decibel-mcp` from `@decibeltrade/cli` to Hermes.
- **Pros**: Fastest integration and tracks Decibel tooling directly.
- **Cons**: Current order schemas omit `builderAddr` and `builderFee`, so Clash
  builder attribution can be lost.
- **Rejection Reason**: Builder attribution is a hard business requirement.

### Alternative 2: Separate Trading MCP Host
- **Description**: Run `trading-mcp.clashofperps.fun` with Decibel tools only.
- **Pros**: Strong isolation for financial tools.
- **Cons**: More deploy/config surface while Hermes already has an authenticated
  Clash MCP connection.
- **Rejection Reason**: Use the existing MCP path first; split later if multiple
  DEX adapters require independent scaling or isolation.

### Alternative 3: Backend Chat Fast Path
- **Description**: Detect trading commands in the chat backend and execute
  trades without Hermes tool choice.
- **Pros**: Lowest latency.
- **Cons**: Breaks the product model where the AI agent plans actions through
  tools and returns a tool-grounded answer.
- **Rejection Reason**: Hermes must remain the agent layer.

## Consequences

### Positive
- Decibel trading keeps Clash builder fee routing.
- Hermes uses one MCP connection for gameplay and Decibel trading.
- Reads and writes are logged by the same MCP event infrastructure.
- The adapter reuses battle-tested server-futures Decibel code.

### Negative
- Our MCP now includes financial tools, increasing the importance of clear
  prompt rules and server-side validation.
- We maintain a local adapter instead of relying entirely on upstream MCP.
- Exact Decibel upstream tool parity needs periodic review.

### Risks
- A weak model may try to trade without enough parameters.
  - Mitigation: tool prompt requires symbol, side, and size/notional/collateral.
- Builder env may be misconfigured.
  - Mitigation: MCP rejects writes if no approved builder routing is configured.
- REST shape changes may break read normalization.
  - Mitigation: keep raw rows in tool output and cache only lightly.

## Performance Implications
- **CPU**: Low; most work is REST calls and one Aptos transaction build on writes.
- **Memory**: Minimal caches for Decibel markets/prices.
- **Load Time**: No frontend load impact.
- **Network**: Decibel reads add REST calls; writes add Aptos transaction latency.

## Migration Plan
1. Add Decibel read/write helpers to `server-futures/decibel.js`.
2. Register builder-aware Decibel tools in Clash MCP.
3. Add Decibel tool names and rules to Hermes prompt/tool include list.
4. Publish skill documentation for agents.
5. Restart MCP and Hermes orchestrator.
6. Smoke-test read tools with a Decibel player key, then test a small trade in
   a controlled account.

## Validation Criteria
- `decibel_get_account` returns only the authenticated player's Decibel account.
- `decibel_place_order` refuses non-Decibel players.
- `decibel_place_order` includes approved `builderAddr` and expected
  `builderFee` in the order payload.
- Hermes can answer "show my positions" using MCP instead of generic chat.
- Hermes asks one clarification for missing trade symbol/side/amount.

## Related Decisions
- [ADR-0001: Remote MCP Deployment](./adr-0001-remote-mcp-deployment.md)
- [ADR-0002: Per-Player Hermes AI Chat](./adr-0002-per-player-hermes-ai-chat.md)
- [ADR-0003: Hermes Game Agent Runtime Contract](./adr-0003-hermes-game-agent-runtime.md)
