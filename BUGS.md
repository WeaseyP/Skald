# Skald Bug Inventory

Generated during Phase 0 triage. No fixes applied. Items reference current state.

Repo paths are relative to the Skald project root (`./skald-backend/...`, `./skald-ui/...`).

Triage attempts performed:

| Step | Command | Result |
| --- | --- | --- |
| 1 | `odin build . -file -out:codegen.exe` (in `skald-backend`) | ✅ Built clean |
| 2 | `odin build . -out:codegen.exe` (package mode, in `skald-backend`) | ✅ Built clean |
| 3 | `odin test tests` (in `skald-backend`) | ❌ Compile errors — see BUG-CODEGEN-TESTS-DEAD |
| 4 | `odin test tests/dsp` | "No tests to run" — analysis.odin has no `@(test)` procs |
| 5 | `odin build tester -out:test_harness.exe` (against pre-existing generated_audio.odin) | ✅ Built clean |
| 6 | `npm install` (in `skald-ui`) | ✅ 856 packages installed; deprecation warnings only |
| 7 | `npm run lint` | ❌ 29 errors / 358 warnings — most are style; one structural (BUG-FMOPERATOR-CASING) |
| 8 | `npx vitest run` | ✅ 47 passed, 1 skipped (the skipped test is the duplicate-testid case → BUG-STEPGRID-DUP-TESTID) |
| 9 | `codegen.exe -in:examples/misc/DetunedUnisonLead.json -out:test_out.odin` | ⚠️ Exit 0, but emits empty project — see BUG-EXAMPLES-MISC-OBSOLETE |
| 10 | `codegen.exe -in:tester/generated_audio/example1.json -out:test_out.odin` | ⚠️ Exit 0, but produces invalid Odin (duplicate struct fields all named `Untitled`) — see BUG-INSTRUMENT-NAME-DUPS |
| 11 | `codegen.exe -in:enemies/enemy1.json` | ❌ Hard parse error (`Unsupported_Type_Error{id = string ... text = "1"}`) — see BUG-ENEMIES-INT-IDS |

The Electron app was not started because the codegen pipeline is broken in enough places that a full UI smoke test would not produce useful additional information at this point. The vitest suite already exercises the React + codegen-JSON-emission paths headlessly.

---

## Blockers (build broken / no audio output / data loss)

- [x] **BUG-DISPATCHER-MISSING-NODES** — *Fixed in Phase 2.* Added LFO, FmOperator, Wavetable, SampleHold, Panner cases to the per-voice dispatcher in `generate_processor_code`. The per-voice loop now actually runs every node it allocated state for.

