# C2 — How the nodes interact: does Skald compose?

## Verdict

No. Skald's nodes are individually well-implemented and individually documented, and they do not
compose into a correct patch. There is no gain structure at all: every stage in the chain is
unity-or-boost, voice summing is 1:1 unattenuated, and the only limiter in the system lives in
`project_process` — a proc the repo's own integration README explicitly tells games not to call.
I measured the manual's own canonical chain at palette defaults: one note peaks at 0.53, a
four-note chord at 1.61, an eight-note chord at 2.28, and 3.93 with the default Distortion added —
all on the per-asset path a game actually links against, with no clamp anywhere. Skald's own
flagship `four-bar-song.skald.json` runs its mix ~7.9 dB into the master `tanh`, and its Kick's
pitch envelope rides the +10-octave overflow clamp for 92% of its decay, emitting a 33 kHz alias
burst instead of a kick — a bug that exists only because ADSR, MIDI Input and Oscillator each
behave exactly as their own chapters describe. The Panner is a −3 dB pad when wired the
recommended way and a pan-controlled 0…−3 dB volume knob when wired any other way, so inserting a
Filter after a Panner makes the patch *louder*; `delay.md`'s "fake ping-pong" recipe provably
emits identical left and right samples. Exposure is emitted from one list and read from another
with nothing reconciling them, so P-locks can mint dead public API entries without the user ever
clicking "expose". A modulator that crosses the voice→bus boundary has its depth multiplied by
the live voice count and drops to zero between notes. `is_playing` cannot see a reverb tail, and
the documented pooling idiom truncates every one. And `.skald.json` has two readers that
disagree: the CLI silently discards the saved tempo, master volume, pattern length and every
single P-lock.

Fit to ship at 0.2? The node set is; the composition layer is not. Nothing here needs an
architectural rewrite — the mono-with-terminal-pan model is the right call for the domain and
Tier 2's F-B10-3 is correct to say so. What is missing is a *stated gain contract*, one
reconciliation pass in codegen, and about six small fixes. That is a week of work, not a quarter.
But shipping without it means shipping a tool whose default patch clips, whose flagship example
is broken, and whose own manual teaches at least one recipe that cannot work.

---

## Corrections to prior tiers

**F-A04-4 — one load-bearing sentence is factually wrong.** It states: *"The only place in the
entire generated codebase that multiplies an audio signal by a control signal is the ADSR's own
hardwired `input * envelope` line."* That is not true. `generate_gain_code`
(`skald-backend/core/codegen.odin:761-768`) emits `node_<id>_out = (input) * (gain_str)`, and
`gain_str` is `get_f32_param(..., "gain", "input_gain", 1.0)`, which for a modulated port returns
`"(base) + (mod)"` (`param_utils.odin:149-153`). The VCA *does* multiply audio by a control
signal; the defect is the additive **offset**, not a missing multiply. The finding's own
parenthetical concedes this. Downgrade the headline claim, keep the substance — which I
independently corroborated: all five instruments in `examples/songs/full/four-bar-song.skald.json`
hand-set their VCA to `gain: 0` precisely to defeat the offset, a workaround nothing in the UI or
either chapter mentions. That is the strongest possible argument for making `input_gain`
multiplicative.

**F-A08-3 — the suggested fix should be rejected, and the finding understates the problem.**
Its proposed remedy is to attenuate the direct mono-to-Output path by 0.7071 so "no Panner" and
"Panner at 0" match. Exactly **one** of 81 example patch files under `examples/` contains a
Panner (`grep -rl '"type": *"panner"' examples/`). That fix would re-level 80 shipped patches by
−3 dB to achieve parity with one. Fix the Panner, not the 80 patches (see F-C2-2). Separately,
the finding only measured Panner-vs-no-Panner; the larger and undocumented half is
Panner→Output vs Panner→anything-else, which differs by 3 dB in the *opposite* direction.

**F-B04-3 — suggested fix (b) should be rejected.** Propagating the Panner's stereo pair
implicitly through downstream consumers would double the state and code of every generator (Tier 2
F-B10-3 costs this correctly) and would still not fix the level discontinuity, because the pair
and the mono path have different totals. Option (a) plus a validator error is the right shape.

**F-B03-1 — correct but scoped too narrowly.** It says `_init` fails to clear Delay's ring buffer
and the voice array. True, and verified (`codegen.odin:1375-1383`, guard `if node.type != "Reverb"
do continue`). It misses that **all** bus-domain DSP state is equally unreset: a bus-domain
Filter's `p.filter_<id>_low/_band`, a bus Distortion's `p.dist_<id>_tone`, a bus LFO's phase and a
bus S&H's counter/value are declared at `codegen.odin:1192-1213` and written by nothing except
their own per-sample update. See F-C2-9.

**F-B02-1/F-B02-2 — correct, and I am generalizing rather than overturning them.** F-B02-1
diagnoses the exposure pass as "structurally blind to `bpmSync`". It is blind to *every*
codegen-time branch, not just that one; I proved a second live instance (Oscillator `frequency`
under `fixedPitch: false`) in emitted Odin. The fix belongs one level up from a `bpmSync` special
case. See F-C2-4, which supersedes F-B02-1's suggested fix while keeping its diagnosis.

**F-B08-1 — confirmed in full, and worse than stated.** It correctly identifies that the preview
computes `vol·tanh(x)` and the export computes `tanh(vol·x)`. What it does not say is that the
UI's default master volume is `0.8` (`app.tsx:82`), so **every project diverges out of the box** —
this is the default state, not an edge case. At the 2.28 peak I measured for the default canonical
patch, preview plays 0.784 and export plays 0.949: +1.7 dB and materially more saturation than
what was auditioned. Not re-filed; folded into F-C2-1.

No prior finding I relied on turned out to be fabricated. The `codegen.odin` citation drift every
Tier-1 agent reported is real and I hit it constantly; all line numbers in this document are from
the current file.

---

## Findings

