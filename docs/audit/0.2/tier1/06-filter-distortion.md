# A06 — Filter & Distortion audit

## Summary

- Both chapters' core DSP claims check out against the live code: the Chamberlin SVF
  algebra (`low += f*band; high = input - low - q*band; band += f*high`), the two
  stability clamps (`cutoff <= sample_rate*0.16`, `q` ceiling `1.9-f`, floor `0.05`),
  the four Distortion curve formulas (`classic`/`soft`/`hard`/`asymmetric`), the
  one-pole Tone coefficient and its ~7 kHz saturation point, the additive (not
  exponential) cutoff-modulation expression, and the master `tanh` limiter are all
  verified **TRUE** against current `codegen.odin`.
- Sidebar tooltips (`Sidebar.tsx:271,274`), the node accent color
  (`NodeStyles.ts:97`), the `ParamNode.tsx:79` select fallback, the `filterType`
  legacy-key fallback (`param_utils.odin:193-200`), and the golden test literal
  (`filter_sweep.odin.golden:299`) are all verified **TRUE** exactly at the cited
  lines.
- **The single biggest finding: two "Code-vs-intent" notes in these chapters (and one
  in 00-foundations.md) describe a UI bug — resonance panel/XY-pad ceiling of 30 vs.
  backend 20 — that has already been fixed in code** (`docs/manual-source/FIXED.md`
  packet P2), but the chapter text was never updated to say so. The same is true for
  Distortion's Tone-range mismatch (P2) and for the `shape` field missing from
  `DistortionParams` (P10, fixed). `FIXED.md` explicitly lists which chapter sections
  needed updating for these packets and **omits `nodes/filter.md` and
  `nodes/distortion.md` entirely** — the fix shipped, the tracking document was
  updated for other chapters, and these two chapters were missed.
- A real, previously-unflagged **factual reversal**: the Filter chapter says per-voice
  filter state "is zeroed when a voice is stolen or retriggered." The code does the
  opposite — state is zeroed only for **fresh** (never-stolen) voices and is
  explicitly **preserved** on steal/retrigger, by design, to avoid a click. This is
  not a citation-drift issue; the claim is backwards.
- Line citations into `codegen.odin` drift by a consistent ~50-65 lines for
  everything past roughly line 600 (state struct fields, bus-domain dispatch, setter/
  PARAMS emission, WASM exports, the master limiter) and several land on genuinely
  unrelated code (ADSR voice-lifecycle logic, package-header emission, cross-domain
  variable aggregation) rather than merely "a few lines off."
- Three design-quality findings were added per the mid-task brief update: Filter's
  `type` is needlessly compile-time-only (the SVF already computes all four outputs
  every sample), cutoff modulation being additive-in-Hz is a defensible-but-costly
  choice that the Mapper node exists solely to work around, and Distortion is missing
  the two features every real distortion device has (output/makeup gain,
  oversampling).

## Findings

### F-A06-1: Filter chapter states filter state is zeroed on steal; code does the opposite
- **kind**: doc-bug
- **node**: Filter
- **severity**: high
- **confidence**: high
- **evidence**: filter.md: "Each voice gets its own private filter state
  (`skald-backend/core/codegen.odin:1075-1078`), and that state is zeroed when a
  voice is stolen or retriggered (`:1424-1425`)." Actual code:
  `skald-backend/core/codegen.odin:1471-1501` (`// Reset per-voice DSP state — FRESH
  voices only. A stolen voice keeps its oscillator/filter/tone state so the retrigger
  is sample-continuous... old hard reset... was an audible click on every steal.`),
  gated by `if !stolen { ... v.filter_%s_low = 0.0; v.filter_%s_band = 0.0 ... }` at
  `:1477,1483-1485,1497`.
- **detail**: The chapter's claim is inverted. The filter's `low`/`band` state is
  cleared only for a **fresh** voice allocation (a slot that was previously idle);
  when a voice is **stolen** and retriggered, the filter state is deliberately kept
  so the new note's filter continues from where the old note's left off, avoiding an
  audible click. A reader would expect the opposite — that stealing/retriggering
  resets the filter — which is exactly backwards from the documented (and sensible)
  anti-click design.
- **suggested fix**: Rewrite the sentence to: "...and that state is zeroed only when
  a voice is freshly allocated — a stolen/retriggered voice keeps its filter state so
  the retrigger doesn't click (`codegen.odin:1471-1501`)."

