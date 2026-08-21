# Skald Roadmap — Issue Tracker

> **Last updated:** 2026-08-21
> **Wave A:** ✅ Complete (13/13 packets landed)
> **Wave B:** 6 of 12 sections closed — B1/B3/B4/B11 verified already landed in the
> Wave A remediation pass (the checkboxes were stale, the code was not); B5 and B7
> landed `d9922a0` / `fe05093`. Remaining: **B2, B6, B8, B9, B10, B12.**
> **0.2 ships when:** all Wave B items closed + exit criteria met (see bottom)

---

## How to read this file

- `[ ]` open — `[x]` closed — `[/]` in progress
- **Effort:** S = hours/1 day, M = 2–5 days, L = week+
- **Severity:** critical · high · medium · low
- Bug IDs (SKB-xxx) are preserved from the original `BUGS.md` for traceability
- Each wave must fully complete before the next wave is assigned

---

## Wave B — Blockers (must ship for 0.2)

> Every item ships with a test that failed before the fix.

### B1 — Master Gain, One Design
- [x] **B1** (M) — ✅ **Verified already landed** (Wave A pass, `05b52ea`). `resolved_master_volume`
  + `warn_authored_master_silence` in `json.odin` (its own comments cite "packet B1"), standalone
  `skald_soft_limit`, per-instrument `_set_volume`, the optional `limit` flag, `Distortion.outputGain`
  in `param_ranges.odin`, and the JS `GainNode` deleted (`SequencerDock.tsx` documents why). Goldens
  `project_master_zero` and `distortion_output_gain` pin it. Original text: Unify master volume and limiter across preview, export, and game integration.
  - Runtime `project_set_master_volume` + per-instrument `<Asset>_set_volume`
  - Standalone `skald_soft_limit`; `project_process` composes them
  - Dock slider drives the shim param (delete the JS `GainNode` workaround)
  - Serializer floors `masterVolume`; backend sentinel `<= 0.0` → `< 0.0`
  - Optional per-instrument `limit` flag (default true)
  - Distortion gets `outputGain` (default 1.0, bit-identical)
  - Changelog: a patch saved at `master_volume: 0` will now export silent — that is the fix

