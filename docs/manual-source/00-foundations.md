# Foundations: Signals, Voices and Signal Flow

> Everything in Skald is one number per node per sample; what makes a number "sound" or "control" is only where you plug it in, and this chapter teaches you to tell the difference by ear.

Read this chapter before any node chapter. Every other chapter in this manual assumes the mental model built here: what a signal is, what a *voice* is, why a synthesiser is shaped the way it is, and how a picture of boxes and wires on your screen turns into audio coming out of your speakers and Odin source code in your game.

You do not need to know any synthesis. You do need the app open.

---

## How to read this manual

**Have Skald running.** Every chapter has a **Try it** section that you perform in the running app, on a specific example patch that ships in the repository. Reading a chapter without doing its exercise gets you maybe a quarter of the value. The exercises are five to ten minutes each.

**Work the chapters in order.** They build, and the order is not the one an earlier edition of this manual used. *Getting started* gets the app open and something making sound in five minutes. This chapter, *Instrument* and *Sequencer* come next, before any node chapter — deliberately: every exercise in every chapter after them needs an Instrument to hold the patch and a transport to trigger notes from, and putting both ahead of the first source node means "wrap it in an Instrument" and "paint a step" are never explained from scratch in the middle of an unrelated lesson. *A first patch* (Oscillator, ADSR, Output, Filter) then builds one sound end to end; *Modulation* (Mapper, LFO, Sample & Hold, VCA) gives you movement; *More sources* (Noise, Mixer, Wavetable, FM Operator) widens the palette; *Shaping and space* (Distortion, Delay, Reverb, Panner) gives you tone and depth; *Playing from hardware* (MIDI Input) connects a keyboard; *Worked examples* puts all of it together at song scale; and *Reference* — *What Skald deliberately does not do*, *Exporting Odin*, *Known issues* — is what you come back to rather than read start to end.

**Every audio term is defined the first time it appears**, in plain language, and then made audible by something you do. Each chapter ends with a **Terms introduced** glossary. If a word in a later chapter is unfamiliar, it was defined in an earlier one — check that chapter's glossary.

**Where a chapter states a number** — a range, a default, a clamp — it cites the file and the name of the procedure, field or JSON key that produces it, for example `skald-backend/core/codegen_nodes.odin::generate_filter_code`: a repo-relative path, two colons, then a name you can search for in that file — searchable text, not a line number that drifts. Where the editor and the generated code disagree about what a number does, the manual records it once, in the **Known issues** chapter, under a stable id (`KI-nnn`); other chapters point at the entry instead of repeating the argument. Deliberate limits — things Skald does not do on purpose, and why — live in **What Skald deliberately does not do**. The code always wins, because the code is what you hear.

**Break things deliberately.** Every exercise contains at least one step that pushes a control past the useful zone. Failure modes are how you learn where the useful zone is.

---

## What it is

### A signal is just a number, over and over

Sound in the physical world is air pressure changing very fast. Your eardrum is a membrane that gets pushed and pulled by those changes, and your brain reads the pattern of pushes and pulls as sound. Louder means the pressure swings further from rest; higher-pitched means it swings back and forth more times per second.

A computer cannot store a continuous wiggle, so it stores snapshots — thousands of them per second. Each snapshot is a single number describing how far the pressure has swung from rest at that instant. The number of snapshots per second is the **sample rate**. Skald's generated engine takes the sample rate as a runtime argument (`skald-backend/core/codegen_processor.odin::generate_processor_code` — `sample_rate := p.sample_rate`), and in the editor's preview that is whatever your audio device runs at, almost always 48,000 or 44,100 snapshots per second.

Zero means "at rest, no pressure difference, silence". Positive means pushed one way, negative pulled the other. Skald's convention is that a healthy full-scale signal lives between **-1.0 and +1.0**, and the master output stage assumes exactly that (see *Gain staging*, below).

Here is the thing that unlocks node-graph tools. In Skald there is nothing structurally different about a number that carries sound and a number that carries a control instruction. When the code generator emits your patch, every node becomes exactly one local variable holding one number, declared as `node_<id>_out: f32 = 0.0` (`skald-backend/core/codegen_processor.odin::generate_processor_code`), and every wire becomes one variable being read by the next node's arithmetic. An oscillator's output and an envelope's output are the same *kind* of thing. What differs is what you do with the number.

The analogy that matters: a signal is a voltage on a wire in an old analogue modular synthesiser. You could patch that wire into a speaker and hear it, or patch it into a knob-substitute and have it turn the knob for you. Same wire. Same voltage. Different job. Skald keeps that property, and it is why the same LFO node can produce a wobble you feel *or* a buzz you hear, depending only on how fast you set it and where you plug it.

One more structural fact before anything else: **every one of those numbers is mono.** A node's `output` is a single value, not a left/right pair — Skald carries no per-node stereo anywhere in the graph. Stereo exists at exactly one place, the terminal **Panner** immediately before Output, which turns one mono signal into `output_left`/`output_right` by angle (`skald-backend/core/codegen_nodes.odin::generate_panner_code`). Anything else that reads a Panner's output — a Mixer, a VCA, a second effect — reads the plain mono signal the Panner also passes straight through, not a stereo downmix; only Output sees the stereo pair. That is why Skald has no per-channel pan on the Mixer and no way to place two sources independently except with one Panner each, right before the mix leaves the graph (see *What Skald deliberately does not do*).

### Audio rate and control rate

This is the single biggest stumbling block for anyone new to a modular-style tool, so it gets its own paragraph.

An **audio-rate signal** is one that changes fast enough for your ear to hear the changing itself as a tone. Human hearing runs roughly 20 Hz to 20,000 Hz ("Hz" = hertz = cycles per second). A signal swinging back and forth 440 times a second is the A above middle C. A **control-rate signal** (also called a **control voltage** or **CV**, from the analogue heritage) changes slowly — a few times per second, or once per note. You do not hear it. You hear its *effect* on something else.

The practitioner's rule of thumb, straight from the modular world: audio signals sit in the 20 Hz–20 kHz band; CV signals are generally below 20 Hz and exist to modulate audio signals or other CV signals; and the boundary is real, because once a modulator crosses about 20 Hz it stops being felt as movement and starts being heard as tone [Source: https://support.inmusicstore.com/en/support/solutions/articles/69000876117-synthesis-101-introduction-to-control-voltage-cv-]. The academic framing says the same thing from the other side: control voltage is voltage applied as a "variable force", used "sometimes at audio-rate, sometimes at sub-audio rate, and sometimes as a fixed single value" [Source: https://cmtext.com/synthesis/chapter4_synthesis_concepts2.php].

**Skald has no separate control rate.** This is important and slightly unusual. In many audio engines, control signals are computed once per block (every 64 or 128 samples) to save CPU. Skald does not do that. Look at the generated process function: there is one loop over voices, and inside it every node in the patch — oscillator, filter, LFO, envelope, mapper — emits code that runs once, for this one sample (`skald-backend/core/codegen_processor.odin::generate_processor_code`). An LFO is computed with the same per-sample phase accumulator as an oscillator; compare the LFO's phase step with the Oscillator's (`skald-backend/core/codegen_nodes.odin::generate_lfo_code` and `::generate_oscillator_code`) — they are the same maths.

The practical consequences:

- **Modulation is smooth.** There is no stair-stepping from block-rate control, so an LFO on pitch produces clean vibrato rather than a zipper noise.
- **You can drive control inputs at audio rate.** Wire an Oscillator's output into a Filter's cutoff input and you get frequency-domain sidebands, not a wobble. This is a legal, working patch. Whether it is a good idea is your problem.
- **"Control rate" in this manual is a description of intent, not of machinery.** When a chapter says "the LFO is a control-rate node", it means "this node is designed to be slow and to modulate other things", not "this node is computed less often".

The way to tell an audio signal from a control signal in Skald is therefore behavioural, and there are only three questions:

