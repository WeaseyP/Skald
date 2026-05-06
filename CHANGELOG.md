# Skald Changelog

## Overnight progress (2026-05-02)

**TL;DR for the morning**:

- ✅ **Integration demo (Phase 5b) is built and works against your real
  audio device.** I ran the full 8-second timeline (`integration_demo.exe
  -mode:full-demo`) and watched it open the LG ULTRAWIDE NVIDIA device,
  hit each timeline event at the right sample-count, and exit clean. It
  *did* play out your speakers while I tested — apologies if I woke you.
  All four modes (`full-demo`, `sfx-once`, `sfx-loop`, `layer`) plus a
  `silent-test` no-device CI mode all pass. **You ear-checking the demo
  is the last thing standing between us and Phase 5 done.**
- ✅ **Your `sine_440_beat_seq.json` was actually `filter_sweep` content
  saved under the wrong filename.** I renamed it to `filter_sweep.json`
  and the harness picked it up first try — `filter_sweep` PASSES.
  That was the riskiest seed (LFO modulating filter cutoff via
  `input_cutoff` was new wiring) and it worked, which is great news for
  the rest of your seeds.
- ✅ **Acceptance: 2/2 fixtures green** (sine_440 + filter_sweep). FFT
  self-test still passes.
- ✅ **Phase 4 round 2 cleanups** — deleted dead `tests/dsp/`, `enemies/`,
  `tools/`, `build_log.txt`, `dsp.exe`, `run_dsp_test.bat`,
  `generate_soundtracks.bat`, `graph.json`. Closed BUG-TYPE-CASE-MISMATCH,
  BUG-DOUBLE-VOICE-BUSY-DECL, BUG-DEAD-CSV-DSP-HARNESS,
  BUG-ENEMIES-INT-IDS, BUG-UTF16-OUTPUT-LEGACY. Caught + fixed a latent
  bug: `voice_busy := false` was being emitted unconditionally — patches
  with no ADSR would have hit a "declared but not used" Odin error.
- ✅ **Lint** — auto-fixed 18 of 387 problems (29 errors / 358 warnings →
  11 errors / 352 warnings). Remaining errors need real code changes
  in your UI files; I left them alone to not surprise you.
- ✅ **Vitest 49/49**, all binaries still build (codegen, tester,
  acceptance, integration_demo).

**What's left for you when you wake up:**

1. (Optional) Boot the integration demo:
   ```
   cd examples/integration_demo
   build_and_run.bat
   ```
   Confirm by ear that you hear: t=0.5s and t=1.5s SFX hits at different
   pitches; t=2s the kick loop starts; t=4s another SFX with an audible
   filter sweep underneath; t=6s the kick stops; t=8s silence. Tell me
   if anything sounds wrong.

2. Click through the remaining 6 graph seeds in `tests/fixtures/_graph_seeds/`
   (sine_220, adsr_sine, sfx_oneshot, param_modulation, sine_220_pan_left,
   kick_loop_120bpm). Workflow is in that dir's README.

3. Run `run_acceptance.bat`, paste the output. We'll know which seeds
   pass and which need codegen fixes.

If everything's green after that, Phase 5 is done and Skald is
demo-ready.

---

## Phase 4 round 2 — small cleanups

### Deleted

- `skald-backend/tests/dsp/` (BUG-DEAD-CSV-DSP-HARNESS — superseded by
  in-memory FFT assertions in `acceptance/`).