### B2 — Exposure Honesty
- [ ] **B2** (M) — Eliminate dead exposed parameters and setters.
  - One `param_is_live(node, param)` predicate in the resolution pass
  - Hard error when a P-lock resolves to an inert parameter
  - Grey out (don't hide) the expose affordance in the editor
  - Scan emitted body for `p.<field>` per resolution; warn+omit anything never read
  - **Closes:** SKB-059
  - *Groundwork already exists* (composer survey 2026-08-21): the predicate is called
    `param_is_reachable` (`codegen_analysis.odin:320`), with `param_dead_reason`,
    `warn_dead_exposed_params` and `effective_exposed_params` alongside it, plus a hard error for a
    `syncRate` P-lock at line ~292. What is genuinely missing: (a) it is a **warning** for exposure but
    a **silent filter** for P-locks — `effective_exposed_params` drops an unreachable P-lock target
    without a word, so a P-lock on `Oscillator.frequency` with `fixedPitch` off just vanishes;
    (b) the emitted-body `p.<field>` scan; (c) the UI still **hides** the affordance rather than
    greying it (`renderControlWrapper(..., false)` and the bpmSync ternary in
    `NodeParameterControls.tsx:173`); (d) **SKB-059 located**: `defaultMidiInputParams` in
    `definitions/node-definitions.ts:192` ships `exposedParameters: ['device', 'useMpe']` and neither
    string appears anywhere in `skald-backend/core/`. `param_is_reachable` has no `MidiInput` case, so
    it returns `true` and the existing warning never fires.
  - See also **B5-4-followup** — the UI-side mirror of this predicate is the other half of the job.

### B3 — Undo Made Trustworthy
- [x] **B3** (M) — ✅ **Verified already landed** (Wave A pass, `8e44c86`). `useEditorHistory.ts`
  exposes `pushHistory(label, {gesture, scope})` over `{nodes, edges, tracks, session}`; Sidebar has
  Undo/Redo with labels; `EditorHistory.test.tsx` + `UndoRedoAffordance.test.tsx` pin it. Original text: Consolidate graph, sequencer, and session into one history stack.
  - One ordered history of `{nodes, edges, tracks, session}` behind `pushHistory(label)`
  - Add 4 untracked call sites (palette drop, Import, Export-Step, transport fields)
  - Snapshot on first `dragging:true` tick; gesture-scoped coalescing
  - `loadTracks` clears instead of pushing; visible Undo/Redo buttons with stack depth

### B4 — Session Trust
- [x] **B4** (M) — ✅ **Verified already landed** (Wave A pass, `8e44c86` + `ed4c873`). `isDirty`/
  `markSaved`, confirm-on-Load/Import, `useWindowTitle`, `useAutosave` recovery, `atomicSave.ts`.
  Pinned by `Autosave`, `LoadConfirm`, `WindowTitle` and `atomicSave` tests. Original text: Implement session safety features.
  - Dirty flag; confirm on Load/Import when dirty
  - Filename + `•` in window title
  - Autosave to `userData/recovery.json` on 30s debounce with restore offer
  - Atomic save (`.tmp` → rename)

### B5 — Sequencer Data Integrity  ✅ CLOSED `d9922a0`
- [x] **B5-1** — SKB-010. Greyed, not hidden; out-of-range notes **kept**, not dropped (four-bar-song
  has 64-step tracks and no `session` block, so it opens with 3 of 4 bars out of range — dropping
  would have deleted shipped music on export).
- [x] **B5-2** — SKB-025. `(step, pitch)` addressing across all four sites. Uniqueness is enforced by
  having a retuned note absorb a sibling it lands on.
- [x] **B5-3** — SKB-026. Full 0–127; the scroll viewport already existed. Pitch axis moved into
  `stepMetrics.ts` for F1/E4 to share.
- [x] **B5-4** — SKB-009. ⚠️ **Partial — see B5-4-followup below.**
- [x] **B5-5** — SKB-045. One `isExportablePlockValue` drives the serializer filter and every warning.
- [x] **B5-6** — SKB-058. One `DEFAULT_SYNC_RATE`; the toggle authors the key.

#### B5 residue — carry into the next pass
- [ ] **B5-4-followup** (S, high) — `utils/plockTargets.ts` mirrors `resolve_plock_targets` but **not**
  `param_is_reachable`. `collect_plock_targets` has a *second* `os.exit(1)`: once a key resolves, a
  P-lock on a dead param is fatal. Repro: P-lock an Oscillator's `frequency` while `fixedPitch` is on
  (the control is offered then), then turn `fixedPitch` off → Generate exits 1 with the banner silent.
  The backend's own message ("toggle BPM Sync / fixedPitch as appropriate") shows this is the expected
  user path, so it is the graph change most likely to turn a valid P-lock fatal — and the one B5-4 did
  not validate.
- [ ] **B5-x1** (S) — Three sites still bypass the normaliser (the SKB-002 pattern): both
  `StepPropertiesEditor`'s override demux and `useEditorState.handleExportStep` match with
  `(n.data.label || n.type) === targetLabel` — case-sensitive, React Flow's type, and
  `key.split(':')` truncates a param containing a colon. So codegen applies `osc:frequency` to the
  node labelled `Osc` while Export-Step bakes nothing.
- [ ] **B5-x2** (S) — An out-of-range note is unreachable in *both* editors (handlers gate on
  `!isDisabled`), so it can be seen but not deleted; the only remedy is raise-delete-lower and the
  notice never says so. `handleExportStep`'s out-of-range guard returns `null` with no feedback.
- [ ] **B5-x3** (S) — `(step, pitch)` uniqueness is load-bearing but only enforced for *new* edits: an
  imported file with two notes at one `(step, pitch)` gets a React duplicate-key warning and one block
  hidden. Needs a load-time normalisation pass (C1 territory).
- [ ] **B5-x4** (S) — Step editor still mints P-locks the serializer then drops: `BpmSyncControl`'s
  select authors `Label:syncRate` and the BPM Sync checkbox authors a boolean `Label:bpmSync` — that
  toggle is a raw `div` that never passes through `renderControlWrapper`, so B5-5's "not automatable
  per step" label never reaches it. Also `ParameterPanel.renderBpmSyncToggle` is ~40 dead lines that
  still write `bpmSync` alone, and `bpmSync` cannot be exposed from the sidebar at all.
- [ ] **B5-x5** (S) — `ProjectIssuesBanner` is non-dismissible, so opening the flagship four-bar-song
  greets the user with a permanent six-line overlay. Defensible (the data *is* unplayable) but it is
  the flagship. Also `OutOfRangeNotice` names `patternSteps` even when the *track* is the shorter one.

### B6 — First Hour
- [ ] **B6-1** (M) — Auto-wrap loose graphs on load/Play with a toast (26 files affected)
  - *Design is already written down*: the CLI **already does this** —
    `build_project_from_graph_raw` (`json.odin:431`) wraps a graph with no Instrument node "whole as one
    SFX named Asset". The editor path does not, because `buildProjectData` emits instruments only from
    Instrument nodes. Mirror the CLI's fallback rather than inventing a second one (SKB-002).
  - The exact 25-file list, the symptom and the ownership note are in
    `skald-ui/src/tests/corpus/corpusGate.ts` → `EDITOR_UNPLAYABLE`. That gate **fails when a
    quarantined file starts passing**, so landing B6-1 turns it red by design and the list must be
    deleted with the packet.
- [ ] **B6-2** (S) — Exclude `archive/` from `extraResource`; delete `PulsarBeam.json` — **SKB-019** (high)
  - `to implement/` no longer exists. `forge.config.ts:41` is
    `extraResource: ['./skald_codegen.exe', '../examples']`. `PulsarBeam.json` is also the sole entry in
    `corpusGate.ts` → `CLI_CODEGEN_FAILS`; delete both together.
  - Review finding: PulsarBeam is **not** a live editor/backend mismatch. No Delay/Reverb parameter has
    a modulation port (`generate_delay_code`/`generate_reverb_code` pass `""` for `delayTime`,
    `feedback`, `mix`, `decay`, `preDelay`), and the current `DelayNode.tsx` declares only
    `input` — so the file is legacy content authored against an older editor. File it as
    "archived example unloadable against the current schema".
- [ ] **B6-3** (S) — Curated `examples/start-here/` folder
- [ ] **B6-4** (S) — Fix the two README 404s; link the manual above the fold
- [ ] **B6-5** (S) — Electron Help menu (Manual / Examples / About with codegen stamp)
- [ ] **B6-6** (S) — Default first-run patch that makes a sound in 30 seconds
- [ ] **B6-7** (S) — Rename "Generate Code" to "Download Code" / "Export .odin Package" — the WASM preview already runs the real generated code; the button just downloads it now

### B7 — Composition Correctness  ✅ CLOSED `fe05093`
- [x] **B7-1** — SKB-013. `cos/sin × 1.4142136`; `L²+R²` constant, unity in both channels at pan 0;
  mono fallback is a pass-through.
- [x] **B7-2** — SKB-016. Bus-tail countdown in `_is_playing`. ⚠️ **See B7-2-followup — shipped defect.**
- [x] **B7-3** — SKB-017. `seed_bus_domain` + `hoist_bus_modulators`, sinks-first single pass; mixed
  case is a hard error. Fixed a live defect in `examples/instruments/keys/glassy-fm-pluck.skald.json`
  (its Auto Pan LFO summed across voices and died mid-tail) — **shipped content now sounds different.**
  ⚠️ **See B7-3-followup.**
- [x] **B7-4** — SKB-018. `_init` is a full reset. Roadmap corrected: Delay ring buffers were *already*
  cleared; the real gaps were `p.voices`, the transport scalars and bus-domain state.
- [x] **B7-5** — SKB-029. Clamped in `_note_on` **and** `_note_off` — clamping only the way in made
  `note` the asymmetric key of a voice lookup, so `note_off(200)` released nothing and pinned the
  voice active forever. Caught in review.
- [x] **B7-6** — SKB-023. Held notes replayed after hot-swap, success path only, plain-number payloads.

#### B7 residue — carry into the next pass
- [ ] **B7-2-followup** (M, **high**) — The tail constant is computed from each exposed parameter's
  **range maximum**, and `bpmSync` independently drags `delayTime` to `(60/20)·beats` because `p.bpm`
  is settable. Measured across the shipped library: `guitar/ambient-clean` bakes **415 s**,
  `geowars/gold-midas-bells` **213 s**, and ten more (incl. `glassy-fm-pluck`, `synth-lead`,
  `boss-battle-loop`, `pulse-lead`, `echo-bell`, `starfield-arp`, `space-funk`, `chase-loop`,
  `disruptor-alarm`, `splitter-echo-stab`) **202.5 s**. Twelve examples report `is_playing == true` for
  over three minutes after their last note. It also hits our own editor: `skaldWasm.worklet.ts:217`
  posts `{type:'ended'}` on that falling edge, so a non-looping preview of `glassy-fm-pluck` will not
  signal ended for 3m22s. **Fix (designed, costed, not applied):** add `bus_tail_armed: bool`, emit a
  shared `skald_feedback_tail_seconds(d, g)` helper next to `skald_soft_limit`, and arm on the falling
  edge from the **live** field values — `feedback`/`delayTime` are already range-clamped processor
  fields when exposed, and no Delay/Reverb param has a modulation port, so `get_f32_param` yields
  `p.<field>` or a literal, both valid at the end of `_process`. That is one `ln` **per note-off**, not
  per sample. `glassy-fm-pluck` would go 202.5 s → its true 1.75 s. Residual hole: a game raising
  `feedback` *during* a silent tail truncates slightly.
- [ ] **B7-3-followup** (S) — Hoisting stops at hoistable types and never checks what feeds them.
  `ADSR → Mapper → post-Delay Filter.cutoff` hoists the Mapper, which then reads `node_env_out_vsum` —
  the sum of per-voice envelopes. SKB-017 survives one node upstream, silently, and is now *harder* to
  spot because the modulator itself looks correctly bus-domain. The SKB-017 comment's "the fix is to
  hoist the source" over-claims: it is complete only when the hoisted node's inputs are domain-clean.
- [ ] **B7-3-followup-2** (S) — A modulator feeding **only** a `GraphOutput` stays voice-domain and
  gets a `_vsum` (voice-summed, silent during the tail). Pre-existing, unchanged by B7.
- [ ] **B7-x1** (S) — `compute_bus_tail_seconds` iterates `all_nodes`, so an orphaned Delay with no
  path to `GraphOutput` still inflates the tail. Reverb's comb length `0.075` is an independent literal
  in both `codegen_nodes.odin` and `codegen_analysis.odin` — a real drift risk.
- [ ] **B7-x2** (S) — The Panner mono fallback is now a *complete* pass-through, so
  `Panner → Gain → GraphOutput` discards pan entirely. Defensible, but nothing notices: `panner_mono`
  asserts only audibility and pitch.

### B8 — Flagship Content
- [ ] **B8-1** (S) — Fix `four-bar-song`: delete 3 `MidiInput.pitch → input_freq` wires; kick pitch-env depth 120 → ~1.5; add `session` block — **SKB-014** (critical)
  - *Confirmed by inspection 2026-08-21.* The 3 wires are in Lead, Pad and Bass. `input_freq` is a
    **V/Oct exponential** port — `base * pow(2, clamp(mod, -10, 10))` — so a raw MIDI note number and
    the Kick's `depth: 120` do not blow up to NaN, they **clamp to 2^10 = a 1024× pitch error**. The
    clamp is silently hiding authored nonsense, which is exactly what B8-3 is for.
  - ⚠️ **The packet is bigger than this line.** `MidiInput.gate` emits `1.0` while held and `0.0` once
    released (`codegen_nodes.odin:548-549`), and the ADSR's `input` port **multiplies** the envelope
    (`generate_adsr_code`, default `input_str := "1.0"`). So every `gate → ADSR.input` wire zeroes the
    release tail. `ADSRNode.tsx` already carries a comment saying precisely this and naming sax3.json —
    the relabel half of B8-2 landed and **the data was never fixed**. `four-bar-song` has that wire
    **8 times** (Lead ×2, Pad, Bass ×2, Kick ×2, HiHat); `sax3.json` once. Deleting them is safe: with
    nothing wired to `input` the ADSR emits the pure envelope × depth, which is what all these patches
    use it for (they feed `input_gain`/`input_cutoff`, not an audio path).
- [ ] **B8-2** (S) — Fix `sax3.json`: delete `MidiInput.pitch → Oscillator.input_freq` **and**
  `MidiInput.gate → ADSR.input`; add a `session` block — **SKB-015** (high)
  - The ADSR Gate→In **relabel is already done** (`ADSRNode.tsx`); only the data fix remains.
- [ ] **B8-3** (S) — Build-time warning when an exponent-port's authored contribution can exceed ±10
  - The exponential ports are exactly `Oscillator.input_freq`, `Wavetable.input_freq` and
    `FmOperator.input_carrier` (`codegen_nodes.odin:33, 262, 306`).

### B9 — Preflight Validation + CLI Hardening
- [ ] **B9-1** (M) — Pre-emission validation pass: nested Instruments rejected with purpose-built message — **SKB-028** (high)
  - `build_graph_from_raw` (`json.odin:168`) already "recursively constructs ... any nested instrument
    subgraphs", so a nested Instrument parses and then emits garbage. `graph_validate.odin` has only
    four procs (`valid_input_ports`, `valid_output_port`, `mixer_input_count`, `validate_connections`) —
    this is where the new pass belongs.
- [ ] **B9-2** (S) — Duplicate node IDs become a hard error instead of silent mis-wire — **SKB-021** (high)
  - Both current sites are warn-and-rename and **already name this packet as the owner**:
    `json.odin:229` and `json.odin:481` ("SKB-021's warned-about compromise; B9 owns the hard error").
    Note the goldens `numeric_ids` and `multi_instrument_dup_names` will move.
- [ ] **B9-3** (S) — `-check` and `-version` CLI flags; port `assertCodegenTargetSafe` into `main.odin`
  - `-version` **already exists** (`main.odin:125`, answered before stdin is touched — preserve that
    ordering, the handshake probe closes stdin). `-check` is missing. `assertCodegenTargetSafe` is TS
    (`skald-ui/src/main/codegenGuards.ts:83`).
- [ ] **B9-4** (S) — `invoke-codegen` gets timeout + stdin error handling — **SKB-039** (medium)
  - `main.ts:163`: `spawn(executablePath, args)` with **no timeout**, and
    `child.stdin.write(graphJson)` with **no error handler on stdin** — if the child exits early the
    EPIPE is an unhandled `error` event on the main process.
- [ ] **B9-5** (S) — Reject `type === 'instrument'` from Create-Instrument selection
  - `useNodeComposition.ts`: `handleCreateInstrument` (:214) / `handleInstrumentNameSubmit` (:73) never
    check the selection's types. This is the authoring-time half of B9-1 — reject it where it is drawn,
    not only where it is emitted. `handleExplodeInstrument` (:279) is the pattern to copy.

### B10 — Peak Meter + Clip LED
- [ ] **B10** (S) — Stereo peak-hold meter with clip LED in transport dock.
  - "Tapped before JS master gain" is **stale wording**: there is no JS master gain any more (SKB-011
    deleted it; the fader lives inside the DSP graph). The tap point is the worklet output — where
    `useWasmAudioEngine.ts:249` already builds `worklet → analyser → destination` with `fftSize = 2048`,
    exposed as `analyserNode` and consumed by `AudioVisualizer.tsx`.
  - Two traps: an `AnalyserNode` **downmixes to mono**, so a *stereo* meter needs a
    `ChannelSplitterNode` into two analysers (or a metering worklet); and `getByteTimeDomainData` is
    8-bit and cannot represent anything above 0 dBFS, so the clip LED must use
    `getFloatTimeDomainData`, whose values genuinely exceed ±1.0. Related: **SKB-053** (the worklet
    allocates 2 fresh `Float32Array` views per render quantum).

### B11 — Parameter Panel Correctness
- [x] **B11** (S) — ✅ **Verified already landed** (Wave A pass, `24a05e4`). `toggleParameterExposure`
  sends `{exposedParameters}` only; `ParameterPanel.test.tsx` pins SKB-022. Original text: `toggleParameterExposure` sends delta, not stale full-object spread; delete inline bypass branches.

### B12 — Generated-API Contract Minimum
- [ ] **B12** (S) — Thread rule in header; per-asset exposed params + setter styles listed; AUTO-GENERATED banner + generator stamp + input hash.
  - The header is emitted by `generate_project_code` (`codegen_project.odin:180`+) and already lists SFX
    / Music Layer assets, the per-asset API shape, the `duration<=0` one-shot contract and the
    `_feed_input` note. Missing: the AUTO-GENERATED banner, the thread rule, per-asset exposed params +
    setter styles, and the stamp/hash.
  - **Architectural catch:** `source_digest()`, `fnv1a64` and `STAMP_FORMAT` live in `main.odin`
    (package `main`), but the header is emitted from package `core` — `core` cannot import `main`. The
    stamp and the input hash must be **passed in** to `generate_project_code`, or set on a `core`
    package variable by `main`. Do not duplicate the hash function.
  - If you add any file under `skald-backend/core/`, add it to `CODEGEN_SOURCES` in `main.odin` or the
    editor's drift guard reports it uncovered (see `9563a57`, where four of five generator files were
    outside the digest).

