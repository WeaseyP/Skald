# Graph-shape seed fixtures

These are React-Flow Save-format JSON files (top-level `nodes` / `edges` /
`sequencerTracks`). Each one wraps a fully-built instrument named `Asset`
inside a single instrument node, ready to drop into the UI.

For each file: load it in the UI, glance at the canvas to confirm the patch
looks sensible, then click **Generate Code** with the output set to the
matching `tests/fixtures/<name>.odin`. The codegen-shape `.json` lands next
to the `.odin` and that's the actual fixture the harness eats.

## Workflow per file

1. `cd skald-ui && npm start`
2. **Sidebar → Graph Actions → Load** → pick `<name>.json` from this dir
3. The instrument labeled "Asset" appears on the canvas. (You can
   double-click it to inspect the subgraph if you want.)
4. **Sidebar → Generation → Select Output File** → navigate to
   `Skald-main/Skald/skald-backend/tests/fixtures/` → type `<name>.odin`
5. Click **Generate Code** (the blue button)
6. The DevTools console shows `[Skald] Wrote codegen input JSON to ...<name>.json`
7. Repeat for the next file. (You may need to **clear the canvas** between
   loads — Load doesn't reset state, it merges. Ctrl-A → Delete should do it,
   or restart the app.)

After all are saved, from `skald-backend/`:

```
run_acceptance.bat
```

You should see a per-fixture pass/fail block.

## What's here

| File | Type | What it tests |
|---|---|---|
| `sine_220.json` | SFX | Pure 220Hz sine — peak FFT bin |
| `adsr_sine.json` | SFX | ADSR shape with finite-duration trigger; silence after release |
| `sfx_oneshot.json` | SFX | Same patch as adsr_sine; harness varies trigger duration to verify the SFX one-shot gate |
| `param_modulation.json` | SFX | Filter `cutoff` exposed; harness sweeps it via `Asset_set_param` and asserts spectral centroid shifts |
| `sine_220_pan_left.json` | SFX | Panner with `pan: -1.0`; verifies stereo plumbing routes L > 4×R |
| `kick_loop_120bpm.json` | Music Layer | Kicks on steps 0/4/8/12 at 120 BPM; verifies sequencer timing at 48k |
| `filter_sweep.json` | Music Layer | LFO modulating filter cutoff; verifies LFO dispatch + cutoff modulation routing (spectral centroid shifts between halves) |

## Not included: `fm_bell.json`

I left this one out — the original recipe in `SEED_FIXTURE_INSTRUCTIONS.md`
was wrong (it expected the FM Operator to self-modulate, but the codegen
reads `input_mod` from an external source). A real FM bell needs a
modulator oscillator wired into FmOperator's `input_mod` port; the
correct topology is up for design discussion.

The harness has a stub case for `fm_bell` so it'll just report "FAIL"
gracefully if you ever generate a fixture by that name.

## Confidence notes

- `sine_220`, `adsr_sine`, `sfx_oneshot` — straightforward derivations
  of `sine_440`, very confident.
- `param_modulation` — adds a Filter with `cutoff` in `exposedParameters`.
  Should produce real `Asset_set_cutoff` typed setter + `cutoff` in the
  PARAMS table.
- `sine_220_pan_left` — Panner has simple `input` / `output` handles per
  the codegen; GraphOutput dispatcher detects the Panner source and
  routes L/R. If the assertion fails, the issue is most likely in the
  stereo routing (which would be a real bug, not a fixture issue).
- `kick_loop_120bpm` — sequencer track with notes 0/4/8/12. The `Asset`
  instrument's `targetNodeId` in the track must match the instrument
  node id; I've used `asset-instrument` for both. If Load remaps node
  ids, the targetNodeId might not match — let me know if the resulting
  Project JSON has `audio_graph.sequencer_tracks: []` instead of `[{...}]`.
- `filter_sweep` — the LFO → filter `input_cutoff` edge is the new
  routing being tested. If this fixture fails, the bug is in how
  `get_f32_param` reads the filter cutoff with both an exposed param AND
  a wired modulator (codepath: param_utils.odin's input-port summation).
