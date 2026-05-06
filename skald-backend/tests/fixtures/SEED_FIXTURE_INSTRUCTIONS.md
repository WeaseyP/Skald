# Skald seed fixture instructions

These six JSON files are the ground truth the Phase 1 acceptance harness
measures every codegen change against. They MUST come out of the running
Skald UI — not be hand-rolled — because the only way to know a fixture
exercises the real graph→codegen→Odin pipeline is to put it through that
pipeline once.

Once you've produced these six files, drop them in `tests/fixtures/`
(this directory). Then run, from `skald-backend/`:

```
run_acceptance.bat
```

You should see one `--- Fixture: <name> ---` block per file. Most of
them will fail today (known Phase 2 bugs — see `BUGS.md`). That's
expected. The point of having the fixtures present, regardless of pass
state, is so subsequent phases have an honest report to drive bug
fixes.

---

## Hard invariants (read first)

These rules apply to **every** fixture below. The harness cannot survive
violations.

1. **The single instrument must be named exactly `Asset`** (capital A,
   ASCII, no trailing space). The acceptance program references
   `Asset_init`, `Asset_trigger`, `Asset_start`, `Asset_process`, etc.
   by name. Different name → "ACCEPTANCE BUILD FAILED" for that fixture
   forever, even after Phase 2 lands. Case matters.

2. **One instrument per fixture**, and one sequencer track at most. The
   one-track-per-instrument invariant is intentional in the codegen.

3. **Don't change BPM** unless the fixture instructions say to. Phase 1
   timing assertions use BPM-derived sample counts; off-by-one BPM means
   off-by-one timing.

4. **Save through Generate Code, not Save**. The "Save" button writes
   the React-Flow graph shape, which the codegen rejects. "Generate
   Code" with an output path set will, with the small `main.ts` change
   landed in Phase 1, also write the Project JSON next to the `.odin`
   file at `<output>.json`. That `.json` file IS the fixture.

5. **Fixture filenames are exact**. The runner globs `*.json` and
   passes the bare filename (without `.json`) to the acceptance program,
   which switches on it. `sine_440.json` → fixture name `sine_440`. A
   typo means "unknown fixture" and the harness exits 3.

---

## Capture workflow (do this for every fixture)

1. Start the UI: `cd skald-ui && npm start`. It will rebuild the
   codegen via the prestart script, so the binary at
   `skald-ui/skald_codegen.exe` is in sync.

2. Build the patch on the canvas.

3. Drag-select all of the patch's nodes (output included). Click
   **Create Instrument** in the sidebar. Type **`Asset`** (case-sensitive)
   when prompted. The selected nodes collapse into a single instrument
   node on the canvas.

4. If the fixture is a **Music Layer** (the recipe says so), open the
   Sequencer Dock at the bottom and add a track for the `Asset`
   instrument. Set steps and place notes per the recipe.

5. In the sidebar's **Generation** section, click **Select Output
   File** and navigate to
   `Skald/skald-backend/tests/fixtures/`. Type the fixture filename
   with a `.odin` extension — e.g. `sine_440.odin`. (The `.odin` file
   is throwaway; the runner overwrites it. The sibling `.json` written
   beside it is the fixture.)

6. Leave the Package Name field as `generated_audio`.

7. Click **Generate Code**. Watch the renderer console (DevTools is
   open by default) for the line
   `[Skald] Wrote codegen input JSON to ...sine_440.json`. That
   confirms the fixture was saved.

8. Verify: open the saved `.json` in a text editor. The top should be
   `{ "project": { "bpm": ..., "instruments": [...] } }` — Project
   shape. If it starts with `{ "nodes": [...] }`, it's the React-Flow
   shape — that's the **wrong** flow (you used Save, not Generate).

When all six are saved, run `run_acceptance.bat` from `skald-backend/`
and post the output in this conversation so I can see what passes and
what fails.

---

