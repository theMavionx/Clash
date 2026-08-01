# Flamethrower Defense — audio integration handoff

> **Scope:** presentation audio for the fixed-direction Flamethrower defense
> **Combat contract reviewed:** supplied Phase 1 GDD recovery copy and `design/technical/flamethrower-defense-architecture.md`
> **Prepared:** 2026-08-01
> **Asset policy:** reuse only existing repository audio; add no external or fabricated clip
> **Creative status:** functional integration baseline; final sonic palette and replacement assets require Audio Director approval

## 1. Intent and locked boundaries

The Flamethrower must communicate a readable three-part cycle: a short pressure/ignition tell, a forceful 0.75-second flame stream with three deterministic damage moments, and a quieter valve close/readiness reset. Audio is presentation only. It must never start a combat state, advance a timer, select a target, determine cone membership, apply damage, or become replay authority.

The approved combat cadence is fixed at 60 Hz:

- prime for 18 ticks / 0.30 seconds;
- stream for 45 ticks / 0.75 seconds;
- damage at stream offsets 0, 15, and 30 / 0.00, 0.25, and 0.50 seconds;
- next stream ready at stream start + 90 ticks / 1.50 seconds;
- Freeze can cancel prime or interrupt a committed stream without moving the ready tick;
- destruction and battle end stop every active or pending cue.

The final sonic palette has not been supplied. This document therefore does not invent a bespoke industrial/flame identity. It defines exact hooks, mix behavior, lifecycle, asset fallbacks, and a deliberately conservative local-asset baseline that can be replaced without touching combat code.

## 2. Repository audio audit

### Existing playback architecture

- `scripts/audio_manager.gd` owns global music and six non-positional `AudioStreamPlayer` SFX voices on `Master`.
- Current defense-local positional precedent is `AudioStreamPlayer3D`: Mortar uses two local 3D voices and Harpoon uses four persistent 3D voices with inverse-distance attenuation, `unit_size = 1.5`, no Doppler, deterministic pitch, and explicit cleanup.
- `scripts/fire_dragon.gd` has no flame-specific clip. It calls the shared troop attack pool with `res://Musik/sound_effects/DemonKingAttack.mp3` when breath VFX spawns. That shared troop sound is non-positional, uses six pooled `AudioStreamPlayer` voices, `-8 dB`, and random pitch `0.94-1.06`.
- The project has no authored `SFX` or `Defense` bus layout. Existing gameplay voices use `Master`.
- The existing export manifest already references every clip selected for the baseline below.

### Audited reusable sources

| Local path | Media audit | Existing use | Flamethrower baseline use |
|---|---|---|---|
| `res://Musik/sound_effects/DemonKingAttack.mp3` | 92,928 bytes; 2.904 s; stereo; 48 kHz; 256 kbps; non-looping | Fire Dragon and several heavy/fantasy troops | Combined stream ignition/bed, force-stopped at the authoritative 0.75 s end |
| `res://Musik/base/MovebildForGrid.mp3` | 4,179 bytes; 0.131 s; stereo; 44.1 kHz; 256 kbps; non-looping | Building movement | Prime/valve-state transient, repitched and kept quiet |
| `res://Musik/base/UaClick.mp3` | 2,507 bytes; 0.078 s; stereo; 44.1 kHz; 256 kbps; non-looping | UI click | Very quiet cooldown-ready latch |
| `res://Musik/base/Building_destruction1.mp3` | 92,928 bytes; 2.904 s; stereo; 48 kHz; 256 kbps; non-looping | Shared building destruction | Existing global destruction layer only; Flamethrower must not trigger a duplicate local copy |
| `res://Musik/base/Building_destruction2.mp3` | 92,928 bytes; 2.904 s; stereo; 48 kHz; 256 kbps; non-looping | Shared building destruction | Existing global destruction layer only; Flamethrower must not trigger a duplicate local copy |

The three direct Flamethrower baseline sources total 99,614 bytes, but all are already exported by `scenes/export_manifest.tscn`. Referencing them in a presentation profile adds **0 bytes of new source audio** to the current native/web content set. Duplicating them under `Musik/flamethrower/` would add redundant files and imports without changing the sound, so this handoff intentionally creates no duplicate audio directory.

The repository contains no suitable dedicated:

- pressurization or pilot-light prime;
- seamless 0.75-second flame loop;
- short aggregate heat/damage pulse;
- steam-quench Freeze interruption;
- flame-tail release.

