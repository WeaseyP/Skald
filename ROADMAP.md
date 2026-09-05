# Skald Roadmap — Issue Tracker

> **Last updated:** 2026-09-06
> **Wave A:** ✅ Complete (13/13 packets landed)
> **Wave B:** ✅ **12 of 12 sections closed** (2026-09-05) — B1/B3/B4/B11 verified already landed in
> the Wave A remediation pass; B5 and B7 landed `d9922a0` / `fe05093`, B7-2's shipped tail defect was
> fixed in `a71c96f`, B8 landed `120081a`; B9 (five commits), B12, B2, B10 and the whole B6 residue
> (eleven commits) landed on the `web-app` branch on 2026-09-05.
> **Residue (2026-09-05):** B5-x1..x5 and B7-x1..x3 plus B7-3-followup are closed (ten commits). Two
> items remain open and both are *decisions*, not defects: **B7-3-followup-2** (should a modulator that
> feeds only `GraphOutput` be bus-domain — i.e. keep running through the tail and drone with no voices —
> or stay per-voice as today?) and **B2-x1** (which parameters a freshly placed Oscillator exposes by
> default). Exit criterion 1 is met: the `forge.env` typecheck/lint baseline is fixed and every gate is
> green at baseline.
> **Wave D:** ✅ **4 of 4 closed** (2026-09-06, five commits on `web-app`: D4 `1811f07`, D3 tooling `82b0267`, D2 `ddcda7b`, D1 `765f2a7`, D3 `3f92958`). The manual has 27 chapters, `KNOWN-ISSUES.md` holds 56 open defects with IDs, and the citation gate (`npm run check` in `scripts/manual`, run by CI) is green: 1,838 `path::identifier` citations, 0 mismatches. Exit criteria 4, 6 and 7 are met; see the Wave D section.
> **0.2 ships when:** all Wave B items closed + exit criteria met (see bottom)

---

## How to read this file

