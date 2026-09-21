# Migration cutoff:21 September2026,20:28 Kyiv

Owner requested2026-09-21T17:28:00Z. Existing fully settled test ledger prevents legacy snapshot replacement. ADR0050 defines explicit paused/settled replacement with archival, expected-checksum concurrency check and no allocation reset.

## Local verification

-89 focused core/chain/history/HTTP/sales/ledger/model/asset/transport tests passed; expanded HTTP confirmation/admin/forwarding assertions also passed.
-Real local mocked Edge browser: desktop/mobile migration flows and admin replacement payload passed, including UTC serialization while browser timezone is Honolulu. Replacement notice discloses preserved used allocation. Screenshots remain untracked local artifacts.
-Canonical Deploy gate passed, including tests, syntax, Godot, web lint/build; existing warnings and five Windows vault symlink skips remain. No funded tests.
-Production paid Alchemy read-only lookup independently resolved requested second to finalized Solana slot449122416, blockTime1790011680000; no timestamp-only relabeling.

## Intended rollout

Protected DB backup, canonical additive-schema deployment, then authenticated snapshot endpoint with explicit replacement and current checksum. Verify archived metadata/eligibility and unchanged hash of requests/sales/sends/config; keep enabledfalse, targetTokenempty and ratio1. Historical paid4000CLASH->4USDG stays unchanged and consumed. No financial operation authorized or needed for this cutoff update.

Production result will be recorded after verification. Earlier readiness-review findings describe the pre-change lock; ADR0050 replaces that permanent lock only for explicitly confirmed, paused, fully settled transitions.

## Owner follow-up during rollout

Remove the public paragraph beginning "New Robinhood payouts are scheduled2.5–7 minutes". Only rendering/import removed; actual delay, admin controls and Processing history unchanged. Desktop/mobile mocked browser flow reran successfully with explicit paragraph-absence assertions; Vite build passed. Additional UI release follows the already-running snapshot-support release.

## Protected migration backup

General game DB is30.65GB; an initial full online copy was cancelled by terminating only its identified backup process, then its incomplete generated files removed. Instead, a coherent read-transaction backup of the eight migration state/accounting tables was generated and SQLite quick_check passed,69,632bytes, directory0700/file0600. Source DB untouched by backup. Path `/opt/clash/shared/backups/migration-snapshot-20260921-1728-1790012181478/migration-state.sqlite`. Pre-change requests/sales/sends SHA256 `7551a9670630b1f6b647f870f4b6540f393f6349aec2bcc1cf6225481b019ee4`; will compare after authorized cutoff update. This is a scoped migration-state backup, not a full disaster-recovery backup of the game or encryption keys.

Linux release-candidate verification additionally passed76 core/chain/history/HTTP/ledger/sales tests, zero failures/skips.
