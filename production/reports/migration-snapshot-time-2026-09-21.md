# Migration snapshot cutoff — 2026-09-21

## Changes
- Admin now accepts an explicitly UTC past date/time. Blank default; date changes reset confirmation; invalid/future dates cannot submit. Server refuses unfinalized/unavailable dates rather than moving the cutoff.
- Resolve the last produced finalized block at/before the chosen second; verify its successor lies after the cutoff. Store requested UTC, actual block time, slot and immutable identity.
- Read authenticated wallets through paid Alchemy historical owner lookup, including subsequently closed accounts. Validate all pages and cache exact integer eligibility, including zero. Purchases after cutoff cannot increase allocation. Direct quotes also hydrate history; failed reads never fall back to current holdings.
- Snapshot replacement remains forbidden after the first request. Replacement racing an account lookup rejects stale results. Counts explicitly mean wallets evaluated so far, not the entire holder population.
- Public page displays historical cutoff in UTC; legacy captured snapshots remain readable.
- Architecture captured in ADR-0041; no operator cutoff selected during implementation/deployment.

## Additional defect discovered
Live nonzero history validation revealed that the fixed CLASH source mint is Token-2022, while initial migration code assumed legacy SPL Token. Corrected mint/account validation, ATA derivation, deposit TransferChecked program,170-byte immutable-owner ATA rent and sale source ATA. Keep legacy WSOL cleanup unchanged. Only verified metadata-only source mint extensions are allowed; transfer fees/hooks remain unsupported and blocked.

## Verification
-32 focused server tests passed, including UTC parsing, produced-slot gaps/repeated timestamps, complete historical pagination, invalid history, immutable caches, stale lookup race and Token-2022 instruction/account/rent construction.
- Five UI model tests and full mocked browser regression passed. Honolulu browser timezone proves selected13:45UTC posts13:45Z without device offset. Blank/future/locked controls and reset confirmation tested.
- UX/art review found a dark native calendar indicator; scoped dark color-scheme fixed it and refreshed screenshot verified visible icon.
- Real paid Alchemy read-only diagnostic: selected2026-09-20T08:37:16.255Z -> slot448679541, block time2026-09-20T08:37:16Z. Boundary and historical API validation passed. A nonzero historical CLASH holder read passed with the actual Token-2022 program. No production snapshot or funds mutated by these diagnostics.
- An overly broad local test glob also selected the opt-in live diagnostic without credentials; that diagnostic correctly refused. The explicit32-test offline suite and separately credentialed live diagnostic both passed afterward.
- Full canonical Deploy gate passed (including browser regression and production build). No funded deposit, sale or EVM payout test.

## Release verification
- Released commit `46cf9b18` as `20260921084906-46cf9b18`; canonical deploy/runtime health checks passed at08:52:33UTC.
- Public migration/status returned200; unauthenticated admin returned403. Reloaded production page rendered normally without browser console errors.
- Production admin bundle contains the UTC datetime picker and Save snapshot cutoff control; public SHA256 matches the exact release file (`f2d5cb72e486aae4fce6840c2b0eb03b85c53a9f49ea1d929ad774b94f669e49`). Five Clash services online, zero restarts.
- Snapshot remains null and acceptance disabled; no production cutoff, credentials or settlement settings selected/changed. Existing missing configuration prerequisites remain visible.
- Standard two-release retention pruned build `20260921074659-3bb38d33`, reproducible from source; preceding branding build retained. No user ledger data removed.

## Operations
Admin > Migration > Eligibility snapshot: enter UTC cutoff, verify preview, confirm and save. Saving may take several seconds to resolve the chain boundary. Existing requests lock further changes. Archive failure preserves the previous configuration; never substitute today's balances manually.

Historical cutoffs require the new code: do not roll back to current-snapshot-only releases while accepting migrations. Pause first and retain snapshot metadata, cached entitlements and request ledger.
