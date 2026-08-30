# ADR-0032: Server-only proxy pool for public HTTP market and RPC reads

## Status

Accepted for local implementation and testing; production rollout not authorized.

## Date

2026-08-31

## Context

### Problem Statement

The owner supplied a replacement Webshare pool of 100 proxies and requested
their use for free RPC and price reads. Existing proxy support covered Hibachi
REST only. Browser direct reads and other Node fetch/Axios SDK reads bypassed it.
Nado charts also depended on a Pyth history endpoint returning 404; proxies
cannot repair a removed upstream API, so Nado independently needs native candles.

### Constraints

- Never expose proxy credentials to browsers, logs, Git, or arbitrary targets.
- Preserve signed writes, authentication, keyed provider endpoints, wallet
  extension networking, WebSockets and existing explicit dispatchers.
- No funded trade, production deployment or production data mutation.
- Reuse the existing tested Hibachi HTTP CONNECT pool implementation.
- Node 20.19+ is required for synchronous ESM policy loading (compatible with
  the existing Vite 8 build requirement); Node 20 compatibility is tested.

### Requirements

Native fetch and default Axios-based SDK public reads use the configured pool;
browser fetch/default Axios public reads use a validated same-origin relay. Provider errors
must remain visible and limits must not cause retry amplification.

## Decision

Use one shared pure ESM allowlist, fixed HTTPS origins/paths, and explicit
read-only RPC methods/market POST discriminators. Install server fetch and Axios
adapters before routes/SDK construction. Browser bootstrap installs a matching
fetch wrapper and the same Axios selector before the client logger and application initialization.

Browser public fetch -> /api/futures/public-read -> same policy -> HTTPS CONNECT
pool -> approved provider. Server public fetch/Axios -> policy -> same pool.
Everything outside the policy retains its existing transport.

### Key Interfaces

- common/public-read-policy.mjs: publicReadCandidate, isPublicRead, publicReadRequest.
- server-futures/public-read-proxy.js: createPublicReadTransport,
  installPublicReadProxy, installAxiosPublicReads, createPublicReadHandler.
- web/src/lib/publicReadFetch.js: browser relay wrapper.
- CLASH_PUBLIC_PROXY_FILE: server-only text file, falling back to existing
  HIBACHI_PROXY_FILE. The local ignored .env.public-proxy points both at the
  owner's latest Webshare file; environment variables retain precedence.

The relay accepts only an approved URL, method and bounded JSON body. It never
accepts arbitrary headers, cookies, redirect targets, credentials or dispatchers.
It limits request bodies through Express and policy (24k JSON body / 4k URL),
RPC batches to 50, responses to 2 MiB and concurrent relay requests to 32.
Large getProgramAccounts scans remain on their existing transport.

Proxied requests have an 8-second attempt timeout and at most two attempts for
transport failures. Caller cancellation is preserved. 401/403/404/429/5xx are
returned without switching proxies. 429 applies Retry-After to the entire
provider host in this process. Redirects are not followed. TLS verification
remains enabled. Existing Hibachi account affinity is not intercepted.

## Alternatives Considered

### Global HTTP(S)_PROXY or unconditional global agent

Simple, but would move signing/authentication/paid-key requests and would still
not cover browsers safely. Rejected because it changes unrelated security and
connection semantics.

### Per-exchange transport duplication

Explicit but easily misses SDK calls and drifts between browser/server.
Rejected in favor of one policy and a tested shared transport boundary.

### Proxy credentials embedded in frontend RPC URLs

Rejected: browsers cannot safely own the proxy pool credentials or directly
use Node HTTP CONNECT agents.

## Consequences

### Positive

The same policy protects both sides; logs report counts/hashed IDs, never
credentials. Existing authentication and transaction behavior is preserved.

### Negative

One additional network hop for browser public reads. Future providers require
allowlist review. This is not a universal proxy for every HTTP library or
wallet extension; custom agents, non-default Axios adapters, keyed providers,
WebSockets and unknown operations intentionally retain existing behavior.

### Risks

- Provider outage/removed endpoint: preserve failure, fix the source separately.
- New/changed API route: stays direct until explicitly reviewed.
- Pool failure: bounded failure, no silent server direct fallback when configured.
- Read relay abuse: fixed endpoints/verbs, no redirects, bounded bodies,
  batches, concurrency and response sizes.
- Retry multiplication: transport retries only, provider-wide 429 cooldown.

## Performance Implications

- CPU: bounded JSON classification; no signatures or blockchain execution.
- Memory: lazy proxy agents, 32 concurrent bounded relay responses.
- Load time/network: extra relay hop; existing venue caches remain in place.
  Nado candles add a 15-second, 128-window cache with in-flight coalescing.

## Migration Plan

No production changes now. For a future approved release, use the existing
production Hibachi proxy file or explicitly configure CLASH_PUBLIC_PROXY_FILE
to an absolute server secret path; do not upload Windows local env files.
Deploy server/client together, verify public relay and Nado chart, retain
rollback release. VITE_PUBLIC_READ_PROXY_ENABLED=false disables browser routing.

## Validation Criteria

- Each of the 100 supplied proxies: HTTPS CONNECT, Ink eth_chainId and native
  Nado candle history succeed without direct fallback.
- Unit tests: public-only policy, mixed-batch/write/SSRF/secret rejection,
  private bypass, native Request bodies, cancellation, bounded transport retry,
  429 cooldown, Axios compatibility and sanitized relay.
- Actual browser: native Nado candles and RPC output marked proxy.
- Existing Hibachi tests, Nado tests, lint and production build pass.

## Related Decisions

- ADR-0030: DomFi self-custody/referral integration.
- production/reports/bug-nado-chart-and-public-proxies-2026-08-31.md.
- Axios custom fetch adapter: https://github.com/axios/axios#custom-fetch
