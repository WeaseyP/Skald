# Skald Bug Inventory — live frontier

Rewritten 2026-08-01 from the 27-agent 0.2 audit. This file is **bugs only** — places where the
code does the wrong thing. Design changes, missing features and quality-of-life work live in
`0.2-ROADMAP.md`; every entry below cross-references its roadmap packet (A/B/C/D IDs there).

Rules of this file:

- Deduplicated: where several audit findings describe one defect, one entry lists all IDs.
- Severity reflects verified user impact after the C1 adversarial re-verification pass — and
  after the final adversarial pass (D2), which corrected C1 itself in one place (SKB-028) and
  added three findings no tier agent had (SKB-000, SKB-057, and the A5 glob correction). Items
  marked **measured** or **reproduced** were demonstrated against the real toolchain, not
  inferred from reading.
- The example corpus: **99 JSON files = 80 `.skald.json` + 19 bare `.json`; 98 graph-shaped, 1
  project-shaped; 26 unplayable (25 instrument-less + the project-shaped file the editor rejects at
  parse); 1 fails codegen (`archive/PulsarBeam.json`)**.
  **Corrected 2026-08-01, and the correction is the lesson.** This rule previously declared
  "101 = 80 + 21" *verbatim and authoritative* and dismissed 62, 75, 81 and 94 as wrong. The 101 was
  itself wrong. Measured with `git ls-files 'examples/**/*.json'`: 99 at HEAD, and **63** at
  `af6500c` — the pre-audit tree — so the "62" it dismissed was nearly right for the tree it was
  measured against, and the replacement figure was off by two. Everything else in the original
  reconciled exactly. **Stop treating any count here as authoritative:** it is commit-dependent, and
  five different numbers have now been asserted with confidence. The corpus gate
  (`skald-ui/src/tests/corpus/`, packet A5) globs and never hardcodes a count, and its only
  numeric assertion is that an empty enumeration fails loudly. Quote the gate, not this line.
- The previous contents of this file are preserved at the bottom as **closed history**. Every one
  of those checked items was independently re-verified as still fixed (zero regressions), with
  one caveat noted there.

Severity: **critical** = silent wrong audio, data loss, or the product's core loop broken ·
**high** = a feature is wrong or a user will lose work/trust · **medium** = wrong behaviour with
a workaround or narrow reach · **low** = real but small.

---

## Wave A remediation pass — 2026-08-01

Twenty-three entries closed, on branch `review-fixes`, commits `c4c30e0`..`05b52ea`. Each was verified
by neutralizing the fix and re-running the test, or by the before/after measurement quoted below —
not by reading the code and agreeing with it.

| Entry | Fix | Commit |
|---|---|---|
| SKB-000 | The audited tree is committed and CI-gated; **no compiler is tracked at all** now, which is the only form of the answer that holds | `5deff6b`, `c6a1fbb` |
| SKB-001 | Binary untracked and built by `prestart`; identity is a content digest over all 8 backend sources, not a version constant; the app refuses a mismatch on three surfaces | `c6a1fbb` |
| SKB-037 | Non-Latin and emoji names no longer collapse to indistinguishable underscore runs; falls back to the sanitised node id | `84ecfc6` |
| SKB-052 | The `if unison_count > 0` guard that could never be false is gone; the sibling grep correctly rejected four look-alikes | `84ecfc6` |
| SKB-003 | Deterministic instrument order + a double-run `fc /B` gate. Reproduced first: 6 distinct outputs / 14 runs, differing per binary; after, 1 hash / 32 runs / 2 binaries | `1a46357` |
| SKB-027 | Worklet checks `skald_set_param`'s return; `canApplyParamLive` takes the value; name buffer 64→128 asserted at the boundary | `f769168` |
| SKB-038 | Rebuild generation id — a stale rebuild can no longer swap into a post-Stop worklet | `f769168` |
| SKB-046 | Oscilloscope buffer from `fftSize`, not `frequencyBinCount` | `f769168` |
| SKB-047 | Odin probe async + negative results cached 30 s; the old path re-ran a *synchronous* spawn per attempt | `53b807c` |
| SKB-057 | Vendored `.tools/` toolchain resolved ahead of PATH; `SKALD_ODIN` persisted at User scope; loud actionable failure on two surfaces | `53b807c` |
| SKB-032 | Group paste remaps `parentId` through the id map and drops `parentId`/`extent` when the parent was not copied | `20d6d02` |
| SKB-033 | Create Group honours the promise its enabled button makes | `20d6d02` |
| SKB-043 | **Finding corrected — see the entry.** The flip landed, but the reachability claim was wrong | `08d5875` |
| SKB-044 | Reverb `preDelay` on the node card, plus a card ⊇ sidebar parity test that also caught Oscillator `phase` | `08d5875` |
| SKB-049 | Glide 0–5 on both sides (UI widened; narrowing would clamp saved patches) | `08d5875` |
| SKB-051 | Noise `amplitude` override; an exposed-but-unstored value emitted 0.5, now 1.0 | `08d5875` |
| SKB-034 | Save is atomic — temp file then rename. Proven by simulating a real partial write: without the fix the pre-existing good save is left as `{"n` | `ed4c873` |
| SKB-035 | Saved viewport restored on load, `fitView()` for older or malformed saves, both after the nodes commit | `ed4c873` |
| SKB-036 | `packageName` round-trips through `SessionSettings`; absence leaves the current value alone, no migration | `ed4c873` |
| SKB-022 | Expose toggle sends a delta, not a closure-captured spread; deleting the three bypasses also found mapper and midiInput disagreeing with the shared path | `24a05e4` |
| SKB-008 | One ordered history behind a labelled `pushHistory`; all seven defects with individual neutralize-and-rerun evidence | `8e44c86` |
| SKB-004 | `Maybe(T)` presence signal: absent → 1.0, authored 0 → silence. Rendered peak 0.294 → 0.000, measured on a shipped file | `05b52ea` |
| SKB-002 | `build_project_from_graph` deleted; one reader via a pure normaliser. The collapse changed no output — goldens byte-identical, 201/201 corpus green | `05b52ea` |

Partially closed, still open above: **SKB-024** (the UI reads the right default; the range-table half is deliberately deferred — it
makes shipped patches 6 dB louder, and the A8 gate now pins it red rather than letting it pass),
**SKB-026** (the Piano Roll's range is documented correctly now; out-of-range notes are still
invisible), **SKB-020** (three of the four tracked `generated_audio.odin` copies regenerated and now
gated by `regen_generated.bat`; one is deliberately left stale because two manual chapters cite it by
line number and re-pointing those is A9/Wave D — the gate names the exclusion out loud).

**SKB-050** (BPM bounds: UI 20–300 vs backend 20–999) is **closed 2026-08-01**, unified at 999. It is
the first bug the A8 parity gate ever caught *and* saw retired: the gate pinned it as an allowlist entry
recording both sides' values, designed to go stale — and fail — the moment either side moved, including
when someone fixed it. It did exactly that, and the fix retired the entry in the same change.

Three defects the *fixes themselves* introduced or exposed, all caught before landing and worth
recording because they are the failure mode this pass is meant to break:
the all-underscore identifier fallback forced `allow_leading_digit`, which emitted
`1785492489424_0_amplitude: f32,` for an imported node with a Japanese label — code Odin rejects
outright, i.e. a hard build failure where the old bug merely collided silently (`84ecfc6`);
a golden-only fixture dropped in the flat `tests/fixtures/` directory turned the acceptance suite red,
because anything there is automatically an acceptance fixture and fails on an unknown name
(`b901bbc`); and A8's defaults test initially passed **vacuously** — keyed with a NUL, looked up with
a space, so all 30 comparisons hit `continue` — now guarded by a coverage-floor assertion (`6ce28f3`).

Two defects found *while* fixing these, both closed in the same pass and neither previously filed:
the topology signature masked live params to `null` while `JSON.stringify(NaN)` is also `null`, so a
value→NaN edit produced an identical signature and neither the live path nor the rebuild path fired
(`f769168`); and the release docs had been moved into `examples/docs/` while
`.github/workflows/release.yml` still read notes from `docs/releases/$tag.md`, so every release draft
would have shipped with no notes (`c4c30e0`).

---

## Critical

