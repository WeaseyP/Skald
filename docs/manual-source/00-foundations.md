# Foundations: Signals, Voices and Signal Flow

> Everything in Skald is one number per node per sample; what makes a number "sound" or "control" is only where you plug it in, and this chapter teaches you to tell the difference by ear.

Read this chapter before any node chapter. Every other chapter in this manual assumes the mental model built here: what a signal is, what a *voice* is, why a synthesiser is shaped the way it is, and how a picture of boxes and wires on your screen turns into audio coming out of your speakers and Odin source code in your game.

You do not need to know any synthesis. You do need the app open.

---

## How to read this manual

**Have Skald running.** Every chapter has a **Try it** section that you perform in the running app, on a specific example patch that ships in the repository. Reading a chapter without doing its exercise gets you maybe a quarter of the value. The exercises are five to ten minutes each.

**Work the chapters in order.** They build. This one defines the vocabulary; the source chapters (Oscillator, Noise, Wavetable, FM Operator) give you something to hear; the modulation chapters (LFO, S&H, ADSR, Mapper, MIDI Input) give you movement; the shaping chapters (Filter, Distortion) give you tone; the space chapters (Delay, Reverb) give you depth; the routing chapters (Mixer, VCA, Panner, Output) give you a mix; the Instrument chapter puts it in a box you can ship.

**Every audio term is defined the first time it appears**, in plain language, and then made audible by something you do. Each chapter ends with a **Terms introduced** glossary. If a word in a later chapter is unfamiliar, it was defined in an earlier one — check that chapter's glossary.

**Where a chapter states a number** — a range, a default, a clamp — it cites the file and line in Skald's source that produces that number. If the interface and the generated code disagree, the chapter says so in a **Code-vs-intent notes** section and tells you which one wins. The code always wins, because the code is what you hear.

**Break things deliberately.** Every exercise contains at least one step that pushes a control past the useful zone. Failure modes are how you learn where the useful zone is.

---

## What it is

### A signal is just a number, over and over

Sound in the physical world is air pressure changing very fast. Your eardrum is a membrane that gets pushed and pulled by those changes, and your brain reads the pattern of pushes and pulls as sound. Louder means the pressure swings further from rest; higher-pitched means it swings back and forth more times per second.

A computer cannot store a continuous wiggle, so it stores snapshots — thousands of them per second. Each snapshot is a single number describing how far the pressure has swung from rest at that instant. The number of snapshots per second is the **sample rate**. Skald's generated engine takes the sample rate as a runtime argument (`skald-backend/core/codegen.odin:1721` — `sample_rate := p.sample_rate`), and in the editor's preview that is whatever your audio device runs at, almost always 48,000 or 44,100 snapshots per second.

Zero means "at rest, no pressure difference, silence". Positive means pushed one way, negative pulled the other. Skald's convention is that a healthy full-scale signal lives between **-1.0 and +1.0**, and the master output stage assumes exactly that (see *Gain staging*, below).

Here is the thing that unlocks node-graph tools. In Skald there is nothing structurally different about a number that carries sound and a number that carries a control instruction. When the code generator emits your patch, every node becomes exactly one local variable holding one number, declared as `node_<id>_out: f32 = 0.0` (`skald-backend/core/codegen.odin:1790`), and every wire becomes one variable being read by the next node's arithmetic. An oscillator's output and an envelope's output are the same *kind* of thing. What differs is what you do with the number.

The analogy that matters: a signal is a voltage on a wire in an old analogue modular synthesiser. You could patch that wire into a speaker and hear it, or patch it into a knob-substitute and have it turn the knob for you. Same wire. Same voltage. Different job. Skald keeps that property, and it is why the same LFO node can produce a wobble you feel *or* a buzz you hear, depending only on how fast you set it and where you plug it.

### Audio rate and control rate

This is the single biggest stumbling block for anyone new to a modular-style tool, so it gets its own paragraph.

An **audio-rate signal** is one that changes fast enough for your ear to hear the changing itself as a tone. Human hearing runs roughly 20 Hz to 20,000 Hz ("Hz" = hertz = cycles per second). A signal swinging back and forth 440 times a second is the A above middle C. A **control-rate signal** (also called a **control voltage** or **CV**, from the analogue heritage) changes slowly — a few times per second, or once per note. You do not hear it. You hear its *effect* on something else.

The practitioner's rule of thumb, straight from the modular world: audio signals sit in the 20 Hz–20 kHz band; CV signals are generally below 20 Hz and exist to modulate audio signals or other CV signals; and the boundary is real, because once a modulator crosses about 20 Hz it stops being felt as movement and starts being heard as tone [Source: https://support.inmusicstore.com/en/support/solutions/articles/69000876117-synthesis-101-introduction-to-control-voltage-cv-]. The academic framing says the same thing from the other side: control voltage is voltage applied as a "variable force", used "sometimes at audio-rate, sometimes at sub-audio rate, and sometimes as a fixed single value" [Source: https://cmtext.com/synthesis/chapter4_synthesis_concepts2.php].

**Skald has no separate control rate.** This is important and slightly unusual. In many audio engines, control signals are computed once per block (every 64 or 128 samples) to save CPU. Skald does not do that. Look at the generated process function: there is one loop over voices, and inside it every node in the patch — oscillator, filter, LFO, envelope, mapper — emits code that runs once, for this one sample (`skald-backend/core/codegen.odin:1801-1843`). An LFO is computed with the same per-sample phase accumulator as an oscillator; compare the LFO's phase step (`skald-backend/core/codegen.odin:372`) with the Oscillator's (`skald-backend/core/codegen.odin:185`) — they are the same maths.

The practical consequences:

- **Modulation is smooth.** There is no stair-stepping from block-rate control, so an LFO on pitch produces clean vibrato rather than a zipper noise.
- **You can drive control inputs at audio rate.** Wire an Oscillator's output into a Filter's cutoff input and you get frequency-domain sidebands, not a wobble. This is a legal, working patch. Whether it is a good idea is your problem.
- **"Control rate" in this manual is a description of intent, not of machinery.** When a chapter says "the LFO is a control-rate node", it means "this node is designed to be slow and to modulate other things", not "this node is computed less often".

