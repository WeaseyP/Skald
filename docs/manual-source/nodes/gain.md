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

Drag it in from the sidebar's **Nodes** section, where it is listed as **VCA** with the tooltip "Gain stage — modulate the gain input for tremolo or volume control" (`skald-ui/src/components/Sidebar.tsx:239`, `:278`). It sits between Panner and Output in the palette, in the utility group. On the canvas it is a lilac-bordered card (`skald-ui/src/components/Nodes/NodeStyles.ts:99` — `gain: '#D6BCFA'`, commented "lilac — level utility").

It has exactly three ports (`skald-ui/src/components/Nodes/GainNode.tsx:6-10`):

| Port | Handle id | Side | Carries |
| --- | --- | --- | --- |
| **In** | `input` | left | the audio you want to shape |
| **Gain** | `input_gain` | left | a control signal that moves the multiplier |
| **Out** | `output` | right | the multiplied result |

Both inputs accept **any number of connections**, and both **sum** them. Multiple wires into **In** are added together before multiplication (`skald-backend/core/param_utils.odin:164-177` — `sum_port_inputs`, whose comment notes that nodes which kept only the first edge "silently dropped the rest"), so a VCA doubles as a cheap two-or-three-input mixer. Multiple wires into **Gain** are also summed, *and added on top of the knob value* — that behaviour is the single most important thing in this chapter and it gets its own section below (`skald-backend/core/param_utils.odin:138-156`).

The backend validator accepts precisely these two input port names and rejects anything else: `GAIN_INPUTS := [?]string{"input", "input_gain"}` (`skald-backend/core/graph_validate.odin:34`, dispatched at `:55-56`). Older project files that wrote the port as `gain` are silently rewritten to `input_gain` on load (`skald-backend/core/json.odin:43`).

The VCA runs at **audio rate** — once per sample, per voice. It appears in the per-voice emission switch (`skald-backend/core/codegen.odin:1810-1811`) *and* in the bus-domain switch (`:1913-1914`), which means it is one of the few nodes that works on either side of a Delay or Reverb. Put it before the reverb and each voice is shaped individually; put it after and you are riding the level of the whole wet mix including the tail. Most nodes cannot do both — an Oscillator or ADSR placed downstream of a Delay is a hard codegen error (`skald-backend/core/codegen.odin:1940-1943`).

There is no clock or state inside it. It has no memory of the previous sample, so it introduces no delay, no filtering and no colour of its own. It is one multiply.

## The controls

There is one parameter.

| Parameter | Range | Default | Unit | What it does to the sound |
| --- | --- | --- | --- | --- |
| `gain` | 0.0 – 4.0 | 0.75 (new node) / 1.0 (codegen fallback) | × (multiplier) | Scales the amplitude of everything on the **In** port. Also acts as the resting offset that anything patched into **Gain** is added to. |

Where those numbers come from, and why there are two defaults:

- The on-canvas number box runs `min: 0, max: 4, step: 0.05` (`skald-ui/src/components/Nodes/GainNode.tsx:12`).
- A freshly dragged node starts at `gain: 0.75` with `gain` already marked exposed (`skald-ui/src/definitions/node-definitions.ts:153-156`). The TypeScript shape is a bare `{ gain: number }` (`skald-ui/src/definitions/types.ts:137-139`).
- The backend's authoritative range table returns `{0.0, 4.0, 1.0, "x"}` for the name `gain` (`skald-backend/core/param_ranges.odin:84-85`). That `1.0` is the *fallback* default — it is used only when a project file omits the parameter entirely, or as the initial value of an exposed field before the node's own value overrides it (`skald-backend/core/codegen.odin:1191-1198`).
- The sidebar Parameter Panel disagrees: its slider is built as `slider('gain', 0, 1, 0.75)` — a maximum of **1**, not 4 (`skald-ui/src/components/NodeParameterControls.tsx:301-305`). See *Code-vs-intent notes*.

