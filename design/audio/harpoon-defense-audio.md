# Harpoon Defense — implementation-ready audio handoff

> **Scope:** Phase 3 presentation audio for `scripts/tower_harpoon.gd`
> **Combat contract:** `design/gdd/harpoon-defense.md`
> **Prepared:** 2026-07-31
> **Asset policy:** reuse only audio already present in this repository; add no external sample

## 1. Intent and constraints

Harpoon must read as a heavy mechanical control defense, not as another high-DPS cannon. The audible hierarchy is: readable 0.45-second lock, strong but short launch, precise hook/tension contact, restrained reel during the maximum 0.80-second pull, then a quick retract. The seven-second reload ends with a quiet local ready click.

The project does not currently contain dedicated rope, chain, winch, or reel assets, and no Harpoon-specific sonic palette has been approved by the Audio Director. This handoff therefore defines a shippable local-asset baseline. It deliberately avoids importing new copyrighted material. The source/provenance of the repository's existing audio is not documented beside the files, so a general release asset-rights audit is still required; this feature does not increase that risk by adding a new source.

Audio is presentation-only. It must never advance timers, choose targets, apply damage, reserve troops, or seed authoritative randomness. Pausing combat pauses the Harpoon audio nodes; Freeze and cleanup explicitly stop active mechanism audio.

## 2. Recommended architecture

Keep Harpoon audio on the Harpoon scene/controller, not in the global `AudioManager`. Existing defense code already owns local SFX, and the mechanic needs positional launch/impact placement plus exact lifecycle cleanup.

Create four persistent `AudioStreamPlayer3D` voices once in `_ready()`:

| Voice | Purpose | Per-tower concurrency | Replacement rule |
|---|---|---:|---|
| `HarpoonMechanismSFX` | wind-up, reel, retract | 1 | newest mechanism phase replaces prior phase after a 25-40 ms fade |
| `HarpoonLaunchSFX` | launch transient | 1 | restart only on an authoritative `fire`; natural seven-second spacing prevents normal overlap |
| `HarpoonHookSFX` | hook/tension contact at target | 1 | newest valid impact replaces; 100 ms cooldown |
| `HarpoonStatusSFX` | ready/interruption click | 1 | newest status cue replaces; 150 ms cooldown |

Preload all streams into static caches, following `tower_mortar.gd`. Do not allocate or free players, streams, tweens, or temporary nodes per shot. One Harpoon is legal at TH6-TH7 and a second unlocks at TH8; voice limits remain per building so two legal instances, test scenes, and replay restores cannot create unbounded overlap.

All voices use the existing `Master` bus because this project currently has no authored SFX/Defense bus layout. If the Audio Director later creates `SFX/Defense`, move all four voices together; do not change the gains below at the same time.

Use inverse-distance 3D attenuation, `unit_size = 1.5`, and no Doppler tracking. The defense and target move too little for Doppler to add value. Recommended `max_distance` is listed per event. Sounds must be inaudible beyond `max_distance`, and must remain mono-compatible for the elevated strategy camera.

## 3. Local source assets

| Local path | Harpoon use | Notes |
|---|---|---|
| `res://Musik/base/MovebildForGrid.mp3` | wind-up start, retract, soft interruption | Existing very short mechanical placement sound; repitching separates its Harpoon uses. |
| `res://Musik/sound_effects/Turret/Turret_Attack1.mp3` | launch variant A | Already shipped and pre-imported. Lower pitch/gain so Harpoon does not read as rapid Turret fire. |
| `res://Musik/sound_effects/Turret/Turret_Attack2.mp3` | launch variant B | Alternate launch transient. Use deterministic no-immediate-repeat selection. |
| `res://Musik/base/sounds of mixing were heard on the network.mp3` | hook/tension and pull/reel | Existing short mechanical/grinding source already used for grid-step feedback. Do not globally change its import loop setting. |
| `res://Musik/base/UaClick.mp3` | reload-ready click | Existing tiny click. Keep very quiet and spatial so it does not read as UI input. |

Do not use `mortar_launch.mp3` or `mortar_impact.mp3` for Harpoon. Their explosive identity masks the low-impact control role and makes the 100/140 damage sound stronger than it is. Do not use the prototype `frame.wav` files; they are capture audio attached to rendered prototype frames, not source SFX.

## 4. Event specifications

