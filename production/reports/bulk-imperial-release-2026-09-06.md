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

- Implementation `31a02aa33549a83e43485e6e3b3c1923d52d32fc` fast-forward pushed to `origin/main`. Original dirty checkout untouched.
- Canonical `deploy/export-upload-deploy.ps1 -Branch main` exhausted 20 configured proxies before any remote mutation. Retried the same script with its supported empty `-ProxyFile` parameter over direct pinned-host SSH; succeeded.
- Production precheck: prior b93f6eb1, source had only the canonical ignored deploy lock, 122GB free disk and 13GB available RAM.
- Active release `/opt/clash/releases/20260906122519-31a02aa3`; runtime health gate passed12:29:33UTC, deploy completed12:29:40UTC. Linux credential tests passed before activation. Main API4000, futures3999, MCP4100 healthy.
- Public `/` HTTP200 references `/assets/main-C796f6Ru.js`. Public `FuturesPanel-C2OEpwZN.js` HTTP200 SHA256 `0906a8978a2021e20c0a9516d561996b7e0d6e84963cb8022c97aea02bc36ee8` matches the release file exactly; contains one-tap, entry-notional return and index estimate labels.
- Public `/api/futures/bulk/config`: mainnet, `one_tap_supported=true`, `builder_enabled=false`, builder fee0. No trading grant/order smoke executed.
- Canonical retention removed old build `20260906073034-d5dbfddd`. Previous b93f6eb1 remains for rollback; player databases were not manually repaired or cleared.
- Existing canonical Solana NFT payment-sync ran during restart and reported a price-configuration update for dragon:clash:21510.002152 →129533.678757 $CLASH at token price$0.00007720, target$10,12:29:14.827UTC. This was the existing deploy-script synchronization, not a BULK/Imperial trade or a manual treasury transfer. Owner notified of this side effect.
- Browser fixture shutdown recorded an extension-origin Phantom `Cannot redefine property: ethereum` injection error and Vite buffer warning; neither prevented the verified component flows. This does not certify real wallet-provider behavior.
