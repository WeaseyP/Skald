# Golden-file snapshots

> **A green golden gate means "nothing changed unintentionally." It never means
> the output is correct.** These files pinned a Panner that attenuated a centred
> signal by 3 dB (SKB-013) and an `is_playing` that cut Delay/Reverb tails off
> (SKB-016) for as long as those bugs existed — the gate was green throughout,
> because recording what the generator does, bugs included, is exactly its job.
>
> Before concluding a red gate is (or isn't) your fault, run
> `scripts\verify-baseline.ps1 -Ref HEAD~1` from the repo root. See
> [`TESTING.md`](../../../TESTING.md) for the discipline, the known-red-at-baseline
> list, and why deleted lines in a golden diff deserve more attention than added
> ones.


Each `<fixture>.odin.golden` here is a byte-exact snapshot of the Odin source
that `codegen.exe` emits for a fixture (package `generated_audio`). They pin the
generator's **output text** so refactors can be proven output-preserving.

This complements the FFT acceptance suite (`run_acceptance.bat`):

- `run_acceptance.bat` proves the emitted code still **behaves** the same
  (renders the same audio features).
- the goldens prove the emitted **text** is identical — catching whitespace /
  structural / typing-only changes that an FFT assertion would sleep through.
- the **double-run determinism gate** (below) proves the emitted text is a
  *function of the input* at all — which neither of the other two can, because
  both only ever look at one run.

## Where fixtures live

| Directory | Shape | Consumed by |
|---|---|---|
| `tests/fixtures/*.json` | Project-shape (`{"project": {...}}`) | `run_golden.bat` **and** `run_acceptance.bat` |
| `tests/fixtures/graph/*.json` | Graph-shape (React Flow save: top-level `nodes`/`edges`/`sequencerTracks`) | `run_golden.bat` only |

`run_acceptance.bat` builds an Odin program that references `Asset_init`,
`Asset_trigger`, … by name and `switch`es on the fixture's base name, so every
fixture it sees must have exactly one instrument named `Asset`. Multi-instrument
fixtures therefore cannot live in `tests/fixtures/` — they go in
`tests/fixtures/graph/`, which the acceptance suite's non-recursive glob does
not see. Golden file names are derived from the fixture's base name alone, so
**base names must be unique across both directories.**

## Usage (from `skald-backend\`)

```bat
run_golden.bat            :: check current emission against the goldens (CI mode)
run_golden.bat check      :: same, explicit
run_golden.bat update     :: regenerate the goldens from current emission
```

`check` exits non-zero on any diff, missing golden, or non-deterministic
emission. `update` overwrites the goldens — run it **only** after a deliberate
codegen change that you have already verified with `run_acceptance.bat`, then
review the `git diff` of the goldens to confirm the text delta is exactly what
you intended.

## The determinism gate

Every fixture is generated **twice** and the two emissions are compared with
`fc /B` (binary, stricter than the golden compare, which normalizes line
endings). Two runs of the same binary over the same input must produce the same
bytes. This runs in `update` mode too: never record a golden from a generator
that is not reproducible.

The gate exists because determinism was a convention rather than an invariant,
and the convention broke. `build_project_from_graph` iterated `graph.nodes` — an
Odin map, whose iteration order is unspecified and varies run-to-run — so the
same input file produced **six distinct byte-outputs across 14 runs**, and the
wasm shim's integer asset index permuted with them: `skald_note_on(asset, …)`
addressed a different instrument on every regeneration. A game could be wired to
the wrong instrument by a rebuild with no edits. (BUGS.md SKB-003, findings
F-B04-1 / F-C3-3, roadmap packet A3. Fix: `nodes_sorted_by_id` in
`core/graph_utils.odin`.)

If the gate ever fires, **do not run `run_golden.bat update`.** A golden
recorded from a permuted run bakes the permutation in and destroys the only
evidence that the generator is broken. Find the unsorted map iteration.

## Fixture rule: no count-like field may sit alone at its degenerate value

**No count-like fixture field may sit at its degenerate value — 0 or 1 — as the
*only* coverage of that field.** Every count-like dimension (instruments per
project, tracks per instrument, notes per track, voices, oscillators, exposed
params, connections into a port, duplicate names sharing an identifier) needs at
least one fixture at n ≥ 2, and preferably n ≥ 3 where an "nth" case differs
from a "second" case.

This is the rule SKB-003 was hiding behind. When the determinism bug was found,
all 30 fixtures were single-instrument: the two graph-shaped ones sat at exactly
**1 instrument** (`graph_save_roundtrip`, order irrelevant) and **0 instruments**
(`legacy_loose_graph`, which takes the `"Asset"` fallback). With n ∈ {0, 1},
"iterate the instruments in an unspecified order" has exactly one possible
outcome, so the entire golden suite was structurally incapable of observing the
bug for the whole life of the project — and passed green while shipping it.
Verified: against the pre-fix binary the gate reports 30 fixtures clean and only
`multi_instrument_dup_names` non-deterministic.

`tests/fixtures/graph/multi_instrument_dup_names.json` is the fixture that
retires that blind spot: 6 instruments, node ids deliberately declared in an
order that differs from their sorted order, and duplicate names (three `Kick`,
two `Lead`, one `Bass`) so the `_2`/`_3` suffixes that `resolve_unique_names`
assigns by instrument order are pinned too — a second, subtler order dependency
that a fixture with unique names would not catch. It also spans both asset kinds
(3 SFX, 3 Music Layer). Pre-fix it produced 7 distinct outputs in 16 runs;
post-fix, 1 in 32 runs across two independently compiled binaries.

## Notes

- `.gen\` is a transient scratch dir holding the freshly generated files during
  a `check` — `<fixture>.odin` plus the `.rerun.odin` / `.shim.odin` /
  `.shim.rerun.odin` companions the determinism gate compares; it is safe to
  delete and is not the source of truth.
- The wasm shim is generated but not goldened. Only the editor preview consumes
  it, and it is fully derived from the main emission — but its `switch asset`
  dispatch *is* the integer index a host addresses instruments by, so the
  determinism gate byte-compares it explicitly rather than inferring it.
- Goldens are regenerated any time the generator's emission legitimately
  changes (e.g. the f32-typing discipline pass wrapped literals in `f32(...)`
  and moved param-derived locals to explicit `: f32 =`). That is expected — the
  guarantee is "no *unreviewed* text change", not "text never changes".
