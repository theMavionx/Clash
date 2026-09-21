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

## Snapshot applied on production

Snapshot-support release `20260921173928-a83e0d8e` completed17:42UTC with canonical health checks passing. Authenticated snapshot replacement succeeded; public status independently confirms cutoff2026-09-21T17:28:00Z/slot449122416 and new checksum `7020a106c12140cb5582f22545669d04b4cd4aba9a8a5eb38caa420487295f67`. enabledfalse/targetTokenempty/ratio1 and delay150–420s unchanged. Requests/sales/sends hash is exactly equal to protected backup.

Initial postcheck reported failure because it incorrectly expected exactly one archived eligibility row from the earlier backup. A second wallet hydrated the old historical snapshot before replacement. No retry/write was attempted. Read-only follow-up verified two archived rows, count and sum matching archived snapshot metadata, and every original backup entitlement preserved exactly. This was a verification assumption, not a cutoff/accounting failure. New cutoff has also been queried successfully by one wallet. Historic per-request snapshot references and paid usage remain unchanged.

Canonical retention removed compiled `20260921153758-25022c21`; prior `20260921171534-f444d627` retained at this stage. Source rebuildable from Git. Existing canonical collectible payment-price synchronization runs separately from migration; no migration deposit/payout/sale was initiated by this task.

## UI follow-up released / supplied CLASH target configured

UI release `20260921174301-b0bb9a4f` completed17:46UTC with runtime health passing. Owner-supplied contract `0xceB9A7C4eC7bf0EE14Bac1f16C97571bC22DB979` read-only verified via paid Alchemy at Robinhood block68987131: chain4663, nameClash of Perps by Virtuals, symbolCLASH, decimals18, supply1,000,000,000, deployed bytecode45bytes. This is metadata/code-presence validation, not a contract security audit. Treasury `0x33859e82dfA5039c4A37DaCe86Ee799C95d4f466` inventory0CLASH; ETH0.034034470748419104. No transfer simulation with funded inventory or actual CLASH payout possible yet.

Authenticated target-only update200 preserved every other config field, snapshot checksum and request/sale views. Readiness now TARGET_INVENTORY_EMPTY, acceptance remainsfalse. Live headless Edge read-only production check at1440/390 widths passed:200, timing paragraph absent, ratio1:1,17:28UTC cutoff, actual delay150–420s retained, supplied target configured, zero page errors/no horizontal overflow. The first smoke harness attempt used a Windows path without file:// in an ESM import; corrected and rerun successfully before browser verification.

Final rollback is snapshot-support release `20260921173928-a83e0d8e`; retention removed compiled `20260921171534-f444d627` (rebuildable from Git). Full actual CLASH migration validation remains pending token inventory and owner-authorized activation/test. Existing security/host/dependency caveats remain unchanged.
