# Fixed packets

## D3 - Post-freeze citation re-pin and chapter rewrites (Wave D, 2026-09-06)

The citation convention changed from `path:NNN` (a line number, which drifts every time the cited file is edited) to `path::identifier` (a name, gated by `scripts/manual/check-citations.mjs`, run strict as part of the manual build). Across all 22 pre-existing chapters: 1323 citations converted, 97 passages rewritten because the claim was false, 46 citations dropped (all replaced by a real citation or a verified-against-source note, never removed outright). Every passage below was rewritten because the code no longer does what the chapter said; the packet that changed the code is named.

- **00-foundations.md**: **Cycle detection**: was "codegen exits on a feedback loop," now "warns on stderr but does not stop the build" (`codegen_processor.odin::generate_processor_code`'s `os.exit(1)` is commented out — code defect, see `DEFECTS-FOUND.md`). **Try it step 10, self-oscillation**: was "a screaming siren that sustains on its own," now "rings hard but will not sustain" — the damping clamp bottoms out at 0.05, one step short of true self-oscillation (`generate_filter_code`). **Try it step 11 / Under the hood, the master limiter**: was one project-level `tanh(mixed * master_volume)`, now two stages — each asset's own `_process` already soft-limits via `skald_soft_limit` before the project mix limits again (`generate_processor_code`, `generate_project_code`/`emit_soft_limit_proc`; KI-011). **"An Instrument is mandatory for preview"**: was "preview refuses any canvas with no Instrument," now a canvas with none auto-wraps into one SFX `Asset` (SKB-019/B6-1; `buildProjectData`). **"Instrument volume" paragraph, Noise DC-offset sentence, voice/bus-domain paragraph**: all three quoted a source code comment that no longer exists anywhere in `skald-backend/core`; restated the underlying mechanisms in the manual's own words. **"What it is"**: added the mono-with-terminal-pan model per `docs/0.2-ROADMAP.md` §7 (`generate_panner_code`). **Try it step 4**: added that exposing Oscillator/Wavetable `frequency` with Fixed Pitch off now prunes the setter/`_PARAMS` row from the export entirely, not merely leaving it inert (`param_is_reachable`, packet B2).

- **nodes/instrument.md**: **"Note on and voice allocation"**: was "always steals the oldest voice," now release-first tiered stealing, falling back to oldest-by-age only when nothing is releasing or the graph has no ADSR (SKB-030/C6-1; `generate_processor_code`). **"What 'expose' does" closing paragraph**: was "nothing downstream reads it," now three of five link-icon controls (Voice Count, Glide, Unison) can never become runtime parameters at all because they size arrays or gate code blocks; Volume already has a real setter via the unconditional B1 path; Detune could be exposed but isn't (KI-019). **The controls**: added `voiceStealing` — stored, typed, never rendered by any control, never read by the generator (KI-018). **FM Operator/Wavetable unison claim**: was "single-copy no matter what unison says," now both run a full unison/detune loop identical in shape to the Oscillator's; only Noise is actually single-copy.

- **nodes/oscillator.md**: **Phase — what you hear**: was "only editable from the parameter panel, not the card," now the card exposes Phase too (packet A7). **Pulse width — what you hear**: was "card and panel both hide the control outside Square," now the panel greys-out/disables with a tooltip instead of hiding (B2); only the card still hides it. **Fixed Pitch and frequency**: same panel grey-out fix for `frequency`, plus B2 now prunes the exposed `frequency` setter/`_PARAMS` row from the export entirely when `fixedPitch` is off. **The controls, `pulseWidth` row**: was "0.0-1.0 (UI 0.01-0.99; DSP 0.01-0.99)," now unified "0.01-0.99" (A8). **"What 'expose' does" collision example**: cited `Osc_A_frequency`/`Osc_B_frequency` against a fixture that actually exposes amplitude/phase; corrected to `Osc_A_amplitude`/`Osc_B_amplitude`. **Under the hood**: dropped two invented code-comment quotes (a DC-offset phase-wrap story, a Square-thresholding aside); restated current behaviour plainly.

- **nodes/adsr.md**: **Input handle**: was labelled "Gate," now "In" (A7; `ADSRNode.tsx`). **The controls, Attack/Decay/Release**: was "0.001-10 backend, 0-10 card," now uniformly 0-10 (A8); only the draggable envelope graph still floors at 0.001 (KI-030). **"The cost of exposing is the clamp"**: was "exposed attack can never be less than 0.001s," now floors at 0 (A8). **Sustain trap / Try it step 7**: was "sustain exactly 0 marks the whole voice Idle, so Release never runs," now sustain 0 is a level like any other and Release runs normally (SKB-041/C6-4); step 7 rewritten around the `sustain_zero_hold` fixture that pins the fixed behaviour. Added a paragraph on C2's default-unification and the still-live generator-fallback divergence (KI-007).

- **nodes/output.md**: **"Why Output has nothing to expose" / "Give yourself a master fader"**: was "volume is baked in as a literal constant, no setter for either," now every asset carries a runtime `p.volume` with `<Asset>_set_volume`, plus project-level `project_set_master_volume`/`skald_set_master_volume` (SKB-011/B1). **Under the hood**: was `return output_left * f32(volume), ...`, now `return skald_soft_limit(output_left * p.volume, ...)` — per-asset soft limiting is new since B1, stacked under the existing project-stage limiter. **The controls**: added a "Per-asset soft limit" row so the two-stage limiting is explicit. Added a peak-meter paragraph (packet B10) that existed in code but had no chapter mention. **Try it step 2**: was "Press Play, it will refuse" for a loose graph, now auto-wraps into an SFX asset (B6-1).

- **nodes/filter.md**: no passage was rewritten-because-false this pass — its five KI pointers (KI-002, KI-006, KI-007, KI-037, KI-038) were already accurate. Two passages gained a specific number where they'd only gestured at the defect before: **The controls** now states the `cutoff` missing-key fallback (1000 Hz, `generate_filter_code`) versus the schema default (800 Hz), citing KI-007; **Resonance — what you hear** now names the residual `exposed_param_default`-returns-verbatim asymmetry, KI-006.

- **nodes/mapper.md**: **"Where you edit them"**: was "three surfaces, panel bounded to ±10,000," now two surfaces that agree — packet B11 deleted the Mapper's separate `ParameterPanel` branch. **Try it step 9**: was "type it on the node because the panel stops at 10,000," now either surface works (B11). **"The zero-range guard"**: dropped an invented code-comment quote ("Degenerate range maps everything to outMin") not present in `generate_mapper_code`; restated the mechanism in prose (flagged in `DEFECTS-FOUND.md`). Three worked examples (downward-scoop, literal-vs-struct, `kick_pitch_mapper`) cited a nonexistent `skald-backend/generated_audio.odin`; replaced with live, regenerated examples (`growly-sax.skald.json`, `wobble-samplehold-bass.skald.json`, `kick-sequenced.skald.json`) and corrected the double-`f32(...)` wrap the real generator emits for unexposed literals.

- **nodes/lfo.md**: **"One LFO per voice"**: was "always per-voice, `note_on` never resets phase," now bus-hoisted onto the processor when every consumer is bus-domain (SKB-017/B7-3), and a fresh voice's LFO resets phase at note-on while a stolen or bus-hoisted one does not (C6-2). **"Frequency and syncRate"**: moved the BPM-sync derivation to `05-sequencer.md` (packet C7, now the canonical home); fixed the same "nothing ever resets phase on note-on" claim. **"Put the LFO before the envelope"**: was "never retriggers," now retriggers on a fresh voice (C6-2). **Try it intro**: dropped the "cannot be played" claim, false since B6-1's auto-wrap. **Terms, "Free-running"/"Retrigger"**: both asserted no retrigger; rewritten to state the three actual cases (fresh/stolen/bus-hoisted).

- **nodes/sampleHold.md**: **"Not reset when a note starts"**: was true pre-C6-2, now a fresh voice's S&H redraws its held value at note-on (no reset on a stolen voice, no bar-line lock either way). **Try it step 1** and **Terms, "Free-running"**: same C6-2 fix applied to the per-loop jump explanation. **Second exposure gotcha**: was "an exposed synced `rate` compiles, runs, and changes nothing," now `param_is_reachable` omits it from the generated API entirely and both editor surfaces grey the control with the reason shown (B2). **"Amount" default**: was 0.5, now 1.0 (C2), with the 3→4 save-migration backfill noted.

- **nodes/gain.md**: **Try it steps 2-5**: was "the multiplier rides 0.75+envelope and never reaches zero" (the pre-C4 additive drone), now a fresh VCA defaults to `gainMode: 'multiply'` and plays cleanly; step 5 now deliberately flips to `add` to reproduce the historical bug on purpose, then restores `multiply`. **Under the hood**: was an unconditional 4-line proc with no `gainMode` branch, now shows the real `if gainMode == "multiply"` branch (C4) — this section had drifted out of step with the chapter's own earlier "two arithmetics" passage. Setup paragraph: was "Skald refuses to play loose canvas nodes," now auto-wraps (B6-1). "Four VCAs in the shipped four-bar song" corrected to five (verified against the JSON).

- **nodes/noise.md**: **The controls, amplitude row**: was "1.0 (UI) / 0.5 (codegen clamp)," now unified 1.0 (SKB-051). **"The trap" / Try it step 7 / "Where it goes wrong"**: was "no output limiter, hard clipping," now a `tanh` soft limiter on every asset (B1, `skald_soft_limit`); the worked example moved to the live `noise_exposed_amplitude.odin.golden` fixture, whose `Asset_process` ends `return skald_soft_limit(...)`. **Terms, "Clipping"** rewritten as "Soft limiting / saturation" to match.

- **nodes/mixer.md**: **"Where those numbers come from"**: was "the panel slider is capped at 1.0, a genuine inconsistency," now the panel runs 0-2, matching the canvas box and the exported clamp (P2/B3); noted the level-default split (0.75 new channel / 1.0 schema fallback). **"What 'expose' does"**: added that Mixer channel exposability is no longer conditional anywhere (SKB-043 closed the last hardcoded `false`) and that `NodeParameterControls` is the single rendering path since B11 deleted `ParameterPanel`'s separate mixer branch.

- **nodes/wavetable.md**: **Handles table**: was missing a fourth input; added `input_pulseWidth` ("PW") (packet C5). **"What 'expose' does"**: was "ships with frequency and position exposed," now also `amplitude` (C5). **The controls, Amp row**: was "(unset; DSP uses 1.0)," now a real stored default of 1 (SKB-024/C5). **Rate / "What it cannot connect to" / Under the hood**: was a 3-line, no-unison, 2-argument `skald_wavetable_sample(ph, pos)`, now a full unison/detune loop with a phase-offset branch and a third `pw` argument threaded to the Square case (C5; `generate_wavetable_code`).

- **nodes/fmOperator.md**: **The controls, frequency row**: was "2 on a freshly dragged node, 1 everywhere else," now the schema/backend default is 2 everywhere except the parameter-panel slider's own `defaultValue`, which is still 1 (C2; KI-024). **"What 'expose' does" `lookup_param_range` example**: was `{0.01, 32.0, 1.0, "ratio"}`, now `2.0`. **Try it step 9**: was "double-clicking resets Ratio to 1, which is correct," now correct only because this patch authors ratio 1, not because 1 is the node's default (KI-024). **"Order matters," Carrier-input bullet**: was a specific claim about an "LFO at amplitude 0.02" acceptance test; the fixture only proves the wire is exportable and audible, so rewritten to claim only that, keeping 0.02 as a musical suggestion. **Under the hood**: was pre-C5 pseudocode, now matches the real unison/detune loop and the `* (<amp>)` byte-identity note.

- **nodes/distortion.md**: **The controls**: added `outputGain` (B1, `schema/nodes.json::outputGain`, default 1.0) with no editor control reading it (KI-042) — previously absent from the table entirely. **"Drive — what you hear"**: was "no output level or makeup gain on this node," now "no **editor-facing**" one (KI-042); added the drive-has-no-ceiling caveat (KI-040). **Try it step 4**: same "editor-facing" correction. **Under the hood**: added that `generate_distortion_code` multiplies by `outputGain` when it differs from 1.0 (B1).

- **nodes/delay.md**: **The controls, delayTime panel column**: was "0.001-5," now "0-2" (P2/B3). **The controls, feedback row**: was "setter clamps 0-0.99, DSP clamps 0-0.95," now the setter also clamps at 0.95 — only the panel slider (still 0-1) is out of step (KI-001). **"One trap" (delayTime under BPM Sync)**: was "silently inert," now surfaced via a dead-reason string and the node card hides the field (B2). **"What you hear as you sweep" ceiling bullet**: dropped a dead link to the retired "Code-vs-intent notes"; added per-sample-rate numbers and KI-043. **Under the hood**: added that the BPM-sync substitution runs through the same buffer clamp, silently shortening an out-of-range synced time (KI-044).

- **nodes/reverb.md**: **The controls table**: was "Decay setter clamps 0.001-10," now Reverb's own 0.1-10 row (C2); Pre-Delay was "nothing, currently, falls through to ±1e6," now a real `{0, 0.25, 0.02}` ring buffer (P1/B5); added a Damping row, missing entirely before (C5). **"What 'expose' does"**: was "ships with Decay and Mix exposed," now also Pre-Delay; Damping is new and not exposed by default. **Try it step 8**: was "Prove Pre-Delay is inert," now demonstrates the real gap (0 vs 0.25s against a short Decay); added a new step 9 for Damping, renumbering the rest. **"Going further," "Fake the pre-delay"**: premise gone; repurposed for exceeding the real 0.25s ceiling. **Under the hood**: was a single-comb description, now three stages (pre-delay ring buffer, comb, conditional damping via `reverb_damping_active`). **"Mind the memory"**: added the second `[48000]f32` pre-delay buffer, previously uncounted.

- **nodes/panner.md**: **Chapter-wide pan-law rewrite**: was bare cos/sin (-3 dB centre), now the same shape normalised by √2 — unity at centre, +3 dB at hard pan (SKB-013/B7-1; `generate_panner_code`'s `* 1.4142136`); the mono-fallback formula was pan-dependent `(L+R)×0.7071`, now a bare unity pass-through since pan is not a level. **Try it step 7**: was "about 3dB quieter" from the old mono downmix, now level is not lost, only stereo position. **Try it step 8**: was a dead "Code-vs-intent notes" pointer, now explains B7-3's bus-hoisting of the Auto Pan LFO. Corrected "the app will not warn you about it" to note `warn_panner_mono_consumers` (B7-x2) does print a stderr warning naming the Panner (KI-004/KI-049).

- **nodes/midiInput.md**: **Try it steps 4-5 / step 8**: `sax3.json` no longer carries the Pitch→Oscillator or Gate→ADSR wires it used to (SKB-015/B8-2); both exercises rewritten to build the wire live instead of finding-and-deleting it. **"Exposing a parameter"**: was "a dead end where both parameters ship exposed," now `param_is_reachable` unconditionally returns false for every MidiInput parameter, filtering even a hand-authored exposure before it reaches resolution (SKB-059/B2; KI-004). **Try it step 2**: was "the roll spans A0-C6," now the full MIDI 0-127 (SKB-026; `stepMetrics.ts::MIDI_NOTE_MIN`/`MAX`). **The controls, `device` row**: was conflating the stored value with the dropdown's display label; split into a "Stored value" column plus the display strings.

- **50-bass-teardown.md**: **Exercise 4 step 6**: was "Piano Roll draws MIDI 21-84," now the full 0-127, opening scrolled to middle C (SKB-026/B5-3). **ADSR input handle**: "Gate" → "In" everywhere in this chapter (A7). **"Under the hood," the envelope**: was "sustain ≤0.0001 sends the envelope to Idle," now sustain 0 holds in Sustain like any other level (SKB-041/C6-4). **Exercise 1 step 4**: was "deleting the ADSR gives an audible click at note end," now a 5ms fade prevents the click (SKB-030/C6-3, `NOADSR_FADE_SECONDS`). **Per-node parameter table, ADSR attack/decay/release**: was "0.001-10," now "0-10" (A8). **"Two gotchas"**: replaced the now-fixed exposed-ADSR-attack example with a still-open one — exposed LFO `frequency` clamps to 0.01-100Hz at runtime but the panel slider stops at 50Hz. **Node handle table, FM Operator row**: added the third input, `input_amp` (C5).

- **60-complexity-ladder.md**: **"Space" section, Reverb Pre-Delay**: was "does nothing, fake it with a Delay node," now a real pre-delay stage (P1/B5). **"What you actually hear," Voice count**: was "always steals the oldest voice," now release-first tiered stealing (SKB-030/C6-1). **The controls, glide row**: was "0-2 panel, 0-5 backend," now 0-5 both. **Ladder table intro, "flat" row**: was "produces no audio until grouped into an Instrument," now auto-wraps and already plays (SKB-019/B6-1). **Modulation-inputs table, ADSR row**: "Gate" → "In" (A7).

- **70-space-funk-build.md**: **Exercise 7, "Mix it so the limiter does not eat it"**: was the single-stage-limiter claim, now describes both per-instrument and project-level `skald_soft_limit` stages. **Exercise 5, Delay Feedback aside**: was "0.99 is the clamp," now 0.95 (C2 unification; `schema/nodes.json`, `generate_delay_code`). **Exercise 6, harmony-table paragraph**: was "notes outside MIDI 21-84...," now the roll draws the full 0-127 (SKB-026/B5-3). **Exercise 8 item 6, "Self-oscillate a filter"**: same false self-oscillation claim as 00-foundations.md, corrected the same way. The Hat row's inline defect commentary was collapsed onto a KI-037 pointer.

**Stale entries above this one:** the entries below this one in this file — P6 and A10 — state that the Piano Roll draws MIDI 21-84 (A0-C6) and that every Reverb pre-delay passage was "left alone, still gated." Both are superseded by later packets: the roll draws the full MIDI 0-127 (SKB-026/B5-3, `skald-ui/src/components/Sequencer/stepMetrics.ts::MIDI_NOTE_MIN`/`MAX`), and Reverb pre-delay is a real, implemented control (`skald-backend/core/codegen_nodes.odin::generate_reverb_code`), recorded above P6/A10 by packet P1/B5. This file is a log, not a living reference — those entries are left as written and not edited.

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
