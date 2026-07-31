# A10 — Foundations / Bass Teardown / Complexity Ladder audit

## Summary

- The core architectural claims hold up: one-number-per-node codegen, no block-rate control
  path, `(base) + (mod)` additive summing, exponential pitch (`base * 2^clamp(sum,-10,10)`),
  the port-naming rule (`input` vs `input_<param>`) and its hard validation, voice/bus domain
  split, and the exposure mechanics (baked constant vs `p.<field>`, typed setter with clamp,
  string-keyed `"<nodeId>::<param>"` alias) all match `codegen.odin` / `param_utils.odin` /
  `param_ranges.odin` / `graph_validate.odin` exactly as described.
- Every named **Try it** patch exists and its content matches the manual's claims almost to the
  character: `saw-lead.skald.json`, `sine-sub-bass.skald.json`, `bass-sequenced.skald.json` and
  `supersaw-hypersaw-lead.skald.json` were checked field-by-field (frequencies, ADSR values,
  mixer levels, BPM, sequencer note/velocity/duration tables) and matched, including several
  citations accurate to the exact line.
- `graph_validate.odin`, `param_ranges.odin`, `param_utils.odin` and the UI `.tsx` files are
  cited with high precision throughout all three chapters (checked ~20 citations, only tiny
  single-digit drift). **`codegen.odin` citations are a different story**: past roughly its
  first 400 lines, almost every citation in all three chapters is off by 50-65 lines, and
  several land on genuinely unrelated code (see F-A10-1). This is the single biggest
  "manual accuracy" problem in this scope.
- Several `FIXED.md` packets were checked against current code and are **genuinely resolved**
  (Reverb pre-delay is implemented, Distortion `shape` is in the TS contract, Gain/Resonance/
  Tone/Delay-time ranges are aligned, `voiceCount` range is aligned, example JSON free-run
  rates and oscillator frequencies were corrected, the Piano Roll now reaches A0) — but the
  chapters' own `Code-vs-intent notes` sections in this scope were not all updated to match,
  so several are now themselves inaccurate (F-A10-3 through F-A10-7). This is exactly the
  "verify whether they are genuinely resolved" check the brief asked for.
- Found one direct **self-contradiction within scope**: `60-complexity-ladder.md` claims four
  named example files are rejected by the port validator for using legacy handle names, while
  `00-foundations.md` (correctly) describes the exact compatibility shim that remaps those same
  names before validation, and `examples/AUDIT.md` marks all four `VALID (legacy)` (F-A10-2).
- Per the coordinator's addendum, five architecture-level `design` findings are included
  (F-A10-14 through F-A10-18): no block-rate path, unscaled additive-only modulation, the
  mono-with-bolted-on-stereo signal model, the global name-keyed exposure range table, and the
  dead `voiceStealing` field.

## Findings

