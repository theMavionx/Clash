# ADR-0012: Dango Realtime Exchange Integration

## Status
Accepted

## Date
2026-07-05

## Context

### Problem Statement
Clash needs Dango as a selectable perps exchange with trading, positions,
gold, quests, and tournament credit. The current delayed quest-credit problem
shows that polling-only or client-reported trading is not acceptable for new
exchange integrations. Dango exposes both GraphQL queries/mutations and a
native WebSocket `perpsEvents` feed, so the integration should use the realtime
feed as the reward authority from the start.

### Constraints
- Preserve existing DEX behavior and reward accounting.
- Do not store Dango user master keys server-side.
- Dango write operations require signed `Tx` payloads with correct metadata,
  nonces, gas simulation, and credentials.
- Dango WebSocket feeds retain only recent block windows, so reconnect needs a
  last-height resume and a GraphQL backfill path.
- Existing gold, quest, and tournament systems read from `trade_history`.
- Dango HTTP rate limits and WebSocket subscription limits must be respected at
  the app layer.

### Requirements
- Add Dango to selectable DEX lists.
- Read Dango market, price, account, position, and order state.
- Support order submit/cancel, TP/SL, deposit, and withdraw through signed Dango
  transaction payloads.
- Record fills server-side from `perpsEvents`.
- Deduplicate reward rows by a stable Dango event key.
- Credit existing gold/quest/tournament flows without a special reward path.
- Keep WebSocket processing low-latency and resilient to reconnects.

## Decision

Add Dango as an independent `server-futures` adapter plus a server-side
`dango-realtime-worker`. The adapter owns Dango constants, GraphQL helpers,
normalization, read APIs, event parsing, and transaction payload construction.
The worker watches registered Dango player accounts through the native
`perpsEvents` WebSocket feed and writes verified fill rows to `trade_history`
with `dex = 'dango'` and `verified_source = 'dango_ws'`.

Browser trading must use Dango's signing model: either a standard user
credential or an approved session credential. Server routes may prepare,
simulate, and broadcast signed transactions, but they must not report a trade
as rewardable until the worker sees the Dango fill event. This matches the
Decibel lesson: order submission is not proof of filled volume.

### Architecture Diagram

```text
FuturesPanel
  -> useDango
  -> server-futures /dango/* reads and signed-tx endpoints
  -> Dango GraphQL HTTP

Dango native WebSocket /ws perpsEvents
  -> dango-realtime-worker
  -> normalize order_filled events
  -> server-futures trade_history(dex='dango', verified_source='dango_ws')
  -> main server /claim-gold
  -> quests + tournament scoring
```

### Key Interfaces
- `server-futures/dango.js`
- `server-futures/dango-realtime-worker.js`
- `GET /api/futures/markets?dex=dango`
- `GET /api/futures/prices?dex=dango`
- `GET /api/futures/dango/account`
- `GET /api/futures/dango/positions`
- `GET /api/futures/dango/orders`
- `POST /api/futures/dango/orders/message`
- `POST /api/futures/dango/orders/place`
- `POST /api/futures/dango/orders/cancel-message`
- `POST /api/futures/dango/orders/cancel`
- `POST /api/futures/dango/margin/deposit-message`
- `POST /api/futures/dango/margin/deposit`
- `POST /api/futures/dango/margin/withdraw-message`
- `POST /api/futures/dango/margin/withdraw`
- `POST /api/futures/dango/tpsl/message`
- `POST /api/futures/dango/tpsl/place`
- `POST /api/futures/dango/tpsl/cancel-message`
- `POST /api/futures/dango/tpsl/cancel`
- `POST /api/futures/dango/tx/simulate`
- `POST /api/futures/dango/tx/broadcast`
- `trade_history.dex = 'dango'`
- `trade_history.verified_source = 'dango_ws'`

## Alternatives Considered

### Client-Reported Dango Trades
- **Description**: Let the browser submit trade reports after Dango order
  placement.
