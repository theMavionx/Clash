# Terminal palette production release

- Owner approved deployment: «гуд деплой» after local screenshot review.
- Application commit: `52c7e18b`; release `20260920125912-52c7e18b`.
- Canonical full Deploy gate passed, including lint, Godot regressions and web build. Earlier 33 focused tests and desktop/mobile local browser checks passed.
- Ran existing `deploy/export-upload-deploy.ps1` after the full gate and fast-forward push to main. `deploy-clash` skill was unavailable. Godot unchanged; existing runtime reused.
- Atomic deploy finished 2026-09-20 13:04:39 UTC. All five Clash services online with zero restarts afterward. Startup health retries resolved; canonical runtime verification passed.
- Public homepage and `/api/online`: HTTP 200. Public terminal `FuturesPanel-C7G_piqD.js` byte-matched server SHA256 `7b8f4ad0f951589a31bda1d8af82e8284dc85accaf1ea8531b582f4bf1d1b5cd`.
- Shared palette stylesheet `main-BxKhVevJ.css` byte-matched SHA256 `ed3fec44a4e3634b184408a9b40c35271b6e22d0f80a0873deac0ae3e0ed959a`; approved panel/long/short colors present. Terminal-specific CSS alone does not contain the shared theme, so verification was corrected to the shared main stylesheet.
- Last 30 lines of each service error log contained zero TypeError/ReferenceError/SyntaxError/UnhandledPromiseRejection matches; this is bounded smoke coverage, not a claim of no upstream warnings.
- Previous release `20260918103439-9992eb4e` retained for rollback. Standard two-release retention removed build directory `20260918101946-75de0e9c`; source remains recoverable in Git, shared data preserved.
- Dependency audit/deprecation and bundle-size warnings remain outside this palette-only release. No funded transactions tested. Existing mobile Account clipping not changed.
