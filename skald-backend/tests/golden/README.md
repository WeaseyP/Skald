# Golden-file snapshots

Each `<fixture>.odin.golden` here is a byte-exact snapshot of the Odin source
that `codegen.exe` emits for `tests/fixtures/<fixture>.json` (package
`generated_audio`). They pin the generator's **output text** so refactors can be
proven output-preserving.

This complements the FFT acceptance suite (`run_acceptance.bat`):

- `run_acceptance.bat` proves the emitted code still **behaves** the same
  (renders the same audio features).
- the goldens prove the emitted **text** is identical — catching whitespace /
  structural / typing-only changes that an FFT assertion would sleep through.

## Usage (from `skald-backend\`)

```bat
run_golden.bat            :: check current emission against the goldens (CI mode)
run_golden.bat check      :: same, explicit
run_golden.bat update     :: regenerate the goldens from current emission
```

`check` exits non-zero on any diff or missing golden. `update` overwrites the
goldens — run it **only** after a deliberate codegen change that you have
already verified with `run_acceptance.bat`, then review the `git diff` of the
goldens to confirm the text delta is exactly what you intended.

## Notes

- `.gen\` is a transient scratch dir holding the freshly generated files during
  a `check`; it is safe to delete and is not the source of truth.
- Goldens are regenerated any time the generator's emission legitimately
  changes (e.g. the f32-typing discipline pass wrapped literals in `f32(...)`
  and moved param-derived locals to explicit `: f32 =`). That is expected — the
  guarantee is "no *unreviewed* text change", not "text never changes".