No missing filename is specified as if it existed. Missing-content behavior is defined per event in Sections 5 and 6.

The source/provenance of existing repository audio is not documented beside these files. Reusing it does not introduce a new source, but the project's general release asset-rights audit remains required.

## 3. Recommended presentation architecture

Keep clip selection and playback outside the authoritative Flamethrower state machine. The tower emits stable presentation hooks; a Flamethrower audio presenter maps those hooks to streams and owns the voices. This preserves the technical architecture rule that gameplay code has no hardcoded clip paths.

Data flow:

```text
60 Hz Flamethrower transition/damage result
  -> stable presentation hook with authoritative tick/reason/hit summary
  -> Flamethrower audio presenter
  -> three persistent AudioStreamPlayer3D voices
```

Create these voices once per building and never allocate a player, stream, tween, timer, or temporary node per event:

| Voice | Purpose | Per-building limit | Replacement rule |
|---|---|---:|---|
| `FlamethrowerMechanismSFX` | prime, normal close, Freeze valve, ready | 1 | newest legal mechanism/status cue replaces the prior cue |
| `FlamethrowerStreamSFX` | stream start and continuous bed | 1 | one committed stream per building; stop/fade on end or interrupt |
| `FlamethrowerDamageTickSFX` | one aggregate pulse per scheduled damage tick | 1 | restart only on the next authoritative offset; never one voice per target |

All voices:

- `AudioStreamPlayer3D` on the existing `Master` bus;
- inverse-distance attenuation, `unit_size = 1.5`;
- `max_polyphony = 1` and Doppler disabled;
- `process_mode = Node.PROCESS_MODE_INHERIT` so battle pause pauses playback;
- streams loaded into shared/static caches once, not once per building;
- deterministic pitch derived from `owner_order`, `stream_start_tick`, event ID, and tick offset; never global RNG;
- no gain randomization.

At the current TH8/9 cap this is three persistent nodes. At the future TH10 two-building cap it is six. Normal audible concurrency is at most two voices per building: stream plus one tick/state transient. Do not route these events through the global six-voice `AudioManager` pool, because a long stream would occupy or steal a global UI/combat voice and would lose exact per-owner cleanup.

The presenter belongs to the stable building root, not a per-level visual wrapper. Model replacement therefore preserves the stream owner and does not duplicate voices. The muzzle transform may be refreshed from the current wrapper before playback; a missing `MuzzleSocket` uses the building center as a diagnostic presentation fallback and remains a content-validation failure.

## 4. Stable hook contract and ordering

Use the GDD telemetry names for matching transitions where they already exist. Audio consumes presentation hooks; it must not subscribe back into telemetry or server authority.

| Hook | Exact emission point | Required payload | Audio presenter action |
|---|---|---|---|
| `flamethrower_prime_start` | Successful `Ready/Scanning` or `Cooldown/Scanning -> Priming` transition | owner key/order, level, sim tick, prime-ready tick, muzzle transform | Play prime transient once |
| `flamethrower_prime_cancel` | Immediately before leaving Priming without committing a stream | sim tick, reason `empty|freeze|destroyed|battle_end` | Stop any prime layer; baseline empty cancel is silent; suppress duplicate reason cues |
| `flamethrower_stream_start` | Successful `Priming -> Firing`, after the ready tick is committed and before offset-0 damage playback | stream index, start/end/next-ready ticks, muzzle transform, facing | Start ignition/bed voice once; arm one future ready cue |
| `flamethrower_damage_tick` | Once after each authoritative scheduled damage set is resolved at offsets 0/15/30 | stream index, offset, tick index 0/1/2, hit count, ordered hit centers, empty flag | Play at most one aggregate tick cue when `hit_count > 0`; baseline has no clip and remains silent |
| `flamethrower_stream_end` | Once when the committed 45-tick stream ends or is terminated | sim tick, reason, scheduled/resolved tick counts | Fade/stop stream; play normal close only for `complete` |
| `flamethrower_interrupted` | Once for Freeze or another non-destructive forced presentation stop | sim tick, phase `priming|firing`, reason | Stop active stream within 50 ms and play at most one interruption cue |
| `flamethrower_cooldown_ready` | First simulation edge reaching the committed `next_stream_ready_tick` | ready tick, current state, frozen/permanently-disabled flags | Consume once; play, defer, or suppress under the rules below |
| `flamethrower_destroyed` | Immediately before permanent disable/removal cleanup | sim tick, tower position, prior phase | Stop every local voice and pending cue; do not play another destruction sample |
| `flamethrower_battle_end` | Battle/Town Hall victory guard before scene teardown | sim tick, reason | Silent immediate cleanup; no close, ready, or interruption cue |