### F-A06-2: Filter chapter's citations for "state" and "zeroed" both land on unrelated code
- **kind**: doc-bug
- **node**: Filter
- **severity**: low
- **confidence**: high
- **evidence**: `:1075-1078` cited for per-voice filter state actually reads (in the
  current file) `cross_vars := make(map[string]bool); defer delete(cross_vars);
  cross_vars_ordered := make([dynamic]string); defer delete(cross_vars_ordered); for
  conn in graph.connections {` — bus-domain cross-variable bookkeeping, unrelated to
  filter state. The real `filter_%s_low`/`filter_%s_band` Voice_State field emission
  is at `codegen.odin:1129-1130` (or `:1196-1197` for the bus-domain Processor
  variant). `:1424-1425` cited for the reset actually falls inside the ADSR
  steal-capture block (`rel_t_%s`/`rf_%s` release-level rescaling), not the DSP-state
  reset block, which is at `:1477-1501`.
- **detail**: Distinct from F-A06-1 (which is about the claim being wrong), this is
  about the citations themselves pointing at code that has nothing to do with what's
  being cited — exactly the "citation pointing at unrelated code" case the brief
  calls out as a real finding, not line drift.
- **suggested fix**: Re-point citations to `codegen.odin:1129-1130` (voice-domain
  state fields) and `:1477-1501` (fresh-voice-only reset).

