# Known issues

This chapter is the one place Skald records where its own three descriptions of a sound disagree: what the editor shows you, what the generated Odin actually does, and what this manual says. It also lists the shipped example patches that misbehave. Every entry has a stable **KI-nnn** id, a status, a severity — **blocker** means you cannot do the task at all, **confusing** means the editor or the docs mislead you about what you are hearing, **cosmetic** means a label, a tooltip, a type declaration or a dev-facing document is wrong but no sound changes — and the list of chapters whose text touches it. The other chapters link here once, at the end, instead of each carrying its own defect notes; when a chapter's "Try it" step tells you something surprising will happen, the reason is in one of these entries. Deliberate limits are not defects and are not listed here: they live in **What Skald deliberately does not do**. Issues closed before 0.2 are in the table at the bottom, so that if you are reading an older PDF you can tell which paragraph you remember has since gone away.

Citations are `path::identifier` — a name you can search for in that file — rather than line numbers, which drift.

## Open issues

### Editor

#### KI-001 · Parameter-panel sliders stop short of the node card and the exported range
- **Status:** open · **Severity:** confusing · **Since:** 0.1
- **Chapters:** nodes/lfo.md (The controls, `frequency` row) · nodes/sampleHold.md (The controls, `rate` row; Try it step 5) · nodes/delay.md (The controls, Feedback row; the feedback section; Try it step 7)
- **Also see:** `skald-ui/src/tests/contracts/RangeParity.test.tsx::KNOWN_DIVERGENCES` tracks these three as live divergences owned by packet C2

Three controls have a narrower slider in the Parameter Panel than on the node card, and the card is the one that matches the generated code. An LFO's Frequency reaches 100 Hz on the card and in the exported setter (`skald-backend/core/param_ranges.generated.odin`) but stops at 50 Hz in the panel (`skald-ui/src/components/NodeParameterControls.tsx`, `slider('frequency', 0.1, 50, 5, 'log')`). A Sample & Hold's Rate reaches 1000 Hz on the card and stops at 50 Hz in the panel. A Delay's Feedback is clamped to 0.95 by the DSP (`skald-backend/core/codegen_nodes.odin::generate_delay_code`) and on the card, but the panel still offers 0–1, so the last stretch of the drag does nothing.

Use the number boxes on the node card itself when you need a value the panel will not reach, and treat the panel slider's end-stops as a display limit rather than the parameter's real range.

#### KI-002 · A patch saved with a pre-rename parameter key displays the wrong value
- **Status:** open · **Severity:** confusing · **Since:** 0.1
- **Chapters:** nodes/filter.md (What it looks like in Skald) · nodes/delay.md (The controls; delayTime) · 50-bass-teardown.md (Rung X)

Some older example files still store parameters under names Skald has since renamed: a Filter's `filterType` (now `type`), a Delay's `time` and `wetDryMix` (now `delayTime` and `mix`). The generator has a compatibility fallback for all of them (`skald-backend/core/param_utils.odin::get_string_param` and `::get_f32_param` read the legacy key when the current one is absent), so these patches export and sound correct. The editor has no such fallback: both the node card (`skald-ui/src/components/Nodes/ParamNode.tsx`) and the parameter panel (`skald-ui/src/components/NodeParameterControls.tsx`) read only the current key and fall back to their own local default. So `examples/sound-effects/impacts/percussive-high-pass-hit.skald.json` — a genuine highpass in the export — shows "Lowpass" on both surfaces, and `examples/sound-effects/synth/classic-delay-puck.skald.json` shows 0 s on the card and 0.5 on the panel for a delay the export renders at 0.4 s.

Read the file rather than the panel when a legacy patch surprises you. Touching the affected control writes the current key with the value the editor was displaying, which permanently retires the legacy value and changes the sound.

#### KI-003 · A saved edge naming a pre-rename port draws nowhere on the canvas
- **Status:** open · **Severity:** confusing · **Since:** 0.1
- **Chapters:** nodes/oscillator.md (Try it step 9)

`examples/instruments/pads/pwm-pad.skald.json` still wires its LFO to `targetHandle: "pulseWidth"`, the name that port had before it became `input_pulseWidth`. The generator rewrites the old name on load (`skald-backend/core/json.odin::normalize_port`), so the patch generates and plays its PWM correctly, but React Flow matches an edge to a handle by exact id and the Oscillator card only declares `input_pulseWidth` (`skald-ui/src/components/Nodes/OscillatorNode.tsx::OscillatorNode`). The wire therefore has nowhere to attach and is not drawn.

Delete the invisible edge and redraw it from the LFO's Out to the Oscillator's PW input; the resaved file uses the current name and the wire appears.

#### KI-004 · Generator warnings are written to stderr and never shown in the editor
- **Status:** open · **Severity:** confusing · **Since:** 0.1
- **Chapters:** nodes/panner.md (Try it step 7)

The generator emits several non-fatal diagnostics that would answer "why is this silent?" on the spot — `skald-backend/core/codegen_analysis.odin::warn_dead_exposed_params` for an exposed parameter it had to prune, and `::warn_panner_mono_consumers` when a Panner feeds only mono consumers. Both go to stderr. The editor's Generate path logs stderr to the Electron main-process console only (`skald-ui/src/main.ts`, the `invoke-codegen` handler) and does not forward it to the window, so none of it reaches you.

If you are running the generator from a terminal you will see these warnings. Inside the editor, you will not.

### Sequencer

#### KI-005 · Painting a step in the Step Grid always creates it at middle C
- **Status:** open · **Severity:** confusing · **Since:** 0.1
- **Chapters:** 50-bass-teardown.md (Try it, Exercise 4 step 6)

`skald-ui/src/hooks/sequencer/useSequencerState.ts::toggleStep` creates a new note with `note: note || 60` when its caller supplies no pitch, which is exactly how the Step Grid calls it. So every step you paint in the grid lands on MIDI 60 regardless of the instrument's register — two octaves above where a bass patch lives. The Piano Roll is unaffected, because the row you click supplies the pitch.

Paint in the Piano Roll when register matters, or set the pitch afterwards in Step Properties.

### Export API

#### KI-006 · An exposed parameter's starting value is not clamped to its published range
- **Status:** open · **Severity:** confusing · **Since:** 0.1
- **Chapters:** nodes/filter.md (Resonance — what you hear as you sweep it) · nodes/sampleHold.md (The controls, Amount row; Amount — what you actually hear as you sweep it; Try it step 4; What "expose" does)

Every generated runtime setter clamps its argument to the parameter's published range, but the field's *initial* value does not go through the same clamp: `skald-backend/core/codegen_nodes.odin::exposed_param_default` returns the value stored in the save file verbatim, and `skald-backend/core/codegen_processor.odin::generate_processor_code` writes it straight into the struct. A hand-edited file with `"resonance": 30` on an exposed Filter starts at 30, above the documented ceiling of 20 that no `_set_resonance` call can ever reach again. A Sample & Hold saved with `"amplitude": 6` starts at 6.0 and drops to 1.0 the first time the game calls `_set_amplitude` — an audible step change at an arbitrary moment.