### F-C2-1: Skald has no gain structure — every stage is unity-or-boost, and the only limiter lives in a proc the repo tells games not to call
- **kind**: architecture
- **area**: signal path, engine-wide (Oscillator → … → Output → project mix)
- **severity**: critical
- **confidence**: high
- **effort**: M
- **when**: 0.2-blocker
- **supersedes**: assembles F-A05-1, F-A05-8, F-A06-10, F-B05-2, F-B08-1, F-B10-7 into one account; does not retire any of them
- **evidence**: I built the codegen from source, generated fixtures, compiled them against a
  harness that calls the **per-asset** `Asset_process()` (the path
  `examples/integration_demo/README.md:7-8` tells games to use) and measured peak |sample| at
  48 kHz. Raw numbers are saved at
  `scratchpad\c2\MEASUREMENTS.txt` and `scratchpad\c2\REAL_PATCH_LEVELS.txt`.
  The chain, stage by stage, in current source:
  - Oscillator: `node_out = (unison_out / unison_count) * amplitude` (`codegen.odin:219`). Default
    `amplitude: 0.5` (`node-definitions.ts:85`).
  - ADSR: `node_out = (input) * envelope * depth * vel_scale` (`codegen.odin:292`) — pure
    multiply, max 1.0, no offset.
  - Filter: SVF, lowpass DC gain 1, but resonance peaks above unity (`codegen.odin:346-366`).
  - VCA: `node_out = (input) * ((knob) + Σmod)` (`codegen.odin:767`), default knob `0.75`.
  - Distortion: `node_out = dry*(1-mix) + toned_wet*mix` (`codegen.odin:615`) with **no makeup
    gain** anywhere in `generate_distortion_code` (`:585-617`).
  - Mixer: `mix_sum += src * level` (`codegen.odin:713`) — a plain weighted sum, identical in
    output to wiring both sources straight at Output (measured: both 1.90627).
  - Panner: constant-power pair, 0.7071 each at centre (`codegen.odin:727-729`).
  - GraphOutput: `output_left += v; output_right += v` (`codegen.odin:2041-2045`) — full gain, both
    channels, once per active voice, **no division by voice count anywhere in the file**.
  - Instrument: `return output_left * volume, output_right * volume` (`codegen.odin:2012`).
  - Project: `mixed += l` per asset, then `tanh(mixed * master_vol)` (`codegen.odin:2470-2478`) —
    the *only* limiter in the system, and it exists only inside `project_process`.

  Measured, per-asset path, no limiter:

  | patch | 1 note | 4 notes | 8 notes |
  |---|---|---|---|
  | manual's canonical Osc→Filter→ADSR→Out, all palette defaults, voiceCount 8 | 0.525 | **1.608** | **2.277** |
  | …plus default Distortion (drive 20, mix 0.5) | 0.707 | **2.446** | **3.930** |
  | …plus a centred Panner | 0.500 | **1.730** | **2.779** |
  | shipped `acid-303-squelch-lead` | 0.822 | **2.365** | — |
  | shipped `kick-sequenced` | 0.699 | **2.797** | — |
  | shipped `house-pluck-bass` | 0.800 | **1.620** | — |
  | shipped `supersaw-hypersaw-lead` | 0.437 | **1.047** | — |

  Whole-project through `project_process`, `examples/songs/full/four-bar-song.skald.json`: peak
  0.98499 after the `tanh`. Since `master_vol` is 1.0 on that path, the pre-limiter peak is
  `atanh(0.98499) = 2.442` — the master stage is compressing **7.9 dB** of peak as its normal
  operating condition. It is not a safety net; it is the mix bus.

  Also measured: `I_dist_unity` — a Distortion at soft/drive 1/mix 1, the nearest thing to a
  neutral setting, outputs `tanh(1.0) = 0.762`, i.e. it *attenuates* 2.4 dB. Sweeping drive changes
  level and tone together with nothing to compensate.
- **detail**: There is no point in the whole system where anyone decided what "0 dBFS" means.
  Sources default to half amplitude, the VCA defaults to 0.75, the Mixer defaults to 0.75 per
  channel, ADSR peaks at 1.0, Distortion moves level by an unpredictable amount, voices sum 1:1,
  instruments sum 1:1, and then one `tanh` — in a proc marked "test-harness convenience" in its own
  generated header comment (`codegen.odin:2313-2321`) — catches whatever falls out. Three separate
  gain structures actually exist and none of them agree:
  1. **Editor preview**: `tanh(Σ) × masterVolume`, the volume applied in JS *after* the limiter
     (`useWasmAudioEngine.ts:92-95` bakes `master_volume = 1.0`; the dock's `GainNode` follows the
     worklet).
  2. **`project_process`**: `tanh(Σ × masterVolume)` — volume *before* the limiter
     (`codegen.odin:2455-2456, 2477-2478`).
  3. **Recommended game integration**: `Σ` raw. No master volume (there is no setter — F-A05-8),
     no limiter, no clamp. `examples/integration_demo/main.odin:211-212` invents `* 0.6`.

  A game following the README therefore receives, from Skald's own default patch, samples peaking
  at 2.28–3.93 and hands them straight to the audio device. The sound designer will have
  auditioned something else entirely. And nothing in the editor shows a level: I searched
  `skald-ui/src` for any peak/clip/dBFS readout and found none — there is an oscilloscope and
  nothing else.
- **recommendation**: Decide the contract and write it down once, in Foundations. Concretely, for
  0.2, in this order:
  1. **Move the soft limiter into every generated `_process`.** Emit
     `return math.tanh(output_left * vol), math.tanh(output_right * vol)` at `codegen.odin:2012`
     (behind a per-instrument `limit: bool` defaulting true), so the per-asset path — the one games
     use — can never exceed ±1. `project_process` then stops needing its own and just sums. This
     is the single highest-value change in this document: ~10 lines.
  2. **Separate user gain from safety saturation** so master volume is not doing double duty as a
     level and an absent-field sentinel (which is what makes F-A05-1's `0 → 1.0` bug reachable at
     all). Emit `project_set_master_volume` / `<Asset>_set_volume` and apply them as plain
     multiplies *before* an independent limiter stage.
  3. **Fix the preview/export divergence** by making `master_volume` a live shim param instead of
     a JS `GainNode` — F-B08-1's suggested fix is right; adopt it.
  4. **Give Distortion an `outputGain`** defaulting to 1.0 (F-A06-10; purely additive, no patch
     changes) so drive can be A/B'd at matched level.
  5. **Do not auto-normalize the voice sum.** Dividing by active-voice count makes loudness depend
     on how many keys are down, which is worse than clipping. Document the 1:1 law and let (1)
     catch the overs.
  6. Add the meter (F-C2-12) so the user can see any of this.
