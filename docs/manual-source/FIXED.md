# Fixed packets

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