The dB values are player-node `volume_db` values before 3D attenuation. Pitch choices are cosmetic. For replay-stable variation, derive them from a hash of `owner_order`, `sim_tick`, and event ID instead of consuming global RNG.

### `harpoon_windup_start`

- **Trigger:** first entry into `HarpoonState.WINDUP`, exactly where `harpoon_lock` and `_emit_visual_state("windup")` occur.
- **Source:** `MovebildForGrid.mp3`.
- **Description:** short pawl/catch engagement; announces that the target is reserved without implying damage.
- **Target duration:** source one-shot only; never loop or retrigger during the 27 wind-up ticks.
- **Frequency character:** compact mid/high mechanical click, with no added sub impact.
- **Gain/pitch:** `-13 dB`; deterministic pitch `0.82-0.90`.
- **Spatial:** tower/muzzle position, `max_distance = 8.0`.
- **Priority:** medium-high; above ready/reload, below launch and hook.
- **Concurrency/cooldown:** mechanism voice limit 1; 250 ms cooldown.
- **Stop:** fade 25 ms on lock cancel, fire, Freeze, disable, upgrade, or scene exit.

### `harpoon_launch`

- **Trigger:** committed launch in `_fire_projectile()`, immediately after `_reload_ready_tick` is set and at the same semantic point as `_emit_visual_state("fire")`.
- **Sources:** Turret Attack 1/2, deterministic alternating/no-immediate-repeat.
- **Description:** weighty spring/bolt release with a controlled transient; it must be less explosive and less bright than Turret at close range.
- **Target duration:** natural one-shot, approximately a short launch transient; do not loop or tail-extend.
- **Frequency character:** low-mid mechanical thunk plus a restrained upper transient; no mortar-like low-frequency blast.
- **Gain/pitch:** `-6 dB`; pitch `0.74-0.82`. Level 2 may add `+0.02` pitch maximum, but must not be louder.
- **Spatial:** muzzle position sampled at fire, `max_distance = 12.0`.
- **Priority:** highest Harpoon event.
- **Concurrency/cooldown:** launch voice limit 1; 200 ms cooldown. The combat reload remains the real limiter.
- **Stop:** normally play to completion. Stop immediately only on battle teardown; Freeze after fire does not erase the already-heard launch.

### `harpoon_hook_tension`

- **Trigger:** every valid `harpoon_impact`, immediately after damage is applied/recorded and before kill/inside-ring/pull branching.
- **Source:** `sounds of mixing were heard on the network.mp3`.
- **Description:** compact metal/rope catch. It confirms contact even when impact kills the target or the target is already inside the stop ring.
- **Target duration:** one short transient. Never loop.
- **Frequency character:** mid-band bite around the perceived rope latch; suppress the low end through gain/pitch choice rather than new middleware.
- **Gain/pitch:** `-10 dB`; pitch `1.16-1.24`.
- **Spatial:** authoritative `_projectile_position`/target impact position, `max_distance = 10.0`.
- **Priority:** high, directly below launch.
- **Concurrency/cooldown:** hook voice limit 1; 100 ms cooldown.
- **Stop:** natural completion; stop on teardown only.

### `harpoon_pull_reel`

- **Trigger:** successful transition to `HarpoonState.PULL`, exactly where `harpoon_pull_start` and `_emit_visual_state("pull_start")` occur.
- **Source:** `sounds of mixing were heard on the network.mp3`, played at a lower pitch than the hook.
- **Description:** short strained reel/grind under the moving target. It should communicate tension, not stun or damage-over-time ticks.
- **Target duration:** one-shot started once per pull. Do not restart per 60 Hz pull tick and do not alter the shared MP3 import to loop. The pull is at most 0.80 seconds; silence at the end is preferable to a clicking MP3 loop.
- **Frequency character:** low-mid mechanical strain with reduced high-frequency bite compared with hook contact.
- **Gain/pitch:** `-15 dB`; pitch `0.74-0.84`.
- **Spatial:** tower/muzzle position, `max_distance = 9.0`.
- **Priority:** medium.
- **Concurrency/cooldown:** mechanism voice limit 1; no retrigger until the current pull ends.
- **Stop:** 30 ms fade on every `_end_pull()` reason, reservation loss, target death, Freeze, building disable/upgrade, battle end, or scene exit.

### `harpoon_retract`