---

## Wave C — Schema & Behaviour

### C1 — Schema Version + Migration Registry
- [ ] **C1** (M) — `version` stamped by `handleSave`; ordered pure `MIGRATIONS` run in `parseSaveFile`; **must recurse into subgraphs**.
  - **Closes:** SKB-054

### C2 — Node Schema + Generated Bindings
- [ ] **C2** (M–L) — Single `schema/nodes.json` → TS types, Odin ranges, UI control bounds. Delete `codegen.odin` inline fallback defaults.
  - **Closes:** SKB-024, SKB-040, SKB-042, SKB-055

### C3 — Stable Asset Identity
- [ ] **C3** (M) — `exportId` on Instrument; stable per-node collision prefixes; explicit `assetType` field replacing has-notes inference.

### C4 — Multiplicative VCA `input_gain`
- [ ] **C4** (M) — Additive offset → multiplicative scaling (version-gated). Keep ADSR-direct as canonical.

### C5 — Finish the Nodes
- [ ] **C5** (M) — Wavetable/FM unison decision; Wavetable PWM + phase; FM Operator output level; Reverb `damping`.

### C6 — Voice Lifecycle Polish
- [ ] **C6-1** (S) — Release-first two-tier voice stealing — **SKB-030** (medium)
- [ ] **C6-2** (S) — Consistent fresh-voice reset for LFO/Noise/S&H — **SKB-031** (medium)
- [ ] **C6-3** (S) — Short de-click fade for no-ADSR duration expiry — **SKB-030** (medium)
- [ ] **C6-4** (S) — Fix sustain ≤ 0.0001 discarding the Release stage — **SKB-041** (medium)