1. **How fast does it change?** Above ~20 Hz you hear it; below, you feel it.
2. **What range does it live in?** (See the next section.)
3. **Where is it plugged in?** A wire into a node's main `input` handle is audio. A wire into a handle named `input_<something>` — `input_freq`, `input_cutoff`, `input_gain`, `input_pan` — is modulation.

That third point is enforced structurally. The backend's connection validator keeps an explicit list of legal destination port names per node type, and every port that modulates a parameter is named `input_<param>` (`skald-backend/core/graph_validate.odin::valid_input_ports`). A wire into a port name that is not on the list is a hard error at generate time, not a silent no-op — the file's own top-of-file comment explains why, with a war story about a typoed `input_freq` that turned a laser sweep into a static 440 Hz tone with no warning (`skald-backend/core/graph_validate.odin::validate_connections`).

### Unipolar and bipolar, and why the Mapper has to exist

Signals fall into two families by the range they swing over.

A **bipolar** signal goes both sides of zero: it swings negative, crosses zero, swings positive. Skald's bipolar sources sit in **-1.0 to +1.0**. An LFO is bipolar (`skald-backend/core/codegen_nodes.odin::generate_lfo_code` — the sine branch is `math.sin(...) * amplitude`, and a sine spans -1 to +1). So is Sample & Hold, which the code deliberately re-centres: `next_float32(rng) * 2.0 - 1.0` turns a 0-to-1 random draw into a -1-to-+1 one (`skald-backend/core/codegen_nodes.odin::generate_sample_hold_code`). So is Noise, for the same reason — the raw PRNG draws a 0-to-1 value, and the same `* 2.0 - 1.0` re-centring keeps it from sitting as a constant offset on top of the waveform (`skald-backend/core/codegen_nodes.odin::generate_noise_code`).

A **unipolar** signal only goes one way, normally **0.0 to 1.0**. An envelope is unipolar: it rises from silence to a peak and falls back, and a negative amplitude has no meaning (`skald-backend/core/codegen_nodes.odin::generate_adsr_code` — every ADSR stage produces a value between 0 and 1).