- `[ ]` open — `[x]` closed — `[/]` in progress
- **Effort:** S = hours/1 day, M = 2–5 days, L = week+
- **Severity:** critical · high · medium · low
- Bug IDs (SKB-xxx) are preserved from the original `BUGS.md` for traceability
- Each wave must fully complete before the next wave is assigned
- `BUGS.md` itself was folded into this file at `35a1654` ("Replace BUGS.md with consolidated
  ROADMAP.md") and no longer exists at the repo root; see Closed History (Wave A) below for its
  preserved SKB IDs

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
- [x] **B2** (M) — ✅ **CLOSED**. Against the four bullets below: (1) the predicate is
  `param_is_reachable`, one reader on each side (`codegen_analysis.odin` / `plockTargets.ts`), and it
  gained the `MidiInput` case — every MidiInput parameter is dead, closing **SKB-059**; the editor's
  default MIDI Input no longer ships `exposedParameters: ['device', 'useMpe']`. (2) The P-lock hard error
  **was already in place** (`collect_plock_targets` exits on an unreachable target; the "silent filter"
  note below was stale — `effective_exposed_params` only ever fed the exposure list). (3) Greyed, not
  hidden: `renderControlWrapper` takes an `inertReason`; the sidebar renders an Oscillator/Wavetable
  `frequency`, an LFO/SampleHold `frequency`/`rate`, a Delay `delayTime` and every `syncRate` in both
  configurations, dimmed and inert with the generator's own dead-reason as the tooltip and the expose
  button disabled. Pinned by `ExposureGreyOut.test.tsx` (4 of 5 failed before: the control was not
  rendered at all). (4) `exposed_field_is_read` scans the emitted processor for a *read* of `p.<field>`
  (writes and `_get_param`'s read-back do not count); `generate_project_code` warns, prunes the plan and
  regenerates, so neither the setters nor the B12 header can advertise an unread field. Caught by
  construction: a hand-edited file exposing Filter `type` (a string the generator bakes at codegen time)
  loses its `_set_type` while `cutoff` keeps its. Pinned by `exposure_scan_test.odin` and the
  `codegen_only/exposed_string_param` golden.
  - Original text: Eliminate dead exposed parameters and setters.
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
  - **Found by the scan, moved into the table:** Oscillator `pulseWidth` is read only inside the
    generator's exact-match `"Square"` branch. Eight shipped goldens (4 fixtures + 4 corpus files, all
    Sine/Saw oscillators exposing pulseWidth from the editor's default list) lost a `_set_pulseWidth`,
    its `_PARAMS` row and its `set_param` case; two more lost MidiInput `_set_device`/`_set_useMpe`. Every
    deleted line was read before `update`; nothing live moved. Both predicates carry the case now, so those
    files warn via `warn_dead_exposed_params` rather than the scan. The pre-existing unit test that
    asserted "pulseWidth is reachable regardless of fixedPitch" was asserting against a Sine oscillator
    and was corrected to a Square one — the generator never agreed with it.

#### B2 residue
- [ ] **B2-x1** (S) — `defaultOscillatorParams` (`node-definitions.ts:93`) exposes
  `['frequency', 'amplitude', 'pulseWidth', 'phase']`, and a freshly placed oscillator is Sine with
  `fixedPitch` off — so two of its four default exposures are dead on arrival and every Generate warns
  twice per new oscillator. Decide whether the default list should be `['amplitude', 'phase']` (expose on
  demand) or whether the defaults should flip with `waveform`/`fixedPitch`. Not changed in B2 because the
  editor's default exposures are a UX decision, not an honesty defect.

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
- [x] **B5-4-followup** — ✅ **CLOSED** `0764af0`. `paramIsReachable` / `paramDeadReason` now live in
  `plockTargets.ts` beside the resolution mirror, so both of `collect_plock_targets`' `os.exit(1)` paths
  are caught on graph change. The message distinguishes the two kinds because the fixes differ: a stale
  reference can only be deleted, while a dead parameter can also be fixed by toggling
  `bpmSync`/`fixedPitch` — except `syncRate`, which no configuration ever makes live. `blocksBuild` uses
  the same `activeTrackIds` gate, so an override on a muted track is reported without claiming it fails
  the build.
  - *Found while mirroring:* `fixedPitch` and `bpmSync` both default to **false**, so a freshly placed
    Oscillator/LFO/SampleHold/Delay starts with its pitch or time-base parameter **already dead**. Two
    existing test fixtures had assumed `Osc:frequency` was live by default and were asserting against a
    state the generator does not agree with.
- [x] **B5-x1** (S) — ✅ **CLOSED**. Both sites now read `resolvePlockTargets` (the generator's mirror):
  `handleExportStep` resolves against the instrument's subgraph, or against the *source* node for a loose
  node (the export's own label is already suffixed), and applies by node id; the step editor demuxes the
  same way and, when a key already addresses (node, param) in any spelling, edits *that* key instead of
  minting a canonical twin. Pinned by `ExportStepOverrides.test.tsx` (3 cases, all failed before: a
  lowercase `osc:amplitude` baked nothing) and two `StepPropertiesIssues` cases. Original text: Three
  sites still bypass the normaliser (the SKB-002 pattern).
- [x] **B5-x2** (S) — ✅ **CLOSED** (deletion half). Step grid: right-click on a greyed cell clears the
  stranded step and right-click on a stranded note block deletes that note; left-click still creates
  nothing there, and erase-drag does not arm on a greyed cell so a sweep across the boundary cannot take
  stranded notes with it. Piano roll: a click on a stranded note removes it (no paint mode; one click, one
  note); a click on an empty greyed cell adds nothing. The notice now says "right-click a greyed note to
  delete it". Pinned by `StepGrid.test.tsx` (3) and `PianoRoll.test.tsx` (1), all failed before.
  **Still open:** `handleExportStep`'s out-of-range guard returns `null` with no feedback — the Export
  Step button is only offered from the step editor, which only opens on playable steps, so the path is
  currently unreachable from the UI; left as-is and noted. Original text: An out-of-range note is
  unreachable in *both* editors.
- [x] **B5-x3** (S) — ✅ **CLOSED**. `dedupeTrackNotes` (`utils/trackNotes.ts`) keeps the first note at
  each `(step, pitch)` and drops the rest; `useSequencerState.loadTracks` applies it, so every track the
  editor holds (Load, Import, autosave restore, history) enters through the one normaliser, and Load
  reports the dropped count in the file-status toast. Pinned by `trackNotes.test.ts` and a
  `SequencerState.test.tsx` case that failed before. Ahead of C1 rather than in it: this needs no schema
  version, only an invariant made true at the door. Original text: `(step, pitch)` uniqueness is
  load-bearing but only enforced for *new* edits.
- [x] **B5-x4** (S) — ✅ **CLOSED**. The step editor's `onChange` refuses any value
  `isExportablePlockValue` rejects (a `syncRate` string, the `bpmSync` boolean), so such keys are never
  minted into the save file; a control that cannot be automated is rendered inert (dimmed,
  `pointer-events: none`, `data-testid="plock-inert-<key>"`) beside B5-5's label. The BPM Sync toggle now
  goes through `renderControlWrapper` (never exposable), so that label reaches it. The ~40 dead lines of
  `ParameterPanel.renderBpmSyncToggle` are deleted. On "`bpmSync` cannot be exposed from the sidebar":
  correct, and by design — it is read at codegen time by `bpm_sync_seconds_expr`, never through a struct
  field, so exposing it would mint the exact dead setter B2 exists to prevent. Pinned by two
  `StepPropertiesIssues` cases that failed before. Original text: Step editor still mints P-locks the
  serializer then drops.
- [x] **B5-x5** (S) — ✅ **CLOSED**. The banner half is **moot since B8-1**: four-bar-song now carries a
  `session` block with `patternSteps: 64`, so the flagship opens with no out-of-range data and no banner
  — the banner stays non-dismissible by design (it reports data the user must fix; see its header). The
  notice half is fixed: `OutOfRangeNotice` takes an optional `trackSteps` (the piano roll passes the
  track's own length) and names the *shorter* length as the limit with the matching fix — "this track's
  own length (4 steps) is the limit, not the pattern (16). Raise the track length" — instead of always
  quoting the pattern. The multi-track step grid, which cannot name one track, keeps the min() phrasing.
  Pinned by a `PianoRoll.test.tsx` case that failed before. Original text: `ProjectIssuesBanner` is
  non-dismissible … `OutOfRangeNotice` names `patternSteps` even when the *track* is the shorter one.

### B6 — First Hour
- [x] **B6-1** (M) — ✅ **CLOSED**. `buildProjectData` now mirrors the CLI’s
  `build_project_from_graph_raw` (`json.odin:531`): a graph with no Instrument node is wrapped whole as
  one SFX named `Asset`, so all **24** loose-graph examples load, play and generate from the editor.
  All three call sites inherit it (`useWasmAudioEngine.ts:189,479`, `useCodeGeneration.ts:65`) because
  the wrap lives inside the serializer, not at the callers. The quarantine mechanism went with the
  packet — `EDITOR_UNPLAYABLE`, `CLI_CODEGEN_FAILS`, `QuarantineEntry` and `isQuarantined` are all
  deleted, and the 24 files now run the full assertion set (codegen + `odin check` + session honoured)
  that the quarantine branch used to `return` before reaching.
  - **Verified byte-identical to the CLI by construction, twice.** The review drove all 97 graph-shaped
    examples through the real editor pipeline in both the working tree and a `git worktree` of the
    baseline, and diffed: the 73 instrument-carrying files emit identical Odin before and after, so the
    shared `serializeTracks` extraction changed nothing on the path every ordinary project uses. All 24
    loose graphs match the CLI except the known `p.master_volume` line (see B6-1-x2).
  - The notice is a load-time success toast (`useFileIO.ts`), not a banner line. `ProjectIssuesBanner`
    is non-dismissible by design because it reports data the user must fix; auto-wrap is a condition
    the app already handled, and a permanent notice about a handled condition reads as an unfixed
    problem. This is also why B5-x5 did not get worse.
  - Three defects the wrap exposed elsewhere, all fixed in-packet: `useCodeGeneration.ts` painted a
    permanent red "Export warnings" overlay over a successful build; `subgraphNodesFor` /
    `activeTrackIds` (`projectWarnings.ts`) reported every loose-graph P-lock as unresolvable, so the
    banner announced "Code generation will fail" for a project that generates; and live exposed-param
    edits were silently dropped while playing a wrapped graph (`sendChangedExposedParams` saw no
    instruments **and** `topologySignature` masked the param, so neither path fired).
  - Original text: Auto-wrap loose graphs on load/Play with a toast. The header said "26 files
    affected"; the real figure is 25 — 24 loose graphs plus the project-shaped demo, which is
    unplayable for a different reason (the editor refuses it at PARSE) and is not fixed by this packet.

- [x] **B6-2** (S) — ✅ **CLOSED**. `PulsarBeam.json` deleted; both quarantine entries naming it
  retired (`CLI_CODEGEN_FAILS` is now empty, `EDITOR_UNPLAYABLE` is 24); `archive/` excluded from the
  packaged build by a Forge `postPackage` hook (`forge.config.ts` →
  `skald-ui/src/main/forgePostPackage.ts`), because `extraResource` copies a path verbatim and has no
  ignore support. **The packet also recorded the 98 examples-corpus goldens** — `TESTING.md` had said
  they could not be recorded until PulsarBeam was gone, and that is what closes exit criterion 1's
  corpus gate. Corpus UI gate 201 → 199 (exactly PulsarBeam's editor + CLI cases).
  - Review confirmed the hook against the real `@electron-forge` 7.8 typings: the `postPackage`
    signature matches `shared-types/dist/index.d.ts:40-46`, the hook runs inside `package` before the
    makers build distributables (`core/dist/api/make.js:147-152`), and `resources/examples` is the
    correct win32 path (`@electron/packager/dist/platform.js:38,222`).
  - The 98 goldens were checked for portability: no absolute paths, usernames, timestamps or
    environment-varying stamps, and `fc` in text mode is CRLF-insensitive, so checkout eol cannot
    break the gate.
  - Original text: Exclude `archive/` from `extraResource`; delete `PulsarBeam.json` — **SKB-019**.
    PulsarBeam was **not** a live editor/backend mismatch: no Delay/Reverb parameter has a modulation
    port, so the file was legacy content authored against an older editor — an archived example
    unloadable against the current schema.

- [x] **B6-2-x1** (S) — ✅ **MOOT**, closed unimplemented. It asked for the hardcoded `input_delayTime`
  assertion to be generalised before a second `CLI_CODEGEN_FAILS` entry could be added. B6-1 deleted
  the quarantine mechanism outright, so there is no list to add an entry to and no branch to
  generalise. Recorded rather than silently dropped because `corpusGate.ts` declared it moot in a code
  comment first, and a source comment must not retire a tracked item on its own.

- [x] **B6-2-x2** (S) — ✅ **CLOSED**. `removeArchiveFromPackagedExamples` now throws when
  `<outputPath>/resources/examples` does not exist (naming the path, so a renamed `extraResource` or a
  shifted packager layout fails the package step instead of shipping `archive/`), and tolerates only
  `archive/` itself being absent. The doc comment states the win32-only layout assumption and what would
  happen if a darwin maker were added. `forgePostPackage.test.ts`: the old "no examples at all → no throw"
  case was asserting the defect and now asserts the throw; both outputs are checked, not just the first.
  Original text: `forgePostPackage.ts:45` guards on `fs.existsSync(archiveDir)` and cannot tell "already
  gone" from "wrong path".

- [x] **B6-2-x3** (S) — ✅ **CLOSED**. Both harnesses now record and compare a shim golden
  (`<name>.shim.odin.golden`) beside the game-facing one: `run_golden.bat` (57) and
  `run_corpus_golden.bat` (98), 155 shim goldens in all, `MISSING SHIM GOLDEN` / `DIFF … (shim)` as
  distinct lines. The existing `.odin.golden` files did not move when they were recorded. The B12
  `generator:` line inside the shim is pinned to `golden` by the same `SKALD_CODEGEN_STAMP` override.
  Original text: `run_corpus_golden.bat:80` compares the WASM shim only against its own re-run; **no
  shim golden is ever recorded**.

- [x] **B6-2-x4** (S) — ✅ **CLOSED as already documented**: the `.gitignore` in question carries a
  nine-line comment explaining exactly this (unrooted `.gen/` matches `examples_corpus/.gen/`, verified
  with `git check-ignore -v`, no top-level entry needed). Nothing to change. Original text:
  `skald-backend/tests/golden/.gitignore:10` covers
  `examples_corpus/.gen/` via an unrooted `.gen/` pattern, not via any top-level rule. Confirmed with
  `git check-ignore -v`. Recorded so nobody adds a redundant `/skald-backend/tests/golden/
  examples_corpus/.gen/` entry believing the scratch dir is unignored.

- [x] **B6-1-x1** (S) — ✅ **CLOSED**. `orderedInstrumentNodes` (`projectSerializer.ts`) sorts by
  `sanitizeIdentifier(id)` in byte order — a UTF-8-byte mirror of `sanitize_identifier(s, true)`, so a
  three-byte character is three underscores as it is in Odin — and every consumer now reads that order:
  `buildProjectData`'s emission, `wrappedInstrumentNodes` (live set-param asset indices) and the engine's
  `computeStepAsset` (the playhead's asset). Before, the four multi-instrument songs left the editor in
  canvas order while the CLI sorted, and the engine's `stepAsset` pointed the playhead at a canvas
  position the shim had a different instrument at. Pinned by `ProjectSerializer.test.ts` (order and the
  byte-walk) and a `WasmEngineContract` case (`stepAsset` 0, not 1, for a sequenced instrument that is
  second on the canvas but first by id) — both failed before. Original text: **Instrument ordering
  disagrees between the two paths.**

- [x] **B6-1-x2** (S) — ✅ **CLOSED. Decision (Ryan, 2026-09-05): the backend's absent-value defaults
  are authoritative; the editor's live master fader is the one documented exception.** The serializer
  no longer invents `voice_count` 8 / `glide` 0.05 / `detune` 5.0 — an absent key stays absent
  (`JSON.stringify` drops `undefined`), so the generator resolves it exactly as it does for `-in:file`.
  The master-volume exception is written down at `projectSerializer.ts`'s `master_volume` and stripped by
  the B6-1-x4 gate. Correction to the note above: by now every instrument-carrying example authors
  `voiceCount` (0 of 152 files lack it); `four-bar-song` lacks only `glide`/`detune`, so its editor
  preview loses a 50 ms portamento it never had on the CLI. Pinned by `ProjectSerializer.test.ts`
  (absent stays absent; authored passes through), which failed before. Original text: **Absent-value
  defaults disagree.**

- [x] **B6-1-x3** (S) — ✅ **CLOSED**. `isInstrumentNodeType` in `projectSerializer.ts` accepts exactly
  `'instrument'` and `'Instrument'`. **Correction:** `normalize_node_type` does **not** use
  `strings.equal_fold` — it is an exact-match `switch` with those two spellings (`json.odin:13`), so the
  old serializer comment's claim was wrong and a `toLowerCase()` mirror would have accepted
  `"INSTRUMENT"`, which the CLI rejects. `ProjectSerializer.test.ts` pins both directions: `"Instrument"`
  serializes as a real instrument (before: auto-wrapped into an `Asset` with an `Unknown` node) and
  `"INSTRUMENT"` still wraps. Original text: `getInstrumentNodes` matches only lowercase `'instrument'`
  … the wrap decision now rides on this predicate.

- [x] **B6-1-x4** (S) — ✅ **CLOSED**. `ExamplesCorpus.test.ts` gained "cross-path equality": for every
  graph-shaped example (97, not just the 24 loose graphs) the editor path's emission and the CLI path's
  emission are compared line by line after stripping exactly three documented lines — the two B12
  provenance lines (the paths hand the generator different bytes) and `p.master_volume = ` (the B6-1-x2
  exception). Nothing else is normalised. Run against the pre-fix serializer it failed on exactly the
  four multi-instrument songs at line 9 (the asset list, permuted — B6-1-x1); after B6-1-x1 and B6-1-x2
  all 97 match. Original text: **Cross-path emission equality in the corpus gate.**

- [x] **B6-1-x5** (S) — ✅ **CLOSED**. `subgraphNodesFor` returns `null` for a track whose target node
  exists but is not an Instrument — the same answer as "no such node", because `buildProjectData` drops
  both and codegen never sees either. `ProjectIssues.test.ts` pins it (a P-lock on such a track reported
  `unresolvable` / `blocksBuild: true` before; a sibling track on the real instrument still reports).
  Original text: The false-positive class F2 fixed is still live for **non-loose** graphs:
  `projectWarnings.ts:135-142`, a track whose `targetNodeId` names a non-Instrument node in a graph that
  does have an instrument. `subgraphNodesFor` finds the node, reads its absent `.data.subgraph.nodes`,
  returns `[]`, and every P-lock on it reports `blocksBuild: true` — for a track `buildProjectData`
  drops entirely, so codegen never sees it. The doc comment at `:110-114` claims the predicate resolves
  "against exactly the shape the backend will actually see"; that is true only in the loose branch.

- [x] **B6-3** (S) — ✅ **CLOSED**. `examples/start-here/README.md` lists six examples in order with what
  each teaches, and the Examples modal shows the same six first as a **Start Here** category
  (`skald-ui/src/main/startHere.ts`, prepended by the `list-examples` handler). They are pointers into the
  existing tree, not copies — a copy would be a second file for the corpus gate to golden and for content
  fixes like B8's to miss. `startHere.test.ts` checks every path exists and is graph-shaped, so a rename
  is a red gate rather than a dead link. Original text: Curated `examples/start-here/` folder.
- [x] **B6-4** (S) — ✅ **CLOSED**. ~~Fix the two README 404s~~ done `57df823`: `BUGS.md` had been
  replaced by `ROADMAP.md` nine commits earlier and the link was never updated; every README link target
  now resolves. The manual is now linked in the README's second paragraph, above the fold, pointing at
  `docs/manual-source/` (the compiled HTML is gitignored build output, so the source tree is the link
  that always resolves).
- [x] **B6-5** (S) — ✅ **CLOSED**. `Menu.setApplicationMenu` with the default File/Edit/View/Window roles
  plus a Help menu built by `src/main/helpMenu.ts`: **User Manual** (F1; the compiled `docs/manual/
  skald-manual.html` when this checkout has built it, else the manual source on GitHub), **Open Examples
  Folder** (the same directory every dialog resolves) and **About Skald** (app/Electron/Chromium/Node
  versions and the code generator's provenance digest from the A2 handshake — the same digest every B12
  header carries). `helpMenu.test.ts` pins the labels, the wiring, F1, the manual fallback and the About
  text. Original text: Electron Help menu (Manual / Examples / About with codegen stamp).
- [x] **B6-6** (S) — ✅ **CLOSED**. `useFirstRunPatch` loads the first Start Here example (the sequenced
  bass, one instrument + one track) on a genuinely fresh start — no autosave to recover, empty canvas, no
  `skald:first-run-patch:v1` marker — through the same loader the Examples modal uses
  (`utils/exampleContent.ts`, extracted so there is one reader). The marker is written only after a
  successful load, so a failed read retries next launch instead of latching. `FirstRunPatch.test.tsx`
  pins all four branches. Original text: Default first-run patch that makes a sound in 30 seconds.
- [x] **B6-7** (S) — ✅ **CLOSED**. The Sidebar's primary button reads **Download Code** with a tooltip
  saying the preview already runs this exact code and the button only writes the `.odin`; the
  no-toolchain message and the two main-process comments that named "Generate Code" as a feature follow.
  `DownloadCodeButton.test.tsx` failed before (no button named Download Code). Note: `origin/main`'s
  commit `2b54c84` "Add B6-7" touched only ROADMAP.md — the rename had not been made. Original text:
  Rename "Generate Code" to "Download Code" / "Export .odin Package" — the WASM preview already runs
  the real generated code; the button just downloads it now.

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
- [x] **B7-2-followup** — ✅ **CLOSED** `a71c96f`. The countdown now arms from the **live** parameter
  values on the falling edge (so the `ln` stays off the per-sample path, which was the constant's only
  justification). Measured: `glassy-fm-pluck` 202.50s → **1.75s**, `guitar/ambient-clean` 415.06s →
  **9.53s**, `geowars/gold-midas-bells` 212.56s → **4.20s**. `<Asset>_BUS_TAIL_SECONDS` survives as a
  documented upper bound that nothing reads. Pinned by fixture `delay_tail_live`.
- [x] **B7-x3** (S) — ✅ **CLOSED**. Both emission sites gate the helper on a tail actually existing:
  `generate_project_code` on any asset's `compute_bus_tail_seconds > 0`, `generate_processor_code`'s
  standalone header on its own `has_bus_tail`. Goldens regenerated; every deleted line is one of the
  helper's 12 lines (plus its blank), audited before `update`. Pinned by
  `tail_and_domain_residue_test.odin`. Original text: `emit_feedback_tail_proc` is emitted unconditionally next to
  `emit_soft_limit_proc`, so **every** generated file carries the 12-line
  `skald_feedback_tail_seconds` helper — including patches with no Delay or Reverb, which B7-2-followup
  was supposed to leave byte-identical. Harmless (it compiles, and `odin check` passes over the whole
  corpus) but it is dead code in the majority of exports. Gate it on "any instrument in the project has
  a tail" and regenerate.
- [x] **B7-3-followup** (S) — ✅ **CLOSED**. `find_voice_source_into_bus_modulator` runs after the hoist:
  a bus-domain LFO/SampleHold/Noise/Mapper fed by a per-voice source (ADSR, MidiInput, or an audio
  source) is a hard error naming both ends, with the same remedy as SKB-017's mixed case — give the
  bus-domain modulator a bus-domain source, or duplicate the chain. Voice audio summed *into* a bus
  effect is untouched (that sum is the point of the bus; only bus-domain modulators are judged). A
  `-check` sweep over all 155 fixtures and examples trips nothing. Pinned by three cases in
  `tail_and_domain_residue_test.odin` (ADSR→Mapper→bus Filter is a conflict; LFO→Mapper→bus Filter is
  not; Oscillator→Delay is not). Original text: Hoisting stops at hoistable types and never checks what feeds them.
  `ADSR → Mapper → post-Delay Filter.cutoff` hoists the Mapper, which then reads `node_env_out_vsum` —
  the sum of per-voice envelopes. SKB-017 survives one node upstream, silently, and is now *harder* to
  spot because the modulator itself looks correctly bus-domain. The SKB-017 comment's "the fix is to
  hoist the source" over-claims: it is complete only when the hoisted node's inputs are domain-clean.
- [ ] **B7-3-followup-2** (S) — A modulator feeding **only** a `GraphOutput` stays voice-domain and
  gets a `_vsum` (voice-summed, silent during the tail). Pre-existing, unchanged by B7.
- [x] **B7-x1** (S) — ✅ **CLOSED**. `compute_bus_tail_seconds` now takes the graph and counts only
  Delay/Reverb nodes with a path to a GraphOutput (`live_nodes_toward_output`, the same walk
  `warn_unreachable_nodes` uses — one reachability, two readers). A graph with no output keeps its old
  everything-counts behaviour so that already-warned shape does not move. Pinned by two cases in
  `tail_and_domain_residue_test.odin`. *Half closed in `a71c96f`*: the reverb comb length is now `REVERB_COMB_SECONDS`,
  single-sourced across the analysis, the reverb emission and the live tail proc. **Still open:**
  `compute_bus_tail_seconds` iterates `all_nodes`, so an orphaned Delay with no path to `GraphOutput`
  still inflates the worst-case bound (which now only gates emission, so the impact is smaller).
- [x] **B7-x2** (S) — ✅ **CLOSED**. `warn_panner_mono_consumers`: a Panner with consumers but no
  GraphOutput among them warns that its pan has no effect, naming the fix (wire it into Output, or move
  it after the node it feeds). It fires on exactly the two fixtures built for the mono fallback
  (`panner_mono`, `panner_mono_sum`) and on no shipped example. Pinned by
  `tail_and_domain_residue_test.odin`. The pass-through itself is unchanged and still correct. Original
  text: The Panner mono fallback is now a *complete* pass-through, so
  `Panner → Gain → GraphOutput` discards pan entirely. Defensible, but nothing notices: `panner_mono`
  asserts only audibility and pitch.

### B8 — Flagship Content  ✅ CLOSED `120081a`
- [x] **B8-1** — SKB-014. `four-bar-song`: 3 `MidiInput.pitch → input_freq` wires deleted, **8**
  `MidiInput.gate → ADSR.input` wires deleted, Kick pitch-env depth 120 → 1.5, `session` block added
  with `patternSteps: 64` (at the old default of 16, three of its four bars did not play).
- [x] **B8-2** — SKB-015. `sax3`: 1 pitch wire + 1 gate wire deleted, `session` added. The ADSR
  Gate→In relabel was already done in `ADSRNode.tsx`.
- [x] **B8-3** — `warn_exponent_port_overdrive`, deliberately conservative: warns only on a **provable**
  peak (literal ADSR `depth` whose own `input` is unwired, literal Mapper `outMin`/`outMax`, literal LFO
  `amplitude`) and stays silent on exposed/P-locked values whose declared ranges would make it cry wolf
  on nearly every exposed Mapper.

#### Two corrections to this packet's original diagnosis
- `MidiInput.pitch` emits `(voice.note - 69.0) / 12.0`, **not** the raw note number, so its range is
  ≈ −5.75..+4.83 and it can never reach the ±10 clamp on its own. The 1024× error was only ever the
  Kick's `depth: 120`. The pitch wire is still a real audible defect — it double-applies pitch on top
  of `voice.current_freq` — but by a different mechanism than first written down here.
- `FmOperator` sums **both** `input_carrier` and `input_freq` into one clamp, so both are exponential
  ports, not just `input_carrier`.

#### A trap worth remembering
The new B8-3 warning is **silent on `four-bar-song` as it originally shipped**. The Kick's pitch-env
ADSR also carried a gate wire on its own `input`, and an ADSR with a wired input cannot be bounded — so
the two defects masked each other, and the overdrive only becomes provable once the gate wire is gone.
A conservative static warning cannot see a defect that another defect is hiding.

### B9 — Preflight Validation + CLI Hardening
- [x] **B9-1** (M) — ✅ **CLOSED**. `find_nested_instrument` + `validate_no_nested_instruments` in
  `graph_validate.odin`, called from `generate_processor_code` beside `validate_connections`. Pinned by
  `tests/unit/preflight_test.odin` and reproducible from `tests/fixtures/_negative/nested_instrument.json`.
  **The defect was worse than filed:** "emits garbage" understated it. The emission dispatch's unknown-type
  branch printed `Error: unknown node type "Instrument" ... Refusing to generate` and then **did not exit** —
  the file was written, main printed `Codegen OK`, and the inner instrument's nodes were simply absent with
  its output variable stuck at `0.0`. That branch now exits 1 too, so *any* type without a generator is a
  real refusal. Original text: Pre-emission validation pass: nested Instruments rejected with purpose-built
  message — **SKB-028** (high).
- [x] **B9-2** (S) — ✅ **CLOSED**. `find_duplicate_node_id` + `validate_unique_node_ids` in
  `graph_validate.odin` replace both warn-and-rename sites; `build_graph_from_raw` runs it over every node
  before keying the map, `build_project_from_graph_raw` over Instrument nodes only (helpers there are
  discarded, never keyed). Literal duplicates and sanitization collisions (`osc-1` / `osc_1`) get different
  messages because the second kind cannot be seen by eye. Pinned by `preflight_test.odin`; reproducible from
  `_negative/duplicate_node_id.json` and `_negative/sanitized_id_collision.json`.
  **Correction to the note above:** the goldens `numeric_ids` and `multi_instrument_dup_names` did **not**
  move. Neither contains a duplicate — `numeric_ids` has five distinct ids, and `multi_instrument_dup_names`
  repeats `1..4` across six *separate* subgraphs, each its own map. Verified by running codegen over all 152
  fixtures and examples: zero duplicate-id warnings, so the hard error has no corpus fallout. Original text:
  Duplicate node IDs become a hard error instead of silent mis-wire — **SKB-021** (high).
- [x] **B9-3** (S) — ✅ **CLOSED**. `-check` runs parse, every preflight rule, both emissions (the shim
  is generated even when no `-wasm-shim:` is given, so a shim-only failure is a check failure) and the
  target guard, then writes nothing and prints `Check OK`. The guard is `core/target_guard.odin`, a
  case-by-case mirror of `codegenGuards.ts` (same two guards, same order, same message text) pinned by
  `tests/unit/target_guard_test.odin` one-for-one against `ipcGuards.test.ts`. `-out:nul` is exempt: it is
  the documented diagnostics-only invocation and its "directory" is `skald-backend\`, which owns
  `package skald_codegen`. `-version` ordering preserved. Before the fix, `-check` was silently ignored and
  `-out:` onto a `package main` file overwrote it with exit 0 — reproduced by hand before wiring the guard.
  Original text: `-check` and `-version` CLI flags; port `assertCodegenTargetSafe` into `main.odin`.
- [x] **B9-4** (S) — ✅ **CLOSED**. One spawn helper, `skald-ui/src/main/runChild.ts`, now serves both
  `invoke-codegen` and the preview build's `runProcess` (which had its own timeout but no stdin handler
  either). Pinned by `src/tests/main/runChild.test.ts` against real child processes: the pre-fix run showed
  the exact production crash — `Unhandled Errors: Error: write EOF { code: 'EOF', syscall: 'write' }`
  (Windows' spelling of EPIPE) — plus a test that never settled until vitest's 10 s limit. Every preflight
  hard error the generator now emits (B9-1, B9-2) exits before draining stdin, which is what made this
  packet urgent rather than theoretical. Original text: `invoke-codegen` gets timeout + stdin error
  handling — **SKB-039** (medium).
- [x] **B9-5** (S) — ✅ **CLOSED**. One exported predicate, `instrumentSelectionBlockedReason`
  (`useNodeComposition.ts`), read by three places: the Sidebar's Create Instrument button (greyed, with the
  reason as its tooltip — Create Group stays enabled, a visual group around an instrument is fine), and both
  hook handlers. Pinned by `src/tests/hooks/CreateInstrumentGuard.test.tsx`, which before the fix showed the
  prompt opening and a nested instrument being created. Original text: Reject `type === 'instrument'` from
  Create-Instrument selection.

### B10 — Peak Meter + Clip LED
- [x] **B10** (S) — ✅ **CLOSED**. `PeakMeter` (`components/Visualization/PeakMeter.tsx`) sits under the
  visualizer in the dock's Master section: two bars (−60..0 dBFS), a peak-hold tick falling at 20 dB/s, and
  a clip LED that latches at ≥ 0 dBFS until clicked. The tap is a `ChannelSplitterNode` off the worklet
  output feeding one `AnalyserNode` per channel (`useWasmAudioEngine.ts`, exposed as `meterAnalysers`),
  read with `getFloatTimeDomainData` on 1024-sample windows — both traps below are pinned:
  `PeakMeter.test.tsx` asserts the byte variant is never called and that a right-only 1.2 lights the LED;
  `WasmEngineContract.test.tsx` asserts the splitter exists with outputs 0 and 1 wired to two distinct
  analysers. `utils/meter.ts` holds the arithmetic (peak, dBFS, fill, hold, clip) with a NaN/Inf sample
  reported as an over rather than silence. Both test files failed before the code existed. SKB-053 (the
  worklet's per-quantum `Float32Array` views) is unchanged by this packet — still open below. Original
  text: Stereo peak-hold meter with clip LED in transport dock.
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
- [x] **B12** (S) — ✅ **CLOSED**. Every emitted file (game-facing `.odin` **and** the preview shim) now
  opens with an AUTO-GENERATED banner, `generator:` (the `-version` source digest) and `input:` (FNV-1a of
  the input JSON with CR bytes skipped, so the same committed fixture digests identically in a CRLF working
  tree and a `git archive` export). The game-facing header adds the THREADING rule (F-B05-3) and, per asset,
  every exposed parameter as its concrete typed setter with range/default/unit and the node it belongs to,
  plus both setter styles and the `<nodeId>::<param>` alias (F-B05-6). The listing is emitted from the same
  `Instrument_Plan` the setters and `_PARAMS` come from — plans are now built *before* the header — so it
  cannot advertise a setter the body lacks. Pinned by `tests/unit/provenance_test.odin` (FNV-1a reference
  vectors, CR-insensitivity, and five header assertions watched failing against the signature-only tree).
  - **The architectural catch was resolved by moving, not duplicating:** `fnv1a64` now lives in
    `core/provenance.odin` and `main.odin`'s `source_digest` calls `core.fnv1a64`. `core/provenance.odin`
    is in `CODEGEN_SOURCES`.
  - **Stamp override:** `SKALD_CODEGEN_STAMP` replaces the generator string when set; `run_golden.bat` and
    `run_corpus_golden.bat` set it to `golden`, because the real digest changes with every backend edit and
    would churn all 154 snapshots per commit. The input digest has no override.
  - **Golden regeneration shape:** 56 + 98 goldens changed, **zero deleted lines**; every added line is one
    of the header lines above (audited with `diff | grep '^<'` over all 56 before `update`).
  - *Consequence for B6-1-x4:* the editor and CLI paths serialize the same file to different bytes, so the
    `input:` line will differ between them by construction; the cross-path equality gate must strip it (and
    the `generator:` line) before comparing. Original text: Thread rule in header; per-asset exposed
    params + setter styles listed; AUTO-GENERATED banner + generator stamp + input hash.

---

## Wave C — Schema & Behaviour

> **Wave C:** started 2026-09-05 after Wave B closed. **All seven sections landed** (C2 in its schema-as-data core; its generated-bindings remainder is recorded as C2-followup for 0.3).

### C1 — Schema Version + Migration Registry
- [x] **C1** (M) — ✅ **CLOSED**. `skald-ui/src/utils/saveMigrations.ts`: `CURRENT_SAVE_VERSION = 1`,
  an ordered `MIGRATIONS` registry (asserted contiguous), `walkNodes` recursing into every
  `data.subgraph.nodes`, and `migrateSaveFile`, which `parseSaveFile` runs before any state lands and
  `handleSave` stamps. Migration 0→1 is the two former ad hoc shims — `parentNode → parentId` and the
  dead-`syncRate` scrub — now recursing (F-B06-7: the old `parentNode` shim stopped at the top level).
  A file from a newer Skald is refused whole, on both sides: the backend mirrors the version as
  `SAVE_FORMAT_VERSION` in `json.odin` and `build_project_from_json` returns an error for a newer one
  (`save_version_test.odin`). Absent ⇒ 0 and accepted, so no shipped example or test fixture changed.
  Pinned by `saveMigrations.test.ts` (fixture pair, idempotence, registry contiguity, version guard, and a
  round trip over four shipped examples) and three `FileIO.test.tsx` cases through the real hook that
  failed before (no version stamped; subgraph `parentNode` untouched; newer version half-read). Every
  later schema change is a new `Migration` entry plus a fixture pair — and a bump on both sides.
  Original text: `version` stamped by `handleSave`; ordered pure `MIGRATIONS` run in `parseSaveFile`;
  **must recurse into subgraphs**.
  - **Closes:** SKB-054

### C2 — Node Schema + Generated Bindings
- [x] **C2** (M–L) — ✅ **CLOSED — core** (2026-09-05), remainder cut to 0.3 as the row itself allows.
  **Landed:** `schema/nodes.json` is the one authored copy of the parameter-range contract
  (overrides, prefix rules, generic rows, fallback, each with its `why`). `scripts/gen-node-schema.mjs`
  renders it to `skald-backend/core/param_ranges.generated.odin` (the tables `lookup_param_range` walks;
  the hand-written tables are gone) and `skald-ui/src/definitions/nodeSchema.generated.ts` (the same
  data plus `lookupRange`, a case-by-case mirror of the Odin precedence). `node-definitions.ts` reads
  every numeric default with a row through `sd()`, so a default is authored once. Gates:
  `NodeSchema.test.ts` regenerates both files in memory and fails on a stale copy, pins the mirror's
  precedence, and asserts node-definitions agrees with the schema; the range-parity gate keeps asking
  the real backend. **The nine live default divergences are closed** (Wavetable/S&H amplitude 0.5→1,
  ADSR decay 0.1→0.2 / sustain 0.7→0.5 / release 0.2→1, Reverb decay 0.1→3 with the tail's 0.1 floor,
  Gain 1→0.75, FM ratio 1→2, Mapper outMax 1→20000) as node-scoped override rows, and the parity
  allowlists shrink accordingly (instrument.volume stays: dormant path, not a divergence). Save version
  4: migration 3→4 stores the OLD generated value on any exposed-but-unstored parameter of those nine
  pairs, so no existing file changes sound — SKB-024's 6 dB is kept as it sounded, and a fresh node now
  generates at what its card shows. No shipped example had an exposed-but-unstored parameter (scripted
  check over all 97), so every golden is unchanged. Tests watched failing first: 3 Odin unit tests
  (`range_schema_test`), NodeSchema.test.ts (7 cases), migration 3→4 (2 cases).
  **Closes:** SKB-024 (and the S&H twin). SKB-040 / SKB-042 / SKB-055 are not described anywhere in
  the repo (no BUGS.md; no code or doc mention) — left as they were, flagged for the user.
  **Cut to 0.3 (C2-followup):** generating TS param types (dropping the `[key: string]: any` escape
  hatch), the validator's port tables, `normalize_node_type`, struct-field/reset emission, and
  rendering the sidebar from the node-card `ParamField[]` spec (F-B07-8). Each is a mechanical
  consumer of the same schema once ports/state are added to it; none changes a shipped sound.

### C3 — Stable Asset Identity
- [x] **C3** (M) — ✅ **CLOSED** (2026-09-05). Save version 2. The Instrument node carries `exportId` and
  `assetType`; the generator reads them first (`instrument_export_prefix`, `detect_asset_type`) and
  falls back to the display name / the track inference only when they are absent, so every pre-C3 file
  emits exactly what it did. Two assets resolving to one prefix where either pinned it is a hard error
  naming both instruments (`find_export_prefix_conflict`; `_negative/duplicate_export_id.json`) — the
  silent `Keys`/`Keys_2` (F-A09-7) survives only for two *derived* duplicates. Migration 1→2 backfills
  `exportId` with the symbol the file already emitted (legacy `_2` dedupe in generator order) and
  `assetType` with what the tracks would have inferred, once; `utils/assetIdentity.ts` is the
  case-by-case mirror and the cross-path corpus gate holds it to the Odin. The card shows Export ID
  (placeholder = derived prefix), the resulting `<prefix>_trigger`, the asset index, and a Type select
  (Auto / One-shot SFX / Music layer). Paste and Export-Step give a clone a fresh Export ID instead of
  the source's pin; the issues banner reports a duplicate in the same frame it happens.
  **Two deliberate deviations from the row in docs/0.2-ROADMAP.md:** (1) instruments stay sorted by
  sanitized node id, not by Export ID — the id order is already stable and total (SKB-003) and
  re-sorting would churn every existing project's asset indices for nothing; the index is now shown on
  the card instead. (2) The collision prefix rule is unchanged: every node carries a defaulted label,
  so no rule local to node A can pin its typed setter without renaming every existing setter. The
  generated header now states the contract — `<nodeId>::<param>` is the stable key, typed names are
  collision-prefixed — where the game team reads it. Tests: 11 Odin unit tests (asset_identity_test),
  golden `codegen_only/export_id_pinned`, and 36 vitest cases across assetIdentity, InstrumentNode,
  saveMigrations, ProjectSerializer, ProjectIssues, GraphEditing and ExportStepOverrides — every one
  watched failing first.

### C4 — Multiplicative VCA `input_gain`
- [x] **C4** (M) — ✅ **CLOSED** (2026-09-05). Save version 3. The Gain node carries `gainMode`:
  `"multiply"` emits `audio * knob * in1 * in2…` (`generate_gain_code`), anything else — including an
  ABSENT field, which is every pre-C4 file on disk and every CLI input — keeps the additive
  `audio * (knob + in)`. So no existing patch changes sound, and the cross-path corpus gate stays
  exact. Version-gating: migration 2→3 stamps `gainMode: 'add'` on every existing Gain node (inside
  instruments too) so the file says what it does; a VCA dragged in fresh gets `'multiply'`
  (node-definitions default). The card shows the choice as **Gain in** with a hint per mode. ADSR-direct
  stays the taught canonical; the ADSR's own multiply is untouched. Tests, each watched failing first:
  acceptance `vca_multiply` (knob 1.0 + bare envelope: decay-window RMS 0.54 → 0.25, late-release
  RMS 0.3 → ~0; the first draft asserted silence after the note and passed before the fix because an
  Idle envelope deactivates the voice either way — re-targeted at the live windows), 5 Odin unit tests
  (`gain_mode_test`), and 5 vitest cases (GainNode card, migration 2→3, registry). Manual: VCA chapter's
  gotcha section rewritten as the two-arithmetic rule; ADSR chapter's "modulation inputs add" sentence
  carries the exception.

### C5 — Finish the Nodes
- [x] **C5** (M) — ✅ **CLOSED** (2026-09-05). **Unison decision: already made** — SKB-012 gave both the
  Wavetable and the FM Operator the Oscillator's unison/detune loop long before this wave, and
  `wavetable_unison_stack` / `fm_unison_stack` pin it (verified before implementing, per the
  tracker rule). The three real gaps, each additive with a default that reproduces the old emission
  byte for byte so no save changes sound and no version bump is needed: **Wavetable `pulseWidth`**
  (0.01–0.99, default 0.5, `input_pulseWidth` port) rides into `skald_wavetable_sample`, whose
  square case reads it instead of a hard-coded 0.5; **Wavetable `phase`** (0–360°, offset in turns
  since this accumulator runs 0..1, emitted only when authored or exposed); **FM Operator
  `amplitude`** (0–1, default 1, `input_amp` port; unity emits no multiply; override range row so an
  exposed-but-untouched level stays at 1, the SKB-051 class); **Reverb `damping`** (0–1, default 0;
  Freeverb's one-pole lowpass on the fed-back sample, with `reverb_damping_active` deciding struct
  field, init and DSP line together so an undamped reverb's text does not move). Validator port tables,
  cards, sidebar sliders (range-parity gate green) and defaults updated. Tests, each watched failing
  first: acceptance `wavetable_pwm` (setter absent → rejected), `wavetable_phase` (0.5 + 0.25 at
  180° must cancel to RMS ~0.14; was 0.42), `fm_level` (RMS 0.57 → 0.14), `reverb_damping` (centroid
  must fall 0 → 0.95); 10 Odin unit tests (`nodes_finish_test`); 6 vitest cases (cards + defaults).
  Goldens: only the two wavetable helper lines change in every file, plus the call sites.

### C6 — Voice Lifecycle Polish
- [x] **C6-1** (S) — ✅ **CLOSED**. `note_on` steals in two tiers: first the oldest voice whose every
  voice-domain ADSR is in Release/Idle, then the oldest voice outright. Strict `>` on age keeps the
  lowest index on a tie, so the choice is deterministic (F-B03-6 folded in). A graph with no ADSR has no
  release tier and keeps the plain oldest-voice rule, so its emitted text is unchanged by this item.
  Acceptance `steal_release_first`: 2 voices, the oldest note held, a younger one released, a third
  note arrives — the held note must still be the strongest partial afterwards. Failed at 878.9 Hz
  (the held 220 Hz note was the one stolen) before the fix. — **SKB-030**
- [x] **C6-2** (S) — ✅ **CLOSED**. The fresh-voice reset (the `if !stolen` block) now covers LFO
  phase and Sample & Hold (counter to 0, a new held value drawn at note start). Rule adopted: a fresh
  voice restarts every *time-based* state; Noise is deliberately left alone because its only state is
  an RNG stream (reseeding would make every note the same burst) and the pink filter's smoothing memory.
  Acceptance `lfo_retrigger`: two fresh notes with a 0.25 Hz LFO on the VCA must have equal onset
  RMS; before the fix the second note started 45° further along the LFO and 27 % louder. — **SKB-031**
- [x] **C6-3** (S) — ✅ **CLOSED**. A voice with no ADSR lingers `NOADSR_FADE_SECONDS` (5 ms) past
  its duration under a linear `voice_gain` fade, applied to its GraphOutput adds *and* the per-voice
  sums that carry it into bus nodes, instead of `active = false` on the expiry sample. Acceptance
  `noadsr_fade`: the largest sample-to-sample step around expiry must not exceed 1.5× the steady-state
  maximum, and the voice must still be silent 50 ms later. The first version of the test passed before
  the fix — a 0.2 s cut of 440 Hz lands exactly on a zero crossing — so the duration is 0.2006 s.
  — **SKB-030**
- [x] **C6-4** (S) — ✅ **CLOSED**. Removed the Sustain-stage `if envelope <= 0.0001 do stage = .Idle`
  jump. An Idle envelope marks the whole voice inactive, so a held note whose ADSR only shaped a filter
  went silent at the end of the decay and the Release the UI draws never ran. Sustain 0 is now a level
  like any other: the stage waits for note_off/duration; `_trigger` already auto-releases at
  attack+decay so one-shots still end. Acceptance `sustain_zero_hold`: sustain 0 on a filter-cutoff
  envelope, note held for 2 s, 220 Hz must be the peak in the 0.5–1.0 s window (was silence).
  Goldens: 52 fixture + 184 corpus deletions of the Idle line, all enumerated before `update`.
  — **SKB-041**

### C7 — BPM-Sync Value Hygiene
- [x] **C7** (S) — ✅ **CLOSED**. `utils/syncNormalize.ts`: `normalizeSyncedFreeRun` writes the value a
  synced node's division resolves to into its free-run field (LFO `frequency` and SampleHold `rate` in
  Hz, Delay `delayTime` in seconds), recursing into subgraphs. `handleSave` runs it on a copy at the
  session tempo and `applySaveData` at the file's own tempo, so a pre-C7 file's stale value (F-A03-5's
  14 % drift) is corrected on first open and the file holds one truth from then on. Not a migration: it
  depends on tempo, so it runs every save/load. Node cards: `ParamField.hint` renders under a select, and
  the three synced cards show `formatSyncTime` at the project tempo carried through `GraphActionsContext`
  (`useProjectBpm`, `BPM_DEFAULT` outside the app). Pinned by `SyncNormalize.test.ts`,
  `SyncTimeHint.test.tsx` and two `FileIO.test.tsx` cases that failed before (Save wrote 3.4 Hz for a
  1/8 node at 120 BPM; Load left it). Original text: Save/load normalization; node cards show resolved
  sync time.

---

## Wave D — Documentation

> **Wave D:** started and closed 2026-09-06, after Wave C. Everything below was produced by triage and
> rewrite passes that verified each claim against the current tree, never against the July audit.

- [x] **D1** (L) — ✅ **CLOSED** `765f2a7`. Four new chapters in `docs/manual-source/`:
  `01-getting-started.md` (install routes, editor tour, the one rule — an Instrument is what preview and
  export compile, and a loose graph auto-wraps since B6-1 — sound in 60 seconds, save/load/autosave,
  every shortcut from `ShortcutLegend.tsx`), `05-sequencer.md` (transport, BPM, pattern length, tracks,
  Step Grid vs Piano Roll at MIDI 0–127, Key + Scale and `nearestInScale`, and the P-lock rule read from
  emitted code: a P-lock *is* `<Asset>_set_param` before the step's `note_on`, sticky, additive
  modulation on top, auto-exposes — preview and export share `generate_sequencer_logic`, so they cannot
  differ), `80-exporting-odin.md` (exit criterion 6 as a document: file shape, export IDs, lifecycle,
  buffer contract, `_is_playing` through the tail, `_PARAMS` and both setter kinds, the `::` alias,
  per-asset volume + `skald_soft_limit`, the threading rule, regeneration and the provenance digest,
  preflight refusals quoted from real stderr, the integration demo run to `silent-test PASS`), and
  `85-deliberate-exclusions.md` (every `docs/0.2-ROADMAP.md` §7 row with reason and revisit condition, plus
  the 19 design notes D2 lifted out of the chapters — exit criterion 7). Each chapter was fact-checked by
  a second agent that re-ran the commands. Chapter order per `EDITORIAL-REPORT.md`: Instrument and the
  Sequencer are 3rd and 4th because every exercise needs them (`build-manual.mjs` PARTS, 27 chapters).
  `examples/integration_demo/README.md` now builds `codegen.exe` first (it failed on a fresh clone).
- [x] **D2** (M) — ✅ **CLOSED** `ddcda7b`. Every chapter's "Code-vs-intent notes" section is gone
  (~160 paragraphs). Five triage passes classified each item against the tree, `FIXED.md` and this file:
  53 still-open defects → `docs/manual-source/KNOWN-ISSUES.md` as KI-001..053 (deduplicated, grouped by
  area, status/severity/chapters/citations; a registered chapter, so it ships), 44 fixed items → its
  "Resolved before 0.2" table naming the closing packet, 19 design decisions → D1's exclusions chapter,
  the `skald-ui/new_docs` staleness → one sentence. Each chapter ends with a "Known issues" section
  naming the KI ids that touch it. D3 added KI-054..056.
- [x] **D3** (L) — ✅ **CLOSED** `82b0267` + `3f92958`. Convention is `path::identifier` (a name that
  literally appears in the file); `scripts/manual/check-citations.mjs` gates it (strict over the PARTS
  chapters, `--all` advisory over `docs/**`), runs inside `npm run check`/`npm run build`, and replaced
  the Python checker that exited 0 unconditionally. 1,323 legacy citations converted by eight passes
  that re-verified every claim; 97 passages rewritten because the code no longer did what they said,
  each listed in `FIXED.md`'s D3 entry with the packet that changed the code (Piano Roll 0–127, auto-wrap,
  real pre-delay, the B7-1 Panner law, multiplicative VCA, per-asset limiter, C6 voice lifecycle, "In"
  port, the sax3 exercise rebuilt against the shipped file, "Open File..."/"Download Code"). The
  checker was tightened twice by what the pass found (bare `:153` continuations, comma lists, bare
  `::identifier` shorthand); 12 self-tests. Foundations' "How to read this manual" states the new order,
  the convention and the mono-until-the-terminal-Panner model. Exit criterion 4: `FIXED.md` carries the
  entry; the gate reports 0 mismatches. **Not done from the row:** "make 'chapter sections invalidated'
  a required packet-report field, cross-checked against the diff" — a process rule, recorded under To-do.
- [x] **D4** (S) — ✅ **CLOSED** `1811f07`. Dated status banners on `CODEX-REMEDIATION-BRIEF.md` (with the
  W0–W5 → A/B/C mapping, all closed), `bpm-ux.md` (retitled *BPM input hygiene*; each proposal marked
  landed / not / superseded, B2 and C7 named), `0.2-ROADMAP.md` (origin plan, frozen; §7/§9 still the
  reference), `0.2-AUDIT-GAPS.md`, `docs/audit/0.2/README.md`, `EDITORIAL-REPORT.md`, and the gitignored
  `review-checkpoints/REVIEW-REPORT.md` (T8 superseded by architecture). `BUGS.md` was folded into this
  file at `35a1654`; `examples/AUDIT.md` was already deleted once A5 went green; audio-oddities #4 already
  read CONFIRMED-FIXED. `TESTING.md` records the one brief coverage gap still open (Sample & Hold has no
  backend fixture).## Wave E — Make It Playable

> The features that make Skald feel like a real instrument.

- [ ] **E1** (S) — **QWERTY keyboard auditioning.** Press keys to trigger synth voices live while adjusting parameters. No more sequencing just to hear a sound. *(§9.7)*
- [ ] **E2** (M) — **Piano Roll: note duration dragging.** Remove `pointerEvents: 'none'`; implement drag handles to adjust `NoteEvent.duration` horizontally across step boundaries. *(§9.1 item 1)*
- [ ] **E3** (M) — **Piano Roll: per-note P-lock editing.** Click individual chord members to assign P-locks, micro-timing, and probability independently. *(§9.1 item 2)*
- [x] **E4** (S) — ✅ **already landed** by B5-3 (SKB-026): `stepMetrics.ts::MIDI_NOTE_MIN/MAX` are 0/127, `pitchRowsDescending` draws all 128 rows and the roll opens scrolled to middle C. Verified 2026-09-06 while writing the Sequencer chapter; the row's "hardcoded 21–84" premise was stale. *(§9.1 item 4)*
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
| **`odin test tests\unit` did not compile** (✅ repaired `fe05093`) | 16 errors: `tests/unit/unison_wavetable_fm_test.odin` called `generate_wavetable_code`/`generate_fm_operator_code` without the `plan` parameter and `generate_processor_code` without `plan`, added by an earlier refactor. CI's parameter-contract step must have been red for some time. **Repaired in `fe05093`** (mechanically — `nil` for the node generators, `build_instrument_plan` for the processor), because B7's new tests could not otherwise run. Worth a look: passing `nil` for `plan` may quietly disable the parameter-resolution path those tests exist to cover. |
| **`run_corpus_golden.bat` counted passes as failures** | ✅ **FIXED** `57df823`. `echo NON-DETERMINISTIC %NAME% (shim)` left its parens unescaped, so cmd closed the enclosing `if errorlevel 1 (` at parse time and `FAILED+=1` / `NONDET+=1` / `goto :eof` ran **unconditionally for every fixture that passed**. Hence 98 reported non-deterministic emissions, zero individual status lines, and a golden comparison never reached — all 98 pairs were in fact byte-identical. Now emits 99 honest lines: 98 `MISSING GOLDEN` + 1 `CODEGEN FAILED`, zero `NON-DETERMINISTIC`. ✅ **Green as of B6-2**, which deleted `PulsarBeam.json` and recorded the 98 corpus goldens: `.un_corpus_golden.bat` now reports "All 98 goldens match" on two consecutive runs. |
| **`tsc --noEmit` and `npm run lint` are red** | ✅ **FIXED** 2026-09-05. `TS2307: Cannot find module '../../forge.env'` in `src/tests/components/ExamplesModal.test.tsx`, plus two `import/no-unresolved` for the same specifier. Two defects, not a config problem: `ExampleItem` was declared only in `forge.env.d.ts`, a declaration file ESLint's import resolver cannot resolve (hence both lint errors, one in the modal and one in its test), and the test's relative path pointed one directory too shallow — `src/forge.env`, which does not exist (hence the tsc error; the modal's own path was right, which is why tsc never complained about it). `ExampleItem` now lives in `src/definitions/examples.ts`, a real module, and `forge.env.d.ts` imports it for the preload API surface. Both gates report 0. This was the standing baseline (1 / 2) every Wave B agent was measured against. Note `npx eslint --ext .ts,.tsx .` behaves differently from `npm run lint`; use the npm script. |

Exit criterion 1 ("four CI gates green") is met: every gate is green at
baseline as of 2026-09-05 (see `TESTING.md`'s known-red table, now empty).

**`scripts/verify-baseline.ps1` exists so this table never has to be rediscovered.** It runs every gate
against a pristine `git archive` export of any ref, so "was this already broken?" is a command rather
than an argument. `TESTING.md` holds the protocol and the current known-red list; `CLAUDE.md` points any
agent at both before it reports a gate result.

## Verified baselines (at B6-1)

Backend gates need the `.\` prefix under `cmd /c`; a bare `cmd /c "run_acceptance.bat"` fails.

| Gate | Command (run from) | Green |
|---|---|---|
| Acceptance (FFT) | `skald-backend` → `.\run_acceptance.bat` | 39/39 |
| Goldens + determinism | `skald-backend` → `.\run_golden.bat` | 56/56 match, 56/56 identical on re-run |
| Examples corpus (backend) | `skald-backend` → `.\run_corpus_golden.bat` | 98/98 match (recorded by B6-2) |
| Backend unit | `skald-backend` → `odin test tests\unit` | 77/77 |
| UI | `skald-ui` → `npx vitest run` | 57 files / 735 tests |
| Examples corpus (UI) | `skald-ui` → `npx vitest run src/tests/corpus/ExamplesCorpus.test.ts` | 198/198 |
| Typecheck / lint | `skald-ui` → `npx tsc --noEmit` / `npm run lint` | 1 / 2 pre-existing errors (see above) |
| Examples corpus (UI) | `skald-ui` @ `npx vitest run src/tests/corpus/ExamplesCorpus.test.ts` | 198/198 |
| Typecheck / lint | `skald-ui` @ `npx tsc --noEmit` / `npm run lint` | 1 / 2 pre-existing errors (see above) |

At `9563a57` these were 33/33, 48/48, **did not compile**, 44 files / 573 tests, 1 / 2. Note the UI
figure: 44/573 is the tracked-tree number, confirmed by running vitest in a `git archive HEAD` tree.

## To-do (carried out of Wave C, 2026-09-05)

Work the agent left deliberately undone. Each is small and self-contained; none blocks 0.2.

- [ ] **KI-055 · feedback loop does not stop generation** (S, **high**) — `codegen_processor.odin::generate_processor_code`
  prints "contains a feedback loop" and then continues past a commented-out `os.exit(1)`, emitting the asset
  without the cyclic nodes and exiting 0. Restore the exit behind an acceptance fixture that fails first
  (a two-node cycle inside an Instrument), and make the editor surface the refusal. Found by the D3 pass.
- [ ] **FM Operator Ratio reset** (S) — `NodeParameterControls.tsx` still hardcodes 1 as the slider's
  double-click reset target while `schema/nodes.json` says 2 (C2 flipped the polarity of the old split;
  KI-024). Read the reset value from the schema row so there is one reader.
- [ ] **Stale comments and pinned-nothing scales** (S) — `useSequencerState.ts` header says "50-entry
  stack" (`editorSnapshot.ts::HISTORY_LIMIT` is 100); `stepMetrics.ts` and `EffectiveStepRange.test.tsx`
  say `four-bar-song.skald.json` has no `session` block (B8-1 gave it one); no vitest pins `SCALES`, the
  `Chromatic` default or `nearestInScale`'s tie-break (interval listed first wins — A♯ in C major goes
  *down* to A). Add the test, fix the comments.
- [ ] **Example hygiene** (S) — `wobble-samplehold-bass.skald.json` stores a pre-C7 LFO free-run value
  (C7 corrects it on first open; re-save so the file holds one truth); `hat-static.skald.json` P-locks
  `decay` 0.12 with no restore, so every step after 2 is long (KI-056) — lock 0.045 on the other steps.
- [ ] **Packet-report field** (process) — the half of D3 not done: every packet report lists the chapter
  sections it invalidates, cross-checked mechanically against the diff. Today the discipline is the
  `FIXED.md` entry plus the citation gate; the mechanical cross-check does not exist.
- [ ] **Integration demo does not exit without an audio device** (S) — `examples/integration_demo` in its default
  full-demo mode prints its 8 s timeline through `shutdown` and then never returns when run from a session with no
  audio device (observed 2026-09-06 under the agent shell); the process holds `integration_demo.exe` open and the
  next `build_and_run.bat` fails with LNK1104. `-mode:silent-test` exits cleanly. Check the device teardown path in
  `main.odin`; CI's smoke job should use silent-test or a timeout.
- [ ] **ESLint caveat lost with BUGS.md** — the old `BUG-LINT-WARNINGS` note ("the fix was a suppression;
  four rule families are still `off`") did not carry into this file. Re-verify `skald-ui`'s ESLint config
  and either turn the rules on or record the decision here.
- [ ] **C2-followup** (M, 0.3) — the generated-bindings remainder of C2, each a mechanical consumer of
  `schema/nodes.json` once ports and per-node state are added to it: generated TS param types (drop the
  `[key: string]: any` escape hatch), the validator's port tables (`graph_validate.odin`),
  `normalize_node_type`, struct-field/reset emission, and the sidebar rendered from the node-card
  `ParamField[]` spec (F-B07-8). None changes a shipped sound.
- [ ] **SKB-040 / SKB-042 / SKB-055** — listed under C2 as "closes" but described nowhere in the repo
  (no BUGS.md, no code or doc mention). Recover what they were, or strike them from the C2 row.
- [ ] **Manual rebuild / publish** — `npm run build:html` was run 2026-09-06 after Wave D (27 chapters, 2.5 MB); the PDF needs Chrome and was not built. Still yours to place. Original note: `docs/manual/skald-manual.html` is gitignored (`.gitignore:46`). The
  manual-source edits from C3 (Instrument: Export ID, Type), C4 (VCA: Gain-in modes) and C5
  (Wavetable PW/Phase, FM Amp, Reverb Damping) are committed in `docs/manual-source/` but the
  published HTML is whatever was last built. Run `npm run build:html` in `scripts/manual/` wherever
  the manual is published.

## For Ryan — decisions only you can make

Two Wave B items were left open on purpose because they are design choices, not defects. Both are
one-line changes once decided; the agent did not choose.

- [ ] **B7-3-followup-2** — A modulator that feeds **only** a `GraphOutput` today stays voice-domain:
  it runs per voice, gets a `_vsum`, stops when the voice ends, and is silent during a Delay/Reverb
  tail. The alternative is bus-domain: it keeps running through the tail and sounds with no voices
  active. Which do you want? (The item under B7 names the code path.)
- [ ] **B2-x1** — Which parameters a freshly placed Oscillator exposes by default. Today
  `defaultOscillatorParams` exposes `frequency`, `amplitude`, `pulseWidth`, `phase`, and a new
  oscillator is Sine with Fixed Pitch off — so two of the four are dead on arrival and every Generate
  warns twice per new oscillator (no dead setter is minted; B2 keeps the API honest). Options: trim the
  list to `amplitude` + `phase` (expose on demand), or make the defaults flip with `waveform` /
  `fixedPitch`. A UX decision, which is why B2 did not make it.
- [ ] **Manual publish** — see the rebuild item above; where the HTML goes is yours to decide.

---

## Standalone Bugs (no wave assignment yet)

| ID | Issue | Severity |
|---|---|---|
| **SKB-020** | ✅ **FIXED** `e1e48cf` (2026-09-06). All three gated copies regenerated; `regen_generated.bat check` green, acceptance 48/48, goldens 67/67 + identical, demo `silent-test PASS`. The ungated fourth copy `skald-backend/tests/generated_audio.odin` has no source JSON and no consumer; D3 removed the citations that kept it — delete it and update the script header. | high |
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
