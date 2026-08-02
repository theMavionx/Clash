# TH8/TH9 Guest Browser Performance — 2026-08-02

## Scope

- Local guest browser flow only; no production data or production services changed.
- Full Town Hall 8 and Town Hall 9 villages generated through the existing local admin flow.
- Browser verification covered home, TH9 defense UI, TH9 attack entry, one Mechanical Dragon
  deployment against a TH9 village with Air Bomb defenses, surrender, and return-home cleanup.
- Project target: 60 FPS (16.6 ms nominal frame budget).

## Root cause and change

The sustained TH9 slowdown was not a missing shader warmup. A complete 42-building TH9 village
crossed the browser budget when budgeted `AnimationPlayer` updates ran at 20 Hz; 15 Hz was also
insufficient once both Air Bomb defenses were present. The existing hidden combat warmup remains
enabled, while the Web animation ceiling is now the measured stable value of 10 Hz. Rendering
still runs at 60 FPS.

Air Bomb presentation was also made idempotent: unchanged reload state no longer rewrites the
four-mesh payload transform every fixed tick, and attack-zone logo direction rotates the prepared
balloon meshes instead of rebuilding ArrayMesh vertex buffers per placed defense.

## Measurements

| Scenario | Before / probe | Final | Notes |
| --- | ---: | ---: | --- |
| Full TH9, 42 buildings, two Air Bombs, 20 Hz animations | 14–16 FPS | — | Sustained, not warmup |
| Full TH9, 15 Hz animations | 18–25 FPS | — | Still below target |
| Full TH9, clean URL, 10 Hz default | — | 58–61 FPS | 24 samples; median ~60 |
| TH9 after camera zoom settles | — | 60 FPS | 12/12 samples |
| Full TH8, clean URL | — | median 60 FPS | One short 42–50 FPS batch-refresh cluster, then 59–61 |
| TH9 battle after Air Bomb launch | — | 60 FPS | 30/30 sampled readings after deployment |
| TH9 return home after surrender | — | 60 FPS | 20/20 readings; zero active troops |

The immediate deployment screenshot briefly read 48 FPS while the dragon and defense payload were
being created; the following sustained battle sample was 60 FPS throughout.

## Air Bomb impact feedback

- Impact adds `0.35` CameraRig trauma, below Demon King's `0.50` heavy-hit trauma.
- A focused production-CameraRig probe verifies that local-XY shake becomes non-zero and decays
  completely back to zero.
- The integrated projectile probe verifies exactly one shake call per impact.

## Verification

- `air_bomb_client_probe.gd`: PASS at fixed 10, 20, and 60 FPS.
- `server/test-air-bomb-combat.js`: PASS.
- `server/test-flamethrower-combat.js`: PASS.
- Godot Web release export: PASS; only the existing nested-project warning was emitted.
- Web lint: PASS with existing warnings and no errors.
- Web production build: PASS.
- `git diff --check`: PASS.

## Artifacts

- `artifacts/th8-th9-guest-performance/th8-home-final.png`
- `artifacts/th8-th9-guest-performance/th9-home-final.png`
- `artifacts/th8-th9-guest-performance/th9-defense-shop.png`
- `artifacts/th8-th9-guest-performance/th9-air-bomb-battle-final.png`
- `artifacts/th8-th9-guest-performance/th9-post-battle-final.png`

## Remaining observation

The 10 Hz Web animation ceiling is the highest cadence verified stable for the full TH9 scene in
this browser environment. Static screenshots and interaction checks showed no visual breakage, but
this pass did not record slow-motion video for subjective animation-smoothness comparison.
