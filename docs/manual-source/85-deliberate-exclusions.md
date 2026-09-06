# What Skald deliberately does not do

> A limit you chose on purpose and a limit you tripped over by accident sound identical to the person who just hit one. This chapter is where you find out which kind you found.

Every other chapter in this manual occasionally tells you that Skald cannot do something. Scattered across ten chapters, those asides read as a bug list — as if the tool were simply unfinished. Most of them are not. They are decisions, each made for a stated reason, and this chapter collects them in one place so they read as a design position instead. It draws its reasons from `docs/0.2-ROADMAP.md`'s §7 "Explicitly not in 0.2", the decision record kept for exactly this purpose.

This is one half of a pair. The other half is **Known issues** (`KNOWN-ISSUES.md`), which lists the places where the editor, the generated Odin and this manual disagree with each other by accident — genuine defects, each with a `KI-nnn` id. The test that tells them apart: if the fix is "make the code match the intent," it is a known issue; if the fix would be "change the intent," it is a decision, and it lives here. A few entries below cite a `KI-nnn` anyway, where a defect sits right next to a decision — the decision is that Skald's filter cannot exceed a certain cutoff; the separate defect is that the UI still advertises a higher one. Finally, a limit that is scoped out today but wanted later is tracked as an open item in `ROADMAP.md`, not repeated here; where §7 records a revisit condition for an item below, this chapter says so.

## The signal model

### Mono, with one terminal Panner

Skald's audio path carries one channel per node, start to finish. A Mixer sums `inputCount` mono channels weighted by level and produces one mono output (`skald-backend/core/codegen_nodes.odin::generate_mixer_code`); nothing in it carries a channel dimension. The only node that produces two channels is the Panner, which derives a left and a right signal from one mono input and a pan position, applied once (`skald-backend/core/codegen_nodes.odin::generate_panner_code`). There is no per-node stereo anywhere else in the generator: no generator function carries a channel-indexed state struct, and `get_output_var`/`sum_port_inputs` (`skald-backend/core/codegen_analysis.odin`, `skald-backend/core/param_utils.odin`) resolve a node's output to a single variable, not a pair.

The reason is cost, not oversight: giving every generator a channel dimension is a multi-month rewrite touching roughly fifteen generators and their state structs, a redesigned connection model, and — worst of all — it would force Delay and Reverb to double their buffers and lose the property that makes their design correct, one shared buffer per effect rather than one per channel. Nothing in Skald's patch corpus demands it. So: build in mono, and place exactly one Panner as the last thing before Output. §7 records this as revisited "only under a customer requirement".

### One fixed pan law, with no choice of convention

Skald offers exactly one pan law, not a choice of conventions the way many DAWs do. `generate_panner_code` emits `* 1.4142136` — √2 — on both channels (`skald-backend/core/codegen_nodes.odin::generate_panner_code`), which is constant-power normalisation: pan centred is unity gain in both channels, and full deflection to either side peaks 3 dB hot. Packet B7-1 chose this over the constant-voltage law Skald shipped before it, which put centre 3 dB down instead. For a game's stereo bus a single defensible default beats a second UI surface for choosing one, but it is worth knowing which bias you inherited: a mix folded down to mono now shows hard-panned material *louder* relative to centred material, the opposite of what the earlier law did. §7 does not carry a separate row for offering a choice of law — its only note on the Panner is "fix the law", which B7-1 already did.

### No user-wireable feedback loops

The graph you draw is sorted once, topologically, before any code is emitted (`skald-backend/core/graph_utils.odin::topological_sort`), and the sort reports whether the graph is a DAG. If it is not, `skald-backend/core/codegen_processor.odin::generate_processor_code` refuses to build and names the nodes in or behind the cycle. You cannot wire a node's own output back into one of its upstream inputs, directly or through a chain — there is no patchable feedback path in the graph model at all.

