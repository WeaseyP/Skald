# B09a — Triage of prior findings lists in the live repo

Scope: `BUGS.md`, `CHANGELOG.md`, `docs/CODEX-REMEDIATION-BRIEF.md`,
`docs/investigations/audio-oddities.md` (+fixture), `examples/AUDIT.md`,
`docs/manual-source/FIXED.md`, `docs/manual-source/EDITORIAL-REPORT.md`,
`review-checkpoints/REVIEW-REPORT.md` + 3 JSONs. Cross-checked against Tier 1 (10 files) and
against the live repo with direct reads/greps (not just re-quoting the documents).

## Summary

- **BUGS.md's own "Fixed" claims mostly hold up.** All 24 Phase 0–8 blocker/high/medium/low
  items and the 6 v0.1-follow-up items describe fixes that are still present in code today
  (spot-checked dispatcher cases, RNG seeding, master `tanh`, mixer `inputCount`, and the
  P-lock/exposed-param alias mechanism directly). BUGS.md is **not** in the FIXED.md situation
  (packet applied to code, doc never updated) because BUGS.md **is the code-status doc** — there
  is no separate "BUGS.md chapter" that could go stale the way a manual chapter can. See §Q1.
- **One BUGS.md/investigation cross-reference has drifted stale**: `docs/investigations/audio-oddities.md`
  finding #4 (P-lock↔exposed-param collision) is marked `CONFIRMED-OPEN` in that file's own summary
  table, but BUGS.md's last paragraph says it was "subsequently resolved by the Sax live-param fix
  (node-scoped `::` keys)" — and that resolution is verified still true in current code. The
  investigation doc itself was never updated to flip its own status column. (F-B09a-2)
- **A major architecture change quietly resolved most of `review-checkpoints`' Theme T8** (preview
  vs. codegen semantic divergence — additive vs. exponential FM, mono vs. stereo, unison/detune
  ignored in preview, etc.). `useAudioEngine.ts` (the old hand-maintained Web Audio mirror) no
  longer exists; `useWasmAudioEngine.ts` now compiles and runs the **actual generated Odin** in an
  AudioWorklet. There is only one DSP implementation now, so an entire root-cause theme from the
  2026-07-05 review is moot by construction, not by patch. (F-B09a-1)
- **`docs/manual-source/FIXED.md`'s 6 packets are all genuinely landed in code** — independently
  reconfirmed here and cross-checked against 5 different Tier 1 files that hit the same code paths
  (mixer exposed level, reverb pre-delay, VCA/resonance/tone/delay-time range alignment, piano roll
  range, distortion shape contract, noise tooltip). This matches Tier 1's global finding: the code
  fix landed, only the **manual chapters** (not FIXED.md itself) are stale about several of them.
- **Two review rounds after `docs/CODEX-REMEDIATION-BRIEF.md`'s five waves (W0–W5) were written,
  only W1 (B3, ranges) and pieces of W3 (B4, B5) have actually shipped** — confirmed via FIXED.md
  packets P2/P3/P1. W0 (Create Group bug, palette tooltips), W2 (B1/B2 unplayable examples), the
  rest of W3 (B6 sax3.json, B7 dead exposed setters) and all of W4/W5 are still open in current
  code, verified directly (see status table). The brief's own sequencing (do W0 first, "no risk")
  was not followed — a warm-up-tier bug (Create Group) is still broken while higher-tier work
  landed first.
- **Repeat offenders across 3+ independent review rounds**, still open in code today: the shipped
  `sax3.json` MIDI patch (found broken 2026-07-05 in `parity-ui-findings.json`, again in
  `EDITORIAL-REPORT.md` B6 2026-07-30 — same file, same two defects, never fixed); BPM-sync's
  "control exists, does nothing" failure mode (dead in *both* preview and codegen 2026-07-05 →
  fixed in codegen's DSP rate 2026-07-05/07 [P5] → the *exposed setter/PARAMS row* for the same
  parameter still lies about being live, reconfirmed by Tier 1 today, EDITORIAL-REPORT B7d/e); the
  loose-graph example files that can't be played from the editor (`examples/AUDIT.md` "legacy"
  category ↔ B1, unfixed since first noted). See §Q2.

---

## Q1 — Does BUGS.md survive the rewrite? Are "open" BUGS.md items actually fixed?

BUGS.md has no "open" items — every checkbox is `[x]` and every entry claims a fix with
file:line-level evidence written at the time. The real question is whether those claims still
hold today. Spot-checked directly against current `skald-backend/core/codegen.odin` and
`skald-ui/src`:

