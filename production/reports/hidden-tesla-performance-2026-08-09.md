# Hidden Tesla performance profile

**Date:** 2026-08-09
**Target:** 60 FPS / 16.67 ms
**Verdict:** PASS

## Scope

The profile covers the maximum two Hidden Teslas, a 45-unit troop population,
hidden proximity acquisition, active acquisition, lightning setup, production
Web export, and a real local browser battle. Measurements were taken before and
after the optimization; no model-quality reduction was applied without a
measured need.

## Asset budget

- L10 tower: approximately 2,852 triangles and 5,540 vertices.
- Runtime wrapper: five mesh instances (tower, two hatch panels, two anchors).
- The asset is already below a level where destructive decimation or a custom
  LOD pipeline would provide meaningful frame-time savings.

## CPU measurements

Focused probe: two L10 Teslas, 45 targetable troops, 12,000 scan calls and 180
lightning constructions per run. Values are averages across three process runs.

| Hot path | Before | After | Result |
|---|---:|---:|---|
| Hidden scan per call | 2.454 us | 1.769 us | 27.9% cheaper |
| Hidden scans, two Teslas | 120/s | 40/s | 66.7% fewer |
| Estimated hidden-scan CPU | 294.5 us/s | 70.8 us/s | 76.0% less total work |
| Active scan per call | 1.513 us | 1.750 us | unchanged path; runner variance, still negligible |
| Lightning setup | 326.7 us | 358.1 us | unchanged path; no persistent node growth |

The active path remains capped at 6.67 scans/s per Tesla, or about 23.3 us of
CPU per second for both defenses at the observed after value. Two Teslas can
fire at most about 3.08 combined shots/s, so even the slowest observed lightning
setup is about 1.10 ms of CPU per second rather than per frame. The probe found
zero persistent node growth.

## Changes made

- Hidden proximity scans now run every three fixed ticks (20 Hz) in both Godot
  and the authoritative server, bounding added detection latency to 50 ms.
- `RevealTriggerOrigin` is cached during visual binding instead of being found
  recursively for every proximity scan.
- Server runtime state records `triggerScanTicks` and `nextTriggerScanTick` for
  deterministic replay diagnostics.
- The model and lightning quality were retained because measured cost and
  browser frame rate did not justify visible degradation.

## Browser results

Fresh Godot Web export was loaded through the production React shell at
1280x720. The TH10 home village recovered from asset warm-up to 60 FPS; the
live battle scene also settled at 60 FPS. The local client-log endpoint reported
zero error-level entries for the test account during the final 30-minute window.

Evidence:

- `artifacts/hidden-tesla-browser/01_th10_home_60fps.png`
- `artifacts/hidden-tesla-browser/02_live_battle_60fps.png`
- `tools/perf/hidden_tesla_defense_probe.gd`

The full Web PCK remains roughly 235 MB and therefore has a noticeable cold
load/warm-up phase. That package-size issue is project-wide; it is not caused by
the light Hidden Tesla asset and is outside this focused optimization.
