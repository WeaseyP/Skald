# Skald Roadmap — Issue Tracker

> **Last updated:** 2026-08-20
> **Wave A:** ✅ Complete (13/13 packets landed)
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
- [ ] **B1** (M) — Unify master volume and limiter across preview, export, and game integration.
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

### B3 — Undo Made Trustworthy
- [ ] **B3** (M) — Consolidate graph, sequencer, and session into one history stack.
  - One ordered history of `{nodes, edges, tracks, session}` behind `pushHistory(label)`
  - Add 4 untracked call sites (palette drop, Import, Export-Step, transport fields)
  - Snapshot on first `dragging:true` tick; gesture-scoped coalescing
  - `loadTracks` clears instead of pushing; visible Undo/Redo buttons with stack depth

### B4 — Session Trust
- [ ] **B4** (M) — Implement session safety features.
  - Dirty flag; confirm on Load/Import when dirty
  - Filename + `•` in window title
  - Autosave to `userData/recovery.json` on 30s debounce with restore offer
  - Atomic save (`.tmp` → rename)

### B5 — Sequencer Data Integrity
- [ ] **B5-1** (S) — Clamp/grey steps beyond `min(track.steps, patternSteps)` in Step Grid and Piano Roll; handle lowering global steps — **SKB-010** (high)
- [ ] **B5-2** (M) — Pitch-aware chord addressing in Step Grid, Step Properties, right-click-erase, and `handleExportStep` — **SKB-025** (medium)
- [ ] **B5-3** (S) — Piano Roll range to 108 or scrollable (currently hardcoded MIDI 21–84) — **SKB-026** (medium)
- [ ] **B5-4** (S) — Surface unresolvable P-lock keys in Step Properties editor; validate on graph change instead of failing the whole build — **SKB-009** (high)
- [ ] **B5-5** (S) — Warn when a non-numeric P-lock will be dropped at serialization — **SKB-045** (medium)
- [ ] **B5-6** (S) — Fix `bpmSync: true` with no `syncRate` key silently becoming 1/4 — **SKB-058** (medium)

### B6 — First Hour
- [ ] **B6-1** (M) — Auto-wrap loose graphs on load/Play with a toast (26 files affected)
- [ ] **B6-2** (S) — Exclude `archive/` + `to implement/` from `extraResource`; delete `PulsarBeam.json` — **SKB-019** (high)
- [ ] **B6-3** (S) — Curated `examples/start-here/` folder
- [ ] **B6-4** (S) — Fix the two README 404s; link the manual above the fold
- [ ] **B6-5** (S) — Electron Help menu (Manual / Examples / About with codegen stamp)
- [ ] **B6-6** (S) — Default first-run patch that makes a sound in 30 seconds
- [ ] **B6-7** (S) — Rename "Generate Code" to "Download Code" / "Export .odin Package" — the WASM preview already runs the real generated code; the button just downloads it now

### B7 — Composition Correctness
- [ ] **B7-1** (M) — Panner: normalize pan law to `cos/sin × 1.4142`; mono fallback becomes pan-independent pass-through — **SKB-013** (critical)
- [ ] **B7-2** (M) — `is_playing` gains a codegen-computed bus-tail countdown for Delay/Reverb — **SKB-016** (high)
- [ ] **B7-3** (M) — Cross-domain modulation: hoist voice-to-bus LFO/S&H/Noise/Mapper sources into the bus domain; hard-error the mixed case — **SKB-017** (critical)
- [ ] **B7-4** (S) — `_init` clears Delay buffers, `p.voices = {}`, zeroes bus-domain state; add double-init test — **SKB-018** (high)
- [ ] **B7-5** (S) — Clamp `note` [0,127] / `velocity` [0,1] in `_note_on`/`_trigger` — **SKB-029** (medium)
- [ ] **B7-6** (S) — Track held notes and replay them after hot-swap — **SKB-023** (medium)

### B8 — Flagship Content
- [ ] **B8-1** (S) — Fix `four-bar-song`: delete 3 `MidiInput.pitch → input_freq` wires; kick pitch-env depth 120 → ~1.5; add `session` block — **SKB-014** (critical)
- [ ] **B8-2** (S) — Fix `sax3.json`: same two defects + ADSR Gate→In relabel — **SKB-015** (high)
- [ ] **B8-3** (S) — Build-time warning when an exponent-port's authored contribution can exceed ±10

### B9 — Preflight Validation + CLI Hardening
- [ ] **B9-1** (M) — Pre-emission validation pass: nested Instruments rejected with purpose-built message — **SKB-028** (high)
- [ ] **B9-2** (S) — Duplicate node IDs become a hard error instead of silent mis-wire — **SKB-021** (high)
- [ ] **B9-3** (S) — `-check` and `-version` CLI flags; port `assertCodegenTargetSafe` into `main.odin`
- [ ] **B9-4** (S) — `invoke-codegen` gets timeout + stdin error handling — **SKB-039** (medium)
- [ ] **B9-5** (S) — Reject `type === 'instrument'` from Create-Instrument selection

### B10 — Peak Meter + Clip LED
- [ ] **B10** (S) — Stereo peak-hold meter with clip LED in transport dock, tapped before JS master gain.

### B11 — Parameter Panel Correctness
- [ ] **B11** (S) — `toggleParameterExposure` sends delta, not stale full-object spread; delete inline bypass branches.

### B12 — Generated-API Contract Minimum
- [ ] **B12** (S) — Thread rule in header; per-asset exposed params + setter styles listed; AUTO-GENERATED banner + generator stamp + input hash.

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
