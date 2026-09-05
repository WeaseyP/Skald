# Output / graph ports

> The place where your patch stops being a pile of wires and becomes a sound your speakers can play — and, when you group nodes into an Instrument, the labelled sockets that let one patch plug into another.

## What it is

Everything you have built so far has been a *chain*: something makes a tone, something else colours it, something else shapes it in time. But a chain that ends in mid-air makes no sound. At some point the signal has to arrive somewhere and be handed over — to a soundcard, to a file, to the game engine's mixer. That handover point is the **output stage**, and in every audio system that has ever existed it is the last thing in the signal path and the one thing you cannot patch around.

In a recording studio the equivalent is the **master bus** (also called the mix bus or stereo bus): the single stereo pair where every channel of the desk is summed together before it leaves the building. Individual tracks each have their own fader, but they all land in the same two numbers in the end, and those two numbers are what gets printed [Source: https://audiodramaproduction.com/audio-mixing-and-mastering-glossary/master-bus/]. The master bus does not create anything. It only *adds*. That is its whole job, and it is also its whole danger.

Here is why adding is dangerous. Audio samples are just numbers, and in a digital system those numbers have a hard ceiling — conventionally ±1.0, "full scale". Two signals summed do not politely stay under the ceiling; they add. Play one note at half strength and you are at 0.5, safely under. Play an eight-note chord with the same patch and you are at 4.0, four times over the ceiling. The distance between where your signal usually sits and where the ceiling is, is called **headroom**, and the standard studio advice is to leave a lot of it: keep individual channels peaking around −12 to −18 dBFS so that the summing bus has room to breathe [Source: https://www.soundonsound.com/techniques/gain-staging-your-daw-software]. The habit of setting sensible levels at every stage of the chain, rather than fixing it all at the end, is called **gain staging**.

When you run out of headroom you get **clipping**: the parts of the waveform that would have gone past the ceiling get chopped flat. Digitally this is brutal — it "produces anharmonic distortion which sounds very ugly", and unlike a hot analogue desk it is not recoverable by turning it down afterwards, because the tops of the waves are already gone [Source: https://www.soundonsound.com/techniques/gain-staging-your-daw-software]. So most digital systems put something in front of the ceiling to catch overshoots gracefully. Skald uses a **soft clipper**: a curve that is nearly a straight line for small signals and bends smoothly over as the signal grows, so the corners of the waveform are rounded rather than sawn off [Source: https://ccrma.stanford.edu/~jos/pasp/Soft_Clipping.html]. Soft clipping still distorts — it just distorts musically, adding lower-order harmonics that fuse into the tone instead of the harsh high-order splatter a hard clip produces.

The mental picture worth carrying: the Output node is a **funnel with a soft rubber rim**. Every wire you drop into it pours into the same two channels. Nothing is thrown away and nothing is automatically turned down. Skald puts a rim at the end of *every* funnel now — each asset gets its own, and the whole project gets a second one downstream of that — but the rim still works the same way: it stops the funnel overflowing by squashing whatever is pouring through, and squashing is audible.

The second idea in this chapter is what happens when a patch stops being the *whole* project and becomes a *part* of one. When you group nodes into an Instrument in Skald, the wires that used to cross into and out of that group have to end somewhere — so Skald replaces them with named ports: **Input** nodes on the inside for signals coming in, **Output** nodes on the inside for signals going out. This is exactly the idea of a studio **patchbay**: a panel of labelled sockets where each piece of gear's outputs and inputs are brought out to one place, so you can rewire the studio by moving a short cable instead of crawling behind a rack [Source: https://www.soundonsound.com/techniques/patchbays-modern-studio]. A patchbay does not process anything either. It is pure naming and pure connection — and, like Skald's ports, its usefulness comes entirely from the discipline of always knowing which socket carries what.

## What it looks like in Skald

Drag it in from the sidebar's node palette, listed as **Output** with the tooltip "Connects the patch to the master output" (`skald-ui/src/components/Sidebar.tsx::paletteNodes`). It is the last entry before MIDI Input in the palette list. On the canvas it is a burnt-orange card — the palette colour is literally commented "destination" (`skald-ui/src/components/Nodes/NodeStyles.ts::NODE_ACCENTS`, `output: '#F97316'`).

It has exactly one port and no outputs at all (`skald-ui/src/components/Nodes/GraphOutputNode.tsx::GraphOutputNodeComponent`):

| Port | Handle id | Side | Carries |
| --- | --- | --- | --- |
| **In** | `input` | left | anything you want to be audible |

That single handle is the only input the backend will accept. The validator lists `GraphOutput` alongside Delay, Reverb, Distortion and Mapper in the "through" group, whose only legal target port is `"input"` (`skald-backend/core/graph_validate.odin::valid_input_ports`); a wire aimed at any other port name is a hard codegen error rather than a silently dropped connection.

**The In handle accepts as many wires as you like, and it sums all of them.** The UI puts no limit on connections into a target handle (`skald-ui/src/hooks/nodeEditor/useGraphState.ts::useGraphState`), and the generator walks every source and emits an `+=` for each one (`skald-backend/core/codegen_nodes.odin::generate_graph_output_adds`). So the Output node is also, quietly, a mixer with no level controls.

Below the handle sits a small **oscilloscope** — a live plot of the waveform, with the spectrum view switched off (`skald-ui/src/components/Nodes/GraphOutputNode.tsx::GraphOutputNodeComponent`). One thing to know before you trust it: this is not a meter on *this node's* signal. The app injects one single shared `AnalyserNode` into every Output node in the project (`skald-ui/src/app.tsx::EditorLayout`), and that analyser is tapped after the master gain, downstream of every instrument (`skald-ui/src/hooks/nodeEditor/useWasmAudioEngine.ts::useWasmAudioEngine`). Every Output node on your canvas draws the identical picture, and that picture is the project master. It is genuinely useful — it is how you *see* clipping — but read it as "the master scope, drawn here" rather than "what this wire carries". A second, separate meter — a stereo peak-hold bar with a clip LED, added by packet B10 — lives in the transport dock at the bottom of the window rather than on any node, tapped from the same worklet output the export produces (`skald-ui/src/components/Sequencer/SequencerDock.tsx::SequencerDock`, `skald-ui/src/components/Visualization/PeakMeter.tsx::PeakMeter`).

Selecting the node shows a Parameter Panel with no parameters, just the words "Main Audio Output" and a **Test Audio** button (`skald-ui/src/components/ParameterPanel.tsx::ParameterPanel`). The button stamps a timestamp into the node's data, which the audio engine watches for and turns into a preview note: middle C (MIDI 60), full velocity, 0.2 seconds (`skald-ui/src/hooks/nodeEditor/useWasmAudioEngine.ts::useWasmAudioEngine`). Note that it is addressed to asset `-1`, which the worklet expands to *every* asset in the project (`skald-ui/src/hooks/nodeEditor/audioWorklets/skaldWasm.worklet.ts::SkaldWasmProcessor`) — so the button on one Output node auditions the whole project, not just the instrument it lives in.

**Audio rate or control rate?** Neither, strictly — the Output node is not a processor. It is an accumulation statement that runs wherever its sources run. It is the only node type in Skald that can appear in *both* execution domains at once: the per-voice loop and the once-per-sample bus block. The dispatch loop explicitly refuses to skip it — GraphOutput is never skipped even when it lives in the bus domain (an effect feeds it), because its voice-domain sources must still be summed there (`skald-backend/core/codegen_nodes.odin::generate_graph_output_adds`, dispatched from both passes in `skald-backend/core/codegen_processor.odin::generate_processor_code`). Everything else has to pick a side.

### The other two: Input and Output ports inside an Instrument

Select one or more nodes and press **Create Instrument** in the sidebar (`skald-ui/src/components/Sidebar.tsx::Sidebar`). Skald folds them into a single Instrument node and, for every wire that used to cross the boundary, creates a matching port on the inside: an `InstrumentInput` node for each incoming wire and an `InstrumentOutput` node for each outgoing one, each given a unique name derived from the handle it replaced (`skald-ui/src/hooks/nodeEditor/useNodeComposition.ts::useNodeComposition`).

These are the same node under a different label. `InstrumentOutput` compiles to the same `GraphOutput` type as the main Output node (`skald-ui/src/definitions/node-definitions.ts::NODE_DEFINITIONS`), and the backend's type normaliser maps `"output"`, `"GraphOutput"` and `"InstrumentOutput"` all onto one string (`skald-backend/core/json.odin::normalize_node_type`). `InstrumentInput` becomes `GraphInput`, which is a *source only* — it has no input ports at all (`skald-backend/core/graph_validate.odin::valid_input_ports`) and reads whatever the host game most recently pushed in, downmixed from stereo to mono: `node_<id>_out = (p.ext_in_l + p.ext_in_r) * 0.5` (`skald-backend/core/codegen_processor.odin::generate_processor_code`), fed by a generated `<Asset>_feed_input(p, l, r)` procedure (`skald-backend/core/codegen_processor.odin::generate_processor_code`).

A `GraphInput` also changes where the whole downstream chain runs. It seeds the bus domain, alongside Delay and Reverb, because external audio is voice-independent and must keep flowing when no voice is active (`skald-backend/core/codegen_analysis.odin::seed_bus_domain`). That is why an effect instrument keeps processing when nothing is playing, and why oscillators and envelopes are rejected downstream of it with a loud error (`skald-backend/core/codegen_analysis.odin::compute_bus_domain`).

## The controls

| Parameter | Range | Default | Unit | What it does to the sound |
| --- | --- | --- | --- | --- |
| *(none)* | — | — | — | The Output node has no parameters at all. |

That is not an omission in this table. A newly dragged Output node's default parameter object is one empty field — `exposedParameters: []` and nothing else (`skald-ui/src/definitions/node-definitions.ts::defaultOutputParams`). Its TypeScript shape carries only an optional `lastTrigger`, which is the Test Audio button's timestamp, not a sound parameter (`skald-ui/src/definitions/types.ts::OutputParams`). And the serialiser that builds the JSON for codegen throws even that away: for an output node, `parameters = {}` (`skald-ui/src/utils/projectSerializer.ts::formatNodesForCodegen`). Nothing you could put on this node reaches the backend. There is no matching entry in the backend's range table either — the schema's node-specific overrides have no `output`/`GraphOutput` row and no output-related parameter name (`schema/nodes.json::overrides`).

So the loudness controls that *do* apply at the output stage live elsewhere. There are four of them now, and knowing which is which will save you an hour:

| Control | Where it lives | Range | Default | Applied where |
| --- | --- | --- | --- | --- |
| **VCA `gain`** | a Gain node you place before Output | 0.0 – 4.0 × | 1.0 (codegen fallback) | inside the instrument, per voice (`schema/nodes.json::generic`) |
| **Instrument `volume`** | the Instrument node's panel | floored at 0.001 | 1.0 | on the asset's returned stereo pair, as a live runtime field (`skald-backend/core/codegen_processor.odin::generate_processor_code`) |
| **Per-asset soft limit** | not a control — always on unless `limit: false` is authored | — | on | the last line of every asset's own `_process`, ahead of the project mix (`skald-backend/core/codegen_project.odin::emit_soft_limit_proc`) |
| **Master Volume** | the transport dock, bottom of the window | 0 – 1, step 0.01 | 0.8 | inside the *project's* soft clipper, a second stage downstream of every asset's own (`skald-ui/src/components/Sequencer/SequencerDock.tsx::SequencerDock`; `skald-ui/src/hooks/nodeEditor/useSessionSettings.ts::DEFAULT_SESSION`; `skald-backend/core/codegen_project.odin::generate_project_code`) |

### What you hear as you sweep them

**Master Volume, 0 → 0.3.** Quiet, and completely clean. Down here the soft clipper is indistinguishable from a wire: `tanh(0.2)` is 0.197 — a 1.3% deviation from the input, about a tenth of a dB. Nothing is being coloured; you are just listening at a lower level.

**Master Volume, 0.3 → 0.7.** The useful working zone. `tanh(0.5)` is 0.462, roughly 0.7 dB of gentle compression on peaks only. Sustained tones are untouched; transients get very slightly rounded. This is where you want to sit while you work, because it leaves the character of the patch alone. The default of 0.8 is at the top of this zone.

**Master Volume, 0.7 → 1.0, with a hot patch.** Now the curve bites. Once the summed signal reaching the clipper is around 1.0, the output is 0.762 — you are losing about 2.4 dB of peak and gaining harmonics in exchange. On a sine wave this is very easy to hear because a sine has nothing but its fundamental to begin with: the moment it saturates you get a reedy, hollow buzz appearing underneath the pure tone. The maths behind that is worth knowing — `tanh` is an *odd* function, so a symmetric waveform pushed through it gains only **odd harmonics** (3rd, 5th, 7th …), which is the same harmonic family a square wave is made of. That is why an over-driven sine sounds like it is turning into an organ, then a clarinet, then a square.

**Anything past that.** `tanh(2.0)` is 0.964 and `tanh(4.0)` is 0.99933. The waveform is now essentially a square with rounded shoulders; the scope on the Output node shows flat tops. It will never actually exceed 1.0 — that is the point of the design, and the generator's own comment says so plainly: a previous formula that scaled inside the `tanh` and rescaled afterwards "topped out at 1.43 and still clipped the device" (`skald-backend/core/codegen_project.odin::emit_soft_limit_proc`). You will not hear a crackle from your soundcard. You will hear the patch stop being your patch. And since packet B1, this can now happen twice on the way out: a hot instrument saturates against its *own* per-asset limiter first, then the project mix — already softened once — is summed with every other instrument and can saturate again against the master limiter if the combination is hot enough.

One caution that the code does not handle for you: those new harmonics are generated at full sample rate with no oversampling — the limiter is a bare `math.tanh` (`skald-backend/core/codegen_project.odin::emit_soft_limit_proc`). Harmonics that land above half the sample rate fold back down as **aliasing** — inharmonic tones at frequencies unrelated to the note, which move the *wrong way* when you play up the keyboard. On a heavily saturated high note you can hear it as a metallic shimmer that descends as your melody ascends. Soft clipping is chosen partly because it produces fewer high-order harmonics than hard clipping and therefore aliases less, but "less" is not "none" [Source: https://ccrma.stanford.edu/~jos/pasp/Soft_Clipping.html].

**Instrument volume** is the right control for balancing one asset against another, because it is applied before the master clipper's second pass, and — since B1 — before that asset's *own* per-asset limiter too (`skald-backend/core/codegen_processor.odin::generate_processor_code`): pulling a hot drum kit down here keeps it out of both stages of saturation instead of fighting either. Unlike the pre-B1 design, this control is no longer baked into the export as a bare float — see "What 'expose' means" below.

### What "expose" means, and why Output has nothing to expose

Marking a parameter as exposed puts it in the node's `exposedParameters` list, which the backend turns into three things on the generated asset: a typed field on the processor struct, a `<Asset>_set_param(p, "name", value)` / `_get_param` pair, and an entry in a `<Asset>_PARAMS` introspection table your game can iterate at runtime to discover what is tweakable (`skald-backend/core/codegen_processor.odin::generate_processor_code`, `skald-backend/core/codegen_project.odin::emit_exposed_param_contract`). Exposure is how a patch stops being a fixed sound effect and becomes a knob your game code can turn — engine RPM driving a filter cutoff, player health driving a detune amount.

The Output node has no parameters, so there is nothing to tick, and the serialiser blanks its parameter object anyway (`skald-ui/src/utils/projectSerializer.ts::formatNodesForCodegen`). That does not mean the final level is stuck at build time any more, though. Since packet B1 (SKB-011), every asset carries a live `volume` field on its processor struct, initialised from the Instrument's panel value and adjustable at runtime with a dedicated setter — `<Asset>_set_volume(p, value)`, clamped to `[0.0, 1.0]` (`skald-backend/core/codegen_processor.odin::generate_processor_code`) — and the project as a whole carries the equivalent `project_set_master_volume` (export) and `skald_set_master_volume` (the editor's own wasm preview shim, `skald-backend/core/codegen_project.odin::generate_project_code`, `::generate_wasm_shim_code`). Both apply their fader **inside** the DSP graph, at the same mix point and with the same `tanh(volume · signal)` formula the editor's live preview uses when you move the transport dock's slider — there is no separate post-worklet JS `GainNode` doing its own multiplication any more (`skald-ui/src/hooks/nodeEditor/useWasmAudioEngine.ts::useWasmAudioEngine`, which spells out why that used to disagree with the export: `tanh` is concave, so `volume·tanh(x)` and `tanh(volume·x)` only ever matched at `volume ∈ {0, 1}`).

So: **you no longer need a VCA in front of Output just to get a runtime fader.** `<Asset>_set_volume` gives you one for free on every asset, and `project_set_master_volume`/`skald_set_master_volume` gives you one for the whole mix. Reach for an exposed VCA `gain` instead when you want more than one instrument-wide level — a "tremolo depth" or a per-layer duck that `volume` alone cannot express, or when you want the knob to live on a specific node in the graph rather than at the asset boundary.

## Try it (hands-on)

Ten minutes. Open `examples/instruments/bass/sine-sub-bass.skald.json` (**Open File...** in the sidebar's Graph Actions section). It is deliberately tiny: an Oscillator, an ADSR, and an Output, wired in a line (`examples/instruments/bass/sine-sub-bass.skald.json::edges`) — and, notably, with no Instrument node wrapping any of it.

1. **Look at what you loaded.** Three nodes. `osc_1` is a Sine with `frequency: 440`; `adsr_1` has attack 0.01, decay 0.1, sustain 1.0, release 0.2; `output_1` is a bare Output. The wires run `osc_1 → adsr_1 (input)` and `adsr_1 → output_1 (input)`. Click the Output node once: the panel on the right says "Main Audio Output" and offers a single Test Audio button, confirming it has no controls.

2. **Press Play — and notice it does not refuse outright.** Since packet B6-1 (SKB-019), a loose canvas with no Instrument node at all is auto-wrapped into one SFX asset named `Asset` and played (`skald-ui/src/utils/projectSerializer.ts::buildProjectData`). You will hear the patch. What you are missing, though, is everything an Instrument gives you: a name, an Export ID, polyphony, and a node you can actually open, rename, or drop more nodes inside. The lesson of this chapter is still structural — an Output node terminates a *patch*, but only an **Instrument** is a thing the editor can let you build further or the export can name. A genuinely empty canvas (zero nodes at all) is the one shape that really does refuse, with "No instruments on the canvas. Wrap nodes in an Instrument before playing." (`skald-ui/src/hooks/nodeEditor/useWasmAudioEngine.ts::useWasmAudioEngine`).

3. **Wrap it properly.** Rubber-band-select all three nodes (drag a box around them), then click **Create Instrument** in the sidebar and give it a name. The three nodes vanish into one Instrument card. Nothing was lost — the Output node is now *inside* the instrument's subgraph, and because you selected all three there were no boundary-crossing wires, so Skald had no reason to create any named ports (`skald-ui/src/hooks/nodeEditor/useNodeComposition.ts::useNodeComposition` only makes ports for external edges).

4. **Press Play, then Test Audio.** You need the Output node's button, which is now inside the instrument — select the Instrument and find the Output in its Internal Nodes list, or just play a note from a MIDI keyboard. You hear a short, clean, pure tone. Watch the scope: a smooth sine, comfortably short of the top and bottom of the display. That is a well-gain-staged signal. (If you expected 440 Hz: the oscillator's `frequency` field is inert unless `fixedPitch` is set — pitch follows the played note, and Test Audio plays middle C (`skald-backend/core/codegen_nodes.odin::generate_oscillator_code`; `skald-ui/src/hooks/nodeEditor/useWasmAudioEngine.ts::useWasmAudioEngine`). The Oscillator chapter covers why.)

5. **Move the master fader and watch the scope.** Drag the **Volume** slider in the transport dock at the bottom from 0.8 down to 0.2 and back. The waveform on the Output node's scope shrinks and grows with it — proof that the scope is tapped after the master gain, not at the node. Leave it at 0.8.

6. **Now build up some level.** Drag a **VCA** from the sidebar onto the canvas… except the patch is inside an Instrument now. Easier: select the Instrument and click **Explode Instrument** to get your three nodes back on the canvas, drop a VCA between the ADSR and the Output (delete the `adsr_1 → output_1` wire, then wire ADSR → VCA In and VCA Out → Output), re-select everything and Create Instrument again. Set the VCA's gain to **1.0** and audition. It sounds identical to step 4 — a gain of 1.0 is a wire.

7. **Break it: push the VCA to 4.0.** That is the top of the legal range (`schema/nodes.json::generic`). Audition again. Two things happen at once. The scope's sine develops **flat tops and bottoms** — you are watching the per-asset `tanh` limiter saturate (`skald-backend/core/codegen_project.odin::emit_soft_limit_proc`). And the tone changes character: the pure sine acquires a hard, reedy buzz that sits above the fundamental. Those are the odd harmonics the soft clipper is manufacturing. Sweep the VCA slowly from 1.0 to 4.0 and listen for the moment it stops being "louder" and starts being "different" — somewhere around 2.0 the loudness stops increasing much at all, because the limiter's ceiling is 1.0 and you are only trading level for distortion. **This is what "running out of headroom" sounds like.** Pull it back to 1.0.

8. **Break it a second way: sum two wires into one Output.** With the VCA at 1.0, drag a *second* wire straight from the Oscillator's output to the Output node's In handle, so Output now receives both the enveloped signal and the raw oscillator. Audition. The note is louder — you just added two copies of related material — but the interesting failure is the *shape*: the raw oscillator copy is not enveloped, so the note now begins and ends with a hard **click**, and the attack you carefully set to 0.01 s is gone. The Output node did not warn you and did not mix; it added (`skald-backend/core/codegen_nodes.odin::generate_graph_output_adds`). This is why the envelope, or the VCA, must be the **last** thing before the output — anything that bypasses it bypasses the shaping for the entire patch. Delete the extra wire.

9. **Optional, if you have a MIDI keyboard.** Set the instrument's voice count to 8 and play a four- or five-note chord with the VCA back at 1.0. Each voice adds its own `output_left +=` inside the voice loop (`skald-backend/core/codegen_nodes.odin::generate_graph_output_adds`, see `skald-backend/tests/golden/adsr_sine.odin.golden::Asset_process` for the emitted line), so five voices is five times the level of one, before either limiter has a say. You will hear the per-asset limiter engage on the chord even though every single note was clean on its own. The classic fix is exactly the one studio engineers use: leave headroom at the source. Drop the VCA to around 0.25 and the chord is clean again — at the cost of single notes being quieter, which is the trade every polyphonic instrument makes [Source: https://en.wikipedia.org/wiki/Headroom_(audio_signal_processing)].

## Why you patch it this way

**Exactly one Output node, at the end, fed by exactly one wire.** That is the shape you should default to. Everything upstream of it should already be balanced, because the Output node offers you no way to fix a balance problem. If you have three sources you want at different levels, put a **Mixer** in front of the Output and use its per-channel faders; if you want a level your game can move without giving it a whole VCA to reach for, remember the Instrument's own `volume` is exposed at runtime by default now (`<Asset>_set_volume`). The Output node is the destination, not a mix stage.

**Order matters, and it matters in one direction.** Sound-shaping happens upstream; the Output only adds. Concretely:

- **Oscillator/Noise → ADSR or VCA → Output** is the minimum viable voice. If the envelope is not the last thing before the output (or before the effects that feed the output), notes will click, because something un-enveloped is reaching the funnel.
- **… → Panner → Output** is how you get real stereo. The Output generator special-cases a Panner source and routes its left and right variables separately (`skald-backend/core/codegen_nodes.odin::generate_graph_output_adds`); you can see two panners summed into one output in `skald-backend/tests/golden/dual_panner.odin.golden::Asset_process`. **Every other source type is broadcast identically to both channels** — so a patch with no Panner is mono, duplicated. Put the Panner last, immediately before Output, or its stereo image gets flattened back to mono by whatever mono node you routed it through afterwards.
- **… → Delay/Reverb → Output** moves the tail into the bus domain. Delay and Reverb hold one shared buffer on the processor, so they run once per sample after the voices are summed, not inside the voice loop — otherwise the delay time would be divided by the active-voice count, voices would bleed into each other's feedback, and the tail would be hard-cut the instant the last voice dies (`skald-backend/core/codegen_analysis.odin::seed_bus_domain`). The Output node then gets summed in *both* places: a voice-loop pass for any dry sources and a bus pass for the wet ones. You can see both halves in `skald-backend/tests/golden/delay_tail.odin.golden::Asset_process`.
- **Get the order wrong and codegen stops you.** Wire an Oscillator, ADSR, FM Operator, Wavetable or MIDI Input *downstream* of a Delay/Reverb and the build fails with a specific message telling you to move it upstream (`skald-backend/core/codegen_analysis.odin::compute_bus_domain`). This is deliberate: those nodes are per-voice and there is no single voice on the bus. Earlier versions silently dropped them.

**A patch with no Output node is not an error — it is silence.** Nothing sums into `output_left`, which is initialised to 0.0 and stays there (`skald-backend/core/codegen_processor.odin::generate_processor_code`). The generator is loud about unknown node types and illegal ports but says nothing about a missing destination — see KI-008. If your asset builds fine and plays nothing, check for a disconnected Output first.

**For sub-graph ports, name them after what they carry.** Skald derives port names from the handle the wire came from, so you get `input`, `input_cutoff`, `output`, `output_2` (`skald-ui/src/hooks/nodeEditor/useNodeComposition.ts::useNodeComposition`). Those defaults are fine for a single-in/single-out instrument and confusing for anything else — rename them in the Instrument's panel the way you would label a patchbay row, because the name is the *only* thing distinguishing one port from another once the instrument is collapsed. See KI-009 and KI-010 for two rough edges in this area.

## Going further

**Give yourself a master fader your game can move — you probably already have one.** Every asset now exposes `<Asset>_set_volume` and the project exposes `project_set_master_volume` / `skald_set_master_volume` for free (`skald-backend/core/codegen_processor.odin::generate_processor_code`, `skald-backend/core/codegen_project.odin::generate_project_code`, `::generate_wasm_shim_code`). Reach for a VCA in front of the Output, exposed, only when you want a *second*, independently addressable level inside one asset — a music layer that ducks under dialogue while the asset's own `volume` is doing something else, for instance.

**Use the summing deliberately.** Because the In handle adds every wire, you can build a dry/wet blend without a Mixer: run the dry signal straight to Output, and the same signal through a Reverb to Output as well. The reverb's own wet/dry mix then acts as a *send level* rather than an insert balance. Watch your gain — you are now feeding the funnel twice.

**Layer, then re-balance.** The standard way to thicken a patch is two or three oscillators with different waveforms and slightly different octaves. Each one you add is another `+=` at the output. The discipline is to drop every layer's level as you add layers, not to fix it at the master; a three-layer patch at 0.33 each sums to the same place a one-layer patch at 1.0 did, and stays out of either limiter.

**Split the stereo field before the funnel.** Two Panners hard-left and hard-right, each fed by its own oscillator layer, both wired into the same Output, gives you a genuinely wide sound that a single mono chain cannot. The generator handles this correctly — both panners' L/R pairs are routed independently and summed (`skald-backend/tests/golden/dual_panner.odin.golden::Asset_process`). Modulate one Panner's pan input from a slow LFO and the image drifts.

**Build an effect asset with an Input port.** Select a Reverb or Delay chain, wire something into it, and Create Instrument: the incoming wire becomes an `InstrumentInput`, the outgoing one an `InstrumentOutput`, and the generated asset gains a `<Asset>_feed_input(p, l, r)` procedure (`skald-backend/core/codegen_processor.odin::generate_processor_code`, documented in the generated header by `skald-backend/core/codegen_project.odin::generate_project_code`). Your game can then push any audio at all through your patch — footsteps, dialogue, another Skald asset — one stereo sample at a time. Remember the input is downmixed to mono on the way in, so a stereo source loses its width at the door; if you need stereo processing, build two mono chains and pan them at the end.

**Use saturation on purpose.** The per-asset and master limiters are soft clippers, and soft clippers are also a mixing tool — a little bit of it glues a mix and adds warmth. If you want that character deliberately rather than accidentally, use the **Distortion** node (which is a `tanh` waveshaper with a drive control and a tone filter, `skald-backend/core/codegen_nodes.odin::generate_distortion_code`) somewhere upstream, and keep both limiter stages out of saturation. Distorting on purpose at a controlled point beats distorting by accident at the last one — or the second-to-last one, now that there are two.

## Under the hood

The Output node compiles to nothing but addition. For each wire feeding it, the generator emits one pair of lines (`skald-backend/core/codegen_nodes.odin::generate_graph_output_adds`):

```odin
output_left  += node_<source>_out
output_right += node_<source>_out
```

— unless the source is a Panner, in which case it takes the stereo pair instead:

```odin
output_left  += node_<source>_out_left
output_right += node_<source>_out_right
```

`output_left` and `output_right` are two plain floats declared at the top of the asset's `_process` procedure and zeroed every sample (`skald-backend/core/codegen_processor.odin::generate_processor_code`). The generator is called twice — once inside the per-voice loop, filtering for voice-domain sources, and once inside the post-voice bus block, filtering for bus-domain sources, both dispatched from `generate_processor_code`. Because the first call is inside `for v_idx in 0..<polyphony`, **each active voice adds its own contribution**: eight voices means eight `+=` executions per sample. That single fact is the whole reason polyphonic patches clip when monophonic ones do not.

The asset then applies its own volume and its own limiter as it returns (`skald-backend/core/codegen_processor.odin::generate_processor_code`):

```odin
return skald_soft_limit(output_left * p.volume, output_right * p.volume)
```

— or, on an instrument with `limit: false` authored, the unclamped `output_left * p.volume, output_right * p.volume`. `p.volume` is a real struct field, initialised from the Instrument's panel value in `_init` and adjustable at runtime through `<Asset>_set_volume`, which clamps to `[0.0, 1.0]` — this is the packet B1 change: before it, this line multiplied by a bare `f32(volume)` literal with no setter at all.

Finally the project mixer sums every non-muted asset — each of them already individually soft-limited — and applies the master fader and a second soft-clip pass (`skald-backend/core/codegen_project.odin::generate_project_code`):

```odin
mixed_left *= p.master_volume
mixed_right *= p.master_volume
return skald_soft_limit(mixed_left, mixed_right)
```

`tanh` (inside `skald_soft_limit`, `skald-backend/core/codegen_project.odin::emit_soft_limit_proc`) is the hyperbolic tangent. Near zero it is almost exactly `y = x`, so quiet signals pass through untouched; as `|x|` grows it flattens towards ±1 and never reaches it. That asymptote *is* the ceiling — the output physically cannot exceed full scale no matter how hot the mix gets, which is why Skald never produces the hard digital crackle of a clipped buffer. It produces harmonic distortion instead, twice over if a hot instrument and a hot mix both reach for it, and you get to decide whether that is a feature.

The same shape is emitted a second time, verbatim in effect, for the WebAssembly preview shim (`skald-backend/core/codegen_project.odin::generate_wasm_shim_code`), whose master-volume setter is named `skald_set_master_volume` rather than `project_set_master_volume` but does the identical multiply-then-limit. The comment on the export's own limiter states the design goal plainly: identical policy "so the preview IS the export."

## Terms introduced

- **Output stage / signal-flow termination** — the point where a signal chain hands off to the outside world. Nothing downstream of it exists inside the patch.
- **Master bus (mix bus, stereo bus)** — the single stereo pair every channel is summed into before leaving the system.
- **Summing** — combining signals by adding their sample values. Not averaging: two signals at 0.5 sum to 1.0, not 0.5.
- **Full scale (±1.0)** — the maximum sample value a digital audio system can represent. In Skald this is enforced by a soft clipper at both the per-asset and the project stage.
- **Headroom** — the distance between where your signal normally sits and full scale. Studio practice leaves 12–18 dB of it on each channel.
- **Gain staging** — setting sensible levels at every stage of a chain rather than correcting everything at the end.
- **Clipping** — what happens when a signal exceeds full scale and the peaks are chopped off.
- **Hard clipping** — clipping with sharp corners: the waveform is truncated flat. Harsh, rich in high-order harmonics.
- **Soft clipping / saturation** — clipping with rounded corners, produced by a smooth curve like `tanh`. Fewer high-order harmonics, more musical.
- **Waveshaper** — a memoryless nonlinearity: a function applied to each sample independently, with no memory of previous samples. `tanh` is one.
- **Odd harmonics** — harmonics at 3×, 5×, 7× the fundamental. Symmetric waveshapers like `tanh` produce only these, which is why a saturated sine turns square-ish.
- **Aliasing** — harmonics generated above half the sample rate folding back down as inharmonic tones that move the wrong way as you play up the keyboard.
- **Voice / polyphony** — one simultaneously-sounding note. Each active voice adds independently at the output, so level scales with the number of voices.
- **Voice domain vs bus domain** — in Skald, nodes that run once per voice per sample versus nodes that run once per sample on the summed voice signal. Delay, Reverb and instrument Inputs seed the bus domain.
- **Patchbay** — a studio panel of labelled sockets bringing every device's ins and outs to one place. Skald's Instrument ports are the same idea in software.
- **Normalling** — on a hardware patchbay, the default connection between a socket pair that a patch cable overrides. Skald has no equivalent; every connection is explicit.
- **Sub-graph port** — a named Input or Output node inside an Instrument, representing a connection point on its outside edge.
- **Expose** — mark a parameter as runtime-settable, generating a `set_param`/`get_param` pair and an introspection entry on the exported asset.

## Known issues

Defects that touch this chapter are tracked centrally in the **Known issues** chapter (`KNOWN-ISSUES.md`): KI-008, KI-009, KI-010, KI-052, KI-053. Deliberate design limits — things Skald does not do on purpose — are collected in **What Skald deliberately does not do**.