The stream loop is an audio-presenter lifecycle derived from stable hooks, not a per-frame gameplay hook:

- `_start_stream_bed()` is called once from `flamethrower_stream_start`;
- it continues without retrigger while the state remains Firing;
- `_stop_stream_bed(reason)` is called once from `stream_end`, `interrupted`, `destroyed`, or `battle_end`;
- no `stream_loop` event may be emitted every simulation or render tick.

On the stream-start simulation tick, dispatch order is:

1. `flamethrower_stream_start`;
2. presenter starts the stream bed;
3. authoritative offset-0 damage resolves;
4. `flamethrower_damage_tick` with `offset = 0`.

Offsets 15 and 30 emit only their damage hooks. Normal `stream_end` occurs at `stream_start_tick + 45`. `cooldown_ready` occurs at `stream_start_tick + 90` and is armed by the committed stream, never by initial battle readiness or repeated visual reset calls.

If a new stream starts on the exact cooldown-ready tick under continuous occupancy, the ready hook may still be recorded for diagnostics, but the presenter suppresses the ready click. Ignition is the stronger and more useful state confirmation.

## 5. Baseline event specifications

Node gain values are before 3D attenuation. They are implementation starting points, not a final Audio Director mix approval.

### `flamethrower_prime_start`

- **Trigger:** one successful entry into Priming.
- **Baseline source:** `MovebildForGrid.mp3`.
- **Description:** compact valve/pilot engagement that makes the 0.30-second tell audible without promising damage.
- **Internal reference:** Harpoon wind-up remains more mechanical and prominent; this cue stays shorter/quieter.
- **Frequency target:** dry mid/high detail, roughly 700 Hz-4 kHz perceived focus, with no added sub impact.
- **Duration:** natural 0.131-second one-shot; never loop or stretch across all 18 prime ticks.
- **Gain/pitch:** `-16 dB`; deterministic pitch `0.78-0.86`.
- **Spatial:** current muzzle, fallback building center; `max_distance = 7.0`.
- **Priority:** medium; above ready, below stream and damage confirmation.
- **Voice/cooldown:** mechanism voice 1; 250 ms guard per owner/event.
- **Stop:** no tail normally. Cancel/Freeze/cleanup stops the mechanism voice if it is still active.

### `flamethrower_prime_cancel`

- **Trigger:** one Priming exit without a stream.
- **Baseline source:** none for `empty`; Freeze/destruction/battle-end behavior is owned by their higher-priority hook.
- **Description:** an empty prime cancellation should read mostly through absence of ignition, not repeated chatter.
- **Frequency/duration/gain:** no audible baseline event.
- **Voice/cooldown:** stop any prime layer once; do not start a new voice.
- **Fallback:** if a future dedicated pressure-release clip is approved, use one 0.08-0.16 s variant at `-19 to -17 dB`, pitch `0.96-1.04`, `max_distance = 6.0`, with a 300 ms cooldown. It must remain quieter than ready and must not play for Freeze, destruction, or battle end.

### `flamethrower_stream_start` and stream bed

- **Trigger:** committed `Priming -> Firing` transition.
- **Baseline source:** `DemonKingAttack.mp3`, the source already used at Fire Dragon breath spawn.
- **Description:** shared fantasy-fire attack character used as a functional ignition/roar bed. It is not a claim that this is the final building identity.
- **Internal reference:** Fire Dragon establishes the existing flame-family association; Mortar impact remains the loudness/weight ceiling and must sound heavier.
- **Frequency target:** broad flame roar with useful low-mid body around 160 Hz-1.2 kHz and controlled 2-6 kHz crackle; avoid sustained energy that masks troop attacks or battle music.
- **Duration:** start at source position 0.0 and force-stop at the authoritative 0.75-second stream end. The audited 2.904-second MP3 must never play to completion for this defense and must never be changed to loop globally.
- **Gain/pitch:** `-10 dB`; deterministic pitch `0.88-0.94`. No level-based gain or pitch increase.
- **Spatial:** sampled muzzle position at start; keep the voice attached to the stable root/muzzle during the stream; `max_distance = 12.0`.
- **Priority:** highest Flamethrower event.
- **Voice/cooldown:** stream voice 1; one start per committed stream; 500 ms duplicate guard. Combat cadence is the real limiter.
- **End:** normal end fades to `-45 dB` over 35-50 ms, then stops and clears the player stream. Freeze fades/stops within 50 ms. Destruction/battle end stops immediately after killing any active fade.
- **Loop fallback:** no dedicated seamless loop exists. The baseline deliberately treats the first 0.75 seconds of this one-shot as the bed and performs no loop seek/restart. If the source fails to load, VFX continues and the entire stream is silent; warn once per missing path, not once per shot.

