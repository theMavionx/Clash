# Robinhood Lighter integration parity

Source reference: `C:/Users/Admin/Documents/clashbot` (read-only).

Existing Clash functionality retained: wallet-owned account discovery, unused API-key slot registration with wallet signature, encrypted player/wallet/deployment-scoped recovery, referral attachment, owner-verified integrator approval, market/limit orders, reduce-only close, grouped TP/SL, leverage, cancel, account/history reads and verified fill import. Copy-bot executors and their credential vault were not copied into the game: they are not required for manual terminal trading and would introduce a second credential authority.

Adapted from source `server/copy-trading/venues/lighter.ts` and `lighter_signer.py`:

- RH default integrator 3156, independently verified through RH live account API against the existing Clash owner address. Explicit invalid deployment configuration still fails closed.
- Dedicated SDK/REST egress using existing operator proxy parser/pool. Configure `LIGHTER_PROXY_FILE` or `LIGHTER_PROXIES`; otherwise reuse `CLASH_PUBLIC_PROXY_FILE` / `CLASH_PUBLIC_PROXIES`, then Hibachi's configured pool source. No embedded credentials, public proxy downloads or direct fallback when a configured pool is exhausted.
- SDK proxy credentials remain server-side, supplied via stdin to aiohttp and child-only environment for native Go HTTP. Exceptions redact proxy credentials and private keys. Provider 403/429 cool down the host, never trigger restriction-bypassing rotations.
- Per API URL/account/key serialization (bounded 16 requests per key), fresh explicit sequencer nonce, SDK optimistic synchronous nonce lookup disabled. Zero nonce is valid, including integrator approval. No automatic trading POST or ambiguous signed-send retry.

Verification:

- 65 server tests: onboarding, deployment isolation/partner routing, referral, public proxy regression, new egress/queue/error redaction and adapter cancellation flow.
- 48 frontend credential vault/onboarding/integration tests. Updated an obsolete signed-out deletion test to assert current scoped-vault behavior (fail closed, retain keys).
- Official lighter-sdk 1.1.1 offline native key-registration test passed. Native order/cancel/leverage/grouped TP/SL signing tests passed with send stubbed and explicit nonce zero; proxy attributes verified.
- Read-only live RH API: 57 markets, funding feed available, integrator 3156 ready with expected owner.

Limits: no funded trade, real wallet signature/registration, production proxy health test, or production deployment performed. Account-key queue is process-local, like the reference; do not run multiple trading workers sharing the same API key without cross-process serialization. Existing application processes use separate deployment/key scopes; external clients can still advance a key nonce and cause a safe rejection.