### What you hear as you sweep it

**0.0** — silence. Not "very quiet": the multiplication produces exactly zero. This is where you park the knob whenever an envelope is going to drive the Gain port, and it is what all four VCAs in the shipped four-bar song do (`examples/songs/full/four-bar-song.skald.json:18`, `:49`, `:82`, `:112`, `:142` — every one is `"gain": 0`).

**0.0 → 0.5** — the useful trim zone. Each halving is −6 dB. If you are mixing two oscillator layers and one is dominating, this is where you pull it back. Small moves matter a lot down here: 0.1 to 0.2 is the same 6 dB jump as 0.5 to 1.0.

**1.0** — unity. The signal passes through numerically unchanged. If you are unsure what a VCA is doing to your patch, set it here; the node becomes a wire.

**1.0 → 2.0** — mild boost. Useful for pushing a quiet layer up, or for driving a Distortion node harder without touching its Drive control. Watch the master, because voices sum before the limiter.

**2.0 → 4.0** — this is not a level control any more, it is a saturation control. The master bus applies `tanh` as a soft limiter (`skald-backend/core/codegen.odin:2417-2418` for the export, `:2623-2624` for the live preview — deliberately identical, "so the preview IS the export"). `tanh` does not clip harshly; it squashes. As you push past about 2.0 on a sine you will hear the tone thicken and grow harmonics as the peaks flatten into something closer to a square wave. It is a real technique, but it is a *deliberate* one — reach for it on purpose, not by accident.

The musically useful zone for the knob alone is **0.3 to 1.2**. Everything above that is either an effect or a mistake.

### The one gotcha: Gain-port modulation is ADDED, not substituted

When you patch something into the **Gain** port, Skald does not replace the knob value with the incoming signal. It **adds** them. The generated expression is literally `(knob) + (incoming)` (`skald-backend/core/param_utils.odin:149-153`), and then that sum multiplies the audio (`skald-backend/core/codegen.odin:714`).

So a brand-new VCA at its 0.75 default, with an ADSR wired into Gain, computes:

```
out = audio * (0.75 + envelope)
```

The envelope swings 0 → 1 → 0, so the multiplier swings **0.75 → 1.75 → 0.75**. It never reaches zero. The note never stops. You get a permanent drone with a bump at the start, and it sounds broken because it is.

The fix is one keystroke: **set the knob to 0** before you patch the envelope in. Then the expression is `audio * (0.0 + envelope)` and the envelope has full authority from silence to unity. Every VCA in every shipped example that receives envelope modulation is set to zero for exactly this reason (`examples/songs/full/four-bar-song.skald.json:18`; `examples/instruments/keys/fm-rhodes-electric-piano.skald.json:66`).

Read the other way round, the additive behaviour is a feature: the knob is your **offset**, and the patched signal is your **deviation from that offset**. That is precisely what you want for tremolo, where the sound should never fully disappear — knob at 1.0, a small bipolar LFO added on top, and the level breathes around unity.

### What "expose" does

Click the small link icon next to the Gain control in the Parameter Panel and the parameter name is pushed into the node's `exposedParameters` array (`skald-ui/src/components/ParameterPanel.tsx:197-211`). On a VCA this is already on by default (`skald-ui/src/definitions/node-definitions.ts:155`).

Exposing changes what the code generator emits. An un-exposed gain is baked in as a compile-time constant: `node_x_out = (input) * (f32(0.750000000))`. An exposed one becomes a struct field read: `node_x_out = (input) * (p.gain)` (`skald-backend/core/param_utils.odin:80-85`). Alongside that, the generator emits:

