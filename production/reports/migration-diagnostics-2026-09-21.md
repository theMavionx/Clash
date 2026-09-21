# Migration diagnostics — 2026-09-21

Owner requested durable diagnostics after request d110cb96-7b5c-495d-b792-92d1728d1d34 received HTTP 400 and subsequently expired. The earlier rejection cannot be reconstructed retroactively.

Changes: structured HTTP completion events with server-generated correlation ID, route template, validated request ID, status, safe error code, timestamp and duration. Keep latest 10,000 events in SQLite and emit JSON to the server log. Admin-only GET /api/migration/admin/diagnostics returns latest 200. Successful GET polling is excluded. Escaped worker failures are recorded; existing per-request settlement error codes remain in the ledger. Database/logger failures do not turn accepted transactions into HTTP failures.

No headers, bodies, query strings, provider exception messages, credentials, wallet signatures or raw transactions enter these diagnostics. Frontend submit failures now retain the safe API message and correlation reference instead of replacing them with a generic checking notice. Ambiguous-response reconciliation is unchanged.

Verified: 34 focused migration tests passed, including actual HTTP rejected-submit persistence, admin access protection, credential sentinels, unknown-error redaction and logging-storage failure isolation. Existing desktop/mobile mocked-wallet browser suite passed, including lost-response reconciliation without re-signing. No funded transaction was initiated.

Deployment verification pending; this document does not claim the historical failure is fixed.
