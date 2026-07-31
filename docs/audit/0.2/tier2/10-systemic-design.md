## Summary

- Modulation being raw `(base) + (mod)` with no per-edge scaling is real and it is the
  single biggest systemic cost in the graph model: it is why the Mapper node exists, why
  nearly every worked patch in the manual inserts one, and why cutoff/pitch/amp modulation
  each needed their own bespoke workaround. A per-edge `amount` field would make the Mapper
  optional for the common case (depth-only scaling) but not redundant (it still owns
  absolute range remap + offset). See F-B10-1.
- The "boolean mode + shadow parameter" bug Tier 1 found four times independently
  (Oscillator/Wavetable Fixed Pitch, LFO rate/sync, S&H rate/sync, Delay time/sync) is
  actually **two** different underlying diseases wearing the same symptom, and needs two
  different (but structurally parallel) fixes, not one universal rule. See F-B10-2 for both,
  designed once each.
- The signal model is honestly mono-with-a-terminal-pan-hack, and Tier 1 already diagnosed
  this well (F-A08-3/4/5, F-A10-16). The systemic call for 0.2: do **not** attempt real
  stereo — the cost is a core rewrite touching ~15 codegen procs, the `Connection` schema,
  and every port table. Fix the two concrete coherence bugs cheaply instead and document the
  scoping decision explicitly. See F-B10-3.
- The node set is more complete than it looks for a modular synth, but is missing the three
  things a game-audio person specifically reaches for: a compressor/limiter with sidechain
  (for ducking), an EQ, and a chorus/ensemble effect. See F-B10-4.
- A genuinely new, non-Tier-1 finding: **Wavetable has a working amplitude control that is
  invisible to the type system, the default params, the exposure mechanism, and the side
  panel** — it exists only as an on-canvas card slider. This is the sharpest concrete
  instance of "the Oscillator/Wavetable boundary is drawn carelessly, not deliberately."
  See F-B10-6.
- "How loud" is spelled three incompatible ways across sibling source/effect nodes
  (`amplitude` 0-1, `gain` 0-4×, mixer `level` 0-2× with two disagreeing defaults for
  "unity"). See F-B10-7.

## Findings

