# Town Hall 10 Cannon aiming playtest

Date: 2026-08-08
Branch: `main`

## Result

PASS. The retained Town Hall roof Cannon now tracks ground targets horizontally
and lowers its barrel for nearby targets without moving the authored base or
passing the barrel through the roof railing.

## Implementation

The runtime hierarchy now follows the existing ordinary Cannon convention:

1. `Cannon1Base_001` remains fixed with all authored supports and decoration.
2. `TownHallCannonPivot1` provides horizontal yaw below that fixed base.
3. `TownHallCannonPitchPivot1` uses the barrel AABB centre as its trunnion.
4. Only `Cannon1_001`, its muzzle, and recoil presentation move.

The barrel tracks yaw at the ordinary Cannon's authored speed. Vertical tracking
uses a 180-degree/second slew, an 8-degree upward limit and a collision-safe
15-degree downward limit. Firing waits until the combined yaw/pitch error is
inside the existing five-degree Cannon tolerance.

## Verification

| Check | Result |
| --- | --- |
| Town Hall Cannon headless client probe | PASS; fixed base, yaw, close-target pitch, muzzle, recoil and hits |
| Rendered frame-by-frame playtest | PASS; 45 frames, two shots, maximum pitch 15 degrees |
| Manual contact-sheet inspection | PASS; no visible roof/railing intersection during a roughly 60-degree yaw sweep or firing |
| Ordinary Cannon behavior test | PASS |
| Cannon L1-L7 visual/progression regression | PASS |
| Authoritative TH10 server combat test | PASS; 840 damage, 1.60-second cadence, ward 882 |

Rendered evidence:

- `.codex-artifacts/town-hall-cannon-frames/contact_sheet.png`
- `.codex-artifacts/town-hall-cannon-frames/tracking_yaw_tick_005.png`
- `.codex-artifacts/town-hall-cannon-frames/tracking_yaw_tick_010.png`
- `.codex-artifacts/town-hall-cannon-frames/tracking_yaw_tick_015.png`
- `.codex-artifacts/town-hall-cannon-frames/tracking_yaw_tick_020.png`
- `.codex-artifacts/town-hall-cannon-frames/report.md`
