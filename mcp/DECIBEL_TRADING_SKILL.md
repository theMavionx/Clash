---
name: clash-decibel-trading
description: Use when a Clash of Perps player asks the AI agent to inspect Decibel account state, view positions or orders, open or close trades, cancel orders, set leverage, or manage TP/SL through Hermes and Clash MCP tools.
---

# Clash Decibel Trading Skill

Use this skill only for Decibel trading requests from the authenticated Clash of Perps player.

## Non-Negotiable Rules

- Use only Clash MCP Decibel tools. Do not call upstream Decibel MCP directly.
- The MCP adapter injects mandatory Clash builder routing. Never ask the model or user for `builderAddr` or `builderFee`.
- Hermes interprets player trading requests and calls Decibel MCP tools directly. There is no backend trade pre-router.
- The player can trade only the Decibel wallet registered to their Clash account.
- For read-only requests, call tools immediately and summarize.
- For write requests, require clear symbol, side, and size/notional/collateral before placing an order unless the player explicitly delegates the choice.
- Treat "all my money", "all my balance", "max", "everything", and equivalent Ukrainian/Russian phrases as `collateral_pct: 100` when symbol and side are clear.
- If a write request is ambiguous, ask one concise clarification. Exception: for "surprise me / pick one / сам придумай" requests, use a conservative market order, 2x leverage, normal slippage, and an affordable symbol/size.
- For delegated trade requests, if the first order is below the Decibel minimum, use the smallest affordable valid order/market instead of surfacing raw chain-unit errors.
- Never invent order ids. Read them from `decibel_get_account` or `decibel_get_positions` first.

## Tool Routing

- Account, balance, equity, PnL: `decibel_get_account({ include_orders: true })`.
- Positions and open orders: `decibel_get_positions({ include_orders: true })`.
- Markets or prices: `decibel_get_markets({ symbols?: [...] })`.
- Open long/short with clear symbol, side, and amount: call `decibel_place_order` directly with `leverage` included. Do not run account, market, or leverage preflight unless a required field is missing or the tool blocks.
- Close/reduce: `decibel_close_position` directly when the request is clear. If the user says "close the position" without a symbol, call `decibel_close_position({})`; MCP closes the only open position or returns a blocker if multiple positions exist.
- After close/reduce, include `close_result.realized_pnl_usd_estimate` and `close_result.realized_pnl_pct_estimate` when returned. Do not say PnL is pending if these fields exist.
- Cancel order: `decibel_get_positions` -> `decibel_cancel_order`.
- TP/SL: `decibel_get_positions` -> `decibel_set_tpsl`.

## Tool Blocker Repair

- If a Decibel MCP tool blocks, inspect the blocker and current context.
- When a safe repair is obvious, retry once with corrected MCP arguments instead of surfacing the raw blocker.
- If repair is impossible, return `Blocked:` in English with one concrete missing requirement.

## Response Shape

Success: include symbol, side, size/notional, leverage if relevant, PnL in USD and percent after closes, tx hash/order id if returned, and one next step.
Blocked: write the exact blocker in English. For minimum-size blockers, never show raw Decibel chain units; translate them to approximate USDC collateral/notional.
Risk note: keep it short; do not add generic financial education unless the player asks.