The way to tell an audio signal from a control signal in Skald is therefore behavioural, and there are only three questions:

1. **How fast does it change?** Above ~20 Hz you hear it; below, you feel it.
2. **What range does it live in?** (See the next section.)
3. **Where is it plugged in?** A wire into a node's main `input` handle is audio. A wire into a handle named `input_<something>` — `input_freq`, `input_cutoff`, `input_gain`, `input_pan` — is modulation.

That third point is enforced structurally. The backend's connection validator keeps an explicit list of legal destination port names per node type, and every port that modulates a parameter is named `input_<param>` (`skald-backend/core/graph_validate.odin:26-34`). A wire into a port name that is not on the list is a hard error at generate time, not a silent no-op — the validator's own comment explains why, with a war story about a typoed `input_freq` that turned a laser sweep into a static 440 Hz tone with no warning (`skald-backend/core/graph_validate.odin:9-20`).

### Unipolar and bipolar, and why the Mapper has to exist

Signals fall into two families by the range they swing over.

A **bipolar** signal goes both sides of zero: it swings negative, crosses zero, swings positive. Skald's bipolar sources sit in **-1.0 to +1.0**. An LFO is bipolar (`skald-backend/core/codegen.odin:379-385` — the sine branch is `math.sin(phase) * amplitude`, and a sine spans -1 to +1). So is Sample & Hold, which the code deliberately re-centres: `next_float32(rng) * 2.0 - 1.0` turns a 0-to-1 random draw into a -1-to-+1 one (`skald-backend/core/codegen.odin:401`). So is Noise, and the comment there tells you exactly why it matters: "the raw PRNG is [0,1), which put a +0.5\*amp DC offset on every voice" (`skald-backend/core/codegen.odin:311-314`).

A **unipolar** signal only goes one way, normally **0.0 to 1.0**. An envelope is unipolar: it rises from silence to a peak and falls back, and a negative amplitude has no meaning (`skald-backend/core/codegen.odin:249-283` — every ADSR stage produces a value between 0 and 1).

