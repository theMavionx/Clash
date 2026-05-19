# Hermes Decibel Trading Integration

This document describes the production flow for Decibel trading through ClashHermes without executing live trades during tests.

## User Flow

1. The player opens ClashHermes chat in the game.
2. The player asks a trading request, for example:
   - `show my Decibel positions`
   - `prices for BTC and ETH`
   - `open long BTC with 10 USDC at 5x`
   - `close my ETH position`
   - `cancel my BTC order`
3. The web backend classifies the request into a `decibel_*` intent and attaches expected MCP tools.
4. Hermes receives the player context, recent messages, global game memory, the Clash game skill, and the Decibel trading skill.
5. Hermes calls only Clash MCP Decibel tools.
6. The MCP server validates the authenticated player, the registered Decibel wallet, and builder-aware routing before forwarding to Decibel adapters.
7. Hermes replies in chat with a concise result, blocker, or one clarification if a write request is missing required details.

## Tool Routing

- Account, balance, equity, PnL: `decibel_get_account`
- Positions and open orders: `decibel_get_positions`
- Market prices: `decibel_get_markets`
- Open long/short: `decibel_get_account` -> optional `decibel_set_leverage` -> `decibel_place_order`
- Close/reduce: `decibel_get_positions` -> `decibel_close_position`
- Cancel order: `decibel_get_positions` -> `decibel_cancel_order`
- TP/SL: `decibel_get_positions` -> `decibel_set_tpsl`

## Safety Rules

- The AI never calls upstream Decibel MCP directly.
- The AI never asks the user for builder address or builder fee.
- The MCP adapter owns builder routing.
- The player can trade only with the Decibel wallet attached to their Clash account.
- Write requests require clear symbol, side, and size/notional/collateral.
- Ambiguous write requests ask exactly one clarification.
- Order ids must be read from MCP tools; Hermes must not invent ids.

## Skill Locations

- Public MCP skill: `https://mcp.clashofperps.fun/decibel-skills.md`
- Repo source: `mcp/DECIBEL_TRADING_SKILL.md`
- Hermes runtime prompt source: `hermes-orchestrator/src/clash_agent_prompt.cjs`
- Per-player runtime copy: `skills/clash-decibel-trading/SKILL.md` inside the generated Hermes player workspace.

## Dry-Run Stress Test

Run:

```bash
node mcp/scripts/stress_hermes_decibel_intents.mjs
```

The test checks multilingual intent routing and expected MCP tool selection. It does not place trades.