- [x] **SKB-000 — The audited tree is not the committed tree: 17 untracked paths and 10 modified files, including the audit's own ground truth.**
  Verified by the coordinator against the working tree: `git ls-files "*.exe"` returns exactly
  one file — `skald-ui/skald_codegen.exe` (1,153,536 bytes, 2026-07-24), the stale binary
  (SKB-001) — while `skald-backend/codegen.exe` (1,161,216 bytes), the fresh compiler **every
  tier-3 agent used as empirical ground truth**, is untracked and exists only on this machine.
  Also untracked: two source modules imported by shipped code (`stepMetrics.ts`, imported by
  `SequencerToolbar.tsx`; `useElementWidth.ts`), the entire `docs/manual-source/` chapter set the
  audit measured the code against, `docs/CODEX-REMEDIATION-BRIEF.md`, and `examples/snes-kit/`.
  Consequences: no second party can reproduce this audit; a clean clone does not build the same
  product; no release can be cut from this tree. (A few untracked paths — `docs/manual/`,
  `scripts/manual/`, `src/main/dialogDefaults.ts` + test — were created by the coordinator during
  the audit and are expected; the pre-existing ones are the problem.)
  **Progress, earlier the same day.** Committed on `review-fixes` in eight commits
  (`3a4ab40`..`e941703`): the manual sources, `scripts/manual/`, `snes-kit/`, the CODEX brief, both
  untracked source modules, the 10 modified files as deliberate commits, and the audit documents
  with the 27 source reports under `docs/audit/0.2/`. `git status` clean, 174 tests and `tsc
  --noEmit` green. `docs/manual/` is now gitignored as build output (packaging builds it — B6).
  **FIXED 2026-08-01.** The last two pieces landed: the untracked-files CI step (`5deff6b`, one per
  job, failing on stray paths under `docs/`, `examples/`, `skald-backend/`, `skald-ui/src/`), and the
  binary question, answered by A2 (`c6a1fbb`) in the only way that holds — **no compiler is tracked
  at all**; both are built from source by the same path contributors use, and CI fails if any build
  artifact is tracked. The audit's ground-truth binary is no longer "one local file" in the sense
  that mattered: it is reproducible from the tree, and its identity is checkable via the `-version`
  digest.
  *Findings:* D2-2 (post-audit), subsuming F-C1-6. *Roadmap:* **A1** (§3.2), completed by **A2**.

- [x] **SKB-001 — The committed codegen binary is stale; in the committed tree every exposed-parameter knob is a silent no-op during playback.**
  `skald-ui/skald_codegen.exe` is tracked (`.gitignore:2` ignores `*.exe`, `:7` un-ignores this
  one) and is what the app spawns for preview and Generate (`skald-ui/src/main.ts:70-73`,
  `forge.config.ts:20`). Last committed 2026-07-24 (`af6500c`); nine commits to
  `skald-backend/core/` (51 repository commits) behind. It predates the `"<nodeId>::<param>"`
  set_param alias — the only key the UI ever sends (`projectSerializer.ts:222`,
  `useWasmAudioEngine.ts:255-262`) — so `set_param` returns false, the worklet discards the
  result (`skaldWasm.worklet.ts:114`), and `topologySignature`'s masking guarantees no rebuild
  fires (`projectSerializer.ts:236-248`). **Reproduced** by A/B-diffing both in-repo binaries on
  identical fixtures: the shipped binary also lacks the voice-steal anti-click fix (`if !stolen`
  guard), the Reverb pre-delay implementation, and the Mixer exposed-level fix — CI validates a
  binary users never run. Also the root cause of SKB-020.
  *Findings:* F-C1-1, F-C3-1, F-C4-1, F-C4-2. *Roadmap:* **A2** (+A6 for the silent-failure
  hardening that let this hide). **Ordering:** the fix (untrack the exe, build on `prestart`)
  must land *after* SKB-057's toolchain-resolution fix, or "preview silently broken" becomes
  "app will not start" for the documented setup path (roadmap §4.8).
  **FIXED 2026-08-01 in `c6a1fbb` (packet A2).** The binary is untracked (`git ls-files -- '*.exe'`
  is empty), built by `prestart`/`premake` via `scripts/ensure-codegen.mjs`, and identified by an
  FNV-1a-64 digest over the bytes of all 8 backend sources rather than a version constant — a
  hand-bumped constant would have read the same through all nine stale commits and *certified* them.
  The app refuses to spawn a mismatched binary on three surfaces (launch box, preview rejection to
  the on-canvas banner, before the Generate spawn), and five CI steps gate provenance, including one
  that fails if any build artifact is tracked at all — one `git add -f` would otherwise put a stale
  compiler back. Closed empirically, not by inspection: on one fixture the committed blob emitted
  `attack_start = 0` (voice-steal click re-introduced) against `3` from a fresh build, and the
  committed binary exits 1 on `-version`.
  **Correction to this entry's earlier status note:** it claimed `build_codegen.bat` overwriting the
  tracked file was what tripped the untracked-files gate from `5deff6b`. It never could have — that
  step's pathspec is `skald-ui/src`, and the binary sat at `skald-ui/`. Nothing in that job built the
  CLI either. The comment in `ci.yml` carried the same error and is fixed.

- [x] **SKB-002 — The CLI/bare-graph ingestion path silently discards the session (tempo, master volume, pattern length) and every P-lock.**
  100 of 101 files under `examples/` are bare-graph shaped and route through
  `build_project_from_graph`, which hardcodes `project.bpm = 120` (`json.odin:298`) and
  `master_volume = 1.0` (`:299`), never sets `pattern_steps`, and never reads the `session` block
  the editor writes (`useFileIO.ts:76`). **Reproduced**: a `"session": {"bpm": 140}` patch emits
  `p.bpm = 120.000000000`. Separately, `Note_Event.patch_overrides` (`types.odin:19`) never
  matches the editor's `patchOverrides` key, so every P-lock in every editor save is dropped on
  this path — verified on `examples/songs/loops/geowars/hat-static.skald.json` (zero `set_param`
  calls in the emitted sequence). `examples/AUDIT.md` certified the corpus through exactly this
  lossy path. The editor's own Generate button is unaffected (always emits the `project` wrapper).
  (Corpus definition: 101 JSON files = 80 `.skald.json` + 21 bare `.json`; 100 graph-shaped,
  1 project-shaped.)
  **Step 1 fixed 2026-08-01 in `8e2c071`; the entry stays open for step 2.** The graph path now reads
  `session` (bpm/masterVolume/patternSteps), resolves the `patchOverrides` alias for `Note_Event`, and
  warns loudly when a file has no session block at all. Measured on shipped files:
  `wobble-samplehold-bass` went from `p.bpm = 120` / master `1.0` to `140` / `0.7`, and
  `geowars/hat-static` from 0 P-lock `set_param` calls to 4. 98 of 99 examples generate; the one
  failure (`archive/PulsarBeam.json`) fails identically at HEAD.
  **Still open:** step 2 — collapse the graph path into a normaliser over `build_project_from_raw` and
  delete the structural sniffing, so there is one reader rather than two that merely agree today. One
  real decision blocks a naive collapse: the raw path does not clamp `master_volume` (it relies on
  codegen treating `<= 0` as absent) while the graph path now does, because absence is only knowable
  at parse time and a session-less legacy file must keep exporting at unity. That collides with
  SKB-004/packet B1, which has to make an authored `0` mean silence — and `Session_Raw` cannot yet
  distinguish "absent" from "authored zero", because Odin's unmarshaller does not report key presence.
  **Step 2 done 2026-08-01 (`05b52ea`): `build_project_from_graph` is deleted.** Its replacement is a pure
  normaliser into `build_project_from_raw`, and `main.odin`'s try-both-unmarshals sniffing is replaced by a
  declarative top-level key check. There is one reader now, not two that agree. The collapse changed **no**
  output: all goldens byte-identical and 201/201 corpus tests green across it.
  *Findings:* F-C3-2, F-C2-7, F-C1-5. *Roadmap:* **A4** (both steps done).

- [x] **SKB-003 — Codegen output is non-deterministic on the bare-graph path; regenerating the same file can reassign which instrument is asset 0.**
  `build_project_from_graph` iterates `graph.nodes` (a `map[string]Node`) unsorted
  (`json.odin:303`, `:331`) against the codebase's own written warnings
  (`graph_utils.odin:9-14`). **Reproduced**: 14 runs of the unmodified
  `examples/songs/full/four-bar-song.skald.json` across two independently built binaries → six
  distinct byte-outputs; the wasm shim's `skald_note_on`/`skald_trigger(asset: i32)` dispatch
  order permuted with them (Kick/Pad/Bass/HiHat/Lead in four different orders). A game can be
  wired to the wrong instrument by a rebuild with no edits.
  *Findings:* F-B04-1, F-C3-3, F-C4-9. *Roadmap:* **A3**.

