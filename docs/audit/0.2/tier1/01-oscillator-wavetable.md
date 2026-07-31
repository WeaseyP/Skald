# A01 — Oscillator & Wavetable audit

## Summary

- Verified correct: the four-waveform harmonic-content claims, the PWM null/duty-cycle
  maths, the phase-at-note-onset click behaviour, the ±10-octave `input_freq` clamp, the
  `pulseWidth` 0.01–0.99 comparator clamp, the naive/non-band-limited oscillator claim, the
  detune `2^(cents/1200)` maths, unison's `>1` guard, the Reese Bass and pad-sequenced example
  walkthroughs, all Sidebar/NodeStyles/ParameterPanel/NodeParameterControls line citations
  checked, and every `dual_osc.odin.golden` / `wavetable_morph.odin.golden` citation in both
  chapters (struct fields, initializers, setters, PARAMS rows, dispatch arms) — all landed
  exactly on the claimed line.
- **New, high-severity finding**: the Instrument's Unison Voices / Detune (cents) controls —
  taught in the Oscillator chapter's own "Stack and detune" walkthrough as the standard way to
  thicken a sound — are wired **only** into `generate_oscillator_code`. `generate_wavetable_code`
  has no unison loop at all, and the per-voice phase field it gets is a single `f32`, not the
  `[unison]f32` array Oscillator gets. Put a Wavetable node in an instrument with Unison=7 /
  Detune=28 and nothing happens — same sliders, silently inert for one node type.
- A cluster of `codegen.odin` **generator-source** line citations (not the golden-file
  citations, which are all fine) drifted by 50–70 lines and now point at unrelated code: the
  Wavetable chapter's "Rate"/"Under the hood" section and the acceptance-test citation, and the
  Oscillator chapter's "What expose does" section.
- Per the added design brief: Fixed Pitch is a boolean on both nodes where the standard synth
  idiom is a continuous key-track amount + tune offset; Wavetable's square end has no
  pulse-width control despite Oscillator's square having full PWM; Wavetable has no `phase`
  parameter despite sharing Oscillator's exact per-voice-reset architecture; and `input_amp`'s
  additive-only semantics manufactures the "doesn't gate" footgun both chapters have to warn
  readers about.
- A UI/backend range mismatch on the Instrument's **Glide** slider (0–2 s in the UI vs 0–5 s
  in `param_ranges.odin`) sits directly next to the Unison/Detune controls both chapters lean
  on for their walkthroughs.

## Findings

### F-A01-1: Wavetable's "Rate"/"Under the hood" codegen.odin citations point at unrelated code
- **kind**: doc-bug
- **node**: Wavetable
- **severity**: medium
- **confidence**: high
- **evidence**: Chapter cites `codegen.odin:1082-1083` for the per-voice phase field — actual
  declaration is `wavetable_%s_phase: f32,` at `codegen.odin:1136`; cited lines 1082-1083 are
  bus-domain cross-var accumulation (`if !cross_vars[v] {`). Chapter cites `:1430-1431` for the
  phase-reset-on-steal — actual reset is `v.wavetable_%s_phase = 0.0` at `codegen.odin:1491`;
  cited lines are unrelated ADSR release-level rescaling. Chapter cites `:2307-2313` (four
  analytic shapes) and `:2315-2323`/`:2316` (crossfade + clamp) — the real
  `skald_wavetable_shape`/`skald_wavetable_sample` procs are at `codegen.odin:2367-2383` (clamp
  at `2376`); the cited range (2295-2330) is an unrelated asset-listing/game-integration comment
  block (SFX/Music-Layer name counting).
- **detail**: All the content claims are accurate (formulas, reset semantics, struct shape) —
  only the file:line pointers are wrong, consistently by ~55-70 lines in the same direction,
  suggesting the generator file grew earlier in the file after this chapter was written. A
  reader who opens the cited line to double-check the claim (which the manual explicitly invites
  — "that makes it testable") lands on completely unrelated code and may doubt the (correct)
  claim itself.
- **suggested fix**: Re-cite against current line numbers; consider citing proc names
  (`skald_wavetable_sample`) instead of raw line numbers for code that moves.

