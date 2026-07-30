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