### C7 — BPM-Sync Value Hygiene
- [ ] **C7** (S) — Save/load normalization; node cards show resolved sync time.

---

## Wave D — Documentation

- [ ] **D1** (L) — Four new chapters: Getting Started, Sequencer, Exporting Odin, Deliberate Exclusions
- [ ] **D2** (M) — Retire "Code-vs-intent" — ~150 defect paragraphs → centralized `KNOWN-ISSUES.md`
- [ ] **D3** (L) — Post-freeze citation re-pinning using proc-name convention; chapter rewrites from `FIXED.md`
- [ ] **D4** (S) — Plan-document reconciliation — mark old tracking docs as superseded

---

## Wave E — Make It Playable

> The features that make Skald feel like a real instrument.

- [ ] **E1** (S) — **QWERTY keyboard auditioning.** Press keys to trigger synth voices live while adjusting parameters. No more sequencing just to hear a sound. *(§9.7)*
- [ ] **E2** (M) — **Piano Roll: note duration dragging.** Remove `pointerEvents: 'none'`; implement drag handles to adjust `NoteEvent.duration` horizontally across step boundaries. *(§9.1 item 1)*
- [ ] **E3** (M) — **Piano Roll: per-note P-lock editing.** Click individual chord members to assign P-locks, micro-timing, and probability independently. *(§9.1 item 2)*
- [ ] **E4** (S) — **Piano Roll: full 0–127 scrollable canvas.** Replace hardcoded MIDI 21–84 with scrollable full-range pitch view. *(§9.1 item 4)*
- [ ] **E5** (S) — **Audio safety: DC blocker + brickwall limiter.** Un-bypassable safety limiter on monitor output bus. Visual NaN/Inf/overflow warnings on canvas. *(§9.9)*
- [ ] **E6** (S) — **Node graph: minimap + snap-to-grid.** React Flow minimap, alignment tools, lasso selection ergonomics. *(§9.6 item 1)*
- [ ] **E7** (S) — **Node graph: semantic cable colors.** Audio = green, modulation = orange, trigger = blue. *(§9.6 item 2)*
- [ ] **E8** (S) — **ADSR envelope curve editing.** Interactive curve tension dragging on envelope handles. *(§9.4 item 2)*
- [ ] **E9** (S) — **Visualizer expansion.** FFT spectrogram / oscilloscope / phase correlation options. *(§9.4 item 3)*
- [ ] **E10** (M) — **Keyboard graph traversal.** Tab through nodes, focus ports, wire connections via hotkeys. *(§9.22)*
- [ ] **E11** (S) — **Randomize button.** "Evolve" affordance on instrument panels for controlled parameter mutation. *(§9.23)*
- [ ] **E12** (S) — **XY Pad macro routing.** 2D XY pad movements map to generated Odin; P-lock gestural recording. *(§9.4 item 1)*
- [ ] **E13** (M–L) — **Mobile responsive pass.** Sidebar → bottom sheet/drawer; larger touch targets on node ports and sequencer cells; responsive toolbar → bottom nav; pinch-to-zoom polish on node graph; parameter slider thumb size increase for touch. Target: usable on 6"+ screens (Pixel 9 Pro, modern iPhones).

