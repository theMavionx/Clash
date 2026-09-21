# Bug Report

## Summary
**Title**: Phantom public-app lookup404 and extension tabs.get invalid tabId
**ID**: BUG-20260921-PHANTOM-CONSOLE
**Severity**: Unconfirmed; S2 if wallet connection/signing is blocked, otherwise S4 console-only
**Priority**: P2 investigation
**Status**: Awaiting affected-user reproduction context
**Reported**: 2026-09-21
**Reporter**: Owner

## Classification
- Category: Network / wallet integration
- System: Migration, Phantom browser extension
- Frequency: Unknown
- Regression: Unknown

## Environment
- Build: production20260921180004-620ae4e2
- Platform: browser and Phantom versions not supplied
- Page: clashofperps.fun/migration
- State: migration enabled and ready

## Reproduction Steps
Preconditions: Phantom installed; exact browser context unknown.
1. Owner visits migration and observes console output; action preceding error not supplied.
2. Console shows api.phantom.app/portal/v1/public-apps?domains=clashofperps.fun404.
3. serviceWorker.js getTabMeta/createRpcRouterController throws tabs.get invalid negative tabId.

Expected: wallet connection and explicit signing work.
Actual: console messages supplied; blocked user action not yet established. Extension-specific stack not reproduced locally.

## Technical Context
- WalletConnection.jsx uses Solana Wallet Standard with injected Phantom fallback. No calls to public-apps, tabs.get or getTabMeta found in application sources.
- tabs.get is a browser-extension API. Stack indicates extension context; identify extension from full script URL before attributing definitively to Phantom. Negative ID indicates missing/invalid tab context, not a migration contract rejection.
- Lookup404 comes from Phantom host; reason not established, do not claim missing registration is confirmed or suppress unrelated errors.

## Evidence
- Fresh production check at1790015452050: enabledtrue, readytrue, no readiness reasons.
- Three new submissions: two deposited, one deposit_signed, no stored request error codes. Their quote/submit events all HTTP200. Recent returned diagnostic events showed no HTTP failure. This does not prove the reporting user's wallet flow works, or payouts have completed.
- Chrome API reference: https://developer.chrome.com/docs/extensions/reference/api/tabs

## Related Issues
- Earlier Phantom transaction normalization issue is not evidenced by this stack.

## Notes
No deployment, wallet signing or financial config change performed for this diagnosis. Need exact failing action, full serviceWorker script origin and browser/extension version if user is blocked. Never request seed/private key.
