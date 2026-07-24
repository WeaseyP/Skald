# BUG-AUDIO-ODDITIES-INVESTIGATION — code audit + deterministic offline rendering

Date: 2026-07-24. Scope: preview engine (`skald-ui`), Odin codegen (`skald-backend`),
generated DSP. Method: fault-class enumeration → code audit → numeric proof via the
acceptance harness / scratch renders (no listening involved; every claim below is
either a measured buffer property or a code-path trace).

All paths relative to the repo root. Line numbers as of branch
`worktree-agent-aec7c8204551f86fb` (post-fix).

## Summary table

| # | Fault class | Status | Severity |
|---|-------------|--------|----------|
| 1 | Voice steal = hard state reset → click | **CONFIRMED-FIXED** (this branch) | High |
| 2 | Queued hot-swap rebuild uses stale graph | **CONFIRMED-FIXED** (this branch) | High |
| 3 | Worklet set-param writes past 64-byte wasm name buffer | **CONFIRMED-FIXED** (this branch) | Medium |
| 4 | P-lock ↔ exposed-param collision silently kills live knobs | **CONFIRMED-OPEN** (proposed fix, not applied — see note) | High |
| 5 | Sequencer step clock (BUG-SEQ-RATE), incl. live BPM change | **CONFIRMED-FIXED** (verified + new regression) | — |
| 6 | Stereo/panner accumulation (BUG-PROJ-STEREO), mono broadcast gain | **CONFIRMED-FIXED** (verified) | — |
| 7 | NaN propagation in filters/FM/delay feedback | **CONFIRMED-FIXED** (verified) | — |
| 8 | Denormals in bus-domain effect state | THEORETICAL (low) | Low |
| 9 | Always-on tanh master saturation | By design — documented | Low |
| 10 | Sample-rate-dependent timbre (SVF cutoff cap, delay cap) | THEORETICAL | Low |
| 11 | Hot-swap cuts all sounding voices on every topology edit | By design — documented | Med (UX) |
| 12 | BPM edit while playing → rebuild + one-step timing slew | Minor — documented | Low |
| 13 | P-lock values persist until the next override | By design — documented | Low (UX) |
| 14 | Output-node audition triggers ALL instruments | Minor — documented | Low |
| 15 | Render quantum > 128 would read unfilled wasm memory | THEORETICAL | Low |
| 16 | Fractional integer params (voice_count 17.151) brick rebuilds | OPEN elsewhere — BUG-INTEGER-CONTROLS | — |

---

## 1. Voice steal was a hard state reset → audible click — CONFIRMED-FIXED

**Evidence.** `skald-backend/core/codegen.odin`, generated `<Foo>_note_on`: when all
voices are active the oldest is stolen and (pre-fix) every per-voice DSP state was
zeroed mid-waveform — oscillator/FM/wavetable phase, filter low/band, distortion
tone — and the ADSR snapped to Attack-from-zero.

**Proof (offline render).** Fixture: `skald-backend/tests/fixtures/steal_click.json`
(voice_count=1, sine → ADSR sustain 0.8 → out; glide 0). Hold A4 for ~0.5 s, then
`note_on(A5)` steals the voice. Measured at 48 kHz:

- pre-fix: sample-to-sample delta at the steal boundary **0.281** (signal value
  0.2815 → 0.0001) vs 0.057 max anywhere else — a full-band click ~5× the
  signal's own steepest slope, on *every* steal;
- post-fix: **0.046** at the boundary (0.2815 → 0.2471), *below* the normal max.

This fires whenever polyphony saturates — chords on low `voice_count`, long
releases stacking, dense sequences — i.e. exactly "intermittent weird noises".

**Fix.** `core/codegen.odin`:
- `codegen.odin:1050` — new per-ADSR voice field `adsr_<id>_attack_start`.
- `codegen.odin:1342-1360` — `note_on` captures the stolen voice's *live* envelope
  level per ADSR before `age`/`time_released` are zeroed (release stage is rescaled
  by the remaining release fraction; Idle/fresh capture 0).
- `codegen.odin:257` — Attack now ramps `attack_start → 1` instead of `0 → 1`
  (identical to old behavior for fresh voices, where `attack_start == 0`).
- `codegen.odin:1412` — per-voice DSP resets (phases, filter, tone) now run only
  for FRESH voices (`if !stolen`), so a stolen voice's waveform is continuous.
  Fresh voices keep the deterministic-retrigger reset.

**Regression test.** Acceptance fixture `steal_click`
(`skald-backend/acceptance/main.odin`, case `steal_click`): fails if the steal
discontinuity exceeds 0.12 absolute or 2× the elsewhere-max. Goldens regenerated.