### `flamethrower_damage_tick` — offsets 0, 15, 30

- **Trigger:** once after each scheduled authoritative damage-set resolution, including empty scheduled ticks.
- **Baseline source:** none. No existing clip reads as a short heat-contact pulse without sounding like Turret, Mortar, UI, or rope machinery.
- **Description:** a future cue should confirm the damage rhythm, not count targets. It is one aggregate pulse even when 45 units are hit.
- **Frequency target for future content:** short low-mid heat/body pulse around 180-900 Hz with restrained 2-5 kHz crackle; no sub-heavy explosion and no sharp firearm transient.
- **Target duration for future content:** 0.10-0.18 s so all three 0.25-second-spaced ticks remain distinct.
- **Target gain/pitch:** `-12 to -10 dB`; deterministic pitch `0.96-1.04`.
- **Spatial:** muzzle/building sector origin, not one player per target; `max_distance = 10.0`.
- **Priority:** high, below stream start and above state clicks.
- **Voice/cooldown:** tick voice 1; 180 ms guard allows offsets 0/15/30; restart at the next valid offset only.
- **Empty behavior:** hook still fires with `empty = true`, but audio is silent. Do not imply a hit when nothing was damaged.
- **Baseline fallback:** no playback, no warning, VFX damage pulses remain the feedback. The presenter still counts offsets for debug/acceptance tests.

### `flamethrower_stream_end`

- **Trigger:** one normal 45-tick completion.
- **Baseline source:** `MovebildForGrid.mp3` after the stream voice begins its fade.
- **Description:** small valve close that ends the phrase without sounding like reload completion.
- **Frequency target:** compact mid/high mechanical close; little low-frequency body.
- **Duration:** natural 0.131-second one-shot.
- **Gain/pitch:** `-18 dB`; deterministic pitch `1.05-1.13`.
- **Spatial:** muzzle/building center; `max_distance = 7.0`.
- **Priority:** low-medium.
- **Voice/cooldown:** mechanism voice 1; 250 ms guard.
- **Suppression:** play only for `reason = complete`. Freeze, destruction, battle end, and permanent disable use their own cleanup precedence and do not also play this close.

### `flamethrower_interrupted` — Freeze

- **Trigger:** one Freeze interruption during Priming or Firing. It must not be emitted each frozen tick.
- **Baseline source:** `MovebildForGrid.mp3` as a quiet valve slam. The Freeze system/VFX, not this reused clip, carries the ice identity.
- **Description:** sudden cutoff confirmation; the dominant behavior is removing the flame bed quickly.
- **Frequency target:** muted mid-band valve/catch, roughly 400 Hz-2.5 kHz; a future approved asset may add a short steam-quench tail.
- **Duration:** natural 0.131-second one-shot.
- **Gain/pitch:** `-15 dB`; deterministic pitch `0.64-0.72`.
- **Spatial:** muzzle/building center; `max_distance = 9.0`.
- **Priority:** high state cue, below destruction and stream ignition.
- **Voice/cooldown:** mechanism voice 1; one cue per interruption token; 300 ms duplicate guard.
- **Stop ordering:** kill any existing stream fade, fade/stop the stream within 50 ms, then play one interruption. If `prime_cancel(reason=freeze)` or `stream_end(reason=freeze)` arrives in the same tick, those hooks perform cleanup only and do not add another sound.

### `flamethrower_cooldown_ready`

