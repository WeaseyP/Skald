# C5 — Scope and sequencing for 0.2

## Verdict

0.2 must be a release about honesty, not capability, and it should be named that way internally so
that every scope argument resolves the same way. The audit did not find a tool that lacks features;
it found a tool whose controls, generated API, examples, preview and manual all make claims the code
does not honour — a master volume of zero that exports as full volume, exposed setters that return
success and do nothing, a preview that applies gain on the other side of the limiter from the export,
a reference integration file that is behind the generator that made it, and 828 manual citations
(37.5% of 2207, verified by count) pointing into one 2690-line file that every 0.2 packet will edit.
Adding a compressor to that is malpractice. The proposed ordering — determinism, versioning, examples
in CI, then schema changes — is directionally right but over-serialised: the examples CI gate does not
depend on determinism and should land in week one, while determinism blocks something the proposal
does not name, which is any codegen refactor whose safety net is a before/after diff. The single most
useful scoping insight in this document is that the mode-boolean/dead-parameter cluster, which four
Tier 1 agents found independently and which Tier 2 packaged as one large redesign, actually splits
into an `M`-sized honesty fix that closes every reported symptom and an `L`/`XL` redesign that closes
none of them — and only the first belongs in 0.2. On process: 111 of 119 architecture findings are
still live not because they are hard but because they were written as prose in reports while
everything that got fixed was written as a packet with a pass/fail check; the fix is to convert the
recurring ones into red builds, and the one structural change that pays for itself immediately is
splitting `codegen.odin`, because that file is simultaneously the citation-drift root cause and the
reason the last remediation plan had to be sequential. Nothing here is fit to ship as 0.2 today; with
the Wave A + Wave B list below executed, it is.

---

## Corrections to prior tiers

**F-B02-6 is two changes wearing one finding ID, and the packaging inflates 0.2's scope.**
Its item (1) — the UI keeping a synced node's stored free-run value live — plus F-B02-1's minimal fix
(drop the free-run parameter from `effective_exposed_params` when `bpmSync` resolves true) is a
correctness fix. Its items (2)–(5) — making `bpmSync` a runtime-checked `f32` field, emitting both
expressions behind a runtime branch, and having `set_frequency` disengage sync — are a **new
capability** (runtime sync toggling from game code). No finding anywhere in Tier 1 or Tier 2 reports a
user or integrator wanting that capability; every reported symptom (F-A03-1, F-A03-2, F-A03-3,
F-A07-4, F-B02-2, F-B02-3, EDITORIAL B7) is "the API advertises something inert", which the minimal
fix closes completely. Verified: `codegen.odin:1216-1283`'s exposure pass is keyed purely on parameter
name and node type and never reads `node.parameters["bpmSync"]`, so a predicate inserted there closes
all of them at once. Downgrading (2)–(5) to `later` removes an `L` item from 0.2. See F-C5-3.

**F-A01-6 (`fixedPitch` → `keyTrack` + `tune`) is offered as the fix for the dead `frequency` knob;
it is an expensive way to fix that and should be judged on its own musical merit instead.**
The dead-knob symptom (an exposed `frequency` on a note-tracking oscillator generates a setter the DSP
never reads — `codegen.odin:136-137`, `:483`) is closed by exactly the same exposure predicate that
closes the `bpmSync` family, at no schema cost and no public-API semantic break. F-A01-6's own
migration section concedes it changes the meaning of the already-shipped `<Foo>_set_frequency`
contract and "needs a major version bump". Do not carry an API-breaking redesign on the back of a bug
that a 40-line predicate fixes. Not overturned — deferred, with the justification removed.

**The proposed dependency chain conflates two different examples-in-CI gates.**
A smoke gate (run `codegen.exe` over every file, then `odin check -no-entry-point` the output, fail on
non-zero) does **not** depend on codegen determinism — it only reads exit codes. A golden-snapshot
gate over the examples corpus does. Serialising the cheap gate behind the determinism fix delays the
single highest-value CI addition by however long the determinism fix takes. Land the smoke gate in
week one, in parallel. See F-C5-1.

**F-B10-4's "compressor/limiter with sidechain" is mis-scoped as a node addition.**
Sidechain ducking, as the finding itself frames it (music under dialogue), requires the key signal to
come from a *different asset*. Skald compiles each instrument as an independent `Processor` summed by
`project_process` (`codegen.odin:2455-2478`); there is no cross-instrument routing anywhere in the
graph model, and `types.odin`'s `Connection` cannot express one. An in-graph compressor (dynamics
within one instrument) is a node; ducking is a cross-asset routing feature and is a strictly larger
piece of work than "add a node". See F-C5-7.

**Corpus size is stated three different ways and all three are stale.**
F-B11-1 says 75 files, F-B06-4 says 94, `examples/AUDIT.md` says 62. Actual count today:
`find examples -name "*.json" | wc -l` = **101**. Immaterial to any conclusion, but the CI gate
must glob, never hardcode a count, and `AUDIT.md`'s value as a status document is now zero.