Delay and Reverb still feed back internally: a Delay reads its ring buffer one sample behind where it writes, and folds a fraction of that read sample back into what it writes next (`skald-backend/core/codegen_nodes.odin::generate_delay_code`). That is the standard one-sample-delay convention every digital feedback effect relies on to stay causal, and it is built into those two nodes as an internal implementation detail — a knob (Delay's `feedback` parameter), not a wire you draw. Wanting a *user-wireable* feedback loop — routing an arbitrary node's output back around a cycle of your own design — is a real, separate capability gap, additive to what exists today. §7 puts it at "0.3/0.4".

### A per-sample control path, not block-rate

Every voice-domain node's code lives inside the same per-sample proc: `<Asset>_process` returns one stereo sample and is called once per sample, and every node's logic — oscillator phase, filter state, envelope stage — advances by exactly one sample tick per call (`skald-backend/core/codegen_processor.odin::generate_processor_code`). There is no block buffer and no control-rate subsampling anywhere in the generator: a modulation source wired into a control input is re-evaluated every sample, which is why an envelope into a filter's cutoff produces a genuinely smooth sweep rather than a staircase (see the Filter chapter's "Try it").

A block-rate control path — evaluating slow-moving parameters once per audio block instead of every sample, to save CPU — was considered and rejected for 0.2. The one measured problem that motivated it (editor live-edit latency) turned out to be a compiler flag (`-o:speed`), not a per-sample-modulation cost. §7's answer: solve a measured problem when one exists — "when a CPU meter shows a real patch missing deadline".

### Modulation adds; there is no per-edge amount

Every modulatable parameter in Skald resolves the same way: the knob's own value, plus the sum of every wire connected to its modulation port (`skald-backend/core/param_utils.odin::get_f32_param`). A wire offsets a destination; it never scales or replaces it, and the wire itself carries no depth of its own — the depth lives entirely in the modulator's own amplitude, or in a Mapper placed between source and destination. This is one consistent rule across the whole node set, which is what makes "put a Mapper in between" the standard idiom for shaping a modulation range, taught in `nodes/mapper.md`.

A **per-edge modulation amount** — a depth knob that lives on the connection itself, independent of the modulator's own amplitude — was judged the single best feature idea to come out of the 0.2 review, and the codegen change to support it is trivial with a byte-identical migration. What makes it expensive is a wholly new UI surface, an edge inspector, and it fixes no existing bug. §7 marks it the **0.3 flagship**.

### No expression IR

Every node's DSP is a fixed, hand-written formula emitted directly as Odin text — the Filter's nine lines, the LFO's four waveform branches, and so on, one `generate_*_code` proc per node type in `skald-backend/core/codegen_nodes.odin`. There is no general expression layer: no AST that lets you combine two ports with an arbitrary operator, and no way to express "multiply" or "clamp to a custom range" except by choosing a node that already does it. An expression IR is the architecturally right long-term answer — and it is squarely a 0.3 problem, worth building once per-edge `amount` has actually landed and there is a real UI surface to attach it to. Building it first would mean guessing at the surface it needs to serve.

## Sources

### Every source aliases in the upper register

The Oscillator's waveform switch emits the textbook formulas directly — a sawtooth as `(phase/π) - 1`, a square from a duty-cycle comparison, a triangle as `asin(sin(...))` (`skald-backend/core/codegen_nodes.odin::generate_oscillator_code`) — and the Wavetable computes its four shapes the same direct way (`::generate_wavetable_code`). Neither uses a band-limiting technique: there is no BLEP, BLIT, PolyBLEP or DPW anywhere in the backend. A sawtooth, a square, or a high FM modulation index will therefore alias in its upper register — harmonics that should sit above the Nyquist frequency fold back down as audible, inharmonic partials instead of disappearing.

This is a scope decision for a tool aimed at bass and effects work, not an unfixed defect: several of this manual's exercises deliberately provoke the aliasing so you learn to recognise it — `nodes/oscillator.md`'s "Try it" walks you into it on purpose — and either keep bright content in the lower octaves or tame it with a downstream Filter. §7 does not carry a dedicated row for the oscillator sources — the nearest is Distortion oversampling, below, which is the same family of problem in a different node.

