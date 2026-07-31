# B09b — Prior review pass (`skald-health-review/`) re-verified against the live tree

Scope: every distinct finding in `skald-health-review/BUGS.md` and its 12 `review-reports/*.md`
files, re-verified against the live tree at `C:\Users\ryanp\Documents\dev\Skald-main\Skald`
(the health-review snapshot is ~9.7k lines of TS / ~9k lines of Odin; live is ~11.3k TS / ~31k
Odin — roughly 3x backend growth since this pass was done). No code or evidence below is drawn
from the health-review's own source tree — only its written claims were used as a checklist,
then independently re-checked live.

## Summary

- **The predicted high obsolete/fixed rate held, but only for `BUGS.md`.** All 30 items in
  `BUGS.md`'s "fixed" queue check out as still fixed (or superseded by an even later, better fix)
  in the live tree — a real, durable batch of work. Only the ESLint-suppression item (BUG-LINT-WARNINGS)
  is still live exactly as described.
- **The four architecture/DevOps prose reports (`flash_3`, `flash_5`–`flash_8`, `pro_1`–`pro_4`)
  told a completely different story: almost nothing there has been fixed.** Of ~119 findings
  across the UI-hooks, backend-core, backend-tester, backend-acceptance, project-root and
  architecture reports, **111 are still live** in the current, 3x-larger tree. These were never
  meant to be quick fixes (memory leaks, `os.exit()` patterns, dual undo stacks, ESLint policy,
  god-component architecture) and evidently nothing has touched them since.