Not reachable from the editor, which never writes an out-of-range value. If you hand-author or machine-generate project JSON, keep stored values inside the range the `_PARAMS` table publishes.

#### KI-007 · The generator's missing-key fallbacks disagree with the authored defaults
- **Status:** open · **Severity:** cosmetic · **Since:** 0.1
- **Chapters:** nodes/filter.md (The controls) · nodes/reverb.md (The controls, Decay row) · nodes/adsr.md (The controls)
- **Also see:** ROADMAP.md C2 closed nine such divergences; these were not in its scope

When a node's saved data omits a parameter key entirely, the generator falls back to a literal written into the emitting procedure rather than to the schema default. Those literals were not part of C2's default-unification pass, so three still disagree: Filter `cutoff` falls back to 1000 Hz where `schema/nodes.json` says 800 (`skald-backend/core/codegen_nodes.odin::generate_filter_code`); Reverb `decay` falls back to 0.5 s where the schema says 3.0 (`::generate_reverb_code`); and an ADSR falls back to attack 0.01 / decay 0.1 / sustain 0.7 / release 0.1 where the schema says 0.1 / 0.2 / 0.5 / 1.0 (`::generate_adsr_code`).

The editor always writes an explicit value for every parameter, so this only bites hand-authored or externally generated JSON. If you write project JSON yourself, state every value rather than relying on omission.

#### KI-008 · An instrument with no Output node builds cleanly and returns silence
- **Status:** open · **Severity:** blocker · **Since:** 0.1
- **Chapters:** nodes/output.md (What it is)

Nothing in the preflight checks that an instrument's subgraph reaches a Output node. `skald-backend/core/graph_validate.odin` rejects unknown node types, illegal ports, nested instruments and duplicate node ids, but has no rule about a missing destination, and `output_left` / `output_right` are declared at `0.0` in `skald-backend/core/codegen_processor.odin::generate_processor_code` and simply never written. The asset compiles, exports with exit code 0, and plays nothing.

If an asset builds without complaint and produces silence, check for a missing or disconnected Output node before anything else.

#### KI-009 · Named instrument output ports all collapse into the same stereo pair
- **Status:** open · **Severity:** confusing · **Since:** 0.1
- **Chapters:** nodes/output.md (What it looks like in Skald) · nodes/instrument.md (What it looks like in Skald)
- **Also see:** docs/0.2-ROADMAP.md §7, "Multi-port instrument outputs" — 0.3, and for 0.2 "stop presenting the naming as meaningful"

The editor lets an Instrument declare several distinctly named output ports (`skald-ui/src/hooks/nodeEditor/useNodeComposition.ts` keys ports by node and handle and gives each a name), but every `GraphOutput` inside a subgraph adds into the same `output_left` / `output_right` accumulator — `skald-backend/core/codegen_nodes.odin::generate_graph_output_adds` never reads a port name, and `skald-backend/core/json.odin::normalize_node_type` folds `output`, `GraphOutput` and `InstrumentOutput` into one type.

The port names are cosmetic to the export. If you need two separately addressable outputs, build two assets.

#### KI-010 · Wires between Instrument nodes on the main canvas are never exported
- **Status:** open · **Severity:** confusing · **Since:** 0.1
- **Chapters:** nodes/output.md (What it looks like in Skald) · nodes/instrument.md (Why you patch it this way)

You can drag a wire from one Instrument's output handle to another's input handle on the top-level canvas, and it draws. The serializer ignores it: `skald-ui/src/utils/projectSerializer.ts::buildProjectData` reads top-level edges for exactly one purpose, finding a connected `midiInput` node to fill the `midi_config` block, and emits no inter-instrument audio connection. Each Instrument becomes an independent asset, and `skald-backend/core/codegen_project.odin::project_process` sums them side by side.

Routing audio between assets is the game's job, through the generated `<Asset>_feed_input(p, l, r)` procedure. The canvas implies a patchbay the export does not build.

#### KI-011 · An asset's soft limiter can only be switched off by hand-editing the save
- **Status:** open · **Severity:** cosmetic · **Since:** B1
- **Chapters:** 80-exporting-odin.md (Volume and clipping)

Every asset's `_process` ends by passing its output through `skald_soft_limit`, and the generator honours an authored `limit: false` on the Instrument to opt that asset out (`skald-backend/core/json.odin` reads the key; `skald-backend/core/codegen_processor.odin::generate_processor_code` emits the unlimited return). No editor control writes it — the flag does not appear in `skald-ui/src/definitions/types.ts` at all — so the only way to reach it is editing the save file or authoring project-shaped JSON.

Leave it alone unless you are deliberately building an asset whose sum you will limit yourself; absent means limited.

#### KI-012 · The checked-in integration-demo Odin and its README are stale
- **Status:** open · **Severity:** confusing · **Since:** 0.1
- **Chapters:** 80-exporting-odin.md (What you get; Walkthrough)
- **Also see:** SKB-020 (checked-in `generated_audio.odin` copies are stale; three of four regenerated, this one left for citation reasons)

`examples/integration_demo/generated_audio/generated_audio.odin` was generated by an older build. Its wavetable helper is `skald_wavetable_sample :: proc(ph: f32, pos: f32)`, two parameters, where the current generator emits three (`skald-backend/core/codegen_project.odin` adds `pw`, packet C5), and its header predates packet B12's listing of setters and `_PARAMS`. `examples/integration_demo/README.md` invokes `.\codegen.exe`, which is not the binary's name, and does not mention the per-asset `skald_soft_limit` or `<Asset>_set_volume` that every generated asset now has.

Read the excerpts in the Exporting chapter, which are taken from current output, rather than the checked-in file, and regenerate the demo before building it.

### Examples

#### KI-013 · The patch named for its wobble does not wobble
- **Status:** open · **Severity:** blocker · **Since:** 0.1
- **Chapters:** 00-foundations.md (What it looks like in Skald) · 50-bass-teardown.md (Rung X; Try it, Exercise 3) · nodes/lfo.md (Try it, intro) · nodes/mapper.md (Try it step 3)

`examples/instruments/bass/lfo-filter-wobble-bass.skald.json` wires its LFO's output straight to the Filter's cutoff port with no Mapper in between and no `amplitude` authored on the LFO. `skald-backend/core/codegen_nodes.odin::generate_lfo_code` therefore falls back to an amplitude of 1.0, and modulation adds to the destination's own value rather than scaling it (`skald-backend/core/param_utils.odin::get_f32_param`), so a 150 Hz cutoff sweeps between 149 and 151 Hz. That is inaudible.

Every other modulated bass patch in the folder routes the same shape through a Mapper, which is what makes the depth reachable. This file is left as it is on purpose: the manual uses it as a diagnosis exercise, and 50-bass-teardown.md's Exercise 3 builds the corrected version step by step. Use `wobble-samplehold-bass.skald.json` if you want to hear the effect working now.

#### KI-014 · `fretless-bass` almost never glides
- **Status:** open · **Severity:** confusing · **Since:** 0.1
- **Chapters:** 50-bass-teardown.md (Rung 7)

