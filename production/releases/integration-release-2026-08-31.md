# Integration release — 2026-08-31

## Authorized scope

Owner: "закинь все на прод". Publish the completed changes in the isolated
codex/log-audit-20260830 worktree. The original checkout's unfinished
holder-rebate work is excluded.

- Log audit: Decibel archived proofs, Ink marketplace support, Privy wallet
  creation, venue-aware authenticated prefetch and Godot loader recovery.
- Nado native candles, precision, cancellation and retry.
- Shared public-read proxy policy/transport using the existing protected
  production Hibachi pool; no proxy credentials in client code.
- Lighter/RH Lighter wallet-approved setup, encrypted browser custody and
  recovery, with retained manual setup and existing referrals.
- eToro Real-only setup plus key-creation guide and Trading Settings link.

## Release checks

- Existing check-repo.ps1 -Mode Deploy: PASS, including exchange/reward/
  gameplay regressions, Godot probes, full lint and production web build.
- New targeted suite: 127 passed, 0 failed/skipped.
- Production Node 20.20.2 compatibility: 64 passed, 0 failed/skipped.
- Local browser scenarios for the changed UI were verified during their
  implementation; eToro guide disclosure and Real payload verified last.
- Existing warnings: 133 lint warnings (0 errors), large web bundle chunks.
- Production baseline/source and origin/main: 534e91d2.
- Production Lighter signer: pinned lighter-sdk 1.1.1.
- Existing protected /opt/clash/shared/hibachi-proxies.txt: 100 entries,
  file hash matches the owner's latest Webshare file. New public-read
  transport falls back to this configured file; no Windows env is deployed.
- Free production disk: 23 GiB; current release: 2.1 GiB.

## Deployment / rollback

Use existing export-upload-deploy.ps1 and atomic deploy/deploy.sh with
host-key-pinned SSH through the supplied proxy pool. Runtime source changes
do not change Godot content or database schema. Existing shared databases
and proxy/credential files stay in place. Previous current release:
/opt/clash/releases/20260830171738-534e91d2.

The deploy script builds/validates before switching current, verifies all
required processes/health endpoints, and automatically rolls back a failed
runtime verification. Prior release is retained by the established policy.

Status: DEPLOYED; production verification PASS.

- Published SHA: 3b1abf083a81b9eab24b09abb9096f480403d1a3.
- Active release: /opt/clash/releases/20260830222226-3b1abf08.
- Script finished 2026-08-30 22:25:47 UTC (2026-08-31 Kyiv).
- Health passed: main API, futures, MCP and public API through CDN.
- CDN exact bytes matched deployed index.html, sw.js and seven owned JS
  bundles, including FuturesPanel, GodotCanvas and ProfileModal.
- eToro Real-only server configuration and new guide/setup UI markers passed.
- Live Nado 5m history returned BTC 97, KPEPE 40 and PENGU 52 valid bars.
- Public Ink eth_chainId returned 0xdef1 with proxy transport header;
  transaction-write relay was rejected with 400 before any upstream write.
- Both Lighter routes reject anonymous preparation (401). First verification
  probe used an incorrect RH route spelling; corrected to /rh-lighter, matching
  frontend/backend routes, and the complete verification then passed.
- Official lighter-sdk 1.1.1 native ChangePubKey offline test passed on the
  production Linux runtime; no live registration or transaction was sent.
- Main API and futures each report 100 configured server-only proxies.
- Five Clash PM2 processes remained online with zero restarts after 2.5 min.
  No new futures/jobs/MCP stderr since startup; Hibachi reconcile errors=0.
- Existing bridge retry fetch failures and Solana payment-sync simulation
  warnings remain. They were not repaired or represented as working here.
- Established retention removed 20260830121824-bb871ba1 build artifacts.
  Previous current 20260830171738-534e91d2 remains available for rollback;
  shared player databases were not removed or manually edited. Disk: 23 GiB free.

## Explicit limitations

No real wallet-approved key registration, funded order, deposit or withdrawal
is part of release testing. Real owner-wallet Lighter acceptance remains a
user-driven test. Provider availability and existing Solana payment-sync
warnings must not be presented as fully verified trading behavior.