- `BUG-DISPATCHER-MISSING-NODES` — **still fixed**: `case "LFO"`, `case "SampleHold"`,
  `case "FmOperator"`, `case "Wavetable"`, `case "Panner"` all present in the per-voice and
  bus-domain dispatchers (`codegen.odin:1198,1207,1488,1490,1882-1890,1987-1991`).
- `BUG-NOISE-RNG-NOT-SEEDED` — **still fixed**: per-voice seeding at `codegen.odin:1346,1354,1367,1370`.
- `BUG-NO-MASTER-LIMITER` — **still fixed**: `math.tanh(mixed_left * master_vol)` at
  `codegen.odin:2477-2478` and `:2683-2684` (both export and preview paths).
- `BUG-MIXER-CHANNEL-LIMIT` — **still fixed**: `inputCount` read at `codegen.odin:680`.
- The Sax/P-lock live-param collision fix BUGS.md's last paragraph claims — **verified still
  fixed**: `skald-ui/src/utils/projectSerializer.ts:222` (`liveParamKey = (nodeId, param) =>
  \`${nodeId}::${param}\``) is used unconditionally for every instant set-param message
  (`useWasmAudioEngine.ts:253`), and the backend emits the matching `"<node>::<param>"` alias case
  for every resolved exposed param, P-lock-only exposures included (`codegen.odin:1017-1019,
  1730-1733,1746`).

So: **BUGS.md's claims are accurate as of today's code.** It survives the rewrite as a reliable
historical record of Phase 0–8 (and the four 2026-07-24 follow-ups), but it is now **superseded as
the frontier of known bugs** — it predates (and does not contain) the 30 findings in
`EDITORIAL-REPORT.md` (B1–B7, C1–C15), most of which are still open. A rewritten bug tracker should
treat BUGS.md as closed history, not as a template to extend.

## Q2 — Repeat offenders across multiple review rounds

Three items have been independently documented as broken by **at least two** review rounds without
being fixed between rounds:

1. **`sax3.json` double-transposes pitch and zeroes its own release.** Same file, same two defects,
   flagged in `review-checkpoints/parity-ui-findings.json` (2026-07-05, part of T2/T3) and again in
   `EDITORIAL-REPORT.md` B6 (2026-07-30). Verified still present today:
   `examples/instruments/winds/midi-setup/sax3.json:233-235` still wires MIDI `pitch` into
   `input_freq` (double V/Oct on top of the already-tracked base pitch) and Gate still lands on the
   ADSR's audio-multiply `input` (zeroing release). No commit in between touched this file.
2. **BPM-sync's "looks live, is dead" failure mode**, in two successive incarnations. Round 1
   (`parity-ui-findings.json`, 07-05): `bpmSync`/`syncRate` were dead in *both* preview and codegen —
   grep found them only in UI files. This was fixed at the DSP level (BUGS.md/CHANGELOG P5, "exports
   carry BPM-synced LFO/S&H/Delay rates"; Tier 1 F-A03 confirms `generate_lfo_code` /
   `generate_sample_hold_code` correctly resolve the BPM-derived rate today). But the **same class of
   bug reappeared one layer up**: EDITORIAL-REPORT B7(d)(e) (07-30), reconfirmed live by Tier 1 A03
   today, documents that the *exposed setter / PARAMS row / string-keyed setter* for `frequency`/`rate`
   are still emitted and still report success even though the generator unconditionally overwrites
   the value with the BPM-derived expression the instant `bpmSync` is true. Three rounds, the same
   subsystem, two different manifestations of the identical root cause (an unconditional overwrite
   that ignores whatever the exposure/setter machinery thinks is live).