### F-A06-3: Filter resonance panel/XY-pad ceiling of 30 is fixed in code; three chapter passages still describe it as 30
- **kind**: doc-bug
- **node**: Filter
- **severity**: high
- **confidence**: high
- **evidence**: Current code:
  `skald-ui/src/components/NodeParameterControls.tsx:144` — `minX={20} maxX={20000}
  minY={0.1} maxY={20}` and `:153` — `numberField('resonance', 1, { min: 0.1, max: 20,
  step: 0.1 })`. Both now cap at 20, matching `param_ranges.odin:53` and
  `FilterNode.tsx:15`. `docs/manual-source/FIXED.md`, packet **P2 / B3**: "Aligned
  both Filter Resonance panel controls (number entry and XY pad) with the
  established 0.1-20 node-card/backend contract" — the fix is real and already
  shipped. But three still-live chapter passages describe the old ceiling: (1)
  `filter.md` **Code-vs-intent notes**, item 2, in full ("The panel and XY pad allow
  resonance up to 30... `NodeParameterControls.tsx:144` sets the pad's `maxY={30}`");
  (2) `filter.md` **Try it (hands-on)**, step 5 ("resonance → 30 in the panel, but
  see step 8)"); (3) `00-foundations.md` step 10 ("Set the Filter's resonance to 30
  (the XY pad's ceiling, `NodeParameterControls.tsx:144`)").
- **detail**: A user following the "Try it" walkthrough step 5 or the Foundations
  self-oscillation exercise step 10 literally cannot reach 30 any more — the number
  box rejects it and the pad clamps at 20 — so the hands-on exercise as written will
  confuse a reader who can't get the described result. `FIXED.md`'s own P2 entry
  lists `00-foundations.md` and `60-complexity-ladder.md` as chapters needing an
  update for this exact fix, but **does not list `nodes/filter.md`**, and even its
  own listed fix to `00-foundations.md` is incomplete (line 327 still says 30). This
  is a fix that shipped without its documentation trail being fully closed out.
- **suggested fix**: Update `filter.md` Code-vs-intent item 2 to say the ceilings now
  agree at 20 (drop the "cannot be returned above 20" caveat too, since a UI-authored
  value of 30 is no longer reachable — only a hand-edited JSON could still produce
  it), and fix the two "Try it" / Foundations step numbers to use 20 instead of 30.

### F-A06-4: Distortion Tone-range mismatch (10 kHz panel vs 20 kHz node) is fixed in code; chapter's Code-vs-intent notes 2 and 3 still describe it
- **kind**: doc-bug
- **node**: Distortion
- **severity**: medium
- **confidence**: high
- **evidence**: Current code: `skald-ui/src/components/NodeParameterControls.tsx:244`
  — `slider('tone', 100, 20000, 4000, 'log')`. This now matches `DistortionNode.tsx:11`
  (`min: 100, max: 20000`) and `param_ranges.odin:37` (`{100.0, 20000.0, 4000.0,
  "Hz"}`). `FIXED.md` packet **P2 / B3**: "Aligned the Distortion Tone panel with the
  established 100-20,000 Hz node-card/backend contract." But `distortion.md`
  **Code-vs-intent notes**, item 2 in full ("The Tone slider maxes at 10 kHz in the
  panel and 20 kHz on the node... Three surfaces, two answers") and the opening
  clause of item 3 ("but all three range definitions go to 10-20 kHz") both still
  describe the pre-fix state.
- **detail**: Same pattern as F-A06-3: the code fix shipped under P2, but
  `distortion.md` isn't in `FIXED.md`'s list of chapters to update for that packet, so
  its own footnotes are now describing a bug that no longer exists. The deeper,
  still-true point in item 3 (Tone above ~7 kHz is inert regardless of what the
  slider shows) survives and should be kept — only the "10 kHz panel" framing needs
  removing.
- **suggested fix**: Delete `distortion.md` Code-vs-intent item 2 (resolved); rewrite
  item 3's opening sentence to "all three range definitions agree at 100-20,000 Hz,
  but roughly the top two-thirds of that range is inert" and keep the rest of the
  item as-is.

### F-A06-5: `DistortionParams.shape` fix (FIXED.md P10) shipped; distortion.md's own note still says the field is missing
- **kind**: doc-bug
- **node**: Distortion
- **severity**: low
- **confidence**: high
- **evidence**: Current `skald-ui/src/definitions/types.ts:116-121`:
  `export interface DistortionParams extends BaseNodeParams { drive: number; shape:
  'classic' | 'soft' | 'hard' | 'asymmetric'; tone: number; mix: number; }` — `shape`
  is present. `docs/manual-source/FIXED.md` packet **P10** confirms this exact fix
  ("Added the four supported Distortion shape values to `DistortionParams`... Stale
  chapter section: `nodes/distortion.md`, Code-vs-intent notes, item 1"). The chapter
  text itself (item 1, in full) still opens with "`DistortionParams` has no `shape`
  field, but everything else uses one," unchanged.
- **detail**: This is the cleanest possible case of `already-known` — `FIXED.md`
  names the exact stale section — but it's worth restating because unlike F-A06-3/4,
  this one WAS correctly flagged in `FIXED.md`, it simply hasn't been actioned in the
  chapter file yet. Behavior was already fine before the fix (fallback to
  `options[0]`/`classic`), so this was always cosmetic; it's low severity but should
  still be swept up in the same documentation pass as F-A06-3/4 since all three stem
  from the same packet.
- **suggested fix**: Delete or rewrite item 1 to note the field now exists and the
  interface is in sync with the UI/codegen.

### F-A06-6: codegen.odin line citations drift ~50-65 lines for most content past line ~600
- **kind**: doc-bug
- **node**: Filter, Distortion
- **severity**: low
- **confidence**: high
- **evidence**: Representative pairs (manual citation → actual current location):
  bus-domain dispatch for Filter "`:1911-1912`" → actual `is_voice_coupled_type`
  (`:63-69`) / `compute_bus_domain` (`:77-119`), with the *cited* lines
  (`:1911-1916`) actually landing in the unrelated ADSR voice-lifecycle check; the
  explicit bus-domain error for Oscillator/ADSR "`:1935-1944`" → actual error is at
  `:97-103`; Distortion's "dispatch at `:1915-1916`" → actual bus-domain dispatch
  `case "Distortion": generate_distortion_code(...)` is at `:1975-1976`; typed
  setter/PARAMS table "`:1612-1643`" → actual `:1672-1703`; string-keyed
  setter/alias "`:1658-1693`" → actual `:1737-1753`; WASM `skald_set_param`
  "`:2555-2562`" → actual `:2615-2624`; master `tanh` limiter "`:2417-2418`" (cited
  identically by both chapters) → actual `:2477`; wasm-preview `tanh`
  "`:2623-2624`" → actual `:2683`.
- **detail**: The brief's own calibration says a citation "off by a few lines that
  still points at the right code is not a finding," but several of these (the two
  bus-domain-error citations, in particular) land squarely inside a different,
  unrelated function (`ADSR` voice-lifecycle bookkeeping) rather than merely being a
  few lines off from the right block. The consistent ~50-65 line offset suggests
  roughly that many lines were added to `codegen.odin` somewhere before line ~600
  since the manual was last verified against this file, shifting everything after it.
- **suggested fix**: Re-run the citation-verification pass against current
  `codegen.odin` for both chapters; the offset is consistent enough that a scripted
  line-shift search (grep for the quoted code fragment, not the claimed line number)
  would fix most of them quickly.

### F-A06-7: `is_voice_coupled_type` confirms Filter's dual-domain claim, but not at the cited lines
- **kind**: doc-bug
- **node**: Filter
- **severity**: low
- **confidence**: high
- **evidence**: `skald-backend/core/codegen.odin:60-69`: `is_voice_coupled_type ::
  proc(t: string) -> bool { switch t { case "Oscillator", "ADSR", "FmOperator",
  "Wavetable", "MidiInput": return true } return false }`. `Filter` is absent from
  this list, confirming it is legal in either domain, exactly as filter.md claims —
  but the claim is cited at `:1911-1912`, which (see F-A06-6) is unrelated code.
- **detail**: Folded into F-A06-6's fix; listed separately because it's worth
  recording that the underlying **claim** (Filter can legally run bus-side, unlike
  Oscillator/ADSR/FmOperator/Wavetable/MidiInput) is correct and well-supported once
  you find the real code — only the pointer is wrong.
- **suggested fix**: Same as F-A06-6 — repoint to `codegen.odin:60-69` and `:77-119`.

### F-A06-8: Filter `type` is compile-time-only even though the SVF already computes every response every sample
- **kind**: design
- **node**: Filter
- **severity**: medium
- **confidence**: medium
- **evidence**: `skald-backend/core/codegen.odin:350-366` — the three state updates
  (`filter_%s_low += ...`, `high_%s := ...`, `filter_%s_band += ...`) run
  unconditionally every sample regardless of `type`; only the final `node_%s_out =
  ...` assignment is chosen by a `switch strings.to_lower(f_type)` baked in at
  codegen time. Because `type` is a string param, the exposure machinery — which
  "only produces `f32` setters" (distortion.md, on `shape`) — cannot expose it, so
  switching Filter type always forces a full regenerate-and-recompile
  (`skald-ui/src/hooks/nodeEditor/useWasmAudioEngine.ts`, same debounce path
  described for Distortion's `shape`).
- **detail**: Unlike Distortion's `shape` (four genuinely different formulas, so
  computing all four to allow runtime switching would be ~4x the per-sample cost),
  Filter's four outputs are **already computed for free** as a byproduct of the SVF's
  two integrators — `Lowpass=low`, `Highpass=high`, `Bandpass=band`,
  `Notch=high+low`. Making `type` a runtime-switchable integer (0-3) on the processor
  struct would cost nothing extra per sample and would let a game (or an in-editor
  drag) morph Lowpass→Highpass live — a common effect (filter-sweep transitions,
  "opening up" a sound) that currently requires a full rebuild to audition.
- **manual impact**: `filter.md` **The controls** table (`type` row, currently
  described as compile-time-only by implication), **Under the hood** (the bullet list
  "Lowpass = low / Highpass = high / Bandpass = band / Notch = high + low" would gain
  a note that all four are live simultaneously), and **What "expose" does** (would
  need a new bullet: `type` becomes exposable once it's an int, unlike `shape` on
  Distortion which stays string-only). No citation-line rewrites needed beyond the
  new claims.
- **migration**: Non-breaking if implemented as an additive change: keep the existing
  string `type` param and select-in-the-editor UX, but internally resolve it to an
  integer constant/field rather than a string switch. Existing saved patches
  (`examples/**/*.skald.json`) already store `type` as one of the four strings and
  need no changes; the only new capability is that `type` becomes eligible for
  `exposedParameters` and would need a small addition to the exposed-parameter
  resolution pass to map the string to 0-3 at codegen time. No auto-upgrade-on-load
  logic required.

### F-A06-9: Cutoff modulation is additive-in-Hz; the Mapper exists solely because of it, and the sweep is perceptually uneven across the cutoff range
- **kind**: design
- **node**: Filter
- **severity**: medium
- **confidence**: medium
- **evidence**: `skald-backend/core/param_utils.odin:73-159` (`get_f32_param`) builds
  `"(base) + (mod1) + (mod2) ..."` — pure addition, in Hz, for `input_cutoff`.
  `00-foundations.md:63,412` states this explicitly: "That single design decision is
  why the Mapper exists and why an unscaled LFO on a cutoff is inaudible."
  `filter.md`'s "Modulation reaches the filter through a Mapper" section makes the
  same point. Pitch destinations elsewhere in the codebase are exponential (the
  brief's own check 6 — `math.pow(2, mod)` for octave-like destinations) but cutoff
  is not treated as one, despite cutoff being perceived logarithmically by ear (the
  chapter's own "Cutoff — what you hear as you sweep it" table describes 20-100 Hz,
  150-400 Hz, 400-2000 Hz, 2000-7000 Hz as roughly equal-sized *perceptual* bands
  despite covering wildly different absolute Hz spans).
- **detail**: A fixed-Hz envelope amount (say, a Mapper set to `0..2600 Hz`, as the
  acid-303 example patch uses) sweeps most of its audible "opening up" in the last
  octave or two of that range and does almost nothing in the first, because equal Hz
  steps are not equal pitch/brightness steps. Every hardware and most software analog
  -modeled filters use an exponential (1V/octave-style) cutoff control specifically so
  a fixed envelope amount sweeps evenly regardless of where the base cutoff sits.
  Skald's linear-Hz design is workable (and the Mapper is a reasonable stopgap) but is
  a real design cost: it requires an extra node for essentially every filter-envelope
  patch in the manual, and even then the result is a linear, not perceptually even,
  sweep.
- **manual impact**: `00-foundations.md` "Unipolar and bipolar, and why the Mapper has
  to exist" (around line 63-77, and the reprise at line 412) would need to drop or
  soften "why the Mapper exists" framing if cutoff modulation became relative;
  `filter.md` "What it looks like in Skald" (the `input_cutoff` port description,
  "added to... in Hz"), "Why you patch it this way" → "Cutoff modulation is additive,
  not absolute" and "Modulation reaches the filter through a Mapper", and the "Terms
  introduced" entry for "Envelope amount" ("how far the filter envelope moves the
  cutoff, in Hz... the Mapper's `outMax`") would all need rewriting.
- **migration**: This would break every existing patch that wires a Mapper (or a
  direct LFO amplitude) into `input_cutoff`, because the semantic of the number
  flowing into that port changes from "Hz to add" to "octaves to shift." The acid-303
  example's `Env 0-2600 Hz` Mapper, `wobble-samplehold-bass.skald.json`, and any other
  shipped patch driving `input_cutoff` would all need either (a) a new, separate port
  (e.g. `input_cutoff_oct`) added alongside the existing linear one so old patches
  keep working unmodified and new patches opt in, or (b) an automatic upgrade-on-load
  step that converts a stored Mapper's `outMax` (assumed Hz, additive) into an
  equivalent octave range computed against that filter's authored base `cutoff` —
  lossy and fragile if the base cutoff is itself modulated. Option (a), a new port,
  is the only migration-safe path; a silent semantic change to the existing port is
  not.

### F-A06-10: Distortion has no output/makeup gain and no oversampling — the two features every comparable device has
- **kind**: design
- **node**: Distortion
- **severity**: medium
- **confidence**: medium
- **evidence**: `skald-backend/core/codegen.odin:585-617` (`generate_distortion_code`)
  — `drive` scales the input into the curve (`dist_k := math.max(f32(drive), 1.0)`,
  `:600`) with no compensating output-level term anywhere in the block, and no
  oversampling (the signal is shaped once per sample at the project's native rate;
  distortion.md's own "What it is" section documents that Skald has none: "there is
  no oversampling anywhere in the code generator"). Both gaps are already called out
  descriptively in distortion.md ("There is no output level or makeup gain on this
  node," under "Drive"; Code-vs-intent note 6) and in the aliasing discussion under
  "What it is" and "Try it" step 6.
- **detail**: This is the manual's own diagnosis, elevated to a design
  recommendation rather than a documentation note, per the brief's instruction to
  judge whether the node is built the *best* way, not just whether the docs match it.
  Output/makeup gain is standard on every hardware and software distortion because
  A/B-ing drive settings at matched loudness is how the effect is actually judged
  (the chapter cites this practitioner norm itself); the current workaround (a
  separate Gain/VCA node after Distortion) works but is undiscoverable from the node
  itself and costs an extra node + wire on every patch. Oversampling (2x/4x around
  just the memoryless waveshaping stage — upsample, apply curve, lowpass, decimate)
  is the standard cure for the aliasing the chapter spends two full "Try it" steps
  demonstrating as a real, audible problem, and would be comparatively cheap here
  specifically because the nonlinearity is memoryless (no history to manage across
  the rate change, unlike a stateful filter).
- **manual impact**: distortion.md "Drive — what you hear as you sweep it" (the
  paragraph "There is no output level or makeup gain on this node") and Code-vs-intent
  note 6 would flip from documenting a gap to documenting a feature; "What it is"
  (the aliasing/oversampling paragraph) and "Try it" step 6 (the hard-clip aliasing
  demonstration) would need to describe the new oversampled behavior instead of "this
  is not a bug you can dial out."
- **migration**: Adding an optional `outputGain`/makeup parameter is purely additive
  — default it to 1.0 (unity) and every existing patch generates bit-identical
  output. Adding oversampling changes the actual samples the node emits (aliasing
  content shrinks or disappears), which is an audible change to every existing patch
  that uses Distortion at moderate-to-high drive, especially `hard` shape — not
  something an upgrade-on-load can hide. The safe path is a per-node opt-in flag
  (default off for loaded patches, on for new ones) rather than a silent global
  behavior change, exactly like the `bpmSync` / `fixedPitch` pattern already used
  elsewhere in the codebase for backward-compatible opt-in behavior.

### F-A06-11: Filter has a golden test; Distortion has none — confirmed still true
- **kind**: qol
- **node**: Distortion
- **severity**: low
- **confidence**: high
- **evidence**: `skald-backend/tests/fixtures/filter_sweep.json` /
  `filter_sweep.odin` / `tests/golden/filter_sweep.odin.golden` exist and the cited
  literal (`f32(2000.000000000)` context, golden line 299) matches exactly. No
  `*distort*` file exists anywhere under `skald-backend/tests/` (fixtures, golden, or
  otherwise).
- **detail**: Confirms distortion.md's own Code-vs-intent note 8 verbatim — already
  logged there as a `Blocker`-tagged item — this entry exists only to record that a
  fresh check found nothing has changed since that note was written.
- **suggested fix**: None beyond what the chapter already recommends (already-known).

## Verified-true chapter claims (not findings)

- Filter cutoff/resonance ranges, defaults, and units at `param_ranges.odin:50-53`
  match `types.ts:81-86` and `node-definitions.ts:91-96` exactly.
- Distortion's `param_ranges.odin` node-type override for `tone`
  (`{100.0, 20000.0, 4000.0, "Hz"}`) exists exactly as cited and is the reason an
  exposed Tone doesn't fall through to the wide-open fallback.
- The Chamberlin SVF formulas, both stability clamps, and the four filter-type
  output selections (`Lowpass=low`, `Highpass=high`, `Bandpass=band`,
  `Notch=high+low`) all match `codegen.odin:327-368` exactly.
- All four Distortion curve formulas (`classic`, `soft`, `hard`, `asymmetric`), the
  drive floor with no ceiling, the Tone one-pole coefficient and its ~7 kHz
  saturation, and the dry/wet crossfade all match `codegen.odin:585-617` exactly.
- `graph_validate.odin`'s port allow-lists for Filter (`input`, `input_cutoff`,
  `input_res`) and Distortion (`input` only) match the chapters' port tables exactly.
- The `filterType`→`type` legacy-key fallback in `get_string_param`
  (`param_utils.odin:193-200`) is real and exactly as described — a
  `percussive-high-pass-hit.skald.json`-style patch really would generate a working
  highpass while the panel shows "Lowpass."
- `NodeStyles.ts:97` (Distortion's salmon accent), `Sidebar.tsx:271,274` (both
  palette tooltips), and `ParamNode.tsx:79` (select fallback to `options[0]`) are all
  exactly where and what the chapters say.
- `DistortionNode.tsx:10` shape select and `NodeParameterControls.tsx:243`'s
  `false` (non-exposable) flag on Shape are both confirmed exactly at the cited line.