**F-A08-3 (a centred Panner is quieter than no Panner) reads as a correctness bug; it is a pan-law
decision that has never been made.** Both behaviours are defensible (`output_left += v` for a mono
source is true dual-mono; the Panner's `0.7071/0.7071` is equal-power). The defect is that the two
coexist undeclared. Keeping it in 0.2 because the fix is one line, but it should be filed as a
decision to record, not a bug to squash — otherwise the fix gets applied in whichever direction the
implementing agent happens to prefer.

**No finding is overturned as factually wrong.** Everything I re-checked held: `build_project_from_graph`'s
unsorted `for _, node in graph.nodes` at `json.odin:329-361` (against `graph_utils.odin:9-14`'s own
warning), the absent schema version in `useFileIO.ts:71-77`, `master_vol <= 0.0 do master_vol = 1.0`
at `codegen.odin:2455-2456` and `:2664-2665` with no floor at `projectSerializer.ts:110`, the
`app.tsx:379` vs `useNodeComposition.ts:215` Create Group mismatch, the worklet's `> 64` against
`codegen.odin:2530`'s `[128]u8`, `.github/workflows/ci.yml` never touching `examples/`, and
`forge.config.ts:20` shipping `examples/archive/` (which still contains the codegen-failing
`PulsarBeam.json`) into every packaged build.

---

## Findings

### F-C5-1: The dependency chain, corrected — three hard prerequisites, not four sequential steps
- **kind**: architecture
- **area**: release planning / build order
- **severity**: high
- **confidence**: high
- **effort**: S (to decide; the work it orders is costed separately)
- **when**: 0.2-blocker
- **supersedes**: refines the ordering premise in the brief; refines F-B11-1, F-B06-12, F-B04-1
- **evidence**: `skald-backend/core/json.odin:329-361` (unsorted map iteration assigning
  `project.instruments[idx]`) versus `skald-backend/core/graph_utils.odin:9-23` (`nodes_sorted_by_id`,
  whose comment states the exact hazard and which every other emission pass uses);
  `.github/workflows/ci.yml` (backend job runs `run_acceptance.bat` + `run_golden.bat check` only —
  30 fixtures, 31 goldens, zero example files); `skald-ui/src/hooks/nodeEditor/useFileIO.ts:71-77`
  (`saveData` has no version key); `examples/` = 101 JSON files.
- **detail**: The proposed order (determinism → versioning → examples in CI → schema changes) reads as
  a chain but is actually a shallow DAG with three independent roots, and treating it as a chain costs
  weeks. Determinism is not a prerequisite for the examples smoke gate; it is a prerequisite for
  *golden-snapshotting* the examples corpus and, more importantly, for **any large codegen refactor
  whose safety argument is "regenerate everything and read the diff"** — which is the safety argument
  for every Wave B and Wave C packet. Schema versioning is not a prerequisite for anything in Wave B;
  it is a hard prerequisite for every schema-touching change and for the load-time normalisations
  several findings assume exist. The examples smoke gate is a prerequisite for schema migration
  (you cannot claim a migration is a no-op across 101 files without running it across 101 files) but
  depends on nothing.
- **recommendation**: Adopt this DAG. Anything in a later layer must not be started before its layer
  completes.

  **Layer 0 — three independent roots, all startable on day one.**
  - `L0-a` **Determinism**: replace both `for _, node in graph.nodes` loops in
    `build_project_from_graph` with `nodes_sorted_by_id`. `S`. *Nothing that regenerates and diffs
    generated code may start before this lands.*
  - `L0-b` **Examples smoke gate**: `run_examples.bat` + CI step — codegen every
    `examples/**/*.json`, then `odin check -no-entry-point` each output, fail on non-zero. Glob, do
    not enumerate. `S`. *No schema migration may start before this lands.*
  - `L0-c` **Regenerate the six checked-in `generated_audio.odin` copies and gate them** the same
    way `tests/golden/` is gated. `S`. *No claim about "what a customer sees" is verifiable before
    this lands.*

  **Layer 1 — needs Layer 0.**
  - `L1-a` **Examples golden corpus** (needs `L0-a` + `L0-b`): snapshot the emitted Odin for all 101
    files. `M`. This, not the 30-fixture suite, is the diff that makes Wave B/C safe.
  - `L1-b` **Schema version + ordered migration registry** (needs `L0-b`): `version` on `saveData`,
    absent ⇒ 0, ordered `MIGRATIONS` array run to current in `parseSaveFile`, `handleSave` always
    stamps current. `M`. *No schema-touching change may start before this lands.*
  - `L1-c` **Range-parity test** and **`param_ranges` unit tests** (independent, but must precede any
    range edit). `M`.
  - `L1-d` **Split `codegen.odin`** (needs `L0-a` + `L1-a`, because it is the first big diff the
    golden corpus has to prove is output-preserving). `L`. See F-C5-10.

  **Layer 2 — needs Layer 1.** Every behaviour-changing packet. Exposure honesty and the master-volume
  work need only `L0`+`L1-a`; anything writing a new field or changing a field's meaning needs `L1-b`.

  **Layer 3 — needs code freeze.** Manual regeneration and chapter rewrites (F-C5-8).

  **Named prohibitions** — do not attempt before the stated prerequisite:
  - Do not touch multiplicative VCA gain, Wavetable amplitude backfill, explicit asset-type, or any
    `keyTrack`-shaped change before `L1-b`. Each needs a version gate to avoid silently re-rendering
    shipped patches.
  - Do not split `codegen.odin` before `L0-a` + `L1-a`. Without a deterministic golden corpus the
    split is unverifiable and you will not know whether the reshuffle changed output.
  - Do not rewrite manual chapters before code freeze, and do not re-pin `codegen.odin` citations
    before `L1-d` — that would re-pin 828 citations twice.
  - Do not wire `renderBpmSyncToggle` (F-A03-4's dead affordance) before the exposure-honesty packet.
    F-B02-3 is right: wiring it first converts a latent bug into a reachable one.
- **manual impact**: none directly.
- **migration**: none.

---

### F-C5-2: What 0.2 must contain — the blocker list, ranked
- **kind**: architecture
- **area**: release scope
- **severity**: critical
- **confidence**: high
- **effort**: L (aggregate)
- **when**: 0.2-blocker
- **supersedes**: consolidates F-A05-1, F-B04-1, F-B05-1, F-B06-2, F-B06-5, F-B07-1/2/3/4, F-B01-2/3/5,
  F-A09-6, F-B04-2, F-B03-1, F-A07-3, F-B08-1, F-B02-1, CODEX W2/B1
- **evidence**: cited per item below; all re-verified in this pass except where noted.
- **detail**: "Blocker" here means the brief's `critical` bar — silent wrong audio, data loss, a crash
  on a normal workflow, or something that ships broken into a customer's game. Ranked by the cost of
  shipping without it, not by effort.

  | # | Item | Why it blocks | Effort | Findings |
  |---|---|---|---|---|
  | 1 | **Master volume 0 exports as full volume** | Silent wrong audio into a shipped game. `projectSerializer.ts:110` sends the raw slider value; `codegen.odin:2455-2456` treats `<= 0` as "field absent" and substitutes `1.0`. The instrument-volume path already has the floor (`projectSerializer.ts:197-199`) — this one was never given it. | S | F-A05-1 |
  | 2 | **Exposed setters that lie** | The generated API is the product. Setters, `PARAMS` rows and P-lock targets are emitted for parameters the DSP provably never reads (LFO `frequency`/S&H `rate`/Delay `delayTime` under `bpmSync`; oscillator/wavetable `frequency` without `fixedPitch`; `bpmSync` itself as an unbounded `±1e6` float). Root cause is one pass: `codegen.odin:1216-1283` keys on name+type only. | M | F-B02-1, F-A03-1/2/3, F-A07-4, EDITORIAL B7 |
  | 3 | **Codegen non-determinism on the bare-graph path** | Proven live: three runs of the shipped `four-bar-song.skald.json` produced three different asset orderings. `skald_trigger(asset: i32)` dispatches on that index — a game can be wired to the wrong asset by a rebuild. | S | F-B04-1 |
  | 4 | **Undo is not a safety net** | Dragging from the palette and importing a patch push no history entry at all; a position drag restores the second-to-last drag tick; one Ctrl+Z pops two independent stacks; deleting an Instrument silently destroys its whole sequencer pattern with no confirm and unreliable recovery. This is data loss on the most ordinary workflows in the app. | M | F-B07-1/2/3, F-B01-2/3, F-B09b-5 |
  | 5 | **Load destroys unsaved work** | No dirty flag, no confirmation, and undo history is deliberately cleared in the same action. One misclick, unrecoverable. There is no `confirm(` anywhere in `skald-ui/src`. | S | F-B06-2, F-B07-4 |
  | 6 | **Loose-graph examples fail on Play** | 14–26 shipped example files show a red *Preview failed* banner the moment a new user presses Play. Scoped as CODEX W2/B1, never executed. Recommended fix is auto-wrap on load/Play — one change, not 14 file edits. | M | CODEX W2/B1, F-B09a Q2 |
  | 7 | **Nested Instruments hard-crash Generate Code** | Fully constructible in the UI, saves, reloads, then `os.exit(1)` with a generic "unknown node type". Cheap fix is a dedicated pre-flight rejection — *not* implementing nesting, which F-B04-2 showed the frontend serializer cannot even feed. | S | F-A09-6, F-B04-2 |
  | 8 | **Renaming a P-locked node → unrecoverable crash** | `collect_plock_targets` exits 1 on an unresolvable key; the Step Properties editor filters stale keys out of its own display, so there is nothing in the UI to click to fix it. Breaks the live preview too, not just export. | M | F-B01-5 |
  | 9 | **`_init` does not reset what its own comment promises** | Skips Delay's ring buffer entirely and never touches the voice array. Invisible in the editor (fresh wasm instance every time), live for every game that reuses a processor. | S | F-B03-1, F-A07-3 |
  | 10 | **Preview ≠ export for master volume** | `vol·tanh(x)` in the editor vs `tanh(vol·x)` in the game. "The preview is the export" is the product's central claim and it is false for the one control every session touches. | M | F-B08-1 |
  | 11 | **The reference integration file is stale** | All six checked-in `generated_audio.odin` copies predate the voice-steal anti-click fix. The file a game team copies from reintroduces a bug that was fixed. | S | F-B05-1 |
  | 12 | **A codegen-failing example ships in every build** | `forge.config.ts:20` copies `examples/` wholesale; `examples/archive/PulsarBeam.json` is still there and still fails codegen; the Load dialog opens one folder away. | S | F-B06-5 |

- **recommendation**: These twelve are the release gate. If one of them is not fixed, 0.2 does not
  ship — with one permitted downgrade: item 6 may ship as a clear, actionable error message
  ("This patch has no Instrument wrapper — click here to wrap it") instead of an auto-wrap, if the
  auto-wrap turns out to interact badly with the migration registry. Everything else is unconditional.
- **manual impact**: items 1, 2, 6, 9, 10 each invalidate named chapter sections; the full list is in
  the individual findings' `manual impact` blocks and must be appended to `FIXED.md` per packet
  (see F-C5-8).
- **migration**: item 2 removes setters from the generated API for anyone who exposed an inert
  parameter — a deliberate, changelogged public-API break. Items 1, 3, 9, 11, 12 change generated
  output but not saved-patch shape. Item 6 may add an Instrument wrapper to loose graphs on load,
  which is a save-shape change and therefore should be gated behind `L1-b`.

---

### F-C5-3: The dead-parameter cluster splits into an M-sized honesty fix and an L/XL redesign — 0.2 takes only the first
- **kind**: design
- **area**: exposure system / codegen
- **severity**: high
- **confidence**: high
- **effort**: M (the part that ships)
- **when**: 0.2-blocker (honesty) / later (redesign)
- **supersedes**: rescopes F-B02-6 items 2–5; rescopes F-A01-6, F-A03-7, F-A03-8, F-A07-5, F-B10-2
- **evidence**: `codegen.odin:1216-1283` (exposure resolution, keyed on parameter name + node type,
  never reads `bpmSync` or `fixedPitch`); `codegen.odin:35-58` (`bpm_sync_seconds_expr` selects a
  string from raw JSON at generation time); `codegen.odin:136-137`, `:483` (oscillator/wavetable
  branch on `fixedPitch` at generation time); `codegen.odin:971-999` (`effective_exposed_params` unions
  UI exposure with P-lock targets, so the same dead path is reachable from the sequencer);
  `param_ranges.odin:46-119` (no `bpmSync` case ⇒ the `{-1e6, 1e6, 0.0, ""}` fallback).
- **detail**: Four Tier 1 agents found this shape independently on five nodes, and Tier 2 correctly
  identified one root cause. But the two proposed remedies — F-B10-2's "continuous parameter" for
  Fixed Pitch and F-B02-6's "runtime-branched `bpmSync`" — are both **capability changes**, and neither
  is required to close a single reported symptom. Every symptom in the corpus is the same sentence:
  *the exported API advertises a control that the generated DSP cannot read.* That is closed by adding
  one predicate to the pass that already exists:

  ```
  param_is_live(node, param_name) -> bool
      // false for: free-run rate/frequency/delayTime when bpmSync is true
      // false for: frequency when fixedPitch is false
      // false for: any parameter whose stored JSON value is not Float/Integer
  ```

  Applied in three places: skip it in `effective_exposed_params` (so no field, no setter, no `PARAMS`
  row); hard-error in `collect_plock_targets` if a P-lock resolves to an inert parameter (matching the
  existing "no matching node" error idiom); and grey out — not hide — the exposure affordance in the
  editor so the state cannot be re-created. That closes F-A03-1, F-A03-2, F-A03-3, F-A07-4, F-B02-1,
  F-B02-2, F-B02-3, EDITORIAL B7's eight sub-instances, and the oscillator half of F-A01-6's
  complaint — in one packet, with no schema change, no migration, and no new capability to design.

  The redesigns then stand or fall on their own merits, which are real but not urgent: continuous
  key-track is a *musical* feature (an oscillator that tracks the keyboard at 50% is genuinely useful);
  runtime sync toggling is an *integration* feature (a game changing an LFO from synced to free).
  Neither is requested by any finding. Both cost a public-API contract change. Both are 0.3.
- **recommendation**: Ship the predicate. Defer `keyTrack`/`tune` and runtime-branched `bpmSync` to
  0.3, and re-evaluate them as feature proposals rather than as bug fixes. Write F-B10-2's one-sentence
  design rule ("a mode selector may change how a value is computed, but must never leave a second value
  that can independently disagree with what drives the sound") into a design-conventions appendix now,
  so a sixth instance is not built while the redesigns wait.
- **manual impact**: `nodes/lfo.md` Code-vs-intent note 2, `nodes/sampleHold.md` note 3, `nodes/delay.md`
  note 5, `nodes/oscillator.md` note 1, `nodes/wavetable.md` note 4 — all become "resolved" rather than
  documented traps. `00-foundations.md` "What expose does" gains a sentence: exposure is refused for
  parameters the generator does not read.
- **migration**: No saved-patch change. Generated-API break for anyone who exposed an inert parameter
  (their `<Foo>_set_frequency` disappears). Since that setter was a guaranteed no-op, nothing can
  legitimately have depended on it; one changelog line.

---

### F-C5-4: High-value 0.2 — the items that change what the product is
- **kind**: architecture
- **area**: release scope
- **severity**: high
- **confidence**: high
- **effort**: L (aggregate)
- **when**: 0.2-desirable (all of it; none of it is a gate)
- **supersedes**: consolidates F-A05-8, F-B05-2, F-B05-3, F-B05-8, F-B11-1, F-B11-6, F-B11-2, F-B06-12,
  F-B07-8, F-B08-4, F-B03-3
- **evidence**: per item.
- **detail**: Ranked by product impact per unit of effort.

  | Item | Effort | Why it transforms something | Findings |
  |---|---|---|---|
  | **Runtime volume: master + per-instrument setters, and a standalone soft-limit proc** | M | Today there is *no path* from "the sound designer set the mix in the editor" to "the game hears that mix" — master volume is baked as a literal, has no setter, and lives only inside `project_process`, which Skald's own README tells integrators not to use. This is the core of the tool's stated purpose and it is missing. Fixes blocker #10 as a side effect. | F-A05-8, F-B05-2, F-B08-1 |
  | **Examples corpus in CI** (`L0-b`) | S | Turns a hand-run, thrice-stale audit document into a permanent gate over 101 files. Two of the highest-severity Tier 1 findings are structurally uncatchable by the 30 synthetic fixtures and free to catch here. | F-B11-1, F-B11-10 |
  | **Schema version + migration registry** (`L1-b`) | M | Unblocks every future schema change permanently. Right now every one of them would have to invent the mechanism from scratch, simultaneously with itself. | F-B06-1, F-B06-12 |
  | **Range-parity test** | M | The single most-repeated bug class in the entire review history: six range mismatches, four of them already fixed once and re-found. Makes the class structurally impossible to reintroduce silently. | F-B11-6, F-A10-17 |
  | **Preview build at `-o:none`** | S | Measured: 1.4s → 0.25s per rebuild on a realistic patch, from one compiler flag. `-o:speed` buys nothing for a module whose only deadline is one 2.9 ms render quantum. Add an `isBuilding` indicator alongside it — there is currently no signal at all that an edit registered. | F-B08-4 |
  | **A generated-API chapter + a stated thread-safety contract** | M | 23 chapters document the authoring surface; zero document the artifact the customer receives. Setters are unguarded field writes with no documented threading rule, and the header comment omits the entire exposed-parameter mechanism. | F-B05-8, F-B05-3, F-B05-6 |
  | **Fixtures for the six uncovered node types** | M | Noise, LFO, S&H, Mapper, MIDI Input, Distortion have zero coverage, and every one of them is where Tier 1 found a live bug. Not a coincidence — the coverage gap made visible. | F-B11-2 |
  | **Voice steal prefers a releasing voice** | S | The current pure-oldest policy steals the harmonic anchor of a sustained chord in favour of a note already fading out — backwards from what every polysynth does. Two-tier search around the existing loop; no API or state change. | F-B03-3 |
  | **Sidebar controls generated from the node-body `ParamField[]` spec** | L | Retires an entire class: five confirmed node-body/sidebar divergences across ten node types, including a working Reverb pre-delay invisible on the canvas and a Wavetable amplitude that can never be exposed. | F-B07-8, F-B10-6 |

- **recommendation**: Take all of them except the sidebar unification, which is `L` and competes
  directly with the Wave B blockers. If the release is time-boxed, cut the sidebar unification to 0.3
  and land F-B10-6's four-line Wavetable-amplitude fix on its own as a cheap win — that is the one
  divergence with a real user consequence.
- **manual impact**: the generated-API chapter is new writing; the rest invalidate scattered
  Code-vs-intent notes.
- **migration**: the migration registry is itself the migration infrastructure; runtime volume setters
  are purely additive to the generated API.

---

### F-C5-5: The cheap-win batch — one packet, ~19 items, disproportionate return
- **kind**: qol
- **area**: cross-cutting
- **severity**: medium
- **confidence**: high
- **effort**: M (all of them together)
- **when**: 0.2-desirable — schedule as the first packet of Wave A
- **supersedes**: batches F-B09a-3, F-B08-4, F-B08-5, F-B08-9, F-A02-6, F-A02-9, F-A07-3, F-A07-9,
  F-A01-10, F-B10-6, F-B06-3, F-B06-10, F-B06-11, F-B05-9, F-B04-5, F-B04-4, F-A05-3, F-A09-3, F-A09-7
- **evidence**: each item is a single-file, single-concept change verified in its source finding; the
  Create Group and worklet-buffer items I re-verified directly (`app.tsx:379` vs
  `useNodeComposition.ts:215`; `skaldWasm.worklet.ts:111`'s `> 64` vs `codegen.odin:2530`'s `[128]u8`).
- **detail**: The audit found an unusual number of items where the fix is smaller than the finding that
  describes it. Batching them into one packet, done first, is worth more than its content: it proves
  the execution loop end-to-end before anything risky starts, and it clears the specific items that
  have now survived multiple review rounds and become evidence of a process problem (F-C5-9).

  - Create Group enabled for one node and silently doing nothing — **one line**, scoped as a "no-risk
    warm-up" in the CODEX brief and still not done after two rounds. Fix it first; it is the canary.
  - Preview build `-o:none`; add an `isBuilding` indicator.
  - Worklet name-buffer `64` → `128`, and fix the test that pins the wrong number.
  - `Noise` → `amplitude` override in `param_ranges.odin` (the override mechanism exists for exactly
    this; Noise was the one node left out).
  - Delay ring buffer cleared on `_init` (change the `!= "Reverb"` guard to cover both).
  - Mod Index slider gets a log curve — the musical range is the bottom 1% of the current travel.
  - Instrument Glide UI 0–2 vs backend 0–5: pick one, apply to both.
  - Wavetable `amplitude` into `WavetableParams`, defaults, `exposedParameters`, and the panel.
  - `preDelay` into Reverb's default exposed set now that it works.
  - `packageName` into `SessionSettings` so it survives save/load.
  - Restore `flow.viewport` (or `fitView()`) on load — a load currently can land on blank canvas.
  - Atomic save (`write .tmp` → `rename`) so a failed overwrite cannot destroy the previous save.
  - `sanitize_identifier`: when the result has no alphanumerics, fall back to the id (the empty-name
    fallback already exists next to it).
  - Non-fatal codegen warning listing nodes with no path to a `GraphOutput` (dead weight in every
    exported build today, with no signal anywhere).
  - Non-fatal warnings for zero and for more-than-one `GraphOutput` in an instrument.
  - ADSR's input port label "Gate" → "In" — it is the audio multiplicand, and the wrong label is
    directly responsible for `sax3.json` zeroing its own release.
  - Suffix a duplicated Instrument's name on paste / "Export Step to Instrument".
  - Oscilloscope buffer sized from `fftSize`, not `frequencyBinCount`.
  - Delete the empty `examples/integration/` directory.
- **recommendation**: One packet, one commit series, first. Do not let it grow — anything that turns
  out to need a design decision leaves the batch and becomes its own item.
- **manual impact**: the Mod Index curve, Glide range, Wavetable amplitude and ADSR port label each
  touch a "The controls" table row; the rest are invisible to the manual.
- **migration**: Wavetable `amplitude` backfills to the codegen default `1.0` — audibly identical.
  `packageName` is additive. Nothing else touches saved patches.

---

### F-C5-6: What 0.2 explicitly does not contain
- **kind**: architecture
- **area**: release scope
- **severity**: high
- **confidence**: high
- **effort**: S (to record)
- **when**: 0.2-blocker (recording the decisions is part of shipping)
- **supersedes**: rescopes F-A08-4, F-A10-16, F-B10-1, F-B10-3, F-A01-6, F-A01-11, F-B02-6(2–5),
  F-A10-14, F-A08-5, F-A09-2(a), F-A05-7, F-A06-10, F-B04-6, F-B09b-8
- **evidence**: cited per exclusion.
- **detail**: These are decisions with reasons, not omissions. Each is written so that someone who
  proposes it mid-release can be answered from this list.

  | Excluded | Why | Revisit when |
  |---|---|---|
  | **Real per-node stereo** | Already costed as a multi-month core rewrite: a channel dimension on ~15 `generate_*_code` procs and their state structs, a redesign of `get_output_var`/`get_f32_param`/`sum_port_inputs`, a channel-aware `Connection` and port tables, and Delay/Reverb's shared bus buffers doubling per instrument-effect — losing the single-shared-instance property that makes their bus-domain design correct today. Nothing in the manual or the corpus demands it. | Never, unless a customer requirement forces it. Instead, in 0.2: state the mono-with-terminal-pan model explicitly in Foundations, fix the Panner gain step, and warn at build time when a Panner feeds anything but Output. |
  | **Per-edge modulation `amount`** | The codegen change is trivial and the migration is genuinely free (`1.0` default reproduces today's output exactly). The dominant cost is a **brand-new UI surface** — nothing in the editor can edit anything on a wire today. And it fixes no bug: it removes a node from patches. High value, zero urgency. | 0.3, as the flagship feature. It is the best single feature idea in the whole review. |
  | **`fixedPitch` → `keyTrack` + `tune`** | Public-API semantic break on `<Foo>_set_frequency`; needs schema migration; and the symptom that justifies it is closed for free by F-C5-3. | 0.3, judged as a musical feature. |
  | **Runtime-switchable `bpmSync`** | A capability nobody asked for, carried as though it were the fix for a correctness bug it is not required to fix. | 0.3, alongside runtime BPM (F-B02-5), which is the more valuable half of the same idea and much cheaper. |
  | **Implementing nested Instruments** | Not a missing dispatch case. The frontend serializer never recurses past one subgraph level, so a nested Instrument reaches the backend with `subgraph == nil` regardless of what the user built — the backend's recursive parser is dead code for the real product. And the semantics are unspecified (does a nested `voiceCount` multiply?). 0.2 rejects the graph loudly instead. | Only if a user actually asks. Rejection is the correct permanent answer for a game-audio tool. |
  | **Block-rate control path** | `XL`, and the evidence points elsewhere: F-B08-4 measured the actual live-edit latency problem and it was a compiler optimisation flag, not per-sample modulation. Solve measured problems. | When a CPU meter (F-B08-7) shows a real patch missing its deadline. |
  | **Merging Oscillator and Wavetable** | Low confidence in its own finding; needs a product decision, not an engineering one. The two nodes read as accidentally divergent, and the honest fix is to close the parity gaps (unison, PWM, phase, amplitude) so the difference becomes deliberate. | Not a 0.2 or 0.3 question. Close the gaps and see if anyone still wants the merge. |
  | **Mixer's dynamic / connection-keyed model** | Requires either per-edge parameters (excluded above) or a schema change, and touches 20 of 101 shipped patches, where the migration key (array position vs `id`) is exactly the thing already known to disagree. | After per-edge `amount` lands, when Mixer's remaining job ("a named, exposed audio bus") is clear. |
  | **Stripping ADSR's audio multiply (F-A09-2 option a)** | Would break 90 connections across the shipped corpus and require mechanically inserting a VCA at every one of them. Take option (b) — document ADSR-direct as the recommended path, which is what 90% of the corpus already does — plus the multiplicative-VCA fix. | Never. Option (b) is the right answer. |
  | **MPE, pitch bend, mod wheel, CC** | Additive and genuinely wanted, but 0.2 has no room and the architecture question (fixed port list vs a generic CC node) deserves its own design pass. | 0.3: non-MPE pitch bend + CC1 first; MPE much later, if ever. |
  | **Distortion oversampling** | Changes the audio of every existing patch using Distortion at moderate drive; needs an opt-in flag and a version gate. The makeup-gain half is additive and could ride along, but is not urgent. | 0.3, with the opt-in flag. |
  | **User-wireable feedback loops** | Real capability gap, additive, no migration cost — and entirely orthogonal to everything 0.2 is about. | 0.3/0.4. |
  | **State-manager refactor / `app.tsx` decomposition** | Recommended by two prior review passes and never done, and I am not going to recommend it a third time as a ticket. See F-C5-9: the undo unification in Wave B is the part of it that has a user-visible failure, and doing that first is how this gets started. | Continuously, as a consequence of Wave B, not as a project. |

- **recommendation**: Put this table verbatim into the 0.2 plan document. Exclusions that are not
  written down get re-litigated by every agent that reads a finding.
- **manual impact**: the stereo exclusion requires a positive statement in `00-foundations.md` — the
  "one number per node per sample" claim needs its Panner exception and the scoping decision spelled
  out, rather than being inferred chapter by chapter.
- **migration**: none.

---

### F-C5-7: The node set — none of the three in 0.2, and the compressor is not the node it looks like
- **kind**: design
- **area**: node palette
- **severity**: medium
- **confidence**: high
- **effort**: S (the decision) / L each (the nodes, later)
- **when**: later
- **supersedes**: rescopes F-B10-4; relates to F-A02-10, F-A07-7, F-A06-8
- **evidence**: `codegen.odin:2455-2478` (`project_process` sums independent per-instrument
  processors — there is no cross-instrument signal path); `types.odin`'s `Connection` carries
  `from_node`/`from_port`/`to_node`/`to_port` and nothing else; `Sidebar.tsx:264-280` (18 node types);
  F-B11-2 (six of them have zero test coverage); F-B07-8 (node body and sidebar are two hand-maintained
  surfaces per node).
- **detail**: The three named gaps are real, and I would not argue with any of them as 0.3 items. But
  adding nodes in 0.2 is the wrong move for three concrete reasons.

  First, **the marginal cost of a node is currently inflated by exactly the debt 0.2 exists to pay
  down**. Each node costs: DSP, a node component, a hand-written sidebar branch that must be kept in
  sync with the node component by memory, `param_ranges` entries that must be kept in sync with the UI
  by memory, TS types, defaults, a fixture, a golden, and a manual chapter. Two of those "by memory"
  couplings are confirmed to have failed five and six times respectively. Adding nodes before the
  range-parity test and the sidebar unification means adding new instances of known bug classes.

  Second, **the existing nodes are not finished**. Wavetable has no unison, no PWM, no phase, and an
  amplitude control disconnected from three of the four systems every other parameter goes through.
  FM Operator has no output level — alone among source nodes. Reverb has no damping and no size.
  Panner's stereo output has no handle in the editor. A palette where four existing nodes have missing
  controls does not need a fifth kind of node; it needs those four finished.

  Third, and specific to the compressor: **"compressor with sidechain" as specified is not a node**.
  The use case that justifies it — ducking music under dialogue — needs the key signal to come from a
  different asset, and Skald has no cross-instrument routing at any layer: not in `Connection`, not in
  the graph model, not in the generated code, where each instrument is a separate `Processor`. An
  in-graph compressor (dynamics within one instrument, key = its own input) is a normal node. Ducking
  is a cross-asset routing feature and belongs in the same conversation as multi-port instrument
  outputs (F-A05-9) and the project mix bus. Today the correct answer for ducking is the game engine's
  own mixer, and the manual should say so.
- **recommendation**: **No new nodes in 0.2.** For 0.3, in this order: **(1) Compressor/limiter,
  in-graph, no sidechain** — the most game-relevant dynamics tool that is actually a node, and it
  composes with the runtime volume setters landing in 0.2. **(2) EQ** — a shelving/peaking node,
  cheaper than it sounds because the SVF machinery already computes every response every sample
  (F-A06-8). **(3) Chorus** — last of the three, because unison+detune already covers most of its use
  and it is the only one of the three with a real in-tool substitute. Sidechain/ducking is not on this
  list; it is a routing feature to be scoped separately.
  In 0.2, spend the node budget on **finishing** instead: Wavetable amplitude (cheap win), FM Operator
  output level (`S`, additive, defaults to `1.0` so no patch changes), and Reverb `damping`
  (`S`, one multiply-add in the feedback path, defaults to `0` so no patch changes). Three additive,
  migration-free parameters that close three documented gaps, for less than the cost of one new node.
- **manual impact**: `nodes/fmOperator.md` "The controls" and Code-vs-intent note 4;
  `nodes/reverb.md` "Under the hood" and the "Add the damping the node lacks" workaround in
  "Going further"; `nodes/wavetable.md` "The controls". A new glossary entry stating that ducking is
  the host's job, not the graph's.
- **migration**: all three additive parameters default to today's hardcoded behaviour — bit-identical
  output for every existing patch.

---

### F-C5-8: The manual — regenerate late, delete the false pessimism now, and change the citation format before either
- **kind**: doc-bug
- **area**: docs/manual-source
- **severity**: high
- **confidence**: high
- **effort**: L (aggregate)
- **when**: mixed — see phases
- **supersedes**: sequences ~35 doc-bug findings across all ten Tier 1 files plus F-B11-9
- **evidence**: counted directly across `docs/manual-source/**/*.md`: **2207** `file:line` citations
  total, of which **828 (37.5%)** point into `codegen.odin` — a single 2690-line file. Every other cited
  file was verified accurate to within 1–2 lines by all ten Tier 1 agents independently; `codegen.odin`
  citations drifted 45–90 lines and in dozens of cases land on unrelated code. 23 markdown files in
  `docs/manual-source`. `FIXED.md`'s six packets are all genuinely landed in code, and its own
  stale-section lists are incomplete — P2 fixed Filter resonance and Distortion tone but never listed
  `nodes/filter.md` or `nodes/distortion.md`, so those chapters still describe the pre-fix state.
- **detail**: The manual's problem is not that it is wrong — its prose was found accurate almost
  everywhere. It has three separable problems with three different urgencies, and treating them as one
  "manual rewrite" is why the last two fix packets left chapters stale.

  **(a) False pessimism — fix immediately, week one, independent of everything.** Passages that warn
  users off features that now work: Reverb pre-delay ("does nothing (blocker)", plus a "Try it" step
  that instructs the reader to prove it is inert), Mixer channel-level exposure ("a blocker that pins
  the channel to unity"), the Piano Roll's bass floor, the Filter resonance ceiling of 30 (in
  `filter.md` twice and `00-foundations.md` step 10), Distortion's Tone range and missing `shape` field,
  and the VCA gain cap of 1.0. Roughly eight passages across six chapters. These cost users features
  they already have, and — critically — **the code behind every one of them is settled and will not
  change again in 0.2**, so fixing them now cannot be invalidated later. `S`. Do it in the first week.
  Also fix the one hard self-contradiction: `60-complexity-ladder.md` claims four example files are
  rejected by the port validator while `00-foundations.md` correctly documents the shim that makes them
  work.

  **(b) Citation drift — change the format, then build the checker, then re-pin once.** The drift is
  not a discipline failure, it is a format failure: 828 line-number citations into the one file that
  grows in its own middle. Three steps, in order:
  1. **Change the convention now** (`S`): for `codegen.odin` specifically, cite the *proc name*
     (`generate_mapper_code`, `bpm_sync_seconds_expr`) rather than a line number. The golden-file
     citations, which Tier 1 found pixel-perfect, are also a better anchor for line-stable examples.
  2. **Build the checker before the rewrite, not after** (`M`): F-B11-9's design is sound and I would
     implement it as specified — regex-extract every `` `path:NNN` ``, and where the chapter quotes a
     literal fragment, grep the whole file for that fragment and flag anything more than ±15 lines from
     the claim, reporting the real line. Run it advisory, not gating, initially.
  3. **Re-pin `codegen.odin` citations exactly once, after the file is split (F-C5-10) and after code
     freeze.** Re-pinning before the split means doing 828 citations twice.

  **(c) New chapters — write these during 0.2, because new writing cannot be invalidated by code
  churn.** There is no chapter for the generated Odin API (the artifact the customer actually receives
  — 23 chapters on the authoring surface, zero on the deliverable), no chapter for the sequencer
  (P-locks, pattern length, the Piano Roll/Step Grid split), no chapter for Group, and no "What Skald
  deliberately does not do" chapter, which the CODEX brief correctly asked for and which is now more
  necessary given F-C5-6's exclusion list. `L`.

  **(d) Chapter rewrites — last, after code freeze**, driven by the accumulated `FIXED.md` entries.
- **recommendation**: Phase it as (a) week one → (b1) week one → (b2) during Wave A → (c) throughout →
  (b3) + (d) after code freeze. **The automated check that keeps it honest is two things, not one**:
  the citation checker in CI, plus a process change — make "list every chapter section this packet
  invalidates" a *required field* in every packet's report, and cross-check it mechanically by flagging
  any chapter that cites a line inside a hunk the packet changed. The existing `FIXED.md` discipline
  is the right idea and it failed only because the lists were compiled by hand and were incomplete;
  the diff already knows which chapters are affected.
- **manual impact**: this finding is the manual impact.
- **migration**: none.

---

### F-C5-9: Process — 111 findings survived because they were prose; convert the recurring ones into red builds
- **kind**: architecture
- **area**: process
- **severity**: critical
- **confidence**: high
- **effort**: M (the four gates) + S (the policy changes)
- **when**: 0.2-blocker
- **supersedes**: answers F-B09a-4, F-B09b's aggregate finding
- **evidence**: 111 of 119 architecture/hygiene findings from the prior review still live in a tree
  that has since tripled in backend size; 30 of 30 discrete node/codegen bug items durably fixed with
  zero regressions; the CODEX five-wave plan is ~1.5/5 complete, with W0's one-line Create Group fix
  (`app.tsx:379` vs `useNodeComposition.ts:215`, re-verified today) still open while W1 and half of W3
  landed. `sax3.json` broken across two rounds. The BPM-sync dead-parameter bug found in three
  successive rounds, in three successive layers.
- **detail**: The pattern is not laziness and it is not difficulty. Every finding that got fixed shares
  three properties: it fits in one file or one node; it has an obvious pass/fail check (a fixture, a
  golden diff, a range number); and it was written as a packet with an ID and an owner. Every finding
  that did not get fixed lacks at least one — architecture findings span files, have no pass/fail
  check, and were written as prose recommendations inside reports. **Severity has demonstrably not
  predicted what gets fixed; checkability has.** A one-line cosmetic fix scheduled first as a "no-risk
  warm-up" lost to a multi-file range-unification packet, twice, because the range packet had a test
  that could go green.

  It follows directly that producing 199 more findings will change nothing. Four things will.

  **1. Convert the recurring findings into gates.** A memory-leak finding is a ticket nobody does; a CI
  step that fails is a thing that must be done. Four gates, all `S`/`M`, each of which retires a class
  that has now recurred across three review rounds:
  - Examples corpus codegen + `odin check` (retires the "shipped example is broken" class).
  - UI/backend range parity (retires the "two hand-maintained copies of one number" class — six
    instances, four of them fixed once and re-found).
  - Generated-example freshness — regenerate the six checked-in `generated_audio.odin` files and diff
    (retires the "the reference artifact is behind the generator" class).
  - Citation drift (retires the class that consumed a meaningful fraction of ten Tier 1 agents' time).

  **2. Make architecture the gate on starting feature work, not the thing that happens after it.** The
  CODEX brief already put the cheap architectural work first and it still did not happen, so ordering
  alone is insufficient. Wave A must *complete* — gates green — before any Wave B packet is assigned.

  **3. Track packet state, not finding severity.** Add `assigned / landed / verified` per packet, and
  review the *unassigned* list before the *unfixed* list. B09a reached the same conclusion from the
  other direction and is right.

  **4. Declare a moratorium on new audits.** This review added 199 findings on top of 119 still-live
  ones. The marginal value of finding #200 is approximately zero and the marginal value of closing #1
  is high. No new review passes until the Wave A + Wave B packet list is executed and verified.
- **recommendation**: All four, and treat the four gates as blocking release. Additionally: the one
  structural change with a direct execution-throughput payoff is splitting `codegen.odin` — see
  F-C5-10, which is the argument architecture work has always been missing.
- **manual impact**: none.
- **migration**: none.

---

### F-C5-10: Split `codegen.odin` in Wave A — it is the file that makes the plan sequential and the citations rot
- **kind**: architecture
- **area**: skald-backend/core/codegen.odin
- **severity**: high
- **confidence**: medium
- **effort**: L
- **when**: 0.2-desirable — but if it is done at all, it must be done in Wave A
- **supersedes**: gives an execution rationale to `pro_3`'s monolith finding (still live across two
  review passes)
- **evidence**: `wc -l skald-backend/core/codegen.odin` = **2690**. 828 of the manual's 2207 citations
  point into it. `docs/CODEX-REMEDIATION-BRIEF.md` §3 rule 3: *"Never run two agents against the same
  file. The conflict surfaces are `NodeParameterControls.tsx`, `ParameterPanel.tsx` and `codegen.odin`.
  Packets are grouped so each file has one owner per wave. Do not split a packet to parallelise it."*
  Every Wave B and Wave C packet in this document edits `codegen.odin`.
- **detail**: The monolith has been flagged as a maintainability problem twice and ignored twice,
  because "2690 lines is a lot" is not an argument anyone acts on. The argument that should have been
  made is different: **this file is the reason the last remediation plan had to be executed
  sequentially, and sequential execution is the reason it is 1.5/5 complete.** The brief's own rule 3
  makes `codegen.odin` a global lock. Splitting it — plausibly into node generators, the exposure/param
  resolution pass, voice/processor lifecycle, sequencer/P-lock emission, and project/WASM-shim emission
  — converts a serialised wave plan into a parallel one, which is a throughput change, not a tidiness
  change.

  It also fixes the citation problem at the root rather than the symptom. The drift is caused by new
  procs being inserted into the middle of one enormous file; five files, each cited by the chapters
  that actually concern them, drift far less and drift locally when they do.

  The risk is real and manageable: it is a large diff over the file every packet depends on. That is
  precisely why it must happen in Wave A, after `L0-a` (determinism) and `L1-a` (the examples golden
  corpus), which together give the exact proof needed — the emitted source must be byte-identical for
  all 101 example files plus all 31 goldens. A pure reshuffle with a byte-identical corpus diff is
  about as verifiable as a refactor gets.
- **recommendation**: Do it, in Wave A, gated on a byte-identical golden + examples-corpus diff. If it
  is judged too risky for 0.2, then say so explicitly and accept the consequence — Wave B and Wave C
  are sequential, one agent at a time, and the release is correspondingly longer. Do not leave it
  unstated, because the last plan left it unstated and paid the cost anyway.
- **manual impact**: invalidates all 828 `codegen.odin` citations at once — which is why the manual
  re-pin (F-C5-8 phase b3) must come after this, not before.
- **migration**: none — no behaviour change, no schema change, byte-identical output is the acceptance
  criterion.

---

### F-C5-11: Reconciling with the existing plan documents — what each one becomes
- **kind**: doc-bug
- **area**: docs/CODEX-REMEDIATION-BRIEF.md, docs/proposals/bpm-ux.md, BUGS.md, examples/AUDIT.md
- **severity**: medium
- **confidence**: high
- **effort**: S
- **when**: 0.2-blocker (a plan with four competing plan documents is not a plan)
- **supersedes**: F-B02-7, F-B06-4, F-B09a-1, F-B09a-2
- **evidence**: `docs/CODEX-REMEDIATION-BRIEF.md` (five waves; W1 and B4/B5 of W3 landed per
  `FIXED.md`; W0's Create Group, all of W2, W3's B6/B7, and all of W4/W5 verified still open);
  `docs/proposals/bpm-ux.md` §2 lists seven inconsistencies, all about *communicating* tempo, and §3.4
  defers six items — none of them the dead-parameter bug, which is the highest-severity tempo defect in
  the codebase; `BUGS.md` every item `[x]`, accurate as history, superseded as a frontier;
  `examples/AUDIT.md` dated 2026-07-24 against 62 files, tree now 101.
- **detail**: Four documents currently look like plans and none of them is the plan. The most dangerous
  is `bpm-ux.md`, precisely because it is *good* — everything it claims is implemented checks out, and
  a reader would reasonably conclude tempo work is done. It never mentions the dead-parameter bug at
  all, because it treats the `bpmSync` + `syncRate` mechanism as settled ground rather than as
  something to audit. Shipping it as "the BPM story for 0.2" would be false confidence.
- **recommendation**:
  - **`CODEX-REMEDIATION-BRIEF.md`**: do not extend it and do not restart it. Mark it superseded, and
    explicitly carry forward its unexecuted content into the new wave plan: W0's Create Group into the
    cheap-win batch, W2/B1 into blocker #6, W3/B7 into blocker #2, W2/B6 (`sax3.json`) into the
    same packet as the ADSR port relabel, W4's C2–C6 into F-C5-6's exclusions or Wave C, W5 batched.
    Its §4 golden-file discipline and §7 stop conditions are excellent and should be lifted verbatim
    into the new document.
  - **`bpm-ux.md`**: keep as-is, add one section pointing at the dead-parameter finding and F-C5-3's
    resolution, and re-title it so it reads as "BPM input hygiene", which is what it is and what it
    did well. Add runtime BPM (F-B02-5 — `param_ranges.odin` already has an unreachable `"bpm"` entry,
    and `p.bpm` is already a live runtime field) to 0.3, not 0.2.
  - **`BUGS.md`**: freeze as closed history. Do not extend it. Note in its header that one entry
    (`BUG-LINT-WARNINGS`) records a suppression as a fix — the four rules are still `"off"` in
    `.eslintrc.json` — so its checkboxes cannot be read as unqualified resolutions.
  - **`examples/AUDIT.md`**: delete it once the CI gate lands. A hand-run status document that goes
    stale is worse than no document; the gate is the document.
  - **`docs/investigations/audio-oddities.md`**: flip finding #4 to CONFIRMED-FIXED (one-line edit).
  - **`review-checkpoints/`**: mark Theme T8 superseded by architecture — the second DSP implementation
    those ~18 findings required no longer exists.
- **manual impact**: none (these are planning docs, not manual chapters).
- **migration**: none.

---

### F-C5-12: The release shape and its exit criteria
- **kind**: architecture
- **area**: release planning
- **severity**: high
- **confidence**: medium
- **effort**: XL (the release)
- **when**: 0.2-blocker
- **supersedes**: n/a
- **evidence**: aggregate of the above.
- **detail**: Four waves. One agent per packet, finish a wave before the next — except that after
  F-C5-10 lands, Wave B and Wave C packets can genuinely run in parallel, which is the point of doing
  it.

  **Wave A — gates and cheap wins.** `L0-a` determinism · `L0-b` examples CI gate · `L0-c` regenerate
  and gate the checked-in generated files · the cheap-win batch · range-parity test · `param_ranges`
  unit tests · citation checker (advisory) · manual false-pessimism sweep · citation-format change ·
  `L1-a` examples golden corpus · `L1-d` split `codegen.odin`. *Wave A must be fully green before any
  Wave B packet is assigned.* This is the rule the last plan lacked.

  **Wave B — the blockers.** F-C5-2's twelve items, plus generated-API note/velocity clamps. Nothing
  here needs the schema version except blocker #6's auto-wrap, which should be sequenced last in the
  wave.

  **Wave C — schema and behaviour.** `L1-b` schema version + migration registry, then: save-time
  normalisation of BPM-synced free-run values · explicit asset-type field on Instrument · multiplicative
  VCA gain (version-gated) · Wavetable parity (unison, PWM, phase) · FM Operator output level · Reverb
  damping · release-first voice stealing · runtime master/instrument volume setters and the soft-limit
  utility.

  **Wave D — docs.** New chapters (generated API, sequencer, "what Skald deliberately does not do") run
  throughout; the `codegen.odin` citation re-pin and the chapter rewrites happen after code freeze,
  driven by the accumulated `FIXED.md` entries.

  **Exit criteria — 0.2 ships when all of these are true:**
  1. All four CI gates green: acceptance, goldens, examples corpus (101 files codegen + `odin check`),
     range parity.
  2. All twelve blockers in F-C5-2 closed, each with a test that failed before the fix.
  3. Two consecutive full runs of the codegen over the entire examples corpus produce byte-identical
     output.
  4. Every packet has appended its invalidated chapter sections to `FIXED.md`, and the citation checker
     reports zero fragment-mismatches over `docs/manual-source`.
  5. No chapter passage warns a user off a feature that works.
  6. A game team can, from the manual alone, integrate a generated package: lifecycle, typed and
     string-keyed setters, threading contract, and what survives a regeneration.
  7. Every exclusion in F-C5-6 is recorded in the release notes with its reason.
- **recommendation**: Adopt. If the release must be cut short, cut Wave C before Wave B and cut the
  sidebar unification before anything else. Never cut Wave A — it is the part that makes the next
  release cheaper, and the last three planning rounds all cut exactly that.
- **manual impact**: as per F-C5-8.
- **migration**: as per the individual packets; the registry lands in Wave C before anything depends
  on it.
