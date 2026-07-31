# C3 — Backend & pipeline architecture teardown

Scope: graph → serializer → codegen → generated Odin → WASM preview / shipped game.
Input: all 10 Tier 1 files and all 12 Tier 2 files, read in full before starting.

**Method note.** Every empirical claim below was produced with the repo's own **prebuilt**
`skald-backend/codegen.exe` and `skald-ui/skald_codegen.exe`, run in place, read-only, with
`-out:` pointed at the scratchpad. I compiled nothing and modified nothing in the repo, so the
antivirus interference the coordinator flagged does not touch any evidence here. Where a claim is
static-analysis-only I say so explicitly.

---

## Verdict

The pipeline is not fit to ship at 0.2, and the reason is not the list of bugs Tiers 1 and 2
found — it is that **nothing in this system verifies that any two of its four representations of a
patch agree**, so the bug list regenerates itself faster than it is cleared. Four representations
exist: the TypeScript editor model, the JSON on disk, the Odin `Project`/`Graph` model, and the
emitted DSP. There is no schema, no version field, no generated binding, and no cross-check
between them anywhere in the build or in CI. The brief's thesis — that the editor's model of
legality and the generator's model of legality are two separately-maintained models that drift —
is correct, and it is narrower than the real problem: *defaults*, *ranges*, *port names*, *node
types*, *asset identity*, *tempo* and *master volume* are all separately maintained too, and I
found live drift in every one of those categories. The single worst instance is not on the list any
prior tier produced: **the codegen binary the editor actually spawns is a checked-in build artifact
that is behind `core/codegen.odin`, emits materially different DSP, and is not the binary CI
validates** — I proved this by running both shipped binaries on the same fixture and diffing
(F-C3-1). Second worst: the backend has **two ingestion paths for the same file**, chosen by
structural sniffing, and the one that 100 of the 101 shipped example files land on silently throws
away session tempo and master volume — a 140 BPM patch generates `p.bpm = 120` (F-C3-2). The
determinism defect Tier 2 found is real (I reproduced 4 distinct outputs from 6 runs of one shipped
file) but it is a symptom: determinism here is a *per-call-site convention* enforced by three code
comments, not an invariant enforced by a type or a test, and the golden suite structurally cannot
catch a violation of it because both graph-path fixtures sit at 0 and 1 instruments. On the
positive side: the DSP emission itself is good, the emitted Odin compiles cleanly across the whole
corpus, the acceptance/golden harness is well built, and `codegen.odin`'s per-node generators are
clean and well commented. The rot is entirely in the seams. My recommendation is to spend 0.2's
budget on the seams — one schema, one validator, one ingestion path, one binary provenance rule —
and defer every feature request in Tier 2's design findings, because landing them on the current
substrate will just produce a fifth representation to drift.

---

## Corrections to prior tiers

### C-1 — F-B04-2 is partly wrong: the backend's recursive subgraph parser is **not** dead code

F-B04-2 states "the backend's recursive subgraph parser (`json.odin:203-222`) is dead code for the
real product." I re-checked and this is only true of *second-level* recursion. `build_graph_from_raw`'s
`if node.type == "Instrument"` branch is the **only** way an Instrument's subgraph is parsed on the
CLI/graph path (`main.odin:63-75` → `build_project_from_graph`), and that path is the one 100 of 101
shipped example files take (measured — see F-C3-2). The recursion is live, load-bearing, and
exercised by the `graph_save_roundtrip` golden fixture. What is unreachable is a *second* level
(an Instrument inside an Instrument's subgraph), because `formatNodesForCodegen`
(`projectSerializer.ts:40-73`) does `delete parameters.subgraph` at line 51 and never re-invokes
`formatSubgraph`. F-B04-2's *conclusion* (reject nesting in a preflight pass; a full fix would need
the serializer rewritten too) stands. The "dead code" framing does not, and acting on it literally
would delete working code. **Downgraded, not overturned.**

### C-2 — F-B04-1 understates its own scope; upgrading to critical and correcting the population

F-B04-1 says the non-determinism affects "anyone or anything using the bare-graph path." I measured
that population: **100 of 101 JSON files under `examples/` are bare-graph shaped** (script in the
evidence for F-C3-2), so this is not an edge case for CLI users, it is the default shape of every
shipped asset. Separately, F-B04-1 treats ordering as the whole bug. It is the smaller half: the
same function also hardcodes `bpm = 120` and `master_volume = 1.0` and never sets `pattern_steps`,
`mute`, `solo` or `midi_config` (`json.odin:296-367`). That is silent wrong audio on every shipped
example whose session tempo isn't 120, which I confirmed empirically. **Severity upgraded to
critical, merged into F-C3-2 with the ordering half kept as F-C3-3.**

### C-3 — F-B05-1's root cause is misidentified

F-B05-1 concluded that the checked-in `generated_audio.odin` files are stale because "nothing
regenerates the human-facing examples." That is a true observation with the wrong mechanism
attached, and the suggested fix (a `regen_examples.bat` in the release checklist) would not hold.
The actual mechanism is F-C3-1: the binary the editor and `npm start` use
(`skald-ui/skald_codegen.exe`, checked in, `.gitignore:7` explicitly un-ignores it) is an older
generator that *still emits* the pre-fix voice-steal code. Regenerating the examples with the
binary a developer has on hand reproduces the staleness. Fix the binary provenance and the example
staleness stops recurring; add `regen_examples.bat` without fixing it and the examples get
"regenerated" back to the same broken output.

### C-4 — F-B11-1's proposed CI gate validates the wrong path

F-B11-1 recommends a CI step that runs `codegen.exe -in:<file>` over every `examples/**/*.json`.
That gate would exercise `build_project_from_graph` — the *non-editor* path — for 100 of 101 files.
It would go green while the editor's actual serializer path (`buildProjectData` →
`build_project_from_raw`) stays completely untested against the corpus, and it would certify as
"good" output that is silently retimed to 120 BPM. The corpus gate is still the right idea; the
spec needs changing. See F-C3-11 for a corrected one.

### C-5 — F-B11-6's "hardcode the Odin table in a Vitest file" is the disease, not the cure

F-B11-6 proposes a UI test carrying a hand-copied transcription of `param_ranges.odin` as a TS
object. That creates an eighth hand-maintained copy of the parameter contract whose only guard
against going stale is a comment. It would catch today's drift once and then become another thing
to forget. Superseded by F-C3-4's generated-bindings design, which is not much more work and
removes the class.

### C-6 — F-B08-1 is right and there are three divergent master-mix paths, not two

