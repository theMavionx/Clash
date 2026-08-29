# Bug Report: Hibachi tournament volume stops after Trade panel/session ends

## Summary

Hibachi tournament volume for `Ameer Pirate` stopped at `$3,369` for the current round even though the player reports taking additional trades. Production data proves that the tournament aggregation is current, but only one Hibachi fill was imported for the round. Hibachi fill reconciliation is coupled to browser-local credentials and the mounted Hibachi trading hook, so no import occurs when the player views the tournament outside the Trade/Hibachi panel or changes browser/device.

## Classification

- Type: Integration / state synchronization
- Severity: P2 Major
- Priority score: 9/16 (impact 3, scope 2, blocking 2, workaround 2)
- Affected systems: Hibachi fill importer, tournament volume/points, trading rewards
- Reported: 2026-08-28
- Production player: `Ameer Pirate` (`37a56d5e-ab38-4a43-b065-907a32419c0a`)
- Hibachi account observed in service logs: `30666`
- Tournament: `27` — `Clash of Perps x Hibachi Trading Competition`
- Production build observed in current client logs: `20260828163553-9031caf3`

## Environment

- Production: `https://clashofperps.fun`
- Tournament scoring: `daily_pool`
- Tournament round cutoff: `22:00 UTC`
- Client evidence includes multiple browsers/devices and distinct client sessions.
- Hibachi credentials are stored only in browser-local encrypted storage (`clash_hibachi_credentials_v1`).

## Reproduction Steps

1. Connect Hibachi in Clash and enter valid API key, account ID, and API private key.
2. Trade while the Futures/Trade Hibachi panel is mounted; confirm `claim-gold` imports fills.
3. Close the Trade panel, open Clash on another browser/device, or trade directly on Hibachi.
4. Open the Tournament panel and wait for its leaderboard polling.
5. Observe that leaderboard requests continue, but Hibachi fill reconciliation does not run because the tournament panel has no access to the browser-local Hibachi credentials and the server has no stored sync credential.
6. Observe tournament volume remains at the last successfully imported fill total.

## Expected Behavior

Opening or refreshing the active Hibachi tournament should reconcile recent Hibachi fills before refreshing the player's leaderboard row. This should work without storing or transmitting the Hibachi trading private key beyond the existing trading request flow.

## Actual Behavior

- The active round contains exactly one `trade_history` event: `$3,369.42` at `2026-08-28 02:20:46 UTC`.
- The screenshot shows `$3,369`, matching that one event exactly.
- The last successful `claim_gold` reconciliation was at `2026-08-28 02:58:42 UTC`, returning 36 already-known fills and no new fills.
- No later Hibachi claim/reconciliation event exists, despite current client activity through `2026-08-28 18:09 UTC`.
- The tournament cursor continued reconciling through `2026-08-28 18:25 UTC`, but the futures database contained no later fill rows to consume.

## Technical Details

### Confirmed root cause

1. `web/src/hooks/useHibachi.js` loads credentials from browser-only encrypted storage.
2. Its 60-second `claimGold` polling effect is guarded by `isActiveDex`, wallet, credentials, and token, and runs only while the hook is mounted.
3. `web/src/hooks/useTournament.js` polls tournament endpoints but never requests a Hibachi fill reconciliation.
4. `server/trade_reconciliation.js` requires credentials supplied on each Hibachi reconciliation request; otherwise it returns `browser_credentials_required`.
5. Production `player_dex_accounts` has the player's wallet but no Hibachi `account_id`, and `player_dex_credentials` has no Hibachi row. The server therefore cannot reconcile independently.

This is not a leaderboard aggregation/cursor bug. The aggregation matches the imported futures rows exactly.

### Contributing operational noise

- The current client generated 1,299 warning-level fetch logs in two days, primarily unsupported generic `GET /api/futures/{account,positions,orders}?dex=hibachi` prefetches returning 404. These do not cause the missing volume but obscure the useful signal.
- Earlier Hibachi upstream 500/502 and WebSocket failures were present for account `30666`, but import recovered and successfully recorded the `$3,369.42` fill. The continuing stale total is explained by the absence of later reconciliation calls, not by a still-running tournament sync failure.

## Evidence

- Screenshot: `C:/Users/Admin/AppData/Local/Temp/codex-clipboard-5114072c-8f79-4550-b025-197227df4111.png`
- Production `tournament_daily_activity`, tournament `27`, day `2026-08-27`:
  - `ranked_raid_attack`: 50 events, 1,750 trophies
  - `trade_history`: 1 fill, `$3,369.42`
- Production `trade_claim_results`:
  - `2026-08-28 02:20:47`: one fill credited, `$3,369.42`
  - `2026-08-28 02:58:42`: no new trades; 36 known fills returned
  - no subsequent Hibachi claim row through the investigation time
- Production `trading_rewards`:
  - last trade ID `4774398022`
  - cumulative tournament-eligible volume `$62,964.23`
- Production current client build logs continued through `2026-08-28 18:09 UTC` on build `20260828163553-9031caf3`.
- Official Hibachi API documentation states that account trade history requires authorization and supports descending pagination with `maxJournalId`; the browser-held API key is therefore required to query the missing fills.

## Implemented Durable Fix

### Immediate, least-privilege client fix

When the active tournament is Hibachi, the Tournament panel now:

1. Load the existing browser-encrypted Hibachi credentials.
2. Calls `/api/trading/claim-gold` with `force_reconcile: true` once on panel open and on explicit Retry, then performs a rate-limited visible-panel poll.
3. Refreshes tournament `me`, leaderboard, and daily-points only after reconciliation completes.
4. Shows an explicit reconnect state if credentials are unavailable on the current device instead of silently polling a stale number.

The private key remains browser-only and is sent only in the existing request headers for that reconciliation call.

### Follow-up for device-independent background sync

Add an optional server-side Hibachi read credential link containing only `account_id` and API key, encrypted at rest. Do not persist the Hibachi private signing key. Since Hibachi GET account history uses the API key but write operations require a separate signature, this supports background tournament import without granting the server order-signing capability. This is a separate security-reviewed change, not an emergency patch.

### Noise reduction

`hibachi` is excluded from generic private prefetch routes; its authenticated POST adapter endpoints are used instead.

## Regression Coverage

- Stored Hibachi credentials trigger a forced reconciliation and refresh all tournament views.
- Missing local credentials produce a visible sync-required state and no request.
- A single bounded retry covers Clash cooldown responses.
- Server-side importer failures are surfaced instead of presenting a false success state.
- Opening the panel reuses idempotent reconciliation and cannot double-credit a fill.
- Hibachi generic private GET prefetches are not emitted.

## Notes

- Production data reconciliation cannot be completed without the player's Hibachi API key being presented again from a browser/device that has it.
- No production database mutation or credential persistence expansion is part of the implementation.