The FM Operator inherits the same absence for a second reason: its `modIndex` can push a carrier's effective bandwidth arbitrarily wide, and nothing clamps the result to stay under Nyquist. A modulation index in the hundreds, which the node's own default invites, produces inharmonic noise rather than a musical tone — not because the index is "too high" in the abstract, but because the resulting sidebands alias. Keep modulator amplitude and index modest unless the aliased result is the sound you are after.

### Oscillator and Wavetable stay separate

Both remain distinct node types with entirely separate codegen paths (`skald-ui/src/definitions/node-definitions.ts::NODE_DEFINITIONS`; `skald-backend/core/codegen_nodes.odin::generate_oscillator_code` and `::generate_wavetable_code`), despite real overlap: both are periodic sources, both gate their frequency on Fixed Pitch, both support unison. §7 records this as a low-confidence finding rather than a considered decision — the plan is to close the two nodes' remaining parity gaps first (done in packet C5) and see whether anyone still wants a merge afterwards. Revisit: not a 0.2 or 0.3 question either way.

### `fixedPitch`, not `keyTrack` + `tune`

An Oscillator or Wavetable's stored `frequency` field is read only when `fixedPitch` is on; otherwise pitch follows the played note and the field is inert (`skald-backend/core/codegen_nodes.odin::generate_oscillator_code`, gating on `get_bool_param(node, "fixedPitch", false)`). The editor is honest about this: the frequency control only renders when Fixed Pitch is on, because "an editable-but-inert control is a lie" (`skald-ui/src/components/Nodes/OscillatorNode.tsx::OscillatorNode`, its own header comment).

A `keyTrack` + `tune` pair — a proportional key-tracking amount plus a fine-tune offset, the convention most synths use — would read more naturally to anyone coming from another instrument, but it is a public-API break on every `<Asset>_set_frequency` setter already shipped, and the dead-control symptom that originally justified the change closed for free once the editor learned to hide the box. §7 defers judging it as a musical feature on its own merits to 0.3.

## Modulation

### No control over LFO phase reset — and unison starts in phase too

There is no user-facing choice between an LFO restarting its phase on every new note and letting it free-run across notes. As of packet C6-2, the rule is fixed: **a fresh voice always resets LFO phase to zero** (`skald-backend/core/codegen_processor.odin::generate_processor_code`, the per-voice reset block that emits `v.lfo_%s_phase = 0.0` for every LFO in the subgraph), alongside the same reset for Oscillator and Wavetable phase, filter memory, and Sample & Hold's held value. Reset happens only on a genuinely fresh voice, never on a stolen one — a reused voice keeps its running state, which is also why unison copies stay perfectly in phase at a note's onset (the same reset block zeroes the whole oscillator phase array, `v.osc_%s_phase = {}`) and only drift apart as detune pulls them out of sync over the following tens of milliseconds. There is no control to randomise a fresh voice's start phase either, which is the flip side of a real, useful property: Skald's attack is exactly reproducible, sample for sample, every time a note fires on a fresh voice.

### No slew limiter on Sample & Hold

A Sample & Hold's held value jumps instantly to a new random draw every time its interval elapses (`skald-backend/core/codegen_nodes.odin::generate_sample_hold_code`: `sh_%s_current_value = next_float32(...) * 2.0 - 1.0`, written straight into the output with no interpolation). There is no slew-rate parameter to soften that step into a glide between values. If you want a smoothed random modulator, the current answer is to follow the Sample & Hold with a one-pole smoother built from other nodes, or to accept the stepped character as the point — it is a large part of what makes `wobble-samplehold-bass.skald.json` sound the way it does.

### `bpmSync` cannot be switched at runtime

A BPM-synced node's sync toggle is deliberately excluded from exposure: the BPM Sync checkbox is rendered through the same wrapper every other parameter uses, but with exposability forced off (`skald-ui/src/components/NodeParameterControls.tsx::bpmSyncToggle`, passing `false` — "never exposable, because the flag is read at codegen time, not through a struct field"). There is no capability gap this closes that anyone has actually asked for: every symptom on record was "the API advertises a setter that turns out to be inert," which packet B2 already closed by pruning dead exposed parameters. §7 defers a genuinely runtime-switchable `bpmSync` to 0.3, alongside runtime BPM.

