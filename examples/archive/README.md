# Archived examples

Files moved out of the import-facing library (`sound-effects/`, `instruments/`,
`songs/`) by the 2026-07-24 example audit (see `../AUDIT.md`). Kept for
reference instead of deleted; safe to remove permanently whenever.

| File | Why archived |
| --- | --- |
| `Sax2.json` | Duplicate of `instruments/winds/midi-setup/sax3.json` — legacy pre-Instrument-node original of the same patch, superseded. |
| `AlarmPulse.json` | Duplicate of `sound-effects/synth/Alarm.json` — same LFO→Oscillator→Output patch, same values. |
| `PulsarBeam.json` | Broken since creation: wires an LFO into `Delay`'s `input_delayTime`, a port that has never existed in the backend (`graph_validate.odin` lists only `input` for Delay). Committed with the message "some need work". Would need redesign, not just a fix, to make sound. |
