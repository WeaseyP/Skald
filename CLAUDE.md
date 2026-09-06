# Skald — working notes for agents

Visual audio-programming editor (Electron + React 19 + TypeScript) that
generates Odin DSP source. `skald-ui/` is the editor, `skald-backend/` is the
code generator (`skald_codegen.exe`).

## Before you touch a gate, establish the baseline

**Check yourself before you wreck yourself.** A red gate is not evidence you
broke something, and a green gate is not evidence you didn't.

```powershell
.\scripts\verify-baseline.ps1              # gates at HEAD
.\scripts\verify-baseline.ps1 -Ref HEAD~1  # was it already red before my commit?
```

It exports the ref with `git archive` into a temp tree — not a file copy, so
your working-tree edits and untracked files stay out of it — and prints every
gate's number. **Read `TESTING.md` before reporting any gate result.** It carries
the gate table, the discipline, and the list of gates that are **already red at
baseline** so you neither blame yourself for them nor "fix" them by accident.

Three separate agents have burned time on this exact question in this repo. One
reported a fabricated test baseline because it counted another agent's untracked
files as pre-existing. Do not be the fourth.

## Two things that will bite you

**The generator emits two shapes from one analysis.** The game-facing per-asset
API (`<Asset>_init/_note_on/_note_off/_trigger/_process/_is_playing/_set_*`) and
a `@(export) skald_*` wasm shim used only by the editor preview
(`core/codegen_project.odin`). A semantic change made in one but not the other
makes **preview lie about the export** — the single most common defect class in
this repo's history. Check both, every time.

**One reader, not two.** SKB-002's lesson. Where the editor and the generator
both need to know something (P-lock resolution, parameter ranges, sync-rate
defaults, master-volume semantics), a second implementation that drifts is a bug
class, not a convenience. If you must mirror Odin logic in TypeScript, mirror it
case-by-case against the source and say so in a comment. Beware
`strings.equal_fold`: it folds **ASCII only** (its body ends
`// TODO(bill): Unicode folding`), so a `toLowerCase()` mirror is *more
permissive than the generator* and will promise builds that then exit 1.

## Gates

Backend from `skald-backend`, UI from `skald-ui`. `.bat` files need the `.\`
prefix under `cmd /c` — a bare `cmd /c "run_acceptance.bat"` fails. Use
`npm run lint`, not a bare `npx eslint`.

| | |
|---|---|
| `.\run_acceptance.bat` | behaviour (FFT over rendered audio) |
| `.\run_golden.bat` | emitted text + determinism double-run |
| `odin test tests\unit` | parameter/bus-domain contracts |
| `npx vitest run` | editor |

**A green golden gate means "nothing changed unintentionally" — never "the
output is correct."** Goldens pinned a 3 dB pan attenuation and a tail-cutting
`is_playing` for months while staying green. Never run `run_golden.bat update`
to make red go green: read every diff first, and give deleted lines
disproportionate attention, because a deletion means something stopped being
emitted. See `TESTING.md`.

If you add a file under `skald-backend/core/`, add it to `CODEGEN_SOURCES` in
`main.odin` or the editor's provenance guard reports it uncovered.

**Parameter ranges and defaults are authored once**, in `schema/nodes.json`.
`node scripts/gen-node-schema.mjs` renders `core/param_ranges.generated.odin`
and `skald-ui/src/definitions/nodeSchema.generated.ts`; never edit a
`*.generated.*` file by hand (the staleness gate `NodeSchema.test.ts` fails).
A new row's default is what an exposed-but-untouched parameter generates at,
so changing a default for an existing (node, param) needs a save migration
that stores the old value first (see migration 3→4 in `saveMigrations.ts`).

## Conventions

- **Every fix ships with a test you watched fail first** (roadmap exit criterion
  2). Not a test that merely passes now. Read the fixture-placement comment at
  the top of `run_golden.bat` before adding a fixture — a `.json` in the flat
  `tests/fixtures/` becomes an acceptance fixture automatically and an unknown
  base name is a hard failure.
- **Comments explain the defect the code prevents**, in prose, usually citing a
  bug ID (`SKB-nnn`). Read a few before writing one. Never narrate what the next
  line does.
- Every mutation of `{nodes, edges, tracks, session}` goes through
  `pushHistory(label, {gesture, scope})` in `hooks/nodeEditor/useEditorHistory.ts`.
  A new mutation path without it silently reintroduces the bug packet B3 closed.
- `ROADMAP.md` is the tracker. **Verify a section is actually open before
  implementing it** — four of Wave B's twelve were already implemented with only
  the checkbox left open, and the code says so in its own comments.
- Many files are CRLF in the repo blob. Diff with `--ignore-all-space` when
  reviewing, or a 10-line change reads as 551.

## Never read `.env` files or other secret-bearing files

`.env*`, `*.pem`, `*.key`, `credentials.json`, `secrets.*`, `id_rsa`. Not
partially, not to check a variable exists. Use `Test-Path` / `ls` for presence,
and read the app's source to learn which variable names it consumes.
