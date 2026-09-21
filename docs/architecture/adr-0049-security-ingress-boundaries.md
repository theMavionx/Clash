# ADR-0049: Bounded ingress and explicit credential boundaries

## Status

Accepted and deployed with owner approval in `20260921141323-563e93cf` on 2026-09-21. Scoped ingress controls verified live; infrastructure and dependency follow-ups remain open (production reliability report).

## Date

2026-09-21

## Context

### Problem Statement

The owner requested security hardening against denial of service and credential exposure. Review found unauthenticated bot-WebSocket fallback to a default tenant, player-WebSocket resource mutations bypassing HTTP admin checks, raw query logging, and public migration status reads repeatedly calling providers. Production nginx had no request/connection rate directives; UFW was inactive and another process listened on an external 8080 interface.

### Constraints

- Preserve wallet ownership proofs, transaction identity, settlement recovery and existing game/trading flows.
- Never weaken receipt or treasury checks, expose keys, execute funded tests, or blindly block shared services.
- Application limits cannot absorb a volumetric attack against the host. Cloudflare and origin access controls remain necessary.
- Keep this change separate from the pending owner-operated sales runner and $100 minimum, while preserving their local edits.

### Requirements

- Authenticate sensitive writes before body parsing; bound bytes, concurrency, rate state and challenge/session retention.
- Fail closed for WebSocket tenant identity and privileged resource mutations.
- Avoid credentials in logs, query-based admin login and persistent browser admin-key storage.
- Prove behavior with isolated HTTP/WebSocket tests rather than attack production.

## Decision

Add a small HTTP security module with injected clocks/environment and independently testable policies. Trust forwarding headers only through local nginx, resolving the nearest untrusted peer; accept Cloudflare client identity only from published Cloudflare networks. IPv6 rate buckets aggregate /64s. Fixed-window maps have bounded capacity and global group ceilings in addition to client ceilings.

Install migration admission before the 40 KiB JSON parser, rejecting compressed bodies, unknown browser origins and unauthenticated admin requests. Separate admin/public underlying-operation concurrency counters remain occupied even after client disconnect. Coalesce public status reads and cache for five seconds; invalidate on successful admin mutations. Reuse unexpired wallet challenges and bound challenge/session counts.

Require valid player authentication before bot upgrade. Limit WebSocket payloads, connections, message rates and pre-authentication lifetime. Game player tokens cannot invoke admin-only add/subtract resource operations.

Use constant-time header admin checks, production query redaction, session-scoped browser admin storage, and narrowly compatible security headers. These measures do not make JavaScript-readable admin credentials XSS-safe. A full HttpOnly admin-session/MFA conversion and strict script CSP require separate wallet/game compatibility work.

Prepare nginx migration rate/connection/body limits and trusted Cloudflare IP configuration in the existing deployment template. Do not reload production or close shared ports during diagnosis. Do not conflate trusted proxy headers with origin authentication: firewall/AOP is still required to prevent bypass of Cloudflare protections.

### Architecture Diagram

Cloudflare → nginx origin controls and rate limits → Node pre-parser admission → bounded route operation → existing ownership/settlement service.

WebSocket upgrade → origin/rate/connection checks → explicit tenant authentication → payload/message limits → authorized operations.

### Key Interfaces

- `clientAddress`, `rateAddress`: trusted client identity and rate partition.
- `createWindow`, `createMigrationIngress`: bounded admission and retry feedback.
- `validAdmin`, `botUpgradePlayer`: explicit credentials; no default identity.
- `createReadCache`: single-flight reads with generation-safe invalidation.
- `safeRequestPath`, `securityHeaders`: query-free request logging and browser response policy.

## Alternatives Considered

### Alternative 1: Cloudflare only

- Pros: absorbs network-scale attacks.
- Cons: does not fix authorization flaws, provider amplification or origin bypass.
- Rejection reason: defense must also exist at application boundaries.

### Alternative 2: Immediately enable a host firewall and strict script CSP

- Pros: potentially reduces exposed services and script execution.
- Cons: shared-host services, SSH recovery and wallet/Godot requirements have not been fully mapped.
- Rejection reason: a blind change can break legitimate service and operator recovery. Stage with dependency inventory, rollback and browser verification.

## Consequences

### Positive

- Stops the identified player privilege bypass and unauthenticated bot-tenant fallback locally.
- Bounds migration request amplification and input/state growth.
- Removes query credentials from the changed logging paths and persistent admin storage.

### Negative

- Fixed windows permit boundary bursts; limits are per process and reset on restart.
- Admin authentication must be repeated after closing a browser tab.
- Full requests over the new limits receive explicit rejection; status readiness can lag five seconds.

### Risks

- Distributed attacks still need CDN/WAF and origin restrictions; rate limits alone are not a DDoS guarantee.
- Cloudflare range changes require updating both policy and nginx; verify official ranges at rollout.
- Public paid RPC proxies and other API routes need separate method/quota policies.
- Migration ciphertext and its master key are on the same host; host compromise defeats encryption at rest. Separate protected backups/KMS and least privilege remain follow-up work.
- Remaining dependency advisories require compatible SDK changes, not forced downgrades.

## Performance Implications

- CPU: bounded map lookup per admitted request; fixed-size admin credential hashing.
- Memory: 10,000 buckets per limiter; bounded pending route operations and socket counts.
- Load time: no additional frontend package.
- Network: reduced duplicate status RPC calls; migration HTTP/WS abuse rejected earlier.

## Migration Plan

Ship tested server and admin code with the updated lockfile. Schema indexes are additive/idempotent. Validate the complete generated nginx configuration before activation and preserve rollback. Verify wallet/admin/game flows with the real trusted-proxy chain. Separately inventory external port 8080, authorize and stage origin restrictions, and rotate the Tatum API credential disclosed in a diagnostic output without recording its value.

## Validation Criteria

Passing isolated tests for spoofed forwarding headers, bounded rate state, parser-before-auth rejection, concurrency after disconnect, status coalescing/invalidation, wallet challenge/session limits, WebSocket authorization/frames/rates, credential encryption and wallet proof regression. Web production build and deployment shell syntax must pass. Changed nginx directives must pass `nginx -t`; this does not replace testing the full generated live configuration before reload.

## Related Decisions

- [Custodial migration](adr-0040-clash-custodial-migration.md)
- [Sales runner](adr-0048-migration-sales-runner.md)
- [Security review and deployment gaps](../../production/reports/security-hardening-2026-09-21.md)
- [Express proxy trust](https://expressjs.com/en/guide/behind-proxies/)
- [Cloudflare origin protection](https://developers.cloudflare.com/fundamentals/security/protect-your-origin-server/)
- [Authenticated Origin Pulls](https://developers.cloudflare.com/ssl/origin-configuration/authenticated-origin-pull/)