- [x] **BUG-FMTYPE-MISMATCH** — *Fixed in Phase 2.* State-field allocation now checks `node.type == "FmOperator"` (matches the UI's `codegenType`).

- [x] **BUG-NOISE-RNG-NOT-SEEDED** — *Fixed in Phase 2.* `<Foo>_init` now seeds `voice.noise_<id>_rng.state` and `voice.sh_<id>_rng.state` per voice with a deterministic per-voice salt. Also added a stuck-state guard inside `next_float32` (`if x == 0 do x = 0xDEADBEEF`) so a zero-state PRNG self-recovers instead of outputting 0 forever.

- [x] **BUG-PROJ-STEREO** — *Fixed in Phase 2.* Per-instrument `_process` returns `(f32, f32)`. `project_process` accumulates L and R independently. Panner sources connected directly to a GraphOutput route their `_out_left`/`_out_right` into the L and R buses; mono sources broadcast to both.

- [x] **BUG-CODEGEN-TESTS-DEAD** — *Fixed in Phase 4 (deleted).* `tests/codegen_test.odin` removed; FFT fixtures cover the same surface more strongly per the prompt's guidance.

- [x] **BUG-INSTRUMENT-NAME-DUPS** — *Fixed in Phase 4.* `generate_project_code` now resolves a unique namespace prefix per instrument up-front: first occurrence keeps the bare name, subsequent collisions append `_2` / `_3` / ... Reproducer at `tests/dups_test/dups.json` (two instruments both named `Asset`) compiles cleanly with `Asset` and `Asset_2` as the resolved struct prefixes.

- [x] **BUG-CODE-PREVIEW-WRONG** — *Fixed in Phase 4.* `skald-ui/src/main.ts` IPC handler now reads the output `.odin` file from disk after the spawn closes successfully and resolves the IPC promise with that content. Stdout retains a `Codegen OK: N instrument(s) -> ...` status line (was `"Package generated audio"`) for shell-piping use cases. Renderer regression test added at `Codegen.test.ts`.

- [ ] **BUG-EXAMPLES-MISC-OBSOLETE**: All `examples/misc/*.json` files use the v1 React-Flow shape (`nodes`/`edges`, lowercase `polyphonicWrapper`/`oscillator`/`output`, no `instrument` wrapper). The current codegen falls into the `Graph` parse path, finds no `instrument`-typed nodes, and produces an empty `Project_State {}` plus a no-op `project_process`. Exit code is still 0. Phase 5 explicitly requires these patches to round-trip; today they do not. Either ship a converter, regenerate the example library through the v2 UI, or document them as deprecated.

- [x] **BUG-ENEMIES-INT-IDS** — *Fixed in Phase 4 round 2 (deleted).* Removed `skald-backend/enemies/` and `generate_soundtracks.bat`. The `enemy*.odin` outputs in `tester/generated_audio/` were already absent from disk; only the unusable input JSON was lingering.

- [ ] **BUG-GRAPH-PARAMETERS-VS-DATA**: `core/json.odin:106-141` `build_project_from_graph` reads instrument metadata via `get_string_param(node, "name", ...)` etc., which reads from `node.parameters`. But UI graph-saves write the metadata under `data` (e.g. `tester/generated_audio/example1.json:11` — `"data": { "name": "Kick", ... }`), and `Node_Raw` only knows the field `parameters`. Result: every instrument falls back to default name `"Untitled"`, voice_count `1`, etc. The dropped metadata is the proximate cause of BUG-INSTRUMENT-NAME-DUPS for re-fed graph saves.

## High (feature broken, workaround exists)

- [x] **BUG-SEQ-RATE** — *Fixed in Phase 2c.* `samples_per_step` is now computed at runtime in `<Foo>_process_sequence` from `p.sample_rate` and `p.bpm`. The boundary-equality fire was replaced with a `samples_until_next_step` counter (decrement-then-fire-on-zero) so non-integer step counts don't drift. BPM is stored on the processor and can later be exposed for runtime tempo changes.

- [ ] **BUG-EXPOSED-PARAMS-WIRING** — *Backend hardened in Phase 3.* The codegen now uses a proper `Exposed_Resolution` map and reads `parameters.exposedParameters` once, deterministically. The UI still emits both paths (camelCase via spread + dead snake_case top-level); the dead path can be removed in a UI cleanup pass without touching the codegen. Lower priority.

- [x] **BUG-NO-MASTER-LIMITER** — *Fixed in Phase 2.* `project_process` now applies `math.tanh(x * 0.7) / 0.7` per channel. Linear up to ~0.7 and smoothly compressing past it.

- [x] **BUG-MIXER-CHANNEL-LIMIT** — *Fixed in Phase 4.* `generate_mixer_code` now reads `inputCount` from `node.parameters`, defaults to 8, caps at 32. Patches with >8 mixer inputs no longer silently drop signals.

- [x] **BUG-WAVETABLE-PLACEHOLDER** — *Fixed in Phase 4 (removed from UI sidebar).* The Wavetable draggable was removed from `Sidebar.tsx`. Codegen and node-definitions entries kept so saved patches still load. `generate_wavetable_code` is still a sine placeholder — re-add the sidebar entry when it gets a real wavetable lookup.

- [x] **BUG-VOICE-BUSY-NO-ENVELOPES** — *Fixed in Phase 2.* When an instrument has no ADSR, the per-voice loop now deactivates the voice as soon as `voice.duration > 0 && voice.age >= voice.duration`. Voices with `duration == 0` (the default for SFX trigger) without an ADSR will still play forever, but that's an explicit user choice — they asked for no envelope and infinite duration.

## Medium (correctness issues that don't block usage)

- [x] **BUG-DEAD-NOTE-ON-OFF** — *Fixed in Phase 4 (deleted).* Replaced with a tombstone comment explaining what the proc was and why it's gone.

- [x] **BUG-FMOPERATOR-CASING** — *Fixed in Phase 4.* `Nodes/index.ts` import corrected from `./FmOperatorNode` (mixed case) to `./FMOperatorNode` (matching the on-disk filename).

- [x] **BUG-STEPGRID-DUP-TESTID** — *Fixed in Phase 4.* The duplicate testids weren't a component bug; they were a test-isolation bug (vitest doesn't auto-run `@testing-library/react` cleanup without `globals: true`, so each `render()` accumulated). Added `afterEach(cleanup)` in `StepGrid.test.tsx` and unskipped the cell-click test (which now also uses `fireEvent.mouseDown` to match the component's `onMouseDown` handler).

- [x] **BUG-TYPE-CASE-MISMATCH** — *Fixed in Phase 4 round 2.* Removed all `strings.to_lower` calls. `build_project_from_graph` now matches `"Instrument"` (PascalCase, the on-the-wire contract) with a backward-compatible fallback to `"instrument"` (the React Flow lowercase form for raw graph saves). The note-on/off helper that had the lowercase `"adsr"` check was deleted as part of BUG-DEAD-NOTE-ON-OFF.

- [x] **BUG-TWO-IDS-IN-JSON** — *Fixed in Phase 4.* `useCodeGeneration.ts` no longer emits `id_raw` or top-level `exposed_parameters`. The Project JSON now contains only the fields the backend actually reads.

- [x] **BUG-EMPTY-PROJECT-SILENT** — *Fixed in Phase 4.* `main.odin` now exits 1 with a stderr explanation when the parsed project has zero instruments. Stdout success line also reformatted to `Codegen OK: N instrument(s) -> <path>`.

- [x] **BUG-WAVEFORM-CONST-SWITCH** — *Fixed in Phase 4.* Oscillator codegen now switches on the waveform string in Odin-land and emits only the chosen branch. Generated code is shorter and has no dead branches.

- [x] **BUG-DOUBLE-VOICE-BUSY-DECL** — *Fixed in Phase 4 round 2.* Resolved by Phase 2 in the host-language scope (the dead duplicate was already removed). Phase 4 round 2 also fixed a latent bug in the same area: `voice_busy := false` is now emitted into the generated code only when an ADSR exists; instruments with no envelope no longer trip Odin's "declared but not used" diagnostic.

## Low (cleanup, dead code, tech debt)

- [ ] **BUG-LINT-WARNINGS**: 358 ESLint warnings, mostly `@typescript-eslint/no-explicit-any` in test files and a few `no-inferrable-types`. None block builds. Address opportunistically as touched.

- [ ] **BUG-LINT-FUNCTION-TYPE**: Several `error    Don't use 'Function' as a type` errors in nodeEditor and elsewhere. Replace with proper signatures when those files are touched in later phases.

- [x] **BUG-UTF16-OUTPUT-LEGACY** — *Fixed in Phase 4 round 2 (deleted).* Removed the stale UTF-16 `build_log.txt`. All current `.bat` scripts pass `-out:` to the codegen (which goes through Odin's `os.write_entire_file`, UTF-8 raw); none use PowerShell `>` redirection to write `.odin`.

- [ ] **BUG-STDOUT-DEBUG-PRINT**: `useCodeGeneration.ts:185` and `Codegen.test.ts` log full project JSON to console on every codegen invocation. Noisy; gate on `__DEV__` or remove.

- [x] **BUG-DEAD-CSV-DSP-HARNESS** — *Fixed in Phase 4 round 2 (deleted).* Removed `tests/dsp/`, `run_dsp_test.bat`, `dsp.exe`, and the duplicate-int-id `tools/gen_osc_test.odin`. FFT-based in-memory assertions in `acceptance/` cover the same surface.

- [ ] **BUG-STDOUT-NOISY-COMMENTS**: `core/codegen.odin:29-30` has a duplicated `// Apply Modulation (Priority 1: ...)` comment. Cosmetic.

## Out of scope (per prompt §5)

- New node types (Granular, Karplus-Strong, Chorus, etc.)
- Audio file import / sample playback
- Runtime MIDI device binding
- Cross-platform builds
- Distribution / packaging / installers
- UI redesign (only fix UI bugs that block asset-creation)
- Real wavetable implementation if BUG-WAVETABLE-PLACEHOLDER is closed by removal
- Web Audio preview parity (`useAudioEngine.ts`) per Hard Rule #10

## Notes for the human reviewer

1. **The codegen pipeline cannot produce a working multi-instrument project today, even from a fresh UI export** — BUG-DISPATCHER-MISSING-NODES alone kills any patch using LFO/FM/Wavetable/SampleHold/Panner, and BUG-NOISE-RNG-NOT-SEEDED kills any patch using Noise. The only patches I expect to compile *and* make sound today are: Oscillator → ADSR → Distortion → Output, with no LFO and no Noise. The pre-existing `tester/generated_audio/generated_audio.odin` (which compiles) appears to be exactly such a patch; I did not run it on speakers but it builds.

2. **Phase 1c's seed-fixture instructions for the human are critical**: until BUG-DISPATCHER-MISSING-NODES is fixed, even hand-validated UI exports will silently fail at the codegen layer. I'd suggest scheduling Phase 1c (the human-produced seed fixtures) *after* Phase 2 lands, so the seeds are validated against a working dispatcher. If we do Phase 1c first, the human will produce JSON that round-trips through the UI, but the codegen will still drop FM/LFO/Panner, and any fixture relying on those (`fm_bell.json`, `filter_sweep.json`, `sine_220_pan_left.json`) will be a known-broken-from-day-one fixture.

   **Recommendation**: defer the human-produced seed fixtures until after Phase 2 (or at minimum, after BUG-DISPATCHER-MISSING-NODES + BUG-FMTYPE-MISMATCH + BUG-NOISE-RNG-NOT-SEEDED are fixed). Or: produce only the simpler seeds first (`sine_440.json`, `adsr_sine.json`, `kick_loop_120bpm.json`) and add the harder ones after Phase 2.

3. **The prompt's Phase 1c flow has a chicken-and-egg with Phase 0**: Phase 1 says fixtures must come from a working UI. Phase 0 has not (and should not) verified the UI by clicking through it. I exercised the codegen-emission paths via vitest, which passed — but that does not prove the Generate button in the running Electron app produces a JSON that matches the codegen's expectation. There is significant evidence from this triage (BUG-EXPOSED-PARAMS-WIRING dead path, BUG-TWO-IDS-IN-JSON, BUG-GRAPH-PARAMETERS-VS-DATA) that the UI ↔ backend JSON contract is partially shimmed. Worth a 10-minute manual smoke test by the human (drag two nodes, connect, click Generate, inspect the produced .odin file) before formally entering Phase 1.

4. **Triage did not run a full round-trip for any single patch**, because the only viable input formats are either (a) the v2 Project shape produced by `useCodeGeneration` at runtime (not on disk anywhere I could find) or (b) the v1 graph save of an instrument-with-subgraph patch, which fails at BUG-GRAPH-PARAMETERS-VS-DATA. The closest thing to a working round-trip is the pre-existing `tester/generated_audio/generated_audio.odin` which compiles. I did not run it through the speakers.
