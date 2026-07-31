## Summary

- **The central question — is per-voice reset coherent? No, and it is worse than Tier 1's
  filter finding suggested.** There are, in effect, three silent, un-unified reset policies
  operating side by side in the same voice struct: (1) Oscillator/Filter/FmOperator/
  Wavetable/Distortion state is zeroed on a *fresh* (never-just-used) voice and preserved on
  steal, for click-avoidance and determinism, per an explicit code comment; (2) ADSR always
  re-enters Attack, carrying forward a captured live level only on genuine steal; (3) LFO
  phase, Noise RNG/pink-filter state and SampleHold counter/value are **never** reset by any
  note event — not on fresh allocation, not on steal. The comment justifying policy (1)
  ("fresh voices were silent, so the reset is inaudible and keeps retriggers deterministic")
  applies with identical force to policy (3), yet nothing in the code applies it there, and
  nothing in the code explains why not. The manual (`lfo.md`, `sampleHold.md`) later
  rationalizes (3) as an intentional "free-running" feature — but that rationale was written
  *after the fact*, is absent from the code itself, and a real shipped patch
  (`lfo-filter-wobble-bass.skald.json`) demonstrates the concrete cost: the wobble's starting
  phase becomes history-dependent (not reproducible) after the first note cycles through each
  voice slot, unlike every other per-voice signal in the same instrument.
- **A deeper, previously-unflagged reset gap: `_init` does not do what its own comment says.**
  The generated `<Foo>_init` proc explicitly clears Reverb's delay/pre-delay buffers "so
  calling init on an existing processor has the same reset semantics as initializing a fresh
  one" — but it does not clear Delay's buffer (the clear loop's guard skips every non-Reverb
  node), and it never touches the `voices` array at all beyond reseeding two RNG fields. Every
  other piece of per-voice state (active flag, note, age, oscillator phase, filter memory,
  ADSR stage, S&H counter/value, pink-noise history) survives a live re-`init` untouched. In
  Skald's own preview path this is masked because the JS host always builds a brand-new WASM
  instance (zeroed memory) before calling `_init`, but the generated Odin's *public API
  contract* — the one game code actually links against — promises a real reset and does not
  deliver one.
- **Voice-steal policy is pure oldest-by-age, never release-phase-first**, contradicting the
  practitioner convention the manual itself cites. This is already an honest "Code-vs-intent"
  note in `instrument.md` but was not elevated to its own Tier 1 finding; it belongs in this
  layer because it's the one voice-allocation decision with the widest audible consequence and
  a well-known, cheap alternative.
- **No note-flooding guard**: repeated `note_on` for a note that is already sounding always
  allocates or steals a fresh voice — there is no "this note is already active, ignore or
  reuse" path. A game that calls `trigger()`/`note_on` once per frame instead of once per
  press (an easy, natural mistake) will thrash through the entire voice pool continuously.
- Two smaller but concrete note-lifecycle findings: voices with no ADSR get an instantaneous,
  unfaded cutoff at `duration` expiry (a click risk `_trigger()`'s own 1.0 s default duration
  walks straight into), and ties in the steal-victim search always resolve to the
  lowest-indexed voice, which is deterministic but musically arbitrary for an overflowing
  chord.

## Findings

### F-B03-1: `_init` claims to fully reset a live processor; it resets almost nothing per-voice and skips Delay's buffer entirely
- **kind**: code-bug
- **area**: voice/processor lifecycle (`<Foo>_init`)
- **severity**: high
- **confidence**: high
- **evidence**: `skald-backend/core/codegen.odin:1375-1383`:
  ```
  // Effect history is processor state, not allocator state. Explicitly clear
  // Reverb's comb and pre-delay histories so calling init on an existing
  // processor has the same reset semantics as initializing a fresh one.
  for node in all_nodes {
      if node.type != "Reverb" do continue
      fmt.sbprintf(&sb, "\tp.delay_%s_buffer = {{}}\n", node.id)
      fmt.sbprintf(&sb, "\tp.delay_%s_write_index = 0\n", node.id)
      fmt.sbprintf(&sb, "\tp.reverb_%s_pre_buffer = {{}}\n", node.id)
  }
  ```
  The guard `if node.type != "Reverb" do continue` means a `Delay` node's identically-named
  `delay_%s_buffer`/`delay_%s_write_index` fields (declared for both types at `:1182-1184`)
  are never cleared here. Separately, the only per-voice work `_init` performs at all is the
  RNG reseed loop at `:1338-1362`, which sets `v.noise_%s_rng.state` / `v.sh_%s_rng.state` —
  nothing else on any voice (not `active`, `note`, `age`, `osc_%s_phase`, `filter_%s_low/band`,
  `adsr_%s_stage`, `sh_%s_counter`/`current_value`, or the pink-noise `noise_%s_p0/p1/p2`
  history) is written anywhere in `generate_processor_code`'s init block (`:1319-1391`).