### F-A10-1: Systematic citation drift in `codegen.odin` — several citations now point at unrelated code
- **kind**: doc-bug
- **node**: (chapter-wide — architecture citations)
- **severity**: medium
- **confidence**: high
- **evidence**: Six concrete, verified mismatches (current file, not the manual's cited version):
  - `00-foundations.md` cites `codegen.odin:1790` for `node_<id>_out: f32 = 0.0`. Line 1790 is
    now `fmt.sbprint(&sb, "\tp.total_samples += 1\n\n")`. The actual declarations are at 1850/1954.
  - `00-foundations.md` (and `50-bass-teardown.md` "Under the hood") cite `codegen.odin:2417-2418`
    for the master `tanh` limiter. Lines 2417-2418 are now arguments to a `generate_processor_code`
    call (`false, plocks[:],`). The actual limiter is at lines 2477-2478 (and a second copy at
    2683-2684 for a batch-render path).
  - `00-foundations.md` cites `codegen.odin:714` for the VCA's `node_out = (input) * (gain)`.
    Line 714 is now inside `generate_mixer_code`'s channel loop
    (`mix_sum_%s += %s * (%s);`). The actual VCA line is now ~767.
  - `00-foundations.md` cites `codegen.odin:667-682` for the Panner code. That range is now
    inside `generate_mixer_code` (the `inputCount` parsing switch). The actual Panner function
    is now at ~720-734.
  - `00-foundations.md` cites `codegen.odin:987-1007` for the DAG/cycle-rejection error message.
    That range is now a p-lock-name-collection helper and the start of `node_key_emittable`
    (string-literal-safety for the `"<id>::<param>"` alias) — nothing to do with cycles. The
    actual cycle check is now at ~1040-1060.
  - `50-bass-teardown.md` **and** `60-complexity-ladder.md` both cite `codegen.odin:1342-1354`
    for "Skald always steals the oldest voice." That range is now PRNG-seeding code for
    Noise/SampleHold voice state, unrelated to voice stealing. The actual oldest-voice
    selection is now at ~1395-1410.
- **detail**: A reader who opens the cited line to check a claim — which the manual explicitly
  invites ("the chapter cites the file and line that produces that number") — lands on unrelated
  code and either concludes the manual is unreliable or wastes time hunting nearby. The drift is
  ~0-10 lines for citations before roughly line 400 of the current file (still within the
  "not a finding" tolerance) and grows to a consistent ~55-65 lines afterward, which is where all
  six confirmed misses live. The growth point lines up with the Reverb pre-delay feature
  (`FIXED.md` P1/B5) and other fix packets adding code earlier in the file. By contrast,
  `graph_validate.odin`, `param_ranges.odin`, `param_utils.odin` and the UI `.tsx` files checked
  in this scope are still cited accurately (checked ~20 citations across all three chapters).
- **suggested fix**: doc-bug — re-run the citation-extraction pass against current `codegen.odin`
  line numbers specifically (the other cited files don't need it); the claims themselves are
  correct, only the line numbers are wrong.

### F-A10-2: `60-complexity-ladder.md` contradicts `00-foundations.md` (and `examples/AUDIT.md`) about whether legacy port names are rejected
- **kind**: doc-bug
- **node**: (chapter-wide — example-file validity claims)
- **severity**: high
- **confidence**: high
- **evidence**: `60-complexity-ladder.md`, "The complexity ladder" intro paragraph: "the ones with
  modulation wires additionally use pre-rename handle names (`cutoff`, `frequency`,
  `pulseWidth`) that the current port validator rejects (`graph_validate.odin:26-34`)," repeated
  verbatim in its own `Code-vs-intent notes` item 8, naming `complex-drone-machine.skald.json`,
  `pwm-pad.skald.json`, `lfo-filter-wobble-bass.skald.json` and `fm-bell-tone.skald.json`.
  Contradicted by: (a) `skald-backend/core/json.odin:36-49` (`normalize_port`), which maps
  `cutoff`→`input_cutoff`, `frequency`→`input_freq`, `pulseWidth`→`input_pulseWidth` etc.
  *before* validation runs — exactly what `00-foundations.md` itself correctly documents
  ("Older saved files that use friendlier port names still work... `json.odin:36-49`"); and
  (b) `examples/AUDIT.md:67,81,87,89`, which lists all four named files as
  `VALID (legacy) | exit 0 | Loose graph → generic Asset_* API`, i.e. they codegen and compile
  cleanly, and `AUDIT.md`'s own legend explains why: "still codegen's fine because
  `core/json.odin`'s `build_project_from_graph` wraps any no-Instrument-node graph as a single
  SFX... a deliberate, documented compatibility fallback, not a bug." `50-bass-teardown.md`'s own
  `Code-vs-intent notes` item 1 independently confirms `lfo-filter-wobble-bass.skald.json`
  "codegens cleanly and is listed as VALID in `examples/AUDIT.md:67`."
- **detail**: This is a hard, checkable factual disagreement inside this agent's own scope: one
  chapter says these four files fail validation, another chapter (correctly) describes the exact
  mechanism that makes them succeed, and the ground-truth audit file agrees with the second
  chapter. A reader of `60-complexity-ladder.md` alone would believe four legitimate, working
  example files are broken and would not attempt to load them.
- **suggested fix**: doc-bug in `60-complexity-ladder.md` — remove or correct the "the current
  port validator rejects" claim and its `Code-vs-intent` item 8 sentence about those four files;
  they are legacy-schema-valid, not rejected. The "no Instrument wrapper → silent on Play"
  half of the same paragraph is still accurate and should stay.

### F-A10-3: `60-complexity-ladder.md` Code-vs-intent item 1 (Reverb Pre-Delay "completely inert") is stale — the feature is implemented
- **kind**: doc-bug
- **node**: Reverb
- **severity**: medium
- **confidence**: high
- **evidence**: Chapter text: "The Reverb node's Pre-Delay control does nothing... `generate_reverb_code` reads only `decay` and `mix` and hardcodes its tap at 75 ms... the string `preDelay` appears nowhere in `skald-backend/`." Current `codegen.odin` (around the reverb generator) computes
  `pre_delay_str := get_f32_param(graph, node, "preDelay", "", 0.02)`, clamps it, converts to
  `pre_delay_samples`, and reads a dedicated `p.reverb_<id>_pre_buffer` ring before the existing
  75 ms feedback comb (`pre_delayed_input_%s`, `pre_read_index_%s` etc). The UI slider
  (`NodeParameterControls.tsx:237`, `slider('preDelay', 0, 0.25, 0.02)`) and `param_ranges.odin`'s
  `preDelay` entry (`{0.0, 0.25, 0.02, "s"}`) agree with this. This matches `FIXED.md`'s
  "P1 / B5 - Reverb pre-delay" packet, which explicitly implemented this and listed
  `nodes/reverb.md` as the stale chapter to fix — but did not list `60-complexity-ladder.md`,
  whose own copy of this note was apparently missed.
- **detail**: A reader of this chapter would believe Pre-Delay is a decorative dead control and
  either avoid it or build a manual Delay-based workaround unnecessarily; the control now works
  as authored.
- **suggested fix**: doc-bug — remove/rewrite `60-complexity-ladder.md` Code-vs-intent item 1;
  already-known via `FIXED.md` P1/B5 (that packet just didn't enumerate this chapter).
- **already-known**: yes (FIXED.md P1/B5), but the specific chapter instance was missed.

### F-A10-4: `60-complexity-ladder.md` Code-vs-intent item 7 (Distortion `shape` "absent from the TypeScript contract") is stale — fixed
- **kind**: doc-bug
- **node**: Distortion
- **severity**: low
- **confidence**: high
- **evidence**: Chapter text: "`DistortionParams` has no `shape` field... and `defaultDistortionParams` does not set one... A freshly dragged Distortion node therefore has an undefined `shape`." Current `skald-ui/src/definitions/types.ts:118`: `shape: 'classic' | 'soft' | 'hard' | 'asymmetric';` and `node-definitions.ts:132`: `shape: 'classic'` in `defaultDistortionParams`. Matches `FIXED.md`'s "P10 - Distortion `shape` TypeScript contract" packet exactly.
- **detail**: The described bug (uncontrolled select on a fresh node) no longer reproduces; a new Distortion node now has a defined `shape` from creation.
- **suggested fix**: doc-bug — remove this Code-vs-intent item.
- **already-known**: yes (FIXED.md P10), but `FIXED.md` only names `nodes/distortion.md` as stale, not this chapter's duplicate note.

### F-A10-5: Range-alignment fixes (Gain, Resonance, Tone, Delay time, voiceCount) landed, but both `00-foundations.md` and `60-complexity-ladder.md` still describe the old mismatches
- **kind**: doc-bug
- **node**: VCA / Filter / Distortion / Delay / Instrument
- **severity**: medium
- **confidence**: high
- **evidence**: Verified current code: `NodeParameterControls.tsx:304` `slider('gain', 0, 4, 0.75)` (was 0-1); `:144` XY pad `maxY={20}` and `:153` resonance number field `max: 20` (was 30 on the pad); `:244` `slider('tone', 100, 20000, 4000, 'log')` (was 100-10000); `:173` `slider('delayTime', 0, 2, 0.5)` (was 0.001-5); `param_ranges.odin:111` `voiceCount` is now `{1.0, 32.0, 8.0, ""}` (was `{1,64,8,""}`). All now match their UI counterparts. Still-stale manual text: `00-foundations.md` "The controls" table rows for `voiceCount` ("1 – 64 (backend) / 1 – 32 (editor)") and `gain (VCA node)` ("0 – 4 (backend) / 0 – 1 (editor)"); its own Code-vs-intent items 2, 7 and 8 (resonance 30-vs-20, voiceCount three-way split, gain 0-4-vs-0-1); `60-complexity-ladder.md`'s "The controls" `voiceCount` row (same 1-64/1-32 split) and its Code-vs-intent item 6 (all four range mismatches). `FIXED.md`'s "P2 / B3 - Parameter range alignment" packet explicitly names all of these as the stale sections to fix.
- **detail**: A reader would believe there is still a "what you see is not what you hear" gap on these four parameters and would over-explain/avoid them; the editor and backend now agree everywhere this packet touched.
- **suggested fix**: doc-bug — update the two "The controls" table rows and the three Code-vs-intent items named above in both chapters.
- **already-known**: yes (FIXED.md P2/B3, which names these exact sections).

### F-A10-6: `50-bass-teardown.md`'s stored-frequency and free-run-rate claims are stale — the example files were corrected
- **kind**: doc-bug
- **node**: Oscillator / LFO / Sample & Hold
- **severity**: low
- **confidence**: high
- **evidence**: Verified current JSON: `sine-sub-bass.skald.json:3` now stores `"frequency": 440` (chapter Exercise 1 step 1 says "the file stores `"frequency": 55`"); `lfo-filter-wobble-bass.skald.json:4` now stores `440` (Code-vs-intent item 11 says `73.42`); `fm-growl-bass.skald.json:95` now stores `"frequency": 4.6666667` for its 1/8-synced, 140 BPM LFO (item 10 says `frequency: 6`); `wobble-samplehold-bass.skald.json:82` now stores `"rate": 4.6666667` for its 1/8-synced, 140 BPM S&H (item 10 says `rate: 8`); `random-acid-bass.skald.json:82` now stores `"rate": 8.4` for its 1/16-synced, 126 BPM S&H (item 10 says `rate: 10`). All match `FIXED.md`'s "P12 - Documentation and metadata drift" packet exactly, which names these precise chapter passages as stale.
- **detail**: Minor — none of these values were ever audible (fixedPitch is off / bpmSync is on in every case, so the stored numbers are cosmetic), so no exercise breaks, but a reader inspecting the JSON to "learn what note/rate the patch uses" (which several exercises explicitly invite) now gets numbers the chapter doesn't match.
- **suggested fix**: doc-bug — update Exercise 1 step 1 and Code-vs-intent items 10-11 with the corrected values.
- **already-known**: yes (FIXED.md P12, which names these exact passages).

### F-A10-7: `50-bass-teardown.md`'s Piano Roll range claims are stale — the Piano Roll now reaches A0
- **kind**: doc-bug
- **node**: Sequencer / Piano Roll
- **severity**: medium
- **confidence**: high
- **evidence**: Chapter Exercise 4 step 6: "the Piano Roll only displays MIDI 36 to 84 (`Sequencer/PianoRoll.tsx:20-21`), so every note in this patch below C2 is invisible and unreachable there." Code-vs-intent items 2-3 repeat this and its consequence. Current `PianoRoll.tsx:20-21`: `MIN_NOTE = 21 // A0 (lowest key on an 88-key piano)`, `MAX_NOTE = 84 // C6`. All twelve bass patches' lowest notes (24, 28, 29, 31, 34...) are within 21-84 and are now visible/editable directly in the Piano Roll. Matches `FIXED.md`'s "P6 - Piano Roll bass-note range" packet, which names these exact bass-teardown passages as stale, including the note that "the statement that painting a new step gives MIDI 60 must be narrowed to the Step Grid" (the Step Grid still defaults new notes to 60; only the Piano Roll's display/edit range changed).
- **detail**: The chapter still teaches a workaround (typing raw MIDI numbers into Step Properties) for a limitation that no longer exists for the Piano Roll; a reader would avoid a now-functional, more convenient editing surface.
- **suggested fix**: doc-bug — update Exercise 4 step 6 and Code-vs-intent items 2-3 to reflect the new A0-C6 range, and narrow the "painting gives MIDI 60" claim to the Step Grid specifically.
- **already-known**: yes (FIXED.md P6, which names these exact passages).

### F-A10-8: `lfo-filter-wobble-bass.skald.json`'s LFO has a dead `frequency: 8` that isn't covered by the chapter's own "misleading stored rate" note
- **kind**: doc-bug
- **node**: LFO
- **severity**: low
- **confidence**: medium
- **evidence**: `lfo-filter-wobble-bass.skald.json:3`: `{"label": "LFO", "frequency": 8, "waveform": "Sine", "bpmSync": true}` — `bpmSync` is `true` but there is no `syncRate` key at all. `codegen.odin`'s `bpm_sync_seconds_expr` unconditionally substitutes a BPM-derived expression whenever `bpmSync` is true (`rate := get_string_param(node, "syncRate", "1/4")`, defaulting the division itself), so the stored `frequency: 8` never reaches the generated code, exactly the bug class `50-bass-teardown.md` Code-vs-intent item 10 documents ("Free-run rate fields are stored but inert on BPM-synced nodes") — but that item's file list is `fm-growl-bass`, `wobble-samplehold-bass` and `random-acid-bass` only; this file (which the chapter separately discusses at length as "Rung X") isn't included.
- **detail**: Low impact since the LFO's actual behavior (a 1/4-note-synced wobble that doesn't move the cutoff perceptibly regardless, per the chapter's own point about this file) is unaffected either way — but it's the same documented bug pattern with one more instance the manual missed while cataloguing it.
- **suggested fix**: doc-bug — add this file to Code-vs-intent item 10's list, or note explicitly that it also lacks a `syncRate` value (defaulting to 1/4) alongside its dead `frequency`.

## Design findings (architecture-level, per coordinator addendum)

### F-A10-14: No block-rate path — every modulator, however slow, is recomputed every sample
- **kind**: design
- **node**: (engine-wide)
- **severity**: n/a (design)
- **confidence**: medium
- **evidence**: `00-foundations.md` "Audio rate and control rate": "Skald has no separate control rate... every node in the patch emits code that runs once, for this one sample." `60-complexity-ladder.md`: "Everything in Skald runs at audio rate — there is no separate control-rate scheduler," and its own cost warning: "unison multiplies voices. 8 voices × 7 unison copies = 56 sawtooth oscillators per sample, and the preview is doing all of that in a browser."
- **detail**: Per-sample-everything buys the manual's headline benefit (zero zipper noise, legal audio-rate modulation) but caps how large a patch can get before CPU cost forces the user to cut voices/unison rather than complexity. A block-rate path for genuinely slow control sources (LFOs below ~20 Hz, envelopes, S&H) with linear interpolation between blocks would recover most of that CPU headroom for the common case (slow modulation) while leaving audio-rate modulation available as an explicit opt-in — the manual already frames "control rate" as *intent*, not *mechanism*, which is exactly the seam a block-rate mode would use.
- **manual impact**: `00-foundations.md` "Audio rate and control rate" section (the "Skald has no separate control rate" paragraph and its three practical-consequence bullets) and the "Under the hood" skeleton's `for v_idx in 0..<8` comment; `50-bass-teardown.md` "Rate and domain" section (the "There is no separate 'control rate' in Skald" paragraph); `60-complexity-ladder.md`'s "Rate." paragraph and its voice-count cost warning.
- **migration**: No JSON schema change needed for existing patches — this is purely an engine/codegen behavior. If block-rate became the *default* for LFO/S&H/envelope nodes, any patch that deliberately drives an audio-rate destination from one of those nodes (the manual explicitly calls this out as legal: "wire an Oscillator's output into a Filter's cutoff... this is a legal, working patch") would need an explicit per-node "force audio rate" opt-out to keep sounding the same; an automatic upgrade-on-load could default that flag to "on" (today's behavior) for every existing saved node, so no example patch changes sound on first load.

### F-A10-15: Modulation is unscaled and additive-only — the Mapper exists solely to compensate for a missing per-connection amount
- **kind**: design
- **node**: (engine-wide — modulation model)
- **severity**: n/a (design)
- **confidence**: medium
- **evidence**: `00-foundations.md`: "the code generator does not scale anything; it literally adds the modulation to the parameter value... Your filter is sitting at 800 Hz. Your LFO swings ±1. Your cutoff now wobbles between 799 Hz and 801 Hz." `50-bass-teardown.md` Rule 2: "modulation ADDS to the knob, it does not replace it. This is the single most important fact in this chapter." `60-complexity-ladder.md`: "A Mapper set to output 0-3500 feeding a filter parked at 1100 Hz gives you 1100-4600 Hz, not 0-3500 Hz."
- **detail**: Every non-trivial patch in both worked-example chapters inserts a dedicated Mapper node immediately after almost every modulator for no reason other than unit conversion and depth scaling (`synth-reese-bass`, `wobble-samplehold-bass`, `fm-growl-bass`, `supersaw-hypersaw-lead`, and the diagnostic "Rung X" patch, which exists purely to teach this gap). A per-connection `amount`/`depth` scalar (multiplying the source before summing) plus an optional per-destination base offset would fold the single most common 2-node idiom in the whole example library into one wire, and would eliminate the entire "raw modulator does nothing" failure mode the manual has to spend a full diagnostic exercise teaching.
- **manual impact**: `00-foundations.md` "Unipolar and bipolar, and why the Mapper has to exist" section and "The modulation-sum line" under "Under the hood"; its Try-it steps 8-9 (the LFO-does-nothing-until-Mapper exercise). `50-bass-teardown.md` Rule 2 and the entire "Rung X" diagnostic patch/writeup. `60-complexity-ladder.md`'s "Modulation in Skald is additive" paragraph and its "More than one modulator" technique section.
- **migration**: Backward compatible if added as a new optional field on each connection, defaulting to `1.0` (today's implicit, unscaled behavior) for anything already saved. No existing example patch needs to change to keep sounding identical; existing Mapper-based patches would keep working exactly as before (a Mapper feeding a per-connection-scaled port is still legal), and could optionally be simplified later, but that's cleanup, not a requirement.

### F-A10-16: One-number-per-node is the chapter's founding claim, but stereo is bolted onto one node and silently lost through the rest of the graph
- **kind**: design
- **node**: Panner / Mixer / Output
- **severity**: n/a (design)
- **confidence**: medium
- **evidence**: `00-foundations.md`'s epigraph: "Everything in Skald is one number per node per sample," and "every node becomes exactly one local variable holding one number." `60-complexity-ladder.md`: "The Panner writes a left/right pair, but it also writes a mono downmix, and every other node reads the mono one... Only `GraphOutput` picks up the stereo pair, and only when the Panner feeds it directly... So `Panner → Mixer → Output` silently collapses to mono. Pan last."
- **detail**: The manual treats the Panner→Mixer→Output collapse as a rule to memorize ("pan last") rather than questioning whether a mono-only signal model should have a special-cased stereo escape hatch at all. Given stereo space (delay, reverb, panning) is one of the chapter's own seven techniques, a first-class stereo signal kind (or at minimum, validated stereo propagation through Mixer) would remove an entire class of silent, undetectable mix mistakes — right now nothing warns the author that their pan just evaporated.
- **manual impact**: `00-foundations.md`'s title epigraph and the "A signal is just a number, over and over" paragraph containing "every node becomes exactly one local variable holding one number" — the chapter's foundational claim would need re-scoping to "one number per node, except where stereo is explicit." `60-complexity-ladder.md`'s "Space" section item 5 ("Stereo only survives a direct wire to Output") and its Panner row in the modulation-inputs table.
- **migration**: The most invasive of these findings. Existing patches assume a single scalar per node/port; propagating true stereo through arbitrary nodes would roughly double per-node state and generated code. A safe path is additive, not a rewrite: keep mono as the default signal kind (unchanged for every existing example) and only make the *Mixer* (and other nodes downstream of a Panner) stereo-aware when they detect a stereo-typed input, emitting a validation error instead of a silent downmix when a stereo signal enters a mono-only port. No existing saved patch would need migrating since none currently relies on the silent-downmix behavior on purpose (it is uniformly described as a trap); the only user-visible change is that a previously-silent mistake becomes a loud one.

### F-A10-17: Exposure clamps come from a global name-keyed table, not from the author's per-instance UI bounds — the root cause of the whole "range parity" bug class
- **kind**: design
- **node**: (engine-wide — exposure model)
- **severity**: n/a (design)
- **confidence**: medium
- **evidence**: `00-foundations.md`: "Those ranges come from `skald-backend/core/param_ranges.odin`, and the file's top section is worth your attention: it holds node-type-specific overrides that exist because the generic name-keyed table was wrong for certain nodes." `50-bass-teardown.md`: "exposure changes the *clamp*, and the clamp comes from `param_ranges.odin`, not from the UI slider." `60-complexity-ladder.md`'s own Code-vs-intent items 2 and 6 are two of several findings in this scope whose sole cause is exactly this: the UI slider bound and the backend range-table bound are two independently-maintained numbers that drift (Filter resonance 30-vs-20 before F-A10-5's fix; VCA gain, Distortion tone, Delay time similarly, per the same finding).
- **detail**: `param_ranges.odin` is a single global table keyed by parameter name (plus a handful of node-type overrides for known conflicts like FM ratio/LFO frequency). Every time the UI's per-control bounds are edited without a matching edit to this table (or vice versa), a new instance of the exact bug class F-A10-5 just fixed four of is created — the architecture has no mechanism to prevent it from recurring, only manual discipline. Storing the author's chosen min/max alongside the exposed flag (seeded from the UI control's bounds at expose-time) would make the clamp and the slider the same number by construction.
- **manual impact**: `00-foundations.md` "What expose does" section (the paragraph beginning "Those ranges come from..."); `50-bass-teardown.md` "What expose does, and why you would" section (the "two gotchas" paragraph); `60-complexity-ladder.md` "What expose does, and why you would" section. Also the entire apparatus of Code-vs-intent items across all three chapters devoted to range mismatches would be retired by construction rather than requiring a fresh alignment pass every time a slider changes.
- **migration**: Additive schema change — each exposed parameter would need a stored `{min, max}` (or reuse the existing per-node params object). Files saved before this change have no such field; an automatic upgrade-on-load would synthesize it from the current UI control's bounds (from `node-definitions.ts`) at load time, defaulting silently to today's global-table lookup until the file is next saved. Every existing example patch keeps behaving exactly as it does today on first load.

### F-A10-18: `voiceStealing` is a fully-typed, UI-invisible field the backend never reads — the "oldest" algorithm is not actually a choice
- **kind**: design
- **node**: Instrument
- **severity**: n/a (design)
- **confidence**: medium
- **evidence**: `60-complexity-ladder.md` "What you actually hear": "Below the number of notes you play, you get voice stealing... Skald always steals the oldest voice (`codegen.odin:1342-1354`, real location now ~1395-1410 per F-A10-1)." Its own Code-vs-intent item 4: the type union offers `'oldest' | 'newest'` (`types.ts:194`), every example serializes one of them, no control renders it, and the string appears nowhere in `skald-backend/` — `note_on` unconditionally steals the oldest voice.
- **detail**: The type system and every saved example already model a real choice ("oldest" vs "newest" stealing, or more usefully, priority by remaining envelope level) that the backend silently ignores. This is flagged elsewhere as a dead-field bug; the design angle is that "oldest" is also not obviously the *right* default in every case — a pad instrument benefits from "steal the quietest/most-released voice" far more than "steal the oldest," which can cut off a note that has barely started in favor of one that's nearly silent in its release tail.
- **manual impact**: `60-complexity-ladder.md` "What you actually hear" → "Voice count" paragraph (the "Skald always steals the oldest voice" sentence would need to become "Skald offers X stealing strategies" once implemented) and its Code-vs-intent item 4.
- **migration**: None required for existing patches — `FIXED.md`'s cross-reference confirms every current example already stores `voiceStealing: "oldest"`, so wiring the field up to actually select a strategy changes nothing until an author picks `"newest"` (or a new priority mode is added), and even then it's a new, deliberately-chosen behavior, not a break.
