# Fixed packets

## A10 - Manual false-pessimism sweep (chapter side of P2/P3/P6/P10/P12)

Closed out the stale chapter sections listed under P2/B3, P6, P10 and P12 below, plus the
instances those packets did not enumerate. Nothing in this entry is a code change; every
claim was re-verified against the current tree before rewriting.

- Filter resonance: all six passages that described a panel/pad ceiling of 30 now say 20, the
  value every surface and the range table agree on, and explain that the damping floor of 0.05
  is reached at exactly `resonance = 20`. `00-foundations.md` step 10 and **Code-vs-intent** item 2;
  `nodes/filter.md` **Try it** step 5 and **Code-vs-intent** item 2; `50-bass-teardown.md`
  **Code-vs-intent** item 8; `60-complexity-ladder.md` **The complexity ladder** step 7 and
  **Code-vs-intent** item 6.
- Distortion: `nodes/distortion.md` **Code-vs-intent** items 1-3 and `60-complexity-ladder.md`
  item 7 rewritten — `shape` is in `DistortionParams` with a `classic` default, and Tone agrees at
  100-20,000 Hz on all three surfaces. The still-true parts (shape is compiled in; Tone above
  ~7 kHz is inert) are kept.
- VCA gain: `nodes/gain.md` **The controls** and **Code-vs-intent** item 1, `00-foundations.md`
  **The controls** row and item 8, `60-complexity-ladder.md` item 6 — the panel slider is
  `slider('gain', 0, 4, 0.75)`, so the 0-1 cap is gone. gain.md's *Try it* step 9 asks the reader
  to set 4.00 from the panel, which the old text said was impossible.
- Piano Roll: `50-bass-teardown.md` **Exercise 4** step 6 and **Code-vs-intent** items 2-3, and
  `nodes/midiInput.md` **Try it** step 2 — the roll draws MIDI 21-84 (A0-C6). The "painting a new
  step gives MIDI 60" claim is narrowed to the Step Grid.
- Legacy port names: `60-complexity-ladder.md` **The complexity ladder** intro and
  **Code-vs-intent** item 8 no longer claim the validator rejects `cutoff`/`frequency`/`pulseWidth`.
  `normalize_port` rewrites them before validation; all four named files were re-run through
  `codegen.exe` for this packet and exit 0 with their modulation wires live.
- Stored values (P12): `50-bass-teardown.md` **Exercise 1** step 1 and **Code-vs-intent** items
  10-11, `nodes/output.md` **Try it** steps 1 and 4, `nodes/noise.md` **What it looks like in
  Skald** and item 2, and `00-foundations.md` item 9 (the README/palette noise claim, which P12
  fixed in code but did not list as a stale chapter section).
- `voiceCount`: the `1-64 (backend)` half of the range-split claim is gone from
  `00-foundations.md` (**The controls** row and item 7), `50-bass-teardown.md` (**The controls**
  row) and `60-complexity-ladder.md` (**The controls** row). The table says 1-32.
- **Deliberately left alone, still gated:** every Reverb pre-delay passage (`nodes/reverb.md`
  **The controls**/step 8/**Going further**/**Under the hood**/**Terms**/items 1-2, and
  `60-complexity-ladder.md` §5 and item 1) and every Mixer channel-level passage
  (`nodes/mixer.md` **What "expose" does** and item 1, `60-complexity-ladder.md` item 3).
  Pre-delay waits on binary provenance; the mixer rewrite waits on its editor fix landing.

## P10 - Distortion `shape` TypeScript contract

- Added the four supported Distortion shape values to `DistortionParams`.
- Fresh Distortion nodes now default `shape` to `classic`.
- Stale chapter section: `nodes/distortion.md`, **Code-vs-intent notes**, item 1: `DistortionParams` has no `shape` field, but everything else uses one.

## P12 - Documentation and metadata drift

- README and palette metadata now advertise both white and pink Noise.
- BPM-synced example nodes now store free-run rates matching their actual project tempo and sync division: 4.6666667 Hz for both 140 BPM `1/8` nodes, and 8.4 Hz for the 126 BPM `1/16` node.
- Note-tracking example oscillators now store the established 440 Hz fallback instead of misleading dormant bass frequencies; `fixedPitch` remains off, so their sound is unchanged.
- Stale chapter sections:
  - `nodes/noise.md`, **What it looks like in Skald** and **Code-vs-intent notes**, item 2: the sidebar tooltip says white only.
  - `50-bass-teardown.md`, **Exercise 1**, step 1: `sine-sub-bass` stores 55 Hz.
  - `50-bass-teardown.md`, **Code-vs-intent notes**, items 10 and 11: the named patches store misleading free-run rates and dormant oscillator frequencies.
  - `nodes/output.md`, **Try it (hands-on)**, steps 1 and 4: `sine-sub-bass` stores 55 Hz.