Glide only fires when a note-on steals an already-busy voice: `skald-backend/core/codegen_processor.odin::generate_processor_code` gates it on `stolen && v.glide_time > 0.0 && prev_freq > 0.0`. `examples/instruments/bass/fretless-bass.skald.json` sets `glide: 0.08` alongside `voiceCount: 4`, so with four free voices a steal — and therefore a slide — is rare. `fingered-electric-bass.skald.json` has the same shape; `sub-808-glide-bass.skald.json` and `random-acid-bass.skald.json` correctly use `voiceCount: 1`.

The mechanism is deliberate — a fresh voice should start exactly on pitch. The mismatch is that the shipped patch's name implies constant glide. Drop its voice count to 1 and it behaves as named.

#### KI-015 · `fm-growl-bass`'s Mapper is labelled with a depth it does not deliver
- **Status:** open · **Severity:** confusing · **Since:** 0.1
- **Chapters:** 50-bass-teardown.md (Rung 9) · nodes/fmOperator.md (Try it step 7)

The patch's Mapper node is named "Mod Depth 0.3-1.0" and does set `outMin: 0.3, outMax: 1`, but it feeds the modulator oscillator's `input_amp`, and that port adds to the oscillator's own `amplitude` of 1 rather than replacing it (`skald-backend/core/param_utils.odin::get_f32_param`). The depth actually reaching the FM Operator swings 1.3–2.0, giving a modulation index of roughly 247–380 rather than the 57–190 the label implies.

The patch sounds as intended; the label misleads anyone reading the file to learn the additive-input idiom from it. Setting the modulator oscillator's own `amplitude` to 0 would make the label true.

#### KI-016 · `sax3.json`'s ADSR-to-cutoff wire contributes under a hertz
- **Status:** open · **Severity:** cosmetic · **Since:** 0.1
- **Chapters:** nodes/midiInput.md (Try it)

`examples/instruments/winds/midi-setup/sax3.json` wires its ADSR output into the Filter's `input_cutoff` alongside a Mapper that scales the same envelope to 400–3000 Hz. Modulation is additive and `input_cutoff` is read in hertz (`skald-backend/core/codegen_nodes.odin::generate_filter_code`), so the direct 0–1 envelope moves the cutoff by less than one hertz. The Mapper does all the audible work.

The wire is decorative. Nothing breaks; a reader comparing the patch to what they hear should know it does nothing.

#### KI-017 · `ambient-reverb-pad` stores a Reverb `size` that nothing reads
- **Status:** open · **Severity:** cosmetic · **Since:** 0.1
- **Chapters:** nodes/reverb.md (The controls)

`examples/instruments/pads/ambient-reverb-pad.skald.json` sets `"size": 0.9` on its Reverb node. There is no such control: `skald-ui/src/definitions/types.ts::ReverbParams` declares only `decay`, `preDelay`, `mix` and `damping`, and `skald-backend/core/codegen_nodes.odin::generate_reverb_code` never looks the key up. It is silently ignored.

Room size in Skald's reverb is a consequence of Decay, not a separate control. If you opened this example looking for one, there isn't one.

### Instrument

#### KI-018 · `voiceStealing` is stored, typed, and read by nothing
- **Status:** open · **Severity:** cosmetic · **Since:** 0.1
- **Chapters:** 60-complexity-ladder.md (The controls) · nodes/instrument.md (The controls)

Every Instrument carries a `voiceStealing: 'oldest' | 'newest'` field (`skald-ui/src/definitions/types.ts::InstrumentParams`, written by `skald-ui/src/hooks/nodeEditor/useNodeComposition.ts`) and every shipped example serialises `"oldest"`. No control renders it — `skald-ui/src/components/NodeParameterControls.tsx`'s instrument case offers only name, volume, voiceCount, glide, unison and detune — and the string does not appear anywhere under `skald-backend/core/`. Steal order is fixed logic in `skald-backend/core/codegen_processor.odin::generate_processor_code`: oldest releasing voice first, oldest voice otherwise.

Because the fixed rule matches the field's own default, no patch's behaviour is affected by the value being ignored.

#### KI-019 · The Instrument's own parameters offer an expose button that does nothing
- **Status:** open · **Severity:** confusing · **Since:** 0.1
- **Chapters:** nodes/instrument.md (The controls; What "expose" does)

Volume, Voice Count, Glide, Unison and Detune each render the link/expose affordance, because `skald-ui/src/components/ParameterPanel.tsx`'s wrapper defaults `isExposable` to `true` and `skald-ui/src/components/NodeParameterControls.tsx`'s instrument case does not pass `false`. Clicking it writes to a field that `skald-ui/src/utils/projectSerializer.ts::buildProjectData` never forwards — it emits `voice_count`, `glide`, `unison`, `detune` and `volume` as plain structural fields — and the generator's exposure walk only inspects nodes inside the subgraph.

Three of the five are structural and could not become runtime parameters at all: they size arrays or decide whether blocks of code exist. `volume` already has a dedicated runtime setter (`<Asset>_set_volume`); `detune` could in principle be exposed and is not.

### Noise

#### KI-020 · The Amp input adds rather than multiplies, and the label does not say so
- **Status:** open · **Severity:** confusing · **Since:** 0.1
- **Chapters:** nodes/noise.md (Try it step 8; Where it goes wrong)
- **Also see:** docs/0.2-ROADMAP.md §7, "Per-edge modulation `amount`" — flagged as the 0.3 flagship

`skald-backend/core/param_utils.odin::get_f32_param` builds every modulated value as base plus the sum of its wired sources, and `skald-backend/core/codegen_nodes.odin::generate_noise_code` multiplies the noise by that whole sum. With amplitude at its default of 1.0, an envelope wired into Amp can only make the noise louder — it can never gate it to silence. `skald-ui/src/components/Nodes/NoiseNode.tsx` labels the handle plainly "Amp", which invites the opposite, VCA-style expectation.

The convention is consistent across every modulatable parameter in Skald, not specific to Noise; what is missing is any signal of it in the editor. Put the envelope in the audio path instead (Noise → ADSR, or Noise → VCA in multiply mode), or set the base amplitude to the bottom of the range you want and let the modulator add the rest.

### Wavetable

#### KI-021 · Position morph is not level-matched
- **Status:** open · **Severity:** confusing · **Since:** 0.1
- **Chapters:** nodes/wavetable.md (What you hear as you sweep Position; Try it step 4)

The four shapes the Wavetable crossfades between have different RMS levels, and the crossfade is a plain linear blend with no gain compensation — the emitted `skald_wavetable_sample` helper (written by `skald-backend/core/codegen_project.odin`) computes `s1 + (s2 - s1) * frac` and nothing else. Sweeping Position therefore changes perceived loudness by roughly 11 dB across its 0–3 range in addition to changing timbre.

Commercial wavetable synths normalise their tables specifically to avoid this. There is no workaround inside the node: follow it with a limiter, or keep Position modulation narrow.

#### KI-022 · `tableName` is dead data the type system still requires
- **Status:** open · **Severity:** cosmetic · **Since:** 0.1
- **Chapters:** nodes/wavetable.md (What it looks like in Skald)

