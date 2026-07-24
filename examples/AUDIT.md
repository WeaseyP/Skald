# Example Library Audit (BUG-EXAMPLES-LEGACY-CLEANUP)

Audited 2026-07-24 against `skald-backend` built from this worktree
(`odin build . -out:codegen.exe`, `odin version dev-2025-02:748a771da`).

## Method

1. Enumerated every `.json` under `examples/` — **62 files** (no oddly-named
   outliers or a `songs/loops/to implement/` directory were found; see
   "Discrepancies from the bug ticket" below).
2. Ran `codegen.exe -in:<file> -out:<scratch>.odin -package:generated_audio`
   for every file. Recorded exit code, stderr, output byte size, and a count
   of `_init`/`_process` proc definitions in the output (a cheap plausibility
   check that the output isn't an empty/no-op project).
3. For every file that produced an `.odin` file (61/62), ran
   `odin check <scratch_dir> -no-entry-point` with the output copied in as
   the sole file of a throwaway `generated_audio` package — this
   type-checks/compiles the generated Odin without needing a full
   per-instrument test harness. **All 61 passed clean**, so codegen success
   also means "the emitted Odin actually compiles" for every file in the
   library, not just exit-code-0.
4. Additionally did a full real build of `examples/integration_demo` (which
   has an actual `main.odin` entry point + miniaudio) — see the FIXABLE
   entry below.
5. Cross-checked for duplicates two ways: exact file hash (none found) and a
   structural fingerprint (node types + canonicalized params, ignoring
   position/id/label) recursing into instrument subgraphs. No exact
   structural duplicates were found by the automated pass (expected — see
   note below on why it under-reports), but manual inspection of
   suspiciously-paired filenames turned up two real duplicates (see table).

Note on the duplicate-finder: it only matches files using the *same* schema
shape (both legacy loose-graph, or both Instrument-wrapped). The two
duplicates actually present in the library are a legacy-loose-graph file
next to an Instrument-wrapped rebuild of the identical patch, so the
automated pass legitimately can't fingerprint-match them — they were found
by hand from parameter-for-parameter comparison (see notes below).

## Summary counts

| Category | Count |
| --- | --- |
| VALID (current Instrument-wrapped schema) | 36 |
| VALID (project-schema, integration demo) | 1 (was FIXABLE — stale generated artifact, now regenerated) |
| VALID (legacy loose-graph schema, still supported) | 22 |
| DELETE-CANDIDATE | 3 |
| **Total** | **62** |

Zero examples are broken by a codegen bug. The one hard failure
(`PulsarBeam.json`) fails because the *example data* wires a port the node
graph has never supported — not because codegen regressed.

## Table

Legend: **VALID** = current schema, codegen OK, output compiles. **VALID
(legacy)** = pre-Instrument-node loose-graph format; still codegen's fine
because `core/json.odin`'s `build_project_from_graph` wraps any
no-Instrument-node graph as a single SFX named `Asset` (this is a
deliberate, documented compatibility fallback, not a bug — see
BUG-EXAMPLES-MISC-OBSOLETE in BUGS.md). **FIXABLE** = mechanically
corrected in this pass, re-validated. **DELETE-CANDIDATE** = duplicate,
placeholder, or broken; not deleted, left for the user to decide.

| Path | Category | Codegen result | Notes |
| --- | --- | --- | --- |
| instruments/bass/bass-sequenced.skald.json | VALID | exit 0, 16637 B, 4 procs | Instrument-wrapped, sequenced. |
| instruments/bass/lfo-filter-wobble-bass.skald.json | VALID (legacy) | exit 0, 10035 B, 4 procs | Loose graph → generic `Asset_*` API. |
| instruments/bass/random-acid-bass.skald.json | VALID | exit 0, 20259 B, 4 procs | Instrument-wrapped. |
| instruments/bass/sine-sub-bass.skald.json | VALID (legacy) | exit 0, 8838 B, 4 procs | Loose graph → generic `Asset_*` API. |
| instruments/brass/tuba-breath-bloom.skald.json | VALID | exit 0, 19414 B, 4 procs | Instrument-wrapped. |
| instruments/brass/tuba-sound-chain.skald.json | VALID | exit 0, 14298 B, 4 procs | Instrument-wrapped. |
| instruments/brass/tuba.skald.json | VALID | exit 0, 20821 B, 4 procs | Instrument-wrapped. |
| instruments/drums/acoustic-electric/Cowbell.json | VALID (legacy) | exit 0, 10525 B, 4 procs | Loose graph → generic `Asset_*` API. |
| instruments/drums/acoustic-electric/CyberCymbal.json | VALID (legacy) | exit 0, 9586 B, 4 procs | Loose graph → generic `Asset_*` API. |
| instruments/drums/acoustic-electric/HiHat.json | VALID (legacy) | exit 0, 8683 B, 4 procs | Loose graph → generic `Asset_*` API. |
| instruments/drums/acoustic-electric/KickDrum.json | VALID (legacy) | exit 0, 11245 B, 4 procs | Loose graph → generic `Asset_*` API. Distinct patch design from `drums/kick-sequenced.skald.json` (different node graph/params) — not a duplicate, just the same instrument family. |
| instruments/drums/acoustic-electric/SnareDrum.json | VALID (legacy) | exit 0, 9794 B, 4 procs | Loose graph → generic `Asset_*` API. |
| instruments/drums/kick-sequenced.skald.json | VALID | exit 0, 20637 B, 4 procs | Instrument-wrapped, sequenced pattern. |
| instruments/drums/snare-sequenced.skald.json | VALID | exit 0, 21437 B, 4 procs | Instrument-wrapped, sequenced pattern. |
| instruments/keys/fm-bell-sequenced.skald.json | VALID | exit 0, 15708 B, 4 procs | Instrument-wrapped. |
| instruments/keys/fm-bell-tone.skald.json | VALID (legacy) | exit 0, 9851 B, 4 procs | Loose graph → generic `Asset_*` API. |
| instruments/keys/piano-and-keys/MellowElectricPiano.json | VALID (legacy) | exit 0, 9306 B, 4 procs | Loose graph → generic `Asset_*` API. |
| instruments/keys/piano-and-keys/PianoChord.json | VALID (legacy) | exit 0, 10623 B, 4 procs | Loose graph → generic `Asset_*` API. |
| instruments/leads/saw-lead.skald.json | VALID (legacy) | exit 0, 9629 B, 4 procs | Loose graph → generic `Asset_*` API. Minimal 4-node patch; distinct from `synth-lead.skald.json` (different complexity/params), not a duplicate. |
| instruments/leads/synth-lead.skald.json | VALID | exit 0, 16709 B, 4 procs | Instrument-wrapped, sequenced pattern. |
| instruments/pads/ambient-reverb-pad.skald.json | VALID (legacy) | exit 0, 10736 B, 4 procs | Loose graph → generic `Asset_*` API. |
| instruments/pads/complex-drone-machine.skald.json | VALID (legacy) | exit 0, 10497 B, 4 procs | Loose graph → generic `Asset_*` API. |
| instruments/pads/pad-sequenced.skald.json | VALID | exit 0, 17451 B, 4 procs | Instrument-wrapped, sequenced pattern. |
| instruments/pads/pwm-pad.skald.json | VALID (legacy) | exit 0, 10414 B, 4 procs | Loose graph → generic `Asset_*` API. |
| instruments/winds/growly-sax.skald.json | VALID | exit 0, 34755 B, 4 procs | Instrument-wrapped. |
| instruments/winds/midi-setup/Sax2.json | **DELETE-CANDIDATE** | exit 0, 15294 B, 4 procs | Duplicate: parameter-for-parameter the same patch as `sax3.json` in the same folder (identical Mapper/Oscillator/Filter/Gain/Output/MidiInput/ADSR graph and wiring; only a few tuning values differ, e.g. filter cutoff 800 vs 857, ADSR release 1.0 vs 0.213). This one is the pre-Instrument-node loose-graph original (codegens to a generic `Asset`); `sax3.json` is the modern Instrument-wrapped rebuild (codegens to `sax_*`, meaningful name). Superseded by `sax3.json`. |
| instruments/winds/midi-setup/sax3.json | VALID | exit 0, 15382 B, 4 procs | Instrument-wrapped ("sax"). The modern version of the `Sax2.json` duplicate above. |
| instruments/winds/normal-sax.skald.json | VALID | exit 0, 34143 B, 4 procs | Instrument-wrapped. |
| instruments/winds/wind.skald.json | VALID | exit 0, 13104 B, 4 procs | Instrument-wrapped. |
| integration_demo/_demo_project.json | **FIXED → VALID** | exit 0, 17495 B, 6 procs | The checked-in `generated_audio/generated_audio.odin` was stale relative to current codegen (missing `Sfx_feed_input`/`Layer_feed_input` and the wavetable/PRNG helper procs that current codegen emits). Regenerated via the exact command in `integration_demo/README.md` (`codegen.exe -in:_demo_project.json -out:generated_audio/generated_audio.odin -package:generated_audio`) and verified with a full `odin build examples/integration_demo -out:demo_test.exe` (not just `odin check`) — builds clean. Not import-facing (outside `sound-effects/`/`instruments/`/`songs/`); see structure note below. |
| songs/full/four-bar-song.skald.json | VALID | exit 0, 56339 B, 12 procs | 5-instrument song project. |
| songs/full/possible-background-music.skald.json | VALID | exit 0, 58800 B, 8 procs | 3-instrument song project. |
| songs/loops/geowars/boss-chrome-pad.skald.json | VALID | exit 0, 17103 B, 4 procs | |
| songs/loops/geowars/boss-war-tuba.skald.json | VALID | exit 0, 30758 B, 4 procs | |
| songs/loops/geowars/disruptor-alarm.skald.json | VALID | exit 0, 17846 B, 4 procs | |
| songs/loops/geowars/gold-gilded-fanfare.skald.json | VALID | exit 0, 18323 B, 4 procs | |
| songs/loops/geowars/gold-midas-bells.skald.json | VALID | exit 0, 17423 B, 4 procs | |
| songs/loops/geowars/grunt-swarm-bass.skald.json | VALID | exit 0, 16582 B, 4 procs | |
| songs/loops/geowars/hat-static.skald.json | VALID | exit 0, 13007 B, 4 procs | |
| songs/loops/geowars/kick-warhead.skald.json | VALID | exit 0, 16526 B, 4 procs | Same node-type-multiset "shape" as `instruments/drums/kick-sequenced.skald.json` but different id namespace/params/theme (geowars kit reuse of a design skeleton) — not treated as a duplicate. |
| songs/loops/geowars/slowboy-doom-tuba.skald.json | VALID | exit 0, 22399 B, 4 procs | |
| songs/loops/geowars/snare-shrapnel.skald.json | VALID | exit 0, 14260 B, 4 procs | |
| songs/loops/geowars/sniper-laser-wire.skald.json | VALID | exit 0, 16784 B, 4 procs | |
| songs/loops/geowars/splitter-echo-stab.skald.json | VALID | exit 0, 16254 B, 4 procs | |
| songs/loops/geowars/tuba-breath-ballad.skald.json | VALID | exit 0, 23089 B, 4 procs | |
| songs/loops/geowars/tuba-oompah-shop.skald.json | VALID | exit 0, 18719 B, 4 procs | |
| sound-effects/cosmic/AlienChatter.json | VALID (legacy) | exit 0, 6861 B, 4 procs | Loose graph → generic `Asset_*` API. |
| sound-effects/cosmic/BlackHoleDrone.json | VALID (legacy) | exit 0, 9611 B, 4 procs | Loose graph → generic `Asset_*` API. |
| sound-effects/cosmic/PulsarBeam.json | **DELETE-CANDIDATE** | **exit 1** | `Error: instrument "Asset": connection into Delay(3) uses unknown input port "input_delayTime" — the wire would be silently ignored and the asset would sound wrong. Valid ports for Delay: "input".` The patch wires an LFO ("Doppler Shift") into the Delay node's `delayTime`, but the Delay node has never exposed a modulation input in any UI/codegen version present in this repo's history (`skald-backend/core/graph_validate.odin` only ever lists `"input"` for Delay) — confirmed via `git log -p` on the file: it was added in commit `9fe5b11` with the message "Added more examples, some need work." This is a placeholder for an unimplemented feature, not a regression. Not mechanically fixable without changing the patch's intent (dropping the modulation wire would silence the file's whole reason for existing — "Doppler Shift" on the delay). |
| sound-effects/cosmic/WarpDrive.json | VALID (legacy) | exit 0, 7814 B, 4 procs | Loose graph → generic `Asset_*` API. |
| sound-effects/geowars/blackhole-pew.skald.json | VALID | exit 0, 14243 B, 4 procs | |
| sound-effects/geowars/button-slam.skald.json | VALID | exit 0, 19236 B, 4 procs | |
| sound-effects/geowars/gold-chime.skald.json | VALID | exit 0, 13881 B, 4 procs | |
| sound-effects/geowars/kill-explosion.skald.json | VALID | exit 0, 19501 B, 4 procs | |
| sound-effects/geowars/sniper-rail.skald.json | VALID | exit 0, 17359 B, 4 procs | |
| sound-effects/impacts/percussive-high-pass-hit.skald.json | VALID (legacy) | exit 0, 9618 B, 4 procs | Loose graph → generic `Asset_*` API. |
| sound-effects/synth/Alarm.json | VALID | exit 0, 7484 B, 4 procs | Instrument-wrapped ("Alarm"). |
| sound-effects/synth/AlarmPulse.json | **DELETE-CANDIDATE** | exit 0, 7156 B, 4 procs | Duplicate: identical patch to `Alarm.json` in the same folder — same LFO (Square, 4Hz) → Oscillator (Sawtooth, 880Hz) → Output graph, same parameter values. This is the pre-Instrument-node loose-graph original (codegens to generic `Asset`); `Alarm.json` is the modern Instrument-wrapped rebuild (codegens to `Alarm_*`). Superseded by `Alarm.json`. |
| sound-effects/synth/LaserPew.json | VALID (legacy) | exit 0, 10694 B, 4 procs | Loose graph → generic `Asset_*` API. |
| sound-effects/synth/PowerUp.json | VALID (legacy) | exit 0, 9314 B, 4 procs | Loose graph → generic `Asset_*` API. |
| sound-effects/synth/band-pass-filter-sweep.skald.json | VALID (legacy) | exit 0, 7990 B, 4 procs | Loose graph → generic `Asset_*` API (the `.skald.json` suffix is a filename convention from the reorg pass, not proof of the modern Instrument-wrapped schema). |
| sound-effects/synth/classic-delay-puck.skald.json | VALID (legacy) | exit 0, 9834 B, 4 procs | Loose graph → generic `Asset_*` API. |