## P6 - Piano Roll bass-note range

- Extended the Piano Roll's visible and editable range from MIDI 36-84 (C2-C6) to MIDI 21-84 (A0-C6), preserving the existing upper limit and middle-C initial scroll position.
- Added focused coverage for low-note rows, existing bass-note painting, low-register hit testing, and initial scrolling.
- Stale chapter sections:
  - `50-bass-teardown.md`, **Exercise 4**, step 6: the Piano Roll no longer hides notes below C2, and low bass notes can now be painted directly at their displayed pitches. The statement that painting a new step gives MIDI 60 must be narrowed to the Step Grid, as corrected by `EDITORIAL-REPORT.md`.
  - `50-bass-teardown.md`, **Code-vs-intent notes**, items 2 and 3: the Piano Roll now reaches A0; only the Step Grid defaults newly painted notes to MIDI 60.
  - `EDITORIAL-REPORT.md`, **Code-vs-intent findings**, C15 Piano Roll row: its MIDI 36 minimum and workaround guidance are now stale.

## P3 / B4 - Mixer exposed-level default

- Exposed Mixer `levelN` parameters now initialize from that channel's authored `levels`-array fader instead of the generic unity fallback.
- The generated processor field, `<Asset>_PARAMS` default, preview rebuild, and exported DSP now preserve the authored balance when exposure is enabled; runtime setters retain the existing 0.0-2.0 range.
- Added a focused backend fixture and behavioral assertion proving an authored 0.25 fader survives exposure and can still be raised to 1.0 at runtime.
- Stale chapter/editorial sections:
  - `nodes/mixer.md`, **What "expose" does**, final warning paragraph: exposed channels no longer start at 1.0 or discard the fader.
  - `nodes/mixer.md`, **Code-vs-intent notes**, item 1: the blocker is fixed.
  - `EDITORIAL-REPORT.md`, **BLOCKERS**, B4: exposure now preserves the authored Mixer level in preview and export.

## P1 / B5 - Reverb pre-delay

- Implemented Reverb Pre-Delay as a real, sample-rate-derived delay stage on the wet path ahead of the existing 75 ms feedback comb.
- Standardized its editor, generator fallback, runtime setter, and exported metadata range at 0-0.25 s with a 0.02 s default.
- Added focused wet-tail impulse coverage for zero delay, an authored 20 ms gap, and a live runtime change to 40 ms.
- Stale chapter/editorial sections:
  - `nodes/reverb.md`, **The controls**, Pre-Delay row: the control is implemented, its range/default changed, and exposure no longer falls through to the unknown range.
  - `nodes/reverb.md`, **Try it (hands-on)**, step 8: Pre-Delay is no longer inert.
  - `nodes/reverb.md`, **Going further**, “Fake the pre-delay you do not have”: a separate Delay node is no longer required.
  - `nodes/reverb.md`, **Under the hood**: the node now has an independent pre-delay history before the 75 ms comb.
  - `nodes/reverb.md`, **Terms introduced**, Pre-delay: Skald now implements it.
  - `nodes/reverb.md`, **Code-vs-intent notes**, items 1 and 2: the dead control and nonsense exposed range are fixed.
  - `EDITORIAL-REPORT.md`, **BLOCKERS**, B5: Pre-Delay is implemented and runtime-exposable.

## P2 / B3 - Parameter range alignment

- Aligned the VCA Gain panel with the established 0-4 node-card/backend contract.
- Aligned both Filter Resonance panel controls (number entry and XY pad) with the established 0.1-20 node-card/backend contract.
- Aligned the Distortion Tone panel with the established 100-20,000 Hz node-card/backend contract.
- Aligned free-running Delay Time with the 0-2 s node-card/backend/buffer contract. A stored 0 remains deliberate: DSP resolves it to the safe one-sample minimum rather than reading a full buffer wrap ago.
- Aligned the dormant backend `voiceCount` range metadata with the editor/serializer's compile-time 1-32 contract. Instrument-level expose buttons still produce no setter or `PARAMS` row.
- Stale chapter/editorial sections:
  - `00-foundations.md`, **The controls** (`voiceCount`, VCA `gain` rows); **Code-vs-intent notes** items 2, 7, and 8.
  - `60-complexity-ladder.md`, **The controls** (`voiceCount` row); **Code-vs-intent notes** item 6.
  - `EDITORIAL-REPORT.md`, **Corrections required before publication / Severity 4** range-table guidance.
  - `EDITORIAL-REPORT.md`, **B3** evidence rows for Gain, Filter resonance, Distortion tone, Delay time, and `voiceCount`.
  - `EDITORIAL-REPORT.md`, **C15** Delay-time panel finding.
  - `EDITORIAL-REPORT.md`, **R6** remains correct about dormant Instrument exposure, but its 1-64 range premise is stale.