- A **typed setter** with the range clamp baked in — `MyInstrument_set_gain(p, value)`, which forces the value into `[0.0, 4.0]` before storing it (`skald-backend/core/codegen.odin:1612-1625`, bounds from `param_ranges.odin:84-85`).
- An entry in the introspection table `MyInstrument_PARAMS`, carrying name, min, max, default and the unit string `"x"`, so a debug overlay or tools UI can build a slider without knowing anything about your patch (`skald-backend/core/codegen.odin:1631-1643`).
- A string-keyed setter for tooling and for the editor's live preview (`skald-backend/core/codegen.odin:1645-1657`).

Why you would do this on a VCA specifically: it is the cleanest volume handle a game has. Duck the engine loop when dialogue starts. Fade a music layer in as the player approaches a zone. Scale a footstep's loudness by how fast the character is moving. All of it is one `_set_gain` call per frame with no reallocation and no rebuild. If the field name collides — two VCAs both exposing `gain` — the generator prefixes with the node's sanitised label, so a node labelled "Tine VCA" yields `Tine_VCA_gain` (`skald-backend/core/codegen.odin:1200-1208`). Label your VCAs; the exported API reads much better for it.

## Try it (hands-on)

**Start from:** `examples/instruments/bass/sine-sub-bass.skald.json`

That patch is deliberately minimal. It is three nodes — a Sine oscillator, an ADSR, and an Output — wired oscillator → ADSR `input` → Output (`examples/instruments/bass/sine-sub-bass.skald.json:3-10`). Note what is *missing*: there is no VCA at all. The ADSR is doing the VCA's job, because Skald's ADSR multiplies whatever arrives on its audio input by its own envelope (`skald-backend/core/codegen.odin:285`). You are going to pull that job out into a real VCA and then discover why that was worth doing.

**Before you start:** load the file, drag a selection box around all three nodes, and click **Create Instrument** in the sidebar's Grouping section. Skald refuses to play loose canvas nodes — you will get "No instruments on the canvas. Wrap nodes in an Instrument before playing." (`skald-ui/src/hooks/nodeEditor/useWasmAudioEngine.ts:96-97`). Wrapping also auto-creates a sequencer track for the instrument (`skald-ui/src/hooks/sequencer/useInstrumentRegistry.ts:18-25`). Click a few notes into that track — put one long note at step 0 and another at step 8 — and turn on **Loop** so you get a repeating trigger to listen against.

1. **Hear the baseline.** Press Play. A clean low sine with a fast 10 ms attack, a short decay, and full sustain (`attack: 0.01, decay: 0.1, sustain: 1.0, release: 0.2`, line 4 of the JSON). It stops cleanly when the note ends. That clean stop is the envelope doing VCA duty. Stop playback.

2. **Insert a VCA.** Double-click the Instrument to open its subgraph. Drag a **VCA** from the sidebar and drop it between the ADSR and the Output. Delete the wire from ADSR → Output.

3. **Rewire into the idiom.** Drag from the Oscillator's **Out** to the VCA's **In**. Drag from the ADSR's **Env** output to the VCA's **Gain** input. Drag the VCA's **Out** to the Output's input. You will also need to remove the oscillator → ADSR `input` wire, so the ADSR is now a pure control source with nothing on its audio input — the generator then defaults that input to `1.0` and the ADSR emits the bare envelope (`skald-backend/core/codegen.odin:217`).

4. **Play it and listen to the mistake.** The note never stops. Under the loop you hear a continuous droning sine with a small lift at each note start. This is the additive-gain trap: the VCA knob is still at its 0.75 default, so the multiplier is riding `0.75 + envelope` and never reaches zero.

5. **Fix it.** Click the VCA and drag its **Gain** number box down to **0.00**. Play again. The clean, stopping note is back — and now the envelope is genuinely in charge of the level rather than sharing the job. Structurally your patch matches every shipped instrument in Skald.