## 2. Queued hot-swap rebuild built a STALE graph — CONFIRMED-FIXED

**Evidence.** `skald-ui/src/hooks/nodeEditor/useWasmAudioEngine.ts`,
`scheduleRebuild`. The debounced rebuild body and its `finally { … scheduleRebuild() }`
queued-rebuild recursion captured `buildModule` from the render that created that
`scheduleRebuild` instance. Sequence (proven by regression test, which failed
pre-fix):

1. edit A (nodes v1) → debounce → build v1 starts (slow);
2. edit B (nodes v2) → its debounce fires while v1 is in flight → `rebuildQueued`;
3. v1 resolves, posts swap, sets `lastSignature = sig_v1`; the queued rebuild
   re-runs through **v1's closure** → builds nodes **v1 again**;
4. end state: screen shows v2, audio plays v1, `lastSignature == sig_v1` so no
   further rebuild fires, and `previewStale` never shows. Permanent mismatch until
   an unrelated edit.

Intermittency matches real use: it needs an edit landing inside another edit's
build window (~200–500 ms).

**Fix.** `useWasmAudioEngine.ts:263-277,305` — `scheduleRebuild` is identity-stable
and always builds via `buildModuleRef.current` (updated every render), so debounced
*and* queued rebuilds serialize the latest on-screen graph.

**Regression test.** `skald-ui/src/tests/hooks/WasmEngineContract.test.tsx`,
"a rebuild queued during a slow in-flight build uses the LATEST graph": parks a
build, edits twice, asserts the final `buildWasmPreview` payload carries
`"frequency":330` (pre-fix it carried the stale 220).

## 3. Worklet set-param wrote past the wasm name buffer — CONFIRMED-FIXED

**Evidence.** Generated shim (`core/codegen.odin`, `generate_wasm_shim_code`):
`skald_name_buf: [64]u8`; `skald_set_param` rejects `name_len > 64` — but the
worklet (`skald-ui/src/hooks/nodeEditor/audioWorklets/skaldWasm.worklet.ts`) copied
`m.nameBytes` into wasm memory **before** that guard could run. A param name longer
than 64 UTF-8 bytes overwrote whatever wasm global follows the name buffer
(the audio block buffers / processor state live in the same globals region):
silent memory corruption → arbitrary audible garbage. Long names are reachable via
long node labels feeding collision-prefixed field names.

**Fix.** `skaldWasm.worklet.ts:111` — drop set-param messages whose encoded name
exceeds 64 bytes before touching memory.

**Regression test.** `skald-ui/src/tests/hooks/WasmWorkletGuard.test.ts` evaluates
the worklet source in a sandbox: pre-fix a 100-byte name wrote `65` at offset ≥ 64;
post-fix no byte past 63 is written and the call is not forwarded.

## 4. P-lock ↔ exposed-param name collision silently kills live knobs — CONFIRMED-OPEN

**Mechanism.** The backend counts "exposure" as `exposedParameters` **plus P-lock
targets** (`core/codegen.odin`, `effective_exposed_params`). On a name collision it
prefixes field names with the node label. The UI's instant set-param path
(`skald-ui/src/utils/projectSerializer.ts`, `getUniqueExposedParams` +
`topologySignature`) counts **only** `exposedParameters`.

So: node F1 exposes `cutoff`; any step P-locks `F2:cutoff` on another filter →
backend emits fields `F1_cutoff` / `F2_cutoff` and `set_param("cutoff")` returns
false; the UI still thinks `cutoff` is unique, so it (a) sends the bare name —
silently rejected — and (b) masks the value out of the topology signature — so
**no rebuild fires either**. The exposed cutoff knob does nothing while playing,
with zero feedback, until an unrelated edit forces a rebuild.

**Proof.** `scratchpad` fixture `plock_collision.json` (2 filters, F1 exposes
`cutoff`, one step P-locks `F2:cutoff`): generated `Asset_set_param` switch contains
only `case "F1_cutoff"` / `case "F2_cutoff"` — the UI's `"cutoff"` message falls
through to `return false`.

**Proposed fix (not applied).** Mirror `effective_exposed_params` in the UI: make
`getUniqueExposedParams`/`topologySignature` count P-lock targets from the
sequencer tracks so colliding names take the rebuild path (matching what the
backend will actually emit). Alternative backend-only fix: emit a bare-name alias
case dispatching to the single UI-exposed node when exactly one node exposes the
name via `exposedParameters`.

**Why not fixed here:** the live-param path is the same code the separate
Sax-multiple-filters bug (BUGS.md L171) lives in; that bug is owned by another
agent and both fixes touch `projectSerializer.ts` / the engine's instant path.
Documented to avoid a collision. Note the Sax symptom (multiple filters, changes
only land "on the next pass") is consistent with the sibling mechanism: UI-visible
collisions skip the instant path by design and ride the debounce+rebuild.

