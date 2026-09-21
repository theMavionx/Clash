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