6. **Add tremolo.** Drag in an **LFO**. Leave it on Sine; set **Freq** to **5** Hz and **Amount** to **0.25**. Wire the LFO's **Out** to the VCA's **Gain** input — the same port the ADSR is already using; both signals sum. Set the VCA knob to **0.00** still, and play. You now hear the note pulsing about four to five times a second — the classic tremolo rate range of roughly 1–8 Hz [Source: https://docs.cycling74.com/max8/tutorials/06_synthesischapter02]. Sweep the LFO **Amount** from 0.05 up to 0.4: at 0.05 it is a barely-there shimmer of well under a decibel; by 0.3 it is an obvious rhythmic throb.

7. **Cross the tremolo/timbre boundary — the first break.** Drag the LFO **Freq** slowly from 5 Hz up towards 100 Hz (its maximum, `skald-ui/src/components/Nodes/LFONode.tsx:17`). Somewhere around 15–20 Hz the pulsing stops being countable and becomes a buzz; by 40 Hz the sine has grown a hollow, metallic, ring-modulator character. You have not added an oscillator — you have created sidebands at (carrier ± modulator), the same effect that makes a slow tremolo and a bell-tone the same operation at different speeds [Source: https://www.sfu.ca/sonic-studio-webdav/handbook/Amplitude_Modulation.html]. Set it back to 5 Hz.

8. **Break it properly — drive the multiplier negative.** Push the LFO **Amount** to **1.0** while the VCA knob is still at 0.00 and the ADSR is sustaining. The multiplier is now `0 + envelope + LFO`, and the LFO alone swings from −1.0 to +1.0 (Skald's LFO is bipolar around zero — `skald-backend/core/codegen.odin:385`). For a good part of each cycle the multiplier is *negative*, which flips the waveform upside down. That is not tremolo; that is closer to ring modulation, and it sounds gritty and buzzy rather than smooth [Source: https://docs.cycling74.com/max8/tutorials/06_synthesischapter02]. Now set the VCA knob to **1.00** and drop the LFO Amount to **0.25**: the multiplier rides `1.0 ± 0.25`, stays comfortably positive, and the smooth tremolo returns. That is why the knob is an offset and not a redundant duplicate of the port.

9. **Break it the other way — saturate the master.** Set the LFO Amount to 0, the VCA knob to **4.00**, and hold a sustained note. The tone gets louder for the first part of the sweep and then stops getting louder, thickening and buzzing instead. That is the `tanh` soft limiter on the master bus flattening the peaks (`skald-backend/core/codegen.odin:2623-2624`). Nothing crackles, because `tanh` is a smooth curve rather than a hard cutoff — this is soft saturation, not digital clipping. Useful to know it is there; unwise to rely on it as your level control. Return the knob to 0.00.

10. **Keep it.** Leave the patch as: knob 0.00, ADSR → Gain, LFO at 4 Hz / Amount 0.15 → Gain. That is a usable subby bass with a gentle breathing motion, and it is a structure you will reuse constantly.

## Why you patch it this way

**The canonical chain is source → tone-shaping → VCA → output.** Oscillator or Noise makes the raw material, Filter and Distortion colour it, and the VCA is the last thing before the destination — the gate that decides whether any of it is audible at all [Source: https://www.sweetwater.com/insync/voltage-controlled-amplifier-vca/]. Every instrument in the shipped four-bar song follows this order exactly (`examples/songs/full/four-bar-song.skald.json:15-19` — osc → filter → distortion → VCA → out).

**The amp envelope always goes into the Gain port, never into the audio path.** An ADSR wired into the VCA's Gain port is the definition of a note. It is also what tells Skald the voice is finished: the voice-lifecycle check keeps a voice allocated while any ADSR is not Idle, and frees it when they all are (`skald-backend/core/codegen.odin:1855-1864`). A patch with no ADSR at all falls back to killing voices on their nominal duration (`:1866-1869`), which is much blunter.

**Order matters relative to the filter.** Filter *before* VCA is the standard. The filter is a resonant state machine; feeding it a signal whose level is already being chopped to zero by an envelope means its internal state is being starved and re-excited on every note, and a high-resonance filter can ring audibly through what should be silence. Filter first, then gate the result, and silence is genuinely silent.

**Order matters relative to distortion, in the opposite direction.** Distortion is level-dependent by nature — how hard you hit it changes the amount of harmonic content, not just the volume. A VCA *before* a Distortion node is therefore a **drive** control: as the envelope opens, the sound gets not just louder but dirtier, which is a very natural, very analogue behaviour. A VCA *after* the Distortion is a pure level control: the grit stays constant and only the volume moves. Both are correct. Choose deliberately.

**Order matters relative to Delay and Reverb.** The VCA can legally sit on either side (`skald-backend/core/codegen.odin:1810` and `:1913`), but they mean different things. Before the reverb, you are shaping each note and its tail is generated from the shaped signal — the natural choice. After the reverb, you are riding the entire wet mix including tails that are still ringing from notes that have already ended, so an amp envelope there will chop the tail off unmusically. Use the post-reverb position for slow, deliberate fades of the whole instrument, not for note articulation.

**A VCA is also a mixer.** Because the **In** port sums every incoming connection (`skald-backend/core/param_utils.odin:164-177`), two oscillators into one VCA is a legitimate two-into-one sum with a shared level control. Reach for the Mixer node when you need *independent* per-source levels; reach for a VCA when you want them locked together.

**Nodes must live inside an Instrument.** Loose canvas nodes are ignored by the serialiser entirely (`skald-ui/src/tests/codegen/ProjectSerializerPipeline.test.ts:65-73` asserts exactly this) and the preview refuses to start without at least one Instrument (`skald-ui/src/hooks/nodeEditor/useWasmAudioEngine.ts:96-97`). If your VCA seems to do nothing, check that it is inside an instrument subgraph first.

## Going further

**Use a Mapper to make the LFO unipolar.** Skald's LFO is bipolar — it outputs ±amplitude around zero (`skald-backend/core/codegen.odin:379-385`). Textbook tremolo wants a *unipolar* modulator so the level dips and returns without ever flipping sign; a bipolar modulator "pinches to zero at the crossover point and then inverts", which is ring modulation rather than tremolo [Source: https://docs.cycling74.com/max8/tutorials/06_synthesischapter02]. You can build the unipolar version explicitly: LFO → **Mapper** with `inMin: -1, inMax: 1, outMin: 0.6, outMax: 1.0` → VCA Gain, with the VCA knob at 0. The Mapper linearly rescales *and* clamps its input to the declared range (`skald-backend/core/codegen.odin:701-703`), so the multiplier is now guaranteed to stay inside 0.6–1.0 no matter what the LFO does. You have just built a tremolo with a hard-guaranteed depth, and you can expose `outMin` to give your game a "tremolo depth" dial.

**Put a second envelope on the tremolo depth.** Route ADSR #2 → VCA #2's Gain, LFO → VCA #2's In, and VCA #2's Out → VCA #1's Gain. Now the tremolo itself fades in over the course of a note, the way a string player adds vibrato only after the note has settled. This is the standard "VCA on a control signal" trick — routing an LFO through a VCA driven by an envelope "allows the LFO depth to rise and fall along with the envelope" [Source: https://learningmodular.com/glossary/vca/]. Skald's VCA does not care that the signal passing through it is a control voltage rather than audio; it is the same multiply.

**Layer with parallel VCAs for velocity-dependent timbre.** Split the oscillator to two VCAs, one feeding a clean path and one feeding a Distortion, then sum them at the Output. Give each VCA its own ADSR with a different `velocitySensitivity` (`skald-backend/core/codegen.odin:284` — the envelope is scaled by `(1 - vs) + vs * velocity`). Soft notes come out clean; hard notes bring the dirty layer up underneath. This is how real instruments behave and it is the single biggest upgrade you can make to a sampled-feeling patch.

**Study the FM Rhodes for VCA-as-modulation-depth.** In `examples/instruments/keys/fm-rhodes-electric-piano.skald.json` the "Tine VCA" has `gain: 0` (line 66) and is fed by a Mapper that is itself fed by a fast percussive envelope (lines 128-129). Its audio input is an FM operator, and its output goes to the carrier's `input_mod` port (line 130). The VCA is not controlling loudness at all here — it is controlling *how much FM modulation reaches the carrier*, which makes the metallic "tine" attack of a Rhodes decay away in the first tenth of a second and leave a clean tone behind. That is the same node doing a completely different job.

**Expose it and automate from the game.** Label the VCA (e.g. "Engine Level"), keep `gain` exposed, and the export gives you `MyAsset_set_Engine_Level_gain(p, throttle)` with the `[0, 4]` clamp already applied (`skald-backend/core/codegen.odin:1612-1625`). Drive it from a physics value at frame rate. Because the field is read fresh every sample (`skald-backend/core/param_utils.odin:83`), the response is immediate — though note there is no smoothing, so if you jump the value in large steps you will hear a click. Ramp it over several frames.

**Series VCAs for independent concerns.** Two VCAs in a row multiply, so `0.8 × 0.5 = 0.4`. That is not redundancy — it lets one VCA own the note envelope while a second, exposed one owns the game-controlled mix level, and neither has to know about the other. It costs one multiply per sample.

## Under the hood

The whole node is four lines of generator code (`skald-backend/core/codegen.odin:708-715`):

```odin
generate_gain_code :: proc(sb: ^strings.Builder, node: Node, graph: ^Graph) {
    input_str := sum_port_inputs(graph, node.id, "input", "0.0")
    gain_str  := get_f32_param(graph, node, "gain", "input_gain", 1.0)
    fmt.sbprintf(sb, "\t\tnode_%s_out = (%s) * (%s);\n\n", node.id, input_str, gain_str)
}
```

Which emits, per sample, per voice, exactly one statement:

```
node_<id>_out = (sum of everything on In) * (gain expression)
```

The interesting part is how `gain expression` is built (`skald-backend/core/param_utils.odin:73-158`). It starts as the base value — an `f32(...)` literal when the parameter is baked in, or `p.<field>` when the parameter is exposed. Then, if anything is patched into `input_gain`, every source is appended with `+`:

```
(base) + (node_env_out) + (node_lfo_out)
```

So the final multiplier is `base + Σ(modulation)`. There is **no clamp** on that sum, and no smoothing filter on it either. It can legally be negative (which inverts the waveform), and it can legally exceed 4 (which relies on the master `tanh` to catch it). The `[0, 4]` clamp from the range table applies only to the exposed *setter*, not to graph modulation (`skald-backend/core/codegen.odin:1621-1622` versus `:714`).

There is also no state — no filter, no history, no per-node struct fields. That is why the VCA is the only processing node in Skald that can run unchanged in both the per-voice block and the post-voice bus block: with nothing to keep between samples, there is nothing to get wrong when the execution domain changes.

If you want to read the real output, wire up a small patch and hit **Generate Code** in the sidebar (`skald-ui/src/components/Sidebar.tsx:189`). Search the generated `.odin` file for `// --- Gain Node` and you will find your node's single line, with your knob value or `p.gain` sitting right there in it.

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
- **Soft clipping / saturation** — smoothly flattening the peaks of an over-hot signal instead of chopping them off. Adds harmonics; sounds "thick" rather than "broken". Skald's master bus uses `tanh` for this.
- **Gain staging** — arranging levels so that every stage in a chain operates in its comfortable range, rather than fixing everything at the end.
- **Audio rate vs control rate** — audio rate is once per sample (48,000 times a second); control rate is slower. Skald's VCA runs at audio rate.
- **Voice** — one simultaneously-sounding note. A polyphonic instrument runs the whole graph once per active voice, per sample.
- **Bus domain** — the once-per-sample block that runs after all voices are summed, where Delay and Reverb live.

## Code-vs-intent notes

**1. The Parameter Panel slider caps gain at 1.0; everything else says 4.0.** *(confusing)*
The on-canvas control accepts 0–4 (`skald-ui/src/components/Nodes/GainNode.tsx:12`) and the codegen clamps exposed setters to `[0.0, 4.0]` (`skald-backend/core/param_ranges.odin:84-85`, applied at `skald-backend/core/codegen.odin:1621-1622`). But the sidebar Parameter Panel builds its slider as `slider('gain', 0, 1, 0.75)` (`skald-ui/src/components/NodeParameterControls.tsx:301-305`). A reader who sets 2.5 on the canvas and then opens the Parameter Panel sees a slider pinned at its maximum, and one nudge silently drops the value to 1.0. The comment at the head of `param_ranges.odin:9-10` explicitly claims these ranges "match the ranges sliders use in the UI's parameter panel", which for `gain` is not true.

**2. The default `gain` of 0.75 is the wrong default for the node's main idiom.** *(confusing)*
A freshly dragged VCA has `gain: 0.75` (`skald-ui/src/definitions/node-definitions.ts:154`). Because Gain-port modulation is *added* to the knob value rather than replacing it (`skald-backend/core/param_utils.odin:149-153`), the single most common patch in synthesis — ADSR into VCA Gain — produces a multiplier floor of 0.75 and a note that never stops. Every shipped example that uses this idiom explicitly overrides the default to zero (`examples/songs/full/four-bar-song.skald.json:18`, `:49`, `:82`, `:112`, `:142`; `examples/instruments/keys/fm-rhodes-electric-piano.skald.json:66`), which is good evidence that the default fights the intent. Nothing in the UI warns about it — the sidebar tooltip just says "modulate the gain input for tremolo or volume control" (`skald-ui/src/components/Sidebar.tsx:278`). Documented above rather than fixed, per this being a documentation pass.

**3. Graph modulation of gain is unclamped; the exposed setter is clamped.** *(confusing)*
`MyAsset_set_gain` forces the value into `[0, 4]` (`skald-backend/core/codegen.odin:1620-1623`). The multiply itself applies no clamp at all (`skald-backend/core/codegen.odin:714`), so an LFO or Mapper patched into `input_gain` can drive the multiplier negative or far past 4. Negative multipliers invert the waveform. This is a meaningful asymmetry — a game developer reading `MyAsset_PARAMS` sees `{"gain", 0.0, 4.0, ...}` and would reasonably assume 0–4 is the operating envelope of that parameter, when the patch itself can exceed it. Contrast with Panner (`skald-backend/core/codegen.odin:672-674`) and Distortion mix (`:597`), which *do* clamp modulated values at the point of use with explanatory comments. Whether the VCA's freedom is deliberate (it enables through-zero/ring-mod tricks) is not recorded anywhere in the code.

**4. The sidebar tooltip promises tremolo, but the obvious patch gives ring modulation.** *(cosmetic)*
`skald-ui/src/components/Sidebar.tsx:278` suggests modulating the gain input "for tremolo". Skald's only LFO is bipolar around zero (`skald-backend/core/codegen.odin:379-385`) with a default `amplitude` of 1.0 (`skald-ui/src/definitions/node-definitions.ts:76`). Patched straight into a VCA whose knob is at the recommended 0, that gives a multiplier of ±1.0 — half of every cycle inverted, which standard practice classifies as ring modulation, not tremolo [Source: https://docs.cycling74.com/max8/tutorials/06_synthesischapter02]. Getting true tremolo requires either raising the knob above the LFO amplitude or inserting a Mapper to make the modulator unipolar. Neither is hinted at in the UI.

**5. There is no `GainNode.md` in `skald-ui/new_docs/`.** *(cosmetic)*
Twenty-four component docs exist there, including one for every other node type, but the VCA has none. No stale claims to reconcile — just a gap.
