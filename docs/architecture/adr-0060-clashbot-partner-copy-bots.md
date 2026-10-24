# ADR-0060: In-game ClashBot Copy Bots Through A Signed Partner Channel

## Status
Accepted

## Date
2026-10-24

## Context
Players had to leave the game and sign in on copy.clashbot.fun (SIWE bound to
that origin) to create or control copy bots. The owner of both products asked
for create / start / monitor / edit / stop / delete inside the game, with no
ClashBot sign-in, and for the Bot panel to be copy trading only.

## Decision
- **ClashBot partner channel** (`egorble/copy-trading`, `server/copy-trading/partner-copy-gateway.ts`,
  doc `docs/partner-copy-api.md`): `/copy-api/v1/partner/clash/copy/*`, HMAC-SHA256 over partner id,
  player id, timestamp (+-120 s), single-use nonce, method, path and body hash; constant-time compare,
  per-player rate limit, no CORS. Each player maps to namespace `clash:<playerId>` (UUIDv8 principal
  and a hash-preimage follower wallet), so bots and saved exchange keys never mix with website wallets
  or other players. Verified requests are rewritten onto an allowlist of the existing `/v1/copy`
  subscription routes, so every ownership, venue and risk check is unchanged. The website SIWE flow
  is untouched. The secret is HKDF-derived from ClashBot's copy credential key (nothing new stored).
- **Game server** (`server/clashbot_copy_bots.js`, mounted at `/api/v1/copy-bots/*` behind `auth`):
  signs with `CLASHBOT_PARTNER_SECRET`, allowlists routes, request fields, risk-config keys (no
  pool/operator switches) and destination venues, shape-checks trade-only credentials (refuses a key
  equal to the owner wallet), rate-limits per player, never logs or echoes keys. Deleting a bot also
  asks ClashBot to shred the saved key once no bot uses it; players can remove all unused keys.
- **Execution**: ClashBot runs every copy server-side with a saved trade-only key (AES-256-GCM under
  its credential key). Practice (`dry_run`) uses the same pipeline and the account's real balance for
  sizing but never sends orders, so practice also needs the connection. No browser executor.
- **Game UI**: `CopySetupWizard` (trader preselected; practice/live; destination; budget, risk scale,
  positions, leverage cap/fixed, direction, slippage, TP/SL/daily/trader stops, stop behaviour;
  explicit "authorise ClashBot to trade" step) and `MyCopyBots` (status, realized PnL, executions,
  win rate, 10 s refresh, start/pause/stop/close all/edit/delete). The Market making tab is removed.

## Live venue support (game -> ClashBot)
| Venue | Status | Key handed to ClashBot |
|---|---|---|
| Hyperliquid | live + practice | new ClashBot-only API wallet approved by the player's wallet (`approveAgent`, 180 days) + ClashBot builder fee >= 0.01% if missing |
| NADO | live + practice | the game's linked signer (orders only) |
| RISEx | live + practice | the game's session key (trade only, builder 1 bps) |
| BULK | live + practice | the game's agent wallet (no transfer/withdraw) |
| Lighter, Robinhood Lighter, GRVT, Ondo | not yet | ClashBot issues an opaque onboarding token bound to the signed-in wallet; needs partner-aware onboarding binding in ClashBot (schema change) and in-game signing steps. Ondo also geo-checks the end user's IP. |
| Decibel | not yet | session challenge is audience-bound to copy.clashbot.fun and needs an Aptos delegation tx to ClashBot's API wallet |
| GMX, Arcus, Phoenix, QFEX | not yet | need new in-game onboarding (GMX subaccount approval, Arcus API key EIP-712, Phoenix position authority); game QFEX keys are pasted API keys with unknown scope |
| Hotstuff, Katana, Pacifica, Aster | impossible today | ClashBot's native runtime has no executor/state reader for them (Aster retired) |

## Consequences
- The partner secret is equivalent to control of every partner namespace: keep it only in the game
  server env; rotation = rotate ClashBot's credential key or the HKDF label, then update the env.
- NADO / RISEx / BULK keys are shared between the game and ClashBot (one linked signer / session per
  account); re-linking in either product invalidates the other's key.
- One active bot per destination account (ClashBot rule) applies to practice bots too.