That split is the industry standard, not a Skald invention: oscillators and LFOs are usually bipolar, envelope generators are almost always unipolar, and unipolar CVs suit destinations like pitch and filter cutoff where "less than nothing" is meaningless [Source: https://support.inmusicstore.com/en/support/solutions/articles/69000876117-synthesis-101-introduction-to-control-voltage-cv-]. Classic hardware puts bipolar CV at -5 V to +5 V and unipolar at 0 V to +5 V [Source: https://cmtext.com/synthesis/chapter4_synthesis_concepts2.php]; Skald normalises both to ±1 and 0–1 respectively.

**A DC offset** is what you get when a signal that should be centred on zero is not — the whole waveform sits shifted up or down. On an audio path it wastes headroom, can click, and on a bipolar-expecting destination it skews the modulation to one side. On a control path it is sometimes exactly what you want (an envelope *is* a deliberate DC offset that moves).

Now the punchline. Modulation sources speak in -1…+1 or 0…1. Destinations speak in real physical units. Look at what happens when you wire an LFO into a Filter's cutoff. The code generator does not scale anything; it literally adds the modulation to the parameter value (`skald-backend/core/param_utils.odin:138-155` builds `(base) + (mod)`, and the filter reads that sum as its cutoff at `skald-backend/core/codegen.odin:323,339`). Your filter is sitting at 800 Hz. Your LFO swings ±1. Your cutoff now wobbles between **799 Hz and 801 Hz**. That is a fifth of one percent of one octave. You will hear nothing at all.

This is not a bug — it is the same arithmetic every modular synthesiser does, and it is why hardware invented the *attenuator* (scale a CV down) and the *offset* (shift it) as separate modules. Skald's equivalent is the **Mapper** node, which takes an input range and re-issues it as an output range (`skald-backend/core/codegen.odin:701-703`). Its whole reason to exist is the paragraph you just read. When a later chapter tells you "put a Mapper between them", this is why.

One warning that will save you an hour: **not every destination is linear.** Filter cutoff is linear — the number you send is in hertz, added to the knob. Oscillator pitch is *exponential* — the number you send is in **octaves**, and the code raises 2 to that power: `base * math.pow(2.0, clamp(mod, -10, 10))` (`skald-backend/core/codegen.odin:152-156`). Send 1.0 to a cutoff and you moved it 1 Hz. Send 1.0 to a pitch input and you moved it a whole octave. That exponential convention is the software descendant of the hardware **volt-per-octave** standard, where one extra volt doubles the frequency so that equal voltage steps sound like equal musical intervals [Source: https://cmtext.com/synthesis/chapter4_synthesis_concepts2.php].

### Frequency, pitch, harmonics — the minimum you need

**Frequency** is how many times per second a waveform repeats, in hertz. **Pitch** is what your brain does with frequency: it perceives it *proportionally*, not additively. 110 Hz to 220 Hz sounds like the same musical distance as 220 Hz to 440 Hz, and as 440 Hz to 880 Hz — each is one **octave**, each is a doubling. This is why pitch controls are exponential everywhere in synthesis, and why the Oscillator's modulation input is a power of two rather than an addition.

An **octave** divides into 12 **semitones** in Western equal temperament, and each semitone into 100 **cents**. Skald's detune parameter is in cents (`skald-backend/core/param_ranges.odin:110-111`), and the oscillator converts cents to a frequency ratio with `math.pow(2.0, detune / 1200.0)` (`skald-backend/core/codegen.odin:183`) — 1200 cents per octave.

Now **timbre** (pronounced "TAM-ber"): why a trumpet and a flute playing the same note sound different. Almost nothing in the physical world vibrates at one frequency only. A plucked string vibrates along its whole length, *and* in halves, *and* in thirds, all at once. Those extra modes produce frequencies at whole-number multiples of the lowest one. The lowest is the **fundamental** and it sets the pitch you hear; the multiples are **harmonics**, and their relative loudnesses are the timbre.

Sound On Sound's *Synth Secrets* puts the relationship precisely: the harmonics are "the permissible modes of vibration", the second harmonic sits an octave above the fundamental, the third a perfect fifth above that, and a waveform *is* its harmonic content — "the waveform defines the harmonics, and the harmonics determine the waveform" [Source: https://www.soundonsound.com/techniques/whats-sound]. For the sawtooth wave specifically, "every harmonic is present, and the amplitude of the nth harmonic is 1/n times that of the fundamental" — which is exactly why a sawtooth sounds bright and buzzy and why it is the default waveform on Skald's Oscillator (`skald-ui/src/definitions/node-definitions.ts:84`).

Hold on to that, because it explains the whole architecture of the next section. If a bright sound is "a sound with lots of high harmonics", then you can build any duller sound by *starting* bright and *removing* harmonics with a filter. That approach is called **subtractive synthesis**, and it is what Skald's default node set is built for.

There is a ceiling. Because the computer only takes snapshots, it can only represent frequencies below **half the sample rate** — the **Nyquist frequency**, 24 kHz at a 48 kHz sample rate. Frequencies above it do not vanish; they fold back down and appear as unrelated, out-of-tune tones. That artefact is **aliasing**, and it is the reason several nodes carry clamps that stop you from pushing them somewhere ultrasonic (see the FM Operator's ratio clamp at `skald-backend/core/codegen.odin:460-462`, whose comment describes a legacy default putting a carrier at ~190 kHz).

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

**Skald's twist on this shape, which you must know before your first patch:** Skald's ADSR node is *both* the envelope generator and a VCA in one box. Its generated code takes whatever is wired into its `input` port and multiplies it by the envelope — `node_out = (input) * envelope * depth * vel_scale` (`skald-backend/core/codegen.odin:285`), where `input` defaults to the literal `1.0` when nothing is connected (`skald-backend/core/codegen.odin:217`). So:

- Wire **audio into** the ADSR and take audio out: the ADSR *is* your VCA. This is the common Skald idiom and it is what most of the shipped examples do.
- Wire **nothing into** the ADSR: the input is 1.0, so the output is the bare envelope, 0 to 1. Now it is a pure control source you can send to a filter cutoff (through a Mapper) or to a separate VCA node's gain input.

The node named **VCA** in the sidebar (internally `gain`, `skald-ui/src/definitions/node-definitions.ts:214`) is the pure multiplier with no envelope in it — `node_out = (input) * (gain)` (`skald-backend/core/codegen.odin:714`).

---

## What it looks like in Skald

### The five surfaces you will use

**The sidebar** runs down the left edge (`skald-ui/src/components/Sidebar.tsx:148`). Top to bottom: a **BPM** box that sets the project tempo shared by the preview engine, the sequencer and the exported code (`skald-ui/src/components/Sidebar.tsx:160-169`); a **Generation** section with the package name and output path plus the **Generate Code** button (`skald-ui/src/components/Sidebar.tsx:173-190`); **Graph Actions** — Play, Stop, Loop, Save, Load, Import Patch (`skald-ui/src/components/Sidebar.tsx:193-208`); **Grouping** — Create Instrument, Create Group, Explode Instrument (`skald-ui/src/components/Sidebar.tsx:211-236`); and finally the **Nodes** palette you drag from (`skald-ui/src/components/Sidebar.tsx:238-254`), whose 17 entries are listed with one-line tooltips at `skald-ui/src/components/Sidebar.tsx:263-281`.

**The canvas** is the node graph. Nodes are colour-coded by role, and the colours are a real system worth learning: orange for sources, purple for modulators, green for envelopes, blue for filters, teal for time and space effects, red for drive, grey/lilac/cyan/pale-yellow for utilities, indigo for structure, burnt orange for the destination (`skald-ui/src/components/Nodes/NodeStyles.ts:85-107`). Handles are dots on the node edges: inputs on the left, outputs on the right (`skald-ui/src/components/Nodes/ParamNode.tsx:122-147`).

**The parameter panel** appears on the right when you select a node. It carries the full-fidelity controls — sliders paired with typed number boxes, the ADSR envelope graph, the Filter's XY pad (`skald-ui/src/components/NodeParameterControls.tsx:83-104,118-154`). The small boxes drawn on the node itself are quick-edit duplicates; the panel is authoritative and is the only place the **expose** toggle lives.

**The sequencer dock** at the bottom holds one track per Instrument, a step grid, and the master volume slider (`skald-ui/src/components/Sequencer/SequencerDock.tsx:214-217`).

**The code preview panel** shows the actual Odin the generator produced (`skald-ui/src/components/CodePreviewPanel.tsx`).

### Which outputs are audio, and which are control

Nothing in the code marks a port as "audio" or "control" — but the *node types* have clear intent, and their handle names tell you. This table is the map. Handle ids come from the node components; the legality of each destination comes from the validator.

| Node | Output handles | Normal range | Intended as | Modulation inputs it accepts |
|---|---|---|---|---|
| Oscillator | `output` | ±1 × amplitude | Audio | `input_freq` (octaves, exponential), `input_amp`, `input_pulseWidth` — `skald-ui/src/components/Nodes/OscillatorNode.tsx:10-14` |
| Noise | `output` | ±1 × amplitude | Audio | `input_amp` — `skald-ui/src/components/Nodes/NoiseNode.tsx:6-7` |
| Wavetable | `output` | ±1 × amplitude | Audio | `input_freq`, `input_pos`, `input_amp` — `skald-ui/src/components/Nodes/WavetableNode.tsx:9-14` |
| FM Operator | `output` | ±1 | Audio | `input_mod`, `input_carrier` — `skald-ui/src/components/Nodes/FMOperatorNode.tsx:9-14` |
| LFO | `output` | ±1 × amplitude (bipolar) | **Control** | none — source only (`skald-backend/core/graph_validate.odin:57-58`) |
| Sample & Hold | `output` | ±1 × amplitude (bipolar) | **Control** | none — source only |
| ADSR | `output` | 0…1 × input (unipolar) | **Both** — envelope alone, or audio × envelope | `input` (audio), `input_attack`, `input_decay`, `input_sustain`, `input_release` — `skald-backend/core/graph_validate.odin:27` |
| MIDI Input | `pitch`, `gate`, `velocity` | pitch = octaves from A4; gate = 0/1; velocity = 0…1 | **Control** | none — `skald-backend/core/graph_validate.odin:65-73`, `skald-backend/core/codegen.odin:723-729` |
| Filter | `output` | audio in, audio out | Audio | `input_cutoff` (Hz, linear), `input_res` |
| Mapper | `output` | whatever you declare | **Control** (usually) | `input` only — no modulatable range |
| VCA (Gain) | `output` | input × gain | Audio | `input_gain` |
| Panner | `output`, `output_left`, `output_right` | ±1 | Audio | `input_pan` |
| Mixer | `output` | sum of inputs × levels | Audio | `input_1`…`input_N` (audio, not modulation) |
| Delay / Reverb / Distortion | `output` | audio | Audio | none — `input` only (`skald-backend/core/graph_validate.odin:51`) |
| Output | — (terminal) | — | destination | `input` |

Two things to notice. First, LFO, Sample & Hold and MIDI Input have **no input handles at all** — they are pure sources, and the validator says so explicitly (`skald-backend/core/graph_validate.odin:57-58`). Second, **Delay and Reverb have no modulation inputs**, so you cannot wire an LFO into a delay time. The example library contains a patch that tried, and it is a hard codegen error rather than a silent drop (`examples/AUDIT.md:114`).

### Legal connections, and what happens when you get it wrong

Skald refuses to generate a patch that would be silently wrong. The validator runs over every connection before any code is emitted and exits with an explanatory error for four distinct mistakes (`skald-backend/core/graph_validate.odin:90-152`):

- a wire from or to a node id that does not exist;
- a wire out of a port that node does not have (only `output` is universal; MIDI Input adds `pitch`/`gate`/`velocity`, Panner adds `output_left`/`output_right` — `skald-backend/core/graph_validate.odin:65-74`);
- a wire into a port name that is not on the node type's allow-list;
- a wire into a Mixer channel above its configured `inputCount`.

Older saved files that use friendlier port names still work: the JSON loader maps `frequency`→`input_freq`, `cutoff`→`input_cutoff`, `resonance`→`input_res`, `gain`→`input_gain`, `pan`→`input_pan`, `position`→`input_pos`, `modIndex`→`input_mod` before validation (`skald-backend/core/json.odin:36-49`).

**Multiple wires into one port are summed, not fought over.** Two LFOs into one `input_cutoff` give you their sum; two oscillators into one Filter `input` give you a mix. The helper that does it is `sum_port_inputs` and its comment records the bug it fixed: an earlier version kept only the *first* edge and silently dropped the rest (`skald-backend/core/param_utils.odin:161-177`).

**Feedback loops are rejected.** The graph must be a DAG — a directed acyclic graph, no wire path that leads back to where it started. The topological sort detects the cycle and codegen exits with the list of nodes involved (`skald-backend/core/codegen.odin:987-1007`), because a cycle would otherwise cause the sort to silently drop every node in it *and* everything downstream. If you want feedback, you use the Delay node, which has an internal feedback path (`skald-backend/core/codegen.odin:532`); you cannot build feedback out of wires.

### Two domains: voice and bus

This is Skald-specific and it will otherwise confuse you the first time you add a reverb.

A **voice** is one note being played. If your Instrument has 8 voices (the default, `skald-ui/src/definitions/node-definitions.ts:167`) you can hold 8 notes at once, and the engine runs the whole voice graph eight times per sample — once per active voice — then adds the results together (`skald-backend/core/codegen.odin:1738-1740`). Each voice has its own oscillator phase, its own envelope stage, its own filter state.

That model works for oscillators and envelopes, and breaks for echoes. A delay line holds a shared buffer of the recent past; there is no per-voice "recent past". So Skald splits the graph into two **domains**:

- The **voice domain** runs inside the per-voice loop. Its state lives on the voice (`voice.filter_<id>_low`, and so on — the state prefix `"voice."` at `skald-backend/core/codegen.odin:1809`).
- The **bus domain** runs once per sample, after all voices are summed. Delay, Reverb and any instrument-level audio input seed it, and *everything downstream of them* joins it automatically (`skald-backend/core/compute_bus_domain`, `skald-backend/core/codegen.odin:70-88`). Its state lives on the processor (prefix `"p."`, `skald-backend/core/codegen.odin:1912`).

The comment above that function is worth reading in full — running a delay per-voice "divided the delay time by the active-voice count, bled voices into each other's feedback, and hard-cut the tail the instant the last voice died" (`skald-backend/core/codegen.odin:64-69`).

**The rule you must remember:** Oscillator, ADSR, FM Operator, Wavetable and MIDI Input are **voice-coupled** — they read per-voice state and *cannot* run in the bus domain (`skald-backend/core/codegen.odin:56-62`). Put one downstream of a Delay or Reverb and codegen refuses with an explicit error telling you to move it (`skald-backend/core/codegen.odin:89-97`). Filters, VCAs, Distortion, Mixers, Mappers, Panners, LFOs and Sample & Hold are happy in either domain and get generated twice over, with the right state prefix each time.

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

**An Instrument is mandatory for preview.** Loose nodes on the canvas will not play. The engine throws "No instruments on the canvas. Wrap nodes in an Instrument before playing." (`skald-ui/src/hooks/nodeEditor/useWasmAudioEngine.ts:96-98`), and there is a test pinning that behaviour (`skald-ui/src/tests/hooks/WasmEngineContract.test.tsx:101`). The *code generator* is more forgiving — it wraps a bare graph as a single asset named `Asset` for backwards compatibility — but the editor is not.

**The preview is the export.** The Play button does not run a hand-written Web Audio imitation of your patch. It runs codegen for real, compiles the resulting Odin to WebAssembly, and plays that inside an AudioWorklet (`skald-ui/src/hooks/nodeEditor/useWasmAudioEngine.ts:5-13`). Both the preview and the Generate Code button are fed byte-identical project descriptions by the same serializer (`skald-ui/src/utils/projectSerializer.ts:6-8`). What you hear is what ships.

**Some edits are instant, some rebuild.** Changing an **exposed** parameter's value while playing applies immediately through the generated `set_param` entry point, with no recompile and no audio dropout. Changing anything else — a waveform, a wire, a filter type — triggers a debounced 250 ms recompile-and-hot-swap (`skald-ui/src/hooks/nodeEditor/useWasmAudioEngine.ts:31`). The decision is made by comparing a "topology signature" that deliberately masks exposed-parameter values (`skald-ui/src/utils/projectSerializer.ts:230-245`).

**Notes come from three places.** The sequencer's step grid; a connected MIDI keyboard (`skald-ui/src/hooks/nodeEditor/useWasmAudioEngine.ts:359-370`); or the **Test Audio** button on the Output node's parameter panel, which fires middle C at full velocity for 0.2 seconds on every asset (`skald-ui/src/components/ParameterPanel.tsx:327-332`, `skald-ui/src/hooks/nodeEditor/useWasmAudioEngine.ts:340-353`). That button is how you audition a patch that has no sequencer notes.

---

## The controls

The per-node parameters get their own chapters. The controls that belong *here* are the ones that govern the whole patch — the container settings every node chapter assumes you have already met. They live on the **Instrument** node's parameter panel and in the sidebar.

| Parameter | Range | Default | Unit | What it does to the sound |
|---|---|---|---|---|
| `bpm` (sidebar) | 20 – 999 | 120 | bpm | Project tempo. Drives the sequencer clock and every BPM-synced Delay/LFO/S&H. `skald-backend/core/param_ranges.odin:104-105` |
| `voiceCount` | 1 – 32 | 8 | voices | How many notes can sound simultaneously. `skald-backend/core/param_ranges.odin:106-107`, `skald-ui/src/definitions/node-definitions.ts:167`, `skald-ui/src/components/NodeParameterControls.tsx:319` |
| `unison` | 1 – 16 | 1 | copies | How many detuned copies of each oscillator play per voice. `skald-backend/core/param_ranges.odin:108-109` |
| `detune` | 0 – 100 | 5 | cents | How far apart the unison copies are spread in pitch. `skald-backend/core/param_ranges.odin:110-111` |
| `glide` | 0 – 5 | 0.05 | s | How long a stolen voice takes to slide from the old pitch to the new one. `skald-backend/core/param_ranges.odin:112-113` |
| `volume` (Instrument) | 0 – 1 (editor), floored at 0.001 | 1.0 | × | Level of this whole asset before it hits the project mix. `skald-ui/src/definitions/node-definitions.ts:165`, `skald-ui/src/utils/projectSerializer.ts:198-200` |
| Master volume (dock) | 0 – 1 | 0.8 | × | Multiplies the summed project *inside* the master limiter on export; drives a JS gain node in preview. `skald-ui/src/app.tsx:82`, `skald-backend/core/codegen.odin:2417-2418` |
| `gain` (VCA node) | 0 – 4 | 0.75 | × | Straight multiplier on a signal. `skald-backend/core/param_ranges.odin:84-85`, `skald-ui/src/definitions/node-definitions.ts:154` |

### What you hear as you sweep them

**voiceCount.** At **1**, the instrument is monophonic: play a second note while the first is held and the first note's oscillator jumps to the new pitch (this is where `glide` becomes audible). Chords are impossible. At **8**, the default, you can hold a comfortable chord and still have voices free for the tails of released notes — remember that a note with a 2-second release is still occupying its voice for those 2 seconds. At **32** and above you will hear something you might not expect: **it gets louder**. Every active voice adds its output to the same accumulator (`skald-backend/core/codegen.odin:1979-1984`), with no division by voice count. Eight voices of a default-amplitude oscillator peak around 4.0, four times full scale. Read the gain-staging section before you go there.

**unison and detune.** With `unison` at 1 the detune knob does nothing. Push unison to **4–7** and detune to **10–25 cents** and a single sawtooth turns into the fat, shimmering wall that people call a supersaw. The mechanism is **beating**: two tones a few cents apart drift in and out of phase, and their sum swells and thins at the difference frequency. Push detune past **50 cents** (a quarter tone) and it stops sounding fat and starts sounding out of tune. Note that unison does *not* make it louder — the code averages the copies, `unison_out / unison_count` (`skald-backend/core/codegen.odin:212`) — which is a considerate piece of gain staging you should be grateful for.

**glide.** At **0** notes snap to pitch. At **0.05 s** (the default) you get a barely-perceptible smear that glues fast lines together. At **0.2–0.4 s** you get the classic portamento slide of a TB-303 bassline. Above **1 s** notes never arrive before the next one starts. Note the important restriction in the code: glide only engages when a voice is *stolen*, so fresh notes on a free voice start exactly on pitch (`skald-backend/core/codegen.odin:1744-1753`). On an 8-voice instrument you will rarely hear it; drop `voiceCount` to 1 and it happens on every note.

**Instrument volume.** This is applied at the asset boundary, on the way out of the instrument and before the project mix (`skald-backend/core/codegen.odin:1949-1952`). Use it to balance a hot drum kit against a quiet pad, which is exactly what the code comment recommends — pull it down "without fighting the master tanh saturator".

### What "expose" does, and when to use it

Next to most parameters in the right-hand panel there is a small chain-link icon (`skald-ui/src/components/ParameterPanel.tsx:228-236`). Clicking it toggles **exposure**: the parameter's name goes into that node's `exposedParameters` list (`skald-ui/src/components/ParameterPanel.tsx:197-211`, `skald-ui/src/definitions/types.ts:21`), and the icon turns blue.

Exposing a parameter changes what the generator emits for it. An un-exposed parameter is **baked in as a constant** — the code generator writes the literal number straight into the DSP expression (`skald-backend/core/param_utils.odin:105-112`). An exposed parameter becomes a **field on the processor struct**, and the generated code reads `p.<field>` instead of a literal (`skald-backend/core/param_utils.odin:79-85`). Alongside it you get three things for free:

1. **A typed setter** with the range clamp compiled in: `<Asset>_set_<field>(p, value)`, which clips the incoming value to the min and max from the range table before storing it (`skald-backend/core/codegen.odin:1612-1625`).
2. **An entry in a public introspection table**, `<Asset>_PARAMS`, listing name, min, max, default and unit — so a game's debug overlay or save system can enumerate what is tweakable without you hard-coding a list (`skald-backend/core/codegen.odin:1631-1643`).
3. **A string-keyed setter**, `<Asset>_set_param(p, name, value)`, reachable both by field name and by a `"<nodeId>::<param>"` alias (`skald-backend/core/codegen.odin:1677-1693`).

Those ranges come from `skald-backend/core/param_ranges.odin`, and the file's top section is worth your attention: it holds node-type-specific *overrides* that exist because the generic name-keyed table was wrong for certain nodes. An exposed FM Operator `frequency` is a ratio, not hertz, so it gets `[0.01, 32]` instead of `[20, 20000]`; an exposed LFO `frequency` gets `[0.01, 100]` Hz so it is not clamped into the audio range (`skald-backend/core/param_ranges.odin:22-38`). Those comments are the best short history of Skald's parameter semantics available.

**Why you would expose something.** Two reasons.

*For your game at runtime.* A door-creak SFX whose pitch varies with door speed; an engine loop whose filter cutoff tracks RPM; a music layer whose reverb mix rises as the player enters a cavern. Expose the parameter, call the typed setter from gameplay code, done. Anything not exposed is frozen at generate time.

*For yourself, while designing.* Because exposed parameters apply live without a recompile, dragging an exposed slider during playback is instant and continuous, whereas dragging a non-exposed one queues a 250 ms rebuild and hot-swap (`skald-ui/src/utils/projectSerializer.ts:230-245`, and the tests at `skald-ui/src/tests/codegen/ProjectSerializer.test.ts:34-52`). Exposing the two or three parameters you are actively tuning makes the app feel like a synthesiser instead of a compiler.

The cost is small but real: an exposed parameter can no longer be constant-folded by the Odin compiler, and it becomes part of your asset's public API, which you then have to keep stable. Expose deliberately, not by default. Skald's own defaults expose a sensible handful per node (see any `exposedParameters` array in `skald-ui/src/definitions/node-definitions.ts:49-185`).

---

## Try it (hands-on)

**What you will hear:** a raw sawtooth turning into a musical note; a filter removing harmonics; the same envelope in two different places producing two different instruments; a modulation wire that does absolutely nothing until you scale it; and a filter that screams.

**Starting file:** `examples/instruments/leads/saw-lead.skald.json`. Verified contents: four nodes — `osc_1` (Oscillator, waveform Sawtooth, frequency 220), `adsr_1` (ADSR, attack 0.05, decay 0.3, sustain 0.7, release 0.4), `filter_1` (Filter, Lowpass, cutoff 800, resonance 0.4), `output_1` (Output) — wired `osc_1 → adsr_1 → filter_1 → output_1`.

---

**1. Load it.** Sidebar → **Load**, and pick `examples/instruments/leads/saw-lead.skald.json`. Load replaces your canvas entirely (`skald-ui/src/hooks/nodeEditor/useFileIO.ts:113-114`), so save anything you care about first. You should see four cards left to right: orange Oscillator, green ADSR, blue Filter, burnt-orange Output.

Look at the wiring order and hold the question in your head: the envelope is **before** the filter here, not after. We will come back to that.

**2. Wrap it in an Instrument.** Rubber-band-select all four nodes, then Sidebar → **Create Instrument**, and name it `Lead`. The four nodes collapse into one indigo card.

*Why:* the preview refuses to play a canvas with no Instrument on it (`skald-ui/src/hooks/nodeEditor/useWasmAudioEngine.ts:96-98`). This step is not busywork; it is the moment your graph becomes a shippable asset with voices, unison and a name.

**3. Play it.** Sidebar → **Play**. There will be silence — correct, because nothing has triggered a note yet. Select the Instrument, scroll the parameter panel to the **Output** sub-node, and click **Test Audio**. You should hear a short, bright, buzzy note at middle C.

*What you just heard:* a sawtooth wave containing every harmonic, with the nth harmonic at 1/n of the fundamental's amplitude [Source: https://www.soundonsound.com/techniques/whats-sound], shaped by a 50 ms attack and gently rolled off by a lowpass filter at 800 Hz. Click **Test Audio** a few times to get it in your ear.

**4. Confirm that the oscillator's frequency box is a lie.** In the parameter panel, find the Oscillator sub-node. There is no frequency slider — only a **Fixed Pitch (ignore note)** checkbox (`skald-ui/src/components/NodeParameterControls.tsx:220-224`). The saved file says `"frequency": 220` but you cannot see it and it does nothing, because pitch follows the played note by default (`skald-backend/core/codegen.odin:129-131`). Tick **Fixed Pitch**: the frequency slider appears and now the note *is* 220 Hz regardless of what you play. Untick it again.

*Why this matters:* it is the difference between an instrument and a drone. Nearly every beginner's first "why won't my melody play" is this checkbox.

**5. Hear the harmonics arrive and leave.** Set the Oscillator's **Waveform** to **Sine**, click **Test Audio**. Pure, hollow, flute-like — a sine is the *only* waveform with no harmonics at all, just the fundamental. Now **Triangle**: slightly reedier. **Square**: hollow and woody. Back to **Sawtooth**: the brightest of the four.

Nothing about the pitch changed. Everything about the **timbre** did, and the only difference is which harmonics are present.

**6. Sweep the filter and hear subtractive synthesis work.** Leave it on Sawtooth. Select the Filter sub-node; it has an XY pad (cutoff on X, resonance on Y) plus exact number boxes (`skald-ui/src/components/NodeParameterControls.tsx:141-153`). Click **Test Audio** repeatedly while you drag cutoff:

- **200 Hz** — dull, muffled, most of the buzz gone. The high harmonics have been removed.
- **800 Hz** (the file's value) — a balanced lead tone.
- **3000 Hz** — bright and aggressive, nearly all the sawtooth's harmonics through.
- **8000 Hz and above** — and now nothing more happens, no matter how far right you drag.

That last one is not your ears failing. The generated filter clamps its cutoff to `sample_rate * 0.16` for stability (`skald-backend/core/codegen.odin:339`) — about **7,680 Hz** at a 48 kHz sample rate — even though the slider goes to 20,000. See *Code-vs-intent notes*.

**7. Move the envelope and build a different instrument.** Currently the ADSR multiplies the *raw oscillator*, and the filter then processes the enveloped signal. Select the Instrument, use **Explode Instrument** to get the nodes back on canvas, then rewire to `osc_1 → filter_1 → adsr_1 → output_1` (delete the three edges, draw three new ones), re-select all four, **Create Instrument** again, **Play**, **Test Audio**.

On this patch the difference is subtle — a lowpass at a fixed cutoff is roughly linear, so the order barely matters. Now make it matter: set the Filter's **resonance** to **12** and cutoff to **300**. Listen with the ADSR *after* the filter (the standard order) and then flip it back to *before*. With the envelope last, the resonant ring is shaped by the envelope and the note ends cleanly. With the envelope first, the filter is still ringing on its own after the envelope has closed, and the note has a soft ghost tail.

*The lesson:* a filter has memory (state that persists between samples, `skald-backend/core/codegen.odin:343-345`); an envelope multiply does not. Anything with memory placed after your amplitude control can outlive the note.

**8. Wire a modulation source and discover it does nothing.** Explode the instrument again. Drag an **LFO** from the palette. Wire its `Out` to the Filter's **Cut** handle (`input_cutoff`). Leave the LFO at its defaults — Sine, 5 Hz, amplitude 1. Rebuild the Instrument, Play, Test Audio while holding your ear out for a wobble.

There is no wobble. There is no *anything*. Your LFO swings ±1, so a cutoff of 300 Hz is now wobbling between 299 and 301 Hz, five times a second (`skald-backend/core/param_utils.odin:138-155`).

**9. Fix it with a Mapper, and hear why the node exists.** Explode again. Drag a **Mapper** onto the canvas. Rewire: LFO `Out` → Mapper `In`, Mapper `Out` → Filter `Cut`. Select the Mapper and set **In Min = -1**, **In Max = 1**, **Out Min = -600**, **Out Max = 600**. Rebuild, Play, hold down a step in the sequencer or hammer Test Audio.

Now you have a wobble: the cutoff sweeps ±600 Hz around 300 Hz, five times a second. Drop the LFO rate to **0.3 Hz** for a slow filter breath; push it to **8 Hz** for the classic dubstep growl. Push it to **60 Hz** and the wobble stops being a wobble and becomes a buzzy metallic edge on the tone — you have crossed the audio-rate boundary and the "modulation" is now generating sidebands you hear as timbre.

**10. Break it: self-oscillation.** Set the Filter's **resonance** to **20** (the XY pad's ceiling, `skald-ui/src/components/NodeParameterControls.tsx:144`) and the Mapper's output range to **-2000 / +2000**. Play. The filter now rings so hard at its cutoff that it produces a loud sine tone of its own, sweeping with the LFO — a screaming siren rather than a bass. Turn your monitors down before you do this.

*What you are hearing:* resonance is feedback around the filter's own frequency. Push it far enough and the feedback sustains itself with no input. The generated code deliberately bounds this — damping is clamped to `[0.05, 1.9 - f]` so the filter rings hard but cannot diverge to infinity (`skald-backend/core/codegen.odin:341`). Without that clamp you would get NaN and permanent silence, not a scream.

**11. Break it: gain staging.** Set resonance back to **2**. Select the Instrument and set **Voice Count** to **32**. In the sequencer, place a dense chord — six or eight notes on the same step — and loop it. Listen as the notes stack up.

Past about four simultaneous voices the sound stops getting louder and starts getting *squashed and dull*: the transients flatten, the attack loses its snap, and everything sounds like it is behind a blanket. That is the master soft limiter doing its job — `math.tanh(mixed * master_volume)` (`skald-backend/core/codegen.odin:2417-2418`). Now bring the **Instrument volume** down to about **0.3** and listen again: the same chord, quieter but *clear*, with the transients back.

*The lesson, in one sentence:* nothing inside your patch clips, everything sums, and the only place the excess goes is into the master limiter squashing your dynamics.

---

## Why you patch it this way

**Source first, filter second, amplitude last.** Put a filter after the amplitude control and its resonance rings on after the note ends (you heard this in step 7). Put a distortion before the amplitude control and the note's decay gets progressively cleaner as it falls below the drive threshold — sometimes lovely, usually not what you meant. The classic order exists because it matches the physics: an instrument's body filters what the excitation produces, and then the whole thing gets quieter over time.

**Modulation goes into `input_<param>` ports, audio goes into `input`.** Skald will let you wire either into either as long as the port exists, and both are legal code. The distinction lives entirely in your head and in the port names. If you find yourself surprised by what a wire does, check which handle you dropped it on.

**Almost every modulation wire wants a Mapper.** Unless the destination already lives in the -1…+1 or 0…1 range — a VCA's `input_gain`, a Panner's `input_pan`, an Oscillator's `input_amp` — the raw modulator will not move it perceptibly. Cutoff (hertz), delay time (seconds), FM ratio: all need scaling. The exception is Oscillator and Wavetable `input_freq`, which reads its input as **octaves**, so ±1 raw from an LFO is a two-octave vibrato — usually far too much and needing a Mapper to shrink it to about ±0.02 (roughly a quarter-tone).

**Series versus parallel.** *Series* is a chain: each node processes what the last one produced. Use it when you want cumulative shaping (oscillator → filter → distortion → VCA). *Parallel* is two or more branches from the same source, recombined in a Mixer or at the Output. Use it when you want to treat parts of a sound independently — a clean low branch and a distorted high branch, or a dry signal beside a reverb send. Both branches sum at the join, which means **parallel doubles your level** unless you pull the Mixer channel levels down. It also means **phase matters**: two copies of the same signal, one delayed, will cancel at some frequencies and reinforce at others (comb filtering); two copies with opposite polarity cancel completely.

**Feedback is a Delay, not a wire.** Skald rejects cycles in the graph (`skald-backend/core/codegen.odin:1000-1007`). If you want a signal to feed back into itself, the Delay node's internal feedback path is the supported route (`skald-backend/core/codegen.odin:532`), clamped below 1.0 so it decays rather than diverging.

**Bus effects go last, and they take everything after them with them.** The moment you insert a Delay or Reverb, every node downstream of it leaves the voice domain (`skald-backend/core/codegen.odin:70-88`). Put a Filter after a Reverb and it becomes one shared filter for the whole instrument rather than one per note. That is usually what you want for a tone-shaping filter on the tail; it is definitely *not* what you want for a per-note filter sweep, and if you try to put an ADSR back there codegen will stop you with a message telling you to move it (`skald-backend/core/codegen.odin:89-97`).

**Order of evaluation is decided for you.** You do not schedule anything. The generator topologically sorts the graph so every node is computed after its inputs (`skald-backend/core/graph_utils.odin:25-69`), then emits the nodes in that order (`skald-backend/core/codegen.odin:1801-1843`). The layout on your canvas is purely cosmetic; the wires are the program.

---

## Going further

**Add the second envelope.** The single biggest upgrade to any patch in this manual. Drop a second ADSR with *nothing* wired into its input — so its output is the bare 0…1 envelope — then a Mapper (`In 0…1`, `Out 200…4000`), then into the Filter's `Cut`. Give it a fast attack (0.005 s) and a short decay (0.15 s) with sustain around 0.2. Every note now opens bright and closes dark. That is a **transient**, and it is what separates "a synth patch" from "an instrument".

**Modulate the modulator.** An LFO into a second LFO's… no — LFO frequency is not a modulation port in Skald (`skald-backend/core/graph_validate.odin:57-58`). Instead, put an ADSR through a Mapper into a VCA whose `input` is your LFO output. Now the vibrato *fades in* over the note instead of being present from the attack. That is how real players do it, and it is the reason the VCA node accepts control signals as happily as audio.

**Layer sources in a Mixer.** A sub-oscillator (sine, one octave down, fixed pitch) plus the main sawtooth gives weight without mud. A short noise burst gated by a very fast envelope, mixed under the attack, gives you a pick or breath transient. Mixer channels are per-source levels (`skald-backend/core/codegen.odin:636-661`) — this is your first real mixing decision inside a patch.

**Split series and parallel deliberately.** Run your source into two Filters — one lowpass at 200 Hz, one highpass at 2000 Hz — distort only the high branch, and recombine in a Mixer. You get grit on the top without turning the bass to mush. This is parallel saturation and it is standard practice on bass sounds.

**Use exposure as a game-design tool.** Decide, per asset, the two or three numbers your game should be allowed to move: cutoff for a distance filter, mix for a reverb send, ratio for a pitch-varying pickup sound. Expose those, leave everything else baked. The generated `<Asset>_PARAMS` table (`skald-backend/core/codegen.odin:1631-1643`) then documents the contract for whoever writes the gameplay code.

**Learn the range table.** Read `skald-backend/core/param_ranges.odin` end to end once. It is 119 lines and it is the single most information-dense file in the project — every clamp, every unit, and a set of comments explaining which earlier assumptions were wrong and why.

---

## Under the hood

Skald generates one Odin procedure per instrument, and that procedure computes **one stereo sample pair per call**.

Its skeleton (`skald-backend/core/codegen.odin:1715-1953`):

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

    return output_left * 1.0, output_right * 1.0   // <- instrument volume
}
```

Every node in your graph becomes one `node_<id>_out: f32` local (`skald-backend/core/codegen.odin:1790`) and one short block of arithmetic. There is no runtime graph, no virtual dispatch, no node objects — the graph is *compiled away*, which is the point of the whole tool. A wire is a variable reference; the topological sort guarantees the variable is already assigned by the time it is read (`skald-backend/core/graph_utils.odin:25-69`).

Two lines carry most of the ideas in this chapter.

**The modulation-sum line.** When a parameter has both a knob value and incoming wires, the generator emits their sum:

```
(base) + (node_<src>_out) + (node_<src2>_out)
```

built in `get_f32_param` (`skald-backend/core/param_utils.odin:138-155`). Additive, not multiplicative, not scaled. That single design decision is why the Mapper exists and why an unscaled LFO on a cutoff is inaudible.

**The master limiter.** Every asset's stereo pair is summed at project level and then passed through a hyperbolic tangent:

```odin
mixed_left  = math.tanh(mixed_left  * master_volume)
mixed_right = math.tanh(mixed_right * master_volume)
```

(`skald-backend/core/codegen.odin:2417-2418`). `tanh` maps the entire real number line into (-1, +1): it is almost perfectly straight for small inputs, bends gently as the input approaches 1, and asymptotes at 1 no matter how hot the input gets. So your mix can never exceed full scale and never hard-clips — but it does progressively squash as it gets loud, which is what you heard in step 11. It also means **master volume is applied before the limiter**, so turning it down reduces saturation as well as level. That is deliberate, and the code comment records the earlier version that used `tanh(x*0.7)/0.7`, "topped out at 1.43 and still clipped the device".

Everywhere else in the chain there is **no ceiling at all**. Skald's intermediate signals are 32-bit floats, so a mixer summing eight hot channels or thirty-two voices stacking up simply produces a large number and carries on. That is good news (no intermediate clipping artefacts) and bad news (all the excess arrives at the limiter at once). Practitioners handle exactly the same problem in a DAW by leaving headroom on every stage and keeping individual channels well below full scale, precisely because "20 tracks peaking at -10 dBFS might easily clip your master bus if summed together without adjustment" and because summing many very high-level signals is where digital mixes go wrong [Source: https://www.soundonsound.com/techniques/gain-staging-your-daw-software]. Skald's version of that advice is short: **set Instrument volume so that a busy chord peaks near 1.0, not at 4.0.**

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