- **Trigger:** once when an armed committed stream reaches `next_stream_ready_tick`; never at initial battle load.
- **Baseline source:** `UaClick.mp3`.
- **Description:** tiny dry latch that confirms the lane can prime again. It is deliberately local and optional in the wider battle mix.
- **Frequency target:** small high-mid click, approximately 1.5-5 kHz, with no bass.
- **Duration:** natural 0.078-second one-shot.
- **Gain/pitch:** `-21 dB`; deterministic pitch `0.82-0.90`.
- **Spatial:** building center; `max_distance = 6.0`.
- **Priority:** lowest Flamethrower cue.
- **Voice/cooldown:** mechanism voice 1; 500 ms guard and one token per committed `next_stream_ready_tick`.
- **Deferral/suppression:** while Frozen, mark one pending ready cue and play it once after thaw only if the defense is live and usable. Drop it on destruction, battle end, scene exit, or permanent disable. Suppress it when another stream starts on the same tick.

### `flamethrower_destroyed`

- **Trigger:** permanent disable at HP zero, before the tower/presenter can leave the tree.
- **Baseline source:** no Flamethrower-local source. The existing building destruction system already chooses `Building_destruction1/2.mp3`.
- **Action:** kill fades; stop all three voices immediately; clear streams, event tokens, pending ready state, and variant history.
- **Mix rule:** never call `AudioManager.play_building_destruction()` from both the building system and the presenter. One shared destruction event is the maximum.
- **Fallback:** if the global destruction cue is unavailable, destruction remains silent except for VFX; do not substitute stream start, Mortar impact, or Fire Dragon attack.

### `flamethrower_battle_end`

- **Trigger:** Town Hall victory, replay exit, battle cancellation, scene exit, or owner release.
- **Baseline source:** none.
- **Action:** immediate idempotent cleanup; no valve close, interrupt, destruction, or pending ready cue after the battle-end guard.

## 6. Reason precedence and duplicate suppression

Several gameplay hooks can describe the same state change. The presenter must resolve them by owner and simulation tick so a single cause never becomes two sounds.

| Same-tick cause | Hooks that may be observed | Audible result |
|---|---|---|
| Cone becomes empty during Priming | `prime_cancel(empty)` | Silence; stop prime layer only |
| Freeze during Priming | `prime_cancel(freeze)`, `interrupted(freeze)` | One interruption cue; no cancel cue |
| Freeze during Firing | `interrupted(freeze)`, `stream_end(freeze)` | Stop stream plus one interruption cue; no normal close |
| Destruction during Priming/Firing | cancel/end plus `destroyed` | Stop all local audio; rely on one shared building-destruction cue |
| Battle end during any phase | cancel/end plus `battle_end` | Silent cleanup; no post-victory audio |
| Ready and immediate stream start | `cooldown_ready`, `stream_start`, offset-0 tick | Stream ignition; suppress ready click; tick follows normal hit rule |

Precedence is `battle_end > destroyed > interrupted > stream_end > prime_cancel > cooldown_ready`. Cleanup calls are idempotent, and one owner/tick/reason token is consumed only once.

## 7. Mix, masking, and spatial hierarchy

All gains are on `Master` until an Audio Director-approved bus layout exists. If a future `SFX/Defense` bus is added, move all three voices together and revalidate the complete battle mix; do not silently compensate by changing every node gain at the same time.

Relative hierarchy before distance attenuation:

| Event | Baseline gain | Relationship |
|---|---:|---|
| Stream ignition/bed | `-10 dB` | Flamethrower reference; 5 dB below Mortar launch and 9 dB below Mortar impact node gain |
| Future occupied damage tick | `-12 to -10 dB` | Never louder than stream start; one aggregate cue only |
| Freeze interruption | `-15 dB` | Clear near the tower, not map-wide |
| Prime start | `-16 dB` | Readable warning, weaker than committed fire |
| Normal stream close | `-18 dB` | Local punctuation |
| Ready | `-21 dB` | Deliberately optional at normal battle zoom |

- No Flamethrower event ducks music, troop attacks, UI, or global destruction.
- Do not layer Mortar/Turret transients under the stream. The weapon's threat comes from repeated area damage, not explosive impact.
- If the reused stream masks Fire Dragon attacks or battle music, reduce the stream to `-12 dB` before increasing pitch or adding high-frequency content.
- If two future TH10 Flamethrowers overlap, do not add a global gain boost. Their independent 3D attenuation and fixed per-owner gains remain the rule.
- Strategy-camera target: stream ignition is readable at normal combat zoom; prime and interruption are readable near the defended lane; ready is local only.
- Stereo sources must remain mono-compatible after 3D spatialization. Do not enable Doppler or continuously reposition tick audio across target centers.