## Fixture 1 — `sine_440.json` (SFX)

**Goal**: A pure 440Hz sine triggered as a one-shot. Validates that the
SFX entrypoint works at all and that the FFT correctly identifies the
fundamental.

**Type**: SFX (no sequencer track).

**Nodes**:

| # | Node       | Parameters                                         |
|---|------------|----------------------------------------------------|
| 1 | Oscillator | `waveform: Sine`, `frequency: 440`, `amplitude: 0.5` |
| 2 | ADSR       | `attack: 0.05`, `decay: 0.05`, `sustain: 0.9`, `release: 0.5` |
| 3 | Output     | (no parameters)                                    |

**Connections**:
- Oscillator `output` → ADSR `input`
- ADSR `output` → Output `input`

**Sequencer**: none.

**Exposed parameters**: none.

**Filename**: `sine_440.json`.

---

## Fixture 2 — `sine_220_pan_left.json` (SFX, stereo)

**Goal**: 220Hz sine panned hard-left. Validates the stereo path
end-to-end (panner output reaches the L bus and the R bus is near-silent)
and that the pitch is correct.

**Type**: SFX.

**Nodes**:

| # | Node       | Parameters                                         |
|---|------------|----------------------------------------------------|
| 1 | Oscillator | `waveform: Sine`, `frequency: 220`, `amplitude: 0.5` |
| 2 | ADSR       | `attack: 0.05`, `decay: 0.05`, `sustain: 0.9`, `release: 0.5` |
| 3 | Panner     | `pan: -1.0`                                        |
| 4 | Output     | (no parameters)                                    |

**Connections**:
- Oscillator `output` → ADSR `input`
- ADSR `output` → Panner `input`
- Panner `output` → Output `input`

> ⚠️ **UI uncertainty**: I haven't confirmed how the Panner node
> connects to the Output node in the current UI — specifically whether
> Panner exposes a single `output` port that gets stereo-routed
> internally, or two ports `output_left`/`output_right` that need
> separate edges into Output. If you see two ports on Panner, please
> connect both: `output_left` → Output `input_left` and
> `output_right` → Output `input_right`. Flag back if the UI doesn't
> have those handles — that's a real UI bug to file.

**Sequencer**: none.

**Exposed parameters**: none.

**Filename**: `sine_220_pan_left.json`.

> 🐛 **This fixture WILL fail through Phase 1** because of
> `BUG-PROJ-STEREO` and `BUG-DISPATCHER-MISSING-NODES`. Phase 2
> resolves both. Save it anyway — that's the whole point.

---

## Fixture 3 — `adsr_sine.json` (SFX with finite duration)

**Goal**: 440Hz sine with a clear ADSR shape, triggered with a finite
duration so the release phase fires and audio returns to silence.
Validates `assert_envelope_shape` and `assert_silence_after`.

**Type**: SFX.

**Nodes**:

| # | Node       | Parameters                                         |
|---|------------|----------------------------------------------------|
| 1 | Oscillator | `waveform: Sine`, `frequency: 440`, `amplitude: 0.5` |
| 2 | ADSR       | `attack: 0.1`, `decay: 0.1`, `sustain: 0.5`, `release: 0.3` |
| 3 | Output     | (no parameters)                                    |

**Connections**:
- Oscillator `output` → ADSR `input`
- ADSR `output` → Output `input`

**Sequencer**: none.

**Exposed parameters**: none.

**Filename**: `adsr_sine.json`.

> The acceptance program triggers this with `duration: 0.6s`, so the
> envelope hits Release at t=0.6s. Total envelope duration ≤ 0.9s; the
> harness asserts silence in [1.5s, 2.0s].

---

## Fixture 4 — `fm_bell.json` (SFX, FM operator)

**Goal**: An FM bell — carrier oscillator + FM operator with ratio 3.5
and modulation index 200. Validates that the FM path produces sidebands
(not a degenerate sine), and that the carrier is at A4 = 440Hz.