- [x] **SKB-004 — Master volume of exactly 0 exports at full volume.**
  The dock slider reaches 0 (`SequencerDock.tsx:211`, `min="0"`); `projectSerializer.ts:110`
  passes it through with no floor — while instrument volume is floored at `:197-199` *with a
  comment explaining precisely this hazard* — and the backend treats `<= 0.0` as "field absent"
  and substitutes `1.0` (`codegen.odin:2455-2456`). **Reproduced**: `master_volume: 0` emits
  `tanh(mixed_left * 1.000000000)`. A deliberately muted project ships loud.
  **FIXED 2026-08-01 (`05b52ea`, packet B1-backend).** `Maybe(T)` session fields give the parser a presence
  signal, so absent → 1.0 and authored 0 → 0.0, resolved in one proc both readers share. Measured on
  `geowars/hat-static`: authored 0 rendered peak **0.294 before, 0.000 after**; absent still renders 0.286.
  **Changelog-visible:** a patch saved at `masterVolume: 0` now exports silent, and the generator warns on
  stderr every time, naming both the old and new behaviour. An explicit JSON `null` counts as absent, which
  matters because a UI NaN serialises to null.
  *Findings:* F-A05-1 (+F-B11-5: no test exercises the value). *Roadmap:* **B1**.

- [x] **SKB-005 — Load destroys the session in one click, and one Ctrl+Z immediately after Load destroys the *newly opened* project's sequencer data.**
  `handleLoad` replaces nodes/edges and clears undo with no dirty check, no confirmation, no
  title-bar state, no autosave (`useFileIO.ts:114-136`; no `confirm(` anywhere in
  `skald-ui/src`). Worse: `app.tsx:169-180` clears only the *graph* stack, while `loadTracks`
  **pushes** the pre-load tracks onto the sequencer stack (`useSequencerState.ts:169-172`) — so
  Ctrl+Z after Load swaps in the previous project's tracks, and `useInstrumentRegistry.ts:31-35`
  prunes them as orphans and re-adds empty ones. Every note in the just-opened file, gone,
  unrecoverable.
  **Half fixed 2026-08-01 (`8e44c86`, packet B3).** The undo half is closed: Load now resets one ordered
  history, and `LoadThenUndo.test.tsx` asserts the opened file's nodes, tracks and notes survive Ctrl+Z —
  comment out `resetHistory()` and it fails with the previous project back on screen.
  **Closed 2026-08-01 (packet B4, uncommitted).** The guard half is now closed too, on B3's exposed
  `isDirty`/`editsSinceSave`/`markSaved()`/`captureSnapshot()`. The dirty check is the *first* statement of
  `handleLoad`, so a decline aborts before the file picker opens — no IPC, no state mutation, no history
  reset. `useWindowTitle.ts` marks unsaved state as `* Skald` (Electron mirrors `document.title`, so no
  main-process change). `useAutosave.ts` debounces `captureSnapshot()` to `localStorage` keyed on
  `editsSinceSave` rather than `isDirty` — Undo/Redo flips the boolean without new content, so keying on it
  would schedule redundant writes — and is guarded against wiping a crash record on first render.
  `app.tsx` renders a Restore/Dismiss recovery banner. Tests 543 → 559 green, corpus 201/201.
  Stub the guard to `if (false && history.isDirty)` and 3 of 4 `LoadConfirm.test.tsx` tests fail
  (confirm never invoked; `loadGraph` fires past the bypassed guard).
  *Note:* the confirm uses injected `window.confirm` — a real native dialog in Electron's renderer, stubbable
  in tests. `NamePromptModal` resolves via `onConfirm`/`onCancel` props on a mounted component and cannot be
  `await`ed from `handleLoad`; retrofitting it for one yes/no question was judged not worth threading modal
  state through `app.tsx`. Revisit if a promise-based dialog primitive ever lands.
  *Findings:* F-C4-5, F-B06-2 (as strengthened by C1), F-B07-4. *Roadmap:* **B3** + **B4**.

---

## High

- [x] **SKB-006 — The generated API advertises setters, PARAMS rows and P-lock targets for parameters the DSP provably never reads.**
  The exposure pass keys on parameter name + node type only (`codegen.odin:1216-1283`) and never
  reads `bpmSync`/`fixedPitch`, while the generators bake those branches at codegen time
  (`bpm_sync_seconds_expr` `codegen.odin:35-58`; oscillator `fixedPitch` `:137`, `:483`).
  **Reproduced** in emitted code: a synced LFO with exposed `frequency` gets a struct field,
  typed setter, `_PARAMS` row and `set_param` case — and `p.frequency` is never read. P-locks
  union into the same list (`:971-999`), so a user can mint dead public API from the step editor
  without ever clicking expose. Instances: LFO `frequency`, S&H `rate` (exposed by default),
  Delay `delayTime` under sync; oscillator/wavetable `frequency` without `fixedPitch`.
  **Closed 2026-08-01 (packet B2, uncommitted).** `param_is_reachable(node, param)` mirrors the exact
  branches the generators already hard-code, and `effective_exposed_params` now filters *both* the
  `exposedParameters` loop and the P-lock union loop through it — so a P-lock can no longer resurrect a
  dead parameter. Every (type, param) pair outside the four named instances defaults to reachable.
  **Two severities, deliberately.** A P-lock resolving to an inert parameter is a hard `os.exit(1)` naming
  node, parameter and reason: an authored automation instruction that silently does nothing is the exact bug
  class the P-lock resolver exists to kill, and its own comment says so. A dangling `exposedParameters`
  checkbox is a non-fatal stderr warning instead (alongside `warn_graph_output_count`/`warn_unreachable_nodes`)
  — toggling `bpmSync`/`fixedPitch` without revisiting the checkbox is routine editing, and hard-failing it
  would break every default-shipped Oscillator/Wavetable node.
  **Goldens: 122 lines across 5 files, all classified**, 41 rewritten byte-identical. 90 lines are direct
  removal (struct field, init, setter, `_PARAMS` row, dispatch cases) of Oscillator `frequency`, dead by
  default without `fixedPitch`. The remaining **32 in `fm_patch` are a second-order rename, not new
  behaviour**: dropping Carrier's dead `Carrier_frequency` takes the same-name collision count for
  "frequency" from 2→1, so the *pre-existing* naming logic reverts FmOperator's live ratio param from
  `FM_frequency` back to plain `frequency`. The value is unchanged and still live — but note this **renames a
  live symbol in the generated public API**, so anything linking `FM_frequency` breaks. Worth a changelog line.
  Unit tests 45/45; forcing the predicate always-true fails 8, always-false fails 14 (both directions
  covered). Golden check 46/46, acceptance 31/31 FFT fixtures, corpus 201/201 — no audio behaviour moved.
  *Findings:* F-B02-1/2, F-A03-1/2, F-A07-4 (reachability corrected by F-B02-4), F-C2-4, F-C5-3.
  *Roadmap:* **B2**.

- [x] **SKB-007 — `syncRate` is exposable in one click; exposing it emits a dead ±1e6 setter into the public API *and* makes the Sync Rate dropdown inert in the preview, persistently.**
  The three `syncRate` wrappers omit the `isExposable=false` flag
  (`NodeParameterControls.tsx:159`, `:172`, `:185`; default is true at
  `ParameterPanel.tsx:216-222`). **Reproduced**: exposed `syncRate` falls to the unknown-param
  range `{-1e6, 1e6, 0.0, ""}`, emits `set_syncRate` writing a field the DSP never reads, and in
  the editor the value is masked out of the topology signature while `Number("1/8")` is NaN — so
  neither the instant path nor a rebuild ever applies the change. Persists in the save file.
  **Half closed 2026-08-01 (`08d5875`).** All three wrappers now pass `isExposable={false}`, and a
  load-time scrub removes a stray `syncRate` from a saved patch's `exposedParameters` — recursing
  into `node.data.subgraph.nodes`, without which it is a no-op, since nearly every BPM-syncable node
  lives inside an Instrument. Stored *values* are untouched; only the exposure claim goes.
  **The P-lock route is still open**: `StepPropertiesEditor` ignores `isExposable` entirely, so the
  step editor still offers a `syncRate` P-lock, and P-locks union into the same exposure list in
  codegen — a P-lock can still mint the dead ±1e6 setter. No UI-only change closes that; it needs
  B2's hard error on a P-lock resolving to an inert parameter.
  **Closed 2026-08-01 (packet B2 follow-on, uncommitted).** `param_is_reachable` now short-circuits
  `syncRate` to `false` *unconditionally* for LFO/SampleHold/Delay — unlike `frequency`/`rate`/`delayTime`
  it is not gated by `bpmSync`, because no configuration ever makes it live. **Premise verified before
  coding:** all three consumers reach it only via `bpm_sync_seconds_expr` → `get_string_param`
  (`param_utils.odin:237`), which reads straight off `node.parameters`, never through
  `graph.exposed_resolutions` or a `p.<field>` reference; no `p.syncRate` exists anywhere, and a
  checkbox-exposed `syncRate` was confirmed against a real emitted `.odin` to produce no field, setter or
  dispatch case. `param_dead_reason` gained a `param` argument — the node-type-only switch could not
  distinguish LFO's two *different* dead params (`frequency`, gated by bpmSync, vs `syncRate`, dead always)
  and would have misreported one as the other. The follow-up advice branches too: "toggle BPM Sync" is
  actively wrong here, since no toggle ever makes `syncRate` live.
  Unit tests 51/51 (26 in `param_reachability_test.odin`, up from 20); deleting the three `syncRate`
  short-circuits fails 5 test functions, e.g. *"a P-lock on syncRate must never resurrect it, synced or
  not"*. Goldens 46/46 unchanged — **expected**, since no fixture exposes or P-locks `syncRate`
  (`filter_sweep.json` stores a value but with `exposedParameters: []`). Acceptance 31/31, corpus 201/201.
  Hard error verified end-to-end via `codegen.exe`: crafted fixture exits 1; same fixture minus the P-lock
  exits 0, drops the checkbox exposure with a warning, and keeps `amplitude`.
  *Note:* `patch_overrides` is `map[string]f32` (`types.odin:20`), so a `syncRate` P-lock's value could never
  have held the string division (`"1/4"`) it is meant to represent — the route was nonsensical at the schema
  level, not merely unreachable. Orthogonal to this fix (the error fires on the node+param key, before the
  value is read), but it argues the schema should stop accepting the key at all.
  *Findings:* F-C1-2. *Roadmap:* **A7 item 5** (done) + **B2** (the remaining half).

