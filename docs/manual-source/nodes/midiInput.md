# MIDI Input

> The node that turns "somebody pressed a key" into three numbers your patch can actually use: how high the note is, whether the finger is still down, and how hard it was hit.

## What it is

Sound doesn't know about keyboards. An oscillator only knows a frequency in hertz; a filter only knows a cutoff in hertz; an amplifier only knows a gain number. A keyboard, meanwhile, produces *events* — "note 60 started, hard" and "note 60 stopped". Something has to sit between the two and translate. Historically that something was a box called a **keyboard CV interface**, and the translation it performed is the whole reason electronic instruments respond to playing at all.

The translation has three parts, and they map exactly onto the three outputs of this node.

**Pitch.** MIDI numbers notes as integers: middle C is 60, the A above it is 69, and each step of 1 is one **semitone** (the smallest interval on a piano — the gap between a white key and the black key next to it). To turn that integer into hertz you need one anchor and one ratio. The anchor is A4 = 440 Hz = note 69. The ratio comes from **equal temperament**, the tuning system Western music has used for roughly three centuries, in which an octave (a doubling of frequency) is divided into twelve identical steps, so one semitone multiplies frequency by 2^(1/12) ≈ 1.0595. Put those together and you get the formula every synthesiser in the world uses: *f = 440 × 2^((n − 69)/12)* [Source: https://newt.phys.unsw.edu.au/jw/notes.html]. Middle C (60) lands on 261.63 Hz; A5 (81) lands on 880 Hz, exactly double A4, as an octave must be.

Notice that the formula is *exponential*, not linear. Twelve semitones up doesn't add a fixed number of hertz, it doubles. This is why the analogue world settled on **1 volt per octave** (1V/oct) rather than volts-per-hertz: the control signal is the *exponent*, and the oscillator does the doubling. One volt up, one octave up, at any starting pitch [Source: https://www.perfectcircuit.com/signal/what-is-cv-gate]. Skald's Pitch output speaks this language: it emits octaves, not hertz. That matters enormously and is the single most common thing people get wrong with this node — see [The controls](#the-controls).

**Gate.** A **gate** is the "finger is down" signal: high while the key is held, low the instant it is released. Its cousin the **trigger** is a momentary blip at the moment of the press, with no information about the release [Source: https://www.perfectcircuit.com/signal/what-is-cv-gate]. The distinction is musically enormous: a gate lets an envelope know when to *let go*, which is what makes a held organ chord different from a plucked string. Every sustain you have ever heard from a synth exists because a gate stayed high.

**Velocity.** MIDI encodes how hard a key was struck as a 7-bit number, 1–127. Zero is reserved: a note-on with velocity 0 is defined to *mean* note-off, which is why the usable range is 127 values and not 128 [Source: https://melatonin.dev/blog/doing-my-synthesizer-homework-the-quirks-of-midi-velocity/]. Skald normalises this to 0.0–1.0 before it reaches your patch.

Here is the part beginners routinely miss: **velocity is not volume.** On an acoustic instrument, hitting harder doesn't just move more air, it changes the *timbre* — a hard-struck piano string is brighter and more percussive, not merely louder. If you wire velocity only to level, you get a synth that sounds like someone riding a volume fader. The idiomatic move, and the one the example patch in this chapter uses, is to send velocity to **both** amplitude and filter brightness, so playing harder opens the tone up [Source: https://melatonin.dev/blog/doing-my-synthesizer-homework-the-quirks-of-midi-velocity/] [Source: https://yamahasynth.com/learn/montage-series-synthesizers/montage-velocity-sensitivity/]. Percussive patches — drums, plucks, stabs — are the exception where velocity-to-volume alone works well.

**MPE** (MIDI Polyphonic Expression) is the modern extension of all this. In ordinary MIDI, a pitch bend or a modulation message applies to the whole channel, so bending one note in a chord bends all of them. MPE fixes that by giving every sounding note its own temporary MIDI channel (typically channels 2–16), so pitch bend, pressure and CC74 "brightness" can be addressed to a single finger. Controllers built for it sense three dimensions of touch: press (continuous pressure), slide along the key (timbre), and glide across the keyboard (per-note pitch), and the spec defaults each per-note channel to a ±48-semitone bend range so a finger can travel a long way [Source: https://www.soundonsound.com/sound-advice/mpe-midi-polyphonic-expression] [Source: https://midi.org/midi-polyphonic-expression-mpe-specification-adopted]. The price is that polyphony caps at 15–16 simultaneous notes, one per channel. **Skald's MIDI Input node has an MPE checkbox, but nothing in the codebase implements it** — see **Known issues**, KI-034.

## What it looks like in Skald

It is the last entry in the node palette on the left, coloured yellow (`#F6E05E`) to mark it as an *external input* rather than a sound source or a processor — `skald-ui/src/components/Sidebar.tsx::paletteNodes`, `skald-ui/src/components/Nodes/NodeStyles.ts::NODE_ACCENTS`. Its palette tooltip reads "Pitch (V/Oct), gate and velocity signals from your MIDI device", which is an accurate description of the units; keep it in mind.

**Handles.** Three, all on the right, all outputs (`type="source"`):

| Handle id | Label on the node | Carries |
|---|---|---|
| `pitch` | Pitch | Octaves relative to A4 (V/oct) |
| `gate` | Gate | 1.0 while held, 0.0 after release |
| `velocity` | Vel | 0.0–1.0 |

Cited to `skald-ui/src/components/Nodes/MidiInputNode.tsx::MidiInputNode` (the port list and the `Handle type="source" position={Position.Right}` that renders each one). There are **no input handles** — nothing can be wired *into* a MIDI Input. The backend agrees: `skald-backend/core/graph_validate.odin::valid_input_ports` lists `MidiInput` among the types that return `nil, true` from the input-port table, commented "sources only — no modulation inputs". Try to wire into it and codegen exits with an error.

The backend also validates the port names you wire *out* of. `skald-backend/core/graph_validate.odin::valid_output_port` accepts only `pitch`, `gate`, `velocity` (plus the generic `""`/`"output"`, allowed for every node), and a typo produces an explicit error naming the three valid ports (`skald-backend/core/graph_validate.odin::validate_connections`) rather than a silently dropped wire.

**Where it can live.** MIDI Input is *voice-coupled*: its outputs are read out of the per-voice state, so it only exists inside the per-voice loop. `skald-backend/core/codegen_analysis.odin::is_voice_coupled_type` lists it alongside Oscillator, ADSR, FmOperator and Wavetable. Two consequences, both enforced with a hard error, both raised by the same domain-assignment pass:

- It cannot sit downstream of a Delay or Reverb, because everything after those runs once per sample on the *summed* voices, where no single voice exists.
- Its port outputs cannot feed anything in that post-effect bus either — there is a dedicated check and error message for exactly this (`skald-backend/core/codegen_analysis.odin::compute_bus_domain`): *"Route MIDI signals through per-voice nodes before any Delay/Reverb."*

**Rate.** Audio rate, in the sense that the three values are recomputed every sample inside the voice loop (`skald-backend/core/codegen_processor.odin::generate_processor_code` dispatches to `skald-backend/core/codegen_nodes.odin::generate_midi_input_code` in the voice-domain emission pass). But they only *change* at note boundaries and at note-off, so treat them as control signals: they are stair-steps, not waveforms.

**The other place it appears.** Dropped on the top-level canvas (not inside an instrument) and wired to an Instrument node, a MIDI Input contributes a `midi_config` block — device name and channel — to that instrument in the exported project JSON (`skald-ui/src/utils/projectSerializer.ts::buildProjectData`, pinned by `skald-ui/src/tests/codegen/ProjectSerializerPipeline.test.ts`'s "buildProjectData — MIDI wiring" cases). This is a separate role from the three signal ports, and as of today the generated Odin never reads that block; see the notes at the end.

## The controls

| Parameter | Stored value | Default | Unit | What it does to the sound |
|---|---|---|---|---|
| `device` | `"All"`, `"Device A"`, `"Device B"` (shown in the dropdown as "All Devices", "Device A (Mock)", "Device B (Mock)") | `"All"` | — | Which MIDI hardware to listen to. Nothing at all, today: the preview listens to every attached input regardless. |
| `useMpe` | `true` / `false` | `false` | — | Draws an "MPE Active" badge on the node. No DSP anywhere reads it. |

Defaults: `skald-ui/src/definitions/node-definitions.ts::defaultMidiInputParams`. Types: `skald-ui/src/definitions/types.ts::MidiInputParams` (`device: string`, `useMpe: boolean`). The dropdown options and the checkbox live in the shared control component now, not a MIDI-Input-specific branch of the panel (`skald-ui/src/components/NodeParameterControls.tsx`, the `'midiInput'` case). Neither parameter has an entry in `schema/nodes.json` — they aren't numeric, so a lookup falls through to the unknown-parameter fallback, `{-1000000, 1000000, 0, ""}` (`schema/nodes.json`'s top-level `"fallback"` key, rendered into `skald-backend/core/param_ranges.generated.odin::PARAM_RANGE_FALLBACK`).

The real "controls" of this node are its three output ports. Their ranges come from `skald-backend/core/codegen_nodes.odin::generate_midi_input_code`:

| Output | Expression emitted | Range for MIDI notes 0–127 | Unit |
|---|---|---|---|
| Pitch | `(f32(voice.note) - 69.0) / 12.0` | −5.75 … +4.83 | octaves (V/oct) |
| Gate | `1.0`, set to `0.0` once `voice.time_released > 0.0` | 0.0 or 1.0 | — |
| Velocity | `voice.velocity` | 0.0 … 1.0 | — |

### What you hear as you sweep each one

**Pitch.** This is the one that will bite you, so read carefully. Skald oscillators **already track the played note without any wire at all** — `skald-backend/core/codegen_nodes.odin::generate_oscillator_code` sets the oscillator's base frequency to `voice.current_freq`, which `skald-backend/core/codegen_processor.odin::generate_processor_code` filled in with `440.0 * math.pow(2.0, (f32(note) - 69.0) / 12.0)` when the note started. The Pitch port is therefore not "the note", it is *an extra transposition in octaves* applied on top of the note. Modulation into `input_freq` is exponential: `base * 2^(sum)`, with the exponent clamped to ±10 octaves so a hot modulation source can't overflow the float and latch the phase to NaN (`skald-backend/core/codegen_nodes.odin::generate_oscillator_code`).

So if you wire Pitch straight into an oscillator's `input_freq`, you get `440 × 2^((n−69)/12) × 2^((n−69)/12)` = `440 × 2^((n−69)/6)`. The keyboard now tracks at **two semitones per key**. Play C4 and C5 and they come out two octaves apart (155.6 Hz and 622.3 Hz) instead of one (261.6 and 523.3). It is not subtle, and you will hear it in step 4 of the exercise below.

The useful zone for Pitch is *deliberate* transposition and pitch-tracked modulation: send it through a Mapper scaled to ±1 to detune a second oscillator by a fixed interval, or use it as the "keyboard tracking" source for a filter so the cutoff rises with pitch and high notes don't sound duller than low ones. Small values are musical — 0.0833 is one semitone, 0.5 is a tritone, 1.0 is an octave. Beyond about ±4 the sound leaves the useful band: down there you are below the fundamental of a bass guitar, up there you are past the top of a piccolo and heading for the sample-rate ceiling.

**Gate.** Two values, no in-between, so there is nothing to sweep — but there *is* something to understand. Gate goes high the moment a voice is allocated and drops to 0 as soon as `time_released` is stamped, which happens either at note-off or when a fixed-duration note runs out (both branches are in `skald-backend/core/codegen_processor.odin::generate_processor_code`). The key point is that Skald's ADSR does **not** need this wire. Envelopes are driven by a separate per-voice stage machine that note-on and note-off flip directly (the same proc). The ADSR's `input` port is a *signal to be multiplied by the envelope* (`skald-backend/core/codegen_nodes.odin::generate_adsr_code`: `out = input * envelope * depth * vel_scale`), not a trigger. Wire Gate into it and you are multiplying the envelope by 1 while held and by 0 the instant you release — which chops the release tail off dead. That is audible, and you will build the wire and hear it for yourself in step 8.

Gate's genuinely useful destinations are the ones where you want a hard on/off: a VCA's `input_gain` for a gated, organ-like articulation with no envelope at all, or as a multiplier on a modulation path you want silenced during the release.

**Velocity.** Linear 0.0 to 1.0, straight from the note event. In the preview it is `data2 / 127` from the incoming Web MIDI message (`skald-ui/src/hooks/nodeEditor/useWasmAudioEngine.ts::handleMidiMessage`); from the sequencer it is the per-step Vel slider, 0–100% (`skald-ui/src/components/Sequencer/StepPropertiesEditor.tsx::StepPropertiesEditor`), defaulting to 1.0 on a freshly placed note (`skald-ui/src/hooks/sequencer/useSequencerState.ts::toggleStep`).

At the bottom of the range (0.0–0.15) you get whatever your patch does when barely touched — with the example patch, a soft, dull, half-volume note. In the middle (0.4–0.7, the zone most DAWs put default notes in: Logic writes 80/127, Ableton 100/127 [Source: https://melatonin.dev/blog/doing-my-synthesizer-homework-the-quirks-of-midi-velocity/]) you should be hearing a clear tonal change, not just a level change. At 1.0 the patch should be at its brightest and loudest. If a sweep from 0 to 1 only changes loudness, your patch is under-using velocity; find a filter cutoff to send it to as well.

One thing to know about Velocity's *other* route into your sound: the ADSR node has its own `velocitySensitivity` parameter, range 0.0–1.0, default 0.5 (`schema/nodes.json`'s generic row for `velocitySensitivity`), which scales the envelope by `(1 − vs) + vs × voice.velocity` (`skald-backend/core/codegen_nodes.odin::generate_adsr_code`). At 0 the envelope ignores velocity entirely; at 1 a velocity-0 note is silent; at the 0.5 default a softly played note comes out at half level. This happens *without any wire from the MIDI Input node* — every ADSR is velocity-sensitive by default. You use the Velocity port when you want velocity to reach somewhere *else*, typically a filter.

### Exposing a parameter

The link icon next to a parameter in the panel toggles **exposure** (`skald-ui/src/components/ParameterPanel.tsx::renderParameterControl`, tooltip: *"Expose … to public API"*). An exposed parameter stops being a constant baked into the generated DSP and becomes a real field on the processor struct, with a typed setter, an entry in the introspectable `<Foo>_PARAMS` table carrying its min/max/default/unit, and a string-keyed `set_param` case (`skald-backend/core/codegen_analysis.odin::build_instrument_plan` builds the resolution table; `skald-backend/core/param_utils.odin::get_f32_param` makes the generator emit `p.<field>` instead of a literal). That is what lets a game change the sound at runtime — sweep a filter as the player enters a cave, raise a pad's release as tension builds — without regenerating any code.

For MIDI Input, exposure is filtered out before it ever reaches that machinery, and packet B2 (SKB-059) made the filtering unconditional. `skald-backend/core/codegen_analysis.odin::param_is_reachable` returns `false` for every MIDI Input parameter, no matter what the node's configuration is: `device` and `useMpe` are editor-side routing settings and nothing under `skald-backend/core/` ever reads them from a struct field, so there is no configuration that would make either one live. `skald-backend/core/codegen_analysis.odin::effective_exposed_params` consults that predicate before a parameter ever reaches the resolution table `build_instrument_plan` assembles, so a hand-authored `exposedParameters: ["device", "useMpe"]` on a saved node is filtered out too — not merely refused a setter, never considered in the first place. A freshly placed MIDI Input node ships `exposedParameters: []` for exactly this reason (`skald-ui/src/definitions/node-definitions.ts::defaultMidiInputParams`; its own comment explains that both strings used to be shipped exposed, and every fresh node minted two setters for fields no sample read). `sax3.json` is an older save that still carries `device`/`useMpe` in its `exposedParameters` array from before B2, and generating it proves the point: neither field, neither setter, and no `_PARAMS` row for either appears in the output, and the generator names exactly why on stderr — *"instrument 'sax': MidiInput(6) exposes 'device', but MIDI Input has no runtime parameters — device and useMpe are editor-side routing settings the generated DSP never reads — the generated struct field, setter and \_PARAMS row for it are omitted."* Not a silent drop after all, just one you only see from a terminal — see **Known issues**, KI-004.

## Try it (hands-on)

Open `examples/instruments/winds/midi-setup/sax3.json`. One instrument, named **sax**: 8 voices, glide 0.05 s, unison 1, detune 5 cents (`examples/instruments/winds/midi-setup/sax3.json::nodes`). Inside it, seven nodes — Oscillator (sawtooth, amp 0.5), Filter (lowpass, cutoff 857 Hz, resonance 1.91), ADSR (A 0.053 / D 0.24 / S 0.82 / R 0.213), VCA (gain 0), Mapper (0–1 in, 400–3000 out), Output, and our MIDI Input. The wiring that matters: MIDI Input `velocity` → Mapper → Filter `input_cutoff`; ADSR → VCA `input_gain` **and** ADSR → Filter `input_cutoff`. That second ADSR wire is decorative — see **Known issues**, KI-016, for why it contributes under a hertz and does nothing you can hear. Note what is *not* there: no wire touches MIDI Input's `pitch` or `gate` ports at all. Packet B8-2 (SKB-015) removed both from this file, because they reproduced the two traps this exercise is about; you are going to add them back in, on purpose, to feel why they were traps.

You do not need a MIDI keyboard. The sequencer will do everything.

1. **Select the `sax` instrument node.** The parameter panel fills with an "Internal Nodes" list — every node inside the instrument, MIDI Input among them, showing MIDI Device = *All Devices* and Enable MPE unchecked (`skald-ui/src/components/ParameterPanel.tsx::renderNodeParameters` renders the list; `skald-ui/src/components/NodeParameterControls.tsx`'s `'midiInput'` case renders the two controls). This is where you'll edit values in the steps below.

2. **Put two notes in.** The project already carries an empty sequencer track called "sax" (`examples/instruments/winds/midi-setup/sax3.json::sequencerTracks`). Open its piano roll and place a note on step 1 at **C4** (MIDI 60) and a note on step 9 at **C5** (MIDI 72). The roll spans the full MIDI range now, 0 to 127 (`skald-ui/src/components/Sequencer/stepMetrics.ts::MIDI_NOTE_MIN`/`MIDI_NOTE_MAX`), and opens scrolled to middle C, so both notes are close to the initial view. New notes default to velocity 1.0.

3. **Press play.** You hear two saw-ish notes, an octave apart — C4 at 261.6 Hz, C5 at 523.3 Hz. That octave came for free: Skald's oscillators already track the played note without any wire (`skald-backend/core/codegen_nodes.odin::generate_oscillator_code` sets the base frequency from `voice.current_freq`, which `skald-backend/core/codegen_processor.odin::generate_processor_code` fills in at note-on from `440.0 * math.pow(2.0, (f32(note) - 69.0) / 12.0)`). Nothing in this patch touches Pitch. Keep that fact in mind for the next step.

4. **Build the trap.** Select the `sax` instrument and click **Explode Instrument** in the sidebar (`skald-ui/src/components/Sidebar.tsx::Sidebar`) to spread its nodes onto the canvas. Wire MIDI Input's **Pitch** output into the Oscillator's `input_freq` port — the same wire the shipped patch used to carry. Select all the exploded nodes and click **Create Instrument** (same file) to collapse them back. Play again: C4 and C5 are now *two* octaves apart (155.6 Hz and 622.3 Hz), not one. The math: the oscillator's base frequency is already the played note, and modulation into `input_freq` is exponential — `base * 2^(sum)` (`skald-backend/core/codegen_nodes.odin::generate_oscillator_code`) — so a Pitch wire that itself equals `(note - 69) / 12` (`skald-backend/core/codegen_nodes.odin::generate_midi_input_code`) doubles the exponent the oscillator already applies. Every key on your keyboard is now worth two semitones.

5. **Remove it.** Explode the instrument again, delete the Pitch → Oscillator wire, and re-collapse. Play once more: C4 and C5 are back to exactly an octave apart. **Remember this**: in Skald, oscillators track the note for free. The Pitch port is a transpose, not the note — and wiring it to `input_freq` is a mistake this patch used to make, on purpose, for you to find.

6. **Now hear velocity.** Click the note on step 1 and drag its **Vel** slider down to about **10%** (`skald-ui/src/components/Sequencer/StepPropertiesEditor.tsx::StepPropertiesEditor`). Play. That note is now noticeably duller *and* quieter than the C5 at full velocity. Two things happened at once: the Mapper turned velocity 0.1 into 400 + 0.1 × 2600 = 660 Hz of extra cutoff, so the filter sits at roughly 1.5 kHz instead of 3.9 kHz (`skald-backend/core/codegen_nodes.odin::generate_filter_code` sums modulation onto the base cutoff; `skald-backend/core/param_utils.odin::get_f32_param` is where that addition happens), and the ADSR's own velocity sensitivity of 0.5 scaled the level to 0.5 + 0.5 × 0.1 = 0.55 (`skald-backend/core/codegen_nodes.odin::generate_adsr_code`). That combination — brighter *and* louder with harder playing — is what makes velocity sound like an instrument instead of a fader.

7. **Break it #1: run out of filter.** In the Mapper's controls, drag **Output Max** from 3000 up to **10000**. Set the step-1 note back to 100% velocity and play both notes. The dynamics at the top of the velocity range flatten out: everything above roughly velocity 0.6 sounds the same. The reason: the state-variable filter clamps its cutoff to `sample_rate * 0.16`, about 7 kHz at 44.1 kHz (`skald-backend/core/codegen_nodes.odin::generate_filter_code`), because the integrator diverges to infinity beyond ~fs/6. Your Mapper is asking for 10.8 kHz and getting 7 kHz, so the whole upper half of your velocity range maps to the same clamped value. Lesson: a modulation range wider than the destination can use doesn't give you *more* expression, it gives you *less*. Put Output Max back to 3000.

8. **Break it #2: the missing release.** In the ADSR controls, drag **Release** up to about **2.0 s** and play. You get the tail you would expect — about two seconds — because nothing in the current patch multiplies the envelope by anything but itself. Now build the second trap: explode the instrument, wire MIDI Input's **Gate** output into the ADSR's `input` port — the wire the shipped patch used to carry alongside Pitch — and re-collapse. Play again: the same 2-second Release you just set is gone; the note stops dead the instant you release the key. The ADSR emits `out = input * envelope * depth * vel_scale` (`skald-backend/core/codegen_nodes.odin::generate_adsr_code`), and Gate flips to 0.0 the instant `time_released` is stamped (`skald-backend/core/codegen_nodes.odin::generate_midi_input_code`), which multiplies the entire envelope — release stage included — by zero. Explode once more, delete the Gate → ADSR wire, and re-collapse: the tail is back. The gate wire was never needed, because note-off already drives the envelope's stage machine directly (`skald-backend/core/codegen_processor.odin::generate_processor_code`). Lesson: **in Skald, Gate is a multiplier, not a trigger.**

9. **Optional, if you have a keyboard.** Plug in any USB MIDI controller and press keys while the transport is running. Skald grabs every attached input via the Web MIDI API and forwards note-on/note-off to every instrument in the project (`skald-ui/src/hooks/nodeEditor/useWasmAudioEngine.ts::useWasmAudioEngine`). Play soft and hard and listen to the filter open. Note that you never had to touch the Device dropdown — and that it would have made no difference if you had. One thing to know if you also have Key/Scale quantisation turned on in the sequencer: a live MIDI note is quantised too, and that path updates immediately, unlike a sequencer note change, which waits for the next rebuild — see 05-sequencer.md, "Key and Scale", for the mechanism; it is the same `nearestInScale` either way.

## Why you patch it this way

The reliable pattern is: **let the note drive pitch implicitly, and use the MIDI Input node only for the things the note does *not* do for free.**

Nothing needs to feed a MIDI Input — it has no inputs, by design (`skald-backend/core/graph_validate.odin::valid_input_ports`). What it feeds is where the thinking happens:

- **Velocity → Mapper → Filter `input_cutoff`.** The single most valuable use of this node. It has to go through a Mapper because modulation into a hertz-valued parameter is *added* to it (`skald-backend/core/param_utils.odin::get_f32_param`), and velocity's native 0–1 range would add at most one hertz to an 857 Hz cutoff — completely inaudible. The Mapper rescales 0–1 into a useful hertz span; 400–3000 Hz in the example patch is a sane starting point for a bright-but-not-harsh sweep. Get the order wrong (velocity straight into `input_cutoff`, no Mapper) and you will swear velocity is broken. It isn't; it's just 1 Hz of it.
- **Velocity → Mapper → almost any other quantity.** Distortion drive, reverb send, LFO depth. Same rule: check the destination's units first, then set the Mapper's output range to match.
- **Pitch → Mapper → Filter `input_cutoff`** for keyboard tracking, or **Pitch → a second Oscillator's `input_freq`** when you *want* a fixed interval on top of the played note. Both are deliberate transpositions of a signal that is already correct on its own.
- **Gate → VCA `input_gain`** for an envelope-free, hard-gated articulation.
- **Gate → ADSR `input`.** Don't. See step 8.
- **Pitch/Gate/Velocity → Output.** Meaningless. These are control signals in octaves and normalised units, not audio.

Order matters in one hard-enforced way: everything a MIDI Input touches must be in the per-voice part of the graph, before any Delay or Reverb. Codegen refuses to build otherwise, with a message telling you exactly which node crossed the line (`skald-backend/core/codegen_analysis.odin::compute_bus_domain`). This isn't fussiness — a reverb holds one shared buffer for the whole instrument, so there is no "the current voice" to read a note number from once you're past it.

## Going further

- **Two velocity destinations, different curves.** Feed Velocity into two Mappers with different output ranges: one to filter cutoff (say 300 → 4000 Hz) and one to distortion drive (1 → 8). Now hard playing is brighter *and* grittier, which is what a hard-blown reed or an overdriven amp actually does.
- **Velocity → ADSR `input_attack`, inverted.** Wire Velocity through a Mapper with `outMin` 0.3 and `outMax` 0.001 — note the reversed order, which flips the mapping. Hard notes now attack almost instantly, soft notes bloom in over 300 ms. This one trick does more for realism on wind and bowed patches than any amount of filter tweaking.
- **Keyboard tracking on the filter.** Pitch → Mapper (in −2 → 2, out 0 → 3000) → Filter `input_cutoff`. Without this, high notes sound progressively duller than low ones because a fixed cutoff removes proportionally more of a high note's harmonics. Every hardware synth has this control; in Skald you patch it.
- **Layer, don't stack.** Add a second Oscillator and drive its `input_freq` from Pitch through a Mapper set to a constant fixed interval (0.0833 for a semitone of detune-beating, 0.5833 for a fifth, −1 for a sub-octave). Because Pitch is exponential, the interval stays constant across the whole keyboard — which is exactly why V/oct won and Hz/V lost.
- **Two envelopes.** One ADSR for the VCA, a second, faster one for filter cutoff via a Mapper. Give the filter envelope a short decay and near-zero sustain and you get the classic percussive "bite" on the front of each note while the amplitude envelope sustains behind it. Set both ADSRs' `velocitySensitivity` differently (`schema/nodes.json`'s generic row for `velocitySensitivity`) so velocity affects timbre more than level.
- **Velocity → unison spread.** Not directly patchable today (unison is an instrument-level parameter), but exposing an oscillator's `amplitude` and driving it from a game at runtime gets you part of the way.

## Under the hood

The generated Odin is three lines long, and it is worth reading because it tells you precisely what the node is (`skald-backend/core/codegen_nodes.odin::generate_midi_input_code`; reproduce it yourself by generating `sax3.json`, whose MIDI Input node happens to have the id `6`):

```odin
// --- MIDI Input Node 6 ---
node_6_out_pitch := (f32(voice.note) - 69.0) / 12.0
node_6_out_gate := f32(1.0)
if voice.time_released > 0.0 do node_6_out_gate = 0.0
node_6_out_velocity := voice.velocity
```

That's the whole node. It holds no state of its own; it is a *view* onto the voice struct that `_note_on` filled in. The key formula is the pitch one — `(note − 69) / 12` — which is the exponent of the note-to-frequency formula with the 440 Hz factor and the power-of-two stripped off. The full conversion lives in `_note_on` instead:

```odin
freq := 440.0 * math.pow(2.0, (f32(note) - 69.0) / 12.0)
```

(`skald-backend/core/codegen_processor.odin::generate_processor_code`.)

Every downstream consumer reaches these three values by name. `get_output_var` (`skald-backend/core/param_utils.odin::get_output_var`) maps the port you wired (`pitch`/`gate`/`velocity`) onto `node_<id>_out_pitch` / `_out_gate` / `_out_velocity`; every other node in Skald has only a plain `node_<id>_out`, which is why the port-name validation (`skald-backend/core/graph_validate.odin::valid_output_port`) exists.

Two details worth internalising. First, the gate has no state of its own either — it is derived from `voice.time_released`, the same timestamp the ADSR's release stage reads, which is why gate and envelope release are always perfectly in step. Second, `voice.velocity` is written once at note-on (`skald-backend/core/codegen_processor.odin::generate_processor_code`) and never changes for the life of the note. There is no continuous per-note pressure signal in Skald: what MPE would call *press* simply does not exist here yet.

## Terms introduced

- **Semitone** — the smallest interval in Western tuning; one step between adjacent keys, black or white. Multiplies frequency by 2^(1/12) ≈ 1.0595.
- **Octave** — a doubling of frequency; twelve semitones. Notes an octave apart sound like "the same note, higher".
- **Equal temperament** — the tuning system that divides the octave into twelve identical semitones, so every key sounds equally (slightly) out of tune and music can modulate freely.
- **MIDI note number** — an integer naming a pitch. 60 = middle C, 69 = A4 = 440 Hz.
- **Note-to-frequency conversion** — *f = 440 × 2^((n − 69)/12)*, the formula turning a MIDI note number into hertz.
- **Control voltage (CV)** — a signal used to control a parameter rather than be heard.
- **V/oct (1 volt per octave)** — the exponential pitch-control convention: adding a fixed amount to the control signal multiplies frequency by a fixed ratio, so intervals stay constant at any pitch. Skald's Pitch port emits octaves in this sense.
- **Gate** — a signal that is high while a key is held and low when released. Tells an envelope when to sustain and when to let go.
- **Trigger** — a momentary pulse at the moment of the press, carrying no release information.
- **Velocity** — how hard a note was struck; MIDI 1–127, normalised to 0.0–1.0 in Skald. MIDI velocity 0 means note-off.
- **Velocity sensitivity** — how strongly velocity scales a destination. Skald's ADSR has this as a parameter, 0.0–1.0, default 0.5.
- **Note-on / note-off** — the two events that bracket a played note.
- **Voice** — one independently-playing copy of the patch. Polyphony is the number of voices available.
- **Voice-coupled node** — a node whose output depends on which voice is playing (pitch, envelope stage, velocity), and which therefore cannot run after the voices are summed.
- **MPE (MIDI Polyphonic Expression)** — an extension giving each sounding note its own MIDI channel so pitch bend, pressure and timbre can be controlled per finger. Default per-note bend range ±48 semitones; polyphony capped at 15–16.
- **Aftertouch / channel pressure** — continuous pressure applied *after* a key is down. Not represented in Skald.
- **Keyboard tracking** — raising filter cutoff with played pitch so high notes don't sound duller than low ones.

## Known issues

Defects that touch this chapter are tracked centrally in the **Known issues** chapter (`KNOWN-ISSUES.md`): KI-016, KI-034, KI-035, KI-036. Deliberate design limits — things Skald does not do on purpose — are collected in **What Skald deliberately does not do**.
