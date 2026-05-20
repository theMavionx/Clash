---
name: clash-avantis-trading
description: Use when a Clash of Perps player asks Hermes to inspect Avantis account state, view positions or open orders, prepare browser-signed Avantis trades, close positions, cancel orders, or manage TP/SL through Clash MCP tools.
---

# Clash Avantis Trading Skill

Use this skill only for Avantis trading requests from the authenticated Clash of Perps player.

## Source Reference

The public `shivam2320/avantis-mcp` server was reviewed as a tool-set reference at commit `48dee1357d632b524da0841eaafa38a9dbda746a`. This implementation is not wired to Osiris Hub and does not store Avantis private keys on the VPS.

## Trading Mode

- Avantis is self-custody.
- MCP reads the registered EVM wallet.
- MCP write tools prepare a `browser_action` payload only.
- The browser submits the final Base transaction after local policy checks, either through the user's wallet or through the Avantis Smart Wallet delegate that the user enabled in the browser.
- Avantis Smart Wallet mode uses `setDelegate`/`delegatedAction`: funds remain in the user's EOA, and the delegate only pays Base ETH gas/execution fees.
- No Avantis server agent wallet is created or funded by Clash.

## Tools

- `avantis_get_account({ include_orders? })`: read self-custody wallet state.
- `avantis_get_markets({ symbols?, limit? })`: read Avantis markets and mark prices.
- `avantis_market_scan({ symbols?, limit?, chart_limit?, lookback_hours? })`: read Avantis market universe plus compact 1h chart sparklines and momentum signals for delegated trade selection.
- `avantis_get_positions({ include_orders? })`: read self-custody positions/orders.
- `avantis_place_order({ symbol?, side?, order_type?, price?, collateral_usd?, collateral_pct?, notional_usd?, leverage?, use_max_leverage?, slippage_pct?, take_profit?, stop_loss?, auto_select? })`: prepare a browser-signed market or limit trade. If `symbol` or `side` is missing on a delegated-choice request, pass `auto_select: true`; the tool can scan markets and choose.
- `avantis_close_position({ symbol?, pair_index?, trade_index?, amount?, collateral_usd?, percent?, all?, close_all? })`: prepare a browser-signed close or reduce action. Use `all: true, percent: 100` when the player asks to close all/remaining/another position so every matching open position gets its own browser action.
- `avantis_cancel_order({ symbol?, pair_index?, trade_index? })`: prepare a browser-signed limit-order cancel.
- `avantis_set_tpsl({ symbol?, pair_index?, trade_index?, take_profit?, stop_loss? })`: prepare a browser-signed TP/SL update.

## Rules

- Never claim an Avantis write has executed from an MCP result alone.
- MCP write results mean `browser_action_required: true`; say the action is prepared and wallet/smart-wallet signing is starting. Do not tell the user to confirm a prompt when Smart Wallet auto-signing is available.
- The frontend reports the actual transaction hash after browser submission.
- Do not mention an encrypted server key or server-side Avantis signing. If Smart Wallet setup is needed, explain that the browser may ask the user to enable Avantis delegation and fund the Smart Wallet/delegate address with Base ETH for gas.
- Treat `$`, `USD`, and `USDC` as `collateral_usd` unless the player explicitly says notional.
- Treat "all money", "all balance", "max funds", and equivalent Ukrainian/Russian phrases as `collateral_pct: 100` when symbol and side are clear.
- Treat "50% of balance" / "50% vid balansu" / Ukrainian "50% від балансу" as `collateral_pct: 50`, not as a fixed stale dollar amount.
- Treat "50x", "50 leverage", and Ukrainian/Russian "50 плечем / 50 плече" as `leverage: 50`, not as the conservative default.
- For delegated-choice requests like "open some trade", "pick one", "якусь угоду", "щось цікаве", or "на твій розсуд", do not ask for a symbol or side. Call `avantis_market_scan({ limit: 120, chart_limit: 40, lookback_hours: 24 })`, choose a ranked crypto/token candidate and its suggested side, then call `avantis_place_order`. Do not choose FX/equity/commodity markets unless the player explicitly named them.
- Treat "maximum allowed leverage" as `use_max_leverage: true` unless market data explicitly returns a lower numeric cap. Do not reuse old 20x blockers from recent chat.
- Avantis leverage is set per trade when opening. There is no separate MCP leverage-change tool for open positions.
- If the player asks to turn/change/set leverage on an existing Avantis position, do not ask a follow-up. Read positions with `avantis_get_positions`, then explain that changing leverage requires opening a new trade with the desired leverage.
- Browser policy currently blocks AI-prepared Avantis orders above `$100` collateral, `50x` leverage, `$1000` notional, or `5%` slippage. Operators can override these caps with `CLASH_AVANTIS_AI_MAX_*` environment variables for testing.