- [x] **SKB-008 — Undo is unreliable in seven distinct ways; the most common editor gestures leave no undo entry.**
  (1) Two independent stacks popped by one Ctrl+Z (`app.tsx:209-228`; graph capped at 50,
  sequencer unbounded — divergence guaranteed). (2) Drag snapshots on the last tick, so undo
  moves a node a few pixels (`useGraphState.ts:81-83`). (3) Palette drop untracked
  (`useNodeComposition.ts:44-64`). (4) Import Patch untracked (`useFileIO.ts:195-197`).
  (5) "Export Step to Instrument" untracked (`app.tsx:342`). (6) BPM/steps/master volume in
  neither stack (`app.tsx:76,78,82`). (7) 500 ms wall-clock coalescing merges unrelated edits and
  splits slow drags (`useGraphState.ts:57-64`). Deleting an Instrument also hard-deletes its
  whole track with no confirm (`useInstrumentRegistry.ts:27-36`).
  **FIXED 2026-08-01 (`8e44c86`, packet B3).** One ordered history of `{nodes, edges, tracks, session}`
  behind a single labelled `pushHistory`; the second stack is gone. All seven defects have their own
  neutralize-and-rerun evidence — restoring the key-blind 500 ms timer alone fails 10 tests, including both
  opposite symptoms it produced (unrelated edits merged, a 2 s drag split into five).
  *Findings:* F-C4-6 (consolidating F-B01-2/3/9, F-B07-1/2/3/9, F-B09b-5). *Roadmap:* **B3**.

- [ ] **SKB-009 — Renaming or deleting a P-locked node makes the whole build fail, and the orphaned override is invisible in the UI.**
  `collect_plock_targets` exits 1 on any unresolvable key (`codegen.odin:911-954`); the Step
  Properties editor filters stale keys out of its own display (`StepPropertiesEditor.tsx:161-169`),
  so there is nothing to click to fix it. Breaks the live preview too (same codegen path).
  **Reproduced**: `"F2:cutoff"` → exit 1 after renaming F2.
  *Findings:* F-B01-5. *Roadmap:* **B5**.

- [ ] **SKB-010 — A track's steps can exceed the global pattern length; the extra steps are mathematically unplayable and fully editable.**
  `current_step` ranges over `[0, global_steps)` (`codegen.odin:2218-2227`) so per-track cases
  ≥ global are dead code (**reproduced**: `case 20:` emitted beside `if p.current_step >= 16`,
  `odin check` silent). The Step Grid widens to show the dead steps as editable
  (`StepGrid.tsx:83`, `:256-257`), the Piano Roll has no knowledge of global length at all
  (`SequencerDock.tsx:248`), and *lowering* the toolbar Steps strands already-composed notes.
  *Findings:* F-B01-1 (+C1 additions). *Roadmap:* **B5**.

- [x] **SKB-011 — Preview and export disagree on master volume: the export is always louder and less saturated than what was tuned by ear.**
  Preview bakes `master_volume = 1.0` and applies the slider as a post-worklet JS GainNode
  (`useWasmAudioEngine.ts:92-95`, `:191-196`) → plays `vol·tanh(x)`; export plays `tanh(vol·x)`.
  Since tanh is concave, `tanh(v·x) ≥ v·tanh(x)` for all v∈[0,1]: at v=0.5, peak 2.0 → preview
  0.482 vs export 0.762 (+4 dB, different waveform). Default masterVolume is 0.8 (`app.tsx:82`),
  so every project diverges out of the box.
  **Closed 2026-08-01 (packet B1, editor half, uncommitted).** The backend half was already shipped —
  `codegen.odin` emits `skald_set_master_volume`/`skald_get_master_volume` and SKB-004's `Maybe(f32)`
  resolution was already correct — so the whole bug lived in the editor. The post-worklet `GainNode` is
  **deleted**, not flagged off: `node.connect(analyser)` directly, no `masterGainState`, and
  `SequencerDock.tsx` no longer takes a `masterGainNode` prop or touches `gain.setTargetAtTime`. The slider
  now runs doc state → `port.postMessage({type:'set-master-volume'})` → `ex.skald_set_master_volume()`,
  following the existing `set-loop`/`set-param` convention rather than a new bridge. That lands on the same
  `wasm_master_volume` global `skald_process` multiplies in *before* `skald_soft_limit` (`codegen.odin:2916`)
  — the identical mix point `project_process` uses for export (`:2676-2678`). Preview is now the export.
  `buildModule` still bakes `1.0` as a topology-neutral placeholder so dragging the fader never forces a
  rebuild, and the worklet reapplies the live value after *every* `skald_init`, covering hot-swaps.
  Seeding uses `typeof === 'number'`, never `??`/`||`, so an authored `0` is real silence and SKB-004 cannot
  reappear on this path. Tests 559 → 566 green, corpus 201/201. Drop the reapply after `skald_init` and the
  hot-swap test fails `expected 1 to be 0.3`; drop the seed and 7 fail, including `expected 1 to be +0`.
  *Findings:* F-B08-1 (direction corrected by C1), F-C3-7. *Roadmap:* **B1**.