---

## Wave F — Drum Roll & Sequencer

> Percussion-native editing and unified sequencer architecture.

- [ ] **F1** (M) — **Unified sequencer core.** Shared infrastructure for Piano Roll + Drum Roll: `useElementWidth`, `stepMetrics.ts`, playhead sync, grid rendering, viewport scrolling. *(§9.3)*
- [ ] **F2** (M) — **Drum Roll: percussive grid.** Kit-piece rows (Kick, Snare, Hat, etc.) replacing chromatic keys for percussion instruments. *(§9.2 item 1)*
- [ ] **F3** (M) — **Drum Roll: multi-instrument kit aggregation.** One editing workspace aggregates all percussion instruments into a consolidated matrix. *(§9.2 item 2)*
- [ ] **F4** (S) — **Polymorphic track view dispatching.** `viewMode: 'melodic' | 'percussive' | 'auto'` on `SequencerTrack`; `SequencerDock` auto-detects or respects the hint. *(§9.3)*
- [ ] **F5** (S) — **Examples Library: search + tags.** Metadata tagging (`[percussion]`, `[bass-synth]`, `[sfx]`, `[ambient]`) with search on the existing Examples modal. *(§9.13)*

---

## Wave G — Export & Integration

> Let Skald's output reach the real world beyond Odin.