## 5. Sequencer step clock incl. live BPM change — CONFIRMED-FIXED (verified)

BUG-SEQ-RATE's counter fix (`core/codegen.odin`, `generate_sequencer_logic`:
fire-then-reload `samples_until_next_step` with `step_frac_acc` fractional carry)
verified numerically where it actually bites — 44.1 kHz where samples-per-step is
fractional:

- 120 BPM @ 44100: mean step spacing **5512.478** vs expected 5512.5 over 23 steps
  (individual steps alternate 5512/5513, worst single-step error 0.5 samples,
  zero long-run drift);
- `p.bpm = 240` written mid-render: next boundary onward spacing **2756.25 exactly**
  (worst single-step error 0.75 samples).

**Regression test.** New acceptance fixture `bpm_change`
(`skald-backend/acceptance/main.odin`, case `bpm_change`); the stub template
gained the uniform `bpm`/`current_step` transport fields.

## 6. Stereo/panner accumulation, mono broadcast — CONFIRMED-FIXED (verified)

`generate_graph_output_adds` (`core/codegen.odin:1904-1931`): a Panner source
routes its L/R pair once; every other source adds the same mono sample to both
channels once (standard mono→stereo broadcast, not a 2× gain: per-channel level
equals the mono level; a centered Panner is 0.707 per channel by the constant-power
convention). Instrument volume applies once at the asset boundary; the project mix
sums L and R independently. Covered by existing fixtures `dual_panner`,
`panner_mono`, `sine_220_pan_left` and the smoke DC/finite checks — all pass.

## 7. NaN propagation — CONFIRMED-FIXED (verified)

All historical NaN entry points carry point-of-use clamps in the generated code:
exponential FM `math.clamp(sum, -10, 10)` before `pow`; SVF cutoff
`clamp(…, 10, fs*0.16)` and damping `clamp(1/max(res,0.1), 0.05, 1.9-f)`
(`codegen.odin:337-339`); delay feedback `clamp(fb, 0, 0.95)`; reverb decay gain
capped at 0.95; Mapper degenerate-range guard. The `hostile_modulation` acceptance
fixture (±8-octave FM, ±30 kHz cutoff, ±40 resonance, decay 3.0, unison) asserts
every sample finite *and* second-half RMS > 0 (a NaN latch would leave permanent
silence) — passes. Additionally, voice-steal healing by state reset was removed for
stolen voices (finding 1), which is safe *because* these clamps hold; the fixture
still passes post-change.

## 8. Denormals in bus-domain effect state — THEORETICAL (low)

Voice-domain state stops being processed when the voice deactivates (`if
!voice.active do continue`), so per-voice filters cannot churn subnormals after
note death. Bus-domain state (`p.filter_*_low/band`, `p.dist_*_tone`,
`p.delay_*_buffer`) decays geometrically forever: e.g. delay feedback 0.5 reaches
f32-subnormal (~1e-38) after ~2 minutes of silence, after which each sample does
subnormal arithmetic (wasm must implement subnormals; x86 takes a microcode
assist). The state count is tiny (2 SVF vars + 1 delay read/write per node per
sample), so the projected cost is microseconds per 128-frame quantum — unlikely to
cause dropouts alone. **Proposal** (if crackle persists on low-end hardware): flush
bus-domain state to zero below 1e-20 when writing (one `abs(x) < 1e-20` guard per
stateful write in the generators; goldens regenerate).

## 9. Always-on tanh master saturation — by design, documented

`project_process` / `skald_process` apply `tanh(mix * master_volume)`
unconditionally (`codegen.odin:2361`, `:2564`). This is a *limiter by waveshaping*:
even moderate levels get odd-harmonic coloration (peak 0.4 → ~1.3% THD; peak 0.8 →
~7% compression). Preview and export share the exact policy, so nothing diverges —
but users comparing a solo'd oscillator against a reference sine will hear "subtle
extra harmonics" that are, in fact, the master stage. If neutrality below a
threshold is wanted, a linear-below-knee soft clipper (e.g. keep `x` for |x|<0.5)
is the follow-up; changing it retunes every existing project's loudness.

## 10. Sample-rate-dependent timbre — THEORETICAL

- SVF cutoff is clamped to `fs * 0.16` (`codegen.odin:339`, Chamberlin stability):
  7.06 kHz @ 44.1k vs 7.68 kHz @ 48k — a bright patch prepared in the preview
  (device rate, usually 48k) sounds slightly duller exported into a 44.1k game, and
  any cutoff above the cap is silently flattened.
