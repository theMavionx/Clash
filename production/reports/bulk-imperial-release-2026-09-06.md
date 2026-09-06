# BULK and Imperial release — 2026-09-06

Owner approval: UR-2026-09-06-BULK-PNL-RELEASE, “в булк теж трохи криво закинь потім все на прод”. Scope is the accumulated BULK one-tap/close/proof and BULK/Imperial position-display fixes, not unrelated work in the original dirty checkout.

## Changes

- BULK keeps native unrealized dollar PnL and explicitly computes unleveraged return on entry notional. Screenshot regression: +$0.1212 / +0.25%, rather than leveraged +4.99%. Zero is preserved. Entry/mark prices show cents. The denominator is our explicit UI convention consistent with the screenshot, not a claim that official docs specify it.
- BULK owner-authorized Ed25519 one-tap, encrypted existing vault, fresh authorization on delegated submissions, explicit pause/revoke/recovery, full/partial reduce-only close adapter, persistent rejection feedback and canonical signed-order proof correlation. See the one-tap report and ADR-0037.
- Imperial fallback marks now say Index (est.) and explain why PnL can differ. Completed actions with an execution signature and nonzero size enter History. The diagnosed close had already executed; this is not a claimed repair of its execution.

## Local verification

- Canonical `tools/codex/check-repo.ps1 -Mode Deploy`: exit 0, including production web build and broad regression checks.
- Focused BULK frontend/backend one-tap, adapter, wire, proof and browser-normalization suites passed; encrypted credential coverage separately passed.
- 16 combined BULK display and Imperial data/stream regression tests passed. Imperial backend adapter: 25 passed.
- Actual local React position table and cards verified in Chrome desktop and 390x740 viewport: BULK +0.25% and cents; Imperial index provenance visible; no horizontal overflow. Actual one-tap hook/dialog flow with test keys and simulated exchange verified grant, half/full close, rejection without retry, revoke and owner fallback. No live trade.
- Focused ESLint: zero errors; seven preexisting FuturesPanel warnings. `git diff --check` passed. A final narrow formatting guard preserves other venues' preexisting mobile price precision; focused tests/lint rerun afterwards.
- Independent read-only lead-programmer review found no release blocker in one-tap authorization, close and proof handling.

## Limitations

- Real wallet-provider/native BULK grant and funded fill acceptance are not certified by fixtures; require a separate owner-approved smoke. Grants have no configured expiry; pause does not revoke.
- Imperial's observed public Phoenix quote was stale; index fallback remains estimated. This release does not repair the upstream feed.
- BULK builder fees stay disabled. Referral state, fee-recipient activation and historical incorrect proofs are not repaired. No funded order, live grant, treasury action or manual production database repair is authorized by this release.
- Existing dependency audit/engine and bundle-size warnings are not addressed with unreviewed upgrades.

## Deployment

Canonical atomic deployment with runtime health gate and rollback retention pending. Production precheck: current b93f6eb1, source has only the canonical ignored deploy lock, 122GB free disk and 13GB available RAM. Final release and public-asset verification will be recorded after completion.