### F-A01-2: Wavetable's acceptance-test citation points at different test cases entirely
- **kind**: doc-bug
- **node**: Wavetable
- **severity**: low
- **confidence**: high
- **evidence**: Chapter cites `skald-backend/acceptance/main.odin:459-484` for the
  `wavetable_morph` fixture's pitch-tracking and spectral-centroid assertions. The actual
  `case "wavetable_morph":` block (with `assert_peak_freq(... 440.0 ...)` and
  `assert_sound_changes(... Change_Expect{centroid = .Raise}`) is at lines 579-604. Lines
  459-484 are the `dual_track`/`numeric_ids`/`melody_8step` cases — a different fixture testing
  a different node type (Oscillator's melody-gate test, in fact).
- **detail**: Same drift pattern as F-A01-1, ~120 lines this time (new `case` blocks were
  likely inserted earlier in the switch). The described test behaviour is real and correct.
- **suggested fix**: Update citation to `main.odin:579-604`.

### F-A01-3: Oscillator's "What expose does" codegen.odin citations point at unrelated procs
- **kind**: doc-bug
- **node**: Oscillator
- **severity**: medium
- **confidence**: high
- **evidence**: Chapter cites `codegen.odin:1610-1625` for "a clamped typed setter... with
  `if v < … do v = …` guards compiled in" — that code range is actually the `_feed_input`/
  `_start` proc bodies; the real typed-setter emission loop is at `codegen.odin:1670-1685`.
  Cites `:1631-1645` for the `PARAMS` introspection row — that range is the `_stop`/`_is_playing`
  procs; the real `PARAMS` loop is at `:1691-1703`. Cites `:1679-1690` and `:963-970` for the
  string-keyed `set_param`/`get_param` dispatch with the `"<node id>::<param>"` alias — those
  ranges are `clean_instrument_name`/`effective_exposed_params` doc comments; the real alias
  logic and dispatch switch are at `:1705-1750`+.
- **detail**: Same drift class as F-A01-1/2 but in the Oscillator chapter. Notably, the
  **golden-file** citations for this exact same material (`dual_osc.odin.golden:264-268,
  :350, :369-370`, etc.) are all pixel-perfect — only the `codegen.odin` generator-source
  citations drifted, consistent with new code having been inserted earlier in the file (roughly
  the 1140-1220 region, e.g. bus-domain state fields / exposure-resolution comments) after this
  section was written.
- **suggested fix**: Re-cite the setter loop, PARAMS loop, and alias/dispatch code at their
  current lines (~1670-1750); or cite the golden file exclusively, since that's already accurate
  and arguably a better source for line-stable examples.

### F-A01-4: Instrument Unison/Detune silently does nothing for Wavetable nodes
- **kind**: code-bug
- **node**: Wavetable (interacts with Instrument)
- **severity**: high
- **confidence**: high
- **evidence**: `generate_oscillator_code` (`codegen.odin:125-221`) builds a `for i in
  0..<unison_count` loop, reads `instrument.unison`/`instrument.detune` (`:179-189`), and sizes
  its phase state as `osc_%s_phase: [%d]f32` keyed by `max(instrument.unison, 1)`
  (`codegen.odin:1117`). `generate_wavetable_code` (`codegen.odin:477-512`) has **no unison
  loop, no reference to `instrument.unison`/`instrument.detune` anywhere**, and its phase state
  is a single `wavetable_%s_phase: f32` (`codegen.odin:1136`) — confirmed by
  `grep -n unison codegen.odin`, which returns matches only inside
  `generate_oscillator_code`/the Oscillator struct-field branch.
- **detail**: A user who builds an instrument mixing an Oscillator and a Wavetable (or who
  simply swaps Oscillator for Wavetable in an existing patch) and drags Unison from 1 to 7 will
  hear the Oscillator thicken and the Wavetable not move at all — same two sliders, one shared
  instrument, silently divergent behaviour per node type. This is exactly the "Oscillator vs
  Wavetable differ where they arguably shouldn't" class the brief calls out, and it directly
  undercuts the Wavetable chapter's own example patch style (a pad instrument is exactly where a
  sound designer would reach for unison thickening). Nothing warns the user; there's no error,
  no dimmed control, no manual caveat — the manual doesn't mention this limitation in either
  chapter.
