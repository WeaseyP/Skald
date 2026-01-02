# Skald Project Analysis Report

## 1. Documentation Audit
**Status:** 🔴 Out of Date

The documentation in `skald-ui/new_docs/` is significantly out of sync with the codebase (`skald-ui/src/definitions/types.ts`).

### Discrepancies
*   **Generic Content:** Most files (e.g., `OscillatorNode.md`, `FilterNode.md`) only list generic `data` and `reactflow` dependencies. They completely omit the specific DSP parameters that actually exist in the code.
*   **Missing Parameters:**
    *   **OscillatorNode:** Code has `waveform`, `pulseWidth`, `phase`, `amplitude`. Docs have none.
    *   **FilterNode:** Code has `type` (Lowpass/Highpass/etc), `cutoff`, `resonance`. Docs have none.
    *   **AdsrNode:** Code has `attack`, `decay`, `sustain`, `release`, `depth`, `curves`. Docs have none.

**Action Item:** Regenerate all markdown files in `new_docs/` to reflect the interface definitions in `src/definitions/types.ts`.

## 2. Project Hygiene (Cleanup)
**Status:** 🟠 Needs Cleanup

### Unwanted Files
*   `skald-ui/src_snapshot.txt`: Large temporary file (likely a clipboard dump). **Delete.**
*   `skald-ui/.eslintrc.json`: Exists, but `eslint` is v9 which expects `eslint.config.js`. The linting command `npm run lint` fails.

### Imports & Dependencies
*   `ts-node`: Listed in `devDependencies`. It is likely used for running `vite.*.config.ts` or `forge.config.ts`, but should be verified.
*   `eslint` vs `eslint-plugin-*`: Mismatched versions caused the break.
*   **Unused Imports:** A manual spot check suggests normal React usage, but without a working Linter, we cannot automatically enforce this.

**Action Item:**
1.  Delete `src_snapshot.txt`.
2.  Fix `npm run lint` by migrating to `eslint.config.js` or downgrading `eslint`.
3.  Run the fixed linter to auto-detect unused imports.

## 3. Testing Audit
**Status:** 🟡 functional but incomplete

### Current State
*   **Unit Tests:** Exist for Audio Nodes (`Oscillator`, `ADSR`, etc.) and some "Combos".
*   **Failing Test:** `src/tests/nodes/MidiInput.test.ts` fails because `context.createConstantSource` is not mocked in `webAudioMock.ts`.
*   **Coverage Gap:** The **Sequencer** has **zero tests**. This is a critical feature that is currently brittle.

**Action Item:**
1.  Fix `webAudioMock.ts` to support `createConstantSource`.
2.  Create `src/tests/sequencer/SequencerState.test.ts` to test logic (add track, toggle note).
3.  Create `src/tests/sequencer/StepGrid.test.ts` for interaction testing.

## 4. Feature Roadmap (The "Music Maker" Upgrade)

To transform Skald into a proper music creation tool (Groovebox/DAW hybrid), I recommend the following features. The **High Priority** items address your specific requests.

### High Priority
1.  **Per-Step Parameter Locks (P-Locks):**
    *   *Concept:* Any step in the sequencer can override the Instrument's default parameters.
    *   *Implementation:* Extend `NoteEvent` to include an optional `patchOverrides` object.
    *   *UI:* Holding a step in `StepGrid` opens a "mini" parameter panel to set these overrides.
    *   *Backend Implication:* The CodeGen must handle "if step == X, set param Y to Z" logic.
2.  **Pattern Chaining / Arranger:**
    *   Allow creating multiple "Patterns" (A, B, C) and sequencing them in a linear song mode.
3.  **Extended Loop Lengths:**
    *   Support 32, 64, or arbitrary step lengths per track (Polyrhythms).

### Medium Priority ("Groovebox" Feel)
4.  **Scales & Key Locking:**
    *   Global "Key" setting (e.g., C Minor). Piano roll / knobs only snap to valid notes.
5.  **Micro-timing (Nudge):**
    *   Allow notes to be offset slightly off the grid (early/late) for human feel.
6.  **Probability / Chance:**
    *   A slider per step: "50% chance to play". Adds variation to loops.
7.  **Ratchet / Retrigger:**
    *   Play a note multiple times within a single step (e.g., hi-hat rolls).

### Visual & Workflow
8.  **Automation Lanes:**
    *   Distinct from P-Locks. Draw a curve for a parameter (Filter Cutoff) over time.
9.  **Sample/Audio Clips:**
    *   A `SamplerNode` that plays .wav files, not just synthesized waveforms.
10. **Visual Feedback:**
    *   Real-time Oscilloscope or Spectrum Analyzer on the Instrument Node output.

## 5. Strategic Recommendation
**Question:** Frontend Features first OR Backend CodeGen first?

**Answer: FRONTEND FIRST.**

**Reasoning:**
The "Per-Step Parameter Lock" feature drastically changes the data structure (`NoteEvent` + `InstrumentParams`).
1.  If you fix the Backend now, you will write code to play "static" sequences.
2.  Once we add P-Locks to the Frontend, the JSON structure sent to the backend will change.
3.  You would then have to rewrite the Backend logic to support dynamic parameter updates per step.

**Recommended Path:**
1.  **Cleanup:** Fix the Linter and delete junk files.
2.  **Frontend Logic:** Implement `patchOverrides` in the Sequencer state.
3.  **Frontend UI:** Build the UI to edit these overrides.
4.  **Backend:** *Then* update the Odin generator to parse this new rich data and generate the complex conditional audio code.
