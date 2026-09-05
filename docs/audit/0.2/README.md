# 0.2 pre-release audit — source findings

Provenance for `docs/0.2-ROADMAP.md`, `docs/0.2-AUDIT-GAPS.md` and `BUGS.md`. These are the raw
per-agent reports the three deliverables were compiled from, preserved so any claim in them can be
traced back to the agent that made it and the evidence that agent cited.

**Nothing in this folder is a plan.** *(2026-09-06: the live tracker is now `ROADMAP.md`; this
folder is historical testimony behind the 2026-08-01 `docs/0.2-ROADMAP.md`.)* The roadmap is the
plan; where a report here disagrees with it, the roadmap wins — it was compiled after the
corrections below were applied. Several findings in these files were later downgraded, merged, or
refuted outright. Read them as testimony, not as a work list.

## Structure

| Path | What |
|---|---|
| `TIER1-BRIEF.md`, `TIER2-BRIEF.md`, `TIER3-BRIEF.md` | The briefs each tier's agents were given |
| `tier1/01`–`10` | Per-node correctness: manual chapter cross-read against implementation, 18 node types |
| `tier2/01`–`11` | Subsystems: sequencer, BPM/time, voices, codegen, generated API, serialization, UI state, audio engine, prior-findings re-checks (`09a`/`09b`), systemic design, tests/CI |
| `tier3/C1`–`C5` | Adversarial verification, node interactions, architecture, product/UX, scope — the only tier that compiled and measured rather than read |
| `evidence/` | Text evidence from C2's measuring harness and the corpus codegen sweep |

## Evidence files

- `evidence/MEASUREMENTS.txt` — peak levels for 16 synthetic fixtures (A–P) driven through the
  real codegen and a measuring harness. The source of the gain-structure findings.
- `evidence/REAL_PATCH_LEVELS.txt` — the same measurement over seven shipped example patches.
- `evidence/codegen-corpus-results.tsv` — per-file codegen result across the whole `examples/`
  corpus (101 JSON files).

The generated Odin, the compiled harness and the codegen binaries those runs used were session
scratch and are **not** preserved here. Reproducing a measurement means rebuilding the harness —
which is itself a finding: see roadmap §3.2 and packet A2 (binary provenance).

## Corrections that override these files

Applied during compilation, listed here so nobody re-files a refuted claim from a tier report:

1. **`json.odin:203-222` is not dead code.** C1 endorsed the claim that it is; C3 and D2
   independently disproved it. It is the only parser of any instrument subgraph, on both ingestion
   paths. Acting on the original finding would delete working code.
2. **"111 of 119 prior findings still live" is arithmetically impossible** and must not be quoted.
   The source table has 108 rows, at most 103 live.
3. **The corpus is 101 JSON files** (80 `.skald.json` + 21 bare; 26 unplayable; 1 fails codegen).
   The counts 62, 75, 81 and 94 all appear in these files and are all wrong.
4. **The examples-in-CI gate as specced in `tier2/11` tests the wrong ingestion path** and its
   `*.skald.json` glob skips the only known-failing file. Spec it per `tier3/C3`.
5. **The ADSR/VCA and Panner findings in `tier1/08`–`09` were rejected on evidence** — the VCA does
   multiply audio, and 1 of 81 example patches uses a Panner at all.

Two areas had **zero** coverage and are not represented here at all: the packaged installer, and
`docs/manual-source/70-space-funk-build.md` with the `examples/snes-kit/` corpus it teaches. Both
are recorded as gaps in `docs/0.2-AUDIT-GAPS.md` (G12 and §3.11).