- **manual impact**: `00-foundations.md` needs a new "Gain staging" section stating the contract
  (currently only line ~421 touches it, and states the pre-limiter master-volume placement as
  intentional — true for export, false for preview). `nodes/output.md` "The controls" /
  "What you hear as you sweep them" and Code-vs-intent note 6 are all rewritten by (2).
  `nodes/distortion.md` "Drive — what you hear as you sweep it" and Code-vs-intent note 6 flip
  from documenting a gap to documenting a feature. `nodes/gain.md` and `nodes/mixer.md` need the
  non-unity-default rationale F-B10-7 asks for.
- **migration**: (1) changes the audio of every exported asset that currently exceeds ±1 — which
  is the point, and it can only ever make output quieter, never louder. Gate on the new
  per-instrument `limit` flag defaulting **true** for new patches; for patches loaded without the
  field, also default true (they were clipping at the device anyway, so "was broken, now isn't" is
  the correct migration). (2) and (3) are additive. (4) is bit-identical at its default.

### F-C2-2: The Panner is a −3 dB pad at the end of a chain and a pan-controlled volume knob anywhere else — adding a node after a Panner makes the patch louder
- **kind**: code-bug
- **area**: Panner / GraphOutput / signal model
- **severity**: high
- **confidence**: high
- **effort**: S
- **when**: 0.2-blocker
- **supersedes**: extends F-A08-3 and F-B04-3 (rejecting both of their suggested fixes)
- **evidence**: `generate_panner_code` (`codegen.odin:727-733`) emits a constant-power pair and a
  mono downmix `node_<id>_out = (L + R) * 0.7071068`. `generate_graph_output_adds`
  (`codegen.odin:2038-2045`) routes the pair **only** when the source is a Panner wired directly
  into a GraphOutput; every other consumer reads the downmix. Measured peaks (per channel):

  | wiring | pan | L | R |
  |---|---|---|---|
  | osc → Output | — | 1.000 | 1.000 |
  | osc → Panner → Output | 0 | 0.707 | 0.707 |
  | osc → Panner → Output | +1 | 0.000 | 1.000 |
  | osc → Panner → **Filter** → Output | 0 | **1.000** | **1.000** |
  | osc → Panner → **Filter** → Output | +1 | **0.707** | **0.707** |

  The downmix's own source comment claims "0.7071*(L+R) is unity at center pan" — true, and that
  is exactly the problem. It is unity at centre and −3.01 dB at the extremes, so the value that
  continues downstream is a function of the pan knob.
- **detail**: Three distinct wrong behaviours fall out of one design:
  1. A centred Panner is 3 dB quieter than no Panner (F-A08-3, confirmed).
  2. Putting *anything* after the Panner makes the signal 3 dB **louder** than wiring the Panner
     straight to Output — the opposite direction, and nobody has flagged it. A user who has a
     working patch and adds "one more Filter" for tone gets a level jump and loses the pan
     simultaneously.
  3. Mid-chain, the pan knob becomes a 0…−3 dB volume control with an inverted-bathtub shape and
     no panning at all. Sweeping it does something audible, which is worse than doing nothing — the
     user gets feedback that the control "works".

  This is the sharpest single instance of the composition failure: `Panner` is correct, `Filter`
  is correct, and `Panner → Filter` is wrong in three ways at once.
- **recommendation**: Two one-line changes plus a validator rule.
  1. **Normalize the pan law to match the direct path**: emit `L = in*cos(θ)*1.4142136`,
     `R = in*sin(θ)*1.4142136`. Centre then equals the direct path exactly (1.0/1.0), hard pan is
     1.414 in one channel — the honest cost of constant power, and headroom is now covered by
     F-C2-1's per-asset limiter. Reject F-A08-3's inverse fix: only 1 of 81 example patches uses a
     Panner, so relevelling 80 patches to match one is backwards.
  2. **Make the mono fallback pan-independent**: `node_<id>_out = (input_str)` — the un-panned
     signal. Then a Panner mid-chain is a documented no-op instead of a hidden fader.
  3. **Warn (do not error) in `graph_validate.odin`** whenever a Panner's `output` port feeds
     anything other than a `GraphOutput`, naming the node: "pan is discarded here — a Panner must
     be the last node before Output."
- **manual impact**: `nodes/panner.md` — "The one rule that matters" (~line 35) and "Why you patch
  it this way" (~109-127) both need the level story added, not just the topology story;
  Code-vs-intent note 2 becomes a build warning instead of prose. `00-foundations.md`'s
  instrument-skeleton pseudocode needs the Panner exception stated explicitly (F-A08-4 /
  F-B10-3 already argue this).
- **migration**: (1) makes the single Panner-using example 3 dB louder at centre; (2) makes no
  shipped patch change (no example routes a Panner into a non-Output node). (3) is diagnostic only.

### F-C2-3: `delay.md`'s "fake ping-pong" recipe provably emits identical left and right samples
- **kind**: doc-bug
- **area**: Delay / Panner / Mixer — manual recipe vs emitted code
- **severity**: high
- **confidence**: high
- **effort**: S
- **when**: 0.2-blocker
- **evidence**: `docs/manual-source/nodes/delay.md:138` instructs: *"wire your source into two Delay
  nodes in parallel … then send each through its own Panner to hard left and hard right before
  summing at a Mixer. You get alternating left/right repeats."* I built exactly that patch
  (`scratchpad\c2\fx\pingpong.json`) and generated it. The emitted Odin
  (`scratchpad\c2\pingpong.odin:374-396`):
  ```
  node_pL_out_left  = ((node_d1_out)) * math.cos(pan_angle_pL);
  node_pL_out_right = ((node_d1_out)) * math.sin(pan_angle_pL);
  node_pL_out = (node_pL_out_left + node_pL_out_right) * 0.7071068;
  ...
  mix_sum_mix += node_pL_out * (f32(1.000000000));
  mix_sum_mix += node_pR_out * (f32(1.000000000));
  node_mix_out = mix_sum_mix;
  output_left  += node_mix_out
  output_right += node_mix_out
  ```
  At pan −1 the pair is `(in, 0)`; at pan +1 it is `(0, in)`; the downmix is `0.7071·in` in both
  cases. The two Panners produce **numerically identical** values, and `output_left` and
  `output_right` receive the same variable. The result is a mono double-echo at −3 dB.
