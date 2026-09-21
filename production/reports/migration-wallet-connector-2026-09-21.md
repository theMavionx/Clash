# Migration wallet connector — 2026-09-21

## Changes
- Existing Apache-2.0 Solana Wallet Adapter React/core powers Wallet Standard discovery, with legacy injected Phantom/Solflare fallback. No new packages, paid service or API key.
- Replaced the two-option connect dropdown with a centered native-dialog picker: wallet icons, detected status, no-wallet guidance and official installation links. Existing project colors, mobile gutters, scroll bounds and long-name wrapping.
- Accessible title/description, named44px close control, explicit Tab/ShiftTab trap, Escape/backdrop close, focus restoration and reduced-motion support. Stock installed UI modal lacked some of these controls, so retained connector logic with custom presentation.
- Explicit user verification, cancellation retry, Change wallet/Disconnect actions. No automatic connection/signing. Mainnet adapter context uses same-origin paid Alchemy route; no public RPC introduced.
- Listeners installed before connect; generation/address guards after challenge, message signature and verification prevent stale authentication. Sign-only deposit/reconciliation maintained; legacy adapter explicitly rejects sendTransaction. Listener cleanup and safe focus fallback verified by review.

## Verification
- Expanded mocked browser suite passed: standard-wallet discovery at1440/390/320, all existing financial/admin flows, keyboard containment/Escape/return, rejection/retry, disconnect during pending signature (zero stale verify calls), legacy injected compatibility, unsupported signing account (zero auth/sign calls), no-wallet state and long unbroken wallet name at320px.
- First development run timed out while Vite optimized newly imported existing dependencies; rerun then found real Tab containment gap. Explicit trap fixed it and full suite rerun passed, including subsequent long-name test.
- UX/security and art reviews completed. Parent inspected desktop/mobile/empty-state screenshots under untracked `web/artifacts/migration/`.
- Focused lint: zero errors, two pre-existing main.jsx warnings. Full canonical Deploy gate passed, including production build (existing large-chunk warnings). Release verification pending.
- No funded wallet transaction or physical mobile-wallet handoff performed. Do not claim universal iOS/browser support; wallet/browser capabilities vary.

## References
- ADR0042; https://github.com/anza-xyz/wallet-adapter