- `MAX_DELAY_SAMPLES :: 96000` (`codegen.odin:19`) is a *sample* count: the max
  delay is 2.0 s @ 48k but 2.18 s @ 44.1k, and truncates below 2 s above 48k.
- The acceptance suite renders at 48k by default; the `bpm_change` case now also
  exercises 44.1k internally.

No action taken: behavior is deterministic per rate and clamped-stable; document in
user-facing docs when one exists.

## 11. Hot-swap cuts all sounding voices — by design, documented

`skaldWasm.worklet.ts` `instantiate()` builds a fresh wasm instance per swap: the
step clock is seek-restored (`skald_get_step`/`skald_seek`) but all sounding voices
and delay/reverb tails vanish at the swap boundary. Every non-exposed-param edit
while playing therefore audibly "hiccups" ~250–700 ms after the edit (debounce +
build). This is the architecture's contract (preview IS the generated DSP);
carrying voice state across differently-shaped processors is not generally
possible. Worth a UI hint the first time a swap interrupts audio.

## 12. BPM edit while playing — minor, documented

`bpm` participates in the topology signature (it's baked into `<Foo>_init` and
sequencer emission), so a BPM change mid-play is a full rebuild+swap (finding 11's
hiccup), and `skald_seek` restores `samples_until_next_step` measured in
*old-tempo* samples — one step of timing slew right after the swap. Self-corrects
at the next boundary. Related UX work is queued as BUG-BPM-SETUP-UX.

## 13. P-lock persistence — by design, documented

`generate_sequencer_logic` applies P-locks via `set_param` *before the note fires
and leaves them applied* (Elektron-style latch, per the code comment). A P-locked
`cutoff` on step 8 keeps that cutoff for steps 9..15 and every later loop until
another override or knob move. Users who expect per-step-only scoping will hear
"the patch changed by itself mid-loop". If per-step scoping is ever wanted, the
generator would need to emit a restore on the following step.

## 14. Audition fires ALL instruments — minor, documented

The Output node's test button posts `{type:'trigger', asset: -1}`
(`useWasmAudioEngine.ts`, audition effect), and the worklet fans `asset:-1` out to
*every* asset. Auditioning one instrument on a multi-instrument canvas sounds all
of them at C4 simultaneously — reads as "weird chord out of nowhere". Fix would be
resolving the Output node's owning instrument to an asset index.

## 15. Render quantum > 128 — THEORETICAL

`skald_process` clamps to `SKALD_WASM_BLOCK` (128) but the worklet copies
`out[0].length` samples from wasm memory. Today Web Audio's render quantum is
always 128; if Chromium ever honors `renderSizeHint` for worklets, frames past 128
would be stale/garbage memory. Guard is one `Math.min` in `process()` if it ever
becomes reachable.

## 16. Fractional integer params — OPEN elsewhere

`voice_count: 17.151` (Voice Count slider at 52.1%) makes every rebuild fail
JSON-unmarshal backend-side; the preview then *intentionally* keeps playing the
last good module (`previewStale`), which users experience as "knobs stopped doing
anything". Root-caused and queued as **BUG-INTEGER-CONTROLS-EMIT-FLOATS** (BUGS.md)
— not duplicated here.

---

## Verification runs (post-fix)

- `skald-backend`: `run_acceptance.bat` — **28/28 fixtures pass** (26 existing +
  `steal_click` + `bpm_change`).
- `skald-backend`: `run_golden.bat` — **27/27 goldens match** (regenerated once for
  the note_on/ADSR emission change; diff reviewed).
- `skald-ui`: `npx vitest run` — **71/71 tests pass** (68 existing + 3 new
  regressions; both new fault-class tests failed pre-fix, pass post-fix).

## Repro fixture paths

- Voice-steal click: `skald-backend/tests/fixtures/steal_click.json`
  (+ acceptance case `steal_click`).
- Step clock / live BPM: `skald-backend/tests/fixtures/bpm_change.json`
  (+ acceptance case `bpm_change`).
- Stale rebuild race: `skald-ui/src/tests/hooks/WasmEngineContract.test.tsx`
  ("…uses the LATEST graph…").
- Name-buffer overrun: `skald-ui/src/tests/hooks/WasmWorkletGuard.test.ts`.
- P-lock collision (finding 4, OPEN): `docs/investigations/fixtures/plock_collision.json`
  — run `codegen.exe -in:...plock_collision.json -out:out.odin -package:generated_audio`
  and inspect the emitted `Asset_set_param`: only `"F1_cutoff"`/`"F2_cutoff"` cases
  exist, so the UI's live `"cutoff"` message returns false.