- **detail**: This is not a stale citation or an off-by-one; it is a worked recipe, presented as
  "what works", that cannot work by construction — and `panner.md`'s own Code-vs-intent note 2
  already documents the mechanism that defeats it. Two chapters of the same manual contradict each
  other on a checkable audio outcome. A user will build this, hear mono, and conclude their Panner
  or their ears are broken. It is also the clearest possible demonstration that the manual is
  written per-node and never validated per-patch.
- **recommendation**: Delete the recipe. Replace it with the only shape that actually works today:
  two Delays → two Panners → **two separate GraphOutput nodes** (both sum into the same
  `output_left/right`, and each Panner's pair survives because each feeds a GraphOutput directly —
  `codegen.odin:2038-2040`). Then add the F-C2-2 validator warning so the broken shape is caught at
  build time rather than by ear. As a general process fix: every "recipe" in the manual that spans
  more than two nodes should be checked in by generating it and asserting on the emitted code, the
  way `tests/golden/` already does for single-node behaviour.
- **manual impact**: `nodes/delay.md`, "Going further" → "Fake ping-pong with two Delays and two
  Panners" (line 138) — rewritten. `nodes/panner.md` Code-vs-intent note 2 gains a cross-reference.
- **migration**: none — no shipped patch implements the recipe.

### F-C2-4: Exposure is emitted from one list and read from another, with nothing reconciling them — and P-locks mint dead public parameters without the user ever clicking "expose"
- **kind**: architecture
- **area**: exposure resolution × codegen-time branching × sequencer P-locks
- **severity**: high
- **confidence**: high
- **effort**: S (the check) / M (the full fix)
- **when**: 0.2-blocker
- **supersedes**: generalizes F-B02-1, F-B02-2, F-A03-1, F-A03-2, F-A07-4 — keeps their diagnoses, replaces their fix site
- **evidence**: Two independent passes decide what a parameter is. `effective_exposed_params`
  (`codegen.odin:974-999`) unions the node's `exposedParameters` with every P-lock target and hands
  the result to the Phase-3 resolver, which emits a struct field, a clamped typed setter, a
  `_PARAMS` row and a `set_param` case. Separately, each generator decides at **codegen time**
  whether it will read that field at all — `bpm_sync_seconds_expr` (`:35-58`) replaces the LFO/S&H/
  Delay rate outright, `get_bool_param(node,"fixedPitch")` (`:137-139`) decides whether the
  Oscillator ever looks at `frequency`, the Filter `type` and Distortion `shape` switches are
  resolved in Odin-land, and `generate_mixer_code` skips any channel with no wire (`:707`). Nothing
  compares the two.

  Proved on a fixture (`scratchpad\c2\plock_dead.odin`) with `fixedPitch: false`, `bpmSync: true`,
  and P-locks on `Osc:frequency` and `Wob:frequency`:
  ```
  Osc_frequency: f32,          // struct
  p.Osc_frequency = 440.0      // init
  Asset_set_Osc_frequency ...  // typed setter, clamped 20..20000
  {"Osc_frequency", 20.0, 20000.0, 440.0, "Hz"},   // Asset_PARAMS
  case "Osc_frequency", "osc::frequency":          // set_param + get_param
  Asset_set_param(p, "Osc_frequency", 220.0)       // emitted every sequencer loop
  ```
  `grep` over the whole file: `p.Osc_frequency` and `p.Wob_frequency` appear **only** in those
  places. The DSP reads `voice.current_freq` and `(1.0 / ((60.0/p.bpm) * 0.5))`. Second instance,
  on the exact recipe the manual recommends: `delay.md:136` says *"Sequencer P-locks are your
  modulation"* for Delay; a P-lock on `delayTime` with `bpmSync: true` emits
  `Asset_set_param(p, "delayTime", 0.05)` every loop while the delay reads
  `int(clamp(((60.0/p.bpm)*0.5)*sample_rate, ...))` (`scratchpad\c2\pingpong.odin:407` vs the D1
  delay block).
- **detail**: F-B02-1 correctly identified the mechanism but scoped the fix to `bpmSync`. The
  blindness is general: *any* parameter resolved by a codegen-time branch can be exposed and become
  a lie. `fixedPitch` is a second live instance today; Filter `type`, Distortion `shape` and unwired
  Mixer channels are three more waiting. Worse, F-B02-2 is right that P-locks reach this — and the
  consequence is that a user can create a dead entry in the game-facing public API **without ever
  touching the expose UI**, just by dragging a value in the step editor. The generated `_PARAMS`
  table, which `00-foundations.md:367` sells as "the contract for whoever writes the gameplay
  code", advertises parameters that do nothing.
- **recommendation**: Add a reconciliation pass, not another special case. After
  `generate_processor_code` has built the instrument body but before it is returned, scan the
  emitted body for `p.<field_name>` for every entry in `stable_resolutions`. Any field that never
  appears is structurally dead: **hard-error** if it came from a P-lock (matching the existing,
  excellent `collect_plock_targets` error style at `codegen.odin:936-949`), and **warn on stderr +
  omit it from `_PARAMS`** if it came from the expose checkbox. This is ~20 lines, catches every
  present and future instance including ones nobody has thought of, and cannot go stale. Then take
  F-B02-6's runtime-branch redesign for `bpmSync` as the real fix, at which point the reconciler
  stops firing for that case and stays as a permanent regression guard.
- **manual impact**: `nodes/lfo.md`, `nodes/sampleHold.md`, `nodes/delay.md` and
  `nodes/oscillator.md` Code-vs-intent notes on dead exposed parameters all become "the build now
  refuses / warns". `nodes/delay.md:136`'s "P-locks are your modulation" paragraph must say which
  Delay parameters are P-lockable under sync (`feedback`, `mix`) and which are not (`delayTime`).
- **migration**: A patch with an exposed-but-dead parameter starts warning; a patch with a *P-locked*
  dead parameter starts failing the build. I checked the corpus: no shipped `.skald.json` currently
  has a P-lock on a sync-shadowed parameter (in fact the CLI drops all of them — see F-C2-7), so
  nothing under `examples/` breaks. Ship the hard-error for P-locks and the warning for checkboxes.