## Fixes applied

Only one file needed a fix:

- **`integration_demo/generated_audio/generated_audio.odin`** — regenerated
  from `_demo_project.json` against the current `codegen.exe`. The
  previously-committed copy predated support for `Sfx_feed_input` /
  `Layer_feed_input` and the wavetable/PRNG codegen helpers, so it was out
  of sync with what the backend now emits from the same source JSON.
  Re-verified with a full `odin build examples/integration_demo` (real
  entry point + miniaudio, not just a type-check).

No example `.json` needed a schema edit — every example that codegens
(61/62) also compiles cleanly (`odin check -no-entry-point` on the isolated
output package).

## Delete-candidates (not deleted — for the user to action)

| Path | Reason |
| --- | --- |
| `examples/instruments/winds/midi-setup/Sax2.json` | Duplicate of `sax3.json` in the same folder (legacy pre-Instrument-node original, superseded). |
| `examples/sound-effects/synth/AlarmPulse.json` | Duplicate of `Alarm.json` in the same folder (legacy pre-Instrument-node original, superseded). |
| `examples/sound-effects/cosmic/PulsarBeam.json` | Placeholder wiring an LFO into a Delay-node input port that has never existed in this codebase's node graph; hard codegen error. Author's own commit message called it out as unfinished ("some need work"). |

