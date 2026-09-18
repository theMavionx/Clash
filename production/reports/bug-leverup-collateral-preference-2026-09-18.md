# LeverUp collateral choice resets

## Summary
- ID: BUG-LEVERUP-COLLATERAL-PREFERENCE-20260918; severity S3; priority P2.
- Owner request: remember explicit USDC/lvUSD selection and deploy immediately.
- Baseline application 34257b81; browser trading UI; reproducible on each hook remount; regression unknown.
- Status: released and production-read verified.

## Reproduction
Select lvUSD, close/reopen trading panel or reload page. Previously the hook always initialized `useState('USDC')`, so another manual switch was required.
Expected: the same wallet retains the explicitly selected asset.

## Implementation
- Dedicated `useLeverupCollateral` preference hook uses a versioned LeverUp/Monad/wallet-scoped browser key and validates symbols against USDC/lvUSD.
- Only explicit selection writes storage. Wallets without a saved preference retain USDC; no automatic swap or allowance/transaction is triggered.
- Wallet changes derive the correct preference synchronously rather than rendering a previous wallet's asset while an effect loads.
- Session fallback survives remounts when storage access/writes fail, including an older stored value after quota failure. Full reload persistence requires available browser storage.
- No server-side preference/account mutations, trading amount logic or signer changes.

## Verification
- Three preference tests pass: normalized-wallet isolation/validation, denied storage and quota failure with stale persisted value.
- Existing order/protocol/confirmed-close regressions pass.
- Real mounted FuturesPanel with the actual preference hook passes at 1280 and 390px: select lvUSD, reload, switch to another wallet, return to original wallet, verify amount label/balance and submit a mock order. No real wallet or exchange submission.
- Full canonical `check-repo.ps1 -Mode Deploy` passed, including production web build.

## Limits
This is per browser/device, not cross-device synchronization. Existing choices made before this feature were not stored and cannot be recovered; select lvUSD once after updating. No funded trade was performed.

## Release
- Commit `df54e2c6`, release `/opt/clash/releases/20260918060101-df54e2c6`; canonical deploy completed 2026-09-18 06:07:35 UTC.
- At 06:07:48 UTC all five Clash PM2 services online with zero restarts; public `useOstium-BmyDQXOh.js` containing the preference key byte-matched the deployed asset.
- Public online/LeverUp prices HTTP 200; unauthenticated positions correctly 401. Futures error log unchanged from predeploy offset 384521 bytes.
- Rollback retained: `20260917143924-34257b81`. Normal retention removed `20260917071700-79fc4046`; shared databases retained, source recoverable from Git.
- Unrelated deploy warning: one-shot Solana payment-sync exited 1 after signature expiry/block-height exceeded; its watcher subsequently online. Dependency audit/Node engine warnings remain; no unrelated upgrades attempted.
