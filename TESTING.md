# Testing Skald — and how to tell whose fault it is

Read this before you conclude a gate failure is yours, and before you conclude
it isn't.

## The rule

**A red gate is not evidence you broke something. A green gate is not evidence
you didn't.** Establish the baseline first, mechanically:

```powershell
.\scripts\verify-baseline.ps1              # what do the gates say about HEAD?
.\scripts\verify-baseline.ps1 -Ref HEAD~1  # was this already red before my commit?
```

That script exports the ref with `git archive` into a temp tree — **not** a file
copy, so none of your working-tree edits or untracked files come along — runs
every gate there, and prints the numbers. It never touches your working tree and
never runs a gate's `update` mode.

This is not a hypothetical discipline. During roadmap Wave B it caught three
things, and each one had already cost someone real time:

| What happened | Why the naive read was wrong |
|---|---|
| `odin test tests\unit` was red | It had not compiled *for some time* — 14 errors, from a refactor that added a `plan` parameter to three generators and never updated the test file. Nothing had flagged it, so CI's parameter-contract step was simply red. |
| `run_corpus_golden.bat` reported "98/99 non-deterministic" | The gate had a **batch-parsing bug**: `echo NON-DETERMINISTIC %NAME% (shim)` left its parens unescaped, so the `)` closed the enclosing `if (` block at parse time and the failure counters incremented for every fixture that **passed**. The non-determinism was entirely fictional. |
| An agent reported the UI baseline as 684 tests | It had counted *another agent's untracked test files* as pre-existing, then measured its own "no regression" delta against a number it had invented. The real baseline was 573. `git archive` makes this mistake impossible. |

## The gates

Run backend gates from `skald-backend`, UI gates from `skald-ui`.

| Gate | Command | Proves |
|---|---|---|
| Acceptance | `.\run_acceptance.bat` | The emitted code **behaves** correctly (FFT assertions on rendered audio). |
| Goldens + determinism | `.\run_golden.bat` | The emitted **text** is unchanged, *and* is a function of the input at all (double-run). |
| Backend unit | `odin test tests\unit` | Parameter-resolution contracts, bus-domain analysis. |
| Examples corpus (backend) | `.\run_corpus_golden.bat` | Every shipped example still generates deterministically. |
| UI | `npx vitest run` | Editor behaviour, serializer, hooks. |
| Examples corpus (UI) | `npx vitest run src/tests/corpus/ExamplesCorpus.test.ts` | Every shipped example ingests through **both** the editor and CLI paths. |
| Typecheck / lint | `npx tsc --noEmit` / `npm run lint` | — |

`.bat` gates need the `.\` prefix under `cmd /c`. A bare
`cmd /c "run_acceptance.bat"` fails to find the file. Use `npm run lint`, not a
bare `npx eslint` — the latter behaves differently here.

## Known red at baseline — do not "fix" these by accident, do not blame yourself for them

Anything below was already failing before you started. If your change makes one
of them **worse**, that *is* yours. If it merely still fails, it isn't.

| Gate | State | Owner |
|---|---|---|
| `npx tsc --noEmit` | **1 error**: `TS2307: Cannot find module '../../forge.env'` in `src/tests/components/ExamplesModal.test.tsx`. `skald-ui/forge.env.d.ts` is tracked and present, so it is a resolution/config problem, not a missing file. | unassigned |
| `npm run lint` | **2 errors**, both `import/no-unresolved` on that same specifier. | unassigned |
| `.\run_corpus_golden.bat` | Reports honestly since the paren fix, and is **legitimately red**: 98 `MISSING GOLDEN` (no corpus goldens have ever been recorded) + 1 `CODEGEN FAILED` (`examples/archive/PulsarBeam.json` wires a Delay modulation port that has never existed). **It cannot be made green until roadmap B6-2 deletes PulsarBeam** — record the corpus goldens as part of that packet, not before. | roadmap B6-2 |

`odin test tests\unit` was on this list and is now green (repaired in `fe05093`).

Roadmap exit criterion 1 ("four CI gates green") cannot be met while anything
above is outstanding.

## Golden files: what a green golden gate does and does not mean

A golden is a byte-exact snapshot of what the generator emits **today**. It pins
behaviour; it does not bless it. Wave B is the proof: `panner_mono.odin.golden`
faithfully recorded a pan law that attenuated a centred signal by 3 dB, and
`delay_tail.odin.golden` faithfully recorded an `is_playing` that cut tails off.
Both gates were green the whole time, because both were doing their job —
recording what the generator did, including the bugs.

So:

- **A green golden gate means "nothing changed unintentionally."** It never means
  "the output is correct."
- **Never run `run_golden.bat update` to turn a red gate green.** Read the diff
  first, every file, and satisfy yourself that each change is one you intended
  and that nothing else moved. `update` on an unread diff launders a regression
  into the record as intent, and the next reader has no way to tell.
- **Pay disproportionate attention to deleted lines.** Additions are usually a
  new feature; a *deletion* means something stopped being emitted, which is
  where a real regression hides. A useful audit is
  `git diff <base> HEAD -- skald-backend/tests/golden | grep '^-' | sort | uniq -c`
  — every distinct deleted line should map to a change you can name. Wave B's
  three golden regenerations produced 5226 insertions and exactly **15**
  deletions, all 15 attributable to two intended changes (the pan law rewrite
  and single-sourcing the reverb comb length).
- Say in the commit message how many goldens changed and what the diff's shape
  was. It is the only durable record of *why* a snapshot moved.

## Adding a fixture

Read the long comment block at the top of `run_golden.bat` first. The short
version: a `.json` dropped in the **flat** `tests/fixtures/` directory
automatically becomes an **acceptance** fixture too, and an unrecognised base
name is a hard failure there. Pick deliberately:

| Directory | Use when | Requirements |
|---|---|---|
| `tests/fixtures/` | You need audio assertions | Single instrument named `Asset`; add a case to `acceptance/main.odin` |
| `tests/fixtures/codegen_only/` | You only need to pin emitted text | Project shape |
| `tests/fixtures/graph/` | You need the React Flow save shape | — |
| `tests/fixtures/_negative/` | The input must be **rejected** (non-zero exit) | Not scanned by either harness |

Base names must be unique across all of them — the golden filename derives from
the base name alone.

## Every fix ships with a test that failed first

Roadmap exit criterion 2. Not "a test that passes now" — a test you **watched
fail** against the unfixed code, then watched pass. Write it first, or revert
your fix and run it. Say so in the report, and quote the failure.

Two traps seen in Wave B:

- `expect(fn).toHaveBeenCalledWith({ key: undefined })` passes vacuously when the
  key is absent entirely. Assert concrete values, and pair positives with
  `expect(other).not.toHaveBeenCalled()`.
- Asserting a value computed by the function under test
  (`expect(x).toBe(helper(60))`) passes for any implementation. Pin a literal
  somewhere.