- [x] **SKB-012 — Instrument Unison/Detune is silently inert for Wavetable and FM Operator sources.**
  `generate_wavetable_code` (`codegen.odin:477-512`) and `generate_fm_operator_code` (`:414-475`)
  contain no unison reference; phase state is scalar (`:1136`) vs Oscillator's
  `[max(unison,1)]f32` (`:1117`). Same two always-visible sliders, one node type responds. No
  warning anywhere.
  **Closed 2026-08-01 (uncommitted). C5's open question decided: EXTEND, and — user's call — shipped
  UNGATED.** Both generators now mirror `generate_oscillator_code` exactly: `[max(unison,1)]f32` phase
  array, linear cents spread `(i/(N-1)-0.5)*2*detune` gated behind `N>1`, `freq * 2^(detune/1200)`, and
  **linear `/N` gain compensation — not `sqrt(N)`**. Matching that divisor is what keeps a wavetable at
  unison=N level with an oscillator at unison=N; guessing RMS here would have been a worse bug than the one
  being fixed. Fresh-voice reset went `= 0.0` → `= {}`.
  **Note the control is instrument-level, not per-source** — it sits beside `voiceCount`/`glide` on the
  instrument, and the source lives in its `subgraph`. So one instrument can hold a mix
  (`crunch-rhythm` has an oscillator *and* an fmOperator), which is why "grey out the slider for
  Wavetable/FM" was never coherent: the control was half-live, not dead.
  **Blast radius — exactly 2 instruments change sound**, from a 17-file universe cross-checked two ways
  (recursive JSON walk for instrument `unison`/`detune`, plus a raw grep for `wavetable`/`fmOperator` type
  strings; both agree, nothing uncertain):
  `crunch-rhythm.skald.json` "Crunch Rhythm" (u=2, d=9 — the `cr-grit` fmOperator joins the stack its
  sibling oscillator was already in) and `pad-sequenced.skald.json` "Pad" (u=3, d=12 — the wavetable
  becomes a real 3-voice stack). **Both want re-auditioning.** Everything else with a wavetable/FM node
  sits at unison=1, where the detune branch never fires and the change is a numeric no-op.
  *Watch out:* `chase-loop.skald.json` looks affected and is not — its two unison=2 instruments
  ("SNES Crunch Guitar", "SNES Brass Stabs") are oscillator-only and already had unison; its only fmOperator
  is inside "SNES Echo Bell" at u=1.
  **FM's modulator is a decision, not a discovery:** `input_mod` stays one shared signal added identically
  to every detuned carrier rather than being re-detuned per voice — mirrors a real multi-carrier FM voice
  and is the smaller change. Pinned by a unit-test assertion so a silent future change is caught. Revisitable.
  Unit 59/59, goldens 48/48 (2 new), acceptance 33/33 (2 new FFT fixtures proving real energy at the
  ±1200-cent partials of a 3-voice stack), UI 567/567. Reverting the five edit sites fails the two new
  acceptance fixtures (`expected real energy at 220Hz... got 0.0163 vs center 194.5486`).
  Goldens for `fm_carrier_wire`/`wavetable_morph`/`fm_patch` at u=1 changed *structurally* (the unison wrap)
  while the audio is provably identical — the acceptance pass, not the golden text, is the evidence there.
  *Caveat:* `test_unison_detune_spread_gives_distinct_rates_per_voice` is pure arithmetic and was the one
  test not run through an explicit red/green cycle.
  *Findings:* F-A01-4 (FM scope added by C1). *Roadmap:* **C5** (extend or validate loudly — decided:
  extend, ungated; C5's remaining items — Wavetable PWM + phase, FM output level, Reverb `damping` — still open).

- [ ] **SKB-013 — The Panner is a −3 dB pad at the end of a chain and a pan-flavoured volume knob anywhere else; its backend stereo ports broadcast one channel to both outputs.**
  **Measured** (F-C2-2): osc→Output = 1.0/1.0; osc→Panner(0)→Output = 0.707/0.707; but
  osc→Panner(0)→Filter→Output = **1.0/1.0** and Panner(+1)→Filter→Output = 0.707/0.707 — adding
  a node after a Panner makes the patch louder and turns pan into a 0…−3 dB level control
  (`codegen.odin:727-733` downmix; `:2038-2045` routes the stereo pair only for Panner→Output).
  The editor exposes no `output_left`/`output_right` handles (`PannerNode.tsx:11`), and even the
  backend's ports for them fall into the mono-broadcast branch (`generate_graph_output_adds`) —
  a wire from `output_left` puts the left channel into *both* channels.
  *Findings:* F-C2-2, F-C1-7, F-A08-3 (−6 dB claim struck), F-B04-3. *Roadmap:* **B7a**.

- [ ] **SKB-014 — The flagship `four-bar-song` example is audibly broken twice over.**
  **Reproduced from the shipped file**: (1) the Kick's pitch envelope (`depth: 120` into
  `input_freq`, an exponent in octaves — `codegen.odin:159-163`) pins the oscillator at the
  +10-octave clamp for ~92% of its decay: note 24 renders at ~33.5 kHz — an alias burst, not a
  kick. (2) Lead, Bass and Pad all wire `midiInput.pitch → input_freq`, double-applying V/oct on
  top of note tracking: every octave becomes two octaves (8 occurrences in the emitted file).
  The file also carries no `session` block (F-B06-6), so it loads at whatever tempo the app was
  left at.
  *Findings:* F-C2-11, F-A05-5, F-B06-6. *Roadmap:* **B8**.

- [ ] **SKB-015 — `sax3.json` double-transposes pitch and zeroes its own release — unfixed across three review rounds.**
  `examples/instruments/winds/midi-setup/sax3.json:231-242`: `pitch → input_freq` (double V/oct)
  and MIDI Gate wired into the ADSR's audio-multiply `input` (the port is labelled "Gate" but is
  the multiplicand — F-A09-3), which multiplies the release tail by zero at note-off.
  *Findings:* CODEX W2/B6, F-B09a §Q2, F-A05-5/6. *Roadmap:* **B8** (with the Gate→In relabel,
  A7 item 13).

- [ ] **SKB-016 — `<Asset>_is_playing` cannot see Delay/Reverb tails; the README's documented pooling idiom truncates every tail.**
  The predicate checks only `p.playing` and voice activity (`codegen.odin:1651-1662`) while the
  bus block deliberately runs on after the last voice dies (`:1933-1936`).
  `examples/integration_demo/README.md:88` tells hosts to pool on this signal; the demo papers
  over it with a hand-tuned 200 ms sleep — not enough for the default 3 s reverb decay.
  *Findings:* F-C2-6. *Roadmap:* **B7b**.

- [ ] **SKB-017 — A modulator crossing the voice→bus boundary has its depth multiplied by the live voice count and drops to zero between notes.**
  The cross-domain bridge sums per-voice values by emitted variable name
  (`codegen.odin:1074-1088`, `_vsum` at `:1907`, consumed at `:1950`) with no audio/control
  distinction. **Reproduced**: an LFO into a post-Delay filter's `input_cutoff` → 0 voices = no
  wobble, 4 voices = 4× depth at history-dependent phase. The code states the correct principle
  for MidiInput (`:105-116`) and applies it to exactly one node type.
  *Findings:* F-C2-5. *Roadmap:* **B7c**.

- [ ] **SKB-018 — `<Foo>_init` does not do what its own comment promises: Delay buffers, the entire voice array, and all bus-domain node state survive a re-init.**
  The clear loop is gated `if node.type != "Reverb" do continue` (`codegen.odin:1375-1383`)
  while Delay declares identically named buffer fields (`:1182-1184`); nothing touches
  `p.voices`; bus-domain filter/distortion/LFO/S&H state (`:1192-1213`) is written by nothing
  but its own per-sample update. **Reproduced**: generated `_init` body is five scalar
  assignments. Invisible in the editor (fresh wasm instance each build); live for any game that
  reuses a processor.
  *Findings:* F-B03-1 (downgraded but real), F-C2-9, F-A07-3. *Roadmap:* **B7d** (Delay-buffer
  half also in A7 item 10).

- [ ] **SKB-019 — 26 of 101 shipped examples cannot be played from the editor, and a codegen-hard-failing example ships in every packaged build.**
  Files with no Instrument node throw "No instruments on the canvas…" on Play
  (`useWasmAudioEngine.ts:96-98`) — including the two files the manual's spine chapters open
  with. `forge.config.ts:20` copies the whole `examples/` tree, including `archive/PulsarBeam.json`
  (**reproduced**: exit 1, unknown port `input_delayTime`) and `songs/loops/to implement/`; the
  Load dialog opens one folder away (`dialogDefaults.ts:107-110`).
  **Now detected, not fixed (2026-08-01, packet A5).** The corpus gate drives every example through
  the real editor path in CI, so each of these files fails visibly instead of surprising a reader. All
  26 are **quarantined by name** — 25 instrument-less files plus the project-shaped one the editor
  rejects at parse — with the premise pinned (0 instruments serialized) as well as the failure, and
  the list fails if an entry starts passing or its file disappears. `archive/PulsarBeam.json` is
  quarantined separately with its exact stderr symptom, so a *different* failure cannot hide behind
  the entry. **Nothing a user experiences has changed**: the 25 still refuse to play and PulsarBeam
  still ships in every packaged build. B6's auto-wrap is the fix, and when it lands the gate goes red
  demanding these quarantine entries be deleted — which is the intended pressure.
  (The "26 of 101" in the title is the count corrected in rule 3 above: 26 of 99.)
  *Findings:* F-C4-3, F-B06-5, CODEX W2/B1. *Roadmap:* **B6** (fix), **A5** (detection).

- [ ] **SKB-020 — Every checked-in `generated_audio.odin` (six copies, including the integration demo games copy from) is stale and re-introduces the fixed voice-steal click.**
  `grep -c attack_start` → 0 in all six; 3–6 in the corresponding goldens. Symptom of SKB-001 —
  they were generated *correctly* by the stale binary. Regenerating without fixing provenance
  reproduces the drift.
  *Findings:* F-B05-1 (root cause corrected by C3/C4). *Roadmap:* **A2**.

- [ ] **SKB-021 — A duplicate node id is renamed at parse time but connections still point at the first node — the parser's own warning admits it.**
  `json.odin:196-200`: *"Connections still target the first node with this id."* A colliding
  patch loads and compiles with wires silently resolved to the wrong node; the stderr line never
  reaches the UI.
  *Findings:* F-B09b-1 (verified live by C1, promoted). *Roadmap:* **B9** (hard error).

