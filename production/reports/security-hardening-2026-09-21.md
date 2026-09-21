# Security hardening — 2026-09-21

Original review status: local implementation and verification only. **Rollout update:** owner-approved package deployed as `20260921141323-563e93cf`; full nginx/runtime/live smoke and 55 Linux checks passed. See [production reliability report](production-reliability-2026-09-21.md) for verification, deployment side effects and newly identified futures SDK advisories. Tatum rotation explicitly declined by owner. Historical findings below are retained; broad infrastructure/dependency risks remain open. This is a scoped review, not a penetration-test certificate or a guarantee against DDoS.

## Outcomes

- Removed unauthenticated bot-WebSocket fallback to a shared default tenant.
- Blocked game player WebSocket add/subtract-resource operations that bypassed the admin-only HTTP boundary. Current Godot resource helpers use HTTP; privileged HTTP routes remain available.
- Added migration pre-parser authentication, rate/body limits, global/client budgets, underlying-operation concurrency bounds, status read coalescing and challenge/session quotas.
- Bounded game/bot WebSocket payloads and message rates, upgrade rate and connection count; game unauthenticated sockets expire after ten seconds.
- Removed production admin query authentication in the dashboard and query contents from changed request logging. Admin key storage migrates from localStorage to sessionStorage; logout clears both.
- Added compatible browser security headers and a candidate nginx migration protection configuration, with verified-source Cloudflare client-IP handling.
- Updated compatible server dependencies without forced major changes: ws 8.21.3, body-parser 2.3.0, qs 6.16.0, path-to-regexp 8.4.2, viem 2.56.8.
- Existing migration AES-256-GCM encryption and custody safeguards were retained; tests verify tamper/ownership/replay protection. No real wallet key was printed or rotated by this task.

## Read-only production observations

Observed on 2026-09-21; these are configuration observations, not proof of external exploitability.

| Observation | Meaning / next action |
| --- | --- |
| Public migration page passes through Cloudflare | CDN exists; account WAF/DDoS settings and origin restrictions were not inspected. |
| Main API binds 127.0.0.1:4000 | API is not directly listening on an external interface. |
| Process named phantom listens on 0.0.0.0:8080 | Map consumers and authentication before changing its bind/firewall; potential alternate ingress. |
| UFW inactive; iptables default policies ACCEPT | Do not assume all ports reachable: other rules/provider firewall were not audited. Origin restrictions need explicit verification. |
| Active nginx had zero limit_req/limit_conn/set_real_ip_from directives | Candidate local template addresses migration ingress, not every service. |
| No nginx ssl_verify_client on found | Authenticated Origin Pulls not established by inspected nginx; stage with Cloudflare settings. |
| Public migration response lacked CSP, HSTS, nosniff, frame and referrer headers | Candidate template adds scoped headers; not yet live. |
| Active DB, shared env and migration master key each mode 0600 | Useful filesystem protection, not protection against host compromise. |
| Separate legacy /opt/clash/shared/clash.db mode 0644 | Not the active CLASH_MAIN_DB; inspect content/retention before restricting or removing. No deletion performed. |

Incident: an initial nginx diagnostic accidentally included one Tatum API credential in technical tool output. Its value is deliberately omitted here. Treat it as disclosed and rotate it with provider/nginx coordination. Subsequent diagnostics output sanitized counters only. Wallet keys/seeds were not disclosed. No automatic rotation was attempted because it could interrupt paid RPC routing.

## Verification

- Combined isolated suite: **152 tests; 147 passed, 5 skipped, 0 failed**. Includes HTTP/WS security, migration core/chain/HTTP/sales, browser admin storage, credential vault/unlock/key provisioning.
- Five skips: two file-symlink fixtures unavailable on this Windows host and three POSIX permission/ownership tests. Linux execution is still required for those cases.
- Real localhost HTTP checks include 24 interrupted clients: underlying work retains its concurrency slots, further public work gets 503, authenticated admin remains available, and public service resumes after work settles.
- Real localhost WebSocket checks cover oversized frame close 1009, null/array messages, privileged mutations, flood rejection and idle authentication deadline.
- Web production build passed (Vite; existing large-chunk warning).
- `bash -n deploy/deploy.sh` passed.
- Changed nginx zones/server policies/migration locations extracted into an isolated temporary configuration passed installed nginx `-t`. No reload; temporary fixture removed. This does **not** validate the full generated multi-service configuration or network behavior.
- Expected bigint native-binding fallback warning appeared in local tests; JavaScript fallback completed the suite.
- No manual browser wallet session, funded migration, external port scan, production load test or complete Godot playtest in this turn.

## Dependency audit

Server production dependency audit reduced from 19 warnings (5 high, 13 moderate, 1 low) to **14 (3 high, 11 moderate)**. Remaining high dependency nodes: `bigint-buffer`, `@solana/buffer-layout-utils`, `@solana/spl-token`. These include inherited advisory paths, not three independently established exploitable defects. Forced suggested SPL downgrades would break current Token-2022 support and were not applied.

