# VCA

> A volume knob that something else can turn for you — an envelope, an LFO, or your game code — so a sound can start, swell, wobble and stop without you touching anything.

## What it is

Every sound you have ever heard has a shape in time. A piano note appears instantly and then fades for several seconds. A bowed cello note swells in over half a second and stops the instant the bow lifts. A car horn is flat and steady until someone lets go. That shape — how loud the sound is at each moment — is called its **amplitude envelope**, and it is at least as important to recognising an instrument as the pitch or the harmonics are. Play a piano recording backwards and it stops sounding like a piano, even though every frequency in it is unchanged.

An oscillator, on its own, cannot do any of that. An oscillator is a tap that is always on: it puts out a tone at full strength from the moment the patch starts until the moment it stops. To turn that endless drone into a *note*, something downstream has to open and close. In hardware synthesisers that something is a **VCA — a Voltage-Controlled Amplifier**. It is an amplifier whose gain, instead of being set by a knob you turn with your fingers, is set by a control voltage arriving on a second input. Send it 0 volts and nothing gets through. Send it a rising then falling voltage and the sound rises and falls with it. As Sweetwater put it, a VCA "alters the amplitude of a signal proportional to the control voltage applied to its amplitude modulation control input" [Source: https://www.sweetwater.com/insync/voltage-controlled-amplifier-vca/].

The classic subtractive synthesiser signal chain is three boxes in a row: oscillator → filter → VCA → output. The oscillator makes the raw tone, the filter colours it, and the VCA "acts as a final dynamic control for the synth voice" — it is, in the words of one modular primer, "the last stage in a patch, articulating when we can hear or not hear a sound" [Source: https://learningmodular.com/glossary/vca/]. Without it you have a texture. With it you have a performance.

Here is the useful mental picture. A **static gain** is a fader you set once and leave: multiply everything by 0.5 and the whole signal is quieter, forever. **Amplitude modulation** is the same fader, but somebody is riding it in real time. Nothing about the maths changes — it is still one multiplication per sample — the only difference is whether the number you multiply by is a constant or a signal. The VCA does not care which. That single fact is why the same node handles four jobs that look unrelated: setting a level, shaping a note, adding tremolo, and scaling how much modulation another node receives.

What you hear depends entirely on how fast that number changes. Move it slowly — a few times per second — and your ear tracks the change as a rhythmic pulsing in loudness. That is **tremolo**. Somewhere around 20 Hz your ear stops hearing individual pulses and starts hearing a new timbre instead: the modulation folds into the tone and produces **sidebands**, extra frequencies at the carrier plus and minus the modulator, giving a hollow, metallic, bell-like colour [Source: https://www.sfu.ca/sonic-studio-webdav/handbook/Amplitude_Modulation.html]. Below roughly 8 Hz you reliably get tremolo; above 20 Hz you reliably get timbre; the range in between is a smeary transition zone where a "wobble" gradually turns into a "buzz". Nothing in the node changes at that boundary. Your hearing changes.

One last thing that trips up beginners: the gain number is a **multiplier**, not a percentage and not decibels. 1.0 means "unchanged". 0.5 means "half the amplitude", which is a drop of about 6 dB — roughly what most people call "noticeably quieter but not half as loud" [Source: https://sengpielaudio.com/calculator-FactorRatioLevelDecibel.htm]. 2.0 is +6 dB. 0.0 is silence. And a *negative* multiplier is not "less than silence" — it flips the waveform upside down, which you will meet later in this chapter as a way to accidentally turn tremolo into something much stranger.

## What it looks like in Skald

Drag it in from the sidebar's **Nodes** section, where it is listed as **VCA** with the tooltip "Gain stage — modulate the gain input for tremolo or volume control" (`skald-ui/src/components/Sidebar.tsx::paletteNodes`). It sits between Panner and Output in the palette, in the utility group. On the canvas it is a lilac-bordered card (`skald-ui/src/components/Nodes/NodeStyles.ts::NODE_ACCENTS` — `gain: '#D6BCFA'`, commented "lilac — level utility").

It has exactly three ports (`skald-ui/src/components/Nodes/GainNode.tsx::VisualGainNode`):

| Port | Handle id | Side | Carries |
| --- | --- | --- | --- |
| **In** | `input` | left | the audio you want to shape |
| **Gain** | `input_gain` | left | a control signal that moves the multiplier |
| **Out** | `output` | right | the multiplied result |

Both inputs accept **any number of connections**, and both **sum** them. Multiple wires into **In** are added together before multiplication (`skald-backend/core/param_utils.odin::sum_port_inputs`, whose comment notes that nodes which kept only the first edge "silently dropped the rest"), so a VCA doubles as a cheap two-or-three-input mixer. Multiple wires into **Gain** are also summed — how they combine with the knob depends on the **Gain in** setting below, which is the single most important thing in this chapter and gets its own section (`skald-backend/core/param_utils.odin::get_f32_param`, `skald-backend/core/codegen_nodes.odin::generate_gain_code`).

The backend validator accepts precisely these two input port names and rejects anything else: `GAIN_INPUTS := [?]string{"input", "input_gain"}` (`skald-backend/core/graph_validate.odin::valid_input_ports`). Older project files that wrote the port as `gain` are silently rewritten to `input_gain` on load (`skald-backend/core/json.odin::normalize_port`).

The VCA runs at **audio rate** — once per sample, per voice. It appears in the per-voice emission switch and in the bus-domain switch (`skald-backend/core/codegen_processor.odin::generate_processor_code`), which means it is one of the few nodes that works on either side of a Delay or Reverb. Put it before the reverb and each voice is shaped individually; put it after and you are riding the level of the whole wet mix including the tail. Most nodes cannot do both — an Oscillator or ADSR placed downstream of a Delay is a hard codegen error (`skald-backend/core/codegen_analysis.odin::compute_bus_domain`).

There is no clock or state inside it. It has no memory of the previous sample, so it introduces no delay, no filtering and no colour of its own. It is one multiply.

## The controls

There is one parameter.

| Parameter | Range | Default | Unit | What it does to the sound |
| --- | --- | --- | --- | --- |
| `gain` | 0.0 – 4.0 | 0.75 (new node) / 1.0 (codegen fallback) | × (multiplier) | Scales the amplitude of everything on the **In** port. Also acts as the resting offset or ceiling — depending on **Gain in** — that anything patched into **Gain** combines with. |

Where those numbers come from, and why there are two defaults:

- The on-canvas number box runs `min: 0, max: 4, step: 0.05` (`skald-ui/src/components/Nodes/GainNode.tsx::VisualGainNode`).
- A freshly dragged node starts at `gain: 0.75` with `gain` already marked exposed (`skald-ui/src/definitions/node-definitions.ts::defaultGainParams`). The TypeScript shape is `{ gain: number, gainMode?: 'multiply' | 'add' }` (`skald-ui/src/definitions/types.ts::GainParams`).
- The backend's authoritative range table returns `{0.0, 4.0, 1.0, "x"}` for the name `gain` — a value authored once in the schema and rendered into both the editor and the generator (`schema/nodes.json::generic`). That `1.0` is the *fallback* default — it is used only when a project file omits the parameter entirely, or as the initial value of an exposed field before the node's own value overrides it (`skald-backend/core/codegen_processor.odin::generate_processor_code`).
- The sidebar Parameter Panel agrees with both: its slider is built as `slider('gain', 0, 4, 0.75)` (`skald-ui/src/components/NodeParameterControls.tsx::NodeParameterControls`). Canvas box, panel slider and exported clamp are one number, so a gain of 2.5 set anywhere survives everywhere.

### What you hear as you sweep it

**0.0** — silence. Not "very quiet": the multiplication produces exactly zero. This is where you park the knob whenever an envelope is going to drive the Gain port on a **legacy, additive** VCA, and it is what all five VCAs in the shipped four-bar song do (`examples/songs/full/four-bar-song.skald.json::nodes` — the Lead, Pad, Bass, Kick and HiHat instruments each carry one, and every one is `"gain": 0` with no `gainMode`, i.e. the pre-C4 additive form). A freshly dragged VCA no longer needs this trick — see **Why two?** below.

**0.0 → 0.5** — the useful trim zone. Each halving is −6 dB. If you are mixing two oscillator layers and one is dominating, this is where you pull it back. Small moves matter a lot down here: 0.1 to 0.2 is the same 6 dB jump as 0.5 to 1.0.

**1.0** — unity. The signal passes through numerically unchanged. If you are unsure what a VCA is doing to your patch, set it here; the node becomes a wire.

**1.0 → 2.0** — mild boost. Useful for pushing a quiet layer up, or for driving a Distortion node harder without touching its Drive control. Watch the master, because voices sum before the limiter.

**2.0 → 4.0** — this is not a level control any more, it is a saturation control. Both the per-asset limiter and the project's master stage apply `tanh` as a soft limiter (`skald-backend/core/codegen_project.odin::emit_soft_limit_proc`, called once per asset and again on the project mix — deliberately identical to the editor's live preview, "so the preview IS the export"). `tanh` does not clip harshly; it squashes. As you push past about 2.0 on a sine you will hear the tone thicken and grow harmonics as the peaks flatten into something closer to a square wave. It is a real technique, but it is a *deliberate* one — reach for it on purpose, not by accident.

The musically useful zone for the knob alone is **0.3 to 1.2**. Everything above that is either an effect or a mistake.

### The Gain port has two arithmetics — and the card says which

The **Gain in** control under the knob is the single most important setting on this node. It decides what happens to the knob value when a signal arrives on the **Gain** port (`generate_gain_code` in `skald-backend/core/codegen_nodes.odin`):

- **multiply** — the default for every VCA you drag in — computes `out = audio * knob * incoming`. Patch a bare ADSR into Gain and the note goes from silence to the knob's level and back to silence; the knob is the ceiling. This is the modular-synth idiom exactly as your intuition expects it, and it is what the *Try it* section below builds towards.
- **add** computes `out = audio * (knob + incoming)`. The knob is a **floor** and the patched signal is a deviation from it. That is what you want for tremolo that must never fully disappear — knob at 1.0, a small bipolar LFO on top, the level breathing around unity.

Why two? Until save version 3 the Gain port was *always* additive, on every modulation port in the generator. Applied to amplitude that defeated the node's main job: a VCA at its 0.75 default with an envelope wired in computed `audio * (0.75 + envelope)`, a multiplier that swung 0.75 → 1.75 → 0.75 and a note that never stopped. Every shipped example that used the idiom worked around it by zeroing the knob (`examples/songs/full/four-bar-song.skald.json::nodes`; `examples/instruments/keys/fm-rhodes-electric-piano.skald.json::nodes`). Those files still sound exactly as they did: when an older save is opened, every VCA in it is stamped **add** (the arithmetic it was built with), and a file that never says is read as **add** by the generator. A *freshly dragged* VCA, since packet C4, defaults to **multiply** instead (`skald-ui/src/definitions/node-definitions.ts::defaultGainParams`), so the modular idiom works the moment you patch an envelope in — no zeroing required. Flip a legacy VCA to **multiply** and raise its knob from 0 to the level you want, if you would rather have a real ceiling than a floor.

### What "expose" does

Click the small link icon next to the Gain control in the Parameter Panel and the parameter name is pushed into the node's `exposedParameters` array (`skald-ui/src/components/ParameterPanel.tsx::ParameterPanel`). On a VCA this is already on by default (`skald-ui/src/definitions/node-definitions.ts::defaultGainParams`).

Exposing changes what the code generator emits. An un-exposed gain is baked in as a compile-time constant: `node_x_out = (input) * (f32(0.750000000))`. An exposed one becomes a struct field read: `node_x_out = (input) * (p.gain)` (`skald-backend/core/codegen_nodes.odin::generate_gain_code`). Alongside that, the generator emits:

- A **typed setter** with the range clamp baked in — `MyInstrument_set_gain(p, value)`, which forces the value into `[0.0, 4.0]` before storing it (`skald-backend/core/codegen_processor.odin::generate_processor_code`, bounds from `schema/nodes.json::generic`).
- An entry in the introspection table `MyInstrument_PARAMS`, carrying name, min, max, default and the unit string `"x"`, so a debug overlay or tools UI can build a slider without knowing anything about your patch (`skald-backend/core/codegen_processor.odin::generate_processor_code`).
- A string-keyed setter for tooling and for the editor's live preview (`skald-backend/core/codegen_processor.odin::generate_processor_code`, documented in the generated header by `skald-backend/core/codegen_project.odin::emit_exposed_param_contract`).

Why you would do this on a VCA specifically: it is the cleanest volume handle a game has. Duck the engine loop when dialogue starts. Fade a music layer in as the player approaches a zone. Scale a footstep's loudness by how fast the character is moving. All of it is one `_set_gain` call per frame with no reallocation and no rebuild. If the field name collides — two VCAs both exposing `gain` — the generator prefixes with the node's sanitised label, so a node labelled "Tine VCA" yields `Tine_VCA_gain` (`skald-backend/core/codegen_analysis.odin::build_instrument_plan`). Label your VCAs; the exported API reads much better for it.

## Try it (hands-on)

**Start from:** `examples/instruments/bass/sine-sub-bass.skald.json`

That patch is deliberately minimal. It is three nodes — a Sine oscillator, an ADSR, and an Output — wired oscillator → ADSR `input` → Output (`examples/instruments/bass/sine-sub-bass.skald.json::edges`). Note what is *missing*: there is no VCA at all, and there is no Instrument node either. The ADSR is doing the VCA's job, because Skald's ADSR multiplies whatever arrives on its audio input by its own envelope (`skald-backend/core/codegen_nodes.odin::generate_adsr_code`). You are going to pull that job out into a real VCA and then discover why that was worth doing.

**Before you start:** load the file, drag a selection box around all three nodes, and click **Create Instrument** in the sidebar's Grouping section. Do this even though pressing Play right now would not refuse outright — since packet B6-1 (SKB-019), a loose canvas with no Instrument node at all is auto-wrapped into one SFX asset and played (`skald-ui/src/utils/projectSerializer.ts::buildProjectData`). That auto-wrap exists so old, ungrouped save files still play; it is not a substitute for a real Instrument, because the auto-wrapped version has no node on the canvas you can open, rename or drop a VCA and an LFO inside. Wrapping also auto-creates a sequencer track for the instrument (`skald-ui/src/hooks/sequencer/useInstrumentRegistry.ts::useInstrumentRegistry`). Click a few notes into that track — put one long note at step 0 and another at step 8 — and turn on **Loop** so you get a repeating trigger to listen against.

1. **Hear the baseline.** Press Play. A clean low sine with a fast 10 ms attack, a short decay, and full sustain (`attack: 0.01, decay: 0.1, sustain: 1.0, release: 0.2`). It stops cleanly when the note ends. That clean stop is the envelope doing VCA duty. Stop playback.

2. **Insert a VCA.** Double-click the Instrument to open its subgraph. Drag a **VCA** from the sidebar and drop it between the ADSR and the Output. Delete the wire from ADSR → Output. The VCA lands with **Gain in** set to `multiply` and its knob at `0.75` — the packet C4 default for every freshly dragged node.

3. **Rewire into the idiom.** Drag from the Oscillator's **Out** to the VCA's **In**. Drag from the ADSR's **Env** output to the VCA's **Gain** input. Drag the VCA's **Out** to the Output's input. You will also need to remove the oscillator → ADSR `input` wire, so the ADSR is now a pure control source with nothing on its audio input — the generator then defaults that input to `1.0` and the ADSR emits the bare envelope (`skald-backend/core/codegen_nodes.odin::generate_adsr_code`).

4. **Play it — and notice there is no trap to fall into.** Leave the knob at `0.75` and press Play. The clean, stopping note is exactly as it was in step 1: the envelope genuinely governs the level, because `multiply` computes `audio * knob * envelope`, and the knob is a ceiling the envelope scales, not an offset it is added to. Nothing to fix — this is the whole point of C4.

5. **Now reproduce the bug every pre-C4 file was built around.** Click the VCA and change **Gain in** to `add`, leaving the knob at `0.75`. Play again. The note never stops: under the loop you hear a continuous droning sine with a small lift at each note start. This is the additive-gain trap — the multiplier is now riding `0.75 + envelope`, and it never reaches zero even when the envelope does. Every shipped instrument built before C4 hits exactly this, and the fix everyone used was to zero the knob: drag **Gain** down to `0.00` and play once more — the clean, stopping note is back, with the envelope's own 0 doing the work the knob's 0 used to have to do. Set **Gain in** back to `multiply` and the knob back to `0.75` before continuing; structurally your patch now matches every instrument built since C4.

6. **Add tremolo.** Drag in an **LFO**. Leave it on Sine; set **Freq** to **5** Hz and **Amount** to **0.25**. Wire the LFO's **Out** to the VCA's **Gain** input — the same port the ADSR is already using; both signals sum, and in `multiply` mode the combined modulation multiplies the knob (`audio * knob * (envelope + lfo)`, since it is the *incoming* side that sums, not the knob). Play, and you now hear the note pulsing about four to five times a second on top of its envelope — the classic tremolo rate range of roughly 1–8 Hz [Source: https://docs.cycling74.com/max8/tutorials/06_synthesischapter02]. Sweep the LFO **Amount** from 0.05 up to 0.4: at 0.05 it is a barely-there shimmer of well under a decibel; by 0.3 it is an obvious rhythmic throb.

7. **Cross the tremolo/timbre boundary.** Drag the LFO **Freq** slowly from 5 Hz up towards 100 Hz (its maximum, `skald-ui/src/components/Nodes/LFONode.tsx::LFONode`). Somewhere around 15–20 Hz the pulsing stops being countable and becomes a buzz; by 40 Hz the sine has grown a hollow, metallic, ring-modulator character. You have not added an oscillator — you have created sidebands at (carrier ± modulator), the same effect that makes a slow tremolo and a bell-tone the same operation at different speeds [Source: https://www.sfu.ca/sonic-studio-webdav/handbook/Amplitude_Modulation.html]. Set it back to 5 Hz.

8. **Break it properly — drive the multiplier negative.** Push the LFO **Amount** to **1.0** while the VCA is in `multiply` mode with the knob at 0.75 and the ADSR sustaining. The sum reaching the knob is `envelope + lfo`, and the LFO alone swings from −1.0 to +1.0 (Skald's LFO is bipolar around zero — `skald-backend/core/codegen_nodes.odin::generate_lfo_code`). For a good part of each cycle that sum is negative, and multiplying the knob by a negative number flips the waveform upside down. That is not tremolo; that is closer to ring modulation, and it sounds gritty and buzzy rather than smooth [Source: https://docs.cycling74.com/max8/tutorials/06_synthesischapter02]. Now drop the LFO Amount to **0.25**: the sum rides `1.0 ± 0.25` (a sustained envelope plus a small LFO), stays comfortably positive, and the smooth tremolo returns.

9. **Break it the other way — saturate the master.** Set the LFO Amount to 0, the VCA knob to **4.00**, and hold a sustained note. The tone gets louder for the first part of the sweep and then stops getting louder, thickening and buzzing instead. That is the `tanh` soft limiter flattening the peaks (`skald-backend/core/codegen_project.odin::emit_soft_limit_proc`). Nothing crackles, because `tanh` is a smooth curve rather than a hard cutoff — this is soft saturation, not digital clipping. Useful to know it is there; unwise to rely on it as your level control. Return the knob to 0.75.

10. **Keep it.** Leave the patch as: knob 0.75, **Gain in** multiply, ADSR → Gain, LFO at 4 Hz / Amount 0.15 → Gain. That is a usable subby bass with a gentle breathing motion, and it is a structure you will reuse constantly.

## Why you patch it this way

**The canonical chain is source → tone-shaping → VCA → output.** Oscillator or Noise makes the raw material, Filter and Distortion colour it, and the VCA is the last thing before the destination — the gate that decides whether any of it is audible at all [Source: https://www.sweetwater.com/insync/voltage-controlled-amplifier-vca/]. The "Lead" instrument in the shipped four-bar song follows this order exactly (`examples/songs/full/four-bar-song.skald.json::nodes` — osc → filter → distortion → VCA → out).

**The amp envelope always goes into the Gain port, never into the audio path.** An ADSR wired into the VCA's Gain port is the definition of a note. It is also what tells Skald the voice is finished: the voice-lifecycle check keeps a voice allocated while any ADSR is not Idle, and frees it when they all are (`skald-backend/core/codegen_processor.odin::generate_processor_code`). A patch with no ADSR at all falls back to killing voices on their nominal duration, with a short linear fade so the cut is never a click (`skald-backend/core/codegen_processor.odin::generate_processor_code`, `NOADSR_FADE_SECONDS`).

**Order matters relative to the filter.** Filter *before* VCA is the standard. The filter is a resonant state machine; feeding it a signal whose level is already being chopped to zero by an envelope means its internal state is being starved and re-excited on every note, and a high-resonance filter can ring audibly through what should be silence. Filter first, then gate the result, and silence is genuinely silent.

**Order matters relative to distortion, in the opposite direction.** Distortion is level-dependent by nature — how hard you hit it changes the amount of harmonic content, not just the volume. A VCA *before* a Distortion node is therefore a **drive** control: as the envelope opens, the sound gets not just louder but dirtier, which is a very natural, very analogue behaviour. A VCA *after* the Distortion is a pure level control: the grit stays constant and only the volume moves. Both are correct. Choose deliberately.

**Order matters relative to Delay and Reverb.** The VCA can legally sit on either side (`skald-backend/core/codegen_processor.odin::generate_processor_code`), but they mean different things. Before the reverb, you are shaping each note and its tail is generated from the shaped signal — the natural choice. After the reverb, you are riding the entire wet mix including tails that are still ringing from notes that have already ended, so an amp envelope there will chop the tail off unmusically. Use the post-reverb position for slow, deliberate fades of the whole instrument, not for note articulation.

**A VCA is also a mixer.** Because the **In** port sums every incoming connection (`skald-backend/core/param_utils.odin::sum_port_inputs`), two oscillators into one VCA is a legitimate two-into-one sum with a shared level control. Reach for the Mixer node when you need *independent* per-source levels; reach for a VCA when you want them locked together.

**Nodes must live inside an Instrument.** Only Instrument nodes become audio when the canvas already has one elsewhere — a stray node floating outside any Instrument is silently excluded from the export (`skald-ui/src/tests/codegen/ProjectSerializerPipeline.test.ts` asserts exactly this for that case). A canvas with **no** Instrument at all is the different, auto-wrapped case covered above; either way, if your VCA seems to do nothing, check first that it is really inside an instrument's subgraph and not floating loose beside it.

## Going further

**Use a Mapper to make the LFO unipolar.** Skald's LFO is bipolar — it outputs ±amplitude around zero (`skald-backend/core/codegen_nodes.odin::generate_lfo_code`). Textbook tremolo wants a *unipolar* modulator so the level dips and returns without ever flipping sign; a bipolar modulator "pinches to zero at the crossover point and then inverts", which is ring modulation rather than tremolo [Source: https://docs.cycling74.com/max8/tutorials/06_synthesischapter02]. You can build the unipolar version explicitly: LFO → **Mapper** with `inMin: -1, inMax: 1, outMin: 0.6, outMax: 1.0` → VCA Gain, with **Gain in** set to `add` and the knob at 0. The Mapper linearly rescales *and* clamps its input to the declared range (`skald-backend/core/codegen_nodes.odin::generate_mapper_code`), so the multiplier is now guaranteed to stay inside 0.6–1.0 no matter what the LFO does. You have just built a tremolo with a hard-guaranteed depth, and you can expose `outMin` to give your game a "tremolo depth" dial.

**Put a second envelope on the tremolo depth.** Route ADSR #2 → VCA #2's Gain, LFO → VCA #2's In, and VCA #2's Out → VCA #1's Gain. Now the tremolo itself fades in over the course of a note, the way a string player adds vibrato only after the note has settled. This is the standard "VCA on a control signal" trick — routing an LFO through a VCA driven by an envelope "allows the LFO depth to rise and fall along with the envelope" [Source: https://learningmodular.com/glossary/vca/]. Skald's VCA does not care that the signal passing through it is a control voltage rather than audio; it is the same multiply.

**Layer with parallel VCAs for velocity-dependent timbre.** Split the oscillator to two VCAs, one feeding a clean path and one feeding a Distortion, then sum them at the Output. Give each VCA its own ADSR with a different `velocitySensitivity` (`skald-backend/core/codegen_nodes.odin::generate_adsr_code` — the envelope is scaled by `(1 - vs) + vs * velocity`). Soft notes come out clean; hard notes bring the dirty layer up underneath. This is how real instruments behave and it is the single biggest upgrade you can make to a sampled-feeling patch.

**Study the FM Rhodes for VCA-as-modulation-depth.** In `examples/instruments/keys/fm-rhodes-electric-piano.skald.json` the "Tine VCA" is a legacy `gainMode: add` node with `gain: 0`, fed by a Mapper that is itself fed by a fast percussive envelope. Its audio input is an FM operator, and its output goes to the carrier's `input_mod` port. The VCA is not controlling loudness at all here — it is controlling *how much FM modulation reaches the carrier*, which makes the metallic "tine" attack of a Rhodes decay away in the first tenth of a second and leave a clean tone behind. That is the same node doing a completely different job, and it is a case where the pre-C4 additive idiom (knob 0, envelope as the whole signal) is still the right shape even on a node you would build fresh in `multiply` mode today.

**Expose it and automate from the game.** Label the VCA (e.g. "Engine Level"), keep `gain` exposed, and the export gives you `MyAsset_set_Engine_Level_gain(p, throttle)` with the `[0, 4]` clamp already applied (`skald-backend/core/codegen_processor.odin::generate_processor_code`). Drive it from a physics value at frame rate. Because the field is read fresh every sample (`skald-backend/core/param_utils.odin::get_f32_param`), the response is immediate — though note there is no smoothing, so if you jump the value in large steps you will hear a click. Ramp it over several frames.

**Series VCAs for independent concerns.** Two VCAs in a row multiply, so `0.8 × 0.5 = 0.4`. That is not redundancy — it lets one VCA own the note envelope while a second, exposed one owns the game-controlled mix level, and neither has to know about the other. It costs one multiply per sample.

## Under the hood

The generator branches on **Gain in** (`skald-backend/core/codegen_nodes.odin::generate_gain_code`):

```odin
generate_gain_code :: proc(sb: ^strings.Builder, node: Node, graph: ^Graph, plan: ^Instrument_Plan) {
    input_str := sum_port_inputs(graph, node.id, "input", "0.0")

    gain_str: string
    if get_string_param(node, "gainMode", "") == "multiply" {
        gain_str = get_f32_param(graph, plan, node, "gain", "", 1.0)
        // ...append " * (each Gain-port source)" onto gain_str here...
    } else {
        gain_str = get_f32_param(graph, plan, node, "gain", "input_gain", 1.0)
    }

    fmt.sbprintf(sb, "\t\tnode_%s_out = (%s) * (%s);\n\n", node.id, input_str, gain_str)
}
```

Which emits, per sample, per voice, exactly one statement:

```
node_<id>_out = (sum of everything on In) * (gain expression)
```

The interesting part is how `gain expression` is built. It starts as the base value — an `f32(...)` literal when the parameter is baked in, or `p.<field>` when the parameter is exposed. What happens next depends on **Gain in**:

- **add** (the default when `gainMode` is absent, i.e. every pre-C4 file): `get_f32_param` appends every source on `input_gain` with `+`, so the expression reads `(base) + (node_env_out) + (node_lfo_out)`.
- **multiply**: the generator instead appends every source with `*`, so the expression reads `(base) * (node_env_out) * (node_lfo_out)` — the knob genuinely gates the signal to zero rather than merely lowering the floor it sits on.

There is **no clamp** on that expression either way, and no smoothing filter on it. In `add` mode it can legally be negative (which inverts the waveform) or exceed 4 (which relies on the soft limiter to catch it); in `multiply` mode the same is true of the product. The `[0, 4]` clamp from the range table applies only to the exposed *setter*, not to graph modulation (`skald-backend/core/codegen_processor.odin::generate_processor_code` versus `generate_gain_code`).

There is also no state — no filter, no history, no per-node struct fields. That is why the VCA is the only processing node in Skald that can run unchanged in both the per-voice block and the post-voice bus block: with nothing to keep between samples, there is nothing to get wrong when the execution domain changes.

If you want to read the real output, wire up a small patch and hit **Download Code** in the sidebar (the button the manual used to call "Generate Code" before packet B6-7 renamed it — Play has run this exact code on every edit since the WASM preview landed, so this button only writes it to disk; `skald-ui/src/components/Sidebar.tsx::Sidebar`). Search the generated `.odin` file for `// --- Gain Node` and you will find your node's single line, with your knob value or `p.gain` sitting right there in it.

## Terms introduced

- **Amplitude** — the size of a waveform's swing; how loud it is at a given instant.
- **Amplitude envelope** — how a sound's loudness changes over the life of a note. The main cue your ear uses to identify an instrument.
- **VCA (Voltage-Controlled Amplifier)** — an amplifier whose gain is set by an incoming control signal rather than by a fixed knob. The node this chapter is about.
- **Gain** — a multiplier applied to a signal. 1.0 = unchanged, 0.5 = half amplitude, 0.0 = silence.
- **Static gain** — a gain that is set once and does not change over time.
- **Amplitude modulation (AM)** — a gain that is being changed continuously by another signal. Mathematically identical to static gain; only the modulator moves.
- **Control signal / control voltage** — a slow-moving signal used to steer a parameter rather than to be heard directly. Envelopes and LFOs produce these.
- **Envelope generator / ADSR** — a node producing a rising-then-falling control signal in response to a note being pressed and released.
- **Gate** — the on/off signal that says "a note is being held right now". It starts and stops the envelope.
- **Tremolo** — periodic variation in loudness, slow enough (roughly 1–8 Hz) that you hear it as rhythmic pulsing rather than as tone colour.
- **Sidebands** — extra frequencies created by modulation, appearing at (carrier + modulator) and (carrier − modulator). Why fast amplitude modulation changes timbre instead of producing pulsing.
- **Ring modulation** — amplitude modulation by a bipolar modulator that passes through zero and inverts the signal. Produces a harsh, metallic, inharmonic result.
- **Bipolar / unipolar** — a bipolar signal swings both positive and negative around zero; a unipolar signal stays on one side. Skald's LFO is bipolar; tremolo wants unipolar.
- **Decibel (dB)** — a logarithmic loudness unit. A gain multiplier of 2.0 is about +6 dB; 0.5 is about −6 dB.
- **Unity gain** — a gain of exactly 1.0; the signal passes through numerically unchanged.
- **Soft clipping / saturation** — smoothly flattening the peaks of an over-hot signal instead of chopping them off. Adds harmonics; sounds "thick" rather than "broken". Skald's limiter stages use `tanh` for this.
- **Gain staging** — arranging levels so that every stage in a chain operates in its comfortable range, rather than fixing everything at the end.
- **Audio rate vs control rate** — audio rate is once per sample (48,000 times a second); control rate is slower. Skald's VCA runs at audio rate.
- **Voice** — one simultaneously-sounding note. A polyphonic instrument runs the whole graph once per active voice, per sample.
- **Bus domain** — the once-per-sample block that runs after all voices are summed, where Delay and Reverb live.

## Known issues

Defects that touch this chapter are tracked centrally in the **Known issues** chapter (`KNOWN-ISSUES.md`): KI-047, KI-048. Deliberate design limits — things Skald does not do on purpose — are collected in **What Skald deliberately does not do**.
