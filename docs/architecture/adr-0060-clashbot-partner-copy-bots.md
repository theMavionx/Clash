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
  its credential key). **Bots are live only** (owner decision 2026-10-24); the game server refuses any
  other execution mode.
- **Wallet-bound onboarding** (ClashBot `7cf138a0`): partner signature v2 also binds the player's EVM wallet
  (`x-clash-partner-wallet`) and client IP (`x-clash-partner-client-ip`). The wallet is the venue owner for
  Lighter / Robinhood Lighter / GRVT / Ondo / QFEX onboarding and their token hand-offs; every flow still needs
  that wallet's own signature, and saved keys stay in the partner namespace. The client IP replaces
  X-Forwarded-For so Ondo's region rules see the player. Partner Decibel challenges use the audience
  `https://clashofperps.fun`. The game server proxies the allowlisted onboarding steps at
  `/api/v1/copy-bots/venues/<venue>/<op>`.
- **Game UI (simple mode)**: `CopySetupWizard` = destination exchange + margin budget + projected result
  (budget x trader daily PnL / trader equity over 7/30/90 days, loss capped at the budget, sparkline) + one
  "Start copying" button that connects the venue (connectors/*), creates the live bot with ClashBot's simple
  defaults (`copySimpleMode.js`: smart sizing 100%, budget as every cap, leverage follow capped at 10x,
  ClashBot order defaults) and starts it. No advanced settings. `MyCopyBots`: status, realized PnL,
  executions, win rate, 10 s refresh, start/pause/stop/close all/change budget/delete.

## Venue support (game -> ClashBot, live)
| Venue | How ClashBot gets a trade-only connection |
|---|---|
| Hyperliquid | new ClashBot-only API wallet approved by the player's wallet (`approveAgent`, 180 days) + builder fee >= 0.01% if missing |
| NADO | the game's linked signer (orders only) |
| RISEx | the game's session key (trade only, builder 1 bps) |
| BULK | the game's agent wallet (no transfer/withdraw) |
| Lighter, Robinhood Lighter | ClashBot generates a dedicated API key; the wallet signs Lighter's ChangePubKey message (+ ClashBot integrator approval) |
| GRVT | ClashBot-generated signer; wallet signs AddAccountSignerWithBuilder with permission "Trade" on chain 325 |
| Ondo | wallet signs Ondo's SIWE; ClashBot creates a trade-only key pinned to its egress IP; region checked on the player's IP |
| Decibel | Aptos wallet signs ClashBot's challenge; delegates trading of the primary subaccount to ClashBot's API wallet (+ builder approval if missing) |
| GMX | GMX 1CT subaccount (key = keccak256 of the owner's 1CT signature) approved via SubaccountApproval EIP-712; USDC router approval if needed |
| Arcus | browser-generated Ed25519 key registered by the owner's CreateApiKey EIP-712 (single subaccount, 179 days, no extra permissions) |
| Phoenix | agent derived from the owner's Solana signature, delegated as position authority (+ trader registration / ClashBot referral / 0.06 SOL top-up if needed) |
| QFEX | the QFEX API key pair the game already registered for the player |
| Hotstuff, Katana, Pacifica, Aster | not offered: ClashBot's native runtime has no executor for them (Aster retired) |

## Consequences
- The partner secret is equivalent to control of every partner namespace: keep it only in the game
  server env; rotation = rotate ClashBot's credential key or the HKDF label, then update the env.
- NADO / RISEx / BULK keys are shared between the game and ClashBot (one linked signer / session per
  account); re-linking in either product invalidates the other's key.
- One active bot per destination account (ClashBot rule).
- The game must deploy after ClashBot `7cf138a0` (v2 signatures are rejected by older ClashBot releases).