### No runtime BPM setter — but `p.bpm` is a plain field

There is no `<Asset>_set_bpm` anywhere in the generator — grepping the whole backend for a BPM setter finds nothing. Tempo is written once, at `_init`, into a plain `f32` field on the processor struct (`skald-backend/core/codegen_processor.odin::generate_processor_code`, which both declares `bpm: f32,` on the struct and emits `p.bpm = <value>` at init). Nothing stops a game from writing `p.bpm` directly between calls — it is an ordinary exported struct field, not an encapsulated one — and `80-exporting-odin.md` already shows exactly that in a worked example. `param_ranges.generated.odin` even carries a `{"", "bpm", {20.0, 999.0, 120.0, "bpm"}}` range row with no node-type prefix to attach it to, which is what an unreachable table entry looks like: the range exists, nothing routes a call through it. §7 marks a real setter — `<Asset>_set_bpm`, replacing the direct-field-write convention — as the cheaper and more valuable half of the runtime-tempo pair, for 0.3.

### No MPE, pitch bend, mod wheel or CC

MIDI reaches Skald as three signals only: pitch (derived from the played note), gate, and velocity (`skald-backend/core/codegen_nodes.odin::generate_midi_input_code`). Velocity itself is written once, at note-on, and never touched again for the life of the voice (`skald-backend/core/codegen_processor.odin::generate_processor_code`, the single `v.velocity = velocity` assignment). Nothing under `skald-backend/core` mentions MPE, pitch bend, channel pressure or CC74 — there is no per-note continuous expression of any kind. This is genuinely wanted, and it needs its own design pass before it can be built well: whether Skald should grow a fixed set of new ports for bend and CC1, or a generic CC node that can address any controller number, is an open question, not an implementation detail. §7 defers to 0.3, non-MPE pitch bend and CC1 first.

The MIDI Input node's "Enable MPE" checkbox and "MPE Active" badge (`skald-ui/src/components/Nodes/MidiInputNode.tsx::MidiInputNode`) are a separate, open defect rather than part of this decision — the checkbox changes nothing in the generated code. See `KI-034`.

## Shaping and space

### The filter will not self-oscillate

Push an analogue resonant filter's feedback far enough and it sustains a tone with no input at all. Skald's filter deliberately stops just short of that. The resonance knob is inverted into an internal damping term, `q = clamp(1.0 / max(resonance, 0.1), 0.05, 1.9 - f)` (`skald-backend/core/codegen_nodes.odin::generate_filter_code`), and the `0.05` floor bounds how far damping can fall — high resonance rings loud and long, but the ring always decays. This is a scoping decision for a tool whose output ends up in a shipped game: an instrument that can spontaneously howl with no note held is a support liability few teams want, traded off against every other synth a new user has touched treating maximum resonance as the point where the filter takes off.

### The resonance dead zone

The same damping expression has a ceiling as well as a floor: `q` cannot rise above `1.9 - f`, where `f` is derived from the cutoff. At a 200 Hz cutoff that ceiling is about 1.88, which means any resonance below roughly `1/1.88 ≈ 0.53` produces identical damping — the bottom half of the resonance range, 0.1 to about 0.53, is inaudible, and the exact boundary shifts with cutoff. This ceiling exists to stop resonance values below 1 — perfectly legal in the UI — from blowing the filter up at low cutoffs; the floor above is a separate, deliberate choice about self-oscillation. That the dead zone exists is the design decision recorded here. That the UI still presents 0.1 as a meaningfully different setting from 0.5 is `KI-038`.

### The cutoff ceiling