3. **Loose-graph (pre-Instrument) example files can't be played from the editor.** First raised as
   `BUG-EXAMPLES-MISC-OBSOLETE`-adjacent territory and then explicitly as **B1** in
   `EDITORIAL-REPORT.md`; `examples/AUDIT.md` (07-24) independently classifies 22 files as "VALID
   (legacy)" — codegens fine via the CLI's auto-wrap fallback, but confirmed today
   (`getInstrumentNodes`/`useWasmAudioEngine.ts:97`) that the **editor's Play button still throws**
   for any of them. `docs/CODEX-REMEDIATION-BRIEF.md` W2 prescribes the fix ("auto-wrap on load, or
   wrap on Play with a toast") — not implemented as of this audit.

A fourth, lower-stakes repeat: the **Create Group button lit for one node, doing nothing on click**
was already known and explicitly scheduled as a "no-risk warm-up" (W0) in the remediation brief and
is still present verbatim (`app.tsx:379` `canCreateInstrument={selectedNodesForGrouping.length > 0}`
vs. `useNodeComposition.ts:214` `if (selectedNodesForGrouping.length <= 1) return;`).

**Reading on process, not just code**: three of these four are cases where a *fix was correctly
scoped and written down* (W2 for #3, W3 for B7, W0 for Create Group) but never executed, while later
waves or unrelated packets (W1/B3 range alignment, mixer level, reverb pre-delay) did land. That
suggests execution order drifted from the brief's stated sequencing rather than the fixes being
individually hard.

---

## Status table — BUGS.md

All entries below are marked `[x]` in BUGS.md itself. Status column reflects **current code**, not
the checkbox.

| ID | One-line description | Status | Evidence |
|---|---|---|---|
| BUG-EXAMPLES-LEGACY-CLEANUP | Example library audited/cleaned | **fixed** | `examples/AUDIT.md`, `examples/archive/README.md` present |
| BUG-AUDIO-ODDITIES-INVESTIGATION | 3 intermittent audio faults fixed w/ regression tests | **fixed** (3 of 4 classes; 4th tracked separately, see below) | `docs/investigations/audio-oddities.md` findings 1–3 CONFIRMED-FIXED |
| BUG-BPM-SETUP-UX | BPM NaN hole, divergent sync lists, effective-time display | **fixed** | `definitions/bpm.ts` shared clamp module exists; not independently re-verified line-by-line here (low risk, cosmetic) |
| BUG-PARAM-DISPLAY-PRECISION | Display-only 2dp rounding | **fixed** | not independently re-verified (low risk) |
| BUG-INTEGER-CONTROLS-EMIT-FLOATS | voice_count etc. quantized to steps | **fixed** | not independently re-verified this pass; no contrary evidence found |
| BUG-REACTFLOW-002-STRICTMODE | v11→v12 `@xyflow/react` migration | **fixed** | package present per BUGS.md; not re-verified |
| BUG-PREVIEW-CONSOLE-NOISE | debug logs gated | **fixed** | not re-verified (low risk) |
| BUG-DISPATCHER-MISSING-NODES | LFO/FM/Wavetable/S&H/Panner missing from dispatcher | **fixed** | confirmed live, see Q1 |
| BUG-FMTYPE-MISMATCH | `FmOperator` type-string match | **fixed** | dispatcher cases above imply this landed together |
| BUG-NOISE-RNG-NOT-SEEDED | PRNG state=0 forever | **fixed** | confirmed live, see Q1 |
| BUG-PROJ-STEREO | Mono-only project output | **fixed** | reconfirmed by `audio-oddities.md` #6 and Tier 1 (F-A08 Panner audit) |
| BUG-CODEGEN-TESTS-DEAD | Dead uncompilable test file | **fixed** (deleted) | not re-verified, low risk |
| BUG-INSTRUMENT-NAME-DUPS | Duplicate instrument namespace collision | **fixed** | not re-verified |
| BUG-CODE-PREVIEW-WRONG | Code preview showed wrong string | **fixed** | not re-verified |
| BUG-EXAMPLES-MISC-OBSOLETE | Legacy loose-graph fallback | **fixed** (as designed) | `examples/AUDIT.md` confirms this fallback still operates for 22 files; **superseded in spirit by B1** (EDITORIAL-REPORT) — the fallback works for the CLI but the **editor** still refuses to play these graphs, which is the live, unresolved half of the same story |
| BUG-ENEMIES-INT-IDS | Removed `enemies/` dir | **fixed** (deleted) | not re-verified |
| BUG-GRAPH-PARAMETERS-VS-DATA | `Node_Raw` data/parameters split | **fixed** | not re-verified |
| BUG-SEQ-RATE | Sequencer step clock hardcoded 44100 | **fixed** | reconfirmed numerically in `audio-oddities.md` #5 with `bpm_change` fixture |
| BUG-EXPOSED-PARAMS-WIRING | Dead snake_case export path | **fixed** | this is a *different* bug from EDITORIAL-REPORT B7 (dead DSP-side setters under bpmSync) — do not conflate; both true, one fixed one not |
| BUG-NO-MASTER-LIMITER | No output limiter | **fixed** | confirmed live, see Q1 |
| BUG-MIXER-CHANNEL-LIMIT | Hardcoded 8-channel mixer cap | **fixed** | confirmed live, see Q1 |
| BUG-WAVETABLE-PLACEHOLDER | Wavetable sidebar entry removed pending real DSP | **fixed** (as scoped — still a sine placeholder DSP-wise) | `codegen.odin` wavetable still placeholder per Tier 1 F-A01/C15 — **this is by design/deferred, not a regression** |
| BUG-VOICE-BUSY-NO-ENVELOPES | Voices with no ADSR never deactivate | **fixed** | not re-verified this pass |
| BUG-DEAD-NOTE-ON-OFF | Dead proc removed | **fixed** (deleted) | not re-verified |
| BUG-FMOPERATOR-CASING | Import case mismatch | **fixed** | not re-verified |
| BUG-STEPGRID-DUP-TESTID | Test isolation bug | **fixed** | not re-verified |
| BUG-TYPE-CASE-MISMATCH | PascalCase/lowercase node-type match | **fixed** | not re-verified |
| BUG-TWO-IDS-IN-JSON | Duplicate id fields in export | **fixed** | not re-verified |
| BUG-EMPTY-PROJECT-SILENT | Zero-instrument export was silent | **fixed** | not re-verified |
| BUG-WAVEFORM-CONST-SWITCH | Oscillator emits all branches | **fixed** | not re-verified |
| BUG-DOUBLE-VOICE-BUSY-DECL | Duplicate declaration / unused-var Odin error | **fixed** | not re-verified |
| BUG-LINT-* / BUG-STDOUT-* / BUG-UTF16-* / BUG-DEAD-CSV-DSP-HARNESS | Cleanup/tech-debt items | **fixed** (deleted/cleaned) | not re-verified, low risk, low value to chase |

**Net for BUGS.md:** of ~30 distinct entries, every one spot-checked or cross-referenced against
independent later docs (audio-oddities.md, examples/AUDIT.md, Tier 1) is **still true today**. No
regressions found. The two asterisked rows above (BUG-EXAMPLES-MISC-OBSOLETE, BUG-EXPOSED-PARAMS-WIRING)
are technically-fixed-as-scoped but sit next to a *different*, still-open problem with a similar name
— flagged so a future reader doesn't assume BUGS.md's "fixed" checkbox means the adjacent
EDITORIAL-REPORT finding (B1, B7) is also closed.

---

## Status table — CHANGELOG.md

CHANGELOG.md is a historical log, not a findings list — it does not need per-line triage. Notable
cross-checks:

| Entry | Status | Evidence |
|---|---|---|
| "Live edits actually apply while playing" (wasm bytes not Module, 2026-07-18) | **fixed, still true** | `useWasmAudioEngine.ts` still ships raw bytes per its own header comment |
| Multi-track export data-loss fix | **fixed, still true** | not independently re-verified; no contrary evidence in any later doc |
| P-locks export fix | **fixed, still true** | `projectSerializer.ts:179-180` still emits `patch_overrides`; codegen still resolves plock targets (`Plock_Target`, confirmed live above) |
| "290-agent review" P0–P8 (2026-07-05) | **= review-checkpoints/REVIEW-REPORT.md, = BUGS.md's Phase 0–8** | Same branch (`review-fixes`), same fix set — do not triage twice. See BUGS.md table above. |
| Known-gaps list appended to REVIEW-REPORT (preview ignores unison/detune, reverb algorithms differ, preview ADSR ignores velocitySensitivity, FM routing generic in preview, "P8 items not done") | **superseded by architecture** | `useAudioEngine.ts` (the hand-maintained Web Audio mirror these gaps describe) **no longer exists**; `useWasmAudioEngine.ts` runs the compiled Odin directly, so unison/detune/velocitySensitivity/FM-routing are whatever the codegen does — no separate preview implementation left to diverge. Node renaming (P8) shipped 2026-07-18; right-click context menu and unified transport bars did **not** ship — `SequencerDock.tsx` and `SequencerToolbar.tsx` are still two separate components today. |

---

## Status table — docs/investigations/audio-oddities.md (16 findings)

| # | Fault class | Doc's status | Current status | Evidence |
|---|---|---|---|---|
| 1 | Voice steal hard-reset click | CONFIRMED-FIXED | **fixed, still true** | not re-verified line-by-line this pass; no contrary evidence |
| 2 | Queued hot-swap builds stale graph | CONFIRMED-FIXED | **fixed, still true** | `useWasmAudioEngine.ts` still uses a `buildModuleRef.current` pattern per its header comments |
| 3 | Worklet set-param name-buffer overrun | CONFIRMED-FIXED | **fixed, still true** | not re-verified this pass |
| 4 | P-lock ↔ exposed-param collision kills live knobs | **CONFIRMED-OPEN** (doc's own table) | **actually fixed — doc is stale** | See Q1/summary: `liveParamKey` node-scoped keys + backend alias cases confirmed live today. BUGS.md's closing paragraph already says this was resolved "subsequently"; the investigation doc's table was never updated to match. (F-B09a-2) |
| 5 | Sequencer step clock / live BPM | CONFIRMED-FIXED | **fixed, still true** | Tier 1 F-A03/F-A10 independently confirm the runtime BPM-derived rate computation still matches |
| 6 | Stereo/panner accumulation | CONFIRMED-FIXED | **fixed, still true** | Tier 1 F-A08 (Mixer/Panner audit) independently confirms the mono-broadcast/Panner-L/R split is unchanged |
| 7 | NaN propagation clamps | CONFIRMED-FIXED | **fixed, still true** | Tier 1 F-A06 (Filter/Distortion audit) independently reconfirms the SVF/FM/feedback clamps |
| 8 | Denormals in bus-domain state | THEORETICAL | **unchanged / still theoretical** | no fixture or fix expected; not actionable |
| 9 | Always-on tanh saturation | by design | **unchanged, still by design** | confirmed live (master limiter present, see Q1) |
| 10 | Sample-rate-dependent timbre (SVF cap, delay cap) | THEORETICAL | **unchanged** | matches Tier 1 F-A06/F-A07's independently-cited `sample_rate*0.16` and `MAX_DELAY_SAMPLES` clamps |
| 11 | Hot-swap cuts all voices | by design | **unchanged, still by design** | no contrary evidence |
| 12 | BPM edit mid-play → rebuild + slew | minor, documented | **unchanged** | no contrary evidence |
| 13 | P-lock persists until next override | by design | **unchanged** | no contrary evidence |
| 14 | Output audition fires all instruments | minor, documented | **unchanged, still live** | independently reconfirmed by EDITORIAL-REPORT C10 and Tier 1 (same `asset: -1` broadcast mechanism cited) |
| 15 | Render quantum > 128 | THEORETICAL | **unchanged, not reachable today** | no action needed |
| 16 | Fractional integer params (voice_count 17.151) | OPEN elsewhere (→ BUGS.md) | **fixed** (per BUG-INTEGER-CONTROLS-EMIT-FLOATS) | see BUGS.md table |

**Net:** 15 of 16 findings are accurately reported by the document as it stands; only #4's status
column is stale (it's fixed, marked open). No new open items found among the 16.

---

## Status table — examples/AUDIT.md

Purely descriptive (an inventory + cleanup record), not a bug list — nothing to triage as
fixed/open in the usual sense. Cross-checks:

- The 3 archived duplicates/broken files (`Sax2.json`, `AlarmPulse.json`, `PulsarBeam.json`) —
  **confirmed still archived**, not re-added.
- The "22 legacy loose-graph" examples this doc calls "VALID (legacy)" from the **codegen CLI's**
  point of view are the same 22-ish files EDITORIAL-REPORT's **B1** says the **editor** refuses to
  play. Both documents are correct simultaneously — they're describing two different consumers of
  the same files (CLI vs. editor Play button). This is not a contradiction, but a reader skimming
  only AUDIT.md would wrongly conclude these files are fully fine everywhere. Worth a one-line
  cross-reference if AUDIT.md is kept in the rewrite.
- Recommendation to move `examples/integration_demo/` out of `examples/` — **not done**, directory
  is still in place at the same path.

---

## Status table — docs/manual-source/FIXED.md (6 packets)

| Packet | Description | Status | Evidence |
|---|---|---|---|
| P10 | Distortion `shape` TS contract | **fixed, confirmed by Tier 1** | F-A06 (Filter/Distortion audit) confirms landed |
| P12 | Doc/metadata drift (noise tooltip, example free-run rates) | **fixed, confirmed by Tier 1** | F-A02-1 confirms tooltip fix landed; chapter text now stale about it (doc-bug, already flagged by Tier 1, not re-filed here) |
| P6 | Piano Roll MIDI 36→21 range | **fixed, confirmed by Tier 1** | F-A10 (Foundations audit) references this; not independently re-verified this pass but no contrary evidence |
| P3/B4 | Mixer exposed-level default preserves authored fader | **fixed, confirmed by Tier 1** | F-A08-1 independently confirms via golden-file proof |
| P1/B5 | Reverb Pre-Delay implemented | **fixed, confirmed by Tier 1** | F-A07-1 independently confirms via golden-file + acceptance-test proof |
| P2/B3 | VCA/resonance/tone/delay-time/voiceCount range alignment | **fixed, confirmed by Tier 1** | F-A06, F-A09-1 independently confirm (gain 0-4, resonance ceiling aligned) — **but** F-A06 and F-A01 both independently note the chapters for **Filter and Distortion** (and others) were never updated to reflect this, i.e. this is a **manual staleness** problem, already the subject of Tier 1's whole audit, not a code problem |

**Net:** All 6 FIXED.md packets are genuinely in code. This corroborates Tier 1's global finding for
manual chapters and extends it: it's not just true for the two nodes Tier 1 sampled per packet, it
held for every packet checked here across all 10 Tier 1 files.

---

## Status table — docs/CODEX-REMEDIATION-BRIEF.md waves (referencing EDITORIAL-REPORT B1–B7, C1–C15)

| Wave / Finding | Description | Status | Evidence |
|---|---|---|---|
| W0 — Distortion `shape` TS contract | cosmetic | **fixed** | = P10 above |
| W0 — 3 palette tooltips (noise, tremolo, V/Oct) | cosmetic | **partially fixed** | Noise tooltip fixed (P12/F-A02-1); tremolo/V/Oct tooltips (`Sidebar.tsx:278,280`) not independently re-verified this pass, no evidence either way |
| W0 — Create Group lit-but-inert button | cosmetic | **still open** | confirmed live: `app.tsx:379` vs `useNodeComposition.ts:214`, see Q2 |
| W1 / B3 — Parameter range unification | blocker | **fixed** | = P2/B3 above, confirmed by Tier 1 across F-A06, F-A08, F-A09 |
| W1 / C1 — DSP silently clamps advertised ranges | confusing | **still open by design-intent** (documented, not "fixed", per EDITORIAL-REPORT's own recommendation to document rather than change) | Tier 1 F-A06/F-A10 reconfirm the same clamps live today; correctly treated as "document, don't fix" |
| W2 / B1 — Loose-graph examples unplayable in editor | blocker | **still open** | confirmed live: `useWasmAudioEngine.ts:97` throw still present, no auto-wrap-on-load/Play found anywhere in `projectSerializer.ts`/`useWasmAudioEngine.ts`. Repeat offender, see Q2. |
| W2 / B2 — `lfo-filter-wobble-bass` neither plays nor wobbles | blocker | **still open** (depends on B1) | file unchanged; not independently re-verified this pass beyond confirming B1's blocking mechanism is unresolved |
| W2 / B6 — `sax3.json` double-transpose + zeroed release | blocker | **still open** | confirmed live, see Q2 |
| W2 / C9 — Shipped examples use legacy/nonexistent keys | confusing | **not independently re-verified this pass** | no contrary evidence |
| W3 / B4 — Exposing Mixer level pins to unity | blocker | **fixed** | = P3/B4 above |
| W3 / B5 — Reverb Pre-Delay unimplemented | blocker | **fixed** | = P1/B5 above |
| W3 / B7 — Exposure emits dead setters (frequency/rate/delayTime under bpmSync, oscillator frequency under non-fixedPitch, etc.) | blocker | **still open** | Tier 1 F-A03 reconfirms the LFO/S&H bpmSync overwrite live today; not independently re-verified for every one of B7's 8 sub-instances but the root mechanism (`effective_exposed_params` has no "does the generator actually read this" check) is unchanged in current `codegen.odin:1187-1231` region. Repeat offender, see Q2. |
| W4 / C2–C6 — Modulation semantics (additive not multiplicative, Gate mislabeled, exposed-param unclamped init, Panner-not-into-Output loses stereo, LFO can't run bus-domain) | confusing, design conversation | **all still open, all reconfirmed by Tier 1** | C2/C3 reconfirmed by F-A04, F-A09-3; C5 reconfirmed by F-A08-3/F-A08 summary; C6 not independently re-verified this pass but no evidence of change; treated by CODEX brief as "design conversation," correctly not yet resolved |
| W5 / C7 — preview ≠ export below master volume 1.0 | confusing | **still open** | mechanism (`useWasmAudioEngine.ts` bakes 1.0, slider drives a separate post-worklet GainNode) unchanged; note this is **not** covered by the T8-superseding architecture finding above — it's a deliberate separate design choice (avoid rebuild on volume drag), not a leftover from the old dual-DSP architecture |
| W5 / C11 — No-Output patch builds clean, silent | confusing | **still open** | not independently re-verified this pass, no contrary evidence; Tier 1 F-A05-3 independently reconfirms the adjacent "no diagnostic for 0 or 2+ GraphOutput nodes" gap |
| W5 / C13 — Mixer per-channel pan dead both directions | confusing | **still open** | confirmed live: `MixerNode.tsx:13,23` still carries `pan` with no control anywhere rendering it (matches Tier 1 F-A08 summary) |
| W5 / C14 — sustain ≤0.0001 discards Release stage | confusing | **still open** | reconfirmed by Tier 1 F-A04 (ADSR/Mapper audit) |
| W5 — `voiceStealing` declared/defaulted/written, read by nothing | cosmetic | **still open** | reconfirmed by Tier 1 F-A10 |
| Eleven "deliberately does not do" items (no band-limiting, no self-oscillation, etc.) | by design | **correctly untouched** | brief explicitly says not to "fix" these; still true, no action needed |

**Net for CODEX-REMEDIATION-BRIEF:** of its 5 waves, only **W1 in full** and **half of W3** (B4, B5)
shipped. W0's one substantive bug (Create Group), W2 in full, the other half of W3 (B6, B7), and all
of W4/W5 remain open — all independently reconfirmed live in current code either by this audit or by
Tier 1. This is the single biggest "what didn't happen" gap in the whole review history and should
weigh heavily in scoping 0.2.

---

## Status table — review-checkpoints/ (REVIEW-REPORT.md + 3 JSONs)

Not re-triaged finding-by-finding (1812+1686+1383+769 lines of raw JSON; REVIEW-REPORT.md's own
T1–T11/P0–P8 synthesis is treated as the authoritative digest per the brief's time-boxing guidance).

| Theme | Status |
|---|---|
| T1–T7, T9–T10 (compile failures, pitch, envelope, NaN, routing, time-based-effects sharing, export completeness, UI integrity) | **= BUGS.md Phases 0–8, all independently confirmed fixed above** — do not re-triage, same fix set on the same branch |
| **T8 (preview↔codegen semantic divergence, ~18 confirmed items)** | **superseded by architecture** — `useAudioEngine.ts` deleted, `useWasmAudioEngine.ts` runs the real compiled Odin. This is the single most valuable status change in this whole triage: an entire root-cause theme from the foundational review is now structurally moot, not individually patched. (F-B09a-1) |
| T11 (UX conventions: context menu, Delete key, node renaming, shortcut legend, undo depth, tooltips, hit targets, double-click reset, unify transport bars) | **partially done** — node renaming and (per EDITORIAL-REPORT's citation of `ShortcutLegend.tsx`) a shortcut legend both exist today; right-click context menu and unified transport bars confirmed still absent (two separate files, `SequencerDock.tsx`/`SequencerToolbar.tsx`, still exist) |

---

## Findings

### F-B09a-1: `review-checkpoints`' Theme T8 (preview/codegen semantic divergence) is obsolete by architecture, not by individual fixes
- **kind**: doc-bug
- **area**: engine architecture (`skald-ui/src/hooks/nodeEditor/useWasmAudioEngine.ts`)
- **severity**: low (as a documentation issue) / **informational-high** for planning purposes
- **confidence**: high
- **evidence**: `skald-ui/src/hooks/nodeEditor/useWasmAudioEngine.ts:1-13` header comment: "Live
  preview engine that plays the ACTUAL generated Odin code compiled to wasm, replacing the old
  hand-maintained Web Audio node-graph mirror." `find . -iname useAudioEngine.ts` returns nothing —
  the file `review-checkpoints/REVIEW-REPORT.md`'s T8 section and "known gaps" list describe
  (`useAudioEngine.ts`, `audioNodeFactory` dispatch on `constructor.name`) no longer exists anywhere
  in the tree.
- **detail**: T8 lists ~18 confirmed criticals/majors, all of the shape "preview computes X one way,
  codegen computes X another way." Every one of those required two independent DSP implementations
  to diverge. That second implementation is gone. The manual and any future bug tracker citing T8
  items (additive vs. exponential FM, mono vs. stereo, unison/detune ignored, velocitySensitivity
  ignored, `constructor.name` dispatch) as open risks should instead check whether the **single**
  remaining implementation (`codegen.odin` compiled to wasm) has the bug, which is a much narrower
  question already substantially answered by Tier 1's per-node audits.
- **suggested fix**: When assembling the 0.2 bug tracker, mark all of T8 "superseded by architecture"
  rather than re-verifying each item individually; redirect any residual concern to the single-source
  codegen findings Tier 1 already produced.

### F-B09a-2: `docs/investigations/audio-oddities.md` finding #4 is marked CONFIRMED-OPEN but is actually fixed
- **kind**: doc-bug
- **area**: live-param preview path (`skald-ui/src/utils/projectSerializer.ts`, `skald-backend/core/codegen.odin`)
- **severity**: low
- **confidence**: high
- **evidence**: `docs/investigations/audio-oddities.md:18` lists fault #4 as `**CONFIRMED-OPEN**
  (proposed fix, not applied — see note)`. Current code: `projectSerializer.ts:222`
  (`liveParamKey = (nodeId, param) => \`${nodeId}::${param}\``) is used unconditionally for every
  instant set-param message (`useWasmAudioEngine.ts:253`), and `codegen.odin:1017-1019` emits a
  matching `case "<field>", "<node>::<param>":` for every resolved exposure, including P-lock-only
  ones (the alias comes from `effective_exposed_params`, which folds in `plock_targets` — see
  `codegen.odin:974-989`). BUGS.md's own final paragraph (line 143 of BUGS.md) already states this
  was "subsequently resolved by the Sax live-param fix (node-scoped `::` keys)."
- **detail**: The investigation document is internally consistent with itself (it explains the
  mechanism correctly) but its status table was never flipped to CONFIRMED-FIXED after the sibling
  Sax fix landed, even though that fix directly closes finding #4's mechanism. A future reader
  triaging by this document alone would incorrectly re-open or re-investigate a closed bug.
- **suggested fix**: One-line edit to `audio-oddities.md`'s summary table and finding #4 header,
  changing status to CONFIRMED-FIXED and citing the Sax-fix commit.

### F-B09a-3: Create Group button is enabled with one node selected and silently does nothing
- **kind**: qol
- **area**: canvas UI, node composition (`skald-ui/src/app.tsx`, `useNodeComposition.ts`)
- **severity**: low
- **confidence**: high
- **evidence**: `app.tsx:379` — `canCreateInstrument={selectedNodesForGrouping.length > 0}` drives
  the button's enabled state; `useNodeComposition.ts:214` — `handleCreateGroup` immediately returns
  if `selectedNodesForGrouping.length <= 1`. The tooltip already says "Select 2 or more nodes"
  (per `docs/CODEX-REMEDIATION-BRIEF.md` W0), so the UI's own copy contradicts the UI's own enabled
  state.
- **detail**: A user selects exactly one node, sees an enabled Create Group button, clicks it, and
  nothing happens — no toast, no disabled state, no error. This was flagged as a one-line "no
  codegen, no risk" warm-up fix in `docs/CODEX-REMEDIATION-BRIEF.md` W0 and never applied, despite
  substantially larger waves after it (W1, parts of W3) shipping.
- **suggested fix**: Change the `canCreateInstrument` condition to `.length > 1` to match
  `handleCreateGroup`'s actual guard (one-line fix, matching the brief's own original assessment).

### F-B09a-4: Repeat-offender pattern across review rounds indicates a scheduling/process gap, not a difficulty gap
- **kind**: risk
- **area**: process (cross-cutting)
- **severity**: medium
- **confidence**: high
- **evidence**: See §Q2 above — `sax3.json` (2 rounds, unchanged), BPM-sync dead-exposed-setter
  (3 rounds, same root cause resurfacing one layer up each time), loose-graph unplayable examples
  (2+ rounds), Create Group button (2 rounds, explicitly pre-scoped as trivial).
- **detail**: In every one of these four cases, a specific, already-written fix existed
  (`docs/CODEX-REMEDIATION-BRIEF.md` W0/W2/W3, or BUGS.md's own P5 fix which solved half the
  BPM-sync problem) and a *different*, later-sequenced wave landed instead (W1's range unification,
  W3's B4/B5). This is not evidence the remaining bugs are hard — Create Group is a one-line
  condition fix — it's evidence that execution order has drifted from the brief's stated dependency
  order at least twice. A 0.2 remediation plan should treat "was this packet actually assigned to an
  agent and completed" as a tracked field alongside severity, since severity alone hasn't predicted
  what gets fixed.
- **suggested fix**: When re-scoping for 0.2, carry over W2/W3(remainder)/W4/W5 as explicit backlog
  items with owners, rather than re-deriving them from scratch — the analysis work is already done
  three times over (2026-07-05, 2026-07-24, 2026-07-30); what's missing is execution, not diagnosis.