That split is the industry standard, not a Skald invention: oscillators and LFOs are usually bipolar, envelope generators are almost always unipolar, and unipolar CVs suit destinations like pitch and filter cutoff where "less than nothing" is meaningless [Source: https://support.inmusicstore.com/en/support/solutions/articles/69000876117-synthesis-101-introduction-to-control-voltage-cv-]. Classic hardware puts bipolar CV at -5 V to +5 V and unipolar at 0 V to +5 V [Source: https://cmtext.com/synthesis/chapter4_synthesis_concepts2.php]; Skald normalises both to ±1 and 0–1 respectively.

**A DC offset** is what you get when a signal that should be centred on zero is not — the whole waveform sits shifted up or down. On an audio path it wastes headroom, can click, and on a bipolar-expecting destination it skews the modulation to one side. On a control path it is sometimes exactly what you want (an envelope *is* a deliberate DC offset that moves).

Now the punchline. Modulation sources speak in -1…+1 or 0…1. Destinations speak in real physical units. Look at what happens when you wire an LFO into a Filter's cutoff. The code generator does not scale anything; it literally adds the modulation to the parameter value (`skald-backend/core/param_utils.odin::get_f32_param` builds `(base) + (mod)`, and the filter reads that sum as its cutoff in `skald-backend/core/codegen_nodes.odin::generate_filter_code`). Your filter is sitting at 800 Hz. Your LFO swings ±1. Your cutoff now wobbles between **799 Hz and 801 Hz**. That is a fifth of one percent of one octave. You will hear nothing at all.

This is not a bug — it is the same arithmetic every modular synthesiser does, and it is why hardware invented the *attenuator* (scale a CV down) and the *offset* (shift it) as separate modules. Skald's equivalent is the **Mapper** node, which takes an input range and re-issues it as an output range (`skald-backend/core/codegen_nodes.odin::generate_mapper_code`). Its whole reason to exist is the paragraph you just read. When a later chapter tells you "put a Mapper between them", this is why.

One warning that will save you an hour: **not every destination is linear.** Filter cutoff is linear — the number you send is in hertz, added to the knob. Oscillator pitch is *exponential* — the number you send is in **octaves**, and the code raises 2 to that power: `base * math.pow(2.0, clamp(mod, -10, 10))` (`skald-backend/core/codegen_nodes.odin::generate_oscillator_code`). Send 1.0 to a cutoff and you moved it 1 Hz. Send 1.0 to a pitch input and you moved it a whole octave. That exponential convention is the software descendant of the hardware **volt-per-octave** standard, where one extra volt doubles the frequency so that equal voltage steps sound like equal musical intervals [Source: https://cmtext.com/synthesis/chapter4_synthesis_concepts2.php].

### Frequency, pitch, harmonics — the minimum you need

**Frequency** is how many times per second a waveform repeats, in hertz. **Pitch** is what your brain does with frequency: it perceives it *proportionally*, not additively. 110 Hz to 220 Hz sounds like the same musical distance as 220 Hz to 440 Hz, and as 440 Hz to 880 Hz — each is one **octave**, each is a doubling. This is why pitch controls are exponential everywhere in synthesis, and why the Oscillator's modulation input is a power of two rather than an addition.

An **octave** divides into 12 **semitones** in Western equal temperament, and each semitone into 100 **cents**. Skald's detune parameter is in cents (`schema/nodes.json::generic`, the `detune` row), and the oscillator converts cents to a frequency ratio with `math.pow(2.0, detune_amount / 1200.0)` (`skald-backend/core/codegen_nodes.odin::generate_oscillator_code`) — 1200 cents per octave.

Now **timbre** (pronounced "TAM-ber"): why a trumpet and a flute playing the same note sound different. Almost nothing in the physical world vibrates at one frequency only. A plucked string vibrates along its whole length, *and* in halves, *and* in thirds, all at once. Those extra modes produce frequencies at whole-number multiples of the lowest one. The lowest is the **fundamental** and it sets the pitch you hear; the multiples are **harmonics**, and their relative loudnesses are the timbre.

Sound On Sound's *Synth Secrets* puts the relationship precisely: the harmonics are "the permissible modes of vibration", the second harmonic sits an octave above the fundamental, the third a perfect fifth above that, and a waveform *is* its harmonic content — "the waveform defines the harmonics, and the harmonics determine the waveform" [Source: https://www.soundonsound.com/techniques/whats-sound]. For the sawtooth wave specifically, "every harmonic is present, and the amplitude of the nth harmonic is 1/n times that of the fundamental" — which is exactly why a sawtooth sounds bright and buzzy and why it is the default waveform on Skald's Oscillator (`skald-ui/src/definitions/node-definitions.ts::defaultOscillatorParams`).

Hold on to that, because it explains the whole architecture of the next section. If a bright sound is "a sound with lots of high harmonics", then you can build any duller sound by *starting* bright and *removing* harmonics with a filter. That approach is called **subtractive synthesis**, and it is what Skald's default node set is built for.

There is a ceiling. Because the computer only takes snapshots, it can only represent frequencies below **half the sample rate** — the **Nyquist frequency**, 24 kHz at a 48 kHz sample rate. Frequencies above it do not vanish; they fold back down and appear as unrelated, out-of-tune tones. That artefact is **aliasing**, and it is the reason several nodes carry clamps that stop you from pushing them somewhere ultrasonic (see the FM Operator's ratio clamp in `skald-backend/core/codegen_nodes.odin::generate_fm_operator_code`, whose earlier default the editor's own comment records as putting a carrier at ~190 kHz — `skald-ui/src/definitions/node-definitions.ts::defaultFmOperatorParams`).

### The canonical voice: source → filter → amplifier

Nearly every synthesiser ever built, hardware or software, is the same three boxes in a row.

1. A **source** that makes a continuous, harmonically rich, unchanging tone. Oscillator, noise generator, sampler, FM operator.
2. A **filter** that removes some of the harmonics, deciding how bright or dull the sound is.
3. An **amplifier** that decides how loud it is, moment to moment.

Sound On Sound's Synth Secrets series describes the same architecture — oscillator into filter into amplifier, in series — and explains why the third box is not optional: without an envelope-controlled amplifier at the end, a synthesiser "will produce sound continuously until it is switched off" [Source: https://www.soundonsound.com/techniques/introduction-vcas]. The oscillator has no concept of a note starting or stopping. It just runs. Something downstream has to open and close a gate, and that something is the amplifier — the **VCA**, voltage-controlled amplifier.

But an amplifier needs to be *told* what to do, and that instruction is a control signal: an **envelope**. The **ADSR** envelope — Attack, Decay, Sustain, Release — is the near-universal shape, and it is universal because it maps onto how real notes behave: attack is the note going from silence to full amplitude, decay is the fall from that initial peak, sustain is the steady level while the note is held, release is the fade after you let go. Line segments over those four parts emulate a huge number of real sounds, which is why the ADSR generator "has become a canonical tool of sound synthesis" [Source: https://wp.nyu.edu/computer_music/6-amplitude-envelopes-and-adsr/].

So the full picture is four boxes, two of them carrying control signals rather than sound:

```
   [ Oscillator ] --audio--> [ Filter ] --audio--> [ VCA ] --audio--> [ Output ]
                                 ^                    ^
                                 |                    |
                             control              control
                                 |                    |
                          [ Filter ADSR ]       [ Amp ADSR ]
```

The second envelope, the one on the filter, is what makes a synth sound like an instrument rather than a tone generator. Real instruments are *brightest at the start of a note* — the pick hitting the string, the hammer hitting the felt, the breath hitting the reed all inject a burst of high harmonics that dies away faster than the fundamental does. An envelope on the filter cutoff reproduces that: cutoff opens fast on the attack, closes over the decay. That short bright burst is the **transient**, and it is the single most important cue your ear uses to identify an instrument.

**Skald's twist on this shape, which you must know before your first patch:** Skald's ADSR node is *both* the envelope generator and a VCA in one box. Its generated code takes whatever is wired into its `input` port and multiplies it by the envelope — `node_out = (input) * envelope * (depth) * vel_scale` — where `input` defaults to the literal `1.0` when nothing is connected (`skald-backend/core/codegen_nodes.odin::generate_adsr_code`). So:

- Wire **audio into** the ADSR and take audio out: the ADSR *is* your VCA. This is the common Skald idiom and it is what most of the shipped examples do.
- Wire **nothing into** the ADSR: the input is 1.0, so the output is the bare envelope, 0 to 1. Now it is a pure control source you can send to a filter cutoff (through a Mapper) or to a separate VCA node's gain input.

The node named **VCA** in the sidebar (internally `gain`, `skald-ui/src/definitions/node-definitions.ts::defaultGainParams`) is the pure multiplier with no envelope in it — `node_out = (input) * (gain)` (`skald-backend/core/codegen_nodes.odin::generate_gain_code`).

---

## What it looks like in Skald

### The five surfaces you will use

**The sidebar** runs down the left edge (`skald-ui/src/components/Sidebar.tsx::Sidebar`). Top to bottom: a **BPM** box that sets the project tempo shared by the preview engine, the sequencer and the exported code; a **Generation** section with the package name and output path plus the **Download Code** button; **Graph Actions** — Play, Stop, Loop, Save, Load, Import Patch; **Grouping** — Create Instrument, Create Group, Explode Instrument; and finally the **Nodes** palette you drag from, whose seventeen entries are listed with one-line tooltips (`skald-ui/src/components/Sidebar.tsx::paletteNodes`).

**The canvas** is the node graph. Nodes are colour-coded by role, and the colours are a real system worth learning: orange for sources, purple for modulators, green for envelopes, blue for filters, teal for time and space effects, red for drive, grey/lilac/cyan/pale-yellow for utilities, indigo for structure, burnt orange for the destination (`skald-ui/src/components/Nodes/NodeStyles.ts::NODE_ACCENTS`). Handles are dots on the node edges: inputs on the left, outputs on the right (`skald-ui/src/components/Nodes/ParamNode.tsx::makeParamNode`).

**The parameter panel** appears on the right when you select a node. It carries the full-fidelity controls — sliders paired with typed number boxes, the ADSR envelope graph, the Filter's XY pad (`skald-ui/src/components/NodeParameterControls.tsx::NodeParameterControls`). The small boxes drawn on the node itself are quick-edit duplicates; the panel is authoritative and is the only place the **expose** toggle lives.

**The sequencer dock** at the bottom holds one track per Instrument, a step grid, and the master volume slider (`skald-ui/src/components/Sequencer/SequencerDock.tsx::SequencerDock`).

**The code preview panel** shows the actual Odin the generator produced (`skald-ui/src/components/CodePreviewPanel.tsx`).

### Which outputs are audio, and which are control

Nothing in the code marks a port as "audio" or "control" — but the *node types* have clear intent, and their handle names tell you. This table is the map. Handle ids come from the node components; the legality of each destination comes from the validator.

| Node | Output handles | Normal range | Intended as | Modulation inputs it accepts |
|---|---|---|---|---|
| Oscillator | `output` | ±1 × amplitude | Audio | `input_freq` (octaves, exponential), `input_amp`, `input_pulseWidth` — `skald-ui/src/components/Nodes/OscillatorNode.tsx::OscillatorNode` |
| Noise | `output` | ±1 × amplitude | Audio | `input_amp` — `skald-ui/src/components/Nodes/NoiseNode.tsx::NoiseNode` |
| Wavetable | `output` | ±1 × amplitude | Audio | `input_freq`, `input_pos`, `input_amp` — `skald-ui/src/components/Nodes/WavetableNode.tsx::WavetableNode` |
| FM Operator | `output` | ±1 | Audio | `input_mod`, `input_carrier` — `skald-ui/src/components/Nodes/FMOperatorNode.tsx::FmOperatorNode` |
| LFO | `output` | ±1 × amplitude (bipolar) | **Control** | none — source only (`skald-backend/core/graph_validate.odin::valid_input_ports`) |
| Sample & Hold | `output` | ±1 × amplitude (bipolar) | **Control** | none — source only |
| ADSR | `output` | 0…1 × input (unipolar) | **Both** — envelope alone, or audio × envelope | `input` (audio), `input_attack`, `input_decay`, `input_sustain`, `input_release` — `skald-backend/core/graph_validate.odin::ADSR_INPUTS` |
| MIDI Input | `pitch`, `gate`, `velocity` | pitch = octaves from A4; gate = 0/1; velocity = 0…1 | **Control** | none — `skald-backend/core/graph_validate.odin::valid_output_port`, `skald-backend/core/codegen_nodes.odin::generate_midi_input_code` |
| Filter | `output` | audio in, audio out | Audio | `input_cutoff` (Hz, linear), `input_res` |
| Mapper | `output` | whatever you declare | **Control** (usually) | `input` only — no modulatable range |
| VCA (Gain) | `output` | input × gain | Audio | `input_gain` |
| Panner | `output`, `output_left`, `output_right` | ±1 | Audio | `input_pan` |
| Mixer | `output` | sum of inputs × levels | Audio | `input_1`…`input_N` (audio, not modulation) |
| Delay / Reverb / Distortion | `output` | audio | Audio | none — `input` only (`skald-backend/core/graph_validate.odin::THROUGH_INPUTS`) |
| Output | — (terminal) | — | destination | `input` |

Two things to notice. First, LFO, Sample & Hold and MIDI Input have **no input handles at all** — they are pure sources, and the validator says so explicitly (`skald-backend/core/graph_validate.odin::valid_input_ports`). Second, **Delay and Reverb have no modulation inputs**, so you cannot wire an LFO into a delay time; the validator rejects that wire as an unknown input port for the node type, the same hard codegen error every illegal connection gets (`skald-backend/core/graph_validate.odin::validate_connections`).

### Legal connections, and what happens when you get it wrong

Skald refuses to generate a patch that would be silently wrong. The validator runs over every connection before any code is emitted and exits with an explanatory error for four distinct mistakes (`skald-backend/core/graph_validate.odin::validate_connections`):

- a wire from or to a node id that does not exist;
- a wire out of a port that node does not have (only `output` is universal; MIDI Input adds `pitch`/`gate`/`velocity`, Panner adds `output_left`/`output_right` — `skald-backend/core/graph_validate.odin::valid_output_port`);
- a wire into a port name that is not on the node type's allow-list;
- a wire into a Mixer channel above its configured `inputCount`.

Older saved files that use friendlier port names still work: the JSON loader maps `frequency`→`input_freq`, `cutoff`→`input_cutoff`, `resonance`→`input_res`, `gain`→`input_gain`, `pan`→`input_pan`, `position`→`input_pos`, `modIndex`→`input_mod` before validation (`skald-backend/core/json.odin::normalize_port`).

**Multiple wires into one port are summed, not fought over.** Two LFOs into one `input_cutoff` give you their sum; two oscillators into one Filter `input` give you a mix. The helper that does it is `sum_port_inputs`, and its neighbour `get_f32_param` carries the same rule for the destinations it serves (`skald-backend/core/param_utils.odin::sum_port_inputs`, `::get_f32_param`).

**Feedback loops are rejected outright.** The graph must be a DAG — a directed acyclic graph, no wire path that leads back to where it started — and the topological sort (`skald-backend/core/graph_utils.odin::topological_sort`) detects a cycle by simply never adding the looping nodes to its sorted output. Codegen treats that the same as any other structural defect: `validate_no_cycle` (`skald-backend/core/graph_validate.odin::validate_no_cycle`) prints "Error: instrument … contains a feedback loop" naming every node in or behind the cycle, then exits 1 before a single line of the asset is written (KI-055 — before this was fixed, generation carried on past a commented-out `os.exit(1)` and silently dropped the cyclic nodes, and everything downstream, from the emitted asset while still exiting 0). If you want feedback, you use the Delay node, which has an internal feedback path (`skald-backend/core/codegen_nodes.odin::generate_delay_code`); you cannot build feedback out of wires.

### Two domains: voice and bus

This is Skald-specific and it will otherwise confuse you the first time you add a reverb.

A **voice** is one note being played. If your Instrument has 8 voices (the default — `schema/nodes.json::generic`, the `voiceCount` row) you can hold 8 notes at once, and the engine runs the whole voice graph eight times per sample — once per active voice — then adds the results together (`skald-backend/core/codegen_processor.odin::generate_processor_code`). Each voice has its own oscillator phase, its own envelope stage, its own filter state.

That model works for oscillators and envelopes, and breaks for echoes. A delay line holds a shared buffer of the recent past; there is no per-voice "recent past" — running one per voice would divide the delay time by however many voices are held, feed each voice's echoes into every other voice's feedback, and cut the tail dead the instant the last voice released. So Skald splits the graph into two **domains**:

- The **voice domain** runs inside the per-voice loop. Its state lives on the voice (`voice.filter_<id>_low`, and so on — the `"voice."` state prefix in `skald-backend/core/codegen_processor.odin::generate_processor_code`).
- The **bus domain** runs once per sample, after all voices are summed. Delay, Reverb and any instrument-level audio input seed it, and *everything downstream of them* joins it automatically (`skald-backend/core/codegen_analysis.odin::seed_bus_domain`, `::compute_bus_domain`). Its state lives on the processor (the `"p."` prefix, same proc as above).

**The rule you must remember:** Oscillator, ADSR, FM Operator, Wavetable and MIDI Input are **voice-coupled** — they read per-voice state and *cannot* run in the bus domain (`skald-backend/core/codegen_analysis.odin::is_voice_coupled_type`). Put one downstream of a Delay or Reverb and codegen refuses with an explicit error telling you to move it (`skald-backend/core/codegen_analysis.odin::compute_bus_domain`). Filters, VCAs, Distortion, Mixers, Mappers, Panners, LFOs and Sample & Hold are happy in either domain: `generate_processor_code`'s node-emission switch lists each of them once for the voice pass and once for the bus pass, generated with whichever state prefix that pass uses (`skald-backend/core/codegen_processor.odin::generate_processor_code`).

### How the pieces fit: graph → Instrument → sequencer → preview → Odin

```
   node graph on canvas
        |
        |  Create Instrument  (Sidebar.tsx:212-219)
        v
   Instrument node  ──── holds the nodes as a subgraph, adds voices/unison/glide
        |
        |  sequencer track targets the Instrument by id
        v
   buildProjectData()  (projectSerializer.ts:90-211)  →  project JSON
        |
        +--→ Play:  main process runs codegen + odin build → wasm bytes → AudioWorklet
        |            (useWasmAudioEngine.ts:1-14, 91-105)
        |
        +--→ Generate Code: skald_codegen.exe → .odin source file on disk
                     (README.md:66)
```

Four things about this pipeline change how you work:

**An Instrument is the unit that plays, but a bare canvas is not silence.** If the whole canvas has no Instrument node on it at all, Skald auto-wraps the entire graph into one SFX asset named `Asset` for both the preview and Generate Code, and tells you so on load or play (`skald-ui/src/utils/projectSerializer.ts::buildProjectData`, `skald-ui/src/hooks/nodeEditor/useFileIO.ts::applySaveData`). If the canvas already has at least one Instrument somewhere on it, any other nodes sitting outside it are simply ignored (`skald-ui/src/utils/projectSerializer.ts::getInstrumentNodes`). Only a *completely empty* canvas — no nodes at all — refuses to play, with "No instruments on the canvas. Wrap nodes in an Instrument before playing." (`skald-ui/src/hooks/nodeEditor/useWasmAudioEngine.ts::buildModule`). None of this is a reason to skip wrapping: an explicit Instrument is what gives a patch polyphony, a name and an export identity, which the auto-wrap gives you none of. See *Getting started*, "The one rule", for the full behaviour.

**The preview is the export.** The Play button does not run a hand-written Web Audio imitation of your patch. It runs codegen for real, compiles the resulting Odin to WebAssembly, and plays that inside an AudioWorklet (`skald-ui/src/hooks/nodeEditor/useWasmAudioEngine.ts::useWasmAudioEngine`). Both the preview and the Generate Code button are fed byte-identical project descriptions by the same serializer (`skald-ui/src/utils/projectSerializer.ts::buildProjectData`). What you hear is what ships.

**Some edits are instant, some rebuild.** Changing an **exposed** parameter's value while playing applies immediately through the generated `set_param` entry point, with no recompile and no audio dropout. Changing anything else — a waveform, a wire, a filter type — triggers a debounced 250 ms recompile-and-hot-swap (`skald-ui/src/hooks/nodeEditor/useWasmAudioEngine.ts::useWasmAudioEngine`). The decision is made by comparing a "topology signature" that deliberately masks exposed-parameter values (`skald-ui/src/utils/projectSerializer.ts::topologySignature`, `::canApplyParamLive`).

**Notes come from four places.** The sequencer's step grid; a connected MIDI keyboard (`skald-ui/src/hooks/nodeEditor/useWasmAudioEngine.ts::useWasmAudioEngine`); the computer keyboard, where `A` to `K` is a chromatic octave from middle C and `Z` / `X` move it (`skald-ui/src/hooks/useQwertyKeyboard.ts::useQwertyKeyboard`); or the **Test Audio** button on the Output node's parameter panel, which fires middle C at full velocity for 0.2 seconds on every asset (`skald-ui/src/components/ParameterPanel.tsx::ParameterPanel`, `skald-ui/src/hooks/nodeEditor/useWasmAudioEngine.ts::useWasmAudioEngine`). The last two are how you audition a patch that has no sequencer notes; the letter keys, unlike Test Audio, sustain for as long as you hold them, which is what you want while dragging a filter cutoff. All four go through the same door into the preview engine, so a note held across a graph edit survives the rebuild (`skald-ui/src/hooks/nodeEditor/useWasmAudioEngine.ts::useWasmAudioEngine`).

---

## The controls

The per-node parameters get their own chapters. The controls that belong *here* are the ones that govern the whole patch — the container settings every node chapter assumes you have already met. They live on the **Instrument** node's parameter panel and in the sidebar.

| Parameter | Range | Default | Unit | What it does to the sound |
|---|---|---|---|---|
| `bpm` (sidebar) | 20 – 999 | 120 | bpm | Project tempo. Drives the sequencer clock and every BPM-synced Delay/LFO/S&H. `schema/nodes.json::generic` |
| `voiceCount` | 1 – 32 | 8 | voices | How many notes can sound simultaneously, on every surface (`schema/nodes.json::generic`, `skald-ui/src/definitions/node-definitions.ts::defaultInstrumentParams`, `skald-ui/src/components/NodeParameterControls.tsx::NodeParameterControls`) |
| `unison` | 1 – 16 | 1 | copies | How many detuned copies of each oscillator play per voice. `schema/nodes.json::generic` |
| `detune` | 0 – 100 | 5 | cents | How far apart the unison copies are spread in pitch. `schema/nodes.json::generic` |
| `glide` | 0 – 5 | 0.05 | s | How long a stolen voice takes to slide from the old pitch to the new one. `schema/nodes.json::generic` |
| `volume` (Instrument) | 0 – 1 (editor), floored at 0.001 | 1.0 | × | Level of this whole asset before it hits the project mix. `skald-ui/src/definitions/node-definitions.ts::defaultInstrumentParams`, `skald-ui/src/utils/projectSerializer.ts::buildProjectData` |
| Master volume (dock) | 0 – 1 | 0.8 | × | Multiplies the summed project before the master limiter, applied identically in preview and export: the dock's fader drives the generated `skald_set_master_volume` inside the wasm DSP itself, not a separate post-worklet gain stage (`skald-ui/src/hooks/nodeEditor/useWasmAudioEngine.ts::useWasmAudioEngine`, `skald-backend/core/codegen_project.odin::generate_wasm_shim_code`) |
| `gain` (VCA node) | 0 – 4 | 0.75 | × | Straight multiplier on a signal. `schema/nodes.json::overrides` (the `Gain`/`gain` row), `skald-ui/src/definitions/node-definitions.ts::defaultGainParams` |

### What you hear as you sweep them

**voiceCount.** At **1**, the instrument is monophonic: play a second note while the first is held and the first note's oscillator jumps to the new pitch (this is where `glide` becomes audible). Chords are impossible. At **8**, the default, you can hold a comfortable chord and still have voices free for the tails of released notes — remember that a note with a 2-second release is still occupying its voice for those 2 seconds. At **32** and above you will hear something you might not expect: **it gets louder**. Every active voice adds its output to the same accumulator (`skald-backend/core/codegen_nodes.odin::generate_graph_output_adds`), with no division by voice count. Eight voices of a default-amplitude oscillator peak around 4.0, four times full scale. Read the gain-staging section before you go there.

**unison and detune.** With `unison` at 1 the detune knob does nothing. Push unison to **4–7** and detune to **10–25 cents** and a single sawtooth turns into the fat, shimmering wall that people call a supersaw. The mechanism is **beating**: two tones a few cents apart drift in and out of phase, and their sum swells and thins at the difference frequency. Push detune past **50 cents** (a quarter tone) and it stops sounding fat and starts sounding out of tune. Note that unison does *not* make it louder — the code averages the copies, `unison_out / unison_count` (`skald-backend/core/codegen_nodes.odin::generate_oscillator_code`) — which is a considerate piece of gain staging you should be grateful for.

**glide.** At **0** notes snap to pitch. At **0.05 s** (the default) you get a barely-perceptible smear that glues fast lines together. At **0.2–0.4 s** you get the classic portamento slide of a TB-303 bassline. Above **1 s** notes never arrive before the next one starts. Note the important restriction in the code: glide only engages when a voice is *stolen*, so fresh notes on a free voice start exactly on pitch (`skald-backend/core/codegen_processor.odin::generate_processor_code`, the `_note_on` proc). On an 8-voice instrument you will rarely hear it; drop `voiceCount` to 1 and it happens on every note.

**Instrument volume.** This multiplies the asset's stereo pair at the very end of its own `_process`, before that instrument's output is summed into the project mix (`skald-backend/core/codegen_processor.odin::generate_processor_code`). Use it to balance a hot drum kit against a quiet pad instead of relying on the project's master limiter to do the balancing for you — see *What Skald deliberately does not do* for what "volume at the return" does and does not give you, including the per-instrument `limit` flag this same return point is gated on.

### What "expose" does, and when to use it

Next to most parameters in the right-hand panel there is a small chain-link icon (`skald-ui/src/components/ParameterPanel.tsx::LinkIcon`). Clicking it toggles **exposure**: the parameter's name goes into that node's `exposedParameters` list (`skald-ui/src/components/ParameterPanel.tsx::ParameterPanel`, `skald-ui/src/definitions/types.ts::BaseNodeParams`), and the icon turns blue.

Exposing a parameter changes what the generator emits for it. An un-exposed parameter is **baked in as a constant** — the code generator writes the literal number straight into the DSP expression. An exposed parameter becomes a **field on the processor struct**, and the generated code reads `p.<field>` instead of a literal — both decided in the one place that resolves every parameter reference (`skald-backend/core/param_utils.odin::get_f32_param`). Alongside it you get three things for free:

1. **A typed setter** with the range clamp compiled in: `<Asset>_set_<field>(p, value)`, which clips the incoming value to the min and max from the range table before storing it (`skald-backend/core/codegen_processor.odin::generate_processor_code`).
2. **An entry in a public introspection table**, `<Asset>_PARAMS`, listing name, min, max, default and unit — so a game's debug overlay or save system can enumerate what is tweakable without you hard-coding a list (same proc).
3. **A string-keyed setter**, `<Asset>_set_param(p, name, value)`, reachable both by field name and by a `"<nodeId>::<param>"` alias (same proc, and `skald-backend/core/codegen_project.odin::emit_exposed_param_contract` for where the alias is documented in the file's header).

Those ranges are authored once, in `schema/nodes.json`, and rendered into both `skald-backend/core/param_ranges.generated.odin` (what the typed setters clamp to) and the editor's own copy — never hand-edit either generated file. The schema's `overrides` section is worth your attention: it holds node-type-specific rows that exist because the generic name-keyed table is wrong for certain nodes. An exposed FM Operator `frequency` is a ratio, not hertz, so it gets `[0.01, 32]` instead of `[20, 20000]`; an exposed LFO `frequency` gets `[0.01, 100]` Hz so it is not clamped into the audio range (`schema/nodes.json::overrides`). Each row's `why` field is the best short history of Skald's parameter semantics available.

**Why you would expose something.** Two reasons.

*For your game at runtime.* A door-creak SFX whose pitch varies with door speed; an engine loop whose filter cutoff tracks RPM; a music layer whose reverb mix rises as the player enters a cavern. Expose the parameter, call the typed setter from gameplay code, done. Anything not exposed is frozen at generate time.

*For yourself, while designing.* Because exposed parameters apply live without a recompile, dragging an exposed slider during playback is instant and continuous, whereas dragging a non-exposed one queues a 250 ms rebuild and hot-swap (`skald-ui/src/utils/projectSerializer.ts::topologySignature`, and the tests in `skald-ui/src/tests/codegen/ProjectSerializer.test.ts`). Exposing the two or three parameters you are actively tuning makes the app feel like a synthesiser instead of a compiler.

The cost is small but real: an exposed parameter can no longer be constant-folded by the Odin compiler, and it becomes part of your asset's public API, which you then have to keep stable. Expose deliberately, not by default. Skald's own defaults expose a sensible handful per node (see any `exposedParameters` array in `skald-ui/src/definitions/node-definitions.ts::NODE_DEFINITIONS`).

---

## Try it (hands-on)

**What you will hear:** a raw sawtooth turning into a musical note; a filter removing harmonics; the same envelope in two different places producing two different instruments; a modulation wire that does absolutely nothing until you scale it; and a filter that screams.

**Starting file:** `examples/instruments/leads/saw-lead.skald.json`. Verified contents: four nodes — `osc_1` (Oscillator, waveform Sawtooth, frequency 220), `adsr_1` (ADSR, attack 0.05, decay 0.3, sustain 0.7, release 0.4), `filter_1` (Filter, Lowpass, cutoff 800, resonance 0.4), `output_1` (Output) — wired `osc_1 → adsr_1 → filter_1 → output_1`.

---

**1. Load it.** Sidebar → **Open File...**, and pick `examples/instruments/leads/saw-lead.skald.json`. Load replaces your canvas entirely (`skald-ui/src/hooks/nodeEditor/useFileIO.ts::applySaveData`), so save anything you care about first. You should see four cards left to right: orange Oscillator, green ADSR, blue Filter, burnt-orange Output.

Look at the wiring order and hold the question in your head: the envelope is **before** the filter here, not after. We will come back to that.

**2. Wrap it in an Instrument.** Rubber-band-select all four nodes, then Sidebar → **Create Instrument**, and name it `Lead`. The four nodes collapse into one indigo card.

*Why:* four loose nodes with no Instrument would still auto-wrap into one playable `Asset` (see "How the pieces fit", above), but with none of what an Instrument gives you — no name, no chosen polyphony, no export identity. This step is not busywork; it is the moment your graph becomes a shippable asset with voices, unison and a name of your choosing (`skald-ui/src/utils/projectSerializer.ts::buildProjectData`).

**3. Play it.** Sidebar → **Play**. There will be silence — correct, because nothing has triggered a note yet. Select the Instrument, scroll the parameter panel to the **Output** sub-node, and click **Test Audio**. You should hear a short, bright, buzzy note at middle C.

*What you just heard:* a sawtooth wave containing every harmonic, with the nth harmonic at 1/n of the fundamental's amplitude [Source: https://www.soundonsound.com/techniques/whats-sound], shaped by a 50 ms attack and gently rolled off by a lowpass filter at 800 Hz. Click **Test Audio** a few times to get it in your ear.

**4. Confirm that the oscillator's frequency box is a lie.** In the parameter panel, find the Oscillator sub-node. There is no frequency slider — only a **Fixed Pitch (ignore note)** checkbox (`skald-ui/src/components/NodeParameterControls.tsx::NodeParameterControls`). The saved file says `"frequency": 220` but you cannot see it and it does nothing, because pitch follows the played note by default (`skald-backend/core/codegen_nodes.odin::generate_oscillator_code`). Tick **Fixed Pitch**: the frequency slider appears and now the note *is* 220 Hz regardless of what you play. Untick it again.

That box is not only invisible while Fixed Pitch is off — it stops existing in the export. If you expose `frequency` on an Oscillator or Wavetable with Fixed Pitch off, the generator omits the setter and the `_PARAMS` row for it entirely rather than minting a control nothing reads (`skald-backend/core/codegen_analysis.odin::param_is_reachable`). The stored JSON still carries the number either way; only the exported API stops lying about it.

*Why this matters:* it is the difference between an instrument and a drone. Nearly every beginner's first "why won't my melody play" is this checkbox.

**5. Hear the harmonics arrive and leave.** Set the Oscillator's **Waveform** to **Sine**, click **Test Audio**. Pure, hollow, flute-like — a sine is the *only* waveform with no harmonics at all, just the fundamental. Now **Triangle**: slightly reedier. **Square**: hollow and woody. Back to **Sawtooth**: the brightest of the four.

Nothing about the pitch changed. Everything about the **timbre** did, and the only difference is which harmonics are present.

**6. Sweep the filter and hear subtractive synthesis work.** Leave it on Sawtooth. Select the Filter sub-node; it has an XY pad (cutoff on X, resonance on Y) plus exact number boxes (`skald-ui/src/components/NodeParameterControls.tsx::NodeParameterControls`). Click **Test Audio** repeatedly while you drag cutoff:

- **200 Hz** — dull, muffled, most of the buzz gone. The high harmonics have been removed.
- **800 Hz** (the file's value) — a balanced lead tone.
- **3000 Hz** — bright and aggressive, nearly all the sawtooth's harmonics through.
- **8000 Hz and above** — and now nothing more happens, no matter how far right you drag.

That last one is not your ears failing. The generated filter clamps its cutoff to `sample_rate * 0.16` for stability (`skald-backend/core/codegen_nodes.odin::generate_filter_code`) — about **7,680 Hz** at a 48 kHz sample rate — even though the slider, the node card and the exported range all still advertise up to 20,000 Hz (KI-037 in **Known issues**).

**7. Move the envelope and build a different instrument.** Currently the ADSR multiplies the *raw oscillator*, and the filter then processes the enveloped signal. Select the Instrument, use **Explode Instrument** to get the nodes back on canvas, then rewire to `osc_1 → filter_1 → adsr_1 → output_1` (delete the three edges, draw three new ones), re-select all four, **Create Instrument** again, **Play**, **Test Audio**.

On this patch the difference is subtle — a lowpass at a fixed cutoff is roughly linear, so the order barely matters. Now make it matter: set the Filter's **resonance** to **12** and cutoff to **300**. Listen with the ADSR *after* the filter (the standard order) and then flip it back to *before*. With the envelope last, the resonant ring is shaped by the envelope and the note ends cleanly. With the envelope first, the filter is still ringing on its own after the envelope has closed, and the note has a soft ghost tail.

*The lesson:* a filter has memory (state — `filter_<id>_low`/`filter_<id>_band` — that persists between samples, `skald-backend/core/codegen_nodes.odin::generate_filter_code`); an envelope multiply does not. Anything with memory placed after your amplitude control can outlive the note.

**8. Wire a modulation source and discover it does nothing.** Explode the instrument again. Drag an **LFO** from the palette. Wire its `Out` to the Filter's **Cut** handle (`input_cutoff`). Leave the LFO at its defaults — Sine, 5 Hz, amplitude 1. Rebuild the Instrument, Play, Test Audio while holding your ear out for a wobble.

There is no wobble. There is no *anything*. Your LFO swings ±1, so a cutoff of 300 Hz is now wobbling between 299 and 301 Hz, five times a second (`skald-backend/core/param_utils.odin::get_f32_param`).

**9. Fix it with a Mapper, and hear why the node exists.** Explode again. Drag a **Mapper** onto the canvas. Rewire: LFO `Out` → Mapper `In`, Mapper `Out` → Filter `Cut`. Select the Mapper and set **In Min = -1**, **In Max = 1**, **Out Min = -600**, **Out Max = 600**. Rebuild, Play, hold down a step in the sequencer or hammer Test Audio.

Now you have a wobble: the cutoff sweeps ±600 Hz around 300 Hz, five times a second. Drop the LFO rate to **0.3 Hz** for a slow filter breath; push it to **8 Hz** for the classic dubstep growl. Push it to **60 Hz** and the wobble stops being a wobble and becomes a buzzy metallic edge on the tone — you have crossed the audio-rate boundary and the "modulation" is now generating sidebands you hear as timbre.

**10. Break it: heavy resonance, not self-oscillation.** Set the Filter's **resonance** to **20** (the XY pad's ceiling — `skald-ui/src/components/NodeParameterControls.tsx::NodeParameterControls`, `schema/nodes.json::generic`) and the Mapper's output range to **-2000 / +2000**. Play. The filter now rings hard enough at its cutoff to sound like a whistling, almost self-contained tone that sweeps with the LFO, far louder and more resonant than at moderate settings. Turn your monitors down before you do this.

*What you are hearing, and what you are not:* resonance is feedback around the filter's own frequency, and pushed far enough that feedback can in principle sustain itself with no input at all — true self-oscillation. Skald's filter does not reach that: the internal damping term is clamped to `[0.05, 1.9 - f]` (`skald-backend/core/codegen_nodes.odin::generate_filter_code`), and resonance 20 already pins that clamp at its floor of 0.05 — the most resonant setting the filter can reach, one clamp step short of the zero damping true self-oscillation needs. Push resonance further and nothing changes; the filter still needs a signal to ring. This is a deliberate stability limit, not a bug — see *What Skald deliberately does not do* for why Skald does not oversample or switch topology to allow it.

**11. Break it: gain staging.** Set resonance back to **2**. Select the Instrument and set **Voice Count** to **32**. In the sequencer, place a dense chord — six or eight notes on the same step — and loop it. Listen as the notes stack up.

Past about four simultaneous voices the sound stops getting louder and starts getting *squashed and dull*: the transients flatten, the attack loses its snap, and everything sounds like it is behind a blanket. That is the soft limiter doing its job — every asset's `_process` ends by passing its (volume-scaled) output through `skald_soft_limit`, a plain `math.tanh` (`skald-backend/core/codegen_project.odin::emit_soft_limit_proc`), and the project mix is passed through the same function again after the master fader. Now bring the **Instrument volume** down to about **0.3** and listen again: the same chord, quieter but *clear*, with the transients back.

*The lesson, in one sentence:* nothing inside your patch clips, everything sums, and the only place the excess goes is into the master limiter squashing your dynamics.

---

## Why you patch it this way

**Source first, filter second, amplitude last.** Put a filter after the amplitude control and its resonance rings on after the note ends (you heard this in step 7). Put a distortion before the amplitude control and the note's decay gets progressively cleaner as it falls below the drive threshold — sometimes lovely, usually not what you meant. The classic order exists because it matches the physics: an instrument's body filters what the excitation produces, and then the whole thing gets quieter over time.

**Modulation goes into `input_<param>` ports, audio goes into `input`.** Skald will let you wire either into either as long as the port exists, and both are legal code. The distinction lives entirely in your head and in the port names. If you find yourself surprised by what a wire does, check which handle you dropped it on.

**Almost every modulation wire wants a Mapper.** Unless the destination already lives in the -1…+1 or 0…1 range — a VCA's `input_gain`, a Panner's `input_pan`, an Oscillator's `input_amp` — the raw modulator will not move it perceptibly. Cutoff (hertz), delay time (seconds), FM ratio: all need scaling. The exception is Oscillator and Wavetable `input_freq`, which reads its input as **octaves**, so ±1 raw from an LFO is a two-octave vibrato — usually far too much and needing a Mapper to shrink it to about ±0.02 (roughly a quarter-tone).

**Series versus parallel.** *Series* is a chain: each node processes what the last one produced. Use it when you want cumulative shaping (oscillator → filter → distortion → VCA). *Parallel* is two or more branches from the same source, recombined in a Mixer or at the Output. Use it when you want to treat parts of a sound independently — a clean low branch and a distorted high branch, or a dry signal beside a reverb send. Both branches sum at the join, which means **parallel doubles your level** unless you pull the Mixer channel levels down. It also means **phase matters**: two copies of the same signal, one delayed, will cancel at some frequencies and reinforce at others (comb filtering); two copies with opposite polarity cancel completely.

**Feedback is a Delay, not a wire.** The graph is meant to be a DAG, and building one out of ordinary wires is not supported (see "Legal connections", above, for the current gap between "meant to" and "does"). If you want a signal to feed back into itself, the Delay node's internal feedback path is the supported route (`skald-backend/core/codegen_nodes.odin::generate_delay_code`), clamped to 0.0–0.95 so it decays rather than diverging.

**Bus effects go last, and they take everything after them with them.** The moment you insert a Delay or Reverb, every node downstream of it leaves the voice domain (`skald-backend/core/codegen_analysis.odin::seed_bus_domain`, `::compute_bus_domain`). Put a Filter after a Reverb and it becomes one shared filter for the whole instrument rather than one per note. That is usually what you want for a tone-shaping filter on the tail; it is definitely *not* what you want for a per-note filter sweep, and if you try to put an ADSR back there codegen will stop you with a message telling you to move it (`skald-backend/core/codegen_analysis.odin::compute_bus_domain`).

**Order of evaluation is decided for you.** You do not schedule anything. The generator topologically sorts the graph so every node is computed after its inputs (`skald-backend/core/graph_utils.odin::topological_sort`), then emits the nodes in that order (`skald-backend/core/codegen_processor.odin::generate_processor_code`). The layout on your canvas is purely cosmetic; the wires are the program.

---

## Going further

**Add the second envelope.** The single biggest upgrade to any patch in this manual. Drop a second ADSR with *nothing* wired into its input — so its output is the bare 0…1 envelope — then a Mapper (`In 0…1`, `Out 200…4000`), then into the Filter's `Cut`. Give it a fast attack (0.005 s) and a short decay (0.15 s) with sustain around 0.2. Every note now opens bright and closes dark. That is a **transient**, and it is what separates "a synth patch" from "an instrument".

**Modulate the modulator.** An LFO into a second LFO's… no — LFO frequency is not a modulation port in Skald (`skald-backend/core/graph_validate.odin::valid_input_ports` has no LFO case). Instead, put an ADSR through a Mapper into a VCA whose `input` is your LFO output. Now the vibrato *fades in* over the note instead of being present from the attack. That is how real players do it, and it is the reason the VCA node accepts control signals as happily as audio.

**Layer sources in a Mixer.** A sub-oscillator (sine, one octave down, fixed pitch) plus the main sawtooth gives weight without mud. A short noise burst gated by a very fast envelope, mixed under the attack, gives you a pick or breath transient. Mixer channels are per-source levels (`skald-backend/core/codegen_nodes.odin::generate_mixer_code`) — this is your first real mixing decision inside a patch.

**Split series and parallel deliberately.** Run your source into two Filters — one lowpass at 200 Hz, one highpass at 2000 Hz — distort only the high branch, and recombine in a Mixer. You get grit on the top without turning the bass to mush. This is parallel saturation and it is standard practice on bass sounds.

**Use exposure as a game-design tool.** Decide, per asset, the two or three numbers your game should be allowed to move: cutoff for a distance filter, mix for a reverb send, ratio for a pitch-varying pickup sound. Expose those, leave everything else baked. The generated `<Asset>_PARAMS` table (`skald-backend/core/codegen_processor.odin::generate_processor_code`) then documents the contract for whoever writes the gameplay code.

**Learn the range table.** Read `schema/nodes.json` end to end once — it is the one authored copy every clamp and default in the app is rendered from, generic rows, node-type overrides and all, each with a `why` explaining which earlier assumption was wrong and what fixed it.

---

## Under the hood

Skald generates one Odin procedure per instrument, and that procedure computes **one stereo sample pair per call**.

Its skeleton (`skald-backend/core/codegen_processor.odin::generate_processor_code`):

```odin
Asset_process :: proc(p: ^Asset_Processor) -> (f32, f32) {
    sample_rate := p.sample_rate
    output_left:  f32 = 0.0
    output_right: f32 = 0.0
    Asset_process_sequence(p)      // step clock, only for Music Layer assets
    p.total_samples += 1

    for v_idx in 0..<8 {           // <- polyphony, from voiceCount
        voice := &p.voices[v_idx]
        if !voice.active do continue
        voice.age += 1.0 / sample_rate
        // ... one block of arithmetic per node, in topological order ...
        // ... output_left += node_<id>_out ...
    }

    // --- Bus effects (once per sample, post voice sum) ---
    // ... Delay/Reverb and everything downstream ...

    return skald_soft_limit(output_left * p.volume, output_right * p.volume)   // <- instrument volume, then the asset's own limiter
}
```

Every node in your graph becomes one `node_<id>_out: f32` local, declared right there in the voice loop, and one short block of arithmetic (same proc). There is no runtime graph, no virtual dispatch, no node objects — the graph is *compiled away*, which is the point of the whole tool. A wire is a variable reference; the topological sort guarantees the variable is already assigned by the time it is read (`skald-backend/core/graph_utils.odin::topological_sort`).

Two lines carry most of the ideas in this chapter.

**The modulation-sum line.** When a parameter has both a knob value and incoming wires, the generator emits their sum:

```
(base) + (node_<src>_out) + (node_<src2>_out)
```

built in `get_f32_param` (`skald-backend/core/param_utils.odin::get_f32_param`). Additive, not multiplicative, not scaled. That single design decision is why the Mapper exists and why an unscaled LFO on a cutoff is inaudible.

**The soft limiter, applied twice.** There are two limiting points, not one, and both call the same helper:

```odin
skald_soft_limit :: proc(l: f32, r: f32) -> (f32, f32) {
    return math.tanh(l), math.tanh(r)
}
```

(`skald-backend/core/codegen_project.odin::emit_soft_limit_proc`). First, every asset's own `_process` multiplies its stereo pair by that instrument's `volume` and, unless the Instrument was authored with `limit: false`, passes the result through `skald_soft_limit` before returning (`skald-backend/core/codegen_processor.odin::generate_processor_code`) — this is the limiter step 11 asked you to overdrive, and it is per-instrument, not project-wide. Second, whatever plays the project back — `project_process` for the test harness, `skald_process` in the wasm shim the editor's preview runs — sums every asset's (already-limited) output, multiplies by the project's master volume, and passes *that* sum through `skald_soft_limit` again (`skald-backend/core/codegen_project.odin::generate_project_code`, `::generate_wasm_shim_code`). With one instrument playing, as in this exercise, the second stage barely adds anything past the first; the reason the two stages exist separately is that a multi-asset project can drive the project-level tanh into saturation even when every individual asset is well behaved.

`tanh` maps the entire real number line into (-1, +1): it is almost perfectly straight for small inputs, bends gently as the input approaches 1, and asymptotes at 1 no matter how hot the input gets. So neither stage can exceed full scale or hard-clip — but each squashes progressively as it gets loud, which is what you heard in step 11. Master volume is applied *before* the project-level limiter, so turning it down reduces saturation as well as level; the same is true of Instrument volume and the per-asset limiter. That ordering is deliberate: an earlier version of this same limiter divided by its own scaling constant afterwards (`tanh(x*k)/k`) and topped out above 1.0, still clipping the device downstream (see the comment on `emit_soft_limit_proc`).

Everywhere else in the chain there is **no ceiling at all**. Skald's intermediate signals are 32-bit floats, so a mixer summing eight hot channels or thirty-two voices stacking up simply produces a large number and carries on. That is good news (no intermediate clipping artefacts) and bad news (all the excess arrives at a limiter at once). Practitioners handle exactly the same problem in a DAW by leaving headroom on every stage and keeping individual channels well below full scale, precisely because "20 tracks peaking at -10 dBFS might easily clip your master bus if summed together without adjustment" and because summing many very high-level signals is where digital mixes go wrong [Source: https://www.soundonsound.com/techniques/gain-staging-your-daw-software]. Skald's version of that advice is short: **set Instrument volume so that a busy chord peaks near 1.0, not at 4.0.**

---

## Terms introduced

- **Signal** — a stream of numbers, one per sample, describing how far a waveform has swung from rest.
- **Sample** — one snapshot of a signal's value at one instant.
- **Sample rate** — how many samples per second the engine computes; 44,100 or 48,000 in practice.
- **Full scale** — the ±1.0 range a healthy signal is expected to occupy.
- **Amplitude** — how far a signal swings from zero; perceived as loudness.
- **Audio-rate signal** — a signal changing fast enough (≈20 Hz–20 kHz) to be heard as a tone.
- **Control-rate signal / control voltage (CV) / modulation signal** — a signal intended to change a parameter rather than be heard; usually below 20 Hz.
- **Modulation** — using one signal to move another signal's parameter over time.
- **Modulation destination** — the parameter being moved (a port named `input_<param>` in Skald).
- **Bipolar signal** — a signal that swings both sides of zero; Skald's convention is -1…+1.
- **Unipolar signal** — a signal that only goes one way; Skald's convention is 0…1.
- **DC offset** — a signal that sits shifted away from zero instead of centred on it.
- **Frequency** — repetitions per second, in hertz (Hz).
- **Pitch** — the perceived highness of a tone; perceived proportionally, so doublings are equal steps.
- **Octave** — a doubling of frequency; 12 semitones; 1200 cents.
- **Semitone / cent** — 1/12 of an octave; 1/100 of a semitone.
- **Equal temperament** — the tuning system that divides the octave into 12 equal semitones.
- **Volt-per-octave (V/Oct)** — the analogue convention that one volt doubles frequency; Skald's exponential pitch inputs are its software equivalent (input is in octaves).
- **Fundamental** — the lowest frequency component of a tone; sets the pitch.
- **Harmonic** — a frequency component at a whole-number multiple of the fundamental.
- **Harmonic series** — the whole set of those multiples.
- **Timbre** — tone colour; determined by which harmonics are present and how loud each is.
- **Waveform** — the repeating shape of one cycle; equivalently, a specific harmonic recipe.
- **Nyquist frequency** — half the sample rate; the highest frequency a digital system can represent.
- **Aliasing** — frequencies above Nyquist folding back down as false, out-of-tune tones.
- **Beating** — the swelling and thinning heard when two tones are slightly detuned.
- **Detune** — deliberate small pitch offset between copies of a sound, measured in cents.
- **Unison** — playing several detuned copies of an oscillator per voice.
- **Voice** — one note's worth of independent state (phase, envelope stage, filter memory).
- **Polyphony** — how many voices can sound at once.
- **Voice stealing** — reusing an active voice when all of them are busy.
- **Glide / portamento** — sliding from one pitch to the next rather than jumping.
- **Subtractive synthesis** — starting with a harmonically rich source and removing harmonics with a filter.
- **Source** — a node that generates signal from nothing (Oscillator, Noise, LFO, Wavetable, FM Operator, S&H).
- **Filter** — a node that removes or emphasises parts of the frequency range.
- **Cutoff frequency** — the frequency at which a filter starts taking effect.
- **Resonance (Q)** — emphasis at the cutoff frequency; enough of it makes a filter ring.
- **Self-oscillation** — a resonant filter ringing loudly enough to produce its own tone with no input.
- **Amplifier / VCA (voltage-controlled amplifier)** — a node that multiplies a signal by a control value.
- **Envelope** — a control signal shaped over the life of a note.
- **ADSR** — the canonical four-stage envelope: Attack, Decay, Sustain (a level, not a time), Release.
- **Transient / attack transient** — the brief, bright, loud start of a note.
- **Gate** — a signal that is on while a note is held and off when released.
- **Velocity** — how hard a note was struck, 0…1.
- **Attenuator / offset / attenuverter** — hardware modules that scale, shift and invert a control signal; Skald's Mapper does all three.
- **Series** — nodes chained one after another.
- **Parallel** — several branches from one source, recombined later.
- **Phase cancellation** — two copies of a signal partially or fully cancelling when summed.
- **Feedback** — routing a signal back into its own input; in Skald, only inside the Delay node.
- **Directed acyclic graph (DAG)** — a graph with no loops; what Skald requires your patch to be.
- **Topological order** — an ordering in which every node comes after the nodes feeding it.
- **Voice domain** — the part of the graph computed once per active voice per sample.
- **Bus domain** — the part computed once per sample on the summed voices; seeded by Delay, Reverb and instrument inputs.
- **Voice-coupled node** — a node that reads per-voice state and therefore cannot run in the bus domain.
- **Gain staging** — managing levels at every step so nothing arrives too hot or too quiet.
- **Headroom** — the margin between your normal level and the point where distortion begins.
- **Clipping** — flattening a waveform's peaks by exceeding the maximum representable level.
- **Soft limiting / saturation** — bending peaks smoothly instead of flattening them (Skald's master `tanh`).
- **Exposed parameter** — a parameter promoted to a runtime-settable field with a generated setter, a clamp and a `PARAMS` entry.
- **Instrument** — Skald's container node: a subgraph plus voices, unison, detune, glide, volume and a name.
- **Asset** — one generated instrument in the exported Odin: SFX (no sequenced notes) or Music Layer (has them).

---

## Known issues

Defects that touch this chapter are tracked centrally in the **Known issues** chapter (`KNOWN-ISSUES.md`): KI-013, KI-025, KI-037. Deliberate design limits — things Skald does not do on purpose — are collected in **What Skald deliberately does not do**.