- **Trigger:** visual retract begins after `pull_end`, `projectile_lost`, `impact_kill`, or `impact_only`.
- **Source:** `MovebildForGrid.mp3`.
- **Description:** quick return ratchet that closes the launch-hook-pull phrase and hands off to silent reload.
- **Target duration:** one-shot. It need not cover the entire distance-dependent visual retract; the transient marks its start.
- **Frequency character:** lighter/faster mid-high mechanism than wind-up.
- **Gain/pitch:** `-14 dB`; pitch `1.06-1.16`.
- **Spatial:** tower/muzzle position, `max_distance = 8.0`.
- **Priority:** medium-low.
- **Concurrency/cooldown:** mechanism voice limit 1; 120 ms cooldown. Stop/fade the reel before starting retract on the same voice.
- **Stop:** natural completion; replace with wind-up if a later legal cycle somehow starts while it is still playing.

### `harpoon_ready`

- **Trigger:** once when a committed shot's reload crosses `reload_ready_tick`; never at battle start and never from repeated `reset_ready()` presentation calls.
- **Source:** `UaClick.mp3`.
- **Description:** tiny latch seating. This is local state confirmation, not a map-wide notification.
- **Target duration:** natural micro one-shot.
- **Frequency character:** small dry click, no bass.
- **Gain/pitch:** `-18 dB`; pitch `0.78-0.88`.
- **Spatial:** tower position, `max_distance = 6.0`.
- **Priority:** low.
- **Concurrency/cooldown:** status voice limit 1; one cue per `_reload_ready_tick`, 500 ms guard.
- **Stop/defer:** if reload completes while Frozen/disabled, mark it pending and play once after `freeze_end` only when the defense is usable. Drop it on permanent disable, battle end, or teardown.

### `harpoon_interruption`

- **Trigger:** active control ends abnormally: `lock_cancel`, Freeze during wind-up/projectile/pull, reservation loss, target invalidation, combat-bounds stop, upgrade, or building disable.
- **Source:** `MovebildForGrid.mp3` for audible soft release; silence for permanent building disable if the normal destruction sound is already playing.
- **Description:** small mechanism release; the important behavior is stopping the active wind-up/reel, not adding a dramatic rope snap.
- **Target duration:** one short one-shot.
- **Frequency character:** muted mid click, intentionally weaker than hook/retract.
- **Gain/pitch:** `-17 dB`; pitch `0.62-0.72`.
- **Spatial:** tower/muzzle position, `max_distance = 7.0`.
- **Priority:** low-medium.
- **Concurrency/cooldown:** status voice limit 1; 150 ms cooldown. Emit no second interruption when `_end_pull(reason)` and `freeze_start` happen in the same simulation tick.
- **Stop behavior:** first fade/stop the mechanism voice in 25-30 ms. `projectile_lost`, `impact_kill`, and `impact_only` use retract instead of interruption. `duration` and `stop_ring` are successful pull endings, not interruptions.

## 5. Exact `tower_harpoon.gd` integration hooks

The implementer should keep event playback in a private presentation helper such as `_handle_audio_event(event_name, payload)` and call it from the existing authoritative transition sites. Do not subscribe audio back into server/replay telemetry.

| Code location | Audio action |
|---|---|
| `_ready()` after `_apply_stats()` | preload shared streams and create the four persistent 3D players; set `process_mode` to inherit combat pause |
| `_step_tracking()` after successful reservation and `harpoon_lock` | play `harpoon_windup_start` once |
| `_cancel_windup(reason)` before target identity is cleared | fade mechanism; play `harpoon_interruption` for `target_invalid`, `yaw_break`, or `reservation_lost` |
| `_fire_projectile()` after committed reservation and reload tick assignment | fade wind-up; play `harpoon_launch`; arm exactly one ready cue for the new `_reload_ready_tick` |
| `_impact_target()` immediately after `harpoon_impact` is recorded | play `harpoon_hook_tension` at `_projectile_position` for all valid impacts |
| `_impact_target()` after successful `begin_harpoon_pull` | play `harpoon_pull_reel` once; never from `_step_pull()` |
| `_impact_target()` kill/inside-stop-ring branches | after hook, stop mechanism and play `harpoon_retract` |
| `_lose_projectile(reason)` | stop mechanism and play `harpoon_retract`; do not play hook |
| `_end_pull(reason, ...)` before `_release_target()` clears identity | fade reel; play retract for `stop_ring`/`duration`; play one interruption then retract only for abnormal reasons if both layers remain intelligible—baseline should use interruption only for Freeze/upgrade/disable and retract for target/bounds endings |
| `_simulation_step()` on the edge `_sim_tick >= armed_ready_tick` | play `harpoon_ready` once, or defer it while Frozen; clear the armed flag so 30 Hz `_update_visuals()` cannot repeat it |
| Freeze exit transition | if a ready cue became pending while Frozen and the tower is usable, play it once; otherwise clear it |
| `freeze_for()` / `_interrupt_active_control("freeze")` | fade wind-up/reel; play at most one interruption cue; do not stop an already-triggered launch transient |
| `cleanup_defense_visuals()` and `_exit_tree()` | stop every Harpoon voice, kill audio fades, clear streams/ready flags; do not emit a teardown click |

