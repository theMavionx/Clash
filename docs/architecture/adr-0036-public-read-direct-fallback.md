# ADR-0036: Fail-open direct fallback for allowlisted public reads

## Status

Accepted for local implementation and testing; production rollout not yet authorized.

## Date

2026-09-03

## Context

### Problem Statement

ADR-0032 routed allowlisted market-data and free RPC reads through a server-only
proxy pool and deliberately failed closed when a configured pool was unavailable.
On 2026-09-03 the production pool began returning HTTP CONNECT `407` for every
sampled credential. The futures process remained healthy, and direct reads from
the VPS returned `200`, but the shared fail-closed transport caused widespread
`500`/`502` responses across unrelated exchanges, charts, RPCs and indexers.

### Constraints

- Proxy credentials must remain server-only and absent from Git and logs.
- Private, authenticated, signed, keyed and write requests must never enter the
  public proxy or fallback path.
- Provider `401`, `403`, `404`, `429` and `5xx` responses retain their meaning;
  the fallback addresses transport failure, not provider-policy bypass.
- Caller cancellation and bounded timeouts must remain effective.
- Existing Hibachi account-affine authenticated routing remains separate.

### Requirements

- Public data must remain available when the proxy subscription expires or the
  proxy network is temporarily unreachable.
- Repeated proxy failures must not add two timeouts to every public request.
- Operators must be able to identify whether a relay response used proxy or
  direct fallback without exposing a proxy address.

## Decision

After the existing allowlist classifies a request as public, the server attempts
the configured pool twice. If both attempts fail at the transport layer, it
retries once directly from the VPS. Three consecutive exhausted proxy requests
open a 30-second circuit breaker; while open, allowlisted reads go directly.
A successful proxy response closes the circuit. These defaults are configurable
and direct fallback can be disabled operationally.

The browser still calls the bounded same-origin relay. The relay returns
`X-Clash-Public-Transport: proxy`, `direct`, or `direct-fallback`. Private and
unknown requests bypass this component exactly as before.

### Architecture Diagram

```text
browser/server public read
        |
        v
strict allowlist + secret/write rejection
        |
        +--> proxy pool (two bounded attempts) --> provider
        |              |
        |              +-- transport failure --> circuit breaker
        |                                         |
        +-----------------------------------------+
                                                  v
                                      direct VPS read --> provider

private/auth/signed/write/keyed/WS traffic --> existing dedicated transport
```

### Key Interfaces

- `CLASH_PUBLIC_DIRECT_FALLBACK`: defaults to enabled; `false` restores strict
  fail-closed behavior.
- `CLASH_PUBLIC_PROXY_CIRCUIT_FAILURES`: consecutive exhausted requests before
  opening the circuit; default `3`.
- `CLASH_PUBLIC_PROXY_CIRCUIT_COOLDOWN_MS`: open duration; default `30000`.
- `CLASH_PUBLIC_DIRECT_TIMEOUT_MS`: direct attempt timeout; default `8000`.
- `createPublicReadTransport().stats()`: exposes aggregate fallback and circuit
  counts without proxy URLs or credentials.

## Alternatives Considered

### Replace proxy credentials only

- **Description**: Upload the new pool and retain fail-closed behavior.
- **Pros**: Minimal code change.
- **Cons**: The next expiration recreates the same cross-exchange outage.
- **Rejection Reason**: Credentials are an operational dependency and cannot be
  assumed permanently healthy.

### Always use the VPS directly

- **Description**: Remove the public proxy pool.
- **Pros**: Simple and low latency.
- **Cons**: Loses distribution for free-provider rate limits.
- **Rejection Reason**: The proxy pool remains useful while healthy.

### Fall back on every non-2xx provider response

- **Description**: Retry direct for upstream `4xx` and `5xx` responses.
- **Pros**: Can occasionally avoid an IP-specific provider response.
- **Cons**: Amplifies provider load and can bypass intended rate/geographic policy.
- **Rejection Reason**: Only transport failure proves the proxy path is broken.

## Consequences

### Positive

- Expired proxy credentials no longer disable unrelated exchanges.
- The circuit breaker removes repeated proxy timeout latency during an outage.
- Existing allowlist and secret rejection remain the security boundary.
- Aggregate transport telemetry becomes accurate.

### Negative

- During a pool outage, free providers see the VPS source IP and its shared rate
  limits apply.
- A request can take two proxy attempts plus one direct attempt before the
  circuit opens.

### Risks

- Direct provider rate limiting: preserve provider `429` and its cooldown.
- Accidental private fallback: mitigated by the unchanged allowlist and explicit
  tests for authenticated/signed/write requests.
- Flapping pool: mitigated by the cooldown and success-driven circuit reset.

## Performance Implications

- **CPU**: negligible counters and allowlist checks.
- **Memory**: one response `WeakMap` plus bounded per-process state.
- **Load Time**: healthy path unchanged; failed path recovers after bounded
  attempts and becomes direct while the circuit is open.
- **Network**: at most one direct request after proxy transport exhaustion.

## Migration Plan

1. Validate the replacement secret file without printing credentials.
2. Run proxy, policy, Axios, relay and live read-only provider tests.
3. On an explicitly authorized release, atomically replace the protected proxy
   file and deploy server/client code together.
4. Verify proxy mode, simulate an unavailable pool, verify direct fallback, and
   retain the preceding release and proxy file for rollback.

## Validation Criteria

- All supplied proxies pass an HTTPS Hibachi public read.
- Unit tests prove proxy success, bounded retry, direct fallback, circuit-open
  behavior, accurate relay header and fail-closed override.
- Private/authenticated/write/keyed operations never use proxy or fallback.
- With an invalid proxy fixture, public Hibachi/Pacifica/RPC reads still succeed
  directly; provider errors are not retried direct.

## Related Decisions

- [ADR-0032](./adr-0032-public-read-proxy-pool.md): original public proxy pool.
- [Public proxy implementation report](../../production/reports/bug-nado-chart-and-public-proxies-2026-08-31.md).