## 8. Variation plan

### Functional baseline

- Stream: one source, deterministic pitch `0.88-0.94`; no immediate retrigger because combat enforces 1.50 seconds between starts.
- Prime/end/interruption: one source differentiated by fixed event-specific pitch bands, never random volume.
- Ready: one source with deterministic pitch `0.82-0.90`.
- Damage ticks: no source; hook-only silent fallback.
- Level 1-10 changes damage/range/model, not the sound family, volume, or pitch. A higher level must not become louder.

### Dedicated content request for Audio Director approval

These are production needs, not filenames that currently exist:

| Content family | Variants needed | Target edited length | Required behavior |
|---|---:|---:|---|
| Prime pressure/ignition | 2 | 0.18-0.30 s | Clear tell; no damage/explosion implication |
| Stream ignition transient | 2 | 0.08-0.16 s | Strong onset that can layer with the bed |
| Seamless flame bed | 2 | 0.45-0.75 s loop region | Click-free loop; deterministic no-immediate-repeat per stream |
| Stream close/tail | 2 | 0.12-0.25 s | Normal valve/flame decay, weaker than ignition |
| Aggregate heat tick | 3 | 0.10-0.18 s | Works at 0.25 s spacing; one per occupied tick, never per target |
| Freeze quench | 2 | 0.25-0.45 s | Fast cutoff plus restrained steam/thermal shock |
| Ready latch | 2 | 0.05-0.10 s | Quiet, dry, non-UI identity |

Use deterministic no-immediate-repeat selection based on owner order and committed stream tick. Do not use global `pick_random()`/`randf_range()` from combat presentation, because replay comparison captures should remain stable.

## 9. Web, memory, and cleanup budgets

### Baseline web budget

- New source audio bytes: **0**.
- New copied/imported audio files: **0**.
- Existing shared sources referenced by the profile: 99,614 bytes total, already in the export manifest.
- Persistent player nodes: 3 per legal building; maximum 3 at TH8/9 and 6 at future TH10.
- Maximum normal audible Flamethrower voices: 2 per building / 4 for two buildings.
- No dynamic web audio element, no `web/public/audio` duplicate, and no per-target voice.

If dedicated content is later approved, keep the complete compressed Flamethrower pack at or below 160 KiB for web, prefer mono-compatible delivery, and prove that the new pack replaces rather than duplicates superseded baseline-only content references.

### Preload and pooling

- Load the three baseline streams once through a shared/static presentation cache during the existing staged warmup or the presenter's first controlled setup.
- First fire must not call `load()` for each building or each stream.
- An unloaded/missing source never blocks combat or VFX. Log one path-level warning, then use the event fallback.
- Pool exhaustion never creates an extra player. The newest legal owner event either replaces its designated one-voice channel or is skipped according to priority.

### Cleanup contract

`cleanup_audio(reason)` must:

1. be safe to call repeatedly;
2. kill all audio fades/tweens owned by the presenter;
3. stop the mechanism, stream, and tick voices;
4. clear player streams and any pending-ready/armed-ready token;
5. clear current stream/event ownership and last-tick duplicate guards;
6. disconnect presentation-hook signals before the node leaves the tree.

Call it from permanent disable, Town Hall victory, battle end, replay exit, scene exit, and owner release. A visual-wrapper/model swap must stop the active presentation if the gameplay lifecycle says the defense is interrupted, but it must not create another presenter or leak players.

## 10. Implementation parameter summary

```text
bus: Master
players_per_building: 3 persistent AudioStreamPlayer3D
attenuation: inverse distance
unit_size: 1.5
max_polyphony_per_player: 1
doppler: disabled
process_mode: inherit battle pause

prime:
  source: res://Musik/base/MovebildForGrid.mp3
  volume_db: -16
  pitch: 0.78..0.86 deterministic
  max_distance: 7.0

stream:
  source: res://Musik/sound_effects/DemonKingAttack.mp3
  volume_db: -10
  pitch: 0.88..0.94 deterministic
  max_distance: 12.0
  forced_duration: 45 ticks / 0.75 s
  normal_fade: 35..50 ms
  interrupt_fade: <=50 ms
  loop: false (baseline one-shot segment)

damage_tick:
  source: absent; silent fallback
  hooks: offsets 0, 15, 30 exactly
  audible_condition_when_content_exists: hit_count > 0
  voice_limit: 1 aggregate cue, never per target

stream_end:
  source: res://Musik/base/MovebildForGrid.mp3
  volume_db: -18
  pitch: 1.05..1.13 deterministic
  max_distance: 7.0

freeze_interrupt:
  source: res://Musik/base/MovebildForGrid.mp3
  volume_db: -15
  pitch: 0.64..0.72 deterministic
  max_distance: 9.0

ready:
  source: res://Musik/base/UaClick.mp3
  volume_db: -21
  pitch: 0.82..0.90 deterministic
  max_distance: 6.0

destruction:
  local_source: none
  behavior: stop all; existing global building destruction plays once
```

