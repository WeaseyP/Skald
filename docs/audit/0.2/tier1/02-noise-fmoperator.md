# A02 — Noise & FM Operator audit

## Summary

- **The FIXED.md-flagged Noise tooltip divergence is genuinely resolved in code but the manual is now stale about it.** `Sidebar.tsx:265` reads `'White and pink noise source.'` today, not `'White noise source.'` as `noise.md` quotes it (both in the main narrative and in the chapter's own Code-vs-intent note 2). This is exactly the FIXED.md P12 fix landing without the manual catching up — tagged `already-known` below.
- **Core DSP claims for both nodes check out.** PRNG seeding formula, the bipolar (`*2.0-1.0`) DC-offset fix, the Kellett pink-noise coefficients, the FM ratio clamp `[0.01,32]` and its ~190 kHz-aliasing rationale, the ±10-octave V/Oct carrier clamp, the phase-modulation (not frequency-modulation) implementation, and the additive (not multiplicative) modulation-summing convention all match the code exactly where I could pin down a stable citation (`graph_validate.odin:28,30`, `param_ranges.odin:27-28`, `param_utils.odin:149-154`, `codegen.odin:453-473`, `NodeStyles.ts:89-90`, `node-definitions.ts:53-55`).
- **No parity/exposure/UI-editability gaps found for either node** — unlike the Oscillator calibration example, Noise's and FM Operator's node-body field lists match their sidebar control lists exactly, and every exposed parameter has a struct field, typed setter and PARAMS row confirmed against the golden `generated_audio.odin` fixture.
- **FM feedback (self-modulation) does not exist, in any form** — confirmed absent from `types.ts`, `node-definitions.ts`, `FMOperatorNode.tsx`, `NodeParameterControls.tsx`, `param_ranges.odin` and `generate_fm_operator_code`. The chapter never claims otherwise, so this isn't a doc-bug, but it's worth flagging per the brief and as a design gap (see F-A02-10).
- **The chapters' deep/"Under the hood" citations into `codegen.odin` have drifted badly** — by 40 to 70 lines in several places, and not merely drifted-but-nearby: multiple citations now land on unrelated code (a different node's state block, an unrelated ADSR/voice-steal comment, the generated-file package-header banner). This affects both chapters and is reported as two dedicated findings (F-A02-2, F-A02-3) rather than one entry per citation, to avoid flooding the list.
- **New "is this the best design?" pass** surfaces five concrete design findings: Noise's White/Pink switch is a build-time-only binary where a continuous color parameter would be strictly better and remove a special case; FM Operator has no output-level parameter at all (every other source node does); the Ratio control conflates coarse harmonic selection with fine detuning; the Mod Index slider is linear over a 1000-wide range whose musically useful zone is the bottom 1%; and Pink/White likely don't sound equally loud at the same nominal `amplitude`.

## Findings

### F-A02-1: Sidebar tooltip fix landed, but the manual (and its own Code-vs-intent note) is now stale about it
- **kind**: doc-bug
- **node**: Noise
- **severity**: low
- **confidence**: high
- **evidence**: `skald-ui/src/components/Sidebar.tsx:265` → `{ type: 'noise', label: 'Noise', tip: 'White and pink noise source.' }`. `docs/manual-source/nodes/noise.md` "What it looks like in Skald" quotes `tip: 'White noise source'`, and its own **Code-vs-intent notes** item 2 says "the sidebar tooltip omits pink noise." `docs/manual-source/FIXED.md`, entry **P12**, already records this exact fix and lists `nodes/noise.md`'s "What it looks like in Skald" and "Code-vs-intent notes item 2" as the stale sections.
- **detail**: The code fix is real and correct — the tooltip now advertises both colours. The chapter simply hasn't been regenerated since. This is the divergence the brief specifically asked me to check, and it is exactly what FIXED.md says it is: resolved in code, stale in the currently-shipped chapter text.
- **suggested fix**: Regenerate `noise.md`'s tooltip quote and drop Code-vs-intent note 2 (FIXED.md already prescribes this).
- **tag**: already-known