### F-C2-5: A modulator that crosses the voice→bus boundary is multiplied by the live voice count and collapses to zero between notes
- **kind**: code-bug
- **area**: voice/bus domain split × modulation
- **severity**: high
- **confidence**: high
- **effort**: M
- **when**: 0.2-blocker
- **evidence**: The cross-domain bridge is keyed purely by emitted variable name
  (`codegen.odin:1074-1088`) with no notion of whether the edge carries audio or control. Inside the
  voice loop it emits `<var>_vsum += <var>` (`:1907`) — and the loop begins
  `if !voice.active do continue`. The bus block then does `<var> := <var>_vsum` (`:1950`). Generated
  proof (`scratchpad\c2\crossdomain.odin`, LFO amplitude 900 into a post-Delay Filter's
  `input_cutoff`):
  ```
  node_lfo_out_vsum: f32 = 0.0
  for v_idx in 0..<4 { if !voice.active do continue
      node_lfo_out = math.sin(voice.lfo_lfo_phase) * (f32(900.000000000));
      node_lfo_out_vsum += node_lfo_out }
  { node_lfo_out := node_lfo_out_vsum
    cutoff_c_filt: f32 = math.clamp(f32((f32(1000.0)) + (node_lfo_out)), 10.0, sample_rate*0.16); }
  ```
  So: 0 voices → no wobble at all (cutoff pinned at 1000 Hz); 1 voice → ±900 Hz; 4 voices →
  ±3600 Hz, and because per-voice LFO phase is never reset (Tier 2 F-B03-2, verified), the four
  summed sines are at arbitrary relative phases — the modulation *waveform* is history-dependent,
  not just its depth.
- **detail**: Summing across voices is exactly right for an audio edge (that is what the voice sum
  *is*) and exactly wrong for a control edge, and codegen cannot tell them apart because the
  bridge is keyed by variable name. `compute_bus_domain` already knows this class of problem
  exists: it hard-errors when a `MidiInput` crosses into the bus domain, with the reasoning
  *"MidiInput's port outputs are loop-local; feeding them into the bus domain has no per-voice
  meaning either"* (`codegen.odin:105-116`). That reasoning applies verbatim to an LFO, an S&H, a
  Mapper or a Noise node feeding a bus-domain modulation port — the code states the principle and
  then applies it to exactly one node type. The user-visible result is a wobble that stops between
  notes and gets four times deeper on a chord, with no warning and nothing in any chapter about it.
- **recommendation**: Two changes.
  1. **Hoist**, don't sum. In `compute_bus_domain`, after the downstream pass, promote any
     *stateless-per-voice-context* modulation source (LFO, SampleHold, Noise, Mapper) whose
     consumers are **all** bus-domain into the bus domain itself. It then runs once per sample with
     one phase, which is what the user drew. This is the right fix and it is local to one proc.
  2. For sources that genuinely have voice-domain consumers *as well*, the `_vsum` bridge is
     unavoidable — so **error there**, reusing the MidiInput message shape: "instrument %q wires
     %s (%s) into a post-effect modulation port while it is also used per-voice; its value would be
     summed across active voices. Duplicate the node, or move the effect."
- **manual impact**: New content — nothing currently documents cross-domain modulation at all.
  `nodes/delay.md` and `nodes/reverb.md` "What it looks like in Skald" (the bus-domain explanation)
  each need a paragraph; `00-foundations.md`'s voice/bus section needs the rule stated once.
- **migration**: (1) changes the sound of any patch that currently modulates a bus-domain parameter
  from a voice-domain source — the change is from "N× depth, silent between notes" to "1× depth,
  always running", i.e. from broken to correct. I found no shipped example doing this, so the
  corpus is unaffected; verify with a grep over `examples/` for a modulation edge crossing a
  Delay/Reverb before landing (2) as a hard error.