- [ ] **G1** (M) — **Offline WAV bouncing.** Faster-than-realtime offline synthesis rendering from the WASM DSP loop. *(§9.12 item 1)*
- [ ] **G2** (M) — **Stem export.** Per-instrument 24-bit PCM `.wav` stem tracks + master bounce. Drag-and-drop into Unity, Unreal, Godot, or any DAW. *(§9.12 item 2)*
- [ ] **G3** (S–M) — **Runtime scale quantization.** Emit scale definitions and quantize helpers into generated Odin. Games can transpose keys at runtime for adaptive audio. *(§9.5)*
- [ ] **G4** (M) — **Wavetable import.** Import single-cycle `.wav` files (from Serum, Vital, etc.) compiled into static Odin float arrays. Zero external dependencies. *(§9.20)*
- [ ] **G5** (S) — **Voice concurrency limits.** Max simultaneous voices, oldest-vs-quietest stealing rules, and auto pitch/velocity randomization per trigger in generated Odin. *(§9.18)*

---

## Pre-existing breakage found while running Wave B (none introduced by B5/B7)

Three gates were already red at `9563a57` and nothing recorded it. Verified against a pristine
`git archive HEAD` tree in each case.

| What | Detail |
|---|---|
| **`odin test tests\unit` did not compile** | 16 errors: `tests/unit/unison_wavetable_fm_test.odin` called `generate_wavetable_code`/`generate_fm_operator_code` without the `plan` parameter and `generate_processor_code` without `plan`, added by an earlier refactor. CI's parameter-contract step must have been red for some time. **Repaired in `fe05093`** (mechanically — `nil` for the node generators, `build_instrument_plan` for the processor), because B7's new tests could not otherwise run. Worth a look: passing `nil` for `plan` may quietly disable the parameter-resolution path those tests exist to cover. |
| **`run_corpus_golden.bat check` is red for a silly reason** | Line 87 is `echo NON-DETERMINISTIC %NAME% (shim)`. The **unescaped `)` closes the enclosing `if errorlevel 1 (` at parse time**, so `set /a FAILED+=1`, `set /a NONDET+=1` and `goto :eof` run *unconditionally* for every fixture that clears codegen. That is the whole symptom set: 98 spurious `NONDET`, zero per-file status lines of any kind, and the golden comparison never reached. The non-determinism is fictional — all 98/98 `.odin` and 98/98 `.shim.odin` pairs are byte-identical. `run_golden.bat:176,183` escapes the same parens as `^(`/`^)`, which is why the real gate is sound. **One-line fix, not yet applied.** Also: zero goldens are tracked in `tests/golden/examples_corpus/`. |
| **`tsc --noEmit` and `npm run lint` are red** | `TS2307: Cannot find module '../../forge.env'` in `src/tests/components/ExamplesModal.test.tsx`, plus two `import/no-unresolved` for the same specifier. `skald-ui/forge.env.d.ts` is tracked and present, so it is a resolution/config problem, not a missing file. **Not fixed** — it is the standing baseline (1 typecheck error, 2 lint errors) every Wave B agent was measured against. Note `npx eslint --ext .ts,.tsx .` behaves differently from `npm run lint`; use the npm script. |