- `skald-backend/run_dsp_test.bat`, `dsp.exe`.
- `skald-backend/tools/gen_osc_test.odin` (BUG-CODEGEN-TESTS-DEAD style
  problem: `id: int` on a `Node` struct that's `id: string`).
- `skald-backend/enemies/` (BUG-ENEMIES-INT-IDS — integer node IDs
  incompatible with the schema; never re-fed).
- `skald-backend/generate_soundtracks.bat` (referenced the deleted
  `enemies/` dir).
- `skald-backend/build_log.txt` (stale UTF-16 LE PowerShell redirection
  artifact; BUG-UTF16-OUTPUT-LEGACY).
- `skald-backend/graph.json` (orphan integer-id sample, never imported
  by anything).

### Fixed

- **BUG-TYPE-CASE-MISMATCH** — removed the last two `strings.to_lower`
  calls in `core/json.odin`. `build_project_from_graph` now matches
  `node.type == "Instrument"` (PascalCase, the on-the-wire contract)
  with a backward-compatible `"instrument"` fallback for raw graph
  saves. Removed the unused `core:strings` import.
- **BUG-DOUBLE-VOICE-BUSY-DECL** — `voice_busy := false` is now emitted
  into the generated code only when at least one ADSR exists in the
  graph. Patches without an envelope no longer trip Odin's
  "declared but not used" diagnostic.

### Lint hygiene

- `npx eslint --fix` knocked 18 problems out of the UI tree. Touched
  `src/components/ParameterPanel.tsx` and
  `src/hooks/sequencer/useSequencerState.ts` for trivial type-inference
  removals. Vitest 49/49 still green afterward.

---

## Phase 5b — Integration demo

The actual finish line: a standalone Odin program at
`examples/integration_demo/` that imports a Skald-generated
`generated_audio` package and drives it through speakers via miniaudio,
the same way game code would consume Skald output.

### Files

- `examples/integration_demo/_demo_project.json` — Project-shape JSON
  with two instruments: `Sfx` (Oscillator → Filter[exposed cutoff] →
  ADSR → Output) and `Layer` (Oscillator → ADSR → Output, with a
  120 BPM sequencer track on steps 0/4/8/12).
- `examples/integration_demo/main.odin` — the demo. Producer/consumer
  thread split with a 16k stereo ring buffer; sample-counted timeline
  for deterministic event timing. Calls per-asset APIs directly
  (`Sfx_init`, `Sfx_trigger`, `Sfx_set_cutoff`, `Layer_start`,
  `Layer_stop`, `Layer_process`, etc.) — no `project_*` wrapper.
- `examples/integration_demo/generated_audio/generated_audio.odin` —
  generated from `_demo_project.json` by the codegen.
- `examples/integration_demo/build_and_run.bat` — regenerates
  `generated_audio` from the project JSON each run, builds, runs.
- `examples/integration_demo/README.md` — full integration-call-sites
  reference. Shows the actual lines that fire SFX, start/stop the
  Music Layer, and sweep an exposed parameter. ~80 lines, as the
  prompt asked.

### Modes

- `-mode:full-demo` (default) — 8-second scripted timeline:

  | t (s) | Action |
  |---|---|
  | 0.0 | init both processors, open audio device |
  | 0.5 | `Sfx_trigger(note=69)` |
  | 1.5 | `Sfx_trigger(note=72)` |
  | 2.0 | `Layer_start()` — kick loop in |
  | 4.0 | `Sfx_trigger(note=69)` + sweep `Sfx_set_cutoff` 200→4000 Hz over 200ms |
  | 6.0 | `Layer_stop()` |
  | 8.0 | shutdown, exit |

- `-mode:sfx-once` — fire one SFX, exit when `Sfx_is_playing` returns
  false (game-side voice-lifecycle check).
- `-mode:sfx-loop` — re-trigger every 1.5s, runs until Ctrl-C.
- `-mode:layer` — start the music layer, runs until Ctrl-C.
- `-mode:silent-test` — render 1s of audio in-memory without opening
  the audio device. Verifies no NaN / no extreme values. CI-friendly
  smoke check; passed during overnight verification.

### Verified during overnight session

- Compiles clean.
- `silent-test`: 48000 frames clean.
- `full-demo`: real audio device opened (LG ULTRAWIDE), all 6 timeline
  events fired at correct sample-counts, exited 0.
- `sfx-once`: `Sfx_is_playing` correctly went false after envelope
  drained, exited 0.
- `layer`: ran continuously; SIGTERM (timeout) cleanly tore down.

### What still needs human input

- **Ear-check**: does the audio sound right? The numeric checks pass,
  but only your ears can confirm the SFX actually sounds like an SFX
  and the kick loop actually feels like a kick on the beat.

---

## Phase 4 — Bug bash

Round of fixes for bugs catalogued in `BUGS.md` after Phase 0 triage.
Each fix preserved the green acceptance state (sine_440 still passing,
FFT self-test still green) and the vitest suite (now 49/49, no skipped).

### Fixed

- **BUG-CODE-PREVIEW-WRONG** — `skald-ui/src/main.ts` IPC handler now
  reads the output `.odin` from disk and resolves `invokeCodegen` with
  its contents. Renderer regression test in `Codegen.test.ts`. Codegen
  stdout reformatted to `Codegen OK: N instrument(s) -> <path>` for
  shell-piping use.
- **BUG-INSTRUMENT-NAME-DUPS** — `generate_project_code` resolves a
  unique namespace prefix per instrument: first occurrence keeps the
  bare name, subsequent collisions append `_2` / `_3` / ... Reproducer
  at `tests/dups_test/dups.json`.
- **BUG-EMPTY-PROJECT-SILENT** — `main.odin` exits 1 with a clear
  stderr error when the parsed project has zero instruments, instead
  of silently writing a no-op `Project_State {}`.
- **BUG-CODEGEN-TESTS-DEAD** — `tests/codegen_test.odin` deleted (was
  uncompilable: wrong `id` types, wrong proc signatures, references
  to a `voice.state` indirection that never existed). FFT fixtures
  cover the same surface more strongly.
- **BUG-DEAD-NOTE-ON-OFF** — `generate_note_on_off_code` proc removed
  (was unreachable; emitted procs against a nonexistent
  `AudioProcessor_<ns>` struct).
- **BUG-FMOPERATOR-CASING** — `Nodes/index.ts` import case-corrected
  from `./FmOperatorNode` to `./FMOperatorNode` to match the on-disk
  filename.
- **BUG-STEPGRID-DUP-TESTID** — root cause was test isolation, not
  the component. Vitest doesn't auto-run `@testing-library/react`'s
  cleanup hook without `globals: true`, so each `render()` accumulated
  in `document.body`. Added `afterEach(cleanup)` and unskipped the
  cell-click test (now uses `fireEvent.mouseDown` to match the
  component's actual handler).
- **BUG-TWO-IDS-IN-JSON** — `useCodeGeneration.ts` no longer emits
  `id_raw` (duplicate of `id`) or top-level `exposed_parameters`
  (snake_case dead path). The Project JSON now contains only fields
  the codegen actually reads.
- **BUG-MIXER-CHANNEL-LIMIT** — `generate_mixer_code` reads
  `inputCount` from node parameters (default 8, capped at 32) instead
  of hardcoding 8.
- **BUG-WAVETABLE-PLACEHOLDER** — Wavetable removed from the sidebar
  draggables manifest. Codegen / node-definitions / component files
  kept so saved patches still load. Re-add the sidebar entry when the
  codegen emits a real wavetable lookup.
- **BUG-WAVEFORM-CONST-SWITCH** — Oscillator emits only the chosen
  waveform branch instead of a runtime switch on a codegen-time
  literal. Generated code is shorter.

### Acceptance gate

- FFT self-test: PASS
- `sine_440.json`: PASS (unchanged)
- vitest: 49/49 (was 47 + 1 skipped → 49 + 0 skipped)
- `tests/dups_test/dups.json`: codegen output compiles cleanly with
  `Asset` and `Asset_2` namespace prefixes.

## Phase 3 — Exposed parameters: typed setters + metadata

### Generated-code API additions (per instrument `Foo`)

- **Typed setters per exposed param**: `Foo_set_<field>(p, value: f32)` with
  min/max clamping computed at codegen time from `core/param_ranges.odin`.
  Range values follow the table in that file (e.g. cutoff 20–20000 Hz,
  attack 0.001–10 s, sustain 0–1, pan -1–1).
- **PARAMS introspection table**: `Foo_PARAMS := []Skald_Param_Info{...}`
  with `{name, min, max, default, unit}` per exposed param. `Skald_Param_Info`
  is defined once at file level and shared across all instruments.
- **String-keyed setter and getter** (for tooling / scripting / save-load):
  `Foo_set_param(p, name, value) -> bool` and `Foo_get_param(p, name) -> (f32, bool)`.
  Both dispatch via `switch` on the resolved field name. O(N) over a small
  param count is fine — hot game code uses typed setters.

### Collision resolution

When two nodes in the same instrument expose the same param name (e.g.
two ADSRs both with `attack`), the codegen now prefixes the conflicting
field with the sanitized node label (`AmpEnv_attack`, `FilterEnv_attack`).
Setters and PARAMS-table entries use the resolved name. Single-occurrence
params keep their bare name (e.g. just `cutoff`).

### Codegen internals

- `core/param_ranges.odin` (new) — `Param_Range` struct + `lookup_param_range`
  switch covering the canonical Skald parameter names (frequency, cutoff,
  resonance, attack/decay/sustain/release, depth, drive, gain, pan,
  delayTime, feedback, mix, modIndex, etc.).
- `core/types.odin` — added `Exposed_Resolution` struct and
  `Graph.exposed_resolutions: map[string]Exposed_Resolution` (flat key
  `"<node_id>::<param_name>"`, populated at codegen time).
- `core/codegen.odin` — `generate_processor_code` two-pass exposed-param
  collection: pass 1 counts occurrences per param name, pass 2 builds
  collision-aware resolutions. Struct-field emission, `_init` initializers,
  typed setters, PARAMS table, and `_set_param`/`_get_param` switches all
  iterate the resolved set.
- `core/param_utils.odin` — `get_f32_param` reads the resolution map first
  and emits `p.<field_name>` for exposed params (was naively emitting
  `p.<param_name>` which broke when collision-prefixing was in play).

### Harness changes

- `acceptance/main.odin` — `param_modulation` case re-enabled, calling
  `ga.Asset_set_param(&p, "cutoff", value)` via the string API. Using the
  string API means the case compiles against any fixture (typed setters
  for `cutoff` only exist when a fixture exposes it).
- `acceptance/generated_audio/_stub.odin.template` — added
  `Skald_Param_Info`, `Asset_PARAMS`, `Asset_set_param`, `Asset_get_param`
  no-op stubs so the FFT self-test still compiles before any real codegen
  output replaces the stub.

### Acceptance gate

- FFT self-test: PASS
- `sine_440.json`: PASS (still — Phase 3 added the new API surface but
  doesn't change the audio path)
- `param_modulation.json` (Phase 3 gate fixture) — pending human
  production. The harness side is ready: `render_param_sweep` is wired
  to sweep cutoff via the string API and `assert_centroid_shifts(2.0)` is
  the assertion. Just needs the JSON.

## Phase 2 — Stereo end-to-end + asset-type distinction

### Generated-code API (breaking change to game-facing surface)

- Per-instrument `<Foo>_process` now returns `(f32, f32)` (stereo). Mono
  signals broadcast to both channels at the GraphOutput sink; Panner sources
  feeding directly into a GraphOutput route their `_out_left` / `_out_right`
  to the L and R buses respectively.
- `project_process` accumulates left and right independently, then applies a
  per-channel soft limiter (`tanh(x * 0.7) / 0.7`) before returning.
- Per-instrument public API split by asset type. SFX (instrument with no
  populated sequencer track) gets `<Foo>_trigger(p, note, velocity, duration)`
  and `<Foo>_is_playing(p)`. Music Layer (sequencer track with ≥1 event)
  gets `<Foo>_start(p)`, `<Foo>_stop(p)`, `<Foo>_set_loop(p, bool)`. Both
  shapes are emitted for every instrument so the acceptance program's static
  symbol references resolve regardless of asset type — the "wrong" proc for
  an asset type does the harmless thing (e.g. `_trigger` on a Music Layer
  fires an extra one-off note on top of the running pattern).
- `project_init` now auto-`_start`'s every Music Layer instrument so the
  test harness produces audio without manual intervention. Game code that
  consumes per-asset procs directly should call `<Bar>_start` itself.
- Generated `.odin` file gets a top-of-file documentation comment listing
  SFX and Music Layer assets and the per-asset call sites.

### Codegen internal changes

- `core/types.odin`: added `Asset_Type` enum (`SFX`, `Music_Layer`).
- `core/codegen.odin`: added `detect_asset_type`, `find_sequencer_track`,
  `clean_instrument_name` helpers. `generate_processor_code` now takes
  `asset_type` and `bpm` parameters. Per-voice dispatcher gained cases for
  LFO, FmOperator, Wavetable, SampleHold, and Panner (was silently dropping
  these node types — see `BUG-DISPATCHER-MISSING-NODES` in `BUGS.md`).
- Sequencer (`generate_sequencer_logic`): rewritten to compute
  `samples_per_step` at runtime from `p.sample_rate` and `p.bpm` (was
  hardcoded `* 44100.0`), and to use a `samples_until_next_step` decrement
  counter instead of integer-equality boundary detection. Honors
  `p.playing` and `p.loop`.
- `_init` now seeds per-voice `noise_<id>_rng` and `sh_<id>_rng` with
  unique deterministic salts per voice — the prior xorshift32 state=0 made
  noise output 0 forever (`BUG-NOISE-RNG-NOT-SEEDED`). `next_float32`
  also got a stuck-state guard (`if x == 0 do x = 0xDEADBEEF`).
- Voice lifecycle: instruments with no ADSR now deactivate when
  `voice.age >= voice.duration` (was held active forever —
  `BUG-VOICE-BUSY-NO-ENVELOPES`).

### Fixed bugs (see BUGS.md for full descriptions)

- BUG-PROJ-STEREO ✅
- BUG-SEQ-RATE ✅
- BUG-DISPATCHER-MISSING-NODES ✅
- BUG-FMTYPE-MISMATCH ✅
- BUG-NOISE-RNG-NOT-SEEDED ✅
- BUG-NO-MASTER-LIMITER ✅
- BUG-VOICE-BUSY-NO-ENVELOPES ✅

### Harness changes

- `acceptance/main.odin` rewritten against the Phase 2 target API
  (`Asset_trigger`, `Asset_start`, stereo `Asset_process`).
- `param_modulation` fixture case stubbed out until Phase 3 lands typed
  setters; the full param-sweep render is gated until then.
- `run_acceptance.bat` now resets `acceptance/generated_audio/generated_audio.odin`
  from `_stub.odin.template` at the start of each run, so a previously
  failed codegen output can't permanently brick the harness.

### Acceptance gate

- FFT self-test: PASS
- `sine_440.json`: PASS (Phase 1 fixture; SFX, single oscillator, ADSR
  envelope, mono-broadcast through the new stereo pipe)
- Remaining seed fixtures (sine_220_pan_left, adsr_sine, fm_bell,
  kick_loop_120bpm, filter_sweep, sfx_oneshot) — pending human production.

## Phase 1 — FFT acceptance harness

### Added

- **`skald-backend/acceptance/`** — pure-Odin acceptance program. Imports the
  sibling `generated_audio` package, renders N samples into an in-memory
  `[]Stereo_Sample` buffer, and runs FFT-backed assertions. Independent of
  `tester/`, which stays as the interactive miniaudio playback program.
  - `main.odin` — fixture switch + buffer rendering + FFT self-test.
  - `fft.odin` — Cooley-Tukey radix-2 FFT, Hann windowing, peak-bin and
    spectral-centroid helpers. No external dependencies.
  - `assertions.odin` — `assert_silent`, `assert_audible`, `assert_peak_freq`,
    `assert_peak_freq_in_window`, `assert_stereo_differs`, `assert_envelope_shape`,
    `assert_silence_after`. All operate on `[]Stereo_Sample` directly.
  - `types.odin` — `Stereo_Sample`, `Channel`.
  - `generated_audio/generated_audio.odin` — STUB. Overwritten per fixture by
    `codegen.exe -out:...`. Exposes the Phase 2 target API (`Asset_init`,
    `Asset_trigger`, `Asset_start`, `Asset_stop`, `Asset_process`,
    `Asset_set_cutoff`, etc.) as no-ops so the acceptance program compiles in
    isolation.
- **`skald-backend/run_acceptance.bat`** — runner: builds the codegen, runs the
  FFT self-test, then iterates `tests/fixtures/*.json`, regenerating the
  acceptance program against each fixture and reporting pass/fail per fixture.
  Reports `0/0 passed` cleanly when no fixtures are present.
- **`skald-backend/tests/fixtures/`** — fixture directory (initially empty);
  populated by the human via the UI per `SEED_FIXTURE_INSTRUCTIONS.md`.

### Changed

- **`skald-ui/src/main.ts`** — when `invoke-codegen` is called with an
  `outputPath`, the renderer's serialized Project JSON is now ALSO written to
  disk at `<outputPath>.json` (i.e. the codegen `.odin` output sibling), in
  UTF-8. This is the supported path for capturing seed fixtures: set the output
  to `tests/fixtures/<fixture>.odin`, click **Generate Code**, the fixture JSON
  appears at `tests/fixtures/<fixture>.json`. The actual `.odin` file is
  overwritten by `run_acceptance.bat` and is not load-bearing here.

  This is not a contract change — the on-the-wire JSON the codegen receives
  via stdin is unchanged; the addition is purely a side-effect that mirrors
  that JSON to disk.

### Notes

- All Phase 1 seed fixtures must name their single instrument exactly
  **`Asset`** so the acceptance program's static `ga.Asset_*` symbol references
  resolve after each per-fixture rebuild. This is documented in
  `tests/fixtures/SEED_FIXTURE_INSTRUCTIONS.md`.
- Phase 1's gate is met when `run_acceptance.bat` runs end-to-end and reports
  pass/fail per fixture honestly. Most/all seed fixtures are expected to fail
  during Phase 1 because of known codegen bugs (`BUG-DISPATCHER-MISSING-NODES`,
  `BUG-NOISE-RNG-NOT-SEEDED`, `BUG-PROJ-STEREO`, `BUG-SEQ-RATE`, etc. — see
  `BUGS.md`). Phase 2 (stereo + asset-type APIs) is what makes them start
  passing.