`skald-ui/src/definitions/types.ts::WavetableParams` declares `tableName: 'Sine' | 'Triangle' | 'Sawtooth' | 'Square'` as a required field and `skald-ui/src/definitions/node-definitions.ts::defaultWavetableParams` ships `'Sine'`, but `skald-backend/core/codegen_nodes.odin::generate_wavetable_code` never reads the key — Position alone determines the shape. The editor is honest about this and shows no dropdown.

The only way to notice is reading a saved file or the type definitions. Ignore the field.

### FM Operator

#### KI-023 · Mod Index's default and the shipped patches sit far outside the documented musical range
- **Status:** open · **Severity:** confusing · **Since:** 0.1
- **Chapters:** nodes/fmOperator.md (The controls; Try it, intro) · 50-bass-teardown.md (Rung 9)

`skald-ui/src/components/Nodes/FMOperatorNode.tsx::FmOperatorNode` states in its own header comment that "the musical range is roughly 1–8; large values are noise". A freshly placed FM Operator defaults to 100 (`skald-backend/core/param_ranges.generated.odin::PARAM_RANGE_GENERIC`, mirrored by `skald-ui/src/definitions/node-definitions.ts::defaultFmOperatorParams`), and `examples/instruments/bass/fm-growl-bass.skald.json` sets 190. Every other shipped FM instrument uses a value between 1.5 and 6.

Wiring one FM Operator into another's Mod input at the shipped default produces aliased noise rather than a tone. Drag Mod Index down to roughly 1–8 by hand on every new operator you intend to use as a modulator. The growl patch stays harmonic at 190 only because its frequency ratio is 1:1.

#### KI-024 · Double-clicking Ratio resets it to 1, but the node's default is 2
- **Status:** open · **Severity:** cosmetic · **Since:** C2
- **Chapters:** nodes/fmOperator.md (The controls, Sources; Try it step 9)
- **Also see:** ROADMAP.md C2 moved the schema default from 1 to 2; the panel slider was not updated with it

A fresh FM Operator's Ratio is 2, and the exported default and `_PARAMS` row agree at 2 (`skald-backend/core/param_ranges.generated.odin::PARAM_RANGE_OVERRIDES`, `skald-ui/src/definitions/node-definitions.ts::defaultFmOperatorParams`). The Parameter Panel still hardcodes 1 as the slider's default (`skald-ui/src/components/NodeParameterControls.tsx`, `slider('frequency', 0.01, 32, 1, 'log')`), and that same number is what `skald-ui/src/components/controls/CustomSlider.tsx`'s `handleDoubleClick` restores.

So double-clicking Ratio to "reset to default" on a new operator moves it from 2 to 1. Type the value you want rather than double-clicking.

### LFO

#### KI-025 · LFO Amplitude has three different ranges, and the panel clamps an authored depth to 1
- **Status:** open · **Severity:** blocker · **Since:** 0.1
- **Chapters:** 00-foundations.md (What it looks like in Skald) · 60-complexity-ladder.md (the ladder, item 2) · nodes/lfo.md (The controls, `amplitude` row; Amplitude — read this one twice)
- **Also see:** `skald-ui/src/tests/contracts/RangeParity.test.tsx::KNOWN_DIVERGENCES` carries `lfo.amplitude`, owner packet C2

An LFO's amplitude is a modulation depth in the destination's own units, so sweeping a filter cutoff needs hundreds or thousands. The exposed range and the runtime setter allow 0–20,000 (`skald-backend/core/param_ranges.generated.odin`); the node card allows 0–10 (`skald-ui/src/components/Nodes/LFONode.tsx::LFONode`); the Parameter Panel allows 0–1 (`skald-ui/src/components/NodeParameterControls.tsx`, `slider('amplitude', 0, 1, 1)`). Both panel commit paths clamp to the control's own maximum — `skald-ui/src/components/controls/CustomSlider.tsx` and `skald-ui/src/components/common/NumberInput.tsx` — so the clamp is destructive, not merely a display limit.

That is the blocking half. `examples/instruments/pads/evolving-motion-pad.skald.json` authors its LFO amplitude at 380, which the backend accepts; opening that node in the panel and touching the Amplitude field collapses the patch's signature slow filter sweep to inaudible, with no warning and no way to type the old value back in from that surface. Reach useful depths through a Mapper, or through the node card, and avoid the panel's Amplitude slider on any patch whose depth is above 1.

#### KI-026 · The Waveform dropdown lists its options in two different orders
- **Status:** open · **Severity:** cosmetic · **Since:** 0.1
- **Chapters:** nodes/lfo.md (The controls)

The node card lists Sine, Sawtooth, Square, Triangle (`skald-ui/src/components/Nodes/LFONode.tsx::LFONode`); the Parameter Panel lists Sine, Sawtooth, Triangle, Square (`skald-ui/src/components/NodeParameterControls.tsx`, `createSelect('waveform', ...)`). Both write the same string and nothing breaks.

The control visibly reorders itself depending on which surface you open it from. Read the label, not the position.

### Sample & Hold

#### KI-027 · Amount above 1 is inert once the parameter is exposed
- **Status:** open · **Severity:** blocker · **Since:** 0.1
- **Chapters:** nodes/sampleHold.md (The controls, Amount row; Amount — what you actually hear as you sweep it; Try it step 4; What "expose" does)

The node card offers Amount up to 10 (`skald-ui/src/components/Nodes/SampleHoldNode.tsx::SampleHoldNode`), but the parameter's published range is 0–1 (`skald-backend/core/param_ranges.generated.odin`), and the generated setter clamps to it — `skald-backend/core/codegen_processor.odin::generate_processor_code` emits a lower and upper bound check for every entry in the plan's stable resolutions. So `set_amplitude(p, 5.0)` stores 1.0, and typing 5 into the Amount box on an exposed node is audibly inert as soon as the game touches the API.

If you need depth above 1 from a Sample & Hold, do not expose `amplitude`; scale its output with a Mapper instead. See also KI-006, which is why such a patch nonetheless *starts* at the value you typed.

### ADSR

#### KI-028 · Four modulation inputs exist in the generator with no handles on the card
- **Status:** open · **Severity:** confusing · **Since:** 0.1
- **Chapters:** nodes/adsr.md (What it looks like in Skald)

`skald-backend/core/codegen_nodes.odin::generate_adsr_code` resolves modulation wires into `input_attack`, `input_decay`, `input_sustain` and `input_release`, and `skald-backend/core/graph_validate.odin::ADSR_INPUTS` accepts all four as legal ports. `skald-ui/src/components/Nodes/ADSRNode.tsx::ADSRNode` declares only the single `input` handle.

Driving an envelope's shape from another node is therefore a real capability reachable only by hand-editing the project JSON. From the editor, use a P-lock or an exposed setter instead.

#### KI-029 · The envelope graph's time axis stops at 4 seconds
- **Status:** open · **Severity:** confusing · **Since:** 0.1
- **Chapters:** nodes/adsr.md (The controls)

`skald-ui/src/components/controls/AdsrEnvelopeEditor.tsx::AdsrEnvelopeEditor` fixes `maxTime = 4.0`, while Attack, Decay and Release all range to 10 seconds on the node card and in the schema. A pad with a 6-second release has its Release handle positioned off the right edge of the graph.

The number boxes reach the full range; the drawing does not. Use them for long stages.