### F-A02-2: `noise.md`'s deep code citations have drifted 40-70 lines and several now point at unrelated code
- **kind**: doc-bug
- **node**: Noise
- **severity**: medium
- **confidence**: high
- **evidence**: Six citations checked line-by-line against current `skald-backend/core/codegen.odin`:
  - Claimed `:1200-1207` for "the collision resolver prefixes each with its sanitised node label" → actual label-prefixing code is at `:1250-1258`; `:1200-1207` today is the *bus-domain per-node-type struct-field switch* (`case "Noise": noise_%s_rng: PRNG_State ...`), a different feature entirely.
  - Claimed `:1275-1277` for "the literal reason ... xorshift32 of 0 returns 0 forever" → that comment is now at `:1326`; `:1275-1277` is inside the `Exposed_Resolution{...}` struct literal in the parameter-collision pass.
  - Claimed `:1293-1299` for the per-voice seed assignment (`v.noise_%s_rng.state = ...`) → the actual seeding loop is at `:1337-1372`; `:1293-1299` is the stable-sort dedup loop for exposed-parameter resolutions.
  - Claimed `:1814-1815` for "generated inside the per-voice loop" → the actual `case "Noise": generate_noise_code(&sb, node, graph, "voice.")` dispatch is at `:1874-1875`; `:1814-1815` is a blank line inside the auto-release-check comment block.
  - Claimed `:1921-1922` for the bus-domain Noise placement → the actual `case "Noise": generate_noise_code(&sb, node, graph, "p.")` is at `:1981-1982`; `:1921-1922` is the unrelated `has_adsr`/voice-lifecycle check.
  - Claimed `:2288-2299` for the `next_float32` xorshift32 body → the function is now at `:2348-2360`; `:2288-2299` is the generated-file's package header comment banner (`"// Generated by Skald."` etc.), nothing to do with the PRNG.