- [x] **SKB-022 — Toggling a parameter's expose checkbox can clobber a concurrent edit on the same node.**
  `toggleParameterExposure` writes a closure-captured full `{...nodeToUpdate.data}` snapshot
  (`ParameterPanel.tsx:209-210`) instead of a delta (its sibling `handleParameterChange` is
  already delta-based). Last-writer-wins race, user-reachable during any slider drag. The same
  file's inline mixer/mapper/midiInput branches also bypass `NodeParameterControls`, losing the
  mixer's `inputCount` control (`:338-377`).
  *Findings:* F-B09b-3 (verified live across two review passes, promoted). *Roadmap:* **B11**.

- [ ] **SKB-023 — A rebuild while holding notes silently kills them; nothing replays held MIDI/audition voices after the hot-swap.**
  `instantiate()` builds a fresh instance and `skald_start_all` restarts only Music Layers
  (`skaldWasm.worklet.ts:70-92`, `codegen.odin:2547-2555`). Edit a filter while holding a chord →
  the chord stops until re-pressed, with no error anywhere.
  *Findings:* F-B08-2. *Roadmap:* **B7f**.

- [ ] **SKB-024 — Exposing a Wavetable's amplitude you never touched changes the sound by −6 dB; the parameter's default has three different answers.**
  `WavetableParams` has no `amplitude` (`types.ts:48-54`) yet the card renders a slider
  (`WavetableNode.tsx:17`) — displaying **0** for the missing field (`ParamNode.tsx:105`) while
  unexposed codegen plays **1.0** (`codegen.odin:506`) and exposing it initializes **0.5**
  (`param_ranges.odin:88-89`). **Reproduced** by C3. One of ten live default divergences across
  `node-definitions.ts` / `param_ranges.odin` / codegen inline fallbacks (ADSR release 1.0/0.2/0.1,
  Reverb decay 3.0/0.1/0.5, Filter cutoff 800/800/1000, VCA gain 0.75/1.0/1.0, Mixer levels
  0.75/1.0/1.0, FM frequency 2/1/1, Mapper outMax 20000/1/1, Noise amplitude 1.0/0.5/1.0 …).
  **Half closed 2026-08-01 (`08d5875`), and the remaining half is deliberate.** `amplitude` is now
  in `WavetableParams`, the defaults and the default exposed set, and `ParamField` gained a
  read-time `default` so an existing save renders 1.0 — what codegen actually plays — instead of 0.
  Not done: the `param_ranges.odin` entry still says 0.5, byte-for-byte the same one-line shape as
  the Noise fix in SKB-051. It was held back because unlike Noise it is **not neutral for existing
  content** — a shipped patch with an exposed-but-unstored Wavetable amplitude generates at 0.5
  today, and correcting the table makes it 6 dB louder. That is an audible change to files users
  already have, so it wants A8's parity gate and possibly C1's version field, not a cheap-win batch.
  Fix, when someone owns the consequence: `case "Wavetable": if name == "amplitude" do return
  {0.0, 1.0, 1.0, ""}`.
  *Findings:* F-C3-4, F-B10-6. *Roadmap:* **A7 item 8** (done), **A8** (gate), **C2** (class fix).

- [x] **SKB-057 — The shipped v0.1.0 installer cannot preview audio for anyone, and the documented dev setup breaks the moment the setup shell closes.**
  Preview compiles Odin at runtime, and: `forge.config.ts:20` bundles **no Odin toolchain**;
  `findOdin` (`main.ts:178`) probes only `SKALD_ODIN` / `odin` on PATH / `C:\Odin\odin.exe` and
  **never looks in the repo's own vendored `.tools/` toolchain**; `setup-dev.ps1` sets
  `$env:SKALD_ODIN` **process-scoped**, so it evaporates when the user opens the new shell the
  script tells them to open. A packaged install, and a developer following the documented setup
  in a fresh terminal, both get an editor whose central promise — hear it before you ship —
  silently fails as a missing-compiler build error. Zero of 27 audit agents examined the packaged
  artifact. Elevated into the roadmap's critical set (§3.12) because it also **gates SKB-001's
  fix**: untracking the committed exe before this lands upgrades "preview broken" to "app will
  not start."
  *Findings:* D2-3 (post-audit). *Roadmap:* **A13** (before A2; roadmap §4.8), CI package-smoke
  job per F-C4-12.

---

## Medium

- [ ] **SKB-025 — Every step-editing surface except the Piano Roll addresses only "the first note at a step": chords cannot be edited, and right-click erase deletes an arbitrary chord tone.**
  `StepPropertiesEditor.tsx:69` (`.find()`), `StepGrid.tsx:10` (no pitch in the signature),
  `PianoRoll.tsx:322` (`pointerEvents:'none'`, no selection callback), and `app.tsx:302`
  (`handleExportStep`, same first-note bug — C1). Chords are created, saved and *played*
  correctly (`codegen.odin:2133-2145`); they just can't be edited per-tone.
  *Findings:* F-B01-8 (downgraded: no data loss). *Roadmap:* **B5**.

- [ ] **SKB-026 — Piano Roll rows cover MIDI 21–84 while the data model and numeric field accept 0–127; out-of-range notes are permanently invisible there.**
  `PianoRoll.tsx:20-21` vs `StepPropertiesEditor.tsx:190-194`.
  *Findings:* F-B01-7. *Roadmap:* **B5**.

- [x] **SKB-027 — The live-param masking predicate and the instant-apply predicate disagree by construction; the worklet's 64-byte cutoff contradicts the shim's 128-byte buffer and the test pins the wrong number.**
  `topologySignature` masks on a byte-length-only check (`projectSerializer.ts:227-241`, whose
  own comment states the invariant) while the instant path also requires finite-number and a
  matching generated case (`useWasmAudioEngine.ts:249-262`); `skaldWasm.worklet.ts:111` rejects
  >64 bytes against `codegen.odin:2530`'s `[128]u8`, and `WasmWorkletGuard.test.ts` asserts the
  wrong bound. Every future non-numeric exposed parameter becomes an inert control by default.
  *Findings:* F-C1-3, F-B08-5. *Roadmap:* **A6**.

- [ ] **SKB-028 — A nested Instrument is constructible, saves and reloads, then fails Generate/Play with `os.exit(1)` "unknown node type".**
  `useNodeComposition.ts:66+` never filters `type === 'instrument'` from selection; the
  serializer strips the *second-level* subgraph (`projectSerializer.ts:51`); the dispatch default
  exits with a message about code generators (`codegen.odin:1894-1901`). Clean rejection needed
  (~20 lines at validation time), not nesting. (C1: "hard-crash" overstated — both consumers
  handle the exit cleanly; it is a bad error for a constructible graph.)
  **⚠ Correction (D2, overruling C1): the recursive subgraph parser at `json.odin:203-222` is
  NOT dead code.** It is the only code path that parses *any* instrument's subgraph, on both
  ingestion paths (`main.odin:69`, `json.odin:281`); only the self-recursive call at `:218` is
  unreachable. Whoever implements the rejection must not delete the parser — acting on F-B04-2
  as originally written deletes working code (C3 warned the same independently).
  *Findings:* F-A09-6, F-B04-2 (as corrected), F-C3-5, D2-1. *Roadmap:* **B9**.

- [ ] **SKB-029 — `note_on`/`_trigger` accept any `u8` note (0–255) and any velocity, unclamped, while every exposed knob is clamped.**
  `codegen.odin:1394`, `:1443-1444`; velocity multiplies straight into `vel_scale`, note >127
  produces a silently wrong frequency.
  *Findings:* F-B05-5. *Roadmap:* **B7e**.

- [ ] **SKB-030 — An envelope-less voice hard-cuts to zero at duration expiry — an audible click on the default `_trigger()` of the simplest possible patch.**
  No-ADSR path: `voice.active = false` the sample `age >= duration` (`codegen.odin:1923-1930`);
  `_trigger` defaults duration to exactly 1.0 s for that same path (`:1593`).
  *Findings:* F-B03-5. *Roadmap:* **C6**.

- [ ] **SKB-031 — LFO phase, Noise pink-filter history and S&H counter/value are never reset on a fresh voice, unlike the five node types the reset switch covers — retriggers are history-dependent.**
  Reset switch cases (`codegen.odin:1477-1501`) cover Filter/Oscillator/FmOperator/Wavetable/
  Distortion only; the adjacent comment's own justification argues for including the other three.
  Two identical notes can render bit-different audio depending on unrelated play history.
  *Findings:* F-B03-2. *Roadmap:* **C6**.

- [x] **SKB-032 — Copy/pasting a Group with its children produces an empty new group; the pasted children re-attach to the *original* group.**
  `handlePaste` remaps edge endpoints through `idMap` but never `parentId`/`extent`
  (`useGraphState.ts:151-195`).
  *Findings:* F-B07-5. *Roadmap:* **A7 item 15**.