Important implementation detail: `_emit_visual_state("pull_end")` currently receives no `reason`, and `_release_target()` clears target identity. Handle reason-sensitive audio inside `_end_pull()` before release, or extend the private presentation payload; do not infer the reason later from the visual state.

Important ready-edge detail: `_update_visuals()` can call `reset_ready()` repeatedly while reload is complete. The sound must be armed on `_fire_projectile()` and consumed once by simulation tick crossing, never driven by `reset_ready()` or `visual_state_changed(ready)`.

## 6. Mix and masking rules

- Launch peak is the Harpoon reference at `-6 dB`; hook is 4 dB below it, reel 9 dB below it, and ready 12 dB below it before distance attenuation.
- No Harpoon event ducks music, troop voices, or global battle SFX. The one-defense cap and seven-second launch spacing make ducking unnecessary.
- If launch masks Fire Dragon attack audio, reduce Harpoon launch to `-8 dB` before changing pitch. Do not raise hook/reel to compete.
- Do not layer Mortar or building-destruction lows under launch. The mechanic's damage is intentionally low and must sound precise rather than explosive.
- On a normal full cycle, the only overlap allowed is the tail of launch with flight, then hook with the first instant of reel. Wind-up must stop before launch, and reel must stop before retract/interruption.
- Strategy-camera readability target: launch and hook remain clear at normal combat zoom; wind-up/reel are readable only near the affected base; ready is deliberately local.

## 7. Variation and deterministic playback

- Launch: two variants, strict no-immediate-repeat. A stable choice such as `(owner_order + fire_tick / 420) % 2` is sufficient.
- All other events: one local source with the pitch ranges above. Hash pitch from authoritative IDs/ticks for replay stability; do not call global `randf_range()` from combat code.
- Level 2 changes physical strength, not the sound family. A tiny launch pitch lift of at most `+0.02` is allowed; no level-based gain increase.
- Do not randomize volume. Distance attenuation already supplies sufficient natural variation and fixed gain makes mix regressions testable.

## 8. Acceptance checks

1. First shot produces exactly: wind-up once, launch once, hook once, reel once when pull starts, then retract once.
2. A target leaving during wind-up produces no launch/hook/reel, stops wind-up within 30 ms, and gives one soft interruption at most.
3. A projectile miss/lost target produces launch then retract, with no hook or reel.
4. Impact kill and inside-stop-ring impact both produce hook then retract, with no reel.
5. Pull ending by stop ring or duration fades reel and produces one retract. Freeze during pull stops reel immediately and produces at most one interruption.
6. Reload-ready plays once per committed shot, never at initial battle load and never once per visual update frame.
7. Reload finishing during Freeze defers one ready click until thaw; permanent disable drops it.
8. Pause freezes ongoing positional audio timing with the battle; resume does not duplicate events.
9. Ground troops never cause Harpoon audio because they never enter the Harpoon state machine.
10. Repeated test cycles create no new audio nodes and leave no playing voice after `cleanup_defense_visuals()`/scene exit.
11. At normal camera distance, launch is below nearby Mortar impact in perceived weight; hook/reel do not mask Fire Dragon attacks or battle music.
12. Native and web exports load every listed local stream without missing-resource warnings.

## 9. Known limitation and upgrade path

The current local assets can provide a functional, readable baseline, but they cannot deliver a bespoke braided-rope/wooden-winch identity without source editing or new recordings. If the Audio Director later approves a dedicated palette, replace only the stream table while retaining event names, gain hierarchy, spatial settings, concurrency, deterministic selection, and lifecycle hooks from this document.