- **suggested fix**: Either extend the unison/detune loop to `generate_wavetable_code` (and any
  other voice-coupled source), or, if unison is meant to be Oscillator-only, validate it at
  graph-check time and fail loudly (matching this codebase's own stated philosophy elsewhere in
  `codegen.odin`) when Unison > 1 is paired with a non-Oscillator source in the same instrument.

### F-A01-5: Design — unify or explicitly gate unison/detune scope
- **kind**: design
- **node**: Oscillator, Wavetable
- **severity**: medium
- **confidence**: medium
- **evidence**: See F-A01-4. `instrument.unison`/`instrument.detune` are Instrument-level
  fields (`param_ranges.odin:113-116`), and the UI presents them as instrument-wide controls
  (`NodeParameterControls.tsx:321-322`) with no per-node-type scoping language anywhere in the
  UI.
- **detail**: The current design silently special-cases "unison applies to exactly one source
  node type." The better shape is a shared per-voice multi-copy primitive any voice-coupled
  source can opt into (Oscillator, Wavetable, and — worth checking on a future pass — FmOperator),
  so "thicken this instrument" behaves the same regardless of which oscillator-family node
  happens to be in the graph. Short of that, fail loudly at export time instead of shipping a
  patch where a documented, always-visible slider has no audible effect.
- **manual impact**: Oscillator chapter, "Going further → Stack and detune" (currently implies
  unison/detune is a generic instrument-level tool, with no caveat); Wavetable chapter would need
  a new caveat in "What it looks like in Skald" or a "Going further" bullet, either documenting
  the limitation explicitly or (once fixed) demonstrating unison on a Wavetable pad.
- **migration**: If unison/detune is generalized to Wavetable, **every existing saved patch
  that has a Wavetable node inside an instrument with Unison > 1 changes sound** — it goes from
  silently thin (bug) to thickened/detuned (fixed) purely by re-exporting, with no schema
  change needed to trigger it. That's a behavior change hiding inside what looks like a bug fix;
  it should ship with a changelog note and ideally a project-version gate so old exports aren't
  silently re-rendered differently. If instead the fix is a loud validation error, no patch's
  *audio* changes, but any existing patch combining Wavetable + Unison>1 will newly **fail to
  export** — the user must drop that instrument's Unison to 1 or move the Wavetable to its own
  instrument.

### F-A01-6: Design — Fixed Pitch boolean should be a continuous key-track amount
- **kind**: design
- **node**: Oscillator, Wavetable
- **severity**: medium
- **confidence**: high
- **evidence**: `OscillatorParams.fixedPitch` / `WavetableParams.fixedPitch`
  (`types.ts:50,78`); both nodes gate the `frequency` field behind `showIf: (d) =>
  !!d.fixedPitch` (`OscillatorNode.tsx:20`, `WavetableNode.tsx:19`) and behind
  `data.fixedPitch &&` in the sidebar (`NodeParameterControls.tsx:212,224`); the DSP branches
  fully on the bool (`codegen.odin:137`, `:483`) with no interpolation between note-tracked and
  fixed pitch.
- **detail**: This is the exact class the added brief calls out (and cites this node as the
  worked example): the boolean is the two endpoints of what should be a continuous 0-100%
  key-track dial, with `frequency` reinterpreted as "base pitch / tune" so it's meaningful at
  every setting instead of being hidden. That also deletes the `showIf` special-casing on both
  nodes and the accompanying "an editable-but-inert control is a lie" apology comment
  (`OscillatorNode.tsx:3-5`) — the comment is only needed because the current design creates the
  inert-control problem it then works around.
- **manual impact**: Oscillator chapter — "Fixed Pitch and frequency — what you hear" section
  (rewritten around a key-track %), and Code-vs-intent note #1 ("An exposed `frequency` is a
  dead knob unless Fixed Pitch is on") would be resolved rather than merely documented. Wavetable
  chapter — "Pitch" section, "What you hear when you change Fixed Pitch and Frequency" section,
  and Code-vs-intent note #4 (same dead-knob issue) similarly resolved.
