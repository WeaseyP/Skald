# Skald integration demo

This is what consuming a Skald-generated `.odin` package looks like from a
real game. The demo plays audio through your speakers via miniaudio,
driving two assets — one **SFX** (one-shot, runtime-tunable) and one
**Music Layer** (looping pattern) — using the per-asset APIs Skald
generates. The convenience `project_*` wrapper is *not* used; that's a
test-harness affordance only.

## Running it

From this directory:

```
build_and_run.bat
```

That regenerates the `generated_audio` package from `_demo_project.json`,
compiles the demo, and runs the default `full-demo` mode (8-second
scripted timeline). Override the mode:

| Mode | Behavior |
|---|---|
| `-mode:full-demo` (default) | Scripted 8s timeline (see below) |
| `-mode:sfx-once` | Fire one SFX, exit when its envelope finishes |
| `-mode:sfx-loop` | Re-trigger SFX every 1.5s, runs until Ctrl-C |
| `-mode:layer` | Start the music layer, runs until Ctrl-C |
| `-mode:silent-test` | Render 1s of audio in-memory (no audio device), exit 0 if no NaN/Inf. CI smoke check. |

## Full-demo timeline

```
t=0.0s  init Sfx and Layer, open audio device
t=0.5s  Sfx_trigger(note=69 A4)         — first one-shot
t=1.5s  Sfx_trigger(note=72 C5)         — second one-shot, different pitch
t=2.0s  Layer_start()                   — drum loop kicks in (kicks on steps 0/4/8/12)
t=4.0s  Sfx_trigger + cutoff sweep      — fires SFX, then sweeps Sfx_set_cutoff
                                          200→4000 Hz over 200ms (the live filter
                                          shows up in the SFX as it plays)
t=6.0s  Layer_stop()                    — drum loop halts; voices in mid-envelope release
t=8.0s  shutdown                        — main thread exits, audio device closed
```

## What's in `_demo_project.json`

Two instruments, fed through `codegen.exe` to produce
`generated_audio/generated_audio.odin`:

- **Sfx** (SFX): Oscillator (saw, 220Hz) → Filter (lowpass, cutoff exposed)
  → ADSR (snappy attack, 200ms release) → GraphOutput. Exposes `cutoff` so
  game code can sweep the filter at runtime.
- **Layer** (Music Layer): Oscillator (sine, 60Hz — kick body) → ADSR
  (very short envelope) → GraphOutput. Sequencer track at 120 BPM with
  notes on steps 0, 4, 8, 12 (= once per beat).

## Game integration call sites

Look at `main.odin` for the actual API usage. Highlights:

```odin
// Once at startup, after audio device init:
ga.Sfx_init(&app.sfx, f32(SAMPLE_RATE))
ga.Layer_init(&app.layer, f32(SAMPLE_RATE))

// SFX one-shot:
ga.Sfx_trigger(&app.sfx, 69, 1.0, 0.4)
//             ^processor ^note ^velocity ^duration (0=play to natural release)

// Music Layer transport:
ga.Layer_start(&app.layer)         // resets to step 0 and starts playing
ga.Layer_stop(&app.layer)          // halts; mid-envelope voices release
ga.Layer_set_loop(&app.layer, false) // play once then auto-stop

// Runtime parameter modulation (typed setter, fast):
ga.Sfx_set_cutoff(&app.sfx, cutoff_hz)

// Or via the string API (slower, useful for editor/scripting):
ga.Sfx_set_param(&app.sfx, "cutoff", cutoff_hz)
val, ok := ga.Sfx_get_param(&app.sfx, "cutoff")

// Per-frame in your audio callback (this demo uses a producer thread + ring buffer):
sfx_l, sfx_r     := ga.Sfx_process(&app.sfx)
layer_l, layer_r := ga.Layer_process(&app.layer)
final_l := (sfx_l + layer_l) * mix_gain
final_r := (sfx_r + layer_r) * mix_gain

// Lifecycle check (true while any voice is non-idle OR layer.playing):
if !ga.Sfx_is_playing(&app.sfx) {
    // safe to re-trigger or release the slot
}
```

## Regenerating after editing `_demo_project.json`

`build_and_run.bat` regenerates on every run. To hand-regenerate:

```
cd ..\..\skald-backend
.\codegen.exe -in:..\examples\integration_demo\_demo_project.json -out:..\examples\integration_demo\generated_audio\generated_audio.odin -package:generated_audio
```

The generated file ends up at `generated_audio/generated_audio.odin` and
includes a header comment listing the SFX assets, Music Layer assets, and
the integration call sites — so consumers know what's there without
opening the source.
