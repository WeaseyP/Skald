# C1 — Adversarial verification of Tiers 1 and 2

## Verdict

The audit is substantially sound: I tried to kill the seven load-bearing claims and killed none of
them outright. F-B04-1 (codegen non-determinism) is not just true, it is worse than reported — 14
runs of the shipped `four-bar-song.skald.json` across **two independently compiled binaries**
produced six distinct byte-outputs, and the wasm shim's integer asset index permutes with them, so
"asset 0" is a different instrument on every run. F-A05-1, F-B02-1, F-B03-1, F-B04-2, F-B05-1,
F-B01-1 and F-B01-5 all reproduce exactly as written, several with fixtures I generated. What the
audit got wrong is calibration, not fact: **14 of the 54 `high` findings are overrated** — mostly
documentation and infrastructure gaps whose real user impact is medium or less — **seven clusters
are one defect written two or three times**, and one headline number, F-B09b's "111 of 119 prior
findings still live", is arithmetically impossible against its own table and must not be quoted.
Only one finding is outright false (F-B09b-2), plus four specific claims inside otherwise-valid
findings. The single biggest miss is not in any of the 199 findings: **the codegen binary the
Electron app actually executes is committed to git nine backend commits out of date, and it predates
the commit that added the `"<nodeId>::<param>"` set_param alias the live preview depends on — so in
the tree as committed, every exposed-parameter knob is a silent no-op during preview.** Twenty-two
agents audited the generated code and none of them ran the compiler the app runs. Beyond that I
found one genuinely new reachable dead control (`syncRate` is exposable in one click, and exposing
it makes the Sync Rate dropdown inert in the preview *and* emits a ±1e6 setter into the public API),
and established that the "manual is stale pessimistically" pattern is only three-quarters true — the
Mixer channel-level fix landed backend-only and the editor still refuses to expose the control. Not
fit to ship at 0.2 until the stale-binary problem, the codegen determinism bug, the master-gain
cluster and the one-keypress-after-Load data-loss path are closed; the rest is scoping.

---

## Method, and one environment caveat

Everything below was verified by reading the current code and, where a claim was empirical, by
running the codegen CLI myself against purpose-built fixtures written **only** into my scratchpad.
The repo was not modified. I also ran the UI suite: `npx vitest run` → **23 files, 174 tests, all
passing** in 3.0 s (Tier 2's F-B11-1 says 139 tests; the count has grown, the claim is otherwise
fine).

**Antivirus interference — disclosed, and it did not affect any verdict.** I first compiled
`skald-backend/main.odin` fresh into my scratchpad and ran the F-B04-1 determinism experiment with
it (8 runs, 6 distinct md5s). Windows Defender then quarantined that binary as
`Trojan:Win32/Bearfoos.B!ml` — a machine-learning false positive on a freshly built unsigned Odin
executable. I switched to the repo's own prebuilt `skald-backend/codegen.exe` (verified newer than
every file in `skald-backend/core/`) and re-ran the same experiment: **the second run produced the
same set of md5 hashes as the first**, which independently corroborates both the result and the
equivalence of the two binaries. No verification was left incomplete because of this. Worth noting
for the project: `run_golden.bat`, `build_codegen.bat` and CI all build unsigned Odin exes, so this
false positive will hit contributors and possibly CI runners.

---

## Corrections to prior tiers

### A. The seven load-bearing claims

#### F-B04-1 — codegen non-determinism · **CONFIRMED, and understated**

`skald-backend/core/json.odin:303` and `:331` iterate `for _, node in graph.nodes` (a
`map[string]Node`, `types.odin:94`) with no sort, assigning `project.instruments[idx]` in map-hash
order. Verbatim as cited.