- [x] **SKB-033 — Create Group is enabled with one node selected, its tooltip promises success, and clicking does nothing.**
  `app.tsx:379` (`length > 0`) vs `useNodeComposition.ts:214-215` (`length <= 1` early return).
  Scoped as a one-line "no-risk warm-up" two remediation rounds ago; still open — fix first as
  the process canary.
  *Findings:* F-B07-7, F-B09a-3, CODEX W0. *Roadmap:* **A7 item 1**.

- [x] **SKB-034 — Save writes directly over the target file; a failed write destroys the previous good save.**
  `fs.writeFileSync` straight to the path (`main.ts:323-329`); no tmp+rename.
  *Findings:* F-B06-3. *Roadmap:* **B4** (or A7 item 18).

- [x] **SKB-035 — The saved viewport is written but never restored, and nothing re-fits after Load — a load can land on an apparently empty canvas.**
  `handleLoad` never reads `flow.viewport`; `fitView` applies only on initial mount
  (`useFileIO.ts:113-136`, `app.tsx:394-412`).
  *Findings:* F-B06-10. *Roadmap:* **A7 item 17**.

- [x] **SKB-036 — `packageName` never round-trips through save/load; every reload resets the export package to `generated_audio`.**
  `app.tsx:86` state, absent from `sessionSettings` (`app.tsx:149-151`) and `saveData`.
  *Findings:* F-B06-11. *Roadmap:* **A7 item 16**.

- [x] **SKB-037 — Non-Latin or emoji instrument/label names collapse to indistinguishable runs of underscores in every generated symbol.**
  `sanitize_identifier` maps per byte (`param_utils.odin:43-62`); **reproduced**: "キック" and
  "🎵🎵" → `_________Processor` / `__________Processor`. The empty-name fallback exists right
  next to it and isn't used for this case.
  *Findings:* F-B04-5. *Roadmap:* **A7 item 19**.

- [x] **SKB-038 — A rebuild that resolves after Stop→Play can hot-swap the *pre-stop* graph's wasm into the fresh worklet.**
  Only guard is `if (!workletNode.current)` (`useWasmAudioEngine.ts:279-318`) — true precisely in
  the failure case. No build generation ID.
  *Findings:* F-B09b-6. *Roadmap:* **A6**.

- [ ] **SKB-039 — The `invoke-codegen` IPC handler has no timeout and no stdin error handling; a hung codegen wedges Generate forever, a spawn failure can crash the main process.**
  `main.ts:75-167` vs `runProcess`'s `PROCESS_TIMEOUT_MS` (`:196-223`) which guards only the
  preview path; `child.stdin.write` return ignored, no `stdin.on('error')` on either path.
  *Findings:* F-B09b-7. *Roadmap:* **B9**.

- [ ] **SKB-040 — Mixer per-channel `pan` is parsed, stored and round-tripped, and read by nothing in either the UI or the codegen.**
  `MixerNode.tsx:13,23`; no control renders it, `generate_mixer_code` never reads it.
  *Findings:* EDITORIAL C13 (re-verified open by B09a). *Roadmap:* **C2** (schema decides:
  implement or delete the field).

- [ ] **SKB-041 — Sustain ≤ 0.0001 silently discards the Release stage the envelope editor still draws.**
  `codegen.odin:282` forces `.Idle` during Sustain; the voice-lifecycle check deactivates before
  note-off can start Release; `AdsrEnvelopeEditor.tsx` plots a release tail regardless.
  *Findings:* EDITORIAL C14 (re-verified open), F-A04 notes. *Roadmap:* **C6**.

- [ ] **SKB-042 — Exposed parameters initialize unclamped, so a game's first setter call can jump audibly.**
  EDITORIAL C4, re-verified open by the prior-findings triage; interacts with SKB-024's
  default divergences.
  *Findings:* B09a status table (W4/C4). *Roadmap:* **C2**.

- [x] **SKB-043 — Mixer channel levels are not exposable from the editor even though the backend fix for exposed levels landed and is golden-tested.**
  Every `level<n>` wrapper hardcodes `isExposable = false`
  (`NodeParameterControls.tsx:278-292`); the fix commit touched no UI file. The manual's warning
  is still operationally true; the recorded "fixed" status is not deliverable.
  **⚠ This entry's conclusion was wrong, corrected 2026-08-01 while fixing it.** The hardcoded
  `false` was never reached: `ParameterPanel.tsx:338-348` has an inline mixer branch that returns
  *before* `NodeParameterControls`, and it already passed `isExposable = true`. Mixer levels have
  been exposable in the shipped editor all along and the backend's P3 fix was always reachable, so
  the manual's warning was false, not "operationally true". What the dead `false` actually was is a
  **landmine under packet B11**, whose job is deleting those inline bypass branches so
  `NodeParameterControls` is the single path — landing B11 first would have *regressed* mixer
  exposure. Flipped in `08d5875` as a prerequisite for B11, with a round-trip test carrying both
  `exposedParameters` and the authored `levels` array into the codegen JSON.
  *Findings:* F-C1-4 (correcting F-A08-1) — **and F-C1-4 corrected in turn**. *Roadmap:* **A7 item
  6** (done), **B11** (depends on it).

- [x] **SKB-044 — The Reverb node card has no Pre-Delay control, so the backend's implemented pre-delay is unreachable on the primary editing surface.**
  `ReverbNode.tsx:8-11` declares `decay`/`mix` only; the sidebar renders three
  (`NodeParameterControls.tsx:236-239`). Blocks the manual rewrite for F-A07-1.
  *Findings:* F-C1-9, F-B07-8 instance. *Roadmap:* **A7 item 7**.

- [ ] **SKB-045 — Non-numeric P-locks (enum/string controls) are silently dropped at serialization with no UI warning that the lock vanished.**
  `projectSerializer.ts:174-182` filters them; `renderNodeOverrides` happily offers the controls.
  *Findings:* F-B01-11. *Roadmap:* **B5**.

- [ ] **SKB-059 — MidiInput ships with `device` and `useMpe` in its default `exposedParameters`, and neither is an exposable parameter.**
  Filed 2026-08-01 by the B11 agent, which found it while deleting the inline
  `midiInput` bypass and correctly declined to fix it unscoped.
  `node-definitions.ts:189-192` sets `defaultMidiInputParams.exposedParameters = ['device', 'useMpe']`,
  so **every MIDI Input node ever created is born claiming two exposed parameters**. Neither has ever
  had an expose toggle in any UI path — the bypass didn't offer one and the replacement case in
  `NodeParameterControls` doesn't either (`device` non-exposable, `useMpe` an unwrapped checkbox).
  Worse than cosmetic: `device` is a **string**, and both are compile-time configuration rather than
  DSP parameters, so this is the same class as SKB-006/SKB-007 — a public API advertising setters for
  things the DSP never reads, arriving by default rather than by a user's click. Check what the
  resolution pass currently emits for them before deciding the fix; the honest answer is probably an
  empty default plus B2's `param_is_live` predicate rejecting non-numeric and config-only fields.
  Not fixed here because the default lives in a shared definitions file and changing it edits the
  shape new nodes are born with.
  *Findings:* none (post-audit). *Roadmap:* **B2** (the predicate), **C2** (the schema that would have
  made it impossible).

- [ ] **SKB-058 — `bpmSync: true` with no `syncRate` key silently becomes 1/4, and the node's stored rate is dead.**
  Filed 2026-08-01 while verifying A10. `bpm_sync_seconds_expr` (`codegen.odin:42`) defaults the
  division to `1/4` when `syncRate` is absent, with no warning, so a node whose author enabled
  tempo sync without choosing a division gets a quarter note regardless of the `frequency`/`rate`
  still stored on it — the stored value is inert but visible in the editor, which is the exact
  shape of the confusion the P12 pass tried to clear up. `examples/instruments/bass/lfo-filter-wobble-bass.skald.json:3`
  is a shipped instance: `bpmSync: true`, no `syncRate`, `frequency: 8` dead. Commit `388dab2`
  fixed that file's oscillator and missed its LFO, so it is the one file in the class the data pass
  left behind. Two fixes, both cheap: warn at build time when `bpmSync` is set without `syncRate`,
  and give the file a division.
  *Findings:* F-A10-8 (filed as stale-doc; the data and codegen halves are the real defect).
  *Roadmap:* **B5** (warning) + **D3** (the file).

---

## Low

- [x] **SKB-046 — Oscilloscope buffer sized from `frequencyBinCount` instead of `fftSize`; the drawn window is half what it should be.**
  `AudioVisualizer.tsx:34-36`. *F-B08-9 → A7 item 21.*
