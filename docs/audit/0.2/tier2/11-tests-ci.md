## Summary

- CI exists and is reasonably well-built (`.github/workflows/ci.yml`: 26-fixture Odin acceptance
  suite with FFT assertions, a golden-file text-diff check, and UI lint/typecheck/139-test run),
  but it has a structural blind spot that explains a large fraction of Tier 1's findings: **the
  75-file shipped `examples/` corpus is never run through CI at all.** The only place it's ever
  validated is `examples/AUDIT.md`, a hand-run, one-off, dated snapshot (2026-07-24) that is not
  a script, not a test, and not wired into any `npm`/`.bat`/`.ps1` entry point. Every "silently
  dead control only visible on a real patch" bug Tier 1 found (Wavetable unison, nested
  instruments, master-volume mute) lives exactly in that gap.
- Of ~18 node types, **six have zero Odin acceptance/golden coverage at all**: Noise, LFO (as a
  primary subject — it only appears as a bare modulator inside two other fixtures), Sample & Hold,
  Mapper, MIDI Input, and Distortion. Every one of those six is also where Tier 1 found a
  code-level bug this pass (missing `param_ranges.odin` override, dead BPM-sync setters, no golden
  file at all). This is not a coincidence — it is the coverage gap made visible.
- The specific "exposed setter silently does nothing" bug class (LFO frequency, S&H rate, Delay
  bpmSync) hit three siblings independently (F-A03-1, F-A03-2, F-A07-4) because there is no
  fixture and no *pattern* for testing it once, generically, across every BPM-synchronizable node.
- The "dead exposed parameter for one node type" bug the brief specifically asked about
  (Wavetable + Instrument Unison/Detune, F-A01-4) is a fixture-authoring near-miss, not a total
  blind spot: both `dual_osc.json` and `wavetable_morph.json` already carry `unison`/`detune`
  fields — set to `1`/`5`, i.e. exactly the degenerate value that makes the (missing) Wavetable
  loop indistinguishable from a working one. Nobody ever turned unison up in a fixture.
- The Odin backend has no unit-test layer at all (`grep`ing for `core:testing`/`@(test)` across
  `skald-backend` returns nothing) — every backend check is a full fixture → codegen → compile →
  run → FFT-assert cycle. That's a rigorous but heavy tool for testing pure functions like
  `lookup_param_range`, `exposed_param_default`, or `bpm_sync_seconds_expr`, and the expense is
  almost certainly *why* six node types never got a fixture.
- There is no round-trip test of the real save/load path (only synthetic mocks and one backend
  JSON-schema fixture), no parity test between the UI's hand-maintained parameter ranges and
  `param_ranges.odin`'s hand-maintained copies (the single most repeated "already-known, now
  re-broken" bug class across all ten Tier 1 chapters), and no automated check on the manual's
  `file:line` citations (Tier 1 found 55-90-line drift in `codegen.odin` citations in essentially
  every chapter). Concrete, cheap mechanisms for both are proposed below (F-B11-6, F-B11-9).

## Findings

### F-B11-1: The shipped 75-file example corpus is never exercised by CI — only by a hand-run, dated audit document
- **kind**: risk
- **area**: CI / examples corpus
- **severity**: high
- **confidence**: high
- **evidence**: `.github/workflows/ci.yml`'s backend job runs `run_acceptance.bat`
  (`skald-backend/tests/fixtures/*.json`, 26 hand-authored synthetic fixtures) and
  `run_golden.bat check` against the same 26 fixtures — neither touches `examples/`.
  `skald-ui/package.json`'s `scripts` block has no entry that codegens or even parses
  `examples/**/*.skald.json`; `grep -rl "examples/" skald-ui/src/tests` returns nothing.
  `examples/AUDIT.md` states its own method up front: "Audited 2026-07-24 against `skald-backend`
  built from this worktree" — a manual, one-time run of `codegen.exe` over all 62 (now 75) files,
  written up as a markdown table, not a script or a CI step. There is no `run_examples.bat` or
  equivalent anywhere in the repo.
