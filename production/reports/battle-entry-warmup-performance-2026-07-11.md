# Battle Entry Warmup Performance — 2026-07-11

## Scope

Profile and reduce the delay between starting opponent search and receiving the
opponent, with special attention to Fire Dragon loading. Verify the final behavior
in the unauthenticated Chrome test scene and add durable timing/FPS telemetry.

## Results

| Metric | Baseline | Final | Change |
| --- | ---: | ---: | ---: |
| Chrome combat warmup | 10,260 ms | 1,749 ms | -82.9% (5.87x faster) |
| Warmup render frames | 14 | 6 | -57.1% |
| Proactively loaded troop types | 7 | 5 | Only active troops |
| Fire Dragon repeat prewarm frames | 2 | 1 | Removed redundant repeat |
| Web PCK | 88,341,896 bytes | 84,339,084 bytes | -4,002,812 bytes (-3.82 MiB) |

The final active Chrome warmup hotspots were:

- first shader/render compilation frame: 723 ms;
- active troop models and scripts: 237 ms;
- Demon King assets: 181 ms;
- shared troop animation libraries: 133 ms;
- Fire Dragon: 112 ms.

Fire Dragon is no longer the largest warmup stage. The remaining largest one-time
cost is browser/WebGL shader compilation.

## Chrome FPS profile

Scenario: one Town Hall target plus one Knight, Mage, Archer, Demon King, and black
Fire Dragon, automatically deployed after warmup. Chrome stayed foreground/active
for the complete measurement.

| Phase | Average FPS | Median FPS | Minimum FPS | p95 frame | Maximum frame |
| --- | ---: | ---: | ---: | ---: | ---: |
| Idle | 60.0 | 60.0 | 60.0 | 16.90 ms | 29.90 ms |
| Mixed combat | 41.3 | 40.0 | 34.0 | 34.20 ms | 83.50 ms |

Draw calls rose from 140 idle to 200–220 during combat. The run completed without
game errors or invalid Town Hall UID warnings. There was no long freeze during the
12-second combat sample, but combat is still about 33% below the 60 FPS idle median
and remains a valid future runtime-optimization target.

There is no pre-change Chrome FPS capture for a strict before/after runtime
comparison. The warmup changes remove resources and work rather than adding combat
runtime work, and the post-change mixed test provides the current regression
baseline.

## Implementation

- Start combat warmup at the beginning of boarding/search and overlap it with the
  existing transition rather than starting after the clouds close.
- Keep the later await as a safety barrier with a shorter maximum wait.
- Preload only active troops: Knight, Mage, Archer, Demon King, and Fire Dragon.
  Legacy Barbarian/Ranger replay resources remain available through lazy fallback.
- Reduce hidden render warmup to six frames and one Fire Dragon repeat.
- Remove unused red and purple Fire Dragon textures and make black the only skin.
- Add `[WARMUP_PROFILE]`, `[COMBAT_PRELOAD]`, and `[FPS_PROFILE]` logs with per-stage
  and per-frame timing.
- Add a repeatable `FPS Test` control to the unauthenticated test scene.
- Rebuild stale Town Hall import/UID cache and verify all five Town Hall models load
  without fallback warnings.

## Verification

- Chrome/WebGL unauthenticated test scene: passed.
- Automatic mixed-unit deployment: passed; five troop nodes active.
- Chrome FPS and frame-time sampling: passed.
- Final browser game errors: none.
- Invalid Town Hall UID warnings: none after clean import cache rebuild.
- Godot Web debug export: passed.
- Dedicated resource and warmup probes: included under `tools/perf/`.

The standalone probes exit successfully but Godot reports one cached resource at
process shutdown; this is probe-process cleanup noise and was not present in the
Chrome game run.
