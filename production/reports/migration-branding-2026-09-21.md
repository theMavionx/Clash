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
- Production activation configuration unchanged. No funded test transactions. Deployment verification pending.