#### KI-030 · The envelope graph cannot drag a stage to exactly zero
- **Status:** open · **Severity:** cosmetic · **Since:** 0.1
- **Chapters:** nodes/adsr.md (The controls)
- **Also see:** ROADMAP.md A8 made zero a legal value everywhere else

Zero is a supported attack, decay and release: the schema floor is 0 and the runtime setter stores it. The draggable graph still floors every drag at `Math.max(0.001, ...)` in three places (`skald-ui/src/components/controls/AdsrEnvelopeEditor.tsx::AdsrEnvelopeEditor`), so it alone cannot represent an instant stage.

Type 0 into the number box beside it.

#### KI-031 · `AdsrParams.lastTrigger` is never written or read for an ADSR
- **Status:** open · **Severity:** cosmetic · **Since:** 0.1
- **Chapters:** nodes/adsr.md (What it looks like in Skald)

`skald-ui/src/definitions/types.ts::AdsrParams` declares `lastTrigger?: number`. Its only writer is the Output node's Test Audio branch in `skald-ui/src/components/ParameterPanel.tsx`, and its only reader (`skald-ui/src/hooks/nodeEditor/useWasmAudioEngine.ts::useWasmAudioEngine`) scans Output-type nodes only. `OutputParams` carries the same field and is the one actually used.

Dead weight in the type. There is no per-envelope manual trigger.

### Mapper

#### KI-032 · The default `outMax` of 20,000 aims at a filter ceiling that does not exist
- **Status:** open · **Severity:** cosmetic · **Since:** 0.1
- **Chapters:** nodes/mapper.md (The controls)

A fresh Mapper defaults its output ceiling to 20,000 (`schema/nodes.json`, via `skald-ui/src/definitions/node-definitions.ts`), anticipating the LFO-into-filter-cutoff case. Two things make most of that range useless: the Mapper's output adds to the destination's own value rather than replacing it (`skald-backend/core/param_utils.odin::get_f32_param`), and the filter clamps its cutoff to about a sixth of the sample rate (see KI-037).

A default-configured Mapper aimed at a filter spends most of its travel past the point where the filter stops responding. Set `outMax` to something like 3,000 for cutoff work.

#### KI-033 · A fresh Mapper serialises with no `exposedParameters` key
- **Status:** open · **Severity:** cosmetic · **Since:** 0.1
- **Chapters:** nodes/mapper.md (What "expose" does)

The Mapper's entry in `skald-ui/src/definitions/node-definitions.ts` lists only `inMin`, `inMax`, `outMin` and `outMax` in its default parameters, where every other node type explicitly seeds `exposedParameters: []`. Nothing breaks — the panel reads the array with optional chaining and treats an absent one as empty.

Inconsistent with the rest of the node-definition table, and visible only in a saved file.

### MIDI Input

#### KI-034 · MPE is presented as a feature with nothing behind it
- **Status:** open · **Severity:** confusing · **Since:** 0.1
- **Chapters:** nodes/midiInput.md (The controls)
- **Also see:** docs/0.2-ROADMAP.md §7, "MPE, pitch bend, mod wheel, CC" — 0.3, non-MPE bend and CC1 first

The editor offers an "Enable MPE" checkbox (`skald-ui/src/components/NodeParameterControls.tsx`, the `midiInput` case) and an "MPE Active" badge on the node when it is ticked (`skald-ui/src/components/Nodes/MidiInputNode.tsx::MidiInputNode`). Nothing under `skald-backend/core/` mentions MPE, pitch bend, channel pressure or CC74, and `voice.velocity` is written once at note-on and never updated (`skald-backend/core/codegen_nodes.odin::generate_midi_input_code`).

The checkbox changes nothing. Per-note expression is a 0.3 feature.

#### KI-035 · The Device dropdown lists mock devices and routes nothing
- **Status:** open · **Severity:** confusing · **Since:** 0.1
- **Chapters:** nodes/midiInput.md (The controls)

The dropdown offers "All Devices", "Device A (Mock)" and "Device B (Mock)". The preview attaches to every port `navigator.requestMIDIAccess()` returns and posts every note with `asset: -1`, meaning all instruments, regardless of the selection (`skald-ui/src/hooks/nodeEditor/useWasmAudioEngine.ts::useWasmAudioEngine`). The export serialises a `midi_config` block that no code generator reads.

Leave it on "All Devices". Per-device routing does not exist.

#### KI-036 · The on-node port label "Pitch" omits the units that make it usable
- **Status:** open · **Severity:** cosmetic · **Since:** 0.1
- **Chapters:** nodes/midiInput.md (What it looks like in Skald)

The port renders as plain "Pitch" (`skald-ui/src/components/Nodes/MidiInputNode.tsx::MidiInputNode`). The fuller and correct description — "Pitch (V/Oct), gate and velocity signals from your MIDI device" — lives only in the sidebar palette's hover tooltip (`skald-ui/src/components/Sidebar.tsx`) and disappears once the node is on the canvas.

The units are the whole story, because an oscillator's frequency already tracks the played note: a Pitch wire into a Freq port adds a second, full transposition on top. The label as shown reads as "the note's frequency", which is the misreading that causes it.

### Filter

#### KI-037 · Cutoff is advertised to 20 kHz and clamped at about 7.7 kHz
- **Status:** open · **Severity:** confusing · **Since:** 0.1
- **Chapters:** 00-foundations.md (What it looks like in Skald; Try it steps 6 and 10) · 50-bass-teardown.md (The controls, Filter cutoff) · 70-space-funk-build.md (the hat) · nodes/filter.md (Cutoff — what you hear as you sweep it; Try it step 9; Under the hood) · nodes/mapper.md (The controls)

The node card, the Parameter Panel, the exposed setter and the `_PARAMS` row a game developer reads all say 20–20,000 Hz. `skald-backend/core/codegen_nodes.odin::generate_filter_code` clamps the value it uses to `math.clamp(f32(cutoff), 10.0, sample_rate * 0.16)` — about 7,680 Hz at 48 kHz, 7,056 Hz at 44.1 kHz. The top roughly 1.4 octaves of every cutoff control in the app, and of the published parameter contract, are inert.

The clamp itself is correct and deliberate: the Chamberlin state-variable filter diverges to ±Inf above that bound, and Skald does not oversample or switch topology to work around it. What is missing is any signal of the reachable ceiling in the editor or the exported range. For a lowpass this costs nothing audible, since the filter is already fully open there; for a highpass it is a real ceiling on where the corner can sit. Treat about 7 kHz as the top of the control.

#### KI-038 · Resonance below about 0.55 has no audible effect
- **Status:** open · **Severity:** confusing · **Since:** 0.1
- **Chapters:** nodes/filter.md (Resonance — what you hear as you sweep it; Try it step 8)

`skald-backend/core/codegen_nodes.odin::generate_filter_code` clamps the internal damping term with `math.clamp(1.0 / math.max(resonance, 0.1), 0.05, 1.9 - f)`. The upper bound caps how low the user-facing resonance can actually go, so the effective minimum is `1/(1.9-f)` — about 0.53 at a 200 Hz cutoff, and rising as cutoff rises. The documented minimum is 0.1 everywhere.