- **Two items that survived this review pass are genuinely serious and newly worth escalating**:
  a duplicate-node-ID rename in `json.odin` that leaves connections pointing at the *wrong* node
  (the code's own warning comment admits it), and `ParameterPanel.tsx`'s `toggleParameterExposure`
  still clobbering concurrent edits with a stale full-object snapshot — both are exactly the class
  of bug the brief asks to surface: **flagged, unfixed, and now confirmed against a tree three
  times the size of the one that first caught them.**
- **One clean example of a narrow fix**: `common/NumberInput.tsx`'s unguarded `value.toString()`
  was fixed at its originally-cited constructor line, but the identical unguarded pattern now
  lives at a different line in the same file (`handleFocus`) — the defect moved, it didn't close.
- **One clean example of a fix outgrowing its own bug report**: `BUG-NO-MASTER-LIMITER`'s claimed
  `tanh(x*0.7)/0.7` formula is no longer what's in the code — a later, better fix replaced it
  (with a code comment explaining the 0.7 version "topped out at 1.43 and still clipped"), and
  `BUG-WAVETABLE-PLACEHOLDER`'s "still a sine placeholder" caveat is now obsolete — Wavetable was
  both re-added to the sidebar and given a real multi-shape morph implementation, matching what
  Tier 1's `F-A01` independently found and analyzed in depth.

## Status table

Status legend: **fixed** = resolved in live tree · **live** = still reproducible · **obsolete** =
code/feature no longer exists · **unverifiable** = noted inline what would settle it.

### BUGS.md — v0.1 follow-up queue (never marked fixed/done, still open observations)

| # | Description | Status | Live-tree evidence |
|---|---|---|---|
| B1 | BUG-EXAMPLES-LEGACY-CLEANUP — audit example library for stale/dup/placeholder projects | unverifiable | No changelog trail found; would need a manual pass over `examples/` (66+ files per Tier 1's F-A08-5) to settle. |
| B2 | BUG-AUDIO-ODDITIES-INVESTIGATION — unreproduced intermittent audio behavior | unverifiable | Open-ended by nature; no repro steps ever captured. Nothing in Tier 1's per-node audits reproduces this class of complaint directly. |
| B3 | BUG-BPM-SETUP-UX — BPM ownership/UX unclear across surfaces | live | Confirmed and *substantially deepened* by Tier 1: `F-A03-7`/`F-A03-8` (LFO/S&H free-run rate vs BPM-sync division, two independently-stored truths), `F-A07-5` (Delay same pattern). **Superseded by Tier 1 F-A03-7/8, F-A07-5** — treat those as the authoritative version of this item. |
| B4 | BUG-PARAM-DISPLAY-PRECISION — ADSR etc. show noisy float precision (`30.02413252345235`) | fixed | `skald-ui/src/utils/formatDisplayValue.ts` now formats display values to 2 decimals (confirmed via agent verification of `AdsrEnvelopeEditor.tsx` using `formatDisplayValue`); underlying stored/DSP values unaffected. |

### BUGS.md — "Fixed" queue (30 items, all claimed resolved in the OLD, smaller tree)

| # | Description | Status | Live-tree evidence |
|---|---|---|---|
| 1 | BUG-DISPATCHER-MISSING-NODES — per-voice dispatcher missing LFO/FM/Wavetable/SampleHold/Panner cases | fixed | `codegen.odin:1882-1901` dispatcher has all five cases; unmatched types hard-error. |
| 2 | BUG-FMTYPE-MISMATCH — state-field allocation type check mismatch | fixed | `codegen.odin:1133` checks `node.type == "FmOperator"`, matches UI `codegenType`. |
| 3 | BUG-NOISE-RNG-NOT-SEEDED — PRNG not seeded per voice | fixed | `codegen.odin:1346,1354,1367,1370` seed noise/S&H RNG per voice; `:2356` stuck-state self-recovery guard. Consistent with Tier 1 `F-A02`'s independent confirmation of PRNG seeding correctness. |
| 4 | BUG-PROJ-STEREO — mono-only output, no L/R | fixed | `codegen.odin:1777,2039-2040,2458` — per-instrument stereo process, Panner L/R routing. **Note**: Tier 1's `F-A08-3`/`F-A08-4` go far deeper on this same code path and find a real live bug (Panner-at-centre is quieter than direct-to-Output) plus a design-level "stereo is one exceptional code path" finding — treat those as the current state of the art here. |
| 5 | BUG-CODEGEN-TESTS-DEAD — dead `tests/codegen_test.odin` | fixed | File confirmed absent repo-wide; replaced by golden-snapshot (`run_golden.bat` + `tests/golden/*.odin.golden`) and FFT acceptance (`run_acceptance.bat`) harnesses — a methodology change, not a like-for-like replacement, but the described dead-code problem is gone. |
| 6 | BUG-INSTRUMENT-NAME-DUPS — duplicate instrument names produce invalid Odin | fixed | `codegen.odin:2251-2266` `resolve_unique_names` emits `base`, `base_2`, `base_3`. Note: the specific `tests/dups_test/dups.json` fixture cited as the regression test no longer exists anywhere in the repo — the *fix* is real but its *regression coverage* may have been dropped or renamed; unverifiable without a fixture-name grep across all of `tests/`. |
| 7 | BUG-CODE-PREVIEW-WRONG — main.ts IPC handler returned wrong content | fixed | `main.ts:138-152` reads output file from disk after spawn closes; regression test at `tests/codegen/Codegen.test.ts:178-222`. |
| 8 | BUG-EXAMPLES-MISC-OBSOLETE — legacy loose graph saves broke codegen | fixed | `json.odin:309` wraps loose graphs as single Asset SFX; fixture `tests/fixtures/legacy_loose_graph.json` present. |
| 9 | BUG-ENEMIES-INT-IDS — `enemies/` dir with unparseable int ids | obsolete | `skald-backend/enemies/` and `generate_soundtracks.bat` confirmed absent repo-wide. |
| 10 | BUG-GRAPH-PARAMETERS-VS-DATA — instrument metadata read from wrong field | fixed | `types.odin:35-43` `Node_Raw` keeps both `parameters`/`data`; `json.odin:167-169` falls back to `data`; fixture `tests/fixtures/graph_save_roundtrip.json` present. **Note**: a *different*, still-live bug in the same file family was found by this audit — see Finding F-B09b-2 below (raw `Project_Data_Raw`'s missing `sequencer_tracks` field). |
| 11 | BUG-SEQ-RATE — sequencer boundary-equality timing drift | fixed | `codegen.odin:2114,2121,2234-2236` — runtime-computed `samples_per_step`, decrement-then-fire counter. |
| 12 | BUG-EXPOSED-PARAMS-WIRING — dead snake_case exposed_parameters path | fixed | `projectSerializer.ts:62-71` strips dead `id_raw`/snake_case field; only camelCase used. |
| 13 | BUG-NO-MASTER-LIMITER — no output limiter, could clip | fixed (formula superseded) | Limiter exists, but not the `tanh(x*0.7)/0.7` formula BUGS.md describes — live code is `math.tanh(mixed_left * master_vol)` (`codegen.odin:2477-2478,2683-2684`), with a comment at `:2476` explaining the 0.7 version "topped out at 1.43 and still clipped." **See also Tier 1 `F-A05-1`** (master_volume of exactly 0 exports as full volume, same code region) — a distinct, still-live bug in this exact area that this old review never caught. |
| 14 | BUG-MIXER-CHANNEL-LIMIT — mixer silently drops inputs beyond 8 | fixed | `codegen.odin:679-693` reads `inputCount` from parameters, default 8, cap 32. |
| 15 | BUG-WAVETABLE-PLACEHOLDER — Wavetable removed from sidebar, codegen is sine-only placeholder | obsolete (exceeded) | Sidebar draggable is back (`Sidebar.tsx:269`); `codegen.odin:477-511,2375-2383` implements real multi-shape (`skald_wavetable_shape`/`skald_wavetable_sample`) position-morphing — not a placeholder. **Superseded by Tier 1 `F-A01`**, which independently confirms and extensively analyzes the current real implementation (and its actual remaining gaps: no unison, no PWM, no phase param — `F-A01-4/7/8`). |
| 16 | BUG-VOICE-BUSY-NO-ENVELOPES — voices without ADSR never deactivate | fixed | `codegen.odin:1915-1930` deactivates via `!voice_busy` or duration-based check. |
| 17 | BUG-DEAD-NOTE-ON-OFF — dead proc left in tree | fixed | `codegen.odin:785-786` tombstone comment confirms removal. |
| 18 | BUG-FMOPERATOR-CASING — import casing mismatch (`FmOperatorNode` vs `FMOperatorNode`) | fixed | `components/Nodes/index.ts:14` imports `./FMOperatorNode`, matches on-disk filename. |
| 19 | BUG-STEPGRID-DUP-TESTID — vitest test isolation bug (no cleanup between renders) | fixed | `tests/sequencer/StepGrid.test.tsx:14-15` has `afterEach(() => cleanup())`. |
| 20 | BUG-TYPE-CASE-MISMATCH — PascalCase/lowercase instrument-type mismatch | fixed | `json.odin:12,203,304,332` match `"Instrument"`/`"instrument"` explicitly; no `strings.to_lower` calls remain in the file. |
| 21 | BUG-TWO-IDS-IN-JSON — dead `id_raw`/top-level `exposed_parameters` emitted | fixed | `useCodeGeneration.ts` — zero matches for either field (grep-confirmed). |
| 22 | BUG-EMPTY-PROJECT-SILENT — zero-instrument project silently "succeeds" | fixed | `main.odin:81-86` exits 1 with stderr message. |
| 23 | BUG-WAVEFORM-CONST-SWITCH — dead branches emitted for unselected waveforms | fixed | `codegen.odin:200-216` Odin-land switch emits only the matched branch. |
| 24 | BUG-DOUBLE-VOICE-BUSY-DECL — unused-variable diagnostic on ADSR-less instruments | fixed | `codegen.odin:1834-1843` — `voice_busy` only emitted `if has_adsr_in_graph`. |
| 25 | BUG-LINT-WARNINGS — ESLint policy disables `no-explicit-any`/unused-vars/non-null-assertion/import-alias warnings | **live** | `skald-ui/.eslintrc.json:17-20` — all four rules still explicitly `"off"`. Independently re-flagged by `pro_1` and `pro_2` (see below) — a finding that has now survived three separate review passes unfixed. |
| 26 | BUG-LINT-FUNCTION-TYPE — raw `Function` type casts in audio engine | fixed | No `Function` casts in the hooks/audio-engine path; only an unrelated `new Function(...)` in a worklet-simulation test. |
| 27 | BUG-UTF16-OUTPUT-LEGACY — stale UTF-16 `build_log.txt` | obsolete | No `build_log.txt` anywhere in repo. |
| 28 | BUG-STDOUT-DEBUG-PRINT — full JSON dump in test console output | fixed | No `console.log` in `tests/codegen/Codegen.test.ts`. |
| 29 | BUG-DEAD-CSV-DSP-HARNESS — dead `tests/dsp/` harness | obsolete | `tests/dsp/`, `run_dsp_test.bat`, `dsp.exe` all absent repo-wide. |
| 30 | BUG-STDOUT-NOISY-COMMENTS — duplicate "Apply Modulation" comment | fixed | Only one instance, `codegen.odin:141`. |

### flash_1 — UI Components (`skald-ui/src/components`)

| # | Description | Status | Live-tree evidence |
|---|---|---|---|
| 1 | Duplicate numeric input boxes on every slider (`CustomSlider` + separate `NumberInput`) | **live** | `NodeParameterControls.tsx:83-104` still renders both. |
| 2 | `ParameterPanel.tsx` hardcodes inline mixer/mapper/midiInput editors, bypassing `NodeParameterControls` (loses 32-ch mixer, etc.) | **live** | `ParameterPanel.tsx:338-377` inline branches predate generic fallback (`:382-388`); inline mixer editor still lacks `inputCount` support. See Finding F-B09b-3. |
| 3 | `toggleParameterExposure` sends full stale `node.data` snapshot, clobbering concurrent edits | **live** | `ParameterPanel.tsx:209-210` still spreads full `nodeToUpdate.data`. Sibling `handleParameterChange` (already delta-based even in the old report) remains correctly delta-based — only this one function is unfixed. See Finding F-B09b-1. |
| 4 | `Sidebar.tsx` BPM `parseInt` on empty string → NaN propagates to global state | fixed | `Sidebar.tsx:160-169` now routes through `clampBpm` (`utils/bpm.ts:26-29`), returns `BPM_DEFAULT` on non-finite input. |
| 5 | `StepPropertiesEditor.tsx` override keys `${label}:${paramName}` collide on shared labels | **live** | `Sequencer/StepPropertiesEditor.tsx:113` unchanged; code's own comment flags the ambiguity. |
| 6 | `CodePreviewPanel.tsx`'s `handleCopy` sets state via raw `setTimeout`, no cleanup | **live** | `CodePreviewPanel.tsx:60-68` unchanged. |
| 7 | Undefined-guard gaps: `AdsrEnvelopeEditor.tsx` direct `.toFixed()`; `NumberInput.tsx` unguarded `.toString()` | split — fixed / **live (relocated)** | `AdsrEnvelopeEditor.tsx` now uses guarded `formatDisplayValue`. `common/NumberInput.tsx` — the originally-cited constructor-line bug is fixed, but the *identical* unguarded `value.toString()` pattern now lives at `handleFocus` (line 108). **Narrow fix — same defect moved, not closed.** See Finding F-B09b-4. |
| 8 | `CustomSlider`/`XYPad` log-scale `Math.log(min)` breaks when `min <= 0` | **live** (dormant) | `controls/CustomSlider.tsx:54-56,61-64`, `controls/XYPad.tsx:51-56,58-65` unguarded; no current caller passes `min<=0` so it hasn't bitten yet. |
| 9 | `GroupNode.tsx` dynamic `<Handle>` positions from ReactFlow store cause instability | **live** | `Nodes/GroupNode.tsx:5-10,55,65-105,121,134` unchanged. |
| 10 | `ParamNode.tsx`'s `useNodeParamUpdater` falls back to `setNodes`, diverging from app state | **live** | `Nodes/ParamNode.tsx:53-66` unchanged fallback. |
| 11 | Accessibility gaps: Sidebar palette no keyboard trigger; NamePromptModal no Enter/Escape; XYPad uses prop dimensions not `getBoundingClientRect()` | **live** (all three) | `Sidebar.tsx:240-253` no onKeyDown; `NamePromptModal.tsx` no key handling; `controls/XYPad.tsx:106-111,80-81` still uses fixed props. |

### flash_2 — UI State/Hooks (`skald-ui/src/contexts`, `skald-ui/src/hooks`)

| # | Description | Status | Live-tree evidence |
|---|---|---|---|
| 12 | Dual, desynchronized undo/redo stacks (graph vs sequencer); single Ctrl+Z fires both; load doesn't reset sequencer history | **live** | `app.tsx:217-226` still calls both undo handlers; `useFileIO.ts:135-136` resets graph history but `useSequencerState.ts:169-172`'s `loadTracks` calls `saveHistory()` instead of clearing. See Finding F-B09b-5. |
| 13 | `useInstrumentRegistry.ts` effect depends on whole `sequencerActions` object → redundant history entries | **live** (partially mitigated) | Single-add case now guarded, but batch/simultaneous instrument creation can still double-save history via stale `tracks` closure. |
| 14 | WASM hot-swap race: Stop→Play during in-flight rebuild can inject stale binary into new worklet | **live** | `useWasmAudioEngine.ts:279-318,291,294` — only a null-check on `workletNode.current`, no session/generation ID. See Finding F-B09b-6. |
| 15 | Unguarded `window.electron` calls throughout hooks | **live** | `useFileIO.ts:80,95,144`; `useCodeGeneration.ts:46`; `useWasmAudioEngine.ts:99`; `app.tsx:90`. |
| 16 | AudioWorklet `process()` allocates two `Float32Array`s per render quantum | **live** | `audioWorklets/skaldWasm.worklet.ts:152-153`. |
| 17 | Async Web MIDI `requestMIDIAccess()` unmount race, no `isMounted` guard | **live** | `useWasmAudioEngine.ts:360-406` (line numbers shifted, same gap). |
| 18 | Single `lastAuditionStamp` ref shared across all Output nodes | **live** | `useWasmAudioEngine.ts:342-353`. |
| 19 | `handleCreateGroup` bounding-box math mixes relative (grouped-child) and absolute node coordinates | **live** | `useNodeComposition.ts:222-225` raw `Math.min/max` on `n.position.x/y`, no normalization. |
| 20 | Hardcoded viewport-offset estimate in `handleImportGraph` | **live** | `useFileIO.ts:183-184` — still `window.innerWidth - 550` / `- 300`. |
| 21 | `ScaleContext.tsx`'s `note % 12` uses JS remainder, breaks for negative MIDI notes | **live** | `contexts/ScaleContext.tsx:41`; propagates through `isInScale`/`nearestInScale` (`:43-58`). |

### flash_4 — Utils/Types/Definitions (`skald-ui/src/utils`, `skald-ui/src/types`, `skald-ui/src/definitions`)

| # | Description | Status | Live-tree evidence |
|---|---|---|---|
| 22 | MIDI edge lookup picks first matching-target edge, ignoring whether source is a `midiInput` | **live** | `projectSerializer.ts:130`. |
| 23 | `start_time` calc has no bpm guard (0/negative/NaN → Inf/NaN) | **live** | `projectSerializer.ts:167`. Note: backend-side guards exist for the *stored* project bpm (see flash_5/electron item 18 below) but this specific per-note serializer expression is still unguarded. |
| 24 | `logger.ts`'s `if (data)` suppresses falsy payloads (`0`, `false`, `""`) | **live** | `utils/logger.ts:55`. |
| 25 | Volume/probability floored at `0.001` to dodge backend's "0 = absent" convention — explicit 0/mute unreachable | **live** | `projectSerializer.ts:174,199`. |
| 26 | Instrument `mute` derived only from sequencer tracks; instruments with no tracks can't be muted | **live** | `projectSerializer.ts:195`; no `isMuted` field in `InstrumentParams` (`types.ts:189-205`). |
| 27 | `formatSubgraph` assumes `subgraph.nodes`/`connections` defined, throws on incomplete subgraph | **live** | `projectSerializer.ts:75-79` no `?? []` fallback. |
| 28 | Gain `parseFloat` with no NaN fallback → serializes as `null`, breaks backend deserialization | **live** | `projectSerializer.ts:59`. |
| 29 | Only `gain` gets numeric coercion; other params passed through unvalidated | **live** | `projectSerializer.ts:53-60`. |
| 30 | `topologySignature`'s `name in n.parameters` throws TypeError on null/undefined parameters | fixed | `projectSerializer.ts:240-241` now uses `n.parameters?.exposedParameters ?? []`. |
| 31 | Empty-string `sourceHandle`/`targetHandle` falsy-overridden to `'output'`/`'input'` | **live** | `projectSerializer.ts:82,84`. |
| 32 | `NodeDefinition.defaultParameters: any` disables compile-time checking | **live** | `definitions/node-definitions.ts:39`. |
| 33 | `nodeTypes.ts` omits `InstrumentInput`/`InstrumentOutput` component mappings | **live** | `definitions/nodeTypes.ts:8-28` vs `node-definitions.ts:219-220`. |
| 34 | Only `mapper` declares `inputs`/`outputs` arrays; 20 other node types omit them | **live** | `node-definitions.ts:193-205`. |
| 35 | `mapper` defaults omit `exposedParameters` array (every other node type has one) | **live** | `node-definitions.ts:196-201`. |
| 36 | Neither Oscillator nor Wavetable defaults explicitly set `fixedPitch: false` | **live** | `node-definitions.ts:58-63,82-89`. Related to Tier 1 `F-A01-6`'s design finding on the same field (different angle — default-value hygiene vs. boolean-should-be-continuous design critique). |
| 37 | Runtime UI state (`analyser`, `lastTrigger`) leaks into serialized project JSON | **live** (partial) | `types.ts:22,101,143`; `projectSerializer.ts:50-51` strips `analyser`/`subgraph` but **not** `lastTrigger`, which still serializes. |
| 38 | `InstrumentParams.subgraph` typed as backend shape (`from_node`/`to_node`) but runtime uses ReactFlow shape (`source`/`target`) — forces `any` casts | **live** | `types.ts:201-204` vs `projectSerializer.ts:145,80-85`. |
| 39 | `logger.ts` JSDoc claims anti-spam capability it doesn't have | **live** | `logger.ts:1-2`, no dedup/throttle logic in file. |
| 40 | `topologySignature` does a full `JSON.parse(JSON.stringify(...))` deep clone every call | **live** | `projectSerializer.ts:237`. |
| 41 | Non-exposed parameter edits still change the topology signature, forcing full WASM rebuilds | **live** (by design, unresolved) | `projectSerializer.ts:230-244`. |

### flash_3 — Electron Main Process (`skald-ui/src/main.ts`, `preload.ts`, `main/codegenGuards.ts`)

| # | Description | Status | Live-tree evidence |
|---|---|---|---|
| 1 | `findOdin()` uses blocking `spawnSync`; no negative caching on miss | **live** | `main.ts:176-191`; `cachedOdinPath` only set on success. |
| 2 | `invoke-codegen`'s `child.stdin.write()` ignores backpressure; handler has no timeout | **live** | `main.ts:164-165` (write), `:75-167` (handler) — unlike `runProcess`'s `PROCESS_TIMEOUT_MS` (`:196-223`), which only covers the preview path. See Finding F-B09b-7. |
| 3 | No `child.stdin.on('error', ...)` handler; ENOENT/EPIPE risk crashing main process | **live** | Neither `invoke-codegen`'s inline spawn (`:119-165`) nor `runProcess` (`:198-223`) attach a stdin error handler. |
| 4 | `previewBuildChain` WASM build queue has no cancellation/debounce | **live** | `main.ts:229,267-273` — plain `.then()` chain. |
| 5 | `codegenGuards.ts`'s `readPackage` uses sync `fs.readFileSync`; regex could false-positive in a block comment | **live** (narrower than claimed) | `main/codegenGuards.ts:23` — line-comment false-positive risk is actually low (`//` isn't leading whitespace), but block-comment (`/* package foo */`) risk remains, and the sync I/O concern stands. |
| 6 | No IPC parameter validation/sanitization | **live** | `preload.ts:5-21` forwards params untouched; `main.ts:110-114` splices them into spawn args with only the foreign-package guard as protection. |
| 7 | No CSP configured | **fixed** | `skald-ui/index.html:8` now sets a CSP meta tag (`default-src 'self' 'unsafe-inline' 'wasm-unsafe-eval' data: blob:;`). |

### flash_5 — Backend Core (`skald-backend/core/*.odin`)

| # | Description | Status | Live-tree evidence |
|---|---|---|---|
| 8 | `sorted_nodes` from `topological_sort` never freed | **live** | `codegen.odin:1043` — no `delete()` before return at `:2015`; comment claims it's freed but isn't. |
| 9 | `bus_nodes` map from `compute_bus_domain` never freed | **live** | `codegen.odin:1067` — confirmed no `delete(bus_nodes)` anywhere. |
| 10 | `sanitize_identifier`'s digit-prefix branch leaks the original builder string | **live** | `param_utils.odin:58-60`. |
| 11 | `resolve_unique_names`'s individual `fmt.aprintf` strings never freed (only the slice header is) | **live** | `codegen.odin:2261,2281`. |
| 12 | Nested-instrument `new(Graph)` subgraph pointers never freed; no `graph_destroy` | **live** | `json.odin:219`; zero `graph_destroy` hits repo-wide. |
| 13 | `filtered[:]` overwrites `graph.connections` without freeing the original slice | **live** | `json.odin:159,235`. |
| 14 | `exposed_resolutions` map and its `aprintf`-built keys never cleaned up | **live** | `types.odin:103`, populated at `codegen.odin:1283`, never deleted. |
| 15 | `build_project_from_raw`'s `project.sequencer_tracks` never populated — raw Project JSON format silently drops project-level sequencer tracks | **live** | `types.odin:137-144` — `Project_Data_Raw` has **no `sequencer_tracks` field at all**; only the graph-format path (`json.odin:324,364`) is fine. **This is a distinct, still-live data-loss bug** (the BUGS.md item with a similar name, #10 above, was about a different field/format and is genuinely fixed). See Finding F-B09b-2. |
| 16 | Duplicate node ID renamed to `<base>_dup<N>`, but connections still reference `<base>` (first node) | **live** | `json.odin:196-200` — the code's own warning comment admits it: *"Connections still target the first node with this id."* See Finding F-B09b-1 (top-severity carryover). |
| 17 | `os.exit(1)` scattered through `graph_validate.odin`/`codegen.odin` instead of returning errors | **live** (scoped) | `graph_validate.odin:97,104,112,126,150`; `codegen.odin:102,114,948,1061,1901,2003`. Only `main.odin` (the standalone `skald_codegen.exe` CLI, spawned fresh per Generate/Preview) imports this code — not embedded in a long-running process — so the practical blast radius is "one failed generate," not "crash the whole app." Still an architectural smell if this code is ever embedded elsewhere. |
| 18 | `bpm_sync_seconds_expr` divides by `p.bpm` with no runtime guard against 0 | **fixed** (via upstream clamps, not inline) | `codegen.odin:57` itself is still unguarded, but `json.odin:250,298` clamp/default bpm to 120 before it reaches codegen, and UI-side `definitions/bpm.ts:26-29`'s `clampBpm` restricts input to 20-300 before serialization. bpm=0 cannot currently reach the generated expression through any live path — but the guard is defense-in-depth elsewhere, not in the function itself. |
| 19 | `_init`'s `sample_rate` parameter unclamped — 0 produces Inf/NaN DSP state | **live** | `codegen.odin:1320` — no clamp anywhere in `generate_processor_code`. |
| 20 | Sample & Hold's `u64(sample_rate / max(rate,0.1))` cast risks wraparound if `sample_rate` is negative/zero | **live** | `codegen.odin:406` — `rate` operand is clamped (per a prior fix, comment at `:404-405`) but `sample_rate` itself isn't. |

### flash_6 — Backend Tester (`skald-backend/tester/`)

| # | Description | Status | Live-tree evidence |
|---|---|---|---|
| 21 | Real-time audio callback calls `sync.lock()` — priority-inversion anti-pattern | **live** (dev-tool only) | `test_harness.odin:75`, `fixture_player/main.odin:131`. **Scope note**: this is a manual developer test harness, not the shipped Electron/WASM audio path (that's `useWasmAudioEngine.ts`/AudioWorklet) — user-facing severity is low; developer-experience severity (crackles while manually auditioning fixtures) is real. |
| 22 | Producer thread never joined; `project_destroy` may run on main thread while it's still executing | **live** | `fixture_player/main.odin:105` (unjoined), `:72` (deferred destroy), `:124` (flag set but no join). |
| 23 | `is_running` flag read/written without atomics (unlike `frames`, which correctly uses atomics) | **live** | `fixture_player/main.odin:69,124,146` vs `:116,168`. |
| 24 | Fixed 150ms drain sleep independent of actual ring-buffer/hardware latency | **live** | `fixture_player/main.odin:122`. |
| 25 | Hardcoded `Asset`-named instrument access breaks on differently-named fixtures | **live** | `fixture_player/main.odin:79,157`. |
| 26 | `48000` hardcoded before querying actual device sample rate | **live** | `test_harness.odin:92,107`; `fixture_player/main.odin:71,89`. |
| 27 | Negative `-dur:` overflows float→u64 cast (near-infinite wait); unknown `-mode:` silently defaults instead of erroring | **live** | `fixture_player/main.odin:61-62,115-116` (overflow); `:59` (mode not hard-errored). |
| 28 | Mono-device channel-count mismatch not handled (always writes 2 interleaved values) | **live** | `test_harness.odin:73,52-56`; `fixture_player/main.odin:129,163-166`. |
| 29 | No headless mode (device init always required) | **live** | Confirmed, no bypass path in either binary. |
| 30 | No automated NaN/Inf/clip/silence/DC checks in the interactive harness | **live** | Confirmed absent; this logic exists only in the separate `acceptance/` binary. |

### flash_7 — Backend Tests/Acceptance (`skald-backend/tests/`, `skald-backend/acceptance/`)

| # | Description | Status | Live-tree evidence |
|---|---|---|---|
| 31 | Stale `acceptance.exe` could run after a build failure | **fixed** (structurally) | `run_acceptance.bat:95-99` — `goto :eof` on build failure happens *before* the exe is invoked for that fixture; no leftover-binary execution occurs in practice, though no explicit delete-before-build exists either. |
| 32 | Full `acceptance` package rebuilt per fixture (~25+ times), no shared runner | **live** | `run_acceptance.bat:47-51,95`; 30 fixture JSONs confirmed, one rebuild each. |
| 33 | Acceptance suite hardcodes single-instrument-named-`Asset` invariant | **live** | `acceptance/main.odin:8,950-955,1006-1013`. |
| 34 | `run_golden.bat`'s `fc` line-ending-normalization comment may not match `fc`'s actual behavior | **live** (claim unverified either way) | `run_golden.bat:65-67` — no flags passed to `fc`; would need an actual mixed-CRLF/LF test run to settle definitively. |
| 35 | FFT twiddle factor computed via repeated complex multiplication, accumulating f32 drift | **live** | `fft.odin:45`. |
| 36 | No parabolic/sub-bin frequency interpolation | **live** | `fft.odin:91-109`. |
| 37 | Silent-buffer input returns ~0.73Hz "peak" instead of 0 | **live** | `fft.odin:97` — `max_bin` initialized to `1`, never updated on all-zero input. |
| 38 | `spectral_centroid` has no noise-floor gating | **live** | `fft.odin:114-134`. |
| 39 | `buf_is_clean` (NaN/Inf/clip check) only runs in `-mode:smoke`, not standard fixture runs | **live** | `acceptance/main.odin:1070-1085` gated behind `smoke_mode`. |
| 40 | `assert_silent` defined but never called anywhere | **live** | `assertions.odin:70-81`, zero call sites. |
| 41 | `assert_audible` computes RMS over entire buffer (dilutes short one-shots against long silent tails) | **live** | `assertions.odin:83-95`. |
| 42 | ADSR envelope-shape assertion probe windows overlap ~50% | **live** (fixture-dependent) | `assertions.odin:204-241` — overlaps for small `attack_end_s`; the one live fixture call (`adsr_sine`, `attack_end_s=0.10`) happens not to overlap, so it's a latent rather than currently-triggered bug. |
| 43 | `dc_offset` accumulates in single-precision f32 over large sample counts | **live** | `assertions.odin:57-66`. |
| 44 | `assert_silence_after` is RMS-only, misses single-frame pops/clicks | **live** | `assertions.odin:270-297`. |
| 45 | `rel_delta` in `soundchange.odin` is linear, not semitone/log-scaled, for pitch comparisons | **live** | `soundchange.odin:86-92`. |
| 46 | `os.exit()` in acceptance `main.odin` skips `defer` cleanup | **live** | `acceptance/main.odin:112` (comment admits it), `:104,130,913,933,936`. |
| 47 | `free(p)` shallow-frees `Asset_Processor`, would leak sub-allocations if any existed | **fixed** (no-op today) | `soundchange.odin:159-160` — confirmed the current generated `Asset_Processor` struct uses only fixed-size embedded arrays, no sub-allocations to leak; the pattern is fragile but not currently leaking. |
| 48 | No `free_all(context.temp_allocator)` between fixture iterations | **obsolete** (doesn't apply) | Each fixture runs as its own OS process (per `run_acceptance.bat`'s per-fixture loop), not a shared long-running loop — the described arena-growth risk doesn't exist in this architecture. |

### flash_8 — Project Root / Build Config

| # | Description | Status | Live-tree evidence |
|---|---|---|---|
| 49 | `skald_codegen.exe` (1.1MB binary) tracked in git | **live** | `.gitignore:2,7`; `git ls-files` confirms tracked. |
| 50 | Node version check `-ne 22` in scripts conflicts with `package.json`'s `>=22` | **live** | `scripts/setup-dev.ps1:49`, `build-release.ps1:51` vs `package.json:29`. |
| 51 | Odin toolchain download has no checksum verification | **live** | `setup-dev.ps1:67`. |
| 52 | No app icon / code-signing config | **live** | `forge.config.ts` — confirmed absent. |
| 53 | Hard Windows-only lock-in (.bat scripts, no .sh) | **live** | 5 `.bat` scripts in `skald-backend/`, zero `.sh` equivalents. |
| 54 | `build_codegen.bat` relative-path fragility | **live** | `build_codegen.bat:14`, comment at `:12` admits the assumption. |
| 55 | Odin zip extraction creates nested directory artifacts | **live** (tolerated, not fixed) | `setup-dev.ps1:70-71` — recursive `Get-ChildItem` search works around it rather than flattening. |
| 56 | ESLint disables type-safety rules | **live** | Same as BUGS.md #25 above — confirmed a third time. |
| 57 | Duplicate DOM test drivers (`happy-dom` + `jsdom`) | **live** | `package.json:55-56`. |
| 58 | `extraResource` hardcodes `.exe` | **live** | `forge.config.ts` — `extraResource: ['./skald_codegen.exe', '../examples']`. |
| 59 | Odin install logic triplicated across 3 files | **live** | `setup-dev.ps1:67`, `ci.yml:25`, `release.yml:39`. |
| 60 | CI is Windows-only, re-downloads Odin every run | **live** | `ci.yml:14,25,45`; `release.yml:14,39` — no `.tools/` cache. |
| 61 | Stale branch reference in release docs | **live** (path moved) | Now at `examples/docs/RELEASING.md:40` — `docs/RELEASING.md` no longer exists at repo root; content relocated but the stale `review-fixes` reference persists. |
| 62 | `SKALD_ODIN` env var undocumented in README | **live** | Confirmed used in 3 scripts, zero mentions in `README.md`. |

### pro_1 / pro_2 — UI Architecture & Build

| # | Description | Status | Live-tree evidence |
|---|---|---|---|
| 63 | `app.tsx` "god component" orchestrates 6 major hooks + global keydown listeners; no global state manager | **live** | `app.tsx` is 528 lines orchestrating all six hooks named in the original report; no Zustand or equivalent in `package.json`/`src` (only a transitive lockfile entry). See Finding F-B09b-8. |
| 64 | Heavy reliance on inline styles instead of CSS modules/Tailwind | **live** | 144 inline `style={{...}}` occurrences across 20 files. |
| 65 | `tsconfig.json` uses `commonjs`/`node` resolution rather than `bundler`/`NodeNext` | **live** | `skald-ui/tsconfig.json:4,13`. |
| 66 | `main.ts` uses synchronous fs calls, blocking Electron main thread | **live** | `main.ts` — `writeFileSync`(99,324), `readFileSync`(144,263,346,375), `mkdirSync`(244), `rmSync`(251), `existsSync`(284). |

### pro_3 — Backend Architecture

| # | Description | Status | Live-tree evidence |
|---|---|---|---|
| 67 | `codegen.odin` is a ~2,500-line monolith mixing multiple concerns | **live** (grown) | Confirmed 2,690 lines, still one file, still mixing bus-domain analysis, per-node codegen, sequencer/p-lock logic, and project/WASM-shim emission. |

### pro_4 — Testing & DevOps

No bugs reported — this report is unreserved praise for the two-tier (golden + FFT-acceptance)
testing methodology and CI setup. Nothing to verify; the praised structure (`run_golden.bat`,
`run_acceptance.bat`, Vitest suite, `ci.yml`) is still intact and in active use per the file
citations gathered by the other agents in this pass, so the praise still holds directionally.

## Aggregate counts

- **BUGS.md "fixed" queue**: 30/30 confirmed durable (28 fixed/obsolete as claimed, 1 fixed via a *later, better* fix than the one described, 1 fixed-but-with-orphaned-fixture). **0 regressions.**
- **BUGS.md open-queue items**: 1 fixed, 1 superseded by Tier 1, 2 unverifiable (open-ended by nature).
- **Everything else (flash_1–flash_8 excl. BUGS-adjacent, pro_1–pro_4)**: of 119 distinct findings, **111 live**, 5 fixed, 2 obsolete, 1 unverifiable-as-stated.
- **Overall**: of ~138 distinct prior findings, roughly **80% are still live**, concentrated almost entirely in the architecture/hygiene/memory-safety reports rather than the discrete bug list — exactly the reverse of what "predates a large amount of development" would predict if that development had touched these areas. It clearly touched node coverage, codegen correctness, and UI-bug fixes (BUGS.md); it did not touch backend memory hygiene, `os.exit()` patterns, ESLint policy, undo-stack architecture, or the app.tsx/state-manager question.

## Findings (new, still-live, not already covered by Tier 1/2)

### F-B09b-1: Duplicate node ID rename in `json.odin` leaves connections silently pointing at the wrong node
- **kind**: code-bug
- **area**: backend / graph parsing (`skald-backend/core/json.odin`)
- **severity**: high
- **confidence**: high
- **evidence**: `json.odin:183-200` — when a node ID collides, the node is renamed to `<base>_dup<N>` and a warning is printed, but the warning text itself admits the defect: `"Warning: duplicate node id %q - renamed to %q. Connections still target the first node with this id."` (`:196-200`). Connections in `graph.connections` are never repointed at the renamed node.
- **detail**: A user who somehow ends up with two nodes sharing an ID (hand-edited JSON, a merge/paste bug, or a future UI regression) gets a patch that loads and compiles without error, but any wire intended for the second (renamed) node silently resolves to the first node's output/input instead — a correctness bug with no diagnostic beyond a build-time stderr line the UI never surfaces. This is the same bug the health-review's `flash_5` report caught in the older, smaller tree; it is unchanged in the current 3x-larger backend, confirmed by an independent live-tree agent read of the exact same lines.
- **suggested fix**: Either walk `graph.connections` and rewrite any reference from `base` to `candidate` for the specific connections that were authored against the *second* occurrence (requires tracking provenance at parse time), or reject the duplicate ID outright as a hard validation error — matching this codebase's own stated philosophy elsewhere of "fail loudly on wires the generators would ignore" (per Tier 1's citation of `graph_validate.odin:9-19`).

### F-B09b-2: `build_project_from_raw` never populates `project.sequencer_tracks` — raw-format Project JSON silently drops project-level sequencer tracks
- **kind**: code-bug
- **area**: backend / graph parsing (`skald-backend/core/json.odin`, `types.odin`)
- **severity**: medium (usage-scoped)
- **confidence**: high
- **evidence**: `types.odin:137-144` — `Project_Data_Raw` (the raw-JSON deserialization target for the non-graph "Project" input format) has **no `sequencer_tracks` field at all**. `json.odin:287-289`'s loop that sanitizes `project.sequencer_tracks[i].target_node_id` therefore always iterates zero elements on this path — there is nothing to sanitize because nothing was ever copied in. The graph-format path (`build_project_from_graph`, `json.odin:324,364`) is unaffected and correctly populates tracks.
- **detail**: This is distinct from the already-fixed `BUG-GRAPH-PARAMETERS-VS-DATA` (which was about instrument metadata/subgraph fields on the *graph* input format). This is a live gap specifically in the raw *Project* JSON format's sequencer-track handling. Whether this matters in practice depends on how often that input format is actually exercised versus the graph-save format the UI emits — the health-review's own BUGS.md notes it "did not run a full round-trip for any single patch" and that the two live formats are the UI-runtime `Project` shape and the graph-save shape, so this is worth a quick check of whether `useCodeGeneration.ts` still emits raw-Project-shaped JSON anywhere before treating this as user-facing.
- **suggested fix**: Add a `sequencer_tracks` field to `Project_Data_Raw` and copy it across in `build_project_from_raw`, mirroring what `build_project_from_graph` already does correctly.

### F-B09b-3: `ParameterPanel.tsx`'s stale-closure clobber and mixer/mapper/midiInput bypass are both still exactly as originally reported
- **kind**: code-bug
- **area**: UI / node inspector (`skald-ui/src/components/ParameterPanel.tsx`)
- **severity**: high
- **confidence**: high
- **evidence**: `ParameterPanel.tsx:209-210` — `toggleParameterExposure` still constructs `{...nodeToUpdate.data, exposedParameters: newExposed}` from a closure-captured `nodeToUpdate`, not a delta. `ParameterPanel.tsx:338-377` still hardcodes inline JSX for `mixer`/`mapper`/`midiInput` ahead of the generic `NodeParameterControls` fallback (`:382-388`); the inline mixer editor still has no `inputCount` control, so a mixer selected via this panel is stuck at whatever channel count it already has.
- **detail**: Both are user-reachable today: toggling a parameter's "expose" checkbox while a slider drag is in flight on the same node will drop the slider's most recent value (classic last-writer-wins race between two update paths on the same node). Separately, any user who selects a Mixer/Mapper/MidiInput node loses the ability to add/remove mixer channels from the side panel — they'd have to know to interact with the node's on-canvas card instead, which most users won't discover unprompted.
- **suggested fix**: For the clobber — change `toggleParameterExposure` to call `onUpdateNode(selectedNode.id, { exposedParameters: newExposed }, subNodeId)`, matching the delta pattern already used correctly by its sibling `handleParameterChange` in the same file. For the bypass — delete the inline `mixer`/`mapper`/`midiInput` branches and let all three fall through to `NodeParameterControls`, per the health-review's own original recommendation (still valid).

### F-B09b-4: Narrow fix example — `NumberInput.tsx`'s unguarded `.toString()` moved, didn't close
- **kind**: code-bug
- **area**: UI / common controls (`skald-ui/src/components/common/NumberInput.tsx`)
- **severity**: low
- **confidence**: medium
- **evidence**: The original finding cited an unguarded `useState<string>(value.toString())` at construction time; that specific call site is now guarded. But `NumberInput.tsx:108`'s `handleFocus` does `setLocalValue(value.toString())` with the same lack of an undefined/null guard.
- **detail**: This is a clean instance of the pattern the brief asked to watch for: the *symptom* the reviewer originally caught (a crash on `undefined.toString()`) can still occur today, just triggered by focusing the field rather than mounting the component, because the guard was added at one call site and not at the underlying value's other consumer in the same file.
- **suggested fix**: Guard at the value boundary once — e.g. derive a `safeValue = value ?? 0` near the top of the component and use it everywhere `value.toString()` appears, rather than patching each call site individually.

### F-B09b-5: Dual undo/redo stacks remain fully desynchronized, including the load-time reset gap
- **kind**: code-bug
- **area**: UI / state management (`skald-ui/src/app.tsx`, `useGraphState.ts`, `useSequencerState.ts`, `useFileIO.ts`)
- **severity**: high
- **confidence**: high
- **evidence**: `app.tsx:217-226` still fires both `handleUndo()`/`handleRedo()` (graph) and `sequencerStateHooks.handleUndo()`/`handleRedo()` (sequencer) on every Ctrl+Z/Y. `useFileIO.ts:135-136` resets graph history on project load but `useSequencerState.ts:169-172`'s `loadTracks` calls `saveHistory()` (appending to sequencer history) rather than clearing it.
- **detail**: Anyone who does an uneven number of graph edits vs. sequencer edits (the overwhelmingly common case) will find a single Ctrl+Z reverting the wrong pair of things, and anyone who loads a new project after editing an old one will find sequencer-undo can revert to the *previous file's* track state while the canvas shows the new file's graph — a data-integrity trap on one of the most basic recovery actions in the app.
- **suggested fix**: As the health-review itself proposed and remains the right shape of fix — unify into one history stack keyed on a combined `{graph, sequencer}` snapshot, or at minimum make `loadTracks` call the sequencer's history-clear (not history-save) path to close the load-time half of the bug immediately, ahead of the larger unification.

### F-B09b-6: WASM hot-swap race condition on rapid Stop→Play is still unguarded
- **kind**: code-bug
- **area**: UI / audio engine (`skald-ui/src/hooks/nodeEditor/useWasmAudioEngine.ts`)
- **severity**: medium
- **confidence**: medium
- **evidence**: `useWasmAudioEngine.ts:279-318,291,294` — the only guard against a stale in-flight rebuild landing in a new worklet instance is `if (!workletNode.current) return`, which is true precisely when a *new* worklet was created during the await — the failure case, not a safeguard against it.
- **detail**: A user who stops and quickly restarts playback while a background parameter/topology rebuild is compiling can get the old (pre-stop) graph's compiled WASM binary hot-swapped into the freshly created AudioWorklet, producing audio for the wrong patch state until the next rebuild completes and overwrites it. This would present as "I changed something and briefly heard the old sound" — hard to reproduce reliably, easy to dismiss, exactly the class of bug `BUG-AUDIO-ODDITIES-INVESTIGATION` (BUGS.md B2, still open/unverifiable) is trying to catch.
- **suggested fix**: Attach an incrementing generation/session ID to each rebuild request at schedule time; discard the `postMessage` if the active session ID has changed by the time the build resolves.

### F-B09b-7: `invoke-codegen` IPC handler still has no timeout and no stdin backpressure/error handling
- **kind**: risk
- **area**: Electron main process (`skald-ui/src/main.ts`)
- **severity**: medium
- **confidence**: high
- **evidence**: `main.ts:75-167` (the `invoke-codegen` handler) has no timeout wrapper, unlike `runProcess`'s `PROCESS_TIMEOUT_MS` (`:196-223`) which only guards the WASM-preview path. `child.stdin.write(graphJson)` at `:164-165` ignores the boolean return value; no `child.stdin.on('error', ...)` exists on either process-spawn path.
- **detail**: A hung or misbehaving `skald_codegen.exe` (corrupted install, antivirus lock, infinite loop from a pathological graph) wedges the "Generate Code" button's IPC promise forever with no user-facing timeout or recovery, and a spawn failure (missing binary) risks an unhandled stream error on `child.stdin` crashing the whole main process rather than surfacing a clean error to the renderer.
- **suggested fix**: Apply the same timeout+cleanup pattern `runProcess` already uses to the `invoke-codegen` handler directly (or route it through `runProcess` instead of a bespoke inline spawn), and add a no-op `child.stdin.on('error', ...)` handler to swallow EPIPE-class errors the way the health-review's own suggested refactor already showed.

### F-B09b-8: `app.tsx` god-component / no global state manager — unaddressed across two review passes
- **kind**: design
- **area**: UI architecture (`skald-ui/src/app.tsx`)
- **severity**: medium
- **confidence**: high
- **evidence**: `app.tsx` is 528 lines directly orchestrating `useGraphState`, `useWasmAudioEngine`, `useFileIO`, `useCodeGeneration`, `useSequencerState`, `useInstrumentRegistry`, plus a global keydown listener at line 270. No Zustand or equivalent store exists in `package.json`'s direct dependencies.
- **detail**: This is purely an architecture/maintainability finding (not a bug), flagged identically by both `pro_1` and `pro_2` in the old review and unchanged today. It's included here because it directly underlies several of the *other* still-live findings in this file — the dual undo-stack problem (F-B09b-5) and the instrument-registry double-history-entry bug are both symptoms of state being split across six independently-owned hooks with no single source of truth to coordinate them, rather than independent bugs. Fixing the root cause here would make several of the smaller findings above cheaper to fix correctly (a unified store), rather than each needing its own point patch.
- **suggested fix**: No new recommendation beyond what was already proposed (adopt Zustand or similar, extract a `<GraphWorkspace>` component, move shortcuts to a `useGlobalShortcuts()` hook) — restating it here because two independent review passes have now recommended it with no action taken.
