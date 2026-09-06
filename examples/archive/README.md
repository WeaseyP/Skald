# Archived examples

Files moved out of the import-facing library (`sound-effects/`, `instruments/`,
`songs/`) by the 2026-07-24 example audit. Kept for reference instead of deleted;
safe to remove permanently whenever.

That audit's write-up (`../AUDIT.md`) has been deleted: every example is now
checked on both ingestion paths by `skald-ui/src/tests/corpus/`, which runs in CI,
so the gate is the document.

`PulsarBeam.json`, formerly here, wired an LFO into `Delay`'s `input_delayTime`
— a port that has never existed in the backend (`graph_validate.odin` lists
only `input` for Delay) — and was not a fixable data error, so roadmap B6-2
deleted the file outright rather than quarantine it indefinitely. Its
quarantine entry went with it; B6-1 then removed the quarantine mechanism in
`corpusGate.ts` altogether, once auto-wrapping made the loose graphs playable.

| File | Why archived |
| --- | --- |
| `Sax2.json` | Duplicate of `instruments/winds/midi-setup/sax3.json` — legacy pre-Instrument-node original of the same patch, superseded. |
| `AlarmPulse.json` | Duplicate of `sound-effects/synth/Alarm.json` — same LFO→Oscillator→Output patch, same values. |