- **detail**: The comment states an invariant — "same reset semantics as initializing a fresh
  one" — that the code does not fulfill for two entire categories of state: Delay's ring
  buffer, and the whole voice array. A game that keeps one long-lived `Processor` struct and
  calls `_init` again (e.g. on a level reload, or to hard-reset a persistent music-layer
  instrument) would get: reseeded RNGs, cleared Reverb history, reinitialized exposed params —
  but every voice that was mid-note keeps playing with its old age/stage/phase, and any Delay
  node keeps repeating whatever was in its buffer, indefinitely, because `write_index` is also
  untouched. In Skald's own live-preview worklet this is invisible only because
  `instantiate()` always builds a brand-new `WebAssembly.Instance` (fresh, zeroed linear
  memory) before calling `skald_init`
  (`skald-ui/src/hooks/nodeEditor/audioWorklets/skaldWasm.worklet.ts:77-79`) — the bug is
  latent for the editor and live for anyone using the generated Odin as intended, directly in
  a game.
- **suggested fix**: Either drop the misleading comment and document `_init` as
  "construction-time only, do not call on a live processor," or make it true: clear every
  `Delay`/`Reverb` buffer and write-index (not just Reverb's), and add an explicit
  `p.voices = {}` (or equivalent per-field zeroing, if Voice_State ever needs a non-zero
  default) before the RNG reseed loop so the two really do match.

### F-B03-2: The "fresh voice reset keeps retriggers deterministic" rule is applied to five node types and silently skipped for three others with identical per-voice lifetime
- **kind**: inconsistency
- **area**: voice state reset policy (Oscillator, Filter, FmOperator, Wavetable, Distortion vs. LFO, Noise, SampleHold)
- **severity**: medium
- **confidence**: high
- **evidence**: The reset switch at `skald-backend/core/codegen.odin:1477-1501` (gated
  `if !stolen`, preceded by the comment at `:1471-1476`: "Fresh voices were silent, so for
  them the reset is inaudible and keeps retriggers deterministic") has cases only for
  `"Filter"`, `"Oscillator"`, `"FmOperator"`, `"Wavetable"`, `"Distortion"`. `"LFO"`,
  `"Noise"` and `"SampleHold"` are absent from that switch — and absent from *every* other
  reset path in `note_on`/`note_off` too (confirmed by grepping every `lfo_%s_phase`,
  `noise_%s_rng`/`_p0`, `sh_%s_counter`/`_current_value` write site in the file — the only
  writes are the per-sample update in each node's own generator and the one-time RNG reseed
  in `_init`, `:1338-1362`). `lfo.md:46` and `sampleHold.md:39` both independently confirm and
  narrate this same omission as if it were a stated design ("the S&H is not reset when a note
  starts... `SampleHold` is not in that list").
- **detail**: This is not "each node doing its own uncoordinated thing" in the chaotic sense
  Tier 1 worried about — there is an identifiable, coherent 3-way split (audio-path DSP state:
  reset-on-fresh; envelope: always-retrigger; per-voice modulation sources: never reset). But
  the split is nowhere stated as a rule anywhere in the code, and the one place a rule *is*
  written down (`:1471-1476`) gives a justification that argues for including LFO/Noise/S&H,
  not excluding them: a fresh voice's LFO output was equally inaudible (the voice was silent),
  so zeroing its phase would be equally free and equally deterministic. Concretely, in
  `examples/instruments/bass/lfo-filter-wobble-bass.skald.json` (an 8 Hz per-voice LFO wired
  to the filter's `input_cutoff`, voice-domain since it sits ahead of any Delay/Reverb), the
  *first* note ever played on a given voice slot always starts the wobble at phase 0 —
  reproducible — but the *next* note that reuses that same slot (whether by steal or by
  finding it idle again) picks the LFO up wherever the previous note left it, which depends on
  exactly how long that previous note ran. Two notes that are otherwise identical (same pitch,
  same velocity, same duration) can render bit-different audio purely because of unrelated
  play history — a real regression against the "keeps retriggers deterministic" goal the
  adjacent code explicitly cares about (and against golden-test reproducibility generally,
  since the golden-test infrastructure clearly assumes deterministic generation).
- **suggested fix**: Either (a) extend the existing "reset on fresh, preserve on steal" switch
  to also zero `lfo_%s_phase`, the S&H `counter`/`current_value`, and the Noise `p0/p1/p2`
  pink-filter history (leave the RNG `.state` alone — it's already deterministically reseeded
  once at construction and re-randomizing it per note would remove entropy, not add
  consistency) — restoring determinism for genuinely-fresh voices while keeping the documented
  free-running behavior for steals; or (b) if free-running-always is the intended behavior for
  modulation sources specifically, say so in one place (a comment on `Voice_State` itself, plus
  a line in each chapter) instead of leaving it as something a reader has to discover
  independently per node, and add a per-node "Retrigger" toggle (see F-B03's sibling note below
  under Going Further) so the free-run/retrigger choice becomes the user's, not an
  accidental byproduct of which five node types happened to get a reset case.
- **manual impact**: `lfo.md`'s "One LFO per voice" section and `sampleHold.md`'s "the S&H is
  not reset" note would need to describe the *general* per-voice reset rule (which five types
  get it, which three don't, and why) rather than each independently rediscovering the same
  omission; `instrument.md`'s "Under the hood" "Why stealing does not click" paragraph would
  gain a sentence noting the same click-avoidance logic does not (and, under this proposal,
  now would) extend to modulation-source state.
- **migration**: Fresh-voice-only reset is (by the same logic as the existing Oscillator/
  Filter cases) audible only in a way that removes randomness/history-dependence, never adds
  it — no existing patch's steady-state sound changes, only its very first note per voice-slot
  becomes reproducible where it previously wasn't. Safe to land without any opt-in flag or
  patch migration.

### F-B03-3: Voice stealing is pure oldest-by-age; it never prefers a voice already in Release, contradicting the practitioner norm the manual itself cites
- **kind**: design
- **area**: voice allocation / steal victim selection
- **severity**: medium
- **confidence**: high
- **evidence**: `skald-backend/core/codegen.odin:1404-1414` — the steal branch compares only
  `p.voices[i].age` with no reference to `adsr_%s_stage`:
  ```
  stolen = true
  oldest_age: f32 = -1.0
  for i in 0..<polyphony {
      if p.voices[i].age > oldest_age {
          oldest_age = p.voices[i].age
          voice_idx = i
      }
  }
  ```
  `docs/manual-source/nodes/instrument.md:17` and its own Code-vs-intent note 2 (line 282)
  already state the gap plainly: "the polite convention is to first look for a voice already
  in its release phase... Skald's steal loop only compares `age`... so a long-held sustaining
  pad note that started first is stolen ahead of a note released a moment ago."
- **detail**: This is a genuine musical downside, not just documentation debt: on an 8-voice
  pad instrument playing a long sustained chord, the *oldest* sustained note (the one a
  listener is most likely to be attending to, since it has been ringing the longest and is
  probably the harmonic anchor of the chord) is stolen ahead of a note that was released a
  fraction of a second ago and is already fading toward silence — exactly backwards from what
  a musician expects and from what most polysynths do. Click-free handover (verified correct
  by Tier 1, `codegen.odin:1416-1441`) softens the transition but does not fix *which* note
  disappears.
- **suggested fix**: Two-tier steal search: first pass restricted to voices whose
  `adsr_%s_stage == .Release` for some/any ADSR in the voice, picking the oldest among those;
  only fall back to the current pure-age search across all voices if no voice is releasing.
  This is a small, local change to the existing loop (an `if` around the current body, run
  twice) with no state-shape or API changes — it does not require a new instrument parameter,
  since it strictly improves the *existing* "oldest" policy rather than replacing it with a
  configurable one. If a configurable policy is wanted instead, `voiceStealing` already exists
  as a dead field on `InstrumentParams` (`types.ts:194`) that nothing reads — see the next
  point.
- **manual impact**: `instrument.md`'s Code-vs-intent note 2 (line 282) would flip from
  documenting a gap to documenting the fix; the "Voice stealing" paragraph under "What it is"
  (line 17) and the "Voice stealing" glossary entry (line 264) would both need their "Skald
  always steals the oldest" claim qualified to "the oldest among releasing voices, if any
  exist."
- **migration**: Purely a change in *which* voice gets picked under steal pressure — no
  struct shape or saved-patch change. Every existing patch keeps working; the only observable
  difference is which note gets cut when a chord exceeds `voiceCount`, which is exactly the
  intended fix. No migration needed.

### F-B03-4: No note-flooding guard — a repeated `note_on` for an already-sounding note always grabs another voice, with no reuse/dedup path
- **kind**: missing-feature
- **area**: voice allocation (`<Foo>_note_on`)
- **severity**: medium
- **confidence**: high
- **evidence**: `skald-backend/core/codegen.odin:1394-1414` — the free-voice scan
  (`for i in 0..<polyphony { if !p.voices[i].active { ... } }`) and the steal fallback consider
  every voice unconditionally; neither checks whether `p.voices[i].note == note` is already
  true anywhere in the pool before allocating. `skald-ui/src/hooks/nodeEditor/audioWorklets/
  skaldWasm.worklet.ts:118-119` forwards every `note_on` message straight to
  `ex.skald_note_on(...)` with no debounce, and (`m.asset < 0`) case broadcasts one `note_on`
  to *every* loaded asset per message.
- **detail**: This matches the brief's "note flooding" question directly. A game (or a
  careless preview interaction — e.g. a UI element that calls `trigger()` on every animation
  frame while a key/pad is held, rather than once on press) will, for a monophonic instrument,
  continuously re-steal the single voice from itself every frame (constant, audible re-attack
  chatter); for a polyphonic instrument, it will cycle through the entire voice pool doing the
  same thing to a different voice each call, exhausting polyphony that should have been
  available for other notes. There is no "this note is already active, do nothing" or
  "this note is already active, just extend/refresh it" mode — every `note_on` is
  unconditionally a new voice grab.
- **suggested fix**: Document the API contract explicitly (call `note_on` exactly once per
  physical press, `note_off` once per release — this may already be everyone's intent, but
  nothing states it) and/or add an optional dedup: if a voice with matching `note` and
  `active && stage != .Release` already exists, reuse that voice's index instead of scanning
  for a new one. The latter is a small, local addition to the existing scan loop (check for a
  matching active note first, before checking for `!active`) and changes the effective
  behavior of repeated same-note triggers from "steal a different voice every time" to
  "retrigger the same voice" — arguably closer to real hardware synth behavior for a held key.

### F-B03-5: Voices with no ADSR get an instantaneous, unfaded cutoff at `duration` expiry — a click risk the `_trigger()` 1 s default walks straight into
- **kind**: code-bug
- **area**: note lifecycle / auto-release (envelope-less patches)
- **severity**: medium
- **confidence**: high
- **evidence**: `skald-backend/core/codegen.odin:1923-1930`:
  ```
  if has_adsr {
      fmt.sbprint(&sb, "\t\tif !voice_busy do voice.active = false\n")
  } else {
      fmt.sbprint(&sb, "\t\tif voice.duration > 0.0 && voice.age >= voice.duration do voice.active = false\n")
  }
  ```
  For a patch with no ADSR, `voice.active` flips straight to `false` — no ramp, no fade — the
  instant `age >= duration`. And `_trigger()` (`:1569-1596`) computes its own default duration
  when the caller passes `<=0`: with an ADSR present it derives one from attack+decay
  (`:1584-1591`); with **no** ADSR it hardcodes `d = 1.0` (`:1593`) — i.e. exactly the
  envelope-less path that hits the hard cutoff above, at a fixed one second, on every default
  `_trigger()` call.
- **detail**: An oscillator (or noise, or FM operator) wired straight to Output with no ADSR
  in between is a legal, buildable Skald patch — nothing prevents it, and it's the natural
  first patch a beginner makes before adding an envelope. Calling that instrument's
  `_trigger()` with the default arguments plays exactly one second of full-amplitude signal
  and then cuts it to true zero on the next sample, with no shaping. Unless the waveform
  happens to cross zero at that exact sample (vanishingly unlikely for a sustained tone), this
  is an audible click/pop on every single trigger of every envelope-less instrument — not an
  edge case, but the default behavior of the simplest possible patch.
- **suggested fix**: Either require an ADSR in the auto-release path generation (fail codegen,
  or emit a warning, for an audio-path patch with no envelope at all — matching the existing
  "refuse rather than silently produce a broken/surprising asset" philosophy already used for
  the DAG-cycle and unknown-node-type checks in this same file), or apply a short fixed-length
  fade (a few milliseconds) at the deactivation boundary specifically for the no-ADSR case, so
  the hard stop cannot land mid-waveform.
- **manual impact**: none found — no manual chapter currently documents envelope-less
  patches' auto-release behavior at all; this would be new content, likely a short note in
  `nodes/adsr.md`'s "Why you patch it this way" or `nodes/instrument.md`'s "Why you patch it
  this way" (the "canonical chain... source → shaper → amplifier" paragraph could gain an
  explicit warning that skipping the amplifier/envelope stage entirely is legal but clicks).

### F-B03-6: Steal-victim ties always resolve to the lowest voice index — deterministic, but not a musical rule
- **kind**: design
- **area**: voice allocation tie-breaking
- **severity**: low
- **confidence**: medium
- **evidence**: `skald-backend/core/codegen.odin:1408-1413` uses strict `>` when tracking
  `oldest_age`, so among voices with equal `age` the first (lowest-index) one found keeps
  `voice_idx` and is never displaced by a later equal-age voice. The sequencer's chord-step
  emission (`:2200-2208`) fires one `_note_on` call per chord note in the same step,
  sequentially, so a chord that overflows `voiceCount` in a single step produces exactly this
  situation: several notes triggered at (as good as) the same instant.
- **detail**: This only matters when a single sequencer step's chord has more notes than
  `voiceCount` — a real but narrow case (e.g. an 8-voice instrument playing a 10-note chord
  stab). When it happens, the notes that overflow always steal voices 0, 1, 2… in ascending
  index order — which, because voice index has no relationship to pitch, velocity, or note
  order within the chord, means the "dropped" notes are an implementation artifact (array
  layout) rather than a musical choice (e.g. dropping the lowest-velocity or the
  highest/lowest-pitch notes, which is what a "note priority" scheme — already named as a
  concept in `instrument.md`'s own glossary, line 265 — would do deliberately).
- **suggested fix**: Low priority given how narrow the trigger condition is. If addressed at
  all, it's naturally folded into the same change as F-B03-3 (steal search): once a
  release-first tier exists, break remaining ties by something meaningful (e.g. lowest
  velocity) rather than leaving index order as the de facto rule.

### F-B03-7: Unison's "correlated attack" cost is asymmetric between fresh and stolen voices, and nothing signals which one a given note will get
- **kind**: inconsistency
- **area**: voice allocation × unison (extends `instrument.md` Code-vs-intent note 7)
- **severity**: low
- **confidence**: medium
- **evidence**: Fresh-voice reset zeroes the *entire* unison phase array in one statement,
  `v.osc_%s_phase = {{}}` (`skald-backend/core/codegen.odin:1487`), so every unison copy starts
  perfectly in phase, exactly as `instrument.md` note 7 (line 292) already documents ("Unison
  copies all start at phase zero, so unison width fades in rather than being present at the
  attack"). But that reset is inside the `if !stolen` block (`:1497-1499`) — a **stolen**
  voice's unison phases are the preserved, already-running values from whatever the previous
  note left them at, which (per the same note's own math: "the outermost pair differ by about
  15 Hz... full width arrives after roughly 60-70 ms") are very likely already decorrelated by
  the time of the steal.
- **detail**: The consequence the manual describes ("unison width fades in") is therefore not
  a fixed property of the patch — it depends on whether the note that just played happened to
  land on a genuinely idle voice or on a stolen one, which in turn depends on how hard the
  instrument's polyphony is being pushed at that moment. The same supersaw patch can sound
  "correlated, thin attack building to full width" on a sparsely-played passage and "full
  width from the first sample" on a densely-played one (high note rate relative to
  `voiceCount`, so most notes steal), with nothing in the UI indicating which regime a given
  performance is in.
- **suggested fix**: If the "fades in" behavior documented in note 7 is considered acceptable
  (or even desirable) for fresh voices, apply the same phase-zeroing on steal too, so the
  behavior is at least consistent regardless of voice-pool pressure; if instead the eventual
  fix for note 7 is randomized per-copy start phase (as the note itself suggests, citing
  standard supersaw practice), apply that uniformly on both fresh and stolen allocation for
  the same reason.
- **manual impact**: `instrument.md` Code-vs-intent note 7 would gain a sentence noting the
  fresh/steal asymmetry described here.
- **migration**: Same as F-A06's oscillator determinism discussion — purely a change in
  starting phase, no struct/patch-format change, no migration needed either way.

### F-B03-8: No runtime indication of per-instrument voice usage, so tuning `voiceCount` by ear has no supporting readout
- **kind**: qol
- **area**: voice allocation UI (extends F-A09-9)
- **severity**: low
- **confidence**: medium
- **evidence**: `InstrumentNode.tsx` renders name, ports, and an inline Volume control
  (`:64-104`, `:80-88`) but nothing derived from `p.voices[i].active`; the WASM export surface
  does expose `skald_is_playing` per asset (`codegen.odin:1651-1662`) but nothing finer-grained
  (e.g. "N of `voiceCount` voices currently active") is exported or displayed anywhere in
  `skald-ui/src/components`.
- **detail**: `instrument.md`'s own "Going further" advice — "Pick `voiceCount` from the
  music, not from ambition" — is advice a user can only follow by ear (does it sound thin? Do
  I hear stealing?) with no instrumentation to confirm what actually happened during a given
  playthrough (how many voices were active at peak, whether any steal occurred at all). This
  is distinct from F-A09-9 (which is about comparing configured settings *across* sibling
  instruments); this is about observing *runtime* behavior of a single instrument.
- **suggested fix**: A small live readout on the selected Instrument node during preview
  playback — active-voice count out of `voiceCount`, and/or a steal counter that increments
  each time `note_on`'s `stolen` branch fires — would close this cheaply, reusing state that
  already exists on the processor.

## Verified-consistent (not findings)

- **Bus-domain isolation from voice steal is correct and consistent.** Delay/Reverb buffers
  live on the processor, not the voice, and are explicitly excluded from every per-note reset
  path (`codegen.odin:1471-1476`, "Bus-domain node state lives on the processor and is never
  reset per note"); a stolen voice's already-emitted samples inside a shared delay/reverb tail
  are never truncated or disturbed by the steal, because the bus block runs once per sample on
  the post-sum signal regardless of which individual voices are active
  (`codegen.odin:1934-1936`, "Runs regardless of voice.active, so echo/reverb tails keep
  ringing after the last voice dies"). This is the one place a cross-node reset concern was
  checked and is actually right everywhere it applies.
- **ADSR's own reset policy is internally coherent.** Unlike the ad hoc `if !stolen` switch for
  DSP state, ADSR's attack-start/release-level capture (`codegen.odin:1416-1441`,
  `:1464-1470`) is computed once, uniformly, for both fresh and stolen voices (fresh simply
  yields a captured level of `0.0`), so there is exactly one code path and it produces the
  right answer in both cases without a special-cased branch.
- **First-ever note allocation is deterministic.** Because Odin zero-initializes
  `Voice_State.active` to `false`, the very first notes played against a freshly constructed
  processor always land on genuinely free voices via the `!active` scan
  (`codegen.odin:1396-1401`), never the steal path — confirmed by reading the full
  `note_on` proc, not merely assumed from the "oldest_age: f32 = -1.0" sentinel.
