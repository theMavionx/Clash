# Hidden Tesla — local-asset audio handoff

> Scope: presentation audio for `scripts/tower_hidden_tesla.gd`
> Combat contract: `design/gdd/hidden-tesla-town-hall-10.md`
> Asset policy: reuse repository audio only; audio never drives simulation

## Intent and available sources

Hidden Tesla needs two readable cues: a compact mechanical reveal and a sharp
electrical shot. The repository has no dedicated Tesla or lightning samples, so
this is a shippable local-asset baseline, not a new sonic-palette decision.

| Event | Existing stream | Why this source | Measured source length |
|---|---|---|---:|
| Reveal hatch/rise | `res://Musik/base/sounds of mixing were heard on the network.mp3` | Existing short mechanical/grid mechanism; its duration closely fits the 30-tick rise | 0.696 s |
| Electric shot | `res://Musik/sound_effects/DemonKingAttack.mp3` | Already assigned to the Mechanical Dragon's lightning attack, preserving the project's established electric-attack vocabulary | 2.904 s |

The shot source is much longer than Tesla's 0.65-second cadence. It must run on
one persistent voice with replacement, never as overlapping full tails. This
keeps the leading strike transient while avoiding a growing wash of five or
more copies per tower.

## Event specification

### `hidden_tesla_reveal_started`

- Trigger once, after the authoritative state changes from `HIDDEN` to
  `REVEALING`; proximity and 51-percent reveal use the same cue.
- Emit from the Tesla root/hatch position using one `AudioStreamPlayer3D`.
- Gain: `-13 dB`; pitch: deterministic `1.16–1.24` from building order and
  reveal tick. This makes the 0.696-second mechanism approximately 0.56–0.60
  seconds long, matching the 0.50-second rise with a restrained mechanical
  tail.
- Frequency role: low-mid mechanism texture behind the combat transient layer;
  it must not mask troop attacks or fight music.
- Do not replay on `hidden_tesla_reveal_complete`, save restore, visual rebind,
  replay seek, or switching the village preview directly to `ACTIVE`.

### `hidden_tesla_fire`

- Trigger on the exact local presentation fire tick, immediately before or
  after spawning `HiddenTeslaLightning`; never trigger from visual-frame
  interpolation or the damage callback.
- Emit from `TeslaMuzzle`, falling back to the existing muzzle fallback point.
- Gain: `-15 dB`; deterministic pitch `1.18–1.28` from building order, fire
  tick, and a fixed salt.
- Frequency role: short, bright attack onset. The VFX supplies the perceived
  arc length; the sound must read as a single-target snap, not chain lightning.
- If this tower's shot voice is already playing, stop/restart it. No tail may
  overlap the next 39-tick shot.

## Spatialization and voice limits

Both voices are persistent children of the Tesla controller and use:

- `AudioStreamPlayer3D.ATTENUATION_INVERSE_DISTANCE`;
- bus `Master` (the project has no authored defense/SFX bus yet);
- `unit_size = 1.5`, `panning_strength = 0.75`;
- Doppler disabled;
- `process_mode = PROCESS_MODE_INHERIT`;
- `max_polyphony = 1` per voice.

Use `max_distance = 9.0` for reveal and `12.0` for shots. TH10 legally permits
two Teslas, so the feature has at most four live voices during the brief first
shot/reveal-tail overlap and normally only two shot voices. Do not allocate
players, streams, tweens, or temporary audio nodes per shot. Cache both streams
once statically, matching the defense patterns in `tower_harpoon.gd` and
`tower_mortar.gd`.

Tesla's authoritative 39-tick reload is also its audio throttle. Do not add a
second time-based cooldown that could suppress a valid fire event. Two legal
Teslas firing on the same tick may both sound so spatial direction remains
readable; stress-test instances still stay bounded by one shot voice each.

## Lifecycle, Freeze, and cleanup

- Freeze while `ACTIVE` prevents future fire events, but does not stop a shot
  transient that already began.
- Freeze during `REVEALING` does not stop or restart the reveal cue because the
  current combat contract continues the reveal animation.
- `DESTROYED`, battle victory/defeat cleanup, `cleanup_defense_visuals()`, and
  `_exit_tree()` stop both players and clear their streams.
- `rebind_visuals()` only moves the audio origin with the controller; it never
  plays a cue.
- Headless mode skips player creation entirely, following `audio_manager.gd`,
  so Godot probes do not keep MP3 playback resources alive at shutdown.
- Master-bus mute remains authoritative. Do not bypass it or call web music
  JavaScript for positional defense SFX.

## Minimal gameplay-presenter patch required

`tower_hidden_tesla.gd` currently spawns lightning but contains no audio paths,
players, loading, playback, or cleanup. The smallest maintainable patch is:

1. Add the two paths and tuning constants above, static cached streams, and two
   `AudioStreamPlayer3D` fields.
2. In `_ready()`, skip headless audio; otherwise load shared streams and create
   `HiddenTeslaRevealSFX` and `HiddenTeslaShotSFX` once.
3. Call `_play_reveal_sfx()` only from `_begin_reveal()` after the state change.
4. Call `_play_shot_sfx(_muzzle_global_position())` from `_fire_at_target()` on
   the same tick as `_spawn_lightning_arc(...)`.
5. Add `_stop_all_sfx(clear_streams: bool)` to `mark_destroyed()`,
   `_play_victory()`, `cleanup_defense_visuals()`, and `_exit_tree()`; use
   `clear_streams = true` only for terminal cleanup.
6. Derive pitch deterministically; do not call `randf()` because replay capture
   should sound stable even though audio remains non-authoritative.

No server change, replay-schema change, new audio asset, or `AudioManager`
change is required.

## Verification checklist

- Reveal cue plays exactly once for proximity and once for the 51-percent test.
- Hidden idle, replay restore, visual rebind, and direct village `ACTIVE` mode
  remain silent.
- First shot starts only after tick 30; each later cue follows valid fire ticks
  at 39-tick intervals.
- Two Teslas firing together create two spatial shot voices, not accumulating
  long source tails.
- Ground/air targets use identical single-target audio; no secondary sound is
  created by the lightning VFX branches.
- Freeze blocks new shot cues; destruction and battle cleanup leave no playing
  `HiddenTesla*SFX` nodes.
- Desktop, web, and mobile remain bounded to two persistent voices per Tesla;
  headless verification exits without audio-resource leak diagnostics.
