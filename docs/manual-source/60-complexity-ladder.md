# Making instruments more complex

> A patch that never changes sounds like a machine; this chapter is about the handful of things you add — layers, modulation, envelopes, space and dirt — that make a patch sound like an instrument someone is playing.

## What it is

You have probably already built a working sound: an oscillator, an envelope, a filter, an output. It plays notes. It is also, almost certainly, disappointing — thin, flat, plasticky, "cheap". Nothing is broken. The problem is that it is **static**: every note is a byte-for-byte identical copy of every other note, and within each note nothing moves except the volume.

Real sound is never like that. Hit a piano string and the hammer noise, the bright first 50 milliseconds, the fundamental and the slowly-shifting beating between the three strings per note are all doing different things on different timescales. Your hearing is a change detector. Give it something that doesn't change and it stops paying attention within about a second — the sound stops being an event and becomes a tone. Gordon Reid's *Synth Secrets* puts it plainly: modulation is "the trick that makes sounds live and breathe in an organic sort of way," and it is "undoubtedly the most involved (and involving) subject in all of synthesis" [Source: https://www.soundonsound.com/techniques/modulation].

There are only really **two** ingredients you can add, and everything in this chapter is one of them wearing a costume.

The first is **depth**: more than one thing sounding at once. Two oscillators an octave apart. A noise burst on the attack. Seven sawtooths a few cents out of tune with each other. Depth works because your ear fuses simultaneous sounds that start together into a single perceived object, and the object it builds is richer than any of its parts. The Roland JP-8000's famous supersaw is nothing more than seven detuned sawtooths stacked into one oscillator, with a Detune control that spreads six side saws around a fundamental that stays in tune — and it became the defining sound of a genre because those seven voices "gradually drift apart and interact, filling the spaces in between" [Source: https://www.perfectcircuit.com/signal/super-saw-history].

The second is **movement**: things changing over the life of a note, and from note to note. Movement comes in three timescales. Milliseconds — the attack transient, the click and the breath. Tenths of a second to a few seconds — envelopes, the arc of the note. Seconds to tens of seconds — slow LFOs and random drift that make bar 8 sound different from bar 1. Reid's article gives the classic map for one modulator's speed: around 0.1 Hz you get a slow ambient sweep, 1–2 Hz reads as wah-wah, and 10–20 Hz becomes a growl [Source: https://www.soundonsound.com/techniques/modulation]. Same wire, three completely different instruments, purely as a function of rate.

Here is the analogy worth carrying: a static patch is a **photograph of a sound**. Adding layers is like adding more objects to the photograph — it gets busier, but it is still a photograph. Adding modulation is what turns it into **film**. Most beginners keep adding objects to the photograph and wonder why it still feels dead. The single biggest upgrade available to you is usually not another oscillator; it is a second envelope aimed somewhere other than volume.

And then there is the part nobody tells you: **restraint**. Every layer you add takes up spectrum. A muddy mix is almost always too much energy piled into roughly 200–500 Hz, where the fundamentals of most instruments live, and it is a *buildup* problem — each layer sounds fine alone and the sum sounds like a blanket [Source: https://adrianmilea.com/how-to-fix-muddy-mix/]. The discipline of deciding, up front, how much room each part gets is **gain staging**, and it is the difference between a big sound and a loud smear [Source: https://www.soundonsound.com/techniques/gain-staging-your-daw-software].

## What it looks like in Skald

There is no "Complexity" node. Complexity in Skald is made from three raw materials.

**1. The palette.** The left sidebar's **Nodes** section holds seventeen draggable node types, from Oscillator down to MIDI Input (`skald-ui/src/components/Sidebar.tsx::paletteNodes`). That list is the whole vocabulary. Anything this chapter suggests is built from those.

**2. The Instrument container.** Only nodes inside an **Instrument** become audio: both the exporter and the live preview build the project from `getInstrumentNodes`, which filters the canvas down to `n.type === 'instrument'` (`skald-ui/src/utils/projectSerializer.ts::getInstrumentNodes`). A loose chain on the main canvas is silent. The Instrument also owns the expression controls — voice count, glide, unison, detune (`skald-ui/src/components/NodeParameterControls.tsx::NodeParameterControls`). See the *Instrument / Group containers* chapter for the full story.

**3. The modulation inputs.** This is the part that decides what is actually possible. A modulation destination exists **only** where a node draws an input handle for it. Here is the complete, honest list, taken from the node components and cross-checked against the backend's port validator (`skald-backend/core/graph_validate.odin::valid_input_ports`):

| Node | Modulation inputs (handle id → label) | Source |
|---|---|---|
| Oscillator | `input_freq` → **Freq**, `input_amp` → **Amp**, `input_pulseWidth` → **PW** | `skald-ui/src/components/Nodes/OscillatorNode.tsx::OscillatorNode` |
| Wavetable | `input_freq` → **Freq**, `input_pos` → **Pos**, `input_amp` → **Amp** | `skald-ui/src/components/Nodes/WavetableNode.tsx::WavetableNode` |
| FM Operator | `input_mod` → **Mod**, `input_carrier` → **Carrier** | `skald-ui/src/components/Nodes/FMOperatorNode.tsx::FmOperatorNode` |
| Filter | `input` → **In**, `input_cutoff` → **Cut**, `input_res` → **Res** | `skald-ui/src/components/Nodes/FilterNode.tsx::FilterNode` |
| VCA (Gain) | `input` → **In**, `input_gain` → **Gain** | `skald-ui/src/components/Nodes/GainNode.tsx::VisualGainNode` |
| Panner | `input` → **In**, `input_pan` → **Pan** | `skald-ui/src/components/Nodes/PannerNode.tsx::PannerNode` |
| Noise | `input_amp` → **Amp** | `skald-ui/src/components/Nodes/NoiseNode.tsx::NoiseNode` |
| ADSR | `input` → **In** (the signal the envelope multiplies) | `skald-ui/src/components/Nodes/ADSRNode.tsx::ADSRNode` |
| Mapper | `input` → **In** | `skald-ui/src/components/Nodes/MapperNode.tsx::MapperNode` |
| Mixer | `input_1` … `input_N`, one per channel | `skald-ui/src/components/Nodes/MixerNode.tsx::MixerNode` |
| Delay / Reverb / Distortion | `input` only | `skald-ui/src/components/Nodes/DelayNode.tsx::DelayNode`, `skald-ui/src/components/Nodes/ReverbNode.tsx::ReverbNode`, `skald-ui/src/components/Nodes/DistortionNode.tsx::DistortionNode` |
| LFO / S&H / MIDI Input | none — sources only | `skald-backend/core/graph_validate.odin::valid_input_ports` |

Read that table twice, because it tells you what you **cannot** modulate with a wire in Skald today: delay time, reverb decay, distortion drive, mixer channel levels, envelope depth. Those are runtime parameters (see *expose*, below), not patchable destinations. If a tutorial from another synth tells you to LFO the delay time, Skald cannot do it with a cable.

**Modulation in Skald is additive, and it is added to the knob value.** When a wire lands on `input_cutoff`, the generated code computes `(base cutoff) + (sum of every wire into that port)` (`skald-backend/core/param_utils.odin::get_f32_param`). A Mapper set to output 0–3500 feeding a filter parked at 1100 Hz gives you 1100–4600 Hz, not 0–3500 Hz. Several wires into the same port all sum. The one exception is pitch: `input_freq` is **exponential** — `base × 2^(sum)`, so the modulator's units are *octaves*, clamped to ±10 (`skald-backend/core/codegen_nodes.odin::generate_oscillator_code`). An LFO at amplitude 0.03 into `input_freq` is ±0.03 octaves ≈ ±36 cents of vibrato.

**Rate.** Everything in Skald runs at audio rate — there is no separate control-rate scheduler. An LFO's phase advances once per sample exactly like an oscillator's (`skald-backend/core/codegen_nodes.odin::generate_lfo_code`), which is why an LFO pushed to 200 Hz stops being modulation and becomes an audible ring-modulator. The only real domain split is **voice vs bus**: Delay, Reverb and everything downstream of them run **once per sample on the summed output of all voices**, not per voice (`skald-backend/core/codegen_analysis.odin::compute_bus_domain`, `skald-backend/core/codegen_processor.odin::generate_processor_code`). That is Skald automatically giving you a shared effects send.

## The controls

These are the parameters you reach for when you want a patch to sound bigger, and only these ranges are real. Instrument-level values come from the parameter panel (`skald-ui/src/components/NodeParameterControls.tsx::NodeParameterControls`) and are clamped again at export by the backend's range table, rendered from the one authored copy in `schema/nodes.json` (`skald-backend/core/param_ranges.generated.odin`).

| Parameter | Range | Default | Unit | What it does to the sound |
|---|---|---|---|---|
| `unison` (Instrument) | 1–16 panel and backend (`skald-ui/src/components/NodeParameterControls.tsx::NodeParameterControls`, `schema/nodes.json::generic`) | 1 | copies | How many detuned copies of **every Oscillator node** run inside each voice (`skald-backend/core/codegen_nodes.odin::generate_oscillator_code`). |
| `detune` (Instrument) | 0–100 (`skald-ui/src/components/NodeParameterControls.tsx::NodeParameterControls`, `schema/nodes.json::generic`) | 5 | cents | Half-spread of the unison stack: copies land evenly across **±detune** cents (`skald-backend/core/codegen_nodes.odin::generate_oscillator_code`). |
| `voiceCount` (Instrument) | 1–32 panel and backend (`skald-ui/src/components/NodeParameterControls.tsx::NodeParameterControls`, `schema/nodes.json::generic`) | 8 | voices | How many notes can sound at once (`skald-backend/core/codegen_processor.odin::generate_processor_code`). |
| `glide` (Instrument) | 0–5 panel and backend (`skald-ui/src/components/NodeParameterControls.tsx::NodeParameterControls`, `schema/nodes.json::generic`) | 0.05 | s | Pitch slide time — but **only on a stolen voice** (`skald-backend/core/codegen_processor.odin::generate_processor_code`). |
| `volume` (Instrument) | 0–1 (`skald-ui/src/components/NodeParameterControls.tsx::NodeParameterControls`) | 1.0 | linear | Asset trim, applied at the last line of `_process` (`skald-backend/core/codegen_processor.odin::generate_processor_code`). |
| `velocitySensitivity` (ADSR) | 0–1 (`skald-ui/src/components/NodeParameterControls.tsx::NodeParameterControls`, `schema/nodes.json::generic`) | 0.5 | — | How much note velocity scales this envelope (`skald-backend/core/codegen_nodes.odin::generate_adsr_code`). |
| `depth` (ADSR) | 0–1 (`skald-ui/src/components/NodeParameterControls.tsx::NodeParameterControls`, `schema/nodes.json::generic`) | 1.0 | — | Output scale of the envelope — the amount knob for a modulation envelope. |
| `amplitude` (LFO) | 0–1 panel (`skald-ui/src/components/NodeParameterControls.tsx::NodeParameterControls`); **0–20000** backend (`schema/nodes.json::overrides`) | 1.0 | depends on target | Modulation depth. Into `input_freq` it is octaves; into `input_cutoff` it is Hz. |
| `frequency` (LFO) | 0.1–50 panel, log (`skald-ui/src/components/NodeParameterControls.tsx::NodeParameterControls`); 0.01–100 backend (`schema/nodes.json::overrides`) | 5.0 | Hz | Modulation rate. The panel's own slider stops short of the runtime clamp; type past 50 on the node card to reach it. |
| `rate` (S&H) | 0.1–50 panel, log (`skald-ui/src/components/NodeParameterControls.tsx::NodeParameterControls`); 0.1–1000 backend (`schema/nodes.json::overrides`) | 10.0 | Hz | How often a new random value is latched (`skald-backend/core/codegen_nodes.odin::generate_sample_hold_code`). |
| `outMin` / `outMax` (Mapper) | ±1e6 (`schema/nodes.json::generic`, `schema/nodes.json::overrides` for `outMax`) | 0 / 1 | target's unit | Rescales a modulator into the units of its destination (`skald-backend/core/codegen_nodes.odin::generate_mapper_code`). |
| `level1…N` (Mixer) | 0–2 (`skald-ui/src/components/NodeParameterControls.tsx::NodeParameterControls`) | 0.75 UI / 1.0 backend | × | Per-layer balance (`skald-backend/core/codegen_nodes.odin::generate_mixer_code`). |
| `mix` (Distortion) | 0–1 (`skald-ui/src/components/NodeParameterControls.tsx::NodeParameterControls`, `schema/nodes.json::generic`) | 0.5 | — | Wet/dry blend — this is your **parallel distortion** control (`skald-backend/core/codegen_nodes.odin::generate_distortion_code`). |
| `drive` (Distortion) | 1–100 (`skald-ui/src/components/NodeParameterControls.tsx::NodeParameterControls`, `schema/nodes.json::generic`) | 20 | × | Pre-gain into the waveshaper (`skald-backend/core/codegen_nodes.odin::generate_distortion_code`). |
| `pan` (Panner) | −1 to 1 (`skald-ui/src/components/NodeParameterControls.tsx::NodeParameterControls`, `schema/nodes.json::generic`) | 0 | — | Equal-power stereo position (`skald-backend/core/codegen_nodes.odin::generate_panner_code`). |

### What you actually hear

**Unison and detune together.** Unison alone does *nothing*: with `detune = 0` all copies run at the same frequency from the same reset phase, and since the stack is divided by the copy count (`skald-backend/core/codegen_nodes.odin::generate_oscillator_code`) seven identical saws average back to exactly one saw. Detune is where the sound comes from. At **±3–8 cents** you get a gentle chorus — adjacent copies beat about half a Hz apart at A4, which reads as "recorded well". At **±20–35 cents** you get the classic supersaw: adjacent copies beat a few times a second and the outer pair beats fast enough to blur into fuzz. Above **±60 cents** it stops being one note; it becomes a chord you did not ask for and the pitch centre gets ambiguous. The supersaw example ships at 7 copies and ±30 cents.

**Voice count.** Below the number of notes you play, you get **voice stealing** — a sounding note is cut off to make room. Skald steals in two tiers: first the oldest voice that has already been released — every voice-domain ADSR in its graph sitting in Release or Idle — and only when nothing qualifies does it fall back to the oldest voice outright (`skald-backend/core/codegen_processor.odin::generate_processor_code`). A graph with no ADSR has no release tier and always uses that fallback. With a long pad, held notes are protected as long as a released voice exists to take the hit instead; once every voice is genuinely still sounding, the oldest goes. With a short pluck you will rarely notice either way, because a released voice is almost always available. Cost matters here: unison multiplies voices. 8 voices × 7 unison copies = 56 sawtooth oscillators per sample, and the preview is doing all of that in a browser.

**Velocity sensitivity.** At 0 every note is identical no matter how hard the sequencer hits it — the "cheap" giveaway. At 1 a velocity of 0.5 halves the envelope. The generated scale factor is `(1 − vs) + vs × velocity` (`skald-backend/core/codegen_nodes.odin::generate_adsr_code`), so at the default 0.5 a soft note is still 75% as loud. The professional move is to put **more** velocity sensitivity on the filter envelope than the amp envelope, so hard notes get *brighter* rather than just louder — a lowpass cutoff is the single most rewarding velocity destination on a synth [Source: https://www.sweetwater.com/insync/adjusting-velocity-to-filter-cutoff-synth-clips-7/]. The Growly Sax does exactly this: amp envelope at 0.8, breath puff at 0.5, pitch scoop at 0 (`examples/instruments/winds/growly-sax.skald.json::growl-amp`, `examples/instruments/winds/growly-sax.skald.json::growl-puff`, `examples/instruments/winds/growly-sax.skald.json::growl-scoop`).

**LFO rate.** Under 0.3 Hz you are painting the bar, not the note — nobody hears "an LFO", they hear the pad evolving. 4–7 Hz on pitch is vibrato. 1–2 Hz on cutoff is wah. Around 10–20 Hz on cutoff you get growl [Source: https://www.soundonsound.com/techniques/modulation]. Past about 30 Hz the modulation itself becomes a pitch and you have accidentally built an FM patch.

**Distortion mix.** This one is worth internalising: because the node blends `dry × (1 − mix) + shaped × mix` (`skald-backend/core/codegen_nodes.odin::generate_distortion_code`), the `mix` slider *is* parallel processing. At 1.0 you destroy the transient along with everything else. At **0.2–0.4** the dry signal's attack survives intact and the distorted copy just adds harmonics and apparent loudness underneath — exactly the reason engineers blend rather than replace [Source: https://babyaud.io/blog/parallel-processing]. Every distortion in the shipped examples sits in that window: 0.25 on the sax, 0.25 on the picked bass, 0.38 on the wobble bass.

### What "expose" does, and why you would

Every parameter row in the right-hand panel has a small link icon. Clicking it toggles that parameter's name into the node's `exposedParameters` list (`skald-ui/src/components/ParameterPanel.tsx::ParameterPanel`). That single flag changes what the exported Odin looks like:

- The value stops being a baked-in constant and becomes a **field on the processor struct**, read fresh every sample (`skald-backend/core/param_utils.odin::get_f32_param`).
- You get a typed setter, `<Asset>_set_<param>(p, value)`, with the min/max from `schema/nodes.json` compiled in as a hard clamp (`skald-backend/core/codegen_processor.odin::generate_processor_code`).
- The parameter appears in the asset's `<Asset>_PARAMS` introspection table with its name, range, default and unit, so a debug overlay or save system can enumerate it (`skald-backend/core/codegen_processor.odin::generate_processor_code`).
- It becomes reachable by string through `<Asset>_set_param` / `_get_param`, under both its field name and a `"<node id>::<param>"` alias (`skald-backend/core/codegen_processor.odin::generate_processor_code`).

Why you would: **complexity that the game can steer at runtime is worth more than complexity that is frozen at export.** Expose a filter cutoff and the engine can open it as the player accelerates. Expose an LFO rate and the ambience can speed up as tension rises. Expose an instrument's mixer levels and one asset covers "distant" and "close" versions of the same sound. The cost is real but small: an exposed parameter is a memory read per sample instead of a constant the Odin compiler could have folded away. Expose what the game will actually touch, not everything.

## Try it (hands-on)

**Patch:** `examples/instruments/leads/supersaw-hypersaw-lead.skald.json`. It is one Instrument named "Supersaw Lead" containing seven nodes: a sawtooth oscillator, a lowpass filter at 1100 Hz / Q 1.1, an amp envelope, a filter envelope, a Mapper scaling that envelope to 0–3500 Hz, a 5.5 Hz vibrato LFO, and an Output. Unison 7, detune 30, 8 voices, glide 0.02, project tempo 128 BPM with a 16-step riff. Ten minutes.

1. **Load and listen.** Sidebar → *Graph Actions* → **Open File...**, choose the file. Press **Play**. You should hear a wide, bright, buzzing lead running a 9-note riff. Leave it playing; every step below is audible live.

2. **Kill the width.** Click the **Supersaw Lead** instrument node. In the right panel find **Unison Voices** and drag it from 7 to **1**. The sound collapses to a single thin saw — same notes, same filter, a fraction of the size. Drag it back to 7.

3. **Prove that detune, not count, does the work.** Leave Unison at 7 and drag **Detune (cents)** to **0**. It sounds *identical to step 2's single saw*. Seven copies at the same frequency from the same start phase are one copy, averaged (`skald-backend/core/codegen_nodes.odin::generate_oscillator_code`). This is phase coherence, and it is the same arithmetic that causes phase cancellation when copies are opposed instead of aligned.

4. **Sweep the detune.** Move Detune slowly: **5** (a polite chorus), **15** (thick), **30** (the shipped supersaw — adjacent copies are 10 cents apart, beating about 2.5 times a second at A4), **60** (starting to sound out of tune), **100** (seasick; the pitch centre is gone). Park it back at 30.

5. **Freeze the filter.** Click the **Env 0-3500 Hz** Mapper node and set **Output Max** to **0**. The filter is now nailed at its knob value of 1100 Hz and every note has the same brightness for its whole life. Notice how much of the "expensive" quality just left, and that you did not touch a single oscillator. Set it back to **3500** — now each note opens to 1100 + 3500 = 4600 Hz at the envelope peak and settles to 1100 + 0.4 × 3500 ≈ 2500 Hz at sustain.

6. **Turn off the wobble.** Click the **Vibrato** LFO and set **Amplitude (Depth)** to **0**. The pitch is now mathematically perfect, and it sounds worse — sterile. Set it to **0.03** (the shipped value, ±36 cents). Then try **0.3** — that is ±0.3 octaves, an air-raid siren. Back to 0.03.

7. **Break it — resonance.** Click **Bright Lowpass** and drag **Resonance** to **20**, the top of its range, while the riff plays. The filter starts screaming a pitched whistle at the cutoff frequency on every note; the musical content vanishes behind the resonant peak. Now push the Mapper's **Output Max** to **12000** as well. You will hear the sweep get brighter and then *stop* getting brighter — Skald clamps the filter's cutoff to `sample_rate × 0.16` (about 7.7 kHz at 48 kHz) because a Chamberlin state-variable filter diverges to infinity above roughly a sixth of the sample rate (`skald-backend/core/codegen_nodes.odin::generate_filter_code`). This is the lesson: pushing a control past its useful zone does not give you "more", it gives you a different, worse sound plus a guard rail you did not know was there. Return Resonance to 1.1 and Output Max to 3500.

8. **Add one thing.** With the riff still playing, drag a **Distortion** node onto the canvas inside the instrument, wire **Amp → Distortion In** and **Distortion Out → Output** (replacing the direct wire), then set Drive **12**, Tone **5000**, Mix **0.25**. Compare with Mix at **1.0**: at 1.0 the pick attack flattens and the whole thing gets smaller-but-louder; at 0.25 the dry attack survives and the sound simply gets denser. That is the entire argument for parallel processing in one slider.

## Why you patch it this way

Seven techniques. For each: the idea, why it works, the exact Skald shape, and something to listen for.

### 1. Layering — several sources, one perceived instrument

**Idea.** Give each layer one job the others cannot do: sub weight, midrange body, high-frequency detail, attack transient.

**Why it works.** Simultaneous sounds that begin together fuse into one object, and your ear reads the composite spectrum as a single timbre. The corollary is the trap: layers that occupy the *same* band do not add richness, they add mud in the 200–500 Hz low-mids [Source: https://adrianmilea.com/how-to-fix-muddy-mix/].

**Skald shape.** Sources → **Mixer** (`input_1…input_N`) → shared filter → shared amp envelope → Output. Set the Mixer's per-channel levels so exactly one layer is the loudest thing (`skald-backend/core/codegen_nodes.odin::generate_mixer_code`). `examples/instruments/bass/picked-rock-bass.skald.json` is the canonical build: a saw "Pick" and a sine "Sub" into channels 1 and 2 at 0.6, and a white-noise "Pick Click" with its own 30 ms envelope into channel 3 at 0.35.

**Listening test.** Solo each layer by setting the other channel levels to 0. Each one alone should sound useless — the sub is a hum, the click is a tick. If a layer sounds like a finished instrument on its own, it is fighting the others rather than completing them.

### 2. Unison and detune — one source, many copies

**Idea.** Instead of stacking different oscillators, stack copies of the same one, slightly out of tune.

**Why it works.** Two tones a few cents apart drift in and out of phase, so their sum pulses at the difference frequency; with seven copies you get a dense mesh of beat rates that never repeats. That is the supersaw [Source: https://www.perfectcircuit.com/signal/super-saw-history].

**Skald shape.** This is *not* a node. Set **Unison** and **Detune** on the Instrument and every Oscillator inside it multiplies (`skald-backend/core/codegen_nodes.odin::generate_oscillator_code`, phase storage in `skald-backend/core/codegen_processor.odin::generate_processor_code`). `synth-reese-bass.skald.json` uses 7 × 28 cents; `supersaw-hypersaw-lead.skald.json` uses 7 × 30; `acoustic-pluck.skald.json` uses a subtle 2 × 5.

**Listening test.** Play a single long note and count the pulses per second. If you can count them, you are in chorus territory; if they blur, you are in supersaw territory. If you hear two distinct pitches, back the detune off.

### 3. More than one modulator, and modulating a modulator

**Idea.** One LFO on the cutoff is a effect. Two modulators of different character on the same destination is a *behaviour*.

**Why it works.** Two periodic modulators at unrelated rates produce a pattern whose repeat time is their least common multiple — long enough that the ear gives up looking for the loop. Adding a *random* modulator removes the loop entirely.

**Skald shape.** Because modulation into a port is summed (`skald-backend/core/param_utils.odin::get_f32_param`), you simply wire both into `input_cutoff`. `wobble-samplehold-bass.skald.json` runs a BPM-synced 1/8 Sample & Hold through a Mapper to 150–1900 Hz *and* a 1/4-note triangle LFO through a Mapper to 0–900 Hz, both into the same filter. `evolving-motion-pad.skald.json` stacks three: a 0.12 Hz LFO at amplitude 380 (i.e. ±380 Hz) straight into cutoff, a 1.5 Hz S&H mapped to 150–1100 Hz into the same port, and a 4.5 Hz shimmer into oscillator pitch.

**Modulating a modulator** has one clean idiom in Skald, and it is the most valuable patch in the repo. Put a **VCA (Gain)** in the modulator's path and drive its `input_gain` from an envelope: the envelope now controls *how much* modulation there is, not the destination directly. `fm-rhodes-electric-piano.skald.json` does this to build an electric piano — a "Tine Mod" FM operator at ratio 14 goes into a VCA whose gain is driven by a 120 ms decay envelope through a Mapper, and only then into the carrier's `input_mod`. The result is the metallic tine ping that exists for a tenth of a second and then disappears, leaving a mellow sine body. That is a **time-varying FM index**, and it is why the patch sounds like an instrument rather than a bell.

**Listening test.** Let a note sustain for 20 seconds. If you can predict what it will do next, add a second modulator at an unrelated rate.

### 4. Two envelopes with different shapes

**Idea.** The amp envelope decides *when* you hear the note. A second envelope on the filter decides *what it sounds like* while you hear it.

**Why it works.** In struck and plucked instruments the high harmonics decay faster than the low ones, so brightness dies before loudness does. Setting a fast, short filter envelope against a slow amp envelope reproduces that directly [Source: https://www.aulart.com/blog/understanding-amplitude-and-filter-envelopes/].

**Skald shape.** `ADSR → Mapper (0 → N Hz) → Filter.input_cutoff`, in parallel with `Filter → ADSR (amp) → Output`. The Mapper is mandatory: an envelope outputs 0–1 and a cutoff wants Hz. Note that the filter envelope's ADSR has **no audio input** — with nothing wired to its In port the generated code multiplies by 1.0 and it becomes a pure control source (`skald-backend/core/codegen_nodes.odin::generate_adsr_code`). Every serious example in the repo does this; `supersaw-hypersaw-lead.skald.json` pairs a 0.35 s filter decay against a 0.2 s amp decay with a 0.8 sustain.

**Listening test.** Hold one note for four seconds. You should hear the tone change shape well before the volume does. If the note is equally bright at second 3 as at second 0, you have one envelope doing two jobs.

### 5. Space — reverb, delay, pre-delay, and why bass stays centred

**Idea.** Space is what tells the listener *where* the sound is. Without it a synth sits flat against the speaker.

**Why it works.** Your brain infers distance from the ratio of direct sound to reflected sound, and from the gap before the first reflections. Insert a short gap — a **pre-delay** — and the dry sound establishes itself before the tail blooms, which keeps the attack clear while still placing the sound in a room. iZotope's starting points: 20–80 ms for vocals, 5–50 ms for drums, 40–100 ms for guitars [Source: https://www.izotope.com/en/learn/reverb-pre-delay]. Low frequencies are the exception to everything: below roughly 60–100 Hz, width buys you nothing and costs you weight when the signal is summed to mono [Source: https://www.masteringthemix.com/blogs/learn/how-to-add-width-to-bass-without-losing-mono-compatibility].

**Skald shape.** Reverb and Delay are automatically **shared across all voices** — Skald pulls them and everything downstream out of the per-voice loop and runs them once per sample on the voice sum (`skald-backend/core/codegen_analysis.odin::compute_bus_domain`, `skald-backend/core/codegen_processor.odin::generate_processor_code`). You get send-style behaviour for free, and reverb tails keep ringing after the last voice dies. Series order that works: `... → amp ADSR → Delay → Reverb → Output`, as in `ambient-clean.skald.json` (BPM-synced 1/4 echo at 40% feedback / 28% mix, into a 2.8 s reverb at 30% mix).

Two Skald-specific facts you need:

- **The Reverb node's Pre-Delay control is real.** Every Reverb has a genuine pre-delay stage ahead of its tail: the dry signal is written into its own small ring buffer and read back `preDelay` seconds later (clamped 0–0.25 s) before it ever reaches the feedback comb (`skald-backend/core/codegen_nodes.odin::generate_reverb_code`). This used to be a rendered, exposable control that the generator silently ignored; it is now wired all the way through, so dialling Pre-Delay up genuinely opens a gap before the room blooms. `growly-sax.skald.json`'s Room reverb sets it to 0.01 s.
- **Stereo only survives a direct wire to Output.** The Panner writes a left/right pair, but it also writes a mono downmix, and every other node reads the mono one (`skald-backend/core/codegen_nodes.odin::generate_panner_code`). Only `GraphOutput` picks up the stereo pair, and only when the Panner feeds it directly (`skald-backend/core/codegen_nodes.odin::generate_graph_output_adds`). So `Panner → Mixer → Output` silently collapses to mono. Pan last. `glassy-fm-pluck.skald.json` gets this right: a 0.3 Hz LFO into `input_pan`, Panner straight into Output.

**Listening test.** Set the reverb mix to 1.0 for a second — you should hear only the room. Then find the lowest mix that still makes the sound feel like it is somewhere. For a lead that is usually 0.1–0.2; the shipped sax uses 0.15. For a bass, use less than you think, and never pan it.

### 6. Dirt and character — parallel distortion and tone after the drive

**Idea.** Distortion adds harmonics that were not in the source. Used in parallel it adds weight and presence without eating the transient.

**Why it works.** A waveshaper's output depends on input level, so it squashes exactly the loud attack you wanted to keep. Blending the untouched dry signal back in restores the snap while keeping the harmonics [Source: https://babyaud.io/blog/parallel-processing].

**Skald shape.** You do not need a parallel bus — the Distortion node already is one. Its chain is `drive → waveshaper → one-pole lowpass at tone → wet/dry mix` (`skald-backend/core/codegen_nodes.odin::generate_distortion_code`), and the `tone` filter sits on the **wet path only**, so it tames the fizz the shaper just created without dulling your dry signal. Four shapes are selectable: `classic`, `soft`, `hard`, `asymmetric` (`skald-ui/src/components/NodeParameterControls.tsx::NodeParameterControls`, matched in `skald-backend/core/codegen_nodes.odin::generate_distortion_code`). `soft` is `tanh` — smooth, tube-ish. `hard` is a brick-wall clip — buzzy. `asymmetric` shapes only the negative half, which adds even-order harmonics.

For **breath and attack noise**, use a Noise node with its *own* short envelope into its own mixer channel — never into the same envelope as the tone. `growly-sax.skald.json` runs pink noise → 4.5 kHz bandpass → a 10 ms/120 ms "Puff" envelope → mixer channel 3 at 0.35. `picked-rock-bass.skald.json` uses white noise with a 1 ms attack / 30 ms decay / **zero sustain** envelope, so the click exists only during the attack.

**Listening test.** A/B the distortion Mix between 0.25 and 1.0 on a percussive patch. If the drum-like snap disappears, you are too wet.

### 7. Series versus parallel filtering

**Idea.** Filters in series subtract. Filters in parallel, summed through a Mixer, build a spectrum out of resonant peaks — which is how vowels and instrument bodies work.

**Skald shape.** Send one oscillator to *two* filters, then both into a Mixer. `growly-sax.skald.json` runs its sawtooth reed into a 1600 Hz lowpass "Body" **and** a 1100 Hz bandpass with Q 2.5 "Formant", summing them at 0.8 and 0.5. That parallel bandpass is the entire reason it reads as a wind instrument and not a saw through a filter.

**Listening test.** Mute the bandpass channel (level 0). The sound should lose its "throat" and become generic.

### Order matters — and Skald will refuse some orders

- **Filter before amp envelope.** A filter has state that rings; put it after the amp envelope and the ring persists into what should be silence.
- **Distortion before the amp envelope, not after.** A waveshaper is level-dependent, so distorting after the envelope means quiet notes distort less — which is sometimes the point, but usually just makes the patch inconsistent. Every example puts drive before the amp ADSR.
- **Delay and Reverb last.** Not stylistic — structural. Skald hard-errors at export if an Oscillator, ADSR, FM Operator, Wavetable or MIDI Input node ends up downstream of a Delay or Reverb, because those nodes read per-voice state that does not exist on the shared bus (`skald-backend/core/codegen_analysis.odin::compute_bus_domain`).
- **No feedback loops.** Wiring a node's output back into its own chain is rejected at export with a list of the nodes in the cycle (`skald-backend/core/codegen_processor.odin::generate_processor_code`, which calls `skald-backend/core/graph_utils.odin::topological_sort`). Skald is a directed acyclic graph. The only feedback you get is inside the Delay and Reverb nodes.

## Going further

Concrete next moves, in rough order of payoff.

**Give the modulation somewhere new to go.** Most patches only ever modulate cutoff. Try: an LFO into `input_pulseWidth` on a Square oscillator (this is PWM, the source of the "lush chorused sounds that make many analogue synthesizers so desirable" [Source: https://www.soundonsound.com/techniques/modulation]; note the pulse width control only appears when the waveform is Square, `skald-ui/src/components/NodeParameterControls.tsx::NodeParameterControls`); an envelope into `input_pos` on a Wavetable so the note morphs sine → triangle → saw → square as it decays (`skald-backend/core/codegen_nodes.odin::generate_wavetable_code`); an LFO into `input_gain` on a VCA for tremolo; an envelope into a second oscillator's `input_amp` so a layer fades in *after* the attack.

**Add a third envelope with a job nothing else has.** The pitch scoop in `growly-sax.skald.json` is a 70 ms attack envelope mapped to −0.12 → 0 octaves into `input_freq`, with velocity sensitivity **0** so it behaves the same on every note — the reed settling into pitch. Ten nodes' worth of patch, and that one three-node chain is what makes it a sax.

**Layer by octave, not by unison.** Add a second Oscillator, leave `fixedPitch` off so it tracks the note, and mix it under the first at a lower level. Because pitch comes from `voice.current_freq` you cannot transpose an oscillator by a knob — but you *can* transpose it with a wire: a Mapper with `inMin = inMax = 0`, `outMin = outMax = -1` feeding `input_freq` shifts that oscillator down exactly one octave (the port is exponential, in octaves — `skald-backend/core/codegen_nodes.odin::generate_oscillator_code`). This is the cheapest way to add sub weight.

**Use the sequencer's velocities.** The riffs in the examples are not flat: the supersaw's nine notes range 0.76–0.92. With velocity sensitivity on both envelopes, that variation alone reads as a performance.

**Split the sound across BPM-synced modulators.** Set `bpmSync` on an LFO or S&H and its rate is derived from the project tempo at runtime (`skald-backend/core/codegen_analysis.odin::bpm_sync_seconds_expr`), so a 1/8 wobble stays a 1/8 wobble when the game changes tempo. `wobble-samplehold-bass.skald.json` and `ambient-clean.skald.json` both do this.

**Expose the two or three parameters the game will drive**, and nothing else. A filter cutoff, a reverb mix, an LFO rate. Then read `<Asset>_PARAMS` from your game's debug overlay and you have a live tuning panel for free (`skald-backend/core/codegen_processor.odin::generate_processor_code`).

### Restraint — when adding a node makes it worse

The largest instrument shipped in `examples/instruments/` is the sax at **14 nodes**; most sit between 5 and 11. That is not a limitation, it is a finding: past about a dozen nodes, extra parts almost always duplicate a job an existing part is already doing.

Three specific failure modes:

- **Mud.** Every layer you add drops energy into 200–500 Hz. If a new layer does not have a frequency job that is genuinely vacant, it is costing you clarity [Source: https://adrianmilea.com/how-to-fix-muddy-mix/]. The Skald fix is a **highpass Filter** on the layer that does not need low end, before the mixer.
- **Gain creep.** Correlated layers add +6 dB, uncorrelated ones about +3 dB. Skald catches the disaster for you — the project sum goes through a `tanh` soft limiter (`skald-backend/core/codegen_project.odin::generate_project_code`) — but a patch that lives permanently inside that limiter has no dynamics left. Use the Instrument's `volume` (`skald-backend/core/codegen_processor.odin::generate_processor_code`) and the Mixer channel levels to arrive at the output with headroom, not to rescue it afterwards.
- **Modulation soup.** Three modulators on one destination sum (`skald-backend/core/param_utils.odin::get_f32_param`). Three deep modulations on the same cutoff do not make it more interesting; they make it noise. If you cannot describe in one sentence what a modulator is *for*, delete it.

The test for any new node: mute it. If the patch does not get worse, it was not doing anything.

## The complexity ladder

Each rung adds exactly one idea. Every example listed here is real and was read for this chapter. The row marked **flat** has its nodes loose on the canvas rather than inside an Instrument, and it still plays: a loose graph auto-wraps into one SFX instrument named `Asset`, with `voiceCount` 1, `unison` 1 and no glide (`skald-ui/src/utils/projectSerializer.ts::buildProjectData` on the preview path, mirrored on the export path by `skald-backend/core/json.odin::build_project_from_graph_raw`). It is not a broken example — it is simply authored without the Instrument controls (voice count, glide, unison, detune) that wrapping it would give you. Some of them also use pre-rename handle names (`cutoff`, `frequency`, `pulseWidth`), which is harmless: the loader rewrites those onto today's port names before validation ever sees them (`skald-backend/core/json.odin::normalize_port`), so they codegen and compile cleanly.

| Level | What you add | What you learn | Example patch |
|---|---|---|---|
| 0 | Oscillator → ADSR → Output | A note is a tone with a shape | `examples/instruments/bass/sine-sub-bass.skald.json` *(flat)* |
| 1 | A static filter | Subtraction is how you get timbre | `examples/instruments/brass/tuba-sound-chain.skald.json` |
| 2 | A second envelope → Mapper → cutoff | Brightness and loudness are different curves | `examples/instruments/brass/tuba-breath-bloom.skald.json` |
| 3 | A second oscillator through a Mixer | Layering by frequency role; gain staging | `examples/instruments/bass/bass-sequenced.skald.json` |
| 4 | A noise layer with its own short envelope | Transient and body are separate jobs | `examples/instruments/bass/picked-rock-bass.skald.json` |
| 5 | Unison + detune on the Instrument | Beating, phase coherence, width for free | `examples/instruments/leads/supersaw-hypersaw-lead.skald.json` |
| 6 | An LFO into pitch, plus glide | Vibrato and portamento as expression | `examples/instruments/bass/fretless-bass.skald.json` |
| 7 | Two modulators summed into one cutoff | Random + periodic = non-repeating motion | `examples/instruments/bass/wobble-samplehold-bass.skald.json` |
| 8 | An envelope-controlled VCA on a modulator | Time-varying modulation depth (FM index) | `examples/instruments/keys/fm-rhodes-electric-piano.skald.json` |
| 9 | Parallel distortion (`mix` 0.25) + tone | Harmonics without losing the attack | `examples/instruments/bass/house-pluck-bass.skald.json` |
| 10 | Parallel filters summed through a Mixer | Formants; series subtracts, parallel builds | `examples/instruments/winds/growly-sax.skald.json` |
| 11 | Delay → Reverb on the shared bus | Space, send routing, tails that outlive voices | `examples/instruments/guitar/ambient-clean.skald.json` |
| 12 | LFO → Panner → Output | Stereo motion, and why pan must be last | `examples/instruments/keys/glassy-fm-pluck.skald.json` |
| 13 | Three slow modulators, 12 voices, long envelopes | Evolution across bars, not notes | `examples/instruments/pads/evolving-motion-pad.skald.json` |

## Under the hood

Three pieces of generated Odin explain most of what this chapter claims.

**Unison** is a loop inside the oscillator, per voice. For copy `i` of `N`, the detune offset is spread linearly across ±`detune` cents and converted to a frequency ratio the standard way — 1200 cents to the octave:

```
detune_amount = (i/(N-1) - 0.5) * 2 * detune
detuned_freq  = base_freq * 2^(detune_amount / 1200)
```

then all `N` outputs are summed and divided by `N` (`skald-backend/core/codegen_nodes.odin::generate_oscillator_code`). The division is why unison never makes a patch louder — and why seven copies with zero detune are indistinguishable from one. Each copy keeps its own phase in a `[N]f32` array on the voice (`skald-backend/core/codegen_processor.odin::generate_processor_code`), zeroed only for a *fresh* voice, so a stolen voice retriggers mid-waveform without a click.

**Modulation** is textual: `get_f32_param` builds the string `(knob value) + (source A) + (source B)` and pastes it wherever the parameter is used (`skald-backend/core/param_utils.odin::get_f32_param`). Everything follows from that. Modulation is additive; it is relative to the knob; multiple wires sum; and because the expression is re-evaluated every sample, a modulator can be as fast as you like. Pitch is the exception, wrapped in `base × 2^(clamp(sum, −10, 10))` so it is exponential and cannot overflow into NaN (`skald-backend/core/codegen_nodes.odin::generate_oscillator_code`).

**Voice vs bus** is a graph colouring. Any Delay, Reverb or instrument Input is marked bus-domain, and the mark propagates downstream (`skald-backend/core/codegen_analysis.odin::seed_bus_domain`). Voice-domain outputs that a bus node consumes get a `_vsum` accumulator: the voice loop adds each voice's contribution, then the bus block runs once on the total (`skald-backend/core/codegen_processor.odin::generate_processor_code`). That is the mechanism that makes reverb a shared send rather than 8 private rooms — and it is also what makes a **parallel dry/wet mixer** work, because a Mixer fed by both a dry voice-domain signal and a wet reverb output is legal and lands in the bus block with the dry side already summed across voices.

The reverb itself is a real pre-delay stage — the dry signal read back out of its own ring buffer `preDelay` seconds later — feeding a fixed 75 ms comb tap whose feedback gain is solved so the tail loses 60 dB over `decay` seconds, hard-capped at 0.95 so it can never run away (`skald-backend/core/codegen_nodes.odin::generate_reverb_code`).

## Terms introduced

- **Layering** — building one perceived instrument out of several simple sources, each assigned a different frequency or time role.
- **Depth** — how many things are sounding at once.
- **Movement** — how much a sound changes over the life of a note and across bars.
- **Modulation destination** — a parameter that a signal can be wired to; in Skald, only where a node draws an input handle for it.
- **Additive modulation** — modulation summed onto the knob value rather than replacing it.
- **Exponential (V/Oct) modulation** — pitch modulation measured in octaves, where the signal is an exponent rather than a frequency offset.
- **Unison** — several detuned copies of the same oscillator inside one voice.
- **Detune** — the pitch spread of a unison stack, in cents (100 cents = one semitone).
- **Beating** — the periodic loudness pulse produced by two tones close in frequency; the pulse rate equals their difference.
- **Phase coherence** — copies of a signal aligned in time, which sum to a louder copy of the same shape rather than something new.
- **Transient** — the first few milliseconds of a sound: click, pick, breath, hammer.
- **Filter envelope** — a second envelope aimed at cutoff, controlling brightness over time independently of loudness.
- **Modulation depth / index** — how much a modulator affects its destination; time-varying depth is what makes FM sound like an instrument.
- **Velocity sensitivity** — how strongly note velocity scales an envelope.
- **Voice stealing** — cutting off a sounding note to free a voice for a new one.
- **Glide (portamento)** — continuous pitch travel from one note to the next.
- **Pre-delay** — the gap between the dry sound and the onset of reverb; it preserves clarity and implies distance.
- **Send / parallel routing** — processing a copy of a signal and blending it back, rather than processing the signal itself.
- **Parallel distortion** — blending a heavily shaped copy under the dry signal so harmonics are added without losing the transient.
- **Formant** — a fixed resonant peak in a spectrum, characteristic of a body or a vocal tract; built with parallel bandpass filters.
- **Mono compatibility** — whether a stereo sound survives being summed to one channel; the reason bass stays centred.
- **Mud** — excess accumulated energy around 200–500 Hz that makes a mix sound blanketed.
- **Gain staging** — deciding level at every point in the chain rather than fixing it at the end.
- **Headroom** — the space between typical level and the ceiling.
- **Voice domain / bus domain** — Skald's split between per-voice processing and shared once-per-sample processing after the voice sum.
- **Expose** — marking a parameter for runtime control, turning it into a processor field with a clamped setter and a `PARAMS` entry.

## Known issues

Defects that touch this chapter are tracked centrally in the **Known issues** chapter (`KNOWN-ISSUES.md`): KI-025, KI-045. KI-018 (`voiceStealing`, stored and read by nothing) closed with roadmap packet G5 — see "Resolved before 0.2". Deliberate design limits — things Skald does not do on purpose — are collected in **What Skald deliberately does not do**.