- **migration**: Every saved patch has a boolean `fixedPitch` (default `false`) plus an absolute
  `frequency` in Hz. An automatic upgrade must map `fixedPitch: false` → `keyTrack: 100%,
  tune: 0` (preserving today's audio exactly, since `frequency` was already ignored) and
  `fixedPitch: true` → `keyTrack: 0%, tune:` derived from the existing absolute `frequency`
  value (also audio-preserving). Because `frequency` becomes a relative "tune" concept rather
  than an absolute Hz value at `keyTrack < 100`, this is a breaking change to the exported Odin
  API (`<Foo>_set_frequency`'s meaning changes) for anyone with an already-shipped compiled
  instrument calling that setter from game code — needs a major version bump and a note in the
  exposed-parameter contract, not just a silent JSON upgrade.

### F-A01-7: Design — Wavetable's square end has no pulse-width control
- **kind**: design
- **node**: Wavetable
- **severity**: medium
- **confidence**: high
- **evidence**: `skald_wavetable_shape`'s square case is hardcoded 50% duty:
  `case 3: return ph < 0.5 ? 1.0 : -1.0` (`codegen.odin:2371`), with no `pulseWidth` parameter
  anywhere in `WavetableParams` (`types.ts:48-54`), `defaultWavetableParams`
  (`node-definitions.ts:58-63`), or `generate_wavetable_code` (`codegen.odin:477-512`) — contrast
  Oscillator's square, which reads a full `pulseWidth` parameter plus an unmodulated-vs-modulated
  PW port (`codegen.odin:169,196-211`; `graph_validate.odin:26`).
- **detail**: Both nodes converge on literally the same four waveforms at position/waveform =
  3-equivalent (square), but only one of them can do PWM. Since the Wavetable chapter explicitly
  sells this node as "everything you learn here... transfers directly to Serum or Vital," and
  those synths' wavetable squares are typically PWM-capable too, the gap reads as an oversight
  rather than a deliberate simplification — nothing in either manual explains why Wavetable's
  square is fixed-duty while Oscillator's is fully variable.
- **manual impact**: Wavetable chapter, "The controls" table (new Pulse Width row) and "What
  you hear as you sweep Position → 2.0 to 3.0" subsection (currently states the square end has
  "a strange middle" purely from the sine/square crossfade math — PWM would add a second,
  orthogonal axis worth describing there).
- **migration**: Purely additive — a new optional parameter defaulting to 0.5 reproduces
  today's exact square output, so no existing saved patch's audio changes.

### F-A01-8: Design — Wavetable has no phase parameter despite identical reset architecture
- **kind**: design
- **node**: Wavetable
- **severity**: low
- **confidence**: medium
- **evidence**: Oscillator exposes `phase` (0-360°, `param_ranges.odin:54-55`) and applies it
  before evaluating the waveform (`codegen.odin:191,195`). Wavetable's phase accumulator is
  reset identically on note-on (`v.wavetable_%s_phase = 0.0` at `codegen.odin:1491`, mirroring
  Oscillator's per-voice reset), but `generate_wavetable_code` never offsets it by anything —
  there is no `phase` field in `WavetableParams` (`types.ts:48-54`) and no control in either
  `WavetableNode.tsx` or the sidebar's `case 'wavetable'` (`NodeParameterControls.tsx:203-214`).
- **detail**: The Oscillator chapter spends an entire hands-on step (step 8) demonstrating that
  `phase` controls the click-vs-fade-in character of a note's onset. A Wavetable-based pad or
  pluck has exactly the same onset-transient concern (its phase resets the same way) but the
  user has zero control over it — not gated, not hidden, just absent.
- **manual impact**: Wavetable chapter — "The controls" table gains a Phase row; a short
  "Phase — what you hear" subsection could mirror the Oscillator's step 8.
- **migration**: Additive; default `phase = 0` reproduces current behavior exactly for every
  saved patch.

### F-A01-9: Design — additive-only `input_amp` manufactures the "doesn't gate" footgun both chapters warn about
- **kind**: design
- **node**: Oscillator, Wavetable
- **severity**: medium
- **confidence**: medium
- **evidence**: `get_f32_param` sums every wire into a port onto the base parameter value
  rather than multiplying (`param_utils.odin:138-156`), used identically for
  `input_amp` on both nodes (`codegen.odin:168` Oscillator, `:506` Wavetable). Both manuals
  contain a dedicated paragraph warning that wiring an ADSR into `input_amp` does not gate the
  note ("One trap worth knowing about" — Oscillator; "ADSR third, as your level envelope" —
  Wavetable's "Why you patch it this way").
- **detail**: Gating a note with its own envelope is close to the first thing a new user tries
  on an amp-modulation input, and the current design guarantees that attempt produces no error
  and the wrong audio (the "off" state is still whatever `amplitude` is set to, not silence).
  Both chapters exist partly to explain around this rather than the design avoiding it. A
  multiplicative amp destination (or a second, clearly-multiplicative port living alongside the
  additive one) would make the naive/first-guess patch correct instead of quietly wrong.
- **manual impact**: Both chapters' footgun-avoidance paragraphs (cited above) could shrink to a
  sentence or disappear if the destination becomes multiplicative by default.
- **migration**: Changing `input_amp` to multiplicative changes the rendered audio of any
  already-saved patch that wires something into it (the additive sum today, e.g. `0.5 + lfo`,
  becomes a product, e.g. `0.5 * (1 + lfo)` or similar — different curve, different levels).
  This is not safely automatable without either a project-version gate that keeps old patches on
  the additive path, or introducing the multiplicative behavior under a new port name
  (`input_amp_mult`) so existing wires keep today's behavior and only new patches get the safer
  default.

### F-A01-10: Instrument Glide slider range (UI) doesn't match the backend clamp
- **kind**: code-bug
- **node**: Oscillator, Wavetable (Instrument-level control both chapters' examples use)
- **severity**: low
- **confidence**: high
- **evidence**: UI slider: `slider('glide', 0, 2, 0.05)` (`NodeParameterControls.tsx:320`) caps
  at 2 seconds. Backend clamp: `case "glide": return {0.0, 5.0, 0.05, "s"}`
  (`param_ranges.odin:117-118`) allows up to 5 seconds.
- **detail**: This sits directly beside the Unison (`:321`) and Detune (`:322`) sliders both
  chapters' walkthroughs use, and follows the same "what you see is not what you hear" class as
  the calibration example, just inverted — here the UI is *narrower* than the backend rather
  than wider, so no silent clamping happens, but a user (or a P-lock, or hand-edited JSON) can
  never reach glide times the exported Odin setter would otherwise accept and clamp to
  correctly. Low severity since nothing produces wrong audio, only an unreachable-but-valid
  range.
- **suggested fix**: Either raise the UI slider max to 5 to match `param_ranges.odin`, or lower
  the backend clamp to 2 if 2s was judged the sane maximum — whichever is authoritative should
  drive both.

### F-A01-11: Speculative — should Oscillator and Wavetable be one node?
- **kind**: design
- **node**: Oscillator, Wavetable
- **severity**: low
- **confidence**: low
- **evidence**: Oscillator's `waveform` is a 4-way discrete select over exactly the same four
  shapes Wavetable continuously morphs across (`OscillatorNode.tsx:16` vs
  `codegen.odin:2369-2373`'s `skald_wavetable_shape`).
- **detail**: Not fully verified, flagged for a later pass: given F-A01-4, -7 and -8 above, the
  two nodes' feature sets differ almost entirely by omission rather than intent (Wavetable is
  missing unison, PWM and phase; Oscillator is missing continuous morph and `input_pos`). It may
  be cleaner long-term to fold "waveform" into "position" on a single source node (discrete
  values 0/1/2/3 reproduce today's Oscillator exactly; anything between is today's Wavetable),
  removing an entire class of sibling-node drift instead of patching each gap individually. This
  needs product input on whether the two are meant to stay distinct (e.g. for palette
  simplicity/onboarding) before treating it as an actionable recommendation.
- **manual impact**: Would merge both chapters into one, a large rewrite — not a small
  citation fix.
- **migration**: If merged, every saved Oscillator/Wavetable node needs a type-preserving
  upgrade (Oscillator's string `waveform` → position 0/1/2/3, keeping the discrete/no-morph
  feel unless the user opts in) plus a codegen path that still emits the simpler Oscillator-style
  code when position is pinned to an integer, so existing exported APIs and golden fixtures
  don't silently change shape.