The same function clamps cutoff itself: `math.clamp(f32(cutoff), 10.0, sample_rate * 0.16)` — about 7,680 Hz at 48 kHz, 7,056 Hz at 44.1 kHz (`skald-backend/core/codegen_nodes.odin::generate_filter_code`). Above roughly one sixth of the sample rate this particular filter topology, a Chamberlin state-variable filter, mathematically diverges to infinity — this is not a headroom choice but a stability boundary of the algorithm, and Skald does not oversample the filter or switch to a different topology to push the reachable corner any higher. For a lowpass this costs nothing audible, since the filter is already fully open there; for a highpass it means the filter can never be pushed high enough to silence a signal outright. That the algorithm has this ceiling is the decision; that the editor, the exposed setter and the `_PARAMS` table still advertise 20,000 Hz is the separate, open defect `KI-037`.

### No Distortion oversampling

`generate_distortion_code` runs its waveshaper directly at the project's native sample rate, with no upsample-process-downsample step (`skald-backend/core/codegen_nodes.odin::generate_distortion_code`). Distortion generates new harmonics above the input's own content, and at moderate-to-high drive some of those new harmonics land above Nyquist and alias back down, same mechanism as an un-band-limited oscillator. Oversampling would change the audio of every Distortion patch that has ever shipped, at any drive setting past "gentle" — not something to slip in unannounced. §7 puts this at 0.3, behind an opt-in flag and a version gate so existing patches keep their exact sound until a project chooses otherwise.

### Tempo sync offers straight and triplet divisions only

The single list every sync-rate dropdown in the app draws from is `1/1` down to `1/64`, each with a triplet (`t`-suffixed) variant, and nothing else (`skald-ui/src/definitions/bpm.ts::SYNC_RATE_OPTIONS`). There is no dotted-note entry — no dotted eighth, a heavily used delay setting in contemporary production. `skald-ui/src/utils/syncNormalize.ts::normalizeSyncedFreeRun` is a different piece of machinery entirely and does not enumerate divisions at all: it keeps a synced node's stored free-run rate in step with whichever division and project tempo are already chosen, on every save and load, so that reading the field in a saved file tells you what the division resolves to even though the field itself is not live. The division list itself lives only in `bpm.ts`. The only workaround for a dotted feel today is to turn BPM Sync off and type a time in seconds by hand, which then stops following tempo changes entirely. This is a gap against common practice rather than a considered trade-off, and §7 carries no row for it — it simply has not been built yet.

### No modulation inputs on Delay, Reverb, Distortion or Mixer

All four of these nodes fetch every one of their own parameters with an empty modulation-port argument (`skald-backend/core/codegen_nodes.odin::generate_delay_code`, `::generate_reverb_code`, `::generate_distortion_code`, `::generate_mixer_code` all call `get_f32_param(..., "", ...)` for delayTime/feedback/mix, decay/preDelay/mix/damping, drive/tone/mix/outputGain, and each channel's level respectively), and none of their node cards declares a control-input handle beyond the plain audio ports. An LFO cannot be wired into Delay time to build a chorus or a tape-wobble effect from primitives; a Mixer channel's level cannot be automated from the graph at all. The only ways to move one of these parameters over time today are an exposed runtime setter reached from game code, or a sequencer P-lock. §7's answer is not "add modulation ports" case by case but to finish the controls existing nodes are missing first (packet C5) and treat Chorus as a new node in its own right for 0.3, after an in-graph Compressor and an EQ.

### No wet-path gain compensation

Two related facts, both the same architectural choice. First, the Filter's resonant peak has no input attenuation: `high := input - low - q * band` carries no scale term on `input` (`skald-backend/core/codegen_nodes.odin::generate_filter_code`), unlike reference state-variable implementations that multiply the input by `q` specifically to hold level constant as resonance rises — so turning resonance up in Skald also turns the patch up. Second, Reverb and Delay's feedback both raise a comb filter's steady-state gain as decay lengthens — roughly a twentyfold increase at a ten-second Reverb decay — and neither node corrects for it; both simply mix `input * (1.0 - mix) + fed_back * mix` (`::generate_reverb_code`, `::generate_delay_code`) with no internal gain stage. In every one of these cases the only backstop is the project's master soft limiter, a `tanh` saturator emitted once per project (`skald-backend/core/codegen_project.odin::emit_soft_limit_proc`, which defines `skald_soft_limit`), not a per-node correction. Compensate by ear with the Instrument's Volume or a VCA rather than expecting these controls to hold their own level.

### The VCA's usable headroom ends where the master limiter starts

A VCA's own gain knob genuinely reaches 4× make-up gain, and the exposed setter honours the same 0–4 range (`skald-ui/src/components/Nodes/GainNode.tsx::VisualGainNode`; `schema/nodes.json`'s Gain row agrees). Past roughly 2×, though, further increases are mostly absorbed by the same master soft limiter rather than producing more perceived loudness — the safety net working as intended, not the control failing. There is no per-node indication of where that point sits; you find it by ear or by reading this paragraph.

