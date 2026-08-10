# Playtest Report — Hidden Tesla Hatch

## Session Info

- **Date**: 2026-08-08
- **Build**: local `main` worktree
- **Duration**: targeted 82-frame visual simulation plus TestMain verification
- **Tester**: Codex visual review
- **Platform**: Windows PC, Godot 4.6 stable, OpenGL Compatibility
- **Input Method**: automated fixed-tick simulation and rendered TestMain
- **Session Type**: targeted animation regression

## Test Focus

Verify the complete Hidden Tesla reveal with independently animated gold hatch
mounts: closed silhouette, both panel arcs, tower traversal clearance, final
20-degree pose, individual L1-L10 base fit, and the production TestMain flow.

## First Impressions

- **Understood the goal?** Yes
- **Understood the controls?** Not applicable
- **Emotional response**: Clear and mechanically coherent
- **Notes**: Each level now has an authored panel pivot, traversal pivot, gold
  scale, and gold offset instead of sharing one AABB-derived placement.

## Gameplay Flow

### What worked well

- Frames 0–14 show two synchronized, mirrored panel arcs with no floating parts.
- The panels first reach a full-tower clearance pose. The tower rises only
  after that opening is clear, then the panels settle beside the lower supports.
- Frames 18-30 keep the tower and hatch separated throughout the rise.
- Final L1-L10 closeups show no gold/tower contact and no excessive L10 gap.
- The TestMain pose is centered and readable, and the real Attack-button flow
  still hides, reveals, targets, damages, and re-hides the Tesla correctly.

### Pain points

- The original combined meshes did not allow independent placement of the gold
  mounts. Deterministic Blender extraction resolved this. Severity: Resolved.

### Confusion points

- None remain in the reveal sequence. The restored gold mounts are visually
  distinct from the gold details already authored into higher-level towers.

### Moments of delight

- The restored gold pieces now reinforce the hinge motion without obscuring the
  tower emergence at the island camera distance.

## Bugs Encountered

| # | Description | Severity | Reproducible |
|---|---|---|---|
| 1 | Previous gold hatch parts appeared detached during reveal | Medium | Yes; resolved by independent moving meshes |
| 2 | Shared full-AABB pivot caused contact or excessive gaps between levels | Medium | Yes; resolved with per-level final and traversal pivots |
| 3 | Tower began rising before panels cleared its widest upper geometry | Medium | Yes; resolved with staged open/rise/settle timing |
| 4 | Freed warmup audio voices caused typed-argument GDScript errors | Medium | Yes; resolved with lifecycle-safe voice recreation |
| 5 | Forced TestMain shutdown reports two baseline GL texture leak messages | Low | Yes; test-process shutdown only |

## Feature-Specific Feedback

### Hidden Tesla reveal

- **Understood purpose?** Yes
- **Found engaging?** Yes
- **Suggestions**: Preserve the current five-mesh presentation and tower-side
  placement of both gold mounts.

## Quantitative Data

- **Rendered frames reviewed**: 82
- **Per-level reveal-pose renders reviewed**: 60 (6 poses x 10 levels)
- **Reveal duration**: 30 fixed ticks
- **Representative levels**: 1, 5, 10
- **Static geometry levels**: 1 through 10
- **Production mesh instances per level**: 5
- **Asset verifier failures**: 0
- **Client probe failures**: 0
- **TestMain result**: PASS

## Overall Assessment

- **Visual verdict**: PASS
- **Reference fidelity**: Gold mounts are restored on top of the opened hatch,
  at the panel edge nearest the Tesla, matching the supplied reference intent.
- **Pacing**: Good

## Top 3 Priorities from this session

1. Preserve the clean mirrored panel animation.
2. Keep both restored gold mounts parented to the authored hatch pivots.
3. Recheck scale and readability if the island camera changes.