## 11. Acceptance tests

### Timing and event correctness

1. With continuous occupancy and prime beginning at tick `P`, the trace is prime once at `P`, stream start once at `P+18`, damage hooks at `P+18`, `P+33`, and `P+48`, normal stream end once at `P+63`, and ready at `P+108` unless suppressed by an immediate new stream.
2. The stream presenter starts once and runs continuously for 45 simulation ticks. It is never retriggered from `_process()`, `_physics_process()`, VFX particle updates, target membership changes, or the three damage hooks.
3. Offset 0 dispatches after stream start on the same simulation tick. A future tick transient never cuts off or restarts the stream voice because it owns a separate channel.
4. A scheduled empty damage tick emits one hook with `empty = true`, produces no baseline tick audio, and does not stop/refund the stream.
5. One hit and 45 simultaneous hits both use one aggregate damage-tick voice. Voice/node count is independent of hit count.

### Cancellation, Freeze, ready, and destruction

6. A target leaving during prime emits one empty cancel, no stream, no damage hooks, no ready token, and no audible cancel chatter.
7. Freeze before stream start cancels prime, plays at most one interruption cue, and produces no stream or damage sound.
8. Freeze after offset 0 stops the stream within 50 ms, prevents later tick hooks through gameplay authority, plays at most one interruption cue, suppresses the normal close, and preserves the committed ready tick.
9. If ready is crossed while Frozen, exactly one ready cue is deferred to thaw when the defense is usable. Destruction or battle end drops it.
10. Continuous occupancy that starts another stream exactly at the ready tick suppresses the ready click and plays only the new ignition plus the normal offset-0 hook.
11. Destruction in any phase stops all local voices on the same simulation step and results in exactly one existing global building-destruction cue, not one global plus one local duplicate.
12. Town Hall victory/battle end produces no later stream tail, damage tick, close, interruption, or ready cue.

### Determinism, lifecycle, spatial mix, and web

13. The same owner order, event ID, stream tick, and offset produce the same source selection/pitch in live local play and replay capture. No combat audio path consumes global RNG.
14. Pause freezes the three positional players with combat. Resume continues or completes them without duplicating hooks.
15. Repeated prime/fire/Freeze/destroy/replay-exit cycles create no additional audio nodes and leave zero playing Flamethrower voices after cleanup.
16. At normal combat zoom, stream ignition is audible but remains below nearby Mortar impact in perceived weight; prime/ready do not mask troop attacks or battle music.
17. Moving the camera beyond each event's `max_distance` makes that event inaudible; no non-positional duplicate remains through `AudioManager`.
18. Native and web exports load the three baseline paths without missing-resource warnings, add no copied audio resource, and show no first-fire per-shot `load()` or node-allocation spike.
19. Removing any optional future clip from the profile produces the documented silent fallback, one warning at most, intact VFX/combat, and no repeated error spam.
20. A missing `MuzzleSocket` falls back to building-center spatial playback with a diagnostic, while the existing content validator still blocks final asset acceptance.

## 12. Known limitation and replacement path

The baseline shares a general heavy attack clip with Fire Dragon and cannot provide a bespoke pressure-fed defensive flame identity. It also leaves damage ticks silent because every existing short alternative falsely reads as a gunshot, explosion, UI click, or rope/mechanism hit. This is preferable to misleading combat feedback.

When the Audio Director approves a final palette, replace only the presentation profile's stream table and tune within the hierarchy above. Keep the stable hook names, exact tick ordering, one aggregate damage voice, deterministic variation, attenuation, voice limits, ready deferral, duplicate suppression, and cleanup contract unchanged unless a separately approved technical/audio revision says otherwise.