## Routing and packaging

### No per-channel pan in the Mixer

Because Skald is mono until the terminal Panner (above), the Mixer has nothing to offer a per-channel pan control: `generate_mixer_code` reads only `inputCount` and each channel's level, never a pan value. The UI's data model does carry a `pan` field on every Mixer channel and every shipped example file stores it — that field is dead weight the editor writes and the generator ignores, tracked separately as `KI-045`. The deliberate limit is the Mixer's mono design itself; the only route to a per-source stereo image is a separate Panner per source, wired straight to Output, bypassing the Mixer entirely.

### The Mixer is position-keyed, not connection-keyed

A Mixer channel's level is indexed by its array position — `generate_mixer_code` reads `levels[channel-1]` — while the editor addresses the same channels by a stable `id`. The two agree as long as nothing reorders the array, but there is no per-edge parameter tying a specific incoming wire to a specific channel's settings the way a connection-keyed model would. Moving to one needs either a per-edge parameter mechanism or a schema change, and it touches a meaningful slice of the existing patch corpus. §7 places it after per-edge modulation `amount` lands, since the two share the underlying mechanism.

### Nested Instruments are rejected, not supported

An Instrument inside another Instrument's subgraph is a hard validation error, not a silently degraded feature: `skald-backend/core/graph_validate.odin::validate_no_nested_instruments` (via `::find_nested_instrument`) stops the build and names both instruments, because Skald has no generator for the inner one — its nodes would be left out of the export entirely. This is not a missing dispatch case that merely needs wiring up: the serializer already strips a second-level subgraph before it ever reaches the backend (`skald-ui/src/utils/projectSerializer.ts::formatNodesForCodegen`, which deletes any `subgraph` key it finds), and the semantics of a nested Instrument are genuinely unspecified — does an inner `voiceCount` multiply against the outer one, or replace it? Rejecting the graph loudly at validation time is the entire 0.2 answer, and §7 calls it a defensible permanent one, to be revisited only if a user actually asks.

