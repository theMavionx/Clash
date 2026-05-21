# ADR-0006: Hermes Scheduled Decibel Jobs

## Status
Proposed

## Date
2026-05-21

## Context

### Problem Statement
Players want a Hermes agent that can monitor Decibel markets on a schedule and
optionally trade when technical conditions are met. Example: "buy when RSI hits
25, MACD crosses the half line, and volume is good". Each scheduled check must
consume one AI message, be auditable, and avoid duplicate or unbounded trades.

### Constraints
- The browser must not receive Hermes, OpenRouter, MCP, or Decibel signer
  secrets.
- Decibel order writes must continue through Clash MCP so builder attribution
  and server-side validation remain enforced.
- Scheduled trading needs stronger limits than normal chat trading because it
  can run while the player is offline.
- The model should not receive arbitrary internet browsing. It should receive
  bounded market-data tools that return normalized prices, candles, volume, and
  indicators.
- Existing per-player Hermes isolation and chat endpoints must keep working.

### Requirements
- Support monitor-only, ask-before-trade, and auto-trade jobs.
- Let players configure interval, daily run cap, expiry, symbols, leverage,
  collateral, daily trade cap, and cooldown.
- Count every scheduled check as one AI message.
- Store active jobs and run history for chat/UI review.
- Prevent duplicate scheduled runs and duplicate same-symbol/same-side trades.
- Provide deterministic RSI, MACD, volume, and volatility calculations through
  MCP tools.

## Decision

Scheduled jobs will be owned by the Clash backend, not by long-running timers
inside Hermes. A new `clash-hermes-jobs` worker will periodically claim due
jobs from SQLite, reserve one AI message, call the per-player Hermes
orchestrator with a scheduled-job instruction block, and persist the result.

Hermes can create and manage job drafts through MCP or the backend UI, but
trade-enabled activation is governed by server-side job policy. Decibel market
analysis is exposed as a bounded MCP tool, `decibel_market_scan`, which returns
server-calculated RSI, MACD, volume SMA ratio, ATR, and stale-data blockers.
Hermes uses that tool before any scheduled trading decision.

### Architecture Diagram

```text
Chat UI / Jobs modal
  |
  | /api/ai-jobs/*
  v
Clash backend SQLite
  |       ^
  |       | list/history/quota
  v       |
clash-hermes-jobs worker
  |
  | one quota reservation per run
  v
Hermes orchestrator /players/:id/chat
  |
  | scheduled-job prompt + policy context
  v
Per-player Hermes agent
  |
  | MCP tools
  v
Clash MCP
  |-- decibel_market_scan
  |-- decibel_get_positions
  |-- decibel_place_order / close / TP/SL
  v
Decibel API/contracts
```

### Key Interfaces

Backend:

```text
GET    /api/ai-jobs
POST   /api/ai-jobs
PATCH  /api/ai-jobs/:id
DELETE /api/ai-jobs/:id
POST   /api/ai-jobs/:id/run-now
GET    /api/ai-jobs/:id/runs
```

MCP:

```text
decibel_market_scan
hermes_job_list
hermes_job_create_draft
hermes_job_update
hermes_job_pause
hermes_job_resume
hermes_job_delete
hermes_job_run_now
hermes_job_get_runs
```

Worker idempotency:

```text
job:<job_id>:<scheduled_for_iso>
```

## Alternatives Considered

### Alternative 1: Hermes Native Cron
- **Description**: Let each per-player Hermes process own timers and run jobs
  internally.
- **Pros**: Conceptually simple for agents.
- **Cons**: Hard to audit, hard to charge quota exactly once, jobs disappear
  with process restarts, duplicate timers are likely after recovery.
- **Rejection Reason**: Server-owned scheduling is required for reliability and
  billing.

### Alternative 2: Arbitrary Internet Access
- **Description**: Give Hermes browser or web tools and let it fetch whatever
  market data it wants.
- **Pros**: Flexible.
- **Cons**: Non-deterministic, easy to scrape wrong sources, harder to audit,
  slower, and dangerous for autonomous trading.
- **Rejection Reason**: Trading jobs need bounded, normalized market-data tools.

### Alternative 3: Backend Script Executes Strategy
- **Description**: Parse strategy rules server-side and execute trades without
  Hermes.
- **Pros**: Deterministic and cheap.
- **Cons**: Breaks the product requirement that Hermes is the decision layer
  and cannot handle natural-language strategies well.
- **Rejection Reason**: Hermes should still interpret the saved strategy.

## Consequences

### Positive
- Jobs survive Hermes restarts and VPS reboots.
- Every run is auditable and charged exactly once.
- Market indicators are deterministic and less hallucination-prone.
- Server-side limits prevent out-of-policy autonomous trades.

### Negative
- Adds a new PM2 worker and new database tables.
- Scheduled jobs can consume quota while players are offline.
- Auto-trade mode needs conservative defaults and clear UI review.

### Risks
- Decibel candle API shape may change.
  - Mitigation: keep scan output defensive and mark stale/unavailable data as a
    no-trade blocker.
- The model may trade twice from overlapping runs.
  - Mitigation: DB locks, idempotency keys, job cooldown, and MCP policy checks.
- Players may misunderstand auto-trade limits.
  - Mitigation: activation review modal with plain-language policy summary.

## Performance Implications
- **CPU**: Low. Indicator calculations operate on small candle windows.
- **Memory**: Low. Scheduler is one Node process plus DB rows.
- **Load Time**: No initial page load impact beyond the Jobs modal API call.
- **Network**: Scheduled runs call Decibel APIs, Hermes, OpenRouter, and MCP.

## Migration Plan
1. Add `hermes_jobs` and `hermes_job_runs` tables.
2. Add Decibel market scan helper and MCP tool.
3. Add backend jobs API.
4. Add `clash-hermes-jobs` worker and PM2 deploy entry.
5. Add chat/UI Jobs modal.
6. Update Hermes prompts and skills with scheduled-job rules.
7. Run dry-run stress tests before enabling auto-trade by default.

## Validation Criteria
- A monitor-only job runs on schedule and consumes one AI message.
- A quota-blocked job does not call Hermes or MCP.
- Two scheduler loops cannot run the same job occurrence twice.
- `decibel_market_scan` returns RSI, MACD, volume ratio, ATR, and stale flags.
- Auto-trade jobs cannot exceed configured symbol, leverage, collateral, or
  daily trade limits.
- Job history shows tool usage, latency, result text, and next run.

## Related Decisions
- [ADR-0002: Per-Player Hermes AI Chat](./adr-0002-per-player-hermes-ai-chat.md)
- [ADR-0003: Hermes Game Agent Runtime Contract](./adr-0003-hermes-game-agent-runtime.md)
- [ADR-0004: Builder-Aware Decibel Trading MCP](./adr-0004-builder-aware-decibel-trading-mcp.md)