Web audit reported **90 (22 high, 68 moderate)**; no web lockfile update was attempted. Wallet/exchange SDK trees need compatible upgrades and browser regressions. Advisory counts are not a reachability/exploitability assessment. Other service/package trees were not exhaustively audited.

## Code Review: security ingress, migration router, WebSocket and admin storage

System category: backend networking / tools / web UI. Full focused target files reviewed: `server/http_security.js`, `server/migration_routes.js`, `server/websocket.js`, `web/src/admin/api.js`. The large legacy entry point and custody module received targeted boundary/diff review, not line-by-line whole-repository certification.

### Standards Compliance: 3/6 passing for the new reusable security helper

- Public documentation: partial; `allowedOrigin` and `securityHeaders` lack dedicated API comments (`http_security.js:78,87`).
- Complexity below 10: not enforced; ingress policy combines classification, rate, origin/auth and body branches (`http_security.js:97`). Prefer measured lint enforcement and extraction before extending it further.
- Method length below 40 lines: pass for the new helper functions; legacy WebSocket/router factories exceed this rule.
- Dependency injection: pass for new environment/clock/read/auth dependencies. Existing WebSocket singleton DB/global client collections remain legacy debt.
- Configuration from data files: not met; conservative security ceilings and trusted CIDRs are reviewed code constants (`http_security.js:5,104`). Deliberately not user-editable, but should have a documented update process.
- Interfaces: pass; callers use small function contracts with no frontend ownership of backend state.

### Architecture: MINOR ISSUES

Centralized ingress separates security from custody/financial orchestration. No new dependency cycle. Legacy global WebSocket state and oversized entry-point/router factories remain. Per-process counters require a shared/adaptive policy if scaled horizontally. HTTP request timeouts do not cancel all downstream provider work; operation slots intentionally remain occupied until completion.

### SOLID: ISSUES FOUND

Pure identity/cache/limiter helpers are independently testable. Ingress classification and admission remain coupled; legacy socket setup combines authentication, broadcasting and dispatch. There is no subtype hierarchy requiring Liskov analysis. Avoid expanding this module into a replacement for settlement authorization.

### Game-Specific Concerns

- No simulation/frame timing changes. Resource mutations are now consistently admin-only.
- Connection and message limits can affect reconnect storms or unusually busy clients; observe 429/503/1008 metrics after a staged rollout.
- Existing outbound socket backpressure/pending-event global cardinality and exhaustive gameplay authorization need further review; inbound limits are not a complete networking audit.

### Positive Observations

Fail-closed tenant identity, no production query admin credentials, exact ownership/settlement checks preserved, bounded limiter state, no secret-bearing provider errors in changed paths, generation-safe status invalidation, and tests against real HTTP/WebSocket transports. New tests cover disconnected-client concurrency rather than relying only on response completion.

### Required Changes

Before claiming production is fully protected:

1. Review and deploy the tested candidate; verify full generated nginx configuration and real admin/wallet/game flows. Nothing in this report is live protection yet.
2. Rotate the disclosed Tatum API key and inspect historical credential-bearing logs/backups without printing their contents.
3. Map port 8080 consumers; stage least-privilege bind/firewall rules and Cloudflare origin authentication/restrictions with an SSH/recovery path. Never blanket-enable a firewall on this shared host.
4. Resolve/mitigate remaining dependency advisories through compatible SDK upgrades and reachability review.
5. Audit public paid-RPC proxies for allowed methods, body/concurrency/response limits and spend quotas. Migration throttling does not secure those proxy locations.
6. Run skipped Linux permission tests; verify encrypted backups, master-key separation, restore procedure and least-privilege service accounts. Active migration key and DB sharing a host is not a vault boundary against RCE.

### Suggestions

Replace shared browser-readable admin keys with short-lived HttpOnly admin sessions plus MFA; stage a strict CSP; centralize safe logging across all services; add abuse/429/503 alerts and reviewable budgets. Update official Cloudflare ranges through a reviewed process. Perform authenticated browser regression and external origin-reachability verification during the rollout window.

### Verdict: CHANGES REQUIRED

Local defensive changes pass focused regression, but deployment, origin security, credential rotation and dependency follow-up remain before any broad production-security sign-off. No claim of "maximum" or complete protection.

## References

- [ADR-0049](../../docs/architecture/adr-0049-security-ingress-boundaries.md)
- [Express proxy trust](https://expressjs.com/en/guide/behind-proxies/)
- [Cloudflare origin protection](https://developers.cloudflare.com/fundamentals/security/protect-your-origin-server/)
- [Authenticated Origin Pulls](https://developers.cloudflare.com/ssl/origin-configuration/authenticated-origin-pull/)
