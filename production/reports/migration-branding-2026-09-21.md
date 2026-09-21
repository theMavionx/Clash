# Migration branding revision — 2026-09-21

Owner rejected the initial plain migration page and requested the Clash of Perps logo and top-positioned wallet connection. Approved a branded header and two-column desktop layout; explicitly waived further design approval prompts.

## Scope and design
- Reuse actual `splash-logo.png` wordmark, with CSS clipping of its existing padding; no new branding artwork.
- Header wallet selector, compact connected-wallet control, existing Phantom/Solflare verification flow.
- Focused migration form and compact facts sidebar; mobile stacked layout and wrapped addresses.
- Black background, dark neutral panels, existing orange accent; typography and spacing revised through team-ui visual/UX review.
- No backend, funds acceptance, fee, snapshot, treasury or settlement changes.

## Verification and release
- Full canonical Deploy gate passed, including migration server regressions and four UI model tests. Focused UI lint: zero errors, two existing warnings.
- Browser flows passed at1440/390/320px, including wallet menu Arrow/Escape navigation, shared connect CTA focus, wallet switch, quote restoration/cancel, lost-submit-response reconciliation and session expiry. No horizontal overflow.
- Parent visually inspected updated desktop and320px disconnected screenshots; real wordmark crop and responsive layout correct. Financial details remain visible.
- Production activation configuration unchanged. No funded test transactions.

## Released
- Commit `cca25d71`; canonical atomic release `20260921082545-cca25d71` completed08:28:38UTC.
- Actual production browser checks at1440/390/320px passed: loaded wordmark, header menu opens, Escape closes/restores focus, disconnected inputs disabled, no horizontal overflow, zero page JavaScript errors. Screenshots: `web/artifacts/migration/production-*.png` (local, excluded from git).
- Public migration/status200; unauthenticated admin403; status still enabledfalse with missing configuration. Five Clash services online with zero restarts.
- Public JS SHA256 matches release file: `6dfc80c2047c3aace5ab17cf110d651993782b9774c13b9078b1272af1b6d510`.
- Canonical retention removed obsolete palette build `20260920125912-52c7e18b`; preceding migration release retained for rollback.