- [x] **SKB-047 — Failed Odin lookups are never cached and probe with blocking `spawnSync` on the Electron main thread (up to 3 × 10 s stalls per Play if a candidate hangs).**
  `main.ts:175-191`. *F-B08-8 → A7 item 24.*
- [ ] **SKB-048 — `NumberInput`'s unguarded `value.toString()` was fixed at one call site and relocated to `handleFocus`.**
  `common/NumberInput.tsx:108`. *F-B09b-4 → A7-class.*
- [x] **SKB-049 — Instrument Glide: UI slider 0–2 s vs backend clamp 0–5 s.**
  `NodeParameterControls.tsx:320` vs `param_ranges.odin` glide entry. *F-A09-5/F-A01-10 → A7 item 12.*
- [x] **SKB-050 — BPM bounds: UI 20–300 vs backend 20–999 — harmless until a runtime BPM setter ships.**
  `bpm.ts:18-19` vs `param_ranges.odin`. *F-B02-9 → A8 catches; unify with runtime-BPM work.*
  **Closed 2026-08-01 (uncommitted). Unified at 999 — the UI widened, the backend left alone.** The
  backend's `20..999` (`param_ranges.odin:164`) predates the A8 gate and matches the standard DAW ceiling
  (Ableton, FL, Logic all cap at 999); the UI's `BPM_MAX = 300` arrived in `dfa1197` as a side effect of a
  NaN-clamp fix with no musical rationale. Nothing in the corpus exceeds 180, so neither direction
  invalidated a shipped project. High BPM verified safe rather than assumed: the step accumulator floors
  every step at 1 sample (`n_step := u64(math.max(p.step_frac_acc, 1.0))`), and playback timing is
  sample-accurate WASM (`skald_get_step()` per render quantum) — the only BPM math in JS is a cosmetic
  CSS-transition duration and display text.
  **The A8 allowlist entry was retired, per the gate's own written convention ("if it was fixed, DELETE
  this entry").** The dedicated test that asserted the *mismatch* now asserts equality
  (`RangeParity.test.tsx`); remaining allowlist sections renumbered 1–6. This is the first entry ever
  resolved, so the convention had no precedent to imitate — worth knowing if a second one lands.
  Boundary tests both sides (20/999 in, 19/1000 out). Reverting `BPM_MAX` to 300 fails 3, including the
  generic parity sweep `project.bpm [project] 20..300 vs backend(*.bpm) 20..999` — i.e. the gate correctly
  re-detects the divergence now that the allowlist entry is gone. Unit 52/52, goldens 46/46, acceptance
  31/31, UI 567 tests green.
  *Caveat:* with no runtime BPM setter yet, the backend bound is declarative metadata read by the
  range-dump/parity tooling, not an enforcement path — `clampBpm` is still the only place a value is
  actually rejected. The backend boundary test pins the row, not a rejection.
- [x] **SKB-051 — Noise `amplitude` default: generic table 0.5 vs UI/codegen 1.0; the node-type override switch built for this omits Noise.**
  `param_ranges.odin:88-89` vs `node-definitions.ts:98-101`. *F-A02-6 → A7 item 9.*
- [x] **SKB-052 — Generated oscillator code emits a guard that can never be false (`if unison_count > 0` on a literal floored at 1).**
  `codegen.odin:179-186`, `:219`. Same smell the codebase fixed once before. *F-C1-10 → A7 item 25.*
- [ ] **SKB-053 — `process()` constructs two fresh Float32Array views per render quantum.**
  `skaldWasm.worklet.ts:146-153`; ~40-byte views, small but avoidable. *F-B08-6.*
- [ ] **SKB-054 — `parentNode`→`parentId` rehydration never walks into instrument subgraphs; a pre-v12 nested group would silently flatten.**
  `useFileIO.ts:44-52`. *F-B06-7 → C1 (recursive migration walk).*
- [ ] **SKB-055 — Backend memory hygiene: `sorted_nodes`/`bus_nodes`/`exposed_resolutions`/aprintf strings never freed; `os.exit` skips defers.**
  Blast radius ≈ zero today (one-shot CLI process), a landmine if the core is ever embedded.
  *flash_5 cluster (verified live by B09b) → note on C2/A12 work.*
- [ ] **SKB-056 — CustomSlider/XYPad log-scale math breaks for `min <= 0` (dormant — no current caller passes it).**
  `controls/CustomSlider.tsx:54-64`, `controls/XYPad.tsx:51-65`. *flash_1 #8.*

---

## Refuted during verification (do not re-file)

- **`build_project_from_raw` drops project-level sequencer tracks** — false. The UI never emits
  that shape; tracks travel inside each instrument's `audio_graph.sequencer_tracks`
  (`projectSerializer.ts:149`, `:186`). *(F-B09b-2, refuted by C1.)*
- **ScaleContext breaks on negative MIDI notes** — false; both consumers use
  `(x + 12) % 12` (`ScaleContext.tsx:44,56`). *(flash_2 #21.)*
- **"111 of 119 prior architecture findings still live"** — arithmetically impossible against
  its own table; do not quote. The *pattern* (prose findings persist, checkable packets get
  fixed) is real — see roadmap §8.
- **Panner centre costs "up to −6 dB in mono fold-down"** — struck; the fold-down figure is
  −3.01 dB, same as per-channel. *(inside F-A08-3.)*
- **Asset-type inference "changes which public procedures get emitted"** — struck; both proc
  shapes are emitted regardless, only auto-start flips (`codegen.odin:1546-1551`).
  *(inside F-A09-8.)*

---

## Closed history (verified 2026-07-31 — all still fixed, zero regressions)

The previous version of this file recorded the Phase 0–8 remediation and the 2026-07-24
follow-ups, all `[x]`. The 0.2 audit's triage agents (B09a, B09b) independently re-verified the
full list against the current tree: **every entry remains fixed or correctly obsolete.** Kept
here as a compact record; the full original prose is in git history for this file.

**One caveat:** `BUG-LINT-WARNINGS` records a *suppression*, not a fix — the four ESLint rule
families are still `"off"` in `.eslintrc.json:17-20`. Its checkbox should not be read as a
resolution. (Re-flagged by three separate review passes.)

**One reframe:** `BUG-EXAMPLES-MISC-OBSOLETE` is fixed as scoped (the CLI auto-wraps loose
graphs) but the *editor* half of the same story — Play refuses those graphs — is SKB-019.

v0.1 follow-up queue: BUG-EXAMPLES-LEGACY-CLEANUP · BUG-AUDIO-ODDITIES-INVESTIGATION ·
BUG-BPM-SETUP-UX · BUG-PARAM-DISPLAY-PRECISION · BUG-INTEGER-CONTROLS-EMIT-FLOATS ·
BUG-REACTFLOW-002-STRICTMODE · BUG-PREVIEW-CONSOLE-NOISE — all verified landed.

Blockers: BUG-DISPATCHER-MISSING-NODES · BUG-FMTYPE-MISMATCH · BUG-NOISE-RNG-NOT-SEEDED ·
BUG-PROJ-STEREO · BUG-CODEGEN-TESTS-DEAD · BUG-INSTRUMENT-NAME-DUPS · BUG-CODE-PREVIEW-WRONG ·
BUG-EXAMPLES-MISC-OBSOLETE · BUG-ENEMIES-INT-IDS · BUG-GRAPH-PARAMETERS-VS-DATA — verified.

High: BUG-SEQ-RATE · BUG-EXPOSED-PARAMS-WIRING · BUG-NO-MASTER-LIMITER (formula since improved:
`tanh(x·master_vol)`, see `codegen.odin:2476`'s comment) · BUG-MIXER-CHANNEL-LIMIT ·
BUG-WAVETABLE-PLACEHOLDER (since exceeded: real morphing wavetable landed) ·
BUG-VOICE-BUSY-NO-ENVELOPES — verified.

Medium: BUG-DEAD-NOTE-ON-OFF · BUG-FMOPERATOR-CASING · BUG-STEPGRID-DUP-TESTID ·
BUG-TYPE-CASE-MISMATCH · BUG-TWO-IDS-IN-JSON · BUG-EMPTY-PROJECT-SILENT ·
BUG-WAVEFORM-CONST-SWITCH · BUG-DOUBLE-VOICE-BUSY-DECL — verified.

Low: BUG-LINT-WARNINGS (caveat above) · BUG-LINT-FUNCTION-TYPE · BUG-UTF16-OUTPUT-LEGACY ·
BUG-STDOUT-DEBUG-PRINT · BUG-DEAD-CSV-DSP-HARNESS · BUG-STDOUT-NOISY-COMMENTS — verified.

Plus the Sax live-param fix (node-scoped `::` keys) — verified in source; **note that the
committed binary predates it (SKB-001), which is why the fix is not currently delivered to
users of the committed tree.**