**Type**: SFX.

**Nodes**:

| # | Node        | Parameters                                                      |
|---|-------------|-----------------------------------------------------------------|
| 1 | Oscillator  | `waveform: Sine`, `frequency: 440`, `amplitude: 0.5` (this is the carrier) |
| 2 | FM Operator | `frequency: 3.5` (ratio), `modIndex: 200`                       |
| 3 | ADSR        | `attack: 0.01`, `decay: 0.5`, `sustain: 0.0`, `release: 0.5`    |
| 4 | Output      | (no parameters)                                                 |

**Connections**:
- FM Operator `output` → Oscillator `input_freq` (the modulator drives the carrier's frequency input)
- Oscillator `output` → ADSR `input`
- ADSR `output` → Output `input`

> ⚠️ **UI uncertainty**: I'm not sure whether the FM Operator node in
> the current UI has a separate `input_mod` port to receive a modulator
> source, or whether the operator is "self-contained" (its own internal
> sine modulating the carrier via `frequency` ratio). The codegen path
> at `core/codegen.odin:227-263` reads from a port named `input_mod`,
> which suggests there's an external modulator input. For this fixture,
> if there's an `input_mod` port on FM Operator, leave it unconnected —
> we want the operator running at its self-modulating default. If the
> UI requires it connected, please flag and I'll iterate.

**Sequencer**: none.

**Exposed parameters**: none.

**Filename**: `fm_bell.json`.

> 🐛 **This fixture WILL fail through Phase 1** because of
> `BUG-FMTYPE-MISMATCH` (FM Operator state never allocated) and
> `BUG-DISPATCHER-MISSING-NODES` (FM Operator never dispatched). Phase 4
> bug-bash work after Phase 2 resolves both.

---

## Fixture 5 — `kick_loop_120bpm.json` (Music Layer)

**Goal**: A drum-loop-style Music Layer at 120 BPM with kicks on steps
0, 4, 8, 12 of a 16-step pattern. At 120 BPM with a 16th-note step,
each step = 0.125s and `samples_per_step` at 48 kHz is exactly 6000
(integer-clean), so any timing drift is a real bug not a rounding
artifact.

**Type**: Music Layer (sequencer track REQUIRED).

**BPM**: set the global BPM in the sidebar to **120**.

**Nodes**:

| # | Node       | Parameters                                                |
|---|------------|-----------------------------------------------------------|
| 1 | Oscillator | `waveform: Sine`, `frequency: 60` (low thud, ~B1)         |
| 2 | ADSR       | `attack: 0.001`, `decay: 0.08`, `sustain: 0.0`, `release: 0.08` |
| 3 | Output     | (no parameters)                                           |

**Connections**:
- Oscillator `output` → ADSR `input`
- ADSR `output` → Output `input`

**Sequencer track**:
- Steps: 16
- Notes (one each at velocity 1.0): step 0 → MIDI 36, step 4 → MIDI 36,
  step 8 → MIDI 36, step 12 → MIDI 36 (kick = C2 = MIDI 36).
- (If the UI's note input takes pitch differently, the important
  thing is just that you place a note in steps 0, 4, 8, 12 with
  identical velocity. The pitch doesn't matter for the timing
  assertion.)

**Exposed parameters**: none.

**Filename**: `kick_loop_120bpm.json`.

> 🐛 **This fixture WILL fail timing through Phase 1** because of
> `BUG-SEQ-RATE` (codegen hardcodes 44100Hz). Phase 2c resolves it.

---

## Fixture 6 — `filter_sweep.json` (Music Layer with LFO)

**Goal**: A sustained tone with an LFO modulating the filter cutoff.
Validates LFO + Filter via the spectral-centroid-shifts assertion.

**Type**: Music Layer.

**BPM**: any BPM (default 120 is fine).

**Nodes**:

| # | Node       | Parameters                                                  |
|---|------------|-------------------------------------------------------------|
| 1 | Oscillator | `waveform: Sawtooth`, `frequency: 220`, `amplitude: 0.5`    |
| 2 | LFO        | `waveform: Sine`, `frequency: 0.5`, `amplitude: 2000`        |
| 3 | Filter     | `type: LowPass`, `cutoff: 2000`, `resonance: 1.0`            |
| 4 | ADSR       | `attack: 0.01`, `decay: 0.0`, `sustain: 1.0`, `release: 0.1` |
| 5 | Output     | (no parameters)                                             |

**Connections**:
- Oscillator `output` → Filter `input`
- LFO `output` → Filter `input_cutoff` (the LFO modulates cutoff)
- Filter `output` → ADSR `input`
- ADSR `output` → Output `input`

**Sequencer track**:
- Steps: 16
- Notes: a single sustained note at step 0, MIDI 60 (C4), with
  duration spanning the full pattern (or 16 steps, whichever the UI
  supports). The acceptance program renders 2 seconds of audio, so
  one long note across the full sequence is what we want.

**Exposed parameters**: none.

**Filename**: `filter_sweep.json`.

> 🐛 **This fixture WILL fail through Phase 1** because of
> `BUG-DISPATCHER-MISSING-NODES` (LFO never dispatched). Phase 4
> resolves it (after Phase 2 lands the dispatcher restructure).

---

## Optional Fixture 7 — `param_modulation.json` (used in Phase 3)

This one isn't required for the Phase 1 gate — it lights up the
exposed-parameters validation in Phase 3. You can skip it and produce
it later with the same workflow.

**Goal**: An SFX where `cutoff` is exposed; the acceptance program
sweeps `Asset_set_cutoff` from 200 → 4000 Hz over 2 seconds and asserts
the spectral centroid in the second half is ≥ 2× the first half.

**Type**: SFX.

**Nodes**:

| # | Node       | Parameters                                                  |
|---|------------|-------------------------------------------------------------|
| 1 | Oscillator | `waveform: Sawtooth`, `frequency: 220`, `amplitude: 0.5`    |
| 2 | Filter     | `type: LowPass`, `cutoff: 800`, `resonance: 1.0` — **EXPOSE `cutoff`** |
| 3 | ADSR       | `attack: 0.01`, `decay: 0.0`, `sustain: 1.0`, `release: 0.1` |
| 4 | Output     | (no parameters)                                             |

To expose: select the Filter node, open the parameter panel, click the
small link icon next to **Cutoff**. The icon should change state to
indicate exposure.

**Connections**:
- Oscillator `output` → Filter `input`
- Filter `output` → ADSR `input`
- ADSR `output` → Output `input`

**Sequencer**: none.

**Filename**: `param_modulation.json`.

---

## Optional Fixture 8 — `sine_220.json` and `sfx_oneshot.json`

If you'd like, after `sine_440.json` is done you can copy/derive two
trivial variants (the prompt says simple derivations from a known-good
seed are OK once the seeds exist):

- `sine_220.json`: copy of `sine_440.json` with the oscillator
  frequency changed from 440 to 220.
- `sfx_oneshot.json`: copy of `adsr_sine.json` triggered with a
  shorter duration. Same nodes, same connections; only the rendering
  call differs in the harness.

These are derivations, not full UI captures. Either rebuild them in
the UI (cleanest) or hand-edit the JSON (the prompt explicitly allows
copy+single-number-change derivations from a working seed).

---

## When you're done

Drop the fixture files in `tests/fixtures/` (next to this file). From
`skald-backend/`, run:

```
run_acceptance.bat
```

Paste the full output. From there, Phase 1's gate is met (harness
operational, fixtures present, pass/fail reported honestly), and we
move into Phase 2 (stereo + asset-type APIs) — which is what makes
most of these fixtures actually start passing.
