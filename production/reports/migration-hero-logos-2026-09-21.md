# Migration hero logos — 2026-09-21

- Owner requested CLASH token, Solana and Robinhood logos in the migration introduction.
- Reused existing `/icons/icon-192.png`, `/tokens/SOL.svg` and `/robinhood.svg`; no new remote assets. CLASH icon sits beside the heading; network marks precede visible network names.
- Team-ui review retained textual labels, decorative empty alt attributes, fixed image dimensions, and responsive title layout. No behavior, treasury, snapshot or credential changes.
- Full local mocked migration browser regression passed at1440/390/320px, including all three images loaded and no horizontal overflow. Existing wallet keyboard controls, quote/reconciliation and admin UTC flows pass. Five model tests and production build passed; existing large-chunk build warning remains.
- Parent and art review verified screenshots at1440/320px; no blocker. Screenshots remain untracked under `web/artifacts/migration/`.
- Released `ed382d97` as `20260921085938-ed382d97`; canonical runtime/service health check passed09:03:39UTC. Production browser reload confirms all three hero images loaded, with no console errors. Migration still disabled/unconfigured; no funded transaction performed.
- Standard two-build retention pruned old branding release `20260921082545-cca25d71` (reproducible from source); snapshot-time release retained. User data untouched.