Exit criterion 1 ("four CI gates green") cannot be met until the first two are closed.

## Verified baselines (at `d9922a0`)

Backend gates need the `.\` prefix under `cmd /c`; a bare `cmd /c "run_acceptance.bat"` fails.

| Gate | Command (run from) | Green |
|---|---|---|
| Acceptance (FFT) | `skald-backend` → `.\run_acceptance.bat` | 38/38 |
| Goldens + determinism | `skald-backend` → `.\run_golden.bat` | 54/54 match, 54/54 identical on re-run |
| Backend unit | `skald-backend` → `odin test tests\unit` | 66/66 |
| UI | `skald-ui` → `npx vitest run` | 55 files / 694 tests |
| Typecheck / lint | `skald-ui` → `npx tsc --noEmit` / `npm run lint` | 1 / 2 pre-existing errors (see above) |

At `9563a57` these were 33/33, 48/48, **did not compile**, 44 files / 573 tests, 1 / 2. Note the UI
figure: 44/573 is the tracked-tree number, confirmed by running vitest in a `git archive HEAD` tree.

## Standalone Bugs (no wave assignment yet)

| ID | Issue | Severity |
|---|---|---|
| **SKB-020** | Checked-in `generated_audio.odin` copies are stale (3 of 4 regenerated; 1 left for D3 citation reasons) | high |
| **SKB-048** | `NumberInput` unguarded `.toString()` on focus can throw if value is null | low |
| **SKB-053** | Audio worklet allocates 2 fresh Float32Array views every render quantum | low |
| **SKB-056** | CustomSlider/XYPad log-scale math breaks for `min ≤ 0` (dormant — no current caller) | low |

---

## Exit Criteria (0.2 ships when ALL are true)

1. Four CI gates green: acceptance, goldens, examples corpus, range parity — plus binary-freshness and determinism-double-run
2. Every Wave B packet closed, each with a test that failed before the fix
3. Two consecutive full corpus regenerations byte-identical
4. Every packet's invalidated chapter sections appended to `FIXED.md`; citation checker = 0 mismatches
5. No chapter passage warns a user off a feature that works in the shipped app
6. A game team can integrate a generated package from the manual alone
7. Every §7 exclusion recorded in release notes with its reason
8. `git status --porcelain` is clean after a full build
9. Packaged install previews audio on a machine with no pre-existing Odin (A13 smoke job)

---

## Closed History (Wave A)

All 13 Wave A packets landed. 23 bugs closed in the remediation pass (commits `c4c30e0`..`05b52ea`).
See `docs/0.2-ROADMAP.md` for the full Wave A completion log.

| Closed Bug | Fix | Commit |
|---|---|---|
| SKB-000 | Audited tree committed and CI-gated | `5deff6b` |
| SKB-001 | Binary untracked; content-digest identity | `c6a1fbb` |
| SKB-002 | One reader via pure normaliser | `05b52ea` |
| SKB-003 | Deterministic instrument order + double-run gate | `1a46357` |
| SKB-004 | `Maybe(T)` presence signal; authored 0 = silence | `05b52ea` |
| SKB-005 | Load destroys session — fixed | `8e44c86` |
| SKB-006 | Dead exposed params eliminated by `param_is_live` | `24a05e4` |
| SKB-007 | Exposure toggle sends delta | `24a05e4` |
| SKB-008 | Unified undo history | `8e44c86` |
| SKB-022 | Expose toggle delta + bypass branch deletion | `24a05e4` |
| SKB-027 | Worklet checks `set_param` return; buffer 64→128 | `f769168` |
| SKB-032 | Group paste remaps `parentId` | `20d6d02` |
| SKB-033 | Create Group honours enabled state | `20d6d02` |
| SKB-034 | Atomic save (temp → rename) | `ed4c873` |
| SKB-035 | Saved viewport restored on load | `ed4c873` |
| SKB-036 | `packageName` round-trips through SessionSettings | `ed4c873` |
| SKB-037 | Non-Latin names no longer collapse | `84ecfc6` |
| SKB-038 | Rebuild generation ID prevents stale swap | `f769168` |
| SKB-043 | Finding corrected; flip landed | `08d5875` |
| SKB-044 | Reverb `preDelay` on node card | `08d5875` |
| SKB-046 | Oscilloscope buffer from `fftSize` | `f769168` |
| SKB-047 | Odin probe async + negative cache 30s | `53b807c` |
| SKB-049 | Glide 0–5 unified | `08d5875` |
| SKB-050 | BPM bounds unified at 999 | A8 gate |
| SKB-051 | Noise amplitude override | `08d5875` |
| SKB-052 | Dead `unison_count > 0` guard removed | `84ecfc6` |
| SKB-057 | Vendored toolchain resolved ahead of PATH | `53b807c` |
