# Migration diagnostics — 2026-09-21

Owner requested durable diagnostics after request d110cb96-7b5c-495d-b792-92d1728d1d34 received HTTP 400 and subsequently expired. The earlier rejection cannot be reconstructed retroactively.

Changes: structured HTTP completion events with server-generated correlation ID, route template, validated request ID, status, safe error code, timestamp and duration. Keep latest 10,000 events in SQLite and emit JSON to the server log. Admin-only GET /api/migration/admin/diagnostics returns latest 200. Successful GET polling is excluded. Escaped worker failures are recorded; existing per-request settlement error codes remain in the ledger. Database/logger failures do not turn accepted transactions into HTTP failures.

No headers, bodies, query strings, provider exception messages, credentials, wallet signatures or raw transactions enter these diagnostics. Frontend submit failures now retain the safe API message and correlation reference instead of replacing them with a generic checking notice. Ambiguous-response reconciliation is unchanged.

Verified: 34 focused migration tests passed, including actual HTTP rejected-submit persistence, admin access protection, credential sentinels, unknown-error redaction and logging-storage failure isolation. Existing desktop/mobile mocked-wallet browser suite passed, including lost-response reconciliation without re-signing. No funded transaction was initiated.

Canonical Deploy gate passed (including lint and production build). The added browser HTTP 400 scenario passed: exact safe reason and reference remain visible, and retry does not re-sign. Retention cap test passed.

Deployed with canonical export-upload-deploy.ps1 to release 20260921114035-da416276. Live read-only unauthenticated account probe returned AUTH_REQUIRED and a correlation ID; admin diagnostics contained the matching persisted event (stage /account, HTTP 401, duration 1 ms). Enabled and ready both remain true. No funded test or migration-setting change. This does not establish or fix the original historical HTTP 400 cause.