- **detail**: Two of Tier 1's highest-severity findings are examples-corpus-only bugs that a
  synthetic 26-fixture suite structurally cannot catch: F-A01-4 (Wavetable's unison/detune is
  silently a no-op — only reachable by an Instrument that actually mixes a Wavetable with
  Unison > 1, which no fixture does) and F-A09-6 (nesting an Instrument inside another Instrument
  hard-crashes codegen with a generic "unknown node type" error — fully constructible in the UI,
  round-trips through save/load, and only fails at Generate-Code time). Both would be caught for
  free by simply running `codegen.exe` over every file in `examples/` on every CI run and failing
  on a non-zero exit code — the AUDIT.md pass already proved this catches real problems
  (`PulsarBeam.json`'s hard failure), it just isn't automated, isn't run on every push, and isn't
  re-run after every codegen change the way the 26 curated fixtures are.
- **suggested fix**: Add a CI step (and a `run_examples.bat`/npm script a contributor can run
  locally) that runs `codegen.exe -in:<file> -out:<scratch>.odin` over every file under
  `examples/**/*.skald.json` and fails the build on any non-zero exit, mirroring exactly the
  method `AUDIT.md` already used by hand. This is strictly cheaper than the existing acceptance
  suite (no FFT assertions needed, just "does it codegen and does the output compile") and turns
  a one-off audit into a permanent regression gate. Promote the `odin check <dir> -no-entry-point`
  compile step AUDIT.md also did by hand into the same automated pass.

### F-B11-2: Six of ~18 node types have zero acceptance/golden fixture coverage — and those six are exactly where Tier 1 found live bugs
- **kind**: risk
- **area**: skald-backend/tests, skald-backend/acceptance
- **severity**: high
- **confidence**: high
- **evidence**: grepping `"type":\s*"<NodeType>"` across all 29 files in
  `skald-backend/tests/fixtures/*.json` shows every fixture is built from only: Oscillator, ADSR,
  GraphOutput/GraphInput, Filter/Lowpass, Mixer, Panner, Delay, Reverb, FmOperator, Wavetable, and
  Gain (Gain appears exactly once, in `panner_mono.json`, as a pass-through with no test of its
  `input_gain` modulation port). **Noise, LFO, Sample & Hold, Mapper, MIDI Input, and Distortion
  never appear in a single fixture.** `F-A06-11` (Tier 1) already flags this explicitly for
  Distortion ("Filter has a golden test; Distortion has none"); this finding generalizes it to
  five more node types the same audit pass didn't have scope to check exhaustively.
- **detail**: Every one of those six untested node types has at least one live Tier-1-confirmed
  bug that a fixture would have caught mechanically: Noise's missing `param_ranges.odin` override
  (F-A02-6, a one-line fix the codebase's own override mechanism exists for); LFO's and Sample &
  Hold's dead exposed free-run parameter under BPM sync (F-A03-1, F-A03-2 — both `high` severity,
  both would be a 5-line acceptance-test addition: expose `frequency`/`rate`, set `bpmSync: true`,
  assert the runtime setter has no audible effect *or*, once fixed, that it does); Distortion has
  no test proving its four curve formulas produce audibly different output, or that `drive`/`tone`
  do anything at all. This is the single clearest, most actionable coverage gap in scope: it isn't
  spread thin across the whole suite, it's concentrated in six specific, nameable files.
- **suggested fix**: Add one acceptance fixture + golden file per currently-untested node type,
  each covering: the node in isolation with its default params, at least one exposed parameter
  proven live via a runtime `set_param` call, and (for LFO/S&H) one fixture with `bpmSync: true`
  and the free-run parameter exposed, specifically to prove or disprove F-A03-1/F-A03-2 stay fixed
  once addressed. This should be the top-priority test-suite work item for 0.2.

### F-B11-3: The "exposing the free-run parameter of a BPM-synced node is silently dead" bug pattern recurred three times and there is still no test for the pattern itself
- **kind**: risk
- **area**: LFO, Sample & Hold, Delay — BPM sync
- **severity**: high
- **confidence**: high
- **evidence**: F-A03-1 (LFO `frequency`), F-A03-2 (Sample & Hold `rate`), and F-A07-4 (Delay
  `bpmSync` itself, which is worse — a boolean masquerading as an unbounded float) are three
  independent instances of the same root mechanism: `codegen.odin` resolves the free-run value
  first, then unconditionally overwrites it with the BPM-derived expression, while the exposure/
  setter/PARAMS-emission pipeline runs unconditionally regardless of sync state. `types.ts`'s
  shared `BpmSynchronizable` mixin (used by LFO, Sample & Hold, and Delay per F-A03-8) confirms
  this is one shared shape, not three coincidences. None of the three has a fixture; none of the
  three node types appears in `tests/fixtures/*.json` with `bpmSync: true` *and* the free-run
  field in `exposedParameters` together.
- **detail**: Because the underlying mechanism (`bpm_sync_seconds_expr`, the shared exposure-
  resolution pass) is genuinely shared across all three nodes, one generic test — parametrized
  over node type — would cover all three sites and any future BPM-synchronizable node added later.
  Today, fixing one instance in isolation (as F-A03-1 could tempt a contributor to do) would leave
  the other two silently unfixed with no test noticing either way.
- **suggested fix**: Add a single parametrized acceptance fixture (or three near-identical ones)
  that: creates each of LFO / Sample & Hold / Delay with `bpmSync: true`, exposes the free-run
  field, and asserts via the generated `<Asset>_set_<param>` call that changing it either (a) has
  no effect — pinning today's known-broken behavior as an explicit, intentional "not yet fixed"
  regression test — or (b) does change the resolved rate, once F-A03-7/F-A03-8's fix lands. Either
  way, the test should exist *now*, red or green, so the fix (whichever direction it takes) is
  provably correct and can't silently regress on just one of the three nodes.

### F-B11-4: Existing fixtures already carry `unison`/`detune` fields, but at values that make the (missing) Wavetable unison loop indistinguishable from a working one
- **kind**: code-bug
- **area**: skald-backend/tests/fixtures — wavetable_morph, dual_osc
- **severity**: high
- **confidence**: high
- **evidence**: `tests/fixtures/dual_osc.json` and `tests/fixtures/wavetable_morph.json` both
  store `"unison": 1, "detune": 5`. `max(instrument.unison, 1)` is exactly the codepath that makes
  a unison loop degenerate into a single voice (`codegen.odin:1117`), so a unison value of `1`
  produces byte-identical output whether or not the underlying unison loop exists at all — this is
  precisely why F-A01-4 (Wavetable's total absence of a unison/detune loop, `codegen.odin:477-512`
  has no reference to `instrument.unison`/`.detune` anywhere) survived a golden-file suite that
  already had the relevant fields wired into a fixture. `acceptance/main.odin`'s `wavetable_morph`
  case (`:579-604`) only asserts pitch-tracking and spectral-centroid-raises-on-morph — nothing
  about voice count, detune spread, or the width/thickening a unison>1 patch should audibly add.
- **detail**: This is a fixture-authoring near-miss, not a total blind spot — extremely cheap to
  close because the scaffolding (the field, the fixture, the golden file) already exists and only
  needs its *value* changed plus a new assertion. It's also a strong instance of the brief's ask
  ("would a golden test have caught it?") answered precisely: no, because the value chosen exactly
  avoids exercising the bug.
- **suggested fix**: Add (or extend) a fixture with `unison: 4, detune: 25` on a Wavetable-sourced
  instrument, and assert something unison-specific — e.g. a spectral/RMS width check that would
  differ between "7 detuned voices summed" and "1 voice" (the existing `Change_Expect`/spectral-
  centroid assertion machinery in `acceptance/soundchange.odin` looks reusable for this). Apply the
  same non-degenerate-value discipline to every other fixture field that has a "loop count" or
  "voice count" meaning (`voiceCount`, `inputCount` on Mixer, etc.) — a repo-wide grep for `: 1,`
  next to these field names would find any other tests currently sitting at a degenerate value.

### F-B11-5: No test anywhere exercises `master_volume: 0` (or instrument `volume: 0`) — the exact value that F-A05-1 found broken
- **kind**: code-bug
- **area**: skald-backend/tests/fixtures, skald-ui/src/tests/codegen
- **severity**: high
- **confidence**: high
- **evidence**: every one of the 29 `tests/fixtures/*.json` files sets `master_volume` to `0.8` or
  `1.0` — grepping for `master_volume` across the fixtures directory turns up no `0` or near-zero
  value anywhere. On the UI side, `IntegerContracts.test.ts`'s "fractional fields retain precision"
  test explicitly asserts `master_volume: 0.77` survives serialization unchanged, but the suite has
  no equivalent test at `0` or `0.0`, which is the one value the backend treats specially
  (`codegen.odin:2455-2456`: `if master_vol <= 0.0 do master_vol = 1.0`, meant to detect an
  *absent* field, but indistinguishable from a deliberately-muted slider since the UI never floors
  `masterVolume` away from exactly `0` the way it already does for instrument volume,
  `projectSerializer.ts:197-199`).
- **detail**: This is as close to a textbook "one more test case would have caught it" example as
  the brief could ask for — it's a boundary value (`0`, the minimum of a `min="0"` slider) that
  every other range test in the suite already treats as an interesting case to check (see
  `IntegerContracts.test.ts`'s NaN/Infinity/clamp tests), just not for this one field.
- **suggested fix**: Add a UI unit test asserting `buildProjectData(..., masterVolume: 0, ...)`
  never serializes an exact `0.0` for `master_volume` (mirroring the existing instrument-volume
  floor test, if one exists — if not, add both), and a backend acceptance fixture with
  `master_volume: 0.0` that asserts near-silence in the rendered buffer (the inverse of every
  other fixture's `assert_audible`).

### F-B11-6: No parity test between the UI's hand-maintained parameter ranges and `param_ranges.odin`'s hand-maintained copies — the single most repeated bug class in all ten Tier 1 chapters
- **kind**: missing-feature
- **area**: skald-ui/src/tests, param_ranges.odin
- **severity**: high
- **confidence**: high
- **evidence**: `NodeParameterControls.test.tsx`'s "P2 range contracts" block already proves the
  *pattern* the fix needs: it hardcodes the expected UI-side clamp for `gain` (0-4), `tone`
  (100-20000), `delayTime` (0-2) and asserts committed out-of-range values clamp to it. But every
  one of those numbers is also independently hardcoded in `param_ranges.odin`
  (`{0.0, 4.0, 1.0, "x"}`, `{100.0, 20000.0, 4000.0, "Hz"}`, `{0.0, 2.0, 0.5, "s"}`) with **no test
  anywhere that reads both sources and asserts they agree**. Tier 1 found this exact class of
  divergence independently fixed-and-then-silently-reintroduced across *every single chapter
  audited* (F-A01-10 Glide 0-2 vs 0-5; F-A02-6 Noise amplitude default 0.5 vs 1.0; F-A06-3
  Resonance 30-vs-20 — already fixed once per `FIXED.md` P2; F-A06-4 Distortion Tone 10k-vs-20k —
  also already fixed once; F-A09-1 Gain 0-1-vs-0-4 — also already fixed once; F-A09-5 voiceCount
  64-vs-32 — also already fixed once).
- **detail**: F-A10-17 (Tier 1, design) already diagnoses the *architectural* root cause (a global
  name-keyed range table with no per-instance stored bounds) and proposes a schema fix. This
  finding is the cheaper, immediately-actionable complement: regardless of whether that redesign
  happens, a **test** that walks every `case` in `param_ranges.odin`'s `lookup_param_range` switch
  and every corresponding UI control's declared min/max/default (`node-definitions.ts` /
  `NodeParameterControls.tsx` / each `*Node.tsx`) and asserts they're equal would have caught every
  one of the six range-mismatch bugs above **the moment they were introduced**, not on a later
  manual audit pass — and would catch the *next* one before it ships, which `FIXED.md`'s own
  repeated-fix history proves is a real, recurring risk, not a hypothetical.
  - **manual impact**: none directly (this is a test/tooling finding, not a behavior change) —
    but landing it would retire the entire "range parity" sub-genre of Code-vs-intent notes across
    `filter.md`, `distortion.md`, `gain.md`, `instrument.md`, and the two foundational chapters,
    since the bug class becomes structurally impossible to reintroduce silently.
- **suggested fix**: Since the two sources live in different languages (TS vs Odin) and can't
  literally share one file today, add a small JSON or TS data file that both a UI test and (via a
  tiny Odin test proc, or a generated `.json` dump from `lookup_param_range`) the backend build
  can check against, OR — simpler in the short term — write one Vitest test that hardcodes the
  full `param_ranges.odin` table as a TS object (kept next to the test, with a comment pointing at
  the Odin source of truth) and asserts every UI control's bounds equal the corresponding entry;
  a stale copy in the test is still infinitely better than no cross-check, and a comment/CI
  reminder can ask contributors to update both when either changes.

### F-B11-7: No round-trip test of the real UI save/load path — only mocked I/O and a separate backend JSON-schema fixture
- **kind**: missing-feature
- **area**: skald-ui/src/tests/hooks/FileIO.test.tsx, skald-backend/tests/fixtures/graph_save_roundtrip.json
- **severity**: medium
- **confidence**: high
- **evidence**: `FileIO.test.tsx` mocks `window.electron.saveGraph`/`loadGraph` and asserts only
  that error states are surfaced and that a canned `{nodes, edges, session}` object is threaded
  through to `setNodes`/`setEdges`/`applySession` — it never actually serializes a real graph via
  `buildProjectData`/the save format, writes it, reads it back, and diffs. The one thing that does
  look like a round-trip test, `skald-backend/tests/fixtures/graph_save_roundtrip.json`, is a
  static, hand-authored fixture that proves the **Odin JSON loader** (`json.odin`) can parse a
  nested-instrument-shaped file — it never exercises the UI's own save format at all, nor proves
  that *saving what the UI just loaded* reproduces the same file.
- **detail**: This matters specifically because nearly every `design` finding in Tier 1 that
  proposes a schema change (Fixed Pitch → keyTrack, Noise `type` → `color`, Mixer's slot model,
  etc.) depends on an automatic upgrade-on-load step being reliable. There is currently no test
  infrastructure that would catch "the migration changed the file's shape in a way that breaks
  re-saving it" or "loading an old file and immediately re-saving produces a different graph than
  the one that was loaded" — exactly the kind of regression a migration-heavy 0.2 release is most
  likely to introduce.
- **suggested fix**: Add a UI-side round-trip test that takes 2-3 real files from `examples/`
  (or a synthetic equivalent covering nested instruments, exposed params, sequencer tracks, and
  P-locks), runs them through the real `buildProjectData`/save serialization and the real load
  deserialization, and asserts the reloaded in-memory graph is structurally equal to the original
  — this is the natural place to also pin every future upgrade-on-load transform's behavior.

### F-B11-8: The Odin backend has no unit-test layer — every check is a full fixture→codegen→compile→run→FFT-assert cycle
- **kind**: qol
- **area**: skald-backend (test architecture)
- **severity**: medium
- **confidence**: high
- **evidence**: `grep -rn "core:testing\|@(test)" skald-backend` returns nothing — there is no
  `_test.odin` file anywhere, and `tester/test_harness.odin` is a manual, interactive
  play-the-audio-through-speakers harness (`ma.device_init`, "Press Ctrl+C to quit"), not an
  automated test. Every backend behavior check in the repo goes through
  `run_acceptance.bat`/`run_golden.bat`: build `codegen.exe`, run it against a fixture, build the
  *generated* Odin package, run *that*, and either FFT-assert on the audio or text-diff the
  emission.
- **detail**: That heavier pipeline is the right tool for "does this patch sound right" and
  "is the emitted code stable," and it's well-built (the golden README explains the FFT-suite/
  golden-suite division of labor clearly). But it is the wrong tool for testing pure, stateless
  logic like `lookup_param_range`, `exposed_param_default`'s JSON-type narrowing (the exact
  mechanism behind F-A03-3's `bpmSync`/`syncRate` silent-fallback-to-`{-1e6,1e6,0.0}` bug), or
  `bpm_sync_seconds_expr`'s division-string arithmetic — each of those needs a whole fixture file,
  a whole codegen run, and a whole compiled-and-executed test binary just to check one function's
  return value for one input. That cost is a very plausible reason six node types (F-B11-2) never
  got a fixture: the marginal cost of "one more acceptance fixture" is much higher here than
  "one more Vitest `it()` block" is on the UI side, so the two suites' *shapes* diverged even
  though their *rigor* (in the cases that do exist) is comparable or better on the backend.
- **suggested fix**: Add a lightweight `core:testing`-based unit-test file (e.g.
  `skald-backend/core/param_ranges_test.odin`) directly asserting `lookup_param_range` and
  `exposed_param_default` for every node-type override and every JSON value type (float, int,
  bool, string) — this is a same-day addition, runs in milliseconds without any codegen/build
  round-trip, and is the natural place to pin F-A02-6, F-A03-3, and F-A07-4's specific defects as
  fast regression tests, freeing the acceptance suite for genuinely end-to-end, audio-behavior
  checks.

### F-B11-9: Propose a mechanism to keep the manual's `file:line` citations honest — a grep-based drift checker, cheap enough to run in CI
- **kind**: missing-feature
- **area**: docs/manual-source, CI
- **severity**: medium
- **confidence**: high
- **evidence**: Every one of Tier 1's ten chapter audits independently found the same failure
  mode in `docs/manual-source/**/*.md`: `codegen.odin` citations drifting 45-90 lines and, in
  several dozen instances, landing on genuinely unrelated code (a different node's struct fields,
  an unrelated ADSR voice-lifecycle comment, the generated-file package-header banner) — while
  citations into every *other* file (`graph_validate.odin`, `param_ranges.odin`, `param_utils.odin`,
  the `.tsx` UI files) stayed accurate to within 1-2 lines across all ten audits. The pattern is
  extremely regular: `codegen.odin` is the one file that keeps growing earlier in its own body
  (new procs inserted before existing ones), so every citation *after* an insertion point shifts
  by the same offset, in the same direction, for the rest of the file.
- **detail**: This is a mechanical, checkable property, not a subjective one — which is exactly
  what makes it automatable. The check does not need to understand Odin syntax; it only needs to
  confirm that whatever the manual paraphrases or quotes near a citation still appears at (or very
  near) the cited location in the real file.
- **suggested fix — concrete mechanism**:
  1. **Extraction**: a small script (Node or Python, run from repo root) scans every
     `docs/manual-source/**/*.md` file for the citation pattern already in consistent use:
     `` `path/to/file.ext:NNN` `` or `` `path/to/file.ext:NNN-MMM` `` (backtick-wrapped,
     colon-separated). This is a single regex
     (`` `([\w./-]+\.(?:odin|ts|tsx)):(\d+)(?:-(\d+))?` ``) — no markdown parser needed.
  2. **Verification, tier 1 (cheap, catches "citation points at unrelated code")**: for chapters
     that quote a literal code fragment near the citation (most of them do, in fenced code blocks
     or inline backticks, e.g. `case 3: return ph < 0.5 ? 1.0 : -1.0`), extract that fragment and
     grep the *whole* cited file for it. If the fragment exists in the file but not within, say,
     ±15 lines of the cited number, that's exactly Tier 1's "drifted, and lands on unrelated code"
     bar — flag it with the fragment's real current line number as the suggested fix.
  3. **Verification, tier 2 (catches plain drift, no quoted fragment available)**: for citations
     with no adjacent literal quote, at minimum assert the cited line range is within the file's
     current line count (catches the worst cases — citations into now-nonexistent lines) and flag
     any citation whose surrounding prose names a `proc`/symbol (e.g. "`generate_mapper_code`")
     that doesn't `grep` to within the cited range — cheap symbol-anchoring without full parsing.
  4. **Output**: a single report (or, in CI, a failing check with a diff-friendly list) of
     `chapter.md:citation-line -> claims codegen.odin:NNN-MMM -> fragment found at codegen.odin:XXX-YYY (drift: +N)`.
     This is exactly the debugging aid a human fixing citations needs, and it's the same
     methodology each Tier 1 agent used by hand (grep the fragment, compare to the claim) —
     turning ten agents' manual labor into a repeatable script.
  5. **Where it runs**: not a hard CI gate initially (a false-positive on a chapter's stylistic
     choice of quoting shouldn't break the build) — run it as a scheduled/manual `npm run
     check:citations` and as a required step in whatever process regenerates the manual before a
     release, since `codegen.odin` is specifically the file that drifts and specifically the file
     every future codegen PR will keep growing.
  - **manual impact**: would not fix any chapter itself, but retires the need for a whole Tier-1-
    style manual audit pass to *find* citation drift in the future — only fixing the drift the
    tool reports would remain human work.
  - **migration**: N/A — tooling only, no schema or saved-project changes.

### F-B11-10: `examples/AUDIT.md`'s own compile-check step is the most rigorous example-corpus test in the repo, and it is thrown away after each run
- **kind**: qol
- **area**: examples/AUDIT.md, CI
- **severity**: low
- **confidence**: high
- **evidence**: `AUDIT.md`'s stated method includes running `odin check <scratch_dir>
  -no-entry-point` on every generated `.odin` file — i.e. not just "did codegen exit 0" but "does
  the *emitted Odin actually typecheck/compile*" for all 61/62 files that produced output at the
  time of the audit. This is strictly more valuable than F-B11-1's proposed codegen-only check
  and already has a proven, working command line sitting in a markdown file that nobody re-runs.
- **detail**: Folding F-B11-1's proposal in with this exact compile-check step (not just a bare
  codegen exit-code check) gets the CI job to the same rigor `AUDIT.md` already demonstrated by
  hand, for free — the hard part (finding the right `odin check` invocation and confirming it
  works against the whole corpus) is already done and documented.
- **suggested fix**: When implementing F-B11-1, use `AUDIT.md`'s own two-step method (codegen,
  then `odin check -no-entry-point` on the output) rather than re-deriving a lighter check from
  scratch.
