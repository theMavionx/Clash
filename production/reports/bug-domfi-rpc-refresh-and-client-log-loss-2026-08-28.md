# Bug Report

## Summary

**Title**: Transient HTTP/2 failure breaks the DomFi account panel and drops its diagnostics  
**ID**: BUG-2026-0828-DOMFI-RPC-RESILIENCE  
**Severity**: S2-Major  
**Priority**: P1-Immediate  
**Status**: Fixed, pending production verification  
**Reported**: 2026-08-28  
**Reporter**: Clash player report

## Classification

- **Category**: Network / Trading UI
- **System**: DomFi account refresh, Base RPC balance reads, client diagnostics
- **Frequency**: Sometimes; clustered while the browser HTTP/2 connection is degraded
- **Regression**: Unknown; the live DomFi contracts and APIs remain compatible

## Environment

- **Build**: `20260828155554-f0d16f2c`
- **Platform**: Chrome on macOS, production web client
- **Scene/Level**: DomFi Account panel
- **Game State**: Connected Base wallet `0xb364...fe1b`, approximately 0.018074 USDC, no open DomFi positions or orders

## Reproduction Steps

**Preconditions**: Connect an EVM wallet and select DomFi.

1. Open the DomFi Account panel.
2. Interrupt or degrade the browser's HTTP/2 connection while the account poll runs.
3. Observe failed Base RPC and DomFi read requests.

**Expected Result**: A transient read failure is retried; the panel keeps its last verified balance and continues showing positions/orders. Diagnostics are delivered when connectivity returns.  
**Actual Result**: The direct browser `balanceOf` rejection aborts the entire private refresh and displays a generic contract error. At the same time, a failed `/api/client-log` request permanently removes that diagnostic batch from memory.

## Technical Context

- **Affected files**: `server-futures/domfi.js`, `web/src/lib/domfiClient.js`, `web/src/hooks/useDomfi.js`, `web/src/lib/clientLogger.js`
- **Related systems**: Base RPC fallback transport, DomFi polling, service-worker update lifecycle
- **Root cause**: DomFi private refresh combined account, referral, and direct browser balance reads in one fail-fast `Promise.all`. A single browser RPC transport error therefore invalidated otherwise valid server data. DomFi GET reads had no transient retry, and the logger removed batches before delivery without requeueing them after network or non-2xx failure.

## Evidence

- Player console: repeated `net::ERR_HTTP2_PROTOCOL_ERROR` for `/rpc/base-alchemy`, DomFi account/market routes, and `/api/client-log`.
- Player UI: `An unknown error occurred while executing the contract function "balanceOf".`
- Current production smoke: DomFi markets, prices, config, account snapshot, referral, trade history, Base `eth_call`, and the upstream DomFi API all return valid responses.
- Exact Base USDC read for the reported wallet: `18074` micro-USDC (`0.018074 USDC`).

## Related Issues

- Service-worker update was available in the affected browser session and may have prolonged a stale runtime connection, but it did not change the DomFi contract deployment.

## Notes

The fix adds bounded GET retries, a server-side multi-RPC balance snapshot with short fresh/stale caches, non-fatal client merging that preserves the last trustworthy balance, and bounded exponential retry for failed client-log batches. Trading writes, allowance checks, and wallet signatures retain their existing fail-closed behavior.