Empirical result, `examples/songs/full/four-bar-song.skald.json`, unmodified, 14 runs across two
binaries (my own `odin build main.odin -file` and the repo's `skald-backend/codegen.exe`):

| distinct output | seen with my build | seen with repo build |
|---|---|---|
| `5ac717ac…` | ✓ | ✓ |
| `21ea83a7…` | ✓ (×2) | ✓ (×2) |
| `0351a858…` | ✓ | ✓ |
| `0bf92e08…` | ✓ (×2) | ✓ |
| `e0ee0386…` | ✓ | ✓ |
| `95111641…` | ✓ | — |

Six distinct whole-file outputs from byte-identical input. Tier 2 reported the visible symptom (the
`// Music Layer assets:` header line reordering). The consequential symptom it did not show is the
**wasm shim's asset index**, which is what a host addresses assets by. Six shim generations gave six
different `skald_note_on` dispatch orders:

```
shim1: Pad   HiHat Kick  Lead  Bass
shim3: HiHat Lead  Kick  Pad   Bass
shim4: Kick  Pad   Bass  HiHat Lead
shim6: Lead  Bass  Pad   HiHat Kick
```

`skald_note_on(asset: i32, …)` / `skald_trigger(asset, …)` therefore address a *different instrument*
on each regeneration of the same file. The codebase asserts the invariant this violates in its own
words at `skald-ui/src/utils/projectSerializer.ts:89-90`: *"The instrument order every consumer
(codegen asset indices, the wasm shim's asset dispatch, the preview engine's set_param addressing)
agrees on."*

**Two corrections to the finding's scope, both in the project's favour and both important for
sequencing the fix:**

1. Tier 2's claim that this "makes byte-for-byte golden-snapshot testing of these specific fixtures
   inherently flaky" is **not true of the current golden suite**. Of 30 fixtures in
   `skald-backend/tests/fixtures/`, only two are bare-graph shaped: `graph_save_roundtrip.json`
   (1 instrument — order irrelevant) and `legacy_loose_graph.json` (0 instruments — takes the
   `"Asset"` fallback at `json.odin:312-326`). The golden suite is currently immune.
2. It becomes flaky **the moment F-B11-1's proposal lands**, because the `examples/` corpus is
   exactly the bare-graph shape. See F-C1-5 — this is a hard ordering constraint on 0.2 work.

Tier 2's statement that the GUI path is unaffected is **confirmed**: `buildProjectData`
(`projectSerializer.ts:121`) maps `getInstrumentNodes(nodes)` in array order and always emits the
`project` wrapper, routing through `build_project_from_raw` instead.

Verdict: **CONFIRMED**, severity `high` is right, and the suggested fix (iterate
`nodes_sorted_by_id`) is correct and is a one-hour change.

#### F-A05-1 / F-B08-1 / F-B05-2 / F-A05-8 — master volume · **ALL FOUR CONFIRMED, all four distinct, one fix**

I checked whether these are the same finding wearing four hats. They are not. They are four
different defects that share one root architectural choice (master volume is a compile-time literal
fused into the limiter, with no runtime setter).

- **F-A05-1 CONFIRMED empirically.** `codegen.odin:2455-2456` (`if master_vol <= 0.0 do master_vol
  = 1.0`) verbatim. I generated from a project with `"master_volume": 0` and got
  `mixed_left = math.tanh(mixed_left * 1.000000000)`; with `0.01` I got `* 0.010000000`. The slider
  reaches exactly 0 (`SequencerDock.tsx:211`, `min="0" step="0.01"`), and `projectSerializer.ts:110`
  passes it through with no floor while `:199` floors instrument volume at `0.001` **with a comment
  explaining precisely this hazard**. Real, reachable, and the fix is one character (`<=` → `<`) plus
  a floor.
- **F-B08-1 CONFIRMED, with one correction to its analysis.** `useWasmAudioEngine.ts:95` bakes
  `1.0`; `:191-196` puts the JS `masterGain` *after* the worklet. So preview plays `v·tanh(x)` and
  export plays `tanh(v·x)`. Tier 2 says the user "will hear a *louder but still squashed* result in
  the exported build." Half right: because `tanh` is concave on `x ≥ 0`, `tanh(v·x) ≥ v·tanh(x)` for
  every `v ∈ [0,1]` — the export is **always louder than or equal to the preview**, and it is
  **less** saturated, not "still squashed". At `v = 0.5` and a mix peaking at `x = 2`, preview =
  0.482, export = 0.762 — 4 dB louder and a different waveform. State it as "your export is louder
  and cleaner than what you tuned by ear," which is the more alarming and more accurate claim.
- **F-B05-2 CONFIRMED.** `examples/integration_demo/README.md:7-8` does say the `project_*` wrapper
  "is *not* used; that's a test-harness affordance only", and `main.odin:211-212` is
  `l := (sfx_l + layer_l) * 0.6` with no reference to `master_volume` and no limiter. Verbatim.
- **F-A05-8 CONFIRMED** as a design gap (no runtime setter anywhere).

**Merge recommendation:** keep all four as separate defects, but track them as **one 0.2 work item**
— see F-C1-8. Fixing any one in isolation leaves the tool still unable to carry an authored mix
level from the editor to a game.

#### F-B04-3 — Panner L/R unreachable · **CONFIRMED, DOWNGRADED high → medium, and sharpened**

Every mechanical claim checks out. `PannerNode.tsx:11` declares exactly one output handle;
`grep -rn "output_left\|output_right" skald-ui/src` returns **zero** matches. I generated
`Oscillator → Panner(pan = 1.0) → VCA → GraphOutput` and got:

```
node_pan1_out = (node_pan1_out_left + node_pan1_out_right) * 0.7071068;
node_vca_out  = ((node_pan1_out)) * (f32(1.000000000));
output_left  += node_vca_out
output_right += node_vca_out
```

Hard-right pan, identical L and R, and a −3 dB level drop. Confirmed.

**Downgraded to medium** for three reasons: (a) exactly **one** of the 80 shipped `.skald.json`
patches contains a Panner (`examples/instruments/keys/glassy-fm-pluck.skald.json`) and it wires
`glass-panner → glass-output` directly, so nothing in the shipped corpus is affected; (b) the
symptom is loss of stereo placement plus 3 dB, not silence or a crash; (c) the mono downmix is a
*deliberate, commented fix* for a strictly worse bug — `codegen.odin:731-733`: *"a Panner feeding a
Filter or Gain used to produce TOTAL SILENCE"*. This is a real design gap, not a regression.

**Sharpening (new, see F-C1-7):** Tier 2 says the backend "supports" `output_left`/`output_right`
and only the UI lacks handles. That support is itself broken. `generate_graph_output_adds`
(`codegen.odin:2038`) routes the stereo pair only when
`src_node.type == "Panner" && (src.port == "" || src.port == "output")`. A wire from
`output_left` falls into the `else` branch and is broadcast to **both** channels
(`codegen.odin:2042-2044`). Adding UI handles alone would produce mono, not per-channel routing.

#### F-B04-2 — nested Instruments · **CONFIRMED, DOWNGRADED high → medium on wording**

Both halves verified. The frontend claim is exact: `projectSerializer.ts:51` unconditionally does
`delete parameters.subgraph` inside `formatNodesForCodegen`, and `formatSubgraph` is called from
exactly one place, `buildProjectData:145`, for top-level instruments only. A nested Instrument
therefore always reaches the backend with no subgraph, making the recursive parser at
`json.odin:203-222` dead code for the real product. Confirmed.

I reproduced the failure:

```
Error: unknown node type "Instrument" (node id inner) in instrument "Outer" — no code
generator exists for it. Refusing to generate a silently-broken patch.   [exit 1]
```

**Correction to the framing shared by F-A09-6 and F-B04-2:** "hard-crash" overstates it. This is a
deliberate, purpose-written `os.exit(1)` with a specific diagnostic (`codegen.odin:1896-1901`, whose
own comment explains the choice), and both consumers handle it cleanly — `main.ts:153-156` rejects
the IPC promise with the stderr text, and the preview surfaces it as `previewStale` while continuing
to play the previous module. Nothing crashes, nothing is lost, and the user sees it on **Play**, not
only on Generate as F-A09-6 states. It is a bad error message for a constructible graph, which is a
medium. F-B04-2's actual contribution — that "just add a dispatch case" is not a complete fix — is
correct and is the reason to keep this finding at all.

#### F-B02-1 — the exposure pass is blind to `bpmSync` · **CONFIRMED, strongest evidence in the audit**

`codegen.odin:1216-1283` is cited correctly and the mechanism is exactly as described: Phase 3 keys
resolution on parameter *name* and node *type* only. `generate_lfo_code` (`:371-374`) computes
`freq_str` via `get_f32_param` and then **unconditionally overwrites it** when `bpmSync` is true.

I generated an LFO with `bpmSync: true`, `syncRate: "1/8"`, `exposedParameters: ["frequency",
"amplitude"]`:

```
107:  frequency: f32,                                            ← struct field
222:  LfoSync_set_frequency :: proc(p: ^LfoSync_Processor, …)     ← public typed setter
231:  {"frequency", 0.010000000, 100.000000000, 5.000000000, "Hz"}  ← advertised in _PARAMS
239:  case "frequency", "lfo1::frequency":                        ← string-keyed dispatch
275:  voice.lfo_lfo1_phase = … ((1.0 / ((60.0 / p.bpm) * 0.5))) …  ← p.frequency NEVER READ
277:  node_lfo1_out = math.sin(voice.lfo_lfo1_phase) * (p.amplitude);  ← p.amplitude IS read
```

A fully documented, range-annotated, four-entry-point public API knob that is wired to nothing.
**CONFIRMED**, and F-A03-1 / F-A03-2 / F-A07-5 confirmed with it.

**Two reachability corrections:**

- **F-B02-4 is right and F-A07-4's reachability premise is wrong.** `renderBpmSyncToggle` is defined
  at `ParameterPanel.tsx:243` and has **zero call sites** anywhere in `skald-ui/`. `bpmSync` renders
  as a bare `<input type="checkbox">` on all three node types
  (`NodeParameterControls.tsx:164-166, 178-180, 191-193`) with no expose affordance. Same for
  Oscillator/Wavetable `fixedPitch` (`:209-210`, `:221-223`) — also not exposable, which retires that
  variant of the concern too.
- **But the free-run parameter is not reachable the way Tier 1 implies either.** When `bpmSync` is
  on, the UI *replaces* the Frequency/Rate/Delay-Time row with the Sync Rate row
  (`NodeParameterControls.tsx:158-161, 171-174, 184-187`), so there is no expose icon for it while
  synced. The two real paths in are (a) expose first, then tick BPM Sync — plausible, and permanent
  once done, since ticking sync does not prune `exposedParameters`; and (b) a P-lock (F-B02-2).
  This slightly *lowers* the accident rate and *raises* the diagnosis difficulty.
- **And there is a third, worse path nobody found: `syncRate` itself is exposable.** See F-C1-2.

#### F-B03-1 — `<Foo>_init` reset parity · **CONFIRMED, DOWNGRADED high → medium**

Verbatim confirmed: `codegen.odin:1375-1383`'s clear loop is guarded `if node.type != "Reverb" do
continue`, while Delay declares the identically-named `delay_%s_buffer` / `delay_%s_write_index`
fields at `:1182-1184`; and nothing in `generate_processor_code`'s init block (`:1319-1391`) touches
`p.voices` beyond the RNG reseed. The generated body is unambiguous:

```
Sfx_init :: proc(p: ^Sfx_Processor, sr: f32) {
	p.sample_rate = sr
	p.bpm = 120.000000000
	p.prng.state = 12345
	p.loop = true
	p.cutoff = 800.000000000
}
```

Five scalar assignments. Not a reset.

**Downgraded to medium** because the exposure requires calling `_init` twice on the same live
processor, and nothing in the repo, the demo, or the manual does that. **Correction to the stated
mechanism:** Tier 2 says the preview is only protected because the worklet builds a fresh
`WebAssembly.Instance` with zeroed memory. It is protected twice over, and the second guard is in
generated code the maintainers wrote deliberately: the wasm shim emits `wasm_<Asset> = {}` before
each `<Asset>_init` call, and `project_init` (`codegen.odin:2439`) allocates with `new(...)`. So the
real defect is narrower than described: it is that the *public* `_init` does not do what its
neighbouring comment claims, for anyone who calls it outside those two wrappers.

#### F-B09b — "111 of 119 prior findings still live" · **REFUTED as an aggregate; per-row citations mostly sound**

Delegated deep re-verification of a 30+ item sample. The number does not survive:

- The report's own status tables contain **108 rows**, not 119, tallying **101 live / 6 fixed /
  1 obsolete** — none of which matches the claimed 111/5/2/1.
- 111 is **unreachable**: the report separately asserts all 30 `BUGS.md` items remain fixed, which
  caps the live universe at 103.
- The same file's own "Overall" line says "~80% still live"; 111/119 is 93%.
- Source-to-row mapping is ad hoc in both directions: `flash_5`'s 9 findings became 13 rows (one
  memory-lifetime observation exploded into seven), `flash_6`'s 12 became 10 (two silently dropped).
- ESLint-rules-disabled is counted at least twice inside the 108 (`BUGS.md #25` and `flash_8 #56`),
  which the report itself notes and counts anyway.

Sampled re-verification split roughly **60% verified-live / 25% vacuous-or-unfalsifiable / 15%
wrong-or-fixed**. Specific refutations worth recording:

- **F-B09b-2 (escalated as a live data-loss bug) is a false positive.** `Project_Data_Raw`
  (`types.odin:137-145`) has no `sequencer_tracks` field because the UI never emits one —
  `projectSerializer.ts:149` and `:186` write tracks into each instrument's
  `audio_graph.sequencer_tracks`. Nothing is dropped.
- **flash_2 #21 (`ScaleContext` negative-MIDI) is arithmetically false** — both consumers do
  `(noteIndex - rootIndex + 12) % 12` (`ScaleContext.tsx:44`, `:56`), which fully rescues the
  negative remainder.
- **flash_8 #61 (stale `review-fixes` branch reference) is wrong today** — `review-fixes` is the
  current checked-out branch.
- **flash_3 #1's negative-cache complaint was fixed by a deliberate, commented decision**
  (`main.ts:171-174`).

**F-B09b-1 and F-B09b-3 survive and deserve promotion out of the triage document into first-class
findings**: `json.odin:196-200` (duplicate node id renamed, connections still point at the first
node) and `ParameterPanel.tsx:209-210` (stale-closure exposure clobber) both verified live.

**Do not quote 111/119 anywhere.** Use the per-row citations; discard the aggregate.

---

### B. Verdicts on the rest — Tier 2

| ID | Verdict | Reason (all verified personally or by delegated re-read of current code) |
|---|---|---|
| F-B01-1 | **CONFIRMED** high | Proven with a generated fixture: `switch p.current_step % 32 { … case 20: … }` emitted alongside `if p.current_step >= 16`. `case 20` is dead code, `odin check` passes silently. Two additions Tier 2 missed: the **Piano Roll** (`SequencerDock.tsx:248`) is a second unguarded authoring surface with no knowledge of global length at all, and *lowering* the toolbar Steps retroactively strands already-composed notes. |
| F-B01-2 | **CONFIRMED** high | `app.tsx:209-228` pops both stacks. Additional evidence: graph history is capped at 50 (`useGraphState.ts:68`), sequencer history is unbounded — divergence is guaranteed in any long session, not merely likely. |
| F-B01-3 | **DOWNGRADED** high → medium, undo half **MERGED into F-B01-2** | The "no confirmation" half is exact. The "recoverable only via the fragile dual-undo" half does not survive: because both stacks are popped by the same handler, the immediate single Ctrl+Z *does* restore node and track together (`useSequencerState.ts:42` early-returns on the re-add). It only breaks once F-B01-2's drift has occurred. |
| F-B01-5 | **CONFIRMED** high | Reproduced: `"F2:cutoff"` → `exit 1`, *"has a step parameter override (P-lock) … that matches no node in the patch"*, whole run aborted. Invisible in `StepPropertiesEditor.tsx:161-169`. |
| F-B01-8 | **DOWNGRADED** high → medium | Every mechanical claim verified (`PianoRoll.tsx:322` `pointerEvents:'none'`; `SequencerDock.tsx:243-250` passes the Piano Roll no selection callback; `StepGrid.tsx:10` signature has no pitch; `StepPropertiesEditor.tsx:69` `.find()`). But chords are created, saved and **played** correctly — `codegen.odin:2133-2145` groups events per step deliberately. Nothing is lost or corrupted; this is a missing editing affordance. Tier 2 missed that `app.tsx:302` (`handleExportStep`) has the same first-note bug. |
| F-B01-10 | **CONFIRMED** | `getUniqueExposedParams` is gone; `liveParamKey` is node-scoped. |
| F-B02-2/3/4/5/8/9 | **CONFIRMED** | F-B02-8's cross-checked tempo arithmetic re-verified at `codegen.odin:2114`, `:2202`, `:35-58`. F-B02-4's zero-call-sites claim re-verified by grep. |
| F-B02-6 | **CONFIRMED** as the right architecture | The recommended shape is correct. One addition: it must also handle `syncRate` exposure (F-C1-2), which the proposal explicitly defers ("`syncRate` stays compile-time-only") without noticing that the editor already lets a user expose it. |
| F-B02-7 | **DOWNGRADED** high → low | Its own detail says everything the proposal claims is implemented checks out and "this is not a stale, aspirational document." The defect is that a planning doc's scope is narrower than the bug. That is a planning artefact, not a product defect, and `high` inflates the roll-up. |
| F-B03-2 | **CONFIRMED** medium | `codegen.odin:1477-1496`: cases exist for Filter, Oscillator, FmOperator, Wavetable, Distortion only; LFO/Noise/SampleHold absent from that switch and from every other reset path. |
| F-B03-3 … F-B03-8 | **CONFIRMED** at stated severities | `codegen.odin:1404-1414` compares only `age`. Note `note_off` *does* match by note ("the oldest active, not-yet-releasing voice holding this note", `:1503+`) while `note_on` does not — which strengthens F-B03-4's asymmetry argument. |
| F-B04-4 | **CONFIRMED** medium | Generated a fixture with an orphaned `unison: 4` oscillator: `osc_dead_phase: [4]f32` declared, per-sample 4-way unison loop emitted, `node_dead_out` computed and read by nothing. |
| F-B04-5, F-B04-6, F-B04-7 | **CONFIRMED** at stated severities | `assertCodegenTargetSafe` is called only from the `invoke-codegen` handler (`main.ts:88-90`); nothing equivalent exists in `skald-backend/main.odin:90-99`. |
| F-B05-1 | **CONFIRMED** high | `grep -c attack_start` → **0** in all seven checked-in `generated_audio.odin` copies; **3–6** in every relevant `tests/golden/*.golden`. Exactly as claimed. Related to, but distinct from, F-C1-1. |
| F-B05-3, F-B05-5 … F-B05-10 | **CONFIRMED** at stated severities | No synchronization primitive anywhere in emitted code; `examples/integration/` is genuinely empty. |
| F-B05-4 | **CONFIRMED** high | The field-name-reversion half (`codegen.odin:1246-1258`, `counts[p_name] > 1`) is the more insidious half and is correctly described. |
| F-B06-1 | **DOWNGRADED** high → medium, **MERGED into F-B06-12** | Factually exact, but zero current user-visible symptom; it is the fact half of a finding whose design half (F-B06-12) already exists in the same file and rates itself `n/a`. One finding, one severity. |
| F-B06-2 | **CONFIRMED** high — and **under-rated** | Verified, plus a concrete one-keypress data-loss path Tier 2 missed: `app.tsx:169-180` passes `useGraphState`'s `resetHistory` for both parameters, so **only the graph stack is cleared on Load**, while `loadTracks` *pushes* the pre-load tracks onto the sequencer stack (`useSequencerState.ts:169-172`). One Ctrl+Z straight after Load: graph undo no-ops, sequencer undo swaps in the *previous* project's tracks, `useInstrumentRegistry.ts:31-35` prunes them as orphans and re-adds empty ones. Every note in the just-opened project, gone, unrecoverable. |
| F-B06-4 | **DOWNGRADED** high → medium, and its own count is wrong | `AUDIT.md:8` says 62. Tier 2 says 94. Actual: **101** `.json` under `examples/` (80 `.skald.json`). A doc-bug about a corpus the same finding reports as healthy is not `high` — especially when its replacement number is also stale. |
| F-B06-5 | **CONFIRMED** high | `forge.config.ts:20` copies the whole tree; `PulsarBeam.json` fails with `unknown input port "input_delayTime"`, exit 1. |
| F-B06-3, F-B06-6 … F-B06-11 | **CONFIRMED** at stated severities | |
| F-B07-1 | **MERGED with F-B01-2** (and F-B09b-5) | Three findings, one defect, identical evidence at `app.tsx:209-228`. Keep F-B07-1 as canonical (deepest repro); fold in F-B09b-5's extra fact about `loadTracks`. |
| F-B07-4 | **MERGED with F-B06-2** | |
| F-B08-1 | **CONFIRMED** high (see above) | |
| F-B08-2 | **CONFIRMED** high | `skald_start_all` (`codegen.odin:2547-2555`) restarts only Music Layers; nothing replays held notes. |
| F-B08-3 | **CONFIRMED** medium | `new WebAssembly.Module(bytes)` inside `port.onmessage` on the render thread. |
| F-B08-4 | **CONFIRMED** medium | `-o:speed` at `skald-ui/src/main.ts:259` for every preview build. Citation path is `skald-ui/src/main.ts`, not `src/main/main.ts`. |
| F-B08-5 | **CONFIRMED** but **DOWNGRADED** medium → low, and **superseded by F-C1-3** | The 64-vs-128 mismatch is exact (`skaldWasm.worklet.ts:111` vs `codegen.odin:2530`), and the shim's own bound is correct (`if name_len <= 0 \|\| int(name_len) > len(skald_name_buf) do return 0`). But it is unreachable with today's ~13-char node ids, and it is one instance of a broader predicate mismatch that *is* reachable — see F-C1-3. |
| F-B08-6 … F-B08-9 | **CONFIRMED** low/medium | F-B08-6's real cost is smaller than "heap allocation in the audio callback" suggests: these are ~40-byte views over WASM memory, not buffer copies. |
| F-B10-1, F-B10-2, F-B10-3, F-B10-5, F-B10-7 | **CONFIRMED** as design analysis | F-B10-3's scoping call (keep mono, do not attempt real stereo for 0.2) is the right one and I endorse it. F-B10-1's identification of the real cost (a new edge-inspector UI surface, not the codegen change) is correct. |
| F-B10-6 | **CONFIRMED** medium | `WavetableParams` (`types.ts:48-54`) has no `amplitude`; `WavetableNode.tsx:17` has the slider; `NodeParameterControls.tsx:203-214` has no Amp row, so it cannot be exposed. |
| F-B11-1 … F-B11-3, F-B11-6 … F-B11-10 | **CONFIRMED** | With the ordering caveat in F-C1-5, and the coverage caveat that the AUDIT.md/CI harness structurally cannot see P-locks (F-C1-5). Corpus is 101 files, not 75. |
| F-B11-4, F-B11-5 | **CONFIRMED** but **`kind` mislabelled** | Both are `kind: code-bug`; both are test-coverage gaps whose underlying code bugs (F-A01-4, F-A05-1) are already counted. Recount as `missing-feature`/`risk` or the code-bug total is inflated by two. |

### C. Verdicts on the rest — Tier 1

All 16 Tier 1 `high` findings ruled on. Five (F-A05-1, F-A09-6, F-A03-1, F-A03-2, F-A07-4) are
covered in section A; the other eleven were each re-read against current code, with four example
patches run through `codegen.exe` to test the corpus-level claims.

| ID | Verdict | Reason |
|---|---|---|
| F-A01-4 | **CONFIRMED** high | `generate_wavetable_code` (`codegen.odin:477-512`) does not even take an `instrument` argument and never references unison/detune; contrast `generate_oscillator_code`'s `for i in 0..<unison_count` at `:179-189` and `[max(instrument.unison,1)]f32` at `:1117` vs Wavetable's scalar `f32` at `:1136`. No warning anywhere in the UI. **Scope correction: `FmOperator` is equally excluded** (`generate_fm_operator_code`, `:414-475`, has no unison reference), so "one node type" understates it and any fix must cover FM too. |
| F-A02-7 | **DOWNGRADED** high → medium | Facts check out (`types.ts:43-46`; `FM_INPUTS` at `graph_validate.odin:30` has no `input_amp`; bare `math.sin` with no amplitude multiply at `codegen.odin:473`). But it is `kind: design`, has a universally-used workaround, produces no wrong audio, and is already the chapter's own note 4 — the same class the *same auditor* rated `medium` for F-A02-10 and F-A07-7. |
| F-A06-1 | **DOWNGRADED** high → medium | The inversion is genuine (`filter.md:38` "zeroed when a voice is stolen or retriggered" vs the `if !stolen {` gate at `codegen.odin:1497` wrapping the filter reset at `:1484-1485`), but it is one clause in an under-the-hood bullet that drives no exercise and no user action. |
| F-A06-3 | **DOWNGRADED** high → medium | Ceiling verified fixed (`NodeParameterControls.tsx:144` `maxY={20}`, `:153` `max: 20`) and all four passages still say 30. But `filter.md:217` itself states 30 was "audibly identical to 20" (damping clamps at 0.05 by Q=20), so both hands-on steps still produce the described sound. Substantially duplicates F-A10-5, which the same audit rated `medium`. |
| F-A07-1 | **CONFIRMED** high | Pre-delay is fully real: `MAX_REVERB_PREDELAY_SAMPLES` at `codegen.odin:26`, clamp + ring buffer at `:552-567`, struct field at `:1186`, init clear at `:1382`, `param_ranges.odin:78-79`, and a dedicated `tests/golden/reverb_predelay.odin.golden`. `reverb.md:44/:88/:165/:167` still say "Nothing, currently" and step 8 instructs the reader to prove it inert. **See F-C1-9 — the fix is also incomplete on the node card.** |
| F-A08-1 | **CONFIRMED** on the code claim, **but its conclusion is premature — see F-C1-4** | `exposed_param_default`'s Mixer branch (`codegen.odin:656-673` with `mixer_channel_level` at `:619-646`) does resolve `levels[channel-1].level`, and `tests/golden/mixer_exposed_default.odin.golden:114` emits `p.level1 = 0.250000000`. The backend blocker really is gone. But `NodeParameterControls.tsx:278-292` renders every `level<n>` control with `isExposable = false`, so a user still cannot expose a channel level from the editor. Do not rewrite `mixer.md` yet. |
| F-A08-3 | **DOWNGRADED** high → medium, and one number is wrong | The asymmetry is real (`codegen.odin:728-729` cos/sin vs `:2041-2045` unattenuated dual-mono), but the Panner implements the textbook constant-power law correctly — it is the *direct* path that lacks a pan law — and `panner.md:97` already teaches "at centre each channel carries 0.707". **Strike the claim of "up to −6 dB as heard through a mono fold-down": 1.414/2 is −3.01 dB**, identical to the per-channel figure. |
| F-A09-2 | **MERGED into F-A04-4** (medium) | Same root defect, same fix: ADSR multiplies (`codegen.odin:292`) while VCA sums additively onto a 0.75-default knob (`:764-767`, `param_utils.odin:138-156`). An independent recount of the corpus gives **157 ADSR audio-input wires across 92 files vs 9 `input_gain` wires across 5** — stronger than the 90:7 in the finding, and it is supporting evidence for F-A04-4, not a separate `high`. |
| F-A09-8 | **DOWNGRADED** high → low, central claim **REFUTED** | The inference is real (`detect_asset_type`, `codegen.odin:801-809`) but deliberate and explained at `:795-800`, and the manual documents the rule. The finding's central impact claim — that it changes "which public procedures get emitted" — is contradicted by `codegen.odin:1546-1551`: *"Both proc shapes are emitted regardless of asset_type."* Only auto-start flips; the API surface does not. |
| F-A10-2 | **CONFIRMED** high | Ran `codegen.exe` on all four named files (`complex-drone-machine`, `pwm-pad`, `lfo-filter-wobble-bass`, `fm-bell-tone`): every one exits 0, and the emitted Odin shows the legacy handles live — e.g. `cutoff_c_filter_1: f32 = math.clamp(f32((f32(600.0)) + (node_lfo_1_out)), …)` — because `normalize_port` (`json.odin:36-49`) runs at `:105-119` before validation. `60-complexity-ladder.md:235` and item 8 at `:320` are flatly wrong. |
| F-A05-8 | **DOWNGRADED** high → medium as a standalone; kept as part of **F-C1-8** | Baking is real (`codegen.odin:2012`, `:2477-2478`; no `_set_volume` symbol anywhere), but it is `kind: design` at `confidence: medium` with a documented workaround, already logged as `output.md` note 6, and `param_ranges.odin:107-110` records instrument-level exposure as dormant *by design*. Its value is as one quarter of the master-gain work item, not as an independent `high`. |

Two further Tier 1 corrections established directly:

- **F-A01-10 / F-A09-5 (Glide 0–2 vs 0–5) are one finding.**
  `NodeParameterControls.tsx:320` (`slider('glide', 0, 2, 0.05)`) vs `param_ranges.odin`
  `case "glide": return {0.0, 5.0, 0.05, "s"}`. Keep F-A09-5 (it also correctly retires the
  `voiceCount` half as already fixed).
- **Cross-cutting pattern #3 from the Tier 3 brief ("the manual is stale pessimistically") is only
  three-quarters true.** Reverb pre-delay (F-A07-1) and the resonance ceiling (F-A06-3) check out.
  Mixer channel-level exposure does not — the fix is backend-only and unreachable (F-C1-4). Pattern
  #3 should be restated as "some things the manual warns against were fixed in the backend; verify
  each has an editor path before rewriting the chapter."

### D. Structural problems with the finding set itself

1. **Severity inflation is concentrated in doc-bugs.** Eight findings rated `high` have
   documentation-only or planning-only impact: F-A10-2, F-A06-1, F-A06-3, F-A08-1, F-B02-7,
   F-B06-4, plus F-B06-1 and F-B01-8 for different reasons. Several sit in files that rate
   *structurally identical* staleness as `medium` or `low` (F-A06-3 `high` vs F-A06-4 `medium` vs
   F-A06-5 `low`, all from the same FIXED.md packet). Any severity-sorted 0.2 plan built on the raw
   list will put "a walkthrough says set resonance to 30" above "the compiler the app runs is stale."
2. **Design proposals inherit `high` from the defects they aggregate.** F-B02-6, F-B10-1, F-B10-2
   are `high` architecture *proposals*, not defects; counting them alongside the findings they
   summarise double-counts those findings in any roll-up.
3. **Six findings use `severity: n/a (design)`** (F-A10-14…F-A10-18, F-B06-12) and will silently
   drop out of any filter.
4. **Citation drift is reproduced by the audit that documents it.** F-A09-2 cites
   `codegen.odin:1612-1625` for the setter clamp — a range three other findings in the same audit
   flag as stale-and-unrelated. F-A07-8 cites `:1935-1943` for an error that F-A06-6 establishes is
   at `:97-103`. Four different agents give four different line ranges for the exposure pass
   (`:1187-1231`, `:1216-1283`, `:1246-1283`) and five for `exposed_param_default`.
5. **The `examples/` count appears as 62, 75 and 94 in three places. It is 101.**

### E. Net effect on the finding set

- **Examined in detail:** all 54 `high` findings, plus every finding in the eight files most
  load-bearing for the audit's conclusions.
- **Refuted outright:** 1 finding (**F-B09b-2**), 1 aggregate claim (**F-B09b's 111/119**), and 4
  specific claims inside otherwise-valid findings (F-A07-4's reachability premise — already caught
  by F-B02-4; F-A09-8's "changes which procedures get emitted"; F-A08-3's "−6 dB"; F-B04-1's
  "makes the golden suite flaky", which is true only prospectively).
- **Downgraded from `high`:** 14 — F-B04-3, F-B04-2, F-B03-1, F-B01-3, F-B01-8, F-B06-1, F-B06-4,
  F-B02-7, F-A02-7, F-A06-1, F-A06-3, F-A08-3, F-A09-8, F-A05-8. Plus F-B08-5 medium → low.
- **Under-rated (evidence strengthened):** F-B06-2 (a concrete one-keypress data-loss path the
  finding missed), F-B04-1 (asset-index permutation), F-B02-1 (generated-code proof), F-B09b-1 and
  F-B09b-3 (both survive verification and deserve promotion out of a triage document).
- **Merges:** F-B01-2 ≡ F-B07-1 ≡ F-B09b-5 (and F-B01-3's undo half, and F-B01-9); F-B06-2 ≡
  F-B07-4; F-B06-1 ≡ F-B06-12; F-A09-2 → F-A04-4; F-A01-10 ≡ F-A09-5; F-B08-5 → F-C1-3;
  F-A05-1 + F-A05-8 + F-B05-2 + F-B08-1 → one work item, F-C1-8.
- **`kind` mislabelled:** F-B11-4 and F-B11-5 are `code-bug` but are test gaps for already-counted
  bugs; recounting them removes two from the code-bug total.
- **Surviving `high` count after these corrections: 40 of 54.**

---

## Findings

### F-C1-1: The codegen binary the app actually runs is committed to git nine backend commits stale — every live exposed-parameter edit is a silent no-op in the default dev workflow
- **kind**: code-bug
- **area**: build/packaging · live preview · repo hygiene
- **severity**: high
- **confidence**: high
- **effort**: S
- **when**: 0.2-blocker
- **supersedes**: none (extends F-B05-1 to the compiler, not just its output)
- **evidence**: `skald-ui/src/main.ts:70-73` — `codegenExePath()` resolves to
  `app.getAppPath()/skald_codegen.exe` in dev and `process.resourcesPath/skald_codegen.exe` when
  packaged, the latter placed there by `forge.config.ts:20`'s
  `extraResource: ['./skald_codegen.exe', …]`. Both are the same tracked file:
  `.gitignore:2` ignores `*.exe`, `.gitignore:7` un-ignores `!skald-ui/skald_codegen.exe`, and
  `git ls-files` confirms it is tracked. Its last commit is `af6500c` (2026-07-24); the last commit
  to `skald-backend/core/` is `50ad9b2` (2026-07-30), with **nine** intervening commits to
  `skald-backend/core/` including `d006e71 codegen: emit node-scoped "<nodeId>::<param>" aliases in
  set/get_param` and `51641d9 fix(codegen): click-free voice stealing`.
  I ran both binaries on one identical fixture and diffed the output (16 differing lines):
  the current backend build emits `case "amplitude", "lfo1::amplitude":` and an `if !stolen { … }`
  guard around the voice reset; **the binary the app runs emits `case "amplitude":` with no alias
  and no `!stolen` guard.**
  `skald-ui/src/hooks/nodeEditor/useWasmAudioEngine.ts:255-262` posts *only* the node-scoped key
  (`const key = liveParamKey(sn.id, name)`), and
  `skald-ui/src/hooks/nodeEditor/audioWorklets/skaldWasm.worklet.ts:114` ignores
  `skald_set_param`'s return value. `projectSerializer.ts:236-248` has already masked that parameter
  out of the topology signature, so no rebuild fires either.
- **detail**: In this tree, following the README's primary instruction (`README.md:40`, `npm start`),
  every parameter with the exposure link icon lit does **nothing at all** while the preview is
  playing: the `::`-keyed `set_param` finds no matching case, returns `false`, the worklet discards
  the result, and the masking guarantees no rebuild happens. The knob moves, the number changes, the
  sound does not. This is the tool's headline feature and it is dead in the committed tree. The same
  stale binary also reintroduces the voice-steal click that `51641d9` fixed — which is exactly the
  defect F-B05-1 found in the checked-in generated artefacts, now traced to its actual cause: it is
  not that nobody regenerated the examples, it is that the compiler in the repo predates the fix.
  `README.md:49-54` does document `npm run start:rebuild`, and `scripts/build-release.ps1:80` does
  run `build:codegen` before `make:win`, so a tagged release is safe — which is why this is `high`
  and not `critical`. But nothing enforces it: `npm start` and a bare `npm run make:win` both use
  whatever is committed, CI never rebuilds or verifies it, and there is no staleness check anywhere.
  Note also that twenty-two prior audit agents tested `skald-backend/codegen.exe`; none tested the
  binary the product uses.
- **recommendation**: Stop tracking the binary. Delete the `!skald-ui/skald_codegen.exe` exception
  from `.gitignore`, make `start` and `make` depend on `build:codegen`
  (`"start": "npm run build:codegen && electron-forge start"`), and add a CI step that builds it and
  fails if the working tree then differs. If keeping it tracked is non-negotiable for
  contributors without Odin, add a CI job that rebuilds and `git diff --exit-code`s the binary so
  staleness fails the build the day it appears.
- **manual impact**: none. `README.md:49-54`'s "if you change the Odin backend, run
  `start:rebuild`" becomes unnecessary and should be deleted rather than reworded.
- **migration**: none — no saved-patch format is involved.

### F-C1-2: `syncRate` is exposable in one click, which emits a dead ±1e6 public setter *and* makes the Sync Rate dropdown inert during preview
- **kind**: code-bug
- **area**: exposure system · BPM sync · live preview
- **severity**: high
- **confidence**: high
- **effort**: S
- **when**: 0.2-blocker
- **supersedes**: extends F-B02-1/F-B02-3/F-A03-3; supplies the reachable path F-B02-4 showed
  `bpmSync` does not have
- **evidence**: `NodeParameterControls.tsx:159` (LFO), `:172` (Delay), `:185` (Sample & Hold) all
  render `renderControlWrapper('syncRate', 'Sync Rate', syncRateControl(…))` with **no fourth
  argument**, and `ParameterPanel.tsx:216-222` defaults `isExposable = true`. So the link icon is
  present on the one control that *is* visible when sync is on — unlike `bpmSync` and `fixedPitch`,
  which are bare checkboxes with no icon.
  Backend consequence, generated from a fixture with `exposedParameters: ["syncRate", "amplitude"]`:
  ```
  107:  syncRate: f32,
  116:  p.syncRate = 0.000000000
  222:  LfoSync_set_syncRate :: proc(p: ^LfoSync_Processor, value: f32) { … p.syncRate = v }
  231:  {"syncRate", -1000000.000000000, 1000000.000000000, 0.000000000, ""}
  239:  case "syncRate", "lfo1::syncRate":
  275:  … ((1.0 / ((60.0 / p.bpm) * 0.500000000))) …      ← p.syncRate never read
  ```
  `lookup_param_range` has no `syncRate` case, so it falls through to
  `param_ranges.odin`'s unknown fallback `{-1.0e6, 1.0e6, 0.0, ""}`.
  Preview consequence, demonstrated by re-executing `topologySignature`'s masking rule verbatim
  (`projectSerializer.ts:236-248`) against two project objects differing only in `syncRate`:
  `signature identical after syncRate 1/8 -> 1/32 : true`. And
  `useWasmAudioEngine.ts:250` does `const value = Number(sn.data?.[name])` guarded by
  `Number.isFinite`; `Number("1/32")` is `NaN`, so nothing is posted either.
- **detail**: Click the link icon next to Sync Rate — the natural thing to do if you want your game
  to change an LFO's synced division — and three things happen, none of them announced. (1) The
  generated public API grows `<Asset>_set_syncRate(p, f32)` advertised in `_PARAMS` with a range of
  ±1,000,000 and no unit, writing a field the DSP never reads. (2) In the live preview, the Sync
  Rate dropdown stops working entirely: the value is masked out of the topology signature so no
  rebuild is scheduled, and the instant path drops it because `"1/8"` is not a finite number. The
  dropdown visibly changes and the wobble rate does not. (3) The setting persists in the save file,
  so the dropdown stays broken across sessions with nothing in the UI indicating why. This is
  strictly more reachable than the `bpmSync` exposure that F-A07-4 wrongly claimed was clickable,
  and strictly worse, because it breaks the *editor*, not just the exported API.
- **recommendation**: Two lines now, one design decision for 0.2. Now: pass `false` as the fourth
  argument to all three `syncRate` wrappers, matching how `waveform`, `type`, `shape` and the mixer
  levels are already handled. For 0.2: F-B02-6's architecture must decide what an exposed *division*
  means; the cheapest coherent answer is to keep `syncRate` compile-time-only (as F-B02-6 proposes)
  and make that decision enforceable rather than accidental — add a backend guard that hard-errors
  when a non-numeric parameter name appears in `exposedParameters`, so a UI regression cannot
  reintroduce this silently.
- **manual impact**: `nodes/lfo.md`, `nodes/sampleHold.md`, `nodes/delay.md` — each "What expose
  does" section currently implies every visible row is exposable; each needs the sync-division
  exception stated (or, after the fix, nothing, because the icon will be gone).
- **migration**: any saved patch with `"syncRate"` in an `exposedParameters` array should have it
  stripped on load. I found none in `examples/`, so this is precautionary.

### F-C1-3: `topologySignature`'s masking predicate and the instant-param predicate disagree by construction — the file's own comment states the invariant it breaks
- **kind**: code-bug
- **area**: live preview · exposed-parameter plumbing
- **severity**: medium
- **confidence**: high
- **effort**: S
- **when**: 0.2-desirable
- **supersedes**: F-B08-5 (the 64-vs-128 mismatch is one instance of this)
- **evidence**: `projectSerializer.ts:230-235` states the contract explicitly: *"Masking and
  live-applicability MUST agree: a param masked here but skipped by the instant path would change
  nothing until an unrelated rebuild."* The masking predicate at `:241` is
  `name in n.parameters && canApplyParamLive(n.id, name)`, and `canApplyParamLive` (`:227-228`) is a
  **byte-length check only**. The instant path (`useWasmAudioEngine.ts:249-262`) additionally
  requires `Number.isFinite(Number(value))`, requires the node to be inside
  `inst.data.subgraph.nodes`, and requires the generated `set_param` to have a matching case. Three
  extra conditions the mask does not model. F-B08-5's 64-byte worklet cutoff
  (`skaldWasm.worklet.ts:111`) is a fourth.
- **detail**: Every future exposed parameter that is not a plain finite number — a division string,
  an enum, a boolean, anything added later — will silently become an inert control the moment
  someone exposes it, because masking assumes live-applicability that the instant path then declines
  to deliver, and no rebuild is scheduled to cover the gap. F-C1-2 is today's instance; F-B08-5 is a
  latent one; F-C1-1 turns *all* exposed params into instances. The failure is silent at every layer
  by design: the worklet discards `skald_set_param`'s return value, and `previewStale` is only set
  on a *failed build*, never on a dropped parameter.
- **recommendation**: Make `canApplyParamLive` take the value, and return false for anything the
  instant path will refuse — non-finite, non-number, or over the real 128-byte limit. Have the
  worklet post an error back when it drops a `set-param`, and surface it the same way
  `previewStale` is surfaced. Fix the worklet's cutoff to 128 in the same change and correct
  `WasmWorkletGuard.test.ts`, which currently locks the wrong number in with a passing test.
- **manual impact**: none.
- **migration**: none.

### F-C1-4: The Mixer channel-level fix landed backend-only — the editor still refuses to expose the control, so the manual's warning is still operationally true
- **kind**: inconsistency
- **area**: Mixer · exposure system · fix-completeness
- **severity**: medium
- **confidence**: high
- **effort**: S
- **when**: 0.2-desirable
- **supersedes**: corrects F-A08-1
- **evidence**: `param_ranges.odin:43-45` carries the Mixer-level override with a comment explaining
  the bug it fixed ("an exposed channel used to initialize to 0.0 (silently muted) with a ±1e6
  clamp"). `git show --stat 2e7f677` ("fix(P3): preserve exposed mixer levels") touches
  `docs/manual-source/FIXED.md`, `skald-backend/acceptance/main.odin`,
  `skald-backend/core/codegen.odin`, and two test fixtures — **no UI file**. And
  `NodeParameterControls.tsx:278-292` renders every `level<n>` control as
  `renderControlWrapper(\`level${ch}\`, \`Level ${ch}\`, ( … ), false)`, i.e. `isExposable = false`,
  so no link icon is drawn for any mixer channel.
- **detail**: F-A08-1 rates as `high` doc-bug the claim that the Mixer chapter's headline blocker
  ("exposing a channel level discards the fader") is fixed in code and the manual is now
  pessimistically stale. Half of that is right — the backend now handles an exposed mixer level
  correctly, verified by its own golden fixture. But a user cannot get there: the Parameter Panel
  gives them no way to expose a channel level at all. So the manual's practical advice ("don't rely
  on this") is still correct; only its stated reason is out of date. More importantly, this is a
  fix that was recorded as complete, has tests, and delivers nothing to a user — which should make
  the team suspicious of the other entries in the same "already fixed" list. It also weakens
  cross-cutting pattern #3 in the Tier 3 brief: at least one of the four "features that have since
  been fixed" is still not reachable.
- **recommendation**: Change the `false` to omitted (or `true`) on the `level<n>` wrapper and add
  one UI test asserting a mixer channel level round-trips into `exposedParameters`. Then re-audit
  the rest of FIXED.md's "implemented" list for backend-only fixes with no editor counterpart —
  Reverb Pre-Delay and the Piano Roll bass floor are the two others worth checking first.
- **manual impact**: `nodes/mixer.md` — the "exposing a channel level" passage should stay as a
  known limitation until the UI change ships, then be rewritten; F-A08-1's proposed rewrite should
  **not** be applied yet.
- **migration**: none.

### F-C1-5: Do not gate CI on the `examples/` corpus until F-B04-1 is fixed — and be aware the harness cannot see P-locks or session settings at all
- **kind**: risk
- **area**: CI · example corpus · fix ordering
- **severity**: medium
- **confidence**: high
- **effort**: S
- **when**: 0.2-blocker (as a sequencing constraint on F-B11-1)
- **supersedes**: qualifies F-B11-1, F-B11-10, F-B06-4
- **evidence**: Three independent facts that only bite in combination.
  (1) `examples/` files are bare-graph shaped, so they route through the non-deterministic
  `build_project_from_graph` (`json.odin:296-367`) — proven above to produce six distinct outputs
  from one input. The current golden suite escapes this only because its two bare-graph fixtures
  have 1 and 0 instruments respectively.
  (2) `Sequencer_Track_Raw.notes` is `[]Note_Event` whose P-lock field is `patch_overrides`
  (`types.odin:19`), but save files write `patchOverrides` — **five shipped examples** carry
  `patchOverrides` and **zero** carry `patch_overrides`
  (e.g. `examples/songs/loops/geowars/hat-static.skald.json:87-99`). Odin's unmarshaller matches
  field names literally and there is no tag, so every P-lock in the corpus is silently dropped when
  a `.skald.json` is fed to `codegen.exe` directly. The app is unaffected — `projectSerializer.ts:179`
  emits snake_case — but the harness is not the app.
  (3) `json.odin:252` is the only writer of `project.pattern_steps` and reads only the Project
  shape, so a save file always hits the `global_steps <= 0` fallback (`codegen.odin:2097-2103`) and
  takes the longest track as the loop length — which happens to mask F-B01-1 entirely if you try to
  reproduce it from a save file.
- **detail**: F-B11-1 proposes running `codegen.exe` + `odin check` over every `examples/` file in
  CI, which is the right idea and is cheap. But run as a *diff* or *golden* gate it will flap on
  every push because of (1); and run as an exit-code gate it certifies far less than it appears to,
  because of (2) and (3) — it has literally never exercised a P-lock or a session-derived pattern
  length. `examples/AUDIT.md`'s "93/94 healthy" verdict, and F-B06-4's re-run of it, both inherit
  this blind spot. Anyone reasoning about pattern-length or P-lock behaviour from a CLI run of a
  `.skald.json` will draw a wrong conclusion, as one of my own verifying agents did before catching
  it.
- **recommendation**: Sequence it: fix F-B04-1 first (sort `build_project_from_graph`'s two loops by
  node id — one hour), then land F-B11-1 as an exit-code + `odin check` gate, and only then consider
  goldens for examples. Separately, either add `json:"patchOverrides"` as an accepted alias on
  `Note_Event.patch_overrides` and teach the CLI to read a save file's `session` block, or make the
  CI step convert save files through the real serializer first so the harness tests what the app
  actually sends. The second is more honest and not much more work.
- **manual impact**: none.
- **migration**: none.

### F-C1-6: The manual the entire audit is calibrated against is not committed
- **kind**: risk
- **area**: repo hygiene · docs
- **severity**: medium
- **confidence**: high
- **effort**: S
- **when**: 0.2-blocker
- **supersedes**: none
- **evidence**: `git status --porcelain` in the working tree lists as **untracked**:
  `docs/manual-source/00-foundations.md`, `docs/manual-source/50-bass-teardown.md`,
  `docs/manual-source/60-complexity-ladder.md`, `docs/manual-source/EDITORIAL-REPORT.md`, the whole
  `docs/manual-source/nodes/` directory, the whole compiled `docs/manual/`, `scripts/manual/`,
  `examples/snes-kit/`, `docs/CODEX-REMEDIATION-BRIEF.md`, and
  `skald-ui/src/components/Sequencer/stepMetrics.ts` — the last of which is *imported by shipped
  code* (`SequencerToolbar.tsx`). Ten further files are modified and uncommitted, including
  `skald-ui/src/main.ts`, `forge.config.ts` and `useFileIO.ts`.
- **detail**: Twenty-one manual chapters — the best statement of intended behaviour the project has,
  the thing this three-tier audit spent most of its effort cross-reading against code, and the
  artifact whose `file:line` citations five findings are about — exist only on one disk. So does the
  `snes-kit` example family (9 patches) that F-B06-4 flags as never audited, and a source module the
  build depends on. A clean clone does not build the same product, and none of this audit's manual
  citations are reproducible by anyone else. This is not a code defect but it is a genuine 0.2
  blocker: everything else in this report is unverifiable by a second party until it is fixed.
- **recommendation**: Commit the manual, `scripts/manual/`, `examples/snes-kit/` and
  `stepMetrics.ts` before any 0.2 work starts. Add a CI step that runs `git status --porcelain` after
  a build and fails on untracked files under `docs/`, `examples/` or `skald-ui/src/`.
- **manual impact**: none (this is about the manual's storage, not its content).
- **migration**: none.

### F-C1-7: Panner's `output_left`/`output_right` ports do not work even when reachable — they broadcast one channel to both outputs
- **kind**: code-bug
- **area**: Panner · codegen
- **severity**: low
- **confidence**: high
- **effort**: S
- **when**: 0.2-desirable
- **supersedes**: sharpens F-B04-3 option (a)
- **evidence**: `graph_validate.odin:70-72` accepts `output_left`/`output_right` as valid
  `from_port` values for a Panner, and `param_utils.odin:68-69` maps them to
  `node_%s_out_left` / `node_%s_out_right`. But `generate_graph_output_adds`
  (`codegen.odin:2038-2044`) routes the stereo pair only under
  `src_node.type == "Panner" && (src.port == "" || src.port == "output")`; any other port falls into
  the `else` branch, which does `output_left += v; output_right += v` with the single named
  variable. A wire from `output_left` into an Output therefore puts the left channel into *both*
  channels.
- **detail**: F-B04-3's suggested fix (a) is "add `output_left`/`output_right` handles to
  `PannerNode.tsx`". Doing only that would ship a pair of handles that produce mono — a worse
  outcome than today, because it looks like it works. The backend's apparent support for these ports
  is an artefact of the validator and the variable-name mapper, not of any routing logic.
- **recommendation**: Take F-B04-3's option (b) — propagate the stereo pair through consumers, or at
  minimum warn at build time when a Panner's output reaches anything other than a GraphOutput. If
  option (a) is ever taken instead, `generate_graph_output_adds` must gain per-port cases first.
- **manual impact**: `nodes/panner.md` — any passage describing per-channel outputs as available.
- **migration**: none; no shipped patch uses these ports.

### F-C1-8: Master gain staging needs one decided design, not four independent patches
- **kind**: design
- **area**: Output · master bus · generated API
- **severity**: high
- **confidence**: high
- **effort**: M
- **when**: 0.2-blocker
- **supersedes**: consolidates the *fix* for F-A05-1, F-A05-8, F-B05-2, F-B08-1 (all four remain
  valid as separate defects)
- **evidence**: The four confirmed defects above share one cause: `master_volume` is a compile-time
  literal (`codegen.odin:2455-2456`, `:2477-2478`) fused into the safety limiter, with no runtime
  setter and no separation between "user gain" and "don't clip". That fusion is what makes `0`
  usable as an absent-field sentinel (F-A05-1), what forces the preview to route the slider around
  the DSP entirely (F-B08-1), and what means the one place the authored level exists is the wrapper
  Skald's own README tells integrators not to use (F-B05-2).
- **detail**: Fixing these one at a time produces four partial answers. Flooring the serializer
  fixes F-A05-1 but leaves the preview lying. Exposing `master_volume` as a live shim param fixes
  F-B08-1 and removes the sentinel problem as a side effect, but a game still cannot move the
  master fader. Adding `project_set_master_volume` fixes that, but the recommended per-asset
  integration path still never calls `project_process` so it still gets neither the level nor the
  limiter. There is one shape that closes all four.
- **recommendation**: Split gain from limiting and give both a runtime home.
  (1) Emit `master_volume` as a real field on `Project_State` initialised from the JSON, with
  `project_set_master_volume(p, f32)`; stop baking it as a literal. This alone kills the `<= 0.0`
  sentinel — an absent field becomes a struct default, not a magic value — so delete the fallback
  and delete the need for a client-side floor.
  (2) Emit the limiter as a standalone `skald_soft_limit(l, r) -> (f32, f32)` and have
  `project_process` call it, so the per-asset integration path can get clipping protection without
  adopting the whole wrapper (closes F-B05-2 and F-B05-10's concern in the same move).
  (3) Add `master_volume` to the wasm shim's `set_param` surface and delete the JS `masterGain`
  workaround at `useWasmAudioEngine.ts:191-196`, so the dock slider drives the same code path the
  export uses and "the preview is the export" becomes true again.
  Cost: roughly a day. It is the difference between a tool that can and cannot deliver an authored
  mix to a game, which is the boundary the whole product exists to cross.
- **manual impact**: `00-foundations.md` — the "preview is the export" claim at `:221` becomes true
  rather than aspirational, and the "master volume is applied before the limiter… that is
  deliberate" passage at `:421` needs rewriting to describe the new two-stage model.
  `nodes/output.md` — "The controls", "What 'expose' means, and why Output has nothing to expose",
  "Give yourself a master fader your game can move" (the whole VCA workaround section is retired),
  and Code-vs-intent note 6.
- **migration**: Additive to the generated API; no `.skald.json` key changes. One behaviour change
  worth a changelog line: a project saved with `master_volume: 0` currently exports at full volume
  and will afterwards export silent — which is the point, but it means at least one existing patch
  could get quieter. A load-time check that warns on `master_volume == 0` would cover it.

### F-C1-9: The Reverb node card has no Pre-Delay control, so the parameter F-A07-1 just proved works is unreachable on canvas
- **kind**: inconsistency
- **area**: Reverb · node body vs sidebar parity
- **severity**: low
- **confidence**: high
- **effort**: S
- **when**: 0.2-desirable
- **supersedes**: instance of F-B07-8; blocks the manual rewrite F-A07-1 proposes
- **evidence**: `skald-ui/src/components/Nodes/ReverbNode.tsx:8-11` declares exactly two fields,
  `decay` and `mix`. `NodeParameterControls.tsx:236-239` renders three — `decay`, `preDelay`, `mix`.
  The backend fully implements pre-delay (`codegen.odin:26`, `:552-567`, `:1186`, `:1382`;
  `param_ranges.odin:78-79`; `tests/golden/reverb_predelay.odin.golden`). For contrast,
  `DelayNode.tsx:11-17` lists all five of its parameters including the `showIf`-gated pair.
- **detail**: This is the same node-body/sidebar divergence F-B07-8 catalogues, but it matters more
  here because of the sequencing: F-A07-1 recommends rewriting `reverb.md` to say pre-delay now
  works. It does work — in the backend and in the side panel — but a user editing on the canvas, the
  primary surface, has no control for it and no indication one exists. Rewriting the chapter before
  fixing the card would send readers looking for a slider that is not there.
- **recommendation**: Add
  `{ key: 'preDelay', label: 'Pre-Delay (s)', min: 0, max: 0.25, step: 0.005 }` to
  `ReverbNode.tsx`'s `fields`, matching the panel's range. Then apply F-A07-1's manual rewrite. More
  generally, F-B07-8's fix should be a single test that asserts every node's card `fields` list is a
  superset of the keys `NodeParameterControls` renders for that type — that turns this whole class
  into a compile-time-ish check instead of a per-node audit.
- **manual impact**: `nodes/reverb.md` — the F-A07-1 rewrite should land *after* this, not before.
- **migration**: none; `preDelay` already round-trips in saved patches.

### F-C1-10: Generated oscillator code contains a guard that can never be false
- **kind**: code-bug
- **area**: codegen · emitted code quality
- **severity**: low
- **confidence**: high
- **effort**: S
- **when**: later
- **supersedes**: same class as F-A09-10 (glide clamp), which was filed; this instance was not
- **evidence**: `codegen.odin:179-180` computes `unison_count := instrument.unison; if unison_count
  <= 0 do unison_count = 1`, then `:186` emits it as a **literal** into the generated source
  (`unison_count := %d`). `:219` then emits `if unison_count > 0 do node_%s_out = …` — a runtime
  branch on a codegen-time literal that is already floored at 1. Visible in my generated fixture:
  `if unison_count > 0 do node_dead_out = (unison_out / f32(unison_count)) * (f32(0.500000000));`
- **detail**: Harmless (Odin will fold it) but it is the same smell the codebase already fixed once
  and commented about at `codegen.odin:199-201`: *"BUG-WAVEFORM-CONST-SWITCH: previously emitted a
  runtime switch on a codegen-time literal — every non-matching branch was dead."* Emitted dead
  branches make the generated file harder to read for the integrator who has to review it, and they
  are the sort of thing a reader reasonably assumes is load-bearing.
- **recommendation**: Drop the guard; emit the division unconditionally. Sweep for the same pattern
  — `grep` the generator for emitted `if <literal-backed local>` comparisons.
- **manual impact**: none.
- **migration**: none.