Between roughly a third and a half of the resonance range therefore does nothing, and the exact size of the dead zone depends on the cutoff setting. Start from 0.7 when you want to hear resonance change.

### Distortion

#### KI-039 · Tone above about 7 kHz produces identical output
- **Status:** open · **Severity:** confusing · **Since:** 0.1
- **Chapters:** 50-bass-teardown.md (The controls) · nodes/distortion.md (Tone — what you hear as you sweep it; Try it step 5)

The Tone control's one-pole coefficient, `math.clamp(2.0 * math.PI * math.clamp(tone, 100, 20000) / sample_rate, 0.001, 1.0)` in `skald-backend/core/codegen_nodes.odin::generate_distortion_code`, saturates at its ceiling of 1.0 around 7,020 Hz at 44.1 kHz and 7,640 Hz at 48 kHz, at which point the filter degenerates to `y = x` and does no filtering at all. Every setting from there up to the advertised 20,000 Hz is bit-identical.

All three surfaces agree on 100–20,000 Hz, so nothing looks wrong; sweeping the top two-thirds of the documented range simply changes nothing, with no way to tell that from a broken control. Treat about 7 kHz as fully open.

#### KI-040 · Drive is clamped only on the low side
- **Status:** open · **Severity:** confusing · **Since:** 0.1
- **Chapters:** nodes/distortion.md (Drive — what you hear as you sweep it)

`skald-backend/core/codegen_nodes.odin::generate_distortion_code` emits `math.max(f32(drive), 1.0)` — a floor and no ceiling — where it clamps Tone and Mix on both sides in the same procedure. There is no `{"Distortion", "drive", ...}` row in `skald-backend/core/param_ranges.generated.odin`, so a drive value that is not exposed bypasses the generic setter clamp entirely and compiles at whatever the JSON says.

Output stays bounded for all four shapes, because the curves saturate near ±1 regardless, so nothing crashes. But the documented 1–100 range is not enforced for a non-exposed node.

#### KI-041 · The `asymmetric` shape leaves an uncorrected DC offset
- **Status:** open · **Severity:** confusing · **Since:** 0.1
- **Chapters:** nodes/distortion.md (Shape — what you hear as you switch it; Try it step 7; Terms introduced)

The asymmetric branch of `skald-backend/core/codegen_nodes.odin::generate_distortion_code` passes positive samples through untouched and attenuates only negative ones, which by construction shifts the signal's average away from zero. Nothing in the generated chain removes it: the only filter the node applies is the Tone one-pole lowpass, and the only stage downstream is the master `skald_soft_limit`, which does not block DC.

Usable and characterful at low drive. At high drive it costs headroom and can produce audible thumps at note boundaries. Keep drive moderate on this shape, or follow it with a highpass Filter set low.

#### KI-042 · `outputGain` exists in the generator with no editor control
- **Status:** open · **Severity:** cosmetic · **Since:** B1
- **Chapters:** nodes/distortion.md (Drive — what you hear as you sweep it; Going further; Terms introduced)
- **Also see:** ROADMAP.md B1 added the parameter, pinned by `skald-backend/tests/golden/distortion_output_gain.odin.golden`