- **Pros**: Fast to add and similar to older client report paths.
- **Cons**: Order submission can fail or remain unfilled; users could receive
  gold before real volume exists.
- **Rejection Reason**: The owner specifically wants instant and correct quest
  credit. Server-side event confirmation is the durable source of truth.

### Poll Dango GraphQL Only
- **Description**: Periodically query Dango fill history for every linked
  account.
- **Pros**: Simpler than maintaining WebSocket sessions.
- **Cons**: Adds unavoidable delay, increases HTTP load, and repeats the
  current delayed quest-credit failure mode.
- **Rejection Reason**: Dango provides a native realtime feed and the feature
  explicitly requires immediate updates.

### Server-Side Dango Master Signer
- **Description**: Store or proxy user master credentials server-side so orders
  are one API call.
- **Pros**: Simplifies the first trading UX.
- **Cons**: High custody risk and incompatible with Dango's smart-account
  security model.
- **Rejection Reason**: Session credentials provide the needed fast-trading UX
  without holding user master keys.

## Consequences

### Positive
- Gold, quests, and tournament credit can update immediately after Dango fills.
- Dango accounting uses the same `trade_history` reward pipeline as existing
  exchanges.
- The signing boundary is explicit and does not expand server custody.
- Reconnect and deduplication behavior is designed before production use.

### Negative
- Full Dango trading requires browser signing/session-credential UI work beyond
  simple read routes.
- The worker must maintain Dango account subscriptions and handle replay window
  limits.
- Dango raw event fields must be normalized defensively because contract event
  payloads can evolve.

### Risks
- **Missed events after downtime**: track last block height and backfill through
  GraphQL `perpsEvents` where available.
- **Duplicate reward credit**: use a deterministic `client_order_id` based on
  block height, event index, order id, and user.
- **Rate limiting**: batch reads, avoid per-player high-frequency HTTP polling,
  and keep WebSocket subscriptions grouped.
- **Incomplete signing UX**: expose read/reward foundation first and keep write
  endpoints explicit about requiring signed Dango transactions.

## Performance Implications
- **CPU**: Low. Event parsing is per fill event and writes one SQLite row.
- **Memory**: Low to moderate. Worker keeps linked account maps and last block
  state in memory.
- **Load Time**: No Godot/client load impact except one additional DEX option
  and hook initialization when Dango is selected.
- **Network**: One or more Dango WebSocket subscriptions plus low-frequency
  GraphQL reads for market/account state.

## Migration Plan
1. Add Dango ADR, active goal, and DEX registry entries.
2. Add `server-futures/dango.js` GraphQL/read/event adapter.
3. Add `server-futures/dango-realtime-worker.js` and start it from futures
   server startup behind an env disable flag.
4. Add Dango read routes and market/prices routing.
5. Add Dango to frontend DEX context and tournament/admin labels.
6. Add `useDango` and route `FuturesPanel` to it.
7. Add signed transaction message routes for order, cancel, margin, and TP/SL
   flows.
8. Add browser signing/session credential UX.
9. Run local syntax/build checks and a testnet fill smoke test before production.

## Validation Criteria
- `node --check` passes for changed server files.
- Frontend build or the strongest available focused check passes.
- Dango appears in DEX selection and tournament/admin DEX lists.
- Dango market/prices/account/positions requests return normalized shapes.
- Dango signed message endpoints produce docs-matched `execute` payloads and
  return `428 DANGO_SIGNATURE_REQUIRED` instead of pretending unsigned writes
  succeeded.
- A testnet Dango fill creates exactly one `trade_history` row with
  `dex = 'dango'` and `verified_source = 'dango_ws'`.
- Claim-gold and quest completion consume the Dango row through existing reward
  paths.

## Related Decisions
- `docs/architecture/adr-0004-builder-aware-decibel-trading-mcp.md`
- `docs/architecture/adr-0005-avantis-browser-agent-permission-mode.md`
- `docs/architecture/adr-0006-hermes-scheduled-decibel-jobs.md`
