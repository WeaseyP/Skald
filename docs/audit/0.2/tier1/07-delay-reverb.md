## Summary

- The **Delay** and **Reverb** chapters are largely accurate against the current code for the seven-check floor: bus-domain split rationale (`codegen.odin:60-95`), legal downstream node lists, no-modulation-port design (`graph_validate`/`param_utils`'s empty-port guard), the feedback-comb math (`codegen.odin:514-542`), the RT60→gain formula (`codegen.odin:545-578`), the BPM-sync seconds expression (`codegen.odin:28-58`, mirrored in `skald-ui/src/definitions/bpm.ts:45-58`), and the legacy `time`/`wetDryMix` fallback (`param_utils.odin:105-131`) all verified TRUE, with only line-number drift.
- **The single biggest thing wrong with the Reverb chapter is that it is out of date, not that it is wrong about the code as it existed when written.** Reverb's Pre-Delay is now a fully implemented, tested feature (its own buffer, its own acceptance test, its own golden file) — directly contradicting the chapter's headline Code-vs-intent note #1 ("Pre-Delay... does nothing (blocker)") and note #2 (nonsense ±1e6 range). See F-A07-1.
- The Delay chapter's Code-vs-intent note #2 (three-way Delay-Time range disagreement) is also now **resolved in code** — node card, panel slider and backend table all agree on 0–2 s. See F-A07-2.
- Two real bugs found that the manual doesn't mention at all: Delay's ring buffer is never cleared on processor re-init while Reverb's now is (F-A07-3), and exposing "BPM Sync" produces a live-looking but completely dead, wrongly-typed, wrongly-ranged runtime parameter (F-A07-4).
- Design review (per the added brief): the bus-domain/shared-buffer architecture is the right call for both nodes and already correctly implemented — not a per-voice bug. But Delay's boolean-mode-plus-shadow-parameter pattern for time (F-A07-5) and Reverb's oversized/undifferentiated buffer and missing Damping/Size controls (F-A07-6, F-A07-7) are worth changing in 0.2 regardless of what the current manual says.
- Confirmed-still-valid manual notes I did not re-litigate as new findings (already-known, spot-checked against current line numbers and still true): three feedback ceilings (0.95/1.0/0.99/0.95) (`DelayNode.tsx:15`, `NodeParameterControls.tsx:175`, `param_ranges.odin:76-77`, `codegen.odin:539`); no dotted sync divisions (`bpm.ts:33-41`); BPM-synced time can exceed the 2 s buffer at low BPM (`codegen.odin:47-57`, `bpm.ts:18`); Reverb's `decay` still borrows ADSR's range with three different minimums; the dead `size` key in `ambient-reverb-pad.skald.json`; the `classic-delay-puck.skald.json` legacy-key three-way-disagreement example.

## Findings

### F-A07-1: Reverb Pre-Delay now works — the manual's headline "does nothing" claim is stale
- **kind**: doc-bug
- **node**: Reverb
- **severity**: high
- **confidence**: high
- **evidence**: `skald-backend/core/codegen.odin:21-26` (new `MAX_REVERB_PREDELAY_SAMPLES :: 48000` constant with a comment describing the intentional 0–250 ms range); `codegen.odin:545-578` (`generate_reverb_code` now reads `preDelay`, clamps it 0–0.25 s, runs it through a dedicated ring buffer `reverb_%s_pre_buffer`, and feeds the pre-delayed signal — not the raw input — into the comb); `codegen.odin:1182-1188` (struct field `reverb_%s_pre_buffer: [48000]f32` emitted only for Reverb); `param_ranges.odin:78-79` (`preDelay` now has a dedicated range entry `{0.0, 0.25, 0.02, "s"}` instead of falling through to the unknown-param ±1e6 fallback); `skald-ui/src/components/NodeParameterControls.tsx:237` (`slider('preDelay', 0, 0.25, 0.02)`, matching the backend exactly); `skald-backend/tests/golden/reverb_predelay.odin.golden` (new golden file); `skald-backend/acceptance/main.odin:398-452` (dedicated `reverb_predelay` acceptance test asserting the impulse onset shifts by the authored 20 ms and by a runtime-set 40 ms, and asserting the `Asset_PARAMS` metadata is exactly `{min:0, max:0.25, default:0.02, unit:"s"}`). Contrast with the manual's `reverb.md` "The controls" table ("**Nothing, currently.** `generate_reverb_code` never reads this key"), "Try it" step 8 ("Prove Pre-Delay is inert... Nothing changes"), and Code-vs-intent notes 1 and 2.
- **detail**: When the chapter was written, Pre-Delay was decorative. It no longer is: it's a real, clamped, tested parameter with its own buffer and its own acceptance test proving both authored and runtime-set behavior. A user following the manual's exercise step 8 today would drag Pre-Delay to 1.0 expecting no change and instead hear the reverb tail start noticeably later — the opposite of what the chapter promises, which undermines trust in every other claim in the chapter.
- **suggested fix**: Rewrite the Pre-Delay row in "The controls" table, delete/replace "Try it" step 8, and remove Code-vs-intent notes 1 and 2 (or convert them to a short "fixed in 0.2" changelog note); add a "What you hear as you sweep Pre-Delay" subsection analogous to the Decay/Mix ones, since this is now a real, audible control worth teaching.

### F-A07-2: Delay Time's three-way range disagreement is fixed — manual note is stale
- **kind**: doc-bug
- **node**: Delay
- **severity**: medium
- **confidence**: high
- **evidence**: `skald-ui/src/components/Nodes/DelayNode.tsx:14` (node card: `min: 0, max: 2`); `skald-ui/src/components/NodeParameterControls.tsx:173` (panel slider now `slider('delayTime', 0, 2, 0.5)` — **not** 0.001–5 as the chapter states); `skald-backend/core/param_ranges.odin:74-75` (`delayTime: {0.0, 2.0, 0.5, "s"}`). All three now agree on 0–2 s. Contrast with `delay.md`'s "The controls" table ("Range (panel slider) | 0.001 – 5") and Code-vs-intent note #2 ("Delay Time range disagrees three ways... Set 3.5 s on the panel slider and the preview and export both give you 2 s with no warning").
- **detail**: The panel slider's max was brought down from 5 to 2 (and its min from 0.001 to 0) at some point after the chapter was written, so it is now impossible to enter a value on the panel that the backend has to silently clamp. This is good — the divergence the manual worries about no longer exists.
- **suggested fix**: Update the range column in "The controls" table to read 0–2 for both node-card and panel-slider columns, and delete Code-vs-intent note #2 (or mark it "fixed in 0.2").

### F-A07-3: Delay's ring buffer is not cleared on processor re-init; Reverb's is
- **kind**: code-bug
- **node**: Delay
- **severity**: medium
- **confidence**: medium
- **evidence**: `skald-backend/core/codegen.odin:1375-1383`:
  ```odin
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
  This loop explicitly filters to `node.type != "Reverb" do continue` — a Delay node's `delay_%s_buffer`/`delay_%s_write_index` are never zeroed by this pass, even though they are structurally identical fields (same names, same declaration site at `codegen.odin:1182-1184`) to the ones Reverb clears.
- **detail**: The comment states the goal in general terms — "so calling init on an existing processor has the same reset semantics as initializing a fresh one" — but the implementation only honors that goal for Reverb. If a host calls `<Asset>_init` again on an already-used processor (voice-pool reuse, restarting a looping SFX instance without reallocating), a Delay node's buffer and write index retain whatever audio and phase were left from the previous use, so the "fresh" instance's first echoes are contaminated by stale, unrelated audio, while a Reverb on the same asset correctly starts silent. First `new()`-allocated use is unaffected (Odin zero-initializes fresh memory), so this only bites re-init-for-reuse call patterns; no acceptance test currently exercises double-init on the same processor for either node type, so this is unverified by the test suite in either direction.
- **suggested fix**: Change the filter to `if node.type != "Delay" && node.type != "Reverb" do continue` (or equivalently `if node.type == "Delay" || node.type == "Reverb"`) so Delay gets the same explicit reset Reverb does.

### F-A07-4: Exposing "BPM Sync" on a Delay creates a dead, boolean-typed, nonsense-range runtime parameter
- **kind**: code-bug
- **node**: Delay
- **severity**: high
- **confidence**: high
- **evidence**: `skald-ui/src/components/ParameterPanel.tsx:242-270` (`renderBpmSyncToggle` wires a link/expose icon next to the BPM Sync checkbox exactly like any other parameter — `toggleParameterExposure('bpmSync', ...)` — so a user can and will expose it). Once exposed: `skald-backend/core/codegen.odin:35-58` (`bpm_sync_seconds_expr`) reads `node.parameters["bpmSync"]` **directly from the raw JSON** — never from the resolved/exposed struct field — to choose, at codegen time, whether the emitted delay-time expression is the sync formula or `delayTime`. The exposed struct field, typed setter and `_PARAMS` row that get generated for `bpmSync` (via the generic exposure pipeline at `codegen.odin:1216-1283`) are therefore inert: setting them at runtime cannot change which branch the generated code takes, because that branch was already baked in when the file was generated. Compounding this: `codegen.odin:656-673` (`exposed_param_default`) only handles `json.Float`/`json.Integer` in its switch — a JSON boolean falls through untouched and the field silently defaults to `param_ranges.odin`'s generic unknown-parameter fallback, `{-1.0e6, 1.0e6, 0.0, ""}` (no `"bpmSync"` case exists in `lookup_param_range`, `param_ranges.odin:46-119`). So an exposed "BPM Sync" advertises itself in `<Asset>_PARAMS` as a plain float with min −1,000,000, max 1,000,000, default 0.0, no unit — not as a boolean, and not reflecting whatever the node's actual saved `bpmSync` value was.
- **detail**: A user who clicks the link icon next to BPM Sync (a perfectly reasonable thing to try — every other row has one, and the checkbox is right there) gets a control that a game can call `set_param("delay_1::bpmSync", 1.0)` on with no error and no audible effect whatsoever, advertised with a meaningless ±1e6 range that doesn't even communicate "this is a boolean." This is strictly worse than the already-documented delayTime-while-synced dead control (manual note #5), because there the setter at least has the correct 0–2 s range and clamps sensibly — here neither the type nor the range nor the runtime effect is right.
- **suggested fix**: Either exclude `bpmSync` (and any other boolean/enum-backed field) from the exposure UI entirely, or make `bpm_sync_seconds_expr` read the resolved/exposed field at runtime (`p.bpmSync != 0`) instead of the raw JSON, and give `lookup_param_range` a `{0.0, 1.0, 0.0, ""}` case for boolean-typed parameters so the metadata at least describes a switch rather than an unbounded float.

### F-A07-5 (design): Delay's boolean BPM-Sync + shadow-parameter pattern is the same "hidden dead control" anti-pattern as Oscillator's Fixed Pitch
- **kind**: design
- **node**: Delay
- **severity**: medium
- **confidence**: medium
- **evidence**: `skald-ui/src/components/Nodes/DelayNode.tsx:12-14` (`bpmSync` toggle gates `syncRate` vs `delayTime` via mutually-exclusive `showIf`); `codegen.odin:35-58` and `:509-512`/`:516-519` (the sync expression unconditionally overwrites `delayTime`'s use at codegen time, matching the manual's own note #5); F-A07-4 above (exposing `bpmSync` itself is dead); manual note #5 (exposing `delayTime` while synced is dead).
- **detail**: Delay stores two independent, permanently-live representations of "how long is the gap" — a free-run seconds value and a musical-division-plus-tempo value — selected by a boolean that itself cannot be meaningfully exposed (F-A07-4) and that silences one of the two representations without deleting or graying out its exposure state (manual note #5). This is architecturally the same class of problem the Oscillator chapter already calls out for Fixed Pitch: a boolean mode switch that discards a continuum (there: key-track amount 0–100%; here: "how locked to tempo is this delay") and leaves an orphaned, independently-toggleable parameter behind it that looks live in the exposure UI but is dead in the generated code. The fact that it surfaces in two different ways here (exposing either side of the switch is dead) suggests the exposure system itself needs to be mode-aware, not just this one node.
- **suggested fix**: Either (a) collapse to one canonical stored `delayTime` (seconds) and treat BPM Sync as a live runtime override computed from `p.bpm` and `syncRate` on top of it — visible in the UI as "seconds, optionally locked to a grid" rather than two competing storage slots — or (b), as a smaller fix, make the exposure UI mode-aware: gray out (don't just hide) the link icon for `delayTime` when synced and for `syncRate`/`bpmSync` when not, so a user can never produce an exposed-but-inert parameter through the UI at all.
- **manual impact**: `delay.md` — "The controls" table row for `bpmSync`/`syncRate`/`delayTime`; the "`syncRate` + `bpmSync`" subsection under "What you hear as you sweep each one"; the "What 'expose' does" subsection (the "One trap" paragraph about exposing `delayTime`); Code-vs-intent note #5 in its entirety would need to describe the new mechanism instead of documenting the old trap.
- **migration**: No change to saved JSON shape is required for option (b) (UI-only gating) — zero risk to `examples\`. Option (a) (collapsing storage) would need an upgrade-on-load step for any patch with `bpmSync: true`: resolve `syncRate` against the patch's project BPM at load time, write the resulting seconds value into `delayTime` so the free-run value is never stale, and keep `syncRate` around unchanged for display/continued sync. `examples/songs/loops/geowars/splitter-echo-stab.skald.json` (bpmSync true, syncRate "1/8") and any other synced Delay example would need exactly this resolve-and-backfill pass; nothing would need to change in patches that already have `bpmSync: false`.

### F-A07-6 (design): Reverb allocates a full 96000-sample (2 s) buffer to hold a fixed 75 ms tap
- **kind**: design
- **node**: Reverb
- **severity**: low
- **confidence**: high
- **evidence**: `codegen.odin:1182-1188` — Reverb gets `delay_%s_buffer: [96000]f32` (the same `MAX_DELAY_SAMPLES` constant Delay uses) via the shared `if node.type == "Delay" || node.type == "Reverb"` branch, plus its own `reverb_%s_pre_buffer: [48000]f32`. But Reverb's comb tap is hard-coded to 75 ms (`delay_time := 0.075` at `codegen.odin:555`) and never reads more than `int(0.075 * sample_rate)` samples back (`codegen.odin:568-570`) — at 192 kHz that's 14,400 samples, still a fraction of 96,000.
- **detail**: Every Reverb node now costs roughly 576 KB of processor memory (384 KB main buffer + 192 KB pre-delay buffer), of which only about 62 KB is ever read at 48 kHz (14.4 KB main tap + 48 KB max pre-delay) and proportionally more, but still well under half, at any supported rate. This isn't a correctness bug — it reuses Delay's allocation code path for convenience — but it's a design smell: the buffer size is coupled to a constant (`MAX_DELAY_SAMPLES`) that has nothing to do with Reverb's actual fixed tap length, and it silently doubles again (per node) with the pre-delay addition. On a memory-constrained target (the manual's own "Mind the memory" section already flags this direction), four Reverbs now costs ~2.3 MB rather than the ~1.5 MB the manual states.
- **suggested fix**: Give Reverb its own tap-sized constant (e.g. `MAX_REVERB_TAP_SAMPLES` scaled to the comb's fixed 75 ms at the highest supported sample rate) instead of reusing `MAX_DELAY_SAMPLES`, and size `delay_%s_buffer` from that when `node.type == "Reverb"`.
- **manual impact**: `reverb.md` "Going further" → "Mind the memory" paragraph needs its 384 KB figure updated to include the new pre-delay buffer, and (if the fix above is taken) updated again to the smaller true footprint.
- **migration**: Purely an internal buffer-size change; the field is opaque processor state, never serialized in `.skald.json`, so no example patch is affected either way.

### F-A07-7 (design): Reverb has no Damping and no Size — two of the four controls every commercial reverb exposes
- **kind**: missing-param
- **node**: Reverb
- **severity**: medium
- **confidence**: medium
- **evidence**: `skald-ui/src/definitions/types.ts:110-114` (`ReverbParams` = `decay`, `preDelay`, `mix` — no `damping`, no `size`); `codegen.odin:545-578` (single fixed-length comb, uniform decay across all frequencies, tap length hard-coded at `0.075`, not exposed or parameterized anywhere). The manual's own "Under the hood" and "Going further" sections already describe both gaps as workarounds ("Add the damping the node lacks... patch a Lowpass Filter after the Reverb", "the fixed tap length... is not what the node was designed for") rather than as node features.
- **detail**: Real reverberant decay loses high frequencies faster than low ones (air/surface absorption), and "room size" is usually controlled by the reflection spacing, not just how many times a fixed-length reflection repeats. Skald's Reverb can only vary decay time and dry/wet — every setting sounds like the same small, undamped room, just rung for longer or shorter. This is a legitimate, cheap-to-implement gap: a one-pole lowpass inside the feedback path (a "damping" coefficient multiplying the fed-back sample before the lowpass, or vice-versa) is the standard, minimal way Schroeder-style reverbs simulate HF absorption, and costs one more multiply-add per sample; a Size control that scales the 75 ms tap (e.g. 20–150 ms) would let users move between "small room" and "large hall" character instead of only "long or short version of the same room."
- **suggested fix**: Add `damping` (0–1, default 0, backward-compatible no-op) implemented as a one-pole lowpass on the fed-back signal before it re-enters the buffer, and consider a `size` parameter (default 0.075 s, matching current behavior) that scales the tap length instead of hard-coding it.
- **manual impact**: `reverb.md` "What it is" (the paragraph explaining Skald implements "the first half" of Schroeder's idea) and "Under the hood" (the "Two more implementation facts" paragraph and the "Simple FDN" comment discussion) would both need to describe the new stage; "Going further" → "Add the damping the node lacks" and the "Series versus parallel for two different spaces" tips would become native features rather than workarounds and should either be removed or reframed as "still useful for X beyond what the built-in controls give you."
- **migration**: Purely additive with backward-compatible defaults (`damping: 0` behaves exactly like today's undamped comb; `size: 0.075` behaves exactly like today's fixed tap) — no existing `examples\*.skald.json` Reverb node needs any change, and none would change sound on load.

### F-A07-8 (design, confirmed correct — not a bug): Bus-domain/shared-buffer architecture is the right choice for both nodes
- **kind**: design
- **node**: Delay, Reverb
- **severity**: low
- **confidence**: high
- **evidence**: `codegen.odin:60-95` (`is_voice_coupled_type`, `compute_bus_domain`) — Delay and Reverb are explicitly forced into a single shared bus-domain instance per node, never per-voice, with the reasoning spelled out in the comment (dividing delay time by voice count, feedback bleed between voices, tail cut on last-voice-death) and enforced by a hard export error for any voice-coupled node placed downstream (`codegen.odin:96-107`, `:1935-1943` per the manual).
- **detail**: Per the added brief's framing — "a per-voice reverb is usually a bug, a per-voice delay may be intended" — Skald already does the architecturally correct thing for both: one buffer per node instance, shared across all voices of the instrument, outliving individual notes. This was worth stating explicitly since it's the central question this audit was asked to check; no change recommended here.
- **suggested fix**: None — flagging as verified-correct so a later pass doesn't waste time re-checking it.
- **manual impact**: None — the manual already documents this correctly and at length (delay.md "What it looks like in Skald", reverb.md same section).
- **migration**: N/A.

### F-A07-9: Reverb's Pre-Delay is functional but not in the default `exposedParameters`, despite being exactly the kind of thing a game would want to drive at runtime
- **kind**: qol
- **node**: Reverb
- **severity**: low
- **confidence**: medium
- **evidence**: `skald-ui/src/definitions/node-definitions.ts:123-128` — `defaultReverbParams.exposedParameters = ['decay', 'mix']`; `preDelay` is absent even though (per F-A07-1) it is now a fully working, clamped, tested parameter.
- **detail**: Now that Pre-Delay actually does something, it's a reasonable runtime knob (e.g. tightening pre-delay for close/percussive sources, opening it for distant/ambient ones) but a fresh Reverb node won't let a game touch it without the user remembering to click the expose link manually — easy to miss since the chapter (until this pass) told everyone it was decorative anyway.
- **suggested fix**: Consider adding `preDelay` to the default exposed set now that it has real behavior, or at minimum flag it prominently in the rewritten manual section so users know it's worth exposing.

## Digest

Findings file: `C:\Users\ryanp\AppData\Local\Temp\claude\C--Users-ryanp-Documents-dev-Skald-main\2fc1cf0b-ae38-4a6e-a931-a303fca7f67f\scratchpad\review\tier1\07-delay-reverb.md`

Counts by kind: doc-bug: 2, code-bug: 2, design: 4, qol: 1. Total: 9.

Top 3 by severity:
1. F-A07-1 (high, doc-bug) — Reverb Pre-Delay now fully implemented and tested; manual's "does nothing / blocker" claim is stale and actively misleading.
2. F-A07-4 (high, code-bug) — Exposing "BPM Sync" on a Delay produces a live-looking but completely dead runtime parameter with a boolean value mistreated as an unbounded float (±1e6 range).
3. F-A07-3 (medium, code-bug) — Delay's ring buffer/write-index is never cleared on processor re-init while Reverb's now explicitly is, contradicting the code's own stated reset-semantics goal.