One thing this decision does **not** touch: the recursive parser that builds a subgraph from raw JSON (`skald-backend/core/json.odin::build_graph_from_raw`, which calls itself for an Instrument node's own subgraph) stays live and load-bearing on both the export path and the live-preview path. It exists to parse one level of Instrument-inside-project nesting correctly, not to enable Instrument-inside-Instrument; do not read the validation rejection as license to remove it.

### Multi-port instrument outputs are summed

The editor lets you give an Instrument several distinctly named output ports, each backed by its own `InstrumentOutput` node inside the subgraph, and it will happily draw wires to a specific one. In the generated code every one of those adds into the same pair of accumulators regardless of which port it came from (`skald-backend/core/codegen_nodes.odin::generate_graph_output_adds`, called once per `GraphOutput`-typed node with no awareness of a port name). The naming is cosmetic to the export — see `KI-009` — and the underlying decision recorded here is that Skald does not yet have a design for what a genuinely multi-port instrument output should mean at the API level (separate stereo pairs? a `feed_input`-shaped fan-out?). §7 defers a real design pass to 0.3; for 0.2 the honest answer is to stop presenting the naming as meaningful and build two Instruments if you need two separately addressable outputs.

### No Compressor, EQ or Chorus

The full node type registry (`skald-ui/src/definitions/node-definitions.ts::NODE_DEFINITIONS`) has fourteen processing node types plus Instrument, Group and MIDI Input — Compressor, EQ and Chorus are not among them. Each would cost roughly twenty coordinated hand-edits across two languages today, with no checklist to catch a missed one, and two of the couplings a new node needs have already failed five and six times from memory alone. §7's answer for 0.2 is to finish the controls existing nodes are missing (packet C5) rather than add new surface area, then build Compressor (without sidechain), then EQ — cheap, since the state-variable filter already computes every response an EQ band needs — then Chorus, all as 0.3 work.

**"Compressor with sidechain" is not a node Skald can add without a bigger change than it sounds like.** Ducking one sound based on another's level needs cross-asset routing — one Instrument's output reaching into another's gain stage — and nothing in the current graph model can express a connection that crosses instrument boundaries; each exported asset is an independent, self-contained processor. Today, ducking is the host game engine's job, done in the mixing layer above Skald's generated assets, and that is a permanent architectural answer, not a stopgap.

### An Instrument's volume is applied at the return, after its own effects

`p.volume` multiplies the signal exactly once, at the very last line of an asset's `_process` — `return skald_soft_limit(output_left * p.volume, output_right * p.volume)` when the asset is limited, `return output_left * p.volume, output_right * p.volume` when it opts out (`skald-backend/core/codegen_processor.odin::generate_processor_code`) — after every internal effect, Reverb included, has already run. Turning an Instrument's Volume down changes how much of it reaches the project mix; it does not change how the instrument's own internal effects behave. A reverb tail keeps the same relative level and the same saturation character regardless of where Volume sits. `ROADMAP.md`'s C2 records this as a deliberately unchanged path — moving the multiply earlier in the chain would break the assumption every existing patch's effect balance relies on.

### The exported package is real-time only

Three related absences round out what a generated asset can do, and `80-exporting-odin.md` already points here for the reasoning. There is no offline-render or bounce-to-file entry point anywhere in the generated API — `<Asset>_process` is a per-sample callback, meant to be called from inside a running game, and nothing in the backend emits a batch-render path or writes audio to disk. There is no stem export: an Instrument is one processor with one stereo output: it does not surface the contents of its own subgraph as separately renderable layers. And there is no scale quantisation inside the generated code — the sequencer's Key + Scale feature (`nearestInScale`) quantises every note once, at save/export time, and only the already-quantised MIDI number is ever written into the generated pattern data (`skald-ui/src/utils/projectSerializer.ts::serializeTracks`). A game that wants to requantise notes live, transpose a scale at runtime, or render a patch to a file, is doing something outside what an exported Skald asset offers.

## Editor

### String-typed choices are compiled in, not settable at runtime

Skald's exposure machinery mints `f32` runtime setters only. Any parameter whose value is a string — a Noise node's White/Pink choice (`skald-backend/core/codegen_nodes.odin::noise_is_pink`), a Distortion's `shape` (`::generate_distortion_code`, switching once over `classic`/`soft`/`hard`/`asymmetric`), an Oscillator's `waveform` — is read exactly once, at code-generation time, and the chosen branch is the only one that exists in the exported processor. Changing any of them means regenerating and rebuilding; no game-code call can switch a waveform or a distortion shape at runtime. The usual workaround is to build two differently configured nodes and crossfade between them rather than switch one node's type in place.

### Voice count is a compile-time bound

An Instrument's `voiceCount` sizes the voice array and the note-stealing loop's bound at generation time (`skald-backend/core/codegen_processor.odin::generate_processor_code`, reading `polyphony := instrument.voice_count`). There is no exposed setter for it, and there cannot sensibly be one without regenerating the asset — changing it changes how much memory the struct occupies. The range agrees at 1–32 everywhere that states it (`schema/nodes.json`, the editor's instrument panel, and the codegen-side lookup), closing an earlier split where the backend once allowed up to 64. Like tempo, this is one of the build-time choices `80-exporting-odin.md`'s own "Deliberate limits" section names and defers to this chapter.

### No P-lock live-editing without a rebuild

A per-step parameter override (a P-lock) is resolved into the generated sequencer code at build time: `skald-backend/core/codegen_analysis.odin::resolve_plock_targets` matches each stored override to the node it targets while the Odin text is being assembled, and the value it bakes in is only ever changed by regenerating. There is no path from editing a P-lock's value in the sequencer to hearing that change without a rebuild — unlike an exposed parameter's own knob, which the preview can update instantly through `set_param`. This is a real capability gap, not an oversight of the moment: it rides on the same sequencer model that packets B2 and B5 already reworked, and §7 defers building it properly to 0.3.

### P-locks are addressed by label, not by a stable id

A P-lock is keyed by a `"<NodeLabel>:<param>"` string (`skald-ui/src/definitions/types.ts`'s `NoteEvent.patchOverrides`, resolved backend-side by node label in `skald-backend/core/codegen_analysis.odin::resolve_plock_targets`), not by the node's own stable id. Rename the node the P-lock targets, and the override goes stale rather than following the rename. Per-note addressing by a stable id is a real, wanted fix, and like live-editing it is better built on top of the post-B2/B5 sequencer model than bolted onto the current one. §7 defers both to 0.3.

## Where these decisions are tracked

`ROADMAP.md` is the day-to-day tracker for what is open, in progress and closed across Skald's development waves. `docs/0.2-ROADMAP.md` §7, "Explicitly not in 0.2", is the decision record this chapter draws from — every row states why an exclusion was chosen and, where one exists, the condition under which it would be revisited. When a §7 row says "0.3" or names a future packet, that is the currently planned answer, not a promise; check `ROADMAP.md` for whether it has actually started.

If you find yourself arguing that one of the limits above should be lifted right now, in the current release, §7 is where that argument gets settled: every row already states the cost that was weighed against the request, so a proposal to reopen one mid-release should engage with the reason recorded there rather than re-litigate it from scratch. A limit not appearing in this chapter at all, despite sounding like it should, is more likely a defect worth checking against `KNOWN-ISSUES.md` first — the two chapters are meant to be exhaustive together.

## Terms introduced

- **Deliberate limit** — a capability Skald does not have because of a decision with a stated reason, as opposed to a defect (an accidental mismatch between what the editor shows, what the generated code does, and what this manual says).
- **Voice domain / bus domain** — Skald's split between per-voice DSP, which runs once per active voice per sample, and shared post-mix DSP, which runs once per sample regardless of polyphony. Delay and Reverb always live in the bus domain; a modulator that feeds only the bus domain is hoisted there automatically.
- **State-variable filter (SVF)** — the filter topology Skald generates; its four responses (lowpass, highpass, bandpass, notch) fall out of the same two integrators, and its stability boundary is what sets the cutoff ceiling described above.
- **Soft limiter** — the `tanh`-based saturator every generated asset's output passes through once, the backstop for gain build-up that individual nodes do not correct for themselves.
- **P-lock** — a per-step override of a node's parameter, stored on a sequencer step and baked into the generated code at build time rather than resolved live.
- **Exposed parameter** — a parameter promoted to a named, clamped, runtime-settable field on the generated processor; the mechanism this chapter repeatedly contrasts with "baked in at compile time".
- **Aliasing** — audible, inharmonic partials produced when a sound's true harmonics exceed the Nyquist frequency and fold back down into the audible range instead of being removed.
- **Nyquist frequency** — half the sample rate; the highest frequency a digital signal can represent without aliasing.
- **Constant-power pan law** — the pan convention where centred is unity gain in both channels and full deflection peaks 3 dB hot in one, chosen so a signal's perceived loudness stays roughly constant as it moves across the stereo field. Skald's only pan law.
- **DAG (directed acyclic graph)** — a graph with no cycles. Skald's topological sort requires one; a wire that would create a cycle is rejected at build time rather than silently resolved.
- **One-sample-delay convention** — the standard trick that lets a digital effect read its own buffer one sample behind where it writes, making internal feedback (inside Delay and Reverb) causal without permitting a cycle in the wider graph.