### F-C2-6: `is_playing` is voice-domain only — the documented pooling idiom truncates every Delay and Reverb tail
- **kind**: code-bug
- **area**: generated API × bus-domain state lifetime
- **severity**: high
- **confidence**: high
- **effort**: S
- **when**: 0.2-blocker
- **evidence**: `codegen.odin:1651-1662` emits
  ```
  <Foo>_is_playing :: proc(p) -> bool {
      if p.playing do return true
      for i in 0..<N { if p.voices[i].active do return true }
      return false }
  ```
  No reference to any Delay/Reverb buffer or to a tail countdown. Meanwhile the bus block runs
  unconditionally after the voice loop (`codegen.odin:1933-1936`, "Runs regardless of voice.active,
  so echo/reverb tails keep ringing after the last voice dies") — verified in generated output
  (`scratchpad\c2\tail.odin`): the `// --- Bus effects (once per sample, post voice sum) ---` block
  is outside the `for v_idx` loop entirely. The repo's own integration guide tells games to use
  this as the lifecycle signal: `examples/integration_demo/README.md:88` —
  `if !ga.Sfx_is_playing(&app.sfx) { // safe to re-trigger or release the slot }`; and
  `main.odin:143-150` polls it, then sleeps a hand-tuned 200 ms "so the tail of the envelope
  reaches the speakers".
- **detail**: A one-shot SFX with a 6-second Reverb reports `is_playing == false` the sample after
  its last voice goes idle. A game that pools processors on that signal — the pattern the README
  hands them — cuts the tail dead. Skald already knows this is wrong: it went to real trouble to
  make the bus block outlive the voices, and then shipped a lifecycle predicate that cannot see the
  thing it protected. The 200 ms sleep in the demo is the symptom, and it is not enough for the
  default 3-second Reverb decay. This is the state-lifetime version of the same disease as
  F-C2-5: voice-domain and bus-domain are two different lifetimes and only one of them is modelled
  in the API.
- **recommendation**: Track a bus-tail countdown on the processor. At codegen time compute a
  conservative tail length per instrument (`max` over Delay nodes of
  `delayTime / (1 - feedback)` capped at the buffer, and over Reverb nodes of `decay + preDelay`),
  emit it as a constant, and add `p.bus_tail_samples: u64` that is reset to that constant every
  sample any voice is active and decremented otherwise. `is_playing` then returns
  `p.playing || any_voice_active || p.bus_tail_samples > 0`. ~15 lines, no API change, and it makes
  the README's advice true. Cheaper stopgap if that is too much for 0.2: emit
  `<Foo>_TAIL_SECONDS` as a constant and document that the host must wait it out — but that is
  strictly worse and pushes the problem onto every integrator.
- **manual impact**: No chapter documents the generated API at all (F-B05-8), so this is new
  content for whatever integration chapter gets written. `nodes/reverb.md` and `nodes/delay.md`
  "Going further" should each note the lifecycle implication.
- **migration**: Purely additive to generated code; no saved patch changes.

### F-C2-7: `.skald.json` has two readers that disagree — the CLI silently discards the saved tempo, master volume, pattern length and every P-lock
- **kind**: code-bug
- **area**: serialization × codegen CLI
- **severity**: high
- **confidence**: high
- **effort**: S
- **when**: 0.2-blocker
- **evidence**: The editor writes a `session` block on save and restores it on load
  (`skald-ui/src/hooks/nodeEditor/useFileIO.ts:76`, `:119-131`), and `buildProjectData` threads
  those values into the project JSON it hands the backend
  (`projectSerializer.ts:107-117`). But when the CLI is fed the same `.skald.json` directly it
  takes the bare-graph path, and `build_project_from_graph` hardcodes:
  ```
  project.bpm = 120.0            // json.odin:298
  project.master_volume = 1.0    // json.odin:299
  ```
  with `pattern_steps` left at 0. It never looks at `session`. Verified on
  `examples/instruments/bass/sub-808-glide-bass.skald.json`, whose `session` is
  `{ "bpm": 140, "patternSteps": 16, "masterVolume": 0.75 }`: the generated file contains
  `p.bpm = 120.000000000` and `math.tanh(mixed_left * 1.000000000)`.
  Separately, `Note_Event.patch_overrides` (`types.odin:19`) never matches the editor's
  `patchOverrides` key, so **every P-lock in every editor save is silently dropped by the CLI**.
  Verified: `examples/songs/loops/geowars/hat-static.skald.json` carries
  `"patchOverrides": {"decay": 0.12}` on two steps; the generated Odin contains zero
  `set_param` calls in its `_process_sequence`. The project-format fixture
  `tests/fixtures/plock_step.json` uses `patch_overrides` (snake) and its golden *does* emit
  `Asset_set_param(p, "cutoff", 8000.0)` — so the mechanism works, just not for the format users
  actually save.
- **detail**: Two programs read the same file and produce different audio from it. Anyone using the
  documented CLI (`skald-backend/main.odin`'s own `-in:`/`-out:` flags, `examples/AUDIT.md`'s
  compile sweep, `build_and_run.bat`, any CI script, any batch "export all examples" job) gets a
  patch at the wrong tempo, at unity master, with all step automation removed — and no warning of
  any kind. `examples/AUDIT.md`'s per-file verdicts were produced this way, so its "VALID" marks do
  not certify what the editor would actually export. This also means the `.skald.json` save format
  is not a self-contained description of a sound, which undercuts the whole premise of the example
  library.
- **recommendation**: Make the bare-graph path read the same data the editor writes. In
  `build_project_from_graph`, parse the `session` object (`bpm`, `masterVolume`, `patternSteps`)
  and use it, falling back to the current constants only when absent. Add
  `patchOverrides` as a second accepted key on `Note_Event` (Odin's unmarshaller matches field
  names, so this needs an explicit alias field plus a merge, exactly as `Graph_Raw` already does
  for `sequencerTracks` vs `sequencer_tracks` at `types.odin:112-114`). Better still: make the
  editor's save format and the codegen input format the *same* format, or emit a loud warning when
  the CLI takes the legacy bare-graph path at all — right now the fallback is silent
  (`json.odin:309-326` calls it "legacy" in a comment and says nothing on stderr).
- **manual impact**: `examples/AUDIT.md` needs regenerating after the fix and a note that its
  earlier verdicts were produced through the lossy path. `50-bass-teardown.md` and
  `60-complexity-ladder.md` both invite the reader to inspect the JSON to learn a patch's tempo —
  which currently only the editor honours.
- **migration**: Pure gain — every existing `.skald.json` starts generating at its authored tempo,
  master volume and step automation. Two shipped patches
  (`kick-sequenced`, `snare-sequenced`, `pad-sequenced`, `hat-static`) go from "P-locks dropped" to
  "P-locks applied", which changes their exported audio to what the editor already plays.

### F-C2-8: The precedence rules for P-lock / exposed parameter / modulation exist, are coherent, are sticky, and are documented nowhere
- **kind**: design
- **area**: modulation composition × sequencer × generated API
- **severity**: medium
- **confidence**: high
- **effort**: S (document) / M (add arbitration)
- **when**: 0.2-desirable
- **evidence**: Traced end to end and confirmed in emitted code
  (`scratchpad\c2\plock_dead.odin:365`), for a Filter cutoff that is simultaneously exposed,
  P-locked and fed by two modulators:
  ```
  cutoff_c_filt: f32 = math.clamp(f32((p.cutoff) + (node_map2_out) + (node_lfo2_out)), ...)
  ```
  The rules that actually exist:
  1. **Base** is `p.<field>` if the param is exposed (explicitly or by P-lock,
     `codegen.odin:974-999`), otherwise a baked literal (`param_utils.odin:105-132`).
  2. **Modulation is added on top**, one `+ (src)` per wire, unscaled
     (`param_utils.odin:149-153`). Two modulators sum; a Mapper feeding a Mapper chains two
     clamped lerps.
  3. **Game `set_param` and sequencer P-locks write the same field** — the P-lock is literally
     `<Foo>_set_param(p, "<field>", v)` emitted into `_process_sequence`
     (`codegen.odin:2188-2195`).
  4. **P-locks are sticky.** The code comment says so plainly ("they persist until the next
     override — Elektron-style", `:2160-2165`) and there is no restore. A lock on step 4 is still
     in force on step 5, 6, 7 and on the next loop.
  5. **A codegen-time mode branch beats all of the above** — see F-C2-4.
- **detail**: Rules 1, 2 and 4 are individually defensible. Rule 3 is not arbitrated at all: a game
  that sets `cutoff` from gameplay (distance, tension, a settings slider) and a sequencer that
  P-locks `cutoff` on any step are fighting over one `f32`, and the sequencer wins permanently on
  the next locked step. There is no way for game code to detect this, no "locked" flag, no
  precedence, no restore. And rule 4's stickiness means one P-lock anywhere in a pattern makes the
  parameter permanently sequencer-owned. Nothing in 21 manual chapters states any of this —
  `50-bass-teardown.md:455` defines "P-lock" in one line of glossary and that is the entire
  coverage. `delay.md:136` actively recommends P-locks as the way to automate a Delay without ever
  mentioning that the value never comes back.
- **recommendation**: For 0.2, **document it** — one short "Who wins" section listing the five
  rules above, in whatever chapter owns the sequencer (the editorial plan already wants one). Then
  the cheap arbitration fix: emit the *unlocked* authored value as a restore on the first step that
  follows a lock, so a P-lock lane behaves like automation with a defined resting state rather than
  a latch. That is a small addition to `generate_sequencer_logic` (track which fields were locked
  anywhere in the pattern; emit a reset for the unlocked ones at step 0). Leave game-vs-sequencer
  contention alone for 0.2 but say in the integration docs that a P-locked parameter is
  sequencer-owned and game code should not write it.
- **manual impact**: New sequencer chapter section. `nodes/delay.md` "Sequencer P-locks are your
  modulation" needs the stickiness caveat. `00-foundations.md` "What expose does" should note that
  exposure now has three writers, not one.
- **migration**: Documentation is free. The step-0 restore changes the audio of the four shipped
  P-locked patches on their second and subsequent loops — currently the lock latches, which is
  almost certainly not what those patches intend (`hat-static` locks `decay: 0.12` on steps 2 and 6
  and never restores the authored 0.045). Ship it as the fix, not as an opt-in.

### F-C2-9: Bus-domain DSP state is reset by nothing — not note events, not `_init`
- **kind**: code-bug
- **area**: state lifetime (bus domain)
- **severity**: medium
- **confidence**: high
- **effort**: S
- **when**: 0.2-desirable
- **supersedes**: widens F-B03-1 and F-A07-3
- **evidence**: `codegen.odin:1192-1213` declares processor-side state for every bus-domain node —
  `filter_<id>_low/_band`, `lfo_<id>_phase`, `noise_<id>_rng` + pink history, `sh_<id>_counter/
  _rng/_current_value`, `dist_<id>_tone` — in addition to Delay/Reverb buffers at `:1180-1189`. The
  per-note reset switch (`:1477-1501`) opens with `if bus_nodes[node.id] do continue`, so none of
  it is touched by `note_on`. `_init`'s only cleanup loop is `:1375-1383`, guarded
  `if node.type != "Reverb" do continue`, and clears three fields. Everything else — the Delay ring
  buffer and write index, and every one of the bus-domain node fields above — survives a re-`init`.
  The loop's own comment claims the opposite: *"so calling init on an existing processor has the
  same reset semantics as initializing a fresh one."*
- **detail**: Tier 2 F-B03-1 found the Delay-buffer half and the untouched voice array. The
  bus-domain node state is the third category and it is the one that matters most for the pooling
  use case: a game that reuses a Processor for a new sound gets the previous sound's bus filter
  integrator, its distortion tone-filter memory, its S&H held value and its LFO phase. Combined
  with F-C2-6 (the tail the API cannot see), the practical shape is: pooling a Skald processor is
  unsafe, and nothing says so.
- **recommendation**: Make `_init` true to its comment. Widen the `:1375-1383` guard to
  `if node.type != "Delay" && node.type != "Reverb" do continue`, add a parallel loop over
  `bus_nodes` zeroing each declared field, and add `p.voices = {}` before the RNG reseed. All three
  are mechanical and reuse the existing emission loops. Then add one acceptance test that
  `_init`s a processor twice with a note in between and asserts bit-identical output — no test
  currently exercises double-init at all.
- **manual impact**: New integration-chapter content (`_init` semantics are undocumented today).
- **migration**: None — `_init` on a fresh `new()` allocation is unaffected because Odin zeroes
  fresh memory.

### F-C2-10: The manual teaches two mutually exclusive canonical chains, and the difference is audible
- **kind**: doc-bug
- **area**: manual coherence × gain staging
- **severity**: medium
- **confidence**: high
- **effort**: S
- **when**: 0.2-desirable
- **evidence**: Four chapters state a "canonical chain" and they do not agree on where the
  amplifier goes:
  - `nodes/gain.md:126`: *"The canonical chain is source → tone-shaping → VCA → output … the VCA is
    the last thing before the destination."*
  - `nodes/adsr.md:101`: *"The canonical chain is sources → filter → ADSR → (distortion / drive) →
    output."*
  - `nodes/instrument.md:178`: *"Oscillator → Filter → ADSR → Distortion → Output."*
  - `nodes/filter.md:134`: *"Oscillator → Filter → ADSR (as VCA) → output."*
  - `00-foundations.md:95`: *"source → filter → amplifier."*
- **detail**: This is not a wording quibble, it is a gain-staging decision with an audible outcome.
  Amp-before-distortion (adsr.md, instrument.md) means the distortion sees a level that swings from
  0 to full over the envelope, so the drive amount is envelope-dependent: the attack is dirty, the
  tail cleans up, and the note's timbre changes as it decays. Amp-after-distortion (gain.md) means
  constant drive and a clean envelope. Both are legitimate; they are different instruments. I
  measured the difference on the default patch: the same chain with the default Distortion inserted
  before the output goes from 0.525 to 0.707 peak on one note, and the Distortion's contribution
  scales entirely with what the envelope hands it. A reader following two chapters in the same
  manual builds two different sounds and has no way to know which was intended. Compounding it,
  `gain.md` is the chapter that also teaches the VCA idiom whose additive-offset trap
  (F-A04-4) requires a workaround the manual never states — one which all five instruments in
  `four-bar-song.skald.json` apply by hand (`gain: 0` on every VCA).
- **recommendation**: Pick one and say why. My recommendation: make **ADSR-direct** the taught
  canonical (source → filter → ADSR → colour → Output), because it is what the shipped corpus
  overwhelmingly does, it needs no workaround, and its multiply semantics are unambiguous. Keep the
  VCA for the cases it is genuinely for — summing several control sources into one gain, or letting
  game code ride the level — and fix `input_gain` to be multiplicative (F-A04-4 option b) so the
  two nodes finally agree on what "scale audio by a control signal" means. Then state the one
  canonical chain in `00-foundations.md` and have every node chapter link to it rather than
  restating its own variant.
- **manual impact**: `nodes/gain.md` "Why you patch it this way" (line 126) and the whole "Try it"
  walkthrough; `nodes/adsr.md:101`; `nodes/instrument.md:178`; `nodes/filter.md:134`;
  `00-foundations.md:95`. One canonical statement, four cross-references.
- **migration**: Documentation only, unless F-A04-4's multiplicative change lands — see its own
  migration note.

### F-C2-11: The flagship `four-bar-song` example is audibly broken in two ways, and both are pure composition failures
- **kind**: code-bug
- **area**: example corpus × MIDI Input × ADSR × Oscillator
- **severity**: high
- **confidence**: high
- **effort**: S (fix the patch) / M (prevent the class)
- **when**: 0.2-blocker
- **evidence**: Generated from the shipped file with the repo's own prebuilt
  `skald-ui/skald_codegen.exe` (output saved at `scratchpad\c2\four.odin`).
  1. **The Kick is a 33 kHz alias burst, not a kick.** Wiring:
     `midiInput.gate → adsr("Pitch Env", depth 120).input`, `adsr → oscillator.input_freq`.
     Emitted:
     ```
     node_3_out = ((node_1_out_gate)) * envelope * (f32(120.000000000)) * vel_scale_3;
     detuned_freq: f32 = ((voice.current_freq) * math.pow(2.0, math.clamp(f32(node_3_out), -10.0, 10.0))) * ...
     ```
     `input_freq` is an **exponent in octaves** (`codegen.odin:159-163`); the authored depth of 120
     is plainly meant as "120 Hz of pitch drop". `node_3_out` exceeds 10 for any envelope value
     above 0.083, so the oscillator sits pinned at the +10-octave clamp (1024×) for ~92% of the
     80 ms decay: note 24 (32.7 Hz) renders at ~33.5 kHz, aliasing at 48 kHz, then snaps to the
     fundamental at the very end.
  2. **Lead, Bass and Pad all play doubled intervals.** All three wire
     `midiInput.pitch → oscillator.input_freq`, producing
     `voice.current_freq * math.pow(2.0, math.clamp(f32(node_1_out_pitch), -10.0, 10.0))`
     (8 occurrences in the generated file). Since `current_freq` already encodes the note and
     `pitch` is `(note-69)/12`, the result is `440·2^(2(note−69)/12)` — every octave becomes two
     octaves. `midiInput.md`'s Code-vs-intent note 1 already logs this shape as a "blocker" for
     `sax3.json`; nobody noticed it is also in the flagship multi-instrument song.
- **detail**: Neither bug is a node bug. MIDI Input emits exactly the V/oct signal its chapter
  describes; ADSR multiplies exactly as its chapter describes; Oscillator exponentiates exactly as
  Foundations describes. The failure is that no node knows what units its neighbour speaks, and no
  validation exists at the join. The `math.clamp(±10)` on the exponent — added, per its own
  comment, because an over-hot modulation sum used to NaN the voice — is the engine silently
  absorbing exactly this mistake rather than reporting it. This is the single best argument in the
  whole audit that per-node correctness does not add up to patch correctness: this file is the
  repo's headline demo, it is cited in three manual chapters, and it has been broken through
  however many review rounds.
- **recommendation**: Three things.
  1. **Fix the patch**: delete the three `MidiInput.pitch → input_freq` wires (the manual's own
     "Try it" already tells users to do this), and change the Kick's Pitch Env depth from 120 to
     ~1.5 (about an octave and a half of drop) — or better, route it through a Mapper so the units
     are visible on the canvas.
  2. **Make the clamp loud.** When the *authored, unmodulated* value of an exponent-port
     contribution can exceed ±10 at full envelope, emit a build warning naming the node and the
     port. Cheap static check; catches the whole class.
  3. **Warn on `MidiInput.pitch → <oscillator-family>.input_freq` with no intervening node** in
     `graph_validate.odin` — F-A05-5 already proposes this and it is worth doing purely on the
     evidence that Skald's own flagship content contains it three times.
  Add these two example files (`four-bar-song`, `sax3`) to CI once fixed — F-B11-1 correctly notes
  the corpus is never exercised, and this is what that costs.
- **manual impact**: `nodes/gain.md:126` cites `four-bar-song.skald.json:15-19` as the model of
  correct chain order — the citation survives but the file needs fixing first.
  `docs/manual-source/nodes/midiInput.md` Code-vs-intent note 1 must list `four-bar-song` alongside
  `sax3.json`.
- **migration**: Editing the shipped example changes its sound — from broken to intended. No schema
  change.

### F-C2-12: No level metering or clip indicator anywhere in the editor
- **kind**: missing-feature
- **area**: UI / gain staging feedback
- **severity**: medium
- **confidence**: high
- **effort**: S
- **when**: 0.2-blocker
- **evidence**: I searched all of `skald-ui/src/components` and `skald-ui/src/hooks` for any
  peak/RMS/dBFS/clip/meter surface and found none. The only audio-visual feedback is the
  oscilloscope fed by the shared `AnalyserNode` after the master `GainNode`
  (`useWasmAudioEngine.ts:191-196`). Because the preview also applies master volume *after* the
  limiter (F-B08-1), even the scope is not showing the export's waveform.
- **detail**: Every quantitative claim in F-C2-1 is invisible to a Skald user. A patch can be 8 dB
  into the master saturator, or emitting peaks of 3.9 on the path the game will use, and the editor
  shows a nice-looking wave. Given that Skald's *product* is a number stream handed to someone
  else's engine, shipping without a peak readout is shipping without the one instrument the tool
  most needs. This is also by far the cheapest mitigation for F-C2-1: if the limiter fix slips, the
  meter at least lets the user find the problem.
- **recommendation**: Add a stereo peak-hold readout with a clip LED to the transport dock, driven
  from the existing `AnalyserNode` time-domain data (`getFloatTimeDomainData`, max |x| per frame,
  3-second hold, latch red at ≥0.999). Tap it **before** the JS master `GainNode` so it reads the
  same signal the export produces. ~60 lines of React, no backend change. Second, add a per-asset
  peak column to whatever project overview F-A09-9 recommends, so the ~12 dB inter-patch level
  spread I measured across the shipped corpus (0.20 for `glassy-fm-pluck` vs 0.82 for
  `acid-303-squelch-lead` at one note) becomes visible.
- **manual impact**: `00-foundations.md`'s new gain-staging section should tell the reader to watch
  the meter; `nodes/output.md` "What you hear as you sweep them" gains a reference.
- **migration**: None — additive UI.