## Codegen bugs uncovered

None. The only codegen-stage failure (`PulsarBeam.json`) is caused by
invalid example data (a wire into a port the Delay node has never
supported), not a backend regression — the error message itself is
correct and informative. Everything else that passes codegen also passes
`odin check`, so there is no gap between "codegen exits 0" and "the
output actually compiles" anywhere in the current library.

One possible (very small) product gap surfaced by `PulsarBeam.json`: the
Delay node has no modulatable `delayTime` input port at all (only
`Reverb`/`Distortion`/`Mapper`/`GraphOutput`/`Delay` share the
"pass-through, no modulation inputs" `THROUGH_INPUTS` set in
`skald-backend/core/graph_validate.odin`). That's a feature-completeness
question for the node graph, not a bug in the audited sense, since the
graph validator correctly and clearly rejects the invalid wire rather than
silently misbehaving.

## Structure notes (not moved, per instructions)

- `examples/instruments/`, `examples/songs/`, `examples/sound-effects/` are
  the only import-facing groups and are already clean — no stray files
  found directly inside them.
- `examples/integration_demo/` sits outside the three import-facing groups
  (contains `_demo_project.json`, `main.odin`, `build_and_run.bat`,
  `README.md`, and the generated package). It is not an importable example
  — it's a from-scratch Odin consumer demo showing the generated API in a
  real game loop. Recommend it move to somewhere like `skald-backend/demo/`
  or a top-level `demo/`, since it isn't meant to be imported through the
  UI's example browser and its presence under `examples/` could confuse an
  import-all workflow.
- `examples/instruments/winds/midi-setup/` and
  `examples/instruments/drums/acoustic-electric/` are sub-groupings one
  level deeper than the rest of `instruments/*` — harmless (still under
  `instruments/`), just inconsistent with the flat `instruments/<family>/`
  pattern used elsewhere (`bass/`, `brass/`, `leads/`, `pads/`). No action
  needed, just noting the inconsistency.

## Discrepancies from the bug ticket's framing

The task brief mentioned stray `docs/`, `integration/` directories under
`examples/` and a `songs/loops/to implement/` directory containing a file
named with a long sentence. **None of these exist in this worktree.** Git
history shows the example library was already reorganized and pruned by
two prior commits on this branch — `3a77f57` "Organize importable example
library" and `e453fe1` "Remove obsolete examples and generated artifacts"
— both dated before this audit. Those commits renamed everything into the
current `sound-effects/`/`instruments/`/`songs/` layout and deleted a
`examples/misc/`, `examples/bug_testing/`, `examples/CodeGen_Test/`, and
several loose top-level scratch files. This audit reflects the example
library as it actually stands now; the ticket's specific examples of mess
were evidently already cleaned up before this pass started.