Confirmed `useWasmAudioEngine.ts:92-95` bakes `1.0`. Extending it: the master-mix policy is
*hand-duplicated in two emitters* — `project_process` (`codegen.odin:2458-2480`) and `skald_process`
(`codegen.odin:2667-2687`) — bound only by the comment at `:2658-2659` ("identical policy to
project_process ... so the preview IS the export"). And `examples/integration_demo/README.md:7-8`
tells integrators not to use `project_process` at all, so the shipped game runs a *third* policy
(no master volume, no limiter). See F-C3-7.

### C-7 — F-B10-6 (Wavetable amplitude) is correct and worse than stated

Confirmed every citation. What F-B10-6 missed is the runtime consequence: because
`defaultWavetableParams` (`node-definitions.ts:58-63`) never writes `amplitude`, and `ParamNode.tsx:105`
renders a missing numeric field as `Number(undefined ?? 0)` → **0**, a freshly dragged Wavetable
displays `Amp 0` on the canvas while the engine plays it at `1.0`. Proven empirically in F-C3-4.

---

## Findings

### F-C3-1: The codegen binary the app ships and spawns is not the codegen binary CI validates, and it emits different DSP
- **kind**: architecture
- **area**: build provenance / codegen toolchain
- **severity**: critical
- **confidence**: high
- **effort**: S
- **when**: 0.2-blocker
- **supersedes**: root-causes F-B05-1; interacts with F-B05-7
- **evidence** (empirical, both binaries prebuilt in-repo, run read-only):
  - Two prebuilt codegen binaries exist and differ: `skald-backend/codegen.exe`
    (md5 `6c24ba2d…`, 1 161 216 bytes, 2026-07-30) and `skald-ui/skald_codegen.exe`
    (md5 `df80a67e…`, 1 153 536 bytes, 2026-07-24).
  - `skald-ui/skald_codegen.exe` is the one the app runs: `main.ts:70-73`
    (`codegenExePath()` → `app.getAppPath()/skald_codegen.exe` in dev,
    `process.resourcesPath/skald_codegen.exe` packaged) and `skald-ui/forge.config.ts:20`
    (`extraResource: ['./skald_codegen.exe', '../examples']`). It is deliberately checked into git:
    `.gitignore:2` ignores `*.exe`, `.gitignore:7` is `!skald-ui/skald_codegen.exe`.
  - `skald-backend/codegen.exe` is what the test harnesses use and rebuild:
    `run_golden.bat` line ~36 (`odin build main.odin -file -out:codegen.exe`), same in
    `run_acceptance.bat`. CI (`.github/workflows/ci.yml`) runs only those two scripts.
  - I ran **both** binaries on six unmodified fixtures from `skald-backend/tests/fixtures/` and
    diffed: `adsr_sine` 31 diff lines, `steal_click` 31, `dual_osc` 137, `reverb_predelay` 42,
    `plock_step` 43, `mixer_exposed_default` 46.
  - The diff is behavioural, not cosmetic. On `adsr_sine` the shipped binary emits
    `v.osc_1_phase = {}` unconditionally on every `note_on` and `v.adsr_2_release_level = 0.0`,
    with no `adsr_2_attack_start` field at all — i.e. the hard phase-and-envelope reset that
    `codegen.odin:1471-1499` was changed to guard behind `if !stolen` precisely because "the old
    hard reset ... was an audible click on every steal."
  - `skald-backend/tests/golden/adsr_sine.odin.golden` is **byte-identical to the newer binary's
    output and differs from the shipped binary's output** (verified by diff). So the golden
    snapshots certify a generator that is not the one users run.
  - `README.md:40` documents `npm start` as the dev flow and `:49` states plainly that
    "`npm start` uses the existing code generator." `package.json`'s `start` and `make:win` scripts
    do not rebuild it. Only `scripts/build-release.ps1:80` and `scripts/setup-dev.ps1:85` call
    `npm run build:codegen`.
- **detail**: There are three ways to produce a Skald build and only one of them refreshes the
  generator. `npm start` (the documented flow), `npm run make:win` (a documented packaging script),
  and any CI job all use whatever binary happens to be checked in. Right now that binary is six days
  and one audible-behaviour-change behind `core/codegen.odin`. Concretely: every Play in the editor,
  every Generate Code, and any package produced without `build-release.ps1` currently emits DSP with
  a previously-fixed voice-steal click reintroduced — and the green CI badge says nothing about it,
  because CI compiles its own binary from source and never looks at the one that ships. This also
  fully explains why all six checked-in `generated_audio.odin` files F-B05-1 examined lack
  `attack_start`: they were generated by the shipped binary, correctly, from a stale generator. The
  deeper problem is that a build artifact is checked in with no freshness invariant at all — nothing
  in the repo can answer "was this exe built from this source?"
- **recommendation**: Decide one of two and enforce it in CI.
  (a) *Preferred — stop shipping a checked-in binary.* Remove `skald-ui/skald_codegen.exe` from git,
  make `npm start`/`make`/`package` depend on `build:codegen` (electron-forge `prePackage` hook plus
  a `pretest`/`prestart` npm hook), and have CI fail if `skald-ui/skald_codegen.exe` exists in the
  index. Cost: contributors need Odin installed, which `setup-dev.ps1` already handles and which the
  live preview already requires anyway (`main.ts:232-238` hard-errors without it), so this costs
  nothing new.
  (b) *If the checked-in exe must stay* (offline contributors), add a CI step that rebuilds it, runs
  both it and the committed copy over the golden fixtures, and fails on any diff — the same
  `run_golden.bat` machinery, pointed at the shipped binary.
  Independently, and cheaply: add a `-version` flag to `main.odin` that prints a build stamp, and
  emit that stamp plus a hash of the input JSON into the generated header (this is F-B05-7's
  provenance stamp; F-C3-1 is the reason it matters). **Patch, not rewrite. S.**
- **manual impact**: `00-foundations.md` — the "The preview is the export" paragraph at line 221
  currently asserts the preview "runs codegen for real"; true, but it runs a *different* codegen
  than the repo's source describes. No chapter change needed once fixed; if (b) is chosen, the
  README's `npm start` note at line 49 needs rewriting.
- **migration**: None — no saved patch changes. Existing generated `.odin` files a user has already
  integrated will change on next regeneration (they gain the anti-click fix); that is a bug fix, one
  changelog line.

### F-C3-2: Two backend ingestion paths for one file format; the path 100 of 101 shipped examples take silently discards tempo, master volume and pattern length
- **kind**: architecture
- **area**: json.odin / main.odin — project ingestion
- **severity**: critical
- **confidence**: high
- **effort**: M
- **when**: 0.2-blocker
- **supersedes**: absorbs and re-scopes the non-ordering half of F-B04-1; explains F-B06-6
- **evidence** (empirical + static):
  - `main.odin:51-75` picks the parser by structural sniffing: unmarshal as `Project_Raw`, and if
    `len(project_raw.project.instruments) > 0` use `build_project_from_raw`, else re-unmarshal as
    `Graph_Raw` and use `build_project_from_graph`. There is no discriminator field in the format.
  - `build_project_from_graph` (`json.odin:296-367`) hardcodes `project.bpm = 120.0` (line 298) and
    `project.master_volume = 1.0` (line 299), never assigns `pattern_steps`, and constructs each
    `Project_Instrument` without `mute`, `solo` or `midi_config` (lines 349-358).
  - The editor's save format carries all of these in a `session` block
    (`useFileIO.ts:70-77`: `{...flow, sequencerTracks, session: sessionSettings}`), and
    `Graph_Raw` (`types.odin:106-115`) has no `session` field, so the block is parsed by nobody.
  - **Reproduced**: `examples/instruments/bass/wobble-samplehold-bass.skald.json` carries
    `"session": { "bpm": 140, "patternSteps": 16, "masterVolume": 0.7 }`. Running the repo's
    prebuilt `skald-backend/codegen.exe` on it unmodified emits `p.bpm = 120.000000000` (line 136 of
    the output) and `math.tanh(mixed_left * 1.000000000)` (line 733). Every BPM-derived expression
    in that file — the sequencer step clock (`samples_per_step_f := p.sample_rate * 60.0 / (p.bpm * 4.0)`),
    every note duration (`* (60.0 / p.bpm / 4.0)`), the synced LFO
    (`(1.0 / ((60.0 / p.bpm) * 1.0))`) and the synced S&H — is therefore 17% off its authored value.
  - The editor's Generate button does **not** take this path: `useCodeGeneration.ts` passes the real
    `bpm`/`masterVolume` through `buildProjectData`, which always emits the `project` wrapper. So the
    same file produces two different sounds depending on entry point.
  - **Measured population**: a script over `examples/**/*.json` (101 files) classified 100 as
    graph-shaped (no `project.instruments`) and 1 as project-shaped. Every shipped example except one
    takes the lossy path through the CLI.
- **detail**: This is the sharpest instance of the brief's thesis and it is not about node
  parameters at all — it is about the *project envelope*. `.skald.json` (what Save writes, what Load
  reads, what the manual's every "Try it" section tells the reader to open) and the project JSON
  (what the serializer builds and what the codegen was designed around) are two different formats
  that happen to overlap enough to both parse. Whichever one you feed the CLI, it parses; only one
  of them carries tempo. Anyone building a headless export pipeline, a CI gate (F-B11-1), a batch
  "export all examples" script, or simply following `examples/AUDIT.md`'s own documented methodology
  will silently produce assets at the wrong tempo and full master volume, with exit code 0 and no
  warning. `examples/AUDIT.md` in fact certified the corpus using exactly this path.
- **recommendation**: Collapse to one path. Concretely:
  1. Add `session` (or equivalent) to `Graph_Raw` and have `build_project_from_graph` read
     `bpm`/`patternSteps`/`masterVolume` from it, defaulting only when genuinely absent (mirroring
     `build_project_from_raw:250`'s `bpm <= 0` guard). This is the ~20-line fix that stops the
     bleeding and should land for 0.2 regardless of what else does. **S.**
  2. Then delete the sniffing. Make `build_project_from_graph` a thin *normalizer* that converts a
     `Graph_Raw` save into a `Project_Raw` and hands it to the single `build_project_from_raw`, so
     there is exactly one function that constructs a `Project`. Today the two constructors have
     independently written defaulting and clamping logic (compare `json.odin:261-268` with
     `:335-342`) that already differ in what they cover; one of them will drift again otherwise.
     **M.**
  3. Add a `"format"`/`"version"` discriminator to both shapes (F-C3-6) so the parser stops
     guessing.
  **Patch (1), then a contained rewrite of ingestion (2). M total.**
- **manual impact**: `00-foundations.md` — the "The preview is the export ... What you hear is what
  ships" paragraph (line 221) is false for the CLI and needs either the fix or an explicit caveat.
  Any chapter that tells a reader to run `codegen.exe` on an example file directly. `examples/AUDIT.md`
  must be re-run after the fix; its current results certify the wrong path.
- **migration**: No saved patch changes shape. Behaviour changes for anyone who has already exported
  an example through the CLI — their asset was at 120 BPM and will now be at its authored tempo.
  That is the fix, but it warrants a changelog line.

### F-C3-3: Determinism is a per-call-site convention, not an invariant — and the golden suite structurally cannot catch a violation
- **kind**: architecture
- **area**: codegen determinism / test harness
- **severity**: high
- **confidence**: high
- **effort**: S (stop the bleeding) / M (make it structural)
- **when**: 0.2-blocker
- **supersedes**: generalizes F-B04-1 (ordering half) and F-B11-4
- **evidence** (empirical + static):
  - **Reproduced independently**: six runs of the repo's prebuilt `skald-backend/codegen.exe` on the
    unmodified shipped `examples/songs/full/four-bar-song.skald.json` produced **four distinct
    md5s**. Two of those outputs differ by **1 816 diff lines**. The header's
    `// Music Layer assets:` line came out as `Kick Pad Bass HiHat Lead`, `Lead Bass Pad HiHat Kick`,
    `HiHat Lead Kick Pad Bass` and `HiHat Kick Lead Bass Pad` across runs.
  - Cause: `json.odin:303-307` and `:331-361` iterate `graph.nodes`, a `map[string]Node`
    (`types.odin:94`), with no sort, assigning `project.instruments[idx]` in map order.
  - The codebase knows this hazard and documents it three times — `graph_utils.odin:9-14`
    ("Odin map iteration order is unspecified and varies run-to-run ... or the generated source is
    non-deterministic"), `codegen.odin:1285-1291` (the `stable_resolutions` sort), and
    `codegen.odin:2246-2250` (`resolve_unique_names`' comment, which asserts "UI iteration order is
    stable" — an assumption the function in the *other file* violates). Every other emission pass
    routes through `nodes_sorted_by_id`. This one caller does not.
  - Consequence beyond text churn: `resolve_unique_names` assigns the unsuffixed name to whichever
    instrument comes first, and `generate_wasm_shim_code`'s `skald_trigger`/`skald_note_on`/
    `skald_set_param` switch on the **array index** (`codegen.odin:2566-2624`). So a rebuild can
    silently reassign which instrument is asset 0 and which one gets `Kick` vs `Kick_2`.
  - **The golden suite cannot see this.** Of 29 fixtures, exactly two are graph-shaped
    (`legacy_loose_graph.json`, `graph_save_roundtrip.json`) and they contain **0 and 1** instrument
    nodes respectively — the two values at which unsorted map iteration is provably deterministic.
    This is the identical failure mode as F-B11-4's `unison: 1`: the fixture exists, the code path is
    covered, and the value chosen makes the bug invisible.
- **detail**: Two separate problems wear one symptom. The bug is a one-line fix. The architecture
  problem is that "iterate deterministically" is enforced by developer memory and three comments in
  two files, and the one place someone forgot went unnoticed through a golden-snapshot suite whose
  entire purpose is catching exactly this. Any new `for _, x in <map>` will reintroduce it, and
  nothing in CI will notice.
- **recommendation**: Three things, in this order.
  1. Replace both loops in `build_project_from_graph` with `nodes_sorted_by_id(graph)`. **S.**
  2. Add a determinism gate to `run_golden.bat`: for each fixture, run codegen **twice** into two
     scratch files and `fc /B` them before comparing to the golden. This costs one extra codegen
     invocation per fixture (milliseconds) and turns determinism from a convention into a CI-enforced
     invariant that catches the *next* violation, not just this one. **S.** This is the highest
     value-per-hour item in the whole audit.
  3. Structurally: stop exposing raw map iteration. Make `Graph.nodes` carry an ordered `node_ids:
     []string` built once at parse time (sorted, or better, *authoring order* preserved from the JSON
     array — see F-C3-10 on why order should be an input, not a derived property), and make
     `nodes_sorted_by_id` the only accessor. Then add a graph-shaped fixture with 5+ instruments and
     duplicate names so the degenerate-value hole is closed. **M.**
  Also apply F-B11-4's discipline as a written rule: no fixture field whose meaning is "a count" may
  sit at its degenerate value (`unison: 1`, one instrument, `inputCount: 1`) unless a second fixture
  covers the non-degenerate case.
- **manual impact**: none.
- **migration**: none — output becomes stable, which can only remove surprises. Golden files for the
  two graph-shaped fixtures may need one `run_golden.bat update`.

### F-C3-4: The parameter contract is authored five to seven times in two languages, none of it generated, none of it cross-checked — with ten live divergences today
- **kind**: architecture
- **area**: parameter definitions (types.ts / node-definitions.ts / *Node.tsx / NodeParameterControls.tsx / param_ranges.odin / codegen.odin)
- **severity**: high
- **confidence**: high
- **effort**: L (full generator) / M (schema + check only)
- **when**: 0.2-blocker (the check); 0.2-desirable (the generator)
- **supersedes**: F-A10-17, F-B11-6, F-B10-7; root-causes F-A01-10, F-A02-6, F-A06-3, F-A06-4, F-A09-1, F-A09-5, F-B10-6
- **evidence**: A single parameter's contract is spread across, at minimum:
  1. `skald-ui/src/definitions/types.ts` — the TS field (no ranges, and an `[key: string]: any`
     index signature at `:28` that makes every omission type-check anyway)
  2. `skald-ui/src/definitions/node-definitions.ts` — the authored default and the default
     `exposedParameters` list
  3. `skald-ui/src/components/Nodes/<X>Node.tsx` — the canvas field's `min`/`max`/`step` and the
     handle ids
  4. `skald-ui/src/components/NodeParameterControls.tsx` — the sidebar slider's independent
     `min`/`max`/`default`
  5. `skald-backend/core/param_ranges.odin` — the clamp, the exposed-init default and the unit
     that reach the generated `_set_<param>` and `<Foo>_PARAMS`
  6. `skald-backend/core/codegen.odin` — a per-generator inline fallback default, e.g.
     `get_f32_param(graph, node, "cutoff", "input_cutoff", 1000.0)` at `:330`
  7. `skald-backend/core/graph_validate.odin` — the modulation port name, if the parameter has one

  Cross-reading (2), (5) and (6) for every parameter, **ten have a live divergence** (all verified
  against current line numbers):

  | param | node-definitions.ts | param_ranges.odin default | codegen.odin inline |
  |---|---|---|---|
  | ADSR `release` | `1.0` (:108) | `0.2` (:66-67) | `0.1` (:247) |
  | ADSR `sustain` | `0.5` (:107) | `0.7` (:64-65) | `0.7` (:246) |
  | ADSR `attack` | `0.1` (:105) | `0.1` (:60-61) | `0.01` (:244) |
  | ADSR `decay` | `0.2` (:106) | `0.1` (:62-63) | `0.1` (:245) |
  | Reverb `decay` | `3.0` (:124) | `0.1` (:62-63, shared with ADSR) | `0.5` (:551) |
  | Filter `cutoff` | `800` (:93) | `800` (:50-51) | `1000` (:330) |
  | VCA `gain` | `0.75` (:155) | `1.0` (:86-87) | `1.0` (:764) |
  | Mixer `level*` | `0.75` (:141-144) | `1.0` (:43-45) | `1.0` (:709) |
  | FmOperator `frequency` | `2` (:53) | `1.0` (:28) | `1.0` (:461) |
  | Mapper `outMax` | `20000` (:200) | `1.0` (:102-103) | `1.0` (:743) |
  | Noise / S&H `amplitude` | `1.0` (:100, :66) | `0.5` (:88-89) | `1.0` (:305, :401) |
  | Wavetable `amplitude` | **absent** (:58-63) | `0.5` (:88-89) | `1.0` (:506) |

  Note also that `param_ranges.odin` is keyed by **parameter name**, so Reverb's `decay` (a 0–10 s
  reverb time) and ADSR's `decay` (an envelope segment) share one entry — a semantic collision the
  node-type override mechanism at `:26-38` exists to paper over case by case.

  **Empirically proven consequence** (built two one-node fixtures, ran the prebuilt
  `skald-backend/codegen.exe`, diffed the emitted line): a Wavetable node whose JSON omits
  `amplitude` produces **three different answers for the same field**:
  - the canvas renders **0** — `ParamNode.tsx:105`, `value={typeof value === 'number' ? value : Number(value ?? 0)}`
  - not exposed → emitted DSP is `... * (f32(1.000000000))` (codegen inline default, `:506`)
  - exposed → `_init` emits `p.amplitude = 0.500000000` and the DSP reads `* (p.amplitude)`
    (`param_ranges.odin:88-89` via `exposed_param_default`, `codegen.odin:1247-1248`)

  So **ticking the expose checkbox on a parameter you never touched halves its amplitude — a 6 dB
  change in the sound, with no edit to the value.** That is not a range-parity nit; it is a
  structural consequence of "the default lives in three places" and it applies to every parameter in
  the table above.
- **detail**: Prior tiers correctly called this the most-repeated "fixed once, silently
  reintroduced" bug class — `FIXED.md`'s own history shows six range mismatches fixed across P2/B3
  and Tier 1 found four more. It will keep recurring because the mechanism guarantees it: adding or
  editing a parameter requires five to seven coordinated hand edits across two languages, with no
  compiler, linter, test or type in the system that relates any two of them.
- **recommendation**: **Generate the bindings from one schema.** This is a rewrite of the
  *declarations*, not of any behaviour, and it is well within 0.2 if scoped as below.
  1. Create `schema/nodes.json` (or `.yaml`) as the single source of truth. One entry per node type:
     `codegenType`, palette label, accent colour, and a list of parameters each carrying
     `{ name, kind: number|enum|bool|string, min, max, step, default, unit, exposable, modPort?,
     showIf? }`, plus `inputs[]` and `outputs[]` port lists. This is ~18 node types × ~4 parameters —
     a few hundred lines, mechanically transcribable from what already exists, and it is the *only*
     thing anyone edits afterwards.
  2. A small Node script (`npm run gen:schema`, wired as a `pretest`/`prebuild` hook) emits:
     - `src/definitions/node-definitions.generated.ts` (defaults + `NODE_DEFINITIONS`)
     - `src/definitions/types.generated.ts` (the per-node param interfaces — and drop the
       `[key: string]: any` escape hatch at `types.ts:28` so an omitted field is a compile error,
       which is what would have caught Wavetable's missing `amplitude`)
     - `src/definitions/param-ranges.generated.ts` (what the sidebar and canvas controls clamp to)
     - `skald-backend/core/param_ranges.generated.odin` (`lookup_param_range`)
     - `skald-backend/core/graph_validate.generated.odin` (the per-type port arrays)
     CI fails if regenerating produces a diff — the same discipline `run_golden.bat` already applies
     to emitted Odin, reused verbatim.
  3. Delete `codegen.odin`'s inline fallback defaults. `get_f32_param`'s `default_val` argument
     should come from `lookup_param_range(param, node.type).default`, not from a literal typed at
     each call site. That removes column three of the table above by construction and is a
     mechanical ~40-line change.
  4. `NodeParameterControls.tsx`'s hand-written `switch (type)` should render from the generated
     spec, falling back to bespoke widgets only for the genuinely special ones (envelope editor, XY
     pad, BPM sync). This also closes F-B07-8 (canvas/sidebar divergence) as a side effect, because
     both surfaces become views of one list.
  **Steps 1–3 are the 0.2 blocker (M). Step 4 is 0.2-desirable (M).** Do not do F-B11-6's hardcoded
  parity test instead; it is a seventh copy.
- **manual impact**: `00-foundations.md` "What expose does" (the "Those ranges come from
  `param_ranges.odin`" paragraph) — the file becomes generated and the explanation changes to
  "ranges come from the node schema, and the editor slider and the exported clamp are the same
  number by construction." `50-bass-teardown.md` and `60-complexity-ladder.md`'s matching "What
  expose does" sections. The entire range-mismatch genre of Code-vs-intent notes across
  `filter.md`, `distortion.md`, `gain.md`, `instrument.md`, `noise.md`, `wavetable.md`, `lfo.md`,
  `sampleHold.md` is retired by construction.
- **migration**: Additive for saved patches, but **the defaults that change alter the sound of
  nodes whose value was never written to JSON**. The safe sequencing is: pick one authoritative
  default per parameter (I recommend the authored `node-definitions.ts` value, since that is what
  the user has actually been looking at), then run a one-time load-time backfill that writes the
  chosen default into any node missing the key. That makes every existing patch's audio explicit and
  frozen at whatever it currently is, so the unification itself is silent. This backfill is exactly
  the kind of thing that needs F-C3-6's version field to run once and only once.

### F-C3-5: The editor and the generator maintain two separate models of what is legal, and they diverge in both directions
- **kind**: architecture
- **area**: graph_validate.odin / *Node.tsx handle lists / useNodeComposition
- **severity**: high
- **confidence**: high
- **effort**: M
- **when**: 0.2-blocker
- **supersedes**: unifies F-A09-6, F-A09-4, F-B04-2, F-B04-3
- **evidence**: Three hand-maintained lists define "legal port" and nothing relates them:
  `graph_validate.odin:26-74` (`OSC_INPUTS` … `valid_output_port`, whose own header comment at
  `:16-19` says "This validator is the single source of truth for port names; if you add a port to a
  generator, add it here"), the `find_inputs_for_port`/`get_f32_param` calls inside each generator
  (`codegen.odin:145, 227, 328, 418, 442, 444, 488, 515, 546, 586, 705, 721, 738, 762, 2032`), and
  each node component's `inputs`/`outputs` arrays.

  **Backend legal, unreachable from the editor** (7 ports):
  - `ADSR` `input_attack`, `input_decay`, `input_sustain`, `input_release` — validated
    (`graph_validate.odin:27`), read and applied (`codegen.odin:244-247`), but `ADSRNode.tsx:6`
    declares only `{ id: 'input', label: 'Gate' }`.
  - `FmOperator` `input_freq` — validated (`:30`), read (`codegen.odin:444`), absent from
    `FMOperatorNode.tsx`, which declares only `input_mod` and `input_carrier`.
  - `Panner` `output_left`/`output_right` — validated (`graph_validate.odin:70-72`), given dedicated
    output vars (`param_utils.odin:68-69`), emitted (`codegen.odin:720-735`), and `PannerNode.tsx`
    declares exactly one output handle.

  **Editor legal, fatal in the generator** (1 case, high blast radius): an Instrument node can be
  selected into a new Instrument (`useNodeComposition.ts:66+` never filters `type === 'instrument'`),
  saves, reloads, and passes validation — `valid_input_ports("Instrument")` returns
  `(nil, false)` and `validate_connections` explicitly does `if !known do continue`
  (`graph_validate.odin:131-132`), while `valid_output_port` accepts `"output"` for any type
  (`:66`). **Reproduced**: feeding a project-wrapped nested Instrument to the prebuilt
  `skald-backend/codegen.exe` gives
  `Error: unknown node type "Instrument" (node id inner) in instrument "Outer" — no code generator
  exists for it.` and exit 1, from the per-voice dispatch default at `codegen.odin:1894-1901`.
- **detail**: The validator's own comment names the invariant it cannot enforce. Its
  `if !known do continue` line is the exact hole: a node type the validator has never heard of gets
  *every* wire into it waved through, on the promise that "the emission dispatch reports it" — which
  it does, 800 lines later, with a message about code generators rather than about nesting, after
  the user has already built, saved, reloaded and possibly shipped the patch. Meanwhile the reverse
  direction means three genuinely implemented, tested, validated backend capabilities (envelope-time
  modulation, FM carrier pitch modulation, true stereo routing) are dead because nobody added a
  handle.
- **recommendation**: One validator, two callers.
  1. Extract the port tables into the generated schema (F-C3-4 step 1). Then the UI's handle list
     and `valid_input_ports` are the same data and neither direction of divergence is expressible.
     This alone closes all seven unreachable ports — they either get handles or they get deleted
     from the backend, and the schema forces that to be a decision rather than an oversight. My
     call: give ADSR its four handles and FmOperator its `input_freq` handle (they cost nothing —
     the DSP already exists); give Panner `output_left`/`output_right` handles per F-B04-3(a).
  2. Add a real **preflight validation pass** in the backend, run before any emission, that owns
     every structural rule — nested Instruments, unknown node types, cycles, bus-domain violations,
     unresolvable P-locks — and reports *all* violations with purpose-built messages rather than
     `os.exit(1)` on the first one. Today those rules are scattered across `validate_connections`,
     `compute_bus_domain`, `collect_plock_targets` and the two dispatch switch defaults, each exiting
     immediately. Give the CLI a `-check` flag that runs only this pass and prints machine-readable
     diagnostics.
  3. Have the editor call `-check` on a debounce (it already spawns the CLI on every preview
     rebuild) and surface the diagnostics on the canvas. That is what makes the two models *the same
     model* rather than two models that agree by luck. Until (3) exists, at minimum reject
     `type === 'instrument'` from the Create-Instrument selection with an explicit message.
  **Patch (1) and (3); contained rewrite of (2). M.**
- **manual impact**: `nodes/adsr.md` "What it can and cannot connect to" and the handle table gain
  four modulation inputs; `nodes/fmOperator.md` the same for `input_freq`; `nodes/panner.md`'s "The
  one rule that matters" is rewritten around real L/R handles; `nodes/instrument.md` "What it can and
  cannot connect to" gains an explicit statement that Instruments cannot nest.
- **migration**: Purely additive port handles — no saved patch changes. Nested Instruments: none of
  the 101 shipped examples contains one (structurally scanned), so the new rejection breaks nothing
  in the corpus; a user's own patch would newly fail at load with a clear message instead of at
  Generate with an opaque one, which is the improvement.

### F-C3-6: No schema version anywhere, and 0.2's queued changes all assume one exists
- **kind**: risk
- **area**: save format / migration infrastructure
- **severity**: high
- **confidence**: high
- **effort**: M
- **when**: 0.2-blocker
- **supersedes**: absorbs F-B06-1 and F-B06-12; precondition for F-C3-4's default unification, F-A01-6, F-A03-7, F-A03-8, F-A07-5, F-A09-8, F-A10-14, F-A10-17
- **evidence**: A repo-wide grep for `schemaVersion|schema_version|fileVersion|"version"` across
  `skald-ui/src` and `skald-backend` returns **zero** matches. `handleSave` (`useFileIO.ts:70-77`)
  writes `{...flow, sequencerTracks, session}` with no version key. Every compatibility decision is
  structural sniffing: `parseSaveFile`'s `parentNode` → `parentId` rehydration (`:44-52`), the
  `flow.session` presence check (`:118-133`), the backend's format sniffing (`main.odin:58`), the
  `bpm <= 0` "field was absent" heuristic (`json.odin:246-250`), the `volume <= 0` heuristic
  (`:266-268`), and `master_vol <= 0.0 do master_vol = 1.0` (`codegen.odin:2455-2456`). That last one
  is the clearest cost: the system cannot distinguish "the author muted the master" from "this file
  predates master volume," so it guesses, and F-A05-1's "master volume of exactly 0 exports as full
  volume" bug is the direct result.
- **detail**: Every "absent means old" heuristic in the codebase is a version check written in
  disguise, each one guessing separately and at least one guessing wrong audibly. And the 0.2 change
  list is almost entirely schema-breaking: `fixedPitch: boolean` → `keyTrack: number` (F-A01-6),
  collapsing `bpmSync`/`syncRate`/`frequency` storage (F-B02-6), explicit asset type (F-A09-8),
  per-edge modulation `amount` (F-B10-1), per-parameter stored `{min,max}` (F-A10-17), and the
  default-backfill this audit's F-C3-4 requires. Each of those Tier-1/2 findings independently wrote
  "migration: automatic upgrade on load, feasible," and every one of them is only feasible if this
  exists first.
- **recommendation**: Build it before any 0.2 feature lands. Minimum viable and non-negotiable:
  1. `SCHEMA_VERSION` constant in one place. `handleSave` stamps it. A file with no key is version 0.
  2. An ordered `MIGRATIONS: { from: number; to: number; apply: (flow) => flow }[]` run in
     `parseSaveFile` in a loop until `flow.version === SCHEMA_VERSION`, **before** any state is set.
     The two existing ad hoc branches (`parentNode`, absent `session`) become migration 0→1.
  3. A rule for what migrations may do: they operate on the parsed save object only, they are pure,
     and they must be idempotent-safe (running twice on already-migrated data is a bug the version
     gate prevents rather than something each migration defends against).
  4. **The migration walk must recurse into `node.data.subgraph.nodes`.** The existing `parentNode`
     rehydration does not (F-B06-7), and every 0.2 change on the list targets nodes that live
     *inside* instrument subgraphs, so a non-recursive migrator would migrate nothing that matters.
  5. Mirror the version on the backend: add `version` to `Graph_Raw`/`Project_Data_Raw`, and have the
     CLI **hard-error** on a version it does not know rather than parsing it optimistically. This is
     what lets the editor and the CLI stop guessing at F-C3-2's format sniffing.
  6. A round-trip test (F-B11-7) that loads each of 3–4 representative `examples/` files, migrates,
     re-saves and asserts structural equality — and a per-migration fixture pair (before/after) so
     each transform is pinned.
  7. Decide and document the Save policy: I recommend Save always stamps the current version, so a
     migrated file is upgraded in place on next save and the migration never re-runs. State it in
     the code, because "does re-saving upgrade the file" is the question every future migration
     author will need answered.
  **New infrastructure, not a rewrite. M.**
- **manual impact**: `00-foundations.md` needs a new section describing the save-file schema and its
  version field (the manual currently never mentions a schema at all). Every chapter documenting a
  0.2 boolean→continuous change gains a paragraph on what happens to an old file.
- **migration**: This finding *is* the migration infrastructure. It is backward compatible by
  construction — every file in `examples/` has no version key and is treated as 0.

### F-C3-7: "The preview is the export" is false in three independent places, and one of them is the manual's own headline claim
- **kind**: architecture
- **area**: WASM preview / generated master mix / integration contract
- **severity**: high
- **confidence**: high
- **effort**: M
- **when**: 0.2-blocker
- **supersedes**: extends F-B08-1, F-B05-2, F-B05-1
- **evidence**:
  1. **Master volume.** `useWasmAudioEngine.ts:92-95` calls
     `buildProjectData(nodes, edges, sequencerTracks, bpm, 1.0, ...)` — the preview always bakes
     `master_volume = 1.0` and applies the real slider as a post-worklet JS `GainNode`
     (`:191-196`, `SequencerDock.tsx:101-117`). `useCodeGeneration.ts` passes the real value.
     Preview plays `vol · tanh(x)`; export plays `tanh(vol · x)`. These are different functions, and
     `00-foundations.md:421` documents the *export's* behaviour ("master volume is applied before the
     limiter ... That is deliberate") as if the editor demonstrated it.
  2. **Two hand-written master mixes.** `project_process` (`codegen.odin:2458-2480`) and
     `skald_process` (`:2667-2687`) each independently compute mute/solo exclusion, summation and
     `math.tanh(mix * master_vol)`. They are bound only by the comment at `:2658-2659`. Any future
     change to mix policy — a real limiter, per-instrument volume at the master stage, a DC blocker —
     must be made twice, correctly, with nothing checking.
  3. **The shipped game runs neither.** `examples/integration_demo/README.md:7-8` explicitly tells
     integrators "The convenience `project_*` wrapper is not used; that's a test-harness affordance
     only," and the demo's own mix is `l := (sfx_l + layer_l) * 0.6` (`main.odin:211-212`) — no
     master volume, no limiter, an unexplained constant.
  4. **Different binaries.** Per F-C3-1, the preview and Generate both spawn
     `skald-ui/skald_codegen.exe` while the golden suite validates a newer one. So "the preview is
     the export" is currently true only in the sense that both are equally unvalidated.
  Also verified: `00-foundations.md:221` claims "Both the preview and the Generate Code button are
  fed byte-identical project descriptions by the same serializer." They are fed the same serializer
  with a different `masterVolume` argument. The claim is false as written, with a citation attached.
- **detail**: The architecture *is* right — one DSP implementation, compiled, run in both places —
  and that is genuinely the best structural decision in this codebase (it retired an entire
  root-cause theme from the 2026-07-05 review, per F-B09a-1). The problem is that the identity
  between preview and export is asserted rather than constructed, and three separate shortcuts have
  since been taken through it. Each was locally reasonable (don't recompile on a volume drag; the
  shim needs its own entry point; games shouldn't allocate). Collectively they mean a sound designer
  cannot trust the thing they are listening to.
- **recommendation**:
  1. Make `master_volume` a live exposed scalar in the generated `Project_State`/shim — one f32, one
     `skald_set_master_volume` export — and have the dock drive it through `postMessage` instead of a
     JS GainNode. Delete the `1.0` special case in `buildProjectData`'s caller. This removes the
     divergence *and* the recompile-on-volume-drag problem the shortcut existed to avoid. **S–M.**
  2. Emit the master mix **once**. `generate_wasm_shim_code`'s `skald_process` should call
     `project_process` in its sample loop rather than reimplementing it. Both files are already in
     the same package. This is a ~15-line deletion. **S.**
  3. Give the game the same mix. Emit a small `skald_master_mix(l, r) -> (f32, f32)` (or an
     `Skald_Master` struct with the volume field) in the game-facing package that `project_process`
     also calls, so the recommended per-asset integration path can get authored master volume and the
     limiter without adopting the whole `project_*` wrapper. Then rewrite the demo's `* 0.6`. **S.**
  4. Add one acceptance fixture that renders the same project through `project_process` and through
     the shim's `skald_process` and asserts sample-identical output. That converts the comment at
     `:2658-2659` into a test. **S.**
  **All patch, no rewrite. M in aggregate, and it is the single change that most restores trust in
  the product's core promise.**
- **manual impact**: `00-foundations.md` — the "The preview is the export" paragraph (line 221)
  must lose the "byte-identical project descriptions" sentence until (1) lands, and the gain-staging
  walkthrough around line 421 currently teaches a behaviour the editor cannot demonstrate. Whatever
  chapter covers integrating the generated package (which does not exist — F-B05-8) needs the master
  mix helper documented.
- **migration**: None for saved patches. `master_volume` becoming runtime-settable is a purely
  additive API change.

### F-C3-8: `codegen.odin` is 2 690 lines with a single 1 000-line procedure that interleaves analysis and emission and passes results through a mutated graph field
- **kind**: architecture
- **area**: skald-backend/core/codegen.odin
- **severity**: medium
- **confidence**: high
- **effort**: L
- **when**: 0.2-desirable (the extraction); later (the IR)
- **evidence**:
  - 2 690 lines, 38 top-level procs. `generate_processor_code` spans `:1025-2025` — **1 000 lines**,
    just under 40% of the file — and internally does: instrument param extraction, topological sort
    + bus-domain analysis, header emission, `Voice_State` struct emission, `Processor` struct
    emission, exposed-parameter *resolution* (analysis), `_init` emission, `note_on`/`note_off`
    emission, public API emission, setter/`PARAMS`/`set_param` emission, and the whole per-sample
    process body including two node-type dispatch switches.
  - Analysis results reach the emitters through a **mutated field on the input**:
    `graph.exposed_resolutions` is written at `codegen.odin:1283` and read much later, from a
    different file, by `get_f32_param` (`param_utils.odin:79-85`). `types.odin:98-99` labels it
    "In-memory only; populated by the codegen, not parsed from JSON" — an admission that `Graph` is
    doing double duty as parsed input and as analysis output.
  - **~30 node-type discrimination sites** in one file (`grep -n 'switch node.type\|node.type =='`
    returns 33 hits). `case "Oscillator"` alone appears three times, in three unrelated switches:
    `is_voice_coupled_type` (`:65`), the fresh-voice reset switch (`:1486`), and the voice-domain
    dispatch (`:1864`). The bus-domain dispatch at `:1963` is a second, near-identical copy of the
    voice-domain dispatch at `:1863`.
  - Emission is string concatenation into one `strings.Builder`. The codebase has had to invent two
    conventions to simulate the target language's type system in strings — `f32_literal`
    (`param_utils.odin:22-24`, whose comment records "a bug class that was patched three times at
    individual sites") and `emit_f32_local` (`:33-35`, "the per-site vigilance contract that failed
    3+ times").
- **detail**: The *per-node generators* (`generate_oscillator_code` etc., `:125-800`) are genuinely
  good — small, focused, heavily commented with the reasoning behind each clamp. The structure
  problem is entirely in the orchestrator. A 1 000-line proc that both computes facts about the graph
  and writes text is why (a) the exposure pass has no way to know that `bpmSync` makes a parameter
  structurally dead (F-B02-1 — the two facts are computed 800 lines apart with no shared
  representation), (b) the master-mix policy got duplicated (F-C3-7), and (c) the fresh-voice reset
  switch silently omits LFO/Noise/SampleHold (F-B03-2) with nothing relating it to the struct-field
  switch 300 lines earlier that *does* include them.
- **recommendation**: **Extract, do not rewrite.** A full IR is the right long-term answer and the
  wrong 0.2 answer. Sequence:
  1. Split the file by responsibility, no behaviour change, golden suite as the safety net:
     `codegen_analysis.odin` (bus domain, exposure resolution, P-lock resolution, asset-type
     detection, unique names), `codegen_nodes.odin` (the ~15 `generate_*_code` procs),
     `codegen_processor.odin` (struct/init/note_on/note_off/public API), `codegen_sequencer.odin`
     (already cohesive), `codegen_project.odin` (project wrapper + header), `codegen_wasm.odin`
     (the shim). All in the same Odin package, so this is pure file movement plus proc extraction.
     `run_golden.bat check` proves it output-preserving. **M, and it is the enabling step for
     everything below.**
  2. Make the analysis phase explicit and pure. Introduce an `Instrument_Plan` struct — bus-domain
     set, topological order, exposed resolutions, P-lock targets, asset type, voice-state field list
     — returned by one `analyze_instrument(graph, instrument) -> Instrument_Plan` and passed *by
     value* to every emitter. Delete `Graph.exposed_resolutions`. This is what makes cross-cutting
     rules like "a sync-shadowed parameter must not be emitted as exposed" expressible at all. **M.**
  3. Collapse the two dispatch switches into one `emit_node(sb, node, plan, domain)` taking a
     `Domain` enum, and derive `is_voice_coupled_type` and the per-node struct fields and the
     per-node reset policy from a single **node-type registry table** (see F-C3-9) rather than from
     four independent switches. **M.**
  4. *Later, not 0.2*: an expression IR. `get_f32_param` returning `"(base) + (mod1) + (mod2)"` as a
     string is what makes F-B10-1's per-edge `amount` a string-surgery change rather than a
     one-line change, and it is why `f32_literal` has to exist. A tiny `Expr` union (`Literal`,
     `Field`, `Var`, `Add`, `Mul`, `Call`) with one `render(Expr) -> string` at the boundary would
     make per-edge depth, multiplicative amp destinations (F-A01-9), and constant folding all
     trivial. Roughly a week; do it when a modulation-model change actually lands. **L.**
- **manual impact**: None directly — but every chapter's `codegen.odin:NNN` citation breaks when the
  file splits. Land F-B11-9's citation-drift checker *before* step 1, and prefer proc-name citations
  over line numbers in the rewritten manual (F-A01-1 already recommends this for a different reason).
- **migration**: None. Steps 1–3 are behaviour-preserving by construction and provable by the
  existing golden suite.

### F-C3-9: Adding one node type takes roughly twenty coordinated hand edits across two languages, with no checklist, no registry and no test
- **kind**: risk
- **area**: node-type extensibility (cross-cutting)
- **severity**: medium
- **confidence**: high
- **effort**: M
- **when**: 0.2-desirable
- **evidence**: Counted directly. To add a node type you must edit: `types.ts` (interface + the
  `NodeParams` union), `node-definitions.ts` (defaults + `NODE_DEFINITIONS`), `nodeTypes.ts`,
  `components/Nodes/<X>Node.tsx`, `components/Nodes/index.ts`, `components/Nodes/NodeStyles.ts`
  (accent colour), `NodeParameterControls.tsx` (sidebar switch case), `Sidebar.tsx` (palette entry),
  `json.odin` `normalize_node_type` (`:10-34`), `graph_validate.odin` `valid_input_ports` +
  `valid_output_port`, `param_ranges.odin`, a new `generate_X_code` proc, the voice-domain dispatch
  (`codegen.odin:1863`), the bus-domain dispatch (`:1963`), the `Voice_State` field chain
  (`:1116-1148`), the `Processor` field switch (`:1194`), `_init` seeding if it has RNG/history state
  (`:1332-1370`), the fresh-voice reset switch (`:1482`), `is_voice_coupled_type` (`:63`), and a
  fixture + golden. Nothing enumerates this list; nothing fails if you miss an entry.
- **detail**: The evidence that this is a live cost, not a hypothetical: `BUGS.md`'s
  `BUG-DISPATCHER-MISSING-NODES` is exactly this failure — LFO, S&H, FmOperator, Wavetable and Panner
  had been added everywhere except the two dispatch switches. F-B03-2 is the same failure in the
  reset switch (LFO, Noise, SampleHold have `Voice_State` fields but no reset case). F-A02-6 is the
  same failure in `param_ranges.odin`. F-B11-2's finding that the six node types with no fixture are
  exactly the six with live bugs is the same failure again, seen from the test side. Tier 2's
  recommendation to add Compressor, EQ and Chorus nodes (F-B10-4) would mean running this gauntlet
  three more times.
- **recommendation**: A **node-type registry** is the natural complement to F-C3-4's schema and
  should be the same file. Per node type declare: `codegenType`, ports, parameters, `voiceCoupled:
  bool`, `perVoiceState: [{name, type}]`, `perProcessorState: [{name, type}]`, `resetOnFreshVoice:
  bool`, `allowedDomains: [voice|bus]`. Generate from it: `normalize_node_type`, both validator
  tables, `param_ranges`, `is_voice_coupled_type`, the `Voice_State`/`Processor` field emission, and
  the reset switch. What stays hand-written is exactly one thing — the `generate_X_code` proc — plus
  the UI card if it needs a bespoke widget. That is the correct boundary: the DSP is the interesting
  part and everything else is bookkeeping. Add a CI check that every entry in the registry has at
  least one acceptance fixture (closes F-B11-2 mechanically rather than by six one-off additions).
  **M, and it largely falls out of F-C3-4 step 1 and F-C3-8 step 3 if those are sequenced first.**
- **manual impact**: none.
- **migration**: none.

### F-C3-10: Asset identity is positional, name-derived and inferred — three unstable identifiers and no stable one
- **kind**: design
- **area**: generated API — asset and symbol identity
- **severity**: medium
- **confidence**: high
- **effort**: M
- **when**: 0.2-desirable
- **supersedes**: unifies F-B05-4, F-A09-7, F-A09-8 and the consequence half of F-C3-3
- **evidence**: A game addresses a Skald asset three ways, and all three move under ordinary editing:
  1. **By index** — `skald_trigger(asset: i32, ...)` and every other shim export switch on the
     `project.instruments` array position (`codegen.odin:2566-2624`). That position comes from map
     iteration order on the graph path (F-C3-3) and from React Flow's node array order on the editor
     path — neither is a stable identity, and nothing in the UI displays it.
  2. **By symbol prefix** — `clean_instrument_name` (`:960-965`) derives it from the display name;
     `resolve_unique_names` (`:2251-2266`) appends `_2` to later duplicates. Renaming an instrument
     in the editor renames every exported proc. Duplicating one (paste, or Export-Step-to-Instrument)
     produces two identically-named on-canvas instruments and a silent `_2` that the UI never shows
     (F-A09-7).
  3. **By field name** — an exposed param's setter is `<Foo>_set_<param>` unless another node
     exposes the same name, in which case it becomes `<Label>_<param>` (`:1251-1258`). Removing or
     un-exposing the *other* node drops the count back to 1 and silently renames the *untouched*
     node's setter back.
  Meanwhile whether an asset is an SFX or a Music Layer — which determines the entire shape of its
  public API — is inferred at export time from whether its sequencer track happens to hold a note
  (`detect_asset_type`, `:801-809`).
  The one genuinely stable identifier in the system, `Node.raw_id` (`types.odin:24-29`), exists and
  is already used for the `"<raw_id>::<param>"` alias — but only for parameters, never for the asset.
- **detail**: The product's whole value proposition is that a sound designer iterates in the editor
  while a programmer integrates the output. That contract requires *something* to be stable across
  iterations, and nothing is. A cosmetic rename breaks the game's build (loudly, at least). An
  unrelated node edit renames a setter (silently). Deleting the last note from a track flips an asset
  from Music Layer to SFX and changes which procs exist. And on the CLI path, a rebuild with no edits
  at all can renumber the assets.
- **recommendation**: Introduce one stable, user-visible **export identity** per instrument and make
  everything derive from it.
  1. Add `exportId: string` to `InstrumentParams`, defaulted from the sanitized name at creation,
     editable in the sidebar, shown on the node, and *not* changed by renaming the display label.
     Symbols become `<exportId>_init` etc. `resolve_unique_names` becomes a uniqueness *validation*
     (hard error on duplicate `exportId`) rather than a silent suffixer.
  2. Sort `project.instruments` by `exportId` before emission, so the shim's asset indices are a
     stable function of the project's content rather than of iteration order — this closes F-C3-3's
     consequence half permanently, independently of the map-iteration fix.
  3. Make field-name collision resolution stable per node: always prefix with the node's raw id when
     a name is exposed on more than one node *or has ever been*, rather than recomputing from the
     current node set. Simplest correct version: always emit both `<param>` (when unique) *and* the
     `"<raw_id>::<param>"` alias, and tell integrators in the generated header that the alias is the
     stable one.
  4. Make asset type an explicit field (F-A09-8), defaulted once from `detect_asset_type` at
     migration time.
  **M, and it needs F-C3-6's version field for the one-time `exportId`/`assetType` backfill.**
- **manual impact**: `nodes/instrument.md` — "One Instrument = one game asset" and the "Asset"
  glossary entry both describe the inferred classification as a stable fact; both need rewriting
  around an explicit setting. The (missing) integration chapter, F-B05-8, must document the identity
  contract.
- **migration**: Backfill `exportId` from the current sanitized-and-suffixed name so already-exported
  games keep compiling, and `assetType` from `detect_asset_type`'s current answer. Both are exactly
  computable at migration time, so nothing changes on first load.

### F-C3-11: Corrected spec for the examples-corpus CI gate — the obvious version tests the wrong path
- **kind**: correction
- **area**: CI / examples corpus
- **severity**: medium
- **confidence**: high
- **effort**: M
- **when**: 0.2-blocker
- **supersedes**: re-specs F-B11-1 and F-B11-10
- **evidence**: F-B11-1 proposes `codegen.exe -in:<file>` over every `examples/**/*.json`. Measured:
  100 of 101 of those files are graph-shaped, so that gate exercises `build_project_from_graph`, the
  path F-C3-2 shows discards session tempo and master volume, and *not* the path the editor uses.
  The gate would pass on output that is silently retimed. It would also be exercising a code path
  that, on the 8 multi-instrument graph-shaped files, produces different output on every run
  (F-C3-3) — harmless for an exit-code gate, fatal for any snapshot gate built on top of it later.
  The 8: `snes-kit/demoforyoutube.json`, `snes-kit/empty.json`,
  `snes-kit/songs/{chase-loop,groove-bed,space-funk}.skald.json`,
  `songs/full/{four-bar-song,possible-background-music}.skald.json`, and the
  `songs/loops/to implement/…boss battle….json` file F-B06-4 flagged.
- **detail**: The corpus gate is the single highest-value missing test in the repo — F-B11-1 is right
  about that, and both of Tier 1's editor-only high-severity findings live in exactly that gap. It
  just has to run the *editor's* serializer, not the CLI's fallback parser, or it certifies the wrong
  thing.
- **recommendation**: Build the gate as a **Node-side harness**, not a batch loop:
  1. A Vitest (or plain node) test that, for each `examples/**/*.json`: runs the real
     `parseSaveFile` → the real migration chain (F-C3-6) → the real `buildProjectData` → writes the
     project JSON → spawns the codegen → runs `odin check <dir> -no-entry-point` on the output
     (F-B11-10's step, which is the valuable half). This exercises `useFileIO`, `projectSerializer`
     and `build_project_from_raw` — the three things a user actually goes through — end to end, for
     free, on every push.
  2. Assert on the emitted header, not just exit code: at minimum that `p.bpm` matches the file's
     `session.bpm` and the tanh coefficient matches `session.masterVolume`. Those two assertions
     alone would have caught F-C3-2 the day it was introduced.
  3. Keep a *separate*, smaller CLI-path gate over the handful of genuinely bare-graph fixtures, so
     the fallback parser stays covered without being mistaken for the main path.
  4. Fold in the determinism double-run from F-C3-3.
  **M.** Requires Odin in the UI CI job (already installed in the backend job; either merge the jobs
  or add the install step).
- **manual impact**: none.
- **migration**: none. Expect the gate to go red on first run against `archive/PulsarBeam.json`
  (F-B06-5) and possibly `four-bar-song.skald.json` (no `session` block, F-B06-6) — both are the
  gate working correctly.

### F-C3-12: The codegen CLI has no validate-only mode, no output-safety guard and no provenance stamp; the editor's protections do not travel with the binary
- **kind**: risk
- **area**: codegen CLI (main.odin)
- **severity**: medium
- **confidence**: high
- **effort**: S
- **when**: 0.2-desirable
- **supersedes**: consolidates F-B04-7 and F-B05-7
- **evidence**: `main.odin` is 118 lines: parse five flags, sniff the format, generate, blind
  `os.write_entire_file` (`:96`). It has no `-check` mode, no `-version`, no dry run, no
  one-package-per-directory guard, and no refusal to overwrite. The one-package guard exists only in
  `skald-ui/src/main/codegenGuards.ts` (`assertCodegenTargetSafe`, called from `main.ts:88-90`),
  whose own comment records that the hazard "really happened." The generated header
  (`codegen.odin:2283-2341`) records package name and asset lists but no generator version, no input
  hash, and no "AUTO-GENERATED — will be overwritten" banner. Note that this same binary is what the
  editor spawns for the preview on every debounced rebuild, so `-check` is nearly free to add and
  immediately useful (F-C3-5 step 3 depends on it).
- **detail**: The CLI is documented by its own flag surface as a general-purpose tool, is invoked by
  `build_codegen.bat`, `run_golden.bat`, `run_acceptance.bat` and the Electron main process, and is
  the natural integration point for any studio's asset pipeline. Everything protecting a caller from
  a mistake lives in exactly one of those callers.
- **recommendation**: Port `assertCodegenTargetSafe`'s two checks into `main.odin`; add `-check`
  (validate, print diagnostics, emit nothing — the preflight pass from F-C3-5 step 2); add `-version`
  printing a build stamp; emit that stamp plus a hash of the input JSON into the generated header
  along with an explicit auto-generated warning banner. All five are small and independent. **S.**
- **manual impact**: none today; the (missing) integration chapter F-B05-8 recommends should
  document the header stamp.
- **migration**: The header changes, so every golden file needs one `run_golden.bat update` — do this
  in an isolated commit, and make the stamp overridable by an env var so the goldens do not churn on
  every build (or exclude the stamp line from the golden diff).

---

## Rewrite vs patch, and a suggested 0.2 sequence

**Rewrite (contained, behaviour-preserving):** project ingestion (F-C3-2 step 2, M) and
`generate_processor_code`'s split into analysis + emission (F-C3-8 steps 1–2, M+M). Both are
provable output-preserving by the existing golden suite, which is exactly why they are safe to do
now and progressively less safe the longer the file grows.

**Rewrite (genuine, defer past 0.2):** the expression IR (F-C3-8 step 4, L). Do it when a modulation
model change (F-B10-1's per-edge amount) actually lands, not before.

**Do not rewrite:** the per-node generators, the bus/voice domain split, the golden+acceptance
harness, the wasm-preview architecture. These are the good parts. The wasm preview in particular is
the right design badly betrayed by three shortcuts (F-C3-7) — repair the shortcuts, keep the design.

**Suggested order** (each step unblocks the next; roughly two to three focused weeks):

1. **F-C3-1** binary provenance (S) — until this lands, nothing you measure is what users run.
2. **F-C3-3** step 1+2: sorted iteration, plus the double-run determinism gate (S). Cheapest
   permanent win in the audit.
3. **F-C3-2** step 1: read `session` on the graph path (S). Stops silent wrong audio on 100 files.
4. **F-C3-6** version field + migration registry (M). Precondition for everything after.
5. **F-C3-4** steps 1–3: the node schema and generated bindings (M). Retires the largest bug class.
6. **F-C3-7** master-volume live param + single master mix (M). Restores the core promise.
7. **F-C3-11** the corrected corpus gate (M). Locks 1–6 in.
8. **F-C3-5** step 2: the preflight validator, and step 1's port handles (M).
9. **F-C3-8** steps 1–3, **F-C3-9** the registry, **F-C3-10** stable asset identity, **F-C3-12** CLI
   hardening — 0.2 if there is room, immediately after if not.

Everything in Tier 2's design list — per-edge modulation amount, the BPM-sync collapse, compressor/EQ/
chorus, real stereo, ADSR/VCA reconciliation — should wait for steps 1–7. Each of them adds a
parameter, a port or a node type, and on today's substrate that means five to twenty hand edits with
nothing checking them. Land the substrate first and each becomes a one-file change.