- **detail**: All six are more than "a citation off by a few lines that still points at the right code" — the calibration standard's own dividing line. A reader clicking through on any of these six would land on a different feature's code, not a nearby line of the right one. The drift is consistent (~50-60 lines for most of the file, growing to ~60-70 past line ~1800), which suggests a chunk of unrelated codegen work (plausibly the Reverb pre-delay and Mixer exposed-level fixes recorded in FIXED.md's P1/B5 and P3/B4) was inserted between roughly line 1200 and line 1800 after this chapter's citations were written.
- **suggested fix**: Re-run whatever citation-extraction tooling produced these line numbers against current `codegen.odin`; a blanket re-citation pass on the "Under the hood" section is needed, not a spot-fix.

### F-A02-3: `fmOperator.md` has the same systematic citation drift into `codegen.odin`
- **kind**: doc-bug
- **node**: FM Operator
- **severity**: medium
- **confidence**: high
- **evidence**:
  - Claimed `:1080-1081` for "its phase lives on the voice as `fm_<id>_phase`" → the field declaration is now at `:1134`; `:1080-1081` is inside the bus-domain Filter state block (`filter_%s_low`/`filter_%s_band` fields).
  - Claimed `:1428-1429, 1437` for "reset to zero when a fresh voice starts a note, but deliberately not reset when a voice is stolen mid-note" → the actual reset code is `case "FmOperator": v.fm_%s_phase = 0.0` at `:1488-1489`, gated by `if !stolen` at `:1497`; `:1428-1429`/`:1437` is unrelated ADSR release-level-continuity code for voice steals (a real and interesting mechanism, just not this one).
  - Claimed `:1937-1944` for the explicit build-time error when an FM Operator lands downstream of a Delay/Reverb → the actual `fmt.eprintf("...cannot run downstream of a Delay/Reverb...")` is at `:2000-2002`; `:1937-1944` is the unrelated start of the bus-block-detection code (`has_bus := false; for node in sorted_nodes {...}`).
  - Claimed `:1191` for the `lookup_param_range(name, node_type)` call site → the actual call is at `:1247`; `:1191` today is a comment about bus-domain stateful nodes.
  - Claimed `:1612-1624, 1630-1641` for "each exposed parameter becomes a field ... a clamped typed setter ... a row in the PARAMS table" → those line ranges are now the unrelated `_feed_input`, `_start` and `_stop` proc emitters.
- **detail**: Same root cause and same severity assessment as F-A02-2 — these are "points at unrelated code" citations, not "drifted but still right" ones. Every specific technical claim in the prose is still true (I verified each independently against the real code, see the Summary and F-A02-10), so this is purely a citation-freshness problem, not a factual one.
- **suggested fix**: Same as F-A02-2 — re-run citation extraction against current `codegen.odin`.

### F-A02-4: The "digital silence at amplitude 0" citation points at the Pink-noise filter, not the White multiply
- **kind**: doc-bug
- **node**: Noise
- **severity**: low
- **confidence**: high
- **evidence**: `noise.md`, "Amplitude — what you hear": "At **0.0** the node emits digital silence — the multiply zeroes it (`skald-backend/core/codegen.odin:314`)." Actual White-noise multiply is `codegen.odin:321`: `node_%s_out = (next_float32(&%snoise_%s_rng) * 2.0 - 1.0) * (%s);`. Line 314 is `%snoise_%s_p2 = 0.57000 * %snoise_%s_p2 + white_%s * 1.0526913;` — a tap inside the *Pink* filter, in the other branch of the same `if noise_is_pink(node)` statement.
- **detail**: A reader following this citation to check "does the multiply really zero it at 0.0" lands on a Pink-filter coefficient line instead, which doesn't show a multiply-by-amplitude at all. Same drift family as F-A02-2, called out separately because it sits in the main narrative rather than "Under the hood."
- **suggested fix**: Repoint to `:321` (White) and, if the Pink case is meant to be covered too, add `:317` (the Pink branch's own `* (%s)` amplitude multiply on its output line).

### F-A02-5: Noise's White/Pink switch is a compile-time-only binary; a continuous colour parameter is the better design
- **kind**: design
- **node**: Noise
- **severity**: medium
- **confidence**: medium
- **evidence**: `types.ts:88` — `export type NoiseType = 'White' | 'Pink'`; `codegen.odin:299-302` (`noise_is_pink`) reads the string once, at generation time, to pick which of two hard-coded code blocks (`codegen.odin:307-322`) to emit. `NodeParameterControls.tsx:231` passes `false` for `isExposable`, and `noise.md` itself explains why: "Skald's exposed-parameter mechanism only handles numbers."
- **detail**: The two DSP branches already share almost everything (same PRNG call, same bipolar conversion) — Pink is White run through three one-pole lowpasses and re-summed. A single numeric `color: 0.0-1.0` parameter, crossfading between the raw white sample and the three-pole Kellett output (`white*(1-color) + pink*color`, or blending the filter's contribution continuously), would let this be modulated at runtime, exposed, and swept — none of which is possible today because it's a string. It also removes the special-cased `isExposable=false` branch in `NodeParameterControls.tsx` and the "you cannot switch White↔Pink at game runtime" limitation the chapter has to spend a whole paragraph on.
- **suggested fix**: Replace the `type` enum with a continuous `color` (or `tilt`) float parameter, computed once per sample as a crossfade between the existing white and pink code paths.
- **manual impact**: `noise.md` — "The controls" table's `type` row, the whole "Type — what you hear" section (its White/Pink practical-use guidance would carry over almost unchanged as "low color vs. high color" instead), the "What 'expose' does" paragraph beginning "One important limitation: `type` is a string..." (would be deleted, not rewritten), and Code-vs-intent notes 2 and 3 (both currently about the binary switch).
- **migration**: Existing patches store `type: 'White'|'Pink'`. An automatic upgrade maps `'White'` → `color: 0.0` and `'Pink'` → `color: 1.0`; as long as the new codegen reduces exactly to the old White/Pink branches at the 0.0/1.0 endpoints, every saved patch (all Noise-using examples in `examples/`) reproduces byte-identical audio after migration, so this is a safe, fully backward-compatible change.

### F-A02-6: `param_ranges.odin` has a node-type override mechanism built for exactly this bug, but Noise isn't in it
- **kind**: design
- **node**: Noise
- **severity**: low
- **confidence**: high
- **evidence**: `param_ranges.odin:22-38` has a `switch node_type` block with per-node-type overrides for `FmOperator`, `LFO`, `SampleHold`, `Wavetable`, and `Distortion`, specifically to fix "the name-keyed table below is wrong for these" cases. `Noise` is not one of the cases, so the generic `case "amplitude": return {0.0, 1.0, 0.5, ""}` at `:88-89` applies — a `0.5` default that disagrees with the UI's and codegen's own `1.0` fallback (`node-definitions.ts:98-101`, `NodeParameterControls.tsx:232`, `codegen.odin:305`). `noise.md`'s own Code-vs-intent note 1 already documents the resulting confusion and explicitly points at this override mechanism: "`param_ranges.odin` has node-type-specific overrides at the top of `lookup_param_range` (`:24-38`) for exactly this class of problem, and `Noise` is not among them."
- **detail**: This is functionally the same bug the manual already logs (tagged `already-known` for that reason), but from the "best way to build this" angle the fix isn't just "change a number" — it's "use the mechanism this codebase already built for this exact failure mode." Every other node with a UI/table default mismatch got a `case` entry; Noise didn't.
- **suggested fix**: Add `case "Noise": if name == "amplitude" do return {0.0, 1.0, 1.0, ""}` to the override switch, matching the UI's and codegen's `1.0`.
- **tag**: already-known (the underlying defect; the "use the existing override switch" framing is new)

### F-A02-7: FM Operator has no output-level parameter — unlike every other source node in Skald
- **kind**: design
- **node**: FM Operator
- **severity**: high
- **confidence**: high
- **evidence**: `types.ts:43-46` — `FmOperatorParams` has only `frequency` and `modIndex`. `graph_validate.odin:26,28,31` show Oscillator, Noise and Wavetable all have an `input_amp` port; `FM_INPUTS` (`:30`) has none. `codegen.odin:473` emits a bare `math.sin(...)` with no amplitude multiply at all. The chapter's own Code-vs-intent note 4 already flags this exact gap.
- **detail**: On every historically influential FM implementation (DX7 and its descendants), each operator has an output level, and for a modulator operator that level *is* how you set modulation depth independent of what the receiving carrier does with its own Mod Index. In Skald the only way to scale a modulator's contribution is the *receiving* operator's single `modIndex`, and the only way to scale a *carrier's* loudness is an external Gain/ADSR node. This isn't just a missing convenience field — it means modulation depth and carrier loudness are both routed through machinery that has other jobs (Mod Index also shapes the timbre; a downstream Gain/ADSR also shapes the amplitude envelope), so there is no single control that means "how loud is this operator" the way there is on every other source node in the graph.
- **suggested fix**: Add an `amplitude`/`outputLevel` parameter (with an `input_amp` port, additive like the other sources) to FM Operator, defaulting to `1.0` so existing behaviour is unchanged.
- **manual impact**: `fmOperator.md` — "The controls" table (new row needed), "What it looks like in Skald"'s "What it cannot do" paragraph ("it has no amplitude, gain or waveform parameter... Every FM Operator in your patch needs a VCA, an ADSR or a Mixer channel after it"), "Why you patch it this way"'s "Something must control level" bullet, and Code-vs-intent note 4 in full (the gap it currently just describes would be closed).
- **migration**: Existing patches have no `amplitude`/`outputLevel` field. An automatic upgrade defaults it to `1.0` on load for every saved FM Operator node, which is exactly the current hard-coded behaviour — every example patch (`fm-bell-sequenced`, `fm-growl-bass`, `glassy-fm-pluck`, `gold-chime`, `fm-rhodes-electric-piano`, etc.) sounds identical before and after.

### F-A02-8: Ratio is a single log-scaled slider conflating coarse harmonic selection with fine detuning
- **kind**: design
- **node**: FM Operator
- **severity**: low
- **confidence**: medium
- **evidence**: `FMOperatorNode.tsx:15` and `NodeParameterControls.tsx:200` both expose `frequency` as one continuous `0.01-32` control (log-scaled). The chapter's own worked examples need precise non-integer values to hit specific timbres — `3.5`, `4.2`, `14` (`fm-bell-sequenced.skald.json:27`, `gold-chime.skald.json:27`, `fm-rhodes-electric-piano.skald.json:27`) — and separately need clean integers for harmonic tones (`1`, `2`).
- **detail**: This is the same class of narrowness called out in the Oscillator `fixedPitch` worked example: the single continuous dial covers both jobs (pick a harmonic register vs. nudge it slightly off for a bell/metallic character) but makes both harder than they'd be split — landing exactly on an integer with a mouse on a log slider is fiddly, and dialing in "2 plus a bit" requires fighting the same log curve that makes 0.01-1 usable. The DX7 idiom (integer Coarse 0-31 + fractional Fine 0.00-0.99, combined) exists precisely because these are two different musical decisions.
- **suggested fix**: Split the single `frequency` ratio field into a paired "Coarse" (integer stepper) + "Fine" (small-range slider) UI, computing the same underlying ratio.
- **manual impact**: `fmOperator.md` — "The controls" table's Ratio row and unit description, the whole "Ratio — what you hear as you sweep it" section (would need reframing around coarse register vs. fine offset), and Code-vs-intent note 2 (the 2-vs-1 default disagreement would become a coarse/fine default disagreement instead).
- **migration**: If done as a pure UI change — keep the stored schema as a single `frequency: number` and have the two new widgets read/write `coarse + fine` to that same field — there is **no data migration at all**: every saved patch's `frequency` value loads and renders identically, and codegen (`codegen.odin:461-469`) doesn't change. This is the lowest-risk way to do it; only decompose into two stored fields if the coarse/fine split needs to be independently exposable, in which case migration would need to derive `coarse = round(frequency)`, `fine = frequency - coarse` on load.

### F-A02-9: Mod Index slider is linear over 0-1000 when the musically useful range is roughly the bottom 1% of that
- **kind**: design
- **node**: FM Operator
- **severity**: medium
- **confidence**: high
- **evidence**: `NodeParameterControls.tsx:201` — `slider('modIndex', 0, 1000, 100)`, no scale argument, vs. `:200` — `slider('frequency', 0.01, 32, 1, 'log')`, which does pass `'log'`. The FM Operator's own source comment (`FMOperatorNode.tsx:4-5`) says "the musical range is roughly 1-8; large values are noise," and the chapter's own sweep guidance agrees: "0.5-2 ... 2-8 the classic musical window ... 10-60 aggressive ... Above ~100 you are past the point where the sidebands fit under Nyquist."
- **detail**: A linear slider from 0 to 1000 puts the entire "musical window" (1-8) inside less than 1% of the slider's drag travel, and even the "aggressive but usable" zone (up to ~60) is under 6%. Every shipped instrument's Mod Index (1.5, 3.5, 4, 6) sits in that cramped first sliver, while the default (100) and the default's double-click reset both land well outside it. The Ratio slider right above it in the same panel already solves an analogous problem with a log curve; Mod Index doesn't get the same treatment despite needing it more (three orders of magnitude of range vs. Ratio's 3200x).
- **suggested fix**: Give the Mod Index slider a log (or similar non-linear) curve, or cap the default visible range lower (e.g. 0-64) with a separate way to reach the 100-1000 "deliberately aliased" zone the growl-bass patch uses.
- **manual impact**: `fmOperator.md` — "The controls" table's Mod Index row (would note the new curve), and the "Mod Index — what you hear as you sweep it" section's framing of "0.5-2", "2-8" etc. as slider positions.
- **migration**: Pure UI/control change — the stored `modIndex` value and codegen are untouched, so every existing patch (including `fm-growl-bass` at `190`) loads and sounds identical; only the slider's drag feel changes.

### F-A02-10: FM feedback (self-modulation) doesn't exist in Skald, not even in a limited form
- **kind**: missing-feature
- **node**: FM Operator
- **severity**: medium
- **confidence**: high
- **evidence**: `types.ts:43-46` (`FmOperatorParams`), `node-definitions.ts:49-56` (`defaultFmOperatorParams`), `FMOperatorNode.tsx:14-17`, `NodeParameterControls.tsx:200-201`, `param_ranges.odin:27-28`, and `generate_fm_operator_code` (`codegen.odin:414-475`) — none reference a feedback/self-modulation term anywhere. The only self-referential state on the node is its own phase accumulator (`voice.fm_%s_phase`), which is read and rewritten but never fed back scaled into its own phase argument the way DX7-style "operator feedback" does.
- **detail**: This was one of the things I was specifically asked to check, and the chapter never claims feedback exists (so this is not a doc-bug) — it only gets close with "Stack a third operator" and "put them in parallel" in Going Further, neither of which is feedback. True operator self-feedback (mixing a scaled copy of an operator's own previous output back into its phase) is a classic, cheap (one node, one extra multiply-add) way to get sawtooth-like/gritty timbres that chaining separate operator nodes can't replicate as economically, since it needs no second node and no separate Mod wire.
- **suggested fix**: Add an optional `feedback` parameter (0-1 or radians) to FM Operator: store the previous sample's `node_%s_out` per voice, and add `feedback * prev_out` into the phase term alongside `mod_sum * modIndex`.
- **manual impact**: `fmOperator.md` would need a new "Feedback" row in "The controls," a new "Under the hood" paragraph for the self-mod term, and the "What it looks like in Skald" handle table / "What it cannot do" paragraph would need a line noting feedback is a parameter, not a wire.
- **migration**: New optional parameter defaulting to `0` (no feedback) — fully backward compatible, no existing patch's behaviour changes.

### F-A02-11: Pink and White likely don't sound equally loud at the same nominal `amplitude`
- **kind**: design
- **node**: Noise
- **severity**: low
- **confidence**: low
- **evidence**: `codegen.odin:308` (comment) — "The trailing `0.25` is a normalisation: the filter's combined gain swings the output to roughly ±4, and 0.25 pulls it back **toward** ±1 ... toward, not exactly to." The White branch (`codegen.odin:321`) has no equivalent compensation because it doesn't need one — a uniform `[-1,1)` source is already at unity peak.
- **detail**: I did not measure actual RMS of the two branches (that's why this is `confidence: low`), but the code comment itself concedes the Pink path's normalisation is approximate, not calibrated. If Pink's realised peak/RMS at a given `amplitude` setting differs meaningfully from White's, then switching `type` on a patch changes perceived loudness as a side effect of changing colour — which the `amplitude` control doesn't compensate for, and which nothing in the chapter's "Type — what you hear" section warns about (it attributes the entire White vs. Pink perceptual difference to spectral tilt, not partly to level).
- **suggested fix**: Measure RMS of both branches at matched `amplitude` and, if they differ audibly, adjust the Pink normalisation constant (or add a compensating gain) so the two colours are loudness-matched at the same nominal value.
- **manual impact**: `noise.md`'s "Under the hood" → "Pink" section (the `0.25` explanation) and "Type — what you hear" (would need to note any deliberate loudness difference, or confirm there isn't one).
- **migration**: This is the one design suggestion here with real migration cost — changing the normalisation constant changes the *audio output* of every existing patch that uses Pink noise (`wind.skald.json`, both sax patches, the tuba patches), not just its UI. It would need either (a) a versioned/opt-in change so old patches keep the current constant and only new patches get the calibrated one, or (b) accepting the change and re-tuning the shipped example patches' `amplitude` values plus regenerating any golden-file audio tests that pin Pink noise output.

## Not filed as findings — verified correct, or already logged

- Noise's `input_amp`-only legal-port list (`graph_validate.odin:28`) and FM's `input_mod`/`input_carrier`/`input_freq` list (`:30`) both match the chapters' claims exactly.
- `param_ranges.odin:27-28`'s `FmOperator` → `frequency` override (`{0.01, 32.0, 1.0, "ratio"}`) and `node-definitions.ts:53-55`'s `frequency: 2, modIndex: 100` new-node defaults both match their citations exactly, including the resulting "double-click resets Ratio from 2 to 1" behaviour the chapter describes.
- `ParameterPanel.tsx:228-235, 281-290, 310-316` (expose-toggle button and Internal Nodes list) match the FM chapter's citations exactly — no drift in this file at all, unlike the `codegen.odin` citations above.
- `generated_audio.odin:121,149,337-341,391,434-435,480-481` (exposed-parameter struct field, initialiser, clamped setter, PARAMS row, string-keyed dispatch) all match the noise chapter's quoted values exactly.
- Cycle detection exists (`codegen.odin:1040-1060`), confirming "wiring both ways creates a cycle, which codegen rejects."
- Spot-checked example JSON values all match: `fm-bell-sequenced.skald.json` (ratio 3.5/index 0 on Mod, ratio 1/index 4 on Carrier), `fm-growl-bass.skald.json` (Carrier modIndex 190, Growl LFO 4.6666667 Hz, Mapper outMin 0.3/outMax 1), `snare-sequenced.skald.json` (White noise, amplitude 0.8).
- The additive (not multiplicative) Amp/Mod semantics (`param_utils.odin:138-156`) and the growl-bass Mapper label mismatch are both already logged in the chapters' own Code-vs-intent notes and I independently confirmed both are still true — no new finding needed, `already-known`.
- `skald-ui/new_docs/NoiseNode.md` and `FMOperatorNode.md` are still exactly as stale as the chapters' Code-vs-intent notes describe (no inputs listed, no props beyond `label`, no output handle) — confirmed, `already-known`.
