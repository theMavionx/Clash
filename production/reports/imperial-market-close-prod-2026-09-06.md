# Imperial production market-close investigation

## Summary

- ID: BUG-IMPERIAL-CLOSE-20260906; reported severity S2/Major, priority P1; reporter: owner.
- Request: UR-2026-09-06-IMPERIAL-CLOSE-PROD: market close still does not work on production.
- Status: investigated; the identified production BTC Phoenix close is confirmed successful. The reported client-visible failure remains unlocalized; do not classify every close as working from this one example.
- Category: trading execution / UI reconciliation. Frequency and regression status unknown.
- Production build verified read-only: `/opt/clash/releases/20260906073509-b93f6eb1`.

## Reproduction and expected behavior

Precondition: connected Imperial profile with an open position. Select market Close, confirm, observe position and returned balance. Expected: accepted submission followed by execution state, removal of the closed position and eventual settlement. Owner reports it does not close. No funded reproduction was performed by the agent.

## Evidence (checked 2026-09-06 around 12:00 UTC)

- Recent production client errors contain the previously diagnosed TP/SL422 failures, not a new close rejection. Futures log includes POST `/api/imperial/positions/56ee3679-4f0b-4520-a606-0cb5e3dca862/close` -> HTTP200, 5909ms.
- Read-only futures DB proof recorded 10:30:29 UTC: owner `4Ze3bbJbmBjAUutV3LT1XUmqZG67fAR5PUr7vkXUgU2g`, BTC long, Phoenix/underwriter2, profile0, market decrease, closeBps10000, sizeUsd0, slippage50bps, CLASH attribution. Upstream success=true.
- Close signature: `5d6fWZpWeZaLmDYU5NJXaDu3BBfosEmh8pd9fAojr3NKyZ6bjNpwetqZWp296bCiicxAARVRaMk3XJmfbkS95wE3`.
- Solana public getSignatureStatuses(searchTransactionHistory=true): finalized, err=null, slot444770419. This alone is not treated as proof of a fill.
- Imperial public `/trades` independently confirms the exact lifecycle56ee3679-4f0b-4520-a606-0cb5e3dca862: status closed, sizeUsd0; decrease action completed, failureReason=null; sizeDelta=-846.0401, sizeDeltaTokens0.01060000, positionSizeAfter0. tx1/tx2 match the stored close signature.
- Execution/closedAt1788690628 = 10:30:28 UTC (13:30:28 Kyiv). Settlement tx3Timestamp1788690748 = 10:32:28 UTC, 120 seconds later; userReceived5.924483, netCashPnlUsd1.484483. These are Imperial-reported amounts, not independently reconstructed token transfers.
- Public `/positions?walletAddress=...` returns dataList[], count0. Actual local production-version `positionSnapshot(owner,0)` against the public API also returns positions[]. Earlier Jupiter BTC$70 lifecycle is closed too.

## Contract review and limits

- [Official OpenAPI](https://api.imperial.space/api/v1/openapi.json), fetched read-only: market decrease action1/orderType0, closeBps10000 and sizeUsd0 are valid; underwriter2 marketPrice scale is micro-USD. HTTP200 can contain success=false, which the existing request wrapper already checks. This close returned success=true and independently completed.
- [Imperial trade history](https://api.imperial.space/api/v1/trades?walletAddress=4Ze3bbJbmBjAUutV3LT1XUmqZG67fAR5PUr7vkXUgU2g&limit=20) supplied lifecycle and settlement evidence.
- The hook refreshes positions after1.2s, full snapshot after3s and reacts to wallet WS updates, with periodic/fallback reads. Exact UI state at the failed attempt is not captured, so stale UI versus another wallet/position cannot be established from current evidence.
- Separate observation: `imperialTradeRows` accepts several terminal status names but not native `completed`, although the successful close above uses that status. This can omit a close from History; it does not prove an execution failure and is not modified during this diagnosis.

## Result and next evidence needed

No trading code, deployment, production data or wallet permissions changed. Existing local BULK work preserved. No automatic retry/second close was attempted.

Ask the owner whether the complaint concerns this BTC Phoenix position or another position/wallet, and obtain its screenshot or failing request/time before changing the execution path. For the identified position, closing again is neither necessary nor appropriate.