`skald-backend/core/codegen_nodes.odin::generate_distortion_code` reads `outputGain` (default 1.0, so no existing patch's output changed) and `skald-backend/core/param_ranges.generated.odin` publishes it as `{0.0, 4.0, 1.0, "x"}`. The editor does not: `skald-ui/src/definitions/types.ts::DistortionParams` declares only `drive`, `shape`, `tone` and `mix`, and neither the node card nor the parameter panel offers the field.

A hand-authored or externally generated project can set and expose it. From the editor, the workaround is unchanged: put a VCA after the Distortion.

### Delay

#### KI-043 · The two-second ceiling is 96,000 samples, not two seconds
- **Status:** open · **Severity:** cosmetic · **Since:** 0.1
- **Chapters:** nodes/delay.md (delayTime; Under the hood)

The delay line is a fixed-size ring: `skald-backend/core/codegen_analysis.odin::MAX_DELAY_SAMPLES` is 96,000, the buffer field is declared in samples, and `skald-backend/core/codegen_nodes.odin::generate_delay_code` clamps `delayTime * sample_rate` against it. The real maximum is therefore sample-rate dependent — 2 s at 48 kHz, 2.176 s at 44.1 kHz, 1.0 s at 96 kHz — while every control says "seconds".

A patch authored on one device can play a shorter delay on another. Nothing in the editor states that the ceiling is in samples.

#### KI-044 · A BPM-synced delay longer than the buffer is silently clamped
- **Status:** open · **Severity:** confusing · **Since:** 0.1
- **Chapters:** nodes/delay.md (Under the hood)

`skald-backend/core/codegen_nodes.odin::generate_delay_code` substitutes the BPM-sync expression for `delayTime` and then applies the same buffer clamp. `skald-ui/src/definitions/bpm.ts::SYNC_RATE_OPTIONS` offers `1/1`, `1/2` and `1/2t`, all of which resolve past two seconds at the low end of the tempo range (`BPM_MIN` in the same file is 20), so the audible repeat stops matching the musical division. The panel's sync-time hint computes the nominal value with no awareness of the clamp, so it keeps reporting the division you chose.

Below about 120 BPM, keep a synced delay at `1/4` or shorter, or check the hint against 2 seconds yourself.

### Mixer

#### KI-045 · The per-channel `pan` field is stored and read by nothing
- **Status:** open · **Severity:** cosmetic · **Since:** 0.1
- **Chapters:** 60-complexity-ladder.md (the ladder) · nodes/mixer.md (The controls, Pan n; Going further) · nodes/panner.md (Why you patch it this way)

`skald-ui/src/definitions/types.ts::MixerChannelParams` declares `pan: number` and `skald-ui/src/definitions/node-definitions.ts` seeds `pan: 0` on every channel, so every saved file and every shipped example carries it. No control renders it, and `skald-backend/core/codegen_nodes.odin::generate_mixer_code` reads only `inputCount` and each channel's level.

That the Mixer has no per-channel pan is deliberate — see **What Skald deliberately does not do**. What is a defect is the field: it implies a control that has never existed, in every file Skald writes.

#### KI-046 · The Mixer's hand-authored fallbacks disagree between editor and generator
- **Status:** open · **Severity:** cosmetic · **Since:** 0.1
- **Chapters:** nodes/mixer.md (What it looks like in Skald, Where those numbers come from)
- **Also see:** docs/0.2-ROADMAP.md §7, "Mixer dynamic / connection-keyed model" — after per-edge `amount`

Three fallbacks differ, all of them reachable only through hand-written or hand-edited JSON, because the app always serialises the real values. A channel with no authored level shows 0.75 in the editor (`skald-ui/src/definitions/node-definitions.ts`, `skald-ui/src/components/Nodes/MixerNode.tsx::MixerNode`) and exports at unity, 2.5 dB hotter (`skald-backend/core/codegen_nodes.odin::generate_mixer_code` passes 1.0 to `::mixer_channel_level`). A node with no `inputCount` gets four channels in the editor and eight in both the generator and the validator (`skald-backend/core/graph_validate.odin::mixer_input_count`). And channels are matched by array position in the generator (`::mixer_channel_level` indexes `levels[channel-1]`) but by `id` in both editor surfaces, so a reordered `levels` array displays one mix and exports another.

If you write Mixer JSON by hand, author `inputCount` and a complete `levels` array in id order.

### VCA

#### KI-047 · Graph modulation of gain is unclamped where the exposed setter is not
- **Status:** open · **Severity:** confusing · **Since:** 0.1
- **Chapters:** nodes/gain.md (Under the hood)

`<Asset>_set_gain` clamps a game-supplied value to [0, 4], because `skald-backend/core/codegen_processor.odin::generate_processor_code` emits bound checks for every exposed parameter. `skald-backend/core/codegen_nodes.odin::generate_gain_code` applies no clamp in either arithmetic mode, so an LFO or Mapper patched into the Gain port can drive the multiplier negative — inverting the waveform — or arbitrarily high, leaving the master `tanh` limiter to catch it. The Panner, by contrast, clamps its modulated pan before use in the same file.

A game developer reading `{"gain", 0.0, 4.0, ...}` out of the `_PARAMS` table would reasonably take that as the operating envelope, which the patch itself can exceed. Bound the modulator with a Mapper if the range matters.

#### KI-048 · The sidebar promises tremolo; the obvious patch gives ring modulation
- **Status:** open · **Severity:** cosmetic · **Since:** 0.1
- **Chapters:** nodes/gain.md (Try it steps 6–8; Going further)

The palette tip reads "Gain stage — modulate the gain input for tremolo or volume control" (`skald-ui/src/components/Sidebar.tsx`). Skald's only LFO is bipolar around zero with a default amplitude of 1.0, so patched into a VCA's Gain port — in either arithmetic mode, since a positive knob preserves the modulator's sign — it swings the multiplier through zero and negative. That is ring modulation by standard classification, not tremolo.

True tremolo needs a Mapper to make the modulator unipolar, or a knob and amplitude balanced so the multiplier never crosses zero. Neither is hinted at in the UI; the VCA chapter walks through both.

### Panner

#### KI-049 · A Panner wired anywhere but Output loses its stereo image
- **Status:** open · **Severity:** confusing · **Since:** 0.1
- **Chapters:** nodes/panner.md (Under the hood; Try it step 7)

`skald-backend/core/codegen_nodes.odin::generate_panner_code` emits a stereo pair only for the Output node; any other consumer reads a mono fallback, which is now a pass-through of the raw unpanned input rather than a downmix of the two legs. So routing a Panner into a VCA, a Mixer or a Delay discards the pan position entirely, at unity gain, with nothing on the canvas to say so.

The generator does warn about this on stderr (`skald-backend/core/codegen_analysis.odin::warn_panner_mono_consumers`), but that warning never reaches the editor — see KI-004. Put the Panner last, immediately before Output.

#### KI-050 · `output_left` and `output_right` are accepted by the generator and absent from the card
- **Status:** open · **Severity:** cosmetic · **Since:** 0.1
- **Chapters:** nodes/panner.md (What it looks like in Skald)

`skald-backend/core/graph_validate.odin::valid_output_port` accepts `output_left` and `output_right` from a Panner, and `skald-backend/core/param_utils.odin` maps both names to the real variables. `skald-ui/src/components/Nodes/PannerNode.tsx::PannerNode` declares a single combined `Out` handle.

Tapping one leg of the stereo pair separately is therefore reachable only by hand-editing project JSON.

#### KI-051 · The exposed LFO amplitude range is calibrated for filter sweeps, not pan depth
- **Status:** open · **Severity:** cosmetic · **Since:** 0.1
- **Chapters:** nodes/panner.md (What "expose" does)

An LFO's exposed `amplitude` publishes a range of 0–20,000 (`skald-backend/core/param_ranges.generated.odin`), sized for sweeping a filter cutoff across the audible spectrum. A Panner's pan input is clamped to [-1, 1] (`skald-backend/core/codegen_nodes.odin::generate_panner_code`).

A game that exposes an LFO amplitude as an "auto-pan amount" therefore hands its designer a knob whose top 99.995% does nothing. Expose the Mapper's `outMax` instead, or document the useful sub-range.

### Output

#### KI-052 · Every Output node draws the same waveform
- **Status:** open · **Severity:** confusing · **Since:** 0.1
- **Chapters:** nodes/output.md (What it looks like in Skald)

`skald-ui/src/app.tsx` injects one shared `analyserNode` into every node of type `output`, `GraphOutput` or `InstrumentOutput` that lacks one, and `skald-ui/src/components/Nodes/GraphOutputNode.tsx::GraphOutputNode` renders an `AudioVisualizer` bound to it as though it were per-node metering. That single analyser is tapped after the master fader, downstream of every instrument.

So the scope reflects master-volume moves the node has nothing to do with, every Output on the canvas shows an identical trace, and it cannot be used to tell which of two instruments is hot.

#### KI-053 · Test Audio always plays middle C for 200 ms, on every instrument
- **Status:** open · **Severity:** confusing · **Since:** 0.1
- **Chapters:** 50-bass-teardown.md (Try it, Exercise 1 step 2; Exercise 3 intro) · nodes/output.md (The controls)

The button stamps `lastTrigger` (`skald-ui/src/components/ParameterPanel.tsx`), and `skald-ui/src/hooks/nodeEditor/useWasmAudioEngine.ts::useWasmAudioEngine` posts a fixed `{ type: 'trigger', asset: -1, note: 60, velocity: 1.0, duration: 0.2 }` in response. The `asset: -1` means all assets, which `skald-ui/src/hooks/nodeEditor/audioWorklets/skaldWasm.worklet.ts` expands to every instrument in the project.

For a bass patch with a low cutoff and a release longer than 200 ms, the audition is both the wrong octave and shorter than the patch's own decay, and in a multi-instrument project it fires everything at once. It verifies that something comes out; it does not tell you what the patch sounds like. Use the sequencer, or a MIDI keyboard, to audition properly.

## Resolved before 0.2

| Was | Fixed by | Chapters that said otherwise |
|---|---|---|
| Reverb's Pre-Delay was a rendered, exposable, completely inert control. | P1/B5 | nodes/reverb.md (The controls, Try it step 8, Going further, Terms introduced) · 60-complexity-ladder.md |
| An exposed Pre-Delay published the unknown-parameter ±1,000,000 fallback as its range. | P1/B5 | nodes/reverb.md (The controls) |
| Reverb `decay` inherited the ADSR envelope's shared range row, so `_PARAMS` advertised a 0.1 s default. | C2 | nodes/reverb.md (The controls, What you hear as you sweep Decay) · 00-foundations.md |
| The generated Odin labelled the reverb "Simple FDN", which it never was. | B7 (comment corrected alongside the pre-delay work) | nodes/reverb.md (Under the hood) |
| An Oscillator or Wavetable exposed `frequency` and minted a public setter the DSP never read unless Fixed Pitch was on. | B2 | nodes/oscillator.md (Code-vs-intent) · nodes/wavetable.md (Code-vs-intent) |
| A Sine or Sawtooth Oscillator exposed a `pulseWidth` setter nothing read. | B2 | nodes/oscillator.md (Code-vs-intent) |
| An exposed LFO `frequency`, or Sample & Hold or Delay time, under BPM sync minted a setter that silently did nothing. | B2 | nodes/lfo.md · nodes/sampleHold.md · nodes/delay.md (What "expose" does) |
| `bpmSync` and `syncRate` could be exposed, minting a dead float field. | B2 | nodes/lfo.md |
| A MIDI Input node shipped `device` and `useMpe` exposed by default and they could not be un-exposed. | B2 (SKB-059) | nodes/midiInput.md (Exposing a parameter) |
| The exported `pulseWidth` setter advertised 0–1 where the DSP compared against 0.01–0.99. | A8 | nodes/oscillator.md (The controls, `pulseWidth` row) |
| A runtime `set_attack(p, 0.0)` clamped an instant attack up to 1 ms. | A8 | nodes/adsr.md |
| Exposing an untouched Noise `amplitude` initialised the field to 0.5, silently halving it. | SKB-051 | nodes/noise.md (The controls, `amplitude` row) |
| Nothing in the generated code limited output, so summed layers hard-clipped. | B1 | nodes/noise.md (Try it step 7, Where it goes wrong) |
| Project master volume was a compile-time constant with no runtime setter. | B1 | nodes/output.md |
| The preview multiplied the master fader on after the limiter where the export multiplied before it, so every setting but unity played louder and less saturated than what was tuned by ear. | B1 (SKB-011) | nodes/output.md |
| The three ADSR defaults the editor created a node with disagreed with the range table the export published. | C2 | nodes/adsr.md (The controls) |
| A sustain of 0 marked the envelope, and the whole voice, Idle at the end of Decay, discarding the Release stage. | C6-4 (SKB-041) | nodes/adsr.md (The controls, Sustain; Try it step 7) |
| Voice stealing took the oldest voice by age even when a releasing voice was available. | C6-1 (SKB-030) | nodes/instrument.md |
| A fresh voice did not reset LFO phase or Sample & Hold state. | C6-2 | nodes/lfo.md (One LFO per voice) · nodes/sampleHold.md |
| A per-voice LFO feeding a bus-domain node was either left per-voice or rejected, so auto-pan and filter-sweep depth scaled with polyphony. | B7-3 (SKB-017) | nodes/lfo.md (One LFO per voice) · nodes/panner.md (Try it step 8) |
| The ADSR's input handle was labelled "Gate", inviting a trigger wire into what is an audio multiply port. | A7 | nodes/adsr.md (What it looks like in Skald, Terms introduced) |
| The shipped `sax3.json` wired MIDI Pitch into an Oscillator's Freq port, transposing every note twice. | B8-2 (SKB-015) | nodes/midiInput.md (Try it steps 4–5) |
| The shipped `sax3.json` wired MIDI Gate into an ADSR's input, multiplying the release tail by zero. | B8-2 (SKB-015) | nodes/midiInput.md (Try it step 8) |
| Twenty-four loose-graph examples with no Instrument node could not be played or generated from the editor. | B6-1 (SKB-019) | 60-complexity-ladder.md (the ladder) · nodes/lfo.md (Try it, intro) |
| The Piano Roll drew only MIDI 21–84, so notes outside an 88-key piano had no clickable row. | B5-3 (SKB-026) | 50-bass-teardown.md (Try it, Exercise 4 step 6) |
| The Wavetable card showed "Amp 0" for a node the generated code played at 1.0. | C5 | nodes/wavetable.md |
| The Wavetable had no Amplitude control in the parameter panel and could not expose one. | C5 | nodes/wavetable.md (What "expose" does) |
| The FM Operator had no output-level parameter and no `input_amp` port. | C5 | nodes/fmOperator.md |
| Exposing a Mixer channel level froze the fader, because the `_PARAMS` default came from the generic unity fallback rather than the channel's authored level. | P3/B4 | nodes/mixer.md · 50-bass-teardown.md |
| Mixer channel levels could not be exposed from the sequencer's Step Properties editor. | SKB-043 | 60-complexity-ladder.md (the ladder) |
| The parameter panel's Mixer fader stopped at 1.0 where the canvas control and the exported clamp reached 2.0. | P2/B3 | nodes/mixer.md (What it looks like in Skald, Where those numbers come from) |
| A duplicate Mixer branch in `ParameterPanel` shadowed the shared control component, so Inputs was not editable from the panel. | B11 | nodes/mixer.md |
| The Mapper's panel sliders were bounded at ±10,000 and could not reach the node's own 20,000 default, halving it on first touch. | B11 | nodes/mapper.md (Where you edit them; Try it step 9) |
| Mapper exposure was offered by one panel path and refused by another. | B11 | nodes/mapper.md |
| The parameter panel's Distortion Tone slider disagreed with the node card and the exported range. | P2/B3 | nodes/distortion.md (The controls, Tone row) |
| Distortion had no golden-file or fixture coverage at all. | B1 | nodes/distortion.md |
| The parameter panel's Delay Time slider offered 0.001–5 s for a buffer that holds 2 s. | P2/B3 | nodes/delay.md (The controls, Delay Time row) |
| The exported Delay feedback setter advertised 0–0.99 where the DSP clamped at 0.95. | C2 | nodes/delay.md (The controls, Feedback row) |
| Instrument `voiceCount` and `glide` ranges disagreed between the UI slider and the exported clamp, and `voiceCount` reached 64 in the backend. | C2 | nodes/instrument.md · 00-foundations.md (The controls) |
| VCA `input_gain` was additive only, so a fresh VCA at its 0.75 default droned: the multiplier rode `0.75 + envelope` and never reached zero. | C4 | nodes/gain.md (Try it steps 3–4) |
| "Create Group" was enabled for a single selected node and silently did nothing. | (grouping fix, `skald-ui/src/hooks/nodeEditor/useNodeComposition.ts::handleCreateGroup`) | nodes/instrument.md |
| The Sample & Hold node had no test coverage asserting any of its ranges. | C2 (schema, range-parity and plock-target suites) | nodes/sampleHold.md |
| The pan law put centre at −3 dB with bare `cos`/`sin`. | B7-1 (SKB-013) | nodes/panner.md (What it is; What you hear as you sweep Pan; Try it steps 4 and 6; Under the hood; Terms introduced) |
| A Panner feeding a mono consumer handed it an attenuated `(L+R) × 0.7071` downmix. | B7-1 | nodes/panner.md (Under the hood; Try it step 7) |

## Not issues

Two kinds of thing deliberately do not appear above. **Design limits** — no oversampling, mono signal flow with a single terminal pan, string-typed parameters compiled in rather than settable at runtime, no dotted sync divisions, and the rest — are decisions with reasons, and they are collected in **What Skald deliberately does not do** so that they read as decisions rather than as a backlog. And the component stubs under `skald-ui/new_docs/` are stale internal scaffolding, not user-facing documentation: every file there describes a one-prop, no-output component from an earlier version of the node framework, none of it is reachable from this manual, and nothing in it should be used as a reference for any node's ports, fields or behaviour — the node chapters here and the source they cite are the reference.