### F-B10-1: Modulation should carry a per-edge depth/amount — the Mapper becomes optional, not removable
- **kind**: design
- **area**: modulation model (engine-wide) — `get_f32_param`, `Connection`
- **severity**: high
- **confidence**: high
- **evidence**: `skald-backend/core/param_utils.odin:73-159` (`get_f32_param`) builds
  `"(base) + (mod1) + (mod2) ..."` with a flat, unscaled `" + (%s)"` per source
  (`:149-153`) — no coefficient anywhere in the expression. `skald-backend/core/types.odin:61-66`
  (`Connection`) has exactly four string fields (`from_node`, `from_port`, `to_node`,
  `to_port`) — there is nowhere to put a per-edge scalar today. The UI's edge object is the
  same: `skald-ui/src/hooks/nodeEditor/useGraphState.ts:100-102` builds an edge from only
  `source`/`sourceHandle`/`target`/`targetHandle` — no `data` field at all, and a grep of
  the whole edge-rendering path found no click-to-edit affordance on an edge anywhere in the
  UI (all parameter editing today happens in node side panels, never on a wire). Tier 1
  independently found the symptom in four different chapters — `00-foundations.md`'s own
  words, "That single design decision is why the Mapper exists" (cited in F-A06-9), the
  Mapper's own missing curve/offset gap (F-A04-5), Filter's additive-in-Hz cutoff cost
  (F-A06-9), and the engine-wide framing in F-A10-15 ("the single most common 2-node idiom
  in the whole example library").
- **detail**: A per-edge `amount` (default `1.0`, multiplying the source term before it's
  summed: `"(depth * src) + ..."`) directly answers the brief's question. It removes the
  Mapper for exactly the case Tier 1 shows is by far the most common one in the shipped
  corpus: "turn this LFO/envelope down before it hits the destination." It does **not**
  remove the Mapper's other, genuinely distinct job — absolute range remap with an offset
  (e.g. turn a ±1 bipolar LFO into 200–2000 Hz, which needs both a scale *and* a shift, not
  a bare multiply) — so the Mapper stays mandatory for that case and optional for the
  depth-only case. What breaks: nothing audio-wise for existing patches (default `1.0`
  reproduces today's sum exactly). What's expensive: there is currently no UI mechanism to
  edit *anything* on an edge — building "click a wire, see a depth knob" is a new UI
  surface, not a field addition to an existing panel, and is the dominant cost of this
  change, larger than the codegen or schema work.
- **suggested fix**: Add `amount: f32` to `Connection` (Odin) and a matching optional
  `data.amount` to the UI's edge object, defaulting both to `1.0`. Change
  `get_f32_param`'s per-source loop to emit `"(%s * %s)"` (amount, then source var) instead
  of the bare source var. Add a minimal edge-inspector affordance (a small draggable handle
  on the wire, or a same-idiom link/number pair reachable by clicking the edge) — this is
  the real scope of the work, not the codegen change.
- **manual impact**: `00-foundations.md` — "Unipolar and bipolar, and why the Mapper has to
  exist" (the framing changes from "the Mapper is mandatory" to "a bare depth knob lives on
  every wire; the Mapper is for range + offset"), and the reprise later in the same chapter.
  `nodes/mapper.md` — "Why you patch it this way" and the whole premise of "Going further →
  Layer fast and slow" (chaining Mappers purely for depth would simplify to per-edge
  amounts). `nodes/filter.md` — "Modulation reaches the filter through a Mapper" section
  (F-A06-9's own citation list). `nodes/oscillator.md`, `nodes/lfo.md`, `nodes/adsr.md` —
  every "wire this into that, then insert a Mapper to scale it" walkthrough gets a cheaper
  alternative worth mentioning.
- **migration**: None for audio — a new field defaulting to `1.0` on every existing
  connection reproduces today's exact generated expression. Existing Mapper-based patches
  keep working unmodified (a Mapper feeding a per-edge-scaled port is still legal); nothing
  needs to be deleted or converted. This is the rare design change in this audit with
  effectively zero data-migration cost — the cost is entirely forward (new UI surface), not
  backward (old files).

### F-B10-2: The boolean-mode-plus-shadow-parameter class has two distinct root causes and needs two designs, not one
- **kind**: design
- **area**: Oscillator/Wavetable Fixed Pitch; LFO/S&H/Delay BPM Sync
- **severity**: high
- **confidence**: high
- **evidence**: Tier 1 found this shape four times: `OscillatorParams.fixedPitch` /
  `WavetableParams.fixedPitch` (F-A01-6), LFO `bpmSync`/`frequency`/`syncRate` (F-A03-1,
  F-A03-7), Sample & Hold `bpmSync`/`rate`/`syncRate` (F-A03-2, F-A03-8), Delay
  `bpmSync`/`delayTime`/`syncRate` (F-A07-4, F-A07-5). Reading all four together: Fixed
  Pitch's problem is that the boolean discards a genuine continuum (0–100% key-track is
  musically meaningful at every point between the two endpoints, per the brief's own worked
  example). BPM Sync's problem is different — a rate genuinely cannot be "60% synced" (Tier
  1's own F-A03-7 says this explicitly) — the bug there is that the mode owns **two
  independently-stored, independently-exposable fields** (a free-run number and a
  sync-division string) where exactly one is ever live, and nothing keeps the dead one
  current or blocks it from being exposed as if it were.
- **detail**: One general fix does not cover both, but one general *principle* does, applied
  two ways:
  1. **Where the underlying quantity is a true continuum** (Fixed Pitch): delete the
     boolean. Replace it with a single continuous parameter (`keyTrack: 0–100%`) plus a
     `tune`/offset field, so there is only ever one stored number and it is meaningful at
     every setting. This is F-A01-6's own recommendation; restated here because it is the
     *template* for case 2.
  2. **Where the underlying quantity is a genuine discrete mode** (BPM Sync): do not make it
     continuous (nonsense — a delay time is either locked to the grid or it isn't). Instead
     apply the same *single-source-of-truth* principle by collapsing storage, not by
     removing the boolean: keep exactly **one** canonical, always-current numeric field
     (`frequency` in Hz, `delayTime` in seconds), and treat `bpmSync`+`syncRate` as an
     edit-time/display-time computation that continuously **overwrites** that one canonical
     field (recomputed on every BPM or division change) rather than existing as a second,
     independently-exposable value. The exposed/generated API then only ever has one
     setter, meaning "the current rate" — touching it from game code is legal at any time
     and behaves like grabbing a hardware knob (which, by convention across every
     synth/DAW, silently disengages sync), rather than racing a compiled-in overwrite that
     silently no-ops (F-A03-1/F-A03-2/F-A07-4).
  Both cases resolve to the same underlying rule: **a mode selector may change how a value
  is computed or edited, but it must never leave a second value that can independently
  disagree with what's actually driving the sound.** Fixed Pitch violates this by having a
  hidden dial pretending to be a switch; BPM Sync violates it by having two storage slots
  pretending to be independent. The fix differs (continuous vs. collapsed-storage) because
  the violation differs, but the design *test* to apply everywhere is the one sentence above
  — worth writing into whatever design guidelines ship with 0.2 so a fifth instance doesn't
  get built the same way.
- **suggested fix**: Oscillator/Wavetable — implement F-A01-6 (keyTrack + tune). LFO/S&H/
  Delay — implement F-A03-7/F-A03-8/F-A07-5's shared "resolve effective value" helper once,
  called from all three generators and from the editor's own change handler, so `frequency`/
  `rate`/`delayTime` is always live-equal to the sync-derived value while synced, and the
  generated public API exposes exactly one setter per node for this concept.
- **manual impact**: As detailed per-node in F-A01-6, F-A03-7, F-A03-8 and F-A07-5. Net new
  point for a systemic pass: a single new subsection (candidate home: `00-foundations.md`
  or a new "Design conventions" appendix) stating the one-sentence rule above, so the
  chapter-level fixes can each link back to one canonical explanation instead of restating
  the reasoning four times.
- **migration**: As detailed per-node in the cited Tier 1 findings. Net new point: because
  the LFO/S&H/Delay fix is the same helper in all three cases, the load-time upgrade (
  recompute `frequency`/`rate`/`delayTime` from `syncRate`+session BPM for any node with
  `bpmSync: true`) should also be written once and run for all three node types, not
  triplicated — the existing per-node migration notes already assume this but it is worth
  stating as a build-order requirement: do not schedule three separate migration scripts.

### F-B10-3: The signal model is mono-with-a-terminal-pan-hack — right call for 0.2, but say so and fix the two cheap coherence bugs
- **kind**: design
- **area**: signal model (engine-wide) — Panner, Mixer, Output
- **severity**: medium
- **confidence**: high
- **evidence**: Tier 1 already did the diagnostic work in full: every node computes exactly
  one `f32` (`00-foundations.md`'s own claim), Panner is the sole exception
  (`codegen.odin:728-729` per F-A08-2/F-A10-1's corrected line numbers), that pair survives
  exactly one hop before being downmixed (`codegen.odin:733`, only special-cased for
  Panner→GraphOutput at `:2038-2040`), Delay/Reverb hold one shared buffer per instrument
  with no channel dimension (F-A08-4, F-A10-16), and a mono source wired straight to Output
  is louder than the same source through a centred Panner because only the Panner path gets
  the 0.7071/0.7071 equal-power attenuation (F-A08-3, high severity, code-bug).
- **detail**: The systemic call: for a game-middleware codegen tool where CPU cost matters
  and the manual already frames "control rate" as an *intent* rather than a *mechanism*
  (F-A10-14), mono-per-node-with-a-terminal-pan-stage is a defensible, cheap architecture —
  it should **not** be replaced with real per-node stereo for 0.2. Real stereo would require
  (estimated from a direct read of the codegen file): a channel dimension on every one of
  the ~15 `generate_*_code` procs and their per-voice/per-bus state fields, a redesign of
  `get_output_var`/`get_f32_param`/`sum_port_inputs` in `param_utils.odin` to carry a
  channel, a doubled or channel-aware `Connection`/port schema in `types.odin` and
  `graph_validate.odin`, and — the part Tier 1's own migration note for F-A08-4 flags as the
  showstopper — Delay/Reverb's shared-bus-domain buffers (`codegen.odin:71-76`) would need
  to double per instrument-effect and lose the single-shared-instance simplicity that makes
  their bus-domain design correct today (F-A07-8). That is a multi-month core rewrite, not a
  0.2-scoped item, and nothing in the current manual or examples demands it.
  What *is* cheap and worth doing for 0.2: (1) fix F-A08-3 so a bare mono-to-Output wire
  gets the same 0.7071/0.7071 treatment a centred Panner gets, so "no Panner" and "Panner at
  0" are loudness-matched (a one-line change to `generate_graph_output_adds`); (2) turn the
  silent Panner-into-anything-but-Output downmix into a build-time warning or error instead
  of quietly discarding the stereo pair (a small addition to `graph_validate.odin`, per
  F-A10-16's own suggested "safe path"); (3) state the mono-with-terminal-pan model
  explicitly, once, in Foundations, as a stated scoping decision with its cost spelled out,
  rather than leaving readers to infer it chapter-by-chapter (per F-A08-4's own suggested
  fix).
- **manual impact**: `00-foundations.md` — the "one number per node per sample" epigraph and
  instrument-skeleton pseudocode (per F-A10-16) gain an explicit, named exception and its
  cost, rather than silently omitting Panner's special case. `nodes/panner.md` — "The one
  rule that matters" and "Why you patch it this way" get reframed as an architecture
  boundary rather than an incidental UI quirk (per F-A08-4). `nodes/mixer.md`'s "The output
  is mono" passage is already correct and just needs a cross-reference to the new
  Foundations statement.
- **migration**: None for the two cheap fixes — (1) changes only the never-serialized
  direct-to-Output codegen path; (2) turns a silent behavior into a loud warning/error with
  no saved patch needing to change, since (per F-A10-16) nothing in `examples/` relies on
  the silent downmix on purpose. If real stereo were ever attempted later, F-A08-4's and
  F-A10-16's migration notes already correctly identify that no example patch declares a
  schema/version field today, so an upgrader would need to invent one before it could even
  gate old patches onto a "legacy mono" codegen path.

### F-B10-4: Missing nodes — the three gaps a game-audio person specifically expects and won't find
- **kind**: missing-node
- **area**: node set (engine-wide)
- **severity**: medium
- **confidence**: medium
- **evidence**: Full node palette confirmed from `skald-ui/src/components/Sidebar.tsx:264-280`
  plus Mixer/Mapper/Panner/Gain/Output/MidiInput/Instrument: Oscillator, Noise, LFO,
  Sample & Hold, FM Operator, Wavetable, ADSR, Filter, Delay, Reverb, Distortion, Mixer,
  Mapper, Panner, VCA, Output, MIDI Input, Instrument. There is no dynamics node anywhere in
  this list or in `node-definitions.ts`'s full type map, no multi-band or shelving EQ (only
  the single four-mode SVF `Filter`), and no modulated-delay ensemble effect (Chorus/
  Flanger/Phaser).
- **detail**: (1) **Compressor/limiter with sidechain** is the sharpest gap given the
  manual's own stated audience: Tier 1's F-A05-8 already documents that "duck the whole mix"
  (music under dialogue) is exactly the kind of runtime control a game integrator needs, and
  today the *only* dynamics processing anywhere in the engine is the fixed master `tanh`
  soft-clip (`codegen.odin:2477-2478`) — there is no per-instrument or per-bus compressor, and
  no sidechain input on any node, so "ducking" cannot be built in the graph at all today, only
  bolted on by the consuming game's own mixer. (2) **EQ** — Filter gives one band (lowpass/
  highpass/bandpass/notch), with no shelving or parametric-peak node for the "carve out 2 kHz"
  move that's table-stakes in every DAW/synth a user is likely to have used. (3) **Chorus/
  ensemble** — the manual's own worked examples (F-A01's "Stack and detune" walkthrough) reach
  for unison+detune to thicken a sound because there is no dedicated modulated-delay effect to
  do it post-signal; a Chorus is cheap DSP (one short modulated delay tap) and is one of the
  first effects a synth user reaches for that Skald has no equivalent of. All three are true
  gaps, not just missing convenience — nothing in the graph can currently substitute for any
  of them without leaving the tool (hand-writing Odin) or accepting a materially different
  result.
- **suggested fix**: Prioritize a Compressor/Limiter node with an optional sidechain input
  port (ducking is the single most game-relevant use case named in this codebase's own
  documentation) before EQ or Chorus; EQ and Chorus are both standard, well-understood,
  cheap DSP additions that would round out the node set to "what any synth user expects."
- **manual impact**: A new "nodes/compressor.md" (or similar) chapter would be needed;
  `00-foundations.md`'s "Terms introduced" glossary would gain sidechain/ducking/compression
  entries it doesn't currently have reason to define.
- **migration**: Purely additive — new node types, no existing patch or schema is touched.

### F-B10-5: Node boundaries — the fixes below make three contested boundaries defensible, not just documented
- **kind**: design
- **area**: ADSR/VCA, Oscillator/Wavetable, Mixer/per-edge levels
- **severity**: medium
- **confidence**: medium
- **evidence**: Tier 1 already surfaced all three boundary questions in detail: ADSR fuses
  audio-multiply with envelope generation while a separate VCA node exists with
  incompatible (additive, not multiplicative) modulation semantics, and 90 of the shipped
  corpus's connections use the ADSR-as-VCA path versus 7 using the "canonical" separate-VCA
  idiom the manual teaches (F-A09-2, F-A09-3, high severity). Oscillator and Wavetable
  differ almost entirely by omission (unison, PWM, phase all present on one and absent on
  the other) rather than by intent (F-A01-4/7/8, F-A01-11 flagged as low-confidence/needs
  product input). Mixer's fixed 1–32 indexed-slot model exists mainly to give per-channel
  level and per-channel exposure that a raw wire-merge doesn't offer (F-A08-5).
- **detail**: Read together with this audit's own F-B10-1 and F-B10-6, each boundary has an
  answer, not just a description of the mess:
  - **ADSR/VCA**: don't merge or split — per F-A09-2's option (b), keep ADSR's built-in
    multiply as the documented fast path (it's what 90% of shipped content already does and
    ripping it out breaks nearly every example), and fix the *actual* defect, which is that
    VCA's `input_gain` is additive when ADSR's `input` is multiplicative (F-A04-4). Once VCA's
    modulation is made multiplicative-relative, the two nodes finally agree on what "scale
    audio by a control signal" means, and the manual's own "why does gain.md's idiom introduce
    a bug the ADSR-direct path never has" tension (F-A09-2) disappears without touching either
    node's job description.
  - **Oscillator/Wavetable**: not a case for merging (F-A01-11's own confidence is
    appropriately low) — the two are different enough in intent (discrete 4-shape vs.
    continuous morph) to justify separate nodes. But right now they read as *accidentally*
    divergent rather than *deliberately* scoped differently, because the gaps are all
    omissions with no stated rationale (F-A01-4/7/8, plus this audit's F-A10-6 amplitude
    gap). Closing those specific parity gaps is the fix; keeping them as two nodes is fine.
  - **Mixer vs. per-edge levels**: this audit's F-B10-1 (per-edge `amount` for modulation)
    raises the natural follow-on question — if a wire can carry its own scalar, does Mixer
    still earn its keep? Yes, but for a narrower reason than "the only way to weight
    inputs": once per-edge amounts exist, a plain multi-wire merge into a Filter or VCA can
    already carry relative levels, so Mixer's remaining unique value is a **stable, named,
    count-declared, individually-exposable** audio bus — the "give your game a fader per
    channel" contract, not the "let two sources have different levels" contract. That's a
    real, distinct job (matching F-A08-5's own framing of the fixed-slot cost as buying
    exposure and a stable API), so Mixer should stay, but its design should lean into that
    job (fixing the position-vs-id desync, F-A08-5's note #6) rather than trying to also be
    the general-purpose way to weight two wires, which per-edge amounts would make
    redundant.
- **suggested fix**: Ship F-A04-4 (multiplicative VCA gain) before or alongside any ADSR
  rework; treat Oscillator/Wavetable parity gaps (F-A01-4/7/8, F-B10-6) as bugs to close, not
  a merge decision to make; extend per-edge `amount` (F-B10-1) to audio-rate ports
  (`sum_port_inputs`, `param_utils.odin:164-177`) as a separate, later step once it exists
  for modulation ports, and let Mixer's design lean fully into "named, exposed audio bus"
  once that's done.
- **manual impact**: As per F-A04-4, F-A01-5, F-A08-5's own manual-impact sections; net new
  point is a short passage (candidate: `00-foundations.md` or a "Choosing a node" appendix)
  stating the three resolved boundary rationales in one place so a reader doesn't have to
  infer "why are there two things that look like they do the same job" from four separate
  chapters.
- **migration**: As per the cited findings' own migration sections; no new migration burden
  introduced by this finding beyond what F-A04-4/F-B10-1 already specify.

### F-B10-6: Wavetable's amplitude control exists but is invisible to the type system, defaults, exposure and the side panel
- **kind**: inconsistency
- **area**: Wavetable
- **severity**: medium
- **confidence**: high
- **evidence**: `skald-backend/core/codegen.odin:506,511` reads and applies
  `amp_str := get_f32_param(graph, node, "amplitude", "input_amp", 1.0)` exactly like every
  other source node. `skald-ui/src/components/Nodes/WavetableNode.tsx:12,17` confirms the
  on-canvas card *does* have both an `input_amp` modulation handle and an `amplitude`
  slider field (`min:0, max:1, step:0.05`). But: `WavetableParams`
  (`skald-ui/src/definitions/types.ts:48-54`) declares no `amplitude` field at all (only
  `fixedPitch`, `tableName`, `frequency`, `position`); `defaultWavetableParams`
  (`skald-ui/src/definitions/node-definitions.ts:58-63`) never initializes `amplitude` and
  never lists it in `exposedParameters`; and the Parameter Panel's `case 'wavetable'`
  (`skald-ui/src/components/NodeParameterControls.tsx:203-214`) renders Fixed Pitch,
  Frequency and Table Position but has no Amp row at all. A grep of the on-canvas card
  renderer (`ParamNode.tsx`) for any exposure affordance (`expose`) returns nothing —
  exposing a parameter is exclusively a Parameter Panel feature.
- **detail**: The net effect: Wavetable's amplitude can be edited (via the card slider) but
  can **never be exposed to game code through the UI** — there is no link/expose icon
  reachable for it anywhere, unlike every other numeric parameter on every other node, which
  is editable and exposable from the same side-panel row. It's also invisible to
  TypeScript's type checking (`data.amplitude` only works because `BaseNodeParams`'s index
  signature swallows it as `any`), so nothing catches a future refactor that assumes
  `WavetableParams` is a complete list of the node's fields. A user who wants their game to
  fade a Wavetable pad's volume at runtime has no UI path to expose it, unlike the visually
  identical Oscillator, which exposes `amplitude` by default out of the box.
  This is a sharper, previously-unflagged instance of the same class Tier 1 found repeatedly
  for this node pair (F-A01-4 unison, F-A01-7 PWM, F-A01-8 phase) — Wavetable's core level
  control is the one gap in that list that isn't even *missing*, just structurally
  disconnected from three of the four systems (type, defaults/exposure, panel) that every
  other parameter goes through.
- **suggested fix**: Add `amplitude: number` to `WavetableParams`, initialize it in
  `defaultWavetableParams` (matching Oscillator's `0.5` or the codegen default `1.0`), add
  it to the default `exposedParameters` list, and add the missing Amp row (with expose
  toggle) to `NodeParameterControls.tsx`'s `case 'wavetable'`.
- **manual impact**: `nodes/wavetable.md` — "The controls" table gains an Amplitude row;
  any Code-vs-intent note about parity with Oscillator would need updating once fixed.
- **migration**: Additive and safe — every saved Wavetable node without a stored `amplitude`
  already renders (via the card) and codegens (via the `1.0` default) as if it were `1.0`;
  backfilling the field with `1.0` on load changes nothing audible for existing patches.

### F-B10-7: "How loud" is spelled three incompatible ways across sibling nodes, and none of the defaults consistently mean "unity"
- **kind**: inconsistency
- **area**: parameter conventions (engine-wide)
- **severity**: medium
- **confidence**: medium
- **evidence**: `skald-backend/core/param_ranges.odin:86-89` — `gain: {0.0, 4.0, 1.0, "x"}`
  (VCA, unitless multiplier, table-default unity = `1.0`) vs. `amplitude: {0.0, 1.0, 0.5,
  ""}` (Oscillator/Noise/Wavetable, normalized 0-1, table-default `0.5` = *not* unity) vs.
  the Mixer-specific override at `:43-45` — `level*` → `{0.0, 2.0, 1.0, "x"}` (per-channel,
  table-default unity = `1.0`, added specifically per the file's own comment to stop an
  exposed channel defaulting to silence). Meanwhile the UI's own authored defaults disagree
  with their own table: `skald-ui/src/definitions/node-definitions.ts:141-144`
  (`defaultMixerParams.levels`) hardcodes every channel to `level: 0.75`, not the `1.0` its
  own range table calls unity, and `:154-157`'s VCA default is also `gain: 0.75` — the same
  0.75 number, on two different nodes, for two different reasons (Tier 1's F-A04-4 already
  shows the VCA's 0.75 combines with additive modulation to produce a "never silent, always
  boosted" trap; the Mixer's 0.75 has no comment explaining it at all).
- **detail**: This isn't merely cosmetic unit drift (like a 0-1 vs 0-100 slider, which
  doesn't exist here) — it's three genuinely different *roles* for "loudness" (source
  amplitude, downstream unitless multiplier, mix-bus fader) each getting its own convention,
  which is defensible on its own, except that: (1) none of the three nodes' *authored*
  defaults reliably mean "pass the signal through unchanged" — Oscillator/Noise start at
  half amplitude, VCA and Mixer both start at 0.75× despite their own backend table calling
  `1.0` unity — so a user cannot learn one mental model ("the default is neutral") and apply
  it across nodes; and (2) the specific value `0.75` recurring on two semantically unrelated
  nodes, each below their own declared unity point, reads like copy-paste rather than a
  considered per-node choice, and at least one of the two (VCA) is already flagged as
  actively harmful (F-A04-4).
- **suggested fix**: Either document a house rule ("authored defaults are always unity
  unless a node has a stated reason not to be, e.g. headroom") and audit every node's
  default against it, or leave the headroom defaults but add a one-line comment at each
  site explaining why that node's default isn't unity (matching the discipline already
  shown in `param_ranges.odin`'s own comments for the Mixer-level override and the FM/LFO
  node-type overrides).
- **manual impact**: `nodes/gain.md`'s and `nodes/mixer.md`'s "The controls" sections would
  each gain a one-line rationale for their non-unity default, and `00-foundations.md`'s
  "What expose does" section (which already discusses where ranges come from) could state
  the house rule once, engine-wide.
- **migration**: None — this is a documentation/rationale gap, not a proposed value change;
  if the house-rule audit above concluded some defaults should change, that would need the
  same opt-in/versioned treatment F-A02-11 already recommends for Noise's Pink-loudness
  calibration (changing a shipped default changes the *sound* of every patch created before
  the user next touched that knob).

---

Digest: written to
`C:\Users\ryanp\AppData\Local\Temp\claude\C--Users-ryanp-Documents-dev-Skald-main\2fc1cf0b-ae38-4a6e-a931-a303fca7f67f\scratchpad\review\tier2\10-systemic-design.md`.
